/**
 * Shared game session runtime — lifecycle, overlay cleanup, analytics.
 *
 * Contract (Phase 1 foundation; games wrap via createGameSession in later phases):
 *   createGameSession({ id, type, title, mode, context, mount, init, render, onAction, end, cleanup })
 *   → { init(), render(), onAction(action), end(result), cleanup(), getElapsedMs() }
 *
 * Analytics (via trackGameEvent):
 *   init  → game_started  { game_type, mode }
 *   end   → game_completed { game_type, mode, result, time_spent_ms }
 */
(function () {
  /** @type {Set<object>} */
  const activeSessions = new Set();

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
    const scopeId =
      config.context?.overlayScope ||
      (typeof window.OVERLAY_SCOPE_CHAT !== 'undefined' ? window.OVERLAY_SCOPE_CHAT : 'chat');

    let startedAt = 0;
    let ended = false;
    let cleaning = false;
    let cleaned = false;
    let rootEl = null;
    let unregisterOverlay = null;
    let dismissListener = null;
    const userCleanup = typeof config.cleanup === 'function' ? config.cleanup : null;
    const userEnd = typeof config.end === 'function' ? config.end : null;

    function getElapsedMs() {
      if (!startedAt) return 0;
      return Date.now() - startedAt;
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
            });
          } else if (rootEl && rootEl.classList) {
            rootEl.classList.add('game-overlay', 'game-overlay--ready');
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
      getRoot() {
        return rootEl;
      },
    };

    return session;
  }

  window.createGameSession = createGameSession;
})();
