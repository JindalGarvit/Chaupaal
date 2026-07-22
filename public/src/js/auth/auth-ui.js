// ===================== AUTH =====================
function showAuth(){document.getElementById('authOverlay').classList.remove('hidden');}
function hideAuth(){document.getElementById('authOverlay').classList.add('hidden');}

// Auth v2 — listeners wired in auth_js.js

function updateProfileBtn(){
  // Mobile profile button
  const btn=document.getElementById('profileBtnInner');
  if(currentUser?.photoURL){
    const img=document.createElement('img');img.src=currentUser.photoURL;
    img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:50%;';
    btn?.replaceWith(img);if(img)img.id='profileBtnInner';
  } else if(currentUser){
    if(btn){btn.textContent=(currentUser.displayName||'U')[0].toUpperCase();
    btn.style.cssText='font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;color:var(--red);';}
  }
  // Desktop sidebar profile
  const sidebarName=document.getElementById('sidebarProfileName');
  const sidebarIcon=document.getElementById('sidebarProfileIcon');
  if(sidebarName&&currentUser) sidebarName.textContent=userProfile?.name?.split(' ')[0]||currentUser.displayName?.split(' ')[0]||'Profile';
  if(sidebarIcon&&currentUser?.photoURL){
    const img=document.createElement('img');img.src=currentUser.photoURL;
    img.style.cssText='width:32px;height:32px;border-radius:50%;object-fit:cover;';
    sidebarIcon.replaceWith(img);
  } else if(sidebarIcon&&currentUser){
    sidebarIcon.textContent=(currentUser.displayName||'U')[0].toUpperCase();
  }
}

function updateSidebarStreak(n){
  const el=document.getElementById('sidebarStreak');if(el)el.textContent=n;
  const rpEl=document.getElementById('rpStreakNum');if(rpEl)rpEl.textContent=`${n} 🔥`;
}

if (auth) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) return;
    currentUser = user;
    if (!db) {
      updateProfileBtn();
      return;
    }
    const s = await db.collection('users').doc(user.uid).get();
    if (s.exists) {
      userProfile = s.data();
      try {
        if (typeof UsersPublic !== 'undefined' && UsersPublic.syncPublicProfile) {
          await UsersPublic.syncPublicProfile(user.uid, userProfile);
        }
      } catch (e) {}
      if (typeof AuthProfiles !== 'undefined' && AuthProfiles.hydrateActiveProfile) {
        try {
          await AuthProfiles.hydrateActiveProfile(user.uid, userProfile);
        } catch (e) {}
      }
      if (userProfile.lang) {
        currentLang = userProfile.lang;
        const langSelect = document.getElementById('langSelect');
        if (langSelect) langSelect.value = currentLang;
      }
      if (typeof hydrateIcebreakersFromUserDoc === 'function') hydrateIcebreakersFromUserDoc(userProfile);
      if (typeof hydratePromptsFromUserDoc === 'function') hydratePromptsFromUserDoc(userProfile);
      if (typeof hydrateProfileTypeFromUserDoc === 'function') hydrateProfileTypeFromUserDoc(userProfile);
      if (typeof hydrateProfileSectionsFromUserDoc === 'function') hydrateProfileSectionsFromUserDoc(userProfile);
      if (userProfile.profileMedia || userProfile.profile?.profileMedia) {
        const media = userProfile.profileMedia || userProfile.profile.profileMedia;
        if (typeof digitalProfile !== 'undefined') digitalProfile.profileMedia = media;
        try {
          localStorage.setItem('chaupaal_profile_media', JSON.stringify(media));
        } catch (e) {}
      }
      if (userProfile.profile && typeof digitalProfile !== 'undefined') {
        ['bio', 'interests', 'prompts', 'gender', 'dateOfBirth', 'currentCity', 'occupation'].forEach((k) => {
          if (userProfile.profile[k] != null) digitalProfile[k] = userProfile.profile[k];
        });
        try {
          localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
        } catch (e) {}
      }
    }
    updateProfileBtn();
  });
}
