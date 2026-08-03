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

  /** Mode-name hint strips removed — navigation is swipe + morph only. No-op kept for callers. */
  function ensureRoomHeader(host) {
    if (!host) return;
    host.querySelectorAll(':scope > .room-kit-header').forEach((h) => h.remove());
  }

  function sharesPersonalEvents() {
    try {
      const share = JSON.parse(localStorage.getItem('chaupaal_share_toggles') || 'null');
      if (share && typeof share.personalEvents === 'boolean') return share.personalEvents;
      if (share) return share.birthday !== false || share.trip !== false || share.anniversary !== false;
    } catch (e) {}
    return true;
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
      ensureRoomHeader(screen || feed);
      document.getElementById('peepalIntentCard')?.classList.add('hidden');
      document.getElementById('peepalDiscovery')?.classList.add('hidden');
      document.getElementById('peepalMashhoorGrid')?.classList.add('hidden');
      if (typeof renderKhojSurface === 'function') {
        try {
          renderKhojSurface(screen || feed);
        } catch (e) {}
      }
      return;
    }

    if (peepalMode === 'mashhoor') {
      document.getElementById('peepalIntentCard')?.classList.add('hidden');
      document.getElementById('peepalDiscovery')?.classList.add('hidden');
      document.getElementById('peepalKhojSurface')?.classList.add('hidden');
      renderMashhoorGrid();
      return;
    }

    // vriksha — default tree/feed + pinned intent card
    feed?.querySelector('[data-peepal-mode-banner]')?.remove();
    document.getElementById('peepalMashhoorGrid')?.classList.add('hidden');
    document.getElementById('peepalKhojSurface')?.classList.add('hidden');
    document.getElementById('peepalIntentCard')?.classList.remove('hidden');
    document.getElementById('peepalDiscovery')?.classList.remove('hidden');
    if (feed) feed.classList.remove('hidden');
    ensureRoomHeader(screen || feed);
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
    ensureRoomHeader(host);

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
    const personal = collectSurkhiyaPersonalEvents();
    const personalHtml = personal.length
      ? `<div class="surkhiya-personal">
          ${personal
            .map(
              (p) =>
                `<button type="button" class="surkhiya-event" data-surkhiya-event="${escapeLite(p.action || 'baithak')}">
                  <span class="surkhiya-event-icon">${p.icon || '🎉'}</span>
                  <span class="surkhiya-event-copy">
                    <strong>${escapeLite(p.title)}</strong>
                    <small>${escapeLite(p.sub || '')}</small>
                  </span>
                </button>`
            )
            .join('')}
        </div>`
      : '';
    const chips = headlines
      .slice(0, 10)
      .map(
        (h, i) =>
          `<button type="button" class="surkhiya-chip" data-surkhiya-i="${i}" aria-expanded="false">
            <span class="surkhiya-chip-kicker">${escapeLite(h.cat || 'News')}</span>
            <span class="surkhiya-chip-title">${escapeLite(h.title)}</span>
            <span class="surkhiya-chip-brief hidden" data-surkhiya-brief>${escapeLite(h.brief || '')}</span>
          </button>`
      )
      .join('');
    return `
      <div class="akhbaar-surkhiya room-kit room-kit--air room-kit--surkhiya">
        ${personalHtml}
        <div class="surkhiya-digest">
          ${
            chips ||
            `<div class="cp-empty surkhiya-empty">${tt('surkhiya_empty', 'Digest warming up — open All to start today’s quiz.')}</div>`
          }
        </div>
        <div class="akhbaar-surkhiya-chips">
          <button type="button" class="btn" data-surkhiya-jump="all">${tt('akhbaar_all_headlines', 'All headlines')}</button>
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
        const title = q.headline || q.news || q.q || 'Headline';
        const brief = String(q.news || q.explain || q.proof || q.q || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 220);
        out.push({
          title,
          brief: brief || String(title).slice(0, 160),
          cat: q.category || q.tag || 'News',
          q,
        });
      });
    } catch (e) {}
    return out;
  }

  function collectSurkhiyaPersonalEvents() {
    if (!sharesPersonalEvents()) return [];
    const out = [];
    const today = new Date();
    const md = `${today.getMonth() + 1}-${today.getDate()}`;
    const pools = [];
    try {
      if (typeof friends !== 'undefined' && Array.isArray(friends)) pools.push(...friends);
    } catch (e) {}
    try {
      if (typeof SAMPLE_DISCOVERY_POOL !== 'undefined') pools.push(...SAMPLE_DISCOVERY_POOL);
    } catch (e) {}
    const seen = new Set();
    pools.forEach((p) => {
      const dob = p.dateOfBirth || p.dob || '';
      if (!dob) return;
      const d = new Date(dob);
      if (Number.isNaN(d.getTime())) return;
      const key = p.uid || p.username || p.name;
      if (seen.has(key)) return;
      if (`${d.getMonth() + 1}-${d.getDate()}` === md) {
        seen.add(key);
        out.push({
          icon: '🎂',
          title: tt('relevant_birthday', "{{name}}'s birthday").replace(
            '{{name}}',
            p.name || p.username || 'Friend'
          ),
          sub: tt('relevant_birthday_sub', 'Wish them on Baithak'),
          action: 'baithak',
        });
      }
      const ann = p.anniversary || p.workAnniversary || p.anniversaryDate;
      if (ann) {
        const a = new Date(ann);
        if (!Number.isNaN(a.getTime()) && `${a.getMonth() + 1}-${a.getDate()}` === md && !seen.has(`ann-${key}`)) {
          seen.add(`ann-${key}`);
          out.push({
            icon: '💍',
            title: tt('relevant_anniversary', "{{name}}'s anniversary").replace(
              '{{name}}',
              p.name || p.username || 'Friend'
            ),
            sub: tt('relevant_anniversary_sub', 'Send a note on Baithak'),
            action: 'baithak',
          });
        }
      }
    });
    return out.slice(0, 6);
  }

  function buildSaathiHtml() {
    return `
      <div class="akhbaar-saathi room-kit room-kit--air room-kit--saathi" id="akhbaarSaathi">
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
    host.querySelectorAll('[data-surkhiya-event]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.surkhiyaEvent;
        if (a === 'baithak') {
          document.querySelector('.bottom-tabs .tab-btn[data-tab="baithak"]')?.click();
        }
      });
    });
    host.querySelectorAll('[data-surkhiya-i]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const brief = btn.querySelector('[data-surkhiya-brief]');
        const open = btn.getAttribute('aria-expanded') === 'true';
        host.querySelectorAll('[data-surkhiya-i]').forEach((other) => {
          other.setAttribute('aria-expanded', 'false');
          other.classList.remove('is-expanded');
          other.querySelector('[data-surkhiya-brief]')?.classList.add('hidden');
        });
        if (!open && brief) {
          btn.setAttribute('aria-expanded', 'true');
          btn.classList.add('is-expanded');
          brief.classList.remove('hidden');
        }
        // Expand brief only — never jump to today's quiz
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

    // Mode-name hint rows removed (swipe + morph only)
    document.getElementById('akhbaarModeHint')?.remove();
  }

  function syncAkhbaarChrome(id) {
    ensureAkhbaarSurfaces();
    const stage = document.getElementById('reelStage');
    const catBar = document.getElementById('akhbaarCatBar');
    const sur = document.getElementById('akhbaarSurkhiya');
    const saa = document.getElementById('akhbaarSaathiHost');
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

  function akhbaarCategoryOrder() {
    const bar = document.getElementById('akhbaarCatBar');
    if (!bar) return ['all', 'saathi'];
    return [...bar.querySelectorAll('.akhbaar-cat-chip')]
      .map((c) => c.dataset.cat)
      .filter((c) => c && c !== 'add');
  }

  function selectAkhbaarCategory(cat) {
    if (!cat) return;
    if (cat === 'saathi') {
      setAkhbaarMode('saathi');
      return;
    }
    if (akhbaarMode !== 'all') setAkhbaarMode('all');
    try {
      akhbaarActiveCat = cat;
    } catch (e) {}
    const bar = document.getElementById('akhbaarCatBar');
    bar?.querySelectorAll('.akhbaar-cat-chip').forEach((c) => c.classList.remove('active'));
    bar?.querySelector(`.akhbaar-cat-chip[data-cat="${cat}"]`)?.classList.add('active');
    if (typeof filterReelByCategory === 'function') filterReelByCategory(cat);
  }

  /**
   * Category swipe: walks All → Saathi → …customs.
   * After last category: rubber-band → Add Category half-sheet (not a virtual end page).
   * Direct Add control still opens the sheet anytime.
   */
  function swipeTargetIgnored(target) {
    try {
      return !!(target && target.closest && target.closest('[data-nav-ignore="1"], #cpMiniPlayer'));
    } catch (e) {
      return false;
    }
  }

  function wireAkhbaarSwipe() {
    const panel = document.getElementById('panel-akhbaar');
    if (!panel || panel.dataset.swipeWired) return;
    panel.dataset.swipeWired = '1';
    let sx = 0;
    let sy = 0;
    let locked = null;
    let ignored = false;
    panel.addEventListener(
      'touchstart',
      (e) => {
        ignored = swipeTargetIgnored(e.target);
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        locked = null;
      },
      { passive: true }
    );
    panel.addEventListener(
      'touchmove',
      (e) => {
        if (ignored) return;
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
        if (ignored || locked !== 'h') return;
        const dx = (e.changedTouches[0]?.clientX || 0) - sx;
        if (Math.abs(dx) < 56) return;
        // Surkhiya mode: swipe left → All
        if (akhbaarMode === 'surkhiya') {
          if (dx < 0) setAkhbaarMode('all');
          return;
        }
        const cats = akhbaarCategoryOrder();
        const curCat =
          akhbaarMode === 'saathi'
            ? 'saathi'
            : typeof akhbaarActiveCat !== 'undefined'
              ? akhbaarActiveCat
              : 'all';
        let idx = cats.indexOf(curCat);
        if (idx < 0) idx = 0;
        if (dx < 0) {
          // next category; past last → rubber-band add sheet
          if (idx >= cats.length - 1) {
            if (typeof openAkhbaarCatAdd === 'function') openAkhbaarCatAdd();
            return;
          }
          selectAkhbaarCategory(cats[idx + 1]);
        } else {
          // previous; from first → Surkhiya
          if (idx <= 0) {
            setAkhbaarMode('surkhiya');
            return;
          }
          selectAkhbaarCategory(cats[idx - 1]);
        }
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
    let ignored = false;
    screen.addEventListener(
      'touchstart',
      (e) => {
        ignored = swipeTargetIgnored(e.target);
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        locked = null;
      },
      { passive: true }
    );
    screen.addEventListener(
      'touchmove',
      (e) => {
        if (ignored) return;
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
        if (ignored || locked !== 'h') return;
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
    let ignored = false;
    let section = 'sabha';
    panel.addEventListener(
      'touchstart',
      (e) => {
        ignored = swipeTargetIgnored(e.target);
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        locked = null;
      },
      { passive: true }
    );
    panel.addEventListener(
      'touchmove',
      (e) => {
        if (ignored) return;
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
        if (ignored || locked !== 'h') return;
        const dx = (e.changedTouches[0]?.clientX || 0) - sx;
        if (Math.abs(dx) < 56) return;
        // Prefer window getter — lexical baithakSection in baithak-data.js is a string and would shadow.
        try {
          if (typeof window.baithakSection === 'function') section = window.baithakSection() || 'sabha';
        } catch (err) {}
        const order = ['sambhavanayein', 'sabha', 'mitra'];
        let cur = order.indexOf(section);
        if (cur < 0) cur = 1; // sabha
        const next = order[Math.max(0, Math.min(2, cur + (dx < 0 ? 1 : -1)))];
        if (next === section) return;
        if (typeof setBaithakSection === 'function') {
          setBaithakSection(next);
          applyRoomKit(panel, ['room-kit--sky', `room-kit--${next}`]);
          ensureRoomHeader(panel);
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
