/**
 * Tamil content for games/rajamantri-core.js — role names and the guesser’s call — locale data kept out of the default (English) file.
 * Loaded by the server with the packs, and in the browser only when Tamil content is needed
 * (Tamil UI or a room whose content language is Tamil — see dangal/content-locales.js).
 */
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else if (root.RajaMantriCore && typeof root.RajaMantriCore.applyLocale === 'function') root.RajaMantriCore.applyLocale('ta', data);
  else (root.__dangalPendingLocales = root.__dangalPendingLocales || []).push({ target: 'RajaMantriCore', lang: 'ta', data });
})(typeof self !== 'undefined' ? self : this, {"v":1,"lang":"ta","roles":{"raja":"ராஜா","rani":"ராணி","mantri":"மந்திரி","senapati":"சேனாதிபதி","daroga":"இன்ஸ்பெக்டர்","sipahi":"போலீஸ்","chor":"திருடன்","daku":"கொள்ளைக்காரன்"},"calls":{"mantri":"மந்திரி, திருடனைக் கண்டுபிடியுங்கள்!","sipahi":"போலீஸ், திருடனைப் பிடியுங்கள்!"},"quote":"நான்தான் ராஜா!"});
