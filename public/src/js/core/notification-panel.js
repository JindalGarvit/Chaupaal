/**
 * Shared notification panel — Profile inbox + per-tab double-tap sheets.
 * Cloud-backed bundles via onSnapshot; soft-clear = mark_read (Admin API).
 */
(function () {
  'use strict';

  const DEFAULT_LIMIT = 6;
  const EXPANDED_LIMIT = 60;
  const MAX_VISIBLE = 6;
  const MAX_READ_WHEN_UNREAD = 2;
  const CROSS_GROUP_WINDOW_MS = 86400000;

  const SECTION_LABELS = {
    baithak: 'Baithak',
    duniya: 'Duniya',
    peepal: 'Peepal',
    akhbaar: 'Akhbaar',
    dangal: 'Dangal',
    general: 'General',
  };

  /** type substring → tab section */
  const SECTION_TYPES = {
    baithak: ['baithak', 'message', 'dm', 'chat', 'group', 'story', 'friend', 'invite'],
    peepal: ['peepal', 'match', 'response', 'join', 'ask', 'discovery', 'mention', 'reply', 'reaction'],
    duniya: ['duniya', 'like', 'comment', 'follow', 'lehar', 'post', 'tag', 'collab'],
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
    return filterBySection(list, section).filter((n) => {
      if (n.read) return false;
      if (n.localOnly && String(n.type || '') === 'friend_request' && section === 'baithak') return true;
      if (n.localOnly) return false;
      return true;
    }).length;
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

  function notifDedupeKey(n) {
    const type = String(n?.type || '').toLowerCase();
    const refId = String(n?.refId || n?.deepLink?.uid || '').trim();
    if (!type) return `id::${n?.id || ''}`;
    if (!refId) return `${type}::${n?.id || ''}`;
    return `${type}::${refId}`;
  }

  function dedupeNotifications(items) {
    const byKey = new Map();
    (items || []).forEach((n) => {
      const key = notifDedupeKey(n);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, n);
        return;
      }
      if (existing.localOnly && !n.localOnly) {
        byKey.set(key, n);
        return;
      }
      if (!existing.localOnly && n.localOnly) return;
      if ((n.ts || 0) > (existing.ts || 0)) byKey.set(key, n);
    });
    return [...byKey.values()];
  }

  function crossTargetFamily(type) {
    const t = String(type || '').toLowerCase();
    if (t.includes('like') || t.includes('reaction') || t === 'story_like') return 'like';
    if (t.includes('comment') || t.includes('reply') || t === 'story_comment') return 'comment';
    if (t === 'follow' || (t.includes('follow') && !t.includes('friend'))) return 'follow';
    return null;
  }

  function groupCrossTargetBundles(items, { windowMs = CROSS_GROUP_WINDOW_MS } = {}) {
    const now = Date.now();
    const kept = [];
    const byFamily = new Map();

    (items || []).forEach((n) => {
      const family = crossTargetFamily(n.type);
      const candidate = family && !n.read && now - (n.ts || 0) <= windowMs;
      if (!candidate) {
        kept.push(n);
        return;
      }
      if (!byFamily.has(family)) byFamily.set(family, []);
      byFamily.get(family).push(n);
    });

    byFamily.forEach((group, family) => {
      const distinctRefs = new Set(
        group.map((n) => String(n.refId || n.deepLink?.postId || '').trim()).filter(Boolean)
      );
      if (group.length < 2 || distinctRefs.size < 2) {
        kept.push(...group);
        return;
      }
      const sorted = [...group].sort((a, b) => (b.ts || 0) - (a.ts || 0));
      let totalActors = 0;
      const actors = [];
      const sourceIds = [];
      sorted.forEach((n) => {
        sourceIds.push(n.id);
        totalActors += Math.max(1, Number(n.actorCount) || (n.actors || []).length || 1);
        (n.actors || []).forEach((a) => {
          if (a?.uid && !actors.some((x) => x.uid === a.uid)) actors.push(a);
        });
      });
      const primary = sorted[0];
      kept.push({
        ...primary,
        id: `group_${family}_${primary.ts || Date.now()}`,
        grouped: true,
        groupFamily: family,
        sourceIds,
        actorCount: totalActors,
        actors: actors.slice(0, 8),
        ts: primary.ts,
        read: sorted.some((n) => !n.read) ? false : true,
      });
    });

    return kept.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  function sectionDisplayLabel(n) {
    const sec = notifSection(n);
    if (sec === 'all' || !SECTION_LABELS[sec]) return SECTION_LABELS.general;
    return SECTION_LABELS[sec];
  }

  function sectionPillAccent(n) {
    const sec = notifSection(n);
    return sec === 'all' || !SECTION_LABELS[sec] ? 'general' : sec;
  }

  function prepareAllInboxItems(items) {
    return groupCrossTargetBundles(dedupeNotifications((items || []).filter((n) => !isTypeMuted(n))));
  }

  function notificationIdsFor(n) {
    if (!n) return [];
    if (n.grouped && Array.isArray(n.sourceIds) && n.sourceIds.length) return n.sourceIds;
    return [n.id].filter(Boolean);
  }

  async function dismissNotificationsByRef({ type, refId }) {
    const ty = String(type || '').toLowerCase();
    const ref = String(refId || '').trim();
    if (!ty || !ref) return;
    const ids = new Set();
    cloudNotifications.forEach((n) => {
      if (String(n.type || '').toLowerCase() === ty && String(n.refId || n.deepLink?.uid || '') === ref) {
        ids.add(n.id);
      }
    });
    localEphemeral.forEach((n) => {
      if (String(n.type || '').toLowerCase() === ty && String(n.refId || n.deepLink?.uid || '') === ref) {
        ids.add(n.id);
      }
    });
    if (ty === 'friend_request') ids.add(`friend_request_local_${ref}`);
    localEphemeral = localEphemeral.filter(
      (n) =>
        !(
          String(n.type || '').toLowerCase() === ty &&
          (String(n.refId || n.deepLink?.uid || '') === ref || n.id === `friend_request_local_${ref}`)
        )
    );
    syncNotificationsGlobal();
    await softClearIds([...ids]);
    updateSectionNotifDots();
    if (typeof panelRepaint === 'function') panelRepaint();
    if (typeof mountBaithakFriendRequests === 'function') mountBaithakFriendRequests();
  }

  function playPanelOpenSound(section) {
    try {
      if (typeof quietMode !== 'undefined' && quietMode) return;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
      if (section === 'all') {
        if (typeof SoundLib !== 'undefined' && SoundLib.tap) SoundLib.tap();
      } else if (typeof SoundLib !== 'undefined' && SoundLib.element) {
        SoundLib.element(section, 'open');
      }
    } catch (e) {}
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
    const family = n.grouped ? n.groupFamily : crossTargetFamily(type);

    if (n.grouped && family === 'like') {
      return others
        ? tt(
            'notif_group_like_posts',
            '<strong>{{actor}}</strong> and {{n}} others liked your posts',
            { actor: escapeHtml(actor), n: String(others) }
          )
        : tt('notif_bundle_like', '<strong>{{actor}}</strong> liked your post', { actor: escapeHtml(actor) });
    }
    if (n.grouped && family === 'comment') {
      return others
        ? tt(
            'notif_group_comment_posts',
            '<strong>{{actor}}</strong> and {{n}} others commented on your posts',
            { actor: escapeHtml(actor), n: String(others) }
          )
        : tt('notif_bundle_comment', '<strong>{{actor}}</strong> commented{{preview}}', {
            actor: escapeHtml(actor),
            preview: preview ? `: ${escapeHtml(preview.slice(0, 80))}` : '',
          });
    }
    if (n.grouped && family === 'follow') {
      return others
        ? tt(
            'notif_group_follow_many',
            '<strong>{{actor}}</strong> and {{n}} others started following you',
            { actor: escapeHtml(actor), n: String(others) }
          )
        : tt('notif_bundle_follow', '<strong>{{actor}}</strong> started following you', { actor: escapeHtml(actor) });
    }

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
    const action = String(n.action || link.action || '').toLowerCase();
    try {
      // Friend event notifs → Baithak with rotating prefill (same as Surkhiya)
      if (
        action === 'wish_friend' ||
        action === 'open_friend_dm' ||
        type.includes('friend_birthday') ||
        type.includes('akhbaar_friend')
      ) {
        const uid = n.friendUid || link.uid || n.refId || '';
        const name = n.friendName || link.name || n.title || 'Friend';
        const prefill = n.prefill || n.meta?.prefill || link.prefill || '';
        if (typeof openBaithakWithPrefill === 'function' && uid) {
          openBaithakWithPrefill({
            uid,
            name,
            type: type.includes('birthday') || action === 'wish_friend' ? 'birthday' : 'friend_update',
            prefill,
          });
          return;
        }
      }
      if (type.includes('mehfil') && link.chatId && typeof openChatById === 'function') {
        openChatById(link.chatId, { mehfil: true });
        return;
      }
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
      if (link.path && String(link.path).startsWith('/post/') && typeof navigateToDeepLink === 'function') {
        navigateToDeepLink(link.path);
        return;
      }
      if ((type.includes('collab') || type === 'mention' || type === 'tag') && (link.postId || n.refId) && typeof navigateToDeepLink === 'function') {
        navigateToDeepLink(`/post/${link.postId || n.refId}`);
        return;
      }
      if (link.storyId) {
        if (typeof DuniyaStory !== 'undefined' && DuniyaStory.openById && (link.destination === 'duniya' || link.section === 'duniya')) {
          DuniyaStory.openById(link.storyId);
          return;
        }
        document.querySelector('.tab-btn[data-tab="duniya"]')?.click();
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

  function hapticPulse(kind) {
    try {
      if (typeof quietMode !== 'undefined' && quietMode) return;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
      const prefs = typeof PushPrefs !== 'undefined' ? PushPrefs.loadPrefs?.() : null;
      if (prefs && prefs.haptics === false) return;
      if (typeof Haptic !== 'undefined') {
        if (kind === 'more' && Haptic.success) Haptic.success();
        else if (kind === 'less' && Haptic.warn) Haptic.warn();
        else if (Haptic.tap) Haptic.tap();
      } else if (navigator.vibrate) {
        navigator.vibrate(kind === 'more' ? [8, 30, 8] : [18]);
      }
    } catch (e) {}
  }

  /**
   * Phase 4: swipe left = Show less (−freq, red), right = Show more (+freq, green).
   * Threshold ~40% of row width; spring-back otherwise. Still supports far-left clear.
   */
  function bindSwipeClear(row, onClear) {
    let startX = 0;
    let dx = 0;
    let tracking = false;
    let width = 280;

    const underlay = document.createElement('div');
    underlay.className = 'notif-swipe-underlay';
    underlay.innerHTML =
      '<span class="notif-swipe-less">Show less</span><span class="notif-swipe-more">Show more</span>';
    row.style.position = 'relative';
    if (!row.querySelector('.notif-swipe-underlay')) {
      row.insertBefore(underlay, row.firstChild);
    }

    row.addEventListener(
      'touchstart',
      (e) => {
        startX = e.touches[0].clientX;
        dx = 0;
        tracking = true;
        width = row.offsetWidth || 280;
        row.classList.add('is-swiping');
      },
      { passive: true }
    );
    row.addEventListener(
      'touchmove',
      (e) => {
        if (!tracking) return;
        dx = e.touches[0].clientX - startX;
        const capped = Math.max(-width * 0.55, Math.min(width * 0.55, dx));
        row.style.transform = `translateX(${capped}px)`;
        row.classList.toggle('is-swipe-less', capped < -8);
        row.classList.toggle('is-swipe-more', capped > 8);
      },
      { passive: true }
    );
    row.addEventListener('touchend', () => {
      tracking = false;
      row.classList.remove('is-swiping');
      const threshold = width * 0.4;
      const reduce =
        typeof quietMode !== 'undefined' && quietMode
          ? true
          : !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

      const springBack = () => {
        if (reduce) {
          row.style.transform = '';
          row.classList.remove('is-swipe-less', 'is-swipe-more');
          return;
        }
        row.style.transition = 'transform 280ms cubic-bezier(.34,1.4,.64,1)';
        row.style.transform = 'translateX(0)';
        setTimeout(() => {
          row.style.transition = '';
          row.classList.remove('is-swipe-less', 'is-swipe-more');
        }, 300);
      };

      if (dx <= -threshold) {
        hapticPulse('less');
        try {
          PushPrefs?.showLess?.();
        } catch (e) {}
        if (typeof showToast === 'function') {
          showToast(tt('notif_show_less', 'Got it — fewer like this'));
        }
        // Far swipe still clears
        if (dx < -Math.min(120, width * 0.5) && typeof onClear === 'function') {
          onClear();
        } else {
          springBack();
        }
      } else if (dx >= threshold) {
        hapticPulse('more');
        try {
          PushPrefs?.showMore?.();
        } catch (e) {}
        if (typeof showToast === 'function') {
          showToast(tt('notif_show_more', 'We’ll share a bit more'));
        }
        springBack();
      } else {
        springBack();
      }
      dx = 0;
    });
  }

  function openRowActions(n, repaint) {
    const actions = [
      {
        label: tt('notif_action_clear', 'Clear'),
        icon: 'trash',
        danger: true,
        fn: () => {
          softClearIds(notificationIdsFor(n)).then(() => {
            repaint();
            if (typeof showToast === 'function') showToast(tt('notif_cleared_one', 'Notification cleared'));
          });
        },
      },
      {
        label: tt('notif_action_mute_type', 'Hide this type'),
        icon: 'bell-off',
        fn: () => {
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
        icon: 'check',
        fn: async () => {
          await Promise.all(notificationIdsFor(n).map((id) => markNotificationRead(id)));
          repaint();
        },
      },
    ];
    if (typeof showActionSheet === 'function') {
      showActionSheet(tt('notif_actions_title', 'Notification'), actions);
    } else {
      actions[0].fn();
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
      await dismissNotificationsByRef({ type: 'friend_request', refId: targetUid });
      if (typeof mergePendingFriendRequests === 'function') mergePendingFriendRequests();
      else if (typeof mountBaithakFriendRequests === 'function') mountBaithakFriendRequests();
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

  function prioritizeVisible(items) {
    const list = (items || []).filter((n) => !isTypeMuted(n));
    const unread = list.filter((n) => !n.read);
    const read = list.filter((n) => n.read);
    unread.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    read.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (!unread.length) return read.slice(0, MAX_VISIBLE);
    const unreadTake = unread.slice(0, MAX_VISIBLE);
    const room = Math.max(0, MAX_VISIBLE - unreadTake.length);
    const readCap = Math.min(MAX_READ_WHEN_UNREAD, room);
    return [...unreadTake, ...read.slice(0, readCap)];
  }

  function renderPanelList(listEl, items, { hasMore, onMore, section, repaint, inboxMode } = {}) {
    if (!listEl) return;
    const isAllInbox = section === 'all' || inboxMode === 'all';
    const visible = isAllInbox ? prepareAllInboxItems(items) : prioritizeVisible(items);
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
                    <span class="notif-actor-av">${typeof renderUserAvatarHtml==='function'?renderUserAvatarHtml(a,{decorative:true}):escapeHtml(a.avatar||'👤')}</span>
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
            <button type="button" class="notif-friend-decline" data-friend-decline aria-label="${tt('notif_decline', 'Decline')}">${typeof iconHtml==='function'?iconHtml('x',{size:18}):'×'}</button>
          </div>`
            : '';
        const sectionPill = isAllInbox
          ? `<span class="notif-section-pill" data-section="${escapeHtml(sectionPillAccent(n))}">${escapeHtml(sectionDisplayLabel(n))}</span>`
          : '';
        return `<div class="notif-item ${n.read ? 'is-read' : 'unread'}" data-id="${n.id}" data-notif-row>
          <div class="notif-icon">${n.icon || '🔔'}</div>
          <div class="notif-body">
            <div class="notif-text-row">${text}${expand}</div>
            ${actorsHtml}
            ${friendActions}
            <div class="notif-meta-row">${sectionPill}<div class="notif-time">${when}</div></div>
          </div>
          ${n.read ? '' : '<span class="notif-unread-pip" aria-hidden="true"></span>'}
        </div>`;
      })
      .join('');

    listEl.querySelectorAll('[data-notif-row]').forEach((item) => {
      const n = visible.find((x) => x.id === item.dataset.id);
      if (!n) return;
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
        try {
          PushPrefs?.recordEngagement?.('open');
        } catch (err) {}
        if (n.grouped && n.sourceIds?.length) {
          await Promise.all(n.sourceIds.map((id) => markNotificationRead(id)));
        } else {
          await markNotificationRead(item.dataset.id);
        }
        item.classList.remove('unread');
        item.classList.add('is-read');
        item.querySelector('.notif-unread-pip')?.remove();
        deepLinkNotification(n);
      });
      bindSwipeClear(item, () => {
        softClearIds(notificationIdsFor(n)).then(() => {
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
    if (hasMore && isAllInbox) {
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
        mergePendingFriendRequests();
        if (typeof panelRepaint === 'function') panelRepaint();
        if (!pruneOnce) {
          pruneOnce = true;
          apiNotif('notif_prune', {}).catch(() => {});
        }
      },
      (err) => {
        console.warn('[notif] inbox listen', err?.message || err);
        mergePendingFriendRequests();
      }
    );
    mergePendingFriendRequests();
  }

  async function mergePendingFriendRequests() {
    if (typeof apiFetch !== 'function' || typeof currentUser === 'undefined' || !currentUser) return;
    try {
      const envelope = await apiFetch('/api/relationships', {
        method: 'POST',
        needAuth: true,
        body: { action: 'list_friend_requests' },
      });
      const profiles = envelope?.ok ? envelope.data?.profiles || [] : [];
      window.pendingFriendRequestCount = profiles.length;

      localEphemeral = localEphemeral.filter((n) => !String(n.id || '').startsWith('friend_request_local_'));

      const apiUids = new Set(profiles.map((p) => p.uid).filter(Boolean));
      profiles.forEach((p) => {
        const uid = p.uid;
        if (!uid) return;
        const cloudUnread = cloudNotifications.find(
          (n) =>
            String(n.type || '') === 'friend_request' &&
            (n.refId === uid || n.deepLink?.uid === uid) &&
            !n.read
        );
        if (cloudUnread) return;
        localEphemeral.unshift({
          id: `friend_request_local_${uid}`,
          type: 'friend_request',
          refId: uid,
          icon: iconForType('friend_request'),
          text: null,
          time: 'now',
          ts: Date.now(),
          read: false,
          section: 'baithak',
          deepLink: { uid },
          localOnly: true,
          actors: [
            {
              uid,
              name:
                (typeof resolvePersonDisplayName === 'function'
                  ? resolvePersonDisplayName(p)
                  : p.name || (p.username ? `@${p.username}` : 'Someone')),
              photoURL: p.photoURL || '',
            },
          ],
          actorCount: 1,
        });
      });

      localEphemeral = localEphemeral.filter((n) => {
        if (!String(n.id || '').startsWith('friend_request_local_')) return true;
        const uid = n.refId || n.deepLink?.uid;
        return uid && apiUids.has(uid);
      });

      localEphemeral = localEphemeral.slice(0, 20);
      syncNotificationsGlobal();
      updateSectionNotifDots();
      if (typeof panelRepaint === 'function') panelRepaint();
      if (typeof mountBaithakFriendRequests === 'function') mountBaithakFriendRequests();
    } catch (e) {}
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

    const isAllInbox = section === 'all';
    if (!notifUnsub) {
      if (isAllInbox) attachInboxListener(EXPANDED_LIMIT);
      else startNotifInbox();
    } else if (isAllInbox && notifLimit < EXPANDED_LIMIT) {
      attachInboxListener(EXPANDED_LIMIT);
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
    const accent = isAllInbox ? 'general' : section;
    const sheet = document.createElement('div');
    sheet.id = 'notifPanelSheet';
    sheet.className = 'archive-overlay notif-panel-sheet is-opening';
    sheet.setAttribute('data-nav-managed', '1');
    sheet.setAttribute('data-tab-accent', accent);
    if (isAllInbox) sheet.setAttribute('data-inbox-mode', 'all');
    sheet.setAttribute('data-sheet-panel', '1');
    const headerTitle = title || titles[section] || titles.all;
    const tabMark =
      !isAllInbox && typeof TabElements !== 'undefined' && TabElements.markHtml
        ? TabElements.markHtml(section, 22)
        : '';
    sheet.innerHTML = `
      <div class="notif-panel-grabber" aria-hidden="true"></div>
      <div class="archive-header notif-panel-header">
        <div class="notif-panel-title-row">
          ${tabMark ? `<span class="notif-panel-tab-mark" aria-hidden="true">${tabMark}</span>` : ''}
          <strong>${headerTitle}</strong>
        </div>
        <button type="button" class="notif-clear-all" data-clear-all>${tt('notif_clear_all', 'Clear all')}</button>
      </div>
      <div class="notif-panel-toolbar">
        <button type="button" class="notif-mark-all" data-mark-all>${tt('notif_mark_all', 'Mark all read')}</button>
      </div>
      <div class="notif-panel-list" data-notif-panel-list>
        <div class="notif-panel-loading">${tt('notif_loading', 'Loading notifications…')}</div>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    if (!isAllInbox && typeof TabElements !== 'undefined' && TabElements.mountMarks) {
      TabElements.mountMarks(sheet);
    }

    const closePanel = () => {
      panelRepaint = null;
      document.removeEventListener('pointerdown', onOutside, true);
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    const onOutside = (e) => {
      if (!sheet.isConnected) return;
      if (sheet.contains(e.target)) return;
      closePanel();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, closePanel);
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);

    try {
      if (typeof enableSwipeDismiss === 'function') {
        enableSwipeDismiss(sheet, closePanel);
      } else if (typeof window.enableSwipeDismiss === 'function') {
        window.enableSwipeDismiss(sheet, closePanel);
      }
    } catch (e) {}

    const listEl = sheet.querySelector('[data-notif-panel-list]');

    const paint = () => {
      const all = window.notifications || [];
      const filtered = filterBySection(all, section);
      renderPanelList(listEl, filtered, {
        section,
        inboxMode: isAllInbox ? 'all' : section,
        hasMore: isAllInbox && notifHasMore,
        onMore: () => {
          attachInboxListener(EXPANDED_LIMIT);
        },
        repaint: paint,
      });
    };
    panelRepaint = paint;

    sheet.querySelector('[data-mark-all]')?.addEventListener('click', async () => {
      await markAllNotificationsRead(section);
      paint();
      if (typeof showToast === 'function') showToast(tt('notif_marked_read', 'Marked all as read'));
    });
    sheet.querySelector('[data-clear-all]')?.addEventListener('click', () => {
      clearSectionWithUndo(section, paint);
    });

    mergePendingFriendRequests().finally(() => paint());
    apiNotif('notif_prune', {}).catch(() => {});
    try {
      if (typeof Micro !== 'undefined' && Micro.haptic) Micro.haptic('medium');
      playPanelOpenSound(section);
    } catch (e) {}
    setTimeout(() => sheet.classList.remove('is-opening'), 400);
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
      id: (extra && extra.id) || `local_${Date.now()}`,
      type,
      refId: (extra && (extra.refId || extra.uid)) || '',
      icon: icon || iconForType(type),
      text,
      time: 'now',
      ts: Date.now(),
      read: false,
      section: section || null,
      deepLink: deepLink || (extra && extra.uid ? { uid: extra.uid } : null),
      localOnly: true,
      actors: (extra && extra.actors) || [],
      actorCount: (extra && extra.actorCount) || ((extra && extra.actors) || []).length || 0,
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
  window.mergePendingFriendRequests = mergePendingFriendRequests;
  window.dismissNotificationsByRef = dismissNotificationsByRef;
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

  document.addEventListener('chaupaal:relationship-changed', () => {
    mergePendingFriendRequests();
  });
})();
