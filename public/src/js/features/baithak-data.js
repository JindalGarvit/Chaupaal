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
  if (typeof applyBaithakListTransform === 'function' && !opts?.skipPrefsTransform) {
    chats = applyBaithakListTransform(chats, { includeHidden: !!opts?.includeHidden });
  }
  const pinned = pinPins ? pinSelfChat(chats||[]) : (chats || []).filter((c) => !isSelfChatRow(c) && !isChaupaalChatRow(c));
  // Only Self + Chaupaal means the social inbox is empty — show CTA under pins.
  const socialOnly = pinned.filter(c => !isSelfChatRow(c) && !isChaupaalChatRow(c));
  const showSectionEmpty = !!opts?.sectionEmpty && !socialOnly.length;
  pinned.forEach(chat => {
    const item = document.createElement('div');
    const self = isSelfChatRow(chat);
    const chaupaal = isChaupaalChatRow(chat);
    const pref = (typeof getBaithakPref==='function' ? getBaithakPref(chat.firestoreId||chat.id) : null) || chat._baithakPref || {};
    const isUserPinned = !!(pref.pinned && !self && !chaupaal);
    const isMuted = !!pref.muted;
    const forceUnread = !!(pref.markUnread || chat._forceUnread);
    const unreadN = forceUnread ? Math.max(1, Number(chat.unread)||1) : chat.unread;
    const isSample = !!(chat.isSample || chat.isDemo);
    item.className = 'chat-item'+(self?' chat-item-self':'')+(chaupaal?' chat-item-chaupaal':'')+(isUserPinned?' is-pinned':'')+(isMuted?' is-muted':'')+(forceUnread||unreadN?' is-unread':'')+(isSample?' chat-item-demo':'');
    item.dataset.chatId = chat.firestoreId || chat.id || '';
    if(self) item.dataset.selfChat = '1';
    if(chaupaal) item.dataset.chaupaalChat = '1';
    if(isSample) item.dataset.demo = '1';
    if(isUserPinned) item.dataset.userPinned = '1';
    const when = self || chaupaal ? 'Pinned' : (typeof formatRelativeTime==='function'
      ? formatRelativeTime(chat.ts || chat.updatedAt || chat.time)
      : chat.time);
    const statusIcons = [
      isUserPinned ? '<span class="chat-status-ico" title="Pinned" aria-hidden="true">📌</span>' : '',
      isMuted ? '<span class="chat-status-ico" title="Muted" aria-hidden="true">🔕</span>' : '',
    ].filter(Boolean).join('');
    const pinHandle = isUserPinned
      ? `<button type="button" class="chat-pin-handle" aria-label="Reorder" tabindex="-1">☰</button>`
      : '';
    const demoBadge = isSample ? ` <span class="cp-demo-badge" title="Sample">Demo</span>` : '';
    item.innerHTML = `
      <div class="chat-avatar presence-host ${chat.type==='group'?'group':''}${self?' self':''}${chaupaal?' chaupaal':''}" ${self?'data-self-pin-avatar="1" title="Open your profile"':''}${chaupaal?'data-chaupaal-pin-avatar="1" title="Open Chaupaal profile"':''}>${self||chaupaal?(chat.avatar||'📝'):chatAvatarMarkup(chat)}
        ${chat.duelStreak?`<div class="streak-badge">🔥${chat.duelStreak}</div>`:''}
        ${!self&&!chaupaal?`<span class="presence-dot presence-dot--mehfil" data-mehfil-presence-dot hidden aria-hidden="true"></span>`:''}
      </div>
      <div class="chat-info">
        <div class="chat-name">${(self||chaupaal||chat.type==='group'||chat.type==='self')?(chat.name||'Chat'):(typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(chat.name||'Chat',chat):(chat.name||'Chat'))}${demoBadge}${self?` <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;">· you</span>`:''}${chaupaal?` <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;">· companion</span>`:''}${chat.members?` <span style="font-size:11px;color:var(--muted);font-weight:400;">${chat.members} members</span>`:''}${statusIcons}</div>
        <div class="chat-preview">${isSample?'Sample — sign in for real chats · ':''}${chat._searchSnippet||chat.preview||''}</div>
      </div>
      <div class="chat-meta">
        <div class="chat-time">${when||''}</div>
        ${unreadN?`<div class="chat-badge">${unreadN}</div>`:''}
        ${!self&&!chaupaal?`<div class="chat-list-mehfil-live" data-mehfil-live-row hidden>${typeof mehfilMarkHtml==='function'?mehfilMarkHtml(12):''}<span>Live</span></div>`:''}
        ${pinHandle}
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
          const isLive=live!=null?!!live:false;
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
        if(typeof openUserProfile==='function'){
          openUserProfile({uid:currentUser?.uid},{context:'baithak_self',initialMode:'owner'});
        } else if(typeof openOwnProfilePreview==='function') openOwnProfilePreview({context:'baithak_self',owner:true});
        else {
          if(typeof setProfilePreviewMode==='function') setProfilePreviewMode(false);
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
            splitExcluded:false,
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
      const isGroup = chat.type === 'group';
      if(avatar){
        avatar.addEventListener('click',(e)=>{
          if(avatar.dataset.suppressClick==='1'){ e.preventDefault(); e.stopPropagation(); return; }
          e.stopPropagation();
          if(typeof openAvatarLightbox==='function'){
            openAvatarLightbox({
              photoURL: chat.photoURL || (typeof chat.avatar==='string'&&/^https?:/i.test(chat.avatar)?chat.avatar:''),
              name: chat.name || (isGroup ? 'Group' : 'Friend'),
              avatar: chat.avatar || (isGroup ? '👥' : '👤'),
              uid: isGroup ? '' : peerUid || '',
              isGroup,
              chat: isGroup ? chat : null,
              username: chat.username || '',
            });
          }
        });
        if(typeof onLongPress==='function'){
          onLongPress(avatar,()=>{
            if(isGroup){
              if(typeof openBaithakChatActions==='function') openBaithakChatActions(chat, { surface: 'inbox' });
              else if(typeof openGroupInfo==='function') openGroupInfo(chat);
              return;
            }
            if(!peerUid) return;
            const profile={uid:peerUid,name:chat.name,avatar:chat.avatar,photoURL:chat.photoURL,username:chat.username};
            if(typeof openBaithakAvatarMenu==='function') openBaithakAvatarMenu(avatar, profile);
          },{ delayMs: 520 });
        }
      }
    }
    if(!self&&!chaupaal&&typeof onLongPress==='function'){
      onLongPress(item,()=>{
        if(typeof openBaithakChatActions==='function') openBaithakChatActions(chat, { surface: 'inbox' });
      },{ delayMs: 520 });
    }
    item.addEventListener('click', (e) => {
      if(typeof BaithakChatActions!=='undefined' && BaithakChatActions.isPinReorderMode && BaithakChatActions.isPinReorderMode()){
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      openChatScreen(chat);
    });
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
              (baithakChats||[]).some((c)=>c&&c.type==='group'&&!isLiveSampleChat(c))
                ? (typeof t === 'function'
                    ? t('baithak_sambhav_groups_in_sabha') || 'Groups and friend chats live in Sabha — swipe there to see them.'
                    : 'Groups and friend chats live in Sabha — swipe there to see them.')
                : (typeof t === 'function'
                    ? t('baithak_sambhav_empty_msg') || 'Chats with people you haven’t friended or followed yet.'
                    : 'Chats with people you haven’t friended or followed yet.'),
            actionLabel: (baithakChats||[]).some((c)=>!isSelfChatRow(c)&&!isChaupaalChatRow(c)&&!isLiveSampleChat(c))
              ? (typeof t === 'function' ? t('baithak_sabha_sub') || 'Sabha' : 'Sabha')
              : (typeof t === 'function' ? t('shortcut_baithak_search') || 'Find people' : 'Find people'),
            onAction: () => {
              if ((baithakChats||[]).some((c)=>!isSelfChatRow(c)&&!isChaupaalChatRow(c)&&!isLiveSampleChat(c))) {
                if (typeof setBaithakSection === 'function') setBaithakSection('sabha');
                return;
              }
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
      const isGuest=typeof currentUser==='undefined'||!currentUser;
      renderEmptyState(emptyHost, {
        icon:'💬',
        title: isGuest ? 'Demo chats only' : 'No conversations yet',
        message: isGuest
          ? 'You’re browsing samples — sign in to chat with real people.'
          : 'Invite friends or find people from your contacts. Sample people from guest mode won’t appear here.',
        actionLabel: isGuest ? 'Sign in' : 'Invite friends',
        onAction:()=>{
          if(isGuest){
            if(typeof showAuth==='function') showAuth();
            else if(typeof openAuthSheet==='function') openAuthSheet('login');
            return;
          }
          if(typeof shareInviteToChaupaal==='function') shareInviteToChaupaal();
          else if(typeof openDay0MeetSheet==='function') openDay0MeetSheet();
        },
        secondaryActions: isGuest ? [] : [
          {
            label:'Find from contacts',
            onAction:()=>{
              if(typeof openPeopleSearchWithContacts==='function') openPeopleSearchWithContacts({surface:'baithak'});
            },
          },
          {
            label:'Find on Peepal',
            onAction:()=>{
              if(typeof showTab==='function') showTab('peepal');
              if(typeof setPeepalMode==='function') setPeepalMode('khoj');
            },
          },
          {
            label:'New chat',
            onAction:()=>{ if(typeof showNewChatOptions==='function') showNewChatOptions(); },
          },
        ],
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
  if (typeof BaithakChatActions !== 'undefined' && BaithakChatActions.isPinReorderMode && BaithakChatActions.isPinReorderMode()) {
    list.classList.add('baithak-pin-reorder');
    if (typeof BaithakChatActions.wirePinReorderHandles === 'function') BaithakChatActions.wirePinReorderHandles();
  } else {
    list.classList.remove('baithak-pin-reorder');
  }
}

/** Cursor-paginated chat inbox. Never seed SAMPLE_CHATS into the live list. */
let baithakChats = typeof pinSelfChat==='function' ? pinSelfChat([]) : [];
let baithakChatCursor=null;
let baithakChatHasMore=false;
let baithakChatLiveMode=false;
let baithakChatLoading=false;
let baithakChatLoadQueued=null;
let baithakChatLoadError=false;
let baithakInboxGapWarned=false;
const INBOX_CACHE_MAX=200;
const MEMBERSHIP_PAGE=100;
const MEMBERSHIP_MAX=500;

function isGenericDmTitle(name){
  const n=String(name||'').trim();
  if(!n) return true;
  if(/^@/.test(n)) return true;
  return /^chat$/i.test(n) || n==='💬' || n==='Friend' || n==='Chaupaal member' || n==='Someone' || /^someone$/i.test(n);
}

function isStubDmId(id){
  const s=String(id||'');
  if(/^chat_(dl|disc|profile)_/.test(s)) return true;
  if(/^chat_(self|riya|arjun|chaupaal)/.test(s)) return false;
  // Legacy wish fallback: chat_${firebaseUid}
  return /^chat_[A-Za-z0-9]{10,}$/.test(s);
}

function peerUidOfInboxChat(c){
  if(!c||c.type==='group') return '';
  if(typeof isSelfChatRow==='function'&&isSelfChatRow(c)) return '';
  if(typeof isChaupaalChatRow==='function'&&isChaupaalChatRow(c)) return '';
  return String(c.uid||c.peerUid||c.otherUid||(c.participants||[]).find((u)=>u&&u!==currentUser?.uid)||'').trim();
}

function resolveBaithakTitle(chat, viewerUid){
  if(!chat) return '';
  if(typeof BaithakSearch!=='undefined'&&typeof BaithakSearch.resolveChatDisplayName==='function'){
    const real=chat._realName||(!isGenericDmTitle(chat.name)?chat.name:'');
    const title=BaithakSearch.resolveChatDisplayName(chat, real);
    if(title&&!isGenericDmTitle(title)&&!/^@/.test(String(title).trim())) return title;
  }
  const peer=peerUidOfInboxChat(chat);
  if(viewerUid&&peer&&typeof BaithakSearch!=='undefined'&&typeof BaithakSearch.getDmNickname==='function'){
    const nick=BaithakSearch.getDmNickname(peer);
    if(nick) return nick;
  }
  const mem=peer&&chat.memberProfiles&&chat.memberProfiles[peer];
  const candidates=[chat._realName, mem?.name, chat.name, chat.displayName];
  for(const c of candidates){
    if(c&&!isGenericDmTitle(c)&&!/^@/.test(String(c).trim())) return String(c).trim();
  }
  return chat.name||'';
}

function chatAvatarMarkup(chat){
  if(chat?.type==='group'||chat?.isChaupaal) return String(chat?.avatar||'👤');
  if(typeof renderUserAvatarHtml==='function'){
    return renderUserAvatarHtml({
      uid:chat?.uid||chat?.peerUid,
      name:chat?.name,
      username:chat?.username,
      photoURL:chat?.photoURL,
      photoThumb:chat?.photoThumb,
      avatar:chat?.avatar,
      profileType:chat?.profileType,
      interests:chat?.interests,
      hobbies:chat?.hobbies,
      industry:chat?.industry,
      gender:chat?.gender,
      avatarDisplay:chat?.avatarDisplay,
      profile:chat?.profile,
      city:chat?.city,
      occupation:chat?.occupation,
      topCat:chat?.topCat,
    }, { decorative:true });
  }
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
      if(isGenericDmTitle(c.name)&&mem.name){
        c.name=mem.name;
        c._realName=mem.name;
      }
      c.username=c.username||mem.username;
      c.photoURL=c.photoURL||mem.photoURL||mem.photoThumb;
      c.profileType=c.profileType||mem.profileType;
    }
    if(!isGenericDmTitle(c.name)&&c.photoURL){
      if(!c._realName&&!/^@/.test(String(c.name).trim())) c._realName=c.name;
      return;
    }
    try{
      const pub=typeof UsersPublic?.getPublicProfile==='function'
        ? await UsersPublic.getPublicProfile(peerUid)
        : (db?(await db.collection('users_public').doc(peerUid).get()).data():null);
      if(!pub) return;
      const pubName=pub.name||pub.displayName||'';
      if(isGenericDmTitle(c.name)&&pubName){
        c.name=pubName;
        c._realName=pubName;
      }else if(pubName&&!c._realName){
        c._realName=pubName;
      }
      c.username=c.username||pub.username;
      c.photoURL=c.photoURL||pub.photoURL||pub.photoThumb;
      c.profileType=c.profileType||pub.profileType;
    }catch(e){}
  }));
  if(typeof BaithakSearch!=='undefined'&&typeof BaithakSearch.applyDisplayNames==='function'){
    BaithakSearch.applyDisplayNames(chats);
  }
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
 * Union inbox rows. DMs are keyed by peer (canonical dmChatId preferred).
 * Never admit SAMPLE_CHATS (Riya / grp_tech are offline-only). Stub ids are dropped when peer is known.
 */
function mergeBaithakInbox(existing, incoming){
  const byKey=new Map();
  const add=(c)=>{
    if(!c||isLiveSampleChat(c)) return;
    const id=chatInboxId(c);
    if(!id) return;
    const isSelf=typeof isSelfChatRow==='function'&&isSelfChatRow(c);
    const isCai=typeof isChaupaalChatRow==='function'&&isChaupaalChatRow(c);
    const isGroup=c.type==='group';
    const peer=(!isSelf&&!isCai&&!isGroup)?peerUidOfInboxChat(c):'';
    let key=id;
    let canon='';
    if(peer&&typeof dmChatIdFor==='function'){
      canon=dmChatIdFor(peer)||'';
      if(canon) key=`peer:${peer}`;
    }
    if(peer&&isStubDmId(id)&&canon&&id!==canon){
      // Prefer remapping stubs onto canonical id rather than keeping them.
      c={...c,id:canon,firestoreId:canon,uid:peer,peerUid:peer};
    }
    const prev=byKey.get(key);
    if(!prev){
      byKey.set(key,c);
      return;
    }
    const prevId=chatInboxId(prev);
    const nextId=chatInboxId(c);
    let prefer=c;
    if(canon){
      if(prevId===canon&&nextId!==canon) prefer=prev;
      else if(nextId===canon&&prevId!==canon) prefer=c;
      else prefer=chatRecencyMs(c)>=chatRecencyMs(prev)?c:prev;
    }else{
      prefer=chatRecencyMs(c)>=chatRecencyMs(prev)?c:prev;
    }
    byKey.set(key, Object.assign({}, prev, prefer, {
      id: (canon&&(prefer.firestoreId===canon||prefer.id===canon))?canon:(prefer.firestoreId||prefer.id||prevId),
      firestoreId: (canon&&(prefer.firestoreId===canon||prefer.id===canon))?canon:(prefer.firestoreId||prefer.id||prevId),
      uid: peer||prefer.uid||prev.uid,
      peerUid: peer||prefer.peerUid||prev.peerUid,
      name: (!isGenericDmTitle(prefer.name)?prefer.name:(!isGenericDmTitle(prev.name)?prev.name:prefer.name)),
      _realName: prefer._realName||prev._realName||(!isGenericDmTitle(prefer.name)?prefer.name:prev._realName),
    }));
  };
  (existing||[]).forEach(add);
  (incoming||[]).forEach(add);
  return [...byKey.values()].sort((a,b)=>chatRecencyMs(b)-chatRecencyMs(a));
}

function inboxCacheKey(){
  const uid=typeof currentUser!=='undefined'?currentUser?.uid:'';
  return uid?`chaupaal_baithak_inbox_v1_${uid}`:'';
}

function readInboxCache(){
  const key=inboxCacheKey();
  if(!key) return [];
  try{
    const raw=localStorage.getItem(key);
    const list=raw?JSON.parse(raw):[];
    if(!Array.isArray(list)) return [];
    return list.filter((c)=>c&&chatInboxId(c)&&!isLiveSampleChat(c));
  }catch(e){
    return [];
  }
}

function writeInboxCache(chats){
  const key=inboxCacheKey();
  if(!key) return;
  try{
    const stubs=(chats||[])
      .filter((c)=>c&&!isLiveSampleChat(c)&&!isSelfChatRow(c)&&!isChaupaalChatRow(c))
      .sort((a,b)=>chatRecencyMs(b)-chatRecencyMs(a))
      .slice(0,INBOX_CACHE_MAX)
      .map((c)=>{
        const id=chatInboxId(c);
        return {
          id,
          firestoreId:id,
          type:c.type||'dm',
          name:c.name||'',
          preview:String(c.preview||'').slice(0,160),
          ts:chatRecencyMs(c),
          updatedAt:chatRecencyMs(c),
          uid:c.uid||null,
          photoURL:c.photoURL||null,
          avatar:typeof c.avatar==='string'&&c.avatar.length<=8?c.avatar:'👤',
          participants:Array.isArray(c.participants)?c.participants.slice(0,40):[],
          members:c.members||null,
        };
      });
    localStorage.setItem(key,JSON.stringify(stubs));
  }catch(e){}
}

function forgetInboxChat(chatId){
  const id=String(chatId||'');
  if(!id) return;
  const next=readInboxCache().filter((c)=>chatInboxId(c)!==id);
  writeInboxCache(next);
}

function rememberInboxChat(chat){
  if(!chat||isLiveSampleChat(chat)) return;
  const peer=peerUidOfInboxChat(chat);
  if(peer&&typeof dmChatIdFor==='function'){
    const canon=dmChatIdFor(peer);
    const id=chatInboxId(chat);
    if(canon&&id&&id!==canon&&isStubDmId(id)){
      chat={...chat,id:canon,firestoreId:canon,uid:peer,peerUid:peer};
    }
  }
  writeInboxCache(mergeBaithakInbox(readInboxCache(),[chat]));
}

function msgFingerprint(m){
  const uid=String(m?.uid||'');
  const text=String(m?.text||'').slice(0,200);
  let ts=m?.ts;
  if(ts&&typeof ts.toMillis==='function') ts=ts.toMillis();
  else if(ts&&typeof ts.toDate==='function') ts=ts.toDate().getTime();
  else ts=Number(ts)||0;
  return `${uid}|${ts}|${text}`;
}

/**
 * One-time per session: merge stub DMs into canonical dmChatIdFor(peer).
 */
async function migrateDuplicateDmInbox(uid){
  const viewer=String(uid||currentUser?.uid||'');
  if(!viewer||!db) return {merged:0};
  const flag=`chaupaal_dm_merge_v1_${viewer}`;
  try{ if(sessionStorage.getItem(flag)==='1') return {merged:0,skipped:true}; }catch(e){}
  const list=mergeBaithakInbox(
    Array.isArray(baithakChats)?baithakChats:[],
    readInboxCache().map((c)=>typeof mapChatDoc==='function'?mapChatDoc(c):c)
  );
  const byPeer=new Map();
  list.forEach((c)=>{
    const peer=peerUidOfInboxChat(c);
    if(!peer) return;
    if(!byPeer.has(peer)) byPeer.set(peer,[]);
    byPeer.get(peer).push(c);
  });
  let merged=0;
  for(const [peer, rows] of byPeer){
    const canon=typeof dmChatIdFor==='function'?dmChatIdFor(peer):'';
    if(!canon) continue;
    const stubs=rows.filter((r)=>{
      const id=chatInboxId(r);
      return id&&id!==canon;
    });
    if(!stubs.length&&rows.every((r)=>chatInboxId(r)===canon)) continue;
    try{
      if(typeof ensurePeerDmChat==='function') await ensurePeerDmChat(peer);
      const canonRef=db.collection('chats').doc(canon);
      const existingSnap=await canonRef.collection('messages').orderBy('ts','asc').limit(200).get().catch(()=>null);
      const seen=new Set();
      (existingSnap?.docs||[]).forEach((d)=>seen.add(msgFingerprint(d.data())));
      for(const stub of stubs){
        const stubId=chatInboxId(stub);
        if(!stubId||stubId===canon) continue;
        try{
          const stubMsgs=await db.collection('chats').doc(stubId).collection('messages').orderBy('ts','asc').limit(200).get();
          for(const doc of stubMsgs.docs){
            const raw=doc.data()||{};
            const fp=msgFingerprint(raw);
            if(seen.has(fp)) continue;
            seen.add(fp);
            const copy={...raw};
            delete copy.mergedFrom;
            await canonRef.collection('messages').add({
              ...copy,
              mergedFrom: stubId,
              clientTempId: raw.clientTempId||null,
            });
          }
          await db.collection('chats').doc(stubId).set({
            mergedInto:canon,
            mergedAt:firebase.firestore.FieldValue.serverTimestamp(),
          },{merge:true}).catch(()=>{});
        }catch(e){}
        forgetInboxChat(stubId);
        if(Array.isArray(baithakChats)){
          baithakChats=baithakChats.filter((c)=>chatInboxId(c)!==stubId);
        }
        if(typeof SAMPLE_CHATS!=='undefined'&&Array.isArray(SAMPLE_CHATS)){
          const i=SAMPLE_CHATS.findIndex((c)=>c.id===stubId);
          if(i>=0) SAMPLE_CHATS.splice(i,1);
        }
        merged+=1;
      }
      // Ensure canonical row present
      const canonRow=rows.find((r)=>chatInboxId(r)===canon)||{
        id:canon,firestoreId:canon,type:'dm',uid:peer,peerUid:peer,
        name:rows[0]?.name||'Chat',participants:[viewer,peer].sort(),
      };
      rememberInboxChat(canonRow);
    }catch(e){
      console.warn('[baithak] dm merge', peer, e?.message||e);
    }
  }
  try{ sessionStorage.setItem(flag,'1'); }catch(e){}
  if(Array.isArray(baithakChats)){
    baithakChats=mergeBaithakInbox(baithakChats,[]);
    writeInboxCache(baithakChats);
  }
  return {merged};
}

/** Hydrate inbox from device cache immediately (before Firestore round-trip). */
function hydrateInboxFromDeviceCache(){
  const cached=readInboxCache();
  if(!cached.length) return [];
  const mapped=cached.map((c)=>mapChatDoc(c));
  baithakChats=typeof pinSelfChat==='function'?pinSelfChat(mergeBaithakInbox(baithakChats,mapped)):mergeBaithakInbox(baithakChats,mapped);
  if(typeof BaithakSearch!=='undefined'&&typeof BaithakSearch.applyDisplayNames==='function'){
    BaithakSearch.applyDisplayNames(baithakChats);
  }
  return mapped;
}

/** Fetch cached chat ids individually when list queries miss legacy rows. */
async function recoverCachedChatsById(cachedStubs){
  if(!db||!currentUser||!Array.isArray(cachedStubs)||!cachedStubs.length) return [];
  const out=[];
  const seen=new Set();
  for(const stub of cachedStubs.slice(0,INBOX_CACHE_MAX)){
    const id=chatInboxId(stub);
    if(!id||seen.has(id)) continue;
    seen.add(id);
    try{
      const snap=await db.collection('chats').doc(id).get();
      if(snap.exists){
        out.push(mapChatDoc({id,...snap.data()}));
      }else{
        out.push(mapChatDoc(stub));
      }
    }catch(e){
      out.push(mapChatDoc(stub));
    }
  }
  return out;
}

function normalizeParticipants(raw){
  const uid=currentUser?.uid;
  if(!raw||!uid) return [];
  const parts=raw.participants||raw.members||raw.participantIds||[];
  return Array.isArray(parts)?parts.filter(Boolean):[];
}

async function repairChatParticipants(raw){
  if(!db||!currentUser||!raw) return false;
  const id=chatInboxId(raw);
  if(!id||isLiveSampleChat(raw)) return false;
  const uid=currentUser.uid;
  const parts=normalizeParticipants(raw);
  if(parts.includes(uid)) return true;
  const isCanonicalDm=typeof dmChatIdFor==='function'&&id===dmChatIdFor(raw.uid||raw.peerUid);
  if(raw.type==='dm'&&isCanonicalDm&&(raw.uid||raw.peerUid)){
    try{
      await ensurePeerDmChat(raw.uid||raw.peerUid);
      return true;
    }catch(e){
      console.warn('[baithak] repair dm participants', e?.message||e);
    }
  }
  return false;
}

async function ensureChatUpdatedAt(raw){
  if(!db||!currentUser||!raw) return;
  if(isLiveSampleChat(raw)) return;
  const id=chatInboxId(raw);
  if(!id||String(id).startsWith('chat_self')||String(id)==='chat_self'||String(id).startsWith('chat_chaupaal_')) return;
  if(!raw.missingUpdatedAt && chatFieldMs(raw.updatedAt)!=null) return;
  const val=raw.lastMessageAt||raw.createdAt||raw.ts||(typeof firebase!=='undefined'&&firebase.firestore?.FieldValue?.serverTimestamp?.())||Date.now();
  try{
    await db.collection('chats').doc(id).set({updatedAt:val},{merge:true});
  }catch(e){}
}

/**
 * Every chat whose `participants` array contains the signed-in uid.
 * Does NOT orderBy updatedAt — Firestore omits docs missing that field.
 * Pages by document id (always present) so old groups/DMs cannot fall off a limit(80).
 */
async function fetchParticipatingChats(){
  const uid=currentUser.uid;
  const base=db.collection('chats').where('participants','array-contains',uid);
  const out=[];
  const seen=new Set();
  const addSnap=(snap)=>{
    (snap?.docs||[]).forEach((d)=>{
      if(seen.has(d.id)) return;
      seen.add(d.id);
      out.push({id:d.id,...(d.data()||{})});
    });
  };

  let scannedAll=false;
  try{
    const idPath=firebase.firestore.FieldPath.documentId();
    let cursor=null;
    for(let i=0;i<Math.ceil(MEMBERSHIP_MAX/MEMBERSHIP_PAGE);i++){
      let q=base.orderBy(idPath).limit(MEMBERSHIP_PAGE);
      if(cursor) q=q.startAfter(cursor);
      const snap=await q.get();
      addSnap(snap);
      if(snap.size<MEMBERSHIP_PAGE){ scannedAll=true; break; }
      cursor=snap.docs[snap.docs.length-1];
      if(out.length>=MEMBERSHIP_MAX){ scannedAll=false; break; }
    }
  }catch(e){
    console.warn('[baithak] membership id-order scan failed', e?.message||e);
    try{
      const snap=await base.limit(MEMBERSHIP_MAX).get();
      addSnap(snap);
      scannedAll=snap.size<MEMBERSHIP_MAX;
    }catch(e2){
      console.warn('[baithak] membership fallback failed', e2?.message||e2);
      throw e2;
    }
  }

  try{
    const created=await base.orderBy('createdAt','desc').limit(100).get();
    addSnap(created);
  }catch(e){}

  return {items:out, scannedAll};
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
 * Inbox load: recency (participants + updatedAt) is FAST but Firestore OMITs
 * any doc missing `updatedAt`. Always union a membership scan (no updatedAt
 * order) plus a device cache so old groups/DMs cannot disappear — now or later.
 * Never treat an empty recency page as “no chats”. Never seed SAMPLE_CHATS.
 */
async function loadBaithakChatsPage({reset=false}={}){
  if(!db||!currentUser||typeof fetchFirestorePage!=='function') return {loaded:0};
  if(baithakChatLoading){
    if(reset) baithakChatLoadQueued={reset:true};
    return {loaded:0,queued:true};
  }
  if(!reset&&!baithakChatHasMore) return {loaded:0};
  baithakChatLoading=true;
  const prevLive=(baithakChats||[]).filter((c)=>!isLiveSampleChat(c));
  const cached=reset?readInboxCache():[];
  const openChat=typeof window!=='undefined'?window.currentOpenChat:null;
  const keepOpen=(list)=>{
    const openId=openChat&&(openChat.firestoreId||openChat.id);
    if(!openChat||!openId||isLiveSampleChat(openChat)) return list;
    if((list||[]).some(c=>(c.firestoreId||c.id)===openId)) return list;
    return [openChat, ...(list||[])];
  };
  const applyList=(incoming, {replaceCache=false}={})=>{
    const withPrev=mergeBaithakInbox(prevLive, incoming);
    baithakChats=pinSelfChat(keepOpen(withPrev));
    if(replaceCache) writeInboxCache(baithakChats);
  };
  let orderedError=null;
  let page={items:[],lastDoc:null,hasMore:false};
  try{
    if(reset){ baithakChatCursor=null; baithakChatHasMore=true; }
    page=await fetchFirestorePage({
      queryBase: db.collection('chats').where('participants','array-contains',currentUser.uid),
      orderField:'updatedAt',
      direction:'desc',
      pageSize: 40,
      cursor: reset?null:baithakChatCursor,
      excludeDeleted:false,
    });
  }catch(e){
    orderedError=e;
    console.warn('[baithak] chat recency page failed', e?.message||e);
  }

  let membershipItems=[];
  let membershipError=null;
  let scannedAll=false;
  if(reset){
    try{
      const mem=await fetchParticipatingChats();
      membershipItems=mem.items||[];
      scannedAll=!!mem.scannedAll;
    }catch(e2){
      membershipError=e2;
    }
  }

  if(orderedError&&membershipError){
    baithakChatLoadError=true;
    if(typeof showToast==='function') showToast('Couldn’t refresh chats.');
    const recovered=mergeBaithakInbox(prevLive, cached);
    baithakChats=pinSelfChat(keepOpen(recovered.length?recovered:(openChat&&!isLiveSampleChat(openChat)?[openChat]:[])));
    baithakChatLoading=false;
    const queuedFail=baithakChatLoadQueued;
    baithakChatLoadQueued=null;
    if(queuedFail) setTimeout(()=>{ loadBaithakChatsPage(queuedFail); }, 0);
    return {loaded:0,error:orderedError};
  }

  try{
    const orderedMapped=(page.items||[]).map(mapChatDoc);
    const membershipMapped=membershipItems.map(mapChatDoc);
    if(reset&&membershipMapped.length>orderedMapped.length&&!baithakInboxGapWarned){
      baithakInboxGapWarned=true;
      console.warn('[baithak] inbox updatedAt page omitted chats', {
        ordered: orderedMapped.length,
        membership: membershipMapped.length,
      });
    }
    let incoming=reset?mergeBaithakInbox(orderedMapped, membershipMapped):orderedMapped;
    if(reset){
      incoming=mergeBaithakInbox(cached.map((c)=>mapChatDoc(c)), incoming);
    }
    applyList(incoming, {replaceCache:reset&&incoming.length>0});
    try{
      await hydrateInboxPeers(incoming);
      if(typeof enrichUsersWithProfileType==='function') await enrichUsersWithProfileType(incoming);
      if(typeof loadBaithakNicknames==='function') await loadBaithakNicknames();
      else if(typeof BaithakSearch!=='undefined'&&typeof BaithakSearch.loadNicknames==='function') await BaithakSearch.loadNicknames();
      if(typeof BaithakSearch!=='undefined'&&typeof BaithakSearch.applyDisplayNames==='function') BaithakSearch.applyDisplayNames(incoming);
      applyList(incoming, {replaceCache:true});
    }catch(hydrateErr){
      console.warn('[baithak] inbox hydrate', hydrateErr?.message||hydrateErr);
    }
    if(reset&&cached.length){
      recoverCachedChatsById(cached)
        .then((recovered)=>{
          if(!recovered.length) return;
          applyList(mergeBaithakInbox(baithakChats, recovered), {replaceCache:true});
          if(typeof setBaithakSection==='function'){
            setBaithakSection(typeof window.baithakSection==='function'?window.baithakSection():baithakSection);
          }else if(typeof renderChatList==='function'){
            renderChatList(baithakChats);
          }
        })
        .catch(()=>{});
    }
    baithakChatLiveMode=true;
    baithakChatLoadError=false;
    const needBackfill=[];
    const seenBackfill=new Set();
    incoming.forEach((c)=>{
      if(!c.missingUpdatedAt) return;
      const id=c.firestoreId||c.id;
      if(!id||seenBackfill.has(id)) return;
      seenBackfill.add(id);
      if(needBackfill.length<40) needBackfill.push(c);
    });
    needBackfill.forEach((c)=>{ ensureChatUpdatedAt(c); });
    if(!orderedError){
      baithakChatCursor=page.lastDoc;
      baithakChatHasMore=!!page.hasMore;
    } else {
      baithakChatHasMore=!scannedAll;
    }
    if(typeof setBaithakSection==='function'){
      try{ setBaithakSection(typeof window.baithakSection==='function'?window.baithakSection():baithakSection); }
      catch(e){ if(typeof renderChatList==='function') renderChatList(baithakChats); }
    }else if(typeof renderChatList==='function'){
      renderChatList(baithakChats);
    }
    return {loaded:incoming.length};
  }catch(e){
    console.warn('[baithak] chat page failed', e?.message||e);
    baithakChatLoadError=true;
    if(typeof showToast==='function') showToast('Couldn’t refresh chats.');
    const recovered=mergeBaithakInbox(prevLive, cached);
    baithakChats=pinSelfChat(keepOpen(recovered.length?recovered:(openChat&&!isLiveSampleChat(openChat)?[openChat]:[])));
    return {loaded:0,error:e};
  }finally{
    baithakChatLoading=false;
    const queued=baithakChatLoadQueued;
    baithakChatLoadQueued=null;
    if(queued){
      setTimeout(()=>{ loadBaithakChatsPage(queued); }, 0);
    }
  }
}

function getBaithakChatsForSearch(q){
  if(typeof BaithakSearch!=='undefined'&&typeof BaithakSearch.filterChatsForSearch==='function'){
    return BaithakSearch.filterChatsForSearch(q);
  }
  const query=(q||'').toLowerCase();
  const base = pinSelfChat(baithakChats);
  if(!query) return base;
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
  return !!(st.friend || st.following || st.status === 'friends' || st.status === 'following');
}

async function setBaithakSection(section) {
  baithakSection = ['sabha', 'sambhavanayein', 'mitra'].includes(section) ? section : 'sabha';
  const panel = document.getElementById('panel-baithak');
  if (panel) panel.dataset.baithakSection = baithakSection;
  if (typeof cleanupModeHeaders === 'function') cleanupModeHeaders();
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
window.rememberInboxChat = rememberInboxChat;
window.forgetInboxChat = forgetInboxChat;
window.migrateDuplicateDmInbox = migrateDuplicateDmInbox;
window.resolveBaithakTitle = resolveBaithakTitle;
window.isGenericDmTitle = isGenericDmTitle;
window.isStubDmId = isStubDmId;
window.mergeBaithakInbox = mergeBaithakInbox;
window.mapChatDoc = mapChatDoc;
window.chatRecencyMs = chatRecencyMs;
window.hydrateInboxFromDeviceCache = hydrateInboxFromDeviceCache;
window.recoverCachedChatsById = recoverCachedChatsById;
window.peerUidOfChat = peerUidOfChat;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    chatFieldMs,
    chatRecencyMs,
    chatInboxId,
    isLiveSampleChat,
    mergeBaithakInbox,
    mapChatDoc,
    hydrateInboxFromDeviceCache,
    recoverCachedChatsById,
    normalizeParticipants,
    peerUidOfChat,
  };
}

