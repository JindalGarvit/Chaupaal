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

if(auth){auth.onAuthStateChanged(async user=>{if(user){currentUser=user;if(db){const s=await db.collection('users').doc(user.uid).get();if(s.exists){userProfile=s.data();if(userProfile.lang){currentLang=userProfile.lang;document.getElementById('langSelect').value=currentLang;}if(typeof hydrateIcebreakersFromUserDoc==='function')hydrateIcebreakersFromUserDoc(userProfile);if(typeof hydrateProfileTypeFromUserDoc==='function')hydrateProfileTypeFromUserDoc(userProfile);}}updateProfileBtn();}});}
