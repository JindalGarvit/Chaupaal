/**
 * Dangal G4 — dogfood (cull + Party Kit + 4 party games).
 *  (a) aggregate: G0–G3 suites still pass
 *  (b) lazy party data: index tags, manifest, wrapped launchers, withGameData defers / fails soft (vm)
 *  (c) privacy: pass covers + votes + peeks re-cover on blur / pagehide; watchers self-prune (vm);
 *      [hidden] wins inside Party Kit surfaces
 *  (d) regressions found while dogfooding (quiz sheet, Oh No label, Peepal nudges, retired links,
 *      challenge chip escaping, dead back selectors, null-safe meta, i18n raw keys, how-to hit area)
 *  (e) global-first: Imposter Mixed skips regional packs unless Hindi; no hard-coded Hinglish copy
 *  (f) api/*.js = 12
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

// ---------- (a) aggregate ----------
['test-dangal-g0-cull.js', 'test-dangal-g1-imposter.js', 'test-dangal-g2-party.js', 'test-dangal-g3-mostlikely.js'].forEach((f) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) {
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
  }
  assert(r.status === 0, `${f} passes`);
});

// ---------- (b) lazy party data ----------
const html = read('public/index.html');
const LAZY = {
  imposter: ['data/imposter-packs.js', 'games/imposter-core.js'],
  rajamantri: ['games/rajamantri-core.js'],
  charades: ['data/charades-packs.js', 'games/charades-core.js'],
  mostlikely: ['data/mostlikely-packs.js', 'games/mostlikely-core.js'],
  werewolf: ['games/werewolf-core.js'],
};
const kitSrc = read('public/src/js/games/party-kit.js');
Object.keys(LAZY).forEach((game) => {
  LAZY[game].forEach((rel) => {
    const esc = rel.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    assert(
      new RegExp(`<script type="text/x-lazy" data-party-lazy src="/src/js/${esc}\\?v=[^"]+"`).test(html),
      `${rel}: index tag is lazy + stamped`
    );
    assert(!new RegExp(`<script(?![^>]*text/x-lazy)[^>]*src="/src/js/${esc}`).test(html), `${rel}: never loaded eagerly`);
    assert(kitSrc.includes(`'${rel}'`), `${rel}: listed in Party Kit LAZY_DATA`);
  });
});
assert(/launchImposter = window\.PartyKit \? PartyKit\.withGameData\(GAME, openImposter\)/.test(read('public/src/js/games/imposter.js')), 'Imposter launcher waits for its data');
['rajamantri', 'charades', 'mostlikely', 'werewolf'].forEach((g) => {
  const src = read(`public/src/js/games/${g}.js`);
  assert(/const launch = window\.PartyKit \? PartyKit\.withGameData\(GAME, open\) : open;/.test(src), `${g} launcher waits for its data`);
  assert(/\blaunch,/.test(src), `${g} registers the wrapped launcher`);
});
assert(/s\.openRoom = withGameData\(game, s\.openRoom\)/.test(kitSrc), 'room links wait for game data too');

/** Minimal browser for running party-kit.js in a vm. */
function kitSandbox() {
  const listeners = { window: {}, document: {} };
  const on = (bag) => (type, fn) => ((bag[type] = bag[type] || []).push(fn));
  const off = (bag) => (type, fn) => {
    bag[type] = (bag[type] || []).filter((f) => f !== fn);
  };
  const appended = [];
  const toasts = [];
  const document = {
    readyState: 'loading',
    visibilityState: 'visible',
    addEventListener: on(listeners.document),
    removeEventListener: off(listeners.document),
    querySelector(sel) {
      const m = /src\*="\/src\/js\/([^"]+)"/.exec(sel);
      return m ? { getAttribute: () => `/src/js/${m[1]}?v=stamp1` } : null;
    },
    querySelectorAll: () => [],
    createElement(tag) {
      return { tagName: String(tag).toUpperCase(), removed: false, remove() { this.removed = true; } };
    },
    head: { appendChild: (el) => appended.push(el) },
  };
  const ctx = {
    document,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    showToast: (m) => toasts.push(m),
    navigator: {},
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.addEventListener = on(listeners.window);
  ctx.removeEventListener = off(listeners.window);
  vm.createContext(ctx);
  vm.runInContext(kitSrc, ctx, { filename: 'party-kit.js' });
  const fire = (target, type) => (listeners[target][type] || []).slice().forEach((fn) => fn({ type }));
  return { K: ctx.PartyKit, appended, toasts, fire, document };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  {
    const { K, appended, toasts } = kitSandbox();
    const calls = [];
    const launch = K.withGameData('rajamantri', (x) => calls.push(x));
    const first = launch('a');
    assert(first && typeof first.then === 'function' && calls.length === 0, 'cold launch waits for the core');
    await tick();
    assert(appended.length === 1 && appended[0].src === '/src/js/games/rajamantri-core.js?v=stamp1', 'lazy load uses the stamped src from index');
    assert(appended[0].async === false, 'lazy scripts keep execution order');
    appended[0].onload();
    await first;
    assert(calls.join() === 'a', 'launch runs once the core loads');
    launch('b');
    assert(calls.join() === 'a,b', 'warm launch runs synchronously');

    const imp = K.withGameData('imposter', () => calls.push('imp'));
    const p = imp();
    await tick();
    assert(appended.length === 2 && /imposter-packs/.test(appended[1].src), 'packs load before the core');
    appended[1].onload();
    await tick();
    assert(appended.length === 3 && /imposter-core/.test(appended[2].src), 'core loads after its packs');
    appended[2].onload();
    await p;
    assert(calls[calls.length - 1] === 'imp', 'multi-file game launches after every file loads');

    const ch = K.withGameData('charades', () => calls.push('ch'));
    const failed = ch();
    await tick();
    appended[3].onerror();
    await failed;
    assert(!calls.includes('ch'), 'failed load never opens a half-ready game');
    assert(appended[3].removed, 'failed script tag is removed');
    assert(/Couldn’t load the game/.test(toasts.join('|')), 'failed load shows one calm toast');
    ch();
    await tick();
    assert(appended.length === 5 && /charades-packs/.test(appended[4].src), 'a retry fetches again after a failure');
  }

  // ---------- (c) privacy ----------
  {
    const { K, fire } = kitSandbox();
    const root = { isConnected: true };
    let away = 0;
    const stop = K.coverWhenAway(root, () => away++);
    fire('window', 'blur');
    assert(away === 1, 'blur (app switcher) re-covers the secret');
    fire('window', 'pagehide');
    assert(away === 2, 'pagehide (bfcache snapshot) re-covers the secret');
    fire('document', 'visibilitychange');
    assert(away === 2, 'visible → visible does not re-cover');
    assert(K.awayWatcherCount() === 1, 'one watcher per mounted cover');
    root.isConnected = false;
    assert(K.awayWatcherCount() === 0, 'detached covers self-prune (no leak across rounds)');
    fire('window', 'blur');
    assert(away === 2, 'pruned covers never fire');
    const r2 = { isConnected: true };
    const stop2 = K.coverWhenAway(r2, () => {});
    stop2();
    assert(K.awayWatcherCount() === 0, 'done / lock removes the watcher');
    stop();
  }
  assert(/const stopAway = coverWhenAway\(root, \(\) => \{\s*clearTimeout\(holdTimer\);/.test(kitSrc), 'pass cover re-hides on app switch');
  assert(/const stopAway = coverWhenAway\(root, \(\) => \{\s*if \(face\.hidden\) return;\s*face\.innerHTML = '';/.test(kitSrc), 'secret vote wipes the open ballot on app switch');
  assert(/coverWhenAway\(btn, hide\)/.test(kitSrc), 'hold-peek closes on app switch');
  assert(/\.pk-shell \[hidden\],\.pk-sheet-scrim \[hidden\]\{display:none!important;\}/.test(read('public/src/styles/dangal.css')), 'hidden buttons stay hidden (vote cover shows one action)');
  ['imposter', 'rajamantri', 'charades', 'mostlikely', 'werewolf'].forEach((g) => {
    const src = read(`public/src/js/games/${g}.js`);
    assert(!/localStorage\.setItem\([^)]*(secret|role|word|chit|vote)/i.test(src), `${g}: no secret persisted (refresh can't recover it)`);
    assert(!/body\.querySelector\('\[data-meta\]'\)\.textContent/.test(src), `${g}: setup meta line is null-safe`);
  });

  // ---------- (d) regressions ----------
  const overlay = read('public/src/js/core/overlay-scope.js');
  assert(/function isPermanentShell/.test(overlay) && /quizCategorySheet/.test(overlay), 'overlay dismiss knows permanent shells');
  assert(/if \(isPermanentShell\(el\)\) \{\s*hidePermanentShell\(el\);/.test(overlay) || /isPermanentShell\(el\)[\s\S]{0,80}hidePermanentShell\(el\)/.test(overlay), 'quiz sheet is hidden on back, never removed');
  assert(!/#firBack|#busBack|#rrBack/.test(overlay), 'overlay-scope: no retired back selectors');
  assert(!/#firBack|#busBack|#rrBack/.test(read('public/src/js/core/touch.js')), 'touch.js: no retired back selectors');
  assert(/let sheet=document\.getElementById\('quizCategorySheet'\);\s*if\(!sheet\)\{/.test(read('public/src/js/features/dangal-ratings.js')), 'quiz sheet is recreated if missing');
  assert(/name: tr\('bot', 'Bot'\) \+ ' ' \+ i \+ ' · '/.test(read('public/src/js/games/ohno-ui.js')), 'Oh No! opponents are named seats (bots labelled), never "undefined"');
  assert(/if\(typeof renderPeepalNudges==='function'\) renderPeepalNudges\(\);/.test(read('public/src/js/features/categories.js')), 'Peepal first paint survives nudges loading later');
  assert(/if \(typeof isRetiredGameId === 'function' && isRetiredGameId\(game\)\) return null;/.test(read('public/src/js/games/game-ui.js')), 'retired beat-score links never show a challenge chip');
  const ratings = read('public/src/js/features/dangal-ratings.js');
  assert(/chipEsc\(pending\.challenger\)/.test(ratings) && /chipEsc\(gName\)/.test(ratings), 'challenge chip escapes URL-provided names');
  const onboarding = read('public/src/js/features/onboarding.js');
  assert(/vEsc\(challenger\)/.test(onboarding) && /vEsc\(gName\)/.test(onboarding) && !/on \$\{gName\}/.test(onboarding), 'viral banner escapes URL-provided names and games');
  assert(/\.game-howto-btn::before\{[^}]*height:44px/.test(read('public/src/styles/components.css')), 'How-to pill has a 44px hit area');

  {
    const i18n = read('public/src/js/core/i18n.js');
    const start = i18n.indexOf('function applyChromeI18n(){');
    let depth = 0;
    let end = start;
    for (let i = i18n.indexOf('{', start); i < i18n.length; i++) {
      if (i18n[i] === '{') depth++;
      else if (i18n[i] === '}' && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    const mk = (attrs, text) => ({
      attrs: Object.assign({}, attrs),
      dataset: {},
      textContent: text || '',
      getAttribute(k) {
        return k in this.attrs ? this.attrs[k] : null;
      },
      hasAttribute(k) {
        return k in this.attrs;
      },
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
    });
    const known = mk({ 'data-i18n': 'known' }, 'Fallback');
    const missing = mk({ 'data-i18n': 'peepal_discuss' }, 'Discuss');
    const ph = mk({ 'data-i18n-placeholder': 'missing_ph', placeholder: 'What’s on your mind?' });
    const ctx = {
      t: (k) => (k === 'known' ? 'Known' : k),
      document: {
        querySelectorAll: (sel) =>
          sel === '[data-i18n]' ? [known, missing] : sel === '[data-i18n-placeholder]' ? [ph] : [],
      },
    };
    vm.createContext(ctx);
    vm.runInContext(i18n.slice(start, end) + '; applyChromeI18n();', ctx);
    assert(known.textContent === 'Known', 'i18n: translated keys still apply');
    assert(missing.textContent === 'Discuss', 'i18n: a missing key keeps the HTML copy (no raw "peepal_discuss")');
    assert(ph.attrs.placeholder === 'What’s on your mind?', 'i18n: missing placeholder keys keep the HTML copy');
  }

  // ---------- (e) global-first ----------
  const ImpPacks = require(path.join(root, 'public/src/js/data/imposter-packs.js'));
  const ImpCore = require(path.join(root, 'public/src/js/games/imposter-core.js'));
  const regional = ImpPacks.PACKS.filter((p) => p.regional).map((p) => p.id);
  const global = ImpPacks.PACKS.filter((p) => !p.regional);
  ['food', 'bollywood', 'cricket', 'places', 'festivals'].forEach((id) => assert(regional.includes(id), `Imposter: ${id} is a regional add-on`));
  assert(global.length >= 4 && global.every((p) => p.words.length >= 40), `Imposter: ≥4 global packs for Mixed (${global.map((p) => p.id).join(', ')})`);
  const seen = new Set();
  let s = 7;
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 200; i++) seen.add(ImpCore.deal(['a', 'b', 'c'], { pack: 'mixed' }, { rng }).hidden.category.id);
  assert([...seen].every((id) => !regional.includes(id)), 'Imposter: default Mixed never deals a regional word');
  const hiSeen = new Set();
  for (let i = 0; i < 200; i++) hiSeen.add(ImpCore.deal(['a', 'b', 'c'], { pack: 'mixed', mixRegional: true }, { rng }).hidden.category.id);
  assert([...hiSeen].some((id) => regional.includes(id)), 'Imposter: Hindi Mixed includes regional packs');
  assert(ImpCore.deal(['a', 'b', 'c'], { pack: 'bollywood' }, { rng }).hidden.category.id === 'bollywood', 'Imposter: regional packs stay pickable');
  assert(ImpCore.mergeSettings({ mixRegional: true }).mixRegional === true && ImpCore.mergeSettings({ mixRegional: 'yes' }).mixRegional === false, 'Imposter: mixRegional survives the server merge (strict boolean)');
  assert(/s\.mixRegional = String\(lang\(\)\)\.indexOf\('hi'\) === 0;/.test(read('public/src/js/games/imposter.js')), 'Imposter client sets mixRegional from the UI language');
  assert(!/Apni safai|safai do/i.test(read('public/src/js/games/mostlikely.js')), 'Most Likely settings copy is plain English');

  // ---------- (f) api count ----------
  const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
  assert(apiCount === 12, `api/*.js = 12 (got ${apiCount})`);

  console.log('\nDangal G4 dogfood checks passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
