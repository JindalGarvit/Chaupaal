/**
 * Unit tests for Peepal cascading audience segments (no Firestore).
 * Run: node scripts/test-peepal-segments.js
 */
'use strict';
const assert = require('assert');
const {
  buildAudienceSegments,
  normalizeCriteria,
  resolveCap,
  recordSegmentResponse,
  recordSegmentView,
  evaluateSegmentStall,
  activeSegmentIndex,
  STALL_MIN_MS,
  STALL_WINDOW_MS,
} = require('../server-lib/peepal-segments');

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

test('resolveCap presets and custom bounds', () => {
  assert.strictEqual(resolveCap('10'), 10);
  assert.strictEqual(resolveCap('algorithm'), null);
  assert.strictEqual(resolveCap(''), null);
  assert.strictEqual(resolveCap('custom', 25), 25);
  assert.strictEqual(resolveCap('custom', 0), 50); // fallback
  assert.strictEqual(resolveCap('custom', 99999), 5000);
});

test('normalizeCriteria clamps age and sanitizes gender', () => {
  const c = normalizeCriteria({
    interests: [' Travel ', '', 'x'],
    ageRange: { min: 5, max: 200 },
    gender: 'other',
    city: '  Mumbai  ',
  });
  assert.deepStrictEqual(c.interests, ['Travel', 'x']);
  assert.strictEqual(c.ageRange.min, 13);
  assert.strictEqual(c.ageRange.max, 100);
  assert.strictEqual(c.gender, 'any');
  assert.strictEqual(c.city, 'Mumbai');
});

test('buildAudienceSegments defaults to one active segment', () => {
  const segs = buildAudienceSegments({ responseLimitMode: '50' });
  assert.strictEqual(segs.length, 1);
  assert.strictEqual(segs[0].status, 'active');
  assert.strictEqual(segs[0].cap, 50);
  assert.strictEqual(activeSegmentIndex(segs), 0);
});

test('buildAudienceSegments friends legacy label', () => {
  const segs = buildAudienceSegments({ legacyAudience: 'friends', responseLimitMode: 'algorithm' });
  assert.strictEqual(segs[0].label, 'Friends');
  assert.strictEqual(segs[0].cap, null);
  assert.strictEqual(segs[0].criteria.searchIntent, 'friendship');
});

test('recordSegmentResponse advances when cap hit', () => {
  const segs = buildAudienceSegments({
    segments: [
      { label: 'A', cap: 2, criteria: {} },
      { label: 'B', cap: 10, criteria: {} },
    ],
  });
  let r = recordSegmentResponse(segs, 1_000);
  assert.strictEqual(r.advanced, false);
  assert.strictEqual(r.segments[0].fulfilledCount, 1);
  r = recordSegmentResponse(r.segments, 2_000);
  assert.strictEqual(r.advanced, true);
  assert.strictEqual(r.segments[0].status, 'completed');
  assert.strictEqual(r.segments[0].stallReason, 'capped');
  assert.strictEqual(r.segments[1].status, 'active');
  assert.strictEqual(r.nextIndex, 1);
});

test('evaluateSegmentStall waits for min active time and views', () => {
  const segs = buildAudienceSegments({
    segments: [
      { label: 'A', cap: null, criteria: {} },
      { label: 'B', cap: null, criteria: {} },
    ],
  });
  const t0 = segs[0].activatedAt;
  let viewed = segs;
  for (let i = 0; i < 10; i++) viewed = recordSegmentView(viewed, t0 + i);
  const tooSoon = evaluateSegmentStall(viewed, t0 + STALL_MIN_MS - 1);
  assert.strictEqual(tooSoon.advanced, false);
  assert.strictEqual(tooSoon.segments[0].status, 'active');
});

test('evaluateSegmentStall advances on engagement stall', () => {
  const segs = buildAudienceSegments({
    segments: [
      { label: 'A', cap: null, criteria: {} },
      { label: 'B', cap: null, criteria: {} },
    ],
  });
  const t0 = segs[0].activatedAt;
  let state = segs;
  for (let i = 0; i < 10; i++) state = recordSegmentView(state, t0);
  // Force window old enough without responses
  state[0].windowStartedAt = t0;
  state[0].responsesInWindow = 0;
  const now = t0 + Math.max(STALL_MIN_MS, STALL_WINDOW_MS) + 1;
  const r = evaluateSegmentStall(state, now);
  assert.strictEqual(r.advanced, true);
  assert.strictEqual(r.segments[0].status, 'stalled');
  assert.strictEqual(r.segments[0].stallReason, 'engagement_stall');
  assert.strictEqual(r.segments[1].status, 'active');
});

test('healthy window rolls instead of stalling', () => {
  const segs = buildAudienceSegments({
    segments: [{ label: 'A', cap: null, criteria: {} }],
  });
  const t0 = segs[0].activatedAt;
  let state = segs;
  for (let i = 0; i < 10; i++) state = recordSegmentView(state, t0);
  state[0].windowStartedAt = t0;
  state[0].responsesInWindow = 2;
  const now = t0 + Math.max(STALL_MIN_MS, STALL_WINDOW_MS) + 1;
  const r = evaluateSegmentStall(state, now);
  assert.strictEqual(r.advanced, false);
  assert.strictEqual(r.segments[0].status, 'active');
  assert.strictEqual(r.segments[0].responsesInWindow, 0);
  assert.strictEqual(r.segments[0].windowStartedAt, now);
});

console.log(process.exitCode ? '\nPeepal segments tests failed.' : '\nPeepal segments tests passed.');
