// ===================== FIVE IN A ROW (Gomoku) =====================
function openFiveInRowGame(chat){
  const SIZE=13;
  let board=Array(SIZE).fill(null).map(()=>Array(SIZE).fill(null));
  let myTurn=true;let gameOver=false;let winLine=null;
  const FIR_SECS=15;let firTimer=FIR_SECS;let firInterval=null;

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
  const alive=()=>gs?gs.alive():true;
  const schedule=(fn,ms)=>gs?gs.schedule(fn,ms):setTimeout(fn,ms);
  const close=()=>{if(gs)gs.close();else{stopFirTimer();overlay.remove();}};

  function startFirTimer(){
    clearInterval(firInterval);firTimer=FIR_SECS;
    firInterval=setInterval(()=>{
      if(!alive()){clearInterval(firInterval);return;}
      firTimer--;
      const el=document.getElementById('firTimerEl');
      if(el){el.textContent=firTimer+'s';el.style.color=firTimer<=5?'#E74C3C':'rgba(255,255,255,0.5)';}
      if(firTimer<=0){
        clearInterval(firInterval);
        if(!myTurn||gameOver)return;
        const empty=[];for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(!board[r][c])empty.push([r,c]);
        if(empty.length){const[r,c]=empty[Math.floor(Math.random()*empty.length)];playMove(r,c,'me');}
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
    if(typeof gameFeedback==='function')gameFeedback(who==='me'?'place':'move');
    const win=checkFiveWin(r,c,sym);
    if(win){
      gameOver=true;winLine=win;stopFirTimer();
      if(gs)gs.setOutcome(who==='me'?'won':'lost');
      if(typeof recordGameResult==='function')recordGameResult('fiveinrow',who==='me');
      render();return;
    }
    if(board.every(row=>row.every(Boolean))){
      gameOver=true;stopFirTimer();
      if(gs)gs.setOutcome('draw');
      if(typeof recordGameResult==='function')recordGameResult('fiveinrow',false,true);
      render();return;
    }
    myTurn=who!=='me';
    if(myTurn)startFirTimer();else stopFirTimer();
    render();
    if(!myTurn&&!gameOver)schedule(()=>{if(!alive())return;const[ar,ac]=getAIMoveFIR();playMove(ar,ac,'opp');},700);
  }

  function render(){
    if(!alive())return;
    overlay.innerHTML=`
      ${gameChromeHtml({title:'Five in a Row',backId:'firBack'})}
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;flex-shrink:0;">
        <div style="color:#E74C3C;font-size:13px;font-weight:700;">● You (Black)</div>
        ${!gameOver?`<span id="firTimerEl" style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;color:rgba(255,255,255,0.5);">${firTimer}s</span>`:''}
        <div style="color:#3498DB;font-size:13px;font-weight:700;">○ ${chat.name} (White)</div>
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:8px;overflow:auto;">
        <div id="firBoard" style="display:grid;grid-template-columns:repeat(${SIZE},1fr);gap:1px;background:#3a2817;padding:4px;border-radius:var(--game-board-radius,8px);width:min(360px,94vw);aspect-ratio:1;" role="grid" aria-label="Five in a Row board"></div>
      </div>
      ${typeof gameTurnBannerHtml==='function'
        ? gameTurnBannerHtml({
            mode: gameOver?'over':myTurn?'yours':'theirs',
            label: gameOver?(winLine?(board[winLine[0][0]][winLine[0][1]]==='X'?'You won!':chat.name+' won!'):"It's a draw!"):(myTurn?'Your turn':chat.name+' thinking…'),
            pulse: !gameOver && myTurn,
          })
        : `<div style="padding:10px 16px;text-align:center;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;color:${gameOver?'var(--gold)':'#fff'};flex-shrink:0;">${gameOver?(winLine?(board[winLine[0][0]][winLine[0][1]]==='X'?'🎉 You won!':chat.name+' won!'):"It's a draw!"):(myTurn?'Your turn':chat.name+' thinking...')}</div>`}
    `;
    document.getElementById('firBack').addEventListener('click',()=>close());
    const boardEl=document.getElementById('firBoard');
    const winSet=new Set((winLine||[]).map(([r,c])=>r+'_'+c));
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      const sq=document.createElement('div');
      const isWin=winSet.has(r+'_'+c);
      sq.style.cssText=`aspect-ratio:1;background:${isWin?'rgba(255,201,60,0.3)':'#D4A574'};display:flex;align-items:center;justify-content:center;cursor:${!board[r][c]&&myTurn&&!gameOver?'pointer':'default'};`;
      if(board[r][c]){
        const dot=document.createElement('div');
        dot.style.cssText=`width:72%;height:72%;border-radius:50%;background:${board[r][c]==='X'?'#1a1a2e':'#fff'};box-shadow:0 1px 3px rgba(0,0,0,0.4);`;
        sq.appendChild(dot);
      }
      if(!board[r][c]&&myTurn&&!gameOver)sq.addEventListener('click',()=>{stopFirTimer();playMove(r,c,'me');});
      boardEl.appendChild(sq);
    }
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
  const alive=()=>gs?gs.alive():true;
  const schedule=(fn,ms)=>gs?gs.schedule(fn,ms):setTimeout(fn,ms);
  const close=()=>{if(gs)gs.close();else{stopBusTimer();if(diceIv)clearInterval(diceIv);overlay.remove();}};

  function startBusTimer(){
    if(currentPlayer!==0||!alive())return;
    clearInterval(busInterval);busTimer=BUS_SECS;
    busInterval=setInterval(()=>{
      if(!alive()){clearInterval(busInterval);return;}
      busTimer--;
      const el=document.getElementById('busTimerEl');
      if(el)el.textContent=busTimer+'s';
      if(busTimer<=0){clearInterval(busInterval);if(!rolling&&!gameOver)rollBusDice();}
    },1000);
  }
  function stopBusTimer(){clearInterval(busInterval);busInterval=null;}

  function rollBusDice(){
    if(!alive()||rolling||gameOver)return;
    stopBusTimer();rolling=true;let ticks=0;
    if(diceIv)clearInterval(diceIv);
    diceIv=setInterval(()=>{
      if(!alive()){clearInterval(diceIv);diceIv=null;return;}
      diceVal=[Math.floor(Math.random()*6)+1,Math.floor(Math.random()*6)+1];render();ticks++;
      if(ticks>8){clearInterval(diceIv);diceIv=null;rolling=false;movePlayerToken(diceVal[0]+diceVal[1]);}
    },80);
  }

  function movePlayerToken(steps){
    const p=players[currentPlayer];
    p.pos=(p.pos+steps)%BOARD.length;
    const tile=BOARD[p.pos];
    message='';
    if(tile.type==='go'){p.money+=2000;message='Passed Start! +₹2000';}
    else if(tile.type==='tax'){p.money-=tile.amount;message=`Paid ₹${tile.amount} tax`;}
    else if(tile.type==='gotojail'){p.pos=10;p.jailed=2;message='Sent to Jail! 🚔';}
    else if(tile.type==='chance'||tile.type==='chest'){
      const events=[{m:'Bonus payout!',amt:500},{m:'Repair bill',amt:-300},{m:'Lottery win!',amt:1000},{m:'Fine for jaywalking',amt:-150}];
      const e=events[Math.floor(Math.random()*events.length)];p.money+=e.amt;message=`${e.m} ${e.amt>0?'+':''}₹${e.amt}`;
    }
    else if(tile.type==='property'||tile.type==='railway'||tile.type==='utility'){
      const owner=players.find(pl=>pl.properties.includes(p.pos));
      if(owner&&owner!==p){
        const rent=tile.type==='property'?tile.rent[0]:tile.type==='railway'?500:200;
        p.money-=rent;owner.money+=rent;message=`Paid ₹${rent} rent to ${owner.name}`;
      } else if(!owner&&currentPlayer===0){
        // Will show buy prompt for human player
      }
    }
    render();
    if(tile.type==='property'&&!players.find(pl=>pl.properties.includes(p.pos))&&p.money>=tile.price){
      showBuyPrompt(tile,p);
    } else {
      endBusTurn();
    }
  }

  function showBuyPrompt(tile,player){
    if(currentPlayer!==0){
      // AI auto-buys if affordable
      if(Math.random()<0.7&&player.money>=tile.price){player.money-=tile.price;player.properties.push(player.pos);message=`${player.name} bought ${tile.name}!`;}
      render();endBusTurn();return;
    }
    const overlay2=document.createElement('div');
    overlay2.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,0.6);z-index:90;display:flex;align-items:center;justify-content:center;';
    overlay2.innerHTML=`<div style="background:var(--white);border-radius:20px;padding:24px;max-width:300px;text-align:center;">
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:8px;">${tile.name}</div>
      <div style="color:var(--muted);font-size:13px;margin-bottom:16px;">Buy for ₹${tile.price}?</div>
      <div style="display:flex;gap:8px;">
        <button id="busBuyYes" style="flex:1;padding:12px;background:var(--red);color:#fff;border:none;border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;cursor:pointer;">Buy</button>
        <button id="busBuyNo" style="flex:1;padding:12px;background:var(--cream);border:2px solid var(--line);border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;cursor:pointer;">Skip</button>
      </div>
    </div>`;
    document.querySelector('.device').appendChild(overlay2);
    document.getElementById('busBuyYes').addEventListener('click',()=>{player.money-=tile.price;player.properties.push(player.pos);overlay2.remove();render();endBusTurn();});
    document.getElementById('busBuyNo').addEventListener('click',()=>{overlay2.remove();endBusTurn();});
  }

  function endBusTurn(){
    if(!alive())return;
    const p=players[currentPlayer];
    if(p.money<0){p.bankrupt=true;message=`${p.name} went bankrupt! 💸`;}
    const active=players.filter(pl=>!pl.bankrupt);
    if(active.length===1){
      gameOver=true;
      const won=active[0].name==='You';
      if(gs)gs.setOutcome(won?'won':'lost');
      if(typeof recordGameResult==='function')recordGameResult('business',won);
      render();return;
    }
    do{currentPlayer=(currentPlayer+1)%playerCount;}while(players[currentPlayer].bankrupt);
    render();
    if(currentPlayer===0)startBusTimer();
    else schedule(rollBusDice,900);
  }

  function getTilePos(idx){
    const perSide=Math.ceil(BOARD.length/4);
    if(idx<perSide)return{side:'bottom',i:perSide-idx};
    if(idx<perSide*2)return{side:'left',i:idx-perSide};
    if(idx<perSide*3)return{side:'top',i:idx-perSide*2};
    return{side:'right',i:idx-perSide*3};
  }

  function render(){
    if(!alive())return;
    overlay.innerHTML=`
      ${gameChromeHtml({title:'Business',backId:'busBack',rightHtml:currentPlayer===0&&!gameOver?`<span id="busTimerEl" class="game-chrome-metric">${busTimer}s</span>`:undefined})}
      <div style="display:flex;gap:6px;padding:8px 10px;overflow-x:auto;flex-shrink:0;">
        ${players.map((p,i)=>`<div style="flex:1;min-width:70px;background:${currentPlayer===i?p.color+'33':'rgba(255,255,255,0.05)'};border:2px solid ${currentPlayer===i?p.color:'transparent'};border-radius:10px;padding:6px;text-align:center;opacity:${p.bankrupt?0.3:1};"><div style="color:${p.color};font-size:10px;font-weight:700;">${p.name}</div><div style="font-size:11px;color:#fff;font-weight:700;">₹${p.money}</div><div style="font-size:9px;color:rgba(255,255,255,0.4);">${p.properties.length} props</div></div>`).join('')}
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:8px;">
        <div style="position:relative;width:min(340px,90vw);aspect-ratio:1;background:#2C3E50;border-radius:8px;">
          <div style="position:absolute;inset:30%;background:#1a1a2e;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;">
            <div style="font-size:24px;">🎲${diceVal[0]} 🎲${diceVal[1]}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.5);text-align:center;padding:0 8px;">${message||'Tap roll to play'}</div>
          </div>
          ${BOARD.map((tile,idx)=>{
            const pos=getTilePos(idx);const pct=(pos.i/Math.ceil(BOARD.length/4))*100;
            const style=pos.side==='bottom'?`bottom:0;left:${pct}%;width:9%;height:13%;`:pos.side==='left'?`left:0;bottom:${pct}%;width:13%;height:9%;`:pos.side==='top'?`top:0;left:${100-pct}%;width:9%;height:13%;`:`right:0;top:${pct}%;width:13%;height:9%;`;
            const owner=players.find(pl=>pl.properties.includes(idx));
            const tokensHere=players.filter(pl=>pl.pos===idx&&!pl.bankrupt);
            return`<div style="position:absolute;${style}background:${tile.color||'#34495e'};border:1px solid rgba(255,255,255,0.1);font-size:5px;color:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center;text-align:center;${owner?`box-shadow:inset 0 0 0 2px ${owner.color};`:''}">${tokensHere.map(t=>`<span style="font-size:7px;">●</span>`).join('')}</div>`;
          }).join('')}
        </div>
      </div>
      <div style="padding:10px 16px;flex-shrink:0;">
        <button id="busRollBtn" style="width:100%;padding:13px;background:${currentPlayer===0&&!rolling&&!gameOver?'var(--red)':'rgba(255,255,255,0.1)'};color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:${currentPlayer===0&&!gameOver?'pointer':'default'};">
          ${gameOver?(players.find(p=>!p.bankrupt)?.name+' wins! 🏆'):currentPlayer===0?'🎲 Roll Dice':players[currentPlayer].name+' playing...'}
        </button>
      </div>
    `;
    document.getElementById('busBack').addEventListener('click',()=>close());
    document.getElementById('busRollBtn').addEventListener('click',()=>{if(currentPlayer===0&&!rolling&&!gameOver)rollBusDice();});
  }
  render();startBusTimer();
}

// ===================== SCRIBBLE (draw & guess) =====================
const SCRIBBLE_WORDS=["elephant", "dolphin", "penguin", "butterfly", "jellyfish", "crocodile", "flamingo", "kangaroo", "cheetah", "gorilla", "giraffe", "porcupine", "chameleon", "octopus", "seahorse", "platypus", "armadillo", "orangutan", "chimpanzee", "rhinoceros", "hippopotamus", "peacock", "pelican", "toucan", "parrot", "cobra", "python", "eagle", "falcon", "owl", "whale", "shark", "starfish", "lobster", "crab", "scorpion", "tarantula", "dragonfly", "firefly", "squirrel", "hedgehog", "beaver", "badger", "raccoon", "skunk", "meerkat", "lemur", "sloth", "anteater", "guitar", "telescope", "umbrella", "bicycle", "lighthouse", "helicopter", "submarine", "microscope", "compass", "thermometer", "calculator", "binoculars", "periscope", "sundial", "hourglass", "protractor", "abacus", "typewriter", "lantern", "canteen", "hammock", "backpack", "suitcase", "parachute", "magnifying glass", "flashlight", "walkie talkie", "megaphone", "trophy", "diploma", "passport", "anchor", "stethoscope", "scissors", "screwdriver", "wrench", "pliers", "saw", "drill", "hammer", "chisel", "level", "ruler", "tape measure", "pizza", "sunflower", "watermelon", "pineapple", "strawberry", "broccoli", "avocado", "croissant", "pretzel", "sushi", "dumpling", "burrito", "taco", "waffle", "pancake", "macaron", "cheesecake", "tiramisu", "baguette", "donut", "bagel", "muffin", "cupcake", "brownie", "\u00e9clair", "meringue", "sorbet", "pudding", "lasagna", "paella", "risotto", "ramen", "pho", "biryani", "curry", "samosa", "chapati", "naan", "mountain", "rainbow", "waterfall", "volcano", "glacier", "tornado", "blizzard", "hurricane", "earthquake", "tsunami", "aurora", "eclipse", "meteor", "comet", "asteroid", "nebula", "galaxy", "constellation", "supernova", "quasar", "canyon", "plateau", "delta", "estuary", "peninsula", "archipelago", "atoll", "fjord", "savanna", "tundra", "mangrove", "coral reef", "geyser", "lagoon", "oasis", "quicksand", "avalanche", "landslide", "drought", "flood", "rocket", "hot air balloon", "spaceship", "sailboat", "hovercraft", "snowmobile", "rickshaw", "tram", "monorail", "gondola", "kayak", "canoe", "catamaran", "ferry", "blimp", "zeppelin", "glider", "hang glider", "paraglider", "skateboard", "scooter", "unicycle", "tricycle", "wheelchair", "ambulance", "fire truck", "bulldozer", "crane", "excavator", "castle", "pyramid", "igloo", "pagoda", "mosque", "cathedral", "amphitheatre", "colosseum", "aqueduct", "treehouse", "windmill", "cottage", "mansion", "skyscraper", "observatory", "planetarium", "aquarium", "museum", "library", "stadium", "arena", "circus tent", "barn", "silo", "greenhouse", "gazebo", "kiosk", "bungalow", "villa", "swimming", "climbing", "juggling", "skateboarding", "surfing", "snowboarding", "parachuting", "scuba diving", "bungee jumping", "rock climbing", "meditation", "yoga", "archery", "fencing", "wrestling", "boxing", "karate", "ballet", "breakdancing", "hula hooping", "fishing", "gardening", "painting", "sculpting", "knitting", "weaving", "pottery", "woodcarving", "origami", "calligraphy", "firefighter", "astronaut", "surgeon", "chef", "detective", "magician", "acrobat", "conductor", "archaeologist", "geologist", "beekeeper", "shepherd", "lumberjack", "blacksmith", "glassblower", "taxidermist", "sommelier", "puppeteer", "falconer", "cartographer", "pillow", "blanket", "curtain", "chandelier", "fireplace", "bathtub", "rocking chair", "bookshelf", "clock", "mirror", "candle", "teapot", "mug", "colander", "whisk", "ladle", "spatula", "tongs", "mortar", "pestle", "soap", "toothbrush", "hairdryer", "iron", "vacuum", "blender", "toaster", "kettle", "microwave", "dishwasher", "sombrero", "beret", "turban", "tiara", "crown", "veil", "monocle", "bowtie", "suspenders", "cufflinks", "kimono", "sari", "kilt", "poncho", "cape", "toga", "tuxedo", "trench coat", "overalls", "jumpsuit", "violin", "cello", "harp", "accordion", "bagpipes", "didgeridoo", "xylophone", "marimba", "tambourine", "castanets", "trombone", "tuba", "flugelhorn", "oboe", "clarinet", "bassoon", "harmonica", "ukulele", "banjo", "sitar", "dragon", "unicorn", "mermaid", "werewolf", "vampire", "wizard", "witch", "goblin", "troll", "fairy", "centaur", "phoenix", "griffin", "kraken", "cyclops", "sphinx", "minotaur", "leprechaun", "genie", "surfboard", "snowboard", "hockey stick", "cricket bat", "polo mallet", "lacrosse stick", "javelin", "discus", "vaulting pole", "boomerang", "badminton racket", "ping pong paddle", "frisbee", "bowling pin", "dumbbell", "kettlebell", "barbell", "punching bag", "balance beam", "pommel horse", "robot", "drone", "satellite", "antenna", "circuit board", "battery", "magnet", "prism", "bunsen burner", "test tube", "petri dish", "centrifuge", "oscilloscope", "spectrometer", "voltmeter", "transistor", "capacitor", "resistor", "solar panel", "wind turbine", "peace", "freedom", "gravity", "time", "silence", "echo", "shadow", "reflection", "balance", "chaos", "infinity", "paradox", "evolution", "revolution", "democracy", "justice", "equality", "courage", "wisdom", "loyalty", "wombat", "quokka", "axolotl", "pangolin", "tapir", "capybara", "narwhal", "manatee", "dugong", "walrus", "puffin", "albatross", "booby", "frigate bird", "secretary bird", "shoebill", "cassowary", "emu", "kiwi", "roadrunner", "mudskipper", "archerfish", "leafy sea dragon", "mantis shrimp", "pistol shrimp", "vampire squid", "bioluminescent jellyfish", "flying fish", "electric eel", "anglerfish", "auto rickshaw", "diya", "rangoli", "tabla", "veena", "kolam", "mehendi", "kurta", "dhol", "shehnai", "mridangam", "tanpura", "sarangi", "jalra", "dholak", "nagara", "pungi", "been", "chai stall", "paan", "lassi", "chaat", "thali", "dosa", "idli", "vada", "sambar", "rasam", "holi", "diwali", "durga puja", "kite festival", "onam", "baisakhi", "pongal", "ganesh chaturthi", "navratri", "eid", "mahal", "haveli", "ghat", "ashram", "mandir", "gurudwara", "dargah", "stepwell", "jharokha", "chhatri", "cotton candy", "caramel apple", "candy floss", "lollipop", "toffee", "fudge", "nougat", "marzipan", "praline", "truffle", "fondue", "raclette", "quiche", "cr\u00eape", "galette", "falafel", "hummus", "tzatziki", "baklava", "halva", "ceviche", "poke bowl", "acai bowl", "smoothie bowl", "granola", "overnight oats", "french toast", "eggs benedict", "shakshuka", "congee", "kaleidoscope", "snow globe", "music box", "cuckoo clock", "grandfather clock", "astrolabe", "sextant", "chronometer", "spinning top", "yo yo", "kite", "slinky", "rubik's cube", "jigsaw puzzle", "domino", "dartboard", "piggy bank", "treasure chest", "lockbox", "safe", "vault", "filing cabinet", "inbox tray", "bulletin board", "chalkboard", "whiteboard", "cherry blossom", "lotus", "magnolia", "hibiscus", "orchid", "poppy", "dahlia", "chrysanthemum", "anthurium", "baobab tree", "banyan tree", "redwood", "bonsai", "cactus", "venus flytrap", "pitcher plant", "sundew", "rafflesia", "corpse flower", "termite mound", "bird's nest", "beehive", "spider web", "burrow", "dam", "anthill", "warren", "den", "lair", "facepalm", "thumbs up", "shrug", "wink", "eyeroll", "double take", "bow", "curtsy", "salute", "namaste", "black hole", "pulsar", "wormhole", "space station", "moon landing", "asteroid belt", "solar flare", "cosmic ray", "thunderstorm", "hailstorm", "sandstorm", "whirlwind", "waterspout", "fog", "smog", "double rainbow", "sundog", "tangled headphones", "empty fridge", "wifi signal", "loading spinner", "battery low", "notification ping", "autocorrect fail", "selfie stick", "power bank", "phone case", "flat tire", "traffic jam", "road rage", "parking ticket", "speed bump", "roundabout", "u turn", "dead end", "shortcut", "detour", "lost luggage", "missed flight", "jet lag", "culture shock", "language barrier", "homesickness", "wanderlust", "bucket list", "souvenir", "postcard", "gymnastics", "acrobatics", "trapeze", "alpaca", "llama", "bison", "moose", "reindeer", "caribou", "yak", "ibex", "otter", "mink", "ferret", "stoat", "weasel", "vole", "shrew", "mole", "macaw", "cockatoo", "lorikeet", "canary", "finch", "sparrow", "robin", "wren", "swallow", "stork", "heron", "egret", "ibis", "kingfisher", "woodpecker", "hoopoe", "hornbill", "sunbird", "starling", "piranha", "barracuda", "tuna", "swordfish", "salamander", "newt", "toad", "gecko", "iguana", "skink", "millipede", "centipede", "earwig", "silverfish", "jackhammer", "forklift", "tractor", "harvester", "plough", "watermill", "sawmill", "printing press", "loom", "spinning wheel", "sewing machine", "easel", "palette", "paintbrush", "charcoal", "pastel", "canvas", "fountain pen", "quill", "inkwell", "scroll", "metronome", "tuning fork", "gramophone", "jukebox", "turntable", "tightrope", "puppet", "marionette", "carousel", "roller coaster", "bumper car", "wok", "tagine", "pressure cooker", "steamer basket", "tandoor", "bread maker", "pasta machine", "ice cream maker", "butter dish", "gravy boat", "piping bag", "cookie cutter", "rolling pin", "pastry brush", "zester", "mandoline", "trampoline", "springboard", "diving board", "hurdle", "croquet", "rowing oar", "luge", "bobsled", "chess piece", "checkers", "backgammon", "billiards", "flying buttress", "gargoyle", "battlement", "portcullis", "drawbridge", "moat", "turret", "keystone", "atrium", "clerestory", "apse", "transept", "nave", "crypt", "retort stand", "burette", "pipette", "distillation", "electroscope", "galvanometer", "ammeter", "solenoid", "spectroscope", "polarimeter", "fascinator", "pillbox hat", "cloche", "fez", "ruff", "pauldron", "gauntlet", "greave", "muff", "stole", "boa", "cravat", "ascot", "mesa", "butte", "drumlin", "sinkhole", "cenote", "stalactite", "stalagmite", "fumarole", "salt flat", "funicular", "cable car", "chairlift", "zipline", "rope bridge", "jetty", "pier", "wharf", "quay", "promenade", "boardwalk", "chaise longue", "daybed", "futon", "tatami", "footstool", "ottoman", "pavlova", "kimchi", "harissa", "chutney", "pickle", "relish", "brigadeiro", "lamington", "sambal", "dukkah", "sumac", "miso", "doenjang", "vegemite", "marmite", "chicha", "treadmill", "elliptical", "gymnastic ring", "rubik cube", "stapler", "hole punch", "shredder", "label maker", "pencil case", "baobab", "banyan", "bird nest", "jack in the box", "top hat", "crepe", "satellite dish", "peace sign", "shadow puppet", "balance scale", "compass rose", "anchor chain", "ship wheel", "sword swallower", "fire breather", "contortionist", "stilt walker", "escape artist", "plate spinner", "knife thrower", "hypnotist", "tightrope walker", "manta ray", "hammerhead", "orca", "pomegranate", "dragonfruit", "lychee", "jackfruit", "rambutan", "durian", "starfruit", "mangosteen", "soursop", "papaya", "guava", "passion fruit", "kumquat", "yuzu", "tamarind", "jujube", "longan", "carambola", "sapodilla", "cherimoya", "lathe", "band saw", "jigsaw", "router", "planer", "jointer", "pile driver", "milling machine", "drill press", "ketchup", "mustard", "mayonnaise", "vinegar", "soy sauce", "worcestershire", "tabasco", "sriracha", "pesto", "tahini", "jambalaya", "gumbo", "chowder", "bisque", "gazpacho", "minestrone", "bouillabaisse", "vichyssoise", "souvlaki", "gyro", "shawarma", "kebab", "satay", "tempura", "teriyaki", "bulgogi", "bibimbap", "banh mi", "injera", "jollof", "couscous", "moussaka", "dolma", "spanakopita", "pierogi", "borscht", "stroganoff", "bretzel", "knish", "blini", "socca", "farinata", "piadina", "flatbread", "windsurfer", "parasailor", "kitesurfer", "wakeboard", "skimboard", "bodyboard", "paddleboard", "outrigger", "trimaran", "hydrofoil", "escalator", "dumbwaiter", "revolving door", "trapdoor", "secret passage", "hidden room", "panic room", "anvil", "bellows", "crucible", "mould", "ingot", "forge", "kiln", "pottery wheel", "glazing", "sandcastle", "snow fort", "lean to", "debris hut", "snow cave", "quinzhee", "bivouac", "hammock tent", "floating cabin", "percolator", "french press", "aeropress", "moka pot", "drip filter", "siphon", "cold brew", "espresso", "lungo", "ristretto", "cappuccino", "macchiato", "affogato", "cortado", "nitro coffee", "cold drip", "turkish coffee", "chai latte", "matcha latte"];

function openScribbleGame(chat,playerList){
  // playerList: array of {name} objects, supports any number including just chat partner for 1:1
  const players=[{name:'You',isMe:true},...playerList.filter(p=>p.name!==undefined).map(p=>({name:p.name||chat.name,isMe:false}))];
  if(players.length<2)players.push({name:chat.name,isMe:false});

  let round=1;const maxRounds=3;let currentDrawerIdx=0;let currentWord='';
  let scores={};players.forEach(p=>scores[p.name]=0);
  let roundTimer=60;let roundInterval=null;let guessedCorrectly=new Set();
  let strokes=[];let isDrawing=false;let currentColor='#1a1a2e';let currentSize=4;
  let aiDrawIv=null;

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:var(--cream);z-index:80;display:flex;flex-direction:column;';
  const begin=typeof beginGameOverlaySession==='function'?beginGameOverlaySession:null;
  const gs=begin?begin({
    type:'scribble',title:'Scribble',mode:players.length>2?'group':'1v1',chat,overlay,
    cleanup(){
      clearInterval(roundInterval);roundInterval=null;
      if(aiDrawIv){clearInterval(aiDrawIv);aiDrawIv=null;}
    },
  }):null;
  if(begin&&(!gs||!gs.alive()))return;
  if(!begin){
    const device=document.querySelector('.device');
    if(!device){if(typeof showToast==='function')showToast('Game container not found');return;}
    device.appendChild(overlay);
  }
  const alive=()=>gs?gs.alive():true;
  const schedule=(fn,ms)=>gs?gs.schedule(fn,ms):setTimeout(fn,ms);
  const close=(result)=>{
    clearInterval(roundInterval);roundInterval=null;
    if(aiDrawIv){clearInterval(aiDrawIv);aiDrawIv=null;}
    if(gs)gs.close(result);else overlay.remove();
  };

  function pickWord(){return SCRIBBLE_WORDS[Math.floor(Math.random()*SCRIBBLE_WORDS.length)];}

  function startRound(){
    if(!alive())return;
    currentWord=pickWord();roundTimer=60;guessedCorrectly.clear();strokes=[];
    const isMyTurn=players[currentDrawerIdx].isMe;
    render();
    clearInterval(roundInterval);
    roundInterval=setInterval(()=>{
      if(!alive()){clearInterval(roundInterval);return;}
      roundTimer--;
      const el=document.getElementById('scribbleTimer');if(el)el.textContent=roundTimer+'s';
      if(roundTimer<=0){clearInterval(roundInterval);nextTurn();}
    },1000);
    if(!isMyTurn){
      schedule(()=>simulateAIDrawing(),500);
    } else {
      players.forEach((p,i)=>{
        if(i!==currentDrawerIdx&&!p.isMe){
          schedule(()=>{
            if(!alive())return;
            if(guessedCorrectly.has(p.name)||Math.random()>=0.7)return;
            guessedCorrectly.add(p.name);scores[p.name]=(scores[p.name]||0)+Math.max(10,roundTimer);
            scores[players[currentDrawerIdx].name]=(scores[players[currentDrawerIdx].name]||0)+5;
            addScribbleMessage(`${p.name} guessed correctly! 🎉`,true);
            render();
          },3000+Math.random()*30000);
        }
      });
    }
  }

  function simulateAIDrawing(){
    if(!alive())return;
    let i=0;
    if(aiDrawIv)clearInterval(aiDrawIv);
    aiDrawIv=setInterval(()=>{
      if(!alive()||i>15||roundTimer<=0){clearInterval(aiDrawIv);aiDrawIv=null;return;}
      strokes.push({x:30+Math.random()*240,y:30+Math.random()*180,color:'#1a1a2e',size:4,newStroke:i===0});
      renderCanvas();i++;
    },800);
  }

  function nextTurn(){
    if(!alive())return;
    clearInterval(roundInterval);
    if(aiDrawIv){clearInterval(aiDrawIv);aiDrawIv=null;}
    currentDrawerIdx++;
    if(currentDrawerIdx>=players.length){currentDrawerIdx=0;round++;}
    if(round>maxRounds){endScribbleGame();return;}
    startRound();
  }

  function endScribbleGame(){
    clearInterval(roundInterval);roundInterval=null;
    if(aiDrawIv){clearInterval(aiDrawIv);aiDrawIv=null;}
    const sorted=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
    const won=sorted[0]?.[0]==='You';
    if(gs)gs.setOutcome(won?'won':'lost');
    if(typeof recordGameResult==='function')recordGameResult('scribble',won);
    overlay.innerHTML=`
      ${typeof gameChromeHtml==='function'?gameChromeHtml({title:'Scribble',subtitle:'Results',backId:'scribbleClose'}):''}
      ${typeof gameResultHtml==='function'?gameResultHtml({
        glyph:'✓',
        title:`${sorted[0]?.[0]||'Someone'} wins`,
        subtitle:sorted.map(([name,score],i)=>`${i+1}. ${name} · ${score} pts`).join(' · '),
        actions:[{label:'Done',primary:true}],
      }):`<div style="padding:24px;text-align:center;"><div>${sorted[0]?.[0]} wins!</div><button id="scribbleClose">Done</button></div>`}
    `;
    const done=()=>close(won?'won':'lost');
    document.getElementById('scribbleClose')?.addEventListener('click',done);
    overlay.querySelector('[data-result-action]')?.addEventListener('click',done);
  }

  function addScribbleMessage(text,isCorrect){
    const list=document.getElementById('scribbleChatList');
    if(!list)return;
    const div=document.createElement('div');
    div.style.cssText=`font-size:12px;padding:4px 0;${isCorrect?'color:var(--green);font-weight:700;':''}`;
    div.textContent=text;list.appendChild(div);list.scrollTop=list.scrollHeight;
  }

  function render(){
    if(!alive())return;
    const isMyTurn=players[currentDrawerIdx].isMe;
    overlay.innerHTML=`
      ${gameChromeHtml({title:'Scribble',subtitle:`Round ${round}/${maxRounds}`,backId:'scribbleBack',rightHtml:`<span id="scribbleTimer" class="game-chrome-metric">${roundTimer}s</span>`})}
      <div style="padding:8px 16px;text-align:center;background:${isMyTurn?'rgba(230,57,70,0.06)':'var(--cream)'};border-bottom:1px solid var(--line);flex-shrink:0;">
        ${isMyTurn?`<div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;color:var(--red);">Your word: ${currentWord}</div>`
        :`<div style="font-weight:700;font-size:14px;">${players[currentDrawerIdx].name} is drawing: ${currentWord.replace(/[a-z]/gi,'_ ')}</div>`}
      </div>
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <canvas id="scribbleCanvas" width="320" height="220" style="background:#fff;width:100%;flex:1;touch-action:none;cursor:${isMyTurn?'crosshair':'default'};"></canvas>
        ${isMyTurn?`
        <div style="display:flex;gap:6px;padding:8px 12px;background:var(--white);border-top:1px solid var(--line);flex-shrink:0;">
          ${['#1a1a2e','#E74C3C','#3498DB','#2ECC71','#F1C40F','#9B59B6'].map(c=>`<button data-color="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};border:2px solid ${currentColor===c?'#fff':c};box-shadow:0 0 0 1px var(--line);cursor:pointer;"></button>`).join('')}
          <button id="scribbleClear" style="margin-left:auto;padding:6px 12px;background:var(--cream);border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">Clear</button>
        </div>`:''}
      </div>
      <div style="height:100px;border-top:1px solid var(--line);background:var(--white);display:flex;flex-direction:column;flex-shrink:0;">
        <div id="scribbleChatList" style="flex:1;overflow-y:auto;padding:6px 12px;"></div>
        ${!isMyTurn?`<div style="display:flex;gap:6px;padding:6px 12px;"><input id="scribbleGuessInput" placeholder="Type your guess..." style="flex:1;padding:8px 12px;border:1.5px solid var(--line);border-radius:10px;font-size:13px;outline:none;"><button id="scribbleGuessBtn" style="background:var(--red);color:#fff;border:none;border-radius:10px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;">Guess</button></div>`:''}
      </div>
    `;
    document.getElementById('scribbleBack').addEventListener('click',()=>close());
    wireCanvas();
    if(!isMyTurn){
      document.getElementById('scribbleGuessBtn')?.addEventListener('click',submitGuess);
      document.getElementById('scribbleGuessInput')?.addEventListener('keypress',e=>{if(e.key==='Enter')submitGuess();});
    } else {
      overlay.querySelectorAll('[data-color]').forEach(btn=>btn.addEventListener('click',()=>{currentColor=btn.dataset.color;render();}));
      document.getElementById('scribbleClear')?.addEventListener('click',()=>{strokes=[];renderCanvas();});
    }
  }

  function submitGuess(){
    const inp=document.getElementById('scribbleGuessInput');
    const val=inp.value.trim().toLowerCase();if(!val)return;
    addScribbleMessage(`You: ${val}`);
    if(val===currentWord.toLowerCase()&&!guessedCorrectly.has('You')){
      guessedCorrectly.add('You');
      scores['You']=(scores['You']||0)+Math.max(10,roundTimer);
      scores[players[currentDrawerIdx].name]=(scores[players[currentDrawerIdx].name]||0)+5;
      addScribbleMessage('You guessed correctly! 🎉',true);
      showToast('Correct! +'+Math.max(10,roundTimer)+' points');
    }
    inp.value='';
  }

  function wireCanvas(){
    const canvas=document.getElementById('scribbleCanvas');if(!canvas)return;
    const ctx=canvas.getContext('2d');
    renderCanvas();
    if(!players[currentDrawerIdx].isMe)return;
    const getPos=e=>{
      const rect=canvas.getBoundingClientRect();
      const cx=(e.touches?e.touches[0].clientX:e.clientX)-rect.left;
      const cy=(e.touches?e.touches[0].clientY:e.clientY)-rect.top;
      return{x:cx*(canvas.width/rect.width),y:cy*(canvas.height/rect.height)};
    };
    const start=e=>{e.preventDefault();isDrawing=true;const p=getPos(e);strokes.push({x:p.x,y:p.y,color:currentColor,size:currentSize,newStroke:true});};
    const move=e=>{if(!isDrawing)return;e.preventDefault();const p=getPos(e);strokes.push({x:p.x,y:p.y,color:currentColor,size:currentSize,newStroke:false});renderCanvas();};
    const end=()=>{isDrawing=false;};
    canvas.addEventListener('mousedown',start);canvas.addEventListener('mousemove',move);canvas.addEventListener('mouseup',end);canvas.addEventListener('mouseleave',end);
    canvas.addEventListener('touchstart',start);canvas.addEventListener('touchmove',move);canvas.addEventListener('touchend',end);
  }

  function renderCanvas(){
    const canvas=document.getElementById('scribbleCanvas');if(!canvas)return;
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
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
        <div style="display:flex;align-items:center;gap:10px;padding:14px;background:var(--white);border-radius:14px;margin-bottom:8px;border:2px solid var(--red);">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--red);display:flex;align-items:center;justify-content:center;font-size:18px;">🪑</div>
          <div style="flex:1;font-weight:700;">You</div>
          <div style="color:var(--red);font-size:12px;font-weight:700;">✓ Playing</div>
        </div>
        ${members.map((m,i)=>{
          const sel=selectedPlayers.has(m.name);
          return`<div class="group-player-row" data-name="${m.name}" style="display:flex;align-items:center;gap:10px;padding:14px;background:var(--white);border-radius:14px;margin-bottom:8px;border:2px solid ${sel?'var(--red)':'var(--line)'};cursor:pointer;">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--line);display:flex;align-items:center;justify-content:center;font-size:18px;">${m.avatar||'👤'}</div>
            <div style="flex:1;"><div style="font-weight:700;">${m.name}</div><div style="font-size:11px;color:var(--muted);">Tap to ${sel?'remove':'add'}</div></div>
            <div style="width:24px;height:24px;border-radius:50%;background:${sel?'var(--red)':'var(--line)'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;">${sel?'✓':''}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="padding:14px 16px;background:var(--white);border-top:1px solid var(--line);">
        <div style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:10px;">${selectedPlayers.size+1} player${selectedPlayers.size>0?'s':''} selected · AI fills remaining slots</div>
        <button id="startGroupGame" style="width:100%;padding:14px;background:${selectedPlayers.size+1>=cfg.min?'var(--red)':'var(--line)'};color:${selectedPlayers.size+1>=cfg.min?'#fff':'var(--muted)'};border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;">
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
    order: 90,
    launch(ctx) {
      if (ctx.isGroup) openGroupGameSetup(ctx.chat, 'scribble');
      else openScribbleGame(ctx.chat, [{ name: ctx.chat?.name || 'Friend' }]);
    },
  });
}
