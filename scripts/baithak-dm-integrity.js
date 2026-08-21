/**
 * Console / node-friendly assert: after Baithak load, no two DMs share the same peerUid.
 * Usage in browser: assertBaithakDmIntegrity(baithakChats)
 * Usage in node tests: node scripts/baithak-dm-integrity.js
 */
(function (root) {
  'use strict';

  function peerOf(c, me) {
    if (!c || c.type === 'group') return '';
    if (c.type === 'self' || String(c.id || '').startsWith('chat_self')) return '';
    if (c.isChaupaal || String(c.id || '').startsWith('chat_chaupaal')) return '';
    return String(c.uid || c.peerUid || c.otherUid || (c.participants || []).find((u) => u && u !== me) || '').trim();
  }

  function isStub(id) {
    const s = String(id || '');
    if (/^chat_(dl|disc|profile)_/.test(s)) return true;
    if (/^chat_(self|riya|arjun|chaupaal)/.test(s)) return false;
    return /^chat_[A-Za-z0-9]{10,}$/.test(s);
  }

  function assertBaithakDmIntegrity(chats, opts) {
    const o = opts || {};
    const me = o.viewerUid || '';
    const list = Array.isArray(chats) ? chats : [];
    const byPeer = new Map();
    const stubs = [];
    const dups = [];
    list.forEach((c) => {
      const id = c.firestoreId || c.id;
      if (isStub(id)) stubs.push(id);
      const peer = peerOf(c, me);
      if (!peer) return;
      if (!byPeer.has(peer)) byPeer.set(peer, []);
      byPeer.get(peer).push(id);
    });
    byPeer.forEach((ids, peer) => {
      const uniq = [...new Set(ids)];
      if (uniq.length > 1) dups.push({ peer, ids: uniq });
    });
    const ok = stubs.length === 0 && dups.length === 0;
    const report = { ok, stubCount: stubs.length, stubs, duplicatePeers: dups };
    if (!ok && o.throwOnFail) {
      throw new Error('Baithak DM integrity failed: ' + JSON.stringify(report));
    }
    return report;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { assertBaithakDmIntegrity, isStub, peerOf };
  }
  if (root) {
    root.assertBaithakDmIntegrity = assertBaithakDmIntegrity;
  }

  // Node CLI smoke when run directly with sample fixture
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    const sample = [
      { id: 'a_b', type: 'dm', uid: 'b', participants: ['a', 'b'] },
      { id: 'chat_dl_b', type: 'dm', uid: 'b' },
    ];
    const r = assertBaithakDmIntegrity(sample, { viewerUid: 'a' });
    if (r.ok) {
      console.error('expected failure on fixture');
      process.exit(1);
    }
    const clean = assertBaithakDmIntegrity(
      [{ id: 'a_b', type: 'dm', uid: 'b', participants: ['a', 'b'] }],
      { viewerUid: 'a' }
    );
    if (!clean.ok) {
      console.error(clean);
      process.exit(1);
    }
    console.log('baithak-dm-integrity: ok');
  }
})(typeof window !== 'undefined' ? window : globalThis);
