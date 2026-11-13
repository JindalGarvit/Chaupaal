/**
 * Support resources shown in the Report flow (Global L9): self-harm helplines and child-safety
 * hotlines by country. Organisation names / numbers are public contact points — VERIFY BEFORE LAUNCH
 * (they change); unknown countries fall back to international directories.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChaupaalSafetyResources = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-11-13';
  // [name, contact, href]
  const SELF_HARM = {
    US: [['988 Suicide & Crisis Lifeline', '988', 'tel:988']], // i18n-ignore (org)
    CA: [['9-8-8 Suicide Crisis Helpline', '988', 'tel:988']], // i18n-ignore (org)
    GB: [['Samaritans', '116 123', 'tel:116123']], // i18n-ignore (org)
    IE: [['Samaritans', '116 123', 'tel:116123']], // i18n-ignore (org)
    IN: [['Tele-MANAS', '14416', 'tel:14416'], ['KIRAN', '1800-599-0019', 'tel:18005990019']], // i18n-ignore (org)
    DE: [['TelefonSeelsorge', '0800 111 0 111', 'tel:08001110111']], // i18n-ignore (org)
    FR: [['3114', '3114', 'tel:3114']], // i18n-ignore (org)
    AU: [['Lifeline', '13 11 14', 'tel:131114']], // i18n-ignore (org)
  };
  const SELF_HARM_DEFAULT = [['Find A Helpline', 'findahelpline.com', 'https://findahelpline.com']]; // i18n-ignore (org)
  const CHILD_SAFETY = {
    US: [['NCMEC CyberTipline', 'report.cybertip.org', 'https://report.cybertip.org']], // i18n-ignore (org)
    GB: [['Internet Watch Foundation', 'report.iwf.org.uk', 'https://report.iwf.org.uk']], // i18n-ignore (org)
    IN: [['National Cyber Crime Reporting Portal', 'cybercrime.gov.in', 'https://cybercrime.gov.in']], // i18n-ignore (org)
  };
  const CHILD_SAFETY_DEFAULT = [['INHOPE hotlines', 'inhope.org', 'https://www.inhope.org/EN']]; // i18n-ignore (org)

  function pick(map, def, country) {
    const c = String(country || '').toUpperCase();
    return (map[c] || def).map(([name, contact, href]) => ({ name, contact, href }));
  }
  return {
    CHECKED,
    selfHarm: (country) => pick(SELF_HARM, SELF_HARM_DEFAULT, country),
    childSafety: (country) => pick(CHILD_SAFETY, CHILD_SAFETY_DEFAULT, country),
  };
});
