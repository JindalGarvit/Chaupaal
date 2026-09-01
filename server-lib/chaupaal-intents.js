/**
 * Chaupaal navigator intent metadata + parse (server mirror).
 * Handlers are client-only; server uses this for deterministic replies when AI is off.
 */
'use strict';

function buildIntentCatalog() {
  const tab = (id, label, keywords, phrases, priority = 75) => ({
    id,
    category: 'navigate',
    label,
    icon: 'compass',
    keywords,
    phrases,
    priority,
    requiresAuth: false,
  });

  return [
    tab('tab.akhbaar', 'Open Akhbaar', ['akhbaar', 'news', 'khabar', 'headlines'], [/open (the )?akhbaar/i, /go to (the )?news/i]),
    tab('tab.duniya', 'Open Duniya', ['duniya', 'feed', 'vishwa'], [/open duniya/i, /go to duniya/i]),
    tab('tab.peepal', 'Open Peepal', ['peepal', 'discuss', 'community'], [/open peepal/i]),
    tab('tab.baithak', 'Open Baithak', ['baithak', 'chats', 'messages', 'inbox'], [/open (my )?chats/i, /open baithak/i]),
    tab('tab.dangal', 'Open Dangal', ['dangal', 'games', 'play'], [/open dangal/i, /play (a )?game/i]),

    tab('peepal.khoj', 'Khoj · Find people', ['khoj', 'find people', 'discover people'], [/find people/i, /open khoj/i], 72),
    tab('peepal.vriksha', 'Vriksha discussions', ['vriksha', 'discussions'], [/open vriksha/i], 68),
    tab('peepal.mashhoor', 'Mashhoor · Popular', ['mashhoor', 'popular'], [/open mashhoor/i], 68),
    {
      id: 'peepal.search',
      category: 'navigate',
      label: 'Search Chaupaal',
      icon: 'search',
      keywords: ['search', 'look up', 'find someone'],
      phrases: [/search (for|chaupaal)/i],
      priority: 70,
      requiresAuth: false,
    },

    tab('duniya.vishwa', 'Duniya Vishwa feed', ['vishwa', 'duniya feed'], [/vishwa/i], 68),
    tab('duniya.lehar', 'Duniya Lehar', ['lehar', 'reels', 'short video'], [/lehar/i, /reels/i], 70),
    tab('duniya.prasidha', 'Duniya Prasidha', ['prasidha', 'famous'], [/prasidha/i], 65),

    tab('baithak.sambhavanayein', 'Baithak Sambhavanayein', ['sambhavanayein', 'possibilities'], [/sambhavanayein/i], 65),
    tab('baithak.sabha', 'Baithak Sabha', ['sabha', 'groups'], [/open sabha/i], 65),
    tab('baithak.mitra', 'Baithak Mitra', ['mitra', 'friends chat'], [/open mitra/i], 65),
    tab('baithak.hidden', 'Hidden chats', ['hidden', 'vault', 'secret chats'], [/hidden (chats|vault)/i], 72),

    tab('akhbaar.surkhiya', 'Akhbaar Surkhiya', ['surkhiya', 'headlines'], [/surkhiya/i], 68),
    tab('akhbaar.khabar', 'Akhbaar Khabar', ['khabar', 'all news'], [/all news/i, /khabar/i], 65),
    tab('akhbaar.saathi', 'Akhbaar Saathi', ['saathi'], [/saathi/i], 65),
    tab('akhbaar.safar', 'Akhbaar Safar', ['safar', 'journey'], [/safar/i], 65),
    tab('akhbaar.add_category', 'Add Akhbaar category', ['add category', 'new category'], [/add (a )?category/i], 60),

    tab('dangal.khel', 'Dangal Khel', ['khel', 'game of the day', 'gotd'], [/game of the day/i, /gotd/i], 68),
    tab('dangal.manch', 'Dangal Manch', ['manch', 'library'], [/open manch/i], 65),
    tab('dangal.maidan', 'Dangal Maidan', ['maidan', 'resume game'], [/resume (my )?game/i], 65),
    tab('dangal.tarakki', 'Dangal Tarakki', ['tarakki', 'progress'], [/tarakki/i], 62),
    tab('dangal.challenge_gotd', 'Challenge GOTD', ['challenge', 'duel'], [/challenge (someone|friend)/i], 70),

    {
      id: 'duniya.post',
      category: 'create',
      label: 'Create Duniya post',
      icon: 'image',
      keywords: ['post', 'photo', 'upload', 'duniya post', 'share photo'],
      phrases: [/post (a |on )?duniya/i, /share (a )?photo/i, /create (a )?post/i],
      priority: 82,
      requiresAuth: true,
    },
    {
      id: 'duniya.story',
      category: 'create',
      label: 'Post a Duniya story',
      icon: 'circle',
      keywords: ['story', 'stories', 'duniya story'],
      phrases: [/post (a )?story/i, /add (a )?story/i, /new story/i],
      priority: 80,
      requiresAuth: true,
    },
    {
      id: 'baithak.split',
      category: 'create',
      label: 'New Split story',
      icon: 'zap',
      keywords: ['split', 'baithak story', 'status'],
      phrases: [/new split/i, /baithak story/i],
      priority: 78,
      requiresAuth: true,
    },
    {
      id: 'peepal.discuss',
      category: 'create',
      label: 'Ask on Peepal',
      icon: 'message-circle',
      keywords: ['ask', 'question', 'discuss', 'peepal'],
      phrases: [/ask (on )?peepal/i, /post (a )?question/i, /discuss something/i],
      priority: 78,
      requiresAuth: true,
    },
    {
      id: 'peepal.form',
      category: 'create',
      label: 'Peepal form poll',
      icon: 'list',
      keywords: ['form', 'poll', 'survey'],
      phrases: [/create (a )?(form|poll)/i],
      priority: 70,
      requiresAuth: true,
    },
    {
      id: 'mehfil.start',
      category: 'create',
      label: 'Start Mehfil',
      icon: 'users',
      keywords: ['mehfil', 'watch party', 'group watch'],
      phrases: [/start mehfil/i, /watch together/i],
      priority: 72,
      requiresAuth: true,
    },
    {
      id: 'muqabala.challenge',
      category: 'create',
      label: 'Muqabala challenge',
      icon: 'swords',
      keywords: ['muqabala', 'quiz challenge', 'trivia'],
      phrases: [/muqabala/i, /quiz challenge/i],
      priority: 75,
      requiresAuth: true,
    },
    {
      id: 'dangal.play',
      category: 'create',
      label: 'Pick a game',
      icon: 'gamepad',
      keywords: ['play', 'start game', 'pick game'],
      phrases: [/play (chess|ludo|game)/i, /start (a )?game/i],
      priority: 76,
      requiresAuth: false,
    },

    {
      id: 'social.wish_friend',
      category: 'social',
      label: 'Wish a friend',
      icon: 'heart',
      keywords: ['wish', 'birthday', 'greet', 'congratulate', 'anniversary', 'happy birthday'],
      phrases: [/wish (my )?friend/i, /happy birthday/i, /send (a )?greeting/i],
      priority: 85,
      requiresAuth: true,
    },
    {
      id: 'social.message_friend',
      category: 'social',
      label: 'Message a friend',
      icon: 'message',
      keywords: ['message', 'dm', 'text friend', 'chat with'],
      phrases: [/message (a |my )?friend/i, /dm (someone|friend)/i],
      priority: 80,
      requiresAuth: true,
    },
    {
      id: 'social.find_people',
      category: 'social',
      label: 'Find people',
      icon: 'users',
      keywords: ['find people', 'meet people', 'khoj'],
      phrases: [/find (new )?people/i, /meet someone/i],
      priority: 78,
      requiresAuth: false,
    },
    {
      id: 'social.invite',
      category: 'social',
      label: 'Invite friends',
      icon: 'share',
      keywords: ['invite', 'share app', 'refer'],
      phrases: [/invite (friends|someone)/i],
      priority: 70,
      requiresAuth: false,
    },

    {
      id: 'profile.open',
      category: 'profile',
      label: 'Open your profile',
      icon: 'user',
      keywords: ['my profile', 'open profile'],
      phrases: [/open (my )?profile/i],
      priority: 72,
      requiresAuth: true,
    },
    {
      id: 'profile.edit',
      category: 'profile',
      label: 'Edit profile',
      icon: 'pen',
      keywords: ['edit profile', 'update profile'],
      phrases: [/edit (my )?profile/i],
      priority: 70,
      requiresAuth: true,
    },
    {
      id: 'profile.archive',
      category: 'profile',
      label: 'Open Archive',
      icon: 'archive',
      keywords: ['archive', 'my posts', 'saved posts'],
      phrases: [/open (my )?archive/i, /see (my )?archive/i],
      priority: 80,
      requiresAuth: true,
    },
    {
      id: 'profile.journal',
      category: 'profile',
      label: 'Private journal',
      icon: 'book',
      keywords: ['journal', 'diary', 'private notes'],
      phrases: [/open (my )?journal/i, /write (in )?journal/i],
      priority: 78,
      requiresAuth: true,
    },
    {
      id: 'profile.settings',
      category: 'profile',
      label: 'Settings',
      icon: 'settings',
      keywords: ['settings', 'preferences'],
      phrases: [/open settings/i],
      priority: 75,
      requiresAuth: false,
    },
    {
      id: 'profile.notifications',
      category: 'profile',
      label: 'Notifications',
      icon: 'bell',
      keywords: ['notifications', 'alerts'],
      phrases: [/open notifications/i, /notification (inbox|center)/i],
      priority: 72,
      requiresAuth: true,
    },
    {
      id: 'money.account',
      category: 'profile',
      label: 'Chaupaal Money',
      icon: 'wallet',
      keywords: ['money', 'balance', 'pradhan', 'wallet', 'account'],
      phrases: [/chaupaal money/i, /my balance/i],
      priority: 78,
      requiresAuth: true,
    },
    {
      id: 'money.membership',
      category: 'profile',
      label: 'Membership',
      icon: 'star',
      keywords: ['membership', 'subscribe', 'upgrade', 'premium', 'sarpanch'],
      phrases: [/see membership/i, /upgrade (my )?plan/i],
      priority: 78,
      requiresAuth: true,
    },

    {
      id: 'tool.search',
      category: 'help',
      label: 'Search Chaupaal',
      icon: 'search',
      keywords: ['search'],
      phrases: [/^search\b/i],
      priority: 55,
      requiresAuth: false,
    },
    {
      id: 'tool.feedback',
      category: 'help',
      label: 'Send feedback',
      icon: 'message-square',
      keywords: ['feedback', 'bug', 'report', 'complaint'],
      phrases: [/send feedback/i, /report (a )?bug/i],
      priority: 75,
      requiresAuth: false,
    },
    {
      id: 'tool.music',
      category: 'help',
      label: 'Music hub',
      icon: 'music',
      keywords: ['music', 'songs', 'radio'],
      phrases: [/open music/i, /music hub/i],
      priority: 65,
      requiresAuth: false,
    },
    {
      id: 'help.what_can_you_do',
      category: 'help',
      label: 'What can you do?',
      icon: 'help-circle',
      keywords: ['help', 'what can you do', 'commands', 'menu'],
      phrases: [/what can you do/i, /^help$/i, /show (me )?options/i],
      priority: 90,
      requiresAuth: false,
    },
  ];
}

