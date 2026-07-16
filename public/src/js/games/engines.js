// ===================== PROFESSIONAL CHESS ENGINE =====================
function openChessGame(chat){
// ---- TIME CONTROL PICKER ----
const TC_OPTIONS=[
  {cat:'Bullet',time:'1+0',min:1,inc:0},{cat:'Bullet',time:'2+1',min:2,inc:1},
  {cat:'Blitz',time:'3+0',min:3,inc:0},{cat:'Blitz',time:'3+2',min:3,inc:2},{cat:'Blitz',time:'5+0',min:5,inc:0},{cat:'Blitz',time:'5+3',min:5,inc:3},
  {cat:'Rapid',time:'10+0',min:10,inc:0},{cat:'Rapid',time:'15+10',min:15,inc:10},{cat:'Rapid',time:'30+0',min:30,inc:0},
  {cat:'Classical',time:'60+0',min:60,inc:0},{cat:'No Limit',time:'∞',min:0,inc:0},
];
const TC_ICONS={'Bullet':'⚡','Blitz':'🔥','Rapid':'⏱️','Classical':'🏆','No Limit':'♾️'};
const tcSheet=document.createElement('div');
tcSheet.style.cssText='position:absolute;inset:0;background:#15192e;z-index:100;display:flex;flex-direction:column;overflow-y:auto;';
const cats=[...new Set(TC_OPTIONS.map(t=>t.cat))];
tcSheet.innerHTML=`
  <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 16px 8px;flex-shrink:0;">
    <button id="chessPickBack" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;">←</button>
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;color:#fff;">♟ Time Control</div>
    <div style="width:36px;"></div>
  </div>
  <div style="padding:8px 16px 28px;">
    ${cats.map(cat=>{
      const opts=TC_OPTIONS.filter(t=>t.cat===cat);
      return `<div style="margin-bottom:18px;"><div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">${TC_ICONS[cat]} ${cat}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${opts.map(t=>`<button class="tc-btn" data-min="${t.min}" data-inc="${t.inc}" style="padding:14px 6px;background:rgba(255,255,255,0.07);border:2px solid rgba(255,255,255,0.12);border-radius:14px;color:#fff;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;transition:all .15s;">${t.time}</button>`).join('')}</div></div>`;
    }).join('')}
  </div>
