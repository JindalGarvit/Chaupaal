/**
 * Phase 2A — wrap a game overlay with createGameSession.
 * Parent dismiss → cleanup (timers / RAF / listeners). Analytics via session.end.
 *
 * Lifecycle (Polish P0):
 *   - Prefer gs.schedule(fn, ms) for timeouts (auto-cleared).
 *   - Prefer gs.registerAnimFrame(cb) for RAF loops (cancelled on cleanup).
 *   - Games that keep raw requestAnimationFrame / setInterval MUST cancel them in cleanup.
 *   - overlayScope follows launch source (Manch ≠ chat) so leave returns correctly.
 *
 * @returns {{ alive:()=>boolean, close:(result?:string)=>void, setOutcome:(r:string)=>void, getOutcome:()=>string|null, schedule:(fn:Function,ms:number)=>number, clearTimers:()=>void, registerAnimFrame:(cb:FrameRequestCallback)=>number, clearAnimFrames:()=>void }}
 */
function beginGameOverlaySession(opts) {
  const type = opts.type;
  const overlay = opts.overlay;
  const userCleanup = typeof opts.cleanup === 'function' ? opts.cleanup : null;
  const onEnd = typeof opts.onEnd === 'function' ? opts.onEnd : null;
  const timers = new Set();
  const rafs = new Set();
  let alive = true;
  let outcome = null;
  let session = null;
  const launch = window.__dangalLaunchCtx || {};
  const launchSource =
    typeof resolveGameLaunchSource === 'function'
      ? resolveGameLaunchSource(
          Object.assign({}, launch, { source: opts.source || launch.source, chat: opts.chat })
        )
      : opts.source || launch.source || '';
  const overlayScope =
    opts.overlayScope ||
    (typeof resolveGameOverlayScope === 'function'
      ? resolveGameOverlayScope(launchSource)
      : typeof OVERLAY_SCOPE_CHAT !== 'undefined'
        ? OVERLAY_SCOPE_CHAT
        : 'chat');
  const opponentUid =
    opts.opponentUid ||
    launch.opponentUid ||
    (typeof opponentUidFromChat === 'function' ? opponentUidFromChat(opts.chat) : '');
  const matchId = String(
    opts.matchId ||
      launch.matchId ||
      (opts.chat && opts.chat.dangalMatchId) ||
      (typeof dangalMatchId === 'function' ? dangalMatchId(type, opts.chat) : type + '_' + Date.now())
  )
    .replace(/[^\w.-]/g, '')
    .slice(0, 120);
  const stake = Number(opts.stake || launch.stake) || 0;
  const skipEconomyReport = !!opts.skipEconomyReport;
  const returnCtx = {
    source: launchSource,
    chat: opts.chat,
    chatId: launch.chatId || '',
  };

  if (overlay) {
    if (!overlay.innerHTML || !String(overlay.innerHTML).trim()) {
      const title = opts.title || type || 'Game';
      const theme = opts.theme || 'dark';
      if (typeof gameSkeletonHtml === 'function') {
        const tmp = document.createElement('div');
        tmp.innerHTML = gameSkeletonHtml({ title, theme });
        const shell = tmp.firstElementChild;
        if (shell) {
          overlay.className = shell.className;
          overlay.innerHTML = shell.innerHTML;
        }
      } else {
        overlay.innerHTML = `<div style="padding:24px;color:#fff;opacity:.6;font-family:Space Grotesk,sans-serif;font-weight:700;">${title}</div>`;
      }
    }
    if (typeof prepareGameOverlay === 'function') {
      prepareGameOverlay(overlay, { theme: opts.theme || 'dark', gameId: type, accent: opts.accent });
    } else if (overlay.classList) {
      overlay.classList.add('game-overlay', 'game-overlay--ready');
    }
  }

  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  }

  function clearAnimFrames() {
    rafs.forEach((id) => {
      try {
        cancelAnimationFrame(id);
      } catch (e) {}
    });
    rafs.clear();
  }

  function schedule(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!alive) return;
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  /** Tracked RAF — cancelled automatically in cleanup. Prefer over raw requestAnimationFrame. */
  function registerAnimFrame(cb) {
    let id = 0;
    const wrap = (ts) => {
      rafs.delete(id);
      if (!alive) return;
      try {
        cb(ts);
      } catch (e) {
        console.warn('[game] raf', e);
      }
    };
    id = requestAnimationFrame(wrap);
    rafs.add(id);
    return id;
  }

  function setOutcome(r) {
    if (outcome == null && r != null) {
      outcome = r;
      if (typeof gameFeedback === 'function') {
        const key = r === 'won' ? 'win' : r === 'lost' ? 'lose' : r === 'draw' ? 'draw' : null;
        if (key) gameFeedback(key);
      }
      if (typeof DSL !== 'undefined' && DSL.onGameOver) {
        try {
          DSL.onGameOver({ gameType: type, result: r, overlay });
        } catch (e) {}
      }
      if (!skipEconomyReport && window.DangalEconomy && typeof DangalEconomy.reportGameEnd === 'function') {
        try {
          DangalEconomy.reportGameEnd({
            gameType: type,
            result: r,
            sessionId: matchId,
            matchId,
            opponentUid,
            stake,
          });
        } catch (e) {}
      }
    }
  }

  function runUserCleanup() {
    clearTimers();
    clearAnimFrames();
    if (userCleanup) {
      try {
        userCleanup();
      } catch (e) {
        console.warn('[game] cleanup', e);
      }
    }
  }

  function close(result) {
    if (!alive && !session) return;
    const r = result != null ? result : outcome || 'quit';
    if (session) {
      try {
        session.end(r);
      } catch (e) {
        alive = false;
        runUserCleanup();
        if (overlay && overlay.isConnected) overlay.remove();
        try {
          if (typeof honorGameReturnTarget === 'function') honorGameReturnTarget(returnCtx);
        } catch (e2) {}
      }
      return;
    }
    alive = false;
    runUserCleanup();
    if (typeof clearDangalLaunchCtx === 'function') clearDangalLaunchCtx();
    if (onEnd) {
      try {
        onEnd(r);
      } catch (e) {}
    }
    if (overlay && overlay.isConnected) overlay.remove();
    try {
      if (typeof honorGameReturnTarget === 'function') honorGameReturnTarget(returnCtx);
    } catch (e) {}
  }

  if (typeof createGameSession === 'function') {
    session = createGameSession({
      id: matchId || type + '_' + Date.now(),
      type,
      title: opts.title || type,
      mode: opts.mode || '1v1',
      context: {
        chat: opts.chat,
        overlayScope,
        source: launchSource,
        opponentUid,
        matchId,
        stake,
      },
      mount() {
        return overlay;
      },
      end(result) {
        if (onEnd) onEnd(result);
      },
      cleanup() {
        alive = false;
        runUserCleanup();
        session = null;
        if (typeof clearDangalLaunchCtx === 'function') clearDangalLaunchCtx();
      },
    });
    try {
      session.init();
    } catch (e) {
      console.error('[game] session init failed', type, e);
      alive = false;
      if (typeof showToast === 'function') showToast('Could not start game');
      return {
        alive: () => false,
        close() {},
        setOutcome,
        getOutcome: () => outcome,
        schedule,
        clearTimers,
        registerAnimFrame,
        clearAnimFrames,
      };
    }
  } else {
    const device = document.querySelector('.device');
    if (!device) {
      alive = false;
      if (typeof showToast === 'function') showToast('Game container not found');
      return {
        alive: () => false,
        close() {},
        setOutcome,
        getOutcome: () => outcome,
        schedule,
        clearTimers,
        registerAnimFrame,
        clearAnimFrames,
      };
    }
    if (overlay && !overlay.isConnected) device.appendChild(overlay);
  }

  try {
    if (overlay && typeof attachDangalPlayComm === 'function') {
      attachDangalPlayComm(overlay, { chat: opts.chat, matchId, opponentUid });
    }
  } catch (e) {}

  return {
    alive: () => alive,
    close,
    setOutcome,
    getOutcome: () => outcome,
    schedule,
    clearTimers,
    registerAnimFrame,
    clearAnimFrames,
  };
}
window.beginGameOverlaySession = beginGameOverlaySession;


