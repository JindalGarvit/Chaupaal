/**
 * Duniya story overlay sanitizers.
 */
const fs = require('fs');
const path = require('path');
const {
  cleanOverlays,
  cleanInteractive,
  cleanMentions,
  cleanRestoryOf,
  publicInteractive,
  tallyResponses,
  cleanHttpsUrl,
} = require('../server-lib/story-overlays');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

{
  const overlays = cleanOverlays([
    { type: 'text', text: 'Hello', x: 0.4, y: 0.2, style: 'display' },
    { type: 'poll', prompt: 'Tea?', options: ['Yes', 'No'] },
    { type: 'link', url: 'javascript:alert(1)' },
    { type: 'link', url: 'https://chaupaal.app/hi' },
    { type: 'nope' },
  ]);
  assert(overlays.some((o) => o.type === 'text' && o.text === 'Hello'), 'keeps text overlay');
  assert(overlays.some((o) => o.type === 'poll' && o.options.length === 2), 'keeps poll');
  assert(!overlays.some((o) => o.url && o.url.startsWith('javascript')), 'drops javascript: links');
  assert(overlays.some((o) => o.type === 'link' && o.url.startsWith('https://')), 'keeps https link');
  assert(overlays.length <= 4, 'drops unknown types');
}

{
  const interactive = cleanInteractive(null, [
    { type: 'quiz', prompt: 'Q', options: ['A', 'B'], correctIndex: 0 },
  ]);
  assert(interactive.quiz.correctIndex === 0, 'quiz correct index stored for owner');
  const pub = publicInteractive(interactive, { voted: null, own: false });
  assert(pub.quiz.correctIndex == null, 'viewers do not see quiz answer until they vote');
}

{
  const m = cleanMentions([{ uid: 'u1', name: 'A' }, { uid: 'u1', name: 'dup' }, { uid: 'bad uid' }]);
  assert(m.length === 1 && m[0].uid === 'u1', 'mentions unique + uid cleaned');
}

{
  assert(cleanRestoryOf({ storyId: 's1', uid: 'u2', name: 'Sam' }).uid === 'u2', 'restoryOf kept');
  assert(cleanHttpsUrl('https://ok.com') === 'https://ok.com', 'https ok');
  assert(cleanHttpsUrl('http://no.com') === '', 'http rejected');
}

{
  const tallies = tallyResponses(
    [{ data: () => ({ poll: 0 }) }, { data: () => ({ poll: 0 }) }, { data: () => ({ poll: 1 }) }],
    { poll: { options: ['A', 'B'] } }
  );
  assert(tallies.poll[0] === 2 && tallies.poll[1] === 1, 'poll tallies');
}

{
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert(html.includes('/src/js/features/duniya-story.js'), 'index.html loads duniya-story.js');
  assert(html.includes('/src/js/features/duniya-story-media.js'), 'index.html loads duniya-story-media.js');
  assert(html.includes('/src/js/features/duniya-story-editor.js'), 'index.html loads story editor');
  assert(html.includes('/src/js/features/duniya-story-viewer.js'), 'index.html loads story viewer');
  assert(html.includes('/src/styles/duniya-story.css'), 'index.html loads duniya-story.css');
  assert(
    html.indexOf('/src/js/features/duniya-story.js') < html.indexOf('/src/js/features/duniya.js'),
    'story modules load before duniya.js'
  );
  assert(
    html.indexOf('/src/js/features/duniya-story-media.js') < html.indexOf('/src/js/features/duniya-story-editor.js'),
    'story media loads before editor'
  );
}

{
  const { splitOverlaysForBake, renderDrawOverlayHtml } = require('../public/src/js/features/duniya-story-media.js');
  const overlays = [
    { type: 'text', text: 'Hi', x: 0.5, y: 0.4 },
    { type: 'draw', strokes: [{ color: '#E63946', width: 4, points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] }] },
    { type: 'emoji', emoji: '🔥', x: 0.5, y: 0.5 },
    { type: 'poll', prompt: 'Tea?', options: ['Yes', 'No'] },
    { type: 'music', x: 0.5, y: 0.8 },
  ];
  const { bakedOverlays, payloadOverlays } = splitOverlaysForBake(overlays);
  assert(bakedOverlays.length === 3, 'bake collects text draw emoji');
  assert(payloadOverlays.some((o) => o.type === 'poll'), 'interactive poll survives as JSON overlay');
  assert(!payloadOverlays.some((o) => o.type === 'text'), 'bake removes text from payload');
  assert(!payloadOverlays.some((o) => o.type === 'draw'), 'bake removes draw from payload');
  const drawHtml = renderDrawOverlayHtml(overlays[1], { width: 360, height: 640 });
  assert(drawHtml.includes('ds-ov-draw') && drawHtml.includes('<path'), 'draw overlay renders in viewer HTML');
}

console.log('duniya story overlay tests ok');
