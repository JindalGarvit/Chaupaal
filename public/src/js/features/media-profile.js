// ===================== RICH MEDIA PROFILE =====================

// Override the Photos section in profile Social tab to include video + voice
function renderProfileMediaSection(el){
  const mediaItems = JSON.parse(localStorage.getItem('chaupaal_profile_media')||'[]');
  const section = document.createElement('div');
  section.style.cssText='margin-top:16px;border-top:1px solid var(--line);padding-top:16px;';
  section.innerHTML=`
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;margin-bottom:12px;">📸 Media & Voice</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px;line-height:1.5;">
      Add photos, short videos (≤60s), or voice introductions. Only visible based on your privacy settings.
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      <label style="display:flex;align-items:center;gap:6px;padding:10px 14px;background:var(--cream);border:2px solid var(--line);border-radius:12px;cursor:pointer;font-weight:600;font-size:13px;">
        📷 Photo<input type="file" accept="image/*" id="profileMediaPhoto" style="display:none;" multiple>
      </label>
      <label style="display:flex;align-items:center;gap:6px;padding:10px 14px;background:var(--cream);border:2px solid var(--line);border-radius:12px;cursor:pointer;font-weight:600;font-size:13px;">
        🎬 Video<input type="file" accept="video/*" id="profileMediaVideo" style="display:none;">
      </label>
      <button id="profileVoiceBtn" style="padding:10px 14px;background:var(--cream);border:2px solid var(--line);border-radius:12px;font-weight:600;font-size:13px;cursor:pointer;">🎙️ Voice note</button>
    </div>
    <div id="profileMediaGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;"></div>
    <div id="voiceRecorder" style="display:none;background:rgba(230,57,70,0.05);border:2px solid rgba(230,57,70,0.2);border-radius:14px;padding:14px;margin-top:10px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;">🎙️ Record a voice introduction</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">Max 60 seconds. Tell people about yourself in your own voice.</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button id="voiceRecordStart" style="padding:10px 16px;background:var(--red);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">⏺ Record</button>
        <button id="voiceRecordStop" style="padding:10px 16px;background:var(--cream);border:2px solid var(--line);border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;display:none;">⏹ Stop</button>
        <div id="voiceTimer" style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;color:var(--red);display:none;">0:00</div>
      </div>
      <audio id="voicePreview" style="width:100%;margin-top:10px;display:none;" controls></audio>
      <button id="voiceSave" style="display:none;width:100%;padding:10px;background:var(--red);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;margin-top:8px;">✓ Save voice note</button>
    </div>
  `;
  el.appendChild(section);

  // Render existing media
  renderMediaGrid(mediaItems, section.querySelector('#profileMediaGrid'));

  // Photo upload
  section.querySelector('#profileMediaPhoto').addEventListener('change',e=>{
    [...e.target.files].slice(0,9-mediaItems.length).forEach(file=>{
      const reader=new FileReader();
      reader.onload=ev=>{
        const item={type:'photo',src:ev.target.result,ts:Date.now()};
        mediaItems.push(item);
        saveProfileMedia(mediaItems);
        renderMediaGrid(mediaItems, section.querySelector('#profileMediaGrid'));
      };reader.readAsDataURL(file);
    });
  });

  // Video upload
  section.querySelector('#profileMediaVideo').addEventListener('change',e=>{
    const file=e.target.files[0];if(!file)return;
    if(file.size>50*1024*1024){showToast('Video must be under 50MB');return;}
    const reader=new FileReader();
    reader.onload=ev=>{
      const item={type:'video',src:ev.target.result,ts:Date.now()};
      mediaItems.push(item);
      saveProfileMedia(mediaItems);
      renderMediaGrid(mediaItems, section.querySelector('#profileMediaGrid'));
    };reader.readAsDataURL(file);
  });

  // Voice recorder
  section.querySelector('#profileVoiceBtn').addEventListener('click',()=>{
    const vr=section.querySelector('#voiceRecorder');
    vr.style.display=vr.style.display==='none'?'block':'none';
  });

  let mediaRecorder=null,audioChunks=[],voiceTimerInterval=null,voiceSecs=0;

  section.querySelector('#voiceRecordStart').addEventListener('click',async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      mediaRecorder=new MediaRecorder(stream);audioChunks=[];
      mediaRecorder.ondataavailable=e=>audioChunks.push(e.data);
      mediaRecorder.onstop=()=>{
        const blob=new Blob(audioChunks,{type:'audio/webm'});
        const url=URL.createObjectURL(blob);
        const preview=section.querySelector('#voicePreview');
        preview.src=url;preview.style.display='block';
        section.querySelector('#voiceSave').style.display='block';
        section.querySelector('#voiceSave').onclick=()=>{
          const reader=new FileReader();
          reader.onload=ev=>{
            const item={type:'voice',src:ev.target.result,ts:Date.now(),duration:voiceSecs};
            mediaItems.push(item);
            saveProfileMedia(mediaItems);
            renderMediaGrid(mediaItems,section.querySelector('#profileMediaGrid'));
            section.querySelector('#voiceRecorder').style.display='none';
            showToast('Voice note saved! 🎙️');
          };reader.readAsDataURL(blob);
        };
        stream.getTracks().forEach(t=>t.stop());
      };
      mediaRecorder.start();
      section.querySelector('#voiceRecordStart').style.display='none';
      section.querySelector('#voiceRecordStop').style.display='block';
      section.querySelector('#voiceTimer').style.display='block';
      voiceSecs=0;
      voiceTimerInterval=setInterval(()=>{
        voiceSecs++;
        const m=Math.floor(voiceSecs/60),s=voiceSecs%60;
        section.querySelector('#voiceTimer').textContent=`${m}:${s<10?'0':''}${s}`;
        if(voiceSecs>=60){clearInterval(voiceTimerInterval);mediaRecorder?.stop();section.querySelector('#voiceRecordStop').click();}
      },1000);
    }catch(e){showToast('Microphone access needed for voice notes');}
  });

  section.querySelector('#voiceRecordStop').addEventListener('click',()=>{
    clearInterval(voiceTimerInterval);
    mediaRecorder?.stop();
    section.querySelector('#voiceRecordStart').style.display='block';
    section.querySelector('#voiceRecordStop').style.display='none';
    section.querySelector('#voiceTimer').style.display='none';
  });
}

