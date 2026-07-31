/**
 * Firebase Phone Auth OTP — reliable send / verify / resend.
 *
 * Console / env checklist (OTP never arrives usually means one of these):
 * 1. Firebase Console → Authentication → Sign-in method → Phone: Enabled
 * 2. Blaze billing (SMS quota) + SMS region policy allows India (+91)
 * 3. Authentication → Settings → Authorized domains includes this host
 * 4. App Check: if Auth enforcement is ON, reCAPTCHA v3 site key must match;
 *    Phone Auth still needs RecaptchaVerifier containers in the DOM
 * 5. Dev: Authentication → Phone → Phone numbers for testing (instant codes, no SMS)
 * 6. Production: real SMS; invisible reCAPTCHA may fail — we fall back to visible
 *
 * Parental consent OTP is NOT Firebase SMS — see server-lib/parental-consent.js
 * (parent Chaupaal inbox notification; optional PARENTAL_CONSENT_RETURN_OTP=1).
 */
(function () {
  'use strict';

  const RESEND_MS = 30000;
  const state = Object.create(null);

  function ensureContainer(containerId) {
    let el = document.getElementById(containerId);
    if (el) return el;
    el = document.createElement('div');
    el.id = containerId;
    el.className = 'auth-recaptcha-host';
    el.setAttribute('aria-hidden', 'true');
    const host =
      document.getElementById('authPhonePanel') ||
      document.getElementById('regPhonePanel') ||
      document.getElementById('authOverlay') ||
      document.querySelector('.device') ||
      document.body;
    host.appendChild(el);
    return el;
  }

  /** Normalize India mobiles to E.164; accept already-international numbers. */
  function toE164India(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const digits = s.replace(/\D/g, '');
    if (digits.length === 10) return '+91' + digits;
    if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
    if (digits.length === 11 && digits.startsWith('0')) return '+91' + digits.slice(1);
    if (s.startsWith('+') && digits.length >= 10 && digits.length <= 15) return '+' + digits;
    if (digits.length >= 10 && digits.length <= 15 && digits.startsWith('91')) return '+' + digits;
    return null;
  }

  function mapPhoneAuthError(err) {
    const code = String(err?.code || '');
    const msg = String(err?.message || '');
    if (code === 'auth/invalid-phone-number' || /invalid.*phone/i.test(msg)) {
      return { kind: 'invalid_phone', text: 'Enter a valid 10-digit Indian mobile (+91)' };
    }
    if (code === 'auth/too-many-requests' || /too many/i.test(msg)) {
      return { kind: 'rate_limit', text: 'Too many attempts — wait a few minutes, then resend' };
    }
    if (code === 'auth/quota-exceeded' || /quota/i.test(msg)) {
      return {
        kind: 'quota',
        text: 'SMS quota exceeded. Add a Firebase test number for local/dev, or check billing.',
      };
    }
    if (
      code === 'auth/captcha-check-failed' ||
      code === 'auth/invalid-app-credential' ||
      /captcha|recaptcha|app.?credential/i.test(msg)
    ) {
      return {
        kind: 'captcha',
        text: 'Security check failed — complete the captcha, or try again in a moment',
      };
    }
    if (code === 'auth/code-expired' || /expired/i.test(msg)) {
      return { kind: 'expired', text: 'Code expired — tap Resend for a new OTP' };
    }
    if (
      code === 'auth/invalid-verification-code' ||
      code === 'auth/invalid-verification-id' ||
      /invalid.*code|wrong.*code/i.test(msg)
    ) {
      return { kind: 'wrong', text: 'Incorrect code — check the SMS and try again' };
    }
    if (code === 'auth/missing-verification-code') {
      return { kind: 'not_sent', text: 'Enter the 6-digit code from your SMS' };
    }
    if (code === 'auth/network-request-failed') {
      return { kind: 'network', text: 'Network error — check connection and retry' };
    }
    if (code === 'auth/operation-not-allowed') {
      return {
        kind: 'disabled',
        text: 'Phone sign-in is disabled in Firebase Console (Authentication → Phone)',
      };
    }
    return { kind: 'unknown', text: msg || 'Could not complete phone verification' };
  }

  async function clearVerifier(containerId) {
    const st = state[containerId];
    if (st?.verifier) {
      try {
        st.verifier.clear();
      } catch (e) {}
    }
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = '';
    if (st) {
      st.verifier = null;
      st.mode = null;
    }
  }

  async function createVerifier(containerId, size) {
    if (typeof firebase === 'undefined' || !firebase.auth || !auth) {
      throw Object.assign(new Error('Auth not ready'), { code: 'auth/internal-error' });
    }
    ensureContainer(containerId);
    await clearVerifier(containerId);
    const verifier = new firebase.auth.RecaptchaVerifier(containerId, {
      size: size || 'invisible',
      callback: () => {},
      'expired-callback': () => {
        clearVerifier(containerId).catch(() => {});
      },
    });
    try {
      await verifier.render();
    } catch (e) {
      /* invisible often renders lazily on verify() */
    }
    state[containerId] = state[containerId] || {};
    state[containerId].verifier = verifier;
    state[containerId].mode = size || 'invisible';
    return verifier;
  }

  function cooldownRemaining(containerId) {
    const last = state[containerId]?.lastSendAt || 0;
    return Math.max(0, RESEND_MS - (Date.now() - last));
  }

  /**
   * @returns {Promise<{ confirmation: firebase.auth.ConfirmationResult, phone: string }>}
   */
  async function sendOtp({ phoneRaw, containerId, forceVisible }) {
    const phone = toE164India(phoneRaw);
    if (!phone) {
      const err = Object.assign(new Error('invalid phone'), { code: 'auth/invalid-phone-number' });
      throw err;
    }
    if (!auth) {
      throw Object.assign(new Error('Auth not ready'), { code: 'auth/internal-error' });
    }

    const remain = cooldownRemaining(containerId);
    if (remain > 0 && !forceVisible) {
      const err = Object.assign(
        new Error('Wait ' + Math.ceil(remain / 1000) + 's before resending'),
        { code: 'auth/too-many-requests', cooldownMs: remain }
      );
      throw err;
    }

    let lastErr = null;
    const modes = forceVisible ? ['normal'] : ['invisible', 'normal'];
    for (const mode of modes) {
      try {
        const verifier = await createVerifier(containerId, mode);
        const confirmation = await auth.signInWithPhoneNumber(phone, verifier);
        state[containerId] = state[containerId] || {};
        state[containerId].lastSendAt = Date.now();
        state[containerId].confirmation = confirmation;
        state[containerId].phone = phone;
        return { confirmation, phone, mode };
      } catch (e) {
        lastErr = e;
        await clearVerifier(containerId);
        const mapped = mapPhoneAuthError(e);
        if (mapped.kind === 'rate_limit' || mapped.kind === 'quota' || mapped.kind === 'disabled') {
          throw e;
        }
        /* try next mode */
      }
    }
    throw lastErr || Object.assign(new Error('Could not send OTP'), { code: 'auth/internal-error' });
  }

  async function confirmOtp(containerId, codeRaw) {
    const code = String(codeRaw || '').replace(/\D/g, '').slice(0, 6);
    const confirmation = state[containerId]?.confirmation;
    if (!confirmation) {
      throw Object.assign(new Error('Send OTP first'), { code: 'auth/missing-verification-code' });
    }
    if (code.length !== 6) {
      throw Object.assign(new Error('Enter the 6-digit code'), {
        code: 'auth/invalid-verification-code',
      });
    }
    try {
      const cred = await confirmation.confirm(code);
      state[containerId].confirmation = null;
      await clearVerifier(containerId);
      return cred;
    } catch (e) {
      const mapped = mapPhoneAuthError(e);
      if (mapped.kind === 'expired') {
        state[containerId].confirmation = null;
        await clearVerifier(containerId);
      }
      throw e;
    }
  }

  function wireOtpInput(input, { onComplete, length = 6 } = {}) {
    if (!input || input.dataset.otpWired === '1') return;
    input.dataset.otpWired = '1';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'one-time-code');
    input.setAttribute('maxlength', String(length));
    input.setAttribute('pattern', '[0-9]*');
    input.setAttribute('enterkeyhint', 'done');

    const normalize = () => {
      const v = String(input.value || '').replace(/\D/g, '').slice(0, length);
      if (input.value !== v) input.value = v;
      if (v.length === length && typeof onComplete === 'function') {
        onComplete(v);
      }
    };

    input.addEventListener('input', normalize);
    input.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      const digits = text.replace(/\D/g, '').slice(0, length);
      if (digits) {
        e.preventDefault();
        input.value = digits;
        normalize();
      }
    });
  }

  function paintResendButton(btn, containerId) {
    if (!btn) return;
    const tick = () => {
      const remain = cooldownRemaining(containerId);
      if (remain > 0) {
        btn.disabled = true;
        btn.textContent = 'Resend in ' + Math.ceil(remain / 1000) + 's';
      } else {
        btn.disabled = false;
        btn.textContent = btn.dataset.defaultLabel || 'Resend OTP';
      }
    };
    tick();
    if (btn._otpTimer) clearInterval(btn._otpTimer);
    btn._otpTimer = setInterval(tick, 500);
  }

  window.PhoneOtp = {
    toE164India,
    mapPhoneAuthError,
    sendOtp,
    confirmOtp,
    clearVerifier,
    wireOtpInput,
    paintResendButton,
    cooldownRemaining,
    RESEND_MS,
    getConfirmation(containerId) {
      return state[containerId]?.confirmation || null;
    },
    getLastPhone(containerId) {
      return state[containerId]?.phone || null;
    },
  };
})();
