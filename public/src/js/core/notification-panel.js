/**
 * Shared notification panel — used by Duniya / Peepal / Dangal tab icons
 * and the aggregate icon on own profile. Paginated, mark-read, deep-links.
 */
(function () {
  'use strict';

  const SECTION_TYPES = {
    duniya: ['duniya', 'like', 'comment', 'follow', 'lehar', 'post'],
    peepal: ['peepal', 'match', 'response', 'join', 'ask', 'discovery'],
    dangal: ['dangal', 'duel', 'muqabala', 'game', 'invite', 'turn', 'result', 'challenge'],
    all: null,
  };

  function notifSection(n) {
    if (n.section) return String(n.section).toLowerCase();
    const t = String(n.type || '').toLowerCase();
    for (const [sec, types] of Object.entries(SECTION_TYPES)) {
      if (sec === 'all' || !types) continue;
      if (types.some((x) => t.includes(x))) return sec;
    }
    return 'all';
  }

  function filterBySection(list, section) {
    if (!section || section === 'all') return list;
    const types = SECTION_TYPES[section];
    return list.filter((n) => {
      const s = notifSection(n);
      if (s === section) return true;
      if (!types) return true;
      const t = String(n.type || '').toLowerCase();
      return types.some((x) => t.includes(x) || s.includes(x));
    });
  }

  function unreadCount(section) {
    const list = typeof notifications !== 'undefined' ? notifications : [];
    return filterBySection(list, section).filter((n) => !n.read).length;
  }

  function updateSectionNotifDots() {
    ['duniya', 'peepal', 'dangal', 'all'].forEach((sec) => {
      const count = unreadCount(sec);
      document.querySelectorAll(`[data-notif-dot="${sec}"]`).forEach((dot) => {
        dot.classList.toggle('hidden', count === 0);
        if (count > 0) dot.setAttribute('data-count', String(Math.min(count, 99)));
      });
    });
    // Legacy top-bar dots — do NOT call updateNotifDot() (it calls us → stack overflow).
    const allUnread = unreadCount('all') > 0;
    document.getElementById('notifDot')?.classList.toggle('hidden', !allUnread);
    document.getElementById('notifDotDesktop')?.classList.toggle('hidden', !allUnread);
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
      let ops = 0;
      targets.forEach((n) => {
        const ref = db.collection('notifications').doc(currentUser.uid).collection('items').doc(n.id);
        batch.set(ref, { read: true }, { merge: true });
        ops += 1;
      });
      if (ops) await batch.commit().catch(() => {});
    }
    updateSectionNotifDots();
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
        if (link.collection === 'duniya') {
          document.querySelector('.tab-btn[data-tab="duniya"]')?.click();
          return;
        }
        if (link.collection === 'peepal') {
          document.querySelector('.tab-btn[data-tab="peepal"]')?.click();
          return;
        }
      }
      if (type.includes('duel') || type.includes('dangal') || type.includes('muqabala')) {
        document.querySelector('.tab-btn[data-tab="dangal"]')?.click();
        return;
      }
      if (type.includes('peepal') || type.includes('match')) {
        document.querySelector('.tab-btn[data-tab="peepal"]')?.click();
        return;
      }
      if (type.includes('duniya') || type.includes('like') || type.includes('comment')) {
        document.querySelector('.tab-btn[data-tab="duniya"]')?.click();
      }
    } catch (e) {
      /* ignore */
    }
  }

  function renderPanelList(listEl, items, { hasMore, onMore } = {}) {
    if (!listEl) return;
    if (!items.length) {
      if (typeof renderEmptyState === 'function') {
        renderEmptyState(listEl, {
          icon: '🔔',
          title: 'No notifications yet',
          message: 'Activity for this section will show up here.',
        });
      } else {
        listEl.innerHTML = '<div class="notif-empty">No notifications yet</div>';
      }
      return;
    }
    listEl.innerHTML = items
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
      item.addEventListener('click', async () => {
        const n = (typeof notifications !== 'undefined' ? notifications : []).find((x) => x.id === item.dataset.id);
        await markNotificationRead(item.dataset.id);
        item.classList.remove('unread');
        item.classList.add('is-read');
        item.querySelector('.notif-unread-pip')?.remove();
        deepLinkNotification(n);
      });
    });

    listEl.querySelector('[data-notif-more]')?.remove();
    if (hasMore) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn notif-view-more';
      more.setAttribute('data-notif-more', '1');
      more.textContent = 'View more';
      more.addEventListener('click', () => onMore?.());
      listEl.appendChild(more);
    }
  }

  function openNotificationPanel(section = 'all', { title } = {}) {
    document.getElementById('notifPanelSheet')?.remove();
    const titles = {
      all: 'Notifications',
      duniya: 'Duniya notifications',
      peepal: 'Peepal notifications',
      dangal: 'Dangal notifications',
    };
    const sheet = document.createElement('div');
    sheet.id = 'notifPanelSheet';
    sheet.className = 'archive-overlay notif-panel-sheet';
    sheet.setAttribute('data-nav-managed', '1');
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-overlay-dismiss aria-label="Back">←</button>
        <div style="flex:1"><strong>${title || titles[section] || 'Notifications'}</strong></div>
        <button type="button" class="notif-mark-all" data-mark-all>Mark all read</button>
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
      const hasMore =
        section === 'all'
          ? typeof notifHasMore !== 'undefined' && notifHasMore
          : !localCursorDone && filtered.length >= 20;
      renderPanelList(listEl, filtered.slice(0, Math.max(filtered.length, 20)), {
        hasMore: section === 'all' ? !!hasMore : filtered.length > 20 && !localCursorDone,
        onMore: async () => {
          if (section === 'all' && typeof loadNotificationsPage === 'function') {
            await loadNotificationsPage({ reset: false });
            paint();
          } else {
            localCursorDone = true;
            paint();
          }
        },
      });
    };

    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', closePanel);
    sheet.querySelector('[data-mark-all]')?.addEventListener('click', async () => {
      await markAllNotificationsRead(section);
      paint();
      if (typeof showToast === 'function') showToast('Marked all as read');
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

  // Patch addNotification to accept section + deepLink when called as object
  const _add = typeof window.addNotification === 'function' ? null : null;
  window.openNotificationPanel = openNotificationPanel;
  window.wireTabNotificationButtons = wireTabNotificationButtons;
  window.updateSectionNotifDots = updateSectionNotifDots;
  window.markAllNotificationsRead = markAllNotificationsRead;
  window.markNotificationRead = markNotificationRead;
  window.filterNotificationsBySection = filterBySection;
  window.unreadNotifCount = unreadCount;

  document.addEventListener('DOMContentLoaded', wireTabNotificationButtons);
  if (document.readyState !== 'loading') setTimeout(wireTabNotificationButtons, 0);
})();
