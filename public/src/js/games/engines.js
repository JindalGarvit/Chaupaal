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
  const launch = window.__dangalLaunchCtx || {};
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
      if (typeof DSL !== 'undefined' && DSL.onGameOver) {
        try {
          DSL.onGameOver({ gameType: type, result: r, overlay });
        } catch (e) {}
      }
      if (window.DangalEconomy && typeof DangalEconomy.reportGameEnd === 'function') {
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
    if (typeof clearDangalLaunchCtx === 'function') clearDangalLaunchCtx();
    if (onEnd) {
      try {
        onEnd(r);
      } catch (e) {}
    }
    if (overlay && overlay.isConnected) overlay.remove();
  }

  if (typeof createGameSession === 'function') {
    session = createGameSession({
      id: matchId || type + '_' + Date.now(),
      type,
      title: opts.title || type,
      mode: opts.mode || '1v1',
      context: {
        chat: opts.chat,
        overlayScope:
          typeof OVERLAY_SCOPE_CHAT !== 'undefined' ? OVERLAY_SCOPE_CHAT : 'chat',
        source: opts.source || launch.source,
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

/** Shared Live chess time controls (challenge + rematch). */
const CHESS_LIVE_TC_OPTIONS = [
  { cat: 'Bullet', time: '1+0', min: 1, inc: 0 },
  { cat: 'Bullet', time: '2+1', min: 2, inc: 1 },
  { cat: 'Blitz', time: '3+0', min: 3, inc: 0 },
  { cat: 'Blitz', time: '3+2', min: 3, inc: 2 },
  { cat: 'Blitz', time: '5+0', min: 5, inc: 0 },
  { cat: 'Blitz', time: '5+3', min: 5, inc: 3 },
  { cat: 'Rapid', time: '10+0', min: 10, inc: 0 },
  { cat: 'Rapid', time: '15+10', min: 15, inc: 10 },
  { cat: 'Rapid', time: '30+0', min: 30, inc: 0 },
  { cat: 'Classical', time: '60+0', min: 60, inc: 0 },
  { cat: 'No Limit', time: '∞', min: 0, inc: 0 },
];
const CHESS_LIVE_TC_ICONS = { Bullet: '⚡', Blitz: '🔥', Rapid: '⏱️', Classical: '🏆', 'No Limit': '♾️' };

/**
 * Compact Live time + Chess960 sheet before challenge/rematch.
 * @returns {Promise<{min:number,inc:number,label:string,chess960:boolean}|null>}
 */
function openChessLiveTimeSheet(opts) {
  const o = opts || {};
  const defaultMin = Number(o.defaultMin);
  const defaultInc = Number(o.defaultInc);
  const default960 = !!o.defaultChess960;
  return new Promise((resolve) => {
    const device = document.querySelector('.device');
    if (!device) {
      resolve({ min: 0, inc: 0, label: '∞', chess960: false });
      return;
    }
    let picked960 = default960;
    const sheet = document.createElement('div');
    sheet.className = 'chess-live-tc-sheet game-overlay game-overlay--dark';
    sheet.style.cssText =
      'position:absolute;inset:0;background:rgba(10,12,24,0.92);z-index:120;display:flex;flex-direction:column;justify-content:flex-end;padding-top:env(safe-area-inset-top,0px);';
    const cats = [...new Set(CHESS_LIVE_TC_OPTIONS.map((t) => t.cat))];
    const isDefault = (t) =>
      Number.isFinite(defaultMin) && t.min === defaultMin && t.inc === (Number.isFinite(defaultInc) ? defaultInc : t.inc);
    sheet.innerHTML = `
      <div class="chess-live-tc-panel" style="background:#15192e;border-radius:24px 24px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));max-height:85%;overflow:auto;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;color:#fff;margin-bottom:4px;">Live time control</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-bottom:14px;">Both players get the same clocks. ∞ = untimed.</div>
        <button type="button" id="chessLive960" class="game-tap-target" aria-pressed="${picked960 ? 'true' : 'false'}" style="width:100%;padding:12px;margin-bottom:14px;background:${picked960 ? 'rgba(201,162,39,0.25)' : 'rgba(255,255,255,0.07)'};border:2px solid ${picked960 ? 'var(--gold)' : 'rgba(255,255,255,0.12)'};border-radius:14px;color:#fff;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;text-align:left;">${picked960 ? 'Fischer Random (Chess960)' : 'Standard starting position'}</button>
        ${cats
          .map((cat) => {
            const optsCat = CHESS_LIVE_TC_OPTIONS.filter((t) => t.cat === cat);
            return `<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">${CHESS_LIVE_TC_ICONS[cat] || ''} ${cat}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${optsCat
              .map((t) => {
                const on = isDefault(t);
                return `<button type="button" class="chess-live-tc-btn game-tap-target" data-min="${t.min}" data-inc="${t.inc}" data-label="${t.time}" style="padding:12px 6px;background:${on ? 'rgba(201,162,39,0.25)' : 'rgba(255,255,255,0.07)'};border:2px solid ${on ? 'var(--gold)' : 'rgba(255,255,255,0.12)'};border-radius:14px;color:#fff;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;cursor:pointer;">${t.time}</button>`;
              })
              .join('')}</div></div>`;
          })
          .join('')}
        <button type="button" id="chessLiveTcCancel" style="width:100%;padding:12px;background:none;border:none;color:rgba(255,255,255,0.5);font-size:14px;cursor:pointer;">Cancel</button>
      </div>`;
    device.appendChild(sheet);
    const finish = (val) => {
      sheet.remove();
      resolve(val);
    };
    sheet.querySelector('#chessLive960')?.addEventListener('click', () => {
      picked960 = !picked960;
      const btn = sheet.querySelector('#chessLive960');
      if (!btn) return;
      btn.textContent = picked960 ? 'Fischer Random (Chess960)' : 'Standard starting position';
      btn.style.borderColor = picked960 ? 'var(--gold)' : 'rgba(255,255,255,0.12)';
      btn.style.background = picked960 ? 'rgba(201,162,39,0.25)' : 'rgba(255,255,255,0.07)';
      btn.setAttribute('aria-pressed', picked960 ? 'true' : 'false');
    });
    sheet.querySelectorAll('.chess-live-tc-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        finish({
          min: parseInt(btn.dataset.min, 10) || 0,
          inc: parseInt(btn.dataset.inc, 10) || 0,
          label: btn.dataset.label || '∞',
          chess960: picked960,
        });
      });
    });
    sheet.querySelector('#chessLiveTcCancel')?.addEventListener('click', () => finish(null));
  });
}
window.openChessLiveTimeSheet = openChessLiveTimeSheet;

function chessTcFromLaunch(launch, att) {
  const L = launch || {};
  const A = att || {};
  const tcObj = L.timeControl && typeof L.timeControl === 'object' ? L.timeControl : null;
  const min =
    Number(L.min ?? L.timeMin ?? tcObj?.min ?? A.timeMin ?? A.min) || 0;
  const inc =
    Number(L.inc ?? L.timeInc ?? tcObj?.inc ?? A.timeInc ?? A.inc) || 0;
  const chess960 = !!(L.chess960 ?? A.chess960 ?? tcObj?.chess960);
  const label =
    L.timeControlLabel ||
    (typeof L.timeControl === 'string' ? L.timeControl : '') ||
    A.timeControl ||
    (min > 0 ? min + '+' + inc : '∞');
  return { min, inc, chess960, label };
}

// ===================== PROFESSIONAL CHESS ENGINE =====================
function openChessGame(chat){
  const launch=window.__dangalLaunchCtx||{};
  const raw=chat||{};
  const oppUid=
    (typeof opponentUidFromChat==='function'?opponentUidFromChat(raw):'')||
    launch.opponentUid||
    raw.opponentUid||
    raw.peerUid||
    raw.uid||
    '';
  const persistable=!!(oppUid&&typeof isPersistableUid==='function'&&isPersistableUid(oppUid));
  const liveReady=
    persistable&&
    typeof DangalLive!=='undefined'&&
    DangalLive.isLive(raw,launch);

  // Live only with real opponent — never invent Live vs AI
  if(liveReady){
    const mid=String(raw.dangalMatchId||launch.matchId||'').trim();
    if(!mid){
      if(typeof showToast==='function')showToast('Challenge link broken — open Practice instead');
    }else{
      const liveChat=Object.assign({},raw,{
        dangalMatchId:mid,
        uid:oppUid,
        peerUid:oppUid,
        opponentUid:oppUid,
        dangalSource:launch.source||raw.dangalSource||'',
      });
      const fromLaunch=chessTcFromLaunch(launch,raw);
      const tcLive={
        min:fromLaunch.min,
        inc:fromLaunch.inc,
        difficulty:'live',
        aiDepth:0,
        chess960:fromLaunch.chess960,
        playAs:null,
        matchId:mid,
        stake:Number(launch.stake)||0,
        timeLabel:fromLaunch.label,
      };
      startChessGame(liveChat,tcLive);
      return;
    }
  }

  const practiceChat={
    name:(raw.name&&!/^(ai|practice)$/i.test(String(raw.id||'')))?String(raw.name):'Practice AI',
    id:'ai',
    uid:'',
    peerUid:'',
    dangalMatchId:'',
  };

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
  let picked960=false;
  let pickedSide='w';
  const tcSheet=document.createElement('div');
  tcSheet.className='chess-picker-overlay game-overlay game-overlay--dark';
  tcSheet.style.cssText='position:absolute;inset:0;background:#15192e;z-index:100;display:flex;flex-direction:column;overflow-y:auto;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);';
  const cats=[...new Set(TC_OPTIONS.map(t=>t.cat))];
  const eloHint=typeof getGameRating==='function'?getGameRating('chess'):null;
  tcSheet.innerHTML=`
    ${typeof gameChromeHtml==='function'?gameChromeHtml({title:'Chess',subtitle:eloHint?`Practice · Elo ${eloHint}`:'Practice vs AI',backId:'chessPickBack'}):''}
    <div style="padding:8px 16px 28px;">
      <div style="margin-bottom:18px;">
        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Difficulty</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
          ${DIFF_OPTIONS.map(d=>`<button type="button" class="chess-diff-btn game-tap-target" data-diff="${d.id}" aria-pressed="${d.id===pickedDiff?'true':'false'}" style="padding:12px 6px;background:${d.id===pickedDiff?'rgba(201,162,39,0.25)':'rgba(255,255,255,0.07)'};border:2px solid ${d.id===pickedDiff?'var(--gold)':'rgba(255,255,255,0.12)'};border-radius:14px;color:#fff;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;"><div>${d.label}</div><div style="font-size:10px;opacity:.55;font-weight:600;margin-top:2px;">${d.desc}</div></button>`).join('')}
        </div>
      </div>
      <div style="margin-bottom:18px;">
        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">You play as</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <button type="button" class="chess-side-btn game-tap-target" data-side="w" aria-pressed="true" style="padding:12px;background:rgba(201,162,39,0.25);border:2px solid var(--gold);border-radius:14px;color:#fff;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;">White</button>
          <button type="button" class="chess-side-btn game-tap-target" data-side="b" aria-pressed="false" style="padding:12px;background:rgba(255,255,255,0.07);border:2px solid rgba(255,255,255,0.12);border-radius:14px;color:#fff;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;">Black</button>
          <button type="button" class="chess-side-btn game-tap-target" data-side="random" aria-pressed="false" style="padding:12px;background:rgba(255,255,255,0.07);border:2px solid rgba(255,255,255,0.12);border-radius:14px;color:#fff;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;">Random</button>
        </div>
      </div>
      <div style="margin-bottom:18px;">
        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Position</div>
        <button type="button" id="chess960Toggle" class="game-tap-target" aria-pressed="false" style="width:100%;padding:12px;background:rgba(255,255,255,0.07);border:2px solid rgba(255,255,255,0.12);border-radius:14px;color:#fff;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;text-align:left;">Standard starting position</button>
        <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:6px;">Fischer Random shuffles the back rank</div>
      </div>
      ${cats.map(cat=>{
        const opts=TC_OPTIONS.filter(t=>t.cat===cat);
        return `<div style="margin-bottom:18px;"><div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">${TC_ICONS[cat]} ${cat}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${opts.map(t=>`<button type="button" class="tc-btn game-tap-target" data-min="${t.min}" data-inc="${t.inc}" style="padding:14px 6px;background:rgba(255,255,255,0.07);border:2px solid rgba(255,255,255,0.12);border-radius:14px;color:#fff;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;transition:all .15s;">${t.time}</button>`).join('')}</div></div>`;
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
  tcSheet.querySelector('#chessPickBack')?.addEventListener('click',closePicker);
  tcSheet.querySelectorAll('.chess-diff-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      pickedDiff=btn.dataset.diff;
      tcSheet.querySelectorAll('.chess-diff-btn').forEach(b=>{
        const on=b.dataset.diff===pickedDiff;
        b.style.background=on?'rgba(201,162,39,0.25)':'rgba(255,255,255,0.07)';
        b.style.borderColor=on?'var(--gold)':'rgba(255,255,255,0.12)';
        b.setAttribute('aria-pressed',on?'true':'false');
      });
    });
  });
  tcSheet.querySelectorAll('.chess-side-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      pickedSide=btn.dataset.side==='b'?'b':btn.dataset.side==='random'?'random':'w';
      tcSheet.querySelectorAll('.chess-side-btn').forEach(b=>{
        const on=b.dataset.side===pickedSide;
        b.style.background=on?'rgba(201,162,39,0.25)':'rgba(255,255,255,0.07)';
        b.style.borderColor=on?'var(--gold)':'rgba(255,255,255,0.12)';
        b.setAttribute('aria-pressed',on?'true':'false');
      });
    });
  });
  const chess960Btn=tcSheet.querySelector('#chess960Toggle');
  if(chess960Btn){
    chess960Btn.addEventListener('click',()=>{
      picked960=!picked960;
      chess960Btn.textContent=picked960?'Fischer Random (Chess960)':'Standard starting position';
      chess960Btn.style.borderColor=picked960?'var(--gold)':'rgba(255,255,255,0.12)';
      chess960Btn.style.background=picked960?'rgba(201,162,39,0.25)':'rgba(255,255,255,0.07)';
      chess960Btn.setAttribute('aria-pressed',picked960?'true':'false');
    });
  }
  tcSheet.querySelectorAll('.tc-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      tcSheet.querySelectorAll('.tc-btn').forEach(b=>{
        b.style.borderColor='rgba(255,255,255,0.12)';
        b.style.background='rgba(255,255,255,0.07)';
      });
      btn.style.borderColor='var(--gold)';
      btn.style.background='rgba(201,162,39,0.25)';
      closePicker();
      const depth=(DIFF_OPTIONS.find(d=>d.id===pickedDiff)||DIFF_OPTIONS[1]).depth;
      const playAs=pickedSide==='random'?(Math.random()<0.5?'w':'b'):(pickedSide==='b'?'b':'w');
      const tc={
        min:parseInt(btn.dataset.min,10)||0,
        inc:parseInt(btn.dataset.inc,10)||0,
        difficulty:pickedDiff,
        aiDepth:depth,
        chess960:picked960,
        playAs,
      };
      startChessGame(practiceChat,tc);
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
  overlay.className = 'chess-picker-overlay game-overlay game-overlay--dark';
  overlay.style.cssText =
    'position:absolute;inset:0;background:#15192e;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;padding-top:max(24px,env(safe-area-inset-top));';
  const rawMsg = (err && err.message) || 'Something went wrong loading the board.';
  const msg = /Chess library not loaded/i.test(rawMsg)
    ? 'Chess rules engine failed to load. Refresh the app, then try again.'
    : rawMsg;
  overlay.innerHTML = `
    <div style="font-size:48px;margin-bottom:12px;" aria-hidden="true">♟</div>
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;color:#fff;margin-bottom:8px;">Could not start chess</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:20px;max-width:280px;">${msg}</div>
    <button type="button" id="chessErrRetry" class="game-tap-target" style="width:100%;max-width:260px;padding:14px;background:var(--gold);color:#1a1a2e;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">Try again</button>
    <button type="button" id="chessErrBack" class="game-tap-target" style="width:100%;max-width:260px;padding:12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:14px;font-size:14px;cursor:pointer;">Back</button>
  `;
  device.appendChild(overlay);
  if (typeof prepareGameOverlay === 'function') prepareGameOverlay(overlay, { theme: 'dark', gameId: 'chess' });
  document.getElementById('chessErrRetry')?.addEventListener('click', () => {
    overlay.remove();
    startChessGame(chat, tc);
  });
  document.getElementById('chessErrBack')?.addEventListener('click', () => overlay.remove());
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
const practiceLabel=tc.difficulty==='easy'?'Easy':tc.difficulty==='hard'?'Hard':'Medium';
const DIFF_LABEL=tc.difficulty==='live'
  ?(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel?DangalLive.modeChromeLabel(true):'Live 1v1')
  :(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel
    ?DangalLive.modeChromeLabel(false,practiceLabel)
    :('Practice · '+practiceLabel));
const eloShown=typeof getGameRating==='function'?getGameRating('chess'):null;
const chromeSub=eloShown&&tc.difficulty!=='live'?`${DIFF_LABEL} · Elo ${eloShown}`:DIFF_LABEL;

function chess960Fen(){
  const place=Array(8).fill('');
  const dark=[0,2,4,6][Math.floor(Math.random()*4)];
  const light=[1,3,5,7][Math.floor(Math.random()*4)];
  place[dark]='b';
  place[light]='b';
  const empty=()=>place.map((p,i)=>p?'':i).filter((i)=>i!=='');
  const pick=(arr)=>arr.splice(Math.floor(Math.random()*arr.length),1)[0];
  let e=empty();
  place[pick(e)]='q';
  e=empty();
  place[pick(e)]='n';
  e=empty();
  place[pick(e)]='n';
  e=empty().sort((a,b)=>a-b);
  place[e[0]]='r';
  place[e[1]]='k';
  place[e[2]]='r';
  const black=place.join('');
  return `${black}/pppppppp/8/8/8/8/PPPPPPPP/${black.toUpperCase()} w - - 0 1`;
}

function rcToSq(r,c){return FILES[c]+(8-r);}
function sqToRC(sq){return[8-parseInt(sq[1],10),FILES.indexOf(sq[0])];}
function pieceColor(p){return p&&(p===p.toUpperCase()?'w':'b');}

function boardFromChess(chessInst){
  const b=Array(8).fill(null).map(()=>Array(8).fill(null));
  chessInst.board().forEach((row,r)=>{
    row.forEach((cell,c)=>{
      if(cell)b[r][c]=cell.color==='w'?cell.type.toUpperCase():cell.type.toLowerCase();
    });
  });
  return b;
}

