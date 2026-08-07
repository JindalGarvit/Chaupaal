/**
 * Local music taste — play history, likes, skips, playlists.
 * Seeds radio/recommend; no secrets; works offline for likes/playlists.
 */
(function () {
  'use strict';

  const KEY = 'chaupaal_music_taste_v1';
  const MAX_HISTORY = 80;
  const MAX_LIKED = 200;
  const MAX_PLAYLISTS = 12;
  const MAX_PLAYLIST_TRACKS = 60;

  const DEFAULT = {
    history: [],
    liked: [],
    skipped: [],
    playlists: [{ id: 'pl_favorites', name: 'Liked Songs', tracks: [] }],
    settings: { mood: 'discovery', genre: 'any', language: 'hi', scope: 'local' },
  };

  function cloneDefault() {
    return JSON.parse(JSON.stringify(DEFAULT));
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw || typeof raw !== 'object') return cloneDefault();
      return {
        history: Array.isArray(raw.history) ? raw.history : [],
        liked: Array.isArray(raw.liked) ? raw.liked : [],
        skipped: Array.isArray(raw.skipped) ? raw.skipped : [],
        playlists: Array.isArray(raw.playlists) && raw.playlists.length ? raw.playlists : DEFAULT.playlists.slice(),
        settings: { ...DEFAULT.settings, ...(raw.settings || {}) },
      };
    } catch (e) {
      return cloneDefault();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function trackKey(t) {
    return `${String(t?.title || '').toLowerCase()}|${String(t?.artist || '').toLowerCase()}`;
  }

  function slim(t) {
    if (!t) return null;
    return {
      id: t.id || '',
      title: String(t.title || '').slice(0, 120),
      artist: String(t.artist || '').slice(0, 120),
      thumbnail: String(t.thumbnail || '').slice(0, 500),
      previewUrl: t.previewUrl || null,
      source: t.source || 'none',
      ts: Date.now(),
    };
  }

  function recordPlay(track) {
    const s = load();
    const t = slim(track);
    if (!t?.title) return;
    s.history = [t, ...s.history.filter((x) => trackKey(x) !== trackKey(t))].slice(0, MAX_HISTORY);
    save(s);
  }

  function likeTrack(track) {
    const s = load();
    const t = slim(track);
    if (!t?.title) return false;
    s.liked = [t, ...s.liked.filter((x) => trackKey(x) !== trackKey(t))].slice(0, MAX_LIKED);
    s.skipped = s.skipped.filter((x) => trackKey(x) !== trackKey(t));
    const fav = s.playlists.find((p) => p.id === 'pl_favorites') || s.playlists[0];
    if (fav) {
      fav.tracks = [t, ...(fav.tracks || []).filter((x) => trackKey(x) !== trackKey(t))].slice(
        0,
        MAX_PLAYLIST_TRACKS
      );
    }
    save(s);
    return true;
  }

  function unlikeTrack(track) {
    const s = load();
    const k = trackKey(track);
    s.liked = s.liked.filter((x) => trackKey(x) !== k);
    s.playlists.forEach((p) => {
      p.tracks = (p.tracks || []).filter((x) => trackKey(x) !== k);
    });
    save(s);
  }

  function isLiked(track) {
    const k = trackKey(track);
    return load().liked.some((x) => trackKey(x) === k);
  }

  function skipTrack(track) {
    const s = load();
    const t = slim(track);
    if (!t?.title) return;
    s.skipped = [t, ...s.skipped.filter((x) => trackKey(x) !== trackKey(t))].slice(0, 40);
    save(s);
  }

  function getSettings() {
    return { ...load().settings };
  }

  function setSettings(patch) {
    const s = load();
    s.settings = { ...s.settings, ...(patch || {}) };
    save(s);
    return s.settings;
  }

  function getLiked() {
    return load().liked.slice();
  }

  function getHistory() {
    return load().history.slice();
  }

  function getPlaylists() {
    return load().playlists.map((p) => ({
      ...p,
      tracks: (p.tracks || []).slice(),
    }));
  }

  function createPlaylist(name) {
    const s = load();
    if (s.playlists.length >= MAX_PLAYLISTS) return null;
    const pl = {
      id: `pl_${Date.now()}`,
      name: String(name || 'Playlist').slice(0, 48),
      tracks: [],
    };
    s.playlists.push(pl);
    save(s);
    return pl;
  }

  function addToPlaylist(playlistId, track) {
    const s = load();
    const pl = s.playlists.find((p) => p.id === playlistId);
    const t = slim(track);
    if (!pl || !t?.title) return false;
    pl.tracks = [t, ...(pl.tracks || []).filter((x) => trackKey(x) !== trackKey(t))].slice(
      0,
      MAX_PLAYLIST_TRACKS
    );
    save(s);
    return true;
  }

  /** Seed strings for server recommend/radio */
  function recommendSeeds() {
    const s = load();
    const fromLiked = s.liked.slice(0, 4).map((t) => `${t.title} ${t.artist || ''}`.trim());
    const fromHist = s.history.slice(0, 4).map((t) => `${t.title} ${t.artist || ''}`.trim());
    const peepal = [];
    try {
      if (typeof myCategories !== 'undefined' && Array.isArray(myCategories)) {
        myCategories
          .filter((c) => /music|bollywood|song|punjabi|indie/i.test(c.name || ''))
          .slice(0, 2)
          .forEach((c) => peepal.push(c.name));
      }
    } catch (e) {}
    return [...new Set([...fromLiked, ...fromHist, ...peepal])].slice(0, 8);
  }

  window.MusicTaste = {
    recordPlay,
    likeTrack,
    unlikeTrack,
    isLiked,
    skipTrack,
    getSettings,
    setSettings,
    getLiked,
    getHistory,
    getPlaylists,
    createPlaylist,
    addToPlaylist,
    recommendSeeds,
  };
})();
