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

  // Gentle synthesized pads (no audio files): 'night' = low hum, 'day' = soft bright chord.
  const PADS = { night: [98, 147, 196], day: [262, 330, 392] };
  const PAD_GAIN = 0.018;
  let amb = null;

  function stopAmbient() {
    if (!amb) return;
    const a = amb;
    amb = null;
    try {
      const t = a.ctx.currentTime;
      a.master.gain.cancelScheduledValues(t);
      a.master.gain.setTargetAtTime(0, t, 0.4);
      setTimeout(() => {
        a.oscs.forEach((o) => {
          try {
            o.stop();
          } catch (e) {}
        });
        a.ctx.close().catch(() => {});
      }, 1600);
    } catch (e) {}
  }

  function playAmbient(kind) {
    const notes = PADS[kind];
    if (!notes || !allowed()) return stopAmbient();
    if (amb && amb.kind === kind) return;
    stopAmbient();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.08;
      lfoGain.gain.value = PAD_GAIN * 0.4;
      lfo.connect(lfoGain).connect(master.gain);
      const oscs = [lfo];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = kind === 'night' ? 'sine' : 'triangle';
        o.frequency.value = f;
        o.detune.value = (i - 1) * 4;
        g.gain.value = 1 / notes.length;
        o.connect(g).connect(master);
        o.start();
        oscs.push(o);
      });
      lfo.start();
      master.gain.setTargetAtTime(PAD_GAIN, ctx.currentTime, 1.2);
      amb = { kind, ctx, master, oscs };
    } catch (e) {
      amb = null;
    }
  }

  window.Sound = {
    play,
    playVaried(token) {
      play(token);
    },
    playAmbient,
    stopAmbient,
    duckAmbient() {},
    preloadGame() {},
    setEnabled(on) {
      enabled = !!on;
      if (!enabled) stopAmbient();
    },
    isEnabled() {
      return enabled;
    },
  };
})();
