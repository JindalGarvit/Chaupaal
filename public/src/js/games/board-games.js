// Scribble lives in games/scribble-core.js + games/scribble-ui.js (Dangal P5 party rooms).

// ===================== GROUP GAME SETUP — PLAYER SELECTOR =====================
function openGroupGameSetup(groupChat, gameId){
  groupChat=groupChat||{members:[]};
  // groupChat.members should be an array of {name, uid, avatar}
  let members=(groupChat.members||[{name:t('dangal.player_2'),avatar:'👤'},{name:t('dangal.player_3'),avatar:'👤'},{name:t('dangal.player_4'),avatar:'👤'}]);
  const multiGames={
    ludo:{name:'🎯 ' + t('dangal.identity.ludo.label'),min:2,max:4},
    uno:{name:t('dangal.oh_no_2'),min:2,max:10},
  };
  const cfg=multiGames[gameId];
  if(!cfg){
    if(typeof showToast==='function')showToast(t('dangal.that_group_game_isn_t_available'));
    return;
  }
  let selectedPlayers=new Set();

  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;inset:0;background:var(--cream);z-index:100;display:flex;flex-direction:column;';
  
  function render(){
    sheet.innerHTML=`
      <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--white);border-bottom:1px solid var(--line);flex-shrink:0;">
        ${typeof backButtonHtml==='function'?backButtonHtml({ id: 'groupGameBack' }):'<button id="groupGameBack" class="cp-back-btn" aria-label="' + tHtml('common.back') + '">←</button>'}
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">${tHtml('dangal.select_players_for', { name: cfg.name })}</div>
      </div>
      <div style="padding:16px;flex:1;overflow-y:auto;">
        <div style="font-size:13px;color:var(--muted);margin-bottom:14px;">${tHtml('dangal.pick_value_value2_players_you_are', { value: cfg.min, value2: cfg.max })}</div>
        <div style="display:flex;align-items:center;gap:10px;padding:14px;background:var(--white);border-radius:14px;margin-bottom:8px;border:2px solid var(--game-accent,var(--red));">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--game-accent,var(--red));display:flex;align-items:center;justify-content:center;font-size:18px;">🪑</div>
          <div style="flex:1;font-weight:700;">${tHtml('dangal.solo.you')}</div>
          <div style="color:var(--game-accent,var(--red));font-size:12px;font-weight:700;">${tHtml('dangal.playing')}</div>
        </div>
        ${members.map((m,i)=>{
          const sel=selectedPlayers.has(m.name);
          return`<div class="group-player-row" data-name="${m.name}" style="display:flex;align-items:center;gap:10px;padding:14px;background:var(--white);border-radius:14px;margin-bottom:8px;border:2px solid ${sel?'var(--game-accent,var(--red))':'var(--line)'};cursor:pointer;">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--line);display:flex;align-items:center;justify-content:center;font-size:18px;">${m.avatar||'👤'}</div>
            <div style="flex:1;"><div style="font-weight:700;">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(m.name,m):m.name}</div><div style="font-size:11px;color:var(--muted);">${tHtml('dangal.tap_to_value', { value: sel?t('dangal.remove'):t('dangal.add') })}</div></div>
            <div style="width:24px;height:24px;border-radius:50%;background:${sel?'var(--game-accent,var(--red))':'var(--line)'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;">${sel?'✓':''}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="padding:14px 16px;background:var(--white);border-top:1px solid var(--line);">
        <div style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:10px;">${tHtml('dangal.players_selected', { count: selectedPlayers.size+1 })}</div>
        <button id="startGroupGame" style="width:100%;padding:14px;background:${selectedPlayers.size+1>=cfg.min?'var(--game-accent,var(--red))':'var(--line)'};color:${selectedPlayers.size+1>=cfg.min?'#fff':'var(--muted)'};border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;">
          ${selectedPlayers.size+1>=cfg.min?tHtml('dangal.start_game'):tHtml('dangal.select_at_least_value_players', { value: cfg.min })}
        </button>
      </div>
    `;
    document.getElementById('groupGameBack').addEventListener('click',()=>sheet.remove());
    sheet.querySelectorAll('.group-player-row').forEach(row=>{
      row.addEventListener('click',()=>{
        const name=row.dataset.name;
        if(selectedPlayers.has(name))selectedPlayers.delete(name);
        else if(selectedPlayers.size+1<cfg.max)selectedPlayers.add(name);
        else showToast(t('dangal.max_max_players_for_this_game', { max: cfg.max }));
        render();
      });
    });
    document.getElementById('startGroupGame').addEventListener('click',()=>{
      if(selectedPlayers.size+1<cfg.min)return;
      sheet.remove();
      const ownType=typeof ownProfileType==='function'?ownProfileType():'personal';
      const playerList=[{name:t('dangal.classics.you'),isMe:true,profileType:ownType},...[...selectedPlayers].map(n=>{const m=members.find(x=>x.name===n);return{name:n,avatar:m?.avatar||'👤',isMe:false,profileType:m?.profileType||null,uid:m?.uid||null};})];
      const playerCount=playerList.length;
      const fakeChat={name:playerList[1]?.name||t('dangal.opponent'),id:'group_game',profileType:playerList[1]?.profileType||null};
      if(gameId==='ludo'){
        if(typeof openLudoPracticeSheet==='function')openLudoPracticeSheet(fakeChat,{playerCount,source:'baithak'});
        else openLudoGame(fakeChat,playerCount,{mode:'classic'});
      }
      else if(gameId==='uno'&&window.OhNoGame)window.OhNoGame.launch({source:'manch'});
    });
  }
  document.querySelector('.device').appendChild(sheet);
  if(typeof enrichUsersWithProfileType==='function'){
    enrichUsersWithProfileType(members).finally(()=>render());
  } else {
    render();
  }
}

window.openScribblePartySetup=(chat)=>window.ScribbleGame&&window.ScribbleGame.launch({chat,source:'party'});

// openGamePicker is provided by game-registry.js
