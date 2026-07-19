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
    const row = document.getElementById('storiesRow');
    if (!row || !currentUser) return;
    let stories = [];
    try {
      stories = await loadStoryFeed('baithak');
    } catch (error) {
      console.warn('[stories] Baithak feed', error);
      return;
    }
    row.querySelectorAll('.story-item:not(.story-add)').forEach((node) => node.remove());
    groupByOwner(stories, 'story').forEach((group) => {
      const first = group[0];
      const item = document.createElement('div');
      item.className = 'story-item';
      item.innerHTML = `
        <div class="story-ring ${first.seen ? 'seen' : ''}">
          <div class="story-avatar">${first.avatar && /^https:/.test(first.avatar) ? `<img src="${first.avatar}" alt="">` : first.avatar || '👤'}</div>
        </div>
        <div class="story-label">${first.own ? 'Your story' : safe(first.name)}</div>`;
      item.addEventListener('click', () => openStoryViewer(first, group));
      if (!first.own && typeof bindProfileLongPress === 'function') {
        bindProfileLongPress(item.querySelector('.story-avatar'), {
          uid: first.uid,
          name: first.name,
          photoURL: /^https:/.test(first.avatar || '') ? first.avatar : '',
        });
      }
      row.appendChild(item);
    });
    renderInstants(stories.filter((story) => story.kind === 'instant'));
  }

  function renderInstants(instants) {
    let strip = document.getElementById('baithakInstants');
    const chatList = document.getElementById('chatList');
    if (!chatList) return;
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'baithakInstants';
      strip.className = 'baithak-instants';
      chatList.parentElement?.insertBefore(strip, chatList);
    }
    if (!instants.length) {
      strip.remove();
      return;
    }
    strip.innerHTML = `<div class="baithak-instants-label">Instants</div><div class="baithak-instants-row">${instants
      .map(
        (story, index) => `
        <button type="button" class="baithak-instant" data-instant-index="${index}">
          ${story.thumb || story.media ? `<img src="${story.thumb || story.media}" alt="">` : '<span>⚡</span>'}
          <small>${story.own ? 'You' : safe(story.name.split(' ')[0])}</small>
        </button>`
      )
      .join('')}</div>`;
    strip.querySelectorAll('[data-instant-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const story = instants[Number(button.dataset.instantIndex)];
        openStoryViewer(story, [story]);
      });
    });
  }

  async function openStoryArchive() {
    const data = await storyCall('archive');
    const stories = data.stories || [];
    if (!stories.length) {
      showToast('Your story archive is empty');
      return;
    }
    openStoryViewer(stories[0], stories);
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
  window.openStoryArchive = openStoryArchive;
})();
