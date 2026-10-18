/**
 * Akhbaar A4 — arc dogfood invariants (honesty locks stay wired).
 */
'use strict';

const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => require('./lib/i18n-source').withCopy(fs.readFileSync(path.join(root, p), 'utf8'));

const en = require('./lib/i18n-runtime').loadI18n({ region: false });
const modes = read('public/src/js/core/section-modes.js');
const akhbaar = read('public/src/js/features/akhbaar.js');
const streak = read('public/src/js/features/streak.js');
const conventions = read('CONVENTIONS.md');

assert(
  en.t('surkhiya_band_today') === 'Highlights' &&
    en.t('surkhiya_band_week') === 'Also worth a look' &&
    en.t('surkhiya_band_month') === 'More picks',
  'i18n Surkhiya bands honest (not Today/This week)'
);
assert(en.t('surkhiya_band_today') !== 'Today', 'no calendar Today band label in i18n');
assert(/Jump to Khabar|surkhiya_jump_khabar/.test(modes), 'Surkhiya Jump to Khabar');
assert(/wireSaathiFeed|activateSaathiItem/.test(modes), 'Saathi wired');
assert(/saveStreak\(\{requireLive:true\}\)/.test(akhbaar), 'finish-set live streak');
assert(/AKHBAAR_PROOF_MIN_N\s*=\s*10/.test(akhbaar), 'proof N=10');
assert(/openAkhbaarFlagSheet|reportAkhbaarQuestion/.test(read('public/src/js/core/safety.js')), 'flag real write');
assert(/days in a row/.test(streak) && !/top players/i.test(streak), 'milestone honest');
assert(/prefers-reduced-motion/.test(akhbaar) || /prefers-reduced-motion/.test(read('public/src/styles/akhbaar.css')), 'reduced-motion reel polish');
assert(/Akhbaar A3/.test(conventions) && /Akhbaar A2/.test(conventions), 'A0–A3 documented');
assert(/Akhbaar A4|arc dogfood|arc complete/i.test(conventions), 'CONVENTIONS documents A4');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

['test-akhbaar-a0.js', 'test-akhbaar-a1.js', 'test-akhbaar-a2.js', 'test-akhbaar-a3.js'].forEach((f) => {
  assert(fs.existsSync(path.join(root, 'scripts', f)), `${f} exists`);
});

console.log('\nAkhbaar A4 dogfood checks passed.');
