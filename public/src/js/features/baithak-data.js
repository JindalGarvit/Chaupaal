// ===================== SAMPLE BAITHAK DATA =====================
const SAMPLE_CHATS = [
  // Pinned locally too — ensureSelfChatPinned / pinSelfChat always re-assert this at render time
  {id:'chat_self',type:'self',isSelf:true,pinned:true,undeletable:true,name:'Me (You)',avatar:'📝',preview:'Notes to self · try games & features here',time:'Pinned',unread:0,duelStreak:0},
  {id:'chat_riya',type:'dm',name:'Riya Sharma',avatar:'😊',preview:'Ready for tomorrow\'s Muqabala? 😤',time:'2m',unread:2,streak:7,duelStreak:12,theirIcebreakers:[{promptId:'ib14',answer:'Cutting chai, extra adrak — non-negotiable after the local.'}],icebreakers:[{promptId:'ib14',answer:'Cutting chai, extra adrak — non-negotiable after the local.'}]},
  {id:'chat_arjun',type:'dm',name:'Arjun Mehta',avatar:'🏔️',preview:'That Sports question was wrong though',time:'18m',unread:0,streak:3,duelStreak:5,theirIcebreakers:[{promptId:'ib18',answer:'Road trip — windows down, random dhabas, no timetable.'}],icebreakers:[{promptId:'ib18',answer:'Road trip — windows down, random dhabas, no timetable.'}]},
  {id:'grp_tech',type:'group',name:'Tech Geeks 💻',avatar:'💻',preview:'Someone: Did you read the AirTrunk news?',time:'1h',unread:5,members:12},
  {id:'grp_news',type:'group',name:'Daily Akhbaar Club',avatar:'📰',preview:'Today\'s score 13/20 😮‍💨',time:'3h',unread:0,members:8},
];

const SAMPLE_MESSAGES = {
  chat_self: [
    {from:'me',text:'This is your space — notes to yourself, and a place to try chats, games, and features without another person.',time:'Pinned'},
  ],
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
  {id:'s3',name:'Priya',avatar:'👩',type:'score',score:18,total:20,streak:7,seen:true,auto:false,deletable:false,visibility:'friends',uid:'u2'},
];

function renderStories(){
  const row=document.getElementById('storiesRow');if(!row)return;
  Array.from(row.querySelectorAll('.story-item')).forEach(s=>s.remove());

  // Guest samples model already-authorized stories only. Audience metadata is
  // intentionally not exposed in rings or labels.
  const myFriendUids=new Set(['u1','u2','u6']); // in prod: load from Firestore

  const visibleStories=SAMPLE_STORIES.filter(s=>myFriendUids.has(s.uid));

  visibleStories.forEach(s=>{
    const item=document.createElement('div');item.className='story-item';
    item.innerHTML=`
      <div class="story-ring ${s.seen?'seen':''} ${s.auto?'auto':''}">
        <div class="story-avatar">${s.avatar}</div>
      </div>
      <div class="story-label">${s.name}</div>
    `;
    item.addEventListener('click',()=>openStoryViewer(s));
    if(typeof bindProfileLongPress==='function') bindProfileLongPress(item.querySelector('.story-avatar'),s);
    row.appendChild(item);
  });
}

function isSelfChatRow(chat){
  if(!chat) return false;
  if(typeof isSelfChat==='function') return isSelfChat(chat);
  return !!(chat.isSelf || chat.type==='self' || chat.id==='chat_self' || chat.firestoreId==='chat_self');
}

function buildSelfChatRow(){
  if(typeof getSelfChat==='function') return getSelfChat();
  return {
    id:'chat_self', type:'self', isSelf:true, pinned:true, undeletable:true,
    name:'Me (You)', avatar:'📝',
    preview:'Notes to self · try games & features here',
    time:'Pinned', unread:0, duelStreak:0,
    uid: (typeof currentUser!=='undefined' && currentUser) ? currentUser.uid : null,
  };
}

