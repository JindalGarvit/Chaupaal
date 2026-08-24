// ===================== DUNIYA DATA =====================
const SAMPLE_DUNIYA=[
  {id:'d1',user:{name:'India Today',avatar:'📺',uid:'it',profileType:'professional'},type:'image',media:'https://picsum.photos/seed/news1/600/400',caption:'Breaking: Major policy announcement from Union Cabinet. #IndiaToday #News',likes:2847,comments:142,shares:389,timestamp:'2h',tags:[],followed:false,likedByMe:false},
  {id:'d2',user:{name:'Priya Krishnan',avatar:'👩‍🎨',uid:'pk',profileType:'personal'},type:'image',media:'https://picsum.photos/seed/art2/600/600',caption:'My latest artwork inspired by the monsoons 🌧️ What do you think? @ArtLovers #Art #Monsoon',likes:934,comments:67,shares:28,timestamp:'4h',tags:['ArtLovers'],followed:false,likedByMe:false},
  {id:'d3',user:{name:'StartupIndia',avatar:'🚀',uid:'si',profileType:'professional'},type:'video',media:null,caption:'5 Indian startups that are changing the world 🌏 Watch till the end! #Startup #India',likes:5201,comments:321,shares:1204,timestamp:'6h',tags:[],followed:false,likedByMe:false},
  {id:'d4',user:{name:'Chef Rahul',avatar:'👨‍🍳',uid:'cr',profileType:'professional'},type:'image',media:'https://picsum.photos/seed/food4/600/500',caption:'Dal makhani recipe that took me 10 years to perfect. Recipe in comments! 🍛 #Food #Recipe',likes:3102,comments:892,shares:1567,timestamp:'8h',tags:[],followed:false,likedByMe:false},
  {id:'d5',user:{name:'Riya Sharma',avatar:'😊',uid:'rs',profileType:'personal'},type:'image',media:'https://picsum.photos/seed/travel5/600/700',caption:'Ladakh calling 🏔️ Nothing compares to this. @Dev_travels #Travel #Ladakh',likes:1204,comments:89,shares:45,timestamp:'1d',tags:['Dev_travels'],followed:true,likedByMe:true},
];

let duniyaPosts=[...SAMPLE_DUNIYA];
let followingSet=new Set(SAMPLE_DUNIYA.filter(p=>p.followed).map(p=>p.user.uid));
let archiveItems=[];
/** Cursor state for Firestore Duniya feed (Phase 2). Samples seed the UI until live pages arrive. */
let duniyaPageCursor=null;
let duniyaHasMore=true;
let duniyaFeedLoading=false;
let duniyaLiveMode=false; // true once we've successfully read at least one Firestore page

