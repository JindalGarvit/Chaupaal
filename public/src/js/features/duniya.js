// ===================== DUNIYA DATA =====================
const SAMPLE_DUNIYA=[
  {id:'d1',user:{name:'India Today',avatar:'📺',uid:'it'},type:'image',media:'https://picsum.photos/seed/news1/600/400',caption:'Breaking: Major policy announcement from Union Cabinet. #IndiaToday #News',likes:2847,comments:142,shares:389,timestamp:'2h',tags:[],followed:false,likedByMe:false},
  {id:'d2',user:{name:'Priya Krishnan',avatar:'👩‍🎨',uid:'pk'},type:'image',media:'https://picsum.photos/seed/art2/600/600',caption:'My latest artwork inspired by the monsoons 🌧️ What do you think? @ArtLovers #Art #Monsoon',likes:934,comments:67,shares:28,timestamp:'4h',tags:['ArtLovers'],followed:false,likedByMe:false},
  {id:'d3',user:{name:'StartupIndia',avatar:'🚀',uid:'si'},type:'video',media:null,caption:'5 Indian startups that are changing the world 🌏 Watch till the end! #Startup #India',likes:5201,comments:321,shares:1204,timestamp:'6h',tags:[],followed:false,likedByMe:false},
  {id:'d4',user:{name:'Chef Rahul',avatar:'👨‍🍳',uid:'cr'},type:'image',media:'https://picsum.photos/seed/food4/600/500',caption:'Dal makhani recipe that took me 10 years to perfect. Recipe in comments! 🍛 #Food #Recipe',likes:3102,comments:892,shares:1567,timestamp:'8h',tags:[],followed:false,likedByMe:false},
  {id:'d5',user:{name:'Riya Sharma',avatar:'😊',uid:'rs'},type:'image',media:'https://picsum.photos/seed/travel5/600/700',caption:'Ladakh calling 🏔️ Nothing compares to this. @Dev_travels #Travel #Ladakh',likes:1204,comments:89,shares:45,timestamp:'1d',tags:['Dev_travels'],followed:true,likedByMe:true},
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
  return {
    id: raw.id,
    firestoreId: raw.id,
    user: raw.user||{name:raw.name||'User',avatar:raw.avatar||'👤',uid:raw.uid},
    type: raw.type||'image',
    media: raw.media||null,
    thumb: raw.thumb||null,
    mediaPath: raw.mediaPath||null,
    thumbPath: raw.thumbPath||null,
    mediaWidth: Number(raw.mediaWidth||raw.width)||null,
    mediaHeight: Number(raw.mediaHeight||raw.height)||null,
    caption: raw.caption||'',
    likes: raw.likes||0,
    comments: raw.comments||0,
    shares: raw.shares||0,
    timestamp: created?undefined:raw.timestamp,
    ts: created||raw.ts||Date.now(),
    tags: raw.tags||[],
    followed: false,
    likedByMe: false,
    audience: raw.audience||'public',
    uid: raw.uid,
    deleted: !!raw.deleted,
  };
}

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
    const mapped=page.items.map(mapDuniyaDoc).filter(p=>!p.deleted&&!(typeof isSoftDeleted==='function'&&isSoftDeleted(p)));
    if(typeof hydrateContentLikes==='function') await hydrateContentLikes('duniya',mapped);
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
    if(typeof showToast==='function'&&reset) showToast(typeof friendlyError==='function'?friendlyError(e):'Couldn’t load Duniya feed');
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
  document.getElementById('duniyaPostBtn').addEventListener('click',openDuniyaPostSheet);
  document.getElementById('duniyaSearchBtn').addEventListener('click',()=>{
    if(typeof openUniversalSearch==='function') openUniversalSearch({types:['users']});
    else showToast('Search unavailable');
  });
}

