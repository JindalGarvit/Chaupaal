/**
 * Urdu content for games/rajamantri-core.js — role names and the guesser’s call — locale data kept out of the default (English) file.
 * Loaded by the server with the packs, and in the browser only when Urdu content is needed
 * (Urdu UI or a room whose content language is Urdu — see dangal/content-locales.js).
 */
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else if (root.RajaMantriCore && typeof root.RajaMantriCore.applyLocale === 'function') root.RajaMantriCore.applyLocale('ur', data);
  else (root.__dangalPendingLocales = root.__dangalPendingLocales || []).push({ target: 'RajaMantriCore', lang: 'ur', data });
})(typeof self !== 'undefined' ? self : this, {"v":1,"lang":"ur","roles":{"raja":"بادشاہ","rani":"ملکہ","mantri":"وزیر","senapati":"سپہ سالار","daroga":"داروغہ","sipahi":"سپاہی","chor":"چور","daku":"ڈاکو"},"calls":{"mantri":"وزیر، چور کا پتا لگاؤ!","sipahi":"سپاہی، چور کو پکڑو!"},"quote":"میں بادشاہ ہوں!"});
