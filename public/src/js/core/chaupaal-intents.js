/**
 * Chaupaal App Action Registry (client).
 *
 * New feature? Add ChaupaalIntents.register({...}) in your feature's init or
 * chaupaal-intents-manifest.js — no chaupaal-chat edits required.
 */
(function () {
  'use strict';

  const intents = new Map();

  const CATEGORY_LABELS = {
    navigate: t('khoj.get_around'),
    create: t('khoj.cat_create'),
    social: t('khoj.cat_people'),
    profile: t('khoj.profile_account'),
    help: t('khoj.cat_tools'),
  };

  function compilePhrase(p) {
    if (p instanceof RegExp) return p;
    try {
      return new RegExp(p, 'i');
    } catch {
      return null;
    }
  }

  const SN = typeof SearchNormalize !== 'undefined' ? SearchNormalize : null;
  const fold = (s) => (SN ? SN.fold(s) : String(s == null ? '' : s).toLowerCase().trim());
  const expand = (s) => (SN ? SN.expand(s) : fold(s));

  /** Keywords are { [lang]: [...] }; a bare array (older registrations) is English. */
  function keywordMap(k) {
    if (Array.isArray(k)) return { en: k.filter(Boolean) };
    return k && typeof k === 'object' ? k : { en: [] };
  }

  /** UI language first, then English, then the user's "Languages I read". */
  function searchLangs() {
    const ui = typeof currentLang !== 'undefined' && typeof normalizeLang === 'function' ? normalizeLang(currentLang) : 'en';
    const read = typeof getContentLangs === 'function' ? getContentLangs() : [];
    return [...new Set([ui, 'en', ...read])];
  }

  /** Short Latin keywords ("dm", "gk") must match a whole word; everything else (incl. CJK) is a substring. */
  function keywordHit(hay, k) {
    if (!k) return false;
    if (/^[a-z0-9]{1,3}$/.test(k)) return new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`).test(hay);
    return hay.includes(k);
  }

  function register(def) {
    if (!def || !def.id) return;
    intents.set(def.id, { ...def, keywords: keywordMap(def.keywords) });
  }

  function list() {
    return [...intents.values()].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  function parse(text, opts) {
    const raw = String(text || '').trim();
    const folded = fold(raw);
    if (!folded) return { matches: [], best: null, confidence: 'low' };
    const hay = expand(raw);
    const langs = (opts && opts.langs) || searchLangs();

    if (/^help$|what can you do/i.test(raw)) {
      const help = intents.get('help.what_can_you_do') || {
        id: 'help.what_can_you_do',
        label: t('khoj.what_can_you_do'),
        category: 'help',
        icon: 'help-circle',
      };
      return {
        matches: [{ ...help, score: 99 }],
        best: { ...help, score: 99 },
        confidence: 'high',
      };
    }

    const scored = [];
    for (const intent of intents.values()) {
      let score = Number(intent.priority) || 50;
      let hit = false;
      const seen = new Set();
      for (const lang of langs) {
        for (const kw of intent.keywords[lang] || []) {
          const k = fold(kw);
          if (!k || seen.has(k)) continue;
          seen.add(k);
          if (keywordHit(hay, k)) {
            score += 12;
            hit = true;
          }
        }
      }
      for (const p of intent.phrases || []) {
        const re = compilePhrase(p);
        if (re && (re.test(raw) || re.test(hay))) {
          score += 45;
          hit = true;
        }
      }
      // The visible (localised) label is a keyword too — people type what they see.
      const label = fold(intent.label);
      const cjk = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(folded);
      const labelHit = cjk ? folded.length >= 2 && label.includes(folded) : folded.length >= 4 && (' ' + label).includes(' ' + folded);
      if (label && folded.length >= (cjk ? 2 : 3) && (label === folded || labelHit)) {
        score += 20;
        hit = true;
      }
      if (hit) {
        scored.push({
          id: intent.id,
          score,
          label: intent.label,
          category: intent.category,
          icon: intent.icon || 'compass',
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const matches = scored.slice(0, 5);
    const best = matches[0] || null;
    const second = matches[1]?.score || 0;
    let confidence = 'low';
    if (best) {
      if (best.score >= 55 && best.score - second >= 10) confidence = 'high';
      else if (best.score >= 28) confidence = 'med';
    }
    return { matches, best, confidence };
  }

  function buildHelpCategories() {
    const byCat = {};
    list().forEach((i) => {
      const c = i.category || 'help';
      if (!byCat[c]) byCat[c] = [];
      byCat[c].push({ id: i.id, label: i.label, icon: i.icon || 'compass' });
    });
    return Object.entries(byCat).map(([name, items]) => ({
      name: CATEGORY_LABELS[name] || name,
      intents: items.slice(0, 12),
    }));
  }

  function buildNavigatorReply(parseResult) {
    const { matches, best, confidence } = parseResult || {};

    if (best?.id === 'help.what_can_you_do') {
      return {
        reply:
          typeof t === 'function'
            ? t('chaupaal_cmd_help_intro', 'I can help you get around Chaupaal — pick something below.')
            : t('common.chaupaal_cmd_help_intro'),
        attachment: { type: 'help_card', categories: buildHelpCategories() },
        navigator: true,
      };
    }

    if (confidence === 'low' || !best) {
      return {
        reply:
          typeof t === 'function'
            ? t(
                'chaupaal_cmd_no_match',
                'I can help you get around Chaupaal — pick something below or describe what you want.'
              )
            : t('common.chaupaal_cmd_no_match'),
        attachment: { type: 'help_card', categories: buildHelpCategories() },
        navigator: true,
      };
    }

    const picks = confidence === 'high' ? [best] : matches.slice(0, 3);
    const intro =
      picks.length === 1
        ? t('khoj.got_it_tap_below', { action: picks[0].label || t('common.continue') })
        : typeof t === 'function'
          ? t('chaupaal_cmd_disambig', 'A few things match — which one did you mean?')
          : t('common.chaupaal_cmd_disambig');

    return {
      reply: intro,
      attachment: {
        type: 'action_card',
        intro,
        actions: picks.map((m, idx) => ({
          id: m.id,
          intentId: m.id,
          label: m.label || intents.get(m.id)?.label || m.id,
          icon: m.icon || intents.get(m.id)?.icon || 'compass',
          primary: idx === 0,
        })),
      },
      navigator: true,
      intents: picks.map((p) => p.id),
    };
  }

  function requireAuth(intent) {
    if (!intent?.requiresAuth) return true;
    const signedIn = typeof currentUser !== 'undefined' && currentUser?.uid;
    if (signedIn) return true;
    if (typeof requireSignIn === 'function') {
      requireSignIn(typeof t === 'function' ? t('auth_sign_in_short', 'Sign in to continue') : t('khoj.sign_in_to_continue'));
    } else if (typeof showAuth === 'function') showAuth();
    else if (typeof showToast === 'function') showToast(t('khoj.sign_in_to_continue'));
    return false;
  }

  function run(id, ctx) {
    const intent = intents.get(id);
    if (!intent) {
      if (typeof showToast === 'function') showToast(t('khoj.that_action_is_not_available_right'));
      return false;
    }
    if (!requireAuth(intent)) return false;
    if (typeof intent.run !== 'function') {
      if (typeof showToast === 'function') showToast(t('khoj.that_action_is_not_wired_yet'));
      return false;
    }
    try {
      intent.run(ctx || {});
      return true;
    } catch (e) {
      console.warn('[ChaupaalIntents]', id, e?.message || e);
      if (typeof showToast === 'function') showToast(t('khoj.could_not_open_that_try_again'));
      return false;
    }
  }

  window.ChaupaalIntents = {
    register,
    parse,
    list,
    run,
    buildNavigatorReply,
    buildHelpCategories,
    searchLangs,
    CATEGORY_LABELS,
  };
})();