let chess;
let used960=false;
const liveOn=typeof DangalLive!=='undefined'&&DangalLive.isLive(chat,window.__dangalLaunchCtx);
const liveRoles=liveOn&&DangalLive.roles?DangalLive.roles(chat,window.__dangalLaunchCtx):null;
const myChessColor=liveRoles?liveRoles.myColor:(tc.playAs==='b'?'b':'w');
let liveHandle=null;
let applyingLive=false;
let leaveConfirmed=false;
let aiThinking=false;
let liveVersion=0;
let liveEnded=false;
let fenReady=!liveOn||!(liveRoles&&!liveRoles.host);
let syncWaitStarted=0;
let drawOfferCooldownUntil=0;
let historyExpanded=false;
let activeClockColor=null;
let renderFlipped=myChessColor==='b';
let reconnectTick=null;
const liveStake=Number((window.__dangalLaunchCtx&&window.__dangalLaunchCtx.stake)||tc.stake||0)||0;
const DRAW_OFFER_COOLDOWN_MS=30000;
const ABORT_MAX_PLIES=4;

try{
  // Guest Live waits for host fen — don't invent a different Chess960
  if(liveOn&&liveRoles&&!liveRoles.host){
    chess=new Chess();
    used960=false;
  }else if(tc.chess960){
    chess=new Chess(chess960Fen(),{skipValidation:true});
    used960=true;
  }else{
    chess=new Chess();
  }
}catch(e){
  if(tc.chess960&&typeof showToast==='function'){
    showToast('Chess960 start failed — using standard position');
  }
  chess=new Chess();
  used960=false;
}

const HAS_TIMER=tc.min>0;
let clocks={w:tc.min*60,b:tc.min*60};

let state={
  board:boardFromChess(chess),
  turn:chess.turn(),
  selected:null,
  legalMoves:[],
  history:[],
  status:'playing',
  check:false,
  ratingRecorded:false,
  lastMove:null,
  animating:false,
  drawReason:'',
  endDetail:'',
  localWon:null,
  localDrew:false,
  incomingDrawOffer:false,
  outgoingDrawOffer:false,
  oppReconnecting:false,
  oppForfeitMsLeft:0,
};

