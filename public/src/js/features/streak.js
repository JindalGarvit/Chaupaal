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

async function saveStreak(opts){
  const o=opts||{};
  if(!db||!currentUser) return {ok:false,reason:'guest'};
  // A3: live Aaj ka set only — Sample/Offline never bumps account streak
  if(o.requireLive!==false && typeof window!=='undefined' && window.akhbaarLiveSet!==true){
    return {ok:false,reason:'sample'};
  }
  const today=new Date().toISOString().split('T')[0];
  const yesterday=new Date(Date.now()-86400000).toISOString().split('T')[0];
  try{
    const snap=await db.collection('users').doc(currentUser.uid).get();
    const d=snap.data()||{};
    const freezes=d.streakFreezes||0;
    if(d.lastPlayed===today){
      const streak=d.streak||0;
      setStreakUI(streak, freezes);
      const big=document.getElementById('streakBig');
      if(big) big.textContent=String(streak);
      return {ok:true,alreadyCounted:true,streak};
    }
    const streak=(d.lastPlayed===yesterday)?((d.streak||0)+1):1;
    await db.collection('users').doc(currentUser.uid).update({streak,lastPlayed:today});
    setStreakUI(streak, freezes);
    const big=document.getElementById('streakBig');
    if(big) big.textContent=String(streak);
    document.getElementById('streakRiskBanner')?.remove();
    if(STREAK_MILESTONES.includes(streak)){
      showStreakMilestone(streak);
      if([7,30,100].includes(streak) && freezes<STREAK_FREEZE_MAX){
        await db.collection('users').doc(currentUser.uid).update({streakFreezes: firebase.firestore.FieldValue.increment(1)});
        showToast(`❄️ Streak Freeze earned! You now have ${freezes+1}.`);
      }
    }
    return {ok:true,alreadyCounted:false,streak};
  }catch(e){
    return {ok:false,reason:'error',error:e};
  }
}

function showStreakMilestone(streak){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,0.6);z-index:180;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML=`
    <div style="background:linear-gradient(160deg,var(--red),#8134AF);border-radius:24px;padding:36px 28px;text-align:center;max-width:320px;margin:24px;color:#fff;">
      <div style="font-size:64px;margin-bottom:12px;">🔥</div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:28px;">${streak} days in a row</div>
      <div style="font-size:14px;opacity:0.85;margin-top:8px;line-height:1.5;">Nice consistency — keep showing up.</div>
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
    // Streak freeze — Pradhan: 1/mo; Sarpanch: unlimited (future CM purchase)
    if(typeof ChaupaalMoney?.requestPaywall==='function'){
      ChaupaalMoney.requestPaywall({ reason: 'streak_freeze', open: 'membership' });
      return;
    }
  }catch(e){}
}


// ===================== REAL-TIME CHAT =====================
// Moved to /src/js/core/baithak-transport.js (loadRealtimeMessages / sendRealtimeMessage).


// ===================== REAL MATCHMAKING (Elo-aware server queue) =====================

/**
 * Find a live opponent via Elo-aware server queue (P7).
 * Returns { cancel } immediately.
 * onFound({ name, uid?, simulated, eloDelta? }) — simulated=true → Practice AI (honest).
 */
function findRealOpponent(filters, onFound, onCancel){
  let settled=false;
  let timeoutId=null;
  let pollId=null;
  let waitingId=null;
  const category=filters?.category||'GK';
  const gameId=filters?.gameId||filters?.category||null;

  const finish=(payload)=>{
    if(settled) return;
    settled=true;
    if(timeoutId){ clearTimeout(timeoutId); timeoutId=null; }
    if(pollId){ clearInterval(pollId); pollId=null; }
    try{ onFound(payload); }catch(e){}
  };

  const cancel=async()=>{
    if(settled) return;
    settled=true;
    if(timeoutId){ clearTimeout(timeoutId); timeoutId=null; }
    if(pollId){ clearInterval(pollId); pollId=null; }
    if(waitingId && typeof apiFetch==='function'){
      try{
        await apiFetch('/api/media-config',{
          method:'POST', needAuth:true,
          body:{ action:'dangal_match_cancel', category, waitingId },
        });
      }catch(e){}
    }
    try{ if(typeof onCancel==='function') onCancel(); }catch(e){}
  };

  const applyResult=(data)=>{
    if(!data || settled) return false;
    if(data.status==='matched'){
      finish({
        name:data.name||'Your opponent',
        uid:data.uid||null,
        simulated:false,
        eloDelta:data.eloDelta!=null?data.eloDelta:null,
        band:data.band||null,
      });
      return true;
    }
    if(data.status==='practice_ai'){
      finish({ name:'Practice AI', simulated:true, reason:data.reason||'timeout' });
      return true;
    }
    if(data.status==='waiting' && data.waitingId){
      waitingId=data.waitingId;
    }
    return false;
  };

  (async()=>{
    if(!currentUser || typeof apiFetch!=='function'){
      finish({ name:'Practice AI', simulated:true });
      return;
    }
    try{
      const env=await apiFetch('/api/media-config',{
        method:'POST', needAuth:true,
        body:{
          action:'dangal_match_step',
          category,
          gameId,
          filters,
          name:(typeof userProfile!=='undefined'&&userProfile?.name)||currentUser.displayName||'You',
        },
      });
      const data=env?.data||env;
      if(applyResult(data)) return;
      waitingId=data?.waitingId||waitingId;
      // Poll while waiting — band widens server-side
      pollId=setInterval(async()=>{
        if(settled) return;
        try{
          const env2=await apiFetch('/api/media-config',{
            method:'POST', needAuth:true,
            body:{
              action:'dangal_match_step',
              category,
              gameId,
              filters,
              waitingId,
              name:(typeof userProfile!=='undefined'&&userProfile?.name)||'You',
            },
          });
          applyResult(env2?.data||env2);
        }catch(e){}
      }, 2000);
      const timeoutMs=Number(data?.timeoutMs)||20000;
      timeoutId=setTimeout(async()=>{
        if(settled) return;
        if(pollId){ clearInterval(pollId); pollId=null; }
        if(waitingId){
          try{
            await apiFetch('/api/media-config',{
              method:'POST', needAuth:true,
              body:{ action:'dangal_match_cancel', category, waitingId },
            });
          }catch(e){}
        }
        finish({ name:'Practice AI', simulated:true, reason:'timeout' });
      }, timeoutMs);
    }catch(e){
      finish({ name:'Practice AI', simulated:true, reason:'error' });
    }
  })();

  return { cancel };
}

// ===================== PEEPAL QUOTA (server policyUsage peepalPost) =====================
async function checkPeepalQuota(){
  const lim=typeof PolicyLimits!=='undefined'?PolicyLimits.PEEPAL_POST:{perWeek:5};
  if(typeof PolicyUsage?.getRemaining==='function'){
    try{
      const rem=await PolicyUsage.getRemaining('peepalPost');
      weeklyQuestionCount=Math.max(0,(lim.perWeek||5)-(rem.weekLeft||0));
      return {
        weekly:weeklyQuestionCount,
        ok:!rem.exhausted,
        remaining:rem,
        unlock:rem.unlock||'',
      };
    }catch(e){
      return {weekly:weeklyQuestionCount, ok:false, unlock:'Couldn’t verify your limit — try again shortly'};
    }
  }
  return {weekly:weeklyQuestionCount, ok:false, unlock:'Couldn’t verify your limit — try again shortly'};
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
