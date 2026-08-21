/**
 * Contacts-powered friend find — privacy-first.
 * Client: Contacts Picker API when available; hashes E.164 phones (SHA-256) before upload.
 * Server: match_contact_hashes against phoneIndex/{e164} hashed lookup — never raw contacts.
 * Fallback: graceful copy + manual search (same discovery as Baithak New DM).
 */
(function () {
  'use strict';

  function tt(key, fallback, vars) {
    try {
      if (typeof t === 'function') {
        const v = t(key, vars);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function contactsSupported() {
    try {
      return !!(navigator.contacts && typeof navigator.contacts.select === 'function');
    } catch (e) {
      return false;
    }
  }

  function normalizePhoneDigits(raw) {
    const s = String(raw || '').replace(/[^\d+]/g, '');
    if (!s) return '';
    // Prefer E.164-ish: keep leading +, strip other non-digits
    if (s.startsWith('+')) return '+' + s.slice(1).replace(/\D/g, '');
    const digits = s.replace(/\D/g, '');
    if (digits.length === 10) return '+91' + digits; // India default for Chaupaal
    if (digits.length >= 11) return '+' + digits;
    return digits ? '+' + digits : '';
  }

  async function sha256Hex(text) {
    const enc = new TextEncoder().encode(String(text));
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function pickContactPhones() {
    if (!contactsSupported()) return { ok: false, reason: 'unsupported' };
    try {
      const props = ['name', 'tel'];
      const opts = { multiple: true };
      const list = await navigator.contacts.select(props, opts);
      const phones = [];
      (list || []).forEach((c) => {
        const name = (c.name && c.name[0]) || '';
        (c.tel || []).forEach((tel) => {
          const e164 = normalizePhoneDigits(tel);
          if (e164) phones.push({ name, e164 });
        });
      });
      return { ok: true, phones };
    } catch (e) {
      // User cancel or permission deny
      return { ok: false, reason: e?.name === 'InvalidStateError' ? 'denied' : 'denied', error: e };
    }
  }

  async function matchContactHashes(phones) {
    const pairs = [];
    for (const p of phones.slice(0, 200)) {
      const hash = await sha256Hex(p.e164);
      pairs.push({ hash, e164: p.e164, name: p.name });
    }
    const hashes = pairs.map((p) => p.hash);
    let matches = [];
    try {
      const res =
        typeof callMediaConfig === 'function'
          ? await callMediaConfig({ action: 'match_contact_hashes', hashes })
          : await fetch('/api/media-config', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(typeof currentUser !== 'undefined' && currentUser
                  ? { Authorization: `Bearer ${await currentUser.getIdToken()}` }
                  : {}),
              },
              body: JSON.stringify({ action: 'match_contact_hashes', hashes }),
            }).then((r) => r.json());
      matches = res?.matches || res?.data?.matches || [];
    } catch (e) {
      console.warn('[contacts] match', e?.message || e);
    }
    const byHash = new Map(matches.map((m) => [m.hash, m]));
    const onApp = [];
    const invite = [];
    pairs.forEach((p) => {
      const m = byHash.get(p.hash);
      if (m?.uid) onApp.push({ ...m, contactName: p.name, e164: p.e164 });
      else invite.push({ name: p.name, e164: p.e164 });
    });
    // Chaupaal matches first (richer profiles up top), then invite list
    onApp.sort((a, b) => {
      const score = (u) => (u.photoURL ? 2 : 0) + (u.username ? 1 : 0) + (u.name ? 1 : 0);
      return score(b) - score(a) || String(a.name || a.contactName || '').localeCompare(String(b.name || b.contactName || ''));
    });
    invite.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return { onApp, invite };
  }

  function inviteShare(contact) {
    const url = typeof location !== 'undefined' ? location.origin : 'https://chaupaal.app';
    const text = tt(
      'contacts_invite_text',
      'Join me on Chaupaal — a warmer place to chat, play, and catch up. {{url}}',
      { url }
    );
    // Prefer two-step Chaupaal share sheet when available
    if (typeof openUnifiedShareSheet === 'function') {
      openUnifiedShareSheet({
        gameId: 'invite',
        title: tt('contacts_invite_title', 'Invite to Chaupaal'),
        subtitle: contact?.name || '',
        story: false,
        stats: { text, url, scoreLine: contact?.name || 'Invite' },
      });
      return;
    }
    if (navigator.share) {
      navigator.share({ title: 'Chaupaal', text, url }).catch(() => {});
    } else if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') showToast(tt('contacts_invite_copied', 'Invite link copied'));
      });
    } else if (typeof showToast === 'function') {
      showToast(text);
    }
  }

  function renderContactsBlock(host, { onApp = [], invite = [], unsupported = false } = {}) {
    if (!host) return;
    let block = host.querySelector('[data-contacts-section]');
    if (!block) {
      block = document.createElement('div');
      block.className = 'contacts-section';
      block.dataset.contactsSection = '1';
      host.insertBefore(block, host.firstChild);
    }
    if (unsupported) {
      block.innerHTML = `<div class="contacts-fallback">${tt(
        'contacts_unsupported',
        'Contact sync isn’t available in this browser. Search by name or @username — or open Chaupaal in Chrome on Android to find friends from your contacts.'
      )}</div>`;
      return;
    }
    const rows = onApp
      .map(
        (u) =>
          `<button type="button" class="contacts-row" data-contact-uid="${u.uid}" data-contact-name="${(u.name || u.contactName || '').replace(/"/g, '&quot;')}">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--white);display:grid;place-items:center;overflow:hidden;flex-shrink:0;">${
              typeof renderUserAvatarHtml==='function'?renderUserAvatarHtml(u,{decorative:true}):(u.photoURL?`<img src="${u.photoURL}" alt="" style="width:100%;height:100%;object-fit:cover;">`:'👤')
            }</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:14px;">${u.name || u.contactName || 'Friend'}</div>
              <div style="font-size:11px;color:var(--muted);">${tt('contacts_on_chaupaal', 'On Chaupaal')}${u.username ? ` · @${u.username}` : ''}</div>
            </div>
          </button>`
      )
      .join('');
    const invites = invite
      .slice(0, 8)
      .map(
        (c) =>
          `<button type="button" class="contacts-row" data-contact-invite="${(c.e164 || '').replace(/"/g, '')}" data-contact-name="${(c.name || '').replace(/"/g, '&quot;')}">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--cream);display:grid;place-items:center;flex-shrink:0;">✉️</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:14px;">${c.name || c.e164}</div>
              <div style="font-size:11px;color:var(--muted);">${tt('contacts_invite_cta', 'Invite to Chaupaal')}</div>
            </div>
          </button>`
      )
      .join('');
    block.innerHTML = `
      <div class="contacts-section-title">${tt('contacts_from_your', 'From your contacts')}</div>
      ${rows || `<div class="contacts-fallback">${tt('contacts_none_on_app', 'None of these contacts are on Chaupaal yet — invite someone warm.')}</div>`}
      ${invites ? `<div class="contacts-section-title" style="margin-top:14px;">${tt('contacts_invite_section', 'Invite')}</div>${invites}` : ''}`;

    block.querySelectorAll('[data-contact-uid]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.contactUid;
        if (!uid) return;
        if (typeof openDmWithSharedHello === 'function') {
          await openDmWithSharedHello({
            uid,
            name: btn.dataset.contactName || 'Friend',
            avatar: '👤',
            starterText: 'Hi!',
            origin: 'contacts',
          });
        } else if (typeof openProfile === 'function') {
          openProfile(uid);
        }
      });
    });
    block.querySelectorAll('[data-contact-invite]').forEach((btn) => {
      btn.addEventListener('click', () => inviteShare({ name: btn.dataset.contactName }));
    });
  }

  async function loadContactsInto(host) {
    if (!host) return;
    if (!contactsSupported()) {
      renderContactsBlock(host, { unsupported: true });
      return;
    }
    const pick = await pickContactPhones();
    if (!pick.ok) {
      renderContactsBlock(host, { unsupported: false });
      host.querySelector('[data-contacts-section]')?.insertAdjacentHTML(
        'afterbegin',
        `<div class="contacts-fallback">${tt(
          'contacts_permission',
          'Contacts stay on your device until you choose them. We only send hashed phone numbers — never your raw contact list.'
        )}</div>`
      );
      return;
    }
    if (!pick.phones.length) {
      renderContactsBlock(host, { onApp: [], invite: [] });
      return;
    }
    const { onApp, invite } = await matchContactHashes(pick.phones);
    renderContactsBlock(host, { onApp, invite });
  }

  function openPeopleSearchWithContacts({ surface = 'baithak' } = {}) {
    if (typeof currentUser === 'undefined' || !currentUser) {
      if (typeof showAuth === 'function') showAuth();
      return;
    }
    const bodyHtml = `
      <div class="search-field search-field-wrap">
        <input id="peopleSearchInput" type="search" class="search-field-input search-field-hide-native-clear" autocomplete="off" placeholder="${tt('contacts_search_ph', 'Search by name or @username')}"
          style="width:100%;padding:12px 44px 12px 14px;border:2px solid var(--line);border-radius:14px;font-size:15px;box-sizing:border-box;">
        <button type="button" class="search-field-clear" id="peopleSearchClearBtn" aria-label="${tt('search_clear', 'Clear search')}" hidden>✕</button>
      </div>
      <button type="button" class="btn" id="peopleContactsBtn" style="margin-top:10px;width:100%;">${tt('contacts_use_btn', 'Find from contacts')}</button>
      <div id="peopleSearchResults" style="margin-top:12px;"></div>`;

    function wire(sheet, close) {
      const results = sheet.querySelector('#peopleSearchResults');
      const searchInput = sheet.querySelector('#peopleSearchInput');
      sheet.querySelector('#peopleContactsBtn')?.addEventListener('click', () => loadContactsInto(results));
      if (contactsSupported()) {
        results.innerHTML = `<div class="contacts-fallback">${tt(
          'contacts_soft_prompt',
          'Optional: find friends already on Chaupaal from your contacts. We never upload your full address book.'
        )}</div>`;
      } else {
        renderContactsBlock(results, { unsupported: true });
      }
      let timer = null;
      async function runPeopleQuery(q) {
        if (!q) {
          if (contactsSupported()) {
            results.innerHTML = `<div class="contacts-fallback">${tt(
              'contacts_soft_prompt',
              'Optional: find friends already on Chaupaal from your contacts. We never upload your full address book.'
            )}</div>`;
          } else renderContactsBlock(results, { unsupported: true });
          return;
        }
        try {
          const rows =
            typeof searchUsersProvider === 'function' ? await searchUsersProvider(q, { limit: 20 }) : [];
          results.innerHTML = '';
          const html = rows
            .map(
              (r) =>
                `<button type="button" class="contacts-search-row contacts-row" data-uid="${r.uid || ''}">
                  <div style="font-weight:700;">${r.name || r.username || 'User'}</div>
                  <div style="font-size:12px;color:var(--muted);">@${r.username || 'user'}</div>
                </button>`
            )
            .join('');
          results.insertAdjacentHTML(
            'beforeend',
            html || `<div class="contacts-fallback">${tt('contacts_no_results', 'No people found')}</div>`
          );
          results.querySelectorAll('[data-uid]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const uid = btn.dataset.uid;
              if (!uid) return;
              close();
              if (typeof openDmWithSharedHello === 'function') {
                await openDmWithSharedHello({
                  uid,
                  name: btn.querySelector('div')?.textContent || 'Friend',
                  username: (btn.querySelectorAll('div')[1]?.textContent || '').replace(/^@/, ''),
                  avatar: '👤',
                  starterText: 'Hi!',
                  origin: surface,
                });
              }
            });
          });
        } catch (err) {}
      }
      searchInput?.addEventListener('input', (e) => {
        clearTimeout(timer);
        const q = e.target.value.trim();
        timer = setTimeout(() => runPeopleQuery(q), 280);
      });
      if (typeof enhanceSearchField === 'function' && searchInput) {
        enhanceSearchField(searchInput, {
          clearBtn: sheet.querySelector('#peopleSearchClearBtn'),
          surfaceId: 'people_' + surface,
          onClear() {
            clearTimeout(timer);
            runPeopleQuery('');
          },
        });
      }
      setTimeout(() => searchInput?.focus(), 80);
    }

    if (typeof openHalfSheet === 'function') {
      openHalfSheet({
        id: 'peopleSearchContactsSheet',
        title: tt('contacts_find_title', 'Find people'),
        accent: surface === 'akhbaar' ? 'akhbaar' : surface === 'peepal' ? 'peepal' : 'baithak',
        bodyHtml,
        onMount: wire,
      });
      return;
    }

    if (surface === 'baithak' && typeof showNewDmSearchSheet === 'function') {
      showNewDmSearchSheet({ withContacts: true });
      return;
    }
    document.getElementById('peopleSearchContactsSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'peopleSearchContactsSheet';
    sheet.className = 'archive-overlay';
    sheet.dataset.navManaged = '1';
    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml==='function'?backButtonHtml({ attrs: 'data-overlay-dismiss' }):'<button type="button" data-overlay-dismiss class="cp-back-btn" aria-label="Back">←</button>'}
        <div style="flex:1"><strong>${tt('contacts_find_title', 'Find people')}</strong></div>
      </div>
      <div style="padding:12px 16px;">${bodyHtml}</div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    wire(sheet, close);
  }

  window.ContactsFind = {
    supported: contactsSupported,
    loadInto: loadContactsInto,
    open: openPeopleSearchWithContacts,
    match: matchContactHashes,
  };
  window.openPeopleSearchWithContacts = openPeopleSearchWithContacts;
  window.loadContactsInto = loadContactsInto;
})();