function syncFromChess(){
  state.board=boardFromChess(chess);
  state.turn=chess.turn();
  state.check=chess.isCheck();
  if(chess.isCheckmate()){
    state.status='checkmate';
    state.drawReason='';
    state.endDetail='Checkmate';
  }else if(chess.isStalemate()){
    state.status='stalemate';
    state.drawReason='stalemate';
    state.endDetail='Stalemate';
  }else if(typeof chess.isThreefoldRepetition==='function'&&chess.isThreefoldRepetition()){
    state.status='draw';
    state.drawReason='repetition';
    state.endDetail='Draw by repetition';
  }else if(typeof chess.isDrawByFiftyMoves==='function'&&chess.isDrawByFiftyMoves()){
    state.status='draw';
    state.drawReason='fifty';
    state.endDetail='Draw · 50-move rule';
  }else if(typeof chess.isInsufficientMaterial==='function'&&chess.isInsufficientMaterial()){
    state.status='draw';
    state.drawReason='insufficient';
    state.endDetail='Draw · insufficient material';
  }else if(typeof chess.isDraw==='function'&&chess.isDraw()){
    state.status='draw';
    state.drawReason='draw';
    state.endDetail='Draw';
  }else if(state.status!=='timeout'&&state.status!=='resign'){
    state.status='playing';
    state.drawReason='';
    state.endDetail='';
  }
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
  function alphaBeta(fen,depth,alpha,beta,maximizing,deadline){
    if(Date.now()>deadline)return evalBoard(boardFromChess(new Chess(fen)));
    const c=new Chess(fen);
    if(depth===0)return evalBoard(boardFromChess(c));
    const moves=c.moves({verbose:true});
    if(!moves.length)return c.isCheck()? (maximizing?-20000:20000):0;
    if(maximizing){
      let best=-Infinity;
      for(const m of moves){
        const nc=new Chess(fen);
        nc.move(m);
        best=Math.max(best,alphaBeta(nc.fen(),depth-1,alpha,beta,false,deadline));
        alpha=Math.max(alpha,best);if(beta<=alpha)break;
        if(Date.now()>deadline)break;
      }
      return best;
    }
    let best=Infinity;
    for(const m of moves){
      const nc=new Chess(fen);
      nc.move(m);
      best=Math.min(best,alphaBeta(nc.fen(),depth-1,alpha,beta,true,deadline));
      beta=Math.min(beta,best);if(beta<=alpha)break;
      if(Date.now()>deadline)break;
    }
    return best;
  }
  if(!legalMoves.length)return null;
  if(AI_DEPTH===1){
    const scored=legalMoves.map(m=>{
      const nc=new Chess(chessInstance.fen());
      nc.move({from:rcToSq(m.from[0],m.from[1]),to:rcToSq(m.to[0],m.to[1]),promotion:(m.promo||'q').toLowerCase()});
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
  const deadline=Date.now()+2200;
  for(const m of ordered){
    if(Date.now()>deadline)break;
    const nc=new Chess(chessInstance.fen());
    nc.move({from:rcToSq(m.from[0],m.from[1]),to:rcToSq(m.to[0],m.to[1]),promotion:(m.promo||'q').toLowerCase()});
    const score=alphaBeta(nc.fen(),searchDepth,-Infinity,Infinity,false,deadline);
    if(score>bestScore){bestScore=score;best=m;}
  }
  return best||ordered[0];
}

function pickAIMove(legalMoves){
  try{
    return getAIMove(chess,legalMoves)||legalMoves[0]||null;
  }catch(e){
    console.warn('[chess] AI fallback',e);
    return legalMoves[Math.floor(Math.random()*legalMoves.length)]||null;
  }
}

const overlay=document.createElement('div');
overlay.className='chess-play-overlay game-overlay game-overlay--dark';
overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);';

let clockInterval=null;
const gs=beginGameOverlaySession({
  type:'chess',title:'Chess',mode:liveOn?'live':'practice',chat,overlay,
  opponentUid:liveOn&&liveRoles?liveRoles.opp:'',
  matchId:tc.matchId||(chat&&chat.dangalMatchId)||'',
  stake:liveOn?liveStake:0,
  cleanup(){
    clearInterval(clockInterval);clockInterval=null;
    if(reconnectTick){clearInterval(reconnectTick);reconnectTick=null;}
    aiThinking=false;
    if(liveHandle&&!leaveConfirmed){
      const stillPlaying=state&&state.status==='playing';
      const abortOk=stillPlaying&&chess.history().length<ABORT_MAX_PLIES;
      try{liveHandle.leave({forfeit:stillPlaying&&!abortOk});}catch(e){try{liveHandle.leave();}catch(e2){}}
    }
  },
});
if(!gs.alive())return;

function applyRemoteClocks(val){
  if(!HAS_TIMER||!val||!val.clocks)return;
  let w=Math.max(0,Number(val.clocks.w));
  let b=Math.max(0,Number(val.clocks.b));
  if(!Number.isFinite(w))w=clocks.w;
  if(!Number.isFinite(b))b=clocks.b;
  const active=val.clockTurn||(typeof val.fen==='string'&&val.fen.split(' ')[1])||state.turn;
  if(val.clockAt&&active&&(!val.status||val.status==='playing')){
    const elapsed=Math.max(0,Math.floor((Date.now()-Number(val.clockAt))/1000));
    if(active==='w')w=Math.max(0,w-elapsed);
    else if(active==='b')b=Math.max(0,b-elapsed);
  }
  clocks.w=w;
  clocks.b=b;
  stopClock();
  if((!val.status||val.status==='playing')&&!gameEndedStatus()&&fenReady&&gs.alive()){
    startClock(active==='b'?'b':'w');
  }
}

function handleLiveEnd(val){
  if(!val||liveEnded)return;
  liveEnded=true;
  stopClock();
  aiThinking=false;
  state.incomingDrawOffer=false;
  state.outgoingDrawOffer=false;
  state.oppReconnecting=false;
  if(reconnectTick){clearInterval(reconnectTick);reconnectTick=null;}
  const status=String(val.status||'');
  if(status==='aborted'){
    state.status='aborted';
    state.endDetail='Game aborted';
    state.localWon=null;
    state.localDrew=false;
  }else if(status==='forfeit'||status==='resign'){
    state.status='resign';
    const iWon=liveRoles&&val.winner===liveRoles.me;
    state.localWon=!!iWon;
    state.localDrew=false;
    state.endDetail=iWon?'Opponent left — you win':'You left — forfeit';
  }else if(status==='timeout'){
    state.status='timeout';
    if(liveRoles&&val.winner){
      state.turn=val.winner===liveRoles.playerA?'b':'w';
    }
    state.localWon=liveRoles?val.winner===liveRoles.me:false;
    state.localDrew=false;
    state.endDetail=state.localWon?'Opponent flagged':'You flagged';
  }else if(status==='checkmate'){
    state.status='checkmate';
    state.endDetail='Checkmate';
    state.localWon=liveRoles?val.winner===liveRoles.me:null;
    state.localDrew=false;
  }else if(status==='stalemate'){
    state.status='stalemate';
    state.endDetail='Stalemate';
    state.localWon=false;
    state.localDrew=true;
  }else if(status==='draw'){
    state.status='draw';
    state.endDetail=val.endDetail||'Draw agreed';
    state.localWon=false;
    state.localDrew=true;
  }else{
    state.status=status||'over';
  }
  if(val.fen&&val.fen!==chess.fen()){
    try{chess.load(val.fen);syncFromChess();}catch(e){}
  }else if(status!=='forfeit'&&status!=='resign'&&status!=='timeout'&&status!=='aborted'){
    syncFromChess();
  }
  if(val.lastMove)state.lastMove=val.lastMove;
  if(!state.ratingRecorded){
    if(status==='aborted'){
      state.ratingRecorded=true;
      gs.setOutcome('aborted');
    }else{
      const iWon=liveRoles&&val.winner===liveRoles.me;
      const drew=status==='draw'||status==='stalemate';
      if(status==='forfeit'||status==='resign'||status==='timeout'||status==='checkmate'||drew){
        state.ratingRecorded=true;
        state.localWon=drew?false:!!iWon;
        state.localDrew=!!drew;
        if(drew)gs.setOutcome('draw');
        else gs.setOutcome(iWon?'won':'lost');
        if(typeof recordGameResult==='function')recordGameResult('chess',!!iWon&&!drew,!!drew);
        if(typeof recordDangalSession==='function')recordDangalSession('chess',{won:!!iWon&&!drew,drew,score:iWon&&!drew?1:0});
      }
    }
  }
  leaveConfirmed=true;
  try{if(liveHandle)liveHandle.leave({forfeit:false});}catch(e){}
  liveHandle=null;
  render();
}

if(liveOn&&liveRoles){
  const matchId=String(
    tc.matchId||
    (chat&&chat.dangalMatchId)||
    (window.__dangalLaunchCtx&&window.__dangalLaunchCtx.matchId)||
    ''
  ).trim();
  syncWaitStarted=Date.now();
  liveHandle=DangalLive.join({
    gameType:'chess',
    matchId,
    me:liveRoles.me,
    playerA:liveRoles.playerA,
    playerB:liveRoles.playerB,
    stake:liveStake,
    // Host seeds fen/clocks once; guest joins empty so host Chess960 wins
    fen:liveRoles.host?chess.fen():null,
    clocks:liveRoles.host&&HAS_TIMER?{w:clocks.w,b:clocks.b}:null,
    clockAt:liveRoles.host&&HAS_TIMER?Date.now():null,
    clockTurn:liveRoles.host&&HAS_TIMER?'w':null,
    timeControl:liveRoles.host?(HAS_TIMER?{min:tc.min,inc:tc.inc,label:tc.timeLabel||(tc.min+'+'+tc.inc)}:{min:0,inc:0,label:'∞'}):null,
    onForfeit(){
      handleLiveEnd({status:'forfeit',winner:liveRoles.me});
    },
    onPresence(info){
      if(!gs.alive()||liveEnded||gameEndedStatus())return;
      const warn=!!(info&&(info.warn||info.forfeitSoon)&&info.online===false);
      const left=Math.max(0,Number(info&&info.forfeitMsLeft)||0);
      const changed=state.oppReconnecting!==warn||Math.abs((state.oppForfeitMsLeft||0)-left)>900;
      state.oppReconnecting=warn;
      state.oppForfeitMsLeft=left;
      if(warn&&!reconnectTick){
        reconnectTick=setInterval(()=>{
          if(!gs.alive()||liveEnded||!state.oppReconnecting){
            clearInterval(reconnectTick);reconnectTick=null;return;
          }
          state.oppForfeitMsLeft=Math.max(0,(state.oppForfeitMsLeft||0)-1000);
          const el=overlay.querySelector('#chessReconnectSecs');
          if(el)el.textContent=String(Math.ceil((state.oppForfeitMsLeft||0)/1000));
          if(state.oppForfeitMsLeft<=0){clearInterval(reconnectTick);reconnectTick=null;}
        },1000);
      }
      if(!warn&&reconnectTick){clearInterval(reconnectTick);reconnectTick=null;}
      if(changed)render();
    },
    onSnap(val){
      if(!val||!gs.alive()||applyingLive||liveEnded)return;
      liveVersion=Number(val.version||val.seq)||liveVersion;
      const st=String(val.status||'playing');
      if(st&&st!=='playing'){
        handleLiveEnd(val);
        return;
      }
      if(st==='playing'&&val.winner&&!String(val.fen||'').trim()){
        console.warn('[chess] stale finished match without fen');
        return;
      }
      const offer=val.drawOffer?String(val.drawOffer):'';
      if(offer&&liveRoles){
        state.incomingDrawOffer=offer===liveRoles.opp;
        state.outgoingDrawOffer=offer===liveRoles.me;
      }else{
        state.incomingDrawOffer=false;
        state.outgoingDrawOffer=false;
      }
      if(val.fen&&String(val.fen).trim()){
        fenReady=true;
        if(val.fen!==chess.fen()){
          applyingLive=true;
          try{
            const ok=chess.load(val.fen);
            if(ok===false)throw new Error('load rejected');
            syncFromChess();
            if(val.lastMove)state.lastMove=val.lastMove;
            if(typeof gameFeedback==='function')gameFeedback('move');
          }catch(e){
            console.warn('[chess] ignore bad remote fen',e?.message||e);
          }
          applyingLive=false;
        }else if(val.lastMove){
          state.lastMove=val.lastMove;
        }
      }
      if(HAS_TIMER&&fenReady)applyRemoteClocks(val);
      else if(fenReady)syncFromChess();
      render();
    },
  });
  if(!liveHandle&&typeof showToast==='function'){
    showToast('Could not join Live chess — try again');
  }else if(liveHandle&&!fenReady){
    gs.schedule(()=>{
      if(!gs.alive()||fenReady||liveEnded)return;
      if(typeof showToast==='function')showToast('Still waiting for the host board…');
    },18000);
  }
}

function gameEndedStatus(){
  return state.status==='checkmate'||state.status==='stalemate'||state.status==='timeout'||state.status==='resign'||state.status==='draw'||state.status==='aborted';
}

function canAbortChess(){
  return !gameEndedStatus()&&chess.history().length<ABORT_MAX_PLIES;
}

function sanHistoryHtml(){
  let sans=[];
  try{sans=chess.history({verbose:false})||[];}catch(e){sans=[];}
  if(!sans.length)return'<div class="chess-history-empty">No moves yet</div>';
  const rows=[];
  for(let i=0;i<sans.length;i+=2){
    const n=(i/2)+1;
    rows.push(`<div class="chess-history-row"><span class="chess-history-n">${n}.</span><span>${sans[i]||''}</span><span>${sans[i+1]||''}</span></div>`);
  }
  const visible=historyExpanded?rows:rows.slice(-6);
  return `<div class="chess-history-list">${visible.join('')}</div>${rows.length>6?`<button type="button" id="chessHistoryToggle" class="chess-history-toggle game-tap-target">${historyExpanded?'Show less':'Full list'}</button>`:''}`;
}

function recordEndIfNeeded(){
  if(!gameEndedStatus()||state.ratingRecorded)return;
  state.ratingRecorded=true;
  if(state.status==='aborted'){
    gs.setOutcome('aborted');
    return;
  }
  let won=false,drew=false;
  if(state.localDrew||state.status==='stalemate'||state.status==='draw'){
    drew=true;won=false;
  }else if(state.localWon===true){
    won=true;
  }else if(state.localWon===false){
    won=false;
  }else if(state.status==='checkmate')won=state.turn!==myChessColor;
  else if(state.status==='timeout')won=state.turn!==myChessColor;
  else if(state.status==='resign')won=false;
  state.localWon=drew?false:won;
  state.localDrew=drew;
  gs.setOutcome(drew?'draw':won?'won':'lost');
  if(typeof recordGameResult==='function')recordGameResult('chess',won,drew);
  else if(typeof recordDangalSession==='function')recordDangalSession('chess',{won,drew,score:won?1:0});
  if(typeof recordDuelStreak==='function')recordDuelStreak(chat.id||chat.name,won,drew);
}

async function askChessAbort(){
  if(!canAbortChess()||!gs.alive())return;
  if(typeof confirmLeaveGame==='function'){
    const ok=await confirmLeaveGame({title:'Abort game?',body:'Fewer than two moves — no rating or chip change.'});
    if(!ok)return;
  }
  stopClock();
  state.status='aborted';
  state.endDetail='Game aborted';
  state.localWon=null;
  state.localDrew=false;
  if(liveOn&&liveHandle){
    try{
      await Promise.resolve(liveHandle.push({status:'aborted',winner:null,drawOffer:null,baseVersion:liveVersion,endDetail:'Game aborted'}));
    }catch(e){}
    leaveConfirmed=true;
    liveEnded=true;
    try{liveHandle.leave({forfeit:false});}catch(e){}
    liveHandle=null;
  }
  recordEndIfNeeded();
  render();
}

async function askChessLeave(){
  const playing=!gameEndedStatus();
  if(!playing){gs.close();return;}
  if(canAbortChess()){
    await askChessAbort();
    if(state.status==='aborted')gs.close('aborted');
    return;
  }
  const body=liveOn
    ?'Leaving now counts as a forfeit for your opponent.'
    :'This counts as a resign against the AI.';
  if(typeof DangalLive!=='undefined'&&DangalLive.requestLeave){
    const ok=await DangalLive.requestLeave({
      liveHandle,isPlaying:playing,title:'Leave Chess?',body,
      onLeave:()=>{leaveConfirmed=true;liveHandle=null;},
    });
    if(!ok)return;
  }else if(typeof confirmLeaveGame==='function'){
    const ok=await confirmLeaveGame({title:'Leave Chess?',body});
    if(!ok)return;
  }
  if(playing&&!state.ratingRecorded){
    state.status='resign';
    state.endDetail='You resigned';
    state.localWon=false;
    state.localDrew=false;
    recordEndIfNeeded();
  }
  gs.close('lost');
}

async function askChessResign(){
  if(gameEndedStatus()||!gs.alive())return;
  if(canAbortChess()){
    await askChessAbort();
    return;
  }
  if(typeof confirmLeaveGame==='function'){
    const ok=await confirmLeaveGame({title:'Resign?',body:liveOn?'You will lose this Live game.':'You lose this Practice game.'});
    if(!ok)return;
  }
  stopClock();
  state.status='resign';
  state.endDetail='You resigned';
  state.selected=null;
  state.localWon=false;
  state.localDrew=false;
  if(liveOn&&liveHandle){
    try{await Promise.resolve(liveHandle.forfeit());}catch(e){}
    leaveConfirmed=true;
    liveEnded=true;
  }
  recordEndIfNeeded();
  render();
}

async function offerChessDraw(){
  if(gameEndedStatus()||!gs.alive()||state.animating)return;
  if(Date.now()<drawOfferCooldownUntil){
    if(typeof showToast==='function')showToast('Wait a moment before offering draw again');
    return;
  }
  if(!liveOn){
    // Practice: AI declines unless rules already force a draw
    if(chess.isDraw&&chess.isDraw()){
      state.status='draw';
      state.endDetail='Draw';
      state.localDrew=true;
      recordEndIfNeeded();
      render();
      return;
    }
    drawOfferCooldownUntil=Date.now()+DRAW_OFFER_COOLDOWN_MS;
    if(typeof showToast==='function')showToast('AI declines the draw');
    if(typeof gameFeedback==='function')gameFeedback('invalid');
    return;
  }
  if(!liveHandle||!liveRoles)return;
  if(state.outgoingDrawOffer){
    if(typeof showToast==='function')showToast('Draw offer already sent');
    return;
  }
  drawOfferCooldownUntil=Date.now()+DRAW_OFFER_COOLDOWN_MS;
  state.outgoingDrawOffer=true;
  try{
    await Promise.resolve(liveHandle.push({drawOffer:liveRoles.me,baseVersion:liveVersion}));
  }catch(e){}
  if(typeof showToast==='function')showToast('Draw offered');
  render();
}

async function respondChessDraw(accept){
  if(!liveOn||!liveHandle||!liveRoles||gameEndedStatus())return;
  if(accept){
    stopClock();
    state.status='draw';
    state.endDetail='Draw agreed';
    state.localDrew=true;
    state.localWon=false;
    try{
      await Promise.resolve(liveHandle.push({
        status:'draw',
        winner:null,
        drawOffer:null,
        endDetail:'Draw agreed',
        fen:chess.fen(),
        baseVersion:liveVersion,
      }));
    }catch(e){}
    handleLiveEnd({status:'draw',winner:null,endDetail:'Draw agreed',fen:chess.fen()});
  }else{
    state.incomingDrawOffer=false;
    try{
      await Promise.resolve(liveHandle.push({drawOffer:null,baseVersion:liveVersion}));
    }catch(e){}
    drawOfferCooldownUntil=Date.now()+DRAW_OFFER_COOLDOWN_MS;
    if(typeof showToast==='function')showToast('Draw declined');
    render();
  }
}

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

function statusLabel(){
  if(liveOn&&!fenReady)return 'Waiting for opponent…';
  if(state.status==='aborted')return 'Game aborted';
  if(state.status==='checkmate'){
    if(state.localWon===true)return 'You won by checkmate';
    if(state.localWon===false)return `${chat.name} wins by checkmate`;
    return state.turn===myChessColor?`${chat.name} wins by checkmate`:'You won by checkmate';
  }
  if(state.status==='stalemate')return 'Stalemate — draw';
  if(state.status==='draw')return state.endDetail||'Draw';
  if(state.status==='timeout'){
    return state.localWon===true?'You won on time':state.localWon===false?`${chat.name} wins on time`:(state.turn===myChessColor?`${chat.name} wins on time`:'You won on time');
  }
  if(state.status==='resign'){
    if(state.localWon===true)return state.endDetail||'Opponent resigned — you win';
    return state.endDetail||'Game over';
  }
  if(state.incomingDrawOffer)return `${chat.name} offers a draw`;
  if(state.outgoingDrawOffer)return 'Draw offer sent…';
  if(aiThinking)return 'AI thinking…';
  if(state.check)return 'Check!';
  if(state.turn===myChessColor)return 'Your move';
  return liveOn?`Opponent’s move…`:'AI to move';
}

function outcomeFlags(){
  let chessWon=false,chessDrew=false;
  if(state.status==='aborted')return{chessWon:false,chessDrew:false,aborted:true};
  if(state.localDrew||state.status==='stalemate'||state.status==='draw')chessDrew=true;
  else if(state.localWon===true)chessWon=true;
  else if(state.localWon===false)chessWon=false;
  else if(state.status==='checkmate')chessWon=state.turn!==myChessColor;
  else if(state.status==='timeout')chessWon=state.turn!==myChessColor;
  else if(state.status==='resign')chessWon=false;
  return{chessWon,chessDrew,aborted:false};
}

function clockHtml(color){
  if(!HAS_TIMER)return'';
  const active=activeClockColor===color&&!gameEndedStatus();
  const low=clocks[color]<=10;
  return `<div id="clock_${color}" class="chess-clock${active?' chess-clock--active':''}${low?' chess-clock--low':''}" style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;">${formatClock(clocks[color])}</div>`;
}

function render(){
  syncFromChess();
  const cap=capturedPieces();
  const statusText=statusLabel();
  const gameEnded=gameEndedStatus();
  if(gameEnded)recordEndIfNeeded();
  const{chessWon,chessDrew,aborted}=outcomeFlags();
  const turnMode=gameEnded?'over':!fenReady?'theirs':state.incomingDrawOffer?'over':state.check&&state.turn===myChessColor?'over':(aiThinking||state.turn!==myChessColor)?'theirs':'yours';
  const turnBanner=typeof gameTurnBannerHtml==='function'
    ? gameTurnBannerHtml({ mode: turnMode, label: statusText, pulse: turnMode==='yours' })
    : `<div style="padding:10px 16px;text-align:center;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;color:#fff;flex-shrink:0;">${statusText}</div>`;
  const kingSq=state.check?findKingSquare(state.turn):null;
  const oppLabel=liveOn?(chat.name||'Opponent'):'Practice AI';
  const canShare=typeof shareGameResult==='function';
  const canChallenge=typeof openFriendPickerSheet==='function'||typeof generateChallengeLink==='function';
  const canStory=typeof postGameScoreStory==='function';
  const canChat=liveOn&&liveRoles&&liveRoles.opp;
  const timeBit=liveOn?(tc.timeLabel||(HAS_TIMER?`${tc.min}+${tc.inc}`:'∞')):'';
  const chromeLiveSub=[chromeSub+(used960?' · 960':''),timeBit,liveOn&&liveStake>0?`⚡${liveStake}`:''].filter(Boolean).join(' · ');

  let pgnSnippet='';
  try{pgnSnippet=chess.pgn({maxWidth:60,newline:' '})||chess.history().join(' ');}catch(e){
    try{pgnSnippet=chess.history().join(' ');}catch(e2){pgnSnippet='';}
  }

  let resultBlock='';
  if(gameEnded&&typeof gameResultHtml==='function'){
    const shareStats={
      scoreLine:aborted?'Aborted':chessDrew?'Draw':(chessWon?'Win':'Loss'),
      meta:chromeLiveSub,
      vs:`vs ${oppLabel}`,
      text:`Chaupaal Chess (${DIFF_LABEL}): ${aborted?'aborted':chessDrew?'draw':chessWon?'I won':'tough loss'} vs ${oppLabel}${pgnSnippet?`\n${pgnSnippet}`:''} · virtual chips only`,
    };
    const actions=[];
    if(!aborted)actions.push({label:liveOn?'Rematch':'Play again',primary:true,id:'again'});
    else actions.push({label:liveOn?'New challenge':'Play again',primary:true,id:'again'});
    if(canShare)actions.push({label:'Share',primary:false,id:'share'});
    if(canChallenge)actions.push({label:'Challenge friend',primary:false,id:'challenge'});
    if(canStory&&!aborted)actions.push({label:'Post to story',primary:false,id:'story'});
    if(canChat)actions.push({label:`Chat with ${oppLabel}`,primary:false,id:'chat'});
    resultBlock=gameResultHtml({
      gameId:'chess',
      glyph:aborted?'·':chessDrew?'=':chessWon?'✓':'·',
      title:aborted?'Aborted':chessDrew?'Draw':(chessWon?'You won':`${oppLabel} won`),
      subtitle:statusText+(liveOn&&liveStake>0?` · Stake ⚡${liveStake} (virtual)`:''),
      shareCardHtml:typeof buildGameShareCard==='function'?buildGameShareCard('chess',shareStats):'',
      actions,
    });
  }

  const abortOk=canAbortChess();
  const chromeRight=gameEnded?'':`
    ${abortOk?`<button type="button" id="chessAbort" class="game-chrome-action game-tap-target" aria-label="Abort">Abort</button>`:''}
    <button type="button" id="chessDraw" class="game-chrome-action game-tap-target" aria-label="Offer draw">Draw</button>
    <button type="button" id="chessResign" class="game-chrome-action game-tap-target" aria-label="Resign">Resign</button>
    <button type="button" id="chessFlip" class="game-chrome-action game-tap-target" aria-label="Flip board">Flip</button>`;

  const drawBanner=state.incomingDrawOffer&&!gameEnded
    ?`<div class="chess-draw-banner" role="status">
        <span>${oppLabel} offers a draw</span>
        <button type="button" id="chessDrawAccept" class="game-tap-target">Accept</button>
        <button type="button" id="chessDrawDecline" class="game-tap-target">Decline</button>
      </div>`:'';
  const reconnectBanner=state.oppReconnecting&&!gameEnded
    ?`<div class="chess-reconnect-banner" role="status">Opponent reconnecting… <span id="chessReconnectSecs">${Math.ceil((state.oppForfeitMsLeft||0)/1000)}</span>s until forfeit</div>`
    :'';

  overlay.innerHTML=`
    ${typeof gameChromeHtml==='function'?gameChromeHtml({title:'Chess',subtitle:chromeLiveSub,backId:'chessBack',rightHtml:chromeRight}):''}
    ${resultBlock?`<div class="chess-result-mount">${resultBlock}<div class="chess-chip-delta" id="chessChipDelta" hidden></div></div>`:`
    ${reconnectBanner}
    ${drawBanner}
    <div class="chess-rail chess-rail--top" style="background:var(--game-panel,#1F2542);padding:8px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;gap:8px;">
      <div style="color:#ccc;font-size:13px;min-width:0;"><span aria-hidden="true">${myChessColor==='w'?'●':'○'}</span> ${oppLabel} <span style="opacity:.6;font-size:11px;">(${myChessColor==='w'?'Black':'White'})</span></div>
      <div style="font-size:12px;color:var(--gold);">${myChessColor==='w'?cap.bCap:cap.wCap}</div>
      ${clockHtml(myChessColor==='w'?'b':'w')}
    </div>
    <div class="chess-board-wrap" style="flex:1;display:flex;align-items:center;justify-content:center;padding:8px;position:relative;min-height:0;">
      <div id="chessBoard" class="chess-board" style="display:grid;grid-template-columns:repeat(8,1fr);width:min(360px,calc(100% - 8px));max-width:100%;aspect-ratio:1;border-radius:var(--game-board-radius,6px);overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);position:relative;" role="grid" aria-label="Chess board"></div>
      <div id="chessSlideLayer" style="position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;"></div>
      <div id="chessPromoHost" class="chess-promo-host" hidden></div>
    </div>
    <div class="chess-history" aria-label="Move history">${sanHistoryHtml()}</div>
    <div class="chess-rail chess-rail--bottom" style="background:var(--game-panel,#1F2542);padding:8px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;gap:8px;">
      <div style="color:#fff;font-size:13px;"><span aria-hidden="true">${myChessColor==='w'?'○':'●'}</span> You <span style="opacity:.6;font-size:11px;">(${myChessColor==='w'?'White':'Black'})</span></div>
      <div style="font-size:12px;color:var(--gold);">${myChessColor==='w'?cap.wCap:cap.bCap}</div>
      ${clockHtml(myChessColor)}
    </div>
    ${turnBanner}`}
  `;
  document.getElementById('chessBack')?.addEventListener('click',()=>{askChessLeave();});
  if(resultBlock&&typeof wireGameResultActions==='function'){
    const settleMatchId=String(tc.matchId||(chat&&chat.dangalMatchId)||(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.matchId)||'').trim();
    const settleOppUid=liveRoles?liveRoles.opp:'';
    const shareStats={
      scoreLine:aborted?'Aborted':chessDrew?'Draw':(chessWon?'Win':'Loss'),
      meta:chromeLiveSub,
      vs:`vs ${oppLabel}`,
      text:`Chaupaal Chess (${DIFF_LABEL}): ${aborted?'aborted':chessDrew?'draw':chessWon?'I won':'tough loss'} vs ${oppLabel}${pgnSnippet?`\n${pgnSnippet}`:''} · virtual chips only`,
    };
    function paintChessSettle(settle){
      const el=overlay.querySelector('#chessChipDelta');
      if(!el||!settle||settle.error||settle.duplicate&&settle.chipDelta==null&&settle.eloDelta==null){
        if(el&&settle&&!settle.error&&settle.duplicate&&(settle.chipDelta!=null||settle.eloDelta!=null)){/* fall through */}
        else if(el&&settle&&settle.duplicate){
          // still paint if cached payload has deltas
        }else if(!settle||settle.error)return;
      }
      if(!el||!settle||settle.error)return;
      const delta=Number(settle.chipDelta);
      const elo=settle.eloDelta!=null?Number(settle.eloDelta):null;
      const bal=settle.chips!=null?Number(settle.chips):null;
      const parts=[];
      if(Number.isFinite(delta)&&(delta!==0||liveStake>0)){
        parts.push(delta===0?`Virtual chips · balance ${bal!=null?bal:'—'}`:`Virtual chips ${delta>0?'+':''}${delta}${bal!=null?` · balance ${bal}`:''}`);
      }
      if(Number.isFinite(elo)&&elo!==0)parts.push(`Elo ${elo>0?'+':''}${elo}`);
      if(!parts.length&&liveOn){
        parts.push('Settled · virtual chips only — not real money');
      }
      if(!parts.length)return;
      el.hidden=false;
      el.textContent=parts.join(' · ')+' · not real money';
    }
    async function settleChessOnce(){
      if(!liveOn||aborted||!window.DangalEconomy||typeof DangalEconomy.reportGameEnd!=='function'||!settleMatchId)return null;
      try{
        const me=typeof getCurrentUid==='function'?getCurrentUid():'';
        const settle=await DangalEconomy.reportGameEnd({
          gameType:'chess',
          result:chessDrew?'draw':chessWon?'win':'loss',
          won:!!chessWon&&!chessDrew,
          isDraw:!!chessDrew,
          matchId:settleMatchId,
          sessionId:settleMatchId,
          opponentUid:settleOppUid,
          stake:liveStake,
          winnerUid:chessDrew?'':(chessWon?me:settleOppUid),
        });
        if(settle&&settle.error){
          const el=overlay.querySelector('#chessChipDelta');
          if(el){
            el.hidden=false;
            el.innerHTML=`Couldn’t update chips <button type="button" id="chessChipRetry" class="game-tap-target" style="margin-left:8px;">Retry</button>`;
            el.querySelector('#chessChipRetry')?.addEventListener('click',()=>{settleChessOnce();});
          }
          return settle;
        }
        paintChessSettle(settle);
        return settle;
      }catch(e){
        return null;
      }
    }
    settleChessOnce();

    async function startChessLiveRematch(nextStake, chessTc){
      const rematchId=
        settleOppUid&&typeof dangalMatchId==='function'
          ?dangalMatchId('chess',{name:oppLabel,opponentUid:settleOppUid})
          :'chess_'+Date.now();
      const chatId=
        (window.__dangalLaunchCtx&&window.__dangalLaunchCtx.chatId)||
        (window.currentOpenChat&&(window.currentOpenChat.firestoreId||window.currentOpenChat.id))||
        '';
      const tcPayload=chessTc
        ?{
            min:chessTc.min,
            inc:chessTc.inc,
            timeMin:chessTc.min,
            timeInc:chessTc.inc,
            chess960:!!chessTc.chess960,
            timeControl:chessTc.label,
            timeControlLabel:chessTc.label,
          }
        :{};
      try{
        window.__dangalLaunchCtx=Object.assign({},window.__dangalLaunchCtx||{},{
          gameId:'chess',
          gameType:'chess',
          matchId:rematchId,
          stake:nextStake,
          mode:'live',
          opponentUid:settleOppUid,
          source:'challenge_host',
          chatId,
          startedAt:Date.now(),
        },tcPayload);
      }catch(e){}
      if(typeof sendChallengeCard==='function'&&settleOppUid&&chatId){
        try{
          await sendChallengeCard(settleOppUid,'chess',Object.assign({chatId,matchId:rematchId,stake:nextStake},tcPayload));
          if(typeof showToast==='function')showToast('Rematch sent — they Accept to join');
        }catch(e){}
      }
      gs.close();
      openChessGame({
        name:oppLabel,
        id:settleOppUid,
        uid:settleOppUid,
        peerUid:settleOppUid,
        opponentUid:settleOppUid,
        dangalMatchId:rematchId,
        dangalSource:'challenge_host',
      });
    }

    wireGameResultActions(overlay,{
      again:async()=>{
        try{window.__dangalLaunchCtx=liveOn?Object.assign({},window.__dangalLaunchCtx||{},{matchId:''}):null;}catch(e){}
        if(!liveOn){
          gs.close();
          openChessGame({name:'Practice AI',id:'ai'});
          return;
        }
        let nextStake=liveStake;
        if(typeof stakesEnabledForGame==='function'&&stakesEnabledForGame('chess')&&typeof openDangalStakeSheet==='function'){
          const picked=await openDangalStakeSheet('chess',{defaultStake:liveStake});
          if(picked==null)return;
          nextStake=picked;
        }
        let chessTc={min:tc.min||0,inc:tc.inc||0,label:tc.timeLabel||(tc.min?tc.min+'+'+tc.inc:'∞'),chess960:!!used960};
        if(typeof openChessLiveTimeSheet==='function'){
          const pickedTc=await openChessLiveTimeSheet({
            defaultMin:tc.min||5,
            defaultInc:tc.inc||0,
            defaultChess960:!!used960,
          });
          if(pickedTc==null)return;
          chessTc=pickedTc;
        }
        await startChessLiveRematch(nextStake,chessTc);
      },
      share:()=>{if(typeof shareGameResult==='function')shareGameResult('chess',shareStats);},
      challenge:async()=>{
        if(typeof openFriendPickerSheet!=='function'){
          if(typeof generateChallengeLink==='function')generateChallengeLink(chessWon?1:0,'chess');
          return;
        }
        const friend=await openFriendPickerSheet({title:'Chess challenge',subtitle:'Live 1v1 · virtual chips only'});
        if(!friend)return;
        const uid=friend.uid||friend.id||'';
        if(!uid||(typeof isPersistableUid==='function'&&!isPersistableUid(uid))){
          if(typeof showToast==='function')showToast('Pick a real friend to challenge');
          return;
        }
        let stakePick=0;
        if(typeof stakesEnabledForGame==='function'&&stakesEnabledForGame('chess')&&typeof openDangalStakeSheet==='function'){
          const picked=await openDangalStakeSheet('chess',{defaultStake:0});
          if(picked==null)return;
          stakePick=picked;
        }
        let chessTc={min:5,inc:0,label:'5+0',chess960:false};
        if(typeof openChessLiveTimeSheet==='function'){
          const pickedTc=await openChessLiveTimeSheet({defaultMin:5,defaultInc:0});
          if(pickedTc==null)return;
          chessTc=pickedTc;
        }
        const mid=typeof dangalMatchId==='function'?dangalMatchId('chess',{name:friend.name,opponentUid:uid}):'chess_'+Date.now();
        const chatId=friend.chatId||friend.firestoreId||'';
        const tcPayload={
          min:chessTc.min,inc:chessTc.inc,timeMin:chessTc.min,timeInc:chessTc.inc,
          chess960:!!chessTc.chess960,timeControl:chessTc.label,timeControlLabel:chessTc.label,
        };
        try{
          window.__dangalLaunchCtx=Object.assign({
            gameId:'chess',gameType:'chess',mode:'live',matchId:mid,opponentUid:uid,stake:stakePick,
            chatId,source:'challenge_host',startedAt:Date.now(),
          },tcPayload);
        }catch(e){}
        if(typeof sendChallengeCard==='function'&&chatId){
          try{await sendChallengeCard(uid,'chess',Object.assign({chatId,matchId:mid,stake:stakePick},tcPayload));}catch(e){}
        }
        gs.close();
        openChessGame({
          name:friend.name,id:uid,uid,peerUid:uid,opponentUid:uid,
          dangalMatchId:mid,dangalSource:'challenge_host',
        });
      },
      story:()=>{
        if(typeof postGameScoreStory==='function'){
          postGameScoreStory('chess',{scoreLine:shareStats.scoreLine,meta:shareStats.meta,text:shareStats.text});
        }
      },
      chat:()=>{
        gs.close();
        if(typeof openPeerDm==='function'&&liveRoles&&liveRoles.opp){
          openPeerDm({peerUid:liveRoles.opp,peerName:oppLabel,seedHello:false});
        }
      },
    });
    return;
  }
  document.getElementById('chessFlip')?.addEventListener('click',()=>{state.selected=null;renderFlipped=!renderFlipped;render();});
  document.getElementById('chessResign')?.addEventListener('click',()=>{askChessResign();});
  document.getElementById('chessAbort')?.addEventListener('click',()=>{askChessAbort();});
  document.getElementById('chessDraw')?.addEventListener('click',()=>{offerChessDraw();});
  document.getElementById('chessDrawAccept')?.addEventListener('click',()=>{respondChessDraw(true);});
  document.getElementById('chessDrawDecline')?.addEventListener('click',()=>{respondChessDraw(false);});
  document.getElementById('chessHistoryToggle')?.addEventListener('click',()=>{historyExpanded=!historyExpanded;render();});
  const boardEl=document.getElementById('chessBoard');
  if(!boardEl)return;
  const rows=renderFlipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
  const cols=renderFlipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
  rows.forEach(r=>cols.forEach(c=>{
    const sq=document.createElement('div');
    const isCheckPulse=kingSq&&kingSq[0]===r&&kingSq[1]===c;
    sq.dataset.r=r;sq.dataset.c=c;
    sq.style.cssText=`aspect-ratio:1;background:${sqHighlight(r,c)};display:flex;align-items:center;justify-content:center;font-size:clamp(22px,5vw,34px);cursor:pointer;position:relative;user-select:none;-webkit-tap-highlight-color:transparent;${isCheckPulse?'animation:chessCheckPulse .7s ease-in-out infinite;box-shadow:inset 0 0 0 3px #e74c3c;':''}`;
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

function formatClock(s){const m=Math.floor(Math.max(0,s)/60);const sec=Math.max(0,s)%60;return m+':'+(sec<10?'0':'')+sec;}
function startClock(color){
  if(!HAS_TIMER||!gs.alive()||!fenReady)return;
  activeClockColor=color;
  clearInterval(clockInterval);
  document.querySelectorAll('.chess-clock').forEach((el)=>{
    el.classList.toggle('chess-clock--active',el.id==='clock_'+color);
  });
  clockInterval=setInterval(()=>{
    if(!gs.alive()||gameEndedStatus()||liveEnded){clearInterval(clockInterval);return;}
    clocks[color]--;
    const el=document.getElementById('clock_'+color);
    if(el){
      el.textContent=formatClock(clocks[color]);
      el.classList.toggle('chess-clock--low',clocks[color]<=10);
      el.classList.add('chess-clock--active');
    }
    if(clocks[color]<=0){
      clocks[color]=0;clearInterval(clockInterval);
      activeClockColor=null;
      const winnerUid=liveRoles?(color==='w'?liveRoles.playerB:liveRoles.playerA):null;
      state.status='timeout';
      state.endDetail=color===myChessColor?'You flagged':'Opponent flagged';
      state.turn=color;
      state.localWon=color!==myChessColor;
      state.localDrew=false;
      if(liveOn&&liveHandle&&!liveEnded){
        try{
          liveHandle.push({
            status:'timeout',
            winner:winnerUid,
            fen:chess.fen(),
            clocks:{w:clocks.w,b:clocks.b},
            clockAt:Date.now(),
            clockTurn:color,
            baseVersion:liveVersion,
          });
        }catch(e){}
        handleLiveEnd({status:'timeout',winner:winnerUid,fen:chess.fen()});
      }else{
        recordEndIfNeeded();
        render();
        if(typeof showToast==='function')showToast(color===myChessColor?`${chat.name||'Opponent'} wins on time`:'You won on time');
      }
    }
  },1000);
}
function stopClock(){clearInterval(clockInterval);clockInterval=null;activeClockColor=null;}

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

function showPromotionPicker(candidates, onPick){
  const host=document.getElementById('chessPromoHost');
  if(!host){
    onPick(candidates.find(m=>String(m.promo||'').toLowerCase()==='q')||candidates[0]);
    return;
  }
  const order=['q','r','b','n'];
  const byType={};
  candidates.forEach(m=>{
    const k=String(m.promo||'q').toLowerCase();
    byType[k]=m;
  });
  host.hidden=false;
  host.innerHTML=`
    <div class="chess-promo-sheet" role="dialog" aria-label="Choose promotion piece">
      <div class="chess-promo-title">Promote to</div>
      <div class="chess-promo-row">
        ${order.filter(k=>byType[k]).map(k=>{
          const glyph=PIECE_UNICODE[myChessColor==='w'?k.toUpperCase():k]||k.toUpperCase();
          return `<button type="button" class="chess-promo-btn game-tap-target" data-promo="${k}">${glyph}</button>`;
        }).join('')}
      </div>
    </div>`;
  host.querySelectorAll('[data-promo]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const m=byType[btn.dataset.promo];
      host.hidden=true;
      host.innerHTML='';
      if(m)onPick(m);
    });
  });
}

function handleClick(r,c){
  if(!gs.alive()||!fenReady||state.status!=='playing'||state.turn!==myChessColor||state.animating||aiThinking||liveEnded)return;
  const p=state.board[r][c];
  if(state.selected){
    const destMoves=state.legalMoves.filter(m=>m.from[0]===state.selected[0]&&m.from[1]===state.selected[1]&&m.to[0]===r&&m.to[1]===c);
    if(destMoves.length){
      const promoOnes=destMoves.filter(m=>m.promo);
      if(promoOnes.length){
        showPromotionPicker(promoOnes,makeMove);
        return;
      }
      makeMove(destMoves[0]);
      return;
    }
    if(p&&pieceColor(p)===myChessColor){state.selected=[r,c];syncFromChess();render();return;}
    if(typeof gameFeedback==='function')gameFeedback('invalid');
    state.selected=null;syncFromChess();render();return;
  }
  if(p&&pieceColor(p)===myChessColor){state.selected=[r,c];syncFromChess();render();}
  else if(p&&typeof gameFeedback==='function')gameFeedback('invalid');
}

function pushLiveState(extra){
  if(!liveOn||!liveHandle||liveEnded)return;
  const nextTurnUid=liveRoles?(state.turn==='w'?liveRoles.playerA:liveRoles.playerB):null;
  let winnerUid=null;
  if(state.status==='checkmate'&&liveRoles){
    winnerUid=state.turn==='w'?liveRoles.playerB:liveRoles.playerA;
  }else if(state.status==='timeout'&&liveRoles){
    winnerUid=state.turn==='w'?liveRoles.playerB:liveRoles.playerA;
  }
  const patch=Object.assign({
    fen:chess.fen(),
    turn:nextTurnUid,
    lastMove:state.lastMove,
    status:state.status==='playing'?'playing':state.status,
    winner:winnerUid,
    baseVersion:liveVersion,
    endDetail:state.endDetail||null,
    drawOffer:null,
  },extra||{});
  state.outgoingDrawOffer=false;
  state.incomingDrawOffer=false;
  if(HAS_TIMER){
    patch.clocks={w:clocks.w,b:clocks.b};
    patch.clockAt=Date.now();
    patch.clockTurn=state.turn;
  }
  const expectedFen=chess.fen();
  Promise.resolve(liveHandle.push(patch)).then((result)=>{
    if(result&&result.committed===false){
      console.warn('[chess] stale live push aborted — resync');
      const cur=result.snapshot&&result.snapshot.val?result.snapshot.val():null;
      if(cur&&cur.fen&&cur.fen!==expectedFen){
        applyingLive=true;
        try{
          chess.load(cur.fen);
          syncFromChess();
          if(cur.lastMove)state.lastMove=cur.lastMove;
          liveVersion=Number(cur.version||cur.seq)||liveVersion;
          if(HAS_TIMER)applyRemoteClocks(cur);
          render();
        }catch(e){}
        applyingLive=false;
      }
    }else if(result&&result.snapshot){
      const cur=result.snapshot.val?result.snapshot.val():null;
      if(cur)liveVersion=Number(cur.version||cur.seq)||liveVersion+1;
    }
  }).catch((e)=>console.warn('[chess] live push failed',e));
  if(state.status==='playing'&&typeof DangalLive!=='undefined'&&DangalLive.pingTurn&&liveRoles){
    DangalLive.pingTurn(liveRoles.opp,'chess',{chatId:chat&&(chat.firestoreId||chat.id)});
  }
}

function afterHumanMove(){
  if(liveOn){
    pushLiveState();
    if(state.status!=='playing'){
      stopClock();
      // Local end — wait for RTDB echo or apply immediately
      if(!liveEnded){
        const winnerUid=
          state.status==='checkmate'&&liveRoles
            ?(state.turn==='w'?liveRoles.playerB:liveRoles.playerA)
            :null;
        handleLiveEnd({
          status:state.status,
          winner:winnerUid,
          fen:chess.fen(),
          lastMove:state.lastMove,
          endDetail:state.endDetail,
        });
      }
      return;
    }
    return;
  }
  if(state.status!=='playing'){stopClock();return;}
  if(typeof gameFeedback==='function')gameFeedback('turn');
  aiThinking=true;
  render();
  gs.schedule(()=>{
    if(!gs.alive()||liveOn)return;
    const aiMoves=chess.moves({verbose:true});
    if(!aiMoves.length){aiThinking=false;syncFromChess();render();return;}
    const mapped=aiMoves.map(m=>({from:sqToRC(m.from),to:sqToRC(m.to),promo:m.promotion?(m.color==='w'?m.promotion.toUpperCase():m.promotion.toLowerCase()):null}));
    const aiMove=pickAIMove(mapped);
    aiThinking=false;
    if(!aiMove){render();return;}
    const aiPiece=state.board[aiMove.from[0]][aiMove.from[1]];
    state.animating=true;
    animatePieceSlide(aiMove.from,aiMove.to,aiPiece,()=>{
      if(!gs.alive()||liveOn)return;
      const promo=(aiMove.promo||'q').toLowerCase();
      const aiResult=chess.move({from:rcToSq(aiMove.from[0],aiMove.from[1]),to:rcToSq(aiMove.to[0],aiMove.to[1]),promotion:promo});
      if(!aiResult){
        state.animating=false;
        render();
        return;
      }
      if(HAS_TIMER&&tc.inc>0)clocks[aiResult.color]+=tc.inc;
      state.history.push(aiMove);state.lastMove={from:aiMove.from,to:aiMove.to};
      syncFromChess();
      state.animating=false;
      if(typeof gameFeedback==='function')gameFeedback(state.check?'check':(aiResult.captured?'capture':'place'));
      render();
      if(HAS_TIMER){
        if(state.status==='playing')startClock(state.turn);
        else stopClock();
      }
    });
  },AI_DEPTH===1?420:650);
}

function makeMove(move){
  const from=rcToSq(move.from[0],move.from[1]);
  const to=rcToSq(move.to[0],move.to[1]);
  const movingPiece=state.board[move.from[0]][move.from[1]];
  const wasCapture=!!state.board[move.to[0]][move.to[1]]||(movingPiece&&movingPiece.toLowerCase()==='p'&&move.from[1]!==move.to[1]);
  state.animating=true;
  animatePieceSlide(move.from,move.to,movingPiece,()=>{
    if(!gs.alive())return;
    const promo=(move.promo||'q').toLowerCase();
    const result=chess.move({from,to,promotion:promo});
    if(!result){
      state.animating=false;
      if(typeof gameFeedback==='function')gameFeedback('invalid');
      render();
      return;
    }
    if(typeof gameFeedback==='function')gameFeedback(wasCapture?'capture':'move');
    if(typeof DSL!=='undefined'&&DSL.onMove)DSL.onMove('chess');
    state.history.push(move);state.selected=null;state.lastMove={from:move.from,to:move.to};
    if(HAS_TIMER&&tc.inc>0)clocks[result.color]+=tc.inc;
    syncFromChess();
    state.animating=false;
    if(state.check && typeof gameFeedback==='function') gameFeedback('check');
    if(HAS_TIMER&&state.status==='playing')startClock(state.turn);
    render();
    afterHumanMove();
  });
}

render();
if(HAS_TIMER&&fenReady)startClock(chess.turn());
// Practice as Black: AI (White) moves first — never when Live
if(!liveOn&&myChessColor==='b'&&state.status==='playing'&&state.turn==='w'){
  afterHumanMove();
}
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
  const liveOn=typeof DangalLive!=='undefined'&&DangalLive.isLive(chat);
  const liveRoles=liveOn&&DangalLive.roles?DangalLive.roles(chat):null;
  let liveHandle=null;let applyingLive=false;let leaveConfirmed=false;
  let pos={me:0,opp:0};let myTurn=!liveRoles||liveRoles.myColor==='w';let rolling=false;let gameOver=false;
  let diceVals=[null,null];let message='';let doubleRoll=false;
  let diceIv=null;let hopping=false;
  const MODE_SUB=liveOn
    ?(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel?DangalLive.modeChromeLabel(true):'Live 1v1')
    :(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel
      ?DangalLive.modeChromeLabel(false,version.name||'vs AI')
      :('Practice · '+(version.name||'vs AI')));

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
    type:'snakes',title:'Snakes & Ladders',mode:liveOn?'live':'practice',chat,overlay,
    cleanup(){
      if(diceIv){clearInterval(diceIv);diceIv=null;}
      if(liveHandle&&!leaveConfirmed){
        try{liveHandle.leave({forfeit:!gameOver});}catch(e){try{liveHandle.leave();}catch(e2){}}
      }
    },
  });
  if(!gs.alive())return;

  async function askSnakesLeave(){
    if(gameOver){gs.close();return;}
    if(typeof DangalLive!=='undefined'&&DangalLive.requestLeave){
      const ok=await DangalLive.requestLeave({
        liveHandle,isPlaying:!gameOver,title:'Leave Snakes & Ladders?',body:'This run will end.',
        onLeave:()=>{leaveConfirmed=true;liveHandle=null;},
      });
      if(!ok)return;
    }else if(typeof confirmLeaveGame==='function'){
      const ok=await confirmLeaveGame({title:'Leave Snakes & Ladders?',body:'This run will end.'});
      if(!ok)return;
    }
    gs.close();
  }

  function diceEmoji(v){return v?['⚀','⚁','⚂','⚃','⚄','⚅'][v-1]:'🎲';}

  function pushSnakes(){
    if(!liveOn||!liveHandle||!liveRoles||applyingLive)return;
    const posA=liveRoles.myColor==='w'?pos.me:pos.opp;
    const posB=liveRoles.myColor==='w'?pos.opp:pos.me;
    const winnerUid=gameOver?(pos.me>=SQUARES?liveRoles.me:liveRoles.opp):null;
    liveHandle.push({
      state:{
        posA,posB,
        snakes:Object.assign({},SNAKES),
        ladders:Object.assign({},LADDERS),
        diceVals:diceVals.slice(),
        message,doubleRoll,gameOver,
      },
      turn:gameOver?null:(myTurn?liveRoles.me:liveRoles.opp),
      status:gameOver?'over':'playing',
      winner:winnerUid,
    });
    if(!gameOver&&typeof DangalLive!=='undefined'&&DangalLive.pingTurn){
      DangalLive.pingTurn(liveRoles.opp,'snakes',{chatId:chat&&(chat.firestoreId||chat.id)});
    }
  }

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
    if(typeof gameFeedback==='function')gameFeedback('dice');
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
      gameOver=true;message=who==='me'?'You win!':chat.name+' wins!';
      gs.setOutcome(who==='me'?'won':'lost');
      if(typeof recordGameResult==='function')recordGameResult('snakes',who==='me');
      if(typeof recordDuelStreak==='function') recordDuelStreak(chat.id||chat.name, who==='me', false);
      if(typeof gameFeedback==='function') gameFeedback(who==='me'?'win':'lose');
      updateHud();
      if(liveOn&&who==='me'&&!applyingLive)pushSnakes();
      showSnakesResult(who==='me');
      return;
    }
    endTurn(who);
  }

  function showSnakesResult(won){
    const host=overlay.querySelector('#slResultHost')||(()=>{
      const d=document.createElement('div');d.id='slResultHost';d.style.cssText='padding:8px 12px 16px;flex-shrink:0;';overlay.appendChild(d);return d;
    })();
    const duel=typeof getDuelStreak==='function'?getDuelStreak(chat.id||chat.name):null;
    const shareStats={scoreLine:won?'Win':'Loss',meta:version.name+(duel&&duel.streak?` · streak ${duel.streak}`:''),vs:`You vs ${chat.name}`};
    host.innerHTML=typeof gameResultHtml==='function'?gameResultHtml({
      gameId:'snakes',
      glyph:won?'✓':'·',
      title:won?'You win':'Defeat',
      subtitle:version.name+(duel&&duel.streak>1?` · Duel streak ${duel.streak}`:''),
      shareCardHtml: typeof buildGameShareCard==='function'?buildGameShareCard('snakes',shareStats):'',
      actions:[
        {label:'Rematch',primary:true,id:'again'},
        {label:'Share',primary:false,id:'share'},
        {label:'Challenge friend',primary:false,id:'challenge'},
        {label:'Post to story',primary:false,id:'story'},
      ],
    }):`<button type="button" id="slRematch">Rematch</button>`;
    if(typeof wireGameResultActions==='function'){
      wireGameResultActions(host,{
        again:()=>{gs.close('restart');openSnakesVersion(chat, version);},
        share:()=>{if(typeof shareGameResult==='function')shareGameResult('snakes',shareStats);},
        challenge:async()=>{
          if(typeof openFriendPickerSheet==='function'){
            const f=await openFriendPickerSheet({title:'Challenge · Snakes'});
            if(f){gs.close();openSnakesVersion({name:f.name,id:f.id||f.uid}, version);}
          }
        },
        story:()=>{if(typeof postGameScoreStory==='function')postGameScoreStory('snakes',shareStats);},
      });
    } else {
      host.querySelector('#slRematch')?.addEventListener('click',()=>{gs.close('restart');openSnakesVersion(chat, version);});
    }
  }

  function endTurn(who){
    if(!gs.alive()||gameOver)return;
    if(who==='me'&&doubleRoll){doubleRoll=false;updateHud();if(liveOn&&!applyingLive)pushSnakes();return;}
    if(who==='me'){
      myTurn=false;updateHud();
      if(liveOn){if(!applyingLive)pushSnakes();return;}
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
      ${gameChromeHtml({title:version.name,subtitle:MODE_SUB+(version.desc?' · '+version.desc:''),backId:'slBack'})}
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
    document.getElementById('slBack').addEventListener('click',()=>{askSnakesLeave();});
    document.getElementById('rollBtn').addEventListener('click',rollDice);
    placeTokens();
  }
  if(liveOn&&liveRoles&&typeof DangalLive!=='undefined'){
    liveHandle=DangalLive.join({
      gameType:'snakes',
      matchId:(chat&&chat.dangalMatchId)||(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.matchId),
      me:liveRoles.me,playerA:liveRoles.playerA,playerB:liveRoles.playerB,
      state:{posA:0,posB:0,snakes:Object.assign({},SNAKES),ladders:Object.assign({},LADDERS),diceVals:[null,null],message:'',doubleRoll:false,gameOver:false},
      onSnap(val){
        if(!val||applyingLive||!gs.alive())return;
        if(val.status==='forfeit'&&!gameOver){
          gameOver=true;
          const iWon=val.winner===liveRoles.me;
          gs.setOutcome(iWon?'won':'lost');
          if(typeof recordGameResult==='function')recordGameResult('snakes',iWon);
          message=iWon?'Opponent left — you win!':(chat.name+' wins by forfeit');
          updateHud();showSnakesResult(iWon);return;
        }
        const s=val.state;if(!s)return;
        const nextMe=liveRoles.myColor==='w'?s.posA:s.posB;
        const nextOpp=liveRoles.myColor==='w'?s.posB:s.posA;
        if(nextMe===pos.me&&nextOpp===pos.opp&&!!s.gameOver===gameOver&&(val.turn===liveRoles.me)===myTurn&&val.status!=='over')return;
        applyingLive=true;
        Object.keys(SNAKES).forEach(k=>delete SNAKES[k]);Object.assign(SNAKES,s.snakes||{});
        Object.keys(LADDERS).forEach(k=>delete LADDERS[k]);Object.assign(LADDERS,s.ladders||{});
        pos.me=Number(nextMe)||0;pos.opp=Number(nextOpp)||0;
        if(Array.isArray(s.diceVals))diceVals=s.diceVals.slice();
        message=s.message||'';doubleRoll=!!s.doubleRoll;
        gameOver=!!s.gameOver||val.status==='over';
        myTurn=!gameOver&&val.turn===liveRoles.me;
        rebuildBoardArt();placeTokens();updateHud();
        if(gameOver&&!overlay.querySelector('#slResultHost'))showSnakesResult(pos.me>=SQUARES);
        applyingLive=false;
      },
    });
  }
  render();
}

