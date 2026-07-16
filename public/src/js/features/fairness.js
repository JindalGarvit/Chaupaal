// ===================== FAIRNESS ALGORITHM + FEEDBACK SYSTEM =====================

// ---- Stranger limit system ----
let strangerDailyLimit = parseInt(localStorage.getItem('chaupaal_stranger_limit') || '10');

function getTodayKey(){ return new Date().toISOString().split('T')[0]; }

function getStrangerCountToday(uid){
  const key = `chaupaal_stranger_msgs_${uid}_${getTodayKey()}`;
  return parseInt(localStorage.getItem(key) || '0');
}

function incrementStrangerCount(targetUid){
  const key = `chaupaal_stranger_msgs_${targetUid}_${getTodayKey()}`;
  const n = getStrangerCountToday(targetUid) + 1;
  localStorage.setItem(key, n);
  // Also update Firestore
  if(db) db.collection('stranger_counts').doc(`${targetUid}_${getTodayKey()}`).set({
    uid: targetUid, date: getTodayKey(),
    count: n, updatedAt: Date.now()
  }, {merge: true}).catch(()=>{});
  return n;
}

function canMessageStranger(targetUid, targetLimit){
  const limit = targetLimit ?? 10;
  if(limit === 0) return false;
  return getStrangerCountToday(targetUid) < limit;
}

// ---- Profile popularity score (for de-prioritisation) ----
function getProfilePopularityPenalty(user){
  const uid = user.uid || user.id || '';
  if(!uid) return 0;
  const todayCount = getStrangerCountToday(uid);
  const userLimit = user.strangerDailyLimit ?? 10;
  if(userLimit === 0) return 999; // completely private
  const fillRate = todayCount / userLimit; // 0 to 1+
  // Penalty increases non-linearly as they approach their limit
  // 0% fill = 0 penalty, 50% fill = 5 penalty, 90% fill = 25 penalty, 100% fill = 999
  if(fillRate >= 1) return 999; // at limit — don't show
  if(fillRate >= 0.9) return 25;
  if(fillRate >= 0.7) return 15;
  if(fillRate >= 0.5) return 8;
  if(fillRate >= 0.3) return 3;
  return 0;
}

// ---- Response rate tracking ----
function recordMessageSent(toUid){
  const key = `chaupaal_msgs_sent_${toUid}`;
  const data = JSON.parse(localStorage.getItem(key) || '{"sent":0,"replied":0}');
  data.sent++;
  localStorage.setItem(key, JSON.stringify(data));
}

function recordReply(fromUid){
  const key = `chaupaal_msgs_sent_${fromUid}`;
  const data = JSON.parse(localStorage.getItem(key) || '{"sent":0,"replied":0}');
  data.replied++;
  localStorage.setItem(key, JSON.stringify(data));
}

function getResponseRate(uid){
  const key = `chaupaal_msgs_sent_${uid}`;
  const data = JSON.parse(localStorage.getItem(key) || '{"sent":0,"replied":0}');
  if(data.sent < 3) return 1; // not enough data — assume good
  return data.replied / data.sent; // 0 to 1
}

// ---- scoreMatch (base interest score + fairness penalties) ----
// Note: original monolith patched a missing scoreMatch onto itself (infinite recursion).
// Provide a real base score here; callers can use this when ranking discovery profiles.
function scoreMatch(user){
  const myInterests = new Set([
    ...(typeof personalityProfile !== 'undefined' ? (personalityProfile?.interests || []) : []),
    ...(typeof myCategories !== 'undefined' ? (myCategories || []).map(c => c.name) : []),
  ].map(i => String(i).toLowerCase()));
  const their = [...(user.interests || []), user.topCat].filter(Boolean).map(i => String(i).toLowerCase());
  const shared = their.filter(i => [...myInterests].some(m => m.includes(i) || i.includes(m)));
  let score = 40 + Math.random() * 25;
  if (shared.length) score += shared.length * 12;
  const myCity = (typeof userProfile !== 'undefined' && userProfile?.city) ||
    (typeof digitalProfile !== 'undefined' && digitalProfile?.currentCity) || '';
  if (user.city && String(myCity).toLowerCase().includes(String(user.city).toLowerCase())) score += 15;

  const penalty = getProfilePopularityPenalty(user);
  const responseRate = getResponseRate(user.uid);
  const responsePenalty = responseRate < 0.3 ? 20 : responseRate < 0.6 ? 8 : 0;
  return {
    score: Math.max(0, score - penalty - responsePenalty),
    matchPct: Math.min(98, Math.max(42, Math.round(score))),
    shared,
    fairnessPenalty: penalty + responsePenalty,
  };
}

