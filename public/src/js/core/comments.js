/**
 * Nested comments — shared by Duniya & Peepal.
 * Shape: { id, parentId|null, user:{name,avatar}, text, time, likeCount?, replyCount?, pending? }
 */
(function () {
  'use strict';

  function tt(key, fallback, vars) {
    if (typeof t === 'function') return t(key, vars || fallback);
    let str = fallback || key;
    Object.entries(vars || {}).forEach(([k, v]) => {
      str = String(str).replace(`{{${k}}}`, v);
    });
    return str;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCommentText(text) {
    return escapeHtml(text).replace(/@(\w+)/g, '<span class="comment-mention">@$1</span>');
  }

  function buildCommentById(list) {
    if (typeof window.buildCommentById === 'function') return window.buildCommentById(list);
    const map = new Map();
    (list || []).forEach((c) => {
      if (c?.id) map.set(c.id, c);
    });
    return map;
  }

  function resolveThreadRootId(commentId, commentById) {
    if (typeof window.resolveThreadRootId === 'function') return window.resolveThreadRootId(commentId, commentById);
    let id = commentId;
    let guard = 0;
    while (id && guard < 10) {
      const c = commentById.get(id);
      if (!c || !c.parentId) return id;
      id = c.parentId;
      guard += 1;
    }
    return commentId;
  }

  function groupComments(list) {
    const commentById = buildCommentById(list);
    const tops = [];
    const byRoot = new Map();
    (list || []).forEach((c) => {
      if (!c) return;
      if (!c.parentId) {
        tops.push(c);
        return;
      }
      const rootId = resolveThreadRootId(c.id, commentById);
      if (!byRoot.has(rootId)) byRoot.set(rootId, []);
      byRoot.get(rootId).push(c);
    });
    tops.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    byRoot.forEach((replies) => replies.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)));
    return { tops, byRoot, byParent: byRoot, commentById };
  }

  function commentLikeHtml(c, opts) {
    const surface = opts.surface || 'peepal';
    const liked = !!opts.likedByMe;
    const likeCount = Math.max(0, Number(opts.likeCount ?? c.likeCount) || 0);
    if (surface === 'duniya') {
      const heart =
        typeof duniyaHeartIcon === 'function'
          ? duniyaHeartIcon()
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.2-4.35-9.55-8.55C.5 8.95 2.35 4.5 6.4 4.5c2.25 0 3.75 1.3 4.6 2.55.85-1.25 2.35-2.55 4.6-2.55 4.05 0 5.9 4.45 3.95 7.95C19.2 16.65 12 21 12 21Z"/></svg>';
      return `<button type="button" class="comment-like-btn comment-like-btn--duniya" data-comment-like="${escapeHtml(c.id)}" aria-pressed="${liked ? 'true' : 'false'}" aria-label="${escapeHtml(tt('comment_like', 'Like'))}">${heart}</button>${likeCount ? `<span class="comment-like-count">${likeCount}</span>` : ''}`;
    }
    return `<button type="button" class="comment-like-btn comment-like-btn--peepal" data-comment-like="${escapeHtml(c.id)}" aria-pressed="${liked ? 'true' : 'false'}" aria-label="${escapeHtml(tt('comment_like', 'Like'))}">👍</button>`;
  }

  function commentRowHtml(c, opts) {
    const o = opts || {};
    const isReply = !!o.isReply || !!c.parentId;
    const surface = o.surface || 'peepal';
    const commentById = o.commentById || buildCommentById(o.allComments || []);
    const avatar =
      c.user && typeof renderUserAvatarHtml === 'function'
        ? renderUserAvatarHtml(c.user, { decorative: true })
        : c.user && c.user.photoURL
          ? `<img src="${escapeHtml(c.user.photoURL)}" alt="">`
          : escapeHtml((c.user && c.user.avatar) || '👤');

    let replyLabel = '';
    if (isReply && c.parentId) {
      const parent = commentById.get(c.parentId);
      const rootId = resolveThreadRootId(c.id, commentById);
      if (parent && c.parentId !== rootId) {
        const pName = (parent.user?.name || 'user').split(' ')[0];
        replyLabel = `<div class="comment-reply-to-label">${escapeHtml(tt('comment_replying_to', 'Replying to {{name}}', { name: '@' + pName }))}</div>`;
      }
    }

    const likedByMe = o.likedMap instanceof Map ? !!o.likedMap.get(c.id) : !!c.likedByMe;

    return `
      <div class="comment-item ${isReply ? 'comment-item--reply' : ''} ${c.pending ? 'comment-item--pending' : ''} ${c.deleted ? 'comment-item--deleted' : ''}" data-cid="${escapeHtml(c.id)}" ${c.parentId ? `data-parent="${escapeHtml(c.parentId)}"` : ''}>
        <div class="comment-avatar">${avatar}</div>
        <div class="comment-body">
          <div class="comment-name">${typeof formatDisplayNameHtml === 'function' ? formatDisplayNameHtml((c.user && c.user.name) || 'User', c.user) : escapeHtml((c.user && c.user.name) || 'User')}</div>
          ${replyLabel}
          <div class="comment-text">${c.deleted ? escapeHtml(tt('comment_deleted', 'Comment deleted')) : formatCommentText(c.text)}</div>
          <div class="comment-meta">
            <span class="comment-time">${escapeHtml(c.time || 'just now')}${c.editedAt ? ' · edited' : ''}</span>
            ${!c.deleted ? `<button type="button" class="comment-reply-btn" data-reply="${escapeHtml(c.id)}">${escapeHtml(tt('comment_reply', 'Reply'))}</button>` : ''}
            ${!c.deleted ? commentLikeHtml(c, { surface, likedByMe, likeCount: c.likeCount }) : ''}
          </div>
        </div>
        ${c.deleted ? '' : `<button type="button" class="comment-actions-btn" data-comment-actions="${escapeHtml(c.id)}" aria-label="More options">${typeof iconHtml === 'function' ? iconHtml('more-vertical', { size: 18 }) : '⋮'}</button>`}
      </div>`;
  }

  function renderCommentsHtml(comments, opts) {
    const o = opts || {};
    const preview = o.previewReplies == null ? 2 : o.previewReplies;
    const { tops, byRoot, commentById } = groupComments(comments);
    if (!tops.length) {
      return `<div class="comments-empty">${escapeHtml(tt('comment_empty', 'No comments yet — start the thread'))}</div>`;
    }
    return tops
      .map((top) => {
        const replies = byRoot.get(top.id) || [];
        const shown = replies.slice(0, preview);
        const hidden = replies.slice(preview);
        const rowOpts = {
          surface: o.surface || 'peepal',
          likedMap: o.likedMap,
          commentById,
          allComments: comments,
        };
        return `
          <div class="comment-thread" data-thread="${escapeHtml(top.id)}">
            ${commentRowHtml(top, rowOpts)}
            <div class="comment-replies" data-replies-for="${escapeHtml(top.id)}">
              ${shown.map((r) => commentRowHtml(r, { ...rowOpts, isReply: true })).join('')}
              ${
                hidden.length
                  ? `<button type="button" class="comment-more-replies" data-more="${escapeHtml(top.id)}" data-count="${hidden.length}">${escapeHtml(tt('comment_view_more_replies', 'View {{n}} more replies', { n: hidden.length }))}</button>
                     <div class="comment-replies-hidden" data-hidden-for="${escapeHtml(top.id)}" hidden>
                       ${hidden.map((r) => commentRowHtml(r, { ...rowOpts, isReply: true })).join('')}
                     </div>`
                  : ''
              }
            </div>
          </div>`;
      })
      .join('');
  }

  function renderFeedCommentsPreviewHtml(comments, previewComments, opts) {
    const o = opts || {};
    const prefix = o.prefix || 'peepal';
    const rows = Array.isArray(previewComments) ? previewComments : [];
    const totalCount = Math.max(Number(o.totalCount) || 0, rows.length);
    const commentById = buildCommentById(comments);

    if (!rows.length) {
      if (o.showEmpty) {
        return `<button type="button" class="${prefix}-feed-add-comment">${escapeHtml(tt('comment_add_placeholder', 'Add a comment…'))}</button>`;
      }
      return '';
    }

    const body = rows
      .map((c) => {
        const name = (c.user?.name || 'User').split(' ')[0];
        let replyHint = '';
        if (c.parentId) {
          const parent = commentById.get(c.parentId);
          const pName = (parent?.user?.name || 'user').split(' ')[0];
          replyHint = `<span class="feed-comment-reply-hint">↳ ${escapeHtml(tt('comment_replying_to', 'replying to {{name}}', { name: '@' + pName }))}</span>`;
        }
        const avatar =
          c.user && typeof renderUserAvatarHtml === 'function'
            ? renderUserAvatarHtml(c.user, { decorative: true, size: 28 })
            : c.user && c.user.photoURL
              ? `<img src="${escapeHtml(c.user.photoURL)}" alt="">`
              : escapeHtml((c.user && c.user.avatar) || '👤');
        const text = c.deleted ? tt('comment_deleted', 'Comment deleted') : c.text || '';
        return `<button type="button" class="feed-comment-row" data-comment-id="${escapeHtml(c.id)}">
          <span class="feed-comment-avatar">${avatar}</span>
          <span class="feed-comment-body">
            <span class="feed-comment-name">${typeof formatDisplayNameHtml === 'function' ? formatDisplayNameHtml(name, c.user) : escapeHtml(name)}</span>
            <span class="feed-comment-text">${formatCommentText(text)}</span>
            ${replyHint}
          </span>
        </button>`;
      })
      .join('');

    const more =
      totalCount > rows.length
        ? `<button type="button" class="feed-comment-more">${escapeHtml(tt('comment_view_all', 'View all {{n}} comments', { n: totalCount }))}</button>`
        : '';

    return `<div class="${prefix}-feed-comments" data-post-id="${escapeHtml(o.postId || '')}">${body}${more}</div>`;
  }

  function focusCommentRow(listEl, commentId) {
    const row = listEl?.querySelector(`[data-cid="${commentId}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('comment-item--focus-pulse');
    setTimeout(() => row.classList.remove('comment-item--focus-pulse'), 1200);
  }

  function wireCommentsList(root, comments, opts) {
    const o = opts || {};
    if (!root) return;

    root.querySelectorAll('.comment-more-replies').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.more;
        const hidden = root.querySelector(`[data-hidden-for="${id}"]`);
        if (!hidden) return;
        const open = hidden.hasAttribute('hidden');
        const n = btn.dataset.count || '0';
        if (open) {
          hidden.removeAttribute('hidden');
          btn.textContent = tt('comment_hide_replies', 'Hide replies');
        } else {
          hidden.setAttribute('hidden', '');
          btn.textContent = tt('comment_view_more_replies', 'View {{n}} more replies', { n });
        }
      });
    });

    root.querySelectorAll('.comment-reply-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.reply;
        if (typeof o.onReply === 'function') o.onReply(pid);
      });
    });

    root.querySelectorAll('.comment-like-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (btn.dataset.busy) return;
        const comment = (comments || []).find((c) => c.id === btn.dataset.commentLike);
        if (!comment || comment.deleted) return;
        if (!currentUser) {
          if (typeof requireSignIn === 'function') requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
          return;
        }
        btn.dataset.busy = '1';
        const prevLiked = btn.getAttribute('aria-pressed') === 'true';
        const prevCount = Number(comment.likeCount) || 0;
        const apply = (liked, likeCount) => {
          comment.likedByMe = liked;
          comment.likeCount = likeCount;
          btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
          const countEl = btn.parentElement?.querySelector('.comment-like-count');
          if (countEl) {
            if (likeCount > 0) {
              countEl.textContent = String(likeCount);
              countEl.hidden = false;
            } else {
              countEl.remove();
            }
          } else if (o.surface === 'duniya' && likeCount > 0) {
            const span = document.createElement('span');
            span.className = 'comment-like-count';
            span.textContent = String(likeCount);
            btn.insertAdjacentElement('afterend', span);
          }
        };
        apply(!prevLiked, prevCount + (prevLiked ? -1 : 1));
        try {
          if (typeof toggleCommentLike === 'function' && o.collection && o.content) {
            const saved = await toggleCommentLike(o.collection, o.content, comment);
            if (saved.persisted) apply(!!saved.liked, Number(saved.likeCount) || 0);
          }
        } catch (err) {
          apply(prevLiked, prevCount);
          if (typeof showToast === 'function') {
            showToast(typeof friendlyError === 'function' ? friendlyError(err) : tt('comment_like_fail', 'Couldn’t save like'));
          }
        } finally {
          delete btn.dataset.busy;
        }
      });
    });

    const openActions = (comment, row) => {
      if (!comment || comment.deleted || typeof showActionSheet !== 'function') return;
      const uid = comment.uid || comment.user?.uid;
      const mine = !!(typeof currentUser !== 'undefined' && currentUser?.uid && uid === currentUser.uid);
      const actions = [
        {
          label: tt('comment_copy', 'Copy comment'),
          icon: 'copy',
          fn: () => {
            navigator.clipboard?.writeText(comment.text || '').catch(() => {});
            if (typeof showToast === 'function') showToast(tt('comment_copied', 'Comment copied'));
          },
        },
      ];
      if (mine) {
        actions.push(
          { label: tt('comment_edit', 'Edit comment'), icon: 'pen', fn: () => typeof o.onEdit === 'function' && o.onEdit(comment, row) },
          { label: tt('comment_delete', 'Delete comment'), icon: 'trash', danger: true, fn: () => typeof o.onDelete === 'function' && o.onDelete(comment, row) }
        );
      } else if (uid) {
        actions.push({
          label: tt('comment_report', 'Report comment'),
          icon: 'triangle-alert',
          danger: true,
          fn: () => typeof o.onReport === 'function' && o.onReport(comment, row),
        });
      }
      showActionSheet(tt('comment_sheet_title', 'Comment'), actions);
    };

    root.querySelectorAll('[data-comment-actions]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const comment = (comments || []).find((c) => c.id === btn.dataset.commentActions);
        openActions(comment, btn.closest('.comment-item'));
      });
    });
    root.querySelectorAll('.comment-item').forEach((row) => {
      const comment = (comments || []).find((c) => c.id === row.dataset.cid);
      if (comment && typeof o.onLongPress === 'function') onLongPress(row, () => openActions(comment, row));
    });
  }

  function startInlineCommentEdit(row, comment, onSave) {
    const textEl = row?.querySelector('.comment-text');
    if (!textEl || !comment || textEl.dataset.editing === '1') return;
    textEl.dataset.editing = '1';
    const original = textEl.innerHTML;
    const form = document.createElement('div');
    form.className = 'comment-inline-edit';
    form.innerHTML = `
      <textarea maxlength="2000" aria-label="${escapeHtml(tt('comment_edit', 'Edit comment'))}"></textarea>
      <div><button type="button" data-comment-edit-cancel>${escapeHtml(tt('cancel', 'Cancel'))}</button><button type="button" data-comment-edit-save>${escapeHtml(tt('save', 'Save'))}</button></div>`;
    const textarea = form.querySelector('textarea');
    textarea.value = comment.text || '';
    textEl.innerHTML = '';
    textEl.appendChild(form);
    const restore = () => {
      textEl.innerHTML = original;
      delete textEl.dataset.editing;
    };
    form.querySelector('[data-comment-edit-cancel]')?.addEventListener('click', restore);
    form.querySelector('[data-comment-edit-save]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const next = textarea.value.trim();
      if (!next || next === comment.text) {
        restore();
        return;
      }
      btn.disabled = true;
      btn.textContent = tt('saving', 'Saving…');
      try {
        await onSave?.(next);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = tt('save', 'Save');
        if (typeof showToast === 'function') showToast(typeof friendlyError === 'function' ? friendlyError(err) : tt('comment_edit_fail', 'Couldn’t edit comment'));
      }
    });
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  function newCommentId() {
    return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function currentCommentUser() {
    const profileType =
      typeof ownProfileType === 'function'
        ? ownProfileType()
        : typeof getProfileType === 'function'
          ? getProfileType()
          : 'personal';
    return {
      name: (typeof userProfile !== 'undefined' && userProfile?.name) || (typeof currentUser !== 'undefined' && currentUser?.displayName) || 'You',
      avatar: '🪑',
      photoURL: (typeof userProfile !== 'undefined' && userProfile?.photoURL) || (typeof currentUser !== 'undefined' && currentUser?.photoURL) || '',
      uid: (typeof currentUser !== 'undefined' && currentUser?.uid) || 'me',
      profileType,
    };
  }

  window.groupComments = groupComments;
  window.renderCommentsHtml = renderCommentsHtml;
  window.renderFeedCommentsPreviewHtml = renderFeedCommentsPreviewHtml;
  window.wireCommentsList = wireCommentsList;
  window.focusCommentRow = focusCommentRow;
  window.newCommentId = newCommentId;
  window.currentCommentUser = currentCommentUser;
  window.formatCommentText = formatCommentText;
  window.startInlineCommentEdit = startInlineCommentEdit;
})();
