/**
 * Shabd Five result voice + gloss (Dangal P5). Gloss keys are ShabdCore.wordHash(word).
 */
(function (g) {
  'use strict';

  const tr = (key, fallback) => (typeof g.t === 'function' ? g.t('shabd.' + key, fallback) : fallback);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function getShabdGloss(word) {
    const map = g.SHABD_GLOSS || {};
    const key = g.ShabdCore ? g.ShabdCore.wordHash(word) : '';
    const line = map[key];
    return line ? String(line).trim().slice(0, 80) : '';
  }

  const WIN = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
  function shabdWinTitle(guesses) {
    const n = Math.max(1, Math.min(6, Number(guesses) || 6));
    return tr('win' + n, WIN[n - 1]);
  }

  /** @returns {{ title, wordLine, gloss, voice, word, won }} */
  function buildShabdReveal(opts) {
    const o = opts || {};
    const won = !!o.won;
    const word = String(o.word || '').trim().toUpperCase();
    const guesses = Number(o.guesses) || 0;
    const mode = o.mode || (o.daily === false ? 'practice' : 'daily');
    const gloss = getShabdGloss(word);
    const title = won ? shabdWinTitle(guesses) : tr('lose', 'Out of guesses');
    const wordLine = tr('wordWas', 'The word was') + ' ' + word + (o.hard ? ' · ' + tr('hard', 'Hard') : '');
    let voice;
    if (won) voice = guesses <= 2 ? tr('voiceFast', 'Lightning read.') : guesses <= 4 ? tr('voiceMid', 'Nicely solved.') : tr('voiceLate', 'Clutch finish.');
    else voice = mode === 'daily' ? tr('voiceDailyLose', 'A fresh puzzle arrives at midnight.') : tr('voicePracticeLose', 'Try another — practice makes perfect.');
    return { title, wordLine, gloss, voice, word, won };
  }

  function shabdRevealHtml(opts) {
    const r = buildShabdReveal(opts);
    return `<div class="shabd-reveal" role="status">
      <p class="shabd-reveal-word">${esc(r.wordLine)}</p>
      ${r.gloss ? `<p class="shabd-reveal-gloss">${esc(r.gloss)}</p>` : ''}
      <p class="shabd-reveal-voice">${esc(r.voice)}</p>
    </div>`;
  }

  g.getShabdGloss = getShabdGloss;
  g.buildShabdReveal = buildShabdReveal;
  g.shabdRevealHtml = shabdRevealHtml;
  g.shabdWinTitle = shabdWinTitle;
})(typeof window !== 'undefined' ? window : globalThis);
