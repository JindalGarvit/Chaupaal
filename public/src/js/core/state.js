// ===================== STATE =====================
let quietMode=false,currentLang='en';
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
  /** ~0.08s — subtle UI tap / nav */
  function tap(){tone(880,0,0.07,'sine',0.045);}
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
  return{play,playFeedback,speak,tap,like,send,postPublish,follow,notification,error,rateLimited,sectionComplete,milestone};
})();

// ===================== TOAST =====================
function showToast(msg,dur=3000){
  const t=document.getElementById('toast');
  if(t&&!t.getAttribute('role')){t.setAttribute('role','status');t.setAttribute('aria-live','polite');}
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),dur);
}

// ===================== SETTINGS =====================
document.getElementById('settingsBtn').addEventListener('click',()=>{
  document.getElementById('settingsModal').classList.remove('hidden');
  populateVoiceDropdown();
  if(typeof applyNotifPrefsToSettingsUI==='function') applyNotifPrefsToSettingsUI();
  if(typeof hydrateNotifPrefsFromFirestore==='function') hydrateNotifPrefsFromFirestore();
  const typeHost=document.getElementById('settingsProfileTypeHost');
  if(typeHost && typeof renderProfileTypeToggleHtml==='function'){
    typeHost.innerHTML=renderProfileTypeToggleHtml();
    if(typeof wireProfileTypeToggle==='function') wireProfileTypeToggle(typeHost);
  }
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
});
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
  // Quiet mode only gates cues/TTS — no background music to restart.
});
