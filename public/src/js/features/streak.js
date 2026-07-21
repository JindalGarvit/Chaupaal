// ===================== STREAK PERSISTENCE (Firestore) =====================
// ===================== DUOLINGO-STYLE STREAK SYSTEM =====================
const STREAK_FREEZE_MAX = 2; // max freezes owned at once
const STREAK_MILESTONES = [3,7,14,30,60,100,365];

async function loadStreak(){
  if(!db||!currentUser) return;
  try{
    const snap=await db.collection('users').doc(currentUser.uid).get();
    const d=snap.data()||{};
    const streak=d.streak||0;
    const lastPlayed=d.lastPlayed||'';
    const freezes=d.streakFreezes||0;
    const today=new Date().toISOString().split('T')[0];
    const yesterday=new Date(Date.now()-86400000).toISOString().split('T')[0];
    const twoDaysAgo=new Date(Date.now()-172800000).toISOString().split('T')[0];

    let activeStreak=streak;
    if(lastPlayed===today){ /* already played, streak intact */ }
    else if(lastPlayed===yesterday){ /* hasn't played today yet — streak at risk */ scheduleStreakNudge(streak); }
    else if(lastPlayed===twoDaysAgo && freezes>0){
      // Use a freeze automatically
      activeStreak=streak;
      await db.collection('users').doc(currentUser.uid).update({
        streakFreezes: firebase.firestore.FieldValue.increment(-1),
        lastPlayed: yesterday // backfill yesterday
      });
      showToast('❄️ Streak Freeze used! Your streak is safe.');
    } else if(lastPlayed!==today && lastPlayed!==yesterday){
      activeStreak=0;
      await db.collection('users').doc(currentUser.uid).update({streak:0});
    }

    setStreakUI(activeStreak, freezes);
    if(lastPlayed===yesterday && activeStreak>0) showStreakAtRiskBanner(activeStreak);
  }catch(e){}
}

function setStreakUI(streak, freezes=0){
  document.getElementById('streakNum').textContent=streak;
  document.getElementById('sidebarStreak')?.textContent && (document.getElementById('sidebarStreak').textContent=streak);
  updateSidebarStreak(streak);
  // Update freeze display if element exists
  const freezeEl=document.getElementById('streakFreezeCount');
  if(freezeEl) freezeEl.textContent=freezes;
}

function showStreakAtRiskBanner(streak){
  if(document.getElementById('streakRiskBanner')) return;
  const banner=document.createElement('div');
  banner.id='streakRiskBanner';
  banner.style.cssText='position:absolute;top:64px;left:12px;right:12px;z-index:150;background:linear-gradient(135deg,#FF6B35,#E63946);color:#fff;border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(230,57,70,0.4);cursor:pointer;';
  banner.innerHTML=`
    <div style="font-size:32px;">🔥</div>
    <div style="flex:1;">
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;">Your ${streak}-day streak ends tonight!</div>
      <div style="font-size:12px;opacity:0.85;margin-top:2px;">Play today's Akhbaar to keep it alive</div>
    </div>
    <button style="background:rgba(255,255,255,0.25);border:none;color:#fff;border-radius:10px;padding:7px 12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;" id="playNowBanner">Play now →</button>
  `;
  document.querySelector('.device').appendChild(banner);
  document.getElementById('playNowBanner').addEventListener('click',()=>{
    banner.remove();
    document.querySelectorAll('.tab-btn').forEach(b=>{if(b.dataset.tab==='akhbaar')b.click();});
  });
  banner.addEventListener('click',e=>{if(!e.target.closest('button'))banner.remove();});
  // Auto-dismiss after 8s
  setTimeout(()=>banner?.remove(),8000);
}

function scheduleStreakNudge(streak){
  // Push notification at 8 PM if not played
  if(!('Notification' in window)||Notification.permission!=='granted') return;
  const now=new Date();const targetHour=20;
  const msUntil=((targetHour-now.getHours())*60-now.getMinutes())*60000;
  if(msUntil>0 && msUntil<86400000){
    setTimeout(()=>{
      new Notification('Chaupaal 🪑',{
        body:`🔥 Your ${streak}-day streak ends at midnight! Play Akhbaar now.`,
        icon:'icon.png'
      });
    },msUntil);
  }
}

