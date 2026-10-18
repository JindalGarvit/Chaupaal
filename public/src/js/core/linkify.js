/**
 * Platform-wide URL detection + leave-Chaupaal interstitial.
 * Safe Browsing check when API key is configured (via /api/media-config).
 */
(function () {
  'use strict';

  const URL_RE =
    /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?\])}]|\b[a-z0-9][-a-z0-9]*\.(?:com|org|net|io|co|in|app|dev|me|ai)(?:\/[^\s<>"']*)?)/gi;

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeHref(raw) {
    let u = String(raw || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.href;
    } catch {
      return '';
    }
  }

  function linkifyText(text, { escape = true } = {}) {
    const src = escape ? escapeHtml(text) : String(text ?? '');
    if (!src) return '';
    return src.replace(URL_RE, (match) => {
      const href = normalizeHref(match.replace(/&amp;/g, '&'));
      if (!href) return match;
      const label = match;
      return `<a href="${escapeHtml(href)}" class="chaupaal-ext-link" data-ext-url="${escapeHtml(href)}" rel="noopener noreferrer">${label}</a>`;
    });
  }

  async function checkUrlSafety(url) {
    const href = normalizeHref(url);
    if (!href) return { safe: false, reason: 'invalid', checked: true };
    try {
      if (typeof apiFetch === 'function') {
        const envelope = await apiFetch('/api/media-config', {
          method: 'POST',
          needAuth: true,
          body: { action: 'check_url', url: href },
        });
        if (envelope?.ok && envelope.data) {
          return {
            safe: envelope.data.safe !== false,
            threat: envelope.data.threat || null,
            checked: !!envelope.data.checked,
            reason: envelope.data.reason || null,
          };
        }
      }
    } catch (e) {
      /* fall through */
    }
    return { safe: true, checked: false, reason: 'unchecked' };
  }

  function openExternalUrl(url) {
    const href = normalizeHref(url);
    if (!href) return;
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }

  function showLeaveInterstitial(url, safety) {
    document.getElementById('leaveChaupaalSheet')?.remove();
    const unsafe = safety && safety.safe === false;
    const sheet = document.createElement('div');
    sheet.id = 'leaveChaupaalSheet';
    sheet.className = 'archive-overlay leave-chaupaal-sheet';
    sheet.setAttribute('data-nav-managed', '1');
    sheet.innerHTML = `
      <div class="leave-chaupaal-card">
        <div class="leave-chaupaal-mark" aria-hidden="true">${unsafe ? '!' : '↗'}</div>
        <h2>${unsafe ? tHtml('common.this_link_looks_unsafe') : tHtml('common.you_re_leaving_chaupaal')}</h2>
        <p class="leave-chaupaal-url">${escapeHtml(url)}</p>
        <p class="leave-chaupaal-copy">${
          unsafe
            ? safety.threat
              ? tHtml('common.flagged_as_threat_opening_is_not', { threat: escapeHtml(safety.threat) })
              : tHtml('common.this_url_was_flagged_by_our')
            : safety?.checked === false
              ? tHtml('common.links_open_in_your_browser_chaupaal')
              : tHtml('common.you_re_about_to_open_this')
        }</p>
        <div class="leave-chaupaal-actions">
          <button type="button" class="btn" data-leave-cancel>${tHtml('common.stay')}</button>
          <button type="button" class="btn ${unsafe ? '' : 'btn--primary'}" data-leave-open>${
            unsafe ? tHtml('common.open_anyway') : tHtml('common.open_link')
          }</button>
        </div>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      if (sheet.isConnected) sheet.remove();
    };
    if (typeof openLayer === 'function') openLayer(sheet, close, { remove: false });
    else if (typeof pushNavLayer === 'function') {
      sheet.dataset.navManaged = '1';
      pushNavLayer(sheet, close);
    }
    sheet.querySelector('[data-leave-cancel]')?.addEventListener('click', close);
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) close();
    });
    sheet.querySelector('[data-leave-open]')?.addEventListener('click', () => {
      openExternalUrl(url);
      close();
    });
  }

  async function handleExtLinkClick(e) {
    const a = e.target.closest?.('a.chaupaal-ext-link,[data-ext-url]');
    if (!a) return;
    const href = a.getAttribute('data-ext-url') || a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('/')) return;
    e.preventDefault();
    e.stopPropagation();
    const safety = await checkUrlSafety(href);
    showLeaveInterstitial(normalizeHref(href) || href, safety);
  }

  function wireOutboundLinks(root) {
    const el = root || document;
    if (el.dataset?.linkifyWired) return;
    if (el.dataset) el.dataset.linkifyWired = '1';
    el.addEventListener('click', handleExtLinkClick);
  }

  // Global capture so any dynamically rendered link works
  document.addEventListener('click', handleExtLinkClick, true);

  window.escapeHtmlText = escapeHtml;
  window.linkifyText = linkifyText;
  window.normalizeExternalHref = normalizeHref;
  window.checkUrlSafety = checkUrlSafety;
  window.showLeaveInterstitial = showLeaveInterstitial;
  window.wireOutboundLinks = wireOutboundLinks;
})();
