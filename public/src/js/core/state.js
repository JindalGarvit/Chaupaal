// ===================== STATE =====================
let quietMode=false,currentLang='en';
try{ quietMode = localStorage.getItem('chaupaal_quiet')==='1'; }catch(e){}
try{ document.documentElement.classList.toggle('quiet-mode', !!quietMode); }catch(e){}
let score=0,maxUnlocked=0,categoryScores={};
let QUESTIONS=[],BONUS_QUESTIONS=[];

// ===================== SOUND LIBRARY =====================
// Short UI cues only (Web Audio oscillators). No looped / ambient background music.
const SoundLib=(()=>{
  let ctx;
  function getCtx(){if(!ctx)ctx=new(window.AudioContext||window.webkitAudioContext)();return ctx;}
  function tone(freq,start,dur,type='sine',gainVal=0.15){
    const c=getCtx(),osc=c.createOscillator(),gain=c.createGain();
    osc.type=type;osc.frequency.value=freq;gain.gain.value=0;
    osc.connect(gain);gain.connect(c.destination);
    const t0=c.currentTime+start;
    gain.gain.linearRampToValueAtTime(gainVal,t0+0.01);
    gain.gain.exponentialRampToValueAtTime(0.001,t0+dur);
    osc.start(t0);osc.stop(t0+dur+0.04);
  }
  function correctChime(){tone(523.25,0,0.25,'triangle');tone(784,0.08,0.35,'triangle');}
  function wrongTone(){tone(330,0,0.3,'sine',0.1);tone(220,0.12,0.4,'sine',0.08);}
  function cheer(){[523.25,659.25,783.99,1046.5].forEach((f,i)=>tone(f,i*0.08,0.3,'triangle',0.14));tone(1046.5,0.32,0.5,'triangle',0.12);}
  function birthdayJingle(){[392,392,440,392,523,494].forEach((f,i)=>tone(f,i*0.15,0.22,'triangle',0.13));}
  /** ~0.08s — subtle UI tap / nav (always on unless Quiet) */
  function tap(){
    tone(880,0,0.07,'sine',0.045);
  }
  /** ~0.2s — like */
  function like(){tone(660,0,0.12,'triangle',0.1);tone(990,0.06,0.14,'triangle',0.08);}
  /** ~0.25s — message send */
  function send(){tone(520,0,0.1,'sine',0.09);tone(780,0.08,0.16,'triangle',0.1);}
  /** ~0.4s — publish post */
  function postPublish(){tone(392,0,0.12,'triangle',0.1);tone(523,0.1,0.14,'triangle',0.11);tone(784,0.22,0.2,'triangle',0.1);}
  /** ~0.3s — follow / friend */
  function follow(){tone(494,0,0.14,'sine',0.09);tone(740,0.1,0.2,'triangle',0.11);}
  /** ~0.3s — incoming notification */
  function notification(){tone(880,0,0.1,'sine',0.08);tone(1175,0.12,0.16,'sine',0.07);}
  /** ~0.3s — error / rate limit (soft, not harsh) */
  function error(){tone(280,0,0.16,'triangle',0.08);tone(220,0.1,0.2,'sine',0.07);}
  const rateLimited=error;
  /** ~0.55s — profile section filled */
  function sectionComplete(){tone(523,0,0.14,'triangle',0.1);tone(659,0.12,0.16,'triangle',0.11);tone(784,0.28,0.28,'triangle',0.1);}
  /** ~0.9s — milestone (extended cheer) */
  function milestone(){
    [523.25,659.25,783.99,1046.5].forEach((f,i)=>tone(f,i*0.09,0.28,'triangle',0.13));
    tone(1318.5,0.4,0.35,'triangle',0.11);
    tone(1046.5,0.55,0.4,'triangle',0.1);
  }
  /** Short themed one-shots per element tab (silenced by Quiet only). */
  function element(tab, kind){
    if(quietMode) return;
    const t0 = String(tab||'');
    const strong = kind === 'ambience' || kind === 'open';
    const g = strong ? 0.1 : 0.07;
    if(t0==='peepal'){ tone(392,0,0.12,'triangle',g); tone(523,0.08,0.14,'sine',g*0.85); }
    else if(t0==='duniya'){ tone(440,0,0.1,'sine',g); tone(554,0.1,0.18,'sine',g*0.8); }
    else if(t0==='baithak'){ tone(349,0,0.14,'triangle',g); tone(415,0.1,0.16,'triangle',g*0.75); }
    else if(t0==='akhbaar'){ tone(587,0,0.08,'square',g*0.55); tone(698,0.07,0.1,'square',g*0.45); }
    else if(t0==='dangal'){ tone(220,0,0.08,'sawtooth',g*0.5); tone(330,0.05,0.12,'triangle',g); tone(880,0.14,0.08,'sine',g*0.6); }
    else { tap(); }
  }
  function playFeedback(isCorrect,soundTag){
    if(quietMode)return;
    if(isCorrect){if(soundTag==='cheer')cheer();else if(soundTag==='birthday')birthdayJingle();else if(soundTag==='milestone')milestone();else correctChime();}
    else wrongTone();
  }
  function play(name){
    if(quietMode)return;
    const map={
      tap,like,send,postPublish,follow,notification,error,rateLimited,
      sectionComplete,milestone,correctChime,wrongTone,cheer,birthdayJingle,
    };
    const fn=map[name];
    if(typeof fn==='function') fn();
  }
  let voices=[];
  function loadVoices(){voices=window.speechSynthesis?window.speechSynthesis.getVoices():[];}
  if(window.speechSynthesis){loadVoices();window.speechSynthesis.onvoiceschanged=loadVoices;}
  function speak(text){
    if(quietMode||!window.speechSynthesis)return;
    const utter=new SpeechSynthesisUtterance(text);
    const v=voices.find(v=>/samantha|google us|zira|female/i.test(v.name))||voices[0];
    if(v)utter.voice=v;utter.pitch=1.15;utter.rate=0.95;utter.volume=0.8;
    window.speechSynthesis.cancel();window.speechSynthesis.speak(utter);
  }
  // startBg/stopBg removed — no continuous / looped audio in the app.
  return{play,playFeedback,speak,tap,like,send,postPublish,follow,notification,error,rateLimited,sectionComplete,milestone,element};
})();

