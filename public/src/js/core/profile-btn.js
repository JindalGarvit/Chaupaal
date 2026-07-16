// ===================== PROFILE BTN =====================
document.getElementById('profileBtn').addEventListener('click',()=>{
  renderProfileModal();
  document.getElementById('profileModal').classList.remove('hidden');
});
document.getElementById('closeProfile').addEventListener('click',()=>document.getElementById('profileModal').classList.add('hidden'));

async function addFriend(){
  const username=document.getElementById('addFriendInput').value.trim().toLowerCase();
  if(!username||!db)return;
  try{
    const snap=await db.collection('usernames').doc(username).get();
    if(!snap.exists){showToast('User not found 🤔');return;}
    const friendUid=snap.data().uid;
    if(friendUid===currentUser.uid){showToast("That's you! 😄");return;}
    await db.collection('users').doc(currentUser.uid).update({friends:firebase.firestore.FieldValue.arrayUnion(friendUid)});
    document.getElementById('addFriendInput').value='';
    showToast('Friend added! 🎉');loadFriends();
  }catch(e){showToast('Error adding friend');}
}

async function loadFriends(){
  const el=document.getElementById('friendsList');if(!el||!db||!currentUser)return;
  if(typeof renderSkeleton==='function') renderSkeleton(el, {variant:'list', count:3});
  try{
    const snap=await db.collection('users').doc(currentUser.uid).get();
    const friends=snap.data()?.friends||[];
    if(!friends.length){
      if(typeof renderEmptyState==='function'){
        renderEmptyState(el, {icon:'👋', title:'No friends yet', message:'Add someone by username above to duel and chat.'});
      } else {
        el.innerHTML='<div style="color:var(--muted);font-size:13px;padding:8px 0;">No friends yet — add one above! 👋</div>';
      }
      return;
    }
    // Friends live as a UID array on the user doc (not a cursor query).
    // Page the UI + profile fetches in chunks to avoid N+1 storms.
    const PAGE=12;
    let offset=0;
    el.innerHTML='';
    el.dataset.friendUids=JSON.stringify(friends);

    async function appendPage(){
      const slice=friends.slice(offset, offset+PAGE);
      offset+=slice.length;
      for(const uid of slice){
        const f=(await db.collection('users').doc(uid).get()).data();if(!f)continue;
        const row=document.createElement('div');row.className='friend-item';
        row.innerHTML=`<img class="friend-avatar" src="${f.photoThumb||f.photoURL||'icon.png'}" onerror="this.style.fontSize='16px';this.src='icon.png'"><div class="friend-info"><div class="friend-name">${f.name}</div><div class="friend-username">@${f.username}</div></div><button class="friend-duel-btn" data-uname="${f.username}">⚔️ Muqabala</button>`;
        row.querySelector('.friend-duel-btn').addEventListener('click',()=>{
          document.getElementById('profileModal').classList.add('hidden');
          document.querySelectorAll('.tab-btn').forEach(b=>{if(b.dataset.tab==='dangal')b.click();});
          setTimeout(()=>startMuqabala(f.username,'Rapid'),300);
        });
        el.appendChild(row);
      }
      el.querySelector('[data-ui="load-more"]')?.remove();
      if(offset<friends.length&&typeof ensureLoadMoreButton==='function'){
        ensureLoadMoreButton(el,{
          label:`Load more friends (${friends.length-offset} left)`,
          onLoadMore:appendPage,
        });
      }
    }
    await appendPage();
  }catch(e){
    if(typeof renderErrorState==='function'){
      renderErrorState(el, {
        title:'Couldn’t load friends',
        message: typeof friendlyError==='function'?friendlyError(e):'Please try again.',
        onRetry:()=>loadFriends(),
      });
    } else {
      el.innerHTML='<div style="color:var(--muted);font-size:13px;">Could not load friends</div>';
    }
  }
}
