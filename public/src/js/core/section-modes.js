/**
 * Swipeable section modes for Peepal (Vriksha/Khoj/Mashhoor) and Akhbaar (Surkhiya).
 */
(function () {
  'use strict';

  let peepalMode = 'vriksha';
  let akhbaarMode = 'all';

  function setPeepalMode(mode) {
    peepalMode = ['vriksha', 'khoj', 'mashhoor'].includes(mode) ? mode : 'vriksha';
    const feed = document.getElementById('peepalFeed');
    const panel = document.getElementById('panel-peepal');
    if (panel) panel.dataset.peepalMode = peepalMode;

    if (peepalMode === 'khoj') {
      document.getElementById('peepalInlineSearch')?.focus();
      document.getElementById('peepalSearchBtn')?.click();
      if (typeof showToast === 'function') showToast('Khoj — search Peepal');
      return;
    }

    if (peepalMode === 'mashhoor') {
      if (feed) {
        const banner = feed.querySelector('[data-peepal-mode-banner]') || document.createElement('div');
        banner.dataset.peepalModeBanner = '1';
        banner.className = 'section-mode-banner';
        banner.textContent = 'Mashhoor — trending discussions';
        if (!banner.parentNode && feed.firstChild) feed.insertBefore(banner, feed.firstChild);
        else if (!banner.parentNode) feed.appendChild(banner);
      }
      // Sort visible cards by engagement if present
      try {
        const cards = [...(feed?.querySelectorAll('.peepal-card') || [])];
        cards
          .sort((a, b) => {
            const ra = Number(a.querySelector('.peepal-footer-stat')?.textContent?.replace(/\D/g, '') || 0);
            const rb = Number(b.querySelector('.peepal-footer-stat')?.textContent?.replace(/\D/g, '') || 0);
            return rb - ra;
          })
          .forEach((c) => feed.appendChild(c));
      } catch (e) {}
      if (typeof showToast === 'function') showToast('Mashhoor — trending on Peepal');
      return;
    }

    // vriksha — default tree/feed
    feed?.querySelector('[data-peepal-mode-banner]')?.remove();
    if (typeof showToast === 'function') showToast('Vriksha');
  }

  function setAkhbaarMode(mode) {
    akhbaarMode = ['all', 'surkhiya', 'gk'].includes(mode) ? mode : 'all';
    const panel = document.getElementById('panel-akhbaar');
    if (panel) panel.dataset.akhbaarMode = akhbaarMode;

    if (akhbaarMode === 'surkhiya') {
      let host = document.getElementById('akhbaarSurkhiya');
      if (!host) {
        host = document.createElement('div');
        host.id = 'akhbaarSurkhiya';
        host.className = 'akhbaar-surkhiya';
        const catBar = document.getElementById('akhbaarCatBar');
        catBar?.parentNode?.insertBefore(host, catBar.nextSibling);
      }
      host.classList.remove('hidden');
      host.innerHTML = `
        <div class="akhbaar-surkhiya-title">Surkhiya</div>
        <div class="akhbaar-surkhiya-sub">Today’s short digest — swipe categories below for the full reel.</div>
        <div class="akhbaar-surkhiya-chips">
          <button type="button" class="btn" data-surkhiya-jump="all">All headlines</button>
          <button type="button" class="btn btn--primary" data-surkhiya-jump="quiz">Today’s quiz</button>
        </div>`;
      host.querySelector('[data-surkhiya-jump="all"]')?.addEventListener('click', () => {
        document.querySelector('.akhbaar-cat-chip[data-cat="all"]')?.click();
      });
      host.querySelector('[data-surkhiya-jump="quiz"]')?.addEventListener('click', () => {
        if (typeof window.ensureAkhbaarBuilt === 'function') window.ensureAkhbaarBuilt();
      });
      if (typeof showToast === 'function') showToast('Surkhiya — today’s short digest');
      return;
    }

    document.getElementById('akhbaarSurkhiya')?.classList.add('hidden');
    if (akhbaarMode === 'gk') {
      document.querySelector('.akhbaar-cat-chip[data-cat="GK"]')?.click();
    } else {
      document.querySelector('.akhbaar-cat-chip[data-cat="all"]')?.click();
    }
  }

  window.setPeepalMode = setPeepalMode;
  window.setAkhbaarMode = setAkhbaarMode;
  window.peepalMode = () => peepalMode;
  window.akhbaarMode = () => akhbaarMode;
})();
