/**
 * Phase 2A — wrap a game overlay with createGameSession.
 * Parent dismiss → cleanup (timers / RAF / listeners). Analytics via session.end.
 *
 * Lifecycle (Polish P0):
 *   - Prefer gs.schedule(fn, ms) for timeouts (auto-cleared).
 *   - Prefer gs.registerAnimFrame(cb) for RAF loops (cancelled on cleanup).
 *   - Games that keep raw requestAnimationFrame / setInterval MUST cancel them in cleanup.
 *   - overlayScope follows launch source (Manch ≠ chat) so leave returns correctly.
 *
 * @returns {{ alive:()=>boolean, close:(result?:string)=>void, setOutcome:(r:string)=>void, getOutcome:()=>string|null, schedule:(fn:Function,ms:number)=>number, clearTimers:()=>void, registerAnimFrame:(cb:FrameRequestCallback)=>number, clearAnimFrames:()=>void }}
 */
function beginGameOverlaySession(opts) {
  const type = opts.type;
  const overlay = opts.overlay;
  const userCleanup = typeof opts.cleanup === 'function' ? opts.cleanup : null;
  const onEnd = typeof opts.onEnd === 'function' ? opts.onEnd : null;
  const timers = new Set();
  const rafs = new Set();
  let alive = true;
  let outcome = null;
  let session = null;
  const launch = window.__dangalLaunchCtx || {};
  const launchSource =
    typeof resolveGameLaunchSource === 'function'
      ? resolveGameLaunchSource(
          Object.assign({}, launch, { source: opts.source || launch.source, chat: opts.chat })
        )
      : opts.source || launch.source || '';
  const overlayScope =
    opts.overlayScope ||
    (typeof resolveGameOverlayScope === 'function'
      ? resolveGameOverlayScope(launchSource)
      : typeof OVERLAY_SCOPE_CHAT !== 'undefined'
        ? OVERLAY_SCOPE_CHAT
        : 'chat');
  const opponentUid =
    opts.opponentUid ||
    launch.opponentUid ||
    (typeof opponentUidFromChat === 'function' ? opponentUidFromChat(opts.chat) : '');
  const matchId = String(
    opts.matchId ||
      launch.matchId ||
      (opts.chat && opts.chat.dangalMatchId) ||
      (typeof dangalMatchId === 'function' ? dangalMatchId(type, opts.chat) : type + '_' + Date.now())
  )
    .replace(/[^\w.-]/g, '')
    .slice(0, 120);
  const stake = Number(opts.stake || launch.stake) || 0;
  const skipEconomyReport = !!opts.skipEconomyReport;
  const returnCtx = {
    source: launchSource,
    chat: opts.chat,
    chatId: launch.chatId || '',
  };

  if (overlay) {
    if (!overlay.innerHTML || !String(overlay.innerHTML).trim()) {
      const title = opts.title || type || 'Game';
      const theme = opts.theme || 'dark';
      if (typeof gameSkeletonHtml === 'function') {
        const tmp = document.createElement('div');
        tmp.innerHTML = gameSkeletonHtml({ title, theme });
        const shell = tmp.firstElementChild;
        if (shell) {
          overlay.className = shell.className;
          overlay.innerHTML = shell.innerHTML;
        }
      } else {
        overlay.innerHTML = `<div style="padding:24px;color:#fff;opacity:.6;font-family:Space Grotesk,sans-serif;font-weight:700;">${title}</div>`;
      }
    }
    if (typeof prepareGameOverlay === 'function') {
      prepareGameOverlay(overlay, { theme: opts.theme || 'dark', gameId: type, accent: opts.accent });
    } else if (overlay.classList) {
      overlay.classList.add('game-overlay', 'game-overlay--ready');
    }
  }

  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  }

  function clearAnimFrames() {
    rafs.forEach((id) => {
      try {
        cancelAnimationFrame(id);
      } catch (e) {}
    });
    rafs.clear();
  }

  function schedule(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!alive) return;
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  /** Tracked RAF — cancelled automatically in cleanup. Prefer over raw requestAnimationFrame. */
  function registerAnimFrame(cb) {
    let id = 0;
    const wrap = (ts) => {
      rafs.delete(id);
      if (!alive) return;
      try {
        cb(ts);
      } catch (e) {
        console.warn('[game] raf', e);
      }
    };
    id = requestAnimationFrame(wrap);
    rafs.add(id);
    return id;
  }

  function setOutcome(r) {
    if (outcome == null && r != null) {
      outcome = r;
      if (typeof gameFeedback === 'function') {
        const key = r === 'won' ? 'win' : r === 'lost' ? 'lose' : r === 'draw' ? 'draw' : null;
        if (key) gameFeedback(key);
      }
      if (typeof DSL !== 'undefined' && DSL.onGameOver) {
        try {
          DSL.onGameOver({ gameType: type, result: r, overlay });
        } catch (e) {}
      }
      if (!skipEconomyReport && window.DangalEconomy && typeof DangalEconomy.reportGameEnd === 'function') {
        try {
          DangalEconomy.reportGameEnd({
            gameType: type,
            result: r,
            sessionId: matchId,
            matchId,
            opponentUid,
            stake,
          });
        } catch (e) {}
      }
    }
  }

  function runUserCleanup() {
    clearTimers();
    clearAnimFrames();
    if (userCleanup) {
      try {
        userCleanup();
      } catch (e) {
        console.warn('[game] cleanup', e);
      }
    }
  }

  function close(result) {
    if (!alive && !session) return;
    const r = result != null ? result : outcome || 'quit';
    if (session) {
      try {
        session.end(r);
      } catch (e) {
        alive = false;
        runUserCleanup();
        if (overlay && overlay.isConnected) overlay.remove();
        try {
          if (typeof honorGameReturnTarget === 'function') honorGameReturnTarget(returnCtx);
        } catch (e2) {}
      }
      return;
    }
    alive = false;
    runUserCleanup();
    if (typeof clearDangalLaunchCtx === 'function') clearDangalLaunchCtx();
    if (onEnd) {
      try {
        onEnd(r);
      } catch (e) {}
    }
    if (overlay && overlay.isConnected) overlay.remove();
    try {
      if (typeof honorGameReturnTarget === 'function') honorGameReturnTarget(returnCtx);
    } catch (e) {}
  }

  if (typeof createGameSession === 'function') {
    session = createGameSession({
      id: matchId || type + '_' + Date.now(),
      type,
      title: opts.title || type,
      mode: opts.mode || '1v1',
      context: {
        chat: opts.chat,
        overlayScope,
        source: launchSource,
        opponentUid,
        matchId,
        stake,
      },
      mount() {
        return overlay;
      },
      end(result) {
        if (onEnd) onEnd(result);
      },
      cleanup() {
        alive = false;
        runUserCleanup();
        session = null;
        if (typeof clearDangalLaunchCtx === 'function') clearDangalLaunchCtx();
      },
    });
    try {
      session.init();
    } catch (e) {
      console.error('[game] session init failed', type, e);
      alive = false;
      if (typeof showToast === 'function') showToast('Could not start game');
      return {
        alive: () => false,
        close() {},
        setOutcome,
        getOutcome: () => outcome,
        schedule,
        clearTimers,
        registerAnimFrame,
        clearAnimFrames,
      };
    }
  } else {
    const device = document.querySelector('.device');
    if (!device) {
      alive = false;
      if (typeof showToast === 'function') showToast('Game container not found');
      return {
        alive: () => false,
        close() {},
        setOutcome,
        getOutcome: () => outcome,
        schedule,
        clearTimers,
        registerAnimFrame,
        clearAnimFrames,
      };
    }
    if (overlay && !overlay.isConnected) device.appendChild(overlay);
  }

  try {
    if (overlay && typeof attachDangalPlayComm === 'function') {
      attachDangalPlayComm(overlay, { chat: opts.chat, matchId, opponentUid });
    }
  } catch (e) {}

  return {
    alive: () => alive,
    close,
    setOutcome,
    getOutcome: () => outcome,
    schedule,
    clearTimers,
    registerAnimFrame,
    clearAnimFrames,
  };
}
window.beginGameOverlaySession = beginGameOverlaySession;


