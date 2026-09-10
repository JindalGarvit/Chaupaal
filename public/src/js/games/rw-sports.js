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
      typeof formatVsBest === 'function'
        ? formatVsBest(gameId, score)
        : `Best ${score}${o.unit || ''}`;
    let best = score;
    if (typeof setGamePB === 'function') best = setGamePB(gameId, score) ?? score;
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
    if (typeof gameResultHtml === 'function') {
      body.innerHTML = gameResultHtml({
        gameId,
        glyph: o.glyph || '·',
        title: o.resultTitle || 'Practice over',
        subtitle: o.subtitle || '',
        vsBest,
        shareCardHtml: shareCard,
        challenge: false,
        actions: [
          { label: o.againLabel || 'Play again', primary: true, id: 'again' },
          { label: 'Share', primary: false, id: 'share' },
        ],
      });
      if (typeof wireGameResultActions === 'function') {
        wireGameResultActions(body, {
          again: () => {
            if (typeof o.onAgain === 'function') o.onAgain();
          },
          share: () => {
            if (typeof shareGameResult === 'function') shareGameResult(gameId, shareStats);
          },
        });
      }
      return;
    }
    body.innerHTML = `
      <div class="rw-sports-card">
        <h2>${esc(o.resultTitle || 'Practice over')}</h2>
        <p class="rw-sports-score">${esc(o.subtitle || String(score))}</p>
        <p class="rw-sports-hint">${esc(vsBest)}</p>
        <button type="button" class="btn btn--primary" data-rw-again>${esc(o.againLabel || 'Play again')}</button>
      </div>`;
    body.querySelector('[data-rw-again]')?.addEventListener('click', () => {
      if (typeof o.onAgain === 'function') o.onAgain();
    });
  }

  /** Street Cricket — Practice: flight cinema + bowler's bag (Prompt 2/5). */
  function openStreetCricket() {
    let runs = 0;
    let balls = 0;
    let wickets = 0;
    let phase = 'idle'; // idle | runup | flight | result | done
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
    const MAX_BALLS = 6;
    const MAX_WICKETS = 2;
    const COACH_KEY = 'chaupaal_sc_coach_v2';

    // Prompt 2 bag — id/label/family/path ready for Prompt 3 shot×ball
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
        earlyOut: 0.4,
        lateOut: 0.36,
        perfectCatch: 0.08,
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
        earlyOut: 0.48,
        lateOut: 0.5,
        perfectCatch: 0.1,
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
        earlyOut: 0.36,
        lateOut: 0.32,
        perfectCatch: 0.07,
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
        earlyOut: 0.44,
        lateOut: 0.4,
        perfectCatch: 0.09,
        mistimeHint: 'Turned past the bat',
      },
    };

    const cloneDelivery = (type) => {
      const d = DELIVERY_TYPES[type] || DELIVERY_TYPES.medium;
      return Object.assign({}, d, {
        durationMs: d.runupMs + d.flightMs,
      });
    };

    const mulberry32 = (a) => () => {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    /** Teachable bag: early medium/flight, later spice; avoid triple-same hard balls. */
    const pickDelivery = () => {
      const rnd = mulberry32(overSeed + balls * 97 + 13);
      const r = rnd();
      let pool;
      if (balls <= 1) {
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

    const { body, gs } = mountSportsShell({
      gameId: 'streetcricket',
      title: 'Street Cricket',
      accent: '#1B7A4E',
      onClose: clearTimers,
    });
    if (!body) return;

    try {
      coachShown = localStorage.getItem(COACH_KEY) === '1';
    } catch (e) {
      coachShown = false;
    }

    const cur = () => deliveryMeta || DELIVERY_TYPES.medium;

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

    const reset = () => {
      clearTimers();
      runs = 0;
      balls = 0;
      wickets = 0;
      phase = 'idle';
      lastOutcome = '';
      deliveryStartedAt = 0;
      deliveryMeta = null;
      overSeed = (Date.now() ^ (Math.random() * 0xffff)) >>> 0;
      lastDeliveryId = '';
      streakSame = 0;
      render();
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
            (coachShown
              ? 'Tap Bowl — read the arm, Hit in the striking zone.'
              : 'Watch the arm — quick balls come on faster.');
        } else if (phase === 'runup') hint.textContent = 'Run-up…';
        else if (phase === 'flight')
          hint.textContent = inZone ? 'HIT — ball in the striking zone!' : 'Watch the flight…';
        else if (phase === 'result') hint.textContent = lastOutcome;
      }
    };

    const render = () => {
      if (phase === 'done') {
        finishPractice('streetcricket', runs, body, {
          title: 'Street Cricket',
          glyph: '🏏',
          unit: ' runs',
          resultTitle: 'Innings over',
          subtitle: `${runs} runs · ${wickets} wicket${wickets === 1 ? '' : 's'} · ${balls} balls`,
          scoreLine: `${runs} runs`,
          shareText: `I scored ${runs} runs in Street Cricket on Chaupaal!`,
          againLabel: 'Bat again',
          onAgain: reset,
          gs,
        });
        return;
      }
      const pb =
        typeof getGamePB === 'function' && getGamePB('streetcricket') != null
          ? ` · Best ${getGamePB('streetcricket')}`
          : '';
      const d = cur();
      body.innerHTML = `
        <div class="rw-sports-card rw-sc-card">
          <h2>Street Cricket</h2>
          <p class="rw-sports-score">${runs} runs · ${balls}/${MAX_BALLS} balls · ${wickets} out${pb}</p>
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
          <button type="button" class="btn btn--primary" data-rw-action>Bowl</button>
        </div>`;
      paintPitchState();
      if (lastOutcome && (phase === 'idle' || phase === 'result')) {
        const kind = /out/i.test(lastOutcome)
          ? 'out'
          : /six|four|boundary/i.test(lastOutcome)
            ? 'boundary'
            : 'run';
        flashOutcome(body, lastOutcome, kind);
      }
      body.querySelector('[data-rw-action]')?.addEventListener('click', onAction);
    };

    const endIfNeeded = () => {
      if (balls >= MAX_BALLS || wickets >= MAX_WICKETS) {
        phase = 'done';
      }
    };

    const afterBall = (outcome) => {
      lastOutcome = outcome;
      phase = 'result';
      deliveryStartedAt = 0;
      render();
      resultTimer = setTimeout(() => {
        resultTimer = null;
        if (phase !== 'result') return;
        deliveryMeta = null;
        endIfNeeded();
        if (phase !== 'done') phase = 'idle';
        render();
      }, 900);
    };

    const resolveHit = (timing) => {
      clearTimers();
      const d = cur();
      const roll = Math.random();
      const earlyOut = d.earlyOut != null ? d.earlyOut : 0.4;
      const lateOut = d.lateOut != null ? d.lateOut : 0.36;
      const catchP = d.perfectCatch != null ? d.perfectCatch : 0.08;

      if (timing === 'early') {
        if (roll < earlyOut) {
          wickets += 1;
          balls += 1;
          if (typeof gameFeedback === 'function') gameFeedback('lose');
          afterBall(
            d.id === 'quick' ? 'Early vs Quick — edged, Out!' : `Early — edged, Out! (${d.label})`
          );
          return;
        }
        const gained = roll < 0.75 ? 1 : 2;
        runs += gained;
        balls += 1;
        if (typeof gameFeedback === 'function') gameFeedback('bat');
        afterBall(
          gained === 2
            ? `Early vs ${d.label} — scrambled 2`
            : `Early vs ${d.label} — jabbed 1`
        );
        return;
      }
      if (timing === 'late') {
        if (roll < lateOut) {
          wickets += 1;
          balls += 1;
          if (typeof gameFeedback === 'function') gameFeedback('lose');
          afterBall(
            d.id === 'quick'
              ? 'Beaten for pace — Out!'
              : d.id === 'spin'
                ? 'Late — spun past, Out!'
                : `Late — bowled / Out! (${d.label})`
          );
          return;
        }
        const gained = roll < 0.7 ? 1 : 2;
        runs += gained;
        balls += 1;
        if (typeof gameFeedback === 'function') gameFeedback('bat');
        afterBall(
          gained === 2
            ? `Late vs ${d.label} — thick edge, 2`
            : `Late vs ${d.label} — kept out, 1`
        );
        return;
      }
      // perfect
      if (typeof gameFeedback === 'function') gameFeedback('bat');
      if (roll < catchP) {
        wickets += 1;
        balls += 1;
        if (typeof gameFeedback === 'function') gameFeedback('lose');
        afterBall(`Perfect vs ${d.label} — but caught!`);
        return;
      }
      let gained = 1;
      let label = `Perfect vs ${d.label} — 1 run`;
      if (roll < 0.32) {
        gained = 6;
        label = `Perfect vs ${d.label} — SIX!`;
      } else if (roll < 0.62) {
        gained = 4;
        label = `Perfect vs ${d.label} — FOUR!`;
      } else if (roll < 0.82) {
        gained = 2;
        label = `Perfect vs ${d.label} — 2 runs`;
      }
      runs += gained;
      balls += 1;
      if (gained >= 4 && typeof gameFeedback === 'function') gameFeedback('win');
      afterBall(label);
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
            wickets += 1;
            balls += 1;
            if (typeof gameFeedback === 'function') gameFeedback('lose');
            const miss = cur();
            afterBall(`Out! ${miss.mistimeHint || 'Mistimed the ball'}`);
          }, d.flightMs);
        }, d.runupMs);
        return;
      }
      if (phase === 'flight') {
        const progress = flightProgress();
        const timing = classifyTiming(progress);
        if (timing === 'miss') {
          clearTimers();
          wickets += 1;
          balls += 1;
          if (typeof gameFeedback === 'function') gameFeedback('lose');
          afterBall(`Out! ${cur().mistimeHint || 'Mistimed the ball'}`);
          return;
        }
        resolveHit(timing);
      }
    };

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
      desc: 'Practice · read the delivery',
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