// ===================== LUDO ENGINE =====================
/** Practice / Live pre-game: Classic vs Quick + player count. Live locks 2p; mode still selectable. */
function openLudoPracticeSheet(chat, sheetOpts){
  sheetOpts=sheetOpts&&typeof sheetOpts==='object'?sheetOpts:{};
  chat=chat||{name:'AI',id:'ai'};
  const launchCtx=window.__dangalLaunchCtx||{};
  const liveHint=!!(
    sheetOpts.liveOnly||
    sheetOpts.mode==='live'||
    launchCtx.mode==='live'||
    (typeof DangalLive!=='undefined'&&DangalLive.isLive&&DangalLive.isLive(chat,Object.assign({},launchCtx,sheetOpts)))
  );
  const fixedN=liveHint?2:(sheetOpts.playerCount!=null?Math.min(Math.max(Number(sheetOpts.playerCount)||2,2),4):null);
  const source=sheetOpts.source||launchCtx.source||'dangal';
  let pickMode=(sheetOpts.ludoMode||sheetOpts.mode||launchCtx.ludoMode)==='quick'?'quick':'classic';
  if(pickMode!=='quick')pickMode='classic';
  let pickN=fixedN||2;
  const host=document.querySelector('.device')||document.body;
  const scrim=document.createElement('div');
  scrim.className='cp-sheet-scrim';
  scrim.style.zIndex='99';
  const s=document.createElement('div');
  s.className='ludo-entry-sheet';
  s.setAttribute('role','dialog');
  s.setAttribute('aria-label','Ludo setup');
  function paint(){
    const playersLocked=fixedN!=null||liveHint;
    s.innerHTML=`
      <div class="ludo-entry-title">Ludo</div>
      <div class="ludo-entry-sub">${liveHint?'Live 1v1 — pick Classic or Quick · 2 players':'Practice vs AI — pick mode, then seats'}</div>
      <div class="ludo-entry-label">Mode</div>
      <div class="ludo-mode-cards" role="group" aria-label="Game mode">
        <button type="button" class="ludo-mode-card${pickMode==='classic'?' is-selected':''}" data-mode="classic">
          <div class="ludo-mode-card-name">Classic</div>
          <div class="ludo-mode-card-blurb">All 4 tokens home · full race</div>
        </button>
        <button type="button" class="ludo-mode-card${pickMode==='quick'?' is-selected':''}" data-mode="quick">
          <div class="ludo-mode-card-name">Quick</div>
          <div class="ludo-mode-card-blurb">First token home wins · shorter race</div>
        </button>
      </div>
      <div class="ludo-entry-label">Players</div>
      <div class="ludo-player-chips" role="group" aria-label="Player count">
        ${[2,3,4].map(n=>{
          const disabled=liveHint||(playersLocked&&n!==pickN);
          const sel=n===pickN;
          return `<button type="button" class="ludo-player-chip${sel?' is-selected':''}" data-n="${n}" ${disabled?'disabled':''}>${n}p</button>`;
        }).join('')}
      </div>
      ${liveHint?'<div class="ludo-entry-note">Live · 2 players (3–4 party sync later)</div>':''}
      <button type="button" id="ludoEntryStart" class="ludo-entry-start game-tap-target">Start</button>
      <button type="button" id="ludoEntryCancel" class="ludo-entry-cancel">Back</button>
    `;
    s.querySelectorAll('[data-mode]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        pickMode=btn.dataset.mode==='quick'?'quick':'classic';
        paint();
      });
    });
    s.querySelectorAll('[data-n]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(btn.disabled)return;
        pickN=parseInt(btn.dataset.n,10)||2;
        paint();
      });
    });
    s.querySelector('#ludoEntryStart').addEventListener('click',async()=>{
      try{
        const mode=pickMode==='quick'?'quick':'classic';
        const n=liveHint?2:pickN;
        const oppUid=
          sheetOpts.opponentUid||
          launchCtx.opponentUid||
          (typeof opponentUidFromChat==='function'?opponentUidFromChat(chat):'')||
          (chat&&(chat.uid||chat.peerUid||chat.id))||
          '';
        let mid=String(
          sheetOpts.matchId||
          (chat&&chat.dangalMatchId)||
          launchCtx.matchId||
          ''
        ).trim();
        const chatId=
          sheetOpts.chatId||
          launchCtx.chatId||
          (chat&&(chat.firestoreId||chat.id))||
          (window.currentOpenChat&&(window.currentOpenChat.firestoreId||window.currentOpenChat.id))||
          '';
        const stakeFromOpts=sheetOpts.stake;
        let stake=Number(stakeFromOpts??launchCtx.stake);
        if(!Number.isFinite(stake))stake=0;
        if(liveHint){
          const persistable=typeof isPersistableUid==='function'&&isPersistableUid(oppUid);
          if(!persistable){
            if(typeof showToast==='function')showToast('Challenge link broken — try Practice from Manch');
            close();
            openLudoGame({name:'AI',id:'ai'},n,{mode});
            return;
          }
          if(!mid&&typeof dangalMatchId==='function'){
            mid=dangalMatchId('ludo',{name:chat.name,opponentUid:oppUid});
          }
          if(!mid){
            if(typeof showToast==='function')showToast('Could not start Live match');
            return;
          }
          // Host picks stake when not already chosen (Manch/friend sheet may pass stake)
          if(
            source!=='challenge'&&
            stakeFromOpts==null&&
            typeof stakesEnabledForGame==='function'&&
            stakesEnabledForGame('ludo')&&
            typeof openDangalStakeSheet==='function'
          ){
            const picked=await openDangalStakeSheet('ludo',{defaultStake:stake});
            if(picked==null)return;
            stake=picked;
          }
          if(stake>0&&window.DangalEconomy&&typeof DangalEconomy.canAffordStake==='function'){
            try{
              const ok=await DangalEconomy.canAffordStake(stake);
              if(!ok){
                if(typeof showToast==='function')showToast('Not enough virtual chips — starting Friendly (0)');
                stake=0;
              }
            }catch(e){
              if(typeof showToast==='function')showToast('Couldn’t check chips — starting Friendly (0)');
              stake=0;
            }
          }
          if(chat)chat.dangalMatchId=mid;
          window.__dangalLaunchCtx=Object.assign({},launchCtx,{
            gameId:'ludo',
            gameType:'ludo',
            mode:'live',
            ludoMode:mode,
            playerCount:2,
            matchId:mid,
            opponentUid:oppUid,
            stake,
            chatId,
            source:source==='challenge'?'challenge':(source||'challenge_host'),
            startedAt:Date.now(),
          });
          if(typeof sendChallengeCard==='function'&&chatId&&source!=='challenge'){
            try{
              await sendChallengeCard(oppUid,'ludo',{chatId,matchId:mid,stake,ludoMode:mode,mode});
            }catch(e){}
          }
          close();
          openLudoGame(
            Object.assign({},chat,{
              id:oppUid,
              uid:oppUid,
              peerUid:oppUid,
              dangalMatchId:mid,
              dangalSource:window.__dangalLaunchCtx.source,
            }),
            2,
            {mode,ludoMode:mode}
          );
          return;
        }
        window.__dangalLaunchCtx=Object.assign({},window.__dangalLaunchCtx||{},{
          gameId:'ludo',
          gameType:'ludo',
          mode:'practice',
          ludoMode:mode,
          playerCount:n,
          matchId:'',
          opponentUid:'ai',
          stake:0,
          chatId:'',
          source,
          startedAt:Date.now(),
        });
        close();
        if(typeof openLudoGame==='function')openLudoGame(chat,n,{mode});
      }catch(err){
        console.error('[ludo] entry start failed',err);
        try{if(typeof showToast==='function')showToast('Could not start Ludo');}catch(e2){}
      }
    });
    s.querySelector('#ludoEntryCancel').addEventListener('click',close);
  }
  function close(){
    try{scrim.remove();}catch(e){}
    try{s.remove();}catch(e2){}
  }
  scrim.addEventListener('click',close);
  try{
    host.appendChild(scrim);
    host.appendChild(s);
    paint();
  }catch(err){
    console.error('[ludo] entry sheet failed',err);
    try{if(typeof showToast==='function')showToast('Could not open Ludo');}catch(e2){}
  }
}

