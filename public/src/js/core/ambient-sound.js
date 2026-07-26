/**
 * Ambient sound layer for sensory theming.
 * Separate AudioContext pads (not the music shared element) — gated by:
 *   - ambient_sound feature flag
 *   - user Settings toggle (off by default)
 *   - quiet mode
 *   - media-player / Mehfil active audio
 *   - needsAudioGesture() unlock on first enable
 */
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let padA = null;
  let padB = null;
  let unlocked = false;
  let watchTimer = null;
  let lastKeys = '';

  function needsGesture() {
    try {
      return !!(window.ChaupaalEnv && ChaupaalEnv.needsAudioGesture && ChaupaalEnv.needsAudioGesture());
    } catch (e) {
      return /Mobi|Android|iPhone/i.test(navigator.userAgent || '');
    }
  }

  function quietOn() {
    try {
      return !!document.getElementById('toggleQuiet')?.checked || localStorage.getItem('chaupaal_quiet') === '1';
    } catch {
      return false;
    }
  }

  function isMediaOrCallActive() {
    try {
      const shared = window.__chaupaalSharedAudio;
      if (shared && !shared.paused && shared.currentSrc) return true;
    } catch (e) {}
    try {
      const mehfil = window.__mehfilSharedAudio;
      if (mehfil && !mehfil.paused) return true;
    } catch (e) {}
    if (document.getElementById('mehfilOverlay')) return true;
    if (document.querySelector('.music-card.is-playing')) return true;
    return false;
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    return ctx;
  }

  /** Soft filtered noise / drone pad keyed by soundKey — no binary assets required for v1. */
  function makePad(soundKey) {
    const c = ensureCtx();
    if (!c) return null;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(master);

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;

    // Brown-ish noise buffer
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const osc = c.createOscillator();
    osc.type = 'sine';
    const oscGain = c.createGain();
    oscGain.gain.value = 0.04;

    // Timbre by key
    if (soundKey === 'rain_soft') {
      filter.frequency.value = 1200;
      osc.frequency.value = 110;
      oscGain.gain.value = 0.015;
    } else if (soundKey === 'night_quiet') {
      filter.frequency.value = 400;
      osc.frequency.value = 98;
      oscGain.gain.value = 0.03;
    } else if (soundKey === 'golden_hour_wind') {
      filter.frequency.value = 800;
      osc.frequency.value = 146;
      oscGain.gain.value = 0.025;
    } else {
      // day_ambient
      filter.frequency.value = 900;
      osc.frequency.value = 174;
      oscGain.gain.value = 0.02;
    }

    src.connect(filter);
    filter.connect(gain);
    osc.connect(oscGain);
    oscGain.connect(gain);
    try {
      src.start();
      osc.start();
    } catch (e) {}

    return {
      key: soundKey,
      gain,
      stop() {
        try {
          src.stop();
          osc.stop();
        } catch (e) {}
        try {
          gain.disconnect();
        } catch (e) {}
      },
    };
  }

  function fadeTo(gainNode, value, ms) {
    if (!ctx || !gainNode) return;
    const t = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(gainNode.gain.value, t);
    gainNode.gain.linearRampToValueAtTime(value, t + ms / 1000);
  }

  function unlockFromGesture() {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    unlocked = true;
  }

  function shouldPlay() {
    if (!window.ChaupaalTheme?.isAmbientFlagEnabled?.()) return false;
    if (!window.ChaupaalTheme?.isAmbientUserOn?.()) return false;
    if (!window.ChaupaalTheme?.isSensoryEnabled?.()) return false;
    if (window.ChaupaalTheme.getDisplayMode?.() !== 'auto') return false;
    if (quietOn()) return false;
    if (isMediaOrCallActive()) return false;
    if (needsGesture() && !unlocked) return false;
    return true;
  }

  function sync(state) {
    const s = state || window.ChaupaalTheme?.getState?.();
    if (!shouldPlay() || !s?.soundKey) {
      fadeTo(master, 0, 400);
      return;
    }
    ensureCtx();
    if (ctx?.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const keyA = s.soundKeyA || s.soundKey;
    const keyB = s.soundKeyB || s.soundKey;
    const blend = typeof s.soundBlend === 'number' ? s.soundBlend : 0;
    const sig = keyA + '|' + keyB;
    if (sig !== lastKeys) {
      try {
        padA?.stop();
        padB?.stop();
      } catch (e) {}
      padA = makePad(keyA);
      padB = keyB !== keyA ? makePad(keyB) : null;
      lastKeys = sig;
    }
    const vol = Math.min(0.22, Number(s.soundVolume) || 0.16);
    fadeTo(master, vol, 600);
    if (padA) fadeTo(padA.gain, padB ? 1 - blend : 1, 800);
    if (padB) fadeTo(padB.gain, blend, 800);
  }

  function startWatch() {
    if (watchTimer) return;
    watchTimer = setInterval(() => sync(), 1500);
    document.addEventListener(
      'play',
      (e) => {
        if (e.target?.tagName === 'AUDIO' || e.target?.tagName === 'VIDEO') sync();
      },
      true
    );
    document.addEventListener(
      'pause',
      (e) => {
        if (e.target?.tagName === 'AUDIO' || e.target?.tagName === 'VIDEO') setTimeout(() => sync(), 200);
      },
      true
    );
  }

  function enableFromUserGesture() {
    unlockFromGesture();
    if (window.ChaupaalTheme) ChaupaalTheme.setAmbientUserOn(true);
    startWatch();
    sync();
  }

  function disable() {
    if (window.ChaupaalTheme) ChaupaalTheme.setAmbientUserOn(false);
    fadeTo(master, 0, 300);
  }

  window.ChaupaalAmbient = {
    sync,
    enableFromUserGesture,
    disable,
    unlockFromGesture,
    startWatch,
    isMediaOrCallActive,
  };

  // Hook pauseAllMusic so ambient resumes after music stops
  document.addEventListener('DOMContentLoaded', () => {
    startWatch();
    const orig = window.pauseAllMusic;
    if (typeof orig === 'function' && !orig._ambientWrapped) {
      window.pauseAllMusic = function () {
        const r = orig.apply(this, arguments);
        setTimeout(() => sync(), 300);
        return r;
      };
      window.pauseAllMusic._ambientWrapped = true;
    }
  });
})();
