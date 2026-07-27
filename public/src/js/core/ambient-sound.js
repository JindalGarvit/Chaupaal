/**
 * Ambient sound layer for sensory theming.
 * Separate AudioContext pads (not the music shared element) — gated by:
 *   - ambient_sound feature flag
 *   - user Settings toggle (off by default)
 *   - quiet mode (kills ambient + respects SoundLib quiet)
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
      if (typeof quietMode !== 'undefined' && quietMode) return true;
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

  /** Soft filtered noise / drone pad keyed by soundKey — richer but still quiet. */
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

    // Soft shimmer (second sine, very quiet)
    const osc2 = c.createOscillator();
    osc2.type = 'sine';
    const osc2Gain = c.createGain();
    osc2Gain.gain.value = 0.012;

    // High air layer for rain/snow
    const airFilter = c.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.Q.value = 0.6;
    const airGain = c.createGain();
    airGain.gain.value = 0;

    if (soundKey === 'rain_soft') {
      filter.frequency.value = 1600;
      osc.frequency.value = 98;
      oscGain.gain.value = 0.01;
      osc2.frequency.value = 196;
      osc2Gain.gain.value = 0.006;
      airFilter.frequency.value = 2800;
      airGain.gain.value = 0.045;
    } else if (soundKey === 'snow_soft') {
      filter.frequency.value = 900;
      osc.frequency.value = 82;
      oscGain.gain.value = 0.012;
      osc2.frequency.value = 164;
      osc2Gain.gain.value = 0.008;
      airFilter.frequency.value = 4200;
      airFilter.Q.value = 0.4;
      airGain.gain.value = 0.028;
    } else if (soundKey === 'night_quiet') {
      filter.frequency.value = 380;
      osc.frequency.value = 73;
      oscGain.gain.value = 0.028;
      osc2.frequency.value = 110;
      osc2Gain.gain.value = 0.01;
      airGain.gain.value = 0.008;
      airFilter.frequency.value = 600;
    } else if (soundKey === 'golden_hour_wind') {
      filter.frequency.value = 780;
      osc.frequency.value = 131;
      oscGain.gain.value = 0.022;
      osc2.frequency.value = 196;
      osc2Gain.gain.value = 0.014;
      airFilter.frequency.value = 1100;
      airGain.gain.value = 0.02;
    } else {
      // day_ambient — soft open-air pad
      filter.frequency.value = 1000;
      osc.frequency.value = 164;
      oscGain.gain.value = 0.018;
      osc2.frequency.value = 246;
      osc2Gain.gain.value = 0.01;
      airFilter.frequency.value = 1800;
      airGain.gain.value = 0.015;
    }

    src.connect(filter);
    filter.connect(gain);
    // Parallel air layer from the same noise
    src.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(gain);

    osc.connect(oscGain);
    oscGain.connect(gain);
    osc2.connect(osc2Gain);
    osc2Gain.connect(gain);
    try {
      src.start();
      osc.start();
      osc2.start();
    } catch (e) {}

    return {
      key: soundKey,
      gain,
      stop() {
        try {
          src.stop();
          osc.stop();
          osc2.stop();
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
    if (quietOn()) return false;
    if (!window.ChaupaalTheme?.isAmbientFlagEnabled?.()) return false;
    if (!window.ChaupaalTheme?.isAmbientUserOn?.()) return false;
    if (!window.ChaupaalTheme?.isSensoryEnabled?.()) return false;
    if (window.ChaupaalTheme.getDisplayMode?.() !== 'auto') return false;
    if (isMediaOrCallActive()) return false;
    if (needsGesture() && !unlocked) return false;
    return true;
  }

  function sync(state) {
    if (quietOn()) {
      hardStop(180);
      return;
    }
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
    // Pleasant but not nagging — stay under UI cues
    const vol = Math.min(0.14, Number(s.soundVolume) || 0.12);
    fadeTo(master, vol, 700);
    if (padA) fadeTo(padA.gain, padB ? 1 - blend : 1, 900);
    if (padB) fadeTo(padB.gain, blend, 900);
  }

  function hardStop(ms) {
    fadeTo(master, 0, ms || 200);
    try {
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    } catch (e) {}
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
    if (quietOn()) return;
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
    hardStop,
    unlockFromGesture,
    startWatch,
    isMediaOrCallActive,
    quietOn,
  };

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
