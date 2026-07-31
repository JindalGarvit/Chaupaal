/**
 * App-wide dynamic theming — discrete 6-state registry + gateway into ChaupaalTheme.
 * Light baseline is Material-neutral; other anchors derive from Light (see theme-engine.js).
 * When sensory_theme flag is off: snap between Light-derived anchors.
 * When on: theme-engine.js owns continuous interpolation + CSS vars.
 * Weather: single Open-Meteo client fetch (shared with engine via setWeatherContext).
 */
(function () {
  'use strict';

  /** Keep in sync with ChaupaalTheme.LIGHT / ANCHORS (theme-engine.js). */
  const LIGHT = {
    '--cream': '#F5F5F5',
    '--bg': '#F5F5F5',
    '--white': '#FFFFFF',
    '--card': '#FFFFFF',
    '--ink': '#1C1B1F',
    '--muted': '#5F6368',
    '--line': '#E0E0E0',
  };
  const DARK = {
    '--cream': '#121316',
    '--bg': '#121316',
    '--white': '#1C1E22',
    '--card': '#1C1E22',
    '--ink': '#E8EAED',
    '--muted': '#9AA0A6',
    '--line': '#2C2E33',
  };

  const THEME_REGISTRY = {
    clearDay: {
      metaThemeColor: '#F5F5F5',
      vars: { ...LIGHT },
      ambient: null,
    },
    overcast: {
      metaThemeColor: '#F0F2F4',
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
      ambient: null,
    },
    rainy: {
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
      ambient: null,
    },
    // Surfaces = Light; warmth is overlay-only in the engine
    goldenHour: {
      metaThemeColor: '#F5F5F5',
      vars: { ...LIGHT },
      ambient: null,
    },
    dawn: {
      metaThemeColor: '#F5F5F5',
      vars: { ...LIGHT },
      ambient: null,
    },
    night: {
      metaThemeColor: '#121316',
      vars: { ...DARK },
      ambient: null,
    },
  };

  const THEME_KEYS = Object.keys(THEME_REGISTRY);
  let weatherBucket = null;

  function applyThemeDiscrete(themeKey) {
    const key = THEME_KEYS.includes(themeKey) ? themeKey : 'clearDay';
    const def = THEME_REGISTRY[key] || THEME_REGISTRY.clearDay;
    const root = document.documentElement;
    const device = document.querySelector('.device');
    const isDay = key !== 'night';

    THEME_KEYS.forEach((k) => {
      root.classList.remove('theme-' + k);
      document.body?.classList.remove('theme-' + k);
      device?.classList.remove('theme-' + k);
      root.classList.remove('theme-default', 'theme-rain', 'theme-hot', 'theme-cold');
    });
    const legacy = key === 'rainy' ? 'rain' : key === 'clearDay' ? null : key === 'overcast' ? 'cold' : key;
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
    if (meta) meta.setAttribute('content', def.metaThemeColor || (isDay ? '#F5F5F5' : '#121316'));

    const statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (statusBar) statusBar.setAttribute('content', isDay ? 'default' : 'black');

    try {
      root.style.colorScheme = isDay ? 'light' : 'dark';
    } catch (e) {}

    try {
      if (themeKey === 'auto' || !localStorage.getItem('chaupaal_theme_lock')) {
        /* auto */
      } else {
        localStorage.setItem('chaupaal_theme', key);
      }
    } catch (e) {}

    window.__chaupaalTheme = key;
  }

  function applyTheme(themeKey) {
    // Prefer engine — respects Display Light/Dark/Night/Auto
    if (window.ChaupaalTheme?.recompute) {
      if (themeKey === 'light' || themeKey === 'dark' || themeKey === 'night' || themeKey === 'auto') {
        ChaupaalTheme.setDisplayMode(themeKey);
        return;
      }
      ChaupaalTheme.recompute('applyTheme');
      return;
    }
    applyThemeDiscrete(themeKey);
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
    if (h >= 8 && h < 17) return 'clearDay';
    return 'goldenHour';
  }

  function bucketFromCode(code) {
    const c = Number(code);
    if (c === 0) return 'clear';
    if (c >= 1 && c <= 3) return 'partly_cloudy';
    if (c === 45 || c === 48) return 'fog';
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
    if ((c >= 71 && c <= 77) || (c >= 85 && c <= 86)) return 'snow';
    if (c >= 95) return 'storm';
    return 'overcast';
  }

  async function fetchOpenMeteo(lat, lon) {
    const wxUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=weather_code,cloud_cover,precipitation&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
    const wxRes = await fetch(wxUrl);
    if (!wxRes.ok) return null;
    return wxRes.json();
  }

  async function geocodeCity(city) {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city
    )}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) return null;
    const geo = await geoRes.json();
    return geo?.results?.[0] || null;
  }

  /**
   * Resolve lat/lon for weather — theme geolocation is separate from friend location sharing.
   * Consent: chaupaal_theme_geo_consent (never touches share-with-friends toggles).
   */
  async function resolveThemeCoords() {
    const consent = window.ChaupaalTheme?.getGeoConsent?.() || 'unknown';
    if (consent === 'granted' && navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 30 * 60 * 1000,
          });
        });
        return { lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'geo' };
      } catch (e) {
        window.ChaupaalTheme?.setGeoConsent?.('denied');
      }
    }
    const city =
      (typeof digitalProfile !== 'undefined' && digitalProfile?.currentCity) ||
      (typeof userProfile !== 'undefined' && (userProfile?.currentCity || userProfile?.city)) ||
      '';
    if (city) {
      const hit = await geocodeCity(city);
      if (hit) return { lat: hit.latitude, lon: hit.longitude, source: 'city' };
    }
    return null;
  }

  async function refreshWeatherTheme() {
    try {
      const mode = window.ChaupaalTheme?.getDisplayMode?.() || 'auto';
      // Manual Light/Dark/Night — weather must not override
      if (mode !== 'auto') {
        window.ChaupaalTheme?.recompute?.('weather_skip');
        return;
      }

      const coords = await resolveThemeCoords();
      if (!coords) {
        window.ChaupaalTheme?.setWeatherContext?.({
          bucket: null,
          cloudCover: null,
          precipitation: null,
        });
        return;
      }

      const wx = await fetchOpenMeteo(coords.lat, coords.lon);
      if (!wx) {
        window.ChaupaalTheme?.setWeatherContext?.({ bucket: weatherBucket });
        return;
      }
      const code = Number(wx?.current?.weather_code);
      weatherBucket = bucketFromCode(code);
      const cloud = wx?.current?.cloud_cover;
      const precip = wx?.current?.precipitation;
      const sunrise = wx?.daily?.sunrise?.[0] || null;
      const sunset = wx?.daily?.sunset?.[0] || null;

      window.ChaupaalTheme?.setWeatherContext?.({
        bucket: weatherBucket,
        cloudCover: cloud != null ? Number(cloud) : null,
        precipitation: precip != null ? Math.min(1, Number(precip) / 5) : null,
        sunrise,
        sunset,
      });
    } catch (e) {
      /* offline / blocked — keep time-based theme */
    }
  }

  async function initDynamicTheme() {
    if (window.ChaupaalTheme?.start) {
      await ChaupaalTheme.start();
    } else {
      applyThemeDiscrete(pickThemeFromContext({}));
    }
    setTimeout(() => refreshWeatherTheme(), 800);
    setInterval(() => refreshWeatherTheme(), 15 * 60 * 1000);
  }

  window.THEME_REGISTRY = THEME_REGISTRY;
  window.applyTheme = applyTheme;
  window.initDynamicTheme = initDynamicTheme;
  window.refreshWeatherTheme = refreshWeatherTheme;
  window.pickThemeFromContext = pickThemeFromContext;
  window.resolveThemeCoords = resolveThemeCoords;
})();
