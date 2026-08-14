/**
 * Court sports + Patang — timing / raid loops (practice vs AI).
 * Badminton, table tennis, pickleball, tennis, kabaddi, kite fighting.
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

  function buzz(a, extra) {
    if (typeof gameFeedback === 'function') gameFeedback(a, extra);
  }

  function openShell(opts) {
    const o = opts || {};
    const overlay = document.createElement('div');
    overlay.className = 'game-overlay game-overlay--dark dangal-fullgame';
    overlay.style.cssText =
      'position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;background:' +
      (o.bg || '#061018') +
      ';';
    const begin = typeof beginGameOverlaySession === 'function' ? beginGameOverlaySession : null;
    const gs = begin
      ? begin({
          type: o.id,
          title: o.title,
          mode: o.mode || 'solo',
          overlay,
          chat: o.chat,
          cleanup: o.cleanup,
        })
      : null;
    if (begin && (!gs || !gs.alive())) return null;
    if (!begin) {
      const device = document.querySelector('.device') || document.body;
      device.appendChild(overlay);
    }
    if (typeof prepareGameOverlay === 'function') {
      prepareGameOverlay(overlay, { theme: 'dark', gameId: o.id, accent: o.accent });
    }
    if (typeof applyGameIdentity === 'function') applyGameIdentity(o.id, overlay);
    overlay.innerHTML =
      (typeof gameChromeHtml === 'function'
        ? gameChromeHtml({ title: o.title, subtitle: o.subtitle || '', backId: o.backId || 'csBack' })
        : '') + `<div class="dangal-fullgame-body" data-cs-body></div>`;
    const body = overlay.querySelector('[data-cs-body]');
    const close = (reason) => {
      if (gs) gs.close(reason || 'dismissed');
      else if (typeof animateGameExit === 'function') animateGameExit(overlay, () => overlay.remove());
      else overlay.remove();
    };
    overlay.querySelector('#' + (o.backId || 'csBack'))?.addEventListener('click', () => close('dismissed'));
    return { overlay, body, gs, close, alive: () => (gs ? gs.alive() : true) };
  }

  function showDuelResult(shell, spec) {
    const you = spec.you | 0;
    const opp = spec.opp | 0;
    const draw = you === opp;
    const won = you > opp;
    if (shell.gs && typeof shell.gs.setOutcome === 'function') {
      shell.gs.setOutcome(draw ? 'draw' : won ? 'won' : 'lost');
    }
    buzz(draw ? 'draw' : won ? 'win' : 'lose');
    if (typeof setGamePB === 'function' && spec.pbScore != null) setGamePB(spec.id, spec.pbScore);
    const html =
      typeof gameResultHtml === 'function'
        ? gameResultHtml({
            gameId: spec.id,
            glyph: spec.glyph,
            title: draw ? 'Draw' : won ? 'You win' : 'You lose',
            subtitle: spec.subtitle || '',
            you,
            opp,
            challenge: false,
          })
        : `<p>${won ? 'Win' : draw ? 'Draw' : 'Loss'}</p>`;
    shell.body.innerHTML = html;
    if (typeof wireGameResultActions === 'function') {
      wireGameResultActions(shell.body, {
        again: () => spec.onAgain(),
        share: () => {
          if (typeof openUnifiedShareSheet === 'function') {
            openUnifiedShareSheet({
              gameId: spec.id,
              stats: { scoreLine: you + '–' + opp, text: spec.shareText },
            });
          }
        },
      });
    }
  }

  function openRallySport(spec) {
    const toWin = spec.toWin || 7;
    const shell = openShell({
      id: spec.id,
      title: spec.name,
      subtitle: 'First to ' + toWin,
      accent: spec.accent,
      bg: spec.bg,
    });
    if (!shell) return;

    let you = 0;
    let opp = 0;
    let rally = 0;
    let windowMs = spec.windowMs || 720;
    let serving = true;
    let locked = false;

    function renderPlay(msg) {
      if (!shell.alive()) return;
      shell.body.innerHTML = `
        <div class="cs-rally">
          <div class="cs-rally-score">${esc(spec.icon)} <strong>${you}</strong> – <strong>${opp}</strong></div>
          <p class="cs-rally-msg">${esc(msg || spec.prompt)}</p>
          <div class="cs-timing" aria-hidden="true"><i data-cs-bar></i></div>
          <button type="button" class="cs-hit" data-cs-hit>${esc(serving ? spec.serveLabel || 'Serve' : spec.hitLabel || 'Hit')}</button>
          <p class="cs-rally-hint">Rally ${rally} · window ${Math.round(windowMs)}ms</p>
        </div>`;
      const bar = shell.body.querySelector('[data-cs-bar]');
      const hit = shell.body.querySelector('[data-cs-hit]');
      let t0 = 0;
      let raf = 0;
      locked = false;
      const duration = serving ? Math.max(900, windowMs + 200) : windowMs;
      const sweet0 = 0.42;
      const sweet1 = 0.78;

      function tick(now) {
        if (!t0) t0 = now;
        const p = Math.min(1, (now - t0) / duration);
        if (bar) bar.style.transform = 'scaleX(' + p + ')';
        if (p >= 1) {
          if (!locked) miss('Late');
          return;
        }
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);

      hit?.addEventListener('click', () => {
        if (locked) return;
        const p = t0 ? Math.min(1, (performance.now() - t0) / duration) : 0;
        if (p < sweet0) {
          miss('Early');
          return;
        }
        if (p > sweet1) {
          miss('Late');
          return;
        }
        locked = true;
        cancelAnimationFrame(raf);
        buzz('kick');
        rally += 1;
        serving = false;
        windowMs = Math.max(380, windowMs * (spec.shrink || 0.94));
        if (Math.random() < 0.26 + rally * 0.04) {
          you += 1;
          rally = 0;
          serving = true;
          windowMs = spec.windowMs || 720;
          if (you >= toWin || opp >= toWin) return finish();
          renderPlay('Opponent missed — your point.');
          return;
        }
        renderPlay(spec.goodLine || 'In! Keep the rally going.');
      });

      function miss(why) {
        if (locked) return;
        locked = true;
        cancelAnimationFrame(raf);
        buzz('lose', { noConfetti: true });
        opp += 1;
        rally = 0;
        serving = true;
        windowMs = spec.windowMs || 720;
        if (opp >= toWin || you >= toWin) return finish();
        renderPlay(why + ' — opponent point.');
      }
    }

    function finish() {
      showDuelResult(shell, {
        id: spec.id,
        you,
        opp,
        glyph: spec.icon,
        pbScore: you,
        subtitle: 'Rally best ' + rally,
        shareText: 'I played ' + spec.name + ' on Chaupaal: ' + you + '–' + opp,
        onAgain: () => openRallySport(spec),
      });
    }

    renderPlay(spec.prompt);
  }

  function openKabaddi() {
    const shell = openShell({
      id: 'kabaddi',
      title: 'Kabaddi',
      subtitle: 'Raid · tag · make it home',
      accent: '#BF360C',
      bg: '#1A0800',
    });
    if (!shell) return;
    const TO_WIN = 5;
    let you = 0;
    let opp = 0;

    function startRaid() {
      if (!shell.alive()) return;
      const breathMax = 8000;
      let breath = breathMax;
      let tagged = 0;
      let home = false;
      const defenders = [0, 1, 2, 3].map((i) => ({ id: i, alive: true }));
      let last = performance.now();
      let raf = 0;

      function paint(msg) {
        shell.body.innerHTML = `
          <div class="cs-kabaddi">
            <div class="cs-rally-score">💪 <strong>${you}</strong> – <strong>${opp}</strong></div>
            <div class="cs-breath"><i style="width:${Math.max(0, (breath / breathMax) * 100)}%"></i></div>
            <p class="cs-rally-msg">${esc(msg || 'Tap defenders to tag, then Home before the breath runs out.')}</p>
            <div class="cs-defenders">
              ${defenders
                .map(
                  (d) =>
                    `<button type="button" class="cs-def" data-def="${d.id}" ${d.alive ? '' : 'disabled'}>${
                      d.alive ? '🛡️' : '✓'
                    }</button>`
                )
                .join('')}
            </div>
            <button type="button" class="cs-hit" data-home>Home</button>
          </div>`;
        shell.body.querySelectorAll('[data-def]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const d = defenders[+btn.dataset.def];
            if (!d || !d.alive || home) return;
            d.alive = false;
            tagged += 1;
            buzz('kick');
            paint('Tagged ' + tagged + '. Get home!');
          });
        });
        shell.body.querySelector('[data-home]')?.addEventListener('click', () => {
          if (home) return;
          home = true;
          cancelAnimationFrame(raf);
          const pts = tagged || 0;
          if (pts > 0) {
            you += pts;
            buzz('win', { noConfetti: true });
          } else {
            opp += 1;
            buzz('lose', { noConfetti: true });
          }
          next('Home with ' + pts + ' point' + (pts === 1 ? '' : 's') + '.');
        });
      }

      function loop(now) {
        const dt = now - last;
        last = now;
        breath -= dt;
        const bar = shell.body.querySelector('.cs-breath i');
        if (bar) bar.style.width = Math.max(0, (breath / breathMax) * 100) + '%';
        if (breath <= 0 && !home) {
          home = true;
          cancelAnimationFrame(raf);
          opp += 1;
          buzz('lose', { noConfetti: true });
          next('Caught — breath ran out.');
          return;
        }
        raf = requestAnimationFrame(loop);
      }

      paint();
      raf = requestAnimationFrame(loop);
    }

    function next(msg) {
      if (you >= TO_WIN || opp >= TO_WIN) {
        showDuelResult(shell, {
          id: 'kabaddi',
          you,
          opp,
          glyph: '💪',
          pbScore: you,
          subtitle: msg,
          shareText: 'Kabaddi on Chaupaal: ' + you + '–' + opp,
          onAgain: openKabaddi,
        });
        return;
      }
      shell.body.insertAdjacentHTML(
        'beforeend',
        `<p class="cs-rally-hint">${esc(msg)} Tap to raid again.</p>`
      );
      const go = () => startRaid();
      shell.body.addEventListener('click', go, { once: true });
    }

    startRaid();
  }

  function openPatang() {
    let raf = 0;
    const shell = openShell({
      id: 'patangbaazi',
      title: 'Patang Baazi',
      subtitle: 'Climb · cut the rival kite',
      accent: '#FF6D00',
      bg: '#001018',
      cleanup: () => cancelAnimationFrame(raf),
    });
    if (!shell) return;

    shell.body.innerHTML = `
      <div class="cs-patang">
        <p class="cs-rally-msg">Hold to climb. Drag left / right. Faster kite cuts on overlap.</p>
        <canvas data-patang></canvas>
        <p class="cs-rally-hint" data-patang-hint>Hold anywhere on the sky</p>
      </div>`;
    const canvas = shell.body.querySelector('[data-patang]');
    const hint = shell.body.querySelector('[data-patang-hint]');
    let ctx = canvas.getContext('2d');
    let w = 320;
    let h = 420;
    const you = { x: 0.35, y: 0.7, vx: 0, speed: 0 };
    const opp = { x: 0.65, y: 0.55, vx: 0, speed: 0.4 };
    let holding = false;
    let ended = false;
    let t = 0;

    function size() {
      const r = canvas.getBoundingClientRect();
      w = Math.max(240, r.width || 300);
      h = Math.max(280, r.height || 360);
      if (typeof ensureGameCanvas === 'function') ensureGameCanvas(canvas, w, h);
      else {
        canvas.width = w;
        canvas.height = h;
      }
      ctx = canvas.getContext('2d');
    }
    size();

    canvas.addEventListener('pointerdown', (e) => {
      holding = true;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', () => {
      holding = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!holding) return;
      const r = canvas.getBoundingClientRect();
      you.x = Math.max(0.08, Math.min(0.92, (e.clientX - r.left) / r.width));
    });

    function end(won) {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      showDuelResult(shell, {
        id: 'patangbaazi',
        you: won ? 1 : 0,
        opp: won ? 0 : 1,
        glyph: '🪁',
        pbScore: won ? 1 : 0,
        subtitle: won ? 'String cut!' : 'Your manjha snapped.',
        shareText: won ? 'I cut a kite on Chaupaal Patang Baazi!' : 'Patang Baazi on Chaupaal',
        onAgain: openPatang,
      });
    }

    function loop(now) {
      if (!shell.alive() || ended) return;
      t = now / 1000;
      you.speed = holding ? Math.min(1, you.speed + 0.02) : Math.max(0.15, you.speed - 0.01);
      you.y -= (holding ? 0.0028 : -0.0012) * (0.6 + you.speed);
      you.y = Math.max(0.12, Math.min(0.88, you.y));
      opp.x = 0.5 + Math.sin(t * 1.3) * 0.28;
      opp.y = 0.42 + Math.cos(t * 0.9) * 0.18;
      opp.speed = 0.45 + Math.abs(Math.sin(t * 2)) * 0.4;

      const dx = you.x - opp.x;
      const dy = you.y - opp.y;
      if (dx * dx + dy * dy < 0.012) {
        end(you.speed > opp.speed + 0.05);
        return;
      }
      if (you.y <= 0.13 && holding) {
        hint.textContent = 'Too high — ease off';
      }

      ctx.clearRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#4FC3F7');
      g.addColorStop(1, '#01579B');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h);
      ctx.lineTo(you.x * w, you.y * h);
      ctx.moveTo(w * 0.55, h);
      ctx.lineTo(opp.x * w, opp.y * h);
      ctx.stroke();
      ctx.font = '28px sans-serif';
      ctx.fillText('🪁', you.x * w - 14, you.y * h);
      ctx.fillText('🪁', opp.x * w - 14, opp.y * h);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
  }

  const RALLIES = [
    {
      id: 'badminton',
      name: 'Badminton',
      icon: '🏸',
      accent: '#01579B',
      bg: '#000D1A',
      toWin: 7,
      windowMs: 700,
      prompt: 'Serve, then smash in the green window.',
      hitLabel: 'Smash',
    },
    {
      id: 'tabletennis',
      name: 'Table Tennis',
      icon: '🏓',
      accent: '#FF6F00',
      bg: '#000A1A',
      toWin: 11,
      windowMs: 560,
      shrink: 0.93,
      prompt: 'Short rallies — tap in the timing window.',
      hitLabel: 'Return',
    },
    {
      id: 'pickleball',
      name: 'Pickleball',
      icon: '🥒',
      accent: '#33691E',
      bg: '#0A1200',
      toWin: 7,
      windowMs: 640,
      prompt: 'Dink and drive. Time the paddle.',
      hitLabel: 'Dink',
    },
    {
      id: 'tennis',
      name: 'Tennis',
      icon: '🎾',
      accent: '#2E7D32',
      bg: '#0A1A0A',
      toWin: 4,
      windowMs: 680,
      prompt: 'Serve, then return. First to 4 games.',
      hitLabel: 'Return',
      serveLabel: 'Serve',
    },
  ];

  if (typeof registerGame === 'function') {
    RALLIES.forEach((g, i) => {
      registerGame({
        id: g.id,
        name: g.name,
        desc: 'Timing rally · first to ' + (g.toWin || 7),
        icon: g.icon,
        gameType: 'solo',
        genre: 'rw_sports',
        solo: true,
        selfChat: true,
        dangal: true,
        chat1v1: true,
        order: 20 + i,
        launch() {
          openRallySport(g);
        },
      });
    });
    registerGame({
      id: 'kabaddi',
      name: 'Kabaddi',
      desc: 'Raid, tag, breathe home',
      icon: '💪',
      gameType: 'solo',
      genre: 'rw_sports',
      solo: true,
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 24,
      launch: openKabaddi,
    });
    registerGame({
      id: 'patangbaazi',
      name: 'Patang Baazi',
      desc: 'Climb and cut the rival kite',
      icon: '🪁',
      gameType: 'solo',
      genre: 'arcade',
      solo: true,
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 25,
      launch: openPatang,
    });
  }

  window.openBadminton = () => openRallySport(RALLIES[0]);
  window.openTableTennis = () => openRallySport(RALLIES[1]);
  window.openPickleball = () => openRallySport(RALLIES[2]);
  window.openTennis = () => openRallySport(RALLIES[3]);
  window.openKabaddi = openKabaddi;
  window.openPatangBaazi = openPatang;
})();
