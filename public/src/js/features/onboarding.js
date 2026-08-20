// ===================== VIRAL GUEST MUQABALA =====================
function checkViralLink(){
  const params=new URLSearchParams(window.location.search);
  const challenger=params.get('challenge');
  if(!challenger)return;
  const category=params.get('cat')||'GK';
  const target=params.get('score');
  const game=params.get('game')||'quiz';
  const gName=(typeof getGame==='function'&&getGame(game)?.name)||(game==='quiz'?'Muqabala':game==='akhbaar'?'Akhbaar':game);
  // Show guest banner
  const banner=document.createElement('div');banner.className='guest-banner';
  banner.innerHTML=`<div><strong>${decodeURIComponent(challenger)}</strong> challenged you! Beat their score${target!=null?` of ${target}`:''} on ${gName}</div><button class="guest-signup-btn" id="guestSignupBtn">Sign up to keep score!</button>`;
  document.getElementById('topbar')?.after(banner);
  document.getElementById('guestSignupBtn')?.addEventListener('click',()=>{banner.remove();showAuth();});

  try{
    if(typeof TabHabits!=='undefined'&&TabHabits.markOverride) TabHabits.markOverride('viral_challenge');
  }catch(e){}

  if(game==='akhbaar'){
    window.__akhbaarBeatChallenge={
      challenger:decodeURIComponent(challenger),
      score:target!=null?Number(target):null,
    };
    document.querySelectorAll('.tab-btn').forEach(b=>{if(b.dataset.tab==='akhbaar')b.click();});
    setTimeout(()=>{
      if(typeof applyAkhbaarBeatBanner==='function') applyAkhbaarBeatBanner();
    },400);
    return;
  }

  // Auto-start on Dangal
  document.querySelectorAll('.tab-btn').forEach(b=>{if(b.dataset.tab==='dangal')b.click();});
  setTimeout(()=>{
    if(game==='quiz'||game==='muqabala'){
      if(typeof startMuqabala==='function') startMuqabala(decodeURIComponent(challenger),category);
    } else if(typeof getGame==='function'){
      const g=getGame(game);
      if(g) g.launch({source:'challenge',beatScore:target!=null?Number(target):null,challenger:decodeURIComponent(challenger)});
      else if(typeof startMuqabala==='function') startMuqabala(decodeURIComponent(challenger),category);
    }
  },500);
}

function generateChallengeLink(score,category,gameId){
  const gid=gameId||'quiz';
  const stats=typeof buildShareStats==='function'
    ? buildShareStats({
        scoreLine:String(score),
        score,
        meta:category||'GK',
        cat:category||'GK',
        text:`Can you beat my score of ${score} on Chaupaal? Play now!`,
      })
    : {scoreLine:String(score),score,meta:category||'GK',cat:category||'GK',text:`Can you beat my score of ${score} on Chaupaal? Play now!`};
  if(typeof shareGameResult==='function'){
    shareGameResult(gid, stats);
    return;
  }
  const name=encodeURIComponent(userProfile?.name||'Someone');
  const url=typeof buildBeatScoreLink==='function'
    ? buildBeatScoreLink(gid, score, {cat: category||'GK'})
    : `${window.location.origin}${window.location.pathname}?challenge=${name}&cat=${category||'GK'}&score=${score}&game=${gid}`;
  if(navigator.share){navigator.share({title:'Beat my score on Chaupaal!',text:`Can you beat my score of ${score} on Chaupaal? Play now!`,url});}
  else{navigator.clipboard.writeText(url).then(()=>showToast(t('onboard_challenge_copied')));}
}

// ===================== FRIEND DISCOVERY =====================
const SAMPLE_NEARBY=[
  {name:'Kavya Reddy',avatar:'👩‍💼',meta:'Mumbai · Loves Tech & Cricket',uid:'u1',profileType:'professional'},
  {name:'Rohan Kapoor',avatar:'👨‍💻',meta:'Mumbai · Sports enthusiast',uid:'u2',profileType:'professional'},
  {name:'Sneha Joshi',avatar:'👩',meta:'Mumbai · World news follower',uid:'u3',profileType:'personal'},
];

