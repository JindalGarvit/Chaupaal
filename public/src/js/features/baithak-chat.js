// ===================== CHAT SCREEN =====================
let activeChatScreen = null;
let chatInboxRefreshTimer = null;
/** @type {SpeechRecognition|null} */
let activeChatRecognition = null;
/** @type {((e: MouseEvent) => void)|null} */
let activeChatAttachDocClick = null;

/**
 * Single cleanup path for chat close (← button, history back, replace chat, Muqabala handoff).
 * Closes nested overlays (AI keyboard, games, challenge creator, ritual, pickers) and
 * tears down listeners / realtime / mic / suggestion timers.
 */
function closeChatScreen(opts = {}) {
  const { updateHistory = true, animate = true } = opts;

  // Keep in-app music playing when leaving chat — mini-player owns stop/dismiss
  if (typeof stopChatPresence === 'function') stopChatPresence();
  if (typeof clearChatPresenceSubs === 'function') clearChatPresenceSubs();
  if (typeof ChatRating?.stopPolling === 'function') ChatRating.stopPolling();

  if (typeof endOverlayScope === 'function') {
    endOverlayScope(typeof OVERLAY_SCOPE_CHAT === 'string' ? OVERLAY_SCOPE_CHAT : 'chat');
  } else if (typeof closeAiKeyboard === 'function') {
    closeAiKeyboard();
  }

  if (typeof aiSuggestTimeout !== 'undefined' && aiSuggestTimeout) {
    clearTimeout(aiSuggestTimeout);
    aiSuggestTimeout = null;
  }

  try {
    activeChatRecognition?.stop?.();
  } catch (e) {}
  activeChatRecognition = null;

  if (activeChatAttachDocClick) {
    document.removeEventListener('click', activeChatAttachDocClick);
    activeChatAttachDocClick = null;
  }

  if (typeof activeChatListener !== 'undefined' && activeChatListener) {
    try {
      activeChatListener();
    } catch (e) {}
    activeChatListener = null;
  }

  const screen = activeChatScreen || document.getElementById('activeChatScreen');
  try {
    screen?._mehfilPresenceUnsub?.();
  } catch (e) {}
  activeChatScreen = null;

  if (screen) {
    if (typeof removeNavLayer === 'function') removeNavLayer(screen);
    const finish = () => {
      try {
        screen.remove();
      } catch (e) {}
    };
    if (animate && screen.classList.contains('open')) {
      screen.classList.remove('open');
      setTimeout(finish, 300);
    } else {
      finish();
    }
  }

  if (updateHistory && !opts.fromHistory) {
    try {
      const onDeepRoute =
        history.state?.chaupaalDeep ||
        (location.pathname && location.pathname !== '/' && /\/(?:chat|c)\//.test(location.pathname));
      if (onDeepRoute) {
        history.back();
      }
    } catch (e) {}
  }

  try {
    if (typeof restoreAppShell === 'function') restoreAppShell('chat_close');
    else if (typeof clearKeyboardInset === 'function') clearKeyboardInset();
  } catch (e) {}

  // Nudge mini-player now that in-card chrome may be gone
  try {
    const a = window.__chaupaalSharedAudio;
    if (a && typeof syncMiniPlayer === 'function') syncMiniPlayer(a);
  } catch (e) {}
}

function setChatComposerReady(screen, ready, statusText) {
  if (screen) screen.dataset.chatReady = ready ? '1' : '0';
  ['chatMsgInput', 'chatSendBtn', 'chatPlusBtn', 'chatMicBtn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !ready;
  });
  const statusEl = document.getElementById('chatActivityStatus');
  if (statusEl && statusText) statusEl.textContent = statusText;
  if (ready) document.getElementById('chatMsgInput')?.focus();
}

function scheduleChatInboxRefresh() {
  clearTimeout(chatInboxRefreshTimer);
  chatInboxRefreshTimer = setTimeout(() => {
    if (typeof rememberInboxChat === 'function' && window.currentOpenChat) {
      rememberInboxChat(window.currentOpenChat);
    }
    if (typeof loadBaithakChatsPage === 'function') {
      loadBaithakChatsPage({ reset: false }).catch(() => {});
    }
  }, 450);
}

function markMsgRowFailed(row, text, chat, isGroup) {
  if (!row) return;
  row.removeAttribute('data-pending');
  row.dataset.failed = '1';
  const status = row.querySelector('.msg-status');
  if (status) {
    status.textContent = '!';
    status.classList.remove('is-sent');
    status.classList.add('is-failed');
    status.title = 'Failed · Tap to retry';
  }
  const retry = () => {
    row.remove();
    const input = document.getElementById('chatMsgInput');
    if (input) {
      input.value = text;
      sendMsg(chat);
    }
  };
  row.querySelector('.msg-bubble')?.addEventListener('click', retry, { once: true });
  status?.addEventListener('click', retry, { once: true });
}

