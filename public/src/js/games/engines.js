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

// ===================== OH NO! CARDS ENGINE (Classic, Double Sided, Blaze Mode) =====================
function openUnoGame(chat, variant='normal', opts){
  if(!chat||!chat.name)chat=Object.assign({id:'ai'},chat||{},{name:(chat&&chat.id&&chat.id!=='ai')?'Friend':'Practice AI'});
  const COLORS_UNO=['red','yellow','green','blue'];
  const COLOR_HEX={red:'#E74C3C',yellow:'#F1C40F',green:'#2ECC71',blue:'#3498DB',wild:'#2C3E50',black:'#1a1a2e'};
  const NUMBER_CARDS=[0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9];
  const ACTION_CARDS=['skip','skip','reverse','reverse','draw2','draw2'];
  const FLIP_DARK_ACTIONS=['skip_all','draw_all_5','wild_dark'];
  const HOUSE_DEFAULTS={stackDraw2:false,challengeDraw4:true,catchOhNo:true};
  const DIFF_LABELS={easy:'Easy',medium:'Medium',hard:'Hard'};
  const launchCtx=(typeof window!=='undefined'&&window.__dangalLaunchCtx)||{};
  const liveOn=typeof DangalLive!=='undefined'&&DangalLive.isLive(chat,launchCtx);
  const liveRoles=liveOn&&DangalLive.roles?DangalLive.roles(chat,launchCtx):null;
  let gameVariant=variant==='normal'?'classic':variant;
  if(liveOn){
    const lv=launchCtx.unoVariant||launchCtx.variant||(opts&&opts.variant);
    if(lv&&['classic','blaze','doublesided','normal'].includes(lv))gameVariant=lv==='normal'?'classic':lv;
  }
  variant=gameVariant;
  let isClassicRules=variant==='classic'||variant==='normal';
  const storedHouse=(()=>{
    try{
      const raw=localStorage.getItem('chaupaal_uno_house');
      if(!raw)return HOUSE_DEFAULTS;
      return Object.assign({},HOUSE_DEFAULTS,JSON.parse(raw));
    }catch(e){return HOUSE_DEFAULTS;}
  })();
  // House rules are Classic-only; Blaze/Flip use built-in chaos rules
  const house=isClassicRules
    ?Object.assign({},HOUSE_DEFAULTS,storedHouse,(opts&&opts.house)||{},(liveOn&&launchCtx.unoHouse&&typeof launchCtx.unoHouse==='object')?launchCtx.unoHouse:{})
    :{stackDraw2:false,challengeDraw4:false,catchOhNo:false};
  const storedDiff=(()=>{
    try{return localStorage.getItem('chaupaal_uno_diff')||'medium';}catch(e){return'medium';}
  })();
  const difficulty=liveOn?'medium':((opts&&opts.difficulty)||storedDiff);
  const diffKey=DIFF_LABELS[difficulty]?difficulty:'medium';
  const aiDelay=diffKey==='easy'?850:diffKey==='hard'?420:600;
  let liveStake=liveOn?Math.max(0,Number((opts&&opts.stake)??launchCtx.stake)||0):0;
  if(!liveOn)liveStake=0;
  const settleMatchId=String((chat&&chat.dangalMatchId)||launchCtx.matchId||'').trim();
  const settleOppUid=
    (liveRoles&&liveRoles.opp)||
    launchCtx.opponentUid||
    (typeof opponentUidFromChat==='function'?opponentUidFromChat(chat):'')||
    '';
  try{
    window.__dangalLaunchCtx=Object.assign({},launchCtx,{
      gameId:'uno',gameType:'uno',
      stake:liveOn?liveStake:0,
      unoVariant:variant,
      unoHouse:isClassicRules?Object.assign({},house):undefined,
      matchId:settleMatchId||launchCtx.matchId||'',
      opponentUid:settleOppUid||launchCtx.opponentUid||'',
    });
    if(liveOn)window.__dangalLaunchCtx.mode='live';
  }catch(e){}
  let liveHandle=null;let applyingLive=false;let leaveConfirmed=false;
  let liveSeq=0;let resultsShown=false;let presenceHint='';
  let sessionRecorded=false;let settleDone=false;
  function modeSubNow(){
    const vl=variant==='doublesided'?'Flip':variant==='blaze'?'Blaze':'Classic';
    if(liveOn){
      const stakeBit=liveStake>0?` · Stake ⚡${liveStake}`:' · Friendly';
      const base=(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel)
        ?DangalLive.modeChromeLabel(true)+' · '+vl
        :('Live 1v1 · '+vl);
      return base+stakeBit;
    }
    return'Practice vs AI · '+vl+' · '+DIFF_LABELS[diffKey];
  }
  function variantLabelNow(){
    return variant==='doublesided'?'Flip':variant==='blaze'?'Blaze':'Classic';
  }
  const MODE_SUB=modeSubNow();

  function noteUnoSession(won){
    if(sessionRecorded)return;
    sessionRecorded=true;
    if(typeof recordDuelStreak==='function'&&liveOn)recordDuelStreak(chat.id||chat.name,!!won,false);
    if(typeof recordGameResult==='function'){
      recordGameResult('uno',!!won,false,{
        variant,difficulty:diffKey,stake:liveStake,
        mode:liveOn?'live':'practice',live:!!liveOn,
      });
    }else if(typeof recordDangalSession==='function'){
      recordDangalSession('uno',{
        won:!!won,variant,difficulty:diffKey,
        mode:liveOn?'live':'practice',stake:liveStake,live:!!liveOn,
      });
    }
  }

  function paintUnoSettle(settle){
    const el=overlay.querySelector('#unoChipDelta');
    if(!el||!settle||settle.error)return;
    const delta=Number(settle.chipDelta);
    const bal=settle.chips!=null?Number(settle.chips):null;
    const parts=[];
    if(Number.isFinite(delta)&&(delta!==0||liveStake>0)){
      parts.push(delta===0?`Virtual chips · balance ${bal!=null?bal:'—'}`:`Virtual chips ${delta>0?'+':''}${delta}${bal!=null?` · balance ${bal}`:''}`);
    }
    if(!parts.length&&liveOn)parts.push('Settled · virtual chips only — not real money');
    if(!parts.length)return;
    el.hidden=false;
    el.textContent=parts.join(' · ')+' · not real money';
  }

  async function settleUnoOnce(won){
    if(!liveOn||settleDone||!window.DangalEconomy||typeof DangalEconomy.reportGameEnd!=='function'||!settleMatchId)return null;
    settleDone=true;
    try{
      const me=typeof getCurrentUid==='function'?getCurrentUid():'';
      const opp=settleOppUid||(liveRoles&&liveRoles.opp)||'';
      const settle=await DangalEconomy.reportGameEnd({
        gameType:'uno',
        result:won?'win':'loss',
        won:!!won,
        isDraw:false,
        matchId:settleMatchId,
        sessionId:settleMatchId,
        opponentUid:opp,
        stake:liveStake,
        winnerUid:won?me:opp,
        variant,
      });
      if(settle&&settle.error){
        settleDone=false;
        const el=overlay.querySelector('#unoChipDelta');
        if(el){
          el.hidden=false;
          el.innerHTML=`Couldn’t update chips <button type="button" id="unoChipRetry" class="game-tap-target" style="margin-left:8px;">Retry</button>`;
          el.querySelector('#unoChipRetry')?.addEventListener('click',()=>{settleUnoOnce(won);});
        }
        if(typeof showToast==='function')showToast('Couldn’t update chips — tap Retry');
        return settle;
      }
      paintUnoSettle(settle);
      return settle;
    }catch(e){
      settleDone=false;
      if(typeof showToast==='function')showToast('Couldn’t update chips — try Retry');
      return null;
    }
  }

  async function tearDownUnoLive(){
    leaveConfirmed=true;
    try{if(liveHandle)await liveHandle.leave({forfeit:false});}catch(e){
      try{if(liveHandle)liveHandle.leave();}catch(e2){}
    }
    liveHandle=null;
  }

  async function startUnoLiveRematch(nextStake){
    const oppUid=settleOppUid||(liveRoles&&liveRoles.opp)||launchCtx.opponentUid||'';
    const chatId=
      (window.__dangalLaunchCtx&&window.__dangalLaunchCtx.chatId)||
      (window.currentOpenChat&&(window.currentOpenChat.firestoreId||window.currentOpenChat.id))||
      (chat&&(chat.firestoreId||chat.id))||
      '';
    const houseSnap=isClassicRules?Object.assign({},house):undefined;
    if(!oppUid||(typeof isPersistableUid==='function'&&!isPersistableUid(oppUid))){
      if(typeof showToast==='function')showToast('Opponent left — challenge them again from friends');
      if(typeof openFriendPickerSheet==='function'){
        const f=await openFriendPickerSheet({title:'Challenge · Oh, No!',subtitle:'Live 1v1 · virtual chips only — not real money'});
        if(f){
          await tearDownUnoLive();
          gs.close();
          const uid=f.uid||f.id||'';
          const mid=typeof dangalMatchId==='function'?dangalMatchId('uno',{name:f.name,opponentUid:uid}):('uno_'+Date.now());
          const fid=f.chatId||f.firestoreId||'';
          window.__dangalLaunchCtx=Object.assign({},window.__dangalLaunchCtx||{},{
            gameId:'uno',gameType:'uno',mode:'live',matchId:mid,opponentUid:uid,stake:nextStake,
            unoVariant:variant,unoHouse:houseSnap,chatId:fid,source:'challenge_host',startedAt:Date.now(),
          });
          if(typeof sendChallengeCard==='function'&&fid){
            try{await sendChallengeCard(uid,'uno',{chatId:fid,matchId:mid,stake:nextStake,unoVariant:variant,unoHouse:houseSnap,mode:'live'});}catch(e){}
          }
          openUnoGame({name:f.name,id:uid,uid,peerUid:uid,dangalMatchId:mid},variant,{house:houseSnap,stake:nextStake});
        }
      }
      return;
    }
    const rematchId=typeof dangalMatchId==='function'
      ?dangalMatchId('uno',{name:chat.name||'Friend',opponentUid:oppUid})
      :('uno_'+Date.now());
    await tearDownUnoLive();
    window.__dangalLaunchCtx=Object.assign({},window.__dangalLaunchCtx||{},{
      gameId:'uno',gameType:'uno',mode:'live',matchId:rematchId,
      opponentUid:oppUid,stake:nextStake,unoVariant:variant,unoHouse:houseSnap,
      chatId,source:'challenge_host',startedAt:Date.now(),
    });
    if(typeof sendChallengeCard==='function'&&oppUid&&chatId){
      try{
        await sendChallengeCard(oppUid,'uno',{
          chatId,matchId:rematchId,stake:nextStake,
          unoVariant:variant,variant,unoHouse:houseSnap,mode:'live',
        });
        if(typeof showToast==='function')showToast('Rematch sent — they Accept to join');
      }catch(e){}
    }else if(typeof showToast==='function'){
      showToast('Rematch ready — ask your friend to join from Baithak');
    }
    gs.close();
    openUnoGame({
      name:chat.name||'Friend',id:oppUid,uid:oppUid,peerUid:oppUid,
      dangalMatchId:rematchId,dangalSource:'challenge_host',
    },variant,{house:houseSnap,stake:nextStake});
  }

  function buildDeck(variant){
    const deck=[];
    COLORS_UNO.forEach(color=>{
      NUMBER_CARDS.forEach(n=>deck.push({color,value:String(n),type:'number'}));
      ACTION_CARDS.forEach(a=>deck.push({color,value:a,type:'action'}));
    });
    // Wild cards
    for(let i=0;i<4;i++)deck.push({color:'wild',value:'wild',type:'wild'});
    for(let i=0;i<4;i++)deck.push({color:'wild',value:'wild_draw4',type:'wild'});
    // Blaze Mode: add more draw cards
    if(variant==='blaze'){
      for(let i=0;i<4;i++)deck.push({color:'wild',value:'wild_draw6',type:'wild'});
      COLORS_UNO.forEach(color=>{deck.push({color,value:'draw4',type:'action'});deck.push({color,value:'draw4',type:'action'});});
    }
    // Flip: add dark side cards
    if(variant==='doublesided'){
      COLORS_UNO.forEach(color=>{FLIP_DARK_ACTIONS.forEach(a=>deck.push({color,value:a,type:'flip_action'}));});
      for(let i=0;i<4;i++)deck.push({color:'black',value:'flip',type:'flip'});
    }
    return deck;
  }

  function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}

  const isLiveHost=!liveRoles||liveRoles.myColor==='w';
  let deck=[];let discardPile=[];let hands={me:[],opp:[]};let currentColor='';let currentValue='';
  let myTurn=isLiveHost;let direction=1;let drawStack=0;let drawStackType='';let flipped=false;
  let message='';let gameOver=false;let selectedCard=null;let pickingColor=false;
  let unoCallWindow=false;
  let pendingOhNoFor='';let drewPlayableIndex=-1;
  let pendingChallenge=null;

  if(!liveOn||isLiveHost){
    deck=shuffle(buildDeck(variant));
    for(let i=0;i<7;i++){hands.me.push(deck.pop());hands.opp.push(deck.pop());}
    let firstCard=deck.pop();
    // Start with a plain number when possible (avoid wild / flip / dark openers)
    let guard=0;
    while(firstCard&&(firstCard.type==='wild'||firstCard.type==='flip'||firstCard.type==='flip_action'||firstCard.value==='flip')&&guard++<20){
      deck.unshift(firstCard);firstCard=deck.pop();
    }
    if(firstCard){discardPile.push(firstCard);currentColor=firstCard.color;currentValue=firstCard.value;}
  }

  const NAMES=['You',chat.name];
  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;';
  const gs=beginGameOverlaySession({
    type:'uno',title:'Oh, No! Cards',mode:liveOn?'live':'practice',chat,overlay,
    cleanup(){
      if(liveHandle&&!leaveConfirmed){
        try{liveHandle.leave({forfeit:!gameOver});}catch(e){try{liveHandle.leave();}catch(e2){}}
      }
    },
  });
  if(!gs.alive())return;

  async function askUnoLeave(){
    if(gameOver){gs.close();return;}
    if(typeof DangalLive!=='undefined'&&DangalLive.requestLeave){
      const ok=await DangalLive.requestLeave({
        liveHandle,isPlaying:!gameOver,title:'Leave Oh, No!?',body:'This run will end.',
        onLeave:()=>{leaveConfirmed=true;liveHandle=null;},
      });
      if(!ok)return;
    }else if(typeof confirmLeaveGame==='function'){
      const ok=await confirmLeaveGame({title:'Leave Oh, No!?',body:'This run will end.'});
      if(!ok)return;
    }
    gs.close();
  }

  function serializeUnoHands(){
    if(!liveRoles)return{handA:hands.me,handB:hands.opp};
    return liveRoles.myColor==='w'
      ?{handA:hands.me.slice(),handB:hands.opp.slice()}
      :{handA:hands.opp.slice(),handB:hands.me.slice()};
  }

  function applyUnoHands(handA,handB){
    if(!liveRoles||liveRoles.myColor==='w'){hands.me=(handA||[]).slice();hands.opp=(handB||[]).slice();}
    else{hands.me=(handB||[]).slice();hands.opp=(handA||[]).slice();}
  }

  function serializePendingChallenge(){
    if(!pendingChallenge||!liveRoles)return null;
    return{
      offenderUid:pendingChallenge.offender==='me'?liveRoles.me:liveRoles.opp,
      victimUid:pendingChallenge.victim==='me'?liveRoles.me:liveRoles.opp,
      priorColor:pendingChallenge.priorColor||'',
      illegal:!!pendingChallenge.illegal,
    };
  }

  function applyPendingChallenge(raw){
    if(!raw||!liveRoles){pendingChallenge=null;return;}
    pendingChallenge={
      offender:raw.offenderUid===liveRoles.me?'me':'opp',
      victim:raw.victimUid===liveRoles.me?'me':'opp',
      priorColor:raw.priorColor||'',
      illegal:!!raw.illegal,
    };
  }

  function buildUnoState(){
    const hs=serializeUnoHands();
    const top=discardPile[discardPile.length-1]||null;
    return{
      dealt:true,
      deck:deck.slice(),
      deckCount:deck.length,
      discardPile:discardPile.slice(),
      discardTop:top,
      handA:hs.handA,
      handB:hs.handB,
      currentColor,currentValue,
      drawStack,drawStackType,
      direction,flipped,message,
      gameOver,variant,house,
      pendingChallenge:serializePendingChallenge(),
      unoCallNeeded:pendingOhNoFor==='me'?liveRoles&&liveRoles.me:(pendingOhNoFor==='opp'?liveRoles&&liveRoles.opp:null),
      unoSafe:pendingOhNoFor?'':(liveRoles&&hands.me.length===1?liveRoles.me:null),
    };
  }

  function pushUno(){
    if(!liveOn||!liveHandle||!liveRoles||applyingLive)return;
    const winnerUid=gameOver
      ?(hands.me.length===0?liveRoles.me:(hands.opp.length===0?liveRoles.opp:null))
      :null;
    liveHandle.push({
      baseVersion:liveSeq,
      state:buildUnoState(),
      turn:gameOver?null:(myTurn?liveRoles.me:liveRoles.opp),
      status:gameOver?'over':'playing',
      winner:winnerUid,
    });
    if(!gameOver&&!myTurn&&typeof DangalLive!=='undefined'&&DangalLive.pingTurn){
      DangalLive.pingTurn(liveRoles.opp,'uno',{chatId:chat&&(chat.firestoreId||chat.id)});
    }
  }

  function drawCard(who,count=1){
    for(let i=0;i<count;i++){
      if(!deck.length){deck=shuffle(discardPile.slice(0,-1));discardPile=[discardPile[discardPile.length-1]];}
      if(deck.length)hands[who].push(deck.pop());
    }
  }

  function needsColorPick(card){
    if(!card)return false;
    return card.type==='wild'||card.value==='wild'||card.value==='wild_draw4'||card.value==='wild_draw6'||card.value==='wild_dark';
  }

  function canPlay(card){
    if(!card)return false;
    if(drawStack>0&&isClassicRules){
      if(house.stackDraw2&&drawStackType==='draw2')return card.value==='draw2';
      return false;
    }
    // Flip: dark actions only while Dark side is up; Flip card always legal
    if(variant==='doublesided'){
      if(card.type==='flip'||card.value==='flip')return true;
      if(card.type==='flip_action'){
        if(!flipped)return false;
        if(card.value==='wild_dark')return true;
        return card.color===currentColor||card.value===currentValue;
      }
    }
    if(card.type==='wild'||card.value==='wild'||card.value==='wild_draw4'||card.value==='wild_draw6')return true;
    // Blaze coloured +4: match colour or another +4 — not a free play
    if(variant==='blaze'&&card.value==='draw4'){
      return card.color===currentColor||currentValue==='draw4'||currentValue==='wild_draw4'||currentValue==='wild_draw6';
    }
    if(card.color===currentColor)return true;
    if(card.value===currentValue)return true;
    return false;
  }

  function scheduleOhNoCatch(who){
    if(who!=='me')return;
    gs.schedule(()=>{
      if(!gs.alive()||gameOver||pendingOhNoFor!=='me')return;
      unoCallWindow=false;
      if(house.catchOhNo&&hands.me.length===1){
        drawCard('me',2);
        pendingOhNoFor='';
        drewPlayableIndex=-1;
        message='Caught! Draw 2 for missing Oh No!';
        if(liveOn&&!applyingLive)pushUno();
      }else{
        pendingOhNoFor='';
        message='';
      }
      render();
    },2500);
  }

  function applyCard(card,who,chosenColor){
    if(typeof gameFeedback==='function')gameFeedback(who==='me'?'card':'place');
    const prevColor=currentColor;
    discardPile.push(card);
    if(needsColorPick(card))currentColor=chosenColor||'red';
    else if(card.color==='black'||card.type==='flip'){/* keep colour on Flip */}
    else currentColor=card.color;
    currentValue=card.value;
    const opp=who==='me'?'opp':'me';
    pendingChallenge=null;
    drewPlayableIndex=-1;
    switch(card.value){
      case 'skip':
        myTurn=who==='me';
        message=`${who==='me'?chat.name:NAMES[0]} skipped!`;
        break;
      case 'reverse':
        direction*=-1;
        // 2p: Reverse keeps the turn (acts like Skip). Blaze same — snappy reverse.
        myTurn=who==='me';
        message=variant==='blaze'?'⚡ Reverse — play again!':'Direction reversed!';
        break;
      case 'draw2':
        if(variant==='blaze'){
          drawCard(opp,2);
          message=`+2! ${opp==='me'?'You':chat.name} draws 2`;
          myTurn=who!=='me';
        }else{
          drawStack+=2;drawStackType='draw2';
          message=house.stackDraw2?`Stacked +2 pending ${drawStack}`:`+2! ${opp==='me'?'You':chat.name} must draw 2`;
          myTurn=who!=='me';
        }
        break;
      case 'draw4':
        // Blaze coloured +4 — instant draw, no challenge
        drawCard(opp,4);
        message=`Blaze +4! ${opp==='me'?'You':chat.name} draws 4`;
        myTurn=who!=='me';
        break;
      case 'wild_draw4':
        if(variant==='blaze'){
          drawCard(opp,4);
          message=`+4! ${opp==='me'?'You':chat.name} draws 4 · colour ${currentColor}`;
          myTurn=who!=='me';
        }else{
          drawStack+=4;drawStackType='wild_draw4';
          message=house.challengeDraw4&&opp==='me'
            ?`Wild +4! Challenge or draw 4`
            :`+4! ${opp==='me'?'You':chat.name} must draw 4`;
          if(house.challengeDraw4){
            // illegal = offender still held a card of the previous discard colour
            pendingChallenge={
              offender:who,victim:opp,priorColor:prevColor,
              illegal:!!hands[who].some(c=>c&&c.color===prevColor),
            };
          }
          myTurn=who!=='me';
        }
        break;
      case 'wild_draw6':
        drawCard(opp,6);
        message=`💀 Blaze +6! ${opp==='me'?'You':chat.name} draws 6 · colour ${currentColor}`;
        myTurn=who!=='me';
        break;
      case 'draw_all_5':
        drawCard(opp,5);
        message=`Dark +5! ${opp==='me'?'You':chat.name} draws 5`;
        myTurn=who!=='me';
        break;
      case 'wild_dark':
        message=`Dark wild · colour ${currentColor}`;
        myTurn=who!=='me';
        break;
      case 'skip_all':
        // 2p: same as Skip — you play again
        myTurn=who==='me';
        message='Skip all! Play again!';
        break;
      case 'flip':
        flipped=!flipped;
        message=`Deck flipped! ${flipped?'Dark side':'Light side'}`;
        myTurn=who!=='me';
        break;
      case 'wild':
        message=`Wild · colour ${currentColor}`;
        myTurn=who!=='me';
        break;
      default:
        myTurn=who!=='me';
    }
    // Oh No! call window
    if(hands[who].length===1){
      const aiCalls=!liveOn&&who==='opp'&&(diffKey!=='easy'||Math.random()<0.35);
      unoCallWindow=true;
      pendingOhNoFor=who;
      if(who==='opp'&&(liveOn||aiCalls)){
        // Live peer must call themselves; Practice AI usually auto-calls
        if(liveOn){
          message=`${chat.name} is at 1 card…`;
        }else{
          pendingOhNoFor='';
          message=`${chat.name} shouts 'Oh, No!'`;
          gs.schedule(()=>{unoCallWindow=false;render();},1800);
        }
      }else if(who==='opp'){
        message=`${chat.name} is at 1 card…`;
        gs.schedule(()=>{
          if(!gs.alive()||gameOver||pendingOhNoFor!=='opp')return;
          unoCallWindow=false;
          if(house.catchOhNo&&hands.opp.length===1){
            drawCard('opp',2);
            pendingOhNoFor='';
            message='Caught! AI missed Oh No — draws 2';
            if(liveOn)pushUno();
          }else{
            pendingOhNoFor='';
            message='';
          }
          render();
        },2500);
      }else{
        message="You're at 1 card — shout 'Oh No!'";
        scheduleOhNoCatch('me');
      }
    }
    if(hands[who].length===0){
      gameOver=true;
      const won=who==='me';
      message=(won?'You win!':chat.name+' wins!')+' Oh, No!';
      gs.setOutcome(won?'won':'lost');
    }
    if(liveOn&&who==='me'&&!applyingLive)pushUno();
  }

  function clearDrawStack(){
    drawStack=0;
    drawStackType='';
  }

  function houseRulesSummary(){
    if(!isClassicRules)return'';
    const bits=[];
    if(house.stackDraw2)bits.push('Stack +2');
    if(house.challengeDraw4)bits.push('Challenge +4');
    if(house.catchOhNo)bits.push('Catch Oh No');
    return bits.join(' · ');
  }

  function resolveChallenge(challenger){
    if(!pendingChallenge||pendingChallenge.victim!==challenger||gameOver)return false;
    const offender=pendingChallenge.offender;
    const success=!!pendingChallenge.illegal;
    if(success){
      drawCard(offender,4);
      message=`Challenge won — ${offender==='me'?'you draw 4':chat.name+' draws 4'}`;
      myTurn=challenger==='me';
    }else{
      drawCard(challenger,6);
      message=`Challenge failed — ${challenger==='me'?'you draw 6':chat.name+' draws 6'}`;
      myTurn=challenger!=='me';
    }
    clearDrawStack();
    pendingChallenge=null;
    selectedCard=null;
    pickingColor=false;
    if(liveOn&&!applyingLive)pushUno();
    render();
    if(!gameOver&&!myTurn&&!liveOn)gs.schedule(aiPlayUno,aiDelay);
    return true;
  }

  function cardBg(card){
    if(card.value==='wild_draw6')return'linear-gradient(135deg,#8e0000,#c0392b,#f39c12)';
    if(card.value==='wild_dark')return'linear-gradient(135deg,#0d0d1a,#2C3E50,#4a148c)';
    if(card.type==='wild'||card.color==='wild')return'linear-gradient(135deg,#E74C3C,#F1C40F,#2ECC71,#3498DB)';
    if(card.color==='black'||card.type==='flip')return flipped?'#0a0a14':'#2C3E50';
    if(card.type==='flip_action')return flipped
      ?`linear-gradient(160deg,#0d0d1a,${COLOR_HEX[card.color]||'#333'})`
      :(COLOR_HEX[card.color]||'#666');
    return COLOR_HEX[card.color]||'#666';
  }

  function cardLabel(card){
    const labels={
      skip:'SKIP',reverse:'REV',draw2:'+2',wild:'WILD',wild_draw4:'+4',
      wild_draw6:'+6',skip_all:'SKIP*',draw_all_5:'+5*',wild_dark:'DARK',
      flip:'FLIP',draw4:'+4',
    };
    return labels[card.value]||card.value;
  }

  function renderCard(card,small=false,selected=false,playable=false){
    if(!card)return'';
    const colorName=card.type==='wild'||card.color==='wild'||card.value==='wild_dark'?'wild':(card.color||'');
    const isDarkFace=variant==='doublesided'&&(flipped||card.type==='flip_action'||card.type==='flip');
    const pattern=colorName&&colorName!=='wild'&&!isDarkFace?` background-image:repeating-linear-gradient(${colorName==='red'||colorName==='yellow'?'45deg':'-45deg'},transparent,transparent 3px,rgba(255,255,255,0.18) 3px,rgba(255,255,255,0.18) 4px);`:'';
    const darkRing=isDarkFace?'box-shadow:inset 0 0 0 2px rgba(180,140,255,0.45);':'';
    return `<div class="uno-card${isDarkFace?' uno-card--dark':''}${variant==='blaze'&&(card.value==='wild_draw6'||card.value==='draw4')?' uno-card--blaze':''}" role="img" aria-label="${colorName} ${cardLabel(card)}" style="width:${small?'36px':'52px'};height:${small?'52px':'76px'};min-width:${small?36:44}px;background:${cardBg(card)};${pattern}${darkRing}border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:${small?'10px':'14px'};color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.5);border:${selected?'3px solid white':playable?'2px solid rgba(255,255,255,0.6)':'2px solid rgba(0,0,0,0.2)'};cursor:${playable?'pointer':'default'};flex-shrink:0;transform:${selected?'translateY(-10px)':'none'};transition:transform var(--duration-fast,150ms) var(--ease-spring,cubic-bezier(0.34,1.56,0.64,1));box-shadow:${selected?'0 4px 12px rgba(0,0,0,0.5)':''}"><span>${cardLabel(card)}</span>${!small&&colorName&&colorName!=='wild'?`<span style="font-size:8px;letter-spacing:0.04em;opacity:0.9;text-transform:uppercase;">${colorName.slice(0,1)}</span>`:''}</div>`;
  }

  function flyCardToDiscard(fromEl,card,done){
    if(!fromEl||!gs.alive()){if(done)done();return;}
    const discard=overlay.querySelector('#unoDiscard');
    if(!discard){if(done)done();return;}
    const a=fromEl.getBoundingClientRect();
    const b=discard.getBoundingClientRect();
    const ghost=document.createElement('div');
    ghost.innerHTML=renderCard(card,false,false,false);
    ghost.style.cssText=`position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;z-index:200;pointer-events:none;transition:left .28s cubic-bezier(.34,1.2,.64,1),top .28s cubic-bezier(.34,1.2,.64,1),transform .28s ease,opacity .28s ease;`;
    document.body.appendChild(ghost);
    fromEl.style.opacity='0';
    requestAnimationFrame(()=>{
      ghost.style.left=b.left+'px';
      ghost.style.top=b.top+'px';
      ghost.style.transform='scale(1.05) rotate(8deg)';
    });
    gs.schedule(()=>{ghost.remove();if(done)done();},300);
  }

  function fanHandHtml(){
    const n=hands.me.length||1;
    const spread=Math.min(42,200/n);
    return hands.me.map((card,i)=>{
      const playable=myTurn&&!pickingColor&&canPlay(card);
      const mid=(n-1)/2;
      const rot=(i-mid)*spread*0.07;
      const y=Math.abs(i-mid)*1.8;
      const liftY=selectedCard===i?-16:(playable?-4:y);
      return `<div data-i="${i}" class="uno-hand-card${playable?' uno-hand-card--playable':''}" style="transform:rotate(${rot}deg) translateY(${liftY}px);scroll-snap-align:center;">${renderCard(card,false,selectedCard===i,playable)}</div>`;
    }).join('');
  }

  function render(){
    const bgColor=flipped?'#2C3E50':'#1a1a2e';
    const topCard=discardPile[discardPile.length-1];
    overlay.style.background=bgColor;
    if(liveOn&&!topCard&&!gameOver){
      overlay.innerHTML=`
        ${gameChromeHtml({title:'Oh, No!',subtitle:modeSubNow()+(presenceHint?' · '+presenceHint:''),backId:'unoBack'})}
        <div style="flex:1;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);font-weight:700;">Waiting for deal…</div>`;
      document.getElementById('unoBack')?.addEventListener('click',()=>{askUnoLeave();});
      return;
    }
    if(gameOver&&typeof gameResultHtml==='function'){
      const wonFinal=hands.me.length===0||/you win/i.test(String(message||''));
      if(!resultsShown){
        resultsShown=true;
        noteUnoSession(wonFinal);
      }
      const rulesBit=houseRulesSummary();
      const stakeLine=liveOn?(liveStake>0?`⚡${liveStake} virtual`:'Friendly'):'';
      const modeBit=liveOn?'Live':DIFF_LABELS[diffKey];
      const shareStats={
        scoreLine:wonFinal?'Win':'Loss',
        vs:`vs ${chat.name}`,
        meta:`${variantLabelNow()} · ${modeBit}${rulesBit?` · ${rulesBit}`:''}${stakeLine?` · ${stakeLine}`:''}`,
        mode:liveOn?'live':'practice',
        variant,
        stake:liveStake,
        text:`Chaupaal Oh, No! (${variantLabelNow()}): ${wonFinal?'I won':'tough loss'} vs ${chat.name}${liveOn?(liveStake>0?` · Stake ⚡${liveStake} (virtual chips)`:' · Friendly Live'):` · Practice · ${DIFF_LABELS[diffKey]}`} · not real money`,
      };
      const chatId=
        (window.__dangalLaunchCtx&&window.__dangalLaunchCtx.chatId)||
        (window.currentOpenChat&&(window.currentOpenChat.firestoreId||window.currentOpenChat.id))||
        (chat&&(chat.firestoreId||chat.id))||
        '';
      const actions=[{label:liveOn?'Rematch':'Play again',primary:true,id:'again'}];
      if(typeof shareGameResult==='function')actions.push({label:'Share',primary:false,id:'share'});
      if(typeof openFriendPickerSheet==='function')actions.push({label:'Challenge friend',primary:false,id:'challenge'});
      if(typeof postGameScoreStory==='function')actions.push({label:'Post to story',primary:false,id:'story'});
      if(chatId&&typeof openChatScreen==='function')actions.push({label:'Chat',primary:false,id:'chat'});
      const stakeSub=liveOn?(liveStake>0?` · Stake ⚡${liveStake} (virtual)`:' · Friendly'):'';
      overlay.innerHTML=`
        ${gameChromeHtml({title:'Oh, No!',subtitle:modeSubNow()+' · Game over',backId:'unoBack'})}
        <div class="uno-result-mount">${gameResultHtml({
          gameId:'uno',
          glyph:wonFinal?'✓':'·',
          title:wonFinal?'You win':`${chat.name} wins`,
          subtitle:`${variantLabelNow()} · ${liveOn?'Live 1v1':DIFF_LABELS[diffKey]}${rulesBit?` · ${rulesBit}`:''}${stakeSub}${message?` · ${message}`:''}`,
          shareCardHtml:typeof buildGameShareCard==='function'?buildGameShareCard('uno',shareStats):'',
          actions,
        })}<div id="unoChipDelta" class="uno-chip-delta" hidden style="margin-top:8px;font-size:12px;color:rgba(255,255,255,.75);text-align:center;"></div></div>`;
      document.getElementById('unoBack')?.addEventListener('click',()=>{askUnoLeave();});
      settleUnoOnce(wonFinal);
      if(typeof wireGameResultActions==='function'){
        wireGameResultActions(overlay,{
          again:async()=>{
            if(liveOn){
              let nextStake=liveStake;
              if(typeof stakesEnabledForGame==='function'&&stakesEnabledForGame('uno')&&typeof openDangalStakeSheet==='function'){
                const picked=await openDangalStakeSheet('uno',{defaultStake:liveStake});
                if(picked==null)return;
                nextStake=picked;
              }
              await startUnoLiveRematch(nextStake);
              return;
            }
            gs.close();
            openUnoGame(
              typeof practiceAiChat==='function'?practiceAiChat():{name:'Practice AI',id:'ai'},
              variant,
              {house:isClassicRules?Object.assign({},house):undefined,difficulty:diffKey}
            );
          },
          share:()=>{
            if(typeof shareGameResult==='function')shareGameResult('uno',shareStats);
            else if(typeof openUnifiedShareSheet==='function')openUnifiedShareSheet({gameId:'uno',stats:shareStats});
          },
          challenge:async()=>{
            if(typeof openFriendPickerSheet!=='function')return;
            const f=await openFriendPickerSheet({
              title:'Challenge · Oh, No!',
              subtitle:'Live 1v1 · virtual chips only — not real money',
            });
            if(!f)return;
            const uid=f.uid||f.id||'';
            if(!uid||(typeof isPersistableUid==='function'&&!isPersistableUid(uid))){
              if(typeof showToast==='function')showToast('Pick a real friend to challenge');
              return;
            }
            let stakePick=0;
            if(typeof stakesEnabledForGame==='function'&&stakesEnabledForGame('uno')&&typeof openDangalStakeSheet==='function'){
              const picked=await openDangalStakeSheet('uno',{defaultStake:0});
              if(picked==null)return;
              stakePick=picked;
            }
            const mid=typeof dangalMatchId==='function'?dangalMatchId('uno',{name:f.name,opponentUid:uid}):('uno_'+Date.now());
            const fid=f.chatId||f.firestoreId||'';
            const houseSnap=isClassicRules?Object.assign({},house):undefined;
            try{
              window.__dangalLaunchCtx=Object.assign({},window.__dangalLaunchCtx||{},{
                gameId:'uno',gameType:'uno',mode:'live',matchId:mid,opponentUid:uid,stake:stakePick,
                unoVariant:variant,unoHouse:houseSnap,chatId:fid,source:'challenge_host',startedAt:Date.now(),
              });
            }catch(e){}
            if(typeof sendChallengeCard==='function'&&fid){
              try{await sendChallengeCard(uid,'uno',{chatId:fid,matchId:mid,stake:stakePick,unoVariant:variant,unoHouse:houseSnap,mode:'live'});}catch(e){}
            }
            if(liveOn)await tearDownUnoLive();
            gs.close();
            openUnoGame({name:f.name,id:uid,uid,peerUid:uid,dangalMatchId:mid},variant,{house:houseSnap,stake:stakePick});
          },
          story:()=>{if(typeof postGameScoreStory==='function')postGameScoreStory('uno',shareStats);},
          chat:()=>{
            gs.close();
            try{
              const thread=window.currentOpenChat||{firestoreId:chatId,id:chatId,name:chat.name||'Friend'};
              if(typeof openChatScreen==='function')openChatScreen(thread);
              else if(typeof showScreen==='function')showScreen('baithak');
              else if(typeof showToast==='function')showToast('Open Baithak to continue the chat');
            }catch(e){}
          },
        });
      }
      return;
    }
    const ohNoBtnStyle=unoCallWindow
      ?'background:var(--red,#E74C3C);color:#fff;border:2px solid rgba(255,255,255,0.4);animation:uno-pulse 0.6s ease-in-out infinite alternate;'
      :'';
    const flipChrome=variant==='doublesided'?(flipped?' · Dark':' · Light'):'';
    const tableTint=variant==='doublesided'&&flipped?'background:radial-gradient(ellipse at center,rgba(90,40,160,0.25),transparent 70%);':'';
    const presenceBit=presenceHint?' · '+presenceHint:'';
    overlay.innerHTML=`
      ${gameChromeHtml({title:'Oh, No!',subtitle:modeSubNow()+flipChrome+presenceBit,backId:'unoBack',rightHtml:`<button id="unoUnoBtn" class="game-chrome-action uno-ohno-btn${unoCallWindow?' is-active':''}" style="${ohNoBtnStyle}">Oh No!</button>`})}

      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;${tableTint}">

        <!-- Opponent hand -->
        <div style="padding:8px 12px 4px;flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.55);">${chat.name}</div>
            <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:1px 8px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);">${hands.opp.length} cards</div>
            ${houseRulesSummary()?`<div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:1px 8px;font-size:10px;font-weight:700;color:rgba(255,255,255,0.55);">${houseRulesSummary()}</div>`:''}
          </div>
          <div style="display:flex;justify-content:center;height:48px;overflow:hidden;">
            ${(()=>{const n=hands.opp.length;const maxShow=Math.min(n,14);const cards=[];for(let i=0;i<maxShow;i++){const mid=(maxShow-1)/2;const rot=(i-mid)*3.5;cards.push(`<div style="width:32px;height:46px;background:linear-gradient(150deg,#6c2bb3,#9b2335);border-radius:5px;border:1.5px solid rgba(255,255,255,0.18);flex-shrink:0;margin-right:-20px;transform:rotate(${rot}deg);box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`);}return cards.join('');})()}
          </div>
        </div>

        <!-- Table area: draw pile + discard -->
        <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:18px;padding:6px 10px;min-height:0;">
          <!-- Draw pile -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div id="deckBtn" class="game-tap-target" style="width:56px;height:82px;background:linear-gradient(150deg,#6c2bb3,#9b2335);border-radius:9px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:20px;cursor:${myTurn&&!pickingColor?'pointer':'default'};border:${myTurn&&!pickingColor&&!hands.me.some(canPlay)?'3px solid var(--gold,#FCC13B)':'2px solid rgba(255,255,255,0.22)'};box-shadow:${myTurn&&!pickingColor&&!hands.me.some(canPlay)?'0 0 12px rgba(252,193,59,0.5)':'0 3px 10px rgba(0,0,0,0.35)'};">
              🃏
              ${drawStack>0?`<span style="font-size:10px;font-weight:700;color:#fff;background:var(--red,#E74C3C);border-radius:6px;padding:0 4px;">${house.stackDraw2&&drawStackType==='draw2'?'Draw ':'+'}${drawStack}</span>`:''}
            </div>
            <div style="font-size:9px;color:rgba(255,255,255,0.35);">${drawStack>0?`Draw ${drawStack}`:`${deck.length} in deck`}</div>
          </div>
          <!-- Discard pile -->
          <div id="unoDiscard" style="display:flex;flex-direction:column;align-items:center;gap:5px;">
            ${renderCard(topCard,false,false,false)}
            <div style="display:flex;align-items:center;gap:5px;">
              <div style="width:12px;height:12px;border-radius:50%;background:${COLOR_HEX[currentColor]||'#666'};border:2px solid rgba(255,255,255,0.35);"></div>
              <div style="font-size:9px;color:rgba(255,255,255,0.45);font-weight:700;text-transform:capitalize;">${currentColor}</div>
            </div>
          </div>
        </div>

        <!-- Message / status line -->
        ${message?`<div class="uno-message" style="padding:6px 16px;text-align:center;font-weight:700;font-size:13px;flex-shrink:0;">${message}</div>`:''}

        ${pendingChallenge&&pendingChallenge.victim==='me'?`
        <div style="padding:8px 12px;flex-shrink:0;background:rgba(255,255,255,0.08);display:flex;gap:8px;justify-content:center;">
          <button id="unoChallengeBtn" type="button" class="game-tap-target uno-house-btn" style="min-height:44px;padding:0 16px;border-radius:12px;border:2px solid rgba(255,255,255,0.22);background:#fff;color:#1a1a2e;font-weight:800;">Challenge</button>
          <button id="unoAcceptDrawBtn" type="button" class="game-tap-target uno-house-btn" style="min-height:44px;padding:0 16px;border-radius:12px;border:2px solid rgba(255,255,255,0.22);background:rgba(255,255,255,0.12);color:#fff;font-weight:800;">Draw 4</button>
        </div>`:''}

        <!-- Color picker -->
        ${pickingColor?`
        <div style="padding:8px 12px;flex-shrink:0;background:rgba(0,0,0,0.3);">
          <div style="font-size:12px;color:#fff;margin-bottom:8px;text-align:center;font-weight:700;">Choose a colour:</div>
          <div style="display:flex;gap:8px;justify-content:center;">
            ${COLORS_UNO.map(c=>`<button data-color="${c}" class="game-tap-target uno-color-btn" aria-label="${c}" style="min-width:56px;min-height:56px;background:${COLOR_HEX[c]};border:3px solid rgba(255,255,255,0.5);border-radius:14px;cursor:pointer;font-size:13px;font-weight:700;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.6);box-shadow:0 4px 12px rgba(0,0,0,0.5);">${c[0].toUpperCase()+c.slice(1)}</button>`).join('')}
          </div>
        </div>`:''}

        <!-- Your hand -->
        <div style="padding:6px 8px max(14px,env(safe-area-inset-bottom));flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;padding:0 4px;">
            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.55);">Your hand</div>
            <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:1px 8px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);">${hands.me.length} cards</div>
            ${drawStack>0?`<div style="background:var(--red,#E74C3C);border-radius:8px;padding:1px 8px;font-size:11px;font-weight:700;color:#fff;">${house.stackDraw2&&drawStackType==='draw2'?`+${drawStack} pending`: `Draw +${drawStack}!`}</div>`:''}
          </div>
          <div id="unoHand" style="display:flex;gap:0;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding:14px 16px 6px;justify-content:${hands.me.length<7?'center':'flex-start'};">
            ${fanHandHtml()}
          </div>
          ${typeof gameTurnBannerHtml==='function'
            ? gameTurnBannerHtml({
                mode:gameOver?'over':(myTurn&&!pickingColor?'yours':'theirs'),
                label:myTurn&&!pickingColor?(pendingChallenge&&pendingChallenge.victim==='me'?'Challenge the +4 or draw 4':drawStack>0?(house.stackDraw2&&drawStackType==='draw2'?`+${drawStack} pending — stack +2 or draw`:`Tap deck to draw ${drawStack} cards`):(drewPlayableIndex===hands.me.length-1&&drewPlayableIndex>=0?'Tap drawn card to play or tap deck to pass':'Your turn — tap a highlighted card')):(pickingColor?'Pick a colour':(liveOn?(chat.name||'Opponent')+'’s turn':(typeof practiceTurnStatus==='function'?practiceTurnStatus({myTurn:false}).label:'Practice AI thinking…'))),
                sub:message||presenceHint||(!liveOn&&!myTurn?'Practice vs AI':undefined),
                pulse:myTurn&&!pickingColor,
                practice:!liveOn,
              })
            : `<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px;text-align:center;">${myTurn&&!pickingColor?'Your turn':(liveOn?'Opponent thinking…':(typeof practiceTurnStatus==='function'?practiceTurnStatus({myTurn:false}).label:'Practice AI thinking…'))}</div>`}
        </div>
      </div>
    `;

    document.getElementById('unoBack').addEventListener('click',()=>{askUnoLeave();});
    document.getElementById('unoUnoBtn').addEventListener('click',()=>{
      if(unoCallWindow&&hands.me.length===1){
        unoCallWindow=false;pendingOhNoFor='';message="'Oh, No!' called! ✅";
        if(liveOn&&!applyingLive)pushUno();
        render();
      }else if(hands.me.length!==1&&typeof showToast==='function'){
        showToast('Only use Oh No at 1 card');
      }
    });
    document.getElementById('unoChallengeBtn')?.addEventListener('click',()=>resolveChallenge('me'));
    document.getElementById('unoAcceptDrawBtn')?.addEventListener('click',()=>{
      if(!pendingChallenge)return;
      const n=drawStack||4;
      drawCard('me',n);
      message=`You drew ${n} cards`;
      clearDrawStack();
      pendingChallenge=null;
      myTurn=false;
      if(liveOn)pushUno();
      render();
      if(!liveOn)gs.schedule(aiPlayUno,aiDelay);
    });

    function playFromHand(i,chosenColor){
      const card=hands.me[i];
      if(!card)return;
      const el=overlay.querySelector(`[data-i="${i}"]`);
      flyCardToDiscard(el,card,()=>{
        if(!gs.alive())return;
        if(drewPlayableIndex===i)drewPlayableIndex=-1;
        hands.me.splice(i,1);
        applyCard(card,'me',chosenColor);
        selectedCard=null;pickingColor=false;
        render();
        if(!gameOver&&!myTurn&&!liveOn)gs.schedule(aiPlayUno,aiDelay);
      });
    }

    overlay.querySelectorAll('[data-i]').forEach(el=>{
      const i=parseInt(el.dataset.i);const card=hands.me[i];
      const playable=myTurn&&!pickingColor&&canPlay(card);
      el.addEventListener('click',()=>{
        if(!myTurn){message='Wait for your turn!';render();return;}
        if(pickingColor){return;}
        if(!playable){
          // Gentle reject: shake and show message
          el.animate&&el.animate([{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(-3px)'},{transform:'translateX(0)'}],{duration:280,easing:'ease-out'});
          if(drawStack>0)message=`Draw ${drawStack} cards first!`;
          else message='Card does not match colour or value';
          render();return;
        }
        if(needsColorPick(card)){selectedCard=i;pickingColor=true;render();}
        else playFromHand(i);
      });
    });

    if(pickingColor)overlay.querySelectorAll('[data-color]').forEach(el=>{
      el.addEventListener('click',()=>playFromHand(selectedCard,el.dataset.color));
    });

    document.getElementById('deckBtn').addEventListener('click',()=>{
      if(!myTurn||pickingColor)return;
      if(pendingChallenge&&pendingChallenge.victim==='me'){
        const n=drawStack||4;
        drawCard('me',n);
        message=`You drew ${n} cards`;
        clearDrawStack();
        pendingChallenge=null;
        myTurn=false;
        if(liveOn)pushUno();render();if(!liveOn)gs.schedule(aiPlayUno,aiDelay);return;
      }
      if(drawStack>0){
        const n=drawStack;drawCard('me',n);message=`You drew ${n} cards!`;clearDrawStack();myTurn=false;
        if(liveOn)pushUno();render();if(!liveOn)gs.schedule(aiPlayUno,aiDelay);return;
      }
      if(drewPlayableIndex===hands.me.length-1&&drewPlayableIndex>=0){
        drewPlayableIndex=-1;
        message='Passed the drawn card';
        myTurn=false;
        if(liveOn)pushUno();render();if(!liveOn)gs.schedule(aiPlayUno,aiDelay);return;
      }
      drawCard('me',1);
      const drawn=hands.me[hands.me.length-1];
      // canPlay re-evaluates with drawStack=0 now, so wild/color/value check works
      if(canPlay(drawn)){
        selectedCard=hands.me.length-1;
        drewPlayableIndex=hands.me.length-1;
        message='Drew a playable card — tap it to play, or tap deck to pass';
        if(liveOn)pushUno();render();
      } else {
        message='No playable card drawn — passing turn';myTurn=false;
        if(liveOn)pushUno();render();if(!liveOn)gs.schedule(aiPlayUno,aiDelay);
      }
    });
  }

  function aiChooseColor(who){
    const counts={red:0,yellow:0,green:0,blue:0};
    hands[who].forEach(c=>{if(counts[c.color]!==undefined)counts[c.color]++;});
    const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    if(diffKey==='hard'){
      // Prefer a colour the opponent is less likely to hold (we only know our hand — bias to our strongest)
      return ranked[0][0];
    }
    if(diffKey==='easy'&&Math.random()<0.45)return COLORS_UNO[Math.floor(Math.random()*4)];
    return ranked[0][0];
  }

  function aiStackChance(){
    if(diffKey==='easy')return 0.25;
    if(diffKey==='medium')return 0.65;
    return 0.92;
  }

  function aiChallengeChance(illegal){
    if(diffKey==='easy')return 0.2;
    if(diffKey==='medium')return 0.55;
    return illegal?0.95:0.18;
  }

  function aiPickFrom(playable){
    if(!playable.length)return null;
    if(diffKey==='easy')return playable[Math.floor(Math.random()*playable.length)];
    const oppLow=hands.me.length<=3;
    const scored=playable.map(card=>{
      let score=2;
      const v=card.value;
      if(v==='draw2'||v==='draw4'||v==='wild_draw4'||v==='wild_draw6'||v==='draw_all_5')score=oppLow?9:6;
      else if(v==='skip'||v==='skip_all'||v==='reverse')score=oppLow?8:5;
      else if(v==='flip')score=flipped?3:6;
      else if(v==='wild'||v==='wild_dark')score=diffKey==='hard'?0:3;
      else if(card.color===currentColor)score=4+(diffKey==='hard'?3:1);
      // Hard: keep color continuity / dump matching value to stay in control
      if(diffKey==='hard'&&card.color===currentColor&&v!=='wild'&&v!=='wild_dark')score+=2;
      if(diffKey==='hard'&&(v==='wild'||v==='wild_draw4'||v==='wild_draw6'||v==='wild_dark')&&playable.some(c=>!needsColorPick(c)))score-=4;
      // Prefer playing into a colour we hold many of (own hand only)
      if(diffKey!=='easy'&&card.color&&card.color!=='wild'){
        const same=hands.opp.filter(c=>c&&c.color===card.color).length;
        score+=Math.min(3,same)*(diffKey==='hard'?1.2:0.6);
      }
      return{card,score};
    }).sort((a,b)=>b.score-a.score);
    // Medium: sometimes second-best. Hard: top pick (tiny noise).
    if(diffKey==='medium'&&scored.length>1&&Math.random()<0.3)return scored[1].card;
    if(diffKey==='hard'&&scored.length>1&&Math.random()<0.08)return scored[1].card;
    return scored[0].card;
  }

  function aiPlayUno(){
    if(!gs.alive()||gameOver||myTurn||liveOn)return;
    if(pendingChallenge&&pendingChallenge.victim==='opp'){
      if(Math.random()<aiChallengeChance(!!pendingChallenge.illegal)){resolveChallenge('opp');return;}
      const n=drawStack||4;
      drawCard('opp',n);
      message=`${chat.name} takes the draw ${n}`;
      clearDrawStack();
      pendingChallenge=null;
      myTurn=true;
      render();
      return;
    }
    if(drawStack>0){
      if(house.stackDraw2&&drawStackType==='draw2'){
        const stackers=hands.opp.filter(c=>c&&c.value==='draw2');
        if(stackers.length&&Math.random()<aiStackChance()){
          const pickStack=stackers[0];
          const idxStack=hands.opp.indexOf(pickStack);
          hands.opp.splice(idxStack,1);
          applyCard(pickStack,'opp',null);
          message=`${chat.name} stacked +2 — pending +${drawStack}`;
          render();
          if(!gameOver&&!myTurn)gs.schedule(aiPlayUno,aiDelay);
          return;
        }
      }
      const n=drawStack;drawCard('opp',n);message=`${chat.name} drew ${n} cards!`;clearDrawStack();myTurn=true;
      render();return;
    }
    const playable=hands.opp.filter(canPlay);
    if(!playable.length){
      drawCard('opp',1);
      const drawn=hands.opp[hands.opp.length-1];
      if(!canPlay(drawn)){message=`${chat.name} draws — no play`;myTurn=true;render();return;}
      // Medium/Hard often play the drawn card; Easy sometimes keeps it
      if(diffKey==='easy'&&Math.random()<0.4){message=`${chat.name} draws and keeps`;myTurn=true;render();return;}
      const idx=hands.opp.indexOf(drawn);hands.opp.splice(idx,1);
      const aiColor=aiChooseColor('opp');
      applyCard(drawn,'opp',aiColor);render();if(!gameOver&&!myTurn)gs.schedule(aiPlayUno,aiDelay);return;
    }
    const pick=aiPickFrom(playable);
    const idx=hands.opp.indexOf(pick);hands.opp.splice(idx,1);
    const aiColor=aiChooseColor('opp');
    applyCard(pick,'opp',aiColor);render();
    if(!gameOver&&!myTurn)gs.schedule(aiPlayUno,aiDelay);
  }

  if(liveOn&&liveRoles&&typeof DangalLive!=='undefined'){
    const seedState=isLiveHost?buildUnoState():null;
    liveHandle=DangalLive.join({
      gameType:'uno',
      matchId:(chat&&chat.dangalMatchId)||(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.matchId),
      me:liveRoles.me,playerA:liveRoles.playerA,playerB:liveRoles.playerB,
      state:seedState,
      stake:liveStake,
      onForfeit({winner}){
        if(gameOver||!gs.alive())return;
        gameOver=true;
        const iWon=winner===liveRoles.me;
        gs.setOutcome(iWon?'won':'lost');
        message=iWon?'Opponent left — you win!':'Forfeit';
        render();
      },
      onPresence(info){
        if(!info||gameOver)return;
        presenceHint=info.warn?(info.forfeitSoon?'Opponent reconnecting…':'Opponent away…'):'';
      },
      onSnap(val){
        if(!val||!gs.alive())return;
        const incomingSeq=Number(val.version||val.seq)||0;
        if(incomingSeq&&incomingSeq<liveSeq)return;
        liveSeq=Math.max(liveSeq,incomingSeq);
        if(val.stake!=null)liveStake=Math.max(0,Number(val.stake)||0);

        if((val.status==='forfeit'||val.status==='over')&&!gameOver){
          applyingLive=true;
          const s0=val.state;
          if(s0){
            if(Array.isArray(s0.deck))deck=s0.deck.slice();
            if(Array.isArray(s0.discardPile))discardPile=s0.discardPile.slice();
            applyUnoHands(s0.handA,s0.handB);
            if(s0.house&&isClassicRules)Object.assign(house,s0.house);
            if(s0.variant){/* host variant sticks after seed */}
          }
          gameOver=true;
          const iWon=val.winner===liveRoles.me||(hands.me.length===0&&val.status==='over');
          gs.setOutcome(iWon?'won':'lost');
          message=val.status==='forfeit'
            ?(iWon?'Opponent left — you win!':'Forfeit')
            :(iWon?'You win!':chat.name+' wins!');
          applyingLive=false;
          render();
          return;
        }

        const s=val.state;
        if(!s){
          // Guest waiting for host deal
          if(!isLiveHost)render();
          return;
        }
        if(applyingLive)return;
        applyingLive=true;
        if(Array.isArray(s.deck))deck=s.deck.slice();
        if(Array.isArray(s.discardPile))discardPile=s.discardPile.slice();
        else if(s.discardTop)discardPile=[s.discardTop];
        applyUnoHands(s.handA,s.handB);
        currentColor=s.currentColor||currentColor;
        currentValue=s.currentValue||currentValue;
        drawStack=Number(s.drawStack)||0;
        drawStackType=s.drawStackType||'';
        direction=s.direction==null?direction:s.direction;
        flipped=!!s.flipped;
        message=s.message||'';
        if(s.house&&typeof s.house==='object'){
          Object.keys(house).forEach(k=>delete house[k]);
          Object.assign(house,HOUSE_DEFAULTS,s.house);
        }
        if(s.variant&&['classic','blaze','doublesided'].includes(s.variant)){
          variant=s.variant;
          isClassicRules=variant==='classic'||variant==='normal';
          if(!isClassicRules){
            house.stackDraw2=false;house.challengeDraw4=false;house.catchOhNo=false;
          }
        }
        applyPendingChallenge(s.pendingChallenge);
        if(s.unoCallNeeded===liveRoles.me&&hands.me.length===1){
          const already=unoCallWindow&&pendingOhNoFor==='me';
          unoCallWindow=true;pendingOhNoFor='me';
          if(!already)scheduleOhNoCatch('me');
        }else if(s.unoCallNeeded&&s.unoCallNeeded!==liveRoles.me){
          unoCallWindow=false;pendingOhNoFor='';
        }else if(!s.unoCallNeeded){
          // cleared after call/catch
          if(pendingOhNoFor==='me'&&hands.me.length!==1){unoCallWindow=false;pendingOhNoFor='';}
          else if(hands.me.length!==1){unoCallWindow=false;pendingOhNoFor='';}
        }
        gameOver=!!s.gameOver||val.status==='over';
        myTurn=!gameOver&&val.turn===liveRoles.me;
        // Never run Practice AI on Live
        selectedCard=null;
        // Keep colour picker if we still need to pick and it's our action — otherwise clear
        if(!(myTurn&&pickingColor))pickingColor=false;
        if(gameOver){
          const iWon=hands.me.length===0||val.winner===liveRoles.me;
          gs.setOutcome(iWon?'won':'lost');
          if(iWon)message=message||'You win!';
          else if(!message)message=chat.name+' wins!';
        }
        render();
        applyingLive=false;
      },
    });
    if(isLiveHost)pushUno();
  }
  // First-open coach for Blaze / Flip
  try{
    const coachKey='chaupaal_coach_uno_'+variant;
    if(!localStorage.getItem(coachKey)){
      const tip=variant==='blaze'
        ?'Draws hit harder — stay alert.'
        :(variant==='doublesided'?'Flip switches the deck\'s dark side.':'');
      if(tip&&typeof showToast==='function')showToast(tip);
      localStorage.setItem(coachKey,'1');
    }
  }catch(e){}
  render();
}


// Tic-Tac-Toe lives in ttt-ui.js (Classic + Ultimate, bots, Live rooms).

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

function openUnoVariantPicker(chat, defaults){
  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;max-height:82vh;overflow:auto;';
  const HOUSE_DEFAULTS={stackDraw2:false,challengeDraw4:true,catchOhNo:true};
  const savedHouse=(()=>{
    try{
      const raw=localStorage.getItem('chaupaal_uno_house');
      return raw?Object.assign({},HOUSE_DEFAULTS,JSON.parse(raw)):HOUSE_DEFAULTS;
    }catch(e){return HOUSE_DEFAULTS;}
  })();
  const selectedHouse=Object.assign({},savedHouse,(defaults&&defaults.house)||{});
  const savedDiff=(()=>{
    try{return localStorage.getItem('chaupaal_uno_diff')||'medium';}catch(e){return'medium';}
  })();
  let selectedDiff=(defaults&&defaults.difficulty)||savedDiff;
  if(!['easy','medium','hard'].includes(selectedDiff))selectedDiff='medium';
  let selectedVariant=(defaults&&defaults.variant)||'classic';
  if(!['classic','blaze','doublesided'].includes(selectedVariant))selectedVariant='classic';
  const launchCtx=(typeof window!=='undefined'&&window.__dangalLaunchCtx)||{};
  const liveWanted=!!(defaults&&defaults.live)||
    (typeof DangalLive!=='undefined'&&DangalLive.isLive&&DangalLive.isLive(chat,launchCtx))||
    launchCtx.mode==='live';

  const variants=[
    {label:'Classic',desc:'Standard Oh, No! with optional house rules',v:'classic'},
    {label:'Blaze',desc:'Harsher draws · snappier reverses · +6 wilds',v:'blaze'},
    {label:'Flip',desc:'Light & dark deck sides — Flip card switches',v:'doublesided'},
  ];

  function paint(){
    const isClassic=selectedVariant==='classic';
    const startLabel=liveWanted
      ?`Start Live · ${variants.find(v=>v.v===selectedVariant).label}`
      :`Start ${variants.find(v=>v.v===selectedVariant).label}`;
    sheet.innerHTML=`
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:6px;">Oh, No! Cards</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px;">${liveWanted
        ?'Live 1v1 — pick a variant. Friend follows your house rules. No AI.'
        :'Pick a variant, then set AI difficulty.'}</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
        ${variants.map(v=>`
          <button type="button" data-v="${v.v}" class="uno-pick-variant" style="width:100%;padding:14px 14px;background:${selectedVariant===v.v?'#1a1a2e':'var(--cream)'};color:${selectedVariant===v.v?'#fff':'var(--ink)'};border:2px solid ${selectedVariant===v.v?'#1a1a2e':'var(--line)'};border-radius:14px;text-align:left;cursor:pointer;">
            <div style="font-weight:800;font-size:14px;">${v.label}</div>
            <div style="font-size:12px;opacity:.75;margin-top:2px;">${v.desc}</div>
          </button>`).join('')}
      </div>
      ${liveWanted?'':`
      <div style="margin-bottom:12px;">
        <div style="font:700 13px Space Grotesk,sans-serif;margin-bottom:8px;">AI difficulty</div>
        <div style="display:flex;gap:8px;">
          ${['easy','medium','hard'].map(d=>`
            <button type="button" data-d="${d}" class="uno-pick-diff" style="flex:1;min-height:42px;border-radius:12px;border:2px solid ${selectedDiff===d?'#1a1a2e':'var(--line)'};background:${selectedDiff===d?'#1a1a2e':'var(--cream)'};color:${selectedDiff===d?'#fff':'var(--ink)'};font-weight:800;font-size:13px;cursor:pointer;text-transform:capitalize;">${d}</button>`).join('')}
        </div>
      </div>`}
      ${isClassic?`
      <div id="unoClassicRules" style="margin:4px 0 12px;padding:14px;background:#f8f4ec;border:1px solid var(--line);border-radius:16px;">
        <div style="font:700 14px Space Grotesk,sans-serif;margin-bottom:4px;">Classic house rules</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">${liveWanted?'Host sets these — guest follows.':'Optional — Blaze & Flip use built-in chaos rules.'}</div>
        <label style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid rgba(0,0,0,.06);">
          <div><div style="font-weight:700;font-size:13px;">Stack +2</div><div style="font-size:12px;color:var(--muted);">Allow +2 on +2 only. Default off.</div></div>
          <input id="unoHouseStack" type="checkbox" ${selectedHouse.stackDraw2?'checked':''}>
        </label>
        <label style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid rgba(0,0,0,.06);">
          <div><div style="font-weight:700;font-size:13px;">Challenge Wild +4</div><div style="font-size:12px;color:var(--muted);">Success if they held the old colour. Default on.</div></div>
          <input id="unoHouseChallenge" type="checkbox" ${selectedHouse.challengeDraw4?'checked':''}>
        </label>
        <label style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid rgba(0,0,0,.06);">
          <div><div style="font-weight:700;font-size:13px;">Catch missed Oh No!</div><div style="font-size:12px;color:var(--muted);">Miss the call at 1 card → draw 2. Default on.</div></div>
          <input id="unoHouseCatch" type="checkbox" ${selectedHouse.catchOhNo?'checked':''}>
        </label>
      </div>`:`
      <div style="margin:4px 0 12px;padding:12px 14px;background:#f0eef8;border:1px solid var(--line);border-radius:14px;font-size:12px;color:var(--muted);">
        <strong style="color:var(--ink);">Built-in chaos rules</strong> — house toggles are Classic-only. ${selectedVariant==='blaze'?'Blaze draws hit immediately.':'Flip dark actions only work on the Dark side.'}
      </div>`}
      <button id="unoStartBtn" type="button" style="width:100%;min-height:48px;border-radius:14px;border:0;background:#1a1a2e;color:#fff;font:800 15px Space Grotesk,sans-serif;cursor:pointer;">${startLabel}</button>
      <button id="closeUnoVariant" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>
    `;
    sheet.querySelectorAll('[data-v]').forEach(btn=>{
      btn.addEventListener('click',()=>{selectedVariant=btn.dataset.v;paint();});
    });
    sheet.querySelectorAll('[data-d]').forEach(btn=>{
      btn.addEventListener('click',()=>{selectedDiff=btn.dataset.d;paint();});
    });
    sheet.querySelector('#unoStartBtn')?.addEventListener('click',async()=>{
      const house=isClassic?{
        stackDraw2:!!sheet.querySelector('#unoHouseStack')?.checked,
        challengeDraw4:!!sheet.querySelector('#unoHouseChallenge')?.checked,
        catchOhNo:!!sheet.querySelector('#unoHouseCatch')?.checked,
      }:undefined;
      try{
        if(!liveWanted)localStorage.setItem('chaupaal_uno_diff',selectedDiff);
        if(house)localStorage.setItem('chaupaal_uno_house',JSON.stringify(house));
      }catch(e){}
      if(liveWanted){
        const prev=window.__dangalLaunchCtx||{};
        const oppUid=prev.opponentUid||(typeof opponentUidFromChat==='function'?opponentUidFromChat(chat):'')||'';
        const chatId=prev.chatId||(chat&&(chat.firestoreId||chat.id))||'';
        let mid=prev.matchId||(chat&&chat.dangalMatchId)||'';
        if(!mid&&oppUid&&typeof dangalMatchId==='function'){
          mid=dangalMatchId('uno',{name:chat&&chat.name,opponentUid:oppUid});
          if(chat)chat.dangalMatchId=mid;
        }
        let stakePick=Math.max(0,Number(prev.stake)||0);
        // Host sets stake after variant/house (guest keeps challenge stake)
        const isHost=prev.source!=='challenge';
        if(isHost&&typeof stakesEnabledForGame==='function'&&stakesEnabledForGame('uno')&&typeof openDangalStakeSheet==='function'){
          const picked=await openDangalStakeSheet('uno',{defaultStake:stakePick});
          if(picked==null)return;
          stakePick=picked;
        }
        window.__dangalLaunchCtx=Object.assign({},prev,{
          gameId:'uno',gameType:'uno',mode:'live',
          matchId:mid,opponentUid:oppUid,chatId,stake:stakePick,
          unoVariant:selectedVariant,variant:selectedVariant,
          unoHouse:house,source:prev.source||'challenge_host',
        });
        if(typeof sendChallengeCard==='function'&&oppUid&&chatId&&mid&&isHost){
          try{
            await sendChallengeCard(oppUid,'uno',{
              chatId,matchId:mid,stake:stakePick,
              unoVariant:selectedVariant,variant:selectedVariant,
              unoHouse:house,mode:'live',
            });
          }catch(e){}
        }
        sheet.remove();
        openUnoGame(chat,selectedVariant,{house,difficulty:'medium',live:true,stake:stakePick});
        return;
      }
      sheet.remove();
      openUnoGame(chat,selectedVariant,{house,difficulty:selectedDiff});
    });
    sheet.querySelector('#closeUnoVariant')?.addEventListener('click',()=>sheet.remove());
  }
  document.querySelector('.device').appendChild(sheet);
  paint();
}

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
    id: 'uno',
    name: 'Oh, No! Cards',
    desc: 'Classic · Blaze · Flip · Live 1v1',
    icon: '🃏',
    ratingKey: 'uno',
    gameType: 'multiplayer',
    liveDuel: true,
    genre: 'cards',
    chat1v1: true,
    chatGroup: true,
    order: 40,
    meta: {
      phaseA: 'Classic UX + house rules',
      phaseB: 'Blaze / Flip + Practice AI',
      phaseC: 'complete — Live 1v1, stakes, rematch, share',
      complete: true,
      liveLimit: '2p',
    },
    launch(ctx) {
      try{
        const launch=window.__dangalLaunchCtx||{};
        const chat=typeof chatFromLaunch==='function'?chatFromLaunch(ctx):ctx.chat;
        const liveWanted=
          ctx.mode==='live'||
          launch.mode==='live'||
          (typeof DangalLive!=='undefined'&&DangalLive.isLive&&DangalLive.isLive(chat,Object.assign({},launch,ctx)));
        const unoVariant=ctx.unoVariant||ctx.variant||launch.unoVariant||launch.variant||'';
        const unoHouse=ctx.unoHouse||launch.unoHouse;
        window.__dangalLaunchCtx=Object.assign({},launch,{
          gameId:'uno',gameType:'uno',
          mode:liveWanted?'live':(ctx.mode||launch.mode||'practice'),
          matchId:ctx.matchId||launch.matchId||(chat&&chat.dangalMatchId)||'',
          opponentUid:ctx.opponentUid||launch.opponentUid||'',
          chatId:ctx.chatId||launch.chatId||'',
          stake:Number(ctx.stake??launch.stake)||0,
          source:ctx.source||launch.source||'',
          unoVariant:unoVariant||undefined,
          unoHouse:unoHouse||undefined,
          startedAt:Date.now(),
        });
        if(ctx.isGroup){
          if(liveWanted){
            if(typeof showToast==='function')showToast('Oh, No! Live is 1v1 for now — challenge from a DM');
            return;
          }
          openGroupGameSetup(ctx.chat,'uno');
          return;
        }
        if(liveWanted){
          // Guest / rematch with known match: open board (host deal or wait)
          if(ctx.source==='challenge'||(unoVariant&&(ctx.matchId||launch.matchId||(chat&&chat.dangalMatchId)))){
            openUnoGame(chat,unoVariant||'classic',{
              house:unoHouse,
              variant:unoVariant||'classic',
              stake:Number(ctx.stake??launch.stake)||0,
            });
            return;
          }
          openUnoVariantPicker(chat,{live:true,variant:unoVariant||'classic',house:unoHouse});
          return;
        }
        // Practice vs AI: Classic + Medium + saved house — no variant/house wall.
        const skipSetup=
          launch.skipPracticeSetup!==false&&
          (ctx.skipPracticeSetup!==false)&&
          (launch.practiceKind==='vsAi'||launch.mode==='practice'||ctx.mode==='practice'||!unoVariant);
        if(skipSetup&&!unoVariant){
          const HOUSE_DEFAULTS={stackDraw2:false,challengeDraw4:true,catchOhNo:true};
          let house=unoHouse;
          if(!house){
            try{
              const raw=localStorage.getItem('chaupaal_uno_house');
              house=raw?Object.assign({},HOUSE_DEFAULTS,JSON.parse(raw)):HOUSE_DEFAULTS;
            }catch(e){house=HOUSE_DEFAULTS;}
          }
          let diff=ctx.difficulty||launch.difficulty||'medium';
          try{if(!ctx.difficulty&&!launch.difficulty)diff=localStorage.getItem('chaupaal_uno_diff')||'medium';}catch(e){}
          if(!['easy','medium','hard'].includes(diff))diff='medium';
          openUnoGame(chat,'classic',{house,difficulty:diff,variant:'classic'});
          return;
        }
        openUnoVariantPicker(chat,{
          variant:unoVariant||undefined,
          house:unoHouse,
          difficulty:ctx.difficulty||launch.difficulty,
        });
      }catch(err){
        console.error('[uno] launch failed',err);
        try{if(typeof showToast==='function')showToast('Could not open Oh, No!');}catch(e2){}
      }
    },
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
