/**
 * Chaupaal global search indexer (server).
 *
 * Architecture:
 *  - Client opens Peepal morph #5 → openUniversalSearch (omnibox).
 *  - Prefer POST /api/media-config { action: 'search_query' } which fans out
 *    across collections via searchChaupaal() below.
 *  - Client search.js remains a local multi-provider fallback (Firestore from
 *    the browser) when the API is unavailable.
 *  - Khoj (Peepal mode) is INTENT people discovery only — never this indexer.
 *
 * Extension points:
 *  - Register more collectors in COLLECTORS.
 *  - Future: Algolia / Typesense / web crawl behind the same search_query action.
 *  - Day-one: no full web crawl; Chaupaal content only (profiles, posts, games).
 */
'use strict';

const COLLECTORS = {
  users: collectUsers,
  duniya: collectDuniya,
  peepal: collectPeepal,
  groups: collectGroups,
  games: collectGames,
};

const { normalizeUsername } = require('./username');

function normalize(q) {
  return normalizeUsername(q);
}

async function collectUsers(db, q, limit) {
  const out = [];
  const seen = new Set();
  try {
    const exact = await db.collection('usernames').doc(q).get();
    if (exact.exists) {
      const uid = exact.data()?.uid;
      if (uid) {
        const pub = await db.collection('users_public').doc(uid).get();
        const u = pub.exists ? pub.data() || {} : {};
        if (!u.hiddenFromDiscovery) {
          seen.add(uid);
          out.push({
            type: 'user',
            category: 'users',
            id: uid,
            uid,
            name: u.name || '',
            username: u.username || q,
            photoURL: u.photoURL || null,
            subtitle: u.city || '',
            score: 500,
          });
        }
      }
    }
  } catch (e) {}
  try {
    const snap = await db
      .collection('users_public')
      .orderBy('usernameLower')
      .startAt(q)
      .endAt(q + '\uf8ff')
      .limit(limit)
      .get();
    snap.docs.forEach((doc) => {
      if (seen.has(doc.id) || out.length >= limit) return;
      const u = doc.data() || {};
      if (u.hiddenFromDiscovery) return;
      seen.add(doc.id);
      out.push({
        type: 'user',
        category: 'users',
        id: doc.id,
        uid: doc.id,
        name: u.name || '',
        username: u.username || '',
        photoURL: u.photoURL || null,
        subtitle: u.city || '',
        score: 200,
      });
    });
  } catch (e) {}
  return out;
}

async function collectDuniya(db, q, limit) {
  const out = [];
  try {
    const snap = await db.collection('duniya').orderBy('createdAt', 'desc').limit(80).get();
    snap.docs.forEach((doc) => {
      if (out.length >= limit) return;
      const p = doc.data() || {};
      if (p.deleted || p.softDeleted) return;
      const hay = `${p.text || ''} ${p.caption || ''} ${p.authorName || ''}`.toLowerCase();
      if (!hay.includes(q)) return;
      out.push({
        type: 'post',
        category: 'duniya',
        id: doc.id,
        title: String(p.text || p.caption || 'Duniya').slice(0, 120), // i18n-ignore (brand fallback)
        subtitle: p.authorName || 'Duniya', // i18n-ignore (brand)
        photoURL: p.mediaUrl || p.thumb || null,
        score: 40,
      });
    });
  } catch (e) {}
  return out;
}

async function collectPeepal(db, q, limit) {
  const out = [];
  try {
    const snap = await db.collection('peepalPosts').orderBy('createdAt', 'desc').limit(80).get();
    snap.docs.forEach((doc) => {
      if (out.length >= limit) return;
      const p = doc.data() || {};
      if (p.deleted || p.softDeleted) return;
      const hay = `${p.question || ''} ${p.text || ''} ${p.title || ''}`.toLowerCase();
      if (!hay.includes(q)) return;
      out.push({
        type: 'post',
        category: 'peepal',
        id: doc.id,
        title: String(p.question || p.text || p.title || 'Peepal').slice(0, 120), // i18n-ignore (brand)
        subtitle: 'Peepal', // i18n-ignore (brand)
        score: 35,
      });
    });
  } catch (e) {}
  return out;
}

