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
    overlay.innerHTML = `
      <div class="game-chrome">
        ${typeof backButtonHtml==='function'?backButtonHtml({ className: 'game-back-btn', label: 'Close', attrs: 'data-rw-close' }):'<button type="button" class="game-back-btn cp-back-btn" data-rw-close aria-label="Close"></button>'}
        <div class="game-chrome-title">${esc(o.title || 'RW Sports')}</div>
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
    overlay.querySelector('[data-rw-close]')?.addEventListener('click', dismiss);
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

  /** Street Cricket — 6 balls; Tap when the bowler releases to time the shot. */
  function openStreetCricket() {
    let runs = 0;
    let balls = 0;
    let wickets = 0;
    let phase = 'idle'; // idle | bowling | window | result | done
    let windowTimer = null;
    let bowlTimer = null;
    let lastOutcome = '';
    let windowOpenedAt = 0;
    const MAX_BALLS = 6;
    const MAX_WICKETS = 2;
    const clearTimers = () => {
      if (windowTimer) clearTimeout(windowTimer);
      if (bowlTimer) clearTimeout(bowlTimer);
      windowTimer = null;
      bowlTimer = null;
    };
    const { body, gs } = mountSportsShell({
      gameId: 'streetcricket',
      title: 'Street Cricket',
      accent: '#1B7A4E',
      onClose: clearTimers,
    });
    if (!body) return;

    const reset = () => {
      clearTimers();
      runs = 0;
      balls = 0;
      wickets = 0;
      phase = 'idle';
      lastOutcome = '';
      render();
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
      body.innerHTML = `
        <div class="rw-sports-card">
          <div class="rw-sports-hero" aria-hidden="true">🏏</div>
          <h2>Street Cricket</h2>
          <p class="rw-sports-score">${runs} runs · ${balls}/${MAX_BALLS} balls · ${wickets} out${pb}</p>
          <div class="rw-sports-pitch ${phase === 'window' ? 'is-window' : ''}" data-rw-pitch>
            <div class="rw-sports-bowler ${phase === 'bowling' || phase === 'window' ? 'is-runup' : ''}">🎳</div>
            <div class="rw-sports-ball ${phase === 'window' ? 'is-live' : ''}"></div>
            <div class="rw-sports-batter">🧍</div>
            <div class="rw-sports-window-glow" aria-hidden="true"></div>
          </div>
          <div class="rw-sports-outcome" data-rw-outcome aria-live="polite"></div>
          <p class="rw-sports-hint" data-rw-hint>
            ${
              phase === 'idle'
                ? lastOutcome || 'Tap Bowl — then Hit in the green window.'
                : phase === 'bowling'
                  ? 'Ball on the way…'
                  : phase === 'result'
                    ? lastOutcome
                    : 'HIT now!'
            }
          </p>
          <button type="button" class="btn btn--primary" data-rw-action ${
            phase === 'bowling' || phase === 'result' ? 'disabled' : ''
          }>
            ${phase === 'idle' ? 'Bowl' : phase === 'window' ? 'Hit!' : '…'}
          </button>
        </div>`;
      if (lastOutcome && (phase === 'idle' || phase === 'result')) {
        const kind = /out/i.test(lastOutcome) ? 'out' : /six|4|boundary/i.test(lastOutcome) ? 'boundary' : 'run';
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
      render();
      setTimeout(() => {
        if (phase !== 'result') return;
        endIfNeeded();
        if (phase !== 'done') phase = 'idle';
        render();
      }, 750);
    };

    const onAction = () => {
      if (phase === 'idle') {
        lastOutcome = '';
        phase = 'bowling';
        render();
        bowlTimer = setTimeout(() => {
          bowlTimer = null;
          phase = 'window';
          windowOpenedAt = Date.now();
          render();
          windowTimer = setTimeout(() => {
            windowTimer = null;
            if (phase !== 'window') return;
            wickets += 1;
            balls += 1;
            afterBall('Out! Missed the window');
          }, 700);
        }, 650);
        return;
      }
      if (phase === 'window') {
        clearTimers();
        if (typeof gameFeedback === 'function') gameFeedback('bat');
        const elapsed = Date.now() - windowOpenedAt;
        // Timing tiers: early (<180) / perfect (180–420) / late (>420)
        let timing = 'ok';
        if (elapsed < 180) timing = 'early';
        else if (elapsed <= 420) timing = 'perfect';
        else timing = 'late';

        const roll = Math.random();
        if (timing === 'early' && roll < 0.35) {
          wickets += 1;
          balls += 1;
          afterBall('Out! Too early');
          return;
        }
        if (timing === 'late' && roll < 0.28) {
          wickets += 1;
          balls += 1;
          afterBall('Out! Too late');
          return;
        }
        if (roll < 0.1) {
          wickets += 1;
          balls += 1;
          afterBall('Out! Caught');
          return;
        }
        let gained = 1;
        let label = '1 run';
        if (timing === 'perfect') {
          if (roll < 0.35) {
            gained = 6;
            label = 'SIX!';
          } else if (roll < 0.65) {
            gained = 4;
            label = 'Four!';
          } else if (roll < 0.85) {
            gained = 2;
            label = '2 runs';
          } else {
            gained = 1;
            label = '1 run';
          }
        } else if (timing === 'early') {
          gained = roll < 0.55 ? 1 : 2;
          label = gained === 2 ? '2 runs (early)' : '1 run (early)';
        } else {
          gained = roll < 0.45 ? 1 : roll < 0.8 ? 2 : 4;
          label = gained === 4 ? 'Four (late)' : `${gained} run${gained === 1 ? '' : 's'}`;
        }
        runs += gained;
        balls += 1;
        afterBall(label);
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
      desc: 'Six-ball practice · time your shot',
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
      desc: 'Penalty shootout · beat the keeper',
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
