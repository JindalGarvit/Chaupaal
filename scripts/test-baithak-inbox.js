/**
 * Baithak inbox merge: chats without updatedAt still map in.
 * Never admit SAMPLE_CHATS (Riya / grp_tech) into a live union.
 */
global.window = global;
global.currentUser = { uid: 'u1' };

const {
  mapChatDoc,
  mergeBaithakInbox,
  chatRecencyMs,
  isLiveSampleChat,
} = require('../public/src/js/features/baithak-data.js');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

{
  const raw = {
    id: 'old_grp',
    type: 'group',
    name: 'Old Group',
    participants: ['u1', 'u2'],
    createdAt: 1000,
    lastMessageAt: 2500,
    preview: 'hi',
  };
  const mapped = mapChatDoc(raw);
  assert(mapped.id === 'old_grp', 'maps group without updatedAt');
  assert(mapped.missingUpdatedAt === true, 'flags missing updatedAt');
  assert(mapped.ts === 2500, 'recency falls back to lastMessageAt');
  const merged = mergeBaithakInbox([], [mapped]);
  assert(
    merged.some((c) => c.id === 'old_grp'),
    'membership chat with no updatedAt still lands in inbox'
  );
}

{
  const ordered = [{ id: 'new_dm', firestoreId: 'new_dm', type: 'dm', updatedAt: 9000, ts: 9000 }];
  const fallback = [
    { id: 'old_grp', firestoreId: 'old_grp', type: 'group', createdAt: 1000, ts: 1000, missingUpdatedAt: true },
  ];
  const merged = mergeBaithakInbox(ordered, fallback);
  assert(merged.length === 2, 'union recency page + membership fallback');
  assert(merged[0].id === 'new_dm', 'sorts by recency desc');
}

{
  const prev = [
    { id: 'shown', firestoreId: 'shown', type: 'group', ts: 1 },
    { id: 'grp_tech', firestoreId: 'grp_tech', type: 'group', isSample: true, ts: 2 },
  ];
  const page = [{ id: 'fresh', firestoreId: 'fresh', type: 'dm', ts: 3, updatedAt: 3 }];
  const merged = mergeBaithakInbox(prev, page);
  assert(merged.some((c) => c.id === 'shown'), 'reset does not drop already-shown live ids');
  assert(!merged.some((c) => c.id === 'grp_tech'), 'does not resurrect SAMPLE_CHATS');
  assert(merged.some((c) => c.id === 'fresh'), 'adds recency page rows');
}

{
  assert(isLiveSampleChat({ id: 'chat_riya', isSample: true }), 'Riya is sample');
  assert(chatRecencyMs({ createdAt: 5 }) === 5, 'recency uses createdAt');
}

{
  const emptyOrdered = [];
  const fallback = [{ id: 'legacy_dm', firestoreId: 'legacy_dm', type: 'dm', createdAt: 40 }];
  const merged = mergeBaithakInbox(emptyOrdered, fallback);
  assert(merged.length === 1, 'empty updatedAt page is not “no chats” when fallback has docs');
}

{
  const recency = Array.from({ length: 15 }, (_, i) => ({
    id: 'new_' + i,
    firestoreId: 'new_' + i,
    type: 'dm',
    updatedAt: 10000 + i,
    ts: 10000 + i,
  }));
  const oldGroups = [
    { id: 'old_grp_a', firestoreId: 'old_grp_a', type: 'group', createdAt: 10, ts: 10 },
    { id: 'old_grp_b', firestoreId: 'old_grp_b', type: 'group', lastMessageAt: 20, ts: 20 },
  ];
  const cached = [{ id: 'cached_dm', firestoreId: 'cached_dm', type: 'dm', ts: 5 }];
  const union = mergeBaithakInbox(mergeBaithakInbox(recency, oldGroups), cached);
  assert(union.length === 18, 'recency + membership + cache keeps every live id');
  assert(union.some((c) => c.id === 'old_grp_a'), 'old group A survives recency-only page');
  assert(union.some((c) => c.id === 'cached_dm'), 'device cache fills gaps when scan is incomplete');
}

{
  const cached = [{ id: 'legacy_dm', type: 'dm', name: 'Legacy', participants: ['u1', 'u2'], ts: 1 }];
  const merged = mergeBaithakInbox([], cached.map(mapChatDoc));
  assert(merged.length === 1, 'always merge device cache on reset keeps legacy dm');
}

console.log('baithak inbox tests ok');
