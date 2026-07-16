/**
 * Shared UI-state helpers (Phase 1).
 *
 * Design notes:
 * - Skeletons replace generic spinners for content-shaped loading (feeds, cards).
 *   Intentional "working" animations (e.g. game AI thinking) can stay as-is.
 * - Relative time is centralized so Baithak / Peepal / Duniya stay consistent.
 * - Empty / error / retry are small HTML factories — screens own when to mount them.
 * - Offline banner listens to browser online/offline events (no polling).
 */
(function () {
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  function toMillis(input) {
    if (input == null || input === '') return null;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (input instanceof Date) return input.getTime();
    if (typeof input?.toMillis === 'function') return input.toMillis(); // Firestore Timestamp
    if (typeof input?.toDate === 'function') return input.toDate().getTime();
    if (typeof input === 'string') {
      const short = input.trim().toLowerCase();
      if (short === 'just now' || short === 'now') return Date.now();
      const rel = short.match(/^(\d+)\s*(m|min|mins|h|hr|hrs|d|day|days|w|wk|wks)$/);
      if (rel) {
        const n = parseInt(rel[1], 10);
        const u = rel[2][0];
        const mult = u === 'm' ? MINUTE : u === 'h' ? HOUR : u === 'd' ? DAY : 7 * DAY;
        return Date.now() - n * mult;
      }
      const parsed = Date.parse(input);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return null;
  }

  /**
   * Human-friendly relative time.
   * Accepts epoch ms, Date, Firestore Timestamp, ISO string, or shorthand ("2h", "just now").
   */
  function formatRelativeTime(input, now = Date.now()) {
    const ms = toMillis(input);
    if (ms == null) return typeof input === 'string' ? input : '';
    const diff = Math.max(0, now - ms);
    if (diff < 45 * 1000) return 'Just now';
    if (diff < MINUTE) return 'Just now';
    if (diff < HOUR) {
      const m = Math.floor(diff / MINUTE);
      return m === 1 ? '1 min ago' : `${m} min ago`;
    }
    if (diff < DAY) {
      const h = Math.floor(diff / HOUR);
      return h === 1 ? '1 hour ago' : `${h} hours ago`;
    }
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    if (ms >= dayStart.getTime() - DAY && ms < dayStart.getTime()) return 'Yesterday';
    if (diff < 7 * DAY) {
      const d = Math.floor(diff / DAY);
      return d === 1 ? '1 day ago' : `${d} days ago`;
    }
    if (diff < 30 * DAY) {
      const w = Math.floor(diff / (7 * DAY));
      return w === 1 ? '1 week ago' : `${w} weeks ago`;
    }
    try {
      return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  // Alias used by existing call sites (baithak-chat had timeAgoStr)
  function timeAgoStr(ts) {
    return formatRelativeTime(ts);
  }

  function skeletonHtml(variant = 'card', count = 1) {
    const pieces = [];
    for (let i = 0; i < count; i++) {
      if (variant === 'feed') {
        pieces.push(`
          <div class="skeleton-wrap skeleton-feed">
            <div class="skeleton skeleton-block" style="height:180px;border-radius:0;"></div>
            <div style="padding:12px 14px;">
              <div class="skeleton" style="height:13px;width:78%;margin-bottom:8px;"></div>
              <div class="skeleton" style="height:11px;width:48%;"></div>
            </div>
          </div>`);
      } else if (variant === 'list') {
        pieces.push(`
          <div class="skeleton-wrap skeleton-list" style="display:flex;gap:12px;align-items:center;padding:12px 0;">
            <div class="skeleton" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;"></div>
            <div style="flex:1;">
              <div class="skeleton" style="height:12px;width:55%;margin-bottom:8px;"></div>
              <div class="skeleton" style="height:10px;width:35%;"></div>
            </div>
          </div>`);
      } else if (variant === 'detail') {
        pieces.push(`
          <div class="skeleton-wrap skeleton-detail" style="padding:8px 0;">
            <div class="skeleton" style="height:18px;width:40%;margin-bottom:16px;"></div>
            <div class="skeleton" style="height:12px;width:100%;margin-bottom:8px;"></div>
            <div class="skeleton" style="height:12px;width:92%;margin-bottom:8px;"></div>
            <div class="skeleton" style="height:12px;width:70%;margin-bottom:18px;"></div>
            <div class="skeleton" style="height:44px;width:100%;border-radius:12px;margin-bottom:10px;"></div>
            <div class="skeleton" style="height:44px;width:100%;border-radius:12px;"></div>
          </div>`);
      } else if (variant === 'match') {
        pieces.push(`
          <div class="skeleton-wrap" style="text-align:center;padding:24px 16px;">
            <div class="skeleton" style="width:72px;height:72px;border-radius:50%;margin:0 auto 16px;"></div>
            <div class="skeleton" style="height:14px;width:55%;margin:0 auto 10px;"></div>
            <div class="skeleton" style="height:11px;width:40%;margin:0 auto;"></div>
          </div>`);
      } else {
        // card (default)
        pieces.push(`
          <div class="skeleton-wrap skeleton-card" style="background:var(--white);border-radius:20px;padding:16px;margin-bottom:12px;">
            <div style="display:flex;gap:10px;margin-bottom:12px;">
              <div class="skeleton" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;"></div>
              <div style="flex:1;">
                <div class="skeleton" style="height:13px;width:60%;margin-bottom:8px;"></div>
                <div class="skeleton" style="height:11px;width:40%;"></div>
              </div>
            </div>
            <div class="skeleton" style="height:11px;width:100%;margin-bottom:6px;"></div>
            <div class="skeleton" style="height:11px;width:90%;margin-bottom:6px;"></div>
            <div class="skeleton" style="height:11px;width:65%;"></div>
          </div>`);
      }
    }
    return `<div class="ui-skeleton-stack" aria-busy="true" aria-live="polite">${pieces.join('')}</div>`;
  }

  function createSkeleton(rows = 3, variant = 'card') {
    // Keep polish.js API: rows maps loosely to count for card stacks
    const count = variant === 'card' ? Math.max(1, Math.min(rows, 5)) : 1;
    const wrap = document.createElement('div');
    wrap.innerHTML = skeletonHtml(variant === 'feed' ? 'feed' : 'card', count);
    return wrap.firstElementChild || wrap;
  }

  function renderSkeleton(container, { variant = 'card', count = 3 } = {}) {
    if (!container) return;
    container.innerHTML = skeletonHtml(variant, count);
  }

  function renderEmptyState(container, { icon = '📭', title = 'Nothing here yet', message = '', actionLabel = null, onAction = null } = {}) {
    if (!container) return;
    container.innerHTML = `
      <div class="ui-state ui-state-empty">
        <div class="ui-state-icon">${icon}</div>
        <div class="ui-state-title">${title}</div>
        ${message ? `<div class="ui-state-msg">${message}</div>` : ''}
        ${actionLabel ? `<button type="button" class="ui-state-btn" data-ui-action="empty">${actionLabel}</button>` : ''}
      </div>`;
    if (actionLabel && typeof onAction === 'function') {
      container.querySelector('[data-ui-action="empty"]')?.addEventListener('click', onAction);
    }
  }

  function renderErrorState(container, { icon = '⚠️', title = 'Something went wrong', message = 'Please try again.', retryLabel = 'Retry', onRetry = null } = {}) {
    if (!container) return;
    container.innerHTML = `
      <div class="ui-state ui-state-error">
        <div class="ui-state-icon">${icon}</div>
        <div class="ui-state-title">${title}</div>
        <div class="ui-state-msg">${message}</div>
        ${onRetry ? `<button type="button" class="ui-state-btn ui-state-btn-primary" data-ui-action="retry">${retryLabel}</button>` : ''}
      </div>`;
    if (typeof onRetry === 'function') {
      container.querySelector('[data-ui-action="retry"]')?.addEventListener('click', onRetry);
    }
  }

  function friendlyError(err) {
    if (!navigator.onLine) return 'You appear to be offline. Check your connection and try again.';
    const msg = (err && (err.message || err.code || String(err))) || '';
    if (/permission|insufficient|unauth/i.test(msg)) return "You don't have access to do that. Try signing in again.";
    if (/network|fetch|Failed to fetch|timeout/i.test(msg)) return 'Network hiccup — please try again in a moment.';
    if (/not.?found|404/i.test(msg)) return "We couldn't find that. It may have been removed.";
    return 'Something went wrong. Please try again.';
  }

  function ensureOfflineBanner() {
    const root = document.querySelector('.device') || document.body;
    let banner = document.getElementById('offlineBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offlineBanner';
      banner.className = 'offline-banner hidden';
      banner.setAttribute('role', 'status');
      banner.innerHTML = `
        <span class="offline-banner-dot"></span>
        <span>You're offline — some actions may not work</span>`;
      root.insertBefore(banner, root.firstChild);
    }
    return banner;
  }

  function setOfflineUi(offline) {
    const banner = ensureOfflineBanner();
    banner.classList.toggle('hidden', !offline);
    document.documentElement.classList.toggle('is-offline', offline);
  }

  function initOfflineDetection() {
    ensureOfflineBanner();
    setOfflineUi(!navigator.onLine);
    window.addEventListener('online', () => {
      setOfflineUi(false);
      if (typeof showToast === 'function') showToast("You're back online ✓");
    });
    window.addEventListener('offline', () => setOfflineUi(true));
  }

  // Globals (classic script app — no bundler/modules yet)
  window.formatRelativeTime = formatRelativeTime;
  window.timeAgoStr = timeAgoStr;
  window.skeletonHtml = skeletonHtml;
  window.createSkeleton = createSkeleton;
  window.renderSkeleton = renderSkeleton;
  window.renderEmptyState = renderEmptyState;
  window.renderErrorState = renderErrorState;
  window.friendlyError = friendlyError;
  window.initOfflineDetection = initOfflineDetection;
})();
