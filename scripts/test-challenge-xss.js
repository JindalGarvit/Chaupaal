/**
 * Regression: viral challenge deep links (?challenge=…&score=…&game=…) must
 * HTML-escape URL params before innerHTML (reflected XSS).
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function escapeHtmlText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('escapes img onerror payload in challenge names', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const out = escapeHtmlText(payload);
  assert.equal(out.includes('<img'), false);
  assert.ok(out.includes('&lt;img'));
});

test('checkViralLink escapes challenger/score/game before innerHTML', () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/src/js/features/onboarding.js'), 'utf8');
  const fnStart = src.indexOf('function checkViralLink');
  assert.ok(fnStart >= 0, 'checkViralLink missing');
  const slice = src.slice(fnStart, fnStart + 3500);
  assert.ok(slice.includes('escChallengeHtml'), 'must escape challenge fields');
  assert.equal(
    /\$\{decodeURIComponent\(challenger\)\}/.test(slice),
    false,
    'must not interpolate raw decodeURIComponent(challenger) into HTML'
  );
  assert.equal(
    /of \$\{target\}/.test(slice),
    false,
    'must not interpolate raw score/target into HTML'
  );
});

test('akhbaar beat banner escapes pending.challenger', () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/src/js/features/akhbaar.js'), 'utf8');
  const fnStart = src.indexOf('function applyAkhbaarBeatBanner');
  assert.ok(fnStart >= 0, 'applyAkhbaarBeatBanner missing');
  const slice = src.slice(fnStart, fnStart + 2000);
  assert.ok(/esc\(/.test(slice) || slice.includes('escapeHtmlText'), 'must escape challenger');
  assert.equal(
    /\$\{pending\.challenger\}/.test(slice),
    false,
    'must not interpolate raw pending.challenger into HTML'
  );
});

test('dangal challenge chip escapes pending.challenger and game name', () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/src/js/features/dangal-ratings.js'), 'utf8');
  const fnStart = src.indexOf('function renderDangalContinueAndChips');
  assert.ok(fnStart >= 0, 'renderDangalContinueAndChips missing');
  const slice = src.slice(fnStart, fnStart + 2500);
  assert.ok(slice.includes('esc(') || slice.includes('escapeHtmlText'), 'must escape chip fields');
  assert.equal(
    /\$\{pending\.challenger\}/.test(slice),
    false,
    'must not interpolate raw pending.challenger into chip HTML'
  );
});

console.log('All challenge XSS regression checks passed.');
