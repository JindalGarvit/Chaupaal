/**
 * Phase 2A — wrap a game overlay with createGameSession.
 * Parent chat dismiss → cleanup (timers/listeners). Analytics via session.end.
 * Ratings: call recordGameResult at win time OR pass onEnd.
 * @returns {{ alive:()=>boolean, close:(result?:string)=>void, setOutcome:(r:string)=>void, getOutcome:()=>string|null, schedule:(fn:Function,ms:number)=>number, clearTimers:()=>void }}
 */
function beginGameOverlaySession(opts) {
  const type = opts.type;
  const overlay = opts.overlay;
  const userCleanup = typeof opts.cleanup === 'function' ? opts.cleanup : null;
  const onEnd = typeof opts.onEnd === 'function' ? opts.onEnd : null;
  const timers = new Set();
  let alive = true;
  let outcome = null;
  let session = null;

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

  function schedule(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!alive) return;
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function setOutcome(r) {
    if (outcome == null && r != null) {
      outcome = r;
      if (typeof gameFeedback === 'function') {
        const key = r === 'won' ? 'win' : r === 'lost' ? 'lose' : r === 'draw' ? 'draw' : null;
        if (key) gameFeedback(key);
      }
    }
  }

  function runUserCleanup() {
    clearTimers();
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
      }
      return;
    }
    alive = false;
    runUserCleanup();
    if (onEnd) {
      try {
        onEnd(r);
      } catch (e) {}
    }
    if (overlay && overlay.isConnected) overlay.remove();
  }

  if (typeof createGameSession === 'function') {
    session = createGameSession({
      id: type + '_' + Date.now(),
      type,
      title: opts.title || type,
      mode: opts.mode || '1v1',
      context: {
        chat: opts.chat,
        overlayScope:
          typeof OVERLAY_SCOPE_CHAT !== 'undefined' ? OVERLAY_SCOPE_CHAT : 'chat',
        source: opts.source,
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
      };
    }
    if (overlay && !overlay.isConnected) device.appendChild(overlay);
  }

  return {
    alive: () => alive,
    close,
    setOutcome,
    getOutcome: () => outcome,
    schedule,
    clearTimers,
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

// ===================== PROFESSIONAL CHESS ENGINE =====================
function openChessGame(chat){
// ---- DIFFICULTY + TIME CONTROL PICKER ----
const device=document.querySelector('.device');
if(!device){
  if(typeof showToast==='function')showToast('Could not open chess');
  return;
}
const DIFF_OPTIONS=[
  {id:'easy',label:'Easy',depth:1,desc:'Casual'},
  {id:'medium',label:'Medium',depth:2,desc:'Balanced'},
  {id:'hard',label:'Hard',depth:3,desc:'Challenging'},
];
const TC_OPTIONS=[
  {cat:'Bullet',time:'1+0',min:1,inc:0},{cat:'Bullet',time:'2+1',min:2,inc:1},
  {cat:'Blitz',time:'3+0',min:3,inc:0},{cat:'Blitz',time:'3+2',min:3,inc:2},{cat:'Blitz',time:'5+0',min:5,inc:0},{cat:'Blitz',time:'5+3',min:5,inc:3},
  {cat:'Rapid',time:'10+0',min:10,inc:0},{cat:'Rapid',time:'15+10',min:15,inc:10},{cat:'Rapid',time:'30+0',min:30,inc:0},
  {cat:'Classical',time:'60+0',min:60,inc:0},{cat:'No Limit',time:'∞',min:0,inc:0},
];
const TC_ICONS={'Bullet':'⚡','Blitz':'🔥','Rapid':'⏱️','Classical':'🏆','No Limit':'♾️'};
let pickedDiff='medium';
const tcSheet=document.createElement('div');
tcSheet.style.cssText='position:absolute;inset:0;background:#15192e;z-index:100;display:flex;flex-direction:column;overflow-y:auto;';
const cats=[...new Set(TC_OPTIONS.map(t=>t.cat))];
tcSheet.innerHTML=`
  ${gameChromeHtml({title:'Chess',subtitle:'Difficulty & time',backId:'chessPickBack'})}
  <div style="padding:8px 16px 28px;">
    <div style="margin-bottom:18px;">
      <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Difficulty</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
        ${DIFF_OPTIONS.map(d=>`<button type="button" class="chess-diff-btn" data-diff="${d.id}" style="padding:12px 6px;background:${d.id===pickedDiff?'rgba(201,162,39,0.25)':'rgba(255,255,255,0.07)'};border:2px solid ${d.id===pickedDiff?'var(--gold)':'rgba(255,255,255,0.12)'};border-radius:14px;color:#fff;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;"><div>${d.label}</div><div style="font-size:10px;opacity:.55;font-weight:600;margin-top:2px;">${d.desc}</div></button>`).join('')}
      </div>
    </div>
    ${cats.map(cat=>{
      const opts=TC_OPTIONS.filter(t=>t.cat===cat);
      return `<div style="margin-bottom:18px;"><div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">${TC_ICONS[cat]} ${cat}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${opts.map(t=>`<button class="tc-btn" data-min="${t.min}" data-inc="${t.inc}" style="padding:14px 6px;background:rgba(255,255,255,0.07);border:2px solid rgba(255,255,255,0.12);border-radius:14px;color:#fff;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;transition:all .15s;">${t.time}</button>`).join('')}</div></div>`;
    }).join('')}
  </div>
