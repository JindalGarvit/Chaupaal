/**
 * Duniya D0 — SAMPLE/cache honesty, Demo chrome, no fake Prasidha trending.
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
const deep = read('public/src/js/core/deeplinks.js');

assert(/let duniyaPosts\s*=\s*\[\s*\]/.test(duniya), 'boot starts empty (no SAMPLE flash)');
assert(/chaupaal_duniya_feed_cache_v1/.test(duniya), 'offline cache key');
assert(/writeDuniyaFeedCache/.test(duniya) && /readDuniyaFeedCache/.test(duniya), 'cache read/write');
assert(/Clear SAMPLE from memory|clear SAMPLE|duniyaPosts=mapped/.test(duniya), 'live load clears samples');
assert(/Showing demo while feed is unavailable/.test(duniya), 'signed-in demo banner (no Sign in)');
assert(/data-duniya-demo-retry/.test(duniya), 'Retry CTA for signed-in demo/offline');
assert(/Preview demo/.test(duniya), 'empty-first with Preview demo');
assert(/Offline · last updated/.test(duniya), 'offline cache banner');
assert(/ForBiggerEscapes\.mp4|gtv-videos-bucket/.test(duniya), 'sample video has real media');
assert(/media:null/.test(duniya) === false || !/id:'d3'[\s\S]{0,200}media:null/.test(duniya), 'd3 not null media');
assert(/toastDuniyaDemo|Demo — not saved/.test(duniya), 'Demo action toast');
assert(/duniyaIsDemoPost\(p\)/.test(duniya) && /toastDuniyaDemo\(\)/.test(duniya), 'like/save demo short-circuit');
assert(/never masonry SAMPLE|real posts only until D4|!duniyaIsDemoPost/.test(duniya), 'Prasidha excludes samples');
assert(/Prasidha is warming up/.test(duniya), 'Prasidha honest empty');
assert(/lehar-slide--demo|Sample · /.test(duniya), 'Lehar Demo labeling');
assert(/content\.isSample \|\| content\.isDemo/.test(persist), 'canPersist rejects samples');
assert(/Demo sample — not a live post/.test(deep), 'sample deeplink honesty');
assert(/\^d\[1-5\]\$/.test(deep) || /d\[1-5\]/.test(deep), 'sample id soft-fail');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nDuniya D0 checks passed.');