function renderFriendDiscovery(container){
  const section=document.createElement('div');section.className='friend-discover-section';
  section.innerHTML=`
    <div class="friend-discover-label">Find by username</div>
    <div class="phone-search-row">
      <input class="phone-search-input" type="search" id="friendDiscoverSearch" placeholder="Name or @username" autocomplete="off">
      <button class="phone-search-btn" id="friendDiscoverSearchBtn">Search</button>
    </div>
    <div class="friend-discover-label" style="margin-top:8px;">Phone numbers</div>
    <div style="font-size:12px;color:var(--muted);line-height:1.45;margin-bottom:12px;">Phone lookup stays private on Chaupaal — search by username instead, or ask a friend to share theirs.</div>
    <div class="friend-discover-label">Results</div>
    <div id="friendDiscoverResults"></div>
  `;
  container.appendChild(section);
  const resultsEl=section.querySelector('#friendDiscoverResults');
  async function runDiscoverSearch(){
    const q=section.querySelector('#friendDiscoverSearch')?.value.trim()||'';
    if(!q){ if(typeof showToast==='function') showToast('Enter a name or username'); return; }
    if(!currentUser){
      if(typeof showAuth==='function') showAuth();
      else if(typeof showToast==='function') showToast('Sign in to add friends');
      return;
    }
    resultsEl.innerHTML='<div style="padding:10px;color:var(--muted);font-size:13px;">Searching…</div>';
    try{
      const rows=typeof searchUsersProvider==='function'?await searchUsersProvider(q,{limit:12}):[];
      if(!rows.length){
        resultsEl.innerHTML='<div style="padding:10px;color:var(--muted);font-size:13px;">No people found</div>';
        return;
      }
      resultsEl.innerHTML=rows.map(u=>`
        <div class="discover-user-card" data-uid="${u.uid}" data-name="${(u.name||u.username||'').replace(/"/g,'&quot;')}">
          <div class="discover-avatar">${u.photoURL?`<img src="${u.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`:'👤'}</div>
          <div class="discover-info"><div class="discover-name">${u.name||u.username||'User'}</div><div class="discover-meta">@${u.username||'user'}</div></div>
          <button class="discover-add-btn" data-uid="${u.uid}" data-name="${(u.name||u.username||'').replace(/"/g,'&quot;')}">+ Add</button>
        </div>`).join('');
      resultsEl.querySelectorAll('.discover-add-btn').forEach(btn=>{
        btn.addEventListener('click',async()=>{
          const uid=btn.dataset.uid;
          if(!uid||uid===currentUser?.uid){ if(typeof showToast==='function') showToast("That's you"); return; }
          if(typeof requestFriend!=='function'){ if(typeof showToast==='function') showToast('Friend requests unavailable'); return; }
          btn.disabled=true;
          try{
            const result=await requestFriend(uid);
            btn.textContent=result?.autoAccepted||result?.accepted?'Friends ✓':'Requested';
            btn.style.background='rgba(51,196,129,0.1)';
            btn.style.color='var(--green)';
            if(typeof showToast==='function'){
              showToast(result?.autoAccepted||result?.accepted
                ? `You're now friends with ${btn.dataset.name}`
                : `Friend request sent to ${btn.dataset.name}`);
            }
          }catch(e){
            btn.disabled=false;
            if(typeof showToast==='function') showToast(e?.message||'Could not add friend');
          }
        });
      });
    }catch(e){
      resultsEl.innerHTML='<div style="padding:10px;color:var(--red);font-size:13px;">Search failed</div>';
    }
  }
  section.querySelector('#friendDiscoverSearchBtn')?.addEventListener('click',runDiscoverSearch);
  section.querySelector('#friendDiscoverSearch')?.addEventListener('keydown',(e)=>{
    if(e.key==='Enter'){ e.preventDefault(); runDiscoverSearch(); }
  });
}

// ===================== DUEL SPECTATOR MODE =====================
function broadcastDuelResult(friendName,myScore,theirScore,groupIds=[]){
  const won=myScore>theirScore;const userName=userProfile?.name?.split(' ')[0]||'You';
  const friendFirst=friendName.split(' ')[0];
  const text=won?`${userName} beat ${friendFirst} ${myScore}-${theirScore} in Muqabala`:myScore===theirScore?`${userName} and ${friendFirst} tied ${myScore}-${theirScore}`:`${friendFirst} beat ${userName} ${theirScore}-${myScore}`;
  // Local sample feed (offline / demo)
  if(typeof SAMPLE_STORIES!=='undefined'&&Array.isArray(SAMPLE_STORIES)){
    SAMPLE_STORIES.unshift({id:`ds_${Date.now()}`,name:'Duel result',avatar:'🪑',type:'score',score:myScore,total:theirScore,text,seen:false,auto:true,deletable:true,sharedGameId:'quiz'});
  }
  if(typeof SAMPLE_CHATS!=='undefined'&&SAMPLE_CHATS.find(c=>c.type==='group')){
    const grp=SAMPLE_CHATS.find(c=>c.type==='group');grp.preview=text;grp.time='just now';
  }
  // Real Baithak story when signed in
  if(typeof postGameScoreStory==='function'){
    postGameScoreStory('quiz',{score:myScore,total:10,scoreLine:`${myScore}–${theirScore}`,text,meta:'Muqabala'});
  } else if(typeof showToast==='function'){
    showToast(t('onboard_result_shared'));
  }
}

// ===================== TAAZA KHABAR — BREAKING NEWS FEED =====================
const SAMPLE_BREAKING=[
  {id:'tk1',headline:'🔴 Budget session begins in Parliament',summary:'Finance Minister to present Union Budget today. Markets await key announcements on infrastructure and tax slabs.',source:'DD News',link:'https://ddnews.gov.in',ts:Date.now()-1800000},
  {id:'tk2',headline:'🔴 ISRO successfully launches new satellite',summary:'India\'s space agency achieves another milestone with the successful launch of the communication satellite from Sriharikota.',source:'The Hindu',link:'https://www.thehindu.com',ts:Date.now()-3600000},
];

async function loadTaazaKhabar(){
  if(!db) return SAMPLE_BREAKING;
  try{
    const snap=await db.collection('taaza_khabar')
      .where('ts','>',new Date(Date.now()-86400000))
      .orderBy('ts','desc').limit(5).get();
    if(snap.empty) return SAMPLE_BREAKING;
    return snap.docs.map(d=>d.data());
  }catch(e){ return SAMPLE_BREAKING; }
}