// ===================== TOAST =====================
function showToast(msg,dur=3000){
  const t=document.getElementById('toast');
  if(t&&!t.getAttribute('role')){t.setAttribute('role','status');t.setAttribute('aria-live','polite');}
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),dur);
}

// ===================== SETTINGS =====================
function openSettingsModal(){
  const modal=document.getElementById('settingsModal');
  if(!modal) return;
  modal.classList.remove('hidden');
  if(typeof populateVoiceDropdown==='function') populateVoiceDropdown();
  if(typeof applyNotifPrefsToSettingsUI==='function') applyNotifPrefsToSettingsUI();
  if(typeof hydrateNotifPrefsFromFirestore==='function') hydrateNotifPrefsFromFirestore();
  const typeHost=document.getElementById('settingsProfileTypeHost');
  if(typeHost && typeof renderProfileTypeToggleHtml==='function'){
    typeHost.innerHTML=renderProfileTypeToggleHtml();
    if(typeof wireProfileTypeToggle==='function') wireProfileTypeToggle(typeHost);
  }
  // Display / sensory theme
  try{
    const mode=(typeof ChaupaalTheme!=='undefined'&&ChaupaalTheme.getDisplayMode)?ChaupaalTheme.getDisplayMode():'auto';
    const radio=document.querySelector(`input[name="displayMode"][value="${mode}"]`);
    if(radio) radio.checked=true;
    const quiet=document.getElementById('toggleQuiet');
    if(quiet) quiet.checked=!!quietMode || localStorage.getItem('chaupaal_quiet')==='1';
    if(typeof updateThemeGeoStatusUI==='function') updateThemeGeoStatusUI();
  }catch(e){}
  // Companion opt-out: checked = outreach ON (optOut false)
  try{
    const el=document.getElementById('toggleCompanionOutreach');
    if(el){
      const localOut=localStorage.getItem('chaupaal_companion_opt_out')==='1';
      el.checked=!localOut;
      if(db&&currentUser){
        db.collection('users').doc(currentUser.uid).get().then(snap=>{
          if(snap.exists && snap.data()?.companionOptOut===true) el.checked=false;
          else if(snap.exists && snap.data()?.companionOptOut===false) el.checked=true;
          const appear=document.getElementById('toggleAkhbaarAppearInFriends');
          if(appear){
            if(snap.exists && snap.data()?.akhbaarAppearInFriendsPrompts===false) appear.checked=false;
            else appear.checked=true;
          }
        }).catch(()=>{});
      }
    }
  }catch(e){}
}
window.openSettingsModal = openSettingsModal;
document.getElementById('settingsBtn')?.addEventListener('click', openSettingsModal);
document.getElementById('settingsArchiveBtn')?.addEventListener('click',()=>{
  document.getElementById('settingsModal')?.classList.add('hidden');
  if(typeof openArchiveHub==='function') openArchiveHub('stories');
  else if(typeof openArchive==='function') openArchive();
});
document.getElementById('closeSettings').addEventListener('click',()=>document.getElementById('settingsModal').classList.add('hidden'));
document.getElementById('saveSettings').addEventListener('click',()=>{
  const langVal=document.getElementById('langSelect')?.value||'en';
  if(typeof setAppLanguage==='function') setAppLanguage(langVal,{persistRemote:true});
  else currentLang=langVal;
  if(typeof readNotifPrefsFromSettingsUI==='function'&&typeof saveNotifPrefs==='function'){
    saveNotifPrefs(readNotifPrefsFromSettingsUI());
  }
  // Share-with-friends toggles (local for now)
  try{
    localStorage.setItem('chaupaal_share_toggles',JSON.stringify({
      birthday:!!document.getElementById('toggleBirthday')?.checked,
      trip:!!document.getElementById('toggleTrip')?.checked,
      anniversary:!!document.getElementById('toggleAnniversary')?.checked,
    }));
  }catch(e){}
  // Companion outreach opt-out (persisted on user doc — disables proactive companion only)
  try{
    const companionOn=!!document.getElementById('toggleCompanionOutreach')?.checked;
    localStorage.setItem('chaupaal_companion_opt_out', companionOn?'0':'1');
    if(db&&currentUser){
      db.collection('users').doc(currentUser.uid).set({ companionOptOut: !companionOn }, { merge:true }).catch(()=>{});
    }
  }catch(e){}
  // Appear in friends' personalized Akhbaar prompts (default on)
  try{
    const appearOn=!!document.getElementById('toggleAkhbaarAppearInFriends')?.checked;
    if(db&&currentUser){
      db.collection('users').doc(currentUser.uid).set({ akhbaarAppearInFriendsPrompts: appearOn }, { merge:true }).catch(()=>{});
    }
  }catch(e){}
  // Display mode (ambient folded under Quiet — no separate toggle)
  try{
    const modeEl=document.querySelector('input[name="displayMode"]:checked');
    const mode=modeEl?.value||'auto';
    if(typeof ChaupaalTheme!=='undefined'&&ChaupaalTheme.setDisplayMode) ChaupaalTheme.setDisplayMode(mode);
  }catch(e){}
  document.getElementById('settingsModal').classList.add('hidden');
  showToast(t('settings_saved'));
});
document.getElementById('settingsSessionsBtn')?.addEventListener('click',()=>{
  document.getElementById('settingsModal').classList.add('hidden');
  if(typeof openSessionsSheet==='function') openSessionsSheet();
});
document.getElementById('settingsBlockedBtn')?.addEventListener('click',()=>{
  document.getElementById('settingsModal').classList.add('hidden');
  if(typeof openBlockedUsersSheet==='function') openBlockedUsersSheet();
});
document.getElementById('toggleOpenToMeet').addEventListener('change',e=>{
  const isOn=e.target.value==='on';
  if(typeof handleOpenToMeetToggle==='function') handleOpenToMeetToggle(isOn);
  else { openToMeet=isOn; try{localStorage.setItem('chaupaal_open_to_meet',JSON.stringify(isOn));}catch(err){} }
  const limitRow=document.getElementById('strangerLimitRow');
  if(limitRow){limitRow.style.opacity=isOn?'1':'0.4';limitRow.style.pointerEvents=isOn?'':'none';}
});
document.getElementById('strangerLimitSlider')?.addEventListener('input',e=>{
  const val=parseInt(e.target.value);
  document.getElementById('strangerLimitDisplay').textContent=val;
  strangerDailyLimit=val;
  try{localStorage.setItem('chaupaal_stranger_limit',val);}catch(err){}
  if(db&&currentUser)db.collection('users').doc(currentUser.uid).update({strangerDailyLimit:val}).catch(()=>{});
});





