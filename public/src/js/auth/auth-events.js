// ===================== AUTH STATE MACHINE v2 =====================

// Collected registration data across steps
let regData = {name:'',username:'',gender:'',dob:'',email:'',phone:'',city:'',lang:'en',password:'',intents:[],openToMeet:true,photoFile:null};

function showAuthScreen(screenId, direction='forward'){
  const screens = ['authHeroScreen','authLoginScreen','authRegStep1','authRegStep2','authRegStep3','authSuccessScreen'];
  screens.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    if(id === screenId){
      el.classList.remove('hidden');
      el.style.animation = direction==='back' ? 'authSlideBack .3s var(--ease-out)' : 'authSlideIn .3s var(--ease-out)';
    } else {
      el.classList.add('hidden');
    }
  });
}

function showAuth(){
  document.getElementById('authOverlay')?.classList.remove('hidden');
  showAuthScreen('authHeroScreen');
  regData = {name:'',username:'',gender:'',dob:'',email:'',phone:'',city:'',lang:'en',password:'',intents:[],openToMeet:true,photoFile:null};
  wireAuthEvents();
}

function hideAuth(){
  document.getElementById('authOverlay')?.classList.add('hidden');
}

function wireAuthEvents(){
  // ---- Hero ----
  document.getElementById('heroSignupBtn')?.addEventListener('click',()=>showAuthScreen('authRegStep1'));
  document.getElementById('heroLoginBtn')?.addEventListener('click',()=>showAuthScreen('authLoginScreen'));
  document.getElementById('authSkip')?.addEventListener('click',hideAuth);

  // ---- Login ----
  document.getElementById('loginBackBtn')?.addEventListener('click',()=>showAuthScreen('authHeroScreen','back'));
  document.getElementById('loginToSignup')?.addEventListener('click',()=>showAuthScreen('authRegStep1'));
  document.getElementById('toggleLoginPwd')?.addEventListener('click',()=>{
    const inp=document.getElementById('loginPassword');
    inp.type=inp.type==='password'?'text':'password';
  });
  document.getElementById('forgotPasswordBtn')?.addEventListener('click',()=>{
    const email=document.getElementById('loginEmail')?.value.trim();
    if(!email){document.getElementById('loginError').textContent='Enter your email first';return;}
    if(auth) auth.sendPasswordResetEmail(email).then(()=>showToast('Reset link sent! Check your email 📧')).catch(e=>showToast('Error: '+e.message));
  });
  document.getElementById('loginBtn')?.addEventListener('click',async()=>{
    const email=document.getElementById('loginEmail')?.value.trim();
    const pwd=document.getElementById('loginPassword')?.value;
    const errEl=document.getElementById('loginError');
    if(!email||!pwd){errEl.textContent='Please fill in all fields';return;}
    const btn=document.getElementById('loginBtn');
    btn.textContent='Logging in...';btn.disabled=true;
    try{
      if(auth){await auth.signInWithEmailAndPassword(email,pwd);}
      if(typeof trackLogin==='function') trackLogin();
      hideAuth();
      updateProfileBtn();
      loadStreak();
      initActivityStatus();
      showToast(`Welcome back! 🙏`);
    }catch(e){
      errEl.textContent=e.code==='auth/wrong-password'?'Wrong password. Try again or reset it.':e.code==='auth/user-not-found'?'No account found with this email.':'Login failed: '+e.message;
    }finally{btn.textContent='Log in →';btn.disabled=false;}
  });
  document.getElementById('loginEmail')?.addEventListener('keypress',e=>{if(e.key==='Enter')document.getElementById('loginPassword')?.focus();});
  document.getElementById('loginPassword')?.addEventListener('keypress',e=>{if(e.key==='Enter')document.getElementById('loginBtn')?.click();});

  // ---- Step 1: Identity ----
  document.getElementById('reg1BackBtn')?.addEventListener('click',()=>showAuthScreen('authHeroScreen','back'));
  
  const photoInput=document.getElementById('photoInput');
  const photoPreview=document.getElementById('photoPreview');
  photoInput?.addEventListener('change',e=>{
    const file=e.target.files[0];if(!file)return;
    regData.photoFile=file;
    const reader=new FileReader();
    reader.onload=ev=>{
      photoPreview.innerHTML=`<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
    };reader.readAsDataURL(file);
  });
  photoPreview?.addEventListener('click',()=>photoInput?.click());

  // Gender chips
  document.querySelectorAll('.auth-gender-chip[data-val]').forEach(chip=>{
    chip.addEventListener('click',()=>{
      const parent=chip.closest('.auth-form-body')||chip.parentElement;
      if(chip.closest('#authRegStep1')){
        chip.closest('.auth-input-group')?.querySelectorAll('.auth-gender-chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        regData.gender=chip.dataset.val;
      } else if(chip.id==='openToMeetYes'||chip.id==='openToMeetNo'){
        document.getElementById('openToMeetYes')?.classList.toggle('active',chip.id==='openToMeetYes');
        document.getElementById('openToMeetNo')?.classList.toggle('active',chip.id==='openToMeetNo');
        regData.openToMeet=chip.dataset.val==='yes';
      }
    });
  });

  // Username validation
  document.getElementById('regUsername')?.addEventListener('input',e=>{
    const val=e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'');
    e.target.value=val;
    const hint=document.getElementById('usernameHint');
    if(val.length<3){hint.textContent='At least 3 characters';hint.style.color='var(--red)';}
    else if(val.length>20){hint.textContent='Max 20 characters';hint.style.color='var(--red)';}
    else{hint.textContent='✓ Looks good!';hint.style.color='#2ECC71';}
  });

  document.getElementById('reg1Next')?.addEventListener('click',()=>{
    const name=document.getElementById('regName')?.value.trim();
    const username=document.getElementById('regUsername')?.value.trim();
    const dob=document.getElementById('regDob')?.value;
    const errEl=document.getElementById('reg1Error');
    if(!name){errEl.textContent='Please enter your full name';return;}
    if(!username||username.length<3){errEl.textContent='Username must be at least 3 characters';return;}
    if(!dob){errEl.textContent='Date of birth required';return;}
    const age=Math.floor((Date.now()-new Date(dob))/(365.25*86400000));
    if(age<16){errEl.textContent='You must be 16 or older to join';return;}
    errEl.textContent='';
    regData.name=name;regData.username=username.toLowerCase();regData.dob=dob;
    showAuthScreen('authRegStep2');
  });

  // ---- Step 2: Contact ----
  document.getElementById('reg2BackBtn')?.addEventListener('click',()=>showAuthScreen('authRegStep1','back'));
  document.getElementById('reg2Next')?.addEventListener('click',()=>{
    const email=document.getElementById('regEmail')?.value.trim();
    const city=document.getElementById('regCity')?.value.trim();
    const errEl=document.getElementById('reg2Error');
    if(!email||!/\S+@\S+\.\S+/.test(email)){errEl.textContent='Valid email required';return;}
    if(!city){errEl.textContent='City is required';return;}
    errEl.textContent='';
    regData.email=email;
    regData.phone=document.getElementById('regPhone')?.value.trim();
    regData.city=city;
    regData.lang=document.getElementById('regLanguage')?.value||'en';
    showAuthScreen('authRegStep3');
  });

  // ---- Step 3: Password & Interests ----
  document.getElementById('reg3BackBtn')?.addEventListener('click',()=>showAuthScreen('authRegStep2','back'));

  // Password strength
  document.getElementById('regPassword')?.addEventListener('input',e=>{
    const pwd=e.target.value;
    const strengthEl=document.getElementById('pwdStrength');
    const fillEl=document.getElementById('pwdStrengthFill');
    const labelEl=document.getElementById('pwdStrengthLabel');
    if(!pwd){strengthEl.style.display='none';return;}
    strengthEl.style.display='flex';
    let score=0;
    if(pwd.length>=8)score++;if(pwd.length>=12)score++;
    if(/[A-Z]/.test(pwd))score++;if(/[0-9]/.test(pwd))score++;
    if(/[^A-Za-z0-9]/.test(pwd))score++;
    const levels=[
      {pct:20,color:'#E74C3C',label:'Weak'},
      {pct:40,color:'#E67E22',label:'Fair'},
      {pct:65,color:'#F1C40F',label:'Good'},
      {pct:85,color:'#2ECC71',label:'Strong'},
      {pct:100,color:'#27AE60',label:'Very strong'},
    ];
    const lv=levels[Math.min(score,4)];
    fillEl.style.width=lv.pct+'%';fillEl.style.background=lv.color;
    labelEl.textContent=lv.label;labelEl.style.color=lv.color;
  });

  document.getElementById('toggleRegPwd')?.addEventListener('click',()=>{
    const inp=document.getElementById('regPassword');
    inp.type=inp.type==='password'?'text':'password';
  });

  // Intent chips
  document.querySelectorAll('.auth-intent-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      chip.classList.toggle('active');
      const val=chip.dataset.val;
      if(chip.classList.contains('active'))regData.intents.push(val);
      else regData.intents=regData.intents.filter(v=>v!==val);
    });
  });

  // Open to meet buttons (in step 3)
  document.getElementById('openToMeetYes')?.addEventListener('click',()=>{
    document.getElementById('openToMeetYes')?.classList.add('active');
    document.getElementById('openToMeetNo')?.classList.remove('active');
    regData.openToMeet=true;
  });
  document.getElementById('openToMeetNo')?.addEventListener('click',()=>{
    document.getElementById('openToMeetNo')?.classList.add('active');
    document.getElementById('openToMeetYes')?.classList.remove('active');
    regData.openToMeet=false;
  });

  // ---- Register submit ----
  document.getElementById('registerBtn')?.addEventListener('click',async()=>{
    const pwd=document.getElementById('regPassword')?.value;
    const errEl=document.getElementById('registerError');
    if(!pwd||pwd.length<8){errEl.textContent='Password must be at least 8 characters';return;}
    regData.password=pwd;
    const btn=document.getElementById('registerBtn');
    btn.textContent='Creating account...';btn.disabled=true;

    try{
      let photoURL='';
      let photoThumb='';
      if(regData.photoFile&&auth){
        try{
          // Prefer Cloudinary after account create (below). Local compress only as last resort.
        }catch(e){}
      }

      if(auth){
        const cred=await auth.createUserWithEmailAndPassword(regData.email,regData.password);
        currentUser=cred.user;

        if(regData.photoFile&&typeof uploadOptimizedImage==='function'){
          try{
            const ready=typeof isMediaUploadReady==='function'?await isMediaUploadReady():true;
            if(ready){
              const up=await uploadOptimizedImage(regData.photoFile,{folder:'avatars'});
              photoURL=up.media;
              photoThumb=up.thumb;
            } else if(typeof compressImageFile==='function'){
              const compressed=await compressImageFile(regData.photoFile,'avatar');
              photoURL=compressed.previewUrl;
            }
          }catch(e){
            try{
              if(typeof compressImageFile==='function'){
                const compressed=await compressImageFile(regData.photoFile,'avatar');
                photoURL=compressed.previewUrl;
              }
            }catch(e2){}
          }
        }

        await cred.user.updateProfile({displayName:regData.name,photoURL:photoURL||undefined});

        // Save profile to Firestore
        const profile={
          name:regData.name,username:regData.username,email:regData.email,
          phone:regData.phone,city:regData.city,lang:regData.lang,
          gender:regData.gender,dob:regData.dob,photoURL,photoThumb:photoThumb||null,
          openToMeet:regData.openToMeet,strangerDailyLimit:10,
          intents:regData.intents,streak:0,lastPlayed:'',
          streakFreezes:0,categoryRatings:{},gameRatings:{},
          // Search denorms (Phase 4) — prefix queries on name / username
          nameLower:String(regData.name||'').toLowerCase().trim(),
          usernameLower:String(regData.username||'').toLowerCase().trim(),
          createdAt:firebase.firestore.FieldValue.serverTimestamp(),
          uid:cred.user.uid
        };
        if(db){
          await db.collection('users').doc(cred.user.uid).set(profile);
          await db.collection('usernames').doc(regData.username).set({uid:cred.user.uid});
        }
        userProfile=profile;
        digitalProfile.currentCity=regData.city;
        digitalProfile.gender=regData.gender;
        if(typeof trackSignup==='function') trackSignup({ has_photo:!!photoURL });

        // Init digital profile
        try{localStorage.setItem('chaupaal_digital_profile',JSON.stringify(digitalProfile));}catch(e){}
        if(regData.openToMeet){openToMeet=true;try{localStorage.setItem('chaupaal_open_to_meet','true');}catch(e){}}
      }

      // Show success screen
      showAuthScreen('authSuccessScreen');
      const firstName=regData.name.split(' ')[0];
      document.getElementById('authSuccessTitle').textContent=`Welcome, ${firstName}! 🎉`;
      document.getElementById('authSuccessDesc').textContent=regData.intents.length?`You're here to: ${regData.intents.slice(0,2).map(i=>i.split(' ').slice(1).join(' ')).join(' & ')}. Let's find your people.`:'Your account is ready. Let\'s explore what\'s happening today.';
      launchConfetti({x:50,y:40},80);

      document.getElementById('authSuccessCta')?.addEventListener('click',()=>{
        hideAuth();
        updateProfileBtn();
        loadStreak();
        initActivityStatus();
        // Open onboarding if not done
        if(!onboardingDone)showOnboarding();
        showToast(`Welcome to the Chaupaal, ${firstName}! 🙏`);
      });

    }catch(e){
      errEl.textContent=e.code==='auth/email-already-in-use'?'An account with this email already exists. Try logging in.':e.code==='auth/weak-password'?'Password is too weak.':'Sign up failed: '+e.message;
    }finally{btn.textContent='🎉 Create my account';btn.disabled=false;}
  });
}

// Wire on load
document.addEventListener('DOMContentLoaded',()=>wireAuthEvents());
