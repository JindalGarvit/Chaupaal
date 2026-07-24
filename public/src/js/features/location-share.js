/**
 * Location sharing for Baithak chats + Stories.
 * Maps: Leaflet + OpenStreetMap tiles (no API key).
 * Place search: Nominatim via /api/media-config { action: 'geocode_search' }
 *   (proxied — browsers cannot set User-Agent; free-tier appropriate for now).
 */
(function () {
  'use strict';

  const NOMINATIM_DEBOUNCE_MS = 500;
  const LIVE_PING_MS = 15000;
  const LIVE_DURATIONS = [
    { id: '15m', label: '15 minutes', ms: 15 * 60 * 1000 },
    { id: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
    { id: '8h', label: '8 hours', ms: 8 * 60 * 60 * 1000 },
    { id: 'until', label: 'Until I stop', ms: 24 * 60 * 60 * 1000 },
  ];

  let leafletLoading = null;
  let activeLiveWatch = null; // { shareId, watchId, timer, stop }
  const searchCache = new Map();

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletLoading) return leafletLoading;
    leafletLoading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      css.crossOrigin = '';
      document.head.appendChild(css);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = '';
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error('Leaflet failed to load'));
      document.head.appendChild(script);
    });
    return leafletLoading;
  }

  function osmTiles(L, map) {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
  }

  function host() {
    return document.querySelector('.device') || document.body;
  }

  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(Object.assign(new Error('Geolocation unavailable'), { code: 'UNSUPPORTED' }));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        (err) => {
          const code =
            err?.code === 1 ? 'DENIED' : err?.code === 2 ? 'UNAVAILABLE' : err?.code === 3 ? 'TIMEOUT' : 'ERROR';
          reject(Object.assign(new Error(err?.message || 'Location failed'), { code }));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    });
  }

  function geoErrorMessage(err) {
    if (err?.code === 'DENIED') {
      return 'Location permission denied. Enable it in your browser/settings, or search/drop a pin instead.';
    }
    if (err?.code === 'UNSUPPORTED') return 'This device cannot share GPS location. Try search or drop a pin.';
    if (err?.code === 'TIMEOUT') return 'Location timed out. Try again or drop a pin on the map.';
    return 'Could not get your location. Try search or drop a pin.';
  }

  /** Persist coarse match coords (opt-in via share / profile). Never required for Peepal. */
  async function saveMatchLocation(lat, lng, source) {
    if (!db || !currentUser || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const payload = {
      matchLocation: {
        lat: Number(lat),
        lng: Number(lng),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        source: String(source || 'share').slice(0, 40),
      },
    };
    try {
      await db.collection('users').doc(currentUser.uid).set(payload, { merge: true });
    } catch (e) {}
  }

  async function searchNominatim(query) {
    const q = String(query || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .slice(0, 120);
    if (q.length < 2) return [];
    if (searchCache.has(q)) return searchCache.get(q);
    if (typeof apiFetch !== 'function') return [];
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'geocode_search', query: q, limit: 6 },
      });
      const results = envelope?.data?.results || [];
      searchCache.set(q, results);
      setTimeout(() => searchCache.delete(q), 10 * 60 * 1000);
      return results;
    } catch {
      return [];
    }
  }

  function normalizeLocation(loc) {
    if (!loc || typeof loc !== 'object') return null;
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const mode = ['current', 'place', 'pin', 'live'].includes(loc.mode) ? loc.mode : 'pin';
    return {
      type: 'location',
      mode,
      lat,
      lng,
      placeName: String(loc.placeName || loc.name || '').slice(0, 120) || null,
      address: String(loc.address || '').slice(0, 240) || null,
      label:
        String(loc.label || loc.placeName || loc.address || (mode === 'live' ? 'Live location' : 'Location')).slice(
          0,
          160
        ),
      liveShareId: loc.liveShareId ? String(loc.liveShareId).slice(0, 80) : null,
      expiresAt: loc.expiresAt != null ? Number(loc.expiresAt) || loc.expiresAt : null,
      durationMs: Number(loc.durationMs) || null,
      startedAt: loc.startedAt != null ? Number(loc.startedAt) || loc.startedAt : null,
    };
  }

  function renderLocationCard(loc, opts = {}) {
    const L = normalizeLocation(loc);
    if (!L) return '';
    const variant = opts.variant === 'story' ? 'story' : 'chat';
    const isLive = L.mode === 'live';
    const title = L.placeName || L.label || 'Location';
    const sub = L.address || (isLive ? 'Live · updates while sharing' : `${L.lat.toFixed(4)}, ${L.lng.toFixed(4)}`);
    return `<div class="loc-card loc-card--${variant}${isLive ? ' loc-card--live' : ''}"
      data-loc-card
      data-loc-lat="${L.lat}"
      data-loc-lng="${L.lng}"
      data-loc-mode="${esc(L.mode)}"
      data-loc-live="${esc(L.liveShareId || '')}"
      data-loc-expires="${esc(L.expiresAt || '')}"
      data-loc-name="${esc(title)}"
      data-loc-address="${esc(L.address || '')}"
      role="button" tabindex="0" aria-label="Open map for ${esc(title)}">
      <div class="loc-card-map" data-loc-map aria-hidden="true"></div>
      <div class="loc-card-meta">
        ${isLive ? '<span class="loc-live-dot" aria-hidden="true"></span>' : ''}
        <div class="loc-card-title">${isLive ? 'Live location' : esc(title)}</div>
        <div class="loc-card-sub" data-loc-sub>${esc(sub)}</div>
      </div>
    </div>`;
  }

  function mountMiniMap(el, lat, lng, { interactive = false, markerRef } = {}) {
    return ensureLeaflet().then((L) => {
      if (!el || el.dataset.mapReady === '1') return null;
      el.dataset.mapReady = '1';
      const map = L.map(el, {
        zoomControl: interactive,
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        boxZoom: false,
        keyboard: interactive,
        attributionControl: false,
      }).setView([lat, lng], interactive ? 15 : 14);
      osmTiles(L, map);
      const marker = L.marker([lat, lng]).addTo(map);
      if (markerRef) markerRef.current = marker;
      setTimeout(() => map.invalidateSize(), 80);
      return { map, marker, L };
    });
  }

  function openFullMap(loc) {
    const L0 = normalizeLocation(loc);
    if (!L0) return;
    document.getElementById('locFullMap')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'locFullMap';
    sheet.className = 'loc-full-sheet';
    const isLive = L0.mode === 'live' && L0.liveShareId;
    sheet.innerHTML = `
      <div class="loc-full-backdrop" data-loc-close></div>
      <div class="loc-full-panel" role="dialog" aria-label="Map">
        <div class="loc-full-head">
          <div>
            <div class="loc-full-title">${esc(L0.placeName || L0.label || 'Location')}</div>
            <div class="loc-full-sub" data-loc-full-sub>${esc(L0.address || '')}</div>
          </div>
          <button type="button" class="loc-full-close" data-loc-close aria-label="Close">✕</button>
        </div>
        <div class="loc-full-map" data-loc-full-map></div>
        ${isLive ? '<button type="button" class="btn btn--primary btn--block loc-stop-btn hidden" data-loc-stop>Stop sharing</button>' : ''}
      </div>`;
    host().appendChild(sheet);
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, () => close());
    let closed = false;
    let unsub = null;
    let mapApi = null;
    const close = () => {
      if (closed) return;
      closed = true;
      try {
        unsub?.();
      } catch (e) {}
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    sheet.querySelectorAll('[data-loc-close]').forEach((b) => b.addEventListener('click', close));

    const markerRef = { current: null };
    mountMiniMap(sheet.querySelector('[data-loc-full-map]'), L0.lat, L0.lng, {
      interactive: true,
      markerRef,
    }).then((api) => {
      mapApi = api;
    });

    if (isLive && db) {
      const stopBtn = sheet.querySelector('[data-loc-stop]');
      const mine = currentUser && L0.liveShareId?.includes(currentUser.uid);
      if (mine && stopBtn) {
        stopBtn.classList.remove('hidden');
        stopBtn.addEventListener('click', async () => {
          await stopLiveShare(L0.liveShareId);
          close();
          if (typeof showToast === 'function') showToast('Live sharing stopped');
        });
      }
      unsub = db
        .collection('liveLocationShares')
        .doc(L0.liveShareId)
        .onSnapshot((snap) => {
          if (!snap.exists) return;
          const d = snap.data() || {};
          const lat = Number(d.lat);
          const lng = Number(d.lng);
          const active = d.active !== false;
          const sub = sheet.querySelector('[data-loc-full-sub]');
          if (!active) {
            if (sub) sub.textContent = 'Sharing ended · last known location';
            return;
          }
          if (Number.isFinite(lat) && Number.isFinite(lng) && markerRef.current && mapApi) {
            markerRef.current.setLatLng([lat, lng]);
            mapApi.map.panTo([lat, lng]);
            if (sub) sub.textContent = `Live · ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          }
        });
    }
  }

  function mountLocationCards(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-loc-card]').forEach((card) => {
      if (card.dataset.locBound === '1') return;
      card.dataset.locBound = '1';
      const lat = Number(card.dataset.locLat);
      const lng = Number(card.dataset.locLng);
      const mapEl = card.querySelector('[data-loc-map]');
      if (Number.isFinite(lat) && Number.isFinite(lng) && mapEl) {
        mountMiniMap(mapEl, lat, lng, { interactive: false });
      }
      const open = () =>
        openFullMap({
          mode: card.dataset.locMode,
          lat,
          lng,
          placeName: card.dataset.locName,
          address: card.dataset.locAddress,
          liveShareId: card.dataset.locLive || null,
          expiresAt: card.dataset.locExpires || null,
          label: card.dataset.locName,
        });
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });

      // Live card: listen and update mini map + settle when expired
      const liveId = card.dataset.locLive;
      if (liveId && db && card.dataset.locMode === 'live') {
        const unsub = db
          .collection('liveLocationShares')
          .doc(liveId)
          .onSnapshot((snap) => {
            if (!snap.exists) return;
            const d = snap.data() || {};
            const sub = card.querySelector('[data-loc-sub]');
            if (d.active === false) {
              card.classList.remove('loc-card--live');
              card.classList.add('loc-card--ended');
              if (sub) {
                const mins = d.durationMs ? Math.round(Number(d.durationMs) / 60000) : null;
                sub.textContent = mins
                  ? `Last known · shared for ${mins} min`
                  : 'Last known location · sharing ended';
              }
              try {
                unsub();
              } catch (e) {}
              return;
            }
            const la = Number(d.lat);
            const ln = Number(d.lng);
            if (Number.isFinite(la) && Number.isFinite(ln)) {
              card.dataset.locLat = String(la);
              card.dataset.locLng = String(ln);
              if (sub) sub.textContent = `Live · updating`;
            }
          });
        card._locUnsub = unsub;
      }
    });
  }

  async function startLiveShare(durationMs) {
    if (!db || !currentUser) throw new Error('Sign in required');
    const pos = await getCurrentPosition();
    const shareId = `live_${currentUser.uid}_${Date.now()}`;
    const startedAt = Date.now();
    const expiresAt = startedAt + durationMs;
    await db
      .collection('liveLocationShares')
      .doc(shareId)
      .set({
        uid: currentUser.uid,
        active: true,
        expired: false,
        lat: pos.lat,
        lng: pos.lng,
        startedAt: new Date(startedAt),
        expiresAt: new Date(expiresAt),
        durationMs,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    await saveMatchLocation(pos.lat, pos.lng, 'live_share');

    const watchId = navigator.geolocation.watchPosition(
      async (p) => {
        try {
          await db
            .collection('liveLocationShares')
            .doc(shareId)
            .set(
              {
                lat: p.coords.latitude,
                lng: p.coords.longitude,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
        } catch (e) {}
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: LIVE_PING_MS, timeout: 20000 }
    );

    const timer = setInterval(async () => {
      if (Date.now() >= expiresAt) {
        await stopLiveShare(shareId);
      }
    }, 20000);

    activeLiveWatch = {
      shareId,
      watchId,
      timer,
      stop: () => stopLiveShare(shareId),
    };

    return {
      type: 'location',
      mode: 'live',
      lat: pos.lat,
      lng: pos.lng,
      label: 'Live location',
      liveShareId: shareId,
      expiresAt,
      durationMs,
      startedAt,
    };
  }

  async function stopLiveShare(shareId) {
    if (activeLiveWatch?.shareId === shareId) {
      try {
        navigator.geolocation.clearWatch(activeLiveWatch.watchId);
      } catch (e) {}
      clearInterval(activeLiveWatch.timer);
      activeLiveWatch = null;
    }
    if (!db || !shareId) return;
    try {
      await db
        .collection('liveLocationShares')
        .doc(shareId)
        .set(
          {
            active: false,
            stoppedAt: firebase.firestore.FieldValue.serverTimestamp(),
            stopReason: 'user_stopped',
          },
          { merge: true }
        );
    } catch (e) {}
  }

  function openLocationComposer({ onSelect, title } = {}) {
    document.getElementById('locShareSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'locShareSheet';
    sheet.className = 'loc-share-sheet';
    sheet.innerHTML = `
      <div class="loc-share-backdrop" data-loc-x></div>
      <div class="loc-share-panel" role="dialog" aria-label="${esc(title || 'Share location')}">
        <div class="loc-share-handle"></div>
        <div class="loc-share-head">
          <div class="loc-share-title">${esc(title || 'Share location')}</div>
          <button type="button" class="loc-share-close" data-loc-x aria-label="Close">✕</button>
        </div>
        <div class="loc-share-modes" data-loc-modes>
          <button type="button" class="loc-mode-btn" data-mode="current">📍 Share current location</button>
          <button type="button" class="loc-mode-btn" data-mode="search">🔎 Search a place</button>
          <button type="button" class="loc-mode-btn" data-mode="pin">📌 Drop a pin</button>
          <button type="button" class="loc-mode-btn" data-mode="live">📡 Share live location</button>
        </div>
        <div class="loc-share-body" data-loc-body></div>
      </div>`;
    host().appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('is-open'));
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.classList.remove('is-open');
      setTimeout(() => sheet.remove(), 220);
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelectorAll('[data-loc-x]').forEach((el) => el.addEventListener('click', close));

    const body = sheet.querySelector('[data-loc-body]');
    const modes = sheet.querySelector('[data-loc-modes]');

    const finish = async (loc) => {
      const n = normalizeLocation(loc);
      if (!n) return;
      if (n.mode !== 'live') await saveMatchLocation(n.lat, n.lng, n.mode);
      close();
      try {
        onSelect?.(n);
      } catch (e) {}
    };

    const showCurrent = async () => {
      body.innerHTML = `<div class="loc-share-status">Getting your location…</div>`;
      try {
        const pos = await getCurrentPosition();
        body.innerHTML = `
          <div class="loc-share-map" data-pick-map></div>
          <button type="button" class="btn btn--primary btn--block" data-confirm>Share this location</button>`;
        mountMiniMap(body.querySelector('[data-pick-map]'), pos.lat, pos.lng, { interactive: false });
        body.querySelector('[data-confirm]')?.addEventListener('click', () =>
          finish({ mode: 'current', lat: pos.lat, lng: pos.lng, label: 'Current location', placeName: 'Current location' })
        );
      } catch (err) {
        body.innerHTML = `<div class="loc-share-empty">${esc(geoErrorMessage(err))}</div>
          <button type="button" class="btn btn--block" data-fallback-pin>Drop a pin instead</button>`;
        body.querySelector('[data-fallback-pin]')?.addEventListener('click', showPin);
      }
    };

    const showSearch = () => {
      body.innerHTML = `
        <label class="loc-search-wrap">
          <span class="sr-only">Search places</span>
          <input type="search" class="loc-search-input" placeholder="Cafe, park, address…" autocomplete="off">
        </label>
        <div class="loc-search-results" data-results><div class="loc-share-hint">Type a place name — results from OpenStreetMap</div></div>
        <button type="button" class="btn btn--block" data-fallback-pin>Can't find it? Drop a pin</button>`;
      const input = body.querySelector('.loc-search-input');
      const resultsEl = body.querySelector('[data-results]');
      let t = null;
      input?.focus();
      input?.addEventListener('input', () => {
        clearTimeout(t);
        const q = input.value.trim();
        if (q.length < 2) {
          resultsEl.innerHTML = `<div class="loc-share-hint">Type at least 2 characters</div>`;
          return;
        }
        resultsEl.innerHTML = `<div class="loc-share-status">Searching…</div>`;
        // Debounced Nominatim (policy: never per-keystroke). Free-tier appropriate; self-host later if needed.
        t = setTimeout(async () => {
          const list = await searchNominatim(q);
          if (!list.length) {
            resultsEl.innerHTML = `<div class="loc-share-empty">No places found. Try another name or drop a pin.</div>`;
            return;
          }
          resultsEl.innerHTML = list
            .map(
              (p, i) =>
                `<button type="button" class="loc-search-row" data-i="${i}">
                  <strong>${esc(p.placeName)}</strong>
                  <span>${esc(p.address)}</span>
                </button>`
            )
            .join('');
          resultsEl.querySelectorAll('[data-i]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const p = list[Number(btn.dataset.i)];
              finish({
                mode: 'place',
                lat: p.lat,
                lng: p.lng,
                placeName: p.placeName,
                address: p.address,
                label: p.placeName,
              });
            });
          });
        }, NOMINATIM_DEBOUNCE_MS);
      });
      body.querySelector('[data-fallback-pin]')?.addEventListener('click', showPin);
    };

    const showPin = async () => {
      let center = { lat: 20.5937, lng: 78.9629 };
      try {
        center = await getCurrentPosition();
      } catch (e) {}
      body.innerHTML = `
        <div class="loc-share-hint">Pan and tap the map to drop a pin</div>
        <div class="loc-share-map loc-share-map--tall" data-pick-map></div>
        <button type="button" class="btn btn--primary btn--block" data-confirm disabled>Share pin</button>`;
      let chosen = null;
      const confirm = body.querySelector('[data-confirm]');
      ensureLeaflet().then((L) => {
        const el = body.querySelector('[data-pick-map]');
        const map = L.map(el, { zoomControl: true }).setView([center.lat, center.lng], 13);
        osmTiles(L, map);
        let marker = null;
        map.on('click', (e) => {
          chosen = { lat: e.latlng.lat, lng: e.latlng.lng };
          if (marker) marker.setLatLng(e.latlng);
          else marker = L.marker(e.latlng).addTo(map);
          confirm.disabled = false;
        });
        setTimeout(() => map.invalidateSize(), 100);
      });
      confirm?.addEventListener('click', () => {
        if (!chosen) return;
        finish({ mode: 'pin', lat: chosen.lat, lng: chosen.lng, label: 'Dropped pin', placeName: 'Dropped pin' });
      });
    };

    const showLive = () => {
      body.innerHTML = `
        <div class="loc-share-hint">Friends see your pin update while sharing is on. Stops automatically when time is up.</div>
        <div class="loc-duration-list">
          ${LIVE_DURATIONS.map(
            (d) => `<button type="button" class="loc-mode-btn" data-dur="${d.id}">${esc(d.label)}</button>`
          ).join('')}
        </div>
        <div class="loc-share-status" data-live-status></div>`;
      body.querySelectorAll('[data-dur]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const d = LIVE_DURATIONS.find((x) => x.id === btn.dataset.dur);
          if (!d) return;
          const status = body.querySelector('[data-live-status]');
          status.textContent = 'Starting live share…';
          try {
            const loc = await startLiveShare(d.ms);
            finish(loc);
          } catch (err) {
            status.textContent = geoErrorMessage(err);
          }
        });
      });
    };

    modes.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        modes.querySelectorAll('.loc-mode-btn').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const m = btn.dataset.mode;
        if (m === 'current') showCurrent();
        else if (m === 'search') showSearch();
        else if (m === 'pin') showPin();
        else if (m === 'live') showLive();
      });
    });
  }

  async function promptMatchLocation() {
    try {
      const pos = await getCurrentPosition();
      await saveMatchLocation(pos.lat, pos.lng, 'profile');
      if (typeof showToast === 'function') showToast('Location saved for better nearby matches');
      return true;
    } catch (err) {
      if (typeof showToast === 'function') showToast(geoErrorMessage(err));
      return false;
    }
  }

  // Leaflet/geolocation integration boundary (CONVENTIONS 4c); renderLocationCard
  // returns HTML consumed in template strings, so it stays unwrapped.
  const guardLoc = typeof safeFeature === 'function' ? safeFeature : (n, f) => f;
  window.ensureLeaflet = ensureLeaflet;
  window.openLocationComposer = guardLoc('location_composer', openLocationComposer);
  window.renderLocationCard = renderLocationCard;
  window.mountLocationCards = guardLoc('location_mount', mountLocationCards);
  window.normalizeLocationAttachment = normalizeLocation;
  window.stopLiveShare = stopLiveShare;
  window.promptMatchLocation = promptMatchLocation;
  window.saveMatchLocation = saveMatchLocation;
})();
