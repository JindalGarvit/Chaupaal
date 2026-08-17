// ===================== SAMPLE BAITHAK DATA =====================
const SAMPLE_CHATS = [
  // Pinned locally too — ensureSelfChatPinned / pinSelfChat always re-assert this at render time
  {id:'chat_self',type:'self',isSelf:true,pinned:true,undeletable:true,name:'Me (You)',avatar:'📝',preview:'Notes to self · try games & features here',time:'Pinned',unread:0,duelStreak:0},
  // Demo rows (offline only) — unread 0 so they never look like real notifications
  {id:'chat_riya',type:'dm',name:'Riya Sharma',avatar:'😊',preview:'Ready for tomorrow\'s Muqabala? 😤',time:'2m',unread:0,streak:7,duelStreak:12,isSample:true,profileType:'personal',theirIcebreakers:[{promptId:'ib14',answer:'Cutting chai, extra adrak — non-negotiable after the local.'}],icebreakers:[{promptId:'ib14',answer:'Cutting chai, extra adrak — non-negotiable after the local.'}]},
  {id:'chat_arjun',type:'dm',name:'Arjun Mehta',avatar:'🏔️',preview:'That Sports question was wrong though',time:'18m',unread:0,streak:3,duelStreak:5,isSample:true,profileType:'personal',theirIcebreakers:[{promptId:'ib18',answer:'Road trip — windows down, random dhabas, no timetable.'}],icebreakers:[{promptId:'ib18',answer:'Road trip — windows down, random dhabas, no timetable.'}]},
  {id:'grp_tech',type:'group',name:'Tech Geeks 💻',avatar:'💻',preview:'Someone: Did you read the AirTrunk news?',time:'1h',unread:0,members:12,isSample:true},
  {id:'grp_news',type:'group',name:'Daily Akhbaar Club',avatar:'📰',preview:'Today\'s score 13/20 😮‍💨',time:'3h',unread:0,members:8,isSample:true},
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
      <div class="story-label">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(s.name,s):s.name}</div>
    `;
    item.addEventListener('click',()=>openStoryViewer(s));
    if(typeof bindProfileLongPress==='function') bindProfileLongPress(item.querySelector('.story-avatar'),s);
    row.appendChild(item);
  });
}

function isSelfChatRow(chat){
  if(!chat) return false;
  if(typeof isSelfChat==='function') return isSelfChat(chat);
  const id=chat.firestoreId||chat.id;
  return !!(chat.isSelf || chat.type==='self' || id==='chat_self' || (typeof id==='string' && id.startsWith('chat_self')));
}

function buildSelfChatRow(){
  if(typeof getSelfChat==='function') return getSelfChat();
  const id=(typeof selfChatId==='function'&&typeof currentUser!=='undefined'&&currentUser?.uid)
    ? selfChatId(currentUser.uid)
    : 'chat_self';
  return {
    id, firestoreId:id, type:'self', isSelf:true, pinned:true, undeletable:true,
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
  return out;
}

function renderChatList(chats, opts){
  const list = document.getElementById('chatList');
  if(!list){
    console.warn('[self-chat] renderChatList: #chatList missing');
    return;
  }
  list.innerHTML = '';
  try {
    (list._mehfilPresenceUnsubs || []).forEach((u) => {
      try {
        u();
      } catch (e) {}
    });
  } catch (e) {}
  list._mehfilPresenceUnsubs = [];
  const section = opts?.sectionEmpty || (typeof baithakSection === 'string' ? baithakSection : 'sabha');
  const pinPins = section === 'sabha' || !opts?.sectionEmpty;
  const pinned = pinPins ? pinSelfChat(chats||[]) : (chats || []).filter((c) => !isSelfChatRow(c) && !isChaupaalChatRow(c));
  // Only Self + Chaupaal means the social inbox is empty — show CTA under pins.
  const socialOnly = pinned.filter(c => !isSelfChatRow(c) && !isChaupaalChatRow(c));
  const showSectionEmpty = !!opts?.sectionEmpty && !socialOnly.length;
  pinned.forEach(chat => {
    const item = document.createElement('div');
    const self = isSelfChatRow(chat);
    const chaupaal = isChaupaalChatRow(chat);
    item.className = 'chat-item'+(self?' chat-item-self':'')+(chaupaal?' chat-item-chaupaal':'');
    item.dataset.chatId = chat.id || '';
    if(self) item.dataset.selfChat = '1';
    if(chaupaal) item.dataset.chaupaalChat = '1';
    const when = self || chaupaal ? 'Pinned' : (typeof formatRelativeTime==='function'
      ? formatRelativeTime(chat.ts || chat.updatedAt || chat.time)
      : chat.time);
    item.innerHTML = `
      <div class="chat-avatar presence-host ${chat.type==='group'?'group':''}${self?' self':''}${chaupaal?' chaupaal':''}" ${self?'data-self-pin-avatar="1" title="Open your profile"':''}${chaupaal?'data-chaupaal-pin-avatar="1" title="Open Chaupaal profile"':''}>${self||chaupaal?(chat.avatar||'📝'):chatAvatarMarkup(chat)}
        ${chat.duelStreak?`<div class="streak-badge">🔥${chat.duelStreak}</div>`:''}
        ${!self&&!chaupaal?`<span class="presence-dot presence-dot--mehfil" data-mehfil-presence-dot hidden aria-hidden="true"></span>`:''}
      </div>
      <div class="chat-info">
        <div class="chat-name">${(self||chaupaal||chat.type==='group'||chat.type==='self')?(chat.name||'Chat'):(typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(chat.name||'Chat',chat):(chat.name||'Chat'))}${self?` <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;">· you</span>`:''}${chaupaal?` <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;">· companion</span>`:''}${chat.members?` <span style="font-size:11px;color:var(--muted);font-weight:400;">${chat.members} members</span>`:''}</div>
        <div class="chat-preview">${chat.preview||''}</div>
      </div>
      <div class="chat-meta">
        <div class="chat-time">${when||''}</div>
        ${chat.unread?`<div class="chat-badge">${chat.unread}</div>`:''}
        ${!self&&!chaupaal?`<div class="chat-list-mehfil-live" data-mehfil-live-row hidden>${typeof mehfilMarkHtml==='function'?mehfilMarkHtml(12):''}<span>Live</span></div>`:''}
      </div>
    `;
    if(!self&&!chaupaal&&typeof watchMehfilPresence==='function'){
      const cid=chat.firestoreId||chat.id;
      const liveEl=item.querySelector('[data-mehfil-live-row]');
      const presenceDot=item.querySelector('[data-mehfil-presence-dot]');
      if(cid&&liveEl){
        const unsub=watchMehfilPresence(cid,({count,live,totalCount})=>{
          if(!liveEl.isConnected) return;
          const total=totalCount!=null?totalCount:count;
          const isLive=live!=null?!!live:total>=2;
          liveEl.hidden=!isLive;
          if(presenceDot) presenceDot.hidden=!isLive;
          const span=liveEl.querySelector('span');
          if(span) span.textContent=total>2?`Live · ${total}`:'Live';
        });
        list._mehfilPresenceUnsubs.push(unsub);
      }
    }
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
    if(chaupaal){
      const avatar=item.querySelector('[data-chaupaal-pin-avatar]');
      // Avatar → Chaupaal AI profile directly (skip peek / Open chat stack)
      avatar?.addEventListener('click',(e)=>{
        e.stopPropagation();
        if(typeof openChaupaalAiProfile==='function') openChaupaalAiProfile();
        else if(typeof openChaupaalAiPeek==='function') openChaupaalAiPeek();
      });
      avatar?.addEventListener('contextmenu',(e)=>{
        e.preventDefault();
        e.stopPropagation();
        if(typeof openBaithakAvatarMenu==='function'){
          openBaithakAvatarMenu(avatar,{
            uid:'chaupaal',
            name:'Chaupaal',
            closeFriend:false,
            isChaupaal:true,
          });
        }
      });
      if(typeof onLongPress==='function'){
        onLongPress(avatar,()=>{
          if(typeof openBaithakAvatarMenu==='function'){
            openBaithakAvatarMenu(avatar,{uid:'chaupaal',name:'Chaupaal',isChaupaal:true});
          }
        });
      }
    } else if(!self){
      const avatar=item.querySelector('.chat-avatar');
      const peerUid=chat.peerUid||chat.otherUid||chat.uid||(Array.isArray(chat.participants)?chat.participants.find(u=>u&&u!==currentUser?.uid):null);
      if(avatar&&peerUid){
        avatar.addEventListener('click',(e)=>{
          e.stopPropagation();
          const profile={uid:peerUid,name:chat.name,avatar:chat.avatar,photoURL:chat.photoURL,username:chat.username};
          if(typeof openProfilePeek==='function') openProfilePeek(profile);
          else if(typeof openPublicProfile==='function') openPublicProfile(profile);
        });
        if(typeof onLongPress==='function'){
          onLongPress(avatar,()=>{
            if(typeof openBaithakAvatarMenu==='function'){
              openBaithakAvatarMenu(avatar,{
                uid:peerUid,
                name:chat.name||'Friend',
                avatar:chat.avatar,
                photoURL:chat.photoURL,
              });
            }
          });
        }
      }
    }
    item.addEventListener('click', () => openChatScreen(chat));
    list.appendChild(item);
  });
  if(showSectionEmpty){
    const emptyHost=document.createElement('div');
    emptyHost.className='baithak-inbox-empty';
    list.appendChild(emptyHost);
    const copy =
      opts.sectionEmpty === 'mitra'
        ? {
            icon: '🤝',
            title: typeof t === 'function' ? t('baithak_mitra_empty_title') || 'No Mitra chats yet' : 'No Mitra chats yet',
            message:
              typeof t === 'function'
                ? t('baithak_mitra_empty_msg') || 'Chats with friends and people you follow land here.'
                : 'Chats with friends and people you follow land here.',
            actionLabel: typeof t === 'function' ? t('shortcut_baithak_search') || 'Find people' : 'Find people',
            onAction: () => {
              if (typeof openPeopleSearchWithContacts === 'function') openPeopleSearchWithContacts({ surface: 'baithak' });
            },
          }
        : {
            icon: '✨',
            title:
              typeof t === 'function'
                ? t('baithak_sambhav_empty_title') || 'No Sambhavanayein yet'
                : 'No Sambhavanayein yet',
            message:
              typeof t === 'function'
                ? t('baithak_sambhav_empty_msg') || 'Chats with people you haven’t friended or followed yet.'
                : 'Chats with people you haven’t friended or followed yet.',
            actionLabel: typeof t === 'function' ? t('shortcut_baithak_search') || 'Find people' : 'Find people',
            onAction: () => {
              if (typeof openPeopleSearchWithContacts === 'function') openPeopleSearchWithContacts({ surface: 'baithak' });
            },
          };
    if (typeof renderEmptyState === 'function') renderEmptyState(emptyHost, copy);
    else emptyHost.textContent = copy.title;
  } else if(!socialOnly.length){
    const emptyHost=document.createElement('div');
    emptyHost.className='baithak-inbox-empty';
    list.appendChild(emptyHost);
    if(baithakChatLoadError && typeof renderErrorState==='function'){
      renderErrorState(emptyHost, {
        title:'Couldn’t load chats',
        message:'Check your connection and try again.',
        onRetry:async()=>{
          baithakChatLoadError=false;
          if(typeof loadBaithakChatsPage==='function'){
            await loadBaithakChatsPage({reset:true});
          }
          renderChatList(baithakChats);
        },
      });
    } else if(typeof renderEmptyState==='function'){
      renderEmptyState(emptyHost, {
        icon:'💬',
        title:'No conversations yet',
        message:'Find people on Peepal or start a new chat.',
        actionLabel:'New chat',
        onAction:()=>{ if(typeof showNewChatOptions==='function') showNewChatOptions(); },
      });
    }
  }
  const selfEl = list.querySelector('[data-self-chat="1"]');
  if(!selfEl && pinPins){
    console.warn('[self-chat] Message Yourself missing from DOM after render — injecting fallback row');
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
        if(typeof setBaithakSection==='function') setBaithakSection(typeof window.baithakSection==='function'?window.baithakSection():'sabha');
        else renderChatList(baithakChats);
      },
    });
  }
}

/** Cursor-paginated chat inbox. Never seed SAMPLE_CHATS into the live list. */
let baithakChats = typeof pinSelfChat==='function' ? pinSelfChat([]) : [];
let baithakChatCursor=null;
let baithakChatHasMore=false;
let baithakChatLiveMode=false;
let baithakChatLoading=false;
let baithakChatLoadError=false;
let baithakInboxGapWarned=false;

function isGenericDmTitle(name){
  const n=String(name||'').trim();
  return !n || /^chat$/i.test(n) || n==='💬' || n==='Friend' || n==='Chaupaal member';
}

function chatAvatarMarkup(chat){
  const url=chat?.photoURL||chat?.photoThumb||(/^https?:\/\//i.test(String(chat?.avatar||''))?chat.avatar:'');
  if(url){
    const safe=String(url).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    return `<img src="${safe}" alt="">`;
  }
  const glyph=String(chat?.avatar||'').trim();
  if(glyph && glyph.length<=8 && !glyph.includes('<')) return glyph;
  return '👤';
}

async function hydrateInboxPeers(chats){
  if(!Array.isArray(chats)||!chats.length) return chats;
  await Promise.all(chats.map(async(c)=>{
    if(!c||c.type==='group') return;
    if(typeof isSelfChatRow==='function'&&isSelfChatRow(c)) return;
    if(typeof isChaupaalChatRow==='function'&&isChaupaalChatRow(c)) return;
    const peerUid=c.uid||c.peerUid||(c.participants||[]).find((u)=>u&&u!==currentUser?.uid);
    if(!peerUid) return;
    c.uid=peerUid;
    const mem=c.memberProfiles&&c.memberProfiles[peerUid];
    if(mem){
      if(isGenericDmTitle(c.name)&&mem.name) c.name=mem.name;
      c.username=c.username||mem.username;
      c.photoURL=c.photoURL||mem.photoURL||mem.photoThumb;
      c.profileType=c.profileType||mem.profileType;
    }
    if(!isGenericDmTitle(c.name)&&c.photoURL) return;
    try{
      const pub=typeof UsersPublic?.getPublicProfile==='function'
        ? await UsersPublic.getPublicProfile(peerUid)
        : (db?(await db.collection('users_public').doc(peerUid).get()).data():null);
      if(!pub) return;
      if(isGenericDmTitle(c.name)) c.name=pub.name||pub.displayName||pub.username||c.name;
      c.username=c.username||pub.username;
      c.photoURL=c.photoURL||pub.photoURL||pub.photoThumb;
      c.profileType=c.profileType||pub.profileType;
    }catch(e){}
  }));
  return chats;
}

/** Firestore timestamps / numbers → ms. Docs without `updatedAt` still recency-sort via lastMessageAt/createdAt/ts. */
function chatFieldMs(v){
  if(v==null||v==='') return null;
  if(typeof v==='number'&&Number.isFinite(v)) return v;
  if(typeof v?.toMillis==='function') return v.toMillis();
  if(typeof v?.toDate==='function'){
    const d=v.toDate();
    return d&&!Number.isNaN(d.getTime())?d.getTime():null;
  }
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function chatRecencyMs(c){
  const n=chatFieldMs(c?.updatedAt)||chatFieldMs(c?.lastMessageAt)||chatFieldMs(c?.createdAt)||chatFieldMs(c?.ts)||0;
  return Number.isFinite(n)?n:0;
}

function chatInboxId(c){
  return (c&&(c.firestoreId||c.id))||'';
}

function isLiveSampleChat(c){
  if(!c) return false;
  if(c.isSample) return true;
  const id=String(c.id||c.firestoreId||'');
  return id==='chat_riya'||id==='chat_arjun'||id==='grp_tech'||id==='grp_news';
}

/**
 * Union inbox rows by id. Never drop already-shown live chats this session.
 * Never admit SAMPLE_CHATS (Riya / grp_tech are offline-only).
 */
function mergeBaithakInbox(existing, incoming){
  const byId=new Map();
  const add=(c)=>{
    if(!c||isLiveSampleChat(c)) return;
    const id=chatInboxId(c);
    if(!id) return;
    const prev=byId.get(id);
    byId.set(id, prev?Object.assign({},prev,c):c);
  };
  (existing||[]).forEach(add);
  (incoming||[]).forEach(add);
  return [...byId.values()].sort((a,b)=>chatRecencyMs(b)-chatRecencyMs(a));
}

async function ensureChatUpdatedAt(raw){
  if(!db||!currentUser||!raw) return;
  if(isLiveSampleChat(raw)) return;
  const id=chatInboxId(raw);
  if(!id||String(id).startsWith('chat_self')||String(id)==='chat_self') return;
  if(!raw.missingUpdatedAt && chatFieldMs(raw.updatedAt)!=null) return;
  const val=raw.lastMessageAt||raw.createdAt||raw.ts||(typeof firebase!=='undefined'&&firebase.firestore?.FieldValue?.serverTimestamp?.())||Date.now();
  try{
    await db.collection('chats').doc(id).set({updatedAt:val},{merge:true});
  }catch(e){}
}

function mapChatDoc(raw){
  const updated=chatFieldMs(raw.updatedAt)||chatFieldMs(raw.lastMessageAt)||chatFieldMs(raw.createdAt)||chatFieldMs(raw.ts);
  const profiles=raw.memberProfiles&&typeof raw.memberProfiles==='object'?raw.memberProfiles:{};
  const peerUid=(raw.participants||[]).find?.(uid=>typeof currentUser!=='undefined'&&uid!==currentUser?.uid);
  const peerProfile=peerUid?profiles[peerUid]:null;
  const isGroup=raw.type==='group';
  const peerName=peerProfile?.name||peerProfile?.username||'';
  const title=isGroup
    ? (raw.name||raw.title||'Group')
    : (peerName||(!isGenericDmTitle(raw.name||raw.title)?(raw.name||raw.title):'')||'Chat');
  const photo=peerProfile?.photoURL||peerProfile?.photoThumb||raw.photoURL||null;
  return {
    id: raw.id,
    firestoreId: raw.id,
    type: raw.type||'dm',
    name: title,
    avatar: photo?photo:(raw.avatar&&raw.avatar!=='💬'?raw.avatar:'👤'),
    photoURL: photo,
    preview: raw.preview||raw.lastMessage||'',
    time: updated?undefined:raw.time,
    ts: updated||raw.ts||Date.now(),
    updatedAt: updated,
    missingUpdatedAt: chatFieldMs(raw.updatedAt)==null,
    unread: (()=>{
      const last=raw.lastMessageAt?.toMillis?.()||raw.lastMessageAt||updated||0;
      const myUid=typeof currentUser!=='undefined'?currentUser?.uid:null;
      const myRead=myUid&&raw.reads&&typeof raw.reads==='object'?Number(raw.reads[myUid])||0:0;
      if(myRead&&last&&myRead>=Number(last)) return 0;
      try{
        const ls=Number(localStorage.getItem('chaupaal_read_'+(raw.id||''))||0);
        if(ls&&last&&ls>=Number(last)) return 0;
      }catch(e){}
      return Number(raw.unread)||0;
    })(),
    streak: raw.streak||0,
    duelStreak: raw.duelStreak||0,
    members: raw.members||null,
    participants: raw.participants||[],
    admins: raw.admins||[],
    memberProfiles: profiles,
    permissions: raw.permissions||null,
    invite: raw.invite||null,
    createdBy: raw.createdBy||null,
    description: raw.description||'',
    photoURL: raw.photoURL||null,
    uid: peerUid||raw.peerUid||null,
    profileType: raw.profileType||raw.peerProfileType||peerProfile?.profileType||null,
    discoveryOrigin: raw.discoveryOrigin||raw.origin||null,
    origin: raw.origin||raw.discoveryOrigin||null,
    sharedFirstHello: raw.sharedFirstHello||null,
    peerProfileType: raw.peerProfileType||raw.profileType||peerProfile?.profileType||null,
    openedBy: raw.openedBy||raw.createdBy||null,
    createdBy: raw.createdBy||null,
    firstMessageAt: raw.firstMessageAt?.toMillis?.()||raw.firstMessageAt||null,
    lastMessageAt: raw.lastMessageAt?.toMillis?.()||raw.lastMessageAt||null,
    matchMeta: raw.matchMeta||null,
    createdAt: raw.createdAt?.toMillis?.()||raw.createdAt||null,
  };
}

/**
 * Inbox load: recency query (participants + updatedAt desc) PLUS a membership
 * fallback. Firestore OMITs docs that lack the orderBy field — old groups/DMs
 * with only createdAt/ts/lastMessageAt never appear in the recency page.
 * Do not treat an empty updatedAt page as “no chats”. Never seed SAMPLE_CHATS.
 */
async function loadBaithakChatsPage({reset=false}={}){
  if(!db||!currentUser||typeof fetchFirestorePage!=='function') return {loaded:0};
  if(baithakChatLoading) return {loaded:0};
  if(!reset&&!baithakChatHasMore) return {loaded:0};
  baithakChatLoading=true;
  const prevLive=(baithakChats||[]).filter((c)=>!isLiveSampleChat(c));
  const openChat=typeof window!=='undefined'?window.currentOpenChat:null;
  const keepOpen=(list)=>{
    const openId=openChat&&(openChat.firestoreId||openChat.id);
    if(!openChat||!openId||isLiveSampleChat(openChat)) return list;
    if((list||[]).some(c=>(c.firestoreId||c.id)===openId)) return list;
    return [openChat, ...(list||[])];
  };
  const applyList=(incoming)=>{
    const withPrev=mergeBaithakInbox(prevLive, incoming);
    baithakChats=pinSelfChat(keepOpen(withPrev));
  };
  let orderedError=null;
  let page={items:[],lastDoc:null,hasMore:false};
  try{
    if(reset){ baithakChatCursor=null; baithakChatHasMore=true; }
    // Requires composite index: participants ARRAY + updatedAt DESC
    page=await fetchFirestorePage({
      queryBase: db.collection('chats').where('participants','array-contains',currentUser.uid),
      orderField:'updatedAt',
      direction:'desc',
      pageSize: 15,
      cursor: reset?null:baithakChatCursor,
      excludeDeleted:false,
    });
  }catch(e){
    orderedError=e;
    console.warn('[baithak] chat recency page failed', e?.message||e);
  }

  let fallbackItems=[];
  let fallbackError=null;
  if(reset){
    try{
      const snap=await db.collection('chats').where('participants','array-contains',currentUser.uid).limit(80).get();
      fallbackItems=snap.docs.map((d)=>({id:d.id,...(d.data()||{})}));
    }catch(e2){
      fallbackError=e2;
      console.warn('[baithak] chat membership fallback failed', e2?.message||e2);
    }
  }

  if(orderedError&&fallbackError){
    baithakChatLoadError=true;
    baithakChatLoading=false;
    if(typeof showToast==='function') showToast('Couldn’t refresh chats.');
    baithakChats=pinSelfChat(keepOpen(prevLive.length?prevLive:(openChat&&!isLiveSampleChat(openChat)?[openChat]:[])));
    return {loaded:0,error:orderedError};
  }

  try{
    const orderedMapped=(page.items||[]).map(mapChatDoc);
    const fallbackMapped=fallbackItems.map(mapChatDoc);
    if(reset&&fallbackMapped.length>orderedMapped.length&&!baithakInboxGapWarned){
      baithakInboxGapWarned=true;
      console.warn('[baithak] inbox updatedAt page omitted chats', {
        ordered: orderedMapped.length,
        membership: fallbackMapped.length,
      });
    }
    const incoming=reset?orderedMapped.concat(fallbackMapped):orderedMapped;
    await hydrateInboxPeers(incoming);
    if(typeof enrichUsersWithProfileType==='function') await enrichUsersWithProfileType(incoming);
    baithakChatLiveMode=true;
    baithakChatLoadError=false;
    applyList(incoming);
    const needBackfill=[];
    const seenBackfill=new Set();
    incoming.forEach((c)=>{
      if(!c.missingUpdatedAt) return;
      const id=c.firestoreId||c.id;
      if(!id||seenBackfill.has(id)) return;
      seenBackfill.add(id);
      if(needBackfill.length<12) needBackfill.push(c);
    });
    needBackfill.forEach((c)=>{ ensureChatUpdatedAt(c); });
    if(!orderedError){
      baithakChatCursor=page.lastDoc;
      baithakChatHasMore=!!page.hasMore;
    } else {
      baithakChatHasMore=false;
      if(typeof showToast==='function') showToast('Couldn’t refresh chats.');
    }
    return {loaded:incoming.length};
  }catch(e){
    console.warn('[baithak] chat page failed', e?.message||e);
    baithakChatLoadError=true;
    if(typeof showToast==='function') showToast('Couldn’t refresh chats.');
    baithakChats=pinSelfChat(keepOpen(prevLive.length?prevLive:(openChat&&!isLiveSampleChat(openChat)?[openChat]:[])));
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

/** Phase 4 — Sabha / Sambhavanayein / Mitra filters.
 * Sabha: all chats; self + Chaupaal AI ONLY here.
 * Sambhavanayein: DMs with people who are NOT friends / not followed.
 * Mitra: friends / following only.
 */
let baithakSection = 'sabha';

function peerUidOfChat(c) {
  if (!c) return null;
  return (
    c.uid ||
    c.peerUid ||
    (c.participants || []).find((u) => typeof currentUser !== 'undefined' && u !== currentUser?.uid) ||
    null
  );
}

function isFriendOrFollowing(st) {
  if (!st) return false;
  return !!(st.friend || st.following || st.closeFriend || st.status === 'friends' || st.status === 'following');
}

async function setBaithakSection(section) {
  baithakSection = ['sabha', 'sambhavanayein', 'mitra'].includes(section) ? section : 'sabha';
  const panel = document.getElementById('panel-baithak');
  if (panel) panel.dataset.baithakSection = baithakSection;
  const all = typeof pinSelfChat === 'function' ? pinSelfChat(baithakChats) : baithakChats || [];

  if (baithakSection === 'sabha') {
    renderChatList(all);
    return;
  }

  // Self + Chaupaal AI stay in Sabha only
  const social = all.filter((c) => !isSelfChatRow(c) && !isChaupaalChatRow(c));
  const dms = social.filter((c) => c.type !== 'group');
  const groups = social.filter((c) => c.type === 'group');
  const uids = dms.map(peerUidOfChat).filter(Boolean);
  let states = {};
  if (typeof hydrateRelationships === 'function' && uids.length) {
    states = await hydrateRelationships(uids).catch(() => ({}));
  }

  let filtered = [];
  if (baithakSection === 'sambhavanayein') {
    filtered = dms.filter((c) => {
      const uid = peerUidOfChat(c);
      const st = states[uid] || {};
      if (isFriendOrFollowing(st)) return false;
      if (typeof isTeenModeUser === 'function' && isTeenModeUser() && !isTeenModeUser(c)) return false;
      return true;
    });
  } else if (baithakSection === 'mitra') {
    filtered = dms.filter((c) => {
      const uid = peerUidOfChat(c);
      return isFriendOrFollowing(states[uid] || {});
    });
    // Groups with friends stay in Mitra when any member is a friend (best-effort)
    filtered = [...filtered, ...groups];
  }

  renderChatList(filtered, { sectionEmpty: baithakSection });
}
window.setBaithakSection = setBaithakSection;
window.baithakSection = () => baithakSection;
window.hydrateInboxPeers = hydrateInboxPeers;
window.chatAvatarMarkup = chatAvatarMarkup;
window.ensureChatUpdatedAt = ensureChatUpdatedAt;
window.mergeBaithakInbox = mergeBaithakInbox;
window.mapChatDoc = mapChatDoc;
window.chatRecencyMs = chatRecencyMs;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    chatFieldMs,
    chatRecencyMs,
    chatInboxId,
    isLiveSampleChat,
    mergeBaithakInbox,
    mapChatDoc,
  };
}

