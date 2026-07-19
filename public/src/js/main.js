// ===================== BOOTSTRAP =====================
(async()=>{
  const live=await fetchTodaysContent();
  QUESTIONS=(live?.questions?.length)?live.questions:SAMPLE_QUESTIONS;
  BONUS_QUESTIONS=(live?.bonus?.length)?live.bonus:SAMPLE_BONUS;
  QUESTIONS=QUESTIONS.sort(()=>Math.random()-0.5);
  buildAkhbaar(QUESTIONS,BONUS_QUESTIONS);
  initCategoryRatings();
  initBaithak();
  // Set Peepal as default active tab
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('panel-peepal')?.classList.add('active');
  document.querySelector('[data-tab="peepal"]')?.classList.add('active');
  document.getElementById('progressBar').style.display='none';
  // Peepal is the default tab — hydrate its feed/discovery
  if(typeof initPeepal==='function') setTimeout(()=>initPeepal(),0);

  setTimeout(()=>{
    document.getElementById('splash').classList.add('hide');
    initDynamicTheme();
    if(typeof initOfflineDetection==='function') initOfflineDetection();
    checkViralLink();
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
          if(typeof initBaithak==='function') initBaithak();
          // Backfill search denorms for older accounts (Phase 4)
          if(db&&userProfile){
            const patch={};
            if(!userProfile.nameLower&&userProfile.name) patch.nameLower=String(userProfile.name).toLowerCase().trim();
            if(!userProfile.usernameLower&&userProfile.username) patch.usernameLower=String(userProfile.username).toLowerCase().trim();
            if(Object.keys(patch).length){
              db.collection('users').doc(user.uid).set(patch,{merge:true}).catch(()=>{});
              Object.assign(userProfile,patch);
            }
          }
        }
      });
    } else {setTimeout(()=>{showOnboarding();setTimeout(showAuth,8000);},600);}
    requestNotificationPermission();scheduleLocalNudge();scheduleEveningCheckIn();
    setTimeout(checkBreakingNews,3000);
  },1400);
})();
