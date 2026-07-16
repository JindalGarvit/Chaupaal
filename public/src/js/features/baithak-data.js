// ===================== SAMPLE BAITHAK DATA =====================
const SAMPLE_CHATS = [
  {id:'chat_riya',type:'dm',name:'Riya Sharma',avatar:'😊',preview:'Ready for tomorrow\'s Muqabala? 😤',time:'2m',unread:2,streak:7,duelStreak:12},
  {id:'chat_arjun',type:'dm',name:'Arjun Mehta',avatar:'🏔️',preview:'That Sports question was wrong though',time:'18m',unread:0,streak:3,duelStreak:5},
  {id:'grp_tech',type:'group',name:'Tech Geeks 💻',avatar:'💻',preview:'Someone: Did you read the AirTrunk news?',time:'1h',unread:5,members:12},
  {id:'grp_news',type:'group',name:'Daily Akhbaar Club',avatar:'📰',preview:'Today\'s score 13/20 😮‍💨',time:'3h',unread:0,members:8},
];

const SAMPLE_MESSAGES = {
  chat_riya: [
    {from:'them',text:'Ready for tomorrow\'s Dangal Muqabala? 😤',time:'10:12'},
    {from:'me',text:'Absolutely! I\'ll crush it on Sports 🏏',time:'10:14'},
    {from:'them',text:'Haha we\'ll see... what else is going on?',time:'10:15'},
  ],
  chat_arjun: [
    {from:'them',text:'Manali is absolutely beautiful right now ❄️',time:'Yesterday'},
    {from:'me',text:'Lucky you! When are you back?',time:'Yesterday'},
    {from:'them',text:'That Sports question was wrong though',time:'18m'},
  ],
  grp_tech: [
    {from:'group',name:'Priya',text:'AirTrunk investing $30B in India! 🚀',time:'1h'},
    {from:'group',name:'Rahul',text:'That\'s a huge step 💻',time:'58m'},
    {from:'group',name:'Someone',text:'Did you read the AirTrunk news?',time:'45m'},
  ],
  grp_news: [
    {from:'group',name:'Sakshi',text:'Finally got 13/20 today 😮‍💨',time:'3h'},
    {from:'group',name:'Dev',text:'I scored 15 😎',time:'3h'},
  ],
};

const SAMPLE_STORIES = [
  {id:'s1',name:'Riya',avatar:'😊',type:'score',score:14,total:20,streak:24,seen:false,auto:false,deletable:false,visibility:'friends',uid:'u1'},
  {id:'s2',name:'Arjun',avatar:'🏔️',type:'birthday',seen:false,auto:true,deletable:false,visibility:'friends',uid:'u6'},
  {id:'s3',name:'Priya',avatar:'👩',type:'score',score:18,total:20,streak:7,seen:true,auto:false,deletable:false,visibility:'close_friends',uid:'u2'},
];

function renderStories(){
  const row=document.getElementById('storiesRow');if(!row)return;
  Array.from(row.querySelectorAll('.story-item')).forEach(s=>s.remove());

  // Filter: show friends' stories + close friends stories if you ARE their close friend
  const myFriendUids=new Set(['u1','u2','u6']); // in prod: load from Firestore
  const closeFriendUids=new Set(JSON.parse(localStorage.getItem('chaupaal_close_friends')||'[]'));

  const visibleStories=SAMPLE_STORIES.filter(s=>{
    if(!myFriendUids.has(s.uid))return false; // must be a friend
    if(s.visibility==='close_friends')return closeFriendUids.has(s.uid); // close friends only
    return true; // 'friends' visibility
  });

  visibleStories.forEach(s=>{
    const item=document.createElement('div');item.className='story-item';
    const isCloseFriend=closeFriendUids.has(s.uid);
    item.innerHTML=`
      <div class="story-ring ${s.seen?'seen':''} ${s.auto?'auto':''}" style="${isCloseFriend&&s.visibility==='close_friends'?'background:linear-gradient(45deg,var(--gold),#FF9A3C);':''}">
        <div class="story-avatar">${s.avatar}</div>
      </div>
      <div class="story-label">${s.name}${s.visibility==='close_friends'?'<br><span style="font-size:8px;color:var(--gold);">⭐</span>':''}</div>
    `;
    item.addEventListener('click',()=>openStoryViewer(s));
    // Long-press to manage close friend status
    let pressTimer;
    item.addEventListener('mousedown',()=>pressTimer=setTimeout(()=>{toggleCloseFriend(s.uid,s.name);renderStories();},600));
    item.addEventListener('mouseup',()=>clearTimeout(pressTimer));
    item.addEventListener('touchstart',()=>pressTimer=setTimeout(()=>{toggleCloseFriend(s.uid,s.name);renderStories();},600),{passive:true});
    item.addEventListener('touchend',()=>clearTimeout(pressTimer));
    row.appendChild(item);
  });
}

