/**
 * Baithak chat transport — realtime messages (Firestore).
 * Extracted from streak.js so streak rituals stay separate from DM plumbing.
 */
// ===================== REAL-TIME CHAT (Firestore) =====================
let activeChatListener=null;

async function loadRealtimeMessages(chatId, msgsArea, isGroup){
  if(!db||!currentUser||!msgsArea) return;
  let id=String(chatId||'');
  if(/^chat_(profile|disc|dl)_/.test(id)&&typeof ensurePeerDmChat==='function'){
    const peer=id.replace(/^chat_(profile|disc|dl)_/, '');
    try{
      const real=await ensurePeerDmChat(peer);
      if(real) id=real;
    }catch(e){}
  }else if(!isGroup&&typeof dmChatIdFor==='function'){
    const open=window.currentOpenChat;
    const peer=open&&(open.uid||open.peerUid||open.otherUid);
    if(peer){
      const canon=dmChatIdFor(peer);
      if(canon&&id!==canon&&(typeof isStubDmId==='function'?isStubDmId(id):(id.startsWith('chat_')||!id.includes('_')))){
        id=canon;
        if(open){ open.firestoreId=canon; open.id=canon; }
      }
    }
  }
  if(activeChatListener){ activeChatListener(); activeChatListener=null; }
  let oldestDoc=null;
  let primed=false;
  const rendered=new Set();

  // Paint warm cache immediately (before snapshot)
  if(typeof baithakMsgCache?.get==='function'){
    baithakMsgCache.get(id).then((cached)=>{
      if(!cached?.messages?.length||primed) return;
      if(msgsArea.querySelector('.msg-row[data-msg-id], .msg-row[data-pending="1"]')) return;
      msgsArea.querySelectorAll('.ui-skeleton-stack').forEach((el)=>el.remove());
      cached.messages.forEach((m)=>{
        if(!m||rendered.has(m.id)) return;
        const pref = typeof getBaithakPref === 'function' ? getBaithakPref(id) : {};
        const clearedBefore = Number(pref?.clearedBefore) || 0;
        if (clearedBefore && m.ts && Number(m.ts) <= clearedBefore) return;
        if (typeof BaithakChatActions?.messageVisibleToViewer === 'function' && !BaithakChatActions.messageVisibleToViewer(m)) return;
        if(m.id) rendered.add(m.id);
        const mine=m.uid===currentUser.uid;
        const isChaupaalMsg=m.uid==='chaupaal'||m.role==='assistant'||m.from==='chaupaal'||m.name==='Chaupaal';
        const div=document.createElement('div');
        div.innerHTML=renderMsgBubble({
          from:mine?'me':'them',
          text:m.deletedForEveryone ? '' : m.text,
          time:m.ts?new Date(m.ts).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'',
          avatar:isChaupaalMsg?(m.avatar||'🏠'):(m.avatar||'👤'),
          name:m.name||(isChaupaalMsg?'Chaupaal':undefined),
          profileType:m.profileType||null,
          music:m.deletedForEveryone ? null : (m.music||null),
          attachment:m.deletedForEveryone ? null : (m.attachment||null),
          uid:m.uid,
          deletedForEveryone: !!m.deletedForEveryone,
        },isGroup);
        const node=div.firstElementChild;
        if(!node) return;
        if(m.id){ node.dataset.msgId=m.id; node.setAttribute('data-msg-id',m.id); }
        if(m.clientTempId) node.dataset.clientTempId=m.clientTempId;
        if(m.ts) node.dataset.msgTs=String(m.ts);
        if(typeof mountMusicCards==='function') mountMusicCards(node);
        if(typeof mountLocationCards==='function') mountLocationCards(node);
        if(typeof wireChallengeBubble==='function') wireChallengeBubble(node);
        msgsArea.appendChild(node);
      });
      msgsArea.scrollTop=msgsArea.scrollHeight;
    }).catch(()=>{});
  }

  function appendFromDoc(doc, prepend){
    if(rendered.has(doc.id)) return;
    const m=doc.data()||{};
    const pref = typeof getBaithakPref === 'function' ? getBaithakPref(id) : {};
    const clearedBefore = Number(pref?.clearedBefore) || 0;
    const msgTs = m.ts?.toMillis ? m.ts.toMillis() : (typeof m.ts === 'number' ? m.ts : 0);
    if (clearedBefore && msgTs && msgTs <= clearedBefore) return;
    if (typeof BaithakChatActions?.messageVisibleToViewer === 'function' && !BaithakChatActions.messageVisibleToViewer(m)) {
      return;
    }
    rendered.add(doc.id);
    const mine=m.uid===currentUser.uid;
    const isChaupaalMsg =
      m.uid === 'chaupaal' ||
      m.role === 'assistant' ||
      m.from === 'chaupaal' ||
      m.name === 'Chaupaal';
    // Prefer live display name for peers when available
    let displayName=m.name;
    if(!mine&&!isChaupaalMsg&&window.currentOpenChat){
      const peerName=window.currentOpenChat._realName||window.currentOpenChat.name;
      if(peerName&&typeof isGenericDmTitle==='function'&&!isGenericDmTitle(peerName)&&!/^@/.test(peerName)){
        displayName=peerName;
      }
    }
    const div=document.createElement('div');
    div.innerHTML=renderMsgBubble({
      from:mine?'me':'them',
      text:m.deletedForEveryone ? '' : m.text,
      time:m.ts?.toDate?new Date(m.ts.toDate()).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'',
      avatar:isChaupaalMsg ? (m.avatar || '🏠') : (m.avatar||'👤'),
      name:displayName || (isChaupaalMsg ? 'Chaupaal' : undefined),
      profileType:m.profileType||null,
      music:m.deletedForEveryone ? null : (m.music||null),
      attachment:m.deletedForEveryone ? null : (m.attachment||null),
      uid:m.uid,
      deletedForEveryone: !!m.deletedForEveryone,
    },isGroup);
    const node=div.firstElementChild;
    if(!node) return;
    node.dataset.msgId=doc.id;
    node.setAttribute('data-msg-id', doc.id);
    if(m.clientTempId) node.dataset.clientTempId=m.clientTempId;
    if (msgTs) node.dataset.msgTs = String(msgTs);
    if(typeof mountMusicCards==='function') mountMusicCards(node);
    if(typeof mountLocationCards==='function') mountLocationCards(node);
    if(typeof wireChallengeBubble==='function') wireChallengeBubble(node);
    if(prepend) msgsArea.insertBefore(node, msgsArea.firstChild);
    else msgsArea.appendChild(node);
  }

  function matchPendingRow(m){
    const pending=[...msgsArea.querySelectorAll('.msg-row.me[data-pending="1"]')];
    if(m.clientTempId){
      const byTemp=pending.find((row)=>row.dataset.clientTempId===m.clientTempId);
      if(byTemp) return byTemp;
    }
    return pending.reverse().find((row)=>{
      const t=row.querySelector('.msg-bubble')?.getAttribute('data-msg-text')||'';
      return t && m.text && t.slice(0,80)===String(m.text).slice(0,80);
    });
  }

  try{
    activeChatListener=db.collection('chats').doc(id).collection('messages')
      .orderBy('ts','asc').limitToLast(50)
      .onSnapshot(snap=>{
        if(!oldestDoc && snap.docs.length) oldestDoc=snap.docs[0];
        if(!primed){
          primed=true;
          msgsArea.querySelectorAll('.ui-skeleton-stack').forEach((el)=>el.remove());
          // Reconcile: keep unmatched pending; clear only matched/orphaned cache rows
          if(snap.docs.length){
            const serverIds=new Set(snap.docs.map((d)=>d.id));
            const serverTemps=new Set(snap.docs.map((d)=>(d.data()||{}).clientTempId).filter(Boolean));
            msgsArea.querySelectorAll('.msg-row').forEach((row)=>{
              if(row.dataset.pending==='1'){
                const temp=row.dataset.clientTempId;
                const t=row.querySelector('.msg-bubble')?.getAttribute('data-msg-text')||'';
                const matched=snap.docs.some((d)=>{
                  const m=d.data()||{};
                  if(temp&&m.clientTempId===temp) return true;
                  return m.uid===currentUser.uid&&t&&m.text&&t.slice(0,80)===String(m.text).slice(0,80);
                });
                if(matched) row.remove();
                return;
              }
              const mid=row.dataset.msgId;
              if(mid&&!serverIds.has(mid)&&!row.dataset.pending) row.remove();
            });
            rendered.clear();
            msgsArea.querySelectorAll('.msg-row[data-msg-id]').forEach((row)=>{
              if(row.dataset.msgId) rendered.add(row.dataset.msgId);
            });
          }
          const batch=snap.docs.map((doc)=>({uid:(doc.data()||{}).uid,profileType:(doc.data()||{}).profileType||null}));
          const enrichThen=()=>{
            // Clear non-pending rows then append server window (avoid dupes with cache)
            if(snap.docs.length){
              [...msgsArea.querySelectorAll('.msg-row:not([data-pending="1"])')].forEach((el)=>el.remove());
              rendered.clear();
              snap.docs.forEach((doc)=>appendFromDoc(doc,false));
            }
            msgsArea.scrollTop=msgsArea.scrollHeight;
            if(typeof baithakMsgCache?.put==='function'){
              const forCache=snap.docs.map((doc)=>{
                const m=doc.data()||{};
                return {
                  id:doc.id,
                  uid:m.uid,
                  text:m.text,
                  ts:m.ts?.toMillis?.()||Date.now(),
                  name:m.name,
                  avatar:m.avatar,
                  profileType:m.profileType,
                  music:m.music,
                  attachment:m.attachment,
                  clientTempId:m.clientTempId||null,
                  systemCard:m.systemCard,
                  kind:m.kind,
                  role:m.role,
                  from:m.from,
                };
              });
              baithakMsgCache.put(id, forCache).catch(()=>{});
            }
          };
          if(typeof enrichUsersWithProfileType==='function'){
            enrichUsersWithProfileType(batch).finally(enrichThen);
          } else {
            enrichThen();
          }
          return;
        }
        snap.docChanges().forEach(change=>{
          if(change.type==='removed'){
            rendered.delete(change.doc.id);
            msgsArea.querySelector(`.msg-row[data-msg-id="${change.doc.id}"]`)?.remove();
            return;
          }
          if(change.type==='modified'){
            const m=change.doc.data()||{};
            const row=msgsArea.querySelector(`.msg-row[data-msg-id="${change.doc.id}"]`);
            if(typeof BaithakChatActions?.messageVisibleToViewer==='function' && !BaithakChatActions.messageVisibleToViewer(m)){
              row?.remove();
              rendered.delete(change.doc.id);
              return;
            }
            if(m.deletedForEveryone && row){
              row.classList.add('msg-row--deleted');
              row.dataset.deletedEveryone='1';
              const bubble=row.querySelector('.msg-bubble');
              if(bubble){
                bubble.classList.add('msg-bubble--deleted');
                bubble.innerHTML=`<em>${typeof t==='function'?t('baithak_msg_deleted_everyone')||'This message was deleted':'This message was deleted'}</em>`;
              }
            }
            return;
          }
          if(change.type!=='added') return;
          if(rendered.has(change.doc.id)) return;
          const m=change.doc.data()||{};
          if(m.uid===currentUser.uid){
            matchPendingRow(m)?.remove();
          }
          if(m.uid==='chaupaal' || m.role==='assistant'){
            const themPending=[...msgsArea.querySelectorAll('.msg-row:not(.me):not([data-msg-id])')];
            const match=themPending.reverse().find((row)=>{
              const t=row.querySelector('.msg-bubble')?.getAttribute('data-msg-text')||'';
              return t && m.text && t.slice(0,80)===String(m.text).slice(0,80);
            });
            match?.remove();
          }
          appendFromDoc(change.doc,false);
          msgsArea.scrollTop=msgsArea.scrollHeight;
          if(typeof baithakMsgCache?.appendOptimistic==='function'){
            const m2=change.doc.data()||{};
            baithakMsgCache.appendOptimistic(id,{
              id:change.doc.id,
              uid:m2.uid,
              text:m2.text,
              ts:m2.ts?.toMillis?.()||Date.now(),
              name:m2.name,
              avatar:m2.avatar,
              clientTempId:m2.clientTempId||null,
              music:m2.music,
              attachment:m2.attachment,
            }).catch(()=>{});
          }
        });
      }, (err)=>{
        console.warn('[chat] messages listener', err?.code||err?.message||err);
        if(typeof reportClientError==='function'){
          reportClientError({feature:'chat_listener',message:err?.message||String(err),code:err?.code||''});
        }
        const code=String(err?.code||'');
        if(code==='permission-denied'||/permission/i.test(String(err?.message||''))){
          const banner=document.createElement('div');
          banner.className='chat-listener-banner';
          banner.textContent="Can't load messages — check connection or reopen chat";
          if(!msgsArea.querySelector('.chat-listener-banner')){
            msgsArea.insertBefore(banner, msgsArea.firstChild);
          }
        }
      });

    if(typeof ensureLoadMoreButton==='function' && typeof fetchOlderMessages==='function'){
      let wrap=msgsArea.parentElement?.querySelector('[data-ui="chat-history-bar"]');
      if(!wrap){
        wrap=document.createElement('div');
        wrap.dataset.ui='chat-history-bar';
        wrap.style.cssText='padding:8px 12px;text-align:center;';
        msgsArea.parentElement?.insertBefore(wrap, msgsArea);
      }
      ensureLoadMoreButton(wrap,{
        label:'Load earlier messages',
        onLoadMore:async()=>{
          if(!oldestDoc) return;
          const page=await fetchOlderMessages(id,{beforeDoc:oldestDoc,pageSize:30});
          if(!page.items.length){ if(typeof setLoadMoreVisible==='function') setLoadMoreVisible(wrap,false); return; }
          oldestDoc=page.firstDoc;
          const frag=document.createDocumentFragment();
          page.items.forEach(m=>{
            const docId=m.id||m._docId;
            if(docId && rendered.has(docId)) return;
            const div=document.createElement('div');
            const mine=m.uid===currentUser.uid;
            div.innerHTML=renderMsgBubble({
              from:mine?'me':'them',
              text:m.text,
              time:m.ts?.toDate?new Date(m.ts.toDate()).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'',
              avatar:m.avatar||'👤',
              name:m.name,
              profileType:m.profileType||null,
              music:m.music||null,
              attachment:m.attachment||null,
              uid:m.uid,
            },isGroup);
            if(div.firstElementChild){
              if(docId){ div.firstElementChild.dataset.msgId=docId; rendered.add(docId); }
              if(typeof mountMusicCards==='function') mountMusicCards(div.firstElementChild);
              if(typeof mountLocationCards==='function') mountLocationCards(div.firstElementChild);
              if(typeof wireChallengeBubble==='function') wireChallengeBubble(div.firstElementChild);
              frag.appendChild(div.firstElementChild);
            }
          });
          const prevHeight=msgsArea.scrollHeight;
          msgsArea.insertBefore(frag, msgsArea.firstChild);
          msgsArea.scrollTop=msgsArea.scrollHeight-prevHeight;
          if(!page.hasMore && typeof setLoadMoreVisible==='function') setLoadMoreVisible(wrap,false);
        },
      });
    }
  }catch(e){}
}

