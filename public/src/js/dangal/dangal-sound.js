/**
 * Dangal sound router — Web Audio via SoundLib (no missing-file 404s).
 */
(function () {
  'use strict';

  const TOKEN_MAP = {
    'ui.click': 'tap',
    'ui.tap': 'tap',
    'ui.move': 'move',
    'ui.place': 'place',
    'ui.win': 'cheer',
    'ui.lose': 'wrongTone',
    'ui.draw': 'sectionComplete',
    'ui.achieve': 'milestone',
    'ui.dice': 'dice',
    'ui.stone': 'stone',
    'ui.capture': 'capture',
    'ui.card': 'card',
    'ui.clock': 'clock',
    'ui.check': 'check',
    'ui.coin': 'coin',
    'ui.jump': 'jump',
    'ui.crash': 'crash',
    'ui.kick': 'kick',
    'ui.bat': 'bat',
    'ui.turn': 'notification',
    'ui.invalid': 'error',
  };

  let enabled = true;

  function allowed() {
    if (!enabled) return false;
    if (typeof quietMode !== 'undefined' && quietMode) return false;
    return true;
  }

  function play(token) {
    if (!allowed()) return;
    const key = String(token || '');
    const name = TOKEN_MAP[key] || key.replace(/^ui\./, '') || key;
    try {
      if (typeof SoundLib !== 'undefined' && typeof SoundLib.play === 'function') {
        SoundLib.play(name);
      }
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
