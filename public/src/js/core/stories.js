/**
 * Story transport and rendering. Baithak and Duniya always use distinct API
 * query paths. Selective audience metadata is never rendered for recipients.
 */
(function () {
  'use strict';

  const feeds = { baithak: [], duniya: [] };

  function clientId() {
    return typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  async function storyCall(action, body) {
    if (typeof apiFetch !== 'function') throw new Error('Story service unavailable');
    const envelope = await apiFetch('/api/stories', {
      method: 'POST',
      needAuth: true,
      body: { action, ...(body || {}) },
    });
    if (!envelope?.ok) throw new Error(envelope?.error?.message || 'Story action failed');
    return envelope.data || {};
  }

  async function loadStoryFeed(destination) {
    if (!currentUser) return [];
    const data = await storyCall('feed', { destination });
    feeds[destination] = data.stories || [];
    return feeds[destination];
  }

  async function createPlatformStory(story) {
    const data = await storyCall('create', { ...story, clientId: story.clientId || clientId() });
    if (data.story) feeds[data.story.destination].unshift(data.story);
    document.dispatchEvent(new CustomEvent('chaupaal:story-created', { detail: data.story }));
    return data.story;
  }

  async function deletePlatformStory(story) {
    await storyCall('delete', { destination: story.destination, storyId: story.id });
    feeds[story.destination] = feeds[story.destination].filter((item) => item.id !== story.id);
  }

  async function getStoryInteractions(story) {
    const data = await storyCall('interactions', {
      destination: story.destination,
      storyId: story.id,
    });
    return data.interactions || { liked: false, likeCount: 0, comments: [] };
  }

  async function likePlatformStory(story, enabled) {
    await storyCall('interact', {
      destination: story.destination,
      storyId: story.id,
      type: 'like',
      enabled: !!enabled,
    });
    if (enabled && typeof haptic === 'function') haptic('light');
  }

  async function commentPlatformStory(story, text) {
    await storyCall('interact', {
      destination: story.destination,
      storyId: story.id,
      type: 'comment',
      text,
      clientId: clientId(),
    });
  }

  async function viewPlatformStory(story) {
    if (!story?.id) return;
    try {
      await storyCall('view', { destination: story.destination || 'duniya', storyId: story.id });
    } catch (e) {}
  }

  async function listStoryViews(story, q) {
    const data = await storyCall('list_views', {
      destination: story.destination || 'duniya',
      storyId: story.id,
      q: q || '',
    });
    return data || { count: 0, viewers: [] };
  }

  async function respondStoryInteractive(story, type, value) {
    return storyCall('interactive_respond', {
      destination: story.destination || 'duniya',
      storyId: story.id,
      type,
      value,
    });
  }

  async function listStoryInteractive(story) {
    return storyCall('list_interactive', {
      destination: story.destination || 'duniya',
      storyId: story.id,
    });
  }

  async function sendStoryToPeers(story, { uids, chatIds, text } = {}) {
    return storyCall('send_story', {
      destination: story.destination || 'duniya',
      storyId: story.id,
      uids: uids || [],
      chatIds: chatIds || [],
      text: text || '',
    });
  }

  async function deleteStoryComment(story, commentId) {
    return storyCall('delete_comment', {
      destination: story.destination || 'duniya',
      storyId: story.id,
      commentId,
    });
  }

  async function getPlatformStory(storyId, destination) {
    const data = await storyCall('get', { storyId, destination: destination || 'duniya' });
    return data.story || null;
  }

  async function fetchStoryLikersFromApi(destination, storyId) {
    const data = await storyCall('list_story_likes', { destination: destination || 'duniya', storyId });
    return data.likers || [];
  }

  async function fetchContentLikersFromApi(collection, postId) {
    const data = await storyCall('list_content_likes', { collection, postId });
    return data.likers || [];
  }

  async function openProfileStories(targetUid) {
    if (!targetUid || !currentUser) return;
    const data = await storyCall('profile', { targetUid });
    const stories = [...(data.stories?.duniya || []), ...(data.stories?.baithak || [])];
    if (!stories.length) {
      showToast('No live stories');
      return;
    }
    // Public stories intentionally play first, then Friends-only Baithak stories.
    openStoryViewer(stories[0], stories);
  }

  function groupByOwner(stories, kind) {
    const groups = new Map();
    stories
      .filter((story) => !kind || story.kind === kind)
      .forEach((story) => {
        if (!groups.has(story.uid)) groups.set(story.uid, []);
        groups.get(story.uid).push(story);
      });
    return [...groups.values()];
  }

  function isSplitKind(story) {
    const kind = story?.kind || story;
    return kind === 'split' || kind === 'instant';
  }

  function splitTt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const value = t(key);
        if (value && value !== key) return value;
      }
    } catch (e) {}
    return fallback;
  }

  const SPLIT_SEEN_KEY = 'chaupaal_split_seen_v1';

  function loadSplitSeen() {
    try {
      return JSON.parse(localStorage.getItem(SPLIT_SEEN_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function markSplitsSeen(ids) {
    const map = loadSplitSeen();
    const now = Date.now();
    (ids || []).forEach((id) => {
      if (id) map[id] = now;
    });
    const cutoff = now - 48 * 60 * 60 * 1000;
    Object.keys(map).forEach((id) => {
      if (map[id] < cutoff) delete map[id];
    });
    try {
      localStorage.setItem(SPLIT_SEEN_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  function groupHasUnseen(group) {
    const seen = loadSplitSeen();
    return (group || []).some((story) => story?.id && !seen[story.id]);
  }

  async function renderLiveBaithakStories() {
    return renderBaithakInstants();
  }

  async function shareBaithakSplit(payload, { toastOnSuccess = true, refresh = true } = {}) {
    const story = await createPlatformStory({
      destination: 'baithak',
      kind: 'split',
      visibility: 'close_friends',
      text: payload.text || '',
      media: payload.media || null,
      thumb: payload.thumb || null,
      type: payload.type || 'note',
      mediaType: payload.mediaType || undefined,
      music: payload.music || null,
      expiresInHours: 24,
    });
    if (!story) throw new Error(splitTt('instants_fail', 'Could not share Split'));
    if (toastOnSuccess && typeof showToast === 'function') {
      showToast(splitTt('instants_shared', 'Split shared'));
    }
    if (refresh) await renderBaithakInstants();
    return story;
  }

  function splitOwnerLabel(story) {
    if (!story) return '';
    if (story.own || story.uid === currentUser?.uid) {
      const name = typeof selfDisplayName === 'function' ? selfDisplayName() : story.name || '';
      const clean = String(name || '').trim();
      if (clean && !/^(you|someone)$/i.test(clean)) return `You (${clean})`;
      return splitTt('instants_you', 'You');
    }
    const name =
      typeof resolvePersonDisplayName === 'function'
        ? resolvePersonDisplayName(story)
        : story.name || story.username || '';
    const cleaned = String(name || '').trim();
    if (!cleaned || /^(someone|friend|member)$/i.test(cleaned)) {
      if (story.username) return `@${String(story.username).replace(/^@/, '')}`;
      return 'Friend';
    }
    return cleaned;
  }

  function splitPreviewForStory(story) {
    if (!story) return { kind: 'glyph', value: '⚡' };
    const media = story.thumb || story.media;
    if (media) return { kind: 'image', url: media };
    const musicThumb = story.music?.thumbnail;
    if (musicThumb) return { kind: 'image', url: musicThumb };
    const text = String(story.text || '').trim();
    if (text) return { kind: 'text', value: text.slice(0, 48) };
    if (story.music?.title) return { kind: 'music', value: story.music.title };
    return { kind: 'glyph', value: story.type === 'music' ? '♪' : '⚡' };
  }

  function splitBundlePreview(group) {
    for (const s of group || []) {
      const p = splitPreviewForStory(s);
      if (p.kind === 'image') return p;
    }
    return splitPreviewForStory(group?.[0]);
  }

  function splitTrayStubHtml(preview) {
    if (preview.kind === 'image') return `<img src="${safe(preview.url)}" alt="">`;
    if (preview.kind === 'text') {
      return `<span class="baithak-instant-text-preview">${safe(preview.value)}</span>`;
    }
    if (preview.kind === 'music') {
      return `<span class="baithak-instant-music-preview" aria-hidden="true">♪</span>`;
    }
    return escapeLiteText(preview.value || '⚡');
  }

  function collapseBaithakSplitComposer() {
    const bar = document.getElementById('baithakSplitComposer');
    if (!bar) return;
    const ta = bar.querySelector('#splitNoteText');
    if (ta) ta.value = '';
    bar.hidden = true;
  }

  function wireSplitComposer(bar) {
    if (bar.dataset.wired === '1') return;
    bar.dataset.wired = '1';
    const ta = bar.querySelector('#splitNoteText');
    const fileInput = bar.querySelector('#splitPhotoInput');
    if (typeof bindLivingPlaceholder === 'function') {
      bindLivingPlaceholder(ta, 'instant_note');
    }

    // Blur / click-outside: collapse if user leaves without sending
    let splitBarFocused = false;
    if (ta) {
      ta.addEventListener('focus', () => { splitBarFocused = true; });
      ta.addEventListener('blur', () => {
        splitBarFocused = false;
        setTimeout(() => {
          if (!splitBarFocused) collapseBaithakSplitComposer();
        }, 150);
      });
    }
    bar.addEventListener('pointerdown', () => { splitBarFocused = true; });
    bar.addEventListener('pointerup', () => { setTimeout(() => { splitBarFocused = false; }, 200); });

    async function shareSplitPayload(payload) {
      try {
        await shareBaithakSplit(payload);
        collapseBaithakSplitComposer();
      } catch (error) {
        if (typeof showToast === 'function') {
          showToast(error?.message || splitTt('instants_fail', 'Could not share Split'));
        }
      }
    }

    bar.querySelector('[data-split-send]')?.addEventListener('click', async () => {
      const text = ta?.value?.trim() || '';
      if (!text) {
        if (typeof showToast === 'function') showToast(splitTt('instants_need_text', 'Write something first'));
        return;
      }
      const btn = bar.querySelector('[data-split-send]');
      if (btn) btn.disabled = true;
      try {
        await shareBaithakSplit({ text, type: 'note' });
        collapseBaithakSplitComposer();
      } catch (error) {
        if (typeof showToast === 'function') {
          showToast(error?.message || splitTt('instants_fail', 'Could not share Split'));
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    bar.querySelectorAll('[data-split-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.splitTool;
        if (tool === 'photo') {
          fileInput?.click();
          return;
        }
        if (tool === 'camera') {
          if (typeof openBaithakInstantCamera === 'function') openBaithakInstantCamera();
          return;
        }
        if (tool === 'gif' && typeof openGifPicker === 'function') {
          openGifPicker({
            onSelect: (gif) => {
              const url = gif?.url || gif?.mp4 || '';
              if (!url) return;
              shareSplitPayload({
                text: '',
                media: url,
                thumb: gif?.preview || gif?.url || url,
                type: 'gif',
              });
            },
          });
          return;
        }
        if (tool === 'song') {
          const picker =
            typeof openSongPicker === 'function'
              ? openSongPicker
              : typeof openMusicPicker === 'function'
                ? openMusicPicker
                : null;
          if (!picker) {
            if (typeof showToast === 'function') showToast(splitTt('baithak_song_unavailable', 'Song sharing unavailable'));
            return;
          }
          picker({
            onSelect: (song) => {
              if (!song) return;
              shareSplitPayload({ type: 'music', music: song, text: '' });
            },
          });
          return;
        }
        if (tool === 'sticker') {
          const insert = (emoji) => {
            if (!ta || !emoji) return;
            ta.value = (ta.value || '') + emoji;
            ta.focus();
          };
          if (typeof openStickerPicker === 'function') {
            openStickerPicker({ onSelect: insert });
          } else {
            insert('✨');
          }
        }
      });
    });

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      const photoBtn = bar.querySelector('[data-split-tool="photo"]');
      const sendBtn = bar.querySelector('[data-split-send]');
      if (photoBtn) photoBtn.disabled = true;
      if (sendBtn) sendBtn.disabled = true;
      try {
        if (typeof processAndUploadMedia !== 'function') {
          throw new Error(splitTt('instants_fail', 'Could not share Split'));
        }
        const up = await processAndUploadMedia(file, { folder: 'splits' });
        const media = up?.url || up?.secure_url || up?.media;
        const thumb = up?.thumb || media;
        await shareBaithakSplit({
          media,
          thumb,
          type: file.type.startsWith('video') ? 'video' : 'photo',
          mediaType: file.type.startsWith('video') ? 'video' : 'image',
        });
        collapseBaithakSplitComposer();
      } catch (error) {
        if (typeof showToast === 'function') {
          showToast(error?.message || splitTt('instants_fail', 'Could not share Split'));
        }
      } finally {
        if (photoBtn) photoBtn.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
      }
    });
  }

  function ensureSplitComposer(strip) {
    let bar = document.getElementById('baithakSplitComposer');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'baithakSplitComposer';
      bar.className = 'baithak-split-composer';
      bar.hidden = true;
      const ico = (name) => (typeof iconHtml === 'function' ? iconHtml(name, { size: 16 }) : '');
      bar.innerHTML = `
        <textarea id="splitNoteText" class="instant-compose-text baithak-split-text" rows="2" maxlength="280"
          placeholder="${splitTt('instants_ph', 'Leave a split…')}" data-living-ph="instant_note"
          aria-label="${splitTt('instants_compose_title', 'Leave a split')}"></textarea>
        <div class="baithak-split-actions">
          <button type="button" class="btn btn--primary baithak-split-send" data-split-send>${splitTt('instants_share', 'Share split')}</button>
        </div>
        <div class="instant-compose-tools baithak-split-tools">
          <button type="button" class="btn" data-split-tool="gif" aria-label="GIF">${ico('gif') || 'GIF'}</button>
          <button type="button" class="btn" data-split-tool="song" aria-label="${splitTt('attach_song', 'Song')}">${ico('music') || '♪'}</button>
          <button type="button" class="btn" data-split-tool="photo" aria-label="${splitTt('attach_photo', 'Photo')}">${ico('image') || '🖼'}</button>
          <button type="button" class="btn" data-split-tool="sticker" aria-label="${splitTt('instants_sticker', 'Sticker')}">${ico('smile') || '☺'}</button>
          <button type="button" class="btn" data-split-tool="camera" aria-label="${splitTt('duniya_camera', 'Camera')}">${ico('camera') || '📷'}</button>
        </div>
        <div class="instant-compose-meta">${splitTt('instants_friends_note', 'Friends · ~24h')}</div>
        <input type="file" id="splitPhotoInput" accept="image/*" hidden>`;
      strip.appendChild(bar);
    }
    wireSplitComposer(bar);
    return bar;
  }

  function expandBaithakSplitComposer() {
    if (!currentUser) {
      if (typeof showAuth === 'function') showAuth();
      else if (typeof showToast === 'function') showToast(splitTt('baithak_sign_in_instant', 'Sign in to share a Split'));
      return;
    }
    const strip = document.getElementById('baithakInstants');
    if (!strip) return;
    const bar = ensureSplitComposer(strip);
    bar.hidden = false;
    const ta = bar.querySelector('#splitNoteText');
    requestAnimationFrame(() => {
      ta?.focus();
      try {
        ta?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (e) {}
    });
  }

  /** Deprecated alias — Split tile / morph "New split" expand the inline bar, never a half-sheet. */
  function openBaithakInstantComposer(seedMode) {
    if (seedMode === 'camera') {
      if (typeof openBaithakInstantCamera === 'function') openBaithakInstantCamera();
      else expandBaithakSplitComposer();
      return;
    }
    expandBaithakSplitComposer();
  }

  async function renderBaithakInstants() {
    let strip = document.getElementById('baithakInstants');
    const chatList = document.getElementById('chatList');
    if (!chatList && !strip) return;
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'baithakInstants';
      strip.className = 'baithak-instants';
      chatList?.parentElement?.insertBefore(strip, chatList);
    }
    strip.setAttribute('aria-label', splitTt('instants_tray', 'Splits'));
    if (!currentUser) {
      strip.querySelector('.baithak-instants-row')?.remove();
      collapseBaithakSplitComposer();
      return;
    }
    let stories = [];
    try {
      stories = await loadStoryFeed('baithak');
    } catch (error) {
      console.warn('[splits] Baithak feed', error);
    }
    const pool = stories.filter(
      (s) => isSplitKind(s) && (!s.expiresAt || Number(s.expiresAt) > Date.now())
    );
    if (typeof enrichUsersWithProfileType === 'function') {
      await enrichUsersWithProfileType(pool, { names: true });
    }
    const bundles = groupByOwner(pool);
    const own = bundles.find((g) => g[0]?.own || g[0]?.uid === currentUser?.uid);
    const others = bundles.filter((g) => g !== own);
    if (own) own.sort((a, b) => (Number(b.createdAt || b.ts) || 0) - (Number(a.createdAt || a.ts) || 0));
    const unseen = others.filter(groupHasUnseen);
    const seen = others.filter((g) => !groupHasUnseen(g));
    const ordered = [...unseen, ...seen];
    ordered.forEach((g) => g.sort((a, b) => (Number(b.createdAt || b.ts) || 0) - (Number(a.createdAt || a.ts) || 0)));

    let row = strip.querySelector('.baithak-instants-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'baithak-instants-row';
      row.setAttribute('role', 'list');
      strip.insertBefore(row, strip.firstChild);
    }
    row.innerHTML = `
        <button type="button" class="baithak-instant baithak-instant--prompt" data-instant-compose role="listitem">
          <span class="baithak-instant-stub">${own ? '＋' : '✎'}</span>
          <small>${splitTt('instants_leave_note', 'Leave a split')}</small>
        </button>
        ${
          own
            ? (() => {
                const preview = splitBundlePreview(own);
                return `<button type="button" class="baithak-instant baithak-instant--you is-own" data-bundle="own" role="listitem">
                <span class="baithak-instant-stub">${splitTrayStubHtml(preview)}</span>
                <small>${safe(splitOwnerLabel(own[0]))}</small>
                ${own.length > 1 ? `<span class="baithak-instant-count">${own.length}</span>` : ''}
              </button>`;
              })()
            : ''
        }
        ${ordered
          .map(
            (group, i) => {
              const preview = splitBundlePreview(group);
              return `
          <button type="button" class="baithak-instant${groupHasUnseen(group) ? '' : ' is-seen'}" data-bundle="${i}" role="listitem">
            <span class="baithak-instant-stub">${splitTrayStubHtml(preview)}</span>
            <small>${safe(splitOwnerLabel(group[0]))}</small>
            ${group.length > 1 ? `<span class="baithak-instant-count">${group.length}</span>` : ''}
          </button>`;
            }
          )
          .join('')}`;

    ensureSplitComposer(strip);

    const composeBtn = row.querySelector('[data-instant-compose]');
    composeBtn?.addEventListener('click', () => expandBaithakSplitComposer());
    if (composeBtn && typeof onLongPress === 'function') {
      onLongPress(composeBtn, () => {
        composeBtn.dataset.suppressClick = '1';
        if (typeof openBaithakInstantCamera === 'function') openBaithakInstantCamera();
      });
      composeBtn.addEventListener(
        'click',
        (e) => {
          if (composeBtn.dataset.suppressClick === '1') {
            composeBtn.dataset.suppressClick = '0';
            e.preventDefault();
            e.stopPropagation();
          }
        },
        true
      );
    }
    row.querySelector('[data-bundle="own"]')?.addEventListener('click', () => {
      if (own?.[0]) openStoryViewer(own[0], own);
    });
    row.querySelectorAll('[data-bundle]:not([data-bundle="own"])').forEach((btn) => {
      btn.addEventListener('click', () => {
        const group = ordered[Number(btn.dataset.bundle)];
        if (!group?.[0]) return;
        markSplitsSeen(group.map((s) => s.id));
        openStoryViewer(group[0], group);
        btn.classList.add('is-seen');
      });
    });
  }

  function escapeLiteText(s) {
    return String(s || '').replace(/[&<>"']/g, '');
  }

  /** Avatar micro-menu: Show profile · Exclude from Splits (friends) · Message. */
  function openBaithakAvatarMenu(anchor, profile) {
    if (!profile?.uid) return;
    document.getElementById('baithakAvatarMenu')?.remove();
    const menu = document.createElement('div');
    menu.id = 'baithakAvatarMenu';
    menu.className = 'baithak-avatar-menu';
    menu.setAttribute('role', 'menu');
    const tt = (k, f) => {
      try {
        if (typeof t === 'function') {
          const v = t(k);
          if (v && v !== k) return v;
        }
      } catch (e) {}
      return f;
    };
    let isExcluded = !!profile.splitExcluded;
    let isFriend = !!profile.friend;
    const isAi = !!profile.isChaupaal || profile.uid === 'chaupaal';
    menu.innerHTML = isAi
      ? `<button type="button" role="menuitem" data-act="profile">${tt('avatar_menu_profile', 'Show profile')}</button>
         <button type="button" role="menuitem" data-act="hub">${tt('chaupaal_hub', 'Chaupaal Hub')}</button>`
      : `<button type="button" role="menuitem" data-act="profile">${tt('avatar_menu_profile', 'Show profile')}</button>
      <button type="button" role="menuitem" data-act="exclusion" hidden>${tt('exclusion_menu_exclude', 'Exclude from Splits')}</button>
      <button type="button" role="menuitem" data-act="message">${tt('avatar_menu_message', 'Message')}</button>`;
    const host = document.querySelector('.device') || document.body;
    host.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    menu.style.top = `${Math.min(rect.bottom - hostRect.top + 4, (hostRect.height || 600) - 140)}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left - hostRect.left, (hostRect.width || 360) - 180))}px`;
    const close = () => {
      document.removeEventListener('pointerdown', onOut, true);
      menu.remove();
    };
    const onOut = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor) close();
    };
    setTimeout(() => document.addEventListener('pointerdown', onOut, true), 0);

    // Hydrate friend + exclusion state
    if (!isAi && typeof hydrateRelationships === 'function') {
      hydrateRelationships([profile.uid])
        .then((states) => {
          const st = states[profile.uid] || {};
          isFriend = !!st.friend;
          isExcluded = !!st.splitExcluded;
          const btn = menu.querySelector('[data-act="exclusion"]');
          if (btn) {
            if (isFriend) {
              btn.hidden = false;
              btn.textContent = isExcluded
                ? tt('exclusion_menu_remove', 'Remove from exclusion list')
                : tt('exclusion_menu_exclude', 'Exclude from Splits');
            } else {
              btn.remove();
            }
          }
        })
        .catch(() => {});
    }

    menu.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        close();
        if (act === 'profile') {
          if (isAi && typeof openChaupaalAiProfile === 'function') openChaupaalAiProfile();
          else if (typeof openPublicProfile === 'function') openPublicProfile(profile);
          else if (typeof openProfilePreview === 'function') openProfilePreview(profile);
        } else if (act === 'hub' && typeof openChaupaalHub === 'function') {
          openChaupaalHub();
        } else if (act === 'exclusion' && typeof setSplitExclusion === 'function') {
          try {
            await setSplitExclusion(profile.uid, !isExcluded);
            if (typeof showToast === 'function') {
              showToast(
                !isExcluded
                  ? tt('exclusion_added_short', 'Added to exclusion list')
                  : tt('exclusion_removed_short', 'Removed from exclusion list')
              );
            }
          } catch (e) {
            if (typeof showToast === 'function') showToast(e?.message || tt('exclusion_fail', 'Could not update exclusion list'));
          }
        } else if (act === 'message' && typeof openDmWithSharedHello === 'function') {
          await openDmWithSharedHello({
            uid: profile.uid,
            name: profile.name || 'Friend',
            avatar: profile.avatar || profile.photoURL || '👤',
            starterText: '',
            origin: 'avatar_menu',
          });
        }
      });
    });
  }

  function bindBaithakAvatarMenus() {
    const list = document.getElementById('chatList');
    if (!list || list.dataset.avatarMenuWired) return;
    list.dataset.avatarMenuWired = '1';
    if (typeof onLongPress !== 'function') return;
    const mo = new MutationObserver(() => {
      list.querySelectorAll('.chat-item:not([data-self-chat]):not([data-chaupaal-chat]) .chat-avatar').forEach((av) => {
        if (av.dataset.cfMenuWired) return;
        av.dataset.cfMenuWired = '1';
        onLongPress(av, () => {
          const row = av.closest('.chat-item');
          const chatId = row?.dataset?.chatId;
          const chat =
            (typeof baithakChats !== 'undefined' && baithakChats?.find?.((c) => c.id === chatId || c.firestoreId === chatId)) ||
            {};
          const uid =
            chat.uid ||
            chat.peerUid ||
            (chat.participants || []).find((u) => u !== currentUser?.uid);
          if (!uid) return;
          openBaithakAvatarMenu(av, {
            uid,
            name: chat.name,
            photoURL: chat.photoURL,
            avatar: chat.avatar,
            username: chat.username,
          });
        });
      });
    });
    mo.observe(list, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindBaithakAvatarMenus);
  } else {
    bindBaithakAvatarMenus();
  }

  // Legacy name kept
  function renderInstants() {
    renderBaithakInstants();
  }

  async function openStoryArchive() {
    const data = await storyCall('archive');
    const stories = data.stories || [];
    document.getElementById('storyArchiveSheet')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'storyArchiveSheet';
    overlay.className = 'archive-overlay';
    const baithak = stories.filter((s) => s.destination === 'baithak');
    const duniya = stories.filter((s) => s.destination === 'duniya');
    const live = stories.filter((s) => !s.expiresAt || s.expiresAt > Date.now());
    const expired = stories.filter((s) => s.expiresAt && s.expiresAt <= Date.now());
    const splits = stories.filter((s) => s.kind === 'split' || s.kind === 'instant');

    const cell = (story, index) => `
      <button type="button" class="story-archive-cell" data-story-index="${index}">
        ${story.thumb || story.media
          ? `<img src="${story.thumb || story.media}" alt="">`
          : `<span class="story-archive-fallback">${story.kind === 'split' || story.kind === 'instant' ? '⚡' : story.type === 'score' ? '🎯' : '📖'}</span>`}
        <span class="story-archive-meta">
          <strong>${story.destination === 'duniya' ? 'Duniya' : 'Baithak'}${story.kind === 'split' || story.kind === 'instant' ? ' · Split' : ''}</strong>
          <small>${story.own && (story.kind === 'split' || story.kind === 'instant') ? ' · Split' : story.destination === 'duniya' ? 'Public' : 'Friends'}${
            story.expiresAt && story.expiresAt > Date.now() ? ' · live' : ' · archived'
          }</small>
        </span>
      </button>`;

    overlay.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml==='function'?backButtonHtml({ attrs: 'data-archive-back' }):'<button type="button" data-archive-back class="cp-back-btn" aria-label="Back">←</button>'}
        <div style="flex:1">
          <strong>Archive</strong>
          <div class="relationship-private-note">Stories (Duniya) · Splits (Baithak). Only you see this.</div>
        </div>
      </div>
      <div class="story-archive-body">
        <div class="story-archive-stats">
          <span><strong>${live.length}</strong> live</span>
          <span><strong>${splits.length}</strong> Splits</span>
          <span><strong>${duniya.length}</strong> Duniya</span>
          <span><strong>${expired.length}</strong> expired</span>
        </div>
        ${
          stories.length
            ? `<div class="story-archive-grid">${stories.map((s, i) => cell(s, i)).join('')}</div>`
            : `<div class="comments-empty">No stories or Splits yet.</div>`
        }
      </div>`;
    document.querySelector('.device')?.appendChild(overlay);
    if (typeof pushNavLayer === 'function') {
      overlay.dataset.navManaged = '1';
      pushNavLayer(overlay, () => overlay.remove());
    }
    overlay.querySelector('[data-archive-back]')?.addEventListener('click', () => overlay.remove());
    overlay.querySelectorAll('[data-story-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const idx = Number(button.dataset.storyIndex);
        overlay.remove();
        openStoryViewer(stories[idx], stories);
      });
    });
  }

  window.storyCall = storyCall;
  window.loadStoryFeed = loadStoryFeed;
  window.createPlatformStory = createPlatformStory;
  window.deletePlatformStory = deletePlatformStory;
  window.getStoryInteractions = getStoryInteractions;
  window.likePlatformStory = likePlatformStory;
  window.commentPlatformStory = commentPlatformStory;
  window.viewPlatformStory = viewPlatformStory;
  window.listStoryViews = listStoryViews;
  window.respondStoryInteractive = respondStoryInteractive;
  window.listStoryInteractive = listStoryInteractive;
  window.sendStoryToPeers = sendStoryToPeers;
  window.deleteStoryComment = deleteStoryComment;
  window.getPlatformStory = getPlatformStory;
  if (typeof window.fetchStoryLikers !== 'function') window.fetchStoryLikers = fetchStoryLikersFromApi;
  if (typeof window.fetchContentLikers !== 'function') window.fetchContentLikers = fetchContentLikersFromApi;
  window.openProfileStories = openProfileStories;
  window.renderLiveBaithakStories = renderLiveBaithakStories;
  window.renderBaithakInstants = renderBaithakInstants;
  window.openBaithakInstantComposer = openBaithakInstantComposer;
  window.expandBaithakSplitComposer = expandBaithakSplitComposer;
  window.shareBaithakSplit = shareBaithakSplit;
  window.splitOwnerLabel = splitOwnerLabel;
  window.openBaithakAvatarMenu = openBaithakAvatarMenu;
  window.openStoryArchive = openStoryArchive;
})();