`;
device.appendChild(tcSheet);
if(typeof prepareGameOverlay==='function')prepareGameOverlay(tcSheet,{theme:'dark',gameId:'chess'});
const unregisterPicker=typeof registerScopedOverlay==='function'
  ?registerScopedOverlay(typeof OVERLAY_SCOPE_CHAT!=='undefined'?OVERLAY_SCOPE_CHAT:'chat',tcSheet,()=>tcSheet.remove())
  :null;
function closePicker(){
  if(unregisterPicker)unregisterPicker();
  tcSheet.remove();
}
tcSheet.querySelector('#chessPickBack').addEventListener('click',closePicker);
tcSheet.querySelectorAll('.chess-diff-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    pickedDiff=btn.dataset.diff;
    tcSheet.querySelectorAll('.chess-diff-btn').forEach(b=>{
      const on=b.dataset.diff===pickedDiff;
      b.style.background=on?'rgba(201,162,39,0.25)':'rgba(255,255,255,0.07)';
      b.style.borderColor=on?'var(--gold)':'rgba(255,255,255,0.12)';
    });
  });
});
tcSheet.querySelectorAll('.tc-btn').forEach(btn=>{
  btn.addEventListener('mouseover',()=>btn.style.borderColor='var(--gold)');
  btn.addEventListener('mouseout',()=>btn.style.borderColor='rgba(255,255,255,0.12)');
  btn.addEventListener('click',()=>{
    closePicker();
    const depth=(DIFF_OPTIONS.find(d=>d.id===pickedDiff)||DIFF_OPTIONS[1]).depth;
    const tc={min:parseInt(btn.dataset.min),inc:parseInt(btn.dataset.inc),difficulty:pickedDiff,aiDepth:depth};
    startChessGame(chat,tc);
  });
});
}

function showChessStartError(chat, tc, err) {
  console.error('[chess] start failed', err);
  const device = document.querySelector('.device');
  if (!device) {
    if (typeof showToast === 'function') showToast('Could not start chess');
    return;
  }
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:absolute;inset:0;background:#15192e;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;';
  const msg = (err && err.message) || 'Something went wrong loading the board.';
  overlay.innerHTML = `
    <div style="font-size:48px;margin-bottom:12px;">♟</div>
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;color:#fff;margin-bottom:8px;">Could not start chess</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:20px;max-width:280px;">${msg}</div>
    <button id="chessErrRetry" style="width:100%;max-width:260px;padding:14px;background:var(--gold);color:#1a1a2e;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">Try again</button>
    <button id="chessErrBack" style="width:100%;max-width:260px;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:14px;font-size:14px;cursor:pointer;">Back</button>
  `;
  device.appendChild(overlay);
  document.getElementById('chessErrRetry').addEventListener('click', () => {
    overlay.remove();
    startChessGame(chat, tc);
  });
  document.getElementById('chessErrBack').addEventListener('click', () => overlay.remove());
}

function startChessGame(chat, tc) {
  try {
    if (typeof Chess !== 'function') throw new Error('Chess library not loaded');
    if (!document.querySelector('.device')) throw new Error('Game container not found');
    startChessGameInner(chat, tc || { min: 0, inc: 0 });
  } catch (err) {
    showChessStartError(chat, tc, err);
  }
}

function startChessGameInner(chat, tc) {
const FILES='abcdefgh';
const PIECE_UNICODE={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const AI_DEPTH=Math.max(1,Math.min(3,tc.aiDepth||2));
const DIFF_LABEL=tc.difficulty==='easy'?'Easy':tc.difficulty==='hard'?'Hard':'Medium';

function rcToSq(r,c){return FILES[c]+(8-r);}
function sqToRC(sq){return[8-parseInt(sq[1],10),FILES.indexOf(sq[0])];}
function pieceColor(p){return p&&(p===p.toUpperCase()?'w':'b');}

function boardFromChess(chess){
  const b=Array(8).fill(null).map(()=>Array(8).fill(null));
  chess.board().forEach((row,r)=>{
    row.forEach((cell,c)=>{
      if(cell)b[r][c]=cell.color==='w'?cell.type.toUpperCase():cell.type.toLowerCase();
    });
  });
  return b;
}

let chess=new Chess();
let state={board:boardFromChess(chess),turn:chess.turn(),selected:null,legalMoves:[],history:[],status:'playing',check:false,ratingRecorded:false,lastMove:null,animating:false};

function syncFromChess(){
  state.board=boardFromChess(chess);
  state.turn=chess.turn();
  state.check=chess.isCheck();
  if(chess.isCheckmate())state.status='checkmate';
  else if(chess.isStalemate())state.status='stalemate';
  else if(state.status!=='timeout')state.status='playing';
  if(state.selected){
    const sq=rcToSq(state.selected[0],state.selected[1]);
    state.legalMoves=chess.moves({square:sq,verbose:true}).map(m=>({
      from:sqToRC(m.from),to:sqToRC(m.to),
      promo:m.promotion?(m.color==='w'?m.promotion.toUpperCase():m.promotion.toLowerCase()):null,
      san:m.san
    }));
  }else state.legalMoves=[];
}

syncFromChess();

function getAIMove(chessInstance,legalMoves){
  const VALS={p:100,n:320,b:330,r:500,q:900,k:20000};
  const PST={
    p:[[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
    n:[[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
    b:[[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
    r:[[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
    q:[[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
    k:[[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
  };
  const board=boardFromChess(chessInstance);
  function evalBoard(b){
    let score=0;
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
      const p=b[r][c];if(!p)continue;
      const pt=p.toLowerCase();const isBlack=p===p.toLowerCase();
      const pstRow=isBlack?r:7-r;
      const val=(VALS[pt]||0)+(PST[pt]?.[pstRow]?.[c]||0);
      score+=isBlack?val:-val;
    }
    return score;
  }
  function alphaBeta(fen,depth,alpha,beta,maximizing){
    const c=new Chess(fen);
    if(depth===0)return evalBoard(boardFromChess(c));
    const moves=c.moves({verbose:true});
    if(!moves.length)return c.isCheck()? (maximizing?-20000:20000):0;
    if(maximizing){
      let best=-Infinity;
      for(const m of moves){
        const nc=new Chess(fen);
        nc.move(m);
        best=Math.max(best,alphaBeta(nc.fen(),depth-1,alpha,beta,false));
        alpha=Math.max(alpha,best);if(beta<=alpha)break;
      }
      return best;
    }
    let best=Infinity;
    for(const m of moves){
      const nc=new Chess(fen);
      nc.move(m);
      best=Math.min(best,alphaBeta(nc.fen(),depth-1,alpha,beta,true));
      beta=Math.min(beta,best);if(beta<=alpha)break;
    }
    return best;
  }
  // Easy: random among top half; medium/hard: alpha-beta at depth
  if(AI_DEPTH===1){
    const scored=legalMoves.map(m=>{
      const nc=new Chess(chessInstance.fen());
      nc.move({from:rcToSq(m.from[0],m.from[1]),to:rcToSq(m.to[0],m.to[1]),promotion:'q'});
      return{m,s:evalBoard(boardFromChess(nc))};
    }).sort((a,b)=>b.s-a.s);
    const pool=scored.slice(0,Math.max(2,Math.ceil(scored.length/2)));
    return(pool[Math.floor(Math.random()*pool.length)]||scored[0]).m;
  }
  let best=null,bestScore=-Infinity;
  const ordered=[...legalMoves].sort((a,b)=>{
    const capA=board[a.to[0]][a.to[1]]?VALS[board[a.to[0]][a.to[1]].toLowerCase()]||0:0;
    const capB=board[b.to[0]][b.to[1]]?VALS[board[b.to[0]][b.to[1]].toLowerCase()]||0:0;
    return capB-capA;
  });
  const searchDepth=AI_DEPTH===3?2:1;
  for(const m of ordered){
    const nc=new Chess(chessInstance.fen());
    nc.move({from:rcToSq(m.from[0],m.from[1]),to:rcToSq(m.to[0],m.to[1]),promotion:'q'});
    const score=alphaBeta(nc.fen(),searchDepth,-Infinity,Infinity,false);
    if(score>bestScore){bestScore=score;best=m;}
  }
  return best||ordered[0];
}

const overlay=document.createElement('div');
overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;';

let clockInterval=null;
const gs=beginGameOverlaySession({
  type:'chess',title:'Chess',mode:'1v1',chat,overlay,
  cleanup(){clearInterval(clockInterval);clockInterval=null;},
});
if(!gs.alive())return;

function sqColor(r,c){return(r+c)%2===0?'#F0D9B5':'#B58863';}
function sqHighlight(r,c){
  if(state.selected&&state.selected[0]===r&&state.selected[1]===c)return'#7fc97f';
  if(state.lastMove&&((state.lastMove.from[0]===r&&state.lastMove.from[1]===c)||(state.lastMove.to[0]===r&&state.lastMove.to[1]===c)))return(r+c)%2===0?'#cdd26a':'#aaa23a';
  if(state.selected&&state.legalMoves.some(m=>m.from[0]===state.selected[0]&&m.from[1]===state.selected[1]&&m.to[0]===r&&m.to[1]===c))return state.board[r][c]?'rgba(255,0,0,0.4)':'rgba(100,200,100,0.5)';
  return sqColor(r,c);
}
function findKingSquare(color){
  const target=color==='w'?'K':'k';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(state.board[r][c]===target)return[r,c];
  return null;
}

function capturedPieces(){
  const init={p:8,r:2,n:2,b:2,q:1,k:1};
  const white={p:0,r:0,n:0,b:0,q:0,k:0};
  const black={p:0,r:0,n:0,b:0,q:0,k:0};
  state.board.flat().filter(Boolean).forEach(p=>{
    const counts=p===p.toUpperCase()?white:black;
    counts[p.toLowerCase()]++;
  });
  const wCap=[],bCap=[];
  Object.entries(init).forEach(([t,n])=>{
    for(let i=0;i<n-black[t];i++)wCap.push(t);
    for(let i=0;i<n-white[t];i++)bCap.push(t.toUpperCase());
  });
  return{wCap:wCap.map(p=>PIECE_UNICODE[p]).join(''),bCap:bCap.map(p=>PIECE_UNICODE[p]).join('')};
}

function render(){
  syncFromChess();
  const cap=capturedPieces();
  const statusText=state.status==='checkmate'?(state.turn==='w'?`${chat.name} wins by checkmate!`:'You won by checkmate! 🎉'):state.status==='stalemate'?'Stalemate — Draw!':state.status==='timeout'?(state.turn==='w'?`${chat.name} wins on time!`:'You won on time! 🎉'):state.check?'Check!':state.turn==='w'?'Your turn':'Opponent thinking...';
  if((state.status==='checkmate'||state.status==='stalemate'||state.status==='timeout')&&!state.ratingRecorded){
    state.ratingRecorded=true;
    const won=state.status==='checkmate'?state.turn==='b':state.status==='timeout'?state.turn==='b':false;
    const drew=state.status==='stalemate';
    gs.setOutcome(drew?'draw':won?'won':'lost');
    if(typeof recordGameResult==='function')recordGameResult('chess',won,drew);
  }
  const turnMode=state.status!=='playing'?'over':state.check&&state.turn==='w'?'over':state.turn==='w'?'yours':'theirs';
  const turnBanner=typeof gameTurnBannerHtml==='function'
    ? gameTurnBannerHtml({ mode: turnMode, label: statusText, pulse: turnMode==='yours' })
    : `<div style="padding:10px 16px;text-align:center;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;color:#fff;flex-shrink:0;">${statusText}</div>`;
  const kingSq=state.check?findKingSquare(state.turn):null;
  overlay.innerHTML=`
    ${gameChromeHtml({title:'Chess',subtitle:DIFF_LABEL,backId:'chessBack',rightHtml:'<button id="chessFlip" class="game-chrome-action game-tap-target">Flip</button>'})}
    <div style="background:var(--game-panel,#1F2542);padding:8px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
      <div style="color:#ccc;font-size:13px;"><span aria-hidden="true">●</span> ${chat.name} <span style="opacity:.6;font-size:11px;">(Black)</span></div>
      <div style="font-size:12px;color:var(--gold);">${cap.bCap}</div>
      ${HAS_TIMER?`<div id="clock_b" style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;color:${clocks.b<=10?'#E74C3C':'var(--gold)'};">${formatClock(clocks.b)}</div>`:''}
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:8px;position:relative;">
      <div id="chessBoard" style="display:grid;grid-template-columns:repeat(8,1fr);width:min(360px,94vw);aspect-ratio:1;border-radius:var(--game-board-radius,6px);overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);position:relative;" role="grid" aria-label="Chess board"></div>
      <div id="chessSlideLayer" style="position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;"></div>
    </div>
    <div style="background:var(--game-panel,#1F2542);padding:8px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
      <div style="color:#fff;font-size:13px;"><span aria-hidden="true">○</span> You <span style="opacity:.6;font-size:11px;">(White)</span></div>
      <div style="font-size:12px;color:var(--gold);">${cap.wCap}</div>
      ${HAS_TIMER?`<div id="clock_w" style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;color:${clocks.w<=10?'#E74C3C':'var(--gold)'};">${formatClock(clocks.w)}</div>`:''}
    </div>
    ${turnBanner}
  `;
  document.getElementById('chessBack').addEventListener('click',()=>gs.close());
  document.getElementById('chessFlip').addEventListener('click',()=>{state.selected=null;renderFlipped=!renderFlipped;render();});
  const boardEl=document.getElementById('chessBoard');
  const rows=renderFlipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
  const cols=renderFlipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
  rows.forEach(r=>cols.forEach(c=>{
    const sq=document.createElement('div');
    const isCheckPulse=kingSq&&kingSq[0]===r&&kingSq[1]===c;
    sq.dataset.r=r;sq.dataset.c=c;
    sq.style.cssText=`aspect-ratio:1;background:${sqHighlight(r,c)};display:flex;align-items:center;justify-content:center;font-size:clamp(22px,5vw,34px);cursor:pointer;position:relative;user-select:none;${isCheckPulse?'animation:chessCheckPulse .7s ease-in-out infinite;box-shadow:inset 0 0 0 3px #e74c3c;':''}`;
    const p=state.board[r][c];
    if(p){
      const span=document.createElement('span');span.textContent=PIECE_UNICODE[p];span.className='chess-piece';
      span.style.cssText=`color:${pieceColor(p)==='w'?'#fff':'#1a1a2e'};text-shadow:${pieceColor(p)==='w'?'0 1px 4px rgba(0,0,0,0.9)':'0 1px 4px rgba(255,255,255,0.4)'};line-height:1;transition:transform .18s ease;`;
      sq.appendChild(span);
    }
    if(state.selected&&state.legalMoves.some(m=>m.from[0]===state.selected[0]&&m.from[1]===state.selected[1]&&m.to[0]===r&&m.to[1]===c)&&!state.board[r][c]){
      const dot=document.createElement('div');dot.style.cssText='position:absolute;width:30%;height:30%;background:rgba(0,0,0,0.2);border-radius:50%;';sq.appendChild(dot);
    }
    sq.addEventListener('click',()=>handleClick(r,c));
    boardEl.appendChild(sq);
  }));
}

let renderFlipped=false;

const HAS_TIMER=tc.min>0;
let clocks={w:tc.min*60,b:tc.min*60};

function formatClock(s){const m=Math.floor(s/60);const sec=s%60;return m+':'+(sec<10?'0':'')+sec;}
function startClock(color){
  if(!HAS_TIMER||!gs.alive())return;
  clearInterval(clockInterval);
  clockInterval=setInterval(()=>{
    if(!gs.alive()){clearInterval(clockInterval);return;}
    clocks[color]--;
    const el=document.getElementById('clock_'+color);
    if(el){el.textContent=formatClock(clocks[color]);el.style.color=clocks[color]<=10?'#E74C3C':'var(--gold)';}
    if(clocks[color]<=0){
      clocks[color]=0;clearInterval(clockInterval);
      state.status='timeout';render();
      showToast(color==='w'?`${chat.name} wins on time! ⏱️`:'You won on time! ⏱️');
    }
  },1000);
}
function stopClock(){clearInterval(clockInterval);clockInterval=null;}

function cellCenter(r,c){
  const boardEl=document.getElementById('chessBoard');
  if(!boardEl)return null;
  const cell=boardEl.querySelector(`[data-r="${r}"][data-c="${c}"]`);
  if(!cell)return null;
  const br=boardEl.getBoundingClientRect();
  const cr=cell.getBoundingClientRect();
  return{x:cr.left-br.left+cr.width/2,y:cr.top-br.top+cr.height/2,size:cr.width};
}

function animatePieceSlide(from,to,pieceChar,done){
  const boardEl=document.getElementById('chessBoard');
  const layer=document.getElementById('chessSlideLayer');
  const a=cellCenter(from[0],from[1]);const b=cellCenter(to[0],to[1]);
  if(!boardEl||!layer||!a||!b){if(done)done();return;}
  const wrap=document.createElement('div');
  wrap.style.cssText=`position:absolute;width:${boardEl.offsetWidth}px;height:${boardEl.offsetHeight}px;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;`;
  const ghost=document.createElement('div');
  ghost.textContent=PIECE_UNICODE[pieceChar]||'';
  ghost.style.cssText=`position:absolute;left:${a.x}px;top:${a.y}px;transform:translate(-50%,-50%);font-size:clamp(22px,5vw,34px);color:${pieceColor(pieceChar)==='w'?'#fff':'#1a1a2e'};text-shadow:0 2px 8px rgba(0,0,0,.45);transition:left .22s cubic-bezier(.34,1.2,.64,1),top .22s cubic-bezier(.34,1.2,.64,1);z-index:5;`;
  wrap.appendChild(ghost);layer.appendChild(wrap);
  const fromCell=boardEl.querySelector(`[data-r="${from[0]}"][data-c="${from[1]}"] .chess-piece`);
  if(fromCell)fromCell.style.opacity='0';
  requestAnimationFrame(()=>{ghost.style.left=b.x+'px';ghost.style.top=b.y+'px';});
  gs.schedule(()=>{wrap.remove();if(done)done();},240);
}

function handleClick(r,c){
  if(!gs.alive()||state.status!=='playing'||state.turn!=='w'||state.animating)return;
  const p=state.board[r][c];
  if(state.selected){
    const move=state.legalMoves.find(m=>m.from[0]===state.selected[0]&&m.from[1]===state.selected[1]&&m.to[0]===r&&m.to[1]===c);
    if(move){makeMove(move);return;}
    if(p&&pieceColor(p)==='w'){state.selected=[r,c];syncFromChess();render();return;}
    state.selected=null;syncFromChess();render();return;
  }
  if(p&&pieceColor(p)==='w'){state.selected=[r,c];syncFromChess();render();}
}

function makeMove(move){
  const from=rcToSq(move.from[0],move.from[1]);
  const to=rcToSq(move.to[0],move.to[1]);
  const movingPiece=state.board[move.from[0]][move.from[1]];
  state.animating=true;
  animatePieceSlide(move.from,move.to,movingPiece,()=>{
    if(!gs.alive())return;
    const result=chess.move({from,to,promotion:move.promo?move.promo.toLowerCase():'q'});
    if(!result){
      state.animating=false;
      if(typeof gameFeedback==='function')gameFeedback('invalid');
      render();
      return;
    }
    if(typeof gameFeedback==='function')gameFeedback('move');
    state.history.push(move);state.selected=null;state.lastMove={from:move.from,to:move.to};
    if(HAS_TIMER&&tc.inc>0)clocks[result.color]+=tc.inc;
    syncFromChess();
    state.animating=false;
    if(HAS_TIMER&&state.status==='playing')startClock(state.turn);
    render();
    if(state.status!=='playing'){stopClock();return;}
    if(typeof gameFeedback==='function')gameFeedback('turn');
    gs.schedule(()=>{
      if(!gs.alive())return;
      const aiMoves=chess.moves({verbose:true});
      if(!aiMoves.length)return;
      const mapped=aiMoves.map(m=>({from:sqToRC(m.from),to:sqToRC(m.to),promo:m.promotion?(m.color==='w'?m.promotion.toUpperCase():m.promotion.toLowerCase()):null}));
      const aiMove=getAIMove(chess,mapped);
      if(!aiMove)return;
      const aiPiece=state.board[aiMove.from[0]][aiMove.from[1]];
      state.animating=true;
      animatePieceSlide(aiMove.from,aiMove.to,aiPiece,()=>{
        if(!gs.alive())return;
        const aiResult=chess.move({from:rcToSq(aiMove.from[0],aiMove.from[1]),to:rcToSq(aiMove.to[0],aiMove.to[1]),promotion:'q'});
        if(HAS_TIMER&&tc.inc>0&&aiResult)clocks[aiResult.color]+=tc.inc;
        state.history.push(aiMove);state.lastMove={from:aiMove.from,to:aiMove.to};
        syncFromChess();
        state.animating=false;
        if(typeof gameFeedback==='function')gameFeedback('place');
        render();
        if(HAS_TIMER){
          if(state.status==='playing')startClock(state.turn);
          else stopClock();
        }
      });
    },AI_DEPTH===1?450:700);
  });
}

render();if(HAS_TIMER)startClock('w');
}

// ===================== PROFESSIONAL SNAKES & LADDERS =====================
// ===================== SNAKES & LADDERS — MULTIPLE VERSIONS =====================

const SL_VERSIONS = [
  {
    name: 'Classic',
    emoji: '🐍',
    desc: 'Standard 100-square board',
    squares: 100,
    snakes: {16:6,47:26,49:11,56:53,62:19,64:60,87:24,93:73,95:75,99:78},
    ladders: {1:38,4:14,9:31,20:38,28:84,40:59,51:67,63:81,71:91},
    dice: 1,
    exact: true,
    specialRules: []
  },
  {
    name: 'Vedic',
    emoji: '🕉️',
    desc: 'Ancient Indian version — more snakes, virtue & vice themed',
    squares: 100,
    snakes: {12:2,29:8,44:9,52:37,57:3,62:19,63:22,74:53,85:11,92:51,95:23,99:5},
    ladders: {3:16,10:20,22:60,28:74,36:70,51:67,55:82,63:81,68:91,71:90},
    dice: 1,
    exact: false,
    specialRules: ['bounce']
  },
  {
    name: 'Speed',
    emoji: '⚡',
    desc: 'Two dice, 50-square board — fast & furious',
    squares: 50,
    snakes: {8:3,14:7,22:11,30:20,42:28,47:36},
    ladders: {2:12,5:18,10:24,15:30,25:38,35:42},
    dice: 2,
    exact: false,
    specialRules: ['double_roll']
  },
  {
    name: 'Chaos',
    emoji: '🎲',
    desc: 'Snakes become ladders randomly — fate changes every turn!',
    squares: 100,
    snakes: {16:6,47:26,49:11,56:53,62:19,64:60,87:24,93:73,95:75,99:78},
    ladders: {1:38,4:14,9:31,20:38,28:84,40:59,51:67,63:81,71:91},
    dice: 1,
    exact: false,
    specialRules: ['chaos']
  },
  {
    name: 'Moksha Patam',
    emoji: '🪔',
    desc: 'The original — 72 snakes, 12 ladders. Only the virtuous win.',
    squares: 72,
    snakes: {8:2,16:10,24:6,29:4,44:9,52:37,57:3,62:19,63:22,74:53,85:11,92:51,95:23,99:5,71:30,68:11,66:22,57:32,49:22,45:8,40:22,34:3,32:12,28:14,24:4,18:9,15:8},
    ladders: {3:16,10:20,22:60,28:74,36:70,51:67,55:82,63:81},
    dice: 1,
    exact: true,
    specialRules: ['moksha']
  }
];

function openSnakesGame(chat){
  const version = SL_VERSIONS[Math.floor(Math.random()*SL_VERSIONS.length)];
  openSnakesVersion(chat, version);
}

function openSnakesVersionPicker(chat){
  const sheet = document.createElement('div');
  sheet.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;max-height:80vh;overflow-y:auto;';
  sheet.innerHTML = `
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:4px;">🐍 Choose a version</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Or tap "Random" to let fate decide!</div>
    <button style="width:100%;padding:14px;background:linear-gradient(135deg,var(--game-accent,var(--red)),#8134AF);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:12px;" id="randomSL">🎲 Random version</button>
    ${SL_VERSIONS.map((v,i)=>`
      <button data-i="${i}" style="width:100%;padding:14px;background:var(--cream);border:2px solid var(--line);border-radius:14px;font-size:14px;font-weight:600;cursor:pointer;text-align:left;margin-bottom:8px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:28px;">${v.emoji}</span>
        <div><div style="font-weight:700;">${v.name}</div><div style="font-size:12px;color:var(--muted);">${v.desc}</div></div>
      </button>
    `).join('')}
    <button id="closeSLPicker" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;margin-top:4px;">Cancel</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  document.getElementById('randomSL').addEventListener('click',()=>{sheet.remove();openSnakesGame(chat);});
  document.getElementById('closeSLPicker').addEventListener('click',()=>sheet.remove());
  sheet.querySelectorAll('[data-i]').forEach(btn=>btn.addEventListener('click',()=>{sheet.remove();openSnakesVersion(chat,SL_VERSIONS[parseInt(btn.dataset.i)]);}));
}