async function saveStreak(){
  if(!db||!currentUser) return;
  const today=new Date().toISOString().split('T')[0];
  const yesterday=new Date(Date.now()-86400000).toISOString().split('T')[0];
  try{
    const snap=await db.collection('users').doc(currentUser.uid).get();
    const d=snap.data()||{};
    if(d.lastPlayed===today) return; // already played today
    const streak=(d.lastPlayed===yesterday||d.lastPlayed===today)?((d.streak||0)+1):1;
    await db.collection('users').doc(currentUser.uid).update({streak,lastPlayed:today});
    setStreakUI(streak, d.streakFreezes||0);
    document.getElementById('streakBig').textContent=streak;
    // Remove risk banner
    document.getElementById('streakRiskBanner')?.remove();
    // Milestone celebration
    if(STREAK_MILESTONES.includes(streak)){
      showStreakMilestone(streak);
      // Award a freeze at milestones
      if([7,30,100].includes(streak) && (d.streakFreezes||0)<STREAK_FREEZE_MAX){
        await db.collection('users').doc(currentUser.uid).update({streakFreezes: firebase.firestore.FieldValue.increment(1)});
        showToast(`❄️ Streak Freeze earned! You now have ${(d.streakFreezes||0)+1}.`);
      }
    }
  }catch(e){}
}

function showStreakMilestone(streak){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,0.6);z-index:180;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML=`
    <div style="background:linear-gradient(160deg,var(--red),#8134AF);border-radius:24px;padding:36px 28px;text-align:center;max-width:320px;margin:24px;color:#fff;">
      <div style="font-size:64px;margin-bottom:12px;">🔥</div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:28px;">${streak} Day Streak!</div>
      <div style="font-size:14px;opacity:0.85;margin-top:8px;line-height:1.5;">Incredible consistency. You're in the top players on Chaupaal!</div>
      <div style="margin-top:20px;display:flex;gap:10px;">
        <button id="shareMilestone" style="flex:1;padding:12px;background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;cursor:pointer;">📤 Share</button>
        <button id="closeMilestone" style="flex:1;padding:12px;background:#fff;color:var(--red);border:none;border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;cursor:pointer;">Continue →</button>
      </div>
    </div>
  `;
  document.querySelector('.device').appendChild(overlay);
  document.getElementById('closeMilestone').addEventListener('click',()=>overlay.remove());
  document.getElementById('shareMilestone').addEventListener('click',()=>{
    const streakStats=typeof buildShareStats==='function'
      ? buildShareStats({
          scoreLine:`${streak}-day streak`,
          score:streak,
          meta:'Consistency on Chaupaal',
          text:`I'm on a ${streak}-day streak on Chaupaal! Can you beat me?`,
        })
      : {scoreLine:`${streak}-day streak`,score:streak,text:`I'm on a ${streak}-day streak on Chaupaal! Can you beat me?`};
    if(typeof openUnifiedShareSheet==='function'){
      openUnifiedShareSheet({gameId:'akhbaar',title:'Share your streak',stats:streakStats});
    } else {
      const text=`🔥 I'm on a ${streak}-day streak on Chaupaal! Can you beat me? chaupaal-chaupaal.web.app`;
      if(navigator.share)navigator.share({text});else{navigator.clipboard.writeText(text);showToast('Copied!');}
    }
  });
}

async function buyStreakFreeze(){
  if(!db||!currentUser){showToast('Sign in to get Streak Freezes');return;}
  try{
    const snap=await db.collection('users').doc(currentUser.uid).get();
    const freezes=snap.data()?.streakFreezes||0;
    if(freezes>=STREAK_FREEZE_MAX){showToast(`You already have ${freezes} Streak Freezes ❄️`);return;}
    // Free freeze — in future this will be premium purchase
    await db.collection('users').doc(currentUser.uid).update({streakFreezes:firebase.firestore.FieldValue.increment(1)});
    showToast('❄️ Streak Freeze added! It auto-activates if you miss a day.');
  }catch(e){}
}

