/**
 * Professional profile badge — original circular mark (not a literal “P”).
 * Shown next to display names whenever profileType === 'professional'.
 */
(function () {
  'use strict';

  /** Stylized seal: outer ring + peepal-leaf / chaupaal stool silhouette */
  const BADGE_SVG = `<svg class="pro-badge-svg" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
    <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" stroke-width="1"/>
    <path d="M10 4.8c1.6 1.4 2.6 2.8 2.6 4.2 0 1.6-1.2 2.8-2.6 2.8S7.4 10.6 7.4 9c0-1.4 1-2.8 2.6-4.2z" fill="currentColor" opacity=".92"/>
    <path d="M7.2 14.2h5.6M8.4 14.2v1.2M11.6 14.2v1.2M10 12.2v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`;

  function isProfessionalType(typeOrUser) {
    if (typeOrUser && typeof typeOrUser === 'object') {
      const t = typeOrUser.profileType || typeOrUser.profile?.profileType;
      return String(t || '').toLowerCase() === 'professional';
    }
    return String(typeOrUser || '').toLowerCase() === 'professional';
  }

  function professionalBadgeHtml(opts) {
    const on = opts === true || isProfessionalType(opts);
    if (!on) return '';
    return `<span class="pro-badge" title="Professional" role="img" aria-label="Professional account">${BADGE_SVG}</span>`;
  }

  function formatDisplayNameHtml(name, profileTypeOrUser) {
    const esc =
      typeof escapeHtmlText === 'function'
        ? escapeHtmlText
        : (s) =>
            String(s ?? '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/"/g, '&quot;');
    const label = esc(name || 'Member');
    return `<span class="display-name-with-badge">${label}${professionalBadgeHtml(profileTypeOrUser)}</span>`;
  }

  function refreshProfessionalBadges(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-pro-badge-uid],[data-pro-badge-self]').forEach((el) => {
      const self = el.hasAttribute('data-pro-badge-self');
      const type = self
        ? typeof getProfileType === 'function'
          ? getProfileType()
          : 'personal'
        : el.dataset.proBadgeType || 'personal';
      const name = el.dataset.proBadgeName || '';
      if (name) el.innerHTML = formatDisplayNameHtml(name, type);
    });
  }

  document.addEventListener('chaupaal:profile-type-changed', () => refreshProfessionalBadges());

  window.professionalBadgeHtml = professionalBadgeHtml;
  window.formatDisplayNameHtml = formatDisplayNameHtml;
  window.isProfessionalType = isProfessionalType;
  window.refreshProfessionalBadges = refreshProfessionalBadges;
  window.PRO_BADGE_SVG = BADGE_SVG;
})();
