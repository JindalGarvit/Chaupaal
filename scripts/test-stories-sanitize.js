/**
 * Unit tests for Instants/story sanitize helpers in api/stories.js.
 * Pure validators only — no Firestore/Admin.
 */
const assert = require('assert');
const stories = require('../api/stories');

const {
  cleanUid,
  cleanDestination,
  cleanMedia,
  cleanClientId,
  cleanMusic,
  cleanLocation,
  serializeStory,
} = stories;

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('cleanUid accepts firebase-ish ids and rejects junk', () => {
  assert.strictEqual(cleanUid('AbC_12-xyz'), 'AbC_12-xyz');
  assert.strictEqual(cleanUid('bad uid'), '');
  assert.strictEqual(cleanUid('../../etc'), '');
  assert.strictEqual(cleanUid(''), '');
});

test('cleanDestination only allows baithak|duniya', () => {
  assert.strictEqual(cleanDestination('baithak'), 'baithak');
  assert.strictEqual(cleanDestination('duniya'), 'duniya');
  assert.strictEqual(cleanDestination('public'), '');
  assert.strictEqual(cleanDestination('BAITHAK'), '');
});

test('cleanMedia requires https and truncates', () => {
  assert.strictEqual(cleanMedia('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  assert.strictEqual(cleanMedia('http://insecure.example.com/a.jpg'), '');
  assert.strictEqual(cleanMedia('javascript:alert(1)'), '');
  assert.strictEqual(cleanMedia('https://' + 'x'.repeat(3000)).length, 2048);
});

test('cleanClientId enforces length + charset', () => {
  assert.strictEqual(cleanClientId('abcd1234'), 'abcd1234');
  assert.strictEqual(cleanClientId('short'), '');
  assert.strictEqual(cleanClientId('has space!!'), '');
});

test('cleanMusic drops empty titles and non-https previews', () => {
  assert.strictEqual(cleanMusic(null), null);
  assert.strictEqual(cleanMusic({ artist: 'A' }), null);
  const ok = cleanMusic({
    title: '  Kesariya  ',
    artist: 'Arijit',
    thumbnail: 'https://img.example/t.jpg',
    previewUrl: 'https://audio.example/p.mp4',
    source: 'jiosaavn',
  });
  assert.deepStrictEqual(ok, {
    title: 'Kesariya',
    artist: 'Arijit',
    thumbnail: 'https://img.example/t.jpg',
    previewUrl: 'https://audio.example/p.mp4',
    source: 'jiosaavn',
  });
  const noPreview = cleanMusic({
    title: 'Song',
    previewUrl: 'http://bad.example/p.mp3',
    source: 'itunes',
  });
  assert.strictEqual(noPreview.previewUrl, null);
  assert.strictEqual(noPreview.source, 'none');
});

test('cleanMusic rejects unknown sources unless preview forces default', () => {
  const withPreview = cleanMusic({
    title: 'X',
    previewUrl: 'https://a.example/p.m4a',
    source: 'spotify',
  });
  assert.strictEqual(withPreview.source, 'jiosaavn');
  const itunes = cleanMusic({
    title: 'X',
    previewUrl: 'https://a.example/p.m4a',
    source: 'iTunes',
  });
  assert.strictEqual(itunes.source, 'itunes');
});

test('cleanLocation validates lat/lng bounds and modes', () => {
  assert.strictEqual(cleanLocation(null), null);
  assert.strictEqual(cleanLocation({ lat: 91, lng: 0 }), null);
  assert.strictEqual(cleanLocation({ lat: 0, lng: 181 }), null);
  const pin = cleanLocation({ lat: 18.52, lng: 73.85, placeName: 'Pune' });
  assert.strictEqual(pin.type, 'location');
  assert.strictEqual(pin.mode, 'pin');
  assert.strictEqual(pin.placeName, 'Pune');
  assert.strictEqual(pin.label, 'Pune');
  const live = cleanLocation({
    lat: 19.07,
    lng: 72.87,
    mode: 'live',
    liveShareId: 'share_1',
    expiresAt: 1700000000000,
  });
  assert.strictEqual(live.mode, 'live');
  assert.strictEqual(live.liveShareId, 'share_1');
  assert.strictEqual(live.expiresAt, 1700000000000);
  assert.strictEqual(live.label, 'Live location');
});

test('serializeStory hides visibility from non-owners (no selective-sharing tell)', () => {
  const doc = {
    id: 's1',
    data: () => ({
      uid: 'poster',
      destination: 'baithak',
      visibility: 'close_friends',
      media: 'https://cdn.example/a.jpg',
      name: 'Poster',
      createdAt: 100,
      expiresAt: 200,
    }),
  };
  const viewer = serializeStory(doc, 'friend');
  assert.strictEqual(viewer.own, false);
  assert.strictEqual(viewer.visibility, undefined);
  assert.strictEqual(viewer.deletable, false);

  const owner = serializeStory(doc, 'poster');
  assert.strictEqual(owner.own, true);
  assert.strictEqual(owner.visibility, 'close_friends');
  assert.strictEqual(owner.deletable, true);
});

console.log('\nstories sanitize unit tests passed.');
