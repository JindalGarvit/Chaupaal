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

  /** Stadium bed: looped soft noise through a band-pass, breathing slowly. */
  function playCrowd() {
    if (!allowed()) return stopAmbient();
    if (amb && amb.kind === 'crowd') return;
    stopAmbient();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.96 + (Math.random() * 2 - 1) * 0.04;
        data[i] = last * 6;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 700;
      band.Q.value = 0.6;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.12;
      lfoGain.gain.value = PAD_GAIN * 0.5;
      lfo.connect(lfoGain).connect(master.gain);
      src.connect(band).connect(master);
      src.start();
      lfo.start();
      master.gain.setTargetAtTime(PAD_GAIN * 1.4, ctx.currentTime, 1.2);
      amb = { kind: 'crowd', ctx, master, oscs: [src, lfo] };
    } catch (e) {
      amb = null;
    }
  }

  /** Short crowd swell over the bed (goal / big save); no-op when the bed isn't playing. */
  function crowdSwell(strength) {
    if (!amb || amb.kind !== 'crowd' || !allowed()) return;
    try {
      const t = amb.ctx.currentTime;
      const peak = PAD_GAIN * (2 + 5 * Math.max(0, Math.min(1, Number(strength) || 0.6)));
      amb.master.gain.cancelScheduledValues(t);
      amb.master.gain.setTargetAtTime(peak, t, 0.08);
      amb.master.gain.setTargetAtTime(PAD_GAIN * 1.4, t + 0.9, 0.7);
    } catch (e) {}
  }

  function playAmbient(kind) {
    if (kind === 'crowd') return playCrowd();
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
    crowdSwell,
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
