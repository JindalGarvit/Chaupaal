// ===================== RUSH RUNNER (Endless runner — Subway Surfers style) =====================
function openRushRunner(){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;';
  
  const LANES=3;const LANE_W=100/LANES;
  let lane=1,score=0,coins=0,speed=4,frame=0,gameOver=false,started=false;
  let obstacles=[],coinItems=[],powerups=[];
  let playerY=0,jumping=false,sliding=false,jumpV=0;
  let hitFlash=0,shield=false,shieldTimer=0;
  let bestScore=parseInt(localStorage.getItem('rushrunner_best')||'0');
  let raf=null,lastTime=0;
  let resizeObs=null;
  
  const PLAYER_SKINS=['🏃','🧑‍🦱','👩','🧔','👦'];
  let skin=PLAYER_SKINS[0];
  
  const THEMES=[
    {name:'Mumbai Streets',bg:'#FF6B35',ground:'#F4A261',sky:'#FFE0CC',obstacle:'🚗',coin:'💰',power:'⚡'},
    {name:'Delhi Metro',bg:'#4CC9F0',ground:'#3A0CA3',sky:'#7209B7',obstacle:'🚧',coin:'💎',power:'🛡️'},
    {name:'Jaipur Fort',bg:'#F72585',ground:'#B5179E',sky:'#560BAD',obstacle:'🏛️',coin:'🪙',power:'🌟'},
  ];
  let theme=THEMES[Math.floor(Math.random()*THEMES.length)];

  function stopLoop(){
    if(raf){cancelAnimationFrame(raf);raf=null;}
    if(resizeObs){try{resizeObs.disconnect();}catch(e){}resizeObs=null;}
  }

  const begin=typeof beginGameOverlaySession==='function'?beginGameOverlaySession:null;
  const gs=begin?begin({
    type:'rushrunner',title:'Rush Runner',mode:'solo',overlay,
    cleanup(){stopLoop();},
  }):null;
  if(begin&&(!gs||!gs.alive()))return;
  if(!begin){
    const device=document.querySelector('.device');
    if(!device){if(typeof showToast==='function')showToast('Game container not found');return;}
    device.appendChild(overlay);
  }
  const alive=()=>gs?gs.alive():true;
  const schedule=(fn,ms)=>gs?gs.schedule(fn,ms):setTimeout(fn,ms);
  const close=()=>{stopLoop();if(gs)gs.close();else overlay.remove();};
  
  overlay.innerHTML=`
    ${gameChromeHtml({title:'Rush Runner',subtitle:theme.name,backId:'rrBack',rightHtml:'<span class="game-chrome-metric" id="rrScore">0</span>'})}
    <div style="flex:1;position:relative;overflow:hidden;" id="rrGame">
      <canvas id="rrCanvas" style="width:100%;height:100%;display:block;"></canvas>
      <div id="rrOverlay" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;">
        <div style="font-size:48px;margin-bottom:16px;">🏃</div>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;margin-bottom:8px;">Rush Runner</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:8px;">${theme.name}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:24px;">Best: ${bestScore}</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:20px;">Swipe left/right to switch lanes<br>Swipe up to jump · Swipe down to slide</div>
        <button id="rrStart" style="background:var(--red);color:#fff;border:none;border-radius:16px;padding:14px 36px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;cursor:pointer;">▶ Start Running</button>
      </div>
    </div>
    <div style="display:flex;justify-content:space-around;padding:10px 0;background:rgba(0,0,0,0.3);flex-shrink:0;">
      <button id="rrLeft" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:12px;padding:12px 24px;font-size:20px;cursor:pointer;">◀</button>
      <button id="rrJump" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:12px;padding:12px 24px;font-size:20px;cursor:pointer;">⬆ Jump</button>
      <button id="rrSlide" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:12px;padding:12px 24px;font-size:20px;cursor:pointer;">⬇ Slide</button>
      <button id="rrRight" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:12px;padding:12px 24px;font-size:20px;cursor:pointer;">▶</button>
    </div>
  `;

  const canvas=document.getElementById('rrCanvas');
  if(!canvas){if(typeof showToast==='function')showToast('Could not start Rush Runner');close();return;}
  const ctx=canvas.getContext('2d');
  
  function resize(){if(!alive()||!canvas)return;canvas.width=canvas.offsetWidth;canvas.height=canvas.offsetHeight;}
  resize();
  if(typeof ResizeObserver==='function'){
    resizeObs=new ResizeObserver(resize);
    resizeObs.observe(canvas);
  }

  const GH=()=>canvas.height*0.75; // ground height

  function spawnObstacle(){
    const l=Math.floor(Math.random()*LANES);
    const type=Math.random()<0.3?'low':'high';
    obstacles.push({lane:l,y:-60,h:type==='low'?30:50,type,emoji:theme.obstacle});
  }
  function spawnCoin(){
    const l=Math.floor(Math.random()*LANES);
    for(let i=0;i<3;i++) coinItems.push({lane:l,y:-60-i*40,collected:false});
  }
  function spawnPowerup(){
    powerups.push({lane:Math.floor(Math.random()*LANES),y:-60,type:Math.random()<0.5?'shield':'magnet',emoji:Math.random()<0.5?'🛡️':'🧲'});
  }

  function laneX(l){return (l+0.5)*(canvas.width/LANES);}
  
  function drawBackground(){
    const grad=ctx.createLinearGradient(0,0,0,GH());
    grad.addColorStop(0,theme.sky);grad.addColorStop(1,theme.bg);
    ctx.fillStyle=grad;ctx.fillRect(0,0,canvas.width,GH());
    ctx.fillStyle='rgba(0,0,0,0.2)';
    for(let i=0;i<8;i++){const bw=40+Math.random()*30;const bh=50+Math.random()*80;ctx.fillRect(i*70+(frame*0.5%(70)),GH()-bh,bw,bh);}
    ctx.fillStyle=theme.ground;ctx.fillRect(0,GH(),canvas.width,canvas.height-GH());
    ctx.strokeStyle='rgba(255,255,255,0.15)';ctx.lineWidth=2;ctx.setLineDash([20,15]);
    for(let i=1;i<LANES;i++){const x=i*(canvas.width/LANES);ctx.beginPath();ctx.moveTo(x,GH());ctx.lineTo(x,canvas.height);ctx.stroke();}
    ctx.setLineDash([]);
  }

  function drawPlayer(){
    const x=laneX(lane);
    const baseY=GH()-60+playerY;
    const h=sliding?25:50;
    ctx.font=`${sliding?28:40}px serif`;
    ctx.textAlign='center';ctx.textBaseline='bottom';
    if(shield){ctx.fillStyle='rgba(100,200,255,0.3)';ctx.beginPath();ctx.arc(x,baseY-h/2,35,0,Math.PI*2);ctx.fill();}
    if(hitFlash>0){ctx.fillStyle=`rgba(255,0,0,${hitFlash/10})`;ctx.beginPath();ctx.arc(x,baseY-h/2,35,0,Math.PI*2);ctx.fill();hitFlash--;}
    ctx.fillText(skin,x,baseY);
  }

  function drawObstacles(){
    obstacles.forEach(o=>{
      const x=laneX(o.lane);
      ctx.font='36px serif';ctx.textAlign='center';ctx.textBaseline='bottom';
      ctx.fillText(o.emoji,x,GH()+o.y*(canvas.height/600));
    });
  }
  function drawCoins(){
    coinItems.forEach(c=>{
      if(c.collected)return;
      const x=laneX(c.lane);
      ctx.font='22px serif';ctx.textAlign='center';ctx.textBaseline='bottom';
      ctx.fillText(theme.coin,x,GH()+c.y*(canvas.height/600));
    });
  }
  function drawPowerups(){
    powerups.forEach(p=>{
      const x=laneX(p.lane);
      ctx.font='26px serif';ctx.textAlign='center';ctx.textBaseline='bottom';
      ctx.fillText(p.emoji,x,GH()+p.y*(canvas.height/600));
    });
  }
  function drawHUD(){
    ctx.fillStyle='rgba(0,0,0,0.4)';ctx.roundRect?ctx.roundRect(8,8,120,60,12):ctx.fillRect(8,8,120,60);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 13px Inter';ctx.textAlign='left';ctx.textBaseline='top';
    ctx.fillText(`🏃 ${score}m`,14,14);
    ctx.fillText(`${theme.coin} ${coins}`,14,36);
    if(shield){ctx.fillText('🛡️ Shield!',14,56);}
  }

  function update(ts){
    if(!alive()||gameOver||!started)return;
    const dt=Math.min((ts-lastTime)/16,3);lastTime=ts;
    frame++;score=Math.floor(frame*speed*0.1);
    speed=4+score*0.003;
    const scoreEl=document.getElementById('rrScore');
    if(scoreEl)scoreEl.textContent=score+'m';

    if(jumping){playerY+=jumpV*dt;jumpV+=1.5*dt;if(playerY>=0){playerY=0;jumping=false;jumpV=0;}}
    if(shieldTimer>0){shieldTimer-=dt;if(shieldTimer<=0)shield=false;}

    const spd=speed*(canvas.height/600)*dt;
    obstacles.forEach(o=>o.y+=spd);
    coinItems.forEach(c=>c.y+=spd);
    powerups.forEach(p=>p.y+=spd);

    obstacles=obstacles.filter(o=>o.y<canvas.height);
    coinItems=coinItems.filter(c=>c.y<canvas.height);
    powerups=powerups.filter(p=>p.y<canvas.height);

    if(frame%Math.max(30,60-Math.floor(score/100))===0)spawnObstacle();
    if(frame%45===0)spawnCoin();
    if(frame%200===0)spawnPowerup();

    const px=laneX(lane),py=GH()-40+playerY,pr=30;
    obstacles.forEach(o=>{
      if(o.lane!==lane)return;
      const oy=GH()+o.y*(canvas.height/600)-o.h/2;
      const dist=Math.abs(py-oy);
      if(dist<pr+20&&!shield&&!(jumping&&o.type==='low')&&!(sliding&&o.type==='high')){
        hitFlash=10;endGame();
      }
    });
    coinItems.forEach(c=>{
      if(c.collected||c.lane!==lane)return;
      const cy=GH()+c.y*(canvas.height/600);
      if(Math.abs(py-cy)<40){c.collected=true;coins++;score+=10;}
    });
    powerups.forEach((p,i)=>{
      if(p.lane!==lane)return;
      const ppy=GH()+p.y*(canvas.height/600);
      if(Math.abs(py-ppy)<40){shield=true;shieldTimer=180;powerups.splice(i,1);}
    });

    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawBackground();drawObstacles();drawCoins();drawPowerups();drawPlayer();drawHUD();
    raf=requestAnimationFrame(update);
  }

  function endGame(){
    if(gameOver)return;
    gameOver=true;cancelAnimationFrame(raf);raf=null;
    if(score>bestScore){bestScore=score;localStorage.setItem('rushrunner_best',score);}
    if(gs)gs.setOutcome('lost');
    if(typeof recordGameResult==='function')recordGameResult('rushrunner',false);
    const div=document.getElementById('rrOverlay');
    if(!div)return;
    div.style.display='flex';div.style.background='rgba(0,0,0,0.7)';
    div.innerHTML=`
      <div style="font-size:52px;margin-bottom:12px;">💥</div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:24px;color:#fff;margin-bottom:8px;">${score}m Run!</div>
      <div style="font-size:14px;color:rgba(255,255,255,0.7);margin-bottom:6px;">${theme.coin} ${coins} coins collected</div>
      <div style="font-size:13px;color:var(--gold);margin-bottom:24px;">Best: ${bestScore}m</div>
      <button id="rrRestart" style="background:var(--red);color:#fff;border:none;border-radius:14px;padding:13px 32px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">🔄 Run again</button>
      <button id="rrShare" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:14px;padding:11px 28px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;">📤 Share score</button>
    `;
    document.getElementById('rrRestart').addEventListener('click',()=>{close();openRushRunner();});
    document.getElementById('rrShare').addEventListener('click',()=>{const t=`I ran ${score}m on Chaupaal Rush Runner! 🏃 Can you beat me? chaupaal-chaupaal.web.app`;navigator.share?navigator.share({text:t}):(navigator.clipboard.writeText(t),showToast('Copied!'));});
  }

  function startGame(){
    if(!alive())return;
    document.getElementById('rrOverlay').style.display='none';
    started=true;lastTime=performance.now();
    raf=requestAnimationFrame(update);
  }

  document.getElementById('rrBack').addEventListener('click',()=>close());
  document.getElementById('rrStart').addEventListener('click',startGame);
  document.getElementById('rrLeft').addEventListener('click',()=>{if(lane>0)lane--;});
  document.getElementById('rrRight').addEventListener('click',()=>{if(lane<LANES-1)lane++;});
  document.getElementById('rrJump').addEventListener('click',()=>{if(!jumping&&!gameOver&&started){jumping=true;jumpV=-18;}});
  document.getElementById('rrSlide').addEventListener('click',()=>{if(!gameOver&&started){sliding=true;schedule(()=>{if(alive())sliding=false;},600);}});

  let tx=0,ty=0;
  canvas.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;},{passive:true});
  canvas.addEventListener('touchend',e=>{
    if(!alive()||gameOver)return;
    const dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;
    if(Math.abs(dx)>Math.abs(dy)){if(dx<-30&&lane>0)lane--;else if(dx>30&&lane<LANES-1)lane++;}
    else{if(dy<-30&&!jumping){jumping=true;jumpV=-18;}else if(dy>30){sliding=true;schedule(()=>{if(alive())sliding=false;},600);}}
  },{passive:true});
}

