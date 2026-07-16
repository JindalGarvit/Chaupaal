// ===================== CATEGORY DETAIL (AI-powered) =====================
function openCategoryDetail(cat){
  const detail=document.getElementById('catDetail');
  detail.classList.remove('hidden');
  let activeTab='news';
  detail.innerHTML=`
    <div class="cat-detail-header">
      <button class="cat-detail-back" id="catDetailBack">←</button>
      <span>${cat.emoji}</span>
      <div class="cat-detail-title">${cat.name}</div>
    </div>
    <div class="cat-detail-tabs">
      <button class="cat-detail-tab active" data-tab="news">📰 Khabar</button>
      <button class="cat-detail-tab" data-tab="mcq">🎯 Sawaal</button>
      <button class="cat-detail-tab" data-tab="personality">🧠 Aapka Profile</button>
    </div>
    <div class="cat-detail-body" id="catDetailBody"></div>
  `;
  document.getElementById('catDetailBack').addEventListener('click',()=>detail.classList.add('hidden'));
  detail.querySelectorAll('.cat-detail-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      detail.querySelectorAll('.cat-detail-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');activeTab=tab.dataset.tab;loadCatDetailTab(cat,activeTab);
    });
  });
  loadCatDetailTab(cat,'news');
}

// ===================== COST OPTIMISATION: CACHE SYSTEM =====================
// Align with Vercel Cron (Hobby = daily at 02:00 UTC).
// For a 6h cadence: use Pro (`0 */6 * * *`) or an external cron hitting this endpoint,
// then set CAT_CACHE_TTL_MS / REFRESH_MS back to 6 * 60 * 60 * 1000.
const CAT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CAT_CACHE_VERSION = 'v2';
// Pause all live Claude calls for Khabar/Sawaal (cron is also paused). Flip to false to resume.
const CAT_LIVE_AI_PAUSED = true;

function getCacheKey(type, id){
  // v2: grounded-link era; include version so stale pre-grounded local caches never apply
  return `chaupaal_cache_${CAT_CACHE_VERSION}_${type}_${id.toLowerCase().replace(/\s+/g,'_')}`;
}

function readCache(type, id, {ignoreTtl=false}={}){
  try{
    const raw=localStorage.getItem(getCacheKey(type,id));
    if(!raw)return null;
    const {data,ts,cacheVersion}=JSON.parse(raw);
    if(cacheVersion && cacheVersion!==CAT_CACHE_VERSION){ localStorage.removeItem(getCacheKey(type,id)); return null; }
    if(!ignoreTtl && Date.now()-ts > CAT_CACHE_TTL_MS){ localStorage.removeItem(getCacheKey(type,id)); return null; }
    return data;
  }catch(e){return null;}
}

function writeCache(type, id, data){
  try{ localStorage.setItem(getCacheKey(type,id), JSON.stringify({data,ts:Date.now(),cacheVersion:CAT_CACHE_VERSION})); }catch(e){}
}

function isScheduledCatCacheFresh(doc, field){
  if(!doc || !doc.webGrounded || doc.cacheVersion!==CAT_CACHE_VERSION) return false;
  if(!doc[field] || !Array.isArray(doc[field]) || !doc[field].length) return false;
  const fieldTs = typeof doc[field+'Ts']==='number' ? doc[field+'Ts'] : doc.ts;
  if(typeof fieldTs!=='number') return false;
  return Date.now()-fieldTs < CAT_CACHE_TTL_MS;
}

function hasUsableCatCache(doc, field){
  return !!(doc && Array.isArray(doc[field]) && doc[field].length);
}

function renderCatPausedEmpty(body, catName, kind){
  if(typeof renderEmptyState==='function'){
    renderEmptyState(body, {
      icon:'📰',
      title:`${kind==='mcq'?'Sawaal':'Khabar'} for ${catName}`,
      message:'Check back later — fresh content isn’t generating right now.',
    });
    return;
  }
  body.innerHTML=`
    <div style="padding:28px 20px;text-align:center;color:var(--muted);line-height:1.5;">
      <div style="font-size:28px;margin-bottom:10px;">📰</div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;color:var(--ink);margin-bottom:6px;">
        ${kind==='mcq'?'Sawaal':'Khabar'} for ${catName}
      </div>
      <div style="font-size:13px;">Check back later — fresh content isn't generating right now.</div>
    </div>`;
}

async function fetchCategoryCacheDoc(catName){
  if(!db) return null;
  try{
    const snap = await db.collection('category_cache').doc(catName.toLowerCase()).get();
    return snap.exists ? snap.data() : null;
  }catch(e){ return null; }
}

function persistCategoryCacheDoc(catName, patch){
  if(!db) return;
  const now = Date.now();
  const stamped = { ...patch };
  if(patch.news) stamped.newsTs = now;
  if(patch.mcq) stamped.mcqTs = now;
  db.collection('category_cache').doc(catName.toLowerCase()).set({
    name: catName,
    ...stamped,
    ts: now,
    webGrounded: true,
    cacheVersion: CAT_CACHE_VERSION,
    generatedBy: 'client',
  }, {merge:true}).catch(()=>{});
}

// AI Keyboard daily limit
const AI_KB_LIMIT = 5;
const AI_KB_KEY = `chaupaal_ai_kb_${new Date().toISOString().split('T')[0]}`;
function getAiKbUsage(){ return parseInt(localStorage.getItem(AI_KB_KEY)||'0'); }
function incrementAiKbUsage(){ localStorage.setItem(AI_KB_KEY, getAiKbUsage()+1); }
function aiKbLimitReached(){ return getAiKbUsage() >= AI_KB_LIMIT; }

async function loadCatDetailTab(cat, tab){
  const body=document.getElementById('catDetailBody');
  if(typeof renderSkeleton==='function') renderSkeleton(body, {variant:'detail', count:1});
  else body.innerHTML=`<div class="ai-generating"><div class="ai-gen-text">Loading "${cat.name}"…</div></div>`;

  try{
    if(tab==='news') await loadCatNews(cat,body);
    else if(tab==='mcq') await loadCatMCQ(cat,body);
    else if(tab==='personality') renderPersonalityProfile(body);
  }catch(e){
    if(typeof renderErrorState==='function'){
      renderErrorState(body, {
        title: 'Couldn’t load content',
        message: (typeof friendlyError==='function'?friendlyError(e):'Please try again.'),
        onRetry: ()=>loadCatDetailTab(cat, tab),
      });
    } else {
      body.innerHTML=`<div style="padding:24px;text-align:center;color:var(--muted);">Content load nahi ho saka. Dobara try karo 🔄</div>`;
    }
  }
}