async function sendRealtimeMessage(chatId, text, isGroup, music, attachment, opts){
  if(!db||!currentUser) throw Object.assign(new Error('Not signed in'), { code: 'CHAT_NOT_READY' });
  const options = opts && typeof opts === 'object' ? opts : {};
  const clientTempId = options.clientTempId || null;
  let id=String(chatId||'');
  if(!id || id==='chat_self' || /^chat_(riya|arjun)/.test(id) || id.startsWith('grp_')){
    throw Object.assign(new Error('This chat is not synced yet — open a real conversation'), { code: 'CHAT_NOT_READY' });
  }
  let peerUid = null;
  if(/^chat_(profile|disc|dl)_/.test(id) && typeof ensurePeerDmChat==='function'){
    peerUid=id.replace(/^chat_(profile|disc|dl)_/, '');
    const real=await ensurePeerDmChat(peerUid);
    if(real) id=real;
  } else if(!isGroup){
    const open=window.currentOpenChat;
    peerUid=open&&(open.uid||open.peerUid||open.otherUid);
    if(!peerUid && currentUser?.uid && !id.startsWith('chat_')){
      const prefix=currentUser.uid+'_';
      const suffix='_'+currentUser.uid;
      if(id.startsWith(prefix)) peerUid=id.slice(prefix.length);
      else if(id.endsWith(suffix)) peerUid=id.slice(0,-suffix.length);
    }
    if(peerUid && typeof dmChatIdFor==='function'){
      const canon=dmChatIdFor(peerUid);
      if(canon && id!==canon) id=canon;
    }
  }
  if(id.startsWith('chat_self_') && typeof ensureSelfChatDoc==='function'){
    await ensureSelfChatDoc();
  }
  if(id.startsWith('chat_chaupaal_') && typeof ensureChaupaalChatDoc==='function'){
    await ensureChaupaalChatDoc();
  }

  const chatReady = document.getElementById('activeChatScreen')?.dataset?.chatReady==='1'
    && window.currentOpenChat
    && (window.currentOpenChat.firestoreId===id || window.currentOpenChat.id===id || window.currentOpenChat.firestoreId===chatId || window.currentOpenChat.id===chatId);
  const chatRef=db.collection('chats').doc(id);

  if(!chatReady){
    let chatSnap=await chatRef.get();
    if(!chatSnap.exists && peerUid && typeof ensurePeerDmChat==='function'){
      await ensurePeerDmChat(peerUid);
      chatSnap=await chatRef.get();
    }
    if(!chatSnap.exists){
      const err=Object.assign(new Error('Chat not ready'), { code: 'CHAT_NOT_READY' });
      if(typeof reportClientError==='function'){
        reportClientError({feature:'dm_send',chatId:id,code:err.code});
      }
      throw err;
    }
    const parts=Array.isArray(chatSnap.data()?.participants)?chatSnap.data().participants.map(String):[];
    if(!isGroup && peerUid && (!parts.includes(currentUser.uid)||!parts.includes(String(peerUid)))){
      if(typeof ensurePeerDmChat==='function'){
        await ensurePeerDmChat(peerUid);
        chatSnap=await chatRef.get();
      }
      const parts2=Array.isArray(chatSnap.data()?.participants)?chatSnap.data().participants.map(String):[];
      if(!parts2.includes(currentUser.uid)||(peerUid&&!parts2.includes(String(peerUid)))){
        const err=Object.assign(new Error('Chat participants not ready'), { code: 'CHAT_NOT_READY' });
        if(typeof reportClientError==='function'){
          reportClientError({feature:'dm_send',chatId:id,code:err.code});
        }
        throw err;
      }
    }
  } else if(peerUid && typeof ensurePeerDmChat==='function'){
    // Background verify once per chat for ready sessions — don't block send
    window.__chaupaalEnsuredDmSend = window.__chaupaalEnsuredDmSend || new Set();
    if(!window.__chaupaalEnsuredDmSend.has(id)){
      window.__chaupaalEnsuredDmSend.add(id);
      ensurePeerDmChat(peerUid).catch(()=>{});
    }
  }
  if(window.currentOpenChat && (window.currentOpenChat.firestoreId===chatId||window.currentOpenChat.id===chatId||window.currentOpenChat.firestoreId===id||window.currentOpenChat.id===id)){
    window.currentOpenChat.firestoreId=id;
    window.currentOpenChat.id=id;
  }
  const body=String(text||'').trim();
  if(!body && !(music&&music.title) && !attachment) return;
  const payload={
    text:body||(music?.title?`🎵 ${music.title}`:(attachment?.type==='photo'?'📷 Photo':attachment?.type==='file'?'📄 File':attachment?.type==='location'?'📍 Location':attachment?.type==='radio_share'?'📻 Radio':attachment?.type==='muqabala_challenge'?'⚔️ Challenge':attachment?.type==='game_challenge'?'🎮 Challenge':attachment?.type==='story'?'Sent a story':attachment?.type==='duniya_post'?'Sent a post':attachment?.type==='peepal_post'?'Sent a discussion':attachment?.type==='mehfil_invite'?(body||'Join Mehfil'):attachment?.type==='gif'?'GIF':attachment?.type==='sticker'?'Sticker':attachment?.type==='meme'?'Meme':attachment?.type==='clip'?'Clip':'')),
    uid:currentUser.uid,
    name:userProfile?.name||currentUser.displayName||'You',
    avatar:currentUser.photoURL||'',
    profileType:(typeof ownProfileType==='function'?ownProfileType():(typeof getProfileType==='function'?getProfileType():'personal')),
    ts:firebase.firestore.FieldValue.serverTimestamp()
  };
  if(clientTempId) payload.clientTempId=String(clientTempId).slice(0,80);
  if(music && typeof music==='object' && music.title){
    payload.music={
      title:String(music.title||'').slice(0,160),
      artist:String(music.artist||'Unknown artist').slice(0,160),
      thumbnail:String(music.thumbnail||'').slice(0,2048),
      previewUrl:music.previewUrl?String(music.previewUrl).slice(0,2048):null,
      source:['jiosaavn','itunes','none'].includes(music.source)?music.source:(music.previewUrl?'jiosaavn':'none'),
    };
  }
  if(attachment && typeof attachment==='object' && attachment.type){
    if(attachment.type==='location' && typeof normalizeLocationAttachment==='function'){
      const loc=normalizeLocationAttachment(attachment);
      if(loc) payload.attachment=loc;
    } else if(attachment.type==='location'){
      const lat=Number(attachment.lat);
      const lng=Number(attachment.lng);
      if(Number.isFinite(lat) && Number.isFinite(lng)){
        payload.attachment={
          type:'location',
          mode:['current','place','pin','live'].includes(attachment.mode)?attachment.mode:'pin',
          lat, lng,
          placeName:attachment.placeName?String(attachment.placeName).slice(0,120):null,
          address:attachment.address?String(attachment.address).slice(0,240):null,
          label:attachment.label?String(attachment.label).slice(0,160):'Location',
          liveShareId:attachment.liveShareId?String(attachment.liveShareId).slice(0,80):null,
          expiresAt:attachment.expiresAt!=null?(Number(attachment.expiresAt)||null):null,
          durationMs:Number(attachment.durationMs)||null,
          startedAt:attachment.startedAt!=null?(Number(attachment.startedAt)||null):null,
        };
      }
    } else {
      payload.attachment={
        type:String(attachment.type).slice(0,40),
        url:attachment.url?String(attachment.url).slice(0,2048):null,
        name:attachment.name?String(attachment.name).slice(0,160):null,
        width:Number(attachment.width)||null,
        height:Number(attachment.height)||null,
        kind:attachment.kind?String(attachment.kind).slice(0,16):null,
        previewUrl:attachment.previewUrl?String(attachment.previewUrl).slice(0,2048):(attachment.preview?String(attachment.preview).slice(0,2048):null),
        title:attachment.title?String(attachment.title).slice(0,120):null,
        mime:attachment.mime?String(attachment.mime).slice(0,64):null,
        duration:Number(attachment.duration)||null,
        challengeId:attachment.challengeId?String(attachment.challengeId).slice(0,80):null,
        questions:Array.isArray(attachment.questions)?attachment.questions.slice(0,20):null,
        timerSeconds:Number(attachment.timerSeconds)||null,
        label:attachment.label?String(attachment.label).slice(0,120):null,
        mood:attachment.mood?String(attachment.mood).slice(0,40):null,
        genre:attachment.genre?String(attachment.genre).slice(0,40):null,
        language:attachment.language?String(attachment.language).slice(0,16):null,
        sample:attachment.sample&&typeof attachment.sample==='object'?{
          title:String(attachment.sample.title||'').slice(0,160),
          artist:String(attachment.sample.artist||'').slice(0,160),
          thumbnail:String(attachment.sample.thumbnail||'').slice(0,2048),
        }:null,
        matchId:attachment.matchId?String(attachment.matchId).slice(0,120):null,
        gameType:attachment.gameType?String(attachment.gameType).slice(0,40):null,
        status:attachment.status?String(attachment.status).slice(0,20):null,
        fromUid:attachment.fromUid?String(attachment.fromUid).slice(0,128):null,
        toUid:attachment.toUid?String(attachment.toUid).slice(0,128):null,
        expiresAt:attachment.expiresAt!=null?(Number(attachment.expiresAt)||null):null,
        gameName:attachment.gameName?String(attachment.gameName).slice(0,80):null,
        gameIcon:attachment.gameIcon?String(attachment.gameIcon).slice(0,8):null,
        gameColor:attachment.gameColor?String(attachment.gameColor).slice(0,16):null,
        mode:attachment.mode?String(attachment.mode).slice(0,40):null,
        stake:Number(attachment.stake)||null,
        timeControl:attachment.timeControl?String(attachment.timeControl).slice(0,40):null,
        storyId:attachment.storyId?String(attachment.storyId).slice(0,180):null,
        destination:attachment.destination==='baithak'?'baithak':(attachment.destination==='duniya'?'duniya':null),
        thumb:attachment.thumb?String(attachment.thumb).slice(0,2048):null,
        ownerUid:attachment.ownerUid?String(attachment.ownerUid).slice(0,128):null,
        mediaType:attachment.mediaType?String(attachment.mediaType).slice(0,16):null,
      };
    }
  }
  try{
    const msgRef=await db.collection('chats').doc(id).collection('messages').add(payload);
    if(typeof indexChatMessageForSearch==='function'){
      indexChatMessageForSearch({
        chatId:id,
        messageId:msgRef.id,
        text:body,
        ts:Date.now(),
      }).catch(()=>{});
    }else if(typeof BaithakSearch!=='undefined'&&typeof BaithakSearch.indexChatMessageForSearch==='function'){
      BaithakSearch.indexChatMessageForSearch({
        chatId:id,
        messageId:msgRef.id,
        text:body,
        ts:Date.now(),
      }).catch(()=>{});
    }
    const nowMs = Date.now();
    const previewText = String(payload.text || '').slice(0, 120);
    const chatPatch = {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      preview: previewText,
      lastMessageAt: nowMs,
    };
    const open = window.currentOpenChat;
    let participants = Array.isArray(open?.participants) ? open.participants.slice() : [];
    if (!participants.length && currentUser?.uid) {
      const openPeer = open?.uid || open?.peerUid || open?.otherUid;
      let inferred = openPeer ? String(openPeer) : '';
      if (!inferred && !id.startsWith('chat_')) {
        const prefix = currentUser.uid + '_';
        const suffix = '_' + currentUser.uid;
        if (id.startsWith(prefix)) inferred = id.slice(prefix.length);
        else if (id.endsWith(suffix)) inferred = id.slice(0, -suffix.length);
      }
      if (inferred) participants = [currentUser.uid, inferred].sort();
    }
    await db.collection('chats').doc(id).set(chatPatch, { merge: true }).catch((e3) => {
      if (typeof reportClientError === 'function') reportClientError({ feature: 'streak_patch', message: e3?.message || String(e3) });
    });
    if(participants.length){
      await db.collection('chats').doc(id).set({ participants }, { merge: true }).catch(()=>{});
    }
    if (window.currentOpenChat && (window.currentOpenChat.firestoreId === id || window.currentOpenChat.id === id || window.currentOpenChat.firestoreId === chatId || window.currentOpenChat.id === chatId)) {
      window.currentOpenChat.lastMessageAt = nowMs;
      if (!window.currentOpenChat.firstMessageAt) window.currentOpenChat.firstMessageAt = nowMs;
      window.currentOpenChat.updatedAt = nowMs;
      window.currentOpenChat.preview = previewText;
    }
    // 1:1 DM fan-out only (skip groups / self / Chaupaal system — avoid spam)
    const isSystem =
      id.startsWith('chat_self_') ||
      id.startsWith('chat_chaupaal_') ||
      id === 'chat_self';
    const others = participants.map(String).filter((u) => u && u !== currentUser.uid);
    if (!isSystem && others.length === 1 && typeof apiFetch === 'function') {
      apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: {
          action: 'notif_dm',
          chatId: id,
          recipientUid: others[0],
          preview: previewText || 'New message',
          actorName: payload.name,
          actorAvatar: payload.avatar || '👤',
        },
      }).catch(() => {});
    }
  }catch(e){
    console.warn('[chat] send failed', e?.message||e);
    throw e;
  }
}
