/**
 * RW Sports — Street Cricket + Gully Kick (football-style).
 * Trademark-safe names; thin but honest playable practice loops.
 * Deep match sims deferred.
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
        <button type="button" class="game-back-btn" data-rw-close aria-label="Close">←</button>
        <div class="game-chrome-title">${esc(o.title || 'RW Sports')}</div>
        <div style="width:36px"></div>
      </div>
      <div class="rw-sports-body" data-rw-body></div>`;
    const device = document.querySelector('.device') || document.body;
    device.appendChild(overlay);
    if (typeof prepareGameOverlay === 'function') {
      prepareGameOverlay(overlay, { theme: 'light', gameId: o.gameId, accent: o.accent, coach: false });
    }
    const dismiss = () => {
      try {
        if (typeof o.onClose === 'function') o.onClose();
      } catch (e) {}
      closeOverlay(overlay);
    };
    overlay.querySelector('[data-rw-close]')?.addEventListener('click', dismiss);
    return { overlay, body: overlay.querySelector('[data-rw-body]'), dismiss };
  }

  /** Street Cricket — 6 balls; Tap when the bowler releases to time the shot. */
  function openStreetCricket() {
    let runs = 0;
    let balls = 0;
    let wickets = 0;
    let phase = 'idle'; // idle | bowling | window | done
    let windowTimer = null;
    let bowlTimer = null;
    const MAX_BALLS = 6;
    const MAX_WICKETS = 2;
    const clearTimers = () => {
      if (windowTimer) clearTimeout(windowTimer);
      if (bowlTimer) clearTimeout(bowlTimer);
      windowTimer = null;
      bowlTimer = null;
    };
    const { body } = mountSportsShell({
      gameId: 'streetcricket',
      title: 'Street Cricket',
      accent: '#1B7A4E',
      onClose: clearTimers,
    });

    const render = () => {
      if (phase === 'done') {
        body.innerHTML = `
          <div class="rw-sports-card">
            <div class="rw-sports-hero" aria-hidden="true">🏏</div>
            <h2>Innings over</h2>
            <p class="rw-sports-score">${runs} runs · ${wickets} wicket${wickets === 1 ? '' : 's'}</p>
            <p class="rw-sports-hint">Practice over — deeper matches coming later.</p>
            <button type="button" class="btn btn--primary" data-rw-again>Bat again</button>
          </div>`;
        body.querySelector('[data-rw-again]')?.addEventListener('click', () => {
          runs = 0;
          balls = 0;
          wickets = 0;
          phase = 'idle';
          render();
        });
        return;
      }
      body.innerHTML = `
        <div class="rw-sports-card">
          <div class="rw-sports-hero" aria-hidden="true">🏏</div>
          <h2>Street Cricket</h2>
          <p class="rw-sports-score">${runs} runs · ${balls}/${MAX_BALLS} balls · ${wickets} out</p>
          <div class="rw-sports-pitch" data-rw-pitch>
            <div class="rw-sports-bowler ${phase === 'bowling' || phase === 'window' ? 'is-runup' : ''}">🎳</div>
            <div class="rw-sports-ball ${phase === 'window' ? 'is-live' : ''}"></div>
            <div class="rw-sports-batter">🧍</div>
          </div>
          <p class="rw-sports-hint" data-rw-hint>
            ${phase === 'idle' ? 'Tap Bowl — then tap Hit in the green window.' : phase === 'bowling' ? 'Ball on the way…' : 'HIT now!'}
          </p>
          <button type="button" class="btn btn--primary" data-rw-action>
            ${phase === 'idle' ? 'Bowl' : phase === 'window' ? 'Hit!' : '…'}
          </button>
        </div>`;
      const btn = body.querySelector('[data-rw-action]');
      btn.disabled = phase === 'bowling';
      btn?.addEventListener('click', onAction);
    };

    const endIfNeeded = () => {
      if (balls >= MAX_BALLS || wickets >= MAX_WICKETS) {
        phase = 'done';
        if (typeof recordGamePlay === 'function') recordGamePlay('streetcricket');
        else if (typeof markGamePlayed === 'function') markGamePlayed('streetcricket');
      }
    };

    const onAction = () => {
      if (phase === 'idle') {
        phase = 'bowling';
        render();
        bowlTimer = setTimeout(() => {
          bowlTimer = null;
          phase = 'window';
          render();
          windowTimer = setTimeout(() => {
            windowTimer = null;
            if (phase !== 'window') return;
            // Missed timing → wicket
            wickets += 1;
            balls += 1;
            phase = 'idle';
            endIfNeeded();
            render();
          }, 700);
        }, 650);
        return;
      }
      if (phase === 'window') {
        clearTimers();
        const roll = Math.random();
        if (roll < 0.12) {
          wickets += 1;
        } else if (roll < 0.28) {
          runs += 1;
        } else if (roll < 0.55) {
          runs += 2;
        } else if (roll < 0.78) {
          runs += 4;
        } else {
          runs += 6;
        }
        balls += 1;
        phase = 'idle';
        endIfNeeded();
        render();
      }
    };

    render();
  }

  /** Gully Kick — 5 penalties; aim left/center/right vs keeper dive. */
  function openGullyKick() {
    const { overlay, body } = mountSportsShell({
      gameId: 'gullykick',
      title: 'Gully Kick',
      accent: '#2D6A4F',
    });
    let scored = 0;
    let taken = 0;
    const MAX = 5;
    let phase = 'aim'; // aim | result | done
    let lastResult = '';

    const render = () => {
      if (phase === 'done') {
        body.innerHTML = `
          <div class="rw-sports-card">
            <div class="rw-sports-hero" aria-hidden="true">⚽</div>
            <h2>Shootout over</h2>
            <p class="rw-sports-score">${scored} / ${MAX} goals</p>
            <p class="rw-sports-hint">Quick kick practice — full pitch play later.</p>
            <button type="button" class="btn btn--primary" data-rw-again>Kick again</button>
          </div>`;
        body.querySelector('[data-rw-again]')?.addEventListener('click', () => {
          scored = 0;
          taken = 0;
          phase = 'aim';
          lastResult = '';
          render();
        });
        return;
      }
      body.innerHTML = `
        <div class="rw-sports-card">
          <div class="rw-sports-hero" aria-hidden="true">⚽</div>
          <h2>Gully Kick</h2>
          <p class="rw-sports-score">${scored} scored · ${taken}/${MAX} taken</p>
          <div class="rw-sports-goal" aria-hidden="true">
            <div class="rw-sports-net"></div>
            <div class="rw-sports-keeper">🧤</div>
          </div>
          <p class="rw-sports-hint">${lastResult || 'Pick a corner — beat the keeper.'}</p>
          <div class="rw-sports-aim">
            <button type="button" class="btn" data-aim="L">Left</button>
            <button type="button" class="btn btn--primary" data-aim="C">Center</button>
            <button type="button" class="btn" data-aim="R">Right</button>
          </div>
        </div>`;
      body.querySelectorAll('[data-aim]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (phase !== 'aim') return;
          const aim = btn.dataset.aim;
          const dive = ['L', 'C', 'R'][Math.floor(Math.random() * 3)];
          taken += 1;
          if (aim !== dive) {
            scored += 1;
            lastResult = `Goal! Keeper dove ${dive === 'L' ? 'left' : dive === 'R' ? 'right' : 'center'}.`;
          } else {
            lastResult = 'Saved! Same corner as the keeper.';
          }
          if (taken >= MAX) {
            phase = 'done';
            if (typeof recordGamePlay === 'function') recordGamePlay('gullykick');
            else if (typeof markGamePlayed === 'function') markGamePlayed('gullykick');
          }
          render();
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
