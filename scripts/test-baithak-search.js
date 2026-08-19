/**
 * Baithak search + nickname ranking tests.
 */
global.window = global;
global.currentUser = { uid: 'u1' };
global.isSelfChatRow = (c) => c?.type === 'self';
global.isChaupaalChatRow = () => false;
global.pinSelfChat = (list) => list;
global.chatRecencyMs = (c) => c?.ts || 0;

const searchMod = require('../public/src/js/features/baithak-search.js');
const {
  resolveChatDisplayName,
  filterChatsForSearch,
  scoreChatMatch,
  chatSearchHaystack,
} = searchMod;

const { mergeBaithakInbox, mapChatDoc, hydrateInboxFromDeviceCache } = require('../public/src/js/features/baithak-data.js');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

{
  const dm = { id: 'dm_a', type: 'dm', uid: 'u2', name: 'Riya Sharma', _realName: 'Riya Sharma' };
  assert(resolveChatDisplayName(dm, dm.name) === 'Riya Sharma', 'default display uses real name');
}

{
  global.baithakChats = [
    { id: 'dm_a', firestoreId: 'dm_a', type: 'dm', uid: 'u2', name: 'Riya Sharma', preview: 'hello', ts: 100 },
    { id: 'grp_x', firestoreId: 'grp_x', type: 'group', name: 'Test Group', preview: 'weekly', ts: 90 },
  ];
  global.BaithakSearch = searchMod;
  const hits = filterChatsForSearch('test group');
  assert(hits.some((c) => c.type === 'group'), 'inline search finds group by title');
  const dmHits = filterChatsForSearch('riya');
  assert(dmHits.some((c) => c.type === 'dm'), 'inline search finds dm by name');
}

{
  const chat = { id: 'dm_a', type: 'dm', uid: 'u2', name: 'Riya Sharma', preview: 'project deadline tomorrow' };
  assert(scoreChatMatch(chat, 'deadline') > 0, 'preview text contributes to match score');
  assert(chatSearchHaystack(chat).includes('riya'), 'haystack includes lowercase name');
}

{
  const sabha = mergeBaithakInbox([], [
    mapChatDoc({ id: 'dm1', type: 'dm', participants: ['u1', 'u2'], updatedAt: 5000 }),
    mapChatDoc({ id: 'grp1', type: 'group', name: 'Test Group', participants: ['u1', 'u3'], createdAt: 1000 }),
  ]);
  assert(sabha.some((c) => c.type === 'dm') && sabha.some((c) => c.type === 'group'), 'Sabha union keeps DM + group');
}

{
  global.localStorage = {
    _d: {},
    getItem(k) {
      return this._d[k] || null;
    },
    setItem(k, v) {
      this._d[k] = v;
    },
  };
  global.localStorage.setItem(
    'chaupaal_baithak_inbox_v1_u1',
    JSON.stringify([{ id: 'cached_dm', type: 'dm', name: 'Cached Friend', ts: 50, participants: ['u1', 'u9'] }])
  );
  global.baithakChats = [];
  const mapped = hydrateInboxFromDeviceCache();
  assert(mapped.length === 1 && mapped[0].id === 'cached_dm', 'device cache hydrates before Firestore');
}

console.log('baithak search tests ok');
