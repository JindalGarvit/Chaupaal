/**
 * Public web page to request account deletion (Global L9 — Google Play "delete account" URL).
 * Sign-in is required: the request is sent with the account's own ID token, so nobody can ask to
 * delete someone else's account. Same server path as in-app (30-day grace, then the L8 purge).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChaupaalDeletePage = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function canSubmit(state) {
    return !!(state && state.user && state.ack && !state.busy);
  }

  /** POST request_account_deletion with the signed-in user's token. Throws NOT_SIGNED_IN otherwise. */
  async function submit(state, deps) {
    if (!state || !state.user || typeof state.user.getIdToken !== 'function') throw Object.assign(new Error('Sign in first'), { code: 'NOT_SIGNED_IN' });
    if (!state.ack) throw Object.assign(new Error('Confirm first'), { code: 'NOT_CONFIRMED' });
    const token = await state.user.getIdToken();
    const res = await deps.fetch('/api/media-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action: 'request_account_deletion', confirm: 'delete' }),
    });
    const json = await res.json().catch(() => null);
    if (!json || !json.ok) throw Object.assign(new Error((json && json.error && json.error.message) || 'Request failed'), { code: (json && json.error && json.error.code) || 'ERROR' });
    return json.data || {};
  }

  function mount() {
    if (typeof document === 'undefined') return;
    const $ = (id) => document.getElementById(id);
    const tr = (k, p) => (typeof t === 'function' ? t(k, p) : k);
    const state = { user: null, ack: false, busy: false };
    const paint = () => {
      const signed = !!state.user;
      $('wdSignedOut').hidden = signed;
      $('wdSignedIn').hidden = !signed;
      if (signed) $('wdAccount').textContent = state.user.email || state.user.phoneNumber || state.user.uid;
      $('wdSubmit').disabled = !canSubmit(state);
    };
    const msg = (k, p, isErr) => {
      const el = $('wdMsg');
      el.textContent = tr(k, p);
      el.className = isErr ? 'wd-msg is-err' : 'wd-msg';
    };
    if (typeof auth === 'undefined' || !auth) {
      msg('privacy.webdel_unavailable', {}, true);
      return;
    }
    auth.onAuthStateChanged((u) => {
      state.user = u;
      paint();
    });
    $('wdLogin').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await auth.signInWithEmailAndPassword($('wdEmail').value.trim(), $('wdPassword').value);
        msg('privacy.webdel_signed_in');
      } catch (err) {
        msg('privacy.webdel_sign_in_failed', {}, true);
      }
    });
    $('wdGoogle').addEventListener('click', async () => {
      try {
        await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
      } catch (err) {
        msg('privacy.webdel_sign_in_failed', {}, true);
      }
    });
    $('wdAck').addEventListener('change', (e) => {
      state.ack = e.target.checked;
      paint();
    });
    $('wdSignOut').addEventListener('click', () => auth.signOut());
    $('wdSubmit').addEventListener('click', async () => {
      state.busy = true;
      paint();
      try {
        const out = await submit(state, { fetch: window.fetch.bind(window) });
        const date = typeof ChaupaalFormat !== 'undefined' ? ChaupaalFormat.formatDate(out.purgeAfterMs || Date.now() + 30 * 86400000, 'medium') : '';
        msg('privacy.delete_scheduled', { date });
        await auth.signOut();
      } catch (err) {
        msg('privacy.webdel_failed', {}, true);
      } finally {
        state.busy = false;
        paint();
      }
    });
    paint();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
  return { canSubmit, submit, mount };
});
