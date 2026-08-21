/**
 * IndexedDB warm cache for Baithak messages — last ~50 per chat, LRU ~40 chats.
 */
(function () {
  'use strict';

  const DB_NAME = 'chaupaal_baithak_msgs_v1';
  const STORE = 'messages';
  const MAX_MSGS = 50;
  const MAX_CHATS = 40;
  let dbPromise = null;
  const memory = new Map();

  function viewerUid() {
    return typeof currentUser !== 'undefined' && currentUser?.uid ? currentUser.uid : '';
  }

  function keyFor(chatId) {
    const uid = viewerUid();
    const id = String(chatId || '');
    if (!uid || !id) return '';
    return `${uid}::${id}`;
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('no indexedDB'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb open failed'));
    });
    return dbPromise;
  }

  function normalizeMsg(m) {
    if (!m) return null;
    return {
      id: m.id || m._docId || m.clientTempId || '',
      uid: m.uid || '',
      text: m.text || '',
      ts: typeof m.ts === 'number' ? m.ts : m.ts?.toMillis?.() || m.createdAt || Date.now(),
      name: m.name || '',
      avatar: m.avatar || '',
      profileType: m.profileType || null,
      music: m.music || null,
      attachment: m.attachment || null,
      clientTempId: m.clientTempId || null,
      systemCard: !!m.systemCard,
      kind: m.kind || null,
      role: m.role || null,
      from: m.from || null,
    };
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbDelete(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbAllKeys() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function evictLru(exceptKey) {
    try {
      const uid = viewerUid();
      if (!uid) return;
      const all = (await idbAllKeys()).filter((r) => String(r.key || '').startsWith(uid + '::'));
      if (all.length <= MAX_CHATS) return;
      all.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
      const drop = all.slice(0, Math.max(0, all.length - MAX_CHATS));
      for (const r of drop) {
        if (r.key === exceptKey) continue;
        await idbDelete(r.key);
        memory.delete(r.key);
      }
    } catch (e) {}
  }

  async function get(chatId) {
    const key = keyFor(chatId);
    if (!key) return null;
    if (memory.has(key)) return memory.get(key);
    try {
      const row = await idbGet(key);
      if (!row) return null;
      const payload = { messages: row.messages || [], updatedAt: row.updatedAt || 0 };
      memory.set(key, payload);
      return payload;
    } catch (e) {
      return null;
    }
  }

  async function put(chatId, messages) {
    const key = keyFor(chatId);
    if (!key) return;
    const list = (Array.isArray(messages) ? messages : [])
      .map(normalizeMsg)
      .filter(Boolean)
      .slice(-MAX_MSGS);
    const payload = { messages: list, updatedAt: Date.now() };
    memory.set(key, payload);
    try {
      await idbPut({ key, chatId: String(chatId), viewerUid: viewerUid(), ...payload });
      await evictLru(key);
    } catch (e) {}
  }

  async function appendOptimistic(chatId, msg) {
    const cur = (await get(chatId)) || { messages: [], updatedAt: 0 };
    const next = cur.messages.slice();
    const n = normalizeMsg(msg);
    if (!n) return;
    const i = next.findIndex((m) => (n.clientTempId && m.clientTempId === n.clientTempId) || (n.id && m.id === n.id));
    if (i >= 0) next[i] = { ...next[i], ...n };
    else next.push(n);
    await put(chatId, next);
  }

  async function clearChat(chatId) {
    const key = keyFor(chatId);
    if (!key) return;
    memory.delete(key);
    try {
      await idbDelete(key);
    } catch (e) {}
  }

  async function clearAll() {
    const uid = viewerUid();
    memory.clear();
    if (!uid) return;
    try {
      const all = await idbAllKeys();
      for (const r of all) {
        if (String(r.key || '').startsWith(uid + '::')) await idbDelete(r.key);
      }
    } catch (e) {}
  }

  async function prefetchTop(chatIds) {
    const ids = (chatIds || []).slice(0, 5);
    await Promise.all(ids.map((id) => get(id)));
  }

  window.baithakMsgCache = {
    get,
    put,
    appendOptimistic,
    clearChat,
    clearAll,
    prefetchTop,
    MAX_MSGS,
  };
})();