function openLudoGame(chat, playerCount, opts){
  opts=opts&&typeof opts==='object'?opts:{};
  playerCount = Math.min(Math.max(playerCount||2,2),4);
  const launchCtx=window.__dangalLaunchCtx||{};
  const wantLive=launchCtx.mode==='live'||opts.live===true||(chat&&chat.dangalMatchId&&launchCtx.mode!=='practice');
  let liveOn=typeof DangalLive!=='undefined'&&DangalLive.isLive(chat,launchCtx);
  if(wantLive&&!liveOn){
    try{if(typeof showToast==='function')showToast('Challenge link broken — opening Practice');}catch(e){}
  }
  if(liveOn)playerCount=2;
  let sessionMode=String(
    opts.mode||opts.ludoMode||launchCtx.ludoMode||'classic'
  ).toLowerCase();
  if(sessionMode!=='quick')sessionMode='classic';
  let tokensToWin=sessionMode==='quick'?1:4;
  let modeLabel=sessionMode==='quick'?'Quick':'Classic';
  const sessionOpts={mode:sessionMode};
  let liveStake=liveOn?Math.max(0,Number(opts.stake??launchCtx.stake)||0):0;
  if(!liveOn)liveStake=0;
  const settleMatchId=String((chat&&chat.dangalMatchId)||launchCtx.matchId||'').trim();
  try{
    window.__dangalLaunchCtx=Object.assign({},launchCtx,{
      ludoMode:sessionMode,
      playerCount,
      stake:liveOn?liveStake:0,
    });
    if(liveOn)window.__dangalLaunchCtx.mode='live';
  }catch(e){}
  const liveRoles=liveOn&&DangalLive.roles?DangalLive.roles(chat,window.__dangalLaunchCtx):null;
  const settleOppUid=
    (liveRoles&&liveRoles.opp)||
    launchCtx.opponentUid||
    (typeof opponentUidFromChat==='function'?opponentUidFromChat(chat):'')||
    '';
  let liveHandle=null;let applyingLive=false;let leaveConfirmed=false;
  let lastAppliedSeq=-1;
  let resultsShown=false;
  let sessionRecorded=false;
  let settleDone=false;
  const mySeat=!liveRoles||liveRoles.myColor==='w'?0:1;
  // Seat 0 = host = playerA = red; seat 1 = guest = playerB = blue
  const stakeBit=liveOn&&liveStake>0?` · Stake ⚡${liveStake}`:'';
  const MODE_SUB=liveOn
    ?('Live 1v1 · '+modeLabel+stakeBit)
    :('Practice · '+modeLabel+' · '+playerCount+'p');
  const COLORS=['red','blue','green','yellow'];
  const COLOR_STYLES={red:'#E74C3C',blue:'#3498DB',green:'#2ECC71',yellow:'#F1C40F'};
  const NAMES=liveOn
    ?(mySeat===0?['You',chat.name||'Friend']:[chat.name||'Friend','You'])
    :[
        'You',
        (chat&&chat.name&&!/^(ai|practice)$/i.test(String(chat.id||'')))?String(chat.name):'AI',
        'AI 2',
        'AI 3',
      ].slice(0,playerCount);

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
  // Stacking policy A: 2+ same-color tokens on one path square form a block — opponents cannot land/capture there.
  const STACK_BLOCK=true;
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
  let consecutiveSixes=0;
  const coachKey=sessionMode==='quick'?'chaupaal_ludo_coach_quick_v1':'chaupaal_ludo_coach_v1';
  let coachDismissed=false;
  try{coachDismissed=localStorage.getItem(coachKey)==='1';}catch(e){}

  COLORS.slice(0,playerCount).forEach(color=>{
    pieces[color]=[{pos:-1,progress:0,finished:false},{pos:-1,progress:0,finished:false},{pos:-1,progress:0,finished:false},{pos:-1,progress:0,finished:false}];
  });
  const players=COLORS.slice(0,playerCount);

  function finishedCount(color){
    return pieces[color]?pieces[color].filter(p=>p.finished).length:0;
  }
  function colorHasWon(color){
    return finishedCount(color)>=tokensToWin;
  }
  function homeCountLabel(color){
    return `${finishedCount(color)}/${tokensToWin} 🏠`;
  }

  function applySessionMode(m){
    const next=String(m||'').toLowerCase()==='quick'?'quick':'classic';
    if(next===sessionMode)return;
    sessionMode=next;
    tokensToWin=sessionMode==='quick'?1:4;
    modeLabel=sessionMode==='quick'?'Quick':'Classic';
    sessionOpts.mode=sessionMode;
    try{window.__dangalLaunchCtx=Object.assign({},window.__dangalLaunchCtx||{},{ludoMode:sessionMode});}catch(e){}
    try{
      const sub=overlay&&overlay.querySelector('.game-chrome-subtitle');
      if(sub)sub.textContent=liveOn?('Live 1v1 · '+modeLabel+(liveStake>0?` · Stake ⚡${liveStake}`:'')):('Practice · '+modeLabel+' · '+playerCount+'p');
      const chip=overlay&&overlay.querySelector('.ludo-mode-chip');
      if(chip){
        chip.className='ludo-mode-chip'+(sessionMode==='classic'?' ludo-mode-chip--classic':'');
        chip.textContent=sessionMode==='quick'?'Quick · first home wins':'Classic · 4 home';
      }
    }catch(e){}
  }

  function noteLudoSession(won){
    if(sessionRecorded)return;
    sessionRecorded=true;
    if(typeof recordGameResult==='function')recordGameResult('ludo',!!won);
    if(typeof recordDuelStreak==='function'&&liveOn)recordDuelStreak(chat.id||chat.name,!!won,false);
    if(typeof recordDangalSession==='function'){
      recordDangalSession('ludo',{won:!!won,drew:false,score:won?1:0,playerCount,mode:sessionMode,stake:liveStake,live:!!liveOn});
    }
  }

  function paintLudoSettle(settle){
    const el=overlay.querySelector('#ludoChipDelta');
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

  async function settleLudoOnce(won){
    if(!liveOn||settleDone||!window.DangalEconomy||typeof DangalEconomy.reportGameEnd!=='function'||!settleMatchId)return null;
    settleDone=true;
    try{
      const me=typeof getCurrentUid==='function'?getCurrentUid():'';
      const settle=await DangalEconomy.reportGameEnd({
        gameType:'ludo',
        result:won?'win':'loss',
        won:!!won,
        isDraw:false,
        matchId:settleMatchId,
        sessionId:settleMatchId,
        opponentUid:settleOppUid,
        stake:liveStake,
        winnerUid:won?me:settleOppUid,
        mode:sessionMode,
      });
      if(settle&&settle.error){
        settleDone=false;
        const el=overlay.querySelector('#ludoChipDelta');
        if(el){
          el.hidden=false;
          el.innerHTML=`Couldn’t update chips <button type="button" id="ludoChipRetry" class="game-tap-target" style="margin-left:8px;">Retry</button>`;
          el.querySelector('#ludoChipRetry')?.addEventListener('click',()=>{settleLudoOnce(won);});
        }
        return settle;
      }
      paintLudoSettle(settle);
      return settle;
    }catch(e){
      settleDone=false;
      return null;
    }
  }

  function winnerUidForSeat(seat){
    if(!liveRoles)return null;
    return seat===0?liveRoles.playerA:liveRoles.playerB;
  }

  function buildLudoSnapshot(){
    return{
      pieces:serializeLudoPieces(),
      currentPlayer,
      diceVal,
      phase:phase==='anim'?'move':phase,
      message,
      gameOver,
      winnerSeat:gameOver?currentPlayer:null,
      consecutiveSixes,
      ludoMode:sessionMode,
      playerCount,
      moveable:[...moveableSet],
    };
  }

  function pieceCell(color,p){
    if(p.finished)return[7,7];
    if(p.pos===-1){
      const yi=pieces[color].indexOf(p);
      return YARD_CELLS[color][yi]||YARD_CELLS[color][0];
    }
    if(p.progress>51){
      const hi=p.progress-52;
      return HOME_CELLS[color][Math.min(hi,4)]||[7,7];
    }
    return LUDO_PATH[p.pos]||[7,7];
  }

  /** Dest after applying diceVal, or null if illegal. */
  function moveDest(color,pi){
    const p=pieces[color][pi];
    if(!p||p.finished||diceVal==null)return null;
    if(p.pos===-1){
      if(diceVal!==6)return null;
      return{progress:1,pos:START_POS[color],finished:false};
    }
    const next=p.progress+diceVal;
    if(next>57)return null;
    if(next===57)return{progress:57,pos:-1,finished:true};
    if(next>51)return{progress:next,pos:START_POS[color],finished:false};
    return{progress:next,pos:(START_POS[color]+next-1)%52,finished:false};
  }

  function tokensOnPathPos(pos,excludeColor){
    const byColor={};
    players.forEach(c=>{
      if(excludeColor&&c===excludeColor)return;
      pieces[c].forEach((p,pi)=>{
        if(p.finished||p.pos===-1||p.progress>51)return;
        if(p.pos!==pos)return;
        if(!byColor[c])byColor[c]=[];
        byColor[c].push(pi);
      });
    });
    return byColor;
  }

  function isBlockedFor(color,pos){
    if(!STACK_BLOCK||pos==null||pos<0||SAFE_SQUARES.includes(pos))return false;
    const by=tokensOnPathPos(pos,color);
    return Object.keys(by).some(c=>by[c].length>=2);
  }

  function isMoveable(color,pi){
    const dest=moveDest(color,pi);
    if(!dest)return false;
    if(dest.finished||dest.progress>51)return true;
    if(SAFE_SQUARES.includes(dest.pos))return true;
    if(isBlockedFor(color,dest.pos))return false;
    return true;
  }

  function refreshMoveable(){
    moveableSet.clear();
    const color=players[currentPlayer];
    pieces[color].forEach((_,pi)=>{if(isMoveable(color,pi))moveableSet.add(color+':'+pi);});
  }

  const overlay=document.createElement('div');
  overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;';
  const gs=beginGameOverlaySession({
    type:'ludo',title:'Ludo',mode:liveOn?'live':(playerCount>2?'group':'practice'),chat,overlay,
    cleanup(){
      if(diceIv){clearInterval(diceIv);diceIv=null;}
      if(liveHandle&&!leaveConfirmed){
        try{liveHandle.leave({forfeit:!gameOver});}catch(e){try{liveHandle.leave();}catch(e2){}}
      }
    },
  });
  if(!gs.alive())return;

  async function askLudoLeave(){
    if(gameOver){gs.close();return;}
    if(typeof DangalLive!=='undefined'&&DangalLive.requestLeave){
      const ok=await DangalLive.requestLeave({
        liveHandle,isPlaying:!gameOver,title:'Leave Ludo?',body:'This run will end.',
        onLeave:()=>{leaveConfirmed=true;liveHandle=null;},
      });
      if(!ok)return;
    }else if(typeof confirmLeaveGame==='function'){
      const ok=await confirmLeaveGame({title:'Leave Ludo?',body:'This run will end.'});
      if(!ok)return;
    }
    gs.close();
  }

  function isMyControl(){return currentPlayer===(liveOn?mySeat:0);}

  function serializeLudoPieces(){
    const out={};
    players.forEach(c=>{
      out[c]=pieces[c].map(p=>({pos:p.pos,progress:p.progress,finished:!!p.finished}));
    });
    return out;
  }

  function applyLudoPieces(raw){
    if(!raw)return;
    players.forEach(c=>{
      if(!raw[c])return;
      raw[c].forEach((rp,i)=>{
        if(!pieces[c][i])return;
        pieces[c][i].pos=rp.pos;pieces[c][i].progress=rp.progress;pieces[c][i].finished=!!rp.finished;
      });
    });
  }

  function pushLudo(){
    if(!liveOn||!liveHandle||!liveRoles||applyingLive)return;
    const snap=buildLudoSnapshot();
    const winSeat=gameOver?(snap.winnerSeat!=null?snap.winnerSeat:currentPlayer):null;
    const patch={
      state:snap,
      ludoMode:sessionMode,
      turn:gameOver?null:(currentPlayer===0?liveRoles.playerA:liveRoles.playerB),
      status:gameOver?'over':'playing',
      winner:gameOver?winnerUidForSeat(winSeat):null,
      baseVersion:lastAppliedSeq>=0?lastAppliedSeq:undefined,
    };
    if(patch.baseVersion==null)delete patch.baseVersion;
    try{
      const p=liveHandle.push(patch);
      if(p&&typeof p.then==='function'){
        p.then((res)=>{
          try{
            const committed=res&&res.snapshot&&res.snapshot.val&&res.snapshot.val();
            if(committed&&committed.version!=null)lastAppliedSeq=Number(committed.version)||lastAppliedSeq;
          }catch(e){}
        }).catch(()=>{});
      }
    }catch(e){console.warn('[ludo] push failed',e);}
    if(!gameOver&&typeof DangalLive!=='undefined'&&DangalLive.pingTurn&&currentPlayer!==mySeat){
      DangalLive.pingTurn(liveRoles.opp,'ludo',{chatId:chat&&(chat.firestoreId||chat.id)});
    }
  }

  function applyLiveSnapshot(val){
    if(!val||!gs.alive())return;
    const ver=Number(val.version||val.seq)||0;
    if(ver<lastAppliedSeq)return;
    lastAppliedSeq=ver;
    const remoteMode=val.ludoMode||(val.state&&val.state.ludoMode);
    if(remoteMode)applySessionMode(remoteMode);

    if(gameOver&&resultsShown&&val.status==='playing')return;

    if((val.status==='forfeit'||val.status==='over'||val.status==='timeout')&&!gameOver){
      gameOver=true;
      const iWon=val.winner===liveRoles.me;
      if(val.state&&val.state.pieces)applyLudoPieces(val.state.pieces);
      if(val.state&&val.state.currentPlayer!=null)currentPlayer=Number(val.state.currentPlayer)||currentPlayer;
      if(val.stake!=null)liveStake=Math.max(0,Number(val.stake)||0);
      message=val.status==='forfeit'
        ?(iWon?'Opponent left — you win!':'Forfeit')
        :(val.state&&val.state.message)||(iWon?'You win!':'Defeat');
      gs.setOutcome(iWon?'won':'lost');
      noteLudoSession(iWon);
      if(typeof gameFeedback==='function')gameFeedback(iWon?'win':'lose');
      updateHud();placeTokens();
      if(!resultsShown){resultsShown=true;showLudoResult(iWon);}
      return;
    }

    const s=val.state;
    if(!s||!s.pieces)return;
    if(val.stake!=null&&Number(val.stake)>0)liveStake=Math.max(liveStake,Number(val.stake)||0);
    applyingLive=true;
    try{
      if(animating||rolling){
        if(diceIv){clearInterval(diceIv);diceIv=null;}
        rolling=false;animating=false;
      }
      applyLudoPieces(s.pieces);
      currentPlayer=Number(s.currentPlayer)||0;
      diceVal=s.diceVal==null?null:s.diceVal;
      phase=s.phase==='anim'?'move':(s.phase||'roll');
      message=s.message||'';
      if(s.consecutiveSixes!=null)consecutiveSixes=Number(s.consecutiveSixes)||0;
      gameOver=!!s.gameOver||val.status==='over';
      if(s.moveable&&s.moveable.length)moveableSet=new Set(s.moveable);
      else{refreshMoveable();}
      placeTokens();updateHud();
      if(gameOver&&!resultsShown){
        resultsShown=true;
        const iWon=(s.winnerSeat!=null?Number(s.winnerSeat):currentPlayer)===mySeat||val.winner===liveRoles.me;
        gs.setOutcome(iWon?'won':'lost');
        noteLudoSession(iWon);
        showLudoResult(iWon);
      }
    }finally{
      applyingLive=false;
    }
  }

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
        tok.disabled=!(phase==='move'&&isMyControl()&&moveableSet.has(color+':'+pi));
        tok.setAttribute('aria-label',`${color} token ${pi+1}${p.finished?' home':p.pos===-1?' in yard':''}`);
      });
    });
  }

  function animateAlong(color,pi,fromProgress,toProgress,onDone){
    animating=true;
    const steps=[];
    if(fromProgress<0){
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
    const stepMs=Math.min(90,Math.max(36,Math.floor(260/Math.max(1,steps.length))));
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
      gs.schedule(step,stepMs);
    }
    if(!steps.length){animating=false;if(onDone)onDone();return;}
    step();
  }

  function finishHumanWinCheck(color){
    const humanWon=currentPlayer===mySeat||(!liveOn&&currentPlayer===0);
    if(!colorHasWon(color))return false;
    gameOver=true;message=`${NAMES[currentPlayer]} wins!`;
    gs.setOutcome(humanWon?'won':'lost');
    noteLudoSession(humanWon);
    if(typeof gameFeedback==='function')gameFeedback(humanWon?'win':'lose');
    phase='roll';updateHud();
    if(liveOn&&!applyingLive)pushLudo();
    if(!resultsShown){resultsShown=true;showLudoResult(humanWon);}
    return true;
  }

  function afterMoveResolved(rolledSix){
    if(gameOver||!gs.alive())return;
    phase='roll';
    moveableSet.clear();
    if(rolledSix){
      diceVal=null;
      message=`Extra turn — ${NAMES[currentPlayer]} rolls again`;
      updateHud();placeTokens();
      if(liveOn&&!applyingLive)pushLudo();
      if(!liveOn&&currentPlayer!==0)gs.schedule(aiMove,520);
      return;
    }
    nextPlayer();
  }

  function rollDice(){
    if(!gs.alive()||phase!=='roll'||rolling||gameOver||animating)return;
    if(liveOn&&currentPlayer!==mySeat)return;
    if(!liveOn&&currentPlayer!==0)return;
    if(typeof gameFeedback==='function')gameFeedback('dice');
    rolling=true;message='Rolling…';updateHud();
    let ticks=0;
    if(diceIv)clearInterval(diceIv);
    diceIv=setInterval(()=>{
      if(!gs.alive()){clearInterval(diceIv);diceIv=null;return;}
      diceVal=Math.floor(Math.random()*6)+1;updateHud();ticks++;
      if(ticks>10){
        clearInterval(diceIv);diceIv=null;rolling=false;
        if(diceVal===6){
          consecutiveSixes++;
          if(consecutiveSixes>=3){
            message='Triple six — turn over';
            consecutiveSixes=0;diceVal=null;phase='roll';moveableSet.clear();
            updateHud();placeTokens();
            if(liveOn&&!applyingLive)pushLudo();
            gs.schedule(nextPlayer,900);
            return;
          }
        }else consecutiveSixes=0;
        const color=players[currentPlayer];
        refreshMoveable();
        if(!moveableSet.size){
          message='No moves — turn passes';
          updateHud();
          if(liveOn&&!applyingLive)pushLudo();
          gs.schedule(nextPlayer,850);
          return;
        }
        phase='move';
        message=diceVal===6?'Rolled 6 — enter or move!':'Rolled '+diceVal+' — tap a glowing token';
        updateHud();placeTokens();
        if(liveOn&&!applyingLive)pushLudo();
        if(moveableSet.size===1){
          const only=[...moveableSet][0];
          const pi=parseInt(only.split(':')[1],10);
          gs.schedule(()=>{
            if(!gs.alive()||gameOver||phase!=='move'||moveableSet.size!==1)return;
            movePiece(color,pi);
          },420);
        }
      }
    },55);
  }

  function movePiece(color,pieceIdx){
    if(!gs.alive()||animating||gameOver||phase!=='move'||diceVal==null)return;
    if(liveOn&&currentPlayer!==mySeat)return;
    if(color!==players[currentPlayer])return;
    if(!isMoveable(color,pieceIdx)){
      message=pieces[color][pieceIdx]&&pieces[color][pieceIdx].pos===-1?'Need a 6 to enter':'Can\'t move that token';
      updateHud();
      if(typeof gameFeedback==='function')gameFeedback('invalid');
      return;
    }
    const p=pieces[color][pieceIdx];
    const dest=moveDest(color,pieceIdx);
    if(!dest)return;
    const fromProgress=p.pos===-1?-1:p.progress;
    const toProgress=dest.progress;
    const rolledSix=diceVal===6;
    phase='anim';
    animateAlong(color,pieceIdx,fromProgress,toProgress,()=>{
      let captured=false;
      if(!p.finished&&p.pos!==-1&&p.progress<=51&&!SAFE_SQUARES.includes(p.pos)&&!isBlockedFor(color,p.pos)){
        players.forEach(oc=>{
          if(oc===color)return;
          pieces[oc].forEach((op,opi)=>{
            if(!op.finished&&op.pos===p.pos&&op.progress>0&&op.progress<=51){
              op.pos=-1;op.progress=0;op.finished=false;captured=true;
              const tok=overlay.querySelector(`[data-id="${oc}-${opi}"]`);
              if(tok){tok.classList.add('ludo-token--captured');gs.schedule(()=>tok.classList.remove('ludo-token--captured'),400);}
            }
          });
        });
      }
      if(captured){
        message='Captured!';
        if(typeof gameFeedback==='function')gameFeedback('capture');
      }else if(p.finished){
        message=`${NAMES[currentPlayer]} piece home!`;
      }else if(fromProgress<0){
        message='Entered the board!';
      }
      placeTokens();
      if(finishHumanWinCheck(color))return;
      afterMoveResolved(rolledSix);
    });
  }

  function nextPlayer(){
    if(!gs.alive()||gameOver)return;
    consecutiveSixes=0;
    currentPlayer=(currentPlayer+1)%playerCount;
    phase='roll';diceVal=null;moveableSet.clear();
    message=`${NAMES[currentPlayer]}'s turn`;
    updateHud();placeTokens();
    if(liveOn){if(!applyingLive)pushLudo();return;}
    if(currentPlayer!==0)gs.schedule(aiMove,600);
  }

  function showLudoResult(won){
    resultsShown=true;
    noteLudoSession(won);
    const host=overlay.querySelector('#ludoResultHost')||(()=>{
      const d=document.createElement('div');d.id='ludoResultHost';d.style.cssText='padding:8px 12px 16px;flex-shrink:0;';overlay.appendChild(d);return d;
    })();
    const duel=typeof getDuelStreak==='function'?getDuelStreak(chat.id||chat.name):null;
    const vsLabel=liveOn?(chat.name||'Friend'):(playerCount===2?(NAMES[1]||'AI'):(playerCount+'p'));
    const stakeLine=liveOn?(liveStake>0?`⚡${liveStake} virtual`:'Friendly'):'';
    const shareStats={
      scoreLine:won?'Win':'Loss',
      meta:[modeLabel,playerCount+'p',stakeLine,duel&&duel.streak?`streak ${duel.streak}`:''].filter(Boolean).join(' · '),
      vs:`vs ${vsLabel}`,
      mode:sessionMode,
      modeLabel,
      playerCount,
      stake:liveStake,
      text:`Chaupaal Ludo · ${won?'Win':'Loss'} · ${modeLabel}${liveOn?(liveStake>0?` · Stake ⚡${liveStake} (virtual chips)`:' · Friendly Live'):` · ${playerCount}p`} · not real money`,
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
    host.innerHTML=(typeof gameResultHtml==='function'?gameResultHtml({
      gameId:'ludo',
      glyph:won?'✓':'·',
      title:won?'You win':(NAMES[currentPlayer]==='You'?'Defeat':`${NAMES[currentPlayer]} wins`),
      subtitle:(duel&&duel.streak>1?`Duel streak · ${duel.streak}`:`${liveOn?'Live · ':''}${modeLabel} · ${playerCount} players`)+stakeSub,
      shareCardHtml: typeof buildGameShareCard==='function'?buildGameShareCard('ludo',shareStats):'',
      actions,
    }):`<button type="button" id="ludoRematch">${liveOn?'Rematch':'Play again'}</button>`)+
      `<div id="ludoChipDelta" class="ludo-chip-delta" hidden style="margin-top:8px;font-size:12px;color:rgba(255,255,255,.75);text-align:center;"></div>`;

    settleLudoOnce(won);

    async function startLudoLiveRematch(nextStake){
      const oppUid=settleOppUid||(liveRoles&&liveRoles.opp)||'';
      if(!oppUid||(typeof isPersistableUid==='function'&&!isPersistableUid(oppUid))){
        if(typeof showToast==='function')showToast('Opponent left — challenge them again from friends');
        if(typeof openFriendPickerSheet==='function'){
          const f=await openFriendPickerSheet({title:'Challenge · Ludo'});
          if(f){
            gs.close();
            openLudoPracticeSheet({name:f.name,id:f.uid||f.id,uid:f.uid||f.id,peerUid:f.uid||f.id},{
              liveOnly:true,source:'challenge_host',opponentUid:f.uid||f.id,
              chatId:f.chatId||f.firestoreId||'',ludoMode:sessionMode,stake:nextStake,
            });
          }
        }
        return;
      }
      const rematchId=
        typeof dangalMatchId==='function'
          ?dangalMatchId('ludo',{name:chat.name||'Friend',opponentUid:oppUid})
          :'ludo_'+Date.now();
      leaveConfirmed=true;
      try{if(liveHandle){await liveHandle.leave({forfeit:false});}}catch(e){}
      liveHandle=null;
      try{
        window.__dangalLaunchCtx=Object.assign({},window.__dangalLaunchCtx||{},{
          gameId:'ludo',
          gameType:'ludo',
          matchId:rematchId,
          mode:'live',
          ludoMode:sessionMode,
          playerCount:2,
          opponentUid:oppUid,
          stake:nextStake,
          source:'challenge_host',
          chatId,
          startedAt:Date.now(),
        });
      }catch(e){}
      if(typeof sendChallengeCard==='function'&&oppUid&&chatId){
        try{
          await sendChallengeCard(oppUid,'ludo',{chatId,matchId:rematchId,stake:nextStake,ludoMode:sessionMode,mode:sessionMode});
          if(typeof showToast==='function')showToast('Rematch sent — they Accept to join');
        }catch(e){}
      }else if(typeof showToast==='function'){
        showToast('Rematch ready — ask your friend to join from Baithak');
      }
      gs.close();
      openLudoGame({
        name:chat.name||'Friend',
        id:oppUid,
        uid:oppUid,
        peerUid:oppUid,
        dangalMatchId:rematchId,
        dangalSource:'challenge_host',
      },2,{mode:sessionMode,ludoMode:sessionMode,stake:nextStake});
    }

    if(typeof wireGameResultActions==='function'){
      wireGameResultActions(host,{
        again:async()=>{
          if(liveOn){
            let nextStake=liveStake;
            if(typeof stakesEnabledForGame==='function'&&stakesEnabledForGame('ludo')&&typeof openDangalStakeSheet==='function'){
              const picked=await openDangalStakeSheet('ludo',{defaultStake:liveStake});
              if(picked==null)return;
              nextStake=picked;
            }
            await startLudoLiveRematch(nextStake);
            return;
          }
          gs.close('restart');openLudoGame(chat, playerCount, sessionOpts);
        },
        share:()=>{if(typeof shareGameResult==='function')shareGameResult('ludo',shareStats);},
        challenge:async()=>{
          if(typeof openFriendPickerSheet==='function'){
            const f=await openFriendPickerSheet({title:'Challenge · Ludo'});
            if(f){
              gs.close();
              const uid=f.uid||f.id||'';
              if(typeof isPersistableUid==='function'&&isPersistableUid(uid)&&typeof openLudoPracticeSheet==='function'){
                openLudoPracticeSheet({name:f.name,id:uid,uid,peerUid:uid},{
                  liveOnly:true,
                  source:'challenge_host',
                  opponentUid:uid,
                  chatId:f.chatId||f.firestoreId||'',
                  ludoMode:sessionMode,
                });
              }else{
                openLudoGame({name:f.name,id:uid}, playerCount, sessionOpts);
              }
            }
          }
        },
        story:()=>{if(typeof postGameScoreStory==='function')postGameScoreStory('ludo',shareStats);},
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
    } else {
      host.querySelector('#ludoRematch')?.addEventListener('click',async()=>{
        if(liveOn){
          let nextStake=liveStake;
          if(typeof openDangalStakeSheet==='function'){
            const picked=await openDangalStakeSheet('ludo',{defaultStake:liveStake});
            if(picked==null)return;
            nextStake=picked;
          }
          await startLudoLiveRematch(nextStake);
          return;
        }
        gs.close('restart');openLudoGame(chat, playerCount, sessionOpts);
      });
    }
  }

  function scoreAiMove(color,pi){
    const dest=moveDest(color,pi);
    if(!dest)return -1e9;
    const p=pieces[color][pi];
    let score=0;
    if(!dest.finished&&dest.progress<=51&&!SAFE_SQUARES.includes(dest.pos)&&!isBlockedFor(color,dest.pos)){
      players.forEach(c=>{
        if(c===color)return;
        pieces[c].forEach(op=>{
          if(!op.finished&&op.pos===dest.pos&&op.progress>0&&op.progress<=51)score+=100;
        });
      });
    }
    if(p.pos===-1&&diceVal===6)score+=80;
    if(dest.finished){
      score+=sessionMode==='quick'?220:90;
      // Would this finish win the game?
      if(finishedCount(color)+1>=tokensToWin)score+=80;
    }else if(dest.progress>51)score+=50+(sessionMode==='quick'?25:0);
    score+=dest.progress;
    if(dest.progress<=51&&SAFE_SQUARES.includes(dest.pos))score+=8;
    return score;
  }

  function aiMove(){
    if(!gs.alive()||gameOver||liveOn||currentPlayer===0||animating||rolling)return;
    try{
      if(phase==='roll'){
        rolling=true;message=`${NAMES[currentPlayer]} thinking…`;updateHud();
        gs.schedule(()=>{
          if(!gs.alive()||gameOver||currentPlayer===0)return;
          message=`${NAMES[currentPlayer]} rolling…`;updateHud();
          gs.schedule(()=>{
            if(!gs.alive()||gameOver||currentPlayer===0)return;
            rolling=false;
            diceVal=Math.floor(Math.random()*6)+1;
            if(typeof gameFeedback==='function')gameFeedback('dice');
            if(diceVal===6){
              consecutiveSixes++;
              if(consecutiveSixes>=3){
                message=`${NAMES[currentPlayer]} — triple six, turn over`;
                consecutiveSixes=0;diceVal=null;phase='roll';moveableSet.clear();
                updateHud();
                gs.schedule(nextPlayer,700);
                return;
              }
            }else consecutiveSixes=0;
            refreshMoveable();
            updateHud();
            if(!moveableSet.size){
              message=`${NAMES[currentPlayer]} — no moves`;
              updateHud();
              gs.schedule(nextPlayer,650);
              return;
            }
            phase='move';
            message=`${NAMES[currentPlayer]} rolled ${diceVal}`;
            updateHud();placeTokens();
            gs.schedule(()=>{if(gs.alive()&&!gameOver)aiMove();},380);
          },320);
        },280);
        return;
      }
      if(phase==='move'){
        const color=players[currentPlayer];
        let bestPi=-1,bestScore=-1e9;
        pieces[color].forEach((_,pi)=>{
          if(!isMoveable(color,pi))return;
          const s=scoreAiMove(color,pi);
          if(s>bestScore){bestScore=s;bestPi=pi;}
        });
        if(bestPi<0){nextPlayer();return;}
        movePiece(color,bestPi);
      }
    }catch(err){
      console.warn('[ludo] AI error — passing turn',err);
      try{nextPlayer();}catch(e2){}
    }
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
    if(diceEl){
      diceEl.textContent=diceVal?diceEmojis[diceVal-1]:'🎲';
      diceEl.setAttribute('aria-label',diceVal?('Dice '+diceVal):'Dice');
    }
    const msgEl=overlay.querySelector('#ludoMsg');
    if(msgEl){msgEl.style.display=message?'block':'none';msgEl.textContent=message;}
    const rollBtn=overlay.querySelector('#ludoRoll');
    const color=players[currentPlayer];
    if(rollBtn){
      const can=phase==='roll'&&isMyControl()&&!gameOver&&!rolling&&!animating;
      rollBtn.disabled=!can;
      rollBtn.style.background=can?COLOR_STYLES[color]:'rgba(255,255,255,0.1)';
      rollBtn.textContent=gameOver?'Game Over!':phase==='roll'&&isMyControl()?'🎲 Roll Dice':phase==='move'&&isMyControl()?'Tap a glowing token':(liveOn?((chat.name||'Friend')+' playing…'):'Opponents playing…');
      rollBtn.setAttribute('aria-label',can?'Roll dice':'Dice unavailable');
    }
    players.forEach((c,i)=>{
      const card=overlay.querySelector(`[data-player-card="${i}"]`);
      if(!card)return;
      card.classList.toggle('ludo-seat--active',currentPlayer===i);
      card.style.borderColor=currentPlayer===i?COLOR_STYLES[c]:'transparent';
      card.style.background=currentPlayer===i?COLOR_STYLES[c]+'33':'rgba(255,255,255,0.05)';
      const home=card.querySelector('.ludo-home-count');
      if(home)home.textContent=homeCountLabel(c);
    });
  }

  function dismissLudoCoach(){
    coachDismissed=true;
    try{localStorage.setItem(coachKey,'1');}catch(e){}
    const el=overlay.querySelector('#ludoCoach');
    if(el)el.remove();
  }

  function renderLudo(){
    let grid='';
    for(let r=0;r<15;r++){
      for(let c=0;c<15;c++){
        const k=cellKind(r,c);
        let cls='ludo-cell';
        let style='';
        let inner='';
        if(k.type==='yard'){cls+=' ludo-cell--yard';style=`background:${COLOR_STYLES[k.color]}33;`;}
        else if(k.type==='home'){cls+=' ludo-cell--home';style=`background:${COLOR_STYLES[k.color]};`;}
        else if(k.type==='center'){cls+=' ludo-cell--center';}
        else if(k.type==='path'||k.type==='pathfill'){
          cls+=' ludo-cell--path';
          if(k.safe){cls+=' ludo-cell--safe';inner='<span class="ludo-safe-star" aria-hidden="true">★</span>';}
          Object.entries(START_POS).forEach(([col,idx])=>{
            if(k.idx===idx)style=`background:${COLOR_STYLES[col]}55;`;
          });
        } else cls+=' ludo-cell--void';
        grid+=`<div class="${cls}" data-r="${r}" data-c="${c}" style="${style}">${inner}</div>`;
      }
    }
    const color=players[currentPlayer];
    const diceEmojis=['⚀','⚁','⚂','⚃','⚄','⚅'];
    const coachText=sessionMode==='quick'
      ?'Quick: first token home wins · 6 to enter · ★ safe · capture rivals'
      :'6 to enter · ★ safe · capture rivals · exact home · 2 same-color tokens block opponents';
    const coachHtml=!coachDismissed?`<div id="ludoCoach" class="ludo-coach" role="note">
      <div class="ludo-coach-text">${coachText}</div>
      <button type="button" id="ludoCoachDismiss" class="ludo-coach-x" aria-label="Dismiss tip">Got it</button>
    </div>`:'';
    const modeChip=sessionMode==='quick'
      ?`<div class="ludo-mode-chip" aria-label="Quick mode">Quick · first home wins</div>`
      :`<div class="ludo-mode-chip ludo-mode-chip--classic" aria-label="Classic mode">Classic · 4 home</div>`;
    overlay.innerHTML=`
      ${gameChromeHtml({title:'Ludo',subtitle:MODE_SUB,backId:'ludoBack'})}
      ${coachHtml}
      ${modeChip}
      <div class="ludo-seats" style="display:flex;gap:6px;padding:8px 12px;overflow-x:auto;flex-shrink:0;">
        ${players.map((c,i)=>`<div data-player-card="${i}" class="ludo-seat${currentPlayer===i?' ludo-seat--active':''}" style="flex:1;min-width:64px;background:${currentPlayer===i?COLOR_STYLES[c]+'33':'rgba(255,255,255,0.05)'};border:2px solid ${currentPlayer===i?COLOR_STYLES[c]:'transparent'};border-radius:10px;padding:6px;text-align:center;"><div style="color:${COLOR_STYLES[c]};font-size:10px;font-weight:700;">${NAMES[i]}</div><div class="ludo-home-count" style="font-size:11px;color:#ccc;">${homeCountLabel(c)}</div></div>`).join('')}
      </div>
      <div class="ludo-board-wrap">
        <div class="ludo-board" role="img" aria-label="Ludo board">
          ${grid}
          <div id="ludoTokens" class="ludo-tokens"></div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:6px 12px;flex-shrink:0;">
        <div id="ludoDice" aria-label="${diceVal?('Dice '+diceVal):'Dice'}" style="font-size:44px;line-height:1;">${diceVal?diceEmojis[diceVal-1]:'🎲'}</div>
        <div id="ludoMsg" style="flex:1;font-size:12px;font-weight:700;color:var(--gold);text-align:center;display:${message?'block':'none'};">${message||''}</div>
      </div>
      ${typeof gameTurnBannerHtml==='function'
        ? gameTurnBannerHtml({
            mode: gameOver?'over':isMyControl()?'yours':'theirs',
            label: gameOver?'Game over':isMyControl()?(phase==='roll'?'Your turn — roll':phase==='move'?'Your turn — tap a token':'Your turn'):(liveOn?((chat.name||'Friend')+' to move'):'Waiting for opponents…'),
            pulse: !gameOver && isMyControl(),
          })
        : ''}
      <div style="padding:10px 12px;padding-bottom:max(10px,env(safe-area-inset-bottom));flex-shrink:0;">
        <button id="ludoRoll" type="button" class="game-tap-target" aria-label="Roll dice" style="width:100%;min-height:48px;padding:13px;background:${phase==='roll'&&isMyControl()&&!gameOver?COLOR_STYLES[color]:'rgba(255,255,255,0.1)'};color:#fff;border:none;border-radius:var(--game-btn-radius,14px);font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;">
          ${gameOver?'Game Over!':phase==='roll'&&isMyControl()?'🎲 Roll Dice':phase==='move'&&isMyControl()?'Tap a glowing token':(liveOn?((chat.name||'Friend')+' playing…'):'Opponents playing…')}
        </button>
      </div>
    `;
    document.getElementById('ludoBack').addEventListener('click',()=>{askLudoLeave();});
    const coachBtn=document.getElementById('ludoCoachDismiss');
    if(coachBtn)coachBtn.addEventListener('click',dismissLudoCoach);
    document.getElementById('ludoRoll').addEventListener('click',()=>{if(isMyControl()&&phase==='roll'&&!gameOver)rollDice();});
    const layer=overlay.querySelector('#ludoTokens');
    layer.addEventListener('click',(e)=>{
      const tok=e.target.closest('.ludo-token');
      if(!tok||phase!=='move'||!isMyControl()||animating)return;
      const c=tok.dataset.color,pi=parseInt(tok.dataset.pi,10);
      if(moveableSet.has(c+':'+pi))movePiece(c,pi);
      else if(typeof gameFeedback==='function')gameFeedback('invalid');
    });
    placeTokens();
    updateHud();
  }
  if(liveOn&&liveRoles&&typeof DangalLive!=='undefined'){
    const matchId=String((chat&&chat.dangalMatchId)||(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.matchId)||'').trim();
    if(!matchId){
      try{if(typeof showToast==='function')showToast('Challenge link broken — opening Practice');}catch(e){}
      liveOn=false;
    } else {
      const hostSeed=!!(liveRoles.host);
      const seedState=hostSeed?{
        pieces:serializeLudoPieces(),
        currentPlayer:0,
        diceVal:null,
        phase:'roll',
        message:`${NAMES[0]}'s turn — roll to start`,
        gameOver:false,
        winnerSeat:null,
        consecutiveSixes:0,
        ludoMode:sessionMode,
        playerCount:2,
        moveable:[],
      }:null;
      liveHandle=DangalLive.join({
        gameType:'ludo',
        matchId,
        me:liveRoles.me,playerA:liveRoles.playerA,playerB:liveRoles.playerB,
        state:seedState,
        ludoMode:hostSeed?sessionMode:null,
        stake:liveStake,
        onSnap(val){
          if(!val||!gs.alive())return;
          applyLiveSnapshot(val);
        },
        onForfeit(info){
          if(gameOver||!gs.alive())return;
          const winnerUid=info&&typeof info==='object'&&info.winner!=null?info.winner:info;
          applyLiveSnapshot({
            status:'forfeit',
            winner:winnerUid,
            version:lastAppliedSeq+1,
            ludoMode:sessionMode,
            stake:liveStake,
            state:buildLudoSnapshot(),
          });
        },
      });
    }
  }
  if(!liveOn){
    message=`${NAMES[currentPlayer]}'s turn — roll to start`;
  }else{
    message=mySeat===0?`${NAMES[0]}'s turn — roll to start`:'Waiting for host…';
  }
  try{renderLudo();}catch(err){
    console.error('[ludo] render failed',err);
    try{if(typeof showToast==='function')showToast('Could not open Ludo');}catch(e2){}
    try{gs.close();}catch(e3){}
  }
}

// ===================== OH NO! CARDS ENGINE (Classic, Double Sided, Blaze Mode) =====================
function openUnoGame(chat, variant='normal', opts){
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
    return'Practice · '+vl+' · '+DIFF_LABELS[diffKey];
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
            openUnoGame(chat,variant,{house:isClassicRules?Object.assign({},house):undefined,difficulty:diffKey});
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
            ? gameTurnBannerHtml({mode:myTurn&&!pickingColor?'yours':(gameOver?'over':'waiting'),label:myTurn&&!pickingColor?(pendingChallenge&&pendingChallenge.victim==='me'?'Challenge the +4 or draw 4':drawStack>0?(house.stackDraw2&&drawStackType==='draw2'?`+${drawStack} pending — stack +2 or draw`:`Tap deck to draw ${drawStack} cards`):(drewPlayableIndex===hands.me.length-1&&drewPlayableIndex>=0?'Tap drawn card to play or tap deck to pass':'Your turn — tap a highlighted card')):(pickingColor?'Pick a colour':'Opponent thinking…'),pulse:myTurn&&!pickingColor})
            : `<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px;text-align:center;">${myTurn&&!pickingColor?'Your turn':'Opponent thinking…'}</div>`}
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
      else if(v==='wild'||v==='wild_dark')score=diffKey==='hard'?1:3;
      else if(card.color===currentColor)score=4;
      if(diffKey==='hard'&&(v==='wild'||v==='wild_draw4'||v==='wild_draw6'||v==='wild_dark')&&playable.some(c=>!needsColorPick(c)))score-=2;
      return{card,score};
    }).sort((a,b)=>b.score-a.score);
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


