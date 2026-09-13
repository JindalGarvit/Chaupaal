/**
 * Growth G1 — OG helper + challenge URL shape (no network).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  escapeHtml,
  buildChallengeOg,
  isLikelyBot,
  genericCard,
} = require('../server-lib/og-preview');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

assert(escapeHtml('<script>') === '&lt;script&gt;', 'escapeHtml XSS');
assert(isLikelyBot('WhatsApp/2.0'), 'WhatsApp is bot');
assert(isLikelyBot('Mozilla/5.0 (iPhone)') === false, 'iPhone not bot');

const card = buildChallengeOg('https://example.com', 'quiz', {
  name: 'Ada',
  score: '12',
  cat: 'GK',
});
assert(/Beat Ada/.test(card.title), 'challenge title');
assert(card.url.includes('/challenge/quiz'), 'challenge path in og url');
assert(card.url.includes('score=12'), 'score in og url');

const gen = genericCard('https://example.com', '/profile/x');
assert(gen.title === 'Chaupaal', 'generic title');

const stories = fs.readFileSync(path.join(__dirname, '../api/stories.js'), 'utf8');
assert(/handleOgGet/.test(stories), 'stories owns OG GET');
assert(/req\.method === 'GET'/.test(stories), 'GET branch before POST auth');

const vercel = fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8');
assert(/og=1&kind=profile/.test(vercel), 'bot rewrite profile');
assert(/\/challenge\/\(\.\*\)/.test(vercel), 'challenge SPA rewrite');
assert(/user-agent/.test(vercel), 'UA has condition');

const beat = fs.readFileSync(path.join(__dirname, '../public/src/js/games/game-ui.js'), 'utf8');
assert(/\/challenge\//.test(beat), 'buildBeatScoreLink uses /challenge/');
assert(/openLeaderboardRankShare/.test(beat), 'rank share helper');
assert(/Share my rank/.test(beat), 'share my rank CTA');

const viral = fs.readFileSync(path.join(__dirname, '../public/src/js/features/onboarding.js'), 'utf8');
assert(/\/challenge\//.test(viral), 'checkViralLink path support');
assert(/params\.get\('name'\)\|\|params\.get\('challenge'\)/.test(viral), 'legacy dual-parse');

const deep = fs.readFileSync(path.join(__dirname, '../public/src/js/core/deeplinks.js'), 'utf8');
assert(/name: 'challenge'/.test(deep), 'challenge route');

const apiCount = fs.readdirSync(path.join(__dirname, '../api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nGrowth G1 checks passed.');
