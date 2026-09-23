// ===================== DUNIYA DATA =====================
// D0 truth: guests may see labeled SAMPLE; signed-in prefer live → offline real cache → honest empty / labeled demo.
const SAMPLE_DUNIYA=[
  {id:'d1',isSample:true,user:{name:'India Today',avatar:'📺',uid:'it',profileType:'professional'},type:'image',media:'https://picsum.photos/seed/news1/600/400',caption:'Breaking: Major policy announcement from Union Cabinet. #IndiaToday #News',likes:2847,comments:142,shares:389,timestamp:'2h',tags:[],followed:false,likedByMe:false},
  {id:'d2',isSample:true,user:{name:'Priya Krishnan',avatar:'👩‍🎨',uid:'pk',profileType:'personal'},type:'image',media:'https://picsum.photos/seed/art2/600/600',caption:'My latest artwork inspired by the monsoons 🌧️ What do you think? @ArtLovers #Art #Monsoon',likes:934,comments:67,shares:28,timestamp:'4h',tags:['ArtLovers'],followed:false,likedByMe:false},
  {id:'d3',isSample:true,user:{name:'StartupIndia',avatar:'🚀',uid:'si',profileType:'professional'},type:'video',media:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',thumb:'https://picsum.photos/seed/startupvid/600/800',caption:'5 Indian startups that are changing the world 🌏 Watch till the end! #Startup #India',likes:5201,comments:321,shares:1204,timestamp:'6h',tags:[],followed:false,likedByMe:false},
  {id:'d4',isSample:true,user:{name:'Chef Rahul',avatar:'👨‍🍳',uid:'cr',profileType:'professional'},type:'image',media:'https://picsum.photos/seed/food4/600/500',caption:'Dal makhani recipe that took me 10 years to perfect. Recipe in comments! 🍛 #Food #Recipe',likes:3102,comments:892,shares:1567,timestamp:'8h',tags:[],followed:false,likedByMe:false},
  {id:'d5',isSample:true,user:{name:'Riya Sharma',avatar:'😊',uid:'rs',profileType:'personal'},type:'image',media:'https://picsum.photos/seed/travel5/600/700',caption:'Ladakh calling 🏔️ Nothing compares to this. @Dev_travels #Travel #Ladakh',likes:1204,comments:89,shares:45,timestamp:'1d',tags:['Dev_travels'],followed:true,likedByMe:true},
];

const DUNIYA_FEED_CACHE_PREFIX='chaupaal_duniya_feed_cache_v1';
const DUNIYA_FEED_CACHE_TTL_MS=7*24*60*60*1000;

/** Start empty — avoid SAMPLE flash for signed-in before first fetch (D0). */
let duniyaPosts=[];
let followingSet=new Set();
/** Accepted friends + following (for Vishwa priority) — never SAMPLE uids. */
let duniyaPrioritySet=new Set();
let archiveItems=[];
/** Cursor state for Firestore Duniya feed. */
let duniyaPageCursor=null;
let duniyaHasMore=true;
let duniyaFeedLoading=false;
let duniyaLiveMode=false; // true once a successful Firestore read replaced the pool with real/empty
let duniyaOfflineFromCache=false; // showing last-good real cache after load failure
let duniyaDemoFallback=false; // signed-in showing labeled samples (unavailable / preview)
let duniyaCacheSavedAt=0;
/** Early slots reserved for friends/following before pure recency fill (D2). */
const DUNIYA_VISHWA_PRIORITY_SLOTS=5;

function duniyaIsSignedIn(){
  return typeof currentUser!=='undefined'&&!!currentUser;
}
function duniyaIsDemoPost(p){
  return !!(p&&(p.isSample||p.isDemo||p.id&&String(p.id).match(/^d[1-5]$/)));
}
function labeledDuniyaSamples(){
  return SAMPLE_DUNIYA.map((p)=>({...p,isSample:true,isDemo:true}));
}
function toastDuniyaDemo(){
  if(typeof showToast==='function') showToast('Demo — not saved');
}
function duniyaFeedCacheKey(){
  const uid=(typeof currentUser!=='undefined'&&currentUser?.uid)||'guest';
  return `${DUNIYA_FEED_CACHE_PREFIX}_${uid}`;
}
function writeDuniyaFeedCache(posts){
  const real=(posts||[]).filter((p)=>p&&!duniyaIsDemoPost(p)&&(p.firestoreId||p.id));
  if(!real.length||!duniyaIsSignedIn()) return;
  try{
    const slim=real.slice(0,30).map((p)=>({
      id:p.id,
      firestoreId:p.firestoreId||p.id,
      user:p.user,
      type:p.type,
      media:p.media,
      thumb:p.thumb,
      mediaWidth:p.mediaWidth,
      mediaHeight:p.mediaHeight,
      slides:Array.isArray(p.slides)?p.slides.slice(0,8):[],
      caption:p.caption,
      likes:p.likes,
      comments:p.comments,
      shares:p.shares,
      ts:p.ts,
      timestamp:p.timestamp,
      tags:p.tags||[],
      audience:p.audience||'public',
      archived:!!p.archived,
      uid:p.uid,
      likedByMe:!!p.likedByMe,
    }));
    const savedAt=Date.now();
    localStorage.setItem(duniyaFeedCacheKey(),JSON.stringify({savedAt,posts:slim}));
    duniyaCacheSavedAt=savedAt;
  }catch(e){}
}
function readDuniyaFeedCache(){
  try{
    const raw=JSON.parse(localStorage.getItem(duniyaFeedCacheKey())||'null');
    if(!raw||!Array.isArray(raw.posts)||!raw.posts.length) return null;
    if(Date.now()-(Number(raw.savedAt)||0)>DUNIYA_FEED_CACHE_TTL_MS) return null;
    return {
      savedAt:Number(raw.savedAt)||0,
      posts:raw.posts.map((p)=>({...p,isSample:false,fromCache:true})),
    };
  }catch(e){ return null; }
}
function formatDuniyaCacheAge(savedAt){
  const ms=Math.max(0,Date.now()-(Number(savedAt)||0));
  const mins=Math.round(ms/60000);
  if(mins<2) return 'just now';
  if(mins<60) return `${mins}m ago`;
  const hrs=Math.round(mins/60);
  if(hrs<48) return `${hrs}h ago`;
  return `${Math.round(hrs/24)}d ago`;
}
function applyDuniyaLabeledSamples({fallback=false}={}){
  duniyaPosts=labeledDuniyaSamples();
  followingSet=new Set();
  duniyaPrioritySet=new Set();
  duniyaLiveMode=false;
  duniyaOfflineFromCache=false;
  duniyaDemoFallback=!!fallback;
}
function clearDuniyaDemoFlags(){
  duniyaOfflineFromCache=false;
  duniyaDemoFallback=false;
}
function duniyaPostTs(p){
  const n=Number(p?.ts||p?.createdAtMs||0);
  if(n) return n;
  return 0;
}
/** Priority = accepted friends OR following (or self). Guests/SAMPLE never count. */
function isDuniyaPriorityAuthor(uid, post){
  if(!uid||!duniyaIsSignedIn()) return false;
  if(duniyaIsDemoPost(post)) return false;
  if(uid===currentUser.uid) return true;
  if(duniyaPrioritySet.has(uid)||followingSet.has(uid)) return true;
  if(post?._feedPriority) return true;
  try{
    if(typeof relationshipState==='function'){
      const st=relationshipState(uid);
      return !!(st&&(st.friend||st.following));
    }
  }catch(e){}
  return false;
}
/**
 * D2 Vishwa order: up to N early slots for friends/following (newest first),
 * then remaining loaded posts by recency (includes leftover priority + strangers).
 * Does not hide strangers. Guests/demo: chrono only — no fake friend priority.
 */
function rankDuniyaVishwaFeed(posts){
  const list=(posts||[]).slice();
  if(!list.length) return list;
  const byRecency=(a,b)=>duniyaPostTs(b)-duniyaPostTs(a);
  // Guest or demo-only pool: chronological, never invent friend priority from sample uids
  if(!duniyaIsSignedIn()||list.every((p)=>duniyaIsDemoPost(p))||duniyaDemoFallback){
    return list.sort(byRecency);
  }
  const priority=[];
  const rest=[];
  list.forEach((p)=>{
    if(duniyaIsDemoPost(p)){
      rest.push(p);
      return;
    }
    const uid=p.user?.uid||p.uid;
    if(isDuniyaPriorityAuthor(uid,p)) priority.push(p);
    else rest.push(p);
  });
  priority.sort(byRecency);
  rest.sort(byRecency);
  if(!priority.length) return rest;
  const slots=Math.max(0, Math.min(DUNIYA_VISHWA_PRIORITY_SLOTS, priority.length));
  const head=priority.slice(0,slots);
  const leftover=priority.slice(slots);
  const tail=leftover.concat(rest).sort(byRecency);
  return head.concat(tail);
}
function syncDuniyaPriorityFromStates(states, mapped){
  (mapped||[]).forEach((p)=>{
    const uid=p.user?.uid||p.uid;
    if(!uid||duniyaIsDemoPost(p)) return;
    const st=(states&&states[uid])||(typeof relationshipState==='function'?relationshipState(uid):{})||{};
    p.followed=!!st.following;
    p._isFriend=!!st.friend;
    p._feedPriority=!!(st.friend||st.following)||uid===currentUser?.uid;
    if(st.following) followingSet.add(uid);
    else followingSet.delete(uid);
    if(st.friend||st.following||uid===currentUser?.uid) duniyaPrioritySet.add(uid);
    else duniyaPrioritySet.delete(uid);
  });
}
if(typeof window!=='undefined'){
  window.rankDuniyaVishwaFeed=rankDuniyaVishwaFeed;
  window.isDuniyaPriorityAuthor=isDuniyaPriorityAuthor;
}

function saveToArchive(_item){
  // P3: Hub Archive is Firestore-backed. Legacy chaupaal_archive local writes retired.
}

function loadArchive(){
  try{archiveItems=JSON.parse(localStorage.getItem('chaupaal_archive')||'[]');}catch(e){archiveItems=[];}
}

function mapDuniyaDoc(raw){
  const created=raw.createdAt?.toMillis?.()||raw.createdAt?.toDate?.()?.getTime?.()||raw.ts||null;
  const slides=Array.isArray(raw.slides)?raw.slides:[];
  const first=slides[0]||null;
  const collabUids=Array.isArray(raw.collabUids)?raw.collabUids:[];
  const collabPendingUids=Array.isArray(raw.collabPendingUids)?raw.collabPendingUids:[];
  return {
    id: raw.id,
    firestoreId: raw.id,
    user: raw.user||{name:raw.name||'User',avatar:raw.avatar||'👤',uid:raw.uid},
    type: first?.type||raw.type||(slides.length?first.type:'text'),
    media: first?.media||raw.media||null,
    thumb: first?.thumb||raw.thumb||null,
    mediaPath: raw.mediaPath||first?.mediaPath||null,
    thumbPath: raw.thumbPath||first?.thumbPath||null,
    mediaWidth: Number(first?.width||raw.mediaWidth||raw.width)||null,
    mediaHeight: Number(first?.height||raw.mediaHeight||raw.height)||null,
    slides,
    caption: raw.caption||'',
    likes: raw.likes||0,
    comments: raw.comments||0,
    shares: raw.shares||0,
    timestamp: created?undefined:raw.timestamp,
    ts: created||raw.ts||Date.now(),
    tags: raw.tags||[],
    taggedPeople: Array.isArray(raw.taggedPeople)?raw.taggedPeople:[],
    mentionedUids: Array.isArray(raw.mentionedUids)?raw.mentionedUids:[],
    hashtags: Array.isArray(raw.hashtags)?raw.hashtags:[],
    music: raw.music||null,
    location: raw.location||null,
    hideLikeCount: !!raw.hideLikeCount,
    commentsOff: !!raw.commentsOff,
    followed: false,
    likedByMe: false,
    audience: raw.audience||'public',
    archived: !!raw.archived,
    saveOnly: !!raw.saveOnly,
    collabUids,
    collabPendingUids,
    collabInvites: Array.isArray(raw.collabInvites)?raw.collabInvites:[],
    collabUsers: Array.isArray(raw.collabUsers)?raw.collabUsers:[],
    firstCommentId: raw.firstCommentId||'',
    coverSlideIndex: Number(raw.coverSlideIndex)||0,
    uid: raw.uid,
    deleted: !!raw.deleted,
  };
}
if(typeof window!=='undefined') window.mapDuniyaDoc=mapDuniyaDoc;

async function loadDuniyaPage({reset=false}={}){
  if(!db||typeof fetchFirestorePage!=='function') return {loaded:0};
  if(duniyaFeedLoading) return {loaded:0};
  if(!reset&&!duniyaHasMore) return {loaded:0};
  duniyaFeedLoading=true;
  try{
    if(reset){ duniyaPageCursor=null; duniyaHasMore=true; }
    const page=await fetchFirestorePage({
      queryBase: db.collection('duniya'),
      orderField:'createdAt',
      direction:'desc',
      pageSize: typeof FIRESTORE_PAGE_SIZE==='number'?FIRESTORE_PAGE_SIZE:10,
      cursor: reset?null:duniyaPageCursor,
      excludeDeleted:true,
    });
    const mapped=page.items.map(mapDuniyaDoc).filter(p=>!p.deleted&&p.archived!==true&&!(typeof isSoftDeleted==='function'&&isSoftDeleted(p)));
    if(typeof enrichUsersWithProfileType==='function'){
      await enrichUsersWithProfileType(mapped.map(p=>p.user).filter(Boolean));
    }
    if(typeof hydrateContentLikes==='function') await hydrateContentLikes('duniya',mapped);
    if(typeof hydrateContentSaved==='function'){
      try{ await hydrateContentSaved(mapped,'duniya'); }catch(e){}
    }
    if(typeof loadContentComments==='function'){
      await Promise.all(mapped.map(async(post)=>{
        try{
          const comments = await loadContentComments('duniya', post, { limit:25 });
          if(Array.isArray(comments)){
            post._comments = comments;
            if(typeof enrichCommentAggregates==='function') enrichCommentAggregates(post._comments);
            if(typeof rankCommentsForPreview==='function'){
              post._previewComments = rankCommentsForPreview(post._comments,{ limit:2, viewerUid: currentUser?.uid });
            }
          }
        }catch(e){}
      }));
    }
    if(typeof hydrateRelationships==='function'){
      const states=await hydrateRelationships(mapped.map(p=>p.user?.uid).filter(Boolean));
      syncDuniyaPriorityFromStates(states, mapped);
    }
    if(reset&&mapped.length){
      // Live page wins — clear SAMPLE from memory (D0)
      duniyaLiveMode=true;
      clearDuniyaDemoFlags();
      duniyaPosts=mapped;
      writeDuniyaFeedCache(mapped);
    } else if(mapped.length){
      const realOnly=(duniyaPosts||[]).filter((p)=>!duniyaIsDemoPost(p));
      const seen=new Set(realOnly.map(p=>p.firestoreId||p.id));
      mapped.forEach(p=>{ if(!seen.has(p.firestoreId||p.id)) realOnly.push(p); });
      duniyaPosts=realOnly;
      duniyaLiveMode=true;
      clearDuniyaDemoFlags();
      writeDuniyaFeedCache(duniyaPosts);
    } else if(reset){
      // Empty Firestore: guests keep labeled samples; signed-in → honest empty (Preview demo optional).
      if(duniyaIsSignedIn()){
        duniyaLiveMode=true;
        clearDuniyaDemoFlags();
        duniyaPosts=[];
      } else {
        applyDuniyaLabeledSamples({fallback:false});
      }
    }
    duniyaPageCursor=page.lastDoc;
    duniyaHasMore=page.hasMore;
    return {loaded:mapped.length};
  }catch(e){
    console.warn('[duniya] page load failed', e);
    if(reset){
      const cached=duniyaIsSignedIn()?readDuniyaFeedCache():null;
      if(cached?.posts?.length){
        duniyaPosts=cached.posts;
        duniyaCacheSavedAt=cached.savedAt;
        duniyaLiveMode=false;
        duniyaOfflineFromCache=true;
        duniyaDemoFallback=false;
      } else if(duniyaIsSignedIn()){
        // No real cache — labeled samples + Retry banner (never Sign-in CTA)
        applyDuniyaLabeledSamples({fallback:true});
      } else {
        applyDuniyaLabeledSamples({fallback:false});
      }
      if(typeof showToast==='function'){
        showToast(
          duniyaOfflineFromCache
            ? (typeof t==='function'?t('duniya_offline_cache','Showing last saved posts — offline'):'Showing last saved posts — offline')
            : (typeof friendlyError==='function'?friendlyError(e):(typeof t==='function'?t('duniya_feed_fail'):'Could not load feed'))
        );
      }
    }
    return {loaded:0,error:e};
  }finally{
    duniyaFeedLoading=false;
  }
}

// ===================== DUNIYA INIT =====================
function initDuniya(){
  const screen=document.getElementById('duniyaScreen');
  if(!screen)return;
  if(screen.dataset.loaded){
    // Tab revisited after login — pull live pages if we haven't yet.
    if(db&&currentUser&&!duniyaLiveMode){
      loadDuniyaPage({reset:true}).then(()=>renderDuniyaFeed());
    }
    return;
  }
  screen.dataset.loaded='1';
  loadArchive();
  renderDuniyaStories();
  // Hydrate from Firestore when signed in; guests get labeled samples (no SAMPLE flash for signed-in).
  if(db&&duniyaIsSignedIn()){
    const feed=document.getElementById('duniyaFeed');
    if(typeof renderSkeleton==='function'&&feed) renderSkeleton(feed,{variant:'feed',count:2});
    else if(feed) feed.innerHTML='<div class="discovery-loading" style="padding:16px;text-align:center;">Loading Duniya…</div>';
    loadDuniyaPage({reset:true}).then(()=>renderDuniyaFeed());
  } else {
    applyDuniyaLabeledSamples({fallback:false});
    renderDuniyaFeed();
  }
  document.getElementById('duniyaPostBtn')?.addEventListener('click',openDuniyaPostSheet);
  const runDuniyaSearch = () => {
    if (typeof openUniversalSearch === 'function') openUniversalSearch({ types: ['users', 'posts', 'groups'] });
    else if (typeof showToast === 'function') showToast(t('duniya_search_unavailable') || 'Search is temporarily unavailable');
  };
  document.getElementById('duniyaSearchBtn')?.addEventListener('click', runDuniyaSearch);
  document.getElementById('duniyaInlineSearch')?.remove();
  // Chaupaal search lives under Peepal morph #5 — no Duniya top search bar.
}

async function renderDuniyaStories(){
  if(typeof DuniyaStory!=='undefined' && typeof DuniyaStory.renderStrip==='function'){
    return DuniyaStory.renderStrip();
  }
}

function openDuniyaStoryAddSheet(){
  if(typeof DuniyaStory!=='undefined' && typeof DuniyaStory.startCreate==='function'){
    DuniyaStory.startCreate();
  }
}

function renderDuniyaDemoBanner(feed){
  if(!feed)return;
  const signedIn=duniyaIsSignedIn();
  const showingSamples=(duniyaPosts||[]).some((p)=>duniyaIsDemoPost(p));
  const showOffline=duniyaOfflineFromCache&&!showingSamples;
  const showDemo=showingSamples&&(!duniyaLiveMode||duniyaDemoFallback);
  if(!showOffline&&!showDemo)return;
  // Live real feed — no demo banner
  if(duniyaLiveMode&&!showingSamples&&!duniyaOfflineFromCache)return;
  try{if(sessionStorage.getItem('chaupaal_duniya_demo_dismissed')==='1'&&showDemo&&!signedIn)return;}catch(e){}
  const existing=feed.querySelector('.duniya-demo-banner');
  if(existing) existing.remove();
  const banner=document.createElement('div');
  banner.className='duniya-demo-banner';
  banner.setAttribute('role','status');
  if(showOffline){
    const age=formatDuniyaCacheAge(duniyaCacheSavedAt);
    banner.innerHTML=`<span class="duniya-demo-banner-text">Offline · last updated ${duniyaEsc(age)}</span>
      <button type="button" class="btn btn--primary duniya-demo-banner-cta" data-duniya-demo-retry>Retry</button>
      <button type="button" class="duniya-demo-banner-dismiss" data-duniya-demo-dismiss aria-label="Dismiss">×</button>`;
  } else if(signedIn){
    banner.innerHTML=`<span class="duniya-demo-banner-text">Showing demo while feed is unavailable</span>
      <button type="button" class="btn btn--primary duniya-demo-banner-cta" data-duniya-demo-retry>Retry</button>
      <button type="button" class="duniya-demo-banner-dismiss" data-duniya-demo-dismiss aria-label="Dismiss">×</button>`;
  } else {
    banner.innerHTML=`<span class="duniya-demo-banner-text">Sample — sign in to see your real feed</span>
      <button type="button" class="btn btn--primary duniya-demo-banner-cta" data-duniya-demo-signin>Sign in</button>
      <button type="button" class="duniya-demo-banner-dismiss" data-duniya-demo-dismiss aria-label="Dismiss">×</button>`;
  }
  banner.querySelector('[data-duniya-demo-signin]')?.addEventListener('click',()=>{
    if(typeof openAuthSheet==='function')openAuthSheet('login');
    else if(typeof showAuth==='function')showAuth();
    else if(typeof showToast==='function')showToast('Sign in from the menu');
  });
  banner.querySelector('[data-duniya-demo-retry]')?.addEventListener('click',()=>{
    if(typeof renderSkeleton==='function') renderSkeleton(feed,{variant:'feed',count:2});
    loadDuniyaPage({reset:true}).then(()=>renderDuniyaFeed());
  });
  banner.querySelector('[data-duniya-demo-dismiss]')?.addEventListener('click',()=>{
    try{sessionStorage.setItem('chaupaal_duniya_demo_dismissed','1');}catch(e){}
    banner.remove();
  });
  feed.insertBefore(banner,feed.firstChild);
}

function renderDuniyaPriorityHint(feed){
  if(!feed||!duniyaIsSignedIn()||duniyaDemoFallback||!duniyaLiveMode) return;
  const hasPriority=[...duniyaPrioritySet].some((uid)=>uid&&uid!==currentUser?.uid);
  if(!hasPriority) return;
  try{ if(sessionStorage.getItem('chaupaal_duniya_priority_hint')==='1') return; }catch(e){}
  if(feed.querySelector('.duniya-priority-hint')) return;
  const hint=document.createElement('div');
  hint.className='duniya-priority-hint';
  hint.setAttribute('role','status');
  hint.innerHTML=`<span class="duniya-priority-hint-text">Showing people you follow first</span>
    <button type="button" class="duniya-priority-hint-dismiss" aria-label="Dismiss">×</button>`;
  hint.querySelector('.duniya-priority-hint-dismiss')?.addEventListener('click',()=>{
    try{ sessionStorage.setItem('chaupaal_duniya_priority_hint','1'); }catch(e){}
    hint.remove();
  });
  feed.insertBefore(hint, feed.firstChild);
}

function renderDuniyaFeed(){
  const feed=document.getElementById('duniyaFeed');if(!feed)return;
  const visible=duniyaPosts.filter(p=>!(typeof isSoftDeleted==='function'?isSoftDeleted(p):p.deleted)).filter(p=>p.archived!==true);
  feed.innerHTML='';
  if(!visible.length){
    if(typeof renderEmptyState==='function'){
      const signedIn=duniyaIsSignedIn();
      renderEmptyState(feed, {
        icon: (typeof TabElements!=='undefined'&&TabElements.markHtml)?TabElements.markHtml('duniya',40):(typeof iconHtml==='function'?iconHtml('globe',{size:40,className:'cp-icon--empty'}):'🌍'),
        title:'No posts yet',
        message: signedIn
          ? 'Share a moment, or explore while the feed fills up.'
          : 'Browse freely — sign in when you want to post.',
        actionLabel: signedIn ? 'Create a post' : 'Sign in to post',
        onAction:()=>{
          if(!signedIn){
            try{
              if(typeof stashPendingAction==='function') stashPendingAction('duniya_compose');
              else if(typeof ChaupaalReferrals?.stashPendingAction==='function') ChaupaalReferrals.stashPendingAction('duniya_compose');
              if(typeof stashPendingDeepLink==='function') stashPendingDeepLink();
            }catch(e){}
            if(typeof openAuthSheet==='function') openAuthSheet('login');
            else if(typeof showAuth==='function') showAuth();
            return;
          }
          if(typeof openDuniyaPostSheet==='function') openDuniyaPostSheet();
        },
        secondaryActions: [
          ...(signedIn
            ? [{
                label: 'Preview demo',
                onAction: () => {
                  applyDuniyaLabeledSamples({ fallback: true });
                  renderDuniyaFeed();
                },
              }]
            : []),
          { label:'Play Akhbaar', onAction:()=>{ if(typeof showTab==='function') showTab('akhbaar'); } },
        ],
      });
    } else {
      feed.innerHTML='<div style="padding:32px;text-align:center;color:var(--muted);">No posts yet</div>';
    }
    return;
  }
  // D2: re-rank full loaded set each paint (stable within groups by recency)
  const ordered=rankDuniyaVishwaFeed(visible);
  if(duniyaLiveMode&&!duniyaDemoFallback&&!ordered.some((p)=>duniyaIsDemoPost(p))){
    // Keep in-memory order aligned so load-more appends then re-rank cleanly
    const archived=(duniyaPosts||[]).filter((p)=>p.archived===true||(typeof isSoftDeleted==='function'?isSoftDeleted(p):p.deleted));
    duniyaPosts=ordered.concat(archived);
  }
  ordered.forEach(post=>feed.appendChild(createDuniyaPost(post)));
  renderDuniyaDemoBanner(feed);
  renderDuniyaPriorityHint(feed);
  if(typeof enhanceMediaIn==='function') enhanceMediaIn(feed);
  if(typeof mountMusicCards==='function') mountMusicCards(feed);
  if(typeof mountLocationCards==='function') mountLocationCards(feed);
  try{
    if(typeof observeFeedImpressions==='function'){
      if(window.__duniyaImpressionStop) window.__duniyaImpressionStop();
      feed.querySelectorAll('.duniya-post, [data-post-id]').forEach((el,i)=>{
        const id=el.dataset.postId||el.dataset.id;
        if(id){ el.setAttribute('data-id', id); el.dataset.pos=String(i); }
      });
      window.__duniyaImpressionStop=observeFeedImpressions(feed,{ surface:'duniya', idAttr:'data-id', objType:'post' });
    }
  }catch(e){}
  if(duniyaLiveMode&&duniyaHasMore&&typeof ensureLoadMoreButton==='function'){
    ensureLoadMoreButton(feed,{
      label:'Load more posts',
      onLoadMore:async()=>{
        await loadDuniyaPage({reset:false});
        renderDuniyaFeed();
      },
    });
    if(typeof setLoadMoreVisible==='function') setLoadMoreVisible(feed,true);
  }
}

function duniyaEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function duniyaSlidesOf(post){
  if(Array.isArray(post.slides)&&post.slides.length) return post.slides;
  if(post.media){
    return [{
      type: post.type||'image',
      media: post.media,
      thumb: post.thumb||post.media,
      width: post.mediaWidth||post.width||0,
      height: post.mediaHeight||post.height||0,
      alt: post.alt||'',
      poster: post.poster||'',
    }];
  }
  return [];
}

function duniyaCanEditPost(post){
  const me=typeof currentUser!=='undefined'?currentUser?.uid:'';
  if(!me||!post) return false;
  if(post.uid===me||post.user?.uid===me) return true;
  return Array.isArray(post.collabUids)&&post.collabUids.includes(me);
}

function duniyaViewerOwns(post){
  const me=typeof currentUser!=='undefined'?currentUser?.uid:'';
  return !!(me&&(post.uid===me||post.user?.uid===me||(Array.isArray(post.collabUids)&&post.collabUids.includes(me))));
}

function duniyaDecorateCaption(post){
  const raw=duniyaEsc(post.caption||'');
  return raw
    .replace(/@([A-Za-z0-9_.]{2,40})/g,'<button type="button" class="duniya-post-tag" data-mention="$1">@$1</button>')
    .replace(/#([A-Za-z0-9_]{1,40})/g,'<button type="button" class="duniya-hashtag" data-hashtag="$1">#$1</button>');
}

function duniyaMediaHtml(slide, post, variant){
  if(!slide) return '';
  const imgSrc=typeof mediaUrlFor==='function'?mediaUrlFor({media:slide.media,thumb:slide.thumb}, variant):(slide.thumb||slide.media);
  const w=Number(slide.width)||0;
  const h=Number(slide.height)||0;
  const alt=duniyaEsc(slide.alt||('Post by '+(post.user?.name||'')));
  const ratio=w>0&&h>0?` style="aspect-ratio:${w}/${h};"`:'';
  if(slide.type==='video'){
    const poster=slide.poster?` poster="${duniyaEsc(slide.poster)}"`:'';
    return `<video src="${duniyaEsc(slide.media||'')}"${poster} playsinline preload="metadata" ${variant==='list'?'muted':''} controls></video>`;
  }
  if(slide.type==='gif'){
    return `<img data-no-zoom="1" src="${duniyaEsc(slide.media||imgSrc)}" alt="${alt}"${ratio} class="duniya-gif">`;
  }
  return `<img data-no-zoom="1" src="${duniyaEsc(imgSrc)}" loading="lazy" decoding="async" alt="${alt}"${ratio} ${variant==='list'&&slide.media&&slide.media!==imgSrc?`data-full="${duniyaEsc(slide.media)}"`:''}>`;
}

function duniyaStageMaxH(){
  const stage=document.querySelector('.device')||document.getElementById('device');
  const h=stage?.clientHeight||window.innerHeight||640;
  return Math.round(h*0.8);
}

function bindDuniyaCarousel(el, post, slides){
  const wrap=el.querySelector('.duniya-carousel');
  if(!wrap||slides.length<2) return;
  let idx=0;
  const track=wrap.querySelector('.duniya-carousel-track');
  const count=wrap.querySelector('.duniya-carousel-count');
  const dots=wrap.querySelectorAll('.duniya-carousel-dots span');
  const apply=()=>{
    const slide=slides[idx]||slides[0];
    const w=Number(slide.width)||1;
    const h=Number(slide.height)||1;
    const maxH=duniyaStageMaxH();
    const minH=Math.min(wrap.clientWidth||300, maxH);
    let height=Math.round((wrap.clientWidth||300)*h/w);
    height=Math.max(Math.min(minH, maxH), Math.min(height, maxH));
    wrap.style.height=height+'px';
    wrap.style.setProperty('--media-ratio', `${w}/${h}`);
    if(track) track.style.transform=`translateX(-${idx*100}%)`;
    if(count) count.textContent=`${idx+1}/${slides.length}`;
    dots.forEach((d,i)=>d.classList.toggle('is-on', i===idx));
    wrap.dataset.index=String(idx);
  };
  apply();
  let startX=0, startY=0, dragging=false;
  wrap.addEventListener('pointerdown',(e)=>{ dragging=true; startX=e.clientX; startY=e.clientY; });
  wrap.addEventListener('pointerup',(e)=>{
    if(!dragging) return;
    dragging=false;
    const dx=e.clientX-startX;
    const dy=e.clientY-startY;
    if(Math.abs(dx)<40||Math.abs(dx)<Math.abs(dy)) return;
    if(dx<0&&idx<slides.length-1) idx+=1;
    else if(dx>0&&idx>0) idx-=1;
    apply();
  });
  wrap.addEventListener('dblclick',(e)=>{
    e.preventDefault();
    el.querySelector('.like-btn')?.click();
  });
}

function duniyaHeartIcon(){
  return`<svg class="duniya-heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.2-4.35-9.55-8.55C.5 8.95 2.35 4.5 6.4 4.5c2.25 0 3.75 1.3 4.6 2.55.85-1.25 2.35-2.55 4.6-2.55 4.05 0 5.9 4.45 3.95 7.95C19.2 16.65 12 21 12 21Z"/></svg>`;
}

function createDuniyaPost(post, {variant='list'}={}){
  const el=document.createElement('div');el.className='duniya-post'+(variant==='tile'?' duniya-post--tile':'')+(post.isSample?' duniya-post--demo':'');el.dataset.id=post.id;
  if(post.isSample) el.dataset.demo='1';
  const slides=duniyaSlidesOf(post);
  const cover=slides[post.coverSlideIndex||0]||slides[0];
  if(variant==='tile'){
    const imgSrc=typeof mediaUrlFor==='function'?mediaUrlFor(cover||post,'tile'):(cover?.thumb||cover?.media||post.thumb||post.media);
    const caption=duniyaEsc((post.caption||'').slice(0,80));
    el.innerHTML=`
      <div class="duniya-post-media" style="min-height:100px;">
        ${cover
          ?(cover.type==='video'
            ?`<video src="${duniyaEsc(cover.media||'')}" muted playsinline preload="metadata" poster="${duniyaEsc(cover.poster||cover.thumb||'')}"></video>`
            :`<img data-no-zoom="1" src="${duniyaEsc(imgSrc)}" loading="lazy" decoding="async" alt="">`)
          :`<div class="duniya-post-text-hero">${caption||'Post'}</div>`}
      </div>
      <div class="duniya-post-likes" style="padding:6px 8px;font-size:11px;">${formatCount(post.likes||0)} · ${caption}</div>`;
    el.addEventListener('click',()=>{
      if(typeof openDuniyaDetail==='function') openDuniyaDetail(post);
      else if(typeof openDuniyaComments==='function') openDuniyaComments(post.id);
    });
    return el;
  }
  const isFollowing=followingSet.has(post.user.uid);
  const caption=duniyaDecorateCaption(post);
  const me=typeof currentUser!=='undefined'?currentUser?.uid:'';
  const own=duniyaViewerOwns(post);
  const previewTotal = Math.max(Number(post.comments)||0, Array.isArray(post._comments) ? post._comments.filter((c)=>!c.deleted).length : 0);
  if(typeof enrichCommentAggregates==='function' && Array.isArray(post._comments)) enrichCommentAggregates(post._comments);
  if(typeof rankCommentsForPreview==='function' && Array.isArray(post._comments)) post._previewComments = rankCommentsForPreview(post._comments,{ limit:2, viewerUid: currentUser?.uid });
  const previewHtml = post.commentsOff && !own
    ? ''
    : (typeof renderFeedCommentsPreviewHtml==='function'
      ? renderFeedCommentsPreviewHtml(post._comments||[], post._previewComments||[], {
          prefix:'duniya',
          totalCount: previewTotal,
          showEmpty: previewTotal===0 && own,
          postId: post.firestoreId || post.id,
        })
      : '');
  const locName=post.location?.placeName||post.location?.label||'';
  const audienceLabel=post.archived?'Archive':(post.audience==='public'||!post.audience?'Everyone':post.audience);
  const names=[post.user?.name].concat((post.collabUsers||[]).map((u)=>u.name).filter(Boolean));
  const headerName=names.length>1
    ? names.map((n)=>duniyaEsc(n)).join(' & ')
    :(typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(post.user.name,post.user):duniyaEsc(post.user.name));
  const first=slides[0];
  const w=Number(first?.width||post.mediaWidth||post.width)||0;
  const h=Number(first?.height||post.mediaHeight||post.height)||0;
  const hasMediaSize=w>0&&h>0;
  const isReel=first&&first.type==='video'&&h>0&&w>0&&h/w>=1.2;
  const mediaWrapAttrs=hasMediaSize?` data-has-ratio="1" class="duniya-post-media duniya-post-media--ratio${isReel?' duniya-post-media--reel':''}" style="--media-ratio:${isReel?'9/16':`${w}/${h}`};max-height:${duniyaStageMaxH()}px;"`:` class="duniya-post-media${isReel?' duniya-post-media--reel':''}"`;
  let mediaBlock='';
  if(!slides.length){
    mediaBlock=`<div class="duniya-post-text-hero">${duniyaEsc(post.caption||'')}</div>`;
  } else if(slides.length===1){
    mediaBlock=`<div${mediaWrapAttrs}>${duniyaMediaHtml(slides[0],post,variant)}${post.taggedPeople?.length?`<button type="button" class="duniya-tags-hint" data-show-tags>Tags</button>`:''}</div>`;
  } else {
    mediaBlock=`<div class="duniya-carousel" data-has-ratio="1"${hasMediaSize?` style="--media-ratio:${w}/${h};"`:''}>
      <div class="duniya-carousel-track">${slides.map((s)=>`<div class="duniya-carousel-slide">${duniyaMediaHtml(s,post,variant)}</div>`).join('')}</div>
      <div class="duniya-carousel-count">1/${slides.length}</div>
    </div>
    <div class="duniya-carousel-dots">${slides.map((_,i)=>`<span${i===0?' class="is-on"':''}></span>`).join('')}</div>`;
  }
  const pendingInvite=Array.isArray(post.collabPendingUids)&&post.collabPendingUids.includes(me);
  const hideLikes=post.hideLikeCount&&!own;
  el.innerHTML=`
    ${pendingInvite?`<div class="duniya-collab-banner" data-collab-banner><span>Collaborate on this post?</span><button type="button" data-collab="accept">Accept</button><button type="button" data-collab="decline">Decline</button></div>`:''}
    <div class="duniya-post-header${post.user?.profileTheme?.accent ? ' cp-author-accent dp-themed' : ''}"${post.user?.profileTheme?.accent ? ` style="--dp-accent:${duniyaEsc(post.user.profileTheme.accent)}"` : ''}>
      <div class="duniya-post-avatar">${typeof duniyaUserAvatarHtml==='function'?duniyaUserAvatarHtml(post.user):`<span>${duniyaEsc(post.user.avatar||'👤')}</span>`}</div>
      <div class="duniya-post-user">
        <div class="duniya-post-name">${headerName}${post.isSample?` <span class="cp-demo-badge">Demo</span>`:''}</div>
        <div class="duniya-post-meta">${post.isSample?'Sample · ':''}${duniyaEsc(typeof formatRelativeTime==='function'?formatRelativeTime(post.ts||post.timestamp):post.timestamp)} · <span class="cp-tab-mark" data-tab-mark="duniya" aria-hidden="true"></span> ${duniyaEsc(audienceLabel)}${locName?` · <button type="button" class="duniya-loc-line" data-loc>${duniyaEsc(locName)}</button>`:''}</div>
      </div>
      <button class="duniya-follow-btn ${isFollowing?'following':''}" data-uid="${duniyaEsc(post.user.uid)}" aria-label="${isFollowing?'Unfollow':'Follow'} ${duniyaEsc(post.user.name)}">${isFollowing?'Following':'Follow'}</button>
      ${own?`<button type="button" class="duniya-delete-btn" title="Delete" aria-label="Delete post" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;">${typeof iconHtml==='function'?iconHtml('trash',{size:16}):'🗑️'}</button>`:''}
      <button type="button" class="duniya-more-btn" aria-label="More options">${typeof iconHtml==='function'?iconHtml('more-vertical',{size:20}):'⋮'}</button>
    </div>
    ${mediaBlock}
    ${post.music?(typeof renderMusicCard==='function'?`<div class="duniya-music-pill">${renderMusicCard(post.music,{variant:'chat'})}</div>`:`<button type="button" class="duniya-music-pill" data-music-card data-music-title="${duniyaEsc(post.music.title||'')}" data-music-artist="${duniyaEsc(post.music.artist||'')}" data-music-preview="${duniyaEsc(post.music.previewUrl||'')}" data-music-source="${duniyaEsc(post.music.source||'none')}" data-music-thumb="${duniyaEsc(post.music.thumbnail||'')}"><span aria-hidden="true">♪</span> ${duniyaEsc(post.music.title||'Music')}</button>`):''}
    <div class="duniya-post-actions">
      <button class="duniya-action-btn like-btn ${post.likedByMe?'liked':''}" data-id="${post.id}" aria-label="Like this post" aria-pressed="${post.likedByMe?'true':'false'}">${duniyaHeartIcon()}</button>
      <button class="duniya-action-btn comment-btn" data-id="${post.id}" aria-label="Open comments">${typeof iconHtml==='function'?iconHtml('message-circle',{size:22}):'<span aria-hidden="true">💬</span>'}</button>
      <button class="duniya-action-btn share-btn" data-id="${post.id}" aria-label="Share post">${typeof iconHtml==='function'?iconHtml('share',{size:22}):'<span aria-hidden="true">↗</span>'}</button>
      <button class="duniya-action-btn duniya-bookmark-btn ${post.savedByMe?'saved':''}" data-id="${post.id}" aria-label="Save post" aria-pressed="${post.savedByMe?'true':'false'}">${typeof iconHtml==='function'?iconHtml('bookmark',{size:22}):'<span aria-hidden="true">🔖</span>'}</button>
    </div>
    ${hideLikes?'':`<div class="duniya-post-likes${(post.likes||0)?' is-tappable':''}" role="${(post.likes||0)?'button':''}" tabindex="${(post.likes||0)?'0':''}">${formatCount(post.likes||0)} likes</div>`}
    ${slides.length?`<div class="duniya-post-caption-row">
      <div class="duniya-post-caption"><strong class="duniya-post-name">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(post.user.name,post.user):duniyaEsc(post.user.name)}</strong> ${caption}</div>
      ${post.caption?`<button type="button" class="duniya-caption-speak" title="Listen to caption" aria-label="Listen to caption">${typeof iconHtml==='function'?iconHtml('volume',{size:16}):'🔊'}</button>`:''}
    </div>`:''}
    ${previewHtml}
    ${previewTotal>0&&!post.commentsOff?`<div class="duniya-view-comments">View all ${previewTotal} comments</div>`:(previewTotal>0&&own?`<div class="duniya-view-comments">View comments</div>`:'')}
  `;
  if(typeof wireIdentityTaps==='function'){
    wireIdentityTaps(el,post.user,{
      avatarSel:'.duniya-post-avatar',
      nameSel:'.duniya-post-user > .duniya-post-name, .duniya-post-caption > .duniya-post-name',
      context:'duniya',
    });
  } else {
    const postAvatar=el.querySelector('.duniya-post-avatar');
    if(typeof bindProfileLongPress==='function') bindProfileLongPress(postAvatar,post.user);
    postAvatar?.addEventListener('click',()=>{
      if(typeof tapAvatarFromFeed==='function') tapAvatarFromFeed(post.user,{context:'duniya'});
      else if(typeof openPublicProfile==='function') openPublicProfile(post.user,{uid:post.user.uid,username:post.user.username,context:'duniya'});
    });
  }

  // Like — optimistic (UI first, rate-limit/persist after). Samples = local Demo only (D0).
  const likeBtn=el.querySelector('.like-btn');
  likeBtn?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    const p = duniyaPosts.find((x) => x.id === post.id);
    if (!p) {
      delete btn.dataset.busy;
      return;
    }
    const prevLiked = !!p.likedByMe;
    const prevLikes = p.likes;
    const apply = () => {
      p.likedByMe = !prevLiked;
      p.likes = prevLikes + (p.likedByMe ? 1 : -1);
      post.likedByMe = p.likedByMe;
      post.likes = p.likes;
      btn.classList.toggle('liked', p.likedByMe);
      btn.setAttribute('aria-pressed', p.likedByMe ? 'true' : 'false');
      el.querySelector('.duniya-post-likes') && (el.querySelector('.duniya-post-likes').textContent = `${formatCount(p.likes)} likes`);
      if (p.likedByMe && typeof SoundLib !== 'undefined' && SoundLib.like) SoundLib.like();
      if (p.likedByMe && typeof haptic === 'function') haptic('light');
    };
    const revert = () => {
      p.likedByMe = prevLiked;
      p.likes = prevLikes;
      post.likedByMe = prevLiked;
      post.likes = prevLikes;
      btn.classList.toggle('liked', prevLiked);
      btn.setAttribute('aria-pressed', prevLiked ? 'true' : 'false');
      el.querySelector('.duniya-post-likes') && (el.querySelector('.duniya-post-likes').textContent = `${formatCount(prevLikes)} likes`);
    };
    if (duniyaIsDemoPost(p)) {
      apply();
      toastDuniyaDemo();
      delete btn.dataset.busy;
      return;
    }
    try {
      if (typeof runOptimistic === 'function') {
        await runOptimistic({
          apply,
          revert,
          commit: async () => {
            if (typeof assertRateLimit === 'function') await assertRateLimit('like');
            if (typeof toggleContentLike === 'function') {
              const saved = await toggleContentLike('duniya', p);
              if (saved.persisted) {
                p.likedByMe = saved.liked;
                p.likes = saved.likes;
                post.likedByMe = saved.liked;
                post.likes = saved.likes;
                btn.classList.toggle('liked', saved.liked);
                btn.setAttribute('aria-pressed', saved.liked ? 'true' : 'false');
                el.querySelector('.duniya-post-likes') && (el.querySelector('.duniya-post-likes').textContent = `${formatCount(saved.likes)} likes`);
              } else {
                revert();
                if (typeof showToast === 'function') {
                  showToast('Could not save like — try again');
                }
              }
            }
          },
          errorToast: typeof friendlyError === 'function' ? undefined : 'Could not save like',
        });
      } else {
        apply();
        if (typeof toggleContentLike === 'function') {
          try {
            const saved = await toggleContentLike('duniya', p);
            if (!saved.persisted) revert();
            else {
              p.likedByMe = saved.liked;
              p.likes = saved.likes;
            }
          } catch (err) {
            revert();
            if (typeof showToast === 'function') {
              showToast(typeof friendlyError === 'function' ? friendlyError(err) : 'Could not save like');
            }
          }
        }
      }
    } finally {
      delete btn.dataset.busy;
    }
  });

  const likesEl=el.querySelector('.duniya-post-likes');
  if(likesEl && !hideLikes && (post.likes||0)>0){
    likesEl.addEventListener('click',(e)=>{
      e.stopPropagation();
      openDuniyaPostLikers(post);
    });
    likesEl.addEventListener('keydown',(e)=>{
      if(e.key==='Enter'||e.key===' '){
        e.preventDefault();
        openDuniyaPostLikers(post);
      }
    });
  }

  // Save / unsave — Demo posts stay local-only (D0)
  const bookmarkBtn = el.querySelector('.duniya-bookmark-btn');
  bookmarkBtn?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    const p = duniyaPosts.find((x) => x.id === post.id) || post;
    const prev = !!p.savedByMe;
    btn.classList.toggle('saved', !prev);
    btn.setAttribute('aria-pressed', !prev ? 'true' : 'false');
    p.savedByMe = !prev;
    post.savedByMe = !prev;
    if (duniyaIsDemoPost(p)) {
      toastDuniyaDemo();
      delete btn.dataset.busy;
      return;
    }
    try {
      if (typeof toggleContentSaved === 'function') {
        const saved = await toggleContentSaved('duniya', p);
        if (saved.persisted) {
          p.savedByMe = saved.saved;
          post.savedByMe = saved.saved;
          btn.classList.toggle('saved', saved.saved);
          btn.setAttribute('aria-pressed', saved.saved ? 'true' : 'false');
          if (typeof showToast === 'function') showToast(saved.saved ? 'Saved' : 'Removed from saved');
        } else {
          p.savedByMe = prev;
          post.savedByMe = prev;
          btn.classList.toggle('saved', prev);
          btn.setAttribute('aria-pressed', prev ? 'true' : 'false');
          if (typeof showToast === 'function') showToast('Could not save');
        }
      }
    } catch (err) {
      p.savedByMe = prev;
      post.savedByMe = prev;
      btn.classList.toggle('saved', prev);
      btn.setAttribute('aria-pressed', prev ? 'true' : 'false');
      if (typeof showToast === 'function') showToast(err?.message || 'Could not save');
    } finally {
      delete btn.dataset.busy;
    }
  });

  el.querySelector('.duniya-caption-speak')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const text = [post.user?.name, post.caption].filter(Boolean).join('. ');
    if (typeof speakText === 'function') speakText(text, e.currentTarget);
  });

  // Feed media: tap=viewer, double-tap=like, long-press=comments
  const mediaWrap=el.querySelector('.duniya-post-media');
  const mediaImg=mediaWrap?.querySelector('img');
  if(mediaWrap&&variant==='list'){
    if(mediaImg){
      mediaImg.setAttribute('data-no-zoom','1');
      mediaImg.classList.remove('cp-zoomable');
      delete mediaImg.dataset.zoomBound;
    }
    const likeFromMedia=()=>{
      if(!post.likedByMe&&!likeBtn.dataset.busy) likeBtn.click();
      mediaWrap.querySelector('.duniya-double-like-heart')?.remove();
      const heart=document.createElement('div');
      heart.className='duniya-double-like-heart';
      heart.setAttribute('aria-hidden','true');
      heart.textContent='♥';
      mediaWrap.appendChild(heart);
      setTimeout(()=>heart.remove(),650);
    };
    const openViewer=()=>{
      if(typeof openImageViewer==='function'&&mediaImg){
        openImageViewer(mediaImg.dataset.full||post.media||mediaImg.currentSrc||mediaImg.src,{alt:mediaImg.alt||''});
      }
    };
    const openComments=()=>{
      if(post.commentsOff&&!duniyaViewerOwns(post)){
        if(typeof showToast==='function') showToast('Comments are off');
        return;
      }
      openDuniyaDetail(post);
    };
    // Gesture arbitration: single tap=viewer, double tap=like, long press=comments
    let tapTimer=null, lastTap=0, longPressTimer=null, touchMoved=false;
    const DOUBLE_TAP_MS=280, LONG_PRESS_MS=480;
    // Pointer-based long-press (works for touch and mouse)
    mediaWrap.addEventListener('pointerdown',(e)=>{
      if(e.target.closest('.duniya-tags-hint')) return;
      touchMoved=false;
      longPressTimer=setTimeout(()=>{
        if(!touchMoved){
          longPressTimer=null;
          openComments();
        }
      },LONG_PRESS_MS);
    });
    const cancelLong=()=>{ clearTimeout(longPressTimer); longPressTimer=null; };
    mediaWrap.addEventListener('pointermove',(e)=>{
      if(Math.abs(e.movementX||0)+Math.abs(e.movementY||0)>6){ touchMoved=true; cancelLong(); }
    });
    mediaWrap.addEventListener('pointercancel',cancelLong);
    // Click arbitration for single vs double tap
    mediaWrap.addEventListener('click',(e)=>{
      if(e.target.closest('.duniya-tags-hint')) return;
      cancelLong();
      const now=Date.now();
      if(now-lastTap<DOUBLE_TAP_MS){
        clearTimeout(tapTimer); tapTimer=null;
        lastTap=0;
        likeFromMedia();
        return;
      }
      lastTap=now;
      clearTimeout(tapTimer);
      tapTimer=setTimeout(()=>{ tapTimer=null; openViewer(); }, DOUBLE_TAP_MS+20);
    });
    // dblclick for non-touch (desktop)
    mediaWrap.addEventListener('dblclick',(e)=>{
      if(e.target.closest('.duniya-tags-hint')) return;
      clearTimeout(tapTimer); tapTimer=null;
      likeFromMedia();
    });
  }

  // Follow / unfollow — optimistic; unfollow uses Undo toast
  el.querySelector('.duniya-follow-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const uid = btn.dataset.uid;
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    btn.disabled = true;
    const wasFollowing = followingSet.has(uid);
    const name = post.user?.name || 'user';
    try {
      if (wasFollowing) {
        followingSet.delete(uid);
        duniyaPrioritySet.delete(uid);
        btn.textContent = 'Follow';
        btn.classList.remove('following');
        if(typeof setFollowing==='function'){
          try{ await setFollowing(uid,false,'duniya_post'); }
          catch(err){
            followingSet.add(uid);
            duniyaPrioritySet.add(uid);
            btn.textContent='Following';
            btn.classList.add('following');
            throw err;
          }
        }
        if (typeof showUndoToast === 'function') {
          showUndoToast({
            message: `Unfollowed ${name}`,
            onUndo: async () => {
              followingSet.add(uid);
              duniyaPrioritySet.add(uid);
              btn.textContent = 'Following';
              btn.classList.add('following');
              if(typeof setFollowing==='function'){
                try{ await setFollowing(uid,true,'undo_unfollow'); }catch(err){}
              }
              if (typeof showToast === 'function') showToast(t('duniya_following_again'));
            },
          });
        }
      } else {
        const apply = () => {
          followingSet.add(uid);
          duniyaPrioritySet.add(uid);
          btn.textContent = 'Following';
          btn.classList.add('following');
          if (typeof SoundLib !== 'undefined' && SoundLib.follow) SoundLib.follow();
          if (typeof haptic === 'function') haptic('success');
        };
        const revert = () => {
          followingSet.delete(uid);
          duniyaPrioritySet.delete(uid);
          btn.textContent = 'Follow';
          btn.classList.remove('following');
        };
        if (typeof runOptimistic === 'function') {
          await runOptimistic({
            apply,
            revert,
            commit: async () => {
              if (typeof assertRateLimit === 'function') await assertRateLimit('follow');
              if (typeof setFollowing === 'function') await setFollowing(uid, true, 'duniya_post');
            },
            errorToast: 'Couldn’t follow — undone',
          });
        } else {
          apply();
        }
        if (followingSet.has(uid) && typeof showToast === 'function') {
          showToast(t('duniya_following'));
        }
      }
    } finally {
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.setAttribute('aria-label', `${followingSet.has(uid) ? 'Unfollow' : 'Follow'} ${name}`);
    }
  });

  // Share
  el.querySelector('.share-btn').addEventListener('click',()=>openShareSheet(post));

  // More (flag/block)
  el.querySelector('.duniya-more-btn').addEventListener('click',()=>{
    if(typeof openContentMenu==='function') openContentMenu(post,{surface:'duniya'});
    else if(typeof openFlagSheet==='function') openFlagSheet(post.user,{postId:post.id,targetType:'duniya'});
  });

  el.querySelector('.duniya-delete-btn')?.addEventListener('click',(e)=>{
    e.stopPropagation();
    if(typeof softDeleteContent!=='function'){ showToast(t('duniya_delete_unavailable')); return; }
    softDeleteContent({
      kind:'duniya',
      id:post.id,
      firestoreId:post.firestoreId||null,
      collection:'duniya',
      list:duniyaPosts,
      render:renderDuniyaFeed,
      label:'Post deleted',
    });
  });

  // Comments
  el.querySelector('.comment-btn')?.addEventListener('click',()=>{
    if(post.commentsOff && !duniyaViewerOwns(post)){
      if(typeof showToast==='function') showToast('Comments are off');
      return;
    }
    openDuniyaDetail(post);
  });
  el.querySelector('.duniya-view-comments')?.addEventListener('click',()=>openDuniyaDetail(post));
  el.querySelectorAll('.feed-comment-row').forEach((row)=>{
    const preview=(post._previewComments||post._comments||[]).find((c)=>c.id===row.dataset.commentId);
    const author=preview?.user||{};
    if(typeof wireIdentityTaps==='function' && (author.uid||author.username)){
      wireIdentityTaps(row,author,{
        avatarSel:'.feed-comment-avatar',
        nameSel:'.feed-comment-name',
        context:'duniya',
      });
    }
    row.querySelector('.feed-comment-open')?.addEventListener('click',(e)=>{
      e.stopPropagation();
      openDuniyaDetail(post,{focusCommentId:row.dataset.commentId});
    });
    row.addEventListener('click',(e)=>{
      if(e.target.closest('.feed-comment-avatar, .feed-comment-name, .cp-identity-avatar, .cp-identity-name')) return;
      e.stopPropagation();
      openDuniyaDetail(post,{focusCommentId:row.dataset.commentId});
    });
  });
  el.querySelector('.feed-comment-more')?.addEventListener('click',(e)=>{
    e.stopPropagation();
    openDuniyaDetail(post);
  });
  el.querySelector('.duniya-feed-add-comment')?.addEventListener('click',(e)=>{
    e.stopPropagation();
    if(!currentUser){
      if(typeof requireSignIn==='function') return requireSignIn(typeof t==='function'?t('auth_sign_in_short'):'Sign in to continue');
      return;
    }
    openDuniyaDetail(post,{focusComposer:true});
  });

  bindDuniyaCarousel(el, post, slides);
  el.querySelectorAll('[data-hashtag]').forEach((btn)=>{
    btn.addEventListener('click',(e)=>{
      e.preventDefault();
      const tag=btn.dataset.hashtag;
      if(typeof openUniversalSearch==='function') openUniversalSearch('#'+tag);
      else if(typeof showToast==='function') showToast('#'+tag);
    });
  });
  el.querySelectorAll('[data-mention]').forEach((btn)=>{
    btn.addEventListener('click', async (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const handle=btn.dataset.mention;
      if(typeof tapMentionFromFeed==='function') await tapMentionFromFeed(handle,{context:'duniya'});
      else if(typeof openUniversalSearch==='function') openUniversalSearch('@'+handle);
    });
  });
  el.querySelector('[data-loc]')?.addEventListener('click',(e)=>{
    e.preventDefault();
    if(!post.location) return;
    if(typeof renderLocationCard==='function'){
      const holder=document.createElement('div');
      holder.innerHTML=renderLocationCard(post.location,{variant:'chat'});
      document.body.appendChild(holder);
      if(typeof mountLocationCards==='function') mountLocationCards(holder);
      holder.querySelector('[data-loc-card]')?.click();
      setTimeout(()=>holder.remove(),0);
    }
  });
  el.querySelector('[data-show-tags]')?.addEventListener('click',(e)=>{
    e.preventDefault();
    e.stopPropagation();
    const media=el.querySelector('.duniya-post-media, .duniya-carousel');
    if(!media) return;
    const existing=media.querySelectorAll('.duniya-photo-tag');
    if(existing.length){ existing.forEach((n)=>n.remove()); return; }
    const idx=Number(el.querySelector('.duniya-carousel')?.dataset.index||0);
    (post.taggedPeople||[]).filter((t)=>Number(t.slideIndex||0)===idx).forEach((t)=>{
      const chip=document.createElement('button');
      chip.type='button';
      chip.className='duniya-photo-tag';
      chip.style.left=(t.x*100)+'%';
      chip.style.top=(t.y*100)+'%';
      chip.textContent=t.username||t.name||'';
      chip.addEventListener('click',(ev)=>{
        ev.stopPropagation();
        const tagged={uid:t.uid,name:t.name,username:t.username};
        if(typeof tapNameFromFeed==='function') tapNameFromFeed(tagged);
        else if(typeof openProfileMessage==='function') openProfileMessage(tagged);
      });
      media.style.position='relative';
      media.appendChild(chip);
    });
  });
  el.querySelectorAll('[data-collab]').forEach((btn)=>{
    btn.addEventListener('click', async ()=>{
      try{
        if(typeof apiFetch!=='function') return;
        const envelope=await apiFetch('/api/duniya-posts',{method:'POST',needAuth:true,body:{action:'collab',collabAction:btn.dataset.collab,postId:post.firestoreId||post.id}});
        if(!envelope?.ok) throw new Error(envelope?.error?.message||'Could not update');
        const next=envelope.data?.post;
        if(next && typeof mapDuniyaDoc==='function'){
          Object.assign(post, mapDuniyaDoc({...next,id:next.id}));
        }
        if(typeof renderDuniyaFeed==='function') renderDuniyaFeed();
      }catch(err){
        if(typeof showToast==='function') showToast(err.message||'Could not update invite');
      }
    });
  });
  if(post.commentsOff){
    el.querySelector('.comment-btn')?.setAttribute('aria-label','Comments are off');
  }

  return el;
}

function formatCount(n){return n>=1000?(n/1000).toFixed(1)+'K':String(n);}

async function openDuniyaPostLikers(post){
  const count=Math.max(0, Number(post.likes)||0);
  if(!count) return;
  const postId=post.firestoreId||post.id;
  if(!postId||String(postId).startsWith('q_')){
    if(typeof showToast==='function') showToast('Post still saving — try again in a moment');
    return;
  }
  try{
    const likers=typeof fetchContentLikers==='function'?await fetchContentLikers('duniya', postId):[];
    if(typeof openLikersSheet==='function'){
      openLikersSheet({
        title:`${formatCount(count)} likes`,
        likers,
        onProfileTap:(u)=>{ if(typeof openPublicProfile==='function') openPublicProfile(u); },
      });
    }
  }catch(e){
    if(typeof showToast==='function') showToast(typeof friendlyError==='function'?friendlyError(e):e.message||'Could not load likes');
  }
}

function syncDuniyaPostUI(post){
  if(!post) return;
  const id=String(post.id||'');
  document.querySelectorAll(`.duniya-post[data-id="${id}"]`).forEach((card)=>{
    const likesEl=card.querySelector('.duniya-post-likes');
    if(likesEl){
      if(post.hideLikeCount && !duniyaViewerOwns(post)) likesEl.remove();
      else likesEl.textContent=`${formatCount(post.likes||0)} likes`;
    }
    const likeBtn=card.querySelector('.like-btn');
    if(likeBtn){
      likeBtn.classList.toggle('liked', !!post.likedByMe);
      likeBtn.setAttribute('aria-pressed', post.likedByMe?'true':'false');
    }
    let view=card.querySelector('.duniya-view-comments');
    const count=Math.max(0, Number(post.comments)||0, Array.isArray(post._comments)?post._comments.filter((c)=>!c.deleted).length:0);
    if(count>0){
      if(!view){
        view=document.createElement('div');
        view.className='duniya-view-comments';
        view.addEventListener('click',()=>openDuniyaDetail(post));
        card.appendChild(view);
      }
      view.textContent=`View all ${count} comments`;
    }else if(view){
      view.remove();
    }
  });
  const detail=document.getElementById('duniyaPostDetail');
  const subtitle=detail?.querySelector('.duniya-comments-subtitle');
  if(subtitle && detail?.classList.contains('open')){
    subtitle.textContent=`${post.comments||0} on ${post.user?.name||'this post'}`;
  }
}

// ===================== DUNIYA POST DETAIL (threaded comments) =====================
function getDuniyaComments(post) {
  // Only seed demo comments once. An empty array means "loaded, none yet".
  if (Array.isArray(post._comments)) return post._comments;
  const seed = [
    { id: 'dc1', parentId: null, user: { name: 'Asha', avatar: '😊' }, text: 'Great post! 🔥', time: '2h' },
    { id: 'dc2', parentId: 'dc1', user: { name: post.user?.name?.split(' ')[0] || 'Author', avatar: post.user?.avatar || '👤' }, text: 'Thanks for reading!', time: '1h' },
    { id: 'dc3', parentId: null, user: { name: 'Vikram', avatar: '🧑' }, text: 'Really insightful, thanks for sharing', time: '3h' },
    { id: 'dc4', parentId: 'dc3', user: { name: 'Neha', avatar: '👩' }, text: 'Totally agree with this perspective', time: '2h' },
    { id: 'dc5', parentId: 'dc3', user: { name: 'Sam', avatar: '🧔' }, text: `@${(post.user?.name || 'you').split(' ')[0]} this is amazing!`, time: '1h' },
  ];
  post._comments = seed;
  post.comments = seed.length;
  return post._comments;
}

function openDuniyaDetail(post,{focusCommentId=null,focusComposer=false}={}){
  const detail=document.getElementById('duniyaPostDetail');
  detail.classList.remove('hidden');requestAnimationFrame(()=>detail.classList.add('open'));
  const canLoadPersistentComments = typeof socialContentCanPersist === 'function' && socialContentCanPersist('duniya', post);
  const comments = canLoadPersistentComments
    ? (Array.isArray(post._comments) ? post._comments : [])
    : getDuniyaComments(post);
  let replyTo = null;
  const canEdit = typeof duniyaCanEditPost === 'function' && duniyaCanEditPost(post);
  detail.innerHTML=`
    <div class="duniya-comments-handle" aria-hidden="true"></div>
    <div class="duniya-comments-header">
      <div>
        <div class="duniya-comments-title">${typeof t==='function'?t('comment_sheet_title'):'Comments'}</div>
        <div class="duniya-comments-subtitle">${post.comments||0} on ${post.user?.name||'this post'}${
          !post.hideLikeCount && (post.likes||0)>0
            ? ` · <button type="button" class="duniya-detail-likes" data-duniya-likers>${formatCount(post.likes)} likes</button>`
            : ''
        }</div>
      </div>
      <div class="duniya-detail-actions">
        ${canEdit ? `<button type="button" class="duniya-detail-action-btn" data-duniya-edit aria-label="Edit">${typeof iconHtml==='function'?iconHtml('pen',{size:18}):'Edit'}</button>` : ''}
        <button type="button" id="duniyaDetailBack" class="cp-tap-target duniya-comments-close" aria-label="Close comments">✕</button>
      </div>
    </div>
    <div class="duniya-comments-body">
      <div class="duniya-comments-post-context">
        <strong>${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(post.user?.name||'Post',post.user):(post.user?.name||'Post')}</strong>
        <span>${String(post.caption||'').slice(0,150)}</span>
      </div>
      <div id="duniyaCommentsList" class="comments-list">
        ${typeof renderCommentsHtml==='function'?renderCommentsHtml(comments,{ surface:'duniya', previewReplies:2 }):''}
      </div>
    </div>
    <div id="duniyaReplyHint" class="comment-reply-hint hidden"></div>
    ${post.commentsOff && !duniyaViewerOwns(post)
      ? `<div class="duniya-comments-composer" style="justify-content:center;color:var(--muted);font-size:13px;">Comments are off</div>`
      : `<div class="duniya-comments-composer">
      <input id="duniyaCommentInput" style="flex:1;padding:10px 14px;border:2px solid var(--line);border-radius:12px;font-family:Inter,sans-serif;font-size:14px;outline:none;min-height:44px;" placeholder="${typeof t==='function'?t('comment_add_placeholder'):'Add a comment…'} @mention someone">
      <button id="duniyaCommentSend" class="cp-tap-target" style="background:var(--red);color:#fff;border:none;border-radius:12px;padding:10px 16px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;min-height:44px;">Post</button>
    </div>`}
  `;
  detail.querySelector('.duniya-expand-media')?.addEventListener('click',(e)=>{
    e.preventDefault();
    e.stopPropagation();
    const img=detail.querySelector('.duniya-post-media img');
    if(img&&typeof openImageViewer==='function'){
      openImageViewer(img.dataset.full||post.media||img.currentSrc||img.src,{alt:img.alt});
    }
  });
  detail.querySelector('[data-duniya-likers]')?.addEventListener('click',(e)=>{
    e.stopPropagation();
    openDuniyaPostLikers(post);
  });
  document.getElementById('duniyaDetailBack').addEventListener('click',()=>{
    if(typeof closeAiKeyboard==='function') closeAiKeyboard();
    detail.classList.remove('open');setTimeout(()=>detail.classList.add('hidden'),300);
    try{ history.pushState({},'', '/'); }catch(e){}
  });
  detail.querySelector('[data-duniya-edit]')?.addEventListener('click',(e)=>{
    e.stopPropagation();
    if(typeof DuniyaCompose !== 'undefined' && DuniyaCompose.openEdit) DuniyaCompose.openEdit(post);
  });
  try{
    const pid=post.firestoreId||post.id;
    if(pid&&typeof buildDeepLink==='function') history.pushState({chaupaalDeep:true},'',buildDeepLink('post',pid));
  }catch(e){}

  const listEl = document.getElementById('duniyaCommentsList');
  const hint = document.getElementById('duniyaReplyHint');
  const commentInput=document.getElementById('duniyaCommentInput');
  const commentSend=document.getElementById('duniyaCommentSend');
  const commentActions=typeof createCommentActionHandlers==='function'
    ? createCommentActionHandlers({collection:'duniya',content:post,comments,refresh:refreshComments})
    : {};

  function refreshComments() {
    if (!listEl) return;
    if(typeof enrichCommentAggregates==='function') enrichCommentAggregates(comments);
    if(typeof rankCommentsForPreview==='function') post._previewComments = rankCommentsForPreview(comments,{limit:2,viewerUid:currentUser?.uid});
    listEl.innerHTML = typeof renderCommentsHtml === 'function' ? renderCommentsHtml(comments,{ surface:'duniya', previewReplies:2 }) : '';
    syncDuniyaPostUI(post);
    if (typeof wireCommentsList === 'function') {
      wireCommentsList(listEl, comments, {
        ...commentActions,
        surface:'duniya',
        collection:'duniya',
        content:post,
        onReply(parentId) {
          replyTo = parentId;
          const parent = comments.find((c) => c.id === parentId);
          if (hint) {
            hint.classList.remove('hidden');
            hint.innerHTML = `Replying to <strong>${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(parent?.user?.name||'comment',parent?.user):(parent?.user?.name||'comment')}</strong> <button type="button" id="cancelDuniyaReply">${typeof t==='function'?t('cancel'):'Cancel'}</button>`;
            hint.querySelector('#cancelDuniyaReply')?.addEventListener('click', () => {
              replyTo = null;
              hint.classList.add('hidden');
              hint.innerHTML = '';
            });
          }
          const mention = parent?.user?.username || parent?.user?.name?.split?.(' ')?.[0];
          if(commentInput && mention && !String(commentInput.value||'').trim()) commentInput.value = `@${mention} `;
          commentInput?.focus();
        },
      });
    }
  }
  refreshComments();
  if (typeof commentMsgCache?.get === 'function') {
    commentMsgCache.get('duniya', post.firestoreId || post.id).then((cached) => {
      if (!cached?.comments?.length || comments.length) return;
      comments.splice(0, comments.length, ...cached.comments);
      post._comments = comments;
      refreshComments();
    }).catch(() => {});
  }
  if (canLoadPersistentComments && typeof loadContentComments === 'function') {
    if (commentSend) commentSend.disabled = true;
    if (!listEl.querySelector('.comment-item') && typeof renderSkeleton === 'function') renderSkeleton(listEl, { variant: 'list', count: 3 });
    loadContentComments('duniya', post, {limit:25})
      .then(async (loaded) => {
        if (!Array.isArray(loaded)) return;
        comments.splice(0, comments.length, ...loaded);
        post._comments = comments;
        if (typeof enrichUsersWithProfileType === 'function') {
          await enrichUsersWithProfileType(comments.map((c) => c.user).filter(Boolean));
        }
        refreshComments();
        if (typeof commentMsgCache?.put === 'function') {
          commentMsgCache.put('duniya', post.firestoreId || post.id, comments).catch(() => {});
        }
      })
      .catch((err) => {
        if (typeof renderErrorState === 'function') {
          renderErrorState(listEl, {
            title: 'Couldn’t load comments',
            message: typeof friendlyError === 'function' ? friendlyError(err) : 'Please try again.',
            onRetry: () => openDuniyaDetail(post),
          });
        }
      })
      .finally(() => {
        if (commentSend) commentSend.disabled = false;
      });
  }

  commentSend?.addEventListener('click', async () => {
    if(post.commentsOff && !duniyaViewerOwns(post)){
      if(typeof showToast==='function') showToast('Comments are off');
      return;
    }
    const txt = commentInput.value.trim();
    if (!txt) return;
    const id = typeof newCommentId === 'function' ? newCommentId() : 'c_' + Date.now();
    const c = {
      id,
      parentId: replyTo || null,
      user: typeof currentCommentUser === 'function' ? currentCommentUser() : { name: 'You', avatar: '🪑' },
      text: txt,
      time: 'just now',
      pending: true,
      likeCount:0,
      replyCount:0,
    };
    const apply = () => {
      comments.push(c);
      post.comments = (post.comments || 0) + 1;
      commentInput.value = '';
      replyTo = null;
      if (hint) {
        hint.classList.add('hidden');
        hint.innerHTML = '';
      }
      refreshComments();
    };
    const revert = () => {
      const i = comments.findIndex((x) => x.id === id);
      if (i >= 0) comments.splice(i, 1);
      post.comments = Math.max(0, (post.comments || 1) - 1);
      refreshComments();
    };
    if (duniyaIsDemoPost(post)) {
      apply();
      c.pending = false;
      refreshComments();
      toastDuniyaDemo();
      return;
    }
    if (typeof runOptimistic === 'function') {
      await runOptimistic({
        apply,
        revert,
        commit: async () => {
          if (typeof assertRateLimit === 'function') await assertRateLimit('comment');
          if (typeof persistContentComment === 'function') {
            const saved = await persistContentComment('duniya', post, c);
            if (saved.persisted) {
              c.persisted = true;
              if (Number.isFinite(saved.comments)) post.comments = saved.comments;
              if (typeof saveToArchive === 'function') {
                saveToArchive({ type: 'comment', content: txt, postId: post.id, parentId: c.parentId, ts: new Date().toISOString() });
              }
            }
          } else if (typeof saveToArchive === 'function') {
            saveToArchive({ type: 'comment', content: txt, postId: post.id, parentId: c.parentId, ts: new Date().toISOString() });
          }
          c.pending = false;
          refreshComments();
          if (typeof commentMsgCache?.put === 'function') {
            commentMsgCache.put('duniya', post.firestoreId || post.id, comments).catch(() => {});
          }
        },
      });
    } else {
      apply();
      c.pending = false;
      if (typeof saveToArchive === 'function') {
        saveToArchive({ type: 'comment', content: txt, postId: post.id, parentId: c.parentId, ts: new Date().toISOString() });
      }
      if (typeof commentMsgCache?.put === 'function') {
        commentMsgCache.put('duniya', post.firestoreId || post.id, comments).catch(() => {});
      }
    }
  });
  wireTagging(commentInput);
}

function openDuniyaPostSheet(mode='post'){
  if(typeof currentUser==='undefined'||!currentUser){
    try{
      const action=mode==='story'?'duniya_story':'duniya_compose';
      if(typeof ChaupaalReferrals?.stashPendingAction==='function') ChaupaalReferrals.stashPendingAction(action);
      else if(typeof stashPendingAction==='function') stashPendingAction(action);
      else sessionStorage.setItem('chaupaal_pending_action',action);
    }catch(e){}
    if(typeof showToast==='function') showToast(typeof t==='function'?t('duniya_create_signin','Sign in to create'):'Sign in to create');
    if(typeof openAuthSheet==='function') openAuthSheet('login');
    else if(typeof showAuth==='function') showAuth();
    return;
  }
  if(mode==='story'){
    if(typeof DuniyaStory!=='undefined' && typeof DuniyaStory.startCreate==='function') DuniyaStory.startCreate();
    else if(typeof showToast==='function') showToast('Story composer unavailable');
    return;
  }
  if(typeof DuniyaCompose!=='undefined' && typeof DuniyaCompose.open==='function'){
    DuniyaCompose.open({ mode: mode==='text' ? 'text' : 'media' });
    return;
  }
  if(typeof showToast==='function') showToast('Composer unavailable');
}

// ===================== SHARE SHEET =====================
async function recordDuniyaShare(post){
  const target = duniyaPosts.find((x) => x.id === post.id) || post;
  const previous = Math.max(0, Number(target.shares) || 0);
  if (duniyaIsDemoPost(target)) {
    target.shares = previous + 1;
    post.shares = target.shares;
    toastDuniyaDemo();
    return;
  }
  try{
    if(typeof incrementContentShares==='function'){
      const saved=await incrementContentShares('duniya', target);
      if(Number.isFinite(saved.shares)){
        target.shares=saved.shares;
        post.shares=saved.shares;
      }
    }else{
      target.shares=previous+1;
      post.shares=target.shares;
    }
  }catch(e){
    target.shares=previous;
    post.shares=previous;
  }
}

async function recordPeepalShare(post){
  const id = post.firestoreId || post.id;
  const target =
    (typeof peepalQuestions !== 'undefined' && Array.isArray(peepalQuestions)
      ? peepalQuestions.find((x) => x.id === id || x.firestoreId === id)
      : null) || post;
  const previous = Math.max(0, Number(target.shares) || 0);
  try{
    if(typeof incrementContentShares==='function'){
      const saved=await incrementContentShares('peepal', { ...target, firestoreId: id, id });
      if(Number.isFinite(saved.shares)){
        target.shares=saved.shares;
        post.shares=saved.shares;
      }
    }else{
      target.shares=previous+1;
      post.shares=target.shares;
    }
  }catch(e){
    target.shares=previous;
    post.shares=previous;
  }
}

async function sendPostToFriendViaApi(post, friend, isPeepal){
  const postId=post.firestoreId||post.id;
  if(!postId||String(postId).startsWith('q_')){
    if(typeof showToast==='function') showToast('Post still saving — try again in a moment');
    return false;
  }
  if(typeof apiFetch!=='function'||!friend?.uid) return false;
  const env=await apiFetch('/api/stories',{
    method:'POST',
    needAuth:true,
    body:{
      action:'send_post',
      postId,
      collection:isPeepal?'peepal':'duniya',
      uids:[friend.uid],
    },
  });
  if(!env?.ok) throw new Error(env?.error?.message||'Could not send');
  if(isPeepal) await recordPeepalShare(post);
  else await recordDuniyaShare(post);
  return true;
}

function openShareSheet(post){
  const caption=String(post.caption||post.question||'').trim();
  const preview=caption.slice(0,140);
  const id=post.firestoreId||post.id;
  const url=typeof shareUrl==='function'?shareUrl('post',id):`${location.origin}/post/${encodeURIComponent(id||'')}`;
  const isPeepal=!!(post.question&&!post.caption);
  const gameId=isPeepal?'peepal':'duniya';
  const author=post.user?.name?`by ${post.user.name}`:'';
  const stats=typeof buildShareStats==='function'
    ? buildShareStats({
        scoreLine:preview||(isPeepal?'Peepal':'Duniya'),
        caption:preview,
        meta:author,
        text:`${caption.slice(0,200)}${caption.length>200?'…':''} — via Chaupaal`,
        url,
      })
    : {
        scoreLine:preview||'Chaupaal',
        caption:preview,
        meta:author,
        text:`${caption.slice(0,200)} — via Chaupaal`,
        url,
      };

  const afterShare=async()=>{
    if(isPeepal) await recordPeepalShare(post);
    else await recordDuniyaShare(post);
    try{
      if(typeof trackSignal==='function'){
        trackSignal('share',{
          surface:isPeepal?'peepal':'duniya',
          objType:'post',
          objId:String(id||'').slice(0,128),
        });
      }
    }catch(e){}
  };

  const onFriend=async(_stats,friend)=>{
    try{
      const ok=await sendPostToFriendViaApi(post,friend,isPeepal);
      if(ok&&typeof showToast==='function') showToast('Sent in Baithak');
    }catch(e){
      if(typeof showToast==='function') showToast(e?.message||'Could not send');
    }
  };

  if(typeof openUnifiedShareSheet==='function'){
    openUnifiedShareSheet({
      gameId,
      title:'Share',
      subtitle:preview?preview.slice(0,72):undefined,
      stats,
      onShared:afterShare,
      onFriend,
    });
    return;
  }

  // Fallback without unified sheet
  if(typeof shareGameResult==='function'){
    shareGameResult(gameId,stats).then(afterShare);
    return;
  }
  if(navigator.share){
    navigator.share({title:'Chaupaal',text:stats.text,url}).then(afterShare).catch(()=>{});
  }else if(navigator.clipboard){
    navigator.clipboard.writeText(`${stats.text}\n${url}`).then(()=>{showToast(t('duniya_link_copied'));afterShare();});
  }
}

// ===================== FLAG / BLOCK =====================
// Implemented in core/safety.js — openFlagSheet / blockUser / flagUser.
// Shadowban writes are Admin-only via /api/relationships { action: 'flag_user'|'block_signal' }.
// Dead client reviewShadowbans removed (rules deny client read/write on shadowbans).
let userFlags={};

// ===================== @TAGGING SYSTEM =====================
function wireTagging(inputEl){
  if(!inputEl||inputEl.dataset.tagged)return;
  inputEl.dataset.tagged='1';
  let tagDropdown=null;
  let timer=null;
  inputEl.addEventListener('input',()=>{
    const val=inputEl.value;const at=val.lastIndexOf('@');
    if(at===-1||val.slice(at+1).includes(' ')){tagDropdown?.remove();tagDropdown=null;return;}
    const query=val.slice(at+1).trim();
    if(!query){tagDropdown?.remove();tagDropdown=null;return;}
    clearTimeout(timer);
    timer=setTimeout(async()=>{
      let matches=[];
      try{
        if(typeof searchUsersProvider==='function'){
          const me=typeof currentUser!=='undefined'?currentUser?.uid:'';
          matches=((await searchUsersProvider(query,{limit:6}))||[]).filter(u=>u.uid&&u.uid!==me);
        }
      }catch(e){}
      if(!matches.length){tagDropdown?.remove();tagDropdown=null;return;}
      if(!tagDropdown){tagDropdown=document.createElement('div');tagDropdown.className='tag-dropdown';inputEl.parentElement.style.position='relative';inputEl.parentElement.appendChild(tagDropdown);}
      tagDropdown.innerHTML=matches.map(u=>`<button type="button" class="tag-user-item" data-username="${duniyaEsc(u.username||'')}"><span>👤</span><span style="font-weight:600;font-size:13px;">${duniyaEsc(u.name||'')}</span><span style="font-size:11px;color:var(--muted);">@${duniyaEsc(u.username||'')}</span></button>`).join('');
      tagDropdown.querySelectorAll('.tag-user-item').forEach(item=>{
        item.addEventListener('click',()=>{
          const before=inputEl.value.slice(0,at);inputEl.value=before+'@'+item.dataset.username+' ';
          tagDropdown.remove();tagDropdown=null;inputEl.focus();
        });
      });
    },200);
  });
  document.addEventListener('click',e=>{if(!e.target.closest('.tag-dropdown')&&e.target!==inputEl){tagDropdown?.remove();tagDropdown=null;}},{capture:true});
}

// ===================== PEEPAL NUDGES =====================
const PEEPAL_NUDGES=[
  {icon:'📊',label:'Market Research',text:'Get real opinions from real people',sub:'What product should we build next?',template:'Quick survey: Which of these would you pay for?',format:'mcq',options:['Option A','Option B','Option C','None of these']},
  {icon:'🎬',label:'Movie Night',text:'What should we watch this weekend?',sub:'Get your community to decide',template:'Weekend movie poll! What are you watching?',format:'mcq',options:['Bollywood blockbuster','Hollywood thriller','Web series','Old classic']},
  {icon:'💼',label:'Job Hunt',text:'Someone in the Chaupaal community might help',sub:'Ask about opportunities, referrals, advice',template:'Looking for opportunities in [field]. Anyone hiring or know someone who is?',format:'open',options:[]},
  {icon:'💕',label:'Dating Advice',text:'Real people, real advice',sub:'Ask anonymously what the community thinks',template:'Genuine question: How did you know they were the one?',format:'open',options:[]},
  {icon:'✈️',label:'Travel Group',text:'Find travel buddies from the community',sub:'Solo trips are better with friends',template:'Planning a trip to [destination] in [month]. Anyone interested in joining?',format:'binary',options:['Count me in! 🙋','Maybe later']},
  {icon:'🏏',label:'Sports Debate',text:'Cricket, football, kabaddi — settle it here',sub:'The Chaupaal has strong opinions',template:'Hot take: [Your sports opinion]. Agree or disagree?',format:'binary',options:['Agree 💯','Disagree ❌']},
  {icon:'🍛',label:'Food & Recipes',text:'Share recipes, find the best spots',sub:'Food brings people together',template:'What is the one dish you could eat every day for the rest of your life?',format:'open',options:[]},
  {icon:'🧠',label:'GK Challenge',text:'Test the community\'s knowledge',sub:'Create your own quiz question',template:'Quiz time! [Your question here]',format:'mcq',options:['Option A','Option B','Option C','Option D']},
  {icon:'💰',label:'Personal Finance',text:'Money questions, crowd-sourced wisdom',sub:'Real advice from real people',template:'Best investment I made at 25 was... What was yours?',format:'open',options:[]},
  {icon:'🎵',label:'Music Discussion',text:'What are you listening to?',sub:'Discover music through the community',template:'Song that defined your 2024? Drop it below 🎵',format:'open',options:[]},
];

function renderPeepalNudges(){
  const feed=document.getElementById('peepalFeed');if(!feed)return;
  // One banner per visit — wipe prior nudge chrome so tab re-entry doesn't stack
  feed.querySelectorAll('.peepal-nudge-banner,.peepal-nudge-between').forEach(el=>el.remove());
  feed.parentElement?.querySelectorAll?.('.peepal-nudge-banner,.peepal-nudge-between').forEach(el=>el.remove());

  // Rotating banner at top — inside feed so sticky header / grid don't overlap
  const nudge=PEEPAL_NUDGES[Math.floor(Math.random()*PEEPAL_NUDGES.length)];
  const banner=document.createElement('div');banner.className='peepal-nudge-banner';
  banner.innerHTML=`
    <div class="peepal-nudge-label">Try this on Peepal</div>
    <div class="peepal-nudge-text">${nudge.icon} ${nudge.label}</div>
    <div class="peepal-nudge-sub">${nudge.sub}</div>
    <button class="peepal-nudge-cta" id="nudgeCta">Ask this →</button>
  `;
  feed.insertBefore(banner, feed.firstChild);
  document.getElementById('nudgeCta').addEventListener('click',()=>{
    openPeepalAskSheet();
    setTimeout(()=>{
      const qt=document.getElementById('peepalQText');if(qt)qt.value=nudge.template;
      if(nudge.format){document.querySelector(`.peepal-format-chip[data-fmt="${nudge.format}"]`)?.click();}
    },500);
  });

  // Between-posts contextual prompts (after every 3 posts)
  const cards=feed.querySelectorAll('.peepal-card');
  if(cards.length>=3){
    const prompt=PEEPAL_NUDGES[Math.floor(Math.random()*PEEPAL_NUDGES.length)];
    const promptEl=document.createElement('div');
    promptEl.className='peepal-nudge-between';
    promptEl.style.cssText='background:rgba(230,57,70,0.05);border:1.5px dashed rgba(230,57,70,0.3);border-radius:16px;padding:14px;text-align:center;cursor:pointer;';
    promptEl.innerHTML=`<div style="font-size:22px;margin-bottom:6px;">${prompt.icon}</div><div style="font-weight:700;font-size:14px;">${prompt.text}</div><div style="font-size:12px;color:var(--muted);margin-top:4px;">Tap to ask the community →</div>`;
    promptEl.addEventListener('click',()=>{openPeepalAskSheet();setTimeout(()=>{const qt=document.getElementById('peepalQText');if(qt)qt.value=prompt.template;},500);});
    cards[2].after(promptEl);
  }
}

// ===================== "OPEN TO MEET" TOGGLE =====================
let openToMeet=JSON.parse(localStorage.getItem('chaupaal_open_to_meet')||'true');

function renderOpenToMeetCard(){
  if(!openToMeet)return '';
  return`<div class="open-to-meet-card">
    <div style="font-size:28px;">👋</div>
    <div class="open-to-meet-text">You're open to meeting new people! People with similar interests may see your profile in their Peepal discoveries.</div>
    <button onclick="toggleOpenToMeet()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:8px;padding:6px 12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:11px;cursor:pointer;">Turn off</button>
  </div>`;
}

function toggleOpenToMeet(){
  openToMeet=!openToMeet;
  try{localStorage.setItem('chaupaal_open_to_meet',JSON.stringify(openToMeet));}catch(e){}
  showToast(openToMeet?t('duniya_open_to_meet_on'):t('duniya_open_to_meet_off'));
}

// ===================== LEHAR (Section 8) — vertical short-form video only =====================
(function initLeharMode() {
  let mode = 'general';
  let leharIo = null;
  function isVideoPost(p) {
    if (!p) return false;
    const slides = Array.isArray(p.slides) ? p.slides : [];
    const first = slides[0] || null;
    const media = String(p.media || p.video || first?.media || '').trim();
    if (!media) return false;
    const type = String(p.mediaType || p.type || first?.type || '').toLowerCase();
    if (type === 'image' || type === 'gif' || type === 'text') return false;
    if (type.includes('video')) return true;
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(media)) return true;
    if (/\/video\//i.test(media) || /videodelivery|cloudinary.*\/video/i.test(media)) return true;
    if (/^data:video\//i.test(media)) return true;
    return false;
  }
  function syncVishwaLikeUi(post) {
    if (!post?.id) return;
    const id = String(post.id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const card = document.querySelector(`.duniya-post[data-id="${id}"]`);
    if (!card) return;
    const btn = card.querySelector('.like-btn');
    const likesEl = card.querySelector('.duniya-post-likes');
    if (btn) {
      btn.classList.toggle('liked', !!post.likedByMe);
      btn.setAttribute('aria-pressed', post.likedByMe ? 'true' : 'false');
    }
    if (likesEl && typeof formatCount === 'function') {
      likesEl.textContent = `${formatCount(post.likes || 0)} likes`;
    }
  }
  function syncVishwaSaveUi(post) {
    if (!post?.id) return;
    const id = String(post.id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const card = document.querySelector(`.duniya-post[data-id="${id}"]`);
    const btn = card?.querySelector('.duniya-bookmark-btn');
    if (btn) {
      btn.classList.toggle('saved', !!post.savedByMe);
      btn.setAttribute('aria-pressed', post.savedByMe ? 'true' : 'false');
    }
  }
  function leharQuietSound() {
    try {
      if (typeof quietMode !== 'undefined' && quietMode) return true;
      if (document.documentElement.classList.contains('quiet-mode')) return true;
    } catch (e) {}
    return false;
  }
  async function toggleLeharLike(slide, post) {
    if (!post) return;
    const likeBtn = slide.querySelector('[data-lehar-like]');
    const likesEl = slide.querySelector('[data-lehar-likes]');
    if (likeBtn?.dataset.busy) return;
    if (likeBtn) likeBtn.dataset.busy = '1';
    const prevLiked = !!post.likedByMe;
    const prevLikes = Number(post.likes) || 0;
    const applyLocal = (liked, likes) => {
      post.likedByMe = liked;
      post.likes = likes;
      likeBtn?.classList.toggle('is-liked', liked);
      likeBtn?.setAttribute('aria-pressed', liked ? 'true' : 'false');
      if (likesEl) likesEl.textContent = String(likes);
      syncVishwaLikeUi(post);
    };
    const popHeart = () => {
      const heart = slide.querySelector('.lehar-double-heart');
      if (heart) {
        heart.classList.remove('is-pop');
        void heart.offsetWidth;
        heart.classList.add('is-pop');
      }
      if (typeof haptic === 'function') haptic('light');
    };
    if (duniyaIsDemoPost(post)) {
      applyLocal(!prevLiked, Math.max(0, prevLikes + (prevLiked ? -1 : 1)));
      popHeart();
      toastDuniyaDemo();
      if (likeBtn) delete likeBtn.dataset.busy;
      return;
    }
    applyLocal(!prevLiked, Math.max(0, prevLikes + (prevLiked ? -1 : 1)));
    popHeart();
    try {
      if (typeof toggleContentLike !== 'function') throw new Error('Like unavailable');
      if (typeof assertRateLimit === 'function') await assertRateLimit('like');
      const saved = await toggleContentLike('duniya', post);
      if (saved.persisted) {
        applyLocal(!!saved.liked, Number.isFinite(saved.likes) ? saved.likes : post.likes);
      } else {
        applyLocal(prevLiked, prevLikes);
        if (typeof showToast === 'function') showToast('Could not save like — try again');
      }
    } catch (err) {
      applyLocal(prevLiked, prevLikes);
      if (typeof showToast === 'function') {
        showToast(typeof friendlyError === 'function' ? friendlyError(err) : 'Could not save like');
      }
    } finally {
      if (likeBtn) delete likeBtn.dataset.busy;
    }
  }
  async function toggleLeharSave(slide, post) {
    if (!post) return;
    const saveBtn = slide.querySelector('[data-lehar-save]');
    if (saveBtn?.dataset.busy) return;
    if (saveBtn) saveBtn.dataset.busy = '1';
    const prev = !!post.savedByMe;
    const paint = (saved) => {
      post.savedByMe = saved;
      saveBtn?.classList.toggle('is-saved', saved);
      saveBtn?.setAttribute('aria-pressed', saved ? 'true' : 'false');
      syncVishwaSaveUi(post);
    };
    if (duniyaIsDemoPost(post)) {
      paint(!prev);
      toastDuniyaDemo();
      if (saveBtn) delete saveBtn.dataset.busy;
      return;
    }
    paint(!prev);
    try {
      if (typeof toggleContentSaved !== 'function') throw new Error('Save unavailable');
      const saved = await toggleContentSaved('duniya', post);
      if (saved.persisted) {
        paint(!!saved.saved);
        if (typeof showToast === 'function') showToast(saved.saved ? 'Saved' : 'Removed from saved');
      } else {
        paint(prev);
        if (typeof showToast === 'function') showToast('Could not save');
      }
    } catch (err) {
      paint(prev);
      if (typeof showToast === 'function') {
        showToast(typeof friendlyError === 'function' ? friendlyError(err) : 'Could not save');
      }
    } finally {
      if (saveBtn) delete saveBtn.dataset.busy;
    }
  }
  function renderLeharFeed() {
    const feed = document.getElementById('leharFeed');
    if (!feed) return;
    if (leharIo) {
      try { leharIo.disconnect(); } catch (e) {}
      leharIo = null;
    }
    const leharMediaSrc = (p) => {
      const slides = Array.isArray(p?.slides) ? p.slides : [];
      return String(p?.media || p?.video || slides[0]?.media || '').trim();
    };
    const videos = (duniyaPosts || [])
      .filter((p) => !(typeof isSoftDeleted === 'function' ? isSoftDeleted(p) : p.deleted))
      .filter((p) => p.archived !== true)
      .filter(isVideoPost)
      .filter((p) => !!leharMediaSrc(p));
    const realVideos = videos.filter((p) => !duniyaIsDemoPost(p));
    // Live signed-in: real clips only. Guests / demo-fallback: labeled samples OK.
    let pool =
      duniyaLiveMode && duniyaIsSignedIn() && !duniyaDemoFallback ? realVideos : videos;
    // Same friends/followers-first priority as Vishwa (among videos only).
    pool = typeof rankDuniyaVishwaFeed === 'function' ? rankDuniyaVishwaFeed(pool) : pool;
    if (!pool.length) {
      feed.innerHTML =
        `<div class="lehar-empty">
          <strong>Lehar</strong>
          <p>No clips in your Duniya pool yet. Post a video, or browse Vishwa.</p>
          <div class="lehar-empty-actions">
            <button type="button" class="btn btn--primary" data-lehar-create>Post a clip</button>
            <button type="button" class="btn btn--ghost" data-lehar-vishwa>Browse Vishwa</button>
          </div>
        </div>`;
      feed.querySelector('[data-lehar-create]')?.addEventListener('click', () => {
        if (typeof openDuniyaPostSheet === 'function') openDuniyaPostSheet('post');
      });
      feed.querySelector('[data-lehar-vishwa]')?.addEventListener('click', () => {
        if (typeof setDuniyaMode === 'function') setDuniyaMode('vishwa');
      });
      return;
    }
    feed.innerHTML = pool
      .map((p, i) => {
        const src = leharMediaSrc(p);
        const name = p.user?.name || 'Member';
        const postId = p.id || '';
        const likes = Number(p.likes) || 0;
        const comments = Number(p.comments) || 0;
        const liked = !!p.likedByMe;
        const saved = !!p.savedByMe;
        const demo = duniyaIsDemoPost(p);
        const avatar = p.user?.photoURL || (p.user?.avatar && /^https:/.test(p.user.avatar) ? p.user.avatar : '');
        return `<section class="lehar-slide${demo ? ' lehar-slide--demo' : ''}" data-lehar-i="${i}" data-lehar-id="${duniyaEsc(postId)}"${demo ? ' data-demo="1"' : ''}>
          <video src="${duniyaEsc(src)}" playsinline loop muted preload="metadata"${p.thumb ? ` poster="${duniyaEsc(p.thumb)}"` : ''}></video>
          <div class="lehar-progress"><i data-lehar-progress></i></div>
          <button type="button" class="lehar-mute-btn" aria-label="Toggle mute" data-lehar-mute>🔇</button>
          <div class="lehar-double-heart" aria-hidden="true">♥</div>
          <div class="lehar-actions">
            <button type="button" class="lehar-action ${liked ? 'is-liked' : ''}" data-lehar-like aria-label="Like" aria-pressed="${liked ? 'true' : 'false'}">
              <span aria-hidden="true">♥</span><em data-lehar-likes>${likes}</em>
            </button>
            <button type="button" class="lehar-action" data-lehar-comment aria-label="Comments">
              <span aria-hidden="true">💬</span><em>${comments}</em>
            </button>
            <button type="button" class="lehar-action ${saved ? 'is-saved' : ''}" data-lehar-save aria-label="Save" aria-pressed="${saved ? 'true' : 'false'}">
              <span aria-hidden="true">🔖</span><em>Save</em>
            </button>
            <button type="button" class="lehar-action" data-lehar-share aria-label="Share">
              <span aria-hidden="true">↗</span><em>Share</em>
            </button>
          </div>
          <div class="lehar-meta">
            <div class="lehar-author">
              <button type="button" class="lehar-author-avatar" data-lehar-avatar aria-label="Open profile">
                ${avatar ? `<img src="${duniyaEsc(avatar)}" alt="">` : `<span class="lehar-author-fallback">${duniyaEsc((name || '?').slice(0, 1))}</span>`}
              </button>
              <button type="button" class="lehar-author-name" data-lehar-name><strong>${duniyaEsc(name)}</strong>${demo ? ' <span class="cp-demo-badge">Demo</span>' : ''}</button>
            </div>
            <p>${demo ? 'Sample · ' : ''}${duniyaEsc((p.caption || '').slice(0, 120))}</p>
          </div>
        </section>`;
      })
      .join('');
    if (typeof enhanceMediaIn === 'function') enhanceMediaIn(feed);
    let mutedPref = true;
    try { mutedPref = localStorage.getItem('chaupaal_lehar_muted') !== '0'; } catch (e) {}
    if (leharQuietSound()) mutedPref = true;
    const slides = [...feed.querySelectorAll('.lehar-slide')];
    const setMuteUi = (slide, muted) => {
      const btn = slide.querySelector('[data-lehar-mute]');
      if (btn) btn.textContent = muted ? '🔇' : '🔊';
    };
    const bindProgress = (slide) => {
      const v = slide.querySelector('video');
      const bar = slide.querySelector('[data-lehar-progress]');
      if (!v || !bar) return;
      const tick = () => {
        if (!v.duration || !Number.isFinite(v.duration)) return;
        bar.style.width = `${Math.min(100, (v.currentTime / v.duration) * 100)}%`;
      };
      v.addEventListener('timeupdate', tick);
      v.addEventListener('ended', () => { bar.style.width = '0%'; });
    };
    slides.forEach((s) => {
      const v = s.querySelector('video');
      if (v) v.muted = mutedPref;
      setMuteUi(s, mutedPref);
      bindProgress(s);
      const postId = s.dataset.leharId;
      const post = () => (duniyaPosts || []).find((x) => x.id === postId);

      s.querySelector('[data-lehar-mute]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (leharQuietSound()) {
          mutedPref = true;
          if (typeof showToast === 'function') showToast('Quiet mode — sound stays off');
        } else {
          mutedPref = !mutedPref;
          try { localStorage.setItem('chaupaal_lehar_muted', mutedPref ? '1' : '0'); } catch (err) {}
        }
        slides.forEach((sl) => {
          const vid = sl.querySelector('video');
          if (vid) vid.muted = mutedPref;
          setMuteUi(sl, mutedPref);
        });
      });

      s.querySelector('[data-lehar-like]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = post();
        if (p) toggleLeharLike(s, p);
      });
      s.querySelector('[data-lehar-save]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = post();
        if (p) toggleLeharSave(s, p);
      });
      s.querySelector('[data-lehar-comment]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = post();
        if (p && typeof openDuniyaDetail === 'function') openDuniyaDetail(p);
      });
      s.querySelector('[data-lehar-share]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = post();
        if (p && typeof openShareSheet === 'function') openShareSheet(p);
        else if (p && navigator.share) {
          navigator.share({ title: 'Chaupaal', text: String(p.caption || '').slice(0, 120) }).catch(() => {});
          if (typeof recordDuniyaShare === 'function') recordDuniyaShare(p);
        }
      });
      s.querySelector('[data-lehar-avatar]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = post();
        const u = p?.user;
        if (!u) return;
        if (typeof tapAvatarFromFeed === 'function') tapAvatarFromFeed(u, { context: 'duniya' });
        else if (typeof openPublicProfile === 'function') openPublicProfile(u, { uid: u.uid, username: u.username, context: 'duniya' });
      });
      s.querySelector('[data-lehar-name]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = post();
        const u = p?.user;
        if (!u) return;
        if (typeof tapNameFromFeed === 'function') tapNameFromFeed(u);
        else if (typeof openProfileMessage === 'function') openProfileMessage(u);
      });

      let lastTap = 0;
      s.addEventListener('click', (e) => {
        if (e.target.closest('[data-lehar-mute],[data-lehar-like],[data-lehar-comment],[data-lehar-save],[data-lehar-share],[data-lehar-avatar],[data-lehar-name]')) return;
        const now = Date.now();
        if (now - lastTap < 320) {
          lastTap = 0;
          const p = post();
          if (p) toggleLeharLike(s, p);
          return;
        }
        lastTap = now;
        const vid = s.querySelector('video');
        if (!vid) return;
        if (vid.paused) vid.play().catch(() => {});
        else vid.pause();
      });
    });
    leharIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          const v = en.target.querySelector('video');
          if (!v) return;
          if (en.isIntersecting && en.intersectionRatio > 0.65) {
            const forceMute = mutedPref || leharQuietSound();
            v.muted = forceMute;
            v.play().catch(() => {
              v.muted = true;
              mutedPref = true;
              try { localStorage.setItem('chaupaal_lehar_muted', '1'); } catch (err) {}
              setMuteUi(en.target, true);
              v.play().catch(() => {});
            });
          } else {
            v.pause();
          }
        });
      },
      { root: feed, threshold: [0.65, 0.9] }
    );
    slides.forEach((s) => leharIo.observe(s));
  }
  function setDuniyaMode(next) {
    const map = { general: 'vishwa', vishwa: 'vishwa', lehar: 'lehar', prasidha: 'prasidha' };
    mode = map[next] || 'vishwa';
    document.querySelectorAll('[data-duniya-mode]').forEach((btn) => {
      const key = map[btn.dataset.duniyaMode] || btn.dataset.duniyaMode;
      const on = key === mode;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.getElementById('duniyaFeed')?.classList.toggle('hidden', mode !== 'vishwa');
    document.getElementById('duniyaStoriesRow')?.classList.toggle('hidden', mode !== 'vishwa');
    document.getElementById('leharFeed')?.classList.toggle('hidden', mode !== 'lehar');
    document.getElementById('prasidhaFeed')?.classList.toggle('hidden', mode !== 'prasidha');
    const panel = document.getElementById('panel-duniya') || document.getElementById('duniyaScreen');
    panel?.classList.toggle('is-lehar', mode === 'lehar');
    panel?.classList.toggle('is-prasidha', mode === 'prasidha');
    if (panel) {
      [...panel.classList].filter((c) => c.startsWith('room-kit')).forEach((c) => panel.classList.remove(c));
      panel.classList.add('room-kit', 'room-kit--water', `room-kit--${mode}`);
    }
    const hints = document.querySelectorAll('.duniya-mode-hint');
    hints.forEach((h) => h.remove());
    if (typeof cleanupModeHeaders === 'function') cleanupModeHeaders();
    if (mode === 'lehar') renderLeharFeed();
    if (mode === 'prasidha') renderPrasidhaFeed({ reset: true, force: true });
  }

  let _prasidhaCursor = 0;
  let _prasidhaLoading = false;
  let _prasidhaHasMore = false;

  function mergePrasidhaIntoPool(posts) {
    if (!Array.isArray(posts) || !posts.length) return;
    if (!Array.isArray(duniyaPosts)) duniyaPosts = [];
    posts.forEach((p) => {
      if (!p?.id || duniyaIsDemoPost(p)) return;
      const idx = duniyaPosts.findIndex((x) => x.id === p.id || x.firestoreId === p.id);
      const shaped = {
        ...p,
        firestoreId: p.firestoreId || p.id,
        isSample: false,
        isDemo: false,
        fromPrasidha: true,
      };
      if (idx >= 0) {
        duniyaPosts[idx] = { ...duniyaPosts[idx], ...shaped, likedByMe: duniyaPosts[idx].likedByMe, savedByMe: duniyaPosts[idx].savedByMe };
      } else {
        duniyaPosts.push(shaped);
      }
    });
  }

  async function fetchPrasidhaTrending({ reset = true, limit = 36 } = {}) {
    if (typeof apiFetch !== 'function') return { posts: [], empty: true, error: true };
    const offset = reset ? 0 : _prasidhaCursor;
    const envelope = await apiFetch('/api/stories', {
      method: 'POST',
      needAuth: !!(typeof currentUser !== 'undefined' && currentUser),
      body: {
        action: 'prasidha_trending',
        windowDays: 7,
        limit,
        offset,
      },
    });
    const data = envelope?.ok && envelope.data ? envelope.data : null;
    if (!data) return { posts: [], empty: true, error: true };
    return data;
  }

  async function openDuniyaPostById(postId) {
    const id = String(postId || '').trim();
    if (!id) {
      if (typeof showToast === 'function') showToast('Post unavailable');
      return;
    }
    let post = (duniyaPosts || []).find((x) => x.id === id || x.firestoreId === id) || null;
    if (!post && typeof apiFetch === 'function' && typeof currentUser !== 'undefined' && currentUser) {
      try {
        const env = await apiFetch('/api/stories', {
          method: 'POST',
          needAuth: true,
          body: { action: 'get', postId: id },
        });
        if (env?.ok && env.data?.post) {
          post = env.data.post;
          mergePrasidhaIntoPool([post]);
        }
      } catch (e) {}
    }
    if (!post || duniyaIsDemoPost(post) || post.deleted || post.archived || post.saveOnly) {
      if (typeof showToast === 'function') showToast('Post unavailable');
      return;
    }
    if (typeof openDuniyaDetail === 'function') openDuniyaDetail(post);
  }

  async function renderPrasidhaFeed(opts) {
    const o = opts || {};
    const host = document.getElementById('prasidhaFeed');
    if (!host) return;
    host.classList.add('room-kit', 'room-kit--water', 'room-kit--prasidha');

    const reset = o.reset !== false;
    if (_prasidhaLoading && !o.force) return;
    _prasidhaLoading = true;

    if (reset) {
      host.innerHTML = '';
      const loading = document.createElement('div');
      loading.className = 'prasidha-loading';
      loading.setAttribute('data-prasidha-loading', '1');
      loading.style.cssText = 'padding:16px;font-size:12px;color:var(--muted);text-align:center;';
      loading.textContent =
        typeof t === 'function'
          ? t('prasidha_sub') || 'Trending this week…'
          : 'Loading trending this week…';
      host.appendChild(loading);
      _prasidhaCursor = 0;
      _prasidhaHasMore = false;
    }

    let data;
    try {
      data = await fetchPrasidhaTrending({ reset, limit: 36 });
    } catch (e) {
      data = { posts: [], empty: true, error: true };
    }
    _prasidhaLoading = false;
    host.querySelector('[data-prasidha-loading]')?.remove();

    // Never present SAMPLE/Demo as trending (D0/D4)
    const clean = (Array.isArray(data?.posts) ? data.posts : []).filter(
      (p) => p?.id && !duniyaIsDemoPost(p) && !p.isSample && !p.isDemo && !p.isSeedContent
    );

    if (data?.error && reset && !clean.length) {
      host.innerHTML = '';
      if (typeof renderEmptyState === 'function') {
        renderEmptyState(host, {
          icon: '✨',
          title: typeof t === 'function' ? t('prasidha_empty_title') || 'Prasidha is warming up' : 'Prasidha is warming up',
          message: 'Couldn’t load trending. Try again — we don’t fill this with sample posts.',
          actionLabel: 'Retry',
          onAction: () => renderPrasidhaFeed({ reset: true, force: true }),
        });
      } else {
        host.innerHTML = '<div class="prasidha-empty">Couldn’t load trending</div>';
      }
      return;
    }

    if (reset && !clean.length) {
      host.innerHTML = '';
      if (typeof renderEmptyState === 'function') {
        renderEmptyState(host, {
          icon: '✨',
          title: typeof t === 'function' ? t('prasidha_empty_title') || 'Prasidha is warming up' : 'Prasidha is warming up',
          message:
            data?.emptyMessage ||
            (typeof t === 'function'
              ? t('prasidha_empty_msg') || 'Trending posts from the last week will land here.'
              : 'Trending posts from the last week will land here.'),
          actionLabel: 'Create post',
          onAction: () => {
            if (typeof openDuniyaPostSheet === 'function') openDuniyaPostSheet('post');
          },
          secondaryActions: [
            {
              label: 'Open Vishwa',
              onAction: () => setDuniyaMode('vishwa'),
            },
          ],
        });
      } else {
        host.innerHTML = '<div class="prasidha-empty">Prasidha is warming up</div>';
      }
      return;
    }

    mergePrasidhaIntoPool(clean);

    let grid = host.querySelector('.prasidha-masonry');
    if (reset || !grid) {
      grid = document.createElement('div');
      grid.className = 'prasidha-masonry';
      host.querySelector('.prasidha-masonry')?.remove();
      host.querySelector('.prasidha-load-more')?.remove();
      host.appendChild(grid);
    }

    clean.forEach((raw, i) => {
      const post = (duniyaPosts || []).find((x) => x.id === raw.id) || raw;
      const tile = document.createElement('div');
      const w = Number(post.mediaWidth || post.width || 0);
      const h = Number(post.mediaHeight || post.height || 0);
      const ratio = w && h ? w / h : i % 7 === 0 ? 0.7 : i % 5 === 0 ? 1.5 : 1;
      let span = 'prasidha-span-std';
      if (ratio >= 1.35) span = 'prasidha-span-wide';
      else if (ratio <= 0.72) span = 'prasidha-span-tall';
      else if (ratio >= 0.95 && ratio <= 1.05) span = 'prasidha-span-square';
      tile.className = `prasidha-tile ${span}`;
      tile.dataset.prasidhaId = String(post.id || '');
      try {
        const card = createDuniyaPost(post, { variant: 'tile' });
        if (card) {
          tile.appendChild(card);
        } else {
          throw new Error('no card');
        }
      } catch (e) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'prasidha-tile-fallback';
        const likes = Number(post.likes) || 0;
        const comments = Number(post.comments) || 0;
        btn.innerHTML = `<span class="prasidha-tile-cap">${duniyaEsc(String(post.caption || 'Post').slice(0, 100))}</span>
          <span class="prasidha-tile-meta">${likes} likes · ${comments} comments${post.metaHint ? ` · ${duniyaEsc(post.metaHint)}` : ''}</span>`;
        btn.addEventListener('click', () => openDuniyaPostById(post.id));
        tile.appendChild(btn);
      }
      grid.appendChild(tile);
    });

    _prasidhaCursor = (reset ? 0 : _prasidhaCursor) + clean.length;
    _prasidhaHasMore = !!data?.hasMore;

    let moreBtn = host.querySelector('.prasidha-load-more');
    if (_prasidhaHasMore) {
      if (!moreBtn) {
        moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'prasidha-load-more btn btn--ghost';
        moreBtn.textContent = 'Load more';
        moreBtn.style.cssText = 'display:block;margin:12px auto 24px;';
        host.appendChild(moreBtn);
        moreBtn.addEventListener('click', () => renderPrasidhaFeed({ reset: false }));
      }
      moreBtn.classList.remove('hidden');
    } else if (moreBtn) {
      moreBtn.classList.add('hidden');
    }

    // Best-effort like hydration for signed-in (sticky social)
    if (typeof hydrateContentLikes === 'function' && typeof currentUser !== 'undefined' && currentUser) {
      try {
        await hydrateContentLikes('duniya', clean);
      } catch (e) {}
    }
  }

  // Swipe between Lehar ← Vishwa → Prasidha
  (function wireDuniyaSwipe() {
    const screen = document.getElementById('duniyaScreen');
    if (!screen || typeof wireSectionSwipe !== 'function') return;
    wireSectionSwipe(screen, {
      onSwipe(dir) {
        const order = ['lehar', 'vishwa', 'prasidha'];
        const cur = order.indexOf(mode === 'general' ? 'vishwa' : mode);
        const next = order[Math.max(0, Math.min(2, cur + dir))];
        setDuniyaMode(next);
      },
    });
  })();

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-duniya-mode]');
    if (!btn) return;
    setDuniyaMode(btn.dataset.duniyaMode);
  });
  window.setDuniyaMode = setDuniyaMode;
  window.renderLeharFeed =
    typeof safeFeature === 'function' ? safeFeature('lehar_feed', renderLeharFeed) : renderLeharFeed;
  window.renderPrasidhaFeed = renderPrasidhaFeed;
  window.openDuniyaPostById = openDuniyaPostById;
})();

// Feed-render boundary (CONVENTIONS 4c) — dynamic list from network content
if (typeof safeFeature === 'function') renderDuniyaFeed = safeFeature('duniya_feed', renderDuniyaFeed);

