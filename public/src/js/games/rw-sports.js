/**
 * RW Sports — Street Cricket: vs AI · Chase practice · Live 1v1.
 *
 * Laws, scoring, stats and the seeded ball model live in cricket-engine.js (shared with the
 * server). This file is the pitch renderer, the controls, the scorecard / charts sheet and the
 * three match controllers. Live never resolves on the phone:
 * POST /api/media-config { action: 'cricket_match' } → server-lib/cricket-engine.js.
 */
(function () {
  'use strict';

  const GAME = 'streetcricket';
  const LABEL = 'Street Cricket';
  const KEY_SETTINGS = 'chaupaal_sc_settings_v5';
  const KEY_HISTORY = 'chaupaal_sc_history_v1';
  const KEY_COACH = 'chaupaal_sc_coach_v3';
  const HISTORY_MAX = 12;
  const LIVE_POLICY = window.DangalLivePolicy ? window.DangalLivePolicy.policyFor(GAME) : { turnMs: 12000, reconnectMs: 90000 };
  const RECONNECT_MS = LIVE_POLICY.reconnectMs;
  const SIDE_COLORS = ['#2E7D32', '#F9A825'];

  const CE = () => window.CricketEngine;
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

  function settings() {
    const s = readJson(KEY_SETTINGS, {}) || {};
    const C = CE();
    return {
      format: C ? C.normFormat(s.format || 'quick') : s.format || 'quick',
      preset: C ? C.normPreset(s.preset) : s.preset || 'standard',
      toggles: s.toggles && typeof s.toggles === 'object' ? s.toggles : {},
      tie: C ? C.normTie(s.tie) : s.tie || 'superover',
      level: ['easy', 'medium', 'hard'].indexOf(s.level) >= 0 ? s.level : 'medium',
    };
  }
  function saveSettings(s) {
    writeJson(KEY_SETTINGS, s);
  }
  function settingsLine(s) {
    const C = CE();
    const f = C.FORMATS[s.format];
    return f.label + ' · ' + f.overs + ' ov · ' + C.PRESETS[s.preset].label;
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
  function historyEntry(id, mode, title, state, mySide) {
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
    };
  }
  function openHistoryEntry(entry) {
    const C = CE();
    if (!C || !entry) return;
    const st = C.replay(entry.config, entry.log);
    st.log = entry.log;
    openScorecardSheet(st, { title: entry.title });
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
          <span class="sc-hist-main"><span class="sc-hist-title">${esc(e.title)} · ${esc(fmt)}</span><span class="sc-hist-sub">${esc(e.result)}</span></span>
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

  function shareStatsFor(state) {
    const C = CE();
    const sum = C.shareSummary(state);
    return {
      title: LABEL,
      scoreLine: sum.lines.join(' · '),
      meta: [sum.result, sum.top ? tr('share.top', 'Top performer') + ': ' + sum.top : ''].filter(Boolean).join(' · '),
      text: sum.text + '\n' + tr('share.on', 'Played on Chaupaal'),
    };
  }
  function shareScorecard(state) {
    const s = shareStatsFor(state);
    if (typeof shareGameResult === 'function') return shareGameResult(GAME, s);
    if (navigator.share) navigator.share({ title: LABEL, text: s.text }).catch(() => {});
  }

  function openScorecardSheet(state, opts) {
    const C = CE();
    const o = opts || {};
    const card = C.scorecard(state);
    const tabs = { card: () => scorecardHtml(card), charts: () => chartsHtml(C.charts(state)), balls: () => timelineHtml(C.timeline(state)) };
    let tab = o.tab || 'card';
    Kit().openSheet({
      title: o.title || tr('card.title', 'Scorecard'),
      bodyHtml: `<div class="sc-sheet">
        ${Kit().segHtml('tab', tab, [['card', tr('tab.card', 'Scorecard')], ['charts', tr('tab.charts', 'Charts')], ['balls', tr('tab.balls', 'Ball by ball')]])}
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
        el.querySelector('[data-sc-share]').addEventListener('click', () => shareScorecard(state));
        paint();
      },
    });
  }

  // ---------------- pitch + ball animation ----------------

  const PATHS = {
    straight: [[0, 18, 48], [0.55, 50, 44], [1, 76, 50]],
    skiddy: [[0, 18, 52], [0.4, 42, 50], [1, 78, 51]],
    loopy: [[0, 16, 50], [0.45, 42, 28], [1, 74, 50]],
    curve: [[0, 17, 48], [0.4, 40, 42], [0.7, 58, 46], [1, 76, 54]],
  };
  function pathPoint(path, p) {
    const pts = PATHS[path] || PATHS.straight;
    const q = Math.max(0, Math.min(1.12, p));
    for (let i = 1; i < pts.length; i++) {
      if (q <= pts[i][0] || i === pts.length - 1) {
        const a = pts[i - 1];
        const b = pts[i];
        const k = (q - a[0]) / (b[0] - a[0] || 1);
        return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      }
    }
    return [pts[0][1], pts[0][2]];
  }

  function pitchHtml() {
    return `<div class="rw-sports-pitch rw-sc-pitch" data-sc-pitch>
      <div class="rw-sc-lane" aria-hidden="true"></div>
      <div class="rw-sc-zone" aria-hidden="true"></div>
      <div class="rw-sc-bowler" aria-hidden="true"><span class="rw-sc-bowler-mark"></span></div>
      <div class="rw-sc-ball sc-ball" data-sc-ball aria-hidden="true"></div>
      <div class="rw-sc-batter" aria-hidden="true"><span class="rw-sc-bat"></span></div>
      <div class="rw-sc-stumps" aria-hidden="true"></div>
      <div class="sc-del-tag" data-sc-deltag hidden></div>
    </div>`;
  }

  /**
   * Drive one delivery on the pitch from a clock: run-up, then the ball along its path.
   * `now()` and `startAt` share a clock (local for practice, server-estimated for Live).
   */
  function playBall(pitch, delId, startAt, now) {
    const C = CE();
    const d = C.deliveryById(delId);
    const ball = pitch.querySelector('[data-sc-ball]');
    const tag = pitch.querySelector('[data-sc-deltag]');
    pitch.style.setProperty('--sc-runup-ms', d.runupMs + 'ms');
    pitch.style.setProperty('--sc-zone-start', String(d.zoneStart));
    pitch.style.setProperty('--sc-zone-end', String(d.zoneEnd));
    pitch.classList.remove('is-del-medium', 'is-del-quick', 'is-del-flight', 'is-del-spin', 'is-runup', 'is-flight', 'is-window');
    pitch.classList.add('is-del-' + d.id);
    if (tag) {
      tag.hidden = false;
      tag.textContent = d.label;
    }
    let raf = 0;
    let stopped = false;
    const frame = () => {
      if (stopped) return;
      const t = now() - startAt;
      const runup = t >= 0 && t < d.runupMs;
      const p = (t - d.runupMs) / d.flightMs;
      pitch.classList.toggle('is-runup', t >= 0);
      pitch.classList.toggle('is-flight', p >= 0 && p <= 1.12);
      pitch.classList.toggle('is-window', p >= d.zoneStart && p <= d.zoneEnd);
      if (ball) {
        if (p >= 0 && p <= 1.12) {
          const xy = pathPoint(d.path, p);
          ball.style.left = xy[0] + '%';
          ball.style.top = xy[1] + '%';
          ball.style.opacity = '1';
        } else {
          ball.style.opacity = runup || t < 0 ? '0' : ball.style.opacity;
        }
      }
      if (p > 1.4) return;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return {
      progress: () => (now() - startAt - d.runupMs) / d.flightMs,
      inFlight: () => {
        const p = (now() - startAt - d.runupMs) / d.flightMs;
        return p >= 0 && p <= d.lateEnd + 0.08;
      },
      stop(keepBall) {
        stopped = true;
        cancelAnimationFrame(raf);
        pitch.classList.remove('is-flight', 'is-window');
        if (!keepBall && ball) ball.style.opacity = '0';
      },
    };
  }
  function resetPitch(pitch) {
    if (!pitch) return;
    pitch.classList.remove('is-runup', 'is-flight', 'is-window');
    const ball = pitch.querySelector('[data-sc-ball]');
    if (ball) ball.style.opacity = '0';
    const tag = pitch.querySelector('[data-sc-deltag]');
    if (tag) tag.hidden = true;
  }

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

  function shotsHtml(armed, enabled) {
    const C = CE();
    return `<div class="rw-sc-shots" role="group" aria-label="${esc(tr('shot', 'Shot'))}">${Object.keys(C.SHOTS)
      .map((id) => `<button type="button" class="rw-sc-shot${armed === id ? ' is-armed' : ''}" data-sc-shot="${id}"${enabled ? '' : ' disabled'}>${esc(tr('shot.' + id, C.SHOTS[id].label))}</button>`)
      .join('')}</div>`;
  }
  function deliveriesHtml(armed, enabled) {
    const C = CE();
    return `<div class="rw-sc-shots rw-sc-deliveries sc-deliveries" role="group" aria-label="${esc(tr('delivery', 'Delivery'))}">${C.DELIVERY_ORDER.map(
      (id) => `<button type="button" class="rw-sc-shot${armed === id ? ' is-armed' : ''}" data-sc-del="${id}"${enabled ? '' : ' disabled'}>${esc(tr('del.' + id, C.DELIVERIES[id].label))}</button>`
    ).join('')}</div>`;
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
      <div data-sc-over></div>
      ${pitchHtml()}
      <div class="rw-sports-outcome" data-rw-outcome aria-live="polite"></div>
      <p class="rw-sports-hint sc-hint" data-sc-hint></p>
      <div data-sc-controls></div>
      <div class="sc-links"><button type="button" class="sc-link" data-sc-open-card>${esc(tr('card.title', 'Scorecard'))}</button><button type="button" class="sc-link" data-sc-open-rules>${esc(tr('rules', 'Rules'))}</button></div>
    </div>`;
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
    if (r.kind === 'win') return r.winner === mySide ? tr('res.won', 'You won') : tr('res.lost', 'You lost');
    if (r.kind === 'tie') return tr('res.tie', 'Match tied');
    return tr('res.noResult', 'No result');
  }

  function resultScreen(view, state, mySide, o) {
    const C = CE();
    const pauseBtn = view.overlay.querySelector('#scPause');
    if (pauseBtn) pauseBtn.hidden = true;
    const sum = C.shareSummary(state);
    const stats = shareStatsFor(state);
    const lines = sum.lines.map((l) => `<div class="sc-sum-line">${esc(l)}</div>`).join('');
    const scoreHtml = `<div class="sc-sum">${lines}${sum.top ? `<div class="sc-sum-top">${esc(tr('share.top', 'Top performer'))}: ${esc(sum.top)}</div>` : ''}${o.note ? `<div class="sc-sum-note" data-sc-note>${esc(o.note)}</div>` : '<div class="sc-sum-note" data-sc-note></div>'}</div>`;
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
        card: () => openScorecardSheet(state),
        share: () => shareScorecard(state),
      },
      o.handlers || {}
    );
    if (typeof wireGameResultActions === 'function') wireGameResultActions(view.body, handlers);
    else view.body.querySelectorAll('[data-result-id]').forEach((b) => b.addEventListener('click', () => handlers[b.dataset.resultId] && handlers[b.dataset.resultId](b)));
  }

  // ---------------- local match: vs AI · Chase ----------------

  /**
   * @param {{ kind: 'ai'|'chase', format?, source? }} o
   */
  function startLocal(o) {
    const C = CE();
    const s = settings();
    const chase = o.kind === 'chase';
    const format = C.normFormat(o.format || s.format);
    const seed0 = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const battingFirst = chase ? 0 : C.mulberry32(seed0)() < 0.5 ? 0 : 1;
    const config = C.createMatch({
      format,
      preset: s.preset,
      toggles: s.toggles,
      tie: s.tie,
      sides: [
        { pid: 'me', name: myName() },
        { pid: 'ai', name: tr('ai', 'AI') },
      ],
      battingFirst,
      target: chase ? C.chaseTarget(format, seed0) : 0,
    });
    const log = [];
    let state = C.replay(config, log);
    state.log = log;
    let phase = 'idle'; // idle | ball | result | done
    let ball = null;
    let anim = null;
    let armedShot = 'push';
    let armedDel = 'medium';
    let lastDel = '';
    let streak = 0;
    let aiPick = null;
    let timers = [];
    let pauseCtrl = null;
    let coachShown = readJson(KEY_COACH, false) === true;
    const matchKey = 'local_' + seed0.toString(36);
    const title = chase ? tr('mode.chase', 'Chase') : tr('mode.vsAi', 'vs AI');

    const view = openMatchView({
      pause: true,
      subtitle: title + ' · ' + C.FORMATS[format].label + (config.rules.preset !== 'standard' ? ' · ' + C.PRESETS[config.rules.preset].label : ''),
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
    }
    function stop() {
      clearTimers();
      if (anim) anim.stop();
      anim = null;
      try {
        if (pauseCtrl) pauseCtrl.destroy();
      } catch (e) {}
    }
    const meBatting = () => C.current(state).bat === 0;
    const later = (fn, ms) => timers.push(setTimeout(() => view.alive() && fn(), ms));

    function mount() {
      body.innerHTML = matchLayoutHtml();
      body.querySelector('[data-sc-open-card]').addEventListener('click', () => openScorecardSheet(state));
      body.querySelector('[data-sc-open-rules]').addEventListener('click', () => openRules({ format, preset: s.preset, toggles: s.toggles, tie: s.tie }));
    }

    function paint() {
      if (!body.querySelector('[data-sc-strip]')) mount();
      const strip = C.liveStrip(state);
      body.querySelector('[data-sc-strip]').innerHTML = stripHtml(strip);
      body.querySelector('[data-sc-over]').innerHTML = overDotsHtml(strip.thisOver);
      const hint = body.querySelector('[data-sc-hint]');
      const ctl = body.querySelector('[data-sc-controls]');
      if (meBatting()) {
        const canHit = phase === 'ball';
        hint.textContent =
          phase === 'ball'
            ? tr('hint.time', 'Tap Hit as the ball reaches the glowing zone')
            : phase === 'idle'
              ? coachShown
                ? tr('hint.bat', 'Arm a shot, then face the ball')
                : tr('hint.coach', 'Pick Defend, Push or Loft — then tap Hit as the ball arrives')
              : '';
        ctl.innerHTML =
          shotsHtml(armedShot, phase !== 'result') +
          `<button type="button" class="btn btn--primary rw-sc-main" data-sc-main${phase === 'result' ? ' disabled' : ''}>${esc(canHit ? tr('btn.hit', 'Hit!') : tr('btn.face', 'Face the ball'))}</button>`;
      } else {
        hint.textContent =
          phase === 'ball' ? tr('hint.aiBat', 'AI is batting…') : phase === 'idle' ? tr('hint.bowl', 'Pick a delivery and bowl') : '';
        ctl.innerHTML =
          deliveriesHtml(armedDel, phase === 'idle') +
          `<button type="button" class="btn btn--primary rw-sc-main" data-sc-main${phase === 'idle' ? '' : ' disabled'}>${esc(tr('btn.bowl', 'Bowl'))}</button>`;
      }
      ctl.querySelectorAll('[data-sc-shot]').forEach((b) =>
        b.addEventListener('click', () => {
          armedShot = b.dataset.scShot;
          ctl.querySelectorAll('[data-sc-shot]').forEach((x) => x.classList.toggle('is-armed', x === b));
          feedback('select');
        })
      );
      ctl.querySelectorAll('[data-sc-del]').forEach((b) =>
        b.addEventListener('click', () => {
          armedDel = b.dataset.scDel;
          ctl.querySelectorAll('[data-sc-del]').forEach((x) => x.classList.toggle('is-armed', x === b));
          feedback('select');
        })
      );
      const main = ctl.querySelector('[data-sc-main]');
      if (main) main.addEventListener('click', onMain);
    }

    function onMain() {
      if (pauseCtrl && pauseCtrl.isPaused && pauseCtrl.isPaused()) return;
      if (phase === 'idle') {
        if (meBatting()) {
          const inn = C.current(state);
          const del = C.aiDelivery({ balls: inn.legal, chase, last: lastDel, streak }, (seed0 + log.length * 131) >>> 0);
          streak = del === lastDel ? streak + 1 : 1;
          lastDel = del;
          if (!coachShown) {
            coachShown = true;
            writeJson(KEY_COACH, true);
          }
          startBall(del);
        } else {
          startBall(armedDel);
        }
        return;
      }
      if (phase === 'ball' && meBatting() && ball) {
        const tap = Date.now() - ball.startAt;
        if (tap < C.deliveryById(ball.del).runupMs) return;
        resolve(C.timingFromOffset(ball.del, tap), armedShot);
      }
    }

    function startBall(del) {
      clearTimers();
      const d = C.deliveryById(del);
      ball = { del, startAt: Date.now() + 200 };
      phase = 'ball';
      paint();
      feedback('place');
      anim = playBall(body.querySelector('[data-sc-pitch]'), del, ball.startAt, () => Date.now());
      const end = 200 + d.runupMs + d.flightMs;
      if (meBatting()) {
        later(() => phase === 'ball' && resolve('miss', armedShot), end + 250);
      } else {
        const inn = C.current(state);
        aiPick = C.aiBat({ delivery: del, level: s.level, rrr: inn.target ? C.requiredRate(inn) : 0, lastWicket: inn.wkts === inn.limit - 1 }, (seed0 ^ (log.length * 2654435761)) >>> 0);
        const zone = aiPick.timing === 'early' ? d.zoneStart - 0.12 : aiPick.timing === 'perfect' ? (d.zoneStart + d.zoneEnd) / 2 : aiPick.timing === 'late' ? (d.zoneEnd + d.lateEnd) / 2 : 1;
        later(() => phase === 'ball' && resolve(aiPick.timing, aiPick.shot), 200 + d.runupMs + Math.max(0, zone) * d.flightMs + 60);
      }
    }

    function resolve(timing, shot) {
      clearTimers();
      if (anim) anim.stop(timing !== 'miss');
      anim = null;
      const inn = C.current(state);
      const prevInn = state.cur;
      const seed = (Math.floor(Math.random() * 0xffffffff) ^ (log.length * 7919)) >>> 0;
      const ev = C.resolveBall({ delivery: ball.del, shot, timing, rules: config.rules, freeHit: inn.freeHit, firstBall: C.firstBallFor(state) }, seed);
      log.push(ev);
      state = C.replay(config, log);
      state.log = log;
      ball = null;
      phase = 'result';
      paint();
      const lb = lastBallOf(state);
      const kind = outcomeKind(lb);
      flash(body, outcomeWord(lb), kind);
      const hint = body.querySelector('[data-sc-hint]');
      if (hint && lb) hint.textContent = lb.text;
      const mine = (meBatting() && kind === 'boundary') || (!meBatting() && kind === 'out');
      feedback(kind === 'out' ? (mine ? 'win' : 'lose') : kind === 'boundary' ? (mine ? 'win' : 'bat') : 'bat');
      if (state.result) return later(finish, 1300);
      const inningsChanged = state.cur !== prevInn;
      later(() => {
        resetPitch(body.querySelector('[data-sc-pitch]'));
        phase = 'idle';
        paint();
        if (inningsChanged) {
          const cur = C.current(state);
          const msg = cur.super
            ? tr('break.super', 'Scores level — Super Over!')
            : tr('break.innings', 'Innings break') + ' — ' + state.config.sides[cur.bat].name + ' ' + tr('break.need', 'need') + ' ' + cur.target;
          flash(body, msg, 'extra');
          if (hint) hint.textContent = msg;
        }
      }, inningsChanged ? 1600 : 1100);
    }

    function finish() {
      phase = 'done';
      stop();
      const r = state.result;
      const won = r.kind === 'win' && r.winner === 0;
      const tied = r.kind === 'tie';
      const myInn = state.innings.find((i) => !i.super && i.bat === 0);
      const myRuns = myInn ? myInn.runs : 0;
      saveHistory(historyEntry(matchKey, chase ? 'chase' : 'ai', title, state, 0));
      let vsBest = '';
      if (typeof setGamePB === 'function') {
        const pbId = chase ? 'streetcricket_chase' : 'streetcricket_over';
        vsBest = typeof formatVsBest === 'function' ? formatVsBest(pbId, myRuns) : '';
        setGamePB(pbId, myRuns);
        if (chase && won && typeof getGamePB === 'function') setGamePB('streetcricket_chase_wins', (getGamePB('streetcricket_chase_wins') || 0) + 1);
      }
      if (typeof recordGameResult === 'function') {
        try {
          recordGameResult(GAME, won, tied, { score: myRuns, mode: chase ? 'chase' : 'practice', variant: format, difficulty: s.level });
        } catch (e) {}
      }
      view.setOutcome(won ? 'win' : tied ? 'draw' : 'loss');
      feedback(won ? 'win' : tied ? 'complete' : 'lose');
      resultScreen(view, state, 0, {
        vsBest,
        actions: [{ label: chase ? tr('again.chase', 'Chase again') : tr('again', 'Play again'), primary: true, id: 'again' }],
        handlers: {
          again: () => {
            view.close('done');
            setTimeout(() => startLocal(o), 150);
          },
        },
      });
    }

    if (typeof createGamePauseController === 'function') {
      pauseCtrl = createGamePauseController({
        host: view.overlay,
        pauseBtnId: 'scPause',
        onPause() {
          // A paused delivery is a dead ball: re-bowled on resume, nothing is logged.
          if (phase === 'ball') {
            clearTimers();
            if (anim) anim.stop();
            anim = null;
            ball = null;
            phase = 'idle';
            resetPitch(body.querySelector('[data-sc-pitch]'));
          }
        },
        onResume() {
          if (phase === 'idle') paint();
        },
        onQuit() {
          view.close('quit');
        },
      });
    }

    paint();
    const firstMsg = chase
      ? tr('start.chase', 'Chase') + ' ' + state.innings[0].target + ' ' + tr('start.in', 'in') + ' ' + config.overs + ' ' + (config.overs === 1 ? tr('over1', 'over') : tr('overs', 'overs'))
      : battingFirst === 0
        ? tr('start.youBat', 'You won the toss — you bat first')
        : tr('start.aiBats', 'AI won the toss and bats first — you bowl');
    flash(body, firstMsg, 'extra');
  }

  // ---------------- Live 1v1 ----------------

  let lastRtt = 0;
  async function liveCall(op, args) {
    if (typeof apiFetch !== 'function') throw Object.assign(new Error('Offline'), { code: 'OFFLINE' });
    const t0 = Date.now();
    const res = await apiFetch('/api/media-config', {
      method: 'POST',
      needAuth: true,
      body: Object.assign({ action: 'cricket_match', op }, args || {}),
    });
    const took = Date.now() - t0;
    lastRtt = lastRtt ? Math.round(lastRtt * 0.7 + took * 0.3) : took;
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
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? tr('err.offline', 'You’re offline — reconnect to keep playing')
      : tr('err.generic', 'Couldn’t reach the match — try again');
  }
  function logOf(pub) {
    const l = pub && pub.log;
    const arr = Array.isArray(l) ? l.filter(Boolean) : l ? Object.keys(l).sort((a, b) => a - b).map((k) => l[k]) : [];
    return arr.map((e) => Object.assign({ extra: '', out: '', runs: 0 }, e));
  }

  /**
   * @param {{ matchId: string, opponentUid: string, host: boolean, stake?: number, oppName?: string, chat?: object, source?: string, matchmaking?: boolean }} cfg
   */
  function startLive(cfg) {
    const C = CE();
    const me = myUid();
    const opp = cfg.opponentUid;
    const matchId = cleanId(cfg.matchId);
    const s = settings();
    if (!me || !persistable(opp) || !matchId) {
      toast(tr('err.link', 'That challenge link is broken — try again from Dangal'));
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
    let anim = null;
    let armedShot = 'push';
    let armedDel = 'medium';
    let hitSent = -1;
    let bowlSent = -1;
    let lastTick = 0;
    let lastSettle = 0;
    let historySaved = false;
    let overShown = false;
    let mode = '';
    const timers = [];
    const subs = [];

    const view = openMatchView({
      live: true,
      subtitle: tr('sub.live', 'Live'),
      onBack: async () => {
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
        if (!left && !switching && pub && (pub.status === 'playing' || pub.status === 'waiting')) {
          left = true;
          liveCall('leave', { matchId }).catch(() => {});
        }
        stop();
      },
    });
    if (!view) return;
    const body = view.body;
    const serverNow = () => Date.now() + offset;
    const oppName = () => (pub && pub.names && pub.names[opp]) || cfg.oppName || tr('opponent', 'Opponent');
    const mySide = () => (pub && pub.playerB === me ? 1 : 0);
    const stateNow = () => {
      const log = logOf(pub);
      const st = C.replay(C.liveConfig(pub), log);
      st.log = log;
      return st;
    };
    const uidOfSide = (side) => (side === 1 ? pub.playerB : pub.playerA);

    function stop() {
      if (stopped) return;
      stopped = true;
      if (anim) anim.stop();
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
      const bits = [tr('sub.live', 'Live'), C.FORMATS[pub.format] ? C.FORMATS[pub.format].label : ''];
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
      if (anim) anim.stop();
      anim = null;
      body.innerHTML = `<div class="rw-sports-card sc-wait"><h2>${esc(title)}</h2>${sub ? `<p class="rw-sports-hint">${esc(sub)}</p>` : ''}${(btns || [])
        .map((b) => `<button type="button" class="btn ${b.primary ? 'btn--primary' : 'btn--secondary'} rw-sc-main" data-sc-btn="${esc(b.id)}">${esc(b.label)}</button>`)
        .join('')}</div>`;
      (btns || []).forEach((b) => body.querySelector(`[data-sc-btn="${b.id}"]`)?.addEventListener('click', b.onClick));
    }

    function renderWaiting() {
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
      const reason = pub.reason === 'no_show' ? oppName() + ' ' + tr('live.noShow', 'didn’t join in time') : tr('live.cancelled', 'Challenge cancelled');
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

    function mountPlay() {
      mode = 'play';
      body.innerHTML = matchLayoutHtml();
      body.querySelector('[data-sc-open-card]').addEventListener('click', () => openScorecardSheet(stateNow()));
      body.querySelector('[data-sc-open-rules]').addEventListener('click', () => openRules({ format: pub.format, preset: pub.preset, toggles: pub.toggles || {}, tie: pub.tie }));
    }

    function renderPlay(st) {
      if (mode !== 'play') mountPlay();
      const strip = C.liveStrip(st);
      const inn = C.current(st);
      const batter = uidOfSide(inn.bat);
      const iBat = batter === me;
      body.querySelector('[data-sc-strip]').innerHTML = stripHtml(strip);
      body.querySelector('[data-sc-over]').innerHTML = overDotsHtml(strip.thisOver);
      const pitch = body.querySelector('[data-sc-pitch]');
      const b = pub.ball;
      if (pub.phase === 'ball' && b && b.n !== animBall) {
        animBall = b.n;
        if (anim) anim.stop();
        anim = playBall(pitch, b.del, b.startAt, serverNow);
        feedback('place');
      } else if (pub.phase !== 'ball' && anim) {
        anim.stop(true);
        anim = null;
      }
      const hint = body.querySelector('[data-sc-hint]');
      const ctl = body.querySelector('[data-sc-controls]');
      const logLen = logOf(pub).length;
      const secs = Math.max(0, Math.ceil((pub.deadline - serverNow()) / 1000));
      if (pub.phase === 'break') {
        hint.textContent = inn.super
          ? tr('break.super', 'Scores level — Super Over!')
          : tr('break.innings', 'Innings break') + ' — ' + strip.batting + ' ' + tr('break.need', 'need') + ' ' + inn.target;
        ctl.innerHTML = '';
        return;
      }
      if (iBat) {
        const canHit = pub.phase === 'ball' && b && hitSent !== b.n;
        if (pub.phase === 'bowl') hint.textContent = oppName() + ' ' + tr('live.isBowling', 'is picking a delivery…');
        else if (pub.phase === 'ball') hint.textContent = hitSent === (b && b.n) ? tr('live.sent', 'Shot played — umpire deciding…') : tr('hint.time', 'Tap Hit as the ball reaches the glowing zone');
        const shotBtns = ctl.querySelector('[data-sc-shot]');
        if (!shotBtns || ctl.dataset.role !== 'bat') {
          ctl.dataset.role = 'bat';
          ctl.innerHTML = shotsHtml(armedShot, true) + `<button type="button" class="btn btn--primary rw-sc-main" data-sc-main>${esc(tr('btn.hit', 'Hit!'))}</button>`;
          ctl.querySelectorAll('[data-sc-shot]').forEach((x) =>
            x.addEventListener('click', () => {
              armedShot = x.dataset.scShot;
              ctl.querySelectorAll('[data-sc-shot]').forEach((y) => y.classList.toggle('is-armed', y === x));
              feedback('select');
            })
          );
          ctl.querySelector('[data-sc-main]').addEventListener('click', onHit);
        }
        ctl.querySelector('[data-sc-main]').disabled = !canHit;
      } else {
        const canBowl = pub.phase === 'bowl' && bowlSent !== logLen;
        if (pub.phase === 'bowl') hint.textContent = canBowl ? tr('live.yourBall', 'Your ball — pick a delivery') + ' (' + secs + 's)' : tr('live.bowled', 'Bowled…');
        else if (pub.phase === 'ball') hint.textContent = oppName() + ' ' + tr('live.isBatting', 'is facing…');
        if (ctl.dataset.role !== 'bowl') {
          ctl.dataset.role = 'bowl';
          ctl.innerHTML = deliveriesHtml(armedDel, true) + `<button type="button" class="btn btn--primary rw-sc-main" data-sc-main>${esc(tr('btn.bowl', 'Bowl'))}</button>`;
          ctl.querySelectorAll('[data-sc-del]').forEach((x) =>
            x.addEventListener('click', () => {
              armedDel = x.dataset.scDel;
              ctl.querySelectorAll('[data-sc-del]').forEach((y) => y.classList.toggle('is-armed', y === x));
              feedback('select');
            })
          );
          ctl.querySelector('[data-sc-main]').addEventListener('click', onBowl);
        }
        ctl.querySelectorAll('[data-sc-del]').forEach((x) => (x.disabled = !canBowl));
        ctl.querySelector('[data-sc-main]').disabled = !canBowl;
      }
    }

    function onBowl() {
      if (!pub || pub.phase !== 'bowl') return;
      const n = logOf(pub).length;
      if (bowlSent === n) return;
      bowlSent = n;
      render();
      liveCall('bowl', { matchId, ballNo: n, delivery: armedDel }).catch((e) => {
        bowlSent = -1;
        if (String(e.code).toUpperCase() !== 'STALE_BALL') toast(liveErrorText(e));
        render();
      });
    }
    function onHit() {
      const b = pub && pub.ball;
      if (!b || pub.phase !== 'ball' || hitSent === b.n) return;
      const tap = serverNow() - b.startAt;
      if (tap < C.deliveryById(b.del).runupMs) return;
      hitSent = b.n;
      if (anim) anim.stop(true);
      render();
      liveCall('hit', { matchId, ballNo: b.n, shot: armedShot, t: Math.round(tap), rtt: lastRtt }).catch((e) => {
        if (String(e.code).toUpperCase() !== 'STALE_BALL') toast(liveErrorText(e));
      });
    }

    function paintPresence() {
      let el = view.overlay.querySelector('[data-sc-banner]');
      if (!pub || pub.status !== 'playing' || oppOnline()) {
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
      el.textContent = oppName() + ' ' + tr('live.reconnecting', 'lost connection — waiting') + ' ' + Math.ceil(leftMs / 1000) + 's';
    }

    function renderOver(st) {
      const side = mySide();
      if (!historySaved) {
        historySaved = true;
        saveHistory(historyEntry(matchId, 'live', tr('hist.vs', 'vs') + ' ' + oppName(), st, side));
        const r = st.result || {};
        view.setOutcome(r.kind === 'win' ? (r.winner === side ? 'win' : 'loss') : 'draw');
        feedback(r.kind === 'win' ? (r.winner === side ? 'win' : 'lose') : 'complete');
      }
      const note = settlementNote();
      if (overShown) {
        const n = body.querySelector('[data-sc-note]');
        if (n) n.textContent = note;
        paintRematch();
        return;
      }
      overShown = true;
      mode = 'over';
      if (anim) anim.stop();
      anim = null;
      resultScreen(view, st, side, {
        note,
        actions: [{ label: tr('rematch', 'Rematch'), primary: true, id: 'rematch' }],
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
      if (shownLog >= 0 && n > shownLog) {
        const lb = lastBallOf(st);
        if (lb && mode === 'play') {
          flash(body, outcomeWord(lb), outcomeKind(lb));
          const pitch = body.querySelector('[data-sc-pitch]');
          setTimeout(() => resetPitch(pitch), 900);
        }
      }
      shownLog = n;
      if (pub.status === 'over') return renderOver(st);
      renderPlay(st);
      if (mode === 'play' && n && pub.phase === 'bowl') {
        const lb = lastBallOf(st);
        const hint = body.querySelector('[data-sc-hint]');
        if (lb && hint && serverNow() - (st.log[n - 1].at || 0) < 2500) hint.textContent = lb.text;
      }
    }

    function loop() {
      if (stopped || !pub) return;
      const now = serverNow();
      paintPresence();
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
      if (pub.status === 'playing' && mode === 'play' && pub.phase === 'bowl') render();
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
        if (!pub) return;
        pub.names = pub.names || {};
        pub.toggles = pub.toggles || {};
        render();
      };
      pubRef.on('value', onPub, () => {});
      subs.push(() => pubRef.off('value', onPub));
      const presAll = ref.child('presence');
      const onPres = (snap) => {
        presence = snap.val() || {};
        paintPresence();
      };
      presAll.on('value', onPres, () => {});
      subs.push(() => presAll.off('value', onPres));
      try {
        const offsetRef = rtdb.ref('.info/serverTimeOffset');
        const onOff = (snap) => {
          const v = snap && snap.val();
          if (typeof v === 'number' && isFinite(v)) offset = v;
        };
        offsetRef.on('value', onOff);
        subs.push(() => offsetRef.off('value', onOff));
      } catch (e) {}
      presRef = ref.child('presence/' + me);
      const beat = () => {
        if (!stopped) presRef.set({ at: TS, online: true }).catch(() => {});
      };
      try {
        presRef.onDisconnect().set({ at: TS, online: false });
      } catch (e) {}
      beat();
      timers.push(setInterval(beat, 10000));
      timers.push(setInterval(loop, 500));
      const onVis = () => {
        if (document.visibilityState === 'visible') beat();
      };
      document.addEventListener('visibilitychange', onVis);
      subs.push(() => document.removeEventListener('visibilitychange', onVis));
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
          <span class="pk-mode-title">${esc(tr('home.ai', 'Play vs AI'))}</span>
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
      body.innerHTML = `
        <div class="pk-field"><div class="pk-field-label">${esc(tr('set.format', 'Format'))}</div>
          ${K.segHtml('format', st.format, C.FORMAT_ORDER.map((id) => [id, C.FORMATS[id].label]))}
          <div class="pk-field-help">${esc(C.FORMATS[st.format].overs + ' ' + (C.FORMATS[st.format].overs === 1 ? tr('over1', 'over') : tr('overs', 'overs')) + ' · ' + C.FORMATS[st.format].wickets + ' ' + (C.FORMATS[st.format].wickets === 1 ? tr('wicket1', 'wicket') : tr('wickets', 'wickets')) + ' ' + tr('set.perSide', 'per side'))}</div></div>
        <div class="pk-field"><div class="pk-field-label">${esc(tr('set.rules', 'Rules'))}</div>
          ${K.segHtml('preset', st.preset, C.PRESET_ORDER.map((id) => [id, id === 'standard' ? tr('preset.standard', 'Standard') : id === 'gully' ? tr('preset.gully', 'Gully') : tr('preset.backyard', 'Backyard')]))}
          <div class="pk-field-help">${esc(p.rated ? tr('set.rated', 'MCC-adapted laws · rated in Live') : tr('set.unrated', 'Street tweaks · unrated'))}</div>
          ${toggles ? `<div class="sc-toggles">${toggles}</div>` : ''}</div>
        <details class="sc-adv"><summary>${esc(tr('set.more', 'More'))}</summary>
          <div class="pk-field"><div class="pk-field-label">${esc(tr('set.tie', 'If scores are level'))}</div>
            ${K.segHtml('tie', st.tie, [['superover', tr('tie.superover', 'Super Over')], ['shared', tr('tie.shared', 'Shared')], ['boundaries', tr('tie.boundaries', 'Boundaries')]])}</div>
          <div class="pk-field"><div class="pk-field-label">${esc(tr('set.level', 'AI level'))}</div>
            ${K.segHtml('level', st.level, [['easy', tr('level.easy', 'Easy')], ['medium', tr('level.medium', 'Medium')], ['hard', tr('level.hard', 'Hard')]])}</div>
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
            toast(tr('find.none', 'No one free right now — warming up against the AI'));
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
    if (!CE()) {
      toast(LABEL + ' ' + tr('loading', 'is still loading — try again'));
      return;
    }
    const ctx = window.__dangalLaunchCtx || {};
    const chat = o.chat || (o.name || o.dangalMatchId || o.uid || o.peerUid ? o : null) || resolveRwChat(o);
    const opp = o.opponentUid || (chat && (chat.opponentUid || chat.uid || chat.peerUid)) || '';
    const mid = o.matchId || (chat && chat.dangalMatchId) || '';
    const src = String(o.source || (chat && chat.dangalSource) || ctx.source || '');
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
    if (o.practiceKind === 'vsAi') return startLocal({ kind: 'ai', source: o.source });
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
        core: 'cricket-engine.js (laws, scoring, stats, seeded ball model — shared with the server)',
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
    openHome: lazy(openHome),
    openScorecard: lazy(openScorecardSheet),
    historyCount: () => history().length,
    mountHistory,
  };
})();
