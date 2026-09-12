/**
 * Mehfil — always-on in-chat voice/video room (Discord/Teams-like).
 * One persistent room per chat. Mic ON / cam OFF on join.
 * Agora via /api/media-config agora_token; media sync via RTDB mehfil/{chatId}.
 * Overlay is shell-contained; leave always goes through nav-stack / openLayer.
 * Feature flag: mehfil (default on). Unavailable in self-chat + Chaupaal AI chat.
 */
(function () {
  'use strict';

  const AGORA_CDN = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.20.2.js';
  const YT_API = 'https://www.youtube.com/iframe_api';
  const REACTIONS = ['🔥', '👏', '😂', '❤️', '😮', '🎉', '👍', '🙏'];
  const STICKERS = ['🏠', '☕', '🏏', '🎵', '🌧️', '✨', '🪷', '🪔'];
  const SPEAK_ON_LEVEL = 15;
  const SPEAK_OFF_LEVEL = 8;
  const MUTED_NUDGE_LEVEL = 25;
  const MUTED_NUDGE_COOLDOWN_MS = 12000;
  const RECONNECT_FAIL_MAX = 4;
  const TOKEN_RENEW_LEAD_MS = 5 * 60 * 1000;
  const CHROME_DIM_MS = 4000;
  const YT_RESYNC_MS = 5000;
  const PREF_KEY = 'chaupaal_mehfil_prefs';

  let client = null;
  let localAudio = null;
  let localVideo = null;
  let localScreen = null;
  let localUid = null;
  let camWanted = false;
  let micWanted = true;
  let activeChatId = null;
  let activeChat = null;
  let rtdbUnsubs = [];
  let ytPlayer = null;
  let applyingRemoteMedia = false;
  let overlayEl = null;
  let layerHandle = null;
  let chromeTimer = null;
  let ytResyncTimer = null;
  let leaving = false;
  let joinGeneration = 0;
  const YT_REC_QUERY = 'lofi chill';
  const RING_TTL_MS = 40000;
  const RING_COOLDOWN_MS = 15000;
  const RING_FANOUT_MAX = 20;
  /** Heartbeat every 10s; freshness 25s so a backgrounded tab doesn’t flicker (2.5× beat). */
  const PRESENCE_HEARTBEAT_MS = 10000;
  const PRESENCE_FRESH_MS = 25000;
  const THEME_OVERRIDE_KEY = 'chaupaal_mehfil_theme_override';
  const CHAT_IDLE_COLLAPSE_MS = 3000;
  let lastRingAt = new Map();
  let ringInboxUnsub = null;
  let incomingRingEl = null;
  let incomingRingClose = null;
  let ringAckUnsubs = [];
  const presenceWatchers = new Map();
  const presenceUnsubs = new Map();
  let chatIdleTimer = null;
  let chatUnread = 0;
  let cachedMediaState = null;
  let mehfilAutoJoinPending = null;
  let ringUiTimer = null;
  let lastKnownFreshCount = 0;
  let dmAutoRingDone = false;
  /** full | listen | none — A/V capability after join. */
  let avMode = 'none';
  let tokenExpiresAtSec = 0;
  let tokenRenewTimer = null;
  let reconnectFailCount = 0;
  let lastMutedNudgeAt = 0;
  let speakingCueTimer = null;
  let lastSpeakingLabel = '';
  const speakingSticky = new Map();
  const mutedByUid = new Map();
  let deviceListenerBound = false;
  let musicPausedForMehfil = false;

  /** Solo waiter label — never “Live” with one person. */
  const MEHFIL_WAITING_LABEL = 'Waiting in Mehfil';
  const RING_TRACE_NO_ANSWER = 'Mehfil ring · no answer';
  const RING_TRACE_DECLINED = 'Mehfil ring · declined';

  function isFreshParticipant(meta, now) {
    if (!meta || typeof meta !== 'object') return false;
    if (String(meta.state || '') !== 'in_room') return false;
    const at = Number(meta.at || 0);
    if (!at) return false;
    return now - at < PRESENCE_FRESH_MS;
  }

  /**
   * Single source of truth for Mehfil Live (2B).
   * isLive = freshCount >= 2 (includes viewer when they are in the room / fresh).
   */
  function mehfilLiveState(participants, opts) {
    const o = opts || {};
    const now = Number(o.now) || Date.now();
    const me = o.viewerUid != null ? String(o.viewerUid) : String(currentUser?.uid || '');
    const val = participants && typeof participants === 'object' ? participants : {};
    const fresh = [];
    const stale = [];
    Object.entries(val).forEach(([uid, meta]) => {
      if (!uid) return;
      if (isFreshParticipant(meta, now)) fresh.push([uid, meta]);
      else stale.push([uid, meta]);
    });
    const others = fresh.filter(([uid]) => uid !== me);
    const count = fresh.length;
    const isLive = count >= 2;
    return {
      count,
      others: others.map(([u]) => u),
      othersCount: others.length,
      isLive,
      live: isLive,
      totalCount: count,
      uids: others.map(([u]) => u),
      allUids: Object.keys(val),
      freshUids: fresh.map(([u]) => u),
      participants: val,
      staleUids: stale.map(([u]) => u),
      label: isLive ? (count > 2 ? `Live · ${count}` : 'Live') : count === 1 ? MEHFIL_WAITING_LABEL : '',
      waiting: !isLive && count === 1,
    };
  }

  /** Best-effort prune of stale participant nodes (client). */
  function pruneStaleParticipants(chatId, staleUids) {
    if (!chatId || !staleUids || !staleUids.length) return;
    staleUids.slice(0, 12).forEach((uid) => {
      try {
        rtdbRef(`mehfil/${chatId}/participants/${uid}`)?.remove();
      } catch (e) {}
    });
  }

  async function ensureMehfilMemberMirror(chatId) {
    if (!chatId || typeof apiFetch !== 'function') return false;
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'mehfil_ensure_member', chatId },
      });
      return !!(envelope && envelope.ok !== false);
    } catch (e) {
      console.warn('[mehfil] mehfil_ensure_member', e?.message || e);
      return false;
    }
  }

  function tt(key, fallback, vars) {
    if (typeof t === 'function') {
      const s = t(key, vars || {});
      if (s && s !== key) return s;
    }
    let out = fallback || key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        out = out.replace(`{{${k}}}`, v);
      });
    }
    return out;
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readPrefs() {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (!raw) return { mic: true, cam: false };
      const p = JSON.parse(raw);
      return {
        mic: p.mic !== false,
        cam: !!p.cam,
      };
    } catch (e) {
      return { mic: true, cam: false };
    }
  }

  function writePrefs(patch) {
    try {
      const next = { ...readPrefs(), ...patch };
      localStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch (e) {}
  }

  function channelForChat(chatId) {
    return ('mh_' + String(chatId || '').replace(/[^a-zA-Z0-9_-]/g, '')).slice(0, 64);
  }

  function rtdbRef(path) {
    if (typeof rtdb === 'undefined' || !rtdb) return null;
    return rtdb.ref(path);
  }

  function mehfilMarkHtml(size) {
    const s = size || 22;
    return `<span class="mehfil-mark" style="--mehfil-mark-size:${s}px" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="${s}" height="${s}" focusable="false">
        <defs>
          <linearGradient id="mhg" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stop-color="#E63946"/><stop offset=".55" stop-color="#F4A261"/><stop offset="1" stop-color="#2A9D8F"/>
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#mhg)"/>
        <path d="M8 20c2.2-4.5 5-6.8 8-6.8S21.8 15.5 24 20" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="12" cy="12.5" r="2.1" fill="#fff"/><circle cx="20" cy="12.5" r="2.1" fill="#fff"/>
        <path d="M10 22.5h12" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".85"/>
      </svg>
    </span>`;
  }

  function isMehfilBlockedChat(chat) {
    if (!chat) return true;
    if (typeof isSelfChat === 'function' && isSelfChat(chat)) return true;
    if (typeof isSelfChatRow === 'function' && isSelfChatRow(chat)) return true;
    if (chat.type === 'self' || chat.isSelf) return true;
    if (typeof isChaupaalChat === 'function' && isChaupaalChat(chat)) return true;
    if (typeof isChaupaalChatRow === 'function' && isChaupaalChatRow(chat)) return true;
    if (chat.isChaupaal || chat.type === 'chaupaal') return true;
    if (typeof chat.id === 'string' && chat.id.startsWith('chat_chaupaal_')) return true;
    if (typeof chat.id === 'string' && chat.id.startsWith('chat_self')) return true;
    return false;
  }

  function mehfilRoomTitle(chat) {
    if (!chat) return tt('mehfil_title', 'Mehfil');
    if (chat.type === 'group') return chat.name || tt('mehfil_group', 'Group');
    const me = currentUser?.uid;
    const peer =
      chat.uid ||
      chat.peerUid ||
      chat.otherUid ||
      (Array.isArray(chat.participants) ? chat.participants.find((u) => u && u !== me) : null);
    const mp = peer && chat.memberProfiles && chat.memberProfiles[peer];
    return (mp && (mp.name || mp.displayName)) || chat.name || tt('mehfil_friend', 'Friend');
  }

  function peerUidOfChat(chat) {
    if (!chat) return '';
    const me = currentUser?.uid;
    return (
      chat.uid ||
      chat.peerUid ||
      chat.otherUid ||
      (Array.isArray(chat.participants) ? chat.participants.find((u) => u && u !== me) : '') ||
      ''
    );
  }

  function displayNameForUid(uid) {
    if (!uid) return tt('mehfil_someone', 'Someone');
    if (uid === currentUser?.uid) {
      return userProfile?.name || digitalProfile?.displayName || tt('mehfil_you_label', 'You');
    }
    const mp = activeChat?.memberProfiles?.[uid];
    if (mp?.name || mp?.displayName) return mp.name || mp.displayName;
    return tt('mehfil_someone', 'Someone');
  }

  function groupRingMembers(chat) {
    const me = currentUser?.uid;
    const ids = Array.isArray(chat?.participants) ? chat.participants.map(String) : [];
    const profiles = chat?.memberProfiles && typeof chat.memberProfiles === 'object' ? chat.memberProfiles : {};
    return ids
      .filter((u) => u && u !== me)
      .map((uid) => ({
        uid,
        name: profiles[uid]?.name || profiles[uid]?.displayName || tt('mehfil_someone', 'Someone'),
        photo: profiles[uid]?.photoURL || profiles[uid]?.avatar || '',
      }));
  }

  function shellHost() {
    return document.getElementById('device') || document.querySelector('.device') || document.body;
  }

  // --- Theme ---
  function appThemeBaseline() {
    try {
      if (window.ChaupaalTheme?.getDisplayMode) {
        const m = window.ChaupaalTheme.getDisplayMode();
        if (m === 'light') return 'light';
        if (m === 'dark' || m === 'night') return 'dark';
      }
      const html = document.documentElement;
      if (html.classList.contains('theme-light')) return 'light';
      if (html.classList.contains('theme-dark') || html.classList.contains('theme-night')) return 'dark';
      return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
    } catch (e) {
      return 'dark';
    }
  }

  function readThemeOverride() {
    try {
      const v = localStorage.getItem(THEME_OVERRIDE_KEY);
      return v === 'light' || v === 'dark' ? v : '';
    } catch (e) {
      return '';
    }
  }

  function effectiveMehfilTheme() {
    return readThemeOverride() || appThemeBaseline();
  }

  function applyMehfilTheme(el) {
    if (!el) return;
    const mode = effectiveMehfilTheme();
    el.classList.remove('mehfil-theme--light', 'mehfil-theme--dark', 'mehfil-theme--match');
    el.classList.add(mode === 'light' ? 'mehfil-theme--light' : 'mehfil-theme--dark');
    const btn = el.querySelector('[data-mehfil-theme-toggle]');
    if (btn) {
      btn.textContent =
        mode === 'light' ? tt('mehfil_theme_light', 'Light') : tt('mehfil_theme_dark', 'Dark');
      btn.setAttribute(
        'aria-label',
        tt('mehfil_theme_follow_app', 'Room theme') + ': ' + btn.textContent
      );
    }
  }

  function toggleMehfilTheme() {
    if (!overlayEl) return;
    const cur = effectiveMehfilTheme();
    const next = cur === 'light' ? 'dark' : 'light';
    try {
      localStorage.setItem(THEME_OVERRIDE_KEY, next);
    } catch (e) {}
    applyMehfilTheme(overlayEl);
    pokeChrome();
  }

  // --- Layout / Cinema ---
  function cameraRail() {
    return overlayEl?.querySelector('[data-mehfil-camera-rail]');
  }

  function stageMain() {
    return overlayEl?.querySelector('[data-mehfil-stage-main]');
  }

  function stageGrid() {
    return overlayEl?.querySelector('[data-mehfil-stage]');
  }

  function hasYoutubeOnStage() {
    return !!(
      overlayEl?.classList.contains('mehfil-has-youtube') ||
      cachedMediaState?.type === 'youtube' ||
      ytPlayer
    );
  }

  function relocateTilesForCinema() {
    if (!overlayEl) return;
    const rail = cameraRail();
    const grid = stageGrid();
    if (!rail || !grid) return;
    const ytOn = hasYoutubeOnStage();
    overlayEl.classList.toggle('mehfil-has-youtube', ytOn);
    const tiles = [...overlayEl.querySelectorAll('.mehfil-tile')];
    tiles.forEach((tile) => {
      if (ytOn) {
        if (tile.parentElement !== rail) rail.appendChild(tile);
        tile.classList.add('mehfil-tile--rail');
      } else {
        if (tile.parentElement !== grid) grid.appendChild(tile);
        tile.classList.remove('mehfil-tile--rail');
      }
    });
    const waiting = overlayEl.querySelector('[data-mehfil-waiting]');
    if (waiting && !ytOn && waiting.parentElement !== grid) grid.appendChild(waiting);
  }

  function layoutCinema() {
    relocateTilesForCinema();
  }

  // --- Chat strip ---
  function chatStripEl() {
    return overlayEl?.querySelector('[data-mehfil-chat-strip]');
  }

  function expandChatStrip() {
    const strip = chatStripEl();
    if (!strip) return;
    strip.classList.remove('is-collapsed');
    strip.classList.add('is-expanded');
    strip.setAttribute('role', 'log');
    strip.setAttribute('aria-live', 'polite');
    chatUnread = 0;
    const badge = strip.querySelector('[data-mehfil-chat-badge]');
    if (badge) badge.hidden = true;
    clearTimeout(chatIdleTimer);
    const msgs = strip.querySelector('[data-mehfil-chat-msgs]');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  function collapseChatStrip() {
    const strip = chatStripEl();
    if (!strip) return;
    strip.classList.add('is-collapsed');
    strip.classList.remove('is-expanded');
    strip.removeAttribute('aria-live');
    scheduleChatIdleCollapse();
  }

  function scheduleChatIdleCollapse() {
    clearTimeout(chatIdleTimer);
    chatIdleTimer = setTimeout(() => {
      if (chatStripEl()?.classList.contains('is-expanded')) return;
      collapseChatStrip();
    }, CHAT_IDLE_COLLAPSE_MS);
  }

  function appendChatLine(v) {
    const strip = chatStripEl();
    const msgsEl = strip?.querySelector('[data-mehfil-chat-msgs]');
    const preview = strip?.querySelector('[data-mehfil-chat-preview]');
    if (!msgsEl) return;
    const row = document.createElement('div');
    row.className = 'mehfil-chat-line' + (v.by === currentUser?.uid ? ' is-me' : '');
    const name = v.name && v.name !== v.by ? v.name : displayNameForUid(v.by);
    row.innerHTML = `<span class="mehfil-chat-name">${esc(name)}</span><span class="mehfil-chat-text">${esc(v.text)}</span>`;
    msgsEl.appendChild(row);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    if (preview) {
      preview.textContent = `${name}: ${v.text}`.slice(0, 120);
      preview.classList.add('mehfil-chat-shimmer');
      setTimeout(() => preview.classList.remove('mehfil-chat-shimmer'), 2600);
    }
    if (strip?.classList.contains('is-collapsed')) {
      chatUnread += 1;
      const badge = strip.querySelector('[data-mehfil-chat-badge]');
      if (badge) {
        badge.hidden = false;
        badge.textContent = String(chatUnread);
      }
    }
    scheduleChatIdleCollapse();
  }

  // --- Media host / control ---
  function canControlMedia(m) {
    const media = m || cachedMediaState || {};
    const me = currentUser?.uid;
    if (!me) return false;
    if (media.controlMode === 'all') return true;
    if (media.controlUid && media.controlUid === me) return true;
    if (media.hostUid && media.hostUid === me) return true;
    if (!media.hostUid && media.by === me) return true;
    return false;
  }

  function updateHostControlUi(m) {
    const media = m || cachedMediaState;
    const chip = overlayEl?.querySelector('[data-mehfil-host-chip]');
    if (!chip) return;
    const me = currentUser?.uid;
    if (!media?.hostUid) {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    const iAmHost = media.hostUid === me;
    const iControl =
      media.controlMode === 'all' || media.controlUid === me || (iAmHost && media.controlMode !== 'all');
    if (iControl) chip.textContent = tt('mehfil_you_are_host', 'You control playback');
    else if (media.controlMode === 'all') chip.textContent = tt('mehfil_control_everyone', 'Everyone can control');
    else chip.textContent = tt('mehfil_host_controls', 'Host controls playback');
    chip.classList.toggle('is-host', iAmHost);
  }

  async function fetchParticipantUids(chatId) {
    return new Promise((resolve) => {
      const ref = rtdbRef(`mehfil/${chatId}/participants`);
      if (!ref) return resolve([]);
      ref.once('value', (snap) => {
        const val = snap.val() || {};
        const state = mehfilLiveState(val);
        if (state.staleUids && state.staleUids.length) pruneStaleParticipants(chatId, state.staleUids);
        // Ring “already here” — only fresh in_room uids.
        resolve(state.freshUids || []);
      });
    });
  }

  async function filterRingTargets(chatId, uids) {
    const inRoom = await fetchParticipantUids(chatId);
    const set = new Set(inRoom.map(String));
    return (uids || []).map(String).filter((u) => u && !set.has(u));
  }

  function toggleImmersive() {
    if (!overlayEl) return;
    overlayEl.classList.toggle('mehfil-immersive');
    const btn = overlayEl.querySelector('[data-mehfil-immersive]');
    if (btn) {
      const on = overlayEl.classList.contains('mehfil-immersive');
      btn.setAttribute(
        'aria-label',
        on ? tt('mehfil_immersive_exit', 'Exit immersive') : tt('mehfil_immersive_enter', 'Immersive mode')
      );
    }
    pokeChrome();
  }

  async function requestStageFullscreen() {
    const host = overlayEl?.querySelector('[data-mehfil-stage-yt]');
    if (!host?.requestFullscreen) {
      if (typeof showToast === 'function') showToast(tt('mehfil_fs_unsupported', 'Fullscreen not supported here'));
      return;
    }
    try {
      await host.requestFullscreen();
    } catch (e) {
      if (typeof showToast === 'function') showToast(tt('mehfil_fs_unsupported', 'Fullscreen not supported here'));
    }
  }

  async function transferHostIfNeeded() {
    if (!activeChatId || !currentUser?.uid) return;
    try {
      const ref = rtdbRef(`mehfil/${activeChatId}/media`);
      if (!ref) return;
      const snap = await ref.once('value');
      const m = snap.val() || {};
      if (m.hostUid !== currentUser.uid) return;
      const ps = await rtdbRef(`mehfil/${activeChatId}/participants`)?.once('value');
      const val = ps?.val() || {};
      const state = mehfilLiveState(val);
      const others = (state.freshUids || []).filter((uid) => uid !== currentUser.uid);
      if (others.length) {
        await ref.update({ hostUid: others[0], controlUid: null, controlMode: 'host' });
      }
    } catch (e) {}
  }

  function clearRtdb() {
    rtdbUnsubs.forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
    rtdbUnsubs = [];
    if (ytResyncTimer) {
      clearInterval(ytResyncTimer);
      ytResyncTimer = null;
    }
  }

  async function ensureMehfilParticipant(chatId) {
    if (!chatId || !currentUser?.uid) return;
    try {
      await ensureMehfilMemberMirror(chatId);
      const ref = rtdbRef(`mehfil/${chatId}/participants/${currentUser.uid}`);
      if (!ref) return;
      await ref.set({
        at: Date.now(),
        state: 'in_room',
        name: userProfile?.name || digitalProfile?.displayName || 'Member',
        muted: !micWanted,
        cam: !!camWanted,
      });
      ref.onDisconnect()?.remove();
      if (window.__mehfilPresenceBeat) {
        clearInterval(window.__mehfilPresenceBeat);
        window.__mehfilPresenceBeat = null;
      }
      window.__mehfilPresenceBeat = setInterval(() => {
        if (!activeChatId || activeChatId !== chatId) return;
        ref.update({ at: Date.now(), state: 'in_room' }).catch(() => {});
      }, PRESENCE_HEARTBEAT_MS);
    } catch (e) {}
  }

  function bindMembersList(chatId) {
    const chipsHost = overlayEl?.querySelector('[data-mehfil-member-chips]');
    const ref = rtdbRef(`mehfil/${chatId}/participants`);
    if (!chipsHost || !ref) return;
    const paint = (snap) => {
      const val = snap.val() || {};
      const state = mehfilLiveState(val);
      if (state.staleUids && state.staleUids.length) pruneStaleParticipants(chatId, state.staleUids);
      const freshEntries = (state.freshUids || [])
        .map((uid) => [uid, val[uid]])
        .filter(([, meta]) => meta);
      // Arrival feedback when someone new joins (not on first paint).
      if (lastKnownFreshCount > 0 && state.count > lastKnownFreshCount) {
        const newcomers = freshEntries
          .map(([uid, meta]) => ({ uid, name: meta?.name || 'Someone' }))
          .filter((p) => p.uid !== currentUser?.uid);
        const joined = newcomers[newcomers.length - 1];
        if (joined) {
          setMehfilStatus(
            tt('mehfil_someone_joined', '{{name}} joined', { name: (joined.name || '').split(' ')[0] || 'Someone' }),
            'live'
          );
          if (!(typeof quietMode !== 'undefined' && quietMode) && typeof haptic === 'function') {
            try {
              haptic('light');
            } catch (e) {}
          }
        }
      }
      lastKnownFreshCount = state.count;
      if (state.count > 1) setRingingChrome(false);
      mutedByUid.clear();
      freshEntries.forEach(([uid, meta]) => {
        mutedByUid.set(String(uid), !!meta?.muted);
      });
      const rows = freshEntries.map(([uid, meta]) => {
        const name = meta?.name || 'Member';
        const me = uid === currentUser?.uid;
        const muted = !!meta?.muted;
        const camOn = !!meta?.cam;
        const initial = esc((name || '?').slice(0, 1));
        return `<button type="button" class="mehfil-member-chip${me ? ' is-me' : ''}${muted ? ' is-muted' : ''}${camOn ? ' is-cam' : ''}" data-uid="${esc(uid)}" title="${esc(name)}">
          <span class="mehfil-member-chip-avatar">${initial}</span>
          <span class="mehfil-member-chip-name">${esc(name.split(' ')[0])}${me ? ' · ' + tt('mehfil_you', 'you') : ''}${muted ? ' · 🔇' : ''}</span>
        </button>`;
      });
      chipsHost.innerHTML = rows.length
        ? rows.join('')
        : `<span class="mehfil-member-chip is-empty">${esc(tt('mehfil_empty_room', 'No one here yet'))}</span>`;
      updateWaitingState(state);
      updateAloneHint(state.count);
      updateWhoHereStrip(state);
    };
    ref.on('value', paint);
    rtdbUnsubs.push(() => ref.off('value', paint));
  }

  function updateWhoHereStrip(state) {
    const el = overlayEl?.querySelector('[data-mehfil-who-here]');
    if (!el) return;
    const n = state?.count || 0;
    if (n <= 0) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent =
      n === 1
        ? tt('mehfil_who_one', '1 in Mehfil')
        : tt('mehfil_who_n', '{{n}} in Mehfil', { n: String(n) });
  }

  function updateAloneHint(count) {
    const hint = overlayEl?.querySelector('[data-mehfil-alone]');
    if (!hint) return;
    const alone = !count || count <= 1;
    hint.hidden = !alone;
  }

  function updateWaitingState(liveState) {
    if (!overlayEl) return;
    const grid = stageGrid();
    const waiting = overlayEl.querySelector('[data-mehfil-waiting]');
    if (!grid || !waiting) return;
    const remotes = overlayEl.querySelectorAll('.mehfil-tile:not(.mehfil-tile--self)').length;
    const blocked = !!grid.querySelector('.mehfil-disabled, .mehfil-error');
    const fresh =
      liveState && typeof liveState.count === 'number'
        ? liveState.count
        : lastKnownFreshCount;
    // Hide waiting when peers are present (tiles or fresh presence) or media is up.
    waiting.hidden = blocked || remotes > 0 || fresh > 1 || hasYoutubeOnStage();
    layoutCinema();
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some((s) => s.src === src || s.src.includes(src.split('/').pop()))) {
        resolve();
        return;
      }
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('script_load_failed'));
      document.head.appendChild(el);
    });
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(label || 'timeout')), ms);
      }),
    ]);
  }

  async function ensureAgora() {
    if (window.AgoraRTC) return window.AgoraRTC;
    await withTimeout(loadScript(AGORA_CDN), 12000, 'AGORA_SDK_TIMEOUT');
    if (!window.AgoraRTC) throw new Error('AGORA_SDK_MISSING');
    return window.AgoraRTC;
  }

  function setMehfilStatus(text, tone) {
    const status = overlayEl?.querySelector('[data-mehfil-status]');
    if (!status) return;
    status.textContent = text || '';
    status.classList.toggle('is-live', tone === 'live');
    status.classList.toggle('is-warn', tone === 'warn');
  }

  function syncSheetOpenClass() {
    if (!overlayEl) return;
    const open = !!overlayEl.querySelector(
      '.mehfil-sheets .mehfil-sheet.is-open, .mehfil-sheets .mehfil-more-menu.is-open'
    );
    overlayEl.classList.toggle('mehfil-sheet-open', open);
    if (open) {
      overlayEl.classList.remove('mehfil-chrome-dim');
      clearTimeout(chromeTimer);
      chromeTimer = null;
    } else {
      pokeChrome();
    }
  }

  function pokeChrome() {
    if (!overlayEl) return;
    overlayEl.classList.remove('mehfil-chrome-dim');
    clearTimeout(chromeTimer);
    chromeTimer = null;
    if (overlayEl.classList.contains('mehfil-sheet-open')) return;
    chromeTimer = setTimeout(() => {
      overlayEl?.classList.add('mehfil-chrome-dim');
    }, CHROME_DIM_MS);
  }

  function closeCallSheets(except) {
    if (!overlayEl) return;
    const map = {
      media: '[data-mehfil-media]',
      reacts: '[data-mehfil-reacts]',
      stickers: '[data-mehfil-stickers]',
      more: '[data-mehfil-more]',
    };
    Object.entries(map).forEach(([key, sel]) => {
      if (key === except) return;
      overlayEl.querySelector(sel)?.classList.remove('is-open');
    });
    overlayEl.querySelector('[data-mehfil-more-btn]')?.classList.toggle('is-open', except === 'more');
    syncSheetOpenClass();
  }

  function toggleCallSheet(which) {
    if (!overlayEl) return;
    const sel =
      which === 'media'
        ? '[data-mehfil-media]'
        : which === 'reacts'
          ? '[data-mehfil-reacts]'
          : which === 'stickers'
            ? '[data-mehfil-stickers]'
            : '[data-mehfil-more]';
    const panel = overlayEl.querySelector(sel);
    if (!panel) return;
    const willOpen = !panel.classList.contains('is-open');
    closeCallSheets(willOpen ? which : null);
    if (willOpen) panel.classList.add('is-open');
    overlayEl.querySelector('[data-mehfil-more-btn]')?.classList.toggle('is-open', which === 'more' && willOpen);
    syncSheetOpenClass();
    pokeChrome();
  }

  function setMicUi(live) {
    const on = !!live;
    const btn = overlayEl?.querySelector('[data-mehfil-mic]');
    if (btn) {
      btn.classList.toggle('is-live', on);
      btn.classList.toggle('is-muted', !on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on ? tt('mehfil_mic_on', 'Mic on') : tt('mehfil_mic_off', 'Mic muted');
    }
    const tile = overlayEl?.querySelector('[data-mehfil-local-video]');
    if (tile) {
      tile.classList.toggle('is-mic-on', on);
      tile.classList.toggle('is-mic-muted', !on);
      let badge = tile.querySelector('[data-mehfil-mic-badge]');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'mehfil-mic-badge';
        badge.setAttribute('data-mehfil-mic-badge', '1');
        tile.appendChild(badge);
      }
      badge.textContent = on ? '🎤' : '🔇';
      badge.title = on ? tt('mehfil_mic_on', 'Mic on') : tt('mehfil_mic_off', 'Mic muted');
    }
  }

  function setCamUi(live) {
    const btn = overlayEl?.querySelector('[data-mehfil-cam]');
    btn?.classList.toggle('is-live', live);
    btn?.classList.toggle('is-off', !live);
    btn?.setAttribute('aria-pressed', live ? 'true' : 'false');
    const tile = overlayEl?.querySelector('[data-mehfil-local-video]');
    tile?.classList.toggle('is-cam-off', !live && !localScreen);
  }

  function setShareUi(sharing) {
    const btn = overlayEl?.querySelector('[data-mehfil-share]');
    btn?.classList.toggle('is-live', sharing);
    const label = btn?.querySelector('[data-mehfil-share-label]');
    if (label) label.textContent = sharing ? tt('mehfil_stop_share', 'Stop share') : tt('mehfil_share', 'Share');
    overlayEl?.querySelector('[data-mehfil-local-video]')?.classList.toggle('is-screen', sharing);
    const chip = overlayEl?.querySelector('[data-mehfil-sharing-chip]');
    if (chip) chip.hidden = !sharing;
  }

  function setAvControlsEnabled(mode) {
    avMode = mode || 'none';
    const full = avMode === 'full';
    const listen = avMode === 'listen' || full;
    const mic = overlayEl?.querySelector('[data-mehfil-mic]');
    const cam = overlayEl?.querySelector('[data-mehfil-cam]');
    const flip = overlayEl?.querySelector('[data-mehfil-flip]');
    const share = overlayEl?.querySelector('[data-mehfil-share]');
    if (mic) {
      mic.disabled = !full;
      mic.classList.toggle('is-disabled', !full);
      if (!full) {
        mic.title = tt('mehfil_mic_unavailable', 'Mic unavailable — listening only');
      }
    }
    [cam, flip, share].forEach((el) => {
      if (!el) return;
      el.disabled = !full;
      el.classList.toggle('is-disabled', !full);
    });
    if (!listen) {
      /* voice stack absent */
    }
  }

  function mehfilReducedMotion() {
    try {
      if (typeof quietMode !== 'undefined' && quietMode) return true;
      return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch (e) {
      return false;
    }
  }

  function renderLocalPlaceholder(text) {
    const tile = overlayEl?.querySelector('[data-mehfil-local-video]');
    if (!tile) return;
    tile.classList.remove('is-screen');
    const micOn = !!micWanted && avMode === 'full';
    tile.innerHTML = `<span class="mehfil-tile-placeholder">${esc(
      text || tt('mehfil_cam_off', 'Camera off')
    )}</span><div class="mehfil-tile-label">${esc(tt('mehfil_you_label', 'You'))}</div>
      <span class="mehfil-mic-badge" data-mehfil-mic-badge>${micOn ? '🎤' : '🔇'}</span>`;
    tile.classList.toggle('is-mic-on', micOn);
    tile.classList.toggle('is-mic-muted', !micOn);
  }

  function playLocalOnTile(track, label) {
    const tile = overlayEl?.querySelector('[data-mehfil-local-video]');
    if (!tile || !track) return;
    const micOn = !!micWanted && avMode === 'full';
    tile.innerHTML = `<div class="mehfil-tile-label">${esc(label || tt('mehfil_you_label', 'You'))}</div>
      <span class="mehfil-mic-badge" data-mehfil-mic-badge>${micOn ? '🎤' : '🔇'}</span>`;
    tile.classList.toggle('is-mic-on', micOn);
    tile.classList.toggle('is-mic-muted', !micOn);
    track.play(tile);
    layoutCinema();
  }

  function setSpeakingCue(name) {
    clearTimeout(speakingCueTimer);
    speakingCueTimer = null;
    const cue = overlayEl?.querySelector('[data-mehfil-speaking-cue]');
    if (!cue) return;
    if (!name) {
      cue.hidden = true;
      cue.textContent = '';
      lastSpeakingLabel = '';
      return;
    }
    const label = tt('mehfil_is_speaking', '{{name}} is speaking', { name });
    if (label === lastSpeakingLabel && !cue.hidden) return;
    lastSpeakingLabel = label;
    cue.textContent = label;
    cue.hidden = false;
    speakingCueTimer = setTimeout(() => {
      if (cue) {
        cue.hidden = true;
        lastSpeakingLabel = '';
      }
    }, 1800);
  }

  function applyVolumeIndicators(volumes) {
    if (!overlayEl || !Array.isArray(volumes)) return;
    const byUid = new Map(volumes.map((v) => [String(v.uid), Number(v.level) || 0]));
    let topSpeaker = null;
    let topLevel = 0;
    const reduced = mehfilReducedMotion();

    overlayEl.querySelectorAll('.mehfil-tile').forEach((tile) => {
      const isSelf = tile.classList.contains('mehfil-tile--self');
      let uid = isSelf ? (localUid != null ? String(localUid) : '') : String(tile.dataset.uid || '');
      let level = uid ? byUid.get(uid) || 0 : 0;

      // Muted participants never show as speaking.
      const muted = isSelf
        ? !micWanted || !localAudio
        : mutedByUid.get(uid) === true;
      if (muted) level = 0;

      const was = speakingSticky.get(uid) === true;
      let speaking = was;
      if (level >= SPEAK_ON_LEVEL) speaking = true;
      else if (level < SPEAK_OFF_LEVEL) speaking = false;
      if (uid) speakingSticky.set(uid, speaking);

      tile.classList.toggle('is-speaking', speaking && !reduced);
      tile.classList.toggle('is-speaking-static', speaking && reduced);

      if (speaking && level > topLevel) {
        topLevel = level;
        topSpeaker = isSelf
          ? tt('mehfil_you', 'You')
          : (tile.querySelector('.mehfil-tile-label')?.textContent || '').split('·')[0].trim() ||
            tt('mehfil_someone', 'Someone');
      }
    });

    // Muted-but-talking nudge (self only, cooldown, calm once).
    if (!micWanted && localAudio && localUid != null) {
      const selfLevel = byUid.get(String(localUid)) || 0;
      if (selfLevel >= MUTED_NUDGE_LEVEL && Date.now() - lastMutedNudgeAt > MUTED_NUDGE_COOLDOWN_MS) {
        lastMutedNudgeAt = Date.now();
        setMehfilStatus(tt('mehfil_you_muted', 'You’re muted'), 'warn');
        const hint = overlayEl.querySelector('[data-mehfil-muted-hint]');
        if (hint) {
          hint.hidden = false;
          clearTimeout(hint._hide);
          hint._hide = setTimeout(() => {
            hint.hidden = true;
          }, 2400);
        }
      }
    }

    // Compact cue when media fullscreen / immersive / rail-heavy.
    const needCue =
      !!topSpeaker &&
      (overlayEl.classList.contains('mehfil-immersive') ||
        !!document.fullscreenElement ||
        hasYoutubeOnStage());
    if (needCue) setSpeakingCue(topSpeaker);
    else if (!topSpeaker) setSpeakingCue('');
  }

  async function closeCameraTrack() {
    if (!localVideo) return;
    try {
      await client?.unpublish([localVideo]);
    } catch (e) {}
    try {
      localVideo.close();
    } catch (e) {}
    localVideo = null;
  }

  async function closeScreenTrack() {
    if (!localScreen) return;
    try {
      await client?.unpublish([localScreen]);
    } catch (e) {}
    try {
      localScreen.close();
    } catch (e) {}
    localScreen = null;
    setShareUi(false);
  }

  async function publishCamera() {
    if (!client || !window.AgoraRTC) return;
    await closeScreenTrack();
    if (!localVideo) {
      localVideo = await window.AgoraRTC.createCameraVideoTrack();
      await client.publish([localVideo]);
    }
    playLocalOnTile(localVideo, tt('mehfil_you_label', 'You'));
    setCamUi(true);
  }

  function showReactionBurst(emoji, opts) {
    if (!overlayEl) return;
    if (typeof MehfilEffects?.burstReaction === 'function') {
      MehfilEffects.burstReaction(emoji, { root: overlayEl, ...(opts || {}) });
      return;
    }
    const el = document.createElement('div');
    el.className = 'mehfil-float-react';
    el.textContent = emoji;
    el.setAttribute('data-nav-ignore', '1');
    overlayEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function showStickerBurst(emoji, opts) {
    if (typeof MehfilEffects?.burstSticker === 'function') {
      MehfilEffects.burstSticker(emoji, { root: overlayEl, ...(opts || {}) });
    } else {
      showReactionBurst(emoji, opts);
    }
  }

  async function publishMediaState(patch) {
    if (!activeChatId || !currentUser?.uid) return;
    const p = patch || {};
    if ((p.playing != null || p.t != null) && !p.hostUid && !p.controlMode) {
      if (cachedMediaState?.hostUid && !canControlMedia(cachedMediaState)) return;
    }
    await ensureMehfilParticipant(activeChatId);
    const ref = rtdbRef(`mehfil/${activeChatId}/media`);
    if (!ref) return;
    await ref.update({
      ...patch,
      by: currentUser.uid,
      at: Date.now(),
      wall: Date.now(),
    });
  }

  function bindMediaSync() {
    const ref = rtdbRef(`mehfil/${activeChatId}/media`);
    if (!ref) return;
    const handler = (snap) => {
      const m = snap.val();
      cachedMediaState = m || null;
      updateHostControlUi(m);
      if (!m) {
        overlayEl?.classList.remove('mehfil-has-youtube');
        layoutCinema();
        return;
      }
      if (m.by === currentUser?.uid && !applyingRemoteMedia) {
        const nowEl = overlayEl?.querySelector('[data-mehfil-now]');
        if (nowEl && m.title) nowEl.textContent = tt('mehfil_now_playing', 'Now playing: {{title}}', { title: m.title });
        layoutCinema();
        return;
      }
      applyRemoteMedia(m);
    };
    ref.on('value', handler);
    rtdbUnsubs.push(() => ref.off('value', handler));

    // Periodic local clock skew check only — do not re-publish (avoids feedback loops).
    ytResyncTimer = setInterval(() => {
      if (!ytPlayer || !activeChatId || applyingRemoteMedia) return;
      try {
        const refMedia = rtdbRef(`mehfil/${activeChatId}/media`);
        refMedia?.once('value', (snap) => {
          const m = snap.val();
          if (!m || m.type !== 'youtube' || !m.id || m.by === currentUser?.uid) return;
          const curId = ytPlayer.getVideoData?.()?.video_id;
          if (curId !== m.id) return;
          const curT = ytPlayer.getCurrentTime?.() || 0;
          const target = Number(m.t) || 0;
          if (Math.abs(curT - target) > 2.5) {
            applyingRemoteMedia = true;
            try {
              ytPlayer.seekTo(target, true);
              if (m.playing) ytPlayer.playVideo();
              else ytPlayer.pauseVideo();
            } catch (e) {}
            setTimeout(() => {
              applyingRemoteMedia = false;
            }, 400);
          }
        });
      } catch (e) {}
    }, YT_RESYNC_MS);

    const reactRef = rtdbRef(`mehfil/${activeChatId}/reactions`);
    if (reactRef) {
      const onReact = (snap) => {
        const v = snap.val();
        if (v?.emoji) showReactionBurst(v.emoji);
      };
      reactRef.limitToLast(1).on('child_added', onReact);
      rtdbUnsubs.push(() => reactRef.off('child_added', onReact));
    }

    const chatRef = rtdbRef(`mehfil/${activeChatId}/chat`);
    if (chatRef) {
      const onChat = (snap) => {
        const v = snap.val();
        if (!v?.text) return;
        appendChatLine(v);
      };
      chatRef.limitToLast(40).on('child_added', onChat);
      rtdbUnsubs.push(() => chatRef.off('child_added', onChat));
    }
  }

  function applyRemoteMedia(m) {
    applyingRemoteMedia = true;
    try {
      const nowEl = overlayEl?.querySelector('[data-mehfil-now]');
      if (nowEl) {
        nowEl.textContent = m.title
          ? tt('mehfil_now_playing', 'Now playing: {{title}}', { title: m.title })
          : m.type === 'youtube'
            ? tt('mehfil_yt_in_room', 'YouTube in Mehfil')
            : tt('mehfil_shared_media', 'Shared media');
      }
      if (m.type === 'youtube' && m.id) {
        overlayEl?.classList.add('mehfil-has-youtube');
        ensureYtPlayer(m.id, !!m.playing, Number(m.t) || 0);
        layoutCinema();
      } else if (m.type === 'music' && m.previewUrl) {
        // M3 owns music publish UI — remote-apply plumbing kept so peers can hear when M3 ships.
        if (typeof quietMode !== 'undefined' && quietMode) return;
        if (typeof pauseAllMusic === 'function') pauseAllMusic();
        try {
          window.__mehfilSharedAudio?.pause?.();
          const a = new Audio(m.previewUrl);
          a.dataset.mehfilShared = '1';
          if (m.playing !== false) a.play().catch(() => {});
          window.__mehfilSharedAudio = a;
        } catch (e) {}
      }
      if (overlayEl && m.type && !overlayEl.querySelector('[data-mehfil-media]')?.classList.contains('is-open')) {
        closeCallSheets('media');
        overlayEl.querySelector('[data-mehfil-media]')?.classList.add('is-open');
        syncSheetOpenClass();
      }
    } finally {
      setTimeout(() => {
        applyingRemoteMedia = false;
      }, 400);
    }
  }

  function ensureYtPlayer(videoId, play, startAt) {
    const host = overlayEl?.querySelector('[data-mehfil-stage-yt]') || overlayEl?.querySelector('[data-mehfil-yt]');
    if (!host) return;
    const empty = overlayEl?.querySelector('[data-mehfil-yt-empty]');
    if (empty) empty.hidden = true;
    host.hidden = false;
    overlayEl?.classList.add('mehfil-has-youtube');
    layoutCinema();

    const boot = () => {
      if (!window.YT || !window.YT.Player) return;
      if (ytPlayer) {
        try {
          const cur = ytPlayer.getVideoData?.()?.video_id;
          if (cur !== videoId) ytPlayer.loadVideoById({ videoId, startSeconds: startAt || 0 });
          else {
            const curT = ytPlayer.getCurrentTime?.() || 0;
            if (Math.abs(curT - (startAt || 0)) > 1.5) ytPlayer.seekTo(startAt || 0, true);
          }
          if (play) ytPlayer.playVideo();
          else ytPlayer.pauseVideo();
        } catch (e) {}
        return;
      }
      try {
        ytPlayer = new window.YT.Player(host, {
          videoId,
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: (e) => {
              if (startAt) e.target.seekTo(startAt, true);
              if (play) e.target.playVideo();
            },
            onStateChange: (e) => {
              if (applyingRemoteMedia || !activeChatId || !canControlMedia(cachedMediaState)) return;
              try {
                const st = e.data;
                const tSec = e.target.getCurrentTime?.() || 0;
                const id = e.target.getVideoData?.()?.video_id || videoId;
                if (st === window.YT.PlayerState.PLAYING) {
                  publishMediaState({ type: 'youtube', id, playing: true, t: tSec, title: 'YouTube' });
                } else if (st === window.YT.PlayerState.PAUSED) {
                  publishMediaState({ type: 'youtube', id, playing: false, t: tSec, title: 'YouTube' });
                }
              } catch (err) {}
            },
            onError: () => {
              if (empty) {
                empty.hidden = false;
                empty.textContent = tt(
                  'mehfil_yt_blocked',
                  'YouTube couldn’t load here — voice and camera still work.'
                );
              }
              host.hidden = true;
            },
          },
        });
      } catch (e) {
        if (empty) {
          empty.hidden = false;
          empty.textContent = tt(
            'mehfil_yt_blocked',
            'YouTube couldn’t load here — voice and camera still work.'
          );
        }
      }
    };
    if (window.YT && window.YT.Player) boot();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        boot();
      };
      loadScript(YT_API).catch(() => {
        if (empty) {
          empty.hidden = false;
          empty.textContent = tt(
            'mehfil_yt_blocked',
            'YouTube couldn’t load here — voice and camera still work.'
          );
        }
      });
    }
  }

  async function stopCurrentMedia() {
    try {
      ytPlayer?.stopVideo?.();
    } catch (e) {}
    try {
      ytPlayer?.destroy?.();
    } catch (e) {}
    ytPlayer = null;
    overlayEl?.classList.remove('mehfil-has-youtube');
    layoutCinema();
    try {
      window.__mehfilSharedAudio?.pause?.();
      window.__mehfilSharedAudio = null;
    } catch (e) {}
    const stageHost = overlayEl?.querySelector('[data-mehfil-yt]');
    if (stageHost) stageHost.innerHTML = '';
  }

  async function playYoutubeId(id, title) {
    await stopCurrentMedia();
    ensureYtPlayer(id, true, 0);
    const ref = rtdbRef(`mehfil/${activeChatId}/media`);
    let hostPatch = {};
    try {
      const snap = await ref?.once('value');
      const cur = snap?.val() || {};
      if (!cur.hostUid && currentUser?.uid) {
        hostPatch = { hostUid: currentUser.uid, controlMode: 'host', controlUid: null };
      }
    } catch (e) {}
    await publishMediaState({
      type: 'youtube',
      id,
      playing: true,
      t: 0,
      title: title || 'YouTube',
      ...hostPatch,
    });
    cachedMediaState = { ...(cachedMediaState || {}), type: 'youtube', id, ...hostPatch };
    updateHostControlUi(cachedMediaState);
    layoutCinema();
    const nowEl = overlayEl?.querySelector('[data-mehfil-now]');
    if (nowEl) nowEl.textContent = tt('mehfil_now_playing', 'Now playing: {{title}}', { title: title || 'YouTube' });
  }

  function paintYtResults(results, { configured, emptyHint } = {}) {
    const host = overlayEl?.querySelector('[data-mehfil-yt-results]');
    if (!host) return;
    const list = results || [];
    if (!list.length) {
      host.innerHTML = `<div class="cp-empty mehfil-yt-empty-copy">${esc(
        emptyHint ||
          (configured === false
            ? tt('mehfil_yt_needs_key', 'Search needs YOUTUBE_API_KEY on the host. Paste a YouTube link to play.')
            : tt('mehfil_yt_no_videos', 'No videos — try another search or paste a link.'))
      )}</div>`;
      host.hidden = false;
      return;
    }
    host.hidden = false;
    host.innerHTML = list
      .map(
        (r, i) =>
          `<button type="button" class="mehfil-yt-pick" data-yt-i="${i}">
            ${r.thumb ? `<img src="${esc(r.thumb)}" alt="">` : '<span class="mehfil-yt-pick-ph">▶</span>'}
            <span class="mehfil-yt-pick-meta">
              <strong>${esc(r.title || 'Video')}</strong>
              <small>${esc(r.channel || '')}</small>
            </span>
          </button>`
      )
      .join('');
    host.querySelectorAll('[data-yt-i]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const r = list[Number(btn.dataset.ytI)];
        if (r?.id) await playYoutubeId(r.id, r.title);
      });
    });
  }

  async function searchAndPlay(query) {
    const q = String(query || '').trim();
    if (!q) {
      await loadMehfilYtRecs(overlayEl, { openPicker: true });
      return;
    }
    const ytMatch =
      q.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{6,})/) ||
      (q.length === 11 && /^[a-zA-Z0-9_-]+$/.test(q) ? [0, q] : null);
    if (ytMatch) {
      await playYoutubeId(ytMatch[1], 'YouTube');
      return;
    }
    if (typeof apiFetch !== 'function') return;
    const resultsHost = overlayEl?.querySelector('[data-mehfil-yt-results]');
    if (resultsHost) {
      resultsHost.hidden = false;
      resultsHost.innerHTML = `<div class="cp-empty">${esc(tt('mehfil_searching', 'Searching…'))}</div>`;
    }
    try {
      const ytEnv = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'youtube_search', query: q, limit: 8 },
      });
      if (ytEnv?.httpStatus === 429 || ytEnv?.error?.code === 'RATE_LIMITED') {
        if (typeof showToast === 'function') showToast(tt('mehfil_yt_rate', 'Too many searches — try again shortly.'));
        if (resultsHost) resultsHost.innerHTML = '';
        return;
      }
      const configured = ytEnv?.data?.configured !== false && !!ytEnv?.data?.provider;
      const configuredFlag = ytEnv?.data?.configured;
      const results = (ytEnv?.data?.results || [])
        .map((r) => ({
          id: r.id || r.videoId,
          title: r.title,
          channel: r.channelTitle || r.channel,
          thumb: r.thumb || r.thumbnail,
        }))
        .filter((r) => r.id);
      if (ytEnv?.data?.error && typeof showToast === 'function') {
        showToast(
          ytEnv.data.error === 'YOUTUBE_QUOTA'
            ? tt('mehfil_yt_quota', 'YouTube search is busy — paste a link or try later.')
            : tt('mehfil_yt_error', 'YouTube search failed — paste a link instead.')
        );
      }
      if (configuredFlag === false) {
        paintYtResults([], { configured: false });
        if (typeof showToast === 'function') {
          showToast(tt('mehfil_yt_needs_key', 'Search needs YOUTUBE_API_KEY on the host. Paste a YouTube link to play.'));
        }
        return;
      }
      paintYtResults(results, { configured: true });
    } catch (e) {
      if (typeof reportClientError === 'function') {
        reportClientError({ feature: 'mehfil_yt_search', message: e?.message || String(e) });
      }
      if (typeof showToast === 'function') showToast(tt('mehfil_media_fail', 'Media search failed'));
    }
  }

  async function loadMehfilYtRecs(root, { openPicker = false } = {}) {
    const host = root || overlayEl;
    const row = host?.querySelector('[data-mehfil-recs-row]');
    const wrap = host?.querySelector('[data-mehfil-recs]');
    if (!row || !wrap || typeof apiFetch !== 'function') return;
    if (wrap.dataset.loaded === '1' && !openPicker) {
      wrap.hidden = wrap.dataset.hide === '1';
      return;
    }
    try {
      const ytEnv = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'youtube_search', query: YT_REC_QUERY, limit: 6 },
      });
      if (ytEnv?.data?.configured === false) {
        wrap.hidden = true;
        wrap.dataset.hide = '1';
        wrap.dataset.loaded = '1';
        return;
      }
      const results = (ytEnv?.data?.results || [])
        .map((r) => ({
          id: r.id || r.videoId,
          title: r.title,
          channel: r.channelTitle || r.channel,
          thumb: r.thumb || r.thumbnail,
        }))
        .filter((r) => r.id);
      if (!results.length) {
        wrap.hidden = true;
        wrap.dataset.loaded = '1';
        wrap.dataset.hide = '1';
        if (openPicker) paintYtResults([], { configured: true });
        return;
      }
      wrap.dataset.loaded = '1';
      wrap.dataset.hide = '0';
      wrap.hidden = false;
      row.innerHTML = results
        .map(
          (r, i) =>
            `<button type="button" class="mehfil-yt-rec" data-rec-i="${i}" title="${esc(r.title || '')}">
              ${r.thumb ? `<img src="${esc(r.thumb)}" alt="">` : '<span>▶</span>'}
              <span>${esc((r.title || 'Video').slice(0, 42))}</span>
            </button>`
        )
        .join('');
      row.querySelectorAll('[data-rec-i]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const r = results[Number(btn.dataset.recI)];
          if (r?.id) await playYoutubeId(r.id, r.title);
        });
      });
      if (openPicker) paintYtResults(results, { configured: true });
    } catch (e) {
      wrap.hidden = true;
    }
  }

  function showStageError(message, opts) {
    const stage = overlayEl?.querySelector('[data-mehfil-stage]');
    if (!stage) return;
    const self = stage.querySelector('[data-mehfil-local-video]');
    const waiting = stage.querySelector('[data-mehfil-waiting]');
    stage.querySelectorAll('.mehfil-error, .mehfil-disabled').forEach((n) => n.remove());
    const box = document.createElement('div');
    box.className = opts?.fatal ? 'mehfil-error' : 'mehfil-disabled';
    box.innerHTML = `<p>${esc(message)}</p>
      ${
        opts?.retry
          ? `<button type="button" class="mehfil-retry" data-mehfil-retry>${esc(tt('mehfil_retry', 'Try again'))}</button>`
          : ''
      }
      <button type="button" class="mehfil-retry mehfil-retry--ghost" data-mehfil-leave-err>${esc(tt('mehfil_leave', 'Leave'))}</button>`;
    if (waiting) waiting.hidden = true;
    if (self) stage.insertBefore(box, self.nextSibling);
    else stage.appendChild(box);
    box.querySelector('[data-mehfil-retry]')?.addEventListener('click', () => {
      if (activeChat) openMehfil(activeChat);
    });
    box.querySelector('[data-mehfil-leave-err]')?.addEventListener('click', () => leaveMehfil());
    updateWaitingState();
    if (opts?.fatal) {
      try {
        if (typeof restoreAppShell === 'function') restoreAppShell('mehfil_error');
      } catch (e) {}
    }
  }

  /**
   * Hard teardown of media + DOM. Safe to call multiple times.
   * Does NOT touch history — callers use openLayer.close / leaveMehfil for that.
   */
  async function teardownMehfil(reason) {
    clearTimeout(chromeTimer);
    chromeTimer = null;
    clearTimeout(ringUiTimer);
    ringUiTimer = null;
    clearTimeout(speakingCueTimer);
    speakingCueTimer = null;
    clearTimeout(tokenRenewTimer);
    tokenRenewTimer = null;
    stopMutedNudgeWatch();
    lastKnownFreshCount = 0;
    dmAutoRingDone = false;
    reconnectFailCount = 0;
    tokenExpiresAtSec = 0;
    avMode = 'none';
    speakingSticky.clear();
    mutedByUid.clear();
    lastSpeakingLabel = '';
    clearRtdb();
    try {
      if (localAudio) {
        localAudio.close();
        localAudio = null;
      }
    } catch (e) {}
    try {
      if (localVideo) {
        localVideo.close();
        localVideo = null;
      }
    } catch (e) {}
    try {
      if (localScreen) {
        localScreen.close();
        localScreen = null;
      }
    } catch (e) {}
    try {
      if (client) {
        await client.leave();
        client.removeAllListeners?.();
        client = null;
      }
    } catch (e) {}
    // Silence immediately — stop YT + shared audio before DOM teardown
    try {
      ytPlayer?.stopVideo?.();
    } catch (e) {}
    try {
      ytPlayer?.destroy?.();
    } catch (e) {}
    ytPlayer = null;
    try {
      window.__mehfilSharedAudio?.pause?.();
      if (window.__mehfilSharedAudio) {
        window.__mehfilSharedAudio.src = '';
        window.__mehfilSharedAudio.load?.();
      }
      window.__mehfilSharedAudio = null;
    } catch (e) {}
    if (typeof pauseAllMusic === 'function') {
      try {
        pauseAllMusic();
      } catch (e) {}
    }
    musicPausedForMehfil = false;
    if (activeChatId && currentUser?.uid) {
      try {
        if (window.__mehfilPresenceBeat) {
          clearInterval(window.__mehfilPresenceBeat);
          window.__mehfilPresenceBeat = null;
        }
        await transferHostIfNeeded();
        rtdbRef(`mehfil/${activeChatId}/participants/${currentUser.uid}`)?.remove();
      } catch (e) {}
    }
    ringAckUnsubs.forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
    ringAckUnsubs = [];
    clearTimeout(chatIdleTimer);
    chatIdleTimer = null;
    cachedMediaState = null;
    try {
      document.getElementById('mehfilBusyBanner')?.remove();
    } catch (e) {}
    try {
      overlayEl?.querySelector('[data-mehfil-effects-layer]')?.replaceChildren?.();
    } catch (e) {}
    const el = overlayEl;
    overlayEl = null;
    activeChatId = null;
    activeChat = null;
    localUid = null;
    camWanted = false;
    micWanted = true;
    layerHandle = null;
    try {
      shellHost()?.classList.remove('is-mehfil-open');
    } catch (e) {}
    try {
      document.documentElement.classList.remove('mehfil-open');
    } catch (e) {}
    if (el?.isConnected) {
      try {
        el.remove();
      } catch (e) {}
    }
    try {
      if (typeof restoreAppShell === 'function') restoreAppShell(reason || 'mehfil_leave');
      else if (typeof clearShellGlitches === 'function') clearShellGlitches(reason || 'mehfil_leave');
    } catch (e) {}
  }

  /**
   * Leave without history.back — for chat switch, sign-out, pagehide.
   */
  async function abandonMehfil(reason) {
    if (!overlayEl && !document.getElementById('mehfilOverlay')) return;
    joinGeneration += 1;
    const el = overlayEl || document.getElementById('mehfilOverlay');
    layerHandle = null;
    await teardownMehfil(reason || 'abandon');
    leaving = false;
    if (el && typeof removeNavLayer === 'function') {
      try {
        removeNavLayer(el);
      } catch (e) {}
    }
  }

  /**
   * Public leave — always dismiss via nav-stack when registered.
   */
  async function leaveMehfil() {
    if (leaving) return;
    leaving = true;
    joinGeneration += 1;
    try {
      const handle = layerHandle;
      const el = overlayEl;
      if (handle && typeof handle.close === 'function') {
        handle.close();
        return;
      }
      await teardownMehfil('leave_raw');
      if (el?.dataset?.navLayer && typeof removeNavLayer === 'function') {
        try {
          removeNavLayer(el);
        } catch (e) {}
      }
    } finally {
      if (!overlayEl) leaving = false;
    }
  }

  async function toggleMic() {
    if (avMode !== 'full') {
      if (typeof showToast === 'function') {
        showToast(tt('mehfil_mic_unavailable', 'Mic unavailable — listening only'));
      }
      return;
    }
    if (!localAudio || !client) {
      if (typeof showToast === 'function') {
        showToast(tt('mehfil_mic_perm', 'Microphone permission denied — enable it in browser settings, then retry.'));
      }
      return;
    }
    try {
      const next = !micWanted;
      // Prefer setMuted so local level still readable for “you’re muted” nudge.
      if (typeof localAudio.setMuted === 'function') {
        await localAudio.setMuted(!next);
        if (typeof localAudio.setEnabled === 'function') await localAudio.setEnabled(true);
      } else {
        await localAudio.setEnabled(next);
      }
      micWanted = next;
      setMicUi(next);
      writePrefs({ mic: next });
      if (activeChatId) {
        rtdbRef(`mehfil/${activeChatId}/participants/${currentUser?.uid}`)?.update({ muted: !next });
      }
      mutedByUid.set(String(currentUser?.uid || localUid || ''), !next);
      if (!next) startMutedNudgeWatch();
      else stopMutedNudgeWatch();
    } catch (e) {
      if (typeof showToast === 'function') showToast(tt('mehfil_mic_fail', 'Couldn’t toggle mic'));
    }
    pokeChrome();
  }

  let mutedNudgeWatch = null;
  function stopMutedNudgeWatch() {
    if (mutedNudgeWatch) {
      clearInterval(mutedNudgeWatch);
      mutedNudgeWatch = null;
    }
  }
  function startMutedNudgeWatch() {
    stopMutedNudgeWatch();
    mutedNudgeWatch = setInterval(() => {
      if (!overlayEl || micWanted || !localAudio) {
        stopMutedNudgeWatch();
        return;
      }
      try {
        const raw = typeof localAudio.getVolumeLevel === 'function' ? localAudio.getVolumeLevel() : 0;
        const level = raw <= 1 ? raw * 100 : raw;
        if (level >= MUTED_NUDGE_LEVEL && Date.now() - lastMutedNudgeAt > MUTED_NUDGE_COOLDOWN_MS) {
          lastMutedNudgeAt = Date.now();
          setMehfilStatus(tt('mehfil_you_muted', 'You’re muted'), 'warn');
          const hint = overlayEl.querySelector('[data-mehfil-muted-hint]');
          if (hint) {
            hint.hidden = false;
            clearTimeout(hint._hide);
            hint._hide = setTimeout(() => {
              hint.hidden = true;
            }, 2400);
          }
        }
      } catch (e) {}
    }, 400);
  }

  async function toggleCam() {
    if (!client || !window.AgoraRTC || avMode !== 'full') {
      if (avMode !== 'full' && typeof showToast === 'function') {
        showToast(tt('mehfil_cam_unavailable', 'Camera unavailable in this room'));
      }
      return;
    }
    try {
      if (localScreen) {
        if (typeof showToast === 'function') showToast(tt('mehfil_stop_share_first', 'Stop screen share to use camera'));
        pokeChrome();
        return;
      }
      if (!localVideo) {
        camWanted = true;
        await publishCamera();
        writePrefs({ cam: true });
      } else {
        camWanted = false;
        await closeCameraTrack();
        renderLocalPlaceholder(tt('mehfil_cam_off', 'Camera off'));
        setCamUi(false);
        writePrefs({ cam: false });
      }
      if (activeChatId) {
        rtdbRef(`mehfil/${activeChatId}/participants/${currentUser?.uid}`)?.update({ cam: !!camWanted });
      }
    } catch (e) {
      const perm =
        e?.code === 'PERMISSION_DENIED' || /Permission|NotAllowed|NotFound/i.test(String(e?.message || e));
      if (perm) {
        if (typeof showToast === 'function') {
          showToast(tt('mehfil_cam_perm', 'Camera permission denied — check browser settings.'));
        }
        camWanted = false;
        writePrefs({ cam: false });
        renderLocalPlaceholder(tt('mehfil_cam_off', 'Camera off'));
        setCamUi(false);
      } else if (typeof showToast === 'function') {
        showToast(tt('mehfil_cam_fail', 'Camera unavailable'));
      }
    }
    pokeChrome();
  }

  async function flipCamera() {
    if (!client || !window.AgoraRTC || avMode !== 'full') return;
    closeCallSheets(null);
    if (localScreen) {
      if (typeof showToast === 'function') showToast(tt('mehfil_stop_share_first', 'Stop screen share to use camera'));
      return;
    }
    if (!localVideo) {
      if (typeof showToast === 'function') showToast(tt('mehfil_cam_on_first', 'Turn camera on to flip'));
      return;
    }
    try {
      const cams = await window.AgoraRTC.getCameras();
      if (!cams || cams.length < 2) {
        if (typeof showToast === 'function') showToast(tt('mehfil_no_other_cam', 'No other camera found'));
        return;
      }
      const curId = localVideo.getMediaStreamTrack?.()?.getSettings?.()?.deviceId;
      const idx = Math.max(
        0,
        cams.findIndex((c) => c.deviceId === curId)
      );
      const next = cams[(idx + 1) % cams.length];
      try {
        await localVideo.setDevice(next.deviceId);
      } catch (setErr) {
        // Recreate track if setDevice fails mid-session (some mobile browsers).
        await closeCameraTrack();
        localVideo = await window.AgoraRTC.createCameraVideoTrack({ cameraId: next.deviceId });
        await client.publish([localVideo]);
        playLocalOnTile(localVideo, tt('mehfil_you_label', 'You'));
        setCamUi(true);
      }
      if (typeof showToast === 'function') showToast(tt('mehfil_cam_flipped', 'Camera flipped'));
    } catch (e) {
      if (typeof showToast === 'function') showToast(tt('mehfil_cam_flip_fail', 'Couldn’t flip camera'));
      if (camWanted && !localVideo) {
        try {
          await publishCamera();
        } catch (err) {}
      }
    }
    pokeChrome();
  }

  async function toggleScreenShare() {
    if (!client || !window.AgoraRTC || avMode !== 'full') return;
    closeCallSheets(null);
    try {
      if (localScreen) {
        await closeScreenTrack();
        // Share replaces cam while active; restore cam only if user still wants it.
        if (camWanted) await publishCamera();
        else {
          renderLocalPlaceholder(tt('mehfil_cam_off', 'Camera off'));
          setCamUi(false);
        }
        pokeChrome();
        return;
      }
      // Choice: replace cam with share (one outgoing video track) — clearer on mobile.
      await closeCameraTrack();
      setCamUi(false);
      const trackOrPair = await window.AgoraRTC.createScreenVideoTrack({ encoderConfig: '1080p_1' }, 'disable');
      localScreen = Array.isArray(trackOrPair) ? trackOrPair[0] : trackOrPair;
      localScreen.on?.('track-ended', () => {
        (async () => {
          if (!localScreen) return;
          await closeScreenTrack();
          if (camWanted) {
            try {
              await publishCamera();
            } catch (err) {}
          } else {
            renderLocalPlaceholder(tt('mehfil_cam_off', 'Camera off'));
            setCamUi(false);
          }
        })().catch(() => {});
      });
      await client.publish([localScreen]);
      playLocalOnTile(localScreen, tt('mehfil_you_screen', 'You · screen'));
      setShareUi(true);
      setMehfilStatus(tt('mehfil_sharing', 'You’re sharing screen'), 'live');
      if (typeof showToast === 'function') showToast(tt('mehfil_sharing', 'You’re sharing screen'));
    } catch (e) {
      localScreen = null;
      setShareUi(false);
      if (camWanted) {
        try {
          await publishCamera();
        } catch (err) {}
      } else {
        renderLocalPlaceholder(tt('mehfil_cam_off', 'Camera off'));
        setCamUi(false);
      }
      const msg =
        e?.code === 'PERMISSION_DENIED' || /Permission|NotAllowed|cancelled|canceled/i.test(String(e?.message || e))
          ? tt('mehfil_share_cancel', 'Screen share cancelled')
          : tt('mehfil_share_fail', 'Screen share unavailable on this device');
      if (typeof showToast === 'function') showToast(msg);
    }
    pokeChrome();
  }

  async function nudgeOthers() {
    if (!activeChat || !activeChatId) return;
    const name = userProfile?.name || 'Someone';
    const text = tt('mehfil_nudge_text', '{{name}} invited you to join Mehfil', { name });
    try {
      if (typeof sendRealtimeMessage === 'function') {
        await sendRealtimeMessage(activeChatId, text, activeChat.type === 'group', null, {
          type: 'mehfil_invite',
          label: tt('mehfil_join_cta', 'Join Mehfil'),
        });
      }
      if (typeof showToast === 'function') showToast(tt('mehfil_nudge_sent', 'Invite sent in chat'));
      if (!(typeof quietMode !== 'undefined' && quietMode) && typeof haptic === 'function') haptic('light');
    } catch (e) {
      if (typeof showToast === 'function') showToast(tt('mehfil_nudge_fail', 'Couldn’t send invite'));
    }
  }

  function clearIncomingRingUi() {
    try {
      incomingRingClose?.();
    } catch (e) {}
    incomingRingClose = null;
    if (incomingRingEl?.isConnected) {
      try {
        incomingRingEl.remove();
      } catch (e) {}
    }
    incomingRingEl = null;
  }

  async function ackMehfilRing(chatId, status) {
    if (!chatId || !currentUser?.uid) return;
    const allowed = status === 'accepted' || status === 'declined' || status === 'timeout';
    if (!allowed) return;
    try {
      await ensureMehfilMemberMirror(chatId);
      await rtdbRef(`mehfil/${chatId}/ringAck/${currentUser.uid}`)?.set({ status, at: Date.now() });
    } catch (e) {}
    try {
      await rtdbRef(`mehfilInbox/${currentUser.uid}/${chatId}`)?.remove();
    } catch (e) {}
  }

  function setRingingChrome(on, peerName) {
    clearTimeout(ringUiTimer);
    ringUiTimer = null;
    const banner = overlayEl?.querySelector('[data-mehfil-ringing]');
    if (!banner) return;
    if (!on) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    const label = banner.querySelector('[data-mehfil-ringing-label]');
    if (label) {
      label.textContent = peerName
        ? tt('mehfil_ringing_name', 'Ringing {{name}}…', { name: peerName })
        : tt('mehfil_ringing', 'Ringing…');
    }
    ringUiTimer = setTimeout(() => setRingingChrome(false), RING_TTL_MS + 500);
  }

  function cancelOutboundRing() {
    setRingingChrome(false);
    ringAckUnsubs.forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
    ringAckUnsubs = [];
    if (activeChatId) {
      rtdbRef(`mehfil/${activeChatId}/ring`)?.remove().catch(() => {});
    }
  }

  async function postRingTrace(chat, text) {
    const chatId = chat?.firestoreId || chat?.id || activeChatId;
    if (!chatId || !text) return;
    try {
      if (typeof sendRealtimeMessage === 'function') {
        await sendRealtimeMessage(chatId, text, chat?.type === 'group', null, null);
      }
    } catch (e) {}
  }

  function watchCallerRingAcks(chatId, targetUids) {
    ringAckUnsubs.forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
    ringAckUnsubs = [];
    const targets = new Set((targetUids || []).map(String));
    const oneToOne = targets.size === 1;
    const chatSnap = activeChat || { id: chatId, firestoreId: chatId, type: oneToOne ? 'dm' : 'group' };
    const timeoutId = setTimeout(() => {
      setRingingChrome(false);
      rtdbRef(`mehfil/${chatId}/ring`)?.remove().catch(() => {});
      if (oneToOne) postRingTrace(chatSnap, RING_TRACE_NO_ANSWER);
      else if (typeof showToast === 'function') showToast(tt('mehfil_no_answer', 'No answer'));
    }, RING_TTL_MS);
    ringAckUnsubs.push(() => clearTimeout(timeoutId));
    const ref = rtdbRef(`mehfil/${chatId}/ringAck`);
    if (!ref) return;
    const onChild = (snap) => {
      const uid = snap.key;
      if (!targets.has(String(uid))) return;
      const status = snap.val()?.status;
      if (status === 'declined' && oneToOne) {
        clearTimeout(timeoutId);
        setRingingChrome(false);
        rtdbRef(`mehfil/${chatId}/ring`)?.remove().catch(() => {});
        postRingTrace(chatSnap, RING_TRACE_DECLINED);
      }
      if (status === 'accepted') {
        clearTimeout(timeoutId);
        setRingingChrome(false);
        setMehfilStatus(tt('mehfil_in_call', 'In the room'), 'live');
      }
    };
    ref.on('child_added', onChild);
    ringAckUnsubs.push(() => ref.off('child_added', onChild));
  }

  async function writeMehfilRing(chat, targetUids, mode) {
    const chatId = chat?.firestoreId || chat?.id;
    if (!chatId || !currentUser?.uid) return false;
    if (isMehfilBlockedChat(chat)) {
      if (typeof showToast === 'function') showToast(tt('mehfil_blocked', 'Mehfil isn’t available in this chat'));
      return false;
    }
    const mirrored = await ensureMehfilMemberMirror(chatId);
    if (!mirrored) {
      if (typeof showToast === 'function') showToast(tt('mehfil_ring_fail', 'Could not ring'));
      return false;
    }
    let filtered = await filterRingTargets(chatId, targetUids);
    filtered = filtered.slice(0, RING_FANOUT_MAX);
    if (!filtered.length) {
      if (typeof showToast === 'function') showToast(tt('mehfil_already_here', 'Everyone you selected is already here'));
      return false;
    }
    const now = Date.now();
    const prev = lastRingAt.get(chatId) || 0;
    if (now - prev < RING_COOLDOWN_MS) {
      if (typeof showToast === 'function') showToast(tt('mehfil_ring_wait', 'Wait a moment before ringing again'));
      return false;
    }
    lastRingAt.set(chatId, now);
    const payload = {
      fromUid: currentUser.uid,
      fromName: userProfile?.name || digitalProfile?.displayName || 'Someone',
      fromPhoto: currentUser.photoURL || userProfile?.photoURL || '',
      chatId,
      mode: mode === 'users' ? 'users' : 'all',
      targetUids: filtered.map(String),
      ts: now,
      expiresAt: now + RING_TTL_MS,
    };
    try {
      await rtdbRef(`mehfil/${chatId}/ring`)?.set(payload);
      await Promise.all(
        payload.targetUids.map((uid) => rtdbRef(`mehfilInbox/${uid}/${chatId}`)?.set(payload))
      );
    } catch (e) {
      if (typeof reportClientError === 'function') {
        reportClientError({ feature: 'mehfil_ring', message: e?.message || String(e) });
      }
      if (typeof showToast === 'function') showToast(tt('mehfil_ring_fail', 'Could not ring'));
      return false;
    }
    if (typeof apiFetch === 'function') {
      apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: {
          action: 'notif_mehfil_ring',
          chatId,
          targetUids: payload.targetUids,
          fromName: payload.fromName,
        },
      }).catch(() => {});
    }
    watchCallerRingAcks(chatId, payload.targetUids);
    if (overlayEl && activeChatId === chatId) {
      const peerName =
        payload.targetUids.length === 1 ? (chat?.name || '').split(' ')[0] || '' : '';
      setRingingChrome(true, peerName);
    }
    return true;
  }

  async function startMehfilRing(chat) {
    if (isMehfilBlockedChat(chat)) {
      if (typeof showToast === 'function') showToast(tt('mehfil_blocked', 'Mehfil isn’t available in this chat'));
      return;
    }
    const isGroup = chat?.type === 'group';
    if (!isGroup) {
      const peer = peerUidOfChat(chat);
      if (!peer) {
        if (typeof showToast === 'function') showToast(tt('mehfil_ring_fail', 'Could not ring'));
        return;
      }
      await writeMehfilRing(chat, [peer], 'all');
      return;
    }
    const membersRaw = groupRingMembers(chat);
    const inRoom = new Set(await fetchParticipantUids(chat.firestoreId || chat.id));
    const members = membersRaw.filter((m) => !inRoom.has(String(m.uid)));
    if (!members.length) {
      if (typeof showToast === 'function') showToast(tt('mehfil_already_here', 'Everyone you selected is already here'));
      return;
    }
    const sheet = document.createElement('div');
    sheet.className = 'mehfil-ring-pick';
    sheet.setAttribute('role', 'dialog');
    sheet.innerHTML = `
      <div class="mehfil-ring-pick-card">
        <h3>${esc(tt('mehfil_ring', 'Ring'))}</h3>
        <button type="button" class="mehfil-ring-pick-all" data-ring-all>${esc(tt('mehfil_ring_everyone', 'Ring everyone'))}</button>
        <p class="mehfil-ring-pick-label">${esc(tt('mehfil_ring_choose', 'Choose people'))}</p>
        <div class="mehfil-ring-pick-list">
          ${membersRaw
            .map((m) => {
              const here = inRoom.has(String(m.uid));
              return `<label class="mehfil-ring-pick-row${here ? ' is-disabled' : ''}">
                <input type="checkbox" value="${esc(m.uid)}" ${here ? 'disabled' : 'checked'}>
                <span>${esc(m.name)}${here ? ` (${tt('mehfil_already_here_short', 'here')})` : ''}</span>
              </label>`;
            })
            .join('')}
        </div>
        <div class="mehfil-ring-pick-actions">
          <button type="button" data-ring-cancel>${esc(tt('cancel', 'Cancel'))}</button>
          <button type="button" data-ring-confirm>${esc(tt('mehfil_ring', 'Ring'))}</button>
        </div>
      </div>`;
    const onDismiss = () => {
      sheet.remove();
    };
    let handle;
    if (typeof openLayer === 'function') {
      handle = openLayer(sheet, onDismiss, { host: shellHost(), role: 'dialog', label: tt('mehfil_ring', 'Ring') });
    } else {
      shellHost().appendChild(sheet);
    }
    const close = () => {
      if (handle?.close) handle.close();
      else sheet.remove();
    };
    sheet.querySelector('[data-ring-cancel]')?.addEventListener('click', close);
    sheet.querySelector('[data-ring-all]')?.addEventListener('click', async () => {
      close();
      await writeMehfilRing(chat, members.map((m) => m.uid), 'all');
    });
    sheet.querySelector('[data-ring-confirm]')?.addEventListener('click', async () => {
      const selected = [...sheet.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
      close();
      if (!selected.length) {
        if (typeof showToast === 'function') showToast(tt('mehfil_ring_nobody', 'No one to ring'));
        return;
      }
      await writeMehfilRing(chat, selected, 'users');
    });
  }

  function showAudioConflictBanner(opts) {
    const o = opts || {};
    if (document.getElementById('mehfilBusyBanner')) return;
    const el = document.createElement('div');
    el.id = 'mehfilBusyBanner';
    el.className = 'mehfil-busy-banner';
    el.innerHTML = `
      <span>${esc(o.message || tt('mehfil_busy', 'You’re busy in another call'))}</span>
      <button type="button" data-busy-stay>${esc(o.stayLabel || tt('mehfil_stay', 'Stay'))}</button>
      <button type="button" data-busy-switch>${esc(o.switchLabel || tt('mehfil_switch', 'Switch'))}</button>`;
    (overlayEl || shellHost())?.appendChild(el);
    el.querySelector('[data-busy-stay]')?.addEventListener('click', () => {
      try {
        o.onStay?.();
      } catch (e) {}
      el.remove();
    });
    el.querySelector('[data-busy-switch]')?.addEventListener('click', async () => {
      el.remove();
      try {
        await o.onSwitch?.();
      } catch (e) {}
    });
    setTimeout(() => el.remove(), RING_TTL_MS);
  }

  function showMehfilBusyBanner(payload) {
    const chatId = String(payload?.chatId || '');
    const me = currentUser?.uid;
    if (!chatId || !me) return;
    const name = payload.fromName || tt('mehfil_someone', 'Someone');
    showAudioConflictBanner({
      message: tt('mehfil_ring_busy_banner', 'Mehfil ring from {{name}}', { name }),
      stayLabel: tt('mehfil_decline', 'Decline'),
      switchLabel: tt('mehfil_accept', 'Answer'),
      onStay: () => ackMehfilRing(chatId, 'declined'),
      onSwitch: async () => {
        await ackMehfilRing(chatId, 'accepted');
        const chat = { id: chatId, firestoreId: chatId };
        await abandonMehfil('switch_room');
        if (typeof leaveDangalPlayCall === 'function') {
          try {
            leaveDangalPlayCall();
          } catch (e) {}
        }
        setTimeout(() => ensureOpenMehfil(chat), 350);
      },
    });
  }

  function showIncomingMehfilRing(payload) {
    const chatId = String(payload?.chatId || '');
    const me = currentUser?.uid;
    if (!chatId || !me || payload.fromUid === me) return;
    const targets = Array.isArray(payload.targetUids)
      ? payload.targetUids.map(String)
      : payload.targetUids && typeof payload.targetUids === 'object'
        ? Object.values(payload.targetUids).map(String)
        : [];
    if (targets.length && !targets.includes(me)) return;
    if (Number(payload.expiresAt) && Date.now() > Number(payload.expiresAt)) {
      rtdbRef(`mehfilInbox/${me}/${chatId}`)?.remove();
      return;
    }
    if (overlayEl && activeChatId === chatId) return;
    if (incomingRingEl && incomingRingEl.dataset.chatId === chatId) return;
    {
      const pref = typeof getBaithakPref === 'function' ? getBaithakPref(chatId) : null;
      if (pref?.hidden) {
        rtdbRef(`mehfilInbox/${me}/${chatId}`)?.remove();
        return;
      }
    }
    if (overlayEl && activeChatId && activeChatId !== chatId) {
      showMehfilBusyBanner(payload);
      return;
    }
    if (typeof isDangalPlayCallOpen === 'function' && isDangalPlayCallOpen()) {
      const name = payload.fromName || tt('mehfil_someone', 'Someone');
      showAudioConflictBanner({
        message: tt('mehfil_ring_busy_dangal', 'Mehfil from {{name}} — leave game voice?', { name }),
        stayLabel: tt('mehfil_decline', 'Decline'),
        switchLabel: tt('mehfil_accept', 'Answer'),
        onStay: () => ackMehfilRing(chatId, 'declined'),
        onSwitch: async () => {
          await ackMehfilRing(chatId, 'accepted');
          if (typeof leaveDangalPlayCall === 'function') {
            try {
              leaveDangalPlayCall();
            } catch (e) {}
          }
          const chat =
            (typeof baithakChats !== 'undefined' &&
              baithakChats.find((c) => (c.firestoreId || c.id) === chatId)) ||
            { id: chatId, firestoreId: chatId, name: payload.fromName, type: 'dm', uid: payload.fromUid };
          ensureOpenMehfil(chat);
        },
      });
      return;
    }
    clearIncomingRingUi();
    const name = payload.fromName || tt('mehfil_someone', 'Someone');
    const photo = payload.fromPhoto || '';
    const el = document.createElement('div');
    el.id = 'mehfilIncoming';
    el.className = 'mehfil-incoming';
    el.dataset.chatId = chatId;
    el.setAttribute('role', 'dialog');
    el.innerHTML = `
      <div class="mehfil-incoming-card">
        ${mehfilMarkHtml(36)}
        <div class="mehfil-incoming-avatar">${
          photo && /^https?:/.test(photo)
            ? `<img src="${esc(photo)}" alt="">`
            : esc((name || '?').slice(0, 1))
        }</div>
        <div class="mehfil-incoming-name">${esc(name)}</div>
        <div class="mehfil-incoming-sub">${esc(tt('mehfil_incoming', 'Incoming Mehfil'))}</div>
        <div class="mehfil-incoming-actions">
          <button type="button" class="mehfil-incoming-decline" data-incoming-decline>${esc(tt('mehfil_decline', 'Decline'))}</button>
          <button type="button" class="mehfil-incoming-accept" data-incoming-accept>${esc(tt('mehfil_accept', 'Accept'))}</button>
        </div>
      </div>`;
    const expireMs = Math.max(1000, Number(payload.expiresAt) - Date.now() || RING_TTL_MS);
    const expireTimer = setTimeout(() => {
      ackMehfilRing(chatId, 'timeout');
      clearIncomingRingUi();
    }, expireMs);
    const onDismiss = () => {
      clearTimeout(expireTimer);
      incomingRingEl = null;
      incomingRingClose = null;
    };
    incomingRingEl = el;
    if (typeof openLayer === 'function') {
      const handle = openLayer(el, onDismiss, {
        host: shellHost(),
        role: 'dialog',
        label: tt('mehfil_incoming', 'Incoming Mehfil'),
      });
      incomingRingClose = () => {
        clearTimeout(expireTimer);
        handle?.close?.();
      };
    } else {
      shellHost().appendChild(el);
      incomingRingClose = () => {
        clearTimeout(expireTimer);
        el.remove();
        incomingRingEl = null;
      };
    }
    el.querySelector('[data-incoming-decline]')?.addEventListener('click', () => {
      ackMehfilRing(chatId, 'declined');
      clearIncomingRingUi();
    });
    el.querySelector('[data-incoming-accept]')?.addEventListener('click', async () => {
      clearTimeout(expireTimer);
      await ackMehfilRing(chatId, 'accepted');
      clearIncomingRingUi();
      if (typeof leaveDangalPlayCall === 'function') {
        try {
          leaveDangalPlayCall();
        } catch (e) {}
      }
      const chat =
        (typeof baithakChats !== 'undefined' && baithakChats.find((c) => (c.firestoreId || c.id) === chatId)) ||
        { id: chatId, firestoreId: chatId, name: name, type: 'dm', uid: payload.fromUid };
      if (typeof requestMehfilAutoJoin === 'function') requestMehfilAutoJoin(chatId);
      ensureOpenMehfil(chat);
    });
  }

  function bindMehfilRingInbox() {
    if (ringInboxUnsub) {
      try {
        ringInboxUnsub();
      } catch (e) {}
      ringInboxUnsub = null;
    }
    if (!currentUser?.uid) return;
    const ref = rtdbRef(`mehfilInbox/${currentUser.uid}`);
    if (!ref) return;
    const onChild = (snap) => {
      showIncomingMehfilRing(snap.val());
    };
    ref.on('child_added', onChild);
    ringInboxUnsub = () => ref.off('child_added', onChild);
  }

  async function copyInviteLink() {
    if (!activeChatId) return;
    const url = `${location.origin}/chat/${encodeURIComponent(activeChatId)}?mehfil=1`;
    try {
      await navigator.clipboard?.writeText(url);
      if (typeof showToast === 'function') showToast(tt('mehfil_link_copied', 'Invite link copied'));
    } catch (e) {
      if (typeof showToast === 'function') showToast(url);
    }
  }

  function remoteTileLabel(user) {
    const uid = String(user?.uid || '');
    return displayNameForUid(uid);
  }

  function ensureRemoteTile(uid, label) {
    const grid = stageGrid();
    const rail = cameraRail();
    const parent = hasYoutubeOnStage() && rail ? rail : grid;
    if (!parent || uid == null) return null;
    let tile = overlayEl.querySelector(`.mehfil-tile[data-uid="${uid}"]`);
    if (tile) {
      if (tile.parentElement !== parent) parent.appendChild(tile);
      tile.classList.toggle('mehfil-tile--rail', parent === rail);
      return tile;
    }
    tile = document.createElement('div');
    tile.className = 'mehfil-tile' + (parent === rail ? ' mehfil-tile--rail' : '');
    tile.dataset.uid = String(uid);
    tile.innerHTML = `<span class="mehfil-tile-placeholder">${esc(
      tt('mehfil_in_room', 'In the room')
    )}</span><div class="mehfil-tile-label">${esc(label || remoteTileLabel({ uid }))}</div>`;
    parent.appendChild(tile);
    updateWaitingState();
    return tile;
  }

  async function fetchAgoraToken(chatId) {
    const envelope = await withTimeout(
      apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'agora_token', channel: channelForChat(chatId), chatId },
      }),
      10000,
      'TOKEN_TIMEOUT'
    );
    const tokenPayload = envelope?.ok === false ? null : envelope?.data;
    return { envelope, tokenPayload };
  }

  function scheduleTokenRenewal(chatId, expiresAtSec) {
    clearTimeout(tokenRenewTimer);
    tokenRenewTimer = null;
    tokenExpiresAtSec = Number(expiresAtSec) || 0;
    if (!tokenExpiresAtSec || !chatId) return;
    const msUntil = tokenExpiresAtSec * 1000 - Date.now() - TOKEN_RENEW_LEAD_MS;
    const delay = Math.max(30_000, Math.min(msUntil, 6 * 60 * 60 * 1000));
    tokenRenewTimer = setTimeout(() => {
      renewAgoraToken(chatId).catch(() => {});
    }, delay);
  }

  async function renewAgoraToken(chatId) {
    if (!client || !chatId || !overlayEl) return;
    try {
      const { tokenPayload } = await fetchAgoraToken(chatId);
      if (!tokenPayload?.token || !client) {
        setMehfilStatus(tt('mehfil_token_fail', 'Couldn’t renew voice — reconnecting…'), 'warn');
        return;
      }
      await client.renewToken(tokenPayload.token);
      scheduleTokenRenewal(chatId, tokenPayload.expiresAt);
      setMehfilStatus(tt('mehfil_in_call', 'In the room'), 'live');
    } catch (e) {
      console.warn('[mehfil] token renew', e);
      setMehfilStatus(tt('mehfil_token_fail', 'Couldn’t renew voice — reconnecting…'), 'warn');
    }
  }

  async function recoverMicrophone(chatId) {
    if (!client || !window.AgoraRTC || avMode === 'none') return;
    try {
      if (localAudio) {
        try {
          await client.unpublish([localAudio]);
        } catch (e) {}
        try {
          localAudio.close();
        } catch (e) {}
        localAudio = null;
      }
      localAudio = await withTimeout(window.AgoraRTC.createMicrophoneAudioTrack(), 12000, 'MIC_TIMEOUT');
      if (typeof localAudio.setMuted === 'function') {
        await localAudio.setMuted(!micWanted);
        if (typeof localAudio.setEnabled === 'function') await localAudio.setEnabled(true);
      } else {
        await localAudio.setEnabled(micWanted);
      }
      await client.publish([localAudio]);
      setMicUi(micWanted);
      setAvControlsEnabled('full');
      setMehfilStatus(tt('mehfil_in_call', 'In the room'), 'live');
      await ensureMehfilParticipant(chatId);
      if (!micWanted) startMutedNudgeWatch();
      else stopMutedNudgeWatch();
    } catch (e) {
      setMehfilStatus(tt('mehfil_mic_device', 'Mic device changed — tap mic to retry'), 'warn');
    }
  }

  function bindDeviceChangeHandlers(chatId) {
    if (!window.AgoraRTC || deviceListenerBound) return;
    deviceListenerBound = true;
    const onMicChanged = async () => {
      if (!overlayEl || activeChatId !== chatId) return;
      setMehfilStatus(tt('mehfil_mic_device', 'Mic device changed — recovering…'), 'warn');
      await recoverMicrophone(chatId);
    };
    try {
      window.AgoraRTC.on('microphone-changed', onMicChanged);
      rtdbUnsubs.push(() => {
        try {
          window.AgoraRTC.off('microphone-changed', onMicChanged);
        } catch (e) {}
        deviceListenerBound = false;
      });
    } catch (e) {
      deviceListenerBound = false;
    }
  }

  function handleConnectionState(cur, chatId) {
    if (cur === 'CONNECTING') {
      setMehfilStatus(tt('mehfil_connecting', 'Connecting…'));
    } else if (cur === 'RECONNECTING' || cur === 'DISCONNECTING') {
      reconnectFailCount += 1;
      setMehfilStatus(tt('mehfil_reconnecting', 'Reconnecting…'), 'warn');
      if (reconnectFailCount >= RECONNECT_FAIL_MAX) {
        setMehfilStatus(tt('mehfil_left_conn', 'Left the Mehfil — connection lost'), 'warn');
        showStageError(tt('mehfil_left_conn_msg', 'Connection lost. Rejoin when you’re ready.'), {
          retry: true,
          fatal: false,
        });
        setAvControlsEnabled('none');
      }
    } else if (cur === 'CONNECTED') {
      reconnectFailCount = 0;
      setMehfilStatus(tt('mehfil_in_call', 'In the room'), 'live');
    } else if (cur === 'DISCONNECTED') {
      setMehfilStatus(tt('mehfil_reconnecting', 'Reconnecting…'), 'warn');
    }
  }

  function handleNetworkQuality(stats) {
    // Agora: 0 unknown, 1 excellent … 6 down. uplink/downlink.
    const up = Number(stats?.uplinkNetworkQuality);
    const down = Number(stats?.downlinkNetworkQuality);
    const worst = Math.max(up || 0, down || 0);
    if (worst >= 5) {
      setMehfilStatus(
        tt('mehfil_weak_net', 'Weak connection — try turning off video'),
        'warn'
      );
      if (camWanted && localVideo && !localScreen) {
        // Soft suggestion only once per stretch — don’t force cam off.
        const hint = overlayEl?.querySelector('[data-mehfil-weak-hint]');
        if (hint && hint.hidden) {
          hint.hidden = false;
          clearTimeout(hint._hide);
          hint._hide = setTimeout(() => {
            hint.hidden = true;
          }, 5000);
        }
      }
    }
  }

  async function joinAgora(chatId, gen) {
    if (typeof apiFetch !== 'function') {
      showStageError(tt('mehfil_unavailable', 'Mehfil unavailable'), { fatal: true });
      setMehfilStatus(tt('mehfil_unavailable', 'Unavailable'), 'warn');
      setAvControlsEnabled('none');
      return;
    }

    let tokenPayload;
    let envelope = null;
    try {
      setMehfilStatus(tt('mehfil_connecting', 'Connecting…'));
      ({ envelope, tokenPayload } = await fetchAgoraToken(chatId));
    } catch (e) {
      tokenPayload = null;
      console.warn('[mehfil] agora_token fetch', e?.message || e);
    }

    if (gen !== joinGeneration) return;

    if (!tokenPayload?.configured || !tokenPayload.token) {
      console.warn('[mehfil] agora_token', {
        ok: envelope?.ok,
        configured: tokenPayload?.configured,
        reason: tokenPayload?.reason,
        error: envelope?.error || tokenPayload?.error,
      });
      showStageError(
        tt(
          'mehfil_voice_paused',
          'Voice isn’t live yet — room chat and YouTube still work. Add AGORA_APP_ID + AGORA_APP_CERTIFICATE when ready.'
        ),
        { fatal: false }
      );
      setMehfilStatus(tt('mehfil_chat_media', 'Chat + media'), 'warn');
      setAvControlsEnabled('none');
      return;
    }

    try {
      if (typeof pauseAllMusic === 'function') {
        pauseAllMusic();
        musicPausedForMehfil = true;
      }
      const AgoraRTC = await ensureAgora();
      if (gen !== joinGeneration) return;

      client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      localUid = tokenPayload.uid != null ? tokenPayload.uid : null;
      reconnectFailCount = 0;

      client.on('connection-state-change', (cur) => handleConnectionState(cur, chatId));
      client.on('network-quality', handleNetworkQuality);
      client.on('token-privilege-will-expire', () => {
        renewAgoraToken(chatId).catch(() => {});
      });
      client.on('token-privilege-did-expire', () => {
        setMehfilStatus(tt('mehfil_token_fail', 'Couldn’t renew voice — reconnecting…'), 'warn');
        renewAgoraToken(chatId).catch(() => {});
      });

      client.on('user-joined', (user) => {
        ensureRemoteTile(user.uid, remoteTileLabel(user));
        setMehfilStatus(tt('mehfil_in_call', 'In the room'), 'live');
      });

      client.on('user-published', async (user, mediaType) => {
        try {
          await client.subscribe(user, mediaType);
          const tile = ensureRemoteTile(user.uid, remoteTileLabel(user));
          if (mediaType === 'video') {
            tile?.querySelector('.mehfil-tile-placeholder')?.remove();
            user.videoTrack?.play(tile);
            updateWaitingState();
            setMehfilStatus(tt('mehfil_in_call', 'In the room'), 'live');
          }
          if (mediaType === 'audio') user.audioTrack?.play();
        } catch (e) {
          console.warn('[mehfil] subscribe', e);
        }
      });

      client.on('user-unpublished', (user, mediaType) => {
        if (mediaType !== 'video') return;
        const tile = overlayEl?.querySelector(`[data-uid="${user.uid}"]`);
        if (!tile) return;
        if (!user.hasAudio) tile.remove();
        else {
          tile.querySelector('video')?.remove();
          if (!tile.querySelector('.mehfil-tile-placeholder')) {
            const ph = document.createElement('span');
            ph.className = 'mehfil-tile-placeholder';
            ph.textContent = tt('mehfil_cam_off', 'Camera off');
            tile.prepend(ph);
          }
        }
        updateWaitingState();
      });

      client.on('user-left', (user) => {
        overlayEl?.querySelector(`[data-uid="${user.uid}"]`)?.remove();
        speakingSticky.delete(String(user.uid));
        updateWaitingState();
      });

      client.on('volume-indicator', (volumes) => applyVolumeIndicators(volumes));

      setMehfilStatus(tt('mehfil_connecting', 'Connecting…'));
      await withTimeout(
        client.join(tokenPayload.appId, tokenPayload.channel, tokenPayload.token, tokenPayload.uid),
        12000,
        'JOIN_TIMEOUT'
      );
      if (gen !== joinGeneration) {
        try {
          await client.leave();
        } catch (e) {}
        client = null;
        return;
      }
      if (localUid == null) localUid = client.uid;
      scheduleTokenRenewal(chatId, tokenPayload.expiresAt);
      try {
        client.enableAudioVolumeIndicator();
      } catch (e) {}

      const prefs = readPrefs();
      micWanted = prefs.mic !== false;
      // Never auto-enable cam on join — user must opt in (prefs still store last choice for later).
      camWanted = false;

      setMehfilStatus(tt('mehfil_mic_prompt', 'Allow microphone to speak'));
      try {
        localAudio = await withTimeout(AgoraRTC.createMicrophoneAudioTrack(), 12000, 'MIC_TIMEOUT');
        if (typeof localAudio.setMuted === 'function') {
          await localAudio.setMuted(!micWanted);
          if (typeof localAudio.setEnabled === 'function') await localAudio.setEnabled(true);
        } else {
          await localAudio.setEnabled(micWanted);
        }
        await client.publish([localAudio]);
        setAvControlsEnabled('full');
        setMicUi(micWanted);
        if (!micWanted) startMutedNudgeWatch();
      } catch (micErr) {
        console.warn('[mehfil] mic', micErr);
        localAudio = null;
        micWanted = false;
        setAvControlsEnabled('listen');
        setMicUi(false);
        const perm =
          micErr?.code === 'PERMISSION_DENIED' ||
          /Permission|NotAllowed|NotFound|DEVICE/i.test(String(micErr?.message || micErr));
        showStageError(
          perm
            ? tt(
                'mehfil_mic_perm',
                'Microphone permission denied — enable it in browser settings, then retry. You can still listen.'
              )
            : tt('mehfil_mic_fail_listen', 'Couldn’t start mic — listening only. Chat still works.'),
          { retry: true }
        );
        setMehfilStatus(tt('mehfil_listen_only', 'Listening only'), 'warn');
      }

      setCamUi(false);
      setShareUi(false);
      renderLocalPlaceholder(tt('mehfil_cam_off', 'Camera off'));
      bindDeviceChangeHandlers(chatId);

      if (avMode === 'full') {
        setMehfilStatus(tt('mehfil_in_call', 'In the room'), 'live');
      }
      updateWaitingState();
      await ensureMehfilParticipant(chatId);
      if (!(typeof quietMode !== 'undefined' && quietMode) && typeof showToast === 'function') {
        showToast(
          avMode === 'full' && micWanted
            ? tt('mehfil_joined_mic_on', 'Joined Mehfil — mic on, camera off')
            : avMode === 'listen'
              ? tt('mehfil_joined_listen', 'Joined — listening only')
              : tt('mehfil_joined', 'Joined Mehfil')
        );
      }
    } catch (e) {
      console.warn('[mehfil] join', e);
      if (typeof reportClientError === 'function') {
        reportClientError({ feature: 'mehfil_join', message: e?.message || String(e) });
      }
      const perm =
        e?.code === 'PERMISSION_DENIED' || /Permission|NotAllowed|NotFound|DEVICE/i.test(String(e?.message || e));
      showStageError(
        perm
          ? tt('mehfil_mic_perm', 'Microphone permission denied — enable it in browser settings, then retry.')
          : tt('mehfil_join_fail', 'Voice join failed — chat and YouTube still work.'),
        { retry: true }
      );
      setMehfilStatus(tt('mehfil_chat_media', 'Chat + media'), 'warn');
      setAvControlsEnabled('none');
    }
  }

  async function openMehfil(chat) {
    if (isMehfilBlockedChat(chat)) {
      if (typeof showToast === 'function') showToast(tt('mehfil_blocked', 'Mehfil isn’t available in this chat'));
      return;
    }
    const chatId = chat.firestoreId || chat.id;
    if (!chatId) return;

    // Membership mirror before any RTDB mehfil/* write (rules require mehfilMembers).
    const allowed = await ensureMehfilMemberMirror(chatId);
    if (!allowed) {
      if (typeof showToast === 'function') showToast(tt('mehfil_blocked', 'Mehfil isn’t available in this chat'));
      return;
    }

    let flagAllows = true;
    try {
      if (typeof isFeatureEnabled === 'function') {
        flagAllows = await isFeatureEnabled('mehfil', { defaultValue: true });
      }
    } catch (e) {}

    // Mutual exclusion with Dangal play voice (same Agora stack).
    if (typeof isDangalPlayCallOpen === 'function' && isDangalPlayCallOpen()) {
      if (typeof leaveDangalPlayCall === 'function') {
        try {
          leaveDangalPlayCall();
        } catch (e) {}
      }
      if (typeof showToast === 'function') {
        showToast(tt('mehfil_left_dangal_voice', 'Left game voice for Mehfil'));
      }
    }

    // Tear down any prior room cleanly before opening
    if (overlayEl) {
      await teardownMehfil('reopen');
    }
    document.getElementById('mehfilOverlay')?.remove();

    leaving = false;
    lastKnownFreshCount = 0;
    dmAutoRingDone = false;
    const gen = ++joinGeneration;
    const prefs = readPrefs();
    micWanted = prefs.mic !== false;
    camWanted = false; // always start cam off visually; prefs apply after Agora join

    const isGroup = chat?.type === 'group';
    const el = document.createElement('div');
    el.id = 'mehfilOverlay';
    el.className = 'mehfil-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    const roomTitle = mehfilRoomTitle(chat);
    el.setAttribute('aria-label', tt('mehfil_title', 'Mehfil') + ' · ' + roomTitle);
    el.innerHTML = `
      <div class="mehfil-top">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-mehfil-leave-top' }) : ''}
        <div class="mehfil-title">${mehfilMarkHtml(20)} <span>${esc(tt('mehfil_title', 'Mehfil'))} · ${esc(roomTitle)}</span></div>
        <div class="mehfil-who-here" data-mehfil-who-here hidden></div>
        <div class="mehfil-member-chips-scroll"><div class="mehfil-member-chips" data-mehfil-member-chips></div></div>
        <button type="button" class="mehfil-theme-toggle" data-mehfil-theme-toggle aria-label="${esc(tt('mehfil_theme_follow_app', 'Room theme'))}">${esc(tt('mehfil_theme_dark', 'Dark'))}</button>
        <button type="button" class="mehfil-immersive-btn" data-mehfil-immersive aria-label="${esc(tt('mehfil_immersive_enter', 'Immersive mode'))}">⛶</button>
        <button type="button" class="mehfil-ring-btn" data-mehfil-ring title="${esc(tt('mehfil_ring', 'Ring'))}" aria-label="${esc(tt('mehfil_ring', 'Ring'))}">${typeof iconHtml==='function'?iconHtml('phone',{size:18}):'☎'}</button>
        <div class="mehfil-status" data-mehfil-status>${esc(tt('mehfil_joining', 'Joining…'))}</div>
      </div>
      <div class="mehfil-speaking-cue" data-mehfil-speaking-cue hidden></div>
      <div class="mehfil-muted-hint" data-mehfil-muted-hint hidden>${esc(tt('mehfil_you_muted', 'You’re muted'))}</div>
      <div class="mehfil-weak-hint" data-mehfil-weak-hint hidden>${esc(tt('mehfil_weak_net', 'Weak connection — try turning off video'))}</div>
      <div class="mehfil-sharing-chip" data-mehfil-sharing-chip hidden>
        <span>${esc(tt('mehfil_sharing', 'You’re sharing screen'))}</span>
        <button type="button" data-mehfil-stop-share>${esc(tt('mehfil_stop_share', 'Stop'))}</button>
      </div>
      <div class="mehfil-ringing" data-mehfil-ringing hidden>
        <span data-mehfil-ringing-label>${esc(tt('mehfil_ringing', 'Ringing…'))}</span>
        <button type="button" data-mehfil-ring-cancel>${esc(tt('cancel', 'Cancel'))}</button>
      </div>
      <div class="mehfil-cinema">
        <div class="mehfil-stage-main" data-mehfil-stage-main>
          <div class="mehfil-host-chip" data-mehfil-host-chip hidden></div>
          <div id="mehfilYtHost" class="mehfil-yt mehfil-stage-yt" data-mehfil-stage-yt data-mehfil-yt hidden></div>
          <div class="mehfil-yt-empty" data-mehfil-yt-empty hidden></div>
          <div class="mehfil-stage" data-mehfil-stage>
            <div class="mehfil-tile mehfil-tile--self is-cam-off" data-mehfil-local-video>
              <span class="mehfil-tile-placeholder">${esc(tt('mehfil_cam_off', 'Camera off'))}</span>
              <div class="mehfil-tile-label">${esc(tt('mehfil_you_label', 'You'))}</div>
            </div>
            <div class="mehfil-waiting" data-mehfil-waiting>
              <div class="mehfil-waiting-title">${esc(
                isGroup
                  ? tt('mehfil_waiting_group_title', 'You’re here first')
                  : tt('mehfil_waiting_dm_title', 'Waiting for them')
              )}</div>
              <div class="mehfil-waiting-msg">${esc(
                isGroup
                  ? tt('mehfil_waiting_group_msg', 'Drop-in room — invite friends or start a watch while you wait.')
                  : tt('mehfil_waiting_dm_msg', 'Ring them, send an invite, or wait a bit. You’re not Live alone.')
              )}</div>
              <div class="mehfil-waiting-actions">
                <button type="button" class="mehfil-waiting-ring" data-mehfil-waiting-ring>${esc(tt('mehfil_ring', 'Ring'))}</button>
                <button type="button" class="mehfil-waiting-invite" data-mehfil-waiting-invite>${esc(tt('mehfil_nudge', 'Invite'))}</button>
              </div>
            </div>
          </div>
        </div>
        <div class="mehfil-camera-rail" data-mehfil-camera-rail aria-label="${esc(tt('mehfil_cam_rail', 'Cameras'))}"></div>
      </div>
      <div class="mehfil-effects-layer" data-mehfil-effects-layer aria-hidden="true"></div>
      <div class="mehfil-sheets">
        <div class="mehfil-sheet mehfil-media-sheet" data-mehfil-media>
          <div class="mehfil-now" data-mehfil-now>${esc(tt('mehfil_media_hint', 'Search YouTube or paste a link'))}</div>
          <div class="mehfil-media-control" data-mehfil-media-control hidden>
            <button type="button" data-mehfil-control-host>${esc(tt('mehfil_host_controls', 'Only me'))}</button>
            <button type="button" data-mehfil-control-all>${esc(tt('mehfil_control_everyone', 'Everyone'))}</button>
          </div>
          <form class="mehfil-media-search search-field" data-mehfil-search-form>
            <input type="search" class="search-field-input search-field-hide-native-clear" placeholder="${esc(tt('mehfil_yt_search_ph', 'Search YouTube or paste a link'))}" data-mehfil-q enterkeyhint="search" autocomplete="off">
            <button type="button" class="search-field-clear" data-mehfil-clear aria-label="${esc(tt('search_clear', 'Clear search'))}" hidden>✕</button>
            <button type="submit" data-mehfil-play>${esc(tt('mehfil_search', 'Search'))}</button>
          </form>
          <div class="mehfil-yt-results" data-mehfil-yt-results hidden></div>
          <div class="mehfil-yt-recs" data-mehfil-recs hidden>
            <div class="mehfil-yt-recs-label">${esc(tt('mehfil_yt_recs', 'Suggested for the room'))}</div>
            <div class="mehfil-yt-recs-row" data-mehfil-recs-row></div>
          </div>
          <p class="mehfil-yt-paste-hint">${esc(tt('mehfil_yt_paste_hint', 'Tip: paste a YouTube link anytime'))}</p>
          <button type="button" class="mehfil-fs-btn" data-mehfil-fs hidden>${esc(tt('mehfil_immersive_enter', 'Fullscreen video'))}</button>
        </div>
        <div class="mehfil-sheet mehfil-react-tray" data-mehfil-reacts>
          ${REACTIONS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}
        </div>
        <div class="mehfil-sheet mehfil-sticker-tray" data-mehfil-stickers>
          ${STICKERS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}
        </div>
        <div class="mehfil-more-menu" data-mehfil-more>
          <button type="button" class="mehfil-more-item" data-mehfil-react-btn>
            <span class="icon" aria-hidden="true">${typeof iconHtml==='function'?iconHtml('smile',{size:18}):''}</span>
            ${esc(tt('mehfil_reactions', 'Reactions'))}
          </button>
          <button type="button" class="mehfil-more-item" data-mehfil-sticker-btn>
            <span class="icon" aria-hidden="true">${typeof iconHtml==='function'?iconHtml('sparkles',{size:18}):''}</span>
            ${esc(tt('mehfil_stickers', 'Stickers'))}
          </button>
          <button type="button" class="mehfil-more-item" data-mehfil-media-btn>
            <span class="icon" aria-hidden="true">${typeof iconHtml==='function'?iconHtml('music',{size:18}):''}</span>
            ${esc(tt('mehfil_media', 'Music / YouTube'))}
          </button>
          <button type="button" class="mehfil-more-item" data-mehfil-nudge-more>
            <span class="icon" aria-hidden="true">${typeof iconHtml==='function'?iconHtml('bell',{size:18}):''}</span>
            ${esc(tt('mehfil_nudge', 'Invite'))}
          </button>
          <button type="button" class="mehfil-more-item" data-mehfil-copy>
            <span class="icon" aria-hidden="true">${typeof iconHtml==='function'?iconHtml('link',{size:18}):''}</span>
            ${esc(tt('mehfil_copy_link', 'Copy link'))}
          </button>
          <button type="button" class="mehfil-more-item" data-mehfil-flip title="${esc(tt('mehfil_flip', 'Flip camera'))}">
            <span class="icon" aria-hidden="true">${typeof iconHtml==='function'?iconHtml('rotate-cw',{size:18}):''}</span>
            ${esc(tt('mehfil_flip', 'Flip'))}
          </button>
          <button type="button" class="mehfil-more-item" data-mehfil-share title="${esc(tt('mehfil_share', 'Share screen'))}">
            <span class="icon" aria-hidden="true">${typeof iconHtml==='function'?iconHtml('monitor',{size:18}):''}</span>
            <span data-mehfil-share-label>${esc(tt('mehfil_share', 'Share'))}</span>
          </button>
        </div>
      </div>
      <div class="mehfil-alone mehfil-alone-float" data-mehfil-alone hidden>
        <p>${esc(tt('mehfil_alone', 'You’re the only one here — invite friends to join.'))}</p>
        <div class="mehfil-alone-actions">
          <button type="button" class="mehfil-alone-ring" data-mehfil-alone-ring>${esc(tt('mehfil_ring', 'Ring'))}</button>
          <button type="button" class="mehfil-nudge-btn" data-mehfil-nudge>${esc(tt('mehfil_nudge', 'Invite to Mehfil'))}</button>
          <button type="button" class="mehfil-alone-copy" data-mehfil-alone-copy>${esc(tt('mehfil_copy_link', 'Copy link'))}</button>
        </div>
      </div>
      <div class="mehfil-chat-strip is-collapsed" data-mehfil-chat-strip aria-label="${esc(tt('mehfil_chat_expand', 'Room chat'))}">
        <button type="button" class="mehfil-chat-peek" data-mehfil-chat-toggle>
          <span class="mehfil-chat-badge" data-mehfil-chat-badge hidden>0</span>
          <span>💬</span>
          <span class="mehfil-chat-preview" data-mehfil-chat-preview>${esc(tt('mehfil_chat_empty', 'Say hello to the room'))}</span>
        </button>
        <div class="mehfil-chat-expanded">
          <div class="mehfil-chat-msgs" data-mehfil-chat-msgs></div>
          <form class="mehfil-chat-compose" data-mehfil-chat-form>
            <input type="text" maxlength="500" placeholder="${esc(tt('mehfil_msg_ph', 'Message the room…'))}" data-mehfil-chat-input enterkeyhint="send" autocomplete="off">
            <button type="submit" aria-label="${esc(tt('send', 'Send'))}">↑</button>
          </form>
        </div>
      </div>
      <div class="mehfil-dock">
        <div class="mehfil-dock-primary">
          <button type="button" class="mehfil-ctrl ${micWanted ? 'is-live' : 'is-muted'}" data-mehfil-mic title="${esc(tt('mehfil_mic', 'Microphone'))}" aria-label="${esc(tt('mehfil_mic', 'Toggle microphone'))}" aria-pressed="${micWanted ? 'true' : 'false'}">🎤</button>
          <button type="button" class="mehfil-ctrl is-off" data-mehfil-cam title="${esc(tt('mehfil_cam', 'Camera'))}" aria-label="${esc(tt('mehfil_cam', 'Toggle camera'))}" aria-pressed="false">📷</button>
          <button type="button" class="mehfil-ctrl" data-mehfil-react-quick title="${esc(tt('mehfil_reactions', 'Reactions'))}">👏</button>
          <button type="button" class="mehfil-ctrl" data-mehfil-more-btn title="${esc(tt('mehfil_more', 'More'))}" aria-label="${esc(tt('mehfil_more', 'More call actions'))}" aria-haspopup="true">${typeof iconHtml==='function'?iconHtml('more-vertical',{size:20}):'⋮'}</button>
        </div>
        <button type="button" class="mehfil-leave" data-mehfil-leave title="${esc(tt('mehfil_leave', 'Leave'))}" aria-label="${esc(tt('mehfil_leave', 'Leave Mehfil'))}">${esc(tt('mehfil_leave', 'Leave'))}</button>
      </div>`;

    const host = shellHost();
    host.classList.add('is-mehfil-open');
    try {
      document.documentElement.classList.add('mehfil-open');
    } catch (e) {}

    overlayEl = el;
    activeChatId = chatId;
    activeChat = chat;

    const onDismiss = () => {
      // Called from nav-stack popstate / openLayer.close
      joinGeneration += 1;
      teardownMehfil('nav_dismiss');
      leaving = false;
    };

    if (typeof openLayer === 'function') {
      layerHandle = openLayer(el, onDismiss, {
        host,
        remove: false,
        role: 'dialog',
        label: tt('mehfil_title', 'Mehfil'),
      });
    } else {
      host.appendChild(el);
      el.dataset.navManaged = '1';
      if (typeof pushNavLayer === 'function') pushNavLayer(el, onDismiss);
    }

    if (typeof enableSwipeBack === 'function') {
      enableSwipeBack(el, () => {
        if (typeof hasNavLayers === 'function' && hasNavLayers()) {
          try {
            history.back();
          } catch (e) {
            leaveMehfil();
          }
        } else leaveMehfil();
      });
    }

    applyMehfilTheme(el);

    el.addEventListener('pointerdown', (e) => {
      if (
        e.target.closest(
          '.mehfil-dock, .mehfil-sheets, .mehfil-sheet, .mehfil-more-menu, .mehfil-top, .mehfil-chat-strip, .mehfil-chat-expanded'
        )
      ) {
        pokeChrome();
        return;
      }
      if (e.target.closest('[data-mehfil-stage-main]') && !e.target.closest('.mehfil-tile, .mehfil-yt, iframe')) {
        collapseChatStrip();
      }
      pokeChrome();
    });
    pokeChrome();

    el.querySelector('[data-mehfil-theme-toggle]')?.addEventListener('click', toggleMehfilTheme);
    el.querySelector('[data-mehfil-immersive]')?.addEventListener('click', toggleImmersive);
    el.querySelector('[data-mehfil-leave-top]')?.addEventListener('click', () => leaveMehfil());
    el.querySelector('[data-mehfil-chat-toggle]')?.addEventListener('click', () => {
      const strip = chatStripEl();
      if (strip?.classList.contains('is-expanded')) collapseChatStrip();
      else expandChatStrip();
    });
    el.querySelector('[data-mehfil-stage-main]')?.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.mehfil-tile, .mehfil-yt, iframe, button')) collapseChatStrip();
    });
    el.querySelector('[data-mehfil-react-quick]')?.addEventListener('click', () => toggleCallSheet('reacts'));
    el.querySelector('[data-mehfil-fs]')?.addEventListener('click', requestStageFullscreen);
    // Host / controlUid plumbing kept for M3 media ownership — no half-UI delegate picker in M0.
    el.querySelector('[data-mehfil-control-host]')?.addEventListener('click', async () => {
      if (!activeChatId || !currentUser?.uid) return;
      await rtdbRef(`mehfil/${activeChatId}/media`)?.update({
        hostUid: currentUser.uid,
        controlMode: 'host',
        controlUid: null,
      });
    });
    el.querySelector('[data-mehfil-control-all]')?.addEventListener('click', async () => {
      if (!activeChatId || cachedMediaState?.hostUid !== currentUser?.uid) return;
      await rtdbRef(`mehfil/${activeChatId}/media`)?.update({ controlMode: 'all', controlUid: null });
    });
    el.querySelector('[data-mehfil-chat-form]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = el.querySelector('[data-mehfil-chat-input]');
      const text = String(input?.value || '').trim();
      if (!text || !activeChatId) return;
      const ref = rtdbRef(`mehfil/${activeChatId}/chat`);
      if (!ref) {
        if (typeof showToast === 'function') showToast(tt('mehfil_rtdb_missing', 'Room chat needs Realtime Database.'));
        return;
      }
      input.value = '';
      try {
        await ensureMehfilParticipant(activeChatId);
        await ref.push({
          text: text.slice(0, 500),
          by: currentUser?.uid || null,
          name: userProfile?.name || userProfile?.username || digitalProfile?.displayName || 'You',
          at: Date.now(),
        });
      } catch (err) {
        if (typeof reportClientError === 'function') {
          reportClientError({ feature: 'mehfil_chat', message: err?.message || String(err) });
        }
        if (typeof showToast === 'function') showToast(tt('mehfil_send_fail', 'Could not send'));
      }
    });

    el.querySelector('[data-mehfil-leave]')?.addEventListener('click', () => {
      if (layerHandle) layerHandle.close();
      else leaveMehfil();
    });
    el.querySelector('[data-mehfil-mic]')?.addEventListener('click', toggleMic);
    el.querySelector('[data-mehfil-cam]')?.addEventListener('click', toggleCam);
    el.querySelector('[data-mehfil-more-btn]')?.addEventListener('click', () => toggleCallSheet('more'));
    el.querySelector('[data-mehfil-react-btn]')?.addEventListener('click', () => toggleCallSheet('reacts'));
    el.querySelector('[data-mehfil-sticker-btn]')?.addEventListener('click', () => toggleCallSheet('stickers'));
    el.querySelector('[data-mehfil-media-btn]')?.addEventListener('click', () => {
      toggleCallSheet('media');
      loadMehfilYtRecs(el);
      const fsBtn = el.querySelector('[data-mehfil-fs]');
      if (fsBtn) fsBtn.hidden = !hasYoutubeOnStage();
      const ctrl = el.querySelector('[data-mehfil-media-control]');
      if (ctrl && cachedMediaState?.hostUid === currentUser?.uid) ctrl.hidden = false;
    });
    el.querySelector('[data-mehfil-ring]')?.addEventListener('click', () => startMehfilRing(activeChat));
    el.querySelector('[data-mehfil-waiting-ring]')?.addEventListener('click', () => startMehfilRing(activeChat));
    el.querySelector('[data-mehfil-alone-ring]')?.addEventListener('click', () => startMehfilRing(activeChat));
    el.querySelector('[data-mehfil-waiting-invite]')?.addEventListener('click', nudgeOthers);
    el.querySelector('[data-mehfil-alone-copy]')?.addEventListener('click', copyInviteLink);
    el.querySelector('[data-mehfil-ring-cancel]')?.addEventListener('click', cancelOutboundRing);
    el.querySelector('[data-mehfil-stop-share]')?.addEventListener('click', () => {
      if (localScreen) toggleScreenShare();
    });
    el.querySelector('[data-mehfil-flip]')?.addEventListener('click', flipCamera);
    el.querySelector('[data-mehfil-share]')?.addEventListener('click', toggleScreenShare);
    el.querySelector('[data-mehfil-nudge]')?.addEventListener('click', nudgeOthers);
    el.querySelector('[data-mehfil-nudge-more]')?.addEventListener('click', () => {
      closeCallSheets(null);
      nudgeOthers();
    });
    el.querySelector('[data-mehfil-copy]')?.addEventListener('click', () => {
      closeCallSheets(null);
      copyInviteLink();
    });
    el.querySelectorAll('[data-mehfil-reacts] button, [data-mehfil-stickers] button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const emoji = btn.dataset.emoji;
        const isSticker = btn.closest('[data-mehfil-stickers]');
        if (isSticker) showStickerBurst(emoji);
        else showReactionBurst(emoji);
        if (!activeChatId) return;
        const ref = rtdbRef(`mehfil/${activeChatId}/reactions`);
        if (!ref) {
          if (typeof showToast === 'function') showToast(tt('mehfil_rtdb_missing', 'Room chat needs Realtime Database.'));
          return;
        }
        try {
          await ensureMehfilParticipant(activeChatId);
          await ref.push({
            emoji,
            by: currentUser?.uid || null,
            at: Date.now(),
          });
        } catch (e) {
          if (typeof showToast === 'function') showToast(tt('mehfil_react_fail', 'Could not send reaction'));
        }
        pokeChrome();
      });
    });
    el.querySelector('[data-mehfil-search-form]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      searchAndPlay(el.querySelector('[data-mehfil-q]')?.value);
    });
    const mehfilQ = el.querySelector('[data-mehfil-q]');
    if (typeof enhanceSearchField === 'function' && mehfilQ && !mehfilQ.dataset.searchFieldWired) {
      enhanceSearchField(mehfilQ, {
        clearBtn: el.querySelector('[data-mehfil-clear]'),
        surfaceId: 'mehfil',
        onClear() {
          const host = el.querySelector('[data-mehfil-results]') || el.querySelector('#mehfilYtResults');
          if (host) host.innerHTML = '';
        },
      });
    }

    await ensureMehfilParticipant(chatId);
    bindMembersList(chatId);
    bindMediaSync();

    // DM call-like: auto-ring when alone after a short presence settle.
    if (!isGroup) {
      setTimeout(() => {
        if (!overlayEl || activeChatId !== chatId || dmAutoRingDone) return;
        if (lastKnownFreshCount > 1) return;
        dmAutoRingDone = true;
        startMehfilRing(activeChat).catch(() => {});
      }, 700);
    }

    if (!flagAllows) {
      showStageError(
        tt('mehfil_flag_off', 'Mehfil voice is paused right now. Room chat and YouTube sync still work.'),
        { fatal: false }
      );
      setMehfilStatus(tt('mehfil_chat_only', 'Chat only'), 'warn');
      setAvControlsEnabled('none');
      return;
    }

    await joinAgora(chatId, gen);
  }

  /**
   * Shared join entry — retries while mehfil.js finishes loading (no dead toast).
   */
  function ensureOpenMehfil(chat) {
    if (!chat) return;
    if (typeof openMehfil === 'function') {
      return openMehfil(chat);
    }
    let tries = 0;
    let pending = document.getElementById('mehfilJoinPending');
    if (!pending) {
      pending = document.createElement('div');
      pending.id = 'mehfilJoinPending';
      pending.className = 'mehfil-join-pending';
      pending.setAttribute('role', 'status');
      pending.textContent = tt('mehfil_joining', 'Joining Mehfil…');
      shellHost()?.appendChild(pending);
    }
    const tick = setInterval(() => {
      tries += 1;
      if (typeof window.openMehfil === 'function') {
        clearInterval(tick);
        pending?.remove();
        window.openMehfil(chat);
      } else if (tries > 40) {
        clearInterval(tick);
        pending?.remove();
        if (typeof showToast === 'function') {
          showToast(tt('mehfil_unavailable', 'Mehfil unavailable — try again'));
        }
      }
    }, 100);
  }

  /** Live presence — Live only if ≥2 fresh in_room participants (incl. viewer when present). */
  function watchMehfilPresence(chatId, cb) {
    if (!chatId || typeof cb !== 'function') return () => {};
    if (!presenceWatchers.has(chatId)) presenceWatchers.set(chatId, new Set());
    presenceWatchers.get(chatId).add(cb);

    const emitOff = () => {
      try {
        cb({
          count: 0,
          othersCount: 0,
          totalCount: 0,
          uids: [],
          allUids: [],
          participants: {},
          live: false,
          isLive: false,
          waiting: false,
          label: '',
        });
      } catch (e) {}
    };
    emitOff();

    if (!presenceUnsubs.has(chatId)) {
      const ref = rtdbRef(`mehfil/${chatId}/participants`);
      if (ref) {
        const handler = (snap) => {
          const val = snap.val() || {};
          const state = mehfilLiveState(val);
          if (state.staleUids && state.staleUids.length) {
            pruneStaleParticipants(chatId, state.staleUids);
          }
          const set = presenceWatchers.get(chatId);
          set?.forEach((fn) => {
            try {
              fn(state);
            } catch (e) {}
          });
        };
        ref.on('value', handler);
        presenceUnsubs.set(chatId, () => ref.off('value', handler));
      }
    }

    return () => {
      const set = presenceWatchers.get(chatId);
      set?.delete(cb);
      if (set && set.size === 0) {
        presenceWatchers.delete(chatId);
        const unsub = presenceUnsubs.get(chatId);
        try {
          unsub?.();
        } catch (e) {}
        presenceUnsubs.delete(chatId);
      }
    };
  }

  function mehfilEligible(chat) {
    return !isMehfilBlockedChat(chat);
  }

  function renderMehfilMark(size) {
    return mehfilMarkHtml(size);
  }

  function consumeMehfilAutoJoin() {
    const id = mehfilAutoJoinPending;
    mehfilAutoJoinPending = null;
    return id || null;
  }

  const guardMehfil = typeof safeFeature === 'function' ? safeFeature : (n, f) => f;
  window.openMehfil = guardMehfil('mehfil_open', openMehfil);
  window.ensureOpenMehfil = ensureOpenMehfil;
  window.leaveMehfil = guardMehfil('mehfil_leave', leaveMehfil);
  window.abandonMehfil = abandonMehfil;
  window.watchMehfilPresence = watchMehfilPresence;
  window.mehfilLiveState = mehfilLiveState;
  window.mehfilEligible = mehfilEligible;
  window.mehfilMarkHtml = renderMehfilMark;
  window.isMehfilOpen = () => !!overlayEl;
  window.startMehfilRing = guardMehfil('mehfil_ring', startMehfilRing);
  window.requestMehfilAutoJoin = (chatId) => {
    mehfilAutoJoinPending = chatId ? String(chatId) : null;
  };
  window.consumeMehfilAutoJoin = consumeMehfilAutoJoin;
  window.MEHFIL_WAITING_LABEL = MEHFIL_WAITING_LABEL;
  window.MEHFIL_PRESENCE_FRESH_MS = PRESENCE_FRESH_MS;

  try {
    bindMehfilRingInbox();
    if (typeof auth !== 'undefined' && auth?.onAuthStateChanged) {
      auth.onAuthStateChanged((user) => {
        if (!user) {
          abandonMehfil('signout').catch(() => {});
          clearIncomingRingUi();
        }
        bindMehfilRingInbox();
      });
    }
    window.addEventListener('pagehide', () => {
      if (overlayEl) abandonMehfil('pagehide');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && overlayEl) {
        abandonMehfil('background');
      }
    });
  } catch (e) {}
})();
