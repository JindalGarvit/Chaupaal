/**
 * Generic Chaupaal event pipeline — four display modes.
 * fullMessage | inlineBubble | dropdownNudge | graphicCard
 */
(function () {
  let unsub = null;
  let known = new Set();
  let openJournalEventId = null;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function dismissEvent(eventId, el) {
    try {
      if (typeof apiFetch === 'function') {
        await apiFetch('/api/chaupaal-events', {
          method: 'POST',
          needAuth: true,
          body: { action: 'dismiss', eventId },
        });
      }
    } catch (e) {}
    if (eventId === openJournalEventId) openJournalEventId = null;
    el?.remove();
    if (el && typeof removeNavLayer === 'function') removeNavLayer(el);
  }

  async function engageEvent(eventId) {
    try {
      if (typeof apiFetch === 'function') {
        await apiFetch('/api/chaupaal-events', {
          method: 'POST',
          needAuth: true,
          body: { action: 'engage', eventId },
        });
      }
    } catch (e) {}
    if (eventId === openJournalEventId) openJournalEventId = null;
  }

  async function snoozeEvent(eventId, untilMs) {
    try {
      if (typeof apiFetch === 'function') {
        await apiFetch('/api/chaupaal-events', {
          method: 'POST',
          needAuth: true,
          body: { action: 'snooze', eventId, until: untilMs },
        });
      }
    } catch (e) {}
  }

  function host() {
    return document.querySelector('.device') || document.body;
  }

  function trackOverlay(el, dismissFn) {
    if (typeof pushNavLayer === 'function') {
      pushNavLayer(el, dismissFn || (() => dismissEvent(el.dataset.eventId, el)));
    }
    if (typeof registerScopedOverlay === 'function') {
      registerScopedOverlay('chaupaal-event', el);
    }
  }

  function renderFullMessage(ev) {
    const text = ev.payload?.text || '';
    if (!text) return;
    if (typeof addMsgBubble === 'function' && document.getElementById('chatMsgsArea')) {
      const openChat = typeof currentOpenChat !== 'undefined' ? currentOpenChat : null;
      if (openChat && typeof isChaupaalChat === 'function' && isChaupaalChat(openChat)) {
        addMsgBubble({ from: 'them', text, time: 'now', avatar: '🏠' }, false);
      }
    }
    if (typeof showToast === 'function') showToast(text.slice(0, 80));
  }

  function ensureStyles() {
    if (document.getElementById('chaupaalEventStyles')) return;
    const s = document.createElement('style');
    s.id = 'chaupaalEventStyles';
    s.textContent = `
      .chaupaal-inline-bubble{position:absolute;left:12px;right:12px;bottom:72px;z-index:85;animation:chaupaalIn .25s ease}
      .chaupaal-inline-inner{display:flex;gap:10px;align-items:flex-start;background:var(--cream,#FFF8F0);border:1px solid var(--line,#E8DFD4);border-radius:16px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.08)}
      .chaupaal-inline-avatar{font-size:20px}
      .chaupaal-inline-text{flex:1;font-size:13px;line-height:1.4;color:var(--ink,#2B2730)}
      .chaupaal-event-dismiss{border:none;background:transparent;color:var(--muted);cursor:pointer;font-size:14px}
      .chaupaal-dropdown-nudge{position:absolute;top:56px;right:12px;z-index:90;max-width:260px}
      .chaupaal-dropdown-inner{background:var(--navy,#1B1F3B);color:#fff;border-radius:14px;padding:12px 14px;font-size:13px;box-shadow:0 10px 28px rgba(0,0,0,.2)}
      .chaupaal-graphic-card{position:absolute;inset:0;z-index:95;display:flex;align-items:flex-end;justify-content:center;background:rgba(27,31,59,.45);padding:20px;animation:chaupaalIn .28s ease}
      .chaupaal-graphic-inner{width:100%;max-width:340px;background:linear-gradient(160deg,#1B1F3B,#2A3158);color:#fff;border-radius:22px;padding:22px 20px 18px;box-shadow:0 16px 40px rgba(0,0,0,.25)}
      .chaupaal-graphic-kicker{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:6px}
      .chaupaal-graphic-title{font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;margin-bottom:6px}
      .chaupaal-graphic-text{font-size:14px;line-height:1.45;opacity:.9;margin-bottom:16px}
      .chaupaal-graphic-actions{display:flex;flex-direction:column;gap:8px}
      .chaupaal-graphic-row{display:flex;gap:8px}
      .chaupaal-graphic-cta{flex:1;border:none;border-radius:12px;padding:12px;font-weight:700;font-family:Space Grotesk,sans-serif;background:var(--red,#E63946);color:#fff;cursor:pointer}
      .chaupaal-graphic-skip,.chaupaal-graphic-snooze{flex:1;border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:12px;background:transparent;color:#fff;cursor:pointer;font-weight:600}
      .chaupaal-rec-item{background:rgba(255,255,255,.08);border-radius:12px;padding:10px 12px;margin-bottom:8px;font-size:13px}
      @keyframes chaupaalIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @media (prefers-reduced-motion:reduce){.chaupaal-inline-bubble,.chaupaal-graphic-card{animation:none}}
    `;
    document.head.appendChild(s);
  }

  function renderInlineBubble(ev) {
    const existing = document.getElementById('chaupaalInlineBubble');
    existing?.remove();
    ensureStyles();
    const el = document.createElement('div');
    el.id = 'chaupaalInlineBubble';
    el.className = 'chaupaal-event chaupaal-inline-bubble';
    el.dataset.eventId = ev.id;
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <div class="chaupaal-inline-inner">
        <span class="chaupaal-inline-avatar" aria-hidden="true">🏠</span>
        <div class="chaupaal-inline-text">${esc(ev.payload?.text || '')}</div>
        <button type="button" class="chaupaal-event-dismiss" aria-label="Dismiss">✕</button>
      </div>`;
    host().appendChild(el);
    trackOverlay(el, () => dismissEvent(ev.id, el));
    el.querySelector('.chaupaal-event-dismiss')?.addEventListener('click', () => dismissEvent(ev.id, el));
    setTimeout(() => {
      if (document.body.contains(el)) dismissEvent(ev.id, el);
    }, 14000);
  }

  function renderDropdownNudge(ev) {
    // Prefer inbox + tab lights — no top-of-app spam while focused
    try {
      if (typeof addLocalNotification === 'function') {
        addLocalNotification({
          type: 'companion',
          icon: '🏠',
          text: `<strong>${esc(ev.payload?.title || 'Chaupaal')}</strong> ${esc(ev.payload?.text || '')}`,
          section: 'baithak',
        });
      }
      dismissEvent(ev.id);
    } catch (e) {
      dismissEvent(ev.id);
    }
  }

  function renderGraphicCard(ev) {
    document.getElementById('chaupaalGraphicCard')?.remove();
    ensureStyles();
    const p = ev.payload || {};
    const isJournal = ev.type === 'goodnight_journal' || ev.type === 'journal';
    if (isJournal) {
      if (typeof canShowJournalPrompt === 'function' && !canShowJournalPrompt()) return;
      openJournalEventId = ev.id;
    }
    const itemsHtml = Array.isArray(p.items)
      ? p.items
          .map(
            (it) =>
              `<div class="chaupaal-rec-item"><strong>${esc(it.title)}</strong><div style="opacity:.8;margin-top:2px">${esc(it.reason || '')}</div></div>`
          )
          .join('')
      : '';
    const el = document.createElement('div');
    el.id = 'chaupaalGraphicCard';
    el.className = 'chaupaal-event chaupaal-graphic-card';
    el.dataset.eventId = ev.id;
    el.innerHTML = `
      <div class="chaupaal-graphic-inner" role="dialog" aria-label="${esc(p.title || 'Chaupaal')}">
        <div class="chaupaal-graphic-kicker">Chaupaal</div>
        <div class="chaupaal-graphic-title">${esc(p.title || 'For you')}</div>
        <div class="chaupaal-graphic-text">${esc(p.text || p.subtitle || '')}</div>
        ${itemsHtml}
        <div class="chaupaal-graphic-actions">
          <button type="button" class="chaupaal-graphic-cta">${esc(p.cta || (isJournal ? 'Open journal' : 'Got it'))}</button>
          <div class="chaupaal-graphic-row">
            ${isJournal ? '<button type="button" class="chaupaal-graphic-snooze">Remind me later</button>' : ''}
            <button type="button" class="chaupaal-graphic-skip">${isJournal ? 'Not today' : 'Not now'}</button>
          </div>
        </div>
      </div>`;
    host().appendChild(el);
    trackOverlay(el, () => {
      if (isJournal && typeof markJournalDismissedToday === 'function') markJournalDismissedToday();
      dismissEvent(ev.id, el);
    });
    el.querySelector('.chaupaal-graphic-inner')?.addEventListener('click', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      if (e.target !== el) return;
      if (isJournal && typeof markJournalDismissedToday === 'function') markJournalDismissedToday();
      dismissEvent(ev.id, el);
    });
    el.querySelector('.chaupaal-graphic-skip')?.addEventListener('click', () => {
      if (isJournal && typeof markJournalDismissedToday === 'function') markJournalDismissedToday();
      dismissEvent(ev.id, el);
    });
    el.querySelector('.chaupaal-graphic-snooze')?.addEventListener('click', async () => {
      const until =
        typeof snoozeJournalPrompt === 'function' ? snoozeJournalPrompt(3) : Date.now() + 3 * 3600 * 1000;
      await snoozeEvent(ev.id, until);
      el.remove();
      if (typeof removeNavLayer === 'function') removeNavLayer(el);
      if (typeof showToast === 'function') showToast("Okay — I'll nudge you later tonight");
    });
    el.querySelector('.chaupaal-graphic-cta')?.addEventListener('click', async () => {
      await engageEvent(ev.id);
      el.remove();
      if (typeof removeNavLayer === 'function') removeNavLayer(el);
      if (isJournal || p.action === 'open_journal') {
        if (typeof showDayCheck === 'function') showDayCheck({ force: true });
        else if (typeof showToast === 'function') showToast('Open your journal from Baithak anytime');
      } else if (p.action === 'open_chaupaal_chat') {
        try {
          if (typeof openChaupaalChat === 'function') openChaupaalChat();
          else if (typeof switchTab === 'function') {
            document.querySelector('.tab-btn[data-tab="baithak"]')?.click();
          }
        } catch (e) {}
        if (typeof showToast === 'function') showToast('Open your Chaupaal chat to reply — optional');
      } else if (p.action === 'companion_feedback' || ev.type === 'companion_feedback') {
        if (typeof openCompanionFeedbackSheet === 'function') openCompanionFeedbackSheet(ev);
        else if (typeof showToast === 'function') showToast('Thanks — share feedback anytime in Chaupaal chat');
      } else if (p.action === 'wish_friend' || p.action === 'open_friend_dm') {
        const friendUid = p.friendUid;
        const prefill = p.prefill || (p.action === 'wish_friend' ? `Happy birthday, ${p.friendName || 'friend'}! 🎂` : '');
        try {
          document.querySelector('.tab-btn[data-tab="baithak"]')?.click();
          if (friendUid && typeof openChatById === 'function') {
            // Prefer direct chat id patterns; deeplink helper may resolve uid chats
            await openChatById(friendUid);
          } else if (friendUid && typeof startOrOpenDm === 'function') {
            await startOrOpenDm(friendUid, { prefill });
          } else if (friendUid && typeof openProfilePreview === 'function') {
            openProfilePreview(friendUid);
          }
          if (prefill && typeof document !== 'undefined') {
            setTimeout(() => {
              const input = document.getElementById('chatMsgInput');
              if (input && !input.value) {
                input.value = prefill;
                input.focus();
              }
            }, 400);
          }
        } catch (e) {
          if (typeof showToast === 'function') showToast('Open Baithak to message them');
        }
      } else if (p.action === 'open_akhbaar') {
        document.querySelector('.tab-btn[data-tab="akhbaar"]')?.click();
      } else if (p.action === 'open_duniya') {
        document.querySelector('.tab-btn[data-tab="duniya"]')?.click();
      } else if (p.action === 'open_baithak') {
        document.querySelector('.tab-btn[data-tab="baithak"]')?.click();
      } else if (typeof showToast === 'function') {
        showToast('Noted — enjoy exploring');
      }
    });
  }

  function snoozeUntilMs(ev) {
    const raw = ev.snoozedUntil;
    if (!raw) return 0;
    if (typeof raw.toDate === 'function') return raw.toDate().getTime();
    if (raw instanceof Date) return raw.getTime();
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function renderEvent(ev) {
    if (!ev || !ev.id || known.has(ev.id)) return;
    if (ev.dismissed || ev.engaged) return;
    const until = snoozeUntilMs(ev);
    if (until && Date.now() < until) return;
    const isJournal = ev.type === 'goodnight_journal' || ev.type === 'journal';
    if (isJournal && typeof canShowJournalPrompt === 'function' && !canShowJournalPrompt()) {
      known.add(ev.id);
      return;
    }
    known.add(ev.id);
    const mode = ev.displayMode || 'inlineBubble';
    if (mode === 'fullMessage') renderFullMessage(ev);
    else if (mode === 'dropdownNudge') renderDropdownNudge(ev);
    else if (mode === 'graphicCard') renderGraphicCard(ev);
    else renderInlineBubble(ev);
  }

  function startChaupaalEventListener() {
    stopChaupaalEventListener();
    if (!db || !currentUser) return;
    unsub = db
      .collection('users')
      .doc(currentUser.uid)
      .collection('chaupaalEvents')
      .orderBy('createdAt', 'desc')
      .limit(12)
      .onSnapshot(
        (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type !== 'added' && change.type !== 'modified') return;
            const ev = { id: change.doc.id, ...change.doc.data() };
            if (change.type === 'modified') {
              // Allow re-show after snooze expires: drop from known if snooze cleared
              const until = snoozeUntilMs(ev);
              if ((!until || Date.now() >= until) && !ev.dismissed && !ev.engaged) {
                known.delete(ev.id);
              }
            }
            if (change.type === 'added' || change.type === 'modified') renderEvent(ev);
          });
        },
        (err) => console.warn('[chaupaal-events] listen', err)
      );
  }

  function stopChaupaalEventListener() {
    if (typeof unsub === 'function') unsub();
    unsub = null;
  }

  async function dismissOpenJournalEvent() {
    if (!openJournalEventId) return;
    await dismissEvent(openJournalEventId, document.getElementById('chaupaalGraphicCard'));
  }

  async function snoozeOpenJournalEvent(untilMs) {
    if (!openJournalEventId) return;
    await snoozeEvent(openJournalEventId, untilMs);
    document.getElementById('chaupaalGraphicCard')?.remove();
  }

  /**
   * Product feedback SOT: companionProductFeedback
   * (one-shot sheet + companion asks). Separate from chat-tagged chaupaalFeedback.
   * Client create-only; no Archive / public profile; no edit/delete after send.
   */
  const FEEDBACK_PROMPTS = [
    'What’s one thing that would make Chaupaal feel more like home?',
    'Anything missing when you open the app?',
    'What felt confusing or rough this week?',
    'A small delight you’d love more of?',
    'If you could fix one thing today, what would it be?',
    'What should we build next — honest take?',
  ];

  const FEEDBACK_CATEGORIES = [
    { id: 'bug', label: 'Bug' },
    { id: 'idea', label: 'Idea' },
    { id: 'missing', label: 'Missing' },
    { id: 'other', label: 'Other' },
  ];

  function pickFeedbackPrompt() {
    const i = Math.floor(Math.random() * FEEDBACK_PROMPTS.length);
    return FEEDBACK_PROMPTS[i];
  }

  function escFb(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Distinctive half-sheet for product feedback (not journal chrome).
   * @param {object} [opts]
   * @param {string} [opts.source] default chaupaal_chat_feedback
   * @param {object} [opts.event] companion event (optional)
   */
  function openProductFeedbackSheet(opts = {}) {
    const source = opts.source || (opts.event ? 'companion_feedback_ask' : 'chaupaal_chat_feedback');
    const prompt = pickFeedbackPrompt();
    const ico = (name, size) =>
      typeof iconHtml === 'function' ? iconHtml(name, { size: size || 18 }) : '';

    if (typeof openHalfSheet !== 'function') {
      if (typeof showToast === 'function') showToast('Feedback unavailable');
      return null;
    }

    const bodyHtml = `
      <div class="product-feedback-body" data-no-sheet-drag>
        <div class="product-feedback-kicker">${ico('message-square', 16)} For the team · one-shot</div>
        <p class="product-feedback-prompt">${escFb(prompt)}</p>
        <p class="product-feedback-hint">Improve the app, note what’s missing, or leave a general thought. Not in Archive or your profile — no edit after send.</p>
        <div class="product-feedback-chips" role="group" aria-label="Category">
          ${FEEDBACK_CATEGORIES.map(
            (c, i) =>
              `<button type="button" class="product-feedback-chip${i === 3 ? ' is-selected' : ''}" data-fb-cat="${c.id}">${escFb(c.label)}</button>`
          ).join('')}
        </div>
        <textarea data-product-feedback-text rows="4" maxlength="2000" placeholder="Write freely — only founders &amp; admins see this"></textarea>
        <button type="button" class="btn btn--primary btn--block product-feedback-send" data-product-feedback-send>Send feedback</button>
      </div>`;

    return openHalfSheet({
      id: 'productFeedbackSheet',
      title: 'Feedback',
      snap: 'compact',
      accent: 'feedback',
      bodyHtml,
      onMount(sheet, close) {
        let category = 'other';
        sheet.querySelectorAll('[data-fb-cat]').forEach((btn) => {
          btn.addEventListener('click', () => {
            category = btn.dataset.fbCat || 'other';
            sheet.querySelectorAll('[data-fb-cat]').forEach((b) =>
              b.classList.toggle('is-selected', b === btn)
            );
          });
        });
        const ta = sheet.querySelector('[data-product-feedback-text]');
        setTimeout(() => ta?.focus(), 80);
        sheet.querySelector('[data-product-feedback-send]')?.addEventListener('click', async () => {
          const text = ta?.value?.trim();
          if (!text) {
            if (typeof showToast === 'function') showToast('Write a short note first');
            return;
          }
          const sendBtn = sheet.querySelector('[data-product-feedback-send]');
          if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending…';
          }
          try {
            await submitProductFeedback({
              text,
              category,
              source,
              eventId: opts.event?.id || null,
            });
            if (typeof showToast === 'function') showToast('Thanks — noted for the product team');
            close();
          } catch (e) {
            if (sendBtn) {
              sendBtn.disabled = false;
              sendBtn.textContent = 'Send feedback';
            }
            if (typeof showToast === 'function') showToast('Could not save — try again later');
          }
        });
      },
    });
  }

  async function submitProductFeedback({ text, category, source, eventId }) {
    const message = String(text || '').trim().slice(0, 2000);
    if (!message) throw new Error('EMPTY');
    const payload = {
      action: 'product_feedback',
      text: message,
      category: String(category || 'other').slice(0, 40),
      source: String(source || 'chaupaal_chat_feedback').slice(0, 80),
      eventId: eventId || null,
      meta: {
        userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 180) : '',
        appVersion:
          (typeof window !== 'undefined' && (window.CHAUPAAL_APP_VERSION || window.__CHAUPAAL_SW_CACHE)) ||
          null,
      },
    };
    if (typeof apiFetch === 'function') {
      const envelope = await apiFetch('/api/chaupaal-events', {
        method: 'POST',
        needAuth: true,
        body: payload,
      });
      if (!envelope?.ok) {
        const err = new Error(envelope?.error?.message || 'Feedback failed');
        err.code = envelope?.error?.code;
        throw err;
      }
      return envelope.data || {};
    }
    // Fallback: direct Firestore create (same SOT)
    if (!db || !currentUser) throw new Error('AUTH');
    await db.collection('companionProductFeedback').add({
      uid: currentUser.uid,
      message,
      category: payload.category,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      source: payload.source,
      eventId: eventId || null,
      meta: payload.meta,
    });
    return { ok: true };
  }

  function openCompanionFeedbackSheet(ev) {
    openProductFeedbackSheet({ event: ev, source: 'companion_feedback_ask' });
  }

  window.renderChaupaalEvent = renderEvent;
  window.dismissChaupaalEvent = dismissEvent;
  window.engageChaupaalEvent = engageEvent;
  window.startChaupaalEventListener = startChaupaalEventListener;
  window.stopChaupaalEventListener = stopChaupaalEventListener;
  window.dismissOpenJournalEvent = dismissOpenJournalEvent;
  window.snoozeOpenJournalEvent = snoozeOpenJournalEvent;
  window.openCompanionFeedbackSheet = openCompanionFeedbackSheet;
  window.openProductFeedbackSheet = openProductFeedbackSheet;
  window.submitProductFeedback = submitProductFeedback;

  document.addEventListener('chaupaal:auth', () => {
    try {
      startChaupaalEventListener();
    } catch (e) {}
  });
  if (typeof currentUser !== 'undefined' && currentUser) {
    setTimeout(() => startChaupaalEventListener(), 800);
  }
})();
