/**
 * App-wide dynamic theming (Part 2 Phase 7).
 * Registry of theme states driven by time-of-day + Open-Meteo weather.
 * Extend by adding entries to THEME_REGISTRY — do not hardcode per-screen checks.
 */
(function () {
  'use strict';

  /**
   * Theme set (judgment call for Part 2 summary):
   * clearDay | overcast | rainy | goldenHour | dawn | night
   */
  const THEME_REGISTRY = {
    clearDay: {
      metaThemeColor: '#F7F1E8',
      vars: {
        '--cream': '#F7F1E8',
        '--white': '#FFFcf7',
        '--ink': '#2B2730',
        '--muted': '#7A7480',
        '--line': '#E8DFD4',
      },
      ambient: null,
    },
    overcast: {
      metaThemeColor: '#E8EEF2',
      vars: {
        '--cream': '#E8EEF2',
        '--white': '#F5F7FA',
        '--ink': '#243040',
        '--muted': '#6B7785',
        '--line': '#D5DCE3',
      },
      ambient: null,
    },
    rainy: {
      metaThemeColor: '#D9E4EC',
      vars: {
        '--cream': '#D9E4EC',
        '--white': '#EEF3F7',
        '--ink': '#1E2A36',
        '--muted': '#5E6D7A',
        '--line': '#C5D0D9',
      },
      // Optional subtle rain loop — only if user enables ambient
      ambient: null,
    },
    goldenHour: {
      metaThemeColor: '#F5E0C8',
      vars: {
        '--cream': '#F5E0C8',
        '--white': '#FFF6EB',
        '--ink': '#3A2A1F',
        '--muted': '#8A6E55',
        '--line': '#E8D2B8',
      },
      ambient: null,
    },
    dawn: {
      metaThemeColor: '#F5E6D3',
      vars: {
        '--cream': '#F5E6D3',
        '--white': '#FFF9F2',
        '--ink': '#3A2F28',
        '--muted': '#8A7A6C',
        '--line': '#E8D9C8',
      },
      ambient: null,
    },
    night: {
      metaThemeColor: '#0F1117',
      vars: {
        '--cream': '#161A24',
        '--white': '#1B2030',
        '--ink': '#F2F0F5',
        '--muted': '#A8A0B0',
        '--line': '#2A3145',
      },
      ambient: null,
    },
  };

  const THEME_KEYS = Object.keys(THEME_REGISTRY);
  let ambientAudio = null;
  let weatherBucket = null;

  function prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  function quietModeOn() {
    try {
      return !!document.getElementById('toggleQuiet')?.checked || localStorage.getItem('chaupaal_quiet') === '1';
    } catch {
      return false;
    }
  }

  function stopAmbient() {
    try {
      ambientAudio?.pause();
      ambientAudio = null;
    } catch (e) {}
  }

  function applyTheme(themeKey) {
    const key = THEME_KEYS.includes(themeKey) ? themeKey : 'clearDay';
    const def = THEME_REGISTRY[key] || THEME_REGISTRY.clearDay;
    const root = document.documentElement;
    const device = document.querySelector('.device');

    THEME_KEYS.forEach((k) => {
      root.classList.remove('theme-' + k);
      document.body?.classList.remove('theme-' + k);
      device?.classList.remove('theme-' + k);
      // legacy aliases
      root.classList.remove('theme-default', 'theme-rain', 'theme-hot', 'theme-cold');
    });
    // legacy class aliases for older CSS
    const legacy =
      key === 'rainy' ? 'rain' : key === 'clearDay' ? null : key === 'overcast' ? 'cold' : key;
    root.classList.add('theme-' + key);
    document.body?.classList.add('theme-' + key);
    device?.classList.add('theme-' + key);
    if (legacy && legacy !== key) {
      root.classList.add('theme-' + legacy);
      document.body?.classList.add('theme-' + legacy);
      device?.classList.add('theme-' + legacy);
    }

    Object.entries(def.vars || {}).forEach(([prop, val]) => {
      root.style.setProperty(prop, val);
      device?.style.setProperty(prop, val);
    });

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', def.metaThemeColor || '#E63946');

    stopAmbient();
    if (def.ambient && !prefersReducedMotion() && !quietModeOn()) {
      try {
        ambientAudio = new Audio(def.ambient);
        ambientAudio.loop = true;
        ambientAudio.volume = 0.18;
        ambientAudio.play().catch(() => {});
      } catch (e) {}
    }

    try {
      if (themeKey === 'auto' || !localStorage.getItem('chaupaal_theme_lock')) {
        /* auto mode — do not persist */
      } else {
        localStorage.setItem('chaupaal_theme', key);
      }
    } catch (e) {}

    window.__chaupaalTheme = key;
  }

  function pickThemeFromContext({ hour, weather } = {}) {
    const h = typeof hour === 'number' ? hour : new Date().getHours();
    const w = weather || weatherBucket || 'unknown';

    if (h >= 21 || h < 5) return 'night';
    if (h >= 5 && h < 8) return 'dawn';
    if (h >= 17 && h < 19) return 'goldenHour';
    if (w === 'rain' || w === 'storm') return 'rainy';
    if (w === 'overcast' || w === 'fog' || w === 'partly_cloudy') return 'overcast';
    if (w === 'clear') return 'clearDay';
    // Day default
    if (h >= 8 && h < 17) return 'clearDay';
    return 'goldenHour';
  }

  async function refreshWeatherTheme() {
    try {
      const city =
        (typeof digitalProfile !== 'undefined' && digitalProfile?.currentCity) ||
        (typeof userProfile !== 'undefined' && (userProfile?.currentCity || userProfile?.city)) ||
        '';
      if (!city) return;
      // Client-side Open-Meteo (same provider as server-lib/weather.js) — no API key
      const geoUrl =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      if (!geoRes.ok) return;
      const geo = await geoRes.json();
      const hit = geo?.results?.[0];
      if (!hit) return;
      const wxUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}` +
        `&current=weather_code&timezone=auto`;
      const wxRes = await fetch(wxUrl);
      if (!wxRes.ok) return;
      const wx = await wxRes.json();
      const code = Number(wx?.current?.weather_code);
      if (code === 0) weatherBucket = 'clear';
      else if (code >= 1 && code <= 3) weatherBucket = 'partly_cloudy';
      else if (code === 45 || code === 48) weatherBucket = 'fog';
      else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) weatherBucket = 'rain';
      else if (code >= 95) weatherBucket = 'storm';
      else weatherBucket = 'overcast';

      let locked = null;
      try {
        locked = localStorage.getItem('chaupaal_theme');
      } catch (e) {}
      if (locked && THEME_KEYS.includes(locked)) return; // user override
      applyTheme(pickThemeFromContext({ weather: weatherBucket }));
    } catch (e) {
      /* offline / blocked — keep time-based theme */
    }
  }

  function initDynamicTheme() {
    let key = null;
    try {
      const saved = localStorage.getItem('chaupaal_theme');
      if (THEME_KEYS.includes(saved)) key = saved;
      // legacy keys
      if (saved === 'rain') key = 'rainy';
      if (saved === 'default' || saved === 'hot' || saved === 'cold') key = null;
    } catch (e) {}
    if (!key) key = pickThemeFromContext({});
    applyTheme(key);
    // Weather refresh async — may upgrade to rainy/overcast
    setTimeout(() => refreshWeatherTheme(), 800);
    // Recompute on hour change roughly
    setInterval(() => {
      try {
        const locked = localStorage.getItem('chaupaal_theme');
        if (locked && THEME_KEYS.includes(locked)) return;
        applyTheme(pickThemeFromContext({ weather: weatherBucket }));
      } catch (e) {}
    }, 15 * 60 * 1000);
  }

  window.THEME_REGISTRY = THEME_REGISTRY;
  window.applyTheme = applyTheme;
  window.initDynamicTheme = initDynamicTheme;
  window.refreshWeatherTheme = refreshWeatherTheme;
  window.pickThemeFromContext = pickThemeFromContext;
})();
