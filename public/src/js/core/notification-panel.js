/**
 * Shared notification panel — Profile inbox + per-tab double-tap sheets.
 * Cloud-backed bundles via onSnapshot; soft-clear = mark_read (Admin API).
 */
(function () {
  'use strict';

  const DEFAULT_LIMIT = 8;
  const EXPANDED_LIMIT = 50;

  /** type substring → tab section */
  const SECTION_TYPES = {
    baithak: ['baithak', 'message', 'dm', 'chat', 'group', 'story', 'friend', 'invite'],
    peepal: ['peepal', 'match', 'response', 'join', 'ask', 'discovery', 'mention', 'reply', 'reaction'],
    duniya: ['duniya', 'like', 'comment', 'follow', 'lehar', 'post', 'tag'],
    akhbaar: ['akhbaar', 'quiz', 'streak', 'breaking', 'news', 'taaza'],
    dangal: ['dangal', 'duel', 'muqabala', 'game', 'invite', 'turn', 'result', 'challenge'],
    all: null,
  };

  // Cloud inbox (Admin-written). Local ephemerals (breaking/system) live in localEphemeral.
  let cloudNotifications = [];
  let localEphemeral = [];
  let notifUnsub = null;
  let notifLimit = DEFAULT_LIMIT;
  let notifHasMore = false;
  let pruneOnce = false;
  let panelRepaint = null;

  // Seed wipe — one-time clear of pre-cloud localStorage demo inbox
  try {
    if (!localStorage.getItem('chaupaal_notif_cloud_v1')) {
      localStorage.removeItem('chaupaal_notifications');
      localStorage.setItem('chaupaal_notif_cloud_v1', '1');
    }
  } catch (e) {}

  function syncNotificationsGlobal() {
    const merged = [...cloudNotifications];
    localEphemeral.forEach((n) => {
      if (!merged.some((x) => x.id === n.id)) merged.push(n);
    });
    merged.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    window.notifications = merged;
    if (typeof notifications !== 'undefined') {
      try {
        // keep legacy bare `notifications` in sync when declared later
        if (typeof globalThis !== 'undefined') globalThis.notifications = merged;
      } catch (e) {}
    }
  }

  function tt(key, fallback, vars) {
    try {
      if (typeof t === 'function') {
        const v = t(key, vars || {});
        if (v && v !== key) return v;
      }
    } catch (e) {}
    let s = fallback;
    if (vars) Object.entries(vars).forEach(([k, v]) => {
      s = String(s).replace(`{{${k}}}`, v);
    });
    return s;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function notifSection(n) {
    if (n.section) return String(n.section).toLowerCase();
    const t0 = String(n.type || '').toLowerCase();
    for (const [sec, types] of Object.entries(SECTION_TYPES)) {
      if (sec === 'all' || !types) continue;
      if (types.some((x) => t0.includes(x))) return sec;
    }
    return 'all';
  }

  function filterBySection(list, section) {
    if (!section || section === 'all') return list;
    const types = SECTION_TYPES[section];
    return list.filter((n) => {
      const s = notifSection(n);
      if (s === section) return true;
      const ty = String(n.type || '').toLowerCase();
      return types && types.some((x) => ty.includes(x));
    });
  }

  function unreadCount(section) {
    const list = window.notifications || [];
    return filterBySection(list, section).filter((n) => !n.read && !n.localOnly).length;
  }

  function updateSectionNotifDots() {
    ['duniya', 'peepal', 'dangal', 'baithak', 'akhbaar', 'all'].forEach((sec) => {
      const count = unreadCount(sec);
      document.querySelectorAll(`[data-notif-dot="${sec}"]`).forEach((dot) => {
        dot.classList.toggle('hidden', count === 0);
        dot.removeAttribute('data-count');
      });
    });
    if (typeof updateTabNotifLights === 'function') updateTabNotifLights();
  }

  function iconForType(type) {
    const t0 = String(type || '').toLowerCase();
    if (t0.includes('like') || t0.includes('reaction')) return '❤️';
    if (t0.includes('comment') || t0.includes('reply')) return '💬';
    if (t0.includes('follow')) return '➕';
    if (t0.includes('friend')) return '🤝';
    if (t0.includes('message') || t0.includes('dm')) return '💬';
    if (t0.includes('story')) return '✨';
    if (t0.includes('duel') || t0.includes('challenge')) return '⚔️';
    if (t0.includes('breaking')) return '🔴';
    return '🔔';
  }

  function formatBundledText(n) {
    if (n.text) return n.text;
    const actors = Array.isArray(n.actors) ? n.actors : [];
    const actor = actors[0]?.name || 'Someone';
    const count = Math.max(1, Number(n.actorCount) || actors.length || 1);
    const others = Math.max(0, count - 1);
    const type = String(n.type || '').toLowerCase();
    const preview = String(n.preview || '').trim();

    if (type === 'friend_request') {
      return tt('notif_bundle_friend_request', '<strong>{{actor}}</strong> sent you a friend request', { actor: escapeHtml(actor) });
    }
    if (type === 'friend_accept') {
      return tt('notif_bundle_friend_accept', '<strong>{{actor}}</strong> accepted your friend request', { actor: escapeHtml(actor) });
    }
    if (type === 'follow') {
      return others
        ? tt('notif_bundle_follow_many', '<strong>{{actor}}</strong> + {{n}} others started following you', {
            actor: escapeHtml(actor),
            n: String(others),
          })
        : tt('notif_bundle_follow', '<strong>{{actor}}</strong> started following you', { actor: escapeHtml(actor) });
    }
    if (type.includes('message') || type === 'dm') {
      const body = preview ? `: ${escapeHtml(preview.slice(0, 80))}` : '';
      return tt('notif_bundle_message', '<strong>{{actor}}</strong> sent you a message{{body}}', {
        actor: escapeHtml(actor),
        body,
      });
    }
    if (type.includes('comment') || type === 'story_comment') {
      return others
        ? tt('notif_bundle_comment_many', '<strong>{{actor}}</strong> + {{n}} others commented', {
            actor: escapeHtml(actor),
            n: String(others),
          })
        : tt('notif_bundle_comment', '<strong>{{actor}}</strong> commented{{preview}}', {
            actor: escapeHtml(actor),
            preview: preview ? `: ${escapeHtml(preview.slice(0, 80))}` : '',
          });
    }
    if (type.includes('like') || type.includes('reaction') || type === 'story_like') {
      return others
        ? tt('notif_bundle_like_many', '<strong>{{actor}}</strong> + {{n}} others liked your post', {
            actor: escapeHtml(actor),
            n: String(others),
          })
        : tt('notif_bundle_like', '<strong>{{actor}}</strong> liked your post', { actor: escapeHtml(actor) });
    }
    if (preview) {
      return `<strong>${escapeHtml(actor)}</strong> ${escapeHtml(preview)}`;
    }
    return `<strong>${escapeHtml(actor)}</strong> ${tt('notif_bundle_generic', 'nudged you')}`;
  }

  function mapCloudDoc(doc) {
    const raw = doc.data() || {};
    const ts =
      raw.updatedAt?.toMillis?.() ||
      Number(raw.updatedAtMs) ||
      raw.createdAt?.toMillis?.() ||
      Date.now();
    return {
      id: doc.id,
      bundleId: doc.id,
      type: raw.type || 'info',
      refId: raw.refId || '',
      actors: Array.isArray(raw.actors) ? raw.actors : [],
      actorCount: Number(raw.actorCount) || 0,
      preview: raw.preview || '',
      icon: iconForType(raw.type),
      text: null,
      time: null,
      ts,
      read: !!raw.read,
      section: raw.section || null,
      deepLink: raw.deepLink || null,
      localOnly: false,
    };
  }

  function apiNotif(action, body) {
    if (typeof apiFetch !== 'function') return Promise.resolve(null);
    return apiFetch('/api/media-config', {
      method: 'POST',
      needAuth: true,
      body: { action, ...(body || {}) },
    }).catch(() => null);
  }

  async function markNotificationRead(id) {
    const list = window.notifications || [];
    const n = list.find((x) => x.id === id);
    if (n) n.read = true;
    if (n && !n.localOnly) {
      await apiNotif('notif_mark_read', { bundleId: id });
    }
    const cloud = cloudNotifications.find((x) => x.id === id);
    if (cloud) cloud.read = true;
    const loc = localEphemeral.find((x) => x.id === id);
    if (loc) loc.read = true;
    syncNotificationsGlobal();
    updateSectionNotifDots();
  }

  async function markAllNotificationsRead(section) {
    const list = window.notifications || [];
    filterBySection(list, section || 'all').forEach((n) => {
      n.read = true;
    });
    cloudNotifications.forEach((n) => {
      if (!section || section === 'all' || notifSection(n) === section) n.read = true;
    });
    await apiNotif('notif_mark_all_read', { section: section && section !== 'all' ? section : null });
    syncNotificationsGlobal();
    updateSectionNotifDots();
  }

  async function softClearIds(ids) {
    const idSet = new Set(ids);
    cloudNotifications.forEach((n) => {
      if (idSet.has(n.id)) n.read = true;
    });
    localEphemeral = localEphemeral.filter((n) => !idSet.has(n.id));
    syncNotificationsGlobal();
    updateSectionNotifDots();
    const cloudIds = [...idSet].filter((id) => !String(id).startsWith('local_'));
    if (cloudIds.length) {
      await apiNotif('notif_soft_clear', { bundleIds: cloudIds });
    }
  }

  function clearSectionWithUndo(section, repaint) {
    const list = window.notifications || [];
    const targets = filterBySection(list, section || 'all').filter((n) => !n.read || n.localOnly);
    if (!targets.length) {
      // Also soft-clear already-read rows in section for "clear all"
      const all = filterBySection(list, section || 'all');
      if (!all.length) return;
      softClearIds(all.map((n) => n.id)).then(() => repaint?.());
      if (typeof showToast === 'function') showToast(tt('notif_cleared', 'Notifications cleared'));
      return;
    }
    const snapshot = targets.map((n) => ({ ...n, read: false }));
    softClearIds(targets.map((n) => n.id)).then(() => {
      repaint?.();
      const undo = () => {
        // Soft-clear can't un-read remotely; restore local ephemeral feel only
        snapshot.forEach((n) => {
          if (n.localOnly) localEphemeral.unshift(n);
          else {
            const c = cloudNotifications.find((x) => x.id === n.id);
            if (c) c.read = false;
          }
        });
        syncNotificationsGlobal();
        updateSectionNotifDots();
        repaint?.();
      };
      if (typeof showUndoToast === 'function') {
        showUndoToast(tt('notif_cleared', 'Notifications cleared'), { onUndo: undo });
      } else if (typeof showToast === 'function') {
        showToast(tt('notif_cleared', 'Notifications cleared'));
      }
    });
  }

  function deepLinkNotification(n) {
    if (!n) return;
    const link = n.deepLink || n.link || {};
    const type = String(n.type || '').toLowerCase();
    try {
      if (link.chatId && typeof openChatById === 'function') {
        openChatById(link.chatId);
        return;
      }
      if ((type === 'friend_request' || type === 'friend_accept' || type === 'follow') && (n.refId || link.uid)) {
        const uid = link.uid || n.refId;
        if (typeof openPublicProfile === 'function') {
          openPublicProfile({ uid, username: link.username, name: link.name }, { uid });
          return;
        }
      }
      if (link.uid && typeof openPublicProfile === 'function') {
        openPublicProfile({ uid: link.uid, username: link.username, name: link.name }, { uid: link.uid });
        return;
      }
      if (link.postId) {
        if (link.collection === 'peepal' || type.includes('peepal')) {
          document.querySelector('.tab-btn[data-tab="peepal"]')?.click();
          return;
        }
        if (typeof navigateToDeepLink === 'function') {
          navigateToDeepLink(`/post/${link.postId}`);
          return;
        }
      }
      const sec = notifSection(n);
      if (sec && sec !== 'all') {
        document.querySelector(`.tab-btn[data-tab="${sec}"]`)?.click();
        return;
      }
      if (type.includes('duel') || type.includes('dangal') || type.includes('muqabala')) {
        document.querySelector('.tab-btn[data-tab="dangal"]')?.click();
      } else if (type.includes('peepal') || type.includes('match')) {
        document.querySelector('.tab-btn[data-tab="peepal"]')?.click();
      } else if (type.includes('baithak') || type.includes('message') || type.includes('dm') || type.includes('story')) {
        document.querySelector('.tab-btn[data-tab="baithak"]')?.click();
      } else if (type.includes('streak') || type.includes('akhbaar') || type.includes('breaking')) {
        document.querySelector('.tab-btn[data-tab="akhbaar"]')?.click();
      } else if (type.includes('duniya') || type.includes('like') || type.includes('comment') || type.includes('follow')) {
        document.querySelector('.tab-btn[data-tab="duniya"]')?.click();
      }
    } catch (e) {
      /* ignore */
    }
  }

  function emptyCtaFor(section) {
    const map = {
      peepal: {
        title: tt('notif_empty_peepal', 'No Peepal activity yet'),
        message: tt('notif_empty_peepal_msg', 'Replies and discoveries will show up here.'),
        actionLabel: tt('shortcut_peepal_ask', 'Start discussion'),
        action: () => typeof openPeepalAskSheet === 'function' && openPeepalAskSheet(),
      },
      duniya: {
        title: tt('notif_empty_duniya', 'No Duniya activity yet'),
        message: tt('notif_empty_duniya_msg', 'Likes, comments, and follows land here.'),
        actionLabel: tt('shortcut_duniya_post', 'Create post'),
        action: () => typeof openDuniyaPostSheet === 'function' && openDuniyaPostSheet('post'),
      },
      baithak: {
        title: tt('notif_empty_baithak', 'No chats yet'),
        message: tt('notif_empty_baithak_msg', 'DMs, groups, and story notes appear here.'),
        actionLabel: tt('shortcut_baithak_dm', 'New DM'),
        action: () => typeof showNewDmSearchSheet === 'function' && showNewDmSearchSheet(),
      },
      akhbaar: {
        title: tt('notif_empty_akhbaar', 'No Akhbaar nudges'),
        message: tt('notif_empty_akhbaar_msg', 'Streak and quiz reminders will show up here.'),
        actionLabel: tt('shortcut_akhbaar_quiz', "Today's quiz"),
        action: () => {
          document.querySelector('.tab-btn[data-tab="akhbaar"]')?.click();
          if (typeof window.ensureAkhbaarBuilt === 'function') window.ensureAkhbaarBuilt();
        },
      },
      dangal: {
        title: tt('notif_empty_dangal', 'No Dangal challenges'),
        message: tt('notif_empty_dangal_msg', 'Invites and match results land here.'),
        actionLabel: tt('shortcut_dangal_gotd', 'Game of the day'),
        action: () => document.querySelector('.tab-btn[data-tab="dangal"]')?.click(),
      },
      all: {
        title: tt('notif_empty_all', 'No notifications yet'),
        message: tt('notif_empty_all_msg', 'Activity across Chaupaal will show up here.'),
        actionLabel: null,
        action: null,
      },
    };
    return map[section] || map.all;
  }

  function bindSwipeClear(row, onClear) {
    let startX = 0;
    let dx = 0;
    let tracking = false;
    row.addEventListener(
      'touchstart',
      (e) => {
        startX = e.touches[0].clientX;
        dx = 0;
        tracking = true;
        row.classList.add('is-swiping');
      },
      { passive: true }
    );
    row.addEventListener(
      'touchmove',
      (e) => {
        if (!tracking) return;
        dx = e.touches[0].clientX - startX;
        if (dx < 0) row.style.transform = `translateX(${Math.max(dx, -120)}px)`;
      },
      { passive: true }
    );
    row.addEventListener('touchend', () => {
      tracking = false;
      row.classList.remove('is-swiping');
      if (dx < -72) onClear();
      else row.style.transform = '';
    });
  }

  function openRowActions(n, repaint) {
    const actions = [
      {
        label: tt('notif_action_clear', 'Clear'),
        danger: true,
        onClick: () => {
          softClearIds([n.id]).then(() => {
            repaint();
            if (typeof showToast === 'function') showToast(tt('notif_cleared_one', 'Notification cleared'));
          });
        },
      },
      {
        label: tt('notif_action_mute_type', 'Hide this type'),
        onClick: () => {
          try {
            const key = 'chaupaal_muted_notif_types';
            const muted = JSON.parse(localStorage.getItem(key) || '[]');
            const ty = String(n.type || '');
            if (ty && !muted.includes(ty)) muted.push(ty);
            localStorage.setItem(key, JSON.stringify(muted.slice(0, 40)));
          } catch (e) {}
          if (typeof showToast === 'function') showToast(tt('notif_type_hidden', 'This type will be quieter'));
        },
      },
      {
        label: tt('notif_action_mark_read', 'Mark read'),
        onClick: async () => {
          await markNotificationRead(n.id);
          repaint();
        },
      },
    ];
    if (typeof showActionSheet === 'function') {
      showActionSheet(tt('notif_actions_title', 'Notification'), actions);
    } else {
      actions[0].onClick();
    }
  }

  function isTypeMuted(n) {
    try {
      const muted = JSON.parse(localStorage.getItem('chaupaal_muted_notif_types') || '[]');
      return muted.includes(String(n.type || ''));
    } catch (e) {
      return false;
    }
  }

  async function respondFriendFromNotif(n, accept, rowEl, repaint) {
    const targetUid = n.refId || n.deepLink?.uid;
    if (!targetUid || typeof apiFetch !== 'function') return;
    const btns = rowEl?.querySelector('[data-friend-actions]');
    if (btns) btns.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      const env = await apiFetch('/api/relationships', {
        method: 'POST',
        needAuth: true,
        body: { action: 'respond_friend', targetUid, accept: !!accept },
      });
      if (!env?.ok) throw new Error(env?.error?.message || 'Failed');
      await softClearIds([n.id]);
      if (typeof showToast === 'function') {
        showToast(
          accept
            ? tt('notif_friend_accepted', 'Friend request accepted')
            : tt('notif_friend_declined', 'Friend request declined')
        );
      }
      repaint?.();
    } catch (e) {
      if (typeof showToast === 'function') showToast(e?.message || 'Could not respond');
      if (btns) btns.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
  }

  function renderPanelList(listEl, items, { hasMore, onMore, section, repaint } = {}) {
    if (!listEl) return;
    const visible = items.filter((n) => !isTypeMuted(n));
    if (!visible.length) {
      const cta = emptyCtaFor(section || 'all');
      if (typeof renderEmptyState === 'function') {
        renderEmptyState(listEl, {
          icon: '🔔',
          title: cta.title,
          message: cta.message,
          actionLabel: cta.actionLabel || undefined,
          onAction: cta.action
            ? () => {
                document.getElementById('notifPanelSheet')?.remove();
                cta.action();
              }
            : undefined,
        });
      } else {
        listEl.innerHTML = `<div class="notif-empty">${cta.title}</div>`;
      }
      return;
    }
    listEl.innerHTML = visible
      .map((n) => {
        const when =
          typeof formatRelativeTime === 'function' ? formatRelativeTime(n.ts || n.time) : `${n.time || ''} ago`;
        const text = formatBundledText(n);
        const actorCount = Math.max(1, Number(n.actorCount) || (n.actors || []).length || 1);
        const expand =
          actorCount > 1
            ? `<button type="button" class="notif-expand" data-expand aria-expanded="false" aria-label="${tt('notif_expand_actors', 'Show who')}">▾</button>`
            : '';
        const actorsHtml =
          actorCount > 1
            ? `<div class="notif-actors hidden" data-actors>
            ${(n.actors || [])
              .map(
                (a) =>
                  `<button type="button" class="notif-actor" data-actor-uid="${escapeHtml(a.uid)}">
                    <span class="notif-actor-av">${escapeHtml(a.avatar || '👤')}</span>
                    <span>${escapeHtml(a.name || 'Someone')}</span>
                  </button>`
              )
              .join('')}
            ${
              actorCount > (n.actors || []).length
                ? `<div class="notif-actors-more">+${actorCount - (n.actors || []).length} ${tt('notif_more_people', 'more')}</div>`
                : ''
            }
          </div>`
            : '';
        const friendActions =
          String(n.type || '') === 'friend_request'
            ? `<div class="notif-friend-actions" data-friend-actions>
            <button type="button" class="btn notif-friend-accept" data-friend-accept>${tt('notif_accept', 'Accept')}</button>
            <button type="button" class="btn notif-friend-decline" data-friend-decline>${tt('notif_decline', 'Decline')}</button>
          </div>`
            : '';
        return `<div class="notif-item ${n.read ? 'is-read' : 'unread'}" data-id="${n.id}" data-notif-row>
          <div class="notif-icon">${n.icon || '🔔'}</div>
          <div class="notif-body">
            <div class="notif-text-row">${text}${expand}</div>
            ${actorsHtml}
            ${friendActions}
            <div class="notif-time">${when}</div>
          </div>
          ${n.read ? '' : '<span class="notif-unread-pip" aria-hidden="true"></span>'}
        </div>`;
      })
      .join('');

    listEl.querySelectorAll('[data-notif-row]').forEach((item) => {
      const n = (window.notifications || []).find((x) => x.id === item.dataset.id);
      item.querySelector('[data-expand]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = item.querySelector('[data-actors]');
        const btn = item.querySelector('[data-expand]');
        if (!panel || !btn) return;
        const open = panel.classList.toggle('hidden') === false;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = open ? '▴' : '▾';
      });
      item.querySelectorAll('[data-actor-uid]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const uid = btn.getAttribute('data-actor-uid');
          if (uid && typeof openPublicProfile === 'function') {
            openPublicProfile({ uid }, { uid });
          }
        });
      });
      item.querySelector('[data-friend-accept]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        respondFriendFromNotif(n, true, item, repaint);
      });
      item.querySelector('[data-friend-decline]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        respondFriendFromNotif(n, false, item, repaint);
      });
      item.addEventListener('click', async (e) => {
        if (e.target.closest('[data-expand],[data-actors],[data-friend-actions]')) return;
        await markNotificationRead(item.dataset.id);
        item.classList.remove('unread');
        item.classList.add('is-read');
        item.querySelector('.notif-unread-pip')?.remove();
        deepLinkNotification(n);
      });
      bindSwipeClear(item, () => {
        softClearIds([item.dataset.id]).then(() => {
          item.remove();
          if (typeof showToast === 'function') showToast(tt('notif_cleared_one', 'Notification cleared'));
          if (!listEl.querySelector('[data-notif-row]')) repaint?.();
        });
      });
      if (typeof onLongPress === 'function') {
        onLongPress(item, () => openRowActions(n, repaint));
      } else {
        let tmr;
        item.addEventListener('touchstart', () => {
          tmr = setTimeout(() => openRowActions(n, repaint), 480);
        });
        item.addEventListener('touchend', () => clearTimeout(tmr));
      }
    });

    listEl.querySelector('[data-notif-more]')?.remove();
    if (hasMore) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn notif-view-more';
      more.setAttribute('data-notif-more', '1');
      more.textContent = tt('notif_view_more', 'Show all');
      more.addEventListener('click', () => onMore?.());
      listEl.appendChild(more);
    }
  }

  function attachInboxListener(limit) {
    if (typeof db === 'undefined' || !db || typeof currentUser === 'undefined' || !currentUser) return;
    if (typeof notifUnsub === 'function') {
      try {
        notifUnsub();
      } catch (e) {}
    }
    notifUnsub = null;
    notifLimit = limit || DEFAULT_LIMIT;
    const q = db
      .collection('notifications')
      .doc(currentUser.uid)
      .collection('items')
      .orderBy('updatedAt', 'desc')
      .limit(notifLimit);
    notifUnsub = q.onSnapshot(
      (snap) => {
        cloudNotifications = snap.docs.map(mapCloudDoc);
        notifHasMore = snap.size >= notifLimit && notifLimit < EXPANDED_LIMIT;
        syncNotificationsGlobal();
        updateSectionNotifDots();
        if (typeof panelRepaint === 'function') panelRepaint();
        if (!pruneOnce) {
          pruneOnce = true;
          apiNotif('notif_prune', {}).catch(() => {});
        }
      },
      (err) => {
        console.warn('[notif] inbox listen', err?.message || err);
      }
    );
  }

  function startNotifInbox() {
    pruneOnce = false;
    attachInboxListener(DEFAULT_LIMIT);
  }

  function stopNotifInbox() {
    if (typeof notifUnsub === 'function') {
      try {
        notifUnsub();
      } catch (e) {}
    }
    notifUnsub = null;
    cloudNotifications = [];
    syncNotificationsGlobal();
    updateSectionNotifDots();
  }

  function openNotificationPanel(section = 'all', { title } = {}) {
    if (typeof currentUser === 'undefined' || !currentUser) {
      if (typeof showToast === 'function') showToast(tt('notif_sign_in', 'Sign in to see notifications'));
      if (typeof showAuth === 'function') showAuth();
      return;
    }

    if (!notifUnsub) startNotifInbox();

    document.getElementById('notifPanelSheet')?.remove();
    const titles = {
      all: tt('notif_title_all', 'Notifications'),
      duniya: tt('notif_title_duniya', 'Duniya'),
      peepal: tt('notif_title_peepal', 'Peepal'),
      dangal: tt('notif_title_dangal', 'Dangal'),
      baithak: tt('notif_title_baithak', 'Baithak'),
      akhbaar: tt('notif_title_akhbaar', 'Akhbaar'),
    };
    const sheet = document.createElement('div');
    sheet.id = 'notifPanelSheet';
    sheet.className = 'archive-overlay notif-panel-sheet';
    sheet.setAttribute('data-nav-managed', '1');
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-overlay-dismiss aria-label="Back">←</button>
        <div style="flex:1"><strong>${title || titles[section] || titles.all}</strong></div>
        <button type="button" class="notif-clear-all" data-clear-all>${tt('notif_clear_all', 'Clear all')}</button>
      </div>
      <div class="notif-panel-toolbar">
        <button type="button" class="notif-mark-all" data-mark-all>${tt('notif_mark_all', 'Mark all read')}</button>
      </div>
      <div class="notif-panel-list" data-notif-panel-list></div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const closePanel = () => {
      panelRepaint = null;
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, closePanel);

    const listEl = sheet.querySelector('[data-notif-panel-list]');

    const paint = () => {
      const all = window.notifications || [];
      const filtered = filterBySection(all, section);
      renderPanelList(listEl, filtered, {
        section,
        hasMore: notifHasMore,
        onMore: () => {
          attachInboxListener(EXPANDED_LIMIT);
        },
        repaint: paint,
      });
    };
    panelRepaint = paint;

    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', closePanel);
    sheet.querySelector('[data-mark-all]')?.addEventListener('click', async () => {
      await markAllNotificationsRead(section);
      paint();
      if (typeof showToast === 'function') showToast(tt('notif_marked_read', 'Marked all as read'));
    });
    sheet.querySelector('[data-clear-all]')?.addEventListener('click', () => {
      clearSectionWithUndo(section, paint);
    });

    paint();
    apiNotif('notif_prune', {}).catch(() => {});
  }

  function wireTabNotificationButtons() {
    document.querySelectorAll('[data-open-notif]').forEach((btn) => {
      if (btn.dataset.notifWired) return;
      btn.dataset.notifWired = '1';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openNotificationPanel(btn.dataset.openNotif || 'all');
      });
    });
    updateSectionNotifDots();
  }

  /** Local-only ephemeral (breaking/system) — never writes Firestore. */
  function addLocalNotification(type, icon, text, extra) {
    let section = null;
    let deepLink = null;
    if (type && typeof type === 'object' && !Array.isArray(type)) {
      const o = type;
      type = o.type || 'info';
      icon = o.icon || '🔔';
      text = o.text || '';
      section = o.section || null;
      deepLink = o.deepLink || o.link || null;
    } else if (extra && typeof extra === 'object') {
      section = extra.section || null;
      deepLink = extra.deepLink || extra.link || null;
    }
    if (!section) section = inferSectionFromType(type);
    const n = {
      id: `local_${Date.now()}`,
      type,
      icon: icon || iconForType(type),
      text,
      time: 'now',
      ts: Date.now(),
      read: false,
      section: section || null,
      deepLink: deepLink || null,
      localOnly: true,
      actors: [],
      actorCount: 0,
    };
    localEphemeral.unshift(n);
    localEphemeral = localEphemeral.slice(0, 20);
    syncNotificationsGlobal();
    updateSectionNotifDots();
    if (typeof SoundLib !== 'undefined' && SoundLib.notification) SoundLib.notification();
    return n;
  }

  function inferSectionFromType(type) {
    const t0 = String(type || '').toLowerCase();
    for (const [sec, types] of Object.entries(SECTION_TYPES)) {
      if (sec === 'all' || !types) continue;
      if (types.some((x) => t0.includes(x))) return sec;
    }
    return null;
  }

  window.notifications = window.notifications || [];
  window.NOTIF_SECTION_TYPES = SECTION_TYPES;
  window.inferNotifSection = inferSectionFromType;
  window.openNotificationPanel = openNotificationPanel;
  window.wireTabNotificationButtons = wireTabNotificationButtons;
  window.updateSectionNotifDots = updateSectionNotifDots;
  window.markAllNotificationsRead = markAllNotificationsRead;
  window.markNotificationRead = markNotificationRead;
  window.filterNotificationsBySection = filterBySection;
  window.unreadNotifCount = unreadCount;
  window.notifSectionOf = notifSection;
  window.startNotifInbox = startNotifInbox;
  window.stopNotifInbox = stopNotifInbox;
  window.addLocalNotification = addLocalNotification;
  // Prefer local-only path; keep name for callers / notif-prefs gate
  window.addNotification = addLocalNotification;
  window.formatNotifBundledText = formatBundledText;

  Object.defineProperty(window, 'notifHasMore', {
    get() {
      return notifHasMore;
    },
    configurable: true,
  });

  document.addEventListener('DOMContentLoaded', wireTabNotificationButtons);
  if (document.readyState !== 'loading') setTimeout(wireTabNotificationButtons, 0);
})();
