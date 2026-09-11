/**
 * Shared game session runtime — lifecycle, overlay cleanup, analytics.
 *
 * Contract (Phase 1 foundation; games wrap via createGameSession in later phases):
 *   createGameSession({ id, type, title, mode, context, mount, init, render, onAction, end, cleanup })
 *   → { init(), render(), onAction(action), end(result), cleanup(), getElapsedMs() }
 *
 * Leave / return (Polish P0):
 *   resolveGameLaunchSource(ctx) → 'manch'|'chat'|…
 *   resolveGameOverlayScope(source) → scope id (never pin Manch games to chat)
 *   honorGameReturnTarget(ctx) → Manch vs chat after overlay remove
 *   leaveGameShell(shell, opts) → confirm once, Live forfeit once, markOver, close
 *   beginGameOverlaySession.schedule / registerAnimFrame — cancel in cleanup
 *
 * Analytics (via trackGameEvent):
 *   init  → game_started  { game_type, mode }
 *   end   → game_completed { game_type, mode, result, time_spent_ms }
 */
(function () {
  /** @type {Set<object>} */
  const activeSessions = new Set();

  /**
   * Normalize launch source for return-target + overlay scope.
   * Manch/Battlegrounds → manch; 1:1/group chat → chat.
   */
  function resolveGameLaunchSource(ctx) {
    const c = ctx || window.__dangalLaunchCtx || {};
    let s = String(c.source || c.dangalSource || '').trim().toLowerCase();
    if (!s && c.chat && (c.chat.firestoreId || c.chat.id) && String(c.chat.id) !== 'ai') {
      s = 'chat';
    }
    if (!s) {
      try {
        if (document.getElementById('activeChatScreen')) s = 'chat';
      } catch (e) {}
    }
    if (!s) s = 'manch';
    if (s === 'dangal' || s === 'gotd' || s === 'battlegrounds' || s === 'baithak') s = 'manch';
    if (s === 'group') s = 'chat';
    return s;
  }

  /** Overlay scope — Manch games must NOT register under chat (chat dismiss would yank them). */
  function resolveGameOverlayScope(source) {
    const s = String(source || resolveGameLaunchSource() || '').toLowerCase();
    if (s === 'chat' || s === 'challenge' || s === 'challenge_host' || s === 'self') {
      return typeof window.OVERLAY_SCOPE_CHAT !== 'undefined' ? window.OVERLAY_SCOPE_CHAT : 'chat';
    }
    return typeof window.OVERLAY_SCOPE_MANCH !== 'undefined' ? window.OVERLAY_SCOPE_MANCH : 'manch';
  }

  /**
   * After game overlay is removed, land on the correct prior surface.
   * Chat launches: leave chat alone (overlay gone). Manch: Dangal → Manch section.
   */
  function honorGameReturnTarget(ctx) {
    const c = ctx || window.__dangalLaunchCtx || {};
    const source = resolveGameLaunchSource(c);
    try {
      if (source === 'chat' || source === 'challenge' || source === 'challenge_host' || source === 'self') {
        return;
      }
      if (typeof switchTab === 'function') switchTab('dangal');
      if (typeof setDangalSection === 'function') {
        const section =
          source === 'khel' || source === 'maidan' || source === 'tarakki' ? source : 'manch';
        setDangalSection(section);
      }
    } catch (e) {}
  }

  /**
   * Detach Live handle without double-forfeit.
   * @param {object|null} handle
   * @param {{ forfeit?: boolean, alreadyOver?: boolean }} [opts]
   */
  function detachLiveHandle(handle, opts) {
    const o = opts || {};
    if (!handle) return;
    const doForfeit = !!o.forfeit && !o.alreadyOver;
    try {
      handle.leave({ forfeit: doForfeit });
    } catch (e) {
      try {
        handle.leave();
      } catch (e2) {}
    }
  }

  /**
   * Single leave contract for court/party shells (and similar).
   * Confirm → Live forfeit once → markOver → clear handle → close (cleanup never forfeits again).
   */
  async function leaveGameShell(shell, opts) {
    const o = opts || {};
    if (!shell) return false;
    const playing = o.isPlaying != null ? !!o.isPlaying : !shell.gameOver;
    const liveHandle = o.liveHandle != null ? o.liveHandle : shell.liveHandle;
    const live = !!(o.live || liveHandle);
    const title = o.title || 'Leave game?';
    const body = o.body || 'This practice run will end.';
    const forfeitBody =
      o.forfeitBody || 'Leaving now counts as a forfeit for your opponent.';
    const reason = o.reason || 'dismissed';

    const finishLeave = () => {
      try {
        if (typeof shell.markOver === 'function') shell.markOver();
      } catch (e) {}
      try {
        shell.liveHandle = null;
      } catch (e) {}
      try {
        shell.close(reason);
      } catch (e) {}
    };

    if (typeof DangalLive !== 'undefined' && DangalLive.requestLeave) {
      const ok = await DangalLive.requestLeave({
        live,
        liveHandle,
        isPlaying: playing,
        title,
        body,
        forfeitBody,
        onLeave: finishLeave,
      });
      return !!ok;
    }
    if (typeof confirmLeaveGame === 'function') {
      const leave = await confirmLeaveGame({
        title,
        body: live && playing ? forfeitBody : body,
      });
      if (!leave) return false;
    }
    if (liveHandle && playing) {
      detachLiveHandle(liveHandle, { forfeit: true, alreadyOver: !!shell.gameOver });
    } else if (liveHandle) {
      detachLiveHandle(liveHandle, { forfeit: false });
    }
    finishLeave();
    return true;
  }

  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {string} opts.type - analytics game_type
   * @param {string} [opts.title]
   * @param {string} [opts.mode] - e.g. 'solo', '1v1', 'group', 'dangal'
   * @param {object} [opts.context] - { chat, overlayScope, ... }
   * @param {() => HTMLElement} [opts.mount] - returns root element appended to .device
   * @param {() => void} [opts.init]
   * @param {() => void} [opts.render]
   * @param {(action: *) => void} [opts.onAction]
   * @param {(result: *) => void} [opts.end]
   * @param {() => void} [opts.cleanup]
   * @param {boolean} [opts.removeOnCleanup=true] - false for persistent app-owned overlays
   */
  function createGameSession(opts) {
    const config = opts || {};
    const sessionId = config.id || `game_${Date.now()}`;
    const gameType = config.type || sessionId;
    const mode = config.mode || 'unknown';
    const launchSource =
      (config.context && config.context.source) ||
      resolveGameLaunchSource(config.context);
    const scopeId =
      (config.context && config.context.overlayScope) ||
      resolveGameOverlayScope(launchSource) ||
      (typeof window.OVERLAY_SCOPE_CHAT !== 'undefined' ? window.OVERLAY_SCOPE_CHAT : 'chat');

    let startedAt = 0;
    let elapsedOffset = Math.max(0, Number(config.elapsedOffsetMs) || 0);
    let pausedAt = 0;
    let pausedAccum = 0;
    let ended = false;
    let cleaning = false;
    let cleaned = false;
    let rootEl = null;
    let unregisterOverlay = null;
    let dismissListener = null;
    const userCleanup = typeof config.cleanup === 'function' ? config.cleanup : null;
    const userEnd = typeof config.end === 'function' ? config.end : null;
    const returnCtx = Object.assign({}, config.context || {}, { source: launchSource });

    function getElapsedMs() {
      if (!startedAt) return elapsedOffset;
      const end = pausedAt || Date.now();
      return elapsedOffset + Math.max(0, end - startedAt - pausedAccum);
    }

    function pauseClock() {
      if (!startedAt || pausedAt || ended) return;
      pausedAt = Date.now();
    }

    function resumeClock() {
      if (!pausedAt) return;
      pausedAccum += Date.now() - pausedAt;
      pausedAt = 0;
    }

    function trackComplete(result) {
      if (typeof trackGameEvent === 'function') {
        trackGameEvent('game_completed', {
          game_type: gameType,
          mode,
          result: result != null ? String(result) : 'unknown',
          time_spent_ms: getElapsedMs(),
        });
      }
    }

    function runCleanup() {
      if (cleaning || cleaned) return;
      cleaning = true;
      function finish() {
        if (cleaned) return;
        cleaned = true;
        if (unregisterOverlay) {
          try {
            unregisterOverlay();
          } catch (e) {}
          unregisterOverlay = null;
        }
        if (rootEl && dismissListener) {
          try {
            rootEl.removeEventListener('chaupaal:dismiss', dismissListener);
          } catch (e) {}
          dismissListener = null;
        }
        if (config.removeOnCleanup !== false && rootEl && rootEl.isConnected) {
          try {
            rootEl.remove();
          } catch (e) {}
        }
        rootEl = null;
        if (userCleanup) {
          try {
            userCleanup();
          } catch (e) {
            console.warn('[game-runtime] cleanup error', e);
          }
        }
        if (typeof DSL !== 'undefined' && DSL.unmount) {
          try {
            DSL.unmount();
          } catch (e) {}
        }
        try {
          honorGameReturnTarget(returnCtx);
        } catch (e) {}
        activeSessions.delete(session);
        cleaning = false;
      }
      if (
        config.removeOnCleanup !== false &&
        rootEl &&
        rootEl.isConnected &&
        typeof animateGameExit === 'function'
      ) {
        const el = rootEl;
        animateGameExit(el, finish);
      } else {
        finish();
      }
    }

    const session = {
      id: sessionId,
      type: gameType,
      title: config.title || gameType,
      mode,
      context: config.context || {},

      init() {
        if (startedAt) return session;
        startedAt = Date.now();
        activeSessions.add(session);

        if (typeof config.mount === 'function') {
          rootEl = config.mount();
          const device = document.querySelector('.device');
          if (rootEl && device && !rootEl.isConnected) {
            device.appendChild(rootEl);
          }
          if (rootEl && typeof prepareGameOverlay === 'function') {
            prepareGameOverlay(rootEl, {
              theme: config.theme || (rootEl.classList.contains('game-overlay--light') ? 'light' : 'dark'),
              gameId: config.gameId || gameType,
            });
          } else if (rootEl && rootEl.classList) {
            rootEl.classList.add('game-overlay', 'game-overlay--ready');
          }
          if (rootEl && typeof applyGameIdentity === 'function') {
            applyGameIdentity(config.gameId || gameType, rootEl);
          }
          if (rootEl && typeof DSL !== 'undefined' && DSL.mount) {
            DSL.mount(rootEl, { gameType: config.gameId || gameType });
          }
          if (rootEl && typeof registerScopedOverlay === 'function') {
            unregisterOverlay = registerScopedOverlay(scopeId, rootEl, () => {
              if (!ended) session.end('dismissed');
              else runCleanup();
            });
            dismissListener = () => {
              if (!ended) session.end('dismissed');
            };
            rootEl.addEventListener('chaupaal:dismiss', dismissListener, { once: true });
          }
        }

        if (typeof trackGameEvent === 'function') {
          trackGameEvent('game_started', { game_type: gameType, mode });
        }

        if (typeof config.init === 'function') {
          try {
            config.init();
          } catch (e) {
            console.error('[game-runtime] init error', e);
            session.end('error');
            throw e;
          }
        }

        if (typeof config.render === 'function') {
          try {
            config.render();
          } catch (e) {
            console.error('[game-runtime] render error', e);
          }
        }

        return session;
      },

      render() {
        if (typeof config.render === 'function') {
          config.render();
        }
        return session;
      },

      onAction(action) {
        if (typeof config.onAction === 'function') {
          config.onAction(action);
        }
        return session;
      },

      end(result) {
        if (ended) return session;
        ended = true;
        trackComplete(result);
        if (userEnd) {
          try {
            userEnd(result);
          } catch (e) {
            console.warn('[game-runtime] end hook error', e);
          }
        }
        const skipReport =
          !!config.skipEconomyReport ||
          (!normalizeDangalResult
            ? result === 'dismissed' || result === 'aborted' || result === 'error'
            : !normalizeDangalResult(result));
        if (!skipReport && window.DangalEconomy && typeof DangalEconomy.reportGameEnd === 'function') {
          try {
            DangalEconomy.reportGameEnd({
              gameType,
              result,
              sessionId: config.context?.matchId || sessionId,
              matchId: config.context?.matchId || sessionId,
              opponentUid: config.context?.opponentUid || config.opponentUid || '',
              stake: Number(config.context?.stake || config.stake) || 0,
              winnerUid: config.context?.winnerUid || '',
            });
          } catch (e) {}
        }
        runCleanup();
        return session;
      },

      cleanup() {
        if (!ended) trackComplete('aborted');
        ended = true;
        runCleanup();
        return session;
      },

      getElapsedMs,
      pauseClock,
      resumeClock,
      getRoot() {
        return rootEl;
      },
    };

    return session;
  }

  window.createGameSession = createGameSession;
  window.resolveGameLaunchSource = resolveGameLaunchSource;
  window.resolveGameOverlayScope = resolveGameOverlayScope;
  window.honorGameReturnTarget = honorGameReturnTarget;
  window.detachLiveHandle = detachLiveHandle;
  window.leaveGameShell = leaveGameShell;
})();