async function loadCatNews(cat, body){
  // While live AI is paused: serve any cached content indefinitely; never call Claude.
  if(CAT_LIVE_AI_PAUSED){
    const local = readCache('news', cat.name, {ignoreTtl:true});
    if(local){ body.innerHTML=''; renderCatNewsItems(local, body); return; }
    const doc = await fetchCategoryCacheDoc(cat.name);
    if(hasUsableCatCache(doc, 'news')){
      writeCache('news', cat.name, doc.news);
      body.innerHTML=''; renderCatNewsItems(doc.news, body); return;
    }
    renderCatPausedEmpty(body, cat.name, 'news');
    return;
  }

  const cached = readCache('news', cat.name);
  if(cached){ body.innerHTML=''; renderCatNewsItems(cached, body); return; }

  const doc = await fetchCategoryCacheDoc(cat.name);
  if(isScheduledCatCacheFresh(doc, 'news')){
    writeCache('news', cat.name, doc.news);
    body.innerHTML=''; renderCatNewsItems(doc.news, body); return;
  }

  let items = await generateCatNewsGrounded(cat);
  if(!items?.length) items = getSampleCatNews(cat);
  items = sanitizeCatNewsItems(items, cat.name);

  writeCache('news', cat.name, items);
  persistCategoryCacheDoc(cat.name, {news: items});
  body.innerHTML='';
  renderCatNewsItems(items, body);
}

function renderCatNewsItems(items, body){
  items.forEach(item=>{
    const card=document.createElement('div');card.className='cat-news-card';
    const linkHtml=item.link
      ? `<a class="cat-news-link" href="${item.link}" target="_blank" rel="noopener">Read full article →</a>`
      : '';
    card.innerHTML=`
      <div class="cat-news-headline">${item.headline||''}</div>
      <div class="cat-news-body">${item.body||''}</div>
      <div class="cat-news-footer">
        ${linkHtml}
        <span class="cat-news-badge">${item.source||''}</span>
      </div>
    `;
    body.appendChild(card);
  });
}

async function loadCatMCQ(cat, body){
  if(CAT_LIVE_AI_PAUSED){
    const local = readCache('mcq', cat.name, {ignoreTtl:true});
    if(local){ body.innerHTML=''; renderCatMCQItems(local, body); return; }
    const doc = await fetchCategoryCacheDoc(cat.name);
    if(hasUsableCatCache(doc, 'mcq')){
      writeCache('mcq', cat.name, doc.mcq);
      body.innerHTML=''; renderCatMCQItems(doc.mcq, body); return;
    }
    renderCatPausedEmpty(body, cat.name, 'mcq');
    return;
  }

  const cached = readCache('mcq', cat.name);
  if(cached){ body.innerHTML=''; renderCatMCQItems(cached, body); return; }

  const doc = await fetchCategoryCacheDoc(cat.name);
  if(isScheduledCatCacheFresh(doc, 'mcq')){
    writeCache('mcq', cat.name, doc.mcq);
    body.innerHTML=''; renderCatMCQItems(doc.mcq, body); return;
  }

  let items = await generateCatMCQGrounded(cat);
  if(!items?.length) items = getSampleCatMCQ(cat);
  items = sanitizeCatMCQItems(items, cat.name);

  writeCache('mcq', cat.name, items);
  persistCategoryCacheDoc(cat.name, {mcq: items});
  body.innerHTML='';
  renderCatMCQItems(items, body);
}

function renderCatMCQItems(items, body){
  items.forEach((item,idx)=>{
    const card=document.createElement('div');card.className='cat-mcq-card';
    card.innerHTML=`
      <div class="cat-mcq-q">Q${idx+1}. ${item.q}</div>
      <div class="cat-mcq-opts">
        ${item.options.map((o,i)=>`<button class="cat-mcq-opt" data-i="${i}" data-correct="${item.correct}"><span>${o}</span><span></span></button>`).join('')}
      </div>
      <div class="cat-mcq-result hidden" id="catRes${idx}">
        ${item.explain?`<div style="margin-bottom:10px;">💡 ${item.explain}</div>`:''}
        ${item.synopsis?`
          <div style="background:var(--cream);border-radius:10px;padding:12px;margin-bottom:8px;">
            <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${item.source||''} · News</div>
            <div style="font-size:13px;line-height:1.6;color:var(--ink);">${item.synopsis}</div>
            ${item.link?`<a href="${item.link}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;margin-top:8px;font-size:12px;font-weight:700;color:var(--red);text-decoration:none;">Read full article →</a>`:''}
          </div>
        `:''}
      </div>
    `;
    card.querySelectorAll('.cat-mcq-opt').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(card.dataset.answered)return;card.dataset.answered='true';
        const chosen=parseInt(btn.dataset.i),correct=parseInt(btn.dataset.correct);
        card.querySelectorAll('.cat-mcq-opt').forEach((b,i)=>{
          b.disabled=true;
          if(i===correct){b.classList.add('correct');b.querySelector('span:last-child').textContent='✓';}
          else if(i===chosen){b.classList.add('wrong');b.querySelector('span:last-child').textContent='✕';}
          else b.classList.add('dim');
        });
        SoundLib.playFeedback(chosen===correct,'default');
        const res=document.getElementById(`catRes${idx}`);
        if(res){res.classList.remove('hidden');res.style.borderTop='1px solid var(--line)';res.style.marginTop='12px';res.style.paddingTop='12px';setTimeout(()=>res.scrollIntoView({behavior:'smooth',block:'nearest'}),200);}
      });
    });
    body.appendChild(card);
  });
}

function getSampleCatNews(cat){
  // Offline fallback — no article URLs (unverified). Optional topic search only.
  const q = encodeURIComponent(`${cat.name} India news`);
  return[
    {headline:`Major update in ${cat.name}`,body:`Several developments were observed in the ${cat.name} sector today. Experts believe this trend will strengthen further in the coming days.`,source:'Chaupaal',link:`https://news.google.com/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`},
    {headline:`${cat.name}: Aage ki raah`,body:`${cat.name} ke baare mein naye developments saamne aaye hain jo India ke liye mahatvpurn hain.`,source:'Chaupaal',link:null},
    {headline:`Developments in the ${cat.name} space`,body:`According to recent reporting, activity in ${cat.name} continues to draw attention in India and globally.`,source:'Chaupaal',link:null},
  ];
}
function getSampleCatMCQ(cat){
  const q = encodeURIComponent(`${cat.name} India news`);
  return[
    {q:`Which is a major recent development in ${cat.name}?`,options:['Significant growth reported','Major decline observed','No change recorded','Data unavailable'],correct:0,explain:`${cat.name} has seen significant activity recently.`,synopsis:`Recent reports highlight developments in ${cat.name}. Open the search link for current coverage — this offline fallback is not a specific article.`,source:'Chaupaal',link:`https://news.google.com/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`},
    {q:`India's role in global ${cat.name} is best described as?`,options:['Emerging leader','Minor player','Inactive participant','Declining force'],correct:0,explain:`India has been expanding its footprint in ${cat.name}.`,synopsis:`India continues to strengthen its position in ${cat.name}. Specific article links require a live grounded AI fetch.`,source:'Chaupaal',link:null},
  ];
}

