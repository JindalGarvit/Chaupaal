/**
 * Shared grabber half-sheet — same dismiss contract as the notif panel.
 * Prefer for small actions (find people, add category, pickers, etc.).
 * Uses openLayer when available; drag-down / backdrop / Escape / back all dismiss.
 */
(function () {
  'use strict';

  function tt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  /**
   * @param {object} opts
   * @param {string} [opts.id]
   * @param {string} [opts.title]
   * @param {string} [opts.bodyHtml]
   * @param {string} [opts.accent] peepal|duniya|baithak|dangal|akhbaar
   * @param {boolean} [opts.expand] taller sheet (notif-style) — default false half
   * @param {function} [opts.onMount] (sheet, close) => void
   * @param {boolean} [opts.scrim] default true
   * @returns {{ close: function, el: HTMLElement }}
   */
  function openHalfSheet(opts) {
    const o = opts || {};
    const id = o.id || 'cpHalfSheet';
    document.getElementById(id)?.remove();

    const sheet = document.createElement('div');
    sheet.id = id;
    sheet.className =
      'archive-overlay notif-panel-sheet cp-half-sheet is-opening' +
      (o.expand ? ' cp-half-sheet--expand' : ' cp-half-sheet--half');
    sheet.setAttribute('data-nav-managed', '1');
    sheet.setAttribute('data-sheet-panel', '1');
    if (o.accent) sheet.setAttribute('data-tab-accent', o.accent);

    const title = o.title || '';
    sheet.innerHTML = `
      <div class="notif-panel-grabber" aria-hidden="true"></div>
      <div class="archive-header">
        <div style="flex:1"><strong>${title}</strong></div>
        <button type="button" class="cp-half-sheet-close" data-overlay-dismiss aria-label="${tt('close', 'Close')}">✕</button>
      </div>
      <div class="cp-half-sheet-body" data-half-sheet-body></div>`;

    const body = sheet.querySelector('[data-half-sheet-body]');
    if (body && o.bodyHtml) body.innerHTML = o.bodyHtml;

    const host = document.querySelector('#device, .device') || document.body;
    host.appendChild(sheet);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('pointerdown', onOutside, true);
      try {
        if (layerHandle && typeof layerHandle.close === 'function') {
          layerHandle.close();
          return;
        }
      } catch (e) {}
      try {
        if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      } catch (e) {}
      sheet.remove();
    };

    let layerHandle = null;
    if (typeof openLayer === 'function') {
      layerHandle = openLayer(sheet, () => {
        closed = true;
        document.removeEventListener('pointerdown', onOutside, true);
        sheet.remove();
      });
    } else if (typeof pushNavLayer === 'function') {
      pushNavLayer(sheet, close);
    }

    const onOutside = (e) => {
      if (!sheet.isConnected) return;
      if (sheet.contains(e.target)) return;
      close();
    };
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);

    try {
      if (typeof enableSwipeDismiss === 'function') enableSwipeDismiss(sheet, close);
      else if (typeof window.enableSwipeDismiss === 'function') window.enableSwipeDismiss(sheet, close);
    } catch (e) {}

    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);

    try {
      if (typeof o.onMount === 'function') o.onMount(sheet, close);
    } catch (e) {
      if (typeof reportClientError === 'function') {
        reportClientError({ feature: 'half_sheet', message: String(e?.message || e) });
      }
    }

    setTimeout(() => sheet.classList.remove('is-opening'), 400);
    return { close, el: sheet };
  }

  window.openHalfSheet = openHalfSheet;
  if (window.ChaupaalNS) window.ChaupaalNS.openHalfSheet = openHalfSheet;
  else window.ChaupaalNS = { openHalfSheet };
})();