const INTENT_CATALOG = buildIntentCatalog();

function compilePhrase(p) {
  if (p instanceof RegExp) return p;
  try {
    return new RegExp(p, 'i');
  } catch {
    return null;
  }
}

function parseChaupaalIntents(text, catalog = INTENT_CATALOG) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  if (!lower) return { matches: [], best: null, confidence: 'low' };

  const scored = [];
  for (const intent of catalog) {
    let score = Number(intent.priority) || 50;
    let hit = false;
    for (const kw of intent.keywords || []) {
      const k = String(kw).toLowerCase();
      if (k && lower.includes(k)) {
        score += 12;
        hit = true;
      }
    }
    for (const p of intent.phrases || []) {
      const re = compilePhrase(p);
      if (re && re.test(raw)) {
        score += 45;
        hit = true;
      }
    }
    if (hit) {
      scored.push({
        id: intent.id,
        score,
        label: intent.label,
        category: intent.category,
        icon: intent.icon || 'compass',
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const matches = scored.slice(0, 5);
  const best = matches[0] || null;
  const second = matches[1]?.score || 0;
  let confidence = 'low';
  if (best) {
    if (best.score >= 55 && best.score - second >= 10) confidence = 'high';
    else if (best.score >= 28) confidence = 'med';
  }
  if (/^help$|what can you do/i.test(raw)) {
    return { matches: [{ id: 'help.what_can_you_do', score: 99, label: 'What can you do?', category: 'help', icon: 'help-circle' }], best: { id: 'help.what_can_you_do', score: 99, label: 'What can you do?', category: 'help', icon: 'help-circle' }, confidence: 'high' };
  }
  return { matches, best, confidence };
}

const CATEGORY_LABELS = {
  navigate: 'Get around',
  create: 'Create',
  social: 'People',
  profile: 'Profile & account',
  help: 'Tools',
};

function buildHelpCategories(catalog = INTENT_CATALOG) {
  const byCat = {};
  catalog.forEach((i) => {
    const c = i.category || 'help';
    if (!byCat[c]) byCat[c] = [];
    byCat[c].push({ id: i.id, label: i.label, icon: i.icon || 'compass' });
  });
  return Object.entries(byCat).map(([name, intents]) => ({
    name: CATEGORY_LABELS[name] || name,
    intents: intents.slice(0, 12),
  }));
}

function buildNavigatorReply(parseResult, catalog = INTENT_CATALOG) {
  const { matches, best, confidence } = parseResult || {};
  const byId = new Map(catalog.map((i) => [i.id, i]));

  if (best?.id === 'help.what_can_you_do') {
    return {
      reply: 'I can help you get around Chaupaal — pick something below.',
      attachment: { type: 'help_card', categories: buildHelpCategories(catalog) },
      navigator: true,
    };
  }

  if (confidence === 'low' || !best) {
    return {
      reply: "I can help you get around Chaupaal — pick something below or describe what you want.",
      attachment: { type: 'help_card', categories: buildHelpCategories(catalog) },
      navigator: true,
    };
  }

  const picks = confidence === 'high' ? [best] : matches.slice(0, 3);
  const intro =
    picks.length === 1
      ? `Got it — tap below to ${String(picks[0].label || 'continue').toLowerCase()}.`
      : 'A few things match — which one did you mean?';

  return {
    reply: intro,
    attachment: {
      type: 'action_card',
      intro,
      actions: picks.map((m, idx) => ({
        id: m.id,
        intentId: m.id,
        label: m.label || byId.get(m.id)?.label || m.id,
        icon: m.icon || byId.get(m.id)?.icon || 'compass',
        primary: idx === 0,
      })),
    },
    navigator: true,
    intents: picks.map((p) => p.id),
  };
}

module.exports = {
  INTENT_CATALOG,
  parseChaupaalIntents,
  buildHelpCategories,
  buildNavigatorReply,
  CATEGORY_LABELS,
};
