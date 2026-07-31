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
  const LONG_MS = 340;
  const LONG_MOVE_PX = 12;
  const AT_TOP_PX = 12;

  let lastTapTab = null;
  let lastTapAt = 0;
  let pendingSingle = null; // { tab, atTop, timer }
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
  }

  function scheduleActiveTabSingle(tab, atTop) {
    cancelPendingSingle();
    pendingSingle = {
      tab,
      atTop,
      timer: setTimeout(() => {
        const job = pendingSingle;
        pendingSingle = null;
        if (!job || job.tab !== tab) return;
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
   * Peepal: discuss | Khoj | Vriksha | Mashhoor | find
   * Akhbaar: Relevant today | Surkhiya | All | Saathi | Add category
   *   (#1 morning brief · #5 extends past rightmost category edge)
   * Duniya: post | Lehar | Vishwa | Prasidha | story
   * Baithak: story | Sambhavanayein | Sabha | Mitra | find
   * Dangal: pulse | Khel(GOTD) | Manch(library) | Maidan(resume) | challenge
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
          id: 'find',
          label: tt('shortcut_peepal_search', 'Find people'),
          run: () => {
            switchTo('peepal');
            if (typeof openPeopleSearchWithContacts === 'function') openPeopleSearchWithContacts({ surface: 'peepal' });
            else {
              document.getElementById('peepalSearchBtn')?.click();
              document.getElementById('peepalInlineSearch')?.focus();
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
          id: 'story',
          label: tt('shortcut_baithak_story', 'Create story'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            switchTo('baithak');
            if (typeof openBaithakStoryComposer === 'function') openBaithakStoryComposer('camera');
            else document.getElementById('addStoryBtn')?.click();
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
          label: tt('shortcut_dangal_pulse', 'Progress'),
          run: () => openDangalPulseSheet(),
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

  function openDangalOpponentPicker(mode) {
    switchTo('dangal');
    const tile = document.querySelector('#dangalGamesGrid [data-game], .dangal-game-tile[data-game]');
    const gameId = tile?.dataset?.game || 'quiz';
    if (mode === 'random' && typeof launchDangalWithOpponent === 'function') {
      launchDangalWithOpponent(gameId);
      setTimeout(() => document.getElementById('dgRandomOpp')?.click(), 80);
      return;
    }
    if (typeof launchDangalWithOpponent === 'function') {
      launchDangalWithOpponent(gameId);
      return;
    }
    if (typeof handleDangalGameTap === 'function') handleDangalGameTap(gameId);
  }

  function openDangalPulseSheet() {
    document.getElementById('dangalPulseSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'dangalPulseSheet';
    sheet.className = 'archive-overlay';
    sheet.dataset.navManaged = '1';
    let body = '';
    const ratingsEl = document.getElementById('rpRatings');
    if (ratingsEl && ratingsEl.innerHTML.trim()) {
      body = `<div style="padding:12px 16px;">${ratingsEl.innerHTML}</div>`;
    } else {
      body = `<div style="padding:28px 16px;color:var(--muted);text-align:center;">${tt(
        'dangal_pulse_empty',
        'Play a few games — your category pulse will show up here.'
      )}</div>`;
    }
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-overlay-dismiss aria-label="Back">←</button>
        <div style="flex:1"><strong>${tt('dangal_pulse_title', 'Game performance')}</strong></div>
      </div>
      ${body}
      <div style="padding:0 16px 24px;">
        <button type="button" class="btn btn--primary btn--block" data-open-dangal>${tt('dangal_pulse_play', 'Open Dangal')}</button>
      </div>`;
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
