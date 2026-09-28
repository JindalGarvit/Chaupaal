// ===================== SCRIBBLE (draw & guess) =====================
const SCRIBBLE_WORDS=["elephant", "dolphin", "penguin", "butterfly", "jellyfish", "crocodile", "flamingo", "kangaroo", "cheetah", "gorilla", "giraffe", "porcupine", "chameleon", "octopus", "seahorse", "platypus", "armadillo", "orangutan", "chimpanzee", "rhinoceros", "hippopotamus", "peacock", "pelican", "toucan", "parrot", "cobra", "python", "eagle", "falcon", "owl", "whale", "shark", "starfish", "lobster", "crab", "scorpion", "tarantula", "dragonfly", "firefly", "squirrel", "hedgehog", "beaver", "badger", "raccoon", "skunk", "meerkat", "lemur", "sloth", "anteater", "guitar", "telescope", "umbrella", "bicycle", "lighthouse", "helicopter", "submarine", "microscope", "compass", "thermometer", "calculator", "binoculars", "periscope", "sundial", "hourglass", "protractor", "abacus", "typewriter", "lantern", "canteen", "hammock", "backpack", "suitcase", "parachute", "magnifying glass", "flashlight", "walkie talkie", "megaphone", "trophy", "diploma", "passport", "anchor", "stethoscope", "scissors", "screwdriver", "wrench", "pliers", "saw", "drill", "hammer", "chisel", "level", "ruler", "tape measure", "pizza", "sunflower", "watermelon", "pineapple", "strawberry", "broccoli", "avocado", "croissant", "pretzel", "sushi", "dumpling", "burrito", "taco", "waffle", "pancake", "macaron", "cheesecake", "tiramisu", "baguette", "donut", "bagel", "muffin", "cupcake", "brownie", "\u00e9clair", "meringue", "sorbet", "pudding", "lasagna", "paella", "risotto", "ramen", "pho", "biryani", "curry", "samosa", "chapati", "naan", "mountain", "rainbow", "waterfall", "volcano", "glacier", "tornado", "blizzard", "hurricane", "earthquake", "tsunami", "aurora", "eclipse", "meteor", "comet", "asteroid", "nebula", "galaxy", "constellation", "supernova", "quasar", "canyon", "plateau", "delta", "estuary", "peninsula", "archipelago", "atoll", "fjord", "savanna", "tundra", "mangrove", "coral reef", "geyser", "lagoon", "oasis", "quicksand", "avalanche", "landslide", "drought", "flood", "rocket", "hot air balloon", "spaceship", "sailboat", "hovercraft", "snowmobile", "rickshaw", "tram", "monorail", "gondola", "kayak", "canoe", "catamaran", "ferry", "blimp", "zeppelin", "glider", "hang glider", "paraglider", "skateboard", "scooter", "unicycle", "tricycle", "wheelchair", "ambulance", "fire truck", "bulldozer", "crane", "excavator", "castle", "pyramid", "igloo", "pagoda", "mosque", "cathedral", "amphitheatre", "colosseum", "aqueduct", "treehouse", "windmill", "cottage", "mansion", "skyscraper", "observatory", "planetarium", "aquarium", "museum", "library", "stadium", "arena", "circus tent", "barn", "silo", "greenhouse", "gazebo", "kiosk", "bungalow", "villa", "swimming", "climbing", "juggling", "skateboarding", "surfing", "snowboarding", "parachuting", "scuba diving", "bungee jumping", "rock climbing", "meditation", "yoga", "archery", "fencing", "wrestling", "boxing", "karate", "ballet", "breakdancing", "hula hooping", "fishing", "gardening", "painting", "sculpting", "knitting", "weaving", "pottery", "woodcarving", "origami", "calligraphy", "firefighter", "astronaut", "surgeon", "chef", "detective", "magician", "acrobat", "conductor", "archaeologist", "geologist", "beekeeper", "shepherd", "lumberjack", "blacksmith", "glassblower", "taxidermist", "sommelier", "puppeteer", "falconer", "cartographer", "pillow", "blanket", "curtain", "chandelier", "fireplace", "bathtub", "rocking chair", "bookshelf", "clock", "mirror", "candle", "teapot", "mug", "colander", "whisk", "ladle", "spatula", "tongs", "mortar", "pestle", "soap", "toothbrush", "hairdryer", "iron", "vacuum", "blender", "toaster", "kettle", "microwave", "dishwasher", "sombrero", "beret", "turban", "tiara", "crown", "veil", "monocle", "bowtie", "suspenders", "cufflinks", "kimono", "sari", "kilt", "poncho", "cape", "toga", "tuxedo", "trench coat", "overalls", "jumpsuit", "violin", "cello", "harp", "accordion", "bagpipes", "didgeridoo", "xylophone", "marimba", "tambourine", "castanets", "trombone", "tuba", "flugelhorn", "oboe", "clarinet", "bassoon", "harmonica", "ukulele", "banjo", "sitar", "dragon", "unicorn", "mermaid", "werewolf", "vampire", "wizard", "witch", "goblin", "troll", "fairy", "centaur", "phoenix", "griffin", "kraken", "cyclops", "sphinx", "minotaur", "leprechaun", "genie", "surfboard", "snowboard", "hockey stick", "cricket bat", "polo mallet", "lacrosse stick", "javelin", "discus", "vaulting pole", "boomerang", "badminton racket", "ping pong paddle", "frisbee", "bowling pin", "dumbbell", "kettlebell", "barbell", "punching bag", "balance beam", "pommel horse", "robot", "drone", "satellite", "antenna", "circuit board", "battery", "magnet", "prism", "bunsen burner", "test tube", "petri dish", "centrifuge", "oscilloscope", "spectrometer", "voltmeter", "transistor", "capacitor", "resistor", "solar panel", "wind turbine", "peace", "freedom", "gravity", "time", "silence", "echo", "shadow", "reflection", "balance", "chaos", "infinity", "paradox", "evolution", "revolution", "democracy", "justice", "equality", "courage", "wisdom", "loyalty", "wombat", "quokka", "axolotl", "pangolin", "tapir", "capybara", "narwhal", "manatee", "dugong", "walrus", "puffin", "albatross", "booby", "frigate bird", "secretary bird", "shoebill", "cassowary", "emu", "kiwi", "roadrunner", "mudskipper", "archerfish", "leafy sea dragon", "mantis shrimp", "pistol shrimp", "vampire squid", "bioluminescent jellyfish", "flying fish", "electric eel", "anglerfish", "auto rickshaw", "diya", "rangoli", "tabla", "veena", "kolam", "mehendi", "kurta", "dhol", "shehnai", "mridangam", "tanpura", "sarangi", "jalra", "dholak", "nagara", "pungi", "been", "chai stall", "paan", "lassi", "chaat", "thali", "dosa", "idli", "vada", "sambar", "rasam", "holi", "diwali", "durga puja", "kite festival", "onam", "baisakhi", "pongal", "ganesh chaturthi", "navratri", "eid", "mahal", "haveli", "ghat", "ashram", "mandir", "gurudwara", "dargah", "stepwell", "jharokha", "chhatri", "cotton candy", "caramel apple", "candy floss", "lollipop", "toffee", "fudge", "nougat", "marzipan", "praline", "truffle", "fondue", "raclette", "quiche", "cr\u00eape", "galette", "falafel", "hummus", "tzatziki", "baklava", "halva", "ceviche", "poke bowl", "acai bowl", "smoothie bowl", "granola", "overnight oats", "french toast", "eggs benedict", "shakshuka", "congee", "kaleidoscope", "snow globe", "music box", "cuckoo clock", "grandfather clock", "astrolabe", "sextant", "chronometer", "spinning top", "yo yo", "kite", "slinky", "rubik's cube", "jigsaw puzzle", "domino", "dartboard", "piggy bank", "treasure chest", "lockbox", "safe", "vault", "filing cabinet", "inbox tray", "bulletin board", "chalkboard", "whiteboard", "cherry blossom", "lotus", "magnolia", "hibiscus", "orchid", "poppy", "dahlia", "chrysanthemum", "anthurium", "baobab tree", "banyan tree", "redwood", "bonsai", "cactus", "venus flytrap", "pitcher plant", "sundew", "rafflesia", "corpse flower", "termite mound", "bird's nest", "beehive", "spider web", "burrow", "dam", "anthill", "warren", "den", "lair", "facepalm", "thumbs up", "shrug", "wink", "eyeroll", "double take", "bow", "curtsy", "salute", "namaste", "black hole", "pulsar", "wormhole", "space station", "moon landing", "asteroid belt", "solar flare", "cosmic ray", "thunderstorm", "hailstorm", "sandstorm", "whirlwind", "waterspout", "fog", "smog", "double rainbow", "sundog", "tangled headphones", "empty fridge", "wifi signal", "loading spinner", "battery low", "notification ping", "autocorrect fail", "selfie stick", "power bank", "phone case", "flat tire", "traffic jam", "road rage", "parking ticket", "speed bump", "roundabout", "u turn", "dead end", "shortcut", "detour", "lost luggage", "missed flight", "jet lag", "culture shock", "language barrier", "homesickness", "wanderlust", "bucket list", "souvenir", "postcard", "gymnastics", "acrobatics", "trapeze", "alpaca", "llama", "bison", "moose", "reindeer", "caribou", "yak", "ibex", "otter", "mink", "ferret", "stoat", "weasel", "vole", "shrew", "mole", "macaw", "cockatoo", "lorikeet", "canary", "finch", "sparrow", "robin", "wren", "swallow", "stork", "heron", "egret", "ibis", "kingfisher", "woodpecker", "hoopoe", "hornbill", "sunbird", "starling", "piranha", "barracuda", "tuna", "swordfish", "salamander", "newt", "toad", "gecko", "iguana", "skink", "millipede", "centipede", "earwig", "silverfish", "jackhammer", "forklift", "tractor", "harvester", "plough", "watermill", "sawmill", "printing press", "loom", "spinning wheel", "sewing machine", "easel", "palette", "paintbrush", "charcoal", "pastel", "canvas", "fountain pen", "quill", "inkwell", "scroll", "metronome", "tuning fork", "gramophone", "jukebox", "turntable", "tightrope", "puppet", "marionette", "carousel", "roller coaster", "bumper car", "wok", "tagine", "pressure cooker", "steamer basket", "tandoor", "bread maker", "pasta machine", "ice cream maker", "butter dish", "gravy boat", "piping bag", "cookie cutter", "rolling pin", "pastry brush", "zester", "mandoline", "trampoline", "springboard", "diving board", "hurdle", "croquet", "rowing oar", "luge", "bobsled", "chess piece", "checkers", "backgammon", "billiards", "flying buttress", "gargoyle", "battlement", "portcullis", "drawbridge", "moat", "turret", "keystone", "atrium", "clerestory", "apse", "transept", "nave", "crypt", "retort stand", "burette", "pipette", "distillation", "electroscope", "galvanometer", "ammeter", "solenoid", "spectroscope", "polarimeter", "fascinator", "pillbox hat", "cloche", "fez", "ruff", "pauldron", "gauntlet", "greave", "muff", "stole", "boa", "cravat", "ascot", "mesa", "butte", "drumlin", "sinkhole", "cenote", "stalactite", "stalagmite", "fumarole", "salt flat", "funicular", "cable car", "chairlift", "zipline", "rope bridge", "jetty", "pier", "wharf", "quay", "promenade", "boardwalk", "chaise longue", "daybed", "futon", "tatami", "footstool", "ottoman", "pavlova", "kimchi", "harissa", "chutney", "pickle", "relish", "brigadeiro", "lamington", "sambal", "dukkah", "sumac", "miso", "doenjang", "vegemite", "marmite", "chicha", "treadmill", "elliptical", "gymnastic ring", "rubik cube", "stapler", "hole punch", "shredder", "label maker", "pencil case", "baobab", "banyan", "bird nest", "jack in the box", "top hat", "crepe", "satellite dish", "peace sign", "shadow puppet", "balance scale", "compass rose", "anchor chain", "ship wheel", "sword swallower", "fire breather", "contortionist", "stilt walker", "escape artist", "plate spinner", "knife thrower", "hypnotist", "tightrope walker", "manta ray", "hammerhead", "orca", "pomegranate", "dragonfruit", "lychee", "jackfruit", "rambutan", "durian", "starfruit", "mangosteen", "soursop", "papaya", "guava", "passion fruit", "kumquat", "yuzu", "tamarind", "jujube", "longan", "carambola", "sapodilla", "cherimoya", "lathe", "band saw", "jigsaw", "router", "planer", "jointer", "pile driver", "milling machine", "drill press", "ketchup", "mustard", "mayonnaise", "vinegar", "soy sauce", "worcestershire", "tabasco", "sriracha", "pesto", "tahini", "jambalaya", "gumbo", "chowder", "bisque", "gazpacho", "minestrone", "bouillabaisse", "vichyssoise", "souvlaki", "gyro", "shawarma", "kebab", "satay", "tempura", "teriyaki", "bulgogi", "bibimbap", "banh mi", "injera", "jollof", "couscous", "moussaka", "dolma", "spanakopita", "pierogi", "borscht", "stroganoff", "bretzel", "knish", "blini", "socca", "farinata", "piadina", "flatbread", "windsurfer", "parasailor", "kitesurfer", "wakeboard", "skimboard", "bodyboard", "paddleboard", "outrigger", "trimaran", "hydrofoil", "escalator", "dumbwaiter", "revolving door", "trapdoor", "secret passage", "hidden room", "panic room", "anvil", "bellows", "crucible", "mould", "ingot", "forge", "kiln", "pottery wheel", "glazing", "sandcastle", "snow fort", "lean to", "debris hut", "snow cave", "quinzhee", "bivouac", "hammock tent", "floating cabin", "percolator", "french press", "aeropress", "moka pot", "drip filter", "siphon", "cold brew", "espresso", "lungo", "ristretto", "cappuccino", "macchiato", "affogato", "cortado", "nitro coffee", "cold drip", "turkish coffee", "chai latte", "matcha latte"];