/** DPR-aware canvas setup — uses shared helper when present, else local scale. */
function ensureGameCanvas(canvas, cssW, cssH) {
  if (typeof window.setupGameCanvas === 'function') {
    return window.setupGameCanvas(canvas, cssW, cssH);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, cssW || canvas.clientWidth || 300);
  const h = Math.max(1, cssH || canvas.clientHeight || 300);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: w, height: h, dpr };
}
window.ensureGameCanvas = ensureGameCanvas;

/** Chess lives in chess-ui.js (FIDE rules core, server-authoritative Live/Daily, bots, review). */
function openChessGame(chat) {
  if (window.ChessUI && typeof window.ChessUI.open === 'function') {
    window.ChessUI.open(chat);
    return;
  }
  if (typeof showToast === 'function') showToast('Chess couldn’t load — refresh and try again');
}
function startChessGame(chat) {
  openChessGame(chat);
}

// Snakes & Ladders lives in snakes-ui.js and Ludo in ludo-ui.js (Dangal P3 cores + party rooms).

// Oh No! moved to games/ohno-core.js + games/ohno-ui.js (Dangal P4).

// ===================== SHABD FIVE =====================
// Lexicon (1) · Daily save/lock (2) · Hard Mode clue discipline (3)
const SHABD_ANSWER_BANK=(typeof SHABD_ANSWERS!=='undefined'&&Array.isArray(SHABD_ANSWERS)&&SHABD_ANSWERS.length)
  ?SHABD_ANSWERS
  :['HOUSE','WORLD','HEART','DREAM','LIGHT','OCEAN','RIVER','MUSIC','STONE','POWER'];
