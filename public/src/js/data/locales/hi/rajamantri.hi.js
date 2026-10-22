/**
 * Hindi content for games/rajamantri-core.js — role names and the guesser's call, kept out of the default file.
 * Loaded by the server with the core, and in the browser only when Hindi content is needed
 * (Hindi UI or a room whose content language is Hindi — see dangal/content-locales.js).
 */
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else if (root.RajaMantriCore && typeof root.RajaMantriCore.applyLocale === 'function') root.RajaMantriCore.applyLocale('hi', data);
  else (root.__dangalPendingLocales = root.__dangalPendingLocales || []).push({ target: 'RajaMantriCore', lang: 'hi', data });
})(typeof self !== 'undefined' ? self : this, {
  v: 1,
  lang: 'hi',
  roles: { raja: 'राजा', rani: 'रानी', mantri: 'मंत्री', senapati: 'सेनापति', daroga: 'दरोगा', sipahi: 'सिपाही', chor: 'चोर', daku: 'डाकू' },
  calls: { mantri: 'मंत्री, चोर का पता लगाओ!', sipahi: 'सिपाही, चोर को पकड़ो!' },
  quote: 'मैं राजा हूँ!',
});