`;
document.querySelector('.device').appendChild(tcSheet);
document.getElementById('chessPickBack').addEventListener('click',()=>tcSheet.remove());
tcSheet.querySelectorAll('.tc-btn').forEach(btn=>{
  btn.addEventListener('mouseover',()=>btn.style.borderColor='var(--gold)');
  btn.addEventListener('mouseout',()=>btn.style.borderColor='rgba(255,255,255,0.12)');
  btn.addEventListener('click',()=>{
    tcSheet.remove();
    const tc={min:parseInt(btn.dataset.min),inc:parseInt(btn.dataset.inc)};
    startChessGame(chat,tc);
  });
});
}

function startChessGame(chat,tc){
const INIT_FEN='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES='abcdefgh';
const PIECE_UNICODE={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};

let state={board:null,turn:'w',castling:{K:true,Q:true,k:true,q:true},enPassant:null,halfMove:0,fullMove:1,selected:null,legalMoves:[],history:[],status:'playing',check:false};

function parseFEN(fen){
  const b=Array(8).fill(null).map(()=>Array(8).fill(null));
  const rows=fen.split(' ')[0].split('/');
  rows.forEach((row,r)=>{let c=0;for(const ch of row){if(/\d/.test(ch))c+=parseInt(ch);else{b[r][c]=ch;c++;}}});
  return b;
}

function pieceColor(p){return p&&(p===p.toUpperCase()?'w':'b');}

function inBounds(r,c){return r>=0&&r<8&&c>=0&&c<8;}

function isAttacked(board,r,c,byColor){
  // Check by pawns
  const pd=byColor==='w'?-1:1;
  for(const dc of[-1,1])if(inBounds(r+pd,c+dc)&&board[r+pd][c+dc]===(byColor==='w'?'P':'p'))return true;
  // Knights
  for(const[dr,dc] of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
    if(inBounds(r+dr,c+dc)&&board[r+dr][c+dc]?.toLowerCase()==='n'&&pieceColor(board[r+dr][c+dc])===byColor)return true;
  // Sliding pieces (rook/queen straight, bishop/queen diagonal)
  for(const[dr,dc] of[[0,1],[0,-1],[1,0],[-1,0]]){
    let tr=r+dr,tc=c+dc;
    while(inBounds(tr,tc)){
      const p=board[tr][tc];if(p){if(pieceColor(p)===byColor&&'RQrq'.includes(p))return true;break;}
      tr+=dr;tc+=dc;
    }
  }
  for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){
    let tr=r+dr,tc=c+dc;
    while(inBounds(tr,tc)){
      const p=board[tr][tc];if(p){if(pieceColor(p)===byColor&&'BQbq'.includes(p))return true;break;}
      tr+=dr;tc+=dc;
    }
  }
  // King
  for(const[dr,dc] of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
    if(inBounds(r+dr,c+dc)&&board[r+dr][c+dc]?.toLowerCase()==='k'&&pieceColor(board[r+dr][c+dc])===byColor)return true;
  return false;
}

function findKing(board,color){
  const k=color==='w'?'K':'k';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(board[r][c]===k)return[r,c];
  return null;
}

function isInCheck(board,color){
  const k=findKing(board,color);return k&&isAttacked(board,k[0],k[1],color==='w'?'b':'w');
}

function applyMove(board,from,to,promo){
  const b=board.map(r=>[...r]);
  const p=b[from[0]][from[1]];b[to[0]][to[1]]=p;b[from[0]][from[1]]=null;
  if(promo)b[to[0]][to[1]]=promo;
  // En passant capture
  if(p?.toLowerCase()==='p'&&from[1]!==to[1]&&!board[to[0]][to[1]]){b[from[0]][to[1]]=null;}
  // Castling rook
  if(p==='K'&&Math.abs(to[1]-from[1])===2){
    if(to[1]===6){b[7][5]=b[7][7];b[7][7]=null;}else{b[7][3]=b[7][0];b[7][0]=null;}
  }
  if(p==='k'&&Math.abs(to[1]-from[1])===2){
    if(to[1]===6){b[0][5]=b[0][7];b[0][7]=null;}else{b[0][3]=b[0][0];b[0][0]=null;}
  }
  return b;
}

function getLegalMoves(board,turn,castling,enPassant){
  const moves=[];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p=board[r][c];if(!p||pieceColor(p)!==turn)continue;
      const pt=p.toLowerCase();
      const candidates=[];
      if(pt==='p'){
        const dir=turn==='w'?-1:1;const startRow=turn==='w'?6:1;
        if(inBounds(r+dir,c)&&!board[r+dir][c])candidates.push([r+dir,c]);
        if(r===startRow&&!board[r+dir][c]&&!board[r+2*dir][c])candidates.push([r+2*dir,c]);
        for(const dc of[-1,1])if(inBounds(r+dir,c+dc)&&(pieceColor(board[r+dir][c+dc])===(turn==='w'?'b':'w')||(enPassant&&enPassant[0]===r+dir&&enPassant[1]===c+dc)))candidates.push([r+dir,c+dc]);
      } else if(pt==='n'){
        for(const[dr,dc] of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
          if(inBounds(r+dr,c+dc)&&pieceColor(board[r+dr][c+dc])!==turn)candidates.push([r+dr,c+dc]);
      } else if(pt==='k'){
        for(const[dr,dc] of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
          if(inBounds(r+dr,c+dc)&&pieceColor(board[r+dr][c+dc])!==turn)candidates.push([r+dr,c+dc]);
        // Castling
        if(!isInCheck(board,turn)){
          if(turn==='w'&&castling.K&&!board[7][5]&&!board[7][6]&&!isAttacked(board,7,5,'b')&&!isAttacked(board,7,6,'b'))candidates.push([7,6]);
          if(turn==='w'&&castling.Q&&!board[7][1]&&!board[7][2]&&!board[7][3]&&!isAttacked(board,7,3,'b'))candidates.push([7,2]);
          if(turn==='b'&&castling.k&&!board[0][5]&&!board[0][6]&&!isAttacked(board,0,5,'w')&&!isAttacked(board,0,6,'w'))candidates.push([0,6]);
          if(turn==='b'&&castling.q&&!board[0][1]&&!board[0][2]&&!board[0][3]&&!isAttacked(board,0,3,'w'))candidates.push([0,2]);
        }
      } else {
        const dirs={r:[[0,1],[0,-1],[1,0],[-1,0]],b:[[1,1],[1,-1],[-1,1],[-1,-1]],q:[[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]}[pt]||[];
        for(const[dr,dc] of dirs){let tr=r+dr,tc=c+dc;while(inBounds(tr,tc)){if(board[tr][tc]){if(pieceColor(board[tr][tc])!==turn)candidates.push([tr,tc]);break;}candidates.push([tr,tc]);tr+=dr;tc+=dc;}}
      }
      for(const to of candidates){
        const promo=(p==='P'&&to[0]===0)?'Q':(p==='p'&&to[0]===7)?'q':null;
        const nb=applyMove(board,[r,c],to,promo);
        if(!isInCheck(nb,turn))moves.push({from:[r,c],to,promo});
      }
    }
  }
  return moves;
}

function getAIMove(board,legalMoves){
  // Piece values (centipawns)
  const VALS={p:100,n:320,b:330,r:500,q:900,k:20000};
  // Piece-square tables (from Stockfish/CPW) — black's perspective
  const PST={
    p:[[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
    n:[[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
    b:[[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
    r:[[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
    q:[[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
    k:[[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
  };

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

  function alphaBeta(b,depth,alpha,beta,maximizing,castling,enPassant){
    if(depth===0)return evalBoard(b);
    const turn=maximizing?'b':'w';
    const moves=getLegalMoves(b,turn,castling,enPassant);
    if(!moves.length)return isInCheck(b,turn)?(maximizing?-20000:20000):0;
    if(maximizing){
      let best=-Infinity;
      for(const m of moves){
        const nb=applyMove(b,m.from,m.to,m.promo);
        best=Math.max(best,alphaBeta(nb,depth-1,alpha,beta,false,castling,null));
        alpha=Math.max(alpha,best);if(beta<=alpha)break;
      }
      return best;
    } else {
      let best=Infinity;
      for(const m of moves){
        const nb=applyMove(b,m.from,m.to,m.promo);
        best=Math.min(best,alphaBeta(nb,depth-1,alpha,beta,true,castling,null));
        beta=Math.min(beta,best);if(beta<=alpha)break;
      }
      return best;
    }
  }

  let best=null,bestScore=-Infinity;
  // Order moves: captures first (MVV-LVA)
  const ordered=[...legalMoves].sort((a,b)=>{
    const capA=board[a.to[0]][a.to[1]]?VALS[board[a.to[0]][a.to[1]].toLowerCase()]||0:0;
    const capB=board[b.to[0]][b.to[1]]?VALS[board[b.to[0]][b.to[1]].toLowerCase()]||0:0;
    return capB-capA;
  });
  for(const m of ordered){
    const nb=applyMove(board,m.from,m.to,m.promo);
    const score=alphaBeta(nb,2,-Infinity,Infinity,false,state.castling,null);
    if(score>bestScore){bestScore=score;best=m;}
  }
  return best||ordered[0];
}

function evalGameState(){
  const myColor='w';const oppColor='b';
  const myMoves=getLegalMoves(state.board,state.turn,state.castling,state.enPassant);
  state.legalMoves=myMoves;
  state.check=!!isInCheck(state.board,state.turn);
  if(myMoves.length===0){
    state.status=state.check?'checkmate':'stalemate';
  }
}

state.board=parseFEN(INIT_FEN);
evalGameState();

const overlay=document.createElement('div');
overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;';

function sqColor(r,c){return(r+c)%2===0?'#F0D9B5':'#B58863';}
function sqHighlight(r,c){
  if(state.selected&&state.selected[0]===r&&state.selected[1]===c)return'#7fc97f';
  if(state.selected&&state.legalMoves.some(m=>m.from[0]===state.selected[0]&&m.from[1]===state.selected[1]&&m.to[0]===r&&m.to[1]===c))return state.board[r][c]?'rgba(255,0,0,0.4)':'rgba(100,200,100,0.5)';
  return sqColor(r,c);
}

function capturedPieces(){
  const init={p:8,r:2,n:2,b:2,q:1,k:1};const cur={p:0,r:0,n:0,b:0,q:0,k:0};
  state.board.flat().filter(Boolean).forEach(p=>cur[p.toLowerCase()]++);
  const wCap=[],bCap=[];
  Object.entries(cur).forEach(([t,n])=>{
    const diff=init[t]-n;
    for(let i=0;i<diff;i++){wCap.push(t.toUpperCase());bCap.push(t);}
  });
  return{wCap:wCap.map(p=>PIECE_UNICODE[p]).join(''),bCap:bCap.map(p=>PIECE_UNICODE[p]).join('')};
}

function render(){
  const cap=capturedPieces();
  const statusText=state.status==='checkmate'?(state.turn==='w'?`${chat.name} wins by checkmate!`:'You won by checkmate! 🎉'):state.status==='stalemate'?'Stalemate — Draw!':state.check?'Check!':state.turn==='w'?'Your turn':'Opponent thinking...';
  if((state.status==='checkmate'||state.status==='stalemate')&&!state.ratingRecorded){
    state.ratingRecorded=true;
    recordGameResult('chess',state.status==='checkmate'&&state.turn==='b',state.status==='stalemate');
  }
  overlay.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#15192e;flex-shrink:0;">
      <button id="chessBack" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;">←</button>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;color:#fff;">♟ Chess</div>
      <button id="chessFlip" style="background:rgba(255,255,255,0.1);border:none;color:#fff;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;">Flip</button>
    </div>
    <div style="background:#1F2542;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
      <div style="color:#ccc;font-size:13px;">🔵 ${chat.name}</div>
      <div style="font-size:12px;color:var(--gold);">${cap.bCap}</div>
      ${HAS_TIMER?`<div id="clock_b" style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;color:${clocks.b<=10?'#E74C3C':'var(--gold)'};">${formatClock(clocks.b)}</div>`:''}
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:8px;">
      <div id="chessBoard" style="display:grid;grid-template-columns:repeat(8,1fr);width:min(360px,94vw);aspect-ratio:1;border-radius:6px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);"></div>
    </div>
    <div style="background:#1F2542;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
      <div style="color:#fff;font-size:13px;">🔴 You</div>
      <div style="font-size:12px;color:var(--gold);">${cap.wCap}</div>
      ${HAS_TIMER?`<div id="clock_w" style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;color:${clocks.w<=10?'#E74C3C':'var(--gold)'};">${formatClock(clocks.w)}</div>`:''}
    </div>
    <div style="background:${state.check&&state.status==='playing'?'rgba(230,57,70,0.3)':state.status==='checkmate'?'rgba(255,201,60,0.2)':'#15192e'};padding:10px 16px;text-align:center;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;color:${state.status!=='playing'?'var(--gold)':'#fff'};flex-shrink:0;">${statusText}</div>
  `;
  document.getElementById('chessBack').addEventListener('click',()=>{stopClock();overlay.remove();});
  document.getElementById('chessFlip').addEventListener('click',()=>{state.selected=null;renderFlipped=!renderFlipped;render();});
  const boardEl=document.getElementById('chessBoard');
  const rows=renderFlipped?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  const cols=renderFlipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
  rows.forEach(r=>cols.forEach(c=>{
    const sq=document.createElement('div');
    sq.style.cssText=`aspect-ratio:1;background:${sqHighlight(r,c)};display:flex;align-items:center;justify-content:center;font-size:clamp(22px,5vw,34px);cursor:pointer;position:relative;user-select:none;`;
    const p=state.board[r][c];
    if(p){
      const span=document.createElement('span');span.textContent=PIECE_UNICODE[p];
      span.style.cssText=`color:${pieceColor(p)==='w'?'#fff':'#1a1a2e'};text-shadow:${pieceColor(p)==='w'?'0 1px 4px rgba(0,0,0,0.9)':'0 1px 4px rgba(255,255,255,0.4)'};line-height:1;`;
      sq.appendChild(span);
    }
    // Legal move dot
    if(state.selected&&state.legalMoves.some(m=>m.from[0]===state.selected[0]&&m.from[1]===state.selected[1]&&m.to[0]===r&&m.to[1]===c)&&!state.board[r][c]){
      const dot=document.createElement('div');dot.style.cssText='position:absolute;width:30%;height:30%;background:rgba(0,0,0,0.2);border-radius:50%;';sq.appendChild(dot);
    }
    sq.addEventListener('click',()=>handleClick(r,c));
    boardEl.appendChild(sq);
  }));
}

let renderFlipped=false;

// ---- CLOCK SYSTEM ----
const HAS_TIMER=tc.min>0;
let clocks={w:tc.min*60,b:tc.min*60};
let clockInterval=null;

function formatClock(s){const m=Math.floor(s/60);const sec=s%60;return m+':'+(sec<10?'0':'')+sec;}
function startClock(color){
  if(!HAS_TIMER)return;
  clearInterval(clockInterval);
  clockInterval=setInterval(()=>{
    clocks[color]--;
    const el=document.getElementById('clock_'+color);
    if(el){el.textContent=formatClock(clocks[color]);el.style.color=clocks[color]<=10?'#E74C3C':'var(--gold)';}
    if(clocks[color]<=0){
      clocks[color]=0;clearInterval(clockInterval);
      state.status='timeout';render();
      showToast(color==='w'?`${chat.name} wins on time! ⏱️`:'You lose on time! ⏱️');
    }
  },1000);
}
function stopClock(){clearInterval(clockInterval);}

function handleClick(r,c){
  if(state.status!=='playing'||state.turn!=='w')return;
  const p=state.board[r][c];
  if(state.selected){
    const move=state.legalMoves.find(m=>m.from[0]===state.selected[0]&&m.from[1]===state.selected[1]&&m.to[0]===r&&m.to[1]===c);
    if(move){makeMove(move);return;}
    if(p&&pieceColor(p)==='w'){state.selected=[r,c];render();return;}
    state.selected=null;render();return;
  }
  if(p&&pieceColor(p)==='w'){state.selected=[r,c];render();}
}

function makeMove(move){
  // Update castling rights
  if(state.board[move.from[0]][move.from[1]]==='K'){state.castling.K=false;state.castling.Q=false;}
  if(state.board[move.from[0]][move.from[1]]==='k'){state.castling.k=false;state.castling.q=false;}
  if(move.from[0]===7&&move.from[1]===7)state.castling.K=false;
  if(move.from[0]===7&&move.from[1]===0)state.castling.Q=false;
  if(move.from[0]===0&&move.from[1]===7)state.castling.k=false;
  if(move.from[0]===0&&move.from[1]===0)state.castling.q=false;
  // En passant
  const p=state.board[move.from[0]][move.from[1]];
  state.enPassant=(p?.toLowerCase()==='p'&&Math.abs(move.to[0]-move.from[0])===2)?[(move.from[0]+move.to[0])/2,move.from[1]]:null;
  state.board=applyMove(state.board,move.from,move.to,move.promo);
  state.history.push(move);state.selected=null;
  if(HAS_TIMER&&tc.inc>0)clocks[state.turn]+=tc.inc;
  state.turn=state.turn==='w'?'b':'w';
  if(HAS_TIMER){startClock(state.turn);}
  evalGameState();render();
  if(state.status!=='playing')return;
  // AI move
  setTimeout(()=>{
    const aiMoves=getLegalMoves(state.board,'b',state.castling,state.enPassant);
    if(!aiMoves.length)return;
    const aiMove=getAIMove(state.board,aiMoves);
    if(state.board[aiMove.from[0]][aiMove.from[1]]==='k'){state.castling.k=false;state.castling.q=false;}
    if(aiMove.from[0]===0&&aiMove.from[1]===7)state.castling.k=false;
    if(aiMove.from[0]===0&&aiMove.from[1]===0)state.castling.q=false;
    state.enPassant=(state.board[aiMove.from[0]][aiMove.from[1]]==='p'&&Math.abs(aiMove.to[0]-aiMove.from[0])===2)?[(aiMove.from[0]+aiMove.to[0])/2,aiMove.from[1]]:null;
    state.board=applyMove(state.board,aiMove.from,aiMove.to,aiMove.promo);
    state.history.push(aiMove);state.turn='w';evalGameState();render();
  },700);
}

document.querySelector('.device').appendChild(overlay);render();if(HAS_TIMER)startClock('w');
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
    dice: 1, // number of dice
    exact: true, // must land exactly on 100
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
    specialRules: ['bounce'] // bounce back from 100 if overshoot
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
    specialRules: ['double_roll'] // roll again on doubles
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
    specialRules: ['chaos'] // 20% chance snake becomes ladder and vice versa each turn
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
    specialRules: ['moksha'] // start from 0, land on 72 exactly
  }
];

function openSnakesGame(chat){
  // Pick random version
  const version = SL_VERSIONS[Math.floor(Math.random()*SL_VERSIONS.length)];
  openSnakesVersion(chat, version);
}

function openSnakesVersionPicker(chat){
  const sheet = document.createElement('div');
  sheet.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;max-height:80vh;overflow-y:auto;';
  sheet.innerHTML = `
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:4px;">🐍 Choose a version</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Or tap "Random" to let fate decide!</div>
    <button style="width:100%;padding:14px;background:linear-gradient(135deg,var(--red),#8134AF);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:12px;" id="randomSL">🎲 Random version</button>
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
  let chaosSeed=Date.now();

  function getRandomInt(min,max,seed){return Math.floor((Math.sin(seed)*10000%1+1)/2*(max-min+1))+min;}

  function sqNum(r,c,totalRows){
    const row=totalRows-1-r;return row%2===0?row*10+c+1:row*10+(9-c)+1;
  }

  function rollDice(){
    if(!myTurn||rolling||gameOver)return;rolling=true;
    let ticks=0;
    const iv=setInterval(()=>{
      diceVals[0]=Math.floor(Math.random()*6)+1;
      if(version.dice===2)diceVals[1]=Math.floor(Math.random()*6)+1;
      render();ticks++;
      if(ticks>10){
        clearInterval(iv);rolling=false;
        const total=diceVals[0]+(diceVals[1]||0);
        // Chaos mode: randomly flip some snakes/ladders
        if(version.specialRules.includes('chaos')&&Math.random()<0.2){
          const allKeys=[...Object.keys(SNAKES),...Object.keys(LADDERS)].map(Number);
          const k=allKeys[Math.floor(Math.random()*allKeys.length)];
          if(SNAKES[k]){const v=SNAKES[k];delete SNAKES[k];LADDERS[k]=v;message=`🌀 Chaos! Square ${k} flipped!`;}
          else if(LADDERS[k]){const v=LADDERS[k];delete LADDERS[k];SNAKES[k]=v;message=`🌀 Chaos! Square ${k} flipped!`;}
        }
        // Double roll bonus
        if(version.specialRules.includes('double_roll')&&diceVals[0]===diceVals[1]){
          doubleRoll=true;message=`🎲 Doubles! Roll again after this move.`;
        }
        processMove('me',total);
      }
    },80);
  }

  function processMove(who,roll){
    let newPos=pos[who]+roll;
    // Bounce rule
    if(version.specialRules.includes('bounce')&&newPos>SQUARES){newPos=SQUARES*2-newPos;}
    else if(!version.exact&&newPos>SQUARES){newPos=SQUARES;}
    else if(version.exact&&newPos>SQUARES){message=`Need exactly ${SQUARES-pos[who]} to finish. Miss!`;render();endTurn(who);return;}
    pos[who]=newPos;render();

    const dest=SNAKES[newPos]||LADDERS[newPos];
    setTimeout(()=>{
      if(dest){
        const isSnake=!!SNAKES[newPos];
        message=isSnake?`🐍 Snake! ${newPos}→${dest}`:`🪜 Ladder! ${newPos}→${dest}`;
        pos[who]=dest;render();
      }
      if(pos[who]>=SQUARES){gameOver=true;message=who==='me'?'🎉 You win!':chat.name+' wins!';recordGameResult('snakes',who==='me');render();return;}
      endTurn(who);
    },500);
  }

  function endTurn(who){
    if(gameOver)return;
    if(who==='me'&&doubleRoll){doubleRoll=false;render();return;} // player rolls again
    if(who==='me'){myTurn=false;render();setTimeout(()=>{const r=Math.floor(Math.random()*6)+1+(version.dice===2?Math.floor(Math.random()*6)+1:0);diceVals[0]=r>6?r-Math.floor(Math.random()*6+1):r;if(version.dice===2)diceVals[1]=Math.floor(Math.random()*6+1);processMove('opp',r);},800);}
    else{myTurn=true;message='';render();}
  }

  const totalRows=Math.ceil(SQUARES/10);
  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;';

  function diceEmoji(v){return v?['⚀','⚁','⚂','⚃','⚄','⚅'][v-1]:'🎲';}

  function getPos(n){
    if(!n)return null;
    const idx=n-1;const row=Math.floor(idx/10);const col=idx%10;
    return{r:totalRows-1-row,c:row%2===0?col:9-col};
  }

  function render(){
    overlay.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#15192e;flex-shrink:0;">
        <button id="slBack" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;">←</button>
        <div style="text-align:center;"><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;color:#fff;">${version.emoji} ${version.name}</div><div style="font-size:11px;color:rgba(255,255,255,0.5);">${version.desc}</div></div>
        <div style="width:36px;"></div>
      </div>
      <div style="display:flex;gap:8px;padding:8px 12px;flex-shrink:0;">
        <div style="flex:1;background:${myTurn&&!gameOver?'rgba(230,57,70,0.3)':'rgba(255,255,255,0.05)'};border:2px solid ${myTurn&&!gameOver?'var(--red)':'transparent'};border-radius:12px;padding:8px;text-align:center;">
          <div style="color:#ccc;font-size:11px;font-weight:700;">🔴 You</div>
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;color:var(--gold);">${pos.me}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;flex:0 0 70px;">
          <span style="font-size:${version.dice===2?'28px':'36px'};">${diceEmoji(diceVals[0])}</span>
          ${version.dice===2?`<span style="font-size:28px;">${diceEmoji(diceVals[1])}</span>`:''}
        </div>
        <div style="flex:1;background:${!myTurn&&!gameOver?'rgba(91,163,217,0.3)':'rgba(255,255,255,0.05)'};border:2px solid ${!myTurn&&!gameOver?'#5BA3D9':'transparent'};border-radius:12px;padding:8px;text-align:center;">
          <div style="color:#ccc;font-size:11px;font-weight:700;">🔵 ${chat.name.split(' ')[0]}</div>
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;color:var(--gold);">${pos.opp}</div>
        </div>
      </div>
      <div style="flex:1;overflow:hidden;padding:0 10px;">
        <div id="slGrid" style="display:grid;grid-template-columns:repeat(10,1fr);gap:2px;height:100%;"></div>
      </div>
      ${message?`<div style="padding:8px 16px;text-align:center;color:var(--gold);font-weight:700;font-size:13px;background:rgba(255,201,60,0.1);border-top:1px solid rgba(255,201,60,0.2);flex-shrink:0;">${message}</div>`:''}
      <div style="padding:10px 12px;flex-shrink:0;">
        <button id="rollBtn" style="width:100%;padding:13px;background:${myTurn&&!gameOver?'var(--red)':'rgba(255,255,255,0.1)'};color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:${myTurn&&!gameOver?'pointer':'default'};">
          ${gameOver?'Game Over!':(myTurn?`🎲 Roll${doubleRoll?' Again!':''}`:chat.name.split(' ')[0]+' rolling...')}
        </button>
      </div>
    `;
    document.getElementById('slBack').addEventListener('click',()=>overlay.remove());
    document.getElementById('rollBtn').addEventListener('click',rollDice);

    const grid=document.getElementById('slGrid');
    for(let r=0;r<totalRows;r++){
      for(let c=0;c<10;c++){
        const n=sqNum(r,c,totalRows);if(n>SQUARES){const empty=document.createElement('div');grid.appendChild(empty);continue;}
        const sq=document.createElement('div');
        const hasSnake=SNAKES[n];const hasLadder=LADDERS[n];
        const meHere=getPos(pos.me)?.r===r&&getPos(pos.me)?.c===c&&pos.me>0;
        const oppHere=getPos(pos.opp)?.r===r&&getPos(pos.opp)?.c===c&&pos.opp>0;
        sq.style.cssText=`display:flex;flex-direction:column;align-items:center;justify-content:center;background:${n===SQUARES?'rgba(255,201,60,0.3)':hasSnake?'rgba(220,50,50,0.25)':hasLadder?'rgba(50,200,80,0.2)':'rgba(255,255,255,0.05)'};border-radius:3px;position:relative;aspect-ratio:1;border:${n===SQUARES?'1px solid var(--gold)':'1px solid rgba(255,255,255,0.05)'};`;
        sq.innerHTML=`<span style="font-size:clamp(5px,1.1vw,9px);color:rgba(255,255,255,0.4);line-height:1;">${n}</span>${n===SQUARES?'<span style="font-size:12px;">🏆</span>':hasSnake?'<span style="font-size:clamp(8px,2vw,14px);">🐍</span>':hasLadder?'<span style="font-size:clamp(8px,2vw,14px);">🪜</span>':''}${meHere||oppHere?`<span style="position:absolute;bottom:1px;font-size:clamp(7px,1.8vw,12px);">${meHere&&oppHere?'🔴🔵':meHere?'🔴':'🔵'}</span>`:''}`;
        grid.appendChild(sq);
      }
    }
  }
  document.querySelector('.device').appendChild(overlay);render();
}

// ===================== LUDO ENGINE =====================
function openLudoGame(chat, playerCount){
  playerCount = Math.min(Math.max(playerCount||2,2),4);
  const COLORS=['red','blue','green','yellow'];
  const COLOR_STYLES={red:'#E74C3C',blue:'#3498DB',green:'#2ECC71',yellow:'#F1C40F'};
  const NAMES=['You',chat.name,...(playerCount>2?['Player 3']:[]),(playerCount>3?'Player 4':'')].filter(Boolean).slice(0,playerCount);

  // Ludo board path (main track, 52 squares)
  // Each color has home column positions
  const HOME_COLUMNS={red:[50,51,52,53,54],blue:[11,12,13,14,15],green:[24,25,26,27,28],yellow:[37,38,39,40,41]};
  const START_POS={red:0,blue:13,green:26,yellow:39};
  const SAFE_SQUARES=[0,8,13,21,26,34,39,47];

  // State
  let pieces={}; // {color: [{pos:-1(home),progress:0,finished:false}x4]}
  let currentPlayer=0;let diceVal=null;let rolling=false;let phase='roll';
  let selectedPiece=null;let message='';let gameOver=false;

  COLORS.slice(0,playerCount).forEach(color=>{
    pieces[color]=[{pos:-1,progress:0,finished:false},{pos:-1,progress:0,finished:false},{pos:-1,progress:0,finished:false},{pos:-1,progress:0,finished:false}];
  });

  const players=COLORS.slice(0,playerCount);

  function rollDice(){
    if(phase!=='roll'||rolling||gameOver)return;
    rolling=true;let ticks=0;
    const iv=setInterval(()=>{diceVal=Math.floor(Math.random()*6)+1;renderLudo();ticks++;
      if(ticks>10){
        clearInterval(iv);rolling=false;
        const color=players[currentPlayer];
        const moveable=pieces[color].filter(p=>!p.finished&&(p.pos!==-1||(p.pos===-1&&diceVal===6)));
        if(!moveable.length){
          message=`${NAMES[currentPlayer]} has no moves — pass`;
          if(diceVal!==6)nextPlayer();else nextPlayer();
          return;
        }
        phase='move';
        if(moveable.length===1&&moveable[0].pos===-1&&diceVal===6){movePiece(color,pieces[color].indexOf(moveable[0]));return;}
        message=`${NAMES[currentPlayer]}: select a piece`;
        renderLudo();
      }
    },80);
  }

  function movePiece(color,pieceIdx){
    const p=pieces[color][pieceIdx];
    if(p.finished)return;
    if(p.pos===-1){
      if(diceVal!==6){message='Need a 6 to enter!';return;}
      p.pos=START_POS[color];p.progress=1;
    } else {
      p.progress+=diceVal;
      if(p.progress>57){p.progress=57-(p.progress-57);} // bounce
      if(p.progress===57){p.finished=true;message=`${NAMES[currentPlayer]} piece home! 🏆`;}
      else p.pos=(START_POS[color]+p.progress-1)%52;
      // Capture — if opponent on same square and not safe
      if(!SAFE_SQUARES.includes(p.pos)){
        players.forEach(oc=>{
          if(oc===color)return;
          pieces[oc].forEach(op=>{
            if(!op.finished&&op.pos===p.pos&&op.progress>0){op.pos=-1;op.progress=0;message=`${color} captured ${oc}! 🎯`;}
          });
        });
      }
    }
    const allFinished=pieces[color].every(p=>p.finished);
    if(allFinished){gameOver=true;message=`🎉 ${NAMES[currentPlayer]} wins!`;recordGameResult('ludo',currentPlayer===0);renderLudo();return;}
    selectedPiece=null;phase='roll';
    if(diceVal===6){message=`🎲 ${NAMES[currentPlayer]} rolls again (got 6)!`;renderLudo();return;}
    nextPlayer();
  }

  function nextPlayer(){currentPlayer=(currentPlayer+1)%playerCount;phase='roll';renderLudo();if(currentPlayer!==0)setTimeout(aiMove,900);}

  function aiMove(){
    if(gameOver||currentPlayer===0)return;
    const color=players[currentPlayer];
    diceVal=Math.floor(Math.random()*6)+1;renderLudo();
    setTimeout(()=>{
      const moveable=pieces[color].filter(p=>!p.finished&&(p.pos!==-1||(p.pos===-1&&diceVal===6)));
      if(!moveable.length){nextPlayer();return;}
      const pick=moveable[Math.floor(Math.random()*moveable.length)];
      movePiece(color,pieces[color].indexOf(pick));
    },600);
  }

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;';

  function renderLudo(){
    const color=players[currentPlayer];
    const diceEmojis=['⚀','⚁','⚂','⚃','⚄','⚅'];
    overlay.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#15192e;flex-shrink:0;">
        <button id="ludoBack" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;">←</button>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;color:#fff;">🎯 Ludo${playerCount>2?` (${playerCount}P)`:''}</div>
        <div style="width:36px;"></div>
      </div>
      <div style="display:flex;gap:6px;padding:8px 12px;overflow-x:auto;flex-shrink:0;">
        ${players.map((c,i)=>`<div style="flex:1;min-width:60px;background:${currentPlayer===i?COLOR_STYLES[c]+'33':'rgba(255,255,255,0.05)'};border:2px solid ${currentPlayer===i?COLOR_STYLES[c]:'transparent'};border-radius:10px;padding:6px;text-align:center;"><div style="color:${COLOR_STYLES[c]};font-size:10px;font-weight:700;">${NAMES[i]}</div><div style="font-size:11px;color:#ccc;">${pieces[c].filter(p=>p.finished).length}/4 🏠</div></div>`).join('')}
      </div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;gap:10px;">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:min(320px,90vw);" id="ludoPieces">
          ${players.map((c,ci)=>`
            <div style="background:${COLOR_STYLES[c]}22;border:2px solid ${COLOR_STYLES[c]}44;border-radius:12px;padding:8px;text-align:center;">
              <div style="font-size:10px;color:${COLOR_STYLES[c]};font-weight:700;margin-bottom:4px;">${NAMES[ci]}</div>
              ${pieces[c].map((p,pi)=>`
                <div data-color="${c}" data-pi="${pi}" style="width:28px;height:28px;border-radius:50%;background:${p.finished?COLOR_STYLES[c]:p.pos===-1?COLOR_STYLES[c]+'44':COLOR_STYLES[c]};border:2px solid ${p.finished?'var(--gold)':COLOR_STYLES[c]};display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;margin:2px;cursor:${phase==='move'&&currentPlayer===ci?'pointer':'default'};opacity:${p.finished?0.5:1};">
                  ${p.finished?'✓':p.pos===-1?'H':p.progress}
                </div>
              `).join('')}
              ${!p.finished&&pieces[c][0].pos!==-1?`<div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:2px;">${pieces[c].map(p=>p.progress).join(' ')}</div>`:''}
            </div>
          `).join('')}
        </div>
        <div style="font-size:48px;">${diceVal?diceEmojis[diceVal-1]:'🎲'}</div>
        ${message?`<div style="font-size:13px;font-weight:700;color:var(--gold);text-align:center;padding:6px 16px;background:rgba(255,201,60,0.1);border-radius:10px;">${message}</div>`:''}
      </div>
      <div style="padding:10px 12px;flex-shrink:0;">
        <button id="ludoRoll" style="width:100%;padding:13px;background:${phase==='roll'&&currentPlayer===0&&!gameOver?COLOR_STYLES[color]:'rgba(255,255,255,0.1)'};color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:${phase==='roll'&&currentPlayer===0&&!gameOver?'pointer':'default'};">
          ${gameOver?'Game Over!':phase==='roll'&&currentPlayer===0?'🎲 Roll Dice':phase==='move'&&currentPlayer===0?'Select a piece above':'Opponents playing...'}
        </button>
      </div>
    `;
    document.getElementById('ludoBack').addEventListener('click',()=>overlay.remove());
    document.getElementById('ludoRoll').addEventListener('click',()=>{if(currentPlayer===0&&phase==='roll'&&!gameOver)rollDice();});
    if(phase==='move'&&currentPlayer===0){
      overlay.querySelectorAll('[data-color]').forEach(el=>{
        const c=el.dataset.color,pi=parseInt(el.dataset.pi);
        if(c===players[0]&&!pieces[c][pi].finished&&(pieces[c][pi].pos!==-1||(pieces[c][pi].pos===-1&&diceVal===6))){
          el.addEventListener('click',()=>movePiece(c,pi));
        }
      });
    }
  }
  document.querySelector('.device').appendChild(overlay);renderLudo();
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
    discardPile.push(card);
    currentColor=card.type==='wild'?(chosenColor||'red'):card.color;
    currentValue=card.value;
    const opp=who==='me'?'opp':'me';
    switch(card.value){
      case 'skip':myTurn=who!=='me';message=`${who==='me'?chat.name:NAMES[0]} skipped!`;break;
      case 'reverse':direction*=-1;message='Direction reversed!';if(variant==='blaze')myTurn=who==='me';break;
      case 'draw2':drawStack+=2;if(variant==='blaze'){drawCard(opp,2);message=`+2! ${opp==='me'?'You':chat.name} draws 2`;myTurn=who!=='me';}else{message=`+2 pending!`;myTurn=who!=='me';}break;
      case 'draw4':case 'wild_draw4':
        if(variant==='blaze'){drawCard(opp,4);message=`+4! ${opp==='me'?'You':chat.name} draws 4`;}
        else{drawStack+=4;message=`+4 pending!`;}
        myTurn=who!=='me';break;
      case 'wild_draw6':drawCard(opp,6);message=`💀 +6! ${opp==='me'?'You':chat.name} draws 6!`;myTurn=who!=='me';break;
      case 'draw4':COLORS_UNO.forEach(()=>{});drawCard(opp,4);myTurn=who!=='me';break;
      case 'skip_all':message='Skip all! Play again!';break;
      case 'flip':flipped=!flipped;message=`🔄 Deck flipped! ${flipped?'Dark side':'Light side'}`;break;
      case 'wild':myTurn=who!=='me';break;
      default:myTurn=who!=='me';
    }
    // Check UNO
    if(hands[who].length===1){unoCallWindow=true;message=(who==='me'?'You call':'AI calls')+' \'Oh, No!\' 🗣️';setTimeout(()=>{unoCallWindow=false;},2000);}
    if(hands[who].length===0){gameOver=true;message=(who==='me'?'🎉 You win!':chat.name+' wins!')+' Oh, No!';recordGameResult('uno',who==='me');}
  }

  const NAMES=['You',chat.name];
  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;';

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
    return `<div style="width:${small?'36px':'52px'};height:${small?'52px':'76px'};background:${cardBg(card)};border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:${small?'11px':'15px'};color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.5);border:${selected?'3px solid white':playable?'2px solid rgba(255,255,255,0.6)':'2px solid rgba(0,0,0,0.2)'};cursor:${playable?'pointer':'default'};flex-shrink:0;transform:${selected?'translateY(-10px)':'none'};transition:transform .15s;box-shadow:${selected?'0 4px 12px rgba(0,0,0,0.5)':''}">${cardLabel(card)}</div>`;
  }

  function render(){
    const bgColor=flipped?'#2C3E50':'#1a1a2e';
    const topCard=discardPile[discardPile.length-1];
    const playableCards=myTurn&&!pickingColor?hands.me.filter(canPlay):[];
    overlay.style.background=bgColor;
    overlay.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:rgba(0,0,0,0.3);flex-shrink:0;">
        <button id="unoBack" style="background:rgba(255,255,255,0.15);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;">←</button>
        <div style="text-align:center;"><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;color:#fff;">🃏 Oh, No! ${variant==='classic'?'':variant==='doublesided'?'Flip':'No Mercy'}</div>${flipped?`<div style="font-size:10px;color:rgba(255,165,0,0.9);font-weight:700;">🔄 DARK SIDE ACTIVE</div>`:''}</div>
        <button id="unoUnoBtn" style="background:${unoCallWindow?'var(--gold)':'rgba(255,255,255,0.1)'};border:none;color:${unoCallWindow?'#000':'#fff'};border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;">Oh No!</button>
      </div>

      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <!-- Opponent hand -->
        <div style="padding:10px 16px;flex-shrink:0;">
          <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:6px;">${chat.name} — ${hands.opp.length} cards</div>
          <div style="display:flex;gap:-8px;overflow:hidden;">
            ${hands.opp.map(()=>`<div style="width:36px;height:52px;background:linear-gradient(135deg,#c0392b,#8e44ad);border-radius:6px;border:2px solid rgba(255,255,255,0.2);flex-shrink:0;margin-right:-16px;"></div>`).join('')}
          </div>
        </div>

        <!-- Play area -->
        <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:20px;padding:10px;">
          <!-- Deck -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
            <div id="deckBtn" style="width:52px;height:76px;background:linear-gradient(135deg,#c0392b,#8e44ad);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:${myTurn&&!pickingColor?'pointer':'default'};border:2px solid rgba(255,255,255,0.3);">🃏</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.4);">${deck.length} left</div>
          </div>
          <!-- Discard -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
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
            ${COLORS_UNO.map(c=>`<button data-color="${c}" style="width:52px;height:52px;background:${COLOR_HEX[c]};border:none;border-radius:50%;cursor:pointer;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></button>`).join('')}
          </div>
        </div>`:''}

        <!-- My hand -->
        <div style="padding:10px 16px 16px;flex-shrink:0;">
          <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:6px;">Your hand — ${hands.me.length} cards${drawStack>0?` · <span style="color:#E74C3C;font-weight:700;">+${drawStack} pending!</span>`:''}</div>
          <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;">
            ${hands.me.map((card,i)=>{const playable=myTurn&&!pickingColor&&canPlay(card)&&(!drawStack||card.value==='draw2'||card.value.includes('draw'));return`<div data-i="${i}" ${playable?'':''}>${renderCard(card,false,selectedCard===i,playable)}</div>`;}).join('')}
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;text-align:center;">${myTurn&&!pickingColor?'Tap a card to play':'Waiting...'}</div>
        </div>
      </div>
    `;

    document.getElementById('unoBack').addEventListener('click',()=>overlay.remove());
    document.getElementById('unoUnoBtn').addEventListener('click',()=>{if(hands.me.length===2)unoCallWindow=true;});

    // Card tap
    overlay.querySelectorAll('[data-i]').forEach(el=>{
      const i=parseInt(el.dataset.i);const card=hands.me[i];
      const playable=myTurn&&!pickingColor&&canPlay(card)&&(!drawStack||card.value==='draw2'||card.value.includes('draw'));
      if(playable)el.addEventListener('click',()=>{
        if(card.type==='wild'||card.color==='wild'){selectedCard=i;pickingColor=true;render();}
        else{hands.me.splice(i,1);applyCard(card,'me');selectedCard=null;render();if(!gameOver&&!myTurn)setTimeout(aiPlayUno,900);}
      });
    });

    // Color picker
    if(pickingColor)overlay.querySelectorAll('[data-color]').forEach(el=>{
      el.addEventListener('click',()=>{const card=hands.me.splice(selectedCard,1)[0];pickingColor=false;selectedCard=null;applyCard(card,'me',el.dataset.color);render();if(!gameOver&&!myTurn)setTimeout(aiPlayUno,900);});
    });

    // Draw from deck
    document.getElementById('deckBtn').addEventListener('click',()=>{
      if(!myTurn||pickingColor)return;
      if(drawStack>0){drawCard('me',drawStack);message=`You drew ${drawStack} cards!`;drawStack=0;myTurn=false;render();setTimeout(aiPlayUno,900);return;}
      drawCard('me',1);
      const drawn=hands.me[hands.me.length-1];
      if(canPlay(drawn)){selectedCard=hands.me.length-1;message='Drew a playable card — tap it to play or skip';render();}
      else{message='No playable card — passing';myTurn=false;render();setTimeout(aiPlayUno,900);}
    });
  }

  function aiPlayUno(){
    if(gameOver||myTurn)return;
    // Draw if stack pending
    if(drawStack>0){drawCard('opp',drawStack);message=`${chat.name} drew ${drawStack} cards!`;drawStack=0;myTurn=true;render();return;}
    // Find playable card
    const playable=hands.opp.filter(canPlay);
    if(!playable.length){drawCard('opp',1);const drawn=hands.opp[hands.opp.length-1];
      if(!canPlay(drawn)){message=`${chat.name} can't play — draws`;myTurn=true;render();return;}
      const idx=hands.opp.indexOf(drawn);hands.opp.splice(idx,1);
      applyCard(drawn,'opp',COLORS_UNO[Math.floor(Math.random()*4)]);render();if(!gameOver&&!myTurn)setTimeout(aiPlayUno,900);return;}
    // Prefer action cards, then highest value
    const pick=playable.sort((a,b)=>{const priority={'wild_draw6':9,'wild_draw4':8,'draw4':7,'draw2':6,'skip':5,'reverse':4,'wild':3};return(priority[b.value]||0)-(priority[a.value]||0);})[0];
    const idx=hands.opp.indexOf(pick);hands.opp.splice(idx,1);
    const chosenColor=COLORS_UNO[Math.floor(Math.random()*4)];
    applyCard(pick,'opp',chosenColor);render();
    if(!gameOver&&!myTurn)setTimeout(aiPlayUno,900);
  }

  document.querySelector('.device').appendChild(overlay);render();
}


