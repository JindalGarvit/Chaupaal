/**
 * Two-account privacy checklist — projection logic (no live Firebase required).
 * Mirrors what a stranger vs friend would see from users_public + View as others.
 *
 * Live device steps that still need human eyes are listed at the end.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

// Load users-public + profile-preview as scripts into a sandbox
function loadBrowserScript(rel, sandbox) {
  const code = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: rel });
}

const sandbox = {
  console,
  window: {},
  document: { createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }) },
  firebase: undefined,
  db: null,
  currentUser: null,
  DigitalLayout: {
    publicDigitalLayoutProjection(p) {
      return {
        version: 1,
        blocks: (p.digitalLayout?.blocks || []).filter((b) => b && b.visible !== false && b.privacy === 'public'),
      };
    },
    friendsDigitalLayoutProjection(p) {
      return {
        version: 1,
        blocks: (p.digitalLayout?.blocks || []).filter(
          (b) => b && b.visible !== false && b.privacy !== 'private'
        ),
      };
    },
    stripProfileFieldsForAudience(merged) {
      return { ...merged };
    },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

loadBrowserScript('public/src/js/core/users-public.js', sandbox);
loadBrowserScript('public/src/js/features/profile-preview.js', sandbox);

const { buildPublicProjection } = sandbox.window.UsersPublic || sandbox.UsersPublic || {};
const getPublicVisibleProfile =
  sandbox.window.getPublicVisibleProfile || sandbox.getPublicVisibleProfile;

assert(typeof buildPublicProjection === 'function', 'buildPublicProjection exported');
assert(typeof getPublicVisibleProfile === 'function', 'getPublicVisibleProfile exported');

const rich = {
  uid: 'alice',
  name: 'Alice',
  username: 'alice',
  bio: 'I love trekking',
  city: 'Mumbai',
  age: 28,
  lookingFor: 'Friendship',
  annualIncome: '10-20L',
  religion: 'Prefer not to say',
  showAge: false,
  showLocation: false,
  showRelationship: false,
  showIncome: false,
  showReligion: false,
  profileVisibility: 'Friends only',
  profile: {
    displayName: 'Alice',
    bio: 'I love trekking',
    currentCity: 'Mumbai',
    age: 28,
    lookingFor: 'Friendship',
    annualIncome: '10-20L',
    religion: 'Prefer not to say',
  },
};

// Friends only → identity only on users_public
const friendsProj = buildPublicProjection('alice', rich);
assert(!friendsProj.bio, 'Friends only projection has no bio');
assert(!friendsProj.city, 'Friends only projection has no city');
assert(!friendsProj.age, 'Friends only projection has no age');
assert(!friendsProj.lookingFor, 'Friends only projection has no lookingFor');
assert(friendsProj.profileVisibility === 'Friends only', 'visibility label Friends only');
assert(friendsProj.name === 'Alice', 'identity name kept');

const privateProj = buildPublicProjection('alice', { ...rich, profileVisibility: 'Private' });
assert(!privateProj.bio && privateProj.profileVisibility === 'Private', 'Private identity-only');

// Public + show* off
const publicOff = buildPublicProjection('alice', {
  ...rich,
  profileVisibility: 'public',
  showAge: false,
  showLocation: false,
  showRelationship: false,
  showIncome: false,
  showReligion: false,
});
assert(!publicOff.age, 'showAge off strips age');
assert(!publicOff.city, 'showLocation off strips city');
assert(!publicOff.lookingFor, 'showRelationship off strips lookingFor');
assert(!publicOff.annualIncome && !publicOff.profile?.annualIncome, 'showIncome off strips income');
assert(!publicOff.religion && !publicOff.profile?.religion, 'showReligion off strips religion');
assert(publicOff.bio === 'I love trekking' || publicOff.profile?.bio, 'bio still on public when not gated by show*');

// View as others matches stranger lock
const dp = {
  displayName: 'Alice',
  bio: 'I love trekking',
  currentCity: 'Mumbai',
  age: 28,
  lookingFor: 'Friendship',
  religion: 'X',
  annualIncome: 'Y',
  showAge: true,
  showLocation: true,
  showRelationship: true,
  showReligion: false,
  showIncome: false,
  profileVisibility: 'Friends only',
};
const strangerView = getPublicVisibleProfile(dp, { username: 'alice', name: 'Alice' }, { isFriend: false });
assert(strangerView.locked === true, 'stranger locked on Friends only');
assert(!strangerView.fields.length, 'stranger sees no gated fields');

const friendView = getPublicVisibleProfile(dp, { username: 'alice', name: 'Alice' }, { isFriend: true });
assert(friendView.locked === false, 'friend unlocked on Friends only');
assert(friendView.fields.some((f) => f.label === 'City'), 'friend sees city');
assert(!friendView.fields.some((f) => f.label === 'Religion'), 'showReligion off hides religion in preview');
assert(!friendView.fields.some((f) => f.label === 'Income'), 'showIncome off hides income in preview');

const publicView = getPublicVisibleProfile(
  { ...dp, profileVisibility: 'public', showAge: false, showLocation: false },
  { username: 'alice' },
  { isFriend: false }
);
assert(publicView.locked === false, 'public not locked');
assert(!publicView.fields.some((f) => f.label === 'Age'), 'View as others honors showAge off');
assert(!publicView.fields.some((f) => f.label === 'City'), 'View as others honors showLocation off');

// Opt-out: signal spine must check activitySignalsOptOut (static source check)
const spine = fs.readFileSync(path.join(__dirname, '..', 'public/src/js/core/signal-spine.js'), 'utf8');
assert(/function isOptedOut/.test(spine), 'signal spine has isOptedOut');
assert(/activitySignalsOptOut/.test(spine), 'opt-out reads activitySignalsOptOut');
assert(/chaupaal_activity_signals_opt_out/.test(spine), 'opt-out localStorage key');

// Archived / hidden posts: duniya canRead requires archived → owner only (rules source)
const rules = fs.readFileSync(path.join(__dirname, '..', 'firebase/firestore.rules'), 'utf8');
assert(/archived && \(isOwner/.test(rules) || /archived.*isOwner/.test(rules), 'archived posts owner-gated in rules');

console.log('\nTwo-account projection checklist passed (logic).');
console.log(`
Manual device steps (production accounts) — confirm once on device:
  1. Account A Friends only; B friend of A sees friend_projection / unlocked sheet; C stranger sees locked.
  2. Toggle each show* off on a Public profile; confirm field gone on B’s view of A (sheet, search card, share preview).
  3. A “View as others” / As stranger matches what C sees.
  4. Hide a Duniya post on A → absent on B’s public grid; unhide → returns.
  5. A turns Personalization off → Network/Firestore shows no signalEvents writes for A.
`);
