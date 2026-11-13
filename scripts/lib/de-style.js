/**
 * German style checks (Global L20): "du" in the UI, inclusive without Gendersternchen / colon / underscore / Binnen-I.
 */
'use strict';

const GENDER = /\p{L}[*:_](?:in|innen)\b|\p{Ll}(?:In|Innen)\b|\p{L}\/(?:in|innen|-in|-innen)\b|\(in\)|\(innen\)/u;
// Formal address in UI copy (legal.* may stay impersonal). "Sie" at a sentence start can mean "they"/"she" — only the
// clearly formal possessives / object forms are flagged, plus "Sie" followed by a verb-like lowercase word mid-sentence.
const FORMAL = /\b(Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)\b|[a-zäöüß,] Sie\b/u;

function deStyleProblems(str, key) {
  const s = String(str || '')
    .replace(/\{\{@?\w+\}\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+|\S+@\S+\.\S+/g, ' ');
  const out = [];
  if (GENDER.test(s)) out.push('gender form (*, :, _, Binnen-I, /in) — use a neutral form (Mitglieder, Teilnehmende, Personen)');
  if (!/^legal\./.test(key || '') && FORMAL.test(s)) out.push('formal "Sie/Ihr" — address the user with "du/dein"');
  if (/"[^"]+"/.test(s)) out.push('straight quotes — use „…“');
  return out;
}

module.exports = { deStyleProblems };
