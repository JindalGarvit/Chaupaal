/**
 * Journal check-in half-sheet + shared save/helpers.
 * Morning (05–12 IST) + evening (17–24 IST) prompts; Archive Journal shares compose UX.
 */
(function () {
  'use strict';

  const ABUSE_CAP = 1000;
  const EDIT_MS = 24 * 60 * 60 * 1000;
  const PROMPTS = /* i18n-copy */ {
    morning: [
      t('settings.how_s_the_morning_treating_you'),
      t('settings.what_s_on_your_mind_as'),
      t('settings.one_hope_for_today_anything_goes'),
      t('settings.how_did_you_sleep_and_how'),
    ],
    evening: [
      t('settings.how_was_your_day_really'),
      t('settings.anything_worth_keeping_from_today'),
      t('settings.how_are_you_winding_down'),
      t('settings.what_made_you_smile_or_sigh'),
    ],
    anytime: [
      t('settings.what_s_sitting_with_you_right'),
      t('settings.a_few_honest_lines_only_you'),
    ],
  };

  function ico(name, size) {
    return typeof iconHtml === 'function' ? iconHtml(name, { size: size || 18 }) : '';
  }

  function esc(s) {
    return typeof escapeHtmlText === 'function'
      ? escapeHtmlText(s)
      : String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/"/g, '&quot;');
  }

  function istParts(d) {
    const date = d || new Date();
    try {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const map = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
      return {
        y: Number(map.year),
        m: Number(map.month),
        d: Number(map.day),
        hour: Number(map.hour),
        minute: Number(map.minute),
      };
    } catch (e) {
      return {
        y: date.getFullYear(),
        m: date.getMonth() + 1,
        d: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
      };
    }
  }

  function istDateKey(d) {
    const p = istParts(d);
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }

  /** morning | evening | null (midday / late night outside windows) */
  function journalWindow(d) {
    const h = istParts(d).hour;
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 17 && h <= 23) return 'evening';
    return null;
  }

  function windowStorageKey(kind, win, dateKey) {
    return `chaupaal_journal_${kind}_${dateKey}_${win}`;
  }

  function formatCollapsedDate(createdAtMs, dateStr) {
    let d;
    if (createdAtMs) d = new Date(createdAtMs);
    else if (dateStr) {
      const [y, m, day] = String(dateStr).split('-').map(Number);
      d = new Date(y, (m || 1) - 1, day || 1);
    } else d = new Date();
    if (typeof formatDate === 'function') return formatDate(d, 'short');
    const p = istParts(d);
    const yy = String(p.y).slice(-2);
    return `${String(p.d).padStart(2, '0')}-${String(p.m).padStart(2, '0')}-${yy}`;
  }

  function formatExpandedDate(createdAtMs, dateStr) {
    let d;
    if (createdAtMs) d = new Date(createdAtMs);
    else if (dateStr) {
      const [y, m, day] = String(dateStr).split('-').map(Number);
      d = new Date(y, (m || 1) - 1, day || 1);
    } else d = new Date();
    if (typeof formatDate === 'function') return formatDate(d, 'medium');
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }); // i18n-format fallback
  }

  function formatExpandedTime(createdAtMs) {
    if (!createdAtMs) return '';
    if (typeof formatTime === 'function') return formatTime(createdAtMs);
    try {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(createdAtMs));
    } catch (e) {
      const d = new Date(createdAtMs);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); // i18n-format fallback
    }
  }

  function entryCreatedMs(e) {
    const c = e?.createdAt;
    if (!c) return 0;
    if (typeof c.toMillis === 'function') return c.toMillis();
    if (typeof c.toDate === 'function') return c.toDate().getTime();
    if (typeof c === 'number') return c;
    const t = Date.parse(c);
    return Number.isFinite(t) ? t : 0;
  }

  function canEditEntry(e) {
    const ms = entryCreatedMs(e);
    return ms > 0 && Date.now() - ms < EDIT_MS;
  }

  function aiAnalysisAllowed() {
    try {
      if (typeof isAiFeaturesEnabledSync === 'function' && !isAiFeaturesEnabledSync()) return false;
    } catch (e) {}
    try {
      if (document.documentElement.classList.contains('quiet-mode')) return false;
    } catch (e) {}
    return typeof callAI === 'function';
  }

  function pickPrompt(win) {
    const list = PROMPTS[win] || PROMPTS.anytime;
    const i = Math.floor(Date.now() / 3600000) % list.length;
    return list[i];
  }

  async function saveJournalEntry({ text, allowAnalysis, entryId, window: win }) {
    if (!db || !currentUser) throw new Error('AUTH');
    const clean = String(text || '').trim().slice(0, 4000);
    if (!clean) throw new Error('EMPTY');
    const col = db.collection('users').doc(currentUser.uid).collection('journal');
    if (!entryId) {
      const snap = await col.limit(ABUSE_CAP + 1).get();
      if (snap.size >= ABUSE_CAP) throw new Error('CAP');
    }
    const date = istDateKey();
    const payload = {
      text: clean,
      date,
      allowAnalysis: !!allowAnalysis,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (win) payload.checkInWindow = win;
    if (entryId) {
      await col.doc(entryId).update(payload);
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await col.add(payload);
    }
    if (win) {
      try {
        localStorage.setItem(windowStorageKey('done', win, date), '1');
      } catch (e) {}
    }
    // Soft analysis — only when allowed for this entry + AI on
    if (allowAnalysis && aiAnalysisAllowed()) {
      try {
        const hint = typeof teenAiSystemHint === 'function' ? teenAiSystemHint() : '';
        await callAI({
          tier: 'fast',
          max_tokens: 120,
          feature: 'journal_analysis',
          system:
            'You summarize a private journal entry into 1 warm sentence of personal insight. No diagnosis.' + // i18n-ignore (LLM system prompt)
            hint,
          messages: [{ role: 'user', content: clean.slice(0, 800) }],
        });
      } catch (e) {}
    }
    return { date };
  }

  function wireMicForTextarea(ta, micBtn) {
    if (!ta || !micBtn) return;
    const sync = () => {
      // Hide mic on first typed character (spaces count)
      const empty = !String(ta.value || '').length;
      micBtn.hidden = !empty;
      micBtn.style.display = empty ? '' : 'none';
    };
    ta.addEventListener('input', sync);
    sync();
    micBtn.addEventListener('click', () => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('baithak_voice_unsupported') : t('settings.voice_typing_unavailable'));
        return;
      }
      if (micBtn.classList.contains('recording')) {
        micBtn._rec?.stop?.();
        return;
      }
      const rec = new SR();
      micBtn._rec = rec;
      rec.lang = typeof getTtsLang === 'function' ? getTtsLang() : ((typeof currentLang !== 'undefined' && currentLang === 'hi') ? 'hi-IN' : 'en-IN');
      rec.interimResults = false;
      rec.onstart = () => micBtn.classList.add('recording');
      rec.onend = () => micBtn.classList.remove('recording');
      rec.onerror = () => micBtn.classList.remove('recording');
      rec.onresult = (e) => {
        const transcript = e.results?.[0]?.[0]?.transcript || '';
        ta.value = (ta.value + ' ' + transcript).trim();
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      };
      rec.start();
    });
  }

  function composeBodyHtml({ prompt, initialText, editing } = {}) {
    const ph = esc(prompt || t('settings.a_few_honest_lines'));
    return `
      <div class="journal-checkin-body">
        <p class="journal-checkin-prompt">${ph}</p>
        <div class="journal-compose-wrap">
          <textarea data-journal-text rows="4" maxlength="4000" placeholder="${tHtml('settings.write_freely_only_you_can_see')}">${esc(initialText || '')}</textarea>
          <button type="button" class="journal-compose-mic" data-journal-mic aria-label="${tHtml('settings.voice_typing')}">${ico('mic', 20)}</button>
        </div>
        <label class="archive-journal-consent journal-analysis-consent">
          <input type="checkbox" data-journal-ai checked>
          ${tHtml('settings.allow_soft_analysis_for_personal_insights')}
        </label>
        <button type="button" class="btn btn--primary btn--block" data-journal-save>${editing ? tHtml('settings.save_changes') : tHtml('settings.save_to_journal')}</button>
        ${editing ? '' : '<button type="button" class="journal-checkin-dismiss" data-journal-dismiss>' + tHtml('settings.display_geo_prompt_deny') + '</button>'}
      </div>`;
  }

  function openJournalComposeSheet(opts = {}) {
    const win = opts.window || journalWindow() || 'anytime';
    const prompt = opts.prompt || pickPrompt(win === 'anytime' ? 'anytime' : win);
    const editing = !!opts.entryId;
    const title = editing ? t('settings.edit_journal') : win === 'morning' ? t('settings.morning_check_in') : win === 'evening' ? t('settings.evening_check_in') : t('settings.journal');

    if (typeof openHalfSheet !== 'function') {
      if (typeof showToast === 'function') showToast(t('settings.journal_unavailable'));
      return null;
    }

    return openHalfSheet({
      id: 'journalCheckInSheet',
      title,
      snap: 'compact',
      accent: 'peepal',
      bodyHtml: composeBodyHtml({ prompt, initialText: opts.text || '', editing }),
      onMount(sheet, close) {
        const ta = sheet.querySelector('[data-journal-text]');
        const mic = sheet.querySelector('[data-journal-mic]');
        const aiBox = sheet.querySelector('[data-journal-ai]');
        // Soft analysis defaults ON every fresh compose — never persist last uncheck
        if (aiBox) aiBox.checked = true;
        wireMicForTextarea(ta, mic);
        setTimeout(() => {
          ta?.focus();
          if (typeof openHalfSheet === 'function') {
            try {
              sheet.classList.add('cp-half-sheet--expand');
            } catch (e) {}
          }
        }, 80);
        sheet.querySelector('[data-journal-dismiss]')?.addEventListener('click', () => {
          if (opts.onDismiss) opts.onDismiss(win);
          else markJournalWindowDismissed(win);
          close();
        });
        sheet.querySelector('[data-journal-save]')?.addEventListener('click', async () => {
          const text = ta?.value || '';
          const allow = !!aiBox?.checked;
          try {
            await saveJournalEntry({
              text,
              allowAnalysis: allow,
              entryId: opts.entryId || null,
              window: opts.markWindow !== false ? (win === 'anytime' ? null : win) : null,
            });
            if (typeof showToast === 'function') showToast(editing ? t('common.ptr_done') : t('settings.saved_to_journal'));
            if (typeof opts.onSaved === 'function') opts.onSaved();
            close();
          } catch (e) {
            const msg =
              e?.message === 'EMPTY'
                ? t('settings.write_something_first')
                : e?.message === 'CAP'
                  ? t('settings.journal_is_full_for_now')
                  : t('settings.could_not_save');
            if (typeof showToast === 'function') showToast(msg);
          }
        });
        ta?.addEventListener('focus', () => {
          try {
            const handle = sheet;
            if (handle && typeof applyHeight === 'undefined') {
              handle.classList.add('cp-half-sheet--expand');
              handle.classList.remove('cp-half-sheet--half');
              const max = (handle.parentElement?.clientHeight || window.innerHeight) - 48;
              handle.style.height = Math.round(max * 0.55) + 'px';
            }
          } catch (e) {}
        });
      },
    });
  }

  function markJournalWindowDismissed(win) {
    if (!win || win === 'anytime') return;
    try {
      localStorage.setItem(windowStorageKey('dismissed', win, istDateKey()), '1');
    } catch (e) {}
  }

  function wasWindowDismissed(win) {
    if (!win) return false;
    try {
      return !!localStorage.getItem(windowStorageKey('dismissed', win, istDateKey()));
    } catch (e) {
      return false;
    }
  }

  function wasWindowDoneLocal(win) {
    if (!win) return false;
    try {
      return !!localStorage.getItem(windowStorageKey('done', win, istDateKey()));
    } catch (e) {
      return false;
    }
  }

  async function hasJournalInWindow(win) {
    if (!win || !db || !currentUser) return wasWindowDoneLocal(win);
    if (wasWindowDoneLocal(win)) return true;
    try {
      const date = istDateKey();
      const snap = await db
        .collection('users')
        .doc(currentUser.uid)
        .collection('journal')
        .where('date', '==', date)
        .limit(40)
        .get();
      const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      for (const e of entries) {
        if (e.checkInWindow === win) return true;
        const ms = entryCreatedMs(e);
        if (!ms) continue;
        const w = journalWindow(new Date(ms));
        if (w === win) return true;
      }
    } catch (e) {}
    return false;
  }

  async function maybeShowJournalCheckIn(opts = {}) {
    if (!currentUser) return false;
    if (opts.force) {
      openJournalComposeSheet({ window: opts.window || journalWindow() || 'anytime' });
      return true;
    }
    const win = journalWindow();
    if (!win) return false;
    if (wasWindowDismissed(win)) return false;
    if (await hasJournalInWindow(win)) return false;
    openJournalComposeSheet({
      window: win,
      onDismiss: () => markJournalWindowDismissed(win),
    });
    return true;
  }

  function scheduleJournalCheckInWatch() {
    if (window.__journalCheckInWatch) return;
    window.__journalCheckInWatch = true;
    const tryShow = () => {
      if (document.visibilityState !== 'visible') return;
      if (!currentUser) return;
      maybeShowJournalCheckIn().catch(() => {});
    };
    setTimeout(tryShow, 2200);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') setTimeout(tryShow, 800);
    });
  }

  window.JournalCheckIn = {
    openCompose: openJournalComposeSheet,
    save: saveJournalEntry,
    maybeShow: maybeShowJournalCheckIn,
    scheduleWatch: scheduleJournalCheckInWatch,
    formatCollapsedDate,
    formatExpandedDate,
    formatExpandedTime,
    canEditEntry,
    entryCreatedMs,
    wireMicForTextarea,
    composeBodyHtml,
    journalWindow,
    istDateKey,
    pickPrompt,
    ABUSE_CAP,
    EDIT_MS,
  };
  window.openJournalComposeSheet = openJournalComposeSheet;
  window.maybeShowJournalCheckIn = maybeShowJournalCheckIn;
})();
