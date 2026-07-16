// ===================== i18n TRANSLATION SYSTEM =====================
const I18N = {
  en:{
    correct:'Correct!', wrong:'Not quite!', scroll_next:'Scroll up for next ↑',
    scroll_recap:'Scroll up for your recap ↑', flag:'⚑ Flag this question',
    flagged:'✓ Flagged — thanks!', read_more:'Read full article →',
    social_proof:'{{n}}% of players got this right',
    why:'Why:', source_news:'Source: aggregated news · {{date}}',
    source_personal:'Shared with permission from your friend',
    bonus_title:'Bonus Round', bonus_sub:"A few more — doesn't affect your streak",
    opp_thinking:'{{name}} is thinking…', opp_correct:'{{name}} answered correctly ✓',
    opp_wrong:'{{name}} got it wrong ✕', vs:'VS',
    philosophical_label:'💭 Think about this',
    type_answer:'Or type your own answer…', type_placeholder:'Share your thoughts…',
    send:'Send', philosophical_score_note:'No wrong answers here — your perspective matters ✨',
    timer_paused:'⏸ Timer paused while you type',
    matchmaking:'Finding a worthy opponent…', found:'Opponent found! 🎯',
    challenge_sent:'Sending challenge to {{name}}…', challenge_waiting:'Waiting for {{name}} to accept…',
    challenge_accepted:'{{name}} accepted! 🎯',
    muqabala_done:'Muqabala over!', you_won:'You won!', they_won:'{{name}} won this time',
    tie:"It's a tie!", rematch:'🔁 Rematch', chat_btn:'💬 Chat with {{name}}',
    done:'Done 🙏', day_streak:'{{n}} day streak',
    good_game:'That was a great Muqabala! Want to chat? 😊',
    chat_coming:'Baithak chat coming in next update! 🏠',
    categories_coming:'Category tabs — tap the + tab!',
    no_friends:'No friends yet — add one above! 👋',
    friends_loading:'Loading friends…', friends_error:'Could not load friends',
    logout:'Log out', sign_in:'Sign in / Sign up',
    sign_in_prompt:'Sign in to see your profile, add friends and challenge people.',
    streak_label:'day streak', wrap_coming:'Yearly Wrap comes on 25th December! 🎄',
    cat_empty:'No categories yet — add one above! 👆',
    ai_note:'✨ AI will generate news and questions for your category',
    ai_generating:'AI is generating content for "{{cat}}"…',
    cat_questions:'Questions', cat_news:'News', cat_ai:'AI Pick',
    read_full:'Read full article →', add_category:'Add category',
    my_categories:'My Categories', search_placeholder:'🔍 Search or type a new category…',
    remove_cat:'Remove', cat_added:'"{{name}}" added! AI is generating content… ✨',
    cat_exists:'"{{name}}" already exists! 😊',
    settings_saved:'Settings saved ✓',
  },
  hi:{
    correct:'Sahi!', wrong:'Galat!', scroll_next:'Aage badhne ke liye scroll karein ↑',
    scroll_recap:'Apna recap dekhne ke liye scroll karein ↑', flag:'⚑ Galat sawaal report karein',
    flagged:'✓ Report ho gaya — shukriya!', read_more:'Poori khabar padhein →',
    social_proof:'{{n}}% logon ne yahi jawab diya',
    why:'Kyon:', source_news:'Srot: news · {{date}}',
    source_personal:'Dost ki anumati se share kiya gaya',
    bonus_title:'Bonus Round', bonus_sub:'Kuch aur sawaal — streak par asar nahi',
    opp_thinking:'{{name}} soch raha hai…', opp_correct:'{{name}} ne sahi jawab diya ✓',
    opp_wrong:'{{name}} galat tha ✕', vs:'VS',
    philosophical_label:'💭 Sochne wala sawaal',
    type_answer:'Ya apna jawab likhein…', type_placeholder:'Apni baat kahein…',
    send:'Bhejein', philosophical_score_note:'Yahan koi galat jawab nahi — aapki soch maayni rakhti hai ✨',
    timer_paused:'⏸ Timer ruka hua hai',
    matchmaking:'Ek achha prativaadi dhundh rahe hain…', found:'Prativaadi mil gaya! 🎯',
    challenge_sent:'{{name}} ko challenge bheja ja raha hai…', challenge_waiting:'{{name}} ke jawab ka intezaar hai…',
    challenge_accepted:'{{name}} ne accept kar liya! 🎯',
    muqabala_done:'Muqabala khatam!', you_won:'Aap jeete!', they_won:'{{name}} jeeta is baar',
    tie:'Barabar!', rematch:'🔁 Phir se Muqabala', chat_btn:'💬 {{name}} se baat karein',
    done:'Theek hai 🙏', day_streak:'{{n}} din ki streak',
    good_game:'Achha Muqabala raha! Baat karein? 😊',
    chat_coming:'Baithak abhi aa rahi hai! 🏠',
    categories_coming:'Categories — + tab mein jaayein!',
    no_friends:'Koi dost nahi — upar se add karein! 👋',
    friends_loading:'Dost load ho rahe hain…', friends_error:'Dost load nahi ho sake',
    logout:'Log out karein', sign_in:'Sign in / Sign up karein',
    sign_in_prompt:'Profile, dost aur Muqabala ke liye sign in karein.',
    streak_label:'din ki streak', wrap_coming:'Yearly Wrap 25 December ko aayega! 🎄',
    cat_empty:'Abhi koi category nahi — upar se add karein! 👆',
    ai_note:'✨ AI aapki category ke liye content banayega',
    ai_generating:'AI "{{cat}}" ke liye content bana raha hai…',
    cat_questions:'Sawaal', cat_news:'Khabar', cat_ai:'AI Pick',
    read_full:'Poori khabar →', add_category:'Category add karein',
    my_categories:'Meri Categories', search_placeholder:'🔍 Dhoondhein ya naya likhein…',
    remove_cat:'Hatayein', cat_added:'"{{name}}" add ho gayi! ✨',
    cat_exists:'"{{name}}" pehle se hai! 😊',
    settings_saved:'Settings save ho gayi ✓',
  },
  ta:{
    correct:'Seri!', wrong:'Thevaiyilla!', scroll_next:'Mele scroll seyyungal ↑',
    scroll_recap:'Ungal recap paarkka scroll seyyungal ↑', flag:'⚑ Thappu kelvi report seyyungal',
    flagged:'✓ Report aaittu — nandri!', read_more:'Muzhuma katturai paadungal →',
    social_proof:'{{n}}% peyar inthak kelviykku vithar',
    why:'Yen:', source_news:'Aankaaram: news · {{date}}',
    source_personal:'Naanbarin anumathiyudan pagirappagiyathu',
    bonus_title:'Bonus Suround', bonus_sub:'Sila kelvikal kooda — streak maaraathu',
    opp_thinking:'{{name}} yosikkiraar…', opp_correct:'{{name}} sari vittar ✓',
    opp_wrong:'{{name}} thappu vittar ✕', vs:'VS',
    philosophical_label:'💭 Yosikkavum',
    type_answer:'Ungal sontham padhilai ezhuthungal…', type_placeholder:'Ungal kanavennil pagirungal…',
    send:'Anuppu', philosophical_score_note:'Innga thappu illai — ungal aazhmaiyaana kaanam mukkiyam ✨',
    timer_paused:'⏸ Neenga ezhuthum pothu timer niruthapaddu uLLadu',
    matchmaking:'Oru nanmaiyaana edirali thedukiren…', found:'Edirali kidaittaar! 🎯',
    challenge_sent:'{{name}} ku challenge anuppukirom…', challenge_waiting:'{{name}} ethirppaarkirom…',
    challenge_accepted:'{{name}} ottukollanar! 🎯',
    muqabala_done:'Muqabala mudinthathu!', you_won:'Neenga venneer!', they_won:'{{name}} inthavaarai vendaar',
    tie:'Samaanamaana!', rematch:'🔁 Marudubaadum', chat_btn:'💬 {{name}} udan pesungal',
    done:'Seri 🙏', day_streak:'{{n}} naal streak',
    good_game:'Nallaoru Muqabala! Pesalama? 😊',
    chat_coming:'Baithak vinaadiyil varugiradu! 🏠',
    categories_coming:'Categories — + tab il paadungal!',
    no_friends:'Nanpargal illai — melirunthu serungal! 👋',
    friends_loading:'Nanpargal lood aagiral…', friends_error:'Nanpargal lood aagavillai',
    logout:'Log out seyyungal', sign_in:'Sign in / Sign up',
    sign_in_prompt:'Profile, nanpargal, Muqabala-kkaaga sign in seyyungal.',
    streak_label:'naal streak', wrap_coming:'Yearly Wrap December 25 il varugiradu! 🎄',
    cat_empty:'Ithuvare categories illai — melirunthu serungal! 👆',
    ai_note:'✨ AI ungal category-kkaaga content thiarkkapadutham',
    ai_generating:'AI "{{cat}}" -kkaaga content thiarkkiradu…',
    cat_questions:'Kelvikal', cat_news:'Saethi', cat_ai:'AI Thervu',
    read_full:'Muzhuma katturai →', add_category:'Category serungal',
    my_categories:'En Categories', search_placeholder:'🔍 Thedu allathu pudhiyathai ezhuthungal…',
    remove_cat:'Neekku', cat_added:'"{{name}}" serkkappattadu! ✨',
    cat_exists:'"{{name}}" munbe irukkiradu! 😊',
    settings_saved:'Settings semiththaadu ✓',
  },
};

