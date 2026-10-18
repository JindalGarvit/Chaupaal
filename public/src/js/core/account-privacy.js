/**
 * Lightweight account export + delete-account request (P3 / 10B).
 * Uses /api/media-config — no new Hobby function.
 */
(function () {
  'use strict';

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function openAccountDataExport() {
    if (!currentUser) {
      if (typeof requireSignIn === 'function') requireSignIn(t('settings.sign_in_to_export'));
      return;
    }
    if (typeof showToast === 'function') showToast(t('settings.preparing_your_export'));
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'export_account_data' },
      });
      if (!envelope?.ok) throw Object.assign(new Error(envelope?.error?.message || 'Export failed'), { code: envelope?.error?.code });
      const payload = envelope.data?.export || envelope.export;
      if (!payload) throw new Error('Empty export');
      const uname = (typeof userProfile !== 'undefined' && userProfile?.username) || 'me';
      downloadJson(`chaupaal-export-${uname}-${new Date().toISOString().slice(0, 10)}.json`, payload); // i18n-ignore (file name)
      if (typeof showToast === 'function') showToast(t('settings.export_downloaded'));
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast(errorText(e, t('settings.could_not_export')));
      }
    }
  }

  async function openAccountDeletionRequest() {
    if (!currentUser) {
      if (typeof requireSignIn === 'function') requireSignIn(t('common.sign_in'));
      return;
    }
    const ok = confirm(
      t('settings.request_account_deletion_you_will_be')
    );
    if (!ok) return;
    const typed = prompt(t('settings.type_delete_to_confirm_account_deletion'), '');
    if (String(typed || '').trim().toUpperCase() !== 'DELETE') {
      if (typeof showToast === 'function') showToast(t('settings.deletion_cancelled'));
      return;
    }
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'request_account_deletion', confirm: 'delete' },
      });
      if (!envelope?.ok) throw Object.assign(new Error(envelope?.error?.message || 'Request failed'), { code: envelope?.error?.code });
      const msg =
        envelope.data?.message ||
        t('settings.deletion_requested_signing_you_out');
      if (typeof showToast === 'function') showToast(msg);
      try {
        await apiFetch('/api/revoke-sessions', { method: 'POST', needAuth: true, body: {} });
      } catch (e) {}
      try {
        if (typeof auth !== 'undefined' && auth?.signOut) await auth.signOut();
        else if (typeof firebase !== 'undefined' && firebase.auth) await firebase.auth().signOut();
      } catch (e) {}
      try {
        localStorage.removeItem('chaupaal_device_accounts');
      } catch (e) {}
      location.reload();
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast(errorText(e, t('settings.could_not_request_deletion')));
      }
    }
  }

  window.openAccountDataExport = openAccountDataExport;
  window.openAccountDeletionRequest = openAccountDeletionRequest;
})();
