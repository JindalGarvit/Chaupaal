/**
 * Chaupaal navigator v1 intent handlers.
 * Grouped by feature area — add new register() blocks when shipping surfaces.
 */
(function () {
  'use strict';

  if (typeof ChaupaalIntents === 'undefined') return;

  const tt = (key, fallback, vars) => (typeof t === 'function' ? t(key, vars || fallback) : fallback);

  /** Every UI language the app ships; keyword lists are keyed by these codes. */
  const KW_LANGS = typeof LANG_CATALOG !== 'undefined' ? LANG_CATALOG.map((l) => l.code) : ['en'];
  /**
   * Per-language search keywords: English is the source; other languages start empty and are filled
   * in place (kw([...en], { hi: [...] })). Matching reads the UI language + English + "Languages I read".
   */
  function kw(en, more) {
    const out = {};
    KW_LANGS.forEach((c) => (out[c] = []));
    out.en = (en || []).filter(Boolean);
    Object.assign(out, more || {});
    return out;
  }

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
  const TAB_KEYWORDS = {
    akhbaar: {
      hi: ['अख़बार', 'ख़बर', 'समाचार', 'न्यूज़', 'khabar', 'khabr', 'samachar', 'akhbar'],
      ur: ['اخبار', 'خبر', 'خبریں', 'نیوز', 'khabar', 'khabr', 'khabrein', 'akhbar'],
    },
    duniya: {
      hi: ['दुनिया', 'फ़ीड', 'होम फ़ीड', 'dunia', 'duniyaa', 'feed dekho'],
      ur: ['دنیا', 'فیڈ', 'ہوم فیڈ', 'dunya', 'dunia', 'feed dekho'],
    },
    peepal: {
      hi: ['पीपल', 'पीपल का पेड़', 'pipal', 'peepal ped', 'pipal ka ped'],
      ur: ['پیپل', 'پیپل کا درخت', 'pipal', 'peepal darakht', 'pipal ka darakht'],
    },
    baithak: {
      hi: ['बैठक', 'चैट', 'बातें', 'बातचीत', 'baatein', 'baaten', 'baatcheet', 'gupshup'],
      ur: ['بیٹھک', 'چیٹ', 'بات چیت', 'باتیں', 'گپ شپ', 'baat cheet', 'baatein', 'gupshup'],
    },
    dangal: {
      hi: ['दंगल', 'खेल', 'गेम', 'khel', 'game khelo'],
      ur: ['دنگل', 'کھیل', 'گیم', 'گیمز', 'khel', 'game khelo', 'khelein'],
    },
  };
  ['akhbaar', 'duniya', 'peepal', 'baithak', 'dangal'].forEach((tab) => {
    reg({
      id: `tab.${tab}`,
      category: 'navigate',
      label: tt('khoj.intent_open_surface', '', { name: typeof I18N_GLOSSARY !== 'undefined' ? I18N_GLOSSARY[tab] : tab }),
      icon: 'compass',
      keywords: kw([tab, tab === 'akhbaar' ? 'news' : tab === 'baithak' ? 'chats' : tab === 'dangal' ? 'games' : ''], TAB_KEYWORDS[tab]),
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
    label: t('common.khoj_find_people'),
    icon: 'users',
    keywords: kw(['khoj', 'find people', 'discover people'], {
      hi: ['खोज', 'लोग खोजें', 'नए लोग', 'लोगों से मिलें', 'log dhundo', 'log khojo', 'naye log'],
      ur: ['کھوج', 'لوگ ڈھونڈیں', 'نئے لوگ', 'لوگوں سے ملیں', 'log dhundo', 'naye log', 'logon se milo'],
    }),
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
    label: t('khoj.vriksha_discussions'),
    icon: 'message-circle',
    keywords: kw(['vriksha', 'discussions'], {
      hi: ['वृक्ष', 'चर्चा', 'बहस', 'vriksh', 'charcha', 'bahas', 'behes'],
      ur: ['ورکشا', 'بحث', 'مباحثہ', 'گفتگو', 'bahas', 'behes', 'guftugu'],
    }),
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
    label: t('common.mashhoor_popular'),
    icon: 'trending',
    keywords: kw(['mashhoor', 'popular'], {
      hi: ['मशहूर', 'लोकप्रिय', 'ट्रेंडिंग', 'mashoor', 'mashur', 'lokpriya', 'trending'],
      ur: ['مشہور', 'مقبول', 'ٹرینڈنگ', 'mashoor', 'mashur', 'maqbool', 'trending'],
    }),
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
    label: t('common.search_chaupaal'),
    icon: 'search',
    keywords: kw(['search chaupaal', 'universal search', 'look up'], {
      hi: ['चौपाल में खोजें', 'सब खोजें', 'सर्च', 'ढूँढें', 'search karo', 'dhundo', 'dhoondo'],
      ur: ['چوپال میں تلاش', 'سب تلاش کریں', 'سرچ', 'ڈھونڈیں', 'search karo', 'talash karo', 'dhundo'],
    }),
    phrases: [/search (for|chaupaal)/i],
    priority: 70,
    run: () => {
      if (typeof window.openVrikshaChaupaalSearch === 'function') window.openVrikshaChaupaalSearch();
    },
  });

  // —— Duniya modes ——
  const DUNIYA_KEYWORDS = {
    vishwa: {
      hi: ['विश्व', 'दुनिया भर', 'सबकी पोस्ट', 'vishva', 'duniya bhar', 'sabki post'],
      ur: ['وشوا', 'پوری دنیا', 'دنیا بھر', 'سب کی پوسٹ', 'duniya bhar', 'puri duniya', 'sab ki post'],
    },
    lehar: {
      hi: ['लहर', 'रील', 'छोटे वीडियो', 'वीडियो', 'lahar', 'leher', 'reel dekho', 'chhote video'],
      ur: ['لہر', 'ریل', 'ریلز', 'مختصر ویڈیو', 'ویڈیو', 'lahar', 'leher', 'reel dekho'],
    },
    prasidha: {
      hi: ['प्रसिद्ध', 'टॉप पोस्ट', 'सबसे पसंद', 'prasiddh', 'prasidh', 'top post'],
      ur: ['پرسدھ', 'ٹاپ پوسٹ', 'سب سے پسندیدہ', 'top post', 'pasandeeda', 'sab se pasand'],
    },
  };
  ['vishwa', 'lehar', 'prasidha'].forEach((mode) => {
    reg({
      id: `duniya.${mode}`,
      category: 'navigate',
      label: tt('khoj.intent_duniya_mode', '', { name: mode.charAt(0).toUpperCase() + mode.slice(1) }),
      icon: mode === 'lehar' ? 'video' : 'image',
      keywords: kw([mode, mode === 'lehar' ? 'reels' : ''], DUNIYA_KEYWORDS[mode]),
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
    ['sambhavanayein', 'Sambhavanayein', /sambhavanayein/i, { hi: ['संभावनाएँ', 'नए कनेक्शन', 'अनजान लोगों की चैट', 'sambhavna', 'naye connection', 'anjaan chat'], ur: ['سمبھاونائیں', 'نئے کنکشن', 'اجنبی چیٹ', 'انجان لوگوں سے چیٹ', 'naye connection', 'ajnabi chat', 'anjaan chat'] }], // i18n-ignore (brand name / code)
    ['sabha', 'Sabha', /open sabha/i, { hi: ['सभा', 'सारी चैट', 'सब चैट', 'saari chat', 'sari chat', 'sab chat'], ur: ['سبھا', 'ساری چیٹس', 'سب چیٹ', 'تمام چیٹس', 'saari chat', 'sab chat', 'tamam chat'] }], // i18n-ignore (brand name / code)
    ['mitra', 'Mitra', /open mitra/i, { hi: ['मित्र', 'दोस्त', 'दोस्तों की चैट', 'mitr', 'dost chat', 'doston ki chat'], ur: ['مترا', 'دوست', 'دوستوں کی چیٹ', 'یار', 'dost chat', 'doston ki chat', 'yaar'] }], // i18n-ignore (brand name / code)
  ].forEach(([sec, label, phrase, more]) => {
    reg({
      id: `baithak.${sec}`,
      category: 'navigate',
      label: tt('khoj.intent_baithak_section', '', { name: label }),
      icon: 'message',
      keywords: kw([sec, 'baithak'], more),
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
    label: t('common.shortcut_baithak_hidden'),
    icon: 'lock',
    keywords: kw(['hidden', 'vault', 'secret chats'], {
      hi: ['छिपी चैट', 'छिपी', 'छुपी', 'गुप्त', 'तिजोरी', 'chhupi', 'chupi', 'gupt chat'],
      ur: ['چھپی چیٹ', 'خفیہ', 'خفیہ چیٹ', 'تجوری', 'chupi chat', 'khufia', 'khufiya chat'],
    }),
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
    label: t('khoj.akhbaar_surkhiya'),
    icon: 'newspaper',
    keywords: kw(['surkhiya', 'headlines'], {
      hi: ['सुर्ख़ियाँ', 'सुर्ख़ी', 'हेडलाइन', 'मुख्य ख़बरें', 'surkhi', 'headline', 'badi khabar'],
      ur: ['سرخیاں', 'سرخی', 'ہیڈ لائن', 'اہم خبریں', 'surkhiyan', 'headline', 'aham khabrein'],
    }),
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
    label: t('khoj.akhbaar_khabar'),
    icon: 'newspaper',
    keywords: kw(['khabar', 'all news'], {
      hi: ['ख़बर', 'सारी ख़बरें', 'सभी ख़बरें', 'khabr', 'saari khabar', 'sab khabar'],
      ur: ['خبر', 'ساری خبریں', 'تمام خبریں', 'khabr', 'saari khabrein', 'tamam khabrein'],
    }),
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
    label: t('khoj.akhbaar_saathi'),
    icon: 'users',
    keywords: kw(['saathi'], {
      hi: ['साथी', 'दोस्तों की अपडेट', 'अपनों की ख़बर', 'sathi', 'doston ki update', 'apno ki khabar'],
      ur: ['ساتھی', 'دوستوں کی اپ ڈیٹ', 'اپنوں کی خبر', 'sathi', 'doston ki update', 'apno ki khabar'],
    }),
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
    label: t('khoj.akhbaar_safar'),
    icon: 'map',
    keywords: kw(['safar', 'journey'], {
      hi: ['सफ़र', 'यात्रा', 'स्ट्रीक', 'yatra', 'mera safar', 'safr'],
      ur: ['سفر', 'میرا سفر', 'اسٹریک', 'mera safar', 'safr', 'streak'],
    }),
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
    label: t('khoj.add_akhbaar_category'),
    icon: 'plus',
    keywords: kw(['add category', 'new category'], {
      hi: ['कैटेगरी जोड़ें', 'नई कैटेगरी', 'श्रेणी जोड़ें', 'नई श्रेणी', 'category jodo', 'nayi category', 'naya topic'],
      ur: ['کیٹیگری شامل کریں', 'نئی کیٹیگری', 'زمرہ شامل کریں', 'نیا موضوع', 'category add karo', 'nayi category', 'naya mauzu'],
    }),
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
    label: t('khoj.dangal_khel'),
    icon: 'gamepad',
    keywords: kw(['khel', 'game of the day', 'gotd'], {
      hi: ['आज का गेम', 'आज का खेल', 'रोज़ का गेम', 'aaj ka game', 'aaj ka khel', 'roz ka game'],
      ur: ['آج کا گیم', 'آج کا کھیل', 'روز کا گیم', 'aaj ka game', 'aaj ka khel', 'roz ka game'],
    }),
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
    label: t('khoj.dangal_manch'),
    icon: 'library',
    keywords: kw(['manch', 'library'], {
      hi: ['मंच', 'सारे गेम', 'सब गेम', 'गेम लाइब्रेरी', 'saare game', 'sare game', 'sab game'],
      ur: ['منچ', 'سارے گیمز', 'سب گیمز', 'گیم لائبریری', 'saare game', 'sab games', 'game library'],
    }),
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
    label: t('khoj.dangal_maidan'),
    icon: 'play',
    keywords: kw(['maidan', 'resume game'], {
      hi: ['मैदान', 'गेम जारी रखें', 'अधूरा गेम', 'maidaan', 'game jaari', 'adhoora game', 'adhura game'],
      ur: ['میدان', 'گیم جاری رکھیں', 'ادھورا گیم', 'maidaan', 'game jaari', 'adhoora game', 'adhura game'],
    }),
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
    label: t('khoj.dangal_tarakki'),
    icon: 'chart',
    keywords: kw(['tarakki', 'progress'], {
      hi: ['तरक़्क़ी', 'प्रगति', 'आँकड़े', 'taraqqi', 'tarakkee', 'pragati', 'progress dekho'],
      ur: ['ترقی', 'پیش رفت', 'اعداد و شمار', 'taraqqi', 'taraqi', 'progress dekho'],
    }),
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
    label: t('khoj.challenge_a_friend'),
    icon: 'swords',
    keywords: kw(['challenge', 'duel'], {
      hi: ['चुनौती', 'चैलेंज', 'टक्कर', 'ललकारो', 'chunauti', 'challenge karo', 'takkar'],
      ur: ['چیلنج', 'ٹکر', 'للکارو', 'مقابلہ کرو', 'challenge karo', 'takkar', 'lalkaro'],
    }),
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
    label: t('khoj.create_duniya_post'),
    icon: 'image',
    keywords: kw(['post', 'photo', 'upload', 'duniya post', 'share photo'], {
      hi: ['पोस्ट', 'फ़ोटो', 'तस्वीर', 'अपलोड', 'naya post', 'nayi post', 'photo dalo', 'post karo'],
      ur: ['پوسٹ', 'تصویر', 'فوٹو', 'اپ لوڈ', 'nayi post', 'post karo', 'photo dalo', 'tasveer'],
    }),
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
    label: t('khoj.post_a_duniya_story'),
    icon: 'circle',
    keywords: kw(['story', 'stories', 'duniya story'], {
      hi: ['स्टोरी', 'कहानी', 'नई स्टोरी', 'kahani', 'story dalo', 'story lagao'],
      ur: ['اسٹوری', 'کہانی', 'نئی اسٹوری', 'kahani', 'story dalo', 'story lagao'],
    }),
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
    label: t('common.shortcut_baithak_instant'),
    icon: 'zap',
    keywords: kw(['split', 'baithak story', 'status'], {
      hi: ['स्प्लिट', 'स्टेटस', 'नया स्प्लिट', 'status lagao', 'split dalo', 'naya split'],
      ur: ['اسپلٹ', 'اسٹیٹس', 'نیا اسپلٹ', 'status lagao', 'split dalo', 'naya split'],
    }),
    phrases: [/new split/i, /baithak story/i, /leave a split/i],
    priority: 78,
    requiresAuth: true,
    run: () => {
      // Soft-auth + resume via expandBaithakSplitComposer (B3)
      switchTab('baithak');
      if (typeof expandBaithakSplitComposer === 'function') expandBaithakSplitComposer();
      else if (typeof openBaithakInstantComposer === 'function') openBaithakInstantComposer();
      else if (needSignIn()) return;
    },
  });
  reg({
    id: 'peepal.discuss',
    category: 'create',
    label: t('khoj.ask_on_peepal'),
    icon: 'message-circle',
    keywords: kw(['ask', 'question', 'discuss', 'peepal'], {
      hi: ['सवाल', 'पूछ', 'चर्चा करें', 'राय', 'sawal', 'sawaal', 'poochh', 'puch'],
      ur: ['سوال', 'پوچھیں', 'رائے', 'بحث کریں', 'sawal', 'sawaal', 'poocho', 'raye'],
    }),
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
    label: t('khoj.peepal_form_poll'),
    icon: 'list',
    keywords: kw(['form', 'poll', 'survey'], {
      hi: ['पोल', 'सर्वे', 'फ़ॉर्म', 'वोटिंग', 'मतदान', 'poll banao', 'survey karo', 'voting karao'],
      ur: ['پول', 'سروے', 'فارم', 'ووٹنگ', 'رائے شماری', 'poll banao', 'survey karo', 'voting karao'],
    }),
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
    label: t('khoj.start_mehfil'),
    icon: 'users',
    keywords: kw(['mehfil', 'watch party', 'group watch'], {
      hi: ['महफ़िल', 'साथ देखें', 'मिलकर देखें', 'वॉच पार्टी', 'mahfil', 'saath dekho', 'milkar dekho', 'mehfil jamao'],
      ur: ['محفل', 'ساتھ دیکھیں', 'مل کر دیکھیں', 'واچ پارٹی', 'mahfil', 'saath dekho', 'mil kar dekho', 'mehfil sajao'],
    }),
    phrases: [/start mehfil/i, /watch together/i],
    priority: 72,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      const chat = window.currentOpenChat;
      if (chat && typeof ensureOpenMehfil === 'function') ensureOpenMehfil(chat);
      else if (chat && typeof openMehfil === 'function') openMehfil(chat);
      else {
        switchTab('baithak');
        if (typeof showToast === 'function') {
          showToast(tt('khoj.mehfil_pick_chat', 'Open a chat first, then start Mehfil from there.'));
        }
      }
    },
  });
  reg({
    id: 'muqabala.challenge',
    category: 'create',
    label: t('khoj.muqabala_challenge'),
    icon: 'swords',
    keywords: kw(['muqabala', 'quiz challenge', 'trivia'], {
      hi: ['मुक़ाबला', 'क्विज़ चैलेंज', 'ज्ञान मुक़ाबला', 'muqabla', 'mukabla', 'mukabala', 'quiz takkar'],
      ur: ['مقابلہ', 'کوئز چیلنج', 'معلوماتی مقابلہ', 'muqabla', 'mukabla', 'quiz muqabla'],
    }),
    phrases: [/muqabala/i, /quiz challenge/i],
    priority: 75,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      switchTab('dangal');
      if (typeof setDangalSection === 'function') setDangalSection('khel');
      else if (typeof showToast === 'function') showToast(t('khoj.open_dangal_to_start_muqabala'));
    },
  });
  reg({
    id: 'dangal.play',
    category: 'create',
    label: t('khoj.pick_a_game'),
    icon: 'gamepad',
    keywords: kw(['play', 'start game', 'pick game', 'chess', 'ludo'], {
      hi: ['खेलें', 'गेम खेलो', 'गेम शुरू', 'शतरंज', 'लूडो', 'khelein', 'game shuru', 'game chuno', 'shatranj'],
      ur: ['کھیلیں', 'گیم کھیلو', 'گیم شروع', 'شطرنج', 'لوڈو', 'khelein', 'game shuru', 'shatranj'],
    }),
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
    label: t('common.chaupaal_cmd_wish_title'),
    icon: 'heart',
    keywords: kw(['wish', 'birthday', 'greet', 'congratulate', 'anniversary', 'happy birthday'], {
      hi: ['बधाई', 'जन्मदिन', 'बर्थडे', 'शुभकामनाएँ', 'मुबारक', 'badhai', 'janamdin', 'shubhkamna'],
      ur: ['مبارکباد', 'سالگرہ', 'برتھ ڈے', 'نیک خواہشات', 'مبارک', 'mubarak', 'mubarakbad', 'salgirah'],
    }),
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
    label: t('khoj.message_a_friend'),
    icon: 'message',
    keywords: kw(['message', 'dm', 'text friend', 'chat with'], {
      hi: ['मैसेज', 'संदेश', 'दोस्त को मैसेज', 'message karo', 'msg karo', 'sandesh bhejo', 'dost ko msg'],
      ur: ['میسج', 'پیغام', 'دوست کو میسج', 'message karo', 'msg karo', 'paigham bhejo', 'dost ko msg'],
    }),
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
    label: t('common.shortcut_baithak_search'),
    icon: 'users',
    keywords: kw(['find people', 'meet people', 'khoj'], {
      hi: ['दोस्त', 'नए दोस्त', 'लोग ढूँढें', 'लोगों से मिलें', 'dost', 'dosth', 'naye dost', 'log dhundo'],
      ur: ['دوست', 'نئے دوست', 'لوگ ڈھونڈیں', 'لوگوں سے ملیں', 'dost', 'naye dost', 'log dhundo', 'dost banao'],
    }),
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
    label: t('khoj.invite_friends'),
    icon: 'share',
    keywords: kw(['invite', 'share app', 'refer'], {
      hi: ['इनवाइट', 'बुला', 'न्योता', 'ऐप शेयर', 'invite karo', 'bulao', 'dost bulao', 'nyota'],
      ur: ['انوائٹ', 'بلائیں', 'دعوت', 'ایپ شیئر', 'invite karo', 'bulao', 'dost bulao', 'dawat'],
    }),
    phrases: [/invite (friends|someone)/i],
    priority: 70,
    run: () => {
      if (typeof shareInviteToChaupaal === 'function') shareInviteToChaupaal();
      else if (typeof showToast === 'function') showToast(t('common.invite_link_copied'));
    },
  });

  // —— Profile & account ——
  reg({
    id: 'profile.open',
    category: 'profile',
    label: t('khoj.open_your_profile'),
    icon: 'user',
    keywords: kw(['my profile', 'open profile'], {
      hi: ['प्रोफ़ाइल', 'मेरी प्रोफ़ाइल', 'मेरा प्रोफ़ाइल', 'profile dekho', 'meri profile', 'mera profile'],
      ur: ['پروفائل', 'میری پروفائل', 'میرا پروفائل', 'profile dekho', 'meri profile', 'mera profile'],
    }),
    phrases: [/open (my )?profile/i],
    priority: 72,
    requiresAuth: true,
    run: () => {
      if (needSignIn()) return;
      if (typeof openUserProfile === 'function') {
        openUserProfile({ uid: currentUser.uid }, { context: 'chaupaal_cmd', initialMode: 'preview' });
      } else if (typeof openOwnProfilePreview === 'function') openOwnProfilePreview({ owner: true });
      else if (typeof openChaupaalProfileHub === 'function') openChaupaalProfileHub();
    },
  });
  reg({
    id: 'profile.edit',
    category: 'profile',
    label: t('khoj.edit_profile'),
    icon: 'pen',
    keywords: kw(['edit profile', 'update profile'], {
      hi: ['प्रोफ़ाइल बदल', 'प्रोफ़ाइल एडिट', 'बदल', 'नाम बदल', 'profile badlo', 'badlo', 'profile edit karo'],
      ur: ['پروفائل بدلیں', 'پروفائل ایڈٹ', 'نام بدلیں', 'ترمیم', 'profile badlo', 'badlo', 'profile edit karo'],
    }),
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
    label: t('common.open_archive'),
    icon: 'archive',
    keywords: kw(['archive', 'my posts', 'saved posts'], {
      hi: ['आर्काइव', 'संग्रह', 'पुरानी पोस्ट', 'मेरी पोस्ट', 'archive dekho', 'purani post', 'meri post'],
      ur: ['آرکائیو', 'پرانی پوسٹ', 'میری پوسٹ', 'محفوظ پوسٹ', 'archive dekho', 'purani post', 'meri post'],
    }),
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
    label: t('khoj.private_journal'),
    icon: 'book',
    keywords: kw(['journal', 'diary', 'private notes'], {
      hi: ['जर्नल', 'डायरी', 'रोज़नामचा', 'निजी नोट्स', 'dayri', 'diary likho', 'roznamcha'],
      ur: ['جرنل', 'ڈائری', 'روزنامچہ', 'نجی نوٹس', 'diary likho', 'roznamcha', 'zaati notes'],
    }),
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
    label: t('common.settings'),
    icon: 'settings',
    keywords: kw(['settings', 'preferences'], {
      hi: ['सेटिंग्स', 'सेटिंग', 'भाषा', 'प्राइवेसी', 'setting', 'setting kholo', 'bhasha'],
      ur: ['سیٹنگز', 'سیٹنگ', 'ترتیبات', 'زبان', 'پرائیویسی', 'setting', 'setting kholo', 'zaban'],
    }),
    phrases: [/open settings/i],
    priority: 75,
    run: () => {
      if (typeof openSettingsModal === 'function') openSettingsModal();
    },
  });
  reg({
    id: 'profile.notifications',
    category: 'profile',
    label: t('common.notifications'),
    icon: 'bell',
    keywords: kw(['notifications', 'alerts'], {
      hi: ['नोटिफ़िकेशन', 'सूचना', 'अलर्ट', 'घंटी', 'suchna', 'soochna', 'notification dekho'],
      ur: ['نوٹیفکیشن', 'اطلاعات', 'اطلاع', 'الرٹ', 'ittila', 'ittilaat', 'notification dekho'],
    }),
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
    label: t('khoj.chaupaal_money'),
    icon: 'wallet',
    keywords: kw(['money', 'balance', 'pradhan', 'wallet', 'account'], {
      hi: ['पैसे', 'पैसा', 'बैलेंस', 'वॉलेट', 'प्रधान', 'paise', 'paisa', 'khata'],
      ur: ['پیسے', 'پیسہ', 'بیلنس', 'والٹ', 'کھاتہ', 'paise', 'paisa', 'khata'],
    }),
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
    label: t('khoj.membership'),
    icon: 'star',
    keywords: kw(['membership', 'subscribe', 'upgrade', 'premium', 'sarpanch'], {
      hi: ['मेंबरशिप', 'सदस्यता', 'प्रीमियम', 'सब्सक्रिप्शन', 'अपग्रेड', 'सरपंच', 'sadasyata', 'premium lo'],
      ur: ['ممبرشپ', 'رکنیت', 'پریمیم', 'سبسکرپشن', 'اپ گریڈ', 'rukniyat', 'premium lo', 'membership lo'],
    }),
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
    label: t('common.search_chaupaal'),
    icon: 'search',
    keywords: kw(['search'], {
      hi: ['खोज', 'ढूँढो', 'तलाश', 'talaash', 'talash', 'khojna', 'dhoondhna'],
      ur: ['تلاش', 'ڈھونڈو', 'کھوج', 'talash', 'talaash', 'dhoondo', 'dhundo'],
    }),
    phrases: [/^search\b/i],
    priority: 55,
    run: () => {
      if (typeof window.openVrikshaChaupaalSearch === 'function') window.openVrikshaChaupaalSearch();
    },
  });
  reg({
    id: 'tool.feedback',
    category: 'help',
    label: t('common.feedback_send'),
    icon: 'message-square',
    keywords: kw(['feedback', 'bug', 'report', 'complaint'], {
      hi: ['फ़ीडबैक', 'शिकायत', 'सुझाव', 'बग', 'shikayat', 'sujhav', 'gadbad', 'galti batao'],
      ur: ['فیڈبیک', 'شکایت', 'تجویز', 'مسئلہ', 'shikayat', 'tajweez', 'ghalti batao', 'masla'],
    }),
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
    label: t('khoj.music_hub'),
    icon: 'music',
    keywords: kw(['music', 'songs', 'radio'], {
      hi: ['म्यूज़िक', 'गाना', 'गाने', 'संगीत', 'gaana', 'gaane', 'gana', 'sangeet'],
      ur: ['میوزک', 'گانا', 'گانے', 'موسیقی', 'gaana', 'gana', 'gaane', 'mausiqi'],
    }),
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
    label: t('khoj.what_can_you_do'),
    icon: 'help-circle',
    keywords: kw(['help', 'what can you do', 'commands', 'menu'], {
      hi: ['मदद', 'सहायता', 'क्या कर सकते हो', 'कमांड', 'madad', 'help karo', 'kya kar sakte ho'],
      ur: ['مدد', 'رہنمائی', 'کیا کر سکتے ہو', 'کمانڈ', 'madad', 'madad karo', 'kya kar sakte ho'],
    }),
    phrases: [/what can you do/i, /^help$/i, /show (me )?options/i],
    priority: 90,
    run: () => {
      if (typeof appendChaupaalHelpCard === 'function') appendChaupaalHelpCard();
    },
  });

  // —— Dangal games (P16): every roster title by name, alias or need — "play imposter",
  //    "poker with friends", "daily word game". Deterministic (DangalAssist); retired names land on
  //    the retired screen. Age-gated titles still pass through the registry's 18+ gate.
  const DA = window.DangalAssist;
  function openGame(id) {
    switchTab('dangal');
    if (typeof handleDangalGameTap === 'function') handleDangalGameTap(id);
    else if (typeof getGame === 'function' && getGame(id)) getGame(id).launch({ source: 'chaupaal_cmd' });
  }
  if (DA && Array.isArray(DA.CATALOG)) {
    DA.CATALOG.forEach((g) => {
      const name = g.name.toLowerCase();
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[’']/g, "['’]?");
      reg({
        id: `dangal.game.${g.id}`,
        category: 'create',
        label: t('khoj.play_name', { name: g.name }),
        icon: 'gamepad',
        keywords: kw([name].concat(g.keys.filter((k) => k.length > 3).slice(0, 6)), g.langKeys),
        phrases: [new RegExp(`\\b(play|start|open)\\s+(a\\s+)?(game\\s+of\\s+)?${esc(name)}\\b`, 'i')],
        priority: 77,
        run: () => openGame(g.id),
      });
    });
    reg({
      id: 'dangal.find_game',
      category: 'create',
      label: t('khoj.find_a_game'),
      icon: 'gamepad',
      keywords: kw(['game with friends', 'party game', 'daily puzzle', 'daily word game', 'card game'], {
        hi: ['दोस्तों के साथ गेम', 'पार्टी गेम', 'पत्तों का गेम', 'ताश का खेल', 'रोज़ की पहेली', 'doston ke saath game', 'taash khel', 'roz ki paheli'],
        ur: ['دوستوں کے ساتھ گیم', 'پارٹی گیم', 'تاش کا کھیل', 'پتوں کا گیم', 'روز کی پہیلی', 'doston ke saath game', 'taash khel', 'roz ki paheli'],
      }),
      phrases: [/\b(play|start)\b.+\b(with friends|game|puzzle)\b/i, /\bdaily (word|puzzle|quiz)\b/i],
      priority: 75,
      run: (ctx) => {
        const r = DA.resolveGame((ctx && ctx.sourceText) || '');
        if (r && r.id) return openGame(r.id);
        if (r && r.retired) {
          switchTab('dangal');
          if (typeof openRetiredGameScreen === 'function') return openRetiredGameScreen(r.retired);
        }
        switchTab('dangal');
        if (window.DangalAssistUI && typeof DangalAssistUI.openSuggestSheet === 'function') DangalAssistUI.openSuggestSheet();
        else if (typeof setDangalSection === 'function') setDangalSection('manch');
      },
    });
  }
})();