function interceptStrangerMessage(targetUid, targetName, targetLimit, onProceed){
  if(!canMessageStranger(targetUid, targetLimit)){
    showToast(`${targetName} is taking a break from new connections today. Try again tomorrow!`);
    return;
  }
  incrementStrangerCount(targetUid);
  recordMessageSent(targetUid);
  onProceed();
}

// ===================== MATCHMAKING FEEDBACK SYSTEM =====================

// ---- Signal 1: Emoji reaction on AI search results ----
function addSearchFeedback(resultsEl, query, resultCount){
  if(!resultsEl || resultCount === 0) return;
  const feedbackEl = document.createElement('div');
  feedbackEl.style.cssText = 'background:var(--cream);border-radius:16px;padding:12px 16px;margin-top:14px;text-align:center;';
  feedbackEl.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">How were these results?</div>
    <div style="display:flex;justify-content:center;gap:12px;">
      ${[['🎯','Spot on',5],['✨','Pretty good',4],['🤔','Okay',3],['😕','Not great',2]].map(([emoji,label,score])=>`
        <button data-score="${score}" data-label="${label}" style="display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;cursor:pointer;padding:6px 8px;border-radius:10px;transition:background .15s;">
          <span style="font-size:22px;">${emoji}</span>
          <span style="font-size:9px;font-weight:700;color:var(--muted);">${label}</span>
        </button>
      `).join('')}
    </div>
  `;
  feedbackEl.querySelectorAll('[data-score]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const score=parseInt(btn.dataset.score);
      const label=btn.dataset.label;
      recordSearchFeedback(query, resultCount, score, label);
      feedbackEl.innerHTML=`<div style="font-size:13px;color:var(--muted);padding:4px;">Thanks for the feedback! 🙏 We'll keep improving.</div>`;
    });
  });
  resultsEl.appendChild(feedbackEl);
}