async function checkBreakingNews(){
  const items=await loadTaazaKhabar();
  const lastSeen=localStorage.getItem('chaupaal_taaza_seen')||'0';
  const newItems=items.filter(i=>String(i.ts||0)>lastSeen);
  if(!newItems.length)return;
  // Add to notification center
  newItems.forEach(item=>{
    addNotification({type:'breaking',icon:'🔴',text:`<strong>Taaza Khabar:</strong> ${item.headline}`,section:'akhbaar'});
  });
  try{localStorage.setItem('chaupaal_taaza_cache',JSON.stringify(newItems[0]));}catch(e){}
  localStorage.setItem('chaupaal_taaza_seen',String(Date.now()));
  // Show toast for latest
  showToast(`🔴 Taaza Khabar: ${newItems[0].headline.replace('🔴 ','').slice(0,50)}...`);
}

// Check for breaking news every 10 minutes
setInterval(checkBreakingNews, 600000);

let notifications = (typeof window !== 'undefined' && window.notifications) || [];
let notifPageCursor = null;
let notifHasMore = false;
let notifLiveMode = false;
let notifLoading = false;

function saveNotifications() {
  /* cloud-backed — no localStorage inbox */
}

function addNotification(type, icon, text, extra) {
  if (typeof addLocalNotification === 'function') {
    return addLocalNotification(type, icon, text, extra);
  }
  let section = null;
  let deepLink = null;
  if (type && typeof type === 'object' && !Array.isArray(type)) {
    const o = type;
    type = o.type || 'info';
    icon = o.icon || '🔔';
    text = o.text || '';
    section = o.section || null;
    deepLink = o.deepLink || o.link || null;
  } else if (extra && typeof extra === 'object') {
    section = extra.section || null;
    deepLink = extra.deepLink || extra.link || null;
  }
  const id = 'local_' + Date.now();
  if (!section && typeof inferNotifSection === 'function') section = inferNotifSection(type);
  const n = {
    id,
    type,
    icon,
    text,
    time: 'now',
    ts: Date.now(),
    read: false,
    section: section || null,
    deepLink: deepLink || null,
    localOnly: true,
  };
  notifications.unshift(n);
  window.notifications = notifications;
  updateNotifDot();
  if (typeof updateSectionNotifDots === 'function') updateSectionNotifDots();
  if (typeof SoundLib !== 'undefined' && SoundLib.notification) SoundLib.notification();
  return n;
}

function updateNotifDot() {
  const list = window.notifications || notifications || [];
  const hasUnread = list.some((n) => !n.read);
  document.querySelectorAll('[data-notif-dot="all"]').forEach((dot) => {
    dot.classList.toggle('hidden', !hasUnread);
  });
  if (typeof updateSectionNotifDots === 'function') updateSectionNotifDots();
  else if (typeof updateTabNotifLights === 'function') updateTabNotifLights();
}

async function loadNotificationsPage() {
  if (typeof startNotifInbox === 'function') startNotifInbox();
  return { loaded: (window.notifications || []).length };
}

function renderNotifications() {
  if (typeof openNotificationPanel === 'function' && !document.getElementById('notifList')) return;
  const list = document.getElementById('notifList');
  if (!list) return;
  const items = window.notifications || notifications || [];
  if (!items.length) {
    if (typeof renderEmptyState === 'function') {
      renderEmptyState(list, {
        icon: '🔔',
        title: 'No notifications yet',
        message: 'Duels, replies, and discoveries will show up here.',
      });
    } else {
      list.innerHTML = '<div class="notif-empty">No notifications yet 🔔</div>';
    }
    return;
  }
  list.innerHTML = items
    .map((n) => {
      const when =
        typeof formatRelativeTime === 'function' ? formatRelativeTime(n.ts || n.time) : (n.time || '') + ' ago';
      const text =
        typeof formatNotifBundledText === 'function' ? formatNotifBundledText(n) : n.text || '';
      return (
        '<div class="notif-item ' +
        (n.read ? 'is-read' : 'unread') +
        '" data-id="' +
        n.id +
        '">' +
        '<div class="notif-icon">' +
        (n.icon || '🔔') +
        '</div>' +
        '<div class="notif-body"><div class="notif-text">' +
        text +
        '</div><div class="notif-time">' +
        when +
        '</div></div>' +
        (n.read ? '' : '<span class="notif-unread-pip" aria-hidden="true"></span>') +
        '</div>'
      );
    })
    .join('');
  list.querySelectorAll('.notif-item').forEach((item) => {
    item.addEventListener('click', async () => {
      if (typeof markNotificationRead === 'function') await markNotificationRead(item.dataset.id);
      item.classList.remove('unread');
      item.classList.add('is-read');
      updateNotifDot();
    });
  });
}

document.getElementById('notifBtn')?.addEventListener('click', async () => {
  if (typeof openNotificationPanel === 'function') {
    openNotificationPanel('all');
    return;
  }
  document.getElementById('notifModal')?.classList.remove('hidden');
  renderNotifications();
});
document.getElementById('closeNotif')?.addEventListener('click', () =>
  document.getElementById('notifModal')?.classList.add('hidden')
);
updateNotifDot();

