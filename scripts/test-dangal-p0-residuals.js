/**
 * Dangal P0 — residuals + honesty sweep.
 *  (a) every roster game: registered with a launch, identity + mark, how-to tips, graduation tag,
 *      and a plain rule-source line (shown in prepare + How to)
 *  (b) honesty: no "official", no federation-name labels ("BWF-lite"), no "players online" counts,
 *      no brand names for look-alike games, bots labelled as bots, Practice AI never a human name
 *  (c) no retired ids outside the retired / alias lists; no dead duplicate how-to keys
 *  (d) graduation tags match capability; api count
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const win = {};
vm.runInNewContext(read('public/src/js/dangal/dangal-graduation.js'), { window: win, console, localStorage: { getItem: () => null }, navigator: { languages: ['en-US'] }, Intl });
const ROSTER = win.DANGAL_ROSTER_IDS;
assert(ROSTER.length === 25, 'roster has 25 titles');

// design-system in a tiny sandbox (identity, marks, rule sources)
const dsWin = { GAME_LABELS: {} };
vm.runInNewContext(read('public/src/js/dangal/design-system.js'), { window: dsWin, document: { documentElement: { style: { setProperty() {} } }, querySelectorAll: () => [] }, console });

const gamesDir = path.join(root, 'public/src/js/games');
const gameSrc = fs
  .readdirSync(gamesDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => read('public/src/js/games/' + f))
  .join('\n');
const gameUi = read('public/src/js/games/game-ui.js');
const coachBlock = gameUi.slice(gameUi.indexOf('const COACH_TIPS = {'), gameUi.indexOf('};', gameUi.indexOf('const COACH_TIPS = {')));

// ---------- (a) per game ----------
ROSTER.forEach((id) => {
  const registered = new RegExp(`id:\\s*'${id}'[\\s\\S]{0,1500}?launch`).test(gameSrc);
  const ident = dsWin.getGameIdentity(id);
  const tips = new RegExp(`\\n\\s*${id}:\\s*\\[`).test(coachBlock);
  const grad = win.DANGAL_GRADUATION[id];
  const rule = dsWin.federationHonestyLine(id);
  const missing = [
    !registered && 'launch',
    !(ident && ident.label && ident.mark) && 'identity',
    !tips && 'how-to',
    !grad && 'graduation',
    !rule && 'rule source',
  ].filter(Boolean);
  assert(missing.length === 0, id + ': launch + identity + how-to + graduation + rule source' + (missing.length ? ' — missing ' + missing.join(', ') : ''));
});
assert(/federationHonestyLine\(o\.gameId\)/.test(gameUi), 'How to sheets lead with the rule-source line');
assert(/federationHonestyHtml\(gameId\)/.test(read('public/src/js/games/game-registry.js')), 'prepare sheet shows the rule-source line');
const kakuroAlias = dsWin.federationHonestyLine('kakuro');
assert(!kakuroAlias || /Kakuro/.test(kakuroAlias), 'aliases resolve to the same rule source');

// ---------- (b) honesty ----------
const surfaces = [
  'public/src/js/dangal', 'public/src/js/games', 'public/src/styles/dangal.css',
  'public/src/js/features/dangal.js', 'public/src/js/features/dangal-ratings.js',
];
function collect(rel) {
  const abs = path.join(root, rel);
  if (fs.statSync(abs).isFile()) return [rel];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((d) => {
    const r = path.join(rel, d.name);
    if (d.isDirectory()) return d.name === 'data' ? [] : collect(r);
    return /\.(js|css)$/.test(d.name) ? [r] : [];
  });
}
const files = surfaces.flatMap(collect);
const banned = [
  [/\bofficial\b/i, '"official"'],
  [/players online|online now|people playing now/i, 'online counts'],
  [/BWF-lite|FIDE-lite|ICC-lite|FIFA-lite/, 'federation-name labels'],
  [/\bFIFA\b|\bBCCI\b|\bIPL\b|\bNBA\b|\bNFL\b/, 'league / federation brands'],
  [/\bUNO\b|Mattel|Hasbro|Codenames|Wordle|Pictionary|Scrabble/, 'look-alike brand names'],
];
const hits = [];
files.forEach((rel) => {
  const src = stripComments(read(rel));
  banned.forEach(([re, label]) => {
    if (re.test(src)) hits.push(label + ' in ' + rel);
  });
});
assert(hits.length === 0, 'no banned claim / brand strings in Dangal surfaces' + (hits.length ? ' — ' + hits.join('; ') : ''));
const fedMentions = files.filter((rel) => /\b(FIDE|BWF|IFAB)\b/.test(stripComments(read(rel))));
assert(fedMentions.every((rel) => /(design-system|dangal-rules)\.js$/.test(rel)), 'federation names appear only in the plain rule-source attribution');
const rules = read('public/src/js/dangal/design-system.js');
assert(/Rules based on the FIDE Laws of Chess/.test(rules) && /Simplified rules based on the BWF Laws of Badminton/.test(rules), 'rule sources use plain attribution ("Rules based on …", "Simplified …")');
assert(!/<image|xlink:href|\.png|\.jpg/.test(rules.slice(0, rules.indexOf('const GAME_IDENTITY'))), 'R4 marks are our own inline vector marks (no embedded logos)');

const poker = read('public/src/js/games/poker.js');
assert(/name: '🤖 ' \+ names\[i - 1\]/.test(poker), 'Poker practice bots are labelled as bots');
assert(/tr\('ai', 'AI'\)/.test(read('public/src/js/games/penalty.js')), 'Penalty vs AI opponent is labelled AI');
const dangal = read('public/src/js/features/dangal.js');
assert(/practiceAiName = 'Practice AI'/.test(dangal) && /simulated \? practiceAiName/.test(dangal), 'Quiz simulated opponents are Practice AI, never a human name');
assert(/name: tr\('bot', 'Bot'\) \+ ' ' \+ \+\+botN/.test(read('public/src/js/games/ludo-ui.js')), 'Ludo bot seats are labelled Bot');
assert(/Oh No!/.test(read('public/src/js/games/ohno-ui.js')) && !/\bUNO\b/.test(stripComments(read('public/src/js/games/ohno-ui.js'))), 'shedding-card game ships as "Oh No!"');

// ---------- (c) retired ids + dead keys ----------
const RETIRED = ['rushrunner', 'pickleball', 'tabletennis', 'fiveinrow', 'andarbaahar', 'andarbahar', 'sattepe', 'kabaddi', 'khokho', 'gullykick', 'patangbaazi', 'kitefight'];
const retiredHits = [];
files.concat(collect('server-lib')).forEach((rel) => {
  if (/dangal-graduation\.js$|dangal-economy\.js$/.test(rel)) return;
  if (/server-lib/.test(rel) && !/dangal|game-of-day|party|poker|penalty/.test(rel)) return;
  const src = read(rel);
  RETIRED.forEach((id) => {
    if (new RegExp(`\\b${id}\\b`, 'i').test(src)) retiredHits.push(id + ' in ' + rel);
  });
});
assert(retiredHits.length === 0, 'retired ids only in the retired / alias lists' + (retiredHits.length ? ' — ' + retiredHits.join('; ') : ''));
const coachKeys = (coachBlock.match(/\n\s{4}([a-z]+):\s*\[/g) || []).map((k) => k.trim().split(':')[0]);
const dupes = coachKeys.filter((k, i) => coachKeys.indexOf(k) !== i);
assert(dupes.length === 0, 'no duplicate (dead) how-to keys' + (dupes.length ? ' — ' + dupes.join(',') : ''));

// ---------- (d) graduation vs capability ----------
const party = ROSTER.filter((id) => win.DANGAL_GRADUATION[id].grade === 'party');
assert(party.sort().join() === 'charades,imposter,mostlikely,rajamantri,werewolf', 'Party tag = the five party-kit titles');
const solos = ROSTER.filter((id) => win.DANGAL_GRADUATION[id].sync === 'none');
assert(solos.sort().join() === 'ankjod,brickbreaker,tiptap,wordguess' && solos.every((id) => !win.DANGAL_GRADUATION[id].stakes), 'Solo tag = the four solos, never stakes');
const live = ROSTER.filter((id) => win.DANGAL_GRADUATION[id].grade === 'live');
assert(live.every((id) => /live1v1|liveParty/.test(win.DANGAL_GRADUATION[id].sync)), 'every Live tag names its sync (Live 1v1 / Live party)');
const reg = read('public/src/js/games/game-registry.js');
assert(/if \(info\.sync === 'live1v1'\) next\.liveDuel = true;/.test(reg) && /info\.sync === 'liveParty'[\s\S]{0,120}next\.liveDuel = true/.test(reg), 'registerGame derives Live capability from the graduation tag (no stale descriptor flags)');
assert(live.every((id) => win.isLiveCapable ? win.isLiveCapable(id) : true), 'Live-tagged titles report live-capable');
const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, 'api/*.js = ' + apiCount);
assert(/test-dangal-p0-residuals\.js/.test(read('package.json')), 'package.json runs P0');

console.log('\nDangal P0 residuals + honesty checks passed.');