// ---- Web-search grounded category content (Haiku first, Sonnet escalate) ----
const CAT_HAIKU = 'claude-haiku-4-5-20251001';
const CAT_SONNET = 'claude-sonnet-4-6';

function extractAnthropicText(data){
  if(!data?.content) return '';
  return data.content.filter(b=>b.type==='text').map(b=>b.text||'').join('\n');
}

function parseJsonArrayLoose(text){
  if(!text) return null;
  let raw = text.replace(/```json|```/g,'').trim();
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if(start>=0 && end>start) raw = raw.slice(start, end+1);
  try{ const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : null; }
  catch(e){ return null; }
}

function isArticleUrl(link){
  try{
    const u = new URL(link);
    if(u.protocol!=='http:' && u.protocol!=='https:') return false;
    const path = (u.pathname||'/').replace(/\/+$/,'') || '/';
    // Require a real article path — reject bare publisher homepages
    if(path==='/' || path==='') return false;
    return true;
  }catch(e){ return false; }
}

function topicSearchUrl(topic){
  return `https://news.google.com/search?q=${encodeURIComponent(topic+' India')}&hl=en-IN&gl=IN&ceid=IN:en`;
}

/** Keep real article URLs; drop invented homepages; optional topic-search fallback only when link missing and allowSearchFallback. */
function normalizeCatLink(link, topic, {allowSearchFallback=false}={}){
  if(link && isArticleUrl(link)) return link;
  if(link && typeof link==='string'){
    try{
      const u = new URL(link);
      // Explicit Google News / search result is OK as a last resort when model couldn't find an article URL
      if(/news\.google\.com|google\.com\/search/i.test(u.hostname+u.pathname)) return u.href;
    }catch(e){}
  }
  if(allowSearchFallback && topic) return topicSearchUrl(topic);
  return null;
}

function sanitizeCatNewsItems(items, topic){
  return (items||[]).map(item=>({
    headline: item.headline||'',
    body: item.body||'',
    source: item.source||'',
    date: item.date||'Today',
    link: normalizeCatLink(item.link, topic, {allowSearchFallback:false}),
  }));
}

function sanitizeCatMCQItems(items, topic){
  return (items||[]).map(item=>({
    q: item.q||'',
    options: Array.isArray(item.options)?item.options:[],
    correct: typeof item.correct==='number'?item.correct:0,
    explain: item.explain||'',
    synopsis: item.synopsis||'',
    source: item.source||'',
    link: normalizeCatLink(item.link, topic, {allowSearchFallback:false}),
  }));
}

function catNewsLooksGrounded(items){
  if(!Array.isArray(items) || items.length < 2) return false;
  const withBody = items.filter(i=>i.body && String(i.body).length>40 && i.headline).length;
  if(withBody < 2) return false;
  // Escalate if most "links" are bare homepages (model inventing)
  const badHomepages = items.filter(i=>i.link && !isArticleUrl(i.link) && !/news\.google\.com/i.test(String(i.link))).length;
  if(badHomepages >= Math.ceil(items.length/2)) return false;
  return true;
}

function catMCQLooksGrounded(items){
  if(!Array.isArray(items) || items.length < 3) return false;
  const withQ = items.filter(i=>i.q && Array.isArray(i.options) && i.options.length>=2 && i.synopsis).length;
  if(withQ < 3) return false;
  const badHomepages = items.filter(i=>i.link && !isArticleUrl(i.link) && !/news\.google\.com/i.test(String(i.link))).length;
  if(badHomepages >= Math.ceil(items.length/2)) return false;
  return true;
}

async function callCatAIWithSearch({model, max_tokens, system, user}){
  return callAnthropic({
    enableWebSearch: true,
    model,
    max_tokens,
    system,
    messages: [{role:'user', content:user}],
  });
}

async function generateCatNewsGrounded(cat){
  const system = `You are a news curator for Chaupaal, an Indian news app.
You MUST use the web_search tool to find real, recent articles about "${cat.name}" (prefer Indian/global mainstream sources).
For each item: summarize ONLY from what the search returned, and set "link" to that article's exact URL from the search results.
If you cannot find a usable real article URL for an item, set "link" to null — NEVER invent or guess a URL, and NEVER use a publisher homepage.
Return ONLY a valid JSON array (no markdown, no commentary) with this exact shape:
[{"headline":"...","body":"...max 80 words...","source":"Publication name","link":"https://... or null","date":"Today"}]
Produce exactly 3 items.`;

  const user = `Search the web for recent news in category "${cat.name}", then return 3 grounded news items as JSON.`;

  let data = await callCatAIWithSearch({model:CAT_HAIKU, max_tokens:2000, system, user});
  let items = parseJsonArrayLoose(extractAnthropicText(data));
  if(!catNewsLooksGrounded(items)){
    data = await callCatAIWithSearch({model:CAT_SONNET, max_tokens:2500, system, user});
    items = parseJsonArrayLoose(extractAnthropicText(data));
  }
  return items;
}

async function generateCatMCQGrounded(cat){
  const personalityCtx = buildPersonalityContext();
  const system = `You are a quiz maker for Chaupaal, an Indian news & social app.
You MUST use the web_search tool to find real, recent articles about "${cat.name}" for an Indian audience.${personalityCtx?` User context: ${personalityCtx}.`:''}
Each question must be grounded in a searched story: write the synopsis from the article found, and set "link" to that article's exact URL from search results.
If no usable real article URL exists for a question, set "link" to null — NEVER invent URLs or use publisher homepages.
Return ONLY a valid JSON array (no markdown) with this exact shape:
[{
  "q":"...",
  "options":["A","B","C","D"],
  "correct":0,
  "explain":"one line why the correct answer is right",
  "synopsis":"60-word max news summary from the article you found",
  "source":"Publication name",
  "link":"https://... or null"
}]
Produce exactly 5 questions.`;

  const user = `Search the web for recent "${cat.name}" news, then return 5 grounded MCQ questions as JSON.`;

  let data = await callCatAIWithSearch({model:CAT_HAIKU, max_tokens:3000, system, user});
  let items = parseJsonArrayLoose(extractAnthropicText(data));
  if(!catMCQLooksGrounded(items)){
    data = await callCatAIWithSearch({model:CAT_SONNET, max_tokens:3500, system, user});
    items = parseJsonArrayLoose(extractAnthropicText(data));
  }
  return items;
}

// ===================== PERSONALITY ENGINE (Layer 3) =====================
let personalityProfile = JSON.parse(localStorage.getItem('chaupaal_personality')||'{}');

