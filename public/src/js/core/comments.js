/**
 * Nested comments (2 levels) — shared by Duniya & Peepal.
 * Shape: { id, parentId|null, user:{name,avatar}, text, time, pending? }
 */
(function () {
  'use strict';

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

  function groupComments(list) {
    const tops = [];
    const byParent = new Map();
    (list || []).forEach((c) => {
      if (!c) return;
      if (c.parentId) {
        if (!byParent.has(c.parentId)) byParent.set(c.parentId, []);
        byParent.get(c.parentId).push(c);
      } else {
        tops.push(c);
      }
    });
    return { tops, byParent };
  }

  function commentRowHtml(c, { isReply, collapsed } = {}) {
    const avatar =
      c.user && c.user.photoURL
        ? `<img src="${escapeHtml(c.user.photoURL)}" alt="">`
        : escapeHtml((c.user && c.user.avatar) || '👤');
    return `
      <div class="comment-item ${isReply ? 'comment-item--reply' : ''} ${c.pending ? 'comment-item--pending' : ''} ${c.deleted ? 'comment-item--deleted' : ''}" data-cid="${escapeHtml(c.id)}" ${c.parentId ? `data-parent="${escapeHtml(c.parentId)}"` : ''}>
        <div class="comment-avatar">${avatar}</div>
        <div class="comment-body">
          <div class="comment-name">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml((c.user&&c.user.name)||'User',c.user):escapeHtml((c.user && c.user.name) || 'User')}</div>
          <div class="comment-text">${c.deleted ? 'Comment deleted' : formatCommentText(c.text)}</div>
          <div class="comment-meta">
            <span class="comment-time">${escapeHtml(c.time || 'just now')}${c.editedAt ? ' · edited' : ''}</span>
            ${!isReply && !c.deleted ? `<button type="button" class="comment-reply-btn" data-reply="${escapeHtml(c.id)}">Reply</button>` : ''}
          </div>
        </div>
        ${c.deleted ? '' : `<button type="button" class="comment-actions-btn" data-comment-actions="${escapeHtml(c.id)}" aria-label="Comment actions">⋯</button>`}
      </div>`;
  }

  /**
   * @param {Array} comments
   * @param {object} [opts]
   * @param {number} [opts.previewReplies=1] - replies shown before "view more"
   */
  function renderCommentsHtml(comments, opts) {
    const o = opts || {};
    const preview = o.previewReplies == null ? 1 : o.previewReplies;
    const { tops, byParent } = groupComments(comments);
    if (!tops.length) {
      return `<div class="comments-empty">No comments yet — start the thread</div>`;
    }
    return tops
      .map((top) => {
        const replies = byParent.get(top.id) || [];
        const shown = replies.slice(0, preview);
        const hidden = replies.slice(preview);
        return `
          <div class="comment-thread" data-thread="${escapeHtml(top.id)}">
            ${commentRowHtml(top, { isReply: false })}
            <div class="comment-replies" data-replies-for="${escapeHtml(top.id)}">
              ${shown.map((r) => commentRowHtml(r, { isReply: true })).join('')}
              ${
                hidden.length
                  ? `<button type="button" class="comment-more-replies" data-more="${escapeHtml(top.id)}" data-count="${hidden.length}">View ${hidden.length} more ${hidden.length === 1 ? 'reply' : 'replies'}</button>
                     <div class="comment-replies-hidden" data-hidden-for="${escapeHtml(top.id)}" hidden>
                       ${hidden.map((r) => commentRowHtml(r, { isReply: true })).join('')}
                     </div>`
                  : ''
              }
            </div>
          </div>`;
      })
      .join('');
  }

  /**
   * Wire expand + reply. opts.onReply(parentId), opts.getHiddenComments(parentId) optional.
   */
  function wireCommentsList(root, comments, opts) {
    const o = opts || {};
    if (!root) return;
    root.querySelectorAll('.comment-more-replies').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.more;
        const hidden = root.querySelector(`[data-hidden-for="${id}"]`);
        if (!hidden) return;
        const open = hidden.hasAttribute('hidden');
        if (open) {
          hidden.removeAttribute('hidden');
          btn.textContent = 'Hide replies';
        } else {
          hidden.setAttribute('hidden', '');
          const n = btn.dataset.count || '0';
          btn.textContent = `View ${n} more ${n === '1' ? 'reply' : 'replies'}`;
        }
      });
    });
    root.querySelectorAll('.comment-reply-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.reply;
        if (typeof o.onReply === 'function') o.onReply(pid);
      });
    });

    const openActions = (comment, row) => {
      if (!comment || comment.deleted || typeof showActionSheet !== 'function') return;
      const uid = comment.uid || comment.user?.uid;
      const mine = !!(typeof currentUser !== 'undefined' && currentUser?.uid && uid === currentUser.uid);
      const actions = [
        {
          label: 'Copy comment',
          fn: () => {
            navigator.clipboard?.writeText(comment.text || '').catch(() => {});
            if (typeof showToast === 'function') showToast('Comment copied');
          },
        },
      ];
      if (mine) {
        actions.push(
          { label: 'Edit comment', fn: () => typeof o.onEdit === 'function' && o.onEdit(comment, row) },
          { label: 'Delete comment', danger: true, fn: () => typeof o.onDelete === 'function' && o.onDelete(comment, row) }
        );
      } else if (uid) {
        actions.push({
          label: 'Report comment',
          danger: true,
          fn: () => typeof o.onReport === 'function' && o.onReport(comment, row),
        });
      }
      showActionSheet('Comment', actions);
    };

    root.querySelectorAll('[data-comment-actions]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const comment = (comments || []).find((c) => c.id === btn.dataset.commentActions);
        openActions(comment, btn.closest('.comment-item'));
      });
    });
    root.querySelectorAll('.comment-item').forEach((row) => {
      const comment = (comments || []).find((c) => c.id === row.dataset.cid);
      if (comment && typeof onLongPress === 'function') onLongPress(row, () => openActions(comment, row));
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
      <textarea maxlength="2000" aria-label="Edit comment"></textarea>
      <div><button type="button" data-comment-edit-cancel>Cancel</button><button type="button" data-comment-edit-save>Save</button></div>`;
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
      btn.textContent = 'Saving…';
      try {
        await onSave?.(next);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Save';
        if (typeof showToast === 'function') showToast(typeof friendlyError === 'function' ? friendlyError(err) : 'Couldn’t edit comment');
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
  window.wireCommentsList = wireCommentsList;
  window.newCommentId = newCommentId;
  window.currentCommentUser = currentCommentUser;
  window.formatCommentText = formatCommentText;
  window.startInlineCommentEdit = startInlineCommentEdit;
})();