// ===================== TEXT-TO-SPEECH (Listen to Post) =====================
let availableVoices=[];
function loadVoiceList(){
  availableVoices=window.speechSynthesis?window.speechSynthesis.getVoices():[];
}
if(window.speechSynthesis){loadVoiceList();window.speechSynthesis.onvoiceschanged=loadVoiceList;}

/**
 * Curated listen voices — UI shows names only.
 * Diversity is in match patterns (Indic / East Asian / American / European), not labels.
 */
const VOICE_CATALOG = [
  { id: 'asha', label: 'Asha', patterns: [/veena/i, /heera/i, /google हिन्दी/i, /hindi.*female/i], langPref: ['hi'] },
  { id: 'arjun', label: 'Arjun', patterns: [/ravi/i, /hemant/i, /hindi.*male/i], langPref: ['hi'] },
  { id: 'maya', label: 'Maya', patterns: [/samantha/i, /zira/i, /aria/i, /google us english female/i, /female.*en-us/i], langPref: ['en'] },
  { id: 'noah', label: 'Noah', patterns: [/\balex\b/i, /\bdavid\b/i, /\bmark\b/i, /google us english male/i, /guy/i], langPref: ['en'] },
  { id: 'yuki', label: 'Yuki', patterns: [/kyoko/i, /haruka/i, /google 日本語/i, /^ja/i], langPref: ['ja'] },
  { id: 'mei', label: 'Mei', patterns: [/ting-ting|tingting/i, /xiaoxiao/i, /google.*(普通话|中文)|普通话/i, /^zh/i], langPref: ['zh'] },
  { id: 'elena', label: 'Elena', patterns: [/monica/i, /paulina/i, /elvira/i, /google español/i, /^es/i], langPref: ['es', 'pt'] },
  { id: 'luca', label: 'Luca', patterns: [/thomas/i, /hortense/i, /google français/i, /^fr/i, /^de/i, /^it/i], langPref: ['fr', 'de', 'it'] },
];

function resolveCatalogVoice(entry, voices) {
  if (!entry || !voices?.length) return null;
  for (const re of entry.patterns || []) {
    const hit = voices.find((v) => re.test(v.name) || re.test(String(v.lang || '')));
    if (hit) return hit;
  }
  for (const pref of entry.langPref || []) {
    const p = String(pref).toLowerCase().slice(0, 2);
    const hit = voices.find((v) => String(v.lang || '').toLowerCase().startsWith(p));
    if (hit) return hit;
  }
  return null;
}

function getDefaultVoiceId() {
  const lang = (typeof normalizeLang === 'function' ? normalizeLang(currentLang) : currentLang) || 'en';
  const byLang = VOICE_CATALOG.find((e) => (e.langPref || []).some((p) => String(p).slice(0, 2) === lang.slice(0, 2)));
  return (byLang || VOICE_CATALOG.find((e) => e.id === 'maya') || VOICE_CATALOG[0]).id;
}

function getSelectedVoice() {
  loadVoiceList();
  const savedId = (() => {
    try {
      return localStorage.getItem('chaupaal_voice_id') || '';
    } catch (e) {
      return '';
    }
  })();
  const entry = VOICE_CATALOG.find((e) => e.id === savedId) || VOICE_CATALOG.find((e) => e.id === getDefaultVoiceId());
  const resolved = resolveCatalogVoice(entry, availableVoices);
  if (resolved) return resolved;
  // Legacy name save
  try {
    const legacy = localStorage.getItem('chaupaal_voice');
    if (legacy) {
      const v = availableVoices.find((x) => x.name === legacy);
      if (v) return v;
    }
  } catch (e) {}
  const lang = (typeof currentLang !== 'undefined' && currentLang) || 'en';
  const tts = typeof getTtsLang === 'function' ? getTtsLang(lang) : lang;
  const byLang =
    availableVoices.find((v) => String(v.lang || '').toLowerCase().startsWith(String(tts).toLowerCase().slice(0, 2))) ||
    availableVoices.find((v) => String(v.lang || '').toLowerCase().startsWith(String(lang).toLowerCase().slice(0, 2)));
  if (byLang) return byLang;
  return availableVoices.find((v) => /samantha|google.*en|zira/i.test(v.name)) || availableVoices[0];
}

function populateVoiceDropdown() {
  const select = document.getElementById('voiceSelect');
  if (!select) return;
  loadVoiceList();
  const working = VOICE_CATALOG.map((entry) => {
    const voice = resolveCatalogVoice(entry, availableVoices);
    return voice ? { entry, voice } : null;
  }).filter(Boolean);
  // If engine has voices but none matched patterns, map first few engines to catalog labels
  let options = working;
  if (!options.length && availableVoices.length) {
    options = VOICE_CATALOG.slice(0, Math.min(6, availableVoices.length)).map((entry, i) => ({
      entry,
      voice: availableVoices[i],
    }));
  }
  let savedId = '';
  try {
    savedId = localStorage.getItem('chaupaal_voice_id') || '';
  } catch (e) {}
  if (!savedId || !options.some((o) => o.entry.id === savedId)) savedId = getDefaultVoiceId();
  if (!options.some((o) => o.entry.id === savedId) && options[0]) savedId = options[0].entry.id;
  select.innerHTML = options.length
    ? options.map((o) => `<option value="${o.entry.id}" ${o.entry.id === savedId ? 'selected' : ''}>${o.entry.label}</option>`).join('')
    : '<option value="">—</option>';
  try {
    localStorage.setItem('chaupaal_voice_id', select.value || savedId);
  } catch (e) {}
  if (!select.dataset.voiceWired) {
    select.dataset.voiceWired = '1';
    select.addEventListener('change', () => {
      try {
        localStorage.setItem('chaupaal_voice_id', select.value);
      } catch (e) {}
      if (typeof showToast === 'function') showToast(t('onboard_voice_updated'));
    });
  }
}

