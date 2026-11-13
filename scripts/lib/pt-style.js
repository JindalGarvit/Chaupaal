/**
 * Portuguese style checks (Global L19): Brazilian base, "você", inclusive without todxs / @ / e / slashes.
 * European wording lives in the pt-PT override layer, so the base must stay Brazilian: no tu-forms in UI copy
 * and no PT-only vocabulary (ecrã, telemóvel, ficheiro, utilizador, equipa …).
 */
'use strict';

// Slash / parenthesis / @ / x endings, plus the common neo-pronoun "e" forms (explicit list — "jogadores" is a normal plural).
const GENDER = /\b\p{L}+[oa]\/[ao]s?\b|\b\p{L}+\([ao]\)s?\b|\b\p{L}{2,}@s?\b|\b\p{L}{2,}xs?\b(?<!\b(?:sex|tex|fax|box|lux|max|fix|mix|pix|relax|tórax|xerox|duplex|index)s?\b)|\b(?:todes|amigues|bem-vinde|bem-vindes|convidades|usuáries|elus|delus)\b/iu;
const PT_ONLY = /\b(ecrã|ecrãs|telemóvel|telemóveis|ficheiro|ficheiros|utilizador|utilizadores|equipa|equipas|registo|registos|partilhar|partilha|contacto|contactos|guardar|autocarro)\b/iu;

function ptStyleProblems(str) {
  const s = String(str || '')
    .replace(/\{\{@?\w+\}\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+|\S+@\S+\.\S+/g, ' ');
  const out = [];
  if (GENDER.test(s)) out.push('gender form (o/a, @, x, e) — use a neutral construction');
  const m = PT_ONLY.exec(s);
  if (m) out.push('European-only word "' + m[1] + '" in the Brazilian base — use the BR word (pt-PT gets an override)');
  return out;
}

module.exports = { ptStyleProblems, PT_ONLY };
