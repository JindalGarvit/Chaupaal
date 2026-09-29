/**
 * RW Sports — Street Cricket: vs Bot · Chase practice · Live 1v1 · Watch.
 *
 * Laws, scoring and stats live in cricket-engine.js; what a ball *does* (execution, contact,
 * running, umpire, DRS-lite, bots) lives in cricket-model.js; the canvas lives in
 * cricket-scene.js; key-moment commentary in cricket-commentary.js. All four are shared with the
 * server / sim. This file is the controls, the scorecard sheet and the match controllers. Live
 * never resolves on the phone: POST /api/media-config { action: 'cricket_match' } →
 * server-lib/cricket-engine.js.
 */
(function () {
  'use strict';

  const GAME = 'streetcricket';
  const LABEL = 'Street Cricket';
  const KEY_SETTINGS = 'chaupaal_sc_settings_v5';
  const KEY_HISTORY = 'chaupaal_sc_history_v1';
  const KEY_COACH = 'chaupaal_sc_coach_v4';
  const HISTORY_MAX = 12;
  const LIVE_POLICY = window.DangalLivePolicy ? window.DangalLivePolicy.policyFor(GAME) : { turnMs: 12000, reconnectMs: 90000 };
  const RECONNECT_MS = LIVE_POLICY.reconnectMs;
  const SIDE_COLORS = ['#2E7D32', '#F9A825'];
  const HIGH_RTT_MS = 350;
  const LOCAL_REVIEW_MS = 8000;
  const DRS_VIEW_MS = 2600;

  const CE = () => window.CricketEngine;
  const CM = () => window.CricketModel;
  const CC = () => window.CricketCommentary;
  const SC = () => window.CricketScene;
  const Kit = () => window.PartyKit;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }
  function tr(key, fallback) {
    return typeof t === 'function' ? t('cricket.' + key, fallback) : fallback;
  }
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }
  function readJson(key, fb) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return v == null ? fb : v;
    } catch (e) {
      return fb;
    }
  }
  function writeJson(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {}
  }
  function myUid() {
    return Kit() ? Kit().myUid() : typeof getCurrentUid === 'function' ? getCurrentUid() || '' : '';
  }
  function myName() {
    const n = (Kit() && Kit().myName()) || '';
    return n ? n.split(' ')[0].slice(0, 16) : tr('you', 'You');
  }
  function cleanId(raw) {
    return String(raw || '')
      .replace(/[^\w.-]/g, '')
      .slice(0, 120);
  }
  function persistable(uid) {
    if (!uid) return false;
    return typeof isPersistableUid === 'function' ? isPersistableUid(uid) : /^[\w-]{6,128}$/.test(uid);
  }
  function feedback(kind) {
    if (typeof gameFeedback === 'function') gameFeedback(kind);
  }
  function hashStr(s) {
    let h = 2166136261;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  /** Model label for a group/id (shot, line, length, variation, field, pitch, run, foot). */
  function lbl(group, id) {
    const M = CM();
    return tr(group + '.' + id, (M && M.LABELS[group] && M.LABELS[group][id]) || id);
  }
  function tierLabel(id) {
    const M = CM();
    const tid = M ? M.tierOf(id) : 'normal';
    return tr('tier.' + tid, M ? M.TIERS[tid].label : 'Normal') + ' ' + tr('bot', 'Bot');
  }

  function settings() {
    const s = readJson(KEY_SETTINGS, {}) || {};
    const C = CE();
    return {
      format: C ? C.normFormat(s.format || 'quick') : s.format || 'quick',
      preset: C ? C.normPreset(s.preset) : s.preset || 'standard',
      toggles: s.toggles && typeof s.toggles === 'object' ? s.toggles : {},
      tie: C ? C.normTie(s.tie) : s.tie || 'superover',
      level: ['easy', 'normal', 'hard', 'pro'].indexOf(s.level) >= 0 ? s.level : 'normal',
      persona: s.persona === 'fan' ? 'fan' : 'calm',
      voice: s.voice === true,
      sound: s.sound !== false,
      aiComm: s.aiComm !== false,
    };
  }
  function saveSettings(s) {
    writeJson(KEY_SETTINGS, s);
  }
  function settingsLine(s) {
    const C = CE();
    const f = C.FORMATS[s.format];
    return f.label + ' · ' + f.overs + ' ov · ' + C.PRESETS[s.preset].label + ' · ' + tierLabel(s.level);
  }

  // ---------------- chat launch helpers ----------------

  function resolveRwChat(arg) {
    if (typeof chatFromLaunch === 'function' && arg != null) {
      const from = chatFromLaunch(arg);
      if (from && (from.name || from.dangalMatchId || from.uid || from.opponentUid || from.peerUid)) return from;
    }
    if (arg && arg.chat) return resolveRwChat(arg.chat);
    if (arg && (arg.name || arg.dangalMatchId || arg.uid || arg.opponentUid || arg.peerUid)) return arg;
    const ctx = window.__dangalLaunchCtx || {};
    return Object.assign({ name: tr('opponent', 'Opponent') }, ctx.chat || {}, {
      dangalMatchId: ctx.matchId || undefined,
      opponentUid: ctx.opponentUid || undefined,
      uid: ctx.opponentUid || undefined,
      dangalSource: ctx.source || undefined,
    });
  }
  function chatLiveOn(chat) {
    return typeof DangalLive !== 'undefined' && DangalLive.isLive && DangalLive.isLive(chat);
  }

  // ---------------- match history (this device) ----------------

  function history() {
    const h = readJson(KEY_HISTORY, []);
    return Array.isArray(h) ? h : [];
  }
  function saveHistory(entry) {
    const list = history().filter((e) => e && e.id !== entry.id);
    list.unshift(entry);
    writeJson(KEY_HISTORY, list.slice(0, HISTORY_MAX));
  }
  function historyEntry(id, mode, title, state, mySide, recap, persona) {
    const C = CE();
    const r = state.result || {};
    return {
      id,
      at: Date.now(),
      mode,
      title,
      format: state.config.format,
      preset: state.config.rules.preset,
      config: state.config,
      log: state.log || [],
      result: r.text || '',
      won: r.kind === 'win' ? r.winner === mySide : null,
      tied: r.kind === 'tie',
      lines: C.shareSummary(state).lines,
      recap: recap || '',
      persona: persona || 'calm',
    };
  }
  function openHistoryEntry(entry) {
    const C = CE();
    if (!C || !entry) return;
    const st = C.replay(entry.config, entry.log);
    st.log = entry.log;
    const comm = CC() ? CC().linesFor(st, hashStr(entry.id), entry.persona || 'calm') : [];
    openScorecardSheet(st, { title: entry.title, recap: entry.recap || (CC() ? CC().recapTemplate(st, entry.persona) : ''), comm });
  }
  function historyRowsHtml(list) {
    const C = CE();
    return list
      .map((e, i) => {
        const tag = e.won === true ? tr('hist.won', 'Won') : e.tied ? tr('hist.tied', 'Tied') : e.won === false ? tr('hist.lost', 'Lost') : '—';
        const when = new Date(e.at || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const fmt = C && C.FORMATS[e.format] ? C.FORMATS[e.format].label : '';
        return `<button type="button" class="sc-hist-row" data-sc-hist="${i}">
          <span class="sc-hist-tag sc-hist-tag--${e.won === true ? 'w' : e.won === false ? 'l' : 't'}">${esc(tag)}</span>
          <span class="sc-hist-main"><span class="sc-hist-title">${esc(e.title)} · ${esc(fmt)}</span><span class="sc-hist-sub">${esc(e.recap || e.result)}</span></span>
          <span class="sc-hist-when">${esc(when)}</span>
        </button>`;
      })
      .join('');
  }
  function openHistorySheet() {
    const list = history();
    if (!list.length) return toast(tr('hist.none', 'No matches yet'));
    Kit().openSheet({
      title: tr('hist.title', 'Match history'),
      bodyHtml: `<div class="sc-hist">${historyRowsHtml(list)}</div><div class="pk-field-help">${esc(tr('hist.help', 'Saved on this device · tap a match for its scorecard'))}</div>`,
      onMount: (el, close) => {
        el.querySelectorAll('[data-sc-hist]').forEach((b) =>
          b.addEventListener('click', () => {
            close();
            setTimeout(() => openHistoryEntry(list[Number(b.dataset.scHist)]), 80);
          })
        );
      },
    });
  }
  /** Profile hook: recent Street Cricket matches with reopenable scorecards. */
  function mountHistory(el) {
    if (!el) return;
    const list = history().slice(0, 5);
    if (!list.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `<div class="sc-hist sc-hist--profile"><div class="sc-hist-head">${esc(LABEL)} · ${esc(tr('hist.recent', 'recent matches'))}</div>${historyRowsHtml(list)}</div>`;
    el.querySelectorAll('[data-sc-hist]').forEach((b) =>
      b.addEventListener('click', () => {
        const go = () => openHistoryEntry(list[Number(b.dataset.scHist)]);
        if (Kit() && Kit().withGameData) Kit().withGameData(GAME, go)();
        else go();
      })
    );
  }

  // ---------------- visuals: strip · over dots · scorecard · charts ----------------

  function tokenHtml(tk) {
    return `<span class="sc-dot sc-dot--${esc(tk.k)}">${esc(tk.v)}</span>`;
  }
  function overDotsHtml(tokens) {
    if (!tokens || !tokens.length) return `<div class="sc-over sc-over--empty">${esc(tr('over.new', 'New over'))}</div>`;
    return `<div class="sc-over" aria-label="${esc(tr('over.this', 'This over'))}">${tokens.map(tokenHtml).join('')}</div>`;
  }
  function stripHtml(strip) {
    if (!strip) return '';
    const meta = [];
    meta.push('RR ' + strip.rr.toFixed(2));
    if (strip.target) {
      meta.push(tr('strip.target', 'Target') + ' ' + strip.target);
      meta.push(tr('strip.need', 'Need') + ' ' + strip.need + ' ' + tr('strip.off', 'off') + ' ' + strip.ballsLeft);
      if (isFinite(strip.rrr)) meta.push('RRR ' + strip.rrr.toFixed(2));
    } else {
      meta.push(strip.ballsLeft + ' ' + (strip.ballsLeft === 1 ? tr('strip.ballLeft', 'ball left') : tr('strip.ballsLeft', 'balls left')));
    }
    return `<div class="sc-strip${strip.super ? ' is-super' : ''}">
      <div class="sc-strip-main">
        <span class="sc-strip-team">${strip.super ? esc(tr('strip.super', 'Super Over')) + ' · ' : ''}${esc(strip.batting)}</span>
        <strong class="sc-strip-score">${strip.runs}/${strip.wkts}</strong>
        <span class="sc-strip-ov">(${esc(strip.overs)}/${strip.maxOvers})</span>
        ${strip.freeHit ? `<span class="sc-strip-fh">${esc(tr('freeHit', 'Free hit'))}</span>` : ''}
      </div>
      <div class="sc-strip-meta">${esc(meta.join(' · '))}</div>
    </div>`;
  }
  /** The honest "set" meter: confidence 0–100 and what it is worth (± contact %). */
  function confHtml(strip, reviewsLeft) {
    if (!strip || !strip.striker) return '';
    const M = CM();
    const c = Math.max(0, Math.min(100, Math.round(strip.striker.conf == null ? 20 : strip.striker.conf)));
    const pct = M ? M.confPercent(c) : 0;
    const title = tr('conf.title', 'Confidence') + ' ' + c + ' · ' + tr('conf.contact', 'contact') + ' ' + (pct > 0 ? '+' : '') + pct + '%';
    const rev = reviewsLeft == null ? '' : `<span class="sc-rev" title="${esc(tr('drs.left', 'Reviews left'))}">${esc(tr('drs.short', 'Review'))} ${reviewsLeft}</span>`;
    return `<span class="sc-conf" title="${esc(title)}" aria-label="${esc(title)}"><span class="sc-conf-l">${esc(tr('conf.set', 'Set'))}</span><span class="sc-conf-bar"><i style="width:${c}%"></i></span><span class="sc-conf-v">${pct > 0 ? '+' : ''}${pct}%</span></span>${rev}`;
  }

  function batTable(inn) {
    const rows = inn.batting
      .map(
        (b) => `<tr><td><span class="sc-name">${esc(b.name)}${b.out ? '' : '*'}</span><span class="sc-how">${esc(b.how)}</span></td>
          <td>${b.r}</td><td>${b.b}</td><td>${b.f4}</td><td>${b.f6}</td><td>${b.sr.toFixed(1)}</td></tr>`
      )
      .join('');
    return `<table class="sc-table"><thead><tr><th>${esc(tr('card.batter', 'Batter'))}</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function bowlTable(inn) {
    const rows = inn.bowling
      .map(
        (b) => `<tr><td><span class="sc-name">${esc(b.name)}</span><span class="sc-how">${b.dots} ${esc(tr('card.dots', 'dots'))}${b.wd ? ' · ' + b.wd + ' wd' : ''}${b.nb ? ' · ' + b.nb + ' nb' : ''}</span></td>
          <td>${esc(b.o)}</td><td>${b.m}</td><td>${b.r}</td><td>${b.w}</td><td>${b.econ.toFixed(2)}</td></tr>`
      )
      .join('');
    return `<table class="sc-table"><thead><tr><th>${esc(tr('card.bowler', 'Bowler'))}</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function inningsHtml(inn) {
    const ex = inn.extras;
    const exParts = [['wd', ex.wd], ['nb', ex.nb], ['b', ex.b], ['lb', ex.lb], ['pen', ex.pen]].filter((p) => p[1]).map((p) => p[0] + ' ' + p[1]);
    const fow = inn.fow.length ? inn.fow.map((f) => f.text).join(' · ') : '—';
    const parts = inn.partnerships.length
      ? inn.partnerships.map((p) => `<li>${esc(p.a)}${p.b ? ' & ' + esc(p.b) : ''} — ${p.runs} (${p.balls})</li>`).join('')
      : '';
    return `<section class="sc-inn">
      <h3 class="sc-inn-head"><span>${esc(inn.title)}</span><span>${inn.total.runs}/${inn.total.wkts} <small>(${esc(inn.total.overs)} ov)</small></span></h3>
      ${batTable(inn)}
      <div class="sc-line"><span>${esc(tr('card.extras', 'Extras'))}</span><span>${ex.total}${exParts.length ? ' (' + esc(exParts.join(', ')) + ')' : ''}</span></div>
      <div class="sc-line sc-line--total"><span>${esc(tr('card.total', 'Total'))}</span><span>${inn.total.runs}/${inn.total.wkts} · ${esc(inn.total.overs)} ov · RR ${inn.rr.toFixed(2)}</span></div>
      ${bowlTable(inn)}
      <div class="sc-sub"><strong>${esc(tr('card.fow', 'Fall of wickets'))}</strong> ${esc(fow)}</div>
      ${parts ? `<div class="sc-sub"><strong>${esc(tr('card.partnerships', 'Partnerships'))}</strong><ul class="sc-parts">${parts}</ul></div>` : ''}
      <div class="sc-sub sc-sub--stats">${esc(tr('card.boundaries', 'Boundaries'))} ${inn.boundaryPct}% · ${esc(tr('card.dotPct', 'Dot balls'))} ${inn.dotPct}%</div>
    </section>`;
  }
  function scorecardHtml(card) {
    return `<div class="sc-card">
      ${card.result ? `<div class="sc-result">${esc(card.result)}</div>` : ''}
      <div class="sc-card-meta">${esc(card.format)} · ${esc(card.preset)}</div>
      ${card.innings.map(inningsHtml).join('')}
      <div class="sc-attrib">${esc(card.source)}</div>
    </div>`;
  }

  function wormSvg(worm) {
    const W = 320;
    const H = 170;
    const pad = 26;
    const maxBalls = Math.max(6, ...worm.map((w) => w.overs * 6));
    const maxRuns = Math.max(10, ...worm.map((w) => (w.points.length ? w.points[w.points.length - 1][1] : 0)));
    const x = (b) => pad + ((W - pad - 8) * b) / maxBalls;
    const y = (r) => H - pad - ((H - pad - 10) * r) / maxRuns;
    const lines = worm
      .map((w) => {
        const col = SIDE_COLORS[w.side] || '#555';
        const pts = w.points.map((p) => x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1)).join(' ');
        const wk = w.points.filter((p) => p[2]).map((p) => `<circle cx="${x(p[0]).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="3.5" fill="#C62828" />`).join('');
        return `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" />${wk}`;
      })
      .join('');
    const overs = Math.round(maxBalls / 6);
    const ticks = [];
    for (let o = 0; o <= overs; o += Math.max(1, Math.ceil(overs / 5))) ticks.push(`<text x="${x(o * 6)}" y="${H - 8}" class="sc-ax">${o}</text>`);
    return `<svg viewBox="0 0 ${W} ${H}" class="sc-chart" role="img" aria-label="${esc(tr('chart.worm', 'Run worm'))}">
      <line x1="${pad}" y1="${H - pad}" x2="${W - 8}" y2="${H - pad}" class="sc-axis" />
      <line x1="${pad}" y1="10" x2="${pad}" y2="${H - pad}" class="sc-axis" />
      <text x="4" y="16" class="sc-ax">${maxRuns}</text>${ticks.join('')}${lines}</svg>`;
  }
  function manhattanSvg(man) {
    const W = 320;
    const H = 170;
    const pad = 26;
    const maxOvers = Math.max(1, ...man.map((m) => m.maxOvers));
    const maxRuns = Math.max(6, ...man.map((m) => Math.max(0, ...m.overs.map((o) => o.runs))));
    const groupW = (W - pad - 8) / maxOvers;
    const barW = Math.max(3, groupW / (man.length + 1));
    const y = (r) => H - pad - ((H - pad - 14) * r) / maxRuns;
    const bars = man
      .map((m, si) =>
        m.overs
          .map((o) => {
            const bx = pad + (o.n - 1) * groupW + barW * (si + 0.5);
            const top = y(o.runs);
            const wk = [];
            for (let k = 0; k < o.wkts; k++) wk.push(`<circle cx="${(bx + barW / 2).toFixed(1)}" cy="${(top - 5 - k * 7).toFixed(1)}" r="3" fill="#C62828" />`);
            return `<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${(H - pad - top).toFixed(1)}" fill="${SIDE_COLORS[m.side] || '#555'}" rx="1.5" />${wk.join('')}`;
          })
          .join('')
      )
      .join('');
    const labels = [];
    for (let o = 1; o <= maxOvers; o += Math.max(1, Math.ceil(maxOvers / 10))) labels.push(`<text x="${(pad + (o - 0.5) * groupW).toFixed(1)}" y="${H - 8}" class="sc-ax" text-anchor="middle">${o}</text>`);
    return `<svg viewBox="0 0 ${W} ${H}" class="sc-chart" role="img" aria-label="${esc(tr('chart.manhattan', 'Runs per over'))}">
      <line x1="${pad}" y1="${H - pad}" x2="${W - 8}" y2="${H - pad}" class="sc-axis" />
      <text x="4" y="16" class="sc-ax">${maxRuns}</text>${labels.join('')}${bars}</svg>`;
  }
  function wagonSvg(w) {
    const S = 150;
    const c = S / 2;
    const r = S / 2 - 8;
    const col = (s) => (s.out ? '#C62828' : s.runs >= 6 ? '#6A1B9A' : s.runs >= 4 ? '#1565C0' : '#607D8B');
    const lines = w.shots
      .map((s) => {
        const a = (s.dir * Math.PI) / 180;
        const d = Math.min(1.1, s.dist) * r;
        const x2 = c + Math.sin(a) * d;
        const y2 = c - Math.cos(a) * d;
        return `<line x1="${c}" y1="${c}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col(s)}" stroke-width="${s.runs >= 4 ? 2.2 : 1.4}" stroke-linecap="round" />${s.out ? `<circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="3" fill="#C62828" />` : ''}`;
      })
      .join('');
    return `<figure class="sc-wagon"><svg viewBox="0 0 ${S} ${S}" class="sc-chart sc-chart--wagon" role="img" aria-label="${esc(tr('chart.wagon', 'Wagon wheel'))} · ${esc(w.name)}">
        <circle cx="${c}" cy="${c}" r="${r}" class="sc-field" /><circle cx="${c}" cy="${c}" r="${r * 0.5}" class="sc-inner" />
        <rect x="${c - 3}" y="${c - 12}" width="6" height="24" class="sc-strip-rect" />${lines}</svg>
        <figcaption>${esc(w.name)}</figcaption></figure>`;
  }
  function chartsHtml(ch) {
    const legend = ch.worm.map((w) => `<span class="sc-legend"><i style="background:${SIDE_COLORS[w.side]}"></i>${esc(w.name)}</span>`).join('');
    return `<div class="sc-charts">
      <div class="sc-legends">${legend}</div>
      <h4>${esc(tr('chart.worm', 'Run worm'))}</h4>${wormSvg(ch.worm)}
      <h4>${esc(tr('chart.manhattan', 'Runs per over'))}</h4>${manhattanSvg(ch.manhattan)}
      <h4>${esc(tr('chart.wagon', 'Wagon wheel'))}</h4><div class="sc-wagons">${ch.wagon.map(wagonSvg).join('')}</div>
      <div class="sc-legends sc-legends--wagon"><span class="sc-legend"><i style="background:#607D8B"></i>1–3</span><span class="sc-legend"><i style="background:#1565C0"></i>4</span><span class="sc-legend"><i style="background:#6A1B9A"></i>6</span><span class="sc-legend"><i style="background:#C62828"></i>${esc(tr('chart.out', 'Out'))}</span></div>
    </div>`;
  }
  function timelineHtml(tl) {
    return `<ol class="sc-timeline">${tl
      .map((row) => (row.head ? `<li class="sc-tl-head">${esc(row.text)}</li>` : `<li>${row.token ? tokenHtml(row.token) : ''}<span>${esc(row.text)}</span></li>`))
      .join('')}</ol>`;
  }
  function commListHtml(list) {
    if (!list || !list.length) return `<p class="pk-field-help">${esc(tr('comm.none', 'No big moments yet.'))}</p>`;
    return `<ol class="sc-comm-list">${list
      .slice()
      .reverse()
      .map((e) => `<li>${e.ai ? `<span class="sc-comm-ai">${esc(tr('comm.ai', 'AI'))}</span>` : ''}<span>${esc(e.line)}</span></li>`)
      .join('')}</ol>`;
  }

  function shareStatsFor(state, recap) {
    const C = CE();
    const sum = C.shareSummary(state);
    return {
      title: LABEL,
      scoreLine: sum.lines.join(' · '),
      meta: recap || [sum.result, sum.top ? tr('share.top', 'Top performer') + ': ' + sum.top : ''].filter(Boolean).join(' · '),
      text: sum.text + (recap ? '\n' + recap : '') + '\n' + tr('share.on', 'Played on Chaupaal'),
    };
  }
  function shareScorecard(state, recap) {
    const s = shareStatsFor(state, recap);
    if (typeof shareGameResult === 'function') return shareGameResult(GAME, s);
    if (navigator.share) navigator.share({ title: LABEL, text: s.text }).catch(() => {});
  }

  /** opts: { title, tab, recap, comm: [{ line, ai }] } */
  function openScorecardSheet(state, opts) {
    const C = CE();
    const o = opts || {};
    const card = C.scorecard(state);
    const tabs = { card: () => scorecardHtml(card), charts: () => chartsHtml(C.charts(state)), balls: () => timelineHtml(C.timeline(state)), comm: () => commListHtml(o.comm) };
    const segs = [['card', tr('tab.card', 'Scorecard')], ['charts', tr('tab.charts', 'Charts')], ['balls', tr('tab.balls', 'Ball by ball')]];
    if (o.comm && o.comm.length) segs.push(['comm', tr('tab.comm', 'Commentary')]);
    let tab = o.tab || 'card';
    Kit().openSheet({
      title: o.title || tr('card.title', 'Scorecard'),
      bodyHtml: `<div class="sc-sheet">
        ${o.recap ? `<p class="sc-recap">${esc(o.recap)}</p>` : ''}
        ${Kit().segHtml('tab', tab, segs)}
        <div class="sc-sheet-body" data-sc-tab></div>
        <button type="button" class="pk-btn pk-btn--ghost" data-sc-share>${esc(tr('share', 'Share scorecard'))}</button>
      </div>`,
      onMount: (el) => {
        const body = el.querySelector('[data-sc-tab]');
        const paint = () => {
          body.innerHTML = tabs[tab]();
        };
        const st = { tab };
        Kit().wireSegs(el, st, () => {
          tab = st.tab;
          paint();
        });
        el.querySelector('[data-sc-share]').addEventListener('click', () => shareScorecard(state, o.recap));
        paint();
      },
    });
  }
  function openCommentarySheet(list, persona) {
    Kit().openSheet({
      title: tr('comm.title', 'Commentary'),
      bodyHtml: `<div class="sc-sheet">${commListHtml(list)}<div class="pk-field-help">${esc(
        (persona === 'fan' ? tr('comm.fan', 'Excited fan') : tr('comm.calm', 'Calm analyst')) + ' · ' + tr('comm.help', 'key moments only · change the voice in Match settings')
      )}</div></div>`,
    });
  }

  // ---------------- commentary feed ----------------

  /**
   * Key-moment feed for one match. Template lines come from a seeded no-repeat picker (same on
   * every phone); AI lines (per-over batches) replace them when they arrive and are tagged "AI".
   */
  function createFeed(seed, persona) {
    const C = CC();
    const picker = C ? C.createPicker(seed, persona) : null;
    const seen = {};
    const list = [];
    return {
      list,
      persona,
      update(state, ai) {
        if (!C || !state) return [];
        const fresh = [];
        C.keyMoments(state).forEach((m) => {
          if (seen[m.key]) return;
          seen[m.key] = 1;
          const aiLine = ai && ai[m.key];
          const line = aiLine || picker.line(m);
          if (!line) return;
          const e = { key: m.key, kind: m.kind, line, ai: !!aiLine };
          list.push(e);
          fresh.push(e);
        });
        return fresh;
      },
      applyAi(map) {
        let changed = false;
        list.forEach((e) => {
          if (map && map[e.key] && !e.ai) {
            e.line = map[e.key];
            e.ai = true;
            changed = true;
          }
        });
        return changed;
      },
      last() {
        return list[list.length - 1] || null;
      },
    };
  }
  function showComm(body, entry, persona, speakIt) {
    const el = body && body.querySelector('[data-sc-comm]');
    if (!el || !entry) return;
    el.hidden = false;
    el.innerHTML = `${entry.ai ? `<span class="sc-comm-ai">${esc(tr('comm.ai', 'AI'))}</span>` : ''}<span class="sc-comm-text">${esc(entry.line)}</span>`;
    if (speakIt && settings().voice && SC()) SC().speak(entry.line, { fan: persona === 'fan' });
  }

  /** Local-match AI (vs Bot / Chase): per-over lines and the recap through dangal_ai. */
  const aiSession = { off: false, fails: 0 };
  async function aiCommentary(input) {
    if (aiSession.off || !settings().aiComm || typeof apiFetch !== 'function' || !(Kit() && Kit().isSignedIn())) return null;
    try {
      const res = await apiFetch('/api/media-config', { method: 'POST', needAuth: true, body: { action: 'dangal_ai', hook: 'commentary', input } });
      const d = res && res.ok ? res.data : null;
      if (d && (d.source === 'ai' || d.source === 'cache')) {
        aiSession.fails = 0;
        return d.data || null;
      }
      // AI off or capped: stop asking this session. A one-off invalid answer gets two more tries.
      if (!d || d.reason === 'ai_off' || d.reason === 'user_cap' || d.reason === 'global_cap' || ++aiSession.fails >= 3) aiSession.off = true;
      return null;
    } catch (e) {
      if (++aiSession.fails >= 2) aiSession.off = true;
      return null;
    }
  }

  // ---------------- outcome words ----------------

  function outcomeKind(ball) {
    if (!ball) return 'run';
    if (ball.out) return 'out';
    if (ball.extra === 'wd' || ball.extra === 'nb') return 'extra';
    if (ball.runs >= 4 && !ball.extra) return 'boundary';
    return 'run';
  }
  function outcomeWord(ball) {
    if (!ball) return '';
    if (ball.out) return tr('flash.out', 'OUT!');
    if (ball.extra === 'wd') return tr('flash.wide', 'Wide');
    if (ball.extra === 'nb') return tr('flash.noBall', 'No-ball · free hit');
    if (ball.extra === 'b' || ball.extra === 'lb') return ball.runs + ' ' + (ball.extra === 'b' ? tr('flash.bye', 'bye') : tr('flash.legBye', 'leg-bye'));
    if (ball.runs === 6) return tr('flash.six', 'SIX!');
    if (ball.runs === 4) return tr('flash.four', 'FOUR!');
    if (ball.runs === 0) return tr('flash.dot', 'Dot ball');
    return ball.runs + ' ' + (ball.runs === 1 ? tr('flash.run', 'run') : tr('flash.runs', 'runs'));
  }
  function lastBallOf(state) {
    for (let i = state.innings.length - 1; i >= 0; i--) {
      const b = state.innings[i].balls;
      if (b.length) return b[b.length - 1];
    }
    return null;
  }
  function appealText(appeal) {
    const what = appeal.kind === 'lbw' ? tr('appeal.lbw', 'LBW') : tr('appeal.caught', 'caught behind');
    return tr('appeal.for', 'Appeal for') + ' ' + what + ' — ' + (appeal.onField === 'out' ? tr('appeal.out', 'given OUT') : tr('appeal.notOut', 'NOT OUT'));
  }
  function drsVerdict(drs) {
    const d = drs.decision === 'out' ? tr('drs.out', 'OUT') : tr('drs.notOut', 'NOT OUT');
    if (drs.result === 'overturned') return tr('drs.overturned', 'Overturned') + ' — ' + d;
    if (drs.result === 'umpires_call') return tr('drs.umpiresCall', 'Umpire’s call') + ' — ' + d + ' · ' + tr('drs.kept', 'review kept');
    return tr('drs.stands', 'Decision stands') + ' — ' + d;
  }
  function isHighlight(ev) {
    return !!(ev && (ev.out || (ev.runs === 6 && !ev.extra)));
  }

  // ---------------- controls ----------------

  const VAR_SHORT = { stock: 'Stock', slower: 'Slower', cutter: 'Cutter', bouncer: 'Bouncer', yorker: 'Yorker', turnIn: 'Turn in', turnAway: 'Turn away', armBall: 'Arm ball' };
  const FIELD_HELP = {
    attacking: 'Catchers in · edges carry · singles are risky',
    balanced: 'Even field all round',
    defensive: 'Riders on the rope · fewer fours · easy singles',
    protectOff: 'Off-side boundary sealed · leg side open',
    protectLeg: 'Leg-side boundary sealed · off side open',
  };
  const RUN_SHORT = { hold: 'Hold', one: 'Take 1', two: 'Push 2' };

  function miniSeg(name, value, opts, disabled) {
    return `<div class="sc-mini" role="radiogroup" data-sc-mini="${esc(name)}">${opts
      .map(
        ([v, l]) =>
          `<button type="button" class="sc-mini-btn${String(v) === String(value) ? ' is-on' : ''}" data-v="${esc(v)}" aria-pressed="${String(v) === String(value)}"${disabled ? ' disabled' : ''}>${esc(l)}</button>`
      )
      .join('')}</div>`;
  }
  function setMini(root, name, value, disabled) {
    const grp = root.querySelector(`[data-sc-mini="${name}"]`);
    if (!grp) return;
    grp.querySelectorAll('.sc-mini-btn').forEach((b) => {
      const on = b.dataset.v === String(value);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      if (disabled != null) b.disabled = !!disabled;
    });
  }
  function wireMini(root, onPick) {
    root.querySelectorAll('[data-sc-mini]').forEach((grp) =>
      grp.addEventListener('click', (e) => {
        const b = e.target.closest('.sc-mini-btn');
        if (!b || b.disabled) return;
        onPick(grp.dataset.scMini, b.dataset.v);
      })
    );
  }

  function batPanelHtml(o) {
    const M = CM();
    return `<div class="sc-bat">
      <div class="sc-shots8" role="group" aria-label="${esc(tr('shot', 'Shot'))}">${M.SHOTS.map(
        (id) => `<button type="button" class="sc-shot sc-shot--${id}" data-sc-shot="${id}" disabled>${esc(lbl('shot', id))}</button>`
      ).join('')}</div>
      <div class="sc-opts">
        ${miniSeg('foot', o.foot, [['stay', tr('foot.stay', 'Stay')], ['out', tr('foot.out', 'Step out')]], true)}
        ${miniSeg('run', o.run, ['hold', 'one', 'two'].map((k) => [k, tr('run.' + k, RUN_SHORT[k])]))}
      </div>
      ${o.local ? `<button type="button" class="btn btn--primary rw-sc-main" data-sc-main>${esc(tr('btn.face', 'Face the ball'))}</button>` : ''}
    </div>`;
  }
  /** o = { plan, over: { type, field }, locked } */
  function bowlPanelHtml(o) {
    const M = CM();
    const vars = M.VARIATIONS[o.over.type];
    const fixed = !!M.VARIATION_LENGTH[o.plan.variation];
    return `<div class="sc-bowlp">
      <div class="sc-over-setup">
        ${miniSeg('type', o.over.type, [['pace', lbl('type', 'pace')], ['spin', lbl('type', 'spin')]], o.locked)}
        <label class="sc-field-pick"><span>${esc(tr('field', 'Field'))}</span><select data-sc-field${o.locked ? ' disabled' : ''}>${M.FIELD_ORDER.map(
          (f) => `<option value="${f}"${f === o.over.field ? ' selected' : ''}>${esc(lbl('field', f))}</option>`
        ).join('')}</select></label>
      </div>
      <div class="sc-field-help" data-sc-field-help>${esc(o.locked ? tr('over.locked', 'Type and field are set for this over') : tr('fieldHelp.' + o.over.field, FIELD_HELP[o.over.field]))}</div>
      <div class="sc-pick"><span class="sc-pick-l">${esc(tr('pick.line', 'Line'))}</span>${miniSeg('line', o.plan.line, M.LINES.map((x) => [x, lbl('line', x)]))}</div>
      <div class="sc-pick"><span class="sc-pick-l">${esc(tr('pick.length', 'Length'))}</span>${miniSeg('length', o.plan.length, M.LENGTHS.map((x) => [x, lbl('length', x)]), fixed)}</div>
      <div class="sc-pick"><span class="sc-pick-l">${esc(tr('pick.ball', 'Ball'))}</span>${miniSeg('variation', o.plan.variation, vars.map((x) => [x, tr('var.' + x, VAR_SHORT[x])]))}</div>
      <div class="sc-meter" aria-hidden="true"><i class="sc-meter-sweet"></i><i class="sc-meter-needle" data-sc-needle></i></div>
      <div class="sc-risk" data-sc-risk>${esc(riskText(o.plan, o.over.type))}</div>
      <button type="button" class="btn btn--primary rw-sc-main" data-sc-main>${esc(tr('btn.bowl', 'Bowl'))}</button>
    </div>`;
  }
  function riskText(plan, type) {
    const M = CM();
    const p = M.normPlan(Object.assign({}, plan, { type }));
    const miss = M.missChance(p, 0.75);
    const lvl = miss < 0.04 ? tr('risk.low', 'Low') : miss < 0.1 ? tr('risk.med', 'Medium') : tr('risk.high', 'High');
    const what = p.length === 'yorker' ? tr('risk.yorker', 'a full toss or no-ball') : p.line === 'wide' ? tr('risk.wide', 'a wide') : p.length === 'bouncer' ? tr('risk.bouncer', 'a wide or no-ball') : tr('risk.loose', 'a loose ball');
    return tr('risk', 'Risk') + ' ' + lvl + ' · ' + tr('risk.miss', 'a miss can be') + ' ' + what + ' · ' + tr('risk.green', 'stop the needle in the green');
  }
  function meterPos(ms) {
    const MS = CM().METER_MS;
    const q = ((((ms % MS) + MS) % MS) / MS) * 2 - 1;
    return 1 - Math.abs(q);
  }

  function netClass(rtt) {
    return !rtt ? 'sc-net--idle' : rtt < 180 ? 'sc-net--good' : rtt < HIGH_RTT_MS ? 'sc-net--ok' : 'sc-net--poor';
  }
  function netHtml(rtt) {
    return `<span class="sc-net ${netClass(rtt)}" title="${esc(tr('net.title', 'Connection'))}"><i></i>${rtt ? Math.round(rtt) + ' ms' : '—'}</span>`;
  }

  function pitchCardHtml(pitch) {
    const M = CM();
    const p = M.PITCHES[pitch] || M.PITCHES.flat;
    return `<div class="sc-pitch-card sc-pitch-card--${esc(pitch)}"><span class="sc-pitch-name">${esc(tr('pitch', 'Pitch'))}: ${esc(lbl('pitch', pitch))}</span><span class="sc-pitch-blurb">${esc(
      tr('pitchBlurb.' + pitch, p.blurb.replace(/^[^:]+:\s*/, ''))
    )}</span></div>`;
  }
  /** Toss card. o = { pitch, coin, spinning, title, sub, warn, net, buttons: [{ id, label, primary }] } */
  function tossHtml(o) {
    return `<div class="rw-sports-card sc-toss">
      ${pitchCardHtml(o.pitch)}
      <div class="sc-coin${o.spinning ? ' is-spinning' : ''}${o.coin ? ' is-' + o.coin : ''}" aria-hidden="true"><span>${o.coin === 'tails' ? 'T' : 'H'}</span></div>
      <h2 class="sc-toss-title">${esc(o.title)}</h2>
      ${o.sub ? `<p class="rw-sports-hint" data-sc-secs>${esc(o.sub)}</p>` : '<p class="rw-sports-hint" data-sc-secs></p>'}
      ${o.warn ? `<div class="sc-warn" role="status">${esc(o.warn)}</div>` : ''}
      ${o.net != null ? `<div class="sc-toss-net">${netHtml(o.net)}</div>` : ''}
      <div class="sc-toss-btns">${(o.buttons || [])
        .map((b) => `<button type="button" class="btn ${b.primary ? 'btn--primary' : 'btn--secondary'}" data-sc-toss="${esc(b.id)}">${esc(b.label)}</button>`)
        .join('')}</div>
    </div>`;
  }

  // ---------------- match overlay ----------------

  function openMatchView(o) {
    const overlay = document.createElement('div');
    overlay.className = 'game-overlay game-overlay--light rw-sports-overlay sc-overlay';
    overlay.dataset.gameId = GAME;
    overlay.innerHTML =
      (typeof gameChromeHtml === 'function'
        ? gameChromeHtml({ title: LABEL, subtitle: o.subtitle || '', backId: 'scBack', pauseId: o.pause ? 'scPause' : '' })
        : `<div class="game-chrome"><button type="button" id="scBack" class="game-back-btn">←</button><div class="game-chrome-title">${esc(LABEL)}</div></div>`) +
      `<div class="rw-sports-body sc-body" data-sc-body></div>`;
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      try {
        if (SC()) SC().hush();
      } catch (e) {}
      try {
        if (typeof o.onCleanup === 'function') o.onCleanup();
      } catch (e) {}
    };
    const begin = typeof beginGameOverlaySession === 'function' ? beginGameOverlaySession : null;
    const gs = begin ? begin({ type: GAME, title: LABEL, mode: o.live ? 'live' : 'solo', overlay, cleanup }) : null;
    if (begin && (!gs || !gs.alive())) return null;
    if (!begin) (document.querySelector('.device') || document.body).appendChild(overlay);
    if (typeof prepareGameOverlay === 'function') prepareGameOverlay(overlay, { theme: 'light', gameId: GAME, accent: '#1B7A4E' });
    const view = {
      overlay,
      gs,
      body: overlay.querySelector('[data-sc-body]'),
      alive: () => !closed && (!gs || typeof gs.alive !== 'function' || gs.alive()),
      close(why) {
        if (gs) gs.close(why || 'dismissed');
        else {
          if (typeof animateGameExit === 'function') animateGameExit(overlay, () => overlay.remove());
          else overlay.remove();
          cleanup();
          try {
            if (typeof restoreAppShell === 'function') restoreAppShell('rw_sports_close');
          } catch (e) {}
        }
      },
      setSub(text) {
        const el = overlay.querySelector('.game-chrome-subtitle');
        if (el) el.textContent = text || '';
      },
      setOutcome(kind) {
        if (gs && typeof gs.setOutcome === 'function') gs.setOutcome(kind);
      },
    };
    overlay.querySelector('#scBack')?.addEventListener('click', () => (typeof o.onBack === 'function' ? o.onBack() : view.close()));
    return view;
  }

  function matchLayoutHtml() {
    return `<div class="rw-sports-card rw-sc-card sc-card-match">
      <div data-sc-strip></div>
      <div class="sc-row-meta"><div data-sc-over></div><div class="sc-row-right" data-sc-conf></div></div>
      <div class="sc-stage" data-sc-stage>
        <div class="sc-stage-chips">
          <span data-sc-net></span>
          <button type="button" class="sc-chip" data-sc-replay hidden>↺ ${esc(tr('replay', 'Replay'))}</button>
          <button type="button" class="sc-chip sc-chip--icon" data-sc-mute></button>
        </div>
      </div>
      <div class="rw-sports-outcome" data-rw-outcome aria-live="polite"></div>
      <button type="button" class="sc-comm" data-sc-comm hidden></button>
      <p class="rw-sports-hint sc-hint" data-sc-hint></p>
      <div data-sc-controls></div>
      <div class="sc-links"><button type="button" class="sc-link" data-sc-open-card>${esc(tr('card.title', 'Scorecard'))}</button><button type="button" class="sc-link" data-sc-open-rules>${esc(tr('rules', 'Rules'))}</button></div>
    </div>`;
  }
  /** Canvas + stage chips (mute, replay). Returns the scene. */
  function mountStage(body, pitch) {
    const M = CM();
    const stage = body.querySelector('[data-sc-stage]');
    const scene = SC().create(stage, { sound: settings().sound, fieldSpots: M.FIELD_SPOTS });
    scene.setPitch(pitch);
    const mute = stage.querySelector('[data-sc-mute]');
    const paintMute = () => {
      const on = settings().sound;
      mute.textContent = on ? '🔊' : '🔇';
      mute.setAttribute('aria-label', on ? tr('sound.off', 'Mute sound') : tr('sound.on', 'Turn sound on'));
    };
    mute.addEventListener('click', () => {
      const st = settings();
      st.sound = !st.sound;
      saveSettings(st);
      scene.setSound(st.sound);
      scene.unlockAudio();
      paintMute();
    });
    paintMute();
    stage.querySelector('[data-sc-replay]').addEventListener('click', () => scene.replay(0.5));
    body.addEventListener('pointerdown', () => scene.unlockAudio(), { once: true });
    return scene;
  }
  function showReplayChip(body, on) {
    const b = body && body.querySelector('[data-sc-replay]');
    if (b) b.hidden = !on;
  }
  function flash(body, text, kind) {
    const el = body && body.querySelector('[data-rw-outcome]');
    if (!el) return;
    el.textContent = text;
    el.className = 'rw-sports-outcome is-show' + (kind ? ' is-' + kind : '');
    clearTimeout(flash._t);
    flash._t = setTimeout(() => el.classList.remove('is-show'), 1500);
  }
  /** Rules sheet with this match's house rules (format, preset, the preset's toggles, tie-break). */
  function openRules(match) {
    const C = CE();
    const m = match || settings();
    if (window.DangalRules && typeof window.DangalRules.openSheet === 'function') {
      const rules = C.makeRules(m.preset, m.toggles, m.tie);
      const variants = { format: C.normFormat(m.format), preset: rules.preset, tie: rules.tie };
      C.PRESETS[rules.preset].toggles.forEach((k) => (variants[k] = k === 'bounceCatch' ? !!rules.bounceCatch : !!rules[k]));
      return window.DangalRules.openSheet(GAME, { variants });
    }
    const laws = C.lawsTable();
    Kit().openSheet({
      title: tr('rules', 'Rules'),
      bodyHtml: `<div class="sc-laws"><p class="pk-field-help">${esc(laws.source)}</p>${laws.rows.map((r) => `<div class="sc-line"><span>${esc(r[0])}</span><span>${esc(r[1])}</span></div>`).join('')}
        ${laws.presets.map((p) => `<h4>${esc(p.label)}${p.rated ? '' : ' · ' + esc(tr('unrated', 'unrated'))}</h4><ul>${p.tweaks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}</div>`,
    });
  }

  function resultTitle(state, mySide) {
    const r = state.result || {};
    if (mySide == null) return r.text || tr('res.over', 'Match over');
    if (r.kind === 'win') return r.winner === mySide ? tr('res.won', 'You won') : tr('res.lost', 'You lost');
    if (r.kind === 'tie') return tr('res.tie', 'Match tied');
    return tr('res.noResult', 'No result');
  }

  /** o = { note, vsBest, recap, getRecap, comm, persona, actions, handlers } */
  function resultScreen(view, state, mySide, o) {
    const C = CE();
    const pauseBtn = view.overlay.querySelector('#scPause');
    if (pauseBtn) pauseBtn.hidden = true;
    const sum = C.shareSummary(state);
    const recapNow = () => (o.getRecap ? o.getRecap() : o.recap) || '';
    const stats = shareStatsFor(state, recapNow());
    const lines = sum.lines.map((l) => `<div class="sc-sum-line">${esc(l)}</div>`).join('');
    const scoreHtml = `<div class="sc-sum">${lines}${sum.top ? `<div class="sc-sum-top">${esc(tr('share.top', 'Top performer'))}: ${esc(sum.top)}</div>` : ''}
      <p class="sc-recap" data-sc-recap>${esc(recapNow())}</p>
      <div class="sc-sum-note" data-sc-note>${esc(o.note || '')}</div></div>`;
    const actions = (o.actions || []).concat([
      { label: tr('card.title', 'Scorecard'), primary: false, id: 'card' },
      { label: tr('shareShort', 'Share'), primary: false, id: 'share' },
    ]);
    const shareCard = typeof buildGameShareCard === 'function' ? buildGameShareCard(GAME, stats) : '';
    if (typeof gameResultHtml === 'function') {
      view.body.innerHTML = gameResultHtml({
        gameId: GAME,
        glyph: '🏏',
        title: resultTitle(state, mySide),
        subtitle: state.result ? state.result.text : '',
        vsBest: o.vsBest || '',
        scoreHtml,
        shareCardHtml: shareCard,
        challenge: false,
        hideStats: true,
        hideMissions: true,
        actions,
      });
    } else {
      view.body.innerHTML = `<div class="rw-sports-card"><h2>${esc(resultTitle(state, mySide))}</h2><p>${esc(state.result ? state.result.text : '')}</p>${scoreHtml}
        ${actions.map((a) => `<button type="button" class="btn${a.primary ? ' btn--primary' : ''}" data-result-action="0" data-result-id="${esc(a.id)}">${esc(a.label)}</button>`).join('')}</div>`;
    }
    const handlers = Object.assign(
      {
        card: () => openScorecardSheet(state, { recap: recapNow(), comm: o.comm }),
        share: () => shareScorecard(state, recapNow()),
      },
      o.handlers || {}
    );
    if (typeof wireGameResultActions === 'function') wireGameResultActions(view.body, handlers);
    else view.body.querySelectorAll('[data-result-id]').forEach((b) => b.addEventListener('click', () => handlers[b.dataset.resultId] && handlers[b.dataset.resultId](b)));
  }
  function paintRecap(body, text) {
    const el = body && body.querySelector('[data-sc-recap]');
    if (el && text) el.textContent = text;
  }

  // ---------------- local match: vs Bot · Chase ----------------

  /**
   * @param {{ kind: 'ai'|'chase', format?, source? }} o
   */
  function startLocal(o) {
    const C = CE();
    const M = CM();
    if (!C || !M || !SC()) {
      toast(LABEL + ' ' + tr('loading', 'is still loading — try again'));
      return;
    }
    const s = settings();
    const chase = o.kind === 'chase';
    const format = C.normFormat(o.format || s.format);
    const tier = M.tierOf(s.level);
    const seed0 = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const pitch = M.rollPitch(s.preset, seed0);
    const botName = tierLabel(tier);
    const matchKey = 'local_' + seed0.toString(36);
    const title = chase ? tr('mode.chase', 'Chase') : tr('mode.vsBot', 'vs') + ' ' + botName;
    let seedN = seed0;
    const nextSeed = () => (seedN = (Math.imul(seedN ^ (seedN >>> 15), 2246822519) + 0x9e3779b9) >>> 0);

    let config = null;
    const log = [];
    let state = null;
    let phase = chase ? 'idle' : 'toss'; // toss | idle | ball | review | drs | result | done
    let del = null;
    let ballAt = 0;
    let swung = false;
    let pending = null;
    const overs = {};
    let myOver = { type: pitch === 'dusty' ? 'spin' : 'pace', field: 'balanced' };
    const plan = { line: 'off', length: 'good', variation: 'stock' };
    let foot = 'stay';
    let run = 'one';
    let meterAt = 0;
    let meterRaf = 0;
    let timers = [];
    let reviewTimer = 0;
    let pauseCtrl = null;
    let scene = null;
    let feed = null;
    let recap = '';
    const aiAsked = {};
    let coachShown = readJson(KEY_COACH, false) === true;

    const view = openMatchView({
      pause: true,
      subtitle: title + ' · ' + C.FORMATS[format].label + (s.preset !== 'standard' ? ' · ' + C.PRESETS[s.preset].label : ''),
      onBack: async () => {
        if (phase !== 'done' && log.length && typeof confirmLeaveGame === 'function') {
          const go = await confirmLeaveGame({ title: tr('leave.title', 'Leave the match?'), body: tr('leave.practice', 'This practice match will end.') });
          if (!go) return;
        }
        view.close('dismissed');
      },
      onCleanup: () => stop(),
    });
    if (!view) return;
    const body = view.body;

    function clearTimers() {
      timers.forEach((id) => clearTimeout(id));
      timers = [];
      clearInterval(reviewTimer);
      reviewTimer = 0;
    }
    function stopMeter() {
      if (meterRaf) cancelAnimationFrame(meterRaf);
      meterRaf = 0;
    }
    function stop() {
      clearTimers();
      stopMeter();
      if (scene) scene.destroy();
      scene = null;
      try {
        if (pauseCtrl) pauseCtrl.destroy();
      } catch (e) {}
    }
    const later = (fn, ms) => timers.push(setTimeout(() => view.alive() && fn(), ms));
    const paused = () => !!(pauseCtrl && pauseCtrl.isPaused && pauseCtrl.isPaused());
    const inn = () => C.current(state);
    const meBatting = () => inn().bat === 0;
    const overKey = () => inn().n + ':' + Math.floor(inn().legal / 6);

    function ctxNow() {
      const I = inn();
      const ballsLeft = I.overs * 6 - I.legal;
      const need = I.target ? I.target - I.runs : 0;
      const rrr = I.target && ballsLeft ? (need * 6) / ballsLeft : 0;
      const striker = I.batters[I.striker];
      return {
        pitch,
        rrr,
        target: I.target,
        need,
        ballsLeft,
        death: ballsLeft <= 6 && I.overs > 1,
        newBatter: striker ? striker.b < 3 : true,
        favoured: M.favouredRegion(state),
        lastWicket: I.wkts === I.limit - 1,
      };
    }
    /** This over's type + field: the bot picks at the start of its over; mine carries over. */
    function overNow() {
      const k = overKey();
      if (!overs[k]) {
        if (meBatting()) {
          const c = ctxNow();
          overs[k] = { type: M.botType({ pitch }, nextSeed()), field: M.botField(Object.assign({ tier }, c), nextSeed()), fresh: true };
        } else overs[k] = { type: myOver.type, field: myOver.field, fresh: true };
      }
      return overs[k];
    }

    // ---- toss ----
    function renderToss(step, data) {
      const d = data || {};
      const bf = d.battingFirst;
      let t;
      if (step === 'call') t = { title: tr('toss.call', 'Call the toss'), buttons: [{ id: 'heads', label: tr('toss.heads', 'Heads'), primary: true }, { id: 'tails', label: tr('toss.tails', 'Tails') }] };
      else if (step === 'flip') t = { title: tr('toss.flipping', 'Coin in the air…'), spinning: true };
      else if (step === 'choose') t = { coin: d.coin, title: tr('toss.youWon', 'You won the toss'), sub: tr('toss.choose', 'Bat or bowl first?'), buttons: [{ id: 'bat', label: tr('toss.bat', 'Bat'), primary: true }, { id: 'bowl', label: tr('toss.bowl', 'Bowl') }] };
      else
        t = {
          coin: d.coin,
          title: botName + ' ' + tr('toss.won', 'won the toss'),
          sub: bf === 1 ? tr('toss.botBats', 'They bat first — you bowl') : tr('toss.botBowls', 'They bowl first — you bat'),
          buttons: [{ id: 'start', label: tr('toss.start', 'Start'), primary: true }],
        };
      body.innerHTML = tossHtml(Object.assign({ pitch }, t));
      body.querySelectorAll('[data-sc-toss]').forEach((b) =>
        b.addEventListener('click', () => {
          const id = b.dataset.scToss;
          feedback('select');
          if (id === 'heads' || id === 'tails') {
            renderToss('flip');
            if (SC()) SC().sfx('bounce');
            const coin = M.mulberry32(nextSeed())() < 0.5 ? 'heads' : 'tails';
            later(() => {
              if (coin === id) renderToss('choose', { coin });
              else {
                const botBats = pitch === 'flat' || pitch === 'tarmac';
                renderToss('bot', { coin, battingFirst: botBats ? 1 : 0 });
              }
            }, 1300);
          } else if (id === 'bat') begin(0);
          else if (id === 'bowl') begin(1);
          else if (id === 'start') begin(bf);
        })
      );
    }

    function begin(battingFirst) {
      config = C.createMatch({
        format,
        preset: s.preset,
        toggles: s.toggles,
        tie: s.tie,
        pitch,
        sides: [
          { pid: 'me', name: myName() },
          { pid: 'bot', name: botName },
        ],
        battingFirst,
        target: chase ? C.chaseTarget(format, seed0) : 0,
      });
      state = C.replay(config, log);
      state.log = log;
      feed = createFeed(seed0, s.persona);
      mount();
      toIdle();
      const first = chase
        ? tr('start.chase', 'Chase') + ' ' + state.innings[0].target + ' ' + tr('start.in', 'in') + ' ' + config.overs + ' ' + (config.overs === 1 ? tr('over1', 'over') : tr('overs', 'overs'))
        : battingFirst === 0
          ? tr('start.youBat', 'You bat first')
          : tr('start.youBowl', 'You bowl first');
      flash(body, first, 'extra');
    }

    function mount() {
      body.innerHTML = matchLayoutHtml();
      scene = mountStage(body, pitch);
      body.querySelector('[data-sc-open-card]').addEventListener('click', () => openScorecardSheet(state, { comm: feed.list }));
      body.querySelector('[data-sc-open-rules]').addEventListener('click', () => openRules({ format, preset: s.preset, toggles: s.toggles, tie: s.tie }));
      body.querySelector('[data-sc-comm]').addEventListener('click', () => openCommentarySheet(feed.list, s.persona));
    }

    // ---- panels ----
    function ensurePanel(role) {
      const ctl = body.querySelector('[data-sc-controls]');
      if (ctl.dataset.role === role) return ctl;
      ctl.dataset.role = role;
      if (role === 'bat') {
        ctl.innerHTML = batPanelHtml({ foot, run, local: true });
        ctl.querySelectorAll('[data-sc-shot]').forEach((b) => b.addEventListener('click', () => onShot(b.dataset.scShot)));
        ctl.querySelector('[data-sc-main]').addEventListener('click', onFace);
        wireMini(ctl, (name, v) => {
          if (name === 'foot') foot = v;
          if (name === 'run') run = v;
          setMini(ctl, name, v);
          feedback('select');
        });
      } else if (role === 'bowl') {
        const ov = overNow();
        if (M.VARIATIONS[ov.type].indexOf(plan.variation) < 0) plan.variation = 'stock';
        ctl.innerHTML = bowlPanelHtml({ plan, over: ov, locked: !ov.fresh });
        wireMini(ctl, onBowlPick);
        ctl.querySelector('[data-sc-field]').addEventListener('change', (e) => {
          const cur = overNow();
          if (!cur.fresh) return;
          cur.field = myOver.field = e.target.value;
          scene.setField(cur.field);
          ctl.querySelector('[data-sc-field-help]').textContent = tr('fieldHelp.' + cur.field, FIELD_HELP[cur.field]);
        });
        ctl.querySelector('[data-sc-main]').addEventListener('click', onBowl);
      } else ctl.innerHTML = '';
      return ctl;
    }
    function onBowlPick(name, v) {
      const ov = overNow();
      if (name === 'type') {
        if (!ov.fresh) return;
        ov.type = myOver.type = v;
        const ctl = body.querySelector('[data-sc-controls]');
        ctl.dataset.role = '';
        ensurePanel('bowl');
        feedback('select');
        return;
      }
      plan[name] = v;
      if (name === 'variation' && M.VARIATION_LENGTH[v]) plan.length = M.VARIATION_LENGTH[v];
      if (name === 'length' && M.VARIATION_LENGTH[plan.variation]) plan.variation = 'stock';
      const ctl = body.querySelector('[data-sc-controls]');
      setMini(ctl, 'line', plan.line);
      setMini(ctl, 'length', plan.length, !!M.VARIATION_LENGTH[plan.variation]);
      setMini(ctl, 'variation', plan.variation);
      const risk = ctl.querySelector('[data-sc-risk]');
      if (risk) risk.textContent = riskText(plan, ov.type);
      feedback('select');
    }
    function runMeter() {
      stopMeter();
      const tick = () => {
        const needle = body.querySelector('[data-sc-needle]');
        if (!needle || phase !== 'idle' || meBatting()) {
          meterRaf = 0;
          return;
        }
        needle.style.left = (meterPos(Date.now() - meterAt) * 100).toFixed(1) + '%';
        meterRaf = requestAnimationFrame(tick);
      };
      meterRaf = requestAnimationFrame(tick);
    }

    function paint() {
      if (!state || !body.querySelector('[data-sc-strip]')) return;
      const strip = C.liveStrip(state);
      const I = inn();
      body.querySelector('[data-sc-strip]').innerHTML = stripHtml(strip);
      body.querySelector('[data-sc-over]').innerHTML = overDotsHtml(strip.thisOver);
      body.querySelector('[data-sc-conf]').innerHTML = confHtml(strip, config.rules.drs ? I.reviews[meBatting() ? 'bat' : 'bowl'] : null);
      const hint = body.querySelector('[data-sc-hint]');
      if (phase === 'review' || phase === 'drs') return;
      if (meBatting()) {
        const ctl = ensurePanel('bat');
        const inFlight = phase === 'ball' && !swung;
        ctl.querySelectorAll('[data-sc-shot]').forEach((b) => (b.disabled = !inFlight));
        const spin = (del ? del.type : overNow().type) === 'spin';
        setMini(ctl, 'foot', spin ? foot : 'stay', !spin);
        const main = ctl.querySelector('[data-sc-main]');
        main.hidden = phase === 'ball';
        main.disabled = phase !== 'idle';
        if (phase === 'idle') {
          const ov = overNow();
          hint.textContent = coachShown
            ? botName + ' · ' + lbl('type', ov.type) + ' · ' + lbl('field', ov.field) + ' ' + tr('field.lower', 'field')
            : tr('hint.coach', 'Watch the landing marker, then tap a shot as the ball reaches the glowing band');
        } else if (phase === 'ball') hint.textContent = spin ? tr('hint.spin', 'Spin — step out to go big (stumping risk)') : tr('hint.time', 'Tap a shot as the ball reaches the glowing band');
      } else {
        const ctl = ensurePanel('bowl');
        const ov = overNow();
        const main = ctl.querySelector('[data-sc-main]');
        main.disabled = phase !== 'idle';
        ctl.querySelectorAll('[data-sc-mini="type"] .sc-mini-btn').forEach((b) => (b.disabled = !ov.fresh || phase !== 'idle'));
        const fsel = ctl.querySelector('[data-sc-field]');
        if (fsel) fsel.disabled = !ov.fresh || phase !== 'idle';
        if (phase === 'idle') {
          hint.textContent = ov.fresh ? tr('hint.overSetup', 'New over — set type and field, then bowl') : tr('hint.bowl', 'Pick line, length and ball — tap Bowl with the needle in the green');
          runMeter();
        } else if (phase === 'ball') hint.textContent = botName + ' ' + tr('hint.botBat', 'is batting…');
      }
    }

    function toIdle() {
      clearTimers();
      phase = 'idle';
      del = null;
      pending = null;
      if (!meBatting()) meterAt = Date.now();
      scene.setField(overNow().field);
      paint();
    }

    function onFace() {
      if (paused() || phase !== 'idle' || !meBatting()) return;
      if (!coachShown) {
        coachShown = true;
        writeJson(KEY_COACH, true);
      }
      const I = inn();
      const ov = overNow();
      const striker = I.batters[I.striker];
      const historyB = I.balls.filter((b) => b.striker === (striker && striker.name) && b.length);
      const b = M.botBowl({ tier, type: ov.type, history: historyB, death: ctxNow().death, field: ov.field }, nextSeed());
      startBall(M.execute(b.plan, b.accuracy, M.mulberry32(nextSeed())));
    }
    function onBowl() {
      if (paused() || phase !== 'idle' || meBatting()) return;
      const acc = M.meterAccuracy(Date.now() - meterAt);
      const ov = overNow();
      const p = M.normPlan({ type: ov.type, line: plan.line, length: plan.length, variation: plan.variation });
      startBall(M.execute(p, acc, M.mulberry32(nextSeed())), acc);
    }

    function startBall(d, acc) {
      clearTimers();
      stopMeter();
      const ov = overNow();
      ov.fresh = false;
      del = d;
      ballAt = Date.now() + 250;
      swung = false;
      phase = 'ball';
      showReplayChip(body, false);
      scene.setField(ov.field);
      scene.bowl(d, ballAt, () => Date.now(), log.length);
      paint();
      if (acc != null) body.querySelector('[data-sc-hint]').textContent = tr('hint.accuracy', 'Accuracy') + ' ' + Math.round(acc * 100) + '%' + (d.missed ? ' · ' + tr('hint.missed', 'missed the target') : '');
      feedback('place');
      if (meBatting()) {
        later(() => {
          if (phase === 'ball' && !swung) play({ shot: 'defend', foot: 'stay', run: 'hold', timing: 'late', auto: 'defend' });
        }, 250 + d.runupMs + d.flightMs * d.lateEnd + 220);
      } else {
        const c = ctxNow();
        const b = M.botBat(Object.assign({ tier, delivery: d, field: ov.field }, c), nextSeed());
        later(() => {
          if (phase !== 'ball') return;
          if (!d.extra || d.extra === 'nb') scene.swing(b.shot);
          play(b);
        }, 250 + M.tapFor(d, b.timing));
      }
    }

    function onShot(shot) {
      if (paused() || phase !== 'ball' || !meBatting() || swung || !del) return;
      const tMs = Date.now() - ballAt;
      if (tMs < del.runupMs) return;
      swung = true;
      scene.swing(shot);
      feedback('bat');
      play({ shot, foot: del.type === 'spin' ? foot : 'stay', run, timing: M.timingOf(del, tMs) });
    }

    function play(choice) {
      clearTimers();
      const I = inn();
      const striker = I.batters[I.striker];
      const ov = overNow();
      let ev = M.resolve(
        { delivery: del, shot: choice.shot, foot: choice.foot, run: choice.run, timing: choice.timing, conf: striker ? striker.conf : 20, field: ov.field, pitch, rules: config.rules },
        nextSeed()
      );
      if (choice.auto) ev.auto = choice.auto;
      if (ev.appeal && config.rules.drs) {
        const side = M.reviewer(ev);
        if (I.reviews[side] > 0) {
          const mine = (side === 'bat') === meBatting();
          scene.outcome(Object.assign({}, ev, { out: '' }), { mine: false });
          if (mine) return askReview(ev, side);
          if (M.botReview(ev, tier, nextSeed())) return runDrs(ev, side, botName);
          return commit(ev, true);
        }
      }
      commit(ev, false);
    }

    function askReview(ev, side) {
      phase = 'review';
      pending = { ev, side };
      const ctl = ensurePanel('review');
      const left = inn().reviews[side];
      let until = Date.now() + LOCAL_REVIEW_MS;
      const q = ev.appeal.onField === 'out' ? tr('review.given', 'Given OUT') + ' (' + (ev.appeal.kind === 'lbw' ? 'LBW' : tr('appeal.caught', 'caught behind')) + ')' : tr('review.notGiven', 'Not out') + ' (' + (ev.appeal.kind === 'lbw' ? 'LBW' : tr('appeal.caught', 'caught behind')) + ')';
      flash(body, appealText(ev.appeal), 'extra');
      feedback('select');
      const paintQ = () => {
        const secs = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        const sub = ctl.querySelector('[data-sc-rv-sub]');
        if (sub) sub.textContent = left + ' ' + (left === 1 ? tr('review.left1', 'review left') : tr('review.leftN', 'reviews left')) + ' · ' + secs + 's';
        if (secs <= 0 && !paused()) decide(false);
      };
      ctl.innerHTML = `<div class="sc-review" role="alertdialog" aria-label="${esc(tr('review.title', 'Review?'))}">
        <div class="sc-review-q">${esc(q)} — ${esc(tr('review.ask', 'review it?'))}</div>
        <div class="sc-review-sub" data-sc-rv-sub></div>
        <div class="sc-review-btns"><button type="button" class="btn btn--secondary" data-rv="0">${esc(tr('review.accept', 'Accept'))}</button><button type="button" class="btn btn--primary" data-rv="1">${esc(tr('review.go', 'Review'))}</button></div>
      </div>`;
      const decide = (yes) => {
        clearInterval(reviewTimer);
        reviewTimer = 0;
        if (phase !== 'review' || !pending) return;
        const p = pending;
        pending = null;
        if (yes) runDrs(p.ev, p.side, myName());
        else commit(p.ev, true);
      };
      ctl.querySelectorAll('[data-rv]').forEach((b) => b.addEventListener('click', () => decide(b.dataset.rv === '1')));
      askReview.extend = () => (until = Date.now() + LOCAL_REVIEW_MS);
      paintQ();
      reviewTimer = setInterval(() => view.alive() && paintQ(), 250);
    }

    function runDrs(ev, side, who) {
      phase = 'drs';
      ensurePanel('none');
      const r = M.applyReview(ev, side);
      body.querySelector('[data-sc-hint]').textContent = who + ' ' + tr('drs.reviews', 'reviews') + ' · ' + tr('drs.simulated', 'simulated ball-tracking');
      scene.drs(ev.appeal, M.UMPIRE);
      feedback('select');
      later(() => {
        flash(body, drsVerdict(r.drs), r.drs.decision === 'out' ? 'out' : 'extra');
        later(() => {
          scene.clearDrs();
          commit(r, true);
        }, 1100);
      }, DRS_VIEW_MS - 1100);
    }

    function commit(ev, shown) {
      clearTimers();
      const prevInn = state.cur;
      log.push(ev);
      state = C.replay(config, log);
      state.log = log;
      phase = 'result';
      const mineBat = prevBatWasMe(prevInn);
      if (!shown) scene.outcome(ev, { mine: mineBat ? !ev.out : !!ev.out });
      const lb = lastBallOf(state);
      const kind = outcomeKind(lb);
      flash(body, ev.drs ? drsVerdict(ev.drs) : outcomeWord(lb), kind);
      body.querySelector('[data-sc-controls]').dataset.role = '';
      paint();
      const hint = body.querySelector('[data-sc-hint]');
      if (hint && lb) hint.textContent = (ev.auto ? tr('hint.auto', 'No shot in time — auto defend') + ' · ' : '') + lb.text;
      const good = mineBat ? kind === 'boundary' : kind === 'out';
      feedback(kind === 'out' ? (good ? 'win' : 'lose') : kind === 'boundary' ? (good ? 'win' : 'bat') : 'bat');
      const fresh = feed.update(state);
      if (fresh.length) showComm(body, fresh[fresh.length - 1], s.persona, true);
      if (isHighlight(ev)) {
        showReplayChip(body, true);
        later(() => scene.replay(0.5), 900);
      }
      maybeAiOver(prevInn);
      if (state.result) return later(finish, isHighlight(ev) ? 2600 : 1400);
      const changed = state.cur !== prevInn;
      later(() => {
        toIdle();
        if (changed) {
          const cur = inn();
          const msg = cur.super
            ? tr('break.super', 'Scores level — Super Over!')
            : tr('break.innings', 'Innings break') + ' — ' + state.config.sides[cur.bat].name + ' ' + tr('break.need', 'need') + ' ' + cur.target;
          flash(body, msg, 'extra');
          body.querySelector('[data-sc-hint]').textContent = msg;
        }
      }, changed ? 1800 : isHighlight(ev) ? 1500 : 1100);
    }
    function prevBatWasMe(innIdx) {
      const I = state.innings[innIdx];
      return I ? I.bat === 0 : false;
    }

    /** After an over completes (or an innings ends), ask for AI lines for it — one call per over. */
    function maybeAiOver(prevInn) {
      if (aiSession.off || !settings().aiComm || !CC()) return;
      const I = state.innings[prevInn];
      if (!I) return;
      const done = I.legal > 0 && (I.legal % 6 === 0 || state.cur !== prevInn || state.result);
      if (!done) return;
      const over = Math.ceil(I.legal / 6) - 1;
      const key = prevInn + '_' + over;
      if (aiAsked[key]) return;
      aiAsked[key] = 1;
      const moments = CC().overMoments(state, prevInn, over);
      if (!moments.length) return;
      aiCommentary({ gameId: GAME, mode: 'over', persona: s.persona, moments: moments.slice(0, 8).map(CC().compactMoment) }).then((d) => {
        if (!d || !Array.isArray(d.lines) || !view.alive()) return;
        const map = {};
        d.lines.forEach((x) => {
          if (x && moments[x.i]) map[moments[x.i].key] = x.line;
        });
        if (feed.applyAi(map) && body.querySelector('[data-sc-comm]')) showComm(body, feed.last(), s.persona, false);
      });
    }

    function finish() {
      phase = 'done';
      stop();
      const r = state.result;
      const won = r.kind === 'win' && r.winner === 0;
      const tied = r.kind === 'tie';
      const myInn = state.innings.find((i) => !i.super && i.bat === 0);
      const myRuns = myInn ? myInn.runs : 0;
      recap = CC() ? CC().recapTemplate(state, s.persona) : '';
      saveHistory(historyEntry(matchKey, chase ? 'chase' : 'ai', title, state, 0, recap, s.persona));
      let vsBest = '';
      if (typeof setGamePB === 'function') {
        const pbId = chase ? 'streetcricket_chase' : 'streetcricket_over';
        vsBest = typeof formatVsBest === 'function' ? formatVsBest(pbId, myRuns) : '';
        setGamePB(pbId, myRuns);
        if (chase && won && typeof getGamePB === 'function') setGamePB('streetcricket_chase_wins', (getGamePB('streetcricket_chase_wins') || 0) + 1);
      }
      if (typeof recordGameResult === 'function') {
        try {
          recordGameResult(GAME, won, tied, { score: myRuns, mode: chase ? 'chase' : 'practice', variant: format, difficulty: tier });
        } catch (e) {}
      }
      view.setOutcome(won ? 'win' : tied ? 'draw' : 'loss');
      feedback(won ? 'win' : tied ? 'complete' : 'lose');
      resultScreen(view, state, 0, {
        vsBest,
        getRecap: () => recap,
        comm: feed.list,
        actions: [{ label: chase ? tr('again.chase', 'Chase again') : tr('again', 'Play again'), primary: true, id: 'again' }],
        handlers: {
          again: () => {
            view.close('done');
            setTimeout(() => startLocal(o), 150);
          },
        },
      });
      if (CC()) {
        aiCommentary({ gameId: GAME, mode: 'recap', persona: s.persona, facts: CC().recapFacts(state) }).then((d) => {
          if (!d || !d.recap) return;
          recap = d.recap;
          saveHistory(historyEntry(matchKey, chase ? 'chase' : 'ai', title, state, 0, recap, s.persona));
          if (view.alive()) paintRecap(body, recap);
        });
      }
    }

    if (typeof createGamePauseController === 'function') {
      pauseCtrl = createGamePauseController({
        host: view.overlay,
        pauseBtnId: 'scPause',
        onPause() {
          // A paused delivery is a dead ball: re-bowled on resume, nothing is logged.
          if (phase === 'ball') {
            clearTimers();
            del = null;
            if (scene) scene.reset();
            phase = 'idle';
            if (state && !meBatting()) meterAt = Date.now();
          }
          stopMeter();
        },
        onResume() {
          if (phase === 'review' && askReview.extend) askReview.extend();
          if (phase === 'idle') {
            if (state && !meBatting()) meterAt = Date.now();
            paint();
          }
        },
        onQuit() {
          view.close('quit');
        },
      });
    }

    if (chase) begin(0);
    else renderToss('call');
  }

  // ---------------- Live 1v1 (and Watch) ----------------

  let lastRtt = 0;
  function noteRtt(ms) {
    if (!(ms > 0) || ms > 10000) return;
    lastRtt = lastRtt ? Math.round(lastRtt * 0.7 + ms * 0.3) : Math.round(ms);
  }
  async function liveCall(op, args) {
    if (typeof apiFetch !== 'function') throw Object.assign(new Error('Offline'), { code: 'OFFLINE' });
    const t0 = Date.now();
    const res = await apiFetch('/api/media-config', {
      method: 'POST',
      needAuth: true,
      body: Object.assign({ action: 'cricket_match', op }, args || {}),
    });
    noteRtt(Date.now() - t0);
    if (!res || !res.ok) {
      const e = new Error((res && res.error && res.error.message) || 'Something went wrong');
      e.code = (res && res.error && res.error.code) || 'ERROR';
      throw e;
    }
    return res.data || {};
  }
  function liveErrorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (code === 'NOT_IN_MATCH') return tr('err.notIn', 'This match is for two other players');
    if (code === 'RATE_LIMITED') return tr('err.rate', 'Slow down a little — try again in a moment');
    if (code === 'MATCH_NOT_FOUND') return tr('err.gone', 'That match has ended');
    if (code === 'BAD_OPPONENT') return tr('err.opp', 'Pick a real opponent');
    if (code === 'MID_OVER') return tr('err.midOver', 'Type and field change between overs');
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? tr('err.offline', 'You’re offline — reconnect to keep playing')
      : tr('err.generic', 'Couldn’t reach the match — try again');
  }
  function logOf(pub) {
    const l = pub && pub.log;
    const arr = Array.isArray(l) ? l.filter(Boolean) : l ? Object.keys(l).sort((a, b) => a - b).map((k) => l[k]) : [];
    return arr.map((e) => Object.assign({ extra: '', out: '', runs: 0 }, e));
  }
  /** pub.ai → { momentKey: line } (per-over batches written by the server). */
  function aiLinesOf(pub) {
    const map = {};
    const ai = (pub && pub.ai) || {};
    Object.keys(ai).forEach((k) => {
      if (k === 'recap') return;
      const v = ai[k];
      const arr = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).map((i) => v[i]) : [];
      arr.forEach((x) => {
        if (x && x.k && typeof x.line === 'string') map[x.k] = x.line;
      });
    });
    return map;
  }

  /**
   * @param {{ matchId: string, opponentUid?: string, host?: boolean, stake?: number, oppName?: string, chat?: object, source?: string, matchmaking?: boolean, spectate?: boolean }} cfg
   */
  function startLive(cfg) {
    const C = CE();
    const M = CM();
    if (!C || !M || !SC()) {
      toast(LABEL + ' ' + tr('loading', 'is still loading — try again'));
      return;
    }
    const me = myUid();
    const spectator = !!cfg.spectate;
    const opp = cfg.opponentUid;
    const matchId = cleanId(cfg.matchId);
    const s = settings();
    if (!me || !matchId || (!spectator && !persistable(opp))) {
      toast(spectator ? tr('err.watch', 'Sign in to watch this match') : tr('err.link', 'That challenge link is broken — try again from Dangal'));
      return;
    }
    const ref = typeof rtdb !== 'undefined' && rtdb ? rtdb.ref('games/cricket/' + matchId) : null;
    const TS = window.firebase && firebase.database && firebase.database.ServerValue ? firebase.database.ServerValue.TIMESTAMP : Date.now();
    let pub = null;
    let presence = {};
    let offset = 0;
    let stopped = false;
    let left = false;
    let switching = false;
    let rematchAsked = false;
    let shownLog = -1;
    let animBall = -1;
    let hitSent = -1;
    let bowlSent = -1;
    let reviewSent = -1;
    let appealShown = -1;
    let lastTick = 0;
    let lastSettle = 0;
    let historySaved = false;
    let overShown = false;
    let mode = '';
    let tossSig = '';
    let scene = null;
    let feed = null;
    let foot = 'stay';
    let run = 'one';
    const plan = { line: 'off', length: 'good', variation: 'stock' };
    let overLocal = null;
    let meterRaf = 0;
    const commentAsked = {};
    let recapAsked = false;
    const timers = [];
    const subs = [];

    const view = openMatchView({
      live: true,
      subtitle: spectator ? tr('sub.watching', 'Watching') : tr('sub.live', 'Live'),
      onBack: async () => {
        if (spectator) return view.close('done');
        const playing = pub && (pub.status === 'playing' || pub.status === 'waiting');
        if (playing && typeof confirmLeaveGame === 'function') {
          const go = await confirmLeaveGame({
            title: pub.status === 'waiting' ? tr('leave.cancelTitle', 'Cancel the challenge?') : tr('leave.liveTitle', 'Leave and forfeit?'),
            body:
              pub.status === 'waiting'
                ? tr('leave.cancelBody', 'No chips move.')
                : tr('leave.liveBody', 'Leaving now gives your opponent the win') + (pub.stake ? ' ' + tr('leave.andChips', 'and your staked chips.') : '.'),
          });
          if (!go) return;
        }
        if (playing) {
          left = true;
          liveCall('leave', { matchId }).catch(() => {});
        }
        view.close(playing ? 'quit' : 'done');
      },
      onCleanup: () => {
        if (!spectator && !left && !switching && pub && (pub.status === 'playing' || pub.status === 'waiting')) {
          left = true;
          liveCall('leave', { matchId }).catch(() => {});
        }
        stop();
      },
    });
    if (!view) return;
    const body = view.body;
    const serverNow = () => Date.now() + offset;
    const nameOf = (uid) => (pub && pub.names && pub.names[uid]) || (uid === opp && cfg.oppName) || tr('player', 'Player');
    const oppName = () => (spectator ? '' : nameOf(opp));
    const mySide = () => (spectator ? null : pub && pub.playerB === me ? 1 : 0);
    const persona = () => (pub && pub.persona === 'fan' ? 'fan' : 'calm');
    const stateNow = () => {
      const log = logOf(pub);
      const st = C.replay(C.liveConfig(pub), log);
      st.log = log;
      return st;
    };
    const uidOfSide = (side) => (side === 1 ? pub.playerB : pub.playerA);

    function destroyScene() {
      if (meterRaf) cancelAnimationFrame(meterRaf);
      meterRaf = 0;
      if (scene) scene.destroy();
      scene = null;
    }
    function stop() {
      if (stopped) return;
      stopped = true;
      destroyScene();
      timers.forEach((id) => clearInterval(id));
      subs.forEach((fn) => {
        try {
          fn();
        } catch (e) {}
      });
      if (presRef) {
        presRef.set({ at: TS, online: false }).catch(() => {});
        try {
          presRef.onDisconnect().cancel();
        } catch (e) {}
      }
    }

    function subtitle() {
      if (!pub) return;
      const bits = [spectator ? tr('sub.watching', 'Watching') : tr('sub.live', 'Live'), C.FORMATS[pub.format] ? C.FORMATS[pub.format].label : ''];
      bits.push(pub.rated ? tr('sub.rated', 'Rated') : C.PRESETS[pub.preset] ? C.PRESETS[pub.preset].label : '');
      if (pub.stake) bits.push('⚡' + pub.stake);
      view.setSub(bits.filter(Boolean).join(' · '));
    }

    function oppOnline() {
      const p = presence[opp];
      if (!p) return false;
      return p.online !== false && serverNow() - (Number(p.at) || 0) < 30000;
    }
    function oppGoneFor() {
      const p = presence[opp];
      const since = p && Number(p.at) ? Number(p.at) : (pub && pub.startedAt) || serverNow();
      return serverNow() - since;
    }

    function simpleCard(title, sub, btns) {
      mode = 'card';
      destroyScene();
      body.innerHTML = `<div class="rw-sports-card sc-wait"><h2>${esc(title)}</h2>${sub ? `<p class="rw-sports-hint">${esc(sub)}</p>` : ''}${(btns || [])
        .map((b) => `<button type="button" class="btn ${b.primary ? 'btn--primary' : 'btn--secondary'} rw-sc-main" data-sc-btn="${esc(b.id)}">${esc(b.label)}</button>`)
        .join('')}</div>`;
      (btns || []).forEach((b) => body.querySelector(`[data-sc-btn="${b.id}"]`)?.addEventListener('click', b.onClick));
    }

    function renderWaiting() {
      if (spectator) return simpleCard(tr('watch.waiting', 'Waiting for both players…'), '', []);
      const mins = Math.max(0, Math.ceil((pub.deadline - serverNow()) / 60000));
      simpleCard(tr('live.waiting', 'Waiting for') + ' ' + oppName(), tr('live.waitingSub', 'They have') + ' ' + mins + ' ' + tr('live.min', 'min to accept. No chips move if they don’t.'), [
        {
          id: 'cancel',
          label: tr('live.cancel', 'Cancel challenge'),
          onClick: () => {
            left = true;
            liveCall('leave', { matchId }).catch(() => {});
            view.close('done');
          },
        },
      ]);
    }
    function renderVoid() {
      const reason = pub.reason === 'no_show' ? (spectator ? tr('live.noShowWatch', 'A player didn’t join in time') : oppName() + ' ' + tr('live.noShow', 'didn’t join in time')) : tr('live.cancelled', 'Challenge cancelled');
      simpleCard(reason, tr('live.noChips', 'No chips moved.'), [
        {
          id: 'home',
          primary: true,
          label: tr('home', 'Back to menu'),
          onClick: () => {
            view.close('done');
            setTimeout(openHome, 120);
          },
        },
      ]);
    }

    // ---- toss: coin call → bat / bowl (a rematch skips the coin: the last toss loser chooses) ----
    function renderToss() {
      const tt = pub.toss || {};
      const coinPhase = pub.phase === 'choose' && !tt.rematch && serverNow() < pub.deadline - 10000;
      const warn = !spectator && pub.rated && lastRtt > HIGH_RTT_MS ? tr('net.warn', 'High latency') + ' (' + lastRtt + ' ms) — ' + tr('net.warnSub', 'your taps may land late in this rated match.') : '';
      let t;
      if (pub.phase === 'toss') {
        if (tt.caller === me) t = { title: tr('toss.call', 'Call the toss'), buttons: [{ id: 'heads', label: tr('toss.heads', 'Heads'), primary: true }, { id: 'tails', label: tr('toss.tails', 'Tails') }] };
        else t = { title: nameOf(tt.caller) + ' ' + tr('toss.calling', 'is calling the toss…') };
      } else if (coinPhase) t = { title: tr('toss.flipping', 'Coin in the air…'), spinning: true };
      else {
        const who = tt.winner === me ? tr('toss.you', 'You') : nameOf(tt.winner);
        const head = tt.rematch ? who + ' ' + tr('toss.rematchChoose', 'choose — rematch') : (tt.coin === 'tails' ? tr('toss.tails', 'Tails') : tr('toss.heads', 'Heads')) + ' — ' + who + ' ' + tr('toss.wonShort', 'won the toss');
        if (tt.winner === me) t = { coin: tt.coin, title: head, buttons: [{ id: 'bat', label: tr('toss.bat', 'Bat'), primary: true }, { id: 'bowl', label: tr('toss.bowl', 'Bowl') }] };
        else t = { coin: tt.coin, title: head, sub: nameOf(tt.winner) + ' ' + tr('toss.choosing', 'is choosing…') };
      }
      const sig = [pub.phase, tt.call, tt.coin, tt.winner, !!t.spinning, !!warn, (t.buttons || []).length].join('|');
      const secs = Math.max(0, Math.ceil((pub.deadline - serverNow()) / 1000));
      const secsText = (t.sub ? t.sub + ' · ' : '') + secs + 's';
      if (mode === 'toss' && sig === tossSig) {
        const el = body.querySelector('[data-sc-secs]');
        if (el) el.textContent = secsText;
        const net = body.querySelector('.sc-toss-net');
        if (net) net.innerHTML = netHtml(lastRtt);
        return;
      }
      mode = 'toss';
      tossSig = sig;
      destroyScene();
      body.innerHTML = tossHtml(Object.assign({ pitch: pub.pitch || 'flat', warn, net: spectator ? null : lastRtt }, t, { sub: secsText }));
      body.querySelectorAll('[data-sc-toss]').forEach((b) =>
        b.addEventListener('click', () => {
          const id = b.dataset.scToss;
          feedback('select');
          body.querySelectorAll('[data-sc-toss]').forEach((x) => (x.disabled = true));
          const p = id === 'heads' || id === 'tails' ? liveCall('call', { matchId, call: id }) : liveCall('choose', { matchId, bat: id === 'bat' });
          p.catch((e) => {
            toast(liveErrorText(e));
            tossSig = '';
            render();
          });
        })
      );
    }

    function mountPlay(st) {
      mode = 'play';
      body.innerHTML = matchLayoutHtml();
      scene = mountStage(body, pub.pitch || 'flat');
      body.querySelector('[data-sc-open-card]').addEventListener('click', () => openScorecardSheet(stateNow(), { comm: feed ? feed.list : [] }));
      body.querySelector('[data-sc-open-rules]').addEventListener('click', () => openRules({ format: pub.format, preset: pub.preset, toggles: pub.toggles || {}, tie: pub.tie }));
      body.querySelector('[data-sc-comm]').addEventListener('click', () => openCommentarySheet(feed ? feed.list : [], persona()));
      const last = feed && feed.last();
      if (last) showComm(body, last, persona(), false);
      if (st) paintStatic(st);
    }
    function paintStatic(st) {
      const strip = C.liveStrip(st);
      const inn = C.current(st);
      const iBat = !spectator && uidOfSide(inn.bat) === me;
      body.querySelector('[data-sc-strip]').innerHTML = stripHtml(strip);
      body.querySelector('[data-sc-over]').innerHTML = overDotsHtml(strip.thisOver);
      body.querySelector('[data-sc-conf]').innerHTML = confHtml(strip, spectator || !st.config.rules.drs ? null : inn.reviews[iBat ? 'bat' : 'bowl']);
      const net = body.querySelector('[data-sc-net]');
      if (net && !spectator) net.innerHTML = netHtml(lastRtt);
    }
    function overView() {
      const o = pub.over || { key: '', type: 'pace', field: 'balanced', fresh: false };
      if (overLocal && overLocal.key === o.key && o.fresh) return Object.assign({}, o, { type: overLocal.type, field: overLocal.field });
      return o;
    }

    function ensurePanel(role) {
      const ctl = body.querySelector('[data-sc-controls]');
      if (ctl.dataset.role === role) return ctl;
      ctl.dataset.role = role;
      if (meterRaf) cancelAnimationFrame(meterRaf);
      meterRaf = 0;
      if (role === 'bat') {
        ctl.innerHTML = batPanelHtml({ foot, run });
        ctl.querySelectorAll('[data-sc-shot]').forEach((b) => b.addEventListener('click', () => onShot(b.dataset.scShot)));
        wireMini(ctl, (name, v) => {
          if (name === 'foot') foot = v;
          if (name === 'run') run = v;
          setMini(ctl, name, v);
          feedback('select');
        });
      } else if (role === 'bowl') {
        const ov = overView();
        if (M.VARIATIONS[ov.type].indexOf(plan.variation) < 0) plan.variation = 'stock';
        if (M.VARIATION_LENGTH[plan.variation]) plan.length = M.VARIATION_LENGTH[plan.variation];
        ctl.innerHTML = bowlPanelHtml({ plan, over: ov, locked: !ov.fresh });
        ctl.dataset.overKey = ov.key + '|' + ov.fresh + '|' + ov.type;
        wireMini(ctl, onBowlPick);
        ctl.querySelector('[data-sc-field]').addEventListener('change', (e) => sendSetup({ field: e.target.value }));
        ctl.querySelector('[data-sc-main]').addEventListener('click', onBowl);
        const tick = () => {
          const needle = body.querySelector('[data-sc-needle]');
          if (!needle || ctl.dataset.role !== 'bowl') {
            meterRaf = 0;
            return;
          }
          const t = serverNow() - (pub.meterAt || 0);
          needle.style.left = (pub.phase === 'bowl' && t >= 0 ? meterPos(t) * 100 : 0).toFixed(1) + '%';
          meterRaf = requestAnimationFrame(tick);
        };
        meterRaf = requestAnimationFrame(tick);
      } else ctl.innerHTML = '';
      return ctl;
    }
    function sendSetup(change) {
      const ov = overView();
      if (!pub.over || !ov.fresh || pub.phase !== 'bowl') return;
      overLocal = { key: pub.over.key, type: change.type || ov.type, field: change.field || ov.field };
      if (scene) scene.setField(overLocal.field);
      const ctl = body.querySelector('[data-sc-controls]');
      ctl.dataset.role = '';
      render();
      liveCall('setup', Object.assign({ matchId }, change)).catch((e) => {
        overLocal = null;
        toast(liveErrorText(e));
        ctl.dataset.role = '';
        render();
      });
    }
    function onBowlPick(name, v) {
      if (name === 'type') return sendSetup({ type: v });
      plan[name] = v;
      if (name === 'variation' && M.VARIATION_LENGTH[v]) plan.length = M.VARIATION_LENGTH[v];
      if (name === 'length' && M.VARIATION_LENGTH[plan.variation]) plan.variation = 'stock';
      const ctl = body.querySelector('[data-sc-controls]');
      setMini(ctl, 'line', plan.line);
      setMini(ctl, 'length', plan.length, !!M.VARIATION_LENGTH[plan.variation]);
      setMini(ctl, 'variation', plan.variation);
      const risk = ctl.querySelector('[data-sc-risk]');
      if (risk) risk.textContent = riskText(plan, overView().type);
      feedback('select');
    }

    function renderReviewPrompt(ctl) {
      const rv = pub.review;
      if (ctl.dataset.role === 'review' && ctl.dataset.n === String(rv.n)) return;
      ctl.dataset.role = 'review';
      ctl.dataset.n = String(rv.n);
      const kind = rv.kind === 'lbw' ? 'LBW' : tr('appeal.caught', 'caught behind');
      const q = (rv.onField === 'out' ? tr('review.given', 'Given OUT') : tr('review.notGiven', 'Not out')) + ' (' + kind + ') — ' + tr('review.ask', 'review it?');
      ctl.innerHTML = `<div class="sc-review" role="alertdialog" aria-label="${esc(tr('review.title', 'Review?'))}">
        <div class="sc-review-q">${esc(q)}</div>
        <div class="sc-review-sub" data-sc-rv-sub></div>
        <div class="sc-review-btns"><button type="button" class="btn btn--secondary" data-rv="0">${esc(tr('review.accept', 'Accept'))}</button><button type="button" class="btn btn--primary" data-rv="1">${esc(tr('review.go', 'Review'))}</button></div>
      </div>`;
      ctl.querySelectorAll('[data-rv]').forEach((b) =>
        b.addEventListener('click', () => {
          if (reviewSent === rv.n) return;
          reviewSent = rv.n;
          ctl.querySelectorAll('[data-rv]').forEach((x) => (x.disabled = true));
          liveCall('review', { matchId, ballNo: rv.n, review: b.dataset.rv === '1' }).catch((e) => {
            reviewSent = -1;
            if (String(e.code).toUpperCase() !== 'STALE_BALL') toast(liveErrorText(e));
            ctl.dataset.role = '';
            render();
          });
        })
      );
    }

    function renderPlay(st) {
      if (mode !== 'play') mountPlay(st);
      paintStatic(st);
      const inn = C.current(st);
      const batter = uidOfSide(inn.bat);
      const iBat = !spectator && batter === me;
      const iBowl = !spectator && !iBat;
      const ov = overView();
      if (scene) {
        scene.setPitch(pub.pitch || 'flat');
        scene.setField(ov.field);
      }
      const b = pub.ball;
      if (pub.phase === 'ball' && b && b.n !== animBall) {
        animBall = b.n;
        showReplayChip(body, false);
        if (scene) scene.bowl(b, b.startAt, serverNow, b.n);
        feedback('place');
      }
      const hint = body.querySelector('[data-sc-hint]');
      const ctl = body.querySelector('[data-sc-controls]');
      const logLen = st.log.length;
      const secs = Math.max(0, Math.ceil((pub.deadline - serverNow()) / 1000));
      if (pub.phase === 'break') {
        hint.textContent = inn.super
          ? tr('break.super', 'Scores level — Super Over!')
          : tr('break.innings', 'Innings break') + ' — ' + C.liveStrip(st).batting + ' ' + tr('break.need', 'need') + ' ' + inn.target;
        ensurePanel('none');
        return;
      }
      if (pub.phase === 'review' && pub.review) {
        if (appealShown !== pub.review.n) {
          appealShown = pub.review.n;
          flash(body, appealText({ kind: pub.review.kind, onField: pub.review.onField }), 'extra');
        }
        if (!spectator && pub.review.byUid === me && reviewSent !== pub.review.n) {
          renderReviewPrompt(ctl);
          const sub = ctl.querySelector('[data-sc-rv-sub]');
          if (sub) sub.textContent = pub.review.left + ' ' + (pub.review.left === 1 ? tr('review.left1', 'review left') : tr('review.leftN', 'reviews left')) + ' · ' + secs + 's';
          hint.textContent = '';
        } else {
          ensurePanel('none');
          hint.textContent = (pub.review.byUid === me ? tr('review.sent', 'Sent — the third umpire is looking') : nameOf(pub.review.byUid) + ' ' + tr('review.deciding', 'is deciding whether to review…')) + ' (' + secs + 's)';
        }
        return;
      }
      if (spectator) {
        ensurePanel('none');
        hint.textContent = pub.phase === 'bowl' ? nameOf(uidOfSide(inn.bowl)) + ' ' + tr('watch.bowling', 'is at the top of the mark') : pub.phase === 'ball' ? nameOf(batter) + ' ' + tr('watch.facing', 'is facing') : '';
        return;
      }
      if (iBat) {
        ensurePanel('bat');
        const canHit = pub.phase === 'ball' && b && hitSent !== b.n;
        ctl.querySelectorAll('[data-sc-shot]').forEach((x) => (x.disabled = !canHit));
        const spin = (b ? b.type : ov.type) === 'spin';
        setMini(ctl, 'foot', spin ? foot : 'stay', !spin);
        if (pub.phase === 'bowl') hint.textContent = oppName() + ' · ' + lbl('type', ov.type) + ' · ' + lbl('field', ov.field) + ' ' + tr('field.lower', 'field');
        else if (pub.phase === 'ball') hint.textContent = hitSent === (b && b.n) ? tr('live.sent', 'Shot played — umpire deciding…') : spin ? tr('hint.spin', 'Spin — step out to go big (stumping risk)') : tr('hint.time', 'Tap a shot as the ball reaches the glowing band');
      } else if (iBowl) {
        const key = ov.key + '|' + ov.fresh + '|' + ov.type;
        if (ctl.dataset.role === 'bowl' && ctl.dataset.overKey !== key) ctl.dataset.role = '';
        ensurePanel('bowl');
        const canBowl = pub.phase === 'bowl' && bowlSent !== logLen && serverNow() >= (pub.meterAt || 0);
        const main = ctl.querySelector('[data-sc-main]');
        if (main) main.disabled = !canBowl;
        if (pub.phase === 'bowl') hint.textContent = canBowl ? (ov.fresh ? tr('hint.overSetup', 'New over — set type and field, then bowl') : tr('live.yourBall', 'Your ball — tap Bowl with the needle in the green')) + ' (' + secs + 's)' : serverNow() < (pub.meterAt || 0) ? tr('live.next', 'Next ball…') : tr('live.bowled', 'Bowled…');
        else if (pub.phase === 'ball') hint.textContent = oppName() + ' ' + tr('live.isBatting', 'is facing…');
      }
    }

    function onBowl() {
      if (!pub || pub.phase !== 'bowl') return;
      const n = logOf(pub).length;
      if (bowlSent === n) return;
      const m = serverNow() - (pub.meterAt || 0);
      if (m < 0) return;
      bowlSent = n;
      render();
      liveCall('bowl', { matchId, ballNo: n, line: plan.line, length: plan.length, variation: plan.variation, m: Math.round(m), rtt: lastRtt })
        .then((r) => {
          const hint = body.querySelector('[data-sc-hint]');
          if (hint && r && r.accuracy != null) hint.textContent = tr('hint.accuracy', 'Accuracy') + ' ' + Math.round(r.accuracy * 100) + '%';
        })
        .catch((e) => {
          bowlSent = -1;
          if (String(e.code).toUpperCase() !== 'STALE_BALL') toast(liveErrorText(e));
          render();
        });
    }
    function onShot(shot) {
      const b = pub && pub.ball;
      if (!b || pub.phase !== 'ball' || hitSent === b.n) return;
      const tap = serverNow() - b.startAt;
      if (tap < b.runupMs) return;
      hitSent = b.n;
      if (scene) scene.swing(shot);
      feedback('bat');
      render();
      liveCall('hit', { matchId, ballNo: b.n, shot, foot: b.type === 'spin' ? foot : 'stay', run, t: Math.round(tap), rtt: lastRtt }).catch((e) => {
        if (String(e.code).toUpperCase() !== 'STALE_BALL') toast(liveErrorText(e));
      });
    }

    /** A new ball in the log: DRS view first if it was reviewed, then the outcome + commentary. */
    function onNewBall(st, ev, prevBatUid) {
      const lb = lastBallOf(st);
      const mineBat = !spectator && prevBatUid === me;
      const show = () => {
        if (!view.alive() || mode !== 'play') return;
        if (scene && !ev.drs) scene.outcome(ev, { mine: mineBat ? !ev.out : !!ev.out });
        const kind = outcomeKind(lb);
        flash(body, ev.drs ? drsVerdict(ev.drs) : outcomeWord(lb), kind);
        const hint = body.querySelector('[data-sc-hint]');
        if (hint && lb) hint.textContent = (ev.auto ? tr('hint.auto', 'No shot in time — auto defend') + ' · ' : '') + lb.text;
        const good = spectator ? false : mineBat ? kind === 'boundary' : kind === 'out';
        feedback(kind === 'out' ? (good ? 'win' : 'lose') : kind === 'boundary' ? (good ? 'win' : 'bat') : 'bat');
        if (isHighlight(ev)) {
          showReplayChip(body, true);
          setTimeout(() => scene && pub && pub.phase !== 'ball' && scene.replay(0.5), 900);
        }
      };
      const fresh = feed.update(st, aiLinesOf(pub));
      if (ev.drs && ev.appeal && scene) {
        scene.drs(ev.appeal, M.UMPIRE);
        flash(body, tr('drs.checking', 'Third umpire checking…'), 'extra');
        setTimeout(() => {
          if (scene) scene.clearDrs();
          show();
          if (fresh.length) showComm(body, fresh[fresh.length - 1], persona(), true);
        }, DRS_VIEW_MS);
      } else {
        show();
        if (fresh.length) showComm(body, fresh[fresh.length - 1], persona(), true);
      }
    }

    /** One player asks the server for AI lines once an over finishes (the server leases + caches). */
    function maybeAskComment(st) {
      if (spectator || me !== pub.playerA) return;
      const ask = (i, over) => {
        const key = 'o' + i + '_' + over;
        if (over < 0 || commentAsked[key] || (pub.ai && pub.ai[key] != null)) return;
        commentAsked[key] = 1;
        liveCall('comment', { matchId, inn: i, over }).catch(() => {});
      };
      const inn = C.current(st);
      if (inn.legal > 0 && inn.legal % 6 === 0) ask(inn.n, inn.legal / 6 - 1);
      const prev = st.innings[inn.n - 1];
      if (prev && prev.legal % 6 !== 0 && inn.legal < 6) ask(prev.n, Math.ceil(prev.legal / 6) - 1);
      if (st.result) {
        const last = st.innings[st.innings.length - 1];
        if (last && last.legal % 6 !== 0) ask(last.n, Math.ceil(last.legal / 6) - 1);
      }
    }

    function paintPresence() {
      let el = view.overlay.querySelector('[data-sc-banner]');
      if (spectator || !pub || pub.status !== 'playing' || oppOnline()) {
        if (el) el.remove();
        return;
      }
      if (!el) {
        el = document.createElement('div');
        el.className = 'sc-banner';
        el.setAttribute('data-sc-banner', '');
        el.setAttribute('role', 'status');
        view.overlay.appendChild(el);
      }
      const leftMs = Math.max(0, RECONNECT_MS - oppGoneFor());
      el.textContent = oppName() + ' ' + tr('live.reconnecting', 'lost connection — auto-play covers their balls; waiting') + ' ' + Math.ceil(leftMs / 1000) + 's';
    }

    function recapOf(st) {
      const r = pub.ai && pub.ai.recap;
      return (r && r.text) || (CC() ? CC().recapTemplate(st, persona()) : '');
    }
    function renderOver(st) {
      const side = mySide();
      const recap = recapOf(st);
      if (!historySaved && !spectator) {
        historySaved = true;
        saveHistory(historyEntry(matchId, 'live', tr('hist.vs', 'vs') + ' ' + oppName(), st, side, recap, persona()));
        const r = st.result || {};
        view.setOutcome(r.kind === 'win' ? (r.winner === side ? 'win' : 'loss') : 'draw');
        feedback(r.kind === 'win' ? (r.winner === side ? 'win' : 'lose') : 'complete');
      }
      if (!spectator && !recapAsked && me === pub.playerA && !(pub.ai && pub.ai.recap != null)) {
        recapAsked = true;
        maybeAskComment(st);
        liveCall('recap', { matchId }).catch(() => {});
      }
      const note = spectator ? '' : settlementNote();
      if (overShown) {
        const n = body.querySelector('[data-sc-note]');
        if (n) n.textContent = note;
        paintRecap(body, recap);
        if (!spectator && pub.ai && pub.ai.recap && pub.ai.recap.text && historySaved) saveHistory(historyEntry(matchId, 'live', tr('hist.vs', 'vs') + ' ' + oppName(), st, side, recap, persona()));
        paintRematch();
        return;
      }
      overShown = true;
      mode = 'over';
      destroyScene();
      if (feed) feed.update(st, aiLinesOf(pub));
      resultScreen(view, st, side, {
        note,
        getRecap: () => recapOf(stateNow()),
        comm: feed ? feed.list : [],
        actions: spectator ? [] : [{ label: tr('rematch', 'Rematch'), primary: true, id: 'rematch' }],
        handlers: {
          rematch: () => askRematch(),
        },
      });
      paintRematch();
    }
    function settlementNote() {
      const sm = pub.settlement && pub.settlement[me];
      if (!sm) return pub.stake || pub.rated ? tr('live.settling', 'Settling…') : '';
      const bits = [];
      if (sm.chipDelta) bits.push((sm.chipDelta > 0 ? '+' : '') + sm.chipDelta + ' ' + tr('chips', 'chips'));
      if (sm.eloDelta) bits.push((sm.eloDelta > 0 ? '+' : '') + sm.eloDelta + ' ' + tr('rating', 'rating'));
      return bits.join(' · ') + (bits.length ? ' · ' : '') + tr('virtual', 'virtual chips only');
    }
    function paintRematch() {
      if (spectator) return;
      const btn = body.querySelector('[data-result-id="rematch"]');
      if (!btn || !pub) return;
      const r = pub.rematch || {};
      if (rematchAsked || r[me]) {
        btn.textContent = tr('rematch.waiting', 'Waiting for') + ' ' + oppName() + '…';
        btn.disabled = true;
      } else if (r[opp]) {
        btn.textContent = oppName() + ' ' + tr('rematch.wants', 'wants a rematch — accept');
      }
      if (pub.nextMatchId && (rematchAsked || r[me])) switchToRematch(pub.nextMatchId);
    }
    function askRematch() {
      rematchAsked = true;
      paintRematch();
      liveCall('rematch', { matchId })
        .then((r) => {
          if (r && r.nextMatchId) switchToRematch(r.nextMatchId);
        })
        .catch((e) => {
          rematchAsked = false;
          toast(liveErrorText(e));
          paintRematch();
        });
    }
    function switchToRematch(nextId) {
      if (switching) return;
      switching = true;
      const nextHost = pub.playerB === me;
      const stake = pub.stake;
      const name = oppName();
      view.close('rematch');
      setTimeout(() => startLive({ matchId: nextId, opponentUid: opp, host: nextHost, stake, oppName: name, chat: cfg.chat, source: cfg.source }), 150);
    }

    function render() {
      if (!pub || !view.alive() || switching) return;
      subtitle();
      if (pub.status === 'waiting') return renderWaiting();
      if (pub.status === 'void') return renderVoid();
      const st = stateNow();
      const n = st.log.length;
      if (!feed) feed = createFeed(hashStr(matchId), persona());
      if (shownLog < 0) {
        // Joining (or rejoining) mid-match: fill the feed quietly, no replays of old balls.
        feed.update(st, aiLinesOf(pub));
        if (pub.review) appealShown = pub.review.n;
      } else if (n > shownLog && (mode === 'play' || pub.status === 'over')) {
        const prevLog = st.log.slice(0, n - 1);
        const prevSt = C.replay(C.liveConfig(pub), prevLog);
        const prevInn = C.current(prevSt);
        const prevBat = prevInn ? uidOfSide(prevInn.bat) : '';
        if (mode === 'play') onNewBall(st, st.log[n - 1], prevBat);
        maybeAskComment(st);
      }
      shownLog = n;
      if (feed.applyAi(aiLinesOf(pub)) && mode === 'play') showComm(body, feed.last(), persona(), false);
      if (pub.status === 'over') return renderOver(st);
      if (pub.phase === 'toss' || pub.phase === 'choose') return renderToss();
      renderPlay(st);
    }

    function loop() {
      if (stopped || !pub) return;
      const now = serverNow();
      paintPresence();
      if (spectator) {
        if (pub.status === 'playing' && (pub.phase === 'toss' || pub.phase === 'choose' || pub.phase === 'bowl' || pub.phase === 'review')) render();
        return;
      }
      const gap = Date.now() - lastTick;
      if (pub.status === 'waiting' && now >= pub.deadline && gap > 2500) {
        lastTick = Date.now();
        liveCall('tick', { matchId }).catch(() => {});
      } else if (pub.status === 'playing' && gap > 1500 && (now >= pub.deadline + 250 || oppGoneFor() > RECONNECT_MS + 500)) {
        lastTick = Date.now();
        setTimeout(() => liveCall('tick', { matchId }).catch(() => {}), Math.floor(Math.random() * 300));
      } else if (pub.status === 'over' && !pub.settlement && now - (pub.endedAt || 0) > 6000 && Date.now() - lastSettle > 8000) {
        lastSettle = Date.now();
        liveCall('settle', { matchId }).catch(() => {});
      }
      if (pub.status === 'playing' && (pub.phase === 'toss' || pub.phase === 'choose' || pub.phase === 'bowl' || pub.phase === 'review')) render();
      else if (mode === 'play') {
        const net = body.querySelector('[data-sc-net]');
        if (net) net.innerHTML = netHtml(lastRtt);
      }
    }

    let presRef = null;
    function subscribe() {
      if (!ref) {
        simpleCard(tr('err.generic', 'Couldn’t reach the match — try again'), '', []);
        return;
      }
      const pubRef = ref.child('pub');
      const onPub = (snap) => {
        pub = snap.val();
        if (!pub) {
          if (spectator) simpleCard(tr('err.gone', 'That match has ended'), '', []);
          return;
        }
        pub.names = pub.names || {};
        pub.toggles = pub.toggles || {};
        pub.ai = pub.ai || {};
        render();
      };
      pubRef.on('value', onPub, () => {
        if (spectator) simpleCard(tr('err.watchDenied', 'You can’t watch this match'), '', []);
      });
      subs.push(() => pubRef.off('value', onPub));
      try {
        const offsetRef = rtdb.ref('.info/serverTimeOffset');
        const onOff = (snap) => {
          const v = snap && snap.val();
          if (typeof v === 'number' && isFinite(v)) offset = v;
        };
        offsetRef.on('value', onOff);
        subs.push(() => offsetRef.off('value', onOff));
      } catch (e) {}
      timers.push(setInterval(loop, 500));
      if (spectator) return;
      const presAll = ref.child('presence');
      const onPres = (snap) => {
        presence = snap.val() || {};
        paintPresence();
      };
      presAll.on('value', onPres, () => {});
      subs.push(() => presAll.off('value', onPres));
      presRef = ref.child('presence/' + me);
      const beat = () => {
        if (stopped) return;
        const t0 = Date.now();
        presRef
          .set({ at: TS, online: true })
          .then(() => noteRtt(Date.now() - t0))
          .catch(() => {});
      };
      try {
        presRef.onDisconnect().set({ at: TS, online: false });
      } catch (e) {}
      beat();
      timers.push(setInterval(beat, 10000));
      const onVis = () => {
        if (document.visibilityState === 'visible') beat();
      };
      document.addEventListener('visibilitychange', onVis);
      subs.push(() => document.removeEventListener('visibilitychange', onVis));
    }

    if (spectator) {
      simpleCard(tr('watch.connecting', 'Opening the match…'), '', []);
      subscribe();
      return;
    }
    simpleCard(tr('live.connecting', 'Joining the match…'), '', []);
    const hostPreset = cfg.matchmaking ? 'standard' : s.preset;
    liveCall('join', {
      matchId,
      opponentUid: opp,
      playerA: cfg.host ? me : opp,
      stake: cfg.host ? cfg.stake || 0 : undefined,
      format: cfg.host ? s.format : undefined,
      preset: cfg.host ? hostPreset : undefined,
      toggles: cfg.host ? s.toggles : undefined,
      tie: cfg.host ? s.tie : undefined,
      persona: cfg.host ? s.persona : undefined,
      name: myName(),
    })
      .then((r) => {
        if (r && r.serverNow) offset = Number(r.serverNow) - Date.now();
        if (!view.alive()) return;
        subscribe();
      })
      .catch((e) => {
        if (!view.alive()) return;
        left = true;
        simpleCard(liveErrorText(e), '', [
          {
            id: 'home',
            primary: true,
            label: tr('home', 'Back to menu'),
            onClick: () => {
              view.close('done');
              setTimeout(openHome, 120);
            },
          },
        ]);
      });
  }
  function watch(matchId) {
    return startLive({ matchId, spectate: true });
  }

  // ---------------- home · settings · friend flows ----------------

  let home = null;

  function openHome() {
    if (!Kit()) return startLocal({ kind: 'ai' });
    if (home && !home.closed) home.close();
    const C = CE();
    const s = settings();
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: tr('home.sub', 'Sports') });
    home = shell;
    const hist = history();
    shell.render(`<div class="pk-page sc-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🏏'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('home.tag', 'Bowl it, time it, chase it down.'))}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="ai">
          <span class="pk-mode-title">${esc(tr('home.bot', 'Play vs Bot'))}</span>
          <span class="pk-mode-sub">${esc(settingsLine(s))}</span>
        </button>
        <button type="button" class="pk-mode" data-go="chase">
          <span class="pk-mode-title">${esc(tr('home.chase', 'Chase'))}</span>
          <span class="pk-mode-sub">${esc(tr('home.chaseSub', 'Knock off a target —') + ' ' + C.FORMATS[s.format].label)}</span>
        </button>
        <button type="button" class="pk-mode" data-go="friend">
          <span class="pk-mode-title">${esc(tr('home.friend', 'Play a friend'))}</span>
          <span class="pk-mode-sub">${esc(tr('home.friendSub', 'Live 1v1 · Standard is rated'))}</span>
        </button>
        <button type="button" class="pk-link" data-go="settings">${esc(tr('home.settings', 'Match settings'))}</button>
        ${hist.length ? `<button type="button" class="pk-link" data-go="history">${esc(tr('hist.title', 'Match history'))} (${hist.length})</button>` : ''}
      </div>
    </div>`);
    const go = (sel, fn) => shell.body.querySelector(sel)?.addEventListener('click', fn);
    go('[data-go="ai"]', () => Kit().closeThen(shell, () => startLocal({ kind: 'ai' })));
    go('[data-go="chase"]', () => Kit().closeThen(shell, () => startLocal({ kind: 'chase' })));
    go('[data-go="friend"]', () => openFriendSheet(shell));
    go('[data-go="settings"]', () => openSettings(() => Kit().closeThen(shell, openHome)));
    go('[data-go="history"]', openHistorySheet);
  }

  function openSettings(onDone) {
    const K = Kit();
    const C = CE();
    const M = CM();
    const st = settings();
    const paint = (body) => {
      const p = C.PRESETS[st.preset];
      const rules = C.makeRules(st.preset, st.toggles, st.tie);
      const toggles = p.toggles
        .map((k) => {
          const on = k === 'bounceCatch' ? !!rules.bounceCatch : !!rules[k];
          return `<label class="sc-toggle"><input type="checkbox" data-sc-toggle="${k}"${on ? ' checked' : ''}> <span>${esc(tr('toggle.' + k, C.TOGGLE_LABELS[k]))}</span></label>`;
        })
        .join('');
      const tiers = (M ? M.TIER_ORDER : ['easy', 'normal', 'hard', 'pro']).map((id) => [id, tr('tier.' + id, M ? M.TIERS[id].label : id)]);
      body.innerHTML = `
        <div class="pk-field"><div class="pk-field-label">${esc(tr('set.format', 'Format'))}</div>
          ${K.segHtml('format', st.format, C.FORMAT_ORDER.map((id) => [id, C.FORMATS[id].label]))}
          <div class="pk-field-help">${esc(C.FORMATS[st.format].overs + ' ' + (C.FORMATS[st.format].overs === 1 ? tr('over1', 'over') : tr('overs', 'overs')) + ' · ' + C.FORMATS[st.format].wickets + ' ' + (C.FORMATS[st.format].wickets === 1 ? tr('wicket1', 'wicket') : tr('wickets', 'wickets')) + ' ' + tr('set.perSide', 'per side'))}</div></div>
        <div class="pk-field"><div class="pk-field-label">${esc(tr('set.rules', 'Rules'))}</div>
          ${K.segHtml('preset', st.preset, C.PRESET_ORDER.map((id) => [id, id === 'standard' ? tr('preset.standard', 'Standard') : id === 'gully' ? tr('preset.gully', 'Gully') : tr('preset.backyard', 'Backyard')]))}
          <div class="pk-field-help">${esc(p.rated ? tr('set.rated', 'MCC-adapted laws · one review per innings · rated in Live') : tr('set.unrated', 'Street tweaks · unrated'))}</div>
          ${toggles ? `<div class="sc-toggles">${toggles}</div>` : ''}</div>
        <div class="pk-field"><div class="pk-field-label">${esc(tr('set.level', 'Bot level'))}</div>
          ${K.segHtml('level', st.level, tiers)}</div>
        <details class="sc-adv"><summary>${esc(tr('set.more', 'More'))}</summary>
          <div class="pk-field"><div class="pk-field-label">${esc(tr('set.tie', 'If scores are level'))}</div>
            ${K.segHtml('tie', st.tie, [['superover', tr('tie.superover', 'Super Over')], ['shared', tr('tie.shared', 'Shared')], ['boundaries', tr('tie.boundaries', 'Boundaries')]])}</div>
          <div class="pk-field"><div class="pk-field-label">${esc(tr('set.persona', 'Commentary'))}</div>
            ${K.segHtml('persona', st.persona, [['calm', tr('comm.calm', 'Calm analyst')], ['fan', tr('comm.fan', 'Excited fan')]])}
            <div class="pk-field-help">${esc(tr('set.personaHelp', 'Key moments only. In Live, the challenger’s pick is used.'))}</div></div>
          <div class="sc-toggles">
            <label class="sc-toggle"><input type="checkbox" data-sc-pref="sound"${st.sound ? ' checked' : ''}> <span>${esc(tr('set.sound', 'Crowd and bat sounds'))}</span></label>
            <label class="sc-toggle"><input type="checkbox" data-sc-pref="voice"${st.voice ? ' checked' : ''}> <span>${esc(tr('set.voice', 'Read commentary aloud'))}</span></label>
            <label class="sc-toggle"><input type="checkbox" data-sc-pref="aiComm"${st.aiComm ? ' checked' : ''}> <span>${esc(tr('set.ai', 'AI commentary when available'))}</span></label>
          </div>
        </details>
        <button type="button" class="pk-btn pk-btn--primary" data-done>${esc(tr('set.done', 'Done'))}</button>`;
      K.wireSegs(body, st, () => {
        if (!C.PRESETS[st.preset].toggles.length) st.toggles = {};
        saveSettings(st);
        paint(body);
      });
      body.querySelectorAll('[data-sc-toggle]').forEach((cb) =>
        cb.addEventListener('change', () => {
          st.toggles = Object.assign({}, st.toggles, { [cb.dataset.scToggle]: cb.checked });
          saveSettings(st);
        })
      );
      body.querySelectorAll('[data-sc-pref]').forEach((cb) =>
        cb.addEventListener('change', () => {
          st[cb.dataset.scPref] = cb.checked;
          if (cb.dataset.scPref === 'aiComm' && cb.checked) aiSession.off = false;
          if (cb.dataset.scPref === 'voice' && !cb.checked && SC()) SC().hush();
          saveSettings(st);
        })
      );
    };
    let finished = false;
    return K.openSheet({
      title: tr('set.title', 'Match settings'),
      bodyHtml: '<div data-sc-settings></div>',
      onMount: (el, close) => {
        const body = el.querySelector('[data-sc-settings]');
        paint(body);
        body.addEventListener('click', (e) => {
          if (e.target.closest('[data-done]')) close();
        });
      },
      onClose: () => {
        if (finished) return;
        finished = true;
        if (onDone) setTimeout(onDone, 60);
      },
    });
  }

  function openFriendSheet(homeShell) {
    const K = Kit();
    K.openSheet({
      title: tr('friend.title', 'Play a friend'),
      bodyHtml: `<div class="pk-modes">
        <button type="button" class="pk-mode" data-f="challenge"><span class="pk-mode-title">${esc(tr('friend.challenge', 'Challenge a friend'))}</span><span class="pk-mode-sub">${esc(
          tr('friend.challengeSub', 'Live on both phones · your match settings · optional chip stake')
        )}</span></button>
        <button type="button" class="pk-mode" data-f="find"><span class="pk-mode-title">${esc(tr('friend.find', 'Find an opponent'))}</span><span class="pk-mode-sub">${esc(
          tr('friend.findSub', 'Matched by rating · Standard rules · friendly, no stake')
        )}</span></button>
      </div>`,
      onMount: (el, close) => {
        el.querySelector('[data-f="challenge"]').addEventListener('click', () => {
          close();
          setTimeout(() => challengeFriend(homeShell), 60);
        });
        el.querySelector('[data-f="find"]').addEventListener('click', () => {
          close();
          setTimeout(() => findOpponent(homeShell), 60);
        });
      },
    });
  }

  function signedInOrPrompt() {
    const K = Kit();
    if (K.isSignedIn()) return true;
    if (typeof K.requireSignIn === 'function') K.requireSignIn();
    else toast(tr('signIn', 'Sign in to play online'));
    return false;
  }

  async function challengeFriend(homeShell) {
    const K = Kit();
    if (!signedInOrPrompt()) return;
    if (typeof openFriendPickerSheet !== 'function') return toast(tr('err.friends', 'Friends aren’t available right now'));
    const f = await openFriendPickerSheet({ title: tr('challenge.title', 'Challenge · ' + LABEL), subtitle: tr('challenge.sub', 'Live 1v1 · virtual chips only') });
    if (!f) return;
    const uid = f.uid || f.id || '';
    if (!persistable(uid)) return toast(tr('err.opp', 'Pick a real opponent'));
    let stake = 0;
    if (typeof openDangalStakeSheet === 'function' && (typeof stakesEnabledForGame !== 'function' || stakesEnabledForGame(GAME))) {
      const picked = await openDangalStakeSheet(GAME, { defaultStake: 0 });
      if (picked == null) return;
      stake = Number(picked) || 0;
    }
    const s = settings();
    const mid = cleanId(typeof dangalMatchId === 'function' ? dangalMatchId(GAME, { name: f.name, uid, opponentUid: uid }) : GAME + '_' + Date.now());
    const chatId = f.chatId || f.firestoreId || '';
    if (typeof sendChallengeCard === 'function' && chatId) {
      try {
        await sendChallengeCard(uid, GAME, { chatId, matchId: mid, stake, mode: settingsLine(s) });
      } catch (e) {}
    }
    const go = () =>
      startLive({
        matchId: mid,
        opponentUid: uid,
        host: true,
        stake,
        oppName: f.name,
        chat: { name: f.name, id: chatId, firestoreId: chatId, uid, peerUid: uid, dangalMatchId: mid },
        source: 'challenge_host',
      });
    if (homeShell && !homeShell.closed) K.closeThen(homeShell, go);
    else go();
  }

  function findOpponent(homeShell) {
    const K = Kit();
    if (!signedInOrPrompt()) return;
    if (typeof findRealOpponent !== 'function') return toast(tr('err.mm', 'Matchmaking isn’t available right now'));
    let handle = null;
    let settled = false;
    const sheet = K.openSheet({
      title: tr('find.title', 'Finding an opponent'),
      bodyHtml: `<div class="sc-finding"><div class="sc-finding-ball" aria-hidden="true">🏏</div>
        <div class="pk-sub">${esc(tr('find.sub', 'Looking for someone near your rating…'))}</div>
        <button type="button" class="pk-btn pk-btn--ghost" data-cancel>${esc(tr('find.cancel', 'Cancel'))}</button></div>`,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').addEventListener('click', () => close());
      },
      onClose: () => {
        if (!settled && handle) handle.cancel();
      },
    });
    handle = findRealOpponent(
      { category: GAME, gameId: GAME },
      (m) => {
        settled = true;
        sheet.close();
        const go = () => {
          if (!m || m.simulated || !m.matchId || !persistable(m.uid)) {
            toast(tr('find.none', 'No one free right now — warming up against a Bot'));
            return startLocal({ kind: 'ai', source: 'matchmaking' });
          }
          startLive({ matchId: m.matchId, opponentUid: m.uid, host: m.role === 'host', stake: 0, oppName: m.name, source: 'matchmaking', matchmaking: true });
        };
        setTimeout(() => {
          if (homeShell && !homeShell.closed) K.closeThen(homeShell, go);
          else go();
        }, 80);
      },
      () => {
        settled = true;
      }
    );
  }

  // ---------------- registration ----------------

  function launch(opts) {
    const o = opts || {};
    if (!CE() || !CM()) {
      toast(LABEL + ' ' + tr('loading', 'is still loading — try again'));
      return;
    }
    const ctx = window.__dangalLaunchCtx || {};
    const chat = o.chat || (o.name || o.dangalMatchId || o.uid || o.peerUid ? o : null) || resolveRwChat(o);
    const opp = o.opponentUid || (chat && (chat.opponentUid || chat.uid || chat.peerUid)) || '';
    const mid = o.matchId || (chat && chat.dangalMatchId) || '';
    const src = String(o.source || (chat && chat.dangalSource) || ctx.source || '');
    if ((o.mode === 'watch' || o.spectate) && mid) return watch(mid);
    const live = o.mode === 'live' || /^challenge/.test(src) || chatLiveOn(chat);
    if (live && mid && persistable(opp)) {
      let host = src !== 'challenge';
      if (chatLiveOn(chat) && typeof DangalLive !== 'undefined' && DangalLive.roles) {
        const r = DangalLive.roles(chat, o);
        if (r && r.opp === opp) host = !!r.host;
      }
      const stake = Number(o.stake != null ? o.stake : chat && chat.stake != null ? chat.stake : ctx.stake) || 0;
      return startLive({ matchId: mid, opponentUid: opp, host, stake, oppName: chat && chat.name, chat, source: src || 'challenge' });
    }
    if (o.practiceKind === 'vsAi' || o.practiceKind === 'vsBot') return startLocal({ kind: 'ai', source: o.source });
    if (o.practiceKind === 'chase') return startLocal({ kind: 'chase', source: o.source });
    return openHome();
  }

  const lazy = (fn) =>
    function () {
      const K = Kit();
      const args = arguments;
      if (K && typeof K.withGameData === 'function') return K.withGameData(GAME, fn).apply(this, args);
      return fn.apply(this, args);
    };
  const openGame = lazy(launch);

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'streetcricket',
      name: LABEL,
      desc: 'Street formats on MCC-based laws — bowl, bat, chase',
      icon: '🏏',
      ratingKey: 'streetcricket',
      gameType: 'dual',
      genre: 'rw_sports',
      liveDuel: true,
      selfChat: true,
      dangal: true,
      chat1v1: true,
      ownHome: true,
      order: 5,
      meta: {
        core: 'cricket-model.js (gameplay tables, bots, DRS-lite) + cricket-engine.js (laws, scoring, stats) — shared with the server and scripts/sim-cricket.js',
        live: 'cricket_match → server-lib/cricket-engine.js; the server resolves every ball',
        complete: true,
      },
      launch: openGame,
    });
  }

  window.openStreetCricket = openGame;
  window.StreetCricketGame = {
    launch: openGame,
    startLocal: lazy(startLocal),
    startLive: lazy(startLive),
    watch: lazy(watch),
    openHome: lazy(openHome),
    openScorecard: lazy(openScorecardSheet),
    historyCount: () => history().length,
    mountHistory,
  };
})();
