/**
 * Peepal icebreakers — static prompt bank + answer helpers.
 * Answers live on digitalProfile.icebreakers (max 3) and sync via profile.icebreakers.
 */
(function () {
  const MAX_ANSWERS = 3;
  const STORAGE_DISMISS = 'chaupaal_icebreaker_banner_dismissed';

  /** @type {{id:string,category:string,text:string,heavy?:boolean}[]} */
  const ICEBREAKER_PROMPTS = [
    // Philosophical / deep (1–4)
    { id: 'ib01', category: 'deep', text: t('profile.what_s_something_you_believe_that') },
    { id: 'ib02', category: 'deep', text: t('profile.if_you_could_give_your_younger') },
    { id: 'ib03', category: 'deep', text: t('profile.what_question_do_you_wish_people') },
    { id: 'ib04', category: 'deep', text: t('profile.what_s_a_value_you_ll') },
    // Fun / light (5–9)
    { id: 'ib05', category: 'fun', text: t('profile.tea_or_coffee_and_defend_your') },
    { id: 'ib06', category: 'fun', text: t('profile.what_s_your_most_irrational_but') },
    { id: 'ib07', category: 'fun', text: t('profile.which_comfort_food_could_you_happily') },
    { id: 'ib08', category: 'fun', text: t('profile.what_s_a_song_that_always') },
    { id: 'ib09', category: 'fun', text: t('profile.pineapple_on_pizza_yes_no_or') },
    // Personal / reflective (10–13) — ib12 is heavy, held from early suggestions
    { id: 'ib10', category: 'reflective', text: t('profile.what_s_a_small_thing_that') },
    { id: 'ib11', category: 'reflective', text: t('profile.what_s_a_habit_you_re') },
    {
      id: 'ib12',
      category: 'reflective',
      text: t('profile.who_s_someone_who_changed_how'),
      heavy: true,
    },
    { id: 'ib13', category: 'reflective', text: t('profile.what_s_a_place_that_feels') },
    // Chaupaal / India / community (14–18) — weighted first in suggestions
    { id: 'ib14', category: 'local', text: t('profile.what_s_your_go_to_order') },
    {
      id: 'ib15',
      category: 'local',
      text: t('profile.if_friends_landed_in_your_city'),
    },
    {
      id: 'ib16',
      category: 'local',
      text: t('profile.which_indian_festival_hits_different_for'),
    },
    {
      id: 'ib17',
      category: 'local',
      text: t('profile.what_s_a_local_slang_word'),
    },
    { id: 'ib18', category: 'local', text: t('profile.train_journey_or_road_trip_and') },
    // Extras (19–20)
    { id: 'ib19', category: 'extra', text: t('profile.what_s_something_you_re_learning') },
    { id: 'ib20', category: 'extra', text: t('profile.what_s_a_compliment_you_still') },
  ];

  const CELEBRATION_LINES = /* i18n-copy */ [
    t('profile.nice_answer_that_s_exactly_the'),
    t('profile.answered_someone_matching_with_you_just'),
    t('profile.love_that_peepal_matches_will_have'),
    t('profile.saved_way_better_than_starting_with'),
  ];

  function getPromptById(id) {
    const bank = ICEBREAKER_PROMPTS.find((p) => p.id === id);
    if (bank) return bank;
    return null;
  }

  /** Resolve bank prompt OR a personal custom question stored on the answer. */
  function resolvePromptForAnswer(a) {
    if (!a) return null;
    const bank = getPromptById(a.promptId);
    if (bank) return bank;
    const customQ = String(a.customQuestion || '').trim();
    if (customQ || String(a.promptId || '').startsWith('custom_')) {
      return {
        id: a.promptId,
        category: 'custom',
        text: customQ || t('profile.custom_question'),
        custom: true,
      };
    }
    return null;
  }

  function getMyIcebreakers() {
    const dp = typeof digitalProfile !== 'undefined' ? digitalProfile : null;
    const list = Array.isArray(dp?.icebreakers) ? dp.icebreakers : [];
    return normalizeAnswers(list);
  }

  function answeredIds(answers = getMyIcebreakers()) {
    return new Set(answers.map((a) => a.promptId));
  }

  /**
   * Weighted suggestion: local first, then fun/reflective/deep/extra.
   * Heavy #12 (ib12) only after user has ≥1 lighter answer.
   */
  function suggestIcebreakerPrompt(answers = getMyIcebreakers()) {
    const taken = answeredIds(answers);
    const unlockedHeavy = answers.length >= 1;
    const pool = ICEBREAKER_PROMPTS.filter((p) => {
      if (taken.has(p.id)) return false;
      if (p.heavy && !unlockedHeavy) return false;
      return true;
    });
    if (!pool.length) return null;
    const local = pool.filter((p) => p.category === 'local');
    const rest = pool.filter((p) => p.category !== 'local');
    // ~65% chance to pick local when available
    if (local.length && (Math.random() < 0.65 || !rest.length)) {
      return local[Math.floor(Math.random() * local.length)];
    }
    const lightFirst = rest.filter((p) => p.category === 'fun' || p.category === 'reflective' || p.category === 'extra');
    const deep = rest.filter((p) => p.category === 'deep');
    const tier = lightFirst.length && Math.random() < 0.7 ? lightFirst : rest.length ? rest : deep;
    const use = tier.length ? tier : pool;
    return use[Math.floor(Math.random() * use.length)];
  }

  function normalizeAnswers(list) {
    return (Array.isArray(list) ? list : [])
      .filter((a) => a && a.promptId && String(a.answer || '').trim())
      .map((a) => {
        const out = {
          promptId: a.promptId,
          answer: String(a.answer).trim().slice(0, 280),
          answeredAt: a.answeredAt || Date.now(),
        };
        const cq = String(a.customQuestion || '').trim().slice(0, 200);
        if (cq || String(a.promptId).startsWith('custom_')) {
          out.customQuestion = cq;
        }
        return out;
      })
      .filter((a) => {
        if (String(a.promptId).startsWith('custom_')) return !!a.customQuestion;
        return true;
      })
      .slice(0, MAX_ANSWERS);
  }

  function persistIcebreakers(saved) {
    if (typeof digitalProfile !== 'undefined') digitalProfile.icebreakers = saved;
    try {
      if (typeof digitalProfile !== 'undefined') {
        localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
      }
    } catch (e) {}
    if (typeof db !== 'undefined' && db && typeof currentUser !== 'undefined' && currentUser) {
      db.collection('users')
        .doc(currentUser.uid)
        .update({ 'profile.icebreakers': saved, icebreakers: saved })
        .catch(() => {});
    }
    if (typeof refreshProfileCompletionUI === 'function') refreshProfileCompletionUI();
  }

  function saveIcebreakerAnswer(promptId, answerText, opts = {}) {
    const customQuestion = String(opts.customQuestion || '').trim().slice(0, 200);
    let prompt = getPromptById(promptId);
    if (!prompt && customQuestion) {
      prompt = { id: promptId, category: 'custom', text: customQuestion, custom: true };
    }
    if (!prompt && String(promptId).startsWith('custom_')) {
      const existing = getMyIcebreakers().find((a) => a.promptId === promptId);
      if (existing?.customQuestion) {
        prompt = { id: promptId, category: 'custom', text: existing.customQuestion, custom: true };
      }
    }
    if (!prompt) return { ok: false, error: 'unknown_prompt' };
    const text = String(answerText || '').trim().slice(0, 280);
    if (!text) return { ok: false, error: 'empty' };

    const prev = normalizeAnswers(typeof digitalProfile !== 'undefined' ? digitalProfile.icebreakers : []);
    if (prev.length >= MAX_ANSWERS && !prev.find((a) => a.promptId === promptId)) {
      return { ok: false, error: 'limit' };
    }

    const next = prev.filter((a) => a.promptId !== promptId);
    const entry = { promptId, answer: text, answeredAt: Date.now() };
    if (prompt.custom || customQuestion) {
      entry.customQuestion = customQuestion || prompt.text;
    }
    next.unshift(entry);
    const saved = next.slice(0, MAX_ANSWERS);
    persistIcebreakers(saved);
    celebrateIcebreakerAnswer(prompt);
    return { ok: true, answers: saved };
  }

  /**
   * Personal-only custom icebreaker — NOT added to the shared 20-prompt bank.
   * Future: community prompt pool could harvest popular customs; out of scope for now.
   */
  function saveCustomIcebreaker(questionText, answerText) {
    const q = String(questionText || '').trim().slice(0, 200);
    const a = String(answerText || '').trim().slice(0, 280);
    if (!q) return { ok: false, error: 'empty_question' };
    if (!a) return { ok: false, error: 'empty' };
    const promptId = 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return saveIcebreakerAnswer(promptId, a, { customQuestion: q });
  }

  function removeIcebreakerAnswer(promptId) {
    const prev = normalizeAnswers(typeof digitalProfile !== 'undefined' ? digitalProfile.icebreakers : []);
    const saved = prev.filter((a) => a.promptId !== promptId);
    persistIcebreakers(saved);
    return saved;
  }

  function celebrateIcebreakerAnswer() {
    if (typeof SoundLib !== 'undefined' && SoundLib.sectionComplete) SoundLib.sectionComplete();
    if (typeof launchConfetti === 'function') launchConfetti({ x: 50, y: 42 }, 26);
    if (typeof haptic === 'function') haptic('success');
    const line = CELEBRATION_LINES[Math.floor(Math.random() * CELEBRATION_LINES.length)];
    if (typeof showRewardToast === 'function') {
      showRewardToast({
        title: t('profile.icebreaker'),
        line,
        unlockHint: t('profile.matches_on_peepal_get_a_warmer'),
        durationMs: 2800,
      });
    } else if (typeof showToast === 'function') {
      showToast(line);
    }
  }

  function hydrateIcebreakersFromUserDoc(docData) {
    if (!docData || typeof digitalProfile === 'undefined') return;
    const list = Array.isArray(docData.icebreakers)
      ? normalizeAnswers(docData.icebreakers)
      : normalizeAnswers(docData.profile?.icebreakers);
    if (!list.length) return;
    const local = normalizeAnswers(digitalProfile.icebreakers);
    // Prefer richer remote set when local is empty or shorter
    if (list.length >= local.length) {
      digitalProfile.icebreakers = list;
      try {
        localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
      } catch (e) {}
    }
  }

  function pickSnippet(answers) {
    ensureIcebreakerStyles();
    const list = normalizeAnswers(answers);
    if (!list.length) return null;
    // Prefer local category for display
    const enriched = list
      .map((a) => ({ ...a, prompt: resolvePromptForAnswer(a) }))
      .filter((a) => a.prompt);
    const local = enriched.filter((a) => a.prompt.category === 'local');
    const pick = (local.length ? local : enriched)[Math.floor(Math.random() * (local.length ? local.length : enriched.length))];
    if (!pick) return null;
    const ans = pick.answer.length > 72 ? pick.answer.slice(0, 70) + '…' : pick.answer;
    return { promptId: pick.promptId, question: pick.prompt.text, answer: ans, fullAnswer: pick.answer, category: pick.prompt.category, custom: !!pick.prompt.custom };
  }

  function resolveIcebreakersFromUser(user) {
    if (!user) return [];
    if (Array.isArray(user.icebreakers)) return normalizeAnswers(user.icebreakers);
    if (Array.isArray(user.profile?.icebreakers)) return normalizeAnswers(user.profile.icebreakers);
    return [];
  }

  /**
   * Build chat opening banner model for two people.
   * Prefer shared theme (esp. local); else show both sides' answers.
   */
  function buildConversationStarter(myAnswers, theirAnswers, theirName) {
    const mine = normalizeAnswers(myAnswers)
      .map((a) => ({ ...a, prompt: resolvePromptForAnswer(a) }))
      .filter((a) => a.prompt);
    const theirs = normalizeAnswers(theirAnswers)
      .map((a) => ({ ...a, prompt: resolvePromptForAnswer(a) }))
      .filter((a) => a.prompt);

    if (!theirs.length && !mine.length) return null;

    // Shared category, prefer local
    const myCats = new Set(mine.map((a) => a.prompt.category));
    const sharedCats = [...new Set(theirs.map((a) => a.prompt.category).filter((c) => myCats.has(c)))];
    const preferOrder = ['local', 'fun', 'reflective', 'deep', 'extra'];
    sharedCats.sort((a, b) => preferOrder.indexOf(a) - preferOrder.indexOf(b));

    if (sharedCats.length && mine.length && theirs.length) {
      const cat = sharedCats[0];
      const theirPick = theirs.find((a) => a.prompt.category === cat) || theirs[0];
      const myPick = mine.find((a) => a.prompt.category === cat) || mine[0];
      const themeLabel =
        cat === 'local'
          ? t('profile.you_both_answered_an_india_local')
          : cat === 'fun'
            ? t('profile.you_both_answered_something_fun')
            : cat === 'deep'
              ? t('profile.you_both_went_a_bit_deep')
              : t('profile.you_both_answered_a_similar_kind');
      return {
        mode: 'shared',
        themeLabel,
        their: theirPick,
        mine: myPick,
        theirName: theirName || 'them',
      };
    }

    if (theirs.length && mine.length) {
      return {
        mode: 'both',
        their: theirs[0],
        mine: mine[0],
        theirName: theirName || 'them',
      };
    }

    if (theirs.length) {
      return { mode: 'theirs', their: theirs[0], theirName: theirName || 'them' };
    }
    return { mode: 'mine', mine: mine[0], theirName: theirName || 'them' };
  }

  function isBannerDismissed(chatId) {
    try {
      const map = JSON.parse(localStorage.getItem(STORAGE_DISMISS) || '{}');
      return !!map[chatId];
    } catch {
      return false;
    }
  }

  function dismissBanner(chatId) {
    try {
      const map = JSON.parse(localStorage.getItem(STORAGE_DISMISS) || '{}');
      map[chatId] = Date.now();
      localStorage.setItem(STORAGE_DISMISS, JSON.stringify(map));
    } catch (e) {}
  }

  function renderStarterBannerHtml(starter, opts = {}) {
    if (!starter) return '';
    const esc = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
    const reportBtn = opts.showReport
      ? `<button type="button" class="icebreaker-banner-report" id="icebreakerBannerReport">${tHtml('profile.report_this_question')}</button>`
      : '';
    if (starter.mode === 'shared') {
      return `
        <div class="icebreaker-chat-banner" id="icebreakerChatBanner">
          <button type="button" class="icebreaker-banner-dismiss" id="icebreakerBannerDismiss" aria-label="${tHtml('profile.dismiss')}">✕</button>
          <div class="icebreaker-banner-kicker">${esc(starter.themeLabel)}</div>
          <div class="icebreaker-banner-ask">${tHtml('profile.ask_them_about')}</div>
          <div class="icebreaker-banner-q">${esc(starter.their.prompt.text)}</div>
          <div class="icebreaker-banner-a">${tHtml('profile.quoted_answer', { answer: starter.their.answer })}</div>
          <div class="icebreaker-banner-you">${tHtml('profile.you_wrote_answer', { answer: starter.mine.answer })}</div>
          ${reportBtn}
        </div>`;
    }
    if (starter.mode === 'both') {
      return `
        <div class="icebreaker-chat-banner" id="icebreakerChatBanner">
          <button type="button" class="icebreaker-banner-dismiss" id="icebreakerBannerDismiss" aria-label="${tHtml('profile.dismiss')}">✕</button>
          <div class="icebreaker-banner-kicker">${tHtml('profile.conversation_starters')}</div>
          <div class="icebreaker-banner-ask">${tHtml('profile.ask_them_about')}</div>
          <div class="icebreaker-banner-q">${esc(starter.their.prompt.text)}</div>
          <div class="icebreaker-banner-a">"${esc(starter.their.answer)}"</div>
          <div class="icebreaker-banner-you"><strong style="font-weight:700;color:var(--ink);">${tHtml('profile.your_answer')}</strong> · ${esc(starter.mine.prompt.text)}<br>"${esc(starter.mine.answer)}"</div>
          ${reportBtn}
        </div>`;
    }
    if (starter.mode === 'theirs') {
      return `
        <div class="icebreaker-chat-banner" id="icebreakerChatBanner">
          <button type="button" class="icebreaker-banner-dismiss" id="icebreakerBannerDismiss" aria-label="${tHtml('profile.dismiss')}">✕</button>
          <div class="icebreaker-banner-ask">${tHtml('profile.ask_them_about')}</div>
          <div class="icebreaker-banner-q">${esc(starter.their.prompt.text)}</div>
          <div class="icebreaker-banner-a">"${esc(starter.their.answer)}"</div>
          ${reportBtn}
        </div>`;
    }
    return `
      <div class="icebreaker-chat-banner" id="icebreakerChatBanner">
        <button type="button" class="icebreaker-banner-dismiss" id="icebreakerBannerDismiss" aria-label="${tHtml('profile.dismiss')}">✕</button>
        <div class="icebreaker-banner-kicker">${tHtml('profile.your_icebreaker_they_can_ask_you')}</div>
        <div class="icebreaker-banner-q">${esc(starter.mine.prompt.text)}</div>
        <div class="icebreaker-banner-a">"${esc(starter.mine.answer)}"</div>
      </div>`;
  }

  function ensureIcebreakerStyles() {
    if (document.getElementById('icebreakerStyles')) return;
    const s = document.createElement('style');
    s.id = 'icebreakerStyles';
    s.textContent = `
      .icebreaker-profile-block{margin:18px 0 8px;padding-top:14px;border-top:1px solid var(--line);}
      .icebreaker-profile-block h4{font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;margin:0 0 4px;}
      .icebreaker-hint{font-size:11px;color:var(--muted);margin-bottom:10px;}
      .icebreaker-suggest{background:var(--cream);border:1.5px solid var(--line);border-radius:14px;padding:12px;margin-bottom:10px;}
      .icebreaker-suggest-q{font-size:13px;font-weight:600;line-height:1.4;margin-bottom:8px;}
      .icebreaker-answer-input{width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:13px;font-family:Inter,sans-serif;resize:none;min-height:64px;outline:none;background:var(--white);}
      .icebreaker-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;}
      .icebreaker-btn{padding:8px 12px;border-radius:10px;border:none;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;}
      .icebreaker-btn-primary{background:var(--red);color:#fff;}
      .icebreaker-btn-ghost{background:var(--white);border:2px solid var(--line);color:var(--ink);}
      .icebreaker-saved{margin-top:10px;display:flex;flex-direction:column;gap:8px;}
      .icebreaker-saved-item{background:var(--white);border:1px solid var(--line);border-radius:12px;padding:10px 12px;}
      .icebreaker-saved-q{font-size:11px;color:var(--muted);margin-bottom:4px;}
      .icebreaker-saved-a{font-size:13px;line-height:1.4;}
      .icebreaker-saved-rm{background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;padding:0;margin-top:6px;margin-right:10px;}
      .icebreaker-saved-flag{background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;padding:0;margin-top:6px;}
      .icebreaker-custom-panel{margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);}
      .icebreaker-custom-q{width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:13px;font-family:Inter,sans-serif;margin-bottom:8px;outline:none;background:var(--white);}
      .icebreaker-banner-report{margin-top:8px;background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;padding:0;text-decoration:underline;}
      .discovery-icebreaker{margin:4px 0 0;padding:0;border:none;background:none;}
      .discovery-icebreaker-label{font-size:9px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--muted);opacity:0.85;margin-bottom:1px;}
      .discovery-icebreaker-text{font-size:11px;color:var(--muted);line-height:1.35;font-style:italic;opacity:0.9;}
      .icebreaker-chat-banner{position:relative;margin:0;padding:10px 32px 10px 12px;background:linear-gradient(180deg,rgba(230,57,70,0.08),rgba(230,57,70,0.02));border-bottom:1px solid var(--line);flex-shrink:0;}
      .icebreaker-banner-dismiss{position:absolute;top:8px;right:8px;border:none;background:none;font-size:14px;color:var(--muted);cursor:pointer;}
      .icebreaker-banner-kicker{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted);margin-bottom:4px;}
      .icebreaker-banner-ask{font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;margin-bottom:4px;}
      .icebreaker-banner-q{font-size:12px;color:var(--muted);margin-bottom:4px;line-height:1.35;}
      .icebreaker-banner-a{font-size:13px;line-height:1.4;}
      .icebreaker-banner-you{font-size:11px;color:var(--muted);margin-top:6px;line-height:1.35;}
      .icebreaker-browse{max-height:220px;overflow:auto;margin-top:8px;border:1px solid var(--line);border-radius:12px;padding:6px;}
      .icebreaker-browse-item{display:block;width:100%;text-align:left;padding:8px 10px;border:none;background:none;border-bottom:1px solid var(--line);font-size:12px;cursor:pointer;line-height:1.35;}
      .icebreaker-browse-item:last-child{border-bottom:none;}
      .icebreaker-browse-cat{font-size:10px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:0.04em;}
    `;
    document.head.appendChild(s);
  }

  function renderProfileIcebreakerBlock() {
    ensureIcebreakerStyles();
    const answers = getMyIcebreakers();
    const suggest = answers.length < MAX_ANSWERS ? suggestIcebreakerPrompt(answers) : null;
    const remaining = MAX_ANSWERS - answers.length;

    return `
      <div class="icebreaker-profile-block" id="icebreakerProfileBlock">
        <h4>${tHtml('profile.icebreakers')}</h4>
        <div class="icebreaker-hint">${tHtml('profile.icebreakers_hint', { count: MAX_ANSWERS })}</div>
        ${
          suggest
            ? `<div class="icebreaker-suggest" data-prompt-id="${suggest.id}">
            <div class="icebreaker-suggest-q">${suggest.text}</div>
            <textarea class="icebreaker-answer-input" id="icebreakerAnswerInput" maxlength="280" placeholder="${tHtml('profile.short_answer')}"></textarea>
            <div class="icebreaker-actions">
              <button type="button" class="icebreaker-btn icebreaker-btn-primary" id="icebreakerSaveBtn">${tHtml('profile.save_answer')}</button>
              <button type="button" class="icebreaker-btn icebreaker-btn-ghost" id="icebreakerShuffleBtn">${tHtml('profile.another_prompt')}</button>
              <button type="button" class="icebreaker-btn icebreaker-btn-ghost" id="icebreakerBrowseBtn">${tHtml('profile.browse_all')}</button>
              <button type="button" class="icebreaker-btn icebreaker-btn-ghost" id="icebreakerWriteOwnBtn">${tHtml('profile.write_your_own')}</button>
            </div>
            <div id="icebreakerBrowsePanel" class="icebreaker-browse" hidden></div>
            <div id="icebreakerCustomPanel" class="icebreaker-custom-panel" hidden>
              <input type="text" class="icebreaker-custom-q" id="icebreakerCustomQuestion" maxlength="200" placeholder="${tHtml('profile.your_question')}">
              <textarea class="icebreaker-answer-input" id="icebreakerCustomAnswer" maxlength="280" placeholder="${tHtml('profile.your_answer_2')}"></textarea>
              <div class="icebreaker-actions">
                <button type="button" class="icebreaker-btn icebreaker-btn-primary" id="icebreakerCustomSaveBtn">${tHtml('profile.save_my_question')}</button>
                <button type="button" class="icebreaker-btn icebreaker-btn-ghost" id="icebreakerCustomCancelBtn">${tHtml('common.cancel')}</button>
              </div>
            </div>
          </div>`
            : `<div class="icebreaker-hint">${remaining <= 0 ? tHtml('profile.you_ve_filled_3_remove_one') : ''}</div>`
        }
        <div class="icebreaker-saved" id="icebreakerSavedList">
          ${answers
            .map((a) => {
              const p = resolvePromptForAnswer(a);
              const isCustom = !!(p?.custom || a.customQuestion);
              return `<div class="icebreaker-saved-item" data-id="${a.promptId}">
                <div class="icebreaker-saved-q">${isCustom ? tHtml('profile.your_question_2') : ''}${p ? p.text : a.promptId}</div>
                <div class="icebreaker-saved-a">${a.answer}</div>
                <button type="button" class="icebreaker-saved-rm" data-rm="${a.promptId}">${tHtml('profile.exclusion_remove')}</button>
                ${isCustom ? `<button type="button" class="icebreaker-saved-flag" data-flag="${a.promptId}" data-q="${String(a.customQuestion || p?.text || '').replace(/"/g, '&quot;')}">${tHtml('profile.flag')}</button>` : ''}
              </div>`;
            })
            .join('')}
        </div>
      </div>`;
  }

  function wireProfileIcebreakerBlock(root) {
    const block = root?.querySelector?.('#icebreakerProfileBlock') || document.getElementById('icebreakerProfileBlock');
    if (!block || block.dataset.wired) return;
    block.dataset.wired = '1';

    const suggestBox = block.querySelector('.icebreaker-suggest');
    const saveBtn = block.querySelector('#icebreakerSaveBtn');
    const shuffleBtn = block.querySelector('#icebreakerShuffleBtn');
    const browseBtn = block.querySelector('#icebreakerBrowseBtn');
    const browsePanel = block.querySelector('#icebreakerBrowsePanel');
    const writeOwnBtn = block.querySelector('#icebreakerWriteOwnBtn');
    const customPanel = block.querySelector('#icebreakerCustomPanel');
    const input = block.querySelector('#icebreakerAnswerInput');

    function refresh() {
      const parent = block.parentElement;
      if (!parent) return;
      block.outerHTML = renderProfileIcebreakerBlock();
      wireProfileIcebreakerBlock(parent);
    }

    saveBtn?.addEventListener('click', () => {
      const pid = suggestBox?.dataset.promptId;
      const res = saveIcebreakerAnswer(pid, input?.value);
      if (!res.ok) {
        if (res.error === 'limit') showToast?.(t('profile.max_3_icebreakers_remove_one_first'));
        else if (res.error === 'empty') showToast?.(t('profile.write_a_short_answer_first'));
        return;
      }
      refresh();
    });

    shuffleBtn?.addEventListener('click', () => {
      const next = suggestIcebreakerPrompt(getMyIcebreakers());
      if (!next || !suggestBox) return;
      suggestBox.dataset.promptId = next.id;
      suggestBox.querySelector('.icebreaker-suggest-q').textContent = next.text;
      if (input) input.value = '';
      if (customPanel) customPanel.hidden = true;
    });

    browseBtn?.addEventListener('click', () => {
      if (!browsePanel) return;
      if (customPanel) customPanel.hidden = true;
      const taken = answeredIds();
      const unlockedHeavy = getMyIcebreakers().length >= 1;
      browsePanel.hidden = !browsePanel.hidden;
      if (browsePanel.hidden) return;
      const cats = { local: t('profile.india_local'), fun: t('profile.cat_fun'), reflective: t('profile.cat_reflective'), deep: t('profile.cat_deep'), extra: t('profile.cat_extra') };
      browsePanel.innerHTML = ICEBREAKER_PROMPTS.filter((p) => !taken.has(p.id) && !(p.heavy && !unlockedHeavy))
        .map(
          (p) =>
            `<button type="button" class="icebreaker-browse-item" data-pick="${p.id}"><div class="icebreaker-browse-cat">${cats[p.category] || p.category}</div>${p.text}</button>`
        )
        .join('');
      browsePanel.querySelectorAll('[data-pick]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const p = getPromptById(btn.dataset.pick);
          if (!p || !suggestBox) return;
          suggestBox.dataset.promptId = p.id;
          suggestBox.querySelector('.icebreaker-suggest-q').textContent = p.text;
          browsePanel.hidden = true;
          if (input) {
            input.value = '';
            input.focus();
          }
        });
      });
    });

    writeOwnBtn?.addEventListener('click', () => {
      if (!customPanel) return;
      if (browsePanel) browsePanel.hidden = true;
      customPanel.hidden = !customPanel.hidden;
      if (!customPanel.hidden) {
        customPanel.querySelector('#icebreakerCustomQuestion')?.focus();
      }
    });

    block.querySelector('#icebreakerCustomCancelBtn')?.addEventListener('click', () => {
      if (customPanel) customPanel.hidden = true;
    });

    block.querySelector('#icebreakerCustomSaveBtn')?.addEventListener('click', () => {
      const q = block.querySelector('#icebreakerCustomQuestion')?.value;
      const a = block.querySelector('#icebreakerCustomAnswer')?.value;
      const res = saveCustomIcebreaker(q, a);
      if (!res.ok) {
        if (res.error === 'limit') showToast?.(t('profile.max_3_icebreakers_remove_one_first'));
        else if (res.error === 'empty_question') showToast?.(t('profile.write_your_question_first'));
        else if (res.error === 'empty') showToast?.(t('profile.write_a_short_answer_first'));
        return;
      }
      refresh();
    });

    block.querySelectorAll('[data-rm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeIcebreakerAnswer(btn.dataset.rm);
        refresh();
      });
    });

    block.querySelectorAll('[data-flag]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.q || '';
        if (typeof openFlagSheet === 'function') {
          openFlagSheet(
            { uid: currentUser?.uid || 'self', name: 'Custom icebreaker' },
            {
              targetType: 'icebreaker_custom',
              postId: btn.dataset.flag,
              icebreakerQuestion: q,
            }
          );
        } else {
          showToast?.(t('profile.report_unavailable'));
        }
      });
    });
  }

  function reportCustomIcebreakerFromChat(chat, answer) {
    if (!answer?.prompt?.custom && !answer?.customQuestion) return;
    if (typeof openFlagSheet !== 'function') return;
    openFlagSheet(
      { uid: chat.uid || chat.otherUid || 'unknown', name: chat.name || 'User' },
      {
        targetType: 'icebreaker_custom',
        postId: answer.promptId,
        icebreakerQuestion: answer.customQuestion || answer.prompt?.text || '',
      }
    );
  }

  function mountIcebreakerBanner(screen, chat) {
    if (!screen || chat?.type === 'group' || chat?.type === 'self') return;
    const chatId = chat.firestoreId || chat.id;
    if (!chatId || isBannerDismissed(chatId)) return;

    const theirAnswers =
      chat.icebreakers ||
      (typeof resolveIcebreakersFromUser === 'function' ? resolveIcebreakersFromUser({ icebreakers: chat.theirIcebreakers }) : []) ||
      [];
    const starter = buildConversationStarter(getMyIcebreakers(), theirAnswers, chat.name);
    if (!starter) return;

    ensureIcebreakerStyles();
    const theirCustom = starter.their && (starter.their.prompt?.custom || starter.their.customQuestion);
    const html = renderStarterBannerHtml(starter, { showReport: !!theirCustom });
    const header = screen.querySelector('.chat-screen-header');
    if (!header) return;
    header.insertAdjacentHTML('afterend', html);
    screen.querySelector('#icebreakerBannerDismiss')?.addEventListener('click', () => {
      dismissBanner(chatId);
      screen.querySelector('#icebreakerChatBanner')?.remove();
    });
    screen.querySelector('#icebreakerBannerReport')?.addEventListener('click', () => {
      reportCustomIcebreakerFromChat(chat, starter.their);
    });
  }

  window.ICEBREAKER_PROMPTS = ICEBREAKER_PROMPTS;
  window.getIcebreakerPromptById = getPromptById;
  window.suggestIcebreakerPrompt = suggestIcebreakerPrompt;
  window.getMyIcebreakers = getMyIcebreakers;
  window.saveIcebreakerAnswer = saveIcebreakerAnswer;
  window.saveCustomIcebreaker = saveCustomIcebreaker;
  window.removeIcebreakerAnswer = removeIcebreakerAnswer;
  window.pickIcebreakerSnippet = pickSnippet;
  window.resolveIcebreakersFromUser = resolveIcebreakersFromUser;
  window.resolvePromptForAnswer = resolvePromptForAnswer;
  window.buildConversationStarter = buildConversationStarter;
  window.renderProfileIcebreakerBlock = renderProfileIcebreakerBlock;
  window.wireProfileIcebreakerBlock = wireProfileIcebreakerBlock;
  window.mountIcebreakerBanner = mountIcebreakerBanner;
  window.hydrateIcebreakersFromUserDoc = hydrateIcebreakersFromUserDoc;
})();
