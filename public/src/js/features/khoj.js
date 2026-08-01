/**
 * Khoj — intent / natural-language people discovery only (not global Chaupaal search).
 * Morph entry 1A + swipe → Khoj. Reuses Peepal find-people chips + AI filter.
 * Global omnibox lives at Peepal morph #5 → openUniversalSearch.
 */
(function () {
  'use strict';

  const INTENT_CHIPS = [
    { icon: 'heart', label: 'Dating', hint: 'someone warm to date near me' },
    { icon: 'handshake', label: 'Friendship', hint: 'new friends with similar interests' },
    { icon: 'briefcase', label: 'Job', hint: 'someone hiring or looking for work' },
    { icon: 'home', label: 'Flatmate', hint: 'flatmate or roommate nearby' },
    { icon: 'plane', label: 'Travel', hint: 'travel companion for an upcoming trip' },
    { icon: 'gamepad', label: 'Gaming', hint: 'someone to play games with' },
    { icon: 'music', label: 'Music', hint: 'music lover with similar taste' },
    { icon: 'rocket', label: 'Co-founder', hint: 'startup-minded person to collaborate' },
  ];

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

    const lim = window.PolicyLimits?.AI_DISCOVERY_MSG || { perDay: 3, perWeek: 10 };
    let quota = { remaining: lim.perDay, dayLeft: lim.perDay, weekLeft: lim.perWeek, exhausted: false };
    try {
      if (typeof PolicyUsage?.getRemaining === 'function') {
        quota = (await PolicyUsage.getRemaining('aiDiscoveryMsg')) || quota;
      }
    } catch (e) {}

    const remaining = quota.exhausted ? 0 : quota.dayLeft ?? quota.remaining ?? lim.perDay;
    const nudge =
      remaining <= 0
        ? tt('khoj_nudge_exhausted', 'Daily AI Discovery messages used — message people you already know, or try again tomorrow.')
        : remaining <= 1
          ? tt('khoj_nudge_low', 'One careful hello left today — make it count.')
          : tt('khoj_nudge_soft', 'Browsing is free. Messaging new Personal profiles via Khoj counts toward your daily limit.');

    const chipsHtml = INTENT_CHIPS.map(
      (c) =>
        `<button type="button" class="peepal-nudge-chip" data-hint="${c.hint}">${icon(c.icon)} ${tt('khoj_chip_' + c.label.toLowerCase(), c.label)}</button>`
    ).join('');

    panel.innerHTML = `
      <div class="khoj-quota" data-nav-ignore="1">
        <div class="khoj-quota-num">${remaining}</div>
        <div class="khoj-quota-copy">
          <strong>${tt('khoj_quota_title', 'AI Discovery messages left today')}</strong>
          <span>${tt('khoj_quota_week', '{{n}} left this week').replace('{{n}}', String(quota.weekLeft ?? lim.perWeek))}</span>
          <p class="khoj-nudge">${nudge}</p>
        </div>
      </div>
      <div class="peepal-card peepal-intent-card peepal-intent-card--khoj">
        <div class="peepal-intent-card-title">${tt('khoj_title', 'Khoj')}</div>
        <div class="peepal-intent-card-sub">${tt('khoj_sub', 'Describe who you’re looking for — type anything, and we’ll filter matching people.')}</div>
        <div class="peepal-intent-chips" data-khoj-chips>${chipsHtml}</div>
        <textarea id="khojIntentInput" class="peepal-ai-search-input khoj-intent-input" rows="2"
          placeholder="${tt('khoj_ph', 'Who are you hoping to meet?')}"
          data-living-ph="khoj_intent" enterkeyhint="search"></textarea>
        <button type="button" class="peepal-ai-search-btn" id="khojIntentGo">${icon('search', 16)} ${tt('khoj_go', 'Find')}</button>
        <div id="khojIntentResults" class="khoj-results peepal-intent-results"></div>
      </div>
      <div class="khoj-hint">${tt('khoj_vs_global', 'Tip: Search posts, games & everything Chaupaal from Peepal’s Search Chaupaal shortcut.')}</div>`;

    const run = () => {
      const q = panel.querySelector('#khojIntentInput')?.value?.trim();
      if (!q) return;
      const peepalInput = document.getElementById('peepalAiSearchInput');
      if (peepalInput) peepalInput.value = q;
      if (typeof runPeepalAiSearch === 'function') {
        runPeepalAiSearch().then?.(() => {}).catch?.(() => {});
        // Mirror results into Khoj host
        const src = document.getElementById('peepalAiSearchResults');
        const dest = panel.querySelector('#khojIntentResults');
        if (src && dest) {
          const sync = () => {
            dest.innerHTML = src.innerHTML;
          };
          sync();
          const mo = new MutationObserver(sync);
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
      });
    });
    panel.querySelector('#khojIntentGo')?.addEventListener('click', run);
    panel.querySelector('#khojIntentInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        run();
      }
    });
    if (typeof bindLivingPlaceholder === 'function') {
      bindLivingPlaceholder(panel.querySelector('#khojIntentInput'), 'khoj_intent');
    }

    try {
      if (typeof AiDiscoveryMeter?.mountMeter === 'function') {
        const hostMeter = document.createElement('div');
        panel.querySelector('.khoj-quota')?.after(hostMeter);
        AiDiscoveryMeter.mountMeter(hostMeter);
      }
    } catch (e) {}
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
        return r;
      };
      window.setPeepalMode._khojWrapped = true;
    }
  });
})();
