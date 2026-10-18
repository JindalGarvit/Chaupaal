/**
 * Locale formatting (Global L1) — the only place UI code should turn dates, numbers, money, lists,
 * units and durations into text. Wraps Intl with the user's UI language + Region:
 *
 *   formatLocale()                  'en-IN', 'hi-IN', 'ar-SA', 'zh-Hans-CN', 'pt-BR' (+ '-u-nu-latn' when asked)
 *   formatDate(v, style, opts)      style: short | medium | long | dayMonth | weekday | month | time | datetime
 *   formatTime(v, opts)             12/24 h from getRegionPrefs().hour12
 *   formatRelative(v, opts)         "Just now", "3 minutes ago", "Yesterday", then a medium date
 *   formatNumber(n, opts)           grouping per locale (lakh/crore for en-IN, hi-IN …), locale digits
 *   formatCompact(n, opts)          1.2K · 1.2L / 1.2 lakh · 12万
 *   formatPercent(ratio, opts)      0.42 → 42% (fr: 42 %)
 *   formatCurrency(amount, code)    code = the value's own currency (stored values are never converted);
 *                                   defaults to the region currency only for amounts that have none
 *   formatList(items, opts)         "A, B and C" (Intl.ListFormat)
 *   formatUnit(v, unit, opts)       Intl unit style; formatDistance(meters) picks metric / imperial by region
 *   formatDuration(seconds)         m:ss or h:mm:ss (games, music)
 *
 * Time zone: display in the device's zone (the user's clock); stored / server timestamps stay UTC ms.
 * Digits: whatever Intl/CLDR uses for the locale (ar-SA → ٣, mr → ३, bn → ৩, hi-IN → 3). Settings →
 * "Use Western digits" (shown only when the locale defaults to native digits) forces 0–9.
 */
