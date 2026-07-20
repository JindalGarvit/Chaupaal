// ===================== FIVE IN A ROW (Gomoku) =====================
function openFiveInRowGame(chat){
  const SIZE=13;
  let board=Array(SIZE).fill(null).map(()=>Array(SIZE).fill(null));
  let myTurn=true;let gameOver=false;let winLine=null;
  let lastMove=null;let dropCell=null;let statusNote='';
  const FIR_SECS=18;let firTimer=FIR_SECS;let firInterval=null;let warned=false;

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;';
  const begin=typeof beginGameOverlaySession==='function'?beginGameOverlaySession:null;
  const gs=begin?begin({
    type:'fiveinrow',title:'Five in a Row',mode:'1v1',chat,overlay,
    cleanup(){stopFirTimer();},
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
  const close=()=>{if(gs)gs.close();else{stopFirTimer();overlay.remove();}};

  function passTurnSoft(){
    if(!myTurn||gameOver)return;
    statusNote='Time up — turn passed';
    if(typeof gameFeedback==='function')gameFeedback('invalid');
    if(typeof showToast==='function')showToast('Time’s up — your turn passed');
    myTurn=false;stopFirTimer();
    render();
    if(!gameOver)schedule(()=>{if(!alive())return;const[ar,ac]=getAIMoveFIR();playMove(ar,ac,'opp');},700);
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

  function checkFiveWin(r,c,sym){
    const dirs=[[0,1],[1,0],[1,1],[1,-1]];
    for(const[dr,dc] of dirs){
      let cells=[[r,c]];
      for(let s=1;s<5;s++){const nr=r+dr*s,nc=c+dc*s;if(nr<0||nr>=SIZE||nc<0||nc>=SIZE||board[nr][nc]!==sym)break;cells.push([nr,nc]);}
      for(let s=1;s<5;s++){const nr=r-dr*s,nc=c-dc*s;if(nr<0||nr>=SIZE||nc<0||nc>=SIZE||board[nr][nc]!==sym)break;cells.unshift([nr,nc]);}
      if(cells.length>=5)return cells.slice(0,5);
    }
    return null;
  }

  function getAIMoveFIR(){
    let best=null,bestScore=-1;
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      if(board[r][c])continue;
      board[r][c]='O';const oScore=scorePosition(r,c,'O');board[r][c]=null;
      board[r][c]='X';const xScore=scorePosition(r,c,'X');board[r][c]=null;
      const score=oScore*1.1+xScore;
      if(score>bestScore){bestScore=score;best=[r,c];}
    }
    return best||[Math.floor(SIZE/2),Math.floor(SIZE/2)];
  }

  function scorePosition(r,c,sym){
    let score=0;
    const dirs=[[0,1],[1,0],[1,1],[1,-1]];
    for(const[dr,dc] of dirs){
      let count=1;
      for(let s=1;s<5;s++){const nr=r+dr*s,nc=c+dc*s;if(nr<0||nr>=SIZE||nc<0||nc>=SIZE||board[nr][nc]!==sym)break;count++;}
      for(let s=1;s<5;s++){const nr=r-dr*s,nc=c-dc*s;if(nr<0||nr>=SIZE||nc<0||nc>=SIZE||board[nr][nc]!==sym)break;count++;}
      score+=Math.pow(count,2);
    }
    return score;
  }

  function playMove(r,c,who){
    if(!alive()||board[r][c]||gameOver)return;
    const sym=who==='me'?'X':'O';
    board[r][c]=sym;
    lastMove=[r,c];
    dropCell=r+'_'+c;
    statusNote='';
    if(typeof gameFeedback==='function')gameFeedback(who==='me'?'place':'move');
    const win=checkFiveWin(r,c,sym);
    if(win){
      gameOver=true;winLine=win;stopFirTimer();
      if(gs)gs.setOutcome(who==='me'?'won':'lost');
      if(typeof recordGameResult==='function')recordGameResult('fiveinrow',who==='me');
      if(typeof gameFeedback==='function')gameFeedback(who==='me'?'win':'lose');
      render();return;
    }
    if(board.every(row=>row.every(Boolean))){
      gameOver=true;stopFirTimer();
      if(gs)gs.setOutcome('draw');
      if(typeof recordGameResult==='function')recordGameResult('fiveinrow',false,true);
      if(typeof gameFeedback==='function')gameFeedback('draw');
      render();return;
    }
    myTurn=who!=='me';
    if(myTurn)startFirTimer();else stopFirTimer();
    render();
    if(!myTurn&&!gameOver)schedule(()=>{if(!alive())return;const[ar,ac]=getAIMoveFIR();playMove(ar,ac,'opp');},700);
  }

  function render(){
    if(!alive())return;
    const timerClass=firTimer<=5?'fir-timer fir-timer--warn':'fir-timer';
    overlay.innerHTML=`
      ${gameChromeHtml({title:'Five in a Row',backId:'firBack',rightHtml:!gameOver?`<span id="firTimerEl" class="game-chrome-metric ${timerClass}">${firTimer}s</span>`:undefined})}
      <div class="fir-hud">
        <div class="fir-hud-side fir-hud-side--you">● You</div>
        <div id="firStatusNote" class="fir-hud-note">${statusNote||(myTurn?'Place a stone':'Waiting…')}</div>
        <div class="fir-hud-side fir-hud-side--opp">○ ${chat.name||'Opp'}</div>
      </div>
      <div class="fir-board-wrap">
        <div id="firBoard" class="fir-board" style="--fir-n:${SIZE};" role="grid" aria-label="Five in a Row board"></div>
      </div>
      ${typeof gameTurnBannerHtml==='function'
        ? gameTurnBannerHtml({
            mode: gameOver?'over':myTurn?'yours':'theirs',
            label: gameOver?(winLine?(board[winLine[0][0]][winLine[0][1]]==='X'?'You won!':(chat.name||'Opponent')+' won!'):"It's a draw!"):(myTurn?'Your turn':(chat.name||'Opponent')+' thinking…'),
            pulse: !gameOver && myTurn,
          })
        : `<div class="fir-turn-fallback">${gameOver?(winLine?(board[winLine[0][0]][winLine[0][1]]==='X'?'You won!':chat.name+' won!'):"It's a draw!"):(myTurn?'Your turn':chat.name+' thinking…')}</div>`}
    `;
    document.getElementById('firBack').addEventListener('click',()=>close());
    const boardEl=document.getElementById('firBoard');
    const winSet=new Set((winLine||[]).map(([r,c])=>r+'_'+c));
    const lastKey=lastMove?lastMove[0]+'_'+lastMove[1]:'';
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      const sq=document.createElement('button');
      sq.type='button';
      sq.className='fir-cell';
      sq.setAttribute('role','gridcell');
      sq.setAttribute('aria-label',`Row ${r+1} column ${c+1}`);
      if(winSet.has(r+'_'+c))sq.classList.add('fir-cell--win');
      if(board[r][c]){
        const stone=document.createElement('span');
        stone.className='fir-stone fir-stone--'+(board[r][c]==='X'?'black':'white');
        if(dropCell===r+'_'+c)stone.classList.add('fir-stone--drop');
        if(lastKey===r+'_'+c)stone.classList.add('fir-stone--last');
        sq.appendChild(stone);
      } else if(myTurn&&!gameOver){
        sq.classList.add('fir-cell--open');
        sq.addEventListener('click',()=>{stopFirTimer();playMove(r,c,'me');});
      }
      boardEl.appendChild(sq);
    }
    dropCell=null;
  }
  render();startFirTimer();
}

// ===================== BUSINESS (property trading) =====================
function openBusinessGame(chat,playerCount){
  playerCount=Math.min(Math.max(playerCount||2,2),6);
  const PLAYER_COLORS=['#E74C3C','#3498DB','#2ECC71','#F1C40F','#9B59B6','#1ABC9C'];
  const NAMES=['You',chat.name,...(playerCount>2?['Player 3','Player 4','Player 5','Player 6'].slice(0,playerCount-2):[])];

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

  let players=NAMES.map((name,i)=>({name,pos:0,money:15000,properties:[],jailed:0,bankrupt:false,color:PLAYER_COLORS[i]}));
  let currentPlayer=0;let diceVal=[1,1];let rolling=false;let gameOver=false;let message='';
  let awaitingBuy=false;let focusPos=0;
  const BUS_SECS=20;let busTimer=BUS_SECS;let busInterval=null;let diceIv=null;

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;';
  const begin=typeof beginGameOverlaySession==='function'?beginGameOverlaySession:null;
  const gs=begin?begin({
    type:'business',title:'Business',mode:playerCount>2?'group':'1v1',chat,overlay,
    cleanup(){stopBusTimer();if(diceIv){clearInterval(diceIv);diceIv=null;}},
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
  const close=()=>{if(gs)gs.close();else{stopBusTimer();if(diceIv)clearInterval(diceIv);overlay.remove();}};

  function startBusTimer(){
    if(currentPlayer!==0||!alive()||awaitingBuy)return;
    clearInterval(busInterval);busTimer=BUS_SECS;
    busInterval=setInterval(()=>{
      if(!alive()){clearInterval(busInterval);return;}
      busTimer--;
      const el=document.getElementById('busTimerEl');
      if(el)el.textContent=busTimer+'s';
      if(busTimer<=0){clearInterval(busInterval);if(!rolling&&!gameOver&&!awaitingBuy)rollBusDice();}
    },1000);
  }
  function stopBusTimer(){clearInterval(busInterval);busInterval=null;}

  function rollBusDice(){
    if(!alive()||rolling||gameOver||awaitingBuy)return;
    stopBusTimer();rolling=true;let ticks=0;
    if(typeof gameFeedback==='function')gameFeedback('select');
    if(diceIv)clearInterval(diceIv);
    diceIv=setInterval(()=>{
      if(!alive()){clearInterval(diceIv);diceIv=null;return;}
      diceVal=[Math.floor(Math.random()*6)+1,Math.floor(Math.random()*6)+1];render();ticks++;
      if(ticks>8){clearInterval(diceIv);diceIv=null;rolling=false;movePlayerToken(diceVal[0]+diceVal[1]);}
    },80);
  }

  function isBuyable(tile){
    return tile&&(tile.type==='property'||tile.type==='railway'||tile.type==='utility');
  }

  function rentFor(tile){
    if(!tile)return 0;
    if(tile.type==='property')return tile.rent[0];
    if(tile.type==='railway')return 500;
    return 200;
  }

  function movePlayerToken(steps){
    const p=players[currentPlayer];
    p.pos=(p.pos+steps)%BOARD.length;
    focusPos=p.pos;
    const tile=BOARD[p.pos];
    message='';
    if(tile.type==='go'){p.money+=2000;message='Passed Start! +₹2000';}
    else if(tile.type==='tax'){p.money-=tile.amount;message=`Paid ₹${tile.amount} tax`;}
    else if(tile.type==='gotojail'){p.pos=10;p.jailed=2;focusPos=10;message='Sent to Jail';}
    else if(tile.type==='chance'||tile.type==='chest'){
      const events=[{m:'Bonus payout!',amt:500},{m:'Repair bill',amt:-300},{m:'Lottery win!',amt:1000},{m:'Fine for jaywalking',amt:-150}];
      const e=events[Math.floor(Math.random()*events.length)];p.money+=e.amt;message=`${e.m} ${e.amt>0?'+':''}₹${e.amt}`;
    }
    else if(isBuyable(tile)){
      const owner=players.find(pl=>pl.properties.includes(p.pos));
      if(owner&&owner!==p){
        const rent=rentFor(tile);
        p.money-=rent;owner.money+=rent;message=`Paid ₹${rent} rent to ${owner.name}`;
      }
    }
    render();
    if(isBuyable(tile)&&!players.find(pl=>pl.properties.includes(p.pos))&&p.money>=tile.price){
      offerBuy(tile,p);
    } else {
      endBusTurn();
    }
  }

  function offerBuy(tile,player){
    if(currentPlayer!==0){
      if(Math.random()<0.7&&player.money>=tile.price){
        player.money-=tile.price;player.properties.push(player.pos);
        message=`${player.name} bought ${tile.name}!`;
        if(typeof gameFeedback==='function')gameFeedback('card');
      }
      render();endBusTurn();return;
    }
    awaitingBuy=true;
    stopBusTimer();
    message=`Buy ${tile.name}?`;
    render();
  }

  function resolveBuy(yes){
    if(!awaitingBuy)return;
    const p=players[0];
    const tile=BOARD[p.pos];
    awaitingBuy=false;
    if(yes&&isBuyable(tile)&&p.money>=tile.price&&!players.find(pl=>pl.properties.includes(p.pos))){
      p.money-=tile.price;p.properties.push(p.pos);
      message=`You bought ${tile.name}!`;
      if(typeof gameFeedback==='function')gameFeedback('card');
    } else if(!yes){
      message='Skipped purchase';
    }
    endBusTurn();
  }

  function endBusTurn(){
    if(!alive())return;
    awaitingBuy=false;
    const p=players[currentPlayer];
    if(p.money<0){p.bankrupt=true;message=`${p.name} went bankrupt`;}
    const active=players.filter(pl=>!pl.bankrupt);
    if(active.length===1){
      gameOver=true;
      const won=active[0].name==='You';
      if(gs)gs.setOutcome(won?'won':'lost');
      if(typeof recordGameResult==='function')recordGameResult('business',won);
      if(typeof gameFeedback==='function')gameFeedback(won?'win':'lose');
      render();return;
    }
    do{currentPlayer=(currentPlayer+1)%playerCount;}while(players[currentPlayer].bankrupt);
    focusPos=players[currentPlayer].pos;
    render();
    if(currentPlayer===0)startBusTimer();
    else schedule(rollBusDice,900);
  }

  function deedHtml(tile,idx){
    const owner=players.find(pl=>pl.properties.includes(idx));
    const band=tile.color||'#34495e';
    const typeLabel=tile.type==='property'?'Property':tile.type==='railway'?'Railway':tile.type==='utility'?'Utility':tile.type==='tax'?'Tax':tile.type==='go'?'Start':tile.type==='jail'?'Jail':tile.type==='gotojail'?'Go to Jail':tile.type==='chance'?'Twist':tile.type==='chest'?'Community':tile.type==='parking'?'Rest':'Tile';
    let body='';
    if(isBuyable(tile)){
      body=`
        <div class="bus-deed-meta">Price <strong>₹${tile.price}</strong>${tile.rent?` · Rent ₹${tile.rent[0]}`:''}</div>
        <div class="bus-deed-owner">${owner?`Owned by ${owner.name}`:'Unowned'}</div>`;
    } else if(tile.type==='tax'){
      body=`<div class="bus-deed-meta">Pay <strong>₹${tile.amount}</strong></div>`;
    } else {
      body=`<div class="bus-deed-meta">${message||'Land here for an event'}</div>`;
    }
    const buyActions=awaitingBuy&&currentPlayer===0?`
      <div class="bus-deed-actions">
        <button type="button" id="busBuyYes" class="game-tap-target bus-deed-btn bus-deed-btn--primary">Buy ₹${tile.price}</button>
        <button type="button" id="busBuyNo" class="game-tap-target bus-deed-btn">Skip</button>
      </div>`:'';
    return `<div class="bus-deed" style="--bus-band:${band}">
      <div class="bus-deed-band"></div>
      <div class="bus-deed-type">${typeLabel}</div>
      <div class="bus-deed-name">${tile.name}</div>
      ${body}
      ${message&&!awaitingBuy?`<div class="bus-deed-msg">${message}</div>`:''}
      ${buyActions}
    </div>`;
  }

  function miniBoardHtml(){
    const perSide=Math.ceil(BOARD.length/4);
    return `<div class="bus-mini" aria-hidden="true">
      ${BOARD.map((tile,idx)=>{
        const side=idx<perSide?'b':idx<perSide*2?'l':idx<perSide*3?'t':'r';
        const i=idx%perSide;
        const owner=players.find(pl=>pl.properties.includes(idx));
        const here=players.some(pl=>pl.pos===idx&&!pl.bankrupt);
        const focus=idx===focusPos;
        return `<span class="bus-mini-tile bus-mini-tile--${side}${focus?' is-focus':''}${here?' is-here':''}" style="--i:${i};--n:${perSide};background:${tile.color||'#3d4f61'};${owner?`box-shadow:inset 0 0 0 1.5px ${owner.color};`:''}"></span>`;
      }).join('')}
      <div class="bus-mini-center">
        <div class="bus-dice">${diceVal[0]} · ${diceVal[1]}</div>
      </div>
    </div>`;
  }

  function render(){
    if(!alive())return;
    const tile=BOARD[focusPos]||BOARD[0];
    if(gameOver){
      const winner=players.find(p=>!p.bankrupt);
      overlay.innerHTML=`
        ${gameChromeHtml({title:'Business',subtitle:'Results',backId:'busBack'})}
        ${typeof gameResultHtml==='function'?gameResultHtml({
          glyph:winner&&winner.name==='You'?'✓':'·',
          title:winner?(winner.name==='You'?'You win':`${winner.name} wins`):'Game over',
          subtitle:players.map(p=>`${p.name}: ₹${Math.max(0,p.money)} · ${p.properties.length} props`).join(' · '),
          actions:[{label:'Done',primary:true}],
        }):`<div style="padding:24px;text-align:center;color:#fff;">${winner?.name||'Someone'} wins</div>`}
      `;
      document.getElementById('busBack')?.addEventListener('click',()=>close());
      overlay.querySelector('[data-result-action]')?.addEventListener('click',()=>close());
      return;
    }
    overlay.innerHTML=`
      ${gameChromeHtml({title:'Business',backId:'busBack',rightHtml:currentPlayer===0&&!awaitingBuy?`<span id="busTimerEl" class="game-chrome-metric">${busTimer}s</span>`:undefined})}
      <div class="bus-players">
        ${players.map((p,i)=>`<div class="bus-player${currentPlayer===i?' is-active':''}${p.bankrupt?' is-out':''}" style="--pc:${p.color}">
          <div class="bus-player-name">${p.name}</div>
          <div class="bus-player-cash">₹${p.money}</div>
          <div class="bus-player-props">${p.properties.length} props</div>
        </div>`).join('')}
      </div>
      <div class="bus-main">
        ${deedHtml(tile,focusPos)}
        ${miniBoardHtml()}
      </div>
      <div class="bus-controls">
        <button type="button" id="busRollBtn" class="game-tap-target bus-roll-btn"${currentPlayer!==0||rolling||awaitingBuy?' disabled':''}>
          ${awaitingBuy?'Choose Buy or Skip':currentPlayer===0?(rolling?'Rolling…':'Roll dice'):`${players[currentPlayer].name} playing…`}
        </button>
      </div>
    `;
    document.getElementById('busBack').addEventListener('click',()=>close());
    document.getElementById('busRollBtn')?.addEventListener('click',()=>{if(currentPlayer===0&&!rolling&&!awaitingBuy&&!gameOver)rollBusDice();});
    document.getElementById('busBuyYes')?.addEventListener('click',()=>resolveBuy(true));
    document.getElementById('busBuyNo')?.addEventListener('click',()=>resolveBuy(false));
  }
  render();startBusTimer();
}

// ===================== SCRIBBLE (draw & guess) =====================
const SCRIBBLE_WORDS=["elephant", "dolphin", "penguin", "butterfly", "jellyfish", "crocodile", "flamingo", "kangaroo", "cheetah", "gorilla", "giraffe", "porcupine", "chameleon", "octopus", "seahorse", "platypus", "armadillo", "orangutan", "chimpanzee", "rhinoceros", "hippopotamus", "peacock", "pelican", "toucan", "parrot", "cobra", "python", "eagle", "falcon", "owl", "whale", "shark", "starfish", "lobster", "crab", "scorpion", "tarantula", "dragonfly", "firefly", "squirrel", "hedgehog", "beaver", "badger", "raccoon", "skunk", "meerkat", "lemur", "sloth", "anteater", "guitar", "telescope", "umbrella", "bicycle", "lighthouse", "helicopter", "submarine", "microscope", "compass", "thermometer", "calculator", "binoculars", "periscope", "sundial", "hourglass", "protractor", "abacus", "typewriter", "lantern", "canteen", "hammock", "backpack", "suitcase", "parachute", "magnifying glass", "flashlight", "walkie talkie", "megaphone", "trophy", "diploma", "passport", "anchor", "stethoscope", "scissors", "screwdriver", "wrench", "pliers", "saw", "drill", "hammer", "chisel", "level", "ruler", "tape measure", "pizza", "sunflower", "watermelon", "pineapple", "strawberry", "broccoli", "avocado", "croissant", "pretzel", "sushi", "dumpling", "burrito", "taco", "waffle", "pancake", "macaron", "cheesecake", "tiramisu", "baguette", "donut", "bagel", "muffin", "cupcake", "brownie", "\u00e9clair", "meringue", "sorbet", "pudding", "lasagna", "paella", "risotto", "ramen", "pho", "biryani", "curry", "samosa", "chapati", "naan", "mountain", "rainbow", "waterfall", "volcano", "glacier", "tornado", "blizzard", "hurricane", "earthquake", "tsunami", "aurora", "eclipse", "meteor", "comet", "asteroid", "nebula", "galaxy", "constellation", "supernova", "quasar", "canyon", "plateau", "delta", "estuary", "peninsula", "archipelago", "atoll", "fjord", "savanna", "tundra", "mangrove", "coral reef", "geyser", "lagoon", "oasis", "quicksand", "avalanche", "landslide", "drought", "flood", "rocket", "hot air balloon", "spaceship", "sailboat", "hovercraft", "snowmobile", "rickshaw", "tram", "monorail", "gondola", "kayak", "canoe", "catamaran", "ferry", "blimp", "zeppelin", "glider", "hang glider", "paraglider", "skateboard", "scooter", "unicycle", "tricycle", "wheelchair", "ambulance", "fire truck", "bulldozer", "crane", "excavator", "castle", "pyramid", "igloo", "pagoda", "mosque", "cathedral", "amphitheatre", "colosseum", "aqueduct", "treehouse", "windmill", "cottage", "mansion", "skyscraper", "observatory", "planetarium", "aquarium", "museum", "library", "stadium", "arena", "circus tent", "barn", "silo", "greenhouse", "gazebo", "kiosk", "bungalow", "villa", "swimming", "climbing", "juggling", "skateboarding", "surfing", "snowboarding", "parachuting", "scuba diving", "bungee jumping", "rock climbing", "meditation", "yoga", "archery", "fencing", "wrestling", "boxing", "karate", "ballet", "breakdancing", "hula hooping", "fishing", "gardening", "painting", "sculpting", "knitting", "weaving", "pottery", "woodcarving", "origami", "calligraphy", "firefighter", "astronaut", "surgeon", "chef", "detective", "magician", "acrobat", "conductor", "archaeologist", "geologist", "beekeeper", "shepherd", "lumberjack", "blacksmith", "glassblower", "taxidermist", "sommelier", "puppeteer", "falconer", "cartographer", "pillow", "blanket", "curtain", "chandelier", "fireplace", "bathtub", "rocking chair", "bookshelf", "clock", "mirror", "candle", "teapot", "mug", "colander", "whisk", "ladle", "spatula", "tongs", "mortar", "pestle", "soap", "toothbrush", "hairdryer", "iron", "vacuum", "blender", "toaster", "kettle", "microwave", "dishwasher", "sombrero", "beret", "turban", "tiara", "crown", "veil", "monocle", "bowtie", "suspenders", "cufflinks", "kimono", "sari", "kilt", "poncho", "cape", "toga", "tuxedo", "trench coat", "overalls", "jumpsuit", "violin", "cello", "harp", "accordion", "bagpipes", "didgeridoo", "xylophone", "marimba", "tambourine", "castanets", "trombone", "tuba", "flugelhorn", "oboe", "clarinet", "bassoon", "harmonica", "ukulele", "banjo", "sitar", "dragon", "unicorn", "mermaid", "werewolf", "vampire", "wizard", "witch", "goblin", "troll", "fairy", "centaur", "phoenix", "griffin", "kraken", "cyclops", "sphinx", "minotaur", "leprechaun", "genie", "surfboard", "snowboard", "hockey stick", "cricket bat", "polo mallet", "lacrosse stick", "javelin", "discus", "vaulting pole", "boomerang", "badminton racket", "ping pong paddle", "frisbee", "bowling pin", "dumbbell", "kettlebell", "barbell", "punching bag", "balance beam", "pommel horse", "robot", "drone", "satellite", "antenna", "circuit board", "battery", "magnet", "prism", "bunsen burner", "test tube", "petri dish", "centrifuge", "oscilloscope", "spectrometer", "voltmeter", "transistor", "capacitor", "resistor", "solar panel", "wind turbine", "peace", "freedom", "gravity", "time", "silence", "echo", "shadow", "reflection", "balance", "chaos", "infinity", "paradox", "evolution", "revolution", "democracy", "justice", "equality", "courage", "wisdom", "loyalty", "wombat", "quokka", "axolotl", "pangolin", "tapir", "capybara", "narwhal", "manatee", "dugong", "walrus", "puffin", "albatross", "booby", "frigate bird", "secretary bird", "shoebill", "cassowary", "emu", "kiwi", "roadrunner", "mudskipper", "archerfish", "leafy sea dragon", "mantis shrimp", "pistol shrimp", "vampire squid", "bioluminescent jellyfish", "flying fish", "electric eel", "anglerfish", "auto rickshaw", "diya", "rangoli", "tabla", "veena", "kolam", "mehendi", "kurta", "dhol", "shehnai", "mridangam", "tanpura", "sarangi", "jalra", "dholak", "nagara", "pungi", "been", "chai stall", "paan", "lassi", "chaat", "thali", "dosa", "idli", "vada", "sambar", "rasam", "holi", "diwali", "durga puja", "kite festival", "onam", "baisakhi", "pongal", "ganesh chaturthi", "navratri", "eid", "mahal", "haveli", "ghat", "ashram", "mandir", "gurudwara", "dargah", "stepwell", "jharokha", "chhatri", "cotton candy", "caramel apple", "candy floss", "lollipop", "toffee", "fudge", "nougat", "marzipan", "praline", "truffle", "fondue", "raclette", "quiche", "cr\u00eape", "galette", "falafel", "hummus", "tzatziki", "baklava", "halva", "ceviche", "poke bowl", "acai bowl", "smoothie bowl", "granola", "overnight oats", "french toast", "eggs benedict", "shakshuka", "congee", "kaleidoscope", "snow globe", "music box", "cuckoo clock", "grandfather clock", "astrolabe", "sextant", "chronometer", "spinning top", "yo yo", "kite", "slinky", "rubik's cube", "jigsaw puzzle", "domino", "dartboard", "piggy bank", "treasure chest", "lockbox", "safe", "vault", "filing cabinet", "inbox tray", "bulletin board", "chalkboard", "whiteboard", "cherry blossom", "lotus", "magnolia", "hibiscus", "orchid", "poppy", "dahlia", "chrysanthemum", "anthurium", "baobab tree", "banyan tree", "redwood", "bonsai", "cactus", "venus flytrap", "pitcher plant", "sundew", "rafflesia", "corpse flower", "termite mound", "bird's nest", "beehive", "spider web", "burrow", "dam", "anthill", "warren", "den", "lair", "facepalm", "thumbs up", "shrug", "wink", "eyeroll", "double take", "bow", "curtsy", "salute", "namaste", "black hole", "pulsar", "wormhole", "space station", "moon landing", "asteroid belt", "solar flare", "cosmic ray", "thunderstorm", "hailstorm", "sandstorm", "whirlwind", "waterspout", "fog", "smog", "double rainbow", "sundog", "tangled headphones", "empty fridge", "wifi signal", "loading spinner", "battery low", "notification ping", "autocorrect fail", "selfie stick", "power bank", "phone case", "flat tire", "traffic jam", "road rage", "parking ticket", "speed bump", "roundabout", "u turn", "dead end", "shortcut", "detour", "lost luggage", "missed flight", "jet lag", "culture shock", "language barrier", "homesickness", "wanderlust", "bucket list", "souvenir", "postcard", "gymnastics", "acrobatics", "trapeze", "alpaca", "llama", "bison", "moose", "reindeer", "caribou", "yak", "ibex", "otter", "mink", "ferret", "stoat", "weasel", "vole", "shrew", "mole", "macaw", "cockatoo", "lorikeet", "canary", "finch", "sparrow", "robin", "wren", "swallow", "stork", "heron", "egret", "ibis", "kingfisher", "woodpecker", "hoopoe", "hornbill", "sunbird", "starling", "piranha", "barracuda", "tuna", "swordfish", "salamander", "newt", "toad", "gecko", "iguana", "skink", "millipede", "centipede", "earwig", "silverfish", "jackhammer", "forklift", "tractor", "harvester", "plough", "watermill", "sawmill", "printing press", "loom", "spinning wheel", "sewing machine", "easel", "palette", "paintbrush", "charcoal", "pastel", "canvas", "fountain pen", "quill", "inkwell", "scroll", "metronome", "tuning fork", "gramophone", "jukebox", "turntable", "tightrope", "puppet", "marionette", "carousel", "roller coaster", "bumper car", "wok", "tagine", "pressure cooker", "steamer basket", "tandoor", "bread maker", "pasta machine", "ice cream maker", "butter dish", "gravy boat", "piping bag", "cookie cutter", "rolling pin", "pastry brush", "zester", "mandoline", "trampoline", "springboard", "diving board", "hurdle", "croquet", "rowing oar", "luge", "bobsled", "chess piece", "checkers", "backgammon", "billiards", "flying buttress", "gargoyle", "battlement", "portcullis", "drawbridge", "moat", "turret", "keystone", "atrium", "clerestory", "apse", "transept", "nave", "crypt", "retort stand", "burette", "pipette", "distillation", "electroscope", "galvanometer", "ammeter", "solenoid", "spectroscope", "polarimeter", "fascinator", "pillbox hat", "cloche", "fez", "ruff", "pauldron", "gauntlet", "greave", "muff", "stole", "boa", "cravat", "ascot", "mesa", "butte", "drumlin", "sinkhole", "cenote", "stalactite", "stalagmite", "fumarole", "salt flat", "funicular", "cable car", "chairlift", "zipline", "rope bridge", "jetty", "pier", "wharf", "quay", "promenade", "boardwalk", "chaise longue", "daybed", "futon", "tatami", "footstool", "ottoman", "pavlova", "kimchi", "harissa", "chutney", "pickle", "relish", "brigadeiro", "lamington", "sambal", "dukkah", "sumac", "miso", "doenjang", "vegemite", "marmite", "chicha", "treadmill", "elliptical", "gymnastic ring", "rubik cube", "stapler", "hole punch", "shredder", "label maker", "pencil case", "baobab", "banyan", "bird nest", "jack in the box", "top hat", "crepe", "satellite dish", "peace sign", "shadow puppet", "balance scale", "compass rose", "anchor chain", "ship wheel", "sword swallower", "fire breather", "contortionist", "stilt walker", "escape artist", "plate spinner", "knife thrower", "hypnotist", "tightrope walker", "manta ray", "hammerhead", "orca", "pomegranate", "dragonfruit", "lychee", "jackfruit", "rambutan", "durian", "starfruit", "mangosteen", "soursop", "papaya", "guava", "passion fruit", "kumquat", "yuzu", "tamarind", "jujube", "longan", "carambola", "sapodilla", "cherimoya", "lathe", "band saw", "jigsaw", "router", "planer", "jointer", "pile driver", "milling machine", "drill press", "ketchup", "mustard", "mayonnaise", "vinegar", "soy sauce", "worcestershire", "tabasco", "sriracha", "pesto", "tahini", "jambalaya", "gumbo", "chowder", "bisque", "gazpacho", "minestrone", "bouillabaisse", "vichyssoise", "souvlaki", "gyro", "shawarma", "kebab", "satay", "tempura", "teriyaki", "bulgogi", "bibimbap", "banh mi", "injera", "jollof", "couscous", "moussaka", "dolma", "spanakopita", "pierogi", "borscht", "stroganoff", "bretzel", "knish", "blini", "socca", "farinata", "piadina", "flatbread", "windsurfer", "parasailor", "kitesurfer", "wakeboard", "skimboard", "bodyboard", "paddleboard", "outrigger", "trimaran", "hydrofoil", "escalator", "dumbwaiter", "revolving door", "trapdoor", "secret passage", "hidden room", "panic room", "anvil", "bellows", "crucible", "mould", "ingot", "forge", "kiln", "pottery wheel", "glazing", "sandcastle", "snow fort", "lean to", "debris hut", "snow cave", "quinzhee", "bivouac", "hammock tent", "floating cabin", "percolator", "french press", "aeropress", "moka pot", "drip filter", "siphon", "cold brew", "espresso", "lungo", "ristretto", "cappuccino", "macchiato", "affogato", "cortado", "nitro coffee", "cold drip", "turkish coffee", "chai latte", "matcha latte"];

function openScribbleGame(chat,playerList,opts){
  const options=opts||{};
  const list=(playerList||[]).filter(p=>p&&p.name!==undefined);
  const practiceMode=!!options.practice || list.length===0 || !!(chat&&(chat.self||chat.isSelf||chat.id==='self'||chat.id==='practice'));
  const players=[{name:'You',isMe:true},...list.map(p=>({name:p.name||(chat&&chat.name)||'Friend',isMe:false}))];
  if(!practiceMode&&players.length<2)players.push({name:(chat&&chat.name)||'Friend',isMe:false});

  let round=1;const maxRounds=practiceMode?1:3;let currentDrawerIdx=0;let currentWord='';
  let scores={};players.forEach(p=>scores[p.name]=0);
  let roundTimer=practiceMode?120:60;let roundInterval=null;let guessedCorrectly=new Set();
  let strokes=[];let isDrawing=false;let currentColor='#1a1a2e';
  const BRUSH_SIZES=[3,7,14];let currentSize=BRUSH_SIZES[1];
  let canvasW=320;let canvasH=240;
  let aiGuessIv=null;

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:var(--cream);z-index:80;display:flex;flex-direction:column;';
  const begin=typeof beginGameOverlaySession==='function'?beginGameOverlaySession:null;
  const gs=begin?begin({
    type:'scribble',title:practiceMode?'Scribble Practice':'Scribble',mode:practiceMode?'solo':(players.length>2?'group':'1v1'),chat,overlay,
    cleanup(){
      clearInterval(roundInterval);roundInterval=null;
      if(aiGuessIv){clearInterval(aiGuessIv);aiGuessIv=null;}
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
    if(aiGuessIv){clearInterval(aiGuessIv);aiGuessIv=null;}
    if(gs)gs.close(result);else overlay.remove();
  };

  function pickWord(){return SCRIBBLE_WORDS[Math.floor(Math.random()*SCRIBBLE_WORDS.length)];}

  function setupCanvasSurface(canvas){
    if(!canvas)return null;
    if(typeof setupGameCanvas==='function'){
      const res=setupGameCanvas(canvas);
      if(res&&res.ctx){
        canvasW=res.width||canvasW;
        canvasH=res.height||canvasH;
        return res.ctx;
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

  function startRound(){
    if(!alive())return;
    currentWord=pickWord();roundTimer=practiceMode?120:60;guessedCorrectly.clear();strokes=[];
    if(aiGuessIv){clearInterval(aiGuessIv);aiGuessIv=null;}
    const isMyTurn=practiceMode||players[currentDrawerIdx].isMe;
    render();
    clearInterval(roundInterval);
    roundInterval=setInterval(()=>{
      if(!alive()){clearInterval(roundInterval);return;}
      roundTimer--;
      const el=document.getElementById('scribbleTimer');if(el)el.textContent=roundTimer+'s';
      if(roundTimer<=0){clearInterval(roundInterval);if(practiceMode)endScribbleGame();else nextTurn();}
    },1000);
    // Honest loop: never fake AI drawings. When opponent draws, canvas stays blank; AI may guess your art.
    if(isMyTurn&&!practiceMode){
      players.forEach((p,i)=>{
        if(i===currentDrawerIdx||p.isMe)return;
        schedule(()=>{
          if(!alive()||guessedCorrectly.has(p.name)||Math.random()>=0.55)return;
          guessedCorrectly.add(p.name);
          scores[p.name]=(scores[p.name]||0)+Math.max(10,roundTimer);
          scores[players[currentDrawerIdx].name]=(scores[players[currentDrawerIdx].name]||0)+5;
          addScribbleMessage(`${p.name} guessed correctly!`,true);
          if(typeof gameFeedback==='function')gameFeedback('valid');
          renderScoresOnly();
        },4000+Math.random()*28000);
      });
    }
  }

  function renderScoresOnly(){
    const list=document.getElementById('scribbleScoreStrip');
    if(list)list.innerHTML=Object.entries(scores).map(([n,s])=>`<span>${n} ${s}</span>`).join('');
  }

  function nextTurn(){
    if(!alive())return;
    clearInterval(roundInterval);
    if(aiGuessIv){clearInterval(aiGuessIv);aiGuessIv=null;}
    currentDrawerIdx++;
    if(currentDrawerIdx>=players.length){currentDrawerIdx=0;round++;}
    if(round>maxRounds){endScribbleGame();return;}
    startRound();
  }

  function endScribbleGame(){
    clearInterval(roundInterval);roundInterval=null;
    if(aiGuessIv){clearInterval(aiGuessIv);aiGuessIv=null;}
    const sorted=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
    const won=practiceMode||sorted[0]?.[0]==='You';
    if(gs)gs.setOutcome(practiceMode?'complete':(won?'won':'lost'));
    if(typeof recordGameResult==='function')recordGameResult('scribble',won);
    if(typeof gameFeedback==='function')gameFeedback(practiceMode?'complete':(won?'win':'lose'));
    overlay.innerHTML=`
      ${typeof gameChromeHtml==='function'?gameChromeHtml({title:'Scribble',subtitle:practiceMode?'Practice done':'Results',backId:'scribbleClose'}):''}
      ${typeof gameResultHtml==='function'?gameResultHtml({
        glyph:practiceMode?'✓':(won?'✓':'·'),
        title:practiceMode?'Nice practice':`${sorted[0]?.[0]||'Someone'} wins`,
        subtitle:practiceMode
          ?`Word was “${currentWord}” · keep those brush skills sharp`
          :sorted.map(([name,score],i)=>`${i+1}. ${name} · ${score} pts`).join(' · '),
        actions:[{label:'Done',primary:true}],
      }):`<div style="padding:24px;text-align:center;"><div>${practiceMode?'Practice done':sorted[0]?.[0]+' wins!'}</div><button id="scribbleClose">Done</button></div>`}
    `;
    const done=()=>close(practiceMode?'complete':(won?'won':'lost'));
    document.getElementById('scribbleClose')?.addEventListener('click',done);
    overlay.querySelector('[data-result-action]')?.addEventListener('click',done);
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
    renderCanvas();
    if(typeof gameFeedback==='function')gameFeedback('select');
  }

  function render(){
    if(!alive())return;
    const isMyTurn=practiceMode||players[currentDrawerIdx].isMe;
    const blanks=currentWord.replace(/[a-z]/gi,'_');
    overlay.innerHTML=`
      ${gameChromeHtml({title:practiceMode?'Scribble Practice':'Scribble',subtitle:practiceMode?'Solo draw':`Round ${round}/${maxRounds}`,backId:'scribbleBack',rightHtml:`<span id="scribbleTimer" class="game-chrome-metric">${roundTimer}s</span>`})}
      <div class="scribble-prompt${isMyTurn?' scribble-prompt--draw':''}">
        ${isMyTurn
          ?`<div class="scribble-word">Draw: <strong>${currentWord}</strong></div>`
          :`<div class="scribble-word">${players[currentDrawerIdx].name} is drawing</div><div class="scribble-blanks">${blanks}</div><div class="scribble-honest-note">No fake doodles — guess from the blanks</div>`}
        <div id="scribbleScoreStrip" class="scribble-scores">${Object.entries(scores).map(([n,s])=>`<span>${n} ${s}</span>`).join('')}</div>
      </div>
      <div class="scribble-stage">
        <canvas id="scribbleCanvas" class="scribble-canvas" style="cursor:${isMyTurn?'crosshair':'default'};"></canvas>
        ${!isMyTurn?`<div class="scribble-waiting" id="scribbleWaiting">Waiting for drawing…</div>`:''}
      </div>
      ${isMyTurn?`
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
          ${practiceMode?`<button type="button" id="scribbleDonePractice" class="game-tap-target scribble-tool-btn scribble-tool-btn--primary">Done</button>`:''}
        </div>
      </div>`:''}
      ${!practiceMode?`
      <div class="scribble-chat">
        <div id="scribbleChatList" class="scribble-chat-list"></div>
        ${!isMyTurn?`<div class="scribble-guess-row"><input id="scribbleGuessInput" placeholder="Type your guess…" autocomplete="off"><button type="button" id="scribbleGuessBtn" class="game-tap-target">Guess</button></div>`:''}
      </div>`:''}
    `;
    document.getElementById('scribbleBack').addEventListener('click',()=>close());
    wireCanvas();
    if(!isMyTurn&&!practiceMode){
      document.getElementById('scribbleGuessBtn')?.addEventListener('click',submitGuess);
      document.getElementById('scribbleGuessInput')?.addEventListener('keypress',e=>{if(e.key==='Enter')submitGuess();});
    } else if(isMyTurn){
      overlay.querySelectorAll('[data-color]').forEach(btn=>btn.addEventListener('click',()=>{currentColor=btn.dataset.color;overlay.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('is-active',b.dataset.color===currentColor));}));
      overlay.querySelectorAll('[data-size]').forEach(btn=>btn.addEventListener('click',()=>{currentSize=+btn.dataset.size;overlay.querySelectorAll('[data-size]').forEach(b=>b.classList.toggle('is-active',+b.dataset.size===currentSize));}));
      document.getElementById('scribbleClear')?.addEventListener('click',()=>{strokes=[];renderCanvas();});
      document.getElementById('scribbleUndo')?.addEventListener('click',undoStroke);
      document.getElementById('scribbleDonePractice')?.addEventListener('click',()=>endScribbleGame());
    }
  }

  function submitGuess(){
    const inp=document.getElementById('scribbleGuessInput');
    if(!inp)return;
    const val=inp.value.trim().toLowerCase();if(!val)return;
    addScribbleMessage(`You: ${val}`);
    if(val===currentWord.toLowerCase()&&!guessedCorrectly.has('You')){
      guessedCorrectly.add('You');
      scores['You']=(scores['You']||0)+Math.max(10,roundTimer);
      scores[players[currentDrawerIdx].name]=(scores[players[currentDrawerIdx].name]||0)+5;
      addScribbleMessage('You guessed correctly!',true);
      if(typeof gameFeedback==='function')gameFeedback('complete');
      if(typeof showToast==='function')showToast('Correct! +'+Math.max(10,roundTimer)+' points');
      renderScoresOnly();
    } else if(typeof gameFeedback==='function'){
      gameFeedback('invalid');
    }
    inp.value='';
  }

  function wireCanvas(){
    const canvas=document.getElementById('scribbleCanvas');if(!canvas)return;
    setupCanvasSurface(canvas);
    renderCanvas();
    if(!(practiceMode||players[currentDrawerIdx].isMe))return;
    const getPos=e=>{
      const rect=canvas.getBoundingClientRect();
      const cx=(e.touches?e.touches[0].clientX:e.clientX)-rect.left;
      const cy=(e.touches?e.touches[0].clientY:e.clientY)-rect.top;
      return{x:cx*(canvasW/rect.width),y:cy*(canvasH/rect.height)};
    };
    const start=e=>{e.preventDefault();isDrawing=true;const p=getPos(e);strokes.push({x:p.x,y:p.y,color:currentColor,size:currentSize,newStroke:true});};
    const move=e=>{if(!isDrawing)return;e.preventDefault();const p=getPos(e);strokes.push({x:p.x,y:p.y,color:currentColor,size:currentSize,newStroke:false});renderCanvas();};
    const end=()=>{isDrawing=false;};
    canvas.addEventListener('mousedown',start);canvas.addEventListener('mousemove',move);canvas.addEventListener('mouseup',end);canvas.addEventListener('mouseleave',end);
    canvas.addEventListener('touchstart',start,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});canvas.addEventListener('touchend',end);
  }

  function renderCanvas(){
    const canvas=document.getElementById('scribbleCanvas');if(!canvas)return;
    let ctx=canvas.getContext('2d');
    if(!canvas.width){ctx=setupCanvasSurface(canvas)||ctx;}
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.restore();
    const dpr=canvas.width/Math.max(1,canvasW);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvasW,canvasH);
    ctx.lineCap='round';ctx.lineJoin='round';
    let lastX=null,lastY=null;
    strokes.forEach(s=>{
      if(s.newStroke||lastX===null){lastX=s.x;lastY=s.y;return;}
      ctx.strokeStyle=s.color;ctx.lineWidth=s.size;
      ctx.beginPath();ctx.moveTo(lastX,lastY);ctx.lineTo(s.x,s.y);ctx.stroke();
      lastX=s.x;lastY=s.y;
    });
  }

  startRound();
}


// ===================== GROUP GAME SETUP — PLAYER SELECTOR =====================
function openGroupGameSetup(groupChat, gameId){
  // groupChat.members should be an array of {name, uid, avatar}
  const members=(groupChat.members||[{name:'Player 2',avatar:'👤'},{name:'Player 3',avatar:'👤'},{name:'Player 4',avatar:'👤'}]);
  const multiGames={
    ludo:{name:'🎯 Ludo',min:2,max:4},
    scribble:{name:'🎨 Scribble',min:2,max:10},
    business:{name:'🏙️ Business',min:2,max:6},
    uno:{name:'🃏 Oh, No! Cards',min:2,max:6},
  };
  const cfg=multiGames[gameId];
  let selectedPlayers=new Set(['You']);

  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;inset:0;background:var(--cream);z-index:100;display:flex;flex-direction:column;';
  
  function render(){
    sheet.innerHTML=`
      <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--white);border-bottom:1px solid var(--line);flex-shrink:0;">
        <button id="groupGameBack" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
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
            <div style="flex:1;"><div style="font-weight:700;">${m.name}</div><div style="font-size:11px;color:var(--muted);">Tap to ${sel?'remove':'add'}</div></div>
            <div style="width:24px;height:24px;border-radius:50%;background:${sel?'var(--game-accent,var(--red))':'var(--line)'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;">${sel?'✓':''}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="padding:14px 16px;background:var(--white);border-top:1px solid var(--line);">
        <div style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:10px;">${selectedPlayers.size+1} player${selectedPlayers.size>0?'s':''} selected · AI fills remaining slots</div>
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
      const playerList=[{name:'You',isMe:true},...[...selectedPlayers].map(n=>{const m=members.find(x=>x.name===n);return{name:n,avatar:m?.avatar||'👤',isMe:false};})];
      const playerCount=playerList.length;
      const fakeChat={name:playerList[1]?.name||'Opponent',id:'group_game'};
      if(gameId==='ludo')openLudoGame(fakeChat,playerCount);
      else if(gameId==='scribble')openScribbleGame(fakeChat,playerList.slice(1));
      else if(gameId==='business')openBusinessGame(fakeChat,playerCount);
      else if(gameId==='uno')openUnoVariantPicker(fakeChat);
    });
  }
  document.querySelector('.device').appendChild(sheet);
  render();
}

// openGamePicker is provided by game-registry.js

// --- Game registry self-registration (board-games.js) ---
if (typeof registerGame === 'function') {
  registerGame({
    id: 'fiveinrow',
    name: 'Five in a Row',
    desc: 'Gomoku — connect 5',
    icon: '🔵',
    ratingKey: 'fiveinrow',
    gameType: 'dual',
    chat1v1: true,
    selfChat: true,
    order: 70,
    launch(ctx) { openFiveInRowGame(ctx.chat); },
  });
  registerGame({
    id: 'business',
    name: 'Business',
    desc: 'Buy, build & bankrupt — 2-6 players',
    icon: '🏙️',
    ratingKey: 'business',
    gameType: 'multiplayer',
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
    desc: 'Draw & guess — any number of players',
    icon: '🎨',
    ratingKey: 'scribble',
    gameType: 'multiplayer',
    chat1v1: true,
    chatGroup: true,
    selfChat: true,
    order: 90,
    launch(ctx) {
      if (ctx.isGroup) openGroupGameSetup(ctx.chat, 'scribble');
      else if (ctx.isSelf || ctx.source === 'solo' || ctx.source === 'practice') openScribbleGame(ctx.chat || { name: 'Practice', id: 'practice' }, [], { practice: true });
      else openScribbleGame(ctx.chat, [{ name: ctx.chat?.name || 'Friend' }]);
    },
  });
}
