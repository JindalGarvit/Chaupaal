/**
 * Notification category preferences (Phase 3).
 *
 * Categories map to toggles in Settings. Stored in localStorage + users.notifPrefs.
 * addNotification / schedules consult isNotifEnabled(category) before surfacing.
 */
(function () {
  const DEFAULT_PREFS = {
    akhbaar: true,
    breaking: true,
    friends: true,
    messages: true,
    comments: true,
    duels: true,
  };

  const TYPE_TO_CATEGORY = {
    breaking: 'breaking',
    friend: 'friends',
    tag: 'friends',
    duel: 'duels',
    muqabala: 'duels',
    comment: 'comments',
    message: 'messages',
    chat: 'messages',
    streak: 'akhbaar',
    akhbaar: 'akhbaar',
    system: null, // always allowed
  };

  let notifPrefs = { ...DEFAULT_PREFS };

  function loadNotifPrefs() {
    try {
      const raw = localStorage.getItem('chaupaal_notif_prefs');
      if (raw) notifPrefs = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    } catch (e) {}
    return notifPrefs;
  }

  function saveNotifPrefs(next) {
    notifPrefs = { ...DEFAULT_PREFS, ...notifPrefs, ...next };
    try {
      localStorage.setItem('chaupaal_notif_prefs', JSON.stringify(notifPrefs));
    } catch (e) {}
    if (db && currentUser) {
      db.collection('users')
        .doc(currentUser.uid)
        .set({ notifPrefs }, { merge: true })
        .catch(() => {});
    }
    return notifPrefs;
  }

  async function hydrateNotifPrefsFromFirestore() {
    if (!db || !currentUser) return loadNotifPrefs();
    try {
      const snap = await db.collection('users').doc(currentUser.uid).get();
      const remote = snap.data()?.notifPrefs;
      if (remote && typeof remote === 'object') {
        notifPrefs = { ...DEFAULT_PREFS, ...remote };
        try {
          localStorage.setItem('chaupaal_notif_prefs', JSON.stringify(notifPrefs));
        } catch (e) {}
      }
    } catch (e) {}
    applyNotifPrefsToSettingsUI();
    return notifPrefs;
  }

  function isNotifEnabled(typeOrCategory) {
    loadNotifPrefs();
    if (!typeOrCategory) return true;
    if (TYPE_TO_CATEGORY[typeOrCategory] === null) return true; // system
    const cat = TYPE_TO_CATEGORY[typeOrCategory] || typeOrCategory;
    if (!(cat in notifPrefs)) return true;
    return !!notifPrefs[cat];
  }

  function applyNotifPrefsToSettingsUI() {
    loadNotifPrefs();
    const map = {
      notifAkhbaar: 'akhbaar',
      notifBreaking: 'breaking',
      notifFriends: 'friends',
      notifMessages: 'messages',
      notifComments: 'comments',
      notifDuels: 'duels',
    };
    Object.entries(map).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!notifPrefs[key];
    });
  }

  function readNotifPrefsFromSettingsUI() {
    return {
      akhbaar: !!document.getElementById('notifAkhbaar')?.checked,
      breaking: !!document.getElementById('notifBreaking')?.checked,
      friends: !!document.getElementById('notifFriends')?.checked,
      messages: document.getElementById('notifMessages')
        ? !!document.getElementById('notifMessages').checked
        : notifPrefs.messages,
      comments: document.getElementById('notifComments')
        ? !!document.getElementById('notifComments').checked
        : notifPrefs.comments,
      duels: document.getElementById('notifDuels')
        ? !!document.getElementById('notifDuels').checked
        : notifPrefs.duels,
    };
  }

  // Patch addNotification once available
  function installNotifGate() {
    if (typeof addNotification !== 'function' || addNotification.__prefsGated) return;
    const original = addNotification;
    function gated(type, icon, text) {
      if (!isNotifEnabled(type)) return;
      return original(type, icon, text);
    }
    gated.__prefsGated = true;
    window.addNotification = gated;
  }

  loadNotifPrefs();
  // Try install after other scripts; also on DOM ready-ish
  setTimeout(installNotifGate, 0);
  setTimeout(installNotifGate, 500);

  window.notifPrefs = notifPrefs;
  window.loadNotifPrefs = loadNotifPrefs;
  window.saveNotifPrefs = saveNotifPrefs;
  window.isNotifEnabled = isNotifEnabled;
  window.hydrateNotifPrefsFromFirestore = hydrateNotifPrefsFromFirestore;
  window.applyNotifPrefsToSettingsUI = applyNotifPrefsToSettingsUI;
  window.readNotifPrefsFromSettingsUI = readNotifPrefsFromSettingsUI;
  window.installNotifGate = installNotifGate;
})();