// ===================== PROFESSIONAL TIC-TAC-TOE =====================
function openTicTacToe(chat){
  const device=document.querySelector('.device');
  if(!device){if(typeof showToast==='function')showToast('Could not open Tic-Tac-Toe');return;}
  if(typeof DangalLive!=='undefined'&&DangalLive.isLive(chat)){
    startTicTacToe(chat,'live');
    return;
  }
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
const liveOn=typeof DangalLive!=='undefined'&&DangalLive.isLive(chat);
const liveRoles=liveOn&&DangalLive.roles?DangalLive.roles(chat):null;
const DIFF_LABEL=liveOn
  ?(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel?DangalLive.modeChromeLabel(true):'Live 1v1')
  :(typeof DangalLive!=='undefined'&&DangalLive.modeChromeLabel
    ?DangalLive.modeChromeLabel(false,diff==='easy'?'Easy':diff==='medium'?'Medium':'Hard')
    :('Practice · '+(diff==='easy'?'Easy':diff==='medium'?'Medium':'Hard')));
const overlay=document.createElement('div');
overlay.style.cssText='position:absolute;inset:0;background:#1a1a2e;z-index:80;display:flex;flex-direction:column;align-items:center;padding:0 0 12px;gap:12px;';
let liveHandle=null;
let leaveConfirmed=false;
const gs=beginGameOverlaySession({
  type:'ttt',title:'Tic-Tac-Toe',mode:liveOn?'live':'practice',chat,overlay,
  cleanup(){
    if(liveHandle&&!leaveConfirmed){
      try{liveHandle.leave({forfeit:!gameOver});}catch(e){try{liveHandle.leave();}catch(e2){}}
    }
  },
});
if(!gs.alive())return;
let board=Array(9).fill(null);let gameOver=false;let winLine=null;let scores={me:0,opp:0,draw:0};let showResult=false;
let myTurn=!liveRoles||liveRoles.myColor==='w';
let applyingLive=false;
const myMark=(!liveRoles||liveRoles.myColor==='w')?'X':'O';
const oppMark=myMark==='X'?'O':'X';

async function askTttLeave(){
  if(!liveHandle&&showResult){gs.close();return;}
  if(typeof DangalLive!=='undefined'&&DangalLive.requestLeave){
    const ok=await DangalLive.requestLeave({
      liveHandle,isPlaying:!!liveHandle||!gameOver,title:'Leave Tic-Tac-Toe?',body:'This run will end.',
      onLeave:()=>{leaveConfirmed=true;liveHandle=null;},
    });
    if(!ok)return;
  }else if(typeof confirmLeaveGame==='function'){
    const ok=await confirmLeaveGame({title:'Leave Tic-Tac-Toe?',body:'This run will end.'});
    if(!ok)return;
  }
  gs.close();
}

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
  const statusText=gameOver?(winLine?(board[winLine[0]]===myMark?'You won':`${chat.name} wins`):"It's a draw"):(myTurn?`Your turn (${myMark==='X'?'✕':'⭕'})`:(liveOn?`${chat.name}'s turn`:'Thinking…'));
  const turnMode=gameOver?'over':myTurn?'yours':'theirs';
  const turnBanner=typeof gameTurnBannerHtml==='function'
    ? gameTurnBannerHtml({ mode: turnMode, label: statusText, pulse: turnMode==='yours' })
    : `<div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;color:#fff;">${statusText}</div>`;
  const resultBlock=showResult&&typeof gameResultHtml==='function'
    ? gameResultHtml({
        gameId: 'ttt',
        title: winLine?(board[winLine[0]]===myMark?'You win!':`${chat.name} wins`):"It's a draw",
        subtitle: DIFF_LABEL+(typeof getDuelStreak==='function'&&getDuelStreak(chat.id||chat.name)?.streak>1?` · Streak ${getDuelStreak(chat.id||chat.name).streak}`:''),
        you: scores.me,
        opp: scores.opp,
        youLabel: 'You',
        oppLabel: chat.name.split(' ')[0],
        glyph: winLine?(board[winLine[0]]===myMark?'✕':'⭕'):'—',
        shareCardHtml: typeof buildGameShareCard==='function'?buildGameShareCard('ttt',{scoreLine:`${scores.me}–${scores.opp}`,vs:`vs ${chat.name}`,meta:DIFF_LABEL}):'',
        actions: [
          {label:'Play again',primary:true,id:'again'},
          {label:'Share',primary:false,id:'share'},
          {label:'Challenge friend',primary:false,id:'challenge'},
          {label:'Post to story',primary:false,id:'story'},
        ],
      })
    : '';
  overlay.innerHTML=`
    ${gameChromeHtml({title:'Tic-Tac-Toe',subtitle:DIFF_LABEL,backId:'tttBack'})}
    ${typeof gameScoreHtml==='function'
      ? `${gameScoreHtml({label:`You (${myMark})`,score:scores.me},{label:`${chat.name} (${oppMark})`,score:scores.opp})}<div style="text-align:center;color:rgba(255,255,255,.55);font-size:12px;margin:-4px 0 8px;">Draws ${scores.draw}</div>`
      : `<div style="display:flex;gap:20px;"><div>You ${scores.me}</div><div>Draw ${scores.draw}</div><div>${chat.name} ${scores.opp}</div></div>`}
    <div style="position:relative;width:min(280px,82vw);">
      <div id="tttBoard" style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--game-gap,8px);width:100%;" role="grid" aria-label="Tic-Tac-Toe board"></div>
      ${winLineSvg()}
    </div>
    ${showResult?resultBlock:turnBanner}
    ${!showResult?`<button id="tttNew" class="game-tap-target" style="padding:12px 32px;background:${gameOver?'var(--game-accent,var(--red))':'rgba(255,255,255,0.1)'};color:#fff;border:none;border-radius:var(--game-btn-radius,14px);font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;cursor:pointer;min-height:44px;">New game</button>`:''}
  `;
  if(typeof prepareGameOverlay==='function') prepareGameOverlay(overlay,{theme:'dark',gameId:'ttt'});
  document.getElementById('tttBack').addEventListener('click',()=>{askTttLeave();});
  const newBtn=document.getElementById('tttNew');
  if(newBtn)newBtn.addEventListener('click',()=>resetTtt());
  if(showResult){
    if(typeof wireGameResultActions==='function'){
      const tttShare={scoreLine:`${scores.me}–${scores.opp}`,vs:`vs ${chat.name}`,meta:DIFF_LABEL};
      wireGameResultActions(overlay,{
        again:()=>resetTtt(),
        share:()=>{
          if(typeof shareGameResult==='function'){
            shareGameResult('ttt',tttShare);
          }
        },
        challenge:async()=>{
          if(typeof openFriendPickerSheet==='function'){
            const f=await openFriendPickerSheet({title:'Challenge · Tic-Tac-Toe'});
            if(f){gs.close();openTicTacToe({name:f.name,id:f.id||f.uid});}
          }
        },
        story:()=>{if(typeof postGameScoreStory==='function')postGameScoreStory('ttt',tttShare);},
      });
    } else {
      overlay.querySelectorAll('[data-result-action]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          if(btn.dataset.resultAction==='0')resetTtt();
          else gs.close();
        });
      });
    }
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
    if(!cell&&myTurn&&!gameOver)sq.addEventListener('click',()=>placeTtt(i,myMark,false));
    boardEl.appendChild(sq);
  });
}

