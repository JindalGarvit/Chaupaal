/**
 * Horizontal section-mode swipe — cards/lists pass through; only true controls block.
 */
(function () {
  'use strict';

  const BLOCK_SEL = [
    'input',
    'textarea',
    'select',
    'button',
    'a',
    '[contenteditable="true"]',
    '[data-swipe-ignore]',
    '.peepal-intent-chips',
    '[data-khoj-chips]',
    '.peepal-nudge-chip',
    '.akhbaar-cat-bar',
    '.akhbaar-cat-chip',
    '.dangal-filter-row',
    '.dangal-filter-chip',
    '.dangal-manch-filters',
    '#cpMiniPlayer',
  ].join(', ');

  function shouldBlockSectionSwipe(target) {
    try {
      return !!(target && target.closest && target.closest(BLOCK_SEL));
    } catch (e) {
      return false;
    }
  }

  /**
   * @param {Element} root
   * @param {{
   *   onSwipe: (dir: -1|1, dx: number) => void,
   *   threshold?: number,
   *   extraIgnore?: (target: Element) => boolean,
   * }} opts
   */
  function wireSectionSwipe(root, opts) {
    if (!root || root.dataset.swipeWired) return;
    root.dataset.swipeWired = '1';
    const threshold = opts?.threshold ?? 44;

    let sx = 0;
    let sy = 0;
    let locked = null;
    let ignored = false;

    root.addEventListener(
      'touchstart',
      (e) => {
        ignored =
          shouldBlockSectionSwipe(e.target) || !!(typeof opts?.extraIgnore === 'function' && opts.extraIgnore(e.target));
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        locked = null;
      },
      { passive: true }
    );

    root.addEventListener(
      'touchmove',
      (e) => {
        if (ignored) return;
        const dx = e.touches[0].clientX - sx;
        const dy = e.touches[0].clientY - sy;
        if (!locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
          locked = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'h' : 'v';
        }
        if (locked === 'h') e.preventDefault();
      },
      { passive: false }
    );

    root.addEventListener(
      'touchend',
      (e) => {
        if (ignored || locked !== 'h') {
          locked = null;
          return;
        }
        const dx = (e.changedTouches[0]?.clientX || 0) - sx;
        locked = null;
        if (Math.abs(dx) < threshold) return;
        opts?.onSwipe?.(dx < 0 ? 1 : -1, dx);
      },
      { passive: true }
    );
  }

  window.SectionSwipe = { shouldBlockSectionSwipe, wireSectionSwipe };
  window.shouldBlockSectionSwipe = shouldBlockSectionSwipe;
  window.wireSectionSwipe = wireSectionSwipe;
})();
