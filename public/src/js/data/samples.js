// ===================== SAMPLE DATA =====================
/*
 * CONTENT RULE (Akhbaar reel):
 * Do not add a `link` field unless it has been verified to match this card's
 * headline/news/q. Prefer omitting `link` entirely over publisher homepages
 * or loosely related URLs. See CONTENT.md.
 */
const SAMPLE_QUESTIONS=[
  {category:"Sports",personal:false,sound:"cheer",q:"The FIFA World Cup 2026 opened with hosts Mexico facing which team in Group A?",options:["South Africa","Brazil","Canada","Argentina"],correct:0,proof:71,headline:"FIFA World Cup 2026 opens in Mexico City",news:"The 2026 FIFA World Cup began with hosts Mexico facing South Africa in Group A at the Estadio Azteca. The expanded 48-team format introduces 12 groups, with the top two from each group plus best third-placed sides advancing to Round of 32.",explain:"South Africa — they faced host nation Mexico in the opening Group A match."},
  {category:"GK",personal:false,sound:"default",q:"A Nipah virus case was confirmed this week in which Kerala district?",options:["Wayanad","Ernakulam","Kozhikode","Thrissur"],correct:2,proof:52,headline:"Nipah virus case confirmed in Kozhikode",news:"A 43-year-old from Ramanattukara was confirmed positive for Nipah virus and admitted to Kozhikode Medical College. Kerala's health department has stepped up containment and contact-tracing measures.",explain:"Kozhikode — the patient was from nearby Ramanattukara."},
  {category:"India",personal:false,sound:"default",q:"What weather alert did the IMD issue for Delhi on June 13 as the monsoon advances?",options:["Red alert","Orange alert","Yellow alert","No alert"],correct:2,proof:60,headline:"Yellow alert for Delhi as monsoon advances",news:"The IMD issued a yellow alert for Delhi forecasting thunderstorms and gusty winds up to 50 kmph. The southwest monsoon has advanced into southern and eastern India while a western disturbance is expected to bring widespread rain to the northwest.",explain:"Yellow alert — signalling thunderstorms and strong winds."},
  {category:"Business",personal:false,sound:"default",q:"India's HSBC Composite PMI climbed to a 14-month high in June. What level did it reach?",options:["55.0","58.4","61.0","64.2"],correct:2,proof:41,headline:"India PMI hits 14-month high at 61.0",news:"The HSBC Flash India Composite Output Index climbed to a 14-month high of 61.0 in June, up from 59.3 in May, consistent with a sharp rate of expansion well above the long-run average.",explain:"61.0 — up from 59.3 in May, marking a 14-month high."},
  {category:"Tech",personal:false,sound:"default",q:"Global data centre operator AirTrunk announced investment of roughly how much in India by 2030?",options:["$3 billion","$10 billion","$30 billion","$50 billion"],correct:2,proof:38,headline:"AirTrunk to invest $30 billion in India by 2030",news:"PM Modi welcomed global data centre operator AirTrunk's announcement to invest more than ₹3 lakh crore (US$30 billion) in India by 2030, describing it as one of the largest proposed investments in India's digital infrastructure.",explain:"$30 billion — equivalent to ₹3 lakh crore announced investment."},
  {category:"Personal",personal:true,sound:"birthday",q:"When is Riya Sharma's birthday?",options:["Today 🎂","Tomorrow","Next week","Last month"],correct:0,proof:null,headline:"🎉 It's Riya's birthday today!",news:"Riya's on a 24-day streak and ranks in the top 5% for Sports this month. Her favourite category is Sports — maybe send her a Muqabala challenge to celebrate?",explain:null},
  {category:"World",personal:false,sound:"default",q:"Which city is hosting this year's major UN climate summit?",options:["Nairobi","Geneva","Belém","Jakarta"],correct:2,proof:39,headline:"Belém to host 2026 climate conference",news:"The Brazilian city of Belém, gateway to the Amazon, is preparing to host global leaders for climate talks focused on rainforest protection, financing for developing nations and updated emissions targets.",explain:"Belém, Brazil — chosen for its location at the gateway to the Amazon."},
];