async function renderDuniyaStories(){
  const row=document.getElementById('duniyaStoriesRow');if(!row)return;
  let stories=[];
  if(currentUser&&typeof loadStoryFeed==='function'){
    try{stories=await loadStoryFeed('duniya');}catch(error){console.warn('[stories] Duniya feed',error);}
  }
  if(stories.length&&typeof hydrateRelationships==='function'){
    const states=await hydrateRelationships(stories.map(story=>story.uid)).catch(()=>({}));
    stories.sort((a,b)=>{
      const followDelta=Number(!!states[b.uid]?.following)-Number(!!states[a.uid]?.following);
      return followDelta||b.createdAt-a.createdAt;
    });
  }
  const groups=new Map();
  stories.forEach(story=>{
    if(!groups.has(story.uid))groups.set(story.uid,[]);
    groups.get(story.uid).push(story);
  });
  const storyUsers=[{name:'Your story',avatar:'＋',self:true},...[...groups.values()].map(group=>({...group[0],stories:group}))];
  row.innerHTML=storyUsers.map((u,index)=>`
    <div class="duniya-story-item" data-story-index="${index}">
      <div class="duniya-story-ring" style="${u.self?'background:var(--line);':''}">
        <div class="duniya-story-avatar" style="${u.self?'border:2px dashed var(--muted);':''}">
          ${u.self?'<span style="font-size:24px;color:var(--muted);">＋</span>':u.avatar&&/^https:/.test(u.avatar)?`<img src="${u.avatar}">`:`<span>${u.avatar||'👤'}</span>`}
        </div>
      </div>
      <div class="duniya-story-name">${u.self?'Add story':u.name.split(' ')[0]}</div>
    </div>
  `).join('');
  row.querySelectorAll('.duniya-story-item').forEach(item=>{
    const u=storyUsers[Number(item.dataset.storyIndex)];
    if(!u.self&&u.uid&&typeof bindProfileLongPress==='function'){
      bindProfileLongPress(item.querySelector('.duniya-story-avatar'),{
        uid:u.uid,name:u.name,avatar:u.avatar,photoURL:/^https:/.test(u.avatar||'')?u.avatar:'',
      });
    }
    item.addEventListener('click',()=>{
      const storyUser=storyUsers[Number(item.dataset.storyIndex)];
      if(storyUser.self){
        const s=document.createElement('div');
        s.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;';
        s.innerHTML=`
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;margin-bottom:4px;">Add to Duniya Story</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Duniya Stories are public and discoverable.</div>
          <label style="display:flex;align-items:center;gap:12px;padding:13px;background:var(--cream);border-radius:14px;cursor:pointer;margin-bottom:10px;font-weight:600;font-size:14px;">
            📷 Add photo or video<input type="file" accept="image/*,video/*" id="duniyaStoryFile" style="display:none;">
          </label>
          <button id="closeDuniyaStorySheet" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;margin-top:10px;">Cancel</button>
        `;
        document.querySelector('.device').appendChild(s);
        if(typeof enableSwipeDismiss==='function') enableSwipeDismiss(s,()=>s.remove());
        document.getElementById('closeDuniyaStorySheet').addEventListener('click',()=>s.remove());
        document.getElementById('duniyaStoryFile').addEventListener('change',async e=>{
          const file=e.target.files[0];if(!file)return;
          s.remove();
          showToast('Preparing story…');
          try{
            if(typeof processAndUploadMedia!=='function')throw new Error('Media upload unavailable');
            const up=await processAndUploadMedia(file,{folder:'stories'});
            await createPlatformStory({
              destination:'duniya',kind:'story',type:'media',
              media:up.media,thumb:up.thumb,
              mediaType:file.type.startsWith('video')?'video':'image',
            });
            await renderDuniyaStories();
            showToast('Story shared publicly on Duniya');
          }catch(err){
            showToast(typeof friendlyError==='function'?friendlyError(err):(err.message||'Story upload failed'));
          }
        });
      }else openStoryViewer(storyUser.stories[0],storyUser.stories);
    });
  });
}