// ===================== REAL-TIME CHAT (Firestore) =====================
let activeChatListener=null;

async function loadRealtimeMessages(chatId, msgsArea, isGroup){
  if(!db||!currentUser) return;
  if(activeChatListener){ activeChatListener(); activeChatListener=null; }
  let oldestDoc=null;
  try{
    // Initial window: newest 50 via limitToLast. Older history uses startAfter-style paging in reverse (fetchOlderMessages).
    activeChatListener=db.collection('chats').doc(chatId).collection('messages')
      .orderBy('ts','asc').limitToLast(50)
      .onSnapshot(snap=>{
        if(!oldestDoc && snap.docs.length) oldestDoc=snap.docs[0];
        snap.docChanges().forEach(change=>{
          if(change.type==='added'){
            const m=change.doc.data();
            if(m.uid===currentUser.uid) return; // own messages already shown optimistically
            const div=document.createElement('div');
            div.innerHTML=renderMsgBubble({from:'them',text:m.text,time:new Date(m.ts?.toDate()).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),avatar:m.avatar||'👤',name:m.name,music:m.music||null,uid:m.uid},isGroup);
            const node=div.firstElementChild;
            msgsArea.appendChild(node);
            if(typeof mountMusicCards==='function') mountMusicCards(node);
            msgsArea.scrollTop=msgsArea.scrollHeight;
          }
        });
      });

    // Load-older control at top of thread
    if(typeof ensureLoadMoreButton==='function' && typeof fetchOlderMessages==='function'){
      let wrap=msgsArea.parentElement?.querySelector('[data-ui="chat-history-bar"]');
      if(!wrap){
        wrap=document.createElement('div');
        wrap.dataset.ui='chat-history-bar';
        wrap.style.cssText='padding:8px 12px;text-align:center;';
        msgsArea.parentElement?.insertBefore(wrap, msgsArea);
      }
      ensureLoadMoreButton(wrap,{
        label:'Load earlier messages',
        onLoadMore:async()=>{
          // Guard: if the initial snapshot hasn't landed yet, a null cursor would
          // refetch the newest page and duplicate bubbles already on screen.
          if(!oldestDoc) return;
          const page=await fetchOlderMessages(chatId,{beforeDoc:oldestDoc,pageSize:30});
          if(!page.items.length){ if(typeof setLoadMoreVisible==='function') setLoadMoreVisible(wrap,false); return; }
          oldestDoc=page.firstDoc;
          const frag=document.createDocumentFragment();
          page.items.forEach(m=>{
            const div=document.createElement('div');
            const mine=m.uid===currentUser.uid;
            div.innerHTML=renderMsgBubble({
              from:mine?'me':'them',
              text:m.text,
              time:m.ts?.toDate?new Date(m.ts.toDate()).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'',
              avatar:m.avatar||'👤',
              name:m.name,
              music:m.music||null,
              uid:m.uid,
            },isGroup);
            if(div.firstElementChild){
              if(typeof mountMusicCards==='function') mountMusicCards(div.firstElementChild);
              frag.appendChild(div.firstElementChild);
            }
          });
          const prevHeight=msgsArea.scrollHeight;
          msgsArea.insertBefore(frag, msgsArea.firstChild);
          msgsArea.scrollTop=msgsArea.scrollHeight-prevHeight;
          if(!page.hasMore && typeof setLoadMoreVisible==='function') setLoadMoreVisible(wrap,false);
        },
      });
    }
  }catch(e){}
}