function saveToArchive(item){
  archiveItems.unshift({...item,archivedAt:new Date().toISOString()});
  try{localStorage.setItem('chaupaal_archive',JSON.stringify(archiveItems.slice(0,200)));}catch(e){}
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
      mapped.forEach(p=>{
        p.followed=!!states[p.user?.uid]?.following;
        if(p.followed) followingSet.add(p.user.uid);
        else followingSet.delete(p.user.uid);
      });
    }
    if(reset&&mapped.length){
      duniyaLiveMode=true;
      duniyaPosts=mapped;
    } else if(mapped.length){
      const seen=new Set(duniyaPosts.map(p=>p.firestoreId||p.id));
      mapped.forEach(p=>{ if(!seen.has(p.firestoreId||p.id)) duniyaPosts.push(p); });
    } else if(reset){
      // Empty Firestore — keep samples so the tab isn't blank for demos.
      duniyaLiveMode=false;
      duniyaPosts=[...SAMPLE_DUNIYA];
    }
    duniyaPageCursor=page.lastDoc;
    duniyaHasMore=page.hasMore;
    return {loaded:mapped.length};
  }catch(e){
    console.warn('[duniya] page load failed', e);
    if(typeof showToast==='function'&&reset) showToast(typeof friendlyError==='function'?friendlyError(e):t('duniya_feed_fail'));
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
  renderDuniyaFeed();
  // Hydrate from Firestore with cursor pagination when signed in.
  if(db&&currentUser){
    const feed=document.getElementById('duniyaFeed');
    if(typeof renderSkeleton==='function'&&feed) renderSkeleton(feed,{variant:'feed',count:2});
    loadDuniyaPage({reset:true}).then(()=>renderDuniyaFeed());
  }
  document.getElementById('duniyaPostBtn')?.addEventListener('click',openDuniyaPostSheet);
  const runDuniyaSearch = () => {
    if (typeof openUniversalSearch === 'function') openUniversalSearch({ types: ['users', 'posts', 'groups'] });
    else if (typeof showToast === 'function') showToast(t('duniya_search_unavailable'));
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
  if(!feed||duniyaLiveMode||typeof currentUser!=='undefined'&&currentUser)return;
  try{if(sessionStorage.getItem('chaupaal_duniya_demo_dismissed')==='1')return;}catch(e){}
  const existing=feed.querySelector('.duniya-demo-banner');
  if(existing)return;
  const banner=document.createElement('div');
  banner.className='duniya-demo-banner';
  banner.setAttribute('role','status');
  banner.innerHTML=`<span class="duniya-demo-banner-text">Sample posts — sign in to see your real feed</span>
    <button type="button" class="btn btn--primary duniya-demo-banner-cta" data-duniya-demo-signin>Sign in</button>
    <button type="button" class="duniya-demo-banner-dismiss" data-duniya-demo-dismiss aria-label="Dismiss">×</button>`;
  banner.querySelector('[data-duniya-demo-signin]')?.addEventListener('click',()=>{
    if(typeof openAuthSheet==='function')openAuthSheet('login');
    else if(typeof showToast==='function')showToast('Sign in from the menu');
  });
  banner.querySelector('[data-duniya-demo-dismiss]')?.addEventListener('click',()=>{
    try{sessionStorage.setItem('chaupaal_duniya_demo_dismissed','1');}catch(e){}
    banner.remove();
  });
  feed.insertBefore(banner,feed.firstChild);
}

function renderDuniyaFeed(){
  const feed=document.getElementById('duniyaFeed');if(!feed)return;
  const visible=duniyaPosts.filter(p=>!(typeof isSoftDeleted==='function'?isSoftDeleted(p):p.deleted)).filter(p=>p.archived!==true);
  feed.innerHTML='';
  if(!visible.length){
    if(typeof renderEmptyState==='function'){
      renderEmptyState(feed, {
        icon: (typeof TabElements!=='undefined'&&TabElements.markHtml)?TabElements.markHtml('duniya',40):(typeof iconHtml==='function'?iconHtml('globe',{size:40,className:'cp-icon--empty'}):'🌍'),
        title:'No posts yet',
        message:'Be the first to share something with Duniya.',
        actionLabel:'Create a post',
        onAction:()=>typeof openDuniyaPostSheet==='function'&&openDuniyaPostSheet(),
      });
    } else {
      feed.innerHTML='<div style="padding:32px;text-align:center;color:var(--muted);">No posts yet</div>';
    }
    return;
  }
  visible.forEach(post=>feed.appendChild(createDuniyaPost(post)));
  renderDuniyaDemoBanner(feed);
  if(typeof enhanceMediaIn==='function') enhanceMediaIn(feed);
  if(typeof mountMusicCards==='function') mountMusicCards(feed);
  if(typeof mountLocationCards==='function') mountLocationCards(feed);
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
  const el=document.createElement('div');el.className='duniya-post'+(variant==='tile'?' duniya-post--tile':'');el.dataset.id=post.id;
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
  const mediaWrapAttrs=hasMediaSize?` data-has-ratio="1" class="duniya-post-media duniya-post-media--ratio" style="--media-ratio:${w}/${h};max-height:${duniyaStageMaxH()}px;"`:` class="duniya-post-media"`;
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
        <div class="duniya-post-name">${headerName}</div>
        <div class="duniya-post-meta">${duniyaEsc(typeof formatRelativeTime==='function'?formatRelativeTime(post.ts||post.timestamp):post.timestamp)} · <span class="cp-tab-mark" data-tab-mark="duniya" aria-hidden="true"></span> ${duniyaEsc(audienceLabel)}${locName?` · <button type="button" class="duniya-loc-line" data-loc>${duniyaEsc(locName)}</button>`:''}</div>
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
    ${hideLikes?'':`<div class="duniya-post-likes">${formatCount(post.likes||0)} likes</div>`}
    ${slides.length?`<div class="duniya-post-caption-row">
      <div class="duniya-post-caption"><strong class="duniya-post-name">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(post.user.name,post.user):duniyaEsc(post.user.name)}</strong> ${caption}</div>
      ${post.caption?`<button type="button" class="duniya-caption-speak" title="Listen to caption" aria-label="Listen to caption">${typeof iconHtml==='function'?iconHtml('volume',{size:16}):'🔊'}</button>`:''}
    </div>`:''}
    ${previewHtml}
    ${previewTotal>0&&!post.commentsOff?`<div class="duniya-view-comments">View all ${previewTotal} comments</div>`:(previewTotal>0&&own?`<div class="duniya-view-comments">View comments</div>`:'')}
  `;
  const postAvatar=el.querySelector('.duniya-post-avatar');
  if(typeof bindProfileLongPress==='function') bindProfileLongPress(postAvatar,post.user);
  postAvatar?.addEventListener('click',()=>{
    if(typeof openProfilePeek==='function') openProfilePeek(post.user,{uid:post.user.uid,username:post.user.username});
    else if(typeof openPublicProfile==='function') openPublicProfile(post.user,{uid:post.user.uid,username:post.user.username,context:'duniya'});
  });

  // Like — optimistic (UI first, rate-limit/persist after)
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
              }
            }
          },
        });
      } else {
        apply();
      }
    } finally {
      delete btn.dataset.busy;
    }
  });

  // Save / unsave
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
    try {
      if (typeof toggleContentSaved === 'function') {
        const saved = await toggleContentSaved('duniya', p);
        if (saved.persisted) {
          p.savedByMe = saved.saved;
          post.savedByMe = saved.saved;
          btn.classList.toggle('saved', saved.saved);
          btn.setAttribute('aria-pressed', saved.saved ? 'true' : 'false');
          if (typeof showToast === 'function') showToast(saved.saved ? 'Saved' : 'Removed from saved');
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
        btn.textContent = 'Follow';
        btn.classList.remove('following');
        if(typeof setFollowing==='function'){
          try{ await setFollowing(uid,false,'duniya_post'); }
          catch(err){
            followingSet.add(uid);
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
          btn.textContent = 'Following';
          btn.classList.add('following');
          if (typeof SoundLib !== 'undefined' && SoundLib.follow) SoundLib.follow();
          if (typeof haptic === 'function') haptic('success');
        };
        const revert = () => {
          followingSet.delete(uid);
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
  el.querySelectorAll('.feed-comment-row').forEach((row)=>row.addEventListener('click',(e)=>{
    e.stopPropagation();
    openDuniyaDetail(post,{focusCommentId:row.dataset.commentId});
  }));
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
      const handle=btn.dataset.mention;
      try{
        if(typeof searchUsersProvider==='function'){
          const rows=await searchUsersProvider(handle,{limit:1});
          const u=rows?.[0];
          if(u && typeof openPublicProfile==='function'){
            openPublicProfile(u,{uid:u.uid,username:u.username,context:'duniya'});
            return;
          }
        }
        if(typeof openUniversalSearch==='function') openUniversalSearch('@'+handle);
      }catch(err){}
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
        if(typeof openPublicProfile==='function') openPublicProfile({uid:t.uid,name:t.name,username:t.username},{uid:t.uid,username:t.username,context:'duniya'});
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
        <div class="duniya-comments-subtitle">${post.comments||0} on ${post.user?.name||'this post'}</div>
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
    if(typeof showAuth==='function') showAuth();
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

// ===================== PRIVATE ARCHIVE =====================
function openArchive(){
  loadArchive();
  const overlay=document.createElement('div');overlay.className='archive-overlay';
  const peepalItems=peepalQuestions.filter(q=>q.user.uid===currentUser?.uid||q.user.name==='You');
  const allItems=[...archiveItems,...peepalItems.map(q=>({type:'peepal_post',question:q.question,ts:q.timeAgo})),...duniyaPosts.filter(p=>p.user.uid===currentUser?.uid||p.user.name==='You').map(p=>({type:'duniya_post',...p}))];

  overlay.innerHTML=`
    <div class="archive-header">
      <button id="archiveBack" class="cp-back-btn" aria-label="Back">${typeof iconHtml==='function'?iconHtml('arrow-left',{size:22}):''}</button>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">🗄️ My Archive</div>
      <button id="openRecoveryBinBtn" style="background:none;border:2px solid var(--line);border-radius:10px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;">🗑️ Deleted</button>
    </div>
    <div style="flex:1;overflow-y:auto;">
      ${allItems.length===0?`<div style="text-align:center;padding:40px;color:var(--muted);">Your archive is empty. Everything you post will appear here automatically.</div>`:''}
      ${(()=>{
        const journalItems=allItems.filter(i=>i.type==='journal_entry');
        if(!journalItems.length)return'';
        return`<div class="archive-section-title">🌙 Evening Journal <span style="font-weight:400;color:var(--muted);font-size:11px;">· private, never shown to anyone</span></div>
        <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:8px;">
          ${journalItems.map(item=>`
            <div style="background:var(--white);border-radius:14px;padding:14px;border:1px solid var(--line);">
              <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:6px;">${new Date(item.ts).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
              <div style="font-size:13px;line-height:1.6;color:var(--ink);">${item.content}</div>
            </div>
          `).join('')}
        </div>`;
      })()}
      ${['duniya_post','duniya_story','peepal_post','baithak_story','comment'].map(type=>{
        const items=allItems.filter(i=>i.type===type);
        if(!items.length)return'';
        const labels={duniya_post:'🌍 Duniya Posts',duniya_story:'🌍 Duniya Stories',peepal_post:'🌳 Peepal Questions',baithak_story:'💬 Baithak Stories',comment:'💬 Comments',journal_entry:'🌙 Journal'};
        return`<div class="archive-section-title">${labels[type]||type}</div>
        <div class="archive-grid">
          ${items.map(item=>`
            <div class="archive-cell">
              ${item.media?`<img src="${item.media}" loading="lazy" alt="${item.type==='peepal_post'?'Peepal':'Duniya'} archive item">`:`<div style="background:linear-gradient(135deg,var(--red),#8134AF);width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;">${item.type==='peepal_post'?'🌳':item.type==='comment'?'💬':'📝'}</div>`}
              <div class="archive-cell-label">${item.type==='peepal_post'?'Q':item.type==='comment'?'💬':'📸'}</div>
            </div>
          `).join('')}
        </div>`;
      }).join('')}
    </div>
  `;
  document.querySelector('.device').appendChild(overlay);
  document.getElementById('archiveBack').addEventListener('click',()=>overlay.remove());
  document.getElementById('openRecoveryBinBtn')?.addEventListener('click',()=>{
    overlay.remove();
    if(typeof openRecoveryBin==='function') openRecoveryBin();
  });
  setTimeout(()=>{
    if(focusComposer) commentInput?.focus();
    if(focusCommentId && typeof focusCommentRow==='function') focusCommentRow(listEl,focusCommentId);
  },100);
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
    const media = p.media || p.video || '';
    const type = String(p.mediaType || p.type || '').toLowerCase();
    if (type.includes('video')) return true;
    return /\.(mp4|webm|mov)(\?|$)/i.test(media) || /\/video\//i.test(media);
  }
  function renderLeharFeed() {
    const feed = document.getElementById('leharFeed');
    if (!feed) return;
    if (leharIo) {
      try { leharIo.disconnect(); } catch (e) {}
      leharIo = null;
    }
    const videos = (duniyaPosts || [])
      .filter((p) => !(typeof isSoftDeleted === 'function' ? isSoftDeleted(p) : p.deleted))
      .filter((p) => p.archived !== true)
      .filter(isVideoPost);
    if (!videos.length) {
      feed.innerHTML =
        `<div class="lehar-empty">
          <strong>Lehar</strong>
          <p>Short videos from Duniya wave through here.</p>
          <button type="button" class="btn btn--primary" data-lehar-create>Post a clip</button>
        </div>`;
      feed.querySelector('[data-lehar-create]')?.addEventListener('click', () => {
        if (typeof openDuniyaPostSheet === 'function') openDuniyaPostSheet('post');
      });
      return;
    }
    feed.innerHTML = videos
      .map((p, i) => {
        const src = p.media || p.video;
        const name = p.user?.name || 'Member';
        const postId = p.id || '';
        const likes = Number(p.likes) || 0;
        const comments = Number(p.comments) || 0;
        const liked = !!p.likedByMe;
        const avatar = p.user?.photoURL || (p.user?.avatar && /^https:/.test(p.user.avatar) ? p.user.avatar : '');
        return `<section class="lehar-slide" data-lehar-i="${i}" data-lehar-id="${duniyaEsc(postId)}">
          <video src="${duniyaEsc(src)}" playsinline loop muted preload="metadata"></video>
          <div class="lehar-progress"><i data-lehar-progress></i></div>
          <button type="button" class="lehar-mute-btn" aria-label="Toggle mute" data-lehar-mute>🔇</button>
          <div class="lehar-double-heart" aria-hidden="true">♥</div>
          <div class="lehar-actions">
            <button type="button" class="lehar-action ${liked ? 'is-liked' : ''}" data-lehar-like aria-label="Like">
              <span aria-hidden="true">♥</span><em data-lehar-likes>${likes}</em>
            </button>
            <button type="button" class="lehar-action" data-lehar-comment aria-label="Comments">
              <span aria-hidden="true">💬</span><em>${comments}</em>
            </button>
            <button type="button" class="lehar-action" data-lehar-share aria-label="Share">
              <span aria-hidden="true">↗</span><em>Share</em>
            </button>
          </div>
          <div class="lehar-meta">
            <button type="button" class="lehar-author" data-lehar-author>
              ${avatar ? `<img src="${duniyaEsc(avatar)}" alt="">` : `<span class="lehar-author-fallback">${duniyaEsc((name || '?').slice(0, 1))}</span>`}
              <strong>${duniyaEsc(name)}</strong>
            </button>
            <p>${duniyaEsc((p.caption || '').slice(0, 120))}</p>
          </div>
        </section>`;
      })
      .join('');
    if (typeof enhanceMediaIn === 'function') enhanceMediaIn(feed);
    let mutedPref = true;
    try { mutedPref = localStorage.getItem('chaupaal_lehar_muted') !== '0'; } catch (e) {}
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
        mutedPref = !mutedPref;
        try { localStorage.setItem('chaupaal_lehar_muted', mutedPref ? '1' : '0'); } catch (err) {}
        slides.forEach((sl) => {
          const vid = sl.querySelector('video');
          if (vid) vid.muted = mutedPref;
          setMuteUi(sl, mutedPref);
        });
      });

      const likeSlide = () => {
        const p = post();
        if (p && !p.likedByMe) {
          const feedCard = document.querySelector(`.duniya-post[data-id="${postId}"] .like-btn`);
          if (feedCard) feedCard.click();
          else {
            p.likedByMe = true;
            p.likes = (p.likes || 0) + 1;
            if (typeof haptic === 'function') haptic('light');
          }
        } else if (typeof haptic === 'function') haptic('light');
        const heart = s.querySelector('.lehar-double-heart');
        if (heart) {
          heart.classList.remove('is-pop');
          void heart.offsetWidth;
          heart.classList.add('is-pop');
        }
        const likeBtn = s.querySelector('[data-lehar-like]');
        const likesEl = s.querySelector('[data-lehar-likes]');
        likeBtn?.classList.add('is-liked');
        if (likesEl && p) likesEl.textContent = String(p.likes || 0);
      };

      s.querySelector('[data-lehar-like]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        likeSlide();
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
        }
      });
      s.querySelector('[data-lehar-author]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = post();
        const u = p?.user;
        if (u?.uid && typeof openPublicProfile === 'function') {
          openPublicProfile(u, { uid: u.uid, username: u.username, context: 'duniya' });
        }
      });

      let lastTap = 0;
      s.addEventListener('click', (e) => {
        if (e.target.closest('[data-lehar-mute],[data-lehar-like],[data-lehar-comment],[data-lehar-share],[data-lehar-author]')) return;
        const now = Date.now();
        if (now - lastTap < 320) {
          lastTap = 0;
          likeSlide();
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
            v.muted = mutedPref;
            v.play().catch(() => {
              v.muted = true;
              mutedPref = true;
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
    if (panel) {
      [...panel.classList].filter((c) => c.startsWith('room-kit')).forEach((c) => panel.classList.remove(c));
      panel.classList.add('room-kit', 'room-kit--water', `room-kit--${mode}`);
    }
    const hints = document.querySelectorAll('.duniya-mode-hint');
    hints.forEach((h) => h.remove());
    if (mode === 'lehar') renderLeharFeed();
    if (mode === 'prasidha') renderPrasidhaFeed();
  }

  function renderPrasidhaFeed() {
    const host = document.getElementById('prasidhaFeed');
    if (!host) return;
    host.classList.add('room-kit', 'room-kit--water', 'room-kit--prasidha');
    const ranked =
      typeof rankByVelocity === 'function'
        ? rankByVelocity(duniyaPosts || [], {
            friendUids: typeof followingSet !== 'undefined' ? [...followingSet] : [],
          })
        : [...(duniyaPosts || [])];
    host.innerHTML = `<div class="room-kit-header">Prasidha<small>${
      typeof t === 'function' && t('prasidha_sub') !== 'prasidha_sub'
        ? t('prasidha_sub')
        : 'Trending this week'
    }</small></div>`;
    const grid = document.createElement('div');
    grid.className = 'prasidha-masonry';
    ranked.slice(0, 40).forEach((post, i) => {
      const tile = document.createElement('div');
      const w = Number(post.mediaWidth || post.width || post.media?.width || 0);
      const h = Number(post.mediaHeight || post.height || post.media?.height || 0);
      const ratio = w && h ? w / h : i % 7 === 0 ? 0.7 : i % 5 === 0 ? 1.5 : 1;
      let span = 'prasidha-span-std';
      if (ratio >= 1.35) span = 'prasidha-span-wide';
      else if (ratio <= 0.72) span = 'prasidha-span-tall';
      else if (ratio >= 0.95 && ratio <= 1.05) span = 'prasidha-span-square';
      tile.className = `prasidha-tile ${span}`;
      try {
        const card = createDuniyaPost(post, { variant: 'tile' });
        if (card) tile.appendChild(card);
        else tile.appendChild(createDuniyaPost(post, { variant: 'list' }));
      } catch (e) {
        tile.appendChild(createDuniyaPost(post, { variant: 'list' }));
      }
      grid.appendChild(tile);
    });
    host.appendChild(grid);
    if (!ranked.length && typeof renderEmptyState === 'function') {
      renderEmptyState(host, {
        icon: '✨',
        title: typeof t === 'function' ? t('prasidha_empty_title') || 'Prasidha is warming up' : 'Prasidha is warming up',
        message:
          typeof t === 'function'
            ? t('prasidha_empty_msg') || 'Trending posts from the last week will land here.'
            : 'Trending posts from the last week will land here.',
      });
    }
  }

  // Swipe between Lehar ← Vishwa → Prasidha
  (function wireDuniyaSwipe() {
    const screen = document.getElementById('duniyaScreen');
    if (!screen || screen.dataset.swipeWired) return;
    screen.dataset.swipeWired = '1';
    let sx = 0;
    let sy = 0;
    let locked = null;
    screen.addEventListener(
      'touchstart',
      (e) => {
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        locked = null;
      },
      { passive: true }
    );
    screen.addEventListener(
      'touchmove',
      (e) => {
        const dx = e.touches[0].clientX - sx;
        const dy = e.touches[0].clientY - sy;
        if (!locked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
          locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        }
      },
      { passive: true }
    );
    screen.addEventListener(
      'touchend',
      (e) => {
        if (locked !== 'h') return;
        const dx = (e.changedTouches[0]?.clientX || 0) - sx;
        if (Math.abs(dx) < 56) return;
        const order = ['lehar', 'vishwa', 'prasidha'];
        const cur = order.indexOf(mode === 'general' ? 'vishwa' : mode);
        const next = order[Math.max(0, Math.min(2, cur + (dx < 0 ? 1 : -1)))];
        setDuniyaMode(next);
      },
      { passive: true }
    );
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
})();

// Feed-render boundary (CONVENTIONS 4c) — dynamic list from network content
if (typeof safeFeature === 'function') renderDuniyaFeed = safeFeature('duniya_feed', renderDuniyaFeed);