/** Light category bias for pick-3 (words must exist in SCRIBBLE_WORDS). */
const SCRIBBLE_CATS={
  animals:['elephant','dolphin','penguin','butterfly','kangaroo','peacock','cobra','owl','capybara','narwhal','macaw','otter'],
  objects:['guitar','umbrella','bicycle','telescope','backpack','passport','scissors','hammer','pillow','mirror','robot','drone'],
  food:['pizza','biryani','samosa','dosa','idli','sushi','waffle','avocado','chai latte','lassi','chaat','pomegranate'],
  india:['auto rickshaw','diya','rangoli','tabla','sari','holi','diwali','mandir','ghat','mehendi','dhol','naan'],
};

function openScribbleGame(chat,playerList,opts){
  const options=opts||{};
  const list=(playerList||[]).filter(p=>p&&p.name!==undefined);
  const launchCtx=(typeof window!=='undefined'&&window.__dangalLaunchCtx)||{};
  const liveOn=typeof DangalLive!=='undefined'&&DangalLive.isLive(chat,launchCtx);
  const liveRoles=liveOn&&DangalLive.roles?DangalLive.roles(chat,launchCtx):null;
  /** Scribble party is intentionally capped at 3–6 seats; 1v1 remains a separate 2-seat path. */
  const SCRIBBLE_PARTY_MIN=3;
  const SCRIBBLE_PARTY_MAX=6;
  const hintedSeats=(options.partySeats||launchCtx.partySeats||(chat&&chat.partySeats)||[]);
  const distinctListUids=[...new Set(list.map(p=>String(p.uid||p.id||'').trim()).filter(Boolean))];
  const party=!!(
    (liveRoles&&liveRoles.party)||
    options.party||
    options.partyLocal||
    (Array.isArray(hintedSeats)&&hintedSeats.length>=SCRIBBLE_PARTY_MIN)||
    distinctListUids.length+1>=SCRIBBLE_PARTY_MIN
  );
  let liveHandle=null;let applyingLive=false;let liveEnded=false;let leaveConfirmed=false;
  const practiceMode=!party&&!liveOn&&(!!options.practice || list.length===0 || !!(chat&&(chat.self||chat.isSelf||chat.id==='self'||chat.id==='practice')));
  const myUid=String((liveRoles&&liveRoles.me)||(typeof getCurrentUid==='function'?getCurrentUid():'')||'').trim();
  const memberPool=[...list,...((chat&&Array.isArray(chat.members))?chat.members:[])];
  const nameForUid=(uid,fallback)=>{
    if(uid&&uid===myUid)return party?'You':'You';
    const found=memberPool.find(p=>String((p&&(p.uid||p.id))||'')===String(uid||''));
    return(found&&found.name)||fallback||'Player';
  };
  let seatPlayers=[];
  if(liveOn&&party&&liveRoles&&Array.isArray(liveRoles.seats)){
    seatPlayers=liveRoles.seats.slice(0,SCRIBBLE_PARTY_MAX).map((uid,i)=>({
      key:String(uid),uid:String(uid),name:nameForUid(uid,'Player '+(i+1)),isMe:String(uid)===myUid,out:false,isAi:false,
    }));
  }else if(liveOn&&liveRoles){
    const oppName=(chat&&chat.name)||'Friend';
    seatPlayers=[
      {key:String(liveRoles.playerA),uid:String(liveRoles.playerA),name:liveRoles.playerA===myUid?'You':oppName,isMe:liveRoles.playerA===myUid,out:false,isAi:false},
      {key:String(liveRoles.playerB),uid:String(liveRoles.playerB),name:liveRoles.playerB===myUid?'You':oppName,isMe:liveRoles.playerB===myUid,out:false,isAi:false},
    ];
  }else if(party){
    const localSeen=new Set();
    const addLocal=(p,i)=>{
      const uid=String((p&&(p.uid||p.id))||'').trim();
      const name=String((p&&p.name)||('Player '+(i+1)));
      const isMe=!!(p&&p.isMe)||name==='You'||(uid&&uid===myUid);
      const key=uid||name;
      if(localSeen.has(key)||(!isMe&&name==='You'))return;
      localSeen.add(key);
      seatPlayers.push({key,uid,name:isMe?'You':name,isMe,out:false,isAi:!!(p&&p.isAi)});
    };
    addLocal({name:'You',uid:myUid,isMe:true},0);
    list.forEach(addLocal);
    while(seatPlayers.length<SCRIBBLE_PARTY_MIN){
      const n=seatPlayers.length+1;
      addLocal({name:n===2?'Practice AI':('Practice AI '+n),uid:'',isAi:true},n-1);
    }
    seatPlayers=seatPlayers.slice(0,SCRIBBLE_PARTY_MAX);
  }else{
    seatPlayers=[{key:'You',uid:myUid,name:'You',isMe:true,out:false,isAi:false},...list.map((p,i)=>({
      key:p.name||('Player '+(i+2)),uid:String(p.uid||''),name:p.name||(typeof practiceOppLabel==='function'?practiceOppLabel(chat):(chat&&chat.name))||'Practice AI',isMe:false,out:false,isAi:!!p.isAi,
    }))];
    if(!practiceMode&&seatPlayers.length<2)seatPlayers.push({key:'Practice AI',uid:'',name:(typeof practiceOppLabel==='function'?practiceOppLabel(chat):'Practice AI'),isMe:false,out:false,isAi:true});
  }
  const scoreNames={};seatPlayers.forEach(p=>{scoreNames[p.key]=p.name;});
  /** Live stakes: settle ONCE on over/forfeit (virtual chips — not real money). Practice never charges. */
  const liveStake=liveOn
    ?Number((chat&&chat.stake)!=null?chat.stake:(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.stake)||0)||0
    :0;
  const settleMatchId=liveOn
    ?String((chat&&chat.dangalMatchId)||(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.matchId)||'').trim()
    :'';
  let settleOppUid=(liveRoles&&liveRoles.opp)||'';
  let settleDone=false;
  let resultReported=false;
  const MODE_SUB=party
    ?((liveOn
        ?(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel
          ?DangalLive.modeChromeLabel(true,null,{party:true})
          :'Live party')
        :'Party practice')+
      ' · seats '+seatPlayers.length+
      (liveOn&&liveStake>0?' · Stake ⚡'+liveStake+' (virtual)':(liveOn?' · Friendly':'')))
    :liveOn
    ?((typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel?DangalLive.modeChromeLabel(true):'Live 1v1')+
      (liveStake>0?' · Stake ⚡'+liveStake+' (virtual)':' · Friendly'))
    :(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel
      ?DangalLive.modeChromeLabel(false,practiceMode?'Solo draw':'vs AI')
      :(practiceMode?'Practice · Solo draw':'Practice vs AI'));
  const players=seatPlayers;

  let round=1;
  /** Match end: 3 rounds Live/party. Practice Solo: 1 draw. Practice vs AI: 1 user-draw (AI guesses only). */
  const maxRounds=practiceMode||(!liveOn&&!party)?1:3;
  let currentDrawerIdx=0;let currentWord='';
  let liveWordKey='';let liveWordLen=0;let blankMask='';let revealWord='';
  let phase='pick'; // pick | draw | reveal
  let pickChoices=[];let pickSecondsLeft=10;let pickInterval=null;
  let scores={};seatPlayers.forEach(p=>scores[p.key]=0);
  let roundTimer=practiceMode?120:60;let roundInterval=null;let guessedCorrectly=new Set();
  let drawerBonusGiven=false;let hintLetterIdx=-1;let roundClosing=false;
  let strokes=[];let isDrawing=false;let currentColor='#1a1a2e';
  const BRUSH_SIZES=[3,7,14];let currentSize=BRUSH_SIZES[1];
  let canvasW=320;let canvasH=240;
  let aiGuessIv=null;
  /** Points: 1st 100 · 2nd 75 · 3rd+ 50; drawer +50 if ≥1 correct. Pick timer 10s. */
  const PTS_FIRST=100,PTS_SECOND=75,PTS_REST=50,PTS_DRAWER=50;
  const PICK_SECS=10;
  const DRAW_SECS=practiceMode?120:60;
  /** Ink stream: ~14 Hz while drawing; payload keeps newest ≤INK_MAX pts (drop oldest full strokes). */
  const INK_MAX=700;
  const INK_STREAM_MS=70;
  const INK_SAMPLE_MIN=1.6;
  const INK_INTERP=4;
  let inkStreamTimer=null;
  let inkDirty=false;
  let lastAppliedStrokeLen=0;
  let pointerIdActive=null;
  let lastHandledGuessSig='';

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:var(--cream);z-index:80;display:flex;flex-direction:column;';
  const begin=typeof beginGameOverlaySession==='function'?beginGameOverlaySession:null;
  const gs=begin?begin({
    type:'scribble',title:practiceMode?'Scribble Practice':(liveOn?'Scribble':'Scribble · Practice'),mode:liveOn?'live':(practiceMode?'solo':(players.length>2?'group':'practice')),chat,overlay,
    cleanup(){
      clearInterval(roundInterval);roundInterval=null;
      clearInterval(pickInterval);pickInterval=null;
      stopInkStream();
      if(aiGuessIv){clearInterval(aiGuessIv);aiGuessIv=null;}
      if(liveHandle&&!leaveConfirmed){
        try{liveHandle.leave({forfeit:!liveEnded});}catch(e){try{liveHandle.leave();}catch(e2){}}
      }
    },
  }):null;
  if(begin&&(!gs||!gs.alive()))return;
  if(!begin){
    const device=document.querySelector('.device');
    if(!device){if(typeof showToast==='function')showToast('Game container not found');return;}
    device.appendChild(overlay);
  }
  if(typeof prepareGameOverlay==='function') prepareGameOverlay(overlay,{theme:'light',gameId:'scribble'});
  const alive=()=>gs?gs.alive():true;
  const schedule=(fn,ms)=>gs?gs.schedule(fn,ms):setTimeout(fn,ms);
  const close=(result)=>{
    clearInterval(roundInterval);roundInterval=null;
    clearInterval(pickInterval);pickInterval=null;
    stopInkStream();
    if(aiGuessIv){clearInterval(aiGuessIv);aiGuessIv=null;}
    if(gs)gs.close(result);else overlay.remove();
  };

  async function askScribbleLeave(){
    if(liveEnded){close();return;}
    if(typeof DangalLive!=='undefined'&&DangalLive.requestLeave){
      const ok=await DangalLive.requestLeave({
        liveHandle,isPlaying:!liveEnded,party,title:'Leave Scribble?',
        body:liveOn?(party?'You’ll leave this party — it continues while 2+ players remain.':'You’ll forfeit this Live match.'):'This run will end.',
        onLeave:()=>{leaveConfirmed=true;liveHandle=null;},
      });
      if(!ok)return;
    }else if(typeof confirmLeaveGame==='function'){
      const ok=await confirmLeaveGame({title:'Leave Scribble?',body:'This run will end.'});
      if(!ok)return;
    }
    close();
  }

  function normalizeGuess(t){
    return String(t||'').toLowerCase().replace(/\s+/g,' ').trim();
  }

  function scribbleWordKey(w){
    const s=normalizeGuess(w);
    let h=2166136261;
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36)+':'+s.length;
  }

  function setRoundWord(w){
    currentWord=String(w||'');
    liveWordKey=scribbleWordKey(currentWord);
    liveWordLen=currentWord.length;
    blankMask=maskFromWord(currentWord,hintLetterIdx);
    revealWord='';
  }

  function maskFromWord(word,hintIdx){
    const w=String(word||'');
    if(!w)return '';
    return w.split('').map((ch,i)=>{
      if(ch===' ')return ' ';
      if(hintIdx===i)return ch;
      return /[a-z]/i.test(ch)?'_':ch;
    }).join('');
  }

  function samplePick3(){
    const bank=SCRIBBLE_WORDS.slice();
    const picked=[];
    const used=new Set();
    const catKeys=Object.keys(SCRIBBLE_CATS);
    for(let i=catKeys.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=catKeys[i];catKeys[i]=catKeys[j];catKeys[j]=t;}
    catKeys.forEach(cat=>{
      if(picked.length>=3)return;
      const pool=(SCRIBBLE_CATS[cat]||[]).filter(w=>bank.includes(w)&&!used.has(w));
      if(!pool.length)return;
      const w=pool[Math.floor(Math.random()*pool.length)];
      used.add(w);picked.push(w);
    });
    while(picked.length<3){
      const w=bank[Math.floor(Math.random()*bank.length)];
      if(used.has(w))continue;
      used.add(w);picked.push(w);
    }
    return picked.slice(0,3);
  }

  function activeSeats(){return seatPlayers.filter(p=>!p.out);}
  function drawerSeat(){return seatPlayers[currentDrawerIdx]||null;}
  function drawerUid(){const p=drawerSeat();return p?(p.uid||p.key):'';}
  function mySeat(){return seatPlayers.find(p=>p.isMe)||null;}
  function mySeatKey(){const p=mySeat();return p?p.key:'You';}
  function guesserCount(){return activeSeats().filter(p=>p!==drawerSeat()).length;}
  function seatName(key){
    const p=seatPlayers.find(x=>x.key===key||x.uid===key);
    return(p&&p.name)||scoreNames[key]||'Player';
  }

  function allGuessersScored(){
    const need=guesserCount();
    if(need<=0)return false;
    return activeSeats().filter(p=>p!==drawerSeat()&&guessedCorrectly.has(p.key)).length>=need;
  }

  function drawerScoreName(){const p=drawerSeat();return p?p.key:'';}

  function pointsForGuessOrder(order){
    if(order<=0)return PTS_FIRST;
    if(order===1)return PTS_SECOND;
    return PTS_REST;
  }

  function levenshtein(a,b){
    const s=String(a||'');const t=String(b||'');
    if(s===t)return 0;
    if(!s.length)return t.length;
    if(!t.length)return s.length;
    if(Math.abs(s.length-t.length)>2)return 99;
    const row=new Array(t.length+1);
    for(let j=0;j<=t.length;j++)row[j]=j;
    for(let i=1;i<=s.length;i++){
      let prev=row[0];row[0]=i;
      for(let j=1;j<=t.length;j++){
        const tmp=row[j];
        const cost=s[i-1]===t[j-1]?0:1;
        row[j]=Math.min(row[j]+1,row[j-1]+1,prev+cost);
        prev=tmp;
      }
    }
    return row[t.length];
  }

  function isNearMiss(guess,word){
    const g=normalizeGuess(guess);const w=normalizeGuess(word);
    if(!g||!w||g===w)return false;
    if(w.length>=4&&levenshtein(g,w)===1)return true;
    if(w.length>=6&&levenshtein(g,w)===2)return true;
    if(g.length>=4&&(w.includes(g)||g.includes(w))&&Math.abs(g.length-w.length)<=2)return true;
    return false;
  }

  function iAmDrawer(){
    if(practiceMode)return true;
    const p=drawerSeat();
    return!!(p&&p.isMe&&!p.out);
  }

  function drawerDisplayName(){
    const p=drawerSeat();
    return(p&&p.name)||'Friend';
  }

  function quantizeInkPt(p){
    return{
      x:Math.round(p.x*10)/10,
      y:Math.round(p.y*10)/10,
      color:p.color,
      size:p.size,
      newStroke:!!p.newStroke,
    };
  }

  /** Compact policy: keep newest ≤INK_MAX points; cut on a stroke boundary when possible. */
  function compactInk(list){
    const src=list||[];
    if(src.length<=INK_MAX)return src.map(quantizeInkPt);
    let cut=src.length-INK_MAX;
    while(cut<src.length&&!src[cut].newStroke)cut++;
    if(cut>=src.length)cut=Math.max(0,src.length-INK_MAX);
    return src.slice(cut).map(quantizeInkPt);
  }

  function stopInkStream(){
    if(inkStreamTimer){clearInterval(inkStreamTimer);inkStreamTimer=null;}
    inkDirty=false;
  }

  function stopPickTimer(){
    if(pickInterval){clearInterval(pickInterval);pickInterval=null;}
  }

  function hostAuthority(){
    if(!liveOn)return true;
    if(party){
      const first=activeSeats()[0];
      return!!(first&&first.isMe);
    }
    return!!(liveRoles&&(liveRoles.host||liveRoles.myColor==='w'));
  }

  function seatsSnapshot(){
    return seatPlayers.map(p=>({key:p.key,uid:p.uid||'',name:p.name,out:!!p.out,isAi:!!p.isAi}));
  }

  function pushScribble(extra){
    if(!liveOn||!liveHandle||!liveRoles||applyingLive)return;
    const compact=compactInk(strokes);
    const scoreA=scores[String(liveRoles.playerA)]||0;
    const scoreB=scores[String(liveRoles.playerB)]||0;
    const scoresByUid={};
    seatPlayers.forEach(p=>{if(p.uid)scoresByUid[p.uid]=scores[p.key]||0;});
    const state=Object.assign({
      strokes:compact,
      inkLen:strokes.length,
      // Privacy: never put plaintext word mid-round — only wordKey / wordLen / blankMask.
      wordKey:liveWordKey||'',
      wordLen:liveWordLen||0,
      blankMask:blankMask||'',
      phase,
      pickLeft:phase==='pick'?pickSecondsLeft:0,
      scoreA,scoreB,
      scoresByKey:Object.assign({},scores),
      scoresByUid,
      seats:seatsSnapshot(),
      drawerUid:drawerUid(),
      drawer:currentDrawerIdx,
      round,roundTimer,
      guessed:[...guessedCorrectly],
      outUids:seatPlayers.filter(p=>p.out&&p.uid).map(p=>p.uid),
      hintIdx:hintLetterIdx,
      ended:liveEnded,
    },extra||{});
    // Reveal only when round ends (timeout / skip / all guessed).
    if(phase==='reveal'&&revealWord)state.revealWord=revealWord;
    else delete state.revealWord;
    delete state.word;
    liveHandle.push({
      state,
      turn:liveEnded?null:drawerUid(),
      status:liveEnded?'over':'playing',
    });
  }

  function flushInkStream(){
    if(!liveOn||!iAmDrawer()||phase!=='draw')return;
    inkDirty=false;
    pushScribble({inkFlush:true});
  }

  function scheduleInkStream(){
    if(!liveOn||!iAmDrawer()||phase!=='draw')return;
    inkDirty=true;
    if(inkStreamTimer)return;
    inkStreamTimer=setInterval(()=>{
      if(!alive()||!isDrawing||phase!=='draw'){
        if(inkDirty)flushInkStream();
        stopInkStream();
        return;
      }
      if(inkDirty){inkDirty=false;pushScribble({inkStream:true});}
    },INK_STREAM_MS);
  }

  function setupCanvasSurface(canvas){
    if(!canvas)return null;
    if(typeof setupGameCanvas==='function'){
      const res=setupGameCanvas(canvas);
      if(res){
        canvasW=res.w||res.width||canvasW;
        canvasH=res.h||res.height||canvasH;
        return canvas.getContext('2d');
      }
    }
    const dpr=Math.min(window.devicePixelRatio||1,2.5);
    const rect=canvas.getBoundingClientRect();
    canvasW=Math.max(1,Math.floor(rect.width));
    canvasH=Math.max(1,Math.floor(rect.height));
    canvas.width=Math.floor(canvasW*dpr);
    canvas.height=Math.floor(canvasH*dpr);
    const ctx=canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return ctx;
  }

  function maybeAwardDrawerBonus(){
    if(drawerBonusGiven||guessedCorrectly.size<1)return;
    drawerBonusGiven=true;
    const dn=drawerScoreName();
    scores[dn]=(scores[dn]||0)+PTS_DRAWER;
  }

  function beginDrawPhase(){
    if(!alive())return;
    stopPickTimer();
    phase='draw';
    roundClosing=false;
    strokes=[];lastAppliedStrokeLen=0;hintLetterIdx=-1;
    blankMask=maskFromWord(currentWord,-1);
    roundTimer=DRAW_SECS;
    clearInterval(roundInterval);
    render();
    roundInterval=setInterval(()=>{
      if(!alive()||phase!=='draw'){clearInterval(roundInterval);return;}
      roundTimer--;
      const el=document.getElementById('scribbleTimer');if(el)el.textContent=roundTimer+'s';
      if(roundTimer===20&&hintLetterIdx<0&&currentWord){
        const letters=[];
        for(let i=0;i<currentWord.length;i++){
          if(/[a-z]/i.test(currentWord[i]))letters.push(i);
        }
        if(letters.length){
          hintLetterIdx=letters[Math.floor(Math.random()*letters.length)];
          blankMask=maskFromWord(currentWord,hintLetterIdx);
          const blanksEl=overlay.querySelector('.scribble-blanks');
          if(blanksEl)blanksEl.textContent=guessBlanks();
          if(liveOn&&iAmDrawer())pushScribble({hintIdx:hintLetterIdx,blankMask});
        }
      }
      if(roundTimer<=0){
        clearInterval(roundInterval);
        finishRound({reason:'timeout'});
      }
    },1000);
    if(liveOn&&iAmDrawer())pushScribble({phase:'draw'});
    // Practice vs AI: AI may guess your drawing — never fake AI doodles.
    if(iAmDrawer()&&!practiceMode&&!liveOn){
      const guessRate=0.72; // Medium-equivalent guesser (no difficulty UI on Scribble vs AI)
      players.forEach((p,i)=>{
        if(i===currentDrawerIdx||p.isMe)return;
        schedule(()=>{
          if(!alive()||phase!=='draw'||p.out||guessedCorrectly.has(p.key)||Math.random()>=guessRate)return;
          applyCorrectGuess(p.key,currentWord,true);
        },4200+Math.random()*22000);
      });
    }
  }

  function chooseWord(word){
    if(phase!=='pick'||!iAmDrawer())return;
    setRoundWord(word);
    pickChoices=[];
    beginDrawPhase();
  }

  function startPickPhase(){
    if(!alive())return;
    stopInkStream();
    stopPickTimer();
    clearInterval(roundInterval);roundInterval=null;
    phase='pick';
    roundClosing=false;
    guessedCorrectly.clear();
    drawerBonusGiven=false;
    hintLetterIdx=-1;
    strokes=[];lastAppliedStrokeLen=0;
    currentWord='';liveWordKey='';liveWordLen=0;blankMask='';revealWord='';
    if(aiGuessIv){clearInterval(aiGuessIv);aiGuessIv=null;}

    // Non-drawer Live: wait for peer pick (phase draw + wordKey).
    if(liveOn&&!iAmDrawer()){
      pickChoices=[];
      render();
      if(!liveWordKey)pushScribble({phase:'pick',waitingPick:true});
      return;
    }

    // Practice AI draw seat should never happen on vs-AI (human sole drawer) — safety skip.
    if(!liveOn&&!practiceMode&&!iAmDrawer()){
      endScribbleGame({reason:'complete'});
      return;
    }

    pickChoices=samplePick3();
    pickSecondsLeft=PICK_SECS;
    render();
    if(liveOn)pushScribble({phase:'pick'});
    pickInterval=setInterval(()=>{
      if(!alive()||phase!=='pick'){stopPickTimer();return;}
      pickSecondsLeft--;
      const el=document.getElementById('scribblePickTimer');
      if(el)el.textContent=pickSecondsLeft+'s';
      if(pickSecondsLeft<=0){
        stopPickTimer();
        const auto=pickChoices[Math.floor(Math.random()*pickChoices.length)]||samplePick3()[0];
        chooseWord(auto);
      }
    },1000);
  }

  function startRound(){
    startPickPhase();
  }

  function afterRevealAdvance(){
    schedule(()=>{
      if(!alive()||liveEnded)return;
      roundClosing=false;
      if(practiceMode){endScribbleGame();return;}
      // One active host owns rotation to avoid duplicate nextTurn writes.
      if(liveOn&&!hostAuthority())return;
      nextTurn();
    },1600);
  }

  function finishRound(optsFinish){
    if(roundClosing||liveEnded)return;
    roundClosing=true;
    stopInkStream();
    stopPickTimer();
    clearInterval(roundInterval);roundInterval=null;
    if(aiGuessIv){clearInterval(aiGuessIv);aiGuessIv=null;}
    const reason=(optsFinish&&optsFinish.reason)||'timeout';
    if(reason!=='skip')maybeAwardDrawerBonus();
    phase='reveal';
    revealWord=currentWord||revealWord||'';
    blankMask=revealWord||blankMask;
    if(liveOn){
      // Only drawer (has plaintext) may publish revealWord.
      if(iAmDrawer()&&revealWord)pushScribble({phase:'reveal',revealWord,reason});
      else if(!iAmDrawer())pushScribble({phase:'reveal',reason,needReveal:true});
    }
    renderScoresOnly();
    const msg=revealWord?('Word was “'+revealWord+'”'):'Round over';
    if(typeof showToast==='function')showToast(msg);
    addScribbleMessage(msg,true);
    render();
    afterRevealAdvance();
  }

  function applyCorrectGuess(seatKey,text,fromAi){
    const playerName=seatName(seatKey);
    if(phase!=='draw'||guessedCorrectly.has(seatKey)||seatKey===drawerScoreName())return null;
    const order=guessedCorrectly.size;
    const pts=pointsForGuessOrder(order);
    guessedCorrectly.add(seatKey);
    scores[seatKey]=(scores[seatKey]||0)+pts;
    maybeAwardDrawerBonus();
    if(fromAi)addScribbleMessage(playerName+' guessed correctly! +'+pts,true);
    else addScribbleMessage(playerName+' got it! +'+pts,true);
    if(typeof gameFeedback==='function')gameFeedback(seatKey===mySeatKey()?'complete':'valid');
    renderScoresOnly();
    if(liveOn){
      pushScribble({
        // Correct plaintext is never broadcast; only the drawer owns currentWord.
        lastGuess:{by:seatKey,ok:true,text:'***',pts},
      });
    }
    if(allGuessersScored()){
      if(iAmDrawer())schedule(()=>finishRound({reason:'allGuessed'}),400);
      else if(liveOn)pushScribble({allGuessed:true});
      else schedule(()=>finishRound({reason:'allGuessed'}),400);
    }
    return{result:'correct',pts};
  }

  /** Central guess scorer — correct | close | wrong. */
  function tryGuess(seatKey,text){
    const g=normalizeGuess(text);
    if(!g||phase!=='draw')return{result:'wrong'};
    if(guessedCorrectly.has(seatKey))return{result:'already'};
    const exact=currentWord
      ?g===normalizeGuess(currentWord)
      :(liveWordKey&&scribbleWordKey(g)===liveWordKey);
    if(exact)return applyCorrectGuess(seatKey,g,false)||{result:'correct'};
    if(currentWord&&isNearMiss(g,currentWord))return{result:'close'};
    return{result:'wrong'};
  }

  function renderScoresOnly(){
    const list=document.getElementById('scribbleScoreStrip');
    if(list)list.innerHTML=Object.entries(scores).map(([key,s])=>`<span>${seatName(key)} ${s}</span>`).join('');
  }

  function nextTurn(){
    if(!alive()||liveEnded)return;
    clearInterval(roundInterval);roundInterval=null;
    stopPickTimer();
    stopInkStream();
    if(aiGuessIv){clearInterval(aiGuessIv);aiGuessIv=null;}
    // Practice vs AI: human is sole drawer; AI only guesses — never blank AI-draw rounds.
    if(!liveOn&&!party&&!practiceMode){
      endScribbleGame({reason:'complete'});
      return;
    }
    revealWord='';
    currentWord='';liveWordKey='';liveWordLen=0;blankMask='';
    phase='pick';
    strokes=[];lastAppliedStrokeLen=0;
    const from=currentDrawerIdx;
    let next=from;
    for(let i=1;i<=seatPlayers.length;i++){
      const idx=(from+i)%seatPlayers.length;
      if(!seatPlayers[idx].out){next=idx;break;}
    }
    currentDrawerIdx=next;
    if(currentDrawerIdx<=from)round++;
    if(round>maxRounds){endScribbleGame({reason:'complete'});return;}
    startRound();
  }

  async function settleScribbleOnce(won,isDraw,settleMeta){
    // Idempotent once per matchId — 1v1 and party Live both settle virtual stakes.
    if(!liveOn||settleDone)return null;
    if(!settleMatchId||liveStake<=0){
      settleDone=true;
      return null;
    }
    if(!window.DangalEconomy||typeof DangalEconomy.reportGameEnd!=='function'){
      settleDone=true;
      return null;
    }
    settleDone=true;
    try{
      const me=typeof getCurrentUid==='function'?getCurrentUid():'';
      const meta=settleMeta||{};
      const oppU=meta.opponentUid||settleOppUid||(liveRoles&&liveRoles.opp)||'';
      const winnerUid=isDraw?null:(meta.winnerUid||(won?me:oppU)||null);
      return await DangalEconomy.reportGameEnd({
        gameType:'scribble',
        result:isDraw?'draw':won?'win':'loss',
        won:!!won&&!isDraw,
        isDraw:!!isDraw,
        matchId:settleMatchId,
        sessionId:settleMatchId,
        opponentUid:oppU,
        stake:liveStake,
        winnerUid:winnerUid||'',
      });
    }catch(e){
      settleDone=false;
      return null;
    }
  }

  function freshRematch(){
    if(!liveOn){
      close();
      openScribbleGame(chat,playerList,opts);
      return;
    }
    try{
      const mid=typeof dangalMatchId==='function'
        ?dangalMatchId('scribble',chat)
        :'scribble_'+(party?'party_':'')+Date.now();
      const seats=(liveRoles&&Array.isArray(liveRoles.seats)&&liveRoles.seats.length)
        ?liveRoles.seats.slice()
        :(chat&&Array.isArray(chat.partySeats)?chat.partySeats.slice():[]);
      if(window.__dangalLaunchCtx){
        window.__dangalLaunchCtx=Object.assign({},window.__dangalLaunchCtx,{
          matchId:mid,
          gameId:'scribble',
          gameType:'scribble',
          stake:liveStake,
          mode:'live',
          partySeats:party&&seats.length>=3?seats:undefined,
          scribbleParty:!!party,
          source:party?'party':(window.__dangalLaunchCtx.source||'chat'),
        });
      }
      if(chat){
        chat.dangalMatchId=mid;
        chat.stake=liveStake;
        if(party&&seats.length>=3)chat.partySeats=seats;
      }
    }catch(e){}
    close();
    openScribbleGame(chat,playerList,Object.assign({},opts||{},party?{party:true,partySeats:(chat&&chat.partySeats)||undefined}:{}));
  }

  function endScribbleGame(endOpts){
    const o=endOpts||{};
    if(resultReported&&!o.force)return;
    resultReported=true;
    clearInterval(roundInterval);roundInterval=null;
    stopPickTimer();
    stopInkStream();
    if(aiGuessIv){clearInterval(aiGuessIv);aiGuessIv=null;}
    liveEnded=true;
    phase='reveal';
    const sorted=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
    const mine=mySeatKey();
    const youPts=scores[mine]||0;
    const oppKey=Object.keys(scores).find(k=>k!==mine)||(chat&&chat.name)||'Friend';
    const oppPts=scores[oppKey]||0;
    const forfeit=!!o.forfeit;
    const topScore=sorted.length?sorted[0][1]:0;
    const topKeys=sorted.filter(entry=>entry[1]===topScore).map(entry=>entry[0]);
    let won=practiceMode?true:(o.won!=null?!!o.won:(party?topKeys.includes(mine):youPts>oppPts));
    let isDraw=!practiceMode&&!forfeit&&(party?topKeys.length>1:youPts===oppPts);
    if(forfeit&&o.won!=null){won=!!o.won;isDraw=false;}
    const topSeat=seatPlayers.find(p=>p.key===((sorted[0]&&sorted[0][0])||''));
    const partyWinnerUid=(!isDraw&&topSeat&&topSeat.uid)?String(topSeat.uid):'';
    const settleOpp=
      party
        ?(seatPlayers.find(p=>p.uid&&p.uid!==myUid&&!p.out)||seatPlayers.find(p=>p.uid&&p.uid!==myUid)||{}).uid||settleOppUid||''
        :(settleOppUid||(liveRoles&&liveRoles.opp)||'');

    if(liveOn&&!applyingLive&&!o.skipPush){
      try{
        if(liveHandle&&liveRoles){
          liveHandle.push({
            status:forfeit?(party?'over':'forfeit'):'over',
            winner:isDraw?null:(party?(partyWinnerUid||null):(won?liveRoles.me:liveRoles.opp)),
            state:{
              scoreA:liveRoles.myColor==='w'?youPts:oppPts,
              scoreB:liveRoles.myColor==='w'?oppPts:youPts,
              scoresByKey:Object.assign({},scores),
              scoresByUid:Object.assign({},scores),
              seats:seatsSnapshot(),
              drawerUid:drawerUid(),
              outUids:seatPlayers.filter(p=>p.out&&p.uid).map(p=>p.uid),
              ended:true,
              matchOver:true,
              guessed:[...guessedCorrectly],
              phase:'reveal',
              revealWord:revealWord||currentWord||'',
              drawer:currentDrawerIdx,
              round,
              strokes:[],
            },
          });
        }
      }catch(e){}
    }

    if(gs)gs.setOutcome(practiceMode?'complete':(isDraw?'draw':(won?'won':'lost')));
    if(typeof recordGameResult==='function'){
      try{
        recordGameResult('scribble',!!won&&!isDraw,!!isDraw,{
          live:!!liveOn,
          stake:liveStake,
          mode:liveOn?(party?'live_party':'live'):'practice',
          score:youPts,
        });
      }catch(e){}
    }
    if(typeof gameFeedback==='function')gameFeedback(practiceMode?'complete':(isDraw?'complete':(won?'win':'lose')));

    const wordReveal=revealWord||currentWord||'';
    const baseSub=practiceMode
      ?('Word was “'+(wordReveal||'—')+'” · pick from 3, guess fast')
      :(forfeit&&!party
        ?(won?'Opponent left — you win':'You forfeited')
        :sorted.map(([key,score],i)=> (i+1)+'. '+seatName(key)+' · '+score+' pts').join(' · ')+' · 3 rounds');

    const paint=(settle)=>{
      let sub=baseSub;
      if(liveOn&&liveStake>0){
        const cd=settle&&settle.chipDelta!=null?Number(settle.chipDelta):null;
        sub+=(sub?' · ':'')+(Number.isFinite(cd)&&cd!==0
          ?('Stake '+(cd>0?'+':'')+cd+' virtual')
          :'Virtual stakes · not real money');
      } else if(liveOn){
        sub+=(sub?' · ':'')+(party?'Live party · Friendly':'Live 1v1 · Friendly');
      }
      overlay.innerHTML=`
        ${typeof gameChromeHtml==='function'?gameChromeHtml({title:'Scribble',subtitle:MODE_SUB+(practiceMode?' · done':' · Results'),backId:'scribbleClose'}):''}
        ${typeof gameResultHtml==='function'?gameResultHtml({
          gameId:'scribble',
          glyph:practiceMode?'✓':(forfeit&&!party?(won?'✓':'·'):(isDraw?'=':(won?'✓':'·'))),
          title:practiceMode?'Nice practice':(forfeit&&!party?(won?'Opponent left':'You left'):(isDraw?'Draw':seatName((sorted[0]&&sorted[0][0])||'')+' wins')),
          subtitle:sub,
          shareCardHtml: typeof buildGameShareCard==='function'?buildGameShareCard('scribble',{scoreLine:practiceMode?'Practice':(party?sorted.map(([k,s])=>seatName(k)+' '+s).join(' · '):(youPts+'-'+oppPts)),meta:liveOn?(party?'Live party':'Live 1v1'):(wordReveal||'')}):'',
          actions:[
            {label:'Play again',primary:true,id:'again'},
            {label:'Share',primary:false,id:'share'},
            {label:'Post to story',primary:false,id:'story'},
            {label:'Done',primary:false,id:'done'},
          ],
        }):`<div style="padding:24px;text-align:center;"><div>${practiceMode?'Practice done':seatName((sorted[0]&&sorted[0][0])||'')+' wins!'}</div><button id="scribbleClose">Done</button></div>`}
      `;
      const done=()=>close(practiceMode?'complete':(isDraw?'draw':(won?'won':'lost')));
      document.getElementById('scribbleClose')?.addEventListener('click',done);
      if(typeof wireGameResultActions==='function'){
        const shareStats={scoreLine:practiceMode?'Practice':(party?sorted.map(([k,s])=>seatName(k)+' '+s).join(' · '):(youPts+'-'+oppPts)),meta:liveOn?(party?'Live party Scribble':'Live 1v1 Scribble'):(wordReveal||'')};
        wireGameResultActions(overlay,{
          again:()=>{freshRematch();},
          share:()=>{if(typeof shareGameResult==='function')shareGameResult('scribble',shareStats);},
          story:()=>{if(typeof postGameScoreStory==='function')postGameScoreStory('scribble',shareStats);},
          done,
        });
      } else {
        overlay.querySelector('[data-result-action]')?.addEventListener('click',done);
      }
    };

    if(liveOn){
      settleScribbleOnce(won,isDraw,{
        winnerUid:partyWinnerUid||(won?myUid:settleOpp),
        opponentUid:settleOpp,
      }).then(paint).catch(()=>paint(null));
    } else {
      paint(null);
    }
  }

  function addScribbleMessage(text,isCorrect){
    const list=document.getElementById('scribbleChatList');
    if(!list)return;
    const div=document.createElement('div');
    div.className='scribble-msg'+(isCorrect?' scribble-msg--ok':'');
    div.textContent=text;list.appendChild(div);list.scrollTop=list.scrollHeight;
  }

  function undoStroke(){
    if(!strokes.length)return;
    let i=strokes.length-1;
    while(i>0&&!strokes[i].newStroke)i--;
    strokes=strokes.slice(0,i);
    lastAppliedStrokeLen=0;
    renderCanvas();
    if(typeof gameFeedback==='function')gameFeedback('select');
  }

  function guessBlanks(){
    if(phase==='reveal'&&(revealWord||currentWord))return revealWord||currentWord;
    if(blankMask)return blankMask;
    if(iAmDrawer()&&currentWord)return maskFromWord(currentWord,hintLetterIdx);
    const n=liveWordLen||(currentWord?currentWord.length:0);
    return n>0?'_'.repeat(n):'_____';
  }

  function render(){
    if(!alive())return;
    const isMyTurn=iAmDrawer();
    const blanks=guessBlanks();
    const drawerName=drawerDisplayName();
    const timerLabel=phase==='pick'?pickSecondsLeft:roundTimer;
    const picking=phase==='pick'&&isMyTurn&&pickChoices.length>0;
    const waitingPick=phase==='pick'&&!isMyTurn;
    const timerWarn=(phase==='pick'?pickSecondsLeft:roundTimer)<=5;
    let turnMode='waiting';
    let turnLabel='Waiting…';
    let turnSub='';
    if(phase==='reveal'){
      turnMode='over';
      turnLabel='Round over';
      turnSub='Word was “'+(revealWord||currentWord||'—')+'”';
    }else if(picking){
      turnMode='yours';
      turnLabel='Your turn — pick a word';
      turnSub=pickSecondsLeft+'s left';
    }else if(waitingPick){
      turnMode='theirs';
      turnLabel=drawerName+' is picking…';
      turnSub='Canvas opens when they choose';
    }else if(isMyTurn&&phase==='draw'){
      turnMode='yours';
      turnLabel='You’re drawing';
      turnSub='Draw “'+(currentWord||'…')+'” · '+roundTimer+'s';
    }else if(phase==='draw'){
      turnMode='theirs';
      turnLabel='Guess — '+drawerName+' is drawing';
      turnSub=blanks||'Watch the ink · type a guess';
    }
    const turnBanner=typeof gameTurnBannerHtml==='function'
      ? gameTurnBannerHtml({mode:turnMode,label:turnLabel,sub:turnSub,pulse:turnMode==='yours'})
      : '';
    // Only cover canvas while waiting for word pick — never blank the draw phase.
    const waitOverlay=waitingPick
      ?`<div class="scribble-waiting scribble-waiting--soft" id="scribbleWaiting">${drawerName} is picking a word…</div>`
      :'';

    overlay.innerHTML=`
      ${gameChromeHtml({title:practiceMode?'Scribble Practice':(liveOn?'Scribble':'Scribble · Practice'),subtitle:MODE_SUB+(practiceMode?'':` · Round ${round}/${maxRounds}`),backId:'scribbleBack',rightHtml:`<span id="scribbleTimer" class="game-chrome-metric${timerWarn?' is-warn':''}">${timerLabel}s</span>`})}
      ${turnBanner}
      <div class="scribble-prompt${isMyTurn&&phase==='draw'?' scribble-prompt--draw':''}">
        ${picking?`
          <div class="scribble-word">Pick a word <span id="scribblePickTimer" class="scribble-pick-left">${pickSecondsLeft}s</span></div>
          <div class="scribble-pick-row">
            ${pickChoices.map((w,i)=>`<button type="button" class="scribble-pick-chip game-tap-target" data-pick-idx="${i}">${String(w).replace(/</g,'&lt;')}</button>`).join('')}
          </div>
        `:phase==='reveal'?`
          <div class="scribble-word">It was <strong>${revealWord||currentWord||'—'}</strong></div>
        `:isMyTurn&&phase==='draw'?`
          <div class="scribble-word">Draw: <strong>${currentWord||'…'}</strong></div>
        `:waitingPick?`
          <div class="scribble-word">${drawerName} is picking a word…</div>
        `:`
          <div class="scribble-word">${drawerName} is drawing</div>
          <div class="scribble-blanks">${blanks||'_____'}</div>
          <div class="scribble-honest-note">${liveOn?'Word stays secret — guess from the drawing':'No fake doodles — guess from the blanks'}</div>
        `}
        <div id="scribbleScoreStrip" class="scribble-scores">${Object.entries(scores).map(([key,s])=>`<span>${seatName(key)} ${s}</span>`).join('')}</div>
      </div>
      <div class="scribble-stage">
        <canvas id="scribbleCanvas" class="scribble-canvas" style="cursor:${isMyTurn&&phase==='draw'?'crosshair':'default'};touch-action:none;"></canvas>
        ${waitOverlay}
      </div>
      ${isMyTurn&&phase==='draw'?`
      <div class="scribble-tools">
        <div class="scribble-colors">
          ${['#1a1a2e','#E74C3C','#3498DB','#2ECC71','#F1C40F','#9B59B6','#ffffff'].map(c=>`<button type="button" data-color="${c}" class="scribble-swatch${currentColor===c?' is-active':''}" style="background:${c};${c==='#ffffff'?'border:1px solid #ccc;':''}" aria-label="Color"></button>`).join('')}
        </div>
        <div class="scribble-brushes">
          ${BRUSH_SIZES.map(sz=>`<button type="button" data-size="${sz}" class="scribble-brush game-tap-target${currentSize===sz?' is-active':''}" aria-label="Brush ${sz}"><span style="width:${Math.max(6,sz)}px;height:${Math.max(6,sz)}px;"></span></button>`).join('')}
        </div>
        <div class="scribble-tool-actions">
          <button type="button" id="scribbleUndo" class="game-tap-target scribble-tool-btn">Undo</button>
          <button type="button" id="scribbleClear" class="game-tap-target scribble-tool-btn">Clear</button>
          ${!practiceMode?`<button type="button" id="scribbleSkip" class="game-tap-target scribble-tool-btn">Skip</button>`:''}
          ${practiceMode?`<button type="button" id="scribbleDonePractice" class="game-tap-target scribble-tool-btn scribble-tool-btn--primary">Done</button>`:''}
        </div>
      </div>`:''}
      ${!practiceMode?`
      <div class="scribble-chat">
        <div id="scribbleChatList" class="scribble-chat-list"></div>
        ${!isMyTurn&&phase==='draw'?`<div class="scribble-guess-row"><input id="scribbleGuessInput" placeholder="Type your guess…" autocomplete="off"><button type="button" id="scribbleGuessBtn" class="game-tap-target">Guess</button></div>`:''}
      </div>`:''}
    `;
    document.getElementById('scribbleBack').addEventListener('click',()=>{askScribbleLeave();});
    if(picking){
      overlay.querySelectorAll('[data-pick-idx]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const idx=Number(btn.getAttribute('data-pick-idx'));
          const w=pickChoices[idx];
          if(w)chooseWord(w);
        });
      });
    }
    wireCanvas();
    if(!isMyTurn&&phase==='draw'&&!practiceMode){
      document.getElementById('scribbleGuessBtn')?.addEventListener('click',submitGuess);
      document.getElementById('scribbleGuessInput')?.addEventListener('keypress',e=>{if(e.key==='Enter')submitGuess();});
    } else if(isMyTurn&&phase==='draw'){
      overlay.querySelectorAll('[data-color]').forEach(btn=>btn.addEventListener('click',()=>{currentColor=btn.dataset.color;overlay.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('is-active',b.dataset.color===currentColor));}));
      overlay.querySelectorAll('[data-size]').forEach(btn=>btn.addEventListener('click',()=>{currentSize=+btn.dataset.size;overlay.querySelectorAll('[data-size]').forEach(b=>b.classList.toggle('is-active',+b.dataset.size===currentSize));}));
      document.getElementById('scribbleClear')?.addEventListener('click',()=>{
        strokes=[];lastAppliedStrokeLen=0;stopInkStream();renderCanvas();
        if(liveOn)pushScribble({inkClear:true});
      });
      document.getElementById('scribbleUndo')?.addEventListener('click',()=>{
        undoStroke();stopInkStream();if(liveOn)pushScribble({inkUndo:true});
      });
      document.getElementById('scribbleSkip')?.addEventListener('click',()=>{
        finishRound({reason:'skip'});
      });
      document.getElementById('scribbleDonePractice')?.addEventListener('click',()=>endScribbleGame());
    }
  }

  function submitGuess(){
    const inp=document.getElementById('scribbleGuessInput');
    if(!inp||phase!=='draw')return;
    const val=normalizeGuess(inp.value);if(!val)return;
    inp.value='';
    addScribbleMessage('You: '+val);
    const seatKey=mySeatKey();
    const res=tryGuess(seatKey,val);
    if(res.result==='correct'){
      if(typeof showToast==='function')showToast('Correct! +'+(res.pts||PTS_FIRST));
      return;
    }
    if(res.result==='close'){
      if(typeof showToast==='function')showToast('Close!');
      if(typeof gameFeedback==='function')gameFeedback('select');
      if(liveOn)pushScribble({lastGuess:{by:seatKey,ok:false,close:true,text:val}});
      return;
    }
    if(res.result==='already')return;
    if(typeof gameFeedback==='function')gameFeedback('invalid');
    if(liveOn){
      // Drawer may flag near-miss without ever sending plaintext word.
      pushScribble({lastGuess:{by:seatKey,ok:false,text:val,checkClose:true}});
    }
  }

  function appendInkPoint(x,y,isNew){
    const pt={x,y,color:currentColor,size:currentSize,newStroke:!!isNew};
    if(isNew||!strokes.length){
      strokes.push(pt);
      return;
    }
    const last=strokes[strokes.length-1];
    const dx=x-last.x;const dy=y-last.y;
    const dist=Math.hypot(dx,dy);
    if(dist<INK_SAMPLE_MIN)return;
    if(dist>INK_INTERP*2){
      const steps=Math.min(24,Math.floor(dist/INK_INTERP));
      for(let i=1;i<=steps;i++){
        const t=i/steps;
        strokes.push({
          x:last.x+dx*t,
          y:last.y+dy*t,
          color:currentColor,
          size:currentSize,
          newStroke:false,
        });
      }
      return;
    }
    strokes.push(pt);
  }

  function wireCanvas(){
    const canvas=document.getElementById('scribbleCanvas');if(!canvas)return;
    setupCanvasSurface(canvas);
    lastAppliedStrokeLen=0;
    renderCanvas();
    if(!iAmDrawer()||phase!=='draw')return;

    const getPos=e=>{
      const rect=canvas.getBoundingClientRect();
      const src=e.touches&&e.touches[0]?e.touches[0]:e;
      const cx=src.clientX-rect.left;
      const cy=src.clientY-rect.top;
      return{x:cx*(canvasW/Math.max(1,rect.width)),y:cy*(canvasH/Math.max(1,rect.height))};
    };

    const start=e=>{
      if(e.pointerType==='mouse'&&e.button!=null&&e.button!==0)return;
      e.preventDefault();
      try{if(e.pointerId!=null)canvas.setPointerCapture(e.pointerId);}catch(err){}
      pointerIdActive=e.pointerId!=null?e.pointerId:true;
      isDrawing=true;
      const p=getPos(e);
      appendInkPoint(p.x,p.y,true);
      renderCanvas(true);
      scheduleInkStream();
    };
    const move=e=>{
      if(!isDrawing)return;
      if(pointerIdActive!=null&&e.pointerId!=null&&e.pointerId!==pointerIdActive)return;
      e.preventDefault();
      const p=getPos(e);
      const before=strokes.length;
      appendInkPoint(p.x,p.y,false);
      if(strokes.length!==before){
        renderCanvas(true);
        scheduleInkStream();
      }
    };
    const end=e=>{
      if(!isDrawing)return;
      if(e&&pointerIdActive!=null&&e.pointerId!=null&&e.pointerId!==pointerIdActive)return;
      isDrawing=false;
      pointerIdActive=null;
      try{if(e&&e.pointerId!=null)canvas.releasePointerCapture(e.pointerId);}catch(err){}
      flushInkStream();
      stopInkStream();
    };

    if(window.PointerEvent){
      canvas.addEventListener('pointerdown',start);
      canvas.addEventListener('pointermove',move);
      canvas.addEventListener('pointerup',end);
      canvas.addEventListener('pointercancel',end);
    } else {
      canvas.addEventListener('mousedown',start);
      canvas.addEventListener('mousemove',move);
      canvas.addEventListener('mouseup',end);
      canvas.addEventListener('mouseleave',end);
      canvas.addEventListener('touchstart',start,{passive:false});
      canvas.addEventListener('touchmove',move,{passive:false});
      canvas.addEventListener('touchend',end);
      canvas.addEventListener('touchcancel',end);
    }
  }

  function drawStrokeSegment(ctx,a,b){
    if(!a||!b)return;
    ctx.strokeStyle=b.color;ctx.lineWidth=b.size;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }

  function renderCanvas(incremental){
    const canvas=document.getElementById('scribbleCanvas');if(!canvas)return;
    let ctx=canvas.getContext('2d');
    if(!canvas.width){ctx=setupCanvasSurface(canvas)||ctx;}
    const dpr=canvas.width/Math.max(1,canvasW);
    ctx.lineCap='round';ctx.lineJoin='round';

    const canAppend=incremental&&lastAppliedStrokeLen>0&&strokes.length>=lastAppliedStrokeLen;
    if(canAppend){
      ctx.setTransform(dpr,0,0,dpr,0,0);
      for(let i=lastAppliedStrokeLen;i<strokes.length;i++){
        const s=strokes[i];
        if(s.newStroke)continue;
        const prev=strokes[i-1];
        if(!prev||prev.newStroke&&!(prev.x===s.x&&prev.y===s.y)){
          // first segment after stroke start uses start point as move
        }
        if(prev)drawStrokeSegment(ctx,prev,s);
      }
      lastAppliedStrokeLen=strokes.length;
      const wait=document.getElementById('scribbleWaiting');
      if(wait&&strokes.length)wait.style.display='none';
      return;
    }

    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.restore();
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvasW,canvasH);
    for(let i=0;i<strokes.length;i++){
      const s=strokes[i];
      if(s.newStroke||i===0)continue;
      drawStrokeSegment(ctx,strokes[i-1],s);
    }
    // Dots for single-point strokes
    for(let i=0;i<strokes.length;i++){
      const s=strokes[i];
      if(!s.newStroke)continue;
      const next=strokes[i+1];
      if(next&&!next.newStroke)continue;
      ctx.fillStyle=s.color;
      ctx.beginPath();
      ctx.arc(s.x,s.y,Math.max(0.5,s.size/2),0,Math.PI*2);
      ctx.fill();
    }
    lastAppliedStrokeLen=strokes.length;
    const wait=document.getElementById('scribbleWaiting');
    if(wait)wait.style.display=strokes.length?'none':'';
  }

  function applyRemoteStrokes(next){
    if(!Array.isArray(next))return;
    const prevLen=strokes.length;
    const samePrefix=next.length>=prevLen&&prevLen>0&&strokes.every((p,i)=>{
      const q=next[i];
      return q&&Math.abs(q.x-p.x)<0.2&&Math.abs(q.y-p.y)<0.2&&!!q.newStroke===!!p.newStroke;
    });
    strokes=next.slice();
    if(samePrefix&&next.length>=prevLen){
      lastAppliedStrokeLen=prevLen;
      renderCanvas(true);
    } else {
      lastAppliedStrokeLen=0;
      renderCanvas(false);
    }
  }

  /**
   * Leave policy: party leavers are marked out; play continues with 2+ active seats.
   * If the drawer leaves, the host assigns the next active drawer and starts a fresh pick.
   * Below 2 active seats ends the match. The unchanged 1v1 path remains a full forfeit.
   */
  function applyPartyLeaves(state){
    if(!party||!state)return false;
    const out=new Set(Array.isArray(state.outUids)?state.outUids.map(String):[]);
    if(Array.isArray(state.seats))state.seats.forEach(p=>{if(p&&p.out&&p.uid)out.add(String(p.uid));});
    if(state.partyLeave&&state.leftUid)out.add(String(state.leftUid));
    let changed=false;let drawerLeft=false;
    seatPlayers.forEach((p,i)=>{
      if((p.uid&&out.has(String(p.uid)))&&!p.out){
        p.out=true;changed=true;
        if(i===currentDrawerIdx)drawerLeft=true;
        addScribbleMessage(p.name+' left the match',false);
      }
    });
    if(!changed)return false;
    if(activeSeats().length<2){
      if(hostAuthority()){
        applyingLive=false;
        endScribbleGame({reason:'partyTooSmall'});
      }
      applyingLive=false;
      return true;
    }
    if(drawerLeft&&hostAuthority()){
      const from=currentDrawerIdx;
      for(let i=1;i<=seatPlayers.length;i++){
        const idx=(from+i)%seatPlayers.length;
        if(!seatPlayers[idx].out){currentDrawerIdx=idx;break;}
      }
      applyingLive=false;
      startPickPhase();
      pushScribble({partyLeave:false,leftUid:null,drawerReassigned:true});
      return true;
    }
    if(drawerLeft){
      applyingLive=false;
      render();
      return true;
    }
    return false;
  }

  if(liveOn&&liveRoles&&typeof DangalLive!=='undefined'){
    liveHandle=DangalLive.join({
      gameType:'scribble',
      matchId:(chat&&chat.dangalMatchId)||(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.matchId),
      me:liveRoles.me,playerA:liveRoles.playerA,playerB:liveRoles.playerB,
      seats:seatPlayers.map(p=>p.uid).filter(Boolean),party,watchForfeit:!party,
      onSnap(val){
        if(!val||applyingLive||!alive())return;
        if((val.status==='forfeit'||val.status==='over')&&!liveEnded){
          liveEnded=true;
          applyingLive=false;
          if(val.state){
            const st=val.state;
            if(st.scoresByKey||st.scoresByUid){
              const incoming=st.scoresByKey||st.scoresByUid;
              Object.keys(incoming).forEach(key=>{scores[key]=Math.max(Number(scores[key])||0,Number(incoming[key])||0);});
            }else if(st.scoreA!=null||st.scoreB!=null){
              scores[mySeatKey()]=liveRoles.myColor==='w'?(st.scoreA||0):(st.scoreB||0);
              const dualOpp=seatPlayers.find(p=>!p.isMe);
              if(dualOpp)scores[dualOpp.key]=liveRoles.myColor==='w'?(st.scoreB||0):(st.scoreA||0);
            }
            if(st.revealWord)revealWord=String(st.revealWord);
          }
          if(val.status==='forfeit'){
            const iWon=val.winner===liveRoles.me;
            if(typeof showToast==='function')showToast(iWon?'Opponent left — you win':'Forfeit');
            endScribbleGame({forfeit:true,won:iWon,skipPush:true});
          } else {
            endScribbleGame({skipPush:true});
          }
          return;
        }
        const s=val.state;if(!s&&!(party&&(val.partyLeave||val.leftUid)))return;
        applyingLive=true;
        const prevPhase=phase;
        if(party&&applyPartyLeaves(Object.assign({},s||{},{
          partyLeave:!!(val.partyLeave||(s&&s.partyLeave)),
          leftUid:val.leftUid||(s&&s.leftUid)||null,
          outUids:(s&&s.outUids)||val.outUids||[],
          seats:(s&&s.seats)||null,
        })))return;
        if(!s){applyingLive=false;return;}
        if(s.drawer!=null)currentDrawerIdx=Number(s.drawer)||0;
        if(s.drawerUid){
          const idx=seatPlayers.findIndex(p=>(p.uid||p.key)===String(s.drawerUid));
          if(idx>=0)currentDrawerIdx=idx;
        }
        if(s.round!=null)round=Number(s.round)||round;
        if(Array.isArray(s.seats)){
          s.seats.forEach(remote=>{
            const local=seatPlayers.find(p=>p.key===remote.key||p.uid===remote.uid);
            if(!local)return;
            if(local.isMe)local.name='You';
            else if(remote.name&&remote.name!=='You'){local.name=String(remote.name);}
            scoreNames[local.key]=local.name;
          });
        }

        if(s.wordKey)liveWordKey=s.wordKey;
        if(s.wordLen!=null)liveWordLen=Number(s.wordLen)||0;
        if(typeof s.blankMask==='string'&&s.blankMask)blankMask=s.blankMask;
        if(s.hintIdx!=null)hintLetterIdx=Number(s.hintIdx);

        if(s.scoresByKey||s.scoresByUid){
          const incoming=s.scoresByKey||s.scoresByUid;
          Object.keys(incoming).forEach(key=>{
            const local=seatPlayers.find(p=>p.key===key||p.uid===key);
            const localKey=local?local.key:key;
            scores[localKey]=Math.max(Number(scores[localKey])||0,Number(incoming[key])||0);
          });
        }else if(s.scoreA!=null||s.scoreB!=null){
          scores[mySeatKey()]=liveRoles.myColor==='w'?(s.scoreA||0):(s.scoreB||0);
          const dualOpp=seatPlayers.find(p=>!p.isMe);
          if(dualOpp)scores[dualOpp.key]=liveRoles.myColor==='w'?(s.scoreB||0):(s.scoreA||0);
        }
        if(Array.isArray(s.guessed))s.guessed.forEach(key=>guessedCorrectly.add(key));
        if(iAmDrawer()&&phase==='draw'&&!roundClosing&&allGuessersScored()){
          applyingLive=false;
          finishRound({reason:'allGuessed'});
          return;
        }

        // Drawer publishes reveal when peer signals needReveal / allGuessed
        if(iAmDrawer()&&currentWord&&phase==='draw'&&!roundClosing){
          if(s.needReveal||s.allGuessed||s.reason==='allGuessed'){
            applyingLive=false;
            finishRound({reason:s.allGuessed||s.reason==='allGuessed'?'allGuessed':(s.reason||'timeout')});
            return;
          }
        }

        if(s.phase==='pick'||s.phase==='draw'||s.phase==='reveal')phase=s.phase;

        if(s.phase==='reveal'&&s.revealWord){
          revealWord=String(s.revealWord);
          blankMask=revealWord;
        }

        const remoteDrawer=!iAmDrawer();
        if(Array.isArray(s.strokes)&&remoteDrawer&&(phase==='draw'||s.phase==='draw')){
          applyRemoteStrokes(s.strokes);
        }

        if(s.lastGuess){
          const lg=s.lastGuess;
          const sig=round+'|'+(lg.by||'')+'|'+(lg.text||'')+'|'+(lg.ok?'1':'0')+'|'+(lg.close?'1':'0')+'|'+(lg.checkClose?'1':'0');
          if(sig!==lastHandledGuessSig){
            lastHandledGuessSig=sig;
            if(lg.by!==mySeatKey()){
              if(!lg.ok)addScribbleMessage(seatName(lg.by)+': '+(lg.text||''),false);
              if(lg.ok)addScribbleMessage(seatName(lg.by)+' got it!'+(lg.pts?' +'+lg.pts:''),true);
              if(lg.close&&typeof showToast==='function'){/* drawer ignores peer close toast */}
            } else if(lg.close){
              if(typeof showToast==='function')showToast('Close!');
            }
            if(iAmDrawer()&&currentWord&&lg.checkClose&&!lg.ok&&lg.by!==mySeatKey()&&lg.text){
              if(isNearMiss(lg.text,currentWord)){
                applyingLive=false;
                pushScribble({lastGuess:{by:lg.by,ok:false,close:true,text:lg.text}});
                applyingLive=true;
              }
            }
          }
        }

        if((s.matchOver||(s.ended&&s.phase==='reveal'&&s.revealWord&&round>=maxRounds))&&!liveEnded){
          liveEnded=true;applyingLive=false;
          endScribbleGame({skipPush:true});
          return;
        }
        applyingLive=false;

        // Enter draw as guesser when drawer locked wordKey
        if(remoteDrawer&&s.phase==='draw'&&liveWordKey&&prevPhase!=='draw'){
          phase='draw';
          roundTimer=typeof s.roundTimer==='number'?s.roundTimer:DRAW_SECS;
          clearInterval(roundInterval);
          render();
          roundInterval=setInterval(()=>{
            if(!alive()||phase!=='draw'){clearInterval(roundInterval);return;}
            if(typeof s.roundTimer==='number'){/* drawer drives */}
            roundTimer=Math.max(0,roundTimer-1);
            const el=document.getElementById('scribbleTimer');if(el)el.textContent=roundTimer+'s';
          },1000);
          return;
        }

        // Peer reveal — host advances turns
        if(s.phase==='reveal'&&prevPhase!=='reveal'){
          roundClosing=true;
          stopInkStream();
          clearInterval(roundInterval);roundInterval=null;
          revealWord=s.revealWord||revealWord||'';
          phase='reveal';
          render();
          if(typeof showToast==='function'&&revealWord)showToast('Word was “'+revealWord+'”');
          if(hostAuthority())afterRevealAdvance();
          else schedule(()=>{roundClosing=false;},1700);
          return;
        }

        // New pick phase: drawer starts local pick-3
        if(s.phase==='pick'&&iAmDrawer()&&prevPhase!=='pick'&&!pickInterval){
          startPickPhase();
          return;
        }
        if(s.phase==='pick'&&iAmDrawer()&&!pickChoices.length&&!pickInterval&&!currentWord&&phase==='pick'){
          startPickPhase();
          return;
        }
        if(s.phase==='pick'&&remoteDrawer&&prevPhase!=='pick'){
          stopInkStream();
          clearInterval(roundInterval);roundInterval=null;
          currentWord='';
          phase='pick';
          render();
        }

        renderScoresOnly();
        if(!iAmDrawer()){
          const blanksEl=overlay.querySelector('.scribble-blanks');
          if(blanksEl)blanksEl.textContent=guessBlanks();
        }
      },
    });
  }
  startRound();
}


