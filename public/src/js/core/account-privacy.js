/**
 * Data rights (P3 → Global L8): "Download my data" (async ZIP export job + expiring link) and
 * "Delete my account" (30-day grace, log in to cancel, then a hard purge). /api/media-config only.
 */
(function () {
  'use strict';

  function signedIn() {
    try {
      return typeof currentUser !== 'undefined' && !!currentUser;
    } catch (e) {
      return false;
    }
  }
  async function api(action, body) {
    const env = await apiFetch('/api/media-config', { method: 'POST', needAuth: true, body: { action, ...(body || {}) } });
    if (!env || !env.ok) throw Object.assign(new Error(env?.error?.message || 'Request failed'), { code: env?.error?.code || 'ERROR' });
    return env.data || {};
  }
  function fmt(ms) {
    return typeof ChaupaalFormat !== 'undefined' ? ChaupaalFormat.formatDate(ms, 'medium') : new Date(ms).toISOString().slice(0, 10);
  }
  function err(e, key) {
    return typeof errorText === 'function' ? errorText(e, t(key)) : t(key);
  }

  function exportBody(job) {
    if (!job) return `<p class="toggle-desc">${tHtml('privacy.export_intro')}</p>`;
    if (job.status === 'ready' && job.downloadUrl) {
      const url = new URL(job.downloadUrl, location.origin).href;
      return `
        <p class="toggle-desc">${tHtml('privacy.export_ready', { date: fmt(job.expiresAtMs) })}</p>
        ${job.mediaSkipped ? `<p class="toggle-desc">${tHtml('privacy.export_media_skipped', { count: job.mediaSkipped })}</p>` : ''}
        <a class="btn btn--primary btn--block" href="${url}" download rel="noopener" data-export-download>${tHtml('privacy.export_download')}</a>`;
    }
    if (job.status === 'queued' || job.status === 'building') return `<p class="toggle-desc" aria-live="polite">${tHtml('privacy.export_building')}</p>`;
    if (job.status === 'expired') return `<p class="toggle-desc">${tHtml('privacy.export_expired')}</p>`;
    return `<p class="toggle-desc">${tHtml('privacy.export_failed')}</p>`;
  }

  async function openAccountDataExport() {
    if (!signedIn()) {
      if (typeof requireSignIn === 'function') requireSignIn(t('settings.sign_in_to_export'));
      return;
    }
    if (typeof openHalfSheet !== 'function') return;
    let job = null;
    try {
      job = (await api('export_status')).job;
    } catch (e) {}
    openHalfSheet({
      id: 'cpExportSheet',
      title: t('common.download_my_data'),
      bodyHtml: `
        <div data-export-state>${exportBody(job)}</div>
        <p class="toggle-desc">${tHtml('privacy.export_contents')}</p>
        <button type="button" class="btn btn--secondary btn--block" data-export-start>${tHtml('privacy.export_request')}</button>
        <p class="legal-v1-note">${tHtml('privacy.export_limits')}</p>`,
      onMount: (sheet) => {
        const state = sheet.querySelector('[data-export-state]');
        const startBtn = sheet.querySelector('[data-export-start]');
        const paint = (j) => {
          job = j;
          if (state) state.innerHTML = exportBody(j);
          if (startBtn) startBtn.hidden = !!(j && (j.status === 'ready' || j.status === 'queued' || j.status === 'building'));
        };
        paint(job);
        let polls = 0;
        const poll = async () => {
          if (!sheet.isConnected || polls++ > 12 || !job || (job.status !== 'queued' && job.status !== 'building')) return;
          try {
            paint((await api('export_status')).job);
          } catch (e) {}
          setTimeout(poll, 5000);
        };
        startBtn?.addEventListener('click', async () => {
          startBtn.disabled = true;
          if (state) state.innerHTML = `<p class="toggle-desc" aria-live="polite">${tHtml('privacy.export_building')}</p>`;
          try {
            paint((await api('request_export')).job);
            setTimeout(poll, 4000);
          } catch (e) {
            if (typeof showToast === 'function') showToast(err(e, 'settings.could_not_export'));
            paint(job);
          } finally {
            startBtn.disabled = false;
          }
        });
        setTimeout(poll, 3000);
      },
    });
  }

  async function openAccountDeletionRequest() {
    if (!signedIn()) {
      if (typeof requireSignIn === 'function') requireSignIn(t('common.sign_in'));
      return;
    }
    if (typeof openHalfSheet !== 'function') return;
    openHalfSheet({
      id: 'cpDeleteSheet',
      title: t('privacy.delete_label'),
      snap: 'tall',
      bodyHtml: `
        <p class="toggle-desc">${tHtml('privacy.delete_intro')}</p>
        <ul class="legal-v1-list">
          <li>${tHtml('privacy.delete_step_grace')}</li>
          <li>${tHtml('privacy.delete_step_purge')}</li>
          <li>${tHtml('privacy.delete_step_others')}</li>
          <li>${tHtml('privacy.delete_step_retained')}</li>
        </ul>
        <button type="button" class="btn btn--secondary btn--block" data-del-export>${tHtml('privacy.delete_export_first')}</button>
        <label class="cp-check-row"><input type="checkbox" data-del-ack> <span>${tHtml('privacy.delete_ack')}</span></label>
        <button type="button" class="btn btn--primary btn--danger btn--block" data-del-go disabled>${tHtml('privacy.delete_confirm')}</button>`,
      onMount: (sheet, close) => {
        const go = sheet.querySelector('[data-del-go]');
        sheet.querySelector('[data-del-ack]')?.addEventListener('change', (e) => {
          if (go) go.disabled = !e.target.checked;
        });
        sheet.querySelector('[data-del-export]')?.addEventListener('click', () => {
          close();
          openAccountDataExport();
        });
        go?.addEventListener('click', async () => {
          go.disabled = true;
          try {
            const out = await api('request_account_deletion', { confirm: 'delete' });
            close();
            if (typeof showToast === 'function') showToast(t('privacy.delete_scheduled', { date: fmt(out.purgeAfterMs || Date.now() + 30 * 86400000) }));
            if (typeof ChaupaalPrivacyUI !== 'undefined') await ChaupaalPrivacyUI.signOutDevice();
            setTimeout(() => location.reload(), 900);
          } catch (e) {
            go.disabled = false;
            if (typeof showToast === 'function') showToast(err(e, 'settings.could_not_request_deletion'));
          }
        });
      },
    });
  }

  window.openAccountDataExport = openAccountDataExport;
  window.openAccountDeletionRequest = openAccountDeletionRequest;
})();