function renderChatList(chats){
  const list = document.getElementById('chatList');
  if(!list) return;
  list.innerHTML = '';
  if(!chats.length){
    if(typeof renderEmptyState==='function'){
      renderEmptyState(list, {
        icon:'💬',
        title:'No chats yet',
        message:'Start a conversation from Peepal discovery or Duniya.',
      });
    } else {
      list.innerHTML = '<div style="padding:32px;text-align:center;color:var(--muted);font-size:14px;">No chats found 🤔</div>';
    }
    return;
  }
  chats.forEach(chat => {
    const item = document.createElement('div');
    item.className = 'chat-item';
    const when = typeof formatRelativeTime==='function'
      ? formatRelativeTime(chat.ts || chat.updatedAt || chat.time)
      : chat.time;
    item.innerHTML = `
      <div class="chat-avatar ${chat.type==='group'?'group':''}">${chat.avatar}
        ${chat.duelStreak?`<div class="streak-badge">🔥${chat.duelStreak}</div>`:''}
      </div>
      <div class="chat-info">
        <div class="chat-name">${chat.name}${chat.members?` <span style="font-size:11px;color:var(--muted);font-weight:400;">${chat.members} members</span>`:''}</div>
        <div class="chat-preview">${chat.preview||''}</div>
      </div>
      <div class="chat-meta">
        <div class="chat-time">${when}</div>
        ${chat.unread?`<div class="chat-badge">${chat.unread}</div>`:''}
      </div>
    `;
    item.addEventListener('click', () => openChatScreen(chat));
    list.appendChild(item);
  });
  if(baithakChatLiveMode&&baithakChatHasMore&&typeof ensureLoadMoreButton==='function'){
    ensureLoadMoreButton(list,{
      label:'Load more chats',
      onLoadMore:async()=>{
        await loadBaithakChatsPage({reset:false});
        renderChatList(baithakChats);
      },
    });
  }
}

/** Cursor-paginated chat inbox. Falls back to SAMPLE_CHATS when offline / empty. */
let baithakChats=[...SAMPLE_CHATS];
let baithakChatCursor=null;
let baithakChatHasMore=false;
let baithakChatLiveMode=false;
let baithakChatLoading=false;

function mapChatDoc(raw){
  const updated=raw.updatedAt?.toMillis?.()||raw.updatedAt?.toDate?.()?.getTime?.()||raw.ts||null;
  return {
    id: raw.id,
    firestoreId: raw.id,
    type: raw.type||'dm',
    name: raw.name||raw.title||'Chat',
    avatar: raw.avatar||'💬',
    preview: raw.preview||raw.lastMessage||'',
    time: updated?undefined:raw.time,
    ts: updated||raw.ts||Date.now(),
    updatedAt: updated,
    unread: raw.unread||0,
    streak: raw.streak||0,
    duelStreak: raw.duelStreak||0,
    members: raw.members||null,
    participants: raw.participants||[],
  };
}

async function loadBaithakChatsPage({reset=false}={}){
  if(!db||!currentUser||typeof fetchFirestorePage!=='function') return {loaded:0};
  if(baithakChatLoading) return {loaded:0};
  if(!reset&&!baithakChatHasMore) return {loaded:0};
  baithakChatLoading=true;
  try{
    if(reset){ baithakChatCursor=null; baithakChatHasMore=true; }
    // Requires composite index: participants ARRAY + updatedAt DESC
    const page=await fetchFirestorePage({
      queryBase: db.collection('chats').where('participants','array-contains',currentUser.uid),
      orderField:'updatedAt',
      direction:'desc',
      pageSize: 15,
      cursor: reset?null:baithakChatCursor,
      excludeDeleted:false,
    });
    const mapped=page.items.map(mapChatDoc);
    if(reset&&mapped.length){
      baithakChatLiveMode=true;
      baithakChats=mapped;
      // Keep inbox interactive: merge any local-only SAMPLE ids not yet in Firestore
      const seen=new Set(mapped.map(c=>c.id));
      SAMPLE_CHATS.forEach(s=>{ if(!seen.has(s.id)) baithakChats.push(s); });
    } else if(mapped.length){
      const seen=new Set(baithakChats.map(c=>c.firestoreId||c.id));
      mapped.forEach(c=>{ if(!seen.has(c.firestoreId||c.id)) baithakChats.push(c); });
    } else if(reset){
      baithakChatLiveMode=false;
      baithakChats=[...SAMPLE_CHATS];
    }
    baithakChatCursor=page.lastDoc;
    baithakChatHasMore=page.hasMore;
    return {loaded:mapped.length};
  }catch(e){
    console.warn('[baithak] chat page failed — using samples', e?.message||e);
    if(reset){ baithakChatLiveMode=false; baithakChats=[...SAMPLE_CHATS]; }
    return {loaded:0,error:e};
  }finally{
    baithakChatLoading=false;
  }
}

function getBaithakChatsForSearch(q){
  const query=(q||'').toLowerCase();
  if(!query) return baithakChats;
  return baithakChats.filter(c=>(c.name||'').toLowerCase().includes(query));
}

