/**
 * Spanish style checks (Global L17): neutral international Spanish with inclusive, tú-based address.
 *   - no "o/a", "@", "x" or "e" gender endings (Bienvenido/a, amig@s, todxs, todes)
 *   - no vosotros forms (vosotros, vuestro, os + verb … Latin-America-leaning, "ustedes" for plural address)
 *   - no regionalisms that are rude or confusing somewhere (coger, concha, pisto, ...)
 *   - balanced ¿…? and ¡…!
 */
'use strict';

// Slash / parenthesis / @ / x endings and the common neo-pronoun "e" forms (explicit list — "jugadores" is a normal plural).
const GENDER_SLASH = /\b\p{L}+[oa]\/[ao]s?\b|\b\p{L}+\(a\)|\b\p{L}{2,}@s?\b|\b(?:tod|amig|nuev|invitad|bienvenid|usuari|jugador)xs?\b|\b(?:todes|amigues|nueves|invitades|bienvenides|usuaries|elles)\b/iu;
const VOSOTROS = /\b(vosotros|vosotras|vuestro|vuestra|vuestros|vuestras|sois|estáis|tenéis|podéis|queréis|habéis|hacéis|vais)\b/iu;
const REGIONALISMS = ['coger', 'coge', 'cogen', 'coges', 'cogí', 'cogió', 'cogido', 'cogemos', 'cógelo', 'concha', 'pisto', 'chingar', 'chingón', 'cachar', 'pinche', 'boludo', 'guay', 'mola', 'ordenador', 'gilipollas', 'tío', 'tía', 'vale'];
const REGION_RE = new RegExp('(^|[^\\p{L}])(' + REGIONALISMS.join('|') + ')(?=$|[^\\p{L}])', 'iu');

function esStyleProblems(str) {
  const s = String(str || '')
    .replace(/\{\{@?\w+\}\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+|\S+@\S+\.\S+/g, ' ');
  const out = [];
  if (GENDER_SLASH.test(s)) out.push('gender form (o/a, @, x, e) — use a neutral construction');
  if (VOSOTROS.test(s)) out.push('vosotros form — use tú / ustedes');
  const m = REGION_RE.exec(s);
  if (m) out.push('regionalism "' + m[2] + '" — use a neutral word');
  const opens = (s.match(/¿/g) || []).length;
  const closes = (s.match(/\?/g) || []).length;
  if (closes > opens) out.push('missing opening ¿');
  if ((s.match(/!/g) || []).length > (s.match(/¡/g) || []).length) out.push('missing opening ¡');
  return out;
}

module.exports = { esStyleProblems, REGIONALISMS };
