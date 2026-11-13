/**
 * Telugu content for games/rajamantri-core.js — role names and the guesser’s call — locale data kept out of the default (English) file.
 * Loaded by the server with the packs, and in the browser only when Telugu content is needed
 * (Telugu UI or a room whose content language is Telugu — see dangal/content-locales.js).
 */
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else if (root.RajaMantriCore && typeof root.RajaMantriCore.applyLocale === 'function') root.RajaMantriCore.applyLocale('te', data);
  else (root.__dangalPendingLocales = root.__dangalPendingLocales || []).push({ target: 'RajaMantriCore', lang: 'te', data });
})(typeof self !== 'undefined' ? self : this, {"v":1,"lang":"te","roles":{"raja":"రాజు","rani":"రాణి","mantri":"మంత్రి","senapati":"సేనాపతి","daroga":"కొత్వాల్","sipahi":"సిపాయి","chor":"దొంగ","daku":"బందిపోటు"},"calls":{"mantri":"మంత్రీ, దొంగను కనిపెట్టు!","sipahi":"సిపాయీ, దొంగను పట్టుకో!"},"quote":"నేనే రాజు!"});