function previewSelectedVoice() {
  if (!window.speechSynthesis) return;
  if (typeof quietMode !== 'undefined' && quietMode) {
    if (typeof showToast === 'function') showToast(t('quiet_voice_muted', 'Quiet mode is on'));
    return;
  }
  const sample =
    typeof t === 'function' ? t('settings_voice_desc', 'Voice used for Listen to post') : 'Hello from Chaupaal';
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(sample);
  const v = getSelectedVoice();
  if (v) utter.voice = v;
  utter.lang = (v && v.lang) || (typeof getTtsLang === 'function' ? getTtsLang() : 'en-US');
  utter.rate = 0.95;
  utter.pitch = 1;
  window.speechSynthesis.speak(utter);
}

let currentlySpeaking = null;
function speakText(text, btnEl) {
  if (!window.speechSynthesis) return;
  if (typeof quietMode !== 'undefined' && quietMode) {
    if (typeof showToast === 'function')
      showToast(typeof t === 'function' ? t('quiet_voice_muted', 'Quiet mode is on') : 'Quiet mode is on');
    return;
  }
  if (currentlySpeaking === btnEl) {
    window.speechSynthesis.cancel();
    currentlySpeaking = null;
    btnEl?.classList.remove('speaking');
    return;
  }
  window.speechSynthesis.cancel();
  document
    .querySelectorAll('.peepal-speak-btn.speaking,.duniya-caption-speak.speaking')
    .forEach((b) => b.classList.remove('speaking'));
  const utter = new SpeechSynthesisUtterance(text);
  const v = getSelectedVoice();
  if (v) utter.voice = v;
  utter.lang = (v && v.lang) || (typeof getTtsLang === 'function' ? getTtsLang() : 'en-US');
  utter.rate = 0.95;
  utter.pitch = 1;
  utter.onend = () => {
    btnEl?.classList.remove('speaking');
    currentlySpeaking = null;
  };
  window.speechSynthesis.speak(utter);
  btnEl?.classList.add('speaking');
  currentlySpeaking = btnEl;
}

document.getElementById('voicePreviewBtn')?.addEventListener('click', previewSelectedVoice);
setTimeout(populateVoiceDropdown, 400);
if (window.speechSynthesis) {
  window.speechSynthesis.addEventListener?.('voiceschanged', () => populateVoiceDropdown());
}

// ===================== UN COUNTRIES LIST =====================
// UN_COUNTRIES defined earlier in file

// ===================== PEEPAL: MEDIA ATTACHMENTS =====================
let pendingPeepalAttachment=null;

function wirePeepalAttachments(sheet){
  const attachRow=document.createElement('div');
  attachRow.className='peepal-attach-row';
  attachRow.innerHTML=`
    <button class="peepal-attach-btn" id="peepalAttachPhoto">📷 Photo</button>
    <button class="peepal-attach-btn" id="peepalAttachLink">🔗 Link</button>
    <input type="file" id="peepalPhotoInput" accept="image/*" style="display:none">
  `;
  const textarea=sheet.querySelector('#peepalQText');
  textarea?.parentElement.insertBefore(attachRow, textarea.nextSibling);

  const previewArea=document.createElement('div');
  previewArea.id='peepalAttachPreview';
  attachRow.after(previewArea);

  document.getElementById('peepalAttachPhoto').addEventListener('click',()=>document.getElementById('peepalPhotoInput').click());
  document.getElementById('peepalPhotoInput').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    pendingPeepalAttachment={type:'image',file,data:URL.createObjectURL(file)};
    previewArea.innerHTML=`<div class="peepal-attach-preview"><img src="${pendingPeepalAttachment.data}"><button class="peepal-attach-remove" id="removeAttach">✕</button><div style="font-size:11px;color:var(--muted);padding:4px 0;">Will compress & upload on Post</div></div>`;
    document.getElementById('removeAttach').addEventListener('click',()=>{pendingPeepalAttachment=null;previewArea.innerHTML='';});
  });
  document.getElementById('peepalAttachLink').addEventListener('click', async ()=>{
    const url =
      typeof promptNameSheet === 'function'
        ? await promptNameSheet({
            title: 'Share a link',
            placeholder: 'https://…',
            confirmLabel: 'Attach',
            maxlength: 500,
          })
        : null;
    if(!url)return;
    try{
      pendingPeepalAttachment={type:'link',url,title:new URL(url.startsWith('http')?url:'https://'+url).hostname};
    }catch(e){
      pendingPeepalAttachment={type:'link',url,title:url};
    }
    previewArea.innerHTML=`<a class="peepal-link-card" href="${url}" target="_blank"><div class="peepal-link-thumb">🔗</div><div class="peepal-link-info"><div class="peepal-link-title">${pendingPeepalAttachment.title}</div><div class="peepal-link-url">${url}</div></div></a><button class="peepal-attach-remove" style="position:relative;top:-44px;left:auto;margin-left:auto;display:block;" id="removeAttach">✕</button>`;
    document.getElementById('removeAttach').addEventListener('click',()=>{pendingPeepalAttachment=null;previewArea.innerHTML='';});
  });
}

