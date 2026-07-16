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

function renderDuniyaStories(){
  const row=document.getElementById('duniyaStoriesRow');if(!row)return;
  const storyUsers=[{name:'Your story',avatar:'＋',self:true},...SAMPLE_DUNIYA.map(p=>p.user)];
  row.innerHTML=storyUsers.map(u=>`
    <div class="duniya-story-item" data-uid="${u.uid||'self'}">
      <div class="duniya-story-ring" style="${u.self?'background:var(--line);':''}">
        <div class="duniya-story-avatar" style="${u.self?'border:2px dashed var(--muted);':''}">
          ${u.self?'<span style="font-size:24px;color:var(--muted);">＋</span>':u.photoURL?`<img src="${u.photoURL}">`:`<span>${u.avatar}</span>`}
        </div>
      </div>
      <div class="duniya-story-name">${u.self?'Add story':u.name.split(' ')[0]}</div>
    </div>
  `).join('');
  row.querySelectorAll('.duniya-story-item').forEach(item=>{
    item.addEventListener('click',()=>{
      if(item.dataset.uid==='self'){
        // Duniya stories are public/followers — show audience picker
        const s=document.createElement('div');
        s.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;';
        s.innerHTML=`
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;margin-bottom:4px;">Add to Duniya Story</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Duniya stories are visible publicly — they appear in followers' feeds</div>
          <label style="display:flex;align-items:center;gap:12px;padding:13px;background:var(--cream);border-radius:14px;cursor:pointer;margin-bottom:10px;font-weight:600;font-size:14px;">
            📷 Add photo or video<input type="file" accept="image/*,video/*" id="duniyaStoryFile" style="display:none;">
          </label>
          <div style="display:flex;gap:8px;">
            <select id="duniyaStoryAudience" style="flex:1;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:13px;">
              <option value="public">🌍 Everyone</option>
              <option value="followers">👥 Followers only</option>
            </select>
          </div>
          <button id="closeDuniyaStorySheet" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;margin-top:10px;">Cancel</button>
        `;
        document.querySelector('.device').appendChild(s);
        document.getElementById('closeDuniyaStorySheet').addEventListener('click',()=>s.remove());
        document.getElementById('duniyaStoryFile').addEventListener('change',async e=>{
          const file=e.target.files[0];if(!file)return;
          const audience=document.getElementById('duniyaStoryAudience').value;
          s.remove();
          showToast('Preparing story…');
          try{
            let media=null, thumb=null;
            if(typeof processAndUploadMedia==='function'&&currentUser&&(typeof isMediaUploadReady!=='function'||await isMediaUploadReady())){
              const up=await processAndUploadMedia(file,{folder:'stories'});
              media=up.media; thumb=up.thumb;
            } else {
              media=URL.createObjectURL(file);
            }
            const story={name:userProfile?.name||'You',avatar:userProfile?.photoURL||'🪑',type:'duniya_story',media,thumb,mediaType:file.type.startsWith('video')?'video':'image',audience,ts:Date.now()};
            saveToArchive({type:'duniya_story',...story});
            if(db&&currentUser){
              db.collection('duniya_stories').add({
                name:story.name,avatar:story.avatar,type:story.type,
                media: media&&String(media).startsWith('http')?media:null,
                thumb: thumb&&String(thumb).startsWith('http')?thumb:null,
                mediaType:story.mediaType,audience,
                uid:currentUser.uid,
                createdAt:firebase.firestore.FieldValue.serverTimestamp(),
                expiresAt:new Date(Date.now()+86400000),
              }).catch(()=>{});
            }
            showToast(audience==='public'?'Story shared publicly on Duniya 🌍':'Story shared with your followers 👥');
          }catch(err){
            showToast(typeof friendlyError==='function'?friendlyError(err):(err.message||'Story upload failed'));
          }
        });
      }
      else showToast('Story viewer — tap to watch 👆');
      openDuniyaStoryViewer({name:u.name,avatar:u.avatar||'👤'});
    });
  });
}

