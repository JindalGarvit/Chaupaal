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
    { id: 'ib01', category: 'deep', text: "What's something you believe that most people around you don't?" },
    { id: 'ib02', category: 'deep', text: 'If you could give your younger self one sentence, what would it be?' },
    { id: 'ib03', category: 'deep', text: 'What question do you wish people asked you more often?' },
    { id: 'ib04', category: 'deep', text: "What's a value you'll never negotiate on?" },
    // Fun / light (5–9)
    { id: 'ib05', category: 'fun', text: "Tea or coffee — and defend your choice like it's a court case." },
    { id: 'ib06', category: 'fun', text: "What's your most irrational but firm opinion?" },
    { id: 'ib07', category: 'fun', text: 'Which comfort food could you happily eat for a week straight?' },
    { id: 'ib08', category: 'fun', text: "What's a song that always fixes your mood (even a little)?" },
    { id: 'ib09', category: 'fun', text: 'Pineapple on pizza: yes, no, or "it depends on the company"?' },
    // Personal / reflective (10–13) — ib12 is heavy, held from early suggestions
    { id: 'ib10', category: 'reflective', text: "What's a small thing that made you happy this week?" },
    { id: 'ib11', category: 'reflective', text: "What's a habit you're quietly proud of?" },
    {
      id: 'ib12',
      category: 'reflective',
      text: "Who's someone who changed how you see the world — and how?",
      heavy: true,
    },
    { id: 'ib13', category: 'reflective', text: "What's a place that feels like home even if you don't live there?" },
    // Chaupaal / India / community (14–18) — weighted first in suggestions
    { id: 'ib14', category: 'local', text: "What's your go-to order at a chai stall — and why is it correct?" },
    {
      id: 'ib15',
      category: 'local',
      text: 'If friends landed in your city for one evening only, where are you taking them?',
    },
    {
      id: 'ib16',
      category: 'local',
      text: "Which Indian festival hits different for you, and what's the one ritual you love most?",
    },
    {
      id: 'ib17',
      category: 'local',
      text: "What's a local slang word or phrase from your city that outsiders should learn?",
    },
    { id: 'ib18', category: 'local', text: 'Train journey or road trip — and what makes your pick better?' },
    // Extras (19–20)
    { id: 'ib19', category: 'extra', text: "What's something you're learning right now just for fun?" },
    { id: 'ib20', category: 'extra', text: "What's a compliment you still remember years later?" },
  ];

  const CELEBRATION_LINES = [
    "Nice answer — that's exactly the kind of thing that starts a real conversation.",
    'Answered — someone matching with you just got a much better opening line.',
    'Love that. Peepal matches will have something real to talk about.',
    'Saved. Way better than starting with just "hi".',
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
        text: customQ || 'Custom question',
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
        title: 'Icebreaker ✓',
        line,
        unlockHint: 'Matches on Peepal get a warmer way to say hi.',
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
          ? 'You both answered an India / local prompt'
          : cat === 'fun'
            ? 'You both answered something fun'
            : cat === 'deep'
              ? 'You both went a bit deep'
              : 'You both answered a similar kind of prompt';
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
      ? `<button type="button" class="icebreaker-banner-report" id="icebreakerBannerReport">Report this question</button>`
      : '';
    if (starter.mode === 'shared') {
      return `
        <div class="icebreaker-chat-banner" id="icebreakerChatBanner">
          <button type="button" class="icebreaker-banner-dismiss" id="icebreakerBannerDismiss" aria-label="Dismiss">✕</button>
          <div class="icebreaker-banner-kicker">${esc(starter.themeLabel)}</div>
          <div class="icebreaker-banner-ask">Ask them about…</div>
          <div class="icebreaker-banner-q">${esc(starter.their.prompt.text)}</div>
          <div class="icebreaker-banner-a">"${esc(starter.their.answer)}"</div>
          <div class="icebreaker-banner-you">You wrote: "${esc(starter.mine.answer)}"</div>
          ${reportBtn}
        </div>`;
    }
    if (starter.mode === 'both') {
      return `
        <div class="icebreaker-chat-banner" id="icebreakerChatBanner">
          <button type="button" class="icebreaker-banner-dismiss" id="icebreakerBannerDismiss" aria-label="Dismiss">✕</button>
          <div class="icebreaker-banner-kicker">Conversation starters</div>
          <div class="icebreaker-banner-ask">Ask them about…</div>
          <div class="icebreaker-banner-q">${esc(starter.their.prompt.text)}</div>
          <div class="icebreaker-banner-a">"${esc(starter.their.answer)}"</div>
          <div class="icebreaker-banner-you"><strong style="font-weight:700;color:var(--ink);">Your answer</strong> · ${esc(starter.mine.prompt.text)}<br>"${esc(starter.mine.answer)}"</div>
          ${reportBtn}
        </div>`;
    }
    if (starter.mode === 'theirs') {
      return `
        <div class="icebreaker-chat-banner" id="icebreakerChatBanner">
          <button type="button" class="icebreaker-banner-dismiss" id="icebreakerBannerDismiss" aria-label="Dismiss">✕</button>
          <div class="icebreaker-banner-ask">Ask them about…</div>
          <div class="icebreaker-banner-q">${esc(starter.their.prompt.text)}</div>
          <div class="icebreaker-banner-a">"${esc(starter.their.answer)}"</div>
          ${reportBtn}
        </div>`;
    }
    return `
      <div class="icebreaker-chat-banner" id="icebreakerChatBanner">
        <button type="button" class="icebreaker-banner-dismiss" id="icebreakerBannerDismiss" aria-label="Dismiss">✕</button>
        <div class="icebreaker-banner-kicker">Your icebreaker (they can ask you)</div>
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
        <h4>Icebreakers</h4>
        <div class="icebreaker-hint">Optional · up to ${MAX_ANSWERS}. Matches see these so “hi” isn’t the only opener. Your own questions stay personal — not added to the shared bank.</div>
        ${
          suggest
            ? `<div class="icebreaker-suggest" data-prompt-id="${suggest.id}">
            <div class="icebreaker-suggest-q">${suggest.text}</div>
            <textarea class="icebreaker-answer-input" id="icebreakerAnswerInput" maxlength="280" placeholder="Short answer…"></textarea>
            <div class="icebreaker-actions">
              <button type="button" class="icebreaker-btn icebreaker-btn-primary" id="icebreakerSaveBtn">Save answer</button>
              <button type="button" class="icebreaker-btn icebreaker-btn-ghost" id="icebreakerShuffleBtn">Another prompt</button>
              <button type="button" class="icebreaker-btn icebreaker-btn-ghost" id="icebreakerBrowseBtn">Browse all</button>
              <button type="button" class="icebreaker-btn icebreaker-btn-ghost" id="icebreakerWriteOwnBtn">Write your own</button>
            </div>
            <div id="icebreakerBrowsePanel" class="icebreaker-browse" hidden></div>
            <div id="icebreakerCustomPanel" class="icebreaker-custom-panel" hidden>
              <input type="text" class="icebreaker-custom-q" id="icebreakerCustomQuestion" maxlength="200" placeholder="Your question…">
              <textarea class="icebreaker-answer-input" id="icebreakerCustomAnswer" maxlength="280" placeholder="Your answer…"></textarea>
              <div class="icebreaker-actions">
                <button type="button" class="icebreaker-btn icebreaker-btn-primary" id="icebreakerCustomSaveBtn">Save my question</button>
                <button type="button" class="icebreaker-btn icebreaker-btn-ghost" id="icebreakerCustomCancelBtn">Cancel</button>
              </div>
            </div>
          </div>`
            : `<div class="icebreaker-hint">${remaining <= 0 ? "You've filled 3 — remove one to add another." : ''}</div>`
        }
        <div class="icebreaker-saved" id="icebreakerSavedList">
          ${answers
            .map((a) => {
              const p = resolvePromptForAnswer(a);
              const isCustom = !!(p?.custom || a.customQuestion);
              return `<div class="icebreaker-saved-item" data-id="${a.promptId}">
                <div class="icebreaker-saved-q">${isCustom ? 'Your question · ' : ''}${p ? p.text : a.promptId}</div>
                <div class="icebreaker-saved-a">${a.answer}</div>
                <button type="button" class="icebreaker-saved-rm" data-rm="${a.promptId}">Remove</button>
                ${isCustom ? `<button type="button" class="icebreaker-saved-flag" data-flag="${a.promptId}" data-q="${String(a.customQuestion || p?.text || '').replace(/"/g, '&quot;')}">Flag</button>` : ''}
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
        if (res.error === 'limit') showToast?.('Max 3 icebreakers — remove one first');
        else if (res.error === 'empty') showToast?.('Write a short answer first');
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
      const cats = { local: 'India & local', fun: 'Fun', reflective: 'Reflective', deep: 'Deep', extra: 'Extra' };
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
        if (res.error === 'limit') showToast?.('Max 3 icebreakers — remove one first');
        else if (res.error === 'empty_question') showToast?.('Write your question first');
        else if (res.error === 'empty') showToast?.('Write a short answer first');
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
          showToast?.('Report unavailable');
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