function openSnakesVersion(chat, version){
  const SQUARES = version.squares;
  const SNAKES = {...version.snakes};
  let LADDERS = {...version.ladders};
  let pos={me:0,opp:0};let myTurn=true;let rolling=false;let gameOver=false;
  let diceVals=[null,null];let message='';let doubleRoll=false;
  let diceIv=null;let hopping=false;

  function sqNum(r,c,totalRows){
    const row=totalRows-1-r;return row%2===0?row*10+c+1:row*10+(9-c)+1;
  }

  const totalRows=Math.ceil(SQUARES/10);
  const cols=10;

  function getCell(n){
    if(!n||n<1)return null;
    const idx=n-1;const row=Math.floor(idx/10);const col=idx%10;
    return{r:totalRows-1-row,c:row%2===0?col:9-col};
  }

  function cellPct(n){
    const cell=getCell(n);
    if(!cell)return{x:5,y:100};
    return{
      x:((cell.c+0.5)/cols)*100,
      y:((cell.r+0.5)/totalRows)*100
    };
  }

  function pathD(from,to,kind){
    const a=cellPct(from),b=cellPct(to);
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    const dx=b.x-a.x, dy=b.y-a.y;
    const len=Math.hypot(dx,dy)||1;
    const ox=(-dy/len)*(kind==='snake'?10:6);
    const oy=(dx/len)*(kind==='snake'?10:6);
    if(kind==='snake'){
      return `M ${a.x} ${a.y} C ${a.x+dx*0.25+ox} ${a.y+dy*0.25+oy}, ${a.x+dx*0.75-ox} ${a.y+dy*0.75-oy}, ${b.x} ${b.y}`;
    }
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;';
  const gs=beginGameOverlaySession({
    type:'snakes',title:'Snakes & Ladders',mode:'1v1',chat,overlay,
    cleanup(){if(diceIv){clearInterval(diceIv);diceIv=null;}},
  });
  if(!gs.alive())return;

  function diceEmoji(v){return v?['⚀','⚁','⚂','⚃','⚄','⚅'][v-1]:'🎲';}

  function buildPathsSvg(){
    const snakes=Object.entries(SNAKES).map(([f,t])=>{
      const d=pathD(+f,+t,'snake');
      return `<path d="${d}" fill="none" stroke="#c0392b" stroke-width="1.8" stroke-linecap="round" opacity="0.85"/><circle cx="${cellPct(+f).x}" cy="${cellPct(+f).y}" r="1.6" fill="#e74c3c"/><circle cx="${cellPct(+t).x}" cy="${cellPct(+t).y}" r="1.2" fill="#922b21"/>`;
    }).join('');
    const ladders=Object.entries(LADDERS).map(([f,t])=>{
      const a=cellPct(+f),b=cellPct(+t);
      const dx=b.x-a.x, dy=b.y-a.y;
      const len=Math.hypot(dx,dy)||1;
      const ox=(-dy/len)*1.4, oy=(dx/len)*1.4;
      const rails=`<path d="M ${a.x+ox} ${a.y+oy} L ${b.x+ox} ${b.y+oy}" fill="none" stroke="#27ae60" stroke-width="1.1"/><path d="M ${a.x-ox} ${a.y-oy} L ${b.x-ox} ${b.y-oy}" fill="none" stroke="#27ae60" stroke-width="1.1"/>`;
      let rungs='';
      for(let i=1;i<=3;i++){
        const t=i/4;
        rungs+=`<path d="M ${a.x+dx*t+ox} ${a.y+dy*t+oy} L ${a.x+dx*t-ox} ${a.y+dy*t-oy}" stroke="#2ecc71" stroke-width="0.9"/>`;
      }
      return rails+rungs;
    }).join('');
    return `<svg class="snakes-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${snakes}${ladders}</svg>`;
  }

  function placeTokens(){
    const layer=overlay.querySelector('#slTokens');
    if(!layer)return;
    [['me','#e74c3c','You'],['opp','#3498db',chat.name.split(' ')[0]]].forEach(([who,color,label])=>{
      let el=layer.querySelector(`[data-who="${who}"]`);
      if(!el){
        el=document.createElement('div');
        el.className='snakes-token';
        el.dataset.who=who;
        el.title=label;
        el.style.background=color;
        layer.appendChild(el);
      }
      const p=pos[who];
      const pct=p>0?cellPct(p):{x:who==='me'?8:18,y:102};
      el.style.left=pct.x+'%';
      el.style.top=Math.min(pct.y,102)+'%';
      el.style.opacity=p>0||who==='me'?'1':'0.85';
    });
  }

  function hopToken(who,from,to,done){
    hopping=true;
    const steps=[];
    if(from<to){for(let n=from+1;n<=to;n++)steps.push(n);}
    else if(from>to){for(let n=from-1;n>=to;n--)steps.push(n);}
    else{hopping=false;if(done)done();return;}
    let i=0;
    function step(){
      if(!gs.alive()){hopping=false;return;}
      pos[who]=steps[i];
      placeTokens();
      const tok=overlay.querySelector(`.snakes-token[data-who="${who}"]`);
      if(tok){tok.classList.remove('snakes-token--hop');void tok.offsetWidth;tok.classList.add('snakes-token--hop');}
      if(typeof gameFeedback==='function'&&i===0)gameFeedback('move');
      i++;
      if(i<steps.length)gs.schedule(step,from>to?70:95);
      else{hopping=false;if(done)done();}
    }
    step();
  }

  function rollDice(){
    if(!gs.alive()||!myTurn||rolling||gameOver||hopping)return;rolling=true;
    let ticks=0;
    if(diceIv)clearInterval(diceIv);
    diceIv=setInterval(()=>{
      if(!gs.alive()){clearInterval(diceIv);diceIv=null;return;}
      diceVals[0]=Math.floor(Math.random()*6)+1;
      if(version.dice===2)diceVals[1]=Math.floor(Math.random()*6)+1;
      updateHud();ticks++;
      if(ticks>10){
        clearInterval(diceIv);diceIv=null;rolling=false;
        const total=diceVals[0]+(diceVals[1]||0);
        if(version.specialRules.includes('chaos')&&Math.random()<0.2){
          const allKeys=[...Object.keys(SNAKES),...Object.keys(LADDERS)].map(Number);
          const k=allKeys[Math.floor(Math.random()*allKeys.length)];
          if(SNAKES[k]){const v=SNAKES[k];delete SNAKES[k];LADDERS[k]=v;message=`🌀 Chaos! Square ${k} flipped!`;}
          else if(LADDERS[k]){const v=LADDERS[k];delete LADDERS[k];SNAKES[k]=v;message=`🌀 Chaos! Square ${k} flipped!`;}
          rebuildBoardArt();
        }
        if(version.specialRules.includes('double_roll')&&diceVals[0]===diceVals[1]){
          doubleRoll=true;message=`🎲 Doubles! Roll again after this move.`;
        }
        processMove('me',total);
      }
    },80);
  }

  function processMove(who,roll){
    if(!gs.alive())return;
    const start=pos[who];
    let newPos=start+roll;
    if(version.specialRules.includes('bounce')&&newPos>SQUARES){newPos=SQUARES*2-newPos;}
    else if(!version.exact&&newPos>SQUARES){newPos=SQUARES;}
    else if(version.exact&&newPos>SQUARES){message=`Need exactly ${SQUARES-start} to finish. Miss!`;updateHud();endTurn(who);return;}

    hopToken(who,start,newPos,()=>{
      const dest=SNAKES[newPos]||LADDERS[newPos];
      if(dest){
        const isSnake=!!SNAKES[newPos];
        message=isSnake?`🐍 Snake! ${newPos}→${dest}`:`🪜 Ladder! ${newPos}→${dest}`;
        updateHud();
        hopToken(who,newPos,dest,()=>finishMove(who));
      } else finishMove(who);
    });
  }

  function finishMove(who){
    if(!gs.alive())return;
    if(pos[who]>=SQUARES){
      gameOver=true;message=who==='me'?'🎉 You win!':chat.name+' wins!';
      gs.setOutcome(who==='me'?'won':'lost');
      if(typeof recordGameResult==='function')recordGameResult('snakes',who==='me');
      updateHud();return;
    }
    endTurn(who);
  }

  function endTurn(who){
    if(!gs.alive()||gameOver)return;
    if(who==='me'&&doubleRoll){doubleRoll=false;updateHud();return;}
    if(who==='me'){
      myTurn=false;updateHud();
      gs.schedule(()=>{
        if(!gs.alive())return;
        const r=Math.floor(Math.random()*6)+1+(version.dice===2?Math.floor(Math.random()*6)+1:0);
        diceVals[0]=((r-1)%6)+1;
        if(version.dice===2)diceVals[1]=Math.floor(Math.random()*6)+1;
        updateHud();
        processMove('opp',r);
      },700);
    }
    else{myTurn=true;message='';updateHud();}
  }

  function rebuildBoardArt(){
    const art=overlay.querySelector('#slPathsHost');
    if(art)art.innerHTML=buildPathsSvg();
  }

  function updateHud(){
    const msgEl=overlay.querySelector('#slMsg');
    if(msgEl){
      msgEl.style.display=message?'block':'none';
      msgEl.textContent=message;
    }
    const meEl=overlay.querySelector('#slPosMe');
    const oppEl=overlay.querySelector('#slPosOpp');
    if(meEl)meEl.textContent=pos.me;
    if(oppEl)oppEl.textContent=pos.opp;
    const dice0=overlay.querySelector('#slDice0');
    const dice1=overlay.querySelector('#slDice1');
    if(dice0)dice0.textContent=diceEmoji(diceVals[0]);
    if(dice1)dice1.textContent=diceEmoji(diceVals[1]);
    const rollBtn=overlay.querySelector('#rollBtn');
    if(rollBtn){
      rollBtn.disabled=!(myTurn&&!gameOver&&!rolling&&!hopping);
      rollBtn.style.background=myTurn&&!gameOver?'var(--game-accent,var(--red))':'rgba(255,255,255,0.1)';
      rollBtn.textContent=gameOver?'Game Over!':(myTurn?`🎲 Roll${doubleRoll?' Again!':''}`:chat.name.split(' ')[0]+' rolling...');
    }
    const meCard=overlay.querySelector('#slMeCard');
    const oppCard=overlay.querySelector('#slOppCard');
    if(meCard){meCard.style.borderColor=myTurn&&!gameOver?'var(--game-accent,var(--red))':'transparent';meCard.style.background=myTurn&&!gameOver?'color-mix(in srgb,var(--game-accent,var(--red)) 28%,transparent)':'rgba(255,255,255,0.05)';}
    if(oppCard){oppCard.style.borderColor=!myTurn&&!gameOver?'#5BA3D9':'transparent';oppCard.style.background=!myTurn&&!gameOver?'rgba(91,163,217,0.3)':'rgba(255,255,255,0.05)';}
  }

  function render(){
    if(!gs.alive())return;
    let cells='';
    for(let r=0;r<totalRows;r++){
      for(let c=0;c<cols;c++){
        const n=sqNum(r,c,totalRows);
        if(n>SQUARES){cells+=`<div class="snakes-cell snakes-cell--empty"></div>`;continue;}
        const hasSnake=SNAKES[n];const hasLadder=LADDERS[n];
        const cls=n===SQUARES?'snakes-cell--finish':hasSnake?'snakes-cell--snake':hasLadder?'snakes-cell--ladder':'';
        cells+=`<div class="snakes-cell ${cls}" data-n="${n}"><span class="snakes-cell-num">${n}</span></div>`;
      }
    }
    overlay.innerHTML=`
      ${gameChromeHtml({title:version.name,subtitle:version.desc,backId:'slBack'})}
      <div style="display:flex;gap:8px;padding:8px 12px;flex-shrink:0;">
        <div id="slMeCard" style="flex:1;background:${myTurn&&!gameOver?'color-mix(in srgb,var(--game-accent,var(--red)) 28%,transparent)':'rgba(255,255,255,0.05)'};border:2px solid ${myTurn&&!gameOver?'var(--game-accent,var(--red))':'transparent'};border-radius:12px;padding:8px;text-align:center;">
          <div style="color:#ccc;font-size:11px;font-weight:700;">🔴 You</div>
          <div id="slPosMe" style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;color:var(--gold);">${pos.me}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;flex:0 0 70px;">
          <span id="slDice0" style="font-size:${version.dice===2?'28px':'36px'};">${diceEmoji(diceVals[0])}</span>
          ${version.dice===2?`<span id="slDice1" style="font-size:28px;">${diceEmoji(diceVals[1])}</span>`:''}
        </div>
        <div id="slOppCard" style="flex:1;background:${!myTurn&&!gameOver?'rgba(91,163,217,0.3)':'rgba(255,255,255,0.05)'};border:2px solid ${!myTurn&&!gameOver?'#5BA3D9':'transparent'};border-radius:12px;padding:8px;text-align:center;">
          <div style="color:#ccc;font-size:11px;font-weight:700;">🔵 ${chat.name.split(' ')[0]}</div>
          <div id="slPosOpp" style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;color:var(--gold);">${pos.opp}</div>
        </div>
      </div>
      <div class="snakes-board-wrap">
        <div class="snakes-board" style="--sl-rows:${totalRows}">
          <div class="snakes-grid">${cells}</div>
          <div id="slPathsHost">${buildPathsSvg()}</div>
          <div id="slTokens" class="snakes-tokens"></div>
        </div>
      </div>
      <div id="slMsg" style="padding:8px 16px;text-align:center;color:var(--gold);font-weight:700;font-size:13px;background:rgba(255,201,60,0.1);border-top:1px solid rgba(255,201,60,0.2);flex-shrink:0;display:${message?'block':'none'};">${message}</div>
      <div style="padding:10px 12px;padding-bottom:max(10px,env(safe-area-inset-bottom));flex-shrink:0;">
        <button id="rollBtn" class="game-tap-target" style="width:100%;padding:13px;background:${myTurn&&!gameOver?'var(--game-accent,var(--red))':'rgba(255,255,255,0.1)'};color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;">
          ${gameOver?'Game Over!':(myTurn?`🎲 Roll${doubleRoll?' Again!':''}`:chat.name.split(' ')[0]+' rolling...')}
        </button>
      </div>
    `;
    document.getElementById('slBack').addEventListener('click',()=>gs.close());
    document.getElementById('rollBtn').addEventListener('click',rollDice);
    placeTokens();
  }
  render();
}

// ===================== LUDO ENGINE =====================
function openLudoGame(chat, playerCount){
  playerCount = Math.min(Math.max(playerCount||2,2),4);
  const COLORS=['red','blue','green','yellow'];
  const COLOR_STYLES={red:'#E74C3C',blue:'#3498DB',green:'#2ECC71',yellow:'#F1C40F'};
  const NAMES=['You',chat.name,...(playerCount>2?['Player 3']:[]),(playerCount>3?'Player 4':'')].filter(Boolean).slice(0,playerCount);

  // 15×15 path (52 squares), clockwise from red start
  const LUDO_PATH=[
    [6,1],[6,2],[6,3],[6,4],[6,5],
    [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
    [0,7],
    [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
    [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
    [7,14],
    [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
    [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
    [14,7],
    [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
    [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
    [7,0],[6,0],
  ];
  const START_POS={red:0,blue:13,green:26,yellow:39};
  const SAFE_SQUARES=[0,8,13,21,26,34,39,47];
  const HOME_CELLS={
    red:[[7,1],[7,2],[7,3],[7,4],[7,5]],
    blue:[[1,7],[2,7],[3,7],[4,7],[5,7]],
    green:[[7,13],[7,12],[7,11],[7,10],[7,9]],
    yellow:[[13,7],[12,7],[11,7],[10,7],[9,7]],
  };
  const YARD_CELLS={
    red:[[2,2],[2,3],[3,2],[3,3]],
    blue:[[2,11],[2,12],[3,11],[3,12]],
    green:[[11,11],[11,12],[12,11],[12,12]],
    yellow:[[11,2],[11,3],[12,2],[12,3]],
  };
  const YARD_ZONE={
    red:{r0:0,r1:5,c0:0,c1:5},
    blue:{r0:0,r1:5,c0:9,c1:14},
    green:{r0:9,r1:14,c0:9,c1:14},
    yellow:{r0:9,r1:14,c0:0,c1:5},
  };

  let pieces={};
  let currentPlayer=0;let diceVal=null;let rolling=false;let phase='roll';
  let message='';let gameOver=false;let diceIv=null;let animating=false;
  let moveableSet=new Set();

  COLORS.slice(0,playerCount).forEach(color=>{
    pieces[color]=[{pos:-1,progress:0,finished:false},{pos:-1,progress:0,finished:false},{pos:-1,progress:0,finished:false},{pos:-1,progress:0,finished:false}];
  });
  const players=COLORS.slice(0,playerCount);

  function pieceCell(color,p){
    if(p.finished)return[7,7];
    if(p.pos===-1){
      const yi=pieces[color].indexOf(p);
      return YARD_CELLS[color][yi]||YARD_CELLS[color][0];
    }
    if(p.progress>51){
      const hi=p.progress-52;
      return HOME_CELLS[color][hi]||[7,7];
    }
    return LUDO_PATH[p.pos]||[7,7];
  }

  function isMoveable(color,pi){
    const p=pieces[color][pi];
    if(!p||p.finished)return false;
    if(p.pos===-1)return diceVal===6;
    const next=p.progress+diceVal;
    return next<=57;
  }

  function refreshMoveable(){
    moveableSet.clear();
    const color=players[currentPlayer];
    pieces[color].forEach((_,pi)=>{if(isMoveable(color,pi))moveableSet.add(color+':'+pi);});
  }

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;';
  const gs=beginGameOverlaySession({
    type:'ludo',title:'Ludo',mode:playerCount>2?'group':'1v1',chat,overlay,
    cleanup(){if(diceIv){clearInterval(diceIv);diceIv=null;}},
  });
  if(!gs.alive())return;

  function cellEl(r,c){
    return overlay.querySelector(`.ludo-cell[data-r="${r}"][data-c="${c}"]`);
  }

  function placeTokens(){
    const layer=overlay.querySelector('#ludoTokens');
    if(!layer)return;
    players.forEach(color=>{
      pieces[color].forEach((p,pi)=>{
        const id=color+'-'+pi;
        let tok=layer.querySelector(`[data-id="${id}"]`);
        if(!tok){
          tok=document.createElement('button');
          tok.type='button';
          tok.className='ludo-token game-tap-target';
          tok.dataset.id=id;
          tok.dataset.color=color;
          tok.dataset.pi=String(pi);
          tok.style.background=COLOR_STYLES[color];
          layer.appendChild(tok);
        }
        const [r,c]=pieceCell(color,p);
        tok.style.left=((c+0.5)/15*100)+'%';
        tok.style.top=((r+0.5)/15*100)+'%';
        tok.classList.toggle('ludo-token--home',!!p.finished);
        tok.classList.toggle('ludo-token--yard',p.pos===-1&&!p.finished);
        tok.classList.toggle('ludo-token--moveable',phase==='move'&&moveableSet.has(color+':'+pi));
        tok.disabled=!(phase==='move'&&currentPlayer===0&&moveableSet.has(color+':'+pi));
      });
    });
  }

  function animateAlong(color,pi,fromProgress,toProgress,onDone){
    animating=true;
    const steps=[];
    if(fromProgress<0){
      // leave yard → start
      steps.push({progress:1,pos:START_POS[color]});
    } else {
      for(let pr=fromProgress+1;pr<=toProgress;pr++){
        if(pr>57)break;
        if(pr===57)steps.push({progress:57,pos:START_POS[color],finished:true});
        else if(pr>51)steps.push({progress:pr,pos:START_POS[color]});
        else steps.push({progress:pr,pos:(START_POS[color]+pr-1)%52});
      }
    }
    let i=0;
    const p=pieces[color][pi];
    function step(){
      if(!gs.alive()){animating=false;return;}
      if(i>=steps.length){animating=false;if(onDone)onDone();return;}
      const s=steps[i++];
      p.progress=s.progress;
      p.pos=s.finished?-1:s.pos;
      p.finished=!!s.finished;
      placeTokens();
      const tok=overlay.querySelector(`[data-id="${color}-${pi}"]`);
      if(tok){tok.classList.remove('ludo-token--hop');void tok.offsetWidth;tok.classList.add('ludo-token--hop');}
      if(typeof gameFeedback==='function'&&i===1)gameFeedback('move');
      gs.schedule(step,90);
    }
    if(!steps.length){animating=false;if(onDone)onDone();return;}
    step();
  }

  function rollDice(){
    if(!gs.alive()||phase!=='roll'||rolling||gameOver||animating)return;
    rolling=true;let ticks=0;
    if(diceIv)clearInterval(diceIv);
    diceIv=setInterval(()=>{
      if(!gs.alive()){clearInterval(diceIv);diceIv=null;return;}
      diceVal=Math.floor(Math.random()*6)+1;updateHud();ticks++;
      if(ticks>10){
        clearInterval(diceIv);diceIv=null;rolling=false;
        const color=players[currentPlayer];
        refreshMoveable();
        if(!moveableSet.size){
          message=`${NAMES[currentPlayer]} has no moves — pass`;
          updateHud();
          nextPlayer();
          return;
        }
        phase='move';
        if(moveableSet.size===1){
          const only=[...moveableSet][0];
          const pi=parseInt(only.split(':')[1],10);
          movePiece(color,pi);
          return;
        }
        message=`${NAMES[currentPlayer]}: tap a glowing piece`;
        updateHud();
        placeTokens();
      }
    },80);
  }

  function movePiece(color,pieceIdx){
    if(animating||gameOver)return;
    const p=pieces[color][pieceIdx];
    if(!isMoveable(color,pieceIdx)){message='Need a 6 to enter!';updateHud();return;}
    const fromProgress=p.pos===-1?-1:p.progress;
    let toProgress;
    if(p.pos===-1){
      toProgress=1;
    } else {
      toProgress=p.progress+diceVal;
      if(toProgress>57){message='Need exact roll to finish';updateHud();return;}
    }
    phase='anim';
    animateAlong(color,pieceIdx,fromProgress,toProgress,()=>{
      // Capture
      if(!p.finished&&p.pos!==-1&&p.progress<=51&&!SAFE_SQUARES.includes(p.pos)){
        players.forEach(oc=>{
          if(oc===color)return;
          pieces[oc].forEach((op,opi)=>{
            if(!op.finished&&op.pos===p.pos&&op.progress>0&&op.progress<=51){
              op.pos=-1;op.progress=0;
              message=`${NAMES[players.indexOf(color)]} captured!`;
              const tok=overlay.querySelector(`[data-id="${oc}-${opi}"]`);
              if(tok){tok.classList.add('ludo-token--captured');gs.schedule(()=>tok.classList.remove('ludo-token--captured'),400);}
              if(typeof gameFeedback==='function')gameFeedback('place');
            }
          });
        });
      }
      if(p.finished)message=`${NAMES[currentPlayer]} piece home!`;
      placeTokens();
      const allFinished=pieces[color].every(x=>x.finished);
      if(allFinished){
        gameOver=true;message=`🎉 ${NAMES[currentPlayer]} wins!`;
        gs.setOutcome(currentPlayer===0?'won':'lost');
        if(typeof recordGameResult==='function')recordGameResult('ludo',currentPlayer===0);
        phase='roll';updateHud();return;
      }
      phase='roll';
      if(diceVal===6){message=`🎲 ${NAMES[currentPlayer]} rolls again!`;updateHud();return;}
      nextPlayer();
    });
  }

  function nextPlayer(){
    if(!gs.alive())return;
    currentPlayer=(currentPlayer+1)%playerCount;phase='roll';moveableSet.clear();
    updateHud();placeTokens();
    if(currentPlayer!==0)gs.schedule(aiMove,900);
  }

  function aiMove(){
    if(!gs.alive()||gameOver||currentPlayer===0||animating)return;
    const color=players[currentPlayer];
    diceVal=Math.floor(Math.random()*6)+1;updateHud();
    gs.schedule(()=>{
      if(!gs.alive()||gameOver)return;
      refreshMoveable();
      if(!moveableSet.size){nextPlayer();return;}
      const picks=[...moveableSet].map(k=>parseInt(k.split(':')[1],10));
      movePiece(color,picks[Math.floor(Math.random()*picks.length)]);
    },500);
  }

  function cellKind(r,c){
    for(const col of COLORS){
      const z=YARD_ZONE[col];
      if(r>=z.r0&&r<=z.r1&&c>=z.c0&&c<=z.c1){
        const inPath=LUDO_PATH.some(([pr,pc])=>pr===r&&pc===c);
        const inHome=HOME_CELLS[col].some(([hr,hc])=>hr===r&&hc===c);
        if(!inPath&&!inHome&&!(r===7&&c===7))return{type:'yard',color:col};
      }
    }
    if(r===7&&c===7)return{type:'center'};
    for(const col of COLORS){
      if(HOME_CELLS[col].some(([hr,hc])=>hr===r&&hc===c))return{type:'home',color:col};
    }
    const pathIdx=LUDO_PATH.findIndex(([pr,pc])=>pr===r&&pc===c);
    if(pathIdx>=0)return{type:'path',idx:pathIdx,safe:SAFE_SQUARES.includes(pathIdx)};
    // cross arms fill
    if((r>=6&&r<=8)||(c>=6&&c<=8))return{type:'pathfill'};
    return{type:'void'};
  }

  function updateHud(){
    const diceEmojis=['⚀','⚁','⚂','⚃','⚄','⚅'];
    const diceEl=overlay.querySelector('#ludoDice');
    if(diceEl)diceEl.textContent=diceVal?diceEmojis[diceVal-1]:'🎲';
    const msgEl=overlay.querySelector('#ludoMsg');
    if(msgEl){msgEl.style.display=message?'block':'none';msgEl.textContent=message;}
    const rollBtn=overlay.querySelector('#ludoRoll');
    const color=players[currentPlayer];
    if(rollBtn){
      const can=phase==='roll'&&currentPlayer===0&&!gameOver&&!rolling&&!animating;
      rollBtn.disabled=!can;
      rollBtn.style.background=can?COLOR_STYLES[color]:'rgba(255,255,255,0.1)';
      rollBtn.textContent=gameOver?'Game Over!':phase==='roll'&&currentPlayer===0?'🎲 Roll Dice':phase==='move'&&currentPlayer===0?'Tap a glowing piece':'Opponents playing...';
    }
    players.forEach((c,i)=>{
      const card=overlay.querySelector(`[data-player-card="${i}"]`);
      if(!card)return;
      card.style.borderColor=currentPlayer===i?COLOR_STYLES[c]:'transparent';
      card.style.background=currentPlayer===i?COLOR_STYLES[c]+'33':'rgba(255,255,255,0.05)';
      const home=card.querySelector('.ludo-home-count');
      if(home)home.textContent=`${pieces[c].filter(p=>p.finished).length}/4 🏠`;
    });
  }

  function renderLudo(){
    let grid='';
    for(let r=0;r<15;r++){
      for(let c=0;c<15;c++){
        const k=cellKind(r,c);
        let cls='ludo-cell';
        let style='';
        if(k.type==='yard'){cls+=' ludo-cell--yard';style=`background:${COLOR_STYLES[k.color]}33;`;}
        else if(k.type==='home'){cls+=' ludo-cell--home';style=`background:${COLOR_STYLES[k.color]};`;}
        else if(k.type==='center'){cls+=' ludo-cell--center';}
        else if(k.type==='path'||k.type==='pathfill'){
          cls+=' ludo-cell--path';
          if(k.safe)cls+=' ludo-cell--safe';
          // start squares tint
          Object.entries(START_POS).forEach(([col,idx])=>{
            if(k.idx===idx)style=`background:${COLOR_STYLES[col]}55;`;
          });
        } else cls+=' ludo-cell--void';
        grid+=`<div class="${cls}" data-r="${r}" data-c="${c}" style="${style}"></div>`;
      }
    }
    const color=players[currentPlayer];
    const diceEmojis=['⚀','⚁','⚂','⚃','⚄','⚅'];
    overlay.innerHTML=`
      ${gameChromeHtml({title:'Ludo',subtitle:playerCount>2?`${playerCount} players`:'1 vs 1',backId:'ludoBack'})}
      <div style="display:flex;gap:6px;padding:8px 12px;overflow-x:auto;flex-shrink:0;">
        ${players.map((c,i)=>`<div data-player-card="${i}" style="flex:1;min-width:60px;background:${currentPlayer===i?COLOR_STYLES[c]+'33':'rgba(255,255,255,0.05)'};border:2px solid ${currentPlayer===i?COLOR_STYLES[c]:'transparent'};border-radius:10px;padding:6px;text-align:center;"><div style="color:${COLOR_STYLES[c]};font-size:10px;font-weight:700;">${NAMES[i]}</div><div class="ludo-home-count" style="font-size:11px;color:#ccc;">${pieces[c].filter(p=>p.finished).length}/4 🏠</div></div>`).join('')}
      </div>
      <div class="ludo-board-wrap">
        <div class="ludo-board" aria-label="Ludo board">
          ${grid}
          <div id="ludoTokens" class="ludo-tokens"></div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:6px 12px;flex-shrink:0;">
        <div id="ludoDice" style="font-size:40px;line-height:1;">${diceVal?diceEmojis[diceVal-1]:'🎲'}</div>
        <div id="ludoMsg" style="flex:1;font-size:12px;font-weight:700;color:var(--gold);text-align:center;display:${message?'block':'none'};">${message}</div>
      </div>
      ${typeof gameTurnBannerHtml==='function'
        ? gameTurnBannerHtml({
            mode: gameOver?'over':currentPlayer===0?'yours':'theirs',
            label: gameOver?'Game over':currentPlayer===0?(phase==='roll'?'Your turn — roll':phase==='move'?'Your turn — tap a piece':'Your turn'):'Waiting for opponents…',
            pulse: !gameOver && currentPlayer===0,
          })
        : ''}
      <div style="padding:10px 12px;padding-bottom:max(10px,env(safe-area-inset-bottom));flex-shrink:0;">
        <button id="ludoRoll" class="game-tap-target" style="width:100%;min-height:48px;padding:13px;background:${phase==='roll'&&currentPlayer===0&&!gameOver?COLOR_STYLES[color]:'rgba(255,255,255,0.1)'};color:#fff;border:none;border-radius:var(--game-btn-radius,14px);font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;">
          ${gameOver?'Game Over!':phase==='roll'&&currentPlayer===0?'🎲 Roll Dice':phase==='move'&&currentPlayer===0?'Tap a glowing piece':'Opponents playing...'}
        </button>
      </div>
    `;
    document.getElementById('ludoBack').addEventListener('click',()=>gs.close());
    document.getElementById('ludoRoll').addEventListener('click',()=>{if(currentPlayer===0&&phase==='roll'&&!gameOver){if(typeof gameFeedback==='function')gameFeedback('select');rollDice();}});
    const layer=overlay.querySelector('#ludoTokens');
    layer.addEventListener('click',(e)=>{
      const tok=e.target.closest('.ludo-token');
      if(!tok||phase!=='move'||currentPlayer!==0||animating)return;
      const c=tok.dataset.color,pi=parseInt(tok.dataset.pi,10);
      if(moveableSet.has(c+':'+pi))movePiece(c,pi);
    });
    placeTokens();
  }
  renderLudo();
}

// ===================== OH NO! CARDS ENGINE (Classic, Double Sided, Blaze Mode) =====================
function openUnoGame(chat, variant='normal'){
  const COLORS_UNO=['red','yellow','green','blue'];
  const COLOR_HEX={red:'#E74C3C',yellow:'#F1C40F',green:'#2ECC71',blue:'#3498DB',wild:'#2C3E50',black:'#1a1a2e'};
  const NUMBER_CARDS=[0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9];
  const ACTION_CARDS=['skip','skip','reverse','reverse','draw2','draw2'];
  const FLIP_DARK_ACTIONS=['skip_all','draw_all_5','wild_dark'];

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

  let deck=shuffle(buildDeck(variant));
  let discardPile=[];let hands={me:[],opp:[]};let currentColor='';let currentValue='';
  let myTurn=true;let direction=1;let drawStack=0;let flipped=false;
  let message='';let gameOver=false;let selectedCard=null;let pickingColor=false;
  let unoCallWindow=false;

  // Deal 7 cards each
  for(let i=0;i<7;i++){hands.me.push(deck.pop());hands.opp.push(deck.pop());}
  // First card
  let firstCard=deck.pop();
  while(firstCard.type==='wild'){deck.unshift(firstCard);firstCard=deck.pop();}
  discardPile.push(firstCard);currentColor=firstCard.color;currentValue=firstCard.value;

  const NAMES=['You',chat.name];
  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;';
  const gs=beginGameOverlaySession({
    type:'uno',title:'Oh, No! Cards',mode:'1v1',chat,overlay,
  });
  if(!gs.alive())return;

  function drawCard(who,count=1){
    for(let i=0;i<count;i++){
      if(!deck.length){deck=shuffle(discardPile.slice(0,-1));discardPile=[discardPile[discardPile.length-1]];}
      if(deck.length)hands[who].push(deck.pop());
    }
  }

  function canPlay(card){
    if(card.type==='wild')return true;
    if(variant==='blaze'&&card.value==='draw4')return true;
    if(card.color===currentColor)return true;
    if(card.value===currentValue)return true;
    return false;
  }

  function applyCard(card,who,chosenColor){
    if(typeof gameFeedback==='function')gameFeedback(who==='me'?'card':'place');
    discardPile.push(card);
    currentColor=card.type==='wild'?(chosenColor||'red'):card.color;
    currentValue=card.value;
    const opp=who==='me'?'opp':'me';
    switch(card.value){
      case 'skip':myTurn=who==='me';message=`${who==='me'?chat.name:NAMES[0]} skipped!`;break;
      case 'reverse':direction*=-1;message='Direction reversed!';if(variant==='blaze')myTurn=who==='me';break;
      case 'draw2':drawStack+=2;if(variant==='blaze'){drawCard(opp,2);message=`+2! ${opp==='me'?'You':chat.name} draws 2`;myTurn=who!=='me';}else{message=`+2 pending!`;myTurn=who!=='me';}break;
      case 'draw4':case 'wild_draw4':
        if(variant==='blaze'){drawCard(opp,4);message=`+4! ${opp==='me'?'You':chat.name} draws 4`;}
        else{drawStack+=4;message=`+4 pending!`;}
        myTurn=who!=='me';break;
      case 'wild_draw6':drawCard(opp,6);message=`💀 +6! ${opp==='me'?'You':chat.name} draws 6!`;myTurn=who!=='me';break;
      case 'draw_all_5':drawCard(opp,5);message=`+5! ${opp==='me'?'You':chat.name} draws 5`;myTurn=who!=='me';break;
      case 'wild_dark':currentColor=chosenColor||card.color||'red';myTurn=who!=='me';break;
      case 'skip_all':message='Skip all! Play again!';break;
      case 'flip':flipped=!flipped;message=`🔄 Deck flipped! ${flipped?'Dark side':'Light side'}`;break;
      case 'wild':myTurn=who!=='me';break;
      default:myTurn=who!=='me';
    }
    // Check UNO
    if(hands[who].length===1){unoCallWindow=true;message=(who==='me'?'You call':'AI calls')+' \'Oh, No!\' 🗣️';gs.schedule(()=>{unoCallWindow=false;},2000);}
    if(hands[who].length===0){
      gameOver=true;message=(who==='me'?'🎉 You win!':chat.name+' wins!')+' Oh, No!';
      gs.setOutcome(who==='me'?'won':'lost');
      if(typeof recordGameResult==='function')recordGameResult('uno',who==='me');
    }
  }

  function cardBg(card){
    if(card.type==='wild'||card.color==='wild')return'linear-gradient(135deg,#E74C3C,#F1C40F,#2ECC71,#3498DB)';
    if(card.color==='black')return'#2C3E50';
    return COLOR_HEX[card.color]||'#666';
  }

  function cardLabel(card){
    const labels={'skip':'🚫','reverse':'🔄','draw2':'+2','wild':'🌈','wild_draw4':'+4','wild_draw6':'+6','skip_all':'🚫ALL','draw_all_5':'+5ALL','wild_dark':'🌑','flip':'🔄FLIP','draw4':'+4'};
    return labels[card.value]||card.value;
  }

  function renderCard(card,small=false,selected=false,playable=false){
    const colorName=card.type==='wild'||card.color==='wild'?'wild':(card.color||'');
    const pattern=colorName&&colorName!=='wild'?` background-image:repeating-linear-gradient(${colorName==='red'||colorName==='yellow'?'45deg':'-45deg'},transparent,transparent 3px,rgba(255,255,255,0.18) 3px,rgba(255,255,255,0.18) 4px);`:'';
    return `<div class="uno-card" role="img" aria-label="${colorName} ${cardLabel(card)}" style="width:${small?'36px':'52px'};height:${small?'52px':'76px'};min-width:${small?36:44}px;background:${cardBg(card)};${pattern}border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:${small?'11px':'15px'};color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.5);border:${selected?'3px solid white':playable?'2px solid rgba(255,255,255,0.6)':'2px solid rgba(0,0,0,0.2)'};cursor:${playable?'pointer':'default'};flex-shrink:0;transform:${selected?'translateY(-10px)':'none'};transition:transform var(--duration-fast,150ms) var(--ease-spring,cubic-bezier(0.34,1.56,0.64,1));box-shadow:${selected?'0 4px 12px rgba(0,0,0,0.5)':''}"><span>${cardLabel(card)}</span>${!small&&colorName&&colorName!=='wild'?`<span style="font-size:8px;letter-spacing:0.04em;opacity:0.9;text-transform:uppercase;">${colorName.slice(0,1)}</span>`:''}</div>`;
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
    const spread=Math.min(42,220/n);
    return hands.me.map((card,i)=>{
      const playable=myTurn&&!pickingColor&&canPlay(card)&&(!drawStack||card.value==='draw2'||card.value.includes('draw'));
      const mid=(n-1)/2;
      const rot=(i-mid)*spread*0.08;
      const y=Math.abs(i-mid)*1.5;
      return `<div data-i="${i}" class="uno-hand-card" style="transform:rotate(${rot}deg) translateY(${selectedCard===i?-14:y}px);scroll-snap-align:center;">${renderCard(card,false,selectedCard===i,playable)}</div>`;
    }).join('');
  }

  function render(){
    const bgColor=flipped?'#2C3E50':'#1a1a2e';
    const topCard=discardPile[discardPile.length-1];
    overlay.style.background=bgColor;
    overlay.innerHTML=`
      ${gameChromeHtml({title:'Oh, No!',subtitle:variant==='classic'?'Classic':variant==='doublesided'?(flipped?'Flip · Dark side':'Flip'):'Blaze Mode',backId:'unoBack',rightHtml:`<button id="unoUnoBtn" class="game-chrome-action ${unoCallWindow?'is-active':''}">Oh No!</button>`})}

      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;">
        <div style="padding:10px 16px;flex-shrink:0;">
          <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:6px;">${chat.name} — ${hands.opp.length} cards</div>
          <div style="display:flex;justify-content:center;height:56px;">
            ${hands.opp.map((_,i)=>{const mid=(hands.opp.length-1)/2;const rot=(i-mid)*4;return`<div style="width:36px;height:52px;background:linear-gradient(135deg,#c0392b,#8e44ad);border-radius:6px;border:2px solid rgba(255,255,255,0.2);flex-shrink:0;margin-right:-18px;transform:rotate(${rot}deg);"></div>`;}).join('')}
          </div>
        </div>

        <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:20px;padding:10px;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
            <div id="deckBtn" class="game-tap-target" style="width:52px;height:76px;background:linear-gradient(135deg,#c0392b,#8e44ad);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:${myTurn&&!pickingColor?'pointer':'default'};border:2px solid rgba(255,255,255,0.3);">🃏</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.4);">${deck.length} left</div>
          </div>
          <div id="unoDiscard" style="display:flex;flex-direction:column;align-items:center;gap:6px;">
            ${renderCard(topCard,false,false,false)}
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="width:14px;height:14px;border-radius:50%;background:${COLOR_HEX[currentColor]};border:2px solid rgba(255,255,255,0.4);"></div>
              <div style="font-size:10px;color:rgba(255,255,255,0.5);">${currentColor}</div>
            </div>
          </div>
        </div>

        ${message?`<div style="padding:8px 16px;text-align:center;color:var(--gold);font-weight:700;font-size:13px;background:rgba(255,201,60,0.1);flex-shrink:0;">${message}</div>`:''}

        ${pickingColor?`
        <div style="padding:10px 16px;flex-shrink:0;">
          <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-bottom:8px;text-align:center;font-weight:700;">Choose a color:</div>
          <div style="display:flex;gap:8px;justify-content:center;">
            ${COLORS_UNO.map(c=>`<button data-color="${c}" class="game-tap-target" aria-label="${c}" style="min-width:52px;min-height:52px;padding:6px 8px;background:${COLOR_HEX[c]};border:none;border-radius:12px;cursor:pointer;font-size:11px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.5);box-shadow:0 2px 8px rgba(0,0,0,0.4);background-image:repeating-linear-gradient(${c==='red'||c==='yellow'?'45deg':'-45deg'},transparent,transparent 3px,rgba(255,255,255,0.2) 3px,rgba(255,255,255,0.2) 4px);">${c.slice(0,1).toUpperCase()}</button>`).join('')}
          </div>
        </div>`:''}

        <div style="padding:10px 8px max(16px,env(safe-area-inset-bottom));flex-shrink:0;">
          <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:6px;padding:0 8px;">Your hand — ${hands.me.length} cards${drawStack>0?` · <span style="color:#E74C3C;font-weight:700;">+${drawStack} pending!</span>`:''}</div>
          <div id="unoHand" style="display:flex;gap:0;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding:18px 20px 8px;justify-content:${hands.me.length<6?'center':'flex-start'};">
            ${fanHandHtml()}
          </div>
          ${typeof gameTurnBannerHtml==='function'
            ? gameTurnBannerHtml({ mode: myTurn&&!pickingColor?'yours':(gameOver?'over':'waiting'), label: myTurn&&!pickingColor?'Your turn — tap a card':(pickingColor?'Pick a color':'Waiting for opponent…'), pulse: myTurn&&!pickingColor })
            : `<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;text-align:center;">${myTurn&&!pickingColor?'Tap a card to play':'Waiting...'}</div>`}
        </div>
      </div>
    `;

    document.getElementById('unoBack').addEventListener('click',()=>gs.close());
    document.getElementById('unoUnoBtn').addEventListener('click',()=>{if(hands.me.length===2)unoCallWindow=true;});

    function playFromHand(i,chosenColor){
      const card=hands.me[i];
      if(!card)return;
      const el=overlay.querySelector(`[data-i="${i}"]`);
      flyCardToDiscard(el,card,()=>{
        if(!gs.alive())return;
        hands.me.splice(i,1);
        applyCard(card,'me',chosenColor);
        selectedCard=null;pickingColor=false;
        render();
        if(!gameOver&&!myTurn)gs.schedule(aiPlayUno,900);
      });
    }

    overlay.querySelectorAll('[data-i]').forEach(el=>{
      const i=parseInt(el.dataset.i);const card=hands.me[i];
      const playable=myTurn&&!pickingColor&&canPlay(card)&&(!drawStack||card.value==='draw2'||card.value.includes('draw'));
      if(playable)el.addEventListener('click',()=>{
        if(card.type==='wild'||card.color==='wild'){selectedCard=i;pickingColor=true;render();}
        else playFromHand(i);
      });
    });

    if(pickingColor)overlay.querySelectorAll('[data-color]').forEach(el=>{
      el.addEventListener('click',()=>playFromHand(selectedCard,el.dataset.color));
    });

    document.getElementById('deckBtn').addEventListener('click',()=>{
      if(!myTurn||pickingColor)return;
      if(drawStack>0){drawCard('me',drawStack);message=`You drew ${drawStack} cards!`;drawStack=0;myTurn=false;render();gs.schedule(aiPlayUno,900);return;}
      drawCard('me',1);
      const drawn=hands.me[hands.me.length-1];
      if(canPlay(drawn)){selectedCard=hands.me.length-1;message='Drew a playable card — tap it to play or skip';render();}
      else{message='No playable card — passing';myTurn=false;render();gs.schedule(aiPlayUno,900);}
    });
  }

  function aiPlayUno(){
    if(!gs.alive()||gameOver||myTurn)return;
    if(drawStack>0){drawCard('opp',drawStack);message=`${chat.name} drew ${drawStack} cards!`;drawStack=0;myTurn=true;render();return;}
    const playable=hands.opp.filter(canPlay);
    if(!playable.length){drawCard('opp',1);const drawn=hands.opp[hands.opp.length-1];
      if(!canPlay(drawn)){message=`${chat.name} can't play — draws`;myTurn=true;render();return;}
      const idx=hands.opp.indexOf(drawn);hands.opp.splice(idx,1);
      applyCard(drawn,'opp',COLORS_UNO[Math.floor(Math.random()*4)]);render();if(!gameOver&&!myTurn)gs.schedule(aiPlayUno,900);return;}
    const pick=playable.sort((a,b)=>{const priority={'wild_draw6':9,'wild_draw4':8,'draw4':7,'draw2':6,'skip':5,'reverse':4,'wild':3};return(priority[b.value]||0)-(priority[a.value]||0);})[0];
    const idx=hands.opp.indexOf(pick);hands.opp.splice(idx,1);
    const chosenColor=COLORS_UNO[Math.floor(Math.random()*4)];
    applyCard(pick,'opp',chosenColor);render();
    if(!gameOver&&!myTurn)gs.schedule(aiPlayUno,900);
  }

  render();
}


// ===================== PROFESSIONAL TIC-TAC-TOE =====================
function openTicTacToe(chat){
  const device=document.querySelector('.device');
  if(!device){if(typeof showToast==='function')showToast('Could not open Tic-Tac-Toe');return;}
  const DIFFS=[
    {id:'easy',label:'Easy'},
    {id:'medium',label:'Medium'},
    {id:'hard',label:'Hard'},
  ];
  const pick=document.createElement('div');
  pick.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:100;display:flex;flex-direction:column;';
  pick.innerHTML=`
    ${gameChromeHtml({title:'Tic-Tac-Toe',subtitle:'Choose difficulty',backId:'tttDiffBack'})}
    <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
      ${DIFFS.map(d=>`<button type="button" class="ttt-diff game-tap-target" data-d="${d.id}" style="padding:16px;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.12);border-radius:14px;color:#fff;font:700 15px Space Grotesk,sans-serif;cursor:pointer;text-align:left;">${d.label}</button>`).join('')}
    </div>`;
  device.appendChild(pick);
  if(typeof prepareGameOverlay==='function')prepareGameOverlay(pick,{theme:'dark',gameId:'ttt'});
  pick.querySelector('#tttDiffBack').addEventListener('click',()=>pick.remove());
  pick.querySelectorAll('.ttt-diff').forEach(btn=>btn.addEventListener('click',()=>{
    const diff=btn.dataset.d;pick.remove();startTicTacToe(chat,diff);
  }));
}

function startTicTacToe(chat, difficulty){
const diff=difficulty||'hard';
const DIFF_LABEL=diff==='easy'?'Easy':diff==='medium'?'Medium':'Hard';
const overlay=document.createElement('div');
overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;align-items:center;padding:0 0 12px;gap:12px;';
const gs=beginGameOverlaySession({type:'ttt',title:'Tic-Tac-Toe',mode:'1v1',chat,overlay});
if(!gs.alive())return;
let board=Array(9).fill(null);let myTurn=true;let gameOver=false;let winLine=null;let scores={me:0,opp:0,draw:0};let showResult=false;

function checkWin(b,s){
  const w=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  return w.find(([a,b2,c])=>b[a]===s&&b[b2]===s&&b[c]===s)||null;
}

function minimax(b,isMax,alpha,beta){
  const wX=checkWin(b,'X'),wO=checkWin(b,'O');
  if(wX)return-10;if(wO)return 10;if(b.every(Boolean))return 0;
  if(isMax){let best=-Infinity;b.forEach((_,i)=>{if(!b[i]){b[i]='O';best=Math.max(best,minimax(b,false,alpha,beta));b[i]=null;alpha=Math.max(alpha,best);if(beta<=alpha)return;}});return best;}
  else{let best=Infinity;b.forEach((_,i)=>{if(!b[i]){b[i]='X';best=Math.min(best,minimax(b,true,alpha,beta));b[i]=null;beta=Math.min(beta,best);if(beta<=alpha)return;}});return best;}
}

function getAiMove(){
  const empties=board.map((v,i)=>v?null:i).filter(v=>v!=null);
  if(!empties.length)return null;
  if(diff==='easy'){
    if(Math.random()<0.55)return empties[Math.floor(Math.random()*empties.length)];
  }
  if(diff==='medium'&&Math.random()<0.35){
    return empties[Math.floor(Math.random()*empties.length)];
  }
  let best=-Infinity,move=empties[0];
  empties.forEach(i=>{board[i]='O';const v=minimax(board,false,-Infinity,Infinity);board[i]=null;if(v>best){best=v;move=i;}});
  return move;
}

function winLineSvg(){
  if(!winLine)return'';
  const map={0:[16.6,16.6],1:[50,16.6],2:[83.3,16.6],3:[16.6,50],4:[50,50],5:[83.3,50],6:[16.6,83.3],7:[50,83.3],8:[83.3,83.3]};
  const a=map[winLine[0]],b=map[winLine[2]];
  return `<svg class="ttt-win-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--gold)" stroke-width="3.5" stroke-linecap="round" style="stroke-dasharray:120;stroke-dashoffset:120;animation:tttDrawLine .45s ease forwards;"/></svg>`;
}

function endRound(outcome){
  showResult=true;
  gs.setOutcome(outcome);
  render();
}

function render(){
  if(!gs.alive())return;
  const w=winLine;
  const statusText=gameOver?(winLine?(board[winLine[0]]==='X'?'You won':`${chat.name} wins`):"It's a draw"):(myTurn?'Your turn (✕)':'Thinking…');
  const turnMode=gameOver?'over':myTurn?'yours':'theirs';
  const turnBanner=typeof gameTurnBannerHtml==='function'
    ? gameTurnBannerHtml({ mode: turnMode, label: statusText, pulse: turnMode==='yours' })
    : `<div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;color:#fff;">${statusText}</div>`;
  const resultBlock=showResult&&typeof gameResultHtml==='function'
    ? gameResultHtml({
        title: winLine?(board[winLine[0]]==='X'?'You win!':`${chat.name} wins`):"It's a draw",
        subtitle: DIFF_LABEL,
        you: scores.me,
        opp: scores.opp,
        youLabel: 'You',
        oppLabel: chat.name.split(' ')[0],
        glyph: winLine?(board[winLine[0]]==='X'?'✕':'⭕'):'—',
        actions: [{label:'Play again',primary:true},{label:'Close'}],
      })
    : '';
  overlay.innerHTML=`
    ${gameChromeHtml({title:'Tic-Tac-Toe',subtitle:DIFF_LABEL,backId:'tttBack'})}
    ${typeof gameScoreHtml==='function'
      ? `${gameScoreHtml({label:'You (X)',score:scores.me},{label:`${chat.name} (O)`,score:scores.opp})}<div style="text-align:center;color:rgba(255,255,255,.55);font-size:12px;margin:-4px 0 8px;">Draws ${scores.draw}</div>`
      : `<div style="display:flex;gap:20px;"><div>You ${scores.me}</div><div>Draw ${scores.draw}</div><div>${chat.name} ${scores.opp}</div></div>`}
    <div style="position:relative;width:min(280px,82vw);">
      <div id="tttBoard" style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--game-gap,8px);width:100%;" role="grid" aria-label="Tic-Tac-Toe board"></div>
      ${winLineSvg()}
    </div>
    ${showResult?resultBlock:turnBanner}
    ${!showResult?`<button id="tttNew" class="game-tap-target" style="padding:12px 32px;background:${gameOver?'var(--game-accent,var(--red))':'rgba(255,255,255,0.1)'};color:#fff;border:none;border-radius:var(--game-btn-radius,14px);font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;cursor:pointer;min-height:44px;">New game</button>`:''}
  `;
  if(typeof prepareGameOverlay==='function') prepareGameOverlay(overlay,{theme:'dark',gameId:'ttt'});
  document.getElementById('tttBack').addEventListener('click',()=>gs.close());
  const newBtn=document.getElementById('tttNew');
  if(newBtn)newBtn.addEventListener('click',()=>{board=Array(9).fill(null);myTurn=true;gameOver=false;winLine=null;showResult=false;render();});
  if(showResult){
    overlay.querySelectorAll('[data-result-action]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(btn.dataset.resultAction==='0'){board=Array(9).fill(null);myTurn=true;gameOver=false;winLine=null;showResult=false;render();}
        else gs.close();
      });
    });
  }
  const boardEl=document.getElementById('tttBoard');
  board.forEach((cell,i)=>{
    const isWin=w&&w.includes(i);
    const sq=document.createElement('div');
    sq.className='game-tap-target';
    sq.style.cssText=`aspect-ratio:1;min-height:44px;background:${isWin?'rgba(255,201,60,0.2)':'rgba(255,255,255,0.07)'};border:2px solid ${isWin?'var(--gold)':'rgba(255,255,255,0.1)'};border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:48px;cursor:${!cell&&myTurn&&!gameOver?'pointer':'default'};transition:transform var(--duration-fast,150ms) var(--ease-spring,cubic-bezier(0.34,1.56,0.64,1));`;
    sq.textContent=cell==='X'?'✕':cell==='O'?'⭕':'';
    sq.setAttribute('aria-label', cell==='X'?'X':cell==='O'?'O':`Empty cell ${i+1}`);
    if(cell==='X')sq.style.color='var(--game-accent,#e74c3c)';
    if(cell==='O')sq.style.color='#5BA3D9';
    if(!cell&&myTurn&&!gameOver)sq.addEventListener('click',()=>{
      if(typeof pulseGameEl==='function')pulseGameEl(sq);
      if(typeof gameFeedback==='function')gameFeedback('place');
      board[i]='X';
      const w2=checkWin(board,'X');
      if(w2){winLine=w2;gameOver=true;scores.me++;if(typeof recordGameResult==='function')recordGameResult('ttt',true);endRound('won');return;}
      if(board.every(Boolean)){gameOver=true;scores.draw++;if(typeof recordGameResult==='function')recordGameResult('ttt',false,true);endRound('draw');return;}
      myTurn=false;render();
      if(typeof gameFeedback==='function')gameFeedback('turn');
      gs.schedule(()=>{
        if(!gs.alive())return;
        const m=getAiMove();if(m==null)return;board[m]='O';
        if(typeof gameFeedback==='function')gameFeedback('place');
        const w3=checkWin(board,'O');
        if(w3){winLine=w3;gameOver=true;scores.opp++;if(typeof recordGameResult==='function')recordGameResult('ttt',false);endRound('lost');return;}
        if(board.every(Boolean)){gameOver=true;scores.draw++;if(typeof recordGameResult==='function')recordGameResult('ttt',false,true);endRound('draw');return;}
        myTurn=true;render();
      },450);
    });
    boardEl.appendChild(sq);
  });
}
render();
}

// ===================== PROFESSIONAL SHABD FIVE =====================
const VALID_WORDS=[
  'PRESS','CHAIN','BLADE','FLINT','GROAN','PLUMB','CRATE','SWING','BRAVE','SHAFT','TROVE','QUILL','CHEST','FLAME','STORM','PRIDE','GLOBE','CRISP','BLOOM','DRAFT',
  'CIVIC','GRAND','CLAIM','PIVOT','GRACE','CLOUD','EARTH','FAITH','LIGHT','MIGHT','NIGHT','PLAIN','QUEEN','RAISE','SAINT','TRAIL','UNITE','VOICE','WASTE','YIELD',
  'ZONES','ABOUT','BEACH','CANDY','DENSE','EARLY','FANCY','GHOST','HAPPY','INDIE','JUICE','KNEEL','LASER','MAGIC','NAIVE','OCEAN','PIANO','QUIET','RIVER','SUGAR',
  'TOUCH','ULTRA','VENOM','WORRY','XERIC','YOUNG','ZEBRA','ANGER','BLEND','CROSS','DAILY','EAGLE','FRESH','GREAT','HURRY','IDEAL','JOINT','KNOCK','LEGAL','MATCH',
  'NOBLE','OFTEN','PAINT','RANGE','SLEEP','TRADE','UNDER','VITAL','WATER','APPLE','BREAD','BRICK','CHARM','DANCE','DREAM','FIELD','FOCUS','FORGE','FRUIT','GLASS',
  'GRAIN','HEART','HONEY','HOUSE','IMAGE','IVORY','JELLY','JUDGE','LEMON','LEVEL','LUNAR','MANGO','METAL','MINTY','MOUSE','MUSIC','NORTH','NOVEL','OLIVE','OPERA',
  'ORBIT','PEARL','PLANT','POISE','POWER','PRISM','RADIO','RIDGE','ROYAL','SCALE','SCOUT','SHARE','SHINE','SKILL','SOLID','SPICE','STONE','STORY','SWEET','TABLE',
  'THORN','TIGER','TODAY','TOKEN','TREND','TRUST','URBAN','VALUE','VIVID','WHEAT','WIDOW','WORLD','WRIST','YACHT','YEAST','ADORE','ALERT','AMBER','ARROW','ATLAS',
  'AUDIO','BASIL','BERRY','BOUND','BRAIN','BROOK','CABLE','CAMEL','CEDAR','CHALK','CIDER','CORAL','CROWN','DELTA','DIARY','DRIFT','EMBER','FABLE','FEAST','FLORA'
];
const COMMON=VALID_WORDS.filter((w,i)=>i%2===0||['PRESS','CHAIN','BLADE','CRATE','CHEST','FLAME','STORM','PRIDE','CLOUD','EARTH','LIGHT','OCEAN','RIVER','MUSIC','STONE','HEART','DREAM','POWER','WORLD','TODAY'].includes(w));

function shabdDailySeed(){
  const d=new Date();
  return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
}
function shabdPickDaily(){
  const seed=shabdDailySeed();
  let x=Math.sin(seed*12.9898)*43758.5453;
  x=x-Math.floor(x);
  return COMMON[Math.floor(x*COMMON.length)];
}

function openWordGuess(chat,opts){
const overlay=document.createElement('div');
overlay.style.cssText='position:absolute;inset:0;background:#121213;z-index:80;display:flex;flex-direction:column;';
const useDaily=!opts||opts.daily!==false;
const target=useDaily?shabdPickDaily():COMMON[Math.floor(Math.random()*COMMON.length)];
let guesses=[];let currentGuess='';let gameOver=false;let shake=false;
let keyColors={};let flippingRow=-1;let revealedCols=0;
const kbHandler=e=>{
  if(!gs.alive())return;
  if(e.key==='Backspace')handleInput('⌫');
  else if(e.key==='Enter')handleInput('↵');
  else if(/^[a-zA-Z]$/.test(e.key))handleInput(e.key.toUpperCase());
};
const gs=beginGameOverlaySession({
  type:'wordguess',title:'Shabd Five',mode:'solo',chat,overlay,
  cleanup(){document.removeEventListener('keydown',kbHandler);},
});
if(!gs.alive())return;

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

function render(){
  if(!gs.alive())return;
  const dayLabel=useDaily?`Daily · ${shabdDailySeed()}`:'Practice';
  overlay.innerHTML=`
    ${gameChromeHtml({title:'Shabd Five',subtitle:dayLabel,backId:'wgBack',rightHtml:'<button id="wgNew" class="game-chrome-action">New</button>'})}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:10px;" id="wgGrid"></div>
    ${gameOver?`<div style="text-align:center;padding:8px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;color:${guesses[guesses.length-1]===target?'#538D4E':'#B59F3B'};flex-shrink:0;">${guesses[guesses.length-1]===target?'🎉 Brilliant!':'The word was '+target}</div>`:''}
    <div style="flex-shrink:0;padding:8px;padding-bottom:max(8px,env(safe-area-inset-bottom));" id="wgKeyboard"></div>
  `;
  document.getElementById('wgBack').addEventListener('click',()=>gs.close());
  document.getElementById('wgNew').addEventListener('click',()=>{gs.close('restart');openWordGuess(chat,{daily:false});});

  const grid=document.getElementById('wgGrid');
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
      } else if(r===guesses.length){
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
    if(currentGuess.length!==5){shake=true;if(typeof gameFeedback==='function')gameFeedback('invalid');render();gs.schedule(()=>{shake=false;render();},500);return;}
    if(!VALID_WORDS.includes(currentGuess)){showToast('Not in word list');shake=true;if(typeof gameFeedback==='function')gameFeedback('invalid');render();gs.schedule(()=>{shake=false;render();},500);return;}
    const guess=currentGuess;
    guesses.push(guess);currentGuess='';
    staggerReveal(guess,()=>{
      if(guess===target||guesses.length===6){
        gameOver=true;
        const won=guess===target;
        gs.setOutcome(won?'won':'lost');
        if(typeof recordGameResult==='function')recordGameResult('wordguess',won);
        if(typeof gameFeedback==='function')gameFeedback(won?'win':'lose');
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
}


// openGamePicker is provided by game-registry.js

function openUnoVariantPicker(chat){
  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;';
  const variants=[
    {label:'🃏 Classic',desc:'Classic Oh, No! rules — stack & dodge',v:'classic'},
    {label:'🔄 Double Sided',desc:'Light & dark side mechanics',v:'doublesided'},
    {label:'💀 Blaze Mode',desc:'+6 cards, relentless stacking',v:'blaze'},
  ];
  sheet.innerHTML=`
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:14px;">🃏 Oh, No! Cards — Pick a variant</div>
    ${variants.map((v,i)=>`<button data-i="${i}" style="width:100%;padding:13px 14px;background:var(--cream);border:2px solid var(--line);border-radius:14px;margin-bottom:8px;text-align:left;cursor:pointer;"><div style="font-weight:700;font-size:14px;">${v.label}</div><div style="font-size:12px;color:var(--muted);">${v.desc}</div></button>`).join('')}
    <button id="closeUnoVariant" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  variants.forEach((v,i)=>sheet.querySelector(`[data-i="${i}"]`).addEventListener('click',()=>{sheet.remove();openUnoGame(chat,v.v);}));
  document.getElementById('closeUnoVariant').addEventListener('click',()=>sheet.remove());
}

// --- Game registry self-registration (engines.js) ---
if (typeof registerGame === 'function') {
  registerGame({
    id: 'chess',
    name: 'Chess',
    desc: 'Classic strategy, AI opponent',
    icon: '♟',
    ratingKey: 'chess',
    gameType: 'dual',
    chat1v1: true,
    selfChat: true,
    order: 10,
    launch(ctx) { openChessGame(ctx.chat); },
  });
  registerGame({
    id: 'snakes',
    name: 'Snakes & Ladders',
    desc: '5 versions, picked at random',
    icon: '🐍',
    ratingKey: 'snakes',
    gameType: 'dual',
    chat1v1: true,
    selfChat: true,
    order: 20,
    launch(ctx) { openSnakesVersionPicker(ctx.chat); },
  });
  registerGame({
    id: 'ludo',
    name: 'Ludo',
    desc: '2, 3 or 4 players',
    icon: '🎯',
    ratingKey: 'ludo',
    gameType: 'multiplayer',
    chat1v1: true,
    chatGroup: true,
    order: 30,
    launch(ctx) {
      if (ctx.isGroup) openGroupGameSetup(ctx.chat, 'ludo');
      else openLudoGame(ctx.chat, 2);
    },
  });
  registerGame({
    id: 'uno',
    name: 'Oh, No! Cards',
    desc: 'Classic · Double Sided · Blaze Mode',
    icon: '🃏',
    ratingKey: 'uno',
    gameType: 'multiplayer',
    chat1v1: true,
    chatGroup: true,
    order: 40,
    launch(ctx) {
      if (ctx.isGroup) openGroupGameSetup(ctx.chat, 'uno');
      else openUnoVariantPicker(ctx.chat);
    },
  });
  registerGame({
    id: 'ttt',
    name: 'Tic-Tac-Toe',
    desc: 'Quick & unbeatable AI',
    icon: '⭕',
    ratingKey: 'ttt',
    gameType: 'dual',
    chat1v1: true,
    selfChat: true,
    order: 50,
    launch(ctx) { openTicTacToe(ctx.chat); },
  });
  registerGame({
    id: 'wordguess',
    name: 'Shabd Five',
    desc: '5-letter daily puzzle',
    icon: '📝',
    ratingKey: 'wordguess',
    gameType: 'solo',
    solo: true,
    chat1v1: true,
    selfChat: true,
    order: 60,
    launch(ctx) { openWordGuess(ctx.chat); },
  });
}

window.startChessGame = startChessGame;
