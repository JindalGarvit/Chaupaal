// ===================== STATE =====================
let quietMode=false,currentLang='en';
let score=0,maxUnlocked=0,categoryScores={};
let QUESTIONS=[],BONUS_QUESTIONS=[];

// ===================== SOUND LIBRARY =====================
const SoundLib=(()=>{
  let ctx,bgGain,bgNodes=[],bgPlaying=false;
  const bgMusicUrl="https://incompetech.com/music/royalty-free/mp3-royaltyfree/Wholesome.mp3";
  function getCtx(){if(!ctx)ctx=new(window.AudioContext||window.webkitAudioContext)();return ctx;}
  function tone(freq,start,dur,type='sine',gainVal=0.15){
    const c=getCtx(),osc=c.createOscillator(),gain=c.createGain();
    osc.type=type;osc.frequency.value=freq;gain.gain.value=0;
    osc.connect(gain);gain.connect(c.destination);
    const t0=c.currentTime+start;
    gain.gain.linearRampToValueAtTime(gainVal,t0+0.02);
    gain.gain.exponentialRampToValueAtTime(0.001,t0+dur);
    osc.start(t0);osc.stop(t0+dur+0.05);
  }
  function correctChime(){tone(523.25,0,0.25,'triangle');tone(784,0.08,0.35,'triangle');}
  function wrongTone(){tone(330,0,0.3,'sine',0.1);tone(220,0.12,0.4,'sine',0.08);}
  function cheer(){[523.25,659.25,783.99,1046.5].forEach((f,i)=>tone(f,i*0.08,0.3,'triangle',0.14));tone(1046.5,0.32,0.5,'triangle',0.12);}
  function birthdayJingle(){[392,392,440,392,523,494].forEach((f,i)=>tone(f,i*0.15,0.22,'triangle',0.13));}
  function playFeedback(isCorrect,soundTag){
    if(quietMode)return;
    if(isCorrect){if(soundTag==='cheer')cheer();else if(soundTag==='birthday')birthdayJingle();else correctChime();}
    else wrongTone();
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
  function startBg(){
    if(bgPlaying||quietMode)return;bgPlaying=true;
    if(bgMusicUrl){const a=new Audio(bgMusicUrl);a.loop=true;a.volume=0.2;a.play().catch(()=>{});bgNodes.push({stop:()=>a.pause()});return;}
    bgGain=getCtx().createGain();bgGain.gain.value=0.04;bgGain.connect(getCtx().destination);
    [196,246.94,293.66].forEach((freq,i)=>{
      const osc=getCtx().createOscillator(),lfo=getCtx().createOscillator(),lg=getCtx().createGain();
      osc.type='sine';osc.frequency.value=freq;lfo.frequency.value=0.05+i*0.02;lg.gain.value=0.02;
      lfo.connect(lg);lg.connect(osc.frequency);osc.connect(bgGain);osc.start();lfo.start();bgNodes.push(osc,lfo);
    });
  }
  function stopBg(){bgPlaying=false;bgNodes.forEach(n=>{try{n.stop?n.stop():null;}catch(e){}});bgNodes=[];}
  return{playFeedback,speak,startBg,stopBg};
})();

// ===================== TOAST =====================
function showToast(msg,dur=3000){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),dur);
}

// ===================== SETTINGS =====================
document.getElementById('settingsBtn').addEventListener('click',()=>{
  document.getElementById('settingsModal').classList.remove('hidden');
  populateVoiceDropdown();
  if(typeof applyNotifPrefsToSettingsUI==='function') applyNotifPrefsToSettingsUI();
  if(typeof hydrateNotifPrefsFromFirestore==='function') hydrateNotifPrefsFromFirestore();
});
document.getElementById('closeSettings').addEventListener('click',()=>document.getElementById('settingsModal').classList.add('hidden'));
document.getElementById('saveSettings').addEventListener('click',()=>{
  currentLang=document.getElementById('langSelect').value;
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
  if(quietMode)SoundLib.stopBg();else SoundLib.startBg();
});