function renderDuniyaFeed(){
  const feed=document.getElementById('duniyaFeed');if(!feed)return;
  const visible=duniyaPosts.filter(p=>!(typeof isSoftDeleted==='function'?isSoftDeleted(p):p.deleted)).filter(p=>p.archived!==true);
  feed.innerHTML='';
  if(!visible.length){
    if(typeof renderEmptyState==='function'){
      renderEmptyState(feed, {
        icon:'🌍',
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

function duniyaHeartIcon(){
  return`<svg class="duniya-heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.2-4.35-9.55-8.55C.5 8.95 2.35 4.5 6.4 4.5c2.25 0 3.75 1.3 4.6 2.55.85-1.25 2.35-2.55 4.6-2.55 4.05 0 5.9 4.45 3.95 7.95C19.2 16.65 12 21 12 21Z"/></svg>`;
}

function createDuniyaPost(post, {variant='list'}={}){
  const el=document.createElement('div');el.className='duniya-post';el.dataset.id=post.id;
  const isFollowing=followingSet.has(post.user.uid);
  const caption=post.caption.replace(/@(\w+)/g,'<span class="duniya-post-tag">@$1</span>').replace(/#(\w+)/g,'<span style="color:var(--red);cursor:pointer;">#$1</span>');
  const imgSrc=typeof mediaUrlFor==='function'?mediaUrlFor(post, variant): (post.thumb||post.media);
  const mediaWidth=Number(post.mediaWidth||post.width)||0;
  const mediaHeight=Number(post.mediaHeight||post.height)||0;
  const hasMediaSize=mediaWidth>0&&mediaHeight>0;
  const mediaSizeAttrs=hasMediaSize?` width="${mediaWidth}" height="${mediaHeight}" style="aspect-ratio:${mediaWidth}/${mediaHeight};"`:'';
  const mediaWrapAttrs=hasMediaSize?` data-has-ratio="1" style="--media-ratio:${mediaWidth}/${mediaHeight};"`:'';
  el.innerHTML=`
    <div class="duniya-post-header">
      <div class="duniya-post-avatar">${post.user.photoURL?`<img src="${post.user.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`:`<span>${post.user.avatar}</span>`}</div>
      <div class="duniya-post-user">
        <div class="duniya-post-name">${post.user.name}</div>
        <div class="duniya-post-meta">${typeof formatRelativeTime==='function'?formatRelativeTime(post.ts||post.timestamp):post.timestamp} · 🌍 Public</div>
      </div>
      <button class="duniya-follow-btn ${isFollowing?'following':''}" data-uid="${post.user.uid}" aria-label="${isFollowing?'Unfollow':'Follow'} ${post.user.name}">${isFollowing?'Following':'Follow'}</button>
      ${(currentUser&&(post.user?.uid===currentUser.uid||post.uid===currentUser.uid))?`<button type="button" class="duniya-delete-btn" title="Delete" aria-label="Delete post" style="background:none;border:none;font-size:16px;cursor:pointer;color:var(--muted);padding:4px;">🗑️</button>`:''}
      <button style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);padding:4px;" class="duniya-more-btn" aria-label="More options">⋯</button>
    </div>
    <div class="duniya-post-media"${mediaWrapAttrs}>
      ${post.type==='video'
        ?(post.media
          ?`<video src="${post.media}" controls playsinline preload="none"></video>`
          :`<div class="duniya-post-media-placeholder">🎬<div style="font-size:14px;color:rgba(255,255,255,0.6);margin-top:8px;">Video</div></div>`)
        :(imgSrc
          ?`<img data-no-zoom="1" src="${imgSrc}" loading="lazy" decoding="async" alt="Post by ${post.user.name}"${mediaSizeAttrs} ${variant==='list'&&post.media&&post.media!==imgSrc?`data-full="${post.media}"`:''}>
             <button type="button" class="duniya-expand-media cp-tap-target" aria-label="Open image full screen">⛶</button>`
          :`<div class="duniya-post-media-placeholder">📷</div>`)
      }
    </div>
    <div class="duniya-post-actions">
      <button class="duniya-action-btn like-btn ${post.likedByMe?'liked':''}" data-id="${post.id}" aria-label="Like this post" aria-pressed="${post.likedByMe?'true':'false'}">${duniyaHeartIcon()}</button>
      <button class="duniya-action-btn comment-btn" data-id="${post.id}" aria-label="Open comments"><span aria-hidden="true">💬</span></button>
      <button class="duniya-action-btn share-btn" data-id="${post.id}" aria-label="Share post"><span aria-hidden="true">↗</span></button>
      <button class="duniya-action-btn duniya-bookmark-btn" data-id="${post.id}" aria-label="Bookmark"><span aria-hidden="true">🔖</span></button>
    </div>
    <div class="duniya-post-likes">${formatCount(post.likedByMe?post.likes:post.likes)} likes</div>
    <div class="duniya-post-caption"><strong class="duniya-post-name">${post.user.name}</strong> ${caption}</div>
    ${post.comments>0?`<div class="duniya-view-comments">View all ${post.comments} comments</div>`:''}
  `;
  const postAvatar=el.querySelector('.duniya-post-avatar');
  if(typeof bindProfileLongPress==='function') bindProfileLongPress(postAvatar,post.user);
  postAvatar?.addEventListener('click',()=>{
    if(typeof openPublicProfile==='function') openPublicProfile(post.user,{uid:post.user.uid,username:post.user.username,context:'duniya'});
  });

  // Like — optimistic (UI first, rate-limit/persist after)
  const likeBtn=el.querySelector('.like-btn');
  likeBtn.addEventListener('click', async (e) => {
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
      el.querySelector('.duniya-post-likes').textContent = `${formatCount(p.likes)} likes`;
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
      el.querySelector('.duniya-post-likes').textContent = `${formatCount(prevLikes)} likes`;
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
                el.querySelector('.duniya-post-likes').textContent = `${formatCount(saved.likes)} likes`;
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

  // Feed media: double-tap/double-click likes; a dedicated button opens viewer.
  const mediaImg=el.querySelector('.duniya-post-media img');
  const expandBtn=el.querySelector('.duniya-expand-media');
  if(mediaImg&&expandBtn){
    mediaImg.setAttribute('data-no-zoom','1');
    mediaImg.classList.remove('cp-zoomable');
    delete mediaImg.dataset.zoomBound;
    expandBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      e.stopPropagation();
      if(typeof openImageViewer==='function'){
        openImageViewer(mediaImg.dataset.full||post.media||mediaImg.currentSrc||mediaImg.src,{alt:mediaImg.alt});
      }
    });
    if(variant==='list'){
      let lastTouchTap=0;
      const likeFromMedia=()=>{
        if(!post.likedByMe&&!likeBtn.dataset.busy) likeBtn.click();
        el.querySelector('.duniya-double-like-heart')?.remove();
        const heart=document.createElement('div');
        heart.className='duniya-double-like-heart';
        heart.setAttribute('aria-hidden','true');
        heart.textContent='♥';
        el.querySelector('.duniya-post-media')?.appendChild(heart);
        setTimeout(()=>heart.remove(),650);
      };
      // Swallow single clicks so leftover zoom binders cannot open the viewer.
      mediaImg.addEventListener('click',(e)=>{
        e.preventDefault();
        e.stopPropagation();
      });
      mediaImg.addEventListener('pointerup',(e)=>{
        if(e.pointerType!=='touch') return;
        const now=Date.now();
        if(now-lastTouchTap<300){
          e.preventDefault();
          e.stopPropagation();
          lastTouchTap=0;
          likeFromMedia();
        }else lastTouchTap=now;
      });
      mediaImg.addEventListener('dblclick',(e)=>{
        e.preventDefault();
        e.stopPropagation();
        likeFromMedia();
      });
    }
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
              if (typeof showToast === 'function') showToast('Following again');
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
          showToast('Following! Their posts will appear in your feed 🌍');
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
  el.querySelector('.duniya-more-btn').addEventListener('click',()=>openFlagSheet(post.user));

  el.querySelector('.duniya-delete-btn')?.addEventListener('click',(e)=>{
    e.stopPropagation();
    if(typeof softDeleteContent!=='function'){ showToast('Delete unavailable'); return; }
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
  el.querySelector('.comment-btn')?.addEventListener('click',()=>openDuniyaDetail(post));
  el.querySelector('.duniya-view-comments')?.addEventListener('click',()=>openDuniyaDetail(post));

  return el;
}

function formatCount(n){return n>=1000?(n/1000).toFixed(1)+'K':String(n);}

function syncDuniyaPostUI(post){
  if(!post) return;
  const id=String(post.id||'');
  document.querySelectorAll(`.duniya-post[data-id="${id}"]`).forEach((card)=>{
    const likesEl=card.querySelector('.duniya-post-likes');
    if(likesEl) likesEl.textContent=`${formatCount(post.likes||0)} likes`;
    const likeBtn=card.querySelector('.like-btn');
    if(likeBtn){
      likeBtn.classList.toggle('liked', !!post.likedByMe);
      likeBtn.setAttribute('aria-pressed', post.likedByMe?'true':'false');
    }
    let view=card.querySelector('.duniya-view-comments');
    const count=Math.max(0, Number(post.comments)||0);
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

function openDuniyaDetail(post){
  const detail=document.getElementById('duniyaPostDetail');
  detail.classList.remove('hidden');requestAnimationFrame(()=>detail.classList.add('open'));
  const canLoadPersistentComments = typeof socialContentCanPersist === 'function' && socialContentCanPersist('duniya', post);
  const comments = canLoadPersistentComments
    ? (Array.isArray(post._comments) ? post._comments : [])
    : getDuniyaComments(post);
  let replyTo = null;
  detail.innerHTML=`
    <div class="duniya-comments-handle" aria-hidden="true"></div>
    <div class="duniya-comments-header">
      <div>
        <div class="duniya-comments-title">Comments</div>
        <div class="duniya-comments-subtitle">${post.comments||0} on ${post.user?.name||'this post'}</div>
      </div>
      <button id="duniyaDetailBack" class="cp-tap-target duniya-comments-close" aria-label="Close comments">✕</button>
    </div>
    <div class="duniya-comments-body">
      <div class="duniya-comments-post-context">
        <strong>${post.user?.name||'Post'}</strong>
        <span>${String(post.caption||'').slice(0,150)}</span>
      </div>
      <div id="duniyaCommentsList" class="comments-list">
        ${typeof renderCommentsHtml==='function'?renderCommentsHtml(comments):''}
      </div>
    </div>
    <div id="duniyaReplyHint" class="comment-reply-hint hidden"></div>
    <div class="duniya-comments-composer">
      <input id="duniyaCommentInput" style="flex:1;padding:10px 14px;border:2px solid var(--line);border-radius:12px;font-family:Inter,sans-serif;font-size:14px;outline:none;min-height:44px;" placeholder="Add a comment... @mention someone">
      <button id="duniyaCommentSend" class="cp-tap-target" style="background:var(--red);color:#fff;border:none;border-radius:12px;padding:10px 16px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;min-height:44px;">Post</button>
    </div>
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
    listEl.innerHTML = typeof renderCommentsHtml === 'function' ? renderCommentsHtml(comments) : '';
    syncDuniyaPostUI(post);
    if (typeof wireCommentsList === 'function') {
      wireCommentsList(listEl, comments, {
        ...commentActions,
        onReply(parentId) {
          replyTo = parentId;
          const parent = comments.find((c) => c.id === parentId);
          if (hint) {
            hint.classList.remove('hidden');
            hint.innerHTML = `Replying to <strong>${parent?.user?.name || 'comment'}</strong> <button type="button" id="cancelDuniyaReply">Cancel</button>`;
            hint.querySelector('#cancelDuniyaReply')?.addEventListener('click', () => {
              replyTo = null;
              hint.classList.add('hidden');
              hint.innerHTML = '';
            });
          }
          commentInput?.focus();
        },
      });
    }
  }
  refreshComments();
  if (canLoadPersistentComments && typeof loadContentComments === 'function') {
    if (commentSend) commentSend.disabled = true;
    if (typeof renderSkeleton === 'function') renderSkeleton(listEl, { variant: 'list', count: 3 });
    loadContentComments('duniya', post)
      .then((loaded) => {
        if (!Array.isArray(loaded)) return;
        comments.splice(0, comments.length, ...loaded);
        post._comments = comments;
        refreshComments();
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

  commentSend.addEventListener('click', async () => {
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
        },
      });
    } else {
      apply();
      c.pending = false;
      if (typeof saveToArchive === 'function') {
        saveToArchive({ type: 'comment', content: txt, postId: post.id, parentId: c.parentId, ts: new Date().toISOString() });
      }
    }
  });
  wireTagging(commentInput);
}

// ===================== DUNIYA POST CREATION =====================
function openDuniyaPostSheet(mode='post'){
  const sheet=document.getElementById('duniyaPostSheet');
  sheet.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--white);border-bottom:1px solid var(--line);flex-shrink:0;">
      <button id="closeDuniyaPost" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">${mode==='story'?'Add Story':'New Post'}</div>
      <button id="duniyaSharePost" style="background:var(--red);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;">Share</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px;">
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--line);display:flex;align-items:center;justify-content:center;font-size:20px;">🪑</div>
        <div>
          <div style="font-weight:700;font-size:14px;">${userProfile?.name||'You'}</div>
          <select id="duniyaAudience" style="border:1.5px solid var(--line);border-radius:8px;padding:4px 8px;font-size:12px;margin-top:4px;">
            <option value="public">🌍 Everyone</option>
            <option value="followers">👥 Followers only</option>
            <option value="ai">🤖 AI decides</option>
            <option value="friends">🤝 Friends only</option>
          </select>
        </div>
      </div>
      <textarea id="duniyaCaptionInput" style="width:100%;min-height:100px;border:none;outline:none;font-family:Inter,sans-serif;font-size:15px;resize:none;background:transparent;" placeholder="Write a caption... use @mention or #hashtag"></textarea>
      <div id="duniyaDraftHint" style="font-size:11px;color:var(--muted);margin-top:4px;"></div>
      <div id="duniyaMediaPreview" style="margin-top:10px;"></div>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:6px;padding:10px 14px;background:var(--cream);border-radius:12px;cursor:pointer;font-size:13px;font-weight:600;">
          📷 Photo/Video<input type="file" id="duniyaMediaInput" accept="image/*,video/*" style="display:none;">
        </label>
        <button onclick="showToast('GIF search coming soon! 🎬')" style="padding:10px 14px;background:var(--cream);border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;">🎭 GIF</button>
        <button onclick="showToast('Sticker pack coming soon!')" style="padding:10px 14px;background:var(--cream);border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;">😄 Sticker</button>
      </div>
    </div>
  `;
  sheet.classList.remove('hidden');requestAnimationFrame(()=>sheet.classList.add('open'));
  const captionEl=document.getElementById('duniyaCaptionInput');
  const audienceEl=document.getElementById('duniyaAudience');
  let duniyaDraft=null;
  if(typeof bindDraftAutosave==='function'){
    duniyaDraft=bindDraftAutosave({
      name:'duniya',
      fields:[captionEl,audienceEl],
      getState:()=>({caption:captionEl?.value||'',audience:audienceEl?.value||'public'}),
      applyState:(s)=>{
        if(captionEl&&s.caption) captionEl.value=s.caption;
        if(audienceEl&&s.audience) audienceEl.value=s.audience;
        const hint=document.getElementById('duniyaDraftHint');
        if(hint) hint.textContent='Draft saved on this device';
      },
    });
  }
  document.getElementById('closeDuniyaPost').addEventListener('click',()=>{
    duniyaDraft?.flush?.();
    sheet.classList.remove('open');setTimeout(()=>sheet.classList.add('hidden'),350);
  });
  wireTagging(captionEl);
  let pendingMediaFile=null;
  document.getElementById('duniyaMediaInput').addEventListener('change',e=>{
    const file=e.target.files[0];if(!file)return;
    pendingMediaFile=file;
    const preview=document.getElementById('duniyaMediaPreview');
    const localUrl=URL.createObjectURL(file);
    if(file.type.startsWith('video')){
      preview.innerHTML=`<video src="${localUrl}" controls style="width:100%;border-radius:12px;"></video><div style="font-size:11px;color:var(--muted);margin-top:6px;">Will upload (max 15MB)</div>`;
    } else {
      preview.innerHTML=`<img src="${localUrl}" style="width:100%;border-radius:12px;max-height:300px;object-fit:cover;"><div style="font-size:11px;color:var(--muted);margin-top:6px;">Compressed on device before upload</div>`;
    }
  });
  document.getElementById('duniyaSharePost').addEventListener('click',async()=>{
    const shareBtn=document.getElementById('duniyaSharePost');
    const caption=captionEl.value.trim();
    const audience=audienceEl?.value||'public';
    const mediaEl=document.getElementById('duniyaMediaPreview').querySelector('img,video');
    const unlock=typeof beginClientMutation==='function'?beginClientMutation('duniya_post'):()=>{};
    if(unlock===false){ showToast('Post already submitting…'); return; }
    shareBtn.disabled=true;
    shareBtn.textContent='…';

    if(typeof checkRateLimit==='function'){
      const rl=await checkRateLimit('post');
      if(!rl.ok){
        shareBtn.disabled=false;shareBtn.textContent='Share';
        if(typeof unlock==='function') unlock();
        if(typeof showToast==='function') showToast(rl.message||'Slow down');
        return;
      }
    }

    let mediaUrl=null, thumbUrl=null, mediaPath=null, thumbPath=null, mediaWidth=null, mediaHeight=null, mediaType=mediaEl?.tagName==='VIDEO'?'video':'image';
    try{
      if(pendingMediaFile&&typeof processAndUploadMedia==='function'&&currentUser&&(typeof isMediaUploadReady!=='function'||await isMediaUploadReady())){
        shareBtn.textContent='Uploading…';
        const uploaded=await processAndUploadMedia(pendingMediaFile,{
          folder: pendingMediaFile.type.startsWith('video')?'videos':'posts',
          onProgress:(msg)=>{ shareBtn.textContent=msg||'Uploading…'; },
        });
        mediaUrl=uploaded.media;
        thumbUrl=uploaded.thumb;
        mediaPath=uploaded.mediaPath;
        thumbPath=uploaded.thumbPath;
        mediaWidth=Number(uploaded.width)||null;
        mediaHeight=Number(uploaded.height)||null;
        mediaType=pendingMediaFile.type.startsWith('video')?'video':'image';
      } else if(mediaEl?.src && mediaEl.src.startsWith('http')){
        mediaUrl=mediaEl.src;
        thumbUrl=mediaEl.src;
      } else if(mediaEl?.src){
        // Offline / no Storage — keep local preview only (not written to Firestore)
        mediaUrl=mediaEl.src;
        thumbUrl=mediaEl.src;
      }
    }catch(err){
      shareBtn.disabled=false;
      shareBtn.textContent='Share';
      if(typeof unlock==='function') unlock();
      showToast(typeof friendlyError==='function'?friendlyError(err):(err.message||'Upload failed'));
      return;
    }

    const newPost={
      id:`d_${Date.now()}`,
      user:{name:userProfile?.name||'You',avatar:'🪑',uid:currentUser?.uid||'me',photoURL:userProfile?.photoURL||null},
      type:mediaType,
      media:mediaUrl,
      thumb:thumbUrl,
      mediaPath, thumbPath,
      mediaWidth, mediaHeight,
      caption:caption||'Just posted on Duniya 🌍',
      likes:0,comments:0,shares:0,
      timestamp:'now',ts:Date.now(),tags:[],followed:false,likedByMe:false,
      audience, deleted:false, uid:currentUser?.uid||'me',
    };
    const firestorePayload={
      uid:currentUser?.uid,
      user:{name:newPost.user.name,avatar:newPost.user.avatar,uid:newPost.user.uid,photoURL:userProfile?.photoURL||null},
      type:newPost.type,
      media: mediaUrl && String(mediaUrl).startsWith('http') ? mediaUrl : null,
      thumb: thumbUrl && String(thumbUrl).startsWith('http') ? thumbUrl : null,
      mediaPath: mediaPath||null,
      thumbPath: thumbPath||null,
      mediaWidth: mediaWidth||null,
      mediaHeight: mediaHeight||null,
      caption:newPost.caption,
      likes:0,comments:0,shares:0,
      tags:newPost.tags,
      audience,
      deleted:false,
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      ts:Date.now(),
    };
    duniyaPosts.unshift(newPost);
    saveToArchive({type:'duniya_post',...newPost,media:firestorePayload.media,thumb:firestorePayload.thumb});
    duniyaDraft?.clear?.();
    sheet.classList.remove('open');setTimeout(()=>sheet.classList.add('hidden'),350);
    renderDuniyaFeed();showToast('Posted to Duniya! 🌍');
    if(typeof trackPostCreated==='function') trackPostCreated('duniya');
    if(typeof SoundLib!=='undefined'&&SoundLib.postPublish) SoundLib.postPublish();
    if(db&&currentUser){
      try{
        if(typeof assertOwnUid==='function'&&!assertOwnUid(currentUser.uid)) throw new Error('Not authorized');
        const ref=await db.collection('duniya').add(firestorePayload);
        newPost.firestoreId=ref.id;
      }catch(e){
        showToast(typeof friendlyError==='function'?friendlyError(e):'Post saved locally; sync failed');
      }
    }
    shareBtn.disabled=false;
    shareBtn.textContent='Share';
    if(typeof haptic==='function') haptic('success');
    if(typeof unlock==='function') unlock();
  });
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

function openShareSheet(post){
  const sheet=document.createElement('div');sheet.className='share-sheet';
  const shareText=`${(post.caption||post.question||'').slice(0,100)} — via Chaupaal`;
  const platforms=[
    {icon:'💬',label:'WhatsApp',color:'#25D366',fn:()=>window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`)},
    {icon:'📸',label:'Instagram',color:'linear-gradient(45deg,#F58529,#DD2A7B)',fn:()=>{navigator.clipboard.writeText(post.caption||post.question||'');showToast('Caption copied for Instagram!');}},
    {icon:'🐦',label:'Twitter/X',color:'#1DA1F2',fn:()=>window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent((post.caption||post.question||'').slice(0,200))}`)},
    {icon:'📧',label:'Email',color:'#EA4335',fn:()=>window.open(`mailto:?body=${encodeURIComponent(post.caption||post.question||'')}`)},
    {icon:'🔗',label:'Copy link',color:'#666',fn:()=>{
      const id=post.firestoreId||post.id;
      const url=typeof shareUrl==='function'?shareUrl('post',id):`${location.origin}/post/${encodeURIComponent(id)}`;
      navigator.clipboard.writeText(url);showToast('Link copied!');
    }},
  ];
  const friends=SAMPLE_CHATS.slice(0,5);
  sheet.innerHTML=`
    <div class="share-sheet-title">Share</div>
    <div class="share-users-row">
      ${friends.map(f=>`<div class="share-user-chip" data-cid="${f.id}"><div class="share-user-chip-avatar">${f.avatar}</div><div class="share-user-chip-name">${f.name.split(' ')[0]}</div></div>`).join('')}
    </div>
    <div class="share-platform-row">
      ${platforms.map((p,i)=>`<div class="share-platform" data-pi="${i}"><div class="share-platform-icon" style="background:${p.color};">${p.icon}</div><div class="share-platform-label">${p.label}</div></div>`).join('')}
    </div>
    <button id="closeShareSheet" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  sheet.querySelectorAll('[data-pi]').forEach(el=>el.addEventListener('click',async()=>{
    platforms[parseInt(el.dataset.pi)].fn();
    sheet.remove();
    await recordDuniyaShare(post);
  }));
  sheet.querySelectorAll('[data-cid]').forEach(el=>el.addEventListener('click',async()=>{
    const chat=SAMPLE_CHATS.find(c=>c.id===el.dataset.cid);
    if(!chat) return;
    sheet.remove();
    openChatScreen(chat);
    setTimeout(()=>{
      const input=document.getElementById('chatMsgInput');
      if(input){
        input.value=shareText;
        if(typeof sendMsg==='function') sendMsg(chat);
      }
    },400);
    await recordDuniyaShare(post);
  }));
  document.getElementById('closeShareSheet').addEventListener('click',()=>sheet.remove());
}