// ===================== DIGITAL PROFILE BUILDER =====================
let digitalProfile = {
  // Personal
  displayName:'', username:'', bio:'', gender:'', pronouns:'', dateOfBirth:'', age:null,
  birthplace:'', hometown:'', currentCity:'', nationality:'', religion:'', ethnicity:'',
  languages:[], height:'', bloodGroup:'', disability:'',
  // Relationship & Family
  relationshipStatus:'', openToDating:false, lookingFor:'', maritalHistory:'',
  haveChildren:'', wantChildren:'', familyType:'', livingSituation:'', siblings:'',
  // Career & Education
  occupation:'', company:'', industry:'', workMode:'', careerLevel:'', annualIncome:'',
  highestEducation:'', college:'', degree:'', graduationYear:'', skills:[], certifications:[],
  // Lifestyle
  diet:'', drinking:'', smoking:'', fitness:'', sleepSchedule:'', personalityType:'',
  zodiac:'', mbti:'', politics:'', religion2:'', spirituality:'',
  // Interests & Hobbies
  hobbies:[], sports:[], music:[], movies:[], books:[], travel:[], food:[], art:[],
  interests:[],
  prompts:[],
  // Schema hook for future A/V transcription into embeddings (3C later) — unused for matching now
  mediaCaptions:[],
  // Social & Online
  instagram:'', twitter:'', linkedin:'', youtube:'', website:'',
  // Dreams & Values
  lifeGoals:'', coreValues:[], dreamDestination:'', bucketList:'',
  // Privacy
  profileVisibility:'public', showAge:true, showLocation:true, showRelationship:true,
  showIncome:false, showReligion:true,
  // Foundation only — see profile-type.js (personal | professional); no feature branching yet
  profileType:'personal',
  ...JSON.parse(localStorage.getItem('chaupaal_digital_profile')||'{}')
};
digitalProfile.photos = digitalProfile.photos || [];

const DP_FIELDS = [
  {key:'bio',label:'About me',type:'textarea',placeholder:'Tell people who you are in a few lines...'},
  {key:'occupation',label:'Occupation',type:'text',placeholder:'e.g. Software Engineer, Student, Teacher'},
  {key:'education',label:'Education',type:'text',placeholder:'e.g. B.Tech from IIT Delhi'},
  {key:'birthPlace',label:'Birth place',type:'text',placeholder:'e.g. Jaipur, Rajasthan'},
  {key:'currentCity',label:'Current city',type:'text',placeholder:'e.g. Mumbai, Maharashtra'},
  {key:'relationshipStatus',label:'Relationship status',type:'chips',options:['Single','In a relationship','Engaged','Married','It\'s complicated','Prefer not to say']},
  {key:'languages',label:'Languages known',type:'chips-multi',options:['Hindi','English','Bengali','Telugu','Tamil','Marathi','Gujarati','Kannada','Malayalam','Punjabi','Urdu','Other']},
  {key:'dreams',label:'Dreams & aspirations',type:'textarea',placeholder:'What do you hope to achieve someday?'},
  {key:'hobbies',label:'Hobbies & interests',type:'textarea',placeholder:'What do you love doing in your free time?'},
];

function calcProfileCompletionLegacy(){
  let filled=0;const total=DP_FIELDS.length+2;
  DP_FIELDS.forEach(f=>{
    const val=digitalProfile[f.key];
    if(f.type==='chips-multi'?(val&&val.length>0):val) filled++;
  });
  if(digitalProfile.photos?.length>0)filled++;
  if(digitalProfile.family?.length>0)filled++;
  return Math.round((filled/total)*100);
}
// Phase 3: real calc lives in profile-completion.js — don't overwrite it.
if(typeof window.calcProfileCompletion!=='function'){
  window.calcProfileCompletion=function(dp){
    return {pct:calcProfileCompletionLegacy(),missing:[],filledCount:0,totalFields:0};
  };
}

function renderDPField(f){
  const val=digitalProfile[f.key];
  if(f.type==='text'){
    return `<div class="dp-field-row"><div class="dp-field-label">${f.label}</div><input class="dp-field-input" id="dp_${f.key}" placeholder="${f.placeholder}" value="${val||''}"></div>`;
  }
  if(f.type==='textarea'){
    return `<div class="dp-field-row"><div class="dp-field-label">${f.label}</div><textarea class="dp-field-input dp-field-textarea" id="dp_${f.key}" placeholder="${f.placeholder}">${val||''}</textarea></div>`;
  }
  if(f.type==='chips'){
    return `<div class="dp-field-row"><div class="dp-field-label">${f.label}</div><div class="dp-chip-row" data-field="${f.key}">${f.options.map(o=>`<button class="dp-chip ${val===o?'selected':''}" data-val="${o}">${o}</button>`).join('')}</div></div>`;
  }
  if(f.type==='chips-multi'){
    const vals=val||[];
    return `<div class="dp-field-row"><div class="dp-field-label">${f.label}</div><div class="dp-chip-row" data-field-multi="${f.key}">${f.options.map(o=>`<button class="dp-chip ${vals.includes(o)?'selected':''}" data-val="${o}">${o}</button>`).join('')}</div></div>`;
  }
  return '';
}