function renderDuniyaFeed(){
  const feed=document.getElementById('duniyaFeed');if(!feed)return;
  const visible=duniyaPosts.filter(p=>!(typeof isSoftDeleted==='function'?isSoftDeleted(p):p.deleted));
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

function createDuniyaPost(post, {variant='list'}={}){
  const el=document.createElement('div');el.className='duniya-post';el.dataset.id=post.id;
  const isFollowing=followingSet.has(post.user.uid);
  const caption=post.caption.replace(/@(\w+)/g,'<span class="duniya-post-tag">@$1</span>').replace(/#(\w+)/g,'<span style="color:var(--red);cursor:pointer;">#$1</span>');
  const imgSrc=typeof mediaUrlFor==='function'?mediaUrlFor(post, variant): (post.thumb||post.media);
  el.innerHTML=`
    <div class="duniya-post-header">
      <div class="duniya-post-avatar">${post.user.photoURL?`<img src="${post.user.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`:`<span>${post.user.avatar}</span>`}</div>
      <div class="duniya-post-user">
        <div class="duniya-post-name">${post.user.name}</div>
        <div class="duniya-post-meta">${typeof formatRelativeTime==='function'?formatRelativeTime(post.ts||post.timestamp):post.timestamp} · 🌍 Public</div>
      </div>
      <button class="duniya-follow-btn ${isFollowing?'following':''}" data-uid="${post.user.uid}">${isFollowing?'Following':'Follow'}</button>
      ${(currentUser&&(post.user?.uid===currentUser.uid||post.uid===currentUser.uid))?`<button type="button" class="duniya-delete-btn" title="Delete" style="background:none;border:none;font-size:16px;cursor:pointer;color:var(--muted);padding:4px;">🗑️</button>`:''}
      <button style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);padding:4px;" class="duniya-more-btn">⋯</button>
    </div>
    <div class="duniya-post-media">
      ${post.type==='video'
        ?(post.media
          ?`<video src="${post.media}" controls playsinline preload="none"></video>`
          :`<div class="duniya-post-media-placeholder">🎬<div style="font-size:14px;color:rgba(255,255,255,0.6);margin-top:8px;">Video</div></div>`)
        :(imgSrc
          ?`<img src="${imgSrc}" loading="lazy" alt="" ${variant==='list'&&post.media&&post.media!==imgSrc?`data-full="${post.media}"`:''}>`
          :`<div class="duniya-post-media-placeholder">📷</div>`)
      }
    </div>
    <div class="duniya-post-actions">
      <button class="duniya-action-btn like-btn ${post.likedByMe?'liked':''}" data-id="${post.id}">${post.likedByMe?'❤️':'🤍'}</button>
      <button class="duniya-action-btn comment-btn" data-id="${post.id}">💬</button>
      <button class="duniya-action-btn share-btn" data-id="${post.id}">↗️</button>
      <button class="duniya-action-btn" style="margin-left:auto;" data-id="${post.id}">🔖</button>
    </div>
    <div class="duniya-post-likes">${formatCount(post.likedByMe?post.likes:post.likes)} likes</div>
    <div class="duniya-post-caption"><strong class="duniya-post-name">${post.user.name}</strong> ${caption}</div>
    ${post.comments>0?`<div class="duniya-view-comments">View all ${post.comments} comments</div>`:''}
  `;

  // Like (rate-limited)
  el.querySelector('.like-btn').addEventListener('click',async e=>{
    const btn=e.currentTarget;
    if(btn.dataset.busy)return;
    btn.dataset.busy='1';
    try{
      if(typeof checkRateLimit==='function'){
        const rl=await checkRateLimit('like');
        if(!rl.ok){ if(typeof showToast==='function') showToast(rl.message||'Slow down'); return; }
      }
      const p=duniyaPosts.find(x=>x.id===post.id);if(!p)return;
      p.likedByMe=!p.likedByMe;p.likes+=p.likedByMe?1:-1;post.likedByMe=p.likedByMe;post.likes=p.likes;
      btn.textContent=p.likedByMe?'❤️':'🤍';btn.classList.toggle('liked',p.likedByMe);
      el.querySelector('.duniya-post-likes').textContent=`${formatCount(p.likes)} likes`;
    }finally{ delete btn.dataset.busy; }
  });

  // Follow (rate-limited)
  el.querySelector('.duniya-follow-btn').addEventListener('click',async e=>{
    const btn=e.currentTarget;
    const uid=btn.dataset.uid;
    if(btn.dataset.busy)return;
    btn.dataset.busy='1';
    try{
      if(!followingSet.has(uid)&&typeof checkRateLimit==='function'){
        const rl=await checkRateLimit('follow');
        if(!rl.ok){ if(typeof showToast==='function') showToast(rl.message||'Slow down'); return; }
      }
      if(followingSet.has(uid)){followingSet.delete(uid);btn.textContent='Follow';btn.classList.remove('following');}
      else{followingSet.add(uid);btn.textContent='Following';btn.classList.add('following');showToast('Following! Their posts will appear in your feed 🌍');}
    }finally{ delete btn.dataset.busy; }
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

// ===================== DUNIYA POST DETAIL (comments) =====================
function openDuniyaDetail(post){
  const detail=document.getElementById('duniyaPostDetail');
  detail.classList.remove('hidden');requestAnimationFrame(()=>detail.classList.add('open'));
  detail.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--white);border-bottom:1px solid var(--line);flex-shrink:0;">
      <button id="duniyaDetailBack" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;">Post</div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px;">
      ${createDuniyaPost(post, {variant:'detail'}).outerHTML}
      <div style="font-size:13px;font-weight:700;margin:12px 0 8px;">Comments</div>
      <div id="duniyaCommentsList">
        ${['Great post! 🔥','Really insightful, thanks for sharing','Totally agree with this perspective','@${post.user.name.split(" ")[0]} this is amazing!'].map(c=>`<div style="display:flex;gap:10px;margin-bottom:12px;"><div style="width:32px;height:32px;border-radius:50%;background:var(--line);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">👤</div><div><div style="font-weight:700;font-size:13px;">User</div><div style="font-size:13px;">${c}</div></div></div>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:8px;padding:12px 16px;background:var(--white);border-top:1px solid var(--line);">
      <input id="duniyaCommentInput" style="flex:1;padding:10px 14px;border:2px solid var(--line);border-radius:12px;font-family:Inter,sans-serif;font-size:14px;outline:none;" placeholder="Add a comment... @mention someone">
      <button id="duniyaCommentSend" style="background:var(--red);color:#fff;border:none;border-radius:12px;padding:10px 16px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;">Post</button>
    </div>
  `;
  document.getElementById('duniyaDetailBack').addEventListener('click',()=>{
    detail.classList.remove('open');setTimeout(()=>detail.classList.add('hidden'),300);
    try{ history.pushState({},'', '/'); }catch(e){}
  });
  try{
    const pid=post.firestoreId||post.id;
    if(pid&&typeof buildDeepLink==='function') history.pushState({chaupaalDeep:true},'',buildDeepLink('post',pid));
  }catch(e){}
  const commentInput=document.getElementById('duniyaCommentInput');
  document.getElementById('duniyaCommentSend').addEventListener('click',async()=>{
    const txt=commentInput.value.trim();if(!txt)return;
    if(typeof checkRateLimit==='function'){
      const rl=await checkRateLimit('comment');
      if(!rl.ok){ if(typeof showToast==='function') showToast(rl.message||'Slow down'); return; }
    }
    const div=document.createElement('div');div.style.cssText='display:flex;gap:10px;margin-bottom:12px;';
    div.innerHTML=`<div style="width:32px;height:32px;border-radius:50%;background:var(--line);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">🪑</div><div><div style="font-weight:700;font-size:13px;">You</div><div style="font-size:13px;">${txt.replace(/@(\w+)/g,'<span style="color:var(--red);">@$1</span>')}</div></div>`;
    document.getElementById('duniyaCommentsList').appendChild(div);
    commentInput.value='';post.comments++;
    saveToArchive({type:'comment',content:txt,postId:post.id,ts:new Date().toISOString()});
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

    let mediaUrl=null, thumbUrl=null, mediaPath=null, thumbPath=null, mediaType=mediaEl?.tagName==='VIDEO'?'video':'image';
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
    if(typeof unlock==='function') unlock();
  });
}

// ===================== SHARE SHEET =====================
function openShareSheet(post){
  const sheet=document.createElement('div');sheet.className='share-sheet';
  const platforms=[
    {icon:'💬',label:'WhatsApp',color:'#25D366',fn:()=>window.open(`https://wa.me/?text=${encodeURIComponent((post.caption||'').slice(0,100)+' — via Chaupaal')}`)},
    {icon:'📸',label:'Instagram',color:'linear-gradient(45deg,#F58529,#DD2A7B)',fn:()=>{navigator.clipboard.writeText(post.caption||'');showToast('Caption copied for Instagram!');}},
    {icon:'🐦',label:'Twitter/X',color:'#1DA1F2',fn:()=>window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent((post.caption||'').slice(0,200))}`)},
    {icon:'📧',label:'Email',color:'#EA4335',fn:()=>window.open(`mailto:?body=${encodeURIComponent(post.caption||'')}`)},
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
  sheet.querySelectorAll('[data-pi]').forEach(el=>el.addEventListener('click',()=>{platforms[parseInt(el.dataset.pi)].fn();sheet.remove();}));
  sheet.querySelectorAll('[data-cid]').forEach(el=>el.addEventListener('click',()=>{const chat=SAMPLE_CHATS.find(c=>c.id===el.dataset.cid);if(chat){sheet.remove();openChatScreen(chat);setTimeout(()=>sendMsg(chat),400);};}));
  document.getElementById('closeShareSheet').addEventListener('click',()=>sheet.remove());
}

// ===================== FLAG / BLOCK =====================
// Implemented in core/safety.js (Phase 3) — keeps openFlagSheet / blockUser / flagUser as globals.
// Local shadowban review helper retained for ops tooling.
let userFlags={};

async function reviewShadowbans(){
  if(!db)return;
  try{
    const snap=await db.collection('shadowbans').where('reviewedAt','==',null).limit(10).get();
    for(const doc of snap.docs){
      const data=doc.data();
      const d = await callAnthropic({model:'claude-haiku-4-5-20251001',max_tokens:100,
          system:'You are a content moderation AI. Given flag count and tier, respond with JSON {"verdict":"uphold"|"lift","reason":"..."}. Uphold if count>=3 with clear pattern, lift if likely false reports.',
          messages:[{role:'user',content:`User has ${data.count} flags. Current tier: ${data.tier}. Verdict?`}]});
      const verdict=JSON.parse(d.content?.[0]?.text||'{"verdict":"uphold"}');
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
