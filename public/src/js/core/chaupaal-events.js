/**
 * Generic Chaupaal event pipeline — four display modes.
 * fullMessage | inlineBubble | dropdownNudge | graphicCard
 */
(function () {
  let unsub = null;
  let known = new Set();

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
    el?.remove();
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
  }

  function host() {
    return document.querySelector('.device') || document.body;
  }

  function renderFullMessage(ev) {
    // Persist-style: inject into Chaupaal chat SAMPLE_MESSAGES / open area if open
    const text = ev.payload?.text || '';
    if (!text) return;
    const chatOpen =
      typeof activeChatScreen !== 'undefined' &&
      activeChatScreen &&
      typeof isChaupaalChat === 'function' &&
      isChaupaalChat({ id: activeChatScreen.dataset?.chatId, type: 'chaupaal' });
    if (typeof addMsgBubble === 'function' && document.getElementById('chatMsgsArea')) {
      const openChat = typeof currentOpenChat !== 'undefined' ? currentOpenChat : null;
      if (openChat && typeof isChaupaalChat === 'function' && isChaupaalChat(openChat)) {
        addMsgBubble({ from: 'them', text, time: 'now', avatar: '🏠' }, false);
      }
    }
    // Also keep as soft toast if chat not open
    if (typeof showToast === 'function') showToast(text.slice(0, 80));
  }

  function renderInlineBubble(ev) {
    const existing = document.getElementById('chaupaalInlineBubble');
    existing?.remove();
    const el = document.createElement('div');
    el.id = 'chaupaalInlineBubble';
    el.className = 'chaupaal-event chaupaal-inline-bubble';
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <div class="chaupaal-inline-inner">
        <span class="chaupaal-inline-avatar" aria-hidden="true">🏠</span>
        <div class="chaupaal-inline-text">${esc(ev.payload?.text || '')}</div>
        <button type="button" class="chaupaal-event-dismiss" aria-label="Dismiss">✕</button>
      </div>`;
    const style = document.getElementById('chaupaalEventStyles') || (() => {
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
        .chaupaal-graphic-actions{display:flex;gap:8px}
        .chaupaal-graphic-cta{flex:1;border:none;border-radius:12px;padding:12px;font-weight:700;font-family:Space Grotesk,sans-serif;background:var(--red,#E63946);color:#fff;cursor:pointer}
        .chaupaal-graphic-skip{flex:1;border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:12px;background:transparent;color:#fff;cursor:pointer;font-weight:600}
        .chaupaal-rec-item{background:rgba(255,255,255,.08);border-radius:12px;padding:10px 12px;margin-bottom:8px;font-size:13px}
        @keyframes chaupaalIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion:reduce){.chaupaal-inline-bubble,.chaupaal-graphic-card{animation:none}}
      `;
      document.head.appendChild(s);
      return s;
    })();
    void style;
    host().appendChild(el);
    if (typeof beginOverlayScope === 'function') {
      beginOverlayScope('chaupaal-event', el);
    }
    el.querySelector('.chaupaal-event-dismiss')?.addEventListener('click', () => dismissEvent(ev.id, el));
    setTimeout(() => {
      if (document.body.contains(el)) dismissEvent(ev.id, el);
    }, 14000);
  }

  function renderDropdownNudge(ev) {
    document.getElementById('chaupaalDropdownNudge')?.remove();
    const el = document.createElement('div');
    el.id = 'chaupaalDropdownNudge';
    el.className = 'chaupaal-event chaupaal-dropdown-nudge';
    el.innerHTML = `<div class="chaupaal-dropdown-inner">
      <div style="font-weight:700;margin-bottom:4px">${esc(ev.payload?.title || 'Chaupaal')}</div>
      <div>${esc(ev.payload?.text || '')}</div>
      <button type="button" class="chaupaal-event-dismiss" style="margin-top:8px;color:rgba(255,255,255,.8)">Dismiss</button>
    </div>`;
    host().appendChild(el);
    if (typeof beginOverlayScope === 'function') beginOverlayScope('chaupaal-event', el);
    el.querySelector('.chaupaal-event-dismiss')?.addEventListener('click', () => dismissEvent(ev.id, el));
    setTimeout(() => {
      if (document.body.contains(el)) dismissEvent(ev.id, el);
    }, 10000);
  }

  function renderGraphicCard(ev) {
    document.getElementById('chaupaalGraphicCard')?.remove();
    const p = ev.payload || {};
    const isJournal = ev.type === 'goodnight_journal' || ev.type === 'journal';
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
    el.innerHTML = `
      <div class="chaupaal-graphic-inner" role="dialog" aria-label="${esc(p.title || 'Chaupaal')}">
        <div class="chaupaal-graphic-kicker">Chaupaal</div>
        <div class="chaupaal-graphic-title">${esc(p.title || 'For you')}</div>
        <div class="chaupaal-graphic-text">${esc(p.text || p.subtitle || '')}</div>
        ${itemsHtml}
        <div class="chaupaal-graphic-actions">
          <button type="button" class="chaupaal-graphic-cta">${esc(p.cta || (isJournal ? 'Open journal' : 'Got it'))}</button>
          <button type="button" class="chaupaal-graphic-skip">Not now</button>
        </div>
      </div>`;
    host().appendChild(el);
    if (typeof beginOverlayScope === 'function') beginOverlayScope('chaupaal-event', el);
    el.querySelector('.chaupaal-graphic-skip')?.addEventListener('click', () => dismissEvent(ev.id, el));
    el.querySelector('.chaupaal-graphic-cta')?.addEventListener('click', async () => {
      await engageEvent(ev.id);
      el.remove();
      if (isJournal || p.action === 'open_journal') {
        if (typeof showDayCheck === 'function') showDayCheck();
        else if (typeof showToast === 'function') showToast('Open your journal from Baithak anytime');
      } else if (typeof showToast === 'function') {
        showToast('Noted — enjoy exploring');
      }
    });
  }

  function renderEvent(ev) {
    if (!ev || !ev.id || known.has(ev.id)) return;
    if (ev.dismissed || ev.engaged) return;
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
    // Quiet if AI off — still show already-created cards? Plan: stop proactive generation; existing can show.
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
            if (change.type === 'added') renderEvent(ev);
          });
        },
        (err) => console.warn('[chaupaal-events] listen', err)
      );
  }

  function stopChaupaalEventListener() {
    if (typeof unsub === 'function') unsub();
    unsub = null;
  }

  window.renderChaupaalEvent = renderEvent;
  window.dismissChaupaalEvent = dismissEvent;
  window.engageChaupaalEvent = engageEvent;
  window.startChaupaalEventListener = startChaupaalEventListener;
  window.stopChaupaalEventListener = stopChaupaalEventListener;

  // Boot when auth ready
  document.addEventListener('chaupaal:auth', () => {
    try {
      startChaupaalEventListener();
    } catch (e) {}
  });
  if (typeof currentUser !== 'undefined' && currentUser) {
    setTimeout(() => startChaupaalEventListener(), 800);
  }
})();