const SAMPLE_BONUS=[
  {category:"GK",personal:false,sound:"default",q:"Which river is known as the 'Sorrow of Bihar' due to frequent flooding?",options:["Kosi","Son","Gandak","Ganga"],correct:0,proof:58,headline:"Kosi river flood-control project gets fresh funding",news:"The Kosi, notorious for shifting course and causing devastating floods, is the focus of a renewed embankment and flood-control initiative aimed at protecting north Bihar's farmland and villages.",explain:"Kosi — its frequent course changes have earned it this nickname for centuries."},
  {category:"Sports",personal:false,sound:"cheer",breaking:true,q:"In a first for the 2026 Rugby Premier League, how many women's franchises join the competition?",options:["2","4","6","8"],correct:1,proof:41,headline:"🔴 Taaza Khabar: Women's teams join Rugby Premier League",news:"Season two of the Rugby Premier League introduces four women's franchises for the first time — competing alongside six men's city-based teams in the rugby sevens format.",explain:"4 — alongside the six existing men's franchises."}
];

const AUR_SUNAO_QUESTIONS=[
  {q:"Pick your ideal Sunday:",options:["🏔️ Trek in the mountains","📚 Read a good book","🎬 Movie marathon at home","🍳 Cook something new"]},
  {q:"Which topic would you most enjoy debating?",options:["🏏 Sports","🎬 Movies & Pop culture","💻 Tech & AI","🌍 Politics & World affairs"]},
  {q:"You are most energized by:",options:["Deep one-on-one conversations","Large group hangouts","Solo time with your thoughts","Quick spontaneous plans"]},
  {q:"How do you usually consume news?",options:["Morning newspaper habit","Random scrolling throughout day","Podcasts while commuting","I ask people around me"]},
];

const MUQABALA_QUESTIONS=[
  {q:"If you could have dinner with any historical figure, who would it be?",options:["Mahatma Gandhi","Nikola Tesla","Cleopatra","Leonardo da Vinci"],correct:null,philosophical:true},
  {q:"Which planet is known as the Red Planet?",options:["Venus","Mars","Jupiter","Mercury"],correct:1},
  {q:"What is the capital of Japan?",options:["Beijing","Seoul","Tokyo","Bangkok"],correct:2},
  {q:"The Great Wall of China was primarily built during which dynasty?",options:["Tang","Han","Ming","Qing"],correct:2},
  {q:"If you had to live in one era of history, which would you choose?",options:["Ancient civilization","Medieval times","Industrial revolution","Far future"],correct:null,philosophical:true},
  {q:"Which element has the chemical symbol 'Au'?",options:["Silver","Gold","Aluminum","Argon"],correct:1},
  {q:"What does 'satyameva jayate' mean?",options:["Victory to the brave","Truth alone triumphs","Power is knowledge","Unity in diversity"],correct:1},
  {q:"Which ocean is the largest?",options:["Atlantic","Indian","Arctic","Pacific"],correct:3},
  {q:"What would you choose if forced?",options:["Always tell the truth","Always be kind","Always be fair","Always be brave"],correct:null,philosophical:true},
  {q:"Who wrote 'Discovery of India'?",options:["Mahatma Gandhi","B.R. Ambedkar","Jawaharlal Nehru","Rabindranath Tagore"],correct:2},
];

const NUDGES_POST_MUQABALA=[
  "Interesting — you chose '{answer}'. What draws you to that? I have a feeling there's a story behind it 👀",
  "'{answer}' — that says a lot about someone. What would your closest friend say if they saw that answer?",
  "So... '{answer}'. Quick question — when did you last actually do that or experience that?",
  "I noticed you both answered the same on that last one 👁️ Coincidence or is there something there?",
];
