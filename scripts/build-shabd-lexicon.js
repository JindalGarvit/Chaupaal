/**
 * Build Shabd Five Prompt 1 lexicon data files from Wordle-scale sources
 * already downloaded under %TEMP%/shabd-lexicon.
 */
const fs = require('fs');
const path = require('path');

const tmp = path.join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'shabd-lexicon');
const outDir = path.join(__dirname, '..', 'public', 'src', 'js', 'games', 'data');

const LEGACY = [
  'PRESS','CHAIN','BLADE','FLINT','GROAN','PLUMB','CRATE','SWING','BRAVE','SHAFT','TROVE','QUILL','CHEST','FLAME','STORM','PRIDE','GLOBE','CRISP','BLOOM','DRAFT',
  'CIVIC','GRAND','CLAIM','PIVOT','GRACE','CLOUD','EARTH','FAITH','LIGHT','MIGHT','NIGHT','PLAIN','QUEEN','RAISE','SAINT','TRAIL','UNITE','VOICE','WASTE','YIELD',
  'ZONES','ABOUT','BEACH','CANDY','DENSE','EARLY','FANCY','GHOST','HAPPY','INDIE','JUICE','KNEEL','LASER','MAGIC','NAIVE','OCEAN','PIANO','QUIET','RIVER','SUGAR',
  'TOUCH','ULTRA','VENOM','WORRY','XERIC','YOUNG','ZEBRA','ANGER','BLEND','CROSS','DAILY','EAGLE','FRESH','GREAT','HURRY','IDEAL','JOINT','KNOCK','LEGAL','MATCH',
  'NOBLE','OFTEN','PAINT','RANGE','SLEEP','TRADE','UNDER','VITAL','WATER','APPLE','BREAD','BRICK','CHARM','DANCE','DREAM','FIELD','FOCUS','FORGE','FRUIT','GLASS',
  'GRAIN','HEART','HONEY','HOUSE','IMAGE','IVORY','JELLY','JUDGE','LEMON','LEVEL','LUNAR','MANGO','METAL','MINTY','MOUSE','MUSIC','NORTH','NOVEL','OLIVE','OPERA',
  'ORBIT','PEARL','PLANT','POISE','POWER','PRISM','RADIO','RIDGE','ROYAL','SCALE','SCOUT','SHARE','SHINE','SKILL','SOLID','SPICE','STONE','STORY','SWEET','TABLE',
  'THORN','TIGER','TODAY','TOKEN','TREND','TRUST','URBAN','VALUE','VIVID','WHEAT','WIDOW','WORLD','WRIST','YACHT','YEAST','ADORE','ALERT','AMBER','ARROW','ATLAS',
  'AUDIO','BASIL','BERRY','BOUND','BRAIN','BROOK','CABLE','CAMEL','CEDAR','CHALK','CIDER','CORAL','CROWN','DELTA','DIARY','DRIFT','EMBER','FABLE','FEAST','FLORA',
  'ALBUM','ANGLE','APRON','BADGE','BASIN','BATCH','BISON','BLISS','BRUSH','CABIN','CANOE','CLOAK','CLOVE','COMET','CRANE','CREST','CURVE','DEITY','DOUBT','DWARF',
  'ELBOW','EPOCH','EQUIP','FENCE','FJORD','FLUTE','FROST','GLINT','GRAPH','GROVE','GUARD','HAVEN','HEDGE','HIKER','HUMOR','INLET','JOKER','KARMA','LODGE','MOSSY',
];

function normLines(text) {
  const out = [];
  const seen = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const w = line.trim().toUpperCase();
    if (!/^[A-Z]{5}$/.test(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

const full = normLines(fs.readFileSync(path.join(tmp, 'full.txt'), 'utf8'));
const answersBase = normLines(fs.readFileSync(path.join(tmp, 'answers.txt'), 'utf8'));
if (full.length < 5000 || answersBase.length < 500) {
  console.error('Source banks too small', { full: full.length, answers: answersBase.length, tmp });
  process.exit(1);
}

const allowedSet = new Set(full);
// Legacy Chaupaal words stay guessable even if not in the public lexicon.
for (const w of LEGACY) {
  if (/^[A-Z]{5}$/.test(w)) allowedSet.add(w);
}
// Answers = curated Wordle-class pool only (fair dailies). Legacy oddballs stay allowed-only.
const answers = [];
const aSeen = new Set();
for (const w of answersBase) {
  if (!/^[A-Z]{5}$/.test(w) || aSeen.has(w)) continue;
  aSeen.add(w);
  answers.push(w);
  allowedSet.add(w);
}
const allowed = Array.from(allowedSet).sort();

let missing = 0;
for (const w of answers) if (!allowedSet.has(w)) missing++;
if (missing) {
  console.error('answers not subset of allowed', missing);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const answersJs =
  '// Auto-generated Shabd Five answer bank (daily/practice targets).\n' +
  '// Wordle-class possible answers. Prompt 1 lexicon.\n' +
  '(function(g){g.SHABD_ANSWERS=' +
  JSON.stringify(answers) +
  ';})(typeof window!=="undefined"?window:typeof globalThis!=="undefined"?globalThis:this);\n';
fs.writeFileSync(path.join(outDir, 'shabd-answers.js'), answersJs);

const allowedJs =
  '// Auto-generated Shabd Five allowed-guess bank.\n' +
  '// Public Wordle-scale 5-letter lexicon. Parsed once into a Set at runtime.\n' +
  '(function(g){g.SHABD_ALLOWED_RAW=' +
  JSON.stringify(allowed.join('\n')) +
  ';})(typeof window!=="undefined"?window:typeof globalThis!=="undefined"?globalThis:this);\n';
fs.writeFileSync(path.join(outDir, 'shabd-allowed.js'), allowedJs);

console.log(
  JSON.stringify(
    {
      answers: answers.length,
      allowed: allowed.length,
      answersKb: +(answersJs.length / 1024).toFixed(1),
      allowedKb: +(allowedJs.length / 1024).toFixed(1),
      outDir,
    },
    null,
    2
  )
);