function buildPersonalityContext(){
  if(!Object.keys(personalityProfile).length) return '';
  const traits=[];
  if(personalityProfile.interests?.length) traits.push(`Interests: ${personalityProfile.interests.join(', ')}`);
  if(personalityProfile.topCategory) traits.push(`Top category: ${personalityProfile.topCategory}`);
  if(personalityProfile.mood) traits.push(`Recent mood: ${personalityProfile.mood}`);
  if(personalityProfile.personality) traits.push(`Personality type: ${personalityProfile.personality}`);
  return traits.join('. ');
}

function updatePersonalityFromAurSunao(questionText, answerText){
  // Map answers to personality signals
  const lq=questionText.toLowerCase();const la=answerText.toLowerCase();
  if(lq.includes('sunday')||lq.includes('ideal')){
    if(la.includes('trek')||la.includes('mountain')) personalityProfile.lifestyle='outdoorsy';
    else if(la.includes('book')||la.includes('read')) personalityProfile.lifestyle='intellectual';
    else if(la.includes('cook')) personalityProfile.lifestyle='homebody';
    else if(la.includes('movie')) personalityProfile.lifestyle='cinephile';
  }
  if(lq.includes('debate')||lq.includes('topic')){
    personalityProfile.debateTopic=answerText;
  }
  if(lq.includes('energized')){
    if(la.includes('one-on-one')||la.includes('solo')) personalityProfile.social='introvert';
    else if(la.includes('large')||la.includes('group')) personalityProfile.social='extrovert';
    else personalityProfile.social='ambivert';
  }
  personalityProfile.lastUpdated=new Date().toISOString();
  try{localStorage.setItem('chaupaal_personality',JSON.stringify(personalityProfile));}catch(e){}
  if(db&&currentUser){db.collection('users').doc(currentUser.uid).update({personalityProfile}).catch(()=>{});}
}

async function analyseEveningCheckIn(text){
  if(!text||text.length<10)return;
  try{
    const data = await callAnthropic({
        model:"claude-haiku-4-5-20251001",max_tokens:300,
        system:`You are a private AI journal assistant for Chaupaal app. Analyse this daily check-in entry and return ONLY JSON: {"mood":"happy|neutral|stressed|excited|tired|curious","topics":["topic1","topic2"],"interests":["interest1"],"personality_signal":"one word trait"}. No markdown.`,
        messages:[{role:"user",content:text}]
      });
    const raw=data.content?.map(b=>b.text||'').join('')||'{}';
    const analysis=JSON.parse(raw.replace(/```json|```/g,'').trim());
    if(analysis.mood) personalityProfile.mood=analysis.mood;
    if(analysis.topics?.length) personalityProfile.recentTopics=analysis.topics;
    if(analysis.interests?.length){
      personalityProfile.interests=[...(personalityProfile.interests||[]),...analysis.interests].slice(0,10);
      // auto-suggest categories from interests
      analysis.interests.forEach(interest=>{
        const match=CATEGORY_SUGGESTIONS.find(s=>s.name.toLowerCase().includes(interest.toLowerCase()));
        if(match&&!myCategories.find(c=>c.name===match.name)){
          setTimeout(()=>showToast(`💡 "${match.name}" category add karein? Aapke interest ke hisaab se! Tab + mein milega.`),2000);
        }
      });
    }
    try{localStorage.setItem('chaupaal_personality',JSON.stringify(personalityProfile));}catch(e){}
    if(db&&currentUser){db.collection('users').doc(currentUser.uid).update({personalityProfile,lastCheckIn:{text,analysis,date:new Date().toISOString()}}).catch(()=>{});}
  }catch(e){}
}

function renderPersonalityProfile(body){
  const traits=[
    {icon:'🎭',label:'Lifestyle',val:personalityProfile.lifestyle||'Not discovered yet'},
    {icon:'👥',label:'Social style',val:personalityProfile.social||'Not discovered yet'},
    {icon:'💭',label:'Debate topic',val:personalityProfile.debateTopic||'Not discovered yet'},
    {icon:'😊',label:'Recent mood',val:personalityProfile.mood||'Not discovered yet'},
    {icon:'🏆',label:'Top interests',val:(personalityProfile.interests||[]).slice(0,2).join(', ')||'Still being discovered'},
  ];
  body.innerHTML=`
    <div class="personality-card">
      <div class="personality-title">🧠 Aapka Chaupaal Profile</div>
      <div class="personality-sub">Built from your answers — only visible to you</div>
      ${traits.map(t=>`<div class="personality-trait"><span class="trait-icon">${t.icon}</span><span class="trait-label">${t.label}</span><span class="trait-val">${t.val}</span></div>`).join('')}
    </div>
    <div class="match-card">
      <div class="match-card-label">Matchmaking signals</div>
      ${[['Intellectual curiosity',72],['Social openness',58],['News depth',85],['Debate readiness',64]].map(([label,val])=>`
        <div class="match-bar-row">
          <span style="flex:1;font-size:13px;">${label}</span>
          <div class="match-bar"><div class="match-bar-fill" style="width:${val}%"></div></div>
          <span class="match-pct">${val}%</span>
        </div>
      `).join('')}
      <div style="font-size:12px;color:var(--muted);margin-top:10px;">Yeh signals samay ke saath aur behtar honge 📈</div>
    </div>
    <div style="background:var(--white);border-radius:16px;padding:16px;margin-bottom:12px;">
      <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Friends se aapke baare mein sawaal</div>
      ${generateFriendQuestionsAboutUser().map(q=>`<div style="padding:10px 0;border-bottom:1px solid var(--line);font-size:14px;color:var(--ink);">🤔 ${q}</div>`).join('')}
      <div style="font-size:12px;color:var(--muted);margin-top:10px;">Yeh sawaal aapke doston ke Akhbaar mein dikhenge (aapki consent ke saath)</div>
    </div>
  `;
}

function generateFriendQuestionsAboutUser(){
  const name=(userProfile?.name||'Aapka dost').split(' ')[0];
  const lifestyle=personalityProfile.lifestyle;
  const mood=personalityProfile.mood;
  const base=[
    `${name} ka favourite weekend activity kya hai?`,
    `${name} ko kaunsi news category sabse zyada pasand hai?`,
    `How many days is ${name}'s current streak?`,
  ];
  if(lifestyle==='outdoorsy') base.push(`${name} ka next trek kahan ka plan hai?`);
  if(lifestyle==='cinephile') base.push(`${name} ne pichli baar kaunsi movie dekhi?`);
  if(mood==='stressed') base.push(`${name} ko aajkal kya cheez thoda pareshaan kar rahi hai?`);
  return base.slice(0,3);
}

