/**
 * Unit tests for shadowban escalation math.
 * Run: node scripts/test-shadowban.js
 */
const {
  nextShadowbanState,
  SOFT_THRESHOLD,
  SEVERE_THRESHOLD,
  SOFT_FLOOR_REASONS,
} = require('../server-lib/shadowban');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error('FAIL:', msg);
  }
}

// Single harassment/impersonation report must NOT jump to severe
assert(SOFT_FLOOR_REASONS.has('harassment'), 'harassment is soft-floor');
assert(SOFT_FLOOR_REASONS.has('impersonation'), 'impersonation is soft-floor');

const oneHarassment = nextShadowbanState({
  prevCount: 0,
  prevTier: 'none',
  reasonCode: 'harassment',
  alreadyCounted: false,
});
assert(oneHarassment.tier === 'soft', 'one harassment → soft, not severe');
assert(oneHarassment.count === SOFT_THRESHOLD, 'one harassment floors at soft threshold');
assert(oneHarassment.tier !== 'severe', 'one harassment never severe');

const oneCustom = nextShadowbanState({
  prevCount: 0,
  prevTier: 'none',
  reasonCode: 'custom',
  alreadyCounted: false,
});
assert(oneCustom.tier === 'none', 'first custom report stays none');
assert(oneCustom.count === 1, 'first custom increments to 1');

const duplicate = nextShadowbanState({
  prevCount: 4,
  prevTier: 'soft',
  reasonCode: 'harassment',
  alreadyCounted: true,
});
assert(duplicate.count === 4, 'duplicate reporter does not increment');
assert(duplicate.tier === 'soft', 'duplicate reporter does not escalate');

const spamSameActor = nextShadowbanState({
  prevCount: 1,
  prevTier: 'none',
  reasonCode: 'low_chat_rating',
  alreadyCounted: true,
});
assert(spamSameActor.count === 1 && spamSameActor.tier === 'none', 'repeat low ratings from same actor ignored');

// Distinct reporters still escalate normally
let state = { count: 0, tier: 'none' };
for (let i = 0; i < SOFT_THRESHOLD; i += 1) {
  state = nextShadowbanState({
    prevCount: state.count,
    prevTier: state.tier,
    reasonCode: 'spam',
    alreadyCounted: false,
  });
}
assert(state.tier === 'soft', `${SOFT_THRESHOLD} unique reporters → soft`);

for (let i = state.count; i < SEVERE_THRESHOLD; i += 1) {
  state = nextShadowbanState({
    prevCount: state.count,
    prevTier: state.tier,
    reasonCode: 'spam',
    alreadyCounted: false,
  });
}
assert(state.tier === 'severe', `${SEVERE_THRESHOLD} unique reporters → severe`);
assert(state.count === SEVERE_THRESHOLD, 'severe at exact threshold');

console.log(`test-shadowban: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