/**
 * Pin order: Chaupaal (system) → Me (self) → rest.
 * Note: an earlier local-only fix never reached production (live baithak-data had no
 * pinSelfChat; /src/js/features/self-chat.js 404'd) — which is why the row stayed missing.
 */
function isChaupaalChatRow(chat){
  if(!chat) return false;
  if(typeof isChaupaalChat==='function') return isChaupaalChat(chat);
  return !!(chat.isChaupaal || chat.type==='chaupaal' || (typeof chat.id==='string' && chat.id.startsWith('chat_chaupaal_')));
}

function pinSelfChat(chats){
  const input = Array.isArray(chats) ? chats : [];
  let out;
  if(typeof ensureChaupaalPinned==='function'){
    out = ensureChaupaalPinned(input);
  } else if(typeof ensureSelfChatPinned==='function'){
    out = ensureSelfChatPinned(input);
  } else {
    out = [buildSelfChatRow(), ...input.filter(c => !isSelfChatRow(c))];
  }
  if(typeof getChaupaalChat==='function'){
    if(!out.length || !isChaupaalChatRow(out[0])){
      out = [getChaupaalChat(), ...out.filter(c => !isChaupaalChatRow(c))];
    }
    if(out.length < 2 || !isSelfChatRow(out[1])){
      const rest = out.filter(c => !isChaupaalChatRow(c) && !isSelfChatRow(c));
      out = [out[0] || getChaupaalChat(), buildSelfChatRow(), ...rest];
    }
  } else if(!out.length || !isSelfChatRow(out[0])){
    console.warn('[self-chat] pinSelfChat: first row was not self — force-inserting', {
      uid: (typeof currentUser!=='undefined' && currentUser) ? currentUser.uid : null,
      inCount: input.length,
      outNames: out.slice(0,5).map(c=>c&&c.name),
    });
    out = [buildSelfChatRow(), ...out.filter(c => !isSelfChatRow(c))];
  }
  try{
    console.info('[self-chat] pinSelfChat', {
      uid: (typeof currentUser!=='undefined' && currentUser) ? currentUser.uid : null,
      inCount: input.length,
      outCount: out.length,
      firstId: out[0]&&out[0].id,
      firstName: out[0]&&out[0].name,
      hasEnsure: typeof ensureSelfChatPinned==='function',
      hasChaupaal: typeof ensureChaupaalPinned==='function',
    });
  }catch(e){}
  return out;
}