function resetTtt(){
  board=Array(9).fill(null);myTurn=myMark==='X';gameOver=false;winLine=null;showResult=false;render();
  if(liveOn&&liveHandle)pushTtt();
}

function placeTtt(i,mark,fromRemote){
      if(board[i]||gameOver)return;
      if(typeof pulseGameEl==='function')pulseGameEl(document.getElementById('tttBoard')?.children[i]);
      if(typeof gameFeedback==='function')gameFeedback('place');
      board[i]=mark;
      const w2=checkWin(board,mark);
      const iWon=mark===myMark;
      if(w2){winLine=w2;gameOver=true;if(iWon)scores.me++;else scores.opp++;if(typeof recordGameResult==='function')recordGameResult('ttt',iWon,false);if(typeof recordDuelStreak==='function')recordDuelStreak(chat.id||chat.name,iWon,false);if(liveOn&&liveHandle&&!fromRemote)pushTtt();endRound(iWon?'won':'lost');return;}
      if(board.every(Boolean)){gameOver=true;scores.draw++;if(typeof recordGameResult==='function')recordGameResult('ttt',false,true);if(typeof recordDuelStreak==='function')recordDuelStreak(chat.id||chat.name,false,true);if(liveOn&&liveHandle&&!fromRemote)pushTtt();endRound('draw');return;}
      myTurn=mark!==myMark;
      render();
      if(liveOn){
        if(!fromRemote&&liveHandle)pushTtt();
        return;
      }
      if(mark!==myMark)return;
      if(typeof gameFeedback==='function')gameFeedback('turn');
      gs.schedule(()=>{
        if(!gs.alive())return;
        const m=getAiMove();if(m==null)return;placeTtt(m,'O',true);
      },450);
}