document.getElementById('toggleQuiet').addEventListener('change',e=>{
  quietMode=e.target.checked;
  try{localStorage.setItem('chaupaal_quiet', quietMode?'1':'0');}catch(err){}
  // Quiet kills ambient + voice + UI cues (SoundLib/Micro already check quietMode)
  try{ if(window.speechSynthesis) window.speechSynthesis.cancel(); }catch(err){}
  try{ document.documentElement.classList.toggle('quiet-mode', !!quietMode); }catch(err){}
  try{ if(typeof TabElements!=='undefined'&&TabElements.syncQuietClass) TabElements.syncQuietClass(); }catch(err){}
  if(quietMode){
    if(typeof ChaupaalAmbient!=='undefined'&&ChaupaalAmbient.hardStop) ChaupaalAmbient.hardStop(120);
    else if(typeof ChaupaalAmbient!=='undefined'&&ChaupaalAmbient.sync) ChaupaalAmbient.sync();
  }else if(typeof ChaupaalAmbient!=='undefined'&&ChaupaalAmbient.sync){
    ChaupaalAmbient.sync();
  }
  if(typeof ChaupaalTheme!=='undefined'&&ChaupaalTheme.recompute) ChaupaalTheme.recompute('quiet');
});

// Apply display mode immediately when tapped (don't wait for Done)
document.querySelectorAll('input[name="displayMode"]').forEach((el)=>{
  el.addEventListener('change',()=>{
    const mode=el.value||'auto';
    if(typeof ChaupaalTheme!=='undefined'&&ChaupaalTheme.setDisplayMode){
      ChaupaalTheme.setDisplayMode(mode);
    }else if(typeof applyTheme==='function'){
      applyTheme(mode==='light'?'clearDay':'night');
    }
  });
});

