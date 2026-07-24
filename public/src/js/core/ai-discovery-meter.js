/**
 * AI Discovery messaging meter — mindful remaining-use dial on profiles / chat.
 */
(function () {
  'use strict';

  function meterHtml(state, { disclosePro = true } = {}) {
    const lim = window.PolicyLimits?.AI_DISCOVERY_MSG || { perDay: 3, perWeek: 10 };
    const dayLeft = state?.dayLeft ?? lim.perDay;
    const weekLeft = state?.weekLeft ?? lim.perWeek;
    const dayFrac = Math.max(0, Math.min(1, dayLeft / lim.perDay));
    const weekFrac = Math.max(0, Math.min(1, weekLeft / lim.perWeek));
    const deg = Math.round(dayFrac * 270); // arc fill
    const exhausted = !!state?.exhausted || !!state?.readFailed;
    const unlock = state?.readFailed
      ? state.unlock || 'Couldn’t verify your limit — try again shortly.'
      : state?.unlock || '';
    return `
      <div class="ai-disc-meter" data-nav-ignore="1" title="AI Discovery messages to Personal profiles">
        <div class="ai-disc-meter-dial" style="--meter-deg:${deg}deg;${exhausted ? 'opacity:0.55;' : ''}">
          <div class="ai-disc-meter-hub">
            <span class="ai-disc-meter-num">${exhausted ? '0' : dayLeft}</span>
            <span class="ai-disc-meter-sub">today</span>
          </div>
        </div>
        <div class="ai-disc-meter-copy">
          <div class="ai-disc-meter-title">${state?.readFailed ? 'Limit unavailable' : exhausted ? 'Limit reached' : 'AI Discovery messages'}</div>
          <div class="ai-disc-meter-bar" aria-hidden="true"><i style="width:${exhausted ? 0 : Math.round(weekFrac * 100)}%"></i></div>
          <div class="ai-disc-meter-meta">${exhausted ? '—' : `${weekLeft} of ${lim.perWeek} left this week`}</div>
          ${exhausted && unlock ? `<div class="ai-disc-meter-unlock">${unlock}</div>` : ''}
          ${
            disclosePro
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
      .ai-disc-meter{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:14px;background:var(--cream);border:1.5px solid var(--line);margin:10px 0;}
      .ai-disc-meter-dial{width:56px;height:56px;border-radius:50%;flex-shrink:0;background:conic-gradient(var(--red) 0deg, var(--red) var(--meter-deg), var(--line) var(--meter-deg), var(--line) 270deg, transparent 270deg);display:grid;place-items:center;position:relative;}
      .ai-disc-meter-dial::after{content:'';position:absolute;inset:6px;border-radius:50%;background:var(--cream);}
      .ai-disc-meter-hub{position:relative;z-index:1;text-align:center;line-height:1.05;}
      .ai-disc-meter-num{display:block;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;color:var(--ink);}
      .ai-disc-meter-sub{font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;}
      .ai-disc-meter-title{font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;margin-bottom:4px;}
      .ai-disc-meter-bar{height:4px;border-radius:999px;background:var(--line);overflow:hidden;margin:4px 0 6px;}
      .ai-disc-meter-bar i{display:block;height:100%;background:var(--red);border-radius:999px;}
      .ai-disc-meter-meta{font-size:11px;color:var(--muted);}
      .ai-disc-meter-unlock{font-size:11px;color:var(--red);font-weight:600;margin-top:4px;}
      .ai-disc-meter-note{font-size:10px;color:var(--muted);margin-top:6px;line-height:1.35;}
      .peepal-ai-results-collapsed{opacity:0.55;pointer-events:none;filter:grayscale(0.2);}
      .peepal-ai-limit-banner{padding:12px 14px;margin:8px 0 12px;border-radius:12px;background:rgba(230,57,70,0.08);border:1.5px solid rgba(230,57,70,0.25);font-size:12px;line-height:1.4;color:var(--ink);}
    `;
    document.head.appendChild(s);
  }

  async function mountMeter(host) {
    if (!host) return null;
    injectStyles();
    let state = null;
    try {
      if (typeof PolicyUsage?.getRemaining === 'function') {
        state = await PolicyUsage.getRemaining('aiDiscoveryMsg');
      }
    } catch (e) {}
    host.innerHTML = meterHtml(state);
    return state;
  }

  window.AiDiscoveryMeter = { meterHtml, mountMeter, injectStyles };
})();
