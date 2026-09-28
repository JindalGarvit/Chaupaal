/**
 * Quiz Muqabala bundled bank (Dangal P6) — server-only. Builds ~3,000+ vetted questions from the
 * handwritten rows and fact tables in ./quiz-data. Distractors come from the same table (same
 * continent / family where possible) and are picked with a prompt-seeded RNG, so ids, options
 * and order are stable across deploys. Correct answers never leave the server before a reveal.
 *
 * Item: { id, prompt, options[4], correctIndex, explanation, category, subcategory, difficulty,
 *         rating, locale, source: 'bundled', status: 'active', createdAt: 0, expiresAt: null }
 */
'use strict';

const QuizCore = require('../public/src/js/games/quiz-core.js');
const T = require('./quiz-data/tables');
const { HANDWRITTEN, REGIONAL, US_STATES, INDIA_STATES } = require('./quiz-data/handwritten');

const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
const THE_LANDMARK = /^(Eiffel|Louvre|Colosseum|Leaning|Trevi|Statue|Golden Gate|Grand Canyon|CN Tower|Great|Forbidden|Terracotta|Pyramids|Burj|Petronas|Kremlin|Acropolis|Brandenburg|Atomium|Little Mermaid|Blue Mosque|Sheikh|Cliffs|Giant's|Rijksmuseum|Galápagos|Red Fort|Taj|Shwedagon|Sydney Opera|Alhambra|Sagrada|Hobbiton|Easter|Moraine|Serengeti|Plitvice|Meteora|Wieliczka|Perito|Salar|Abu Simbel|Fushimi)/;

function parse(block) {
  return String(block || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split('|').map((x) => x.trim()))
    .filter((r) => !r.includes('SKIP'));
}
const tierOf = (v) => {
  const n = Number(v);
  return n === 1 || n === 2 || n === 3 ? n : 2;
};
const strip = (s) => String(s).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

function buildBank() {
  const out = [];
  const seen = new Set();

  function add(prompt, correct, wrongs, meta) {
    const opts = [String(correct).trim()].concat((wrongs || []).map((w) => String(w).trim()));
    const uniq = new Set(opts.map((o) => o.toLowerCase()));
    if (opts.length !== 4 || uniq.size !== 4 || opts.some((o) => !o)) return false;
    const id = QuizCore.questionId(prompt, meta.category + (meta.locale && meta.locale !== 'global' ? ':' + meta.locale : ''));
    const norm = QuizCore.normText(prompt);
    if (seen.has(id) || seen.has(norm)) return false;
    seen.add(id);
    seen.add(norm);
    const difficulty = tierOf(meta.tier);
    out.push({
      id,
      prompt: String(prompt).trim(),
      options: opts,
      correctIndex: 0,
      explanation: meta.explanation || '',
      category: meta.category,
      subcategory: meta.sub || 'general',
      difficulty,
      rating: QuizCore.TIER_RATING[difficulty],
      locale: meta.locale || 'global',
      source: 'bundled',
      status: 'active',
      createdAt: 0,
      expiresAt: null,
    });
    return true;
  }

  /** Pick 3 distractors: preferred pool first, then the full pool; never equal to / excluded by the answer. */
  function pick(prompt, answer, pool, preferred, exclude) {
    const r = QuizCore.rng(QuizCore.hash('d:' + prompt));
    const bad = (v) => !v || v.toLowerCase() === String(answer).toLowerCase() || (exclude && exclude(v));
    const chosen = [];
    for (const list of [preferred || [], pool]) {
      const cand = QuizCore.shuffle(Array.from(new Set(list)), r);
      for (const v of cand) {
        if (chosen.length >= 3) break;
        if (!bad(v) && !chosen.some((c) => c.toLowerCase() === v.toLowerCase())) chosen.push(v);
      }
    }
    return chosen.length === 3 ? chosen : null;
  }

  /** Forward (A → B) and optional reverse (B → A) questions for a two-column table. */
  function pairTable(rows, cfg) {
    const valuesB = rows.map((r) => r[1]);
    const valuesA = rows.map((r) => r[0]);
    for (const row of rows) {
      const [a, b] = row;
      const tier = cfg.tierCol != null ? row[cfg.tierCol] : row[2];
      const p = cfg.ask(a, row);
      const wr = pick(p, b, valuesB, cfg.near ? cfg.near(row, rows).map((x) => x[1]) : null, cfg.excludeB ? (v) => cfg.excludeB(v, row) : null);
      if (wr) add(p, b, wr, { category: cfg.category, sub: cfg.sub, tier, explanation: cfg.explain(a, b, row) });
      if (cfg.reverse) {
        const rp = cfg.reverse(b, row);
        const sameB = new Set(rows.filter((x) => x[1] === b).map((x) => x[0]));
        const wa = pick(rp, a, valuesA, cfg.near ? cfg.near(row, rows).map((x) => x[0]) : null, (v) => sameB.has(v));
        if (wa) add(rp, a, wa, { category: cfg.category, sub: cfg.sub, tier, explanation: cfg.explain(a, b, row) });
      }
    }
  }

  function numWrongs(prompt, n, steps, fmt) {
    const r = QuizCore.rng(QuizCore.hash('n:' + prompt));
    const cand = QuizCore.shuffle(steps.flatMap((s) => [n + s, n - s]), r).filter((x) => x > 0 && x !== n);
    const pickd = Array.from(new Set(cand)).slice(0, 3);
    return pickd.length === 3 ? pickd.map((x) => (fmt ? fmt(x) : String(x))) : null;
  }

  // ---- handwritten
  for (const [category, block] of Object.entries(HANDWRITTEN)) {
    for (const r of parse(block)) {
      if (r.length < 6) continue;
      add(r[0], r[1], [r[2], r[3], r[4]], { category, sub: 'handwritten', tier: r[5], explanation: r[6] || '' });
    }
  }

  // ---- countries: capitals, continents, currencies
  const countries = parse(T.COUNTRIES).map((r) => ({ name: r[0], capital: r[1], continent: r[2], currency: r[3], tier: r[4] }));
  const withCap = countries.filter((c) => c.capital && c.capital.toLowerCase() !== c.name.toLowerCase());
  for (const c of withCap) {
    const near = withCap.filter((x) => x.continent === c.continent && x !== c);
    const p1 = `What is the capital of ${c.name}?`;
    const w1 = pick(p1, c.capital, withCap.map((x) => x.capital), near.map((x) => x.capital));
    if (w1) add(p1, c.capital, w1, { category: 'geography', sub: 'capitals', tier: c.tier, explanation: `${c.capital} is the capital of ${c.name}.` });
    const p2 = `${c.capital} is the capital of which country?`;
    const w2 = pick(p2, c.name, withCap.map((x) => x.name), near.map((x) => x.name));
    if (w2) add(p2, c.name, w2, { category: 'geography', sub: 'capitals', tier: c.tier, explanation: `${c.capital} is the capital of ${c.name}.` });
  }
  for (const c of countries.filter((x) => x.continent)) {
    const p = `On which continent is ${c.name}?`;
    const w = pick(p, c.continent, CONTINENTS);
    if (w) add(p, c.continent, w, { category: 'geography', sub: 'continents', tier: Math.max(1, Number(c.tier) - (c.tier === '3' ? 0 : 0)), explanation: `${c.name} is in ${c.continent}.` });
  }
  const withCur = countries.filter((c) => c.currency);
  const curCount = {};
  for (const c of withCur) curCount[c.currency] = (curCount[c.currency] || 0) + 1;
  for (const c of withCur) {
    const near = withCur.filter((x) => x.continent === c.continent);
    const p = `Which currency is used in ${c.name}?`;
    const w = pick(p, c.currency, withCur.map((x) => x.currency), near.map((x) => x.currency));
    if (w) add(p, c.currency, w, { category: 'gk', sub: 'currencies', tier: c.tier, explanation: `${c.name} uses the ${c.currency}.` });
    if (curCount[c.currency] === 1 && !/^(euro)$/i.test(c.currency)) {
      const rp = `The ${c.currency} is the currency of which country?`;
      const rw = pick(rp, c.name, withCur.map((x) => x.name), near.map((x) => x.name), (v) => {
        const other = withCur.find((x) => x.name === v);
        return other && other.currency === c.currency;
      });
      if (rw) add(rp, c.name, rw, { category: 'gk', sub: 'currencies', tier: c.tier, explanation: `${c.name} uses the ${c.currency}.` });
    }
  }

  // ---- languages
  pairTable(parse(T.LANGUAGES), {
    category: 'language',
    sub: 'official-languages',
    ask: (a) => `What is the main official language of ${a}?`,
    explain: (a, b) => `${b} is the main official language of ${a}.`,
  });

  // ---- elements
  const elements = parse(T.ELEMENTS).map((r) => ({ sym: r[0], name: r[1], num: Number(r[2]), tier: r[3] }));
  for (const e of elements) {
    const p1 = `Which element has the chemical symbol ${e.sym}?`;
    const w1 = pick(p1, e.name, elements.map((x) => x.name));
    if (w1) add(p1, e.name, w1, { category: 'science', sub: 'elements', tier: e.tier, explanation: `${e.sym} is the symbol for ${e.name} (atomic number ${e.num}).` });
    const p2 = `What is the chemical symbol for ${e.name}?`;
    const w2 = pick(p2, e.sym, elements.map((x) => x.sym));
    if (w2) add(p2, e.sym, w2, { category: 'science', sub: 'elements', tier: e.tier, explanation: `${e.name}'s symbol is ${e.sym}.` });
    if (e.num <= 30) {
      const p3 = `What is the atomic number of ${e.name}?`;
      const w3 = numWrongs(p3, e.num, [1, 2, 3, 4]);
      if (w3) add(p3, String(e.num), w3, { category: 'science', sub: 'elements', tier: Math.min(3, Number(e.tier) + 1), explanation: `${e.name} has ${e.num} protons, so its atomic number is ${e.num}.` });
    }
  }

  // ---- culture tables
  pairTable(parse(T.BOOKS), {
    category: 'art',
    sub: 'books',
    ask: (a) => `Who wrote "${a}"?`,
    reverse: (b) => `Which of these was written by ${b}?`,
    explain: (a, b) => `"${a}" was written by ${b}.`,
  });
  pairTable(parse(T.ARTWORKS), {
    category: 'art',
    sub: 'artworks',
    ask: (a) => `Who created ${/\(/.test(a) ? a : '"' + a + '"'}?`,
    reverse: (b) => `Which famous work is by ${b}?`,
    explain: (a, b) => `${strip(a)} is by ${b}.`,
  });
  pairTable(parse(T.INVENTIONS), {
    category: 'tech',
    sub: 'inventions',
    ask: (a) => `Who is credited with ${a}?`,
    reverse: (b) => `Which of these is ${b} best known for?`,
    explain: (a, b) => `${b} is credited with ${a}.`,
  });
  pairTable(parse(T.FILMS), {
    category: 'movies',
    sub: 'directors',
    ask: (a) => `Who directed "${a}"?`,
    reverse: (b) => `Which of these films was directed by ${b}?`,
    explain: (a, b) => `"${strip(a)}" was directed by ${b}.`,
  });
  pairTable(parse(T.CHARACTERS), {
    category: 'movies',
    sub: 'characters',
    ask: (a) => `In which film or series does ${a} appear?`,
    reverse: (b) => `Which character appears in ${b}?`,
    explain: (a, b) => `${strip(a)} appears in ${b}.`,
  });
  pairTable(parse(T.BANDS), {
    category: 'music',
    sub: 'artists',
    ask: (a) => `Which country is ${a} from?`,
    reverse: (b) => `Which of these acts is from ${b}?`,
    explain: (a, b) => `${a} comes from ${b}.`,
  });
  pairTable(parse(T.INSTRUMENTS), {
    category: 'music',
    sub: 'instruments',
    ask: (a) => `Which instrument family does the ${a.toLowerCase()} belong to?`,
    explain: (a, b) => `The ${a.toLowerCase()} is a ${b.toLowerCase()} instrument.`,
  });
  pairTable(parse(T.COMPOSERS), {
    category: 'music',
    sub: 'composers',
    ask: (a) => `Which country was the composer ${a} from?`,
    reverse: (b) => `Which composer was from ${b}?`,
    explain: (a, b) => `${a} was from ${b}.`,
  });
  pairTable(parse(T.LANDMARKS), {
    category: 'art',
    sub: 'landmarks',
    ask: (a) => `In which country would you find ${THE_LANDMARK.test(a) ? 'the ' : ''}${a}?`,
    reverse: (b) => `Which of these landmarks is in ${b}?`,
    explain: (a, b) => `${strip(a)} is in ${b}.`,
  });
  pairTable(parse(T.DISHES), {
    category: 'food',
    sub: 'dishes',
    ask: (a) => `Which country does ${a} come from?`,
    reverse: (b) => `Which of these dishes comes from ${b}?`,
    explain: (a, b) => `${strip(a)} comes from ${b}.`,
  });

  // ---- nature tables
  const classOf = parse(T.ANIMALS);
  pairTable(classOf, {
    category: 'nature',
    sub: 'animal-classes',
    ask: (a) => `What kind of animal is a ${a.toLowerCase()}?`,
    explain: (a, b) => `A ${a.toLowerCase()} is ${/^[AEIOU]/.test(b) ? 'an' : 'a'} ${b.toLowerCase()}.`,
  });
  pairTable(parse(T.BABY_ANIMALS), {
    category: 'nature',
    sub: 'baby-animals',
    ask: (a) => `What is a baby ${a.toLowerCase()} called?`,
    excludeB: (v, row) => (row[0] === 'Deer' || row[0] === 'Seal') && v === 'Calf',
    explain: (a, b) => `A baby ${a.toLowerCase()} is called a ${b.toLowerCase()}.`,
  });
  const UNUSUAL = ['Murder', 'Parliament', 'Gaggle', 'Flamboyance', 'Dazzle', 'Smack', 'Crash', 'Bask', 'Cackle', 'Pride'];
  for (const [animal, group, tier] of parse(T.ANIMAL_GROUPS)) {
    const p = `What is a group of ${animal.toLowerCase()} called?`;
    const w = pick(p, group, UNUSUAL);
    if (w) add(p, `A ${group.toLowerCase()}`, w.map((x) => `A ${x.toLowerCase()}`), { category: 'nature', sub: 'animal-groups', tier, explanation: `A group of ${strip(animal).toLowerCase()} is called a ${group.toLowerCase()}.` });
  }

  // ---- sports
  pairTable(parse(T.SPORT_TERMS), {
    category: 'sports',
    sub: 'terms',
    ask: (a) => `Which sport uses the term "${a}"?`,
    excludeB: (v, row) => /^Touchdown/.test(row[0]) && /^Rugby/.test(v),
    explain: (a, b) => `"${strip(a)}" is a ${b.toLowerCase()} term.`,
  });
  pairTable(parse(T.ATHLETES), {
    category: 'sports',
    sub: 'athletes',
    ask: (a) => `Which sport is ${a} famous for?`,
    explain: (a, b) => `${a} is a ${b.toLowerCase()} great.`,
  });
  for (const [sport, n, tier] of parse(T.TEAM_SIZES)) {
    const p = `How many players does each team have on the field in ${sport.toLowerCase()}?`;
    const w = numWrongs(p, Number(n), [1, 2, 4, 5]);
    if (w) add(p, n, w, { category: 'sports', sub: 'team-sizes', tier, explanation: `${sport} is played ${n} a side.` });
  }
  const olympics = parse(T.OLYMPICS);
  const hostCities = Array.from(new Set(olympics.map((r) => r[1])));
  for (const [year, city, tier] of olympics) {
    const p = `Which city hosted the ${year.replace(/ \(.*\)/, '')} Summer Olympics?`;
    const w = pick(p, city, hostCities);
    if (w) add(p, city, w, { category: 'sports', sub: 'olympics', tier, explanation: `${city} hosted the ${year} Summer Olympics.` });
  }
  const cityCount = {};
  for (const r of olympics) cityCount[r[1]] = (cityCount[r[1]] || 0) + 1;
  for (const [year, city, tier] of olympics) {
    if (cityCount[city] > 1 || /\(/.test(year)) continue;
    const p = `In which year did ${city} host the Summer Olympics?`;
    const w = pick(p, year, olympics.map((r) => r[0]).filter((y) => !/\(/.test(y)));
    if (w) add(p, year, w, { category: 'sports', sub: 'olympics', tier: Math.min(3, Number(tier) + 1), explanation: `${city} hosted the Summer Olympics in ${year}.` });
  }

  // ---- tech tables
  pairTable(parse(T.ACRONYMS), {
    category: 'tech',
    sub: 'acronyms',
    ask: (a) => `What does ${a} stand for?`,
    explain: (a, b) => `${a} stands for ${b}.`,
  });
  pairTable(parse(T.FOUNDERS), {
    category: 'tech',
    sub: 'founders',
    ask: (a) => `Who founded ${a}?`,
    reverse: (b) => `Which company was founded by ${b}?`,
    explain: (a, b) => `${strip(a)} was founded by ${b}.`,
  });
  pairTable(parse(T.COMPANY_COUNTRY), {
    category: 'tech',
    sub: 'companies',
    ask: (a) => `In which country was ${a} founded?`,
    reverse: (b) => `Which of these companies comes from ${b}?`,
    explain: (a, b) => `${strip(a)} comes from ${b}.`,
  });

  // ---- language tables
  const CLUSTERS = [
    ['brave', 'courageous', 'bold'],
    ['timid', 'shy', 'cowardly', 'scared', 'frightened'],
    ['frugal', 'thrifty', 'stingy'],
    ['generous', 'charitable', 'benevolent', 'kind-hearted'],
    ['scarce', 'rare'],
    ['concise', 'brief'],
    ['verbose', 'talkative', 'loquacious'],
    ['demolish', 'destroy'],
    ['praise', 'commend'],
    ['calm', 'serene', 'smooth'],
    ['friendly', 'sociable', 'gregarious'],
    ['precise', 'meticulous', 'thorough'],
    ['hate', 'loathe'],
    ['tiny', 'minute'],
    ['enormous', 'gigantic', 'big', 'large'],
    ['fast', 'quick'],
    ['begin', 'start'],
    ['ancient', 'antique'],
    ['honest', 'truthful', 'candid', 'frank'],
    ['rich', 'wealthy', 'wealth'],
    ['clever', 'smart', 'intelligent', 'ingenious'],
    ['happy', 'joyful'],
    ['sad', 'melancholy'],
    ['angry', 'furious', 'hostile'],
    ['tired', 'exhausted', 'asleep'],
    ['lazy', 'idle'],
    ['quiet', 'silent'],
    ['hungry', 'famished'],
    ['strange', 'peculiar'],
    ['loyal', 'faithful'],
    ['obvious', 'evident', 'visible', 'clear', 'lucid', 'transparent'],
    ['persistent', 'tenacious', 'stubborn', 'obstinate', 'rigid'],
    ['malevolent', 'hostile'],
    ['famous'],
    ['obscure', 'vague'],
    ['difficult', 'challenging', 'arduous', 'strenuous', 'complex'],
    ['beautiful', 'gorgeous'],
    ['answer', 'reply'],
    ['gift', 'present'],
    ['mistake', 'error'],
    ['shine', 'gleam'],
    ['ubiquitous', 'omnipresent'],
    ['ephemeral', 'fleeting', 'temporary'],
    ['expert'],
    ['novice'],
    ['arrogant'],
    ['humble'],
  ];
  const clusterOf = (w) => CLUSTERS.find((c) => c.includes(String(w).toLowerCase())) || [String(w).toLowerCase()];
  const related = (a, b) => clusterOf(a).includes(String(b).toLowerCase());
  const syn = parse(T.SYNONYMS);
  const ant = parse(T.ANTONYMS);
  const wordPool = Array.from(new Set(syn.flat().concat(ant.flat()).filter((x) => /^[A-Za-z-]+$/.test(x) && !/^[123]$/.test(x))));
  for (const [w, s, tier] of syn) {
    const p = `Which word means the same as "${w.toLowerCase()}"?`;
    const wr = pick(p, s, wordPool, null, (v) => related(w, v) || related(s, v) || clusterOf(v).some((x) => ant.some((r) => (r[0].toLowerCase() === x && related(w, r[1])) || (r[1].toLowerCase() === x && related(w, r[0])))));
    if (wr) add(p, s, wr, { category: 'language', sub: 'synonyms', tier, explanation: `"${s}" is a synonym of "${w.toLowerCase()}".` });
  }
  for (const [w, a, tier] of ant) {
    const p = `What is the opposite of "${w.toLowerCase()}"?`;
    const wr = pick(p, a, wordPool, null, (v) => related(a, v) || ant.some((r) => (r[0].toLowerCase() === v.toLowerCase() && related(w, r[1])) || (r[1].toLowerCase() === v.toLowerCase() && related(w, r[0]))));
    if (wr) add(p, a, wr, { category: 'language', sub: 'antonyms', tier, explanation: `"${a}" is the opposite of "${w.toLowerCase()}".` });
  }
  pairTable(parse(T.HELLO), {
    category: 'language',
    sub: 'greetings',
    ask: (a) => `"${a}" means hello in which language?`,
    explain: (a, b) => `"${a}" is a greeting in ${b}.`,
  });
  const plurals = parse(T.PLURALS);
  const ACCEPTS_S = new Set(['cactus', 'fungus', 'appendix', 'medium', 'die', 'datum', 'nucleus', 'phenomenon']);
  for (const [word, plural, tier] of plurals) {
    const base = strip(word);
    const p = `What is the plural of "${word.toLowerCase()}"?`;
    const r = QuizCore.rng(QuizCore.hash('pl:' + word));
    const wrongs = [];
    if (!ACCEPTS_S.has(base.toLowerCase())) wrongs.push(base + (/(s|x|ch|sh)$/i.test(base) ? 'es' : 's'));
    wrongs.push(/s$/i.test(plural) ? plural + 'es' : plural + 's');
    const others = QuizCore.shuffle(plurals.filter((x) => x[1] !== plural).map((x) => x[1]), r);
    while (wrongs.length < 3 && others.length) wrongs.push(others.shift());
    add(p, plural, wrongs, { category: 'language', sub: 'plurals', tier, explanation: `The plural of "${base.toLowerCase()}" is "${plural.toLowerCase()}".` });
  }

  // ---- history tables
  for (const [event, year, tier] of parse(T.EVENTS)) {
    const p = `In which year: ${event}?`;
    const y = Number(year);
    const w = numWrongs(p, y, y < 1000 ? [10, 21, 45, 100] : [1, 3, 5, 10, 20]);
    if (w) add(p, year, w, { category: 'history', sub: 'dates', tier, explanation: `${event} in ${year}.` });
  }
  pairTable(parse(T.FIGURES), {
    category: 'history',
    sub: 'figures',
    ask: (a) => `Which present-day country is ${a} most associated with?`,
    reverse: (b) => `Which historical figure is most associated with present-day ${b}?`,
    explain: (a, b) => `${a} is a famous figure from the history of ${b}.`,
  });
  pairTable(parse(T.SCIENTISTS), {
    category: 'science',
    sub: 'scientists',
    ask: (a) => `What is ${a} best known for?`,
    reverse: (b) => `Who is best known for: ${b.charAt(0).toLowerCase() + b.slice(1)}?`,
    explain: (a, b) => `${a} is best known for ${b.charAt(0).toLowerCase() + b.slice(1)}.`,
  });
  pairTable(parse(T.RIVERS), {
    category: 'geography',
    sub: 'rivers',
    ask: (a) => `On which continent does the ${a} river flow?`.replace('the Yellow River (Huang He) river', 'the Yellow River (Huang He)'),
    explain: (a, b) => `The ${a} is in ${b}.`,
  });

  // ---- number facts (gk)
  const toRoman = (n) => {
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '';
    for (const [v, r] of map) while (n >= v) (s += r), (n -= v);
    return s;
  };
  const romanSet = [4, 9, 12, 14, 19, 24, 29, 36, 40, 44, 49, 50, 55, 64, 76, 88, 90, 94, 99, 100, 150, 400, 444, 500, 900, 999, 1000, 1492, 1666, 1776, 1945, 1999, 2000, 2026];
  for (const n of romanSet) {
    const tier = n <= 20 ? 1 : n <= 100 ? 2 : 3;
    const p1 = `What is ${n} in Roman numerals?`;
    const w1 = numWrongs(p1, n, n < 50 ? [1, 5, 10] : n < 500 ? [1, 10, 50] : [1, 10, 100, 500], toRoman);
    if (w1) add(p1, toRoman(n), w1, { category: 'gk', sub: 'roman-numerals', tier, explanation: `${n} is written ${toRoman(n)}.` });
    const p2 = `What number is ${toRoman(n)} in Roman numerals?`;
    const w2 = numWrongs(p2, n, n < 50 ? [1, 5, 10] : n < 500 ? [1, 10, 50] : [1, 10, 100, 500]);
    if (w2) add(p2, String(n), w2, { category: 'gk', sub: 'roman-numerals', tier, explanation: `${toRoman(n)} = ${n}.` });
  }
  for (let n = 11; n <= 25; n++) {
    const p = `What is ${n} × ${n}?`;
    const w = numWrongs(p, n * n, [n, 2 * n - 1, 10, 1]);
    if (w) add(p, String(n * n), w, { category: 'gk', sub: 'maths', tier: n <= 15 ? 1 : 2, explanation: `${n} squared is ${n * n}.` });
  }
  for (let n = 2; n <= 10; n++) {
    const p = `What is ${n} cubed (${n} × ${n} × ${n})?`;
    const w = numWrongs(p, n ** 3, [n * n, n, 2 * n, 10]);
    if (w) add(p, String(n ** 3), w, { category: 'gk', sub: 'maths', tier: n <= 5 ? 1 : 2, explanation: `${n}³ = ${n ** 3}.` });
  }

  // ---- regional packs (locale-tagged; opt-in only)
  for (const [locale, block] of Object.entries(REGIONAL)) {
    for (const r of parse(block)) {
      if (r.length < 7) continue;
      add(r[1], r[2], [r[3], r[4], r[5]], { category: r[0], sub: 'regional', tier: r[6], explanation: r[7] || '', locale });
    }
  }
  const statePack = (block, locale, country) => {
    const rows = parse(block);
    const caps = Array.from(new Set(rows.map((r) => r[1])));
    for (const [state, cap] of rows) {
      const p = `What is the capital of ${state}${country ? ` (${country})` : ''}?`;
      const w = pick(p, cap, caps, null, (v) => rows.some((x) => x[0] === state && x[1] === v));
      if (w) add(p, cap, w, { category: 'geography', sub: 'regional-capitals', tier: 2, explanation: `${cap} is the capital of ${state}.`, locale });
    }
  };
  statePack(US_STATES, 'us', 'US state');
  statePack(INDIA_STATES, 'in', 'Indian state');

  return out;
}

let BANK = null;
let BY_ID = null;
function bank() {
  if (!BANK) {
    BANK = buildBank();
    BY_ID = new Map(BANK.map((q) => [q.id, q]));
  }
  return BANK;
}
function byId(id) {
  bank();
  return BY_ID.get(id) || null;
}
function counts() {
  const out = { total: 0, global: 0, byCategory: {}, byLocale: {}, byDifficulty: { 1: 0, 2: 0, 3: 0 } };
  for (const q of bank()) {
    out.total++;
    if (q.locale === 'global') {
      out.global++;
      out.byCategory[q.category] = (out.byCategory[q.category] || 0) + 1;
    }
    out.byLocale[q.locale] = (out.byLocale[q.locale] || 0) + 1;
    out.byDifficulty[q.difficulty]++;
  }
  return out;
}

module.exports = { bank, byId, counts, buildBank };
