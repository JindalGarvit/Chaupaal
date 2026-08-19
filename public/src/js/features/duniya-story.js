/**
 * Duniya Stories — strip, seen map, overlay renderer, public API.
 * Editor/viewer attach onto window.DuniyaStory from sibling files.
 */
(function () {
  'use strict';

  const SEEN_KEY = 'chaupaal_duniya_story_seen';
  const MUTE_KEY = 'chaupaal_duniya_story_muted';
  const NS = (window.DuniyaStory = window.DuniyaStory || {});

  function tt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
    );
  }

  function report(feature, err) {
    if (typeof reportClientError === 'function') {
      reportClientError({
        feature,
        message: err?.message || String(err),
        stack: err?.stack || '',
        fatal: false,
      });
    }
  }

  function reducedMotion() {
    try {
      if (typeof Micro !== 'undefined' && Micro.prefersReducedMotion) return !!Micro.prefersReducedMotion();
      return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch (e) {
      return false;
    }
  }

  function isTeen() {
    try {
      if (typeof isTeenModeUser === 'function') return !!isTeenModeUser();
    } catch (e) {}
    return !!(typeof userProfile !== 'undefined' && (userProfile.teenMode || userProfile.isMinor));
  }

  function readMap(key) {
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === 'object' ? data : {};
    } catch (e) {
      return {};
    }
  }

  function writeMap(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {}
  }

  function seenStore() {
    const uid = typeof currentUser !== 'undefined' ? currentUser?.uid || 'anon' : 'anon';
    const all = readMap(SEEN_KEY);
    if (!all[uid] || typeof all[uid] !== 'object') all[uid] = {};
    return { all, mine: all[uid], uid };
  }

  function isStorySeen(storyId) {
    if (!storyId) return false;
    return !!seenStore().mine[storyId];
  }

  function markStorySeen(story) {
    if (!story?.id) return;
    const { all, mine, uid } = seenStore();
    mine[story.id] = Date.now();
    all[uid] = mine;
    writeMap(SEEN_KEY, all);
    if (typeof viewPlatformStory === 'function') viewPlatformStory(story);
  }

  function bundleFullySeen(stories) {
    return (stories || []).every((s) => isStorySeen(s.id));
  }

  function mutedSet() {
    const uid = typeof currentUser !== 'undefined' ? currentUser?.uid || 'anon' : 'anon';
    const all = readMap(MUTE_KEY);
    return new Set(all[uid] || []);
  }

  function muteAuthor(authorUid) {
    const uid = typeof currentUser !== 'undefined' ? currentUser?.uid || 'anon' : 'anon';
    const all = readMap(MUTE_KEY);
    const list = Array.isArray(all[uid]) ? all[uid] : [];
    if (authorUid && !list.includes(authorUid)) list.push(authorUid);
    all[uid] = list.slice(-200);
    writeMap(MUTE_KEY, all);
  }

  function firstUnwatchedIndex(stories) {
    const i = (stories || []).findIndex((s) => !isStorySeen(s.id));
    return i < 0 ? 0 : i;
  }

  function overlayStyle(ov) {
    const x = Math.max(0, Math.min(1, Number(ov.x) || 0.5));
    const y = Math.max(0, Math.min(1, Number(ov.y) || 0.5));
    const scale = Number(ov.scale) || 1;
    const rot = Number(ov.rotate) || 0;
    return `left:${(x * 100).toFixed(2)}%;top:${(y * 100).toFixed(2)}%;transform:translate(-50%,-50%) scale(${scale}) rotate(${rot}deg);z-index:${Number(ov.z) || 1};`;
  }

  function filterClass(filter) {
    const f = String(filter || 'normal');
    return f && f !== 'normal' ? ` ds-filter-${f}` : '';
  }

  function renderOverlayHtml(ov, opts) {
    if (!ov || !ov.type) return '';
    const cls = `ds-ov ds-ov-${ov.type}${ov.locked ? ' is-lock' : ''}`;
    const style = overlayStyle(ov);
    const id = esc(ov.id || '');
    if (ov.type === 'text') {
      const pill = ov.bg ? ' is-pill' : '';
      const st = ov.style === 'serif' ? ' is-serif' : ov.style === 'poster' ? ' is-poster' : '';
      const bg = ov.bg ? `background:${esc(ov.bg)};` : '';
      return `<div class="${cls} ds-text${pill}${st}" data-ov="${id}" style="${style}color:${esc(ov.color || '#fff')};${bg}text-align:${esc(ov.align || 'center')}">${esc(ov.text)}</div>`;
    }
    if (ov.type === 'emoji') return `<div class="${cls} ds-emoji" data-ov="${id}" style="${style}">${esc(ov.emoji)}</div>`;
    if (ov.type === 'gif') {
      return `<div class="${cls}" data-ov="${id}" style="${style}"><img src="${esc(ov.url)}" alt="" style="max-width:140px;border-radius:10px;"></div>`;
    }
    if (ov.type === 'mention') {
      return `<button type="button" class="${cls} ds-sticker" data-ov="${id}" data-mention="${esc(ov.uid)}" style="${style}">@${esc(ov.name || ov.username)}</button>`;
    }
    if (ov.type === 'link') {
      return `<button type="button" class="${cls} ds-sticker" data-ov="${id}" data-link="${esc(ov.url)}" style="${style}">${esc(ov.label || 'Link')}</button>`;
    }
    if (ov.type === 'credit') {
      return `<div class="${cls} ds-credit" data-ov="${id}" style="${style}">Restory · ${esc(ov.name)}</div>`;
    }
    if (ov.type === 'poll') {
      const optsHtml = (ov.options || [])
        .map((o, i) => `<button type="button" data-poll="${i}">${esc(o)}</button>`)
        .join('');
      return `<div class="${cls} ds-widget" data-ov="${id}" data-kind="poll" style="${style}"><strong>${esc(ov.prompt || 'Vote')}</strong>${optsHtml}</div>`;
    }
    if (ov.type === 'question') {
      return `<div class="${cls} ds-widget" data-ov="${id}" data-kind="question" style="${style}"><strong>${esc(ov.prompt || 'Ask me')}</strong><button type="button" data-ask>Answer</button></div>`;
    }
    if (ov.type === 'quiz') {
      const optsHtml = (ov.options || [])
        .map((o, i) => `<button type="button" data-quiz="${i}">${esc(o)}</button>`)
        .join('');
      return `<div class="${cls} ds-widget" data-ov="${id}" data-kind="quiz" style="${style}"><strong>${esc(ov.prompt || 'Quiz')}</strong>${optsHtml}</div>`;
    }
    if (ov.type === 'slider') {
      return `<div class="${cls} ds-widget" data-ov="${id}" data-kind="slider" style="${style}"><strong>${esc(ov.emoji || '🔥')} ${esc(ov.prompt || '')}</strong><input type="range" min="0" max="100" value="50" data-slider></div>`;
    }
    if (ov.type === 'countdown') {
      return `<div class="${cls} ds-widget" data-ov="${id}" data-kind="countdown" style="${style}"><strong>${esc(ov.title || 'Countdown')}</strong><div data-cd="${Number(ov.targetAt) || 0}">…</div></div>`;
    }
    if (ov.type === 'addyours') {
      const faces = (opts?.faces || [])
        .slice(0, 5)
        .map((f) => (f.avatar && /^https:/.test(f.avatar) ? `<img src="${esc(f.avatar)}" alt="">` : ''))
        .join('');
      return `<div class="${cls} ds-widget" data-ov="${id}" data-kind="addyours" style="${style}"><strong>${esc(ov.prompt || 'Add yours')}</strong><div class="avatar-stack">${faces}</div><button type="button" data-add-yours>Add yours</button></div>`;
    }
    if (ov.type === 'music' && opts?.musicHtml) {
      return `<div class="${cls} ds-flying" data-ov="${id}" style="${style}">${opts.musicHtml}</div>`;
    }
    if (ov.type === 'location' && opts?.locationHtml) {
      return `<div class="${cls}" data-ov="${id}" style="${style}">${opts.locationHtml}</div>`;
    }
    if (ov.type === 'draw') {
      if (typeof DuniyaStoryMedia !== 'undefined' && DuniyaStoryMedia.renderDrawOverlayHtml) {
        return DuniyaStoryMedia.renderDrawOverlayHtml(ov, opts);
      }
      return '';
    }
    return '';
  }

  function renderOverlaysInto(host, story, opts) {
    if (!host) return;
    const overlays = Array.isArray(story?.overlays) ? story.overlays : [];
    const musicHtml =
      story?.music && typeof renderMusicCard === 'function'
        ? renderMusicCard(story.music, { variant: 'story' })
        : story?.music
          ? `<div class="ds-sticker ds-flying"><span>${esc(story.music.title)} · ${esc(story.music.artist || '')}</span></div>`
          : '';
    const locationHtml =
      story?.location && typeof renderLocationCard === 'function'
        ? renderLocationCard(story.location, { variant: 'story' })
        : '';
    const extra = [];
    if (story?.music && !overlays.some((o) => o.type === 'music')) {
      extra.push({ type: 'music', x: 0.5, y: 0.82, scale: 1, rotate: 0, z: 8 });
    }
    if (story?.location && !overlays.some((o) => o.type === 'location')) {
      extra.push({ type: 'location', x: 0.5, y: 0.18, scale: 1, rotate: 0, z: 8 });
    }
    host.insertAdjacentHTML(
      'beforeend',
      overlays
        .concat(extra)
        .map((ov) =>
          renderOverlayHtml(ov, {
            faces: story.addYoursFaces,
            musicHtml,
            locationHtml,
            ...(opts || {}),
          })
        )
        .join('')
    );
    host.querySelectorAll('[data-cd]').forEach((el) => {
      const target = Number(el.dataset.cd) || 0;
      const tick = () => {
        const d = target - Date.now();
        if (d <= 0) {
          el.textContent = 'Now';
          return;
        }
        const h = Math.floor(d / 3600000);
        const m = Math.floor((d % 3600000) / 60000);
        const s = Math.floor((d % 60000) / 1000);
        el.textContent = h > 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m ${s}s`;
      };
      tick();
      const id = setInterval(tick, reducedMotion() ? 5000 : 1000);
      el.dataset.timer = String(id);
    });
    if (typeof mountMusicCards === 'function') mountMusicCards(host);
    if (typeof mountLocationCards === 'function') mountLocationCards(host);
  }

  function bundleTray(stories) {
    const groups = new Map();
    (stories || []).forEach((s) => {
      if (!s?.uid) return;
      if (!groups.has(s.uid)) groups.set(s.uid, []);
      groups.get(s.uid).push(s);
    });
    return [...groups.values()].map((g) => g.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  }

  function pickGallery({ onFile, capture } = {}) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.dataset.navIgnore = '1';
    document.body.appendChild(input);
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      setTimeout(() => {
        try {
          input.remove();
        } catch (e) {}
      }, 0);
    };
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) cleanup();
      }, 500);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      cleanup();
      if (file && typeof onFile === 'function') onFile(file);
    });
    window.addEventListener('focus', onFocus);
    input.click();
  }

  async function renderStrip() {
    const row = document.getElementById('duniyaStoriesRow');
    if (!row) return;
    if (typeof currentUser === 'undefined' || !currentUser) {
      row.innerHTML = '';
      return;
    }
    let stories = [];
    try {
      if (typeof loadStoryFeed === 'function') stories = await loadStoryFeed('duniya');
    } catch (error) {
      console.warn('[stories] Duniya feed', error);
      report('duniya_stories_feed', error);
    }
    const muted = mutedSet();
    stories = (stories || []).filter((s) => !muted.has(s.uid) || s.uid === currentUser.uid);
    if (stories.length && typeof enrichUsersWithProfileType === 'function') {
      await enrichUsersWithProfileType(stories);
    }
    let followStates = {};
    if (stories.length && typeof hydrateRelationships === 'function') {
      followStates = await hydrateRelationships(stories.map((s) => s.uid)).catch(() => ({}));
    }
    const groups = bundleTray(stories);
    const own = groups.find((g) => g[0]?.uid === currentUser.uid) || [];
    const others = groups.filter((g) => g[0]?.uid !== currentUser.uid);
    const unseen = others.filter((g) => !bundleFullySeen(g) && followStates[g[0].uid]?.following);
    const seenFollow = others.filter((g) => bundleFullySeen(g) && followStates[g[0].uid]?.following);
    const discoveryUnseen = others.filter((g) => !bundleFullySeen(g) && !followStates[g[0].uid]?.following);
    const discoverySeen = others.filter((g) => bundleFullySeen(g) && !followStates[g[0].uid]?.following);
    const ordered = unseen.concat(seenFollow, discoveryUnseen, discoverySeen);

    const selfHas = own.length > 0;
    const selfName = tt('duniya_your_story', 'Your story');
    const me = typeof userProfile !== 'undefined' ? userProfile : {};
    const myAvatar = me.photoURL || currentUser.photoURL || '';
    const first = (me.name || 'You').split(' ')[0];

    const selfHtml = `
      <div class="duniya-story-item ${selfHas ? 'is-own' : 'is-empty'}" data-self="1">
        <div class="duniya-story-ring">
          <div class="duniya-story-avatar" style="${selfHas ? '' : 'border:2px dashed var(--muted);'}">
            ${
              selfHas && (own[0].thumb || own[0].media)
                ? `<img src="${esc(own[0].thumb || own[0].media)}" alt="">`
                : typeof renderUserAvatarHtml==='function'
                  ? renderUserAvatarHtml(typeof ownProfileForAvatar==='function'?ownProfileForAvatar(me,typeof digitalProfile!=='undefined'?digitalProfile:{}):{...me,uid:currentUser.uid,photoURL:myAvatar},{decorative:true})
                  : myAvatar
                    ? `<img src="${esc(myAvatar)}" alt="">`
                    : `<span style="font-size:24px;color:var(--muted);">＋</span>`
            }
          </div>
        </div>
        ${selfHas ? `<button type="button" class="duniya-story-add-badge" data-add aria-label="${esc(tt('duniya_add_story', 'Add story'))}">＋</button>` : ''}
        <div class="duniya-story-name">${esc(selfHas ? first : selfName)}</div>
      </div>`;

    const otherHtml = ordered
      .map((group, i) => {
        const u = group[0];
        const seen = bundleFullySeen(group);
        const av = typeof renderUserAvatarHtml==='function'&&u.uid&&String(u.uid).length>12
          ? renderUserAvatarHtml(u,{decorative:true})
          :(u.avatar && /^https:/.test(u.avatar) ? `<img src="${esc(u.avatar)}" alt="">` : `<span>${esc(u.avatar || '👤')}</span>`);
        return `
        <div class="duniya-story-item${seen ? ' is-seen' : ''}" data-bundle="${i}">
          <div class="duniya-story-ring">
            <div class="duniya-story-avatar">${av}</div>
          </div>
          <div class="duniya-story-name">${esc((u.name || '').split(' ')[0] || 'Story')}</div>
        </div>`;
      })
      .join('');

    row.innerHTML = selfHtml + otherHtml;
    NS._tray = [own].concat(ordered).filter((g) => g.length);

    const selfEl = row.querySelector('[data-self]');
    if (selfEl) {
      if (typeof onLongPress === 'function') {
        onLongPress(selfEl.querySelector('.duniya-story-avatar') || selfEl, () => {
          selfEl.dataset.suppressClick = '1';
          if (typeof openDuniyaPostSheet === 'function') openDuniyaPostSheet('text');
        });
      }
      selfEl.querySelector('[data-add]')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startCreate();
      });
      selfEl.addEventListener('click', () => {
        if (selfEl.dataset.suppressClick === '1') {
          selfEl.dataset.suppressClick = '0';
          return;
        }
        if (own.length) openViewer(own[firstUnwatchedIndex(own)], own, { tray: NS._tray });
        else startCreate();
      });
    }
    row.querySelectorAll('[data-bundle]').forEach((item) => {
      const group = ordered[Number(item.dataset.bundle)];
      if (!group?.[0]) return;
      if (typeof bindProfileLongPress === 'function') {
        bindProfileLongPress(item.querySelector('.duniya-story-avatar'), {
          uid: group[0].uid,
          name: group[0].name,
          avatar: group[0].avatar,
          photoURL: /^https:/.test(group[0].avatar || '') ? group[0].avatar : '',
        });
      }
      item.addEventListener('click', () => {
        if (item.dataset.suppressClick === '1') {
          item.dataset.suppressClick = '0';
          return;
        }
        openViewer(group[firstUnwatchedIndex(group)], group, { tray: NS._tray });
      });
    });
  }

  function startCreate(seed) {
    if (typeof currentUser === 'undefined' || !currentUser) {
      if (typeof showAuth === 'function') showAuth();
      return;
    }
    if (seed?.file && typeof NS.openEditor === 'function') {
      NS.openEditor({ files: [seed.file], parentStory: seed.parentStory, restoryOf: seed.restoryOf });
      return;
    }
    pickGallery({
      onFile: (file) => {
        if (typeof NS.openEditor === 'function') NS.openEditor({ files: [file], parentStory: seed?.parentStory });
      },
    });
  }

  function openViewer(story, list, opts) {
    if (typeof NS.openViewerImpl === 'function') return NS.openViewerImpl(story, list, opts);
    if (typeof openBaithakStoryViewer === 'function') return openBaithakStoryViewer(story, list);
  }

  async function openById(storyId) {
    try {
      const story = typeof getPlatformStory === 'function' ? await getPlatformStory(storyId, 'duniya') : null;
      if (!story) {
        if (typeof showToast === 'function') showToast(tt('story_unavailable', 'Story unavailable'));
        return;
      }
      document.querySelector('.tab-btn[data-tab="duniya"]')?.click();
      const feed = typeof loadStoryFeed === 'function' ? await loadStoryFeed('duniya') : [story];
      openViewer(story, bundleTray(feed).find((g) => g[0]?.uid === story.uid) || [story], { tray: bundleTray(feed) });
    } catch (e) {
      report('duniya_story_open', e);
      if (typeof showToast === 'function') showToast(tt('story_unavailable', 'Story unavailable'));
    }
  }

  function wrapOpenStoryViewer() {
    const previous =
      typeof openBaithakStoryViewer === 'function'
        ? openBaithakStoryViewer
        : typeof openStoryViewer === 'function'
          ? openStoryViewer
          : null;
    if (previous && !window.openBaithakStoryViewer) window.openBaithakStoryViewer = previous;
    window.openStoryViewer = function openStoryViewer(story, allStories, tray) {
      if (story?.destination === 'duniya' || tray?.tray || tray?.destination === 'duniya') {
        return openViewer(story, allStories, tray || { tray: bundleTray(allStories) });
      }
      if (typeof window.openBaithakStoryViewer === 'function') {
        return window.openBaithakStoryViewer(story, allStories);
      }
      return openViewer(story, allStories, tray);
    };
  }

  wrapOpenStoryViewer();

  NS.tt = tt;
  NS.esc = esc;
  NS.report = report;
  NS.reducedMotion = reducedMotion;
  NS.isTeen = isTeen;
  NS.markStorySeen = markStorySeen;
  NS.isStorySeen = isStorySeen;
  NS.firstUnwatchedIndex = firstUnwatchedIndex;
  NS.muteAuthor = muteAuthor;
  NS.filterClass = filterClass;
  NS.renderOverlaysInto = renderOverlaysInto;
  NS.bundleTray = bundleTray;
  NS.pickGallery = pickGallery;
  NS.renderStrip = renderStrip;
  NS.startCreate = startCreate;
  NS.openViewer = openViewer;
  NS.openById = openById;
  NS.overlayStyle = overlayStyle;

  window.renderDuniyaStories = renderStrip;
  window.openDuniyaStoryAddSheet = startCreate;
})();
