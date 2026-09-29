#!/usr/bin/env node
/**
 * Brick Breaker level validator (Dangal P14).
 *
 *   node scripts/gen-brick-levels.js    → scripts/data/brick-validation.json
 *
 * Levels 1–30 are handcrafted (BrickEngine.HANDCRAFTED); 31–60 are generated from fixed seeds
 * (BrickEngine.layoutFor). Each must (a) pass reachability — every breakable brick connects to the
 * open space below — and (b) be cleared by the tracking bot within CAP_SECONDS of simulated play.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const B = require('../public/src/js/games/brick-engine.js');

const CAP_SECONDS = 300;

function validateLevel(n) {
  const rows = B.layoutFor(n);
  const reach = B.layoutOk(rows);
  const bot = B.botPlay(rows, { level: n, seed: n * 7919, capSeconds: CAP_SECONDS });
  return { n, rows, reach, cleared: bot.cleared, seconds: bot.seconds, livesLost: bot.livesLost, bricks: B.breakableCount(rows), maxPoints: B.maxPoints(rows) };
}

function main() {
  const t0 = Date.now();
  const out = [];
  for (let n = 1; n <= B.CAMPAIGN_COUNT; n++) {
    const v = validateLevel(n);
    out.push(v);
    if (!v.reach || !v.cleared) console.log('  FAIL', n, v.rows.join(' '), v);
  }
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'data/brick-validation.json'), JSON.stringify({ capSeconds: CAP_SECONDS, levels: out }));
  const ok = out.filter((v) => v.reach && v.cleared).length;
  const secs = out.map((v) => v.seconds);
  console.log(`Brick Breaker: ${ok}/${out.length} levels valid · bot clear ${Math.min(...secs)}–${Math.max(...secs)} s (median ${secs.slice().sort((a, b) => a - b)[Math.floor(secs.length / 2)]}) · ${Math.round((Date.now() - t0) / 1000)} s`);
}

if (require.main === module) main();
module.exports = { validateLevel, CAP_SECONDS };
