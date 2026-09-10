/**
 * Shabd Five identity helpers (Prompt 5) — reveal voice + local gloss.
 */
(function (g) {
  'use strict';

  function getShabdGloss(word) {
    const map = g.SHABD_GLOSS || {};
    const w = String(word || '')
      .trim()
      .toUpperCase();
    const line = map[w];
    if (!line) return '';
    return String(line).trim().slice(0, 80);
  }

  function shabdWinTitle(guesses) {
    const n = Number(guesses) || 0;
    if (n === 1) return 'Ek shot!';
    if (n === 2) return 'Shaandar!';
    if (n === 3) return 'Wah!';
    if (n === 4) return 'Brilliant!';
    if (n === 5) return 'Got there!';
    return 'Just in time!';
  }

  function shabdLoseTitle() {
    return 'Kal phir try';
  }

  /**
   * Build reveal bits for result sheet.
   * @returns {{ title: string, wordLine: string, gloss: string, voice: string }}
   */
  function buildShabdReveal(opts) {
    const o = opts || {};
    const won = !!o.won;
    const word = String(o.word || '')
      .trim()
      .toUpperCase();
    const guesses = Number(o.guesses) || 0;
    const hard = !!o.hard;
    const daily = o.daily !== false;
    const gloss = getShabdGloss(word);
    const title = won ? shabdWinTitle(guesses) : shabdLoseTitle();
    const wordLine = won
      ? 'The shabd was ' + word + (hard ? ' · Hard' : '')
      : 'The shabd was ' + word + (hard ? ' · Hard' : '');
    let voice = '';
    if (won) {
      if (guesses <= 2) voice = daily ? 'That Daily folded quick.' : 'Clean solve.';
      else if (guesses <= 4) voice = daily ? 'Nice read of today’s grid.' : 'Solid practice solve.';
      else voice = daily ? 'Clutch finish — streak stays honest.' : 'You hung in there.';
    } else {
      voice = daily
        ? 'Tomorrow brings a fresh five. No shame in this board.'
        : 'Practice is for learning — try another when ready.';
    }
    return { title, wordLine, gloss, voice, word, won };
  }

  function shabdRevealHtml(opts) {
    const r = buildShabdReveal(opts);
    const glossBit = r.gloss
      ? `<p class="shabd-reveal-gloss">${r.gloss.replace(/</g, '&lt;')}</p>`
      : '';
    return `<div class="shabd-reveal" role="status">
      <p class="shabd-reveal-word">${r.wordLine.replace(/</g, '&lt;')}</p>
      ${glossBit}
      <p class="shabd-reveal-voice">${r.voice.replace(/</g, '&lt;')}</p>
    </div>`;
  }

  g.getShabdGloss = getShabdGloss;
  g.buildShabdReveal = buildShabdReveal;
  g.shabdRevealHtml = shabdRevealHtml;
  g.shabdWinTitle = shabdWinTitle;
})(typeof window !== 'undefined' ? window : globalThis);
