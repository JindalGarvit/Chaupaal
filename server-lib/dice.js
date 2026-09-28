/**
 * Fair dice for Live Dangal games (Ludo, Snakes & Ladders). Every Live roll comes from the server's
 * CSPRNG — uniform 1..6, no weighting, no pity rolls, no streak correction. Clients never roll in Live.
 * Tests may swap the source with setSource(); production never does.
 */
'use strict';

const crypto = require('crypto');

const defaultSource = () => crypto.randomInt(1, 7);
let source = defaultSource;

function rollDie() {
  const v = Number(source());
  if (!(v >= 1 && v <= 6 && Math.floor(v) === v)) throw new Error('dice source returned ' + v);
  return v;
}

/** Test hook: a function returning 1..6, or null to restore the CSPRNG. */
function setSource(fn) {
  source = typeof fn === 'function' ? fn : defaultSource;
}

/** Face counts for a list of rolls → { counts: [c1..c6], total } */
function tally(rolls) {
  const counts = [0, 0, 0, 0, 0, 0];
  (rolls || []).forEach((v) => {
    const n = Number(v);
    if (n >= 1 && n <= 6) counts[n - 1] += 1;
  });
  return { counts, total: counts.reduce((a, b) => a + b, 0) };
}

/** Pearson chi-square vs a fair die (5 degrees of freedom; > 20.5 is p < 0.001). */
function chiSquare(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  const e = total / 6;
  return counts.reduce((s, c) => s + ((c - e) * (c - e)) / e, 0);
}

module.exports = { rollDie, setSource, tally, chiSquare };
