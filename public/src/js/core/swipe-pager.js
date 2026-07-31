/**
 * Horizontal swipe pager for tab sections (Vishwa/Lehar/Prasidha, Surkhiya/All/Saathi, etc.).
 * Center page is default. Emits `chaupaal:pagerchange` on the root element.
 * Within-tab only — never used for root bottom-tab switching.
 */
(function () {
  'use strict';

  const MOVE_THRESHOLD = 44;
  const EDGE_RESIST = 0.38;
  const VELOCITY_FLICK = 0.45; // px/ms

  function createSwipePager(root, { pages = [], initial = 0, onChange, edgeBounce = true } = {}) {
    if (!root || !pages.length) return null;
    let index = Math.max(0, Math.min(pages.length - 1, initial));
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let lastX = 0;
    let lastT = 0;
    let tracking = false;
    let locked = null; // 'h' | 'v'
    let dragging = false;

    root.classList.add('cp-swipe-pager');
    root.innerHTML = '';
    const track = document.createElement('div');
    track.className = 'cp-swipe-pager-track';
    pages.forEach((p, i) => {
      const page = document.createElement('div');
      page.className = 'cp-swipe-pager-page';
      page.dataset.page = p.id || String(i);
      if (p.el) page.appendChild(p.el);
      else if (p.html) page.innerHTML = p.html;
      track.appendChild(page);
    });
    root.appendChild(track);

    const dots = document.createElement('div');
    dots.className = 'cp-swipe-pager-dots';
    dots.setAttribute('aria-hidden', 'true');
    pages.forEach((p, i) => {
      const d = document.createElement('span');
      d.className = 'cp-swipe-pager-dot' + (i === index ? ' is-active' : '');
      d.dataset.i = String(i);
      if (p.label) d.title = p.label;
      dots.appendChild(d);
    });
    root.appendChild(dots);

    function paint(animate) {
      track.style.transition = animate === false ? 'none' : '';
      track.style.transform = `translate3d(${-index * 100}%,0,0)`;
      dots.querySelectorAll('.cp-swipe-pager-dot').forEach((d, i) => {
        d.classList.toggle('is-active', i === index);
      });
      const id = pages[index]?.id || String(index);
      root.dataset.activePage = id;
      root.dispatchEvent(
        new CustomEvent('chaupaal:pagerchange', { detail: { index, id, page: pages[index] } })
      );
      if (typeof onChange === 'function') onChange({ index, id, page: pages[index] });
    }

    function goTo(i, { animate = true } = {}) {
      const next = Math.max(0, Math.min(pages.length - 1, i));
      if (next === index && animate !== false) {
        paint(true);
        return;
      }
      index = next;
      paint(animate);
    }

    function resist(dx) {
      if (!edgeBounce) return dx;
      const atStart = index === 0 && dx > 0;
      const atEnd = index === pages.length - 1 && dx < 0;
      if (atStart || atEnd) return dx * EDGE_RESIST;
      return dx;
    }

    function onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Don't steal vertical scroll ownership from nested scrollers mid-gesture
      tracking = true;
      dragging = false;
      locked = null;
      startX = lastX = e.clientX;
      startY = e.clientY;
      startT = lastT = performance.now();
      track.style.transition = 'none';
      try {
        root.setPointerCapture(e.pointerId);
      } catch (err) {}
    }

    function onPointerMove(e) {
      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!locked) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        locked = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'h' : 'v';
        if (locked === 'v') {
          tracking = false;
          paint(true);
          return;
        }
      }
      if (locked !== 'h') return;
      dragging = true;
      e.preventDefault();
      lastX = e.clientX;
      lastT = performance.now();
      const w = Math.max(1, root.clientWidth);
      const pct = (resist(dx) / w) * 100;
      track.style.transform = `translate3d(${-index * 100 + pct}%,0,0)`;
    }

    function onPointerUp(e) {
      if (!tracking && !dragging) return;
      const wasDragging = dragging;
      tracking = false;
      dragging = false;
      const dx = e.clientX - startX;
      const dt = Math.max(1, performance.now() - startT);
      const recentDt = Math.max(1, performance.now() - lastT);
      const velocity = Math.abs(e.clientX - lastX) / recentDt;
      track.style.transition = '';
      if (locked === 'h' && wasDragging) {
        const flick = velocity > VELOCITY_FLICK && Math.abs(dx) > 18;
        const crossed = Math.abs(dx) > MOVE_THRESHOLD;
        if (flick || crossed) {
          goTo(index + (dx < 0 ? 1 : -1));
        } else {
          paint(true);
        }
      } else {
        paint(true);
      }
      locked = null;
    }

    root.addEventListener('pointerdown', onPointerDown, { passive: true });
    root.addEventListener('pointermove', onPointerMove, { passive: false });
    root.addEventListener('pointerup', onPointerUp, { passive: true });
    root.addEventListener('pointercancel', onPointerUp, { passive: true });

    paint(false);

    return {
      goTo,
      next: () => goTo(index + 1),
      prev: () => goTo(index - 1),
      index: () => index,
      pageId: () => pages[index]?.id,
      pages: () => pages.slice(),
      destroy() {
        root.innerHTML = '';
      },
    };
  }

  /** Engagement velocity window — large (7d) with friend-slot reservation. */
  const TREND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const TREND_FRIEND_SLOTS = 3;

  function engagementVelocity(item, now = Date.now()) {
    const ts = Number(item.ts || item.createdAtMs || item.updatedAtMs || 0);
    const ageH = Math.max(1, (now - ts) / 3600000);
    const likes = Number(item.likes || item.likeCount || 0);
    const comments = Number(item.comments || item.commentCount || 0);
    const reactions = Number(item.totalResponses || item.reactions || 0);
    return (likes * 1 + comments * 2.2 + reactions * 1.4) / Math.pow(ageH, 0.65);
  }

  function rankByVelocity(items, { friendUids = [], windowMs = TREND_WINDOW_MS, friendSlots = TREND_FRIEND_SLOTS } = {}) {
    const now = Date.now();
    const friendSet = new Set((friendUids || []).map(String));
    const fresh = (items || []).filter((it) => {
      const ts = Number(it.ts || it.createdAtMs || 0);
      return !ts || now - ts <= windowMs;
    });
    const scored = fresh
      .map((it) => ({ it, score: engagementVelocity(it, now), friend: friendSet.has(String(it.uid || it.user?.uid || '')) }))
      .sort((a, b) => b.score - a.score);
    const friends = scored.filter((x) => x.friend).slice(0, friendSlots);
    const rest = scored.filter((x) => !friends.includes(x));
    const out = [];
    const used = new Set();
    // Interleave: reserve early slots for friends, then fill by velocity
    let fi = 0;
    let ri = 0;
    while (out.length < scored.length) {
      if (fi < friends.length && (out.length < friendSlots || ri >= rest.length)) {
        const f = friends[fi++];
        if (!used.has(f.it)) {
          used.add(f.it);
          out.push(f.it);
        }
        continue;
      }
      if (ri < rest.length) {
        const r = rest[ri++];
        if (!used.has(r.it)) {
          used.add(r.it);
          out.push(r.it);
        }
        continue;
      }
      break;
    }
    return out;
  }

  window.createSwipePager = createSwipePager;
  window.rankByVelocity = rankByVelocity;
  window.engagementVelocity = engagementVelocity;
})();
