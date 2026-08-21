/**
 * Warm cache for Peepal/Duniya comment threads.
 */
(function () {
  'use strict';

  const DB_NAME = 'chaupaal_comment_msgs_v1';
  const STORE = 'threads';
  const MAX_COMMENTS = 40;
  const MAX_THREADS = 60;
  let dbPromise = null;
  const memory = new Map();

  function keyFor(collection, postId) {
    const col = String(collection || '');
    const id = String(postId || '');
    if (!col || !id) return '';
    return `${col}::${id}`;
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
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb open failed'));
    });
    return dbPromise;
  }

  function slim(c) {
    if (!c) return null;
    return {
      id: c.id,
      parentId: c.parentId || null,
      uid: c.uid || c.user?.uid || '',
      user: c.user
        ? {
            uid: c.user.uid || c.uid || '',
            name: c.user.name || '',
            avatar: c.user.avatar || '',
            photoURL: c.user.photoURL || '',
            username: c.user.username || '',
            profileType: c.user.profileType || 'personal',
          }
        : { uid: c.uid || '', name: 'User', avatar: '👤' },
      text: c.text || '',
      createdAt: Number(c.createdAt) || Date.now(),
      editedAt: c.editedAt || null,
      deleted: !!c.deleted,
      likeCount: Number(c.likeCount) || 0,
      replyCount: Number(c.replyCount) || 0,
      time: c.time || '',
      clientTempId: c.clientTempId || null,
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

  async function idbAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function evict() {
    try {
      const all = await idbAll();
      if (all.length <= MAX_THREADS) return;
      all.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
      for (const r of all.slice(0, all.length - MAX_THREADS)) {
        await idbDelete(r.key);
        memory.delete(r.key);
      }
    } catch (e) {}
  }

  async function get(collection, postId) {
    const key = keyFor(collection, postId);
    if (!key) return null;
    if (memory.has(key)) return memory.get(key);
    try {
      const row = await idbGet(key);
      if (!row) return null;
      const payload = { comments: row.comments || [], updatedAt: row.updatedAt || 0 };
      memory.set(key, payload);
      return payload;
    } catch (e) {
      return null;
    }
  }

  async function put(collection, postId, comments) {
    const key = keyFor(collection, postId);
    if (!key) return;
    const list = (Array.isArray(comments) ? comments : []).map(slim).filter(Boolean).slice(-MAX_COMMENTS);
    const payload = { comments: list, updatedAt: Date.now() };
    memory.set(key, payload);
    try {
      await idbPut({ key, collection: String(collection), postId: String(postId), ...payload });
      await evict();
    } catch (e) {}
  }

  async function clearAll() {
    memory.clear();
    try {
      const all = await idbAll();
      for (const r of all) await idbDelete(r.key);
    } catch (e) {}
  }

  window.commentMsgCache = { get, put, clearAll, MAX_COMMENTS };
})();