function renderMediaGrid(items, gridEl){
  if(!gridEl)return;
  gridEl.innerHTML=items.map((item,i)=>{
    if(item.type==='photo') return`<div style="aspect-ratio:1;border-radius:10px;overflow:hidden;position:relative;background:var(--line);">
      <img src="${item.src}" style="width:100%;height:100%;object-fit:cover;">
      <button onclick="removeProfileMedia(${i})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.5);border:none;color:#fff;border-radius:50%;width:22px;height:22px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
    </div>`;
    if(item.type==='video') return`<div style="aspect-ratio:1;border-radius:10px;overflow:hidden;position:relative;background:#000;">
      <video src="${item.src}" style="width:100%;height:100%;object-fit:cover;" muted></video>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
        <div style="background:rgba(0,0,0,0.5);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;">▶</div>
      </div>
      <button onclick="removeProfileMedia(${i})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.5);border:none;color:#fff;border-radius:50%;width:22px;height:22px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
    </div>`;
    if(item.type==='voice') return`<div style="aspect-ratio:1;border-radius:10px;background:linear-gradient(135deg,var(--red),#8134AF);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;position:relative;cursor:pointer;" onclick="playVoiceNote('${item.src}')">
      <span style="font-size:28px;">🎙️</span>
      <span style="font-size:10px;font-weight:700;color:#fff;">${item.duration?Math.floor(item.duration/60)+':'+(item.duration%60<10?'0':'')+(item.duration%60)+'':'Voice'}</span>
      <button onclick="event.stopPropagation();removeProfileMedia(${i})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.5);border:none;color:#fff;border-radius:50%;width:22px;height:22px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
    </div>`;
    return'';
  }).join('');
  // Add "add more" cell if space
  if(items.length<9) gridEl.innerHTML+=`<label style="aspect-ratio:1;border-radius:10px;border:2px dashed var(--line);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:24px;color:var(--muted);">＋<input type="file" accept="image/*,video/*" style="display:none;" onchange="handleProfileMediaAdd(event)"></label>`;
}

function saveProfileMedia(items){
  try{localStorage.setItem('chaupaal_profile_media',JSON.stringify(items));}catch(e){}
}

window.removeProfileMedia=function(idx){
  const items=JSON.parse(localStorage.getItem('chaupaal_profile_media')||'[]');
  items.splice(idx,1);saveProfileMedia(items);
  renderProfileModal();
};

window.playVoiceNote=function(src){
  const existing=document.getElementById('globalVoicePlayer');
  if(existing)existing.remove();
  const audio=document.createElement('audio');
  audio.id='globalVoicePlayer';audio.src=src;audio.controls=true;audio.autoplay=true;
  audio.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:999;border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,0.3);width:80%;max-width:300px;';
  document.querySelector('.device').appendChild(audio);
  audio.onended=()=>audio.remove();
};

window.handleProfileMediaAdd=function(e){
  const file=e.target.files[0];if(!file)return;
  const items=JSON.parse(localStorage.getItem('chaupaal_profile_media')||'[]');
  const reader=new FileReader();
  reader.onload=ev=>{
    items.push({type:file.type.startsWith('video')?'video':'photo',src:ev.target.result,ts:Date.now()});
    saveProfileMedia(items);renderProfileModal();
  };reader.readAsDataURL(file);
};

// renderSection lives inside renderProfileModal's closure — hook Personal tab via MutationObserver
const _profileMediaObserver = new MutationObserver(()=>{
  const personalTab = document.querySelector('.profile-section-tab[data-sec="Personal"].active');
  const content = document.getElementById('profileSectionContent');
  if(personalTab && content && !content.querySelector('#profileMediaGrid')){
    renderProfileMediaSection(content);
  }
});
const _profileContent = document.getElementById('profileContent');
if(_profileContent) _profileMediaObserver.observe(_profileContent, {childList:true, subtree:true});