function renderChatList(chats){
  const list = document.getElementById('chatList');
  if(!list){
    console.warn('[self-chat] renderChatList: #chatList missing');
    return;
  }
  list.innerHTML = '';
  const pinned = pinSelfChat(chats||[]);
  if(!pinned.length){
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
  pinned.forEach(chat => {
    const item = document.createElement('div');
    const self = isSelfChatRow(chat);
    item.className = 'chat-item'+(self?' chat-item-self':'');
    item.dataset.chatId = chat.id || '';
    if(self) item.dataset.selfChat = '1';
    const when = self ? 'Pinned' : (typeof formatRelativeTime==='function'
      ? formatRelativeTime(chat.ts || chat.updatedAt || chat.time)
      : chat.time);
    item.innerHTML = `
      <div class="chat-avatar ${chat.type==='group'?'group':''}${self?' self':''}" ${self?'data-self-pin-avatar="1" title="Open your profile"':''}>${chat.avatar||'📝'}
        ${chat.duelStreak?`<div class="streak-badge">🔥${chat.duelStreak}</div>`:''}
      </div>
      <div class="chat-info">
        <div class="chat-name">${chat.name||'Chat'}${self?` <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;">· you</span>`:''}${chat.members?` <span style="font-size:11px;color:var(--muted);font-weight:400;">${chat.members} members</span>`:''}</div>
        <div class="chat-preview">${chat.preview||''}</div>
      </div>
      <div class="chat-meta">
        <div class="chat-time">${when||''}</div>
        ${chat.unread?`<div class="chat-badge">${chat.unread}</div>`:''}
      </div>
    `;
    if(self){
      item.style.background='rgba(230,57,70,0.04)';
      item.style.borderBottom='1px solid var(--line)';
      const avatar=item.querySelector('[data-self-pin-avatar]');
      avatar?.addEventListener('click',(e)=>{
        e.stopPropagation();
        if(typeof openOwnProfilePreview==='function') openOwnProfilePreview();
        else {
          if(typeof setProfilePreviewMode==='function') setProfilePreviewMode(true);
          if(typeof renderProfileModal==='function') renderProfileModal();
          document.getElementById('profileModal')?.classList.remove('hidden');
        }
      });
    }
    item.addEventListener('click', () => openChatScreen(chat));
    list.appendChild(item);
  });
  const selfEl = list.querySelector('[data-self-chat="1"]');
  console.info('[self-chat] renderChatList DOM', {
    totalRows: list.querySelectorAll('.chat-item').length,
    selfPresent: !!selfEl,
    firstRowText: list.querySelector('.chat-item .chat-name')?.textContent?.trim() || null,
  });
  if(!selfEl){
    console.error('[self-chat] Message Yourself missing from DOM after render — injecting fallback row');
    const fallback = buildSelfChatRow();
    const item = document.createElement('div');
    item.className = 'chat-item chat-item-self';
    item.dataset.chatId = fallback.id;
    item.dataset.selfChat = '1';
    item.style.background='rgba(230,57,70,0.04)';
    item.innerHTML = `<div class="chat-avatar">📝</div><div class="chat-info"><div class="chat-name">Message Yourself <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;">· you</span></div><div class="chat-preview">${fallback.preview}</div></div><div class="chat-meta"><div class="chat-time">Pinned</div></div>`;
    item.addEventListener('click', () => openChatScreen(fallback));
    list.insertBefore(item, list.firstChild);
  }
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
let baithakChats = pinSelfChat([...SAMPLE_CHATS]);
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
    admins: raw.admins||[],
    memberProfiles: raw.memberProfiles||{},
    permissions: raw.permissions||null,
    invite: raw.invite||null,
    createdBy: raw.createdBy||null,
    description: raw.description||'',
    photoURL: raw.photoURL||null,
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
      baithakChats=pinSelfChat(mapped);
      // Keep inbox interactive: merge any local-only SAMPLE ids not yet in Firestore
      const seen=new Set(baithakChats.map(c=>c.id));
      SAMPLE_CHATS.forEach(s=>{ if(!seen.has(s.id) && !isSelfChatRow(s)) baithakChats.push(s); });
      baithakChats=pinSelfChat(baithakChats);
    } else if(mapped.length){
      const seen=new Set(baithakChats.map(c=>c.firestoreId||c.id));
      mapped.forEach(c=>{ if(!seen.has(c.firestoreId||c.id)) baithakChats.push(c); });
      baithakChats=pinSelfChat(baithakChats);
    } else if(reset){
      baithakChatLiveMode=false;
      baithakChats=pinSelfChat([...SAMPLE_CHATS]);
    }
    baithakChatCursor=page.lastDoc;
    baithakChatHasMore=page.hasMore;
    return {loaded:mapped.length};
  }catch(e){
    console.warn('[baithak] chat page failed — using samples', e?.message||e);
    if(reset){ baithakChatLiveMode=false; baithakChats=pinSelfChat([...SAMPLE_CHATS]); }
    return {loaded:0,error:e};
  }finally{
    baithakChatLoading=false;
  }
}

function getBaithakChatsForSearch(q){
  const query=(q||'').toLowerCase();
  const base = pinSelfChat(baithakChats);
  if(!query) return base;
  // Self-chat stays pinned even while filtering the rest of the inbox
  const rest = base.filter(c => !isSelfChatRow(c) && (c.name||'').toLowerCase().includes(query));
  return pinSelfChat(rest);
}

