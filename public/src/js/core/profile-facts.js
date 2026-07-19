/**
 * Profile facts — short lines for profile-completion celebrations.
 *
 * Interface: getProfileFact(fieldName, value) → Promise<{ line, trivia?, unlockHint?, source, ... }>
 *
 * Providers:
 *  - generic (ACTIVE): warm copy + static trivia banks (zero query cost)
 *  - realStats (DISABLED): Firestore counts stub — flip PROFILE_FACTS_USE_REAL_STATS
 *
 * Trivia is hardcoded per value/category and randomly rotated. Obscure values
 * fall back to warm-only copy — never invent dull filler "facts."
 */
(function () {
  const PROFILE_FACTS_USE_REAL_STATS = false;

  const MATCHING_FIELDS = new Set([
    'currentCity',
    'bio',
    'hobbies',
    'languages',
    'occupation',
    'lifeGoals',
    'photos',
    'displayName',
  ]);

  /** Warm primary lines (friend-cheering voice). */
  const GENERIC = {
    displayName: (v) => `Hey ${String(v).split(' ')[0]} — good to have you here.`,
    bio: () => `Bio's in. Now people actually get a feel for who you are.`,
    dateOfBirth: () => `Birthday saved. We'll remember — cake vibes when it comes around.`,
    gender: () => `Got it. Makes it easier to find people you'll click with.`,
    currentCity: (v) =>
      v ? `${v}, nice. Easier to find people nearby now.` : `City's in. Easier to find people nearby now.`,
    occupation: (v) =>
      v ? `${v} — nice. You'll run into people in similar worlds.` : `Work life's in. You'll run into people in similar worlds.`,
    highestEducation: () => `Education noted. Quiet little detail, but it helps.`,
    education: () => `Education noted. Quiet little detail, but it helps.`,
    relationshipStatus: () => `Got it — clears up any confusion upfront.`,
    diet: () => `Diet preference saved. Small detail, big for chai meets and dinner invites.`,
    hobbies: (v) => {
      const list = Array.isArray(v) ? v.slice(0, 2).join(' & ') : String(v || 'those');
      return `${list}? Love that. You'll find people into the same stuff.`;
    },
    lifeGoals: () => `Goals down. Nice to know what you're chasing.`,
    dreams: () => `Goals down. Nice to know what you're chasing.`,
    mbti: (v) => {
      const t = String(v || '').toUpperCase();
      if (!t || t === "DON'T KNOW" || t === 'DONT KNOW') return `Personality noted — helps people get your vibe.`;
      return `${t} — fun. Helps people get your vibe faster.`;
    },
    languages: (v) => {
      const list = Array.isArray(v) ? v.slice(0, 2).join(' + ') : String(v || 'those');
      return `${list}. Always nicer when you can just talk.`;
    },
    photos: () => `Photo's up. So much better than a blank face.`,
    family: () => `Family bit added. Makes chats feel less like starting from zero.`,
  };

  const UNLOCK_HINTS = {
    currentCity: "You'll see more people nearby on Peepal.",
    bio: 'Peepal can actually introduce you properly now.',
    hobbies: 'More people who get your interests on Peepal.',
    languages: 'Easier to match with people you can really talk to.',
    occupation: 'More people from worlds like yours on Peepal.',
    lifeGoals: "You'll bump into people chasing similar things.",
    dreams: "You'll bump into people chasing similar things.",
    photos: 'You show up as a real person on Peepal now.',
    displayName: 'People can finally put a name to you on Peepal.',
  };

  // ---------- Static trivia banks (rotate randomly) ----------
  const MBTI_TRIVIA = {
    INTJ: [
      'INTJs are sometimes called the "Architects" — big plans, quiet delivery.',
      'Fun INTJ lore: they often have a five-year plan… and a backup for the backup.',
      'INTJs make up a small slice of people — rare, strategic, and usually three steps ahead.',
      'Classic INTJ move: saying little, noticing everything.',
    ],
    INTP: [
      'INTPs are the "Logicians" — curious about how everything works, including this app.',
      'INTP energy: starting five deep dives and finishing the most interesting one.',
      'Fun INTP fact: they can debate an idea for fun even if they already agree.',
      'INTPs often invent nicknames for systems nobody else named yet.',
    ],
    ENTJ: [
      'ENTJs are the "Commanders" — allergic to wasted time, great at marshalling people.',
      'ENTJ vibe: "What\'s the goal?" before "How are you?" (they still care — just efficiently).',
      'Fun ENTJ fact: they treat group chats like project boards sometimes.',
      'ENTJs often become the unofficial captain of any room they enter.',
    ],
    ENTP: [
      'ENTPs are the "Debaters" — they\'ll argue a point for sport, then buy you chai.',
      'Fun ENTP fact: they collect ideas the way others collect stickers.',
      'ENTP energy: "What if we tried the opposite?" at 11pm.',
      'ENTPs are famous for inventing plans mid-conversation.',
    ],
    INFJ: [
      'INFJs are the rarest type in many surveys — quiet intensity, big empathy.',
      'INFJ lore: they often know how you feel before you\'ve said it.',
      'Fun INFJ fact: they keep mental "files" on the people they care about.',
      'INFJs are sometimes called the "Advocates" — soft voice, strong convictions.',
    ],
    INFP: [
      'INFPs are the "Mediators" — soft hearts, stubborn ideals.',
      'Fun INFP fact: they can turn a random walk into a whole mood board.',
      'INFP energy: playlists that feel like a letter you never sent.',
      'INFPs often write better in notes apps than they talk in groups.',
    ],
    ENFJ: [
      'ENFJs are the "Protagonists" — the friend who remembers everyone\'s birthday.',
      'Fun ENFJ fact: they host gatherings and somehow make shy people talk.',
      'ENFJ vibe: "You\'ve got this" — and they mean it.',
      'ENFJs often become the glue of friend groups without applying for the job.',
    ],
    ENFP: [
      'ENFPs are the "Campaigners" — spark plugs with a soft centre.',
      'Fun ENFP fact: they can make strangers feel like old friends in five minutes.',
      'ENFP energy: twelve tabs open, all exciting.',
      'ENFPs collect people, hobbies, and midnight epiphanies.',
    ],
    ISTJ: [
      'ISTJs are the "Logisticians" — reliable as a train timetable.',
      'Fun ISTJ fact: they often have a place for everything (and notice when it moves).',
      'ISTJ vibe: doing the right thing quietly, without a press release.',
      'ISTJs keep traditions alive that everyone else forgot to calendar.',
    ],
    ISFJ: [
      'ISFJs are the "Defenders" — the ones who pack snacks "just in case."',
      'Fun ISFJ fact: they remember how you take your tea after one visit.',
      'ISFJ energy: caring in practical ways — umbrellas, reminders, leftovers.',
      'ISFJs often hold friend groups together with tiny thoughtful moves.',
    ],
    ESTJ: [
      'ESTJs are the "Executives" — agendas, follow-ups, and zero chaos if they can help it.',
      'Fun ESTJ fact: they can turn a messy weekend plan into a working itinerary.',
      'ESTJ vibe: "Let\'s just decide" — and somehow everyone exhales.',
      'ESTJs are often the first to RSVP and the last to flake.',
    ],
    ESFJ: [
      'ESFJs are the "Consuls" — hosts at heart, even on a Tuesday.',
      'Fun ESFJ fact: they notice who\'s quiet and pull them into the circle.',
      'ESFJ energy: group photos, group chats, group celebrations.',
      'ESFJs make "you\'re invited" feel like a warm blanket.',
    ],
    ISTP: [
      'ISTPs are the "Virtuosos" — fixers, tinkerers, calm under pressure.',
      'Fun ISTP fact: they often learn by taking things apart (carefully… usually).',
      'ISTP vibe: few words, excellent timing.',
      'ISTPs can make a problem look simple once they\'ve touched it.',
    ],
    ISFP: [
      'ISFPs are the "Adventurers" — aesthetic eyes, gentle presence.',
      'Fun ISFP fact: they notice textures, light, and playlists before the plot.',
      'ISFP energy: living in the moment, then capturing it somehow.',
      'ISFPs often express feelings better through making than talking.',
    ],
    ESTP: [
      'ESTPs are the "Entrepreneurs" — action first, story later.',
      'Fun ESTP fact: they turn ordinary evenings into "remember when?" stories.',
      'ESTP vibe: jump in, figure it out mid-air.',
      'ESTPs keep rooms awake — in the best way.',
    ],
    ESFP: [
      'ESFPs are the "Entertainers" — warm spotlight energy.',
      'Fun ESFP fact: they can make a dull wait feel like a mini party.',
      'ESFP vibe: "Why not?" followed by laughter.',
      'ESFPs collect moments, not manuals.',
    ],
  };

  const LANGUAGE_TRIVIA = {
    Hindi: [
      'Hindi shares roots with Sanskrit — and a ton of everyday words with Urdu.',
      'Fun Hindi fact: "namaste" literally bows to the divine in you.',
      'Hindi is one of the most spoken languages on Earth — and still adding memes daily.',
      'Bollywood helped Hindi travel farther than many textbooks ever could.',
    ],
    English: [
      'English steals words from everywhere — including a lot from Indian languages.',
      'Fun English fact: "shampoo" and "bungalow" both came via India.',
      'English spelling is chaotic because it kept souvenirs from every invasion.',
      'More people speak English as a second language than as a first.',
    ],
    Tamil: [
      'Tamil is one of the world\'s oldest living classical languages — still thriving.',
      'Fun Tamil fact: Sangam poetry was writing love and war verses ~2,000 years ago.',
      'Tamil has a unbroken literary tradition older than many European languages.',
      'Tamil cinema and literature keep inventing new slang every decade.',
    ],
    Telugu: [
      'Telugu is often called the "Italian of the East" for its vowel-heavy musicality.',
      'Fun Telugu fact: it\'s one of India\'s most spoken languages by native speakers.',
      'Telugu film music has exported catchy hooks far beyond Andhra & Telangana.',
      'Classical Telugu poetry loves long, flowing compound words.',
    ],
    Marathi: [
      'Marathi has a proud literary scene — from saint-poets to sharp modern satire.',
      'Fun Marathi fact: Pune\'s book culture is basically a personality trait.',
      'Marathi theatre (natak) has been packing halls for generations.',
      '"Jai Maharashtra" hits different when you\'ve heard Marathi folk live.',
    ],
    Bengali: [
      'Bengali gave the world Tagore — and a soft spot for adda and fish curry debates.',
      'Fun Bengali fact: Kolkata once printed more books than almost anywhere in India.',
      'Bengali New Year (Poila Boishakh) is basically a city-wide reset button.',
      'The language loves long, lyrical sentences — and longer festivals.',
    ],
    Gujarati: [
      'Gujarati traders helped carry the language along Indian Ocean routes for centuries.',
      'Fun Gujarati fact: it\'s the mother tongue of several Indian business legends.',
      'Garba nights make Gujarati feel like a language you can dance in.',
      'Gujarati has a rich Jain and folk literature tradition.',
    ],
    Kannada: [
      'Kannada has classical status and a film industry that punches above its weight.',
      'Fun Kannada fact: inscriptions in Kannada go back well over a thousand years.',
      'Bengaluru\'s tech boom made Kannada–English code-mixing an art form.',
      'Kannada poetry can be as soft as rain or as sharp as a punchline.',
    ],
    Malayalam: [
      'Malayalam script is famous for its beautiful rounded curves.',
      'Fun Malayalam fact: Kerala\'s literacy culture made reading a flex long ago.',
      'Mollywood keeps surprising people who only watch the big Hindi releases.',
      'Malayalam has a knack for long compound words that feel like whole sentences.',
    ],
    Punjabi: [
      'Punjabi is the beat behind countless wedding playlists worldwide.',
      'Fun Punjabi fact: it\'s tonal — pitch can change a word\'s meaning.',
      'From bhangra to Sufi, Punjabi music travels farther than maps.',
      'Punjabi hospitality lore: guests leave fuller than they arrived.',
    ],
    Urdu: [
      'Urdu poetry (shayari) can break your heart in two couplets.',
      'Fun Urdu fact: it shares so much with Hindi that speakers often meet halfway.',
      'The word "Urdu" itself relates to "camp" — a language born in mingling.',
      'Ghazals made Urdu feel like velvet even if you only catch every third word.',
    ],
    Odia: [
      'Odia (Oriya) has classical language status and a soft, rounded script.',
      'Fun Odia fact: Jagannath culture shaped festivals far beyond Odisha.',
      'Odia literature has a quiet depth people outside the state often miss.',
      'Puri\'s temple kitchen lore is basically food history with divine PR.',
    ],
    Assamese: [
      'Assamese is the glue of the Brahmaputra valley\'s cultural life.',
      'Fun Assamese fact: Bihu songs can make a whole field feel like a dance floor.',
      'Assamese has unique sounds you won\'t hear in many other Indian languages.',
      'Tea-country mornings and Assamese go surprisingly well together.',
    ],
    Konkani: [
      'Konkani rides the coast — Goa to Karnataka — with many lively dialects.',
      'Fun Konkani fact: it\'s written in more than one script depending on the region.',
      'Konkani songs and fish-curry debates are both serious business.',
      'Despite its smaller speaker base, Konkani punched into India\'s Eighth Schedule.',
    ],
  };

  const CITY_TRIVIA = {
    mumbai: [
      'Mumbai\'s local trains move more people daily than many countries have citizens.',
      'Fun Mumbai fact: the city\'s old name "Bombay" stuck in film long after the rename.',
      'Marine Drive\'s curve is nicknamed the Queen\'s Necklace when the lights come on.',
      'Mumbai fits islands, film sets, and midnight vada pav into one chaotic skyline.',
    ],
    delhi: [
      'Delhi has been rebuilt so many times it\'s basically a nesting doll of capitals.',
      'Fun Delhi fact: you can eat your way across India without leaving one market lane.',
      'The Metro made the city feel smaller — in a good way.',
      'Old Delhi\'s lanes still smell like history and frying kachoris.',
    ],
    'new delhi': [
      'New Delhi was planned as a garden city — wide vistas, stubborn traffic anyway.',
      'Fun fact: India Gate has been a gathering spot for celebrations and quiet evenings alike.',
      'Lutyens\' bungalows and neon market alleys somehow share one city.',
      'New Delhi winters turn every rooftop into a temporary café.',
    ],
    bengaluru: [
      'Bengaluru\'s nickname "Garden City" still fights the traffic for attention.',
      'Fun Bengaluru fact: it\'s one of India\'s startup capitals — and filter-coffee capitals.',
      'The weather joke writes itself: sweater in the morning, AC by afternoon.',
      'Pub culture + tech culture = weekend plans that start at brunch.',
    ],
    bangalore: [
      'Bangalore / Bengaluru: same city, endless naming debates.',
      'Fun fact: Cubbon Park is the lungs everyone argues about protecting.',
      'Startup energy here is matched only by the love for filter coffee.',
      'Once famous for gardens — now famous for both gardens and Zoom calls.',
    ],
    hyderabad: [
      'Hyderabad\'s biryani arguments are a competitive sport.',
      'Fun Hyderabad fact: Charminar has been the city\'s postcard for centuries.',
      'Pearl City lore: gems, diamonds, and dum pukht in one skyline.',
      'HITEC City and Old City somehow vibe in the same metro.',
    ],
    chennai: [
      'Chennai invented the idea of filter coffee as a personality.',
      'Fun Chennai fact: Marina Beach is one of the world\'s longest urban beaches.',
      'Tamil cinema\'s heartbeat still thumps loudest here.',
      'From sabhas to seaside walks — December in Chennai is a festival season.',
    ],
    kolkata: [
      'Kolkata\'s adda culture treats conversation as a full-time hobby.',
      'Fun Kolkata fact: the Howrah Bridge is an icon that still carries daily chaos with grace.',
      'Rosogolla diplomacy has settled many family debates.',
      'Trams, book stalls, and Durga Puja — the city collects atmospheres.',
    ],
    pune: [
      'Pune mixes student energy, IT parks, and old wada charm.',
      'Fun Pune fact: it\'s long been called a cultural capital of Maharashtra.',
      'Misal pav opinions here are taken personally.',
      'Weekend Sahyadri escapes are basically a Pune love language.',
    ],
    ahmedabad: [
      'Ahmedabad\'s old city pols are a maze worth getting "lost" in.',
      'Fun Ahmedabad fact: it was India\'s first UNESCO World Heritage City.',
      'Sabarmati evenings and street snacks — undefeated combo.',
      'Garba season turns the whole city into a heartbeat.',
    ],
    jaipur: [
      'Jaipur\'s pink city glow is real — especially at sunset.',
      'Fun Jaipur fact: the Hawa Mahal has 953 windows (yes, people counted).',
      'Bazaars here sell colour by the kilo.',
      'Royal forts and modern cafés somehow agree on Instagram lighting.',
    ],
    chandigarh: [
      'Chandigarh is one of India\'s rare planned modernist cities — Le Corbusier vibes.',
      'Fun Chandigarh fact: the Rock Garden was built from urban waste, turned whimsical.',
      'Sectors make navigation weirdly logical (until you visit Sector 17 at rush hour).',
      'Sukhna Lake sunsets are a local love language.',
    ],
    lucknow: [
      'Lucknow\'s tehzeeb (courtesy) is a brand older than most startups.',
      'Fun Lucknow fact: kebabs here have dynasties and fan clubs.',
      'The city can argue for hours about which chaat stall is definitive.',
      'Imambaras and modern malls share the same unhurried evenings.',
    ],
    goa: [
      'Goa\'s coastline switches moods every few beaches.',
      'Fun Goa fact: it\'s India\'s smallest state by area — big personality though.',
      'Susegad is less laziness, more intentional slow living.',
      'From feni lore to sunset silhouettes — the postcard writes itself.',
    ],
    kochi: [
      'Kochi (Cochin) has been a spice-trade crossroads for centuries.',
      'Fun Kochi fact: Chinese fishing nets are living landmarks on the waterfront.',
      'Backwaters nearby make "weekend plan" an easy sentence.',
      'A port city that somehow still feels like a storybook.',
    ],
    cochin: [
      'Cochin / Kochi: spice history, monsoon greens, ferry rides.',
      'Fun fact: Fort Kochi\'s streets feel like several centuries walking together.',
      'Seafood here turns first-timers into regulars.',
      'Chinese fishing nets are the city\'s unofficial logo.',
    ],
    indore: [
      'Indore takes street food so seriously it became a national flex.',
      'Fun Indore fact: it\'s topped cleanliness rankings more than once.',
      'Sarafa nights are a food pilgrimage.',
      'The city mixes business hustle with late-night chai loyalty.',
    ],
    nagpur: [
      'Nagpur sits near India\'s geographic centre — and takes oranges seriously.',
      'Fun Nagpur fact: the Zero Mile Stone marks a historic central point.',
      'Winter oranges here taste like the season\'s mascot.',
      'A calm city energy with a loud love for food.',
    ],
    surat: [
      'Surat is a diamond and textile powerhouse with serious food opinions.',
      'Fun Surat fact: it rebuilt itself into one of India\'s fastest-growing cities.',
      'Undhiyu season is non-negotiable for locals.',
      'Business hustle + Gujarati hospitality = Surat in one line.',
    ],
    bhopal: [
      'Bhopal\'s lakes give it a softer skyline than people expect.',
      'Fun Bhopal fact: it\'s often called the City of Lakes.',
      'Upper and Lower Lake sunsets do quiet magic.',
      'A capital city that still feels walk-and-talk friendly.',
    ],
    patna: [
      'Patna sits on history — ancient Pataliputra vibes under modern traffic.',
      'Fun Patna fact: the Ganga here feels like the city\'s oldest neighbour.',
      'Litti chokha loyalty is undefeated.',
      'A riverside capital with stories older than most monuments.',
    ],
    thiruvananthapuram: [
      'Thiruvananthapuram (Trivandrum) mixes temple calm and coastal air.',
      'Fun fact: it\'s Kerala\'s capital with beaches a short hop away.',
      'Padmanabhaswamy temple lore still draws quiet awe.',
      'Filter coffee + sea breeze is an underrated combo.',
    ],
    trivandrum: [
      'Trivandrum / Thiruvananthapuram: capital calm with beach access.',
      'Fun fact: museum and temple circuits make excellent slow days.',
      'Kerala\'s southern tip energy — green, coastal, unhurried.',
      'A city that rewards people who don\'t rush the itinerary.',
    ],
  };

  const ZODIAC_TRIVIA = {
    Aries: [
      'Aries season kicks off the zodiac year — fresh-start energy.',
      'Fun Aries fact: ruled by Mars in astrology lore — bold first moves.',
      'Aries vibe: "Why wait?" as a lifestyle.',
      'Ram symbolism: headfirst, heart open (eventually).',
    ],
    Taurus: [
      'Taurus season is peak "slow luxury" — food, music, comfort.',
      'Fun Taurus fact: Venus-ruled in astrology — beauty and good taste.',
      'Taurus energy: stubborn about the important things (and snacks).',
      'Bull symbolism: steady progress beats flashy sprints.',
    ],
    Gemini: [
      'Gemini season loves banter, tabs, and two plans at once.',
      'Fun Gemini fact: the twins motif is about many sides, not fakeness.',
      'Gemini vibe: curiosity as a renewable resource.',
      'Mercury-ruled lore: words are their favourite toy.',
    ],
    Cancer: [
      'Cancer season is soft armour — protective and sentimental.',
      'Fun Cancer fact: moon-ruled in astrology — moods with tides.',
      'Cancer energy: home is a feeling, not just an address.',
      'Crab symbolism: tough shell, tender centre.',
    ],
    Leo: [
      'Leo season understands main-character lighting.',
      'Fun Leo fact: sun-ruled — warmth, pride, generous applause.',
      'Leo vibe: celebrate people (including yourself) loudly.',
      'Lion symbolism: loyalty with a roar.',
    ],
    Virgo: [
      'Virgo season notices the detail everyone else skimmed.',
      'Fun Virgo fact: harvest lore — sorting, refining, improving.',
      'Virgo energy: care shown through competence.',
      'They\'ll fix your itinerary and somehow make it kinder.',
    ],
    Libra: [
      'Libra season wants fairness, beauty, and good company.',
      'Fun Libra fact: scales symbolism — balance as a daily practice.',
      'Libra vibe: "What do you think?" is a love language.',
      'Venus-ruled lore: harmony over chaos, always.',
    ],
    Scorpio: [
      'Scorpio season goes deep or goes home.',
      'Fun Scorpio fact: transformation lore — endings that become beginnings.',
      'Scorpio vibe: intensity with a private soft spot.',
      'They remember the subplot you thought nobody noticed.',
    ],
    Sagittarius: [
      'Sagittarius season packs bags — literal or mental.',
      'Fun Sagittarius fact: archer symbolism — aim far, laugh often.',
      'Sag energy: honesty that somehow still feels optimistic.',
      'They collect philosophies like travel stickers.',
    ],
    Capricorn: [
      'Capricorn season climbs quietly and arrives prepared.',
      'Fun Capricorn fact: sea-goat lore — ambition with staying power.',
      'Cap energy: long games, dry humour, reliable texts.',
      'They treat goals like mountains: one ridge at a time.',
    ],
    Aquarius: [
      'Aquarius season invents the group chat rules, then breaks them kindly.',
      'Fun Aquarius fact: water-bearer lore — ideas for the collective.',
      'Aqua vibe: friendly from a slightly futuristic angle.',
      'They\'ll care about people and principles in the same sentence.',
    ],
    Pisces: [
      'Pisces season blurs edges — dreams, music, empathy.',
      'Fun Pisces fact: two fish swimming opposite ways — feeling everything.',
      'Pisces vibe: intuition first, spreadsheet later (maybe).',
      'They turn ordinary evenings into little films.',
    ],
  };

  /** Occupation free-text → category keyword banks. */
  const OCCUPATION_TRIVIA = {
    engineer: [
      'Engineers: professional problem-solvers who also debug life occasionally.',
      'Fun engg fact: "It works on my machine" started as a joke and became culture.',
      'India graduates a huge wave of engineers every year — you\'re in lively company.',
      'Engineers turn constraints into clever workarounds (and late-night tea).',
    ],
    developer: [
      'Developers ship invisible cities made of logic.',
      'Fun dev fact: rubber-duck debugging is a real technique — explain it to a duck.',
      'Dark mode is less aesthetic, more survival.',
      'Commit messages can be poetry if you squint.',
    ],
    designer: [
      'Designers see spacing the way musicians hear pitch.',
      'Fun design fact: people notice bad kerning before they can name it.',
      'A good designer makes hard things feel obvious.',
      'Moodboards are basically emotional research.',
    ],
    doctor: [
      'Doctors collect stories and stamina in equal measure.',
      'Fun medicine fact: the white coat effect is real — clinics change blood pressure.',
      'Night shifts forge a special kind of humour.',
      'They translate scary words into human ones.',
    ],
    teacher: [
      'Teachers plant questions that bloom years later.',
      'Fun teaching fact: explaining something is the fastest way to learn it again.',
      'A great teacher remembers who you could become.',
      'Chalk dust is basically glitter for educators.',
    ],
    student: [
      'Student life: deadlines, chai, and sudden wisdom at 2am.',
      'Fun student fact: the best notes are often the messy ones you actually reopen.',
      'Exam season turns libraries into temporary nations.',
      'You\'re collecting futures in parallel tabs.',
    ],
    founder: [
      'Founders live in optimism with a side of spreadsheets.',
      'Fun startup fact: most origin stories start with "we just tried something."',
      'Pitch decks are modern campfire stories.',
      'They learn in public, bruise in private, ship anyway.',
    ],
    lawyer: [
      'Lawyers argue for a living — and listen even harder.',
      'Fun law fact: "objection" is peak dramatic timing in any language.',
      'Fine print is their native habitat.',
      'They turn messy human stories into structured cases.',
    ],
    writer: [
      'Writers notice the sentence hiding inside ordinary days.',
      'Fun writing fact: drafts are where bravery practices.',
      'A blank page is both enemy and playground.',
      'They collect phrases like other people collect tickets.',
    ],
    finance: [
      'Finance folks see patterns in numbers the way others see faces.',
      'Fun finance fact: compound interest is basically patience with math.',
      'Markets mood-swing; good analysts stay curious.',
      'They translate risk into decisions people can live with.',
    ],
    marketing: [
      'Marketers turn attention into stories people actually want.',
      'Fun marketing fact: the best campaigns feel like culture, not ads.',
      'They A/B test reality for a living.',
      'Taglines are tiny poems with a job to do.',
    ],
    consultant: [
      'Consultants ask the questions everyone was dancing around.',
      'Fun consulting fact: frameworks are just shared maps for messy problems.',
      'Slide decks are their hiking gear.',
      'They borrow brains across industries and return them improved.',
    ],
    artist: [
      'Artists make feelings visible — on walls, screens, stages.',
      'Fun art fact: unfinished pieces often teach more than polished ones.',
      'They notice colour temperature the way others notice gossip.',
      'A sketchbook is a portable universe.',
    ],
    chef: [
      'Chefs turn heat and timing into hospitality.',
      'Fun food fact: salt is the plot twist that makes everything make sense.',
      'Kitchen rush hour is a choreography.',
      'They feed people and somehow feed morale too.',
    ],
  };

  function pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function norm(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function zodiacFromDate(value) {
    if (!value) return null;
    let d = null;
    if (value instanceof Date) d = value;
    else if (typeof value === 'string') {
      // Accept YYYY-MM-DD or similar
      const m = value.match(/(\d{4})-(\d{2})-(\d{2})/) || value.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
      if (m && m[0].includes('-') && m[1].length === 4) d = new Date(+m[1], +m[2] - 1, +m[3]);
      else if (m) {
        const day = +m[1];
        const mon = +m[2];
        let year = +m[3];
        if (year < 100) year += 2000;
        // If first number > 12, assume DMY
        if (day > 12) d = new Date(year, mon - 1, day);
        else d = new Date(year, day - 1, mon); // ambiguous — prefer ISO path above
      } else {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) d = parsed;
      }
    }
    if (!d || Number.isNaN(d.getTime())) return null;
    const day = d.getDate();
    const month = d.getMonth() + 1;
    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'Aries';
    if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'Taurus';
    if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 'Gemini';
    if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 'Cancer';
    if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'Leo';
    if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'Virgo';
    if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 'Libra';
    if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 'Scorpio';
    if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 'Sagittarius';
    if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 'Capricorn';
    if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'Aquarius';
    if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return 'Pisces';
    return null;
  }

  function occupationCategory(value) {
    const s = norm(value);
    if (!s) return null;
    const rules = [
      ['engineer', /engineer|engg|iit|nit|mechanical|civil|electrical|electronics/],
      ['developer', /develop|software|programmer|sde|full.?stack|frontend|backend|coder|devops/],
      ['designer', /design|ux|ui|figma|graphic|product design/],
      ['doctor', /doctor|physician|surgeon|mbbs|md\b|medical|nurse|dentist/],
      ['teacher', /teach|professor|lecturer|tutor|educator|faculty/],
      ['student', /student|undergrad|postgrad|mba candidate|fresher|college/],
      ['founder', /founder|co-?founder|startup|entrepreneur/],
      ['lawyer', /lawyer|advocate|attorney|legal|counsel/],
      ['writer', /writer|author|journalist|editor|content/],
      ['finance', /finance|analyst|accountant|ca\b|cfa|banker|investment/],
      ['marketing', /market|brand|growth|seo|social media/],
      ['consultant', /consult/],
      ['artist', /artist|painter|musician|actor|filmmaker|photographer/],
      ['chef', /chef|cook|baker|culin/],
    ];
    for (const [cat, re] of rules) {
      if (re.test(s)) return cat;
    }
    return null;
  }

  function triviaFor(fieldName, value) {
    if (fieldName === 'mbti') {
      const t = String(value || '').toUpperCase().trim();
      if (!t || t.includes('DON') || t.includes('KNOW')) return null;
      return pick(MBTI_TRIVIA[t] || null);
    }
    if (fieldName === 'languages') {
      const list = Array.isArray(value) ? value : [value];
      // Prefer trivia for the newly relevant / first language with a bank
      for (const lang of list) {
        const key = Object.keys(LANGUAGE_TRIVIA).find((k) => norm(k) === norm(lang));
        if (key) return pick(LANGUAGE_TRIVIA[key]);
      }
      return null;
    }
    if (fieldName === 'currentCity') {
      const n = norm(value);
      if (!n) return null;
      // Exact or contains known city key
      for (const [key, facts] of Object.entries(CITY_TRIVIA)) {
        if (n === key || n.includes(key) || key.includes(n)) return pick(facts);
      }
      return null;
    }
    if (fieldName === 'dateOfBirth') {
      const z = zodiacFromDate(value);
      if (!z) return null;
      const fact = pick(ZODIAC_TRIVIA[z]);
      return fact ? `${z}: ${fact}` : null;
    }
    if (fieldName === 'occupation') {
      const cat = occupationCategory(value);
      if (!cat) return null;
      return pick(OCCUPATION_TRIVIA[cat]);
    }
    return null;
  }

  function formatValueSnippet(value) {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) return value.slice(0, 3).join(', ');
    return String(value);
  }

  async function genericProvider(fieldName, value) {
    const key = String(fieldName || '');
    const fn = GENERIC[key];
    const line = fn
      ? fn(value)
      : `Saved — little by little, this place feels more like yours.`;
    const trivia = triviaFor(key, value);
    const unlockHint = MATCHING_FIELDS.has(key) ? UNLOCK_HINTS[key] || null : null;
    return {
      line,
      trivia: trivia || null,
      source: 'generic',
      unlockHint,
      field: key,
      valueSnippet: formatValueSnippet(value),
    };
  }

  async function realStatsProvider(fieldName, value) {
    if (!db) return genericProvider(fieldName, value);
    try {
      return {
        line: await Promise.resolve(
          `(live stats) Shared "${formatValueSnippet(value) || fieldName}" with others on Chaupaal.`
        ),
        trivia: null,
        source: 'realStats',
        unlockHint: MATCHING_FIELDS.has(fieldName) ? UNLOCK_HINTS[fieldName] || null : null,
        field: fieldName,
        valueSnippet: formatValueSnippet(value),
        stub: true,
      };
    } catch (e) {
      return genericProvider(fieldName, value);
    }
  }

  async function getProfileFact(fieldName, value) {
    if (PROFILE_FACTS_USE_REAL_STATS) {
      try {
        return await realStatsProvider(fieldName, value);
      } catch (e) {
        return genericProvider(fieldName, value);
      }
    }
    return genericProvider(fieldName, value);
  }

  window.PROFILE_FACTS_USE_REAL_STATS = PROFILE_FACTS_USE_REAL_STATS;
  window.getProfileFact = getProfileFact;
  window.profileFactsGenericProvider = genericProvider;
  window.profileFactsRealStatsProvider = realStatsProvider;
})();
