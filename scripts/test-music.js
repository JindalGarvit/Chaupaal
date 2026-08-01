/**
 * Unit tests for music track normalization (no iTunes / JioSaavn network).
 */
const assert = require('assert');
const { normalizeItunesTrack } = require('../server-lib/music');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('normalizeItunesTrack requires a title', () => {
  assert.strictEqual(normalizeItunesTrack(null), null);
  assert.strictEqual(normalizeItunesTrack({ trackId: 1 }), null);
  assert.strictEqual(normalizeItunesTrack({ trackName: '   ' }), null);
});

test('normalizeItunesTrack maps artwork, preview, and stable id', () => {
  const out = normalizeItunesTrack({
    trackId: 42,
    trackName: '  Kesariya  ',
    artistName: 'Arijit Singh',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
    previewUrl: 'https://audio.example/preview.m4a',
  });
  assert.deepStrictEqual(out, {
    id: 'itunes_42',
    title: 'Kesariya',
    artist: 'Arijit Singh',
    thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/200x200bb.jpg',
    previewUrl: 'https://audio.example/preview.m4a',
    source: 'itunes',
  });
});

test('normalizeItunesTrack defaults artist and allows missing preview', () => {
  const out = normalizeItunesTrack({
    trackId: 7,
    trackName: 'Untitled',
  });
  assert.strictEqual(out.artist, 'Unknown artist');
  assert.strictEqual(out.previewUrl, null);
  assert.strictEqual(out.thumbnail, '');
  assert.strictEqual(out.source, 'itunes');
});

console.log('\nmusic unit tests passed.');
