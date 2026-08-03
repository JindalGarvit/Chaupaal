/**
 * Shared grabber half-sheet — resize across snap points + dismiss past floor.
 * Prefer for pickers, menus, pulse, Challenge, Duniya half-modals, etc.
 * Uses openLayer when available; backdrop / Escape / back all dismiss.
 */
(function () {
  'use strict';

  const SNAP_COMPACT = 0.3;
  const SNAP_MID = 0.52;
  const SNAP_TALL = 0.78;
  const DISMISS_FRAC = 0.28;
  const GRAB_ZONE_PX = 64;

  function tt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function sheetMaxPx(sheet) {
    const host = sheet.parentElement || document.querySelector('#device, .device') || document.documentElement;
    const h = host.clientHeight || window.innerHeight || 640;
    const safeTop = 48;
    return Math.max(220, h - safeTop);
  }

  function heightForSnap(sheet, snap) {
    const max = sheetMaxPx(sheet);
    const frac = snap === 'tall' ? SNAP_TALL : snap === 'compact' ? SNAP_COMPACT : SNAP_MID;
    const cap = snap === 'tall' ? 640 : snap === 'compact' ? 360 : 480;
    return Math.round(Math.min(max * frac, cap));
  }

  function applyHeight(sheet, px, animate) {
    const max = sheetMaxPx(sheet);
    const clamped = Math.max(Math.round(max * DISMISS_FRAC * 0.6), Math.min(max, Math.round(px)));
    sheet.style.height = clamped + 'px';
    sheet.style.maxHeight = max + 'px';
    if (animate) {
      sheet.style.transition = 'height 220ms var(--ease-spring, cubic-bezier(0.34, 1.4, 0.64, 1))';
    } else {
      sheet.style.transition = 'none';
    }
    const mid = heightForSnap(sheet, 'mid');
    const tall = heightForSnap(sheet, 'tall');
    const compact = heightForSnap(sheet, 'compact');
    let nearest = 'mid';
    const dist = { mid: Math.abs(clamped - mid), tall: Math.abs(clamped - tall), compact: Math.abs(clamped - compact) };
    if (dist.tall <= dist.mid && dist.tall <= dist.compact) nearest = 'tall';
    else if (dist.compact < dist.mid) nearest = 'compact';
    sheet.dataset.sheetSnap = nearest;
    sheet.classList.toggle('cp-half-sheet--expand', nearest === 'tall');
    sheet.classList.toggle('cp-half-sheet--half', nearest === 'mid' || nearest === 'compact');
    sheet.classList.toggle('cp-half-sheet--compact', nearest === 'compact');
    return clamped;
  }

  function nearestSnap(sheet, px) {
    const mid = heightForSnap(sheet, 'mid');
    const tall = heightForSnap(sheet, 'tall');
    const compact = heightForSnap(sheet, 'compact');
    const max = sheetMaxPx(sheet);
    if (px < max * DISMISS_FRAC) return 'dismiss';
    const dist = { mid: Math.abs(px - mid), tall: Math.abs(px - tall), compact: Math.abs(px - compact) };
    if (dist.tall <= dist.mid && dist.tall <= dist.compact) return 'tall';
    if (dist.compact < dist.mid) return 'compact';
    return 'mid';
  }

  /**
   * Drag grabber (or top strip) to resize mid ↔ tall; drag below floor dismisses.
   */
  function enableSheetResize(sheet, onDismiss) {
    if (!sheet || sheet.dataset.sheetResize === '1') return;
    sheet.dataset.sheetResize = '1';
    const grabber = sheet.querySelector('.notif-panel-grabber, .flag-sheet-handle, [data-sheet-grabber]');
    let startY = 0;
    let startH = 0;
    let active = false;
    let pointerId = null;

    function inGrabZone(clientY) {
      const rect = sheet.getBoundingClientRect();
      return clientY - rect.top <= GRAB_ZONE_PX;
    }

    function onDown(e) {
      if (e.button != null && e.button !== 0) return;
      const target = e.target;
      if (target.closest('button, a, input, textarea, select, [data-no-sheet-drag]')) return;
      const fromGrabber = !!(grabber && grabber.contains(target));
      const y = e.clientY ?? e.touches?.[0]?.clientY;
      if (y == null) return;
      if (!fromGrabber && !inGrabZone(y)) return;
      const body = sheet.querySelector('[data-half-sheet-body], .cp-half-sheet-body');
      if (!fromGrabber && body && body.scrollTop > 2) return;
      active = true;
      pointerId = e.pointerId;
      startY = y;
      startH = sheet.getBoundingClientRect().height;
      sheet.classList.add('is-dragging');
      try {
        if (e.pointerId != null) sheet.setPointerCapture(e.pointerId);
      } catch (err) {}
      e.preventDefault?.();
    }

    function onMove(e) {
      if (!active) return;
      if (pointerId != null && e.pointerId != null && e.pointerId !== pointerId) return;
      const y = e.clientY ?? e.touches?.[0]?.clientY;
      if (y == null) return;
      const dy = y - startY;
      // Drag down shrinks; drag up grows
      applyHeight(sheet, startH - dy, false);
    }

    function onUp(e) {
      if (!active) return;
      if (pointerId != null && e.pointerId != null && e.pointerId !== pointerId) return;
      active = false;
      pointerId = null;
      sheet.classList.remove('is-dragging');
      const h = sheet.getBoundingClientRect().height;
      const snap = nearestSnap(sheet, h);
      if (snap === 'dismiss') {
        if (typeof onDismiss === 'function') onDismiss();
        return;
      }
      applyHeight(sheet, heightForSnap(sheet, snap), true);
      setTimeout(() => {
        sheet.style.transition = '';
      }, 240);
    }

    sheet.addEventListener('pointerdown', onDown, { passive: false });
    sheet.addEventListener('pointermove', onMove, { passive: true });
    sheet.addEventListener('pointerup', onUp, { passive: true });
    sheet.addEventListener('pointercancel', onUp, { passive: true });
  }

  /**
   * @param {object} opts
   * @param {string} [opts.id]
   * @param {string} [opts.title]
   * @param {string} [opts.bodyHtml]
   * @param {string} [opts.accent] peepal|duniya|baithak|dangal|akhbaar
   * @param {boolean} [opts.expand] start at tall snap — default mid
   * @param {'mid'|'tall'} [opts.snap] explicit start snap
   * @param {function} [opts.onMount] (sheet, close) => void
   * @param {boolean} [opts.scrim] default true (outside tap dismisses)
   * @returns {{ close: function, el: HTMLElement, setSnap: function }}
   */
  function openHalfSheet(opts) {
    const o = opts || {};
    const id = o.id || 'cpHalfSheet';
    document.getElementById(id)?.remove();

    const startSnap = o.snap || (o.expand ? 'tall' : 'mid');
    const sheet = document.createElement('div');
    sheet.id = id;
    sheet.className =
      'archive-overlay notif-panel-sheet cp-half-sheet is-opening' +
      (startSnap === 'tall'
        ? ' cp-half-sheet--expand'
        : startSnap === 'compact'
          ? ' cp-half-sheet--half cp-half-sheet--compact'
          : ' cp-half-sheet--half');
    sheet.setAttribute('data-nav-managed', '1');
    sheet.setAttribute('data-sheet-panel', '1');
    sheet.dataset.sheetSnap = startSnap;
    if (o.accent) sheet.setAttribute('data-tab-accent', o.accent);

    const title = o.title || '';
    sheet.innerHTML = `
      <div class="notif-panel-grabber" data-sheet-grabber aria-hidden="true"></div>
      <div class="archive-header">
        <div style="flex:1;min-width:0;"><strong>${title}</strong></div>
        <button type="button" class="cp-half-sheet-close" data-overlay-dismiss aria-label="${tt('close', 'Close')}">✕</button>
      </div>
      <div class="cp-half-sheet-body" data-half-sheet-body></div>`;

    const body = sheet.querySelector('[data-half-sheet-body]');
    if (body && o.bodyHtml) body.innerHTML = o.bodyHtml;

    const host = document.querySelector('#device, .device') || document.body;
    host.appendChild(sheet);
    applyHeight(sheet, heightForSnap(sheet, startSnap), false);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('pointerdown', onOutside, true);
      try {
        if (layerHandle && typeof layerHandle.close === 'function') {
          layerHandle.close();
          try {
            if (typeof restoreAppShell === 'function') restoreAppShell('half_sheet:' + id);
          } catch (e) {}
          return;
        }
      } catch (e) {}
      try {
        if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      } catch (e) {}
      sheet.remove();
      try {
        if (typeof restoreAppShell === 'function') restoreAppShell('half_sheet:' + id);
      } catch (e) {}
    };

    let layerHandle = null;
    if (typeof openLayer === 'function') {
      layerHandle = openLayer(sheet, () => {
        closed = true;
        document.removeEventListener('pointerdown', onOutside, true);
        sheet.remove();
        try {
          if (typeof restoreAppShell === 'function') restoreAppShell('half_sheet_layer:' + id);
        } catch (e) {}
      });
    } else if (typeof pushNavLayer === 'function') {
      pushNavLayer(sheet, close);
    }

    const onOutside = (e) => {
      if (o.scrim === false) return;
      if (!sheet.isConnected) return;
      if (sheet.contains(e.target)) return;
      close();
    };
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);

    enableSheetResize(sheet, close);

    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);

    try {
      if (typeof o.onMount === 'function') o.onMount(sheet, close);
    } catch (e) {
      if (typeof reportClientError === 'function') {
        reportClientError({ feature: 'half_sheet', message: String(e?.message || e) });
      }
    }

    setTimeout(() => sheet.classList.remove('is-opening'), 400);
    return {
      close,
      el: sheet,
      setSnap: (snap) =>
        applyHeight(sheet, heightForSnap(sheet, snap === 'tall' ? 'tall' : snap === 'compact' ? 'compact' : 'mid'), true),
    };
  }

  window.openHalfSheet = openHalfSheet;
  window.enableSheetResize = enableSheetResize;
  if (window.ChaupaalNS) {
    window.ChaupaalNS.openHalfSheet = openHalfSheet;
    window.ChaupaalNS.enableSheetResize = enableSheetResize;
  } else {
    window.ChaupaalNS = { openHalfSheet, enableSheetResize };
  }
})();