// ===================== PROFESSIONAL TIC-TAC-TOE =====================
function openTicTacToe(chat){
const overlay=document.createElement('div');
overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:20px;';
let board=Array(9).fill(null);let myTurn=true;let gameOver=false;let winLine=null;let scores={me:0,opp:0,draw:0};

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

function getBestMove(){
  let best=-Infinity,move=null;
  board.forEach((_,i)=>{if(!board[i]){board[i]='O';const v=minimax(board,false,-Infinity,Infinity);board[i]=null;if(v>best){best=v;move=i;}}});
  return move;
}

function render(){
  const w=winLine;
  const statusColor=gameOver?(winLine?'var(--gold)':'#888'):'#fff';
  const statusText=gameOver?(winLine?(board[winLine[0]]==='X'?'You won! 🎉':`${chat.name} wins!`):"It's a draw!"):(myTurn?'Your turn (✕)':'Thinking...');
  overlay.innerHTML=`
    <button id="tttBack" style="position:absolute;top:16px;left:16px;background:rgba(255,255,255,0.1);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;">←</button>
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;color:#fff;">⭕ Tic-Tac-Toe</div>
    <div style="display:flex;gap:20px;">
      <div style="text-align:center;color:#fff;"><div style="font-size:11px;color:rgba(255,255,255,0.5);">You ✕</div><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:24px;color:var(--red);">${scores.me}</div></div>
      <div style="text-align:center;color:#fff;"><div style="font-size:11px;color:rgba(255,255,255,0.5);">Draw</div><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:24px;color:#888;">${scores.draw}</div></div>
      <div style="text-align:center;color:#fff;"><div style="font-size:11px;color:rgba(255,255,255,0.5);">${chat.name} ⭕</div><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:24px;color:#5BA3D9;">${scores.opp}</div></div>
    </div>
    <div id="tttBoard" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:min(280px,82vw);"></div>
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;color:${statusColor};">${statusText}</div>
    <button id="tttNew" style="padding:12px 32px;background:${gameOver?'var(--red)':'rgba(255,255,255,0.1)'};color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;cursor:pointer;">New game</button>
  `;
  document.getElementById('tttBack').addEventListener('click',()=>overlay.remove());
  document.getElementById('tttNew').addEventListener('click',()=>{board=Array(9).fill(null);myTurn=true;gameOver=false;winLine=null;render();});
  const boardEl=document.getElementById('tttBoard');
  board.forEach((cell,i)=>{
    const isWin=w&&w.includes(i);
    const sq=document.createElement('div');
    sq.style.cssText=`aspect-ratio:1;background:${isWin?'rgba(255,201,60,0.2)':'rgba(255,255,255,0.07)'};border:2px solid ${isWin?'var(--gold)':'rgba(255,255,255,0.1)'};border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:48px;cursor:${!cell&&myTurn&&!gameOver?'pointer':'default'};transition:all .15s ease;`;
    sq.textContent=cell==='X'?'✕':cell==='O'?'⭕':'';
    if(cell==='X')sq.style.color='#e74c3c';
    if(cell==='O')sq.style.color='#5BA3D9';
    if(!cell&&myTurn&&!gameOver)sq.addEventListener('click',()=>{
      board[i]='X';
      const w2=checkWin(board,'X');
      if(w2){winLine=w2;gameOver=true;scores.me++;recordGameResult('ttt',true);render();return;}
      if(board.every(Boolean)){gameOver=true;scores.draw++;recordGameResult('ttt',false,true);render();return;}
      myTurn=false;render();
      setTimeout(()=>{const m=getBestMove();board[m]='O';const w3=checkWin(board,'O');if(w3){winLine=w3;gameOver=true;scores.opp++;recordGameResult('ttt',false);render();return;}if(board.every(Boolean)){gameOver=true;scores.draw++;recordGameResult('ttt',false,true);render();return;}myTurn=true;render();},450);
    });
    boardEl.appendChild(sq);
  });
}
document.querySelector('.device').appendChild(overlay);render();
}

