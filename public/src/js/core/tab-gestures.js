/**
 * Bottom-tab gestures: scroll-to-top, double-tap → tab notifications,
 * long-press → morph tab bar into contextual shortcuts.
 */
(function () {
  'use strict';

  const DOUBLE_MS = 300;
  const LONG_MS = 480;

  let lastTapTab = null;
  let lastTapAt = 0;
  let morphSourceTab = null;
  let morphSnapshot = null;
  let longTimer = null;
  let longMoved = false;
  let suppressNextClick = false;

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

  function scrollTabToTop(tab) {
    const map = {
      akhbaar: '#reelStage',
      duniya: '#duniyaFeed, #leharFeed:not(.hidden)',
      peepal: '#peepalFeed',
      baithak: '#chatList, #baithakInbox',
      dangal: '#dangalGamesGrid, #panel-dangal',
    };
    const sel = map[tab] || `#panel-${tab}`;
    const el = document.querySelector(sel);
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: 0, behavior: Micro?.prefersReducedMotion?.() ? 'auto' : 'smooth' });
    } else {
      document.getElementById(`panel-${tab}`)?.scrollTo?.({ top: 0, behavior: 'auto' });
    }
  }

  function openTabNotifications(tab) {
    if (isGuest()) {
      requireSignIn(tt('notif_sign_in', 'Sign in to see notifications'));
      return;
    }
    if (typeof Micro !== 'undefined') {
      Micro.haptic('medium');
      Micro.playUi('tap');
    } else if (typeof haptic === 'function') haptic('medium');
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
      const count =
        typeof unreadNotifCount === 'function' ? unreadNotifCount(tab) : 0;
      document.querySelectorAll(`[data-tab-light="${tab}"]`).forEach((el) => {
        el.classList.toggle('hidden', !count);
      });
    });
  }

  // ─── Shortcut sets ─────────────────────────────────────────────────────────
  function shortcutsFor(tab) {
    const sets = {
      peepal: [
        {
          id: 'ask',
          icon: 'pen',
          label: tt('shortcut_peepal_ask', 'Start discussion'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            if (typeof openPeepalAskSheet === 'function') openPeepalAskSheet();
          },
        },
        {
          id: 'search',
          icon: 'search',
          label: tt('shortcut_peepal_search', 'Search people'),
          run: () => {
            if (typeof openUniversalSearch === 'function') openUniversalSearch({ types: ['users'] });
            else document.getElementById('globalSearchBtn')?.click();
          },
        },
        {
          id: 'feed',
          icon: 'tree',
          label: tt('shortcut_peepal_feed', 'Peepal feed'),
          run: () => switchTo('peepal'),
        },
        {
          id: 'ai',
          icon: 'sparkles',
          label: tt('shortcut_peepal_ai', 'Ask Peepal'),
          run: () => {
            switchTo('peepal');
            document.getElementById('peepalSearchBtn')?.click();
          },
        },
        {
          id: 'close',
          icon: 'x',
          label: tt('shortcut_close', 'Close'),
          run: () => exitMorph(),
        },
      ],
      akhbaar: [
        {
          id: 'quiz',
          icon: 'newspaper',
          label: tt('shortcut_akhbaar_quiz', "Today's quiz"),
          run: () => {
            switchTo('akhbaar');
            if (typeof window.ensureAkhbaarBuilt === 'function') window.ensureAkhbaarBuilt();
            scrollTabToTop('akhbaar');
          },
        },
        {
          id: 'streak',
          icon: 'flame',
          label: tt('shortcut_akhbaar_streak', 'Streak'),
          run: () => {
            switchTo('akhbaar');
            document.getElementById('streakPill')?.click();
          },
        },
        {
          id: 'saved',
          icon: 'bookmark',
          label: tt('shortcut_akhbaar_saved', 'Saved'),
          run: () => {
            if (typeof openArchiveHub === 'function') openArchiveHub('duniya');
            else if (typeof openArchive === 'function') openArchive();
          },
        },
        {
          id: 'today',
          icon: 'sparkles',
          label: tt('shortcut_akhbaar_today', 'Relevant today'),
          run: () => openRelevantTodaySheet(),
        },
        {
          id: 'close',
          icon: 'x',
          label: tt('shortcut_close', 'Close'),
          run: () => exitMorph(),
        },
      ],
      duniya: [
        {
          id: 'post',
          icon: 'plus',
          label: tt('shortcut_duniya_post', 'Create post'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            switchTo('duniya');
            if (typeof openDuniyaPostSheet === 'function') openDuniyaPostSheet('post');
            else document.getElementById('duniyaPostBtn')?.click();
          },
        },
        {
          id: 'story',
          icon: 'camera',
          label: tt('shortcut_duniya_story', 'Create story'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            switchTo('duniya');
            if (typeof openDuniyaPostSheet === 'function') openDuniyaPostSheet('story');
          },
        },
        {
          id: 'lehar',
          icon: 'globe',
          label: tt('shortcut_duniya_lehar', 'Lehar'),
          run: () => {
            switchTo('duniya');
            if (typeof setDuniyaMode === 'function') setDuniyaMode('lehar');
            else document.querySelector('[data-duniya-mode="lehar"]')?.click();
          },
        },
        {
          id: 'foryou',
          icon: 'heart',
          label: tt('shortcut_duniya_general', 'For You'),
          run: () => {
            switchTo('duniya');
            if (typeof setDuniyaMode === 'function') setDuniyaMode('general');
            else document.querySelector('[data-duniya-mode="general"]')?.click();
          },
        },
        {
          id: 'close',
          icon: 'x',
          label: tt('shortcut_close', 'Close'),
          run: () => exitMorph(),
        },
      ],
      baithak: [
        {
          id: 'dm',
          icon: 'pen',
          label: tt('shortcut_baithak_dm', 'New DM'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            switchTo('baithak');
            if (typeof showNewDmSearchSheet === 'function') showNewDmSearchSheet();
          },
        },
        {
          id: 'group',
          icon: 'users',
          label: tt('shortcut_baithak_group', 'New group'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            switchTo('baithak');
            if (typeof showCreateGroup === 'function') showCreateGroup();
          },
        },
        {
          id: 'story',
          icon: 'camera',
          label: tt('shortcut_baithak_story', 'Stories'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            switchTo('baithak');
            if (typeof openBaithakStoryComposer === 'function') openBaithakStoryComposer('camera');
            else document.getElementById('addStoryBtn')?.click();
          },
        },
        {
          id: 'search',
          icon: 'search',
          label: tt('shortcut_baithak_search', 'Find people'),
          run: () => {
            if (isGuest()) return requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
            if (typeof showNewDmSearchSheet === 'function') showNewDmSearchSheet();
          },
        },
        {
          id: 'close',
          icon: 'x',
          label: tt('shortcut_close', 'Close'),
          run: () => exitMorph(),
        },
      ],
      dangal: [
        {
          id: 'gotd',
          icon: 'trophy',
          label: tt('shortcut_dangal_gotd', 'Game of the day'),
          run: () => {
            switchTo('dangal');
            const gotd = document.querySelector('.dangal-gotd, [data-gotd]');
            if (gotd) gotd.click();
            else if (typeof handleDangalGameTap === 'function') {
              /* fall through to pulse */
              openDangalPulseSheet();
            }
          },
        },
        {
          id: 'resume',
          icon: 'gamepad',
          label: tt('shortcut_dangal_resume', 'Resume'),
          run: () => {
            switchTo('dangal');
            const last = typeof getLastPlayedGame === 'function' ? getLastPlayedGame() : null;
            if (last && typeof handleDangalGameTap === 'function') handleDangalGameTap(last.id || last);
            else document.getElementById('dangalContinueChip')?.click();
          },
        },
        {
          id: 'challenge',
          icon: 'swords',
          label: tt('shortcut_dangal_challenge', 'Challenge friend'),
          run: () => openDangalOpponentPicker('challenge'),
        },
        {
          id: 'random',
          icon: 'target',
          label: tt('shortcut_dangal_random', 'Random opponent'),
          run: () => openDangalOpponentPicker('random'),
        },
        {
          id: 'pulse',
          icon: 'flame',
          label: tt('shortcut_dangal_pulse', 'Performance'),
          run: () => openDangalPulseSheet(),
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
      Micro.haptic('medium');
      Micro.playUi('tap');
    }

    buttons.forEach((btn, i) => {
      const sc = shortcuts[i];
      if (!sc) return;
      btn.dataset.shortcutId = sc.id;
      btn.classList.add('is-shortcut');
      btn.setAttribute('aria-label', sc.label);
      const iconEl = btn.querySelector('.tab-icon');
      const labelEl = btn.querySelector('.tab-label');
      if (iconEl) {
        iconEl.setAttribute('data-icon', sc.icon);
        delete iconEl.dataset.iconHydrated;
        iconEl.innerHTML = '';
      }
      if (labelEl) labelEl.textContent = sc.label;
      // Keep light hidden in morph
      btn.querySelector('.tab-notif-light')?.classList.add('hidden');
    });
    if (typeof hydrateIcons === 'function') hydrateIcons(bar);

    // Outside dismiss
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
      // Re-attach light after restore
      ensureTabLights();
    });
    bar.classList.remove('is-shortcut-mode');
    bar.removeAttribute('data-morph-tab');
    morphSnapshot = null;
    morphSourceTab = null;
    document.removeEventListener('pointerdown', onOutsideMorph, true);
    if (typeof hydrateIcons === 'function') hydrateIcons(bar);
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

  // ─── Relevant today / Dangal helpers ───────────────────────────────────────
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

    // Friends / sample discovery with matching DOB month-day
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

    // Breaking / taaza if present in local state
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
    // Reuse game registry: pick first popular game then opponent sheet
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

  // ─── Event wiring ──────────────────────────────────────────────────────────
  function onTabPointerDown(e) {
    const btn = e.target.closest('.bottom-tabs .tab-btn[data-tab]');
    if (!btn) return;
    if (document.querySelector('.bottom-tabs.is-shortcut-mode')) return;
    longMoved = false;
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

    // Morph mode: shortcut select
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
        lastTapTab = null;
        lastTapAt = 0;
        openTabNotifications(tab);
        return;
      }
      lastTapTab = tab;
      lastTapAt = now;
      scrollTabToTop(tab);
      if (typeof Micro !== 'undefined') Micro.tabFeedback();
      // Let existing handlers no-op re-activate; scroll already done
      return;
    }

    // Switching tabs — record for possible quick retap → notifs
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
      () => {
        longMoved = true;
        clearLong();
      },
      { passive: true }
    );
    bar.addEventListener('pointerup', clearLong, { passive: true });
    bar.addEventListener('pointercancel', clearLong, { passive: true });
    bar.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.tab-btn')) e.preventDefault();
    });

    // Back dismisses morph
    if (typeof pushNavLayer === 'function') {
      /* morph uses outside tap; also listen popstate-ish via nav */
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && bar.classList.contains('is-shortcut-mode')) exitMorph();
    });

    updateTabLights();
  }

  window.updateTabNotifLights = updateTabLights;
  window.exitTabMorph = exitMorph;
  window.openRelevantTodaySheet = openRelevantTodaySheet;
  window.openDangalPulseSheet = openDangalPulseSheet;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else setTimeout(wire, 0);
})();