async function sendRealtimeMessage(chatId, text, isGroup, music){
  if(!db||!currentUser||!text.trim()) return;
  try{
    const payload={
      text, uid:currentUser.uid,
      name:userProfile?.name||currentUser.displayName||'You',
      avatar:currentUser.photoURL||'',
      ts:firebase.firestore.FieldValue.serverTimestamp()
    };
    if(music && typeof music==='object' && music.title){
      payload.music={
        title:String(music.title||'').slice(0,160),
        artist:String(music.artist||'Unknown artist').slice(0,160),
        thumbnail:String(music.thumbnail||'').slice(0,2048),
        previewUrl:music.previewUrl?String(music.previewUrl).slice(0,2048):null,
        source:['jiosaavn','itunes','none'].includes(music.source)?music.source:(music.previewUrl?'jiosaavn':'none'),
      };
    }
    await db.collection('chats').doc(chatId).collection('messages').add(payload);
  }catch(e){}
}

// ===================== REAL MATCHMAKING (Firestore waiting room) =====================
let matchmakingListener=null;

async function findRealOpponent(filters, onFound, onCancel){
  if(!db||!currentUser){ onFound({name:'Priya_29',simulated:true}); return; }
  const category=filters.category||'GK';
  const waitingRef=db.collection('matchmaking').doc(category).collection('waiting');
  try{
    // Check if someone is already waiting
    const snap=await waitingRef.where('uid','!=',currentUser.uid).limit(1).get();
    if(!snap.empty){
      const opponent=snap.docs[0].data();
      await snap.docs[0].ref.delete(); // remove them from waiting room
      onFound({name:opponent.name,uid:opponent.uid,simulated:false});
      return;
    }
    // Add self to waiting room
    const myRef=await waitingRef.add({
      uid:currentUser.uid,
      name:userProfile?.name||'You',
      category, filters,
      ts:firebase.firestore.FieldValue.serverTimestamp()
    });
    // Listen for a match
    matchmakingListener=myRef.onSnapshot(async snap=>{
      if(!snap.exists){ // we were matched (deleted by opponent)
        if(matchmakingListener){matchmakingListener();matchmakingListener=null;}
        onFound({name:'Your opponent',simulated:false});
      }
    });
    // Timeout after 20s — fall back to simulated
    setTimeout(async()=>{
      if(matchmakingListener){
        matchmakingListener();matchmakingListener=null;
        try{await myRef.delete();}catch(e){}
        onFound({name:'Priya_29',simulated:true});
      }
    },20000);
  }catch(e){ onFound({name:'Priya_29',simulated:true}); }
}

// ===================== PEEPAL QUOTA ENFORCEMENT (Firestore) =====================
async function checkPeepalQuota(){
  if(!db||!currentUser) return {weekly:weeklyQuestionCount,ok:weeklyQuestionCount<5};
  try{
    const now=new Date();
    const weekStart=new Date(now); weekStart.setDate(now.getDate()-now.getDay());
    weekStart.setHours(0,0,0,0);
    const snap=await db.collection('peepal')
      .where('uid','==',currentUser.uid)
      .where('createdAt','>=',firebase.firestore.Timestamp.fromDate(weekStart))
      .limit(6) // only need to know if over weekly cap (5)
      .get();
    weeklyQuestionCount=snap.size;
    return {weekly:snap.size, ok:snap.size<5};
  }catch(e){ return {weekly:weeklyQuestionCount, ok:weeklyQuestionCount<5}; }
}

// ===================== WRAPS WITH REAL DATA =====================
function buildWrapData(){
  // Pull from localStorage play history
  const history=JSON.parse(localStorage.getItem('chaupaal_play_history')||'[]');
  const now=new Date();
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const thisMonth=history.filter(h=>new Date(h.date)>=monthStart);
  const totalQ=thisMonth.reduce((s,h)=>s+(h.total||0),0);
  const totalCorrect=thisMonth.reduce((s,h)=>s+(h.correct||0),0);
  const streak=parseInt(document.getElementById('streakNum')?.textContent||'0');
  const catCounts={};
  thisMonth.forEach(h=>{ if(h.topCat) catCounts[h.topCat]=(catCounts[h.topCat]||0)+1; });
  const topCat=Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'GK';
  const accuracy=totalQ>0?Math.round((totalCorrect/totalQ)*100):0;
  return {totalQ,totalCorrect,accuracy,streak,topCat,month:now.toLocaleString('en-IN',{month:'long'})};
}