// Fallback to English for unlisted languages
function t(key, vars={}){
  const lang = currentLang||'en';
  const dict = I18N[lang] || I18N.en;
  let str = dict[key] || I18N.en[key] || key;
  Object.entries(vars).forEach(([k,v])=>{ str=str.replace(`{{${k}}}`,v); });
  return str;
}

// Translate question text + options via Claude API (cached per session)
const translationCache = {}; // also backed by localStorage via readCache/writeCache
async function translateContent(text, targetLang){
  if(!text||targetLang==='en') return text;
  const cacheKey = `${targetLang}:${text.slice(0,50)}`;
  if(translationCache[cacheKey]) return translationCache[cacheKey];
  const lsCached = readCache('translate', cacheKey);
  if(lsCached){ translationCache[cacheKey]=lsCached; return lsCached; }
  try{
    const data = await callAnthropic({
        model:"claude-haiku-4-5-20251001",max_tokens:500,
        system:`Translate the following text to ${targetLang}. Return ONLY the translated text, nothing else.`,
        messages:[{role:"user",content:text}]
      });
    const result = data.content?.map(b=>b.text||'').join('')||text;
    translationCache[cacheKey] = result;
    writeCache('translate', cacheKey, result);
    return result;
  }catch(e){ return text; }
}

const CATEGORY_SUGGESTIONS = [
  {emoji:'🏏',name:'Cricket'},{emoji:'🎬',name:'Bollywood'},{emoji:'🍳',name:'Food & Recipes'},
  {emoji:'🚗',name:'Automobiles'},{emoji:'📱',name:'Gadgets'},{emoji:'💰',name:'Personal Finance'},
  {emoji:'🎮',name:'Gaming'},{emoji:'✈️',name:'Travel'},{emoji:'🌿',name:'Environment'},
  {emoji:'🎵',name:'Music'},{emoji:'⚽',name:'Football'},{emoji:'🏋️',name:'Fitness'},
  {emoji:'👗',name:'Fashion'},{emoji:'🔬',name:'Science'},{emoji:'🎭',name:'Entertainment'},
  {emoji:'📚',name:'Education'},{emoji:'🏠',name:'Real Estate'},{emoji:'🌾',name:'Agriculture'},
  {emoji:'⚖️',name:'Law & Justice'},{emoji:'🎨',name:'Art & Culture'},
];

