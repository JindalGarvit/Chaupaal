/**
 * Swipeable section modes:
 * Peepal — Khoj ← Vriksha → Mashhoor
 * Akhbaar — Surkhiya ← All → Saathi (+ category chips)
 * Room-kit headers for visual distinctiveness without labels.
 */
(function () {
  'use strict';

  let peepalMode = 'vriksha';
  let akhbaarMode = 'all';
  let akhbaarPager = null;

  function tt(key, fallback, vars) {
    try {
      if (typeof t === 'function') {
        const v = t(key, vars);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function applyRoomKit(el, kits) {
    if (!el) return;
    [...el.classList].filter((c) => c.startsWith('room-kit')).forEach((c) => el.classList.remove(c));
    el.classList.add('room-kit', ...(kits || []));
  }

  function ensureRoomHeader(host, title, sub) {
    if (!host) return;
    let hdr = host.querySelector(':scope > .room-kit-header');
    if (!hdr) {
      hdr = document.createElement('div');
      hdr.className = 'room-kit-header';
      host.insertBefore(hdr, host.firstChild);
    }
    hdr.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
  }

  // ─── Peepal ────────────────────────────────────────────────────────────────
  function setPeepalMode(mode) {
    peepalMode = ['vriksha', 'khoj', 'mashhoor'].includes(mode) ? mode : 'vriksha';
    const feed = document.getElementById('peepalFeed');
    const panel = document.getElementById('panel-peepal');
    const screen = document.getElementById('peepalScreen');
    if (panel) panel.dataset.peepalMode = peepalMode;
    applyRoomKit(screen || panel, ['room-kit--earth', `room-kit--${peepalMode}`]);

    if (peepalMode === 'khoj') {
      ensureRoomHeader(
        screen || feed,
        tt('peepal_khoj_title', 'Khoj'),
        tt('peepal_khoj_sub', 'Find people and discussions')
      );
      document.getElementById('peepalInlineSearch')?.focus();
      document.getElementById('peepalSearchBtn')?.click();
      return;
    }

    if (peepalMode === 'mashhoor') {
      renderMashhoorGrid();
      return;
    }

    // vriksha — default tree/feed
    feed?.querySelector('[data-peepal-mode-banner]')?.remove();
    document.getElementById('peepalMashhoorGrid')?.classList.add('hidden');
    if (feed) feed.classList.remove('hidden');
    ensureRoomHeader(
      screen || feed,
      tt('peepal_vriksha_title', 'Vriksha'),
      tt('peepal_vriksha_sub', 'Your Peepal tree')
    );
    if (typeof renderPeepalFeed === 'function') {
      try {
        renderPeepalFeed();
      } catch (e) {}
    }
  }

  function mediaAspectClass(w, h) {
    const r = w && h ? w / h : 1;
    if (r >= 1.35) return 'span-wide';
    if (r <= 0.75) return 'span-tall';
    if (r >= 0.95 && r <= 1.05) return 'span-square';
    return 'span-std';
  }

  function renderMashhoorGrid() {
    const feed = document.getElementById('peepalFeed');
    const screen = document.getElementById('peepalScreen');
    if (!feed && !screen) return;
    let host = document.getElementById('peepalMashhoorGrid');
    if (!host) {
      host = document.createElement('div');
      host.id = 'peepalMashhoorGrid';
      host.className = 'mashhoor-grid';
      (screen || feed.parentNode)?.insertBefore(host, feed);
    }
    host.classList.remove('hidden');
    if (feed) feed.classList.add('hidden');
    ensureRoomHeader(
      host,
      tt('peepal_mashhoor_title', 'Mashhoor'),
      tt('peepal_mashhoor_sub', 'Trending discussions this week')
    );

    const posts =
      typeof peepalPosts !== 'undefined' && Array.isArray(peepalPosts)
        ? peepalPosts
        : [...(feed?.querySelectorAll('.peepal-card') || [])].map((card) => ({
            id: card.dataset.id || card.dataset.postId,
            el: card,
            totalResponses: Number(card.querySelector('.peepal-footer-stat')?.textContent?.replace(/\D/g, '') || 0),
          }));

    const ranked =
      typeof rankByVelocity === 'function'
        ? rankByVelocity(posts, {
            friendUids: typeof followingSet !== 'undefined' ? [...followingSet] : [],
          })
        : posts.slice().sort((a, b) => (b.totalResponses || 0) - (a.totalResponses || 0));

    const grid = document.createElement('div');
    grid.className = 'mashhoor-masonry';
    ranked.slice(0, 36).forEach((p, i) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      const w = p.mediaWidth || p.width || (i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 4);
      const h = p.mediaHeight || p.height || (i % 4 === 0 ? 5 : 4);
      tile.className = `mashhoor-tile ${mediaAspectClass(w, h)}`;
      const title = p.question || p.title || p.text || p.el?.querySelector('.peepal-q, .peepal-text')?.textContent || 'Discussion';
      const count = p.totalResponses || p.responses || p.commentCount || 0;
      tile.innerHTML = `<span class="mashhoor-tile-title">${escapeLite(String(title).slice(0, 120))}</span>
        <span class="mashhoor-tile-meta">${count} ${tt('peepal_replies', 'replies')}</span>`;
      tile.addEventListener('click', () => {
        if (p.id && typeof openPeepalPost === 'function') openPeepalPost(p.id);
        else if (p.el) p.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      grid.appendChild(tile);
    });

    host.querySelector('.mashhoor-masonry')?.remove();
    if (!ranked.length) {
      if (typeof renderEmptyState === 'function') {
        renderEmptyState(host, {
          icon: '🌿',
          title: tt('mashhoor_empty_title', 'Mashhoor is quiet'),
          message: tt('mashhoor_empty_msg', 'Trending Peepal discussions will gather here.'),
          actionLabel: tt('peepal_discuss', 'Discuss'),
          onAction: () => {
            if (typeof openPeepalAskSheet === 'function') openPeepalAskSheet();
          },
        });
      }
    } else {
      host.appendChild(grid);
    }
  }

  function escapeLite(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Akhbaar ───────────────────────────────────────────────────────────────
  function buildSurkhiyaHtml() {
    const headlines = collectSurkhiyaHeadlines();
    const chips = headlines
      .slice(0, 8)
      .map(
        (h, i) =>
          `<button type="button" class="surkhiya-chip" data-surkhiya-i="${i}">
            <span class="surkhiya-chip-kicker">${escapeLite(h.cat || 'News')}</span>
            <span class="surkhiya-chip-title">${escapeLite(h.title)}</span>
          </button>`
      )
      .join('');
    return `
      <div class="akhbaar-surkhiya room-kit room-kit--air room-kit--surkhiya">
        <div class="room-kit-header">${tt('akhbaar_surkhiya', 'Surkhiya')}
          <small>${tt('akhbaar_surkhiya_sub', 'Morning paper — today’s short digest')}</small>
        </div>
        <div class="surkhiya-digest">
          ${
            chips ||
            `<div class="cp-empty surkhiya-empty">${tt('surkhiya_empty', 'Digest warming up — open All to start today’s quiz.')}</div>`
          }
        </div>
        <div class="akhbaar-surkhiya-chips">
          <button type="button" class="btn" data-surkhiya-jump="all">${tt('akhbaar_all_headlines', 'All headlines')}</button>
          <button type="button" class="btn btn--primary" data-surkhiya-jump="quiz">${tt('shortcut_akhbaar_quiz', "Today's quiz")}</button>
        </div>
      </div>`;
  }

  function collectSurkhiyaHeadlines() {
    const out = [];
    try {
      const qs =
        typeof QUESTIONS !== 'undefined' && QUESTIONS?.length
          ? QUESTIONS
          : typeof AKHBAAR_BANK !== 'undefined'
            ? AKHBAAR_BANK
            : typeof SAMPLE_QUESTIONS !== 'undefined'
              ? SAMPLE_QUESTIONS
              : [];
      qs.slice(0, 12).forEach((q) => {
        out.push({
          title: q.headline || q.news || q.q || 'Headline',
          cat: q.category || q.tag || 'News',
          q,
        });
      });
    } catch (e) {}
    return out;
  }

  function buildSaathiHtml() {
    return `
      <div class="akhbaar-saathi room-kit room-kit--air room-kit--saathi" id="akhbaarSaathi">
        <div class="room-kit-header">${tt('akhbaar_saathi', 'Saathi')}
          <small>${tt('akhbaar_saathi_sub', 'Quizzes & updates from your circle')}</small>
        </div>
        <div class="saathi-feed" data-saathi-feed></div>
      </div>`;
  }

  function renderSaathiFeed(host) {
    const feed = host?.querySelector('[data-saathi-feed]') || host;
    if (!feed) return;
    const friendQs = collectFriendAkhbaarItems();
    if (!friendQs.length) {
      if (typeof renderEmptyState === 'function') {
        renderEmptyState(feed, {
          icon: '🤝',
          title: tt('saathi_empty_title', 'No Saathi updates yet'),
          message: tt(
            'saathi_empty_msg',
            'Friend-sourced quizzes and short updates land here. Find friends to fill this room.'
          ),
          actionLabel: tt('saathi_find_friends', 'Find friends'),
          onAction: () => {
            if (typeof openPeopleSearchWithContacts === 'function') {
              openPeopleSearchWithContacts({ surface: 'akhbaar' });
            } else if (typeof showNewDmSearchSheet === 'function') {
              showNewDmSearchSheet();
            }
          },
        });
      } else {
        feed.innerHTML = `<div class="cp-empty">${tt('saathi_empty_title', 'No Saathi updates yet')}</div>`;
      }
      return;
    }
    feed.innerHTML = friendQs
      .slice(0, 20)
      .map(
        (it) =>
          `<button type="button" class="saathi-card" data-saathi-id="${escapeLite(it.id || '')}">
            <div class="saathi-card-who">${escapeLite(it.who || 'Friend')}</div>
            <div class="saathi-card-q">${escapeLite(it.title)}</div>
            <div class="saathi-card-meta">${escapeLite(it.meta || '')}</div>
          </button>`
      )
      .join('');
  }

  function collectFriendAkhbaarItems() {
    const out = [];
    try {
      const friendSet =
        typeof followingSet !== 'undefined'
          ? followingSet
          : typeof friendUids !== 'undefined'
            ? new Set(friendUids)
            : new Set();
      const qs = typeof QUESTIONS !== 'undefined' ? QUESTIONS : [];
      qs.forEach((q, i) => {
        const uid = q.uid || q.authorUid || q.fromUid;
        const personal = q.personal === true || q.visibility === 'friends' || q.source === 'friend';
        if (personal || (uid && friendSet.has?.(uid))) {
          out.push({
            id: q.id || `fq-${i}`,
            title: q.q || q.headline || 'Quiz',
            who: q.authorName || q.user?.name || tt('akhbaar_saathi', 'Saathi'),
            meta: q.category || 'MCQ',
            q,
          });
        }
      });
    } catch (e) {}
    return out;
  }

  function wireSurkhiya(host) {
    host.querySelector('[data-surkhiya-jump="all"]')?.addEventListener('click', () => setAkhbaarMode('all'));
    host.querySelector('[data-surkhiya-jump="quiz"]')?.addEventListener('click', () => {
      setAkhbaarMode('all');
      if (typeof window.ensureAkhbaarBuilt === 'function') window.ensureAkhbaarBuilt();
    });
    host.querySelectorAll('[data-surkhiya-i]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setAkhbaarMode('all');
        const stage = document.getElementById('reelStage');
        const cards = stage?.querySelectorAll('.reel-card');
        const i = Number(btn.dataset.surkhiyaI) || 0;
        cards?.[i]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }

  /** Ensure Surkhiya + Saathi hosts exist (real surfaces — not toast stubs). */
  function ensureAkhbaarSurfaces() {
    const panel = document.getElementById('panel-akhbaar');
    const stage = document.getElementById('reelStage');
    const catBar = document.getElementById('akhbaarCatBar');
    if (!panel || !stage) return;

    // Remove stubby pager if a prior pass left one
    const oldPager = document.getElementById('akhbaarPager');
    if (oldPager) {
      oldPager.remove();
      akhbaarPager = null;
    }

    let sur = document.getElementById('akhbaarSurkhiya');
    if (!sur) {
      sur = document.createElement('div');
      sur.id = 'akhbaarSurkhiya';
      sur.className = 'akhbaar-surkhiya-host';
      catBar?.parentNode?.insertBefore(sur, catBar.nextSibling) ||
        stage.parentNode?.insertBefore(sur, stage);
    }
    sur.innerHTML = buildSurkhiyaHtml();
    wireSurkhiya(sur);

    let saa = document.getElementById('akhbaarSaathiHost');
    if (!saa) {
      saa = document.createElement('div');
      saa.id = 'akhbaarSaathiHost';
      saa.className = 'akhbaar-saathi-host';
      stage.parentNode?.insertBefore(saa, stage);
    }
    saa.innerHTML = buildSaathiHtml();
    renderSaathiFeed(saa);

    // Mode hint under cat bar
    let hint = document.getElementById('akhbaarModeHint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'akhbaarModeHint';
      hint.className = 'akhbaar-mode-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.innerHTML =
        '<span data-hint="surkhiya">Surkhiya</span><span data-hint="all" class="is-center">All</span><span data-hint="saathi">Saathi</span>';
      catBar?.parentNode?.insertBefore(hint, catBar);
    }
  }

  function syncAkhbaarChrome(id) {
    ensureAkhbaarSurfaces();
    const stage = document.getElementById('reelStage');
    const catBar = document.getElementById('akhbaarCatBar');
    const sur = document.getElementById('akhbaarSurkhiya');
    const saa = document.getElementById('akhbaarSaathiHost');
    const hint = document.getElementById('akhbaarModeHint');
    const panel = document.getElementById('panel-akhbaar');

    const mode = id === 'gk' ? 'all' : id;
    sur?.classList.toggle('hidden', mode !== 'surkhiya');
    saa?.classList.toggle('hidden', mode !== 'saathi');
    stage?.classList.toggle('hidden', mode !== 'all');

    if (mode === 'surkhiya') {
      catBar?.classList.add('hidden');
      // Refresh digest content
      if (sur) {
        sur.innerHTML = buildSurkhiyaHtml();
        wireSurkhiya(sur);
      }
    } else if (mode === 'saathi') {
      catBar?.classList.remove('hidden');
      document.querySelectorAll('.akhbaar-cat-chip').forEach((c) => c.classList.remove('active'));
      document.querySelector('.akhbaar-cat-chip[data-cat="saathi"]')?.classList.add('active');
      if (saa) renderSaathiFeed(saa);
    } else {
      catBar?.classList.remove('hidden');
      document.querySelectorAll('.akhbaar-cat-chip').forEach((c) => c.classList.remove('active'));
      const chip = document.querySelector(`.akhbaar-cat-chip[data-cat="${akhbaarActiveCatSafe()}"]`);
      (chip || document.querySelector('.akhbaar-cat-chip[data-cat="all"]'))?.classList.add('active');
      if (typeof filterReelByCategory === 'function') {
        filterReelByCategory(typeof akhbaarActiveCat !== 'undefined' ? akhbaarActiveCat : 'all');
      }
      if (typeof window.ensureAkhbaarBuilt === 'function') window.ensureAkhbaarBuilt();
    }

    hint?.querySelectorAll('[data-hint]').forEach((el) => {
      el.classList.toggle('is-center', el.dataset.hint === mode);
    });
    if (panel) {
      [...panel.classList].filter((c) => c.startsWith('room-kit')).forEach((c) => panel.classList.remove(c));
      panel.classList.add('room-kit', 'room-kit--air', `room-kit--${mode === 'all' ? 'air' : mode}`);
      panel.dataset.akhbaarMode = mode;
    }
  }

  function akhbaarActiveCatSafe() {
    try {
      return typeof akhbaarActiveCat !== 'undefined' ? akhbaarActiveCat : 'all';
    } catch (e) {
      return 'all';
    }
  }

  function setAkhbaarMode(mode) {
    const next = ['all', 'surkhiya', 'saathi', 'gk'].includes(mode) ? mode : 'all';
    if (next === 'gk') {
      akhbaarMode = 'all';
      syncAkhbaarChrome('all');
      document.querySelector('.akhbaar-cat-chip[data-cat="GK"]')?.click();
      return;
    }
    akhbaarMode = next;
    syncAkhbaarChrome(akhbaarMode);
  }

  function goAkhbaarPage(id) {
    setAkhbaarMode(id);
  }

  function ensureAkhbaarPager() {
    // Compat alias — surfaces + swipe, no stubby All page
    ensureAkhbaarSurfaces();
    syncAkhbaarChrome(akhbaarMode || 'all');
    return { goTo: (i) => setAkhbaarMode(['surkhiya', 'all', 'saathi'][i] || 'all') };
  }

  // Edge: swipe past Saathi → add category; within-tab Surkhiya ← All → Saathi
  function wireAkhbaarSwipe() {
    const panel = document.getElementById('panel-akhbaar');
    if (!panel || panel.dataset.swipeWired) return;
    panel.dataset.swipeWired = '1';
    let sx = 0;
    let sy = 0;
    let locked = null;
    panel.addEventListener(
      'touchstart',
      (e) => {
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        locked = null;
      },
      { passive: true }
    );
    panel.addEventListener(
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
    panel.addEventListener(
      'touchend',
      (e) => {
        if (locked !== 'h') return;
        const dx = (e.changedTouches[0]?.clientX || 0) - sx;
        if (Math.abs(dx) < 56) return;
        const order = ['surkhiya', 'all', 'saathi'];
        const cur = order.indexOf(akhbaarMode);
        if (dx < 0 && akhbaarMode === 'saathi') {
          // Past rightmost → add category sheet
          if (typeof openAkhbaarCatAdd === 'function') openAkhbaarCatAdd();
          return;
        }
        const next = order[Math.max(0, Math.min(2, cur + (dx < 0 ? 1 : -1)))];
        if (next && next !== akhbaarMode) setAkhbaarMode(next);
      },
      { passive: true }
    );
  }

  function wireAkhbaarEdgeAdd() {
    wireAkhbaarSwipe();
  }

  // Peepal swipe: Khoj ← Vriksha → Mashhoor
  function wirePeepalSwipe() {
    const screen = document.getElementById('peepalScreen') || document.getElementById('panel-peepal');
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
        const order = ['khoj', 'vriksha', 'mashhoor'];
        const cur = order.indexOf(peepalMode);
        const next = order[Math.max(0, Math.min(2, cur + (dx < 0 ? 1 : -1)))];
        setPeepalMode(next);
      },
      { passive: true }
    );
  }

  // Baithak swipe: Sambhavanayein ← Sabha → Mitra
  function wireBaithakSwipe() {
    const panel = document.getElementById('panel-baithak');
    if (!panel || panel.dataset.swipeWired) return;
    panel.dataset.swipeWired = '1';
    let sx = 0;
    let sy = 0;
    let locked = null;
    let section = 'sabha';
    panel.addEventListener(
      'touchstart',
      (e) => {
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        locked = null;
      },
      { passive: true }
    );
    panel.addEventListener(
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
    panel.addEventListener(
      'touchend',
      (e) => {
        if (locked !== 'h') return;
        const dx = (e.changedTouches[0]?.clientX || 0) - sx;
        if (Math.abs(dx) < 56) return;
        if (typeof baithakSection === 'function') section = baithakSection() || 'sabha';
        const order = ['sambhavanayein', 'sabha', 'mitra'];
        const cur = order.indexOf(section);
        const next = order[Math.max(0, Math.min(2, cur + (dx < 0 ? 1 : -1)))];
        if (typeof setBaithakSection === 'function') {
          setBaithakSection(next);
          applyRoomKit(panel, ['room-kit--sky', `room-kit--${next}`]);
          ensureRoomHeader(
            panel.querySelector('.baithak-search-row') || panel,
            next === 'sabha' ? 'Sabha' : next === 'mitra' ? 'Mitra' : 'Sambhavanayein',
            next === 'mitra'
              ? tt('baithak_mitra_sub', 'Friend chats')
              : next === 'sambhavanayein'
                ? tt('baithak_sambhav_sub', 'New possibilities')
                : tt('baithak_sabha_sub', 'Your gatherings')
          );
        }
      },
      { passive: true }
    );
  }

  function boot() {
    wirePeepalSwipe();
    wireBaithakSwipe();
    wireAkhbaarSwipe();
    try {
      ensureAkhbaarSurfaces();
      syncAkhbaarChrome('all');
    } catch (e) {}
    // Soft-init room kit on peepal
    applyRoomKit(document.getElementById('peepalScreen') || document.getElementById('panel-peepal'), [
      'room-kit--earth',
      'room-kit--vriksha',
    ]);
  }

  window.setPeepalMode = setPeepalMode;
  window.setAkhbaarMode = setAkhbaarMode;
  window.goAkhbaarPage = goAkhbaarPage;
  window.renderMashhoorGrid = renderMashhoorGrid;
  window.peepalMode = () => peepalMode;
  window.akhbaarMode = () => akhbaarMode;
  window.ensureAkhbaarPager = ensureAkhbaarPager;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
