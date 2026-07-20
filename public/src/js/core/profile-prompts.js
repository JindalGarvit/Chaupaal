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
    { id: 'pp01', category: 'values', text: 'A cause I care about…' },
    { id: 'pp02', category: 'lifestyle', text: 'My ideal weekend looks like…' },
    { id: 'pp03', category: 'fun', text: "I'm weirdly competitive about…" },
    { id: 'pp04', category: 'connection', text: 'The way to my heart is…' },
    { id: 'pp05', category: 'goals', text: 'A life goal of mine is…' },
    { id: 'pp06', category: 'connection', text: 'Together, we could…' },
    { id: 'pp07', category: 'values', text: "I'll know I've found my people when…" },
    { id: 'pp08', category: 'lifestyle', text: 'My simple pleasures…' },
    { id: 'pp09', category: 'dating', text: 'The best way to ask me out is…' },
    { id: 'pp10', category: 'dating', text: "I'm looking for…" },
    { id: 'pp11', category: 'fun', text: 'Two truths and a lie about me…' },
    { id: 'pp12', category: 'local', text: 'My city is underrated because…' },
    { id: 'pp13', category: 'values', text: 'I get irrationally happy when…' },
    { id: 'pp14', category: 'lifestyle', text: 'My most-used app that isn’t social media…' },
    { id: 'pp15', category: 'connection', text: 'A green flag I notice quickly…' },
    { id: 'pp16', category: 'fun', text: 'My controversial food opinion…' },
    { id: 'pp17', category: 'goals', text: 'Something I want to get better at this year…' },
    { id: 'pp18', category: 'lifestyle', text: 'How I recharge after a long week…' },
    { id: 'pp19', category: 'values', text: 'A book / show / song that changed my mood for days…' },
    { id: 'pp20', category: 'connection', text: 'Friendship first means…' },
    { id: 'pp21', category: 'fun', text: 'My go-to karaoke / shower song…' },
    { id: 'pp22', category: 'local', text: 'Best chai / coffee spot near me…' },
    { id: 'pp23', category: 'dating', text: 'On a first hang, I’d rather…' },
    { id: 'pp24', category: 'values', text: 'I respect people who…' },
    { id: 'pp25', category: 'lifestyle', text: 'My Sunday morning usually looks like…' },
    { id: 'pp26', category: 'fun', text: 'A skill I pretend I have…' },
    { id: 'pp27', category: 'connection', text: 'Text me if you also…' },
    { id: 'pp28', category: 'goals', text: 'In five years I hope…' },
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
      return { id: a.promptId, category: 'custom', text: customQ || 'Custom prompt', custom: true };
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
    if (typeof showToast === 'function') showToast('Prompt saved');
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
    if (d.bio) parts.push('Bio: ' + String(d.bio).trim());
    const prompts = normalizePrompts(d.prompts);
    prompts.forEach((a) => {
      const p = resolvePrompt(a);
      parts.push(`Prompt (${p?.text || a.promptId}): ${a.answer}`);
    });
    const interests = Array.isArray(d.interests) ? d.interests : [];
    if (interests.length) parts.push('Interests: ' + interests.join(', '));
    const hobbies = Array.isArray(d.hobbies) ? d.hobbies : [];
    if (hobbies.length) parts.push('Hobbies: ' + hobbies.join(', '));
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
        <div class="profile-prompts-title">Prompts</div>
        <div class="profile-prompts-hint">Digital profile · pick ${MAX_PROMPTS} free-text answers for matching. Separate from chat icebreakers.</div>
        <div class="profile-prompts-list">
          ${
            answers.length
              ? answers
                  .map((a) => {
                    const p = resolvePrompt(a);
                    return `<div class="profile-prompt-card" data-prompt-id="${esc(a.promptId)}">
                      <strong>${esc(p?.text || 'Prompt')}</strong>
                      <p>${esc(a.answer)}</p>
                      <button type="button" data-remove-prompt="${esc(a.promptId)}">Remove</button>
                    </div>`;
                  })
                  .join('')
              : '<div class="profile-prompts-empty">No prompts yet — answer 2–3 to unlock richer matches.</div>'
          }
        </div>
        ${
          remaining > 0
            ? `<div class="profile-prompts-add">
          <label>Choose a prompt</label>
          <select id="profilePromptSelect">
            <option value="">Select…</option>
            ${unused.map((p) => `<option value="${esc(p.id)}">${esc(p.text)}</option>`).join('')}
            <option value="__custom__">Write your own prompt…</option>
          </select>
          <input type="text" id="profilePromptCustomQ" maxlength="120" placeholder="Your custom prompt…" style="display:none;">
          <textarea id="profilePromptAnswer" maxlength="500" placeholder="Answer in your own words…" rows="3"></textarea>
          <button type="button" id="profilePromptSave" class="btn btn--primary btn--block">Save prompt (${remaining} left)</button>
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
        if (typeof showToast === 'function') showToast('Pick a prompt first');
        return;
      }
      if (!result.ok) {
        if (typeof showToast === 'function') {
          showToast(result.error === 'max' ? 'You already have 3 prompts' : 'Add a free-text answer');
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
})();
