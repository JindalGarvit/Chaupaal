/**
 * Haptic stub — uses existing haptic() when present; respects Quiet / reduced-motion.
 */
(function () {
  'use strict';

  let enabled = true;

  function allowed() {
    if (!enabled) return false;
    if (typeof quietMode !== 'undefined' && quietMode) return false;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    } catch (e) {}
    return true;
  }

  function fire(kind) {
    if (!allowed()) return;
    if (typeof haptic === 'function') haptic(kind === 'heavy' ? 'heavy' : kind === 'medium' ? 'medium' : 'light');
  }

  window.Haptic = {
    tap: () => fire('light'),
    light: () => fire('light'),
    medium: () => fire('medium'),
    heavy: () => fire('heavy'),
    achieve: () => fire('medium'),
    win: () => fire('heavy'),
    setHapticEnabled(on) {
      enabled = !!on;
    },
    isHapticEnabled() {
      return enabled;
    },
  };
})();
