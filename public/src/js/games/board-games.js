// ===================== FIVE IN A ROW (Gomoku) =====================
function openFiveInRowGame(chat, opts){
  const options=opts||{};
  const launchSize=Number(options.size!=null?options.size:(chat&&chat.firSize)!=null?chat.firSize:(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.firSize))||15;
  let SIZE=launchSize===13?13:15;
  let board=Array(SIZE).fill(null).map(()=>Array(SIZE).fill(null));
  let gameOver=false;let winLine=null;
  let lastMove=null;let dropCell=null;let statusNote='';
  let ghostRC=null; // [r,c] translucent preview
  let threatKeys=new Set();
  const FIR_SECS=18;let firTimer=FIR_SECS;let firInterval=null;let warned=false;
  const liveOn=typeof DangalLive!=='undefined'&&DangalLive.isLive(chat);
  const liveRoles=liveOn&&DangalLive.roles?DangalLive.roles(chat):null;
  let myTurn=!liveRoles||liveRoles.myColor==='w';
  let liveHandle=null;
  let applyingLive=false;
  let leaveConfirmed=false;
  let sizeLocked=false; // locked after first stone
  /** Line law: freestyle (default) | renju. Locked after first stone / Live host push. */
  const launchLaw=(options.lawMode||options.mode||(chat&&chat.firLaw)||(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.firLaw)||'freestyle');
  let lawMode=String(launchLaw).toLowerCase()==='renju'?'renju':'freestyle';
  let lawLocked=false;
  let illegalKeys=new Set(); // Renju Black: ghost/tint forbidden empties
  let overlineLoss=false;
  /** Practice AI: normal = full threat ladder; easy = weaker / jittery. Depth = pattern scan on neighborhood (no minimax). */
  let aiDiff=String(options.aiDiff||'normal').toLowerCase()==='easy'?'easy':'normal';
  let coachShown=!!options.skipCoach;
  let aiThinkTok=0;
  let passSeqLocal=0;
  let passSeqSeen=0;
  let settleDone=false;
  let resultSettling=false;
  const liveStake=liveOn
    ?Number((chat&&chat.stake)!=null?chat.stake:(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.stake)||0)||0
    :0;
  const settleMatchId=liveOn
    ?String((chat&&chat.dangalMatchId)||(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.matchId)||'').trim()
    :'';
  let settleOppUid=(liveRoles&&liveRoles.opp)||'';

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;';
  const begin=typeof beginGameOverlaySession==='function'?beginGameOverlaySession:null;
  const gs=begin?begin({
    type:'fiveinrow',title:'Five in a Row',mode:liveOn?'live':'practice',chat,overlay,
    cleanup(){
      stopFirTimer();
      aiThinkTok++;
      if(liveHandle&&!leaveConfirmed){
        try{
          if(!gameOver)settleFirOnce(false,false);
          liveHandle.leave({forfeit:!gameOver});
        }catch(e){try{liveHandle.leave();}catch(e2){}}
      }
    },
  }):null;
  if(begin&&(!gs||!gs.alive()))return;
  if(!begin){
    const device=document.querySelector('.device');
    if(!device){if(typeof showToast==='function')showToast('Game container not found');return;}
    device.appendChild(overlay);
  }
  if(typeof prepareGameOverlay==='function') prepareGameOverlay(overlay,{theme:'dark',gameId:'fiveinrow'});
  const alive=()=>gs?gs.alive():true;
  const schedule=(fn,ms)=>gs?gs.schedule(fn,ms):setTimeout(fn,ms);
  const close=()=>{aiThinkTok++;if(gs)gs.close();else{stopFirTimer();overlay.remove();}};

  function boardEmpty(){
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(board[r][c])return false;
    return true;
  }

  function serializeBoard(){
    return board.map(row=>row.map(cell=>cell||'.').join('')).join('|');
  }

  function adoptSize(n){
    const next=n===13?13:15;
    if(next===SIZE)return;
    SIZE=next;
    board=Array(SIZE).fill(null).map(()=>Array(SIZE).fill(null));
    lastMove=null;dropCell=null;winLine=null;ghostRC=null;threatKeys=new Set();illegalKeys=new Set();
  }

  function setBoardSize(n){
    if(sizeLocked||!boardEmpty()||gameOver)return;
    adoptSize(n);
    if(typeof gameFeedback==='function')gameFeedback('select');
    render();
  }

  function setLawMode(m){
    if(lawLocked||!boardEmpty()||gameOver)return;
    lawMode=m==='renju'?'renju':'freestyle';
    illegalKeys=new Set();
    if(typeof gameFeedback==='function')gameFeedback('select');
    if(liveOn&&liveHandle&&liveRoles&&liveRoles.myColor==='w'){
      try{liveHandle.push({status:'playing',turn:liveRoles.me,size:SIZE,lawMode,board:serializeBoard()});}catch(e){}
    }
    recomputeIllegalGhosts();
    render();
  }

  async function askFirLeave(){
    if(gameOver){close();return;}
    const leaveBody=liveOn?'You’ll forfeit this Live match.':'This run will end.';
    if(typeof DangalLive!=='undefined'&&DangalLive.requestLeave){
      const ok=await DangalLive.requestLeave({
        liveHandle,isPlaying:!gameOver,title:'Leave Five in a Row?',body:leaveBody,
        onLeave:()=>{leaveConfirmed=true;liveHandle=null;},
      });
      if(!ok)return;
    }else if(typeof confirmLeaveGame==='function'){
      const ok=await confirmLeaveGame({title:'Leave Five in a Row?',body:leaveBody});
      if(!ok)return;
    }
    if(liveOn&&!gameOver)settleFirOnce(false,false);
    close();
  }

  function passTurnSoft(){
    if(!myTurn||gameOver)return;
    statusNote='Time up — turn passed';
    ghostRC=null;
    if(typeof gameFeedback==='function')gameFeedback('invalid');
    if(typeof showToast==='function')showToast('Time’s up — your turn passed');
    myTurn=false;stopFirTimer();
    render();
    if(liveOn){
      if(liveHandle&&liveRoles){
        passSeqLocal+=1;
        liveHandle.push({
          status:'playing',
          turn:liveRoles.opp,
          passTurn:true,
          passSeq:passSeqLocal,
          size:SIZE,
          lawMode,
          lastMove:lastMove?{r:lastMove[0],c:lastMove[1],uid:liveRoles.me}:null,
          board:serializeBoard(),
        });
        if(typeof DangalLive!=='undefined'&&DangalLive.pingTurn)DangalLive.pingTurn(liveRoles.opp,'fiveinrow',{chatId:chat&&(chat.firestoreId||chat.id)});
      }
      return;
    }
    scheduleAIMove();
  }

  function startFirTimer(){
    clearInterval(firInterval);firTimer=FIR_SECS;warned=false;statusNote='';
    firInterval=setInterval(()=>{
      if(!alive()){clearInterval(firInterval);return;}
      firTimer--;
      const el=document.getElementById('firTimerEl');
      if(el){
        el.textContent=firTimer+'s';
        el.classList.toggle('fir-timer--warn',firTimer<=5);
      }
      if(firTimer<=5&&!warned){
        warned=true;
        statusNote='Hurry — place a stone';
        const note=document.getElementById('firStatusNote');
        if(note)note.textContent=statusNote;
        if(typeof gameFeedback==='function')gameFeedback('turn');
      }
      if(firTimer<=0){
        clearInterval(firInterval);firInterval=null;
        passTurnSoft();
      }
    },1000);
  }
  function stopFirTimer(){clearInterval(firInterval);firInterval=null;}

  function iAmBlack(){
    // First player is Black. Practice: local is first. Live: host (w) is first.
    if(!liveOn)return true;
    return !!(liveRoles&&liveRoles.myColor==='w');
  }

  function placingAsBlack(who){
    if(who==='me')return iAmBlack();
    return !iAmBlack();
  }

  function inBound(r,c){return r>=0&&c>=0&&r<SIZE&&c<SIZE;}

  function rayInfo(r,c,dr,dc,sym){
    let count=0;let nr=r+dr,nc=c+dc;
    while(inBound(nr,nc)&&board[nr][nc]===sym){count++;nr+=dr;nc+=dc;}
    let end='edge';
    if(inBound(nr,nc))end=board[nr][nc]? 'blocked':'open';
    return{count,end,er:nr,ec:nc};
  }

  function lineThrough(r,c,dr,dc,sym){
    const f=rayInfo(r,c,dr,dc,sym);
    const b=rayInfo(r,c,-dr,-dc,sym);
    return{len:1+f.count+b.count,forward:f,back:b};
  }

  function maxLineLen(r,c,sym){
    let m=1;
    for(const[dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      m=Math.max(m,lineThrough(r,c,dr,dc,sym).len);
    }
    return m;
  }

  /** Collect consecutive cells through (r,c) on one axis for win highlight. */
  function collectLine(r,c,dr,dc,sym){
    const cells=[[r,c]];
    for(let s=1;s<SIZE;s++){
      const nr=r+dr*s,nc=c+dc*s;
      if(!inBound(nr,nc)||board[nr][nc]!==sym)break;
      cells.push([nr,nc]);
    }
    for(let s=1;s<SIZE;s++){
      const nr=r-dr*s,nc=c-dc*s;
      if(!inBound(nr,nc)||board[nr][nc]!==sym)break;
      cells.unshift([nr,nc]);
    }
    return cells;
  }

  /**
   * Renju-lite open three (per direction, ≤1):
   * consecutive .XXX. OR broken .XX.X. / .X.XX. with both outer ends empty.
   * Does not claim full RIF jump-three catalogue.
   */
  function dirIsOpenThree(r,c,dr,dc,sym){
    const{len,forward,back}=lineThrough(r,c,dr,dc,sym);
    if(len===3&&forward.end==='open'&&back.end==='open')return true;
    // Broken open threes along this axis (window of 5 empties+stones)
    const pats=['.XX.X.','.X.XX.'];
    for(let origin=-4;origin<=0;origin++){
      let s='';
      let covers=false;
      for(let i=0;i<6;i++){
        const nr=r+dr*(origin+i),nc=c+dc*(origin+i);
        if(!inBound(nr,nc)){s+='#';continue;}
        if(nr===r&&nc===c)covers=true;
        if(board[nr][nc]===sym)s+='X';
        else if(board[nr][nc])s+='B';
        else s+='.';
      }
      if(!covers)continue;
      if(pats.some(p=>s.includes(p)))return true;
    }
    return false;
  }

  function countOpenThrees(r,c,sym){
    let n=0;
    for(const[dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      if(dirIsOpenThree(r,c,dr,dc,sym))n++;
    }
    return n;
  }

  /**
   * Four = consecutive length 4 on an axis (open or half-open).
   * Also gap-fours X.XXX / XXX.X through the played point (Renju-lite).
   */
  function dirIsFour(r,c,dr,dc,sym){
    const{len}=lineThrough(r,c,dr,dc,sym);
    if(len===4)return true;
    if(len>=5)return false;
    // Gap four patterns of length 5 with one hole
    for(let origin=-4;origin<=0;origin++){
      let stones=0;let empties=0;let covers=false;let blocked=false;
      for(let i=0;i<5;i++){
        const nr=r+dr*(origin+i),nc=c+dc*(origin+i);
        if(!inBound(nr,nc)){blocked=true;break;}
        if(nr===r&&nc===c)covers=true;
        if(board[nr][nc]===sym)stones++;
        else if(board[nr][nc]){blocked=true;break;}
        else empties++;
      }
      if(blocked||!covers)continue;
      if(stones===4&&empties===1)return true;
    }
    return false;
  }

  function countFours(r,c,sym){
    let n=0;
    for(const[dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      if(dirIsFour(r,c,dr,dc,sym))n++;
    }
    return n;
  }

  /**
   * Renju Black foul check. Board must already have Black at (r,c).
   * Exact-five exception: winning five is always legal (wins).
   */
  function isForbiddenBlack(r,c,sym){
    const maxLen=maxLineLen(r,c,sym);
    if(maxLen===5)return{ok:true,exactFive:true};
    if(maxLen>=6)return{ok:false,reason:'Overline forbidden',overline:true};
    const threes=countOpenThrees(r,c,sym);
    if(threes>=2)return{ok:false,reason:'Double-three forbidden'};
    const fours=countFours(r,c,sym);
    if(fours>=2)return{ok:false,reason:'Double-four forbidden'};
    return{ok:true};
  }

  /** Win line after a placed stone, respecting Freestyle vs Renju asymmetry. */
  function winsAfterMove(sym,r,c,mode,isBlack){
    const dirs=[[0,1],[1,0],[1,1],[1,-1]];
    let best=null;
    for(const[dr,dc] of dirs){
      const cells=collectLine(r,c,dr,dc,sym);
      const len=cells.length;
      if(mode==='freestyle'||!isBlack){
        if(len>=5){best=cells.slice(0,Math.min(len,5));break;}
      } else {
        // Renju Black: exact five wins; overline is not a win
        if(len===5){best=cells;break;}
      }
    }
    return best;
  }

  function checkFiveWin(r,c,sym){
    // Back-compat helper — freestyle-style ≥5 (used only where mode not needed)
    return winsAfterMove(sym,r,c,'freestyle',false);
  }

  function rejectIllegal(reason){
    statusNote=reason||'Illegal move';
    if(typeof gameFeedback==='function')gameFeedback('invalid');
    if(typeof showToast==='function')showToast(reason||'Illegal move');
    const note=document.getElementById('firStatusNote');
    if(note)note.textContent=statusNote;
  }

  function recomputeIllegalGhosts(){
    illegalKeys=new Set();
    if(lawMode!=='renju'||gameOver||!myTurn||!iAmBlack())return;
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      if(board[r][c])continue;
      board[r][c]='X';
      const foul=isForbiddenBlack(r,c,'X');
      board[r][c]=null;
      // Overline / double patterns — mark; exact-five stays playable
      if(!foul.ok&&!foul.exactFive)illegalKeys.add(r+'_'+c);
    }
  }

  /** Lightweight threat cues: empties that make 4-in-a-row for either side (visual only). */
  function recomputeThreats(){
    const next=new Set();
    if(gameOver){threatKeys=next;return;}
    const dirs=[[0,1],[1,0],[1,1],[1,-1]];
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      if(board[r][c])continue;
      for(const sym of ['X','O']){
        board[r][c]=sym;
        let hot=false;
        for(const[dr,dc] of dirs){
          if(lineLenThrough(r,c,sym,dr,dc)>=4){hot=true;break;}
        }
        board[r][c]=null;
        if(hot){next.add(r+'_'+c);break;}
      }
    }
    threatKeys=next;
  }

  function lineLenThrough(r,c,sym,dr,dc){
    return lineThrough(r,c,dr,dc,sym).len;
  }

  function hasOpenFour(r,c,sym){
    for(const[dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      const{len,forward,back}=lineThrough(r,c,dr,dc,sym);
      if(len===4&&forward.end==='open'&&back.end==='open')return true;
    }
    return false;
  }

  /** Candidate cells: empty spots within 2 of any stone (+ center if empty board). */
  function candidateMoves(){
    const keys=new Set();
    let any=false;
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      if(!board[r][c])continue;
      any=true;
      for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){
        const nr=r+dr,nc=c+dc;
        if(!inBound(nr,nc)||board[nr][nc])continue;
        keys.add(nr+'_'+nc);
      }
    }
    if(!any){
      const m=Math.floor(SIZE/2);
      return[[m,m]];
    }
    const out=[];
    keys.forEach(k=>{
      const[rs,cs]=k.split('_');
      out.push([Number(rs),Number(cs)]);
    });
    return out;
  }

  function wouldWin(sym,r,c,isBlack){
    board[r][c]=sym;
    if(lawMode==='renju'&&isBlack&&maxLineLen(r,c,sym)>=6){
      board[r][c]=null;
      return false;
    }
    const w=winsAfterMove(sym,r,c,lawMode,isBlack);
    board[r][c]=null;
    return!!w;
  }

  function legalForSide(sym,r,c,isBlack){
    if(board[r][c])return false;
    if(lawMode!=='renju'||!isBlack)return true;
    board[r][c]=sym;
    const foul=isForbiddenBlack(r,c,sym);
    board[r][c]=null;
    return!!(foul.ok||foul.exactFive);
  }

  /**
   * Threat-minded Practice AI (White = O). Priority ladder, neighborhood candidates only.
   * Depth: 1-ply pattern features (win/block/open-four/double-threat) — not minimax.
   */
  function getAIMoveFIR(){
    const aiSym='O';
    const huSym='X';
    const aiBlack=false; // Practice AI is second / White
    const huBlack=true;
    const cands=candidateMoves().filter(([r,c])=>legalForSide(aiSym,r,c,aiBlack));
    if(!cands.length){
      for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
        if(!board[r][c]&&legalForSide(aiSym,r,c,aiBlack))return[r,c];
      }
      return[Math.floor(SIZE/2),Math.floor(SIZE/2)];
    }

    function scoreCell(r,c){
      let s=0;
      const easy=aiDiff==='easy';
      // 1) Win now
      if(wouldWin(aiSym,r,c,aiBlack))return 1e9+Math.random();
      // 2) Block opp win
      if(wouldWin(huSym,r,c,huBlack))s+=1e8;
      board[r][c]=aiSym;
      const myOpenFour=hasOpenFour(r,c,aiSym);
      const myFours=countFours(r,c,aiSym);
      const myThrees=countOpenThrees(r,c,aiSym);
      board[r][c]=null;
      board[r][c]=huSym;
      const oppOpenFour=hasOpenFour(r,c,huSym);
      const oppFours=countFours(r,c,huSym);
      const oppThrees=countOpenThrees(r,c,huSym);
      board[r][c]=null;
      // 3) Create open four / double threat
      if(myOpenFour)s+=1e7;
      if(myFours>=1&&myThrees>=1)s+=6e6;
      if(myThrees>=2)s+=5e6;
      // 4) Block opp open four / open three
      if(oppOpenFour||oppFours>=1)s+=1e6;
      if(!easy&&oppThrees>=1)s+=1.2e5;
      if(easy&&oppThrees>=1&&Math.random()<0.45)s+=2e4; // sometimes miss soft threats
      // 5) Build
      board[r][c]=aiSym;
      s+=scorePosition(r,c,aiSym)*(easy?4:12);
      board[r][c]=null;
      // Renju: prefer cells that would be illegal for Black (force foul shapes)
      if(lawMode==='renju'){
        board[r][c]=huSym;
        const foul=isForbiddenBlack(r,c,huSym);
        board[r][c]=null;
        if(!foul.ok&&!foul.exactFive)s+=8000;
      }
      // Center bias
      const mid=Math.floor(SIZE/2);
      s+=3*(SIZE-Math.abs(r-mid)-Math.abs(c-mid));
      s+=Math.random()*(easy?40:8);
      return s;
    }

    let best=cands[0];
    let bestS=-1;
    const top=[];
    for(const[r,c] of cands){
      const sc=scoreCell(r,c);
      if(sc>bestS+1){bestS=sc;best=[r,c];top.length=0;top.push([r,c,sc]);}
      else if(Math.abs(sc-bestS)<=1)top.push([r,c,sc]);
    }
    if(top.length>1){
      const pick=top[Math.floor(Math.random()*top.length)];
      return[pick[0],pick[1]];
    }
    return best;
  }

  function scorePosition(r,c,sym){
    let score=0;
    for(const[dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      const{len,forward,back}=lineThrough(r,c,dr,dc,sym);
      score+=len*len;
      if(forward.end==='open')score+=len;
      if(back.end==='open')score+=len;
    }
    return score;
  }

  function scheduleAIMove(){
    if(liveOn||gameOver||myTurn)return;
    const tok=++aiThinkTok;
    const delay=Math.max(300,400+Math.floor(Math.random()*400));
    schedule(()=>{
      if(tok!==aiThinkTok||!alive()||gameOver||myTurn||liveOn)return;
      const[ar,ac]=getAIMoveFIR();
      playMove(ar,ac,'opp');
    },delay);
  }

  function maybeCoach(){
    if(coachShown||liveOn)return;
    coachShown=true;
    const msg=lawMode==='renju'
      ?'Open fours must be answered — Renju Black can’t double-three.'
      :'Open fours must be answered — block threats before extending.';
    if(typeof showToast==='function')showToast(msg);
  }

  async function settleFirOnce(won,isDraw){
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
      const oppU=settleOppUid||(liveRoles&&liveRoles.opp)||'';
      return await DangalEconomy.reportGameEnd({
        gameType:'fiveinrow',
        result:isDraw?'draw':won?'win':'loss',
        won:!!won&&!isDraw,
        isDraw:!!isDraw,
        matchId:settleMatchId,
        sessionId:settleMatchId,
        opponentUid:oppU,
        stake:liveStake,
        winnerUid:isDraw?null:(won?me:oppU),
      });
    }catch(e){
      settleDone=false;
      return null;
    }
  }

  function freshRematch(){
    // Remember last Freestyle/Renju (+ size / AI diff in Practice).
    if(!liveOn){
      close();
      openFiveInRowGame(chat,{size:SIZE,lawMode,aiDiff,skipCoach:true});
      return;
    }
    try{
      const mid=typeof dangalMatchId==='function'
        ?dangalMatchId('fiveinrow',chat)
        :'fiveinrow_'+Date.now();
      if(window.__dangalLaunchCtx){
        window.__dangalLaunchCtx=Object.assign({},window.__dangalLaunchCtx,{
          matchId:mid,
          gameId:'fiveinrow',
          gameType:'fiveinrow',
          stake:liveStake,
          firLaw:lawMode,
          firSize:SIZE,
        });
      }
      if(chat){
        chat.dangalMatchId=mid;
        chat.stake=liveStake;
        chat.firLaw=lawMode;
        chat.firSize=SIZE;
      }
    }catch(e){}
    close();
    openFiveInRowGame(chat,{size:SIZE,lawMode});
  }

  function queueFirSettle(won,isDraw){
    if(!liveOn||resultSettling)return;
    resultSettling=true;
    settleFirOnce(won,isDraw).then(settle=>{
      if(!alive())return;
      const el=overlay.querySelector('.game-result-sub')||overlay.querySelector('#firSettleNote');
      if(!el)return;
      el.id='firSettleNote';
      if(liveStake>0){
        const cd=settle&&settle.chipDelta!=null?Number(settle.chipDelta):null;
        el.textContent=Number.isFinite(cd)&&cd!==0
          ?('Stake '+(cd>0?'+':'')+cd+' virtual · not real money')
          :'Virtual stakes · not real money';
      } else {
        el.textContent='Live 1v1 · Friendly';
      }
    });
  }

  function playMove(r,c,who){
    if(!alive()||r<0||c<0||r>=SIZE||c>=SIZE||board[r][c]||gameOver)return;
    sizeLocked=true;
    lawLocked=true;
    ghostRC=null;
    if(who==='me')maybeCoach();
    const sym=who==='me'?'X':'O';
    const asBlack=placingAsBlack(who);

    // Tentative place for Renju Black foul check
    board[r][c]=sym;
    if(lawMode==='renju'&&asBlack){
      const foul=isForbiddenBlack(r,c,sym);
      if(foul.exactFive){
        // Winning five exception — keep stone, fall through to win
      } else if(foul.overline){
        // Black overline: move stands, Black loses
        lastMove=[r,c];
        dropCell=r+'_'+c;
        statusNote='Overline — Black loses';
        gameOver=true;winLine=null;overlineLoss=true;threatKeys=new Set();illegalKeys=new Set();stopFirTimer();
        const iWon=who!=='me'; // Black played overline → Black loses
        if(gs)gs.setOutcome(iWon?'won':'lost');
        if(typeof recordGameResult==='function')recordGameResult('fiveinrow',iWon);
        if(typeof gameFeedback==='function')gameFeedback(iWon?'win':'lose');
        if(typeof showToast==='function')showToast('Overline — Black loses');
        if(liveOn&&who==='me'&&liveHandle&&!applyingLive){
          liveHandle.push({
            lastMove:{r,c,uid:liveRoles&&liveRoles.me},
            status:'over',
            turn:null,
            size:SIZE,
            lawMode,
            winner:iWon?(liveRoles&&liveRoles.me):(liveRoles&&liveRoles.opp),
            board:serializeBoard(),
            overline:true,
          });
        }
        queueFirSettle(iWon,false);
        render();
        return;
      } else if(!foul.ok){
        board[r][c]=null;
        if(who==='me')rejectIllegal(foul.reason);
        // Do not pass the turn
        recomputeIllegalGhosts();
        paintGhostOnly();
        return;
      }
    }

    lastMove=[r,c];
    dropCell=r+'_'+c;
    statusNote='';
    if(typeof gameFeedback==='function')gameFeedback(who==='me'?'stone':'move');
    if(typeof DSL!=='undefined'&&DSL.onMove)DSL.onMove('fiveinrow');

    const win=winsAfterMove(sym,r,c,lawMode,asBlack);
    recomputeThreats();
    recomputeIllegalGhosts();
    if(win){
      gameOver=true;winLine=win;threatKeys=new Set();illegalKeys=new Set();stopFirTimer();
      if(gs)gs.setOutcome(who==='me'?'won':'lost');
      if(typeof recordGameResult==='function')recordGameResult('fiveinrow',who==='me');
      if(typeof gameFeedback==='function')gameFeedback(who==='me'?'win':'lose');
      if(liveOn&&who==='me'&&liveHandle&&!applyingLive){
        liveHandle.push({
          lastMove:{r,c,uid:liveRoles&&liveRoles.me},
          status:'over',
          turn:null,
          size:SIZE,
          lawMode,
          winner:who==='me'?(liveRoles&&liveRoles.me):(liveRoles&&liveRoles.opp),
          board:serializeBoard(),
        });
      }
      queueFirSettle(who==='me',false);
      render();return;
    }
    if(board.every(row=>row.every(Boolean))){
      gameOver=true;threatKeys=new Set();illegalKeys=new Set();stopFirTimer();
      if(gs)gs.setOutcome('draw');
      if(typeof recordGameResult==='function')recordGameResult('fiveinrow',false,true);
      if(typeof gameFeedback==='function')gameFeedback('draw');
      if(liveOn&&who==='me'&&liveHandle&&!applyingLive){
        liveHandle.push({
          lastMove:{r,c,uid:liveRoles&&liveRoles.me},
          status:'over',
          turn:null,
          size:SIZE,
          lawMode,
          winner:null,
          board:serializeBoard(),
        });
      }
      queueFirSettle(false,true);
      render();return;
    }
    myTurn=who!=='me';
    if(myTurn){startFirTimer();recomputeIllegalGhosts();}else stopFirTimer();
    render();
    if(liveOn&&who==='me'&&liveHandle&&!gameOver&&!applyingLive){
      liveHandle.push({
        lastMove:{r,c,uid:liveRoles&&liveRoles.me},
        status:'playing',
        turn:liveRoles?liveRoles.opp:'',
        size:SIZE,
        lawMode,
        board:serializeBoard(),
      });
      if(typeof DangalLive!=='undefined'&&DangalLive.pingTurn&&liveRoles){
        DangalLive.pingTurn(liveRoles.opp,'fiveinrow',{chatId:chat&&(chat.firestoreId||chat.id)});
      }
      return;
    }
    if(!myTurn&&!gameOver&&!liveOn)scheduleAIMove();
  }

  function cellFromPointer(boardEl,clientX,clientY){
    const rect=boardEl.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return null;
    const x=clientX-rect.left;
    const y=clientY-rect.top;
    if(x<0||y<0||x>=rect.width||y>=rect.height)return null;
    const c=Math.min(SIZE-1,Math.max(0,Math.floor(x/(rect.width/SIZE))));
    const r=Math.min(SIZE-1,Math.max(0,Math.floor(y/(rect.height/SIZE))));
    return[r,c];
  }

  function setGhost(r,c){
    if(!myTurn||gameOver||board[r][c]){
      if(ghostRC){ghostRC=null;paintGhostOnly();}
      return;
    }
    if(ghostRC&&ghostRC[0]===r&&ghostRC[1]===c)return;
    ghostRC=[r,c];
    paintGhostOnly();
  }

  function clearGhost(){
    if(!ghostRC)return;
    ghostRC=null;
    paintGhostOnly();
  }

  function paintGhostOnly(){
    const boardEl=document.getElementById('firBoard');
    if(!boardEl)return;
    boardEl.querySelectorAll('.fir-stone--ghost').forEach(el=>el.remove());
    boardEl.querySelectorAll('.fir-cell--ghost').forEach(el=>el.classList.remove('fir-cell--ghost','fir-cell--ghost-illegal'));
    if(!ghostRC||!myTurn||gameOver)return;
    const[r,c]=ghostRC;
    if(board[r][c])return;
    const sq=boardEl.children[r*SIZE+c];
    if(!sq)return;
    const illegal=lawMode==='renju'&&iAmBlack()&&illegalKeys.has(r+'_'+c);
    sq.classList.add('fir-cell--ghost');
    if(illegal)sq.classList.add('fir-cell--ghost-illegal');
    const stone=document.createElement('span');
    stone.className='fir-stone fir-stone--ghost fir-stone--black'+(illegal?' fir-stone--ghost-illegal':'');
    stone.setAttribute('aria-hidden','true');
    sq.appendChild(stone);
  }

  function wireBoardInteractions(boardEl){
    if(!boardEl||gameOver)return;
    boardEl.style.touchAction='none';
    const onMove=e=>{
      if(!myTurn||gameOver)return;
      const src=e.touches&&e.touches[0]?e.touches[0]:e;
      if(src.clientX==null)return;
      const rc=cellFromPointer(boardEl,src.clientX,src.clientY);
      if(!rc){clearGhost();return;}
      setGhost(rc[0],rc[1]);
    };
    const onLeave=()=>clearGhost();
    if(window.PointerEvent){
      boardEl.addEventListener('pointermove',onMove);
      boardEl.addEventListener('pointerleave',onLeave);
      boardEl.addEventListener('pointercancel',onLeave);
    } else {
      boardEl.addEventListener('mousemove',onMove);
      boardEl.addEventListener('mouseleave',onLeave);
      boardEl.addEventListener('touchmove',e=>{e.preventDefault();onMove(e);},{passive:false});
      boardEl.addEventListener('touchend',onLeave);
    }
  }

  function setAiDiff(d){
    if(liveOn||!boardEmpty()||gameOver)return;
    aiDiff=d==='easy'?'easy':'normal';
    if(typeof gameFeedback==='function')gameFeedback('select');
    render();
  }

  function render(){
    if(!alive())return;
    const timerClass=firTimer<=5?'fir-timer fir-timer--warn':'fir-timer';
    const firWon=gameOver&&((winLine&&board[winLine[0][0]][winLine[0][1]]==='X')||(overlineLoss&&!iAmBlack()));
    const firLostOverline=gameOver&&overlineLoss&&iAmBlack();
    const firDrew=gameOver&&!winLine&&!overlineLoss;
    if(gameOver)queueFirSettle(!!firWon,!!firDrew);
    let resultBlock='';
    if(gameOver&&typeof gameResultHtml==='function'){
      const shareStats={
        scoreLine:firDrew?'Draw':(firWon?'Win':'Loss'),
        vs:`vs ${chat.name||'Opp'}`,
        meta:'Five in a Row · '+SIZE+'×'+SIZE+' · '+(lawMode==='renju'?'Renju':'Freestyle')+' · block fours',
        text:`Chaupaal Five in a Row: ${firDrew?'draw':firWon?'I won':'tough loss'} vs ${chat.name||'Opp'} (${lawMode==='renju'?'Renju':'Freestyle'})`,
      };
      resultBlock=gameResultHtml({
        gameId:'fiveinrow',
        glyph:firDrew?'=':firWon?'✓':'·',
        title:firDrew?"It's a draw":(firWon?'You won':`${chat.name||'Opponent'} won`),
        subtitle:liveOn?(liveStake>0?'Settling stakes…':'Live 1v1 · Friendly'):'Practice · free',
        shareCardHtml:typeof buildGameShareCard==='function'?buildGameShareCard('fiveinrow',shareStats):'',
        actions:[
          {label:'Play again',primary:true,id:'again'},
          {label:'Share',primary:false,id:'share'},
          {label:'Challenge friend',primary:false,id:'challenge'},
        ],
      });
    }
    const modeSub=liveOn
      ?(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel?DangalLive.modeChromeLabel(true):'Live 1v1')
      :(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel?DangalLive.modeChromeLabel(false,'vs AI'):'Practice vs AI');
    const sizeLabel=SIZE+'×'+SIZE;
    const lawLabel=lawMode==='renju'?'Renju':'Freestyle';
    const showLawPick=boardEmpty()&&!gameOver&&!lawLocked&&(!liveOn||(liveRoles&&liveRoles.myColor==='w'));
    const showSizePick=!liveOn&&boardEmpty()&&!gameOver&&!sizeLocked;
    const showAiPick=!liveOn&&boardEmpty()&&!gameOver;
    overlay.innerHTML=`
      ${gameChromeHtml({title:'Five in a Row',subtitle:modeSub+' · '+sizeLabel+' · '+lawLabel+(!liveOn?' · '+(aiDiff==='easy'?'Easy':'Normal'):''),backId:'firBack',rightHtml:!gameOver?`<span id="firTimerEl" class="game-chrome-metric ${timerClass}">${firTimer}s</span>`:undefined})}
      ${resultBlock?`<div class="fir-result-mount">${resultBlock}</div>`:`
      ${showLawPick||showSizePick||showAiPick?`<div class="fir-setup-bars">
        ${showLawPick?`<div class="fir-size-bar" role="group" aria-label="Line law">
          <button type="button" class="fir-size-btn${lawMode==='freestyle'?' is-active':''}" data-fir-law="freestyle">Freestyle</button>
          <button type="button" class="fir-size-btn${lawMode==='renju'?' is-active':''}" data-fir-law="renju">Renju</button>
        </div>`:''}
        ${showSizePick?`<div class="fir-size-bar" role="group" aria-label="Board size">
          <button type="button" class="fir-size-btn${SIZE===15?' is-active':''}" data-fir-size="15">Standard 15</button>
          <button type="button" class="fir-size-btn${SIZE===13?' is-active':''}" data-fir-size="13">Quick 13</button>
        </div>`:''}
        ${showAiPick?`<div class="fir-size-bar" role="group" aria-label="AI strength">
          <button type="button" class="fir-size-btn${aiDiff==='easy'?' is-active':''}" data-fir-ai="easy">Easy</button>
          <button type="button" class="fir-size-btn${aiDiff==='normal'?' is-active':''}" data-fir-ai="normal">Normal</button>
        </div>`:''}
      </div>`:''}
      <div class="fir-hud">
        <div class="fir-hud-side fir-hud-side--you">● You</div>
        <div id="firStatusNote" class="fir-hud-note">${statusNote||(myTurn?'Place a stone':(liveOn?'Their move — board stays live':(typeof practiceTurnStatus==='function'?practiceTurnStatus({myTurn:false}).label:'Practice AI thinking…')))}</div>
        <div class="fir-hud-side fir-hud-side--opp">○ ${liveOn?(chat.name||'Opp'):'Practice AI'}</div>
      </div>
      <div class="fir-law-chip" title="Line law">${lawLabel}${lawMode==='renju'?' · Black fouls':''}</div>
      <div class="fir-board-wrap">
        <div id="firBoard" class="fir-board" style="--fir-n:${SIZE};" role="grid" aria-label="Five in a Row ${sizeLabel} board"></div>
      </div>
      ${typeof gameTurnBannerHtml==='function'
        ? gameTurnBannerHtml({
            mode: gameOver?'over':myTurn?'yours':'theirs',
            label: gameOver?(winLine?(board[winLine[0][0]][winLine[0][1]]==='X'?'You won!':(liveOn?(chat.name||'Opponent'):'Practice AI')+' won!'):(overlineLoss?(firLostOverline?'Overline — you lose':'Overline — Black loses'):"It's a draw!")):(myTurn?'Your turn — place a stone':(liveOn?(chat.name||'Opponent')+' to move':(typeof practiceTurnStatus==='function'?practiceTurnStatus({myTurn:false}).label:'Practice AI thinking…'))),
            sub: !gameOver?(statusNote||(firTimer<=5&&myTurn?'Hurry — '+firTimer+'s':undefined)):undefined,
            pulse: !gameOver && myTurn,
            practice: !liveOn,
          })
        : `<div class="fir-turn-fallback">${gameOver?(winLine?(board[winLine[0][0]][winLine[0][1]]==='X'?'You won!':(liveOn?chat.name:'Practice AI')+' won!'):"It's a draw!"):(myTurn?'Your turn':(liveOn?(chat.name||'Opponent')+' thinking…':(typeof practiceTurnStatus==='function'?practiceTurnStatus({myTurn:false}).label:'Practice AI thinking…')))}</div>`}`}
    `;
    document.getElementById('firBack').addEventListener('click',()=>{askFirLeave();});
    if(resultBlock&&typeof wireGameResultActions==='function'){
      const shareStats={
        scoreLine:firDrew?'Draw':(firWon?'Win':'Loss'),
        vs:`vs ${chat.name||'Opp'}`,
        meta:'Five in a Row · '+SIZE+'×'+SIZE+' · '+lawLabel+' · block fours',
        text:`Chaupaal Five in a Row: ${firDrew?'draw':firWon?'I won':'tough loss'} vs ${chat.name||'Opp'} (${lawLabel})`,
      };
      wireGameResultActions(overlay,{
        again:()=>freshRematch(),
        share:()=>{if(typeof shareGameResult==='function')shareGameResult('fiveinrow',shareStats);},
        challenge:async()=>{
          if(typeof openFriendPickerSheet==='function'){
            const f=await openFriendPickerSheet({title:'Five in a Row',subtitle:'Challenge a friend'});
            if(f&&typeof shareGameResult==='function')shareGameResult('fiveinrow',{...shareStats,text:`Hey ${f.name} — Five in a Row on Chaupaal?`});
          }
        },
      });
      return;
    }
    if(showSizePick){
      overlay.querySelectorAll('[data-fir-size]').forEach(btn=>{
        btn.addEventListener('click',()=>setBoardSize(Number(btn.getAttribute('data-fir-size'))));
      });
    }
    if(showLawPick){
      overlay.querySelectorAll('[data-fir-law]').forEach(btn=>{
        btn.addEventListener('click',()=>setLawMode(btn.getAttribute('data-fir-law')));
      });
    }
    if(showAiPick){
      overlay.querySelectorAll('[data-fir-ai]').forEach(btn=>{
        btn.addEventListener('click',()=>setAiDiff(btn.getAttribute('data-fir-ai')));
      });
    }
    const boardEl=document.getElementById('firBoard');
    if(!boardEl)return;
    const winSet=new Set((winLine||[]).map(([r,c])=>r+'_'+c));
    const lastKey=lastMove?lastMove[0]+'_'+lastMove[1]:'';
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      const key=r+'_'+c;
      const sq=document.createElement('button');
      sq.type='button';
      sq.className='fir-cell';
      sq.setAttribute('role','gridcell');
      sq.setAttribute('aria-label',`Row ${r+1} column ${c+1}`);
      if(winSet.has(key))sq.classList.add('fir-cell--win');
      if(threatKeys.has(key)&&!board[r][c])sq.classList.add('fir-cell--threat');
      if(illegalKeys.has(key)&&!board[r][c])sq.classList.add('fir-cell--illegal');
      if(board[r][c]){
        const stone=document.createElement('span');
        stone.className='fir-stone fir-stone--'+(board[r][c]==='X'?'black':'white');
        if(dropCell===key)stone.classList.add('fir-stone--drop');
        if(lastKey===key)stone.classList.add('fir-stone--last');
        sq.appendChild(stone);
      } else if(myTurn&&!gameOver){
        sq.classList.add('fir-cell--open');
        sq.addEventListener('click',()=>{stopFirTimer();playMove(r,c,'me');});
      }
      boardEl.appendChild(sq);
    }
    dropCell=null;
    wireBoardInteractions(boardEl);
    if(ghostRC)paintGhostOnly();
  }

  function applyLiveBoard(val){
    if(!val.board||typeof val.board!=='string'||!val.board.includes('|'))return false;
    const rows=val.board.split('|');
    const n=Number(val.size)||rows.length;
    if(n!==13&&n!==15)return false;
    if(rows.length!==n)return false;
    if(n!==SIZE)adoptSize(n);
    if(!board.every(row=>row.every(c=>!c)))sizeLocked=true;
    for(let r=0;r<SIZE;r++){
      const cells=rows[r].split('');
      for(let c=0;c<SIZE;c++){
        const ch=cells[c];
        board[r][c]=(ch==='X'||ch==='O')?ch:null;
      }
    }
    return true;
  }

  if(liveOn&&liveRoles&&typeof DangalLive!=='undefined'){
    liveHandle=DangalLive.join({
      gameType:'fiveinrow',
      matchId:(chat&&chat.dangalMatchId)||(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.matchId),
      me:liveRoles.me,
      playerA:liveRoles.playerA,
      playerB:liveRoles.playerB,
      onSnap(val){
        if(!val||applyingLive||!alive())return;
        if(val.status==='forfeit'&&!gameOver){
          gameOver=true;stopFirTimer();ghostRC=null;threatKeys=new Set();
          const iWon=val.winner===liveRoles.me;
          if(gs)gs.setOutcome(iWon?'won':'lost');
          if(typeof recordGameResult==='function')recordGameResult('fiveinrow',iWon);
          queueFirSettle(iWon,false);
          render();
          return;
        }
        // Soft pass: both clients apply turn once via passSeq
        if(val.passTurn){
          const seq=Number(val.passSeq)||0;
          if(seq>0&&seq<=passSeqSeen)return;
          if(seq>passSeqSeen)passSeqSeen=seq;
          applyingLive=true;
          ghostRC=null;
          if(val.lawMode==='renju'||val.lawMode==='freestyle'){lawMode=val.lawMode;if(!boardEmpty())lawLocked=true;}
          if(applyLiveBoard(val)){/* keep board in sync */}
          gameOver=val.status==='over';
          myTurn=!gameOver&&val.turn===liveRoles.me;
          if(myTurn){
            statusNote='Opponent’s time ran out — your turn';
            startFirTimer();
            recomputeIllegalGhosts();
          } else stopFirTimer();
          if(!gameOver){recomputeThreats();recomputeIllegalGhosts();}
          render();
          applyingLive=false;
          return;
        }
        if(val.lawMode==='renju'||val.lawMode==='freestyle'){
          if(boardEmpty()||!lawLocked)lawMode=val.lawMode;
          if(!boardEmpty())lawLocked=true;
        }
        if(val.size===13||val.size===15){
          if(boardEmpty()&&Number(val.size)!==SIZE)adoptSize(Number(val.size));
          if(!boardEmpty())sizeLocked=true;
        }
        if(applyLiveBoard(val)){
          applyingLive=true;
          ghostRC=null;
          if(val.lawMode==='renju'||val.lawMode==='freestyle'){lawMode=val.lawMode;lawLocked=true;}
          if(val.lastMove&&val.lastMove.r!=null)lastMove=[val.lastMove.r,val.lastMove.c];
          winLine=null;
          overlineLoss=!!val.overline;
          if(lastMove&&board[lastMove[0]]&&board[lastMove[0]][lastMove[1]]&&!overlineLoss){
            const sym=board[lastMove[0]][lastMove[1]];
            // On shared board, X is host/first — Black when law Mode renju
            const stoneBlack=sym==='X'; // host encoding: first player X
            if(sym)winLine=winsAfterMove(sym,lastMove[0],lastMove[1],lawMode,stoneBlack);
          }
          gameOver=val.status==='over'||!!winLine||overlineLoss||board.every(row=>row.every(Boolean));
          if(!gameOver){recomputeThreats();recomputeIllegalGhosts();}
          else{threatKeys=new Set();illegalKeys=new Set();}
          myTurn=!gameOver&&val.turn===liveRoles.me;
          if(myTurn){startFirTimer();recomputeIllegalGhosts();}else stopFirTimer();
          if(gameOver){
            const iWon=!!(winLine&&board[winLine[0][0]][winLine[0][1]]==='X')||(overlineLoss&&!iAmBlack());
            const drew=!winLine&&!overlineLoss&&board.every(row=>row.every(Boolean));
            queueFirSettle(iWon,drew||val.winner==null&&val.status==='over'&&!winLine&&!overlineLoss);
          }
          render();
          applyingLive=false;
          return;
        }
        if(!val.lastMove)return;
        const lm=val.lastMove;
        if(!lm||lm.uid===liveRoles.me)return;
        if(lm.r==null||lm.c==null||lm.r>=SIZE||lm.c>=SIZE)return;
        if(board[lm.r]&&board[lm.r][lm.c])return;
        applyingLive=true;
        playMove(lm.r,lm.c,'opp');
        applyingLive=false;
      },
    });
    // Host announces size + law so peer matches before first stone
    if(liveRoles.myColor==='w'&&liveHandle){
      try{
        liveHandle.push({status:'playing',turn:liveRoles.me,size:SIZE,lawMode,board:serializeBoard()});
      }catch(e){}
    }
  }
  recomputeThreats();
  recomputeIllegalGhosts();
  render();if(myTurn)startFirTimer();
}

