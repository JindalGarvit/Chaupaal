/**
 * Chaupaal Profile hub — account recap, trust, dashboard shortcuts, Plus.
 */
(function () {
  'use strict';

  function openChaupaalProfileHub() {
    document.getElementById('chaupaalHubSheet')?.remove();
    const p = typeof userProfile !== 'undefined' ? userProfile || {} : {};
    const dp = typeof digitalProfile !== 'undefined' ? digitalProfile || {} : {};
    const name = dp.displayName || p.name || 'You';
    const streak =
      (typeof getStreak === 'function' && getStreak()) ||
      p.streak ||
      Number(document.getElementById('streakNum')?.textContent) ||
      0;
    const teen = typeof isTeenModeUser === 'function' && isTeenModeUser();
    const overlay = document.createElement('div');
    overlay.id = 'chaupaalHubSheet';
    overlay.className = 'chaupaal-hub-overlay';
    overlay.dataset.navManaged = '1';
    overlay.innerHTML = `
      <div class="chaupaal-hub-header">
        <button type="button" data-hub-back aria-label="Back">←</button>
        <div>
          <strong>Chaupaal Profile</strong>
          <div class="chaupaal-hub-sub">Your space on the charpai</div>
        </div>
      </div>
      <div class="chaupaal-hub-body">
        <div class="chaupaal-hub-hero">
          <div class="chaupaal-hub-avatar">${p.photoURL ? `<img src="${p.photoURL}" alt="">` : '🪑'}</div>
          <div>
            <div class="chaupaal-hub-name">${name}</div>
            <div class="chaupaal-hub-meta">@${p.username || 'username'}${teen ? ' · Teen Mode' : ''}</div>
          </div>
        </div>
        <div class="chaupaal-hub-recap">
          <div><span>${streak}</span>day streak</div>
          <div><span>${Number(p.friendsCount) || '—'}</span>friends</div>
          <div><span>${Number(p.postsCount) || '—'}</span>posts</div>
        </div>
        <div class="chaupaal-hub-section">
          <h3>Trust & safety</h3>
          <p>${teen ? 'Teen Mode keeps messaging friend-first and AI age-aware.' : 'Flag, block, and report tools live on every post and chat.'}</p>
          <button type="button" class="btn" data-hub-blocked>Blocked users</button>
          <button type="button" class="btn" data-hub-sessions>Devices & sessions</button>
        </div>
        <div class="chaupaal-hub-section">
          <h3>Dashboard</h3>
          <button type="button" class="btn" data-hub-archive>Archive & journal</button>
          <button type="button" class="btn" data-hub-interactions>Interactions</button>
          <button type="button" class="btn" data-hub-wrap>Monthly wrap</button>
          <button type="button" class="btn" data-hub-settings>Settings</button>
        </div>
        <div class="chaupaal-hub-section chaupaal-hub-plus">
          <h3>Chaupaal Plus</h3>
          <p>Unlimited freezes, deeper insights, ad-free — checkout when payments are live.</p>
          <button type="button" class="btn btn--primary" data-hub-plus>Explore Plus</button>
        </div>
      </div>`;
    document.querySelector('.device')?.appendChild(overlay);
    if (typeof pushNavLayer === 'function') {
      pushNavLayer(overlay, { onPop: () => overlay.remove() });
    }
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(overlay);
      else overlay.remove();
    };
    overlay.querySelector('[data-hub-back]')?.addEventListener('click', close);
    overlay.querySelector('[data-hub-blocked]')?.addEventListener('click', () => {
      close();
      if (typeof openBlockedUsersSheet === 'function') openBlockedUsersSheet();
    });
    overlay.querySelector('[data-hub-sessions]')?.addEventListener('click', () => {
      close();
      if (typeof openSessionsSheet === 'function') openSessionsSheet();
    });
    overlay.querySelector('[data-hub-archive]')?.addEventListener('click', () => {
      close();
      if (typeof openArchiveHub === 'function') openArchiveHub('journal');
    });
    overlay.querySelector('[data-hub-interactions]')?.addEventListener('click', () => {
      close();
      if (typeof openArchiveHub === 'function') openArchiveHub('interactions');
    });
    overlay.querySelector('[data-hub-wrap]')?.addEventListener('click', () => {
      close();
      if (typeof showMonthlyWrap === 'function') showMonthlyWrap();
    });
    overlay.querySelector('[data-hub-settings]')?.addEventListener('click', () => {
      close();
      if (typeof openSettingsModal === 'function') openSettingsModal();
    });
    overlay.querySelector('[data-hub-plus]')?.addEventListener('click', () => {
      close();
      if (typeof openPremiumSheet === 'function') openPremiumSheet();
    });
  }

  window.openChaupaalProfileHub = openChaupaalProfileHub;
})();