let myCategories = JSON.parse(localStorage.getItem('chaupaal_categories')||'[]');

function saveCategoriesLocal(){
  try{localStorage.setItem('chaupaal_categories',JSON.stringify(myCategories));}catch(e){}
}

function getCategoryColor(name){
  const colors=['#E63946','#2A9D8F','#E9C46A','#F4A261','#264653','#8134AF','#2E8B57','#C72E3A','#0077B6','#7B2D8B'];
  let hash=0;for(let i=0;i<name.length;i++)hash=name.charCodeAt(i)+((hash<<5)-hash);
  return colors[Math.abs(hash)%colors.length];
}

function getCategoryEmoji(name){
  const match = CATEGORY_SUGGESTIONS.find(s=>s.name.toLowerCase()===name.toLowerCase());
  if(match) return match.emoji;
  // derive from first char category
  const map={c:'🎯',b:'💼',f:'🍽️',g:'🎮',h:'🏠',i:'💡',j:'⚖️',l:'📚',m:'🎵',n:'📰',p:'💰',r:'🚀',s:'⚡',t:'💻',w:'🌍',a:'🎨',e:'🌿',v:'🎬',k:'🏏',z:'🔭'};
  return map[name[0].toLowerCase()]||'✨';
}

function initCategoriesTab(){
  const input = document.getElementById('catSearchInput');
  const suggestions = document.getElementById('catSuggestions');
  if(!input) return;

  input.addEventListener('input', ()=>{
    const q = input.value.trim().toLowerCase();
    if(!q){ suggestions.classList.remove('show'); return; }
    const filtered = CATEGORY_SUGGESTIONS.filter(s=>s.name.toLowerCase().includes(q));
    const custom = {emoji:getCategoryEmoji(input.value),name:input.value.trim()};
    const items = [...filtered.slice(0,5)];
    if(!filtered.find(f=>f.name.toLowerCase()===q)) items.push({...custom,custom:true});
    suggestions.innerHTML = items.map(s=>`
      <div class="cat-suggestion-item" data-name="${s.name}" data-emoji="${s.emoji}">
        <span class="cat-suggestion-emoji">${s.emoji}</span>
        <span>${s.name}${s.custom?' <span style="font-size:11px;color:var(--muted);">— Custom</span>':''}</span>
      </div>
    `).join('');
    suggestions.classList.add('show');
    suggestions.querySelectorAll('.cat-suggestion-item').forEach(item=>{
      item.addEventListener('click',()=>{
        addCategory(item.dataset.name, item.dataset.emoji);
        input.value='';suggestions.classList.remove('show');
      });
    });
  });

  input.addEventListener('keypress', e=>{
    if(e.key==='Enter'&&input.value.trim()){
      addCategory(input.value.trim(), getCategoryEmoji(input.value.trim()));
      input.value='';suggestions.classList.remove('show');
    }
  });

  document.addEventListener('click',e=>{if(!e.target.closest('.cat-search-wrap'))suggestions.classList.remove('show');});
  renderMyCatsList();
}

