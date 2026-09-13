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
      if (typeof requireSignIn === 'function') requireSignIn('Sign in to export');
      return;
    }
    if (typeof showToast === 'function') showToast('Preparing your export…');
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'export_account_data' },
      });
      if (!envelope?.ok) throw new Error(envelope?.error?.message || 'Export failed');
      const payload = envelope.data?.export || envelope.export;
      if (!payload) throw new Error('Empty export');
      const uname = (typeof userProfile !== 'undefined' && userProfile?.username) || 'me';
      downloadJson(`chaupaal-export-${uname}-${new Date().toISOString().slice(0, 10)}.json`, payload);
      if (typeof showToast === 'function') showToast('Export downloaded');
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast(typeof friendlyError === 'function' ? friendlyError(e) : e?.message || 'Could not export');
      }
    }
  }

  async function openAccountDeletionRequest() {
    if (!currentUser) {
      if (typeof requireSignIn === 'function') requireSignIn('Sign in');
      return;
    }
    const ok = confirm(
      'Request account deletion?\n\nYou will be signed out. Access is revoked now. Full data purge (posts, media, login) completes within about 30 days. This cannot be undone from the app after you confirm.'
    );
    if (!ok) return;
    const typed = prompt('Type DELETE to confirm account deletion:', '');
    if (String(typed || '').trim().toUpperCase() !== 'DELETE') {
      if (typeof showToast === 'function') showToast('Deletion cancelled');
      return;
    }
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'request_account_deletion', confirm: 'delete' },
      });
      if (!envelope?.ok) throw new Error(envelope?.error?.message || 'Request failed');
      const msg =
        envelope.data?.message ||
        'Deletion requested. Signing you out.';
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
        showToast(typeof friendlyError === 'function' ? friendlyError(e) : e?.message || 'Could not request deletion');
      }
    }
  }

  window.openAccountDataExport = openAccountDataExport;
  window.openAccountDeletionRequest = openAccountDeletionRequest;
})();
