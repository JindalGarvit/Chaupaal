#!/usr/bin/env node
/**
 * Global L3 — string extraction: Baithak, chat, Mehfil, Music, location, media.
 *   lint      zero hard-coded strings in every L3 file (scripts/i18n-surfaces.json → l3)
 *   keys      every t()-family key exists; hi / ta keep placeholders + plural categories
 *   events    structured system messages render per VIEWER (en + hi), viewer-relative ("You added …"),
 *             legacy text-only messages still show as stored, stored fallback text is English
 *   labels    app-written labels ("📷 Photo") stored in English, read in the reader's language —
 *             old messages included; the server push renders them for the recipient
 *   presence  last seen via the L1 relative-time helper; delivery-state labels
 *   music     taste codes stored, labels translated
 *   bidi      names isolated (<bdi> / FSI…PDI) in RTL (ar-XB)
 *   pseudo    en-XA transforms every L3 key
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const acorn = require('acorn');
const { loadI18n } = require('./lib/i18n-runtime');
const { lintSurface, isCopy } = require('./i18n-lint');
const { classify } = require('./lib/i18n-ast');
const { coverage } = require('./i18n-coverage');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const L3 = Object.keys(require('./i18n-surfaces.json').l3).filter((f) => fs.existsSync(path.join(ROOT, f)));
const L3_NS = ['baithak', 'chat', 'mehfil', 'music', 'location', 'media'];
const HI_TEST = {
  'chat.sys.member_added': '{who, select, actor {Aapne {{target}} ko add kiya} target {{{actor}} ne aapko add kiya} other {{{actor}} ne {{target}} ko add kiya}}',
  'chat.sys.member_left': '{who, select, actor {Aapne group chhod diya} other {{{actor}} ne group chhod diya}}',
  'chat.auto.photo': '📷 Photo (hi)',
  'chat.auto.gif': 'GIF (hi)',
};

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.log('  FAIL ' + msg);
  }
}

/** A browser-ish VM with the real i18n runtime + the files under test. */
function viewer(lang, files, extra) {
  const rt = loadI18n({ region: false });
  if (lang === 'hi') rt.registerI18nLocale('hi', HI_TEST);
  Object.assign(rt, {
    currentUser: { uid: (extra && extra.uid) || 'u_viewer', displayName: 'Viewer' },
    navigator: Object.assign(rt.navigator, { onLine: true }),
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
  });
  Object.assign(rt, extra || {});
  (files || []).forEach((f) => vm.runInContext(read(f), rt, { filename: f }));
  return rt;
}

/** renderMsgBubble + chatEsc lifted out of baithak-chat.js (the thread renderer, unchanged). */
function bubbleRenderer(rt) {
  const src = read('public/src/js/features/baithak-chat.js');
  const ast = acorn.parse(src, { ecmaVersion: 'latest' });
  const pick = (name) => {
    const fn = ast.body.find((n) => n.type === 'FunctionDeclaration' && n.id.name === name);
    return src.slice(fn.start, fn.end);
  };
  vm.runInContext(pick('chatEsc') + '\n' + pick('renderMsgBubble'), rt, { filename: 'renderMsgBubble' });
  return rt.renderMsgBubble;
}

const strip = (html) => String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/[\u2068\u2069\u200F\u202E\u202C]/g, '').trim();

