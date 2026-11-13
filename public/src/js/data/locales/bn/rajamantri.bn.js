/**
 * Bengali content for games/rajamantri-core.js — role names and the guesser’s call — locale data kept out of the default (English) file.
 * Loaded by the server with the packs, and in the browser only when Bengali content is needed
 * (Bengali UI or a room whose content language is Bengali — see dangal/content-locales.js).
 */
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else if (root.RajaMantriCore && typeof root.RajaMantriCore.applyLocale === 'function') root.RajaMantriCore.applyLocale('bn', data);
  else (root.__dangalPendingLocales = root.__dangalPendingLocales || []).push({ target: 'RajaMantriCore', lang: 'bn', data });
})(typeof self !== 'undefined' ? self : this, {"v":1,"lang":"bn","roles":{"raja":"রাজা","rani":"রানি","mantri":"মন্ত্রী","senapati":"সেনাপতি","daroga":"দারোগা","sipahi":"সিপাহি","chor":"চোর","daku":"ডাকাত"},"calls":{"mantri":"মন্ত্রী, চোর খুঁজে বের করো!","sipahi":"সিপাহি, চোরকে ধরো!"},"quote":"আমি রাজা!"});
