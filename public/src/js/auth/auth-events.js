// ===================== AUTH STATE MACHINE v3 =====================
// Signup: Personal/Professional â†’ identity (live username) â†’ email/password (+ optional extras)

let regData = {
  profileType: 'personal',
  name: '',
  username: '',
  gender: '',
  dob: '',
  age: 0,
  email: '',
  phone: '',
  city: '',
  lang: 'en',
  password: '',
  intents: [],
  customIntent: '',
  openToMeet: true,
  photoFile: null,
  usernameAvailable: false,
};

let usernameCheckTimer = null;
let authEventsWired = false;

function emptyRegData() {
  return {
    profileType: 'personal',
    name: '',
    username: '',
    gender: '',
    dob: '',
    age: 0,
    email: '',
    phone: '',
    city: '',
    lang: 'en',
    password: '',
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
        : 'Optional for Professional accounts â€” you can add it later';
  }
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

function wireAuthEvents() {
  if (authEventsWired) return;
  authEventsWired = true;

  document.getElementById('heroSignupBtn')?.addEventListener('click', () => {
    regData = emptyRegData();
    syncRegProfileTypeUi();
    showAuthScreen('authRegStep1');
  });
  document.getElementById('heroLoginBtn')?.addEventListener('click', () => showAuthScreen('authLoginScreen'));
  document.getElementById('authSkip')?.addEventListener('click', hideAuth);

  document.getElementById('loginBackBtn')?.addEventListener('click', () => showAuthScreen('authHeroScreen', 'back'));
  document.getElementById('loginToSignup')?.addEventListener('click', () => {
    regData = emptyRegData();
    syncRegProfileTypeUi();
    showAuthScreen('authRegStep1');
  });
  document.getElementById('toggleLoginPwd')?.addEventListener('click', () => {
    const inp = document.getElementById('loginPassword');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('forgotPasswordBtn')?.addEventListener('click', () => {
    const email = document.getElementById('loginEmail')?.value.trim();
    if (!email) {
      document.getElementById('loginError').textContent = 'Enter your email first';
      return;
    }
    if (auth)
      auth
        .sendPasswordResetEmail(email)
        .then(() => showToast('Reset link sent! Check your email'))
        .catch((e) => showToast('Error: ' + e.message));
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
    showToast(welcomeMsg || 'Welcome!');
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
    showToast('Choose a username to finish signing up');
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
      if (doc) await finishAuthSession('Welcome back!');
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
      showToast('OTP sent');
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
      const doc = await ensureUserDocAfterSocial(cred.user, { phone: cred.user.phoneNumber });
      if (doc) await finishAuthSession('Welcome back!');
    } catch (e) {
      if (errEl) errEl.textContent = e.message || 'Invalid OTP';
    }
  });

  document.getElementById('regPhoneSendOtp')?.addEventListener('click', async () => {
    const errEl = document.getElementById('reg2Error');
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
      showToast('OTP sent');
    } catch (e) {
      if (errEl) errEl.textContent = e.message || 'Could not send OTP';
    }
  });

  document.getElementById('regPhoneVerifyOtp')?.addEventListener('click', async () => {
    const errEl = document.getElementById('reg2Error');
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
      const hint = document.getElementById('regPhoneVerifiedHint');
      if (hint) {
        hint.style.display = 'block';
        hint.textContent = `Phone verified âœ“ ${regPhoneVerified}`;
      }
      showToast('Phone verified');
    } catch (e) {
      if (errEl) errEl.textContent = e.message || 'Invalid OTP';
    }
  });

  document.getElementById('loginBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail')?.value.trim();
    const pwd = document.getElementById('loginPassword')?.value;
    const errEl = document.getElementById('loginError');
    if (!email || !pwd) {
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
      if (auth) await auth.signInWithEmailAndPassword(email, pwd);
      const u = auth?.currentUser;
      if (u && !hasVerifiedContact(u)) {
        try {
          await u.sendEmailVerification();
        } catch (e) {}
        errEl.textContent = 'Verify your email first — we sent a fresh link. Then log in again.';
        try {
          await auth.signOut();
        } catch (e) {}
        return;
      }
      if (typeof trackLogin === 'function') trackLogin();
      hideAuth();
      updateProfileBtn();
      loadStreak();
      initActivityStatus();
      showToast('Welcome back!');
    } catch (e) {
      errEl.textContent =
        e.code === 'auth/wrong-password'
          ? 'Wrong password. Try again or reset it.'
          : e.code === 'auth/user-not-found'
            ? 'No account found with this email.'
            : 'Login failed: ' + e.message;
    } finally {
      if (typeof setButtonLoading === 'function') setButtonLoading(btn, false);
      else {
        btn.textContent = 'Log in â†’';
        btn.disabled = false;
      }
    }
  });
  document
    .getElementById('loginEmail')
    ?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') document.getElementById('loginPassword')?.focus();
    });
  document
    .getElementById('loginPassword')
    ?.addEventListener('keypress', (e) => {
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
      document.querySelectorAll('#regGenderChips .auth-gender-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      regData.gender = chip.dataset.val || '';
    });
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
      errEl.textContent = 'Please choose a gender for your Personal account';
      return;
    }
    errEl.textContent = 'Checking usernameâ€¦';
    const available = await checkUsernameAvailability(username);
    if (!available) {
      errEl.textContent = 'That username is taken â€” pick another';
      return;
    }
    errEl.textContent = '';
    regData.name = name;
    regData.username = username;
    regData.dob = dob;
    regData.age = age;
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
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
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
    const phoneOk = !!(regPhoneVerified || (auth?.currentUser?.phoneNumber));
    const googleOk = !!(auth?.currentUser?.email && auth.currentUser.providerData?.some((p) => p.providerId === 'google.com'));
    const emailOk = email && /\S+@\S+\.\S+/.test(email) && pwd && pwd.length >= 8;

    if (!emailOk && !phoneOk && !googleOk) {
      errEl.textContent = 'Verify email+password, Google, or phone OTP to create an account';
      return;
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
        errEl.textContent = 'Username is no longer available â€” go back and pick another';
        return;
      }
    }

    regData.email = email || auth?.currentUser?.email || '';
    regData.password = pwd || '';
    regData.phone = regPhoneVerified || document.getElementById('regPhone')?.value.trim() || auth?.currentUser?.phoneNumber || '';
    regData.city = document.getElementById('regCity')?.value.trim() || '';
    regData.lang = document.getElementById('regLanguage')?.value || 'en';

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
      const needsEmailVerify = !!(emailOk && !googleOk && !phoneOk && auth?.currentUser && !auth.currentUser.emailVerified);
      let desc = `${typeLabel} account ready.`;
      if (needsEmailVerify) desc = `${typeLabel} account created — verify your email to continue.`;
      else if (emailOk && !googleOk) desc += ' Check your email to verify your address.';
      document.getElementById('authSuccessDesc').textContent = regData.intents.length
        ? `${desc} You're here to: ${regData.intents.slice(0, 2).join(' & ')}.`
        : `${desc} Add a bio and prompts anytime.`;
      if (typeof launchConfetti === 'function') launchConfetti({ x: 50, y: 40 }, 80);

      const cta = document.getElementById('authSuccessCta');
      if (cta) {
        cta.textContent = needsEmailVerify ? 'I’ve verified — continue' : 'Enter Chaupaal';
        if (!cta.dataset.wired) {
          cta.dataset.wired = '1';
          cta.addEventListener('click', async () => {
            try {
              if (auth?.currentUser) await auth.currentUser.reload();
            } catch (e) {}
            const u = auth?.currentUser;
            if (u && !hasVerifiedContact(u)) {
              try {
                await u.sendEmailVerification();
              } catch (e) {}
              if (typeof showToast === 'function') {
                showToast('Open the link in your email, then tap continue');
              }
              return;
            }
            hideAuth();
            updateProfileBtn();
            if (typeof loadStreak === 'function') loadStreak();
          });
        }
      }
    } catch (e) {
      console.warn('[auth] register', e);
      errEl.textContent =
        e.code === 'username-taken' || e.code === 'auth/email-already-in-use'
          ? 'That email or username is already taken'
          : e.code === 'account-exists'
            ? 'Account already exists â€” log in instead'
            : e.message || 'Could not create account';
    } finally {
      if (typeof setButtonLoading === 'function') setButtonLoading(btn, false);
      else if (btn) {
        btn.textContent = 'Create account';
        btn.disabled = false;
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => wireAuthEvents());
