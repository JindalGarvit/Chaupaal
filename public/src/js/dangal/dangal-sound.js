/**
 * Sound stub — registry ready; missing files fail silently.
 */
(function () {
  'use strict';

  const cache = new Map();
  let enabled = true;

  function play(token) {
    if (!enabled || typeof quietMode !== 'undefined' && quietMode) return;
    try {
      if (typeof SoundLib !== 'undefined' && SoundLib.click && String(token || '').indexOf('ui.') === 0) {
        SoundLib.click();
      }
    } catch (e) {}
    const src = '/assets/sounds/' + String(token || '').replace(/[^\w.-]/g, '_') + '.mp3';
    try {
      let a = cache.get(src);
      if (!a) {
        a = new Audio(src);
        a.preload = 'none';
        cache.set(src, a);
      }
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch (e) {}
  }

  window.Sound = {
    play,
    playVaried(token) {
      play(token);
    },
    playAmbient() {},
    stopAmbient() {},
    duckAmbient() {},
    preloadGame() {},
    setEnabled(on) {
      enabled = !!on;
    },
    isEnabled() {
      return enabled;
    },
  };
})();
