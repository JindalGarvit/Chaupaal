/**
 * Talk while you play — compact chat + voice/video on the game overlay.
 * Reuses Baithak messages and Agora tokens (same as Mehfil). No extra serverless fn.
 */
(function () {
  'use strict';

  const AGORA_CDN = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.20.2.js';
  let callClient = null;
  let localAudio = null;
  let localVideo = null;
  let callChatId = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function chatIdOf(chat) {
    return (chat && (chat.firestoreId || chat.id)) || '';
  }

  function channelForChat(chatId) {
    return ('mh_' + String(chatId || '').replace(/[^a-zA-Z0-9_-]/g, '')).slice(0, 64);
  }

  async function ensureAgora() {
    if (window.AgoraRTC) return window.AgoraRTC;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = AGORA_CDN;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return window.AgoraRTC;
  }

  async function leaveCall() {
    try {
      if (localAudio) {
        localAudio.stop();
        localAudio.close();
      }
    } catch (e) {}
    try {
      if (localVideo) {
        localVideo.stop();
        localVideo.close();
      }
    } catch (e) {}
    localAudio = null;
    localVideo = null;
    try {
      if (callClient) await callClient.leave();
    } catch (e) {}
    callClient = null;
    callChatId = null;
  }

  async function startCall(chat, video) {
    const chatId = chatIdOf(chat);
    if (!chatId) {
      if (typeof showToast === 'function') showToast('Open a friend challenge to talk in-game');
      return false;
    }
    if (typeof isMehfilOpen === 'function' && isMehfilOpen()) {
      if (typeof showToast === 'function') showToast('Already in Mehfil — talk there');
      return false;
    }
    if (typeof apiFetch !== 'function') return false;
    if (typeof pauseAllMusic === 'function') pauseAllMusic();
    let tokenPayload = null;
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'agora_token', channel: channelForChat(chatId) },
      });
      tokenPayload = envelope?.data;
    } catch (e) {
      tokenPayload = null;
    }
    if (!tokenPayload?.configured || !tokenPayload.token) {
      if (typeof showToast === 'function') {
        showToast('Voice isn’t live yet — chat still works. Add Agora keys when ready.');
      }
      return false;
    }
    await leaveCall();
    const AgoraRTC = await ensureAgora();
    callClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    callChatId = chatId;
    callClient.on('user-published', async (user, mediaType) => {
      await callClient.subscribe(user, mediaType);
      if (mediaType === 'audio') user.audioTrack?.play();
      if (mediaType === 'video') {
        const box = document.querySelector('[data-play-comm-remote]');
        if (box) {
          box.hidden = false;
          user.videoTrack.play(box);
        }
      }
    });
    await callClient.join(tokenPayload.appId, tokenPayload.channel, tokenPayload.token, tokenPayload.uid || null);
    localAudio = await AgoraRTC.createMicrophoneAudioTrack();
    await callClient.publish(localAudio);
    if (video) {
      localVideo = await AgoraRTC.createCameraVideoTrack();
      const localBox = document.querySelector('[data-play-comm-local]');
      if (localBox) {
        localBox.hidden = false;
        localVideo.play(localBox);
      }
      await callClient.publish(localVideo);
    }
    if (typeof haptic === 'function') haptic('medium');
    return true;
  }

  function attachDangalPlayComm(overlay, opts) {
    const o = opts || {};
    const chat = o.chat;
    if (!overlay) return;
    const hasChat = !!(chat && chatIdOf(chat) && (typeof opponentUidFromChat === 'function' ? opponentUidFromChat(chat) : chat.peerUid));
    const host = document.querySelector('.device') || overlay;
    document.querySelectorAll('[data-play-comm]').forEach((el) => el.remove());
    const dock = document.createElement('div');
    dock.className = 'play-comm play-comm--corner';
    dock.setAttribute('data-play-comm', '1');
    dock.setAttribute('data-nav-ignore', '1');
    dock.innerHTML = `
      <div class="play-comm-videos">
        <div class="play-comm-video" data-play-comm-remote hidden></div>
        <div class="play-comm-video play-comm-video--me" data-play-comm-local hidden></div>
      </div>
      <div class="play-comm-dock">
        <button type="button" class="play-comm-btn" data-comm="chat" aria-label="Chat">${hasChat ? '💬' : '👤'}</button>
        <button type="button" class="play-comm-btn" data-comm="mic" aria-label="Voice">🎤</button>
        <button type="button" class="play-comm-btn" data-comm="cam" aria-label="Video">📹</button>
        <button type="button" class="play-comm-btn is-hang" data-comm="hang" hidden aria-label="Leave call">✕</button>
      </div>
      <div class="play-comm-sheet" data-comm-sheet hidden>
        <div class="play-comm-msgs" data-comm-msgs></div>
        <form class="play-comm-form" data-comm-form>
          <input type="text" maxlength="400" placeholder="${hasChat ? 'Message…' : 'Challenge a friend to talk'}" ${hasChat ? '' : 'disabled'} />
          <button type="submit" ${hasChat ? '' : 'disabled'}>Send</button>
        </form>
      </div>`;
    host.appendChild(dock);

    const sheet = dock.querySelector('[data-comm-sheet]');
    const msgsEl = dock.querySelector('[data-comm-msgs]');
    const hangBtn = dock.querySelector('[data-comm="hang"]');
    let unsub = null;
    let inCall = false;

    function setCallUi(on) {
      inCall = on;
      hangBtn.hidden = !on;
      dock.classList.toggle('is-live', on);
    }

    async function pickFriendAndChat() {
      if (typeof openFriendPickerSheet !== 'function') {
        if (typeof showToast === 'function') showToast('Open this game from a chat to talk');
        return;
      }
      const f = await openFriendPickerSheet({ title: 'Talk while you play', subtitle: 'Challenge a friend' });
      if (!f) return;
      if (typeof showToast === 'function') showToast('Send a challenge from Baithak to play & talk together');
    }

    dock.querySelector('[data-comm="chat"]').addEventListener('click', async () => {
      if (!hasChat) return pickFriendAndChat();
      sheet.hidden = !sheet.hidden;
      if (!sheet.hidden) listenMessages();
    });
    dock.querySelector('[data-comm="mic"]').addEventListener('click', async () => {
      if (!hasChat) return pickFriendAndChat();
      const ok = await startCall(chat, false);
      setCallUi(!!ok);
    });
    dock.querySelector('[data-comm="cam"]').addEventListener('click', async () => {
      if (!hasChat) return pickFriendAndChat();
      const ok = await startCall(chat, true);
      setCallUi(!!ok);
    });
    hangBtn.addEventListener('click', async () => {
      await leaveCall();
      setCallUi(false);
      dock.querySelector('[data-play-comm-remote]').hidden = true;
      dock.querySelector('[data-play-comm-local]').hidden = true;
    });

    dock.querySelector('[data-comm-form]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = dock.querySelector('.play-comm-form input');
      const text = String(input?.value || '').trim();
      if (!text || !hasChat) return;
      input.value = '';
      try {
        if (typeof sendRealtimeMessage === 'function') {
          await sendRealtimeMessage(chatIdOf(chat), text, false, null, null);
        }
        if (typeof haptic === 'function') haptic('light');
      } catch (err) {
        if (typeof showToast === 'function') showToast('Couldn’t send');
      }
    });

    function listenMessages() {
      if (unsub || !hasChat || typeof db === 'undefined' || !db) return;
      const cid = chatIdOf(chat);
      unsub = db
        .collection('chats')
        .doc(cid)
        .collection('messages')
        .orderBy('ts', 'desc')
        .limit(12)
        .onSnapshot((snap) => {
          const me = typeof getCurrentUid === 'function' ? getCurrentUid() : '';
          const rows = snap.docs
            .map((d) => d.data())
            .reverse()
            .filter((m) => m && m.text);
          msgsEl.innerHTML = rows
            .map((m) => {
              const mine = m.uid === me;
              return `<div class="play-comm-msg${mine ? ' is-me' : ''}">${esc(m.text)}</div>`;
            })
            .join('');
          msgsEl.scrollTop = msgsEl.scrollHeight;
        });
    }

    function teardownComm() {
      if (unsub) {
        try {
          unsub();
        } catch (e) {}
        unsub = null;
      }
      leaveCall();
      dock.remove();
    }
    const obs = new MutationObserver(() => {
      if (!overlay.isConnected) {
        obs.disconnect();
        teardownComm();
      }
    });
    obs.observe(host, { childList: true, subtree: true });
  }

  window.attachDangalPlayComm = attachDangalPlayComm;
  window.leaveDangalPlayCall = leaveCall;
})();