function pushTtt(){
  const winnerUid=gameOver&&winLine
    ?(board[winLine[0]]===myMark?(liveRoles&&liveRoles.me):(liveRoles&&liveRoles.opp))
    :null;
  liveHandle.push({
    board:board.map((c)=>c||'.').join(''),
    turn:gameOver?null:(liveRoles&&liveRoles.opp),
    lastMove:{board:board.slice()},
    status:gameOver?'over':'playing',
    winner:winnerUid||null,
  });
  if(!gameOver&&typeof DangalLive!=='undefined'&&DangalLive.pingTurn&&liveRoles)DangalLive.pingTurn(liveRoles.opp,'ttt',{chatId:chat&&(chat.firestoreId||chat.id)});
}
if(liveOn&&liveRoles){
  liveHandle=DangalLive.join({
    gameType:'ttt',
    matchId:(chat&&chat.dangalMatchId)||(window.__dangalLaunchCtx&&window.__dangalLaunchCtx.matchId),
    me:liveRoles.me,playerA:liveRoles.playerA,playerB:liveRoles.playerB,
    onSnap(val){
      if(!val||applyingLive||!gs.alive())return;
      if(val.status==='forfeit'&&!gameOver){
        gameOver=true;
        const iWon=val.winner===liveRoles.me;
        if(iWon)scores.me++;else scores.opp++;
        if(typeof recordGameResult==='function')recordGameResult('ttt',iWon,false);
        endRound(iWon?'won':'lost');
        return;
      }
      if(!val.board)return;
      const next=String(val.board).split('').map((ch)=>ch==='.'||ch===' '?null:ch);
      if(next.length!==9)return;
      if(next.join('')===board.map((c)=>c||'').join(''))return;
      applyingLive=true;
      board=next.map((c)=>c||null);
      const wX=checkWin(board,'X');const wO=checkWin(board,'O');
      winLine=wX||wO;
      gameOver=!!winLine||board.every(Boolean)||val.status==='over';
      myTurn=(board.filter(Boolean).length%2===0)?(myMark==='X'):(myMark==='O');
      if(gameOver&&!showResult){
        if(winLine){
          const iWon=board[winLine[0]]===myMark;
          endRound(iWon?'won':'lost');
        } else endRound('draw');
      } else render();
      applyingLive=false;
    },
  });
}
render();
}

// ===================== SHABD FIVE =====================
// Lexicon: Prompt 1 banks. Daily contract (Prompt 2): save / one-shot lock / Practice sealed.
const SHABD_ANSWER_BANK=(typeof SHABD_ANSWERS!=='undefined'&&Array.isArray(SHABD_ANSWERS)&&SHABD_ANSWERS.length)
  ?SHABD_ANSWERS
  :['HOUSE','WORLD','HEART','DREAM','LIGHT','OCEAN','RIVER','MUSIC','STONE','POWER'];
const SHABD_DAILY_KEY='chaupaal_shabd_daily_v1';

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
    keyColors=saved.keyColors&&Object.keys(saved.keyColors).length?Object.assign({},saved.keyColors):{};
    if(!Object.keys(keyColors).length&&guesses.length)rebuildKeyColorsFromGuesses();
    restoredFinished=gameOver;
  }else{
    // Stale other-day save: rotate cleanly
    const stale=loadShabdDailyState();
    if(stale&&stale.day&&stale.day!==todayKey)clearShabdDailyState();
    target=shabdPickDaily();
    persistDaily();
  }
}else{
  target=pickShabdPractice();
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

function finishDailyIfNeeded(won){
  if(!useDaily)return;
  gameOver=true;
  if(!streakRecorded){
    if(typeof recordShabdDailyResult==='function')recordShabdDailyResult(won);
    streakRecorded=true;
  }
  persistDaily({gameOver:true,won:!!won,streakRecorded:true,currentGuess:''});
}

function render(){
  if(!gs.alive())return;
  const dayLabel=useDaily?`Daily · ${shabdDailySeed()}`:'Practice';
  const streak=typeof getShabdStreak==='function'?getShabdStreak():null;
  const streakBit=useDaily&&streak&&streak.streak?` · Streak ${streak.streak}`:'';
  const won=gameOver&&guesses.length>0&&guesses[guesses.length-1]===target;
  const shareCard=gameOver&&typeof buildGameShareCard==='function'
    ? buildGameShareCard('wordguess',{
        scoreLine: won?`${guesses.length}/6`:'X/6',
        meta: dayLabel+(streak&&streak.streak?` · streak ${streak.streak}`:''),
      })
    : '';
  const againLabel=useDaily?'Practice a random word':'Play again';
  const resultBlock=gameOver&&typeof gameResultHtml==='function'
    ? gameResultHtml({
        gameId: 'wordguess',
        glyph: won?'✓':'·',
        title: won?'Brilliant!':'Nice try',
        subtitle: won?`Solved in ${guesses.length}`:`Word was ${target}`,
        vsBest: (typeof formatVsBest==='function'&&won)?formatVsBest('wordguess', guesses.length):undefined,
        shareCardHtml: shareCard,
        actions: [
          {label:'Share',primary:true,id:'share'},
          {label:againLabel,primary:false,id:'again'},
          {label:'Challenge friend',primary:false,id:'challenge'},
          {label:'Post to story',primary:false,id:'story'},
        ],
      })
    : '';
  const hud=typeof gameHudHtml==='function'&&!gameOver
    ? gameHudHtml([
        {label:'Guess',value:`${guesses.length+1}/6`},
        useDaily&&streak?{label:'Streak',value:String(streak.streak||0)}:null,
      ])
    : '';
  const chromeRight=gameOver
    ?''
    :'<button type="button" id="wgNew" class="game-chrome-action">Practice</button>';
  overlay.innerHTML=`
    ${gameChromeHtml({title:'Shabd Five',subtitle:dayLabel+streakBit,backId:'wgBack',rightHtml:chromeRight})}
    ${hud}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:10px;" id="wgGrid"></div>
    ${resultBlock||(gameOver?`<div style="text-align:center;padding:8px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;color:${won?'#538D4E':'#B59F3B'};flex-shrink:0;">${won?'Brilliant!':'The word was '+target}</div>`:'')}
    ${gameOver?'':`<div style="flex-shrink:0;padding:8px;padding-bottom:max(8px,env(safe-area-inset-bottom));" id="wgKeyboard"></div>`}
  `;
  document.getElementById('wgBack').addEventListener('click',()=>{askWordGuessLeave();});
  document.getElementById('wgNew')?.addEventListener('click',()=>{goToPractice(false);});

  if(gameOver&&typeof wireGameResultActions==='function'){
    const gridText=typeof buildShabdGridShare==='function'?buildShabdGridShare(guesses,target):`Chaupaal Shabd Five ${guesses.length}/6`;
    const shareStats={
      scoreLine: won?`${guesses.length}/6`:'X/6',
      score: won?guesses.length:6,
      meta: dayLabel,
      text: gridText+`\n\nPlay on Chaupaal`,
      includeImage: false,
    };
    wireGameResultActions(overlay,{
      again:()=>{
        if(useDaily)goToPractice(true);
        else{gs.close('restart');openWordGuess(chat,{daily:false});}
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
    if(currentGuess.length!==5){shake=true;if(typeof shakeInvalidMove==='function')shakeInvalidMove(document.getElementById('wgGrid'));else if(typeof gameFeedback==='function')gameFeedback('invalid');render();gs.schedule(()=>{shake=false;render();},500);return;}
    if(!isShabdGuessAllowed(currentGuess)){if(typeof shakeInvalidMove==='function')shakeInvalidMove(document.getElementById('wgGrid'),{toast:'Not in word list'});else{showToast('Not in word list');if(typeof gameFeedback==='function')gameFeedback('invalid');}shake=true;render();gs.schedule(()=>{shake=false;render();},500);return;}
    const guess=currentGuess;
    guesses.push(guess);currentGuess='';
    if(useDaily)persistDaily();
    staggerReveal(guess,()=>{
      if(guess===target||guesses.length===6){
        const won=guess===target;
        gs.setOutcome(won?'won':'lost');
        if(typeof recordGameResult==='function')recordGameResult('wordguess',won);
        if(typeof gameFeedback==='function')gameFeedback(won?'win':'lose');
        if(useDaily)finishDailyIfNeeded(won);
        else gameOver=true;
        if(won&&typeof setGamePB==='function') setGamePB('wordguess', guesses.length);
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
    desc: 'Practice vs AI · Live with a friend',
    icon: '♟',
    ratingKey: 'chess',
    gameType: 'dual',
    liveDuel: true,
    genre: 'board',
    chat1v1: true,
    selfChat: true,
    order: 10,
    meta: {
      phaseA: 'Practice core loop — clocks, promotion, resign, results',
      phaseB: 'Live RTDB move sync hardening',
      phaseC: 'complete — stakes, Elo settle, rematch, draw/abort, history',
      complete: true,
    },
    launch(ctx) { openChessGame(typeof chatFromLaunch === 'function' ? chatFromLaunch(ctx) : ctx.chat); },
  });
  registerGame({
    id: 'snakes',
    name: 'Snakes & Ladders',
    desc: '5 versions, picked at random',
    icon: '🐍',
    ratingKey: 'snakes',
    gameType: 'dual',
    genre: 'board',
    chat1v1: true,
    selfChat: true,
    order: 20,
    launch(ctx) { openSnakesVersionPicker(ctx.chat); },
  });
  registerGame({
    id: 'ludo',
    name: 'Ludo',
    desc: 'Classic or Quick · Live 1v1 or Practice',
    icon: '🎯',
    ratingKey: 'ludo',
    gameType: 'multiplayer',
    genre: 'board',
    chat1v1: true,
    chatGroup: true,
    order: 30,
    launch(ctx) {
      try{
        const launch=window.__dangalLaunchCtx||{};
        const chat=typeof chatFromLaunch==='function'?chatFromLaunch(ctx):ctx.chat;
        const liveWanted=
          ctx.mode==='live'||
          launch.mode==='live'||
          (typeof DangalLive!=='undefined'&&DangalLive.isLive&&DangalLive.isLive(chat,Object.assign({},launch,ctx)));
        const ludoMode=
          ctx.ludoMode||
          launch.ludoMode||
          (ctx.mode==='quick'||ctx.mode==='classic'?ctx.mode:'')||
          'classic';
        if(ctx.isGroup){
          openGroupGameSetup(ctx.chat,'ludo');
          return;
        }
        if(liveWanted){
          // Guest with known mode opens board; host without mode uses Live sheet
          if(ctx.source==='challenge'||(ludoMode&&(ctx.matchId||launch.matchId||(chat&&chat.dangalMatchId)))){
            openLudoGame(chat,2,{mode:ludoMode==='quick'?'quick':'classic',ludoMode});
            return;
          }
          if(typeof openLudoPracticeSheet==='function'){
            openLudoPracticeSheet(chat,{
              liveOnly:true,
              source:ctx.source||'challenge_host',
              matchId:ctx.matchId||launch.matchId||'',
              opponentUid:ctx.opponentUid||launch.opponentUid||'',
              chatId:ctx.chatId||launch.chatId||'',
              stake:ctx.stake||launch.stake||0,
              ludoMode,
            });
            return;
          }
        }
        if(typeof openLudoPracticeSheet==='function')openLudoPracticeSheet(chat,{source:ctx.source||'baithak'});
        else openLudoGame(chat,2,{mode:'classic'});
      }catch(err){
        console.error('[ludo] launch failed',err);
        try{if(typeof showToast==='function')showToast('Could not open Ludo');}catch(e2){}
      }
    },
  });
  registerGame({
    id: 'uno',
    name: 'Oh, No! Cards',
    desc: 'Classic · Blaze · Flip · Live 1v1',
    icon: '🃏',
    ratingKey: 'uno',
    gameType: 'multiplayer',
    liveDuel: true,
    genre: 'party',
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
    id: 'ttt',
    name: 'Tic-Tac-Toe',
    desc: 'Live vs a friend · or quick AI',
    icon: '⭕',
    ratingKey: 'ttt',
    gameType: 'dual',
    liveDuel: true,
    genre: 'board',
    chat1v1: true,
    selfChat: true,
    order: 50,
    launch(ctx) { openTicTacToe(typeof chatFromLaunch === 'function' ? chatFromLaunch(ctx) : ctx.chat); },
  });
  registerGame({
    id: 'wordguess',
    name: 'Shabd Five',
    desc: '5-letter daily puzzle · Solo',
    icon: '📝',
    ratingKey: 'wordguess',
    gameType: 'solo',
    genre: 'brain',
    solo: true,
    chat1v1: true,
    selfChat: true,
    order: 60,
    meta: { graduated: true, phase: 1 },
    launch(ctx) { openWordGuess(ctx.chat); },
  });
}

window.startChessGame = startChessGame;