async function prepareChatThread(chat, screen, { isGroup, isSelf, isChaupaal }) {
  const area = document.getElementById('chatMsgsArea');
  if (!area) return;

  let chatId = chat.firestoreId || chat.id;
  const needsBootstrap = !isGroup && !isSelf && !isChaupaal;
  const peerEarly =
    chat.uid ||
    chat.peerUid ||
    chat.otherUid ||
    (chat.participants || []).find((u) => u && u !== currentUser?.uid);

  // Remap stubs to canonical before paint/remember
  if (needsBootstrap && peerEarly && typeof dmChatIdFor === 'function') {
    const canon = dmChatIdFor(peerEarly);
    if (canon && chatId !== canon) {
      chatId = canon;
      chat.firestoreId = canon;
      chat.id = canon;
      chat.uid = peerEarly;
      chat.peerUid = peerEarly;
      window.currentOpenChat = chat;
    }
  }

  // Instant composer when peer + canonical id known; verify in background
  if (needsBootstrap && peerEarly && chatId && typeof dmChatIdFor === 'function' && chatId === dmChatIdFor(peerEarly)) {
    setChatComposerReady(screen, true, 'Checking activity…');
  } else if (needsBootstrap) {
    setChatComposerReady(screen, false, 'Connecting…');
  }

  // Paint IDB cache before any network wait
  if (typeof baithakMsgCache?.get === 'function' && chatId) {
    try {
      const cached = await baithakMsgCache.get(chatId);
      if (cached?.messages?.length) {
        area.querySelectorAll('.ui-skeleton-stack').forEach((el) => el.remove());
        if (!area.querySelector('.msg-row')) {
          cached.messages.forEach((m) => {
            const mine = m.uid === currentUser?.uid;
            const node = addMsgBubble(
              {
                from: mine ? 'me' : 'them',
                text: m.text,
                time: m.ts ? new Date(m.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
                avatar: m.avatar || '👤',
                name: m.name,
                profileType: m.profileType,
                music: m.music,
                attachment: m.attachment,
                uid: m.uid,
              },
              isGroup
            );
            if (node && m.id) {
              node.dataset.msgId = m.id;
              node.setAttribute('data-msg-id', m.id);
            }
            if (node && m.clientTempId) node.dataset.clientTempId = m.clientTempId;
          });
        }
      } else if (needsBootstrap && !area.querySelector('.msg-row') && typeof renderSkeleton === 'function') {
        renderSkeleton(area, { variant: 'list', count: 3 });
      }
    } catch (e) {
      if (needsBootstrap && !area.querySelector('.msg-row') && typeof renderSkeleton === 'function') {
        renderSkeleton(area, { variant: 'list', count: 3 });
      }
    }
  } else if (needsBootstrap && typeof renderSkeleton === 'function') {
    renderSkeleton(area, { variant: 'list', count: 3 });
  }

  try {
    if (isSelf && typeof ensureSelfChatDoc === 'function') {
      const id = await ensureSelfChatDoc();
      if (id) {
        chatId = id;
        chat.firestoreId = id;
        chat.id = id;
        window.currentOpenChat = chat;
      }
    } else if (isChaupaal && typeof ensureChaupaalChatDoc === 'function') {
      const id = await ensureChaupaalChatDoc();
      if (id) {
        chatId = id;
        chat.firestoreId = id;
        chat.id = id;
        window.currentOpenChat = chat;
      }
    } else if (needsBootstrap) {
      const peer = peerEarly;
      if (peer) {
        if (typeof bootstrapDmChat === 'function') {
          const boot = await bootstrapDmChat({
            uid: peer,
            name: chat._realName || chat.name,
            username: chat.username,
            photoURL: chat.photoURL,
            avatar: chat.avatar,
            origin: chat.origin || chat.discoveryOrigin || 'inbox',
            peerProfileType: chat.peerProfileType || chat.profileType,
            matchMeta: chat.matchMeta,
          });
          if (boot) {
            const realName = chat._realName || (!isGenericDmTitle?.(chat.name) ? chat.name : '') || boot._realName || boot.name;
            Object.assign(chat, boot);
            if (realName && !isGenericDmTitle?.(realName)) {
              chat._realName = realName;
              if (!BaithakSearch?.getDmNickname?.(peer)) chat.name = realName;
            }
            chatId = boot.firestoreId || boot.id;
            window.currentOpenChat = chat;
            if (typeof rememberInboxChat === 'function') rememberInboxChat(chat);
          }
        } else if (typeof ensurePeerDmChat === 'function') {
          const id = await ensurePeerDmChat(peer);
          if (id) {
            chatId = id;
            chat.firestoreId = id;
            chat.id = id;
            chat.uid = chat.uid || peer;
            chat.participants = currentUser?.uid ? [currentUser.uid, peer].sort() : chat.participants;
            window.currentOpenChat = chat;
            if (typeof rememberInboxChat === 'function') rememberInboxChat(chat);
          }
        }
      }
    }

    if (chatId === 'chat_self' && typeof selfChatId === 'function' && currentUser?.uid) {
      chatId = selfChatId(currentUser.uid);
      chat.firestoreId = chatId;
      chat.id = chatId;
    }
  } catch (e) {
    console.warn('[chat] ensure before listen', e?.message || e);
    if (typeof reportClientError === 'function') {
      reportClientError({ feature: 'ensure_before_listen', message: e?.message || String(e) });
    }
    if (needsBootstrap) {
      setChatComposerReady(screen, false, 'Could not connect — go back and try again');
      if (typeof renderErrorState === 'function') {
        renderErrorState(area, {
          message: typeof friendlyDmError === 'function' ? friendlyDmError(e) : 'Could not open chat',
          onRetry: () => prepareChatThread(chat, screen, { isGroup, isSelf, isChaupaal }),
        });
      }
      if (typeof showToast === 'function') {
        showToast(typeof friendlyDmError === 'function' ? friendlyDmError(e) : e?.message || 'Could not open chat', 3000, { type: 'error' });
      }
      return;
    }
  }

  area.scrollTop = area.scrollHeight;
  loadRealtimeMessages(chatId, area, isGroup);

  const peerUid =
    chat.uid ||
    chat.peerUid ||
    chat.otherUid ||
    (Array.isArray(chat.participants) ? chat.participants.find((u) => u && u !== currentUser?.uid) : null);
  if (peerUid) chat.uid = peerUid;

  if (!isSelf && !isChaupaal && !isGroup && peerUid && typeof hydrateInboxPeers === 'function') {
    hydrateInboxPeers([chat])
      .then(() => {
        const nameEl = screen.querySelector('.chat-header-name');
        const avEl = screen.querySelector('.chat-header-avatar');
        const title =
          typeof resolveBaithakTitle === 'function'
            ? resolveBaithakTitle(chat, currentUser?.uid)
            : BaithakSearch?.resolveChatDisplayName?.(chat, chat._realName || chat.name) || chat.name;
        if (nameEl && title) {
          nameEl.innerHTML =
            typeof formatDisplayNameHtml === 'function' ? formatDisplayNameHtml(title, chat) : chatEsc(title);
        }
        if (avEl && typeof chatAvatarMarkup === 'function') avEl.innerHTML = chatAvatarMarkup(chat);
      })
      .catch(() => {});
  }

  if (isSelf || isChaupaal) {
    setChatComposerReady(screen, true, isChaupaal ? 'Your space with Chaupaal' : 'Notes to self · testing space');
  } else if (isGroup) {
    setChatComposerReady(screen, true, 'Group chat');
  } else if (!peerUid) {
    setChatComposerReady(screen, false, 'Could not connect');
  } else {
    setChatComposerReady(screen, true, 'Checking activity…');
    if (!isGroup && chat.uid) injectChatActivityStatus(chat.uid);
    else {
      const el = document.getElementById('chatActivityStatus');
      if (el) el.textContent = '';
    }
  }
}

function openChatScreen(chat){
  if (typeof clearBaithakSearch === 'function') clearBaithakSearch({ restoreList: false });
  // Teen Mode: reciprocal friends only (or other minors) for stranger DMs
  try {
    const isSelfEarly = typeof isSelfChat === 'function' && isSelfChat(chat);
    const isChaupaalEarly = typeof isChaupaalChat === 'function' && isChaupaalChat(chat);
    const isGroupEarly = chat?.type === 'group';
    if (!isSelfEarly && !isChaupaalEarly && !isGroupEarly && typeof canMessageTarget === 'function') {
      const peerUid = chat.uid || chat.peerUid || (chat.participants || []).find((u) => u !== currentUser?.uid);
      const peer = {
        uid: peerUid,
        age: chat.age,
        dob: chat.dob,
        dateOfBirth: chat.dateOfBirth,
        teenMode: chat.teenMode,
        isMinor: chat.isMinor,
        parentalConsent: chat.parentalConsent,
      };
      const rel =
        typeof relationshipState === 'function' && peerUid
          ? relationshipState(peerUid)
          : { friend: !!chat.isFriend };
      const gate = canMessageTarget(peer, rel);
      if (!gate.ok) {
        if (typeof showToast === 'function') {
          showToast(
            gate.reason === 'teen_adult_stranger'
              ? 'Teen Mode: message friends (or other teens) only'
              : 'This teen can only be messaged by friends'
          );
        }
        return;
      }
    }
  } catch (e) {}

  // Replace any existing chat with full cleanup (nested panels included)
  if (activeChatScreen || document.getElementById('activeChatScreen')) {
    closeChatScreen({ updateHistory: false, animate: false });
  }

  const screen = document.createElement('div');
  screen.id = 'activeChatScreen';
  screen.className = 'chat-screen';
  const isSelf = typeof isSelfChat==='function' && isSelfChat(chat);
  const isChaupaal = typeof isChaupaalChat==='function' && isChaupaalChat(chat);
  const isGroup = chat.type === 'group';
  const previewJoin = !!(chat._previewJoin && isGroup && currentUser?.uid && !(chat.participants || []).includes(currentUser.uid));
  const headerTitle =
    typeof resolveBaithakTitle === 'function'
      ? resolveBaithakTitle(chat, currentUser?.uid)
      : typeof BaithakSearch !== 'undefined' && typeof BaithakSearch.resolveChatDisplayName === 'function'
        ? BaithakSearch.resolveChatDisplayName(chat, chat._realName || chat.name || '')
        : chat._realName || chat.name || '';
  const msgs = SAMPLE_MESSAGES[chat.id] || SAMPLE_MESSAGES[chat.firestoreId] || (isSelf ? SAMPLE_MESSAGES.chat_self : null) || [];
  const hasDuelStreak = !isGroup && !isSelf && !isChaupaal && chat.duelStreak;
  // Remap stub ids before opening
  if (!isGroup && !isSelf && !isChaupaal) {
    const peer =
      chat.uid || chat.peerUid || chat.otherUid || (chat.participants || []).find((u) => u && u !== currentUser?.uid);
    if (peer && typeof dmChatIdFor === 'function') {
      const canon = dmChatIdFor(peer);
      if (canon) {
        chat.firestoreId = canon;
        chat.id = canon;
        chat.uid = peer;
        chat.peerUid = peer;
      }
    }
  }
  screen.dataset.chatId = chat.firestoreId || chat.id || '';
  screen.dataset.chatReady = isSelf || isChaupaal || isGroup ? '1' : '0';
  if (isChaupaal) screen.dataset.chaupaal = '1';
  window.currentOpenChat = chat;
  // Remember only after canonical remap (prepareChatThread also remembers post-bootstrap)
  if (
    typeof rememberInboxChat === 'function' &&
    currentUser &&
    !isSelf &&
    !isChaupaal &&
    chat.firestoreId &&
    !(typeof isStubDmId === 'function' && isStubDmId(chat.firestoreId))
  ) {
    rememberInboxChat(chat);
  }
  if (typeof ensureChatUpdatedAt === 'function' && currentUser && !isSelf && !isChaupaal) {
    ensureChatUpdatedAt({ ...chat, missingUpdatedAt: chat.missingUpdatedAt !== false });
  }

  const statusLine = isChaupaal
    ? 'Your space with Chaupaal'
    : (isSelf ? 'Notes to self · testing space' : 'Checking activity…');
  const placeholder = isChaupaal
    ? 'Talk with Chaupaal…'
    : (isSelf ? 'Write a note to yourself...' : 'Type a message...');

  screen.innerHTML = `
    <div class="chat-screen-header">
      ${typeof backButtonHtml==='function'?backButtonHtml({ className: 'chat-back', id: 'chatBack' }):`<button class="chat-back cp-back-btn" id="chatBack" aria-label="Back">${typeof iconHtml==='function'?iconHtml('arrow-left',{size:22}):''}</button>`}
      <div class="chat-header-avatar${isGroup || !isSelf ? ' chat-header-tappable' : ''}" ${isGroup ? 'data-open-group-info' : !isSelf ? 'data-open-chat-profile' : ''} role="${isGroup || !isSelf ? 'button' : ''}" ${!isSelf ? 'tabindex="0"' : ''}>${isGroup || isSelf || isChaupaal ? (chat.avatar || '👤') : (typeof chatAvatarMarkup === 'function' ? chatAvatarMarkup(chat) : (chat.avatar || '👤'))}</div>
      <div class="chat-header-info${isGroup || !isSelf ? ' chat-header-tappable' : ''}" ${isGroup ? 'data-open-group-info' : !isSelf ? 'data-open-chat-profile' : ''} role="${isGroup || !isSelf ? 'button' : ''}" ${!isSelf ? 'tabindex="0"' : ''}>
        <div class="chat-header-name">${(chat.type==='group'||chat.type==='self'||isChaupaal)?(headerTitle||chat.name||'Chat'):(typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(headerTitle||'…',chat):(headerTitle||'…'))}</div>
        <div id="chatActivityStatus" class="chat-activity-status">${statusLine}</div>
      </div>
      <div class="chat-header-actions">
        ${isSelf
          ?`<button class="chat-header-btn chat-header-btn--labeled" id="chatJournalBtn" title="${typeof t==='function'?t('chaupaal_journal','Journal'):'Journal'}" aria-label="Journal"><span class="chat-header-btn-ico">${typeof iconHtml==='function'?iconHtml('notebook',{size:18}):''}</span><span class="chat-header-btn-label">${typeof t==='function'?t('chaupaal_journal','Journal'):'Journal'}</span></button>
            <button class="chat-header-btn chat-header-btn--labeled" id="chatSelfArchiveBtn" title="Archive" aria-label="Archive"><span class="chat-header-btn-ico">${typeof iconHtml==='function'?iconHtml('archive',{size:18}):''}</span><span class="chat-header-btn-label">Archive</span></button>`
          :(isChaupaal
            ?`<button class="chat-header-btn chat-header-btn--labeled" id="chatFeedbackBtn" title="Feedback" aria-label="Feedback"><span class="chat-header-btn-ico">${typeof iconHtml==='function'?iconHtml('message-square',{size:18}):''}</span><span class="chat-header-btn-label">Feedback</span></button>
              <button class="chat-header-btn chat-header-btn--labeled" id="chatSelfSettingsBtn" title="Settings" aria-label="Settings"><span class="chat-header-btn-ico">${typeof iconHtml==='function'?iconHtml('settings',{size:18}):''}</span><span class="chat-header-btn-label">Settings</span></button>`
            :`<button class="chat-header-btn mehfil-entry" id="chatMehfilBtn" title="${typeof t==='function'?t('mehfil_title'):'Mehfil'}" aria-label="${typeof t==='function'?t('mehfil_title'):'Mehfil'}">${typeof mehfilMarkHtml==='function'?mehfilMarkHtml(20):(typeof iconHtml==='function'?iconHtml('home',{size:18}):'🏠')}</button>
            <button class="chat-header-btn" id="chatMehfilRingBtn" title="${typeof t==='function'?t('mehfil_ring','Ring'):'Ring'}" aria-label="${typeof t==='function'?t('mehfil_ring','Ring'):'Ring'}">${typeof iconHtml==='function'?iconHtml('phone',{size:18}):'☎'}</button>`)}
        ${!isSelf&&!isChaupaal?`<button class="chat-header-btn" id="chatChallengeBtn" title="Create challenge" aria-label="Create challenge">${typeof iconHtml==='function'?iconHtml('target',{size:18}):'🎯'}</button>`:''}
        ${!isGroup&&!isSelf&&!isChaupaal?`<button class="chat-header-btn" id="chatMuqabalaBtn" title="Muqabala" aria-label="Muqabala">${typeof iconHtml==='function'?iconHtml('swords',{size:18}):'⚔️'}</button>`:''}
      </div>
    </div>
    <div id="chatTypingStatus" class="chat-typing-status hidden" aria-live="polite"></div>
    ${hasDuelStreak?`
    <div class="duel-ritual-bar" id="duelRitualBar">
      <div>
        <div class="duel-ritual-info">Daily Duel Ritual 🔥</div>
        <div class="duel-ritual-streak">${chat.duelStreak} day streak with ${chat.name}</div>
      </div>
      <button class="duel-ritual-cta" id="startRitualBtn">Play today!</button>
    </div>`:''}
    ${!isSelf&&!isChaupaal?`<div class="mehfil-live-banner" id="mehfilLiveBanner" hidden>
      <span class="mehfil-mark-wrap">${typeof mehfilMarkHtml==='function'?mehfilMarkHtml(28):'🏠'}</span>
      <div class="mehfil-live-banner-copy">
        <strong data-mehfil-live-title>Mehfil is live</strong>
        <span data-mehfil-live-sub>Others are in the room</span>
      </div>
      <button type="button" class="mehfil-live-banner-cta" id="mehfilLiveJoin">${typeof t==='function'?t('mehfil_join_cta'):'Join Mehfil'}</button>
    </div>`:''}
    <div class="chat-messages-area" id="chatMsgsArea">
      ${msgs.map(m => renderMsgBubble(m, isGroup)).join('')}
    </div>
    <div class="ai-suggestion-bar hidden" id="aiSuggestionBar"></div>
    <div class="chat-attach-menu" id="chatAttachMenu" role="menu" aria-label="${typeof t==='function'?t('attach_menu','Attach'):'Attach'}">
      <button type="button" class="chat-attach-option" id="attachPhoto" role="menuitem">
        <span class="chat-attach-icon chat-attach-icon--photo">${typeof iconHtml==='function'?iconHtml('camera',{size:22}):''}</span>
        <span class="chat-attach-label">${typeof t==='function'?t('attach_photo','Photo'):'Photo'}</span>
      </button>
      <button type="button" class="chat-attach-option" id="attachFile" role="menuitem">
        <span class="chat-attach-icon chat-attach-icon--file">${typeof iconHtml==='function'?iconHtml('file',{size:22}):''}</span>
        <span class="chat-attach-label">${typeof t==='function'?t('attach_file','File'):'File'}</span>
      </button>
      ${isChaupaal ? '' : `<button type="button" class="chat-attach-option" id="attachGame" role="menuitem">
        <span class="chat-attach-icon chat-attach-icon--game">${typeof iconHtml==='function'?iconHtml('gamepad',{size:22}):''}</span>
        <span class="chat-attach-label">${typeof t==='function'?t('attach_game','Game'):'Game'}</span>
      </button>`}
      ${isChaupaal
        ? `<button type="button" class="chat-attach-option" id="attachJournal" role="menuitem">
        <span class="chat-attach-icon chat-attach-icon--journal">${typeof iconHtml==='function'?iconHtml('notebook',{size:22}):''}</span>
        <span class="chat-attach-label">${typeof t==='function'?t('attach_journal','Journal'):'Journal'}</span>
      </button>`
        : `<button type="button" class="chat-attach-option" id="attachSong" role="menuitem">
        <span class="chat-attach-icon chat-attach-icon--song">${typeof iconHtml==='function'?iconHtml('music',{size:22}):''}</span>
        <span class="chat-attach-label">${typeof t==='function'?t('attach_song','Song'):'Song'}</span>
      </button>`}
      <button type="button" class="chat-attach-option" id="attachLocation" role="menuitem">
        <span class="chat-attach-icon chat-attach-icon--location">${typeof iconHtml==='function'?iconHtml('map-pin',{size:22}):''}</span>
        <span class="chat-attach-label">${typeof t==='function'?t('attach_location','Location'):'Location'}</span>
      </button>
    </div>
    <div class="chat-input-bar"${previewJoin ? ' hidden' : ''}>
      <button class="chat-action-btn" id="chatPlusBtn" aria-label="Attach">${typeof iconHtml==='function'?iconHtml('plus',{size:22}):'＋'}</button>
      <textarea id="chatMsgInput" rows="1" placeholder="${placeholder}" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>
      <button class="chat-action-btn mic-btn" id="chatMicBtn" title="Voice typing" aria-label="Voice typing">🎙️</button>
      <button class="chat-action-btn chat-send-btn" id="chatSendBtn" aria-label="Send message">➤</button>
    </div>
    ${previewJoin ? `<div class="chat-preview-join-bar"><button type="button" id="chatPreviewJoinBtn" class="chat-preview-join-btn">Join group to send messages</button></div>` : ''}
    <input type="file" id="chatPhotoInput" accept="image/*" style="display:none">
    <input type="file" id="chatFileInput" style="display:none">
  `;

  document.querySelector('.device').appendChild(screen);
  requestAnimationFrame(() => screen.classList.add('open'));
  activeChatScreen = screen;
  screen.dataset.navManaged = '1';
  if (typeof pushNavLayer === 'function') {
    pushNavLayer(screen, () => closeChatScreen({ updateHistory: false, animate: true, fromHistory: true }));
  }

  if (typeof beginOverlayScope === 'function') {
    beginOverlayScope(typeof OVERLAY_SCOPE_CHAT === 'string' ? OVERLAY_SCOPE_CHAT : 'chat', screen);
  }
  if (typeof enableSwipeBack === 'function') {
    enableSwipeBack(screen, () => {
      if (typeof hasNavLayers === 'function' && hasNavLayers()) {
        try {
          history.back();
        } catch (e) {
          if (typeof dismissTopNavLayer === 'function') dismissTopNavLayer();
        }
        return;
      }
      closeChatScreen({ updateHistory: true, animate: true });
    });
  }
  if (typeof bindZoomableImages === 'function') bindZoomableImages(screen);

  if(!isSelf && !isChaupaal && typeof mountIcebreakerBanner==='function') mountIcebreakerBanner(screen, chat);
  if(!isSelf && !isChaupaal && typeof mountConversationRepairChips==='function') {
    try { mountConversationRepairChips(screen, chat); } catch (e) {}
  }
  if (!isSelf && !isChaupaal && typeof ChatRating?.startPolling === 'function') {
    try {
      ChatRating.startPolling();
      setTimeout(() => ChatRating.scheduleFromOpenChat?.(), 800);
    } catch (e) {}
  }

  try{
    const cid=chat.firestoreId||chat.id;
    if(cid&&typeof buildDeepLink==='function') {
      const url = buildDeepLink('chat', cid);
      history.replaceState({ ...(history.state || {}), chaupaalDeep: true, chaupaalLayer: history.state?.chaupaalLayer || true }, '', url);
    }
  }catch(e){}

  document.getElementById('chatBack').addEventListener('click', () => {
    // Dismiss overlays (song picker, sheets) before leaving chat — one Back = one layer
    if (typeof hasNavLayers === 'function' && hasNavLayers()) {
      try {
        history.back();
      } catch (e) {
        if (typeof dismissTopNavLayer === 'function') dismissTopNavLayer();
      }
      return;
    }
    closeChatScreen({ updateHistory: true, animate: true });
  });

  if (isGroup && typeof openGroupInfo === 'function') {
    screen.querySelectorAll('[data-open-group-info]').forEach((el) => {
      el.addEventListener('click', () => openGroupInfo(chat));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openGroupInfo(chat);
        }
      });
    });
  }

  if (!isSelf && !isChaupaal && typeof bindProfileLongPress === 'function') {
    const profile = {
      uid: chat.uid || chat.otherUid || chat.peerUid || chat.id?.replace?.(/^chat_profile_|^dm_|^chat_/, '') || '',
      name: chat.name,
      avatar: chat.avatar,
      photoURL: chat.photoURL || (/^https:/.test(chat.avatar || '') ? chat.avatar : ''),
    };
    // Message avatars: long-press CF. Header uses openBaithakAvatarMenu below (not peek on click).
    bindMsgAvatarLongPress(screen, profile);
  }

  document.getElementById('chatSendBtn')?.addEventListener('click', () => sendMsg(chat));

  if (!isSelf && !isChaupaal && !isGroup) {
    setChatComposerReady(screen, false, 'Connecting…');
  }

  prepareChatThread(chat, screen, { isGroup, isSelf, isChaupaal }).catch((e) => {
    console.warn('[chat] prepare thread', e?.message || e);
  });

  screen.querySelector('#chatPreviewJoinBtn')?.addEventListener('click', async () => {
    const chatId = chat.firestoreId || chat.id;
    if (!chatId || !currentUser?.uid || !db) return;
    try {
      if (chat.invite?.mode === 'approval') {
        await db.collection('chats').doc(chatId).collection('joinRequests').doc(currentUser.uid).set({
          uid: currentUser.uid,
          name: userProfile?.name || currentUser.displayName || 'Member',
          status: 'pending',
          requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        if (typeof showToast === 'function') showToast('Join request sent');
        return;
      }
      await db.collection('chats').doc(chatId).update({
        participants: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
        [`memberProfiles.${currentUser.uid}`]: {
          name: userProfile?.name || currentUser.displayName || 'Member',
          photoURL: currentUser.photoURL || '',
        },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      chat.participants = [...new Set([...(chat.participants || []), currentUser.uid])];
      delete chat._previewJoin;
      if (typeof showToast === 'function') showToast('Joined group');
      closeChatScreen({ updateHistory: true, animate: false });
      openChatScreen(chat);
      if (typeof loadBaithakChatsPage === 'function') loadBaithakChatsPage({ reset: false }).catch(() => {});
    } catch (e) {
      if (typeof showToast === 'function') showToast('Could not join group');
    }
  });
  const msgInput = document.getElementById('chatMsgInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const syncSendIdle = () => {
    const empty = !(msgInput?.value || '').trim();
    sendBtn?.classList.toggle('is-idle', empty);
    if (sendBtn) sendBtn.disabled = empty;
  };
  const growComposer = () => {
    if (!msgInput || msgInput.tagName !== 'TEXTAREA') return;
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(120, msgInput.scrollHeight) + 'px';
  };
  msgInput?.addEventListener('keypress', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMsg(chat);
    }
  });
  msgInput?.addEventListener('input', () => {
    growComposer();
    syncSendIdle();
    if (!isChaupaal) updateAiSuggestions(msgInput.value);
    if (!isChaupaal && typeof signalChatTyping === 'function') signalChatTyping(chat.firestoreId || chat.id);
  });
  syncSendIdle();
  // Relative ↔ absolute time on tap
  screen.addEventListener('click', (e) => {
    const t = e.target.closest?.('.msg-time[data-abs]');
    if (!t) return;
    const showingAbs = t.dataset.mode === 'abs';
    if (showingAbs) {
      t.textContent = t.dataset.rel || t.textContent;
      t.dataset.mode = 'rel';
    } else {
      t.textContent = t.dataset.abs || t.textContent;
      t.dataset.mode = 'abs';
    }
  });
  if (!isChaupaal && typeof startChatPresence === 'function') startChatPresence(chat);
  // Clear unread + write reads (startChatPresence skips self-chat before markChatRead)
  if (typeof markChatRead === 'function') {
    markChatRead(chat.firestoreId || chat.id);
  } else if (typeof clearChatUnreadBadge === 'function') {
    clearChatUnreadBadge(chat.firestoreId || chat.id);
  }
  {
    const cid = chat.firestoreId || chat.id;
    const pref = typeof getBaithakPref === 'function' ? getBaithakPref(cid) : {};
    if (pref?.markUnread && typeof BaithakChatActions?.setBaithakPref === 'function') {
      BaithakChatActions.setBaithakPref(cid, { markUnread: false }).catch(() => {});
    }
  }
  if (isChaupaal) {
    try { if (typeof ensureChaupaalChatDoc === 'function') ensureChaupaalChatDoc(); } catch (e) {}
    try { if (typeof hydrateChaupaalQuietState === 'function') hydrateChaupaalQuietState(screen); } catch (e) {}
    try { if (typeof restoreAppShell === 'function') restoreAppShell('chaupaal_open'); } catch (e) {}
    // Hide attach game / challenge affordances for system chat
    document.getElementById('attachGame')?.classList.add('hidden');
  }
  // Self-chat ensure is awaited in the listener bootstrap below — do not fire-and-forget here.
  // AI Discovery mindful meter (Personal peers only)
  if (
    !isGroup &&
    !isChaupaal &&
    !isSelf &&
    (chat.discoveryOrigin === 'ai_discovery' || chat.origin === 'ai_discovery') &&
    String(chat.peerProfileType || chat.profileType || 'personal').toLowerCase() !== 'professional'
  ) {
    try {
      const host = document.createElement('div');
      host.id = 'chatAiDiscMeter';
      host.setAttribute('data-nav-ignore', '1');
      const area = document.getElementById('chatMsgsArea');
      area?.parentElement?.insertBefore(host, area);
      if (typeof AiDiscoveryMeter?.mountMeter === 'function') AiDiscoveryMeter.mountMeter(host);
    } catch (e) {}
  }
  // Attach menu toggle
  const attachMenu = document.getElementById('chatAttachMenu');
  document.getElementById('chatPlusBtn').addEventListener('click', (e)=>{
    e.stopPropagation();attachMenu.classList.toggle('show');
  });
  activeChatAttachDocClick = (e)=>{
    if(!e.target.closest('#chatAttachMenu')&&!e.target.closest('#chatPlusBtn')) attachMenu.classList.remove('show');
  };
  document.addEventListener('click', activeChatAttachDocClick);

  document.getElementById('attachPhoto').addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    document.getElementById('chatPhotoInput').click();
  });
  document.getElementById('chatPhotoInput').addEventListener('change', async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      let src='', mediaWidth=0, mediaHeight=0;
      const uploadReady=typeof isMediaUploadReady!=='function'||await isMediaUploadReady();
      if(typeof processAndUploadMedia==='function'&&currentUser&&file.type.startsWith('image/')&&uploadReady){
        showToast(t('baithak_uploading_photo'));
        const up=await processAndUploadMedia(file,{folder:'chat'});
        src=up.media;
        mediaWidth=Number(up.width)||0;
        mediaHeight=Number(up.height)||0;
      } else {
        // Never persist blob: URLs — they die on reopen and look like a missing attachment
        showToast(uploadReady?t('baithak_photo_unavailable'):t('baithak_photo_not_ready'));
        e.target.value='';
        return;
      }
      const pendingPhoto=addMsgBubble({from:'me',text:`📷 Photo`,attachment:{type:'photo',url:src,width:mediaWidth,height:mediaHeight},time:'now',pending:true}, isGroup);
      if(typeof sendRealtimeMessage==='function'){
        try{
          await sendRealtimeMessage(chat.firestoreId||chat.id, '📷 Photo', isGroup, null, {
            type:'photo', url:src, width:mediaWidth||null, height:mediaHeight||null,
          });
        }catch(sendErr){
          pendingPhoto?.remove?.();
          showToast(typeof friendlyError==='function'?friendlyError(sendErr):(sendErr.message||t('baithak_photo_fail')));
        }
      }
    }catch(err){
      showToast(typeof friendlyError==='function'?friendlyError(err):(err.message||t('baithak_photo_fail')));
    }
  });
  document.getElementById('attachFile').addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    document.getElementById('chatFileInput').click();
  });
  document.getElementById('chatFileInput').addEventListener('change', e=>{
    const file=e.target.files[0];if(!file)return;
    const name=file.name||'File';
    addMsgBubble({from:'me',text:`📄 ${name}`,attachment:{type:'file',name},time:'now',pending:true}, isGroup);
    if(typeof sendRealtimeMessage==='function'){
      sendRealtimeMessage(chat.firestoreId||chat.id, `📄 ${name}`, isGroup, null, { type:'file', name });
    }
  });
  document.getElementById('attachGame')?.addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    openGamePicker(chat, isGroup);
  });
  document.getElementById('attachJournal')?.addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    if (typeof openJournalComposeSheet === 'function') openJournalComposeSheet({});
    else if (typeof JournalCheckIn?.openCompose === 'function') JournalCheckIn.openCompose({});
    else if (typeof showToast === 'function') showToast('Journal');
  });
  document.getElementById('attachSong')?.addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    const openMusic = typeof openMusicHub==='function' ? openMusicHub : openSongPicker;
    if(typeof openMusic!=='function'){showToast(t('baithak_song_unavailable'));return;}
    openMusic({
      title:'Share music',
      tab:'search',
      onSelect:async (music)=>{
        if(!music) return;
        if(music.__radioShare){
          const att={
            type:'radio_share',
            mood:music.mood||'discovery',
            genre:music.genre||'any',
            language:music.language||'any',
            sample:music.sample||null,
          };
          const pendingRow=addMsgBubble({from:'me',text:'📻 Radio',attachment:att,time:'now',pending:true}, isGroup);
          if(typeof sendRealtimeMessage!=='function') return;
          try{
            await sendRealtimeMessage(chat.firestoreId||chat.id, '📻 Radio', isGroup, null, att);
          }catch(e){
            pendingRow?.remove?.();
            showToast(typeof friendlyError==='function'?friendlyError(e):'Could not share radio');
          }
          return;
        }
        const pendingRow=addMsgBubble({from:'me',text:music.title?`🎵 ${music.title}`:'🎵 Song',music,time:'now',pending:true}, isGroup);
        if(typeof sendRealtimeMessage!=='function') return;
        try{
          await sendRealtimeMessage(chat.firestoreId||chat.id, music.title?`🎵 ${music.title}`:'🎵 Song', isGroup, music);
        }catch(e){
          pendingRow?.remove?.();
          showToast(typeof friendlyError==='function'?friendlyError(e):'Could not share song');
        }
      },
    });
  });
  document.getElementById('attachLocation').addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    if(typeof openLocationComposer!=='function'){showToast(t('baithak_loc_unavailable'));return;}
    openLocationComposer({
      title:'Share location',
      peerUid: !isGroup && !isSelf && !isChaupaal
        ? (chat.uid || chat.peerUid || (chat.participants || []).find((u) => u !== currentUser?.uid) || null)
        : null,
      onSelect:async (loc)=>{
        try{
          const label=loc.label||loc.placeName||'Location';
          const pendingRow=addMsgBubble({from:'me',text:`📍 ${label}`,attachment:loc,time:'now',pending:true}, isGroup);
          if(typeof sendRealtimeMessage==='function'){
            try{
              await sendRealtimeMessage(chat.firestoreId||chat.id, `📍 ${label}`, isGroup, null, loc);
            }catch(err){
              pendingRow?.remove?.();
              showToast(typeof friendlyError==='function'?friendlyError(err):'Could not share location');
            }
          }
        }catch(e){
          showToast('Could not share location');
        }
      },
    });
  });

  // Voice typing (mic)
  const micBtn=document.getElementById('chatMicBtn');
  micBtn.addEventListener('click', ()=>{
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){showToast(t('baithak_voice_unsupported'));return;}
    if(micBtn.classList.contains('recording')){
      activeChatRecognition?.stop();return;
    }
    activeChatRecognition = new SR();
    activeChatRecognition.lang = typeof getTtsLang === 'function' ? getTtsLang() : (currentLang==='hi'?'hi-IN':'en-IN');
    activeChatRecognition.interimResults = false;
    activeChatRecognition.onstart = () => micBtn.classList.add('recording');
    activeChatRecognition.onend = () => micBtn.classList.remove('recording');
    activeChatRecognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      msgInput.value = (msgInput.value + ' ' + transcript).trim();
      updateAiSuggestions(msgInput.value);
    };
    activeChatRecognition.onerror = () => micBtn.classList.remove('recording');
    activeChatRecognition.start();
  });

  document.getElementById('chatSelfArchiveBtn')?.addEventListener('click', () => {
    if (typeof openArchiveHub === 'function') openArchiveHub('journal');
    else if (typeof showToast === 'function') showToast('Archive');
  });
  document.getElementById('chatSelfSettingsBtn')?.addEventListener('click', () => {
    if (typeof openSettingsModal === 'function') openSettingsModal();
    else document.getElementById('settingsBtn')?.click();
  });
  document.getElementById('chatJournalBtn')?.addEventListener('click', () => {
    if (typeof openJournalComposeSheet === 'function') openJournalComposeSheet({});
    else if (typeof JournalCheckIn?.openCompose === 'function') JournalCheckIn.openCompose({});
    else if (typeof openArchiveHub === 'function') openArchiveHub('journal');
  });
  document.getElementById('chatFeedbackBtn')?.addEventListener('click', () => {
    if (typeof openProductFeedbackSheet === 'function') openProductFeedbackSheet({ source: 'chaupaal_chat_feedback' });
    else if (typeof openCompanionFeedbackSheet === 'function') openCompanionFeedbackSheet(null);
    else if (typeof showToast === 'function') showToast('Feedback');
  });
  // Chaupaal / 1:1: avatar or name → full profile (not peek). Groups keep group-info.
  async function openChatPeerFullProfile() {
    if (isChaupaal) {
      if (typeof openChaupaalAiProfile === 'function') openChaupaalAiProfile();
      return;
    }
    if (isGroup || isSelf) return;
    const peerUid =
      chat.peerUid ||
      chat.otherUid ||
      chat.uid ||
      (Array.isArray(chat.participants) ? chat.participants.find((u) => u && u !== currentUser?.uid) : null);
    if (!peerUid) return;
    let u = {
      uid: peerUid,
      name: chat.name,
      avatar: chat.avatar,
      photoURL: chat.photoURL,
      username: chat.username,
    };
    try {
      if (typeof UsersPublic?.getPublicProfile === 'function') {
        const pub = await UsersPublic.getPublicProfile(peerUid);
        if (pub) u = { ...u, ...pub, uid: peerUid };
      } else if (db) {
        const snap = await db.collection('users').doc(peerUid).get();
        if (snap.exists) u = { ...u, ...snap.data(), uid: peerUid };
      }
    } catch (e) {}
    if (typeof openPublicProfile === 'function') {
      openPublicProfile(u, { uid: peerUid, username: u.username });
    }
  }
  screen.querySelectorAll('[data-open-chat-profile]').forEach((el) => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openChatPeerFullProfile();
    });
  });
  // Avatar: tap = enlarge photo; long-press = options menu only
  {
    const headerAv = screen.querySelector('.chat-header-avatar');
    if (headerAv) {
      headerAv.addEventListener('click', (e) => {
        if (headerAv.dataset.suppressClick === '1') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.stopPropagation();
        if (typeof openAvatarLightbox === 'function') {
          const peerUid =
            chat.uid ||
            chat.peerUid ||
            (Array.isArray(chat.participants)
              ? chat.participants.find((u) => u && u !== currentUser?.uid)
              : null);
          openAvatarLightbox({
            photoURL: chat.photoURL || (typeof chat.avatar === 'string' && /^https?:/i.test(chat.avatar) ? chat.avatar : ''),
            name: chat.name || (isGroup ? 'Group' : 'Friend'),
            avatar: chat.avatar || (isSelf ? '📝' : isChaupaal ? '🏠' : isGroup ? '👥' : '👤'),
            uid: isChaupaal ? 'chaupaal' : isGroup ? '' : peerUid || '',
            isGroup,
            isChaupaal,
            chat: isGroup ? chat : null,
            username: chat.username || '',
          });
        }
      });
      if (!isSelf && !isChaupaal && typeof onLongPress === 'function') {
        onLongPress(
          headerAv,
          () => {
            if (isGroup) {
              if (typeof openBaithakChatActions === 'function') openBaithakChatActions(chat, { surface: 'header' });
              else if (typeof openGroupInfo === 'function') openGroupInfo(chat);
              return;
            }
            const peerUid =
              chat.uid ||
              chat.peerUid ||
              (Array.isArray(chat.participants)
                ? chat.participants.find((u) => u && u !== currentUser?.uid)
                : null);
            if (!peerUid) return;
            if (typeof openBaithakAvatarMenu === 'function') {
              openBaithakAvatarMenu(headerAv, {
                uid: peerUid,
                name: chat.name,
                avatar: chat.avatar,
                photoURL: chat.photoURL,
                username: chat.username,
              });
            }
          },
          { delayMs: 520 }
        );
      }
    }
  }
  document.getElementById('chatMehfilBtn')?.addEventListener('click', () => {
    if (typeof openMehfil === 'function') openMehfil(chat);
    else if (typeof showToast === 'function') showToast('Mehfil loading…');
  });
  document.getElementById('chatMehfilRingBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof startMehfilRing === 'function') startMehfilRing(chat);
    else if (typeof showToast === 'function') showToast('Mehfil loading…');
  });
  document.getElementById('mehfilLiveJoin')?.addEventListener('click', () => {
    if (typeof openMehfil === 'function') openMehfil(chat);
  });
  // Live presence → header badge + join banner (total participants ≥ 2)
  if (!isSelf && !isChaupaal && typeof watchMehfilPresence === 'function') {
    const chatId = typeof mehfilPresenceChatId === 'function' ? mehfilPresenceChatId(chat) : (chat.firestoreId || chat.id);
    const unsub = watchMehfilPresence(chatId, ({ count, live, totalCount }) => {
      const btn = document.getElementById('chatMehfilBtn');
      const banner = document.getElementById('mehfilLiveBanner');
      const total = totalCount != null ? totalCount : count;
      const isLive = live === true;
      btn?.classList.toggle('is-live', isLive);
      if (banner) {
        const inRoom = typeof isMehfilOpen === 'function' && isMehfilOpen();
        banner.hidden = !(isLive && !inRoom);
        const title = banner.querySelector('[data-mehfil-live-title]');
        const sub = banner.querySelector('[data-mehfil-live-sub]');
        if (title) title.textContent = typeof t === 'function' ? t('mehfil_live_title') : 'Mehfil is live';
        if (sub) {
          sub.textContent =
            typeof t === 'function'
              ? t('mehfil_live_sub', { n: String(total) })
              : `${total} in the room`;
        }
      }
    });
    screen._mehfilPresenceUnsub = unsub;
  }
  document.getElementById('chatChallengeBtn')?.addEventListener('click', () => openChallengeCreator(chat));
  if(!isGroup&&!isSelf) document.getElementById('chatMuqabalaBtn')?.addEventListener('click', () => {
    closeChatScreen({ updateHistory: true, animate: true });
    setTimeout(() => startMuqabala(chat.name,'GK'), 320);
  });

  if(hasDuelStreak) document.getElementById('startRitualBtn')?.addEventListener('click', () => startDailyDuelRitual(chat));
}