function recordSearchFeedback(query, resultCount, score, label){
  // Save locally
  const history = JSON.parse(localStorage.getItem('chaupaal_search_feedback')||'[]');
  history.push({query, resultCount, score, label, ts:Date.now()});
  localStorage.setItem('chaupaal_search_feedback', JSON.stringify(history.slice(-50)));
  // Save to Firestore
  if(db&&currentUser) db.collection('search_feedback').add({
    uid: currentUser.uid, query, resultCount, score, label,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(()=>{});
}

// ---- Signal 2: Conversation outcome (48h after "Say hi") ----
function scheduleOutcomeCheck(matchUid, matchName){
  const key = `chaupaal_outcome_${matchUid}`;
  if(localStorage.getItem(key)) return; // already scheduled
  localStorage.setItem(key, JSON.stringify({matchUid, matchName, scheduledAt: Date.now()}));
  setTimeout(()=>{
    const data = JSON.parse(localStorage.getItem(key)||'{}');
    if(!data.matchUid) return;
    localStorage.removeItem(key);
    // Silently check if a conversation happened (chat in SAMPLE_CHATS?)
    const chatted = SAMPLE_CHATS.some(c=>c.id?.includes(data.matchUid)&&c.lastMessage);
    recordMatchOutcome(data.matchUid, chatted ? 'connected' : 'ghosted');
  }, 48*3600000); // 48h
}

function recordMatchOutcome(matchUid, outcome){
  if(db&&currentUser) db.collection('match_outcomes').add({
    uid: currentUser.uid, matchUid, outcome,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(()=>{});
  // If ghosted, quietly reduce that profile's response rate signal
  if(outcome === 'ghosted'){
    const key = `chaupaal_msgs_sent_${matchUid}`;
    const data = JSON.parse(localStorage.getItem(key)||'{"sent":1,"replied":0}');
    localStorage.setItem(key, JSON.stringify(data)); // already recorded as sent
  } else {
    recordReply(matchUid);
  }
}

// ---- Signal 3: Discovery card reactions (❤️ strong interest) ----
const _discoveryInterest = {};
function recordDiscoveryInterest(uid, isStrong){
  _discoveryInterest[uid] = isStrong ? 'strong' : 'dismissed';
  if(db&&currentUser) db.collection('discovery_reactions').add({
    uid: currentUser.uid, targetUid: uid,
    reaction: isStrong ? 'interested' : 'dismissed',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(()=>{});
}

// ---- Signal 4: Weekly Peepal check-in (non-intrusive) ----
function maybeShowPeepalCheckIn(){
  const key = `chaupaal_peepal_checkin_${new Date().toISOString().slice(0,7)}`; // monthly
  if(localStorage.getItem(key)) return;
  // Only show if user has done 3+ searches this month
  const feedback = JSON.parse(localStorage.getItem('chaupaal_search_feedback')||'[]');
  const recentSearches = feedback.filter(f=>Date.now()-f.ts < 30*86400000);
  if(recentSearches.length < 2) return; // not enough usage
  localStorage.setItem(key,'shown');
  // Show as a gentle nudge in Peepal feed (not a pop-up)
  setTimeout(()=>{
    const feed = document.getElementById('peepalFeed');
    if(!feed) return;
    const nudge = document.createElement('div');
    nudge.style.cssText='background:linear-gradient(135deg,var(--navy),#2A3158);border-radius:16px;padding:14px 16px;margin-bottom:12px;color:#fff;display:flex;align-items:center;gap:12px;';
    nudge.innerHTML=`
      <div style="font-size:28px;">🌳</div>
      <div style="flex:1;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;">How's Peepal working for you?</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px;">Quick 1-tap — helps us improve your matches</div>
      </div>
      <div style="display:flex;gap:8px;">
        ${[['🔥','Great'],['👍','Good'],['😕','Meh']].map(([e,l])=>`<button data-r="${l}" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:10px;padding:8px;font-size:18px;cursor:pointer;">${e}</button>`).join('')}
      </div>
    `;
    nudge.querySelectorAll('[data-r]').forEach(btn=>btn.addEventListener('click',()=>{
      recordSearchFeedback('peepal_monthly_checkin',0,{'Great':5,'Good':4,'Meh':2}[btn.dataset.r]||3,btn.dataset.r);
      nudge.remove();
      showToast('Thanks! Your feedback shapes Peepal 🙏');
    }));
    feed.insertBefore(nudge, feed.firstChild);
  }, 3000);
}

// ---- Patch AI search to add feedback widget ----
const _origRunPeepalAiSearch = runPeepalAiSearch;
window.runPeepalAiSearch = async function(){
  await _origRunPeepalAiSearch();
  const query = document.getElementById('peepalAiSearchInput')?.value || '';
  const resultsEl = document.getElementById('peepalAiSearchResults');
  const count = resultsEl?.querySelectorAll('.peepal-ai-result-card').length || 0;
  if(count > 0) addSearchFeedback(resultsEl, query, count);
};

// ---- Patch "Say hi" in AI search to intercept + schedule outcome check ----
// This patches the dynamically created buttons in runPeepalAiSearch
// We observe DOM for new .peepal-ai-chat-btn buttons
const _chatBtnObserver = new MutationObserver(mutations=>{
  mutations.forEach(m=>{
    m.addedNodes.forEach(node=>{
      if(node.nodeType!==1)return;
      node.querySelectorAll?.('.peepal-ai-chat-btn').forEach(btn=>{
        if(btn.dataset.intercepted)return;
        btn.dataset.intercepted='1';
        const origClick = btn.onclick;
        const uid = btn.dataset.uid;
        const name = btn.dataset.name;
        btn.addEventListener('click',e=>{
          e.stopImmediatePropagation();
          interceptStrangerMessage(uid, name, 10, ()=>{
            scheduleOutcomeCheck(uid, name);
            // Find the original click handler and call it
            btn.dispatchEvent(new MouseEvent('click_original',{bubbles:false}));
          });
        }, true);
      });
      // Add ❤️ strong interest button to discovery cards
      node.querySelectorAll?.('.discovery-card').forEach(card=>{
        const uid=card.dataset.uid;
        if(!uid||card.dataset.reactWired)return;
        card.dataset.reactWired='1';
        const viewBtn=card.querySelector('.discovery-view-btn');
        if(viewBtn){
          const heartBtn=document.createElement('button');
          heartBtn.innerHTML='❤️';
          heartBtn.title='Strong interest — show me more like this';
          heartBtn.style.cssText='background:none;border:none;font-size:18px;cursor:pointer;padding:4px;flex-shrink:0;';
          heartBtn.addEventListener('click',e=>{
            e.stopPropagation();
            recordDiscoveryInterest(uid,true);
            heartBtn.innerHTML='❤️';heartBtn.style.animation='heartPop 0.3s ease';
            showToast('Noted! We\'ll show you more like this ❤️');
          });
          viewBtn.parentElement?.insertBefore(heartBtn, viewBtn);
        }
      });
    });
  });
});
const _deviceEl = document.querySelector('.device');
if(_deviceEl) _chatBtnObserver.observe(_deviceEl, {childList:true, subtree:true});

// ---- Run monthly Peepal check-in check ----
setTimeout(maybeShowPeepalCheckIn, 5000);