// ===================== BUSINESS (property trading) =====================
function openBusinessGame(chat,playerCount){
  playerCount=Math.min(Math.max(playerCount||2,2),6);
  const liveOn=typeof DangalLive!=='undefined'&&DangalLive.isLive(chat);
  if(liveOn)playerCount=2;
  const liveRoles=liveOn&&DangalLive.roles?DangalLive.roles(chat):null;
  let liveHandle=null;let applyingLive=false;let leaveConfirmed=false;
  let settleDone=false;
  const liveStake=liveOn
    ?Number((chat&&chat.stake)!=null?chat.stake:(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.stake)||0)||0
    :0;
  const settleMatchId=liveOn
    ?String((chat&&chat.dangalMatchId)||(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.matchId)||'').trim()
    :'';
  let settleOppUid=(liveRoles&&liveRoles.opp)||'';
  const mySeat=!liveRoles||liveRoles.myColor==='w'?0:1;
  const MODE_SUB=liveOn
    ?(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel?DangalLive.modeChromeLabel(true):'Live 1v1')
    :(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel
      ?DangalLive.modeChromeLabel(false,playerCount>2?playerCount+' players':'vs AI')
      :(playerCount>2?('Practice · '+playerCount+' players'):'Practice vs AI'));
  const PLAYER_COLORS=['#E74C3C','#3498DB','#2ECC71','#F1C40F','#9B59B6','#1ABC9C'];
  const NAMES=liveOn
    ?(mySeat===0?['You',chat.name||'Friend']:[chat.name||'Friend','You'])
    :['You',chat.name,...(playerCount>2?['Player 3','Player 4','Player 5','Player 6'].slice(0,playerCount-2):[])];

  const BOARD=[
    {name:'Start',type:'go'},
    {name:'Connaught Place',type:'property',price:600,rent:[20,100,300,750,925,1100],color:'#955436',group:0},
    {name:'Community Fund',type:'chest'},
    {name:'Karol Bagh',type:'property',price:600,rent:[40,200,600,1400,1700,2000],color:'#955436',group:0},
    {name:'Income Tax',type:'tax',amount:200},
    {name:'Railway Station 1',type:'railway',price:2000,group:'rail'},
    {name:'Lajpat Nagar',type:'property',price:1000,rent:[60,300,900,1600,2000,2500],color:'#aae0fa',group:1},
    {name:'Twist',type:'chance'},
    {name:'Saket',type:'property',price:1000,rent:[60,300,900,1600,2000,2500],color:'#aae0fa',group:1},
    {name:'Hauz Khas',type:'property',price:1200,rent:[80,400,1000,2000,2400,2800],color:'#aae0fa',group:1},
    {name:'Jail',type:'jail'},
    {name:'Bandra',type:'property',price:1400,rent:[100,500,1500,4500,6250,7500],color:'#d93a96',group:2},
    {name:'Electric Company',type:'utility',price:1500,group:'util'},
    {name:'Andheri',type:'property',price:1400,rent:[100,500,1500,4500,6250,7500],color:'#d93a96',group:2},
    {name:'Powai',type:'property',price:1600,rent:[120,600,1800,5000,7000,9000],color:'#d93a96',group:2},
    {name:'Railway Station 2',type:'railway',price:2000,group:'rail'},
    {name:'Koramangala',type:'property',price:1800,rent:[140,700,2000,5500,7500,9500],color:'#f7941d',group:3},
    {name:'Community Fund',type:'chest'},
    {name:'Indiranagar',type:'property',price:1800,rent:[140,700,2000,5500,7500,9500],color:'#f7941d',group:3},
    {name:'Whitefield',type:'property',price:2000,rent:[160,800,2200,6000,8000,10000],color:'#f7941d',group:3},
    {name:'Rest Stop',type:'parking'},
    {name:'Salt Lake',type:'property',price:2200,rent:[180,900,2500,7000,8750,10500],color:'#ed1b24',group:4},
    {name:'Twist',type:'chance'},
    {name:'Park Street',type:'property',price:2200,rent:[180,900,2500,7000,8750,10500],color:'#ed1b24',group:4},
    {name:'New Town',type:'property',price:2400,rent:[200,1000,3000,7500,9250,11000],color:'#ed1b24',group:4},
    {name:'Railway Station 3',type:'railway',price:2000,group:'rail'},
    {name:'Anna Nagar',type:'property',price:2600,rent:[220,1100,3300,8000,9750,11500],color:'#fef200',group:5},
    {name:'T Nagar',type:'property',price:2600,rent:[220,1100,3300,8000,9750,11500],color:'#fef200',group:5},
    {name:'Water Works',type:'utility',price:1500,group:'util'},
    {name:'Velachery',type:'property',price:2800,rent:[240,1200,3600,8500,10250,12000],color:'#fef200',group:5},
    {name:'Go To Jail',type:'gotojail'},
    {name:'Jubilee Hills',type:'property',price:3000,rent:[260,1300,3900,9000,11000,12750],color:'#1fb25a',group:6},
    {name:'Banjara Hills',type:'property',price:3000,rent:[260,1300,3900,9000,11000,12750],color:'#1fb25a',group:6},
    {name:'Twist',type:'chance'},
    {name:'Gachibowli',type:'property',price:3200,rent:[280,1500,4500,10000,12000,14000],color:'#1fb25a',group:6},
    {name:'Railway Station 4',type:'railway',price:2000,group:'rail'},
    {name:'Community Fund',type:'chest'},
    {name:'Sector 17',type:'property',price:3500,rent:[350,1750,5000,11000,13000,15000],color:'#0072bb',group:7},
    {name:'Luxury Tax',type:'tax',amount:1000},
    {name:'Golf Course Road',type:'property',price:4000,rent:[500,2000,6000,14000,17000,20000],color:'#0072bb',group:7},
  ];

  const ownType=typeof ownProfileType==='function'?ownProfileType():(typeof getProfileType==='function'?getProfileType():'personal');
  let players=NAMES.map((name,i)=>({
    name,
    pos:0,
    money:15000,
    properties:[],
    inJail:false,
    jailAttempts:0,
    jailed:0, // legacy mirror for older Live snaps
    bankrupt:false,
    color:PLAYER_COLORS[i],
    profileType:i===mySeat?ownType:(i===(mySeat===0?1:0)?(chat?.profileType||null):null),
  }));
  let currentPlayer=0;let diceVal=[1,1];let rolling=false;let gameOver=false;let message='';
  let awaitingBuy=false;let awaitingJailChoice=false;let focusPos=0;let buildOpen=false;let liqOpen=false;
  let doublesStreak=0;let pendingExtraTurn=false;
  /** Per-tile improvements: { houses:0–4, hotel:bool }. Hotel = 5th purchase. */
  let improvements={}; // idx -> { houses:0, hotel:false }
  /** Mortgaged tile indexes → true. Mortgage = 50% price; unmortgage = mortgage + 10%. */
  let mortgaged={};
  /** Active auction or null. Once-around Raise/Pass. */
  let auction=null;
  /** Distress: raise cash for rent/tax/fine before bankrupt. */
  let distress=null;
  /** Pending trade proposal between two seats. */
  let trade=null;
  /** Local compose sheet (not synced until Propose). */
  let tradeDraft=null;
  let tradeOpen=false;
  /** House cost by colour group (₹15k start). Hotel = one more same cost. No bank scarcity. */
  const HOUSE_COST={0:500,1:500,2:1000,3:1000,4:1500,5:1500,6:2000,7:2000};
  const JAIL_IDX=10;
  const GO_SALARY=2000; // keep Prompt-era Start cash
  const JAIL_FINE=500;  // scaled classic fine for ₹15k start
  const AUCTION_SECS=12;
  const TRADE_SECS=25;
  const BUS_SECS=20;let busTimer=BUS_SECS;let busInterval=null;let diceIv=null;let auctionInterval=null;let tradeInterval=null;

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;';
  const begin=typeof beginGameOverlaySession==='function'?beginGameOverlaySession:null;
  const gs=begin?begin({
    type:'business',title:'Business',mode:liveOn?'live':'practice',chat,overlay,
    opponentUid:liveOn?settleOppUid:'',
    matchId:settleMatchId,
    stake:liveStake,
    // Dedicated settleBusinessOnce owns chips — avoid double reportGameEnd from setOutcome.
    skipEconomyReport:!!liveOn,
    cleanup(){
      stopBusTimer();stopAuctionTimer();stopTradeTimer();if(diceIv){clearInterval(diceIv);diceIv=null;}
      trade=null;tradeDraft=null;
      if(liveHandle&&!leaveConfirmed){
        try{
          if(!gameOver)settleBusinessOnce(false);
          liveHandle.leave({forfeit:!gameOver});
        }catch(e){try{liveHandle.leave();}catch(e2){}}
      }
    },
  }):null;
  if(begin&&(!gs||!gs.alive()))return;
  if(!begin){
    const device=document.querySelector('.device');
    if(!device){if(typeof showToast==='function')showToast('Game container not found');return;}
    device.appendChild(overlay);
  }
  if(typeof prepareGameOverlay==='function') prepareGameOverlay(overlay,{theme:'dark',gameId:'business'});
  const alive=()=>gs?gs.alive():true;
  const schedule=(fn,ms)=>gs?gs.schedule(fn,ms):setTimeout(fn,ms);
  const close=()=>{if(gs)gs.close();else{stopBusTimer();stopAuctionTimer();stopTradeTimer();if(diceIv)clearInterval(diceIv);overlay.remove();}};
  const isMyControl=()=>currentPlayer===mySeat;
  const isAuctionControl=()=>!!(auction&&auction.turnSeat===mySeat);
  const isDistressControl=()=>!!(distress&&distress.payerSeat===mySeat);
  const isTradeResponder=()=>!!(trade&&trade.status==='pending'&&trade.to===mySeat);
  const isTradeProposer=()=>!!(trade&&trade.status==='pending'&&trade.from===mySeat);

  async function askBusLeave(){
    if(gameOver){close();return;}
    if(typeof DangalLive!=='undefined'&&DangalLive.requestLeave){
      const ok=await DangalLive.requestLeave({
        liveHandle,isPlaying:!gameOver,title:'Leave Business?',body:'This run will end.',
        onLeave:()=>{leaveConfirmed=true;liveHandle=null;},
      });
      if(!ok)return;
    }else if(typeof confirmLeaveGame==='function'){
      const ok=await confirmLeaveGame({title:'Leave Business?',body:'This run will end.'});
      if(!ok)return;
    }
    close();
  }

  function normalizeJailFields(p){
    if(!p)return;
    if(p.inJail==null&&p.jailed!=null)p.inJail=Number(p.jailed)>0;
    p.inJail=!!p.inJail;
    p.jailAttempts=Math.min(3,Math.max(0,Number(p.jailAttempts)||0));
    p.jailed=p.inJail?Math.max(1,3-p.jailAttempts):0;
  }

  function serializeBusPlayers(){
    return players.map(p=>{
      normalizeJailFields(p);
      return {
        pos:p.pos,money:p.money,properties:(p.properties||[]).slice(),
        inJail:!!p.inJail,jailAttempts:p.jailAttempts||0,
        jailed:p.jailed||0,bankrupt:!!p.bankrupt,
      };
    });
  }
  function serializeMortgaged(){
    const out={};
    Object.keys(mortgaged).forEach((k)=>{if(mortgaged[k])out[k]=true;});
    return out;
  }
  function applyMortgaged(raw){
    const next={};
    if(raw&&typeof raw==='object'){
      Object.keys(raw).forEach((k)=>{if(raw[k])next[k]=true;});
    }
    mortgaged=next;
  }
  function serializeAuction(){
    if(!auction)return null;
    return {
      tileIdx:auction.tileIdx,
      minBid:auction.minBid,
      raiseBy:auction.raiseBy,
      highBid:auction.highBid,
      highBidder:auction.highBidder,
      turnSeat:auction.turnSeat,
      passed:Array.isArray(auction.passed)?auction.passed.slice():[],
    };
  }
  function applyAuction(raw){
    if(!raw||typeof raw!=='object'){auction=null;return;}
    auction={
      tileIdx:Number(raw.tileIdx),
      minBid:Number(raw.minBid)||100,
      raiseBy:Number(raw.raiseBy)||100,
      highBid:Number(raw.highBid)||0,
      highBidder:raw.highBidder==null?null:Number(raw.highBidder),
      turnSeat:Number(raw.turnSeat)||0,
      passed:Array.isArray(raw.passed)?raw.passed.map(Number):[],
    };
  }
  function serializeDistress(){
    if(!distress)return null;
    return {
      payerSeat:distress.payerSeat,
      amount:distress.amount,
      creditorSeat:distress.creditorSeat,
      kind:distress.kind||'debt',
      note:distress.note||'',
    };
  }
  function applyDistress(raw){
    if(!raw||typeof raw!=='object'){distress=null;return;}
    distress={
      payerSeat:Number(raw.payerSeat),
      amount:Number(raw.amount)||0,
      creditorSeat:raw.creditorSeat==null?null:Number(raw.creditorSeat),
      kind:raw.kind||'debt',
      note:raw.note||'',
    };
  }
  function serializeTrade(){
    if(!trade)return null;
    return {
      from:Number(trade.from),
      to:Number(trade.to),
      offerProps:Array.isArray(trade.offerProps)?trade.offerProps.map(Number):[],
      offerCash:Math.max(0,Number(trade.offerCash)||0),
      askProps:Array.isArray(trade.askProps)?trade.askProps.map(Number):[],
      askCash:Math.max(0,Number(trade.askCash)||0),
      status:trade.status||'pending',
    };
  }
  function applyTrade(raw){
    if(!raw||typeof raw!=='object'){trade=null;return;}
    trade={
      from:Number(raw.from),
      to:Number(raw.to),
      offerProps:Array.isArray(raw.offerProps)?raw.offerProps.map(Number):[],
      offerCash:Math.max(0,Number(raw.offerCash)||0),
      askProps:Array.isArray(raw.askProps)?raw.askProps.map(Number):[],
      askCash:Math.max(0,Number(raw.askCash)||0),
      status:raw.status||'pending',
    };
  }
  function serializeImprovements(){
    const out={};
    Object.keys(improvements).forEach((k)=>{
      const imp=improvements[k]||{};
      out[k]={houses:Math.max(0,Number(imp.houses)||0),hotel:!!imp.hotel};
    });
    return out;
  }
  function applyImprovements(raw){
    if(!raw||typeof raw!=='object')return;
    const next={};
    Object.keys(raw).forEach((k)=>{
      const imp=raw[k]||{};
      const hotel=!!imp.hotel;
      const houses=hotel?0:Math.min(4,Math.max(0,Number(imp.houses)||0));
      next[k]={houses,hotel};
    });
    improvements=next;
  }
  function applyBusPlayers(raw){
    if(!Array.isArray(raw))return;
    raw.forEach((rp,i)=>{
      if(!players[i]||!rp)return;
      players[i].pos=Number(rp.pos)||0;
      players[i].money=Number(rp.money)||0;
      players[i].properties=Array.isArray(rp.properties)?rp.properties.slice():[];
      if(rp.inJail!=null)players[i].inJail=!!rp.inJail;
      else players[i].inJail=Number(rp.jailed)>0;
      players[i].jailAttempts=Number(rp.jailAttempts)||0;
      players[i].bankrupt=!!rp.bankrupt;
      normalizeJailFields(players[i]);
    });
  }
  function liveTurnUid(){
    if(gameOver||!liveRoles)return null;
    if(trade&&trade.status==='pending')return trade.to===0?liveRoles.playerA:liveRoles.playerB;
    if(auction)return auction.turnSeat===0?liveRoles.playerA:liveRoles.playerB;
    if(distress)return distress.payerSeat===0?liveRoles.playerA:liveRoles.playerB;
    return currentPlayer===0?liveRoles.playerA:liveRoles.playerB;
  }
  function pushBusiness(){
    if(!liveOn||!liveHandle||!liveRoles||applyingLive)return;
    const winnerSeat=gameOver?players.findIndex(p=>!p.bankrupt):-1;
    const turnUid=liveTurnUid();
    liveHandle.push({
      state:{
        players:serializeBusPlayers(),
        improvements:serializeImprovements(),
        mortgaged:serializeMortgaged(),
        auction:serializeAuction(),
        distress:serializeDistress(),
        trade:serializeTrade(),
        currentPlayer,diceVal:diceVal.slice(),message,gameOver,
        awaitingBuy,awaitingJailChoice,focusPos,doublesStreak,pendingExtraTurn,
      },
      turn:turnUid,
      status:gameOver?'over':'playing',
      winner:winnerSeat===0?liveRoles.playerA:(winnerSeat===1?liveRoles.playerB:null),
    });
    if(!gameOver&&turnUid&&turnUid!==liveRoles.me&&typeof DangalLive!=='undefined'&&DangalLive.pingTurn){
      DangalLive.pingTurn(liveRoles.opp,'business',{chatId:chat&&(chat.firestoreId||chat.id)});
    }
  }

  function startBusTimer(){
    if(auction||distress||trade)return;
    if(!isMyControl()||!alive()||awaitingBuy)return;
    clearInterval(busInterval);busTimer=BUS_SECS;
    busInterval=setInterval(()=>{
      if(!alive()){clearInterval(busInterval);return;}
      busTimer--;
      const el=document.getElementById('busTimerEl');
      if(el)el.textContent=busTimer+'s';
      if(busTimer<=0){
        clearInterval(busInterval);
        if(rolling||gameOver||awaitingBuy||auction||distress||trade)return;
        if(awaitingJailChoice)jailRollAttempt();
        else rollBusDice();
      }
    },1000);
  }
  function stopBusTimer(){clearInterval(busInterval);busInterval=null;}
  function stopAuctionTimer(){clearInterval(auctionInterval);auctionInterval=null;}
  function stopTradeTimer(){clearInterval(tradeInterval);tradeInterval=null;}
  function startTradeTimer(){
    stopTradeTimer();
    if(!trade||trade.status!=='pending'||!alive()||gameOver)return;
    if(liveOn&&!isTradeResponder())return;
    if(!liveOn&&trade.to!==mySeat)return;
    busTimer=TRADE_SECS;
    tradeInterval=setInterval(()=>{
      if(!alive()||!trade){stopTradeTimer();return;}
      busTimer--;
      const el=document.getElementById('busTimerEl');
      if(el)el.textContent=busTimer+'s';
      if(busTimer<=0){
        stopTradeTimer();
        if(liveOn&&isTradeResponder())declineTrade('Trade timed out');
        else if(!liveOn&&trade&&trade.to===mySeat)declineTrade('Trade timed out');
        else if(!liveOn&&trade){
          const to=players[trade.to];
          trade=null;
          message='Trade timed out';
          render();
          if(isMyControl())startBusTimer();
        }
      }
    },1000);
  }
  function startAuctionTimer(){
    stopAuctionTimer();
    if(!auction||!alive()||gameOver)return;
    if(liveOn&&!isAuctionControl())return;
    busTimer=AUCTION_SECS;
    auctionInterval=setInterval(()=>{
      if(!alive()||!auction){stopAuctionTimer();return;}
      busTimer--;
      const el=document.getElementById('busTimerEl');
      if(el)el.textContent=busTimer+'s';
      if(busTimer<=0){
        stopAuctionTimer();
        auctionPass();
      }
    },1000);
  }

  function sendToJail(player,reason){
    if(!player)return;
    player.pos=JAIL_IDX;
    player.inJail=true;
    player.jailAttempts=0;
    normalizeJailFields(player);
    focusPos=JAIL_IDX;
    doublesStreak=0;
    pendingExtraTurn=false;
    message=reason||'Sent to Jail';
  }

  function leaveJail(player){
    if(!player)return;
    player.inJail=false;
    player.jailAttempts=0;
    normalizeJailFields(player);
    awaitingJailChoice=false;
  }

  function payJailFine(){
    if(!isMyControl()&&liveOn)return;
    const p=players[currentPlayer];
    if(!p||!p.inJail||rolling||gameOver||awaitingBuy||auction||distress)return;
    if(!tryCollectPayment(p,JAIL_FINE,null,'jail',`jail fine ₹${JAIL_FINE}`))return;
    leaveJail(p);
    message=`Paid ₹${JAIL_FINE} to leave jail — roll to move`;
    if(liveOn)pushBusiness();
    render();
    if(isMyControl())startBusTimer();
    else if(!liveOn)schedule(rollBusDice,500);
  }

  function jailRollAttempt(){
    if(!alive()||rolling||gameOver||awaitingBuy)return;
    if(liveOn&&!isMyControl())return;
    const p=players[currentPlayer];
    if(!p||!p.inJail)return;
    awaitingJailChoice=false;
    buildOpen=false;
    stopBusTimer();rolling=true;let ticks=0;
    if(typeof gameFeedback==='function')gameFeedback('select');
    if(diceIv)clearInterval(diceIv);
    diceIv=setInterval(()=>{
      if(!alive()){clearInterval(diceIv);diceIv=null;return;}
      diceVal=[Math.floor(Math.random()*6)+1,Math.floor(Math.random()*6)+1];render();ticks++;
      if(ticks>8){
        clearInterval(diceIv);diceIv=null;rolling=false;
        handleJailRollResult(diceVal[0]===diceVal[1],diceVal[0]+diceVal[1]);
      }
    },80);
  }

  function handleJailRollResult(isDouble,sum){
    const p=players[currentPlayer];
    if(!p)return;
    if(isDouble){
      leaveJail(p);
      message=`Doubles — free from jail!`;
      movePlayerToken(sum,{noDoublesExtra:true});
      return;
    }
    p.jailAttempts=(Number(p.jailAttempts)||0)+1;
    if(p.jailAttempts>=3){
      leaveJail(p);
      liquidateHousesToBank(p);
      let guard=0;
      while(p.money<JAIL_FINE&&guard++<40){
        const morts=listMortgageOptions(p);
        if(!morts.length)break;
        mortgageTile(p,morts[0].idx,{quiet:true});
      }
      if(p.money<JAIL_FINE){
        bankruptPlayer(p,null);
        if(checkBankruptcyAndWinner())return;
        finishMoveResolution();
        return;
      }
      p.money-=JAIL_FINE;
      message=`3rd try — paid ₹${JAIL_FINE} and left`;
      movePlayerToken(sum,{noDoublesExtra:true});
      return;
    }
    normalizeJailFields(p);
    message=`No doubles — still in jail (${p.jailAttempts}/3)`;
    awaitingJailChoice=false;
    if(liveOn)pushBusiness();
    endBusTurn();
  }

  function aiJailDecision(){
    const p=players[currentPlayer];
    if(!p||!p.inJail||gameOver)return;
    const forcePay=p.jailAttempts>=2&&p.money>=JAIL_FINE;
    const richPay=p.money>=JAIL_FINE*3&&p.money>5000&&Math.random()<0.4;
    if(forcePay||richPay){
      p.money-=JAIL_FINE;
      leaveJail(p);
      message=`${p.name} paid ₹${JAIL_FINE} to leave jail`;
      render();
      schedule(rollBusDice,500);
      return;
    }
    jailRollAttempt();
  }

  function rollBusDice(){
    if(!alive()||rolling||gameOver||awaitingBuy)return;
    if(liveOn&&!isMyControl())return;
    const p=players[currentPlayer];
    if(p&&p.inJail){
      if(!awaitingJailChoice)awaitingJailChoice=true;
      jailRollAttempt();
      return;
    }
    buildOpen=false;
    stopBusTimer();rolling=true;let ticks=0;
    if(typeof gameFeedback==='function')gameFeedback('select');
    if(diceIv)clearInterval(diceIv);
    diceIv=setInterval(()=>{
      if(!alive()){clearInterval(diceIv);diceIv=null;return;}
      diceVal=[Math.floor(Math.random()*6)+1,Math.floor(Math.random()*6)+1];render();ticks++;
      if(ticks>8){
        clearInterval(diceIv);diceIv=null;rolling=false;
        onDiceResolved();
      }
    },80);
  }

  function onDiceResolved(){
    const p=players[currentPlayer];
    if(!p||p.bankrupt)return;
    const isDouble=diceVal[0]===diceVal[1];
    const sum=diceVal[0]+diceVal[1];
    if(isDouble){
      doublesStreak++;
      if(doublesStreak>=3){
        sendToJail(p,'Three doubles — sent to jail');
        if(liveOn)pushBusiness();
        render();
        endBusTurn();
        return;
      }
    } else {
      doublesStreak=0;
    }
    movePlayerToken(sum,{wasDouble:isDouble});
  }

  function isBuyable(tile){
    return tile&&(tile.type==='property'||tile.type==='railway'||tile.type==='utility');
  }

  function tileImp(idx){
    if(improvements[idx]==null)improvements[idx]={houses:0,hotel:false};
    return improvements[idx];
  }

  /** Prompt 2 reads houses/hotel; Prompt 1 always returns 0 unless state set. */
  function improvementTier(idx){
    const imp=tileImp(idx);
    if(imp.hotel)return 5;
    return Math.min(4,Math.max(0,Number(imp.houses)||0));
  }

  function groupPropertyIndices(groupId){
    const out=[];
    BOARD.forEach((t,i)=>{
      if(t&&t.type==='property'&&t.group===groupId)out.push(i);
    });
    return out;
  }

  function ownsFullGroup(player,groupId){
    if(!player||player.bankrupt||groupId==null||groupId==='rail'||groupId==='util')return false;
    const idxs=groupPropertyIndices(groupId);
    if(!idxs.length)return false;
    return idxs.every((i)=>(player.properties||[]).includes(i));
  }

  function countOwnedOfType(player,type){
    if(!player||player.bankrupt)return 0;
    let n=0;
    (player.properties||[]).forEach((i)=>{
      if(BOARD[i]&&BOARD[i].type===type&&!isMortgaged(i))n++;
    });
    return n;
  }

  function countRailways(player){return countOwnedOfType(player,'railway');}
  function countUtilities(player){return countOwnedOfType(player,'utility');}

  function houseCostFor(groupId){
    return HOUSE_COST[groupId]!=null?HOUSE_COST[groupId]:1000;
  }

  function isMortgaged(idx){return !!mortgaged[idx];}

  function mortgageValue(tile){return Math.floor((Number(tile&&tile.price)||0)/2);}

  function unmortgageCost(tile){return Math.floor(mortgageValue(tile)*1.1);}

  function houseSellRefund(groupId){return Math.floor(houseCostFor(groupId)/2);}

  function groupHasMortgage(groupId){
    return groupPropertyIndices(groupId).some((i)=>isMortgaged(i));
  }

  function groupImprovementCount(groupId){
    return groupPropertyIndices(groupId).reduce((n,i)=>n+improvementTier(i),0);
  }

  function monopolyActive(player,groupId){
    return ownsFullGroup(player,groupId)&&!groupHasMortgage(groupId);
  }

  function canBuildOn(player,tileIdx){
    const tile=BOARD[tileIdx];
    if(!player||player.bankrupt||!tile||tile.type!=='property')return false;
    if(!(player.properties||[]).includes(tileIdx))return false;
    if(isMortgaged(tileIdx)||groupHasMortgage(tile.group))return false;
    if(!ownsFullGroup(player,tile.group))return false;
    const cost=houseCostFor(tile.group);
    if(player.money<cost)return false;
    if(improvementTier(tileIdx)>=5)return false;
    const idxs=groupPropertyIndices(tile.group);
    const tiers=idxs.map((i)=>improvementTier(i));
    const min=Math.min.apply(null,tiers);
    return improvementTier(tileIdx)===min;
  }

  function canSellHouseOn(player,tileIdx){
    const tile=BOARD[tileIdx];
    if(!player||player.bankrupt||!tile||tile.type!=='property')return false;
    if(!(player.properties||[]).includes(tileIdx))return false;
    if(improvementTier(tileIdx)<=0)return false;
    const idxs=groupPropertyIndices(tile.group);
    const tiers=idxs.map((i)=>improvementTier(i));
    const max=Math.max.apply(null,tiers);
    return improvementTier(tileIdx)===max;
  }

  function sellHouseOn(player,tileIdx,opts){
    const quiet=opts&&opts.quiet;
    if(!canSellHouseOn(player,tileIdx))return 0;
    const tile=BOARD[tileIdx];
    const refund=houseSellRefund(tile.group);
    const imp=tileImp(tileIdx);
    if(imp.hotel){imp.hotel=false;imp.houses=4;}
    else{imp.houses=Math.max(0,(Number(imp.houses)||0)-1);imp.hotel=false;}
    player.money+=refund;
    if(!quiet)message=`Sold improvement on ${tile.name} (+₹${refund})`;
    return refund;
  }

  function canMortgage(player,tileIdx){
    const tile=BOARD[tileIdx];
    if(!player||player.bankrupt||!tile||!isBuyable(tile))return false;
    if(!(player.properties||[]).includes(tileIdx))return false;
    if(isMortgaged(tileIdx))return false;
    if(tile.type==='property'&&groupImprovementCount(tile.group)>0)return false;
    return true;
  }

  function mortgageTile(player,tileIdx,opts){
    const quiet=opts&&opts.quiet;
    if(!canMortgage(player,tileIdx))return 0;
    const tile=BOARD[tileIdx];
    const val=mortgageValue(tile);
    mortgaged[tileIdx]=true;
    player.money+=val;
    if(!quiet)message=`Mortgaged ${tile.name} (+₹${val})`;
    return val;
  }

  function canUnmortgage(player,tileIdx){
    const tile=BOARD[tileIdx];
    if(!player||player.bankrupt||!tile)return false;
    if(!(player.properties||[]).includes(tileIdx))return false;
    if(!isMortgaged(tileIdx))return false;
    return player.money>=unmortgageCost(tile);
  }

  function unmortgageTile(player,tileIdx,opts){
    const quiet=opts&&opts.quiet;
    if(!canUnmortgage(player,tileIdx))return false;
    const tile=BOARD[tileIdx];
    const cost=unmortgageCost(tile);
    player.money-=cost;
    delete mortgaged[tileIdx];
    if(!quiet)message=`Unmortgaged ${tile.name} (−₹${cost})`;
    return true;
  }

  function listSellOptions(player){
    const opts=[];
    (player.properties||[]).forEach((idx)=>{
      if(!canSellHouseOn(player,idx))return;
      const tile=BOARD[idx];
      opts.push({idx,name:tile.name,refund:houseSellRefund(tile.group),color:tile.color||'#888',kind:'sell'});
    });
    return opts;
  }

  function listMortgageOptions(player){
    const opts=[];
    (player.properties||[]).forEach((idx)=>{
      if(!canMortgage(player,idx))return;
      const tile=BOARD[idx];
      opts.push({idx,name:tile.name,value:mortgageValue(tile),color:tile.color||'#888',kind:'mortgage'});
    });
    return opts;
  }

  function listUnmortgageOptions(player){
    const opts=[];
    (player.properties||[]).forEach((idx)=>{
      if(!isMortgaged(idx))return;
      const tile=BOARD[idx];
      const cost=unmortgageCost(tile);
      opts.push({idx,name:tile.name,cost,afford:player.money>=cost,color:tile.color||'#888',kind:'unmortgage'});
    });
    return opts;
  }

  function canRaiseMore(player){
    return listSellOptions(player).length>0||listMortgageOptions(player).length>0;
  }

  function liquidateHousesToBank(player){
    let gained=0;
    let guard=0;
    while(guard++<80){
      const opts=listSellOptions(player);
      if(!opts.length)break;
      gained+=sellHouseOn(player,opts[0].idx,{quiet:true});
    }
    return gained;
  }

  function bankruptPlayer(payer,creditorSeat){
    if(!payer||payer.bankrupt)return;
    liquidateHousesToBank(payer);
    const creditor=creditorSeat!=null?players[creditorSeat]:null;
    const cash=Math.max(0,payer.money);
    if(creditor&&!creditor.bankrupt){
      creditor.money+=cash;
      (payer.properties||[]).forEach((idx)=>{
        if(!creditor.properties.includes(idx))creditor.properties.push(idx);
        tileImp(idx);
      });
    } else {
      (payer.properties||[]).forEach((idx)=>{
        delete mortgaged[idx];
        if(improvements[idx])improvements[idx]={houses:0,hotel:false};
      });
    }
    payer.money=0;
    payer.properties=[];
    payer.bankrupt=true;
    payer.inJail=false;
    payer.jailAttempts=0;
    normalizeJailFields(payer);
    message=`${payer.name} went bankrupt`+(creditor?` — assets to ${creditor.name}`:'');
  }

  function listBuildOptions(player){
    const opts=[];
    (player.properties||[]).forEach((idx)=>{
      if(!canBuildOn(player,idx))return;
      const tile=BOARD[idx];
      const cost=houseCostFor(tile.group);
      const tier=improvementTier(idx);
      const nextTier=tier+1;
      const ladder=tile.rent||[];
      const nextRent=Number(ladder[Math.min(nextTier,ladder.length-1)])||0;
      opts.push({
        idx,name:tile.name,cost,nextRent,isHotel:tier===4,group:tile.group,color:tile.color||'#888',
      });
    });
    opts.sort((a,b)=>a.cost-b.cost||a.idx-b.idx);
    return opts;
  }

  function buildOn(player,tileIdx,opts){
    const quiet=opts&&opts.quiet;
    if(!canBuildOn(player,tileIdx))return false;
    const tile=BOARD[tileIdx];
    const cost=houseCostFor(tile.group);
    const wasTier=improvementTier(tileIdx);
    player.money-=cost;
    const imp=tileImp(tileIdx);
    if(wasTier>=4){
      imp.hotel=true;imp.houses=0;
      if(!quiet)message=`Hotel on ${tile.name} (−₹${cost})`;
    } else {
      imp.houses=(Number(imp.houses)||0)+1;imp.hotel=false;
      if(!quiet)message=`House on ${tile.name} (−₹${cost}) · ${imp.houses}/4`;
    }
    if(typeof gameFeedback==='function')gameFeedback('select');
    return true;
  }

  function aiMaybeBuild(player){
    if(!player||player.bankrupt||liveOn)return;
    const cushion=2500;
    let built=0;
    while(built<4){
      if(player.money<=cushion)break;
      const opts=listBuildOptions(player);
      if(!opts.length)break;
      if(built>0&&Math.random()>0.7)break;
      if(!buildOn(player,opts[0].idx,{quiet:true}))break;
      built++;
    }
    if(built)message=`${player.name} built ${built} improvement${built>1?'s':''}`;
  }

  /**
   * Rent rules:
   * - Property: rent[tier] from houses/hotel; unimproved monopoly → 2× base.
   * - Railway: 250 / 500 / 1000 / 2000 by count (1–4).
   * - Utility: 40×dice if 1, 100×dice if both.
   */
  function rentFor(tile,tileIdx,owner,diceTotal){
    if(!tile||!owner||owner.bankrupt)return 0;
    if(isMortgaged(tileIdx))return 0;
    if(tile.type==='property'){
      const ladder=Array.isArray(tile.rent)?tile.rent:[0];
      const tier=improvementTier(tileIdx);
      let rent=Number(ladder[Math.min(tier,ladder.length-1)])||0;
      if(tier===0&&monopolyActive(owner,tile.group))rent*=2;
      return rent;
    }
    if(tile.type==='railway'){
      const n=Math.min(4,Math.max(1,countRailways(owner)||1));
      return [0,250,500,1000,2000][n]||2000;
    }
    if(tile.type==='utility'){
      const n=countUtilities(owner);
      const dice=Math.max(2,Number(diceTotal)||((diceVal[0]||1)+(diceVal[1]||1)));
      return n>=2?100*dice:40*dice;
    }
    return 0;
  }

  function rentBreakdown(tile,tileIdx,owner,diceTotal){
    const rent=rentFor(tile,tileIdx,owner,diceTotal);
    if(!tile||!owner)return {rent,monopoly:false,tier:0,railCount:0,utilCount:0,mortgaged:false};
    if(isMortgaged(tileIdx))return {rent:0,monopoly:false,tier:improvementTier(tileIdx),railCount:0,utilCount:0,mortgaged:true};
    if(tile.type==='property'){
      const tier=improvementTier(tileIdx);
      const monopoly=tier===0&&monopolyActive(owner,tile.group);
      return {rent,monopoly,tier,railCount:0,utilCount:0,mortgaged:false};
    }
    if(tile.type==='railway')return {rent,monopoly:false,tier:0,railCount:countRailways(owner),utilCount:0,mortgaged:false};
    if(tile.type==='utility')return {rent,monopoly:false,tier:0,railCount:0,utilCount:countUtilities(owner),mortgaged:false};
    return {rent,monopoly:false,tier:0,railCount:0,utilCount:0,mortgaged:false};
  }

  function rentPaidMessage(br,tile,owner,diceTotal){
    const rent=br.rent;
    if(br.mortgaged)return `${tile.name} is mortgaged — no rent`;
    if(tile.type==='railway')return `Paid ₹${rent} station rent (${br.railCount}/4) to ${owner.name}`;
    if(tile.type==='utility')return `Paid ₹${rent} utility rent (${br.utilCount}/2 · ${diceTotal} dice) to ${owner.name}`;
    if(br.tier===5)return `Paid ₹${rent} rent (hotel) to ${owner.name}`;
    if(br.tier>0)return `Paid ₹${rent} rent (${br.tier} house${br.tier>1?'s':''}) to ${owner.name}`;
    if(br.monopoly)return `Paid ₹${rent} rent (monopoly) to ${owner.name}`;
    return `Paid ₹${rent} rent to ${owner.name}`;
  }

  function seatIndex(player){return players.indexOf(player);}

  function tryCollectPayment(payer,amount,creditor,kind,note){
    amount=Math.max(0,Number(amount)||0);
    if(amount<=0)return true;
    if(payer.money>=amount){
      payer.money-=amount;
      if(creditor&&!creditor.bankrupt)creditor.money+=amount;
      return true;
    }
    startDistress(payer,amount,creditor,kind,note);
    return false;
  }

  function startDistress(payer,amount,creditor,kind,note){
    const payerSeat=seatIndex(payer);
    const creditorSeat=creditor?seatIndex(creditor):-1;
    distress={
      payerSeat,
      amount,
      creditorSeat:creditorSeat>=0?creditorSeat:null,
      kind:kind||'debt',
      note:note||`Need ₹${amount}`,
    };
    stopBusTimer();
    message=`Raise funds — owe ₹${amount}`+(note?` (${note})`:'');
    if(liveOn)pushBusiness();
    render();
    const controlled=liveOn?isDistressControl():(payerSeat===mySeat);
    if(!controlled||(!liveOn&&payerSeat!==mySeat)){
      schedule(()=>aiResolveDistress(),400);
    }
  }

  function afterDistressRaise(){
    if(!distress)return;
    const payer=players[distress.payerSeat];
    if(!payer||payer.bankrupt){distress=null;finishMoveResolution();return;}
    if(payer.money>=distress.amount){
      const owed=distress.amount;
      const creditor=distress.creditorSeat!=null?players[distress.creditorSeat]:null;
      payer.money-=owed;
      if(creditor&&!creditor.bankrupt)creditor.money+=owed;
      message=`Paid ₹${owed}`+(distress.note?` — ${distress.note}`:'');
      distress=null;
      if(liveOn)pushBusiness();
      finishMoveResolution();
      return;
    }
    if(!canRaiseMore(payer)){
      bankruptPlayer(payer,distress.creditorSeat);
      distress=null;
      if(checkBankruptcyAndWinner())return;
      if(liveOn)pushBusiness();
      finishMoveResolution();
      return;
    }
    if(liveOn)pushBusiness();
    render();
  }

  function aiResolveDistress(){
    if(!distress||gameOver)return;
    const payer=players[distress.payerSeat];
    if(!payer||payer.bankrupt){distress=null;finishMoveResolution();return;}
    let guard=0;
    while(payer.money<distress.amount&&guard++<40){
      const sells=listSellOptions(payer);
      if(sells.length){sellHouseOn(payer,sells[0].idx,{quiet:true});continue;}
      const morts=listMortgageOptions(payer);
      if(morts.length){mortgageTile(payer,morts[0].idx,{quiet:true});continue;}
      break;
    }
    afterDistressRaise();
  }

  function playerDistressAction(kind,idx){
    if(!distress||gameOver)return;
    if(liveOn&&!isDistressControl())return;
    const payer=players[distress.payerSeat];
    if(!payer)return;
    if(kind==='sell')sellHouseOn(payer,idx);
    else if(kind==='mortgage')mortgageTile(payer,idx);
    afterDistressRaise();
  }

  function declareDistressBankrupt(){
    if(!distress||gameOver)return;
    if(liveOn&&!isDistressControl())return;
    const payer=players[distress.payerSeat];
    bankruptPlayer(payer,distress.creditorSeat);
    distress=null;
    if(checkBankruptcyAndWinner())return;
    if(liveOn)pushBusiness();
    finishMoveResolution();
  }

  function auctionMinBid(tile){
    return Math.max(100,Math.floor((Number(tile.price)||0)*0.1));
  }

  function nextAuctionSeat(fromSeat){
    let s=fromSeat;
    for(let i=0;i<playerCount;i++){
      s=(s+1)%playerCount;
      if(!players[s].bankrupt)return s;
    }
    return fromSeat;
  }

  function startAuction(tileIdx){
    const tile=BOARD[tileIdx];
    if(!tile||!isBuyable(tile)){finishMoveResolution();return;}
    if(players.some(pl=>!pl.bankrupt&&(pl.properties||[]).includes(tileIdx))){finishMoveResolution();return;}
    awaitingBuy=false;
    stopBusTimer();
    const minBid=auctionMinBid(tile);
    auction={
      tileIdx,
      minBid,
      raiseBy:Math.max(100,Math.floor(minBid/2)),
      highBid:0,
      highBidder:null,
      turnSeat:nextAuctionSeat(currentPlayer),
      passed:[],
    };
    focusPos=tileIdx;
    message=`Auction: ${tile.name} · min ₹${minBid}`;
    if(liveOn)pushBusiness();
    render();
    advanceAuctionActor();
  }

  function advanceAuctionActor(){
    if(!auction)return;
    const seat=auction.turnSeat;
    if(liveOn){
      if(isAuctionControl())startAuctionTimer();
      return;
    }
    if(seat===mySeat){
      startAuctionTimer();
      return;
    }
    schedule(()=>aiAuctionAct(),500);
  }

  function auctionEligibleSeats(){
    return players.map((p,i)=>({p,i})).filter(x=>!x.p.bankrupt).map(x=>x.i);
  }

  function auctionRaise(){
    if(!auction||gameOver)return;
    if(liveOn&&!isAuctionControl())return;
    if(!liveOn&&auction.turnSeat!==mySeat)return;
    auctionRaiseFor(auction.turnSeat);
  }

  function auctionRaiseFor(seat){
    if(!auction||gameOver)return;
    const bidder=players[seat];
    if(!bidder||bidder.bankrupt){auctionPassFor(seat);return;}
    const nextBid=auction.highBid>0?auction.highBid+auction.raiseBy:auction.minBid;
    if(bidder.money<nextBid){auctionPassFor(seat);return;}
    stopAuctionTimer();
    auction.highBid=nextBid;
    auction.highBidder=seat;
    auction.passed=[];
    message=`${bidder.name} bids ₹${nextBid}`;
    auction.turnSeat=nextAuctionSeat(seat);
    if(liveOn)pushBusiness();
    render();
    advanceAuctionActor();
  }

  function auctionPass(){
    if(!auction)return;
    if(liveOn&&!isAuctionControl())return;
    auctionPassFor(auction.turnSeat);
  }

  function auctionPassFor(seat){
    if(!auction||gameOver)return;
    stopAuctionTimer();
    if(!auction.passed.includes(seat))auction.passed.push(seat);
    const eligible=auctionEligibleSeats();
    const others=eligible.filter((i)=>i!==auction.highBidder);
    const allOthersPassed=auction.highBidder!=null&&others.every((i)=>auction.passed.includes(i));
    const everyonePassed=auction.highBidder==null&&eligible.every((i)=>auction.passed.includes(i));
    if(allOthersPassed||everyonePassed){
      endAuction();
      return;
    }
    message=`${players[seat].name} passes`;
    auction.turnSeat=nextAuctionSeat(seat);
    // skip seats already passed until someone can act — still rotate
    let guard=0;
    while(guard++<playerCount&&auction.passed.includes(auction.turnSeat)&&auction.turnSeat!==auction.highBidder){
      // if highBidder exists, passed bidders stay out until a new raise clears passed
      auction.turnSeat=nextAuctionSeat(auction.turnSeat);
    }
    if(liveOn)pushBusiness();
    render();
    advanceAuctionActor();
  }

  function endAuction(){
    stopAuctionTimer();
    if(!auction){finishMoveResolution();return;}
    const tile=BOARD[auction.tileIdx];
    const winner=auction.highBidder!=null?players[auction.highBidder]:null;
    const bid=auction.highBid;
    const idx=auction.tileIdx;
    auction=null;
    if(winner&&bid>0&&winner.money>=bid){
      winner.money-=bid;
      if(!winner.properties.includes(idx))winner.properties.push(idx);
      tileImp(idx);
      message=`${winner.name} won ${tile.name} for ₹${bid}`;
      if(typeof gameFeedback==='function')gameFeedback('card');
    } else {
      message=`Auction ended — ${tile.name} unsold`;
    }
    if(liveOn)pushBusiness();
    render();
    finishMoveResolution();
  }

  function aiAuctionAct(){
    if(!auction||gameOver)return;
    const seat=auction.turnSeat;
    const p=players[seat];
    if(!p||p.bankrupt){auctionPassFor(seat);return;}
    const tile=BOARD[auction.tileIdx];
    const nextBid=auction.highBid>0?auction.highBid+auction.raiseBy:auction.minBid;
    const cushion=1500;
    let want=false;
    if(p.money>=nextBid+cushion){
      if(tile.type==='property'){
        const idxs=groupPropertyIndices(tile.group);
        const owned=idxs.filter((i)=>(p.properties||[]).includes(i)).length;
        if(owned===idxs.length-1)want=true;
        else if(owned>=1&&nextBid<=tile.price*0.7)want=Math.random()<0.55;
        else if(nextBid<=tile.price*0.45)want=Math.random()<0.35;
      } else if(nextBid<=(tile.price||0)*0.5)want=Math.random()<0.4;
    }
    if(want)auctionRaiseFor(seat);
    else auctionPassFor(seat);
  }

  function movePlayerToken(steps,opts){
    opts=opts||{};
    const p=players[currentPlayer];
    if(!p||p.bankrupt)return;
    const oldPos=p.pos;
    const msgs=[];
    if(oldPos+steps>=BOARD.length){
      p.money+=GO_SALARY;
      msgs.push(`Passed Start +₹${GO_SALARY}`);
    }
    p.pos=(oldPos+steps)%BOARD.length;
    focusPos=p.pos;
    const tile=BOARD[p.pos];
    const diceTotal=steps;
    pendingExtraTurn=!!opts.wasDouble&&!opts.noDoublesExtra;

    if(tile.type==='gotojail'){
      sendToJail(p,msgs.length?`${msgs[0]} · Go To Jail`:'Go To Jail — no Start cash');
      pendingExtraTurn=false;
      if(liveOn)pushBusiness();
      render();
      finishMoveResolution();
      return;
    }

    if(tile.type==='go'){
      message=msgs[0]||`Landed on Start +₹${GO_SALARY}`;
    } else if(tile.type==='tax'){
      const amt=tile.amount;
      if(!tryCollectPayment(p,amt,null,'tax',`tax ₹${amt}`)){
        if(msgs.length)message=msgs.join(' · ')+' · '+message;
        return;
      }
      msgs.push(`Paid ₹${amt} tax`);
      message=msgs.join(' · ');
    } else if(tile.type==='jail'){
      msgs.push(p.inJail?'In jail':'Just visiting');
      message=msgs.join(' · ');
    } else if(tile.type==='chance'||tile.type==='chest'){
      const events=[{m:'Bonus payout!',amt:500},{m:'Repair bill',amt:-300},{m:'Lottery win!',amt:1000},{m:'Fine for jaywalking',amt:-150}];
      const e=events[Math.floor(Math.random()*events.length)];
      if(e.amt<0){
        if(!tryCollectPayment(p,-e.amt,null,'fine',e.m)){
          if(msgs.length)message=msgs.join(' · ')+' · '+message;
          return;
        }
        msgs.push(`${e.m} −₹${-e.amt}`);
      } else {
        p.money+=e.amt;
        msgs.push(`${e.m} +₹${e.amt}`);
      }
      message=msgs.join(' · ');
    } else if(isBuyable(tile)){
      const owner=players.find(pl=>!pl.bankrupt&&pl.properties.includes(p.pos));
      if(owner&&owner!==p){
        const br=rentBreakdown(tile,p.pos,owner,diceTotal);
        const rent=br.rent;
        if(rent>0){
          if(!tryCollectPayment(p,rent,owner,'rent',tile.name)){
            if(msgs.length)message=msgs.join(' · ')+' · '+message;
            return;
          }
          msgs.push(rentPaidMessage(br,tile,owner,diceTotal));
        } else if(br.mortgaged){
          msgs.push(rentPaidMessage(br,tile,owner,diceTotal));
        }
      }
      message=msgs.join(' · ');
    } else if(msgs.length){
      message=msgs.join(' · ');
    } else {
      message='';
    }

    render();
    const ownerNow=players.find(pl=>!pl.bankrupt&&pl.properties.includes(p.pos));
    if(isBuyable(tile)&&!ownerNow){
      if(p.money>=tile.price)offerBuy(tile,p);
      else startAuction(p.pos);
    } else {
      finishMoveResolution();
    }
  }

  function aiWantsBuy(tile,player){
    if(!tile||!player||player.money<tile.price)return false;
    if(tile.type==='property'){
      const idxs=groupPropertyIndices(tile.group);
      const owned=idxs.filter((i)=>(player.properties||[]).includes(i)).length;
      if(owned===idxs.length-1)return Math.random()<0.92;
      if(owned>=1)return Math.random()<0.8;
    }
    if(tile.type==='railway'||tile.type==='utility'){
      const n=countOwnedOfType(player,tile.type);
      if(n>=1)return Math.random()<0.85;
    }
    return Math.random()<0.7;
  }

  function offerBuy(tile,player){
    if(!isMyControl()){
      if(!liveOn&&aiWantsBuy(tile,player)){
        player.money-=tile.price;player.properties.push(player.pos);
        tileImp(player.pos);
        message=`${player.name} bought ${tile.name}!`;
        if(typeof gameFeedback==='function')gameFeedback('card');
        render();finishMoveResolution();return;
      }
      render();
      startAuction(player.pos);
      return;
    }
    awaitingBuy=true;
    stopBusTimer();
    message=`Buy ${tile.name}?`;
    render();
    if(liveOn)pushBusiness();
  }

  function resolveBuy(yes){
    if(!awaitingBuy||!isMyControl())return;
    const p=players[currentPlayer];
    const tile=BOARD[p.pos];
    awaitingBuy=false;
    if(yes&&isBuyable(tile)&&p.money>=tile.price&&!players.find(pl=>!pl.bankrupt&&pl.properties.includes(p.pos))){
      p.money-=tile.price;p.properties.push(p.pos);
      tileImp(p.pos);
      message=`You bought ${tile.name}!`;
      if(typeof gameFeedback==='function')gameFeedback('card');
      finishMoveResolution();
      return;
    }
    message='Skipped — going to auction';
    startAuction(p.pos);
  }

  async function settleBusinessOnce(won){
    if(!liveOn||settleDone)return null;
    if(!settleMatchId){settleDone=true;return null;}
    if(!window.DangalEconomy||typeof DangalEconomy.reportGameEnd!=='function'){
      settleDone=true;
      return null;
    }
    settleDone=true;
    try{
      const me=typeof getCurrentUid==='function'?getCurrentUid():'';
      const oppU=settleOppUid||(liveRoles&&liveRoles.opp)||'';
      return await DangalEconomy.reportGameEnd({
        gameType:'business',
        result:won?'win':'loss',
        won:!!won,
        isDraw:false,
        matchId:settleMatchId,
        sessionId:settleMatchId,
        opponentUid:oppU,
        stake:liveStake,
        winnerUid:won?me:oppU,
      });
    }catch(e){
      settleDone=false;
      return null;
    }
  }

  function checkBankruptcyAndWinner(){
    const active=players.filter(pl=>!pl.bankrupt);
    if(active.length===1){
      gameOver=true;
      const won=active[0].name==='You';
      if(gs)gs.setOutcome(won?'won':'lost');
      if(typeof recordGameResult==='function')recordGameResult('business',won);
      if(typeof gameFeedback==='function')gameFeedback(won?'win':'lose');
      settleBusinessOnce(won);
      if(liveOn)pushBusiness();
      render();
      return true;
    }
    return false;
  }

  function finishMoveResolution(){
    if(!alive())return;
    if(distress||auction)return;
    awaitingBuy=false;
    buildOpen=false;
    liqOpen=false;
    if(checkBankruptcyAndWinner())return;
    const p=players[currentPlayer];
    if(p&&p.money<0&&!p.bankrupt){
      bankruptPlayer(p,null);
      if(checkBankruptcyAndWinner())return;
    }
    if(pendingExtraTurn&&p&&!p.inJail&&!p.bankrupt){
      pendingExtraTurn=false;
      message=(message?message+' · ':'')+'Doubles — roll again';
      if(liveOn)pushBusiness();
      render();
      if(isMyControl())startBusTimer();
      else if(!liveOn)schedule(rollBusDice,700);
      return;
    }
    pendingExtraTurn=false;
    endBusTurn();
  }

  function beginSeatTurn(){
    awaitingJailChoice=false;
    buildOpen=false;
    const p=players[currentPlayer];
    focusPos=p.pos;
    if(p.inJail){
      awaitingJailChoice=true;
      message=`${p.name} is in jail — Pay ₹${JAIL_FINE} or roll for doubles (${p.jailAttempts}/3)`;
    }
    if(liveOn)pushBusiness();
    render();
    if(isMyControl())startBusTimer();
    else if(!liveOn){
      schedule(()=>{
        if(!alive()||gameOver)return;
        aiMaybeBuild(players[currentPlayer]);
        if(players[currentPlayer].inJail){
          awaitingJailChoice=true;
          render();
          schedule(aiJailDecision,600);
        } else {
          schedule(rollBusDice,500);
        }
      },700);
    }
  }

  function endBusTurn(){
    if(!alive())return;
    if(distress||auction||trade)return;
    awaitingBuy=false;
    awaitingJailChoice=false;
    buildOpen=false;
    liqOpen=false;
    tradeOpen=false;
    tradeDraft=null;
    doublesStreak=0;
    pendingExtraTurn=false;
    if(checkBankruptcyAndWinner())return;
    do{currentPlayer=(currentPlayer+1)%playerCount;}while(players[currentPlayer].bankrupt);
    beginSeatTurn();
  }

  function tryPlayerBuild(tileIdx){
    if(!isMyControl()||awaitingBuy||rolling||gameOver||auction||distress||trade)return;
    const p=players[currentPlayer];
    if(!buildOn(p,tileIdx))return;
    focusPos=tileIdx;
    if(liveOn)pushBusiness();
    render();
  }

  function tryPlayerLiquidity(kind,idx){
    if(gameOver||rolling||awaitingBuy||auction||trade)return;
    if(distress){
      playerDistressAction(kind,idx);
      return;
    }
    if(!isMyControl())return;
    const p=players[currentPlayer];
    if(kind==='sell')sellHouseOn(p,idx);
    else if(kind==='mortgage')mortgageTile(p,idx);
    else if(kind==='unmortgage')unmortgageTile(p,idx);
    if(liveOn)pushBusiness();
    render();
  }

  function isTradeableDeed(player,idx){
    if(!player||player.bankrupt)return false;
    if(!(player.properties||[]).includes(idx))return false;
    const tile=BOARD[idx];
    if(!tile||!isBuyable(tile))return false;
    if(tile.type==='property'&&groupImprovementCount(tile.group)>0)return false;
    return true;
  }

  function listTradeableDeeds(player){
    return (player.properties||[]).filter((idx)=>isTradeableDeed(player,idx));
  }

  function deedLabel(idx){
    const tile=BOARD[idx];
    if(!tile)return `#${idx}`;
    return tile.name+(isMortgaged(idx)?' (M)':'');
  }

  function netWorth(p){
    if(!p)return 0;
    let w=Math.max(0,Number(p.money)||0);
    (p.properties||[]).forEach((idx)=>{
      const tile=BOARD[idx];
      if(!tile)return;
      w+=isMortgaged(idx)?mortgageValue(tile):(Number(tile.price)||0);
      if(tile.type==='property'){
        const tier=improvementTier(idx);
        w+=houseCostFor(tile.group)*Math.min(5,tier);
      }
    });
    return w;
  }

  function wouldCompleteMonopoly(player,incomingIdxs){
    const have=new Set(player.properties||[]);
    (incomingIdxs||[]).forEach((i)=>have.add(i));
    const groups=new Set();
    (incomingIdxs||[]).forEach((i)=>{
      const t=BOARD[i];
      if(t&&t.type==='property')groups.add(t.group);
    });
    for(const g of groups){
      const idxs=groupPropertyIndices(g);
      if(idxs.length&&idxs.every((i)=>have.has(i)))return true;
    }
    return false;
  }

  function openTradeSheet(){
    if(!isMyControl()||gameOver||rolling||awaitingBuy||auction||distress||trade)return;
    const others=players.map((p,i)=>({p,i})).filter((x)=>!x.p.bankrupt&&x.i!==mySeat);
    if(!others.length)return;
    stopBusTimer();
    tradeOpen=true;
    buildOpen=false;
    liqOpen=false;
    tradeDraft={
      to:others[0].i,
      offerProps:[],
      offerCash:0,
      askProps:[],
      askCash:0,
    };
    render();
  }

  function closeTradeSheet(){
    tradeOpen=false;
    tradeDraft=null;
    if(isMyControl()&&!awaitingBuy&&!auction&&!distress&&!trade)startBusTimer();
    render();
  }

  function toggleDraftProp(side,idx){
    if(!tradeDraft)return;
    const key=side==='offer'?'offerProps':'askProps';
    const arr=tradeDraft[key];
    const i=arr.indexOf(idx);
    if(i>=0)arr.splice(i,1);
    else arr.push(idx);
    render();
  }

  function setDraftCash(side,val){
    if(!tradeDraft)return;
    const n=Math.max(0,Math.floor(Number(val)||0));
    if(side==='offer')tradeDraft.offerCash=n;
    else tradeDraft.askCash=n;
  }

  function setDraftPartner(seat){
    if(!tradeDraft)return;
    tradeDraft.to=Number(seat);
    tradeDraft.askProps=[];
    render();
  }

  function validateTradePayload(fromSeat,toSeat,offerProps,offerCash,askProps,askCash){
    const from=players[fromSeat];
    const to=players[toSeat];
    if(!from||!to||from.bankrupt||to.bankrupt||fromSeat===toSeat)return 'Invalid seats';
    offerCash=Math.max(0,Number(offerCash)||0);
    askCash=Math.max(0,Number(askCash)||0);
    if(offerCash>from.money)return 'Not enough cash to offer';
    if(askCash>to.money)return 'They cannot pay that cash';
    if(!(offerProps||[]).length&&!(askProps||[]).length&&offerCash<=0&&askCash<=0)return 'Empty deal';
    for(const idx of (offerProps||[])){
      if(!isTradeableDeed(from,idx))return `Cannot trade ${deedLabel(idx)} — sell houses on that set first`;
    }
    for(const idx of (askProps||[])){
      if(!isTradeableDeed(to,idx))return `Cannot request ${deedLabel(idx)} — houses still on that set`;
    }
    return null;
  }

  function proposeTrade(){
    if(!tradeDraft||!isMyControl()||trade)return;
    const from=mySeat;
    const to=tradeDraft.to;
    const offerProps=tradeDraft.offerProps.slice();
    const askProps=tradeDraft.askProps.slice();
    const offerCash=tradeDraft.offerCash;
    const askCash=tradeDraft.askCash;
    const err=validateTradePayload(from,to,offerProps,offerCash,askProps,askCash);
    if(err){
      message=err;
      render();
      return;
    }
    trade={from,to,offerProps,offerCash,askProps,askCash,status:'pending'};
    tradeOpen=false;
    tradeDraft=null;
    stopBusTimer();
    message=`Deal proposed to ${players[to].name}`;
    if(liveOn)pushBusiness();
    render();
    if(!liveOn&&to!==mySeat)schedule(()=>aiRespondToTrade(),700);
  }

  function transferDeeds(fromPlayer,toPlayer,idxs){
    (idxs||[]).forEach((idx)=>{
      const i=(fromPlayer.properties||[]).indexOf(idx);
      if(i>=0)fromPlayer.properties.splice(i,1);
      if(!toPlayer.properties.includes(idx))toPlayer.properties.push(idx);
      tileImp(idx);
      // mortgaged flag stays on tile index
    });
  }

  function acceptTrade(){
    if(!trade||trade.status!=='pending')return;
    if(liveOn&&!isTradeResponder())return;
    if(!liveOn&&trade.to!==mySeat)return;
    executeTradeAccept();
  }

  function executeTradeAccept(){
    if(!trade||trade.status!=='pending')return;
    const err=validateTradePayload(trade.from,trade.to,trade.offerProps,trade.offerCash,trade.askProps,trade.askCash);
    if(err){
      stopTradeTimer();
      trade=null;
      message=err;
      if(liveOn)pushBusiness();
      render();
      if(isMyControl()&&!awaitingBuy&&!auction&&!distress)startBusTimer();
      return;
    }
    stopTradeTimer();
    const from=players[trade.from];
    const to=players[trade.to];
    const offerProps=trade.offerProps.slice();
    const askProps=trade.askProps.slice();
    const offerCash=trade.offerCash;
    const askCash=trade.askCash;
    from.money-=offerCash;to.money+=offerCash;
    to.money-=askCash;from.money+=askCash;
    transferDeeds(from,to,offerProps);
    transferDeeds(to,from,askProps);
    message=`Deal done: ${from.name} ⇄ ${to.name}`;
    trade=null;
    if(typeof gameFeedback==='function')gameFeedback('card');
    if(liveOn)pushBusiness();
    render();
    if(isMyControl()&&!awaitingBuy&&!auction&&!distress)startBusTimer();
  }

  function declineTrade(reason){
    if(!trade)return;
    if(liveOn&&!isTradeResponder())return;
    if(!liveOn&&trade.to!==mySeat)return;
    stopTradeTimer();
    const who=players[trade.to]?players[trade.to].name:'Partner';
    trade=null;
    message=reason||`${who} declined the deal`;
    if(liveOn)pushBusiness();
    render();
    if(isMyControl()&&!awaitingBuy&&!auction&&!distress)startBusTimer();
  }

  function cancelTradeProposal(){
    if(!trade||trade.status!=='pending')return;
    if(liveOn&&!isTradeProposer())return;
    if(!liveOn&&trade.from!==mySeat)return;
    stopTradeTimer();
    trade=null;
    message='Deal cancelled';
    if(liveOn)pushBusiness();
    render();
    if(isMyControl()&&!awaitingBuy&&!auction&&!distress)startBusTimer();
  }

  function aiRespondToTrade(){
    if(!trade||trade.status!=='pending'||gameOver)return;
    const to=players[trade.to];
    if(!to||to.bankrupt){
      stopTradeTimer();trade=null;message='No partner';render();
      if(isMyControl())startBusTimer();
      return;
    }
    if(trade.to===mySeat)return;
    if(aiShouldAcceptTrade(trade))executeTradeAccept();
    else {
      stopTradeTimer();
      message=`${to.name} declined the deal`;
      trade=null;
      render();
      if(isMyControl())startBusTimer();
    }
  }

  function aiShouldAcceptTrade(t){
    const from=players[t.from];
    const to=players[t.to];
    if(!from||!to)return false;
    const err=validateTradePayload(t.from,t.to,t.offerProps,t.offerCash,t.askProps,t.askCash);
    if(err)return false;
    const completesMe=wouldCompleteMonopoly(to,t.offerProps);
    const completesThem=wouldCompleteMonopoly(from,t.askProps);
    const cashDelta=(t.offerCash||0)-(t.askCash||0); // net cash to `to`
    if(completesThem&&!completesMe&&cashDelta<1500)return false;
    if(completesMe&&(t.askCash||0)<=2500)return true;
    if(completesMe&&cashDelta>=-500)return Math.random()<0.85;
    if(completesThem)return cashDelta>=2000&&Math.random()<0.25;
    // modest fair-ish swap
    const offerVal=(t.offerProps||[]).reduce((s,i)=>s+(BOARD[i]&&BOARD[i].price||0),0)+(t.offerCash||0);
    const askVal=(t.askProps||[]).reduce((s,i)=>s+(BOARD[i]&&BOARD[i].price||0),0)+(t.askCash||0);
    if(askVal<=0)return offerVal>0&&Math.random()<0.4;
    const ratio=offerVal/Math.max(1,askVal);
    if(ratio>=0.85&&ratio<=1.25)return Math.random()<0.45;
    if(ratio>=1.3)return Math.random()<0.55;
    return Math.random()<0.08;
  }

  function tradePanelHtml(){
    if(trade&&trade.status==='pending'){
      const from=players[trade.from];
      const to=players[trade.to];
      const offerBits=[
        ...(trade.offerProps||[]).map(deedLabel),
        trade.offerCash?`₹${trade.offerCash}`:null,
      ].filter(Boolean).join(', ')||'—';
      const askBits=[
        ...(trade.askProps||[]).map(deedLabel),
        trade.askCash?`₹${trade.askCash}`:null,
      ].filter(Boolean).join(', ')||'—';
      const respond=isTradeResponder()||(!liveOn&&trade.to===mySeat);
      const proposeWait=isTradeProposer()||(!liveOn&&trade.from===mySeat&&trade.to!==mySeat);
      return `<div class="bus-trade-bar">
        <div class="bus-trade-title">Deal · ${from?from.name:'?'} → ${to?to.name:'?'}</div>
        <div class="bus-trade-meta">Offers: ${offerBits}</div>
        <div class="bus-trade-meta">Wants: ${askBits}</div>
        ${respond?`<div class="bus-trade-actions">
          <button type="button" id="busTradeAccept" class="game-tap-target bus-deed-btn bus-deed-btn--primary">Accept</button>
          <button type="button" id="busTradeDecline" class="game-tap-target bus-deed-btn">Decline</button>
        </div>`:proposeWait?`<div class="bus-trade-actions">
          <button type="button" id="busTradeCancel" class="game-tap-target bus-deed-btn">Cancel deal</button>
        </div>`:`<div class="bus-trade-meta">Waiting…</div>`}
      </div>`;
    }
    if(!tradeOpen||!tradeDraft||!isMyControl())return '';
    const me=players[mySeat];
    const partner=players[tradeDraft.to];
    const others=players.map((p,i)=>({p,i})).filter((x)=>!x.p.bankrupt&&x.i!==mySeat);
    const myDeeds=listTradeableDeeds(me);
    const theirDeeds=partner?listTradeableDeeds(partner):[];
    return `<div class="bus-trade-bar bus-trade-bar--compose">
      <div class="bus-trade-title">Propose a deal</div>
      ${others.length>1?`<div class="bus-trade-partners">${others.map((o)=>`<button type="button" class="game-tap-target bus-trade-chip${tradeDraft.to===o.i?' is-on':''}" data-trade-to="${o.i}">${o.p.name}</button>`).join('')}</div>`:`<div class="bus-trade-meta">With ${partner?partner.name:'—'}</div>`}
      <div class="bus-trade-section">You offer · cash ₹
        <input id="busTradeOfferCash" class="bus-trade-cash" type="number" min="0" step="100" value="${tradeDraft.offerCash}" />
      </div>
      <div class="bus-trade-deeds">${myDeeds.length?myDeeds.map((idx)=>`<button type="button" class="game-tap-target bus-trade-chip${tradeDraft.offerProps.includes(idx)?' is-on':''}" data-trade-offer="${idx}">${deedLabel(idx)}</button>`).join(''):'<span class="bus-trade-meta">No unimproved deeds (sell houses first)</span>'}</div>
      <div class="bus-trade-section">You want · cash ₹
        <input id="busTradeAskCash" class="bus-trade-cash" type="number" min="0" step="100" value="${tradeDraft.askCash}" />
      </div>
      <div class="bus-trade-deeds">${theirDeeds.length?theirDeeds.map((idx)=>`<button type="button" class="game-tap-target bus-trade-chip${tradeDraft.askProps.includes(idx)?' is-on':''}" data-trade-ask="${idx}">${deedLabel(idx)}</button>`).join(''):'<span class="bus-trade-meta">Nothing tradeable yet</span>'}</div>
      <div class="bus-trade-hint">Mortgaged deeds stay mortgaged. Sets with houses must be sold down first.</div>
      <div class="bus-trade-actions">
        <button type="button" id="busTradePropose" class="game-tap-target bus-deed-btn bus-deed-btn--primary">Propose</button>
        <button type="button" id="busTradeClose" class="game-tap-target bus-deed-btn">Close</button>
      </div>
    </div>`;
  }

  function rentLadderHtml(tile,idx,owner){
    if(isMortgaged(idx)){
      return `<div class="bus-deed-badge is-mort">Mortgaged — no rent · lift ₹${unmortgageCost(tile)}</div>`;
    }
    if(tile.type==='property'&&Array.isArray(tile.rent)){
      const tier=improvementTier(idx);
      const fullSet=owner&&monopolyActive(owner,tile.group);
      const labels=['Base','1 house','2 houses','3 houses','4 houses','Hotel'];
      const rows=tile.rent.map((r,i)=>{
        const active=i===tier;
        let shown=r;
        if(i===0&&fullSet&&tier===0)shown=r*2;
        return `<div class="bus-rent-row${active?' is-current':''}"><span>${labels[i]||`Tier ${i}`}</span><strong>₹${shown}${i===0&&fullSet&&tier===0?' ×2':''}</strong></div>`;
      }).join('');
      const cost=houseCostFor(tile.group);
      let badge='Colour set incomplete';
      if(owner&&ownsFullGroup(owner,tile.group)&&groupHasMortgage(tile.group))badge='Set mortgaged — no monopoly / build';
      else if(fullSet){
        if(tier===5)badge='Hotel · top rent';
        else if(tier>0)badge=`Monopoly · ${tier} house${tier>1?'s':''} · build ₹${cost}`;
        else badge=`Monopoly! · 2× base · house ₹${cost}`;
      }
      return `<div class="bus-rent-ladder">${rows}</div>
        <div class="bus-deed-badge${fullSet?' is-mono':''}">${badge}</div>`;
    }
    if(tile.type==='railway'){
      const n=owner?countRailways(owner):0;
      const tiers=[250,500,1000,2000];
      const rows=tiers.map((r,i)=>{
        const count=i+1;
        return `<div class="bus-rent-row${n===count?' is-current':''}"><span>${count} station${count>1?'s':''}</span><strong>₹${r}</strong></div>`;
      }).join('');
      return `<div class="bus-rent-ladder">${rows}</div>
        <div class="bus-deed-badge">${n?`Owner holds ${n}/4 stations`:'Rent scales with stations owned'}</div>`;
    }
    if(tile.type==='utility'){
      const n=owner?countUtilities(owner):0;
      const dice=(diceVal[0]||1)+(diceVal[1]||1);
      return `<div class="bus-rent-ladder">
          <div class="bus-rent-row${n===1?' is-current':''}"><span>1 utility</span><strong>40 × dice</strong></div>
          <div class="bus-rent-row${n>=2?' is-current':''}"><span>Both utilities</span><strong>100 × dice</strong></div>
        </div>
        <div class="bus-deed-badge">${n?`Owner holds ${n}/2 · last dice ${dice}`:'Rent = multiplier × dice rolled'}</div>`;
    }
    return '';
  }

  function holdingsStripHtml(){
    const groups=[];
    const seen=new Set();
    BOARD.forEach((t)=>{
      if(t&&t.type==='property'&&t.group!=null&&!seen.has(t.group)){
        seen.add(t.group);
        groups.push({id:t.group,color:t.color||'#888',name:t.name});
      }
    });
    const chips=groups.map((g)=>{
      const idxs=groupPropertyIndices(g.id);
      const owner=players.find((pl)=>!pl.bankrupt&&ownsFullGroup(pl,g.id));
      const ownedByMe=idxs.filter((i)=>(players[0].properties||[]).includes(i)).length;
      const label=owner?(owner.name==='You'?'You':'AI'):`${ownedByMe}/${idxs.length}`;
      return `<span class="bus-hold-chip${owner?' is-mono':''}" style="--gc:${g.color}" title="${g.id}">${label}${owner?' ★':''}</span>`;
    }).join('');
    return `<div class="bus-holdings" aria-label="Colour sets">${chips}</div>`;
  }

  function deedHtml(tile,idx){
    const owner=players.find(pl=>!pl.bankrupt&&pl.properties.includes(idx));
    const band=tile.color||'#34495e';
    const typeLabel=tile.type==='property'?'Property':tile.type==='railway'?'Railway':tile.type==='utility'?'Utility':tile.type==='tax'?'Tax':tile.type==='go'?'Start':tile.type==='jail'?'Jail':tile.type==='gotojail'?'Go to Jail':tile.type==='chance'?'Twist':tile.type==='chest'?'Community':tile.type==='parking'?'Rest':'Tile';
    let body='';
    if(isBuyable(tile)){
      const br=owner?rentBreakdown(tile,idx,owner):(null);
      body=`
        <div class="bus-deed-meta">Price <strong>₹${tile.price}</strong>${br?` · Now ₹${br.rent}`:''}${isMortgaged(idx)?' · Mortgaged':''}</div>
        <div class="bus-deed-owner">${owner?`Owned by ${owner.name}`:'Unowned'}${isMortgaged(idx)?' · mortgaged':''}</div>
        ${rentLadderHtml(tile,idx,owner)}`;
    } else if(tile.type==='tax'){
      body=`<div class="bus-deed-meta">Pay <strong>₹${tile.amount}</strong></div>`;
    } else if(tile.type==='jail'){
      const inmate=players.find(pl=>pl.pos===idx&&pl.inJail&&!pl.bankrupt);
      body=`<div class="bus-deed-meta">${inmate?`${inmate.name} imprisoned · attempt ${inmate.jailAttempts}/3`:'Just visiting — not in jail'}</div>`;
    } else if(tile.type==='go'){
      body=`<div class="bus-deed-meta">Salary <strong>₹${GO_SALARY}</strong> when you pass or land</div>`;
    } else {
      body=`<div class="bus-deed-meta">${message||'Land here for an event'}</div>`;
    }
    const buyActions=awaitingBuy&&isMyControl()?`
      <div class="bus-deed-actions">
        <button type="button" id="busBuyYes" class="game-tap-target bus-deed-btn bus-deed-btn--primary">Buy ₹${tile.price}</button>
        <button type="button" id="busBuyNo" class="game-tap-target bus-deed-btn">Skip → auction</button>
      </div>`:'';
    const deedBuild=(!awaitingBuy&&!auction&&!distress&&isMyControl()&&!rolling&&canBuildOn(players[currentPlayer],idx))?`
      <div class="bus-deed-actions">
        <button type="button" id="busDeedBuild" class="game-tap-target bus-deed-btn bus-deed-btn--primary" data-build-idx="${idx}">
          ${improvementTier(idx)===4?`Hotel ₹${houseCostFor(tile.group)}`:`House ₹${houseCostFor(tile.group)}`}
        </button>
      </div>`:'';
    let deedLiq='';
    if(!awaitingBuy&&!auction&&!rolling&&isBuyable(tile)&&owner&&((distress&&isDistressControl()&&distress.payerSeat===players.indexOf(owner))||(isMyControl()&&owner===players[currentPlayer]))){
      const acts=[];
      if(canSellHouseOn(owner,idx))acts.push(`<button type="button" class="game-tap-target bus-deed-btn" data-liq="sell" data-liq-idx="${idx}">Sell house ₹${houseSellRefund(tile.group)}</button>`);
      if(canMortgage(owner,idx))acts.push(`<button type="button" class="game-tap-target bus-deed-btn" data-liq="mortgage" data-liq-idx="${idx}">Mortgage ₹${mortgageValue(tile)}</button>`);
      if(canUnmortgage(owner,idx)&&!distress)acts.push(`<button type="button" class="game-tap-target bus-deed-btn bus-deed-btn--primary" data-liq="unmortgage" data-liq-idx="${idx}">Unmortgage ₹${unmortgageCost(tile)}</button>`);
      if(acts.length)deedLiq=`<div class="bus-deed-actions">${acts.join('')}</div>`;
    }
    return `<div class="bus-deed" style="--bus-band:${band}">
      <div class="bus-deed-band"></div>
      <div class="bus-deed-type">${typeLabel}${isMortgaged(idx)?' · Mortgaged':''}</div>
      <div class="bus-deed-name">${tile.name}</div>
      ${body}
      ${message&&!awaitingBuy&&!awaitingJailChoice&&!auction?`<div class="bus-deed-msg">${message}</div>`:''}
      ${buyActions}
      ${deedBuild}
      ${deedLiq}
    </div>`;
  }

  function jailPanelHtml(){
    if(!awaitingJailChoice||!isMyControl()||rolling||gameOver||awaitingBuy||auction||distress)return '';
    const p=players[currentPlayer];
    if(!p||!p.inJail)return '';
    const mustNote=p.jailAttempts>=2?'Last try — fail and you pay to leave.':'';
    return `<div class="bus-jail-bar">
      <div class="bus-jail-title">In jail · attempt ${p.jailAttempts}/3</div>
      ${mustNote?`<div class="bus-jail-hint">${mustNote}</div>`:''}
      <div class="bus-jail-actions">
        <button type="button" id="busJailPay" class="game-tap-target bus-deed-btn"${p.money<JAIL_FINE&&p.jailAttempts<2?' disabled':''}>Pay ₹${JAIL_FINE}</button>
        <button type="button" id="busJailRoll" class="game-tap-target bus-deed-btn bus-deed-btn--primary">Roll for doubles</button>
      </div>
    </div>`;
  }

  function auctionPanelHtml(){
    if(!auction)return '';
    const tile=BOARD[auction.tileIdx];
    const turnName=players[auction.turnSeat]?players[auction.turnSeat].name:'—';
    const highName=auction.highBidder!=null&&players[auction.highBidder]?players[auction.highBidder].name:'none';
    const nextBid=auction.highBid>0?auction.highBid+auction.raiseBy:auction.minBid;
    const myTurn=isAuctionControl()||(!liveOn&&auction.turnSeat===mySeat);
    return `<div class="bus-auction-bar">
      <div class="bus-auction-title">Auction · ${tile?tile.name:''}</div>
      <div class="bus-auction-meta">High ₹${auction.highBid||0} (${highName}) · ${turnName}'s bid · raise +₹${auction.raiseBy}</div>
      ${myTurn?`<div class="bus-auction-actions">
        <button type="button" id="busAuctionRaise" class="game-tap-target bus-deed-btn bus-deed-btn--primary"${players[auction.turnSeat].money<nextBid?' disabled':''}>Raise to ₹${nextBid}</button>
        <button type="button" id="busAuctionPass" class="game-tap-target bus-deed-btn">Pass</button>
      </div>`:`<div class="bus-auction-meta">Waiting for ${turnName}…</div>`}
    </div>`;
  }

  function distressPanelHtml(){
    if(!distress)return '';
    const payer=players[distress.payerSeat];
    if(!payer)return '';
    const need=Math.max(0,distress.amount-payer.money);
    const mine=isDistressControl()||(!liveOn&&distress.payerSeat===mySeat);
    const sells=listSellOptions(payer);
    const morts=listMortgageOptions(payer);
    const list=mine?`<div class="bus-liq-list">
      ${sells.map((o)=>`<button type="button" class="game-tap-target bus-build-opt" data-liq="sell" data-liq-idx="${o.idx}" style="--gc:${o.color}">
        <span class="bus-build-opt-name">Sell · ${o.name}</span>
        <span class="bus-build-opt-meta">+₹${o.refund}</span>
      </button>`).join('')}
      ${morts.map((o)=>`<button type="button" class="game-tap-target bus-build-opt" data-liq="mortgage" data-liq-idx="${o.idx}" style="--gc:${o.color}">
        <span class="bus-build-opt-name">Mortgage · ${o.name}</span>
        <span class="bus-build-opt-meta">+₹${o.value}</span>
      </button>`).join('')}
    </div>`:'';
    return `<div class="bus-distress-bar">
      <div class="bus-jail-title">${payer.name} must raise ₹${distress.amount} · have ₹${payer.money}${need?` · need ₹${need}`:''}</div>
      <div class="bus-jail-hint">${distress.note||'Sell houses, then mortgage'}</div>
      ${list}
      ${mine?`<button type="button" id="busDistressBust" class="game-tap-target bus-build-toggle" style="margin-top:8px">Can't pay — bankrupt</button>`:''}
    </div>`;
  }

  function buildPanelHtml(){
    if(!isMyControl()||awaitingBuy||rolling||gameOver||auction||distress||trade||tradeOpen)return '';
    const opts=listBuildOptions(players[currentPlayer]);
    if(!opts.length&&!buildOpen)return '';
    if(!opts.length){
      return `<div class="bus-build-bar"><button type="button" id="busBuildToggle" class="game-tap-target bus-build-toggle" disabled>No builds available</button></div>`;
    }
    const list=buildOpen?`<div class="bus-build-list">
      ${opts.map((o)=>`<button type="button" class="game-tap-target bus-build-opt" data-build-idx="${o.idx}" style="--gc:${o.color}">
        <span class="bus-build-opt-name">${o.isHotel?'Hotel':'House'} · ${o.name}</span>
        <span class="bus-build-opt-meta">₹${o.cost} → rent ₹${o.nextRent}</span>
      </button>`).join('')}
    </div>`:'';
    return `<div class="bus-build-bar">
      <button type="button" id="busBuildToggle" class="game-tap-target bus-build-toggle">${buildOpen?'Hide build':'Build'} · ${opts.length}</button>
      ${list}
    </div>`;
  }

  function liquidityPanelHtml(){
    if(distress||auction||trade||tradeOpen||awaitingBuy||rolling||gameOver||!isMyControl())return '';
    const p=players[currentPlayer];
    const sells=listSellOptions(p);
    const morts=listMortgageOptions(p);
    const unmorts=listUnmortgageOptions(p);
    const n=sells.length+morts.length+unmorts.length;
    if(!n&&!liqOpen)return '';
    const list=liqOpen?`<div class="bus-liq-list">
      ${sells.map((o)=>`<button type="button" class="game-tap-target bus-build-opt" data-liq="sell" data-liq-idx="${o.idx}" style="--gc:${o.color}">
        <span class="bus-build-opt-name">Sell · ${o.name}</span><span class="bus-build-opt-meta">+₹${o.refund}</span>
      </button>`).join('')}
      ${morts.map((o)=>`<button type="button" class="game-tap-target bus-build-opt" data-liq="mortgage" data-liq-idx="${o.idx}" style="--gc:${o.color}">
        <span class="bus-build-opt-name">Mortgage · ${o.name}</span><span class="bus-build-opt-meta">+₹${o.value}</span>
      </button>`).join('')}
      ${unmorts.map((o)=>`<button type="button" class="game-tap-target bus-build-opt" data-liq="unmortgage" data-liq-idx="${o.idx}" style="--gc:${o.color}" ${o.afford?'':'disabled'}>
        <span class="bus-build-opt-name">Lift · ${o.name}</span><span class="bus-build-opt-meta">−₹${o.cost}</span>
      </button>`).join('')}
    </div>`:'';
    return `<div class="bus-build-bar">
      <button type="button" id="busLiqToggle" class="game-tap-target bus-build-toggle">${liqOpen?'Hide cash tools':'Cash tools'} · ${n}</button>
      ${list}
    </div>`;
  }

  function miniBoardHtml(){
    const perSide=Math.ceil(BOARD.length/4);
    return `<div class="bus-mini" aria-hidden="true">
      ${BOARD.map((tile,idx)=>{
        const side=idx<perSide?'b':idx<perSide*2?'l':idx<perSide*3?'t':'r';
        const i=idx%perSide;
        const owner=players.find(pl=>!pl.bankrupt&&pl.properties.includes(idx));
        const here=players.some(pl=>pl.pos===idx&&!pl.bankrupt);
        const focus=idx===focusPos;
        const tier=tile.type==='property'?improvementTier(idx):0;
        const mark=isMortgaged(idx)?'M':(tier>=5?'H':(tier>0?String(tier):''));
        return `<span class="bus-mini-tile bus-mini-tile--${side}${focus?' is-focus':''}${here?' is-here':''}${mark?' has-imp':''}${isMortgaged(idx)?' is-mort':''}" style="--i:${i};--n:${perSide};background:${tile.color||'#3d4f61'};${owner?`box-shadow:inset 0 0 0 1.5px ${owner.color};`:''}">${mark?`<em class="bus-mini-imp">${mark}</em>`:''}</span>`;
      }).join('')}
      <div class="bus-mini-center">
        <div class="bus-dice">${diceVal[0]} · ${diceVal[1]}</div>
      </div>
    </div>`;
  }

  function busPhaseTurn(){
    if(gameOver)return{mode:'over',label:'Game over',sub:message||''};
    if(distress){
      const payer=players[distress.payerSeat];
      const mine=isDistressControl()||(!liveOn&&distress.payerSeat===mySeat);
      return{
        mode:mine?'yours':'theirs',
        label:mine?'Raise funds':'Waiting — debt',
        sub:message||((payer?payer.name:'Player')+' must raise ₹'+distress.amount+(distress.note?' · '+distress.note:'')),
      };
    }
    if(trade){
      const mine=isTradeResponder();
      const proposeWait=isTradeProposer()||(!liveOn&&trade.from===mySeat&&trade.to!==mySeat);
      return{
        mode:mine?'yours':(proposeWait?'waiting':'theirs'),
        label:mine?'Your turn — respond to deal':proposeWait?'Deal pending':'Waiting on deal',
        sub:message||'Trade stays open — board stays live',
      };
    }
    if(tradeOpen){
      return{mode:'yours',label:'Compose a deal',sub:message||'Offer cash or deeds, then Propose'};
    }
    if(auction){
      const turnName=players[auction.turnSeat]?players[auction.turnSeat].name:'—';
      const mine=isAuctionControl()||(!liveOn&&auction.turnSeat===mySeat);
      return{
        mode:mine?'yours':'theirs',
        label:mine?'Your bid':'Auction — waiting',
        sub:message||(turnName+"'s bid · high ₹"+(auction.highBid||0)),
      };
    }
    if(awaitingBuy&&isMyControl()){
      return{mode:'yours',label:'Your turn — buy or auction',sub:message||'Buy the deed or skip to auction'};
    }
    if(awaitingJailChoice&&isMyControl()){
      return{mode:'yours',label:'Your turn — jail',sub:message||'Pay fine or roll for doubles'};
    }
    if(isMyControl()){
      return{
        mode:'yours',
        label:rolling?'Rolling…':(pendingExtraTurn||doublesStreak?'Your turn — roll again':'Your turn — roll'),
        sub:message||'Roll dice to move',
      };
    }
    const who=players[currentPlayer]?players[currentPlayer].name:'Opponent';
    return{mode:'theirs',label:who+'’s turn',sub:message||(liveOn?'Board stays live — wait for their move':who+' playing…')};
  }

  function render(){
    if(!alive())return;
    const tile=BOARD[focusPos]||BOARD[0];
    if(gameOver){
      const winner=players.find(p=>!p.bankrupt);
      const worthLine=players.map(p=>`${p.name}: ₹${netWorth(p)} NW`).join(' · ');
      const shareMeta=liveOn?(liveStake>0?`Live 1v1 · Stake ⚡${liveStake}`:'Live 1v1 · Friendly'):'Practice';
      const shareLine=winner?(winner.name==='You'?`I won Business on Chaupaal (${shareMeta})`:`${winner.name} won Business (${shareMeta})`):'Business over';
      overlay.innerHTML=`
        ${gameChromeHtml({title:'Business',subtitle:MODE_SUB+' · Results',backId:'busBack'})}
        ${typeof gameResultHtml==='function'?gameResultHtml({
          gameId:'business',
          glyph:winner&&winner.name==='You'?'✓':'·',
          title:winner?(winner.name==='You'?'You win':`${winner.name} wins`):'Game over',
          subtitle:worthLine+(liveOn&&liveStake>0?' · virtual chips only':''),
          shareCardHtml: typeof buildGameShareCard==='function'?buildGameShareCard('business',{scoreLine:shareLine,meta:shareMeta}):'',
          actions:[
            {label:'Play again',primary:true,id:'again'},
            {label:'Share',primary:false,id:'share'},
            {label:'Post to story',primary:false,id:'story'},
            {label:'Done',primary:false,id:'done'},
          ],
        }):`<div style="padding:24px;text-align:center;color:#fff;">${winner?.name||'Someone'} wins</div>`}
      `;
      document.getElementById('busBack')?.addEventListener('click',()=>{askBusLeave();});
      if(typeof wireGameResultActions==='function'){
        const shareStats={scoreLine:shareLine,meta:shareMeta};
        wireGameResultActions(overlay,{
          again:()=>{
            if(liveOn){
              try{
                const mid=typeof dangalMatchId==='function'
                  ?dangalMatchId('business',{name:chat&&chat.name,opponentUid:settleOppUid})
                  :'business_'+Date.now();
                if(window.__dangalLaunchCtx){
                  window.__dangalLaunchCtx=Object.assign({},window.__dangalLaunchCtx,{
                    matchId:mid,gameId:'business',stake:liveStake,mode:'live',opponentUid:settleOppUid,
                  });
                }
                if(chat){chat.dangalMatchId=mid;chat.stake=liveStake;}
              }catch(e){}
            }
            close();
            openBusinessGame(chat,liveOn?2:playerCount);
          },
          share:()=>{if(typeof shareGameResult==='function')shareGameResult('business',shareStats);},
          story:()=>{if(typeof postGameScoreStory==='function')postGameScoreStory('business',shareStats);},
          done:()=>close(),
        });
      } else {
        overlay.querySelector('[data-result-action]')?.addEventListener('click',()=>close());
      }
      return;
    }
    const showTimer=(isMyControl()&&!awaitingBuy&&!auction&&!distress&&!trade&&!tradeOpen)||isAuctionControl()||isDistressControl()||isTradeResponder();
    const canDeal=isMyControl()&&!rolling&&!awaitingBuy&&!awaitingJailChoice&&!auction&&!distress&&!trade&&!tradeOpen&&!gameOver;
    const turnMeta=busPhaseTurn();
    const turnBanner=typeof gameTurnBannerHtml==='function'
      ? gameTurnBannerHtml({mode:turnMeta.mode,label:turnMeta.label,sub:turnMeta.sub,pulse:turnMeta.mode==='yours'})
      : '';
    const timerWarn=showTimer&&busTimer<=5;
    overlay.innerHTML=`
      ${gameChromeHtml({title:'Business',subtitle:MODE_SUB+(doublesStreak?` · Doubles ${doublesStreak}`:'')+(auction?' · Auction':'')+(trade?' · Deal':''),backId:'busBack',rightHtml:showTimer?`<span id="busTimerEl" class="game-chrome-metric${timerWarn?' is-warn':''}">${busTimer}s</span>`:undefined})}
      ${turnBanner}
      <div class="bus-players">
        ${players.map((p,i)=>`<div class="bus-player${currentPlayer===i?' is-active':''}${p.bankrupt?' is-out':''}${p.inJail?' is-jail':''}" style="--pc:${p.color}">
          <div class="bus-player-name">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(p.name,p):p.name}</div>
          <div class="bus-player-cash">₹${p.money}</div>
          <div class="bus-player-props">${p.inJail?'Jail · ':''}${p.properties.length} props</div>
        </div>`).join('')}
      </div>
      ${holdingsStripHtml()}
      <div class="bus-main">
        ${deedHtml(tile,focusPos)}
        ${miniBoardHtml()}
      </div>
      ${message?`<p class="bus-last-event" role="status">${message}</p>`:''}
      ${tradePanelHtml()}
      ${auctionPanelHtml()}
      ${distressPanelHtml()}
      ${jailPanelHtml()}
      ${buildPanelHtml()}
      ${liquidityPanelHtml()}
      <div class="bus-controls bus-controls--row">
        ${canDeal?`<button type="button" id="busDealBtn" class="game-tap-target bus-side-btn">Deal</button>`:''}
        <button type="button" id="busRollBtn" class="game-tap-target bus-roll-btn"${!isMyControl()||rolling||awaitingBuy||awaitingJailChoice||auction||distress||trade||tradeOpen?' disabled':''}>
          ${awaitingBuy?'Buy or auction':trade?'Deal pending':tradeOpen?'Finish or close deal':auction?'Auction in play':distress?'Raise funds':awaitingJailChoice?'Jail: Pay or Roll':isMyControl()?(rolling?'Rolling…':(pendingExtraTurn||doublesStreak?'Roll again':'Roll dice')):`${players[currentPlayer].name} playing…`}
        </button>
      </div>
    `;
    document.getElementById('busBack').addEventListener('click',()=>{askBusLeave();});
    document.getElementById('busRollBtn')?.addEventListener('click',()=>{if(isMyControl()&&!rolling&&!awaitingBuy&&!awaitingJailChoice&&!auction&&!distress&&!trade&&!tradeOpen&&!gameOver)rollBusDice();});
    document.getElementById('busDealBtn')?.addEventListener('click',()=>openTradeSheet());
    document.getElementById('busBuyYes')?.addEventListener('click',()=>resolveBuy(true));
    document.getElementById('busBuyNo')?.addEventListener('click',()=>resolveBuy(false));
    document.getElementById('busJailPay')?.addEventListener('click',()=>payJailFine());
    document.getElementById('busJailRoll')?.addEventListener('click',()=>jailRollAttempt());
    document.getElementById('busAuctionRaise')?.addEventListener('click',()=>auctionRaise());
    document.getElementById('busAuctionPass')?.addEventListener('click',()=>auctionPass());
    document.getElementById('busDistressBust')?.addEventListener('click',()=>declareDistressBankrupt());
    document.getElementById('busTradeAccept')?.addEventListener('click',()=>acceptTrade());
    document.getElementById('busTradeDecline')?.addEventListener('click',()=>declineTrade());
    document.getElementById('busTradeCancel')?.addEventListener('click',()=>cancelTradeProposal());
    document.getElementById('busTradePropose')?.addEventListener('click',()=>{
      const offerEl=document.getElementById('busTradeOfferCash');
      const askEl=document.getElementById('busTradeAskCash');
      if(tradeDraft){
        setDraftCash('offer',offerEl?offerEl.value:0);
        setDraftCash('ask',askEl?askEl.value:0);
      }
      proposeTrade();
    });
    document.getElementById('busTradeClose')?.addEventListener('click',()=>closeTradeSheet());
    document.getElementById('busBuildToggle')?.addEventListener('click',()=>{
      if(!isMyControl()||awaitingBuy||rolling||auction||distress||trade||tradeOpen)return;
      buildOpen=!buildOpen;liqOpen=false;render();
    });
    document.getElementById('busLiqToggle')?.addEventListener('click',()=>{
      if(!isMyControl()||awaitingBuy||rolling||auction||distress||trade||tradeOpen)return;
      liqOpen=!liqOpen;buildOpen=false;render();
    });
    overlay.querySelectorAll('[data-build-idx]').forEach((btn)=>{
      btn.addEventListener('click',()=>{
        const idx=Number(btn.getAttribute('data-build-idx'));
        if(Number.isFinite(idx))tryPlayerBuild(idx);
      });
    });
    overlay.querySelectorAll('[data-liq-idx]').forEach((btn)=>{
      btn.addEventListener('click',()=>{
        const idx=Number(btn.getAttribute('data-liq-idx'));
        const kind=btn.getAttribute('data-liq');
        if(Number.isFinite(idx)&&kind)tryPlayerLiquidity(kind,idx);
      });
    });
    overlay.querySelectorAll('[data-trade-to]').forEach((btn)=>{
      btn.addEventListener('click',()=>setDraftPartner(Number(btn.getAttribute('data-trade-to'))));
    });
    overlay.querySelectorAll('[data-trade-offer]').forEach((btn)=>{
      btn.addEventListener('click',()=>toggleDraftProp('offer',Number(btn.getAttribute('data-trade-offer'))));
    });
    overlay.querySelectorAll('[data-trade-ask]').forEach((btn)=>{
      btn.addEventListener('click',()=>toggleDraftProp('ask',Number(btn.getAttribute('data-trade-ask'))));
    });
  }

  if(liveOn&&liveRoles&&typeof DangalLive!=='undefined'){
    liveHandle=DangalLive.join({
      gameType:'business',
      matchId:(chat&&chat.dangalMatchId)||(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.matchId),
      me:liveRoles.me,playerA:liveRoles.playerA,playerB:liveRoles.playerB,
      state:{players:serializeBusPlayers(),improvements:serializeImprovements(),mortgaged:serializeMortgaged(),auction:null,distress:null,trade:null,currentPlayer:0,diceVal:[1,1],message:'',gameOver:false,awaitingBuy:false,awaitingJailChoice:false,focusPos:0,doublesStreak:0,pendingExtraTurn:false},
      onSnap(val){
        if(!val||applyingLive||!alive())return;
        if(val.status==='forfeit'&&!gameOver){
          gameOver=true;stopBusTimer();stopAuctionTimer();stopTradeTimer();
          trade=null;tradeDraft=null;
          const iWon=val.winner===liveRoles.me;
          if(gs)gs.setOutcome(iWon?'won':'lost');
          if(typeof recordGameResult==='function')recordGameResult('business',iWon);
          settleBusinessOnce(iWon);
          message=iWon?'Opponent left — you win!':'Forfeit';
          render();return;
        }
        const s=val.state;if(!s||!s.players)return;
        applyingLive=true;
        applyBusPlayers(s.players);
        if(s.improvements)applyImprovements(s.improvements);
        applyMortgaged(s.mortgaged);
        applyAuction(s.auction);
        applyDistress(s.distress);
        applyTrade(s.trade);
        if(!trade){tradeOpen=false;tradeDraft=null;}
        currentPlayer=Number(s.currentPlayer)||0;
        if(Array.isArray(s.diceVal))diceVal=s.diceVal.slice();
        message=s.message||'';
        gameOver=!!s.gameOver||val.status==='over';
        awaitingBuy=!!s.awaitingBuy;
        awaitingJailChoice=!!s.awaitingJailChoice;
        doublesStreak=Number(s.doublesStreak)||0;
        pendingExtraTurn=!!s.pendingExtraTurn;
        focusPos=s.focusPos!=null?Number(s.focusPos):players[currentPlayer].pos;
        stopBusTimer();stopAuctionTimer();stopTradeTimer();
        if(gameOver){
          const iWon=!!players[mySeat]&&!players[mySeat].bankrupt;
          settleBusinessOnce(iWon);
        }
        render();
        if(!gameOver){
          if(trade&&trade.status==='pending'&&isTradeResponder())startTradeTimer();
          else if(auction&&isAuctionControl())startAuctionTimer();
          else if(!awaitingBuy&&!distress&&!trade&&isMyControl())startBusTimer();
        }
        applyingLive=false;
      },
    });
  }
  render();
  if(isMyControl())startBusTimer();
}

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
  /** Match end: 3 rounds — each active seat draws once per round. Practice: 1 solo draw. */
  const maxRounds=practiceMode?1:3;
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
      players.forEach((p,i)=>{
        if(i===currentDrawerIdx||p.isMe)return;
        schedule(()=>{
          if(!alive()||phase!=='draw'||p.out||guessedCorrectly.has(p.key)||Math.random()>=0.55)return;
          applyCorrectGuess(p.key,currentWord,true);
        },5000+Math.random()*25000);
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

    // Practice AI draw seat: honest blank — secret word for AI “draw”, no doodle.
    if(!liveOn&&!practiceMode&&!iAmDrawer()){
      setRoundWord(samplePick3()[0]);
      phase='draw';
      roundTimer=DRAW_SECS;
      render();
      clearInterval(roundInterval);
      roundInterval=setInterval(()=>{
        if(!alive()){clearInterval(roundInterval);return;}
        roundTimer--;
        const el=document.getElementById('scribbleTimer');if(el)el.textContent=roundTimer+'s';
        if(roundTimer<=0){clearInterval(roundInterval);finishRound({reason:'timeout'});}
      },1000);
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
    business:{name:'🏙️ Business',min:2,max:6},
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
      else if(gameId==='business')openBusinessGame(fakeChat,playerCount);
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
    id: 'fiveinrow',
    name: 'Five in a Row',
    desc: 'Connect 5 · Freestyle/Renju · block fours · live duel',
    icon: '🔵',
    ratingKey: 'fiveinrow',
    gameType: 'dual',
    liveDuel: true,
    genre: 'board',
    chat1v1: true,
    selfChat: true,
    order: 70,
    launch(ctx) { openFiveInRowGame(typeof chatFromLaunch === 'function' ? chatFromLaunch(ctx) : ctx.chat); },
  });
  registerGame({
    id: 'business',
    name: 'Business',
    desc: 'Buy, build, deal & bankrupt — Practice 2–6 · Live 1v1',
    icon: '🏙️',
    ratingKey: 'business',
    gameType: 'multiplayer',
    liveDuel: true,
    genre: 'board',
    chat1v1: true,
    chatGroup: true,
    order: 80,
    launch(ctx) {
      if (ctx.isGroup) openGroupGameSetup(ctx.chat, 'business');
      else openBusinessGame(ctx.chat, 2);
    },
  });
  registerGame({
    id: 'scribble',
    name: 'Scribble',
    desc: 'Draw & guess · Live 1v1 or party 3–6',
    icon: '🎨',
    ratingKey: 'scribble',
    gameType: 'multiplayer',
    genre: 'party',
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
