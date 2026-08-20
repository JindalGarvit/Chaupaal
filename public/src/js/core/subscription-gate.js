/**
 * Subscription tier gating — ads, effective limits, paywall hooks.
 */
(function () {
  'use strict';

  const AD_COUNT_KEY = 'chaupaal_ads_day';

  function adDayKey() {
    return typeof PolicyLimits?.dayKey === 'function' ? PolicyLimits.dayKey() : new Date().toISOString().slice(0, 10);
  }

  function readAdCount() {
    try {
      const raw = JSON.parse(localStorage.getItem(AD_COUNT_KEY) || '{}');
      if (raw.day !== adDayKey()) return 0;
      return Number(raw.count) || 0;
    } catch (e) {
      return 0;
    }
  }

  function bumpAdCount() {
    try {
      localStorage.setItem(AD_COUNT_KEY, JSON.stringify({ day: adDayKey(), count: readAdCount() + 1 }));
    } catch (e) {}
  }

  async function getEffectiveLimits() {
    const tier =
      typeof ChaupaalMoney?.effectiveTier === 'function' ? ChaupaalMoney.effectiveTier() : 'free';
    if (typeof PolicyLimits?.forTier === 'function') return PolicyLimits.forTier(tier);
    return PolicyLimits?.TIER_LIMITS?.free || {};
  }

  async function shouldShowAds() {
    const tier =
      typeof ChaupaalMoney?.effectiveTier === 'function' ? ChaupaalMoney.effectiveTier() : 'free';
    if (tier === 'sarpanch') return false;
    const lim = typeof PolicyLimits?.forTier === 'function' ? PolicyLimits.forTier(tier) : null;
    const cap = lim?.ADS_PER_DAY ?? 5;
    if (cap <= 0) return false;
    return readAdCount() < cap;
  }

  function renderAdSlot(host) {
    if (!host) return;
    host.innerHTML = '';
    host.setAttribute('data-ad-slot', '1');
    host.classList.add('ad-slot-placeholder');
    shouldShowAds().then((show) => {
      if (!show) {
        host.hidden = true;
        return;
      }
      host.hidden = false;
      bumpAdCount();
    });
  }

  function paywallMessage(reason) {
    const tt = typeof t === 'function' ? t : (k, fb) => fb || k;
    const body = tt('paywall_limit_body', 'Add Chaupaal Money or join Pradhan / Sarpanch for more.');
    return body;
  }

  window.SubscriptionGate = {
    getEffectiveLimits,
    shouldShowAds,
    renderAdSlot,
    paywallMessage,
    readAdCount,
  };
})();
