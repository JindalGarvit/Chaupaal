/**
 * Notice & action UI (Global L9): the unified Report flow, statements of reasons + appeals,
 * "My reports", Settings → Help (grievance officer), and "Why am I seeing this?".
 * Server: api/relationships flag_user → server-lib/moderation createReport; api/media-config
 * moderation_statement / moderation_appeal / moderation_my_reports.
 */
(function () {
  'use strict';

  const REASONS = ['child_safety', 'self_harm', 'violence', 'illegal', 'sexual', 'hate', 'harassment', 'spam', 'impersonation', 'ip', 'other'];
  const LEGAL_BASES = ['csam', 'terrorism', 'hate_speech_law', 'defamation', 'privacy', 'non_consensual_imagery', 'ip', 'fraud', 'illegal_goods', 'other_law'];

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
  function country() {
    try {
      return typeof ChaupaalPrivacy !== 'undefined' ? ChaupaalPrivacy.region().country : 'US';
    } catch (e) {
      return 'US';
    }
  }
  function toast(m) {
    if (typeof showToast === 'function') showToast(m);
  }
  async function api(action, body) {
    const env = await apiFetch('/api/media-config', { method: 'POST', needAuth: true, body: { action, ...(body || {}) } });
    if (!env || !env.ok) throw Object.assign(new Error(env?.error?.message || 'Request failed'), { code: env?.error?.code || 'ERROR' });
    return env.data || {};
  }
  function fmt(ms) {
    return typeof ChaupaalFormat !== 'undefined' ? ChaupaalFormat.formatDate(ms, 'medium') : new Date(ms).toISOString().slice(0, 10);
  }
  function resourcesHtml(list) {
    return `<ul class="cp-report-resources">${list
      .map((r) => `<li><strong>${esc(r.name)}</strong> · <a href="${esc(r.href)}" target="_blank" rel="noopener">${esc(r.contact)}</a></li>`)
      .join('')}</ul>`;
  }

  // ─── Report flow ─────────────────────────────────────────────────────────
  /**
   * @param {{ uid, name }} target  the person whose content / account is reported
   * @param {{ targetType, targetId, postId, chatId, parentId, commentId, snapshot, surface }} opts
   */
  const TYPE_ALIAS = { duniya: 'duniya_post', comment: 'duniya_comment', scribble_player: 'dangal_chat', user: 'profile', chat_rating: 'profile', icebreaker: 'profile' };

  function openReport(target, opts) {
    const o = { ...(opts || {}) };
    o.targetType = TYPE_ALIAS[o.targetType] || o.targetType || 'profile';
    const user = { ...(target || {}) };
    // Rooms / groups without an owner on the client: the chat id is the report's target key.
    if (!user.uid && (o.chatId || o.targetId)) o.ownerUid = 'chat_' + (o.chatId || o.targetId);
    if (!me()) {
      if (typeof requireSignIn === 'function') requireSignIn(t('moderation.sign_in_to_report'));
      return;
    }
    if (typeof openHalfSheet !== 'function') return;
    const state = { reason: null };
    const reasonList = `<div class="cp-report-reasons" role="list">${REASONS.map(
      (r) => `<button type="button" class="flag-option cp-report-reason${r === 'child_safety' || r === 'self_harm' ? ' is-priority' : ''}" data-reason="${r}" role="listitem">
        <strong>${tHtml('moderation.reason_' + r)}</strong><small>${tHtml('moderation.reason_' + r + '_hint')}</small></button>`
    ).join('')}
      ${user.uid ? `<button type="button" class="flag-option" data-block style="color:var(--red);">${tHtml('common.block_name', { name: user.name || t('common.user') })}</button>` : ''}</div>`;
    openHalfSheet({
      id: 'cpReportSheet',
      title: t('moderation.report_title'),
      snap: 'tall',
      bodyHtml: `<p class="toggle-desc">${tHtml('moderation.report_intro')}</p><div data-step>${reasonList}</div>`,
      onMount: (sheet, close) => {
        const step = sheet.querySelector('[data-step]');
        const details = (reason) => {
          const r = country();
          let extra = '';
          if (reason === 'illegal') {
            const countries = typeof ChaupaalRegion !== 'undefined' && ChaupaalRegion.listCountries ? ChaupaalRegion.listCountries() : [{ code: r, name: r }];
            extra = `
              <label class="auth-input-label" for="cpRepCountry">${tHtml('moderation.illegal_country')}</label>
              <select class="modal-select" id="cpRepCountry">${countries.map((c) => `<option value="${esc(c.code)}"${c.code === r ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
              <label class="auth-input-label" for="cpRepBasis">${tHtml('moderation.illegal_basis')}</label>
              <select class="modal-select" id="cpRepBasis"><option value="">${tHtml('moderation.choose')}</option>${LEGAL_BASES.map((b) => `<option value="${b}">${tHtml('moderation.basis_' + b)}</option>`).join('')}</select>
              <input class="auth-input" id="cpRepLaw" maxlength="200" placeholder="${tHtml('moderation.illegal_law_ref')}">
              <label class="cp-check-row"><input type="checkbox" id="cpRepGoodFaith"> <span>${tHtml('moderation.good_faith')}</span></label>`;
          } else if (reason === 'self_harm') {
            extra = `<div class="cp-report-help"><strong>${tHtml('moderation.self_harm_help')}</strong>${resourcesHtml(ChaupaalSafetyResources.selfHarm(r))}</div>`;
          } else if (reason === 'child_safety') {
            extra = `<div class="cp-report-help is-urgent"><p>${tHtml('moderation.child_safety_note')}</p>${resourcesHtml(ChaupaalSafetyResources.childSafety(r))}</div>`;
          }
          const email = me() && me().email ? me().email : '';
          step.innerHTML = `
            ${extra}
            <label class="auth-input-label" for="cpRepDetails">${tHtml('moderation.details_label')}</label>
            <textarea class="auth-input" id="cpRepDetails" maxlength="1000" rows="3" placeholder="${tHtml('moderation.details_ph')}"></textarea>
            <label class="auth-input-label" for="cpRepContact">${tHtml('moderation.contact_label')}</label>
            <input class="auth-input" id="cpRepContact" type="email" maxlength="180" value="${esc(email)}" placeholder="${tHtml('common.your_email_com')}">
            <div class="auth-error" id="cpRepErr" role="alert"></div>
            <button type="button" class="btn btn--primary btn--block" data-submit>${tHtml('moderation.submit')}</button>
            <button type="button" class="auth-guest-btn" data-back>${tHtml('common.back')}</button>`;
        };
        sheet.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b || !sheet.contains(b)) return;
          if (b.dataset.reason) {
            state.reason = b.dataset.reason;
            details(state.reason);
          } else if (b.hasAttribute('data-back')) {
            step.innerHTML = reasonList;
          } else if (b.hasAttribute('data-block')) {
            close();
            if (typeof blockUser === 'function') blockUser(user.uid, user.name);
          } else if (b.hasAttribute('data-submit')) {
            const err = sheet.querySelector('#cpRepErr');
            const report = {
              reason: state.reason,
              reasonCode: state.reason,
              targetType: o.targetType || 'profile',
              targetId: o.targetId || o.postId || o.commentId || user.uid,
              parentId: o.parentId || null,
              surface: o.surface || null,
              snapshot: state.reason === 'child_safety' ? null : o.snapshot || null,
              details: sheet.querySelector('#cpRepDetails')?.value?.trim() || null,
              contact: sheet.querySelector('#cpRepContact')?.value?.trim() || null,
            };
            if (state.reason === 'illegal') {
              report.illegalCountry = sheet.querySelector('#cpRepCountry')?.value;
              report.legalBasis = sheet.querySelector('#cpRepBasis')?.value;
              report.lawRef = sheet.querySelector('#cpRepLaw')?.value?.trim() || null;
              report.goodFaith = !!sheet.querySelector('#cpRepGoodFaith')?.checked;
              if (!report.legalBasis || !report.goodFaith) {
                if (err) err.textContent = t('moderation.illegal_required');
                return;
              }
            }
            b.disabled = true;
            try {
              await flagUser(user.uid || o.ownerUid || '', state.reason, {
                name: user.name,
                username: user.username,
                targetType: report.targetType,
                postId: o.postId || null,
                chatId: o.chatId || null,
                commentId: o.commentId || null,
                customText: report.details,
                silent: true,
                report,
              });
              close();
              toast(t(state.reason === 'child_safety' || state.reason === 'self_harm' ? 'moderation.submitted_priority' : 'moderation.submitted'));
            } catch (e2) {
              b.disabled = false;
              if (err) err.textContent = t('common.couldn_t_submit_report_try_again');
            }
          }
        });
      },
    });
  }

  // ─── Statement of reasons + appeal ───────────────────────────────────────
  function statementHtml(st) {
    const lines = [
      `<p><strong>${tHtml('moderation.sor_action_' + st.action)}</strong></p>`,
      `<p>${tHtml('moderation.sor_rule', { rule: t('moderation.rule_' + st.rule) })}</p>`,
    ];
    if (st.ground === 'illegal' && st.law) lines.push(`<p>${tHtml('moderation.sor_law', { country: st.law.country, basis: t('moderation.basis_' + st.law.basis) })}</p>`);
    if (st.facts) lines.push(`<p>${tHtml('moderation.sor_facts', { facts: st.facts })}</p>`);
    lines.push(`<p>${tHtml(st.automatedDetection ? 'moderation.sor_detected_auto' : 'moderation.sor_detected_report')}</p>`);
    lines.push(`<p>${tHtml(st.automatedDecision ? 'moderation.sor_decided_auto' : 'moderation.sor_decided_human')}</p>`);
    if (st.durationDays) lines.push(`<p>${tHtml('moderation.sor_duration', { days: st.durationDays })}</p>`);
    lines.push(`<p class="toggle-desc">${tHtml('moderation.sor_redress')}</p>`);
    if (st.status === 'reversed') lines.push(`<p class="cp-privacy-note">${tHtml('moderation.sor_reversed')}</p>`);
    return lines.join('');
  }

  async function openStatement(id) {
    if (!me() || typeof openHalfSheet !== 'function') return;
    let st;
    try {
      st = (await api('moderation_statement', { id })).statement;
    } catch (e) {
      toast(typeof errorText === 'function' ? errorText(e, t('errors.generic')) : t('errors.generic'));
      return;
    }
    const ap = st.appeal;
    const canAppeal = !ap && st.status === 'active' && (!st.appealDeadlineMs || Date.now() < st.appealDeadlineMs);
    openHalfSheet({
      id: 'cpStatement',
      title: t('moderation.sor_title'),
      snap: 'tall',
      bodyHtml: `
        <div class="cp-sor" data-sor>${statementHtml(st)}</div>
        <p class="legal-v1-note">${tHtml('moderation.sor_date', { date: fmt(st.createdAtMs) })}</p>
        ${ap ? `<p class="toggle-desc">${tHtml('moderation.appeal_status_' + ap.status)}</p>` : ''}
        ${
          canAppeal
            ? `<label class="auth-input-label" for="cpAppealText">${tHtml('moderation.appeal_label')}</label>
               <textarea class="auth-input" id="cpAppealText" rows="3" maxlength="1000" placeholder="${tHtml('moderation.appeal_ph')}"></textarea>
               <button type="button" class="btn btn--primary btn--block" data-appeal>${tHtml('moderation.appeal_submit')}</button>`
            : ''
        }
        <button type="button" class="btn btn--ghost btn--block" data-legal="guidelines">${tHtml('legal.guidelines_title')}</button>`,
      onMount: (sheet, close) => {
        sheet.querySelector('[data-appeal]')?.addEventListener('click', async (e) => {
          e.target.disabled = true;
          try {
            await api('moderation_appeal', { statementId: id, text: sheet.querySelector('#cpAppealText')?.value || '' });
            close();
            toast(t('moderation.appeal_sent'));
          } catch (err) {
            e.target.disabled = false;
            toast(typeof errorText === 'function' ? errorText(err, t('errors.generic')) : t('errors.generic'));
          }
        });
      },
    });
  }

  async function openMyReports() {
    if (!me() || typeof openHalfSheet !== 'function') return;
    let list = [];
    try {
      list = (await api('moderation_my_reports')).reports || [];
    } catch (e) {}
    openHalfSheet({
      id: 'cpMyReports',
      title: t('moderation.my_reports'),
      bodyHtml: list.length
        ? `<ul class="cp-my-reports">${list
            .map(
              (r) => `<li><strong>${tHtml('moderation.reason_' + r.reason)}</strong> · ${tHtml('moderation.status_' + r.status)}<small>${esc(fmt(r.createdAtMs))}${r.resolveDueMs && r.status === 'in_review' ? ' · ' + tHtml('moderation.resolve_by', { date: fmt(r.resolveDueMs) }) : ''}</small></li>`
            )
            .join('')}</ul>`
        : `<p class="toggle-desc">${tHtml('moderation.no_reports')}</p>`,
    });
  }

  /** Settings → Help: grievance officer (India IT Rules) + contact points. */
  function renderHelp() {
    const host = document.getElementById('helpHost');
    if (!host) return;
    host.innerHTML = `
      <p class="toggle-desc">${tHtml('moderation.help_intro')}</p>
      <div class="cp-grievance">
        <strong>${tHtml('moderation.grievance_title')}</strong>
        <p class="toggle-desc">${tHtml('moderation.grievance_body')}</p>
      </div>
      <button type="button" class="settings-link-row" data-help="reports"><span class="settings-link-icon" aria-hidden="true">🛡️</span><span class="settings-link-text"><strong>${tHtml('moderation.my_reports')}</strong><small>${tHtml('moderation.my_reports_sub')}</small></span><span class="settings-link-chevron" aria-hidden="true">›</span></button>
      <button type="button" class="settings-link-row" data-legal="contact"><span class="settings-link-icon" aria-hidden="true">✉️</span><span class="settings-link-text"><strong>${tHtml('legal.contact_title')}</strong><small>${tHtml('moderation.contact_sub')}</small></span><span class="settings-link-chevron" aria-hidden="true">›</span></button>
      <button type="button" class="settings-link-row" data-legal="recommendations"><span class="settings-link-icon" aria-hidden="true">🧭</span><span class="settings-link-text"><strong>${tHtml('legal.recommendations_title')}</strong><small>${tHtml('moderation.recs_sub')}</small></span><span class="settings-link-chevron" aria-hidden="true">›</span></button>`;
    host.querySelector('[data-help="reports"]')?.addEventListener('click', () => {
      document.getElementById('settingsModal')?.classList.add('hidden');
      openMyReports();
    });
    host.querySelectorAll('[data-legal]').forEach((b) => b.addEventListener('click', () => document.getElementById('settingsModal')?.classList.add('hidden')));
  }

  // ─── "Why am I seeing this?" ─────────────────────────────────────────────
  const WHY = [
    [/^From someone you follow$/, 'moderation.why_follow'],
    [/^(Similar to your interests|Fits your interests|Topic overlap with your interests)$/, 'moderation.why_interest_general'],
    [/^Matches your interest in (.+)$/, 'moderation.why_interest'],
    [/^Shared interest: (.+)$/, 'moderation.why_interest'],
    [/^Trending now$/, 'moderation.why_trending'],
    [/^New voice$/, 'moderation.why_new_voice'],
    [/^Fresh$/, 'moderation.why_fresh'],
    [/^Fits games you play$/, 'moderation.why_games'],
    [/^Game of the Day$/, 'moderation.why_gotd'],
    [/^Pinned$/, 'moderation.why_pinned'],
    [/^Your new post$/, 'moderation.why_own'],
    [/^(Same city|Nearby)$/, 'moderation.why_nearby'],
    [/^Both active recently$/, 'moderation.why_active'],
    [/^Similar to people you liked$/, 'moderation.why_people'],
    [/^New on Chaupaal$/, 'moderation.why_new_member'],
  ];

  /** Plain-language reasons for an item (server explain codes, or already-localised reason lines). */
  function whyReasons(item, surface) {
    const out = [];
    (Array.isArray(item && item._whyText) ? item._whyText : []).forEach((s) => s && out.push(esc(s)));
    (Array.isArray(item && item._rankExplain) ? item._rankExplain : []).forEach((code) => {
      const hit = WHY.find(([re]) => re.test(String(code)));
      if (hit) {
        const m = hit[0].exec(String(code));
        out.push(tHtml(hit[1], { tag: m && m[1] ? m[1] : '' }));
      }
    });
    if (!out.length) out.push(tHtml(surface === 'akhbaar' ? 'moderation.why_akhbaar' : surface === 'dangal' ? 'moderation.why_dangal' : 'moderation.why_recent'));
    return [...new Set(out)];
  }

  function openWhyThis(item, opts) {
    const o = opts || {};
    if (typeof openHalfSheet !== 'function') return;
    const personal = typeof ChaupaalPrivacy === 'undefined' || !me() ? false : ChaupaalPrivacy.prefs().personalizedRecs;
    openHalfSheet({
      id: 'cpWhyThis',
      title: t('moderation.why_title'),
      bodyHtml: `
        <ul class="legal-v1-list" data-why>${whyReasons(item, o.surface).map((r) => `<li>${r}</li>`).join('')}</ul>
        <p class="toggle-desc">${tHtml(personal ? 'moderation.why_personal_on' : 'moderation.why_personal_off')}</p>
        ${me() ? `<button type="button" class="btn btn--secondary btn--block" data-why-optout>${tHtml(personal ? 'moderation.why_turn_off' : 'moderation.why_settings')}</button>` : ''}
        <button type="button" class="btn btn--ghost btn--block" data-legal="recommendations">${tHtml('legal.recommendations_title')}</button>`,
      onMount: (sheet, close) => {
        sheet.querySelector('[data-why-optout]')?.addEventListener('click', () => {
          close();
          if (typeof openPrivacyData === 'function') openPrivacyData();
        });
      },
    });
  }

  // ─── Wiring: Dangal party chat long-press, notification deep links, Help section ───
  document.addEventListener('contextmenu', (e) => {
    const row = e.target.closest && e.target.closest('.pk-chat-msg[data-report-chat]');
    if (!row || !row.dataset.reportChat) return;
    e.preventDefault();
    openReport({ uid: row.dataset.reportChat, name: row.dataset.reportName }, {
      targetType: 'dangal_chat',
      targetId: row.closest('[data-chat]')?.dataset.chat || row.dataset.reportChat,
      snapshot: (row.textContent || '').slice(0, 500),
      surface: 'dangal',
    });
  });
  // Push deep links (server-lib/notifications.js hrefFromDeepLink): ?moderation=<id> · ?reports=1 · ?privacy=<focus>
  document.addEventListener('chaupaal:auth', (e) => {
    if (e && e.detail && e.detail.dbReady === false) return;
    try {
      const q = new URLSearchParams(location.search);
      if (q.get('moderation')) openStatement(q.get('moderation'));
      else if (q.get('reports')) openMyReports();
      else if (q.get('privacy') && typeof openPrivacyData === 'function') openPrivacyData(q.get('privacy'));
    } catch (err) {}
  });
  document.addEventListener('DOMContentLoaded', renderHelp);
  if (document.readyState !== 'loading') renderHelp();
  document.getElementById('settingsHelpSection')?.addEventListener('toggle', renderHelp);

  window.openReport = openReport;
  window.openFlagSheet = openReport;
  window.openStatement = openStatement;
  window.openMyReports = openMyReports;
  window.openWhyThis = openWhyThis;
  window.ChaupaalReport = { REASONS, LEGAL_BASES, openReport, openStatement, openMyReports, openWhyThis, whyReasons, statementHtml, renderHelp };
})();