function renderPhotoGrid(){
  const grid=document.getElementById('dpPhotoGrid');
  if(!grid)return;
  grid.innerHTML='';
  digitalProfile.photos.forEach((photo,i)=>{
    const cell=document.createElement('div');cell.className='dp-photo-cell';
    cell.innerHTML=`<img src="${photo}"><button class="dp-photo-remove" data-i="${i}">✕</button>`;
    cell.querySelector('.dp-photo-remove').addEventListener('click',e=>{
      e.stopPropagation();digitalProfile.photos.splice(i,1);renderPhotoGrid();
    });
    grid.appendChild(cell);
  });
  const addCell=document.createElement('div');addCell.className='dp-photo-cell dp-photo-add';addCell.textContent='+';
  addCell.addEventListener('click',()=>{
    const input=document.createElement('input');input.type='file';input.accept='image/*';
    input.onchange=e=>{
      const file=e.target.files[0];if(!file)return;
      const reader=new FileReader();
      reader.onload=ev=>{digitalProfile.photos.push(ev.target.result);renderPhotoGrid();};
      reader.readAsDataURL(file);
    };
    input.click();
  });
  grid.appendChild(addCell);
}

function renderFamilyList(){
  const list=document.getElementById('dpFamilyList');
  if(!list)return;
  const family=digitalProfile.family||[];
  if(!family.length){list.innerHTML='<div class="dp-empty-prompt">No family details added yet</div>';return;}
  list.innerHTML='';
  family.forEach((m,i)=>{
    const row=document.createElement('div');row.className='dp-family-item';
    row.innerHTML=`<input class="dp-field-input" placeholder="Relation (e.g. Mother)" value="${m.relation}" data-i="${i}" data-k="relation"><input class="dp-field-input" placeholder="Name" value="${m.name}" data-i="${i}" data-k="name"><button class="dp-photo-remove" style="position:static;width:28px;height:28px;background:var(--cream);color:var(--muted);" data-remove="${i}">✕</button>`;
    row.querySelectorAll('input').forEach(inp=>{
      inp.addEventListener('input',()=>{family[inp.dataset.i][inp.dataset.k]=inp.value;});
    });
    row.querySelector('[data-remove]').addEventListener('click',()=>{family.splice(i,1);renderFamilyList();});
    list.appendChild(row);
  });
}


// ===================== AI KEYBOARD (global assistant) =====================
let aiKbHistory=[];

