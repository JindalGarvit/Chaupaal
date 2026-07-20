/**
 * Journal animations — act-based only (Section 7 / 4B).
 * Never react to journal *content*. Typing / finish / streak consistency only.
 */
(function () {
  'use strict';

  function ensureLayer() {
    let layer = document.getElementById('journalAnimLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'journalAnimLayer';
    layer.className = 'journal-anim-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.querySelector('.device')?.appendChild(layer);
    return layer;
  }

  function pulseJournalAmbient() {
    const layer = ensureLayer();
    const mote = document.createElement('span');
    mote.className = 'journal-mote';
    mote.style.left = 20 + Math.random() * 60 + '%';
    mote.style.bottom = 18 + Math.random() * 20 + '%';
    layer.appendChild(mote);
    setTimeout(() => mote.remove(), 900);
  }

  function playJournalFinishAnimation() {
    const layer = ensureLayer();
    const lantern = document.createElement('div');
    lantern.className = 'journal-lantern';
    lantern.innerHTML = '<span class="journal-lantern-glow"></span><span class="journal-lantern-body"></span>';
    layer.appendChild(lantern);
    if (typeof haptic === 'function') {
      try {
        haptic('success');
      } catch (e) {}
    }
    setTimeout(() => lantern.remove(), 1600);
    if (typeof showToast === 'function') showToast('Entry closed for tonight');
  }

  function updateJournalGrowthMotif(streak) {
    const n = Math.max(0, Number(streak) || 0);
    let motif = document.getElementById('journalGrowthMotif');
    if (!motif) {
      motif = document.createElement('div');
      motif.id = 'journalGrowthMotif';
      motif.className = 'journal-growth-motif';
      motif.setAttribute('aria-hidden', 'true');
      document.querySelector('.device')?.appendChild(motif);
    }
    motif.dataset.streak = String(n);
    motif.classList.add('journal-growth-motif--pulse');
    setTimeout(() => motif.classList.remove('journal-growth-motif--pulse'), 800);
  }

  window.pulseJournalAmbient = pulseJournalAmbient;
  window.playJournalFinishAnimation = playJournalFinishAnimation;
  window.updateJournalGrowthMotif = updateJournalGrowthMotif;
})();