// ===================== TIP TAP (Match-3) =====================
function openTipTap(){
  const COLS=8,ROWS=8;
  const COLORS=['🔴','🟡','🔵','🟢','🟣','🟠'];
  const SPECIALS={bomb:'💣',rainbow:'🌈',lightning:'⚡'};
  
  let level=parseInt(localStorage.getItem('tiptap_level')||localStorage.getItem('candyburst_level')||'1');
  let board=[],score=0,moves=0,targetScore=0,maxMoves=0;
  let selected=null,animating=false,gameOver=false;
  let combo=0;
  let cascadeTimer=null;

  const LEVELS=Array.from({length:100},(_,i)=>({
    level:i+1,
    target:500*(i+1)+Math.floor(i/5)*1000,
    moves:20+Math.floor(i/3)*2,
    board:ROWS,
  }));

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:#7B2FBE;z-index:80;display:flex;flex-direction:column;';

  const begin=typeof beginGameOverlaySession==='function'?beginGameOverlaySession:null;
  const gs=begin?begin({
    type:'tiptap',title:'Tip Tap',mode:'solo',overlay,
    cleanup(){if(cascadeTimer){clearTimeout(cascadeTimer);cascadeTimer=null;}},
  }):null;
  if(begin&&(!gs||!gs.alive()))return;
  if(!begin){
    const device=document.querySelector('.device');
    if(!device){if(typeof showToast==='function')showToast('Game container not found');return;}
    device.appendChild(overlay);
  }
  const alive=()=>gs?gs.alive():true;
  const schedule=(fn,ms)=>{
    if(gs)return gs.schedule(fn,ms);
    return setTimeout(fn,ms);
  };
  const close=()=>{
    if(cascadeTimer){clearTimeout(cascadeTimer);cascadeTimer=null;}
    if(gs)gs.close();else overlay.remove();
  };

  function startLevel(lvl){
    if(!alive())return;
    const cfg=LEVELS[Math.min(lvl-1,LEVELS.length-1)];
    targetScore=cfg.target;maxMoves=cfg.moves;moves=cfg.moves;score=0;combo=0;gameOver=false;
    board=Array(ROWS).fill(null).map(()=>Array(COLS).fill(null).map(()=>randomPiece()));
    while(findMatches().length)board=Array(ROWS).fill(null).map(()=>Array(COLS).fill(null).map(()=>randomPiece()));
    render();
  }

  function randomPiece(special=false){
    if(special&&Math.random()<0.05) return {color:null,special:Object.values(SPECIALS)[Math.floor(Math.random()*3)]};
    return {color:COLORS[Math.floor(Math.random()*COLORS.length)],special:null};
  }

  function findMatches(){
    const matches=new Set();
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS-2;c++){
      const p=board[r][c];if(!p?.color)continue;
      if(board[r][c+1]?.color===p.color&&board[r][c+2]?.color===p.color){
        let len=3;while(c+len<COLS&&board[r][c+len]?.color===p.color)len++;
        for(let i=0;i<len;i++)matches.add(`${r},${c+i}`);
      }
    }
    for(let c=0;c<COLS;c++) for(let r=0;r<ROWS-2;r++){
      const p=board[r][c];if(!p?.color)continue;
      if(board[r+1][c]?.color===p.color&&board[r+2][c]?.color===p.color){
        let len=3;while(r+len<ROWS&&board[r+len][c]?.color===p.color)len++;
        for(let i=0;i<len;i++)matches.add(`${r+i},${c}`);
      }
    }
    return [...matches].map(k=>{const[r,c]=k.split(',').map(Number);return{r,c};});
  }

  function clearMatches(matches){
    if(!alive())return;
    combo++;
    const pts=matches.length*10*combo;score+=pts;moves--;
    if(matches.length>=5&&matches.length<8){
      const m=matches[0];board[m.r][m.c]={color:null,special:SPECIALS.bomb};
    } else if(matches.length>=8){
      const m=matches[0];board[m.r][m.c]={color:null,special:SPECIALS.rainbow};
    } else {
      matches.forEach(({r,c})=>board[r][c]=null);
    }
    matches.forEach(({r,c})=>{
      const p=board[r][c];
      if(p?.special===SPECIALS.bomb){for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(board[r+dr]?.[c+dc])board[r+dr][c+dc]=null;}}
      if(p?.special===SPECIALS.lightning){for(let rr=0;rr<ROWS;rr++)board[rr][c]=null;}
      if(p?.special===SPECIALS.rainbow){const color=matches[1]?.color;for(let rr=0;rr<ROWS;rr++)for(let cc=0;cc<COLS;cc++)if(board[rr][cc]?.color===color)board[rr][cc]=null;}
      if(!p?.special)board[r][c]=null;
    });
    dropPieces();
  }

  function dropPieces(){
    if(!alive())return;
    for(let c=0;c<COLS;c++){
      let empty=ROWS-1;
      for(let r=ROWS-1;r>=0;r--){
        if(board[r][c]!==null){board[empty][c]=board[r][c];if(empty!==r)board[r][c]=null;empty--;}
      }
      for(let r=empty;r>=0;r--)board[r][c]=randomPiece(true);
    }
    const newMatches=findMatches();
    if(newMatches.length){
      if(cascadeTimer)clearTimeout(cascadeTimer);
      cascadeTimer=schedule(()=>{cascadeTimer=null;clearMatches(newMatches);},300);
    }
    else{combo=0;checkGameOver();}
    render();
  }

  function trySwap(r1,c1,r2,c2){
    if(!alive()||animating||gameOver)return;
    if(Math.abs(r1-r2)+Math.abs(c1-c2)!==1)return;
    animating=true;
    const tmp=board[r1][c1];board[r1][c1]=board[r2][c2];board[r2][c2]=tmp;
    const matches=findMatches();
    if(matches.length){clearMatches(matches);}
    else{const tmp2=board[r1][c1];board[r1][c1]=board[r2][c2];board[r2][c2]=tmp2;showToast('No match! Try again');}
    animating=false;selected=null;render();
  }

  function checkGameOver(){
    if(score>=targetScore){showLevelComplete();return;}
    if(moves<=0){showGameOver();return;}
  }

  function showLevelComplete(){
    gameOver=true;
    localStorage.setItem('tiptap_level',level+1);
    if(gs)gs.setOutcome('won');
    if(typeof recordGameResult==='function')recordGameResult('tiptap',true);
    const div=document.getElementById('cbOverlay');if(!div)return;div.style.display='flex';
    div.innerHTML=`
      <div style="background:var(--white);border-radius:24px;padding:32px 24px;text-align:center;max-width:280px;margin:20px;">
        <div style="font-size:56px;margin-bottom:12px;">🎉</div>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;margin-bottom:8px;">Level ${level} Complete!</div>
        <div style="font-size:15px;color:var(--muted);margin-bottom:20px;">Score: ${score.toLocaleString()}</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px;">${'⭐'.repeat(score>=targetScore*1.5?3:score>=targetScore*1.1?2:1)}</div>
        <button id="cbNext" style="width:100%;padding:14px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;">Level ${level+1} →</button>
      </div>
    `;
    document.getElementById('cbNext').addEventListener('click',()=>{level++;startLevel(level);document.getElementById('cbOverlay').style.display='none';});
  }

  function showGameOver(){
    gameOver=true;
    if(gs)gs.setOutcome('lost');
    if(typeof recordGameResult==='function')recordGameResult('tiptap',false);
    const div=document.getElementById('cbOverlay');if(!div)return;div.style.display='flex';
    div.innerHTML=`
      <div style="background:var(--white);border-radius:24px;padding:32px 24px;text-align:center;max-width:280px;margin:20px;">
        <div style="font-size:52px;margin-bottom:12px;">😢</div>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;margin-bottom:8px;">Out of moves!</div>
        <div style="font-size:14px;color:var(--muted);margin-bottom:6px;">Score: ${score.toLocaleString()} / ${targetScore.toLocaleString()}</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:20px;">Level ${level}</div>
        <button id="cbRetry" style="width:100%;padding:14px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:8px;">🔄 Try again</button>
      </div>
    `;
    document.getElementById('cbRetry').addEventListener('click',()=>{startLevel(level);document.getElementById('cbOverlay').style.display='none';});
  }

  function render(){
    if(!alive())return;
    const grid=document.getElementById('cbGrid');if(!grid)return;
    const scoreEl=document.getElementById('cbScore');if(scoreEl)scoreEl.textContent=score.toLocaleString();
    const movesEl=document.getElementById('cbMoves');if(movesEl)movesEl.textContent=moves;
    const progEl=document.getElementById('cbProgress');if(progEl)progEl.style.width=Math.min(100,(score/targetScore)*100)+'%';

    grid.innerHTML='';
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const cell=document.createElement('div');
      const p=board[r][c];
      const isSel=selected&&selected[0]===r&&selected[1]===c;
      cell.style.cssText=`aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:clamp(18px,4.5vw,26px);cursor:pointer;border-radius:10px;background:${isSel?'rgba(255,255,255,0.3)':'rgba(255,255,255,0.1)'};border:2px solid ${isSel?'#fff':'transparent'};transition:all .15s;user-select:none;`;
      cell.textContent=p?.special||p?.color||'';
      cell.dataset.r=r;cell.dataset.c=c;
      cell.addEventListener('click',()=>{
        if(animating||gameOver)return;
        const nr=parseInt(cell.dataset.r),nc=parseInt(cell.dataset.c);
        if(!selected){selected=[nr,nc];render();}
        else{trySwap(selected[0],selected[1],nr,nc);selected=null;render();}
      });
      grid.appendChild(cell);
    }
  }

  overlay.innerHTML=`
    ${gameChromeHtml({title:'Tip Tap',subtitle:`Level ${level}`,backId:'cbBack',rightHtml:'<span class="game-chrome-metric" id="cbScore">0</span>'})}
    <div style="padding:8px 16px;background:rgba(0,0,0,0.18);flex-shrink:0;">
      <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);margin-bottom:6px;">
        <span>Target: ${LEVELS[Math.min(level-1,99)].target.toLocaleString()}</span>
        <span>Moves: <span id="cbMoves">${LEVELS[Math.min(level-1,99)].moves}</span></span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,0.2);border-radius:99px;overflow:hidden;">
        <div id="cbProgress" style="height:100%;width:0%;background:#fff;border-radius:99px;transition:width .4s;"></div>
      </div>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:10px;background:var(--game-bg-dark,#1a1a2e);">
      <div id="cbGrid" style="display:grid;grid-template-columns:repeat(${COLS},1fr);gap:4px;width:min(360px,94vw);"></div>
    </div>
    <div id="cbOverlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);display:none;align-items:center;justify-content:center;z-index:10;"></div>
  `;
  document.getElementById('cbBack').addEventListener('click',()=>close());
  startLevel(level);
}

// --- Game registry self-registration (arcade.js) ---
if (typeof registerGame === 'function') {
  registerGame({
    id: 'rushrunner',
    name: 'Rush Runner',
    desc: 'Endless runner · dodge & collect',
    icon: '🏃',
    ratingKey: 'rushrunner',
    gameType: 'solo',
    solo: true,
    selfChat: true,
    order: 100,
    launch() { openRushRunner(); },
  });
  registerGame({
    id: 'tiptap',
    name: 'Tip Tap',
    desc: 'Match-3 · 100 levels',
    icon: '✨',
    ratingKey: 'tiptap',
    gameType: 'solo',
    solo: true,
    selfChat: true,
    order: 110,
    launch() { openTipTap(); },
  });
}
