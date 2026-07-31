/**
 * Khoj — intent-based people discovery only (not global Chaupaal search).
 * Surfaces AI Discovery messaging remaining + soft nudges.
 * Global omnibox lives at Peepal morph #5 → openUniversalSearch.
 */
(function () {
  'use strict';

  function tt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  async function renderKhojSurface(host) {
    if (!host) return;
    let panel = document.getElementById('peepalKhojSurface');
    const feed = document.getElementById('peepalFeed');
    const mash = document.getElementById('peepalMashhoorGrid');
    if (feed) feed.classList.add('hidden');
    mash?.classList.add('hidden');

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

    panel.innerHTML = `
      <div class="khoj-quota" data-nav-ignore="1">
        <div class="khoj-quota-num">${remaining}</div>
        <div class="khoj-quota-copy">
          <strong>${tt('khoj_quota_title', 'AI Discovery messages left today')}</strong>
          <span>${tt('khoj_quota_week', '{{n}} left this week').replace('{{n}}', String(quota.weekLeft ?? lim.perWeek))}</span>
          <p class="khoj-nudge">${nudge}</p>
        </div>
      </div>
      <div class="khoj-search-wrap">
        <input type="search" id="khojIntentInput" class="khoj-intent-input" placeholder="${tt('khoj_ph', 'Who are you looking for? e.g. cricket fan in Delhi')}" enterkeyhint="search">
        <button type="button" class="btn btn--primary" id="khojIntentGo">${tt('khoj_go', 'Find')}</button>
      </div>
      <div id="khojIntentResults" class="khoj-results"></div>
      <div class="khoj-hint">${tt('khoj_vs_global', 'Tip: Search posts, games & everything Chaupaal from Peepal’s Search Chaupaal shortcut.')}</div>`;

    // Reuse Peepal AI search path when available
    const run = () => {
      const q = panel.querySelector('#khojIntentInput')?.value?.trim();
      if (!q) return;
      const peepalInput = document.getElementById('peepalAiSearchInput');
      if (peepalInput) {
        peepalInput.value = q;
        if (typeof runPeepalAiSearch === 'function') runPeepalAiSearch();
        // Mirror results host if peepal results exist
        const src = document.getElementById('peepalAiSearchResults');
        const dest = panel.querySelector('#khojIntentResults');
        if (src && dest) {
          const sync = () => {
            dest.innerHTML = src.innerHTML;
          };
          sync();
          const mo = new MutationObserver(sync);
          mo.observe(src, { childList: true, subtree: true });
          setTimeout(() => mo.disconnect(), 15000);
        }
        return;
      }
      if (typeof openPeopleSearchWithContacts === 'function') {
        openPeopleSearchWithContacts({ surface: 'peepal' });
      }
    };
    panel.querySelector('#khojIntentGo')?.addEventListener('click', run);
    panel.querySelector('#khojIntentInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        run();
      }
    });

    // Soft mount meter if helper exists
    try {
      if (typeof AiDiscoveryMeter?.mountMeter === 'function') {
        const hostMeter = document.createElement('div');
        panel.querySelector('.khoj-quota')?.after(hostMeter);
        AiDiscoveryMeter.mountMeter(hostMeter);
      }
    } catch (e) {}
  }

  // Hide Khoj surface when leaving mode
  const _setPeepal = window.setPeepalMode;
  window.renderKhojSurface = renderKhojSurface;
  document.addEventListener('DOMContentLoaded', () => {
    // When leaving khoj, hide surface
    const orig = window.setPeepalMode;
    if (typeof orig === 'function' && !orig._khojWrapped) {
      window.setPeepalMode = function (mode) {
        const r = orig.apply(this, arguments);
        const panel = document.getElementById('peepalKhojSurface');
        if (mode !== 'khoj') panel?.classList.add('hidden');
        return r;
      };
      window.setPeepalMode._khojWrapped = true;
    }
  });
})();
