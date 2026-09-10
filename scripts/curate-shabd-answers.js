/**
 * Prompt 5: remove unfair Daily targets from SHABD_ANSWERS.
 * Rejects remain guessable via the allowed bank.
 */
const fs = require('fs');
const path = require('path');

const answersPath = path.join(__dirname, '..', 'public', 'src', 'js', 'games', 'data', 'shabd-answers.js');
const raw = fs.readFileSync(answersPath, 'utf8');
const m = raw.match(/g\.SHABD_ANSWERS=(\[[\s\S]*?\]);/);
if (!m) {
  console.error('Could not parse SHABD_ANSWERS');
  process.exit(1);
}
const before = JSON.parse(m[1]);

/** Conservative denylist — crude, loaded, or cruelly obscure for Chaupaal dailies. */
const DENY = new Set(
  [
    'PUBIC', 'SEMEN', 'FECAL', 'FETUS', 'URINE', 'GONAD', 'BOOBY', 'BUXOM', 'HORNY',
    'HUSSY', 'SISSY', 'SPERM', 'ENEMA', 'FETAL', 'FETID', 'LEPER', 'RETCH', 'ABORT',
    'BIGOT', 'PRICK', 'WENCH', 'AXION', 'ECLAT', 'DROIT', 'TWIXT', 'QUOTH', 'CAULK',
    'CAPUT', 'AIDER', 'BEGAT', 'BOULE', 'CRESS', 'CRUMP', 'THRUM', 'SMOTE', 'GOLEM',
    'ILIAC', 'OVINE', 'OVOID', 'POESY', 'REBUS', 'SCION', 'SYNOD', 'TIBIA', 'TRICE',
    'UMBRA', 'UTILE', 'VAUNT', 'WIGHT', 'WRACK', 'WRUNG', 'WRYLY', 'APHID', 'APNEA',
    'AUGUR', 'AXIAL', 'BALER', 'BASTE', 'BEFIT', 'BEGET', 'BEVEL', 'BEZEL', 'BILGE',
    'BLEAT', 'BORAX', 'BRIAR', 'BRINE', 'BRINY', 'CABAL', 'CAIRN', 'CAVIL', 'CHAFE',
    'CHAFF', 'CHARD', 'CHIDE', 'CHOCK', 'CLEAT', 'CLEFT', 'COPSE', 'CORER', 'COVEY',
    'COYLY', 'CREDO', 'CREME', 'CREPE', 'CRONE', 'CROUP', 'CURIO', 'DEBAR', 'DEIGN',
    'DEMUR', 'DIRGE', 'DOWEL', 'DROSS', 'DRYLY', 'DUCHY', 'EDIFY', 'EGRET', 'EKING',
    'ELATE', 'ELEGY', 'ELFIN', 'ELIDE', 'ENNUI', 'EPOXY', 'ESTER', 'ETUDE', 'EXALT',
    'EXTOL', 'EYING', 'FEMME', 'FEMUR', 'FICUS', 'FILET', 'FILMY', 'FJORD', 'FLACK',
    'FLAIL', 'FLECK', 'FLOUT', 'FLUME', 'FLUNK', 'FOIST', 'FOLIO', 'FORAY', 'FORGO',
    'FRILL', 'FRISK', 'FRITZ', 'FROCK', 'FROND', 'FUGUE', 'FUROR', 'GAMUT', 'GAVEL',
    'GAWKY', 'GAYER', 'GAYLY', 'GIPSY', 'GLYPH', 'GNASH', 'GNOME', 'GONER', 'GOUGE',
    'GRAIL', 'GRIME', 'GRIPE', 'GROIN', 'GROPE', 'GROUT', 'GRUEL', 'GULCH', 'HAREM',
    'HARPY', 'HAUTE', 'HELIX', 'HOVEL', 'HUMPH', 'HUMUS', 'HYMEN', 'IDYLL', 'IMBUE',
    'IMPEL', 'INANE', 'INGOT', 'INLAY', 'IRATE', 'ISLET', 'JOIST', 'JUNTA', 'JUNTO',
    'KNAVE', 'KNOLL', 'KRILL', 'LADLE', 'LARVA', 'LATHE', 'LEACH', 'LEECH', 'LEERY',
    'LEMUR', 'LIBEL', 'LIEGE', 'LITHE', 'LOAMY', 'LOCUS', 'LUPUS', 'LURCH', 'LURID',
    'LYMPH', 'MACAW', 'MANGE', 'MANGY', 'MASSE', 'MIDGE', 'MINIM', 'MOULT', 'MUCKY',
    'MYRRH', 'NADIR', 'NATAL', 'NEIGH', 'NOBLY', 'NOOSE', 'OAKEN', 'OCTAL', 'OCTET',
    'OFFAL', 'OMBRE', 'OPINE', 'OVATE', 'PALSY', 'PAPAL', 'PARER', 'PATSY', 'PAYEE',
    'PIETY', 'PLAIT', 'PLIED', 'PLIER', 'POLYP', 'POSIT', 'POSSE', 'PREEN', 'PRIED',
    'PRIMO', 'PRIVY', 'PRONG', 'PRUDE', 'PSALM', 'PULPY', 'PURER', 'PYGMY', 'QUALM',
    'QUARK', 'QUASH', 'QUASI', 'QUELL', 'RADII', 'RAJAH', 'REARM', 'REBAR', 'REBUT',
    'RECUT', 'REEDY', 'REFIT', 'RELIC', 'REMIT', 'RENAL', 'RIPER', 'RISER', 'RIVET',
    'ROACH', 'ROTOR', 'ROWER', 'RUDER', 'SALVE', 'SALVO', 'SANER', 'SATYR', 'SAUTE',
    'SAVOY', 'SCALD', 'SCAMP', 'SCONE', 'SCREE', 'SCRUM', 'SEGUE', 'SEPIA', 'SERIF',
    'SHALE', 'SHALT', 'SHANK', 'SHARD', 'SHEAR', 'SHEIK', 'SHIED', 'SHIRE', 'SHIRK',
    'SHOAL', 'SHORN', 'SHREW', 'SHUCK', 'SHUNT', 'SIEVE', 'SIGMA', 'SINEW', 'SINGE',
    'SKIFF', 'SKIMP', 'SKULK', 'SLAIN', 'SLEET', 'SLOOP', 'SLOSH', 'SMITE', 'SMOCK',
    'SNIDE', 'SNIPE', 'SOOTH', 'SOWER', 'SPASM', 'SPELT', 'SPIEL', 'SPILT', 'SPIRE',
    'SPLAT', 'SPOOF', 'SPORE', 'SPRIG', 'SPURN', 'SQUIB', 'STAID', 'STAVE', 'STEED',
    'STEIN', 'STILT', 'STINT', 'STOIC', 'STOKE', 'STOMP', 'STOOP', 'STORK', 'STRUT',
    'SUING', 'SULKY', 'SULLY', 'SUMAC', 'SURER', 'SURLY', 'SWASH', 'SWATH', 'SWILL',
    'SWINE', 'SWIRL', 'SWOON', 'TACIT', 'TAINT', 'TALON', 'TAMER', 'TAPIR', 'TAROT',
    'TATTY', 'TAWNY', 'TENET', 'TEPEE', 'TEPID', 'TERRA', 'TERSE', 'THETA', 'THYME',
    'TIARA', 'TILDE', 'TITHE', 'TONAL', 'TONGA', 'TORUS', 'TOTEM', 'TRACT', 'TRAMP',
    'TRAWL', 'TRIAD', 'TRIPE', 'TRITE', 'TROPE', 'TRUER', 'TRUSS', 'TRYST', 'TUBAL',
    'TUBER', 'TULLE', 'TUNIC', 'TWANG', 'TWEAK', 'TWEED', 'TWINE', 'TWIRL', 'UDDER',
    'UNFED', 'UNLIT', 'UNMET', 'UNSET', 'UNWED', 'USURP', 'VAPID', 'VERGE', 'VERSO',
    'VERVE', 'VICAR', 'VIGIL', 'VIXEN', 'VOILA', 'VYING', 'WAFER', 'WARTY', 'WAXEN',
    'WELCH', 'WHELP', 'WHIFF', 'WIELD', 'WILLY', 'WIMPY', 'WINCE', 'WINCH', 'WISPY',
    'WOOER', 'WOOLY', 'WOOZY', 'WORDY', 'WOVEN', 'WREAK', 'WREST', 'WRING', 'ZESTY',
    'ZONAL', 'AFOUL', 'AGLOW', 'CIRCA', 'CLUED', 'CRICK', 'CRIER', 'CRIMP', 'CROAK',
    'CROCK', 'CRONY', 'DATUM', 'DECAL', 'DECOY', 'DECRY', 'DINGY', 'DIODE', 'DITTY',
    'DRAKE', 'DRAPE', 'DRAWL', 'DRIER', 'DROOL', 'DROOP', 'DRUID',
  ].map((w) => w.toUpperCase())
);

const after = before.filter((w) => !DENY.has(String(w).toUpperCase()));
const removed = before.filter((w) => DENY.has(String(w).toUpperCase()));

const out =
  '// Curated Shabd Five answer bank (daily/practice targets). Prompt 5 identity pass.\n' +
  '// Obscure/awkward rejects stay guessable via SHABD_ALLOWED. Future day seeds use this length.\n' +
  '(function(g){g.SHABD_ANSWERS=' +
  JSON.stringify(after) +
  ';})(typeof window!=="undefined"?window:typeof globalThis!=="undefined"?globalThis:this);\n';

fs.writeFileSync(answersPath, out);
console.log(
  JSON.stringify(
    {
      before: before.length,
      after: after.length,
      removed: removed.length,
      sampleRemoved: removed.slice(0, 40),
    },
    null,
    2
  )
);
