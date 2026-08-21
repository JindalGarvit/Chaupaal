/**
 * Khoj — compatibility-first people surface (scroll for more peeks).
 * Shares intent search with Vriksha → runPeepalAiSearch → intent_discover API.
 * Empty query: broad friendship peeks. Mix: friendship-majority; opposite gender + similar age dominate.
 */
(function () {
  'use strict';

  const INTENT_CHIPS = [
    { icon: 'heart', label: 'Dating', hint: 'someone warm to date near me', tint: '#E63946' },
    { icon: 'handshake', label: 'Friendship', hint: 'new friends with similar interests', tint: '#2E7D32' },
    { icon: 'briefcase', label: 'Job', hint: 'someone hiring or looking for work', tint: '#EF6C00' },
    { icon: 'home', label: 'Flatmate', hint: 'flatmate or roommate nearby', tint: '#00838F' },
    { icon: 'plane', label: 'Travel', hint: 'travel companion for an upcoming trip', tint: '#00897B' },
    { icon: 'gamepad', label: 'Gaming', hint: 'someone to play games with', tint: '#5E35B1' },
    { icon: 'music', label: 'Music', hint: 'music lover with similar taste', tint: '#AD1457' },
    { icon: 'rocket', label: 'Co-founder', hint: 'startup-minded person to collaborate', tint: '#1565C0' },
  ];

  let khojShownPeeks = [];
  let khojHasMore = false;

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

  function syncIntentVisibility(mode) {
    const card = document.getElementById('peepalIntentCard');
    const panel = document.getElementById('peepalKhojSurface');
    if (card) card.classList.toggle('hidden', mode !== 'vriksha');
    if (panel) panel.classList.toggle('hidden', mode !== 'khoj');
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
        limit: o.limit || 6,
        reset,
        offset: reset ? 0 : undefined,
        friendshipOnly: !!o.friendshipOnly,
        emptyFriendship: !!o.emptyFriendship,
        friendshipMajority: true,
      });
      const peeks = page.peeks || [];
      khojHasMore = !!page.hasMore;
      if (reset) {
        khojShownPeeks = peeks.slice();
        if (!peeks.length) {
          listEl.innerHTML = `<div class="khoj-compat-empty">${tt(
            'khoj_empty_peeks',
            'No eligible people yet — we never invent profiles. Try a broader description below.'
          )}</div>`;
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
          moreBtn.addEventListener('click', () => loadKhojPeeks(listEl, { reset: false, limit: 6 }));
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

    const chipsHtml = INTENT_CHIPS.map(
      (c) =>
        `<button type="button" class="peepal-nudge-chip peepal-nudge-chip--tinted" data-hint="${c.hint}" data-chip-intent="${c.label.toLowerCase()}" data-tint="${c.tint}" style="--chip-tint:${c.tint}">${icon(c.icon)} ${tt('khoj_chip_' + c.label.toLowerCase(), c.label)}</button>`
    ).join('');

    panel.innerHTML = `
      <div class="peepal-card peepal-intent-card peepal-intent-card--khoj" id="khojIntentCard">
        <div class="peepal-intent-card-title">${tt('khoj_title', 'Khoj')}</div>
        <div class="peepal-intent-card-sub">
          ${tt('khoj_sub', 'Most compatible first — friendship-leaning, with room for other intents. Scroll for more.')}
        </div>
        <div class="peepal-intent-chips" data-khoj-chips data-swipe-ignore>${chipsHtml}</div>
        <textarea id="khojIntentInput" class="peepal-ai-search-input khoj-intent-input" rows="2"
          placeholder="${tt('khoj_ph', 'Who are you hoping to meet?')}"
          data-living-ph="khoj_intent" enterkeyhint="search"></textarea>
        <button type="button" class="peepal-ai-search-btn" id="khojIntentGo">${icon('search', 16)} ${tt('khoj_go', 'Find')}</button>
        <div id="khojCompatList" class="khoj-compat-scroll" aria-live="polite"></div>
        <div id="khojIntentResults" class="khoj-results peepal-intent-results"></div>
      </div>
      <div class="khoj-hint">${tt('khoj_vs_global', 'Tip: Search posts, games & everything Chaupaal from Peepal’s Search Chaupaal shortcut.')}</div>`;

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

    const listEl = panel.querySelector('#khojCompatList');
    // On open: ranked compatibility peeks; empty-query path uses broad friendship
    loadKhojPeeks(listEl, { reset: true, limit: 6, emptyFriendship: true, friendshipOnly: false });

    const run = () => {
      const q = panel.querySelector('#khojIntentInput')?.value?.trim();
      if (!q) {
        // Empty query → refresh friendship-majority peeks (never blank)
        loadKhojPeeks(listEl, { reset: true, limit: 6, emptyFriendship: true });
        return;
      }
      const peepalInput = document.getElementById('peepalAiSearchInput');
      if (peepalInput) peepalInput.value = q;
      const dest = panel.querySelector('#khojIntentResults');
      const src = document.getElementById('peepalAiSearchResults');
      if (typeof runPeepalAiSearch === 'function') {
        const p = runPeepalAiSearch({ query: q });
        Promise.resolve(p)
          .then(() => {
            if (src && dest) dest.innerHTML = src.innerHTML;
          })
          .catch(() => {});
        if (src && dest) {
          const mo = new MutationObserver(() => {
            dest.innerHTML = src.innerHTML;
          });
          mo.observe(src, { childList: true, subtree: true });
          setTimeout(() => mo.disconnect(), 20000);
        }
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
        const intent = String(chip.dataset.chipIntent || '').toLowerCase();
        if (intent === 'friendship' || !inp?.value) {
          loadKhojPeeks(listEl, {
            reset: true,
            limit: 6,
            emptyFriendship: intent === 'friendship' || !intent,
          });
        }
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
      try {
        if (typeof restoreAppShell === 'function') restoreAppShell('khoj_intent_blur');
      } catch (e) {}
    });
    if (typeof bindLivingPlaceholder === 'function') {
      bindLivingPlaceholder(panel.querySelector('#khojIntentInput'), 'khoj_intent');
    }
    const khojInp = panel.querySelector('#khojIntentInput');
    if (typeof enhanceSearchField === 'function' && khojInp && !khojInp.dataset.searchFieldWired) {
      enhanceSearchField(khojInp, {
        surfaceId: 'khoj',
        onClear() {
          const host = panel.querySelector('#khojIntentResults');
          if (host) host.innerHTML = '';
          loadKhojPeeks(listEl, { reset: true, limit: 6, emptyFriendship: true, friendshipOnly: false });
        },
      });
    }

    // Infinite scroll inside Khoj surface
    panel.addEventListener(
      'scroll',
      () => {
        if (!khojHasMore) return;
        if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 80) {
          loadKhojPeeks(listEl, { reset: false, limit: 6 });
        }
      },
      { passive: true }
    );
  }

  window.renderKhojSurface = renderKhojSurface;
  window.syncPeepalIntentVisibility = syncIntentVisibility;

  document.addEventListener('DOMContentLoaded', () => {
    const orig = window.setPeepalMode;
    if (typeof orig === 'function' && !orig._khojWrapped) {
      window.setPeepalMode = function (mode) {
        const r = orig.apply(this, arguments);
        syncIntentVisibility(mode);
        if (mode === 'vriksha') {
          document.getElementById('peepalDiscovery')?.classList.remove('hidden');
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