async function collectGroups(db, q, limit) {
  const out = [];
  try {
    const snap = await db.collection('chats').where('type', '==', 'group').where('visibility', '==', 'public').limit(60).get();
    snap.docs.forEach((doc) => {
      if (out.length >= limit) return;
      const g = doc.data() || {};
      const hay = `${g.name || ''} ${g.title || ''} ${g.description || ''}`.toLowerCase();
      if (!hay.includes(q)) return;
      out.push({
        type: 'group',
        category: 'groups',
        id: doc.id,
        title: g.name || g.title || '',
        titleKey: g.name || g.title ? null : 'common.group',
        subtitle: g.description || '',
        subtitleKey: g.description ? null : 'common.search_public_group',
        avatar: g.avatar || '👥',
        score: 60,
      });
    });
  } catch (e) {
    // Fallback: name prefix without visibility index
    try {
      const snap = await db.collection('chats').where('type', '==', 'group').limit(40).get();
      snap.docs.forEach((doc) => {
        if (out.length >= limit) return;
        const g = doc.data() || {};
        if (g.visibility && g.visibility !== 'public') return;
        const hay = `${g.name || ''} ${g.title || ''}`.toLowerCase();
        if (!hay.includes(q)) return;
        out.push({
          type: 'group',
          category: 'groups',
          id: doc.id,
          title: g.name || g.title || '',
          titleKey: g.name || g.title ? null : 'common.group',
          subtitle: '',
          subtitleKey: 'common.group',
          avatar: g.avatar || '👥',
          score: 50,
        });
      });
    } catch (err) {}
  }
  return out;
}

async function collectGames(_db, q, limit) {
  // Static registry projection — games live client-side; server returns name matches for omnibox
  const CATALOG = [
    // English names / words are search keys only; the client shows subtitleKey in the reader's language.
    { id: 'quiz', name: 'Muqabala', subtitle: 'quiz duel', subtitleKey: 'common.search_game_quiz' }, // i18n-ignore (search keywords)
    { id: 'chess', name: 'Chess', subtitle: 'board game', subtitleKey: 'common.search_game_board' }, // i18n-ignore (search keywords)
    { id: 'ludo', name: 'Ludo', subtitle: 'board game', subtitleKey: 'common.search_game_board' }, // i18n-ignore (search keywords)
    { id: 'scribble', name: 'Scribble', subtitle: 'draw guess', subtitleKey: 'common.search_game_scribble' }, // i18n-ignore (search keywords)
    { id: 'ankjod', name: 'Kakuro', subtitle: 'number puzzle cross sums', subtitleKey: 'common.search_game_kakuro', keywords: 'ank jod' }, // i18n-ignore (search keywords)
  ];
  return CATALOG.filter((g) => `${g.name} ${g.subtitle} ${g.keywords || ''}`.toLowerCase().includes(q))
    .slice(0, limit)
    .map((g) => ({
      type: 'game',
      category: 'games',
      id: g.id,
      title: g.name,
      subtitle: g.subtitle,
      subtitleKey: g.subtitleKey,
      score: 70,
    }));
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ query: string, types?: string[], limit?: number }} opts
 */
async function searchChaupaal(db, opts = {}) {
  const q = normalize(opts.query);
  if (!q || q.length < 1) {
    return { query: '', categories: {}, degraded: false };
  }
  const types = Array.isArray(opts.types) && opts.types.length ? opts.types : Object.keys(COLLECTORS);
  const limit = Math.min(20, Math.max(3, Number(opts.limit) || 8));
  const categories = {};
  await Promise.all(
    types.map(async (type) => {
      const fn = COLLECTORS[type];
      if (!fn) {
        categories[type] = [];
        return;
      }
      try {
        categories[type] = await fn(db, q, limit);
      } catch (e) {
        categories[type] = [];
      }
    })
  );
  return { query: q, categories, degraded: false };
}

module.exports = { searchChaupaal, COLLECTORS, normalize };
