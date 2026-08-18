/**
 * Duniya post payload sanitizers + create validation.
 */
const {
  cleanHttps,
  cleanSlides,
  cleanTags,
  cleanUidList,
  cleanHashtags,
  cleanMusic,
  cleanLocation,
  validateCreate,
  mentionedFromCaption,
} = require('../server-lib/duniya-post-payload');
const fs = require('fs');
const path = require('path');
const { isDuniyaPostRequest } = require('../server-lib/duniya-posts');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

{
  const slides = cleanSlides([
    { type: 'image', media: 'https://res.cloudinary.com/x/image.jpg', width: 1200, height: 800, alt: 'hi' },
    { type: 'video', media: 'http://insecure.example/v.mp4' },
    { type: 'gif', media: 'https://media.giphy.com/media/x/giphy.gif' },
    { type: 'nope', media: 'https://x.com/a.jpg' },
    null,
  ]);
  assert(slides.length === 2 && slides[0].type === 'image' && slides[1].type === 'gif', 'keeps https image+gif, drops http video');
  assert(slides[0].alt === 'hi' && slides[0].width === 1200, 'persists alt and size');
}

{
  const tags = cleanTags([
    { uid: 'u1', name: 'A', username: 'a', x: 1.4, y: -1, slideIndex: 0 },
    { uid: 'u1', name: 'dup' },
    { uid: 'bad uid' },
  ]);
  assert(tags.length === 1 && tags[0].uid === 'u1', 'tags unique + uid cleaned');
  assert(tags[0].x === 1 && tags[0].y === 0, 'tag coords clamped 0–1');
}

{
  assert(cleanHttps('https://ok.com/a') === 'https://ok.com/a', 'https ok');
  assert(cleanHttps('http://no.com') === '', 'http rejected');
}

{
  const v = validateCreate({ caption: '', slides: [] });
  assert(!v.ok, 'text-only empty caption illegal');
  assert(validateCreate({ caption: 'Hello', slides: [] }).ok, 'text-only with caption ok');
  assert(validateCreate({ caption: '', slides: [{ type: 'image', media: 'https://x.com/a.jpg' }] }).ok, 'media may have empty caption');
}

{
  const music = cleanMusic({ title: 'Song', artist: 'X', previewUrl: 'https://p.example/a.mp3', source: 'jiosaavn' });
  assert(music && music.title === 'Song' && music.previewUrl.startsWith('https://'), 'music kept');
  assert(cleanMusic({ title: '' }) === null, 'music needs title');
  const loc = cleanLocation({ lat: 28.6, lng: 77.2, placeName: 'Delhi' });
  assert(loc && loc.placeName === 'Delhi', 'location kept');
  assert(cleanLocation({ lat: 200, lng: 0 }) === null, 'invalid lat dropped');
}

{
  const tags = cleanHashtags(['Tea'], 'Hello #Chai #tea @Dev');
  assert(tags.includes('chai') && tags.includes('tea'), 'hashtags from list+caption, lowercased');
  assert(mentionedFromCaption('hi @Riya and @dev_1')[0] === 'riya', 'mention handles parsed');
  assert(cleanUidList(['ok', 'bad uid', 'ok'], 10).length === 1, 'uid list unique + cleaned');
}

{
  const req = { url: '/api/stories', headers: { 'x-forwarded-uri': '/api/duniya-posts' } };
  assert(isDuniyaPostRequest(req, { action: 'create' }), 'rewrite path still routes to post handler');
  assert(isDuniyaPostRequest({}, { action: 'collab', postId: 'p1' }), 'collab is a post action');
  assert(isDuniyaPostRequest({}, { action: 'create', slides: [], caption: 'hi' }), 'post create has slides/caption, no destination');
  assert(!isDuniyaPostRequest({}, { action: 'create', destination: 'baithak', text: 'split' }), 'story create stays on stories');
}

{
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert(html.includes('/src/js/features/duniya-compose.js'), 'index.html loads duniya-compose.js');
  assert(html.includes('/src/styles/duniya-compose.css'), 'index.html loads duniya-compose.css');
}

console.log('duniya compose payload tests ok');