// ===================== SMART MATCHMAKING (Layer 3) =====================
function computeMatchScore(otherUser){
  let score=0,factors=[];
  // 50-80% preference based
  const preferenceWeight=0.5+Math.random()*0.3;
  // interests overlap
  const myInterests=new Set(personalityProfile.interests||[]);
  const theirInterests=new Set(otherUser.interests||[]);
  const overlap=[...myInterests].filter(i=>theirInterests.has(i)).length;
  if(overlap>0){score+=30*Math.min(overlap/3,1);factors.push(`${overlap} common interests`);}
  // category ratings proximity
  const myRatings=userProfile?.categoryRatings||{};
  const theirRatings=otherUser.categoryRatings||{};
  const ratingDiff=NEWS_CATEGORIES.reduce((sum,cat)=>sum+Math.abs((myRatings[cat]||1200)-(theirRatings[cat]||1200)),0)/NEWS_CATEGORIES.length;
  if(ratingDiff<100){score+=25;factors.push('Similar ratings');}
  // 20-50% chance element
  const chanceScore=Math.random()*50;
  score+=chanceScore*(1-preferenceWeight);
  return{score:Math.min(Math.round(score),100),factors};
}

// ===================== SMART NOTIFICATIONS (Layer 3) =====================
const NOTIFICATION_TEMPLATES={
  hi:{morning:"☕ Chai tayaar hai? Aaj ka Akhbaar wait kar raha hai!",streak:"🔥 {name}, aapki {streak} din ki streak khatam hone wali hai!",taaza:"🔴 Ek Taaza Khabar abhi aayi — kya aap jante hain?",evening:"🌙 Kaisa raha din aapka? Apni baat likhein.",friend_duel:"⚔️ {friend} ne aapko Muqabala ke liye challenge kiya!"},
  en:{morning:"☕ Chai ready? Today's Akhbaar is waiting for you!",streak:"🔥 {name}, your {streak}-day streak is about to end!",taaza:"🔴 A Taaza Khabar just dropped — do you know?",evening:"🌙 How was your day? Write about it.",friend_duel:"⚔️ {friend} has challenged you to a Muqabala!"},
  ta:{morning:"☕ Chai ready? Indru Akhbaar unnaipaarkirathu!",streak:"🔥 Unkalin {streak} naal streak mudivu kaankirathu!",taaza:"🔴 Oru Taaza Khabar vandhathu!",evening:"🌙 Ungal naal eppadi iruthathu?",friend_duel:"⚔️ {friend} ungalai Muqabala-vukku azhaittaar!"},
};

function getNotificationText(type, vars={}){
  const lang=currentLang||'en';
  const templates=NOTIFICATION_TEMPLATES[lang]||NOTIFICATION_TEMPLATES.en;
  let text=templates[type]||NOTIFICATION_TEMPLATES.en[type]||'';
  Object.entries(vars).forEach(([k,v])=>{text=text.replace(`{${k}}`,v);});
  return text;
}

function sendSmartNotification(type, vars={}){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  if(typeof isNotifEnabled==='function'&&!isNotifEnabled(type))return;
  const body=getNotificationText(type,vars);
  new Notification('Chaupaal 🪑',{body,icon:'icon.png'});
}

// Wire up Aur Sunao answers to personality engine
document.addEventListener('click',e=>{
  const btn=e.target.closest('.as-opt');
  if(!btn)return;
  const card=btn.closest('.aur-sunao-card');
  if(!card)return;
  const q=card.querySelector('.aur-sunao-q')?.textContent||'';
  updatePersonalityFromAurSunao(q,btn.textContent);
});

// Wire up evening check-in analysis
dayCheckModal.querySelector('.day-check-send').addEventListener('click',async()=>{
  const text=dayCheckModal.querySelector('#dayCheckText')?.value?.trim();
  if(!text)return;
  dayCheckModal.classList.remove('open');
  showToast('Saved to your Archive 🗄️');
  saveToArchive({type:'journal_entry',content:text,ts:new Date().toISOString()});
  await analyseEveningCheckIn(text);
  if(db&&currentUser){
    try{await db.collection('daily_checkins').add({uid:currentUser.uid,text,date:new Date().toISOString(),analysed:false,createdAt:firebase.firestore.FieldValue.serverTimestamp()});}catch(e){}
  }
});
dayCheckModal.querySelector('.day-check-skip').addEventListener('click',()=>dayCheckModal.classList.remove('open'));

// ===================== PEEPAL =====================
const SAMPLE_PEEPAL=[
  {id:'p1',user:{name:'Riya Sharma',avatar:'😊',city:'Mumbai'},question:'If you could only read one news category for the rest of your life, what would it be?',format:'mcq',options:['Sports 🏏','Tech 💻','World 🌍','Business 📈'],responses:[42,38,15,5],totalResponses:100,comments:12,timeAgo:'2h',tag:'Lifestyle',answered:false},
  {id:'p2',user:{name:'Arjun Mehta',avatar:'🏔️',city:'Delhi'},question:'Do you think AI-generated news should be labeled differently from human-written news?',format:'binary',options:['Yes, always','No, quality is all that matters'],responses:[68,32],totalResponses:100,comments:28,timeAgo:'4h',tag:'Tech',answered:false},
  {id:'p3',user:{name:'Priya Nair',avatar:'👩',city:'Bengaluru'},question:'What time do you usually read the news?',format:'mcq',options:['Morning with chai ☕','During lunch 🍛','Evening commute 🚇','Before bed 🌙'],responses:[55,18,20,7],totalResponses:100,comments:8,timeAgo:'6h',tag:'Habits',answered:false},
  {id:'p4',user:{name:'Dev Sharma',avatar:'👨',city:'Pune'},question:'Tell us — what news story has affected you the most personally this year?',format:'open',totalResponses:47,comments:15,timeAgo:'1d',tag:'Personal',answered:false},
];

const SAMPLE_COMMENTS=[
  {user:{name:'Riya Sharma',avatar:'😊'},text:'Such a thought-provoking question! I think morning news sets the tone for the whole day.',time:'1h',shared:false},
  {user:{name:'Dev Sharma',avatar:'👨'},text:'Completely agree — especially with a good cup of chai.',time:'2h',shared:false},
  {user:{name:'Priya Nair',avatar:'👩'},text:'Night owls unite! I always read before bed 😄',time:'3h',shared:false},
];

let peepalQuestions=[...SAMPLE_PEEPAL];
let weeklyQuestionCount=0;
let peepalPageCursor=null;
let peepalHasMore=true;
let peepalFeedLoading=false;
let peepalLiveMode=false;

