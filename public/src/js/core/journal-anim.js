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

  function plantSvg(stage) {
    // stage 0–5+: clearer growth from sprout → plant (act/streak only)
    if (stage <= 0) {
      return `<svg viewBox="0 0 40 48" width="36" height="44" aria-hidden="true">
        <ellipse cx="20" cy="44" rx="10" ry="3" fill="#8B7355" opacity=".5"/>
        <circle cx="20" cy="40" r="3" fill="#5FBA7D"/>
      </svg>`;
    }
    if (stage <= 2) {
      return `<svg viewBox="0 0 40 48" width="36" height="44" aria-hidden="true">
        <ellipse cx="20" cy="44" rx="11" ry="3" fill="#8B7355" opacity=".45"/>
        <path d="M20 42 V28" stroke="#2E8B57" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M20 34 Q12 30 10 24" fill="none" stroke="#5FBA7D" stroke-width="2" stroke-linecap="round"/>
        <ellipse cx="10" cy="23" rx="5" ry="3.2" fill="#5FBA7D" transform="rotate(-25 10 23)"/>
      </svg>`;
    }
    if (stage <= 4) {
      return `<svg viewBox="0 0 40 48" width="36" height="44" aria-hidden="true">
        <ellipse cx="20" cy="44" rx="12" ry="3.2" fill="#8B7355" opacity=".4"/>
        <path d="M20 42 V18" stroke="#2E8B57" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M20 30 Q10 26 8 18" fill="none" stroke="#33C481" stroke-width="2" stroke-linecap="round"/>
        <ellipse cx="8" cy="17" rx="6" ry="3.5" fill="#33C481" transform="rotate(-30 8 17)"/>
        <path d="M20 26 Q30 22 32 14" fill="none" stroke="#5FBA7D" stroke-width="2" stroke-linecap="round"/>
        <ellipse cx="32" cy="13" rx="6" ry="3.5" fill="#5FBA7D" transform="rotate(28 32 13)"/>
      </svg>`;
    }
    return `<svg viewBox="0 0 40 48" width="36" height="44" aria-hidden="true">
      <ellipse cx="20" cy="44" rx="13" ry="3.4" fill="#8B7355" opacity=".4"/>
      <path d="M20 42 V12" stroke="#2E8B57" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M20 28 Q8 24 6 14" fill="none" stroke="#33C481" stroke-width="2.1" stroke-linecap="round"/>
      <ellipse cx="6" cy="13" rx="7" ry="4" fill="#33C481" transform="rotate(-32 6 13)"/>
      <path d="M20 22 Q32 18 34 10" fill="none" stroke="#5FBA7D" stroke-width="2.1" stroke-linecap="round"/>
      <ellipse cx="34" cy="9" rx="7" ry="4" fill="#5FBA7D" transform="rotate(30 34 9)"/>
      <circle cx="20" cy="10" r="3.5" fill="#C9A227"/>
      <circle cx="20" cy="10" r="1.6" fill="#FFE66D"/>
    </svg>`;
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
    const stage = Math.min(6, n);
    motif.dataset.streak = String(n);
    motif.dataset.stage = String(stage);
    motif.innerHTML = plantSvg(stage);
    motif.classList.add('journal-growth-motif--pulse');
    setTimeout(() => motif.classList.remove('journal-growth-motif--pulse'), 800);
  }

  window.pulseJournalAmbient = pulseJournalAmbient;
  window.playJournalFinishAnimation = playJournalFinishAnimation;
  window.updateJournalGrowthMotif = updateJournalGrowthMotif;
})();