// ===================== FLAG / BLOCK =====================
// Implemented in core/safety.js (Phase 3) — keeps openFlagSheet / blockUser / flagUser as globals.
// Local shadowban review helper retained for ops tooling.
let userFlags={};

async function reviewShadowbans(){
  if(!db)return;
  if(typeof isAiFeaturesEnabled==='function' && !(await isAiFeaturesEnabled())) return;
  try{
    const snap=await db.collection('shadowbans').where('reviewedAt','==',null).limit(10).get();
    for(const doc of snap.docs){
      const data=doc.data();
      const d = await callAI({tier:'fast',max_tokens:100,feature:'moderation_shadowban',
          system:'You are a content moderation AI. Given flag count and tier, respond with JSON {"verdict":"uphold"|"lift","reason":"..."}. Uphold if count>=3 with clear pattern, lift if likely false reports.',
          messages:[{role:'user',content:`User has ${data.count} flags. Current tier: ${data.tier}. Verdict?`}]});
      const verdict=JSON.parse(d.text||d.content?.[0]?.text||'{"verdict":"uphold"}');
      await doc.ref.update({reviewedAt:Date.now(),verdict:verdict.verdict,reviewReason:verdict.reason,tier:verdict.verdict==='lift'?'none':data.tier});
    }
  }catch(e){}
}

