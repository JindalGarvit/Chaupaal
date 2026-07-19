/**
 * Focused unit checks for Chaupaal cadence + persona helpers.
 * Run: node scripts/test-chaupaal.js
 */
const assert = require('assert');
const cadence = require('../server-lib/chaupaal-cadence');
const persona = require('../server-lib/chaupaal-persona');

function test(name, fn) {
  try {
    fn();
    console.log('✓', name);
  } catch (e) {
    console.error('✗', name);
    console.error(e);
    process.exitCode = 1;
  }
}

test('crisis detector catches self-harm', () => {
  assert.strictEqual(persona.detectCrisis('I want to kill myself'), true);
  assert.strictEqual(persona.detectCrisis('how was your day'), false);
});

test('normalizeReply crisis override ignores AI text', () => {
  const out = persona.normalizeReply('{"reply":"lol chill"}', 'I feel suicidal tonight');
  assert.strictEqual(out.crisis, true);
  assert.ok(out.reply.includes('AASRA') || out.reply.includes('emergency'));
});

test('structured JSON parse + feedback heuristic fallback', () => {
  const out = persona.normalizeReply(
    '{"reply":"Thanks for telling me.","isFeedback":false,"feedbackTag":null}',
    'There is a bug in the chat send button'
  );
  assert.strictEqual(out.isFeedback, true);
  assert.strictEqual(out.feedbackTag, 'bug');
  assert.ok(out.reply.includes('Thanks'));
});

test('identity question helper', () => {
  assert.strictEqual(persona.isDirectIdentityQuestion('are you a real person?'), true);
  assert.strictEqual(persona.isDirectIdentityQuestion('what is peepal?'), false);
});

test('daily cap: second slot journal only', () => {
  const today = cadence.localDateKey('Asia/Kolkata');
  const state = {
    timezone: 'Asia/Kolkata',
    eventsToday: [{ type: 'session_nudge', dateKey: today }],
  };
  assert.strictEqual(cadence.canSendProactive(state, { type: 'session_nudge' }).ok, false);
  assert.strictEqual(cadence.canSendProactive(state, { type: 'goodnight_journal', isJournal: true }).ok, true);
});

test('session nudge idempotency', () => {
  const state = { timezone: 'Asia/Kolkata', lastSessionNudgeId: 's1' };
  assert.strictEqual(
    cadence.canSendProactive(state, { type: 'session_nudge', sessionId: 's1' }).reason,
    'session_nudge_done'
  );
});

test('fast dismiss backoff', () => {
  const next = cadence.applyDismiss({}, { fast: true });
  assert.ok(Number(next.consecutiveFastDismisses) >= 1);
  assert.ok(next.backoffUntil);
  const blocked = cadence.canSendProactive(next, { type: 'session_nudge', sessionId: 's2' });
  assert.strictEqual(blocked.ok, false);
});

test('engage resets backoff', () => {
  const dismissed = cadence.applyDismiss({}, { fast: true });
  const engaged = cadence.applyEngage(dismissed);
  assert.strictEqual(engaged.consecutiveFastDismisses, 0);
  assert.strictEqual(engaged.backoffUntil, null);
});

test('evening window default vs observed', () => {
  const def = cadence.deriveEveningWindow({});
  assert.strictEqual(def.source, 'default');
  assert.strictEqual(def.startHour, 19);
  const obs = cadence.deriveEveningWindow({ 20: 3, 21: 3 });
  assert.strictEqual(obs.source, 'observed');
  assert.ok(obs.endHour - obs.startHour === 2);
});

test('type date key idempotency', () => {
  const today = cadence.localDateKey('Asia/Kolkata');
  const state = { timezone: 'Asia/Kolkata', typeDateKeys: { weekly_recommendation: today } };
  assert.strictEqual(
    cadence.canSendProactive(state, { type: 'weekly_recommendation' }).reason,
    'type_already_today'
  );
});

test('recordEventSent prunes and stamps', () => {
  const next = cadence.recordEventSent(
    { timezone: 'Asia/Kolkata', eventsToday: [] },
    { type: 'session_nudge', sessionId: 'abc', now: new Date() }
  );
  assert.strictEqual(next.lastSessionNudgeId, 'abc');
  assert.ok(next.eventsToday.length === 1);
});

console.log('\nDone.');
