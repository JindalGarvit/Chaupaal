/**
 * Hindi-leak detector for Marathi (Global L15). Marathi and Hindi share Devanagari, so Hindi function words slip into
 * Marathi strings unnoticed. Flags whole tokens that are Hindi-only (Marathi equivalent in the comment).
 * Genuine overlaps are not listed: का (Marathi "why?"), की ("that / or"), ही, ते, तर, पण, आणि … are fine.
 */
'use strict';

const HINDI_ONLY = new Set([
  'है', 'हैं', 'था', 'थे', 'थी', 'थीं', // आहे / आहेत / होता …
  'नहीं', // नाही
  'में', // मध्ये
  'लिए', // साठी
  'के', // चे / च्या
  'और', // आणि
  'भी', // ही / सुद्धा
  'लेकिन', 'मगर', // पण
  'क्या', // काय
  'यह', 'वह', 'ये', 'वो', 'इस', 'उस', 'इसे', 'उसे', 'इसका', 'उसका', // हे / ते …
  'मैं', 'हूँ', 'हूं', 'हम', 'तुम', // मी / आम्ही / तुम्ही
  'आप', 'आपका', 'आपकी', 'आपके', 'आपको', // तुम्ही / तुमचा …
  'अपना', 'अपनी', 'अपने', // आपला / आपली / आपले
  'करें', 'करो', 'कीजिए', // करा
  'रहा', 'रही', 'रहे', 'गया', 'गई', 'गए', 'गयी', // … होत आहे / गेला …
  'सकते', 'सकता', 'सकती', // शकता
  'चाहिए', 'चाहते', 'चाहता', // हवे / पाहिजे
  'जब', 'तब', 'अभी', 'कभी', // जेव्हा / तेव्हा / आता / कधी
  'कुछ', 'बहुत', 'सब', 'सभी', // काही / खूप / सर्व
  'यहाँ', 'यहां', 'वहाँ', 'वहां', 'कैसे', 'कौन', 'किसी', 'किसे', // इथे / तिथे / कसे / कोण
  'तक', 'बाद', 'पहले', 'साथ', 'वाला', 'वाली', 'वाले', // पर्यंत / नंतर / आधी / सोबत
  'होगा', 'होगी', 'होंगे', 'हुआ', 'हुई', 'हुए', // होईल / झाले
  'दें', 'लें', 'देखें', 'चुनें', // द्या / घ्या / पाहा / निवडा
]);

/** Hindi-only tokens found in a Marathi string (after removing {{tokens}}, tags and ICU syntax). */
function hindiLeaks(str) {
  const bare = String(str || '')
    .replace(/\{\{@?\w+\}\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/g, ' ');
  const out = [];
  bare.split(/[^\p{L}\p{M}]+/u).forEach((tok) => {
    if (tok && HINDI_ONLY.has(tok) && out.indexOf(tok) < 0) out.push(tok);
  });
  return out;
}

module.exports = { HINDI_ONLY, hindiLeaks };
