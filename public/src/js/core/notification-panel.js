/**
 * Shared notification panel — Profile inbox + per-tab double-tap sheets.
 * Swipe-to-clear, long-press actions, undo, clear-all, presence lights.
 */
(function () {
  'use strict';

  /** type substring → tab section */
  const SECTION_TYPES = {
    baithak: ['baithak', 'message', 'dm', 'chat', 'group', 'story', 'friend', 'invite'],
    peepal: ['peepal', 'match', 'response', 'join', 'ask', 'discovery', 'mention', 'reply'],
    duniya: ['duniya', 'like', 'comment', 'follow', 'lehar', 'post', 'tag'],
    akhbaar: ['akhbaar', 'quiz', 'streak', 'breaking', 'news', 'taaza'],
    dangal: ['dangal', 'duel', 'muqabala', 'game', 'invite', 'turn', 'result', 'challenge'],
    all: null,
  };

  function tt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
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
    const list = typeof notifications !== 'undefined' ? notifications : [];
    return filterBySection(list, section).filter((n) => !n.read).length;
  }

  function updateSectionNotifDots() {
    ['duniya', 'peepal', 'dangal', 'baithak', 'akhbaar', 'all'].forEach((sec) => {
      const count = unreadCount(sec);
      document.querySelectorAll(`[data-notif-dot="${sec}"]`).forEach((dot) => {
        dot.classList.toggle('hidden', count === 0);
        // Presence only — never show numbers
        dot.removeAttribute('data-count');
      });
    });
    if (typeof updateTabNotifLights === 'function') updateTabNotifLights();
  }

  async function markNotificationRead(id) {
    const list = typeof notifications !== 'undefined' ? notifications : [];
    const n = list.find((x) => x.id === id);
    if (n) n.read = true;
    if (typeof saveNotifications === 'function') saveNotifications();
    if (db && currentUser && id) {
      db.collection('notifications')
        .doc(currentUser.uid)
        .collection('items')
        .doc(id)
        .set({ read: true }, { merge: true })
        .catch(() => {});
    }
    updateSectionNotifDots();
  }

  async function markAllNotificationsRead(section) {
    const list = typeof notifications !== 'undefined' ? notifications : [];
    const targets = filterBySection(list, section || 'all').filter((n) => !n.read);
    targets.forEach((n) => {
      n.read = true;
    });
    if (typeof saveNotifications === 'function') saveNotifications();
    if (db && currentUser && targets.length) {
      const batch = db.batch();
      targets.forEach((n) => {
        const ref = db.collection('notifications').doc(currentUser.uid).collection('items').doc(n.id);
        batch.set(ref, { read: true }, { merge: true });
      });
      await batch.commit().catch(() => {});
    }
    updateSectionNotifDots();
  }

  function removeNotificationsByIds(ids, { persistRemote = true } = {}) {
    if (typeof notifications === 'undefined') return [];
    const idSet = new Set(ids);
    const removed = notifications.filter((n) => idSet.has(n.id));
    notifications = notifications.filter((n) => !idSet.has(n.id));
    if (typeof saveNotifications === 'function') saveNotifications();
    if (persistRemote && db && currentUser) {
      removed.forEach((n) => {
        db.collection('notifications')
          .doc(currentUser.uid)
          .collection('items')
          .doc(n.id)
          .delete()
          .catch(() => {});
      });
    }
    updateSectionNotifDots();
    return removed;
  }

  function restoreNotifications(items) {
    if (!items?.length || typeof notifications === 'undefined') return;
    const seen = new Set(notifications.map((n) => n.id));
    items.forEach((n) => {
      if (!seen.has(n.id)) notifications.unshift(n);
    });
    notifications.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (typeof saveNotifications === 'function') saveNotifications();
    if (db && currentUser) {
      items.forEach((n) => {
        db.collection('notifications')
          .doc(currentUser.uid)
          .collection('items')
          .doc(n.id)
          .set(
            {
              type: n.type,
              icon: n.icon,
              text: n.text,
              read: !!n.read,
              ts: n.ts || Date.now(),
              section: n.section || null,
              deepLink: n.deepLink || null,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
          .catch(() => {});
      });
    }
    updateSectionNotifDots();
  }

  function clearSectionWithUndo(section, repaint) {
    const list = typeof notifications !== 'undefined' ? notifications : [];
    const targets = filterBySection(list, section || 'all');
    if (!targets.length) return;
    const removed = removeNotificationsByIds(targets.map((n) => n.id));
    repaint?.();
    const undo = () => {
      restoreNotifications(removed);
      repaint?.();
    };
    if (typeof showUndoToast === 'function') {
      showUndoToast(tt('notif_cleared', 'Notifications cleared'), { onUndo: undo });
    } else if (typeof showToast === 'function') {
      showToast(tt('notif_cleared', 'Notifications cleared'));
    }
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
      if (link.uid && typeof openPublicProfile === 'function') {
        openPublicProfile({ uid: link.uid, username: link.username, name: link.name }, { uid: link.uid });
        return;
      }
      if (link.postId) {
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
      } else if (type.includes('baithak') || type.includes('message') || type.includes('dm')) {
        document.querySelector('.tab-btn[data-tab="baithak"]')?.click();
      } else if (type.includes('streak') || type.includes('akhbaar') || type.includes('breaking')) {
        document.querySelector('.tab-btn[data-tab="akhbaar"]')?.click();
      } else if (type.includes('duniya') || type.includes('like') || type.includes('comment')) {
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
          const removed = removeNotificationsByIds([n.id]);
          repaint();
          if (typeof showUndoToast === 'function') {
            showUndoToast(tt('notif_cleared_one', 'Notification cleared'), {
              onUndo: () => {
                restoreNotifications(removed);
                repaint();
              },
            });
          }
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
        const text =
          typeof linkifyText === 'function' ? linkifyText(n.text || '', { escape: true }) : n.text || '';
        return `<div class="notif-item ${n.read ? 'is-read' : 'unread'}" data-id="${n.id}" data-notif-row>
          <div class="notif-icon">${n.icon || '🔔'}</div>
          <div class="notif-body">
            <div class="notif-text">${text}</div>
            <div class="notif-time">${when}</div>
          </div>
          ${n.read ? '' : '<span class="notif-unread-pip" aria-hidden="true"></span>'}
        </div>`;
      })
      .join('');

    listEl.querySelectorAll('[data-notif-row]').forEach((item) => {
      const n = (typeof notifications !== 'undefined' ? notifications : []).find((x) => x.id === item.dataset.id);
      item.addEventListener('click', async () => {
        await markNotificationRead(item.dataset.id);
        item.classList.remove('unread');
        item.classList.add('is-read');
        item.querySelector('.notif-unread-pip')?.remove();
        deepLinkNotification(n);
      });
      bindSwipeClear(item, () => {
        const removed = removeNotificationsByIds([item.dataset.id]);
        item.remove();
        if (typeof showUndoToast === 'function') {
          showUndoToast(tt('notif_cleared_one', 'Notification cleared'), {
            onUndo: () => {
              restoreNotifications(removed);
              repaint?.();
            },
          });
        }
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
      more.textContent = tt('notif_view_more', 'View more');
      more.addEventListener('click', () => onMore?.());
      listEl.appendChild(more);
    }
  }

  function openNotificationPanel(section = 'all', { title } = {}) {
    if (typeof currentUser === 'undefined' || !currentUser) {
      if (typeof showToast === 'function') showToast(tt('notif_sign_in', 'Sign in to see notifications'));
      if (typeof showAuth === 'function') showAuth();
      return;
    }

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
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, closePanel);

    const listEl = sheet.querySelector('[data-notif-panel-list]');
    let localCursorDone = false;

    const paint = async ({ reset } = {}) => {
      if (reset && typeof loadNotificationsPage === 'function') {
        if (typeof renderSkeleton === 'function') renderSkeleton(listEl, { variant: 'list', count: 4 });
        await loadNotificationsPage({ reset: true });
      }
      const all = typeof notifications !== 'undefined' ? notifications : [];
      const filtered = filterBySection(all, section);
      renderPanelList(listEl, filtered, {
        section,
        hasMore: section === 'all' ? !!notifHasMore : filtered.length > 20 && !localCursorDone,
        onMore: async () => {
          if (section === 'all' && typeof loadNotificationsPage === 'function') {
            await loadNotificationsPage({ reset: false });
            paint();
          } else {
            localCursorDone = true;
            paint();
          }
        },
        repaint: () => paint(),
      });
    };

    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', closePanel);
    sheet.querySelector('[data-mark-all]')?.addEventListener('click', async () => {
      await markAllNotificationsRead(section);
      paint();
      if (typeof showToast === 'function') showToast(tt('notif_marked_read', 'Marked all as read'));
    });
    sheet.querySelector('[data-clear-all]')?.addEventListener('click', () => {
      clearSectionWithUndo(section, () => paint());
    });

    paint({ reset: true });
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

  /** Infer section when writers omit it. */
  function inferSectionFromType(type) {
    const t0 = String(type || '').toLowerCase();
    for (const [sec, types] of Object.entries(SECTION_TYPES)) {
      if (sec === 'all' || !types) continue;
      if (types.some((x) => t0.includes(x))) return sec;
    }
    return null;
  }

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

  document.addEventListener('DOMContentLoaded', wireTabNotificationButtons);
  if (document.readyState !== 'loading') setTimeout(wireTabNotificationButtons, 0);
})();
