// ===================== BOOTSTRAP =====================
(async()=>{
  const hideSplash=()=>{
    try{document.getElementById('splash')?.classList.add('hide');}catch(e){}
  };
  // Always dismiss splash even if later init throws (stuck splash = "app won't open").
  const splashTimer=setTimeout(hideSplash,1400);
  try{
    const live=await fetchTodaysContent();
    const offlineBank=[
      ...(typeof SAMPLE_QUESTIONS!=='undefined'?SAMPLE_QUESTIONS:[]),
      ...(typeof AKHBAAR_BANK!=='undefined'?AKHBAAR_BANK:[]),
    ];
    QUESTIONS=(live?.questions?.length)?live.questions:offlineBank;
    BONUS_QUESTIONS=(live?.bonus?.length)?live.bonus:(typeof SAMPLE_BONUS!=='undefined'?SAMPLE_BONUS:[]);
    QUESTIONS=QUESTIONS.sort(()=>Math.random()-0.5);
    try{buildAkhbaar(QUESTIONS,BONUS_QUESTIONS);}catch(e){console.warn('[boot] buildAkhbaar',e);}
    try{initCategoryRatings();}catch(e){console.warn('[boot] initCategoryRatings',e);}
    try{initBaithak();}catch(e){console.warn('[boot] initBaithak',e);}
    // Set Peepal as default active tab
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById('panel-peepal')?.classList.add('active');
    document.querySelector('[data-tab="peepal"]')?.classList.add('active');
    const progressBar=document.getElementById('progressBar');
    if(progressBar) progressBar.style.display='none';
    // Peepal is the default tab — hydrate its feed/discovery
    if(typeof initPeepal==='function') setTimeout(()=>initPeepal(),0);

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
            updateProfileBtn();initCategoryRatings();
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
            // Refresh Baithak so Message Yourself is pinned after auth resolves
            if(typeof initBaithak==='function'){
              try{initBaithak();}catch(e){console.warn('[boot] initBaithak auth',e);}
            }
            // Backfill search denorms for older accounts → users + users_public
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
      try{requestNotificationPermission();}catch(e){}
      try{scheduleLocalNudge();}catch(e){}
      try{scheduleEveningCheckIn();}catch(e){}
      setTimeout(()=>{try{checkBreakingNews();}catch(e){}},3000);
    },1400);
  }catch(e){
    console.error('[boot] fatal',e);
    hideSplash();
  }
})();
