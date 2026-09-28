/**
 * Dangal P5: build the encoded Shabd Five answer schedule.
 *
 * Source of truth (not served): scripts/data/shabd-answers-source.json — curated common words.
 * Output (served): public/src/js/games/data/shabd-answers.js → SHABD_ANSWERS_ENC, a shuffled
 * schedule encoded by ShabdCore.encodeSchedule, so no answer or day mapping ships in plain text.
 * Gloss keys are rewritten to ShabdCore.wordHash() for the same reason.
 *
 * Usage: node scripts/build-shabd-answers.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Core = require('../public/src/js/games/shabd-core.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'data', 'shabd-answers-source.json');
const OUT = path.join(ROOT, 'public', 'src', 'js', 'games', 'data', 'shabd-answers.js');
const GLOSS = path.join(ROOT, 'public', 'src', 'js', 'games', 'data', 'shabd-gloss.js');
const ALLOWED = path.join(ROOT, 'public', 'src', 'js', 'games', 'data', 'shabd-allowed.js');

/** Offensive, crude, sensitive, proper nouns, regional-only, variant spellings, jargon. */
const DENY = new Set(
  (
    'BAWDY BOOTY BOOZE BOOZY BOSOM BUTCH FANNY GYPSY IDIOT KINKY MORON NYMPH QUEER RALPH RANDY ROGER HOMER ' +
    'HARRY BILLY BOBBY DUTCH WELSH SALLY TRUMP MAMMY OPIUM VOMIT MUCUS BOWEL TUMOR ULCER OBESE HUNKY HIPPY ' +
    'GIRLY SPANK THONG LUSTY BIBLE MECCA RABBI SWAMI PAGAN CHINA MAFIA BIDDY NINNY DUNCE PENAL KNEED BUSED ' +
    'BONEY PINEY NOSEY APING ABLED INTER OUTGO DILLY TODDY PANSY MISSY RUPEE KAPPA SIGMA MAMMA FELLA SEWER ' +
    'DYING CURSE DEVIL DEMON WITCH COVEN FELON ARSON ABUSE CYNIC GODLY KHAKI VODKA LAGER BETEL CACAO IONIC ' +
    'CONIC MODAL LUMEN LIPID BASAL NASAL AORTA OVARY BICEP ANODE OXIDE HYDRO MACRO MICRO EMCEE AUNTY MATEY ' +
    'DOPEY BUTTE COUPE REVUE CUMIN PENNE GUMBO RAMEN MAMBO RUMBA HOWDY GOLLY CUTIE BITTY BATTY CATTY RATTY ' +
    'TATTY DICEY PORKY TIPSY SEXED GAYER BOOBS ODDER RARER FREER BLUER PALER NICER SAFER WISER WIDER NEWER ' +
    'FINER FEWER'
  ).split(/\s+/)
);

function loadCurrentPlain() {
  const raw = fs.readFileSync(OUT, 'utf8');
  const m = raw.match(/SHABD_ANSWERS=(\[[\s\S]*?\]);/);
  if (!m) throw new Error('No plain SHABD_ANSWERS found and no source file — cannot bootstrap');
  return JSON.parse(m[1]);
}

function allowedSet() {
  const raw = fs.readFileSync(ALLOWED, 'utf8');
  const m = raw.match(/SHABD_ALLOWED_RAW="([\s\S]*?)"/);
  return new Set((m ? m[1] : '').split('\\n').map((w) => w.trim().toUpperCase()).filter((w) => w.length === 5));
}

function main() {
  let source;
  if (fs.existsSync(SRC)) source = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  else {
    source = loadCurrentPlain();
    fs.mkdirSync(path.dirname(SRC), { recursive: true });
  }
  const allowed = allowedSet();
  const seen = new Set();
  const curated = [];
  source.forEach((w) => {
    const u = Core.norm(w);
    if (!Core.isWord(u) || seen.has(u) || DENY.has(u)) return;
    // No plural-by-S answers (BOOKS, CARDS); words that merely end in S (GLASS, BONUS, CHAOS) stay.
    if (/S$/.test(u) && !/(SS|US|IS|OS)$/.test(u)) return;
    seen.add(u);
    curated.push(u);
  });
  curated.sort();
  fs.writeFileSync(SRC, JSON.stringify(curated, null, 0).replace(/","/g, '",\n"') + '\n');

  const schedule = Core.shuffleSchedule(curated);
  const enc = Core.encodeSchedule(schedule);
  const check = Core.decodeSchedule(enc);
  if (check.join() !== schedule.join()) throw new Error('schedule round-trip failed');
  const missing = curated.filter((w) => !allowed.has(w));

  fs.writeFileSync(
    OUT,
    '// Shabd Five answer schedule — encoded (ShabdCore.decodeSchedule). Built by scripts/build-shabd-answers.js.\n' +
      '(function(g){g.SHABD_ANSWERS_ENC="' +
      enc +
      '";})(typeof window!=="undefined"?window:typeof globalThis!=="undefined"?globalThis:this);\n'
  );

  const graw = fs.readFileSync(GLOSS, 'utf8');
  const gm = graw.match(/SHABD_GLOSS=(\{[\s\S]*?\});/);
  let glossCount = 0;
  if (gm) {
    const map = JSON.parse(gm[1]);
    const out = {};
    Object.keys(map).forEach((k) => {
      if (/^[A-Z]{5}$/.test(k)) out[Core.wordHash(k)] = map[k];
      else out[k] = map[k];
    });
    glossCount = Object.keys(out).length;
    fs.writeFileSync(
      GLOSS,
      '// Shabd Five gloss lines, keyed by ShabdCore.wordHash(word) so the file lists no answers.\n' +
        '(function(g){g.SHABD_GLOSS=' +
        JSON.stringify(out) +
        ';})(typeof window!=="undefined"?window:typeof globalThis!=="undefined"?globalThis:this);\n'
    );
  }
  console.log(JSON.stringify({ answers: curated.length, allowed: allowed.size, missingFromAllowed: missing.length, gloss: glossCount }));
}

main();