// ===================== PROFESSIONAL WORD GUESS (WORDLE) =====================
const VALID_WORDS=['PRESS','CHAIN','BLADE','FLINT','GROAN','PLUMB','CRATE','SWING','BRAVE','SHAFT','TROVE','QUILL','CHEST','FLAME','STORM','PRIDE','GLOBE','CRISP','BLOOM','DRAFT','CIVIC','GRAND','CLAIM','PIVOT','GRACE','CLOUD','EARTH','FAITH','LIGHT','MIGHT','NIGHT','PLAIN','QUEEN','RAISE','SAINT','TRAIL','UNITE','VOICE','WASTE','YIELD','ZONES','ABOUT','BEACH','CANDY','DENSE','EARLY','FANCY','GHOST','HAPPY','INDIE','JUICE','KNEEL','LASER','MAGIC','NAIVE','OCEAN','PIANO','QUIET','RIVER','SUGAR','TOUCH','ULTRA','VENOM','WORRY','XERIC','YOUNG','ZEBRA','ANGER','BLEND','CROSS','DAILY','EAGLE','FRESH','GREAT','HURRY','IDEAL','JOINT','KNOCK','LEGAL','MATCH','NOBLE','OFTEN','PAINT','RANGE','SLEEP','TRADE','UNDER','VITAL','WATER'];
const COMMON=['PRESS','CHAIN','BLADE','CRATE','CHEST','FLAME','STORM','PRIDE','GLOBE','BLOOM','CLOUD','EARTH','FAITH','LIGHT','MIGHT','NIGHT','PLAIN','QUEEN','SAINT','TRAIL','BEACH','CANDY','EARLY','GHOST','HAPPY','JUICE','MAGIC','OCEAN','PIANO','RIVER','SUGAR','TOUCH','VOICE','WORRY'];

