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
    const name = dp.displayName || p.name || t('common.you');
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
        ${typeof backButtonHtml==='function'?backButtonHtml({ attrs: 'data-hub-back' }):'<button type="button" data-hub-back class="cp-back-btn" aria-label="' + tHtml('common.back') + '">←</button>'}
        <div>
          <strong>${tHtml('profile.chaupaal_profile')}</strong>
          <div class="chaupaal-hub-sub">${tHtml('profile.your_space_on_the_charpai')}</div>
        </div>
      </div>
      <div class="chaupaal-hub-body">
        <div class="chaupaal-hub-hero">
          <div class="chaupaal-hub-avatar">${typeof renderUserAvatarHtml==='function'?renderUserAvatarHtml({...p,profile:dp,uid:typeof currentUser!=='undefined'?currentUser?.uid:''},{decorative:true}):(p.photoURL?`<img src="${p.photoURL}" alt="">`:'🪑')}</div>
          <div>
            <div class="chaupaal-hub-name">${name}</div>
            <div class="chaupaal-hub-meta">@${p.username || tHtml('profile.username')}${teen ? tHtml('profile.teen_mode') : ''}</div>
          </div>
        </div>
        <div class="chaupaal-hub-recap">
          ${(() => {
            const cells =
              typeof resolveHonestProfileStats === 'function'
                ? resolveHonestProfileStats(dp, { isOwner: true, userMeta: p })
                : [];
            if (!cells.length) {
              return `<div class="chaupaal-hub-recap-empty">${tHtml('profile.activity_fills_in_as_you_use')}</div>`;
            }
            return cells.map((c) => `<div><span>${c.value}</span>${c.label === 'streak' ? tHtml('common.day_streak') : c.label}</div>`).join('');
          })()}
        </div>
        <button type="button" class="chaupaal-hub-glance" data-hub-money aria-label="${tHtml('profile.chaupaal_money_account')}">
          <span class="chaupaal-hub-glance-icon" aria-hidden="true">💰</span>
          <span class="chaupaal-hub-glance-copy">
            <strong>${tHtml('profile.chaupaal_money')}</strong>
            <small>${balanceStr}</small>
          </span>
          <span class="chaupaal-hub-glance-chev" aria-hidden="true">›</span>
        </button>
        <button type="button" class="chaupaal-hub-glance" data-hub-membership aria-label="${tHtml('profile.membership')}">
          <span class="chaupaal-hub-glance-icon" aria-hidden="true">⭐</span>
          <span class="chaupaal-hub-glance-copy">
            <strong>${tHtml('profile.membership')}</strong>
            <small>${membershipStr}</small>
          </span>
          <span class="chaupaal-hub-glance-chev" aria-hidden="true">›</span>
        </button>
        <div class="chaupaal-hub-section">
          <h3>${tHtml('profile.trust_safety')}</h3>
          <p>${teen ? tHtml('profile.teen_mode_keeps_messaging_friend_first') : tHtml('profile.flag_block_and_report_tools_live')}</p>
          <button type="button" class="btn" data-hub-blocked>${tHtml('common.blocked_users')}</button>
          <button type="button" class="btn" data-hub-sessions>${tHtml('common.devices_sessions')}</button>
        </div>
        <div class="chaupaal-hub-section">
          <h3>${tHtml('profile.dashboard')}</h3>
          <button type="button" class="btn" data-hub-archive>${tHtml('profile.archive_journal')}</button>
          <button type="button" class="btn" data-hub-interactions>${tHtml('profile.interactions')}</button>
          <button type="button" class="btn" data-hub-wrap>${tHtml('profile.monthly_wrap')}</button>
          <button type="button" class="btn" data-hub-settings>${tHtml('common.settings')}</button>
        </div>
        <div class="chaupaal-hub-section">
          <h3>${tHtml('profile.companion')}</h3>
          <p>${tHtml('profile.chaupaal_s_own_profile_monthly_summary')}</p>
          <button type="button" class="btn" data-hub-ai>${tHtml('profile.cai_open_ai')}</button>
        </div>
      </div>`;
    const layer =
      typeof openLayer === 'function'
        ? openLayer(overlay, null, { label: t('profile.chaupaal_hub') })
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
