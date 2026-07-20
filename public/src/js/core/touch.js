/**
 * Shared touch & responsive interactions — lightbox, gestures, PTR, long-press, keyboard.
 * Load after overlay-scope.js.
 */
(function () {
  'use strict';

  const TAP_MIN = 44;
  const LONG_MS = 480;
  const SWIPE_DISMISS_PX = 90;
  const SWIPE_BACK_PX = 72;

  function deviceRoot() {
    return document.querySelector('.device') || document.body;
  }

  function hapticLight() {
    try {
      if (typeof haptic === 'function') haptic('light');
    } catch (e) {}
  }

  // ─── Context action sheet ─────────────────────────────────────────────────
  function showActionSheet(title, actions) {
    const existing = document.getElementById('cpActionSheet');
    if (existing) existing.remove();
    const sheet = document.createElement('div');
    sheet.id = 'cpActionSheet';
    sheet.className = 'cp-action-sheet';
    sheet.innerHTML = `
      <div class="cp-action-backdrop" data-dismiss="1"></div>
      <div class="cp-action-panel" role="menu">
        ${title ? `<div class="cp-action-title">${title}</div>` : ''}
        ${(actions || [])
          .map(
            (a, i) =>
              `<button type="button" class="cp-action-item ${a.danger ? 'cp-action-item--danger' : ''}" data-i="${i}"><span class="cp-action-label">${a.label}</span>${
                a.hint ? `<span class="cp-action-hint">${a.hint}</span>` : ''
              }</button>`
          )
          .join('')}
        <button type="button" class="cp-action-item cp-action-cancel" data-dismiss="1">Cancel</button>
      </div>`;
    deviceRoot().appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('cp-action-sheet--open'));
    const close = () => {
      sheet.classList.remove('cp-action-sheet--open');
      setTimeout(() => sheet.remove(), 220);
    };
    sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-dismiss]')) {
        close();
        return;
      }
      const btn = e.target.closest('[data-i]');
      if (!btn) return;
      const i = +btn.dataset.i;
      const act = actions[i];
      close();
      if (act && typeof act.fn === 'function') {
        try {
          act.fn();
        } catch (err) {}
      }
    });
    enableSwipeDismiss(sheet.querySelector('.cp-action-panel'), close);
  }

  // ─── Image viewer (pinch + double-tap + swipe-down) ────────────────────────
  function openImageViewer(src, opts) {
    if (!src) return;
    const o = opts || {};
    const existing = document.getElementById('cpImageViewer');
    if (existing) existing.remove();

    let scale = 1;
    let tx = 0;
    let ty = 0;
    let lastTap = 0;
    let pointers = new Map();
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let dragStartY = 0;
    let dragging = false;

    const root = document.createElement('div');
    root.id = 'cpImageViewer';
    root.className = 'cp-image-viewer';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Image viewer');
    root.innerHTML = `
      <button type="button" class="cp-image-close game-tap-target" aria-label="Close">✕</button>
      <div class="cp-image-stage">
        <img class="cp-image-img" src="${src}" alt="${o.alt || ''}" draggable="false">
      </div>
      <div class="cp-image-hint">Pinch or double-tap to zoom · swipe down to close</div>`;
    deviceRoot().appendChild(root);
    requestAnimationFrame(() => root.classList.add('cp-image-viewer--open'));

    const img = root.querySelector('.cp-image-img');
    const stage = root.querySelector('.cp-image-stage');

    function applyTransform() {
      img.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
    }

    function close() {
      root.classList.remove('cp-image-viewer--open');
      setTimeout(() => root.remove(), 220);
    }

    root.querySelector('.cp-image-close').addEventListener('click', close);
    root.addEventListener('click', (e) => {
      if (e.target === root || e.target === stage) close();
    });

    function dist(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.hypot(dx, dy);
    }

    stage.addEventListener(
      'pointerdown',
      (e) => {
        stage.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) {
          dragStartY = e.clientY;
          dragging = scale <= 1.05;
          const now = Date.now();
          if (now - lastTap < 280) {
            if (scale > 1.1) {
              scale = 1;
              tx = 0;
              ty = 0;
            } else {
              scale = 2.2;
              const rect = stage.getBoundingClientRect();
              tx = (rect.width / 2 - e.clientX) * 0.4;
              ty = (rect.height / 2 - e.clientY) * 0.4;
            }
            applyTransform();
            hapticLight();
            lastTap = 0;
          } else lastTap = now;
        } else if (pointers.size === 2) {
          dragging = false;
          const pts = [...pointers.values()];
          pinchStartDist = dist(pts[0], pts[1]) || 1;
          pinchStartScale = scale;
        }
      },
      { passive: true }
    );

    stage.addEventListener(
      'pointermove',
      (e) => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
          const pts = [...pointers.values()];
          const d = dist(pts[0], pts[1]);
          scale = Math.min(4, Math.max(1, pinchStartScale * (d / pinchStartDist)));
          applyTransform();
        } else if (dragging && scale <= 1.05) {
          const dy = e.clientY - dragStartY;
          ty = Math.max(0, dy);
          img.style.opacity = String(Math.max(0.35, 1 - Math.abs(dy) / 320));
          applyTransform();
        } else if (scale > 1.05 && pointers.size === 1) {
          // pan while zoomed — simple follow
          const p = pointers.get(e.pointerId);
          // handled via incremental — skip complex pan for stability
        }
      },
      { passive: true }
    );

    function endPointer(e) {
      if (dragging && scale <= 1.05) {
        if (ty > SWIPE_DISMISS_PX) {
          close();
          return;
        }
        ty = 0;
        img.style.opacity = '1';
        applyTransform();
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStartDist = 0;
      dragging = false;
    }
    stage.addEventListener('pointerup', endPointer);
    stage.addEventListener('pointercancel', endPointer);

    // wheel zoom (desktop)
    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        scale = Math.min(4, Math.max(1, scale * (e.deltaY < 0 ? 1.08 : 0.92)));
        if (scale <= 1) {
          tx = 0;
          ty = 0;
        }
        applyTransform();
      },
      { passive: false }
    );

    window.openImageViewer = openImageViewer;
    return { close };
  }

  // ─── Swipe dismiss (bottom sheets) ────────────────────────────────────────
  function enableSwipeDismiss(panel, onDismiss) {
    if (!panel || panel.dataset.swipeDismiss === '1') return;
    panel.dataset.swipeDismiss = '1';
    let startY = 0;
    let curY = 0;
    let active = false;

    panel.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        const rect = panel.getBoundingClientRect();
        // only from top handle area (~56px) or when scrolled to top
        if (t.clientY - rect.top > 56 && panel.scrollTop > 0) return;
        startY = t.clientY;
        curY = 0;
        active = true;
        panel.style.transition = 'none';
      },
      { passive: true }
    );

    panel.addEventListener(
      'touchmove',
      (e) => {
        if (!active) return;
        curY = Math.max(0, e.touches[0].clientY - startY);
        panel.style.transform = `translateY(${curY}px)`;
      },
      { passive: true }
    );

    panel.addEventListener(
      'touchend',
      () => {
        if (!active) return;
        active = false;
        panel.style.transition = '';
        if (curY > SWIPE_DISMISS_PX) {
          if (typeof onDismiss === 'function') onDismiss();
          else panel.closest('.cp-action-sheet,.cp-sheet')?.remove() || panel.remove();
        } else {
          panel.style.transform = '';
        }
        curY = 0;
      },
      { passive: true }
    );
  }

  // ─── Swipe back (edge) ────────────────────────────────────────────────────
  function enableSwipeBack(el, onBack) {
    if (!el || el.dataset.swipeBack === '1') return;
    el.dataset.swipeBack = '1';
    let startX = 0;
    let startY = 0;
    let active = false;
    let dx = 0;

    el.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        if (t.clientX > 28) return; // left edge only
        startX = t.clientX;
        startY = t.clientY;
        active = true;
        dx = 0;
      },
      { passive: true }
    );

    el.addEventListener(
      'touchmove',
      (e) => {
        if (!active) return;
        const t = e.touches[0];
        const adx = t.clientX - startX;
        const ady = Math.abs(t.clientY - startY);
        if (ady > 40 && Math.abs(adx) < ady) {
          active = false;
          el.style.transform = '';
          return;
        }
        dx = Math.max(0, adx);
        el.style.transition = 'none';
        el.style.transform = `translateX(${dx}px)`;
      },
      { passive: true }
    );

    el.addEventListener(
      'touchend',
      () => {
        if (!active) return;
        active = false;
        el.style.transition = '';
        if (dx > SWIPE_BACK_PX) {
          if (typeof onBack === 'function') onBack();
          else {
            const btn = el.querySelector(
              '#chatBack,.chat-back,[data-overlay-dismiss],#chessBack,#wgBack,#kkBack,#firBack,#busBack,#scribbleBack,#rrBack,#cbBack,#tttBack,#unoBack,#ludoBack,#slBack'
            );
            if (btn) btn.click();
            else el.remove();
          }
        } else {
          el.style.transform = '';
        }
        dx = 0;
      },
      { passive: true }
    );
  }

  // ─── Pull to refresh ──────────────────────────────────────────────────────
  function enablePullToRefresh(scrollEl, onRefresh) {
    if (!scrollEl || scrollEl.dataset.ptr === '1') return;
    scrollEl.dataset.ptr = '1';
    let startY = 0;
    let pulling = false;
    let dy = 0;
    const indicator = document.createElement('div');
    indicator.className = 'cp-ptr-indicator';
    indicator.textContent = 'Pull to refresh';
    scrollEl.prepend(indicator);

    scrollEl.addEventListener(
      'touchstart',
      (e) => {
        if (scrollEl.scrollTop > 2) return;
        startY = e.touches[0].clientY;
        pulling = true;
        dy = 0;
      },
      { passive: true }
    );

    scrollEl.addEventListener(
      'touchmove',
      (e) => {
        if (!pulling) return;
        if (scrollEl.scrollTop > 2) {
          pulling = false;
          indicator.style.height = '0';
          return;
        }
        dy = Math.max(0, e.touches[0].clientY - startY);
        if (dy > 8) {
          indicator.style.height = Math.min(64, dy * 0.45) + 'px';
          indicator.textContent = dy > 70 ? 'Release to refresh' : 'Pull to refresh';
        }
      },
      { passive: true }
    );

    scrollEl.addEventListener(
      'touchend',
      async () => {
        if (!pulling) return;
        pulling = false;
        const should = dy > 70;
        dy = 0;
        if (!should) {
          indicator.style.height = '0';
          return;
        }
        indicator.style.height = '48px';
        indicator.textContent = 'Refreshing…';
        hapticLight();
        try {
          await Promise.resolve(onRefresh && onRefresh());
        } catch (e) {}
        indicator.textContent = 'Updated';
        setTimeout(() => {
          indicator.style.height = '0';
        }, 500);
      },
      { passive: true }
    );
  }

  // ─── Long press ───────────────────────────────────────────────────────────
  function onLongPress(el, handler) {
    if (!el || el.dataset.longPress === '1') return;
    el.dataset.longPress = '1';
    let timer = null;
    let moved = false;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const start = (e) => {
      moved = false;
      clear();
      timer = setTimeout(() => {
        timer = null;
        hapticLight();
        handler(e);
      }, LONG_MS);
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('mousedown', start);
    el.addEventListener(
      'touchmove',
      () => {
        moved = true;
        clear();
      },
      { passive: true }
    );
    el.addEventListener('touchend', clear);
    el.addEventListener('touchcancel', clear);
    el.addEventListener('mouseup', clear);
    el.addEventListener('mouseleave', clear);
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      handler(e);
    });
  }

  // ─── Keyboard avoidance ───────────────────────────────────────────────────
  function setupKeyboardAvoidance() {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const apply = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb-inset', offset + 'px');
      document.documentElement.classList.toggle('kb-open', offset > 80);
      const focused = document.activeElement;
      if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA') && offset > 40) {
        try {
          focused.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (e) {}
        const bar = focused.closest('.chat-input-bar, .cp-composer, form');
        if (bar) bar.classList.add('cp-kb-lift');
      }
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    document.addEventListener('focusin', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        setTimeout(apply, 50);
        setTimeout(apply, 300);
      }
    });
    document.addEventListener('focusout', () => {
      setTimeout(() => {
        if (!document.activeElement || (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA')) {
          document.documentElement.style.setProperty('--kb-inset', '0px');
          document.documentElement.classList.remove('kb-open');
          document.querySelectorAll('.cp-kb-lift').forEach((el) => el.classList.remove('cp-kb-lift'));
        }
      }, 80);
    });
  }

  // ─── Message / post long-press menus ──────────────────────────────────────
  function messageActions(bubble) {
    const text = (bubble.textContent || '').trim();
    const isMe = bubble.classList.contains('me');
    const actions = [
      {
        label: 'Copy',
        fn: () => {
          if (navigator.clipboard && text) navigator.clipboard.writeText(text).catch(() => {});
          if (typeof showToast === 'function') showToast('Copied');
        },
      },
      {
        label: 'Reply',
        fn: () => {
          const input = document.getElementById('chatMsgInput');
          if (input) {
            input.value = (input.value ? input.value + ' ' : '') + (text ? `↩️ ${text.slice(0, 80)} ` : '');
            input.focus();
          }
        },
      },
    ];
    if (isMe) {
      actions.push({
        label: 'Delete',
        danger: true,
        fn: () => {
          const row = bubble.closest('.msg-row');
          if (row) row.remove();
          if (typeof showToast === 'function') showToast('Message removed');
        },
      });
    }
    showActionSheet('Message', actions);
  }

  function postActions(postEl) {
    const caption = postEl.querySelector('.duniya-post-caption')?.textContent || '';
    const img = postEl.querySelector('.duniya-post-media img');
    const actions = [
      {
        label: 'Share',
        fn: () => {
          const shareBtn = postEl.querySelector('.share-btn');
          if (shareBtn) shareBtn.click();
          else if (typeof showToast === 'function') showToast('Share');
        },
      },
      {
        label: 'Copy caption',
        fn: () => {
          if (navigator.clipboard && caption) navigator.clipboard.writeText(caption).catch(() => {});
          if (typeof showToast === 'function') showToast('Copied');
        },
      },
    ];
    if (img && (img.dataset.full || img.src)) {
      actions.unshift({
        label: 'View image',
        fn: () => openImageViewer(img.dataset.full || img.currentSrc || img.src),
      });
    }
    const more = postEl.querySelector('.duniya-more-btn');
    if (more) {
      actions.push({
        label: 'Report / block',
        danger: true,
        fn: () => more.click(),
      });
    }
    const del = postEl.querySelector('.duniya-delete-btn');
    if (del) {
      actions.push({
        label: 'Delete post',
        danger: true,
        fn: () => del.click(),
      });
    }
    showActionSheet('Post', actions);
  }

  // ─── Bindings ─────────────────────────────────────────────────────────────
  function bindZoomableImages(root) {
    const scope = root || document;
    scope.querySelectorAll('img:not([data-no-zoom]):not(.cp-image-img)').forEach((img) => {
      if (img.dataset.zoomBound === '1') return;
      // Duniya feed media uses dedicated expand + double-tap-to-like — never auto-bind.
      if (img.closest('.duniya-post-media') || img.closest('.duniya-expand-media')) return;
      // Skip tiny decorative / icons
      const w = img.width || img.naturalWidth || 0;
      const h = img.height || img.naturalHeight || 0;
      const inMedia =
        img.closest(
          '.peepal-card, .story-viewer, .auth-photo-preview, .duniya-post-avatar, .profile-photo, .chat-messages-area, .duniya-story-ring, .msg-row'
        ) || img.classList.contains('zoomable');
      if (!inMedia && w > 0 && w < 48 && h < 48) return;
      if (!inMedia && !img.closest('.duniya-post, .peepal-feed, #profileContent, .chat-screen')) return;
      if (img.closest('.duniya-post-avatar, .msg-avatar-small, .tab-btn, .story-ring')) return;
      img.dataset.zoomBound = '1';
      img.classList.add('cp-zoomable');
      img.addEventListener('click', (e) => {
        if (img.closest('a,button')) return;
        e.preventDefault();
        e.stopPropagation();
        openImageViewer(img.dataset.full || img.currentSrc || img.src, { alt: img.alt });
      });
    });
  }

  function bindLongPressTargets(root) {
    const scope = root || document;
    scope.querySelectorAll('.msg-bubble').forEach((b) => {
      if (b.dataset.lpBound) return;
      b.dataset.lpBound = '1';
      onLongPress(b, () => messageActions(b));
    });
    scope.querySelectorAll('.duniya-post').forEach((p) => {
      if (p.dataset.lpBound) return;
      p.dataset.lpBound = '1';
      onLongPress(p, (e) => {
        if (e.target && e.target.closest('button,a,input,.duniya-action-btn')) return;
        postActions(p);
      });
    });
  }

  function bindSwipeTargets() {
    const chat = document.getElementById('activeChatScreen');
    if (chat) {
      enableSwipeBack(chat, () => {
        const btn = document.getElementById('chatBack');
        if (btn) btn.click();
      });
    }
    document.querySelectorAll('.chat-screen, .game-overlay, .muqabala-overlay, .onboarding-overlay').forEach((el) => {
      enableSwipeBack(el);
    });
    document.querySelectorAll('.cp-sheet-panel, .duniya-post-sheet, .share-sheet, [data-sheet-panel]').forEach((panel) => {
      const dismiss = () => {
        const close =
          panel.querySelector('[data-dismiss],.sheet-close,#closeCreator,#closeGP,#closeDuniyaStorySheet') ||
          panel.parentElement?.querySelector('.sheet-close');
        if (close) close.click();
        else panel.remove();
      };
      enableSwipeDismiss(panel, dismiss);
    });
    // Heuristic: absolute bottom sheets without prior binding
    document.querySelectorAll('.device > div').forEach((el) => {
      if (el.dataset.swipeDismiss === '1') return;
      const st = el.style && el.style.cssText;
      if (st && /bottom:\s*0/.test(st) && /border-radius:\s*24px/.test(st)) {
        enableSwipeDismiss(el, () => el.remove());
      }
    });
  }

  function bindPullToRefresh() {
    const duniya = document.getElementById('duniyaFeed');
    if (duniya) {
      enablePullToRefresh(duniya, async () => {
        if (typeof loadDuniyaPage === 'function') {
          await loadDuniyaPage({ reset: true });
          if (typeof renderDuniyaFeed === 'function') renderDuniyaFeed();
        } else if (typeof renderDuniyaFeed === 'function') renderDuniyaFeed();
      });
    }
    const peepal = document.getElementById('peepalFeed');
    if (peepal) {
      enablePullToRefresh(peepal, async () => {
        if (typeof renderPeepalFeed === 'function') renderPeepalFeed();
      });
    }
    const akhbaar = document.getElementById('panel-akhbaar') || document.getElementById('reelStage');
    if (akhbaar && !akhbaar.dataset.ptr) {
      // Soft PTR: snap to top reel
      enablePullToRefresh(akhbaar, async () => {
        const stage = document.getElementById('reelStage');
        if (stage) stage.scrollTo({ top: 0, behavior: 'smooth' });
        if (typeof showToast === 'function') showToast('Akhbaar refreshed');
      });
    }
  }

  function enhanceTapTargets() {
    document.querySelectorAll(
      '.tab-btn, .chat-back, .chat-header-btn, .chat-action-btn, .chat-send-btn, .duniya-action-btn, .duniya-more-btn, .duniya-follow-btn, .peepal-delete-btn, .bottom-tabs button, .topbar button, #profileBtn, #settingsBtn'
    ).forEach((el) => {
      el.classList.add('cp-tap-target');
    });
  }

  // ─── Image enhancements: async decode + lazy-load ──────────────────────────
  function enhanceImages(root) {
    const scope = root || document;
    scope.querySelectorAll('img:not([data-img-enh])').forEach((img) => {
      img.dataset.imgEnh = '1';
      if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
      // Skip images that opted out, are already loaded, or are marked priority.
      if (!img.getAttribute('loading') && !img.complete && img.dataset.eager !== '1') {
        img.setAttribute('loading', 'lazy');
      }
    });
  }

  // Neutral placeholder for deleted users / broken photo URLs.
  const BROKEN_IMG_FALLBACK =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#F1E6D8"/><text x="40" y="52" font-size="34" text-anchor="middle">🪑</text></svg>'
    );

  function initBrokenImageFallback() {
    // Image error events don't bubble — listen in the capture phase, app-wide.
    document.addEventListener(
      'error',
      (e) => {
        const img = e.target;
        if (!img || img.tagName !== 'IMG') return;
        if (img.dataset.imgFallback === '1') return; // avoid loops
        if (img.classList.contains('cp-image-img')) return; // full-screen viewer keeps its own handling
        if (!img.getAttribute('src') || img.getAttribute('src').startsWith('data:')) return;
        img.dataset.imgFallback = '1';
        img.src = BROKEN_IMG_FALLBACK;
      },
      true
    );
  }

  // ─── Escape closes the topmost overlay (keyboard / desktop) ─────────────────
  function initEscapeToClose() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (typeof hasNavLayers === 'function' && hasNavLayers()) {
        try {
          history.back();
        } catch (err) {
          if (typeof dismissTopNavLayer === 'function') dismissTopNavLayer();
        }
        return;
      }
      const viewer = document.getElementById('cpImageViewer');
      if (viewer) {
        viewer.querySelector('.cp-image-close')?.click();
        return;
      }
      const sheet = document.getElementById('cpActionSheet');
      if (sheet) {
        sheet.querySelector('[data-dismiss]')?.click();
        return;
      }
      const modals = [...document.querySelectorAll('.modal-backdrop:not(.hidden)')];
      const top = modals[modals.length - 1];
      if (top) {
        const close = top.querySelector('.icon-btn, [data-dismiss], .sheet-close');
        if (close) close.click();
        else top.classList.add('hidden');
        return;
      }
      if (document.getElementById('activeChatScreen')) {
        document.getElementById('chatBack')?.click();
      }
    });
  }

  function observeDom() {
    const mo = new MutationObserver(() => {
      bindZoomableImages(deviceRoot());
      bindLongPressTargets(deviceRoot());
      bindSwipeTargets();
      enhanceTapTargets();
      enhanceImages(deviceRoot());
    });
    mo.observe(deviceRoot(), { childList: true, subtree: true });
  }

  function init() {
    setupKeyboardAvoidance();
    initBrokenImageFallback();
    initEscapeToClose();
    bindZoomableImages();
    bindLongPressTargets();
    bindSwipeTargets();
    bindPullToRefresh();
    enhanceTapTargets();
    enhanceImages();
    observeDom();
    // Re-bind PTR when tabs change content
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => setTimeout(bindPullToRefresh, 300));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.openImageViewer = openImageViewer;
  window.showActionSheet = showActionSheet;
  window.enableSwipeDismiss = enableSwipeDismiss;
  window.enableSwipeBack = enableSwipeBack;
  window.enablePullToRefresh = enablePullToRefresh;
  window.onLongPress = onLongPress;
  window.bindZoomableImages = bindZoomableImages;
})();
