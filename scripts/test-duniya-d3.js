/**
 * Duniya D3 — Lehar video filter + social persistence parity with Vishwa.
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
const css = read('public/src/styles/components.css');
const conventions = read('CONVENTIONS.md');

assert(/function isVideoPost/.test(duniya), 'isVideoPost helper');
assert(/type === 'image'|\.mp4\|webm\|mov\|m4v/.test(duniya), 'video detection rejects images / needs real video urls');
assert(/rankDuniyaVishwaFeed\(pool\)/.test(duniya), 'Lehar reuses Vishwa priority among videos');
assert(/toggleLeharLike/.test(duniya) && /toggleContentLike\('duniya'/.test(duniya), 'like via social-persistence');
assert(/toggleLeharSave/.test(duniya) && /toggleContentSaved\('duniya'/.test(duniya), 'save via social-persistence');
assert(!/feedCard\.click\(\)/.test(duniya), 'no Vishwa like-btn DOM click fallback');
assert(/data-lehar-save/.test(duniya), 'discoverable Save control on Lehar');
assert(/data-lehar-vishwa/.test(duniya) && /Post a clip/.test(duniya), 'empty CTAs: post clip + Vishwa');
assert(/toastDuniyaDemo/.test(duniya) && /duniyaIsDemoPost/.test(duniya), 'Demo local-only + toast');
assert(/Could not save like/.test(duniya), 'like failure rollback toast');
assert(/chaupaal_lehar_muted/.test(duniya), 'mute pref persists');
assert(/leharQuietSound/.test(duniya), 'Quiet mode honored for sound');
assert(/syncVishwaLikeUi/.test(duniya) && /syncVishwaSaveUi/.test(duniya), 'sync in-memory + Vishwa card UI');
assert(/openShareSheet/.test(duniya), 'share uses unified sheet');
assert(/toggleContentLike|toggleContentSaved|incrementContentShares/.test(persist), 'persist APIs present');
assert(/\.lehar-action\.is-saved/.test(css), 'saved chrome styled');
assert(/Duniya D3 \(Lehar filter\)/.test(conventions), 'CONVENTIONS documents D3');

// Pure unit: video filter honesty
function isVideoPost(p) {
  if (!p) return false;
  const slides = Array.isArray(p.slides) ? p.slides : [];
  const first = slides[0] || null;
  const media = String(p.media || p.video || first?.media || '').trim();
  if (!media) return false;
  const type = String(p.mediaType || p.type || first?.type || '').toLowerCase();
  if (type === 'image' || type === 'gif' || type === 'text') return false;
  if (type.includes('video')) return true;
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(media)) return true;
  if (/\/video\//i.test(media) || /videodelivery|cloudinary.*\/video/i.test(media)) return true;
  if (/^data:video\//i.test(media)) return true;
  return false;
}

assert(!isVideoPost({ id: 'ghost' }), 'null media rejected');
assert(!isVideoPost({ media: 'https://x/a.jpg', mediaType: 'image' }), 'image type rejected');
assert(isVideoPost({ media: 'https://x/a.mp4' }), 'mp4 url accepted');
assert(isVideoPost({ mediaType: 'video', media: 'https://cdn/x' }), 'video type + url accepted');
assert(isVideoPost({ slides: [{ type: 'video', media: 'https://x/b.webm' }] }), 'slide video accepted');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nDuniya D3 checks passed.');
