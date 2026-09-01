/**
 * Chaupaal navigator v1 intent handlers.
 * Grouped by feature area — add new register() blocks when shipping surfaces.
 */
(function () {
  'use strict';

  if (typeof ChaupaalIntents === 'undefined') return;

  const tt = (key, fallback) => (typeof t === 'function' ? t(key, fallback) : fallback);

  function switchTab(tab) {
    const btn = document.querySelector(`.bottom-tabs .tab-btn[data-tab="${tab}"]`);
    if (btn && !btn.classList.contains('active')) btn.click();
    else if (btn) btn.click();
  }

  function guest() {
    return typeof isGuest === 'function' ? isGuest() : !currentUser?.uid;
  }

  function needSignIn() {
    if (!guest()) return false;
    if (typeof requireSignIn === 'function') requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
    else if (typeof showAuth === 'function') showAuth();
    return true;
  }

  function reg(def) {
    ChaupaalIntents.register(def);
  }

  // —— Tabs ——
  ['akhbaar', 'duniya', 'peepal', 'baithak', 'dangal'].forEach((tab) => {
    reg({
      id: `tab.${tab}`,
      category: 'navigate',
      label: `Open ${tab.charAt(0).toUpperCase() + tab.slice(1)}`,
      icon: 'compass',
      keywords: [tab, tab === 'akhbaar' ? 'news' : tab === 'baithak' ? 'chats' : tab === 'dangal' ? 'games' : ''],
      phrases: tab === 'baithak' ? [/open (my )?chats/i, /open baithak/i] : [new RegExp(`open ${tab}`, 'i')],
      priority: 70,
      requiresAuth: false,
      run: () => switchTab(tab),
    });
  });

  // —— Peepal modes ——
  reg({
    id: 'peepal.khoj',
    category: 'navigate',
    label: 'Khoj · Find people',
    icon: 'users',
    keywords: ['khoj', 'find people', 'discover people'],
    phrases: [/find people/i, /open khoj/i],
    priority: 72,
    run: () => {
      switchTab('peepal');
      if (typeof setPeepalMode === 'function') setPeepalMode('khoj');
      else if (typeof renderKhojSurface === 'function') renderKhojSurface(document.getElementById('peepalScreen'));
    },
  });
  reg({
    id: 'peepal.vriksha',
    category: 'navigate',
    label: 'Vriksha discussions',
    icon: 'message-circle',
    keywords: ['vriksha', 'discussions'],
    phrases: [/open vriksha/i],
    priority: 68,
    run: () => {
      switchTab('peepal');
      if (typeof setPeepalMode === 'function') setPeepalMode('vriksha');
    },
  });
  reg({
    id: 'peepal.mashhoor',
    category: 'navigate',
    label: 'Mashhoor · Popular',
    icon: 'trending',
    keywords: ['mashhoor', 'popular'],
    phrases: [/open mashhoor/i],
    priority: 68,
    run: () => {
      switchTab('peepal');
      if (typeof setPeepalMode === 'function') setPeepalMode('mashhoor');
    },
  });
  reg({
    id: 'peepal.search',
    category: 'navigate',
    label: 'Search Chaupaal',
    icon: 'search',
    keywords: ['search chaupaal', 'universal search', 'look up'],
    phrases: [/search (for|chaupaal)/i],
    priority: 70,
    run: () => {
      if (typeof openUniversalSearch === 'function') {
        openUniversalSearch({ types: ['users', 'duniya', 'peepal', 'groups', 'games'] });
      }
    },
  });

  // —— Duniya modes ——
  ['vishwa', 'lehar', 'prasidha'].forEach((mode) => {
    reg({
      id: `duniya.${mode}`,
      category: 'navigate',
      label: `Duniya ${mode.charAt(0).toUpperCase() + mode.slice(1)}`,
      icon: mode === 'lehar' ? 'video' : 'image',
      keywords: [mode, mode === 'lehar' ? 'reels' : ''],
      phrases: mode === 'lehar' ? [/lehar/i, /reels/i] : [new RegExp(mode, 'i')],
      priority: 68,
      run: () => {
        switchTab('duniya');
        if (typeof setDuniyaMode === 'function') setDuniyaMode(mode);
      },
    });
  });

  // —— Baithak sections ——
  [
    ['sambhavanayein', 'Sambhavanayein', /sambhavanayein/i],
    ['sabha', 'Sabha', /open sabha/i],
    ['mitra', 'Mitra', /open mitra/i],
  ].forEach(([sec, label, phrase]) => {
    reg({
      id: `baithak.${sec}`,
      category: 'navigate',
      label: `Baithak ${label}`,
      icon: 'message',
      keywords: [sec, 'baithak'],
      phrases: [phrase],
      priority: 65,
      run: () => {
        switchTab('baithak');
        if (typeof setBaithakSection === 'function') {
          setBaithakSection(sec);
        }
      },
    });
  });
  reg({
    id: 'baithak.hidden',
    category: 'navigate',
    label: 'Hidden chats',
    icon: 'lock',
    keywords: ['hidden', 'vault', 'secret chats'],
    phrases: [/hidden (chats|vault)/i],
    priority: 72,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      if (typeof openBaithakHiddenVault === 'function') openBaithakHiddenVault();
    },
  });

  // —— Akhbaar modes ——
  reg({
    id: 'akhbaar.surkhiya',
    category: 'navigate',
    label: 'Akhbaar Surkhiya',
    icon: 'newspaper',
    keywords: ['surkhiya', 'headlines'],
    phrases: [/surkhiya/i],
    priority: 68,
    run: () => {
      switchTab('akhbaar');
      if (typeof setAkhbaarMode === 'function') setAkhbaarMode('surkhiya');
      else if (typeof goAkhbaarPage === 'function') goAkhbaarPage('surkhiya');
    },
  });
  reg({
    id: 'akhbaar.khabar',
    category: 'navigate',
    label: 'Akhbaar Khabar',
    icon: 'newspaper',
    keywords: ['khabar', 'all news'],
    phrases: [/all news/i, /khabar/i],
    priority: 65,
    run: () => {
      switchTab('akhbaar');
      if (typeof setAkhbaarMode === 'function') setAkhbaarMode('all');
      else if (typeof goAkhbaarPage === 'function') goAkhbaarPage('all');
    },
  });
  reg({
    id: 'akhbaar.saathi',
    category: 'navigate',
    label: 'Akhbaar Saathi',
    icon: 'users',
    keywords: ['saathi'],
    phrases: [/saathi/i],
    priority: 65,
    run: () => {
      switchTab('akhbaar');
      if (typeof setAkhbaarMode === 'function') setAkhbaarMode('saathi');
      else if (typeof goAkhbaarPage === 'function') goAkhbaarPage('saathi');
    },
  });
  reg({
    id: 'akhbaar.safar',
    category: 'navigate',
    label: 'Akhbaar Safar',
    icon: 'map',
    keywords: ['safar', 'journey'],
    phrases: [/safar/i],
    priority: 65,
    run: () => {
      if (typeof openSafarSheet === 'function') openSafarSheet();
      else {
        switchTab('akhbaar');
      }
    },
  });
  reg({
    id: 'akhbaar.add_category',
    category: 'navigate',
    label: 'Add Akhbaar category',
    icon: 'plus',
    keywords: ['add category', 'new category'],
    phrases: [/add (a )?category/i],
    priority: 60,
    run: () => {
      switchTab('akhbaar');
      const fn = window.CategoryPrefs?.openAddCategorySheet || window.CategoryPrefs?.openCategoryManageSheet;
      if (typeof fn === 'function') fn();
      else if (typeof openAkhbaarCatAdd === 'function') openAkhbaarCatAdd();
      else document.getElementById('akhbaarAddCat')?.click();
    },
  });

  // —— Dangal ——
  reg({
    id: 'dangal.khel',
    category: 'navigate',
    label: 'Dangal Khel',
    icon: 'gamepad',
    keywords: ['khel', 'game of the day', 'gotd'],
    phrases: [/game of the day/i, /gotd/i],
    priority: 68,
    run: () => {
      switchTab('dangal');
      if (typeof setDangalSection === 'function') setDangalSection('khel');
    },
  });
  reg({
    id: 'dangal.manch',
    category: 'navigate',
    label: 'Dangal Manch',
    icon: 'library',
    keywords: ['manch', 'library'],
    phrases: [/open manch/i],
    priority: 65,
    run: () => {
      switchTab('dangal');
      if (typeof setDangalSection === 'function') setDangalSection('manch');
    },
  });
  reg({
    id: 'dangal.maidan',
    category: 'navigate',
    label: 'Dangal Maidan',
    icon: 'play',
    keywords: ['maidan', 'resume game'],
    phrases: [/resume (my )?game/i],
    priority: 65,
    run: () => {
      switchTab('dangal');
      if (typeof setDangalSection === 'function') setDangalSection('maidan');
    },
  });
  reg({
    id: 'dangal.tarakki',
    category: 'navigate',
    label: 'Dangal Tarakki',
    icon: 'chart',
    keywords: ['tarakki', 'progress'],
    phrases: [/tarakki/i],
    priority: 62,
    run: () => {
      if (typeof openDangalPulseSheet === 'function') openDangalPulseSheet({ refresh: true });
      else {
        switchTab('dangal');
        if (typeof setDangalSection === 'function') setDangalSection('tarakki');
      }
    },
  });
  reg({
    id: 'dangal.challenge_gotd',
    category: 'navigate',
    label: 'Challenge a friend',
    icon: 'swords',
    keywords: ['challenge', 'duel'],
    phrases: [/challenge (someone|friend)/i],
    priority: 70,
    run: () => {
      switchTab('dangal');
      if (typeof openDangalOpponentPicker === 'function') openDangalOpponentPicker('challenge');
      else if (typeof setDangalSection === 'function') setDangalSection('khel');
    },
  });

  // —— Create ——
  reg({
    id: 'duniya.post',
    category: 'create',
    label: 'Create Duniya post',
    icon: 'image',
    keywords: ['post', 'photo', 'upload', 'duniya post', 'share photo'],
    phrases: [/post (a |on )?duniya/i, /share (a )?photo/i, /create (a )?post/i],
    priority: 82,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      switchTab('duniya');
      if (typeof openDuniyaPostSheet === 'function') openDuniyaPostSheet('post');
    },
  });
  reg({
    id: 'duniya.story',
    category: 'create',
    label: 'Post a Duniya story',
    icon: 'circle',
    keywords: ['story', 'stories', 'duniya story'],
    phrases: [/post (a )?story/i, /add (a )?story/i, /new story/i],
    priority: 80,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      switchTab('duniya');
      if (typeof DuniyaStory !== 'undefined' && typeof DuniyaStory.startCreate === 'function') {
        DuniyaStory.startCreate();
      } else if (typeof openDuniyaPostSheet === 'function') openDuniyaPostSheet('story');
    },
  });
  reg({
    id: 'baithak.split',
    category: 'create',
    label: 'New Split story',
    icon: 'zap',
    keywords: ['split', 'baithak story', 'status'],
    phrases: [/new split/i, /baithak story/i],
    priority: 78,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      switchTab('baithak');
      if (typeof expandBaithakSplitComposer === 'function') expandBaithakSplitComposer();
      else if (typeof openBaithakInstantComposer === 'function') openBaithakInstantComposer();
    },
  });
  reg({
    id: 'peepal.discuss',
    category: 'create',
    label: 'Ask on Peepal',
    icon: 'message-circle',
    keywords: ['ask', 'question', 'discuss', 'peepal'],
    phrases: [/ask (on )?peepal/i, /post (a )?question/i, /discuss something/i],
    priority: 78,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      if (typeof openPeepalAskSheet === 'function') openPeepalAskSheet();
    },
  });
  reg({
    id: 'peepal.form',
    category: 'create',
    label: 'Peepal form poll',
    icon: 'list',
    keywords: ['form', 'poll', 'survey'],
    phrases: [/create (a )?(form|poll)/i],
    priority: 70,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      if (typeof openPeepalAskSheet === 'function') {
        openPeepalAskSheet();
        setTimeout(() => document.querySelector('.peepal-format-chip[data-fmt="form"]')?.click(), 400);
      }
    },
  });
  reg({
    id: 'mehfil.start',
    category: 'create',
    label: 'Start Mehfil',
    icon: 'users',
    keywords: ['mehfil', 'watch party', 'group watch'],
    phrases: [/start mehfil/i, /watch together/i],
    priority: 72,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      const chat = window.currentOpenChat;
      if (chat && typeof openMehfil === 'function') openMehfil(chat);
      else {
        switchTab('baithak');
        if (typeof showToast === 'function') {
          showToast(tt('mehfil_pick_chat', 'Open a chat first, then start Mehfil from there.'));
        }
      }
    },
  });
  reg({
    id: 'muqabala.challenge',
    category: 'create',
    label: 'Muqabala challenge',
    icon: 'swords',
    keywords: ['muqabala', 'quiz challenge', 'trivia'],
    phrases: [/muqabala/i, /quiz challenge/i],
    priority: 75,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      switchTab('dangal');
      if (typeof setDangalSection === 'function') setDangalSection('khel');
      else if (typeof showToast === 'function') showToast('Open Dangal to start Muqabala.');
    },
  });
  reg({
    id: 'dangal.play',
    category: 'create',
    label: 'Pick a game',
    icon: 'gamepad',
    keywords: ['play', 'start game', 'pick game', 'chess', 'ludo'],
    phrases: [/play (chess|ludo|game)/i, /start (a )?game/i],
    priority: 76,
    run: () => {
      switchTab('dangal');
      if (typeof setDangalSection === 'function') setDangalSection('manch');
      const chat = window.currentOpenChat;
      if (chat && typeof openGamePicker === 'function') openGamePicker(chat, chat.type === 'group');
    },
  });

  // —— Social ——
  reg({
    id: 'social.wish_friend',
    category: 'social',
    label: 'Wish a friend',
    icon: 'heart',
    keywords: ['wish', 'birthday', 'greet', 'congratulate', 'anniversary', 'happy birthday'],
    phrases: [/wish (my )?friend/i, /happy birthday/i, /send (a )?greeting/i],
    priority: 85,
    requiresAuth: true,
    run: (ctx) => {
      if (needSignIn()) return;
      if (typeof openChaupaalWishFriendPicker === 'function') {
        openChaupaalWishFriendPicker(ctx?.sourceText || '');
      }
    },
  });
  reg({
    id: 'social.message_friend',
    category: 'social',
    label: 'Message a friend',
    icon: 'message',
    keywords: ['message', 'dm', 'text friend', 'chat with'],
    phrases: [/message (a |my )?friend/i, /dm (someone|friend)/i],
    priority: 80,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      switchTab('baithak');
      if (typeof openPeopleSearchWithContacts === 'function') {
        openPeopleSearchWithContacts({ surface: 'baithak' });
      }
    },
  });
  reg({
    id: 'social.find_people',
    category: 'social',
    label: 'Find people',
    icon: 'users',
    keywords: ['find people', 'meet people', 'khoj'],
    phrases: [/find (new )?people/i, /meet someone/i],
    priority: 78,
    run: () => {
      switchTab('peepal');
      if (typeof setPeepalMode === 'function') setPeepalMode('khoj');
      else if (typeof openPeopleSearchWithContacts === 'function') {
        openPeopleSearchWithContacts({ surface: 'peepal' });
      }
    },
  });
  reg({
    id: 'social.invite',
    category: 'social',
    label: 'Invite friends',
    icon: 'share',
    keywords: ['invite', 'share app', 'refer'],
    phrases: [/invite (friends|someone)/i],
    priority: 70,
    run: () => {
      if (typeof shareInviteToChaupaal === 'function') shareInviteToChaupaal();
      else if (typeof showToast === 'function') showToast('Invite link copied');
    },
  });

  // —— Profile & account ——
  reg({
    id: 'profile.open',
    category: 'profile',
    label: 'Open your profile',
    icon: 'user',
    keywords: ['my profile', 'open profile'],
    phrases: [/open (my )?profile/i],
    priority: 72,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      if (typeof openUserProfile === 'function') {
        openUserProfile({ uid: currentUser.uid }, { context: 'chaupaal_cmd', initialMode: 'owner' });
      } else if (typeof openOwnProfilePreview === 'function') openOwnProfilePreview({ owner: true });
      else if (typeof openChaupaalProfileHub === 'function') openChaupaalProfileHub();
    },
  });
  reg({
    id: 'profile.edit',
    category: 'profile',
    label: 'Edit profile',
    icon: 'pen',
    keywords: ['edit profile', 'update profile'],
    phrases: [/edit (my )?profile/i],
    priority: 70,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      if (typeof setProfilePreviewMode === 'function') setProfilePreviewMode(false);
      if (typeof renderProfileModal === 'function') renderProfileModal();
      document.getElementById('profileModal')?.classList.remove('hidden');
      if (typeof openOwnProfilePreview === 'function') openOwnProfilePreview({ owner: true, mode: 'owner' });
    },
  });
  reg({
    id: 'profile.archive',
    category: 'profile',
    label: 'Open Archive',
    icon: 'archive',
    keywords: ['archive', 'my posts', 'saved posts'],
    phrases: [/open (my )?archive/i, /see (my )?archive/i],
    priority: 80,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      if (typeof openArchiveHub === 'function') openArchiveHub('duniya');
    },
  });
  reg({
    id: 'profile.journal',
    category: 'profile',
    label: 'Private journal',
    icon: 'book',
    keywords: ['journal', 'diary', 'private notes'],
    phrases: [/open (my )?journal/i, /write (in )?journal/i],
    priority: 78,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      if (typeof openArchiveHub === 'function') openArchiveHub('journal');
    },
  });
  reg({
    id: 'profile.settings',
    category: 'profile',
    label: 'Settings',
    icon: 'settings',
    keywords: ['settings', 'preferences'],
    phrases: [/open settings/i],
    priority: 75,
    run: () => {
      if (typeof openSettingsModal === 'function') openSettingsModal();
    },
  });
  reg({
    id: 'profile.notifications',
    category: 'profile',
    label: 'Notifications',
    icon: 'bell',
    keywords: ['notifications', 'alerts'],
    phrases: [/open notifications/i, /notification (inbox|center)/i],
    priority: 72,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      if (typeof openNotificationPanel === 'function') openNotificationPanel('all');
    },
  });
  reg({
    id: 'money.account',
    category: 'profile',
    label: 'Chaupaal Money',
    icon: 'wallet',
    keywords: ['money', 'balance', 'pradhan', 'wallet', 'account'],
    phrases: [/chaupaal money/i, /my balance/i],
    priority: 78,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      if (typeof ChaupaalMoney?.openAccount === 'function') ChaupaalMoney.openAccount();
    },
  });
  reg({
    id: 'money.membership',
    category: 'profile',
    label: 'Membership',
    icon: 'star',
    keywords: ['membership', 'subscribe', 'upgrade', 'premium', 'sarpanch'],
    phrases: [/see membership/i, /upgrade (my )?plan/i],
    priority: 78,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      if (typeof ChaupaalMoney?.openMembership === 'function') ChaupaalMoney.openMembership();
    },
  });

  // —— Tools ——
  reg({
    id: 'tool.search',
    category: 'help',
    label: 'Search Chaupaal',
    icon: 'search',
    keywords: ['search'],
    phrases: [/^search\b/i],
    priority: 55,
    run: () => {
      if (typeof openUniversalSearch === 'function') openUniversalSearch();
    },
  });
  reg({
    id: 'tool.feedback',
    category: 'help',
    label: 'Send feedback',
    icon: 'message-square',
    keywords: ['feedback', 'bug', 'report', 'complaint'],
    phrases: [/send feedback/i, /report (a )?bug/i],
    priority: 75,
    run: () => {
      if (typeof openProductFeedbackSheet === 'function') {
        openProductFeedbackSheet({ source: 'chaupaal_cmd' });
      }
    },
  });
  reg({
    id: 'tool.music',
    category: 'help',
    label: 'Music hub',
    icon: 'music',
    keywords: ['music', 'songs', 'radio'],
    phrases: [/open music/i, /music hub/i],
    priority: 65,
    run: () => {
      if (typeof openMusicHub === 'function') openMusicHub();
      else if (typeof openSongPicker === 'function') openSongPicker();
    },
  });
  reg({
    id: 'help.what_can_you_do',
    category: 'help',
    label: 'What can you do?',
    icon: 'help-circle',
    keywords: ['help', 'what can you do', 'commands', 'menu'],
    phrases: [/what can you do/i, /^help$/i, /show (me )?options/i],
    priority: 90,
    run: () => {
      if (typeof appendChaupaalHelpCard === 'function') appendChaupaalHelpCard();
    },
  });

  // games/foo.js — on DOMContentLoaded:
  // ChaupaalIntents.register({ id: 'games.foo', ... });
})();