function mapPeepalDoc(raw){
  const created=raw.createdAt?.toMillis?.()||raw.createdAt?.toDate?.()?.getTime?.()||raw.ts||null;
  return {
    id: raw.id,
    firestoreId: raw.id,
    user: raw.user||{name:'User',avatar:'👤',uid:raw.uid},
    question: raw.question||'',
    format: raw.format||'open',
    options: raw.options||[],
    responses: raw.responses||(raw.options||[]).map(()=>0),
    totalResponses: raw.totalResponses||0,
    comments: raw.comments||0,
    timeAgo: created?undefined:raw.timeAgo,
    ts: created||raw.ts||Date.now(),
    tag: raw.tag||(raw.format||'open').toUpperCase(),
    answered: raw.answered===undefined?false:raw.answered,
    anonymous: !!raw.anonymous,
    deleted: !!raw.deleted,
    uid: raw.uid,
    attachment: raw.attachment||null,
  };
}

async function loadPeepalPage({reset=false}={}){
  if(!db||typeof fetchFirestorePage!=='function') return {loaded:0};
  if(peepalFeedLoading) return {loaded:0};
  if(!reset&&!peepalHasMore) return {loaded:0};
  peepalFeedLoading=true;
  try{
    if(reset){ peepalPageCursor=null; peepalHasMore=true; }
    const page=await fetchFirestorePage({
      queryBase: db.collection('peepal'),
      orderField:'createdAt',
      direction:'desc',
      pageSize: typeof FIRESTORE_PAGE_SIZE==='number'?FIRESTORE_PAGE_SIZE:10,
      cursor: reset?null:peepalPageCursor,
      excludeDeleted:true,
    });
    const mapped=page.items.map(mapPeepalDoc).filter(q=>!(typeof isSoftDeleted==='function'?isSoftDeleted(q):q.deleted));
    if(reset&&mapped.length){
      peepalLiveMode=true;
      peepalQuestions=mapped;
    } else if(mapped.length){
      const seen=new Set(peepalQuestions.map(q=>q.firestoreId||q.id));
      mapped.forEach(q=>{ if(!seen.has(q.firestoreId||q.id)) peepalQuestions.push(q); });
    } else if(reset){
      peepalLiveMode=false;
      peepalQuestions=[...SAMPLE_PEEPAL];
    }
    peepalPageCursor=page.lastDoc;
    peepalHasMore=page.hasMore;
    return {loaded:mapped.length};
  }catch(e){
    console.warn('[peepal] page load failed', e);
    return {loaded:0,error:e};
  }finally{
    peepalFeedLoading=false;
  }
}

async function initPeepal(){
  const feed=document.getElementById('peepalFeed');if(!feed)return;
  // Remove old discovery section (refresh on every open)
  document.getElementById('peepalDiscovery')?.remove();
  delete feed.dataset.loaded;

  // Wire buttons (once only)
  const askBtn=document.getElementById('peepalAskBtn');
  if(askBtn&&!askBtn.dataset.wired){askBtn.dataset.wired='1';askBtn.addEventListener('click',()=>openPeepalAskSheet());}
  const searchBtn=document.getElementById('peepalSearchBtn');
  if(searchBtn&&!searchBtn.dataset.wired){searchBtn.dataset.wired='1';searchBtn.addEventListener('click',()=>{
    const s=document.getElementById('peepalAiSearch');
    s?.classList.toggle('hidden');
    if(!s?.classList.contains('hidden'))document.getElementById('peepalAiSearchInput')?.focus();
  });}
  document.getElementById('peepalAiSearchClose')?.addEventListener('click',()=>document.getElementById('peepalAiSearch')?.classList.add('hidden'));
  // Wire nudge chips
  document.querySelectorAll('.peepal-nudge-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      const inp=document.getElementById('peepalAiSearchInput');
      if(inp){inp.value=chip.dataset.hint;inp.focus();}
    });
  });
  if(!document.getElementById('peepalAiSearchGo')?.dataset.wired){
    document.getElementById('peepalAiSearchGo').dataset.wired='1';
    document.getElementById('peepalAiSearchGo').addEventListener('click',runPeepalAiSearch);
    document.getElementById('peepalAiSearchInput')?.addEventListener('keypress',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();runPeepalAiSearch();}});
  }

  // Show loading placeholder
  const loadingEl=document.createElement('div');
  loadingEl.className='peepal-discovery';loadingEl.id='peepalDiscovery';
  if(typeof renderSkeleton==='function') renderSkeleton(loadingEl, {variant:'card', count:2});
  else loadingEl.innerHTML=`<div class="discovery-loading">Finding people who think like you...</div>`;
  feed.parentElement.insertBefore(loadingEl,feed);

  try{
    const profiles=await getDiscoveryProfiles();
    discoveryPreviousSet=[...discoveryCurrentSet];
    discoveryCurrentSet=profiles;
    loadingEl.remove();
    feed.parentElement.insertBefore(renderDiscoverySection(profiles),feed);
  }catch(e){
    if(typeof renderErrorState==='function'){
      renderErrorState(loadingEl, {
        title:'Couldn’t load suggestions',
        message: typeof friendlyError==='function'?friendlyError(e):'Please try again.',
        onRetry:()=>{ loadingEl.remove(); initPeepal(); },
      });
    } else {
      loadingEl.innerHTML=`<div class="discovery-loading">Couldn’t load suggestions — try again later.</div>`;
    }
  }

  // Render questions feed (hydrate from Firestore when available)
  if(!feed.dataset.loaded){
    feed.dataset.loaded='1';
    if(db&&currentUser&&typeof loadPeepalPage==='function'){
      if(typeof renderSkeleton==='function') renderSkeleton(feed,{variant:'card',count:2});
      await loadPeepalPage({reset:true});
    }
    renderPeepalFeed();
    renderPeepalNudges();
  }
}

function peepalScore(q){
  // Trending algorithm: engagement velocity + personality match + recency
  const ageHours=parseInt(q.timeAgo)||1;
  const engagementVelocity=(q.totalResponses+q.comments*2)/ageHours;
  const personalityMatch=matchPersonalityToQuestion(q);
  const recency=Math.max(0,100-ageHours*3);
  const randomBoost=Math.random()*30; // 30% random factor for stranger discovery
  return engagementVelocity*0.35 + personalityMatch*0.25 + recency*0.1 + randomBoost*0.3;
}

function matchPersonalityToQuestion(q){
  let score=50;
  const interests=personalityProfile.interests||[];
  const tag=q.tag?.toLowerCase()||'';
  if(interests.some(i=>tag.includes(i.toLowerCase())))score+=30;
  if(q.format==='open'&&personalityProfile.social==='introvert')score-=10;
  if(q.format==='mcq'&&myCategories.some(c=>q.tag?.toLowerCase().includes(c.name.toLowerCase())))score+=20;
  return Math.min(score,100);
}

