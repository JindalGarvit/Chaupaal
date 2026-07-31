/**
 * Chaupaal display / sensory theme engine.
 * True Material-like Light is the baseline. Other anchors derive from Light.
 * Auto = Light-first + subtle sky/weather (not a costume). Fixed Light = no atmosphere.
 *
 * Flags:
 *   sensory_theme  → continuous Auto interpolation
 *   ambient_sound  → independent kill switch
 *
 * When sensory_theme is off, Auto uses discrete Light-derived anchors (same Light baseline).
 */
(function () {
  'use strict';

  const STORAGE_MODE = 'chaupaal_display_mode';
  const STORAGE_AMBIENT = 'chaupaal_ambient_sound';
  const STORAGE_GEO = 'chaupaal_theme_geo_consent';
  const RECOMPUTE_MS = 20 * 60_000;

  /** @typedef {'clearDay'|'overcast'|'rainy'|'goldenHour'|'dawn'|'night'} AnchorKey */

  /**
   * True Light — Material / Android-system light baseline.
   * Brand red/gold stay accents only; canvas stays neutral gray-white.
   */
  const LIGHT = {
    '--cream': '#F5F5F5',
    '--bg': '#F5F5F5',
    '--white': '#FFFFFF',
    '--card': '#FFFFFF',
    '--ink': '#1C1B1F',
    '--muted': '#5F6368',
    '--line': '#E0E0E0',
    '--red': '#E63946',
  };
  const LIGHT_META = '#F5F5F5';

  /** Dark sibling of Light (same roles, inverted). */
  const DARK = {
    '--cream': '#121316',
    '--bg': '#121316',
    '--white': '#1C1E22',
    '--card': '#1C1E22',
    '--ink': '#E8EAED',
    '--muted': '#9AA0A6',
    '--line': '#2C2E33',
    '--red': '#E63946',
  };
  const DARK_META = '#121316';

  /** Night = dimmer + slightly warmer than Dark (late reading). */
  const NIGHT = {
    '--cream': '#141210',
    '--bg': '#141210',
    '--white': '#1E1A17',
    '--card': '#1E1A17',
    '--ink': '#F0EBE6',
    '--muted': '#A89F96',
    '--line': '#322C28',
    '--red': '#E63946',
  };
  const NIGHT_META = '#141210';

  /**
   * Six sensory anchors — surfaces derived from LIGHT (or DARK for night).
   * goldenHour / dawn keep Light surfaces; warmth is overlay-only via lightTemp.
   */
  const ANCHORS = {
    clearDay: {
      lightTemp: 0.32,
      brightness: 0.96,
      precipitation: 0,
      cloudCover: 0.08,
      motionIntensity: 0.12,
      soundKey: 'day_ambient',
      metaThemeColor: LIGHT_META,
      vars: { ...LIGHT },
    },
    overcast: {
      lightTemp: 0.22,
      brightness: 0.9,
      precipitation: 0.04,
      cloudCover: 0.72,
      motionIntensity: 0.1,
      soundKey: 'day_ambient',
      metaThemeColor: '#F0F2F4',
      // Slight cool shift — still reads as Light variant
      vars: {
        ...LIGHT,
        '--cream': '#F0F2F4',
        '--bg': '#F0F2F4',
        '--white': '#FAFBFC',
        '--card': '#FAFBFC',
        '--ink': '#1A1C1E',
        '--muted': '#5C636A',
        '--line': '#DCE0E4',
      },
    },
    rainy: {
      lightTemp: 0.18,
      brightness: 0.86,
      precipitation: 0.8,
      cloudCover: 0.88,
      motionIntensity: 0.22,
      soundKey: 'rain_soft',
      metaThemeColor: '#EEF1F4',
      vars: {
        ...LIGHT,
        '--cream': '#EEF1F4',
        '--bg': '#EEF1F4',
        '--white': '#F7F9FB',
        '--card': '#F7F9FB',
        '--ink': '#181B1F',
        '--muted': '#586068',
        '--line': '#D5DBE1',
      },
    },
    // Surfaces locked to Light — warm edge wash only in writeCss
    goldenHour: {
      lightTemp: 0.72,
      brightness: 0.94,
      precipitation: 0,
      cloudCover: 0.15,
      motionIntensity: 0.12,
      soundKey: 'golden_hour_wind',
      metaThemeColor: LIGHT_META,
      vars: { ...LIGHT },
    },
    dawn: {
      lightTemp: 0.58,
      brightness: 0.93,
      precipitation: 0,
      cloudCover: 0.18,
      motionIntensity: 0.1,
      soundKey: 'day_ambient',
      metaThemeColor: LIGHT_META,
      vars: { ...LIGHT },
    },
    night: {
      lightTemp: 0.2,
      brightness: 0.34,
      precipitation: 0,
      cloudCover: 0.25,
      motionIntensity: 0.08,
      soundKey: 'night_quiet',
      metaThemeColor: DARK_META,
      vars: { ...DARK },
    },
  };

  /** Manual presets — fixed writers (same CSS contract as Auto). */
  const PRESETS = {
    light: {
      isDay: true,
      lightTemp: 0.3,
      brightness: 0.98,
      precipitation: 0,
      cloudCover: 0,
      motionIntensity: 0,
      soundKey: null,
      soundVolume: 0,
      anchor: 'clearDay',
      vars: { ...LIGHT },
      metaThemeColor: LIGHT_META,
      atmosphere: false,
    },
    dark: {
      isDay: false,
      lightTemp: 0.1,
      brightness: 0.4,
      precipitation: 0,
      cloudCover: 0,
      motionIntensity: 0,
      soundKey: null,
      soundVolume: 0,
      anchor: 'night',
      vars: { ...DARK },
      metaThemeColor: DARK_META,
      atmosphere: false,
    },
    night: {
      isDay: false,
      lightTemp: 0.42,
      brightness: 0.28,
      precipitation: 0,
      cloudCover: 0,
      motionIntensity: 0.05,
      soundKey: 'night_quiet',
      soundVolume: 0,
      anchor: 'night',
      vars: { ...NIGHT },
      metaThemeColor: NIGHT_META,
      atmosphere: false,
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
      const a = va[k] || LIGHT[k] || '#000000';
      const b = vb[k] || LIGHT[k] || '#000000';
      // Non-hex tokens (e.g. future) — pick nearer endpoint
      if (!/^#[0-9A-Fa-f]{6}$/.test(a) || !/^#[0-9A-Fa-f]{6}$/.test(b)) {
        out[k] = t < 0.5 ? a : b;
        return;
      }
      out[k] = mixHex(a, b, t);
    });
    return out;
  }

  /** Cap surface drift so blends never leave the Light family during day. */
  function capDaySurfaceMix(vars, towardKey, amount) {
    const cap =
      towardKey === 'rainy' ? 0.12 : towardKey === 'overcast' ? 0.1 : towardKey === 'night' ? 1 : 0.04;
    const t = Math.min(clamp01(amount), cap);
    if (t <= 0 || towardKey === 'goldenHour' || towardKey === 'dawn') {
      return { ...LIGHT, ...(vars || {}), '--cream': LIGHT['--cream'], '--white': LIGHT['--white'], '--ink': LIGHT['--ink'], '--muted': LIGHT['--muted'], '--line': LIGHT['--line'], '--bg': LIGHT['--bg'], '--card': LIGHT['--card'] };
    }
    return mixVars(LIGHT, ANCHORS[towardKey]?.vars || LIGHT, t);
  }

  function mixAnchor(aKey, bKey, t) {
    const A = ANCHORS[aKey] || ANCHORS.clearDay;
    const B = ANCHORS[bKey] || ANCHORS.clearDay;
    const tt = clamp01(t);
    const warmOnly =
      (aKey === 'goldenHour' || aKey === 'dawn' || bKey === 'goldenHour' || bKey === 'dawn') &&
      aKey !== 'night' &&
      bKey !== 'night';

    let vars;
    if (warmOnly) {
      // Keep Light surfaces; only sensory fields interpolate
      vars = { ...LIGHT };
    } else if (aKey === 'night' || bKey === 'night') {
      vars = mixVars(A.vars, B.vars, tt);
    } else {
      // Day anchors: blend from Light with small caps
      const toward = tt < 0.5 ? aKey : bKey;
      const amt = toward === aKey ? 1 - tt : tt;
      vars = capDaySurfaceMix(mixVars(A.vars, B.vars, tt), toward, amt);
    }

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
      vars,
      metaThemeColor: warmOnly
        ? LIGHT_META
        : mixHex(A.metaThemeColor, B.metaThemeColor, tt),
      anchor: tt < 0.5 ? aKey : bKey,
    };
  }

  function parseSunMs(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }

  function timeBlend(now = new Date()) {
    const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const sunrise = parseSunMs(weatherCtx.sunrise);
    const sunset = parseSunMs(weatherCtx.sunset);
    const nowMs = now.getTime();

    if (sunrise && sunset) {
      const dawnWin = 45 * 60 * 1000;
      const goldWin = 50 * 60 * 1000;
      if (nowMs < sunrise - dawnWin) return { a: 'night', b: 'night', t: 0 };
      if (nowMs < sunrise + dawnWin) {
        const t = clamp01((nowMs - (sunrise - dawnWin)) / (2 * dawnWin));
        if (t < 0.5) return { a: 'night', b: 'dawn', t: t * 2 };
        return { a: 'dawn', b: 'clearDay', t: (t - 0.5) * 2 };
      }
      if (nowMs < sunset - goldWin) return { a: 'clearDay', b: 'clearDay', t: 0 };
      if (nowMs < sunset + goldWin) {
        const t = clamp01((nowMs - (sunset - goldWin)) / (2 * goldWin));
        if (t < 0.45) return { a: 'clearDay', b: 'goldenHour', t: t / 0.45 };
        return { a: 'goldenHour', b: 'night', t: (t - 0.45) / 0.55 };
      }
      return { a: 'night', b: 'night', t: 0 };
    }

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

    // Whisper-level weather influence on tokens (content stays primary)
    const weatherMix = 0.08;

    if (out.anchor === 'night') {
      out.cloudCover = cloud;
      out.precipitation = precip;
      out.weatherBucket = bucket || 'clear';
      return out;
    }

    if (precip > 0.05 || bucket === 'snow') {
      const snowy = bucket === 'snow';
      const amt = clamp01(precip) * weatherMix;
      out = {
        ...out,
        lightTemp: lerp(out.lightTemp, ANCHORS.rainy.lightTemp, amt),
        brightness: lerp(out.brightness, ANCHORS.rainy.brightness, amt),
        precipitation: Math.max(out.precipitation, precip),
        cloudCover: Math.max(out.cloudCover, cloud),
        motionIntensity: lerp(out.motionIntensity, ANCHORS.rainy.motionIntensity, precip * 0.35),
        vars: capDaySurfaceMix(out.vars, 'rainy', amt),
        soundKey: snowy ? 'snow_soft' : precip > 0.28 ? 'rain_soft' : out.soundKey,
        soundKeyA: out.soundKeyA || out.soundKey,
        soundKeyB: snowy ? 'snow_soft' : 'rain_soft',
        soundBlend: precip,
        anchor: precip > 0.75 ? 'rainy' : out.anchor,
        weatherBucket: bucket || (snowy ? 'snow' : 'rain'),
        metaThemeColor: LIGHT_META,
      };
    } else if (cloud > 0.4) {
      const amt = ((cloud - 0.4) / 0.6) * weatherMix;
      out = {
        ...out,
        lightTemp: lerp(out.lightTemp, ANCHORS.overcast.lightTemp, 0.2),
        brightness: lerp(out.brightness, ANCHORS.overcast.brightness, 0.22),
        cloudCover: cloud,
        vars: capDaySurfaceMix(out.vars, 'overcast', amt),
        anchor: cloud > 0.9 && out.anchor === 'clearDay' ? 'overcast' : out.anchor,
        weatherBucket: bucket || 'overcast',
        metaThemeColor: LIGHT_META,
      };
    } else {
      out.cloudCover = cloud;
      out.precipitation = precip;
      out.weatherBucket = bucket || 'clear';
      out.metaThemeColor = out.isDay === false ? out.metaThemeColor : LIGHT_META;
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
    // Daytime Auto: meta stays Light-native so Android chrome matches system light apps
    const meta =
      mixed.anchor === 'night' || !isDay
        ? mixed.metaThemeColor || DARK_META
        : LIGHT_META;
    return {
      isDay,
      lightTemp: clamp01(mixed.lightTemp),
      brightness: clamp01(mixed.brightness),
      precipitation: clamp01(mixed.precipitation),
      cloudCover: clamp01(mixed.cloudCover),
      motionIntensity: clamp01(Math.min(mixed.motionIntensity, 0.28)),
      weatherBucket: mixed.weatherBucket || weatherCtx.bucket || null,
      soundKey: ambientOn ? mixed.soundKey : null,
      soundKeyA: mixed.soundKeyA || mixed.soundKey,
      soundKeyB: mixed.soundKeyB || mixed.soundKey,
      soundBlend: mixed.soundBlend != null ? mixed.soundBlend : 0,
      soundVolume: ambientOn ? 0.1 : 0,
      anchor: mixed.anchor,
      vars: mixed.vars,
      metaThemeColor: meta,
      atmosphere: true,
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
    const isDay = key !== 'night';
    return {
      isDay,
      lightTemp: A.lightTemp,
      brightness: A.brightness,
      precipitation: A.precipitation,
      cloudCover: A.cloudCover,
      motionIntensity: Math.min(A.motionIntensity, 0.2),
      soundKey: null,
      soundVolume: 0,
      anchor: key,
      vars: { ...A.vars },
      metaThemeColor: isDay ? LIGHT_META : A.metaThemeColor,
      atmosphere: true,
    };
  }

  function buildState() {
    const mode = getDisplayMode();
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
    const mode = s.mode || getDisplayMode();
    const atmosphereOn = mode === 'auto' && s.atmosphere !== false;
    const set = (prop, val) => {
      root.style.setProperty(prop, val);
      device?.style.setProperty(prop, val);
    };
    set('--theme-light-temp', String(Number(s.lightTemp || 0).toFixed(3)));
    set('--theme-brightness', String(Number(s.brightness || 0).toFixed(3)));
    set('--theme-precipitation', String(Number(atmosphereOn ? s.precipitation || 0 : 0).toFixed(3)));
    set('--theme-cloud-cover', String(Number(atmosphereOn ? s.cloudCover || 0 : 0).toFixed(3)));
    set('--theme-motion', String(Number(atmosphereOn ? s.motionIntensity || 0 : 0).toFixed(3)));
    set('--theme-is-day', s.isDay ? '1' : '0');

    Object.entries(s.vars || {}).forEach(([prop, val]) => set(prop, val));

    const warm = atmosphereOn ? Number(s.lightTemp) || 0 : 0;
    const bright = Number(s.brightness) || 0;
    const anchor = s.anchor || 'clearDay';
    // Faint warm edge wash only near golden hour / dawn — never peach UI
    const warmWash =
      atmosphereOn && s.isDay && (anchor === 'goldenHour' || anchor === 'dawn' || warm > 0.5)
        ? Math.min(0.035, 0.012 + warm * 0.028)
        : atmosphereOn && s.isDay
          ? Math.min(0.012, warm * 0.02)
          : 0;
    set(
      '--theme-overlay',
      `rgba(${Math.round(255 * Math.min(1, warm + 0.15))}, ${Math.round(170 + 40 * warm)}, ${Math.round(90 + 30 * (1 - warm))}, ${warmWash.toFixed(3)})`
    );
    set('--theme-dim', String(atmosphereOn ? (1 - bright) * 0.06 : 0));

    const metaColor =
      mode === 'light'
        ? LIGHT_META
        : mode === 'dark'
          ? DARK_META
          : mode === 'night'
            ? NIGHT_META
            : s.metaThemeColor || (s.isDay ? LIGHT_META : DARK_META);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', metaColor);

    const statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (statusBar) {
      statusBar.setAttribute('content', s.isDay ? 'default' : 'black');
    }

    const keys = Object.keys(ANCHORS);
    keys.forEach((k) => {
      root.classList.remove('theme-' + k);
      document.body?.classList.remove('theme-' + k);
      device?.classList.remove('theme-' + k);
    });
    root.classList.remove('theme-default', 'theme-rain', 'theme-hot', 'theme-cold');
    ['auto', 'light', 'dark', 'night'].forEach((m) => root.classList.remove('theme-preset-' + m));
    root.classList.add('theme-' + anchor);
    document.body?.classList.add('theme-' + anchor);
    device?.classList.add('theme-' + anchor);
    if (atmosphereOn && anchor === 'rainy') {
      root.classList.add('theme-rain');
      document.body?.classList.add('theme-rain');
    }
    root.classList.toggle('theme-sensory', !!sensoryEnabled && mode === 'auto');
    root.classList.add('theme-preset-' + mode);
    try {
      root.style.colorScheme = s.isDay ? 'light' : 'dark';
    } catch (e) {}

    if (atmosphereOn && !quietModeOn()) {
      ensureWeatherAtmosphere(s.precipitation || 0, s.weatherBucket || weatherCtx.bucket);
    } else {
      ensureWeatherAtmosphere(0, null);
    }
    window.__chaupaalTheme = anchor;
    window.__chaupaalThemeState = s;
  }

  function prefersReducedMotion() {
    try {
      return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch (e) {
      return false;
    }
  }

  /** Quiet rain / snow — always behind UI. Fixed Light/Dark/Night call with precip=0. */
  function ensureWeatherAtmosphere(precip, bucket) {
    const device = document.querySelector('.device') || document.body;
    let el = document.getElementById('themeRainOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'themeRainOverlay';
      el.setAttribute('aria-hidden', 'true');
      if (device.firstChild) device.insertBefore(el, device.firstChild);
      else device.appendChild(el);
    }
    el.className = 'theme-weather-overlay';

    const p = clamp01(precip);
    const isSnow = bucket === 'snow';
    const showRain = !isSnow && p > 0.1;
    const showSnow = isSnow && p > 0.08;
    const reduced = prefersReducedMotion() || quietModeOn();

    el.classList.toggle('is-rain', showRain);
    el.classList.toggle('is-snow', showSnow);

    // Much quieter than prior sensory pass
    const maxOp = isSnow ? 0.1 : 0.08;
    el.style.opacity = String(showRain || showSnow ? Math.min(maxOp, 0.02 + p * maxOp) : 0);

    if (reduced || (!showRain && !showSnow)) {
      el.innerHTML = '';
      el.dataset.wxMode = '';
      return;
    }

    const mode = showSnow ? 'snow' : 'rain';
    if (el.dataset.wxMode === mode && el.childElementCount) return;

    el.dataset.wxMode = mode;
    const count = showSnow ? Math.round(5 + p * 7) : Math.round(4 + p * 6);
    const bits = [];
    for (let i = 0; i < count; i++) {
      const left = (i * 41 + 13) % 100;
      const delay = ((i * 0.45) % 5).toFixed(2);
      const dur = showSnow ? (9 + (i % 4) * 1.6).toFixed(1) : (2.4 + (i % 4) * 0.5).toFixed(2);
      const size = showSnow ? 2 + (i % 2) : 1;
      if (showSnow) {
        bits.push(
          `<span class="wx-flake" style="left:${left}%;width:${size}px;height:${size}px;animation-delay:-${delay}s;animation-duration:${dur}s"></span>`
        );
      } else {
        bits.push(
          `<span class="wx-drop" style="left:${left}%;animation-delay:-${delay}s;animation-duration:${dur}s;opacity:${(0.08 + (i % 4) * 0.03).toFixed(2)}"></span>`
        );
      }
    }
    el.innerHTML = bits.join('');
  }

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

  function setWeatherContext(partial) {
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
    LIGHT,
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
