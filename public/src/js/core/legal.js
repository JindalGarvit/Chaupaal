/**
 * Legal pages (Global L8) — DRAFTS, i18n-ready (English source in en.js `legal.*`).
 *
 *   terms · privacy · guidelines · teens · processors   (+ 'collects' stays in core/first-run.js)
 *
 * Every page carries the "Draft — requires legal review" banner and footer until counsel signs off;
 * nothing here is legal advice. Sections are [id, paragraph count] → keys legal.<doc>_<id>_h and
 * legal.<doc>_<id>_<n>, so a translator works paragraph by paragraph. Versions come from
 * core/compliance.js (TERMS_VERSION / POLICY_VERSION) — a bump re-asks acceptance.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChaupaalLegal = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DOCS = {
    terms: {
      version: 'terms',
      sections: [
        ['about', 2],
        ['eligibility', 3],
        ['account', 3],
        ['content', 3],
        ['rules', 2],
        ['chips', 3],
        ['ai', 2],
        ['safety', 2],
        ['ending', 3],
        ['liability', 2],
        ['changes', 2],
        ['law', 2],
        ['contact', 2],
      ],
    },
    privacy: {
      version: 'privacy',
      sections: [
        ['who', 3],
        ['collect', 9],
        ['use', 7],
        ['ai', 5],
        ['share', 4],
        ['transfers', 2],
        ['retention', 8],
        ['rights', 6],
        ['regional', 3],
        ['children', 2],
        ['security', 2],
        ['changes', 2],
        ['contact', 3],
      ],
    },
    guidelines: {
      version: 'terms',
      sections: [
        ['spirit', 1],
        ['respect', 3],
        ['safety', 4],
        ['honest', 3],
        ['privacy', 2],
        ['games', 2],
        ['enforce', 3],
      ],
    },
    teens: {
      version: 'privacy',
      sections: [
        ['age', 3],
        ['teen', 2],
        ['consent', 4],
        ['parents', 3],
        ['assurance', 2],
      ],
    },
    processors: { version: 'privacy', sections: [['intro', 2]], table: true },
  };

  /** Service providers (processors) — names are brands; purpose / data / where are catalog keys. */
  const PROCESSORS = [
    ['firebase', 'Google Firebase / Google Cloud'], // i18n-ignore (brand)
    ['analytics', 'Google Analytics for Firebase'], // i18n-ignore (brand)
    ['vercel', 'Vercel'], // i18n-ignore (brand)
    ['upstash', 'Upstash'], // i18n-ignore (brand)
    ['cloudinary', 'Cloudinary'], // i18n-ignore (brand)
    ['agora', 'Agora'], // i18n-ignore (brand)
    ['razorpay', 'Razorpay'], // i18n-ignore (brand)
    ['ai', 'Anthropic · OpenAI · xAI'], // i18n-ignore (brand)
    ['gemini', 'Google Gemini API'], // i18n-ignore (brand)
    ['translate', 'DeepL · Google Cloud Translation'], // i18n-ignore (brand)
    ['resend', 'Resend'], // i18n-ignore (brand)
    ['klipy', 'Klipy'], // i18n-ignore (brand)
    ['youtube', 'YouTube Data API'], // i18n-ignore (brand)
    ['music', 'Apple iTunes Search · JioSaavn'], // i18n-ignore (brand)
    ['webrisk', 'Google Web Risk'], // i18n-ignore (brand)
    ['osm', 'OpenStreetMap Nominatim'], // i18n-ignore (brand)
  ];

  const KINDS = Object.keys(DOCS);

  function keysFor(kind) {
    const d = DOCS[kind];
    if (!d) return [];
    const out = ['legal.' + kind + '_title'];
    d.sections.forEach(([id, n]) => {
      out.push(`legal.${kind}_${id}_h`);
      for (let i = 1; i <= n; i++) out.push(`legal.${kind}_${id}_${i}`);
    });
    if (d.table) {
      PROCESSORS.forEach(([id]) => out.push(`legal.proc_${id}_purpose`, `legal.proc_${id}_data`, `legal.proc_${id}_where`));
    }
    return out;
  }

  function versionOf(kind) {
    const C = typeof ChaupaalCompliance !== 'undefined' ? ChaupaalCompliance : null;
    if (!C) return '';
    return DOCS[kind] && DOCS[kind].version === 'terms' ? C.TERMS_VERSION : C.POLICY_VERSION;
  }

  /** HTML body for a legal page (no sheet chrome). tHtml escapes params; catalog text may carry <strong>. */
  function render(kind, tr) {
    const T = tr || (typeof tHtml === 'function' ? tHtml : (k) => k);
    const d = DOCS[kind];
    if (!d) return '';
    const banner = `<div class="legal-draft-banner" role="note" data-legal-draft>${T('legal.draft_banner')}</div>`;
    let html = banner;
    d.sections.forEach(([id, n]) => {
      html += `<h3 class="legal-v1-h">${T(`legal.${kind}_${id}_h`)}</h3>`;
      for (let i = 1; i <= n; i++) html += `<p>${T(`legal.${kind}_${id}_${i}`)}</p>`;
    });
    if (d.table) {
      html += `<div class="legal-proc-list">${PROCESSORS.map(
        ([id, name]) => `
          <div class="legal-proc">
            <strong>${name}</strong>
            <div><span class="legal-proc-k">${T('legal.proc_col_purpose')}</span> ${T(`legal.proc_${id}_purpose`)}</div>
            <div><span class="legal-proc-k">${T('legal.proc_col_data')}</span> ${T(`legal.proc_${id}_data`)}</div>
            <div><span class="legal-proc-k">${T('legal.proc_col_where')}</span> ${T(`legal.proc_${id}_where`)}</div>
          </div>`
      ).join('')}</div>`;
    }
    html += `<p class="legal-v1-note">${T('legal.version_line', { version: versionOf(kind) })}</p>`;
    html += `<footer class="legal-draft-footer" data-legal-draft>${T('legal.draft_footer')}</footer>`;
    return html;
  }

  return { DOCS, KINDS, PROCESSORS, keysFor, render, versionOf };
});
