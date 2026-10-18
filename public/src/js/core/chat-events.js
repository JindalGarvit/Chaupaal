/**
 * Chat system events + app-written labels, rendered in the VIEWER's language (Global L3).
 *
 * System event message (chats/{id}/messages):
 *   { uid: actorUid, name, avatar, text: <English sentence — legacy clients show this>,
 *     sys: { v: 1, type, actorUid, targetUids: [], names: { uid: displayName }, params: {} }, ts }
 * Chat doc (best-effort, when rules allow): previewSys = sys, previewSysAt = lastMessageAt — the list
 * renders it only while previewSysAt still equals lastMessageAt (any later message wins).
 * Messages without `sys` are legacy / normal text and render exactly as stored.
 *
 * App-written labels ("📷 Photo", "Sent a story", "Group created", location labels) are stored in
 * canonical English (tEn) and recognised against chat.auto.* so every reader — and every OLD message —
 * shows them in the reader's language.
 */
(function () {
  'use strict';

  /** type → which fields it carries. names/params are user content (never translated). */
  const SYS_TYPES = {
    group_created: { params: ['name'] },
    member_added: { targets: true },
    member_removed: { targets: true },
    member_left: {},
    member_joined: {},
    group_renamed: { params: ['name'] },
    group_photo_changed: {},
    group_description_changed: {},
    admin_added: { targets: true },
    admin_removed: { targets: true },
  };

  const str = (v, max) => String(v == null ? '' : v).slice(0, max || 120);

  /** Validated, size-capped copy of an event (drops unknown types / fields). */
  function cleanSys(raw) {
    if (!raw || typeof raw !== 'object' || !SYS_TYPES[raw.type]) return null;
    const spec = SYS_TYPES[raw.type];
    const targetUids = spec.targets && Array.isArray(raw.targetUids) ? raw.targetUids.map((u) => str(u, 128)).filter(Boolean).slice(0, 20) : [];
    const names = {};
    const wanted = [raw.actorUid, ...targetUids].filter(Boolean);
    wanted.forEach((u) => {
      if (raw.names && raw.names[u] != null) names[u] = str(raw.names[u], 80);
    });
    const params = {};
    (spec.params || []).forEach((k) => {
      if (raw.params && raw.params[k] != null) params[k] = str(raw.params[k], 120);
    });
    return { v: 1, type: raw.type, actorUid: str(raw.actorUid, 128), targetUids, names, params };
  }

  function nameOf(uid, sys, profiles) {
    const live = profiles && profiles[uid] && profiles[uid].name;
    return live || (sys.names && sys.names[uid]) || t('common.someone');
  }

  /** ICU params: who = actor | target | other (viewer-relative), names isolated for RTL. */
  function sysParams(sys, ctx, english) {
    const c = ctx || {};
    const viewer = english ? '' : c.viewerUid || (typeof currentUser !== 'undefined' && currentUser ? currentUser.uid : '');
    const profiles = english ? null : c.memberProfiles || (window.currentOpenChat && window.currentOpenChat.memberProfiles) || null;
    const targets = sys.targetUids || [];
    const who = viewer && sys.actorUid === viewer ? 'actor' : viewer && targets.length === 1 && targets[0] === viewer ? 'target' : 'other';
    const plain = (uid) => (english ? (sys.names && sys.names[uid]) || tEn('common.someone') : nameOf(uid, sys, profiles));
    const p = {
      who,
      count: targets.length,
      actor: english ? plain(sys.actorUid) : bidi(plain(sys.actorUid)),
      target: english ? targets.map(plain).join(', ') : bidiList(targets.map(plain)),
    };
    Object.keys(sys.params || {}).forEach((k) => {
      p[k] = english ? sys.params[k] : bidi(sys.params[k]);
    });
    return p;
  }

  function renderSysHtml(sys, ctx) {
    const s = cleanSys(sys);
    return s ? tHtml('chat.sys.' + s.type, sysParams(s, ctx)) : '';
  }

  function renderSysText(sys, ctx) {
    const s = cleanSys(sys);
    return s ? t('chat.sys.' + s.type, sysParams(s, ctx)) : '';
  }

  /** The English sentence stored as `text` for clients that predate structured events. */
  function sysEnglish(sys) {
    const s = cleanSys(sys);
    return s ? tEn('chat.sys.' + s.type, sysParams(s, null, true)) : '';
  }

  /** App-written English label → viewer language; null when the text is user-written. */
  function autoText(text) {
    if (typeof i18nAutoLabelKey !== 'function') return null;
    const hit = i18nAutoLabelKey(text, 'chat.auto.');
    return hit ? t(hit.key, hit.params) : null;
  }

  /** Chat-list preview line (plain text): structured event → auto label → stored preview. */
  function chatPreviewText(chat, ctx) {
    if (!chat) return '';
    if (chat.previewSys && Number(chat.previewSysAt || 0) && Number(chat.previewSysAt) === Number(chat.lastMessageAt || 0)) {
      const line = renderSysText(chat.previewSys, Object.assign({ memberProfiles: chat.memberProfiles }, ctx || {}));
      if (line) return line;
    }
    const raw = String(chat.preview || chat.lastMessage || '');
    const auto = autoText(raw);
    return auto != null ? auto : raw;
  }

  /**
   * Write one event into a chat. The actor (current user) must still be a participant, so call this
   * BEFORE removing yourself and AFTER adding someone. Never throws (events are best-effort).
   */
  async function postChatSysEvent(chatId, type, data) {
    try {
      if (!chatId || typeof db === 'undefined' || !db || typeof currentUser === 'undefined' || !currentUser) return null;
      const d = data || {};
      const names = Object.assign({}, d.names || {});
      names[currentUser.uid] = names[currentUser.uid] || (typeof userProfile !== 'undefined' && userProfile?.name) || currentUser.displayName || tEn('common.someone');
      const sys = cleanSys({ type, actorUid: currentUser.uid, targetUids: d.targetUids || [], names, params: d.params || {} });
      if (!sys) return null;
      const text = sysEnglish(sys);
      const now = Date.now();
      const ref = await db.collection('chats').doc(chatId).collection('messages').add({
        uid: currentUser.uid,
        name: names[currentUser.uid],
        avatar: currentUser.photoURL || '',
        text,
        sys,
        ts: firebase.firestore.FieldValue.serverTimestamp(),
      });
      const chatRef = db.collection('chats').doc(chatId);
      await chatRef.set({ preview: text.slice(0, 120), lastMessageAt: now, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
      // Separate write: older deployed rules may not allow these keys yet — the preview above still lands.
      chatRef.set({ previewSys: sys, previewSysAt: now }, { merge: true }).catch(() => {});
      return ref.id;
    } catch (e) {
      console.warn('[chat-events]', type, e?.message || e);
      return null;
    }
  }

  window.ChatEvents = {
    SYS_TYPES,
    cleanSys,
    renderSysHtml,
    renderSysText,
    sysEnglish,
    autoText,
    chatPreviewText,
    postChatSysEvent,
  };
})();
