// ===================== RUSH RUNNER (Perspective Subway-lite) =====================
function openRushRunner(){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;';

  const LANES=3;
  const LANE_LERP_MS=130;
  const FAR=42;
  const FOCAL=9;
  const PLAYER_Z=2.4;
  const BASE_SPEED=9.5;
  const MAX_SPEED=26;
  const RAMP_UNTIL=520;
  /** Collision: interpolated laneX + forgiving lane width; depth matches visible contact. */
  const HIT_LANE=0.40;
  const HIT_DEPTH=0.70;
  const COYOTE_MS=90;
  const BUFFER_MS=110;

  let lane=1,laneX=1,laneFrom=1,laneTo=1,laneT=1;
  let score=0,coins=0,dist=0,speed=BASE_SPEED,gameOver=false,started=false,dying=false;
  let obstacles=[],coinItems=[],powerups=[],particles=[];
  let jumping=false,sliding=false,jumpT=0,slideT=0,squash=1;
  let hitFlash=0,shield=false,shieldTimer=0,magnet=false,magnetTimer=0;
  let shieldPulse=0,saveBanner=0,deathFocus=null,deathStall=0;
  let landCoyote=0,jumpBuffer=0,slideBuffer=0;
  let bestScore=(typeof getGamePB==='function'?getGamePB('rushrunner'):null) ?? (parseInt(localStorage.getItem('rushrunner_best')||'0',10)||0);
  let raf=null,lastTime=0,spawnAcc=0,coinAcc=0,powerAcc=0,scroll=0;
  let resizeObs=null,cssW=320,cssH=480,shake=0;
  let keyHandler=null;
  let pauseCtrl=null;
  let teachPhase=0;

  // Dark roads + bright rails/lines so every theme stays readable at speed
  const THEMES=[
    {name:'Mumbai Streets',skyTop:'#FFC56A',skyBot:'#FF7A3D',road:'#1C1C24',roadAlt:'#252530',roadEdge:'#FFB86B',line:'#FFE9A0',accent:'#E8663D',bldg:['#4A3228','#6B4634','#2E221C','#5A3A28']},
    {name:'Delhi Metro',skyTop:'#9AD4F5',skyBot:'#4CC9F0',road:'#14141E',roadAlt:'#1C1C2A',roadEdge:'#C77DFF',line:'#E0B8FF',accent:'#4CC9F0',bldg:['#2A1B6E','#3548B8','#16162A','#3A3E55']},
    {name:'Jaipur Fort',skyTop:'#FFC4B0',skyBot:'#E76F51',road:'#1A100C',roadAlt:'#261810',roadEdge:'#FFC857',line:'#FFE08A',accent:'#F72585',bldg:['#7A1C20','#9A3208','#4A0A12','#8A1C18']},
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
    if(pauseCtrl){pauseCtrl.destroy();pauseCtrl=null;}
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
    ${gameChromeHtml({title:'Rush Runner',subtitle:theme.name,backId:'rrBack',pauseId:'rrPause',rightHtml:'<span class="game-chrome-metric" id="rrScore">0m</span>'})}
    <div class="rr-stage" id="rrGame">
      <canvas id="rrCanvas" aria-label="Rush Runner playfield"></canvas>
      <div class="rr-hud-chip" id="rrCoins" aria-live="polite">◆ 0</div>
      <div class="rr-power" id="rrPower" hidden></div>
      <div class="rr-banner" id="rrBanner" hidden></div>
      <div id="rrOverlay" class="rr-start">
        <div class="rr-start-mark" aria-hidden="true"></div>
        <div class="rr-start-title">Rush Runner</div>
        <div class="rr-start-sub">${theme.name}</div>
        <div class="rr-start-best">Best ${bestScore}m</div>
        <div class="rr-start-hint">Swipe or buttons · ◀▶ lanes · ⬆ jump over lows · ⬇ slide under highs</div>
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
    if(!started||gameOver||dying)return;
    if(next===laneTo){buzz('select');return;}
    if(next<0||next>=LANES){buzz('invalid');return;}
    laneFrom=laneX;laneTo=next;lane=next;laneT=0;
    buzz('select');
  }
  function tryJump(){
    if(!started||gameOver||dying)return;
    if(jumping){jumpBuffer=BUFFER_MS;buzz('invalid');return;}
    if(sliding&&slideT<0.75){jumpBuffer=BUFFER_MS;buzz('invalid');return;}
    jumping=true;jumpT=0;squash=1.15;sliding=false;slideT=0;landCoyote=0;jumpBuffer=0;
    buzz('move');
  }
  function trySlide(){
    if(!started||gameOver||dying)return;
    if(sliding){slideBuffer=BUFFER_MS;buzz('invalid');return;}
    sliding=true;slideT=0;jumping=false;jumpT=0;squash=0.7;slideBuffer=0;
    buzz('move');
  }
  function doJump(){tryJump();}
  function doSlide(){trySlide();}

  function showBanner(text,ms){
    const el=document.getElementById('rrBanner');
    if(!el)return;
    el.hidden=false;el.textContent=text;
    saveBanner=ms||0.9;
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
        ctx.fillStyle='rgba(255,220,120,0.28)';
        const cols=Math.max(1,Math.floor(b.w/14));
        const rows=Math.max(1,Math.floor(b.h/16));
        for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
          ctx.fillRect(b.x+4+c*12,horizon-b.h+6+r*14,5,6);
        }
      }
    });
    // Horizon haze — keeps far clutter from competing with hazards
    const haze=ctx.createLinearGradient(0,horizon-24,0,horizon+36);
    haze.addColorStop(0,'rgba(12,12,18,0)');
    haze.addColorStop(0.55,'rgba(12,12,18,0.35)');
    haze.addColorStop(1,'rgba(12,12,18,0.55)');
    ctx.fillStyle=haze;ctx.fillRect(0,horizon-24,cssW,60);
  }

  function drawRoad(){
    const segs=20;
    for(let i=0;i<segs;i++){
      const z0=PLAYER_Z+(i/segs)*(FAR-PLAYER_Z);
      const z1=PLAYER_Z+((i+1)/segs)*(FAR-PLAYER_Z);
      const a=project(-1.65,z0),b=project(1.65,z0),c=project(1.65,z1),d=project(-1.65,z1);
      ctx.fillStyle=i%2===0?theme.road:theme.roadAlt;
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();ctx.fill();
    }
    // Outer edge rails (double stroke for read at speed)
    for(const side of [-1,1]){
      const near=project(side*1.58,PLAYER_Z),far=project(side*1.58,FAR*0.92);
      ctx.strokeStyle='rgba(0,0,0,0.55)';ctx.lineWidth=6;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(near.x,near.y);ctx.lineTo(far.x,far.y);ctx.stroke();
      ctx.strokeStyle=theme.roadEdge;ctx.lineWidth=3.2;
      ctx.beginPath();ctx.moveTo(near.x,near.y);ctx.lineTo(far.x,far.y);ctx.stroke();
    }
    // Lane separators — brighter dashes
    const dashPhase=scroll%3.2;
    for(let laneLine=0;laneLine<2;laneLine++){
      const wx=laneWorldX(laneLine+0.5);
      for(let k=0;k<14;k++){
        const zA=PLAYER_Z+((k+dashPhase)%14)*(FAR-PLAYER_Z)/14;
        const zB=zA+1.25;
        if(zB>FAR)continue;
        const p0=project(wx,zA),p1=project(wx,zB);
        ctx.strokeStyle=theme.line;ctx.globalAlpha=0.85;ctx.lineWidth=Math.max(1.6,p0.scale*2.8);
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

  /** Distinct silhouettes: low = jump-over barrier; high = slide-under tall block. */
  function drawObstacle(o,p,emphasize){
    const low=o.type==='low';
    const hw=(low?0.72:0.52)*p.scale*28;
    const hh=(low?0.32:0.92)*p.scale*36;
    const x=p.x,y=p.y;
    if(emphasize){
      ctx.fillStyle='rgba(255,70,70,0.35)';
      ctx.beginPath();ctx.ellipse(x,y-hh*0.4,hw*1.35,hh*0.85,0,0,Math.PI*2);ctx.fill();
    }
    if(low){
      // Wide short barrier + hazard stripes (read: jump)
      ctx.fillStyle='#1A1A1A';
      ctx.beginPath();
      ctx.moveTo(x-hw,y);ctx.lineTo(x-hw*0.92,y-hh);ctx.lineTo(x+hw*0.92,y-hh);ctx.lineTo(x+hw,y);
      ctx.closePath();ctx.fill();
      ctx.fillStyle='#FFB020';
      ctx.beginPath();
      ctx.moveTo(x-hw*0.92,y-hh);ctx.lineTo(x-hw*0.92,y-hh*0.35);ctx.lineTo(x+hw*0.92,y-hh*0.35);ctx.lineTo(x+hw*0.92,y-hh);
      ctx.closePath();ctx.fill();
      ctx.strokeStyle='#1A1A1A';ctx.lineWidth=Math.max(1.5,p.scale*2);
      for(let i=-2;i<=2;i++){
        const sx=x+i*hw*0.32;
        ctx.beginPath();ctx.moveTo(sx-hw*0.12,y-hh);ctx.lineTo(sx+hw*0.08,y-hh*0.35);ctx.stroke();
      }
      // Jump cue chevron
      ctx.fillStyle='rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(x,y-hh-8*p.scale);ctx.lineTo(x-7*p.scale,y-hh+2*p.scale);ctx.lineTo(x+7*p.scale,y-hh+2*p.scale);
      ctx.closePath();ctx.fill();
    }else{
      // Tall block with open lower band cue (read: slide)
      ctx.fillStyle='#3D4654';
      ctx.beginPath();
      ctx.moveTo(x-hw,y);ctx.lineTo(x-hw*0.82,y-hh);ctx.lineTo(x+hw*0.82,y-hh);ctx.lineTo(x+hw,y);
      ctx.closePath();ctx.fill();
      ctx.fillStyle='#6B778A';
      ctx.beginPath();
      ctx.moveTo(x-hw*0.82,y-hh);ctx.lineTo(x,y-hh-hh*0.14);ctx.lineTo(x+hw*0.82,y-hh);ctx.closePath();ctx.fill();
      // Lower “gap” stripe — slide under
      ctx.fillStyle='rgba(20,24,32,0.85)';
      ctx.fillRect(x-hw*0.75,y-hh*0.28,hw*1.5,hh*0.28);
      ctx.strokeStyle='#A8B4C4';ctx.lineWidth=Math.max(1.2,p.scale*1.8);
      ctx.strokeRect(x-hw*0.75,y-hh*0.28,hw*1.5,hh*0.28);
      ctx.fillStyle='rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(x,y-4*p.scale);ctx.lineTo(x-7*p.scale,y-14*p.scale);ctx.lineTo(x+7*p.scale,y-14*p.scale);
      ctx.closePath();ctx.fill();
    }
    if(o.z>16){
      ctx.fillStyle=low?'rgba(255,176,32,0.22)':'rgba(160,180,210,0.2)';
      ctx.beginPath();ctx.arc(x,y-hh*0.5,5+p.scale*5,0,Math.PI*2);ctx.fill();
    }
  }

  function drawCoin(p,spin){
    const r=Math.max(5,12*p.scale);
    ctx.save();ctx.translate(p.x,p.y-r*1.55);ctx.rotate(spin);
    ctx.fillStyle='rgba(0,0,0,0.35)';
    ctx.beginPath();ctx.ellipse(1,r*0.9,r*0.85,r*0.35,0,0,Math.PI*2);ctx.fill();
    const g=ctx.createRadialGradient(-r*0.2,-r*0.2,1,0,0,r);
    g.addColorStop(0,'#FFF1A0');g.addColorStop(0.55,'#FFD166');g.addColorStop(1,'#C88600');
    ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,r,r*0.72,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.75)';ctx.lineWidth=2;ctx.stroke();
    ctx.restore();
  }

  function drawPower(p,type){
    const r=Math.max(7,14*p.scale);
    ctx.save();ctx.translate(p.x,p.y-r*1.7);
    ctx.fillStyle='rgba(0,0,0,0.3)';
    ctx.beginPath();ctx.ellipse(0,r*1.1,r*0.9,r*0.35,0,0,Math.PI*2);ctx.fill();
    if(type==='shield'){
      ctx.fillStyle='rgba(80,200,255,0.35)';
      ctx.beginPath();ctx.arc(0,0,r*1.35,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(100,210,255,0.95)';
      ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.beginPath();
      ctx.moveTo(-r*0.4,0);ctx.lineTo(-r*0.05,r*0.45);ctx.lineTo(r*0.5,-r*0.35);ctx.stroke();
    }else{
      ctx.fillStyle='rgba(255,90,130,0.35)';
      ctx.beginPath();ctx.arc(0,0,r*1.35,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(255,90,130,0.95)';
      ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=2.5;
      ctx.beginPath();ctx.arc(0,0,r*0.45,0,Math.PI*1.4);ctx.stroke();
    }
    ctx.restore();
  }

  function playerJumpOffset(){
    if(!jumping)return 0;
    const t=jumpT;
    if(t<0.32)return -easeOutCubic(t/0.32)*56;
    if(t<0.58)return -56;
    return -56*(1-easeOutCubic((t-0.58)/0.42));
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
      const pulse=1+Math.sin(scroll*6)*0.06+(shieldPulse>0?0.12:0);
      ctx.fillStyle=`rgba(100,200,255,${0.18+shieldPulse*0.25})`;
      ctx.beginPath();ctx.ellipse(p.x,y-28*p.scale,30*p.scale*pulse,36*p.scale*pulse,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=`rgba(160,230,255,${0.65+shieldPulse*0.3})`;ctx.lineWidth=2.5;
      ctx.beginPath();ctx.ellipse(p.x,y-28*p.scale,30*p.scale*pulse,36*p.scale*pulse,0,0,Math.PI*2);ctx.stroke();
    }
    if(hitFlash>0){
      ctx.fillStyle=`rgba(255,40,40,${Math.min(0.55,hitFlash/12)})`;
      ctx.beginPath();ctx.arc(p.x,y-20*p.scale,34*p.scale,0,Math.PI*2);ctx.fill();
    }

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
    if(shield)bits.push('Shield '+Math.ceil(Math.max(0,shieldTimer))+'s');
    if(magnet)bits.push('Magnet '+Math.ceil(Math.max(0,magnetTimer))+'s');
    if(bits.length){
      el.hidden=false;
      el.textContent=bits.join(' · ');
      el.classList.toggle('rr-power--hot', shieldPulse>0 || shield || magnet);
    }else{
      el.hidden=true;
      el.classList.remove('rr-power--hot');
    }
    const ban=document.getElementById('rrBanner');
    if(ban && saveBanner<=0) ban.hidden=true;
  }

  function clearsObstacle(o){
    if(o.type==='low') return jumping && jumpT>0.10 && jumpT<0.90;
    if(o.type==='high') return sliding && slideT<0.88;
    return false;
  }

  function beginDeath(o){
    if(dying||gameOver)return;
    dying=true;
    deathFocus=o;
    deathStall=0.28;
    hitFlash=16;
    shake=1.6;
    buzz('lose');
  }

  function endGame(){
    if(gameOver)return;
    gameOver=true;dying=false;cancelAnimationFrame(raf);raf=null;
    if(keyHandler){window.removeEventListener('keydown',keyHandler);keyHandler=null;}
    const final=Math.floor(dist);
    if(typeof setGamePB==='function') bestScore=setGamePB('rushrunner', final) ?? Math.max(bestScore, final);
    else if(final>bestScore){bestScore=final;localStorage.setItem('rushrunner_best',String(bestScore));}
    const vsBest=typeof formatVsBest==='function'?formatVsBest('rushrunner', final):`Best ${bestScore}m`;
    if(gs)gs.setOutcome('lost');
    if(typeof recordGameResult==='function')recordGameResult('rushrunner',false,false,{score:final,scoreOnly:true});
    // lose buzz already fired in beginDeath when applicable
    if(!deathFocus)buzz('lose');
    deathFocus=null;
    const div=document.getElementById('rrOverlay');
    if(!div)return;
    div.className='rr-start rr-start--over';
    div.style.display='flex';
    const shareStats={scoreLine:`${final}m`,score:final,meta:`${coins} coins · ${vsBest}`,text:`I ran ${final}m on Chaupaal Rush Runner! Can you beat me?`};
    const shareCard=typeof buildGameShareCard==='function'?buildGameShareCard('rushrunner',shareStats):'';
    div.innerHTML=`
      ${typeof gameResultHtml==='function'?gameResultHtml({
        gameId:'rushrunner',
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
    if(pauseCtrl&&pauseCtrl.isPaused()){raf=requestAnimationFrame(update);return;}
    const dtMs=Math.min(ts-lastTime,40);lastTime=ts;
    const dt=dtMs/1000;

    if(dying){
      deathStall-=dt;
      if(hitFlash>0)hitFlash-=dt*18;
      if(shake>0)shake=Math.max(0,shake-dt*6);
      // Keep drawing during death beat
      ctx.save();
      if(shake>0)ctx.translate((Math.random()-0.5)*shake*10,(Math.random()-0.5)*shake*6);
      ctx.clearRect(0,0,cssW,cssH);
      drawSky();drawRoad();
      const drawList=[];
      obstacles.forEach(o=>drawList.push({z:o.z,kind:'obs',o}));
      coinItems.forEach(c=>{if(!c.collected)drawList.push({z:c.z,kind:'coin',c});});
      powerups.forEach(p=>drawList.push({z:p.z,kind:'pow',p}));
      drawList.sort((a,b)=>b.z-a.z);
      drawList.forEach(item=>{
        if(item.kind==='obs'){
          const o=item.o;const p=project(laneWorldX(o.lane),o.z);
          drawObstacle(o,p,deathFocus===o);
        }else if(item.kind==='coin'){
          drawCoin(project(laneWorldX(item.c.lane),item.c.z),scroll*3+item.c.z);
        }else{
          drawPower(project(laneWorldX(item.p.lane),item.p.z),item.p.type);
        }
      });
      drawPlayer();
      drawParticles();
      ctx.restore();
      if(deathStall<=0){endGame();return;}
      raf=requestAnimationFrame(update);
      return;
    }

    // Soft early ramp — first ~80m stays readable
    const ramp=Math.min(1,dist/RAMP_UNTIL);
    const early=Math.min(1,dist/80);
    const soft=0.72+0.28*early;
    speed=(BASE_SPEED+(MAX_SPEED-BASE_SPEED)*(1-Math.pow(1-ramp,2)))*soft;
    dist+=speed*dt*3.2;
    scroll+=speed*dt;
    score=Math.floor(dist);

    const scoreEl=document.getElementById('rrScore');
    if(scoreEl)scoreEl.textContent=score+'m';
    const coinEl=document.getElementById('rrCoins');
    if(coinEl)coinEl.textContent='◆ '+coins;

    if(laneT<1){
      laneT=Math.min(1,laneT+dtMs/LANE_LERP_MS);
      laneX=laneFrom+(laneTo-laneFrom)*easeOutCubic(laneT);
    }else laneX=laneTo;

    if(jumping){
      jumpT+=dt/0.58;
      if(jumpT>=1){
        jumping=false;jumpT=0;squash=0.85;landCoyote=COYOTE_MS;
        schedule(()=>{if(alive())squash=1;},120);
        if(jumpBuffer>0){jumpBuffer=0;tryJump();}
      }
    }
    if(sliding){
      slideT+=dt/0.50;
      if(slideT>=1){
        sliding=false;slideT=0;squash=1;
        if(slideBuffer>0){slideBuffer=0;trySlide();}
        else if(jumpBuffer>0){jumpBuffer=0;tryJump();}
      }
    }
    if(landCoyote>0){
      landCoyote-=dtMs;
      if(jumpBuffer>0&&!jumping&&!sliding){jumpBuffer=0;landCoyote=0;tryJump();}
    }
    if(jumpBuffer>0)jumpBuffer-=dtMs;
    if(slideBuffer>0)slideBuffer-=dtMs;
    if(hitFlash>0)hitFlash-=dt*18;
    if(shake>0)shake=Math.max(0,shake-dt*8);
    if(shieldPulse>0)shieldPulse=Math.max(0,shieldPulse-dt*2.2);
    if(saveBanner>0){
      saveBanner-=dt;
      if(saveBanner<=0){
        const ban=document.getElementById('rrBanner');
        if(ban)ban.hidden=true;
      }
    }
    if(shieldTimer>0){shieldTimer-=dt;if(shieldTimer<=0)shield=false;}
    if(magnetTimer>0){magnetTimer-=dt;if(magnetTimer<=0)magnet=false;}
    updatePowerHud();

    const dz=speed*dt;
    obstacles.forEach(o=>o.z-=dz);
    coinItems.forEach(c=>{
      c.z-=dz;
      if(magnet&&!c.collected){
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
    // Delay heavy twin packs until player settles
    const obsInterval=Math.max(0.62,1.25-ramp*0.48);
    if(spawnAcc>=obsInterval){
      spawnAcc=0;
      spawnObstacle(FAR+Math.random()*4);
      if(dist>90&&Math.random()<0.26){
        const other=(obstacles[obstacles.length-1].lane+1+Math.floor(Math.random()*2))%LANES;
        obstacles.push({lane:other,z:FAR+2+Math.random()*2,type:Math.random()<0.4?'low':'high',kind:'crate',w:0.55,h:Math.random()<0.4?0.35:0.85});
      }
    }
    if(coinAcc>=1.15){coinAcc=0;spawnCoinRow(FAR+Math.random()*3);}
    if(powerAcc>=7.5&&dist>40){powerAcc=0;spawnPowerup(FAR+1);}

    // Collision — interpolated laneX, forgiving lane width, depth = visible contact
    const pz=PLAYER_Z;
    for(let i=0;i<obstacles.length;i++){
      const o=obstacles[i];
      if(Math.abs(o.z-pz)>HIT_DEPTH)continue;
      if(Math.abs(o.lane-laneX)>HIT_LANE)continue;
      if(clearsObstacle(o))continue;
      if(shield){
        shield=false;shieldTimer=0;shieldPulse=1;hitFlash=6;shake=0.8;
        showBanner('Shield saved you!',1.1);
        buzz('valid');
        o.z=-2;
        const scr=project(laneWorldX(laneX),pz);
        burst(scr.x,scr.y-24,'#7DD3FC',18);
        continue;
      }
      beginDeath(o);
      raf=requestAnimationFrame(update);
      return;
    }

    coinItems.forEach(c=>{
      if(c.collected)return;
      const near=Math.abs(c.z-pz)<1.05&&Math.abs(c.lane-laneX)<0.58;
      if(!near)return;
      c.collected=true;coins++;score+=5;dist+=2;
      const p=project(laneWorldX(c.lane),Math.max(0.5,c.z));
      burst(p.x,p.y-10,'#FFD166',6);
      buzz('place');
    });

    for(let i=powerups.length-1;i>=0;i--){
      const p=powerups[i];
      if(Math.abs(p.z-pz)>1||Math.abs(p.lane-laneX)>0.55)continue;
      if(p.type==='shield'){shield=true;shieldTimer=6.5;shieldPulse=1;showBanner('Shield up!',0.8);}
      else{magnet=true;magnetTimer=5.5;showBanner('Magnet on!',0.8);}
      powerups.splice(i,1);buzz('valid');
      const scr=project(laneWorldX(p.lane),pz);
      burst(scr.x,scr.y-20,p.type==='shield'?'#7DD3FC':'#FF6B8A',14);
    }

    ctx.save();
    if(shake>0)ctx.translate((Math.random()-0.5)*shake*10,(Math.random()-0.5)*shake*6);
    ctx.clearRect(0,0,cssW,cssH);
    drawSky();drawRoad();

    const drawList=[];
    obstacles.forEach(o=>drawList.push({z:o.z,kind:'obs',o}));
    coinItems.forEach(c=>{if(!c.collected)drawList.push({z:c.z,kind:'coin',c});});
    powerups.forEach(p=>drawList.push({z:p.z,kind:'pow',p}));
    drawList.sort((a,b)=>b.z-a.z);
    drawList.forEach(item=>{
      if(item.kind==='obs'){
        const o=item.o;const p=project(laneWorldX(o.lane),o.z);
        drawObstacle(o,p,false);
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
    dying=false;deathFocus=null;teachPhase=1;
    // Teach rhythm: coins → low (jump) → high (slide), clear lanes
    spawnCoinRow(18);
    obstacles.push({lane:1,z:26,type:'low',kind:'barrier',w:0.55,h:0.35});
    obstacles.push({lane:0,z:34,type:'high',kind:'sign',w:0.55,h:0.85});
    spawnCoinRow(30);
    buzz('select');
    raf=requestAnimationFrame(update);
  }

  document.getElementById('rrBack').addEventListener('click',()=>{
    if(gameOver){close();return;}
    const ask=typeof confirmLeaveGame==='function'
      ?confirmLeaveGame({title:'Leave Rush Runner?',body:'This run will end.'})
      :Promise.resolve(window.confirm('Leave Rush Runner?'));
    Promise.resolve(ask).then((ok)=>{if(ok)close();});
  });
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

  if(typeof createGamePauseController==='function'){
    pauseCtrl=createGamePauseController({
      host:overlay,
      pauseBtnId:'rrPause',
      onPause(){if(raf){cancelAnimationFrame(raf);raf=null;}},
      onResume(){if(started&&!gameOver&&!raf){lastTime=performance.now();raf=requestAnimationFrame(update);}},
      onQuit:close,
    });
  }
}

// ===================== TIP TAP (Match-3 juice) =====================
function openTipTap(){
  const COLS=8,ROWS=8;
  const PALETTE=[
    {id:0,name:'Red',fill:'#E63946',glow:'#FF6B6B'},
    {id:1,name:'Amber',fill:'#F4A261',glow:'#FFD166'},
    {id:2,name:'Teal',fill:'#2A9D8F',glow:'#5EEAD4'},
    {id:3,name:'Blue',fill:'#4C75D9',glow:'#93C5FD'},
    {id:4,name:'Violet',fill:'#9B5DE5',glow:'#D8B4FE'},
    {id:5,name:'Coral',fill:'#E76F51',glow:'#FDBA74'},
  ];
  const SPECIAL={bomb:'bomb',rainbow:'rainbow',line:'line'};
  const TIER={rainbow:3,bomb:2,line:1};
  const reduceMotion=typeof shouldReduceGameMotion==='function'&&shouldReduceGameMotion();
  const T={
    pop:reduceMotion?100:220,
    swap:reduceMotion?90:160,
    swapBack:reduceMotion?110:180,
    cascade:reduceMotion?90:240,
    fx:reduceMotion?380:650,
  };

  let level=1; // set from hub / continue
  let board=[],score=0,moves=0,targetScore=0,maxMoves=0;
  let selected=null,animating=false,gameOver=false;
  let combo=0,cascadeTimer=null,cascadeResume=null,fxLayer=null;
  let cellSize=40;
  let pauseCtrl=null;
  let hintPair=null;
  let suppressClickUntil=0;
  let lastSwapCell=null;
  let goals=[];
  let goalProgress=[];

  const ACT_LABELS = {
    1: 'Act 1 · Basics',
    2: 'Act 2 · Specials',
    3: 'Act 3 · Dual goals',
    4: 'Act 4 · Master',
  };
  function actOfLevel(n) {
    if (n <= 20) return 1;
    if (n <= 50) return 2;
    if (n <= 80) return 3;
    return 4;
  }
  function actLabel(n) {
    return ACT_LABELS[actOfLevel(n)] || '';
  }

  /** Campaign: Acts 1–2 authored; Acts 3–4 templated rotations (Prompt 3). */
  const LEVELS = [{"level":1,"moves":28,"goals":[{"type":"score","amount":400}],"target":400,"board":8},{"level":2,"moves":26,"goals":[{"type":"score","amount":550}],"target":550,"board":8},{"level":3,"moves":26,"goals":[{"type":"score","amount":700}],"target":700,"board":8},{"level":4,"moves":28,"goals":[{"type":"collect","color":0,"amount":10}],"target":0,"board":8},{"level":5,"moves":28,"goals":[{"type":"collect","color":2,"amount":12}],"target":0,"board":8},{"level":6,"moves":26,"goals":[{"type":"collect","color":3,"amount":12}],"target":0,"board":8},{"level":7,"moves":28,"goals":[{"type":"score","amount":800},{"type":"collect","color":1,"amount":8}],"target":800,"board":8},{"level":8,"moves":28,"goals":[{"type":"collect","color":4,"amount":14}],"target":0,"board":8},{"level":9,"moves":26,"goals":[{"type":"score","amount":1000}],"target":1000,"board":8},{"level":10,"moves":30,"goals":[{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":11,"moves":28,"goals":[{"type":"specials","kind":"line","amount":2}],"target":0,"board":8},{"level":12,"moves":28,"goals":[{"type":"specials","kind":"bomb","amount":1}],"target":0,"board":8},{"level":13,"moves":30,"goals":[{"type":"collect","color":0,"amount":10},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":14,"moves":28,"goals":[{"type":"score","amount":1100},{"type":"collect","color":5,"amount":10}],"target":1100,"board":8},{"level":15,"moves":30,"goals":[{"type":"specials","kind":"bomb","amount":1},{"type":"collect","color":2,"amount":8}],"target":0,"board":8},{"level":16,"moves":30,"goals":[{"type":"specials","kind":"rainbow","amount":1}],"target":0,"board":8},{"level":17,"moves":28,"goals":[{"type":"collect","color":1,"amount":16}],"target":0,"board":8},{"level":18,"moves":26,"goals":[{"type":"score","amount":1200}],"target":1200,"board":8},{"level":19,"moves":30,"goals":[{"type":"collect","color":3,"amount":12},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":20,"moves":28,"goals":[{"type":"score","amount":1000},{"type":"collect","color":0,"amount":8}],"target":1000,"board":8},{"level":21,"moves":28,"goals":[{"type":"collect","color":0,"amount":18}],"target":0,"board":8},{"level":22,"moves":28,"goals":[{"type":"collect","color":2,"amount":18}],"target":0,"board":8},{"level":23,"moves":26,"goals":[{"type":"specials","kind":"line","amount":2}],"target":0,"board":8},{"level":24,"moves":28,"goals":[{"type":"specials","kind":"bomb","amount":1}],"target":0,"board":8},{"level":25,"moves":28,"goals":[{"type":"score","amount":1400}],"target":1400,"board":8},{"level":26,"moves":30,"goals":[{"type":"collect","color":4,"amount":16},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":27,"moves":28,"goals":[{"type":"collect","color":5,"amount":20}],"target":0,"board":8},{"level":28,"moves":30,"goals":[{"type":"specials","kind":"bomb","amount":2}],"target":0,"board":8},{"level":29,"moves":26,"goals":[{"type":"score","amount":1600}],"target":1600,"board":8},{"level":30,"moves":30,"goals":[{"type":"collect","color":1,"amount":14},{"type":"specials","kind":"bomb","amount":1}],"target":0,"board":8},{"level":31,"moves":28,"goals":[{"type":"specials","kind":"rainbow","amount":1}],"target":0,"board":8},{"level":32,"moves":28,"goals":[{"type":"collect","color":3,"amount":22}],"target":0,"board":8},{"level":33,"moves":30,"goals":[{"type":"specials","kind":"line","amount":3}],"target":0,"board":8},{"level":34,"moves":28,"goals":[{"type":"score","amount":1500},{"type":"collect","color":2,"amount":12}],"target":1500,"board":8},{"level":35,"moves":30,"goals":[{"type":"collect","color":0,"amount":15},{"type":"specials","kind":"line","amount":2}],"target":0,"board":8},{"level":36,"moves":28,"goals":[{"type":"specials","kind":"bomb","amount":2}],"target":0,"board":8},{"level":37,"moves":26,"goals":[{"type":"collect","color":4,"amount":24}],"target":0,"board":8},{"level":38,"moves":30,"goals":[{"type":"specials","kind":"rainbow","amount":1},{"type":"collect","color":1,"amount":10}],"target":0,"board":8},{"level":39,"moves":28,"goals":[{"type":"score","amount":1800}],"target":1800,"board":8},{"level":40,"moves":30,"goals":[{"type":"collect","color":5,"amount":16},{"type":"specials","kind":"bomb","amount":1}],"target":0,"board":8},{"level":41,"moves":28,"goals":[{"type":"specials","kind":"line","amount":2},{"type":"collect","color":3,"amount":12}],"target":0,"board":8},{"level":42,"moves":26,"goals":[{"type":"score","amount":1700}],"target":1700,"board":8},{"level":43,"moves":30,"goals":[{"type":"specials","kind":"bomb","amount":2},{"type":"collect","color":0,"amount":10}],"target":0,"board":8},{"level":44,"moves":28,"goals":[{"type":"collect","color":2,"amount":20}],"target":0,"board":8},{"level":45,"moves":30,"goals":[{"type":"specials","kind":"rainbow","amount":1},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":46,"moves":28,"goals":[{"type":"score","amount":1900},{"type":"collect","color":4,"amount":10}],"target":1900,"board":8},{"level":47,"moves":30,"goals":[{"type":"collect","color":1,"amount":18},{"type":"specials","kind":"bomb","amount":1}],"target":0,"board":8},{"level":48,"moves":28,"goals":[{"type":"specials","kind":"line","amount":3}],"target":0,"board":8},{"level":49,"moves":30,"goals":[{"type":"collect","color":5,"amount":14},{"type":"specials","kind":"rainbow","amount":1}],"target":0,"board":8},{"level":50,"moves":28,"goals":[{"type":"score","amount":2000}],"target":2000,"board":8},{"level":51,"moves":32,"goals":[{"type":"score","amount":2000}],"target":2000,"board":8},{"level":52,"moves":32,"goals":[{"type":"collect","color":1,"amount":18},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":53,"moves":32,"goals":[{"type":"specials","kind":"bomb","amount":1},{"type":"collect","color":5,"amount":12}],"target":0,"board":8},{"level":54,"moves":32,"goals":[{"type":"score","amount":1980},{"type":"specials","kind":"line","amount":2}],"target":1980,"board":8},{"level":55,"moves":31,"goals":[{"type":"collect","color":4,"amount":14},{"type":"collect","color":1,"amount":10}],"target":0,"board":8},{"level":56,"moves":31,"goals":[{"type":"score","amount":2000},{"type":"collect","color":5,"amount":13}],"target":2000,"board":8},{"level":57,"moves":31,"goals":[{"type":"collect","color":0,"amount":21},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":58,"moves":31,"goals":[{"type":"score","amount":2280}],"target":2280,"board":8},{"level":59,"moves":30,"goals":[{"type":"score","amount":2280},{"type":"specials","kind":"line","amount":2}],"target":2280,"board":8},{"level":60,"moves":30,"goals":[{"type":"collect","color":3,"amount":14},{"type":"collect","color":0,"amount":10}],"target":0,"board":8},{"level":61,"moves":30,"goals":[{"type":"score","amount":2400},{"type":"collect","color":4,"amount":15}],"target":2400,"board":8},{"level":62,"moves":30,"goals":[{"type":"collect","color":5,"amount":23},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":63,"moves":29,"goals":[{"type":"specials","kind":"bomb","amount":1},{"type":"collect","color":3,"amount":12}],"target":0,"board":8},{"level":64,"moves":29,"goals":[{"type":"score","amount":2580},{"type":"specials","kind":"line","amount":2}],"target":2580,"board":8},{"level":65,"moves":29,"goals":[{"type":"score","amount":2560}],"target":2560,"board":8},{"level":66,"moves":29,"goals":[{"type":"score","amount":2800},{"type":"collect","color":3,"amount":17}],"target":2800,"board":8},{"level":67,"moves":28,"goals":[{"type":"collect","color":4,"amount":26},{"type":"specials","kind":"line","amount":2}],"target":0,"board":8},{"level":68,"moves":28,"goals":[{"type":"specials","kind":"bomb","amount":1},{"type":"collect","color":2,"amount":12}],"target":0,"board":8},{"level":69,"moves":28,"goals":[{"type":"score","amount":2880},{"type":"specials","kind":"line","amount":2}],"target":2880,"board":8},{"level":70,"moves":28,"goals":[{"type":"collect","color":1,"amount":14},{"type":"collect","color":4,"amount":10}],"target":0,"board":8},{"level":71,"moves":27,"goals":[{"type":"score","amount":3200},{"type":"collect","color":2,"amount":18}],"target":3200,"board":8},{"level":72,"moves":27,"goals":[{"type":"score","amount":2840}],"target":2840,"board":8},{"level":73,"moves":27,"goals":[{"type":"specials","kind":"bomb","amount":1},{"type":"collect","color":1,"amount":12}],"target":0,"board":8},{"level":74,"moves":27,"goals":[{"type":"score","amount":3180},{"type":"specials","kind":"line","amount":2}],"target":3180,"board":8},{"level":75,"moves":26,"goals":[{"type":"collect","color":0,"amount":14},{"type":"collect","color":3,"amount":10}],"target":0,"board":8},{"level":76,"moves":26,"goals":[{"type":"score","amount":3600},{"type":"collect","color":1,"amount":20}],"target":3600,"board":8},{"level":77,"moves":26,"goals":[{"type":"collect","color":2,"amount":31},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":78,"moves":26,"goals":[{"type":"specials","kind":"bomb","amount":1},{"type":"collect","color":0,"amount":12}],"target":0,"board":8},{"level":79,"moves":25,"goals":[{"type":"score","amount":3120}],"target":3120,"board":8},{"level":80,"moves":25,"goals":[{"type":"collect","color":5,"amount":14},{"type":"collect","color":2,"amount":10}],"target":0,"board":8},{"level":81,"moves":28,"goals":[{"type":"score","amount":2400},{"type":"collect","color":0,"amount":14},{"type":"specials","kind":"line","amount":1}],"target":2400,"board":8},{"level":82,"moves":28,"goals":[{"type":"collect","color":1,"amount":16},{"type":"specials","kind":"bomb","amount":2}],"target":0,"board":8},{"level":83,"moves":28,"goals":[{"type":"specials","kind":"rainbow","amount":1},{"type":"collect","color":4,"amount":12},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":84,"moves":27,"goals":[{"type":"score","amount":2840},{"type":"collect","color":3,"amount":12},{"type":"collect","color":5,"amount":10}],"target":2840,"board":8},{"level":85,"moves":27,"goals":[{"type":"score","amount":2800},{"type":"collect","color":4,"amount":14},{"type":"specials","kind":"line","amount":1}],"target":2800,"board":8},{"level":86,"moves":27,"goals":[{"type":"collect","color":5,"amount":16},{"type":"specials","kind":"bomb","amount":2}],"target":0,"board":8},{"level":87,"moves":26,"goals":[{"type":"specials","kind":"rainbow","amount":1},{"type":"collect","color":2,"amount":12},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":88,"moves":26,"goals":[{"type":"score","amount":3160},{"type":"collect","color":1,"amount":12},{"type":"collect","color":3,"amount":10}],"target":3160,"board":8},{"level":89,"moves":26,"goals":[{"type":"score","amount":3200},{"type":"collect","color":2,"amount":14},{"type":"specials","kind":"line","amount":1}],"target":3200,"board":8},{"level":90,"moves":25,"goals":[{"type":"score","amount":2650}],"target":2650,"board":8},{"level":91,"moves":25,"goals":[{"type":"specials","kind":"rainbow","amount":1},{"type":"collect","color":0,"amount":12},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":92,"moves":25,"goals":[{"type":"score","amount":3480},{"type":"collect","color":5,"amount":12},{"type":"collect","color":1,"amount":10}],"target":3480,"board":8},{"level":93,"moves":24,"goals":[{"type":"score","amount":3600},{"type":"collect","color":0,"amount":14},{"type":"specials","kind":"line","amount":1}],"target":3600,"board":8},{"level":94,"moves":24,"goals":[{"type":"collect","color":1,"amount":16},{"type":"specials","kind":"bomb","amount":2}],"target":0,"board":8},{"level":95,"moves":24,"goals":[{"type":"specials","kind":"rainbow","amount":1},{"type":"collect","color":4,"amount":12},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":96,"moves":24,"goals":[{"type":"score","amount":3800},{"type":"collect","color":3,"amount":12},{"type":"collect","color":5,"amount":10}],"target":3800,"board":8},{"level":97,"moves":24,"goals":[{"type":"score","amount":4000},{"type":"collect","color":4,"amount":14},{"type":"specials","kind":"line","amount":1}],"target":4000,"board":8},{"level":98,"moves":24,"goals":[{"type":"collect","color":5,"amount":16},{"type":"specials","kind":"bomb","amount":2}],"target":0,"board":8},{"level":99,"moves":24,"goals":[{"type":"specials","kind":"rainbow","amount":1},{"type":"collect","color":2,"amount":12},{"type":"specials","kind":"line","amount":1}],"target":0,"board":8},{"level":100,"moves":26,"goals":[{"type":"score","amount":2800},{"type":"collect","color":0,"amount":10}],"target":2800,"board":8}].map((cfg) => ({
    level: cfg.level,
    moves: cfg.moves,
    goals: (cfg.goals || []).map((g) => ({ ...g })),
    target: cfg.target || 0,
    board: cfg.board || ROWS,
    act: actOfLevel(cfg.level),
  }));

  const SAVE_NEXT = 'tiptap_level';
  const SAVE_BEST_LVL = 'tiptap_best_level';
  const SAVE_LEGACY = 'candyburst_level';

  function readNextLevel() {
    let n = parseInt(localStorage.getItem(SAVE_NEXT) || localStorage.getItem(SAVE_LEGACY) || '1', 10) || 1;
    if (n < 1) n = 1;
    if (n > LEVELS.length) n = LEVELS.length;
    return n;
  }
  function readBestCleared() {
    return Math.max(0, parseInt(localStorage.getItem(SAVE_BEST_LVL) || '0', 10) || 0);
  }
  function persistUnlock(clearedLevel) {
    try {
      const nextWanted = Math.min(LEVELS.length + 1, clearedLevel + 1);
      const stored = parseInt(localStorage.getItem(SAVE_NEXT) || localStorage.getItem(SAVE_LEGACY) || '1', 10) || 1;
      const next = Math.max(stored, nextWanted);
      localStorage.setItem(SAVE_NEXT, String(Math.min(next, LEVELS.length + 1)));
      const prevBest = readBestCleared();
      if (clearedLevel > prevBest) localStorage.setItem(SAVE_BEST_LVL, String(clearedLevel));
    } catch (e) {}
  }
  function canPlayLevel(n) {
    return n >= 1 && n <= readNextLevel() && n <= LEVELS.length;
  }

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;';

  const begin=typeof beginGameOverlaySession==='function'?beginGameOverlaySession:null;
  const gs=begin?begin({
    type:'tiptap',title:'Tip Tap',mode:'solo',overlay,
    cleanup(){
      clearCascadeTimers();
      if(pauseCtrl){pauseCtrl.destroy();pauseCtrl=null;}
    },
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
  function clearCascadeTimers(){
    if(cascadeTimer){
      try{clearTimeout(cascadeTimer);}catch(e){}
      cascadeTimer=null;
    }
    cascadeResume=null;
  }
  const close=()=>{
    clearCascadeTimers();
    if(pauseCtrl){pauseCtrl.destroy();pauseCtrl=null;}
    if(gs)gs.close();else overlay.remove();
  };
  const buzz=(a)=>{if(typeof gameFeedback==='function')gameFeedback(a);};
  const isPaused=()=>!!(pauseCtrl&&pauseCtrl.isPaused&&pauseCtrl.isPaused());
  const toast=(msg)=>{if(typeof showToast==='function'&&msg)showToast(msg);};

  function scheduleCascade(fn,ms){
    if(cascadeTimer){
      try{clearTimeout(cascadeTimer);}catch(e){}
      cascadeTimer=null;
    }
    const run=()=>{
      cascadeTimer=null;
      if(!alive()||gameOver)return;
      if(isPaused()){cascadeResume=fn;return;}
      fn();
    };
    cascadeTimer=schedule(run,ms);
  }

  let _uid=1;function uid(){return _uid++;}

  function randomPiece(allowSpecial){
    // Rare refill specials only — goals must not trivialize
    if(allowSpecial&&Math.random()<0.012){
      const kind=Math.random()<0.65?SPECIAL.line:SPECIAL.bomb;
      return {color:null,special:kind,axis:Math.random()<0.5?'h':'v',id:uid()};
    }
    const c=PALETTE[Math.floor(Math.random()*PALETTE.length)];
    return {color:c.id,special:null,axis:null,id:uid()};
  }

  function swapCells(r1,c1,r2,c2){
    const tmp=board[r1][c1];board[r1][c1]=board[r2][c2];board[r2][c2]=tmp;
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

  /** Creation rules: 4→line, 5 or L/T→bomb, 6+ same colour→rainbow. Highest tier once. */
  function classifySpawn(matchCells){
    if(!matchCells||!matchCells.length)return null;
    const byColor=new Map();
    for(const {r,c} of matchCells){
      const p=board[r]?.[c];
      if(!p||p.color==null)continue;
      if(!byColor.has(p.color))byColor.set(p.color,[]);
      byColor.get(p.color).push({r,c});
    }
    let best=null;
    for(const[color,cells] of byColor){
      const set=new Set(cells.map(x=>`${x.r},${x.c}`));
      let maxH=0,maxV=0,bestHCells=[],bestVCells=[];
      const rowMap=new Map();
      const colMap=new Map();
      cells.forEach(({r,c})=>{
        if(!rowMap.has(r))rowMap.set(r,[]);
        rowMap.get(r).push(c);
        if(!colMap.has(c))colMap.set(c,[]);
        colMap.get(c).push(r);
      });
      for(const[r,cols] of rowMap){
        cols.sort((a,b)=>a-b);
        let i=0;
        while(i<cols.length){
          let j=i;
          while(j+1<cols.length&&cols[j+1]===cols[j]+1)j++;
          const len=j-i+1;
          if(len>maxH){
            maxH=len;
            bestHCells=[];
            for(let k=i;k<=j;k++)bestHCells.push({r,c:cols[k]});
          }
          i=j+1;
        }
      }
      for(const[c,rows] of colMap){
        rows.sort((a,b)=>a-b);
        let i=0;
        while(i<rows.length){
          let j=i;
          while(j+1<rows.length&&rows[j+1]===rows[j]+1)j++;
          const len=j-i+1;
          if(len>maxV){
            maxV=len;
            bestVCells=[];
            for(let k=i;k<=j;k++)bestVCells.push({r:rows[k],c});
          }
          i=j+1;
        }
      }
      let hasLT=false;
      for(const {r,c} of cells){
        let hl=1,vl=1;
        for(let cc=c-1;cc>=0&&set.has(`${r},${cc}`);cc--)hl++;
        for(let cc=c+1;cc<COLS&&set.has(`${r},${cc}`);cc++)hl++;
        for(let rr=r-1;rr>=0&&set.has(`${rr},${c}`);rr--)vl++;
        for(let rr=r+1;rr<ROWS&&set.has(`${rr},${c}`);rr++)vl++;
        if(hl>=3&&vl>=3){hasLT=true;break;}
      }
      const n=cells.length;
      let kind=null,axis=null,anchorCells=cells;
      if(n>=6||maxH>=6||maxV>=6){
        kind=SPECIAL.rainbow;
        anchorCells=cells;
      }else if(maxH===5||maxV===5||hasLT){
        kind=SPECIAL.bomb;
        anchorCells=hasLT?cells:(maxH===5?bestHCells:bestVCells);
      }else if(maxH===4&&maxV<4){
        kind=SPECIAL.line;axis='h';anchorCells=bestHCells;
      }else if(maxV===4&&maxH<4){
        kind=SPECIAL.line;axis='v';anchorCells=bestVCells;
      }
      if(!kind)continue;
      const cand={kind,axis,color,cells:anchorCells,tier:TIER[kind]};
      if(!best||cand.tier>best.tier)best=cand;
    }
    if(!best)return null;
    let anchor=best.cells[Math.floor(best.cells.length/2)]||best.cells[0];
    if(lastSwapCell&&best.cells.some(x=>x.r===lastSwapCell.r&&x.c===lastSwapCell.c)){
      anchor=lastSwapCell;
    }
    return {kind:best.kind,axis:best.axis||null,anchor,color:best.color};
  }

  function teachSpecial(kind){
    const key='tiptap_teach_'+kind;
    try{if(localStorage.getItem(key))return;}catch(e){return;}
    try{localStorage.setItem(key,'1');}catch(e){}
    const msgs={
      line:'Line: match 4 in a row — swap it to clear that row or column',
      bomb:'Bomb: match 5 or an L/T — swap to blast a 3×3',
      rainbow:'Prism: match 6+ of one colour — swap onto a gem to clear that colour',
    };
    toast(msgs[kind]||'');
  }

  function noteColorCleared(color,n){
    if(color==null)return;
    const add=n||1;
    goals.forEach((g,i)=>{
      if(g.type==='collect'&&g.color===color){
        goalProgress[i]=Math.min(g.amount,(goalProgress[i]||0)+add);
      }
    });
  }
  function noteSpecialDetonated(kind){
    goals.forEach((g,i)=>{
      if(g.type==='specials'&&g.kind===kind){
        goalProgress[i]=Math.min(g.amount,(goalProgress[i]||0)+1);
      }
    });
  }
  function syncScoreGoals(){
    goals.forEach((g,i)=>{
      if(g.type==='score')goalProgress[i]=Math.min(g.amount,score);
    });
  }
  function goalsComplete(){
    if(!goals.length)return score>=targetScore;
    return goals.every((g,i)=>(goalProgress[i]||0)>=g.amount);
  }
  function addScore(pts){
    if(pts<=0)return;
    score+=pts;
    syncScoreGoals();
    spawnScorePop(pts);
  }

  function clearCellAt(r,c){
    if(r<0||r>=ROWS||c<0||c>=COLS)return;
    const p=board[r][c];
    if(p==null)return;
    if(p.color!=null)noteColorCleared(p.color);
    board[r][c]=null;
  }

  function clearRow(r){
    if(r<0||r>=ROWS)return;
    for(let c=0;c<COLS;c++)clearCellAt(r,c);
  }
  function clearCol(c){
    if(c<0||c>=COLS)return;
    for(let r=0;r<ROWS;r++)clearCellAt(r,c);
  }
  function clearCross(r,c){
    clearRow(r);clearCol(c);
  }
  function countColorsOnBoard(){
    const counts=new Array(PALETTE.length).fill(0);
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const p=board[r][c];
      if(p&&p.color!=null)counts[p.color]++;
    }
    return counts;
  }
  function clearColour(color){
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      if(board[r][c]?.color===color)clearCellAt(r,c);
    }
  }

  function detonateBomb(r,c){
    noteSpecialDetonated(SPECIAL.bomb);
    spawnFx(r,c,'bomb');
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)clearCellAt(r+dr,c+dc);
  }
  function detonateLine(r,c,axis){
    noteSpecialDetonated(SPECIAL.line);
    spawnFx(r,c,'line');
    if(axis==='v')clearCol(c);
    else clearRow(r);
  }
  function detonateRainbow(r,c,color){
    noteSpecialDetonated(SPECIAL.rainbow);
    spawnFx(r,c,'rainbow');
    board[r][c]=null;
    if(color==null){
      const counts=countColorsOnBoard();
      let best=0,bestN=-1;
      counts.forEach((n,i)=>{if(n>bestN){bestN=n;best=i;}});
      color=best;
    }
    clearColour(color);
  }

  /** Activate special at its current cell; otherPiece is the swapped partner (may be null). */
  function activateSpecialAt(r,c,kind,piece,otherPiece){
    if(!board[r]||board[r][c]==null)return;
    const axis=piece?.axis||'h';
    if(kind===SPECIAL.bomb)detonateBomb(r,c);
    else if(kind===SPECIAL.line)detonateLine(r,c,axis);
    else if(kind===SPECIAL.rainbow){
      const col=otherPiece&&otherPiece.color!=null?otherPiece.color:null;
      detonateRainbow(r,c,col);
      if(otherPiece&&!otherPiece.special){
        // partner gem may still sit adjacent — clear it if same colour already wiped
        const or=otherPiece._atR,oc=otherPiece._atC;
        if(or!=null&&board[or]?.[oc])clearCellAt(or,oc);
      }
    }
  }

  function resolveSpecialCombo(r1,c1,r2,c2,sa,sb,pa,pb){
    // After swap: pa is at (r2,c2), pb at (r1,c1)
    const aPos={r:r2,c:c2,kind:sa,piece:pa};
    const bPos={r:r1,c:c1,kind:sb,piece:pb};

    if(sa===SPECIAL.line&&sb===SPECIAL.line){
      toast('Cross clear!');
      noteSpecialDetonated(SPECIAL.line);
      noteSpecialDetonated(SPECIAL.line);
      spawnFx(r1,c1,'line');spawnFx(r2,c2,'line');
      clearCross(r1,c1);clearCross(r2,c2);
      return;
    }
    if((sa===SPECIAL.bomb&&sb===SPECIAL.line)||(sa===SPECIAL.line&&sb===SPECIAL.bomb)){
      toast('Bomb cross!');
      const linePos=sa===SPECIAL.line?aPos:bPos;
      const bombPos=sa===SPECIAL.bomb?aPos:bPos;
      noteSpecialDetonated(SPECIAL.line);
      noteSpecialDetonated(SPECIAL.bomb);
      spawnFx(linePos.r,linePos.c,'line');
      spawnFx(bombPos.r,bombPos.c,'bomb');
      const axis=linePos.piece?.axis||'h';
      if(axis==='v'){
        for(let cc=linePos.c-1;cc<=linePos.c+1;cc++)clearCol(cc);
      }else{
        for(let rr=linePos.r-1;rr<=linePos.r+1;rr++)clearRow(rr);
      }
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)clearCellAt(bombPos.r+dr,bombPos.c+dc);
      return;
    }
    if(sa===SPECIAL.rainbow&&sb===SPECIAL.rainbow){
      toast('Board clear!');
      noteSpecialDetonated(SPECIAL.rainbow);
      noteSpecialDetonated(SPECIAL.rainbow);
      spawnFx(r1,c1,'rainbow');spawnFx(r2,c2,'rainbow');
      for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)clearCellAt(r,c);
      return;
    }
    if((sa===SPECIAL.rainbow&&sb===SPECIAL.bomb)||(sa===SPECIAL.bomb&&sb===SPECIAL.rainbow)){
      toast('Colour blast!');
      noteSpecialDetonated(SPECIAL.rainbow);
      noteSpecialDetonated(SPECIAL.bomb);
      spawnFx(r1,c1,'rainbow');spawnFx(r2,c2,'bomb');
      board[r1][c1]=null;board[r2][c2]=null;
      const counts=countColorsOnBoard();
      const ranked=counts.map((n,i)=>({i,n})).sort((a,b)=>b.n-a.n);
      clearColour(ranked[0].i);
      if(ranked[1]&&ranked[1].n>0)clearColour(ranked[1].i);
      return;
    }
    // Fallback: fire both (no half-wired rainbow+line toast)
    pb._atR=r1;pb._atC=c1;pa._atR=r2;pa._atC=c2;
    activateSpecialAt(r2,c2,sa,pa,pb);
    activateSpecialAt(r1,c1,sb,pb,pa);
  }

  function findHintMove(){
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const dirs=[[0,1],[1,0]];
        for(const[dr,dc] of dirs){
          const r2=r+dr,c2=c+dc;
          if(r2>=ROWS||c2>=COLS)continue;
          if(!board[r][c]||!board[r2][c2])continue;
          if(board[r][c].special||board[r2][c2].special)return{r1:r,c1:c,r2,c2};
          swapCells(r,c,r2,c2);
          const ok=findMatches().length>0;
          swapCells(r,c,r2,c2);
          if(ok)return{r1:r,c1:c,r2,c2};
        }
      }
    }
    return null;
  }

  function fillRandomBoard(){
    board=Array(ROWS).fill(null).map(()=>Array(COLS).fill(null).map(()=>randomPiece(false)));
  }

  function ensurePlayableStart(){
    let guard=0;
    do{
      fillRandomBoard();
      guard++;
    }while((findMatches().length>0||!findHintMove())&&guard<60);
    if(findMatches().length||!findHintMove()){
      guard=0;
      while((findMatches().length>0||!findHintMove())&&guard++<40)shuffleGems(true);
    }
  }

  function shuffleGems(silent){
    const colors=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const p=board[r][c];
      if(p&&!p.special&&p.color!=null)colors.push(p.color);
    }
    for(let i=colors.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      const t=colors[i];colors[i]=colors[j];colors[j]=t;
    }
    let k=0;
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const p=board[r][c];
      if(p&&!p.special&&p.color!=null){
        board[r][c]={color:colors[k++],special:null,axis:null,id:uid()};
      }
    }
    let guard=0;
    while(findMatches().length&&guard++<30){
      for(let i=colors.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        const t=colors[i];colors[i]=colors[j];colors[j]=t;
      }
      k=0;
      for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
        const p=board[r][c];
        if(p&&!p.special&&p.color!=null)board[r][c]={color:colors[k++],special:null,axis:null,id:uid()};
      }
    }
    if(!silent)toast('No moves — shuffled');
    buzz('turn');
  }

  function startLevel(lvl){
    if(!alive())return;
    clearCascadeTimers();
    level=Math.min(Math.max(1,lvl|0),LEVELS.length);
    const cfg=LEVELS[level-1];
    goals=(cfg.goals||[{type:'score',amount:cfg.target||500}]).map(g=>({...g}));
    goalProgress=goals.map(()=>0);
    const scoreGoal=goals.find(g=>g.type==='score');
    targetScore=scoreGoal?scoreGoal.amount:(cfg.target||0);
    maxMoves=cfg.moves;moves=cfg.moves;score=0;combo=0;
    gameOver=false;selected=null;animating=false;hintPair=null;lastSwapCell=null;
    ensurePlayableStart();
    const hub=document.getElementById('ttHub');
    if(hub)hub.hidden=true;
    const play=document.getElementById('ttPlay');
    if(play)play.hidden=false;
    const pick=document.getElementById('ttPicker');
    if(pick)pick.hidden=true;
    const sub=document.getElementById('cbSub');
    if(sub)sub.textContent='Level '+level+' · '+actLabel(level);
    const pauseBtn=document.getElementById('cbPause');
    if(pauseBtn)pauseBtn.style.visibility='';
    const hintBtn=document.getElementById('cbHint');
    if(hintBtn)hintBtn.style.visibility='';
    updateGoalsHud();
    updateComboHud();
    render({fresh:true});
  }

  function updateComboHud(){
    const el=document.getElementById('cbCombo');
    if(!el)return;
    if(combo>1){
      el.hidden=false;
      el.textContent='Combo ×'+combo;
    }else{
      el.hidden=true;
      el.textContent='';
    }
  }

  function updateGoalsHud(){
    syncScoreGoals();
    const host=document.getElementById('cbGoals');
    if(host){
      host.innerHTML=goals.map((g,i)=>{
        const cur=goalProgress[i]||0;
        const done=cur>=g.amount?' is-done':'';
        if(g.type==='score'){
          return `<span class="tt-goal-chip${done}">Score ${cur.toLocaleString()}/${g.amount.toLocaleString()}</span>`;
        }
        if(g.type==='collect'){
          const pal=PALETTE[g.color]||PALETTE[0];
          return `<span class="tt-goal-chip${done}"><i class="tt-goal-swatch" style="--tt-fill:${pal.fill};--tt-glow:${pal.glow}"></i>${pal.name} ${cur}/${g.amount}</span>`;
        }
        if(g.type==='specials'){
          const label=g.kind==='line'?'Lines':g.kind==='bomb'?'Bombs':'Prisms';
          return `<span class="tt-goal-chip${done}">${label} ${cur}/${g.amount}</span>`;
        }
        return '';
      }).join('');
    }
    const scoreGoal=goals.find(g=>g.type==='score');
    const progEl=document.getElementById('cbProgress');
    const track=document.getElementById('cbProgressTrack');
    if(scoreGoal&&progEl){
      if(track)track.hidden=false;
      progEl.style.width=Math.min(100,(score/Math.max(1,scoreGoal.amount))*100)+'%';
    }else if(track&&progEl){
      const total=goals.reduce((s,g)=>s+g.amount,0)||1;
      const got=goalProgress.reduce((s,n)=>s+(n||0),0);
      progEl.style.width=Math.min(100,(got/total)*100)+'%';
      track.hidden=false;
    }
    const movesEl=document.getElementById('cbMoves');
    if(movesEl)movesEl.textContent=String(moves);
    const scoreEl=document.getElementById('cbScore');
    if(scoreEl)scoreEl.textContent=score.toLocaleString();
  }

  function spawnFx(r,c,type){
    if(!fxLayer||(reduceMotion&&type==='spark'))return;
    const grid=document.getElementById('cbGrid');
    if(!grid)return;
    const cell=grid.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    const host=cell||grid;
    const rect=host.getBoundingClientRect();
    const layerRect=fxLayer.getBoundingClientRect();
    const el=document.createElement('div');
    el.className='tt-fx tt-fx--'+type+(reduceMotion?' tt-fx--short':'');
    el.style.left=(rect.left-layerRect.left+rect.width/2)+'px';
    el.style.top=(rect.top-layerRect.top+rect.height/2)+'px';
    fxLayer.appendChild(el);
    schedule(()=>{el.remove();},T.fx);
  }

  function spawnScorePop(pts){
    if(reduceMotion||!fxLayer||pts<=0)return;
    const grid=document.getElementById('cbGrid');
    if(!grid)return;
    const rect=grid.getBoundingClientRect();
    const layerRect=fxLayer.getBoundingClientRect();
    const el=document.createElement('div');
    el.className='tt-score-pop';
    el.textContent='+'+pts;
    el.style.left=(rect.left-layerRect.left+rect.width/2)+'px';
    el.style.top=(rect.top-layerRect.top+rect.height*0.38)+'px';
    fxLayer.appendChild(el);
    schedule(()=>{el.remove();},900);
  }

  function clearMatches(matches){
    if(!alive()||!matches||!matches.length)return;
    animating=true;
    combo++;
    updateComboHud();

    // Detonate specials sitting on or orthogonally touching the match
    const clearSet=new Set(matches.map(m=>`${m.r},${m.c}`));
    const expanded=matches.slice();
    const tryAdd=(r,c)=>{
      const key=`${r},${c}`;
      if(clearSet.has(key))return;
      const p=board[r]?.[c];
      if(!p?.special)return;
      clearSet.add(key);
      expanded.push({r,c});
    };
    matches.forEach(({r,c})=>{
      tryAdd(r,c);
      tryAdd(r-1,c);tryAdd(r+1,c);tryAdd(r,c-1);tryAdd(r,c+1);
    });

    const pts=expanded.length*10*combo;
    addScore(pts);
    if(combo>1)buzz('valid');else buzz('place');

    expanded.forEach(({r,c})=>{
      const cell=document.querySelector(`#cbGrid [data-r="${r}"][data-c="${c}"]`);
      if(cell)cell.classList.add('tt-piece--pop');
      spawnFx(r,c,'spark');
    });

    const spawn=classifySpawn(matches);

    scheduleCascade(()=>{
      if(!alive())return;
      const snap=expanded.map(({r,c})=>({r,c,p:board[r]?.[c]}));
      snap.forEach(({r,c,p})=>{
        if(!p)return;
        if(p.special===SPECIAL.bomb)detonateBomb(r,c);
        else if(p.special===SPECIAL.line)detonateLine(r,c,p.axis||'h');
        else if(p.special===SPECIAL.rainbow){
          const rainColor=snap.find(x=>x.p&&x.p.color!=null)?.p?.color ?? 0;
          detonateRainbow(r,c,rainColor);
        }else{
          clearCellAt(r,c);
        }
      });
      if(spawn&&spawn.anchor){
        const {r,c}=spawn.anchor;
        board[r][c]={color:null,special:spawn.kind,axis:spawn.axis,id:uid()};
        teachSpecial(spawn.kind);
      }
      updateGoalsHud();
      dropPieces();
    },T.pop);
  }

  function dropPieces(){
    if(!alive())return;
    animating=true;
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
      scheduleCascade(()=>clearMatches(newMatches),T.cascade);
    }else{
      finishCascade();
    }
  }

  function finishCascade(){
    combo=0;
    updateComboHud();
    animating=false;
    hintPair=null;
    lastSwapCell=null;
    updateGoalsHud();
    if(checkGameOver())return;
    if(!findHintMove()){
      shuffleGems(false);
      let g=0;
      while(!findHintMove()&&g++<12)shuffleGems(true);
      render({fresh:true});
      checkGameOver();
    }
  }

  function trySwap(r1,c1,r2,c2){
    if(!alive()||animating||gameOver||isPaused())return;
    if(Math.abs(r1-r2)+Math.abs(c1-c2)!==1)return;
    const a=board[r1]?.[c1],b=board[r2]?.[c2];
    if(!a||!b)return;
    hintPair=null;
    animating=true;
    selected=null;
    const sa=a.special,sb=b.special;
    swapCells(r1,c1,r2,c2);
    lastSwapCell={r:r2,c:c2};
    render({swap:[[r1,c1],[r2,c2]]});

    // Special activation / combo — costs a move
    if(sa&&sb){
      moves--;
      updateGoalsHud();
      combo=0;
      scheduleCascade(()=>{
        if(!alive())return;
        combo=1;updateComboHud();
        const before=countFilled();
        resolveSpecialCombo(r1,c1,r2,c2,sa,sb,a,b);
        const cleared=Math.max(0,before-countFilled());
        addScore(Math.max(cleared,1)*12);
        buzz('valid');
        updateGoalsHud();
        dropPieces();
      },T.swap);
      return;
    }
    if(sa||sb){
      moves--;
      updateGoalsHud();
      combo=0;
      scheduleCascade(()=>{
        if(!alive())return;
        combo=1;updateComboHud();
        // After swap: a at (r2,c2), b at (r1,c1)
        b._atR=r1;b._atC=c1;a._atR=r2;a._atC=c2;
        const before=countFilled();
        if(sa)activateSpecialAt(r2,c2,sa,a,b);
        else activateSpecialAt(r1,c1,sb,b,a);
        const cleared=Math.max(0,before-countFilled());
        addScore(Math.max(cleared,1)*12);
        buzz('valid');
        updateGoalsHud();
        dropPieces();
      },T.swap);
      return;
    }

    const matches=findMatches();
    if(matches.length){
      moves--;
      updateGoalsHud();
      scheduleCascade(()=>clearMatches(matches),T.swap);
    }else{
      scheduleCascade(()=>{
        swapCells(r1,c1,r2,c2);
        lastSwapCell=null;
        render({swap:[[r1,c1],[r2,c2]]});
        animating=false;
        buzz('invalid');
        const grid=document.getElementById('cbGrid');
        if(typeof shakeInvalidMove==='function')shakeInvalidMove(grid,{toast:'No match'});
        else toast('No match');
      },T.swapBack);
    }
  }

  function countFilled(){
    let n=0;
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(board[r][c]!=null)n++;
    return n;
  }

  function updateHudMeters(){
    updateGoalsHud();
  }

  function checkGameOver(){
    syncScoreGoals();
    if(goalsComplete()){showLevelComplete();return true;}
    if(moves<=0){showGameOver();return true;}
    return false;
  }

  function applyHint(){
    if(animating||gameOver||isPaused())return;
    const move=findHintMove();
    if(!move){
      shuffleGems(false);
      render({fresh:true});
      return;
    }
    hintPair=move;
    selected=null;
    buzz('select');
    render();
  }

  function goalSummaryLine(){
    return goals.map((g,i)=>{
      const cur=goalProgress[i]||0;
      if(g.type==='score')return `${cur}/${g.amount} pts`;
      if(g.type==='collect')return `${(PALETTE[g.color]||{}).name||'Gem'} ${cur}/${g.amount}`;
      if(g.type==='specials')return `${g.kind} ${cur}/${g.amount}`;
      return '';
    }).filter(Boolean).join(' · ');
  }

  function goalsChecklistHtml(){
    return '<ul class="tt-goals-check">' + goals.map((g, i) => {
      const cur = goalProgress[i] || 0;
      const ok = cur >= g.amount;
      let label = '';
      if (g.type === 'score') label = 'Score ' + cur.toLocaleString() + '/' + g.amount.toLocaleString();
      else if (g.type === 'collect') label = ((PALETTE[g.color] || {}).name || 'Gem') + ' ' + cur + '/' + g.amount;
      else if (g.type === 'specials') label = (g.kind === 'line' ? 'Lines' : g.kind === 'bomb' ? 'Bombs' : 'Prisms') + ' ' + cur + '/' + g.amount;
      return '<li class="' + (ok ? 'is-done' : 'is-miss') + '">' + (ok ? '✓ ' : '· ') + label + '</li>';
    }).join('') + '</ul>';
  }

  function hideResult(){
    const div = document.getElementById('cbOverlay');
    if (div) { div.style.display = 'none'; div.innerHTML = ''; }
  }

  function shareHandlers(shareStats){
    return {
      share: () => { if (typeof shareGameResult === 'function') shareGameResult('tiptap', shareStats); },
      challenge: async () => {
        if (typeof openFriendPickerSheet === 'function') {
          const f = await openFriendPickerSheet({ title: 'Challenge · Tip Tap' });
          if (f && typeof openFriendShareFollowup === 'function') {
            await openFriendShareFollowup(f, 'tiptap', { ...shareStats, friendText: 'Hey ' + f.name + ' — beat my Tip Tap score!' });
          } else if (f && typeof shareGameResult === 'function') {
            shareGameResult('tiptap', { ...shareStats, text: 'Hey ' + f.name + ' — beat my Tip Tap score!' });
          } else if (typeof shareGameResult === 'function') shareGameResult('tiptap', shareStats);
        } else if (typeof shareGameResult === 'function') shareGameResult('tiptap', shareStats);
      },
      story: () => { if (typeof postGameScoreStory === 'function') postGameScoreStory('tiptap', { ...shareStats, score }); },
    };
  }

  function showLevelComplete(){
    gameOver = true;
    animating = false;
    clearCascadeTimers();
    persistUnlock(level);
    const prevPb = typeof getGamePB === 'function' ? getGamePB('tiptap') : null;
    const vsBestRaw = typeof formatVsBest === 'function' ? formatVsBest('tiptap', score) : '';
    const isNewBest = score > 0 && (prevPb == null || score > prevPb);
    if (typeof setGamePB === 'function') setGamePB('tiptap', score);
    const vsBest = isNewBest
      ? ('New best · ' + score.toLocaleString() + ' pts' + (prevPb != null ? ' (was ' + prevPb.toLocaleString() + ')' : ''))
      : vsBestRaw;
    if (gs) gs.setOutcome('won');
    if (typeof recordGameResult === 'function') {
      recordGameResult('tiptap', true, false, { score, level, goals: goalSummaryLine(), scoreOnly: true });
    }
    buzz('complete');
    if (isNewBest) toast('New best · ' + score.toLocaleString() + ' pts');
    const div = document.getElementById('cbOverlay');
    if (!div) return;
    div.style.display = 'flex';
    const nextExists = level < LEVELS.length;
    const shareStats = {
      scoreLine: score.toLocaleString() + ' pts',
      score,
      meta: 'Level ' + level + ' cleared · ' + (vsBest || ''),
      text: 'Cleared Tip Tap level ' + level + ' with ' + score.toLocaleString() + ' on Chaupaal!',
    };
    const shareCard = typeof buildGameShareCard === 'function' ? buildGameShareCard('tiptap', shareStats) : '';
    const actions = [];
    if (nextExists) actions.push({ label: 'Next level', primary: true, id: 'again' });
    else actions.push({ label: 'Campaign complete', primary: true, id: 'hub' });
    actions.push({ label: 'Replay', primary: false, id: 'replay' });
    actions.push({ label: 'Levels', primary: false, id: 'levels' });
    if (typeof shareGameResult === 'function') actions.push({ label: 'Share', primary: false, id: 'share' });
    if (typeof openFriendPickerSheet === 'function') actions.push({ label: 'Challenge friend', primary: false, id: 'challenge' });
    if (typeof postGameScoreStory === 'function') actions.push({ label: 'Post to story', primary: false, id: 'story' });
    const subBits = [
      'Score ' + score.toLocaleString(),
      moves + ' moves left',
      goalSummaryLine(),
    ].filter(Boolean).join(' · ');
    div.innerHTML =
      (typeof gameResultHtml === 'function'
        ? gameResultHtml({
            gameId: 'tiptap',
            glyph: '✓',
            title: 'Level ' + level + ' complete',
            subtitle: subBits,
            vsBest: vsBest || undefined,
            shareCardHtml: shareCard + (isNewBest ? '<div class="tt-new-best" role="status">New personal best</div>' : '') + goalsChecklistHtml(),
            actions,
            hideStats: false,
          })
        : '<div><button type="button" id="cbNext">Next</button></div>');
    const sh = shareHandlers(shareStats);
    if (typeof wireGameResultActions === 'function') {
      wireGameResultActions(div, {
        ...sh,
        again: () => {
          hideResult();
          if (nextExists) startLevel(level + 1);
          else showHub();
        },
        hub: () => { hideResult(); showHub(); },
        replay: () => { hideResult(); startLevel(level); },
        levels: () => { hideResult(); openLevelPicker(); },
      });
    } else {
      (div.querySelector('[data-result-action]') || document.getElementById('cbNext'))?.addEventListener('click', () => {
        hideResult();
        if (nextExists) startLevel(level + 1);
        else showHub();
      });
    }
  }

  function showGameOver(){
    gameOver = true;
    animating = false;
    clearCascadeTimers();
    const prevPb = typeof getGamePB === 'function' ? getGamePB('tiptap') : null;
    const vsBestRaw = typeof formatVsBest === 'function' ? formatVsBest('tiptap', score) : '';
    const isNewBest = score > 0 && (prevPb == null || score > prevPb);
    if (typeof setGamePB === 'function') setGamePB('tiptap', score);
    const vsBest = isNewBest
      ? ('New best · ' + score.toLocaleString() + ' pts' + (prevPb != null ? ' (was ' + prevPb.toLocaleString() + ')' : ''))
      : vsBestRaw;
    if (gs) gs.setOutcome('lost');
    if (typeof recordGameResult === 'function') {
      recordGameResult('tiptap', false, false, { score, level, goals: goalSummaryLine(), scoreOnly: true });
    }
    buzz('lose');
    if (isNewBest) toast('New best · ' + score.toLocaleString() + ' pts');
    const div = document.getElementById('cbOverlay');
    if (!div) return;
    div.style.display = 'flex';
    const unmet = goals
      .map((g, i) => {
        const cur = goalProgress[i] || 0;
        if (cur >= g.amount) return null;
        if (g.type === 'score') return 'Score ' + cur + '/' + g.amount;
        if (g.type === 'collect') return ((PALETTE[g.color] || {}).name || 'Gem') + ' ' + cur + '/' + g.amount;
        if (g.type === 'specials') return g.kind + ' ' + cur + '/' + g.amount;
        return null;
      })
      .filter(Boolean)
      .join(', ');
    const shareStats = {
      scoreLine: score.toLocaleString() + ' pts',
      score,
      meta: 'Level ' + level + ' attempt · ' + (vsBest || ''),
      text: 'Tried Tip Tap level ' + level + ' — scored ' + score.toLocaleString() + ' on Chaupaal. Can you clear it?',
    };
    const shareCard = typeof buildGameShareCard === 'function' ? buildGameShareCard('tiptap', shareStats) : '';
    const actions = [
      { label: 'Retry', primary: true, id: 'again' },
      { label: 'Levels', primary: false, id: 'levels' },
    ];
    if (typeof shareGameResult === 'function') actions.push({ label: 'Share', primary: false, id: 'share' });
    if (typeof openFriendPickerSheet === 'function') actions.push({ label: 'Challenge friend', primary: false, id: 'challenge' });
    if (typeof postGameScoreStory === 'function') actions.push({ label: 'Post to story', primary: false, id: 'story' });
    div.innerHTML =
      (typeof gameResultHtml === 'function'
        ? gameResultHtml({
            gameId: 'tiptap',
            glyph: '·',
            title: 'Out of moves',
            subtitle: (unmet ? 'Still need: ' + unmet : goalSummaryLine()) + ' · Level ' + level,
            vsBest: vsBest || undefined,
            shareCardHtml: shareCard + (isNewBest ? '<div class="tt-new-best" role="status">New personal best</div>' : '') + goalsChecklistHtml(),
            actions,
          })
        : '<div><button type="button" id="cbRetry">Retry</button></div>');
    const sh = shareHandlers(shareStats);
    if (typeof wireGameResultActions === 'function') {
      wireGameResultActions(div, {
        ...sh,
        again: () => { hideResult(); startLevel(level); },
        levels: () => { hideResult(); openLevelPicker(); },
      });
    } else {
      (div.querySelector('[data-result-action]') || document.getElementById('cbRetry'))?.addEventListener('click', () => {
        hideResult();
        startLevel(level);
      });
    }
  }

  function pieceHtml(p){
    if(!p)return '';
    if(p.special===SPECIAL.bomb)return '<span class="tt-gem tt-gem--bomb" aria-hidden="true"></span>';
    if(p.special===SPECIAL.rainbow)return '<span class="tt-gem tt-gem--rainbow" aria-hidden="true"></span>';
    if(p.special===SPECIAL.line){
      const ax=p.axis==='v'?'tt-gem--line-v':'tt-gem--line-h';
      return `<span class="tt-gem tt-gem--line ${ax}" aria-hidden="true"></span>`;
    }
    const pal=PALETTE[p.color]||PALETTE[0];
    return `<span class="tt-gem" style="--tt-fill:${pal.fill};--tt-glow:${pal.glow}" aria-hidden="true"></span>`;
  }

  function isHintCell(r,c){
    if(!hintPair)return false;
    return(hintPair.r1===r&&hintPair.c1===c)||(hintPair.r2===r&&hintPair.c2===c);
  }

  function render(opts){
    if(!alive())return;
    const o=opts||{};
    const grid=document.getElementById('cbGrid');if(!grid)return;
    updateHudMeters();
    updateComboHud();

    grid.innerHTML='';
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const cell=document.createElement('button');
      cell.type='button';
      const p=board[r][c];
      const isSel=selected&&selected[0]===r&&selected[1]===c;
      const isHint=isHintCell(r,c);
      cell.className='tt-cell game-tap-target'+(isSel?' is-selected':'')+(isHint?' is-hint':'')+(hintPair&&!isHint?' is-dim':'');
      cell.dataset.r=r;cell.dataset.c=c;
      cell.setAttribute('aria-label',p?(p.special||('gem '+(p.color+1))):'empty');
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
      if(o.swap&&o.swap.some(p=>p[0]===r&&p[1]===c))cell.classList.add('tt-piece--swap');
      cell.addEventListener('click',(ev)=>{
        ev.preventDefault();
        if(Date.now()<suppressClickUntil)return;
        if(animating||gameOver||isPaused())return;
        const nr=+cell.dataset.r,nc=+cell.dataset.c;
        if(!selected){selected=[nr,nc];hintPair=null;buzz('select');render();}
        else if(selected[0]===nr&&selected[1]===nc){selected=null;render();}
        else if(Math.abs(selected[0]-nr)+Math.abs(selected[1]-nc)===1){
          const sr=selected[0],sc=selected[1];
          selected=null;
          trySwap(sr,sc,nr,nc);
        }else{
          selected=[nr,nc];hintPair=null;buzz('select');render();
        }
      });
      grid.appendChild(cell);
    }
    const sample=grid.querySelector('.tt-cell');
    if(sample)cellSize=sample.getBoundingClientRect().height||40;
  }

  function showHub(){
    gameOver = true;
    animating = false;
    clearCascadeTimers();
    hideResult();
    const hub = document.getElementById('ttHub');
    const play = document.getElementById('ttPlay');
    const pick = document.getElementById('ttPicker');
    if (play) play.hidden = true;
    if (pick) pick.hidden = true;
    if (hub) hub.hidden = false;
    const cont = readNextLevel();
    const bestLvl = readBestCleared();
    const pb = typeof getGamePB === 'function' ? getGamePB('tiptap') : null;
    const sub = document.getElementById('cbSub');
    if (sub) sub.textContent = 'Campaign · 100 levels';
    const pauseBtn = document.getElementById('cbPause');
    if (pauseBtn) pauseBtn.style.visibility = 'hidden';
    const hintBtn = document.getElementById('cbHint');
    if (hintBtn) hintBtn.style.visibility = 'hidden';
    const contBtn = document.getElementById('ttContinue');
    if (contBtn) {
      contBtn.textContent = bestLvl >= LEVELS.length ? 'Replay level ' + LEVELS.length : 'Continue · Level ' + cont;
    }
    const meta = document.getElementById('ttHubMeta');
    if (meta) {
      meta.textContent =
        (pb != null ? 'Best ' + Number(pb).toLocaleString() + ' pts' : 'No PB yet') +
        (bestLvl ? ' · Cleared Lv ' + bestLvl : '') +
        ' · ' + actLabel(cont);
    }
  }

  function openLevelPicker(){
    const hub = document.getElementById('ttHub');
    const play = document.getElementById('ttPlay');
    const pick = document.getElementById('ttPicker');
    if (hub) hub.hidden = true;
    if (play) play.hidden = true;
    if (!pick) return;
    pick.hidden = false;
    hideResult();
    const unlocked = readNextLevel();
    const bestLvl = readBestCleared();
    const grid = document.getElementById('ttPickerGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let n = 1; n <= LEVELS.length; n++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const locked = n > unlocked;
      const cleared = n <= bestLvl || n < unlocked;
      const current = n === unlocked && bestLvl < n;
      btn.className =
        'tt-pick-cell game-tap-target' +
        (locked ? ' is-locked' : '') +
        (cleared ? ' is-cleared' : '') +
        (current ? ' is-current' : '');
      btn.textContent = locked ? '·' : String(n);
      btn.disabled = locked;
      btn.setAttribute('aria-label', locked ? 'Level ' + n + ' locked' : 'Level ' + n);
      if (!locked) {
        btn.addEventListener('click', () => {
          pick.hidden = true;
          startLevel(n);
        });
      }
      grid.appendChild(btn);
    }
    const sub = document.getElementById('cbSub');
    if (sub) sub.textContent = 'Choose a level';
  }

  overlay.innerHTML = `
    ${gameChromeHtml({
      title: 'Tip Tap',
      subtitle: 'Campaign · 100 levels',
      backId: 'cbBack',
      pauseId: 'cbPause',
      rightHtml:
        '<button type="button" id="cbLevels" class="game-chrome-action game-tap-target" aria-label="Levels">Levels</button>' +
        '<button type="button" id="cbHint" class="game-chrome-action game-tap-target" aria-label="Hint" style="visibility:hidden">Hint</button>' +
        '<span class="game-chrome-metric" id="cbScore">0</span>',
    })}
    <div id="ttHub" class="tt-hub">
      <div class="tt-hub-title">Tip Tap</div>
      <div class="tt-hub-sub">Solo match-3 · 100 levels · no Live</div>
      <div id="ttHubMeta" class="tt-hub-meta"></div>
      <button type="button" id="ttContinue" class="tt-hub-cta game-tap-target">Continue</button>
      <button type="button" id="ttOpenLevels" class="tt-hub-secondary game-tap-target">Level select</button>
    </div>
    <div id="ttPicker" class="tt-picker" hidden>
      <div class="tt-picker-head">Levels</div>
      <div id="ttPickerGrid" class="tt-picker-grid"></div>
      <button type="button" id="ttPickerBack" class="tt-hub-secondary game-tap-target">Back</button>
    </div>
    <div id="ttPlay" class="tt-play" hidden>
      <div class="tt-meter">
        <div class="tt-meter-row">
          <span>Moves: <strong id="cbMoves">0</strong></span>
          <span id="cbCombo" class="tt-combo" hidden></span>
        </div>
        <div id="cbGoals" class="tt-goals" aria-live="polite"></div>
        <div id="cbProgressTrack" class="tt-meter-track"><div id="cbProgress" class="tt-meter-fill"></div></div>
      </div>
      <div class="tt-board-wrap">
        <div id="cbGrid" class="tt-grid" style="grid-template-columns:repeat(${COLS},1fr)"></div>
        <div id="cbFx" class="tt-fx-layer" aria-hidden="true"></div>
      </div>
    </div>
    <div id="cbOverlay" class="tt-result-overlay"></div>
  `;
  const subEl = overlay.querySelector('.game-chrome-subtitle');
  if (subEl) subEl.id = 'cbSub';

  fxLayer = document.getElementById('cbFx');
  document.getElementById('cbBack').addEventListener('click', () => {
    const hub = document.getElementById('ttHub');
    const pick = document.getElementById('ttPicker');
    const play = document.getElementById('ttPlay');
    if (pick && !pick.hidden) {
      showHub();
      return;
    }
    if (hub && !hub.hidden) {
      close();
      return;
    }
    if (gameOver) {
      showHub();
      return;
    }
    const ask =
      typeof confirmLeaveGame === 'function'
        ? confirmLeaveGame({ title: 'Leave Tip Tap?', body: 'Level progress for this run will be lost.' })
        : Promise.resolve(window.confirm('Leave Tip Tap?'));
    Promise.resolve(ask).then((ok) => {
      if (ok) showHub();
    });
  });
  document.getElementById('cbHint')?.addEventListener('click', (e) => {
    e.stopPropagation();
    applyHint();
  });
  document.getElementById('cbLevels')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const hubEl = document.getElementById('ttHub');
    const playEl = document.getElementById('ttPlay');
    if (hubEl && !hubEl.hidden) {
      openLevelPicker();
      return;
    }
    if (playEl && !playEl.hidden && !gameOver) {
      const ask =
        typeof confirmLeaveGame === 'function'
          ? confirmLeaveGame({ title: 'Leave this level?', body: 'Open level select — this run will be lost.' })
          : Promise.resolve(window.confirm('Leave this level for level select?'));
      Promise.resolve(ask).then((ok) => {
        if (!ok) return;
        clearCascadeTimers();
        animating = false;
        openLevelPicker();
      });
      return;
    }
    openLevelPicker();
  });
  document.getElementById('ttContinue')?.addEventListener('click', () => startLevel(readNextLevel()));
  document.getElementById('ttOpenLevels')?.addEventListener('click', () => openLevelPicker());
  document.getElementById('ttPickerBack')?.addEventListener('click', () => showHub());

  if (typeof createGamePauseController === 'function') {
    pauseCtrl = createGamePauseController({
      host: overlay,
      pauseBtnId: 'cbPause',
      onPause() {},
      onResume() {
        if (cascadeResume) {
          const fn = cascadeResume;
          cascadeResume = null;
          scheduleCascade(fn, 40);
        }
      },
      onQuit: close,
    });
  }

  const gridEl = document.getElementById('cbGrid');
  let sx = 0,
    sy = 0,
    sCell = null,
    pointerSwiping = false;
  function beginSwipe(clientX, clientY, el) {
    if (!el || animating || gameOver || isPaused()) return;
    sx = clientX;
    sy = clientY;
    sCell = el;
    pointerSwiping = true;
  }
  function endSwipe(clientX, clientY) {
    if (!sCell || !pointerSwiping) {
      sCell = null;
      pointerSwiping = false;
      return;
    }
    const dx = clientX - sx,
      dy = clientY - sy;
    const r = +sCell.dataset.r,
      c = +sCell.dataset.c;
    sCell = null;
    pointerSwiping = false;
    if (animating || gameOver || isPaused()) return;
    if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
    let nr = r,
      nc = c;
    if (Math.abs(dx) > Math.abs(dy)) nc += dx > 0 ? 1 : -1;
    else nr += dy > 0 ? 1 : -1;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;
    suppressClickUntil = Date.now() + 350;
    selected = null;
    hintPair = null;
    trySwap(r, c, nr, nc);
  }
  gridEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest?.('.tt-cell');
    if (!el) return;
    beginSwipe(e.clientX, e.clientY, el);
    try {
      gridEl.setPointerCapture(e.pointerId);
    } catch (err) {}
  });
  gridEl.addEventListener('pointerup', (e) => {
    endSwipe(e.clientX, e.clientY);
  });
  gridEl.addEventListener('pointercancel', () => {
    sCell = null;
    pointerSwiping = false;
  });

  showHub();
}

// --- Game registry self-registration (arcade.js) ---
if (typeof registerGame === 'function') {
  registerGame({
    id: 'rushrunner',
    name: 'Rush Runner',
    desc: 'Endless runner · Solo',
    icon: '🏃',
    ratingKey: 'rushrunner',
    gameType: 'solo',
    genre: 'arcade',
    solo: true,
    selfChat: true,
    order: 100,
    meta: { graduated: true, phase: 1 },
    launch() { openRushRunner(); },
  });
  registerGame({
    id: 'tiptap',
    name: 'Tip Tap',
    desc: 'Match-3 campaign · 100 levels · Solo',
    icon: '✨',
    ratingKey: 'tiptap',
    gameType: 'solo',
    genre: 'brain',
    solo: true,
    selfChat: true,
    order: 110,
    meta: { graduated: true, phase: 1 },
    launch() { openTipTap(); },
  });
}

