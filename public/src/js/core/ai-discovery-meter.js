/**
 * AI Discovery messaging meter — circular day + week remaining dials.
 * Soft nudge toward remaining outreach (paradox of choice), not guilt.
 */
(function () {
  'use strict';

  function limDefaults() {
    return window.PolicyLimits?.AI_DISCOVERY_MSG || { perDay: 3, perWeek: 10 };
  }

  function softNudge(state, lim) {
    const dayLeft = state?.dayLeft ?? lim.perDay;
    const exhausted = !!state?.exhausted || !!state?.readFailed;
    if (state?.readFailed) return 'Couldn’t verify your limit — try again shortly.';
    if (exhausted) {
      return (
        state?.unlock ||
        (typeof window.PolicyLimits?.unlockMessage === 'function'
          ? window.PolicyLimits.unlockMessage({
              dayExhausted: !state?.dayLeft,
              weekExhausted: !state?.weekLeft,
            })
          : 'Limit reached — browsing stays free.')
      );
    }
    if (dayLeft === 1) return 'One careful hello left today — make it count.';
    if (dayLeft <= Math.ceil(lim.perDay / 2)) {
      return `${dayLeft} hellos left today — save them for people you’ll actually message.`;
    }
    return 'Browsing is free. Messaging new Personal profiles via discovery counts toward your limit.';
  }

  /**
   * Compact dual circular meters (day + week remaining).
   * @param {object} state PolicyUsage.getRemaining result
   * @param {{ disclosePro?: boolean, compact?: boolean, nudge?: boolean }} opts
   */
  function meterHtml(state, opts) {
    const o = opts || {};
    const lim = limDefaults();
    const dayLeft = Math.max(0, state?.dayLeft ?? lim.perDay);
    const weekLeft = Math.max(0, state?.weekLeft ?? lim.perWeek);
    const dayFrac = Math.max(0, Math.min(1, dayLeft / lim.perDay));
    const weekFrac = Math.max(0, Math.min(1, weekLeft / lim.perWeek));
    const dayDeg = Math.round(dayFrac * 270);
    const weekDeg = Math.round(weekFrac * 270);
    const exhausted = !!state?.exhausted || !!state?.readFailed;
    const unlock = state?.readFailed
      ? state.unlock || 'Couldn’t verify your limit — try again shortly.'
      : state?.unlock || '';
    const nudge = o.nudge !== false ? softNudge(state, lim) : '';
    const compact = !!o.compact;
    return `
      <div class="ai-disc-meter${compact ? ' ai-disc-meter--compact' : ''}${exhausted ? ' is-exhausted' : ''}" data-nav-ignore="1" title="AI Discovery messages to Personal profiles">
        <div class="ai-disc-meter-dials">
          <div class="ai-disc-meter-dial" style="--meter-deg:${dayDeg}deg;" aria-label="${dayLeft} of ${lim.perDay} left today">
            <div class="ai-disc-meter-hub">
              <span class="ai-disc-meter-num">${exhausted ? '0' : dayLeft}</span>
              <span class="ai-disc-meter-sub">today</span>
            </div>
          </div>
          <div class="ai-disc-meter-dial ai-disc-meter-dial--week" style="--meter-deg:${weekDeg}deg;" aria-label="${weekLeft} of ${lim.perWeek} left this week">
            <div class="ai-disc-meter-hub">
              <span class="ai-disc-meter-num">${exhausted ? '0' : weekLeft}</span>
              <span class="ai-disc-meter-sub">week</span>
            </div>
          </div>
        </div>
        <div class="ai-disc-meter-copy">
          <div class="ai-disc-meter-title">${state?.readFailed ? 'Limit unavailable' : exhausted ? 'Outreach pause' : 'Remaining outreach'}</div>
          <div class="ai-disc-meter-meta">${exhausted ? '—' : `${dayLeft}/${lim.perDay} today · ${weekLeft}/${lim.perWeek} this week`}</div>
          ${nudge ? `<div class="ai-disc-meter-nudge">${nudge}</div>` : ''}
          ${exhausted && unlock && !nudge.includes(unlock) ? `<div class="ai-disc-meter-unlock">${unlock}</div>` : ''}
          ${
            o.disclosePro !== false
              ? `<div class="ai-disc-meter-note">Personal profiles found via AI search count toward this limit. Professional profiles do not.</div>`
              : ''
          }
        </div>
      </div>`;
  }

  function injectStyles() {
    if (document.getElementById('aiDiscMeterStyles')) return;
    const s = document.createElement('style');
    s.id = 'aiDiscMeterStyles';
    s.textContent = `
      .ai-disc-meter{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:var(--r-control,14px);background:var(--surface-sunken,#EEEEEE);border:1.5px solid var(--line);margin:10px 0;}
      .ai-disc-meter--compact{padding:10px 12px;margin:8px 0 4px;}
      .ai-disc-meter.is-exhausted{opacity:0.85;}
      .ai-disc-meter-dials{display:flex;gap:8px;flex-shrink:0;}
      .ai-disc-meter-dial{width:52px;height:52px;border-radius:50%;flex-shrink:0;background:conic-gradient(var(--brand-red,var(--red,#E63946)) 0deg, var(--brand-red,var(--red,#E63946)) var(--meter-deg), var(--line) var(--meter-deg), var(--line) 270deg, transparent 270deg);display:grid;place-items:center;position:relative;}
      .ai-disc-meter-dial--week{background:conic-gradient(var(--ink-secondary,#3C4043) 0deg, var(--ink-secondary,#3C4043) var(--meter-deg), var(--line) var(--meter-deg), var(--line) 270deg, transparent 270deg);}
      .ai-disc-meter-dial::after{content:'';position:absolute;inset:5px;border-radius:50%;background:var(--surface-elevated,var(--white,#fff));}
      .ai-disc-meter-hub{position:relative;z-index:1;text-align:center;line-height:1.05;}
      .ai-disc-meter-num{display:block;font-family:var(--font-display,'Space Grotesk'),sans-serif;font-weight:700;font-size:15px;color:var(--ink);}
      .ai-disc-meter-sub{font-size:8px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;}
      .ai-disc-meter-title{font-family:var(--font-display,'Space Grotesk'),sans-serif;font-weight:700;font-size:13px;margin-bottom:2px;}
      .ai-disc-meter-meta{font-size:11px;color:var(--muted);}
      .ai-disc-meter-nudge{font-size:11px;color:var(--ink-secondary,#3C4043);margin-top:4px;line-height:1.35;}
      .ai-disc-meter-unlock{font-size:11px;color:var(--brand-red,var(--red));font-weight:600;margin-top:4px;}
      .ai-disc-meter-note{font-size:10px;color:var(--muted);margin-top:6px;line-height:1.35;}
      .peepal-ai-results-collapsed{opacity:0.55;pointer-events:none;filter:grayscale(0.2);}
      .peepal-ai-limit-banner{padding:12px 14px;margin:8px 0 12px;border-radius:var(--r-control,12px);background:rgba(230,57,70,0.08);border:1.5px solid rgba(230,57,70,0.25);font-size:12px;line-height:1.4;color:var(--ink);}
      .peepal-intent-card.is-limit-collapsed .peepal-ai-search-input,
      .peepal-intent-card.is-limit-collapsed .peepal-ai-search-btn,
      .peepal-intent-card.is-limit-collapsed .peepal-intent-chips{opacity:0.45;pointer-events:none;}
      .khoj-intent-collapsed .khoj-intent-input,
      .khoj-intent-collapsed .peepal-ai-search-btn,
      .khoj-intent-collapsed [data-khoj-chips]{opacity:0.45;pointer-events:none;}
    `;
    document.head.appendChild(s);
  }

  async function mountMeter(host, opts) {
    if (!host) return null;
    injectStyles();
    let state = null;
    try {
      if (typeof PolicyUsage?.getRemaining === 'function') {
        state = await PolicyUsage.getRemaining('aiDiscoveryMsg');
      }
    } catch (e) {}
    host.innerHTML = meterHtml(state, opts);
    return state;
  }

  /** Mount on Vriksha / Khoj intent surfaces; collapse search when exhausted. */
  async function mountOnIntentCard(cardEl, opts) {
    if (!cardEl) return null;
    injectStyles();
    let host = cardEl.querySelector('[data-ai-disc-meter-host]');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-ai-disc-meter-host', '1');
      const chips = cardEl.querySelector('.peepal-intent-chips, [data-khoj-chips]');
      if (chips) chips.before(host);
      else cardEl.prepend(host);
    }
    const state = await mountMeter(host, Object.assign({ compact: true, nudge: true }, opts || {}));
    const exhausted = !!(state && state.exhausted);
    cardEl.classList.toggle('is-limit-collapsed', exhausted);
    cardEl.classList.toggle('khoj-intent-collapsed', exhausted);
    return state;
  }

  window.AiDiscoveryMeter = { meterHtml, mountMeter, mountOnIntentCard, injectStyles, softNudge };
})();
