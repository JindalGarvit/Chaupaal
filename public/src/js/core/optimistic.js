/**
 * Optimistic UI helper — apply locally first, commit async, silent rollback on failure.
 */
(function () {
  'use strict';

  /**
   * @param {object} opts
   * @param {() => void} opts.apply - mutate UI/state immediately
   * @param {() => void} opts.revert - undo apply on failure
   * @param {() => Promise<*>|*} [opts.commit] - network / rate-limit / persist
   * @param {(err: *) => void} [opts.onError]
   * @param {string} [opts.errorToast]
   */
  async function runOptimistic(opts) {
    const o = opts || {};
    if (typeof o.apply === 'function') o.apply();
    try {
      if (typeof o.commit === 'function') await o.commit();
      return true;
    } catch (err) {
      try {
        if (typeof o.revert === 'function') o.revert();
      } catch (e) {}
      if (typeof o.onError === 'function') {
        try {
          o.onError(err);
        } catch (e) {}
      } else if (typeof showToast === 'function') {
        showToast(o.errorToast || (err && err.message) || 'Couldn’t complete — undone');
      }
      return false;
    }
  }

  /**
   * Rate-limit gate that throws so runOptimistic can revert.
   * @param {string} action
   */
  async function assertRateLimit(action) {
    if (typeof checkRateLimit !== 'function') return true;
    const rl = await checkRateLimit(action);
    if (!rl || !rl.ok) {
      const err = new Error((rl && rl.message) || 'Slow down');
      err.code = 'rate_limit';
      throw err;
    }
    return true;
  }

  window.runOptimistic = runOptimistic;
  window.assertRateLimit = assertRateLimit;
})();
