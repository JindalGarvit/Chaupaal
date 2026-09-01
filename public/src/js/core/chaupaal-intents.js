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
    navigate: 'Get around',
    create: 'Create',
    social: 'People',
    profile: 'Profile & account',
    help: 'Tools',
  };

  function compilePhrase(p) {
    if (p instanceof RegExp) return p;
    try {
      return new RegExp(p, 'i');
    } catch {
      return null;
    }
  }

  function register(def) {
    if (!def || !def.id) return;
    intents.set(def.id, { ...def });
  }

  function list() {
    return [...intents.values()].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  function parse(text) {
    const raw = String(text || '').trim();
    const lower = raw.toLowerCase();
    if (!lower) return { matches: [], best: null, confidence: 'low' };

    if (/^help$|what can you do/i.test(raw)) {
      const help = intents.get('help.what_can_you_do') || {
        id: 'help.what_can_you_do',
        label: 'What can you do?',
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
      for (const kw of intent.keywords || []) {
        const k = String(kw).toLowerCase();
        if (k && lower.includes(k)) {
          score += 12;
          hit = true;
        }
      }
      for (const p of intent.phrases || []) {
        const re = compilePhrase(p);
        if (re && re.test(raw)) {
          score += 45;
          hit = true;
        }
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
            : 'I can help you get around Chaupaal — pick something below.',
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
            : 'I can help you get around Chaupaal — pick something below or describe what you want.',
        attachment: { type: 'help_card', categories: buildHelpCategories() },
        navigator: true,
      };
    }

    const picks = confidence === 'high' ? [best] : matches.slice(0, 3);
    const intro =
      picks.length === 1
        ? `Got it — tap below to ${String(picks[0].label || 'continue').toLowerCase()}.`
        : typeof t === 'function'
          ? t('chaupaal_cmd_disambig', 'A few things match — which one did you mean?')
          : 'A few things match — which one did you mean?';

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
      requireSignIn(typeof t === 'function' ? t('auth_sign_in_short', 'Sign in to continue') : 'Sign in to continue');
    } else if (typeof showAuth === 'function') showAuth();
    else if (typeof showToast === 'function') showToast('Sign in to continue');
    return false;
  }

  function run(id, ctx) {
    const intent = intents.get(id);
    if (!intent) {
      if (typeof showToast === 'function') showToast('That action is not available right now.');
      return false;
    }
    if (!requireAuth(intent)) return false;
    if (typeof intent.run !== 'function') {
      if (typeof showToast === 'function') showToast('That action is not wired yet.');
      return false;
    }
    try {
      intent.run(ctx || {});
      return true;
    } catch (e) {
      console.warn('[ChaupaalIntents]', id, e?.message || e);
      if (typeof showToast === 'function') showToast('Could not open that — try again.');
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
    CATEGORY_LABELS,
  };
})();
