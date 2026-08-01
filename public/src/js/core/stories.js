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

  async function renderLiveBaithakStories() {
    // Baithak no longer shows Instagram-style Stories rings — Instants only.
    // Duniya owns Stories.
    return renderBaithakInstants();
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
    if (!currentUser) {
      strip.innerHTML = '';
      return;
    }
    let stories = [];
    try {
      stories = await loadStoryFeed('baithak');
    } catch (error) {
      console.warn('[instants] Baithak feed', error);
    }
    const instants = stories.filter((s) => s.kind === 'instant' || s.destination === 'baithak');
    // Prefer kind=instant; fall back to baithak feed items for migration
    const items = stories.filter((s) => s.kind === 'instant');
    const pool = items.length ? items : instants.filter((s) => s.kind !== 'story');
    if (typeof enrichUsersWithProfileType === 'function') {
      await enrichUsersWithProfileType(pool);
    }
    const bundles = groupByOwner(pool);
    const own = bundles.find((g) => g[0]?.own || g[0]?.uid === currentUser?.uid);
    const others = bundles.filter((g) => g !== own);

    const tt = (k, f) => {
      try {
        if (typeof t === 'function') {
          const v = t(k);
          if (v && v !== k) return v;
        }
      } catch (e) {}
      return f;
    };

    strip.innerHTML = `
      <div class="baithak-instants-row" role="list">
        <button type="button" class="baithak-instant baithak-instant--prompt" data-instant-compose role="listitem">
          <span class="baithak-instant-stub">${own ? '＋' : '✎'}</span>
          <small>${tt('instants_leave_note', 'Leave a note')}</small>
        </button>
        ${
          own
            ? `<button type="button" class="baithak-instant baithak-instant--you is-own" data-bundle="own" role="listitem">
                <span class="baithak-instant-stub">${own[0].thumb || own[0].media ? `<img src="${safe(own[0].thumb || own[0].media)}" alt="">` : '⚡'}</span>
                <small>${tt('instants_you', 'You')}</small>
                ${own.length > 1 ? `<span class="baithak-instant-count">${own.length}</span>` : ''}
              </button>`
            : ''
        }
        ${others
          .map(
            (group, i) => `
          <button type="button" class="baithak-instant" data-bundle="${i}" role="listitem">
            <span class="baithak-instant-stub">${
              group[0].thumb || group[0].media
                ? `<img src="${safe(group[0].thumb || group[0].media)}" alt="">`
                : escapeLiteText(group[0].text || '⚡').slice(0, 1)
            }</span>
            <small>${safe((group[0].name || '').split(' ')[0] || 'Friend')}</small>
            ${group.length > 1 ? `<span class="baithak-instant-count">${group.length}</span>` : ''}
          </button>`
          )
          .join('')}
      </div>`;

    strip.querySelector('[data-instant-compose]')?.addEventListener('click', () => openBaithakInstantComposer());
    // Long-press Leave a note → camera Instant (IG Notes-inspired)
    const composeBtn = strip.querySelector('[data-instant-compose]');
    if (composeBtn && typeof onLongPress === 'function') {
      onLongPress(composeBtn, () => {
        composeBtn.dataset.suppressClick = '1';
        openBaithakInstantComposer('camera');
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
    strip.querySelector('[data-bundle="own"]')?.addEventListener('click', () => {
      if (own?.[0]) openStoryViewer(own[0], own);
    });
    strip.querySelectorAll('[data-bundle]:not([data-bundle="own"])').forEach((btn) => {
      btn.addEventListener('click', () => {
        const group = others[Number(btn.dataset.bundle)];
        if (group?.[0]) openStoryViewer(group[0], group);
      });
    });
  }

  function escapeLiteText(s) {
    return String(s || '').replace(/[&<>"']/g, '');
  }

  /** Instants composer — tap = note; long-press entry seeds camera. Close Friends audience. */
  function openBaithakInstantComposer(seedMode) {
    if (!currentUser) {
      if (typeof showAuth === 'function') showAuth();
      return;
    }
    const tt = (k, f) => {
      try {
        if (typeof t === 'function') {
          const v = t(k);
          if (v && v !== k) return v;
        }
      } catch (e) {}
      return f;
    };
    const bodyHtml = `
      <div class="instant-compose-premium">
        <textarea id="instantText" class="instant-compose-text" rows="3" maxlength="280"
          placeholder="${tt('instants_ph', 'Leave a quick note for Close Friends…')}"
          data-living-ph="instant_note"></textarea>
        <div class="instant-compose-tools">
          <button type="button" class="btn" data-instant-tool="gif">GIF</button>
          <button type="button" class="btn" data-instant-tool="sticker">Sticker</button>
          <button type="button" class="btn" data-instant-tool="music">Music</button>
          <button type="button" class="btn" data-instant-tool="camera">${typeof iconHtml === 'function' ? iconHtml('camera', { size: 14 }) : '📷'} Camera</button>
        </div>
        <div class="instant-compose-meta">${tt('instants_cf_note', 'Shared with Close Friends · disappears in ~24h')}</div>
        <input type="file" id="instantCamera" accept="image/*,video/*" capture="environment" hidden>
        <button type="button" class="btn btn--primary btn--block" data-instant-share style="margin-top:12px;">${tt('instants_share', 'Share note')}</button>
      </div>`;

    async function shareInstant(payload) {
      try {
        const story = await createPlatformStory({
          destination: 'baithak',
          kind: 'instant',
          visibility: 'close_friends',
          text: payload.text || '',
          media: payload.media || null,
          thumb: payload.thumb || null,
          type: payload.type || 'note',
          expiresInHours: 24,
        });
        if (!story) throw new Error(tt('baithak_story_fail', 'Could not share'));
        if (typeof showToast === 'function') showToast(tt('instants_shared', 'Note shared'));
        await renderBaithakInstants();
        return story;
      } catch (e) {
        if (typeof showToast === 'function') showToast(e?.message || tt('baithak_story_fail', 'Could not share'));
        throw e;
      }
    }

    function wire(sheet, close) {
      const fileInput = sheet.querySelector('#instantCamera');
      if (typeof bindLivingPlaceholder === 'function') {
        bindLivingPlaceholder(sheet.querySelector('#instantText'), 'instant_note');
      }
      sheet.querySelectorAll('[data-instant-tool]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const tool = btn.dataset.instantTool;
          if (tool === 'camera') {
            fileInput?.click();
            return;
          }
          if (tool === 'gif' && typeof openGifPicker === 'function') {
            openGifPicker({
              onSelect: async (gif) => {
                try {
                  await shareInstant({
                    text: '',
                    media: gif?.url || gif?.mp4,
                    thumb: gif?.preview || gif?.url,
                    type: 'gif',
                  });
                  close();
                } catch (e) {}
              },
            });
            return;
          }
          if (tool === 'music' && typeof openMusicPicker === 'function') {
            openMusicPicker({
              onSelect: async (song) => {
                try {
                  await shareInstant({
                    text: `${song?.title || 'Track'}${song?.artist ? ' — ' + song.artist : ''}`,
                    type: 'music',
                  });
                  close();
                } catch (e) {}
              },
            });
            return;
          }
          if (tool === 'sticker' && typeof showToast === 'function') {
            showToast(tt('instants_sticker_soon', 'Stickers — pick an emoji for now'));
            const ta = sheet.querySelector('#instantText');
            if (ta) ta.value = (ta.value || '') + '✨';
          }
        });
      });
      fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
          let media = null;
          let thumb = null;
          if (typeof processAndUploadMedia === 'function') {
            const up = await processAndUploadMedia(file, { folder: 'instants' });
            media = up?.url || up?.secure_url || up?.media;
            thumb = up?.thumb || media;
          }
          await shareInstant({ media, thumb, type: file.type.startsWith('video') ? 'video' : 'photo' });
          close();
        } catch (e) {
          if (typeof showToast === 'function') showToast(tt('baithak_story_fail', 'Could not share'));
        }
      });
      sheet.querySelector('[data-instant-share]')?.addEventListener('click', async () => {
        const text = sheet.querySelector('#instantText')?.value?.trim() || '';
        if (!text) {
          if (typeof showToast === 'function') showToast(tt('instants_need_text', 'Write something or add media'));
          return;
        }
        const btn = sheet.querySelector('[data-instant-share]');
        if (btn) btn.disabled = true;
        try {
          await shareInstant({ text, type: 'note' });
          close();
        } catch (e) {
          if (btn) btn.disabled = false;
        }
      });
      if (seedMode === 'camera') setTimeout(() => fileInput?.click(), 120);
    }

    if (typeof openHalfSheet === 'function') {
      openHalfSheet({
        id: 'baithakInstantComposer',
        title: tt('instants_compose_title', 'Leave a note'),
        accent: 'baithak',
        bodyHtml,
        onMount: (sheet, close) => {
          const wrapped = () => {
            try {
              close();
            } finally {
              try {
                if (typeof restoreAppShell === 'function') restoreAppShell('instants_close');
              } catch (e) {}
            }
          };
          wire(sheet, wrapped);
        },
      });
      return;
    }
    // Fallback overlay
    document.getElementById('baithakInstantComposer')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'baithakInstantComposer';
    sheet.className = 'archive-overlay';
    sheet.dataset.navManaged = '1';
    sheet.innerHTML = `<div class="archive-header"><button type="button" data-overlay-dismiss>←</button><div style="flex:1"><strong>${tt('instants_compose_title', 'Leave a note')}</strong></div></div><div style="padding:16px;">${bodyHtml}</div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
      try {
        if (typeof restoreAppShell === 'function') restoreAppShell('instants_close');
      } catch (e) {}
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    wire(sheet, close);
  }

  /** Avatar micro-menu: Show profile · Add/Remove Close Friend · (basics). Anchored to DP — not a half-sheet. */
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
    let isCf = !!profile.closeFriend;
    const isAi = !!profile.isChaupaal || profile.uid === 'chaupaal';
    menu.innerHTML = isAi
      ? `<button type="button" role="menuitem" data-act="profile">${tt('avatar_menu_profile', 'Show profile')}</button>
         <button type="button" role="menuitem" data-act="hub">${tt('chaupaal_hub', 'Chaupaal Hub')}</button>`
      : `<button type="button" role="menuitem" data-act="profile">${tt('avatar_menu_profile', 'Show profile')}</button>
      <button type="button" role="menuitem" data-act="cf">${isCf ? tt('avatar_menu_remove_cf', 'Remove Close Friend') : tt('avatar_menu_add_cf', 'Add Close Friend')}</button>
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

    // Hydrate CF state
    if (typeof hydrateRelationships === 'function') {
      hydrateRelationships([profile.uid])
        .then((states) => {
          isCf = !!states[profile.uid]?.closeFriend;
          const btn = menu.querySelector('[data-act="cf"]');
          if (btn) {
            btn.textContent = isCf
              ? tt('avatar_menu_remove_cf', 'Remove Close Friend')
              : tt('avatar_menu_add_cf', 'Add Close Friend');
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
        } else if (act === 'cf' && typeof setCloseFriend === 'function') {
          try {
            await setCloseFriend(profile.uid, !isCf);
            if (typeof showToast === 'function') {
              showToast(
                !isCf
                  ? tt('avatar_cf_added', 'Added to Close Friends')
                  : tt('avatar_cf_removed', 'Removed from Close Friends')
              );
            }
          } catch (e) {
            if (typeof showToast === 'function') showToast(e?.message || 'Could not update');
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
    const instants = stories.filter((s) => s.kind === 'instant');

    const cell = (story, index) => `
      <button type="button" class="story-archive-cell" data-story-index="${index}">
        ${story.thumb || story.media
          ? `<img src="${story.thumb || story.media}" alt="">`
          : `<span class="story-archive-fallback">${story.kind === 'instant' ? '⚡' : story.type === 'score' ? '🎯' : '📖'}</span>`}
        <span class="story-archive-meta">
          <strong>${story.destination === 'duniya' ? 'Duniya' : 'Baithak'}${story.kind === 'instant' ? ' · Instant' : ''}</strong>
          <small>${story.visibility === 'close_friends' ? 'Close Friends' : story.destination === 'duniya' ? 'Public' : 'Friends'}${
            story.expiresAt && story.expiresAt > Date.now() ? ' · live' : ' · archived'
          }</small>
        </span>
      </button>`;

    overlay.innerHTML = `
      <div class="archive-header">
        <button type="button" data-archive-back aria-label="Back">←</button>
        <div style="flex:1">
          <strong>Archive</strong>
          <div class="relationship-private-note">Stories (Duniya) · Instants (Baithak). Only you see this.</div>
        </div>
      </div>
      <div class="story-archive-body">
        <div class="story-archive-stats">
          <span><strong>${live.length}</strong> live</span>
          <span><strong>${instants.length}</strong> Instants</span>
          <span><strong>${duniya.length}</strong> Duniya</span>
          <span><strong>${expired.length}</strong> expired</span>
        </div>
        ${
          stories.length
            ? `<div class="story-archive-grid">${stories.map((s, i) => cell(s, i)).join('')}</div>`
            : `<div class="comments-empty">No stories or Instants yet.</div>`
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
  window.openProfileStories = openProfileStories;
  window.renderLiveBaithakStories = renderLiveBaithakStories;
  window.renderBaithakInstants = renderBaithakInstants;
  window.openBaithakInstantComposer = openBaithakInstantComposer;
  window.openBaithakAvatarMenu = openBaithakAvatarMenu;
  window.openStoryArchive = openStoryArchive;
})();
