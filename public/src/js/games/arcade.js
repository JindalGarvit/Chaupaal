// ===================== RUSH RUNNER (Perspective Subway-lite) =====================
function openRushRunner(){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;';

  const LANES=3;
  const LANE_LERP_MS=150;
  const FAR=42;
  const FOCAL=9;
  const PLAYER_Z=2.4;
  const BASE_SPEED=11;
  const MAX_SPEED=26;
  const RAMP_UNTIL=450;

  let lane=1,laneX=1,laneFrom=1,laneTo=1,laneT=1;
  let score=0,coins=0,dist=0,speed=BASE_SPEED,gameOver=false,started=false;
  let obstacles=[],coinItems=[],powerups=[],particles=[];
  let jumping=false,sliding=false,jumpT=0,slideT=0,squash=1;
  let hitFlash=0,shield=false,shieldTimer=0,magnet=false,magnetTimer=0;
  let bestScore=(typeof getGamePB==='function'?getGamePB('rushrunner'):null) ?? (parseInt(localStorage.getItem('rushrunner_best')||'0',10)||0);
  let raf=null,lastTime=0,spawnAcc=0,coinAcc=0,powerAcc=0,scroll=0;
  let resizeObs=null,cssW=320,cssH=480,shake=0;
  let keyHandler=null;

  const THEMES=[
    {name:'Mumbai Streets',skyTop:'#FFB347',skyBot:'#FF6B35',road:'#2A2A32',roadEdge:'#F4A261',line:'#FFE08A',accent:'#E8663D',bldg:['#5C4033','#8B5A2B','#3D2B1F','#6B4423']},
    {name:'Delhi Metro',skyTop:'#89CFF0',skyBot:'#4CC9F0',road:'#1E1E2E',roadEdge:'#7209B7',line:'#C77DFF',accent:'#4CC9F0',bldg:['#3A0CA3','#4361EE','#1B1B3A','#4A4E69']},
    {name:'Jaipur Fort',skyTop:'#FFB4A2',skyBot:'#E76F51',road:'#2C1810',roadEdge:'#F4A261',line:'#FFD166',accent:'#F72585',bldg:['#9B2226','#BB3E03','#6A040F','#AE2012']},
  ];
  const theme=THEMES[Math.floor(Math.random()*THEMES.length)];

  // Cached skyline (built once — no per-frame Math.random flicker)
  let skyline=[];
  function buildSkyline(w,h){
    const horizon=h*0.32;
    const list=[];
    let x=-20;
    let seed=theme.name.length*97+w;
    const rnd=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
    while(x<w+40){
      const bw=28+rnd()*48;
      const bh=40+rnd()*horizon*0.85;
      list.push({x,w:bw,h:bh,color:theme.bldg[Math.floor(rnd()*theme.bldg.length)],win:rnd()>0.45});
      x+=bw+4+rnd()*18;
    }
    skyline=list;
  }

  function stopLoop(){
    if(raf){cancelAnimationFrame(raf);raf=null;}
    if(resizeObs){try{resizeObs.disconnect();}catch(e){}resizeObs=null;}
    if(keyHandler){window.removeEventListener('keydown',keyHandler);keyHandler=null;}
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
  if(typeof prepareGameOverlay==='function')prepareGameOverlay(overlay,{theme:'dark',gameId:'rushrunner',accent:theme.accent});

  const alive=()=>gs?gs.alive():true;
  const schedule=(fn,ms)=>gs?gs.schedule(fn,ms):setTimeout(fn,ms);
  const close=()=>{stopLoop();if(gs)gs.close();else overlay.remove();};
  const buzz=(a)=>{if(typeof gameFeedback==='function')gameFeedback(a);};

  overlay.innerHTML=`
    ${gameChromeHtml({title:'Rush Runner',subtitle:theme.name,backId:'rrBack',rightHtml:'<span class="game-chrome-metric" id="rrScore">0m</span>'})}
    <div class="rr-stage" id="rrGame">
      <canvas id="rrCanvas" aria-label="Rush Runner playfield"></canvas>
      <div class="rr-hud-chip" id="rrCoins" aria-live="polite">◆ 0</div>
      <div class="rr-power" id="rrPower" hidden></div>
      <div id="rrOverlay" class="rr-start">
        <div class="rr-start-mark" aria-hidden="true"></div>
        <div class="rr-start-title">Rush Runner</div>
        <div class="rr-start-sub">${theme.name}</div>
        <div class="rr-start-best">Best ${bestScore}m</div>
        <div class="rr-start-hint">Swipe or tap lanes · Up jump · Down slide</div>
        <button type="button" id="rrStart" class="game-tap-target rr-start-btn">Start running</button>
      </div>
    </div>
    <div class="game-lane-bar" role="group" aria-label="Lane controls">
      <button type="button" id="rrLeft" class="game-lane-btn game-tap-target" aria-label="Lane left">◀</button>
      <button type="button" id="rrJump" class="game-lane-btn game-tap-target" aria-label="Jump">⬆</button>
      <button type="button" id="rrSlide" class="game-lane-btn game-tap-target" aria-label="Slide">⬇</button>
      <button type="button" id="rrRight" class="game-lane-btn game-tap-target" aria-label="Lane right">▶</button>
    </div>
  `;

  const canvas=document.getElementById('rrCanvas');
  if(!canvas){if(typeof showToast==='function')showToast('Could not start Rush Runner');close();return;}
  const ctx=canvas.getContext('2d');

  function resize(){
    if(!alive()||!canvas)return;
    const size=typeof setupGameCanvas==='function'
      ?setupGameCanvas(canvas)
      :(()=>{const dpr=Math.min(2,window.devicePixelRatio||1);const w=canvas.clientWidth||320,h=canvas.clientHeight||480;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);return{w,h,dpr};})();
    cssW=size.w;cssH=size.h;
    buildSkyline(cssW,cssH);
  }
  resize();
  if(typeof ResizeObserver==='function'){
    resizeObs=new ResizeObserver(resize);
    resizeObs.observe(canvas.parentElement||canvas);
  }

  function easeOutCubic(t){return 1-Math.pow(1-t,3);}
  function laneWorldX(l){return (l-1)*1.15;}

  function project(wx,z){
    const rel=Math.max(0.35,z);
    const scale=FOCAL/rel;
    const horizon=cssH*0.30;
    const ground=cssH*0.92;
    const t=1-Math.min(1,rel/FAR);
    const y=horizon+(ground-horizon)*Math.pow(t,1.15);
    const roadHalfNear=cssW*0.46;
    const roadHalf=roadHalfNear*scale*(rel/FOCAL);
    const x=cssW*0.5+wx*roadHalf*0.72;
    return {x,y,scale:Math.max(0.08,scale),roadHalf};
  }

  function spawnObstacle(z){
    const l=Math.floor(Math.random()*LANES);
    // Foreshadow: prefer empty lane relative to player path occasionally leave a gap
    const type=Math.random()<0.38?'low':'high';
    const kind=type==='low'?(Math.random()<0.5?'barrier':'crate'):(Math.random()<0.5?'sign':'train');
    obstacles.push({lane:l,z:z||FAR,type,kind,w:0.55,h:type==='low'?0.35:0.85});
  }
  function spawnCoinRow(z){
    const l=Math.floor(Math.random()*LANES);
    const n=3+Math.floor(Math.random()*3);
    for(let i=0;i<n;i++)coinItems.push({lane:l,z:(z||FAR)+i*1.1,collected:false,pull:0});
  }
  function spawnPowerup(z){
    powerups.push({
      lane:Math.floor(Math.random()*LANES),
      z:z||FAR,
      type:Math.random()<0.5?'shield':'magnet',
    });
  }

  function setLane(next){
    if(next===laneTo||next<0||next>=LANES)return;
    laneFrom=laneX;laneTo=next;lane=next;laneT=0;
    buzz('select');
  }
  function doJump(){
    if(!started||gameOver||jumping||sliding)return;
    jumping=true;jumpT=0;squash=1.15;
    buzz('move');
  }
  function doSlide(){
    if(!started||gameOver||sliding)return;
    sliding=true;slideT=0;jumping=false;jumpT=0;squash=0.7;
    buzz('move');
  }

  function drawSky(){
    const g=ctx.createLinearGradient(0,0,0,cssH*0.45);
    g.addColorStop(0,theme.skyTop);g.addColorStop(1,theme.skyBot);
    ctx.fillStyle=g;ctx.fillRect(0,0,cssW,cssH*0.45);
    const horizon=cssH*0.30;
    skyline.forEach(b=>{
      ctx.fillStyle=b.color;
      ctx.fillRect(b.x,horizon-b.h,b.w,b.h);
      if(b.win){
        ctx.fillStyle='rgba(255,220,120,0.35)';
        const cols=Math.max(1,Math.floor(b.w/14));
        const rows=Math.max(1,Math.floor(b.h/16));
        for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
          ctx.fillRect(b.x+4+c*12,horizon-b.h+6+r*14,5,6);
        }
      }
    });
  }

  function drawRoad(){
    const segs=18;
    for(let i=0;i<segs;i++){
      const z0=PLAYER_Z+(i/segs)*(FAR-PLAYER_Z);
      const z1=PLAYER_Z+((i+1)/segs)*(FAR-PLAYER_Z);
      const a=project(-1.6,z0),b=project(1.6,z0),c=project(1.6,z1),d=project(-1.6,z1);
      const shade=i%2===0?theme.road:'#23232c';
      ctx.fillStyle=shade;
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();ctx.fill();
    }
    // Edge rails
    for(const side of [-1,1]){
      const near=project(side*1.55,PLAYER_Z),far=project(side*1.55,FAR*0.95);
      ctx.strokeStyle=theme.roadEdge;ctx.lineWidth=3;ctx.beginPath();
      ctx.moveTo(near.x,near.y);ctx.lineTo(far.x,far.y);ctx.stroke();
    }
    // Scrolling dashed lane lines
    const dashPhase=scroll%3.2;
    for(let laneLine=0;laneLine<2;laneLine++){
      const wx=laneWorldX(laneLine+0.5);
      for(let k=0;k<14;k++){
        const zA=PLAYER_Z+((k+dashPhase)%14)*(FAR-PLAYER_Z)/14;
        const zB=zA+1.1;
        if(zB>FAR)continue;
        const p0=project(wx,zA),p1=project(wx,zB);
        ctx.strokeStyle=theme.line;ctx.globalAlpha=0.55;ctx.lineWidth=Math.max(1.2,p0.scale*2.2);
        ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.stroke();
        ctx.globalAlpha=1;
      }
    }
  }

  function drawMeshBox(p,w,h,color,topColor){
    const hw=w*p.scale*28,hh=h*p.scale*36;
    const x=p.x,y=p.y;
    ctx.fillStyle=color;
    ctx.beginPath();
    ctx.moveTo(x-hw,y);ctx.lineTo(x-hw*0.85,y-hh);ctx.lineTo(x+hw*0.85,y-hh);ctx.lineTo(x+hw,y);
    ctx.closePath();ctx.fill();
    if(topColor){
      ctx.fillStyle=topColor;
      ctx.beginPath();
      ctx.moveTo(x-hw*0.85,y-hh);ctx.lineTo(x,y-hh-hh*0.18);ctx.lineTo(x+hw*0.85,y-hh);ctx.closePath();ctx.fill();
    }
  }

  function drawCoin(p,spin){
    const r=Math.max(4,10*p.scale);
    ctx.save();ctx.translate(p.x,p.y-r*1.2);ctx.rotate(spin);
    const g=ctx.createRadialGradient(0,0,1,0,0,r);
    g.addColorStop(0,'#FFE566');g.addColorStop(1,'#E0A100');
    ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,r,r*0.72,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.55)';ctx.lineWidth=1.5;ctx.stroke();
    ctx.restore();
  }

  function drawPower(p,type){
    const r=Math.max(6,12*p.scale);
    ctx.save();ctx.translate(p.x,p.y-r*1.4);
    if(type==='shield'){
      ctx.fillStyle='rgba(100,200,255,0.85)';
      ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();
      ctx.moveTo(-r*0.4,0);ctx.lineTo(-r*0.05,r*0.45);ctx.lineTo(r*0.5,-r*0.35);ctx.stroke();
    }else{
      ctx.fillStyle='rgba(255,80,120,0.9)';
      ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(0,0,r*0.45,0,Math.PI*1.4);ctx.stroke();
    }
    ctx.restore();
  }

  function playerJumpOffset(){
    if(!jumping)return 0;
    // Hang arc: up fast, hang, down
    const t=jumpT;
    if(t<0.35)return -easeOutCubic(t/0.35)*52;
    if(t<0.55)return -52;
    return -52*(1-easeOutCubic((t-0.55)/0.45));
  }

  function drawPlayer(){
    const wx=laneWorldX(laneX);
    const p=project(wx,PLAYER_Z);
    const jumpY=playerJumpOffset();
    const slideSquash=sliding?0.55:1;
    const bodyH=(sliding?0.42:0.95)*squash*slideSquash;
    const bodyW=sliding?0.7:0.48;
    const y=p.y+jumpY;

    if(shield){
      ctx.fillStyle='rgba(100,200,255,0.22)';
      ctx.beginPath();ctx.ellipse(p.x,y-28*p.scale,28*p.scale,34*p.scale,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(160,230,255,0.7)';ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(p.x,y-28*p.scale,28*p.scale,34*p.scale,0,0,Math.PI*2);ctx.stroke();
    }
    if(hitFlash>0){
      ctx.fillStyle=`rgba(255,40,40,${Math.min(0.55,hitFlash/12)})`;
      ctx.beginPath();ctx.arc(p.x,y-20*p.scale,32*p.scale,0,Math.PI*2);ctx.fill();
    }

    // Geometric runner: legs + torso + head
    const s=p.scale;
    const legPhase=started&&!jumping&&!sliding?Math.sin(scroll*8)*6*s:0;
    ctx.fillStyle='#1A1714';
    ctx.fillRect(p.x-10*s+legPhase,y-8*s,7*s,14*s*bodyH);
    ctx.fillRect(p.x+3*s-legPhase,y-8*s,7*s,14*s*bodyH);
    ctx.fillStyle=theme.accent;
    const th=36*s*bodyH,tw=18*s*bodyW;
    ctx.beginPath();
    ctx.moveTo(p.x-tw,y-10*s);ctx.lineTo(p.x-tw*0.8,y-10*s-th);ctx.lineTo(p.x+tw*0.8,y-10*s-th);ctx.lineTo(p.x+tw,y-10*s);
    ctx.closePath();ctx.fill();
    ctx.fillStyle='#FFE0C2';
    ctx.beginPath();ctx.arc(p.x,y-10*s-th-8*s,9*s,0,Math.PI*2);ctx.fill();
    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.28)';
    ctx.beginPath();ctx.ellipse(p.x,p.y+2,16*s*(sliding?1.2:1),5*s,0,0,Math.PI*2);ctx.fill();
  }

  function drawParticles(){
    particles.forEach(pt=>{
      ctx.globalAlpha=Math.max(0,pt.life);
      ctx.fillStyle=pt.color;
      ctx.beginPath();ctx.arc(pt.x,pt.y,pt.r,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
    });
  }

  function burst(x,y,color,n){
    for(let i=0;i<(n||8);i++){
      particles.push({
        x,y,r:2+Math.random()*3,
        vx:(Math.random()-0.5)*4,vy:-1-Math.random()*3,
        life:1,color:color||'#FFD166',
      });
    }
  }

  function updatePowerHud(){
    const el=document.getElementById('rrPower');
    if(!el)return;
    const bits=[];
    if(shield)bits.push('Shield');
    if(magnet)bits.push('Magnet');
    if(bits.length){el.hidden=false;el.textContent=bits.join(' · ');}
    else el.hidden=true;
  }

  function endGame(){
    if(gameOver)return;
    gameOver=true;cancelAnimationFrame(raf);raf=null;
    if(keyHandler){window.removeEventListener('keydown',keyHandler);keyHandler=null;}
    const final=Math.floor(dist);
    if(typeof setGamePB==='function') bestScore=setGamePB('rushrunner', final) ?? Math.max(bestScore, final);
    else if(final>bestScore){bestScore=final;localStorage.setItem('rushrunner_best',String(bestScore));}
    const vsBest=typeof formatVsBest==='function'?formatVsBest('rushrunner', final):`Best ${bestScore}m`;
    if(gs)gs.setOutcome('lost');
    if(typeof recordGameResult==='function')recordGameResult('rushrunner',false);
    buzz('lose');
    const div=document.getElementById('rrOverlay');
    if(!div)return;
    div.className='rr-start rr-start--over';
    div.style.display='flex';
    const shareStats={scoreLine:`${final}m`,score:final,meta:`${coins} coins · ${vsBest}`,text:`I ran ${final}m on Chaupaal Rush Runner! Can you beat me?`};
    const shareCard=typeof buildGameShareCard==='function'?buildGameShareCard('rushrunner',shareStats):'';
    div.innerHTML=`
      ${typeof gameResultHtml==='function'?gameResultHtml({
        glyph:'·',
        title:`${final}m run`,
        subtitle:`${coins} coins`,
        vsBest,
        shareCardHtml:shareCard,
        actions:[
          {label:'Play again',primary:true,id:'again'},
          {label:'Share',primary:false,id:'share'},
          {label:'Challenge friend',primary:false,id:'challenge'},
          {label:'Post to story',primary:false,id:'story'},
        ],
      }):`<div style="color:#fff;text-align:center;"><div>${final}m</div><button type="button" id="rrRestart">Run again</button></div>`}
    `;
    if(typeof wireGameResultActions==='function'){
      wireGameResultActions(div,{
        again:()=>{close();openRushRunner();},
        share:()=>{if(typeof shareGameResult==='function')shareGameResult('rushrunner',shareStats);},
        challenge:async()=>{
          if(typeof openFriendPickerSheet==='function'){
            const f=await openFriendPickerSheet({title:'Beat my Rush score',subtitle:`Challenge with ${final}m`});
            if(f&&typeof shareGameResult==='function'){
              shareGameResult('rushrunner',{...shareStats,text:`Hey ${f.name} — beat my ${final}m on Rush Runner!`});
            }
          } else if(typeof shareGameResult==='function') shareGameResult('rushrunner',shareStats);
        },
        story:()=>{if(typeof postGameScoreStory==='function')postGameScoreStory('rushrunner',{score:final,scoreLine:`${final}m`,meta:vsBest});},
      });
    } else {
      const actions=div.querySelectorAll('[data-result-action]');
      (actions[0]||document.getElementById('rrRestart'))?.addEventListener('click',()=>{close();openRushRunner();});
    }
  }

  function update(ts){
    if(!alive()||gameOver||!started)return;
    const dtMs=Math.min(ts-lastTime,40);lastTime=ts;
    const dt=dtMs/1000;

    // Ramp then plateau
    const ramp=Math.min(1,dist/RAMP_UNTIL);
    speed=BASE_SPEED+(MAX_SPEED-BASE_SPEED)*(1-Math.pow(1-ramp,2));
    dist+=speed*dt*3.2;
    scroll+=speed*dt;
    score=Math.floor(dist);

    const scoreEl=document.getElementById('rrScore');
    if(scoreEl)scoreEl.textContent=score+'m';
    const coinEl=document.getElementById('rrCoins');
    if(coinEl)coinEl.textContent='◆ '+coins;

    // Lane lerp 120–180ms
    if(laneT<1){
      laneT=Math.min(1,laneT+dtMs/LANE_LERP_MS);
      laneX=laneFrom+(laneTo-laneFrom)*easeOutCubic(laneT);
    }else laneX=laneTo;

    if(jumping){
      jumpT+=dt/0.62;
      if(jumpT>=1){jumping=false;jumpT=0;squash=0.85;schedule(()=>{if(alive())squash=1;},120);}
    }
    if(sliding){
      slideT+=dt/0.55;
      if(slideT>=1){sliding=false;slideT=0;squash=1;}
    }
    if(hitFlash>0)hitFlash-=dt*18;
    if(shake>0)shake=Math.max(0,shake-dt*8);
    if(shieldTimer>0){shieldTimer-=dt;if(shieldTimer<=0)shield=false;}
    if(magnetTimer>0){magnetTimer-=dt;if(magnetTimer<=0)magnet=false;}
    updatePowerHud();

    const dz=speed*dt;
    obstacles.forEach(o=>o.z-=dz);
    coinItems.forEach(c=>{
      c.z-=dz;
      if(magnet&&!c.collected){
        // Pull toward player lane & depth
        c.lane+=(laneX-c.lane)*Math.min(1,dt*4.5);
        c.z+=(PLAYER_Z+0.4-c.z)*Math.min(1,dt*3.2);
      }
    });
    powerups.forEach(p=>p.z-=dz);
    particles.forEach(pt=>{pt.x+=pt.vx;pt.y+=pt.vy;pt.vy+=0.12;pt.life-=dt*1.8;});
    particles=particles.filter(pt=>pt.life>0);

    obstacles=obstacles.filter(o=>o.z>-1);
    coinItems=coinItems.filter(c=>c.z>-1&&!c.collected);
    powerups=powerups.filter(p=>p.z>-1);

    spawnAcc+=dt;coinAcc+=dt;powerAcc+=dt;
    const obsInterval=Math.max(0.55,1.15-ramp*0.5);
    if(spawnAcc>=obsInterval){spawnAcc=0;spawnObstacle(FAR+Math.random()*4);
      // Foreshadow twin obstacle sometimes with a clear lane
      if(Math.random()<0.28){
        const other=(obstacles[obstacles.length-1].lane+1+Math.floor(Math.random()*2))%LANES;
        obstacles.push({lane:other,z:FAR+2+Math.random()*2,type:Math.random()<0.4?'low':'high',kind:'crate',w:0.55,h:Math.random()<0.4?0.35:0.85});
      }
    }
    if(coinAcc>=1.1){coinAcc=0;spawnCoinRow(FAR+Math.random()*3);}
    if(powerAcc>=7.5){powerAcc=0;spawnPowerup(FAR+1);}

    // Fair hitboxes at player depth
    const pz=PLAYER_Z;
    for(let i=0;i<obstacles.length;i++){
      const o=obstacles[i];
      if(Math.abs(o.z-pz)>0.85)continue;
      if(Math.abs(o.lane-laneX)>0.55)continue;
      const clearLow=jumping&&o.type==='low'&&jumpT>0.12&&jumpT<0.88;
      const clearHigh=sliding&&o.type==='high';
      if(clearLow||clearHigh)continue;
      if(shield){
        shield=false;shieldTimer=0;hitFlash=10;shake=1;buzz('invalid');
        o.z=-2;burst(cssW/2,cssH*0.7,'#7DD3FC',10);
        continue;
      }
      hitFlash=14;shake=1.4;endGame();
      return;
    }

    coinItems.forEach(c=>{
      if(c.collected)return;
      const near=Math.abs(c.z-pz)<1.1&&Math.abs(c.lane-laneX)<0.65;
      if(!near)return;
      c.collected=true;coins++;score+=5;dist+=2;
      const p=project(laneWorldX(c.lane),Math.max(0.5,c.z));
      burst(p.x,p.y-10,'#FFD166',6);
      buzz('place');
    });

    for(let i=powerups.length-1;i>=0;i--){
      const p=powerups[i];
      if(Math.abs(p.z-pz)>1||Math.abs(p.lane-laneX)>0.6)continue;
      if(p.type==='shield'){shield=true;shieldTimer=6.5;}
      else{magnet=true;magnetTimer=5.5;}
      powerups.splice(i,1);buzz('valid');
      const scr=project(laneWorldX(p.lane),pz);
      burst(scr.x,scr.y-20,p.type==='shield'?'#7DD3FC':'#FF6B8A',12);
    }

    // Draw
    ctx.save();
    if(shake>0)ctx.translate((Math.random()-0.5)*shake*10,(Math.random()-0.5)*shake*6);
    ctx.clearRect(0,0,cssW,cssH);
    drawSky();drawRoad();

    // Depth sort drawables
    const drawList=[];
    obstacles.forEach(o=>drawList.push({z:o.z,kind:'obs',o}));
    coinItems.forEach(c=>{if(!c.collected)drawList.push({z:c.z,kind:'coin',c});});
    powerups.forEach(p=>drawList.push({z:p.z,kind:'pow',p}));
    drawList.sort((a,b)=>b.z-a.z);
    drawList.forEach(item=>{
      if(item.kind==='obs'){
        const o=item.o;const p=project(laneWorldX(o.lane),o.z);
        const col=o.type==='low'?'#C45C26':'#4A5568';
        const top=o.type==='low'?'#E07A3D':'#718096';
        drawMeshBox(p,o.w,o.h,col,top);
        // Foreshadow silhouette when far
        if(o.z>18){
          ctx.fillStyle='rgba(255,80,80,0.15)';
          ctx.beginPath();ctx.arc(p.x,p.y-8,6+p.scale*4,0,Math.PI*2);ctx.fill();
        }
      }else if(item.kind==='coin'){
        drawCoin(project(laneWorldX(item.c.lane),item.c.z),scroll*3+item.c.z);
      }else{
        drawPower(project(laneWorldX(item.p.lane),item.p.z),item.p.type);
      }
    });
    drawPlayer();
    drawParticles();
    ctx.restore();

    if(!gameOver&&alive())raf=requestAnimationFrame(update);
  }

  function startGame(){
    if(!alive())return;
    const ov=document.getElementById('rrOverlay');
    if(ov)ov.style.display='none';
    started=true;lastTime=performance.now();
    obstacles=[];coinItems=[];powerups=[];particles=[];
    spawnObstacle(22);spawnObstacle(32);spawnCoinRow(26);
    buzz('select');
    raf=requestAnimationFrame(update);
  }

  document.getElementById('rrBack').addEventListener('click',()=>close());
  document.getElementById('rrStart').addEventListener('click',startGame);
  document.getElementById('rrLeft').addEventListener('click',()=>{if(started&&!gameOver)setLane(laneTo-1);});
  document.getElementById('rrRight').addEventListener('click',()=>{if(started&&!gameOver)setLane(laneTo+1);});
  document.getElementById('rrJump').addEventListener('click',doJump);
  document.getElementById('rrSlide').addEventListener('click',doSlide);

  let tx=0,ty=0;
  canvas.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;},{passive:true});
  canvas.addEventListener('touchend',e=>{
    if(!alive()||gameOver||!started)return;
    const dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;
    if(Math.abs(dx)<18&&Math.abs(dy)<18)return;
    if(Math.abs(dx)>Math.abs(dy)){if(dx<-28)setLane(laneTo-1);else if(dx>28)setLane(laneTo+1);}
    else{if(dy<-28)doJump();else if(dy>28)doSlide();}
  },{passive:true});

  keyHandler=(e)=>{
    if(!alive()||gameOver||!started)return;
    if(e.key==='ArrowLeft'){e.preventDefault();setLane(laneTo-1);}
    else if(e.key==='ArrowRight'){e.preventDefault();setLane(laneTo+1);}
    else if(e.key==='ArrowUp'){e.preventDefault();doJump();}
    else if(e.key==='ArrowDown'){e.preventDefault();doSlide();}
  };
  window.addEventListener('keydown',keyHandler);
}

