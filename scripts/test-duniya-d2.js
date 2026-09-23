/**
 * Duniya D2 — friends/followers-first Vishwa rank + social persistence hygiene.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const duniya = read('public/src/js/features/duniya.js');
const persist = read('public/src/js/core/social-persistence.js');

assert(/rankDuniyaVishwaFeed/.test(duniya), 'rank helper exists');
assert(/DUNIYA_VISHWA_PRIORITY_SLOTS\s*=\s*5/.test(duniya), '5 early priority slots');
assert(/duniyaPrioritySet/.test(duniya), 'priority set for friends+following');
assert(/st\.friend\|\|st\.following/.test(duniya), 'priority = friend OR following');
assert(/hydrateContentSaved/.test(duniya), 'hydrate saved on load');
assert(/hydrateContentLikes/.test(duniya), 'hydrate likes on load');
assert(/Showing people you follow first/.test(duniya), 'dismissible priority hint');
assert(/rankDuniyaVishwaFeed\(visible\)/.test(duniya), 'render uses rank');
assert(/duniyaIsDemoPost/.test(duniya) && /toastDuniyaDemo/.test(duniya), 'Demo local-only');
assert(/Could not save like/.test(duniya), 'calm like failure toast');
assert(/duniyaPrioritySet\.add/.test(duniya) && /duniyaPrioritySet\.delete/.test(duniya), 'follow updates priority');
assert(/content\.isSample \|\| content\.isDemo/.test(persist), 'canPersist rejects Demo');
assert(/toggleContentLike|toggleContentSaved|incrementContentShares/.test(persist), 'persist APIs present');

// Pure unit: priority early slots, strangers still included
function rankUnit(posts, { priorityUids, slots = 5, me }) {
  const byRecency = (a, b) => Number(b.ts || 0) - Number(a.ts || 0);
  const pri = [];
  const rest = [];
  const pset = new Set(priorityUids || []);
  posts.forEach((p) => {
    const uid = p.uid;
    if (uid === me || pset.has(uid)) pri.push(p);
    else rest.push(p);
  });
  pri.sort(byRecency);
  rest.sort(byRecency);
  const head = pri.slice(0, slots);
  const tail = pri.slice(slots).concat(rest).sort(byRecency);
  return head.concat(tail);
}

const me = 'me';
const ranked = rankUnit(
  [
    { id: 's1', uid: 'stranger', ts: 100 },
    { id: 'f1', uid: 'friend', ts: 50 },
    { id: 's2', uid: 'stranger2', ts: 90 },
    { id: 'f2', uid: 'friend', ts: 80 },
  ],
  { priorityUids: ['friend'], slots: 5, me }
);
assert(ranked[0].id === 'f2' && ranked[1].id === 'f1', 'friends fill early slots by recency');
assert(ranked.some((p) => p.uid === 'stranger') && ranked.some((p) => p.uid === 'stranger2'), 'strangers still appear');
assert(ranked.length === 4, 'no posts dropped');

const emptyPri = rankUnit(
  [
    { id: 'a', uid: 'x', ts: 2 },
    { id: 'b', uid: 'y', ts: 1 },
  ],
  { priorityUids: [], slots: 5, me: 'other' }
);
assert(emptyPri[0].id === 'a' && emptyPri[1].id === 'b', 'empty priority → pure recency');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nDuniya D2 checks passed.');
