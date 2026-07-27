/**
 * Regression: friend-discovery + pro picklist must HTML-escape attacker-controlled
 * profile / industryStats fields before innerHTML (stored XSS).
 */
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

test('escapes img onerror payload in display names', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const out = escapeHtmlText(payload);
  assert.equal(out.includes('<img'), false);
  assert.equal(out.includes('onerror'), true); // text retained
  assert.ok(out.includes('&lt;img'));
});

test('escapes attribute breakout via photoURL', () => {
  const payload = 'https://evil.test/a.jpg" onerror="alert(1)';
  const out = escapeHtmlText(payload);
  assert.equal(out.includes('" onerror="'), false);
  assert.ok(out.includes('&quot;'));
});

test('friend discovery uses escDiscoverText for name/photo', () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/src/js/features/onboarding.js'), 'utf8');
  const fnStart = src.indexOf('function renderFriendDiscovery');
  assert.ok(fnStart >= 0, 'renderFriendDiscovery missing');
  const slice = src.slice(fnStart, fnStart + 4500);
  assert.ok(slice.includes('escDiscoverText'), 'must escape discovery fields');
  assert.ok(slice.includes('safeDiscoverPhotoUrl'), 'must validate photoURL protocol');
  assert.equal(
    /discover-name\}>\$\{u\.name/.test(slice),
    false,
    'must not interpolate raw u.name into discover-name'
  );
  assert.equal(
    /src="\$\{u\.photoURL\}"/.test(slice),
    false,
    'must not interpolate raw u.photoURL into img src'
  );
});

test('pro picklist escapes industry/purpose labels', () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/src/js/auth/auth-events.js'), 'utf8');
  const fnStart = src.indexOf('function renderPicklist');
  assert.ok(fnStart >= 0, 'renderPicklist missing');
  const slice = src.slice(fnStart, fnStart + 2000);
  assert.ok(slice.includes('escAuthHtml'), 'must escape picklist labels');
  assert.equal(
    /\$\{it\.label\}/.test(slice),
    false,
    'must not interpolate raw it.label into picklist HTML'
  );
});

console.log('All XSS escape regression checks passed.');
