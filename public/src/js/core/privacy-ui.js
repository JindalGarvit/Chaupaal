/**
 * Privacy & data UI (Global L8): consent banner + choices, Settings → Privacy & data, the neutral age
 * question, the under-13 screen, Teen mode surfaces (Peepal gate), deletion grace banner, legal
 * re-acceptance. Rules live in core/compliance.js; server writes go through /api/media-config.
 */
(function () {
  'use strict';

  const C = () => window.ChaupaalCompliance;
  const P = () => window.ChaupaalPrivacy;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function me() {
    try {
      return typeof currentUser !== 'undefined' && currentUser ? currentUser : null;
    } catch (e) {
      return null;
    }
  }
  function prof() {
    try {
      return typeof userProfile !== 'undefined' && userProfile ? userProfile : null;
    } catch (e) {
      return null;
    }
  }
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }
  function errText(e, fallback) {
    return typeof errorText === 'function' ? errorText(e, fallback) : fallback;
  }
  async function api(action, body) {
    if (typeof apiFetch !== 'function') throw Object.assign(new Error('offline'), { code: 'UNAVAILABLE' });
    const env = await apiFetch('/api/media-config', { method: 'POST', needAuth: true, body: { action, ...(body || {}) } });
    if (!env || !env.ok) throw Object.assign(new Error(env?.error?.message || 'Request failed'), { code: env?.error?.code || 'ERROR' });
    return env.data || {};
  }
  function fmtDate(ms) {
    return typeof ChaupaalFormat !== 'undefined' ? ChaupaalFormat.formatDate(ms, 'medium') : new Date(ms).toISOString().slice(0, 10);
  }
  function host() {
    return document.querySelector('#device, .device') || document.body;
  }

  // ─── Consent banner (opt-in regions before any choice; everyone after a policy bump) ───
  function maybeShowConsentBanner() {
    if (!P() || document.getElementById('cpConsentBanner')) return;
    const st = P().status();
    if (!st.needsPrompt) return;
    const el = document.createElement('div');
    el.id = 'cpConsentBanner';
    el.className = 'cp-consent';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-labelledby', 'cpConsentTitle');
    el.innerHTML = `
      <strong class="cp-consent-title" id="cpConsentTitle">${tHtml('privacy.consent_title')}</strong>
      <p class="cp-consent-body">${tHtml(st.current || st.mode === 'opt_in' ? 'privacy.consent_body' : 'privacy.consent_body_updated')}</p>
      <div class="cp-consent-actions">
        <button type="button" class="btn cp-consent-btn" data-consent="reject">${tHtml('privacy.reject_all')}</button>
        <button type="button" class="btn cp-consent-btn" data-consent="accept">${tHtml('privacy.accept_all')}</button>
      </div>
      <div class="cp-consent-links">
        <button type="button" class="cp-consent-link" data-consent="choose">${tHtml('privacy.choose')}</button>
        <button type="button" class="cp-consent-link" data-legal="privacy">${tHtml('common.privacy_policy')}</button>
      </div>`;
    host().appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-consent]');
      if (!b) return;
      const k = b.getAttribute('data-consent');
      if (k === 'accept' || k === 'reject') {
        const on = k === 'accept';
        P().setConsent({ analytics: on, crash: on, marketing: on }, { source: 'banner' });
        el.remove();
        toast(t(on ? 'privacy.consent_saved_accept' : 'privacy.consent_saved_reject'));
      } else if (k === 'choose') {
        openConsentSettings({ fromBanner: true });
      }
    });
  }

  const PURPOSE_KEYS = {
    analytics: ['privacy.purpose_analytics', 'privacy.purpose_analytics_desc'],
    crash: ['privacy.purpose_crash', 'privacy.purpose_crash_desc'],
    marketing: ['privacy.purpose_marketing', 'privacy.purpose_marketing_desc'],
  };

  function openConsentSettings(opts) {
    if (!P() || typeof openHalfSheet !== 'function') return;
    const st = P().status();
    const locked = P().ageInfo().consentDependentOff;
    const rows = C()
      .PURPOSES.map(
        (p) => `
        <div class="toggle-row">
          <div>
            <div class="toggle-label">${tHtml(PURPOSE_KEYS[p][0])}</div>
            <div class="toggle-desc">${tHtml(PURPOSE_KEYS[p][1])}</div>
          </div>
          <label class="switch"><input type="checkbox" data-purpose="${p}" ${st.choices[p] && !locked ? 'checked' : ''} ${locked ? 'disabled' : ''}><span class="slider"></span></label>
        </div>`
      )
      .join('');
    openHalfSheet({
      id: 'cpConsentSheet',
      title: t('privacy.consent_sheet_title'),
      snap: 'tall',
      bodyHtml: `
        <p class="toggle-desc">${tHtml(st.mode === 'opt_in' ? 'privacy.consent_mode_opt_in' : 'privacy.consent_mode_opt_out')}</p>
        ${locked ? `<p class="cp-privacy-note">${tHtml('privacy.consent_locked_parent')}</p>` : ''}
        ${rows}
        <details class="cp-privacy-essential">
          <summary class="toggle-label">${tHtml('privacy.essential_title')}</summary>
          <ul class="legal-v1-list">
            <li>${tHtml('privacy.essential_auth')}</li>
            <li>${tHtml('privacy.essential_content')}</li>
            <li>${tHtml('privacy.essential_safety')}</li>
            <li>${tHtml('privacy.essential_device')}</li>
          </ul>
        </details>
        <div class="cp-consent-actions" style="margin-top:12px;">
          <button type="button" class="btn cp-consent-btn" data-cs="reject">${tHtml('privacy.reject_all')}</button>
          <button type="button" class="btn cp-consent-btn" data-cs="accept">${tHtml('privacy.accept_all')}</button>
        </div>
        <button type="button" class="btn btn--primary btn--block" data-cs="save" style="margin-top:8px;">${tHtml('privacy.save_choices')}</button>
        <p class="legal-v1-note">${tHtml('privacy.consent_version', { version: C().POLICY_VERSION })}</p>`,
      onMount: (sheet, close) => {
        const save = (choices) => {
          P().setConsent(choices, { source: opts && opts.fromBanner ? 'banner_choose' : 'settings' });
          document.getElementById('cpConsentBanner')?.remove();
          close();
          toast(t('privacy.choices_saved'));
          renderPrivacyData();
        };
        sheet.addEventListener('click', (e) => {
          const b = e.target.closest('[data-cs]');
          if (!b) return;
          const k = b.getAttribute('data-cs');
          if (k === 'accept' || k === 'reject') {
            const on = k === 'accept';
            save({ analytics: on, crash: on, marketing: on });
          } else {
            const out = {};
            sheet.querySelectorAll('[data-purpose]').forEach((i) => (out[i.getAttribute('data-purpose')] = i.checked));
            save(out);
          }
        });
      },
    });
  }

  // ─── Under-13: friendly "not yet" screen; the device remembers (no DOB, no identity stored) ───
  function showUnderAgeBlock() {
    try {
      P().ageLock();
    } catch (e) {}
    document.getElementById('cpAgeBlock')?.remove();
    const el = document.createElement('div');
    el.id = 'cpAgeBlock';
    el.className = 'cp-age-block';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'cpAgeBlockTitle');
    el.innerHTML = `
      <div class="cp-age-block-card">
        <div class="cp-age-block-emoji" aria-hidden="true">🌱</div>
        <h2 id="cpAgeBlockTitle">${tHtml('privacy.under_age_title')}</h2>
        <p>${tHtml('privacy.under_age_body')}</p>
        <p class="toggle-desc">${tHtml('privacy.under_age_note')}</p>
        <button type="button" class="btn btn--primary btn--block" data-age-ok>${tHtml('common.ok')}</button>
      </div>`;
    host().appendChild(el);
    el.querySelector('[data-age-ok]')?.addEventListener('click', () => {
      el.remove();
      if (typeof showAuthScreen === 'function') showAuthScreen('authHeroScreen', 'back');
    });
  }

  /** Signup entry points while the device is locked show the "not yet" screen instead. */
  function guardSignupEntry(e) {
    const b = e.target.closest && e.target.closest('#heroSignupBtn, #loginToSignup, #registerBtn, #regGoogleBtn');
    if (!b || !P() || !P().ageLocked()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showUnderAgeBlock();
  }

  // ─── Neutral age question for accounts without a DOB (asked once; skippable once) ───
  function maxDobValue() {
    return new Date().toISOString().slice(0, 10);
  }

  function openDobPrompt(opts) {
    const o = opts || {};
    if (!me() || typeof openHalfSheet !== 'function') return Promise.resolve(false);
    const mode = o.required ? 'require' : C().dobPromptMode(prof() || {}) || 'require';
    return new Promise((resolve) => {
      openHalfSheet({
        id: 'cpDobSheet',
        title: t('privacy.dob_title'),
        bodyHtml: `
          <p class="toggle-desc">${tHtml('privacy.dob_body')}</p>
          <label class="auth-input-label" for="cpDobInput">${tHtml('common.date_of_birth')}</label>
          <input class="auth-input" type="date" id="cpDobInput" min="1900-01-01" max="${maxDobValue()}">
          <div class="auth-error" id="cpDobError" role="alert"></div>
          <button type="button" class="btn btn--primary btn--block" data-dob="save">${tHtml('common.continue')}</button>
          ${mode === 'ask' ? `<button type="button" class="auth-guest-btn" data-dob="skip">${tHtml('privacy.dob_not_now')}</button>` : `<p class="toggle-desc">${tHtml('privacy.dob_required_note')}</p>`}`,
        onMount: (sheet, close) => {
          sheet.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-dob]');
            if (!b) return;
            const err = sheet.querySelector('#cpDobError');
            if (b.getAttribute('data-dob') === 'skip') {
              try {
                await api('skip_dob_prompt');
                const p = prof();
                if (p) p.dobPrompt = { skips: 1 };
              } catch (e2) {}
              close();
              resolve(false);
              return;
            }
            const val = sheet.querySelector('#cpDobInput')?.value;
            if (!val || C().exactAge(val) == null) {
              if (err) err.textContent = t('privacy.dob_invalid');
              return;
            }
            b.disabled = true;
            try {
              const r = P().region();
              const out = await api('set_birthdate', { dob: val, country: r.country, subdivision: r.subdivision });
              close();
              if (out.blocked) {
                await signOutDevice();
                showUnderAgeBlock();
                resolve(false);
                return;
              }
              const p = prof();
              if (p) {
                const age = C().exactAge(val);
                Object.assign(p, { dob: val, dateOfBirth: val, age, teenMode: age < 18, isMinor: age < 18 });
                delete p.dobPrompt;
              }
              toast(t('privacy.dob_saved'));
              applyTeenSurfaces();
              renderPrivacyData();
              if (typeof needsParentalConsent === 'function' && needsParentalConsent() && typeof openParentalConsentSheet === 'function') {
                setTimeout(() => openParentalConsentSheet(), 300);
              }
              resolve(true);
            } catch (e2) {
              if (err) err.textContent = errText(e2, t('errors.generic'));
              b.disabled = false;
            }
          });
        },
      });
    });
  }

  /** Gated features after the one skip: true when the feature may open now. */
  function requireAgeFor(feature) {
    if (!P() || !me()) return true;
    const gate = P().ageGate(feature);
    if (gate === 'need_dob') {
      openDobPrompt({ required: true });
      return false;
    }
    if (gate === 'teen' || gate === 'blocked') {
      toast(t(feature === 'peepal' ? 'privacy.peepal_18_only' : 'privacy.teen_feature_off'));
      return false;
    }
    return true;
  }

  // ─── Teen surfaces: Peepal (18+ everywhere) hidden; profile badge class ───
  function peepalBtn() {
    return document.querySelector('.bottom-tabs .tab-btn[data-tab="peepal"]');
  }
  function fallbackTab() {
    return [...document.querySelectorAll('.bottom-tabs .tab-btn[data-tab]')].find((b) => b.dataset.tab !== 'peepal' && !b.hidden);
  }
  function applyTeenSurfaces() {
    const teen = !!(P() && me() && P().isTeen());
    document.documentElement.classList.toggle('cp-teen-mode', teen);
    const btn = peepalBtn();
    if (btn) {
      btn.hidden = teen;
      if (teen && btn.classList.contains('active')) fallbackTab()?.click();
    }
  }
  function guardPeepalClick(e) {
    const b = e.target.closest && e.target.closest('.tab-btn[data-tab="peepal"]');
    if (!b || !me()) return;
    if (!requireAgeFor('peepal')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
  function watchPeepalTab() {
    const btn = peepalBtn();
    if (!btn || typeof MutationObserver !== 'function') return;
    new MutationObserver(() => {
      if (btn.classList.contains('active') && me() && P() && P().isTeen()) fallbackTab()?.click();
    }).observe(btn, { attributes: true, attributeFilter: ['class'] });
  }

  // ─── Deletion grace banner (log in within 30 days to cancel) ───
  function maybeShowDeletionBanner() {
    const p = prof();
    document.getElementById('cpDeletionBanner')?.remove();
    if (!p || p.deletionStatus !== 'scheduled' || !p.purgeAfterMs) return;
    const el = document.createElement('div');
    el.id = 'cpDeletionBanner';
    el.className = 'cp-deletion-banner';
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <span>${tHtml('privacy.deletion_banner', { date: fmtDate(p.purgeAfterMs) })}</span>
      <button type="button" class="btn btn--sm" data-del="cancel">${tHtml('privacy.cancel_deletion')}</button>
      <button type="button" class="cp-consent-link" data-del="out">${tHtml('privacy.keep_deleting')}</button>`;
    host().appendChild(el);
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      if (b.getAttribute('data-del') === 'out') {
        await signOutDevice({ keepSlot: false });
        location.reload();
        return;
      }
      b.disabled = true;
      try {
        await api('cancel_account_deletion');
        delete p.deletionStatus;
        delete p.purgeAfterMs;
        el.remove();
        toast(t('privacy.deletion_cancelled'));
        if (typeof UsersPublic?.syncPublicProfile === 'function') UsersPublic.syncPublicProfile(me().uid, p).catch(() => {});
      } catch (e2) {
        b.disabled = false;
        toast(errText(e2, t('errors.generic')));
      }
    });
  }

  async function signOutDevice(opts) {
    const o = opts || {};
    const uid = me()?.uid;
    try {
      await apiFetch('/api/revoke-sessions', { method: 'POST', needAuth: true, body: {} });
    } catch (e) {}
    try {
      if (uid && o.keepSlot !== true && typeof AuthProfiles?.removeAccountFromDevice === 'function') AuthProfiles.removeAccountFromDevice(uid);
    } catch (e) {}
    try {
      if (typeof auth !== 'undefined' && auth?.signOut) await auth.signOut();
    } catch (e) {}
  }

  // ─── Legal acceptance on a material change (signup records it directly) ───
  function maybeAskLegal() {
    const p = prof();
    if (!p || !me() || C().legalCurrent(p.legalAcceptance) || document.getElementById('cpLegalUpdate')) return;
    if (typeof openHalfSheet !== 'function') return;
    openHalfSheet({
      id: 'cpLegalUpdate',
      title: t('privacy.legal_update_title'),
      bodyHtml: `
        <p class="toggle-desc">${tHtml(p.legalAcceptance ? 'privacy.legal_update_body' : 'privacy.legal_first_body')}</p>
        <div class="legal-v1-actions">
          <button type="button" class="btn btn--secondary btn--block" data-legal="terms">${tHtml('legal.terms_title')}</button>
          <button type="button" class="btn btn--secondary btn--block" data-legal="privacy">${tHtml('legal.privacy_title')}</button>
        </div>
        <button type="button" class="btn btn--primary btn--block" data-legal-accept style="margin-top:10px;">${tHtml('privacy.legal_accept')}</button>
        <p class="legal-v1-note">${tHtml('legal.draft_banner')}</p>`,
      onMount: (sheet, close) => {
        sheet.querySelector('[data-legal-accept]')?.addEventListener('click', async () => {
          try {
            const out = await api('legal_accept', { source: p.legalAcceptance ? 'update' : 'existing_account' });
            p.legalAcceptance = { terms: out.terms, privacy: out.privacy };
            close();
          } catch (e) {
            toast(errText(e, t('errors.generic')));
          }
        });
      },
    });
  }

  function recordSignupAcceptance() {
    return api('legal_accept', { source: 'signup' })
      .then((out) => {
        const p = prof();
        if (p) p.legalAcceptance = { terms: out.terms, privacy: out.privacy };
      })
      .catch(() => {});
  }

  // ─── Settings → Privacy & data ───
  function toggleRow(id, labelKey, descKey, checked, opts) {
    const o = opts || {};
    return `
      <div class="toggle-row" id="${id}Row">
        <div>
          <div class="toggle-label">${tHtml(labelKey)}</div>
          <div class="toggle-desc">${tHtml(descKey, o.params || {})}${o.noteKey ? ` <span class="cp-privacy-note">${tHtml(o.noteKey)}</span>` : ''}</div>
        </div>
        <label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} ${o.disabled ? 'disabled' : ''}><span class="slider"></span></label>
      </div>`;
  }
  function linkRow(id, icon, labelKey, subHtml) {
    return `
      <button type="button" class="settings-link-row" id="${id}">
        <span class="settings-link-icon" aria-hidden="true">${icon}</span>
        <span class="settings-link-text"><strong>${tHtml(labelKey)}</strong><small>${subHtml || ''}</small></span>
        <span class="settings-link-chevron" aria-hidden="true">›</span>
      </button>`;
  }

  function consentSummary() {
    const st = P().status();
    const on = C().PURPOSES.filter((p) => st.choices[p]);
    if (st.needsPrompt && st.mode === 'opt_in') return esc(t('privacy.tracking_not_chosen'));
    return esc(on.length ? on.map((p) => t(PURPOSE_KEYS[p][0])).join(' · ') : t('privacy.tracking_all_off'));
  }

  function renderPrivacyData() {
    const hostEl = document.getElementById('privacyDataHost');
    if (!hostEl || !P()) return;
    const signed = !!me();
    const info = P().ageInfo();
    const prefs = P().prefs();
    const teen = signed && info.teen;
    let html = '';
    if (teen) {
      html += `
        <div class="cp-teen-card" id="teenModeCard">
          <strong>${tHtml('privacy.teen_on_title')}</strong>
          <p class="toggle-desc">${tHtml(info.known ? 'privacy.teen_on_body' : 'privacy.teen_on_body_nodob')}</p>
          <ul class="legal-v1-list">${C()
            .TEEN_RULES.map((r) => `<li>${tHtml('privacy.teen_rule_' + r)}</li>`)
            .join('')}</ul>
          ${
            info.needsParentalConsent
              ? `<p class="cp-privacy-note">${tHtml('privacy.parent_needed', { age: info.consentAge })}</p><button type="button" class="btn btn--primary btn--sm" id="privacyParentBtn">${tHtml('privacy.ask_parent')}</button>`
              : info.parentalConsentVerified
                ? `<p class="toggle-desc">${tHtml('privacy.parent_done')}</p>`
                : ''
          }
        </div>`;
    }
    if (signed) {
      html += toggleRow('togglePersonalizedRecs', 'privacy.recs_label', 'privacy.recs_desc', prefs.personalizedRecs, {
        disabled: prefs.locked.personalizedRecs,
        noteKey: prefs.locked.personalizedRecs ? (info.consentDependentOff ? 'privacy.locked_parent' : 'privacy.locked_teen') : null,
      });
      html += toggleRow('toggleUseAi', 'privacy.ai_label', 'privacy.ai_desc', prefs.useAi, {
        disabled: prefs.locked.useAi,
        noteKey: prefs.locked.useAi ? 'privacy.locked_parent' : teen ? 'privacy.ai_teen_default' : null,
      });
      if (teen) html += toggleRow('toggleTeenDms', 'privacy.teen_dms_label', 'privacy.teen_dms_desc', prefs.teenNonFriendDms);
      if (P().showDoNotSell()) {
        html += toggleRow('toggleDoNotSell', 'privacy.dns_label', 'privacy.dns_desc', prefs.doNotSell, {
          disabled: P().gpc(),
          noteKey: P().gpc() ? 'privacy.dns_gpc' : null,
        });
      }
    }
    html += linkRow('privacyTrackingBtn', '📊', 'privacy.tracking_label', consentSummary());
    if (signed) {
      html += linkRow('privacyYourDataBtn', '🗂️', 'privacy.your_data_label', esc(t('privacy.your_data_sub')));
      html += linkRow('settingsExportDataBtn', '⬇️', 'common.download_my_data', esc(t('privacy.export_sub')));
      html += linkRow('settingsDeleteAccountBtn', '🗑️', 'privacy.delete_label', esc(t('privacy.delete_sub')));
    }
    html += linkRow('privacyLegalBtn', '📄', 'privacy.legal_label', esc(t('privacy.legal_sub')));
    hostEl.innerHTML = html;
    wirePrivacyData(hostEl);
  }

  async function savePref(key, value, input) {
    if (input) input.disabled = true;
    try {
      const out = await api('privacy_prefs', { prefs: { [key]: value } });
      const p = prof();
      if (p) p.privacy = { ...(p.privacy || {}), ...((out && out.prefs) || {}), [key]: out?.prefs?.[key] ?? value };
      toast(t('privacy.saved'));
      try {
        window.dispatchEvent(new CustomEvent('chaupaal:privacy-prefs', { detail: p && p.privacy }));
      } catch (e) {}
    } catch (e) {
      if (input) input.checked = !value;
      toast(errText(e, t('errors.generic')));
    } finally {
      if (input) input.disabled = false;
      renderPrivacyData();
    }
  }

  function wirePrivacyData(root) {
    // Sheets open above the app, not the Settings modal — close it first (same as the other Settings links).
    const on = (id, fn) =>
      root.querySelector('#' + id)?.addEventListener('click', () => {
        document.getElementById('settingsModal')?.classList.add('hidden');
        fn();
      });
    const onChange = (id, key) =>
      root.querySelector('#' + id)?.addEventListener('change', (e) => savePref(key, !!e.target.checked, e.target));
    onChange('togglePersonalizedRecs', 'personalizedRecs');
    onChange('toggleUseAi', 'useAi');
    onChange('toggleTeenDms', 'teenNonFriendDms');
    onChange('toggleDoNotSell', 'doNotSell');
    on('privacyParentBtn', () => typeof openParentalConsentSheet === 'function' && openParentalConsentSheet());
    on('privacyTrackingBtn', () => openConsentSettings());
    on('privacyYourDataBtn', () => openYourData());
    on('settingsExportDataBtn', () => typeof openAccountDataExport === 'function' && openAccountDataExport());
    on('settingsDeleteAccountBtn', () => typeof openAccountDeletionRequest === 'function' && openAccountDeletionRequest());
    on('privacyLegalBtn', () => openLegalIndex());
  }

  /** "Correct my data": every stored field — shown, with where to change it (or why it can't change here). */
  function openYourData() {
    const p = prof() || {};
    const pr = p.profile || {};
    const r = P().region();
    const val = (v) => (v == null || v === '' || (Array.isArray(v) && !v.length) ? `<em>${tHtml('privacy.field_empty')}</em>` : esc(Array.isArray(v) ? v.join(', ') : v));
    const rows = [
      ['privacy.field_name', p.name || pr.displayName, 'privacy.edit_profile'],
      ['privacy.field_username', p.username ? '@' + p.username : '', 'privacy.edit_profile'],
      ['privacy.field_email', p.email || me()?.email, 'privacy.edit_account'],
      ['privacy.field_phone', p.phone || me()?.phoneNumber, 'privacy.edit_account'],
      ['privacy.field_dob', p.dob || p.dateOfBirth || pr.dateOfBirth, p.dob || p.dateOfBirth ? 'privacy.edit_dob_support' : 'privacy.edit_dob_add'],
      ['privacy.field_gender', p.gender || pr.gender, 'privacy.edit_profile'],
      ['privacy.field_city', p.city || pr.currentCity, 'privacy.edit_profile'],
      ['privacy.field_bio', pr.bio || p.bio, 'privacy.edit_profile'],
      ['privacy.field_interests', p.interests || pr.interests, 'privacy.edit_profile'],
      ['privacy.field_type', pr.profileType || p.profileType, 'privacy.edit_type'],
      ['privacy.field_visibility', p.profileVisibility || pr.profileVisibility || 'public', 'privacy.edit_profile'],
      ['privacy.field_region', [r.country, r.subdivision].filter(Boolean).join('-'), 'privacy.edit_settings'],
      ['privacy.field_langs', [p.lang].concat(p.contentLangs || []).filter(Boolean), 'privacy.edit_settings'],
      ['privacy.field_activity', null, 'privacy.edit_activity'],
      ['privacy.field_model', null, 'privacy.edit_model'],
      ['privacy.field_consents', p.consents ? t('privacy.consent_version', { version: p.consents.version }) : '', 'privacy.edit_consents'],
    ];
    openHalfSheet({
      id: 'cpYourData',
      title: t('privacy.your_data_label'),
      snap: 'tall',
      bodyHtml: `
        <p class="toggle-desc">${tHtml('privacy.your_data_lead')}</p>
        <dl class="cp-your-data">${rows
          .map(
            ([k, v, how]) => `<div class="cp-your-data-row"><dt>${tHtml(k)}</dt><dd>${v === null ? '' : val(v)}<small>${tHtml(how)}</small></dd></div>`
          )
          .join('')}</dl>
        <div class="legal-v1-actions">
          ${p.dob || p.dateOfBirth ? '' : `<button type="button" class="btn btn--secondary btn--block" data-yd="dob">${tHtml('privacy.add_dob')}</button>`}
          <button type="button" class="btn btn--secondary btn--block" data-yd="edit">${tHtml('privacy.open_profile_editor')}</button>
          <button type="button" class="btn btn--secondary btn--block" data-yd="export">${tHtml('common.download_my_data')}</button>
          <button type="button" class="btn btn--ghost btn--block" data-yd="support">${tHtml('privacy.contact_support')}</button>
        </div>`,
      onMount: (sheet, close) => {
        sheet.addEventListener('click', (e) => {
          const b = e.target.closest('[data-yd]');
          if (!b) return;
          const k = b.getAttribute('data-yd');
          close();
          if (k === 'dob') openDobPrompt({ required: true });
          else if (k === 'export' && typeof openAccountDataExport === 'function') openAccountDataExport();
          else if (k === 'edit') {
            if (typeof openUserProfile === 'function' && me()) openUserProfile({ uid: me().uid }, { context: 'privacy_data', initialMode: 'owner' });
          } else if (k === 'support') {
            if (typeof openProductFeedbackSheet === 'function') openProductFeedbackSheet({ tag: 'privacy' });
            else if (typeof openLegalSheet === 'function') openLegalSheet('privacy');
          }
        });
      },
    });
  }

  function openLegalIndex() {
    if (typeof openHalfSheet !== 'function') return;
    const kinds = ['terms', 'privacy', 'guidelines', 'teens', 'processors', 'collects'];
    openHalfSheet({
      id: 'cpLegalIndex',
      title: t('privacy.legal_label'),
      bodyHtml: `
        <div class="legal-v1-actions">${kinds
          .map((k) => `<button type="button" class="btn btn--secondary btn--block" data-legal-open="${k}">${tHtml(k === 'collects' ? 'common.what_chaupaal_collects' : 'legal.' + k + '_title')}</button>`)
          .join('')}</div>
        <p class="legal-v1-note">${tHtml('legal.draft_banner')}</p>`,
      onMount: (sheet) => {
        sheet.querySelectorAll('[data-legal-open]').forEach((b) =>
          b.addEventListener('click', () => typeof openLegalSheet === 'function' && openLegalSheet(b.getAttribute('data-legal-open')))
        );
      },
    });
  }

  /** Open Settings with Privacy & data expanded (notifications, links). focus: 'export' | 'delete' | 'tracking' */
  function openPrivacyData(focus) {
    if (focus === 'export' && typeof openAccountDataExport === 'function') return openAccountDataExport();
    if (focus === 'tracking') return openConsentSettings();
    if (focus === 'delete' && typeof openAccountDeletionRequest === 'function') return openAccountDeletionRequest();
    if (typeof openSettingsModal === 'function') openSettingsModal();
    else document.getElementById('settingsBtn')?.click();
    setTimeout(() => {
      const sec = document.getElementById('settingsPrivacyData');
      if (sec) {
        sec.open = true;
        try {
          sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } catch (e) {}
      }
      renderPrivacyData();
    }, 120);
  }

  // ─── Region: US state picker (California → "Do not sell or share") ───
  function renderStateRow() {
    const row = document.getElementById('regionStateRow');
    const sel = document.getElementById('regionStateSelect');
    const R = window.ChaupaalRegion;
    if (!row || !sel || !R) return;
    const isUS = R.getRegion().country === 'US';
    row.hidden = !isUS;
    if (!isUS) return;
    if (!sel.options.length) {
      sel.innerHTML =
        `<option value="">${esc(t('privacy.state_pick'))}</option>` +
        R.US_STATES.map((s) => `<option value="${s}">${esc(s)}</option>`).join('');
    }
    sel.value = R.getRegion().subdivision || '';
  }

  // ─── Boot ───
  function afterAuth() {
    const p = prof();
    if (!p || !me()) {
      applyTeenSurfaces();
      return;
    }
    try {
      P().hydrateFromProfile(p);
    } catch (e) {}
    applyTeenSurfaces();
    maybeShowDeletionBanner();
    renderPrivacyData();
    if (p.deletionStatus === 'scheduled') return;
    const mode = C().dobPromptMode(p);
    if (mode === 'ask') setTimeout(() => openDobPrompt(), 1500);
    else setTimeout(maybeAskLegal, 1800);
  }

  function boot() {
    window.addEventListener('click', guardSignupEntry, true);
    window.addEventListener('click', guardPeepalClick, true);
    watchPeepalTab();
    document.addEventListener('chaupaal:auth', (e) => {
      if (e && e.detail && e.detail.dbReady === false) return;
      afterAuth();
    });
    window.addEventListener('chaupaal:consent-changed', () => renderPrivacyData());
    document.addEventListener('chaupaal:region-changed', () => {
      renderStateRow();
      renderPrivacyData();
      maybeShowConsentBanner();
    });
    document.getElementById('regionStateSelect')?.addEventListener('change', (e) => {
      window.ChaupaalRegion?.setSubdivision(e.target.value || null, { persistRemote: true });
    });
    document.getElementById('settingsPrivacyData')?.addEventListener('toggle', (e) => {
      if (e.target.open) renderPrivacyData();
    });
    document.querySelector('.settings-legal-footer')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-legal]')) document.getElementById('settingsModal')?.classList.add('hidden');
    });
    const dob = document.getElementById('regDob');
    if (dob) dob.max = maxDobValue();
    renderStateRow();
    renderPrivacyData();
    setTimeout(maybeShowConsentBanner, 600);
  }

  window.openConsentSettings = openConsentSettings;
  window.openPrivacyData = openPrivacyData;
  window.openDobPrompt = openDobPrompt;
  window.requireAgeFor = requireAgeFor;
  window.ChaupaalPrivacyUI = {
    maybeShowConsentBanner,
    openConsentSettings,
    showUnderAgeBlock,
    openDobPrompt,
    requireAgeFor,
    applyTeenSurfaces,
    renderPrivacyData,
    openYourData,
    openLegalIndex,
    recordSignupAcceptance,
    signOutDevice,
    afterAuth,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
