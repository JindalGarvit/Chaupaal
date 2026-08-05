// ===================== AUTH STATE MACHINE v6 =====================
// Signup: one Profile canvas (identity + optional extras + credentials)
// Login: username | email | phone + password · phone OTP · Google · device multi-account
// OTP: PhoneOtp helper (invisible→visible reCAPTCHA, resend cooldown, actionable errors)

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
    'authWelcomeBackScreen',
    'authLoginScreen',
    'authPasswordNudgeScreen',
    'authRegStep1',
    'authRegStep2',
    'authRegStep3',
    'authParentalConsentScreen',
    'authSuccessScreen',
  ];
  // One-canvas signup: never park on empty legacy step shells
  if (screenId === 'authRegStep2' || screenId === 'authRegStep3') {
    screenId = 'authRegStep1';
  }
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
  const scroll = document.getElementById('authRegScroll') || document.querySelector(`#${screenId} .auth-form-body`);
  if (scroll) {
    try {
      scroll.scrollTop = 0;
    } catch (e) {}
  }
  try {
    if (typeof restoreAppShell === 'function' && (screenId === 'authHeroScreen' || screenId === 'authSuccessScreen')) {
      restoreAppShell('auth_screen:' + screenId);
    }
  } catch (e) {}
}

function showAuth() {
  document.getElementById('authOverlay')?.classList.remove('hidden');
  try {
    if (typeof restoreAppShell === 'function') restoreAppShell('auth_open');
  } catch (e) {}
  wireAuthEvents();
  syncRegProfileTypeUi();
  const last = typeof readLastUser === 'function' ? readLastUser() : null;
  if (last?.username || last?.name) {
    paintWelcomeBack(last);
    showAuthScreen('authWelcomeBackScreen');
  } else {
    showAuthScreen('authHeroScreen');
    regData = emptyRegData();
  }
}

