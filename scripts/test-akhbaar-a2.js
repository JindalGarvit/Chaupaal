/**
 * Akhbaar A2 — Surkhiya digest-only + Saathi wired primary actions.
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

const modes = read('public/src/js/core/section-modes.js');
const akhbaar = read('public/src/js/features/akhbaar.js');
const firstRun = read('public/src/js/core/first-run.js');
const conventions = read('CONVENTIONS.md');

assert(/Jump to Khabar|surkhiya_jump_khabar/.test(modes), 'Jump to Khabar CTA');
assert(/Open in Khabar|surkhiya_open_khabar/.test(modes), 'digest Open in Khabar');
assert(/data-surkhiya-open-khabar/.test(modes), 'Open in Khabar control');
assert(/Highlights|Also worth a look|More picks/.test(modes), 'honest band labels');
assert(!/surkhiya_band_today',\s*'Today'/.test(modes), 'no fake calendar Today label');
assert(/band === 'highlights'|band = .*highlights/.test(modes), 'priority bands not date-named');
assert(/Read the digest|surkhiya_digest_sub/.test(modes), 'digest-only framing');
assert(/openBaithakWithWish/.test(modes), 'Surkhiya wish uses Baithak wish');
assert(/wireSaathiFeed|activateSaathiItem/.test(modes), 'Saathi click wiring');
assert(/action:\s*'wish'/.test(modes) && /action:\s*'play'/.test(modes), 'Saathi action map wish|play');
assert(/jumpToAkhbaarKhabar/.test(modes) && /jumpToAkhbaarKhabar/.test(akhbaar), 'jump helper shared');
assert(/focusAkhbaarQuestionAt/.test(akhbaar), 'Khabar focus scroll');
assert(/isSample \|\| q\.isDemo/.test(modes) && /signedIn/.test(modes), 'no SAMPLE pad when signed-in');
assert(/Find friends|saathi_find_friends/.test(modes), 'empty Find friends');
assert(/Digest · Jump to play/.test(firstRun), 'Surkhiya room job digest');
assert(!/% of players/.test(modes), 'no fake proof % on rooms');
assert(/Akhbaar A2/.test(conventions), 'CONVENTIONS documents A2');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nAkhbaar A2 checks passed.');