(function () {
  'use strict';

  const DIGITS_LS = 'chaupaal_digits';
  const cache = new Map();
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  function uiLang() {
    if (typeof isPseudoLocale === 'function' && isPseudoLocale()) return 'en';
    return typeof normalizeLang === 'function' ? normalizeLang(typeof currentLang !== 'undefined' ? currentLang : 'en') : 'en';
  }

  function regionPrefs() {
    try {
      return typeof getRegionPrefs === 'function' ? getRegionPrefs() : null;
    } catch (e) {
      return null;
    }
  }

  function regionCode() {
    try {
      return typeof ChaupaalRegion !== 'undefined' ? ChaupaalRegion.getRegion().country : null;
    } catch (e) {
      return null;
    }
  }

  function getDigitsPref() {
    try {
      const v = localStorage.getItem(DIGITS_LS);
      return v === 'latn' || v === 'native' ? v : '';
    } catch (e) {
      return '';
    }
  }

  function setDigitsPref(v) {
    try {
      if (v === 'latn' || v === 'native') localStorage.setItem(DIGITS_LS, v);
      else localStorage.removeItem(DIGITS_LS);
    } catch (e) {}
    cache.clear();
    try {
      document.dispatchEvent(new CustomEvent('chaupaal:format-changed', { detail: { digits: v || '' } }));
    } catch (e) {}
  }

  function valid(tag) {
    try {
      return Intl.getCanonicalLocales(tag)[0] || null;
    } catch (e) {
      return null;
    }
  }

  /** Language + script + region, e.g. en-IN, zh-Hans-CN; falls back to the language alone. */
  function baseLocale(lang, region) {
    const l = lang || uiLang();
    const r = region !== undefined ? region : regionCode();
    const lang0 = l === 'zh' ? 'zh-Hans' : l;
    return (r && valid(lang0 + '-' + r)) || valid(lang0) || 'en';
  }

  /** Locale whose default digits are not 0–9 (ar-SA, mr, bn …) — where the Western-digits toggle applies. */
  function localeUsesNativeDigits(locale) {
    try {
      return new Intl.NumberFormat(locale || baseLocale()).resolvedOptions().numberingSystem !== 'latn';
    } catch (e) {
      return false;
    }
  }

  function formatLocale(opts) {
    const o = opts || {};
    const base = o.locale || baseLocale(o.lang, o.region);
    const pref = o.digits !== undefined ? o.digits : getDigitsPref();
    if (pref === 'latn' && localeUsesNativeDigits(base)) return base + '-u-nu-latn';
    return base;
  }

  function fmt(Ctor, locale, options) {
    const key = Ctor.name + '|' + locale + '|' + JSON.stringify(options || {});
    let f = cache.get(key);
    if (!f) {
      try {
        f = new Ctor(locale, options);
      } catch (e) {
        f = new Ctor('en', options);
      }
      if (cache.size > 200) cache.clear();
      cache.set(key, f);
    }
    return f;
  }

  function toDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === 'object') {
      if (typeof v.toDate === 'function') return v.toDate();
      if (typeof v.toMillis === 'function') return new Date(v.toMillis());
      if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    }
    if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
    if (typeof v === 'string' && /^\d+$/.test(v)) return toDate(Number(v));
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function hour12Pref(o) {
    if (o && typeof o.hour12 === 'boolean') return o.hour12;
    const p = regionPrefs();
    return p && typeof p.hour12 === 'boolean' ? p.hour12 : undefined;
  }

  const DATE_STYLES = {
    short: { dateStyle: 'short' },
    medium: { day: 'numeric', month: 'short', year: 'numeric' },
    long: { day: 'numeric', month: 'long', year: 'numeric' },
    dayMonth: { day: 'numeric', month: 'short' },
    weekday: { weekday: 'long', day: 'numeric', month: 'short' },
    weekdayShort: { weekday: 'short', day: 'numeric', month: 'short' },
    month: { month: 'long' },
    monthYear: { month: 'long', year: 'numeric' },
  };

  function formatDate(v, style, opts) {
    const d = toDate(v);
    if (!d) return '';
    const o = opts || {};
    const s = style || 'medium';
    if (s === 'time') return formatTime(d, o);
    if (s === 'datetime') return formatDate(d, 'medium', o) + ', ' + formatTime(d, o);
    const options = Object.assign({}, DATE_STYLES[s] || DATE_STYLES.medium);
    if (o.timeZone) options.timeZone = o.timeZone;
    return fmt(Intl.DateTimeFormat, formatLocale(o), options).format(d);
  }

  function formatTime(v, opts) {
    const d = toDate(v);
    if (!d) return '';
    const o = opts || {};
    const options = { hour: 'numeric', minute: '2-digit' };
    const h12 = hour12Pref(o);
    if (h12 !== undefined) options.hour12 = h12;
    if (o.seconds) options.second = '2-digit';
    if (o.timeZone) options.timeZone = o.timeZone;
    return fmt(Intl.DateTimeFormat, formatLocale(o), options).format(d);
  }

  function capFirst(s, locale) {
    if (!s) return s;
    try {
      return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
    } catch (e) {
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
  }

  function startOfDay(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /** Past (or future) instant as relative text; older than ~4 weeks → a medium date. */
  function formatRelative(v, opts) {
    const o = opts || {};
    const d = toDate(v);
    if (!d) return typeof v === 'string' ? v : '';
    const now = o.now != null ? toDate(o.now).getTime() : Date.now();
    const ms = d.getTime();
    const diff = now - ms;
    const abs = Math.abs(diff);
    const locale = formatLocale(o);
    const rtf = fmt(Intl.RelativeTimeFormat, locale, { numeric: 'auto', style: o.style || 'long' });
    const sign = diff >= 0 ? -1 : 1;
    if (abs < MINUTE) {
      const jn = typeof t === 'function' ? t('common.just_now') : '';
      return jn && jn !== 'common.just_now' ? jn : capFirst(rtf.format(0, 'second'), locale);
    }
    if (abs < HOUR) return capFirst(rtf.format(sign * Math.floor(abs / MINUTE), 'minute'), locale);
    if (abs < DAY) return capFirst(rtf.format(sign * Math.floor(abs / HOUR), 'hour'), locale);
    const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
    if (Math.abs(days) < 7) return capFirst(rtf.format(-days, 'day'), locale);
    if (Math.abs(days) < 28) return capFirst(rtf.format(-Math.floor(days / 7), 'week'), locale);
    return formatDate(d, 'medium', o);
  }

  function num(n) {
    const x = Number(n);
    return Number.isFinite(x) ? x : 0;
  }

  function formatNumber(n, opts) {
    const o = Object.assign({}, opts || {});
    const locale = formatLocale(o);
    delete o.locale;
    delete o.lang;
    delete o.region;
    delete o.digits;
    if (o.maximumFractionDigits == null && o.minimumFractionDigits == null) o.maximumFractionDigits = 2;
    return fmt(Intl.NumberFormat, locale, o).format(num(n));
  }

  function formatCompact(n, opts) {
    const o = opts || {};
    const options = { notation: 'compact', compactDisplay: o.long ? 'long' : 'short' };
    // Intl's own compact rounding (1.2K, 123K, 12万) unless the caller asks otherwise.
    if (o.maximumFractionDigits != null) options.maximumFractionDigits = o.maximumFractionDigits;
    return fmt(Intl.NumberFormat, formatLocale(o), options).format(num(n));
  }

  function formatPercent(ratio, opts) {
    const o = opts || {};
    return fmt(Intl.NumberFormat, formatLocale(o), {
      style: 'percent',
      maximumFractionDigits: o.maximumFractionDigits != null ? o.maximumFractionDigits : 0,
    }).format(num(ratio));
  }

  /**
   * Money in its own currency. Pass the currency the amount is stored in (Chaupaal Money → INR);
   * the region currency is only a default for amounts that genuinely have none. Never converts.
   */
  function formatCurrency(amount, currency, opts) {
    const o = opts || {};
    const p = regionPrefs();
    const code = String(currency || (p && p.currency) || 'USD').toUpperCase();
    const x = num(amount);
    const whole = Number.isInteger(x);
    const options = {
      style: 'currency',
      currency: code,
      currencyDisplay: o.display || 'narrowSymbol',
    };
    if (o.maximumFractionDigits != null) options.maximumFractionDigits = o.maximumFractionDigits;
    else if (whole && o.keepZeroCents !== true) {
      options.minimumFractionDigits = 0;
      options.maximumFractionDigits = 0;
    }
    try {
      return fmt(Intl.NumberFormat, formatLocale(o), options).format(x);
    } catch (e) {
      return code + ' ' + formatNumber(x);
    }
  }

  function formatList(items, opts) {
    const o = opts || {};
    const list = (items || []).filter((x) => x != null && x !== '').map(String);
    if (typeof Intl.ListFormat !== 'function') return list.join(', ');
    return fmt(Intl.ListFormat, formatLocale(o), { style: o.style || 'long', type: o.type || 'conjunction' }).format(list);
  }

  function formatUnit(value, unit, opts) {
    const o = opts || {};
    try {
      return fmt(Intl.NumberFormat, formatLocale(o), {
        style: 'unit',
        unit,
        unitDisplay: o.unitDisplay || 'short',
        maximumFractionDigits: o.maximumFractionDigits != null ? o.maximumFractionDigits : 1,
      }).format(num(value));
    } catch (e) {
      return formatNumber(value) + ' ' + unit;
    }
  }

  /** Distance by region: metric (m / km), imperial or UK (ft / mi). */
  function formatDistance(meters, opts) {
    const o = opts || {};
    const p = regionPrefs();
    const system = o.system || (p && p.measurement) || 'metric';
    const m = num(meters);
    if (system === 'imperial' || system === 'uk') {
      const miles = m / 1609.344;
      if (miles < 0.1) return formatUnit(Math.round(m * 3.28084), 'foot', Object.assign({ maximumFractionDigits: 0 }, o));
      return formatUnit(miles, 'mile', o);
    }
    if (m < 1000) return formatUnit(Math.round(m), 'meter', Object.assign({ maximumFractionDigits: 0 }, o));
    return formatUnit(m / 1000, 'kilometer', o);
  }

  /** Clock-style duration for games / music: 0:07, 3:45, 1:02:03 (locale digits). */
  function formatDuration(seconds, opts) {
    const o = opts || {};
    let s = Math.max(0, Math.floor(num(seconds)));
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    const m = Math.floor(s / 60);
    s -= m * 60;
    const locale = formatLocale(o);
    const n1 = fmt(Intl.NumberFormat, locale, { useGrouping: false });
    const n2 = fmt(Intl.NumberFormat, locale, { minimumIntegerDigits: 2, useGrouping: false });
    return h ? `${n1.format(h)}:${n2.format(m)}:${n2.format(s)}` : `${n1.format(m)}:${n2.format(s)}`;
  }

  const api = {
    formatLocale,
    baseLocale,
    localeUsesNativeDigits,
    getDigitsPref,
    setDigitsPref,
    toDate,
    formatDate,
    formatTime,
    formatRelative,
    formatNumber,
    formatCompact,
    formatPercent,
    formatCurrency,
    formatList,
    formatUnit,
    formatDistance,
    formatDuration,
  };
  window.ChaupaalFormat = api;
  Object.keys(api).forEach((k) => {
    if (k.startsWith('format')) window[k] = api[k];
  });
  // A new language or region changes every format.
  ['chaupaal:lang-changed', 'chaupaal:region-changed'].forEach((ev) => {
    try {
      document.addEventListener(ev, () => cache.clear());
    } catch (e) {}
  });
})();
