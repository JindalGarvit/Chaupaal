/**
 * Persistent social interactions for Duniya and Peepal.
 *
 * Data model:
 *   duniya/{contentId}/likes/{uid}
 *   {collection}/{contentId}/comments/{commentId}
 *   peepal/{contentId}/reactions/{uid} (server-mediated, private)
 *
 * Parent documents keep aggregate likes/comments counters. Transactions update
 * the interaction document and its counter atomically; Firestore rules verify
 * the matching document transition.
 */
(function () {
  'use strict';

  const CONTENT_COLLECTIONS = new Set(['duniya', 'peepal']);
  const MAX_COMMENT_LENGTH = 2000;
  const COMMENT_PAGE_SIZE = 100;

  function validCollection(collection) {
    return CONTENT_COLLECTIONS.has(collection);
  }

  function contentId(content) {
    return content && (content.firestoreId || content.id);
  }

  function canPersist(collection, content) {
    return !!(
      validCollection(collection) &&
      typeof db !== 'undefined' &&
      db &&
      typeof currentUser !== 'undefined' &&
      currentUser &&
      content &&
      content.firestoreId
    );
  }

  function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function safeCommentUser(user) {
    const source = user || {};
    return {
      uid: currentUser.uid,
      name: String(source.name || currentUser.displayName || 'You').slice(0, 80),
      avatar: String(source.avatar || '🪑').slice(0, 16),
      photoURL: String(source.photoURL || currentUser.photoURL || '').slice(0, 1000),
    };
  }

  async function hydrateContentLikes(collection, items) {
    if (!validCollection(collection) || !db || !currentUser || !Array.isArray(items)) return items || [];
    const live = items.filter((item) => item && item.firestoreId);
    await Promise.all(
      live.map(async (item) => {
        try {
          const snap = await db
            .collection(collection)
            .doc(item.firestoreId)
            .collection('likes')
            .doc(currentUser.uid)
            .get();
          item.likedByMe = snap.exists;
        } catch (e) {
          // Keep the server aggregate and current local state if hydration fails.
        }
      })
    );
    return items;
  }

  async function toggleContentLike(collection, content) {
    if (!canPersist(collection, content)) {
      return { persisted: false, liked: !!content.likedByMe, likes: Number(content.likes) || 0 };
    }
    const id = contentId(content);
    const uid = currentUser.uid;
    const parentRef = db.collection(collection).doc(id);
    const likeRef = parentRef.collection('likes').doc(uid);

    return db.runTransaction(async (tx) => {
      const parentSnap = await tx.get(parentRef);
      if (!parentSnap.exists) throw new Error('This post is no longer available');
      const likeSnap = await tx.get(likeRef);
      const wasLiked = likeSnap.exists;
      const currentLikes = Math.max(0, Number(parentSnap.data()?.likes) || 0);
      const nextLikes = Math.max(0, currentLikes + (wasLiked ? -1 : 1));

      if (wasLiked) tx.delete(likeRef);
      else tx.set(likeRef, { uid, createdAt: serverTimestamp() });
      tx.update(parentRef, { likes: nextLikes, likeMutationUid: uid });

      return { persisted: true, liked: !wasLiked, likes: nextLikes };
    });
  }

  /**
   * Hydrate the current user's private Peepal reactions. The API returns
   * aggregate counts only for posts authored by the current user.
   */
  async function hydratePeepalReactions(items) {
    const live = (items || []).filter((item) => item?.firestoreId).slice(0, 20);
    if (!live.length || typeof apiFetch !== 'function' || !currentUser) return items || [];
    const envelope = await apiFetch('/api/peepal-reactions', {
      method: 'POST',
      needAuth: true,
      body: { action: 'hydrate', postIds: live.map((item) => item.firestoreId) },
    });
    if (!envelope?.ok) throw new Error(envelope?.error?.message || 'Could not load reactions');
    const hydrated = envelope.data?.items || {};
    live.forEach((item) => {
      const state = hydrated[item.firestoreId];
      if (!state) return;
      item.myReaction = state.myReaction || null;
      if (state.summary) item.reactionSummary = state.summary;
    });
    return items;
  }

  /**
   * Set, switch, or clear a Peepal reaction. Passing the currently selected
   * reaction clears it. Counts remain absent unless the caller owns the post.
   */
  async function setPeepalReaction(content, reaction) {
    if (!canPersist('peepal', content)) {
      return { persisted: false, myReaction: reaction || null };
    }
    const envelope = await apiFetch('/api/peepal-reactions', {
      method: 'POST',
      needAuth: true,
      body: { postId: contentId(content), reaction: reaction || null },
    });
    if (!envelope?.ok) throw new Error(envelope?.error?.message || 'Could not save reaction');
    return { persisted: true, ...envelope.data };
  }

  async function incrementContentShares(collection, content) {
    if (!canPersist(collection, content)) {
      const next = Math.max(0, (Number(content.shares) || 0) + 1);
      content.shares = next;
      return { persisted: false, shares: next };
    }
    const id = contentId(content);
    const parentRef = db.collection(collection).doc(id);
    return db.runTransaction(async (tx) => {
      const parentSnap = await tx.get(parentRef);
      if (!parentSnap.exists) throw new Error('This post is no longer available');
      const current = Math.max(0, Number(parentSnap.data()?.shares) || 0);
      const next = current + 1;
      tx.update(parentRef, { shares: next, shareMutationUid: currentUser.uid });
      return { persisted: true, shares: next };
    });
  }

  function mapCommentDoc(doc) {
    const raw = doc.data() || {};
    const createdAt = raw.createdAt?.toMillis?.() || raw.createdAt?.toDate?.()?.getTime?.() || raw.ts || Date.now();
    return {
      id: doc.id,
      parentId: raw.parentId || null,
      uid: raw.uid || raw.user?.uid || '',
      user: raw.user || { uid: raw.uid || '', name: 'User', avatar: '👤' },
      text: raw.text || '',
      createdAt,
      editedAt: raw.editedAt?.toMillis?.() || null,
      deleted: raw.deleted === true,
      time: typeof formatRelativeTime === 'function' ? formatRelativeTime(createdAt) : 'recently',
      pending: false,
      persisted: true,
    };
  }

  async function loadContentComments(collection, content, { limit = COMMENT_PAGE_SIZE } = {}) {
    if (!canPersist(collection, content)) return null;
    const snap = await db
      .collection(collection)
      .doc(contentId(content))
      .collection('comments')
      .orderBy('createdAt', 'asc')
      .limit(Math.max(1, Math.min(Number(limit) || COMMENT_PAGE_SIZE, COMMENT_PAGE_SIZE)))
      .get();
    return snap.docs.map(mapCommentDoc);
  }

  async function persistContentComment(collection, content, comment) {
    if (!canPersist(collection, content)) return { persisted: false, id: comment.id };
    const text = String(comment.text || '').trim();
    if (!text) throw new Error('Comment cannot be empty');
    if (text.length > MAX_COMMENT_LENGTH) throw new Error(`Comment is too long (max ${MAX_COMMENT_LENGTH} characters)`);

    const id = String(comment.id || '').slice(0, 128);
    if (!id) throw new Error('Comment ID is required');
    const parentId = comment.parentId ? String(comment.parentId).slice(0, 128) : null;
    const parentRef = db.collection(collection).doc(contentId(content));
    const commentRef = parentRef.collection('comments').doc(id);
    const uid = currentUser.uid;

    return db.runTransaction(async (tx) => {
      const parentSnap = await tx.get(parentRef);
      if (!parentSnap.exists) throw new Error('This post is no longer available');
      const existing = await tx.get(commentRef);
      if (existing.exists) {
        return { persisted: true, id, comments: Math.max(0, Number(parentSnap.data()?.comments) || 0) };
      }

      const currentCount = Math.max(0, Number(parentSnap.data()?.comments) || 0);
      tx.set(commentRef, {
        uid,
        user: safeCommentUser(comment.user),
        text,
        parentId,
        createdAt: serverTimestamp(),
        editedAt: null,
      });
      tx.update(parentRef, {
        comments: currentCount + 1,
        commentMutationId: id,
      });
      return { persisted: true, id, comments: currentCount + 1 };
    });
  }

  async function updateContentComment(collection, content, comment, nextText) {
    if (!canPersist(collection, content) || !comment?.id) return { persisted: false };
    if ((comment.uid || comment.user?.uid) !== currentUser.uid) throw new Error('You can only edit your own comment');
    const text = String(nextText || '').trim();
    if (!text) throw new Error('Comment cannot be empty');
    if (text.length > MAX_COMMENT_LENGTH) throw new Error(`Comment is too long (max ${MAX_COMMENT_LENGTH} characters)`);
    await db
      .collection(collection)
      .doc(contentId(content))
      .collection('comments')
      .doc(comment.id)
      .update({ text, editedAt: serverTimestamp() });
    return { persisted: true, text };
  }

  async function deleteContentComment(collection, content, comment, { preserveThread = false } = {}) {
    if (!canPersist(collection, content) || !comment?.id) return { persisted: false };
    if ((comment.uid || comment.user?.uid) !== currentUser.uid) throw new Error('You can only delete your own comment');
    const parentRef = db.collection(collection).doc(contentId(content));
    const commentRef = parentRef.collection('comments').doc(comment.id);

    if (preserveThread) {
      await commentRef.update({ text: '', deleted: true, editedAt: serverTimestamp() });
      return { persisted: true, tombstoned: true, comments: Number(content.comments) || 0 };
    }

    return db.runTransaction(async (tx) => {
      const parentSnap = await tx.get(parentRef);
      if (!parentSnap.exists) throw new Error('This post is no longer available');
      const commentSnap = await tx.get(commentRef);
      if (!commentSnap.exists) {
        return { persisted: true, tombstoned: false, comments: Math.max(0, Number(parentSnap.data()?.comments) || 0) };
      }
      const currentCount = Math.max(0, Number(parentSnap.data()?.comments) || 0);
      const nextCount = Math.max(0, currentCount - 1);
      tx.delete(commentRef);
      tx.update(parentRef, { comments: nextCount, commentMutationId: comment.id });
      return { persisted: true, tombstoned: false, comments: nextCount };
    });
  }

  function createCommentActionHandlers({ collection, content, comments, refresh }) {
    const rerender = () => typeof refresh === 'function' && refresh();
    return {
      onEdit(comment, row) {
        if (typeof startInlineCommentEdit !== 'function') return;
        startInlineCommentEdit(row, comment, async (nextText) => {
          const previousText = comment.text;
          const previousEditedAt = comment.editedAt;
          const apply = () => {
            comment.text = nextText;
            comment.editedAt = Date.now();
            rerender();
          };
          const revert = () => {
            comment.text = previousText;
            comment.editedAt = previousEditedAt;
            rerender();
          };
          if (typeof runOptimistic === 'function') {
            await runOptimistic({
              apply,
              revert,
              commit: () => updateContentComment(collection, content, comment, nextText),
              errorToast: 'Couldn’t edit comment — undone',
            });
          } else {
            apply();
            await updateContentComment(collection, content, comment, nextText);
          }
        });
      },
      async onDelete(comment) {
        const index = comments.findIndex((item) => item.id === comment.id);
        if (index < 0) return;
        const previousCount = Number(content.comments) || 0;
        const previous = { ...comment };
        const preserveThread = !comment.parentId && comments.some((item) => item.parentId === comment.id);
        const apply = () => {
          if (preserveThread) {
            comment.text = '';
            comment.deleted = true;
            comment.editedAt = Date.now();
          } else {
            comments.splice(index, 1);
            content.comments = Math.max(0, previousCount - 1);
          }
          rerender();
        };
        const revert = () => {
          if (preserveThread) Object.assign(comment, previous);
          else {
            comments.splice(Math.min(index, comments.length), 0, comment);
            content.comments = previousCount;
          }
          rerender();
        };
        const commit = async () => {
          const saved = await deleteContentComment(collection, content, comment, { preserveThread });
          if (saved.persisted && Number.isFinite(saved.comments)) content.comments = saved.comments;
        };
        if (typeof runOptimistic === 'function') {
          await runOptimistic({ apply, revert, commit, errorToast: 'Couldn’t delete comment — restored' });
        } else {
          apply();
          await commit();
        }
      },
      onReport(comment) {
        if (typeof openFlagSheet === 'function') {
          openFlagSheet(comment.user || { uid: comment.uid, name: 'User' }, {
            targetType: 'comment',
            postId: contentId(content),
            commentId: comment.id,
          });
        }
      },
    };
  }

  window.hydrateContentLikes = hydrateContentLikes;
  window.toggleContentLike = toggleContentLike;
  window.hydratePeepalReactions = hydratePeepalReactions;
  window.setPeepalReaction = setPeepalReaction;
  window.incrementContentShares = incrementContentShares;
  window.loadContentComments = loadContentComments;
  window.persistContentComment = persistContentComment;
  window.updateContentComment = updateContentComment;
  window.deleteContentComment = deleteContentComment;
  window.createCommentActionHandlers = createCommentActionHandlers;
  window.socialContentCanPersist = canPersist;
})();