window.closeChatScreen = closeChatScreen;
// Chat-open boundary (CONVENTIONS 4c): message-history render is a dynamic
// list — a bad message doc must not blank the shell. Rebinding the top-level
// declaration guards in-file and cross-file callers alike.
if (typeof safeFeature === 'function') openChatScreen = safeFeature('chat_open', openChatScreen);
window.openChatScreen = openChatScreen;

// ===================== AI SUGGESTION BAR (no autocorrect, smart next-word/emoji) =====================
const QUICK_PHRASES = ["Sounds good!","On my way","Let's do it","Haha 😄","I agree","Not sure yet","Talk later?","Great idea!"];
const EMOJI_KEYWORDS = {
  'good':'👍','great':'🎉','love':'❤️','happy':'😄','sad':'😢','win':'🏆','lol':'😂',
  'cricket':'🏏','game':'🎮','play':'🎲','food':'🍛','tea':'☕','today':'📅','news':'📰',
  'congrats':'🎊','sorry':'🙏','thanks':'🙌','yes':'✅','no':'❌','question':'🤔'
};
let aiSuggestTimeout=null;
function updateAiSuggestions(text,targetInput){
  clearTimeout(aiSuggestTimeout);
  const bar=document.getElementById('aiSuggestionBar');
  if(!bar)return;
  const inp=targetInput||document.getElementById('chatMsgInput');
  const aiChip=`<button class="ai-kb-trigger" onclick="openAiKeyboard(document.getElementById('chatMsgInput'))">✨ Ask Chaupaal</button>`;
  if(!text.trim()){
    bar.innerHTML=aiChip+QUICK_PHRASES.slice(0,4).map(p=>`<button class="ai-suggestion-chip" data-val="${p}">${p}</button>`).join('');
    bar.classList.remove('hidden');wireSuggestionChips(bar);return;
  }
  aiSuggestTimeout=setTimeout(()=>{
    const lastWord=text.trim().split(/\s+/).pop().toLowerCase();
    const suggestions=[];
    Object.entries(EMOJI_KEYWORDS).forEach(([kw,emoji])=>{if(lastWord.includes(kw)||kw.includes(lastWord))suggestions.push(emoji);});
    const completions=['definitely','for sure','let me check','sounds perfect'].filter(c=>c.startsWith(lastWord)&&lastWord.length>1);
    const chips=[...new Set([...suggestions,...completions])].slice(0,5);
    bar.innerHTML=aiChip+chips.map(c=>`<button class="ai-suggestion-chip" data-val="${c}">${c}</button>`).join('');
    bar.classList.remove('hidden');wireSuggestionChips(bar);
  },300);
}
function wireSuggestionChips(bar){
  bar.querySelectorAll('.ai-suggestion-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      const input=document.getElementById('chatMsgInput');
      if(!input)return;
      const val=chip.dataset.val;
      if(/^\p{Emoji}/u.test(val)) input.value=(input.value+' '+val).trim();
      else input.value=val;
      bar.classList.add('hidden');
      input.focus();
    });
  });
}

function chatEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderMsgBubble(m, isGroup){
  const isMe = m.from === 'me';
  const uid = m.uid || m.user?.uid || '';
  const name = m.name || m.user?.name || '';
  if (m.deletedForEveryone) {
    const delLabel =
      typeof t === 'function'
        ? t('baithak_msg_deleted_everyone') || 'This message was deleted'
        : 'This message was deleted';
    return `<div class="msg-row ${isMe ? 'me' : 'them'} msg-row--deleted" data-deleted-everyone="1">
      <div class="msg-bubble msg-bubble--deleted"><em>${delLabel}</em></div>
    </div>`;
  }
  let body = m.text || '';
  const att = m.attachment || null;
  // SECURITY: `rich` is set ONLY when body is built from structured fields
  // below. Anything else is plain text and gets fully escaped — message text
  // must never carry raw HTML (stored XSS). The old check skipped escaping for
  // text starting with '<', which let `<img onerror=…>` through.
  let rich = false;

  // Legacy photo encoding
  if(!att && typeof body==='string' && body.startsWith('[photo] ')){
    const url=body.slice(8).trim();
    if(url){ body=`<div class="chat-img-wrap baithak-3d-edge"><img class="chat-img-msg" src="${chatEsc(url)}" decoding="async" alt=""></div>`; rich=true; }
  }

  if(m.music && typeof renderMusicCard==='function'){
    const card=renderMusicCard(m.music,{variant:'chat'});
    const caption=(typeof m.text==='string' && m.text && !m.text.includes('data-music-card') && !/^🎵\s/.test(m.text))?`<div class="music-card-caption">${chatEsc(m.text)}</div>`:'';
    body=card+(caption||'');
    rich=true;
  } else if(att && att.type==='photo' && att.url){
    const sizeAttrs='';
    body=`<div class="chat-img-wrap baithak-3d-edge"><img class="chat-img-msg" src="${chatEsc(att.url)}" decoding="async" alt=""${sizeAttrs}></div>`;
    rich=true;
  } else if(att && att.type==='file'){
    body=`<div class="chat-file-msg baithak-3d-edge">${typeof iconHtml==='function'?iconHtml('file',{size:18}):''}<span class="chat-file-name">${chatEsc(att.name||'File')}</span></div>`;
    rich=true;
  } else if(att && att.type==='location'){
    body=typeof renderLocationCard==='function'
      ?renderLocationCard(att,{variant:'chat'})
      :`<div class="chat-location-msg">📍 ${chatEsc(att.label||att.placeName||'Location shared')}</div>`;
    rich=true;
  } else if(att && att.type==='muqabala_challenge'){
    const n=Array.isArray(att.questions)?att.questions.length:0;
    const secs=Number(att.timerSeconds)||60;
    const cid=chatEsc(att.challengeId||'');
    if(cid && Array.isArray(att.questions) && att.questions.length){
      window.__pendingMuqabalaChallenges = window.__pendingMuqabalaChallenges || {};
      window.__pendingMuqabalaChallenges[att.challengeId] = {
        questions: att.questions,
        timerSeconds: secs,
        mode: 'Custom',
        source: 'manual',
      };
      try{ localStorage.setItem('chaupaal_challenge_'+att.challengeId, JSON.stringify(window.__pendingMuqabalaChallenges[att.challengeId])); }catch(e){}
    }
    body=`<div class="msg-bubble-challenge-inner challenge"><div class="challenge-label">⚔️ Custom Challenge</div><div class="challenge-title">${n} questions · ${secs}s</div><button class="challenge-btn" type="button" data-muqabala-challenge="${cid}">Answer →</button></div>`;
    rich=true;
  } else if(att && att.type==='game_challenge'){
    const myUid=typeof currentUser!=='undefined'?currentUser?.uid:'';
    body=typeof renderChallengeCard==='function'
      ?renderChallengeCard(m,myUid)
      :`<div class="baithak-challenge-card">${chatEsc(att.gameName||m.text||'Challenge')}</div>`;
    rich=true;
  } else if(att && att.type==='mehfil_invite'){
    const label=chatEsc(att.label||(typeof t==='function'?t('mehfil_join_cta'):'Join Mehfil'));
    body=`<div class="mehfil-invite-card">${typeof mehfilMarkHtml==='function'?mehfilMarkHtml(28):''}<strong>${chatEsc(m.text||(typeof t==='function'?t('mehfil_nudge_text',{name:m.name||'Someone'}):'Join Mehfil'))}</strong><button type="button" data-mehfil-invite-join>${label}</button></div>`;
    rich=true;
  } else if(att && att.type==='duniya_post'){
    const thumb = att.thumb || att.url || '';
    const cap = att.caption || m.text || 'Post';
    body=`<button type="button" class="chat-duniya-post-card" data-duniya-post="${chatEsc(att.postId||'')}">
      ${thumb?`<img src="${chatEsc(thumb)}" alt="">`:`<span class="chat-duniya-post-card-text">${chatEsc(cap.slice(0,80))}</span>`}
      <span>${chatEsc(att.author||'Duniya')}</span>
      <span style="font-weight:500;color:var(--muted);">${chatEsc(cap.slice(0,80))}</span>
    </button>`;
    rich=true;
  } else if(att && att.type==='peepal_post'){
    const thumb = att.thumb || att.url || '';
    const cap = att.caption || m.text || 'Discussion';
    body=`<button type="button" class="chat-duniya-post-card chat-peepal-post-card" data-peepal-post="${chatEsc(att.postId||'')}">
      ${thumb?`<img src="${chatEsc(thumb)}" alt="">`:`<span class="chat-duniya-post-card-text">🌳 ${chatEsc(cap.slice(0,80))}</span>`}
      <span>${chatEsc(att.author||'Peepal')}</span>
      <span style="font-weight:500;color:var(--muted);">${chatEsc(cap.slice(0,80))}</span>
    </button>`;
    rich=true;
  } else if(att && att.type==='story'){
    const live = !att.expiresAt || Number(att.expiresAt) > Date.now();
    const thumb = att.thumb || att.url || '';
    body=`<button type="button" class="ds-story-card" data-story-id="${chatEsc(att.storyId||'')}" data-story-dest="${chatEsc(att.destination||'duniya')}" ${live?'':'data-expired="1"'} style="display:block;width:120px;border:0;padding:0;background:none;text-align:left;cursor:pointer;">
      <span style="display:block;width:120px;height:180px;border-radius:12px;overflow:hidden;background:#111;">${thumb?`<img src="${chatEsc(thumb)}" alt="" style="width:100%;height:100%;object-fit:cover;">`:''}</span>
      <span style="display:block;font-size:11px;font-weight:700;margin-top:4px;">${chatEsc(att.name||'Story')}</span>
      ${live?'':`<span style="font-size:11px;color:var(--muted);">Story unavailable</span>`}
    </button>`;
    rich=true;
  } else if(att && att.type==='radio_share'){
    body=typeof renderRadioShareCard==='function'
      ?renderRadioShareCard({mood:att.mood,genre:att.genre,language:att.language}, att.sample)
      :`<div class="radio-share-card baithak-3d-edge">📻 Radio · ${chatEsc(att.mood||'discovery')}</div>`;
    rich=true;
  } else if(att && att.type==='commerce_card'){
    const feat = att.feature ? chatEsc(String(att.feature)) : '';
    const intro =
      typeof t === 'function'
        ? chatEsc(t('chat_commerce_nudge'))
        : 'See membership or your Chaupaal Money account.';
    body=`<div class="commerce-card"><div>${intro}${feat ? ` <strong>${feat}</strong>` : ''}</div>
      <div class="commerce-card-actions">
        <button type="button" class="btn" data-cm-membership>See membership</button>
        <button type="button" class="btn" data-cm-money>Chaupaal Money account</button>
      </div></div>`;
    rich=true;
  }

  if(!rich) body=chatEsc(body);

  const absTime = m.time || '';
  const relTime = (typeof formatRelativeTime === 'function' && (m.ts || m.time))
    ? formatRelativeTime(m.ts || m.time)
    : absTime;
  const statusHtml = isMe
    ? `<span class="msg-status${m.failed ? ' is-failed' : m.pending ? '' : ' is-sent'}" aria-hidden="true" title="${m.failed ? 'Failed · Tap to retry' : ''}">${m.failed ? '!' : m.pending ? '○' : '✓'}</span>`
    : '';

  return `
    <div class="msg-row ${isMe?'me':''}" data-uid="${chatEsc(uid)}" data-name="${chatEsc(name)}"${m.pending?' data-pending="1"':''}${m.failed?' data-failed="1"':''}>
      ${!isMe?`<div class="msg-avatar-small">${typeof renderUserAvatarHtml==='function'?renderUserAvatarHtml({uid,name,avatar:m.avatar,photoURL:m.photoURL},{decorative:true,size:24}):chatEsc(m.avatar||'👤')}</div>`:''}
      <div>
        ${(isGroup&&!isMe&&m.name)?`<div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:3px;">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(m.name,m):chatEsc(m.name)}</div>`:''}
        <div class="msg-bubble ${isMe?'me':'them'}${att&&att.type==='muqabala_challenge'?' challenge':''}${att&&att.type==='mehfil_invite'?' mehfil-invite':''}" data-msg-text="${chatEsc(m.text||'')}">${body}</div>
        <div class="msg-meta">
          <span class="msg-time" data-rel="${chatEsc(relTime||'')}" data-abs="${chatEsc(absTime||relTime||'')}" title="Tap for time">${chatEsc(relTime||absTime||'')}</span>
          ${statusHtml}
        </div>
      </div>
    </div>
  `;
}

function wireChallengeBubble(root){
  root?.querySelectorAll?.('[data-muqabala-challenge]').forEach((btn)=>{
    if(btn.dataset.wired==='1') return;
    btn.dataset.wired='1';
    btn.addEventListener('click',()=>{
      const id=btn.dataset.muqabalaChallenge;
      if(typeof launchPendingMuqabalaChallenge==='function') launchPendingMuqabalaChallenge(id);
      else if(typeof showToast==='function') showToast(t('baithak_challenge_unavailable'));
    });
  });
  root?.querySelectorAll?.('[data-mehfil-invite-join]').forEach((btn)=>{
    if(btn.dataset.wired==='1') return;
    btn.dataset.wired='1';
    btn.addEventListener('click',()=>{
      const chat=window.currentOpenChat;
      if(chat && typeof openMehfil==='function') openMehfil(chat);
      else if(typeof showToast==='function') showToast(typeof t==='function'?t('mehfil_unavailable'):'Mehfil unavailable');
    });
  });
  root?.querySelectorAll?.('[data-story-id]').forEach((btn)=>{
    if(btn.dataset.wired==='1') return;
    btn.dataset.wired='1';
    btn.addEventListener('click',()=>{
      if(btn.dataset.expired==='1'){
        if(typeof showToast==='function') showToast(typeof t==='function'?t('story_unavailable','Story unavailable'):'Story unavailable');
        return;
      }
      const id=btn.dataset.storyId;
      if(typeof DuniyaStory!=='undefined' && DuniyaStory.openById) DuniyaStory.openById(id);
      else if(typeof showToast==='function') showToast('Story unavailable');
    });
  });
  root?.querySelectorAll?.('[data-duniya-post]').forEach((btn)=>{
    if(btn.dataset.wired==='1') return;
    btn.dataset.wired='1';
    btn.addEventListener('click', async ()=>{
      const id=btn.dataset.duniyaPost;
      if(!id) return;
      try{
        if(typeof db!=='undefined' && db && typeof openDuniyaDetail==='function'){
          const doc=await db.collection('duniya').doc(id).get();
          if(doc.exists){
            const post=typeof mapDuniyaDoc==='function'?mapDuniyaDoc({id:doc.id,...doc.data()}):{id:doc.id,...doc.data()};
            openDuniyaDetail(post);
            return;
          }
        }
      }catch(e){}
      if(typeof showToast==='function') showToast('Post unavailable');
    });
  });
  root?.querySelectorAll?.('[data-peepal-post]').forEach((btn)=>{
    if(btn.dataset.wired==='1') return;
    btn.dataset.wired='1';
    btn.addEventListener('click', async ()=>{
      const id=btn.dataset.peepalPost;
      if(!id) return;
      try{
        if(typeof openPostById==='function'){
          await openPostById(id);
          return;
        }
        if(typeof db!=='undefined' && db && typeof openPeepalDetail==='function'){
          const doc=await db.collection('peepal').doc(id).get();
          if(doc.exists){
            const post=typeof mapPeepalDoc==='function'?mapPeepalDoc({id:doc.id,...doc.data()}):{id:doc.id,...doc.data()};
            openPeepalDetail(post);
            return;
          }
        }
      }catch(e){}
      if(typeof showToast==='function') showToast('Post unavailable');
    });
  });
}
window.wireChallengeBubble=wireChallengeBubble;

function bindMsgAvatarLongPress(root, fallbackProfile){
  if(!root) return;
  root.querySelectorAll('.msg-avatar-small').forEach((el)=>{
    if(el.dataset.lpBound) return;
    const row=el.closest('.msg-row');
    const uid=row?.dataset?.uid||fallbackProfile?.uid||'';
    if(!uid||uid===currentUser?.uid) return;
    el.dataset.lpBound='1';
    const profile={
      uid,
      name:row?.dataset?.name||fallbackProfile?.name||'Member',
      avatar:el.textContent?.trim()||fallbackProfile?.avatar||'👤',
      photoURL:fallbackProfile?.photoURL||'',
    };
    el.addEventListener('click',(e)=>{
      if(el.dataset.suppressClick==='1'){ e.preventDefault(); e.stopPropagation(); return; }
      e.stopPropagation();
      if(typeof openAvatarLightbox==='function'){
        openAvatarLightbox({
          photoURL: profile.photoURL || (typeof profile.avatar==='string'&&/^https?:/i.test(profile.avatar)?profile.avatar:''),
          name: profile.name,
          avatar: profile.avatar,
          uid,
          username: fallbackProfile?.username || '',
        });
      }
    });
    if(typeof onLongPress==='function'){
      onLongPress(el, () => {
        if(typeof openBaithakAvatarMenu==='function'){
          openBaithakAvatarMenu(el, profile);
        } else if(typeof openBaithakChatActions==='function' && window.currentOpenChat){
          openBaithakChatActions(window.currentOpenChat, { surface: 'message_avatar' });
        }
      },{ delayMs: 520 });
    }
  });
}

function addMsgBubble(msg, isGroup){
  const area = document.getElementById('chatMsgsArea');
  if(!area) return null;
  const div = document.createElement('div');
  div.innerHTML = renderMsgBubble(msg, isGroup);
  const node=div.firstElementChild;
  if(!node) return null;
  area.appendChild(node);
  bindMsgAvatarLongPress(node);
  if(typeof mountMusicCards==='function') mountMusicCards(node);
  if(typeof mountLocationCards==='function') mountLocationCards(node);
  if(typeof mountRadioShareCards==='function') mountRadioShareCards(node);
  if(typeof wireChallengeBubble==='function') wireChallengeBubble(node);
  node.querySelector('[data-cm-membership]')?.addEventListener('click', () => {
    if (typeof ChaupaalMoney?.openMembership === 'function') ChaupaalMoney.openMembership();
  });
  node.querySelector('[data-cm-money]')?.addEventListener('click', () => {
    if (typeof ChaupaalMoney?.openAccount === 'function') ChaupaalMoney.openAccount();
  });
  area.scrollTop = area.scrollHeight;
  return node;
}

async function sendMsg(chat){
  const screen = document.getElementById('activeChatScreen');
  if (screen?.dataset.chatReady !== '1') {
    if (typeof showToast === 'function') showToast(typeof t==='function'?t('baithak_send_failed','Chat still connecting — try again'):'Chat still connecting — try again');
    return;
  }
  const input=document.getElementById('chatMsgInput');
  const text=input?.value.trim();if(!text)return;
  const isGroup=chat.type==='group';
  const isChaupaal = typeof isChaupaalChat==='function' && isChaupaalChat(chat);
  const tempId='local_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const bubble={from:'me',text,time:'now',_tempId:tempId,pending:true,name:userProfile?.name||currentUser?.displayName||'You'};
  const prevValue=input.value;

  const apply=()=>{
    const row=addMsgBubble(bubble,isGroup);
    if(row){
      row.dataset.pending='1';
      row.dataset.clientTempId=tempId;
      row.setAttribute('data-pending','1');
    }
    input.value='';
    document.getElementById('aiSuggestionBar')?.classList.add('hidden');
    if(typeof SoundLib!=='undefined'&&SoundLib.send) SoundLib.send();
    if(typeof haptic==='function') haptic('light');
    if(typeof baithakMsgCache?.appendOptimistic==='function'){
      baithakMsgCache.appendOptimistic(chat.firestoreId||chat.id,{
        id:tempId,
        clientTempId:tempId,
        uid:currentUser?.uid,
        text,
        ts:Date.now(),
        name:bubble.name,
      }).catch(()=>{});
    }
  };
  const revert=()=>{};

  const unlock=typeof beginClientMutation==='function'?beginClientMutation(`msg_${chat.id}`):()=>{};
  if(unlock===false){ if(typeof showToast==='function') showToast(t('baithak_sending')); return; }

  const sendBtn=document.getElementById('chatSendBtn');
  if(typeof setButtonLoading==='function') setButtonLoading(sendBtn, true);
  else if(sendBtn) sendBtn.disabled=true;
  try{
    if(typeof runOptimistic==='function'){
      await runOptimistic({
        apply,
        revert,
        commit:async()=>{
          if(typeof assertRateLimit==='function') await assertRateLimit('message');
          if(isChaupaal && typeof sendChaupaalMessage==='function'){
            if(typeof handleChaupaalCommerceBeforeSend==='function' && handleChaupaalCommerceBeforeSend(text)){
              if(typeof trackMessageSent==='function') trackMessageSent({ chat_type: 'chaupaal_commerce' });
              return;
            }
            const area=document.getElementById('chatMsgsArea');
            const hist=[];
            area?.querySelectorAll('.msg-row')?.forEach(row=>{
              const t=row.querySelector('.msg-bubble')?.textContent||'';
              if(!t) return;
              hist.push({ role: row.classList.contains('me') ? 'user' : 'assistant', content: t });
            });
            const data = await sendChaupaalMessage(text, hist.slice(-12));
            if(data?.quiet){
              if(typeof applyChaupaalQuietComposer==='function'){
                applyChaupaalQuietComposer(document.getElementById('activeChatScreen'), true);
              }
            }
            const assistText = data?.reply || (data?.quiet ? (data.message || '') : '');
            if(assistText){
              const area2=document.getElementById('chatMsgsArea');
              const already=!![...(area2?.querySelectorAll('.msg-row:not(.me) .msg-bubble')||[])]
                .find((b)=> (b.getAttribute('data-msg-text')||'').slice(0,80)===String(assistText).slice(0,80));
              if(!already){
                setTimeout(()=>{
                  const area3=document.getElementById('chatMsgsArea');
                  if(!area3) return;
                  const has=!![...area3.querySelectorAll('.msg-row:not(.me) .msg-bubble')]
                    .find((b)=> (b.getAttribute('data-msg-text')||'').slice(0,80)===String(assistText).slice(0,80));
                  if(!has){
                    addMsgBubble({from:'them',text:assistText,time:'now',avatar:'🏠',uid:'chaupaal',name:'Chaupaal'}, false);
                  }
                }, 1800);
              }
            }
            if(typeof trackMessageSent==='function') trackMessageSent({ chat_type: 'chaupaal' });
            return;
          }
          if(typeof sendRealtimeMessage==='function'){
            const origin = chat.discoveryOrigin || chat.origin;
            const peerType = (chat.peerProfileType || chat.profileType || 'personal').toLowerCase();
            if (origin === 'ai_discovery' && peerType !== 'professional' && typeof PolicyUsage?.consume === 'function') {
              try {
                await PolicyUsage.consume('aiDiscoveryMsg');
              } catch (limErr) {
                const rem = await PolicyUsage.getRemaining('aiDiscoveryMsg').catch(() => null);
                const msg =
                  limErr?.code === 'QUOTA_UNAVAILABLE'
                    ? 'Couldn’t verify your message limit — try again shortly'
                    : rem?.unlock || limErr?.message || 'AI Discovery message limit reached';
                throw Object.assign(new Error(msg), {
                  code: limErr?.code || 'AI_DISC_LIMIT',
                });
              }
            }
            await sendRealtimeMessage(chat.firestoreId||chat.id,text,isGroup,null,null,{clientTempId:tempId});
          }
          scheduleChatInboxRefresh();
          if(typeof trackMessageSent==='function') trackMessageSent({ chat_type: chat.type||'dm' });
          if(typeof publishChatTyping==='function') publishChatTyping(chat.firestoreId||chat.id,false);
          if(typeof demoMarkSeenSoon==='function') demoMarkSeenSoon();
          if(!isChaupaal && (!db||!currentUser)) setTimeout(()=>{
            const replies=["Haha 😄","Totally agree!","Really?!","Let's talk later 🙏","Muqabala tomorrow? ⚔️","👍","What's the plan?"];
            addMsgBubble({from:'them',text:replies[Math.floor(Math.random()*replies.length)],time:'now',avatar:chat.avatar},isGroup);
            if(typeof demoMarkSeenSoon==='function') demoMarkSeenSoon();
          },1200);
        },
        onError:(err)=>{
          const area=document.getElementById('chatMsgsArea');
          const pending=[...(area?.querySelectorAll('.msg-row.me[data-pending="1"]')||[])];
          const row=pending.reverse().find((r)=>r.dataset.clientTempId===tempId)
            || pending.reverse().find((r)=>{
            const t=r.querySelector('.msg-bubble')?.getAttribute('data-msg-text')||'';
            return t===text;
          })||pending[0];
          markMsgRowFailed(row,text,chat,isGroup);
          if(typeof showToast==='function') showToast(err?.message||(typeof t==='function'?t('baithak_send_failed','Message not sent'):'Message not sent'));
          if(typeof reportClientError==='function'){
            reportClientError({feature:'dm_send',message:err?.message||String(err),code:err?.code||''});
          }
        },
        errorToast:null,
      });
    }else{
      apply();
      if(isChaupaal && typeof sendChaupaalMessage==='function'){
        const data = await sendChaupaalMessage(text, []);
        if(data?.quiet && typeof applyChaupaalQuietComposer==='function'){
          applyChaupaalQuietComposer(document.getElementById('activeChatScreen'), true);
        }
        const assistText = data?.reply || (data?.quiet ? (data.message || '') : '');
        if(assistText){
          setTimeout(()=>{
            const area3=document.getElementById('chatMsgsArea');
            if(!area3) return;
            const has=!![...area3.querySelectorAll('.msg-row:not(.me) .msg-bubble')]
              .find((b)=> (b.getAttribute('data-msg-text')||'').slice(0,80)===String(assistText).slice(0,80));
            if(!has){
              addMsgBubble({from:'them',text:assistText,time:'now',avatar:'🏠',uid:'chaupaal',name:'Chaupaal'}, false);
            }
          }, 1800);
        }
      } else if(typeof sendRealtimeMessage==='function') {
        sendRealtimeMessage(chat.firestoreId||chat.id,text,isGroup,null,null,{clientTempId:tempId});
      }
    }
  }finally{
    if(typeof setButtonLoading==='function') setButtonLoading(sendBtn, false);
    else if(sendBtn) sendBtn.disabled=false;
    if(typeof unlock==='function') unlock();
  }
}

function leaveGroupChat(chat){
  if(!chat||chat.type!=='group') return;
  if(typeof baithakChats==='undefined'||!Array.isArray(baithakChats)) return;
  const idx=baithakChats.findIndex(c=>c.id===chat.id||c.firestoreId===chat.firestoreId);
  if(idx<0) return;
  const item=baithakChats[idx];
  baithakChats.splice(idx,1);
  if(typeof forgetInboxChat==='function') forgetInboxChat(chat.firestoreId||chat.id);
  closeChatScreen({ updateHistory:true, animate:true });
  if(typeof renderChatList==='function') renderChatList(baithakChats);
  if(typeof showUndoToast==='function'){
    showUndoToast({
      message:`Left ${chat.name||'group'}`,
      onUndo:()=>{
        baithakChats.splice(idx,0,item);
        if(typeof renderChatList==='function') renderChatList(baithakChats);
        if(typeof showToast==='function') showToast(t('baithak_back_group'));
      },
    });
  } else if(typeof showToast==='function'){
    showToast(t('baithak_left_group',{name:chat.name||'group'}));
  }
}

// ===================== DAILY DUEL RITUAL =====================
const RITUAL_QUESTIONS = [
  {q:"When is Mahatma Gandhi's birthday?",options:["September 27","October 2","November 14","January 26"],correct:1},
  {q:"What is India's national animal?",options:["Lion","Elephant","Tiger","Peacock"],correct:2},
  {q:"In which city is the Taj Mahal located?",options:["Delhi","Jaipur","Agra","Lucknow"],correct:2},
  {q:"Which is the largest planet in the solar system?",options:["Saturn","Mars","Jupiter","Neptune"],correct:2},
  {q:"'Jai Hind' kiska nara tha?",options:["Gandhi","Nehru","Subhas Chandra Bose","Patel"],correct:2},
];

function startDailyDuelRitual(chat){
  const questions = [...RITUAL_QUESTIONS].sort(()=>Math.random()-0.5).slice(0,5);
  let qIdx = 0, myAnswers = [], theirAnswers = [];

  const overlay = document.createElement('div');
  // Class is the nav-stack registration hook (LAYER_SELECTORS) — styling stays inline
  overlay.className = 'duel-ritual-overlay';
  overlay.style.cssText = 'position:absolute;inset:0;background:var(--cream);z-index:90;display:flex;flex-direction:column;padding:16px;';

  function renderRitualQ(){
    if(qIdx >= questions.length){ showRitualResults(); return; }
    const q = questions[qIdx];
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">🔥 Daily Ritual — Q${qIdx+1}/5</div>
        <button id="closeRitual" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:16px;">
        <div style="flex:1;background:var(--white);border-radius:14px;padding:12px;text-align:center;">
          <div style="font-size:11px;font-weight:700;color:var(--muted);">You</div>
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;color:var(--red);">${myAnswers.filter(a=>a).length}</div>
        </div>
        <div style="flex:1;background:var(--white);border-radius:14px;padding:12px;text-align:center;">
          <div style="font-size:11px;font-weight:700;color:var(--muted);">${chat.name}</div>
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;color:var(--gold);">${theirAnswers.filter(a=>a).length}</div>
        </div>
      </div>
      <div style="background:var(--white);border-radius:20px;padding:22px;flex:1;display:flex;flex-direction:column;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:19px;margin-bottom:20px;flex:1;">${q.q}</div>
        <div style="display:flex;flex-direction:column;gap:10px;" id="ritualOpts">
          ${q.options.map((o,i)=>`<button class="opt" data-i="${i}"><span>${o}</span><span class="mark"></span></button>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--muted);text-align:center;margin-top:12px;" id="waitingFor">Waiting for ${chat.name}...</div>
      </div>
    `;
    document.getElementById('closeRitual').addEventListener('click', () => overlay.remove());

    const opts = overlay.querySelectorAll('.opt');
    opts.forEach(btn => btn.addEventListener('click', () => {
      if(overlay.dataset.myAnswered) return;
      overlay.dataset.myAnswered = 'true';
      const chosen = parseInt(btn.dataset.i);
      const correct = chosen === q.correct;
      myAnswers.push(correct);
      opts.forEach(b => b.disabled = true);
      opts.forEach((b,i) => {
        if(i===q.correct){b.classList.add('correct');b.querySelector('.mark').textContent='✓';}
        else if(i===chosen){b.classList.add('wrong');b.querySelector('.mark').textContent='✕';}
        else b.classList.add('dim');
      });
      SoundLib.playFeedback(correct, 'default');
      // wait for simulated opponent
      const oppDelay = 800 + Math.random()*2000;
      setTimeout(() => {
        const theirCorrect = Math.random() < 0.6;
        theirAnswers.push(theirCorrect);
        const w = overlay.querySelector('#waitingFor');
        if(w) w.textContent = theirCorrect ? `${chat.name} answered correctly ✓` : `${chat.name} got it wrong ✕`;
        // both answered — advance
        setTimeout(() => { qIdx++; delete overlay.dataset.myAnswered; renderRitualQ(); }, 900);
      }, oppDelay);
    }));
  }

  function showRitualResults(){
    const myTotal = myAnswers.filter(a=>a).length;
    const theirTotal = theirAnswers.filter(a=>a).length;
    const won = myTotal > theirTotal;
    const tie = myTotal === theirTotal;
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">🔥 Ritual complete!</div>
        <button id="closeRitual2" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
      </div>
      <div style="text-align:center;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;">
        <div style="font-size:56px;">${tie?'🤝':won?'🎉':'😅'}</div>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;">${tie?"It's a tie!":won?'You won!':`${chat.name} won this time!`}</div>
        <div style="background:var(--white);border-radius:16px;padding:16px;width:100%;">
          <div style="display:flex;justify-content:space-between;font-weight:700;font-size:16px;"><span>You</span><span>${myTotal}/5</span></div>
          <div style="display:flex;justify-content:space-between;font-weight:700;font-size:16px;color:var(--muted);margin-top:8px;"><span>${chat.name}</span><span>${theirTotal}/5</span></div>
        </div>
        <div style="background:rgba(255,201,60,0.12);border:1.5px solid var(--gold);border-radius:14px;padding:14px;width:100%;text-align:center;">
          <div style="font-size:11px;font-weight:700;color:#A8780E;text-transform:uppercase;letter-spacing:0.06em;">🔥 Streak</div>
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:28px;color:var(--red);">${(chat.duelStreak||0)+1} days</div>
        </div>
      </div>
      <button style="width:100%;padding:14px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;" id="closeRitual2Btn">Done 🙏</button>
    `;
    document.getElementById('closeRitual2').addEventListener('click', () => overlay.remove());
    document.getElementById('closeRitual2Btn').addEventListener('click', () => { overlay.remove(); showToast(`See you tomorrow! 🔥 ${(chat.duelStreak||0)+1}-day streak!`); });
  }

  document.querySelector('.device').appendChild(overlay);
  renderRitualQ();
}

