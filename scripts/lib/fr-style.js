/**
 * French style checks (Global L18): neutral international French, "tu" in the UI, inclusive without point médian.
 *   - no point médian / slash / parenthesis gender forms (utilisateur·rice, ami(e)s, inscrit/e)
 *   - "tu" everywhere in UI strings: no vous / votre / vos outside legal.* (privacy.* / moderation.* stay tu too)
 *   - no hand-typed space before ; : ! ? and no spaces inside « » — the runtime adds the right one per Region
 */
'use strict';

const GENDER = /\p{L}·\p{L}|\p{L}\.(?:e|es|rice|rices|euse|euses)\b|\b\p{L}+\((?:e|es|ne|nes)\)|\b\p{L}+\/(?:e|es|ne|nes|rice|euse)\b/u;
const VOUS = /\b(vous|votre|vos)\b/iu;

function frStyleProblems(str, key) {
  const s = String(str || '')
    .replace(/\{\{@?\w+\}\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+|\S+@\S+\.\S+/g, ' ');
  const out = [];
  if (GENDER.test(s)) out.push('gender form (·, /e, (e)) — use an epicene / neutral construction');
  if (!/^legal\./.test(key || '') && VOUS.test(s)) out.push('"vous" in the UI — address the user with "tu"');
  if (/[ \u00a0\u202f][;:!?]/.test(s) || /«[ \u00a0\u202f]|[ \u00a0\u202f]»/.test(s)) out.push('space before ; : ! ? or inside « » — write none, the app adds it per Region');
  return out;
}

module.exports = { frStyleProblems };
