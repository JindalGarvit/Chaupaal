/**
 * Digital profile prompts — SEPARATE from icebreakers (1C).
 * Icebreakers = chat openers (icebreakers.js).
 * Prompts = dating-style profile answers that feed matchmaking embeddings.
 *
 * Schema: digitalProfile.prompts[] / users/{uid}.profile.prompts
 * Each: { promptId, answer, answeredAt, customQuestion? }
 * Free text only — never multiple choice.
 */
(function () {
  'use strict';

  const MAX_PROMPTS = 3;

  /** Curated dating-app style library (~28). Users pick 2–3. */
  const PROFILE_PROMPT_BANK = [
    { id: 'pp01', category: 'values', key: 'profile.a_cause_i_care_about', text: t('profile.a_cause_i_care_about') },
    { id: 'pp02', category: 'lifestyle', key: 'profile.my_ideal_weekend_looks_like', text: t('profile.my_ideal_weekend_looks_like') },
    { id: 'pp03', category: 'fun', key: 'profile.i_m_weirdly_competitive_about', text: t('profile.i_m_weirdly_competitive_about') },
    { id: 'pp04', category: 'connection', key: 'profile.the_way_to_my_heart_is', text: t('profile.the_way_to_my_heart_is') },
    { id: 'pp05', category: 'goals', key: 'profile.a_life_goal_of_mine_is', text: t('profile.a_life_goal_of_mine_is') },
    { id: 'pp06', category: 'connection', key: 'profile.together_we_could', text: t('profile.together_we_could') },
    { id: 'pp07', category: 'values', key: 'profile.i_ll_know_i_ve_found', text: t('profile.i_ll_know_i_ve_found') },
    { id: 'pp08', category: 'lifestyle', key: 'profile.my_simple_pleasures', text: t('profile.my_simple_pleasures') },
    { id: 'pp09', category: 'dating', key: 'profile.the_best_way_to_ask_me', text: t('profile.the_best_way_to_ask_me') },
    { id: 'pp10', category: 'dating', key: 'profile.i_m_looking_for', text: t('profile.i_m_looking_for') },
    { id: 'pp11', category: 'fun', key: 'profile.two_truths_and_a_lie_about', text: t('profile.two_truths_and_a_lie_about') },
    { id: 'pp12', category: 'local', key: 'profile.my_city_is_underrated_because', text: t('profile.my_city_is_underrated_because') },
    { id: 'pp13', category: 'values', key: 'profile.i_get_irrationally_happy_when', text: t('profile.i_get_irrationally_happy_when') },
    { id: 'pp14', category: 'lifestyle', key: 'profile.my_most_used_app_that_isn', text: t('profile.my_most_used_app_that_isn') },
    { id: 'pp15', category: 'connection', key: 'profile.a_green_flag_i_notice_quickly', text: t('profile.a_green_flag_i_notice_quickly') },
    { id: 'pp16', category: 'fun', key: 'profile.my_controversial_food_opinion', text: t('profile.my_controversial_food_opinion') },
    { id: 'pp17', category: 'goals', key: 'profile.something_i_want_to_get_better', text: t('profile.something_i_want_to_get_better') },
    { id: 'pp18', category: 'lifestyle', key: 'profile.how_i_recharge_after_a_long', text: t('profile.how_i_recharge_after_a_long') },
    { id: 'pp19', category: 'values', key: 'profile.a_book_show_song_that_changed', text: t('profile.a_book_show_song_that_changed') },
    { id: 'pp20', category: 'connection', key: 'profile.friendship_first_means', text: t('profile.friendship_first_means') },
    { id: 'pp21', category: 'fun', key: 'profile.my_go_to_karaoke_shower_song', text: t('profile.my_go_to_karaoke_shower_song') },
    { id: 'pp22', category: 'local', key: 'profile.best_chai_coffee_spot_near_me', text: t('profile.best_chai_coffee_spot_near_me') },
    { id: 'pp23', category: 'dating', key: 'profile.on_a_first_hang_i_d', text: t('profile.on_a_first_hang_i_d') },
    { id: 'pp24', category: 'values', key: 'profile.i_respect_people_who', text: t('profile.i_respect_people_who') },
    { id: 'pp25', category: 'lifestyle', key: 'profile.my_sunday_morning_usually_looks_like', text: t('profile.my_sunday_morning_usually_looks_like') },
    { id: 'pp26', category: 'fun', key: 'profile.a_skill_i_pretend_i_have', text: t('profile.a_skill_i_pretend_i_have') },
    { id: 'pp27', category: 'connection', key: 'profile.text_me_if_you_also', text: t('profile.text_me_if_you_also') },
    { id: 'pp28', category: 'goals', key: 'profile.in_five_years_i_hope', text: t('profile.in_five_years_i_hope') },
  ];

  function getBankPrompt(id) {
    return PROFILE_PROMPT_BANK.find((p) => p.id === id) || null;
  }

  function resolvePrompt(a) {
    if (!a) return null;
    const bank = getBankPrompt(a.promptId);
    if (bank) return bank;
    const customQ = String(a.customQuestion || '').trim();
    if (customQ || String(a.promptId || '').startsWith('custom_')) {
      return { id: a.promptId, category: 'custom', text: customQ || t('profile.custom_prompt'), custom: true };
    }
    return null;
  }

  function normalizePrompts(list) {
    return (Array.isArray(list) ? list : [])
      .filter((a) => a && a.promptId && String(a.answer || '').trim())
      .map((a) => {
        const entry = {
          promptId: a.promptId,
          answer: String(a.answer).trim().slice(0, 500),
          answeredAt: a.answeredAt || Date.now(),
        };
        const cq = String(a.customQuestion || '').trim();
        if (cq || String(a.promptId).startsWith('custom_')) entry.customQuestion = cq || entry.answer;
        return entry;
      })
      .filter((a) => {
        if (String(a.promptId).startsWith('custom_')) return !!a.customQuestion;
        return !!getBankPrompt(a.promptId);
      })
      .slice(0, MAX_PROMPTS);
  }

  function getMyPrompts() {
    const dp = typeof digitalProfile !== 'undefined' ? digitalProfile : null;
    return normalizePrompts(dp?.prompts);
  }

  function persistPrompts(list) {
    const saved = normalizePrompts(list);
    if (typeof digitalProfile !== 'undefined') digitalProfile.prompts = saved;
    try {
      if (typeof digitalProfile !== 'undefined') {
        localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
      }
    } catch (e) {}
    if (typeof db !== 'undefined' && db && typeof currentUser !== 'undefined' && currentUser) {
      db.collection('users')
        .doc(currentUser.uid)
        .update({ 'profile.prompts': saved, prompts: saved })
        .catch(() => {});
    }
    if (typeof refreshProfileCompletionUI === 'function') refreshProfileCompletionUI();
    if (typeof scheduleProfileEmbeddingRefresh === 'function') scheduleProfileEmbeddingRefresh('prompts');
    return saved;
  }

  function savePromptAnswer(promptId, answerText, opts = {}) {
    const customQuestion = String(opts.customQuestion || '').trim();
    let prompt = getBankPrompt(promptId);
    if (!prompt && customQuestion) {
      prompt = { id: promptId, category: 'custom', text: customQuestion, custom: true };
    }
    if (!prompt && String(promptId).startsWith('custom_')) {
      const existing = getMyPrompts().find((a) => a.promptId === promptId);
      if (existing?.customQuestion) {
        prompt = { id: promptId, category: 'custom', text: existing.customQuestion, custom: true };
      }
    }
    if (!prompt) return { ok: false, error: 'unknown_prompt' };
    const text = String(answerText || '').trim().slice(0, 500);
    if (!text) return { ok: false, error: 'empty' };

    const prev = getMyPrompts();
    if (prev.length >= MAX_PROMPTS && !prev.find((a) => a.promptId === promptId)) {
      return { ok: false, error: 'max' };
    }
    const next = prev.filter((a) => a.promptId !== promptId);
    const entry = { promptId, answer: text, answeredAt: Date.now() };
    if (prompt.custom || customQuestion) entry.customQuestion = customQuestion || prompt.text;
    next.push(entry);
    persistPrompts(next);
    if (typeof onProfileFieldSaved === 'function') onProfileFieldSaved('prompts', '', text);
    if (typeof showToast === 'function') showToast(t('profile.prompt_saved'));
    return { ok: true };
  }

  function saveCustomPrompt(question, answer) {
    const q = String(question || '').trim().slice(0, 120);
    const a = String(answer || '').trim().slice(0, 500);
    if (!q || !a) return { ok: false, error: 'empty' };
    const promptId = 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return savePromptAnswer(promptId, a, { customQuestion: q });
  }

  function removePromptAnswer(promptId) {
    persistPrompts(getMyPrompts().filter((a) => a.promptId !== promptId));
  }

  function hydratePromptsFromUserDoc(docData) {
    if (!docData || typeof digitalProfile === 'undefined') return;
    const list = Array.isArray(docData.prompts)
      ? normalizePrompts(docData.prompts)
      : normalizePrompts(docData.profile?.prompts);
    if (!list.length) return;
    digitalProfile.prompts = list;
    try {
      localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
    } catch (e) {}
  }

  /** Plain text blob for embeddings (3A — text only; media excluded). */
  function buildSemanticProfileText(dp) {
    const d = dp || (typeof digitalProfile !== 'undefined' ? digitalProfile : {}) || {};
    const parts = [];
    // Embedding input stays English whatever the UI language, so matching is comparable across users.
    const en = (typeof window !== 'undefined' && window.CHAUPAAL_I18N_EN) || {};
    if (d.bio) parts.push('Bio: ' + String(d.bio).trim()); // i18n-ignore
    const prompts = normalizePrompts(d.prompts);
    prompts.forEach((a) => {
      const p = resolvePrompt(a);
      parts.push(`Prompt (${(p?.key && en[p.key]) || p?.text || a.promptId}): ${a.answer}`); // i18n-ignore
    });
    const interests = Array.isArray(d.interests) ? d.interests : [];
    if (interests.length) parts.push('Interests: ' + interests.join(', ')); // i18n-ignore
    const hobbies = Array.isArray(d.hobbies) ? d.hobbies : [];
    if (hobbies.length) parts.push('Hobbies: ' + hobbies.join(', ')); // i18n-ignore
    return parts.join('\n').slice(0, 8000);
  }

  function unusedBankPrompts(answers = getMyPrompts()) {
    const taken = new Set(answers.map((a) => a.promptId));
    return PROFILE_PROMPT_BANK.filter((p) => !taken.has(p.id));
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function renderProfilePromptsBlock() {
    const answers = getMyPrompts();
    const remaining = MAX_PROMPTS - answers.length;
    const unused = unusedBankPrompts(answers);
    return `
      <div class="profile-prompts-block" id="profilePromptsBlock">
        <div class="profile-prompts-title">${tHtml('profile.prompts')}</div>
        <div class="profile-prompts-hint">${tHtml('profile.prompts_hint', { count: MAX_PROMPTS })}</div>
        <div class="profile-prompts-list">
          ${
            answers.length
              ? answers
                  .map((a) => {
                    const p = resolvePrompt(a);
                    return `<div class="profile-prompt-card" data-prompt-id="${esc(a.promptId)}">
                      <strong>${esc(p?.text || t('profile.prompt'))}</strong>
                      <p>${esc(a.answer)}</p>
                      <button type="button" data-remove-prompt="${esc(a.promptId)}">${tHtml('profile.exclusion_remove')}</button>
                    </div>`;
                  })
                  .join('')
              : '<div class="profile-prompts-empty">' + tHtml('profile.no_prompts_yet_answer_2_3') + '</div>'
          }
        </div>
        ${
          remaining > 0
            ? `<div class="profile-prompts-add">
          <label>${tHtml('profile.choose_a_prompt')}</label>
          <select id="profilePromptSelect">
            <option value="">${tHtml('profile.select')}</option>
            ${unused.map((p) => `<option value="${esc(p.id)}">${esc(p.text)}</option>`).join('')}
            <option value="__custom__">${tHtml('profile.write_your_own_prompt')}</option>
          </select>
          <input type="text" id="profilePromptCustomQ" maxlength="120" placeholder="${tHtml('profile.your_custom_prompt')}" style="display:none;">
          <textarea id="profilePromptAnswer" maxlength="500" placeholder="${tHtml('profile.answer_in_your_own_words')}" rows="3"></textarea>
          <button type="button" id="profilePromptSave" class="btn btn--primary btn--block">${tHtml('profile.save_prompt_left', { count: remaining })}</button>
        </div>`
            : ''
        }
      </div>`;
  }

  function wireProfilePromptsBlock(root) {
    const block = root?.querySelector?.('#profilePromptsBlock') || document.getElementById('profilePromptsBlock');
    if (!block || block.dataset.wired) return;
    block.dataset.wired = '1';

    block.querySelectorAll('[data-remove-prompt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        removePromptAnswer(btn.dataset.removePrompt);
        block.outerHTML = renderProfilePromptsBlock();
        const next = document.getElementById('profilePromptsBlock');
        if (next) {
          delete next.dataset.wired;
          wireProfilePromptsBlock(next.parentElement || document);
        }
      });
    });

    const select = block.querySelector('#profilePromptSelect');
    const customQ = block.querySelector('#profilePromptCustomQ');
    select?.addEventListener('change', () => {
      if (customQ) customQ.style.display = select.value === '__custom__' ? 'block' : 'none';
    });

    block.querySelector('#profilePromptSave')?.addEventListener('click', () => {
      const answer = block.querySelector('#profilePromptAnswer')?.value || '';
      let result;
      if (select?.value === '__custom__') {
        result = saveCustomPrompt(customQ?.value || '', answer);
      } else if (select?.value) {
        result = savePromptAnswer(select.value, answer);
      } else {
        if (typeof showToast === 'function') showToast(t('profile.pick_a_prompt_first'));
        return;
      }
      if (!result.ok) {
        if (typeof showToast === 'function') {
          showToast(result.error === 'max' ? t('profile.you_already_have_3_prompts') : t('profile.add_a_free_text_answer'));
        }
        return;
      }
      block.outerHTML = renderProfilePromptsBlock();
      const next = document.getElementById('profilePromptsBlock');
      if (next) {
        delete next.dataset.wired;
        wireProfilePromptsBlock(next.parentElement || document);
      }
    });
  }

  window.PROFILE_PROMPT_BANK = PROFILE_PROMPT_BANK;
  window.getMyPrompts = getMyPrompts;
  window.savePromptAnswer = savePromptAnswer;
  window.saveCustomPrompt = saveCustomPrompt;
  window.removePromptAnswer = removePromptAnswer;
  window.hydratePromptsFromUserDoc = hydratePromptsFromUserDoc;
  window.buildSemanticProfileText = buildSemanticProfileText;
  window.renderProfilePromptsBlock = renderProfilePromptsBlock;
  window.wireProfilePromptsBlock = wireProfilePromptsBlock;

  let embedTimer = null;
  function scheduleProfileEmbeddingRefresh(reason) {
    clearTimeout(embedTimer);
    embedTimer = setTimeout(async () => {
      if (typeof apiFetch !== 'function' || typeof currentUser === 'undefined' || !currentUser) return;
      try {
        await apiFetch('/api/peepal-reactions', {
          method: 'POST',
          needAuth: true,
          body: { action: 'refresh_embedding', reason: reason || 'edit' },
        });
      } catch (e) {}
    }, 1800);
  }
  window.scheduleProfileEmbeddingRefresh = scheduleProfileEmbeddingRefresh;
})();