function paintWelcomeBack(last) {
  const title = document.getElementById('welcomeBackTitle');
  const sub = document.getElementById('welcomeBackSub');
  const av = document.getElementById('welcomeBackAvatar');
  const handle = last.username ? '@' + last.username : last.name || 'friend';
  if (title) title.textContent = `Welcome back, ${handle}`;
  if (sub) {
    sub.textContent = auth?.currentUser
      ? 'One tap to continue on this device'
      : 'Sign in to continue as this person';
  }
  if (av) {
    if (last.photoURL) {
      av.innerHTML = `<img src="${String(last.photoURL).replace(/"/g, '')}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      av.textContent = (last.name || last.username || '?')[0].toUpperCase();
    }
  }
}

function hideAuth() {
  document.getElementById('authOverlay')?.classList.add('hidden');
  try {
    if (typeof restoreAppShell === 'function') restoreAppShell('auth_close');
  } catch (e) {}
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
  syncSignupProgress();
}

function syncGenderUi() {
  document.querySelectorAll('#regGenderChips .auth-gender-chip').forEach((c) => {
    const val = c.dataset.val || '';
    const on = regData.genderSelfDescribe ? val === 'self_describe' : val === regData.gender;
    c.classList.toggle('active', on);
  });
  const custom = document.getElementById('regGenderCustom');
  if (custom) custom.classList.toggle('hidden', !regData.genderSelfDescribe);
  syncSignupProgress();
}

function syncSignupProgress() {
  const name = !!document.getElementById('regName')?.value?.trim();
  const un = (document.getElementById('regUsername')?.value || '').trim().length >= 3;
  const dob = !!document.getElementById('regDob')?.value;
  const genderOk =
    regData.profileType !== 'personal' ||
    !!(regData.genderSelfDescribe
      ? document.getElementById('regGenderCustom')?.value?.trim()
      : regData.gender);
  const city = !!document.getElementById('regCity')?.value?.trim();
  const photo = !!regData.photoFile;
  const intents = (regData.intents || []).length > 0;
  const email = !!document.getElementById('regEmail')?.value?.trim();
  const pwd = (document.getElementById('regPassword')?.value || '').length >= 8;
  const phoneHint = document.getElementById('regPhoneVerifiedHint');
  const phone = !!(phoneHint && phoneHint.style.display !== 'none' && phoneHint.style.display !== '');
  const checks = [
    { on: name, w: 18 },
    { on: un, w: 18 },
    { on: dob, w: 14 },
    { on: genderOk, w: 10 },
    { on: photo, w: 12 },
    { on: city, w: 10 },
    { on: intents, w: 8 },
    { on: email || pwd || phone, w: 10 },
  ];
  let earned = 0;
  let total = 0;
  checks.forEach((c) => {
    total += c.w;
    if (c.on) earned += c.w;
  });
  const pct = Math.round((earned / Math.max(total, 1)) * 100);
  const pctEl = document.getElementById('authSignupPct');
  const barEl = document.getElementById('authSignupBar');
  const hintEl = document.getElementById('authSignupHint');
  if (pctEl) {
    pctEl.textContent = pct + '%';
    pctEl.style.color = pct >= 70 ? 'var(--green,#33C481)' : 'var(--red)';
  }
  if (barEl) {
    barEl.style.width = pct + '%';
    barEl.style.background = pct >= 70 ? '#2ECC71' : 'var(--red)';
  }
  if (hintEl) {
    if (!name || !un || !dob) hintEl.textContent = 'Name, username & birthday unlock your Profile';
    else if (!photo) hintEl.textContent = 'Photo optional — people see a real you';
    else if (!city) hintEl.textContent = 'City helps nearby matches';
    else if (!intents) hintEl.textContent = 'Intents → better Peepal matches (optional)';
    else hintEl.textContent = 'Looking good — add account access below to finish';
  }
}

function syncAuthCanvasPreview() {
  const name = document.getElementById('regName')?.value?.trim() || 'Your name';
  const un = document.getElementById('regUsername')?.value?.trim() || 'username';
  const city = document.getElementById('regCity')?.value?.trim() || '';
  const nEl = document.getElementById('authCanvasLiveName');
  const hEl = document.getElementById('authCanvasLiveHandle');
  const mEl = document.getElementById('authCanvasLiveMeta');
  if (nEl) nEl.textContent = name;
  if (hEl) hEl.textContent = '@' + un.replace(/^@/, '');
  if (mEl) mEl.textContent = city || 'Add your city';
  syncSignupProgress();
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
    // Privacy-preserving contact match index (SHA-256 of E.164) — never raw contacts
    if (window.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user.phoneNumber));
      const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      await db.collection('phoneHashIndex').doc(hash).set({ uid: user.uid, updatedAt: Date.now() }, { merge: true });
    }
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

/** Verify banner — escalating dismiss cooldowns + resend cooldown feedback. */
const EMAIL_VERIFY_META_KEY = 'chaupaal_email_verify_meta';

function readVerifyMeta(uid) {
  try {
    const raw = JSON.parse(localStorage.getItem(EMAIL_VERIFY_META_KEY) || '{}');
    return raw && raw.uid === uid
      ? raw
      : { uid, dismissCount: 0, lastDismissAt: 0, lastResendAt: 0, resendCount: 0 };
  } catch (e) {
    return { uid, dismissCount: 0, lastDismissAt: 0, lastResendAt: 0, resendCount: 0 };
  }
}

function writeVerifyMeta(meta) {
  try {
    localStorage.setItem(EMAIL_VERIFY_META_KEY, JSON.stringify(meta));
  } catch (e) {}
}

function verifyDismissCooldownMs(dismissCount) {
  const hours = Math.min(72, 3 * Math.pow(2, Math.max(0, dismissCount - 1)));
  return hours * 60 * 60 * 1000;
}

function verifyResendCooldownMs(resendCount) {
  return Math.min(15 * 60 * 1000, 45 * 1000 * Math.pow(2, Math.max(0, resendCount - 1)));
}

function formatCooldownLabel(ms) {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  if (sec < 60) return sec + 's';
  const m = Math.ceil(sec / 60);
  if (m < 60) return m + 'm';
  return Math.ceil(m / 60) + 'h';
}

function syncEmailVerifyBanner() {
  const u = auth?.currentUser;
  const existing = document.getElementById('emailVerifyBanner');
  if (!u || hasVerifiedContact(u)) {
    existing?.remove();
    return;
  }

  const meta = readVerifyMeta(u.uid);
  if (meta.lastDismissAt) {
    const wait = verifyDismissCooldownMs(meta.dismissCount || 1);
    if (Date.now() - meta.lastDismissAt < wait) {
      existing?.remove();
      return;
    }
  }
  try {
    if (sessionStorage.getItem(EMAIL_VERIFY_DISMISS_KEY) === u.uid && !meta.lastDismissAt) {
      meta.lastDismissAt = Date.now();
      meta.dismissCount = Math.max(1, meta.dismissCount || 0);
      writeVerifyMeta(meta);
      sessionStorage.removeItem(EMAIL_VERIFY_DISMISS_KEY);
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
    el.innerHTML =
      '<div class="email-verify-banner-text">' +
      '<strong>Verify your email</strong>' +
      '<span>Confirm your address to keep your account secure.</span>' +
      '</div>' +
      '<div class="email-verify-banner-actions">' +
      '<button type="button" class="btn btn--primary" data-verify-resend>Resend verification email</button>' +
      '<button type="button" class="email-verify-banner-dismiss" data-verify-dismiss aria-label="Dismiss">✕</button>' +
      '</div>';
    const host = document.querySelector('.device') || document.body;
    const topbar = document.getElementById('topbar');
    if (topbar?.parentNode) topbar.parentNode.insertBefore(el, topbar.nextSibling);
    else host.insertBefore(el, host.firstChild);

    const resendBtn = el.querySelector('[data-verify-resend]');
    const paintResendState = () => {
      if (!resendBtn) return;
      const m = readVerifyMeta(u.uid);
      const remain = (m.lastResendAt || 0) + verifyResendCooldownMs(m.resendCount || 1) - Date.now();
      if (remain > 0) {
        resendBtn.disabled = true;
        resendBtn.textContent = 'Try again in ' + formatCooldownLabel(remain);
      } else {
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend verification email';
      }
    };
    paintResendState();
    if (el._verifyResendTimer) clearInterval(el._verifyResendTimer);
    el._verifyResendTimer = setInterval(paintResendState, 1000);

    resendBtn?.addEventListener('click', async () => {
      if (resendBtn.disabled) return;
      resendBtn.disabled = true;
      resendBtn.textContent = 'Sending…';
      try {
        if (typeof ChaupaalEnv !== 'undefined' && ChaupaalEnv.whenAuthReady) {
          await ChaupaalEnv.whenAuthReady(8000);
        }
        const user = auth?.currentUser;
        if (!user) {
          if (typeof showToast === 'function') showToast('Sign in again to resend');
          paintResendState();
          return;
        }
        await user.reload();
        if (hasVerifiedContact(auth.currentUser)) {
          syncEmailVerifyBanner();
          if (typeof showToast === 'function') showToast('Email verified — thank you!');
          return;
        }
        await auth.currentUser.sendEmailVerification();
        const m = readVerifyMeta(u.uid);
        m.lastResendAt = Date.now();
        m.resendCount = (m.resendCount || 0) + 1;
        writeVerifyMeta(m);
        if (typeof showToast === 'function') showToast('Verification email sent — check inbox & spam');
        paintResendState();
      } catch (e) {
        const code = e?.code || '';
        const m = readVerifyMeta(u.uid);
        if (code.includes('too-many-requests') || /too many|rate/i.test(e?.message || '')) {
          m.lastResendAt = Date.now();
          m.resendCount = Math.max(m.resendCount || 0, 2);
          writeVerifyMeta(m);
          if (typeof showToast === 'function') {
            showToast(
              'Too many requests — try again in ' + formatCooldownLabel(verifyResendCooldownMs(m.resendCount))
            );
          }
        } else if (typeof showToast === 'function') {
          showToast(e.message || 'Could not send email');
        }
        paintResendState();
      }
    });
    el.querySelector('[data-verify-dismiss]')?.addEventListener('click', () => {
      const m = readVerifyMeta(u.uid);
      m.lastDismissAt = Date.now();
      m.dismissCount = (m.dismissCount || 0) + 1;
      writeVerifyMeta(m);
      if (el._verifyResendTimer) clearInterval(el._verifyResendTimer);
      el.remove();
      if (typeof showToast === 'function') {
        showToast('We will remind you again in ' + formatCooldownLabel(verifyDismissCooldownMs(m.dismissCount)));
      }
    });
  }
}

window.syncEmailVerifyBanner = syncEmailVerifyBanner;
window.hasVerifiedContact = hasVerifiedContact;
window.showAuthScreen = showAuthScreen;
window.showAuth = showAuth;
window.hideAuth = hideAuth;

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

  document.getElementById('welcomeBackContinue')?.addEventListener('click', async () => {
    if (auth?.currentUser) {
      currentUser = auth.currentUser;
      await finishAuthSession(t('auth_welcome_back'));
      return;
    }
    const last = typeof readLastUser === 'function' ? readLastUser() : null;
    showAuthScreen('authLoginScreen');
    const idInp = document.getElementById('loginIdentifier');
    if (idInp && last?.username) idInp.value = last.username;
  });
  document.getElementById('welcomeBackNotYou')?.addEventListener('click', () => {
    if (typeof clearLastUser === 'function') clearLastUser();
    showAuthScreen('authHeroScreen');
    regData = emptyRegData();
  });

  document.getElementById('parentConsentSend')?.addEventListener('click', async () => {
    const contact = document.getElementById('parentConsentContact')?.value?.trim();
    const err = document.getElementById('parentConsentError');
    const hint = document.getElementById('parentConsentHint');
    const btn = document.getElementById('parentConsentSend');
    if (err) err.textContent = '';
    if (!contact) {
      if (err) err.textContent = 'Enter a parent email or phone';
      return;
    }
    if (btn) btn.disabled = true;
    try {
      const env = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'parental_consent_start', contact },
      });
      if (!env?.ok) throw new Error(env?.error?.message || 'Could not start consent');
      if (env.data?.needParentSignup || env.data?.error === 'PARENT_NOT_FOUND') {
        if (err)
          err.textContent =
            'No adult Chaupaal account for that contact. Ask your parent to create one, then retry.';
        if (typeof showToast === 'function') showToast('Parent needs a Chaupaal adult account first');
        return;
      }
      if (env.data?.error === 'PARENT_NOT_ADULT') {
        if (err) err.textContent = 'That account is under 18 — consent needs an adult parent account';
        return;
      }
      document.getElementById('parentConsentOtpWrap')?.classList.remove('hidden');
      const otpInp = document.getElementById('parentConsentOtp');
      if (otpInp && typeof PhoneOtp !== 'undefined') {
        PhoneOtp.wireOtpInput(otpInp, {
          onComplete: () => document.getElementById('parentConsentVerify')?.click(),
        });
        otpInp.focus();
      }
      if (env.data?.otp) {
        if (otpInp) otpInp.value = String(env.data.otp);
        if (hint) {
          hint.textContent =
            'Dev code shown below (PARENTAL_CONSENT_RETURN_OTP). Production: parent sees it in Chaupaal notifications — not SMS.';
        }
        if (typeof showToast === 'function') showToast('Dev consent code ready');
      } else {
        if (hint) {
          hint.textContent =
            'Code delivered to your parent’s Chaupaal notification inbox (not SMS). Ask them to open Chaupaal and share the 6-digit code.';
        }
        if (typeof showToast === 'function') showToast('Code sent to parent’s Chaupaal inbox');
      }
    } catch (e) {
      if (err) err.textContent = e.message || 'Failed';
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  document.getElementById('parentConsentVerify')?.addEventListener('click', async () => {
    const otp = document.getElementById('parentConsentOtp')?.value?.trim();
    const err = document.getElementById('parentConsentError');
    const btn = document.getElementById('parentConsentVerify');
    if (err) err.textContent = '';
    if (!otp || String(otp).replace(/\D/g, '').length !== 6) {
      if (err) err.textContent = 'Enter the 6-digit code from your parent';
      return;
    }
    if (btn) btn.disabled = true;
    try {
      const env = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'parental_consent_verify', otp },
      });
      if (!env?.ok) {
        const code = env?.error?.code || '';
        if (code === 'EXPIRED') throw new Error('Code expired — ask parent to request a new one');
        if (code === 'INVALID_OTP') throw new Error('Incorrect code — try again');
        if (code === 'NO_PENDING') throw new Error('No pending code — tap Send verification code first');
        throw new Error(env?.error?.message || 'Invalid code');
      }
      if (userProfile) {
        userProfile.parentalConsent = env.data?.parentalConsent || { verified: true, required: true };
        userProfile.teenMode = true;
      }
      hideAuth();
      if (typeof showToast === 'function') showToast('Parental consent saved — welcome');
    } catch (e) {
      if (err) err.textContent = e.message || 'Could not verify';
    } finally {
      if (btn) btn.disabled = false;
    }
  });

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
  let regPhoneVerified = '';
  const LOGIN_OTP_HOST = 'recaptcha-container';
  const REG_OTP_HOST = 'recaptcha-container-reg';

  function toE164India(raw) {
    if (typeof PhoneOtp !== 'undefined' && PhoneOtp.toE164India) return PhoneOtp.toE164India(raw);
    const s = String(raw || '').trim();
    const digits = s.replace(/\D/g, '');
    if (digits.length === 10) return '+91' + digits;
    if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
    if (s.startsWith('+') && digits.length >= 10) return '+' + digits;
    return null;
  }

  function setOtpStatus(elId, text, ok) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text || '';
    el.style.color = ok ? 'var(--green, #33C481)' : 'var(--muted)';
  }

  async function finishAuthSession(welcomeMsg) {
    if (typeof trackLogin === 'function') trackLogin();
    if (typeof AuthProfiles !== 'undefined' && AuthProfiles.rememberCurrentAccount) {
      AuthProfiles.rememberCurrentAccount();
    }
    window.__chaupaalAddingAccount = false;
    hideAuth();
    updateProfileBtn();
    if (typeof loadStreak === 'function') loadStreak();
    if (typeof initActivityStatus === 'function') initActivityStatus();
    if (typeof startNotifInbox === 'function') startNotifInbox();
    if (typeof registerSession === 'function') {
      try {
        await registerSession();
      } catch (e) {}
    }
    if (typeof rememberLastUser === 'function') {
      rememberLastUser({
        uid: currentUser?.uid,
        username: userProfile?.username,
        name: userProfile?.name || currentUser?.displayName,
        photoURL: userProfile?.photoURL || currentUser?.photoURL,
      });
    }
    if (typeof needsParentalConsent === 'function' && needsParentalConsent(userProfile)) {
      document.getElementById('authOverlay')?.classList.remove('hidden');
      showAuthScreen('authParentalConsentScreen');
    }
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
    const otpInp = document.getElementById('loginPhoneOtp');
    if (otpInp && typeof PhoneOtp !== 'undefined') {
      PhoneOtp.wireOtpInput(otpInp, {
        onComplete: () => document.getElementById('loginPhoneVerifyOtp')?.click(),
      });
    }
  });
  document.getElementById('regPhoneBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('regPhonePanel');
    panel?.classList.toggle('hidden');
    const otpInp = document.getElementById('regPhoneOtpCode');
    if (otpInp && typeof PhoneOtp !== 'undefined') {
      PhoneOtp.wireOtpInput(otpInp, {
        onComplete: () => document.getElementById('regPhoneVerifyOtp')?.click(),
      });
    }
    if (panel && !panel.classList.contains('hidden')) {
      try {
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (e) {}
    }
  });
  document.getElementById('regGoogleBtn')?.addEventListener('click', async () => {
    const errEl = document.getElementById('registerError') || document.getElementById('reg1Error');
    try {
      const identity = await captureRegIdentity({ errEl });
      if (!identity) {
        document.getElementById('regName')?.focus();
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

  async function handlePhoneSend({ phoneInputId, containerId, errEl, statusId, sendBtn, resendBtn }) {
    if (errEl) errEl.textContent = '';
    const phoneRaw = document.getElementById(phoneInputId)?.value;
    if (sendBtn) sendBtn.disabled = true;
    try {
      if (typeof PhoneOtp === 'undefined') {
        throw Object.assign(new Error('Phone OTP module missing'), { code: 'auth/internal-error' });
      }
      const { phone } = await PhoneOtp.sendOtp({ phoneRaw, containerId });
      setOtpStatus(statusId, 'OTP sent to ' + phone + ' — enter the 6-digit code', true);
      if (typeof showToast === 'function') showToast(t('auth_otp_sent'));
      const otpId = containerId === LOGIN_OTP_HOST ? 'loginPhoneOtp' : 'regPhoneOtpCode';
      const otpInp = document.getElementById(otpId);
      otpInp?.focus();
      if (resendBtn && typeof PhoneOtp.paintResendButton === 'function') {
        resendBtn.classList.remove('hidden');
        PhoneOtp.paintResendButton(resendBtn, containerId);
      }
      if (sendBtn) {
        sendBtn.textContent = 'OTP sent';
        setTimeout(() => {
          if (sendBtn) sendBtn.textContent = sendBtn.dataset.defaultLabel || 'Send OTP';
        }, 2000);
      }
    } catch (e) {
      const mapped =
        typeof PhoneOtp !== 'undefined' ? PhoneOtp.mapPhoneAuthError(e) : { text: e.message };
      if (errEl) errEl.textContent = mapped.text || e.message || 'Could not send OTP';
      setOtpStatus(statusId, '', false);
      try {
        if (typeof PhoneOtp !== 'undefined') await PhoneOtp.clearVerifier(containerId);
      } catch (err) {}
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  document.getElementById('loginPhoneSendOtp')?.addEventListener('click', () =>
    handlePhoneSend({
      phoneInputId: 'loginPhone',
      containerId: LOGIN_OTP_HOST,
      errEl: document.getElementById('loginError'),
      statusId: 'loginOtpStatus',
      sendBtn: document.getElementById('loginPhoneSendOtp'),
      resendBtn: document.getElementById('loginPhoneResendOtp'),
    })
  );
  document.getElementById('loginPhoneResendOtp')?.addEventListener('click', () =>
    handlePhoneSend({
      phoneInputId: 'loginPhone',
      containerId: LOGIN_OTP_HOST,
      errEl: document.getElementById('loginError'),
      statusId: 'loginOtpStatus',
      sendBtn: document.getElementById('loginPhoneResendOtp'),
      resendBtn: document.getElementById('loginPhoneResendOtp'),
    })
  );

  document.getElementById('loginPhoneVerifyOtp')?.addEventListener('click', async () => {
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('loginPhoneVerifyOtp');
    const code = document.getElementById('loginPhoneOtp')?.value.trim();
    if (errEl) errEl.textContent = '';
    if (btn) btn.disabled = true;
    try {
      if (typeof PhoneOtp === 'undefined') throw new Error('Phone OTP module missing');
      if (!PhoneOtp.getConfirmation(LOGIN_OTP_HOST)) {
        if (errEl) errEl.textContent = 'Send OTP first, then enter the code';
        return;
      }
      const cred = await PhoneOtp.confirmOtp(LOGIN_OTP_HOST, code);
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
      const mapped =
        typeof PhoneOtp !== 'undefined' ? PhoneOtp.mapPhoneAuthError(e) : { text: e.message };
      if (errEl) errEl.textContent = mapped.text || e.message || 'Invalid OTP';
    } finally {
      if (btn) btn.disabled = false;
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

  document.getElementById('regPhoneSendOtp')?.addEventListener('click', () =>
    handlePhoneSend({
      phoneInputId: 'regPhoneOtpInput',
      containerId: REG_OTP_HOST,
      errEl: document.getElementById('reg2Error') || document.getElementById('registerError'),
      statusId: 'regOtpStatus',
      sendBtn: document.getElementById('regPhoneSendOtp'),
      resendBtn: document.getElementById('regPhoneResendOtp'),
    })
  );
  document.getElementById('regPhoneResendOtp')?.addEventListener('click', () =>
    handlePhoneSend({
      phoneInputId: 'regPhoneOtpInput',
      containerId: REG_OTP_HOST,
      errEl: document.getElementById('reg2Error') || document.getElementById('registerError'),
      statusId: 'regOtpStatus',
      sendBtn: document.getElementById('regPhoneResendOtp'),
      resendBtn: document.getElementById('regPhoneResendOtp'),
    })
  );

  document.getElementById('regPhoneVerifyOtp')?.addEventListener('click', async () => {
    const errEl = document.getElementById('reg2Error') || document.getElementById('registerError');
    const btn = document.getElementById('regPhoneVerifyOtp');
    const code = document.getElementById('regPhoneOtpCode')?.value.trim();
    if (errEl) errEl.textContent = '';
    if (btn) btn.disabled = true;
    try {
      if (typeof PhoneOtp === 'undefined') throw new Error('Phone OTP module missing');
      if (!PhoneOtp.getConfirmation(REG_OTP_HOST)) {
        if (errEl) errEl.textContent = 'Send OTP first, then enter the code';
        return;
      }
      const cred = await PhoneOtp.confirmOtp(REG_OTP_HOST, code);
      currentUser = cred.user;
      regPhoneVerified = cred.user.phoneNumber || '';
      regData.phone = regPhoneVerified;
      await writePhoneIndex(cred.user, cred.user.email || document.getElementById('regEmail')?.value || '');
      const hint = document.getElementById('regPhoneVerifiedHint');
      if (hint) {
        hint.style.display = 'block';
        hint.textContent = `Phone verified ✓ ${regPhoneVerified}`;
      }
      setOtpStatus('regOtpStatus', 'Phone verified', true);
      syncSignupProgress();
      const pwdHint = document
        .getElementById('regPassword')
        ?.closest('.auth-input-group')
        ?.querySelector('.auth-input-hint');
      if (pwdHint) {
        pwdHint.textContent =
          'Recommended after phone verify — set email + password to log in without OTP next time.';
      }
      showToast(t('auth_phone_verified'));
    } catch (e) {
      const mapped =
        typeof PhoneOtp !== 'undefined' ? PhoneOtp.mapPhoneAuthError(e) : { text: e.message };
      if (errEl) errEl.textContent = mapped.text || e.message || 'Invalid OTP';
    } finally {
      if (btn) btn.disabled = false;
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
    syncSignupProgress();
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

  document.getElementById('regName')?.addEventListener('input', syncAuthCanvasPreview);
  document.getElementById('regUsername')?.addEventListener('input', syncAuthCanvasPreview);
  document.getElementById('regCity')?.addEventListener('input', syncAuthCanvasPreview);
  document.getElementById('regDob')?.addEventListener('change', syncSignupProgress);
  document.getElementById('regEmail')?.addEventListener('input', syncSignupProgress);

  const paintAuthAvatar = (src) => {
    const av = document.getElementById('authCanvasAvatar');
    const nudge = document.getElementById('authPhotoNudge');
    if (!av) return;
    if (src) {
      av.innerHTML = `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
      av.classList.add('has-photo');
      if (nudge) {
        nudge.textContent = 'Looking good — people see a real you.';
        nudge.classList.add('is-done');
      }
    } else {
      av.innerHTML = '<span id="authCanvasAvatarFallback" aria-hidden="true">🪑</span>';
      av.classList.remove('has-photo');
      if (nudge) {
        nudge.textContent = 'A photo helps people see a real you — optional, skip anytime.';
        nudge.classList.remove('is-done');
      }
    }
    syncSignupProgress();
  };

  /** Capture + validate identity fields into regData. Returns true on success. */
  async function captureRegIdentity({ errEl, quiet } = {}) {
    const name = document.getElementById('regName')?.value.trim();
    const username = document.getElementById('regUsername')?.value.trim().toLowerCase();
    const dob = document.getElementById('regDob')?.value;
    const showErr = (msg) => {
      if (errEl) errEl.textContent = msg;
    };
    if (regData.genderSelfDescribe) {
      regData.gender = document.getElementById('regGenderCustom')?.value.trim() || '';
    }
    if (!name) {
      showErr('Please enter your full name');
      document.getElementById('regName')?.focus();
      return false;
    }
    if (!username || username.length < 3) {
      showErr('Username must be at least 3 characters');
      document.getElementById('regUsername')?.focus();
      return false;
    }
    if (!dob) {
      showErr('Date of birth required');
      document.getElementById('regDob')?.focus();
      return false;
    }
    const age = ageFromDob(dob);
    if (age < 13) {
      showErr('You must be 13 or older to join Chaupaal');
      return false;
    }
    regData.age = age;
    regData.isMinor = age < 18;
    regData.teenMode = age >= 13 && age < 18;
    if (regData.profileType === 'personal' && !regData.gender) {
      showErr(
        regData.genderSelfDescribe
          ? 'Please describe your gender'
          : 'Please choose a gender for your Personal account'
      );
      return false;
    }
    if (errEl) errEl.textContent = quiet ? '' : 'Checking username…';
    const available = await checkUsernameAvailability(username);
    if (!available) {
      showErr('That username is taken — pick another');
      document.getElementById('regUsername')?.focus();
      return false;
    }
    if (errEl) errEl.textContent = '';
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
    return true;
  }

  // ---- One-canvas: photo on Profile hero + credentials ----
  const photoInput = document.getElementById('photoInput');
  photoInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    regData.photoFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => paintAuthAvatar(ev.target.result);
    reader.readAsDataURL(file);
  });
  document.getElementById('authCanvasAvatar')?.addEventListener('click', () => photoInput?.click());

  document.getElementById('authSkipOptionals')?.addEventListener('click', () => {
    const creds = document.getElementById('authCredsSection');
    try {
      creds?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (e) {}
    document.getElementById('regEmail')?.focus();
  });

  document.getElementById('regPassword')?.addEventListener('input', (e) => {
    syncSignupProgress();
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
        syncSignupProgress();
        return;
      }
      if (chip.classList.contains('active')) {
        if (!regData.intents.includes(val)) regData.intents.push(val);
      } else {
        regData.intents = regData.intents.filter((v) => v !== val);
      }
      syncSignupProgress();
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
    const errEl = document.getElementById('registerError') || document.getElementById('reg1Error');
    if (errEl) errEl.hidden = false;

    const identityOk = await captureRegIdentity({ errEl, quiet: false });
    if (!identityOk) return;

    const phoneOk = !!(regPhoneVerified || auth?.currentUser?.phoneNumber);
    const googleOk = !!(
      auth?.currentUser?.email && auth.currentUser.providerData?.some((p) => p.providerId === 'google.com')
    );
    const emailOk = email && looksLikeEmail(email) && pwd && pwd.length >= 8;

    if (!emailOk && !phoneOk && !googleOk) {
      errEl.textContent = 'Verify email+password, Google, or phone OTP to create an account';
      try {
        document.getElementById('authCredsSection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (e) {}
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
        errEl.textContent = 'Username is no longer available — pick another';
        document.getElementById('regUsername')?.focus();
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
          teenMode: !!regData.teenMode,
          isMinor: !!regData.isMinor,
          parentalConsent: regData.teenMode
            ? { verified: false, required: true, method: null, parentContact: null, verifiedAt: null }
            : { verified: true, required: false },
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
        : `${desc} Add a bio and prompts anytime on your Profile.`;
      if (typeof launchConfetti === 'function') launchConfetti({ x: 50, y: 40 }, 80);

      const cta = document.getElementById('authSuccessCta');
      if (cta) {
        cta.textContent = 'Open my Profile →';
        if (!cta.dataset.wired) {
          cta.dataset.wired = '1';
          cta.addEventListener('click', async () => {
            try {
              if (auth?.currentUser) await auth.currentUser.reload();
            } catch (e) {}
            if (typeof AuthProfiles !== 'undefined' && AuthProfiles.rememberCurrentAccount) {
              AuthProfiles.rememberCurrentAccount();
            }
            const enterApp = async () => {
              hideAuth();
              updateProfileBtn();
              if (typeof loadStreak === 'function') loadStreak();
              if (typeof registerSession === 'function') {
                try {
                  await registerSession();
                } catch (e) {}
              }
              syncEmailVerifyBanner();
            };
            if (typeof openDigitalCanvasDeepen === 'function') {
              hideAuth();
              updateProfileBtn();
              openDigitalCanvasDeepen({
                reason: 'post_signup',
                onDone: async () => {
                  if (typeof loadStreak === 'function') loadStreak();
                  if (typeof registerSession === 'function') {
                    try {
                      await registerSession();
                    } catch (e) {}
                  }
                  syncEmailVerifyBanner();
                },
              });
            } else {
              await enterApp();
            }
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
