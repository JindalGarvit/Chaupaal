/**
 * Mehfil effects layer — collision-aware reactions, stickers, confetti.
 * Free only; pointer-events none on layer.
 */
(function () {
  'use strict';

  const LANES = 5;
  const MAX_ACTIVE = 12;
  const active = [];
  let queue = [];
  let draining = false;

  function reducedMotion() {
    try {
      if (typeof quietMode !== 'undefined' && quietMode) return true;
      return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch (e) {
      return false;
    }
  }

  function layerEl(root) {
    return (root || document).querySelector?.('[data-mehfil-effects-layer]') || null;
  }

  function pruneActive() {
    const now = Date.now();
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].until <= now) active.splice(i, 1);
    }
  }

  function laneFree(lane, y) {
    return !active.some((a) => a.lane === lane && Math.abs(a.y - y) < 48);
  }

  function pickLane(preferredX) {
    const layer = layerEl();
    const w = layer?.clientWidth || 320;
    const start = preferredX != null ? Math.floor((preferredX / w) * LANES) : Math.floor(Math.random() * LANES);
    for (let i = 0; i < LANES; i++) {
      const lane = (start + i) % LANES;
      if (laneFree(lane, 0.75)) return lane;
    }
    return start % LANES;
  }

  function spawn(opts) {
    const layer = layerEl(opts.root);
    if (!layer) return;
    pruneActive();
    if (active.length >= MAX_ACTIVE) {
      queue.push(opts);
      drainQueue();
      return;
    }
    const lane = pickLane(opts.x);
    const el = document.createElement('div');
    const kind = opts.kind || 'reaction';
    el.className = `mehfil-fx mehfil-fx--${kind}${reducedMotion() ? ' mehfil-fx--reduced' : ''}`;
    el.textContent = opts.emoji || opts.text || '✨';
    if (opts.label && !reducedMotion()) {
      const cap = document.createElement('span');
      cap.className = 'mehfil-fx-label';
      cap.textContent = opts.label;
      el.appendChild(cap);
    }
    const pct = ((lane + 0.5) / LANES) * 100;
    el.style.left = `${pct}%`;
    layer.appendChild(el);
    const until = Date.now() + (kind === 'sticker' ? 3200 : 2500);
    active.push({ lane, y: 0.75, until });
    setTimeout(() => el.remove(), kind === 'sticker' ? 3200 : 2500);
    if (kind === 'confetti' && typeof launchConfetti === 'function' && !reducedMotion()) {
      try {
        launchConfetti({ count: 24, origin: { x: pct / 100, y: 0.85 } });
      } catch (e) {}
    }
  }

  function drainQueue() {
    if (draining) return;
    draining = true;
    const tick = () => {
      pruneActive();
      if (!queue.length || active.length >= MAX_ACTIVE) {
        draining = false;
        return;
      }
      spawn(queue.shift());
      setTimeout(tick, 200);
    };
    setTimeout(tick, 150);
  }

  window.MehfilEffects = {
    burstReaction(emoji, opts) {
      spawn({ kind: 'reaction', emoji, ...(opts || {}) });
      if (emoji === '🎉') spawn({ kind: 'confetti', emoji: '✨', ...(opts || {}) });
    },
    burstSticker(emoji, opts) {
      spawn({ kind: 'sticker', emoji, ...(opts || {}) });
      if (emoji === '✨') spawn({ kind: 'confetti', emoji: '✨', ...(opts || {}) });
    },
    spawn,
  };
})();
