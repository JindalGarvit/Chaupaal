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
    if (typeof ChaupaalFormat !== 'undefined') return ChaupaalFormat.formatRelative(ms, { now });
    const diff = Math.max(0, now - ms);
    if (diff < MINUTE) return t('common.just_now');
    if (diff < HOUR) return tn('common.minutes_ago', Math.floor(diff / MINUTE));
    if (diff < DAY) return tn('common.hours_ago', Math.floor(diff / HOUR));
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    if (ms >= dayStart.getTime() - DAY && ms < dayStart.getTime()) return t('common.yesterday');
    if (diff < 7 * DAY) return tn('common.days_ago', Math.floor(diff / DAY));
    if (diff < 30 * DAY) return tn('common.weeks_ago', Math.floor(diff / (7 * DAY)));
    try {
      return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); // i18n-format fallback
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

  function renderEmptyState(container, { icon = '📭', title = t('common.nothing_here_yet'), message = '', actionLabel = null, onAction = null, secondaryActions = null } = {}) {
    if (!container) return;
    const sec = Array.isArray(secondaryActions) ? secondaryActions : [];
    const secHtml = sec
      .map(
        (a, i) =>
          `<button type="button" class="btn btn--ghost ui-state-btn" data-ui-action="empty-sec" data-sec-i="${i}">${a.label || tHtml('common.more')}</button>`
      )
      .join('');
    container.innerHTML = `
      <div class="ui-state ui-state-empty">
        <div class="ui-state-icon">${icon}</div>
        <div class="ui-state-title">${title}</div>
        ${message ? `<div class="ui-state-msg">${message}</div>` : ''}
        <div class="ui-state-actions" style="display:flex;flex-direction:column;gap:8px;align-items:stretch;width:min(100%,280px);margin:12px auto 0;">
          ${actionLabel ? `<button type="button" class="btn btn--primary ui-state-btn" data-ui-action="empty">${actionLabel}</button>` : ''}
          ${secHtml}
        </div>
      </div>`;
    if (actionLabel && typeof onAction === 'function') {
      container.querySelector('[data-ui-action="empty"]')?.addEventListener('click', onAction);
    }
    container.querySelectorAll('[data-ui-action="empty-sec"]').forEach((btn) => {
      const i = Number(btn.dataset.secI);
      const act = sec[i];
      if (act && typeof act.onAction === 'function') btn.addEventListener('click', act.onAction);
    });
  }

  function renderErrorState(container, { icon = '⚠️', title = t('common.something_went_wrong'), message = t('common.please_try_again'), retryLabel = t('common.retry'), onRetry = null } = {}) {
    if (!container) return;
    container.innerHTML = `
      <div class="ui-state ui-state-error">
        <div class="ui-state-icon">${icon}</div>
        <div class="ui-state-title">${title}</div>
        <div class="ui-state-msg">${message}</div>
        ${onRetry ? `<button type="button" class="btn btn--primary ui-state-btn ui-state-btn-primary" data-ui-action="retry">${retryLabel}</button>` : ''}
      </div>`;
    if (typeof onRetry === 'function') {
      container.querySelector('[data-ui-action="retry"]')?.addEventListener('click', onRetry);
    }
  }

  /**
   * API envelope codes, Firestore codes and Firebase auth codes → one errors.<code> message.
   * Users see the translated message; the raw message stays in logs.
   */
  const ERROR_CODE_MAP = {
    OFFLINE: 'offline',
    VALIDATION_ERROR: 'validation',
    INVALID_JSON: 'bad_request',
    INVALID_ACTION: 'bad_request',
    UNKNOWN_ACTION: 'bad_request',
    INVALID_FEATURE: 'bad_request',
    METHOD_NOT_ALLOWED: 'bad_request',
    CONFIG_INVALID: 'bad_request',
    RATE_LIMITED: 'rate_limited',
    FORBIDDEN: 'forbidden',
    FIRESTORE_DENIED: 'forbidden',
    UNAUTHORIZED: 'sign_in_required',
    AUTH_REQUIRED: 'sign_in_required',
    INVALID_TOKEN: 'sign_in_required',
    TOKEN_INVALID: 'sign_in_required',
    API_KEY_MISSING: 'unavailable',
    NOT_FOUND: 'not_found',
    USER_NOT_FOUND: 'not_found',
    GONE: 'gone',
    REMOVED: 'gone',
    UNAVAILABLE: 'unavailable',
    AUTH_NOT_CONFIGURED: 'unavailable',
    AI_NOT_CONFIGURED: 'unavailable',
    AI_DISABLED: 'unavailable',
    GEMINI_NOT_CONFIGURED: 'unavailable',
    MEDIA_NOT_CONFIGURED: 'unavailable',
    FIREBASE_CONFIG: 'unavailable',
    FIRESTORE_UNAVAILABLE: 'unavailable',
    UPSTREAM_UNREACHABLE: 'unavailable',
    QUOTA_UNAVAILABLE: 'unavailable',
    RATE_LIMIT_UNAVAILABLE: 'unavailable',
    AI_TIMEOUT: 'timeout',
    INSUFFICIENT_FUNDS: 'insufficient_funds',
    TEEN_BLOCKED: 'teen_blocked',
    TIER_NOT_AVAILABLE: 'tier_not_available',
    DUPLICATE_REQUEST: 'duplicate_request',
    ALREADY_ANSWERED: 'already_answered',
    DAILY_LIMIT: 'limit_reached',
    WEEKLY_LIMIT: 'limit_reached',
    CAP_REACHED: 'limit_reached',
    BLOCKED_CHAT: 'blocked',
    'permission-denied': 'forbidden',
    unauthenticated: 'sign_in_required',
    'not-found': 'not_found',
    unavailable: 'network',
    'deadline-exceeded': 'timeout',
    'resource-exhausted': 'rate_limited',
    'already-exists': 'duplicate_request',
    'auth/network-request-failed': 'network',
    'auth/too-many-requests': 'rate_limited',
    'auth/wrong-password': 'auth_invalid_credentials',
    'auth/user-not-found': 'auth_invalid_credentials',
    'auth/invalid-credential': 'auth_invalid_credentials',
    'auth/invalid-login-credentials': 'auth_invalid_credentials',
    'auth/invalid-email': 'auth_invalid_email',
    'auth/email-already-in-use': 'auth_email_in_use',
    'auth/credential-already-in-use': 'auth_credential_in_use',
    'auth/account-exists-with-different-credential': 'auth_account_exists',
    'auth/provider-already-linked': 'auth_provider_linked',
    'auth/weak-password': 'auth_weak_password',
    'auth/requires-recent-login': 'auth_recent_login',
    'auth/user-disabled': 'auth_user_disabled',
    'auth/popup-closed-by-user': 'auth_popup_closed',
    'auth/cancelled-popup-request': 'auth_popup_closed',
    'auth/popup-blocked': 'auth_popup_blocked',
    'auth/invalid-phone-number': 'auth_invalid_phone',
    'auth/invalid-verification-code': 'auth_wrong_code',
    'auth/invalid-verification-id': 'auth_wrong_code',
    'auth/missing-verification-code': 'auth_missing_code',
    'auth/code-expired': 'auth_code_expired',
    'auth/quota-exceeded': 'auth_quota',
    'auth/captcha-check-failed': 'auth_captcha',
    'auth/invalid-app-credential': 'auth_captcha',
    'auth/operation-not-allowed': 'auth_disabled',
    'auth/expired-action-code': 'auth_link_expired',
    'auth/invalid-action-code': 'auth_link_expired',
  };

  function errorCode(err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    const code = String((err && (err.code || err.error?.code)) || '');
    if (ERROR_CODE_MAP[code]) return ERROR_CODE_MAP[code];
    const plain = code.replace(/^firestore\//, '');
    if (ERROR_CODE_MAP[plain]) return ERROR_CODE_MAP[plain];
    if (/^auth\//.test(code)) return 'auth_generic';
    const msg = String((err && (err.message || err.error?.message)) || (typeof err === 'string' ? err : ''));
    if (/permission|insufficient|unauth/i.test(msg)) return 'forbidden';
    if (/network|failed to fetch|timeout/i.test(msg)) return 'network';
    if (/not.?found|404/i.test(msg)) return 'not_found';
    return 'generic';
  }

  function friendlyError(err) {
    const code = errorCode(err);
    if (code === 'generic' && err && (err.message || err.code)) console.warn('[error]', err.code || '', err.message || err);
    return t('errors.' + code);
  }

  /** Known code → errors.<code>; otherwise the caller's own (translated) fallback. Never the raw message. */
  function errorText(err, fallback) {
    const code = errorCode(err);
    if (code !== 'generic') return t('errors.' + code);
    if (err && (err.message || err.code)) console.warn('[error]', err.code || '', err.message || err);
    return fallback || t('errors.generic');
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
        <span>${tHtml('common.offline_banner')}</span>`;
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
      if (typeof showToast === 'function') showToast(t('common.you_re_back_online'), 3000, { type: 'success' });
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
  window.errorCode = errorCode;
  window.errorText = errorText;
  window.ERROR_CODE_MAP = ERROR_CODE_MAP;
  window.initOfflineDetection = initOfflineDetection;
})();
