/**
 * App-wide dynamic theming — discrete 6-state registry + bridge into ChaupaalTheme.
 * When sensory_theme flag is off: classic snap between anchors (unchanged UX).
 * When on: theme-engine.js owns continuous interpolation + CSS vars.
 * Weather: single Open-Meteo client fetch (shared with engine via setWeatherContext).
 */
(function () {
  'use strict';

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
  let weatherBucket = null;

  function applyThemeDiscrete(themeKey) {
    const key = THEME_KEYS.includes(themeKey) ? themeKey : 'clearDay';
    const def = THEME_REGISTRY[key] || THEME_REGISTRY.clearDay;
    const root = document.documentElement;
    const device = document.querySelector('.device');

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
    if (meta) meta.setAttribute('content', def.metaThemeColor || '#E63946');

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
    if (window.ChaupaalTheme?.isSensoryEnabled?.()) {
      // Engine owns continuous application; optional snap hint for QA
      if (THEME_KEYS.includes(themeKey)) {
        try {
          localStorage.setItem('chaupaal_theme', themeKey);
        } catch (e) {}
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
      const coords = await resolveThemeCoords();
      if (!coords) {
        // Clock-only fallback — still fluid when sensory is on
        window.ChaupaalTheme?.setWeatherContext?.({
          bucket: null,
          cloudCover: null,
          precipitation: null,
        });
        if (!window.ChaupaalTheme?.isSensoryEnabled?.()) {
          let locked = null;
          try {
            locked = localStorage.getItem('chaupaal_theme');
          } catch (e) {}
          if (locked && THEME_KEYS.includes(locked)) return;
          applyThemeDiscrete(pickThemeFromContext({}));
        }
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

      if (window.ChaupaalTheme?.isSensoryEnabled?.()) return;

      let locked = null;
      try {
        locked = localStorage.getItem('chaupaal_theme');
      } catch (e) {}
      if (locked && THEME_KEYS.includes(locked)) return;
      applyThemeDiscrete(pickThemeFromContext({ weather: weatherBucket }));
    } catch (e) {
      /* offline / blocked — keep time-based theme */
    }
  }

  async function initDynamicTheme() {
    // Start engine (reads flags; discrete until sensory_theme on)
    if (window.ChaupaalTheme?.start) {
      await ChaupaalTheme.start();
    }

    if (window.ChaupaalTheme?.isSensoryEnabled?.()) {
      // Continuous path — weather upgrades precipitation/clouds
      setTimeout(() => refreshWeatherTheme(), 800);
      setInterval(() => refreshWeatherTheme(), 15 * 60 * 1000);
      return;
    }

    // Discrete fallback (original behavior)
    let key = null;
    try {
      const saved = localStorage.getItem('chaupaal_theme');
      if (THEME_KEYS.includes(saved)) key = saved;
      if (saved === 'rain') key = 'rainy';
      if (saved === 'default' || saved === 'hot' || saved === 'cold') key = null;
      // Ignore light/dark/night display presets when flag off
      if (saved === 'light') key = 'clearDay';
      if (saved === 'dark' || saved === 'night') key = 'night';
    } catch (e) {}
    if (!key) key = pickThemeFromContext({});
    applyThemeDiscrete(key);
    setTimeout(() => refreshWeatherTheme(), 800);
    setInterval(() => {
      try {
        const locked = localStorage.getItem('chaupaal_theme');
        if (locked && THEME_KEYS.includes(locked)) return;
        applyThemeDiscrete(pickThemeFromContext({ weather: weatherBucket }));
      } catch (e) {}
    }, 15 * 60 * 1000);
  }

  window.THEME_REGISTRY = THEME_REGISTRY;
  window.applyTheme = applyTheme;
  window.initDynamicTheme = initDynamicTheme;
  window.refreshWeatherTheme = refreshWeatherTheme;
  window.pickThemeFromContext = pickThemeFromContext;
  window.resolveThemeCoords = resolveThemeCoords;
})();
