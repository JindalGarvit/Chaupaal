// ===================== PROFILE BTN =====================
document.getElementById('profileBtn')?.addEventListener('click', () => {
  // Own profile opens in Preview (visitor view) by default
  if (typeof setProfilePreviewMode === 'function') setProfilePreviewMode(true);
  if (typeof renderProfileModal === 'function') renderProfileModal();
  document.getElementById('profileModal')?.classList.remove('hidden');
});
document.getElementById('closeProfile')?.addEventListener('click', () => {
  if (typeof setProfilePreviewMode === 'function') setProfilePreviewMode(true);
  document.getElementById('profileModal')?.classList.add('hidden');
});

/** Open own profile in Preview — used by Baithak self PIN and other entry points */
function openOwnProfilePreview() {
  if (typeof setProfilePreviewMode === 'function') setProfilePreviewMode(true);
  if (typeof renderProfileModal === 'function') renderProfileModal();
  document.getElementById('profileModal')?.classList.remove('hidden');
}
window.openOwnProfilePreview = openOwnProfilePreview;

async function addFriend() {
  const username = document.getElementById('addFriendInput').value.trim().toLowerCase();
  if (!username || !db) return;
  try {
    const snap = await db.collection('usernames').doc(username).get();
    if (!snap.exists) {
      showToast('User not found 🤔');
      return;
    }
    const friendUid = snap.data().uid;
    if (friendUid === currentUser.uid) {
      showToast("That's you! 😄");
      return;
    }
    if (typeof requestFriend !== 'function') throw new Error('Relationship service unavailable');
    await requestFriend(friendUid);
    document.getElementById('addFriendInput').value = '';
    showToast('Friend request sent');
    loadFriends();
  } catch (e) {
    showToast('Error adding friend');
  }
}

async function loadFriends() {
  const el = document.getElementById('friendsList');
  if (!el || !db || !currentUser) return;
  if (typeof renderSkeleton === 'function') renderSkeleton(el, { variant: 'list', count: 3 });
  try {
    const envelope =
      typeof apiFetch === 'function'
        ? await apiFetch('/api/relationships', { method: 'POST', needAuth: true, body: { action: 'list_friends' } })
        : null;
    const friends = envelope?.data?.profiles || [];
    if (!friends.length) {
      if (typeof renderEmptyState === 'function') {
        renderEmptyState(el, {
          icon: '👋',
          title: 'No friends yet',
          message: 'Add someone by username above to duel and chat.',
        });
      } else {
        el.innerHTML =
          '<div style="color:var(--muted);font-size:13px;padding:8px 0;">No friends yet — add one above! 👋</div>';
      }
      return;
    }
    const PAGE = 12;
    let offset = 0;
    el.innerHTML = '';
    el.dataset.friendUids = JSON.stringify(friends.map((friend) => friend.uid));

    async function appendPage() {
      const slice = friends.slice(offset, offset + PAGE);
      offset += slice.length;
      for (const f of slice) {
        if (!f) continue;
        const row = document.createElement('div');
        row.className = 'friend-item';
        const nameHtml =
          typeof formatDisplayNameHtml === 'function'
            ? formatDisplayNameHtml(f.name, f.profileType || f.profile?.profileType)
            : f.name;
        row.innerHTML = `<img class="friend-avatar" src="${f.photoThumb || f.photoURL || 'icon.png'}" onerror="this.style.fontSize='16px';this.src='icon.png'"><div class="friend-info"><div class="friend-name">${nameHtml}</div><div class="friend-username">@${f.username}</div></div><button class="friend-duel-btn" data-uname="${f.username}">⚔️ Muqabala</button>`;
        if (typeof bindProfileLongPress === 'function' && f.uid) {
          bindProfileLongPress(row.querySelector('.friend-avatar'), {
            uid: f.uid,
            name: f.name,
            username: f.username,
            photoURL: f.photoThumb || f.photoURL || '',
          });
        }
        row.querySelector('.friend-duel-btn').addEventListener('click', () => {
          document.getElementById('profileModal').classList.add('hidden');
          document.querySelectorAll('.tab-btn').forEach((b) => {
            if (b.dataset.tab === 'dangal') b.click();
          });
          setTimeout(() => startMuqabala(f.username, 'Rapid'), 300);
        });
        el.appendChild(row);
      }
      el.querySelector('[data-ui="load-more"]')?.remove();
      if (offset < friends.length && typeof ensureLoadMoreButton === 'function') {
        ensureLoadMoreButton(el, {
          label: `Load more friends (${friends.length - offset} left)`,
          onLoadMore: appendPage,
        });
      }
    }
    await appendPage();
  } catch (e) {
    if (typeof renderErrorState === 'function') {
      renderErrorState(el, {
        title: 'Couldn’t load friends',
        message: typeof friendlyError === 'function' ? friendlyError(e) : 'Please try again.',
        onRetry: () => loadFriends(),
      });
    } else {
      el.innerHTML = '<div style="color:var(--muted);font-size:13px;">Could not load friends</div>';
    }
  }
}
