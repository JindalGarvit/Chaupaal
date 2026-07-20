// ===================== AUTH STATE MACHINE v3 =====================
// Signup: Personal/Professional → identity (live username) → email/password (+ optional extras)

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
        : 'Optional for Professional accounts — you can add it later';
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
    if (!db) {
      hint.textContent = 'Looks okay — we’ll confirm on create';
      hint.style.color = '#2ECC71';
      regData.usernameAvailable = true;
      return true;
    }
    const snap = await db.collection('usernames').doc(username).get();
    if (snap.exists) {
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
  document.getElementById('loginBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail')?.value.trim();
    const pwd = document.getElementById('loginPassword')?.value;
    const errEl = document.getElementById('loginError');
    if (!email || !pwd) {
      errEl.textContent = 'Please fill in all fields';
      return;
    }
    const btn = document.getElementById('loginBtn');
    btn.textContent = 'Logging in...';
    btn.disabled = true;
    try {
      if (auth) await auth.signInWithEmailAndPassword(email, pwd);
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
      btn.textContent = 'Log in →';
      btn.disabled = false;
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
      if (chip.classList.contains('active')) {
        if (!regData.intents.includes(val)) regData.intents.push(val);
      } else {
        regData.intents = regData.intents.filter((v) => v !== val);
      }
    });
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
    const errEl = document.getElementById('registerError');
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      errEl.textContent = 'Valid email required';
      return;
    }
    if (!pwd || pwd.length < 8) {
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

    regData.email = email;
    regData.password = pwd;
    regData.phone = document.getElementById('regPhone')?.value.trim() || '';
    regData.city = document.getElementById('regCity')?.value.trim() || '';
    regData.lang = document.getElementById('regLanguage')?.value || 'en';

    const btn = document.getElementById('registerBtn');
    btn.textContent = 'Creating account...';
    btn.disabled = true;

    try {
      let photoURL = '';
      let photoThumb = '';

      if (auth) {
        const cred = await auth.createUserWithEmailAndPassword(regData.email, regData.password);
        currentUser = cred.user;

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

        await cred.user.updateProfile({ displayName: regData.name, photoURL: photoURL || undefined });

        const profileType = regData.profileType === 'professional' ? 'professional' : 'personal';
        const profile = {
          name: regData.name,
          username: regData.username,
          email: regData.email,
          phone: regData.phone,
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
          intents: regData.intents,
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
          uid: cred.user.uid,
          profile: {
            profileType,
            displayName: regData.name,
            username: regData.username,
            gender: regData.gender || '',
            dateOfBirth: regData.dob,
            age: regData.age,
            currentCity: regData.city || '',
          },
        };

        if (db) {
          const unameRef = db.collection('usernames').doc(regData.username);
          const existing = await unameRef.get();
          if (existing.exists) {
            throw Object.assign(new Error('USERNAME_TAKEN'), { code: 'username-taken' });
          }
          await db.collection('users').doc(cred.user.uid).set(profile);
          await unameRef.set({ uid: cred.user.uid });
        }

        userProfile = profile;
        if (typeof digitalProfile !== 'undefined') {
          digitalProfile.displayName = regData.name;
          digitalProfile.username = regData.username;
          digitalProfile.currentCity = regData.city || '';
          digitalProfile.gender = regData.gender || '';
          digitalProfile.dateOfBirth = regData.dob;
          digitalProfile.age = regData.age;
          digitalProfile.profileType = profileType;
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
      document.getElementById('authSuccessDesc').textContent = regData.intents.length
        ? `${typeLabel} account ready. You're here to: ${regData.intents.slice(0, 2).join(' & ')}. Finish your profile anytime for better matches.`
        : `${typeLabel} account ready. Add a bio and prompts anytime — signup stays light on purpose.`;
      if (typeof launchConfetti === 'function') launchConfetti({ x: 50, y: 40 }, 80);

      const cta = document.getElementById('authSuccessCta');
      if (cta && !cta.dataset.wired) {
        cta.dataset.wired = '1';
        cta.addEventListener('click', () => {
          hideAuth();
          updateProfileBtn();
          loadStreak();
          initActivityStatus();
          if (!onboardingDone) showOnboarding();
          showToast(`Welcome to Chaupaal, ${firstName}!`);
        });
      }
    } catch (e) {
      if (e.code === 'username-taken' || e.message === 'USERNAME_TAKEN') {
        errEl.textContent = 'Username was just taken — go back and pick another';
      } else {
        errEl.textContent =
          e.code === 'auth/email-already-in-use'
            ? 'An account with this email already exists. Try logging in.'
            : e.code === 'auth/weak-password'
              ? 'Password is too weak.'
              : 'Sign up failed: ' + e.message;
      }
    } finally {
      btn.textContent = 'Create my account';
      btn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => wireAuthEvents());