// ===================== GROUP GAME SETUP — PLAYER SELECTOR =====================
function openGroupGameSetup(groupChat, gameId){
  groupChat=groupChat||{members:[]};
  // groupChat.members should be an array of {name, uid, avatar}
  let members=(groupChat.members||[{name:'Player 2',avatar:'👤'},{name:'Player 3',avatar:'👤'},{name:'Player 4',avatar:'👤'}]);
  const multiGames={
    ludo:{name:'🎯 Ludo',min:2,max:4},
    uno:{name:'🃏 Oh, No! Cards',min:2,max:6},
    // Scribble party lobby — min 3 / max 6 (Live when seats have UIDs).
    scribble:{name:'🎨 Scribble party',min:3,max:6},
  };
  const cfg=multiGames[gameId];
  if(!cfg){
    if(typeof showToast==='function')showToast('That group game isn’t available here');
    return;
  }
  let selectedPlayers=new Set();

  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;inset:0;background:var(--cream);z-index:100;display:flex;flex-direction:column;';
  
  function render(){
    sheet.innerHTML=`
      <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--white);border-bottom:1px solid var(--line);flex-shrink:0;">
        ${typeof backButtonHtml==='function'?backButtonHtml({ id: 'groupGameBack' }):'<button id="groupGameBack" class="cp-back-btn" aria-label="Back">←</button>'}
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">${cfg.name} — Select Players</div>
      </div>
      <div style="padding:16px;flex:1;overflow-y:auto;">
        <div style="font-size:13px;color:var(--muted);margin-bottom:14px;">Pick ${cfg.min}–${cfg.max} players. You are always included.</div>
        <div style="display:flex;align-items:center;gap:10px;padding:14px;background:var(--white);border-radius:14px;margin-bottom:8px;border:2px solid var(--game-accent,var(--red));">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--game-accent,var(--red));display:flex;align-items:center;justify-content:center;font-size:18px;">🪑</div>
          <div style="flex:1;font-weight:700;">You</div>
          <div style="color:var(--game-accent,var(--red));font-size:12px;font-weight:700;">✓ Playing</div>
        </div>
        ${members.map((m,i)=>{
          const sel=selectedPlayers.has(m.name);
          return`<div class="group-player-row" data-name="${m.name}" style="display:flex;align-items:center;gap:10px;padding:14px;background:var(--white);border-radius:14px;margin-bottom:8px;border:2px solid ${sel?'var(--game-accent,var(--red))':'var(--line)'};cursor:pointer;">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--line);display:flex;align-items:center;justify-content:center;font-size:18px;">${m.avatar||'👤'}</div>
            <div style="flex:1;"><div style="font-weight:700;">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(m.name,m):m.name}</div><div style="font-size:11px;color:var(--muted);">Tap to ${sel?'remove':'add'}</div></div>
            <div style="width:24px;height:24px;border-radius:50%;background:${sel?'var(--game-accent,var(--red))':'var(--line)'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;">${sel?'✓':''}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="padding:14px 16px;background:var(--white);border-top:1px solid var(--line);">
        <div style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:10px;">${selectedPlayers.size+1} player${selectedPlayers.size+1===1?'':'s'} selected · You are included · AI fills if needed</div>
        <button id="startGroupGame" style="width:100%;padding:14px;background:${selectedPlayers.size+1>=cfg.min?'var(--game-accent,var(--red))':'var(--line)'};color:${selectedPlayers.size+1>=cfg.min?'#fff':'var(--muted)'};border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;">
          ${selectedPlayers.size+1>=cfg.min?'Start Game →':'Select at least '+cfg.min+' players'}
        </button>
      </div>
    `;
    document.getElementById('groupGameBack').addEventListener('click',()=>sheet.remove());
    sheet.querySelectorAll('.group-player-row').forEach(row=>{
      row.addEventListener('click',()=>{
        const name=row.dataset.name;
        if(selectedPlayers.has(name))selectedPlayers.delete(name);
        else if(selectedPlayers.size+1<cfg.max)selectedPlayers.add(name);
        else showToast(`Max ${cfg.max} players for this game`);
        render();
      });
    });
    document.getElementById('startGroupGame').addEventListener('click',()=>{
      if(selectedPlayers.size+1<cfg.min)return;
      sheet.remove();
      const ownType=typeof ownProfileType==='function'?ownProfileType():'personal';
      const playerList=[{name:'You',isMe:true,profileType:ownType},...[...selectedPlayers].map(n=>{const m=members.find(x=>x.name===n);return{name:n,avatar:m?.avatar||'👤',isMe:false,profileType:m?.profileType||null,uid:m?.uid||null};})];
      const playerCount=playerList.length;
      const fakeChat={name:playerList[1]?.name||'Opponent',id:'group_game',profileType:playerList[1]?.profileType||null};
      if(gameId==='ludo'){
        if(typeof openLudoPracticeSheet==='function')openLudoPracticeSheet(fakeChat,{playerCount,source:'baithak'});
        else openLudoGame(fakeChat,playerCount,{mode:'classic'});
      }
      else if(gameId==='scribble'){
        const opponents=playerList.filter(p=>!p.isMe);
        const me=String(typeof getCurrentUid==='function'?getCurrentUid():'').trim();
        const rawSeats=[me,...opponents.map(p=>String(p.uid||'').trim())].filter(Boolean);
        const partySeats=typeof DangalLive!=='undefined'&&DangalLive.normalizePartySeats
          ?DangalLive.normalizePartySeats(rawSeats)
          :[...new Set(rawSeats)];
        if(me&&partySeats.length>=cfg.min){
          const launch=(typeof window!=='undefined'&&window.__dangalLaunchCtx)||{};
          const matchId=String(groupChat.dangalMatchId||launch.matchId||('scribble_party_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)));
          groupChat.dangalMatchId=matchId;
          groupChat.partySeats=partySeats.slice(0,cfg.max);
          groupChat.dangalSource='party';
          window.__dangalLaunchCtx=Object.assign({},launch,{
            gameId:'scribble',gameType:'scribble',matchId,partySeats:groupChat.partySeats.slice(),source:'party',scribbleParty:true,mode:'live',
          });
          openScribbleGame(groupChat,opponents,{party:true,partySeats:groupChat.partySeats});
        }else{
          openScribbleGame(groupChat,opponents,{party:true,partyLocal:true});
        }
      }
      else if(gameId==='uno')openUnoVariantPicker(fakeChat);
    });
  }
  document.querySelector('.device').appendChild(sheet);
  if(typeof enrichUsersWithProfileType==='function'){
    enrichUsersWithProfileType(members).finally(()=>render());
  } else {
    render();
  }
}

window.openScribblePartySetup=(chat)=>openGroupGameSetup(chat||{members:[]},'scribble');

// openGamePicker is provided by game-registry.js

// --- Game registry self-registration (board-games.js) ---
if (typeof registerGame === 'function') {
  registerGame({
    id: 'scribble',
    name: 'Scribble',
    desc: 'Draw & guess · Live 1v1 or party 3–6',
    icon: '🎨',
    ratingKey: 'scribble',
    gameType: 'multiplayer',
    genre: 'words',
    chat1v1: true,
    chatGroup: true,
    selfChat: true,
    liveDuel: true,
    order: 90,
    launch(ctx) {
      const launch=(typeof window!=='undefined'&&window.__dangalLaunchCtx)||{};
      const c = ctx || {};
      if (c.isGroup) {
        openGroupGameSetup(c.chat, 'scribble');
        return;
      }
      if (c.source === 'party' || launch.scribbleParty) {
        openGroupGameSetup(c.chat || {members:[]}, 'scribble');
        return;
      }
      const mode = c.mode || launch.mode || '';
      const opp = String(c.opponentUid || launch.opponentUid || '').trim();
      const chatId = c.chat && (c.chat.id || c.chat.uid);
      const practiceVsAi =
        mode === 'practice' &&
        (opp === 'ai' || chatId === 'ai' || launch.practiceKind === 'vsAi');
      // Practice vs AI: you draw, AI guesses — never fake AI doodles.
      if (practiceVsAi) {
        const aiChat =
          c.chat && (c.chat.id === 'ai' || /practice ai/i.test(String(c.chat.name || '')))
            ? c.chat
            : typeof practiceAiChat === 'function'
              ? practiceAiChat()
              : { name: 'Practice AI', id: 'ai' };
        openScribbleGame(aiChat, [{ name: 'Practice AI', isAi: true, uid: '' }]);
        return;
      }
      // Explicit solo doodle (no opponent) — honest Solo draw, not vs AI.
      if (c.source === 'solo' || c.practiceKind === 'solo' || launch.practiceKind === 'solo') {
        openScribbleGame(c.chat || { name: 'Practice', id: 'practice' }, [], { practice: true });
        return;
      }
      // 1:1 chat / duel challenge — classic Live 1v1 path.
      openScribbleGame(c.chat, [{ name: c.chat?.name || 'Friend', uid: c.chat?.uid || launch.opponentUid || '' }]);
    },
  });
}