function openWordGuess(chat){
const overlay=document.createElement('div');
overlay.style.cssText='position:absolute;inset:0;background:#121213;z-index:80;display:flex;flex-direction:column;';
const target=COMMON[Math.floor(Math.random()*COMMON.length)];
let guesses=[];let currentGuess='';let gameOver=false;let shake=false;
let keyColors={};

function getTileState(guess,pos){
  const letter=guess[pos];
  if(target[pos]===letter)return'correct';
  // Check if letter appears in target but not in this position
  const targetArr=target.split('');const guessArr=guess.split('');
  // Remove correct positions first
  guessArr.forEach((l,i)=>{if(l===target[i]){targetArr[i]=null;guessArr[i]=null;}});
  // Check remaining
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

function render(){
  overlay.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #3a3a3c;flex-shrink:0;">
      <button id="wgBack" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;">←</button>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;color:#fff;">📝 Wordle</div>
      <button id="wgNew" style="background:rgba(255,255,255,0.1);border:none;color:#fff;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;">New</button>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:10px;" id="wgGrid"></div>
    ${gameOver?`<div style="text-align:center;padding:8px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;color:${guesses[guesses.length-1]===target?'#538D4E':'#B59F3B'};flex-shrink:0;">${guesses[guesses.length-1]===target?'🎉 Brilliant!':'The word was '+target}</div>`:''}
    <div style="flex-shrink:0;padding:8px;" id="wgKeyboard"></div>
  `;
  document.getElementById('wgBack').addEventListener('click',()=>{overlay.remove();document.removeEventListener('keydown',kbHandler);});
  document.getElementById('wgNew').addEventListener('click',()=>{overlay.remove();document.removeEventListener('keydown',kbHandler);openWordGuess(chat);});

  const grid=document.getElementById('wgGrid');
  for(let r=0;r<6;r++){
    const row=document.createElement('div');row.style.cssText='display:flex;gap:5px;';
    for(let c=0;c<5;c++){
      const sq=document.createElement('div');
      let bg=COLORS.empty,border='2px solid #3a3a3c',text='',color='#fff',scale='';
      if(r<guesses.length){
        const s=getTileState(guesses[r],c);bg=COLORS[s];border='2px solid '+bg;text=guesses[r][c];
      } else if(r===guesses.length){
        text=currentGuess[c]||'';border=currentGuess[c]?'2px solid #999':'2px solid #3a3a3c';
        if(shake&&r===guesses.length)scale='animation:shakeRow .5s ease';
      }
      sq.style.cssText=`width:clamp(44px,11vw,56px);height:clamp(44px,11vw,56px);background:${bg};border:${border};border-radius:4px;display:flex;align-items:center;justify-content:center;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:clamp(18px,5vw,24px);color:${color};transition:background .2s;${scale}`;
      sq.textContent=text;
      row.appendChild(sq);
    }
    grid.appendChild(row);
  }

  // Keyboard
  const kb=document.getElementById('wgKeyboard');
  const rows=['QWERTYUIOP','ASDFGHJKL','↵ZXCVBNM⌫'];
  rows.forEach(rowStr=>{
    const rowEl=document.createElement('div');rowEl.style.cssText='display:flex;justify-content:center;gap:4px;margin-bottom:4px;';
    rowStr.split('').forEach(k=>{
      const btn=document.createElement('button');
      const s=keyColors[k];
      btn.textContent=k;
      btn.style.cssText=`padding:${k==='↵'||k==='⌫'?'14px 6px':'14px 0'};width:${k==='↵'||k==='⌫'?'46px':'32px'};border:none;border-radius:6px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;background:${s?COLORS[s]:'#818384'};color:#fff;`;
      btn.addEventListener('click',()=>handleInput(k));
      rowEl.appendChild(btn);
    });
    kb.appendChild(rowEl);
  });
}