async function openAiKeyboard(targetInput,context=''){
  if(typeof isAiFeaturesEnabledSync==='function' && !isAiFeaturesEnabledSync()){
    if(typeof showToast==='function') showToast(typeof AI_DISABLED_MSG==='string'?AI_DISABLED_MSG:'AI is temporarily paused.');
    return;
  }
  if(await aiKbLimitReached()){
    showToast(typeof t==='function'?t('ai_kb_limit',{n:AI_KB_LIMIT}):`Free AI limit reached (${AI_KB_LIMIT}/day). Add Chaupaal Money or join Pradhan / Sarpanch.`);
    return;
  }
  document.getElementById('aiKeyboardEl')?.remove();
  const kb=document.createElement('div');
  kb.className='ai-keyboard';kb.id='aiKeyboardEl';
  kb.innerHTML=`
    <div class="ai-keyboard-header">
      <div class="ai-keyboard-title">✨ Chaupaal AI</div>
      <button class="ai-keyboard-close" id="aiKbClose">✕</button>
    </div>
    <div class="ai-keyboard-messages" id="aiKbMessages">
      <div class="ai-kb-msg ai"><div class="ai-kb-label">Chaupaal AI</div>Ask me anything — search, explain, summarise news, draft replies, or just chat.</div>
    </div>
    <div class="ai-keyboard-input-row">
      <input class="ai-keyboard-input" id="aiKbInput" placeholder="Ask anything...">
      <button class="ai-keyboard-send" id="aiKbSend">→</button>
    </div>
  `;
  document.querySelector('.device').appendChild(kb);
  requestAnimationFrame(()=>kb.classList.add('open'));
  document.getElementById('aiKbClose').addEventListener('click',()=>{kb.classList.remove('open');setTimeout(()=>kb.remove(),300);});

  const sendQuery=async()=>{
    const inp=document.getElementById('aiKbInput');
    const query=inp?.value.trim();if(!query)return;
    if(typeof isAiFeaturesEnabled==='function' && !(await isAiFeaturesEnabled())){
      if(typeof showToast==='function') showToast(typeof AI_DISABLED_MSG==='string'?AI_DISABLED_MSG:'AI is temporarily paused.');
      return;
    }
    inp.value='';
    const msgs=document.getElementById('aiKbMessages');
    const userMsg=document.createElement('div');userMsg.className='ai-kb-msg user';userMsg.textContent=query;msgs.appendChild(userMsg);
    const typing=document.createElement('div');typing.className='ai-kb-typing';typing.innerHTML='<div class="ai-kb-dot"></div><div class="ai-kb-dot"></div><div class="ai-kb-dot"></div>';
    msgs.appendChild(typing);msgs.scrollTop=msgs.scrollHeight;
    try{
      aiKbHistory.push({role:'user',content:query});
      if(aiKbHistory.length>10)aiKbHistory=aiKbHistory.slice(-10);
      try{ await consumeAiKbSlot(); }catch(qe){
        typing.remove();
        const err=document.createElement('div');err.className='ai-kb-msg ai';
        err.textContent=qe?.code==='DAILY_LIMIT'||qe?.code==='WEEKLY_LIMIT'
          ?(typeof t==='function'?t('ai_kb_limit',{n:AI_KB_LIMIT}):`Free AI limit reached (${AI_KB_LIMIT}/day).`)
          :'Couldn’t verify AI limit — try again shortly';
        msgs.appendChild(err);
        return;
      }
      const data = await callAI({
        tier:'balanced',
        max_tokens:600,
        feature:'assistant_keyboard',
        system:`You are Chaupaal AI, an intelligent assistant in Chaupaal — India's social news and discovery app. Help users search for information, summarise news, write replies, explain topics, or answer anything. ${context?`Context: ${context}.`:''}Be concise, friendly, conversational. Never mention Claude or Anthropic — you are Chaupaal AI. Use light markdown (headings, bold, lists) when it helps readability.`,
        messages:aiKbHistory
      });
      const text=data.text||data.content?.map(b=>b.text||'').join('')||'Sorry, I couldn\'t get a response right now.';
      aiKbHistory.push({role:'assistant',content:text});
      typing.remove();
      const aiMsg=document.createElement('div');aiMsg.className='ai-kb-msg ai';
      const bodyHtml=typeof renderMarkdown==='function'?renderMarkdown(text):text.replace(/\n/g,'<br>');
      aiMsg.innerHTML=`<div class="ai-kb-label">Chaupaal AI</div><div class="ai-md">${bodyHtml}</div>`;
      if(targetInput){
        const insertBtn=document.createElement('button');insertBtn.className='ai-kb-insert-btn';insertBtn.textContent='↑ Insert into message';
        insertBtn.addEventListener('click',()=>{targetInput.value=text;targetInput.focus();kb.classList.remove('open');setTimeout(()=>kb.remove(),300);});
        aiMsg.appendChild(insertBtn);
      }
      msgs.appendChild(aiMsg);
    }catch(e){
      typing.remove();
      const err=document.createElement('div');err.className='ai-kb-msg ai';
      err.textContent=(e&&e.code==='AI_DISABLED')?(typeof AI_DISABLED_MSG==='string'?AI_DISABLED_MSG:e.message):'Connection error. Please try again.';
      msgs.appendChild(err);
    }
    msgs.scrollTop=msgs.scrollHeight;
  };
  document.getElementById('aiKbSend').addEventListener('click',sendQuery);
  document.getElementById('aiKbInput').addEventListener('keypress',e=>{if(e.key==='Enter')sendQuery();});
  setTimeout(()=>document.getElementById('aiKbInput')?.focus(),350);
}

function wireAiKbToInput(inputEl,contextLabel){
  if(!inputEl)return;
  const trigger=document.createElement('button');
  trigger.className='ai-kb-trigger';trigger.style.cssText='margin-bottom:6px;display:inline-flex;';
  trigger.innerHTML='✨ Ask Chaupaal';
  trigger.addEventListener('click',()=>openAiKeyboard(inputEl,contextLabel));
  inputEl.parentElement?.insertBefore(trigger,inputEl);
}

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    // Heal keyboard / Mehfil shell poison on every tab (Dangal used to be the only remount that felt OK)
    if(typeof restoreAppShell==='function') restoreAppShell('tab:'+(btn.dataset.tab||''));
    else if(typeof clearKeyboardInset==='function') clearKeyboardInset();
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    const panel=document.getElementById('panel-'+btn.dataset.tab);
    if(panel)panel.classList.add('active');
    document.getElementById('progressBar').style.display=btn.dataset.tab==='akhbaar'?'flex':'none';
    if(btn.dataset.tab==='baithak')initBaithak();
    else if(typeof stopBaithakFriendRequestPoll==='function') stopBaithakFriendRequestPoll();
    if(btn.dataset.tab==='dangal')initCategoryRatings();
    if(btn.dataset.tab==='duniya')initDuniya();
    if(btn.dataset.tab==='akhbaar'){
      initAkhbaarCatBar();
      if(typeof window.ensureAkhbaarBuilt==='function') window.ensureAkhbaarBuilt();
    }
    if(btn.dataset.tab==='peepal')initPeepal();
    try{
      if(typeof TabHabits!=='undefined'&&TabHabits.onTabActivated){
        TabHabits.onTabActivated(btn.dataset.tab||'');
      }
    }catch(e){}
  });
});
async function requestNotificationPermission(){
  if(!('Notification' in window))return;
  if(Notification.permission==='default'){
    const p=await Notification.requestPermission();
    if(p==='granted')showToast(t('notifications_on'));
  }
  if(Notification.permission==='granted' && typeof registerChaupaalFcm==='function'){
    try{ await registerChaupaalFcm(); }catch(e){}
  }
}
function scheduleLocalNudge(){
  // No on-open / focused-app OS push spam — unread stays on tab lights + inbox
  return;
}
