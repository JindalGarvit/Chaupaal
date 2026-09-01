/**
 * Chaupaal chat navigator — optimistic replies, wish-friend picker, card wiring.
 */
(function () {
  'use strict';

  const IDENTITY_REPLY =
    "I'm Chaupaal — part of the app, here to help you get around, check in, and share feedback. Not a separate human on the other end, but I'm listening.";

  function isIdentityQuestion(text) {
    const t = String(text || '').toLowerCase();
    if (!t.trim()) return false;
    return (
      /\b(are you (a |an )?(real )?(person|human|ai|bot|robot|language model|llm))\b/.test(t) ||
      /\b(am i talking to (a |an )?(real )?(person|human|ai|bot))\b/.test(t) ||
      /\b(is this (ai|a bot|a human|a real person))\b/.test(t) ||
      (/\b(who(?:'| a)?re you)\b/.test(t) && /\b(ai|bot|human|real)\b/.test(t))
    );
  }

  function detectWishType(text) {
    const t = String(text || '').toLowerCase();
    if (/birthday|bday/.test(t)) return 'birthday';
    if (/anniversary/.test(t)) return 'anniversary';
    if (/congratulat|congrats/.test(t)) return 'generic';
    if (/trip|travel|journey/.test(t)) return 'trip';
    return 'generic';
  }

  function chaupaalCardMessage(reply, attachment) {
    return {
      from: 'them',
      text: reply || '',
      time: 'now',
      avatar: '🏠',
      uid: 'chaupaal',
      name: 'Chaupaal',
      attachment: attachment || null,
      navigator: true,
    };
  }

  function appendChaupaalNavigatorReply(text) {
    if (typeof ChaupaalIntents === 'undefined') return null;
    const parsed = ChaupaalIntents.parse(text);
    const nav = ChaupaalIntents.buildNavigatorReply(parsed);
    if (typeof addMsgBubble !== 'function') return nav;
    const msg = chaupaalCardMessage(nav.reply, nav.attachment);
    const node = addMsgBubble(msg, false);
    if (node) node.dataset.chaupaalNav = '1';
    return nav;
  }

  function appendChaupaalHelpCard() {
    if (typeof ChaupaalIntents === 'undefined') return;
    const nav = ChaupaalIntents.buildNavigatorReply({
      matches: [],
      best: { id: 'help.what_can_you_do' },
      confidence: 'high',
    });
    if (typeof addMsgBubble === 'function') {
      const node = addMsgBubble(chaupaalCardMessage(nav.reply, nav.attachment), false);
      if (node) node.dataset.chaupaalNav = '1';
    }
  }

  function appendChaupaalIdentityReply() {
    if (typeof addMsgBubble !== 'function') return;
    const node = addMsgBubble(
      { from: 'them', text: IDENTITY_REPLY, time: 'now', avatar: '🏠', uid: 'chaupaal', name: 'Chaupaal' },
      false
    );
    if (node) node.dataset.chaupaalNav = '1';
  }

  function recentBaithakPeers(limit = 10) {
    const self = typeof currentUser !== 'undefined' ? currentUser?.uid : '';
    const chats =
      (typeof baithakChats !== 'undefined' && Array.isArray(baithakChats) && baithakChats) || [];
    const out = [];
    const seen = new Set();
    for (const c of chats) {
      if (!c || typeof isChaupaalChat === 'function' && isChaupaalChat(c)) continue;
      if (typeof isSelfChat === 'function' && isSelfChat(c)) continue;
      if (c.type === 'group') continue;
      const uid = c.uid || c.peerUid || c.otherUid || '';
      if (!uid || uid === self || seen.has(uid)) continue;
      seen.add(uid);
      out.push({
        uid,
        name: c.name || c.displayName || 'Friend',
        avatar: c.avatar || '👤',
        photoURL: c.photoURL || null,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  function openChaupaalWishFriendPicker(sourceText) {
    const wishType = detectWishType(sourceText);
    const peers = recentBaithakPeers(10);

    const pick = (peer) => {
      if (!peer?.uid) return;
      if (typeof openBaithakWithWish === 'function') {
        openBaithakWithWish({
          uid: peer.uid,
          name: peer.name,
          avatar: peer.avatar,
          type: wishType,
        });
      } else if (typeof openBaithakWithPrefill === 'function') {
        const prefill =
          typeof baithakWishMessage === 'function'
            ? baithakWishMessage({ type: wishType, name: peer.name, uid: peer.uid })
            : `Hey ${peer.name}!`;
        openBaithakWithPrefill({ uid: peer.uid, name: peer.name, avatar: peer.avatar, prefill, type: wishType });
      }
    };

    const renderBody = () => {
      const rows = peers
        .map(
          (p) => `
        <button type="button" class="chaupaal-wish-peer" data-uid="${String(p.uid).replace(/"/g, '&quot;')}" data-name="${String(p.name).replace(/"/g, '&quot;')}">
          <span class="chaupaal-wish-peer-avatar">${typeof renderUserAvatarHtml === 'function' ? renderUserAvatarHtml(p, { decorative: true, size: 36 }) : p.avatar}</span>
          <span>${String(p.name).replace(/</g, '&lt;')}</span>
        </button>`
        )
        .join('');
      return `
        <p style="margin:0 0 12px;color:var(--muted);font-size:13px;">Who do you want to wish?</p>
        <div class="chaupaal-wish-peer-list">${rows || '<p style="color:var(--muted);font-size:13px;">No recent chats yet.</p>'}</div>
        <button type="button" class="btn btn--ghost btn--block" data-wish-search-more style="margin-top:12px;">Search more</button>`;
    };

    const wire = (root) => {
      root?.querySelectorAll?.('.chaupaal-wish-peer')?.forEach((btn) => {
        btn.addEventListener('click', () => {
          pick({
            uid: btn.dataset.uid,
            name: btn.dataset.name,
            avatar: btn.textContent?.trim() || '👤',
          });
          if (typeof closeHalfSheet === 'function') closeHalfSheet();
        });
      });
      root?.querySelector('[data-wish-search-more]')?.addEventListener('click', () => {
        if (typeof closeHalfSheet === 'function') closeHalfSheet();
        switchTabBaithak();
        if (typeof openPeopleSearchWithContacts === 'function') {
          openPeopleSearchWithContacts({ surface: 'baithak' });
        }
      });
    };

    function switchTabBaithak() {
      document.querySelector('.tab-btn[data-tab="baithak"]')?.click();
    }

    if (typeof openHalfSheet === 'function') {
      openHalfSheet({
        title: typeof t === 'function' ? t('chaupaal_cmd_wish_title', 'Wish a friend') : 'Wish a friend',
        bodyHtml: renderBody(),
        onMount: wire,
      });
      return;
    }

    if (peers[0]) pick(peers[0]);
    else if (typeof showToast === 'function') showToast('Open Baithak and pick a friend to message.');
  }

  function aiFeaturesOnSync() {
    try {
      if (typeof isAiFeaturesEnabledSync === 'function') return !!isAiFeaturesEnabledSync();
      const screen = document.getElementById('activeChatScreen');
      if (screen?.dataset?.chaupaalNavigator === '1' || screen?.dataset?.chaupaalQuiet === '1') {
        return false;
      }
    } catch (e) {}
    return true;
  }

  function handleChaupaalNavigatorOptimistic(text) {
    if (isIdentityQuestion(text)) {
      appendChaupaalIdentityReply();
      return { identity: true };
    }
    if (typeof ChaupaalIntents === 'undefined') return null;
    const parsed = ChaupaalIntents.parse(text);
    const aiOn = aiFeaturesOnSync();
    if (aiOn && parsed.confidence === 'low') return null;
    if (!aiOn || parsed.confidence === 'high' || parsed.confidence === 'med') {
      return appendChaupaalNavigatorReply(text);
    }
    return null;
  }

  function mergeChaupaalServerReply(data, optimisticNav) {
    if (!data) return;
    const assistText = data.reply || '';
    const attachment = data.attachment || null;
    if (!assistText && !attachment) return;

    const area = document.getElementById('chatMsgsArea');
    const navRows = [...(area?.querySelectorAll('.msg-row[data-chaupaal-nav="1"]') || [])];
    const lastNav = navRows[navRows.length - 1];
    if (optimisticNav && lastNav) {
      const bubbleText = lastNav.querySelector('.msg-bubble')?.getAttribute('data-msg-text') || '';
      if (bubbleText.slice(0, 80) === String(assistText).slice(0, 80)) {
        if (attachment && !lastNav.querySelector('.action-card, .help-card')) {
          const msg = chaupaalCardMessage(assistText, attachment);
          lastNav.outerHTML = '';
          const node = addMsgBubble(msg, false);
          if (node) node.dataset.chaupaalNav = '1';
        }
        return;
      }
    }

    const already = !![...(area?.querySelectorAll('.msg-row:not(.me) .msg-bubble') || [])].find(
      (b) => (b.getAttribute('data-msg-text') || '').slice(0, 80) === String(assistText).slice(0, 80)
    );
    if (!already && typeof addMsgBubble === 'function') {
      const node = addMsgBubble(
        {
          from: 'them',
          text: assistText,
          time: 'now',
          avatar: '🏠',
          uid: 'chaupaal',
          name: 'Chaupaal',
          attachment,
        },
        false
      );
      if (node && (data.navigator || attachment)) node.dataset.chaupaalNav = '1';
    }
  }

  window.appendChaupaalNavigatorReply = appendChaupaalNavigatorReply;
  window.appendChaupaalHelpCard = appendChaupaalHelpCard;
  window.handleChaupaalNavigatorOptimistic = handleChaupaalNavigatorOptimistic;
  window.mergeChaupaalServerReply = mergeChaupaalServerReply;
  window.openChaupaalWishFriendPicker = openChaupaalWishFriendPicker;
  window.chaupaalIdentityReplyText = IDENTITY_REPLY;
})();