(async () => {
  const rt = loadI18n({ region: false });
  const en = rt.CHAUPAAL_I18N_EN;
  const exists = (k) => !!rt.i18nLookup(k, 'en');

  console.log('\nLint (L3 files)');
  {
    const res = lintSurface('l3');
    assert(L3.length >= 22, `L3 surface covers ${L3.length} files`);
    assert(res.hits.length === 0, `zero hard-coded strings in L3 files (${res.hits.length})` + (res.hits.length ? ': ' + res.hits.slice(0, 5).map((h) => `${h.file}:${h.line} ${h.text}`).join(' | ') : ''));
    const ignores = L3.reduce((n, f) => n + (read(f).match(/i18n-ignore/g) || []).length, 0);
    assert(ignores <= 6, `i18n-ignore allowlist stays tiny (${ignores}: telemetry + embedding text only)`);
  }

  console.log('\nKeys + packs');
  {
    const missing = [];
    L3.forEach((rel) => {
      classify(read(rel), isCopy).calls.forEach((c) => {
        if (c.name === 'optionLabel' || c.name === 'optionLabelHtml') return;
        if (!/^[a-z][\w]*(\.[\w]+)+$/.test(c.key) && c.fallback) return;
        if (!exists(c.key)) missing.push(`${rel}:${c.line} ${c.key}`);
      });
    });
    assert(missing.length === 0, `every key used in L3 files exists (${missing.length})` + (missing.length ? ': ' + missing.slice(0, 6).join(', ') : ''));
    const counts = {};
    Object.keys(en).forEach((k) => {
      const ns = k.split('.')[0];
      if (L3_NS.includes(ns)) counts[ns] = (counts[ns] || 0) + 1;
    });
    console.log('    keys per namespace: ' + L3_NS.map((ns) => `${ns}=${counts[ns] || 0}`).join(' · '));
    assert(L3_NS.every((ns) => counts[ns] > 0), 'every L3 namespace has keys (incl. location., media.)');
    const cov = coverage();
    ['hi', 'ta'].forEach((code) => {
      const l = cov.langs[code];
      const inL3 = (k) => L3_NS.includes(k.split('.')[0]);
      assert(l.placeholderMismatches.filter(inL3).length === 0, `${code}: placeholders match English in L3 namespaces`);
      assert(l.pluralGaps.filter(inL3).length === 0, `${code}: plural categories complete in L3 namespaces`);
      const keys = Object.keys(en).filter(inL3);
      const pack = JSON.parse(read(`public/src/i18n/${code}.json`));
      const n = keys.filter((k) => k in pack).length;
      console.log(`    ${code}: ${n}/${keys.length} L3 keys translated (${Math.round((n / keys.length) * 1000) / 10}%)`);
      assert(n >= 50, `${code}: existing translations carried onto L3 keys (${n})`);
    });
    const plural = (k) => /\{count, plural,/.test(en[k] || '');
    ['common.members_count', 'chat.days_count', 'music.songs_count', 'location.minutes_n', 'location.hours_n', 'mehfil.name_and_others', 'baithak.members_and_label'].forEach((k) => assert(plural(k), `${k} is an ICU plural`));
    const glued = L3.filter((f) => /\$\{[\w.()]+\}\s?\w+\$\{[\w.()]+ ?=== ?1 ?\? ?'' ?: ?'s'\}|\$\{[\w.()]+\} (members|songs|days)\b/.test(read(f)));
    assert(glued.length === 0, `no hand-glued counts left (${glued.join(', ')})`);
  }

  console.log('\nSystem events (per viewer)');
  {
    const files = ['public/src/js/core/chat-events.js'];
    const enV = viewer('en', files, { uid: 'u_meena' });
    const hiV = viewer('hi', files, { uid: 'u_meena' });
    await hiV.setAppLanguage('hi');
    const sys = { v: 1, type: 'member_added', actorUid: 'u_asha', targetUids: ['u_ravi'], names: { u_asha: 'Asha', u_ravi: 'Ravi' }, params: {} };
    const enLine = strip(enV.ChatEvents.renderSysHtml(sys));
    const hiLine = strip(hiV.ChatEvents.renderSysHtml(sys));
    assert(enLine === 'Asha added Ravi', `en viewer: "${enLine}"`);
    assert(hiLine === 'Asha ne Ravi ko add kiya', `hi viewer: "${hiLine}" (same message, own language)`);
    const asActor = viewer('en', files, { uid: 'u_asha' });
    const asTarget = viewer('en', files, { uid: 'u_ravi' });
    assert(strip(asActor.ChatEvents.renderSysHtml(sys)) === 'You added Ravi', 'actor sees "You added Ravi"');
    assert(strip(asTarget.ChatEvents.renderSysHtml(sys)) === 'Asha added you', 'target sees "Asha added you"');
    assert(strip(enV.ChatEvents.renderSysHtml(sys, { memberProfiles: { u_asha: { name: 'Asha K' } } })) === 'Asha K added Ravi', 'current member name wins over the snapshot');
    assert(hiV.ChatEvents.sysEnglish(sys) === 'Asha added Ravi' && !/[\u2068\u2069]/.test(hiV.ChatEvents.sysEnglish(sys)), 'stored fallback text is plain English whatever the writer’s UI language');
    assert(enV.ChatEvents.cleanSys({ type: 'nope' }) === null && enV.ChatEvents.cleanSys({ type: 'group_renamed', actorUid: 'a', params: { name: 'x'.repeat(500), evil: 1 } }).params.name.length === 120, 'unknown types dropped; params whitelisted + capped');
    const types = Object.keys(enV.ChatEvents.SYS_TYPES);
    assert(types.length >= 10 && types.every((ty) => exists('chat.sys.' + ty)), `every event type has a message (${types.join(', ')})`);
    types.forEach((ty) => {
      const msg = en['chat.sys.' + ty];
      if (/\{who, select/.test(msg) === false) assert(false, `chat.sys.${ty} is viewer-relative ({who, select, …})`);
    });

    const render = bubbleRenderer(hiV);
    const sysRow = render({ from: 'them', uid: 'u_asha', name: 'Asha', text: 'Asha added Ravi', sys }, true);
    assert(/msg-row--system/.test(sysRow) && /ko add kiya/.test(sysRow), 'thread renders `sys` in the viewer’s language');
    const legacy = render({ from: 'them', uid: 'u_asha', name: 'Asha', text: 'Asha added Ravi (old message)' }, true);
    assert(/Asha added Ravi \(old message\)/.test(legacy) && !/msg-row--system/.test(legacy), 'legacy text-only message still shows exactly as stored');
    const gif = render({ from: 'them', uid: 'u_asha', name: 'Asha', text: 'GIF' }, false);
    assert(/GIF \(hi\)/.test(gif), 'old auto-label message ("GIF") reads in the viewer’s language');
    const typed = render({ from: 'them', uid: 'u_asha', name: 'Asha', text: 'see you at 6' }, false);
    assert(/see you at 6/.test(typed), 'user text is never translated');
    const xss = render({ from: 'them', uid: 'u_asha', name: 'Asha', text: '<img src=x onerror=alert(1)>' }, false);
    assert(!/<img src=x/.test(xss), 'message text stays escaped');

    // Writer: one structured message + English fallback + chat preview (previewSys best-effort).
    const writes = [];
    const fakeDb = {
      collection: (c) => ({
        doc: (id) => ({
          collection: (sub) => ({ add: async (payload) => (writes.push({ path: `${c}/${id}/${sub}`, payload }), { id: 'm1' }) }),
          set: async (payload) => writes.push({ path: `${c}/${id}`, payload }),
        }),
      }),
    };
    const writer = viewer('hi', files, { uid: 'u_asha', db: fakeDb, userProfile: { name: 'Asha' } });
    await writer.setAppLanguage('hi');
    await writer.ChatEvents.postChatSysEvent('g1', 'member_added', { targetUids: ['u_ravi'], names: { u_ravi: 'Ravi' } });
    await new Promise((r) => setTimeout(r, 10));
    const msg = writes.find((w) => w.path === 'chats/g1/messages');
    assert(msg && msg.payload.sys.type === 'member_added' && msg.payload.sys.actorUid === 'u_asha' && msg.payload.sys.targetUids[0] === 'u_ravi', 'writer stores { type, actorUid, targetUids, names, params }');
    assert(msg && msg.payload.text === 'Asha added Ravi', `writer stores English fallback text even with a Hindi UI ("${msg && msg.payload.text}")`);
    assert(writes.some((w) => w.path === 'chats/g1' && w.payload.previewSys && w.payload.previewSysAt), 'chat doc gets previewSys (+ previewSysAt guard)');
    const chat = { preview: 'Asha added Ravi', previewSys: msg.payload.sys, previewSysAt: 5, lastMessageAt: 5 };
    assert(/ko add kiya/.test(hiV.ChatEvents.chatPreviewText(chat)), 'chat list shows the event in the viewer’s language');
    assert(hiV.ChatEvents.chatPreviewText({ ...chat, lastMessageAt: 9, preview: 'newer text' }) === 'newer text', 'a later message (old client) wins over a stale previewSys');
    assert(hiV.ChatEvents.chatPreviewText({ preview: '📷 Photo' }) === '📷 Photo (hi)', 'legacy auto-label preview localised');

    const gi = read('public/src/js/features/group-info.js');
    ['group_created', 'member_added', 'member_left', 'member_removed', 'admin_added', 'admin_removed', 'group_renamed', 'group_photo_changed', 'member_joined'].forEach((ty) =>
      assert(new RegExp(`'${ty}'`).test(gi), `group-info writes ${ty}`)
    );
    assert(/await groupEvent\(chatId, leaving \? 'member_left'/.test(gi), 'leave event is written before the member loses access');
    assert(/'previewSys', 'previewSysAt'/.test(read('firebase/firestore.rules')), 'rules allow previewSys / previewSysAt on chat metadata');
  }

  console.log('\nApp-written labels + server');
  {
    const transport = read('public/src/js/core/baithak-transport.js');
    const keys = [...transport.matchAll(/'(chat\.auto\.[\w]+)'/g)].map((m) => m[1]);
    assert(keys.length >= 15 && keys.every(exists), `transport auto-labels are catalog keys (${keys.length})`);
    assert(/text:body\|\|\(music\?\.title\?tEn\('chat\.auto\.music'/.test(transport), 'stored auto-label text is canonical English (tEn)');
    const loc = read('public/src/js/features/location-share.js');
    assert(/label: tEn\('chat\.auto\.live_location'\)/.test(loc) && /label: tEn\('chat\.auto\.dropped_pin'\)/.test(loc), 'location labels stored in English, localised on render');
    assert(/tEn\('chat\.auto\.mehfil_nudge'/.test(read('public/src/js/features/mehfil.js')), 'Mehfil invite text stored in English');
    const srvFiles = ['api/stories.js', 'server-lib/duniya-posts.js', 'api/chaupaal-chat.js'];
    assert(srvFiles.every((f) => !/'Sent a (story|post)'|'Your space with Chaupaal'/.test(read(f))), 'server-written chat text comes from the catalog (no inline English)');
    const srv = require('../server-lib/i18n-server');
    srv.runtime().registerI18nLocale('hi', HI_TEST);
    assert(srv.serverAutoLabel('hi', '📷 Photo') === '📷 Photo (hi)', 'push: DM auto-label rendered in the recipient’s language');
    assert(srv.serverAutoLabel('hi', 'kal milte hain') === null, 'push: user-written preview untouched');
    assert(srv.serverAutoLabel('en', '🎵 Tum Hi Ho') === '🎵 Tum Hi Ho', 'patterned labels keep their params (🎵 {{title}})');
    const notif = require('../server-lib/notifications');
    const fakeDb = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ lang: 'hi' }) }) }) }) };
    const copy = await notif.renderPushCopy(fakeDb, 'u1', { actorName: 'Asha', previewText: '📷 Photo' });
    assert(copy.body === '📷 Photo (hi)', `DM push body in recipient language ("${copy.body}")`);
    assert(/ChatEvents\.autoText\(rawPreview\)/.test(read('public/src/js/core/notification-panel.js')), 'notification panel reads auto-labels in the viewer language');
  }

  console.log('\nPresence + delivery');
  {
    const v = viewer('en', ['public/src/js/core/ui-states.js', 'public/src/js/core/chat-presence.js'], {
      document: Object.assign({}, loadI18n({ region: false }).document, { body: {}, documentElement: { classList: { toggle() {} } } }),
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    });
    const now = Date.now();
    assert(strip(v.ChatPresence.presenceLine({ online: true }).html) === 'Online', 'online');
    assert(strip(v.ChatPresence.presenceLine({ lastSeen: now - 20000 }, now).html) === 'Last seen just now', 'last seen just now');
    const five = strip(v.ChatPresence.presenceLine({ lastSeen: now - 5 * 60000 }, now).html);
    assert(five === 'Last seen 5 minutes ago' || five === 'Last seen 5 min ago', `last seen via the L1 relative-time helper ("${five}")`);
    assert(/ChatPresence\.presenceLine/.test(read('public/src/js/features/discovery.js')), 'chat header uses ChatPresence.presenceLine');
    const render = bubbleRenderer(viewer('en', ['public/src/js/core/chat-events.js']));
    const status = (m) => (/aria-label="([^"]*)"/.exec(render(Object.assign({ from: 'me', text: 'hi' }, m), false)) || [])[1];
    assert(status({ pending: true }) === 'Sending…' && status({ failed: true }) === 'Not sent' && status({}) === 'Sent' && status({ read: true }) === 'Read', 'delivery states: sending / sent / read / failed labelled');
    ['sending', 'sent', 'delivered', 'read', 'failed', 'seen'].forEach((s) => assert(exists('chat.status.' + s), `chat.status.${s}`));
  }

  console.log('\nMusic taste codes');
  {
    const hub = read('public/src/js/features/music-hub.js');
    assert(/i18n-values: music\.opt\.mood \*\/ \['discovery'/.test(hub) && /value="\$\{m\}"[^>]*>\$\{optionLabelHtml\('music\.opt\.mood', m\)\}/.test(hub), 'mood: option value = code, label = optionLabel');
    assert(/optionLabelHtml\('music\.opt\.genre', m\)/.test(hub), 'genre labels translated');
    ['discovery', 'chill', 'energy', 'focus', 'romance', 'nostalgia'].forEach((c) => assert(exists('music.opt.mood.' + c), `music.opt.mood.${c}`));
    ['any', 'bollywood', 'punjabi', 'hiphop', 'pop', 'indie', 'classical'].forEach((c) => assert(exists('music.opt.genre.' + c), `music.opt.genre.${c}`));
    assert(/mood: 'discovery', genre: 'any'/.test(read('public/src/js/features/music-taste.js')), 'taste settings stored as codes');
    assert(rt.optionLabel('music.opt.genre', 'hiphop') === 'Hip-hop', 'code → label');
  }

  console.log('\nBidi (ar-XB)');
  {
    const v = viewer('en', ['public/src/js/core/chat-events.js'], { uid: 'u_x' });
    v.setPseudoLocale('ar-XB');
    await v.setAppLanguage('en');
    const html = v.ChatEvents.renderSysHtml({ v: 1, type: 'member_added', actorUid: 'u_a', targetUids: ['u_b', 'u_c'], names: { u_a: 'Asha', u_b: 'Ravi', u_c: 'نور' }, params: {} });
    assert(/<bdi>Asha<\/bdi>/.test(html) && /<bdi>Ravi<\/bdi>/.test(html) && /<bdi>نور<\/bdi>/.test(html), 'every name in the event is a <bdi>');
    assert(html.startsWith('\u200F\u202E') && v.isRtl(), 'ar-XB: RTL marks + isRtl()');
    assert(v.t('chat.name_is_typing', { name: v.bidi('Asha') }).includes('\u2068Asha\u2069'), 'text-mode names get FSI…PDI isolates');
    const typing = read('public/src/js/core/chat-presence.js');
    assert(/tHtml\('chat\.name_is_typing', \{ name: \{ html: '<bdi>'/.test(typing), 'typing indicator isolates the name');
  }

  console.log('\nPseudo en-XA');
  {
    const r4 = loadI18n({ region: false });
    r4.setPseudoLocale('en-XA');
    const keys = new Set();
    L3.forEach((rel) => classify(read(rel), isCopy).calls.forEach((c) => exists(c.key) && keys.add(c.key)));
    const plain = [...keys].filter((k) => {
      const s = r4.t(k, { count: 2, n: 2, who: 'other' });
      return !(s.startsWith('[') && s.endsWith(']'));
    });
    assert(keys.size > 400 && plain.length === 0, `en-XA transforms every L3 key (${keys.size}; untransformed: ${plain.slice(0, 5).join(', ')})`);
  }

  console.log('\nGuards');
  {
    const apis = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'));
    assert(apis.length === 12, `api/*.js === 12 (got ${apis.length})`);
    assert(/core\/chat-events\.js/.test(read('public/index.html')), 'chat-events.js loaded');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