function updateThemeGeoStatusUI(){
  const statusEl=document.getElementById('themeGeoStatus');
  const btn=document.getElementById('themeGeoEnableBtn');
  if(!statusEl) return;
  const consent=(typeof ChaupaalTheme!=='undefined'&&ChaupaalTheme.getGeoConsent)?ChaupaalTheme.getGeoConsent():'unknown';
  const key=consent==='granted'?'display_geo_status_granted':consent==='denied'?'display_geo_status_denied':'display_geo_status_unknown';
  statusEl.textContent=typeof t==='function'?t(key):key;
  if(btn){
    const show=consent!=='granted';
    btn.style.display=show?'block':'none';
  }
}

async function promptThemeGeoConsent(){
  return new Promise((resolve)=>{
    const existing=document.getElementById('themeGeoConsentModal');
    existing?.remove();
    const wrap=document.createElement('div');
    wrap.id='themeGeoConsentModal';
    wrap.className='modal-backdrop';
    wrap.innerHTML=`
      <div class="modal" style="max-width:340px;">
        <div class="modal-header"><div class="modal-title">${typeof t==='function'?t('display_geo_prompt_title'):'Match Chaupaal to your sky?'}</div></div>
        <p style="font-size:14px;color:var(--muted);line-height:1.5;margin:0 0 16px;">${typeof t==='function'?t('display_geo_prompt_body'):''}</p>
        <button type="button" class="btn btn--primary btn--block" data-allow style="margin-bottom:8px;">${typeof t==='function'?t('display_geo_prompt_allow'):'Continue'}</button>
        <button type="button" class="btn btn--block" data-deny>${typeof t==='function'?t('display_geo_prompt_deny'):'Not now'}</button>
      </div>`;
    document.body.appendChild(wrap);
    const done=(v)=>{ wrap.remove(); resolve(v); };
    wrap.querySelector('[data-allow]')?.addEventListener('click',()=>done(true));
    wrap.querySelector('[data-deny]')?.addEventListener('click',()=>done(false));
    wrap.addEventListener('click',(e)=>{ if(e.target===wrap) done(false); });
  });
}

