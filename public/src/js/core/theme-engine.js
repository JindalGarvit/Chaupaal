/**
 * Chaupaal sensory theme engine (Phase 1).
 * Continuous interpolation between the 6 named anchors — not a new discrete mode per hour.
 *
 * Flags:
 *   sensory_theme  → SENSORY_THEME_ENABLED (visual continuous engine)
 *   ambient_sound  → AMBIENT_SOUND_ENABLED (independent kill switch)
 *
 * When sensory_theme is off, callers use discrete applyTheme() in theme.js (unchanged UX).
 */
(function () {
  'use strict';

  const STORAGE_MODE = 'chaupaal_display_mode';
  const STORAGE_AMBIENT = 'chaupaal_ambient_sound';
  const STORAGE_GEO = 'chaupaal_theme_geo_consent';
  const RECOMPUTE_MS = 20 * 60_000; // Phase 7: coarser auto blend (~20 min)

  /** @typedef {'clearDay'|'overcast'|'rainy'|'goldenHour'|'dawn'|'night'} AnchorKey */

  /**
   * Anchor points — same 6 states as THEME_REGISTRY, plus continuous sensory fields.
   * soundKey is nearest-anchor for crossfade; real loop URLs optional later.
   */
  const ANCHORS = {
    clearDay: {
      lightTemp: 0.35,
      brightness: 0.92,
      precipitation: 0,
      cloudCover: 0.1,
      motionIntensity: 0.35,
      soundKey: 'day_ambient',
      metaThemeColor: '#F7F1E8',
      vars: {
        '--cream': '#F7F1E8',
        '--white': '#FFFcf7',
        '--ink': '#2B2730',
        '--muted': '#7A7480',
        '--line': '#E8DFD4',
      },
    },
    overcast: {
      lightTemp: 0.28,
      brightness: 0.78,
      precipitation: 0.05,
      cloudCover: 0.75,
      motionIntensity: 0.25,
      soundKey: 'day_ambient',
      metaThemeColor: '#E8EEF2',
      vars: {
        '--cream': '#E8EEF2',
        '--white': '#F5F7FA',
        '--ink': '#243040',
        '--muted': '#6B7785',
        '--line': '#D5DCE3',
      },
    },
    rainy: {
      lightTemp: 0.22,
      brightness: 0.7,
      precipitation: 0.85,
      cloudCover: 0.9,
      motionIntensity: 0.55,
      soundKey: 'rain_soft',
      metaThemeColor: '#D9E4EC',
      vars: {
        '--cream': '#D9E4EC',
        '--white': '#EEF3F7',
        '--ink': '#1E2A36',
        '--muted': '#5E6D7A',
        '--line': '#C5D0D9',
      },
    },
    goldenHour: {
      lightTemp: 0.85,
      brightness: 0.8,
      precipitation: 0,
      cloudCover: 0.2,
      motionIntensity: 0.4,
      soundKey: 'golden_hour_wind',
      metaThemeColor: '#F5E0C8',
      vars: {
        '--cream': '#F5E0C8',
        '--white': '#FFF6EB',
        '--ink': '#3A2A1F',
        '--muted': '#8A6E55',
        '--line': '#E8D2B8',
      },
    },
    dawn: {
      lightTemp: 0.7,
      brightness: 0.75,
      precipitation: 0,
      cloudCover: 0.25,
      motionIntensity: 0.3,
      soundKey: 'day_ambient',
      metaThemeColor: '#F5E6D3',
      vars: {
        '--cream': '#F5E6D3',
        '--white': '#FFF9F2',
        '--ink': '#3A2F28',
        '--muted': '#8A7A6C',
        '--line': '#E8D9C8',
      },
    },
    night: {
      lightTemp: 0.15,
      brightness: 0.35,
      precipitation: 0,
      cloudCover: 0.3,
      motionIntensity: 0.15,
      soundKey: 'night_quiet',
      metaThemeColor: '#0F1117',
      vars: {
        '--cream': '#161A24',
        '--white': '#1B2030',
        '--ink': '#F2F0F5',
        '--muted': '#A8A0B0',
        '--line': '#2A3145',
      },
    },
  };

  /** Manual presets — fixed ThemeState writers (same CSS contract as Auto). */
  const PRESETS = {
    light: {
      isDay: true,
      lightTemp: 0.32,
      brightness: 0.97,
      precipitation: 0,
      cloudCover: 0,
      motionIntensity: 0.15,
      soundKey: null,
      soundVolume: 0,
      anchor: 'clearDay',
      vars: {
        ...ANCHORS.clearDay.vars,
        '--bg': '#F7F5F2',
        '--cream': '#F7F5F2',
        '--white': '#FFFEFB',
        '--ink': '#141218',
        '--muted': '#3a3640',
        '--line': 'rgba(20,18,24,0.1)',
        '--red': '#d62839',
      },
      metaThemeColor: '#F7F5F2',
    },
    dark: {
      // Neutral dark UI preference (cooler than Night)
      isDay: false,
      lightTemp: 0.12,
      brightness: 0.42,
      precipitation: 0,
      cloudCover: 0,
      motionIntensity: 0.12,
      soundKey: null,
      soundVolume: 0,
      anchor: 'night',
      vars: {
        '--cream': '#12141C',
        '--white': '#1A1D27',
        '--ink': '#F2F0F5',
        '--muted': '#9AA0B0',
        '--line': '#2A2F3D',
      },
      metaThemeColor: '#0B0D14',
    },
    night: {
      // Dim + warm — late-night reading
      isDay: false,
      lightTemp: 0.55,
      brightness: 0.28,
      precipitation: 0,
      cloudCover: 0,
      motionIntensity: 0.08,
      soundKey: 'night_quiet',
      soundVolume: 0,
      anchor: 'night',
      vars: {
        '--cream': '#1A1410',
        '--white': '#241C16',
        '--ink': '#F5EDE4',
        '--muted': '#B0A090',
        '--line': '#3A2E24',
      },
      metaThemeColor: '#140F0C',
    },
  };

  let state = null;
  let weatherCtx = { bucket: null, cloudCover: null, precipitation: null, sunrise: null, sunset: null };
  let sensoryEnabled = false;
  let ambientFlagEnabled = false;
  let started = false;
  let timer = null;
  /** @type {Set<Function>} */
  const listeners = new Set();
  let lastWriteAt = 0;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp01(n) {
    return Math.max(0, Math.min(1, Number(n) || 0));
  }

  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  function rgbToHex({ r, g, b }) {
    const c = (n) => Math.round(clamp01(n / 255) * 255).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
  }

  function mixHex(a, b, t) {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    return rgbToHex({
      r: lerp(A.r, B.r, t),
      g: lerp(A.g, B.g, t),
      b: lerp(A.b, B.b, t),
    });
  }

  function mixVars(va, vb, t) {
    const out = {};
    const keys = new Set([...Object.keys(va || {}), ...Object.keys(vb || {})]);
    keys.forEach((k) => {
      out[k] = mixHex(va[k] || '#000000', vb[k] || '#000000', t);
    });
    return out;
  }

  function mixAnchor(aKey, bKey, t) {
    const A = ANCHORS[aKey] || ANCHORS.clearDay;
    const B = ANCHORS[bKey] || ANCHORS.clearDay;
    const tt = clamp01(t);
    return {
      lightTemp: lerp(A.lightTemp, B.lightTemp, tt),
      brightness: lerp(A.brightness, B.brightness, tt),
      precipitation: lerp(A.precipitation, B.precipitation, tt),
      cloudCover: lerp(A.cloudCover, B.cloudCover, tt),
      motionIntensity: lerp(A.motionIntensity, B.motionIntensity, tt),
      soundKey: tt < 0.5 ? A.soundKey : B.soundKey,
      soundKeyA: A.soundKey,
      soundKeyB: B.soundKey,
      soundBlend: tt,
      vars: mixVars(A.vars, B.vars, tt),
      metaThemeColor: mixHex(A.metaThemeColor, B.metaThemeColor, tt),
      anchor: tt < 0.5 ? aKey : bKey,
    };
  }

  function parseSunMs(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }

  /**
   * Time-of-day pair + blend using sunrise/sunset when available,
   * else fixed local clock windows (still continuous — no hard cut).
   */
  function timeBlend(now = new Date()) {
    const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const sunrise = parseSunMs(weatherCtx.sunrise);
    const sunset = parseSunMs(weatherCtx.sunset);
    const nowMs = now.getTime();

    if (sunrise && sunset) {
      const dawnWin = 45 * 60 * 1000;
      const goldWin = 50 * 60 * 1000;
      // Night → dawn around sunrise
      if (nowMs < sunrise - dawnWin) return { a: 'night', b: 'night', t: 0 };
      if (nowMs < sunrise + dawnWin) {
        const t = clamp01((nowMs - (sunrise - dawnWin)) / (2 * dawnWin));
        if (t < 0.5) return { a: 'night', b: 'dawn', t: t * 2 };
        return { a: 'dawn', b: 'clearDay', t: (t - 0.5) * 2 };
      }
      // Day
      if (nowMs < sunset - goldWin) return { a: 'clearDay', b: 'clearDay', t: 0 };
      // Golden hour → night around sunset
      if (nowMs < sunset + goldWin) {
        const t = clamp01((nowMs - (sunset - goldWin)) / (2 * goldWin));
        if (t < 0.45) return { a: 'clearDay', b: 'goldenHour', t: t / 0.45 };
        return { a: 'goldenHour', b: 'night', t: (t - 0.45) / 0.55 };
      }
      return { a: 'night', b: 'night', t: 0 };
    }

    // Clock-only schedule (continuous segments)
    const pts = [
      [0, 'night'],
      [5, 'night'],
      [6.5, 'dawn'],
      [8, 'clearDay'],
      [16.5, 'clearDay'],
      [18, 'goldenHour'],
      [19.5, 'goldenHour'],
      [21, 'night'],
      [24, 'night'],
    ];
    for (let i = 0; i < pts.length - 1; i++) {
      const [h0, k0] = pts[i];
      const [h1, k1] = pts[i + 1];
      if (h >= h0 && h <= h1) {
        const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0);
        return { a: k0, b: k1, t };
      }
    }
    return { a: 'night', b: 'night', t: 0 };
  }

  function weatherBlend(base) {
    let out = { ...base, vars: { ...base.vars } };
    const bucket = weatherCtx.bucket;
    const precip =
      weatherCtx.precipitation != null
        ? clamp01(weatherCtx.precipitation)
        : bucket === 'storm'
          ? 1
          : bucket === 'rain'
            ? 0.7
            : bucket === 'snow'
              ? 0.55
              : 0;
    const cloud =
      weatherCtx.cloudCover != null
        ? clamp01(weatherCtx.cloudCover / 100)
        : bucket === 'overcast' || bucket === 'fog'
          ? 0.85
          : bucket === 'partly_cloudy'
            ? 0.45
            : bucket === 'rain' || bucket === 'storm' || bucket === 'snow'
              ? 0.9
              : 0.15;

    // Keep weather influence gentle so UI text stays primary
    const weatherMix = 0.18; // Phase 7: narrower weather blend

    if (precip > 0.05 || bucket === 'snow') {
      const rainy = mixAnchor(out.anchor, 'rainy', clamp01(precip) * weatherMix);
      const snowy = bucket === 'snow';
      out = {
        ...rainy,
        lightTemp: lerp(out.lightTemp, rainy.lightTemp, precip * weatherMix),
        brightness: lerp(out.brightness, rainy.brightness, precip * weatherMix),
        precipitation: Math.max(out.precipitation, precip),
        cloudCover: Math.max(out.cloudCover, cloud),
        motionIntensity: lerp(out.motionIntensity, rainy.motionIntensity, precip * 0.5),
        vars: mixVars(out.vars, ANCHORS.rainy.vars, precip * weatherMix),
        soundKey: snowy ? 'snow_soft' : precip > 0.28 ? 'rain_soft' : out.soundKey,
        soundKeyA: out.soundKeyA || out.soundKey,
        soundKeyB: snowy ? 'snow_soft' : 'rain_soft',
        soundBlend: precip,
        anchor: precip > 0.65 ? 'rainy' : out.anchor,
        weatherBucket: bucket || (snowy ? 'snow' : 'rain'),
      };
    } else if (cloud > 0.4) {
      const over = mixAnchor(out.anchor === 'night' ? 'night' : out.anchor, 'overcast', (cloud - 0.4) / 0.6);
      out = {
        ...out,
        lightTemp: lerp(out.lightTemp, over.lightTemp, 0.28),
        brightness: lerp(out.brightness, over.brightness, 0.32),
        cloudCover: cloud,
        vars: mixVars(out.vars, ANCHORS.overcast.vars, ((cloud - 0.4) / 0.6) * 0.4),
        anchor: cloud > 0.85 && out.anchor === 'clearDay' ? 'overcast' : out.anchor,
        weatherBucket: bucket || 'overcast',
      };
    } else {
      out.cloudCover = cloud;
      out.precipitation = precip;
      out.weatherBucket = bucket || 'clear';
    }
    return out;
  }

  function getDisplayMode() {
    try {
      const m = localStorage.getItem(STORAGE_MODE) || 'auto';
      if (m === 'light' || m === 'dark' || m === 'night' || m === 'auto') return m;
    } catch (e) {}
    return 'auto';
  }

  function setDisplayMode(mode) {
    const m = mode === 'light' || mode === 'dark' || mode === 'night' ? mode : 'auto';
    try {
      localStorage.setItem(STORAGE_MODE, m);
      // Keep legacy key in sync so old discrete locks don't fight Light/Dark/Night
      if (m === 'light') localStorage.setItem('chaupaal_theme', 'clearDay');
      else if (m === 'dark' || m === 'night') localStorage.setItem('chaupaal_theme', 'night');
      else localStorage.removeItem('chaupaal_theme');
    } catch (e) {}
    recompute('display_mode');
  }

  function isAmbientUserOn() {
    try {
      return localStorage.getItem(STORAGE_AMBIENT) === '1';
    } catch (e) {
      return false;
    }
  }

  function setAmbientUserOn(on) {
    try {
      localStorage.setItem(STORAGE_AMBIENT, on ? '1' : '0');
    } catch (e) {}
    if (typeof ChaupaalAmbient !== 'undefined' && ChaupaalAmbient.sync) ChaupaalAmbient.sync();
  }

  function getGeoConsent() {
    try {
      return localStorage.getItem(STORAGE_GEO) || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  function setGeoConsent(v) {
    try {
      localStorage.setItem(STORAGE_GEO, v);
    } catch (e) {}
  }

  function quietModeOn() {
    try {
      if (typeof quietMode !== 'undefined' && quietMode) return true;
      return !!document.getElementById('toggleQuiet')?.checked || localStorage.getItem('chaupaal_quiet') === '1';
    } catch {
      return false;
    }
  }

  function buildAutoState() {
    const tb = timeBlend(new Date());
    let mixed = mixAnchor(tb.a, tb.b, tb.t);
    mixed = weatherBlend(mixed);
    const hour = new Date().getHours();
    const isDay = hour >= 6 && hour < 20 && mixed.anchor !== 'night';
    const ambientOn = ambientFlagEnabled && isAmbientUserOn() && !quietModeOn();
    return {
      isDay,
      lightTemp: clamp01(mixed.lightTemp),
      brightness: clamp01(mixed.brightness),
      precipitation: clamp01(mixed.precipitation),
      cloudCover: clamp01(mixed.cloudCover),
      motionIntensity: clamp01(mixed.motionIntensity),
      weatherBucket: mixed.weatherBucket || weatherCtx.bucket || null,
      soundKey: ambientOn ? mixed.soundKey : null,
      soundKeyA: mixed.soundKeyA || mixed.soundKey,
      soundKeyB: mixed.soundKeyB || mixed.soundKey,
      soundBlend: mixed.soundBlend != null ? mixed.soundBlend : 0,
      soundVolume: ambientOn ? 0.12 : 0,
      anchor: mixed.anchor,
      vars: mixed.vars,
      metaThemeColor: mixed.metaThemeColor,
    };
  }

  function buildDiscreteAutoState() {
    const h = new Date().getHours();
    const w = weatherCtx.bucket || 'unknown';
    let key = 'clearDay';
    if (h >= 21 || h < 5) key = 'night';
    else if (h >= 5 && h < 8) key = 'dawn';
    else if (h >= 17 && h < 19) key = 'goldenHour';
    else if (w === 'rain' || w === 'storm') key = 'rainy';
    else if (w === 'overcast' || w === 'fog' || w === 'partly_cloudy') key = 'overcast';
    else if (w === 'clear' || (h >= 8 && h < 17)) key = 'clearDay';
    else key = 'goldenHour';
    const A = ANCHORS[key] || ANCHORS.clearDay;
    return {
      isDay: key !== 'night',
      lightTemp: A.lightTemp,
      brightness: A.brightness,
      precipitation: A.precipitation,
      cloudCover: A.cloudCover,
      motionIntensity: A.motionIntensity,
      soundKey: null,
      soundVolume: 0,
      anchor: key,
      vars: A.vars,
      metaThemeColor: A.metaThemeColor,
    };
  }

  function buildState() {
    const mode = getDisplayMode();
    // Manual presets always win — independent of sensory_theme flag
    if (mode !== 'auto' && PRESETS[mode]) {
      return { ...PRESETS[mode], discrete: true, mode };
    }
    if (sensoryEnabled) {
      return { ...buildAutoState(), discrete: false, mode: 'auto' };
    }
    return { ...buildDiscreteAutoState(), discrete: true, mode: 'auto' };
  }

  function writeCss(s) {
    const root = document.documentElement;
    const device = document.querySelector('.device');
    const set = (prop, val) => {
      root.style.setProperty(prop, val);
      device?.style.setProperty(prop, val);
    };
    set('--theme-light-temp', String(Number(s.lightTemp || 0).toFixed(3)));
    set('--theme-brightness', String(Number(s.brightness || 0).toFixed(3)));
    set('--theme-precipitation', String(Number(s.precipitation || 0).toFixed(3)));
    set('--theme-cloud-cover', String(Number(s.cloudCover || 0).toFixed(3)));
    set('--theme-motion', String(Number(s.motionIntensity || 0).toFixed(3)));
    set('--theme-is-day', s.isDay ? '1' : '0');

    Object.entries(s.vars || {}).forEach(([prop, val]) => set(prop, val));

    const warm = Number(s.lightTemp) || 0;
    const bright = Number(s.brightness) || 0;
    // Whisper-level wash — perceptible only if you look for it
    set(
      '--theme-overlay',
      `rgba(${Math.round(255 * warm)}, ${Math.round(190 * warm)}, ${Math.round(100 * warm)}, ${(0.028 * warm).toFixed(3)})`
    );
    set('--theme-dim', String((1 - bright) * 0.1));

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && s.metaThemeColor) meta.setAttribute('content', s.metaThemeColor);

    const key = s.anchor || 'clearDay';
    const keys = Object.keys(ANCHORS);
    keys.forEach((k) => {
      root.classList.remove('theme-' + k);
      document.body?.classList.remove('theme-' + k);
      device?.classList.remove('theme-' + k);
    });
    root.classList.remove('theme-default', 'theme-rain', 'theme-hot', 'theme-cold');
    ['auto', 'light', 'dark', 'night'].forEach((m) => root.classList.remove('theme-preset-' + m));
    root.classList.add('theme-' + key);
    document.body?.classList.add('theme-' + key);
    device?.classList.add('theme-' + key);
    if (key === 'rainy') {
      root.classList.add('theme-rain');
      document.body?.classList.add('theme-rain');
    }
    root.classList.toggle('theme-sensory', !!sensoryEnabled && (s.mode || getDisplayMode()) === 'auto');
    root.classList.add('theme-preset-' + (s.mode || getDisplayMode()));
    try {
      root.style.colorScheme = s.isDay ? 'light' : 'dark';
    } catch (e) {}

    ensureWeatherAtmosphere(s.precipitation || 0, s.weatherBucket || weatherCtx.bucket);
    window.__chaupaalTheme = key;
    window.__chaupaalThemeState = s;
  }

  function prefersReducedMotion() {
    try {
      return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch (e) {
      return false;
    }
  }

  /** Subtle rain streaks / snowflakes — always behind UI (z-index 0). */
  function ensureWeatherAtmosphere(precip, bucket) {
    const device = document.querySelector('.device') || document.body;
    let el = document.getElementById('themeRainOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'themeRainOverlay';
      el.setAttribute('aria-hidden', 'true');
      // Insert first so paint order stays under chrome even without z-index help
      if (device.firstChild) device.insertBefore(el, device.firstChild);
      else device.appendChild(el);
    }
    el.className = 'theme-weather-overlay';

    const p = clamp01(precip);
    const isSnow = bucket === 'snow';
    const showRain = !isSnow && p > 0.06;
    const showSnow = isSnow && p > 0.04;
    const reduced = prefersReducedMotion();

    el.classList.toggle('is-rain', showRain);
    el.classList.toggle('is-snow', showSnow);

    // Cap opacity low — ambient hint, not a filter over text
    const maxOp = isSnow ? 0.2 : 0.16;
    el.style.opacity = String(showRain || showSnow ? Math.min(maxOp, 0.04 + p * maxOp) : 0);

    if (reduced || (!showRain && !showSnow)) {
      el.innerHTML = '';
      return;
    }

    const mode = showSnow ? 'snow' : 'rain';
    if (el.dataset.wxMode === mode && el.childElementCount) return;

    el.dataset.wxMode = mode;
    const count = showSnow ? Math.round(10 + p * 14) : Math.round(8 + p * 12);
    const bits = [];
    for (let i = 0; i < count; i++) {
      const left = (i * 37 + 11) % 100;
      const delay = ((i * 0.37) % 4).toFixed(2);
      const dur = showSnow ? (7 + (i % 5) * 1.4).toFixed(1) : (1.6 + (i % 4) * 0.35).toFixed(2);
      const size = showSnow ? 2 + (i % 3) : 1;
      if (showSnow) {
        bits.push(
          `<span class="wx-flake" style="left:${left}%;width:${size}px;height:${size}px;animation-delay:-${delay}s;animation-duration:${dur}s"></span>`
        );
      } else {
        bits.push(
          `<span class="wx-drop" style="left:${left}%;animation-delay:-${delay}s;animation-duration:${dur}s;opacity:${(0.15 + (i % 5) * 0.04).toFixed(2)}"></span>`
        );
      }
    }
    el.innerHTML = bits.join('');
  }

  // Back-compat alias
  function ensureRainOverlay(precip) {
    ensureWeatherAtmosphere(precip, weatherCtx.bucket);
  }

  function recompute(reason) {
    const now = Date.now();
    if (reason === 'tick' && now - lastWriteAt < RECOMPUTE_MS * 0.8) return;
    state = buildState();
    writeCss(state);
    lastWriteAt = now;
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (e) {}
    });
    if (typeof ChaupaalAmbient !== 'undefined' && ChaupaalAmbient.sync) ChaupaalAmbient.sync(state);
  }

  function setWeatherContext( partial ) {
    weatherCtx = { ...weatherCtx, ...partial };
    recompute('weather');
  }

  function getState() {
    return state || buildState();
  }

  function subscribe(cb) {
    if (typeof cb !== 'function') return () => {};
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  async function refreshFlags() {
    let sensory = false;
    let ambient = false;
    try {
      if (typeof isFeatureEnabled === 'function') {
        sensory = await isFeatureEnabled('sensory_theme', { defaultValue: false });
        ambient = await isFeatureEnabled('ambient_sound', { defaultValue: false });
      }
    } catch (e) {}
    sensoryEnabled = !!sensory;
    ambientFlagEnabled = !!ambient;
    return { sensoryEnabled, ambientFlagEnabled };
  }

  function startPolling() {
    stopPolling();
    timer = setInterval(() => recompute('tick'), RECOMPUTE_MS);
    document.addEventListener('visibilitychange', onVisibility);
  }

  function stopPolling() {
    if (timer) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibility);
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') recompute('visibility');
  }

  async function start() {
    await refreshFlags();
    started = true;
    // Always apply display mode (Light/Dark/Night/Auto) — sensory flag only affects Auto interpolation
    recompute('start');
    startPolling();
    if (getDisplayMode() === 'auto') {
      if (typeof refreshWeatherTheme === 'function') {
        setTimeout(() => refreshWeatherTheme(), 600);
      }
    }
  }

  function isSensoryEnabled() {
    return sensoryEnabled;
  }

  function isAmbientFlagEnabled() {
    return ambientFlagEnabled;
  }

  window.ChaupaalTheme = {
    ANCHORS,
    PRESETS,
    getState,
    subscribe,
    recompute,
    setWeatherContext,
    getDisplayMode,
    setDisplayMode,
    isAmbientUserOn,
    setAmbientUserOn,
    getGeoConsent,
    setGeoConsent,
    refreshFlags,
    start,
    isSensoryEnabled,
    isAmbientFlagEnabled,
    STORAGE_MODE,
    STORAGE_AMBIENT,
    STORAGE_GEO,
  };
})();