function recordPlaySession(correct,total,topCat){
  try{
    const history=JSON.parse(localStorage.getItem('chaupaal_play_history')||'[]');
    history.push({date:new Date().toISOString(),correct,total,topCat});
    // Keep last 90 days only
    const cutoff=new Date(Date.now()-90*86400000).toISOString();
    const trimmed=history.filter(h=>h.date>cutoff);
    localStorage.setItem('chaupaal_play_history',JSON.stringify(trimmed));
  }catch(e){}
}

function showMonthlyWrap(){
  const d=buildWrapData();
  const wrap=document.createElement('div');wrap.className='wrap-overlay';
  const pages=[
    {bg:'linear-gradient(160deg,#E63946,#C72E3A)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">${d.month} Wrap</div><div class="wrap-headline" style="color:#fff;">Your month on Chaupaal</div><div style="color:rgba(255,255,255,0.7);font-size:14px;margin-top:8px;">Tap to explore ↓</div>`},
    {bg:'linear-gradient(160deg,var(--navy),#2A3158)',content:`<div class="wrap-label" style="color:var(--gold);">Questions answered</div><div class="wrap-big-num" style="color:#fff;">${d.totalQ||'—'}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.7);">this month</div>`},
    {bg:'linear-gradient(160deg,#2A9D8F,#1A6B64)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">Accuracy</div><div class="wrap-big-num" style="color:#fff;">${d.accuracy}%</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">${d.totalCorrect} correct out of ${d.totalQ}</div>`},
    {bg:'linear-gradient(160deg,#5FBA7D,#2E8B57)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">Top Category</div><div class="wrap-headline" style="color:#fff;font-size:36px;">${CATEGORY_ICONS[d.topCat]||'🎯'} ${d.topCat}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">Your strongest subject this month</div>`},
    {bg:'linear-gradient(160deg,#FF9A3C,#FF6B35)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">Longest Streak</div><div class="wrap-big-num" style="color:#fff;">🔥 ${d.streak}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">days in a row</div>`},
    {bg:'linear-gradient(160deg,#8134AF,#515BD4)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">That's a wrap!</div><div class="wrap-headline" style="color:#fff;">Keep going 🚀</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">See you next month for more Chaupaal!</div><button class="wrap-share-btn" id="wrapShareBtn">📤 Share your Wrap</button>`},
  ];
  let pageIdx=0;
  function renderPage(){
    const p=pages[pageIdx];
    wrap.innerHTML=`<div class="wrap-page" style="background:${p.bg};">${p.content}<button class="wrap-close" onclick="this.closest('.wrap-overlay').remove()">✕</button></div>`;
    wrap.querySelector('#wrapShareBtn')?.addEventListener('click',()=>{
      const wrapStats=typeof buildShareStats==='function'
        ? buildShareStats({
            scoreLine:`${d.accuracy}%`,
            meta:`${d.totalQ} questions · ${d.streak}-day streak`,
            text:`My ${d.month} Chaupaal Wrap: ${d.totalQ} questions, ${d.accuracy}% accuracy, ${d.streak}-day streak!`,
          })
        : {scoreLine:`${d.accuracy}%`,meta:d.month,text:`My ${d.month} Chaupaal Wrap`};
      if(typeof openUnifiedShareSheet==='function'){
        openUnifiedShareSheet({gameId:'wrap',title:`Share ${d.month} Wrap`,stats:wrapStats});
      } else {
        const text=`My ${d.month} Chaupaal Wrap: ${d.totalQ} questions, ${d.accuracy}% accuracy, ${d.streak}-day streak! 🔥 chaupaal-chaupaal.web.app`;
        if(navigator.share) navigator.share({text}); else{navigator.clipboard.writeText(text);showToast('Copied!');}
      }
    });
    wrap.querySelector('.wrap-page').addEventListener('click',e=>{
      if(e.target.closest('button'))return;
      pageIdx++;if(pageIdx>=pages.length)wrap.remove();else renderPage();
    });
  }
  document.querySelector('.device').appendChild(wrap);renderPage();
}