// ===================== STORY VIEWER =====================
function safeStoryText(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function openBaithakStoryViewer(story, allStories){
  const stories=allStories||[story];
  let currentIdx=stories.indexOf(story);if(currentIdx<0)currentIdx=0;
  let progressInterval=null;

  const viewer=document.createElement('div');
  viewer.className='story-viewer';
  viewer.style.cssText='position:absolute;inset:0;background:#000;z-index:200;display:flex;flex-direction:column;';
  document.querySelector('.device').appendChild(viewer);
  viewer.addEventListener('chaupaal:dismiss', () => {
    clearInterval(progressInterval);
    if(typeof pauseAllMusic==='function') pauseAllMusic();
  });

  function renderStory(idx){
    clearInterval(progressInterval);
    if(typeof pauseAllMusic==='function') pauseAllMusic();
    const s=stories[idx];s.seen=true;
    const isMedia=s.type==='media'||s.type==='duniya_story';
    const isScore=s.type==='score';
    const isBirthday=s.type==='birthday';
    const isDuel=s.type==='duel';
    const hasMusic=!!(s.music&&s.music.title);
    const hasLocation=!!(s.location&&Number.isFinite(Number(s.location.lat))&&Number.isFinite(Number(s.location.lng)));
    const musicOnly=hasMusic&&!(isMedia&&s.media)&&!hasLocation;
    const locationOnly=hasLocation&&!(isMedia&&s.media)&&!hasMusic;
    const timeAgo=(s.ts||s.createdAt)?timeAgoStr(s.ts||s.createdAt):'now';
    const destinationLabel=s.destination==='duniya'?'Duniya':s.destination==='baithak'?'Baithak':'';
    const ownerAudience=s.own&&(s.kind==='split'||s.kind==='instant')?' · Split':'';
    const musicOverlay=hasMusic&&typeof renderMusicCard==='function'
      ?renderMusicCard(s.music,{variant:'story'})
      :'';
    const locationOverlay=hasLocation&&typeof renderLocationCard==='function'
      ?renderLocationCard(s.location,{variant:'story'})
      :'';

    viewer.innerHTML=`
      <!-- Progress bars -->
      <div style="display:flex;gap:3px;padding:10px 12px 6px;flex-shrink:0;position:relative;z-index:2;">
        ${stories.map((_,i)=>`<div style="flex:1;height:3px;background:rgba(255,255,255,0.35);border-radius:99px;overflow:hidden;"><div id="sp_${i}" style="height:100%;background:#fff;width:${i<idx?'100':i===idx?'0':'0'}%;transition:none;"></div></div>`).join('')}
      </div>
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;padding:4px 14px 10px;position:relative;z-index:2;">
        <div class="story-viewer-avatar" style="width:36px;height:36px;border-radius:50%;background:linear-gradient(45deg,#E63946,#8134AF);padding:2px;flex-shrink:0;">
          <div style="width:100%;height:100%;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;font-size:16px;">${s.photoURL||/^https:/.test(s.avatar||'')?`<img src="${s.photoURL||s.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`:s.avatar}</div>
        </div>
        <div style="flex:1;">
          <div style="color:#fff;font-weight:700;font-size:14px;">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(s.name,s):s.name}</div>
          <div style="color:rgba(255,255,255,0.6);font-size:11px;">${timeAgo}${destinationLabel?` · <span class="story-destination-tag story-destination-tag--${s.destination}">${destinationLabel}${ownerAudience}</span>`:''}</div>
        </div>
        ${s.deletable?`<button id="storyDelete" style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:18px;cursor:pointer;">🗑️</button>`:''}
        <button id="storyClose" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:4px;">✕</button>
      </div>
      <!-- Content -->
      <div style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;" id="storyContent">
        ${musicOnly||locationOnly?`<div class="story-music-backdrop" aria-hidden="true"></div>`:
          isMedia&&s.media?(
          s.mediaType==='video'
            ?`<video src="${s.media}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>`
            :`<img src="${s.media}" style="width:100%;height:100%;object-fit:${s.rotation?'contain':'cover'};transform:rotate(${Number(s.rotation)||0}deg);">`
        ):isScore?`
          <div style="background:linear-gradient(160deg,var(--navy),#E63946);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;">
            <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px;">⚡ Today's Akhbaar</div>
            <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:80px;color:#fff;line-height:1;">${s.score}</div>
            <div style="font-size:18px;color:rgba(255,255,255,0.7);margin-top:4px;">out of ${s.total}</div>
            <div style="margin-top:24px;background:rgba(255,255,255,0.12);border-radius:16px;padding:14px 24px;text-align:center;">
              <div style="font-size:28px;">🔥 ${s.streak} day streak</div>
            </div>
            <div style="margin-top:20px;font-size:13px;color:rgba(255,255,255,0.5);">Chaupaal · chaupaal-chaupaal.web.app</div>
          </div>
        `:isBirthday?`
          <div style="background:linear-gradient(160deg,var(--gold),#FF9A3C);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;">
            <div style="font-size:72px;margin-bottom:16px;">🎂</div>
            <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:28px;color:var(--ink);">Happy Birthday ${s.name}!</div>
            <div style="font-size:15px;color:rgba(43,39,48,0.7);margin-top:12px;line-height:1.5;">Wishing you a wonderful day filled with joy 🎉</div>
          </div>
        `:isDuel?`
          <div style="background:linear-gradient(160deg,var(--navy),#2A3158);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;">
            <div style="font-size:52px;margin-bottom:16px;">⚔️</div>
            <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;color:#fff;">${s.text||'Duel result'}</div>
          </div>
        `:`<div style="width:100%;height:100%;background:#111;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:14px;">Story</div>`}
        ${s.text?`<div class="story-viewer-text">${safeStoryText(s.text)}</div>`:''}
        ${musicOverlay}
        ${locationOverlay}
        ${s.sharedGameId?`<button type="button" class="story-game-card" id="storyGameCard">Play ${safeStoryText(typeof getGame==='function'?(getGame(s.sharedGameId)?.name||'game'):'game')}</button>`:''}
        <!-- Tap zones (below music/location cards — z-index 1 vs card z-index 3) -->
        <div id="tapPrev" style="position:absolute;left:0;top:0;width:35%;height:100%;cursor:pointer;z-index:1;"></div>
        <div id="tapNext" style="position:absolute;right:0;top:0;width:35%;height:100%;cursor:pointer;z-index:1;"></div>
      </div>
      ${s.id&&s.destination?`
      <div class="story-interactions">
        <div class="story-interaction-actions">
          <button type="button" id="storyLike" aria-label="Like story">♡ <span id="storyLikeCount">0</span></button>
          <button type="button" id="storyCommentsToggle">Comments</button>
        </div>
        <div id="storyComments" class="story-comments hidden"></div>
        <div class="story-comment-compose">
          <input id="storyReplyInput" maxlength="500" placeholder="Comment on this story…">
          <button type="button" id="storyReplySend">↑</button>
        </div>
      </div>`:(s.name!=='You'&&!s.deletable?`
      <div style="display:flex;gap:8px;padding:12px 14px;flex-shrink:0;">
        <input id="storyReplyInput" placeholder="Reply to ${s.name}..." style="flex:1;padding:10px 14px;border-radius:999px;border:none;background:rgba(255,255,255,0.12);color:#fff;font-size:14px;outline:none;">
        <button id="storyReplySend" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;">↑</button>
      </div>`:'')}
    `;

    document.getElementById('storyClose').addEventListener('click',()=>{clearInterval(progressInterval);if(typeof pauseAllMusic==='function')pauseAllMusic();viewer.remove();});
    if(!s.own&&s.uid&&typeof bindProfileLongPress==='function'){
      bindProfileLongPress(viewer.querySelector('.story-viewer-avatar'),{
        uid:s.uid,name:s.name,avatar:s.avatar,
        photoURL:s.photoURL||(/^https:/.test(s.avatar||'')?s.avatar:''),
      });
    }
    document.getElementById('storyDelete')?.addEventListener('click',async()=>{
      clearInterval(progressInterval);
      if(s.id&&s.destination&&typeof deletePlatformStory==='function'){
        try{await deletePlatformStory(s);showToast('Story removed from live view');}
        catch(error){showToast(error?.message||'Could not delete story');return;}
      }
      viewer.remove();
      if(typeof renderLiveBaithakStories==='function') renderLiveBaithakStories();
    });
    document.getElementById('tapPrev').addEventListener('click',()=>{if(idx>0){clearInterval(progressInterval);renderStory(idx-1);}else{clearInterval(progressInterval);if(typeof pauseAllMusic==='function')pauseAllMusic();viewer.remove();}});
    document.getElementById('tapNext').addEventListener('click',()=>{if(idx<stories.length-1){clearInterval(progressInterval);renderStory(idx+1);}else{clearInterval(progressInterval);if(typeof pauseAllMusic==='function')pauseAllMusic();viewer.remove();}});
    if(typeof mountMusicCards==='function') mountMusicCards(viewer);
    if(typeof mountLocationCards==='function') mountLocationCards(viewer);
    if(typeof enhanceMediaIn==='function') enhanceMediaIn(viewer);
    document.getElementById('storyReplySend')?.addEventListener('click',async()=>{
      const txt=document.getElementById('storyReplyInput')?.value.trim();
      if(!txt)return;
      if(s.id&&s.destination&&typeof commentPlatformStory==='function'){
        try{
          await commentPlatformStory(s,txt);
          document.getElementById('storyReplyInput').value='';
          await hydrateStoryInteractions();
          document.getElementById('storyComments')?.classList.remove('hidden');
        }catch(error){showToast(error?.message||'Comment could not be sent');}
        return;
      }
      const chat=SAMPLE_CHATS.find(c=>c.name===s.name)||{id:'r_'+s.name,name:s.name,avatar:s.avatar||'👤',type:'dm'};
      clearInterval(progressInterval);viewer.remove();
      document.querySelectorAll('.tab-btn').forEach(b=>{if(b.dataset.tab==='baithak')b.click();});
      setTimeout(()=>{initBaithak();setTimeout(()=>openChatScreen(chat),300);},200);
    });

    let storyLiked=false;
    async function hydrateStoryInteractions(){
      if(!s.id||!s.destination||typeof getStoryInteractions!=='function')return;
      try{
        const info=await getStoryInteractions(s);
        storyLiked=!!info.liked;
        const like=document.getElementById('storyLike');
        if(like) like.firstChild.textContent=storyLiked?'♥ ':'♡ ';
        const count=document.getElementById('storyLikeCount');
        if(count) count.textContent=info.likeCount||0;
        const comments=document.getElementById('storyComments');
        if(info.comments?.length && typeof enrichUsersWithProfileType==='function'){
          await enrichUsersWithProfileType(info.comments);
        }
        if(comments) comments.innerHTML=info.comments?.length
          ?info.comments.map(c=>`<div class="story-comment"><strong>${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(c.name,c):safeStoryText(c.name)}</strong><span>${safeStoryText(c.text)}</span></div>`).join('')
          :'<div class="story-comment-empty">No comments yet.</div>';
      }catch(error){}
    }
    document.getElementById('storyLike')?.addEventListener('click',async()=>{
      const next=!storyLiked;
      try{await likePlatformStory(s,next);storyLiked=next;await hydrateStoryInteractions();}
      catch(error){showToast(error?.message||'Like could not be saved');}
    });
    document.getElementById('storyCommentsToggle')?.addEventListener('click',()=>{
      clearInterval(progressInterval);
      document.getElementById('storyComments')?.classList.toggle('hidden');
    });
    document.getElementById('storyReplyInput')?.addEventListener('focus',()=>clearInterval(progressInterval));
    document.getElementById('storyGameCard')?.addEventListener('click',()=>{
      clearInterval(progressInterval);
      const game=typeof getGame==='function'?getGame(s.sharedGameId):null;
      if(game){viewer.remove();game.launch({source:'story'});}
      else showToast(t('baithak_game_unavailable'));
    });
    hydrateStoryInteractions();

    // Animate progress bar
    const fill=document.getElementById(`sp_${idx}`);
    if(fill){
      let w=0;
      progressInterval=setInterval(()=>{
        w+=100/50; // 5 seconds total (100ms interval × 50 = 5000ms)
        fill.style.width=Math.min(w,100)+'%';
        if(w>=100){clearInterval(progressInterval);if(idx<stories.length-1)renderStory(idx+1);else viewer.remove();}
      },100);
    }
  }

  renderStory(currentIdx);
}

window.openBaithakStoryViewer = openBaithakStoryViewer;
function openStoryViewer(story, allStories, tray) {
  if (typeof DuniyaStory !== 'undefined' && DuniyaStory.openViewer && (story?.destination === 'duniya' || tray?.tray)) {
    return DuniyaStory.openViewer(story, allStories, tray);
  }
  return openBaithakStoryViewer(story, allStories);
}
window.openStoryViewer = openStoryViewer;

// Prefer shared helper from ui-states.js; keep a tiny local fallback.
function timeAgoStr(ts){
  if(typeof formatRelativeTime==='function') return formatRelativeTime(ts);
  const diff=Date.now()-ts;
  if(diff<3600000)return Math.floor(diff/60000)+'m ago';
  if(diff<86400000)return Math.floor(diff/3600000)+'h ago';
  return Math.floor(diff/86400000)+'d ago';
}

// Open Duniya story viewer
function openDuniyaStoryViewer(userItem){
  const storyData={name:userItem.name,avatar:userItem.avatar||'👤',type:'duniya_story',media:null,seen:false,visibility:'public',ts:Date.now()-3600000};
  openStoryViewer(storyData,[storyData]);
}

function showAddStoryOptions(){
  showBaithakShareMenu();
}

async function addBaithakStory(story){
  if(typeof createPlatformStory!=='function')throw new Error('Story service unavailable');
  const created=await createPlatformStory({destination:'baithak',kind:'story',...story});
  if(typeof renderLiveBaithakStories==='function')renderLiveBaithakStories();
  return created;
}

async function shareAkhbaarScore(visibility='friends'){
  try{
    const stats=typeof getAkhbaarShareStats==='function'?getAkhbaarShareStats():{
      score,total:QUESTIONS.length,
      streak:parseInt(document.getElementById('streakNum')?.textContent,10)||0,
      scoreLine:`${score}/${QUESTIONS.length}`,
    };
    if(typeof postGameScoreStory==='function'){
      const created=await postGameScoreStory('akhbaar',{
        ...stats,
        destination:'baithak',
        visibility,
      });
      if(created&&typeof openStoryViewer==='function') openStoryViewer(created,[created]);
      return created;
    }
    const created=await addBaithakStory({
      type:'score',visibility,
      score,total:QUESTIONS.length,
      streak:parseInt(document.getElementById('streakNum')?.textContent,10)||0,
    });
    openStoryViewer(created,[created]);
    return created;
  }catch(error){showToast(error?.message||'Score story could not be shared');}
}

// ===================== BAITHAK STORY CREATION =====================
function showBaithakShareMenu(){
  const anchor = document.getElementById('addStoryBtn');
  const row = document.getElementById('storiesRow');
  if (!anchor || !row) {
    if (typeof showActionSheet === 'function') {
      showActionSheet('Share in Baithak', [
        {label:'Split',icon:'zap',hint:'Shares with Friends in 5s. No editing.',fn:openBaithakInstantCamera},
        {label:'Create a story',icon:'camera',hint:'Camera with text, stickers, games, and audience controls.',fn:()=>openBaithakStoryComposer('camera')},
        {label:'Upload a story',icon:'image',hint:'Pick from gallery, then edit before sharing with Friends.',fn:()=>openBaithakStoryComposer('gallery')},
        {label:'Share a song',icon:'music',hint:'In-app music card — searchable, playable preview. No external apps.',fn:shareBaithakSongStory},
        {label:'Share a location',icon:'map-pin',hint:'Current place, search, pin drop, or live share — map card in Stories.',fn:shareBaithakLocationStory},
      ]);
    } else openBaithakStoryComposer('camera');
    return;
  }

  document.getElementById('storyShareExpand')?.remove();
  const expand = document.createElement('div');
  expand.id = 'storyShareExpand';
  expand.className = 'story-share-expand';
  expand.setAttribute('role', 'menu');
  const items = [
    {label:'Split',icon:'zap',fn:openBaithakInstantCamera},
    {label:'Create',icon:'camera',fn:()=>openBaithakStoryComposer('camera')},
    {label:'Upload',icon:'image',fn:()=>openBaithakStoryComposer('gallery')},
    {label:'Song',icon:'music',fn:shareBaithakSongStory},
    {label:'Location',icon:'map-pin',fn:shareBaithakLocationStory},
  ];
  expand.innerHTML = items.map((it,i)=>`
    <button type="button" class="story-share-expand-item" data-i="${i}" role="menuitem">
      <span class="story-share-expand-icon">${typeof iconHtml==='function'?iconHtml(it.icon,{size:16}):''}</span>
      <span>${it.label}</span>
    </button>`).join('');

  // Insert directly under the add-story ring (expand from the story)
  if (anchor.nextSibling) row.insertBefore(expand, anchor.nextSibling);
  else row.appendChild(expand);

  requestAnimationFrame(() => expand.classList.add('is-open'));

  const close = () => {
    expand.classList.remove('is-open');
    setTimeout(() => expand.remove(), 180);
    document.removeEventListener('pointerdown', onOutside, true);
  };
  const onOutside = (e) => {
    if (!expand.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close();
  };
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);

  expand.querySelectorAll('.story-share-expand-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.i);
      close();
      const fn = items[idx]?.fn;
      if (typeof fn === 'function') setTimeout(fn, 60);
    });
  });
}

async function shareBaithakSongStory(){
  if(typeof openSongPicker!=='function'){showToast(t('baithak_song_unavailable'));return;}
  openSongPicker({
    title:'Share a song to Stories',
    onSelect:async(music)=>{
      try{
        showToast('Sharing song…');
        const created=await createPlatformStory({
          destination:'baithak',
          kind:'story',
          visibility:'friends',
          type:'media',
          text:'',
          music,
        });
        if(typeof renderLiveBaithakStories==='function') renderLiveBaithakStories();
        if(typeof haptic==='function') haptic('success');
        showToast(t('baithak_song_shared'));
        if(created&&typeof openStoryViewer==='function') openStoryViewer(created,[created]);
      }catch(error){
        showToast(error?.message||'Could not share song');
      }
    },
  });
}

async function shareBaithakLocationStory(){
  if(typeof openLocationComposer!=='function'){showToast(t('baithak_loc_unavailable'));return;}
  openLocationComposer({
    title:'Share location to Stories',
    onSelect:async(location)=>{
      try{
        showToast('Sharing location…');
        const created=await createPlatformStory({
          destination:'baithak',
          kind:'story',
          visibility:'friends',
          type:'media',
          text:'',
          location,
        });
        if(typeof renderLiveBaithakStories==='function') renderLiveBaithakStories();
        if(typeof haptic==='function') haptic('success');
        showToast(t('baithak_loc_shared'));
        if(created&&typeof openStoryViewer==='function') openStoryViewer(created,[created]);
      }catch(error){
        showToast(error?.message||'Could not share location');
      }
    },
  });
}

function chooseBaithakMedia(mode,onFile){
  const input=document.createElement('input');
  input.type='file';
  input.accept='image/*,video/*';
  if(mode==='camera'){
    input.accept='image/*';
    input.setAttribute('capture','environment');
  }
  input.addEventListener('change',()=>{
    const file=input.files?.[0];
    if(file) onFile(file);
  },{once:true});
  input.click();
}

/** In-app camera capture when getUserMedia is available; falls back to file input. */
function openInAppCamera({onCapture,facingMode='environment',hint}={}){
  if(!navigator.mediaDevices?.getUserMedia){
    chooseBaithakMedia('camera',onCapture);
    return;
  }
  const overlay=document.createElement('div');
  overlay.className='story-camera';
  overlay.innerHTML=`
    <video class="story-camera-video" playsinline autoplay muted></video>
    <canvas class="story-camera-canvas hidden"></canvas>
    <div class="story-camera-chrome">
      <button type="button" data-cam-close aria-label="Close">✕</button>
      <div class="story-camera-hint">${hint || 'Story'}</div>
      <button type="button" data-cam-flip aria-label="Flip camera">↻</button>
    </div>
    <button type="button" class="story-camera-shutter" data-cam-shutter aria-label="Capture"></button>`;
  document.querySelector('.device')?.appendChild(overlay);
  let stream=null;
  let facing=facingMode;
  const video=overlay.querySelector('video');
  const canvas=overlay.querySelector('canvas');

  const stop=()=>{
    stream?.getTracks?.().forEach(t=>t.stop());
    stream=null;
    overlay.remove();
  };

  const start=async()=>{
    try{
      stream?.getTracks?.().forEach(t=>t.stop());
      stream=await navigator.mediaDevices.getUserMedia({
        audio:false,
        video:{facingMode:facing,width:{ideal:1280},height:{ideal:720}},
      });
      video.srcObject=stream;
      await video.play();
    }catch(e){
      stop();
      chooseBaithakMedia('camera',onCapture);
    }
  };

  overlay.querySelector('[data-cam-close]').addEventListener('click',stop);
  overlay.querySelector('[data-cam-flip]').addEventListener('click',()=>{
    facing=facing==='environment'?'user':'environment';
    start();
  });
  overlay.querySelector('[data-cam-shutter]').addEventListener('click',()=>{
    if(!video.videoWidth)return;
    canvas.width=video.videoWidth;
    canvas.height=video.videoHeight;
    canvas.getContext('2d').drawImage(video,0,0);
    canvas.toBlob((blob)=>{
      if(!blob)return;
      const file=new File([blob],`split_${Date.now()}.jpg`,{type:'image/jpeg'});
      stop();
      onCapture(file);
    },'image/jpeg',0.92);
  });
  start();
}

function openBaithakInstantCamera(){
  const signInMsg = typeof t==='function' ? t('baithak_sign_in_instant') : 'Sign in to share a Split';
  if(!currentUser){showToast(signInMsg);return;}
  const hint = typeof t==='function' && t('instants_camera_hint')!=='instants_camera_hint'
    ? t('instants_camera_hint')
    : 'Split · Friends';
  openInAppCamera({hint,onCapture:(file)=>{
    const preview=URL.createObjectURL(file);
    const share = async ()=>{
      if(typeof processAndUploadMedia!=='function') throw new Error('Media upload unavailable');
      const up=await processAndUploadMedia(file,{folder:'splits'});
      const created = typeof shareBaithakSplit==='function'
        ? await shareBaithakSplit({
            type:'media',
            media:up.media||up.url||up.secure_url,
            thumb:up.thumb,
            mediaType:file.type.startsWith('video')?'video':'image',
          })
        : await createPlatformStory({
            destination:'baithak',kind:'split',visibility:'close_friends',
            type:'media',media:up.media,thumb:up.thumb,
            mediaType:file.type.startsWith('video')?'video':'image',
          });
      if(typeof renderBaithakInstants==='function') renderBaithakInstants();
      else if(typeof renderLiveBaithakStories==='function') renderLiveBaithakStories();
      return created;
    };
    if(typeof showSplitUndoBar==='function'){
      showSplitUndoBar({
        previewUrl:preview,
        onCommit:async()=>{
          await share();
          URL.revokeObjectURL(preview);
        },
        onCancel:()=>URL.revokeObjectURL(preview),
      });
      return;
    }
    const pending=document.createElement('div');
    pending.className='instant-pending';
    pending.setAttribute('data-nav-ignore','1');
    pending.innerHTML=`<img src="${preview}" alt=""><div><strong>Split ready</strong><span>Sharing with Friends in 5s…</span></div><button type="button">Undo</button>`;
    document.querySelector('.device')?.appendChild(pending);
    let cancelled=false;
    const timer=setTimeout(async()=>{
      if(cancelled)return;
      pending.querySelector('span').textContent='Sharing…';
      try{
        await share();
        pending.remove();
        URL.revokeObjectURL(preview);
        showToast(typeof t==='function'?t('instants_shared'):'Split shared');
      }catch(error){
        pending.remove();
        URL.revokeObjectURL(preview);
        showToast(error?.message||'Could not share Split');
      }
    },5000);
    pending.querySelector('button').addEventListener('click',()=>{
      cancelled=true;clearTimeout(timer);pending.remove();URL.revokeObjectURL(preview);
      showToast(typeof t==='function'?t('instants_undone'):'Split undone');
    });
  }});
}

function openBaithakStoryComposer(mode){
  if(!currentUser){showToast(t('baithak_sign_in_story'));return;}
  if(mode==='camera'){
    openInAppCamera({
      onCapture:(file)=>showBaithakStoryEditor(file,'camera'),
    });
    return;
  }
  chooseBaithakMedia(mode,(file)=>showBaithakStoryEditor(file,mode));
}

function showBaithakStoryEditor(file,mode){
  const preview=URL.createObjectURL(file);
  const editor=document.createElement('div');
  editor.className='story-editor';
  let rotation=0;
  let filter='none';
  let textColor='#ffffff';
  editor.innerHTML=`
    <div class="story-editor-header">
      ${typeof backButtonHtml==='function'?backButtonHtml({ attrs: 'data-story-cancel' }):'<button type="button" data-story-cancel class="cp-back-btn" aria-label="Back"></button>'}
      <strong>${mode==='camera'?'Create a story':'Upload a story'}</strong>
      <button type="button" data-story-share>Share</button>
    </div>
    <div class="story-editor-preview" data-story-preview>
      ${file.type.startsWith('video')?`<video src="${preview}" controls playsinline></video>`:`<img src="${preview}" alt="" data-story-img>`}
      <canvas class="story-draw-canvas" data-story-draw></canvas>
      <div class="story-sticker-layer" data-story-stickers></div>
      <div data-story-overlay class="story-viewer-text"></div>
    </div>
    <div class="story-editor-tools">
      <div class="story-editor-tool-row">
        <label class="story-editor-field">Text
          <input maxlength="160" placeholder="Add text" data-story-text>
        </label>
        <button type="button" data-story-text-color title="Text colour">Aa</button>
        ${file.type.startsWith('image')?'<button type="button" data-story-rotate>↻</button>':''}
      </div>
      <div class="story-editor-filters" data-story-filters>
        ${[['none','Original'],['warm','Warm'],['cool','Cool'],['mono','Mono'],['vivid','Vivid']].map(([id,label])=>
          `<button type="button" data-filter="${id}" class="${id==='none'?'is-active':''}">${label}</button>`
        ).join('')}
      </div>
      <div class="story-sticker-pack" data-story-sticker-pack aria-label="Stickers">
        ${['🔥','✨','❤️','😂','🙏','☕','🏏','🎵'].map(s=>`<button type="button" class="story-sticker-btn" data-sticker="${s}">${s}</button>`).join('')}
      </div>
      <div class="story-draw-row">
        <button type="button" class="btn" data-story-draw-toggle>Draw</button>
        <button type="button" class="btn" data-story-draw-clear>Clear draw</button>
        <span style="font-size:11px;color:var(--muted);">Light doodle on top of media</span>
      </div>
      <label class="story-editor-field">Audience
        <select data-story-audience>
          <option value="friends">Friends — mutual connections only</option>
          <option value="save_only">💾 Save without posting</option>
          <option value="highlights_only">◎ Add directly to Highlights</option>
        </select>
      </label>
      <div class="story-editor-field hidden" data-story-highlight-wrap>
        <label>Highlight collection
          <select data-story-highlight></select>
        </label>
      </div>
      <p class="story-editor-note">Save without posting / Highlights never appear as a live story.</p>
      <label class="story-editor-field">Game card
        <select data-story-game>
          <option value="">No game attached</option>
          ${typeof getGames==='function'?getGames({dangal:true}).map(game=>`<option value="${game.id}">${game.icon} ${game.name}</option>`).join(''):''}
        </select>
      </label>
      <div class="story-editor-tool-row" style="align-items:center;gap:10px;">
        <button type="button" class="btn" data-story-song aria-label="Share a song">🎵 Song</button>
        <span data-story-song-label style="font-size:12px;color:var(--muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">No song attached</span>
        <button type="button" class="btn hidden" data-story-song-clear aria-label="Remove song">✕</button>
      </div>
      <div class="story-editor-tool-row" style="align-items:center;gap:10px;">
        <button type="button" class="btn" data-story-location aria-label="Share a location">📍 Location</button>
        <span data-story-location-label style="font-size:12px;color:var(--muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">No location attached</span>
        <button type="button" class="btn hidden" data-story-location-clear aria-label="Remove location">✕</button>
      </div>
      <div class="story-editor-plus-row">
        <button type="button" class="story-plus-btn" data-story-plus aria-label="Add more">＋</button>
        <span>Tap for camera · long-press for Split / Create / Upload</span>
      </div>
    </div>`;
  document.querySelector('.device')?.appendChild(editor);
  let selectedMusic=null;
  let selectedLocation=null;
  const songLabel=editor.querySelector('[data-story-song-label]');
  const songClear=editor.querySelector('[data-story-song-clear]');
  const locLabel=editor.querySelector('[data-story-location-label]');
  const locClear=editor.querySelector('[data-story-location-clear]');
  const updateSongLabel=()=>{
    if(selectedMusic){
      songLabel.textContent=`${selectedMusic.title} · ${selectedMusic.artist}`;
      songClear?.classList.remove('hidden');
    }else{
      songLabel.textContent='No song attached';
      songClear?.classList.add('hidden');
    }
  };
  const updateLocLabel=()=>{
    if(selectedLocation){
      locLabel.textContent=selectedLocation.placeName||selectedLocation.label||'Location';
      locClear?.classList.remove('hidden');
    }else{
      locLabel.textContent='No location attached';
      locClear?.classList.add('hidden');
    }
  };
  editor.querySelector('[data-story-song]')?.addEventListener('click',()=>{
    if(typeof openSongPicker!=='function'){showToast(t('baithak_song_unavailable'));return;}
    openSongPicker({
      title:'Attach a song',
      onSelect:(music)=>{
        selectedMusic=music;
        updateSongLabel();
      },
    });
  });
  songClear?.addEventListener('click',()=>{
    selectedMusic=null;
    updateSongLabel();
  });
  editor.querySelector('[data-story-location]')?.addEventListener('click',()=>{
    if(typeof openLocationComposer!=='function'){showToast(t('baithak_loc_unavailable'));return;}
    openLocationComposer({
      title:'Attach a location',
      onSelect:(loc)=>{
        selectedLocation=loc;
        updateLocLabel();
      },
    });
  });
  locClear?.addEventListener('click',()=>{
    selectedLocation=null;
    updateLocLabel();
  });
  const img=editor.querySelector('[data-story-img]');
  const stickerLayer=editor.querySelector('[data-story-stickers]');
  const drawCanvas=editor.querySelector('[data-story-draw]');
  const previewBox=editor.querySelector('[data-story-preview]');
  let drawing=false;
  let drawOn=false;
  const stickersPlaced=[];
  const sizeCanvas=()=>{
    if(!drawCanvas||!previewBox)return;
    const r=previewBox.getBoundingClientRect();
    drawCanvas.width=Math.max(1,Math.floor(r.width));
    drawCanvas.height=Math.max(1,Math.floor(r.height));
  };
  sizeCanvas();
  const ctx=drawCanvas?.getContext('2d');
  if(ctx){ctx.strokeStyle='#FFE66D';ctx.lineWidth=3;ctx.lineCap='round';}
  const pointerPos=(e)=>{
    const r=drawCanvas.getBoundingClientRect();
    const t=e.touches?.[0]||e;
    return {x:t.clientX-r.left,y:t.clientY-r.top};
  };
  const startDraw=(e)=>{if(!drawOn||!ctx)return;drawing=true;const p=pointerPos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault();};
  const moveDraw=(e)=>{if(!drawing||!ctx)return;const p=pointerPos(e);ctx.lineTo(p.x,p.y);ctx.stroke();e.preventDefault();};
  const endDraw=()=>{drawing=false;};
  drawCanvas?.addEventListener('mousedown',startDraw);
  drawCanvas?.addEventListener('mousemove',moveDraw);
  drawCanvas?.addEventListener('mouseup',endDraw);
  drawCanvas?.addEventListener('mouseleave',endDraw);
  drawCanvas?.addEventListener('touchstart',startDraw,{passive:false});
  drawCanvas?.addEventListener('touchmove',moveDraw,{passive:false});
  drawCanvas?.addEventListener('touchend',endDraw);
  editor.querySelector('[data-story-draw-toggle]')?.addEventListener('click',(e)=>{
    drawOn=!drawOn;
    drawCanvas?.classList.toggle('is-drawing',drawOn);
    e.currentTarget.textContent=drawOn?'Drawing…':'Draw';
    e.currentTarget.classList.toggle('btn--primary',drawOn);
  });
  editor.querySelector('[data-story-draw-clear]')?.addEventListener('click',()=>{
    if(ctx&&drawCanvas)ctx.clearRect(0,0,drawCanvas.width,drawCanvas.height);
  });
  editor.querySelectorAll('[data-sticker]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const emoji=btn.dataset.sticker;
      const x=30+Math.random()*40;
      const y=30+Math.random()*40;
      stickersPlaced.push({emoji,x,y});
      const el=document.createElement('span');
      el.className='story-sticker-float';
      el.textContent=emoji;
      el.style.left=x+'%';
      el.style.top=y+'%';
      stickerLayer?.appendChild(el);
      btn.classList.add('is-active');
      setTimeout(()=>btn.classList.remove('is-active'),200);
    });
  });
  const applyFilter=()=>{
    if(!img)return;
    const map={none:'none',warm:'sepia(.35) saturate(1.2)',cool:'hue-rotate(20deg) saturate(1.1)',mono:'grayscale(1)',vivid:'contrast(1.2) saturate(1.35)'};
    img.style.filter=map[filter]||'none';
  };
  const cleanup=()=>{editor.remove();URL.revokeObjectURL(preview);};
  editor.querySelector('[data-story-cancel]').addEventListener('click',cleanup);
  editor.querySelector('[data-story-text]').addEventListener('input',(event)=>{
    editor.querySelector('[data-story-overlay]').textContent=event.target.value;
    editor.querySelector('[data-story-overlay]').style.color=textColor;
  });
  editor.querySelector('[data-story-text-color]')?.addEventListener('click',()=>{
    const colors=['#ffffff','#FFE66D','#E63946','#2A9D8F','#000000'];
    textColor=colors[(colors.indexOf(textColor)+1)%colors.length];
    editor.querySelector('[data-story-overlay]').style.color=textColor;
  });
  editor.querySelector('[data-story-rotate]')?.addEventListener('click',()=>{
    rotation=(rotation+90)%360;
    if(img) img.style.transform=`rotate(${rotation}deg)`;
  });
  editor.querySelectorAll('[data-filter]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      filter=btn.dataset.filter;
      editor.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('is-active',b===btn));
      applyFilter();
    });
  });
  const plus=editor.querySelector('[data-story-plus]');
  plus?.addEventListener('click',()=>{cleanup();openBaithakStoryComposer('camera');});
  if(typeof onLongPress==='function'&&plus){
    onLongPress(plus,()=>{cleanup();showBaithakShareMenu();});
  }
  editor.querySelector('[data-story-share]').addEventListener('click',async(buttonEvent)=>{
    const button=buttonEvent.currentTarget;
    button.disabled=true;button.textContent='Sharing…';
    try{
      if(typeof processAndUploadMedia!=='function') throw new Error('Media upload unavailable');
      const up=await processAndUploadMedia(file,{folder:'stories'});
      const stickerNote=stickersPlaced.map(s=>s.emoji).join('');
      const baseText=editor.querySelector('[data-story-text]').value||'';
      const audience=editor.querySelector('[data-story-audience]').value;
      const saveOnly=audience==='save_only'||audience==='highlights_only';
      let highlightId=editor.querySelector('[data-story-highlight]')?.value||'';
      if(audience==='highlights_only' && !highlightId && typeof storyCall==='function'){
        const createdHl=await storyCall('create_highlight',{title:'Favorites'});
        highlightId=createdHl?.id||createdHl?.highlight?.id||'';
      }
      const created=await createPlatformStory({
        destination:'baithak',kind:'story',
        visibility:saveOnly?'archive_only':audience,
        saveOnly,
        highlightId:audience==='highlights_only'?highlightId:undefined,
        type:'media',media:up.media,thumb:up.thumb,
        mediaType:file.type.startsWith('video')?'video':'image',
        rotation,
        text:stickerNote?`${baseText}${baseText?' ':''}${stickerNote}`.trim():baseText,
        sharedGameId:editor.querySelector('[data-story-game]').value,
        music:selectedMusic||undefined,
        location:selectedLocation||undefined,
      });
      cleanup();
      renderLiveBaithakStories();
      if(typeof haptic==='function') haptic('success');
      if(saveOnly){
        showToast(audience==='highlights_only'?'Added to Highlights (private until shared)':'Saved privately to Archive');
      }else{
        showToast(t('baithak_story_friends'));
      }
    }catch(error){
      button.disabled=false;button.textContent='Share';
      showToast(error?.message||t('baithak_story_fail'));
    }
  });
  const audSel=editor.querySelector('[data-story-audience]');
  const hlWrap=editor.querySelector('[data-story-highlight-wrap]');
  const hlSel=editor.querySelector('[data-story-highlight]');
  const refreshHl=async()=>{
    if(!hlSel||typeof storyCall!=='function') return;
    try{
      const data=await storyCall('list_highlights',{});
      const list=data.highlights||[];
      hlSel.innerHTML=list.length
        ? list.map(h=>`<option value="${h.id}">${h.title}</option>`).join('')
        : '<option value=\"\">Create on share</option>';
    }catch(e){
      hlSel.innerHTML='<option value=\"\">Create on share</option>';
    }
  };
  audSel?.addEventListener('change',()=>{
    const show=audSel.value==='highlights_only';
    hlWrap?.classList.toggle('hidden',!show);
    if(show) refreshHl();
  });
}

