/**
 * Chaupaal Money + Pradhan / Sarpanch — client API + purchase surfaces.
 * Never label user-facing copy as "wallet".
 */
(function () {
  'use strict';

  let accountCache = null;
  let subCache = null;
  let tierCache = 'free';

  function tt(key, fb, vars) {
    if (typeof t === 'function') {
      const out = t(key, vars);
      if (out && out !== key) return out;
    }
    let s = fb || key;
    if (vars && typeof s === 'string') {
      Object.keys(vars).forEach((k) => {
        s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), vars[k]);
      });
    }
    return s;
  }

  function isTeen() {
    return typeof isTeenModeUser === 'function' && isTeenModeUser();
  }

  function profileType() {
    if (typeof getProfileType === 'function') return getProfileType();
    const p = typeof userProfile !== 'undefined' ? userProfile : {};
    const t = String(p.profileType || p.profile?.profileType || 'personal').toLowerCase();
    return t === 'professional' ? 'professional' : 'personal';
  }

  async function api(action, extra) {
    if (typeof apiFetch !== 'function') throw new Error('apiFetch missing');
    const envelope = await apiFetch('/api/media-config', {
      method: 'POST',
      needAuth: true,
      body: Object.assign({ action, profileType: profileType() }, extra || {}),
    });
    if (!envelope || envelope.ok === false) {
      const err = new Error(envelope?.error?.message || 'Request failed');
      err.code = envelope?.error?.code;
      throw err;
    }
    return envelope.data;
  }

  function formatAmount(n, opts) {
    const o = opts || {};
    const num = Math.round(Number(n) || 0);
    const cur = o.currency || accountCache?.currency || subCache?.currency || 'INR';
    const sym = o.symbol || subCache?.pricing?.symbol || accountCache?.fiatSymbol || '₹';
    try {
      const formatted = new Intl.NumberFormat(undefined, {
        style: 'decimal',
        maximumFractionDigits: 0,
      }).format(num);
      if (o.cmLabel) return `${formatted} CM`;
      return `${sym}${formatted}`;
    } catch (e) {
      return `${sym}${num}`;
    }
  }

  function effectiveTier() {
    return tierCache || 'free';
  }

  async function refreshCaches() {
    try {
      const [acct, sub] = await Promise.all([
        api('chaupaal_money_get').catch(() => null),
        api('subscription_get').catch(() => null),
      ]);
      if (acct) accountCache = acct;
      if (sub) {
        subCache = sub;
        tierCache = sub.tier || 'free';
      }
    } catch (e) {
      console.warn('[chaupaal-money] refresh', e?.message || e);
    }
    return { account: accountCache, subscription: subCache };
  }

  async function getAccount() {
    const data = await api('chaupaal_money_get');
    accountCache = data;
    return data;
  }

  async function getSubscription() {
    const data = await api('subscription_get');
    subCache = data;
    tierCache = data.tier || 'free';
    return data;
  }

  function canSpend(amount) {
    const bal = Number(accountCache?.balance) || 0;
    return bal >= Math.round(Number(amount) || 0);
  }

  function teenPurchaseBlock() {
    if (typeof showToast === 'function') {
      showToast(tt('teen_purchase_block', 'Ask a parent or turn off Teen Mode to purchase.'));
    }
  }

  function legalNoteHtml() {
    return `<p class="cm-legal">${tt(
      'money_legal_note',
      'Chaupaal Money is for in-app purchases only. No cash withdrawal. Dangal chips are separate game tokens, not real money.'
    )}</p>`;
  }

  function sheetClose(sheet, layer) {
    if (layer && typeof layer.close === 'function') layer.close();
    else if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
    if (sheet?.isConnected) sheet.remove();
  }

  async function openTopUp(presetAmount) {
    if (isTeen()) return teenPurchaseBlock();
    await refreshCaches();
    const sheet = document.createElement('div');
    sheet.className = 'money-account-sheet cm-topup-sheet';
    sheet.innerHTML = `
      <div class="cm-sheet-header">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-cm-close' }) : '<button type="button" data-cm-close>←</button>'}
        <strong>${tt('money_add', 'Add money')}</strong>
      </div>
      <div class="cm-sheet-body">
        <p class="cm-sub">${tt('money_topup_sub', '1 Chaupaal Money = 1 unit of your local currency.')}</p>
        <div class="cm-chip-row">
          ${[100, 500, 1000]
            .map(
              (a) =>
                `<button type="button" class="cm-chip" data-amt="${a}">${formatAmount(a)}</button>`
            )
            .join('')}
        </div>
        <label class="cm-field">
          <span>${tt('money_custom', 'Custom amount')}</span>
          <input type="number" min="1" max="100000" id="cmCustomAmt" placeholder="500" value="${presetAmount || ''}">
        </label>
        <button type="button" class="btn btn--primary btn--block" data-cm-pay>${tt('money_add', 'Add money')}</button>
        <div class="cm-status" data-cm-status></div>
        ${legalNoteHtml()}
      </div>`;
    const layer =
      typeof openLayer === 'function'
        ? openLayer(sheet, () => sheet.remove(), { label: tt('money_add', 'Add money') })
        : null;
    if (!layer) document.querySelector('.device')?.appendChild(sheet);

    const close = () => sheetClose(sheet, layer);
    sheet.querySelector('[data-cm-close]')?.addEventListener('click', close);

    let selected = presetAmount ? Math.round(Number(presetAmount)) : 500;
    sheet.querySelectorAll('[data-amt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selected = Number(btn.dataset.amt) || 500;
        sheet.querySelectorAll('.cm-chip').forEach((c) => c.classList.remove('selected'));
        btn.classList.add('selected');
        const inp = sheet.querySelector('#cmCustomAmt');
        if (inp) inp.value = String(selected);
      });
    });
    sheet.querySelector('#cmCustomAmt')?.addEventListener('input', (e) => {
      selected = Math.round(Number(e.target.value) || 0);
    });

    sheet.querySelector('[data-cm-pay]')?.addEventListener('click', async () => {
      const amt = Math.round(Number(sheet.querySelector('#cmCustomAmt')?.value || selected) || 0);
      if (amt <= 0) {
        if (typeof showToast === 'function') showToast(tt('money_invalid', 'Enter a valid amount'));
        return;
      }
      const status = sheet.querySelector('[data-cm-status]');
      const payBtn = sheet.querySelector('[data-cm-pay]');
      if (payBtn) payBtn.disabled = true;
      if (status) status.textContent = tt('money_opening', 'Opening checkout…');
      try {
        const intent = await api('chaupaal_money_topup_create', { amount: amt });
        const finish = async (paymentRef, preview) => {
          const credited = await api('chaupaal_money_topup_confirm', {
            amount: amt,
            paymentRef,
            preview: !!preview,
          });
          accountCache = Object.assign({}, accountCache, credited);
          if (typeof haptic === 'function') haptic('success');
          if (typeof showToast === 'function') {
            showToast(tt('money_added', 'Chaupaal Money added'));
          }
          close();
        };
        if (intent.preview || !intent.key || typeof Razorpay === 'undefined') {
          if (typeof showToast === 'function') {
            showToast(tt('money_preview', 'Payments coming soon — no charge'));
          }
          if (intent.preview) {
            await finish(intent.orderId, true);
          }
          if (payBtn) payBtn.disabled = false;
          return;
        }
        const rzp = new Razorpay({
          key: intent.key || window.CHAUPAAL_RAZORPAY_KEY,
          amount: amt * 100,
          currency: intent.currency || 'INR',
          name: 'Chaupaal',
          description: 'Chaupaal Money top-up',
          order_id: intent.orderId,
          handler: async (resp) => {
            try {
              await finish(resp.razorpay_payment_id || intent.orderId, false);
            } catch (e) {
              if (status) status.textContent = e?.message || 'Could not confirm payment';
            }
          },
          prefill: {
            name: userProfile?.name || '',
            email: userProfile?.email || '',
          },
          theme: { color: '#E63946' },
          modal: {
            ondismiss: () => {
              if (payBtn) payBtn.disabled = false;
              if (status) status.textContent = tt('money_cancelled', 'Checkout closed — nothing charged.');
            },
          },
        });
        rzp.open();
      } catch (e) {
        if (payBtn) payBtn.disabled = false;
        if (status) status.textContent = e?.message || 'Top-up failed';
      }
    });
  }

  async function openMembership() {
    await refreshCaches();
    const sub = subCache || {};
    const pricing = sub.pricing || {};
    const bal = Number(sub.balance ?? accountCache?.balance) || 0;
    const isPro = profileType() === 'professional';
    const tier = sub.tier || 'free';
    const teen = isTeen();

    const sheet = document.createElement('div');
    sheet.className = 'membership-sheet';
    sheet.innerHTML = `
      <div class="cm-sheet-header">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-mem-close' }) : '<button type="button" data-mem-close>←</button>'}
        <strong>${tt('membership_title', 'Membership')}</strong>
      </div>
      <div class="cm-sheet-body">
        <p class="cm-balance-line">${tt('money_balance', 'Balance')}: <strong>${formatAmount(bal, { cmLabel: true })}</strong></p>
        ${isPro ? `<p class="cm-sub">${tt('membership_professional_sarpanch_only', 'Professional profiles: Sarpanch only.')}</p>` : ''}
        <table class="cm-tier-table" aria-label="Membership comparison">
          <thead><tr><th></th><th>${tt('tier_free', 'Free')}</th>${!isPro ? `<th>${tt('tier_pradhan', 'Pradhan')}</th>` : ''}<th>${tt('tier_sarpanch', 'Sarpanch')}</th></tr></thead>
          <tbody>
            <tr><td>${tt('membership_ads', 'Ads')}</td><td>${tt('membership_ads_some', 'Some')}</td>${!isPro ? `<td>${tt('membership_ads_limited', 'Limited')}</td>` : ''}<td>${tt('membership_ads_none', 'None')}</td></tr>
            <tr><td>Peepal / week</td><td>5</td>${!isPro ? '<td>15</td>' : ''}<td>∞</td></tr>
            <tr><td>AI Discovery / week</td><td>10</td>${!isPro ? '<td>30</td>' : ''}<td>∞</td></tr>
            <tr><td>AI keyboard / day</td><td>5</td>${!isPro ? '<td>15</td>' : ''}<td>∞</td></tr>
            <tr><td>Streak freeze / mo</td><td>0</td>${!isPro ? '<td>1</td>' : ''}<td>∞</td></tr>
          </tbody>
        </table>
        <div class="cm-tier-cards">
          ${
            !isPro && pricing.pradhan != null
              ? `<div class="cm-tier-card${tier === 'pradhan' ? ' is-active' : ''}">
              <div class="cm-tier-name">${tt('tier_pradhan', 'Pradhan')}</div>
              <div class="cm-tier-price">${formatAmount(pricing.pradhan, { cmLabel: true })} / mo</div>
              ${tier === 'pradhan' && sub.activeUntil ? `<div class="cm-tier-renew">${new Date(sub.activeUntil).toLocaleDateString()}</div>` : ''}
              ${teen ? '' : `<button type="button" class="btn btn--primary btn--block" data-buy="pradhan">${tt('membership_subscribe', 'Subscribe')}</button>`}
            </div>`
              : ''
          }
          <div class="cm-tier-card${tier === 'sarpanch' ? ' is-active' : ''}">
            <div class="cm-tier-name">${tt('tier_sarpanch', 'Sarpanch')}</div>
            <div class="cm-tier-price">${formatAmount(pricing.sarpanch, { cmLabel: true })} / mo</div>
            ${tier === 'sarpanch' && sub.activeUntil ? `<div class="cm-tier-renew">${new Date(sub.activeUntil).toLocaleDateString()}</div>` : ''}
            ${teen ? '' : `<button type="button" class="btn btn--primary btn--block" data-buy="sarpanch">${tier === 'pradhan' && !isPro ? tt('membership_upgrade', 'Upgrade to Sarpanch') : tt('membership_subscribe', 'Subscribe')}</button>`}
          </div>
        </div>
        ${legalNoteHtml()}
      </div>`;
    const layer =
      typeof openLayer === 'function'
        ? openLayer(sheet, () => sheet.remove(), { label: tt('membership_title', 'Membership') })
        : null;
    if (!layer) document.querySelector('.device')?.appendChild(sheet);
    const close = () => sheetClose(sheet, layer);
    sheet.querySelector('[data-mem-close]')?.addEventListener('click', close);

    sheet.querySelectorAll('[data-buy]').forEach((btn) => {
      btn.addEventListener('click', () => purchaseTier(btn.dataset.buy, { closeParent: close }));
    });
  }

  async function purchaseTier(tier, opts) {
    if (isTeen()) return teenPurchaseBlock();
    const t = String(tier || '').toLowerCase();
    const price =
      t === 'pradhan' ? subCache?.pricing?.pradhan : t === 'sarpanch' ? subCache?.pricing?.sarpanch : null;
    if (price == null) {
      if (typeof showToast === 'function') showToast(tt('membership_unavailable', 'This tier is not available.'));
      return null;
    }
    if (!canSpend(price)) {
      if (typeof showToast === 'function') showToast(tt('membership_insufficient', 'Add money first'));
      openTopUp(price);
      return null;
    }
    try {
      const result = await api('subscription_purchase', { tier: t });
      subCache = result;
      tierCache = result.tier || t;
      if (typeof haptic === 'function') haptic('success');
      if (typeof showToast === 'function') {
        showToast(tt('membership_active', 'Membership active for 30 days'));
      }
      if (opts?.closeParent) opts.closeParent();
      return result;
    } catch (e) {
      if (e?.code === 'INSUFFICIENT_FUNDS') {
        if (typeof showToast === 'function') showToast(tt('membership_insufficient', 'Add money first'));
        openTopUp(price);
        return null;
      }
      if (typeof showToast === 'function') showToast(e?.message || 'Could not subscribe');
      return null;
    }
  }

  async function openAccount() {
    await refreshCaches();
    const acct = accountCache || {};
    const bal = Number(acct.balance) || 0;
    const sym = acct.fiatSymbol || '₹';
    const cur = acct.currency || 'INR';
    const txs = Array.isArray(acct.transactions) ? acct.transactions : [];
    const teen = isTeen();

    const overlay = document.createElement('div');
    overlay.className = 'money-account-sheet';
    overlay.innerHTML = `
      <div class="cm-sheet-header">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-acct-close' }) : '<button type="button" data-acct-close>←</button>'}
        <strong>${tt('money_account_title', 'Chaupaal Money account')}</strong>
      </div>
      <div class="cm-sheet-body">
        <div class="cm-balance-hero">
          <div class="cm-balance-label">${tt('money_balance', 'Balance')}</div>
          <div class="cm-balance-value">${formatAmount(bal, { cmLabel: true })}</div>
          <div class="cm-balance-fiat">1 Chaupaal Money = ${sym}1 in your region (${cur})</div>
        </div>
        ${teen ? `<p class="cm-teen-note">${tt('teen_purchase_block', 'Ask a parent or turn off Teen Mode to purchase.')}</p>` : `<button type="button" class="btn btn--primary btn--block" data-acct-topup>${tt('money_add', 'Add money')}</button>`}
        <button type="button" class="btn btn--block" data-acct-membership>${tt('membership_title', 'Membership (Pradhan / Sarpanch)')}</button>
        <h3 class="cm-tx-title">${tt('money_history', 'Recent activity')}</h3>
        <ul class="cm-tx-list">
          ${
            txs.length
              ? txs
                  .map((tx) => {
                    const sign = Number(tx.amount) >= 0 ? '+' : '';
                    const when = tx.at ? new Date(tx.at).toLocaleString() : '';
                    return `<li><span>${tx.reason || tx.type || ''}</span><span>${sign}${tx.amount} CM</span><time>${when}</time></li>`;
                  })
                  .join('')
              : `<li class="cm-tx-empty">${tt('money_no_tx', 'No activity yet')}</li>`
          }
        </ul>
        ${legalNoteHtml()}
      </div>`;
    const layer =
      typeof openLayer === 'function'
        ? openLayer(overlay, () => overlay.remove(), { label: tt('money_account_title', 'Chaupaal Money account') })
        : null;
    if (!layer) document.querySelector('.device')?.appendChild(overlay);
    const close = () => sheetClose(overlay, layer);
    overlay.querySelector('[data-acct-close]')?.addEventListener('click', close);
    overlay.querySelector('[data-acct-topup]')?.addEventListener('click', () => openTopUp());
    overlay.querySelector('[data-acct-membership]')?.addEventListener('click', () => openMembership());
  }

  function requestPaywall(ctx) {
    const c = ctx || {};
    if (typeof showToast === 'function') {
      showToast(
        typeof SubscriptionGate?.paywallMessage === 'function'
          ? SubscriptionGate.paywallMessage(c.reason)
          : tt('paywall_limit_body', 'Add Chaupaal Money or join Pradhan / Sarpanch for more.')
      );
    }
    if (c.open === 'money') openAccount();
    else openMembership();
  }

  function showInsufficientFunds(amount) {
    if (typeof showToast === 'function') showToast(tt('membership_insufficient', 'Add money first'));
    openTopUp(amount);
  }

  window.ChaupaalMoney = {
    getAccount,
    getSubscription,
    refreshCaches,
    openAccount,
    openTopUp,
    openMembership,
    purchaseTier,
    canSpend,
    formatAmount,
    effectiveTier,
    requestPaywall,
    showInsufficientFunds,
  };

  window.openProUpsell = function openProUpsell() {
    openMembership();
  };

  window.ChaupaalCommerce = {
    openMoney: openAccount,
    openMembership,
    showInsufficientFunds,
    requestPaywall,
  };

  if (typeof currentUser !== 'undefined' && currentUser?.uid) {
    refreshCaches().catch(() => {});
  }
})();