/** DPR-aware canvas setup — uses shared helper when present, else local scale. */
function ensureGameCanvas(canvas, cssW, cssH) {
  if (typeof window.setupGameCanvas === 'function') {
    return window.setupGameCanvas(canvas, cssW, cssH);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, cssW || canvas.clientWidth || 300);
  const h = Math.max(1, cssH || canvas.clientHeight || 300);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: w, height: h, dpr };
}
window.ensureGameCanvas = ensureGameCanvas;

/** Chess lives in chess-ui.js (FIDE rules core, server-authoritative Live/Daily, bots, review). */
function openChessGame(chat) {
  if (window.ChessUI && typeof window.ChessUI.open === 'function') {
    window.ChessUI.open(chat);
    return;
  }
  if (typeof showToast === 'function') showToast('Chess couldn’t load — refresh and try again');
}
function startChessGame(chat) {
  openChessGame(chat);
}

// Snakes & Ladders lives in snakes-ui.js and Ludo in ludo-ui.js (Dangal P3 cores + party rooms).

// Oh No! moved to games/ohno-core.js + games/ohno-ui.js (Dangal P4).

// Shabd Five lives in games/shabd-core.js + games/shabd-ui.js (Dangal P5).

// openGamePicker is provided by game-registry.js

// --- Game registry self-registration (engines.js) ---
if (typeof registerGame === 'function') {
  registerGame({
    id: 'chess',
    name: 'Chess',
    desc: 'Bots, Live and Daily games',
    icon: '♟',
    ratingKey: 'chess',
    gameType: 'dual',
    liveDuel: true,
    genre: 'board',
    chat1v1: true,
    selfChat: true,
    order: 10,
    meta: {
      phaseA: 'Laws of Chess rules core (chess-core.js) — claims, auto draws, flag vs insufficient material, Chess960',
      phaseB: 'Server-authoritative Live + Daily (server-lib/chess-engine.js), bucket ratings',
      phaseC: 'Own engine in a Web Worker — 8 bot levels, review, coach, ECO names',
      complete: true,
    },
    launch(ctx) { openChessGame(typeof chatFromLaunch === 'function' ? chatFromLaunch(ctx) : ctx.chat); },
  });
}

window.startChessGame = startChessGame;
