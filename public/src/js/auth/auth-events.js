// ===================== AUTH STATE MACHINE v4 =====================
// Signup: Personal-default / Pro toggle → identity → email/password or phone (+ optional)
// Login: username | email | phone + password (resolve_identifier) · verify banner (no kickback)

let regData = emptyRegData();

let usernameCheckTimer = null;
let authEventsWired = false;
let industryStatsCache = null;
let purposeStatsCache = null;
let pendingPasswordNudgeContinue = null;

const FALLBACK_INDUSTRIES = [
  'Technology',
  'Media & Entertainment',
  'Education',
  'Healthcare',
  'Finance',
  'Retail',
  'Government',
  'Creative / Design',
];
const FALLBACK_PURPOSES = [
  'Grow my business',
  'Find clients',
  'Hire talent',
  'Content & audience',
  'Networking',
  'Fundraising',
  'Partnerships',
  'Brand building',
];

const LOGIN_GENERIC_ERR = 'Incorrect username/email/phone or password';
const EMAIL_VERIFY_DISMISS_KEY = 'chaupaal_email_verify_banner_dismissed';

function emptyRegData() {
  return {
    profileType: 'personal',
    name: '',
    username: '',
    gender: '',
    genderSelfDescribe: false,
    dob: '',
    age: 0,
    email: '',
    phone: '',
    city: '',
    lang: 'en',
    password: '',
    industry: '',
    purpose: '',
    intents: [],
    customIntent: '',
    openToMeet: true,
    photoFile: null,
    usernameAvailable: false,
  };
}

function showAuthScreen(screenId, direction = 'forward') {
  const screens = [
    'authHeroScreen',
    'authLoginScreen',
    'authPasswordNudgeScreen',
    'authRegStep1',
    'authRegStep2',
    'authRegStep3',
    'authSuccessScreen',
  ];
  screens.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === screenId) {
      el.classList.remove('hidden');
      el.style.animation =
        direction === 'back' ? 'authSlideBack .3s var(--ease-out)' : 'authSlideIn .3s var(--ease-out)';
    } else {
      el.classList.add('hidden');
    }
  });
}

function showAuth() {
  document.getElementById('authOverlay')?.classList.remove('hidden');
  showAuthScreen('authHeroScreen');
  regData = emptyRegData();
  wireAuthEvents();
  syncRegProfileTypeUi();
}

function hideAuth() {
  document.getElementById('authOverlay')?.classList.add('hidden');
}

function ageFromDob(dob) {
  if (!dob) return 0;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
}

function looksLikeEmail(raw) {
  return /\S+@\S+\.\S+/.test(String(raw || '').trim());
}

function normalizeStatKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

async function fetchTopStats(collectionName, fallback) {
  if (!db) return fallback.map((label) => ({ label, key: normalizeStatKey(label) }));
  try {
    const snap = await db.collection(collectionName).orderBy('count', 'desc').limit(8).get();
    if (snap.empty) return fallback.map((label) => ({ label, key: normalizeStatKey(label) }));
    return snap.docs.map((d) => ({
      key: d.id,
      label: d.data()?.label || d.id,
      count: d.data()?.count || 0,
    }));
  } catch (e) {
    return fallback.map((label) => ({ label, key: normalizeStatKey(label) }));
  }
}

function renderPicklist(hostId, items, field, otherInputId) {
  const host = document.getElementById(hostId);
  const other = document.getElementById(otherInputId);
  if (!host) return;
  const selected = regData[field] || '';
  const isOther =
    selected && !items.some((it) => it.label === selected || it.key === normalizeStatKey(selected));
  host.innerHTML =
    items
      .map((it) => {
        const on = selected === it.label;
        return `<button type="button" class="auth-pick-chip${on ? ' active' : ''}" data-val="${String(it.label).replace(/"/g, '&quot;')}">${it.label}</button>`;
      })
      .join('') +
    `<button type="button" class="auth-pick-chip${isOther ? ' active' : ''}" data-val="__other__">Other — type your own</button>`;
  if (other) {
    other.classList.toggle('hidden', !isOther);
    if (isOther) other.value = selected;
  }
  host.querySelectorAll('.auth-pick-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      if (val === '__other__') {
        regData[field] = other?.value?.trim() || '';
        if (other) {
          other.classList.remove('hidden');
          other.focus();
        }
      } else {
        regData[field] = val;
        if (other) {
          other.classList.add('hidden');
          other.value = '';
        }
      }
      renderPicklist(hostId, items, field, otherInputId);
    });
  });
}

async function ensureProPicklists() {
  if (!industryStatsCache) {
    industryStatsCache = await fetchTopStats('industryStats', FALLBACK_INDUSTRIES);
  }
  if (!purposeStatsCache) {
    purposeStatsCache = await fetchTopStats('purposeStats', FALLBACK_PURPOSES);
  }
  renderPicklist('regIndustryPicklist', industryStatsCache, 'industry', 'regIndustryOther');
  renderPicklist('regPurposePicklist', purposeStatsCache, 'purpose', 'regPurposeOther');
}

function syncRegProfileTypeUi() {
  const type = regData.profileType === 'professional' ? 'professional' : 'personal';
  document.querySelectorAll('#regProfileTypeRow [data-profile-type]').forEach((btn) => {
    const on = btn.dataset.profileType === type;
    btn.classList.toggle('active', on);
  });
  const genderReq = document.getElementById('regGenderRequired');
  const genderHint = document.getElementById('regGenderHint');
  if (genderReq) genderReq.style.display = type === 'personal' ? 'inline' : 'none';
  if (genderHint) {
    genderHint.textContent =
      type === 'personal'
        ? 'Required for Personal accounts'
        : 'Optional for Professional accounts — you can add it later';
  }
  const pro = document.getElementById('regProFields');
  if (pro) {
    pro.classList.toggle('hidden', type !== 'professional');
    if (type === 'professional') ensureProPicklists();
  }
  const custom = document.getElementById('regGenderCustom');
  if (custom) custom.classList.toggle('hidden', !regData.genderSelfDescribe);
}

