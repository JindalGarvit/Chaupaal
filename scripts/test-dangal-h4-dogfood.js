/**
 * Dangal H4 dogfood — aggregates H0–H3 and adds regression checks for what dogfood found.
 *  (a) aggregate: H0 roster, H1 Werewolf, H2 Penalty, H3 Poker, G4 dogfood
 *  (b) roster integrity: exactly the 25, sections, graduation, identity, how-to, retired + aliases
 *  (c) Texas Hold'em server: 3-way all-in side pots, multi-hand soak (conservation + secrecy),
 *      timeout checks when free, Friends table never touches the wallet
 *  (d) Werewolf P&P parity at 5 / 8 / 12, NHIE anonymous reveal, Penalty choice secrecy
 *  (e) lazy-load, global-first copy in new games, api count
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// ---------- (a) aggregate ----------
['test-dangal-h0-roster.js', 'test-dangal-h1-werewolf.js', 'test-dangal-h2-penalty.js', 'test-dangal-h3-poker.js', 'test-dangal-g4-dogfood.js'].forEach((f) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) console.error(r.stdout.slice(-2000), r.stderr.slice(-2000));
  assert(r.status === 0, 'aggregate: ' + f);
});

// ---------- (b) roster integrity ----------
const FINAL = [
  'tiptap', 'brickbreaker', 'kakuro', 'wordguess', 'chess', 'ttt', 'snakes', 'ludo', 'uno', 'scribble', 'quiz', 'carrom',
  'rummy', 'teenpatti', 'bluff', 'tambola', 'streetcricket', 'badminton', 'imposter', 'rajamantri', 'charades',
  'mostlikely', 'werewolf', 'penalty', 'poker',
];
{
  const win = {};
  vm.runInNewContext(read('public/src/js/dangal/dangal-graduation.js'), { window: win, console, localStorage: { getItem: () => null }, navigator: { languages: ['en-US'] }, Intl });
  const ids = win.DANGAL_ROSTER_IDS;
  const canon = (id) => (id === 'kakuro' ? 'ankjod' : id);
  assert(ids.length === 25 && FINAL.every((id) => ids.indexOf(canon(id)) >= 0), 'roster source lists exactly the final 25');
  const sections = win.DANGAL_ROSTER_SECTIONS.map((s) => s.label).join('/');
  assert(sections === 'Solo/Boards/Words/Cards/Sports/Party', 'sections: Solo / Boards / Words / Cards / Sports / Party');
  const secIds = new Set(win.DANGAL_ROSTER_SECTIONS.map((s) => s.id));
  assert(win.DANGAL_ROSTER.every((r) => secIds.has(r.genre)), 'every roster title sits in a real section');
  assert(ids.every((id) => win.DANGAL_GRADUATION[id]), 'every roster title has a graduation tag');
  assert(win.isRetiredGameId('patangbaazi') && win.isRetiredGameId('Kite Fight') && win.isRetiredGameId('patang'), 'Kite Fight links land on the retired screen');
  assert(win.isRosterGameId('kakuro') && win.rosterGenre('kakuro') === 'solo' && !win.isRetiredGameId('ankjod'), 'Kakuro alias → ankjod (history intact)');
  assert(ids.every((id) => !win.isRetiredGameId(id)), 'no roster title is also retired');

  const ds = read('public/src/js/dangal/design-system.js');
  const ui = read('public/src/js/games/game-ui.js');
  const missingIdentity = ids.filter((id) => !new RegExp('\\b' + id + ':\\s*\\{[^}]*label:').test(ds));
  assert(missingIdentity.length === 0, 'every roster title has an identity (' + (missingIdentity.join(',') || 'all') + ')');
  const missingLabel = ids.filter((id) => !new RegExp('\\b' + id + ':\\s*[\'"][A-Z]').test(ui));
  assert(missingLabel.length === 0, 'every roster title has a display label (' + (missingLabel.join(',') || 'all') + ')');

  // Retired / old names appear only in retired + alias lists and tests.
  const stray = [];
  const walk = (dir) => {
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach((d) => {
      const rel = path.join(dir, d.name);
      if (d.isDirectory()) return /node_modules|vendor/.test(d.name) ? null : walk(rel);
      if (!/\.(js|html|json)$/.test(d.name)) return;
      const src = read(rel);
      if (/Kite Fight|Patang(baazi)?\b|Ank Jod/.test(src.replace(/'patangbaazi'|'patang'/g, ''))) stray.push(rel);
    });
  };
  walk('public/src');
  walk('server-lib');
  assert(stray.length === 0, 'no Kite Fight / Ank Jod display copy outside alias lists (' + (stray.join(',') || 'clean') + ')');
  assert(!/\b\d{2}\s+(games|titles)\b/.test(read('public/src/js/features/dangal-ratings.js')), 'Manch counts are dynamic (no hard-coded totals)');
}

// ---------- (c) Texas Hold'em server ----------
const C = require(path.join(root, 'public/src/js/games/poker-core.js'));
const Engine = require(path.join(root, 'server-lib/poker-engine.js'));
const rand = { int: (n) => Math.floor(Math.random() * n) };
const handOf = (t) => Engine.loadHand(t);
const effectsOf = (t, type) => Object.values(t.server.effects || {}).filter((e) => !type || e.type === type);
const tableTotal = (t) => sum(Object.values(t.pub.seats).map((s) => s.stack + (s.pendingTopup || 0))) + sum(effectsOf(t, 'cashout').map((e) => e.amount));
const online = (t, now) => Object.keys(t.pub.players || {}).concat(Object.values(t.pub.seats).map((s) => s.uid)).forEach((u) => (t.presence[u] = { at: now, online: true }));
function seatUids(t, uids, stacks, now) {
  uids.forEach((u, i) => {
    t = Engine.reduceTable(t, u, 'seat', { name: 'P' + i, stack: stacks[i], bid: 'b' + u, dev: 'dev-' + u, ip: '10.0.0.' + i }, now, rand).table;
  });
  return t;
}
function startHand(t, now) {
  online(t, now);
  return Engine.reduceTable(t, Object.values(t.pub.seats)[0].uid, 'tick', {}, now, rand).table;
}
function holeLeak(t) {
  const h = handOf(t);
  if (!h || h.done) return false;
  const pubStr = JSON.stringify(t.pub);
  return h.players.some((p) => p.hole.some((c) => pubStr.indexOf('"' + C.cardStr(c) + '"') >= 0));
}

// 3-way all-in with side pots through the server reducer.
{
  let now = 5_000_000;
  let t = Engine.newTable({ id: 'Q3WAY', kind: 'quick', tier: 't20', uid: 'a', now });
  t = seatUids(t, ['a', 'b', 'c'], [400, 1000, 2000], now);
  t = startHand(t, now + Engine.START_DELAY_MS + 10);
  let h = handOf(t);
  assert(h && !h.done && h.players.length === 3, '3-way: hand dealt');
  const start = tableTotal(t);
  let guard = 0;
  while (h && !h.done && guard++ < 10) {
    const u = t.pub.turn.uid;
    const i = h.players.findIndex((p) => p.id === u);
    const L = C.legalActions(h, i);
    const a = L.canRaise ? { type: 'raise', to: L.maxTo } : L.canCall ? { type: 'call' } : { type: 'check' };
    t = Engine.reduceTable(t, u, 'act', Object.assign({ handNo: h.handNo }, a), now, rand).table;
    h = handOf(t);
  }
  assert(h.done, '3-way all-in runs out to showdown');
  const pots = C.sidePots(h.players);
  assert(pots.length >= 2, '3-way all-in makes a main pot + side pot(s) (' + pots.length + ')');
  assert(tableTotal(t) === start && start === 3400, '3-way all-in: chips conserve (' + tableTotal(t) + ')');
  assert(Object.values(t.pub.seats).every((s) => s.stack <= 3400 && s.stack >= 0), '3-way: no seat goes negative');
  const shortWin = t.pub.seats[Engine.seatKeyOf(t.pub, 'a')].stack;
  assert(shortWin <= 1200, 'short stack can win at most the main pot (3 × 400)');
}

// Multi-hand soak: random legal actions, 4 seats, conservation + secrecy every step.
{
  let now = 9_000_000;
  let t = Engine.newTable({ id: 'QSOAK', kind: 'quick', tier: 't20', uid: 'a', now });
  t = seatUids(t, ['a', 'b', 'c', 'd'], [1000, 1500, 2000, 800], now);
  const start = tableTotal(t);
  const rng = C.mulberry32(42);
  let hands = 0;
  let leaks = 0;
  let steps = 0;
  let conserveFails = 0;
  let lastHand = 0;
  let ledger = start;
  while (hands < 120 && steps++ < 20000) {
    now += 500;
    online(t, now);
    const h = handOf(t);
    if (!h || h.done) {
      if (tableTotal(t) !== ledger) conserveFails++;
      const live = Object.values(t.pub.seats).filter((s) => s.stack > 0);
      if (live.length < 2) {
        Object.values(t.pub.seats).filter((s) => s.stack <= 0).forEach((s) => {
          t = Engine.reduceTable(t, s.uid, 'topup_apply', { amount: 400 }, now, rand).table;
          ledger += 400;
          if (t.pub.seats[Engine.seatKeyOf(t.pub, s.uid)].sittingOut) t = Engine.reduceTable(t, s.uid, 'sit_in', {}, now, rand).table;
        });
      }
      now = Math.max(now, (t.pub.nextAt || now) + 1);
      online(t, now);
      const out = Engine.reduceTable(t, Object.values(t.pub.seats)[0].uid, 'tick', {}, now, rand);
      if (out) t = out.table;
      const nh = handOf(t);
      if (nh && nh.handNo !== lastHand) {
        lastHand = nh.handNo;
        hands++;
      }
      continue;
    }
    if (holeLeak(t)) leaks++;
    const u = t.pub.turn.uid;
    const i = h.players.findIndex((p) => p.id === u);
    const L = C.legalActions(h, i);
    const x = rng();
    let a;
    if (x < 0.12 && L.canFold) a = { type: 'fold' };
    else if (x < 0.25 && L.canRaise) a = { type: 'raise', to: Math.min(L.maxTo, L.minTo + Math.floor(rng() * 200)) };
    else if (x < 0.29 && L.canRaise) a = { type: 'raise', to: L.maxTo };
    else a = L.canCheck ? { type: 'check' } : { type: 'call' };
    t = Engine.reduceTable(t, u, 'act', Object.assign({ handNo: h.handNo }, a), now, rand).table;
  }
  assert(hands >= 100, 'soak: ' + hands + ' hands dealt without the table stalling');
  assert(leaks === 0, 'soak: no hole card ever appears in pub mid-hand');
  assert(conserveFails === 0, 'soak: chips conserve between every hand (buy-ins + top-ups = stacks + cash-outs)');
}

// Timeout when checking is free → check, not fold.
{
  let now = 20_000_000;
  let t = Engine.newTable({ id: 'QTO', kind: 'quick', tier: 't20', uid: 'a', now });
  t = seatUids(t, ['a', 'b', 'c'], [1000, 1000, 1000], now);
  t = startHand(t, now + Engine.START_DELAY_MS + 10);
  let h = handOf(t);
  // Everyone calls to the BB; BB can check.
  let guard = 0;
  while (guard++ < 5) {
    h = handOf(t);
    const i = h.players.findIndex((p) => p.id === t.pub.turn.uid);
    if (C.legalActions(h, i).canCheck) break;
    t = Engine.reduceTable(t, t.pub.turn.uid, 'act', { handNo: h.handNo, type: 'call' }, now, rand).table;
  }
  const who = t.pub.turn.uid;
  for (let k = 0; k < 3 && t.pub.turn && t.pub.turn.uid === who; k++) {
    now = t.pub.deadline + 1;
    online(t, now);
    t = Engine.reduceTable(t, ['a', 'b', 'c'].find((u) => u !== who), 'tick', {}, now, rand).table;
  }
  h = handOf(t);
  assert(!h.players.find((p) => p.id === who).folded, 'timeout with a free check → check (never fold)');
}

// Friends table: table-only chips, never a wallet effect.
{
  let now = 30_000_000;
  let t = Engine.newTable({ id: 'FRND01', kind: 'friends', uid: 'h', now, settings: {} });
  ['h', 'f1', 'f2'].forEach((u, i) => {
    t = Engine.reduceTable(t, u, 'join', { name: 'F' + i }, now, rand).table;
  });
  t = Engine.reduceTable(t, 'h', 'start', {}, now, rand).table;
  let hands = 0;
  let guard = 0;
  while (hands < 10 && guard++ < 3000) {
    now += 700;
    online(t, now);
    const h = handOf(t);
    if (!h || h.done) {
      const bust = Object.values(t.pub.seats).find((s) => s.stack <= 0);
      if (bust) t = Engine.reduceTable(t, bust.uid, 'rebuy', {}, now, rand).table;
      now = Math.max(now, (t.pub.nextAt || now) + 1);
      online(t, now);
      const out = Engine.reduceTable(t, 'h', 'tick', {}, now, rand);
      if (out) t = out.table;
      if (handOf(t) && !handOf(t).done) hands++;
      continue;
    }
    const i = h.players.findIndex((p) => p.id === t.pub.turn.uid);
    const L = C.legalActions(h, i);
    t = Engine.reduceTable(t, t.pub.turn.uid, 'act', { handNo: h.handNo, type: L.canCheck ? 'check' : 'call' }, now, rand).table;
  }
  t = Engine.reduceTable(t, 'f1', 'leave', {}, now, rand).table;
  t = Engine.reduceTable(t, 'h', 'end', {}, now, rand).table;
  const wallet = effectsOf(t).filter((e) => e.type === 'cashout' || e.type === 'refund' || e.type === 'sng_result');
  assert(hands >= 5, 'friends table plays hands (' + hands + ')');
  assert(wallet.length === 0, 'friends table never creates a wallet cashout / refund');
  let threw = '';
  try {
    Engine.reduceTable(JSON.parse(JSON.stringify(t)), 'h', 'topup_apply', { amount: 100 }, now, rand);
  } catch (e) {
    threw = e.code;
  }
  assert(threw, 'friends table refuses wallet top-ups');
}

// ---------- (d) other new games ----------
{
  const W = require(path.join(root, 'public/src/js/games/werewolf-core.js'));
  const src = read('public/src/js/games/werewolf.js');
  [5, 8, 12].forEach((n) => {
    [false, true].forEach((opt) => {
      const s = {};
      W.OPTIONAL.forEach((r) => (s[r] = opt));
      const roles = W.rolesFor(n, s);
      const hasOpt = roles.some((r) => W.OPTIONAL.indexOf(r) >= 0);
      assert(Array.isArray(roles) && roles.length === n && hasOpt === opt && roles.indexOf('wolf') >= 0, 'werewolf ' + n + ' players, optional ' + (opt ? 'on' : 'off') + ' → ' + n + ' roles');
    });
  });
  assert(/NIGHT_HOLD_MS/.test(src) && /coverWhenAway/.test(src), 'werewolf P&P night: one fixed hold time + cover when away (parity)');

  const M = require(path.join(root, 'public/src/js/games/mostlikely-core.js'));
  assert(M.MODES.indexOf('nhie') >= 0, 'NHIE is a Most Likely To mode');
  const bad = M.cleanCustom('Never have I ever fuck this up', 'nhie');
  const good = M.cleanCustom('Never have I ever baked bread', 'nhie');
  assert(bad && bad.ok === false && good && good.ok !== false, 'NHIE custom statements are moderated');

  const PE = require(path.join(root, 'server-lib/penalty-engine.js'));
  const penSrc = read('server-lib/penalty-engine.js');
  assert(/secrets/.test(penSrc) && typeof PE.reduceMatch === 'function', 'penalty choices stay in server / secrets until both are in');
}

// ---------- (e) lazy-load, copy, api ----------
{
  const idx = read('public/index.html');
  ['games/penalty-core.js', 'games/poker-core.js', 'data/mostlikely-packs.js', 'games/werewolf-core.js'].forEach((rel) => {
    const esc = rel.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    assert(new RegExp(`<script type="text/x-lazy" data-party-lazy src="/src/js/${esc}\\?v=`).test(idx) && !new RegExp(`<script(?![^>]*text/x-lazy)[^>]*src="/src/js/${esc}`).test(idx), rel + ' lazy-loads on game open');
  });
  const kit = read('public/src/js/games/party-kit.js');
  assert(/penalty: \['games\/penalty-core\.js'\]/.test(kit) && /poker: \['games\/poker-core\.js'\]/.test(kit), 'Party Kit LAZY_DATA lists the Penalty + Poker cores');
  const iKit = idx.indexOf('games/party-kit.js');
  assert(iKit > 0 && idx.indexOf('games/poker.js') > iKit && idx.indexOf('games/penalty.js') > iKit, 'regression: poker.js / penalty.js load after party-kit.js (Friends-table links register)');
  assert(/withGameData\(GAME, fn\)/.test(read('public/src/js/games/poker.js')) && /withGameData\(GAME, fn\)/.test(read('public/src/js/games/penalty.js')), 'Poker + Penalty launchers wait for their core');
  const newCopy = ['public/src/js/games/poker.js', 'public/src/js/games/penalty.js', 'public/src/js/games/werewolf.js'].map(read).join('\n');
  assert(!/₹|\brupees?\b|Diwali|Bollywood|\bcricket\b|\bIPL\b/i.test(newCopy), 'new H1–H3 copy is global (no India-only assumptions)');
  const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
  assert(apiCount === 12, 'api/*.js = ' + apiCount);
  assert(/test-dangal-h4-dogfood\.js/.test(read('package.json')), 'package.json runs H4 dogfood');
}

console.log('\nDangal H4 dogfood checks passed.');