// ===================== @TAGGING SYSTEM =====================
const ALL_TAGGABLE_USERS=SAMPLE_DISCOVERY_POOL.map(u=>({name:u.name,username:u.name.toLowerCase().replace(/\s+/g,'_')}));

function wireTagging(inputEl){
  if(!inputEl||inputEl.dataset.tagged)return;
  inputEl.dataset.tagged='1';
  let tagDropdown=null;
  inputEl.addEventListener('input',()=>{
    const val=inputEl.value;const at=val.lastIndexOf('@');
    if(at===-1||val.slice(at+1).includes(' ')){tagDropdown?.remove();tagDropdown=null;return;}
    const query=val.slice(at+1).toLowerCase();
    const matches=ALL_TAGGABLE_USERS.filter(u=>u.username.includes(query)||u.name.toLowerCase().includes(query)).slice(0,5);
    if(!matches.length){tagDropdown?.remove();tagDropdown=null;return;}
    if(!tagDropdown){tagDropdown=document.createElement('div');tagDropdown.className='tag-dropdown';inputEl.parentElement.style.position='relative';inputEl.parentElement.appendChild(tagDropdown);}
    tagDropdown.innerHTML=matches.map(u=>`<div class="tag-user-item" data-username="${u.username}"><span>👤</span><span style="font-weight:600;font-size:13px;">${u.name}</span><span style="font-size:11px;color:var(--muted);">@${u.username}</span></div>`).join('');
    tagDropdown.querySelectorAll('.tag-user-item').forEach(item=>{
      item.addEventListener('click',()=>{
        const before=val.slice(0,at);inputEl.value=before+'@'+item.dataset.username+' ';
        tagDropdown.remove();tagDropdown=null;inputEl.focus();
        addNotification('tag','🏷️',`You tagged @${item.dataset.username}`);
      });
    });
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
      <button id="archiveBack" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
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
              ${item.media?`<img src="${item.media}" loading="lazy">`:`<div style="background:linear-gradient(135deg,var(--red),#8134AF);width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;">${item.type==='peepal_post'?'🌳':item.type==='comment'?'💬':'📝'}</div>`}
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

  // Rotating banner at top
  const nudge=PEEPAL_NUDGES[Math.floor(Math.random()*PEEPAL_NUDGES.length)];
  const banner=document.createElement('div');banner.className='peepal-nudge-banner';
  banner.innerHTML=`
    <div class="peepal-nudge-label">💡 Try this on Peepal</div>
    <div class="peepal-nudge-text">${nudge.icon} ${nudge.label}</div>
    <div class="peepal-nudge-sub">${nudge.sub}</div>
    <button class="peepal-nudge-cta" id="nudgeCta">Ask this →</button>
  `;
  feed.parentElement.insertBefore(banner,feed);
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
  showToast(openToMeet?'You\'re now open to meeting new people 👋':'Discovery turned off. You can re-enable in Settings.');
}

// ===================== LEHAR (Section 8) — vertical short-form video only =====================
(function initLeharMode() {
  let mode = 'general';
  function isVideoPost(p) {
    const media = p.media || p.video || '';
    const type = String(p.mediaType || p.type || '').toLowerCase();
    if (type.includes('video')) return true;
    return /\.(mp4|webm|mov)(\?|$)/i.test(media) || /\/video\//i.test(media);
  }
  function renderLeharFeed() {
    const feed = document.getElementById('leharFeed');
    if (!feed) return;
    const videos = (duniyaPosts || [])
      .filter((p) => !(typeof isSoftDeleted === 'function' ? isSoftDeleted(p) : p.deleted))
      .filter((p) => p.archived !== true)
      .filter(isVideoPost);
    if (!videos.length) {
      feed.innerHTML =
        '<div class="lehar-empty"><strong>Lehar</strong><p>Short videos from Duniya will wave through here. Post a clip to start the scroll.</p></div>';
      return;
    }
    feed.innerHTML = videos
      .map((p, i) => {
        const src = p.media || p.video;
        const name = p.user?.name || 'Member';
        const postId = p.id || '';
        return `<section class="lehar-slide" data-lehar-i="${i}" data-lehar-id="${postId}">
          <video src="${src}" playsinline loop muted preload="metadata"></video>
          <button type="button" class="lehar-mute-btn" aria-label="Toggle mute" data-lehar-mute>🔇</button>
          <div class="lehar-double-heart" aria-hidden="true">♥</div>
          <div class="lehar-meta"><strong>${name}</strong><p>${(p.caption || '').slice(0, 100)}</p></div>
        </section>`;
      })
      .join('');
    let mutedPref = true;
    try { mutedPref = localStorage.getItem('chaupaal_lehar_muted') !== '0'; } catch (e) {}
    const slides = [...feed.querySelectorAll('.lehar-slide')];
    const setMuteUi = (slide, muted) => {
      const btn = slide.querySelector('[data-lehar-mute]');
      if (btn) btn.textContent = muted ? '🔇' : '🔊';
    };
    slides.forEach((s) => {
      const v = s.querySelector('video');
      if (v) v.muted = mutedPref;
      setMuteUi(s, mutedPref);
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
      let lastTap = 0;
      const likeSlide = () => {
        const id = s.dataset.leharId;
        const post = (duniyaPosts || []).find((x) => x.id === id);
        if (post && !post.likedByMe) {
          const feedCard = document.querySelector(`.duniya-post[data-id="${id}"] .like-btn`);
          if (feedCard) feedCard.click();
          else {
            post.likedByMe = true;
            post.likes = (post.likes || 0) + 1;
            if (typeof haptic === 'function') haptic('light');
          }
        } else if (typeof haptic === 'function') haptic('light');
        const heart = s.querySelector('.lehar-double-heart');
        if (heart) {
          heart.classList.remove('is-pop');
          void heart.offsetWidth;
          heart.classList.add('is-pop');
        }
      };
      s.addEventListener('click', (e) => {
        if (e.target.closest('[data-lehar-mute]')) return;
        const now = Date.now();
        if (now - lastTap < 320) {
          lastTap = 0;
          likeSlide();
          return;
        }
        lastTap = now;
        const v = s.querySelector('video');
        if (!v) return;
        if (v.paused) v.play().catch(() => {});
        else v.pause();
      });
    });
    const io = new IntersectionObserver(
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
      { root: feed, threshold: [0.65] }
    );
    slides.forEach((s) => io.observe(s));
  }
  function setDuniyaMode(next) {
    mode = next === 'lehar' ? 'lehar' : 'general';
    document.querySelectorAll('[data-duniya-mode]').forEach((btn) => {
      const on = btn.dataset.duniyaMode === mode;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.getElementById('duniyaFeed')?.classList.toggle('hidden', mode === 'lehar');
    document.getElementById('duniyaStoriesRow')?.classList.toggle('hidden', mode === 'lehar');
    const lehar = document.getElementById('leharFeed');
    lehar?.classList.toggle('hidden', mode !== 'lehar');
    if (mode === 'lehar') renderLeharFeed();
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-duniya-mode]');
    if (!btn) return;
    setDuniyaMode(btn.dataset.duniyaMode);
  });
  window.setDuniyaMode = setDuniyaMode;
  window.renderLeharFeed = renderLeharFeed;
})();

