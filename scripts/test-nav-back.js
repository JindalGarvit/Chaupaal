#!/usr/bin/env node
/**
 * Nav N1 — system Back across the app (nav-stack history model).
 *
 * Runs the real public/src/js/core/nav-stack.js against a tiny fake DOM + a fake browser history
 * that models what bit us on phones:
 *  - popstate arrives late (slow CPU), so a close → open in quick succession used to let the stale
 *    pop close the new screen or leave it with no history entry (Back then exited the app);
 *  - Chrome's history intervention: an entry pushed without a user gesture since the last traversal
 *    makes the browser Back button skip every same-document entry (= app exits).
 * Plus source contracts: no feature code touches history directly; party shells step back a screen.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
let passes = 0;
function assert(cond, msg) {
  if (cond) {
    passes++;
    console.log('  ✓ ' + msg);
  } else {
    failures++;
    console.log('  ✗ ' + msg);
  }
}

// ─── fake DOM ────────────────────────────────────────────────────────────────

const observers = new Set();
function notify(rec) {
  observers.forEach((mo) => mo._offer(rec));
}

function kebab(k) {
  return k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}
function camel(k) {
  return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

class FakeEvent {
  constructor(type, init) {
    this.type = type;
    this.isTrusted = !!(init && init.trusted);
    this.key = init && init.key;
    this.state = init && init.state;
    this.target = null;
    this.defaultPrevented = false;
    this._stop = false;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopPropagation() {
    this._stop = true;
  }
  stopImmediatePropagation() {
    this._stop = true;
  }
}

class Target {
  constructor() {
    this._ls = [];
  }
  addEventListener(type, fn, opts) {
    const capture = opts === true || !!(opts && opts.capture);
    this._ls.push({ type, fn, capture });
  }
  removeEventListener(type, fn) {
    this._ls = this._ls.filter((l) => !(l.type === type && l.fn === fn));
  }
  /** phase: 'capture' | 'bubble' | 'all' (at target). */
  _fire(ev, phase) {
    for (const l of this._ls.slice()) {
      if (l.type !== ev.type) continue;
      if (phase === 'capture' && !l.capture) continue;
      if (phase === 'bubble' && l.capture) continue;
      l.fn.call(this, ev);
      if (ev._stop) return;
    }
  }
}

class El extends Target {
  constructor(tag) {
    super();
    this.tagName = String(tag || 'div').toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentElement = null;
    this.attrs = {};
    this.style = {};
    this.textContent = '';
    const self = this;
    this.dataset = new Proxy(
      {},
      {
        get: (_, k) => self.attrs['data-' + kebab(String(k))],
        set: (_, k, v) => {
          self.setAttribute('data-' + kebab(String(k)), String(v));
          return true;
        },
        deleteProperty: (_, k) => {
          delete self.attrs['data-' + kebab(String(k))];
          return true;
        },
        ownKeys: () => Object.keys(self.attrs).filter((a) => a.startsWith('data-')).map((a) => camel(a.slice(5))),
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
      }
    );
    this._cls = new Set();
    this.classList = {
      add: (...c) => this._setCls(() => c.forEach((x) => this._cls.add(x))),
      remove: (...c) => this._setCls(() => c.forEach((x) => this._cls.delete(x))),
      toggle: (c, on) => this._setCls(() => ((on === undefined ? !this._cls.has(c) : on) ? this._cls.add(c) : this._cls.delete(c))),
      contains: (c) => this._cls.has(c),
    };
  }
  _setCls(fn) {
    const before = [...this._cls].join(' ');
    fn();
    if ([...this._cls].join(' ') !== before) notify({ type: 'attributes', attributeName: 'class', target: this });
  }
  get className() {
    return [...this._cls].join(' ');
  }
  set className(v) {
    this._setCls(() => {
      this._cls = new Set(String(v).split(/\s+/).filter(Boolean));
    });
  }
  get id() {
    return this.attrs.id || '';
  }
  set id(v) {
    this.attrs.id = String(v);
  }
  setAttribute(k, v) {
    if (k === 'class') this.className = v;
    else this.attrs[k] = String(v);
  }
  getAttribute(k) {
    if (k === 'class') return this.className;
    return this.attrs[k] == null ? null : this.attrs[k];
  }
  hasAttribute(k) {
    return this.getAttribute(k) != null;
  }
  get isConnected() {
    let n = this;
    while (n) {
      if (n === doc.documentElement) return true;
      n = n.parentElement;
    }
    return false;
  }
  get previousElementSibling() {
    if (!this.parentElement) return null;
    const sib = this.parentElement.children;
    const i = sib.indexOf(this);
    return i > 0 ? sib[i - 1] : null;
  }
  appendChild(c) {
    return this.insertBefore(c, null);
  }
  insertBefore(c, ref) {
    if (c.parentElement) c.remove();
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c);
    else this.children.splice(i, 0, c);
    c.parentElement = this;
    notify({ type: 'childList', target: this, addedNodes: [c], removedNodes: [] });
    return c;
  }
  remove() {
    const p = this.parentElement;
    if (!p) return;
    p.children.splice(p.children.indexOf(this), 1);
    this.parentElement = null;
    notify({ type: 'childList', target: p, addedNodes: [], removedNodes: [this] });
  }
  contains(n) {
    while (n) {
      if (n === this) return true;
      n = n.parentElement;
    }
    return false;
  }
  _all() {
    const out = [];
    const walk = (n) => n.children.forEach((c) => (out.push(c), walk(c)));
    walk(this);
    return out;
  }
  querySelectorAll(sel) {
    const groups = parseSelector(sel);
    return this._all().filter((el) => groups.some((g) => matchChain(el, g, this)));
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  matches(sel) {
    return parseSelector(sel).some((g) => matchChain(this, g, null));
  }
  closest(sel) {
    let n = this;
    while (n && n.nodeType === 1) {
      if (n.matches(sel)) return n;
      n = n.parentElement;
    }
    return null;
  }
  click() {
    dispatch(this, new FakeEvent('click', { trusted: false }));
  }
  focus() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 10, height: 10 };
  }
}

