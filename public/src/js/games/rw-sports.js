/**
 * RW Sports — Street Cricket + Gully Kick (football-style).
 * Trademark-safe names; practice loops with local PB + shared result chrome.
 * Deep match sims / multiplayer still deferred.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function closeOverlay(overlay) {
    if (!overlay) return;
    if (typeof animateGameExit === 'function') {
      animateGameExit(overlay, () => overlay.remove());
    } else {
      overlay.remove();
    }
    try {
      if (typeof restoreAppShell === 'function') restoreAppShell('rw_sports_close');
    } catch (e) {}
  }

  function mountSportsShell(opts) {
    const o = opts || {};
    const overlay = document.createElement('div');
    overlay.className = 'game-overlay game-overlay--light rw-sports-overlay';
    overlay.dataset.gameId = o.gameId || '';
    const practiceSub =
      typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel
        ? DangalLive.modeChromeLabel(false, 'solo')
        : 'Practice';
    overlay.innerHTML =
      typeof gameChromeHtml === 'function'
        ? gameChromeHtml({
            title: o.title || 'RW Sports',
            subtitle: practiceSub,
            backId: 'rwSportsBack',
          }) + `<div class="rw-sports-body" data-rw-body></div>`
        : `
      <div class="game-chrome">
        ${typeof backButtonHtml==='function'?backButtonHtml({ className: 'game-back-btn', label: 'Close', attrs: 'data-rw-close' }):'<button type="button" class="game-back-btn cp-back-btn" data-rw-close aria-label="Close"></button>'}
        <div class="game-chrome-title">${esc(o.title || 'RW Sports')}</div>
        <div class="game-chrome-sub" style="font-size:11px;color:var(--muted);">${esc(practiceSub)}</div>
        <div style="width:36px"></div>
      </div>
      <div class="rw-sports-body" data-rw-body></div>`;
    const begin = typeof beginGameOverlaySession === 'function' ? beginGameOverlaySession : null;
    const gs = begin
      ? begin({
          type: o.gameId,
          title: o.title || o.gameId,
          mode: 'solo',
          overlay,
          cleanup: o.onClose,
        })
      : null;
    if (begin && (!gs || !gs.alive())) {
      return { overlay, body: null, dismiss() {}, gs: null };
    }
    if (!begin) {
      const device = document.querySelector('.device') || document.body;
      device.appendChild(overlay);
    }
    if (typeof prepareGameOverlay === 'function') {
      prepareGameOverlay(overlay, { theme: 'light', gameId: o.gameId, accent: o.accent });
    }
    const dismiss = () => {
      if (gs) gs.close('dismissed');
      else closeOverlay(overlay);
    };
    const onBack = async () => {
      if (typeof confirmLeaveGame === 'function') {
        const leave = await confirmLeaveGame({
          title: 'Leave ' + (o.title || 'practice') + '?',
          body: 'This practice run will end.',
        });
        if (!leave) return;
      }
      dismiss();
    };
    overlay.querySelector('[data-rw-close]')?.addEventListener('click', onBack);
    overlay.querySelector('#rwSportsBack')?.addEventListener('click', onBack);
    return { overlay, body: overlay.querySelector('[data-rw-body]'), dismiss, gs };
  }

  function flashOutcome(body, text, kind) {
    const el = body?.querySelector('[data-rw-outcome]');
    if (!el) return;
    el.textContent = text;
    el.className = `rw-sports-outcome is-show${kind ? ` is-${kind}` : ''}`;
    clearTimeout(flashOutcome._t);
    flashOutcome._t = setTimeout(() => {
      el.classList.remove('is-show');
    }, 900);
  }

  function finishPractice(gameId, score, body, opts) {
    const o = opts || {};
    const vsBest =
      o.vsBest != null
        ? o.vsBest
        : typeof formatVsBest === 'function'
          ? formatVsBest(gameId, score)
          : `Best ${score}${o.unit || ''}`;
    let best = score;
    if (o.updatePb !== false && typeof setGamePB === 'function') {
      best = setGamePB(gameId, score) ?? score;
    }
    if (typeof recordGameResult === 'function') {
      recordGameResult(gameId, false, false, { score, scoreOnly: true });
    } else if (typeof markGamePlayed === 'function') {
      markGamePlayed(gameId);
    }
    if (o.gs && typeof o.gs.setOutcome === 'function') o.gs.setOutcome('complete');
    if (typeof gameFeedback === 'function') gameFeedback('complete');
    const shareStats = {
      scoreLine: o.scoreLine || String(score),
      score,
      meta: vsBest || `Best ${best}${o.unit || ''}`,
      text: o.shareText || `I scored ${score} on Chaupaal ${o.title || gameId}!`,
    };
    const shareCard =
      typeof buildGameShareCard === 'function' ? buildGameShareCard(gameId, shareStats) : '';
    const actions =
      Array.isArray(o.actions) && o.actions.length
        ? o.actions
        : [
            { label: o.againLabel || 'Play again', primary: true, id: 'again' },
            { label: 'Share', primary: false, id: 'share' },
          ];
    if (typeof gameResultHtml === 'function') {
      body.innerHTML = gameResultHtml({
        gameId,
        glyph: o.glyph || '·',
        title: o.resultTitle || 'Practice over',
        subtitle: o.subtitle || '',
        vsBest: o.hideVsBest ? '' : vsBest,
        shareCardHtml: shareCard,
        challenge: false,
        actions,
      });
      if (typeof wireGameResultActions === 'function') {
        const handlers = {
          again: () => {
            if (typeof o.onAgain === 'function') o.onAgain();
          },
          share: () => {
            if (typeof shareGameResult === 'function') shareGameResult(gameId, shareStats);
          },
        };
        if (typeof o.onChangeFormat === 'function') {
          handlers.changeFormat = () => o.onChangeFormat();
        }
        wireGameResultActions(body, handlers);
      }
      return;
    }
    body.innerHTML = `
      <div class="rw-sports-card">
        <h2>${esc(o.resultTitle || 'Practice over')}</h2>
        <p class="rw-sports-score">${esc(o.subtitle || String(score))}</p>
        <p class="rw-sports-hint">${esc(vsBest)}</p>
        <button type="button" class="btn btn--primary" data-rw-again>${esc(o.againLabel || 'Play again')}</button>
        ${
          typeof o.onChangeFormat === 'function'
            ? '<button type="button" class="btn" data-rw-change-format>Change format</button>'
            : ''
        }
      </div>`;
    body.querySelector('[data-rw-again]')?.addEventListener('click', () => {
      if (typeof o.onAgain === 'function') o.onAgain();
    });
    body.querySelector('[data-rw-change-format]')?.addEventListener('click', () => {
      if (typeof o.onChangeFormat === 'function') o.onChangeFormat();
    });
  }

  /** Street Cricket — Practice formats: Over / Nets / Chase (Prompt 4/5). */
  function openStreetCricket() {
    let runs = 0;
    let balls = 0;
    let wickets = 0;
    let perfects = 0;
    let phase = 'pick'; // pick | idle | runup | flight | result | done
    let bowlTimer = null;
    let missTimer = null;
    let resultTimer = null;
    let lastOutcome = '';
    let deliveryStartedAt = 0;
    let deliveryMeta = null;
    let overSeed = (Date.now() ^ (Math.random() * 0xffff)) >>> 0;
    let lastDeliveryId = '';
    let streakSame = 0;
    let coachShown = false;
    let armedShot = 'push';
    let lastBall = null;
    const ballLog = [];
    let formatId = 'over';
    let maxBalls = 6;
    let maxWickets = 2;
    let chaseTarget = 0;
    let endReason = '';
    let sessionWon = false;
    const FORMAT_KEY = 'chaupaal_sc_format_v4';
    const COACH_KEY = 'chaupaal_sc_coach_v3';

    const FORMATS = {
      over: {
        id: 'over',
        label: 'Gully Over',
        blurb: '6 balls · 2 wickets — score big',
        maxBalls: 6,
        maxWickets: 2,
      },
      nets: {
        id: 'nets',
        label: 'Nets',
        blurb: '12 balls · 3 wickets — survive & time',
        maxBalls: 12,
        maxWickets: 3,
      },
      chase: {
        id: 'chase',
        label: 'Chase',
        blurb: 'Hit the target before balls or wickets run out',
        maxBalls: 6,
        maxWickets: 2,
      },
    };

    const SHOTS = {
      defend: { id: 'defend', label: 'Defend' },
      push: { id: 'push', label: 'Push' },
      loft: { id: 'loft', label: 'Loft' },
    };

    const DELIVERY_TYPES = {
      medium: {
        id: 'medium',
        label: 'Medium',
        family: 'pace',
        runupMs: 420,
        flightMs: 1000,
        zoneStart: 0.4,
        zoneEnd: 0.68,
        lateEnd: 0.94,
        path: 'straight',
        accent: '#81C784',
        mistimeHint: 'Mistimed the ball',
      },
      quick: {
        id: 'quick',
        label: 'Quick',
        family: 'pace',
        runupMs: 260,
        flightMs: 700,
        zoneStart: 0.5,
        zoneEnd: 0.64,
        lateEnd: 0.9,
        path: 'skiddy',
        accent: '#EF5350',
        mistimeHint: 'Beaten for pace',
      },
      flight: {
        id: 'flight',
        label: 'Flight',
        family: 'length',
        runupMs: 560,
        flightMs: 1280,
        zoneStart: 0.5,
        zoneEnd: 0.78,
        lateEnd: 0.96,
        path: 'loopy',
        accent: '#42A5F5',
        mistimeHint: 'Through the flight',
      },
      spin: {
        id: 'spin',
        label: 'Spin',
        family: 'spin',
        runupMs: 500,
        flightMs: 1120,
        zoneStart: 0.46,
        zoneEnd: 0.72,
        lateEnd: 0.95,
        path: 'curve',
        accent: '#AB47BC',
        mistimeHint: 'Turned past the bat',
      },
    };

    const cloneDelivery = (type) => {
      const d = DELIVERY_TYPES[type] || DELIVERY_TYPES.medium;
      return Object.assign({}, d, { durationMs: d.runupMs + d.flightMs });
    };

    const mulberry32 = (a) => () => {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const loadSavedFormat = () => {
      try {
        const v = localStorage.getItem(FORMAT_KEY);
        if (v && FORMATS[v]) return v;
      } catch (e) {}
      return 'over';
    };

    const saveFormat = (id) => {
      try {
        localStorage.setItem(FORMAT_KEY, id);
      } catch (e) {}
    };

    const fmt = () => FORMATS[formatId] || FORMATS.over;

    const rollChaseTarget = () => {
      const rnd = mulberry32(overSeed + 41);
      return 16 + Math.floor(rnd() * 7); // 16–22
    };

    const beginSession = () => {
      const f = fmt();
      maxBalls = f.maxBalls;
      maxWickets = f.maxWickets;
      chaseTarget = formatId === 'chase' ? rollChaseTarget() : 0;
      runs = 0;
      balls = 0;
      wickets = 0;
      perfects = 0;
      endReason = '';
      sessionWon = false;
      lastOutcome = '';
      lastBall = null;
      ballLog.length = 0;
      deliveryMeta = null;
      deliveryStartedAt = 0;
      lastDeliveryId = '';
      streakSame = 0;
      overSeed = (Date.now() ^ (Math.random() * 0xffff)) >>> 0;
      armedShot = 'push';
      setChromeSub('Practice · ' + f.label);
    };

    /** Format-aware bag: nets teachable; chase/over spicier later. */
    const pickDelivery = () => {
      const rnd = mulberry32(overSeed + balls * 97 + 13);
      const r = rnd();
      let pool;
      if (formatId === 'nets') {
        if (balls <= 3) {
          pool = r < 0.7 ? ['medium', 'medium', 'flight'] : ['medium', 'flight', 'spin'];
        } else if (balls <= 7) {
          pool =
            r < 0.45
              ? ['medium', 'flight', 'spin']
              : r < 0.75
                ? ['flight', 'medium', 'quick']
                : ['spin', 'medium', 'flight'];
        } else {
          pool =
            r < 0.4
              ? ['medium', 'quick', 'flight']
              : r < 0.7
                ? ['spin', 'flight', 'medium']
                : ['quick', 'spin', 'medium'];
        }
      } else if (formatId === 'chase') {
        if (balls <= 1) {
          pool = r < 0.5 ? ['medium', 'flight', 'medium'] : ['medium', 'quick', 'flight'];
        } else if (balls <= 3) {
          pool =
            r < 0.35
              ? ['quick', 'medium', 'flight']
              : r < 0.7
                ? ['spin', 'flight', 'medium']
                : ['quick', 'spin', 'flight'];
        } else {
          pool =
            r < 0.4
              ? ['quick', 'spin', 'flight']
              : r < 0.7
                ? ['spin', 'quick', 'medium']
                : ['flight', 'quick', 'spin'];
        }
      } else if (balls <= 1) {
        pool =
          r < 0.55
            ? ['medium', 'medium', 'flight']
            : r < 0.85
              ? ['medium', 'flight', 'spin']
              : ['medium', 'quick', 'flight'];
      } else if (balls <= 3) {
        pool =
          r < 0.35
            ? ['medium', 'flight', 'spin']
            : r < 0.7
              ? ['quick', 'medium', 'flight']
              : ['spin', 'flight', 'medium'];
      } else {
        pool =
          r < 0.3
            ? ['quick', 'spin', 'flight']
            : r < 0.6
              ? ['spin', 'quick', 'medium']
              : ['flight', 'quick', 'spin'];
      }
      let id = pool[Math.floor(rnd() * pool.length)] || 'medium';
      if (id === lastDeliveryId && streakSame >= 1 && (id === 'quick' || id === 'spin')) {
        const soft = pool.find((x) => x === 'medium' || x === 'flight') || 'medium';
        id = soft;
      }
      if (id === lastDeliveryId) streakSame += 1;
      else {
        lastDeliveryId = id;
        streakSame = 1;
      }
      return cloneDelivery(id);
    };

    const pickWeighted = (entries, roll) => {
      let acc = 0;
      for (let i = 0; i < entries.length; i++) {
        acc += entries[i][0];
        if (roll < acc) return entries[i][1];
      }
      return entries[entries.length - 1][1];
    };

    /**
     * Explicit resolver: timing × shot × delivery → runs/out.
     * Light street variance only inside weighted buckets — never defend-six like loft.
     */
    const resolveStreetBall = (delivery, timing, shotId) => {
      const del = delivery || DELIVERY_TYPES.medium;
      const shot = SHOTS[shotId] || SHOTS.push;
      const dLabel = del.label || 'Medium';
      const sLabel = shot.label;
      const roll = Math.random();
      const out = (reason, code, label) => ({
        runs: 0,
        out: true,
        reason,
        code,
        label,
        shotId: shot.id,
        deliveryId: del.id,
        timing,
      });
      const ok = (runsVal, reason, code, label) => ({
        runs: runsVal,
        out: false,
        reason,
        code,
        label,
        shotId: shot.id,
        deliveryId: del.id,
        timing,
      });

      if (timing === 'miss') {
        const hint = del.mistimeHint || 'Mistimed the ball';
        return out(
          'beaten',
          'miss_window',
          `Out! ${hint} — left the ${dLabel}`
        );
      }

      // —— Defend: safe floor, capped upside ——
      if (shot.id === 'defend') {
        if (timing === 'perfect') {
          if (roll < 0.03) {
            return out(
              'caught',
              'defend_perfect_catch',
              `Caught — soft hands popped the ${dLabel}`
            );
          }
          const runsVal = pickWeighted(
            [
              [0.45, 0],
              [0.45, 1],
              [0.1, 2],
            ],
            (roll - 0.03) / 0.97
          );
          return ok(
            runsVal,
            runsVal === 0 ? 'dot' : 'nudge',
            'defend_perfect',
            runsVal === 0
              ? `Defend · ${dLabel} — solid block`
              : `Defend · ${dLabel} — ${runsVal} run${runsVal === 1 ? '' : 's'}`
          );
        }
        if (timing === 'early') {
          const outP = del.id === 'quick' ? 0.18 : del.id === 'spin' ? 0.22 : 0.14;
          if (roll < outP) {
            return out(
              'edge',
              'defend_early_edge',
              `Mistimed edge — Defend early vs ${dLabel}`
            );
          }
          return ok(
            roll < outP + 0.55 ? 0 : 1,
            'nudge',
            'defend_early',
            `Defend early · ${dLabel} — kept out`
          );
        }
        // late
        const lateOut = del.id === 'quick' ? 0.22 : 0.16;
        if (roll < lateOut) {
          return out(
            'bowled',
            'defend_late_bowled',
            `Bowled — Defend late, ${dLabel} sneaked through`
          );
        }
        return ok(
          0,
          'dot',
          'defend_late',
          `Defend late · ${dLabel} — jammed the bat down`
        );
      }

      // —— Push: singles machine ——
      if (shot.id === 'push') {
        if (timing === 'perfect') {
          if (roll < 0.05) {
            return out(
              'caught',
              'push_perfect_catch',
              `Caught — Push popped up vs ${dLabel}`
            );
          }
          const r2 = (roll - 0.05) / 0.95;
          const runsVal = pickWeighted(
            [
              [0.12, 0],
              [0.48, 1],
              [0.28, 2],
              [0.12, 4],
            ],
            r2
          );
          return ok(
            runsVal,
            runsVal >= 4 ? 'boundary' : 'push',
            'push_perfect',
            runsVal >= 4
              ? `Push · ${dLabel} — FOUR!`
              : runsVal === 0
                ? `Push · ${dLabel} — no run`
                : `Push · ${dLabel} — ${runsVal} run${runsVal === 1 ? '' : 's'}`
          );
        }
        if (timing === 'early') {
          const outP = del.id === 'quick' ? 0.38 : 0.28;
          if (roll < outP) {
            return out(
              'edge',
              'push_early_edge',
              `Mistimed — edged the Push early vs ${dLabel}`
            );
          }
          return ok(
            roll < outP + 0.5 ? 1 : 0,
            'nudge',
            'push_early',
            `Push early · ${dLabel} — scrambled`
          );
        }
        const lateOut = del.id === 'spin' ? 0.36 : del.id === 'quick' ? 0.4 : 0.3;
        if (roll < lateOut) {
          return out(
            del.id === 'quick' ? 'beaten' : 'bowled',
            'push_late_out',
            del.id === 'quick'
              ? `Beaten for pace — Push late vs Quick`
              : `Bowled — Push late vs ${dLabel}`
          );
        }
        return ok(1, 'push', 'push_late', `Push late · ${dLabel} — thick edge, 1`);
      }

      // —— Loft: boundary hunt, pays for greed ——
      if (timing === 'perfect') {
        let catchP = 0.1;
        if (del.id === 'quick') catchP = 0.16;
        else if (del.id === 'flight') catchP = 0.07;
        else if (del.id === 'spin') catchP = 0.12;
        if (roll < catchP) {
          return out(
            'caught',
            'loft_perfect_catch',
            `Caught — Loft found the fielder vs ${dLabel}`
          );
        }
        const r2 = (roll - catchP) / (1 - catchP);
        let weights;
        if (del.id === 'flight') {
          weights = [
            [0.08, 1],
            [0.12, 2],
            [0.4, 4],
            [0.4, 6],
          ];
        } else if (del.id === 'quick') {
          weights = [
            [0.18, 1],
            [0.22, 2],
            [0.35, 4],
            [0.25, 6],
          ];
        } else {
          weights = [
            [0.12, 1],
            [0.18, 2],
            [0.38, 4],
            [0.32, 6],
          ];
        }
        const runsVal = pickWeighted(weights, r2);
        return ok(
          runsVal,
          runsVal >= 4 ? 'boundary' : 'loft',
          'loft_perfect',
          runsVal === 6
            ? `Loft · ${dLabel} — SIX!`
            : runsVal === 4
              ? `Loft · ${dLabel} — FOUR!`
              : `Loft · ${dLabel} — ${runsVal} runs`
        );
      }
      if (timing === 'early') {
        let outP = 0.55;
        if (del.id === 'quick') outP = 0.72;
        else if (del.id === 'spin') outP = 0.62;
        else if (del.id === 'flight') outP = 0.48;
        if (roll < outP) {
          return out(
            'caught',
            'loft_early_catch',
            del.id === 'quick'
              ? 'Caught — lofted the Quick one early'
              : `Caught — Loft early vs ${dLabel}`
          );
        }
        return ok(
          roll < outP + 0.25 ? 1 : 2,
          'loft',
          'loft_early_survive',
          `Loft early · ${dLabel} — skied, dropped`
        );
      }
      // late loft
      let lateOut = 0.52;
      if (del.id === 'quick') lateOut = 0.62;
      else if (del.id === 'spin') lateOut = 0.58;
      if (roll < lateOut) {
        return out(
          roll < lateOut * 0.55 ? 'bowled' : 'caught',
          'loft_late_out',
          roll < lateOut * 0.55
            ? `Cleaned up — Loft late vs ${dLabel}`
            : `Caught — mistimed slog vs ${dLabel}`
        );
      }
      return ok(1, 'loft', 'loft_late_survive', `Loft late · ${dLabel} — got away with 1`);
    };



    let deliveryRaf = null;
    const clearTimers = () => {
      if (bowlTimer) clearTimeout(bowlTimer);
      if (missTimer) clearTimeout(missTimer);
      if (resultTimer) clearTimeout(resultTimer);
      if (deliveryRaf) cancelAnimationFrame(deliveryRaf);
      bowlTimer = null;
      missTimer = null;
      resultTimer = null;
      deliveryRaf = null;
    };

    const { overlay, body, gs } = mountSportsShell({
      gameId: 'streetcricket',
      title: 'Street Cricket',
      accent: '#1B7A4E',
      onClose: clearTimers,
    });
    if (!body) return;

    const setChromeSub = (text) => {
      const el =
        overlay.querySelector('.game-chrome-subtitle') ||
        overlay.querySelector('.game-chrome-sub');
      if (el) el.textContent = text;
    };

    try {
      coachShown = localStorage.getItem(COACH_KEY) === '1';
    } catch (e) {
      coachShown = false;
    }
    formatId = loadSavedFormat();

    const cur = () => deliveryMeta || DELIVERY_TYPES.medium;
    const shotMeta = () => SHOTS[armedShot] || SHOTS.push;

    const flightElapsed = () => {
      if (!deliveryStartedAt) return 0;
      return Math.max(0, Date.now() - deliveryStartedAt - cur().runupMs);
    };

    const flightProgress = () => {
      const e = flightElapsed();
      const fm = cur().flightMs || 1000;
      if (e <= 0) return 0;
      return Math.min(1, e / fm);
    };

    const classifyTiming = (progress) => {
      const d = cur();
      if (progress < d.zoneStart) return 'early';
      if (progress <= d.zoneEnd) return 'perfect';
      if (progress <= d.lateEnd) return 'late';
      return 'miss';
    };

    const applyPitchVars = (pitch, d) => {
      if (!pitch || !d) return;
      pitch.style.setProperty('--sc-runup-ms', d.runupMs + 'ms');
      pitch.style.setProperty('--sc-flight-ms', d.flightMs + 'ms');
      pitch.style.setProperty('--sc-zone-start', String(d.zoneStart));
      pitch.style.setProperty('--sc-zone-end', String(d.zoneEnd));
      pitch.style.setProperty('--sc-accent', d.accent || '#81C784');
      pitch.dataset.delivery = d.id || 'medium';
      pitch.dataset.path = d.path || 'straight';
      pitch.classList.remove('is-del-medium', 'is-del-quick', 'is-del-flight', 'is-del-spin');
      pitch.classList.add('is-del-' + (d.id || 'medium'));
    };

    const canChangeShot = () => phase === 'idle' || phase === 'runup';

    const scoreHud = () => {
      if (formatId === 'nets') {
        return `${balls}/${maxBalls} faced · ${wickets}/${maxWickets} out · ${perfects} clean · ${runs} runs`;
      }
      if (formatId === 'chase') {
        const left = Math.max(0, maxBalls - balls);
        const wkLeft = Math.max(0, maxWickets - wickets);
        return `${runs}/${chaseTarget} · ${left} ball${left === 1 ? '' : 's'} left · ${wkLeft} wkt${wkLeft === 1 ? '' : 's'}`;
      }
      const pb =
        typeof getGamePB === 'function' && getGamePB('streetcricket') != null
          ? ` · Best ${getGamePB('streetcricket')}`
          : '';
      return `${runs} runs · ${balls}/${maxBalls} balls · ${wickets} out${pb}`;
    };

    const showPicker = () => {
      clearTimers();
      phase = 'pick';
      setChromeSub('Practice · pick format');
      render();
    };

    const reset = () => {
      clearTimers();
      beginSession();
      phase = 'idle';
      render();
    };

    const startSelected = () => {
      saveFormat(formatId);
      beginSession();
      phase = 'idle';
      render();
      if (typeof gameFeedback === 'function') gameFeedback('select');
    };

    const paintPitchState = () => {
      const pitch = body.querySelector('[data-rw-pitch]');
      if (!pitch) return;
      const d = cur();
      applyPitchVars(pitch, d);
      pitch.classList.toggle('is-runup', phase === 'runup' || phase === 'flight');
      pitch.classList.toggle('is-flight', phase === 'flight');
      const p = phase === 'flight' ? flightProgress() : 0;
      const inZone = phase === 'flight' && p >= d.zoneStart && p <= d.zoneEnd;
      pitch.classList.toggle('is-window', inZone);
      body.querySelectorAll('[data-shot]').forEach((el) => {
        const id = el.getAttribute('data-shot');
        el.classList.toggle('is-armed', id === armedShot);
        el.disabled = !canChangeShot();
      });
      const btn = body.querySelector('[data-rw-action]');
      if (btn) {
        const canBowl = phase === 'idle';
        const canHit = phase === 'flight';
        btn.disabled = !(canBowl || canHit);
        btn.textContent = canBowl ? 'Bowl' : canHit ? 'Hit!' : '…';
      }
      const hint = body.querySelector('[data-rw-hint]');
      if (hint) {
        if (phase === 'idle') {
          hint.textContent =
            lastOutcome ||
            (formatId === 'chase'
              ? `Chase ${chaseTarget} — ${shotMeta().label} armed.`
              : formatId === 'nets'
                ? `Nets — ${shotMeta().label} armed. Stay in.`
                : coachShown
                  ? `${shotMeta().label} armed — Bowl, then time the Hit.`
                  : 'Pick Defend, Push, or Loft — then time the Hit.');
        } else if (phase === 'runup') hint.textContent = `${shotMeta().label} ready — run-up…`;
        else if (phase === 'flight')
          hint.textContent = inZone
            ? `HIT — ${shotMeta().label}!`
            : `Watch the flight — ${shotMeta().label}`;
        else if (phase === 'result') hint.textContent = lastOutcome;
      }
      const hud = body.querySelector('[data-rw-hud]');
      if (hud) hud.textContent = scoreHud();
    };

    const wireControls = () => {
      body.querySelectorAll('[data-shot]').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          if (!canChangeShot()) return;
          const id = el.getAttribute('data-shot');
          if (!SHOTS[id]) return;
          armedShot = id;
          paintPitchState();
          if (typeof gameFeedback === 'function') gameFeedback('select');
        });
      });
      body.querySelector('[data-rw-action]')?.addEventListener('click', onAction);
      body.querySelectorAll('[data-format]').forEach((el) => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-format');
          if (!FORMATS[id]) return;
          formatId = id;
          body.querySelectorAll('[data-format]').forEach((b) => {
            b.classList.toggle('is-selected', b.getAttribute('data-format') === formatId);
          });
        });
      });
      body.querySelector('[data-rw-start]')?.addEventListener('click', startSelected);
    };

    const buildResultOpts = () => {
      const f = fmt();
      const innings = {
        formatId,
        label: f.label,
        runs,
        wickets,
        balls,
        maxBalls,
        maxWickets,
        chaseTarget,
        perfects,
        won: sessionWon,
        endReason,
        ballLog: ballLog.slice(),
      };
      try {
        if (typeof window !== 'undefined') window.__scLastInnings = innings;
      } catch (e) {}

      const actions = [
        { label: 'Play again', primary: true, id: 'again' },
        { label: 'Change format', primary: false, id: 'changeFormat' },
        { label: 'Share', primary: false, id: 'share' },
      ];
      const base = {
        title: 'Street Cricket',
        glyph: '🏏',
        onAgain: reset,
        onChangeFormat: showPicker,
        actions,
        challenge: false,
        gs,
      };

      if (formatId === 'nets') {
        return Object.assign(base, {
          updatePb: false,
          hideVsBest: true,
          unit: ' clean',
          resultTitle: endReason === 'wickets' ? 'Nets — all out' : 'Nets session over',
          subtitle: `${balls} balls · ${perfects} clean hits · ${runs} runs · ${wickets} out`,
          scoreLine: `${perfects} clean`,
          score: perfects,
          shareText: `Nets on Chaupaal: ${perfects} clean hits in ${balls} balls (${runs} runs).`,
          againLabel: 'Nets again',
        });
      }
      if (formatId === 'chase') {
        const shortBy = Math.max(0, chaseTarget - runs);
        return Object.assign(base, {
          updatePb: false,
          hideVsBest: true,
          unit: '',
          resultTitle: sessionWon ? 'Chase done!' : 'Chase fell short',
          subtitle: sessionWon
            ? `Won chasing ${chaseTarget} — ${runs} off ${balls} · ${wickets} out`
            : `Needed ${chaseTarget}, made ${runs} (short by ${shortBy}) · ${balls} balls · ${wickets} out`,
          scoreLine: sessionWon ? `Chased ${chaseTarget}` : `${runs}/${chaseTarget}`,
          score: runs,
          shareText: sessionWon
            ? `Chased down ${chaseTarget} in Street Cricket on Chaupaal!`
            : `Fell short of ${chaseTarget} in Street Cricket on Chaupaal (${runs}).`,
          againLabel: 'Chase again',
        });
      }
      return Object.assign(base, {
        updatePb: true,
        unit: ' runs',
        resultTitle: 'Gully Over over',
        subtitle: `${runs} runs · ${wickets} wicket${wickets === 1 ? '' : 's'} · ${balls} balls`,
        scoreLine: `${runs} runs`,
        score: runs,
        shareText: `I scored ${runs} runs in a Gully Over on Chaupaal!`,
        againLabel: 'Bat again',
      });
    };

    const render = () => {
      if (phase === 'pick') {
        const cards = ['over', 'nets', 'chase']
          .map((id) => {
            const f = FORMATS[id];
            return `<button type="button" class="rw-sc-format${formatId === id ? ' is-selected' : ''}" data-format="${id}">
              <span class="rw-sc-format-title">${f.label}</span>
              <span class="rw-sc-format-blurb">${f.blurb}</span>
            </button>`;
          })
          .join('');
        body.innerHTML = `
          <div class="rw-sports-card rw-sc-card rw-sc-picker">
            <h2>Street Cricket</h2>
            <p class="rw-sports-hint">Pick a practice shape — same bowling bag & shots.</p>
            <div class="rw-sc-formats" role="listbox" aria-label="Format">${cards}</div>
            <button type="button" class="btn btn--primary rw-sc-main" data-rw-start>Start</button>
          </div>`;
        wireControls();
        return;
      }
      if (phase === 'done') {
        const opts = buildResultOpts();
        finishPractice('streetcricket', opts.score != null ? opts.score : runs, body, opts);
        return;
      }
      const d = cur();
      const shotLock = canChangeShot() ? '' : 'disabled';
      body.innerHTML = `
        <div class="rw-sports-card rw-sc-card">
          <h2>${fmt().label}</h2>
          <p class="rw-sports-score" data-rw-hud>${scoreHud()}</p>
          <div class="rw-sports-pitch rw-sc-pitch is-del-${d.id || 'medium'}" data-rw-pitch
            data-delivery="${d.id || 'medium'}" data-path="${d.path || 'straight'}"
            style="--sc-runup-ms:${d.runupMs}ms;--sc-flight-ms:${d.flightMs}ms;--sc-zone-start:${d.zoneStart};--sc-zone-end:${d.zoneEnd};--sc-accent:${d.accent || '#81C784'}">
            <div class="rw-sc-lane" aria-hidden="true"></div>
            <div class="rw-sc-zone" aria-hidden="true"></div>
            <div class="rw-sc-bowler" aria-hidden="true"><span class="rw-sc-bowler-mark"></span></div>
            <div class="rw-sc-ball" aria-hidden="true"></div>
            <div class="rw-sc-batter" aria-hidden="true"><span class="rw-sc-bat"></span></div>
            <div class="rw-sc-stumps" aria-hidden="true"></div>
          </div>
          <div class="rw-sports-outcome" data-rw-outcome aria-live="polite"></div>
          <p class="rw-sports-hint" data-rw-hint></p>
          <div class="rw-sc-shots" role="group" aria-label="Shot">
            <button type="button" class="rw-sc-shot${armedShot === 'defend' ? ' is-armed' : ''}" data-shot="defend" ${shotLock}>Defend</button>
            <button type="button" class="rw-sc-shot${armedShot === 'push' ? ' is-armed' : ''}" data-shot="push" ${shotLock}>Push</button>
            <button type="button" class="rw-sc-shot${armedShot === 'loft' ? ' is-armed' : ''}" data-shot="loft" ${shotLock}>Loft</button>
          </div>
          <button type="button" class="btn btn--primary rw-sc-main" data-rw-action>Bowl</button>
        </div>`;
      paintPitchState();
      if (lastOutcome && (phase === 'idle' || phase === 'result')) {
        const kind =
          lastBall && lastBall.out
            ? 'out'
            : lastBall && lastBall.runs >= 4
              ? 'boundary'
              : /out|caught|bowled|beaten|cleaned|mistimed/i.test(lastOutcome)
                ? 'out'
                : /six|four|boundary/i.test(lastOutcome)
                  ? 'boundary'
                  : 'run';
        flashOutcome(body, lastOutcome, kind);
      }
      wireControls();
    };

    const evaluateEnd = () => {
      if (formatId === 'chase' && runs >= chaseTarget) {
        return { done: true, won: true, reason: 'chase_won' };
      }
      if (wickets >= maxWickets) {
        return { done: true, won: false, reason: 'wickets' };
      }
      if (balls >= maxBalls) {
        const won = formatId === 'chase' ? runs >= chaseTarget : true;
        return { done: true, won, reason: 'balls' };
      }
      return { done: false, won: false, reason: '' };
    };

    const afterBall = (outcome) => {
      lastOutcome = outcome;
      phase = 'result';
      deliveryStartedAt = 0;
      const end = evaluateEnd();
      if (end.done) {
        sessionWon = !!end.won;
        endReason = end.reason;
        if (end.reason === 'chase_won' && typeof gameFeedback === 'function') {
          gameFeedback('win');
        }
      }
      render();
      const delay = end.done && end.reason === 'chase_won' ? 650 : 950;
      resultTimer = setTimeout(() => {
        resultTimer = null;
        deliveryMeta = null;
        if (end.done) phase = 'done';
        else if (phase === 'result') phase = 'idle';
        render();
      }, delay);
    };

    const applyResolved = (res) => {
      clearTimers();
      balls += 1;
      if (res.timing === 'perfect' && !res.out) perfects += 1;
      lastBall = Object.assign({}, res, {
        ballIndex: balls,
        deliveryLabel: cur().label,
        shotLabel: (SHOTS[res.shotId] || SHOTS.push).label,
      });
      ballLog.push(lastBall);
      try {
        if (typeof window !== 'undefined') {
          window.__scLastBall = lastBall;
          window.__scBallLog = ballLog.slice();
        }
      } catch (e) {}
      if (res.out) {
        wickets += 1;
        if (typeof gameFeedback === 'function') gameFeedback('lose');
      } else {
        runs += res.runs || 0;
        if (res.runs >= 4 && typeof gameFeedback === 'function') gameFeedback('win');
        else if (typeof gameFeedback === 'function') gameFeedback('bat');
      }
      afterBall(res.label);
    };

    const onAction = () => {
      if (phase === 'idle') {
        lastOutcome = '';
        clearTimers();
        if (!coachShown) {
          coachShown = true;
          try {
            localStorage.setItem(COACH_KEY, '1');
          } catch (e) {}
        }
        deliveryMeta = pickDelivery();
        deliveryStartedAt = Date.now();
        phase = 'runup';
        render();
        if (typeof gameFeedback === 'function') gameFeedback('place');
        try {
          if (typeof window !== 'undefined') window.__scLastDelivery = deliveryMeta;
        } catch (e) {}
        const d = cur();
        bowlTimer = setTimeout(() => {
          bowlTimer = null;
          if (phase !== 'runup') return;
          phase = 'flight';
          paintPitchState();
          const tick = () => {
            if (phase !== 'flight') {
              deliveryRaf = null;
              return;
            }
            paintPitchState();
            deliveryRaf = requestAnimationFrame(tick);
          };
          deliveryRaf = requestAnimationFrame(tick);
          missTimer = setTimeout(() => {
            missTimer = null;
            if (phase !== 'flight') return;
            applyResolved(resolveStreetBall(cur(), 'miss', armedShot));
          }, d.flightMs);
        }, d.runupMs);
        return;
      }
      if (phase === 'flight') {
        const progress = flightProgress();
        const timing = classifyTiming(progress);
        applyResolved(resolveStreetBall(cur(), timing, armedShot));
      }
    };

    setChromeSub('Practice · pick format');
    render();
  }


  /** Gully Kick — 5 penalties; aim left/center/right vs keeper dive. */
  function openGullyKick() {
    const { body, gs } = mountSportsShell({
      gameId: 'gullykick',
      title: 'Gully Kick',
      accent: '#2D6A4F',
    });
    if (!body) return;
    let scored = 0;
    let taken = 0;
    const MAX = 5;
    let phase = 'aim'; // aim | result | done
    let lastResult = '';
    let lastDive = 'C';
    let lastAim = 'C';
    let lastGoal = false;

    const reset = () => {
      scored = 0;
      taken = 0;
      phase = 'aim';
      lastResult = '';
      lastDive = 'C';
      lastAim = 'C';
      lastGoal = false;
      render();
    };

    const diveLabel = (d) => (d === 'L' ? 'left' : d === 'R' ? 'right' : 'center');

    const render = () => {
      if (phase === 'done') {
        const empty = scored === 0;
        finishPractice('gullykick', scored, body, {
          title: 'Gully Kick',
          glyph: '⚽',
          unit: ' goals',
          resultTitle: empty ? 'No goals this round' : 'Shootout over',
          subtitle: `${scored} / ${MAX} goals`,
          scoreLine: `${scored}/${MAX}`,
          shareText: `I scored ${scored}/${MAX} in Gully Kick on Chaupaal!`,
          againLabel: 'Kick again',
          onAgain: reset,
          gs,
        });
        return;
      }
      const pb =
        typeof getGamePB === 'function' && getGamePB('gullykick') != null
          ? ` · Best ${getGamePB('gullykick')}/${MAX}`
          : '';
      const keeperClass =
        phase === 'result' ? `is-dive-${lastDive.toLowerCase()}${lastGoal ? '' : ' is-save'}` : '';
      body.innerHTML = `
        <div class="rw-sports-card">
          <div class="rw-sports-hero" aria-hidden="true">⚽</div>
          <h2>Gully Kick</h2>
          <p class="rw-sports-score">${scored} scored · ${taken}/${MAX} taken${pb}</p>
          <div class="rw-sports-goal" aria-hidden="true">
            <div class="rw-sports-net"></div>
            <div class="rw-sports-keeper ${keeperClass}">🧤</div>
            ${
              phase === 'result'
                ? `<div class="rw-sports-ball-kick is-aim-${lastAim.toLowerCase()}${
                    lastGoal ? ' is-goal' : ' is-saved'
                  }"></div>`
                : ''
            }
          </div>
          <div class="rw-sports-outcome" data-rw-outcome aria-live="polite"></div>
          <p class="rw-sports-hint">${
            phase === 'result' ? lastResult : lastResult || 'Pick a corner — beat the keeper.'
          }</p>
          <div class="rw-sports-aim">
            <button type="button" class="btn" data-aim="L" ${phase !== 'aim' ? 'disabled' : ''}>Left</button>
            <button type="button" class="btn btn--primary" data-aim="C" ${
              phase !== 'aim' ? 'disabled' : ''
            }>Center</button>
            <button type="button" class="btn" data-aim="R" ${phase !== 'aim' ? 'disabled' : ''}>Right</button>
          </div>
        </div>`;
      if (phase === 'result' && lastResult) {
        flashOutcome(body, lastGoal ? 'Goal!' : 'Saved!', lastGoal ? 'goal' : 'out');
      }
      body.querySelectorAll('[data-aim]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (phase !== 'aim') return;
          const aim = btn.dataset.aim;
          const dive = ['L', 'C', 'R'][Math.floor(Math.random() * 3)];
          lastAim = aim;
          lastDive = dive;
          taken += 1;
          if (typeof gameFeedback === 'function') gameFeedback('kick');
          if (aim !== dive) {
            scored += 1;
            lastGoal = true;
            lastResult = `Goal! Keeper dove ${diveLabel(dive)}.`;
            if (typeof gameFeedback === 'function') gameFeedback('win', { noConfetti: true });
          } else {
            lastGoal = false;
            lastResult = 'Saved! Same corner as the keeper.';
            if (typeof gameFeedback === 'function') gameFeedback('lose', { noConfetti: true });
          }
          phase = 'result';
          render();
          setTimeout(() => {
            if (phase !== 'result') return;
            if (taken >= MAX) phase = 'done';
            else phase = 'aim';
            render();
          }, 900);
        });
      });
    };

    render();
  }

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'streetcricket',
      name: 'Street Cricket',
      desc: 'Practice · Over / Nets / Chase',
      icon: '🏏',
      ratingKey: 'streetcricket',
      gameType: 'solo',
      genre: 'rw_sports',
      solo: true,
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 5,
      launch() {
        openStreetCricket();
      },
    });
    registerGame({
      id: 'gullykick',
      name: 'Gully Kick',
      desc: 'Practice · penalty shootout',
      icon: '⚽',
      ratingKey: 'gullykick',
      gameType: 'solo',
      genre: 'rw_sports',
      solo: true,
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 6,
      launch() {
        openGullyKick();
      },
    });
  }

  window.openStreetCricket = openStreetCricket;
  window.openGullyKick = openGullyKick;
})();