function renderPeepalFeed(){
  const feed=document.getElementById('peepalFeed');if(!feed)return;
  const sorted=[...peepalQuestions]
    .filter(q=>!(typeof isSoftDeleted==='function'?isSoftDeleted(q):q.deleted))
    .sort((a,b)=>peepalScore(b)-peepalScore(a));
  feed.innerHTML='';
  if(!sorted.length){
    if(typeof renderEmptyState==='function'){
      renderEmptyState(feed, {
        icon:'🌳',
        title:'No questions yet',
        message:'Be the first to ask the Peepal community something.',
        actionLabel:'Ask a question',
        onAction:()=>typeof openPeepalAskSheet==='function'&&openPeepalAskSheet(),
      });
    }
    return;
  }
  sorted.forEach(q=>{
    const card=document.createElement('div');card.className='peepal-card';
    const mediaHtml = q.attachment?.type==='image'
      ? `<div class="peepal-media"><img src="${typeof mediaUrlFor==='function'?mediaUrlFor({media:q.attachment.data,thumb:q.attachment.thumb},'list'):(q.attachment.thumb||q.attachment.data)}" loading="lazy" alt=""></div>`
      : q.attachment?.type==='link'
      ? `<a class="peepal-link-card" href="${q.attachment.url}" target="_blank" onclick="event.stopPropagation()"><div class="peepal-link-thumb">🔗</div><div class="peepal-link-info"><div class="peepal-link-title">${q.attachment.title}</div><div class="peepal-link-url">${q.attachment.url}</div></div></a>`
      : '';
    const canDelete=currentUser&&(q.user?.uid===currentUser.uid||q.uid===currentUser.uid)&&!q.anonymous;
    card.innerHTML=`
      <div class="peepal-card-header">
        <div class="peepal-user-avatar" style="cursor:pointer;" onclick="event.stopPropagation();">${q.user.photoURL?`<img src="${q.user.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`:(q.user.avatar||'👤')}</div>
        <div style="flex:1;min-width:0;">
          <div class="peepal-user-name">${q.user.name}</div>
          <div class="peepal-user-meta">${[q.user.city, typeof formatRelativeTime==='function'?formatRelativeTime(q.timeAgo||q.ts):q.timeAgo].filter(Boolean).join(' · ')}</div>
          ${q.user.bio?`<div style="font-size:11px;color:var(--muted);font-style:italic;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">"${q.user.bio}"</div>`:''}
        </div>
        ${canDelete?`<button class="peepal-delete-btn" title="Delete" style="background:none;border:none;cursor:pointer;font-size:15px;color:var(--muted);">🗑️</button>`:''}
        <button class="peepal-speak-btn" data-text="${q.question.replace(/"/g,'&quot;')}" title="Listen to this post">🔊</button>
      </div>
      <div class="peepal-card-body">
        <div class="peepal-question-text">${q.question}</div>
        ${mediaHtml}
        ${renderPeepalOptions(q)}
      </div>
      <div class="peepal-card-footer">
        <span class="peepal-footer-stat">💬 ${q.comments}</span>
        <span class="peepal-footer-stat">👥 ${q.totalResponses} responses</span>
        <button class="peepal-footer-stat" onclick="event.stopPropagation();openShareSheet({id:'${q.id}',caption:'${q.question.replace(/'/g,"\'")}',user:{name:'${q.user.name}'}})" style="background:none;border:none;cursor:pointer;">↗️ Share</button>
        <span class="peepal-tag">${q.tag}</span>
      </div>
    `;
    card.querySelector('.peepal-speak-btn').addEventListener('click',(e)=>{
      e.stopPropagation();
      speakText(e.currentTarget.dataset.text, e.currentTarget);
    });
    card.querySelector('.peepal-delete-btn')?.addEventListener('click',(e)=>{
      e.stopPropagation();
      if(typeof softDeleteContent!=='function') return;
      softDeleteContent({
        kind:'peepal',
        id:q.id,
        firestoreId:q.firestoreId||null,
        collection:'peepal',
        list:peepalQuestions,
        render:renderPeepalFeed,
        label:'Question deleted',
      });
    });
    card.addEventListener('click',()=>openPeepalDetail(q));
    feed.appendChild(card);
  });
  if(peepalLiveMode&&peepalHasMore&&typeof ensureLoadMoreButton==='function'){
    ensureLoadMoreButton(feed,{
      label:'Load more questions',
      onLoadMore:async()=>{
        await loadPeepalPage({reset:false});
        renderPeepalFeed();
      },
    });
  }
}

function renderPeepalOptions(q){
  const typingSection=(promptText)=>`
    <div class="peepal-typing-section" id="typing_${q.id}" style="${q.answered===false?'display:none;':''}margin-top:10px;border-top:1px solid var(--line);padding-top:10px;">
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px;">💭 Want to add your thoughts? (optional)</div>
      <div style="display:flex;gap:6px;">
        <input class="peepal-open-input" style="flex:1;margin:0;" placeholder="${promptText||'Share more about your answer...'}" id="typing_input_${q.id}">
        <button onclick="submitPeepalTyping('${q.id}',event)" style="padding:8px 12px;background:var(--red);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;flex-shrink:0;">→</button>
      </div>
    </div>
  `;

  if(q.format==='open'){
    if(q.answered)return`
      <div style="font-size:13px;color:var(--muted);padding:4px 0;">You shared your response ✓ · ${q.totalResponses} responses</div>
      ${q.myTypedAnswer?`<div style="font-size:13px;color:var(--ink);background:var(--cream);border-radius:10px;padding:8px 12px;margin-top:6px;border-left:3px solid var(--red);">"${q.myTypedAnswer}"</div>`:''}
    `;
    return`
      <textarea class="peepal-open-input" placeholder="Share your thoughts..." id="open_${q.id}" rows="2" style="resize:none;min-height:60px;"></textarea>
      <button class="peepal-submit-btn" onclick="submitPeepalOpen('${q.id}')">Share</button>
    `;
  }

  const total=q.responses.reduce((a,b)=>a+b,0)||1;
  const optionsHtml=`<div class="peepal-options">${q.options.map((o,i)=>{
    const pct=Math.round((q.responses[i]/total)*100);
    const isTop=q.responses[i]===Math.max(...q.responses);
    const isAnswered=q.answered===i;
    return`<button class="peepal-opt ${isAnswered?'answered':''} ${isTop&&q.answered!==false?'top':''}" onclick="answerPeepal('${q.id}',${i},event)">
      <span>${o}</span>
      ${q.answered!==false?`<span class="peepal-pct">${pct}%</span>`:''}
    </button>${q.answered!==false?`<div class="peepal-opt-bar"><div class="peepal-opt-bar-fill" style="width:${pct}%"></div></div>`:''}`;
  }).join('')}</div>`;

  // Typing prompt varies by question content
  const typingPrompt=q.format==='binary'?'Tell us why you chose this...':'Add your perspective...';
  return optionsHtml + typingSection(typingPrompt);
}

function submitPeepalTyping(id, e){
  if(e)e.stopPropagation();
  const input=document.getElementById(`typing_input_${id}`);
  if(!input||!input.value.trim())return;
  const q=peepalQuestions.find(q=>q.id===id);if(!q)return;
  q.myTypedAnswer=input.value.trim();
  input.value='';
  showToast('Your perspective added! ✓');
  // Feed to personality engine for matchmaking
  updatePersonalityFromPeepalAnswer(q, q.myTypedAnswer);
  renderPeepalFeed();
}

async function updatePersonalityFromPeepalAnswer(q, typedAnswer){
  // Run async Haiku analysis on typed answer
  try{
    const data = await callAnthropic({
        model:'claude-haiku-4-5-20251001',max_tokens:150,
        system:'Extract personality signals from a user\'s typed answer to a community question. Return ONLY JSON: {"traits":["list of 1-3 personality traits"],"interests":["topics they care about"],"vibe":"1-word social vibe: intellectual|adventurous|creative|empathetic|humorous|ambitious"}. Be concise.',
        messages:[{role:'user',content:`Question: "${q.question}"\nAnswer: "${typedAnswer}"`}]
      });
    const analysis=JSON.parse((data.content?.[0]?.text||'{}').replace(/```json|```/g,'').trim());
    // Merge into personality profile
    if(analysis.traits) personalityProfile.traits=[...new Set([...(personalityProfile.traits||[]),...analysis.traits])].slice(0,10);
    if(analysis.interests) personalityProfile.interests=[...new Set([...(personalityProfile.interests||[]),...analysis.interests])].slice(0,15);
    if(analysis.vibe) personalityProfile.lifestyle=analysis.vibe;
    try{localStorage.setItem('chaupaal_personality',JSON.stringify(personalityProfile));}catch(e){}
    if(db&&currentUser) db.collection('users').doc(currentUser.uid).update({personalityProfile}).catch(()=>{});
  }catch(e){}
}


function answerPeepal(id,optIdx,e){
  e.stopPropagation();
  const q=peepalQuestions.find(q=>q.id===id);if(!q||q.answered!==false)return;
  q.answered=optIdx;q.responses[optIdx]++;q.totalResponses++;
  renderPeepalFeed();
  // Show typing section with a slight delay
  setTimeout(()=>{
    const typingEl=document.getElementById(`typing_${id}`);
    if(typingEl){typingEl.style.display='block';document.getElementById(`typing_input_${id}`)?.focus();}
    showToast('See who else thinks like you in the comments! 💬');
  },300);
}

function submitPeepalOpen(id){
  const input=document.getElementById(`open_${id}`);
  if(!input||!input.value.trim())return;
  const q=peepalQuestions.find(q=>q.id===id);if(!q)return;
  q.answered=true;q.totalResponses++;
  renderPeepalFeed();
  showToast('Your response is in! 🙌');
}

function openPeepalDetail(q){
  const detail=document.getElementById('peepalDetail');
  detail.classList.remove('hidden');
  requestAnimationFrame(()=>detail.classList.add('open'));
  detail.innerHTML=`
    <div class="peepal-detail-header">
      <button class="peepal-detail-back" id="peepalDetailBack">←</button>
      <div class="peepal-detail-title">🌳 Peepal</div>
    </div>
    <div class="peepal-detail-body">
      <div class="peepal-card-header" style="padding:0 0 12px;">
        <div class="peepal-user-avatar">${q.user.avatar}</div>
        <div>
          <div class="peepal-user-name">${q.user.name}</div>
          <div class="peepal-user-meta">${q.user.city} · ${typeof formatRelativeTime==='function'?formatRelativeTime(q.timeAgo||q.ts):q.timeAgo}</div>
        </div>
      </div>
      <div class="peepal-question-text">${q.question}</div>
      ${q.attachment?.type==='image'?`<div class="peepal-media" style="margin:12px 0;"><img src="${typeof mediaUrlFor==='function'?mediaUrlFor({media:q.attachment.data,thumb:q.attachment.thumb},'detail'):(q.attachment.data||q.attachment.thumb)}" alt="" style="width:100%;border-radius:12px;"></div>`:''}
      ${renderPeepalOptions(q)}
      <div style="height:16px;"></div>
      <div class="spark-nudge">
        <div class="spark-nudge-text">👋 <strong>${q.user.name.split(' ')[0]}</strong> would love to hear your thoughts! Start a conversation.</div>
        <button class="spark-nudge-btn" onclick="showToast('Message sent! Check Baithak 🏠')">Say hi</button>
      </div>
      <div style="font-size:13px;font-weight:700;margin-bottom:12px;">Comments (${q.comments})</div>
      ${SAMPLE_COMMENTS.map(c=>`
        <div class="comment-item">
          <div class="comment-avatar">${c.user.avatar}</div>
          <div class="comment-body">
            <div class="comment-name">${c.user.name}</div>
            <div class="comment-text">${c.text}</div>
            <div class="comment-time">${c.time} ago</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="comment-input-bar">
      <input class="comment-input" id="commentInput" placeholder="Add a comment...">
      <button class="comment-send" id="commentSend">Post</button>
    </div>
  `;
  document.getElementById('peepalDetailBack').addEventListener('click',()=>{
    detail.classList.remove('open');setTimeout(()=>detail.classList.add('hidden'),300);
    try{ history.pushState({},'', '/'); }catch(e){}
  });
  try{
    const pid=q.firestoreId||q.id;
    if(pid&&typeof buildDeepLink==='function') history.pushState({chaupaalDeep:true},'',buildDeepLink('post',pid));
  }catch(e){}
  document.getElementById('commentSend').addEventListener('click',async()=>{
    const input=document.getElementById('commentInput');
    if(!input.value.trim())return;
    if(typeof checkRateLimit==='function'){
      const rl=await checkRateLimit('comment');
      if(!rl.ok){ if(typeof showToast==='function') showToast(rl.message||'Slow down'); return; }
    }
    const div=document.createElement('div');div.className='comment-item';
    div.innerHTML=`<div class="comment-avatar">${userProfile?.photoURL?`<img src="${userProfile.photoURL}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">`:'🪑'}</div><div class="comment-body"><div class="comment-name">${userProfile?.name||'You'}</div><div class="comment-text">${input.value}</div><div class="comment-time">just now</div></div>`;
    document.querySelector('.peepal-detail-body')?.appendChild(div);
    input.value='';q.comments++;
  });
  // Wire AI keyboard to comment input
  setTimeout(()=>{
    const ci=document.getElementById('commentInput');
    if(ci) wireAiKbToInput(ci,`Peepal question: "${q.question.slice(0,80)}"`);
  },100);
}

// openPeepalAskSheet moved below

