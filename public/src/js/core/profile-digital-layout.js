/**
 * Digital Profile layout — vertical stack of blocks (builtins + custom).
 * Persist: profile.digitalLayout + profileTheme. Migrates from DIGITAL_BLOCKS / customs.
 */
(function () {
  'use strict';

  const LAYOUT_VERSION = 1;

  const BUILTIN_BLOCKS = [
    { id: 'bio', type: 'builtin', label: 'About', accent: '#E63946' },
    { id: 'prompts', type: 'builtin', label: 'Prompts', accent: '#7B2CBF' },
    { id: 'about', type: 'builtin', label: 'Essentials', accent: '#1565C0' },
    { id: 'interests', type: 'builtin', label: 'Interests', accent: '#2E7D32' },
    { id: 'lifestyle', type: 'builtin', label: 'Lifestyle', accent: '#00838F' },
    { id: 'media', type: 'builtin', label: 'Photos & clips', accent: '#EF6C00' },
    { id: 'links', type: 'builtin', label: 'Links', accent: '#AD1457' },
    { id: 'stats', type: 'builtin', label: 'Stats', accent: '#5E35B1' },
    { id: 'pinned', type: 'builtin', label: 'Pinned', accent: '#C62828' },
    { id: 'dangal', type: 'builtin', label: 'Dangal', accent: '#E85D04' },
  ];

  const BLOCK_CATALOG = [
    { type: 'quote', label: 'Quote', hint: 'Pinned thought', emoji: '💬', accent: '#7B2CBF' },
    { type: 'links', label: 'Link list', hint: 'Website & socials', emoji: '🔗', accent: '#AD1457' },
    { type: 'flexible', label: 'Text block', hint: 'Free write-up', emoji: '📝', accent: '#1565C0' },
    { type: 'emoji', label: 'Mood', hint: 'Emoji vibe', emoji: '😎', accent: '#EF6C00' },
    { type: 'media', label: 'Featured media', hint: 'Photo / clip slot', emoji: '📷', accent: '#2E7D32' },
    { type: 'voice', label: 'Voice note', hint: 'Short audio intro', emoji: '🎙️', accent: '#00838F' },
    { type: 'video', label: 'Video card', hint: 'One short video', emoji: '🎬', accent: '#C62828' },
  ];

  const PALETTES = [
    { id: 'chaupaal', name: 'Chaupaal', accent: '#E63946', surface: '#FFF8F6', glow: 'rgba(230,57,70,.22)', unlockAt: 0 },
    { id: 'mango', name: 'Mango', accent: '#EF6C00', surface: '#FFF6EC', glow: 'rgba(239,108,0,.22)', unlockAt: 15 },
    { id: 'neem', name: 'Neem', accent: '#2E7D32', surface: '#F3FAF4', glow: 'rgba(46,125,50,.22)', unlockAt: 47 },
    { id: 'indigo', name: 'Indigo', accent: '#5E35B1', surface: '#F6F2FF', glow: 'rgba(94,53,177,.22)', unlockAt: 72 },
    { id: 'neon', name: 'Neon Frame', accent: '#00BFA5', surface: '#F0FFFC', glow: 'rgba(0,191,165,.28)', unlockAt: 91 },
  ];

  const FRAMES = [
    { id: 'plain', name: 'Plain', unlockAt: 0 },
    { id: 'arcade', name: 'Arcade', unlockAt: 47 },
    { id: 'neon', name: 'Neon', unlockAt: 91 },
  ];

  const RINGS = [
    { id: 'soft', name: 'Soft ring', unlockAt: 0 },
    { id: 'pulse', name: 'Pulse', unlockAt: 72 },
    { id: 'spark', name: 'Spark', unlockAt: 97 },
  ];

  function esc(s) {
    return typeof escapeHtmlText === 'function'
      ? escapeHtmlText(s)
      : String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/"/g, '&quot;');
  }

  function quietMotion() {
    return (
      document.documentElement.classList.contains('quiet-mode') ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    );
  }

  function defaultBuiltinBlocks(profileType) {
    const type =
      profileType ||
      (typeof getProfileType === 'function' ? getProfileType() : 'personal');
    const personal = ['bio', 'prompts', 'about', 'interests', 'lifestyle', 'media', 'links', 'stats', 'pinned', 'dangal'];
    const pro = ['bio', 'about', 'links', 'stats', 'media', 'prompts', 'interests', 'pinned', 'dangal', 'lifestyle'];
    const ids = type === 'professional' ? pro : personal;
    return ids.map((id, order) => {
      const meta = BUILTIN_BLOCKS.find((b) => b.id === id) || { id, type: 'builtin', label: id };
      return {
        id,
        type: 'builtin',
        label: meta.label,
        visible: true,
        privacy: 'public',
        order,
        accent: meta.accent,
      };
    });
  }

  function migrateDigitalLayout(profile) {
    const p = profile || (typeof digitalProfile !== 'undefined' ? digitalProfile : {}) || {};
    if (p.digitalLayout?.blocks && Array.isArray(p.digitalLayout.blocks) && p.digitalLayout.blocks.length) {
      return {
        version: LAYOUT_VERSION,
        blocks: p.digitalLayout.blocks.map((b, i) => ({
          ...b,
          order: Number.isFinite(b.order) ? b.order : i,
          visible: b.visible !== false,
          privacy: b.privacy === 'friends' || b.privacy === 'private' ? b.privacy : 'public',
        })),
      };
    }
    const blocks = defaultBuiltinBlocks(p.profileType);
    const customs = Array.isArray(p.customSections) ? p.customSections : [];
    customs.forEach((c, i) => {
      if (!c?.id) return;
      blocks.push({
        id: c.id,
        type: c.type || c.layout || 'flexible',
        label: c.name || 'Section',
        visible: c.visible !== false,
        privacy: c.privacy === 'private' ? 'private' : c.privacy === 'friends' ? 'friends' : 'public',
        order: blocks.length + i,
        body: c.body || '',
        items: Array.isArray(c.items) ? c.items : [],
        custom: true,
      });
    });
    return { version: LAYOUT_VERSION, blocks };
  }

  function getDigitalLayout(profile) {
    return migrateDigitalLayout(profile);
  }

  function getProfileTheme(profile) {
    const p = profile || (typeof digitalProfile !== 'undefined' ? digitalProfile : {}) || {};
    const t = p.profileTheme || {};
    const palette = PALETTES.find((x) => x.id === t.paletteId) || PALETTES[0];
    return {
      paletteId: palette.id,
      accent: t.accent || palette.accent,
      surface: t.surface || palette.surface,
      glow: t.glow || palette.glow,
      frameId: t.frameId || 'plain',
      ringId: t.ringId || 'soft',
      unlocked: Array.isArray(t.unlocked) ? t.unlocked.slice() : ['chaupaal', 'plain', 'soft'],
    };
  }

  function persistDigitalLayout(layout) {
    const next = { version: LAYOUT_VERSION, blocks: (layout.blocks || []).map((b, i) => ({ ...b, order: i })) };
    if (typeof digitalProfile !== 'undefined') {
      digitalProfile.digitalLayout = next;
      try {
        localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
      } catch (e) {}
    }
    if (!db || !currentUser) return Promise.resolve(next);
    return db
      .collection('users')
      .doc(currentUser.uid)
      .update({
        'profile.digitalLayout': next,
        digitalLayout: next,
      })
      .then(async () => {
        const merged = {
          ...(typeof userProfile !== 'undefined' ? userProfile : {}),
          ...(typeof digitalProfile !== 'undefined' ? digitalProfile : {}),
          digitalLayout: next,
          profile: {
            ...((typeof digitalProfile !== 'undefined' && digitalProfile) || {}),
            digitalLayout: next,
          },
        };
        if (typeof UsersPublic?.syncPublicProfile === 'function') {
          await UsersPublic.syncPublicProfile(currentUser.uid, merged);
        }
        await syncFriendDigitalProjection(currentUser.uid, merged);
        return next;
      })
      .catch(() => next);
  }

  function persistProfileTheme(theme) {
    const next = { ...getProfileTheme(), ...theme };
    if (typeof digitalProfile !== 'undefined') {
      digitalProfile.profileTheme = next;
      try {
        localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
      } catch (e) {}
    }
    if (!db || !currentUser) return Promise.resolve(next);
    return db
      .collection('users')
      .doc(currentUser.uid)
      .update({ 'profile.profileTheme': next, profileTheme: next })
      .then(() => {
        if (typeof UsersPublic?.syncPublicProfile === 'function') {
          UsersPublic.syncPublicProfile(currentUser.uid, {
            ...(typeof userProfile !== 'undefined' ? userProfile : {}),
            ...(typeof digitalProfile !== 'undefined' ? digitalProfile : {}),
            profileTheme: next,
          });
        }
        return next;
      })
      .catch(() => next);
  }

  function applyProfileThemeToRoot(root, theme) {
    if (!root) return;
    const th = theme || getProfileTheme();
    root.style.setProperty('--dp-accent', th.accent);
    root.style.setProperty('--dp-surface', th.surface);
    root.style.setProperty('--dp-glow', th.glow);
    root.dataset.dpFrame = th.frameId || 'plain';
    root.dataset.dpRing = th.ringId || 'soft';
    root.classList.add('dp-themed');
  }

  function blockHasContent(block, dp) {
    const p = dp || {};
    const id = block?.id;
    if (block?.custom || (block?.type && block.type !== 'builtin')) {
      if (block.body && String(block.body).trim()) return true;
      if (Array.isArray(block.items) && block.items.length) return true;
      if (block.emoji || block.quote || block.mediaUrl || block.voiceUrl || block.videoUrl) return true;
      return false;
    }
    if (id === 'bio') return !!String(p.bio || '').trim();
    if (id === 'prompts') {
      const prompts = Array.isArray(p.prompts) ? p.prompts.filter((x) => x?.answer) : [];
      return prompts.length > 0;
    }
    if (id === 'about') {
      return !!(p.currentCity || p.occupation || p.lookingFor || p.relationshipStatus || p.height || (p.languages && p.languages.length));
    }
    if (id === 'interests') {
      const interests = [...new Set([...(p.interests || []), ...(Array.isArray(p.hobbies) ? p.hobbies : [])])];
      return interests.filter(Boolean).length > 0;
    }
    if (id === 'lifestyle') return !!(p.diet || p.drinking || p.smoking || p.fitness);
    if (id === 'media') {
      const m = p.profileMedia || {};
      return !!(m.photos?.length || m.videos?.length || m.clips?.length);
    }
    if (id === 'links') {
      return !!(p.website || p.instagram || (Array.isArray(p.profileLinks) && p.profileLinks.length));
    }
    if (id === 'stats') return true;
    if (id === 'pinned') return Array.isArray(p.pinnedPosts) && p.pinnedPosts.length > 0;
    if (id === 'dangal') return true;
    return false;
  }

  /**
   * @param {{ isOwner?: boolean, editMode?: boolean, isFriend?: boolean }} opts
   */
  function visibleDigitalBlocks(profile, opts) {
    const o = opts || {};
    const layout = getDigitalLayout(profile);
    const sorted = [...layout.blocks].sort((a, b) => (a.order || 0) - (b.order || 0));
    return sorted.filter((b) => {
      if (o.editMode && o.isOwner) return true;
      if (b.visible === false) return false;
      if (b.privacy === 'private') return !!(o.isOwner && o.editMode);
      if (b.privacy === 'friends') return !!(o.isOwner || o.isFriend);
      if (!o.isOwner && !blockHasContent(b, profile)) return false;
      return true;
    });
  }

  function publicDigitalLayoutProjection(profile) {
    const layout = getDigitalLayout(profile);
    const blocks = layout.blocks
      .filter((b) => b.visible !== false && b.privacy === 'public' && blockHasContent(b, profile))
      .map((b) => ({ ...b }));
    return { version: LAYOUT_VERSION, blocks };
  }

  /** Public + friends-only blocks (no private). For friend_projection subcollection. */
  function friendsDigitalLayoutProjection(profile) {
    const layout = getDigitalLayout(profile);
    const blocks = layout.blocks
      .filter(
        (b) =>
          b.visible !== false &&
          b.privacy !== 'private' &&
          (b.privacy === 'public' || b.privacy === 'friends') &&
          blockHasContent(b, profile)
      )
      .map((b) => ({ ...b }));
    return { version: LAYOUT_VERSION, blocks };
  }

  function cssEscapeId(id) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(id || ''));
    return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  /** Soft accent bleed on Duniya author / Peepal discovery cards. */
  function applyAuthorAccent(el, theme) {
    if (!el) return;
    applyProfileThemeToRoot(el, theme || getProfileTheme());
    el.classList.add('cp-author-accent', 'dp-themed');
  }

  async function syncFriendDigitalProjection(uid, profile) {
    if (!db || !uid) return null;
    const layout = friendsDigitalLayoutProjection(profile);
    try {
      await db
        .collection('users_public')
        .doc(uid)
        .collection('friend_projection')
        .doc('digital')
        .set({ digitalLayout: layout, updatedAt: Date.now() }, { merge: true });
    } catch (e) {
      console.warn('[digital-layout] friend projection', e?.message || e);
    }
    return layout;
  }

  async function fetchFriendDigitalLayout(uid) {
    if (!db || !uid) return null;
    try {
      const snap = await db
        .collection('users_public')
        .doc(uid)
        .collection('friend_projection')
        .doc('digital')
        .get();
      if (snap.exists && snap.data()?.digitalLayout) return snap.data().digitalLayout;
    } catch (e) {}
    return null;
  }

  function arcadeBurst(el) {
    if (quietMotion()) return;
    if (typeof haptic === 'function') haptic('light');
    if (typeof SoundLib !== 'undefined' && SoundLib.tap) {
      try {
        SoundLib.tap();
      } catch (e) {}
    }
    const host = el?.closest?.('.device') || document.querySelector('.device');
    if (!host) return;
    const burst = document.createElement('div');
    burst.className = 'dp-arcade-burst';
    burst.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('span');
      p.style.setProperty('--i', String(i));
      burst.appendChild(p);
    }
    host.appendChild(burst);
    setTimeout(() => burst.remove(), 700);
  }

  function unlockCosmeticIds(pct) {
    const ids = ['chaupaal', 'plain', 'soft'];
    PALETTES.forEach((p) => {
      if (pct >= p.unlockAt) ids.push(p.id);
    });
    FRAMES.forEach((f) => {
      if (pct >= f.unlockAt) ids.push(f.id);
    });
    RINGS.forEach((r) => {
      if (pct >= r.unlockAt) ids.push(r.id);
    });
    return [...new Set(ids)];
  }

  async function createCustomDigitalBlock(spec) {
    const layout = getDigitalLayout();
    const id =
      typeof crypto?.randomUUID === 'function'
        ? `db_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
        : `db_${Date.now().toString(36)}`;
    const block = {
      id,
      type: spec.type || 'flexible',
      label: spec.label || 'New block',
      visible: true,
      privacy: 'public',
      order: layout.blocks.length,
      custom: true,
      body: '',
      items: [],
      emoji: spec.type === 'emoji' ? '✨' : '',
      quote: '',
      accent: spec.accent || '#E63946',
    };
    layout.blocks.push(block);
    await persistDigitalLayout(layout);
    arcadeBurst(document.querySelector('.cp-digital-pane'));
    return block;
  }

  async function updateDigitalBlock(id, patch) {
    const layout = getDigitalLayout();
    const idx = layout.blocks.findIndex((b) => b.id === id);
    if (idx < 0) return null;
    layout.blocks[idx] = { ...layout.blocks[idx], ...patch, id };
    await persistDigitalLayout(layout);
    return layout.blocks[idx];
  }

  async function reorderDigitalBlocks(orderedIds) {
    const layout = getDigitalLayout();
    const map = new Map(layout.blocks.map((b) => [b.id, b]));
    const next = [];
    orderedIds.forEach((id, i) => {
      const b = map.get(id);
      if (b) next.push({ ...b, order: i });
      map.delete(id);
    });
    map.forEach((b) => next.push({ ...b, order: next.length }));
    await persistDigitalLayout({ blocks: next });
    arcadeBurst(document.querySelector('.cp-digital-pane'));
  }

  async function removeDigitalBlock(id) {
    const layout = getDigitalLayout();
    const block = layout.blocks.find((b) => b.id === id);
    if (!block) return;
    if (block.type === 'builtin' || BUILTIN_BLOCKS.some((b) => b.id === id)) {
      await updateDigitalBlock(id, { visible: false });
      return;
    }
    layout.blocks = layout.blocks.filter((b) => b.id !== id);
    await persistDigitalLayout(layout);
  }

  window.DigitalLayout = {
    BUILTIN_BLOCKS,
    BLOCK_CATALOG,
    PALETTES,
    FRAMES,
    RINGS,
    getDigitalLayout,
    getProfileTheme,
    persistDigitalLayout,
    persistProfileTheme,
    applyProfileThemeToRoot,
    visibleDigitalBlocks,
    publicDigitalLayoutProjection,
    friendsDigitalLayoutProjection,
    syncFriendDigitalProjection,
    fetchFriendDigitalLayout,
    blockHasContent,
    createCustomDigitalBlock,
    updateDigitalBlock,
    reorderDigitalBlocks,
    removeDigitalBlock,
    arcadeBurst,
    unlockCosmeticIds,
    quietMotion,
    cssEscapeId,
    applyAuthorAccent,
  };
})();