function handleInput(k){
  if(gameOver)return;
  if(k==='⌫'||k==='Backspace'){currentGuess=currentGuess.slice(0,-1);}
  else if(k==='↵'||k==='Enter'){
    if(currentGuess.length!==5){shake=true;render();setTimeout(()=>{shake=false;render();},500);return;}
    if(!VALID_WORDS.includes(currentGuess)){showToast('Not in word list');shake=true;render();setTimeout(()=>{shake=false;render();},500);return;}
    updateKeyColors(currentGuess);guesses.push(currentGuess);
    if(currentGuess===target||guesses.length===6){gameOver=true;recordGameResult('wordguess',currentGuess===target);}
    currentGuess='';
  } else if(/^[A-Z]$/.test(k)&&currentGuess.length<5){currentGuess+=k;}
  render();
}

const kbHandler=e=>{
  if(e.key==='Backspace')handleInput('⌫');
  else if(e.key==='Enter')handleInput('↵');
  else if(/^[a-zA-Z]$/.test(e.key))handleInput(e.key.toUpperCase());
};
document.addEventListener('keydown',kbHandler);
document.querySelector('.device').appendChild(overlay);render();
}


// ===================== UPDATE GAME PICKER =====================
function openGamePicker(chat, isGroup){
  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;max-height:85vh;overflow-y:auto;';

  const allGames=[
    {emoji:'♟',name:'Chess',desc:'Full rules · AI opponent',fn:()=>openChessGame(chat)},
    {emoji:'🐍',name:'Snakes & Ladders',desc:'5 versions — Classic, Vedic, Speed, Chaos, Moksha',fn:()=>openSnakesVersionPicker(chat)},
    {emoji:'🎯',name:'Ludo',desc:'2, 3 or 4 players',fn:()=>openLudoGame(chat,isGroup?4:2)},
    {emoji:'🃏',name:'Oh, No! Cards',desc:'Classic · Double Sided · Blaze Mode',fn:()=>openUnoVariantPicker(chat)},
    {emoji:'⭕',name:'Tic-Tac-Toe',desc:'Perfect AI · Score tracking',fn:()=>openTicTacToe(chat)},
    {emoji:'📝',name:'Word Guess',desc:'Wordle-style · 5-letter words',fn:()=>openWordGuess(chat)},
    {emoji:'🏙️',name:'Business',desc:'Buy, build & bankrupt — Monopoly-style',fn:()=>openBusinessGame(chat,isGroup?4:2)},
    {emoji:'🎨',name:'Scribble',desc:'Draw & guess — any players',fn:()=>openScribbleGame(chat,[{name:chat.name}])},
    {emoji:'🔵',name:'Five in a Row',desc:'Connect 5 to win',fn:()=>openFiveInRowGame(chat)},
  ];

  sheet.innerHTML=`
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:4px;">🎮 Choose a game</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px;">${isGroup?'All games available':'2-player games'}</div>
    ${allGames.map((g,i)=>`
      <button data-i="${i}" style="width:100%;padding:13px 14px;background:var(--cream);border:2px solid var(--line);border-radius:14px;font-size:14px;font-weight:600;cursor:pointer;text-align:left;margin-bottom:8px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:26px;flex-shrink:0;">${g.emoji}</span>
        <div><div style="font-weight:700;">${g.name}</div><div style="font-size:11px;color:var(--muted);margin-top:1px;">${g.desc}</div></div>
      </button>
    `).join('')}
    <button id="closeGamePicker" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;margin-top:4px;">Cancel</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  allGames.forEach((g,i)=>sheet.querySelector(`[data-i="${i}"]`).addEventListener('click',()=>{sheet.remove();g.fn();}));
  document.getElementById('closeGamePicker').addEventListener('click',()=>sheet.remove());
}

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