// ===================== TIP TAP (Match-3 juice) =====================
function openTipTap(){
  const COLS=8,ROWS=8;
  const PALETTE=[
    {id:0,fill:'#E63946',glow:'#FF6B6B'},
    {id:1,fill:'#F4A261',glow:'#FFD166'},
    {id:2,fill:'#2A9D8F',glow:'#5EEAD4'},
    {id:3,fill:'#4C75D9',glow:'#93C5FD'},
    {id:4,fill:'#9B5DE5',glow:'#D8B4FE'},
    {id:5,fill:'#E76F51',glow:'#FDBA74'},
  ];
  const SPECIAL={bomb:'bomb',rainbow:'rainbow',line:'line'};

  let level=parseInt(localStorage.getItem('tiptap_level')||localStorage.getItem('candyburst_level')||'1',10)||1;
  let board=[],score=0,moves=0,targetScore=0,maxMoves=0;
  let selected=null,animating=false,gameOver=false;
  let combo=0,cascadeTimer=null,fxLayer=null;
  let cellSize=40;

  const LEVELS=Array.from({length:100},(_,i)=>({
    level:i+1,
    target:500*(i+1)+Math.floor(i/5)*1000,
    moves:20+Math.floor(i/3)*2,
    board:ROWS,
  }));

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;';

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
  if(typeof prepareGameOverlay==='function')prepareGameOverlay(overlay,{theme:'dark',gameId:'tiptap'});

  const alive=()=>gs?gs.alive():true;
  const schedule=(fn,ms)=>{
    if(gs)return gs.schedule(fn,ms);
    return setTimeout(fn,ms);
  };
  const close=()=>{
    if(cascadeTimer){clearTimeout(cascadeTimer);cascadeTimer=null;}
    if(gs)gs.close();else overlay.remove();
  };
  const buzz=(a)=>{if(typeof gameFeedback==='function')gameFeedback(a);};

  function randomPiece(allowSpecial){
    if(allowSpecial&&Math.random()<0.04){
      const kinds=[SPECIAL.bomb,SPECIAL.line,SPECIAL.rainbow];
      return {color:null,special:kinds[Math.floor(Math.random()*kinds.length)],id:uid()};
    }
    const c=PALETTE[Math.floor(Math.random()*PALETTE.length)];
    return {color:c.id,special:null,id:uid()};
  }
  let _uid=1;function uid(){return _uid++;}

  function startLevel(lvl){
    if(!alive())return;
    const cfg=LEVELS[Math.min(lvl-1,LEVELS.length-1)];
    targetScore=cfg.target;maxMoves=cfg.moves;moves=cfg.moves;score=0;combo=0;gameOver=false;selected=null;animating=false;
    board=Array(ROWS).fill(null).map(()=>Array(COLS).fill(null).map(()=>randomPiece()));
    let guard=0;
    while(findMatches().length&&guard++<40)board=Array(ROWS).fill(null).map(()=>Array(COLS).fill(null).map(()=>randomPiece()));
    const sub=document.getElementById('cbSub');
    if(sub)sub.textContent='Level '+level;
    const tgt=document.getElementById('cbTarget');
    if(tgt)tgt.textContent=targetScore.toLocaleString();
    render({fresh:true});
  }

  function findMatches(){
    const matches=new Set();
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS-2;c++){
      const p=board[r][c];if(p?.color==null)continue;
      if(board[r][c+1]?.color===p.color&&board[r][c+2]?.color===p.color){
        let len=3;while(c+len<COLS&&board[r][c+len]?.color===p.color)len++;
        for(let i=0;i<len;i++)matches.add(`${r},${c+i}`);
      }
    }
    for(let c=0;c<COLS;c++) for(let r=0;r<ROWS-2;r++){
      const p=board[r][c];if(p?.color==null)continue;
      if(board[r+1][c]?.color===p.color&&board[r+2][c]?.color===p.color){
        let len=3;while(r+len<ROWS&&board[r+len][c]?.color===p.color)len++;
        for(let i=0;i<len;i++)matches.add(`${r+i},${c}`);
      }
    }
    return [...matches].map(k=>{const[r,c]=k.split(',').map(Number);return{r,c};});
  }

  function spawnFx(r,c,type){
    if(!fxLayer)return;
    const grid=document.getElementById('cbGrid');
    if(!grid)return;
    const cell=grid.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    const host=cell||grid;
    const rect=host.getBoundingClientRect();
    const layerRect=fxLayer.getBoundingClientRect();
    const el=document.createElement('div');
    el.className='tt-fx tt-fx--'+type;
    el.style.left=(rect.left-layerRect.left+rect.width/2)+'px';
    el.style.top=(rect.top-layerRect.top+rect.height/2)+'px';
    fxLayer.appendChild(el);
    schedule(()=>{el.remove();},700);
  }

  function clearMatches(matches){
    if(!alive())return;
    combo++;
    const pts=matches.length*10*combo;score+=pts;
    if(combo>1)buzz('valid');else buzz('place');

    matches.forEach(({r,c})=>{
      const cell=document.querySelector(`#cbGrid [data-r="${r}"][data-c="${c}"]`);
      if(cell){cell.classList.add('tt-piece--pop');}
      spawnFx(r,c,'spark');
    });

    const leaveSpecial=matches.length>=5;
    const specialKind=matches.length>=8?SPECIAL.rainbow:SPECIAL.bomb;
    const anchor=matches[0];

    schedule(()=>{
      if(!alive())return;
      const snap=matches.map(({r,c})=>({r,c,p:board[r][c]}));
      const rainColor=snap.find(x=>x.p&&x.p.color!=null)?.p?.color ?? 0;
      snap.forEach(({r,c,p})=>{
        if(p?.special===SPECIAL.bomb){
          spawnFx(r,c,'bomb');
          for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
            if(board[r+dr]?.[c+dc]!=null)board[r+dr][c+dc]=null;
          }
        }else if(p?.special===SPECIAL.line){
          spawnFx(r,c,'line');
          for(let rr=0;rr<ROWS;rr++)board[rr][c]=null;
          for(let cc=0;cc<COLS;cc++)board[r][cc]=null;
        }else if(p?.special===SPECIAL.rainbow){
          spawnFx(r,c,'rainbow');
          for(let rr=0;rr<ROWS;rr++)for(let cc=0;cc<COLS;cc++){
            if(board[rr][cc]?.color===rainColor)board[rr][cc]=null;
          }
        }else if(board[r]?.[c]){
          board[r][c]=null;
        }
      });
      if(leaveSpecial&&anchor&&board[anchor.r]){
        board[anchor.r][anchor.c]={color:null,special:specialKind,id:uid()};
      }
      dropPieces();
    },220);
  }

  function dropPieces(){
    if(!alive())return;
    const fell=[];
    for(let c=0;c<COLS;c++){
      let write=ROWS-1;
      for(let r=ROWS-1;r>=0;r--){
        if(board[r][c]!==null){
          if(write!==r){
            board[write][c]=board[r][c];
            board[r][c]=null;
            fell.push({r:write,c,from:r});
          }
          write--;
        }
      }
      for(let r=write;r>=0;r--){
        board[r][c]=randomPiece(true);
        fell.push({r,c,from:-1});
      }
    }
    render({fall:fell});
    const newMatches=findMatches();
    if(newMatches.length){
      if(cascadeTimer)clearTimeout(cascadeTimer);
      cascadeTimer=schedule(()=>{cascadeTimer=null;clearMatches(newMatches);},320);
    }else{
      combo=0;animating=false;checkGameOver();
    }
  }

  function trySwap(r1,c1,r2,c2){
    if(!alive()||animating||gameOver)return;
    if(Math.abs(r1-r2)+Math.abs(c1-c2)!==1)return;
    animating=true;
    const tmp=board[r1][c1];board[r1][c1]=board[r2][c2];board[r2][c2]=tmp;
    render({swap:[[r1,c1],[r2,c2]]});
    const matches=findMatches();
    if(matches.length){
      moves--;
      schedule(()=>clearMatches(matches),160);
    }else{
      schedule(()=>{
        const t2=board[r1][c1];board[r1][c1]=board[r2][c2];board[r2][c2]=t2;
        render({swap:[[r1,c1],[r2,c2]]});
        animating=false;selected=null;
        const grid=document.getElementById('cbGrid');
        if(typeof shakeInvalidMove==='function') shakeInvalidMove(grid,{toast:'No match'});
        else {buzz('invalid');if(typeof showToast==='function')showToast('No match');}
      },180);
    }
  }

  function checkGameOver(){
    if(score>=targetScore){showLevelComplete();return;}
    if(moves<=0){showGameOver();return;}
  }

  function showLevelComplete(){
    gameOver=true;
    localStorage.setItem('tiptap_level',String(level+1));
    if(typeof setGamePB==='function') setGamePB('tiptap', score);
    const vsBest=typeof formatVsBest==='function'?formatVsBest('tiptap', score):'';
    if(gs)gs.setOutcome('won');
    if(typeof recordGameResult==='function')recordGameResult('tiptap',true);
    buzz('complete');
    const div=document.getElementById('cbOverlay');if(!div)return;div.style.display='flex';
    const shareStats={scoreLine:score.toLocaleString(),score,meta:`Level ${level} · ${vsBest||''}`,text:`Cleared Tip Tap level ${level} with ${score.toLocaleString()} on Chaupaal!`};
    const shareCard=typeof buildGameShareCard==='function'?buildGameShareCard('tiptap',shareStats):'';
    div.innerHTML=`
      ${typeof gameResultHtml==='function'?gameResultHtml({
        glyph:'✓',
        title:`Level ${level} complete`,
        subtitle:`Score ${score.toLocaleString()}`,
        vsBest:vsBest||undefined,
        shareCardHtml:shareCard,
        actions:[
          {label:`Level ${level+1}`,primary:true,id:'again'},
          {label:'Share',primary:false,id:'share'},
          {label:'Challenge friend',primary:false,id:'challenge'},
          {label:'Post to story',primary:false,id:'story'},
        ],
      }):`<div><button type="button" id="cbNext">Next</button></div>`}
    `;
    if(typeof wireGameResultActions==='function'){
      wireGameResultActions(div,{
        again:()=>{level++;startLevel(level);document.getElementById('cbOverlay').style.display='none';},
        share:()=>{if(typeof shareGameResult==='function')shareGameResult('tiptap',shareStats);},
        challenge:async()=>{
          if(typeof openFriendPickerSheet==='function'){
            const f=await openFriendPickerSheet({title:'Challenge · Tip Tap'});
            if(f&&typeof openFriendShareFollowup==='function'){
              await openFriendShareFollowup(f,'tiptap',{...shareStats,friendText:`Hey ${f.name} — beat my Tip Tap score!`});
            } else if(f&&typeof shareGameResult==='function'){
              shareGameResult('tiptap',{...shareStats,text:`Hey ${f.name} — beat my Tip Tap score!`});
            } else if(typeof shareGameResult==='function') shareGameResult('tiptap',shareStats);
          } else if(typeof shareGameResult==='function') shareGameResult('tiptap',shareStats);
        },
        story:()=>{if(typeof postGameScoreStory==='function')postGameScoreStory('tiptap',{...shareStats,score});},
      });
    } else {
      (div.querySelector('[data-result-action]')||document.getElementById('cbNext'))?.addEventListener('click',()=>{
        level++;startLevel(level);document.getElementById('cbOverlay').style.display='none';
      });
    }
  }

  function showGameOver(){
    gameOver=true;
    if(typeof setGamePB==='function') setGamePB('tiptap', score);
    const vsBest=typeof formatVsBest==='function'?formatVsBest('tiptap', score):'';
    if(gs)gs.setOutcome('lost');
    if(typeof recordGameResult==='function')recordGameResult('tiptap',false);
    buzz('lose');
    const div=document.getElementById('cbOverlay');if(!div)return;div.style.display='flex';
    const shareStats={scoreLine:score.toLocaleString(),score,meta:`Level ${level} · ${vsBest||''}`,text:`Scored ${score.toLocaleString()} on Tip Tap (Chaupaal). Can you beat me?`};
    const shareCard=typeof buildGameShareCard==='function'?buildGameShareCard('tiptap',shareStats):'';
    div.innerHTML=`
      ${typeof gameResultHtml==='function'?gameResultHtml({
        glyph:'·',
        title:'Out of moves',
        subtitle:`Score ${score.toLocaleString()} / ${targetScore.toLocaleString()} · Level ${level}`,
        vsBest:vsBest||undefined,
        shareCardHtml:shareCard,
        actions:[
          {label:'Play again',primary:true,id:'again'},
          {label:'Share',primary:false,id:'share'},
          {label:'Challenge friend',primary:false,id:'challenge'},
          {label:'Post to story',primary:false,id:'story'},
        ],
      }):`<div><button type="button" id="cbRetry">Retry</button></div>`}
    `;
    if(typeof wireGameResultActions==='function'){
      wireGameResultActions(div,{
        again:()=>{startLevel(level);document.getElementById('cbOverlay').style.display='none';},
        share:()=>{if(typeof shareGameResult==='function')shareGameResult('tiptap',shareStats);},
        challenge:async()=>{
          if(typeof openFriendPickerSheet==='function'){
            const f=await openFriendPickerSheet({title:'Challenge · Tip Tap'});
            if(f&&typeof openFriendShareFollowup==='function'){
              await openFriendShareFollowup(f,'tiptap',{...shareStats,friendText:`Hey ${f.name} — beat my Tip Tap score!`});
            } else if(f&&typeof shareGameResult==='function') shareGameResult('tiptap',{...shareStats,text:`Hey ${f.name} — beat my Tip Tap score!`});
          } else if(typeof shareGameResult==='function') shareGameResult('tiptap',shareStats);
        },
        story:()=>{if(typeof postGameScoreStory==='function')postGameScoreStory('tiptap',{...shareStats,score});},
      });
    } else {
      (div.querySelector('[data-result-action]')||document.getElementById('cbRetry'))?.addEventListener('click',()=>{
        startLevel(level);document.getElementById('cbOverlay').style.display='none';
      });
    }
  }

  function pieceHtml(p){
    if(!p)return '';
    if(p.special===SPECIAL.bomb)return '<span class="tt-gem tt-gem--bomb" aria-hidden="true"></span>';
    if(p.special===SPECIAL.rainbow)return '<span class="tt-gem tt-gem--rainbow" aria-hidden="true"></span>';
    if(p.special===SPECIAL.line)return '<span class="tt-gem tt-gem--line" aria-hidden="true"></span>';
    const pal=PALETTE[p.color]||PALETTE[0];
    return `<span class="tt-gem" style="--tt-fill:${pal.fill};--tt-glow:${pal.glow}" aria-hidden="true"></span>`;
  }

  function render(opts){
    if(!alive())return;
    const o=opts||{};
    const grid=document.getElementById('cbGrid');if(!grid)return;
    const scoreEl=document.getElementById('cbScore');if(scoreEl)scoreEl.textContent=score.toLocaleString();
    const movesEl=document.getElementById('cbMoves');if(movesEl)movesEl.textContent=String(moves);
    const progEl=document.getElementById('cbProgress');if(progEl)progEl.style.width=Math.min(100,(score/targetScore)*100)+'%';

    grid.innerHTML='';
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const cell=document.createElement('button');
      cell.type='button';
      const p=board[r][c];
      const isSel=selected&&selected[0]===r&&selected[1]===c;
      cell.className='tt-cell game-tap-target'+(isSel?' is-selected':'');
      cell.dataset.r=r;cell.dataset.c=c;
      cell.innerHTML=pieceHtml(p);
      if(o.fresh)cell.classList.add('tt-piece--enter');
      if(o.fall){
        const f=o.fall.find(x=>x.r===r&&x.c===c);
        if(f){
          cell.classList.add('tt-piece--fall');
          const dist=f.from<0?(r+1):(r-f.from);
          cell.style.setProperty('--tt-fall',Math.min(12,Math.max(1,dist))*cellSize+'px');
        }
      }
      cell.addEventListener('click',()=>{
        if(animating||gameOver)return;
        const nr=+cell.dataset.r,nc=+cell.dataset.c;
        if(!selected){selected=[nr,nc];buzz('select');render();}
        else if(selected[0]===nr&&selected[1]===nc){selected=null;render();}
        else{trySwap(selected[0],selected[1],nr,nc);selected=null;}
      });
      grid.appendChild(cell);
    }
    // Measure cell for fall distance
    const sample=grid.querySelector('.tt-cell');
    if(sample)cellSize=sample.getBoundingClientRect().height||40;
  }

  overlay.innerHTML=`
    ${gameChromeHtml({title:'Tip Tap',subtitle:`Level ${level}`,backId:'cbBack',rightHtml:'<span class="game-chrome-metric" id="cbScore">0</span>'})}
    <div class="tt-meter">
      <div class="tt-meter-row">
        <span>Target: <strong id="cbTarget">${LEVELS[Math.min(level-1,99)].target.toLocaleString()}</strong></span>
        <span>Moves: <strong id="cbMoves">${LEVELS[Math.min(level-1,99)].moves}</strong></span>
      </div>
      <div class="tt-meter-track"><div id="cbProgress" class="tt-meter-fill"></div></div>
    </div>
    <div class="tt-board-wrap">
      <div id="cbGrid" class="tt-grid" style="grid-template-columns:repeat(${COLS},1fr)"></div>
      <div id="cbFx" class="tt-fx-layer" aria-hidden="true"></div>
    </div>
    <div id="cbOverlay" class="tt-result-overlay"></div>
  `;
  // Fix subtitle id for level updates
  const subEl=overlay.querySelector('.game-chrome-subtitle');
  if(subEl)subEl.id='cbSub';

  fxLayer=document.getElementById('cbFx');
  document.getElementById('cbBack').addEventListener('click',()=>close());

  // Swipe-to-swap on grid
  const gridEl=document.getElementById('cbGrid');
  let sx=0,sy=0,sCell=null;
  gridEl.addEventListener('touchstart',e=>{
    const t=e.touches[0];
    const el=document.elementFromPoint(t.clientX,t.clientY)?.closest?.('.tt-cell');
    if(!el)return;
    sx=t.clientX;sy=t.clientY;sCell=el;
  },{passive:true});
  gridEl.addEventListener('touchend',e=>{
    if(!sCell||animating||gameOver){sCell=null;return;}
    const t=e.changedTouches[0];
    const dx=t.clientX-sx,dy=t.clientY-sy;
    const r=+sCell.dataset.r,c=+sCell.dataset.c;
    sCell=null;
    if(Math.abs(dx)<22&&Math.abs(dy)<22)return;
    let nr=r,nc=c;
    if(Math.abs(dx)>Math.abs(dy))nc+=dx>0?1:-1;
    else nr+=dy>0?1:-1;
    if(nr<0||nr>=ROWS||nc<0||nc>=COLS)return;
    selected=null;
    trySwap(r,c,nr,nc);
  },{passive:true});

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
