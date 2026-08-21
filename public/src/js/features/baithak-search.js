/**
 * Baithak inline + overlay search, private nicknames, message search index.
 */
(function () {
  'use strict';

  const NS = (window.BaithakSearch = window.BaithakSearch || {});
  let dmNicknames = {};
  let groupNicknames = {};
  let nicknamesLoaded = false;
  let inlineQuery = '';

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
    );
  }

  function tt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function normalizeQuery(q) {
    return String(q || '')
      .trim()
      .toLowerCase();
  }

  function endPrefix(q) {
    return q + '\uf8ff';
  }

  function allBaithakChats() {
    const base = typeof baithakChats !== 'undefined' && Array.isArray(baithakChats) ? baithakChats : [];
    return typeof pinSelfChat === 'function' ? pinSelfChat(base) : base;
  }

  function peerUidOfChat(c) {
    if (!c) return null;
    return (
      c.uid ||
      c.peerUid ||
      (c.participants || []).find((u) => typeof currentUser !== 'undefined' && u && u !== currentUser?.uid) ||
      null
    );
  }

  function nicknameCacheKey() {
    const uid = typeof currentUser !== 'undefined' ? currentUser?.uid : '';
    return uid ? `chaupaal_baithak_nicknames_v1_${uid}` : '';
  }

  function readNicknameCache() {
    const key = nicknameCacheKey();
    if (!key) return { dm: {}, group: {} };
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : {};
      return {
        dm: data?.dm && typeof data.dm === 'object' ? data.dm : {},
        group: data?.group && typeof data.group === 'object' ? data.group : {},
      };
    } catch (e) {
      return { dm: {}, group: {} };
    }
  }

  function writeNicknameCache() {
    const key = nicknameCacheKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ dm: dmNicknames, group: groupNicknames, ts: Date.now() }));
    } catch (e) {}
  }

  NS.getDmNickname = function getDmNickname(peerUid) {
    if (!peerUid) return '';
    return String(dmNicknames[peerUid] || '').trim();
  };

  NS.getGroupNickname = function getGroupNickname(chatId) {
    if (!chatId) return '';
    return String(groupNicknames[chatId] || '').trim();
  };

  NS.resolveChatDisplayName = function resolveChatDisplayName(chat, realName) {
    if (!chat) return realName || '';
    if (chat.type === 'group') {
      const nick = NS.getGroupNickname(chat.firestoreId || chat.id);
      if (nick) return nick;
      return realName || chat._realName || chat.name || 'Group';
    }
    const peer = peerUidOfChat(chat);
    const nick = peer ? NS.getDmNickname(peer) : '';
    if (nick) return nick;
    const real =
      realName ||
      chat._realName ||
      (chat.name && !/^@/.test(String(chat.name).trim()) && !/^(someone|friend|chat|chaupaal member)$/i.test(String(chat.name).trim())
        ? chat.name
        : '');
    if (real && !/^@/.test(String(real).trim())) return real;
    return '';
  };

  function applyDisplayNames(chats) {
    if (!Array.isArray(chats)) return chats;
    chats.forEach((c) => {
      if (!c || (typeof isSelfChatRow === 'function' && (isSelfChatRow(c) || isChaupaalChatRow(c)))) return;
      if (!c._realName && c.name && !/^@/.test(String(c.name).trim())) {
        const nick = c.type === 'group'
          ? NS.getGroupNickname(c.firestoreId || c.id)
          : NS.getDmNickname(peerUidOfChat(c));
        if (!nick || c.name !== nick) c._realName = c.name;
      }
      const real = c._realName || c.name;
      c.displayName = NS.resolveChatDisplayName(c, real);
      c.name = c.displayName;
    });
    return chats;
  }

  async function loadBaithakNicknames() {
    const cached = readNicknameCache();
    dmNicknames = cached.dm || {};
    groupNicknames = cached.group || {};
    nicknamesLoaded = true;
    if (!db || !currentUser?.uid) return { dm: dmNicknames, group: groupNicknames };
    try {
      const uid = currentUser.uid;
      const [dmSnap, grpSnap] = await Promise.all([
        db.collection('users').doc(uid).collection('chat_nicknames').get(),
        db.collection('users').doc(uid).collection('group_nicknames').get(),
      ]);
      dmSnap.docs.forEach((d) => {
        const n = String(d.data()?.nickname || '').trim();
        if (n) dmNicknames[d.id] = n;
      });
      grpSnap.docs.forEach((d) => {
        const n = String(d.data()?.nickname || '').trim();
        if (n) groupNicknames[d.id] = n;
      });
      writeNicknameCache();
    } catch (e) {
      console.warn('[baithak-search] nicknames load', e?.message || e);
    }
    applyDisplayNames(typeof baithakChats !== 'undefined' ? baithakChats : []);
    return { dm: dmNicknames, group: groupNicknames };
  }

  async function setChatNickname({ peerUid, chatId, nickname }) {
    if (!db || !currentUser?.uid) throw new Error('Not signed in');
    const uid = currentUser.uid;
    const val = String(nickname || '').trim().slice(0, 64);
    if (chatId) {
      const ref = db.collection('users').doc(uid).collection('group_nicknames').doc(chatId);
      if (!val) {
        await ref.delete().catch(() => {});
        delete groupNicknames[chatId];
      } else {
        await ref.set({ nickname: val, updatedAt: Date.now() }, { merge: true });
        groupNicknames[chatId] = val;
      }
    } else if (peerUid) {
      const ref = db.collection('users').doc(uid).collection('chat_nicknames').doc(peerUid);
      if (!val) {
        await ref.delete().catch(() => {});
        delete dmNicknames[peerUid];
      } else {
        await ref.set({ nickname: val, updatedAt: Date.now() }, { merge: true });
        dmNicknames[peerUid] = val;
      }
    }
    writeNicknameCache();
    applyDisplayNames(typeof baithakChats !== 'undefined' ? baithakChats : []);
    if (typeof setBaithakSection === 'function') {
      setBaithakSection(typeof window.baithakSection === 'function' ? window.baithakSection() : 'sabha');
    } else if (typeof renderChatList === 'function') {
      renderChatList(allBaithakChats());
    }
  }

  function chatSearchHaystack(chat) {
    const parts = [];
    const display = NS.resolveChatDisplayName(chat, chat._realName || chat.name);
    parts.push(display, chat._realName || '', chat.name || '', chat.username || '', chat.nameLower || '');
    parts.push(String(chat.preview || chat.lastMessage || ''));
    const peer = peerUidOfChat(chat);
    if (peer && dmNicknames[peer]) parts.push(dmNicknames[peer]);
    const id = chat.firestoreId || chat.id;
    if (id && groupNicknames[id]) parts.push(groupNicknames[id]);
    if (chat.description) parts.push(chat.description);
    return parts.join(' ').toLowerCase();
  }

  function scoreChatMatch(chat, q) {
    if (!q) return 0;
    const display = NS.resolveChatDisplayName(chat, chat._realName || chat.name).toLowerCase();
    const nick =
      chat.type === 'group'
        ? (groupNicknames[chat.firestoreId || chat.id] || '').toLowerCase()
        : (dmNicknames[peerUidOfChat(chat) || ''] || '').toLowerCase();
    let score = 0;
    if (nick && nick.startsWith(q)) score += 120;
    else if (nick && nick.includes(q)) score += 90;
    if (display.startsWith(q)) score += 80;
    else if (display.includes(q)) score += 50;
    const user = String(chat.username || chat.nameLower || '').toLowerCase();
    if (user.startsWith(q)) score += 40;
    else if (user.includes(q)) score += 20;
    const preview = String(chat.preview || '').toLowerCase();
    if (preview.includes(q)) score += 15;
    return score;
  }

  NS.filterChatsForSearch = function filterChatsForSearch(q, { messageHits } = {}) {
    const query = normalizeQuery(q);
    const base = allBaithakChats().filter((c) => !isSelfChatRow(c) && !isChaupaalChatRow(c));
    if (!query) return typeof pinSelfChat === 'function' ? pinSelfChat(base) : base;
    const hitsByChat = new Map();
    (messageHits || []).forEach((h) => {
      if (!h?.chatId) return;
      if (!hitsByChat.has(h.chatId)) hitsByChat.set(h.chatId, h);
    });
    const scored = base
      .map((c) => {
        const id = c.firestoreId || c.id;
        let score = scoreChatMatch(c, query);
        const hit = hitsByChat.get(id);
        if (hit) score += 35;
        return { chat: c, score, snippet: hit?.snippet || '' };
      })
      .filter((row) => row.score > 0 || hitsByChat.has(row.chat.firestoreId || row.chat.id));
    scored.sort((a, b) => b.score - a.score || chatRecencyMs(b.chat) - chatRecencyMs(a.chat));
    const rest = scored.map((r) => {
      if (r.snippet) r.chat._searchSnippet = r.snippet;
      return r.chat;
    });
    return typeof pinSelfChat === 'function' ? pinSelfChat(rest) : rest;
  };

  async function searchMessageIndex(query, limit = 40) {
    const q = normalizeQuery(query);
    if (!q || q.length < 2 || !db || !currentUser?.uid) return [];
    try {
      const snap = await db
        .collection('users')
        .doc(currentUser.uid)
        .collection('chat_search_index')
        .orderBy('textLower')
        .startAt(q)
        .endAt(endPrefix(q))
        .limit(limit)
        .get();
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    } catch (e) {
      console.warn('[baithak-search] message index query failed', e?.message || e);
      return [];
    }
  }

  NS.indexChatMessageForSearch = async function indexChatMessageForSearch({ chatId, messageId, text, ts }) {
    if (!db || !currentUser?.uid || !chatId || !messageId) return;
    const body = String(text || '').trim();
    if (!body || body.length < 2) return;
    const textLower = body.toLowerCase().slice(0, 500);
    const docId = `${String(chatId).slice(0, 80)}_${String(messageId).slice(0, 80)}`;
    try {
      await db
        .collection('users')
        .doc(currentUser.uid)
        .collection('chat_search_index')
        .doc(docId)
        .set(
          {
            chatId: String(chatId),
            messageId: String(messageId),
            textLower,
            snippet: body.slice(0, 140),
            ts: Number(ts) || Date.now(),
          },
          { merge: true }
        );
    } catch (e) {
      console.warn('[baithak-search] index write failed', e?.message || e);
    }
  };

  let inlineTimer = null;

  function syncBaithakSearchClearBtn() {
    const input = document.getElementById('baithakSearch');
    const clearBtn = document.getElementById('baithakSearchClearBtn');
    if (!clearBtn) return;
    const has = !!(input?.value || '').trim();
    clearBtn.hidden = !has;
  }

  function clearBaithakSearch(opts) {
    const o = opts || {};
    const input = document.getElementById('baithakSearch');
    if (input) input.value = '';
    inlineQuery = '';
    syncBaithakSearchClearBtn();
    document.getElementById('baithakSearchEverywhere')?.remove();
    if (o.restoreList !== false) {
      if (typeof setBaithakSection === 'function') {
        setBaithakSection(typeof window.baithakSection === 'function' ? window.baithakSection() : 'sabha');
      } else if (typeof renderChatList === 'function') {
        renderChatList(allBaithakChats());
      }
    }
  }

  async function runInlineSearch(rawQ) {
    inlineQuery = String(rawQ || '');
    syncBaithakSearchClearBtn();
    const q = normalizeQuery(inlineQuery);
    if (!q) {
      if (typeof setBaithakSection === 'function') {
        setBaithakSection(typeof window.baithakSection === 'function' ? window.baithakSection() : 'sabha');
      } else if (typeof renderChatList === 'function') {
        renderChatList(allBaithakChats());
      }
      document.getElementById('baithakSearchEverywhere')?.remove();
      return;
    }
    if (q.startsWith('@') && q.length > 1) {
      if (typeof openBaithakSearchOverlay === 'function') {
        openBaithakSearchOverlay({ initialQuery: q.slice(1), tab: 'people' });
      } else if (typeof openUniversalSearch === 'function') {
        openUniversalSearch({ initialQuery: q.slice(1), types: ['users'] });
      }
      const input = document.getElementById('baithakSearch');
      if (input) input.value = '';
      inlineQuery = '';
      return;
    }
    const messageHits = q.length >= 2 ? await searchMessageIndex(q, 30) : [];
    const filtered = NS.filterChatsForSearch(q, { messageHits });
    if (typeof renderChatList === 'function') {
      renderChatList(filtered, { searchQuery: q, messageHits });
    }
    const list = document.getElementById('chatList');
    let row = document.getElementById('baithakSearchEverywhere');
    if (!row && list) {
      row = document.createElement('button');
      row.type = 'button';
      row.id = 'baithakSearchEverywhere';
      row.className = 'baithak-search-everywhere';
      list.appendChild(row);
    }
    if (row) {
      row.textContent = tt('baithak_search_everywhere', `Search everywhere for “${inlineQuery.trim()}”`);
      row.onclick = () => openBaithakSearchOverlay({ initialQuery: inlineQuery.trim(), tab: 'all' });
      row.hidden = !inlineQuery.trim();
    }
  }

  function debouncedInlineSearch(rawQ) {
    clearTimeout(inlineTimer);
    inlineTimer = setTimeout(() => {
      runInlineSearch(rawQ).catch(() => {});
    }, 180);
  }

  async function searchGroupsDiscoverable(query, limit = 20) {
    const q = normalizeQuery(query);
    if (!q || !db) return [];
    const out = [];
    const seen = new Set();
    const myUid = currentUser?.uid;

    function pushGroup(raw, boost) {
      const id = raw.firestoreId || raw.id;
      if (!id || seen.has(id)) return;
      const isMember = myUid && Array.isArray(raw.participants) && raw.participants.includes(myUid);
      const vis =
        typeof groupVisibility === 'function'
          ? groupVisibility(raw)
          : raw.visibility === 'private' || raw.visibility === 'discoverable' || raw.visibility === 'public'
            ? raw.visibility
            : raw.isPublic === true
              ? 'public'
              : raw.discoverableInSearch === true
                ? 'discoverable'
                : raw.isPublic === false
                  ? 'private'
                  : 'public';
      const searchable = vis === 'public' || vis === 'discoverable';
      if (!isMember && !searchable) return;
      const hay = `${raw.name || ''} ${raw.description || ''} ${raw.nameLower || ''}`.toLowerCase();
      if (!hay.includes(q)) return;
      seen.add(id);
      const label =
        vis === 'public' ? 'Public' : vis === 'discoverable' ? 'Discoverable' : 'Private';
      out.push({
        type: 'group',
        id,
        chatId: id,
        name: raw.name || 'Group',
        subtitle: `${(raw.participants || []).length} members · ${label}`,
        isPublic: vis === 'public',
        isMember: !!isMember,
        discoverableInSearch: searchable,
        visibility: vis,
        score: boost + (raw.name || '').toLowerCase().startsWith(q) ? 50 : 20,
        chat: raw,
      });
    }

    try {
      const pubSnap = await db
        .collection('chats')
        .where('type', '==', 'group')
        .where('isPublic', '==', true)
        .orderBy('nameLower')
        .startAt(q)
        .endAt(endPrefix(q))
        .limit(limit)
        .get();
      pubSnap.docs.forEach((d) => pushGroup({ id: d.id, firestoreId: d.id, ...d.data() }, 30));
    } catch (e) {}

    try {
      const privSnap = await db
        .collection('chats')
        .where('type', '==', 'group')
        .where('discoverableInSearch', '==', true)
        .orderBy('nameLower')
        .startAt(q)
        .endAt(endPrefix(q))
        .limit(limit)
        .get();
      privSnap.docs.forEach((d) => pushGroup({ id: d.id, firestoreId: d.id, ...d.data() }, 25));
    } catch (e) {}

    allBaithakChats()
      .filter((c) => c.type === 'group')
      .forEach((c) => pushGroup(c, 10));

    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  function openGroupFromSearch(row) {
    const chat = row.chat || row;
    const id = chat.firestoreId || chat.id || row.chatId;
    const myUid = currentUser?.uid;
    const isMember = myUid && Array.isArray(chat.participants) && chat.participants.includes(myUid);
    if (isMember) {
      if (typeof openChatScreen === 'function') openChatScreen(typeof mapChatDoc === 'function' ? mapChatDoc({ id, ...chat }) : chat);
      return;
    }
    if (typeof openGroupSearchPreview === 'function') {
      openGroupSearchPreview(typeof normalizeGroupChat === 'function' ? normalizeGroupChat(chat) : chat);
      return;
    }
    if (typeof openGroupInfoSheet === 'function') openGroupInfoSheet(chat);
  }

  function renderOverlayResults(container, rows, { tab, query }) {
    if (!container) return;
    if (!rows.length) {
      container.innerHTML = `<div class="baithak-search-empty">${esc(tt('baithak_search_none', 'No results'))}</div>`;
      return;
    }
    container.innerHTML = rows
      .map((row) => {
        if (row.type === 'person' || row.category === 'users') {
          const uid = row.uid || row.id;
          const name =
            typeof resolvePersonDisplayName === 'function'
              ? resolvePersonDisplayName(row)
              : row.title || row.name || (row.username ? `@${row.username}` : 'Someone');
          const sub = row.subtitle || row.username || '';
          return `<button type="button" class="baithak-search-hit" data-person="${esc(uid)}">
            <span class="baithak-search-hit-title">${esc(name)}</span>
            <span class="baithak-search-hit-sub">${esc(sub)}</span>
          </button>`;
        }
        if (row.type === 'group' || row.category === 'groups') {
          const id = row.chatId || row.id;
          return `<button type="button" class="baithak-search-hit" data-group="${esc(id)}">
            <span class="baithak-search-hit-title">${esc(row.name || row.title || 'Group')}</span>
            <span class="baithak-search-hit-sub">${esc(row.subtitle || '')}</span>
          </button>`;
        }
        const chat = row.chat || row;
        const title = NS.resolveChatDisplayName(chat, chat._realName || chat.name);
        const sub = row.snippet || chat.preview || chat._searchSnippet || '';
        return `<button type="button" class="baithak-search-hit" data-chat="${esc(chat.firestoreId || chat.id)}">
          <span class="baithak-search-hit-title">${esc(title)}</span>
          <span class="baithak-search-hit-sub">${esc(sub)}</span>
        </button>`;
      })
      .join('');

    container.querySelectorAll('[data-person]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uid = btn.getAttribute('data-person');
        if (!uid) return;
        const row = rows.find((r) => (r.uid || r.id) === uid) || { uid };
        if (typeof openPublicProfile === 'function') {
          openPublicProfile(row, { uid, context: 'baithak_search' });
        } else if (typeof openProfileByUid === 'function') {
          openProfileByUid(uid);
        }
        overlayClose?.();
      });
    });
    container.querySelectorAll('[data-group]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-group');
        const row = rows.find((r) => (r.chatId || r.id) === id);
        if (row) openGroupFromSearch(row);
        overlayClose?.();
      });
    });
    container.querySelectorAll('[data-chat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-chat');
        const chat = allBaithakChats().find((c) => (c.firestoreId || c.id) === id);
        if (chat && typeof openChatScreen === 'function') openChatScreen(chat);
        overlayClose?.();
      });
    });
  }

  let overlayClose = null;

  function openBaithakSearchOverlay({ initialQuery = '', tab = 'all' } = {}) {
    document.getElementById('baithakSearchOverlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'baithakSearchOverlay';
    overlay.className = 'baithak-search-overlay';
    overlay.dataset.navManaged = '1';
    overlay.innerHTML = `
      <div class="baithak-search-overlay-head">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-bs-back' }) : '<button type="button" data-bs-back aria-label="Back" class="cp-back-btn">←</button>'}
        <input type="search" id="baithakSearchOverlayInput" placeholder="${esc(tt('baithak_search_ph', 'Search chats, people, groups…'))}" value="${esc(initialQuery)}" autocomplete="off">
      </div>
      <div class="baithak-search-tabs" role="tablist">
        <button type="button" data-tab="all" class="active">${esc(tt('baithak_tab_all', 'All'))}</button>
        <button type="button" data-tab="chats">${esc(tt('baithak_tab_chats', 'Chats'))}</button>
        <button type="button" data-tab="people">${esc(tt('baithak_tab_people', 'People'))}</button>
        <button type="button" data-tab="groups">${esc(tt('baithak_tab_groups', 'Groups'))}</button>
      </div>
      <div class="baithak-search-results" id="baithakSearchResults"></div>`;
    (document.querySelector('.device') || document.body).appendChild(overlay);

    let activeTab = tab;
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(overlay);
      overlay.remove();
      overlayClose = null;
    };
    overlayClose = close;
    if (typeof pushNavLayer === 'function') pushNavLayer(overlay, close);
    overlay.querySelector('[data-bs-back]')?.addEventListener('click', close);

    const input = overlay.querySelector('#baithakSearchOverlayInput');
    const results = overlay.querySelector('#baithakSearchResults');
    overlay.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab') || 'all';
        overlay.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
        runOverlaySearch();
      });
    });

    let timer = null;
    async function runOverlaySearch() {
      const q = normalizeQuery(input?.value || '');
      if (!q) {
        results.innerHTML = `<div class="baithak-search-empty">${esc(tt('baithak_search_start', 'Type to search your chats'))}</div>`;
        return;
      }
      results.innerHTML = `<div class="baithak-search-empty">${esc(tt('loading', 'Searching…'))}</div>`;
      const messageHits = q.length >= 2 ? await searchMessageIndex(q, 40) : [];
      const chatRows = NS.filterChatsForSearch(q, { messageHits }).filter((c) => !isSelfChatRow(c) && !isChaupaalChatRow(c));
      const chatResults = chatRows.map((c) => ({ chat: c, snippet: c._searchSnippet || '' }));

      let people = [];
      if (typeof searchUsersProvider === 'function') {
        people = (await searchUsersProvider(q, { limit: 20 })).map((u) => ({ ...u, type: 'person' }));
      } else if (typeof openPeopleSearchWithContacts === 'function') {
        /* fallback: people tab still works via provider when available */
      }

      let groups = await searchGroupsDiscoverable(q, 20);

      let rows = [];
      if (activeTab === 'chats') rows = chatResults;
      else if (activeTab === 'people') rows = people;
      else if (activeTab === 'groups') rows = groups;
      else rows = [...chatResults, ...people, ...groups];

      renderOverlayResults(results, rows, { tab: activeTab, query: q });
    }

    input?.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(runOverlaySearch, 200);
    });
    input?.focus();
    if (initialQuery) runOverlaySearch();
    else results.innerHTML = `<div class="baithak-search-empty">${esc(tt('baithak_search_start', 'Type to search your chats'))}</div>`;
  }

  function openNicknameSheet({ chat, peerUid, title }) {
    const isGroup = chat?.type === 'group';
    const targetUid = peerUid || peerUidOfChat(chat);
    const chatId = chat?.firestoreId || chat?.id;
    const current = isGroup
      ? NS.getGroupNickname(chatId)
      : targetUid
        ? NS.getDmNickname(targetUid)
        : '';
    const sheet = document.createElement('div');
    sheet.className = 'baithak-nickname-sheet';
    sheet.innerHTML = `
      <div class="baithak-nickname-card">
        <div class="baithak-nickname-head">${esc(title || tt('baithak_set_nickname', 'Set nickname'))}</div>
        <input type="text" maxlength="64" value="${esc(current)}" placeholder="${esc(tt('baithak_nickname_ph', 'Private nickname (only you see this)'))}">
        <div class="baithak-nickname-actions">
          <button type="button" data-clear>${esc(tt('clear', 'Clear'))}</button>
          <button type="button" data-cancel>${esc(tt('cancel', 'Cancel'))}</button>
          <button type="button" data-save class="primary">${esc(tt('save', 'Save'))}</button>
        </div>
      </div>`;
    (document.querySelector('.device') || document.body).appendChild(sheet);
    const input = sheet.querySelector('input');
    const close = () => sheet.remove();
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) close();
    });
    sheet.querySelector('[data-cancel]')?.addEventListener('click', close);
    sheet.querySelector('[data-clear]')?.addEventListener('click', async () => {
      try {
        await setChatNickname(isGroup ? { chatId, nickname: '' } : { peerUid: targetUid, nickname: '' });
        close();
      } catch (e) {
        if (typeof showToast === 'function') showToast('Could not clear nickname');
      }
    });
    sheet.querySelector('[data-save]')?.addEventListener('click', async () => {
      try {
        const val = input?.value || '';
        await setChatNickname(isGroup ? { chatId, nickname: val } : { peerUid: targetUid, nickname: val });
        close();
      } catch (e) {
        if (typeof showToast === 'function') showToast('Could not save nickname');
      }
    });
    input?.focus();
  }

  function wireBaithakSearchChrome() {
    const panel = document.getElementById('panel-baithak');
    if (!panel || panel.dataset.baithakSearchWired === '1') return;
    panel.dataset.baithakSearchWired = '1';

    const iconBtn = document.getElementById('baithakSearchIconBtn');
    if (iconBtn && !iconBtn.dataset.baithakSearchWiredIcon) {
      iconBtn.dataset.baithakSearchWiredIcon = '1';
      if (typeof iconHtml === 'function') iconBtn.innerHTML = iconHtml('search', { size: 16 });
      iconBtn.addEventListener('click', () => {
        const q = document.getElementById('baithakSearch')?.value?.trim() || '';
        openBaithakSearchOverlay({ initialQuery: q, tab: 'all' });
      });
    }

    const clearBtn = document.getElementById('baithakSearchClearBtn');
    clearBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearBaithakSearch();
      document.getElementById('baithakSearch')?.focus();
    });

    const input = document.getElementById('baithakSearch');
    if (input && !input.dataset.baithakInlineWired) {
      input.dataset.baithakInlineWired = '1';
      input.addEventListener('input', (e) => {
        syncBaithakSearchClearBtn();
        debouncedInlineSearch(e.target.value);
      });
      const openOverlayFromInput = () => {
        const q = input.value?.trim() || '';
        openBaithakSearchOverlay({ initialQuery: q, tab: 'all' });
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          openOverlayFromInput();
        }
      });
      input.addEventListener('search', () => {
        openOverlayFromInput();
      });
      syncBaithakSearchClearBtn();
    }
  }

  NS.loadNicknames = loadBaithakNicknames;
  NS.applyDisplayNames = applyDisplayNames;
  NS.openNicknameSheet = openNicknameSheet;
  NS.openOverlay = openBaithakSearchOverlay;
  NS.searchMessageIndex = searchMessageIndex;
  NS.wireChrome = wireBaithakSearchChrome;
  NS.clearSearch = clearBaithakSearch;

  window.openBaithakSearchOverlay = openBaithakSearchOverlay;
  window.openBaithakNicknameSheet = openNicknameSheet;
  window.loadBaithakNicknames = loadBaithakNicknames;
  window.clearBaithakSearch = clearBaithakSearch;
  window.indexChatMessageForSearch = NS.indexChatMessageForSearch;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      normalizeQuery,
      resolveChatDisplayName: NS.resolveChatDisplayName,
      filterChatsForSearch: NS.filterChatsForSearch,
      getDmNickname: NS.getDmNickname,
      getGroupNickname: NS.getGroupNickname,
      scoreChatMatch,
      chatSearchHaystack,
    };
  }
})();
