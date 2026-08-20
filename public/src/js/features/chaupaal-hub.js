/**
 * Chaupaal Profile hub — account recap, trust, Money, Membership.
 */
(function () {
  'use strict';

  function tierLabel(tier) {
    const id = String(tier || 'free').toLowerCase();
    if (typeof t === 'function') {
      if (id === 'pradhan') return t('tier_pradhan') !== 'tier_pradhan' ? t('tier_pradhan') : 'Pradhan';
      if (id === 'sarpanch') return t('tier_sarpanch') !== 'tier_sarpanch' ? t('tier_sarpanch') : 'Sarpanch';
      return t('tier_free') !== 'tier_free' ? t('tier_free') : 'Free';
    }
    if (id === 'pradhan') return 'Pradhan';
    if (id === 'sarpanch') return 'Sarpanch';
    return 'Free';
  }

  async function openChaupaalProfileHub() {
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

    let balanceStr = '…';
    let membershipStr = 'Free';
    if (typeof ChaupaalMoney?.refreshCaches === 'function') {
      try {
        const { account, subscription } = await ChaupaalMoney.refreshCaches();
        if (account && typeof ChaupaalMoney.formatAmount === 'function') {
          balanceStr = ChaupaalMoney.formatAmount(account.balance, { cmLabel: true });
        }
        if (subscription?.tier) membershipStr = tierLabel(subscription.tier);
      } catch (e) {}
    }

    const overlay = document.createElement('div');
    overlay.id = 'chaupaalHubSheet';
    overlay.className = 'chaupaal-hub-overlay';
    overlay.dataset.navManaged = '1';
    overlay.innerHTML = `
      <div class="chaupaal-hub-header">
        ${typeof backButtonHtml==='function'?backButtonHtml({ attrs: 'data-hub-back' }):'<button type="button" data-hub-back class="cp-back-btn" aria-label="Back">←</button>'}
        <div>
          <strong>Chaupaal Profile</strong>
          <div class="chaupaal-hub-sub">Your space on the charpai</div>
        </div>
      </div>
      <div class="chaupaal-hub-body">
        <div class="chaupaal-hub-hero">
          <div class="chaupaal-hub-avatar">${typeof renderUserAvatarHtml==='function'?renderUserAvatarHtml({...p,profile:dp,uid:typeof currentUser!=='undefined'?currentUser?.uid:''},{decorative:true}):(p.photoURL?`<img src="${p.photoURL}" alt="">`:'🪑')}</div>
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
        <button type="button" class="chaupaal-hub-glance" data-hub-money aria-label="Chaupaal Money account">
          <span class="chaupaal-hub-glance-icon" aria-hidden="true">💰</span>
          <span class="chaupaal-hub-glance-copy">
            <strong>Chaupaal Money</strong>
            <small>${balanceStr}</small>
          </span>
          <span class="chaupaal-hub-glance-chev" aria-hidden="true">›</span>
        </button>
        <button type="button" class="chaupaal-hub-glance" data-hub-membership aria-label="Membership">
          <span class="chaupaal-hub-glance-icon" aria-hidden="true">⭐</span>
          <span class="chaupaal-hub-glance-copy">
            <strong>Membership</strong>
            <small>${membershipStr}</small>
          </span>
          <span class="chaupaal-hub-glance-chev" aria-hidden="true">›</span>
        </button>
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
        <div class="chaupaal-hub-section">
          <h3>Companion</h3>
          <p>Chaupaal’s own profile — monthly summary, stats, and membership — separate from yours.</p>
          <button type="button" class="btn" data-hub-ai>Open Chaupaal AI profile</button>
        </div>
      </div>`;
    const layer =
      typeof openLayer === 'function'
        ? openLayer(overlay, null, { label: 'Chaupaal hub' })
        : null;
    if (!layer) {
      document.querySelector('.device')?.appendChild(overlay);
      if (typeof pushNavLayer === 'function') {
        overlay.dataset.navManaged = '1';
        pushNavLayer(overlay, () => overlay.remove());
      }
    }
    const close = () => {
      if (layer) layer.close();
      else if (typeof removeNavLayer === 'function') {
        removeNavLayer(overlay);
        overlay.remove();
      } else overlay.remove();
    };
    overlay.querySelector('[data-hub-back]')?.addEventListener('click', close);
    overlay.querySelector('[data-hub-money]')?.addEventListener('click', () => {
      if (typeof ChaupaalMoney?.openAccount === 'function') ChaupaalMoney.openAccount();
      else close();
    });
    overlay.querySelector('[data-hub-membership]')?.addEventListener('click', () => {
      if (typeof ChaupaalMoney?.openMembership === 'function') ChaupaalMoney.openMembership();
      else close();
    });
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
    overlay.querySelector('[data-hub-ai]')?.addEventListener('click', () => {
      close();
      if (typeof openChaupaalAiProfile === 'function') openChaupaalAiProfile();
    });
  }

  window.openChaupaalProfileHub = openChaupaalProfileHub;
})();