document.getElementById('themeGeoEnableBtn')?.addEventListener('click', async ()=>{
  const ok=await promptThemeGeoConsent();
  if(!ok){
    if(typeof ChaupaalTheme!=='undefined'&&ChaupaalTheme.setGeoConsent) ChaupaalTheme.setGeoConsent('denied');
    updateThemeGeoStatusUI();
    return;
  }
  if(!navigator.geolocation){
    if(typeof ChaupaalTheme!=='undefined'&&ChaupaalTheme.setGeoConsent) ChaupaalTheme.setGeoConsent('denied');
    updateThemeGeoStatusUI();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ()=>{
      if(typeof ChaupaalTheme!=='undefined'&&ChaupaalTheme.setGeoConsent) ChaupaalTheme.setGeoConsent('granted');
      updateThemeGeoStatusUI();
      if(typeof refreshWeatherTheme==='function') refreshWeatherTheme();
      if(typeof showToast==='function') showToast(typeof t==='function'?t('display_geo_status_granted'):'Location on');
    },
    ()=>{
      if(typeof ChaupaalTheme!=='undefined'&&ChaupaalTheme.setGeoConsent) ChaupaalTheme.setGeoConsent('denied');
      updateThemeGeoStatusUI();
    },
    { enableHighAccuracy:false, timeout:10000, maximumAge:0 }
  );
});

// First Auto + sensory: soft-prompt for theme geo (not friend location sharing)
document.addEventListener('DOMContentLoaded',()=>{
  setTimeout(async ()=>{
    try{
      if(typeof ChaupaalTheme==='undefined') return;
      await ChaupaalTheme.refreshFlags?.();
      if(!ChaupaalTheme.isSensoryEnabled?.()) return;
      if(ChaupaalTheme.getDisplayMode?.()!=='auto') return;
      const c=ChaupaalTheme.getGeoConsent?.();
      if(c==='granted'||c==='denied'||c==='prompted') return;
      ChaupaalTheme.setGeoConsent('prompted');
      const ok=await promptThemeGeoConsent();
      if(ok&&navigator.geolocation){
        navigator.geolocation.getCurrentPosition(
          ()=>{ ChaupaalTheme.setGeoConsent('granted'); if(typeof refreshWeatherTheme==='function') refreshWeatherTheme(); },
          ()=>ChaupaalTheme.setGeoConsent('denied')
        );
      }else{
        ChaupaalTheme.setGeoConsent(ok?'denied':'denied');
      }
    }catch(e){}
  },2500);
});
