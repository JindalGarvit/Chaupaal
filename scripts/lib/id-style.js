/**
 * Indonesian style checks (Global L21): "kamu" in the UI, Indonesian (not Malaysian Malay) vocabulary,
 * no reduplicated plurals after counts.
 */
'use strict';

// Malaysian Malay words / spellings that read as foreign in Indonesia (Indonesian equivalent in the comment).
const MALAY_ONLY = [
  'telefon bimbit', // ponsel / HP
  'pejabat', // kantor
  'kerajaan', // pemerintah
  'percuma', // gratis
  'boleh jadi', // mungkin
  'tandas', // toilet
  'kereta', // mobil (kereta = train in id, car in ms — avoid ambiguity)
  'bas', // bus
  'polis', // polisi
  'wang', // uang
  'emel', // email
  'kata laluan', // kata sandi
  'muat turun', // unduh
  'muat naik', // unggah
  'tetapan', // pengaturan
  'aplikasi mudah alih', // aplikasi seluler
  'senarai', // daftar
  'cuba', // coba
  'betul', // benar
  'sahaja', // saja
  'anda boleh', // kamu bisa
  'kongsi', // bagikan
  'rakan', // teman
  'kawan-kawan', // teman-teman (kawan is fine alone, but prefer teman)
  'mesej', // pesan
  'pautan', // tautan
  'lelaki', // laki-laki / pria
  'perempuan', // fine in id too — not flagged below
];
const FLAG = MALAY_ONLY.filter((w) => w !== 'perempuan');
const MALAY_RE = new RegExp('(^|[^\\p{L}])(' + FLAG.join('|') + ')(?=$|[^\\p{L}])', 'iu');

function idStyleProblems(str, key) {
  const s = String(str || '')
    .replace(/\{\{@?\w+\}\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+|\S+@\S+\.\S+/g, ' ');
  const out = [];
  if (!/^legal\./.test(key || '') && /\b(Anda|anda)\b/.test(s)) out.push('"Anda" in the UI — address the user with "kamu"');
  const m = MALAY_RE.exec(s);
  if (m) out.push('Malaysian Malay "' + m[2] + '" — use the Indonesian word');
  if (/(#|\d|\}\})\s+(\p{L}+)-\2\b/u.test(String(str || ''))) out.push('reduplicated plural after a count — "3 pesan", not "3 pesan-pesan"');
  return out;
}

module.exports = { idStyleProblems, MALAY_ONLY: FLAG };
