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
      bn: ['খবর', 'সংবাদ', 'নিউজ', 'আখবার', 'khobor', 'khabor', 'songbad', 'news dekhi'],
      ta: ['செய்திகள்', 'செய்தி', 'நியூஸ்', 'seithigal', 'seidhigal', 'seithi', 'news paaru'],
      te: ['వార్తలు', 'వార్త', 'న్యూస్', 'vartalu', 'vaartalu', 'varthalu', 'news chudu'],
    },
    duniya: {
      hi: ['दुनिया', 'फ़ीड', 'होम फ़ीड', 'dunia', 'duniyaa', 'feed dekho'],
      ur: ['دنیا', 'فیڈ', 'ہوم فیڈ', 'dunya', 'dunia', 'feed dekho'],
      bn: ['দুনিয়া', 'ফিড', 'হোম ফিড', 'dunia', 'duniya feed', 'feed dekhi'],
      ta: ['ஃபீடு', 'ஃபீட்', 'ஹோம் ஃபீடு', 'துனியா', 'dunia', 'feed paaru'],
      te: ['ఫీడ్', 'హోమ్ ఫీడ్', 'దునియా', 'dunia', 'feed chudu'],
    },
    peepal: {
      hi: ['पीपल', 'पीपल का पेड़', 'pipal', 'peepal ped', 'pipal ka ped'],
      ur: ['پیپل', 'پیپل کا درخت', 'pipal', 'peepal darakht', 'pipal ka darakht'],
      bn: ['পিপল', 'অশ্বত্থ গাছ', 'পিপুল গাছ', 'pipal', 'pipul', 'peepal gach'],
      ta: ['பீப்பல்', 'அரச மரம்', 'அரசமரம்', 'pipal', 'arasa maram', 'arasamaram'],
      te: ['పీపల్', 'రావి చెట్టు', 'రావిచెట్టు', 'pipal', 'raavi chettu', 'ravi chettu'],
    },
    baithak: {
      hi: ['बैठक', 'चैट', 'बातें', 'बातचीत', 'baatein', 'baaten', 'baatcheet', 'gupshup'],
      ur: ['بیٹھک', 'چیٹ', 'بات چیت', 'باتیں', 'گپ شپ', 'baat cheet', 'baatein', 'gupshup'],
      bn: ['বৈঠক', 'চ্যাট', 'আড্ডা', 'কথাবার্তা', 'boithok', 'adda', 'kothabarta', 'chat kori'],
      ta: ['சாட்', 'அரட்டை', 'உரையாடல்', 'பைட்டக்', 'arattai', 'aratai', 'chat pannu'],
      te: ['చాట్', 'ముచ్చట్లు', 'కబుర్లు', 'బైఠక్', 'muchatlu', 'kaburlu', 'chat cheyyi'],
    },
    dangal: {
      hi: ['दंगल', 'खेल', 'गेम', 'khel', 'game khelo'],
      ur: ['دنگل', 'کھیل', 'گیم', 'گیمز', 'khel', 'game khelo', 'khelein'],
      bn: ['দঙ্গল', 'খেলা', 'খেল', 'গেম', 'khela', 'khelbo', 'game khelo'],
      ta: ['விளையாட்டு', 'விளையாடு', 'ஆட்டம்', 'கேம்', 'vilayattu', 'vilaiyattu', 'vilayadu', 'game aadu'],
      te: ['ఆట', 'గేమ్', 'ఆడుకుందాం', 'aata', 'aadukundam', 'game aadu'],
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
      bn: ['খোঁজ', 'মানুষ খুঁজুন', 'নতুন মানুষ', 'লোকজন খুঁজুন', 'manush khuji', 'notun manush', 'lok khoja'],
      ta: ['நபர்களைத் தேடு', 'புதிய நபர்கள்', 'ஆட்களைத் தேடு', 'கோஜ்', 'nabargalai thedu', 'puthiya nabargal', 'pudhiya nabargal'],
      te: ['వ్యక్తులను వెతకండి', 'కొత్త వ్యక్తులు', 'కొత్త వాళ్ళు', 'ఖోజ్', 'vyaktulanu vetakandi', 'kotha vyaktulu', 'kotta vallu'],
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
      bn: ['বৃক্ষ', 'আলোচনা', 'তর্ক', 'বিতর্ক', 'alochona', 'torko', 'bitorko'],
      ta: ['விவாதம்', 'விவாதங்கள்', 'கலந்துரையாடல்', 'விருக்ஷா', 'vivatham', 'vivadham', 'vivaadham'],
      te: ['చర్చ', 'చర్చలు', 'వాదన', 'వృక్ష', 'charcha', 'charchalu', 'vaadana'],
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
      bn: ['মশহুর', 'জনপ্রিয়', 'ট্রেন্ডিং', 'বিখ্যাত', 'jonopriyo', 'jonoprio', 'trending'],
      ta: ['பிரபலம்', 'பிரபலமான', 'டிரெண்டிங்', 'ட்ரெண்டிங்', 'prabalam', 'pirabalam', 'trending'],
      te: ['పాపులర్', 'ప్రసిద్ధ', 'ప్రముఖ', 'ట్రెండింగ్', 'prasiddha', 'pramukha', 'trending'],
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
      bn: ['চৌপালে খুঁজুন', 'সব খুঁজুন', 'সার্চ', 'খুঁজুন', 'search kori', 'khujun', 'khoja'],
      ta: ['சௌபாலில் தேடு', 'எல்லாம் தேடு', 'தேடு', 'சர்ச்', 'thedu', 'theadu', 'search pannu'],
      te: ['చౌపాల్‌లో వెతకండి', 'అన్నీ వెతకండి', 'వెతకండి', 'సెర్చ్', 'vetakandi', 'vethakandi', 'search cheyyi'],
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
      bn: ['বিশ্ব', 'বিশ্বজুড়ে', 'সারা দুনিয়া', 'সবার পোস্ট', 'bishwo', 'bishsho', 'shobar post'],
      ta: ['உலகம்', 'உலகெங்கும்', 'எல்லோரின் போஸ்ட்', 'விஷ்வா', 'ulagam', 'ulagengum', 'ellar post'],
      te: ['ప్రపంచం', 'ప్రపంచమంతా', 'అందరి పోస్ట్‌లు', 'విశ్వ', 'prapancham', 'vishwam', 'andari posts'],
    },
    lehar: {
      hi: ['लहर', 'रील', 'छोटे वीडियो', 'वीडियो', 'lahar', 'leher', 'reel dekho', 'chhote video'],
      ur: ['لہر', 'ریل', 'ریلز', 'مختصر ویڈیو', 'ویڈیو', 'lahar', 'leher', 'reel dekho'],
      bn: ['লহর', 'রিল', 'রিলস', 'ছোট ভিডিও', 'ভিডিও', 'lohor', 'reel dekhi', 'choto video'],
      ta: ['ரீல்', 'ரீல்ஸ்', 'சிறு வீடியோ', 'வீடியோ', 'reel paaru', 'siru video', 'chinna video'],
      te: ['రీల్', 'రీల్స్', 'చిన్న వీడియోలు', 'వీడియో', 'reel chudu', 'reels chudu', 'chinna video'],
    },
    prasidha: {
      hi: ['प्रसिद्ध', 'टॉप पोस्ट', 'सबसे पसंद', 'prasiddh', 'prasidh', 'top post'],
      ur: ['پرسدھ', 'ٹاپ پوسٹ', 'سب سے پسندیدہ', 'top post', 'pasandeeda', 'sab se pasand'],
      bn: ['প্রসিদ্ধ', 'টপ পোস্ট', 'সবচেয়ে পছন্দের', 'proshiddho', 'top post', 'sobcheye pochonder'],
      ta: ['டாப் போஸ்ட்', 'சிறந்த போஸ்ட்', 'அதிகம் விரும்பப்பட்டவை', 'top post', 'sirandha post', 'siranda post'],
      te: ['టాప్ పోస్ట్', 'ఉత్తమ పోస్ట్‌లు', 'ఎక్కువ నచ్చినవి', 'top post', 'uttama post', 'ekkuva nachinavi'],
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
    ['sambhavanayein', 'Sambhavanayein', /sambhavanayein/i, { hi: ['संभावनाएँ', 'नए कनेक्शन', 'अनजान लोगों की चैट', 'sambhavna', 'naye connection', 'anjaan chat'], ur: ['سمبھاونائیں', 'نئے کنکشن', 'اجنبی چیٹ', 'انجان لوگوں سے چیٹ', 'naye connection', 'ajnabi chat', 'anjaan chat'], bn: ['সম্ভাবনা', 'নতুন কানেকশন', 'অচেনা মানুষের সাথে চ্যাট', 'shombhabona', 'notun connection', 'ochena chat'], ta: ['புதிய இணைப்புகள்', 'புதிய கனெக்ஷன்', 'அந்நியர் சாட்', 'puthiya connection', 'pudhu connection', 'anniyar chat'], te: ['కొత్త కనెక్షన్లు', 'కొత్త పరిచయాలు', 'అపరిచితుల చాట్', 'kotha connection', 'kotta parichayalu', 'aparichitula chat'] }], // i18n-ignore (brand name / code)
    ['sabha', 'Sabha', /open sabha/i, { hi: ['सभा', 'सारी चैट', 'सब चैट', 'saari chat', 'sari chat', 'sab chat'], ur: ['سبھا', 'ساری چیٹس', 'سب چیٹ', 'تمام چیٹس', 'saari chat', 'sab chat', 'tamam chat'], bn: ['সভা', 'সব চ্যাট', 'সমস্ত চ্যাট', 'shobha', 'shob chat', 'sob chat'], ta: ['எல்லா சாட்', 'அனைத்துச் சாட்', 'சபை', 'ella chat', 'ellaa chat', 'sabai'], te: ['అన్ని చాట్‌లు', 'మొత్తం చాట్‌లు', 'సభ', 'anni chats', 'anni chatlu', 'mottam chats'] }], // i18n-ignore (brand name / code)
    ['mitra', 'Mitra', /open mitra/i, { hi: ['मित्र', 'दोस्त', 'दोस्तों की चैट', 'mitr', 'dost chat', 'doston ki chat'], ur: ['مترا', 'دوست', 'دوستوں کی چیٹ', 'یار', 'dost chat', 'doston ki chat', 'yaar'], bn: ['মিত্র', 'বন্ধু', 'বন্ধুদের চ্যাট', 'mitro', 'bondhu', 'bondhuder chat'], ta: ['நண்பர் சாட்', 'நண்பர்கள் சாட்', 'தோழர்', 'மித்ரா', 'nanbar chat', 'nanbargal chat', 'thozhar'], te: ['స్నేహితుల చాట్', 'మిత్రులు', 'నేస్తం', 'మిత్ర', 'snehitula chat', 'mitrulu', 'nestam'] }], // i18n-ignore (brand name / code)
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
      bn: ['লুকানো চ্যাট', 'গোপন চ্যাট', 'গোপন', 'সিন্দুক', 'lukano chat', 'gopon', 'gopon chat'],
      ta: ['மறைத்த சாட்', 'மறைக்கப்பட்ட', 'ரகசிய சாட்', 'ரகசியம்', 'பெட்டகம்', 'maraitha chat', 'ragasiya chat', 'rahasiya chat'],
      te: ['దాచిన చాట్', 'దాచిన', 'రహస్య చాట్', 'రహస్యం', 'daachina chat', 'dachina chat', 'rahasya chat'],
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
      bn: ['শিরোনাম', 'হেডলাইন', 'প্রধান খবর', 'বড় খবর', 'shironam', 'headline', 'boro khobor'],
      ta: ['தலைப்புச் செய்தி', 'தலைப்பு செய்தி', 'முக்கிய செய்திகள்', 'ஹெட்லைன்', 'thalaippu seithi', 'thalaipu seithi', 'headline'],
      te: ['ముఖ్యాంశాలు', 'ముఖ్య వార్తలు', 'హెడ్‌లైన్', 'పెద్ద వార్త', 'mukhyamsalu', 'mukhya vartalu', 'headline'],
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
      bn: ['খবর', 'সব খবর', 'সমস্ত খবর', 'khobor', 'shob khobor', 'sob khobor'],
      ta: ['எல்லா செய்திகள்', 'அனைத்துச் செய்திகள்', 'அனைத்து செய்திகள்', 'ella seithigal', 'ellaa seithigal', 'anaithu seithigal'],
      te: ['అన్ని వార్తలు', 'మొత్తం వార్తలు', 'ఖబర్', 'anni vartalu', 'anni varthalu', 'mottam vartalu'],
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
      bn: ['সাথী', 'বন্ধুদের আপডেট', 'কাছের মানুষের খবর', 'sathi', 'bondhuder update', 'kacher manusher khobor'],
      ta: ['நண்பர்களின் அப்டேட்', 'நண்பர் அப்டேட்', 'சாத்தி', 'nanbargal update', 'nanbar update', 'sathi'],
      te: ['స్నేహితుల అప్‌డేట్స్', 'నేస్తాలు', 'సాథీ', 'snehitula updates', 'nestalu', 'sathi'],
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
      bn: ['সফর', 'যাত্রা', 'আমার সফর', 'স্ট্রিক', 'sofor', 'amar sofor', 'jatra'],
      ta: ['பயணம்', 'என் பயணம்', 'ஸ்ட்ரீக்', 'payanam', 'en payanam', 'streak'],
      te: ['ప్రయాణం', 'నా ప్రయాణం', 'స్ట్రీక్', 'prayanam', 'naa prayanam', 'streak'],
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
      bn: ['ক্যাটাগরি যোগ', 'ক্যাটেগরি যোগ', 'নতুন ক্যাটাগরি', 'বিভাগ যোগ', 'নতুন বিষয়', 'category jog', 'notun category', 'notun bishoy'],
      ta: ['வகையைச் சேர்', 'வகை சேர்', 'புதிய வகை', 'கேட்டகிரி சேர்', 'புதிய தலைப்பு', 'vagai ser', 'puthiya vagai', 'category ser'],
      te: ['కేటగిరీ జోడించండి', 'కొత్త కేటగిరీ', 'విభాగం జోడించు', 'కొత్త అంశం', 'category jodinchu', 'kotha category', 'kotta category'],
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
      bn: ['আজকের গেম', 'আজকের খেলা', 'রোজের গেম', 'ajker game', 'ajker khela', 'rojer game'],
      ta: ['இன்றைய ஆட்டம்', 'இன்றைய விளையாட்டு', 'இன்றைய', 'தினசரி ஆட்டம்', 'indraya aattam', 'inraiya vilayattu', 'indraya'],
      te: ['ఈరోజు ఆట', 'నేటి ఆట', 'ఈరోజు', 'రోజువారీ ఆట', 'eeroju aata', 'neti aata', 'eeroju'],
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
      bn: ['মঞ্চ', 'সব গেম', 'সব খেলা', 'গেম লাইব্রেরি', 'monch', 'shob game', 'sob game'],
      ta: ['மேடை', 'எல்லா விளையாட்டுகள்', 'விளையாட்டுகள்', 'கேம் லைப்ரரி', 'medai', 'ella vilayattugal', 'vilayattugal'],
      te: ['మంచ్', 'అన్ని ఆటలు', 'ఆటలు', 'గేమ్ లైబ్రరీ', 'anni aatalu', 'aatalu', 'anni games'],
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
      bn: ['ময়দান', 'গেম চালিয়ে যান', 'অসমাপ্ত গেম', 'অর্ধেক খেলা', 'moydan', 'game chalu', 'oshomapto game'],
      ta: ['மைதானம்', 'ஆட்டத்தைத் தொடர்', 'தொடர்ந்து ஆடு', 'பாதி ஆட்டம்', 'maidhanam', 'maidanam', 'aattam thodar'],
      te: ['మైదాన్', 'మైదానం', 'ఆట కొనసాగించు', 'సగం ఆట', 'maidanam', 'aata konasaginchu', 'sagam aata'],
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
      bn: ['উন্নতি', 'অগ্রগতি', 'পরিসংখ্যান', 'unnoti', 'ogrogoti', 'progress dekhi'],
      ta: ['முன்னேற்றம்', 'என் முன்னேற்றம்', 'புள்ளிவிவரம்', 'munnetram', 'munnerram', 'progress paaru'],
      te: ['ప్రగతి', 'పురోగతి', 'గణాంకాలు', 'pragati', 'purogati', 'progress chudu'],
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
      bn: ['চ্যালেঞ্জ', 'টক্কর', 'লড়াই', 'মুখোমুখি', 'challenge kori', 'lorai', 'tokkor'],
      ta: ['சவால்', 'சேலஞ்ச்', 'போட்டி', 'நேருக்கு நேர்', 'savaal', 'saval', 'challenge pannu'],
      te: ['సవాలు', 'ఛాలెంజ్', 'పోటీ', 'ముఖాముఖి', 'savaalu', 'savalu', 'challenge cheyyi'],
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
      bn: ['পোস্ট', 'ছবি', 'ফটো', 'আপলোড', 'notun post', 'post kori', 'chobi', 'chhobi'],
      ta: ['போஸ்ட்', 'படம்', 'புகைப்படம்', 'ஃபோட்டோ', 'பதிவேற்று', 'post podu', 'photo podu', 'padam podu'],
      te: ['పోస్ట్', 'ఫోటో', 'చిత్రం', 'అప్‌లోడ్', 'post cheyyi', 'photo pettu', 'kotha post'],
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
      bn: ['স্টোরি', 'গল্প', 'নতুন স্টোরি', 'golpo', 'story dao', 'story dei'],
      ta: ['ஸ்டோரி', 'கதை', 'புதிய ஸ்டோரி', 'story podu', 'kadhai', 'kathai'],
      te: ['స్టోరీ', 'కథ', 'కొత్త స్టోరీ', 'story pettu', 'story cheyyi', 'katha'],
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
      bn: ['স্প্লিট', 'স্ট্যাটাস', 'নতুন স্প্লিট', 'status dao', 'split dao', 'notun split'],
      ta: ['ஸ்பிளிட்', 'ஸ்டேட்டஸ்', 'புதிய ஸ்பிளிட்', 'status podu', 'split podu', 'puthiya split'],
      te: ['స్ప్లిట్', 'స్టేటస్', 'కొత్త స్ప్లిట్', 'status pettu', 'split pettu', 'kotha split'],
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
      bn: ['প্রশ্ন', 'জিজ্ঞেস', 'মতামত', 'আলোচনা করুন', 'proshno', 'prosno', 'jiggesh', 'motamot'],
      ta: ['கேள்வி', 'கேள்', 'கருத்து', 'விவாதி', 'kelvi', 'kel', 'karuthu'],
      te: ['ప్రశ్న', 'అడగండి', 'అభిప్రాయం', 'చర్చించండి', 'prashna', 'prasna', 'adagandi', 'abhiprayam'],
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
      bn: ['পোল', 'সার্ভে', 'ফর্ম', 'ভোট', 'জরিপ', 'poll banai', 'survey kori', 'jorip'],
      ta: ['வாக்கெடுப்பு', 'கருத்துக்கணிப்பு', 'கணக்கெடுப்பு', 'படிவம்', 'சர்வே', 'vaakeduppu', 'vakkeduppu', 'poll podu'],
      te: ['పోల్', 'సర్వే', 'ఫారమ్', 'ఓటింగ్', 'అభిప్రాయ సేకరణ', 'poll pettu', 'survey cheyyi', 'voting'],
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
      bn: ['মেহফিল', 'একসাথে দেখি', 'একসাথে দেখুন', 'ওয়াচ পার্টি', 'mahfil', 'eksathe dekhi', 'ekshathe dekhi'],
      ta: ['சேர்ந்து பார்', 'ஒன்றாகப் பார்', 'வாட்ச் பார்ட்டி', 'மெஹ்பில்', 'serndhu paaru', 'serndhu paarkalam', 'ondraga paaru'],
      te: ['కలిసి చూద్దాం', 'కలిసి చూడండి', 'వాచ్ పార్టీ', 'మెహ్‌ఫిల్', 'kalisi chuddam', 'kalisi chudandi', 'mehfil pettu'],
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
      bn: ['মুকাবলা', 'কুইজ চ্যালেঞ্জ', 'জ্ঞানের লড়াই', 'mukabla', 'quiz challenge', 'quiz lorai'],
      ta: ['வினாடி வினா சவால்', 'க்விஸ் சவால்', 'அறிவுப் போட்டி', 'முகாபலா', 'quiz saval', 'arivu potti', 'mukabla'],
      te: ['క్విజ్ సవాలు', 'క్విజ్ ఛాలెంజ్', 'జ్ఞాన పోటీ', 'ముకాబలా', 'quiz savalu', 'quiz poti', 'mukabla'],
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
      bn: ['খেলুন', 'গেম খেলি', 'গেম শুরু', 'দাবা', 'লুডু', 'khelun', 'game shuru', 'daba'],
      ta: ['விளையாடலாம்', 'ஆட்டம் தொடங்கு', 'கேம் தொடங்கு', 'சதுரங்கம்', 'லூடோ', 'vilayadalam', 'aadalam', 'game thodangu'],
      te: ['ఆడండి', 'ఆడదాం', 'ఆడుదాం', 'ఆట మొదలుపెట్టు', 'లూడో', 'aadandi', 'aadadam', 'aadudam'],
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
      bn: ['শুভেচ্ছা', 'জন্মদিন', 'বার্থডে', 'অভিনন্দন', 'shubhechha', 'subhechha', 'jonmodin', 'ovinondon'],
      ta: ['வாழ்த்து', 'பிறந்தநாள்', 'பிறந்த நாள்', 'பர்த்டே', 'vazhthu', 'vaazhthu', 'pirandhanaal', 'piranthanaal'],
      te: ['శుభాకాంక్షలు', 'పుట్టినరోజు', 'పుట్టిన రోజు', 'బర్త్‌డే', 'అభినందనలు', 'subhakankshalu', 'puttinaroju', 'puttina roju'],
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
      bn: ['মেসেজ', 'বার্তা', 'বন্ধুকে মেসেজ', 'message dao', 'msg dao', 'barta pathao', 'bondhuke msg'],
      ta: ['மெசேஜ்', 'செய்தி அனுப்பு', 'நண்பருக்குச் செய்தி', 'message anuppu', 'msg anuppu', 'seithi anuppu'],
      te: ['మెసేజ్', 'సందేశం', 'స్నేహితులకు మెసేజ్', 'message cheyyi', 'msg pampu', 'sandesam pampu'],
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
      bn: ['বন্ধু', 'নতুন বন্ধু', 'মানুষ খুঁজুন', 'bondhu', 'bondu', 'notun bondhu', 'bondhu khuji'],
      ta: ['நண்பர்', 'நண்பன்', 'புதிய நண்பர்கள்', 'நபர்களைக் கண்டறி', 'nanbar', 'nanban', 'pudhiya nanbargal', 'friends thedu'],
      te: ['స్నేహితులు', 'స్నేహితుడు', 'కొత్త స్నేహితులు', 'ఫ్రెండ్స్', 'snehitulu', 'snehithulu', 'snehitudu', 'friends vetuku'],
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
      bn: ['আমন্ত্রণ', 'ইনভাইট', 'অ্যাপ শেয়ার', 'ডাকুন', 'invite kori', 'amontron', 'bondhuder dako'],
      ta: ['அழை', 'அழைப்பு', 'இன்வைட்', 'ஆப் பகிர்', 'azhai', 'invite pannu', 'nanbargalai azhai'],
      te: ['ఆహ్వానించండి', 'ఆహ్వానం', 'ఇన్వైట్', 'యాప్ షేర్', 'aahvanam', 'ahvanam', 'invite cheyyi'],
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
      bn: ['প্রোফাইল', 'আমার প্রোফাইল', 'প্রোফাইল দেখুন', 'profile dekhi', 'amar profile'],
      ta: ['புரொஃபைல்', 'ப்ரொஃபைல்', 'புரோஃபைல்', 'என் புரொஃபைல்', 'profile paaru', 'en profile'],
      te: ['ప్రొఫైల్', 'ప్రోఫైల్', 'నా ప్రొఫైల్', 'profile chudu', 'naa profile'],
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
      bn: ['প্রোফাইল এডিট', 'প্রোফাইল বদলান', 'নাম বদলান', 'সম্পাদনা', 'profile edit kori', 'profile bodlao', 'nam bodlao'],
      ta: ['புரொஃபைலைத் திருத்து', 'புரொஃபைல் திருத்து', 'திருத்து', 'பெயர் மாற்று', 'profile edit', 'profile maathu', 'peyar maathu'],
      te: ['ప్రొఫైల్ సవరించండి', 'ప్రొఫైల్ ఎడిట్', 'సవరించండి', 'పేరు మార్చు', 'profile edit cheyyi', 'profile marchu', 'peru marchu'],
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
      bn: ['আর্কাইভ', 'পুরোনো পোস্ট', 'পুরনো পোস্ট', 'আমার পোস্ট', 'সেভ করা পোস্ট', 'archive dekhi', 'purono post', 'amar post'],
      ta: ['காப்பகம்', 'ஆர்கைவ்', 'பழைய போஸ்ட்', 'என் போஸ்ட்', 'சேமித்த போஸ்ட்', 'archive paaru', 'pazhaya post', 'en post'],
      te: ['ఆర్కైవ్', 'పాత పోస్ట్‌లు', 'నా పోస్ట్‌లు', 'సేవ్ చేసిన పోస్ట్‌లు', 'archive chudu', 'patha posts', 'naa posts'],
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
      bn: ['জার্নাল', 'ডায়েরি', 'ডায়রি', 'দিনলিপি', 'ব্যক্তিগত নোট', 'dayeri', 'diary likhi', 'dinlipi'],
      ta: ['நாட்குறிப்பு', 'டைரி', 'ஜர்னல்', 'தனிப்பட்ட குறிப்பு', 'naatkurippu', 'natkurippu', 'diary ezhuthu'],
      te: ['జర్నల్', 'డైరీ', 'దినచర్య', 'వ్యక్తిగత నోట్స్', 'dairy', 'diary raayi', 'dinacharya'],
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
      bn: ['সেটিংস', 'সেটিং', 'ভাষা', 'প্রাইভেসি', 'setting', 'setting kholo', 'bhasha', 'vasha'],
      ta: ['அமைப்புகள்', 'அமைப்பு', 'செட்டிங்ஸ்', 'மொழி', 'தனியுரிமை', 'amaippugal', 'amaipugal', 'mozhi'],
      te: ['సెట్టింగ్‌లు', 'సెట్టింగ్', 'భాష', 'గోప్యత', 'settinglu', 'bhasha', 'baasha'],
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
      bn: ['নোটিফিকেশন', 'বিজ্ঞপ্তি', 'অ্যালার্ট', 'সতর্কবার্তা', 'notification dekhi', 'notifikeshon', 'biggopti'],
      ta: ['அறிவிப்புகள்', 'அறிவிப்பு', 'நோட்டிஃபிகேஷன்', 'அலர்ட்', 'arivippugal', 'arivippu', 'notification paaru'],
      te: ['నోటిఫికేషన్లు', 'నోటిఫికేషన్', 'అలర్ట్', 'notificationlu', 'notification chudu', 'alerts chudu'],
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
      bn: ['টাকা', 'ব্যালেন্স', 'ওয়ালেট', 'হিসাব', 'প্রধান', 'taka', 'balance dekhi', 'hishab'],
      ta: ['பணம்', 'இருப்பு', 'பேலன்ஸ்', 'வாலட்', 'கணக்கு', 'panam', 'balance paaru', 'kanakku'],
      te: ['డబ్బు', 'బ్యాలెన్స్', 'వాలెట్', 'ఖాతా', 'ప్రధాన్', 'dabbu', 'balance chudu', 'khaata'],
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
      bn: ['মেম্বারশিপ', 'সদস্যপদ', 'প্রিমিয়াম', 'সাবস্ক্রিপশন', 'আপগ্রেড', 'সরপঞ্চ', 'shodossopod', 'premium nin'],
      ta: ['உறுப்பினர்', 'சந்தா', 'பிரீமியம்', 'மெம்பர்ஷிப்', 'அப்கிரேட்', 'uruppinar', 'sandha', 'premium vaangu'],
      te: ['మెంబర్‌షిప్', 'సభ్యత్వం', 'ప్రీమియం', 'సబ్‌స్క్రిప్షన్', 'అప్‌గ్రేడ్', 'sabhyatvam', 'premium teesuko'],
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
      bn: ['খোঁজ', 'খুঁজুন', 'অনুসন্ধান', 'সার্চ', 'khoja', 'khuji', 'onusondhan'],
      ta: ['தேடல்', 'தேடு', 'சர்ச்', 'thedal', 'thedu', 'theduthal'],
      te: ['వెతకండి', 'వెతుకు', 'సెర్చ్', 'అన్వేషణ', 'vetuku', 'vethuku', 'search cheyyi'],
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
      bn: ['ফিডব্যাক', 'অভিযোগ', 'পরামর্শ', 'বাগ', 'সমস্যা জানান', 'obhijog', 'poramorsho', 'somossa'],
      ta: ['பின்னூட்டம்', 'புகார்', 'ஆலோசனை', 'பிழை', 'ஃபீட்பேக்', 'pinnoottam', 'pinnootam', 'pugar'],
      te: ['ఫీడ్‌బ్యాక్', 'ఫిర్యాదు', 'సూచన', 'బగ్', 'సమస్య', 'firyadu', 'suchana', 'samasya'],
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
      bn: ['মিউজিক', 'গান', 'সংগীত', 'সঙ্গীত', 'gaan', 'gan shuni', 'shongit', 'music shuni'],
      ta: ['இசை', 'பாட்டு', 'பாடல்', 'மியூசிக்', 'isai', 'paattu', 'paatu', 'paadal'],
      te: ['సంగీతం', 'పాటలు', 'పాట', 'మ్యూజిక్', 'sangeetham', 'paatalu', 'patalu', 'paata'],
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
      bn: ['সাহায্য', 'হেল্প', 'কী করতে পারো', 'কমান্ড', 'shahajjo', 'sahajjo', 'help koro', 'ki korte paro'],
      ta: ['உதவி', 'ஹெல்ப்', 'என்ன செய்யலாம்', 'கட்டளைகள்', 'udhavi', 'uthavi', 'enna seyyalam'],
      te: ['సహాయం', 'హెల్ప్', 'ఏమి చేయవచ్చు', 'ఏమేం చేయవచ్చు', 'sahayam', 'saayam', 'emi cheyyochu'],
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
        bn: ['বন্ধুদের সাথে গেম', 'পার্টি গেম', 'তাসের খেলা', 'রোজের ধাঁধা', 'bondhuder sathe game', 'taser khela', 'rojer dhadha'],
        ta: ['நண்பர்களுடன் விளையாட்டு', 'பார்ட்டி கேம்', 'சீட்டு விளையாட்டு', 'தினசரி புதிர்', 'nanbargaludan game', 'seettu aattam', 'dhinasari puthir'],
        te: ['స్నేహితులతో ఆట', 'పార్టీ గేమ్', 'ముక్కల ఆట', 'రోజువారీ పజిల్', 'snehitulatho aata', 'mukkala aata', 'roju puzzle'],
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