function splitTop(s, ch) {
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (const c of s) {
    if (quote) {
      if (c === quote) quote = null;
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ch && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function parseCompound(s) {
  const parts = [];
  const re = /(#[\w-]+)|(\.[\w-]+)|(\[[^\]]+\])|(:not\((.+?)\))|(^[a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) parts.push({ id: m[1].slice(1) });
    else if (m[2]) parts.push({ cls: m[2].slice(1) });
    else if (m[3]) {
      const a = m[3].slice(1, -1).match(/^([\w-]+)(?:=["']?([^"']*)["']?)?$/);
      parts.push({ attr: a[1], val: a[2] });
    } else if (m[4]) parts.push({ not: parseCompound(m[5]) });
    else if (m[6]) parts.push({ tag: m[6].toUpperCase() });
  }
  return parts;
}

function parseSelector(sel) {
  return splitTop(sel, ',').map((g) => splitTop(g, ' ').map(parseCompound));
}

function matchCompound(el, parts) {
  return parts.every((p) => {
    if (p.id) return el.id === p.id;
    if (p.cls) return el.classList.contains(p.cls);
    if (p.tag) return el.tagName === p.tag;
    if (p.attr) {
      const v = el.getAttribute(p.attr);
      return p.val === undefined ? v != null : v === p.val;
    }
    if (p.not) return !matchCompound(el, p.not);
    return true;
  });
}

function matchChain(el, chain, scope) {
  if (!matchCompound(el, chain[chain.length - 1])) return false;
  let i = chain.length - 2;
  let n = el.parentElement;
  while (i >= 0 && n && n !== scope) {
    if (matchCompound(n, chain[i])) i--;
    n = n.parentElement;
  }
  return i < 0;
}

function dispatch(target, ev) {
  ev.target = target;
  const path = [];
  for (let n = target; n; n = n.parentElement) path.push(n);
  doc._fire(ev, 'capture');
  if (ev._stop) return;
  for (let i = path.length - 1; i > 0 && !ev._stop; i--) path[i]._fire(ev, 'capture');
  for (const n of path) {
    if (ev._stop) break;
    n._fire(ev, n === target ? 'all' : 'bubble');
  }
  if (!ev._stop) doc._fire(ev, 'bubble');
}

class FakeMO {
  constructor(cb) {
    this.cb = cb;
    this.targets = [];
    this.queue = [];
    this.scheduled = false;
  }
  observe(target, opts) {
    this.targets.push({ target, opts: opts || {} });
    observers.add(this);
  }
  disconnect() {
    observers.delete(this);
    this.targets = [];
  }
  _offer(rec) {
    const ok = this.targets.some(({ target, opts }) => {
      const inScope = opts.subtree ? target.contains(rec.target) : rec.target === target;
      if (!inScope) return false;
      if (rec.type === 'childList') return !!opts.childList;
      if (rec.type === 'attributes') {
        if (!opts.attributes && !opts.attributeFilter) return false;
        return !opts.attributeFilter || opts.attributeFilter.includes(rec.attributeName);
      }
      return false;
    });
    if (!ok) return;
    this.queue.push(rec);
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => {
        this.scheduled = false;
        const q = this.queue;
        this.queue = [];
        if (q.length && observers.has(this)) this.cb(q, this);
      });
    }
  }
}

// ─── fake browser history (Chrome semantics that matter) ────────────────────

const POP_DELAY_MS = 220; // slower than the old 120 ms suppress window — the bug trigger
/** Everything (nav-stack's timers, popstate latency, our sleeps) runs on one 5× clock. */
const SCALE = 5;
const later = (fn, ms) => setTimeout(fn, Math.max(0, (Number(ms) || 0) / SCALE));
const B = {
  entries: [{ state: null, url: '/', skip: false }],
  index: 0,
  activation: false, // gesture since the last traversal
  untrustedPushes: 0,
  exited: false,
};
const location = { pathname: '/', search: '', hash: '' };
function setUrl(url) {
  const u = String(url);
  const q = u.indexOf('?');
  location.pathname = q >= 0 ? u.slice(0, q) : u;
  location.search = q >= 0 ? u.slice(q) : '';
}
const history = {
  get state() {
    return B.entries[B.index].state;
  },
  get length() {
    return B.entries.length;
  },
  pushState(state, _t, url) {
    if (!B.activation) {
      B.untrustedPushes++;
      B.entries.forEach((e) => (e.skip = true));
    }
    B.entries = B.entries.slice(0, B.index + 1);
    B.entries.push({ state, url: url != null ? String(url) : B.entries[B.index].url, skip: false });
    B.index++;
    setUrl(B.entries[B.index].url);
  },
  replaceState(state, _t, url) {
    B.entries[B.index] = { ...B.entries[B.index], state, url: url != null ? String(url) : B.entries[B.index].url };
    setUrl(B.entries[B.index].url);
  },
  go(n) {
    traverse(B.index + n);
  },
  back() {
    traverse(B.index - 1);
  },
};
function traverse(to) {
  B.activation = false;
  later(() => {
    if (to < 0) {
      B.exited = true;
      return;
    }
    if (to >= B.entries.length) return;
    B.index = to;
    setUrl(B.entries[to].url);
    const ev = new FakeEvent('popstate', { state: B.entries[to].state });
    win._fire(ev, 'capture');
    if (!ev._stop) win._fire(ev, 'bubble');
  }, POP_DELAY_MS);
}
/** The phone's Back gesture: browser UI, honours Chrome's skip flags. */
function userBack() {
  let to = B.index - 1;
  while (to >= 0 && B.entries[to].skip) to--;
  traverse(to);
}

// ─── app shell ───────────────────────────────────────────────────────────────

const doc = new Target();
doc.documentElement = new El('html');
doc.body = new El('body');
doc.documentElement.appendChild(doc.body);
doc.readyState = 'complete';
doc.createElement = (t) => new El(t);
doc.querySelectorAll = (s) => doc.documentElement.querySelectorAll(s);
doc.querySelector = (s) => doc.documentElement.querySelector(s);
doc.getElementById = (id) => doc.documentElement.querySelector('#' + id);

const device = new El('div');
device.className = 'device';
doc.body.appendChild(device);
const tabs = new El('nav');
tabs.className = 'bottom-tabs';
device.appendChild(tabs);
['akhbaar', 'duniya', 'peepal', 'baithak', 'dangal'].forEach((t) => {
  const b = new El('button');
  b.className = 'tab-btn' + (t === 'peepal' ? ' active' : '');
  b.dataset.tab = t;
  b.addEventListener('click', () => {
    tabs.querySelectorAll('.tab-btn').forEach((x) => x.classList.toggle('active', x === b));
  });
  tabs.appendChild(b);
});

const win = new Target();
const ctx = {
  document: doc,
  history,
  location,
  MutationObserver: FakeMO,
  setTimeout: later,
  clearTimeout,
  queueMicrotask,
  Promise,
  console: { warn() {}, log: console.log, error: console.error },
  navigator: {},
};
ctx.window = ctx;
ctx.addEventListener = win.addEventListener.bind(win);
ctx.removeEventListener = win.removeEventListener.bind(win);
vm.createContext(ctx);
// NAV_STACK_SRC=<file> runs the scenarios against another build (e.g. the pre-N1 nav-stack).
const navSrc = process.env.NAV_STACK_SRC ? fs.readFileSync(process.env.NAV_STACK_SRC, 'utf8') : read('public/src/js/core/nav-stack.js');
vm.runInContext(navSrc, ctx, { filename: 'nav-stack.js' });

const sleep = (ms) => new Promise((r) => later(r, ms));
const settle = () => sleep(POP_DELAY_MS * 3 + 1400);
/** A real finger tap: trusted pointerup (activation), then the element's click. */
function tap(el) {
  B.activation = true;
  B.entries.forEach((e) => (e.skip = false));
  dispatch(el, new FakeEvent('pointerup', { trusted: true }));
  dispatch(el, new FakeEvent('click', { trusted: true }));
}
const dbg = () =>
  typeof ctx.navStackDebug === 'function'
    ? ctx.navStackDebug()
    : { stack: device.querySelectorAll('.game-overlay,.cp-action-sheet,.cp-sheet-panel').map((e) => e.className), depth: -1, want: 0 };
const tabBtn = (t) => tabs.querySelector(`.tab-btn[data-tab="${t}"]`);
const activeTab = () => tabs.querySelector('.tab-btn.active').dataset.tab;

/** A game overlay whose ← opens a leave confirm (like confirmLeaveGame); Leave closes it. */
function openGame(id) {
  const ov = new El('div');
  ov.className = 'game-overlay';
  ov.dataset.gameId = id;
  const backBtn = new El('button');
  backBtn.className = 'game-back-btn';
  backBtn.addEventListener('click', () => {
    if (doc.getElementById('gameLeaveConfirm')) return;
    const c = new El('div');
    c.id = 'gameLeaveConfirm';
    c.className = 'game-pause-scrim';
    const stay = new El('button');
    stay.dataset.leaveStay = '';
    stay.addEventListener('click', () => c.remove());
    const go = new El('button');
    go.dataset.leaveGo = '';
    go.addEventListener('click', () => {
      c.remove();
      ov.remove();
    });
    c.appendChild(stay);
    c.appendChild(go);
    ov.appendChild(c);
  });
  ov.appendChild(backBtn);
  device.appendChild(ov);
  return ov;
}

/** The Dangal opponent sheet: a bottom panel; Practice removes it and opens the game a beat later. */
function openOpponentSheet() {
  const sheet = new El('div');
  sheet.className = 'dangal-opp-sheet cp-sheet-panel';
  const practice = new El('button');
  practice.id = 'dgPracticeAi';
  practice.addEventListener('click', () => {
    sheet.remove();
    later(() => openGame('chess'), 300); // async launch (script load / engine warm-up)
  });
  sheet.appendChild(practice);
  device.appendChild(sheet);
  return sheet;
}

async function run() {
  console.log('\nNav N1 — system Back');

  // 1) The reported bug: opponent sheet → Practice vs AI on a slow phone.
  tap(tabBtn('dangal'));
  await settle();
  const opener = new El('button');
  opener.addEventListener('click', () => openOpponentSheet());
  device.appendChild(opener);
  tap(opener);
  await settle();
  tap(doc.querySelector('#dgPracticeAi'));
  await settle();
  const game = doc.querySelector('.game-overlay');
  assert(!!game && game.isConnected, 'Practice vs AI opens and stays open after the sheet closes (late popstate)');
  assert(dbg().stack.length === 1 && /game-overlay/.test(dbg().stack[0]), 'only the game is on the stack — the stale pop closed nothing');
  assert(!doc.getElementById('gameLeaveConfirm'), 'no phantom leave prompt behind a blur');
  const g = parseFloat(game.style.zIndex);
  assert(g >= 200, 'game sits above the app shell (z ' + g + ')');
  assert(dbg().depth >= dbg().want && history.state && history.state.navIdx === dbg().depth, 'history has an entry for the game (Back stays in the app)');

  // 2) Back inside the game: prompt, dismiss, prompt — never exits while the game is open.
  userBack();
  await settle();
  assert(!!doc.getElementById('gameLeaveConfirm') && game.isConnected, 'Back on a game asks before leaving');
  userBack();
  await settle();
  assert(!doc.getElementById('gameLeaveConfirm') && game.isConnected, 'Back again dismisses the prompt, game continues');
  userBack();
  await settle();
  assert(!B.exited && !!doc.getElementById('gameLeaveConfirm'), 'third Back with no tap in between still stays in the app');
  tap(doc.querySelector('#gameLeaveConfirm [data-leave-go]'));
  await settle();
  assert(!game.isConnected && dbg().stack.length === 0, 'Leave closes the game');
  assert(activeTab() === 'dangal', 'leaving a game returns to Dangal');

  // 3) Tabs: Back walks earlier tabs, then the launch tab, then leaves — no prompt.
  tap(tabBtn('baithak'));
  await settle();
  tap(tabBtn('duniya'));
  await settle();
  userBack();
  await settle();
  assert(activeTab() === 'baithak', 'Back from Duniya → Baithak');
  userBack();
  await settle();
  assert(activeTab() === 'dangal', 'Back from Baithak → Dangal');
  userBack();
  await settle();
  assert(activeTab() === 'peepal' && !B.exited, 'Back from Dangal → Peepal (launch tab), app still open');

  // 4) Close one screen and open the next in quick succession — no history churn, Back closes the new one.
  const a = new El('div');
  a.className = 'cp-action-sheet';
  const closeA = new El('button');
  closeA.dataset.dismiss = '';
  a.appendChild(closeA);
  const opener2 = new El('button');
  opener2.addEventListener('click', () => device.appendChild(a));
  device.appendChild(opener2);
  tap(opener2);
  await settle();
  const pushesBefore = B.entries.length;
  const b = new El('div');
  b.className = 'cp-action-sheet';
  closeA.addEventListener('click', () => {
    a.remove();
    later(() => device.appendChild(b), 400);
  });
  tap(closeA);
  await settle();
  assert(b.isConnected && dbg().stack.length === 1, 'sheet → next sheet: the new one is open and on the stack');
  assert(B.entries.length === pushesBefore, 'closing then opening reused history entries (no pop/push churn)');
  userBack();
  await settle();
  assert(!b.isConnected && !B.exited, 'Back closes the new sheet, app stays open');

  // 5) URL follows the layer and reverts.
  const post = new El('div');
  post.className = 'cp-action-sheet';
  const opener3 = new El('button');
  opener3.addEventListener('click', () => {
    device.appendChild(post);
    queueMicrotask(() => ctx.setNavLayerUrl(post, '/post/abc'));
  });
  device.appendChild(opener3);
  tap(opener3);
  await settle();
  assert(location.pathname === '/post/abc', 'shareable URL shows while the post is open');
  userBack();
  await settle();
  assert(location.pathname === '/', 'URL reverts to / when the post closes');

  // 6) Nothing left: Back leaves the app, once, with no prompt.
  assert(dbg().stack.length === 0 && activeTab() === 'peepal', 'at the launch tab with nothing open');
  userBack();
  await settle();
  assert(B.exited, 'Back at the launch tab with nothing open leaves the app');

  // 7) Chrome intervention: we never pushed an entry without a fresh gesture.
  assert(B.untrustedPushes === 0, 'no history entry pushed without a user gesture (' + B.untrustedPushes + ')');

  // ─── source contracts ───
  console.log('\nContracts');
  const ns = read('public/src/js/core/nav-stack.js');
  assert(/gestureSinceTraversal/.test(ns) && /SPARE_ENTRIES/.test(ns) && /SHRINK_GRACE_MS/.test(ns), 'nav-stack: gesture-gated pushes, spares, shrink grace');
  assert(!/suppressingPop/.test(ns), 'nav-stack: no time-window pop suppression');
  const offenders = [];
  const walk = (dir) =>
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((d) => {
      const rel = dir + '/' + d.name;
      if (d.isDirectory()) return walk(rel);
      if (!/\.js$/.test(d.name) || /nav-stack\.js$/.test(d.name)) return;
      const src = read(rel);
      if (/history\.(pushState|back|go|forward)\(/.test(src)) offenders.push(rel);
    });
  walk('public/src/js');
  assert(offenders.length === 0, 'no feature code calls history.pushState/back/go (' + offenders.join(', ') + ')');
  const gu = read('public/src/js/games/game-ui.js');
  assert(/\(owner \|\| host\)\.appendChild\(sheet\)/.test(gu) && /__leaveDone/.test(gu), 'leave confirm mounts inside the game and always resolves');
  const kit = read('public/src/js/games/party-kit.js');
  assert(/setBack\(fn\)/.test(kit) && /shell\.guard \|\|/.test(kit), 'Party Kit: per-screen Back + round guard');
  ['imposter', 'charades', 'mostlikely', 'werewolf', 'rajamantri'].forEach((gid) => {
    const src = read(`public/src/js/games/${gid}.js`);
    assert(/shell\.setBack\(\(\) => renderHome\(shell\)\)/.test(src), `${gid}: setup → Back → game home`);
  });
  ['imposter', 'charades', 'mostlikely', 'rajamantri'].forEach((gid) => {
    assert(/shell\.guard = true/.test(read(`public/src/js/games/${gid}.js`)), `${gid}: Back mid-round asks before ending it`);
  });
  assert(/navStackSync/.test(read('public/src/js/features/dangal-ratings.js')), 'Dangal section change re-syncs Back');

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