const SHABD_DAILY_KEY='chaupaal_shabd_daily_v1';
const SHABD_HARD_PREF='chaupaal_shabd_hard_v1';

function shabdDayKey(){
  if(typeof shabdLocalDayKey==='function')return shabdLocalDayKey();
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function shabdDailySeed(){
  return Number(String(shabdDayKey()).replace(/-/g,''));
}
function shabdPickDaily(){
  const seed=shabdDailySeed();
  let x=Math.sin(seed*12.9898)*43758.5453;
  x=x-Math.floor(x);
  if(typeof pickShabdAnswer==='function')return pickShabdAnswer(()=>x);
  return SHABD_ANSWER_BANK[Math.floor(x*SHABD_ANSWER_BANK.length)];
}
function isShabdGuessAllowed(guess){
  if(typeof isAllowedShabd==='function')return isAllowedShabd(guess);
  const w=String(guess||'').trim().toUpperCase();
  return SHABD_ANSWER_BANK.indexOf(w)!==-1;
}
function pickShabdPractice(){
  if(typeof pickShabdAnswer==='function')return pickShabdAnswer(Math.random);
  return SHABD_ANSWER_BANK[Math.floor(Math.random()*SHABD_ANSWER_BANK.length)];
}
function isShabdAnswerWord(w){
  const u=String(w||'').trim().toUpperCase();
  if(!/^[A-Z]{5}$/.test(u))return false;
  if(typeof SHABD_ANSWERS!=='undefined'&&Array.isArray(SHABD_ANSWERS))return SHABD_ANSWERS.indexOf(u)!==-1;
  return SHABD_ANSWER_BANK.indexOf(u)!==-1;
}
function loadShabdHardPref(){
  try{return localStorage.getItem(SHABD_HARD_PREF)==='1';}catch(e){return false;}
}
function saveShabdHardPref(on){
  try{localStorage.setItem(SHABD_HARD_PREF,on?'1':'0');}catch(e){}
}
/** Classic Hard Mode eval (green/present/absent) for a guess vs target. */
function shabdEvalStates(guess,answer){
  const states=Array(5);
  const targetArr=String(answer||'').toUpperCase().split('');
  const guessArr=String(guess||'').toUpperCase().split('');
  for(let i=0;i<5;i++){
    if(guessArr[i]===targetArr[i]){states[i]='correct';targetArr[i]=null;guessArr[i]=null;}
  }
  for(let i=0;i<5;i++){
    if(guessArr[i]==null){if(!states[i])states[i]='correct';continue;}
    const idx=targetArr.indexOf(guessArr[i]);
    if(idx!==-1){states[i]='present';targetArr[idx]=null;}
    else states[i]='absent';
  }
  return states;
}
/**
 * Hard Mode: greens stay fixed; present+correct letter counts from each prior row
 * require at least that many of each letter in the new guess (standard five-letter puzzle rule).
 * Returns null if legal, else a short reason string.
 */
function shabdHardModeViolation(guess,priorGuesses,answer){
  if(!priorGuesses||!priorGuesses.length)return null;
  const g=String(guess||'').toUpperCase();
  if(g.length!==5)return null;
  const greens=[null,null,null,null,null];
  const need={};
  for(let r=0;r<priorGuesses.length;r++){
    const prev=String(priorGuesses[r]||'').toUpperCase();
    if(prev.length!==5)continue;
    const states=shabdEvalStates(prev,answer);
    const cnt={};
    for(let i=0;i<5;i++){
      if(states[i]==='correct')greens[i]=prev[i];
      if(states[i]==='correct'||states[i]==='present')cnt[prev[i]]=(cnt[prev[i]]||0)+1;
    }
    Object.keys(cnt).forEach((L)=>{need[L]=Math.max(need[L]||0,cnt[L]);});
  }
  for(let i=0;i<5;i++){
    if(greens[i]&&g[i]!==greens[i])return 'Guess must use '+greens[i]+' in spot '+(i+1);
  }
  const have={};
  for(let i=0;i<5;i++)have[g[i]]=(have[g[i]]||0)+1;
  const letters=Object.keys(need).sort();
  for(let i=0;i<letters.length;i++){
    const L=letters[i];
    const n=need[L];
    if((have[L]||0)<n)return n>1?('Guess must include '+L+' ×'+n):('Guess must include '+L);
  }
  return null;
}
function loadShabdDailyState(){
  try{
    const raw=localStorage.getItem(SHABD_DAILY_KEY);
    if(!raw)return null;
    const o=JSON.parse(raw);
    if(!o||typeof o!=='object')return null;
    return o;
  }catch(e){return null;}
}
function saveShabdDailyState(state){
  try{localStorage.setItem(SHABD_DAILY_KEY,JSON.stringify(state));}catch(e){}
  try{if(typeof window!=='undefined')window.__shabdDailyState=state;}catch(e){}
}
function clearShabdDailyState(){
  try{localStorage.removeItem(SHABD_DAILY_KEY);}catch(e){}
}
function validateShabdDailySave(o,today){
  if(!o||o.day!==today)return null;
  const target=String(o.target||'').toUpperCase();
  if(!/^[A-Z]{5}$/.test(target))return null;
  // Mid-run requires answer-bank target; finished lock may keep a legacy 5-letter target
  if(!o.gameOver&&!isShabdAnswerWord(target))return null;
  if(!Array.isArray(o.guesses))return null;
  if(o.guesses.length>6)return null;
  for(let i=0;i<o.guesses.length;i++){
    const g=String(o.guesses[i]||'').toUpperCase();
    if(g.length!==5)return null;
  }
  if(o.gameOver&&!o.guesses.length)return null;
  const current=String(o.currentGuess||'').toUpperCase().replace(/[^A-Z]/g,'');
  if(current.length>5)return null;
  return{
    day:today,
    seed:o.seed!=null?Number(o.seed):shabdDailySeed(),
    target,
    guesses:o.guesses.map(g=>String(g).toUpperCase()),
    currentGuess:o.gameOver?'':current.slice(0,5),
    gameOver:!!o.gameOver,
    won:!!o.won,
    hardMode:!!o.hardMode,
    keyColors:o.keyColors&&typeof o.keyColors==='object'?o.keyColors:{},
    streakRecorded:!!o.streakRecorded,
    updatedAt:o.updatedAt||Date.now(),
  };
}
function getShabdDailyState(){
  return validateShabdDailySave(loadShabdDailyState(),shabdDayKey());
}
if(typeof window!=='undefined'){
  window.getShabdDailyState=getShabdDailyState;
  window.shabdDayKey=shabdDayKey;
  window.shabdHardModeViolation=shabdHardModeViolation;
}

function openWordGuess(chat,opts){
const overlay=document.createElement('div');
overlay.style.cssText='position:absolute;inset:0;background:#121213;z-index:80;display:flex;flex-direction:column;';
const useDaily=!opts||opts.daily!==false;
const todayKey=shabdDayKey();
const todaySeed=shabdDailySeed();

let guesses=[];let currentGuess='';let gameOver=false;let shake=false;
let keyColors={};let flippingRow=-1;let revealedCols=0;
let target='';let streakRecorded=false;
let restoredFinished=false;
let hardMode=loadShabdHardPref();
let hardLocked=false; // lock toggle after first submitted guess

function rebuildKeyColorsFromGuesses(){
  keyColors={};
  for(let i=0;i<guesses.length;i++)updateKeyColors(guesses[i]);
}

function persistDaily(extra){
  if(!useDaily)return;
  const payload=Object.assign({
    day:todayKey,
    seed:todaySeed,
    target,
    guesses:guesses.slice(),
    currentGuess:gameOver?'':String(currentGuess||'').toUpperCase().slice(0,5),
    gameOver:!!gameOver,
    won:!!(gameOver&&guesses.length&&guesses[guesses.length-1]===target),
    hardMode:!!hardMode,
    keyColors:Object.assign({},keyColors),
    streakRecorded:!!streakRecorded,
    updatedAt:Date.now(),
  },extra||{});
  saveShabdDailyState(payload);
}

if(useDaily){
  const saved=validateShabdDailySave(loadShabdDailyState(),todayKey);
  if(saved){
    target=saved.target;
    guesses=saved.guesses.slice();
    currentGuess=saved.currentGuess||'';
    gameOver=!!saved.gameOver;
    streakRecorded=!!saved.streakRecorded;
    hardMode=!!saved.hardMode;
    hardLocked=guesses.length>0||gameOver;
    keyColors=saved.keyColors&&Object.keys(saved.keyColors).length?Object.assign({},saved.keyColors):{};
    if(!Object.keys(keyColors).length&&guesses.length)rebuildKeyColorsFromGuesses();
    restoredFinished=gameOver;
  }else{
    // Stale other-day save: rotate cleanly
    const stale=loadShabdDailyState();
    if(stale&&stale.day&&stale.day!==todayKey)clearShabdDailyState();
    target=shabdPickDaily();
    hardMode=loadShabdHardPref();
    hardLocked=false;
    persistDaily();
  }
}else{
  target=pickShabdPractice();
  hardMode=loadShabdHardPref();
  hardLocked=false;
}

const kbHandler=e=>{
  if(!gs.alive())return;
  if(e.key==='Backspace')handleInput('⌫');
  else if(e.key==='Enter')handleInput('↵');
  else if(/^[a-zA-Z]$/.test(e.key))handleInput(e.key.toUpperCase());
};
const gs=beginGameOverlaySession({
  type:'wordguess',title:'Shabd Five',mode:'solo',chat,overlay,
  cleanup(){
    document.removeEventListener('keydown',kbHandler);
    if(useDaily)persistDaily();
  },
});
if(!gs.alive())return;
if(typeof prepareGameOverlay==='function') prepareGameOverlay(overlay,{theme:'dark',gameId:'wordguess'});
if(typeof markGamePlayed==='function') markGamePlayed('wordguess');

async function askWordGuessLeave(){
  if(useDaily)persistDaily();
  if(gameOver){gs.close();return;}
  const title='Leave Shabd Five?';
  const body=useDaily
    ?'Progress is saved — leave?'
    :'Practice progress will be discarded.';
  if(typeof DangalLive!=='undefined'&&DangalLive.requestLeave){
    const ok=await DangalLive.requestLeave({title,body,onLeave:()=>{}});
    if(!ok)return;
  }else if(typeof confirmLeaveGame==='function'){
    const ok=await confirmLeaveGame({title,body});
    if(!ok)return;
  }
  gs.close();
}

async function goToPractice(fromResult){
  if(useDaily)persistDaily();
  if(useDaily&&!gameOver){
    const ask=typeof confirmLeaveGame==='function'
      ?confirmLeaveGame({
        title:'Switch to Practice?',
        body:"Today's Daily stays saved. Open a random Practice word instead?",
      })
      :Promise.resolve(window.confirm('Open Practice? Daily progress stays saved.'));
    const ok=await Promise.resolve(ask);
    if(!ok)return;
  }
  gs.close('restart');
  openWordGuess(chat,{daily:false});
}

function getTileState(guess,pos){
  const letter=guess[pos];
  if(target[pos]===letter)return'correct';
  const targetArr=target.split('');const guessArr=guess.split('');
  guessArr.forEach((l,i)=>{if(l===target[i]){targetArr[i]=null;guessArr[i]=null;}});
  const idx=targetArr.indexOf(letter);
  if(idx!==-1&&guessArr[pos]!==null){targetArr[idx]=null;return'present';}
  return'absent';
}

const COLORS={correct:'#538D4E',present:'#B59F3B',absent:'#3A3A3C',empty:'transparent',current:'transparent'};

function updateKeyColors(guess){
  const priority={correct:3,present:2,absent:1};
  for(let i=0;i<5;i++){
    const l=guess[i];const s=getTileState(guess,i);
    if(!keyColors[l]||priority[s]>(priority[keyColors[l]]||0))keyColors[l]=s;
  }
}

function letterHaptic(kind){
  try{
    if(typeof haptic==='function')haptic(kind==='correct'?'success':kind==='present'?'medium':'light');
  }catch(e){}
}

function rejectGuess(msg){
  shake=true;
  if(typeof shakeInvalidMove==='function')shakeInvalidMove(document.getElementById('wgGrid'),{toast:msg});
  else{if(typeof showToast==='function')showToast(msg);if(typeof gameFeedback==='function')gameFeedback('invalid');}
  render();
  gs.schedule(()=>{shake=false;render();},500);
}

function setHardMode(next){
  if(hardLocked||gameOver)return;
  hardMode=!!next;
  saveShabdHardPref(hardMode);
  if(useDaily)persistDaily();
  render();
}

function finishDailyIfNeeded(won){
  if(!useDaily)return;
  gameOver=true;
  if(!streakRecorded){
    if(typeof recordShabdDailyResult==='function'){
      recordShabdDailyResult(won,{guesses:guesses.length,hard:!!hardMode});
    }
    streakRecorded=true;
  }
  persistDaily({gameOver:true,won:!!won,streakRecorded:true,currentGuess:'',hardMode:!!hardMode});
}

function render(){
  if(!gs.alive())return;
  const dayLabel=useDaily
    ?(gameOver?`Daily done · ${shabdDailySeed()}`:`Daily · ${shabdDailySeed()}`)
    :'Practice';
  const hardBit=hardMode?' · Hard':'';
  const streak=typeof getShabdStreak==='function'?getShabdStreak():null;
  const streakBit=useDaily&&streak&&streak.streak?` · Streak ${streak.streak}`:'';
  const won=gameOver&&guesses.length>0&&guesses[guesses.length-1]===target;
  const shareCard=gameOver&&typeof buildGameShareCard==='function'
    ? buildGameShareCard('wordguess',{
        scoreLine: won?`${guesses.length}/6`:'X/6',
        meta: dayLabel+hardBit+(streak&&streak.streak?` · streak ${streak.streak}`:''),
      })
    : '';
  const againLabel=useDaily?'Practice a random word':'Play again';
  const reveal=typeof buildShabdReveal==='function'
    ?buildShabdReveal({won,word:target,guesses:guesses.length,hard:hardMode,daily:useDaily})
    :null;
  const resultTitle=reveal?reveal.title:(won?'Brilliant!':'Kal phir try');
  const resultSub=reveal
    ?(reveal.wordLine+(reveal.gloss?' — '+reveal.gloss:''))
    :(won
      ?(`The shabd was ${target}`+(hardMode?' · Hard':''))
      :(`The shabd was ${target}`+(hardMode?' · Hard':'')));
  const revealHtml=typeof shabdRevealHtml==='function'
    ?shabdRevealHtml({won,word:target,guesses:guesses.length,hard:hardMode,daily:useDaily})
    :(reveal&&reveal.voice?`<p class="shabd-reveal-voice">${reveal.voice}</p>`:'');
  const winLoseBanner=gameOver&&typeof gameTurnBannerHtml==='function'
    ?gameTurnBannerHtml({
      mode:won?'yours':'over',
      label:won?'You got it':'Out of guesses',
      sub:useDaily?'Daily complete — Practice anytime':(won?'Nice solve':'Try again'),
      pulse:!!won,
    })
    :'';
  const resultActions=[
    {label:'Share',primary:true,id:'share'},
  ];
  if(useDaily)resultActions.push({label:'Stats',primary:false,id:'stats'});
  resultActions.push(
    {label:againLabel,primary:false,id:'again'},
    {label:'Challenge friend',primary:false,id:'challenge'},
    {label:'Post to story',primary:false,id:'story'}
  );
  const resultBlock=gameOver&&typeof gameResultHtml==='function'
    ? gameResultHtml({
        gameId: 'wordguess',
        glyph: won?'✓':'·',
        title: resultTitle,
        subtitle: resultSub,
        vsBest: (typeof formatVsBest==='function'&&won&&useDaily)?formatVsBest('wordguess', guesses.length):undefined,
        missionHtml: revealHtml,
        hideMissions: true,
        shareCardHtml: shareCard,
        actions: resultActions,
      })
    : '';
  const hud=typeof gameHudHtml==='function'&&!gameOver
    ? gameHudHtml([
        {label:'Guess',value:`${guesses.length+1}/6`},
        hardMode?{label:'Mode',value:'Hard'}:null,
        useDaily&&streak?{label:'Streak',value:String(streak.streak||0)}:null,
      ])
    : '';
  const hardDisabled=hardLocked||gameOver;
  const hardToggle=`<button type="button" id="wgHard" class="game-chrome-action wg-hard-btn${hardMode?' is-on':''}" ${hardDisabled?'disabled':''} title="${hardDisabled?'Locked for this puzzle':'Must use revealed hints'}" aria-pressed="${hardMode?'true':'false'}">${hardMode?'Hard ✓':'Hard'}</button>`;
  const statsBtn=useDaily
    ?`<button type="button" id="wgStats" class="game-chrome-action" title="Statistics" aria-label="Statistics">Stats</button>`
    :'';
  const chromeRight=gameOver
    ? `${statsBtn}${hardMode?'<span class="game-chrome-action" style="opacity:.85;pointer-events:none;">Hard</span>':''}`
    : `${statsBtn}${hardToggle}<button type="button" id="wgNew" class="game-chrome-action">Practice</button>`;
  overlay.innerHTML=`
    ${gameChromeHtml({title:'Shabd Five',subtitle:dayLabel+hardBit+streakBit,backId:'wgBack',rightHtml:chromeRight})}
    ${hud}
    ${winLoseBanner}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:10px;" id="wgGrid"></div>
    ${resultBlock||(gameOver?`<div style="text-align:center;padding:8px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;color:${won?'#538D4E':'#B59F3B'};flex-shrink:0;">${resultTitle}<div class="shabd-reveal">${resultSub}</div></div>`:'')}
    ${gameOver?'':`<div style="flex-shrink:0;padding:8px;padding-bottom:max(8px,env(safe-area-inset-bottom));" id="wgKeyboard"></div>`}
  `;
  document.getElementById('wgBack').addEventListener('click',()=>{askWordGuessLeave();});
  document.getElementById('wgNew')?.addEventListener('click',()=>{goToPractice(false);});
  document.getElementById('wgHard')?.addEventListener('click',()=>{
    if(hardDisabled)return;
    setHardMode(!hardMode);
  });
  document.getElementById('wgStats')?.addEventListener('click',()=>{
    if(typeof openShabdStatsSheet==='function'){
      openShabdStatsSheet({
        host:overlay,
        highlightGuess:gameOver&&won?guesses.length:null,
      });
    }
  });

  if(gameOver&&typeof wireGameResultActions==='function'){
    const gridText=typeof buildShabdGridShare==='function'
      ?buildShabdGridShare(guesses,target,{hard:hardMode})
      :`Chaupaal Shabd Five ${guesses.length}/6`;
    const shareStats={
      scoreLine: won?`${guesses.length}/6`:'X/6',
      score: won?guesses.length:6,
      meta: dayLabel+hardBit,
      text: gridText+`\n\nPlay on Chaupaal`,
      includeImage: false,
    };
    wireGameResultActions(overlay,{
      again:()=>{
        if(useDaily)goToPractice(true);
        else{gs.close('restart');openWordGuess(chat,{daily:false});}
      },
      stats:()=>{
        if(typeof openShabdStatsSheet==='function'){
          openShabdStatsSheet({host:overlay,highlightGuess:won?guesses.length:null});
        }
      },
      share:()=>{
        if(typeof shareGameResult==='function') shareGameResult('wordguess', shareStats);
        else if(navigator.clipboard) navigator.clipboard.writeText(gridText);
      },
      challenge:async()=>{
        if(typeof openFriendPickerSheet==='function'){
          const f=await openFriendPickerSheet({title:'Challenge · Shabd Five'});
          if(f&&typeof shareGameResult==='function'){
            shareGameResult('wordguess',{...shareStats,text:`Hey ${f.name}!\n\n${gridText}`});
          }
        } else if(typeof shareGameResult==='function') shareGameResult('wordguess', shareStats);
      },
      story:()=>{
        if(typeof postGameScoreStory==='function'){
          postGameScoreStory('wordguess',{score:won?guesses.length:0,total:6,streak:streak?.streak,scoreLine:shareStats.scoreLine,text:gridText});
        }
      },
    });
  }

  const grid=document.getElementById('wgGrid');
  if(!grid)return;
  for(let r=0;r<6;r++){
    const row=document.createElement('div');row.style.cssText='display:flex;gap:5px;';
    for(let c=0;c<5;c++){
      const sq=document.createElement('div');
      let bg=COLORS.empty,border='2px solid #3a3a3c',text='',color='#fff',extra='';
      if(r<guesses.length){
        const reveal=r<flippingRow||(r===flippingRow&&c<revealedCols)||flippingRow<0;
        if(r===guesses.length-1&&flippingRow===r&&c>=revealedCols){
          text=guesses[r][c];border='2px solid #999';
          extra='transform:scaleY(0.1);background:#3a3a3c;';
        } else if(reveal||r<guesses.length-1||flippingRow<0){
          const s=getTileState(guesses[r],c);bg=COLORS[s];border='2px solid '+bg;text=guesses[r][c];
          if(r===flippingRow&&c===revealedCols-1)extra='animation:shabdFlip .35s ease;';
        } else {
          text=guesses[r][c];border='2px solid #999';
        }
      } else if(r===guesses.length&&!gameOver){
        text=currentGuess[c]||'';border=currentGuess[c]?'2px solid #999':'2px solid #3a3a3c';
        if(shake&&r===guesses.length)extra='animation:shakeRow .5s ease;';
      }
      sq.style.cssText=`width:clamp(44px,11vw,56px);height:clamp(44px,11vw,56px);background:${bg};border:${border};border-radius:4px;display:flex;align-items:center;justify-content:center;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:clamp(18px,5vw,24px);color:${color};transition:background .15s,transform .15s;${extra}`;
      sq.textContent=text;
      row.appendChild(sq);
    }
    grid.appendChild(row);
  }

  const kb=document.getElementById('wgKeyboard');
  if(!kb)return;
  const rows=['QWERTYUIOP','ASDFGHJKL','↵ZXCVBNM⌫'];
  rows.forEach(rowStr=>{
    const rowEl=document.createElement('div');rowEl.style.cssText='display:flex;justify-content:center;gap:4px;margin-bottom:4px;';
    rowStr.split('').forEach(k=>{
      const btn=document.createElement('button');
      const s=keyColors[k];
      btn.textContent=k;
      btn.className='game-tap-target';
      btn.style.cssText=`padding:${k==='↵'||k==='⌫'?'14px 6px':'14px 0'};width:${k==='↵'||k==='⌫'?'46px':'32px'};min-height:44px;border:none;border-radius:6px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;background:${s?COLORS[s]:'#818384'};color:#fff;`;
      btn.addEventListener('click',()=>handleInput(k));
      rowEl.appendChild(btn);
    });
    kb.appendChild(rowEl);
  });
}

function staggerReveal(guess,onDone){
  flippingRow=guesses.length-1;
  revealedCols=0;
  render();
  let c=0;
  function next(){
    if(!gs.alive())return;
    revealedCols=c+1;
    const state=getTileState(guess,c);
    letterHaptic(state);
    if(typeof gameFeedback==='function'&&c===0)gameFeedback('place');
    render();
    c++;
    if(c<5)gs.schedule(next,280);
    else{
      flippingRow=-1;revealedCols=0;
      updateKeyColors(guess);
      if(onDone)onDone();
      render();
    }
  }
  gs.schedule(next,80);
}

function handleInput(k){
  if(!gs.alive()||gameOver||flippingRow>=0)return;
  if(k==='⌫'||k==='Backspace'){
    currentGuess=currentGuess.slice(0,-1);
    try{if(typeof haptic==='function')haptic('light');}catch(e){}
  }
  else if(k==='↵'||k==='Enter'){
    if(currentGuess.length!==5){rejectGuess('Need 5 letters');return;}
    if(!isShabdGuessAllowed(currentGuess)){rejectGuess('Not in word list');return;}
    if(hardMode){
      const hardErr=shabdHardModeViolation(currentGuess,guesses,target);
      if(hardErr){rejectGuess(hardErr);return;}
    }
    const guess=currentGuess;
    guesses.push(guess);currentGuess='';
    hardLocked=true;
    saveShabdHardPref(hardMode);
    if(useDaily)persistDaily();
    staggerReveal(guess,()=>{
      if(guess===target||guesses.length===6){
        const won=guess===target;
        gs.setOutcome(won?'won':'lost');
        if(typeof recordGameResult==='function')recordGameResult('wordguess',won);
        if(typeof gameFeedback==='function')gameFeedback(won?'win':'lose');
        if(useDaily)finishDailyIfNeeded(won);
        else gameOver=true;
        if(useDaily&&won&&typeof setGamePB==='function') setGamePB('wordguess', guesses.length);
      }else if(useDaily){
        persistDaily();
      }
    });
    return;
  } else if(/^[A-Z]$/.test(k)&&currentGuess.length<5){
    currentGuess+=k;
    try{if(typeof haptic==='function')haptic('light');}catch(e){}
  }
  render();
}

document.addEventListener('keydown',kbHandler);
render();
// Re-opening a finished Daily: keep result surface (already gameOver)
if(restoredFinished&&typeof gs.setOutcome==='function'){
  try{gs.setOutcome(guesses[guesses.length-1]===target?'won':'lost');}catch(e){}
}
}


// openGamePicker is provided by game-registry.js

// --- Game registry self-registration (engines.js) ---
if (typeof registerGame === 'function') {
  registerGame({
    id: 'chess',
    name: 'Chess',
    desc: 'Bots, Live and Daily games',
    icon: '♟',
    ratingKey: 'chess',
    gameType: 'dual',
    liveDuel: true,
    genre: 'board',
    chat1v1: true,
    selfChat: true,
    order: 10,
    meta: {
      phaseA: 'Laws of Chess rules core (chess-core.js) — claims, auto draws, flag vs insufficient material, Chess960',
      phaseB: 'Server-authoritative Live + Daily (server-lib/chess-engine.js), bucket ratings',
      phaseC: 'Own engine in a Web Worker — 8 bot levels, review, coach, ECO names',
      complete: true,
    },
    launch(ctx) { openChessGame(typeof chatFromLaunch === 'function' ? chatFromLaunch(ctx) : ctx.chat); },
  });
  registerGame({
    id: 'wordguess',
    name: 'Shabd Five',
    desc: '5-letter Daily · Practice · Hard Mode · Solo',
    icon: '📝',
    ratingKey: 'wordguess',
    gameType: 'solo',
    genre: 'words',
    solo: true,
    chat1v1: true,
    selfChat: true,
    order: 60,
    meta: { graduated: true, phase: 1 },
    launch(ctx) { openWordGuess(ctx.chat); },
  });
}

window.startChessGame = startChessGame;