function addCategory(name, emoji){
  if(myCategories.find(c=>c.name.toLowerCase()===name.toLowerCase())){
    showToast(t('cat_exists',{name}));return;
  }
  const cat={id:`cat_${Date.now()}`,name,emoji,color:getCategoryColor(name),addedAt:new Date().toISOString()};
  myCategories.unshift(cat);saveCategoriesLocal();
  if(db&&currentUser){db.collection('users').doc(currentUser.uid).update({customCategories:firebase.firestore.FieldValue.arrayUnion(cat)}).catch(()=>{});}
  renderMyCatsList();
  showToast(t('cat_added',{name}));
}

function removeCategory(id){
  myCategories=myCategories.filter(c=>c.id!==id);saveCategoriesLocal();renderMyCatsList();
}

function renderMyCatsList(){
  const list=document.getElementById('myCatsList');if(!list)return;
  if(!myCategories.length){list.innerHTML=`<div class="cat-empty">${t('cat_empty')}</div>`;return;}
  list.innerHTML='';
  myCategories.forEach(cat=>{
    const card=document.createElement('div');card.className='cat-card';
    card.innerHTML=`
      <div class="cat-card-header">
        <div class="cat-card-icon" style="background:${cat.color}22;">${cat.emoji}</div>
        <div>
          <div class="cat-card-name">${cat.name}</div>
          <div class="cat-card-meta">AI content • Just added</div>
        </div>
        <button class="cat-card-remove" data-id="${cat.id}">🗑️</button>
      </div>
      <div class="cat-preview-strip">
        <div class="cat-preview-item"><span class="pi-num">10</span>Sawaal</div>
        <div class="cat-preview-item"><span class="pi-num">📰</span>Khabar</div>
        <div class="cat-preview-item"><span class="pi-num">✨</span>AI Pick</div>
      </div>
    `;
    card.querySelector('.cat-card-remove').addEventListener('click',e=>{e.stopPropagation();removeCategory(cat.id);});
    card.addEventListener('click',e=>{if(!e.target.closest('.cat-card-remove'))openCategoryDetail(cat);});
    list.appendChild(card);
  });
}