function syncGenderUi() {
  document.querySelectorAll('#regGenderChips .auth-gender-chip').forEach((c) => {
    const val = c.dataset.val || '';
    const on = regData.genderSelfDescribe ? val === 'self_describe' : val === regData.gender;
    c.classList.toggle('active', on);
  });
  const custom = document.getElementById('regGenderCustom');
  if (custom) custom.classList.toggle('hidden', !regData.genderSelfDescribe);
}

async function checkUsernameAvailability(username) {
  const hint = document.getElementById('usernameHint');
  if (!hint) return false;
  if (!username || username.length < 3) {
    hint.textContent = 'At least 3 characters';
    hint.style.color = 'var(--red)';
    regData.usernameAvailable = false;
    return false;
  }
  if (username.length > 20) {
    hint.textContent = 'Max 20 characters';
    hint.style.color = 'var(--red)';
    regData.usernameAvailable = false;
    return false;
  }
  hint.textContent = 'Checking availability…';
  hint.style.color = 'var(--muted)';
  try {
    let available = true;
    if (typeof apiFetch === 'function') {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        body: { action: 'username_check', username },
      });
      if (envelope?.ok && envelope.data && envelope.data.available === false) available = false;
    } else if (db && auth?.currentUser) {
      const snap = await db.collection('usernames').doc(username).get();
      available = !snap.exists;
    }
    if (!available) {
      hint.textContent = 'Taken — try another';
      hint.style.color = 'var(--red)';
      regData.usernameAvailable = false;
      return false;
    }
    hint.textContent = 'Available';
    hint.style.color = '#2ECC71';
    regData.usernameAvailable = true;
    return true;
  } catch (e) {
    hint.textContent = 'Couldn’t check right now — we’ll retry on create';
    hint.style.color = 'var(--muted)';
    regData.usernameAvailable = true;
    return true;
  }
}

/** Common disposable / throwaway email domains — keep short; expand later if needed. */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com','guerrillamail.com','guerrillamail.net','sharklasers.com','grr.la',
  'tempmail.com','temp-mail.org','throwaway.email','yopmail.com','yopmail.fr',
  'trashmail.com','discard.email','10minutemail.com','getnada.com','maildrop.cc',
  'mailnesia.com','fakeinbox.com','tempail.com','emailondeck.com','moakt.com',
]);

function isDisposableEmail(email) {
  const domain = String(email || '').trim().toLowerCase().split('@')[1] || '';
  return !!(domain && DISPOSABLE_EMAIL_DOMAINS.has(domain));
}

/** Email/password accounts must verify; Google + verified phone count as verified contact. */
function hasVerifiedContact(user) {
  if (!user) return false;
  if (user.emailVerified) return true;
  if (user.phoneNumber) return true;
  const providers = user.providerData || [];
  if (providers.some((p) => p.providerId === 'google.com')) return true;
  return false;
}

function userHasPasswordProvider(user) {
  return !!(user?.providerData || []).some((p) => p.providerId === 'password');
}

async function writePhoneIndex(user, email) {
  if (!db || !user?.uid || !user.phoneNumber) return;
  try {
    await db
      .collection('phoneIndex')
      .doc(user.phoneNumber)
      .set(
        {
          uid: user.uid,
          email: String(email || user.email || '').trim().toLowerCase(),
        },
        { merge: true }
      );
  } catch (e) {
    console.warn('[auth] phoneIndex', e);
  }
}

async function bumpStat(collectionName, label) {
  const key = normalizeStatKey(label);
  if (!db || !key || !auth?.currentUser) return;
  try {
    await db
      .collection(collectionName)
      .doc(key)
      .set(
        {
          count: firebase.firestore.FieldValue.increment(1),
          label: String(label).trim().slice(0, 80),
        },
        { merge: true }
      );
  } catch (e) {
    console.warn('[auth] bumpStat', collectionName, e);
  }
}

async function linkEmailPassword(user, email, password) {
  if (!user || !email || !password) throw new Error('Email and password required');
  if (isDisposableEmail(email)) throw new Error('Please use a permanent email address');
  const cred = firebase.auth.EmailAuthProvider.credential(email, password);
  await user.linkWithCredential(cred);
  try {
    await user.sendEmailVerification();
  } catch (e) {}
  if (db) {
    await db.collection('users').doc(user.uid).set(
      {
        email,
        needsEmailForPasswordLogin: false,
      },
      { merge: true }
    );
  }
  await writePhoneIndex(user, email);
}

