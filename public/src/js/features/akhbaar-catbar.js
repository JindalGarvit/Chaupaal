// ===================== AKHBAAR CATEGORY BAR =====================
let akhbaarActiveCat='all';

function initAkhbaarCatBar(){
  const bar=document.getElementById('akhbaarCatBar');
  if(!bar||bar.dataset.wired)return;
  bar.dataset.wired='1';
  // Add user custom categories
  myCategories.slice(0,5).forEach(cat=>{
    const btn=document.createElement('button');
    btn.className='akhbaar-cat-chip';btn.dataset.cat=cat.name;
    btn.textContent=cat.emoji+' '+cat.name;bar.insertBefore(btn,document.getElementById('akhbaarAddCat'));
  });
  bar.querySelectorAll('.akhbaar-cat-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      if(chip.dataset.cat==='add'){openAkhbaarCatAdd();return;}
      bar.querySelectorAll('.akhbaar-cat-chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');akhbaarActiveCat=chip.dataset.cat;
      filterReelByCategory(akhbaarActiveCat);
    });
  });
}

function filterReelByCategory(cat){
  const stage=document.getElementById('reelStage');if(!stage)return;
  stage.querySelectorAll('.reel-card').forEach(card=>{
    if(cat==='all'){card.style.display='';}
    else{const tag=card.querySelector('.q-tag');card.style.display=(tag&&tag.textContent.includes(cat))?'':'none';}
  });
}

function openAkhbaarCatAdd(){
  const bar=document.getElementById('akhbaarCatBar');
  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:22px;z-index:100;';
  sheet.innerHTML=`
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;margin-bottom:4px;">Add a Category to Akhbaar</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px;">AI will generate news & questions for it daily</div>
    <div class="cat-search-wrap" style="margin-bottom:14px;">
      <input class="cat-search-input" id="akhbaarCatInput" placeholder="🔍 Search or type a category...">
      <div class="cat-suggestions" id="akhbaarCatSuggestions"></div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
      ${CATEGORY_SUGGESTIONS.slice(0,10).map(c=>`<button class="akhbaar-cat-chip" data-name="${c.name}" data-emoji="${c.emoji}">${c.emoji} ${c.name}</button>`).join('')}
    </div>
    <button id="closeAkhbaarCatSheet" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  document.getElementById('closeAkhbaarCatSheet').addEventListener('click',()=>sheet.remove());
  sheet.querySelectorAll('[data-name]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const name=btn.dataset.name,emoji=btn.dataset.emoji;
      addCategory(name,emoji);
      // Add to bar
      const newChip=document.createElement('button');
      newChip.className='akhbaar-cat-chip';newChip.dataset.cat=name;newChip.textContent=emoji+' '+name;
      bar.insertBefore(newChip,document.getElementById('akhbaarAddCat'));
      newChip.addEventListener('click',()=>{bar.querySelectorAll('.akhbaar-cat-chip').forEach(c=>c.classList.remove('active'));newChip.classList.add('active');akhbaarActiveCat=name;filterReelByCategory(name);});
      sheet.remove();showToast(`${emoji} ${name} added to Akhbaar!`);
    });
  });
}
