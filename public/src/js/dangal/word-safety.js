/**
 * Word safety (Dangal P5) — one family-safe filter for game chat, custom word lists, AI word packs
 * and challenge words. Shared by the client and server (UMD). Deliberately conservative: it blocks
 * profanity, slurs and sexual terms (incl. simple leetspeak and spacing tricks); anything it lets
 * through can still be reported.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WordSafety = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Whole-word stems (matched at word starts, so "class" / "assess" / "scunthorpe" stay fine).
  const WORDS = [
    'fuck', 'fucking', 'fucker', 'fucked', 'fck', 'fuk', 'shit', 'shitty', 'bitch', 'bitchy', 'bastard', 'asshole',
    'arsehole', 'dick', 'dickhead', 'cock', 'pussy', 'cunt', 'slut', 'whore', 'wank', 'wanker', 'twat', 'bollocks',
    'motherf', 'jerkoff', 'dildo', 'porn', 'porno', 'nude', 'nudes', 'naked', 'sex', 'sexy', 'horny', 'boob', 'boobs',
    'tit', 'tits', 'titty', 'penis', 'vagina', 'anal', 'orgasm', 'cum', 'rape', 'raped', 'rapist', 'nazi', 'hitler',
    'kkk', 'retard', 'retarded', 'spastic', 'tranny', 'faggot', 'fag', 'dyke', 'chink', 'gook', 'spic', 'wetback',
    'kike', 'paki', 'coon', 'jigaboo', 'raghead', 'towelhead', 'suicide', 'kill yourself', 'kys', 'cocaine', 'heroin',
  ];
  // Slurs that are blocked even when letters are run together or padded ("n i g g a").
  // Matched on the run-together text; COMPACT_DEDUP also after squeezing repeats ("niiigga").
  // The n-word is not squeezed, or it would hit "Niger" / "Nigam".
  const COMPACT = ['nigger', 'nigga'];
  const COMPACT_DEDUP = ['fagot', 'motherfucker', 'fuck'];

  const LEET = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b' };

  function normalize(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[01!34@5$7+8]/g, (c) => LEET[c] || c);
  }

  // Whole words (plus a plural "s"): "tit" but not "title", "spic" but not "spicy", "cock" but not "cockpit".
  // 'motherf' is a prefix on purpose.
  const RE = new RegExp('(^|[^a-z])(' + WORDS.map((w) => w.replace(/ /g, '[^a-z]*')).join('|') + ')(?=s?(?:[^a-z]|$))', 'i');
  const PREFIX = /(^|[^a-z])motherf/;

  /** true when the text should be blocked. */
  function isBlocked(text) {
    const n = normalize(text);
    if (!n.trim()) return false;
    if (RE.test(n) || PREFIX.test(n)) return true;
    const compact = n.replace(/[^a-z]/g, '');
    if (COMPACT.some((w) => compact.indexOf(w) >= 0)) return true;
    const squeezed = compact.replace(/(.)\1+/g, '$1');
    return COMPACT_DEDUP.some((w) => squeezed.indexOf(w) >= 0);
  }

  /** Mask blocked words in a chat line (keeps the message readable). */
  function clean(text) {
    return String(text == null ? '' : text)
      .split(/(\s+)/)
      .map((tok) => (/\s/.test(tok) || !isBlocked(tok) ? tok : tok.charAt(0) + '•'.repeat(Math.max(1, tok.length - 1))))
      .join('');
  }

  return { isBlocked, clean, normalize };
});
