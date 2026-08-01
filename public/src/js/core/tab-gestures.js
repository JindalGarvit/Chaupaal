/**
 * Bottom-tab gestures: active-tab scroll-to-top / refresh, double-tap → tab
 * notifications, long-press → morph tab bar into contextual shortcuts.
 *
 * Active-tab single tap is deferred ~DOUBLE_MS so a fast second tap can open
 * notifications without also refreshing.
 */
(function () {
  'use strict';

  const DOUBLE_MS = 300;
  /** Hold to morph — short enough to feel responsive, long enough to avoid accidental morphs */
  const LONG_MS = 480;
  const LONG_MOVE_PX = 12;
  const AT_TOP_PX = 12;

  let lastTapTab = null;
  let lastTapAt = 0;
  let pendingSingle = null; // { tab, atTop, timer, gen }
  let pendingGen = 0;
  let suppressRefreshUntil = 0;
  let morphSourceTab = null;
  let morphSnapshot = null;
  let longTimer = null;
  let longMoved = false;
  let longStartX = 0;
  let longStartY = 0;
  let suppressNextClick = false;
  /** @type {Set<string>} */
  const refreshingTabs = new Set();

  function tt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function isGuest() {
    return typeof currentUser === 'undefined' || !currentUser;
  }

  function requireSignIn(msg) {
    if (typeof showToast === 'function') showToast(msg || tt('notif_sign_in', 'Sign in to see notifications'));
    if (typeof showAuth === 'function') showAuth();
  }

  function activeTab() {
    return document.querySelector('.bottom-tabs .tab-btn.active')?.dataset?.tab || '';
  }

  function reducedMotion() {
    try {
      if (typeof Micro !== 'undefined' && Micro.prefersReducedMotion) return !!Micro.prefersReducedMotion();
      return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch (e) {
      return false;
    }
  }

  function lightHaptic() {
    if (typeof Micro !== 'undefined' && Micro.haptic) Micro.haptic('light');
    else if (typeof haptic === 'function') haptic('light');
  }

  /** Resolve the real scroll root for a tab (not window). */
  function getTabScrollRoot(tab) {
    const candidates = {
      peepal: ['#panel-peepal .peepal-screen', '#peepalFeed', '#panel-peepal'],
      duniya: [
        '#panel-duniya .duniya-screen',
        '#leharFeed:not(.hidden)',
        '#duniyaFeed',
        '#panel-duniya',
      ],
      baithak: ['#chatList', '#baithakInbox', '#panel-baithak'],
      akhbaar: ['#reelStage', '#panel-akhbaar'],
      dangal: ['#dangalScreen', '#dangalGamesGrid', '#panel-dangal'],
    }[tab] || [`#panel-${tab}`];

    let fallback = null;
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (!el) continue;
      if (!fallback) fallback = el;
      let oy = '';
      try {
        oy = getComputedStyle(el).overflowY || '';
      } catch (e) {}
      const scrollable =
        /(auto|scroll)/.test(oy) || el.scrollHeight > el.clientHeight + AT_TOP_PX;
      if (scrollable) return el;
    }
    return fallback || document.getElementById('panel-' + tab);
  }

  function isTabAtTop(tab) {
    const el = getTabScrollRoot(tab);
    if (!el) return true;
    return (el.scrollTop || 0) <= AT_TOP_PX;
  }

  function scrollTabToTop(tab) {
    const el = getTabScrollRoot(tab);
    if (!el) return;
    const behavior = reducedMotion() ? 'auto' : 'smooth';
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: 0, behavior });
    else el.scrollTop = 0;
  }

  function cancelPendingSingle() {
    if (!pendingSingle) return;
    clearTimeout(pendingSingle.timer);
    pendingSingle = null;
    pendingGen += 1;
  }

  function scheduleActiveTabSingle(tab, atTop) {
    cancelPendingSingle();
    const gen = ++pendingGen;
    pendingSingle = {
      tab,
      atTop,
      gen,
      timer: setTimeout(() => {
        const job = pendingSingle;
        pendingSingle = null;
        // Second tap / notifs must cancel — never refresh after double-tap
        if (!job || job.gen !== gen || job.tab !== tab) return;
        if (Date.now() < suppressRefreshUntil) return;
        if (activeTab() !== tab) return;
        if (job.atTop) refreshTabContent(tab);
        else {
          scrollTabToTop(tab);
          lightHaptic();
          if (typeof Micro !== 'undefined' && Micro.tabFeedback) Micro.tabFeedback();
        }
      }, DOUBLE_MS),
    };
  }

  function isOffline() {
    try {
      return typeof navigator !== 'undefined' && navigator.onLine === false;
    } catch (e) {
      return false;
    }
  }

  function setTabBusy(tab, busy) {
    const btn = document.querySelector(`.bottom-tabs .tab-btn[data-tab="${tab}"]`);
    if (!btn) return;
    if (busy) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
  }

  async function refreshTabContent(tab) {
    if (refreshingTabs.has(tab)) return;
    if (isOffline()) {
      if (typeof showToast === 'function') {
        showToast(
          typeof friendlyError === 'function'
            ? friendlyError({ message: 'offline' })
            : tt('offline_banner', "You're offline — some actions may not work")
        );
      }
      return;
    }

    refreshingTabs.add(tab);
    setTabBusy(tab, true);
    lightHaptic();
    try {
      if (typeof TabElements !== 'undefined' && TabElements.playRitual) TabElements.playRitual(tab);
    } catch (e) {}

    try {
      if (tab === 'peepal') {
        const feed = document.getElementById('peepalFeed');
        if (typeof db !== 'undefined' && db && !isGuest() && typeof loadPeepalPage === 'function') {
          if (typeof renderSkeleton === 'function' && feed) renderSkeleton(feed, { variant: 'feed', count: 2 });
          await loadPeepalPage({ reset: true });
          if (typeof renderPeepalFeed === 'function') renderPeepalFeed();
        } else if (typeof initPeepal === 'function') {
          await initPeepal();
        } else if (typeof renderPeepalFeed === 'function') {
          renderPeepalFeed();
        }
      } else if (tab === 'duniya') {
        const feed = document.getElementById('duniyaFeed');
        if (typeof db !== 'undefined' && db && !isGuest() && typeof loadDuniyaPage === 'function') {
          if (typeof renderSkeleton === 'function' && feed) renderSkeleton(feed, { variant: 'feed', count: 2 });
          await loadDuniyaPage({ reset: true });
          if (typeof renderDuniyaFeed === 'function') renderDuniyaFeed();
        } else if (typeof initDuniya === 'function') {
          const screen = document.getElementById('duniyaScreen');
          if (screen) delete screen.dataset.loaded;
          initDuniya();
        } else if (typeof renderDuniyaFeed === 'function') {
          renderDuniyaFeed();
        }
      } else if (tab === 'baithak') {
        if (typeof db !== 'undefined' && db && !isGuest() && typeof loadBaithakChatsPage === 'function') {
          const list = document.getElementById('chatList');
          if (typeof renderSkeleton === 'function' && list) renderSkeleton(list, { variant: 'list', count: 4 });
          await loadBaithakChatsPage({ reset: true });
          if (typeof baithakChats !== 'undefined' && typeof pinSelfChat === 'function') {
            baithakChats = pinSelfChat(baithakChats);
          }
          if (typeof renderChatList === 'function') {
            renderChatList(
              typeof baithakChats !== 'undefined'
                ? baithakChats
                : typeof pinSelfChat === 'function'
                  ? pinSelfChat([])
                  : []
            );
          }
        } else if (typeof initBaithak === 'function') {
          initBaithak();
        } else if (typeof renderChatList === 'function') {
          renderChatList(
            typeof baithakChats !== 'undefined'
              ? typeof pinSelfChat === 'function'
                ? pinSelfChat(baithakChats)
                : baithakChats
              : typeof pinSelfChat === 'function'
                ? pinSelfChat([])
                : []
          );
        }
      } else if (tab === 'akhbaar') {
        const stage = document.getElementById('reelStage');
        if (stage && typeof renderSkeleton === 'function') {
          renderSkeleton(stage, { variant: 'feed', count: 1 });
        }
        if (typeof refreshAkhbaar === 'function') await refreshAkhbaar();
        else if (typeof window.ensureAkhbaarBuilt === 'function') await window.ensureAkhbaarBuilt();
      } else if (tab === 'dangal') {
        if (typeof initCategoryRatings === 'function') initCategoryRatings();
        else if (typeof renderDangalGamesGrid === 'function') renderDangalGamesGrid();
      }
    } catch (e) {
      console.warn('[tab-gestures] refresh', tab, e?.message || e);
      if (typeof showToast === 'function') {
        showToast(
          typeof friendlyError === 'function'
            ? friendlyError(e)
            : tt('generic_error', 'Something went wrong. Please try again.')
        );
      }
    } finally {
      refreshingTabs.delete(tab);
      setTabBusy(tab, false);
    }
  }

  function openTabNotifications(tab) {
    cancelPendingSingle();
    suppressRefreshUntil = Date.now() + DOUBLE_MS + 80;
    if (isGuest()) {
      requireSignIn(tt('notif_sign_in', 'Sign in to see notifications'));
      return;
    }
    if (typeof Micro !== 'undefined') {
      Micro.haptic('heavy');
    } else if (typeof haptic === 'function') haptic('heavy');
    if (typeof openNotificationPanel === 'function') {
      openNotificationPanel(tab || 'all');
    }
  }

  function ensureTabLights() {
    document.querySelectorAll('.bottom-tabs .tab-btn[data-tab]').forEach((btn) => {
      const tab = btn.dataset.tab;
      let light = btn.querySelector('.tab-notif-light');
      if (!light) {
        light = document.createElement('span');
        light.className = 'tab-notif-light hidden';
        light.setAttribute('data-tab-light', tab);
        light.setAttribute('aria-hidden', 'true');
        const icon = btn.querySelector('.tab-icon') || btn;
        icon.style.position = 'relative';
        icon.appendChild(light);
      }
    });
  }

  function updateTabLights() {
    ensureTabLights();
    if (isGuest()) {
      document.querySelectorAll('.tab-notif-light').forEach((el) => el.classList.add('hidden'));
      return;
    }
    const tabs = ['akhbaar', 'duniya', 'peepal', 'baithak', 'dangal'];
    tabs.forEach((tab) => {
      const count = typeof unreadNotifCount === 'function' ? unreadNotifCount(tab) : 0;
      document.querySelectorAll(`[data-tab-light="${tab}"]`).forEach((el) => {
        el.classList.toggle('hidden', !count);
      });
    });
  }

  /**
   * Morph shortcut slot map (5 slots):
   *   1 & 5 = corner actions · 2 = left swipe neighbor · 3 = tab home · 4 = right swipe neighbor
   * Peepal: discuss | Khoj | Vriksha | Mashhoor | Chaupaal search (global)
   * Akhbaar: Relevant today | Surkhiya | All | Saathi | Add category
   * Duniya: post | Lehar | Vishwa | Prasidha | story
   * Baithak: Instant | Sambhavanayein | Sabha | Mitra | find
   * Dangal: Performance | Khel(GOTD) | Manch(library) | Maidan(resume) | Challenge GOTD
   */
  function shortcutsFor(tab) {
    const sets = {
      peepal: [
        {
          id: 'discuss',
          label: tt('shortcut_peepal_ask', 'Discuss something'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            if (typeof openPeepalAskSheet === 'function') openPeepalAskSheet();
          },
        },
        {
          id: 'khoj',
          label: 'Khoj',
          run: () => {
            switchTo('peepal');
            if (typeof setPeepalMode === 'function') setPeepalMode('khoj');
            else {
              document.getElementById('peepalInlineSearch')?.focus();
              document.getElementById('peepalSearchBtn')?.click();
            }
          },
        },
        {
          id: 'vriksha',
          label: 'Vriksha',
          run: () => {
            switchTo('peepal');
            if (typeof setPeepalMode === 'function') setPeepalMode('vriksha');
          },
        },
        {
          id: 'mashhoor',
          label: 'Mashhoor',
          run: () => {
            switchTo('peepal');
            if (typeof setPeepalMode === 'function') setPeepalMode('mashhoor');
          },
        },
        {
          id: 'search',
          label: tt('shortcut_peepal_global_search', 'Search Chaupaal'),
          run: () => {
            if (typeof openUniversalSearch === 'function') {
              openUniversalSearch({ types: ['users', 'duniya', 'peepal', 'groups', 'games'] });
            } else if (typeof openPeopleSearchWithContacts === 'function') {
              openPeopleSearchWithContacts({ surface: 'peepal' });
            }
          },
        },
      ],
      akhbaar: [
        {
          id: 'today',
          label: tt('shortcut_akhbaar_today', 'Relevant today'),
          run: () => openRelevantTodaySheet(),
        },
        {
          id: 'surkhiya',
          label: tt('akhbaar_surkhiya', 'Surkhiya'),
          run: () => {
            switchTo('akhbaar');
            if (typeof setAkhbaarMode === 'function') setAkhbaarMode('surkhiya');
            else if (typeof goAkhbaarPage === 'function') goAkhbaarPage('surkhiya');
          },
        },
        {
          id: 'all',
          label: tt('akhbaar_all', 'All'),
          run: () => {
            switchTo('akhbaar');
            if (typeof setAkhbaarMode === 'function') setAkhbaarMode('all');
            else if (typeof goAkhbaarPage === 'function') goAkhbaarPage('all');
            else document.querySelector('.akhbaar-cat-chip[data-cat="all"]')?.click();
          },
        },
        {
          id: 'saathi',
          label: tt('akhbaar_saathi', 'Saathi'),
          run: () => {
            switchTo('akhbaar');
            if (typeof setAkhbaarMode === 'function') setAkhbaarMode('saathi');
            else if (typeof goAkhbaarPage === 'function') goAkhbaarPage('saathi');
            else document.querySelector('.akhbaar-cat-chip[data-cat="saathi"]')?.click();
          },
        },
        {
          id: 'addcat',
          label: tt('shortcut_akhbaar_add_cat', 'Add category'),
          run: () => {
            switchTo('akhbaar');
            if (typeof openAkhbaarCatAdd === 'function') openAkhbaarCatAdd();
            else document.getElementById('akhbaarAddCat')?.click();
          },
        },
      ],
      duniya: [
        {
          id: 'post',
          label: tt('shortcut_duniya_post', 'Create post'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            switchTo('duniya');
            if (typeof openDuniyaPostSheet === 'function') openDuniyaPostSheet('post');
          },
        },
        {
          id: 'lehar',
          label: 'Lehar',
          run: () => {
            switchTo('duniya');
            if (typeof setDuniyaMode === 'function') setDuniyaMode('lehar');
          },
        },
        {
          id: 'vishwa',
          label: 'Vishwa',
          run: () => {
            switchTo('duniya');
            if (typeof setDuniyaMode === 'function') setDuniyaMode('vishwa');
          },
        },
        {
          id: 'prasidha',
          label: 'Prasidha',
          run: () => {
            switchTo('duniya');
            if (typeof setDuniyaMode === 'function') setDuniyaMode('prasidha');
          },
        },
        {
          id: 'story',
          label: tt('shortcut_duniya_story', 'Create Story'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            switchTo('duniya');
            if (typeof openDuniyaPostSheet === 'function') openDuniyaPostSheet('story');
          },
        },
      ],
      baithak: [
        {
          id: 'instant',
          label: tt('shortcut_baithak_instant', 'New Instant'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            switchTo('baithak');
            if (typeof openBaithakInstantComposer === 'function') openBaithakInstantComposer();
            else if (typeof openBaithakStoryComposer === 'function') openBaithakStoryComposer('camera');
          },
        },
        {
          id: 'sambhavanayein',
          label: 'Sambhavanayein',
          run: () => {
            switchTo('baithak');
            if (typeof setBaithakSection === 'function') setBaithakSection('sambhavanayein');
          },
        },
        {
          id: 'sabha',
          label: 'Sabha',
          run: () => {
            switchTo('baithak');
            if (typeof setBaithakSection === 'function') setBaithakSection('sabha');
          },
        },
        {
          id: 'mitra',
          label: 'Mitra',
          run: () => {
            switchTo('baithak');
            if (typeof setBaithakSection === 'function') setBaithakSection('mitra');
          },
        },
        {
          id: 'find',
          label: tt('shortcut_baithak_search', 'Find people'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            if (typeof openPeopleSearchWithContacts === 'function') openPeopleSearchWithContacts({ surface: 'baithak' });
            else if (typeof showNewDmSearchSheet === 'function') showNewDmSearchSheet();
          },
        },
      ],
      dangal: [
        {
          id: 'pulse',
          label: tt('shortcut_dangal_pulse', 'Performance'),
          run: () => openDangalPulseSheet({ refresh: true }),
        },
        {
          id: 'khel',
          label: 'Khel',
          run: () => {
            switchTo('dangal');
            if (typeof setDangalSection === 'function') setDangalSection('khel');
          },
        },
        {
          id: 'manch',
          label: 'Manch',
          run: () => {
            switchTo('dangal');
            if (typeof setDangalSection === 'function') setDangalSection('manch');
          },
        },
        {
          id: 'maidan',
          label: 'Maidan',
          run: () => {
            switchTo('dangal');
            if (typeof setDangalSection === 'function') setDangalSection('maidan');
          },
        },
        {
          id: 'challenge',
          label: tt('shortcut_dangal_challenge', 'Challenge'),
          run: () => openDangalOpponentPicker('challenge'),
        },
      ],
    };
    return sets[tab] || sets.peepal;
  }

  function switchTo(tab) {
    const btn = document.querySelector(`.bottom-tabs .tab-btn[data-tab="${tab}"]`);
    if (btn && !btn.classList.contains('active')) btn.click();
  }

  function enterMorph(tab) {
    const bar = document.querySelector('.bottom-tabs');
    if (!bar || bar.classList.contains('is-shortcut-mode')) return;
    cancelPendingSingle();
    const shortcuts = shortcutsFor(tab).slice(0, 5);
    const buttons = [...bar.querySelectorAll('.tab-btn[data-tab]')];
    if (buttons.length < 5) return;

    morphSourceTab = tab;
    morphSnapshot = buttons.map((btn) => ({
      tab: btn.dataset.tab,
      html: btn.innerHTML,
      label: btn.querySelector('.tab-label')?.textContent || '',
      icon: btn.querySelector('.tab-icon')?.getAttribute('data-icon') || '',
    }));

    bar.classList.add('is-shortcut-mode');
    bar.setAttribute('data-morph-tab', tab);
    suppressNextClick = true;
    if (typeof Micro !== 'undefined') {
      Micro.haptic('heavy');
      Micro.playUi('tap');
    }
    try {
      if (typeof TabElements !== 'undefined' && TabElements.playAmbience) TabElements.playAmbience(tab);
    } catch (e) {}
    try {
      bar.querySelector('.morph-spread')?.remove();
      const quiet =
        (typeof quietMode !== 'undefined' && quietMode) ||
        document.documentElement.classList.contains('quiet-mode') ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!quiet) {
        const spread = document.createElement('div');
        spread.className = 'morph-spread';
        spread.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 12; i++) {
          const s = document.createElement('span');
          const x = 8 + Math.random() * 84;
          const y = 40 + Math.random() * 40;
          s.style.left = `${x}%`;
          s.style.top = `${y}%`;
          s.style.setProperty('--mx', `${(Math.random() - 0.5) * 60}px`);
          s.style.setProperty('--my', `${-18 - Math.random() * 36}px`);
          s.style.animationDelay = `${i * 0.04}s`;
          spread.appendChild(s);
        }
        bar.prepend(spread);
      }
    } catch (e) {}

    buttons.forEach((btn, i) => {
      const sc = shortcuts[i];
      if (!sc) return;
      btn.dataset.shortcutId = sc.id;
      btn.classList.add('is-shortcut');
      btn.setAttribute('aria-label', sc.label);
      const iconEl = btn.querySelector('.tab-icon');
      const labelEl = btn.querySelector('.tab-label');
      if (iconEl) {
        if (typeof TabElements !== 'undefined' && TabElements.mountShortcutIcon) {
          TabElements.mountShortcutIcon(iconEl, sc.id, tab);
        } else {
          iconEl.classList.remove('tab-el-icon');
          iconEl.removeAttribute('data-tab-element');
          iconEl.setAttribute('data-icon', sc.icon || 'sparkles');
          iconEl.setAttribute('data-icon-size', '20');
          delete iconEl.dataset.iconHydrated;
          iconEl.innerHTML = '';
          if (typeof hydrateIcons === 'function') hydrateIcons(btn);
        }
      }
      if (labelEl) labelEl.textContent = sc.label;
      btn.querySelector('.tab-notif-light')?.classList.add('hidden');
    });

    setTimeout(() => {
      document.addEventListener('pointerdown', onOutsideMorph, true);
    }, 0);
  }

  function onOutsideMorph(e) {
    const bar = document.querySelector('.bottom-tabs');
    if (!bar?.classList.contains('is-shortcut-mode')) return;
    if (bar.contains(e.target)) return;
    exitMorph();
  }

  function exitMorph() {
    const bar = document.querySelector('.bottom-tabs');
    if (!bar || !morphSnapshot) {
      bar?.classList.remove('is-shortcut-mode');
      document.removeEventListener('pointerdown', onOutsideMorph, true);
      return;
    }
    const buttons = [...bar.querySelectorAll('.tab-btn[data-tab]')];
    buttons.forEach((btn, i) => {
      const snap = morphSnapshot[i];
      if (!snap) return;
      delete btn.dataset.shortcutId;
      btn.classList.remove('is-shortcut');
      btn.innerHTML = snap.html;
      ensureTabLights();
    });
    bar.classList.remove('is-shortcut-mode');
    bar.removeAttribute('data-morph-tab');
    bar.querySelector('.morph-spread')?.remove();
    morphSnapshot = null;
    morphSourceTab = null;
    document.removeEventListener('pointerdown', onOutsideMorph, true);
    if (typeof TabElements !== 'undefined' && TabElements.mountAll) TabElements.mountAll(bar);
    else if (typeof hydrateIcons === 'function') hydrateIcons(bar);
    updateTabLights();
  }

  function runShortcut(btn) {
    const id = btn.dataset.shortcutId;
    const tab = morphSourceTab;
    const sc = shortcutsFor(tab).find((s) => s.id === id);
    exitMorph();
    try {
      sc?.run?.();
    } catch (e) {
      console.warn('[tab-gestures] shortcut', e?.message || e);
    }
  }

  function openRelevantTodaySheet() {
    document.getElementById('relevantTodaySheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'relevantTodaySheet';
    sheet.className = 'archive-overlay';
    sheet.dataset.navManaged = '1';
    const items = buildRelevantTodayItems();
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-overlay-dismiss aria-label="Back">←</button>
        <div style="flex:1"><strong>${tt('relevant_today_title', 'Relevant today')}</strong></div>
      </div>
      <div class="relevant-today-list" style="padding:12px 16px 28px;overflow:auto;">
        ${
          items.length
            ? items
                .map(
                  (it) =>
                    `<button type="button" class="relevant-today-row" data-action="${it.action}" style="width:100%;text-align:left;padding:14px;margin-bottom:8px;border:0;border-radius:14px;background:var(--white);cursor:pointer;">
                      <div style="font-weight:700;font-size:14px;">${it.icon} ${it.title}</div>
                      <div style="font-size:12px;color:var(--muted);margin-top:4px;">${it.sub}</div>
                    </button>`
                )
                .join('')
            : `<div class="cp-empty" style="padding:32px 12px;text-align:center;color:var(--muted);">${tt('relevant_today_empty', 'Nothing special queued for today — check back later.')}</div>`
        }
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    sheet.querySelectorAll('.relevant-today-row').forEach((row) => {
      row.addEventListener('click', () => {
        const a = row.dataset.action;
        close();
        if (a === 'akhbaar') {
          switchTo('akhbaar');
          if (typeof window.ensureAkhbaarBuilt === 'function') window.ensureAkhbaarBuilt();
        } else if (a === 'baithak') switchTo('baithak');
        else if (a === 'breaking') switchTo('akhbaar');
      });
    });
  }

  function buildRelevantTodayItems() {
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
    });

    try {
      const raw = localStorage.getItem('chaupaal_taaza_cache');
      if (raw) {
        const item = JSON.parse(raw);
        if (item?.headline) {
          out.push({
            icon: '📰',
            title: item.headline.slice(0, 80),
            sub: tt('relevant_news_sub', 'Trending on Akhbaar'),
            action: 'breaking',
          });
        }
      }
    } catch (e) {}

    out.push({
      icon: '🔥',
      title: tt('relevant_streak_cta', "Keep today's streak"),
      sub: tt('relevant_streak_sub', "Play today's Akhbaar quiz"),
      action: 'akhbaar',
    });
    return out.slice(0, 8);
  }

  function resolveGotdId() {
    return (
      (typeof window !== 'undefined' && window.__dangalGotdId) ||
      document.querySelector('#dangalGotdHost [data-game]')?.dataset?.game ||
      null
    );
  }

  function dangalCatalogExcludingGotd(gotdId) {
    let list = [];
    try {
      if (typeof getGames === 'function') {
        list = getGames({ dangal: true }) || [];
      }
    } catch (e) {}
    if (!list.length) {
      document.querySelectorAll('#dangalGamesGrid [data-game], .dangal-game-tile[data-game]').forEach((el) => {
        const id = el.dataset.game;
        if (id) list.push({ id, name: el.dataset.name || id, icon: el.dataset.icon || '🎮' });
      });
    }
    const exclude = gotdId ? String(gotdId) : '';
    return list.filter((g) => g && g.id && String(g.id) !== exclude);
  }

  function pickRandomChallengeGame(gotdId) {
    const pool = dangalCatalogExcludingGotd(gotdId);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatLastPlayed(ts) {
    if (!ts) return '';
    try {
      if (typeof formatRelativeTime === 'function') return formatRelativeTime(ts);
    } catch (e) {}
    const d = Date.now() - Number(ts);
    if (d < 3600000) return 'just now';
    if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
    return Math.floor(d / 86400000) + 'd ago';
  }

  function buildPerfChartSvg(rows) {
    const vals = rows.map((r) => r.played || 0);
    const max = Math.max(1, ...vals);
    const w = 280;
    const h = 64;
    const n = Math.max(1, rows.length);
    const gap = 4;
    const barW = Math.max(6, (w - gap * (n + 1)) / n);
    const bars = rows
      .map((r, i) => {
        const bh = Math.round(((r.played || 0) / max) * (h - 8));
        const x = gap + i * (barW + gap);
        const y = h - bh;
        return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="3" fill="var(--brand-red,#E63946)" opacity="${0.45 + (r.played / max) * 0.55}"/>`;
      })
      .join('');
    const sparkPts = rows
      .map((r, i) => {
        const x = gap + i * (barW + gap) + barW / 2;
        const y = h - Math.round(((r.wins || 0) / Math.max(1, r.played || 1)) * (h - 10)) - 4;
        return `${x},${y}`;
      })
      .join(' ');
    return `<svg class="cp-perf-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Plays by game">${bars}<polyline fill="none" stroke="#1C1B1F" stroke-opacity=".35" stroke-width="1.5" points="${sparkPts}"/></svg>`;
  }

  function buildPerformanceBodyHtml() {
    const hub = typeof getDangalHubSummary === 'function' ? getDangalHubSummary() : null;
    const progress = typeof getDangalProgress === 'function' ? getDangalProgress() : { games: {} };
    const gamesMap = progress.games || {};
    let catalog = [];
    try {
      if (typeof getGames === 'function') catalog = getGames({ dangal: true }) || [];
    } catch (e) {}
    const byId = {};
    catalog.forEach((g) => {
      byId[g.id] = g;
    });

    const rows = Object.keys(gamesMap)
      .map((id) => {
        const g = gamesMap[id] || {};
        const meta = byId[id] || { id, name: id, icon: '🎮' };
        return {
          id,
          name: meta.name || id,
          icon: meta.icon || '🎮',
          played: g.played || 0,
          wins: g.wins || 0,
          losses: g.losses || 0,
          draws: g.draws || 0,
          bestScore: g.bestScore,
          bestStreak: g.bestStreak || 0,
          lastAt: g.lastAt || 0,
        };
      })
      .filter((r) => r.played > 0)
      .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

    if (!rows.length) {
      return `<div class="cp-empty" style="padding:28px 8px;text-align:center;color:var(--muted);">
        ${tt('dangal_pulse_empty', 'Play a few games — your performance will show up here.')}
      </div>
      <button type="button" class="btn btn--primary btn--block" data-open-dangal>${tt('dangal_pulse_play', 'Open Dangal')}</button>`;
    }

    const totalPlayed = hub?.totalPlayed ?? rows.reduce((s, r) => s + r.played, 0);
    const totalWins = hub?.totalWins ?? rows.reduce((s, r) => s + r.wins, 0);
    const decided = rows.reduce((s, r) => s + r.wins + r.losses, 0);
    const winPct = decided > 0 ? Math.round((totalWins / decided) * 100) : null;
    const maxPlayed = Math.max(1, ...rows.map((r) => r.played));

    const gameRows = rows
      .map((r) => {
        const wl =
          r.wins + r.losses + r.draws > 0
            ? `${r.wins}W · ${r.losses}L${r.draws ? ` · ${r.draws}D` : ''}`
            : 'Score runs';
        const bits = [`${r.played} play${r.played === 1 ? '' : 's'}`, wl];
        if (r.bestScore != null) bits.push(`best ${r.bestScore}`);
        if (r.bestStreak > 1) bits.push(`best streak ${r.bestStreak}`);
        if (r.lastAt) bits.push(formatLastPlayed(r.lastAt));
        const pct = Math.round((r.played / maxPlayed) * 100);
        return `<div class="cp-perf-game" data-perf-game="${escHtml(r.id)}">
          <div class="cp-perf-game-icon" aria-hidden="true">${escHtml(r.icon)}</div>
          <div class="cp-perf-game-body">
            <div class="cp-perf-game-name">${escHtml(r.name)}</div>
            <div class="cp-perf-game-meta">${escHtml(bits.join(' · '))}</div>
            <div class="cp-perf-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
          </div>
        </div>`;
      })
      .join('');

    return `
      <div class="cp-perf-summary">
        <div class="cp-perf-pill"><strong>${totalPlayed}</strong><span>Plays</span></div>
        <div class="cp-perf-pill"><strong>${winPct != null ? winPct + '%' : '—'}</strong><span>Win rate</span></div>
        <div class="cp-perf-pill"><strong>${hub?.softDayStreak || 0}</strong><span>Day streak</span></div>
      </div>
      ${buildPerfChartSvg(rows.slice(0, 10))}
      <div class="cp-perf-games">${gameRows}</div>
      <button type="button" class="btn btn--primary btn--block" data-open-dangal style="margin-top:12px;">${tt('dangal_pulse_play', 'Open Dangal')}</button>`;
  }

  function openDangalOpponentPicker(mode) {
    switchTo('dangal');

    const startChallenge = (gameId) => {
      if (!gameId) return;
      if (mode === 'random' && typeof launchDangalWithOpponent === 'function') {
        launchDangalWithOpponent(gameId);
        setTimeout(() => document.getElementById('dgRandomOpp')?.click(), 80);
        return;
      }
      if (typeof launchDangalWithOpponent === 'function') launchDangalWithOpponent(gameId);
      else if (typeof handleDangalGameTap === 'function') handleDangalGameTap(gameId);
    };

    const openPickerSheet = (gotdId) => {
      let pick = pickRandomChallengeGame(gotdId);
      if (!pick) {
        if (typeof showToast === 'function') {
          showToast(tt('dangal_challenge_empty', 'No other games in Manch right now — try Khel.'));
        }
        return;
      }

      const renderBody = (game) => `
        <div class="cp-challenge-pick">
          <div class="cp-challenge-icon" aria-hidden="true">${escHtml(game.icon || '🎮')}</div>
          <h3>${escHtml(game.name || game.id)}</h3>
          <p>${tt('dangal_challenge_sub', 'Random from Manch — not today’s Game of the Day.')}</p>
          <button type="button" class="btn btn--primary btn--block" data-challenge-start>${tt('dangal_challenge_start', 'Challenge')}</button>
          <button type="button" class="btn btn--ghost btn--block" data-challenge-reroll style="margin-top:8px;">${tt('dangal_challenge_reroll', 'Pick another')}</button>
        </div>`;

      if (typeof openHalfSheet !== 'function') {
        startChallenge(pick.id);
        return;
      }

      openHalfSheet({
        id: 'dangalChallengeSheet',
        title: tt('shortcut_dangal_challenge', 'Challenge'),
        accent: 'dangal',
        snap: 'mid',
        bodyHtml: renderBody(pick),
        onMount: (sheet, close) => {
          const body = sheet.querySelector('[data-half-sheet-body]');
          const wire = () => {
            body?.querySelector('[data-challenge-start]')?.addEventListener('click', () => {
              const id = pick?.id;
              close();
              startChallenge(id);
            });
            body?.querySelector('[data-challenge-reroll]')?.addEventListener('click', () => {
              const next = pickRandomChallengeGame(gotdId);
              if (!next) return;
              pick = next;
              if (body) {
                body.innerHTML = renderBody(pick);
                wire();
              }
            });
          };
          wire();
        },
      });
    };

    const gotdNow = resolveGotdId();
    if (!gotdNow && typeof fetchGameOfTheDay === 'function') {
      fetchGameOfTheDay()
        .then((gotd) => {
          if (gotd?.gameId) {
            try {
              window.__dangalGotdId = gotd.gameId;
            } catch (e) {}
          }
          openPickerSheet(gotd?.gameId || resolveGotdId());
        })
        .catch(() => openPickerSheet(resolveGotdId()));
      return;
    }
    openPickerSheet(gotdNow);
  }

  function openDangalPulseSheet(opts) {
    document.getElementById('dangalPulseSheet')?.remove();
    try {
      if (opts?.refresh !== false && typeof renderDangalGamesGrid === 'function') {
        // Soft hub strip refresh when available
        const overall = document.getElementById('dangalOverallRating');
        if (overall && typeof getDangalHubSummary === 'function') {
          const hub = getDangalHubSummary();
          const streakBit =
            hub && hub.softDayStreak > 0
              ? `<span class="dor-meta">${hub.softDayStreak > 1 ? `${hub.softDayStreak}-day streak` : 'Played today'} · ${hub.weekPlays} this week</span>`
              : hub
                ? `<span class="dor-meta">${hub.weekPlays} play${hub.weekPlays === 1 ? '' : 's'} this week</span>`
                : '';
          if (hub) {
            overall.innerHTML = `<div class="dor-main"><span class="dor-label">${tt('dangal_pulse_title', 'Performance')}</span><span class="dor-val">${hub.totalPlayed || 0}</span></div>${streakBit}`;
          }
        }
      }
    } catch (e) {}

    const body = buildPerformanceBodyHtml();

    if (typeof openHalfSheet === 'function') {
      openHalfSheet({
        id: 'dangalPulseSheet',
        title: tt('dangal_pulse_title', 'Game performance'),
        accent: 'dangal',
        snap: 'tall',
        expand: true,
        bodyHtml: body,
        onMount: (sheet, close) => {
          sheet.querySelector('[data-open-dangal]')?.addEventListener('click', () => {
            close();
            switchTo('dangal');
          });
          sheet.querySelectorAll('[data-perf-game]').forEach((row) => {
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => {
              const gid = row.getAttribute('data-perf-game');
              close();
              switchTo('dangal');
              if (gid && typeof handleDangalGameTap === 'function') handleDangalGameTap(gid);
            });
          });
        },
      });
      return;
    }

    const sheet = document.createElement('div');
    sheet.id = 'dangalPulseSheet';
    sheet.className = 'archive-overlay';
    sheet.dataset.navManaged = '1';
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-overlay-dismiss aria-label="Back">←</button>
        <div style="flex:1"><strong>${tt('dangal_pulse_title', 'Game performance')}</strong></div>
      </div>
      <div style="padding:12px 16px 24px;">${body}</div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-open-dangal]')?.addEventListener('click', () => {
      close();
      switchTo('dangal');
    });
  }

  function onTabPointerDown(e) {
    const btn = e.target.closest('.bottom-tabs .tab-btn[data-tab]');
    if (!btn) return;
    if (document.querySelector('.bottom-tabs.is-shortcut-mode')) return;
    longMoved = false;
    longStartX = e.clientX || 0;
    longStartY = e.clientY || 0;
    clearTimeout(longTimer);
    longTimer = setTimeout(() => {
      longTimer = null;
      if (longMoved) return;
      enterMorph(btn.dataset.tab);
    }, LONG_MS);
  }

  function clearLong() {
    clearTimeout(longTimer);
    longTimer = null;
  }

  function onTabClickCapture(e) {
    const btn = e.target.closest('.bottom-tabs .tab-btn[data-tab]');
    if (!btn) return;
    const bar = document.querySelector('.bottom-tabs');

    if (suppressNextClick) {
      e.preventDefault();
      e.stopImmediatePropagation();
      suppressNextClick = false;
      return;
    }

    if (bar?.classList.contains('is-shortcut-mode')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      clearLong();
      runShortcut(btn);
      return;
    }

    clearLong();
    const tab = btn.dataset.tab;
    const wasActive = btn.classList.contains('active');
    const now = Date.now();

    if (wasActive) {
      if (lastTapTab === tab && now - lastTapAt < DOUBLE_MS) {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancelPendingSingle();
        lastTapTab = null;
        lastTapAt = 0;
        openTabNotifications(tab);
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();
      lastTapTab = tab;
      lastTapAt = now;
      scheduleActiveTabSingle(tab, isTabAtTop(tab));
      return;
    }

    cancelPendingSingle();
    lastTapTab = tab;
    lastTapAt = now;
    if (typeof Micro !== 'undefined') Micro.tabFeedback();
  }

  function wire() {
    const bar = document.querySelector('.bottom-tabs');
    if (!bar || bar.dataset.gesturesWired) return;
    bar.dataset.gesturesWired = '1';
    ensureTabLights();
    bar.addEventListener('click', onTabClickCapture, true);
    bar.addEventListener('pointerdown', onTabPointerDown, { passive: true });
    bar.addEventListener(
      'pointermove',
      (e) => {
        if (!longTimer) return;
        const dx = (e.clientX || 0) - longStartX;
        const dy = (e.clientY || 0) - longStartY;
        if (dx * dx + dy * dy > LONG_MOVE_PX * LONG_MOVE_PX) {
          longMoved = true;
          clearLong();
        }
      },
      { passive: true }
    );
    bar.addEventListener('pointerup', clearLong, { passive: true });
    bar.addEventListener('pointercancel', clearLong, { passive: true });
    bar.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.tab-btn')) e.preventDefault();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && bar.classList.contains('is-shortcut-mode')) exitMorph();
    });

    updateTabLights();
  }

  window.updateTabNotifLights = updateTabLights;
  window.exitTabMorph = exitMorph;
  window.openRelevantTodaySheet = openRelevantTodaySheet;
  window.openDangalPulseSheet = openDangalPulseSheet;
  window.getTabScrollRoot = getTabScrollRoot;
  window.refreshTabContent = refreshTabContent;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else setTimeout(wire, 0);
})();
