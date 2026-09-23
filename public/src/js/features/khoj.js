/**
 * Khoj — complete seek surface (K1).
 * Top: Chaupaal universal search. Below: intent chips + Find (people/strangers).
 * Compact filters (progressive). Empty query → friendship-first peeks (K0).
 */
(function () {
  'use strict';

  const INTENT_CHIPS_PERSONAL = [
    { icon: 'heart', label: 'Dating', hint: 'someone warm to date near me', tint: '#E63946', intent: 'dating' },
    { icon: 'handshake', label: 'Friendship', hint: 'new friends with similar interests', tint: '#2E7D32', intent: 'friendship' },
    { icon: 'briefcase', label: 'Job', hint: 'someone hiring or looking for work', tint: '#EF6C00', intent: 'job' },
    { icon: 'home', label: 'Flatmate', hint: 'flatmate or roommate nearby', tint: '#00838F', intent: 'flatmate' },
    { icon: 'plane', label: 'Travel', hint: 'travel companion for an upcoming trip', tint: '#00897B', intent: 'travel' },
    { icon: 'gamepad', label: 'Gaming', hint: 'someone to play games with', tint: '#5E35B1', intent: 'gaming' },
    { icon: 'music', label: 'Music', hint: 'music lover with similar taste', tint: '#AD1457', intent: 'music' },
    { icon: 'rocket', label: 'Co-founder', hint: 'startup-minded person to collaborate', tint: '#1565C0', intent: 'cofounder' },
  ];

  const INTENT_CHIPS_PRO = [
    { icon: 'briefcase', label: 'Networking', hint: 'professionals to grow my network with', tint: '#1565C0', intent: 'networking' },
    { icon: 'briefcase', label: 'Hiring', hint: 'someone I could hire or bring onto a project', tint: '#EF6C00', intent: 'job' },
    { icon: 'briefcase', label: 'Job seek', hint: 'someone hiring or open to career conversations', tint: '#00838F', intent: 'job' },
    { icon: 'rocket', label: 'Co-founder', hint: 'startup-minded co-founder or collaborator', tint: '#5E35B1', intent: 'cofounder' },
    { icon: 'handshake', label: 'Mentor', hint: 'a mentor or peer I can learn from', tint: '#2E7D32', intent: 'mentor' },
    { icon: 'rocket', label: 'Collab', hint: 'someone to collaborate on a project with', tint: '#AD1457', intent: 'collab' },
    { icon: 'handshake', label: 'Friendship', hint: 'new friends with similar interests', tint: '#00897B', intent: 'friendship' },
  ];

  function isProViewer() {
    try {
      if (typeof getProfileType === 'function') return getProfileType() === 'professional';
    } catch (e) {}
    return false;
  }

  function intentChipsForViewer() {
    return isProViewer() ? INTENT_CHIPS_PRO : INTENT_CHIPS_PERSONAL;
  }

  let khojShownPeeks = [];
  let khojHasMore = false;
  let khojSelectedChipIntent = null;

  function tt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function icon(name, size) {
    if (typeof iconHtml === 'function') return iconHtml(name, { size: size || 14 });
    return '';
  }

  function openKhojChaupaalSearch() {
    if (typeof openUniversalSearch === 'function') {
      openUniversalSearch({ types: ['users', 'duniya', 'peepal', 'groups', 'games'] });
      return;
    }
    if (typeof openPeopleSearchWithContacts === 'function') {
      openPeopleSearchWithContacts({ surface: 'peepal' });
    }
  }

  function syncIntentVisibility(mode) {
    const card = document.getElementById('peepalIntentCard');
    const panel = document.getElementById('peepalKhojSurface');
    if (card) card.classList.toggle('hidden', mode !== 'vriksha');
    if (panel) panel.classList.toggle('hidden', mode !== 'khoj');
  }

  function setKhojFindMode(panel, finding) {
    if (!panel) return;
    const list = panel.querySelector('#khojCompatList');
    const more = panel.querySelector('.khoj-compat-more');
    const back = panel.querySelector('#khojBackToPeeks');
    const results = panel.querySelector('#khojIntentResults');
    list?.classList.toggle('hidden', !!finding);
    more?.classList.toggle('hidden', !!finding || !khojHasMore);
    back?.classList.toggle('hidden', !finding);
    if (!finding && results) results.innerHTML = '';
  }

  async function loadKhojPeeks(listEl, opts) {
    if (!listEl || typeof getCompatibilityPeeks !== 'function') return;
    const o = opts || {};
    const reset = o.reset !== false;
    if (reset) {
      listEl.innerHTML = `<div class="discovery-loading" style="padding:10px;font-size:12px;">Ranking compatible people…</div>`;
      khojShownPeeks = [];
    }
    try {
      const page = await getCompatibilityPeeks({
        limit: o.limit || 5,
        reset,
        offset: reset ? 0 : undefined,
        friendshipOnly: !!o.friendshipOnly,
        emptyFriendship: !!o.emptyFriendship && !isProViewer(),
        friendshipMajority: !isProViewer(),
        networkingDefault: isProViewer(),
      });
      const peeks = page.peeks || [];
      khojHasMore = !!page.hasMore;
      if (reset) {
        khojShownPeeks = peeks.slice();
        if (!peeks.length) {
          listEl.innerHTML = `<div class="khoj-compat-empty">
            <p>${tt(
              'khoj_empty_peeks',
              'No eligible people yet — we never invent profiles. Invite a friend or search Chaupaal.'
            )}</p>
            <div class="khoj-empty-ctas" style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
              <button type="button" class="btn btn--primary" data-khoj-cta="invite">${tt('contacts_invite_cta', 'Invite friends')}</button>
              <button type="button" class="btn btn--ghost" data-khoj-cta="search">${tt('shortcut_peepal_global_search', 'Search Chaupaal')}</button>
              <button type="button" class="btn btn--ghost" data-khoj-cta="akhbaar">${tt('day0_play_akhbaar', 'Play Akhbaar')}</button>
            </div>
          </div>`;
          listEl.querySelector('[data-khoj-cta="invite"]')?.addEventListener('click', () => {
            if (typeof shareInviteToChaupaal === 'function') shareInviteToChaupaal();
            else if (typeof openDay0MeetSheet === 'function') openDay0MeetSheet();
          });
          listEl.querySelector('[data-khoj-cta="search"]')?.addEventListener('click', () => {
            const top = document.getElementById('khojChaupaalSearch');
            if (top) {
              top.focus();
              top.classList.add('khoj-global-search--pulse');
              setTimeout(() => top.classList.remove('khoj-global-search--pulse'), 900);
            }
            openKhojChaupaalSearch();
          });
          listEl.querySelector('[data-khoj-cta="akhbaar"]')?.addEventListener('click', () => {
            if (typeof showTab === 'function') showTab('akhbaar');
          });
          return;
        }
        listEl.innerHTML = peeks.map((p) => renderCompatPeekCard(p)).join('');
      } else {
        khojShownPeeks = khojShownPeeks.concat(peeks);
        listEl.insertAdjacentHTML('beforeend', peeks.map((p) => renderCompatPeekCard(p)).join(''));
      }
      if (typeof wireCompatPeekHost === 'function') wireCompatPeekHost(listEl, khojShownPeeks);
      let moreBtn = listEl.parentElement?.querySelector('.khoj-compat-more');
      if (khojHasMore) {
        if (!moreBtn) {
          moreBtn = document.createElement('button');
          moreBtn.type = 'button';
          moreBtn.className = 'khoj-compat-more';
          moreBtn.textContent = tt('khoj_more', 'See more compatible people');
          listEl.after(moreBtn);
          moreBtn.addEventListener('click', () => loadKhojPeeks(listEl, { reset: false, limit: 5 }));
        }
        moreBtn.classList.remove('hidden');
      } else if (moreBtn) {
        moreBtn.classList.add('hidden');
      }
    } catch (e) {
      if (reset) {
        listEl.innerHTML = `<div class="khoj-compat-empty">${tt('khoj_peek_err', 'Couldn’t load peeks — try again.')}</div>`;
      }
    }
  }

  function maybeOfferKhojInterestsAsk(panel) {
    try {
      if (sessionStorage.getItem('chaupaal_khoj_interests_ask') === '1') return;
      const after = Number(localStorage.getItem('chaupaal_nudge_after') || 0);
      if (after && Date.now() < after) return;
      if (typeof profileNudgeSkippedThisSession === 'function' && profileNudgeSkippedThisSession()) return;
    } catch (e) {}
    const dp = typeof digitalProfile !== 'undefined' ? digitalProfile : {};
    const has =
      typeof ProfileTaxonomy?.resolvedInterests === 'function'
        ? ProfileTaxonomy.resolvedInterests(dp).length > 0
        : Array.isArray(dp?.interests) && dp.interests.length > 0;
    if (has) return;
    const host = panel?.querySelector('#khojIntentCard') || panel;
    if (!host || host.querySelector('[data-khoj-interests-ask]')) return;
    try {
      sessionStorage.setItem('chaupaal_khoj_interests_ask', '1');
    } catch (e) {}
    const chips = (typeof ProfileTaxonomy !== 'undefined' && ProfileTaxonomy.INTEREST_CHIPS) || [
      'Travel',
      'Music',
      'Films',
      'Food',
      'Fitness',
      'Tech',
    ];
    const banner = document.createElement('div');
    banner.setAttribute('data-khoj-interests-ask', '1');
    banner.className = 'khoj-interests-ask';
    banner.style.cssText =
      'margin:10px 0 12px;padding:12px;border-radius:14px;border:1.5px solid var(--line);background:var(--cream);';
    banner.innerHTML = `
      <div style="font-size:13px;font-weight:700;margin-bottom:4px;">Add interests → better people in Khoj</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.4;">One quick pick — or dismiss. Used for matching when visible.</div>
      <div class="dp-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
        ${chips
          .slice(0, 10)
          .map(
            (c) =>
              `<button type="button" class="dp-chip" data-khoj-interest="${String(c).replace(/"/g, '&quot;')}" style="padding:6px 12px;border-radius:999px;border:2px solid var(--line);background:var(--white);font-size:12px;font-weight:600;cursor:pointer;">${c}</button>`
          )
          .join('')}
      </div>
      <button type="button" class="auth-guest-btn" data-khoj-ask-dismiss style="font-size:12px;">Not now</button>`;
    const filtersBar = host.querySelector('.khoj-filters-bar');
    if (filtersBar) filtersBar.after(banner);
    else host.insertBefore(banner, host.firstChild?.nextSibling || host.firstChild);
    const picked = new Set();
    banner.querySelectorAll('[data-khoj-interest]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.khojInterest;
        if (picked.has(v)) {
          picked.delete(v);
          btn.style.borderColor = 'var(--line)';
          btn.style.color = '';
        } else {
          picked.add(v);
          btn.style.borderColor = 'var(--red)';
          btn.style.color = 'var(--red)';
        }
        if (picked.size && typeof saveProfileField === 'function') {
          const cur =
            typeof ProfileTaxonomy?.resolvedInterests === 'function'
              ? ProfileTaxonomy.resolvedInterests(digitalProfile)
              : [];
          saveProfileField('interests', [...new Set([...cur, ...picked])]);
        }
      });
    });
    banner.querySelector('[data-khoj-ask-dismiss]')?.addEventListener('click', () => {
      banner.remove();
      if (typeof skipProfileNudgeThisSession === 'function') skipProfileNudgeThisSession();
    });
  }

  function softAuthForFind(pendingQuery) {
    if (typeof currentUser !== 'undefined' && currentUser) return false;
    const q = String(pendingQuery || '').trim().slice(0, 500);
    try {
      if (q) sessionStorage.setItem('chaupaal_khoj_pending_query', q);
    } catch (e) {}
    try {
      if (typeof ChaupaalReferrals?.stashPendingAction === 'function') {
        ChaupaalReferrals.stashPendingAction('khoj_find');
      } else if (typeof stashPendingAction === 'function') {
        stashPendingAction('khoj_find');
      } else {
        sessionStorage.setItem('chaupaal_pending_action', 'khoj_find');
      }
    } catch (e) {}
    if (typeof showToast === 'function') {
      showToast(tt('khoj_find_signin', 'Sign in to find people to meet'));
    }
    if (typeof openAuthSheet === 'function') openAuthSheet('login');
    else if (typeof showAuth === 'function') showAuth();
    return true;
  }

  async function renderKhojSurface(host) {
    if (!host) return;
    let panel = document.getElementById('peepalKhojSurface');
    const feed = document.getElementById('peepalFeed');
    const mash = document.getElementById('peepalMashhoorGrid');
    const intentCard = document.getElementById('peepalIntentCard');
    const discovery = document.getElementById('peepalDiscovery');
    if (feed) feed.classList.add('hidden');
    mash?.classList.add('hidden');
    intentCard?.classList.add('hidden');
    discovery?.classList.add('hidden');

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'peepalKhojSurface';
      panel.className = 'peepal-khoj-surface';
      (host.appendChild ? host : document.getElementById('peepalScreen') || document.getElementById('panel-peepal'))?.appendChild(
        panel
      );
    }
    panel.classList.remove('hidden');
    khojSelectedChipIntent = null;

    const chips = intentChipsForViewer();
    const chipsHtml = chips.map(
      (c) =>
        `<button type="button" class="peepal-nudge-chip peepal-nudge-chip--tinted" data-hint="${c.hint}" data-chip-intent="${c.intent}" data-tint="${c.tint}" style="--chip-tint:${c.tint}">${icon(c.icon)} ${tt('khoj_chip_' + c.label.toLowerCase().replace(/\s+/g, '_'), c.label)}</button>`
    ).join('');

    const filtersHtml =
      typeof renderKhojFiltersMarkup === 'function' ? renderKhojFiltersMarkup() : '';
    const pro = isProViewer();

    panel.innerHTML = `
      <button type="button" class="khoj-global-search" id="khojChaupaalSearch" aria-label="${tt('search_chaupaal', 'Search Chaupaal')}">
        <span class="khoj-global-search-icon" aria-hidden="true">${icon('search', 16)}</span>
        <span class="khoj-global-search-label">${tt('khoj_global_ph', 'Search Chaupaal — posts, people, games…')}</span>
      </button>
      <div class="peepal-card peepal-intent-card peepal-intent-card--khoj" id="khojIntentCard">
        <div class="peepal-intent-card-sub">
          ${
            pro
              ? tt(
                  'khoj_sub_pro',
                  'Find people to work with — networking strangers, with short reasons. Or scroll peeks below.'
                )
              : tt(
                  'khoj_sub',
                  'Find people to meet — strangers, with short reasons. Or scroll peeks below.'
                )
          }
        </div>
        <div class="peepal-intent-chips" data-khoj-chips data-swipe-ignore>${chipsHtml}</div>
        <div class="khoj-search-row">
          <div class="khoj-search-wrap">
            <textarea id="khojIntentInput" class="peepal-ai-search-input khoj-intent-input" rows="2"
              placeholder="${
                pro
                  ? tt('khoj_ph_pro', 'Who do you want to work with? Hire, mentor, co-founder…')
                  : tt('khoj_ph', 'Who are you hoping to meet? Any description works.')
              }"
              data-living-ph="khoj_intent" enterkeyhint="search"></textarea>
          </div>
          <button type="button" class="peepal-ai-search-btn khoj-intent-go" id="khojIntentGo">${icon('search', 16)} ${tt('khoj_go', 'Find')}</button>
        </div>
        ${filtersHtml}
        <button type="button" class="khoj-back-peeks hidden" id="khojBackToPeeks">${tt('khoj_back_peeks', '← Back to peeks')}</button>
        <div id="khojCompatList" class="khoj-compat-scroll" aria-live="polite"></div>
        <div id="khojIntentResults" class="khoj-results peepal-intent-results"></div>
      </div>`;

    if (typeof tintPeepalIntentChips === 'function') tintPeepalIntentChips(panel);
    if (typeof filterPeepalSearchNudges === 'function') filterPeepalSearchNudges(panel);
    try {
      if (typeof hydrateIcons === 'function') hydrateIcons(panel);
    } catch (e) {}

    try {
      if (typeof AiDiscoveryMeter?.mountOnIntentCard === 'function') {
        await AiDiscoveryMeter.mountOnIntentCard(panel.querySelector('#khojIntentCard'), {
          disclosePro: true,
        });
      }
    } catch (e) {}

    panel.querySelector('#khojChaupaalSearch')?.addEventListener('click', openKhojChaupaalSearch);

    const listEl = panel.querySelector('#khojCompatList');
    const reloadPeeks = () => {
      setKhojFindMode(panel, false);
      loadKhojPeeks(listEl, {
        reset: true,
        limit: 5,
        emptyFriendship: !isProViewer(),
        friendshipOnly: false,
      });
    };

    if (typeof wireKhojFilters === 'function') {
      wireKhojFilters(panel, () => {
        const q = panel.querySelector('#khojIntentInput')?.value?.trim();
        const resultsVisible =
          panel.querySelector('#khojIntentResults')?.children?.length > 0 &&
          !panel.querySelector('#khojBackToPeeks')?.classList.contains('hidden');
        if (q && resultsVisible && typeof runPeepalAiSearch === 'function') {
          runPeepalAiSearch({
            query: q,
            resultsEl: panel.querySelector('#khojIntentResults'),
            surface: 'khoj',
            limit: 8,
            chipIntent: khojSelectedChipIntent,
          });
        } else {
          reloadPeeks();
        }
      });
    }

    panel.querySelector('#khojBackToPeeks')?.addEventListener('click', () => {
      const inp = panel.querySelector('#khojIntentInput');
      if (inp) inp.value = '';
      khojSelectedChipIntent = null;
      panel.querySelectorAll('[data-khoj-chips] .peepal-nudge-chip').forEach((c) => c.classList.remove('is-active'));
      reloadPeeks();
    });

    // Pending query from Vriksha "Find on Khoj" or post-auth resume (K4)
    let pendingQ = '';
    try {
      pendingQ = sessionStorage.getItem('chaupaal_khoj_pending_query') || '';
    } catch (e) {}
    if (pendingQ) {
      const inp = panel.querySelector('#khojIntentInput');
      if (inp) inp.value = pendingQ;
      const dest = panel.querySelector('#khojIntentResults');
      const signedIn = typeof currentUser !== 'undefined' && !!currentUser;
      if (signedIn && typeof runPeepalAiSearch === 'function') {
        try {
          sessionStorage.removeItem('chaupaal_khoj_pending_query');
        } catch (e) {}
        setKhojFindMode(panel, true);
        runPeepalAiSearch({ query: pendingQ, resultsEl: dest, surface: 'khoj', limit: 8 });
      } else if (!signedIn) {
        softAuthForFind(pendingQ);
        loadKhojPeeks(listEl, {
          reset: true,
          limit: 5,
          emptyFriendship: !isProViewer(),
          friendshipOnly: false,
        });
      } else {
        try {
          sessionStorage.removeItem('chaupaal_khoj_pending_query');
        } catch (e) {}
        loadKhojPeeks(listEl, {
          reset: true,
          limit: 5,
          emptyFriendship: !isProViewer(),
          friendshipOnly: false,
        });
      }
    } else {
      loadKhojPeeks(listEl, {
        reset: true,
        limit: 5,
        emptyFriendship: !isProViewer(),
        friendshipOnly: false,
      });
    }

    maybeOfferKhojInterestsAsk(panel);

    const run = () => {
      const inp = panel.querySelector('#khojIntentInput');
      const q = inp?.value?.trim();
      if (!q) {
        if (typeof showToast === 'function') {
          showToast(tt('peepal_find_empty', "Type who you're looking for"));
        }
        inp?.focus();
        return;
      }
      if (softAuthForFind(q)) return;
      const dest = panel.querySelector('#khojIntentResults');
      setKhojFindMode(panel, true);
      if (typeof runPeepalAiSearch === 'function') {
        try {
          sessionStorage.removeItem('chaupaal_khoj_pending_query');
        } catch (e) {}
        runPeepalAiSearch({
          query: q,
          resultsEl: dest,
          surface: 'khoj',
          limit: 5,
          chipIntent: khojSelectedChipIntent,
        });
        return;
      }
      if (typeof openPeopleSearchWithContacts === 'function') {
        openPeopleSearchWithContacts({ surface: 'peepal' });
      }
    };

    panel.querySelectorAll('[data-khoj-chips] .peepal-nudge-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const inp = panel.querySelector('#khojIntentInput');
        if (inp) {
          inp.value = chip.dataset.hint || '';
          inp.focus();
        }
        khojSelectedChipIntent = chip.dataset.chipIntent || null;
        panel.querySelectorAll('[data-khoj-chips] .peepal-nudge-chip').forEach((c) => {
          c.classList.toggle('is-active', c === chip);
        });
        // Fill only — user must tap Find
      });
    });
    panel.querySelector('#khojIntentGo')?.addEventListener('click', run);
    panel.querySelector('#khojIntentInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        run();
      }
    });
    panel.querySelector('#khojIntentInput')?.addEventListener('blur', () => {
      setTimeout(() => {
        const ae = document.activeElement;
        if (ae?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
        const vv = window.visualViewport;
        const inset = vv ? Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0)) : 0;
        if (inset > 40 || document.documentElement.classList.contains('kb-open')) return;
        try {
          if (typeof restoreAppShell === 'function') restoreAppShell('khoj_intent_blur');
        } catch (e) {}
      }, 100);
    });
    if (typeof bindLivingPlaceholder === 'function') {
      bindLivingPlaceholder(panel.querySelector('#khojIntentInput'), 'khoj_intent');
    }
    const khojInp = panel.querySelector('#khojIntentInput');
    if (typeof enhanceSearchField === 'function' && khojInp) {
      delete khojInp.dataset.searchFieldWired;
      enhanceSearchField(khojInp, {
        surfaceId: 'khoj',
        onClear() {
          khojSelectedChipIntent = null;
          panel.querySelectorAll('[data-khoj-chips] .peepal-nudge-chip').forEach((c) => c.classList.remove('is-active'));
          reloadPeeks();
        },
      });
    }

    panel.addEventListener(
      'scroll',
      () => {
        if (!khojHasMore) return;
        if (panel.querySelector('#khojCompatList')?.classList.contains('hidden')) return;
        if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 80) {
          loadKhojPeeks(listEl, { reset: false, limit: 5 });
        }
      },
      { passive: true }
    );
  }

  window.renderKhojSurface = renderKhojSurface;
  window.syncPeepalIntentVisibility = syncIntentVisibility;
  window.openKhojChaupaalSearch = openKhojChaupaalSearch;

  document.addEventListener('DOMContentLoaded', () => {
    const orig = window.setPeepalMode;
    if (typeof orig === 'function' && !orig._khojWrapped) {
      window.setPeepalMode = function (mode) {
        const r = orig.apply(this, arguments);
        syncIntentVisibility(mode);
        if (mode === 'vriksha') {
          document.getElementById('peepalDiscovery')?.classList.add('hidden');
          document.getElementById('peepalCompatPeeks')?.classList.add('hidden');
          document.getElementById('peepalFeed')?.classList.remove('hidden');
        }
        try {
          if (typeof restoreAppShell === 'function') restoreAppShell('peepal_mode:' + mode);
        } catch (e) {}
        return r;
      };
      window.setPeepalMode._khojWrapped = true;
    }
  });
})();
