/**
 * Duniya story overlay sanitizers.
 */
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

console.log('duniya story overlay tests ok');