/** Persistent verify banner — dismissible for this session, returns on next load if still unverified. */
function syncEmailVerifyBanner() {
  const u = auth?.currentUser;
  const existing = document.getElementById('emailVerifyBanner');
  if (!u || hasVerifiedContact(u)) {
    existing?.remove();
    return;
  }
  try {
    if (sessionStorage.getItem(EMAIL_VERIFY_DISMISS_KEY) === u.uid) {
      existing?.remove();
      return;
    }
  } catch (e) {}

  let el = existing;
  if (!el) {
    el = document.createElement('div');
    el.id = 'emailVerifyBanner';
    el.className = 'email-verify-banner';
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <div class="email-verify-banner-text">
        <strong>Verify your email</strong>
        <span>Confirm your address to keep your account secure.</span>
      </div>
      <div class="email-verify-banner-actions">
        <button type="button" class="btn btn--primary" data-verify-resend>Resend verification email</button>
        <button type="button" class="email-verify-banner-dismiss" data-verify-dismiss aria-label="Dismiss">✕</button>
      </div>`;
    const host = document.querySelector('.device') || document.body;
    const topbar = document.getElementById('topbar');
    if (topbar?.parentNode) topbar.parentNode.insertBefore(el, topbar.nextSibling);
    else host.insertBefore(el, host.firstChild);

    el.querySelector('[data-verify-resend]')?.addEventListener('click', async () => {
      try {
        await auth.currentUser?.reload();
        if (hasVerifiedContact(auth.currentUser)) {
          syncEmailVerifyBanner();
          if (typeof showToast === 'function') showToast('Email verified — thank you!');
          return;
        }
        await auth.currentUser.sendEmailVerification();
        if (typeof showToast === 'function') showToast('Verification email sent');
      } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Could not send email');
      }
    });
    el.querySelector('[data-verify-dismiss]')?.addEventListener('click', () => {
      try {
        sessionStorage.setItem(EMAIL_VERIFY_DISMISS_KEY, u.uid);
      } catch (e) {}
      el.remove();
    });
  }
}

window.syncEmailVerifyBanner = syncEmailVerifyBanner;
window.hasVerifiedContact = hasVerifiedContact;

function wireAuthEvents() {
  if (authEventsWired) return;
  authEventsWired = true;

  document.getElementById('heroSignupBtn')?.addEventListener('click', () => {
    regData = emptyRegData();
    syncRegProfileTypeUi();
    syncGenderUi();
    showAuthScreen('authRegStep1');
  });
  document.getElementById('heroLoginBtn')?.addEventListener('click', () => showAuthScreen('authLoginScreen'));
  document.getElementById('authSkip')?.addEventListener('click', hideAuth);

  document.getElementById('loginBackBtn')?.addEventListener('click', () => showAuthScreen('authHeroScreen', 'back'));
  document.getElementById('loginToSignup')?.addEventListener('click', () => {
    regData = emptyRegData();
    syncRegProfileTypeUi();
    syncGenderUi();
    showAuthScreen('authRegStep1');
  });
  document.getElementById('toggleLoginPwd')?.addEventListener('click', () => {
    const inp = document.getElementById('loginPassword');
    const btn = document.getElementById('toggleLoginPwd');
    if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    if (btn && typeof iconHtml === 'function') {
      btn.innerHTML = iconHtml(show ? 'eye-off' : 'eye', { size: 18 });
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.dataset.iconHydrated = '1';
    }
  });
  document.getElementById('forgotPasswordBtn')?.addEventListener('click', async () => {
    const raw = document.getElementById('loginIdentifier')?.value.trim();
    const errEl = document.getElementById('loginError');
    if (!raw) {
      if (errEl) errEl.textContent = 'Enter your username, email, or phone first';
      return;
    }
    let email = looksLikeEmail(raw) ? raw.toLowerCase() : '';
    if (!email && typeof apiFetch === 'function') {
      try {
        const envelope = await apiFetch('/api/media-config', {
          method: 'POST',
          body: { action: 'resolve_identifier', identifier: raw },
        });
        email = envelope?.data?.email || '';
      } catch (e) {}
    }
    if (!email) {
      if (errEl) errEl.textContent = 'Enter the email on your account to reset your password';
      return;
    }
    if (auth)
      auth
        .sendPasswordResetEmail(email)
        .then(() => showToast(t('auth_reset_sent')))
        .catch((e) => showToast(t('auth_error_prefix', { msg: e.message })));
  });

  // ---- Google / Phone (verified contact required) ----
  let loginConfirmation = null;
  let regConfirmation = null;
  let regPhoneVerified = '';
  let loginRecaptcha = null;
  let regRecaptcha = null;

  function toE164India(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 10) return '+91' + digits;
    if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
    if (String(raw || '').startsWith('+') && digits.length >= 10) return '+' + digits.replace(/^\+/, '');
    return null;
  }

  async function finishAuthSession(welcomeMsg) {
    if (typeof trackLogin === 'function') trackLogin();
    hideAuth();
    updateProfileBtn();
    if (typeof loadStreak === 'function') loadStreak();
    if (typeof initActivityStatus === 'function') initActivityStatus();
    syncEmailVerifyBanner();
    showToast(welcomeMsg || t('auth_welcome'));
  }

  function showPasswordNudge(thenContinue) {
    pendingPasswordNudgeContinue = thenContinue;
    const u = auth?.currentUser;
    const emailGroup = document.getElementById('nudgeEmailGroup');
    const emailInp = document.getElementById('nudgeEmail');
    if (u?.email) {
      if (emailGroup) emailGroup.classList.add('hidden');
      if (emailInp) emailInp.value = u.email;
    } else {
      if (emailGroup) emailGroup.classList.remove('hidden');
      if (emailInp) emailInp.value = '';
    }
    const err = document.getElementById('nudgeError');
    if (err) err.textContent = '';
    showAuthScreen('authPasswordNudgeScreen');
  }

  async function ensureUserDocAfterSocial(user, extras = {}) {
    if (!db || !user) return;
    const ref = db.collection('users').doc(user.uid);
    const snap = await ref.get();
    if (snap.exists) {
      if (typeof AuthProfiles !== 'undefined' && AuthProfiles.hydrateActiveProfile) {
        await AuthProfiles.hydrateActiveProfile(user.uid, snap.data());
      }
      return snap.data();
    }
    currentUser = user;
    regData.email = user.email || extras.email || '';
    regData.phone = user.phoneNumber || extras.phone || '';
    regData.name = user.displayName || '';
    showAuthScreen('authRegStep1');
    showToast(t('auth_choose_username'));
    return null;
  }

  document.getElementById('loginGoogleBtn')?.addEventListener('click', async () => {
    const errEl = document.getElementById('loginError');
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await auth.signInWithPopup(provider);
      currentUser = cred.user;
      const doc = await ensureUserDocAfterSocial(cred.user);
      if (doc) await finishAuthSession(t('auth_welcome_back'));
    } catch (e) {
      if (errEl)
        errEl.textContent =
          e.code === 'auth/popup-closed-by-user' ? 'Google sign-in cancelled' : e.message || 'Google sign-in failed';
    }
  });

  document.getElementById('loginPhoneBtn')?.addEventListener('click', () => {
    document.getElementById('authPhonePanel')?.classList.toggle('hidden');
  });
  document.getElementById('regPhoneBtn')?.addEventListener('click', () => {
    document.getElementById('regPhonePanel')?.classList.toggle('hidden');
  });
  document.getElementById('regGoogleBtn')?.addEventListener('click', async () => {
    const errEl = document.getElementById('reg2Error') || document.getElementById('reg1Error');
    try {
      if (!regData.username || !regData.usernameAvailable) {
        if (errEl) errEl.textContent = 'Finish step 1 (username) first';
        showAuthScreen('authRegStep1', 'back');
        return;
      }
      const provider = new firebase.auth.GoogleAuthProvider();
      const cred = await auth.signInWithPopup(provider);
      currentUser = cred.user;
      regData.email = cred.user.email || '';
      const emailEl = document.getElementById('regEmail');
      if (emailEl) emailEl.value = regData.email;
      document.getElementById('registerBtn')?.click();
    } catch (e) {
      if (errEl) errEl.textContent = e.message || 'Google sign-up failed';
    }
  });

  document.getElementById('loginPhoneSendOtp')?.addEventListener('click', async () => {
    const errEl = document.getElementById('loginError');
    const phone = toE164India(document.getElementById('loginPhone')?.value);
    if (!phone) {
      if (errEl) errEl.textContent = 'Enter a valid 10-digit Indian mobile number';
      return;
    }
    try {
      if (!loginRecaptcha) {
        loginRecaptcha = new firebase.auth.RecaptchaVerifier('recaptcha-container', { size: 'invisible' });
      }
      loginConfirmation = await auth.signInWithPhoneNumber(phone, loginRecaptcha);
      showToast(t('auth_otp_sent'));
    } catch (e) {
      if (errEl) errEl.textContent = e.message || 'Could not send OTP';
    }
  });

  document.getElementById('loginPhoneVerifyOtp')?.addEventListener('click', async () => {
    const errEl = document.getElementById('loginError');
    const code = document.getElementById('loginPhoneOtp')?.value.trim();
    if (!loginConfirmation || !code) {
      if (errEl) errEl.textContent = 'Send OTP first, then enter the code';
      return;
    }
    try {
      const cred = await loginConfirmation.confirm(code);
      currentUser = cred.user;
      await writePhoneIndex(cred.user, cred.user.email || '');
      const doc = await ensureUserDocAfterSocial(cred.user, { phone: cred.user.phoneNumber });
      if (!doc) return;
      if (!userHasPasswordProvider(cred.user)) {
        showPasswordNudge(() => finishAuthSession(t('auth_welcome_back')));
        return;
      }
      await finishAuthSession(t('auth_welcome_back'));
    } catch (e) {
      if (errEl) errEl.textContent = e.message || 'Invalid OTP';
    }
  });

  document.getElementById('nudgePasswordSave')?.addEventListener('click', async () => {
    const errEl = document.getElementById('nudgeError');
    const u = auth?.currentUser;
    if (!u) return;
    const email = (document.getElementById('nudgeEmail')?.value || u.email || '').trim().toLowerCase();
    const pwd = document.getElementById('nudgePassword')?.value || '';
    if (!email || !looksLikeEmail(email)) {
      if (errEl) errEl.textContent = 'Enter a valid email';
      return;
    }
    if (!pwd || pwd.length < 8) {
      if (errEl) errEl.textContent = 'Password must be at least 8 characters';
      return;
    }
    try {
      await linkEmailPassword(u, email, pwd);
      const cont = pendingPasswordNudgeContinue;
      pendingPasswordNudgeContinue = null;
      if (cont) await cont();
      else await finishAuthSession(t('auth_welcome_back'));
    } catch (e) {
      if (errEl)
        errEl.textContent =
          e.code === 'auth/email-already-in-use'
            ? 'That email is already linked to another account'
            : e.message || 'Could not save password';
    }
  });
  document.getElementById('nudgePasswordLater')?.addEventListener('click', async () => {
    const cont = pendingPasswordNudgeContinue;
    pendingPasswordNudgeContinue = null;
    if (cont) await cont();
    else await finishAuthSession(t('auth_welcome_back'));
  });

  document.getElementById('regPhoneSendOtp')?.addEventListener('click', async () => {
    const errEl = document.getElementById('reg2Error') || document.getElementById('registerError');
    const phone = toE164India(
      document.getElementById('regPhoneOtpInput')?.value || document.getElementById('regPhone')?.value
    );
    if (!phone) {
      if (errEl) errEl.textContent = 'Enter a valid 10-digit Indian mobile number';
      return;
    }
    try {
      if (!regRecaptcha) {
        regRecaptcha = new firebase.auth.RecaptchaVerifier('recaptcha-container-reg', { size: 'invisible' });
      }
      regConfirmation = await auth.signInWithPhoneNumber(phone, regRecaptcha);
      showToast(t('auth_otp_sent'));
    } catch (e) {
      if (errEl) errEl.textContent = e.message || 'Could not send OTP';
    }
  });

  document.getElementById('regPhoneVerifyOtp')?.addEventListener('click', async () => {
    const errEl = document.getElementById('reg2Error') || document.getElementById('registerError');
    const code = document.getElementById('regPhoneOtpCode')?.value.trim();
    if (!regConfirmation || !code) {
      if (errEl) errEl.textContent = 'Send OTP first, then enter the code';
      return;
    }
    try {
      const cred = await regConfirmation.confirm(code);
      currentUser = cred.user;
      regPhoneVerified = cred.user.phoneNumber || '';
      regData.phone = regPhoneVerified;
      await writePhoneIndex(cred.user, cred.user.email || document.getElementById('regEmail')?.value || '');
      const hint = document.getElementById('regPhoneVerifiedHint');
      if (hint) {
        hint.style.display = 'block';
        hint.textContent = `Phone verified ✓ ${regPhoneVerified}`;
      }
      // Surface password + email so phone accounts can use identifier login later
      const pwdHint = document.getElementById('regPassword')?.closest('.auth-input-group')?.querySelector('.auth-input-hint');
      if (pwdHint) {
        pwdHint.textContent =
          'Recommended after phone verify — set email + password to log in without OTP next time.';
      }
      showToast(t('auth_phone_verified'));
    } catch (e) {
      if (errEl) errEl.textContent = e.message || 'Invalid OTP';
    }
  });

  document.getElementById('loginBtn')?.addEventListener('click', async () => {
    const identifier = document.getElementById('loginIdentifier')?.value.trim();
    const pwd = document.getElementById('loginPassword')?.value;
    const errEl = document.getElementById('loginError');
    if (!identifier || !pwd) {
      errEl.textContent = 'Please fill in all fields';
      return;
    }
    const btn = document.getElementById('loginBtn');
    if (typeof setButtonLoading === 'function') setButtonLoading(btn, true, 'Logging in');
    else {
      btn.textContent = 'Logging in...';
      btn.disabled = true;
    }
    try {
      let email = looksLikeEmail(identifier) ? identifier.toLowerCase() : '';
      if (!email) {
        if (typeof apiFetch !== 'function') throw Object.assign(new Error('resolve_unavailable'), { code: 'resolve' });
        const envelope = await apiFetch('/api/media-config', {
          method: 'POST',
          body: { action: 'resolve_identifier', identifier },
        });
        email = envelope?.data?.email || '';
        if (!email || envelope?.data?.notFound) {
          errEl.textContent = LOGIN_GENERIC_ERR;
          return;
        }
      }
      await auth.signInWithEmailAndPassword(email, pwd);
      const u = auth?.currentUser;
      currentUser = u;
      // Do NOT sign out when email unverified — enter app + banner
      await finishAuthSession(t('auth_welcome_back'));
      if (u && !hasVerifiedContact(u)) {
        try {
          await u.sendEmailVerification();
        } catch (e) {}
        syncEmailVerifyBanner();
      }
    } catch (e) {
      errEl.textContent =
        e.code === 'auth/wrong-password' ||
        e.code === 'auth/user-not-found' ||
        e.code === 'auth/invalid-credential' ||
        e.code === 'auth/invalid-email' ||
        e.code === 'resolve'
          ? LOGIN_GENERIC_ERR
          : LOGIN_GENERIC_ERR;
    } finally {
      if (typeof setButtonLoading === 'function') setButtonLoading(btn, false);
      else {
        btn.textContent = 'Log in →';
        btn.disabled = false;
      }
    }
  });
  document.getElementById('loginIdentifier')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('loginPassword')?.focus();
  });
  document.getElementById('loginPassword')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('loginBtn')?.click();
  });

  // ---- Step 1 ----
  document.getElementById('reg1BackBtn')?.addEventListener('click', () => showAuthScreen('authHeroScreen', 'back'));

  document.querySelectorAll('#regProfileTypeRow [data-profile-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      regData.profileType = btn.dataset.profileType === 'professional' ? 'professional' : 'personal';
      syncRegProfileTypeUi();
    });
  });

  document.querySelectorAll('#regGenderChips .auth-gender-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.val || '';
      if (val === 'self_describe') {
        regData.genderSelfDescribe = true;
        regData.gender = document.getElementById('regGenderCustom')?.value.trim() || '';
      } else {
        regData.genderSelfDescribe = false;
        regData.gender = val;
        const custom = document.getElementById('regGenderCustom');
        if (custom) custom.value = '';
      }
      syncGenderUi();
    });
  });
  document.getElementById('regGenderCustom')?.addEventListener('input', (e) => {
    if (regData.genderSelfDescribe) regData.gender = String(e.target.value || '').trim().slice(0, 40);
  });
  document.getElementById('regIndustryOther')?.addEventListener('input', (e) => {
    regData.industry = String(e.target.value || '').trim().slice(0, 80);
  });
  document.getElementById('regPurposeOther')?.addEventListener('input', (e) => {
    regData.purpose = String(e.target.value || '').trim().slice(0, 80);
  });

  document.getElementById('regUsername')?.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    e.target.value = val;
    regData.username = val;
    regData.usernameAvailable = false;
    clearTimeout(usernameCheckTimer);
    usernameCheckTimer = setTimeout(() => checkUsernameAvailability(val), 320);
  });

  document.getElementById('reg1Next')?.addEventListener('click', async () => {
    const name = document.getElementById('regName')?.value.trim();
    const username = document.getElementById('regUsername')?.value.trim().toLowerCase();
    const dob = document.getElementById('regDob')?.value;
    const errEl = document.getElementById('reg1Error');
    if (regData.genderSelfDescribe) {
      regData.gender = document.getElementById('regGenderCustom')?.value.trim() || '';
    }
    if (!name) {
      errEl.textContent = 'Please enter your full name';
      return;
    }
    if (!username || username.length < 3) {
      errEl.textContent = 'Username must be at least 3 characters';
      return;
    }
    if (!dob) {
      errEl.textContent = 'Date of birth required';
      return;
    }
    const age = ageFromDob(dob);
    if (age < 16) {
      errEl.textContent = 'You must be 16 or older to join';
      return;
    }
    if (regData.profileType === 'personal' && !regData.gender) {
      errEl.textContent = regData.genderSelfDescribe
        ? 'Please describe your gender'
        : 'Please choose a gender for your Personal account';
      return;
    }
    errEl.textContent = 'Checking username…';
    const available = await checkUsernameAvailability(username);
    if (!available) {
      errEl.textContent = 'That username is taken — pick another';
      return;
    }
    errEl.textContent = '';
    regData.name = name;
    regData.username = username;
    regData.dob = dob;
    regData.age = age;
    if (regData.profileType === 'professional') {
      const indOther = document.getElementById('regIndustryOther');
      const purOther = document.getElementById('regPurposeOther');
      if (indOther && !indOther.classList.contains('hidden')) {
        regData.industry = indOther.value.trim();
      }
      if (purOther && !purOther.classList.contains('hidden')) {
        regData.purpose = purOther.value.trim();
      }
    } else {
      regData.industry = '';
      regData.purpose = '';
    }
    showAuthScreen('authRegStep2');
  });

  // ---- Step 2 (credentials + optional) ----
  document.getElementById('reg2BackBtn')?.addEventListener('click', () => showAuthScreen('authRegStep1', 'back'));

  const photoInput = document.getElementById('photoInput');
  const photoPreview = document.getElementById('photoPreview');
  photoInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    regData.photoFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      photoPreview.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
    };
    reader.readAsDataURL(file);
  });
  photoPreview?.addEventListener('click', () => photoInput?.click());

  document.getElementById('regPassword')?.addEventListener('input', (e) => {
    const pwd = e.target.value;
    const strengthEl = document.getElementById('pwdStrength');
    const fillEl = document.getElementById('pwdStrengthFill');
    const labelEl = document.getElementById('pwdStrengthLabel');
    if (!pwd) {
      strengthEl.style.display = 'none';
      return;
    }
    strengthEl.style.display = 'flex';
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    const levels = [
      { pct: 20, color: '#E74C3C', label: 'Weak' },
      { pct: 40, color: '#E67E22', label: 'Fair' },
      { pct: 65, color: '#F1C40F', label: 'Good' },
      { pct: 85, color: '#2ECC71', label: 'Strong' },
      { pct: 100, color: '#27AE60', label: 'Very strong' },
    ];
    const lv = levels[Math.min(score, 4)];
    fillEl.style.width = lv.pct + '%';
    fillEl.style.background = lv.color;
    labelEl.textContent = lv.label;
    labelEl.style.color = lv.color;
  });

  document.getElementById('toggleRegPwd')?.addEventListener('click', () => {
    const inp = document.getElementById('regPassword');
    const btn = document.getElementById('toggleRegPwd');
    if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    if (btn && typeof iconHtml === 'function') {
      btn.innerHTML = iconHtml(show ? 'eye-off' : 'eye', { size: 18 });
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.dataset.iconHydrated = '1';
    }
  });

  document.querySelectorAll('#intentChips .auth-intent-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      const val = chip.dataset.val;
      const customInp = document.getElementById('intentCustomInput');
      if (val === 'Something else') {
        if (chip.classList.contains('active')) {
          customInp?.classList.remove('hidden');
          customInp?.focus();
          if (!regData.intents.includes('Something else')) regData.intents.push('Something else');
        } else {
          customInp?.classList.add('hidden');
          regData.intents = regData.intents.filter((v) => v !== 'Something else' && v !== regData.customIntent);
          regData.customIntent = '';
          if (customInp) customInp.value = '';
        }
        return;
      }
      if (chip.classList.contains('active')) {
        if (!regData.intents.includes(val)) regData.intents.push(val);
      } else {
        regData.intents = regData.intents.filter((v) => v !== val);
      }
    });
  });
  document.getElementById('intentCustomInput')?.addEventListener('input', (e) => {
    regData.customIntent = String(e.target.value || '').trim().slice(0, 80);
  });

  document.getElementById('openToMeetYes')?.addEventListener('click', () => {
    document.getElementById('openToMeetYes')?.classList.add('active');
    document.getElementById('openToMeetNo')?.classList.remove('active');
    regData.openToMeet = true;
  });
  document.getElementById('openToMeetNo')?.addEventListener('click', () => {
    document.getElementById('openToMeetNo')?.classList.add('active');
    document.getElementById('openToMeetYes')?.classList.remove('active');
    regData.openToMeet = false;
  });

  document.getElementById('registerBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('regEmail')?.value.trim();
    const pwd = document.getElementById('regPassword')?.value;
    const errEl = document.getElementById('registerError') || document.getElementById('reg2Error');
    const phoneOk = !!(regPhoneVerified || auth?.currentUser?.phoneNumber);
    const googleOk = !!(
      auth?.currentUser?.email && auth.currentUser.providerData?.some((p) => p.providerId === 'google.com')
    );
    const emailOk = email && looksLikeEmail(email) && pwd && pwd.length >= 8;

    if (!emailOk && !phoneOk && !googleOk) {
      errEl.textContent = 'Verify email+password, Google, or phone OTP to create an account';
      return;
    }
    // Phone path: if email entered, password is required to link for identifier login
    if (phoneOk && !googleOk && !userHasPasswordProvider(auth?.currentUser)) {
      if (email && (!pwd || pwd.length < 8)) {
        errEl.textContent = 'Set a password (min 8 characters) with your email, or leave email blank for now';
        return;
      }
      if (pwd && !email) {
        errEl.textContent = 'Enter an email to pair with your password, or leave both blank';
        return;
      }
    }
    if (emailOk && isDisposableEmail(email)) {
      errEl.textContent = 'Please use a permanent email address (not a temporary inbox)';
      return;
    }
    if (emailOk && !phoneOk && !googleOk && (!pwd || pwd.length < 8)) {
      errEl.textContent = 'Password must be at least 8 characters';
      return;
    }
    if (!regData.usernameAvailable) {
      const ok = await checkUsernameAvailability(regData.username);
      if (!ok) {
        errEl.textContent = 'Username is no longer available — go back and pick another';
        return;
      }
    }

    regData.email = email || auth?.currentUser?.email || '';
    regData.password = pwd || '';
    regData.phone =
      regPhoneVerified || document.getElementById('regPhone')?.value.trim() || auth?.currentUser?.phoneNumber || '';
    regData.city = document.getElementById('regCity')?.value.trim() || '';
    regData.lang = document.getElementById('regLanguage')?.value || 'en';
    if (typeof setAppLanguage === 'function') setAppLanguage(regData.lang, { persistRemote: false });

    const btn = document.getElementById('registerBtn');
    if (typeof setButtonLoading === 'function') setButtonLoading(btn, true, 'Creating account');
    else {
      btn.textContent = 'Creating account...';
      btn.disabled = true;
    }

    try {
      let photoURL = '';
      let photoThumb = '';

      if (auth) {
        let credUser = auth.currentUser;
        if (!credUser && emailOk) {
          const cred = await auth.createUserWithEmailAndPassword(regData.email, regData.password);
          credUser = cred.user;
          try {
            await credUser.sendEmailVerification();
          } catch (e) {}
        }
        if (!credUser) throw new Error('Sign in with Google or verify phone first');
        currentUser = credUser;

        // Phone-only signup: link email+password when provided
        if (phoneOk && emailOk && !userHasPasswordProvider(credUser)) {
          try {
            await linkEmailPassword(credUser, regData.email, regData.password);
          } catch (e) {
            if (e.code === 'auth/email-already-in-use') {
              throw Object.assign(new Error('That email is already in use'), { code: 'auth/email-already-in-use' });
            }
            throw e;
          }
        } else if (phoneOk && credUser.phoneNumber) {
          await writePhoneIndex(credUser, regData.email || credUser.email || '');
        }

        if (regData.photoFile && typeof uploadOptimizedImage === 'function') {
          try {
            const ready = typeof isMediaUploadReady === 'function' ? await isMediaUploadReady() : true;
            if (ready) {
              const up = await uploadOptimizedImage(regData.photoFile, { folder: 'avatars' });
              photoURL = up.media;
              photoThumb = up.thumb;
            } else if (typeof compressImageFile === 'function') {
              const compressed = await compressImageFile(regData.photoFile, 'avatar');
              photoURL = compressed.previewUrl;
            }
          } catch (e) {
            try {
              if (typeof compressImageFile === 'function') {
                const compressed = await compressImageFile(regData.photoFile, 'avatar');
                photoURL = compressed.previewUrl;
              }
            } catch (e2) {}
          }
        }

        await credUser.updateProfile({ displayName: regData.name, photoURL: photoURL || undefined });

        const profileType = regData.profileType === 'professional' ? 'professional' : 'personal';
        const intentList = [...regData.intents];
        if (regData.customIntent) {
          const idx = intentList.indexOf('Something else');
          if (idx >= 0) intentList[idx] = regData.customIntent;
          else if (!intentList.includes(regData.customIntent)) intentList.push(regData.customIntent);
        }
        const primaryIntent = intentList.find((i) => i && i !== 'Something else') || '';
        const needsEmailForPasswordLogin = !!(
          phoneOk &&
          !userHasPasswordProvider(credUser) &&
          !regData.email
        );
        const profile = {
          name: regData.name,
          username: regData.username,
          email: regData.email || credUser.email || '',
          phone: regData.phone || credUser.phoneNumber || '',
          emailVerified: !!credUser.emailVerified || googleOk,
          phoneVerified: !!(regPhoneVerified || credUser.phoneNumber),
          city: regData.city,
          lang: regData.lang,
          gender: regData.gender || '',
          dob: regData.dob,
          age: regData.age,
          dateOfBirth: regData.dob,
          photoURL,
          photoThumb: photoThumb || null,
          profileType,
          industry: profileType === 'professional' ? regData.industry || '' : '',
          purpose: profileType === 'professional' ? regData.purpose || '' : '',
          needsEmailForPasswordLogin,
          openToMeet: regData.openToMeet,
          strangerDailyLimit: 10,
          intents: intentList,
          matchIntent: primaryIntent,
          lookingFor: primaryIntent,
          streak: 0,
          lastPlayed: '',
          streakFreezes: 0,
          categoryRatings: {},
          gameRatings: {},
          nameLower: String(regData.name || '')
            .toLowerCase()
            .trim(),
          usernameLower: String(regData.username || '')
            .toLowerCase()
            .trim(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          uid: credUser.uid,
          activeProfileId: 'primary',
          profile: {
            profileType,
            displayName: regData.name,
            username: regData.username,
            gender: regData.gender || '',
            dateOfBirth: regData.dob,
            age: regData.age,
            currentCity: regData.city || '',
            lookingFor: primaryIntent,
            industry: profileType === 'professional' ? regData.industry || '' : '',
            purpose: profileType === 'professional' ? regData.purpose || '' : '',
          },
        };

        if (db) {
          const existingUser = await db.collection('users').doc(credUser.uid).get();
          if (existingUser.exists && existingUser.data()?.username) {
            throw Object.assign(new Error('ACCOUNT_EXISTS'), { code: 'account-exists' });
          }
          if (typeof AuthProfiles !== 'undefined' && AuthProfiles.createProfile) {
            await AuthProfiles.createProfile(credUser.uid, {
              id: 'primary',
              username: regData.username,
              name: regData.name,
              photoURL,
              photoThumb,
              profileType,
              gender: regData.gender,
              dob: regData.dob,
              age: regData.age,
              city: regData.city,
            });
          } else {
            const unameRef = db.collection('usernames').doc(regData.username);
            const existing = await unameRef.get();
            if (existing.exists) {
              throw Object.assign(new Error('USERNAME_TAKEN'), { code: 'username-taken' });
            }
            await unameRef.set({ uid: credUser.uid, profileId: 'primary' });
          }
          await db.collection('users').doc(credUser.uid).set(profile, { merge: true });
          if (profileType === 'professional') {
            if (regData.industry) await bumpStat('industryStats', regData.industry);
            if (regData.purpose) await bumpStat('purposeStats', regData.purpose);
          }
          try {
            if (typeof UsersPublic?.syncPublicProfile === 'function') {
              await UsersPublic.syncPublicProfile(credUser.uid, profile);
            }
          } catch (e) {}
        }

        userProfile = profile;
        window.activeProfileId = 'primary';
        try {
          localStorage.setItem('chaupaal_active_profile_id', 'primary');
        } catch (e) {}
        if (typeof digitalProfile !== 'undefined') {
          digitalProfile.displayName = regData.name;
          digitalProfile.username = regData.username;
          digitalProfile.currentCity = regData.city || '';
          digitalProfile.gender = regData.gender || '';
          digitalProfile.dateOfBirth = regData.dob;
          digitalProfile.age = regData.age;
          digitalProfile.profileType = profileType;
          digitalProfile.lookingFor = primaryIntent;
          try {
            localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
          } catch (e) {}
        }
        if (typeof saveProfileType === 'function') saveProfileType(profileType);
        if (typeof trackSignup === 'function') trackSignup({ has_photo: !!photoURL, profile_type: profileType });

        if (regData.openToMeet) {
          openToMeet = true;
          try {
            localStorage.setItem('chaupaal_open_to_meet', 'true');
          } catch (e) {}
        }
      }

      showAuthScreen('authSuccessScreen');
      const firstName = regData.name.split(' ')[0];
      const typeLabel = regData.profileType === 'professional' ? 'Professional' : 'Personal';
      document.getElementById('authSuccessTitle').textContent = `Welcome, ${firstName}!`;
      const needsEmailVerify = !!(
        emailOk &&
        !googleOk &&
        !phoneOk &&
        auth?.currentUser &&
        !auth.currentUser.emailVerified
      );
      let desc = `${typeLabel} account ready.`;
      if (needsEmailVerify) desc = `${typeLabel} account created — verify your email when you can.`;
      else if (phoneOk && !regData.email)
        desc += ' Add an email in your profile to enable password login with your phone number.';
      else if (emailOk && !googleOk) desc += ' Check your email to verify your address.';
      document.getElementById('authSuccessDesc').textContent = regData.intents.length
        ? `${desc} You're here to: ${regData.intents.slice(0, 2).join(' & ')}.`
        : `${desc} Add a bio and prompts anytime.`;
      if (typeof launchConfetti === 'function') launchConfetti({ x: 50, y: 40 }, 80);

      const cta = document.getElementById('authSuccessCta');
      if (cta) {
        cta.textContent = 'Enter Chaupaal';
        if (!cta.dataset.wired) {
          cta.dataset.wired = '1';
          cta.addEventListener('click', async () => {
            try {
              if (auth?.currentUser) await auth.currentUser.reload();
            } catch (e) {}
            hideAuth();
            updateProfileBtn();
            if (typeof loadStreak === 'function') loadStreak();
            syncEmailVerifyBanner();
          });
        }
      }
    } catch (e) {
      console.warn('[auth] register', e);
      errEl.textContent =
        e.code === 'username-taken' || e.code === 'auth/email-already-in-use'
          ? 'That email or username is already taken'
          : e.code === 'account-exists'
            ? 'Account already exists — log in instead'
            : e.message || 'Could not create account';
    } finally {
      if (typeof setButtonLoading === 'function') setButtonLoading(btn, false);
      else if (btn) {
        btn.textContent = 'Create my account';
        btn.disabled = false;
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => wireAuthEvents());
