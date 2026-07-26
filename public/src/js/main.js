// ===================== BOOTSTRAP =====================
(async()=>{
  const hideSplash=()=>{
    try{document.getElementById('splash')?.classList.add('hide');}catch(e){}
  };
  const scheduleIdle=(fn,timeoutMs=2500)=>{
    if(typeof requestIdleCallback==='function'){
      requestIdleCallback(()=>{try{fn();}catch(e){console.warn('[boot] idle',e);}},{timeout:timeoutMs});
    } else {
      setTimeout(()=>{try{fn();}catch(e){console.warn('[boot] idle',e);}},Math.min(400,timeoutMs));
    }
  };
  const afterPaint=(fn)=>{
    requestAnimationFrame(()=>requestAnimationFrame(()=>{try{fn();}catch(e){console.warn('[boot] paint',e);}}));
  };

  // Peepal is the default tab — activate shell immediately (also marked active in HTML).
  try{
    document.querySelectorAll('.tab-panel').forEach(p=>{
      p.classList.toggle('active', p.id==='panel-peepal');
    });
    document.querySelectorAll('.tab-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.tab==='peepal');
    });
    const progressBar=document.getElementById('progressBar');
    if(progressBar) progressBar.style.display='none';
  }catch(e){}

  // Always dismiss splash even if later init throws (stuck splash = "app won't open").
  const splashTimer=setTimeout(hideSplash,900);

  const bootAkhbaarContent=async()=>{
    try{
      const live=await fetchTodaysContent();
      const offlineBank=[
        ...(typeof SAMPLE_QUESTIONS!=='undefined'?SAMPLE_QUESTIONS:[]),
        ...(typeof AKHBAAR_BANK!=='undefined'?AKHBAAR_BANK:[]),
      ];
      QUESTIONS=(live?.questions?.length)?live.questions:offlineBank;
      BONUS_QUESTIONS=(live?.bonus?.length)?live.bonus:(typeof SAMPLE_BONUS!=='undefined'?SAMPLE_BONUS:[]);
      QUESTIONS=QUESTIONS.sort(()=>Math.random()-0.5);
      if(typeof window.__resolveAkhbaarContent==='function'){
        try{window.__resolveAkhbaarContent();}catch(e){}
      }
      // Do not build DOM here — ensureAkhbaarBuilt runs on first Akhbaar open / idle.
      if(typeof window.ensureAkhbaarBuilt==='function'){
        scheduleIdle(()=>window.ensureAkhbaarBuilt(),4000);
      }
    }catch(e){
      console.warn('[boot] akhbaar content',e);
      if(typeof window.__resolveAkhbaarContent==='function'){
        try{window.__resolveAkhbaarContent();}catch(err){}
      }
    }
  };

  // Resolves when daily set (or offline fallback) is assigned — Akhbaar build can wait briefly.
  window.chaupaalAkhbaarContentReady=new Promise(resolve=>{
    window.__resolveAkhbaarContent=()=>{resolve();window.__resolveAkhbaarContent=null;};
  });

  try{
    // Hydrate Peepal after App Check has a chance to activate (double-rAF gated).
    const startPeepal=()=>{
      if(typeof initPeepal==='function'){
        try{initPeepal();}catch(e){console.warn('[boot] initPeepal',e);}
      }
    };
    if(window.chaupaalAppCheckReady&&typeof window.chaupaalAppCheckReady.then==='function'){
      window.chaupaalAppCheckReady.then(()=>afterPaint(startPeepal)).catch(()=>afterPaint(startPeepal));
    } else {
      afterPaint(startPeepal);
    }

    // Non-critical tabs: defer off the LCP path
    scheduleIdle(()=>{
      try{initBaithak();}catch(e){console.warn('[boot] initBaithak',e);}
    },3000);
    scheduleIdle(()=>{
      try{initCategoryRatings();}catch(e){console.warn('[boot] initCategoryRatings',e);}
    },3500);
    scheduleIdle(()=>{ bootAkhbaarContent(); },2000);

    setTimeout(()=>{
      hideSplash();
      clearTimeout(splashTimer);
      try{initDynamicTheme();}catch(e){}
      if(typeof initOfflineDetection==='function') initOfflineDetection();
      try{checkViralLink();}catch(e){}
      if(typeof initDeepLinks==='function') initDeepLinks();
      if(auth){
        auth.onAuthStateChanged(user=>{
          if(!user){
            setTimeout(()=>{showOnboarding();setTimeout(showAuth,onboardingDone?600:8000);},600);
          } else {
            updateProfileBtn();
            scheduleIdle(()=>{try{initCategoryRatings();}catch(e){}},1000);
            if(!onboardingDone)showOnboarding();
            loadStreak();
            initActivityStatus();
            if(typeof registerSession==='function') registerSession();
            if(typeof loadBlockedFromFirestore==='function') loadBlockedFromFirestore();
            if(typeof hydrateNotifPrefsFromFirestore==='function') hydrateNotifPrefsFromFirestore();
            if(typeof persistProfileCompletion==='function'&&typeof calcProfileCompletion==='function'){
              persistProfileCompletion(calcProfileCompletion());
            }
            if(typeof installNotifGate==='function') installNotifGate();
            if(typeof initBaithak==='function'){
              scheduleIdle(()=>{try{initBaithak();}catch(e){console.warn('[boot] initBaithak auth',e);}},800);
            }
            if(db&&userProfile){
              const patch={};
              if(!userProfile.nameLower&&userProfile.name) patch.nameLower=String(userProfile.name).toLowerCase().trim();
              if(!userProfile.usernameLower&&userProfile.username) patch.usernameLower=String(userProfile.username).toLowerCase().trim();
              if(Object.keys(patch).length){
                db.collection('users').doc(user.uid).set(patch,{merge:true}).catch(()=>{});
                Object.assign(userProfile,patch);
                try{
                  if(typeof UsersPublic!=='undefined'&&UsersPublic.syncPublicProfile){
                    UsersPublic.syncPublicProfile(user.uid,{...userProfile,...patch});
                  }
                }catch(e){}
              }
            }
          }
        });
      } else {setTimeout(()=>{showOnboarding();setTimeout(showAuth,8000);},600);}
      // Push permission / nudges are non-critical — wait longer
      scheduleIdle(()=>{
        try{requestNotificationPermission();}catch(e){}
        try{scheduleLocalNudge();}catch(e){}
        try{scheduleEveningCheckIn();}catch(e){}
      },5000);
      setTimeout(()=>{try{checkBreakingNews();}catch(e){}},5000);
    },900);
  }catch(e){
    console.error('[boot] fatal',e);
    hideSplash();
  }
})();
