// ===================== PEEPAL AI PEOPLE SEARCH =====================

const PEEPAL_SEARCH_NUDGES = [
  {emoji:'❤️', text:t('discovery.looking_for_someone_to_date'), hint:t('discovery.type_something_like_someone_fun_around')},
  {emoji:'🤝', text:t('discovery.want_new_friends'), hint:t('discovery.try_cricket_fan_from_delhi_who')},
  {emoji:'💼', text:t('discovery.hiring_or_job_hunting'), hint:t('discovery.try_frontend_developer_looking_for_opportu')},
  {emoji:'✈️', text:t('discovery.planning_a_trip'), hint:t('discovery.try_travel_buddy_for_ladakh_in')},
  {emoji:'🎮', text:t('discovery.find_a_game_partner'), hint:t('discovery.try_someone_to_play_chess_or')},
  {emoji:'🎵', text:t('discovery.bond_over_music'), hint:t('discovery.try_bollywood_music_lover_who_also')},
  {emoji:'📚', text:t('discovery.start_a_book_club'), hint:t('discovery.try_non_fiction_reader_interested_in')},
  {emoji:'🏋️', text:t('discovery.find_a_fitness_buddy'), hint:t('discovery.try_morning_runner_or_gym_person')},
  {emoji:'🍛', text:t('discovery.foodie_connections'), hint:t('discovery.try_food_lover_who_likes_trying')},
  {emoji:'🧠', text:t('discovery.intellectual_debates'), hint:t('discovery.try_someone_who_loves_discussing_politics')},
  {emoji:'🎬', text:t('discovery.movie_or_series_partner'), hint:t('discovery.try_thriller_movie_buff_who_watches')},
  {emoji:'🚀', text:t('discovery.find_a_co_founder'), hint:t('discovery.try_startup_minded_person_with_product')},
];

// Intent → criteria mapping (no API call needed for common patterns)
// Matching criteria + AI hints (English codes / descriptors) — never UI copy.
const INTENT_MAP = /* i18n-values: discovery.intent_map */ {
  dating: {gender_preference:'opposite', interests:['relationships','lifestyle'], personality:'social', vibe:'romantic connection'},
  friendship: {interests:[], personality:null, vibe:'new friends'},
  'job hunting': {interests:['Business','Tech'], personality:'intellectual', vibe:'career opportunities'},
  hiring: {interests:['Business','Tech'], personality:'intellectual', vibe:'recruitment'},
  travel: {interests:['travel','adventure'], personality:'outdoorsy', vibe:'travel companion'},
  cricket: {interests:['Sports'], topCat:'Sports', vibe:'cricket enthusiast'},
  'book club': {interests:['GK','education'], personality:'intellectual', vibe:'reading and books'},
  fitness: {interests:['health','fitness'], personality:'outdoorsy', vibe:'fitness and workout'},
  music: {interests:['Music'], vibe:'music lover'},
  food: {interests:['food','cooking'], vibe:'foodie'},
  movies: {interests:['movies','entertainment'], personality:'cinephile', vibe:'film enthusiast'},
  startup: {interests:['Business','Tech'], personality:'intellectual', vibe:'startup ecosystem'},
  gaming: {interests:['gaming','tech'], vibe:'gaming partner'},
  debate: {interests:['politics','GK','World'], personality:'intellectual', vibe:'intellectual debate'},
};

const DISCOVER_LIMIT_DEFAULT = 5;

async function runPeepalAiSearch(opts){
  const o = opts || {};
  const resultsEl =
    o.resultsEl ||
    (o.surface === 'khoj'
      ? document.getElementById('khojIntentResults')
      : document.getElementById('peepalAiSearchResults'));
  const input =
    o.surface === 'khoj'
      ? document.getElementById('khojIntentInput')
      : document.getElementById('peepalAiSearchInput');
  const query = (o.query != null ? String(o.query) : input?.value || '').trim();
  if (!query) {
    if (typeof showToast === 'function') {
      showToast(
        typeof t === 'function'
          ? t('peepal_find_empty', "Type who you're looking for")
          : t('discovery.type_who_you_re_looking_for')
      );
    }
    return;
  }
  if (input && o.query != null) input.value = query;
  if (!resultsEl) return;

  // Soft-auth: Find needs an account for real strangers (K1); resume after login (K4 / G2)
  if (typeof currentUser === 'undefined' || !currentUser) {
    try {
      if (query) sessionStorage.setItem('chaupaal_khoj_pending_query', query.slice(0, 500));
    } catch (e) {}
    try {
      if (typeof ChaupaalReferrals?.stashPendingAction === 'function') {
        ChaupaalReferrals.stashPendingAction('khoj_find');
      } else if (typeof stashPendingAction === 'function') {
        stashPendingAction('khoj_find');
      } else {
        sessionStorage.setItem('chaupaal_pending_action', 'khoj_find');
      }
    } catch (e) {}
    if (typeof showToast === 'function') {
      showToast(
        typeof t === 'function'
          ? t('discovery.khoj_find_signin', 'Sign in to find people to meet')
          : t('discovery.sign_in_to_find_people_to')
      );
    }
    if (typeof openAuthSheet === 'function') openAuthSheet('login');
    else if (typeof showAuth === 'function') showAuth();
    resultsEl.innerHTML = '';
    return;
  }

  const limit = Math.max(1, Math.min(20, Number(o.limit) || DISCOVER_LIMIT_DEFAULT));
  const filters =
    o.filters ||
    (typeof getDiscoveryFilterPayload === 'function' ? getDiscoveryFilterPayload() : null);
  const chipIntent = o.chipIntent || null;

  // Hide peeks while showing Find results on Khoj
  if (o.surface === 'khoj' || resultsEl.id === 'khojIntentResults') {
    document.getElementById('khojCompatList')?.classList.add('hidden');
    document.querySelector('#peepalKhojSurface .khoj-compat-more')?.classList.add('hidden');
    document.getElementById('khojBackToPeeks')?.classList.remove('hidden');
  }

  if(typeof renderSkeleton==='function') renderSkeleton(resultsEl, {variant:'card', count:2});
  else resultsEl.innerHTML = `<div class="peepal-ai-thinking">${tHtml('discovery.finding_the_right_people_for_you')}</div>`;

  try{
    // Unified brain: server intent_discover (parse → assume → retrieve → rank → learn hooks)
    let envelope = null;
    if(typeof apiFetch === 'function' && typeof currentUser !== 'undefined' && currentUser){
      try{
        envelope = await apiFetch('/api/peepal-reactions', {
          method: 'POST',
          needAuth: true,
          body: {
            action: 'intent_discover',
            query,
            chipIntent,
            filters,
            limit,
            ai: o.ai,
          },
        });
      }catch(e){
        console.warn('[discovery] intent_discover failed, falling back', e?.message || e);
      }
    }

    const data = envelope?.ok && envelope.data ? envelope.data : null;
    if(data && Array.isArray(data.matches)){
      data.matches = data.matches
        .filter((m) => m?.uid && m.uid !== currentUser?.uid)
        .filter((m) => typeof isDiscoveryEligibleUser !== 'function' || isDiscoveryEligibleUser(m))
        .slice(0, limit);
      await renderIntentDiscoverResults(resultsEl, query, data);
      return;
    }

    // Fallback: deterministic local INTENT_MAP + public pool (AI-off / offline)
    await runPeepalAiSearchLocalFallback(query, resultsEl, { limit, filters, chipIntent });
  }catch(err){
    console.error(err);
    if(typeof renderErrorState==='function'){
      renderErrorState(resultsEl, {
        title:t('discovery.search_couldn_t_finish'),
        message: typeof friendlyError==='function'?friendlyError(err):t('discovery.couldn_t_connect_right_now_try'),
        onRetry:()=>runPeepalAiSearch(o),
      });
    } else {
      resultsEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);">${tHtml('discovery.couldn_t_connect_right_now_try_2')}</div>`;
    }
  }
}

async function renderIntentDiscoverResults(resultsEl, query, data){
  const matches = Array.isArray(data.matches) ? data.matches : [];
  const plan = data.plan || {};
  const refineChips = Array.isArray(data.refineChips) ? data.refineChips : [];
  const intentProfileId = data.intentProfileId || null;

  let aiMsgLimit = null;
  try {
    if (typeof PolicyUsage?.getRemaining === 'function') {
      aiMsgLimit = await PolicyUsage.getRemaining('aiDiscoveryMsg');
    }
  } catch (e) {}
  const aiMsgExhausted = !!(aiMsgLimit && aiMsgLimit.exhausted);
  if (typeof AiDiscoveryMeter?.injectStyles === 'function') AiDiscoveryMeter.injectStyles();
  try {
    if (typeof AiDiscoveryMeter?.mountOnIntentCardCompact === 'function') {
      AiDiscoveryMeter.mountOnIntentCardCompact(document.getElementById('peepalIntentCard'), { disclosePro: true });
    }
  } catch (e) {}

  if(!matches.length){
    const refineHint =
      !data.aiEnabled && Array.isArray(refineChips) && refineChips.some((c) => c.id === 'add_detail')
        ? t('discovery.try_a_chip_or_add_an')
        : '';
    if(typeof renderEmptyState==='function'){
      renderEmptyState(resultsEl, {
        icon:(typeof TabElements!=='undefined'&&TabElements.markHtml)?TabElements.markHtml('peepal',40):'🌳',
        title:t('discovery.no_matches_yet'),
        message: t('discovery.no_eligible_people_try_broader') + refineHint,
        actionLabel: t('common.invite'),
        onAction: () => {
          if (typeof shareInviteToChaupaal === 'function') shareInviteToChaupaal();
          else if (typeof ChaupaalReferrals?.openInviteToChaupaalShare === 'function') {
            ChaupaalReferrals.openInviteToChaupaalShare();
          }
        },
      });
    } else {
      resultsEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);">${tHtml('discovery.no_eligible_people_try_broader')}${refineHint}</div>`;
    }
    return;
  }

  const esc = (s) => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  resultsEl.innerHTML = `
    ${aiMsgExhausted ? `<div class="peepal-ai-limit-banner">${aiMsgLimit.unlock ? esc(aiMsgLimit.unlock) : tHtml('discovery.ai_discovery_messaging_limit_reached_find')} ${tHtml('discovery.professional_stay_unlimited')}</div>` : ''}
    <div id="peepalAiMeterHost"></div>
    <div id="peepalAiResultsBody">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;">${tHtml('discovery.top_matches', { count: matches.length })}</div>
        <div style="font-size:11px;color:var(--muted);">${plan.vibe ? `"${esc(String(plan.vibe).slice(0,40))}"` : (data.mode === 'deterministic' ? tHtml('discovery.preference_match') : tHtml('discovery.ai_assisted'))}</div>
      </div>
      ${refineChips.length ? `<div class="discovery-refine-chips" data-nav-ignore="1">${refineChips.map(c=>`<button type="button" class="peepal-nudge-chip" data-refine="${esc(c.id)}">${esc(optionLabel('discovery.refine', c.id) !== c.id ? optionLabel('discovery.refine', c.id) : c.label)}</button>`).join('')}</div>` : ''}
    </div>
  `;
  const bodyEl = resultsEl.querySelector('#peepalAiResultsBody') || resultsEl;
  const meterHost = resultsEl.querySelector('#peepalAiMeterHost');
  if (meterHost && typeof AiDiscoveryMeter?.mountMeter === 'function') {
    AiDiscoveryMeter.mountMeter(meterHost, { compact: true });
  }

  resultsEl.querySelectorAll('[data-refine]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.refine;
      let next = query;
      if (id === 'widen_location') next = `${query} anywhere`;
      else if (id === 'include_everyone' || id === 'gender_everyone') next = `${query} everyone`;
      else if (id === 'gender_women') next = `${query} women`;
      else if (id === 'gender_men') next = `${query} men`;
      const surface = resultsEl.id === 'khojIntentResults' ? 'khoj' : 'vriksha';
      runPeepalAiSearch({ query: next, resultsEl, surface });
    });
  });

  if (typeof enrichUsersWithProfileType === 'function') {
    await enrichUsersWithProfileType(matches);
  }

  matches.forEach((m) => {
    const user = {
      uid: m.uid,
      name: m.name,
      username: m.username,
      photoURL: m.photoURL,
      city: m.city,
      age: m.age,
      bio: m.bio,
      interests: m.interests || [],
      icebreakers: m.icebreakers || [],
      profileType: m.profileType || 'personal',
      profileTheme: m.profileTheme || null,
      avatar: '👤',
    };
    const reason = typeof discoveryExplainText === 'function' ? discoveryExplainText(m.explain) : m.explain || t('discovery.matched_on_open_profile');
    const theirIb = typeof resolveIcebreakersFromUser==='function'?resolveIcebreakersFromUser(user):(user.icebreakers||[]);
    const ib = typeof craftSpecificIcebreaker==='function'
      ? craftSpecificIcebreaker(user, { shared: user.interests || [], reason })
      : (typeof pickIcebreakerSnippet==='function' ? pickIcebreakerSnippet(theirIb) : null);
    const starter = (ib && (ib.line || ib.answer))
      || (plan.searchIntent && plan.searchIntent !== 'any'
      ? t('discovery.starter_found_you_for', { name: String(user.name||'').split(' ')[0] || t('discovery.there'), intent: plan.searchIntent })
      : t('discovery.starter_found_you', { name: String(user.name||'').split(' ')[0] || t('discovery.there') }));

    const card = document.createElement('div');
    card.className = 'peepal-ai-result-card' + (user.profileTheme?.accent ? ' dp-themed cp-author-accent' : '');
    card.dataset.uid = user.uid;
    if (user.profileTheme?.accent) card.style.setProperty('--dp-accent', user.profileTheme.accent);
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:50px;height:50px;border-radius:var(--r-card,20px);background:var(--line);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;overflow:hidden;">
          ${user.photoURL?`<img src="${esc(user.photoURL)}" style="width:100%;height:100%;object-fit:cover;">`:(typeof renderUserAvatarHtml==='function'?renderUserAvatarHtml(user,{decorative:true}):(user.avatar||'👤'))}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:15px;">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(user.name,user):esc(user.name)}</div>
          <div style="font-size:11px;color:var(--muted);">${[user.city,user.age?user.age+'y':''].filter(Boolean).map(esc).join(' · ')}</div>
          ${user.bio?`<div style="font-size:11px;color:var(--muted);font-style:italic;margin-top:2px;">"${esc(user.bio)}"</div>`:''}
        </div>
      </div>
      ${(user.interests||[]).length?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;">${(user.interests||[]).slice(0,4).map(i=>`<span style="background:rgba(230,57,70,0.07);color:var(--red);border-radius:999px;padding:3px 9px;font-size:11px;font-weight:600;">${esc(i)}</span>`).join('')}</div>`:''}
      <div class="ai-match-reason" style="margin-top:8px;font-size:12px;color:var(--ink-secondary,var(--muted));">${esc(reason)}</div>
      ${ib?`<div class="discovery-icebreaker"><div class="discovery-icebreaker-label">${tHtml('discovery.conversation_starter')}</div><div class="discovery-icebreaker-text">"${esc(ib.line || ib.answer)}"</div></div>`:''}
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        <button type="button" class="peepal-ai-feedback" data-sig="more_like" title="${tHtml('common.more_like_this')}">${tHtml('discovery.more_like_this')}</button>
        <button type="button" class="peepal-ai-feedback" data-sig="not_interested" title="${tHtml('common.not_interested')}">${tHtml('discovery.not_interested')}</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button class="peepal-ai-view-btn" style="flex:1;padding:9px;background:var(--surface-sunken,var(--cream));border:2px solid var(--line);border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;">${tHtml('discovery.view_profile')}</button>
        <button class="peepal-ai-chat-btn" data-name="${esc(user.name)}" data-uid="${esc(user.uid)}" data-starter="${esc(starter)}" ${aiMsgExhausted && (user.profileType || 'personal') === 'personal' ? 'disabled aria-disabled="true"' : ''} style="flex:1;padding:9px;background:var(--red);color:#fff;border:none;border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;${aiMsgExhausted && (user.profileType || 'personal') === 'personal' ? 'opacity:.55;' : ''}">${esc(ib?.cta || t('discovery.ask_them'))}</button>
      </div>
    `;

    card.querySelectorAll('.peepal-ai-feedback').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const signal = btn.dataset.sig;
        try {
          if (typeof apiFetch === 'function') {
            await apiFetch('/api/peepal-reactions', {
              method: 'POST',
              needAuth: true,
              body: {
                action: 'discovery_person_signal',
                candidateUid: user.uid,
                signal,
                intentProfileId,
              },
            });
          }
          if (signal === 'not_interested') {
            try {
              const key = 'chaupaal_dismissed_uids';
              const arr = JSON.parse(localStorage.getItem(key) || '[]');
              if (user.uid && !arr.includes(user.uid)) arr.push(user.uid);
              localStorage.setItem(key, JSON.stringify(arr));
              if (typeof dismissedUids !== 'undefined' && dismissedUids?.add) {
                dismissedUids.add(user.uid);
              }
            } catch (err) {}
            card.remove();
            if (typeof showToast === 'function') {
              showToast(t('discovery.thanks_we_ll_show_fewer_like'));
            }
          } else if (typeof showToast === 'function') {
            showToast(t('common.noted_we_ll_show_more_like'));
          }
        } catch (err) {
          if (typeof showToast === 'function') showToast(t('common.could_not_save_preference'));
        }
      });
    });

    card.querySelector('.peepal-ai-view-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof openPublicProfile === 'function') {
        openPublicProfile(user, { uid: user.uid, username: user.username, context: 'discovery' });
      }
    });

    card.querySelector('.peepal-ai-chat-btn')?.addEventListener('click', (e) => {
      if (e.currentTarget.disabled || e.currentTarget.getAttribute('aria-disabled') === 'true') {
        if (typeof showToast === 'function') {
          showToast(aiMsgLimit?.unlock || t('discovery.messaging_limit_reached_find_still_works'));
        }
        return;
      }
      const name = e.currentTarget.dataset.name;
      const suggestedStarter = e.currentTarget.dataset.starter;
      if (typeof openDmWithSharedHello === 'function') {
        openDmWithSharedHello({
          uid: user.uid,
          name,
          avatar: user.avatar || '👤',
          theirIcebreakers: theirIb,
          starterText: suggestedStarter,
          origin: 'ai_discovery',
          peerProfileType: user.profileType || 'personal',
          matchMeta: { intentProfileId, signalScores: m.signalScores || {} },
        });
      }
    });

    bodyEl.appendChild(card);
  });
}

/** Local fallback when server discover is unavailable — never invents users. */
async function runPeepalAiSearchLocalFallback(query, resultsEl, opts){
  const limit = Math.max(1, Math.min(20, Number(opts?.limit) || DISCOVER_LIMIT_DEFAULT));
  const filters = opts?.filters || (typeof getDiscoveryFilterPayload === 'function' ? getDiscoveryFilterPayload() : {});
  const queryLower = typeof SearchNormalize !== 'undefined' ? SearchNormalize.expand(query) : String(query).toLowerCase();
  let quickCriteria = null;
  for(const [intent, criteria] of Object.entries(INTENT_MAP)){
    if(queryLower.includes(intent)){quickCriteria = {...criteria, detectedIntent: intent};break;}
  }
  if (!quickCriteria && opts?.chipIntent) {
    const chipKey = String(opts.chipIntent).toLowerCase();
    const mapped = INTENT_MAP[chipKey] || INTENT_MAP[chipKey.replace(/_/g, ' ')];
    if (mapped) quickCriteria = { ...mapped, detectedIntent: chipKey };
  }
  let criteria = {interests:[],ageRange:{min:null,max:null},gender:'any',city:null,personality:null,searchIntent:'any',vibe:'',conversationStarter:''};
  if(quickCriteria){
    criteria = {...criteria, ...quickCriteria, searchIntent: quickCriteria.detectedIntent || 'any'};
  }
  if (filters?.interest && filters.interest !== 'any') {
    criteria.interests = [...new Set([...(criteria.interests || []), filters.interest])];
  }

  const pool = [];
  if(db && currentUser){
    try{
      const snap = await db.collection('users_public').where('openToMeet','==',true).limit(40).get();
      snap.docs.forEach(d=>{
        const u=d.data();
        if(u.hiddenFromDiscovery) return;
        if((u.uid||d.id)!==currentUser.uid&&u.name){
          pool.push({ ...u, uid:u.uid||d.id });
        }
      });
    }catch(e){}
  }

  // Never invent: if pool empty, honest empty state (ignore SAMPLE_DISCOVERY_POOL fabricated names)
  if(!pool.length){
    if(typeof renderEmptyState==='function'){
      renderEmptyState(resultsEl, {
        icon:(typeof TabElements!=='undefined'&&TabElements.markHtml)?TabElements.markHtml('peepal',40):'🌳',
        title:t('discovery.no_matches_yet'),
        message:t('discovery.no_eligible_open_profiles_right_now'),
        actionLabel:t('common.invite'),
        onAction:()=>{
          if(typeof shareInviteToChaupaal==='function') shareInviteToChaupaal();
        },
      });
    } else {
      resultsEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);">${tHtml('discovery.no_eligible_open_profiles_right_now_2')}</div>`;
    }
    return;
  }

  const myCity = String(
    (typeof userProfile !== 'undefined' && userProfile?.city) ||
      (typeof digitalProfile !== 'undefined' && digitalProfile?.currentCity) ||
      ''
  )
    .trim()
    .toLowerCase();

  let filteredPool = pool.filter((u) => {
    if (typeof isDiscoveryEligibleUser === 'function' && !isDiscoveryEligibleUser(u)) return false;
    if (filters?.sameCity && myCity) {
      const city = String(u.city || u.profile?.currentCity || '')
        .trim()
        .toLowerCase();
      if (city !== myCity) return false;
    }
    if (filters?.recentlyJoined && typeof isRecentlyJoined === 'function' && !isRecentlyJoined(u)) {
      return false;
    }
    if (filters?.interest && filters.interest !== 'any') {
      const wanted = String(filters.interest).toLowerCase();
      const theirs = [...(u.interests || []), ...(u.profile?.interests || []), u.topCat]
        .filter(Boolean)
        .map((i) => String(i).toLowerCase());
      if (!theirs.some((i) => i === wanted || i.includes(wanted) || wanted.includes(i))) return false;
    }
    return true;
  });

  const scored = filteredPool.map(u=>{
    let score = 1;
    const reasons = [];
    const interests = (u.interests||[]).map(i=>String(i).toLowerCase());
    (criteria.interests||[]).forEach(i=>{
      if(interests.includes(String(i).toLowerCase())){ score += 20; reasons.push(i); }
    });
    if(criteria.city && (typeof SearchNormalize !== 'undefined' ? SearchNormalize.matches(u.city||'', criteria.city) : String(u.city||'').toLowerCase().includes(String(criteria.city).toLowerCase()))){
      score += 25; reasons.push('city');
    }
    // AI-off vague: still allow open profiles with a soft score when no structured hit
    if (score <= 1 && criteria.searchIntent && criteria.searchIntent !== 'any') score += 5;
    else if (score <= 1) score += 2;
    return {user:u, score, reasons };
  }).filter(m => m.score > 1).sort((a,b)=>b.score-a.score).slice(0,limit);

  const vague =
    criteria.searchIntent === 'any' &&
    !quickCriteria &&
    query.split(/\s+/).filter((w) => w.length > 2).length < 3;

  await renderIntentDiscoverResults(resultsEl, query, {
    mode: 'deterministic',
    aiEnabled: false,
    plan: { searchIntent: criteria.searchIntent, vibe: criteria.vibe, hardFilters: {}, appliedAssumptionIds: [], suppressedAssumptionIds: [] },
    refineChips: vague ? [{ id: 'add_detail', label: t('discovery.add_interests_or_city') }] : [],
    matches: scored.map(({user, score, reasons})=>({
      uid: user.uid,
      name: user.name,
      photoURL: user.photoURL,
      city: user.city,
      age: user.age,
      bio: user.bio,
      interests: user.interests || [],
      icebreakers: user.icebreakers || [],
      profileType: user.profileType || 'personal',
      score,
      explain: reasons.length ? t('discovery.matched_on_list', { list: (typeof formatList === 'function' ? formatList : (x) => x.join(', '))(reasons.slice(0,3).map((r) => (r === 'city' ? t('discovery.reason_city') : optionLabel('akhbaar.cat', r)))) }) : t('discovery.matched_on_open_profile'),
    })),
    empty: !scored.length,
    emptyMessage: vague
      ? t('discovery.try_a_chip_or_add_more')
      : t('discovery.no_matches_found_yet_try_broader'),
  });
}

// ===================== ACTIVITY STATUS =====================
let _activityInterval = null;
let _rtdbPresenceRef = null;
let _chatPresenceUnsubs = [];

function rtdbStatusRef(uid) {
  try {
    if (typeof firebase === 'undefined' || !firebase.database) return null;
    return firebase.database().ref(`status/${uid}`);
  } catch (e) {
    return null;
  }
}

function initActivityStatus(){
  if(!db||!currentUser) return;
  const statusRef = db.collection('user_status').doc(currentUser.uid);
  statusRef.set({online:true, lastSeen:firebase.firestore.FieldValue.serverTimestamp(), uid:currentUser.uid}).catch(()=>{});

  const rtdbRef = rtdbStatusRef(currentUser.uid);
  if (rtdbRef) {
    _rtdbPresenceRef = rtdbRef;
    const onlinePayload = { state: 'online', at: firebase.database.ServerValue.TIMESTAMP };
    const offlinePayload = { state: 'offline', at: firebase.database.ServerValue.TIMESTAMP };
    rtdbRef.set(onlinePayload).catch(()=>{});
    rtdbRef.onDisconnect().set(offlinePayload).catch(()=>{});
  }

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){
      statusRef.update({online:false,lastSeen:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
      rtdbRef?.set({ state: 'offline', at: firebase.database.ServerValue.TIMESTAMP }).catch(()=>{});
    } else {
      statusRef.update({online:true,lastSeen:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
      rtdbRef?.set({ state: 'online', at: firebase.database.ServerValue.TIMESTAMP }).catch(()=>{});
      rtdbRef?.onDisconnect().set({ state: 'offline', at: firebase.database.ServerValue.TIMESTAMP }).catch(()=>{});
    }
  });
  _activityInterval = setInterval(()=>{
    if(!document.hidden){
      statusRef.update({online:true,lastSeen:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
      rtdbRef?.update({ state: 'online', at: firebase.database.ServerValue.TIMESTAMP }).catch(()=>{});
    }
  },60000);
  window.addEventListener('beforeunload',()=>{
    statusRef.update({online:false,lastSeen:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
  });
}

function clearChatPresenceSubs() {
  (_chatPresenceUnsubs || []).forEach((fn) => {
    try { fn(); } catch (e) {}
  });
  _chatPresenceUnsubs = [];
}

async function getUserStatus(uid){
  if(!db) return null;
  try{
    const snap = await db.collection('user_status').doc(uid).get();
    if(!snap.exists) return null;
    return snap.data();
  }catch(e){return null;}
}

function formatActivityStatus(statusData){
  // Copy + relative time live in core/chat-presence.js (Global L3).
  const line = typeof ChatPresence !== 'undefined' && ChatPresence.presenceLine ? ChatPresence.presenceLine(statusData) : { online: false, html: '' };
  return line.online
    ? `<span class="chat-presence-line is-online"><span class="chat-presence-dot" aria-hidden="true"></span>${line.html}</span>`
    : `<span class="chat-presence-line">${line.html}</span>`;
}

function injectChatActivityStatus(uid){
  clearChatPresenceSubs();
  const el = document.getElementById('chatActivityStatus');
  if(!el || !uid) return;
  // Respect presence preference when set
  try {
    const prefs = typeof PushPrefs !== 'undefined' ? PushPrefs.loadPrefs?.() : null;
    if (prefs && prefs.chatPresence === false) {
      el.innerHTML = '';
      return;
    }
  } catch (e) {}

  const paint = (data) => {
    if (el) el.innerHTML = formatActivityStatus(data || {});
  };

  const rtdb = rtdbStatusRef(uid);
  if (rtdb) {
    const handler = (snap) => {
      const v = snap.val() || {};
      paint({ online: v.state === 'online', state: v.state, at: v.at });
    };
    rtdb.on('value', handler);
    _chatPresenceUnsubs.push(() => rtdb.off('value', handler));
  }

  if (db) {
    const unsub = db.collection('user_status').doc(uid).onSnapshot(
      (snap) => {
        if (!snap.exists) return;
        const d = snap.data() || {};
        // Only apply Firestore when RTDB says offline / unavailable
        const cur = el?.querySelector('.is-online');
        if (cur && rtdb) return;
        paint(d);
      },
      () => {}
    );
    _chatPresenceUnsubs.push(() => {
      try { unsub(); } catch (e) {}
    });
  } else {
    getUserStatus(uid).then(paint);
  }
}

window.clearChatPresenceSubs = clearChatPresenceSubs;
window.injectChatActivityStatus = injectChatActivityStatus;

// ===================== OPEN TO MEET ENFORCEMENT =====================
function isOpenToMeet(userObj){
  return userObj?.openToMeet !== false; // default true
}

function filterOpenToMeetProfiles(profiles){
  return profiles.filter(p => isOpenToMeet(p));
}

// Discovery profile loading + openToMeet filtering lives in discovery-core.js

// Show explanation when toggling open-to-meet
function handleOpenToMeetToggle(newValue){
  openToMeet = newValue;
  try{localStorage.setItem('chaupaal_open_to_meet', JSON.stringify(openToMeet));}catch(e){}
  if(db&&currentUser) db.collection('users').doc(currentUser.uid).update({openToMeet}).then(()=>{
    if(typeof UsersPublic?.syncPublicProfile==='function'){
      UsersPublic.syncPublicProfile(currentUser.uid, {...(userProfile||{}), openToMeet});
    }
  }).catch(()=>{});

  if(newValue){
    // Show what it means
    const sheet = document.createElement('div');
    sheet.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:24px;z-index:100;';
    sheet.innerHTML=`
      <div style="font-size:28px;text-align:center;margin-bottom:12px;">👋</div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;text-align:center;margin-bottom:8px;">${tHtml('discovery.you_re_open_to_meeting_people')}</div>
      <div style="font-size:13px;color:var(--muted);text-align:center;line-height:1.6;margin-bottom:16px;">${tHtml('discovery.your_profile_may_now_appear_in')}</div>
      <div style="background:var(--cream);border-radius:14px;padding:14px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:700;color:var(--ink);margin-bottom:8px;">${tHtml('discovery.what_this_means')}</div>
        ${/* i18n-copy */ [t('discovery.your_profile_shows_up_in_peepal'),t('discovery.ai_search_results_include_you_when'),t('discovery.you_ll_see_more_relevant_people'),t('discovery.you_can_turn_off_at_any')].map(line=>`<div style="font-size:12px;color:var(--muted);padding:4px 0;display:flex;gap:8px;"><span>✓</span><span>${line}</span></div>`).join('')}
      </div>
      <button id="closeOpenToMeetSheet" style="width:100%;padding:14px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;">${tHtml('discovery.got_it')}</button>
    `;
    document.querySelector('.device').appendChild(sheet);
    document.getElementById('closeOpenToMeetSheet').addEventListener('click',()=>sheet.remove());
  } else {
    showToast(t('peepal_discovery_off'));
  }
}

// ===================== ANONYMOUS QUESTIONS IN PEEPAL =====================
async function getAnonRemaining() {
  if (typeof PolicyUsage?.getRemaining === 'function') {
    return PolicyUsage.getRemaining('anon');
  }
  const lim = window.PolicyLimits?.ANON_POSTS || { perDay: 2, perWeek: 7 };
  return {
    remaining: lim.perDay,
    dayLeft: lim.perDay,
    weekLeft: lim.perWeek,
    perDay: lim.perDay,
    perWeek: lim.perWeek,
    exhausted: false,
    unlock: '',
  };
}

function openPeepalAskSheet(editPost = null){
  const isEdit = !!(editPost && (editPost.firestoreId || editPost.id));
  const editId = isEdit ? (editPost.firestoreId || editPost.id) : null;
  const sheet = document.createElement('div');
  sheet.className = 'peepal-ask-sheet';
  const lim = window.PolicyLimits?.ANON_POSTS || { perDay: 2, perWeek: 7 };
  const attachDefs = [
    { type: 'photo', icon: '📷', label: t('common.photo') },
    { type: 'video', icon: '🎬', label: t('discovery.video') },
    { type: 'music', icon: '🎵', label: t('common.music') },
    { type: 'voice', icon: '🎤', label: t('discovery.voice') },
    { type: 'gif', icon: 'GIF', label: t('discovery.gif_more') },
    { type: 'sticker', icon: '😄', label: t('discovery.sticker') },
    { type: 'link', icon: '🔗', label: t('discovery.link') },
    { type: 'location', icon: '📍', label: t('discovery.location') },
    { type: 'mention', icon: '@', label: t('discovery.mention') },
    { type: 'hashtag', icon: '#', label: t('discovery.hashtag') },
    { type: 'document', icon: '📄', label: t('discovery.document') },
    { type: 'collab', icon: '🤝', label: t('discovery.collab') },
  ];
  let composeAttachments = [];
  let selectedCap = '10';
  sheet.innerHTML = `
    <div class="peepal-ask-header">
      <button id="closeAsk" aria-label="${tHtml('common.close')}" style="background:var(--surface-sunken,var(--cream));border:none;border-radius:999px;cursor:pointer;padding:8px;color:var(--ink);width:36px;height:36px;display:flex;align-items:center;justify-content:center;">${typeof iconHtml==='function' ? iconHtml('x',{size:18}) : '✕'}</button>
      <div class="peepal-ask-title">${isEdit ? tHtml('discovery.edit_discussion') : tHtml('common.discuss')}</div>
      <button id="peepalPublishBtn" style="background:var(--red);color:#fff;border:none;border-radius:999px;padding:8px 20px;font:700 14px 'Space Grotesk',sans-serif;min-width:60px;cursor:pointer;">${isEdit ? tHtml('common.save') : tHtml('common.share')}</button>
    </div>
    <div class="peepal-ask-body">
      <div id="anonToggleRow" style="background:var(--line);border:2px solid var(--line);border-radius:14px;padding:12px;margin-bottom:16px;display:${isEdit ? 'none' : 'flex'};align-items:center;gap:12px;opacity:0.5;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">${tHtml('discovery.share_anonymously')}</div>
          <div id="anonToggleHint" style="font-size:11px;color:var(--muted);">${tHtml('discovery.anonymous_posts_don_t_reveal_your')}</div>
        </div>
        <label class="switch" id="anonToggleLabel" style="pointer-events:none;"><input type="checkbox" id="anonToggle" disabled><span class="slider"></span></label>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;">
        ${[{id:'open',label:t('common.open')},{id:'poll',label:t('discovery.poll')},{id:'form',label:t('discovery.form')}].map((f,i)=>`<button class="peepal-format-chip${i===0?' active':''}" data-fmt="${f.id}" style="padding:8px 14px;border-radius:999px;border:2px solid ${i===0?'var(--red)':'var(--line)'};background:${i===0?'rgba(230,57,70,0.08)':'var(--white)'};font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;color:${i===0?'var(--red)':'var(--ink)'};">${f.label}</button>`).join('')}
      </div>
      <textarea id="peepalQText" placeholder="${tHtml('discovery.whats_on_your_mind')}" style="width:100%;min-height:100px;border:2px solid var(--line);border-radius:14px;padding:12px;font-family:Inter,sans-serif;font-size:15px;outline:none;resize:none;box-sizing:border-box;background:var(--cream);"></textarea>
      <div class="peepal-compose-toolbar" id="peepalComposeToolbar">
        <button type="button" class="pct-btn" data-attach="photo" title="${tHtml('common.photo')}">📷</button>
        <button type="button" class="pct-btn" data-attach="gif" title="GIF">GIF</button>
        <button type="button" class="pct-btn" data-attach="music" title="${tHtml('common.music')}">🎵</button>
        <button type="button" class="pct-btn pct-btn--more" id="peepalAttachMore" title="${tHtml('common.more')}">+</button>
      </div>
      <div class="peepal-attach-preview" id="peepalAttachPreview"></div>
      <div id="peepalAttachGridHost"></div>
      <div id="peepalLinkRow" class="peepal-link-row" style="display:none;"><input id="peepalLinkInput" type="url" placeholder="https://"><button type="button" id="peepalLinkAdd">${tHtml('discovery.add')}</button></div>
      <div id="peepalCollabRow" class="peepal-collab-row" style="display:none;"><input id="peepalCollabInput" type="text" placeholder="${tHtml('discovery.invite_co_author_by_username')}"><button type="button" id="peepalCollabAdd">${tHtml('discovery.add')}</button></div>
      <div id="mcqOptions" style="margin-top:10px;display:none;">
        ${[1,2,3,4].map(i=>`<input id="mcqOpt${i}" placeholder="${i>2?tHtml('discovery.option_n_optional', { n: i }):tHtml('discovery.option_n', { n: i })}" style="width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;outline:none;margin-bottom:8px;box-sizing:border-box;background:var(--white);">`).join('')}
      </div>
      <div id="peepalFormBuilder" class="peepal-form-builder" style="display:none;margin-top:10px;">
        <div id="peepalFormQs"></div>
        <button type="button" class="peepal-form-add" id="peepalFormAddQ">${tHtml('discovery.add_question')}</button>
      </div>
      <div id="peepalAudienceRow" style="margin-top:8px;">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${tHtml('discovery.audience')}</div>
        <select id="peepalAudience" style="width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;background:var(--white);outline:none;">
          <option value="everyone">${tHtml('discovery.everyone')}</option>
          <option value="followers">${tHtml('discovery.followers_only')}</option>
          <option value="custom">${tHtml('discovery.custom')}</option>
          <option value="save_only">${tHtml('discovery.save_without_posting')}</option>
        </select>
        <p id="peepalAudienceHint" class="peepal-audience-hint">${tHtml('discovery.everyone_ranked_for_people_who_may')}</p>
        <textarea id="peepalCustomAudience" class="peepal-custom-audience" hidden rows="2" placeholder="${tHtml('discovery.describe_who_should_see_this_e')}"></textarea>
        <div id="peepalMultiSeg" class="peepal-multi-seg" hidden></div>
      </div>
      <!-- Response cap -->
      <div style="margin-top:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;
                    letter-spacing:0.05em;margin-bottom:6px;">${tHtml('discovery.responses_wanted')}</div>
        <div id="peepalResponseCapRow" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button type="button" class="peepal-cap-btn active" data-cap="10">10</button>
          <button type="button" class="peepal-cap-btn" data-cap="25">25</button>
          <button type="button" class="peepal-cap-btn peepal-cap-btn--free-max" data-cap="50">50</button>
          <input type="number" id="peepalCapInput" min="1" max="50" value="10" inputmode="numeric" class="peepal-cap-input" aria-label="${tHtml('discovery.response_cap')}">
          <button type="button" class="peepal-cap-btn peepal-cap-btn--pro" data-cap="100"
                  title="${tHtml('discovery.pradhan_sarpanch')}">100 ✦</button>
          <button type="button" class="peepal-cap-btn peepal-cap-btn--pro" data-cap="500"
                  title="${tHtml('discovery.pradhan_sarpanch')}">500 ✦</button>
          <button type="button" class="peepal-cap-btn peepal-cap-btn--pro" data-cap="unlimited"
                  title="${tHtml('discovery.pradhan_sarpanch')}">${tHtml('discovery.unlimited')}</button>
        </div>
        <div id="peepalCapHint" style="font-size:11px;color:var(--muted);margin-top:5px;line-height:1.4;">
          ${tHtml('discovery.free_posts_get_up_to_50')}
        </div>
        <div id="peepalCapNudge" class="peepal-cap-nudge" hidden></div>
        <p id="peepalPremiumNudge" class="peepal-premium-nudge">${tHtml('discovery.pradhan_sarpanch_can_split_responses_acros')}</p>
      </div>
      <input id="peepalPhotoInput" type="file" accept="image/*" hidden>
      <input id="peepalVideoInput" type="file" accept="video/*" hidden>
      <input id="peepalAudioInput" type="file" accept="audio/*" hidden>
      <input id="peepalDocInput" type="file" accept=".pdf,.doc,.docx,.txt" hidden>
    </div>
  `;
  document.querySelector('.device').appendChild(sheet);
  const shell = document.getElementById('peepalAskSheet');
  if (shell && shell !== sheet) {
    shell.id = 'peepalAskSheetShell';
    shell.classList.add('hidden');
  }
  sheet.id = 'peepalAskSheet';
  requestAnimationFrame(()=>sheet.classList.add('open'));
  if(typeof pushNavLayer==='function'){
    sheet.dataset.navManaged='1';
    pushNavLayer(sheet,()=>{ sheet.classList.remove('open'); setTimeout(()=>sheet.remove(),350); });
  }

  let peepalAskCat = '';
  let formQuestions = [
    { id: 'q1', type: 'short', prompt: '', required: true, options: ['', ''] },
  ];
  let extraSegments = [];

  function isPremiumPeepal() {
    return typeof PeepalAudience?.isPremiumPeepal === 'function' ? PeepalAudience.isPremiumPeepal() : false;
  }

  function syncAnonAudience() {
    const on = !!sheet.querySelector('#anonToggle')?.checked;
    const row = sheet.querySelector('#peepalAudienceRow');
    if (row) row.hidden = on;
  }

  function syncAudienceHint() {
    const val = sheet.querySelector('#peepalAudience')?.value || 'everyone';
    const hint = sheet.querySelector('#peepalAudienceHint');
    const custom = sheet.querySelector('#peepalCustomAudience');
    if (custom) custom.hidden = val !== 'custom';
    if (hint) {
      hint.textContent =
        val === 'followers'
          ? t('discovery.only_people_who_follow_you')
          : val === 'custom'
            ? t('discovery.we_ll_match_this_description_as')
            : val === 'save_only'
              ? t('discovery.saved_to_your_archive_not_the')
              : t('discovery.everyone_ranked_for_people_who_may');
    }
  }

  function renderFormBuilder() {
    const host = sheet.querySelector('#peepalFormQs');
    if (!host) return;
    host.innerHTML = formQuestions
      .map((q, i) => {
        const opts =
          q.type === 'choice' || q.type === 'checks'
            ? (q.options || ['', ''])
                .map(
                  (o, oi) =>
                    `<input class="peepal-form-opt" data-qi="${i}" data-oi="${oi}" value="${String(o || '').replace(/"/g, '&quot;')}" placeholder="${tHtml('discovery.option_n', { n: oi + 1 })}">`
                )
                .join('') +
              `<button type="button" class="peepal-form-addopt" data-qi="${i}">${tHtml('discovery.option')}</button>`
            : '';
        return `<div class="peepal-form-q" data-qi="${i}">
          <div class="peepal-form-q-head">
            <select data-qtype="${i}">
              <option value="short"${q.type === 'short' ? ' selected' : ''}>${tHtml('discovery.short_text')}</option>
              <option value="long"${q.type === 'long' ? ' selected' : ''}>${tHtml('discovery.long_text')}</option>
              <option value="choice"${q.type === 'choice' ? ' selected' : ''}>${tHtml('discovery.multiple_choice')}</option>
              <option value="checks"${q.type === 'checks' ? ' selected' : ''}>${tHtml('discovery.checkboxes')}</option>
            </select>
            <label><input type="checkbox" data-qreq="${i}" ${q.required ? 'checked' : ''}> ${tHtml('discovery.required')}</label>
            <button type="button" data-qdel="${i}" ${formQuestions.length < 2 ? 'disabled' : ''}>${tHtml('discovery.delete')}</button>
          </div>
          <input data-qprompt="${i}" placeholder="${tHtml('discovery.question_n', { n: i + 1 })}" value="${String(q.prompt || '').replace(/"/g, '&quot;')}">
          ${opts}
        </div>`;
      })
      .join('');
    host.querySelectorAll('[data-qtype]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const i = Number(sel.getAttribute('data-qtype'));
        formQuestions[i].type = sel.value;
        if ((sel.value === 'choice' || sel.value === 'checks') && !(formQuestions[i].options || []).length) {
          formQuestions[i].options = ['', ''];
        }
        renderFormBuilder();
      });
    });
    host.querySelectorAll('[data-qreq]').forEach((cb) => {
      cb.addEventListener('change', () => {
        formQuestions[Number(cb.getAttribute('data-qreq'))].required = cb.checked;
      });
    });
    host.querySelectorAll('[data-qprompt]').forEach((inp) => {
      inp.addEventListener('input', () => {
        formQuestions[Number(inp.getAttribute('data-qprompt'))].prompt = inp.value;
      });
    });
    host.querySelectorAll('.peepal-form-opt').forEach((inp) => {
      inp.addEventListener('input', () => {
        const qi = Number(inp.dataset.qi);
        const oi = Number(inp.dataset.oi);
        if (!formQuestions[qi].options) formQuestions[qi].options = [];
        formQuestions[qi].options[oi] = inp.value;
      });
    });
    host.querySelectorAll('.peepal-form-addopt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.qi);
        formQuestions[i].options = (formQuestions[i].options || []).concat(['']);
        renderFormBuilder();
      });
    });
    host.querySelectorAll('[data-qdel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-qdel'));
        if (formQuestions.length < 2) return;
        formQuestions.splice(i, 1);
        renderFormBuilder();
      });
    });
  }

  sheet.querySelector('#peepalFormAddQ')?.addEventListener('click', () => {
    formQuestions.push({
      id: 'q' + (formQuestions.length + 1) + '_' + Date.now().toString(36),
      type: 'short',
      prompt: '',
      required: false,
      options: ['', ''],
    });
    renderFormBuilder();
  });
  renderFormBuilder();

  const premiumNudge = sheet.querySelector('#peepalPremiumNudge');
  if (premiumNudge) premiumNudge.hidden = isPremiumPeepal();

  function renderMultiSeg() {
    const host = sheet.querySelector('#peepalMultiSeg');
    if (!host) return;
    if (!isPremiumPeepal()) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    host.innerHTML =
      extraSegments
        .map(
          (s, i) =>
            `<div class="peepal-seg-row">
              <select data-seg-aud="${i}">
                <option value="everyone"${s.audience === 'everyone' ? ' selected' : ''}>${tHtml('discovery.everyone')}</option>
                <option value="followers"${s.audience === 'followers' ? ' selected' : ''}>${tHtml('discovery.followers')}</option>
                <option value="custom"${s.audience === 'custom' ? ' selected' : ''}>${tHtml('discovery.custom')}</option>
              </select>
              <input data-seg-cap="${i}" type="number" min="1" value="${s.cap || 10}" style="width:64px;">
              ${s.audience === 'custom' ? `<input data-seg-txt="${i}" placeholder="${tHtml('discovery.who')}" value="${String(s.customAudienceText || '').replace(/"/g, '&quot;')}">` : ''}
              <button type="button" data-seg-del="${i}">×</button>
            </div>`
        )
        .join('') + `<button type="button" id="peepalAddSeg">${tHtml('discovery.add_audience_segment')}</button>`;
    host.querySelector('#peepalAddSeg')?.addEventListener('click', () => {
      extraSegments.push({ audience: 'followers', cap: 10, customAudienceText: '' });
      renderMultiSeg();
    });
    host.querySelectorAll('[data-seg-aud]').forEach((sel) => {
      sel.addEventListener('change', () => {
        extraSegments[Number(sel.getAttribute('data-seg-aud'))].audience = sel.value;
        renderMultiSeg();
      });
    });
    host.querySelectorAll('[data-seg-cap]').forEach((inp) => {
      inp.addEventListener('input', () => {
        extraSegments[Number(inp.getAttribute('data-seg-cap'))].cap = Number(inp.value) || 10;
      });
    });
    host.querySelectorAll('[data-seg-txt]').forEach((inp) => {
      inp.addEventListener('input', () => {
        extraSegments[Number(inp.getAttribute('data-seg-txt'))].customAudienceText = inp.value;
      });
    });
    host.querySelectorAll('[data-seg-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        extraSegments.splice(Number(btn.getAttribute('data-seg-del')), 1);
        renderMultiSeg();
      });
    });
  }
  renderMultiSeg();

  let anonQuota = { exhausted: true, remaining: 0, dayLeft: 0, weekLeft: lim.perWeek, unlock: '' };
  (async () => {
    try {
      anonQuota = await getAnonRemaining();
    } catch (e) {}
    const row = document.getElementById('anonToggleRow');
    const hint = document.getElementById('anonToggleHint');
    const label = document.getElementById('anonToggleLabel');
    const toggle = document.getElementById('anonToggle');
    if (!row || !hint || !toggle) return;
    const available = !anonQuota.exhausted && anonQuota.remaining > 0 && !anonQuota.readFailed;
    if (available) {
      row.style.background = 'rgba(230,57,70,0.05)';
      row.style.borderColor = 'var(--red)';
      row.style.opacity = '1';
      hint.textContent = t('discovery.dayleft_anonymous_left_today_weekleft_this', { dayLeft: anonQuota.dayLeft, weekLeft: anonQuota.weekLeft, perDay: lim.perDay, perWeek: lim.perWeek });
      label.style.pointerEvents = '';
      toggle.disabled = false;
    } else {
      row.style.background = 'var(--line)';
      row.style.borderColor = 'var(--line)';
      row.style.opacity = '0.5';
      hint.textContent = anonQuota.readFailed
        ? (anonQuota.unlock || t('discovery.couldn_t_verify_anonymous_limit_try'))
        : (anonQuota.unlock || t('discovery.anonymous_posting_unavailable_right_now'));
      label.style.pointerEvents = 'none';
      toggle.disabled = true;
      toggle.checked = false;
    }
  })();

  function addAttachment(item){
    const idx = composeAttachments.findIndex((x) => x.type === item.type);
    if (item.type === 'collab') {
      composeAttachments = composeAttachments.filter((x) => x.type !== 'collab');
      composeAttachments.push(item);
    } else if (idx >= 0) composeAttachments[idx] = item;
    else composeAttachments.push(item);
    renderAttachPreview();
  }
  function removeAttachment(type){
    composeAttachments = composeAttachments.filter((a) => a.type !== type);
    renderAttachPreview();
  }
  function renderAttachPreview(){
    const host = document.getElementById('peepalAttachPreview');
    if (!host) return;
    host.innerHTML = composeAttachments.map((a) => {
      const lbl = String(a.label || a.name || a.type);
      return `<div class="peepal-attach-chip">${lbl}<button type="button" data-rm="${a.type}" aria-label="${tHtml('discovery.remove')}">×</button></div>`;
    }).join('');
    host.querySelectorAll('[data-rm]').forEach((btn) => btn.addEventListener('click', () => removeAttachment(btn.dataset.rm)));
  }
  function toastUnavailable(kind, reason){
    if (typeof showToast === 'function') {
      showToast(reason || t('discovery.kind_isn_t_available_here', { kind }));
    }
  }
  function renderAttachGrid(){
    const host = document.getElementById('peepalAttachGridHost');
    if (!host) return;
    const grid = host.querySelector('.peepal-attach-grid');
    if (grid) {
      grid.remove();
      return;
    }
    const el = document.createElement('div');
    el.className = 'peepal-attach-grid';
    el.innerHTML = attachDefs.map((d) => `<button type="button" class="peepal-attach-grid-btn" data-attach="${d.type}">${d.icon}<span>${d.label}</span></button>`).join('');
    host.appendChild(el);
    el.querySelectorAll('[data-attach]').forEach((b) => b.addEventListener('click', () => handleAttach(b.dataset.attach)));
  }
  async function handleAttach(type){
    const text = document.getElementById('peepalQText');
    if (type === 'photo') return document.getElementById('peepalPhotoInput')?.click();
    if (type === 'video') return document.getElementById('peepalVideoInput')?.click();
    if (type === 'document') return document.getElementById('peepalDocInput')?.click();
    if (type === 'music') {
      if (typeof openMusicPicker === 'function') {
        return openMusicPicker({ onSelect: (song) => song && addAttachment({ type: 'music', label: `🎵 ${song.title || t('common.music')}`, song }) });
      }
      return document.getElementById('peepalAudioInput')?.click();
    }
    if (type === 'gif') {
      const openPicker =
        typeof openKlipyMediaPicker === 'function'
          ? openKlipyMediaPicker
          : typeof openGifPicker === 'function'
            ? openGifPicker
            : null;
      if (!openPicker) return toastUnavailable('GIF', t('discovery.gif_picker_isn_t_available_right'));
      return openPicker({
        onSelect: (gif) => {
          if (!gif) return;
          if (gif.emoji && !gif.url) {
            addAttachment({ type: 'sticker', label: t('discovery.emoji_sticker', { emoji: gif.emoji }), emoji: gif.emoji });
            return;
          }
          if (!gif.url) return;
          const kind = String(gif.kind || gif.type || 'gif').toLowerCase();
          const label =
            kind === 'sticker' ? t('discovery.sticker') : kind === 'meme' ? t('discovery.meme') : kind === 'clip' ? t('duniya.clip') : 'GIF';
          addAttachment({
            type: kind,
            label,
            url: gif.url,
            preview: gif.preview || gif.previewUrl || gif.url,
            mime: gif.mime || '',
            duration: gif.duration || null,
            title: gif.title || label,
          });
        },
      });
    }
    if (type === 'sticker') {
      const openStickers =
        typeof openStickerPicker === 'function'
          ? openStickerPicker
          : typeof openKlipyMediaPicker === 'function'
            ? (opts) => openKlipyMediaPicker(Object.assign({ kind: 'sticker' }, opts || {}))
            : null;
      if (!openStickers) return toastUnavailable(t('discovery.sticker'), t('discovery.stickers_aren_t_available_right_now'));
      return openStickers({
        onSelect: (sticker) => {
          if (!sticker) return;
          if (typeof sticker === 'string') {
            addAttachment({ type: 'sticker', label: t('discovery.sticker_sticker', { sticker }), emoji: sticker });
            return;
          }
          if (sticker.emoji && !sticker.url) {
            addAttachment({ type: 'sticker', label: t('discovery.emoji_sticker', { emoji: sticker.emoji }), emoji: sticker.emoji });
            return;
          }
          if (sticker.url) {
            addAttachment({
              type: 'sticker',
              label: t('discovery.sticker'),
              url: sticker.url,
              preview: sticker.preview || sticker.previewUrl || sticker.url,
              title: sticker.title || t('discovery.sticker'),
            });
          }
        },
      });
    }
    if (type === 'voice') {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        return toastUnavailable(t('discovery.voice'), t('discovery.voice_recording_isn_t_supported_on'));
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: 'audio/webm' });
          addAttachment({ type: 'voice', label: t('discovery.voice_2'), blob });
        };
        rec.start();
        if (typeof showToast === 'function') showToast(t('discovery.recording'));
        setTimeout(() => rec.state !== 'inactive' && rec.stop(), 6000);
      } catch (e) {
        if (typeof showToast === 'function') showToast(t('discovery.mic_permission_denied'));
      }
      return;
    }
    if (type === 'location') {
      if (!navigator.geolocation) {
        return toastUnavailable(t('discovery.location'), t('discovery.location_isn_t_supported_on_this'));
      }
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = Number(pos.coords?.latitude || 0).toFixed(4);
        const lng = Number(pos.coords?.longitude || 0).toFixed(4);
        const label = typeof resolveLocationLabel === 'function' ? resolveLocationLabel(pos.coords) : `${lat}, ${lng}`;
        addAttachment({ type: 'location', label: `📍 ${label}`, lat: Number(lat), lng: Number(lng) });
      }, () => {
        if (typeof showToast === 'function') showToast(t('discovery.location_unavailable'));
      });
      return;
    }
    if (type === 'mention') {
      if (text) {
        text.value = `${text.value || ''}@`;
        text.focus();
      }
      if (typeof openMentionAutocomplete === 'function') openMentionAutocomplete(text);
      return;
    }
    if (type === 'hashtag') {
      if (text) {
        text.value = `${text.value || ''}#`;
        text.focus();
      }
      return;
    }
    if (type === 'link') {
      const row = document.getElementById('peepalLinkRow');
      if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
      return;
    }
    if (type === 'collab') {
      const row = document.getElementById('peepalCollabRow');
      if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
      return;
    }
    toastUnavailable(type, t('discovery.type_isn_t_available_here', { type }));
  }

  // Wire format chips
  sheet.querySelectorAll('.peepal-format-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      sheet.querySelectorAll('.peepal-format-chip').forEach(c=>{c.classList.remove('active');c.style.borderColor='var(--line)';c.style.background='var(--white)';c.style.color='var(--ink)';});
      chip.classList.add('active');chip.style.borderColor='var(--red)';chip.style.background='rgba(230,57,70,0.08)';chip.style.color='var(--red)';
      const fmt = chip.dataset.fmt;
      document.getElementById('mcqOptions').style.display = fmt === 'poll' ? 'block' : 'none';
      const fb = document.getElementById('peepalFormBuilder');
      if (fb) fb.style.display = fmt === 'form' ? 'block' : 'none';
    });
  });
  const capRow = document.getElementById('peepalResponseCapRow');
  const capHint = document.getElementById('peepalCapHint');
  const capInput = document.getElementById('peepalCapInput');
  const capNudge = document.getElementById('peepalCapNudge');
  const freeMax = typeof PeepalAudience?.FREE_MAX_CAP === 'number' ? PeepalAudience.FREE_MAX_CAP : 50;
  const setCapUi = (cap) => {
    let next = String(cap || '10');
    const n = Number(next);
    if (next !== 'unlimited' && Number.isFinite(n)) {
      if (!isPremiumPeepal() && n > freeMax) {
        if (capNudge) {
          capNudge.hidden = false;
          capNudge.innerHTML = `${tHtml('discovery.free_accounts_stop_at', { count: freeMax })} <button type="button" class="peepal-soft-cta" id="peepalCapUpsell">${tHtml('discovery.see_chaupaal_money')}</button>`;
          capNudge.querySelector('#peepalCapUpsell')?.addEventListener('click', () => {
            if (typeof openProUpsell === 'function') openProUpsell('response_cap');
            else if (typeof ChaupaalMoney?.openMembership === 'function') ChaupaalMoney.openMembership();
          });
        }
        next = String(freeMax);
        if (capInput) capInput.value = freeMax;
      } else if (capNudge) capNudge.hidden = true;
    }
    selectedCap = next;
    if (capInput && next !== 'unlimited' && Number.isFinite(Number(next))) capInput.value = String(next);
    capRow?.querySelectorAll('.peepal-cap-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.cap === selectedCap);
    });
    if (capHint) {
      capHint.textContent =
        selectedCap === 'unlimited'
          ? t('discovery.unlimited_responses_membership')
          : t('discovery.your_post_will_stop_collecting_new', { selectedCap });
    }
  };
  capRow?.querySelectorAll('.peepal-cap-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cap = btn.dataset.cap;
      const isPro = btn.classList.contains('peepal-cap-btn--pro');
      if (isPro && !isPremiumPeepal()) {
        if (typeof openProUpsell === 'function') openProUpsell('response_cap');
        else if (typeof ChaupaalMoney?.openMembership === 'function') ChaupaalMoney.openMembership();
        else if (typeof showToast === 'function') showToast(t('discovery.higher_caps_on_pradhan_sarpanch'));
        return;
      }
      setCapUi(cap);
    });
  });
  capInput?.addEventListener('input', () => {
    setCapUi(capInput.value);
  });
  sheet.querySelector('#peepalAudience')?.addEventListener('change', syncAudienceHint);
  sheet.querySelector('#anonToggle')?.addEventListener('change', syncAnonAudience);
  syncAudienceHint();
  syncAnonAudience();

  const qText=document.getElementById('peepalQText');
  const audienceSel=document.getElementById('peepalAudience');
  let peepalDraft=null;
  if(typeof bindDraftAutosave==='function'){
    peepalDraft=bindDraftAutosave({
      name:'peepal',
      fields:[qText,audienceSel,document.getElementById('mcqOpt1'),document.getElementById('mcqOpt2'),document.getElementById('mcqOpt3'),document.getElementById('mcqOpt4')],
      getState:()=>({
        question:qText?.value||'',
        audience:audienceSel?.value||'everyone',
        format:sheet.querySelector('.peepal-format-chip.active')?.dataset.fmt||'open',
        opts:[1,2,3,4].map(i=>document.getElementById(`mcqOpt${i}`)?.value||''),
        attachments: composeAttachments.map((a) => ({ type: a.type, label: a.label || a.name || a.type })),
        responseCap: selectedCap,
      }),
      applyState:(s)=>{
        if(qText&&s.question) qText.value=s.question;
        if(audienceSel&&s.audience) audienceSel.value=s.audience;
        (s.opts||[]).forEach((v,i)=>{ const el=document.getElementById(`mcqOpt${i+1}`); if(el&&v) el.value=v; });
        if(s.format){
          const chip=sheet.querySelector(`.peepal-format-chip[data-fmt="${s.format}"]`);
          chip?.click();
        }
        setCapUi(s.responseCap || '10');
      },
    });
  }
  setCapUi('10');

  if (!isEdit) {
    try {
      const pending = sessionStorage.getItem('chaupaal_peepal_pending_ask') || '';
      sessionStorage.removeItem('chaupaal_peepal_pending_ask');
      if (pending && qText && !qText.value) qText.value = pending;
    } catch (e) {}
  }

  if (isEdit) {
    const qTextEl = document.getElementById('peepalQText');
    if (qTextEl) qTextEl.value = String(editPost.question || '');
    const fmt = editPost.format || 'open';
    sheet.querySelector(`.peepal-format-chip[data-fmt="${fmt}"]`)?.click();
    (editPost.options || []).forEach((v, i) => {
      const el = document.getElementById(`mcqOpt${i + 1}`);
      if (el && v) el.value = v;
    });
    const aud = document.getElementById('peepalAudience');
    if (aud) {
      let v = editPost.saveOnly ? 'save_only' : (editPost.audience || 'everyone');
      if (v === 'friends') v = 'followers';
      if (v === 'ai' || v === 'algorithm' || v === 'private') v = editPost.saveOnly ? 'save_only' : 'everyone';
      aud.value = v;
      const ca = document.getElementById('peepalCustomAudience');
      if (ca) ca.value = editPost.customAudienceText || '';
      syncAudienceHint();
    }
    if (editPost.format === 'form' && Array.isArray(editPost.formSchema?.questions)) {
      formQuestions = editPost.formSchema.questions.map((q, i) => ({
        id: q.id || 'q' + (i + 1),
        type: q.type || 'short',
        prompt: q.prompt || '',
        required: !!q.required,
        options: q.options || ['', ''],
      }));
      renderFormBuilder();
      document.getElementById('peepalFormBuilder').style.display = 'block';
    }
    if (editPost.responseCap != null) setCapUi(String(editPost.responseCap));
    if (Array.isArray(editPost.attachments)) {
      composeAttachments = editPost.attachments.map((a) => ({ ...a }));
      renderAttachPreview();
    }
    if (editPost.attachment?.type) {
      composeAttachments.push({ type: editPost.attachment.type, label: editPost.attachment.type, ...editPost.attachment });
      renderAttachPreview();
    }
    peepalAskCat = editPost.tag && editPost.tag !== (editPost.format || 'open').toUpperCase() ? editPost.tag : '';
  }

  document.getElementById('closeAsk').addEventListener('click',()=>{
    peepalDraft?.flush?.();
    sheet.classList.remove('open');setTimeout(()=>sheet.remove(),350);
    try{ if(typeof restoreAppShell==='function') restoreAppShell('peepal_ask_close'); }catch(e){}
  });

  document.getElementById('peepalPublishBtn').addEventListener('click',async()=>{
    const text=qText.value.trim();
    if(!text){showToast(t('discovery.write_something_to_start_a_discussion'));return;}
    const unlock=typeof beginClientMutation==='function'?beginClientMutation(isEdit?'peepal_edit':'peepal_post'):()=>{};
    if(unlock===false){ showToast(t('peepal_post_submitting')); return; }
    const pubBtn=document.getElementById('peepalPublishBtn');
    const pubLabel=pubBtn?pubBtn.textContent:'';
    if(pubBtn){
      if(typeof setButtonLoading==='function') setButtonLoading(pubBtn, true);
      else { pubBtn.disabled=true; pubBtn.textContent=isEdit?t('common.saving'):t('discovery.sharing'); }
    }
    try{
    if(isEdit){
      if(!db||!currentUser||!editId){
        showToast(t('peepal_sign_in_post'));
        return;
      }
      if(editPost.uid&&editPost.uid!==currentUser.uid){
        showToast(t('discovery.not_authorized'));
        return;
      }
      const fmt=sheet.querySelector('.peepal-format-chip.active')?.dataset.fmt||'open';
      const opts=fmt==='poll'?[1,2,3,4].map(i=>document.getElementById(`mcqOpt${i}`)?.value||'').filter(Boolean):[];
      const audienceRaw=document.getElementById('peepalAudience')?.value||'everyone';
      const saveOnly=audienceRaw==='save_only';
      const audience=audienceRaw==='friends'?'followers':audienceRaw;
      const customAudienceText=document.getElementById('peepalCustomAudience')?.value||'';
      const formSchema =
        fmt === 'form'
          ? {
              questions: formQuestions.map((q, i) => ({
                id: q.id || `q${i + 1}`,
                type: q.type || 'short',
                prompt: String(q.prompt || '').trim(),
                required: !!q.required,
                options: (q.options || []).map((o) => String(o || '').trim()).filter(Boolean),
              })),
            }
          : null;
      if (fmt === 'form' && (!formSchema.questions.length || formSchema.questions.some((q) => !q.prompt))) {
        showToast(t('discovery.add_prompts_for_each_form_question'));
        return;
      }
      const updatePayload={
        question:text,
        format:fmt,
        options:opts,
        responses:opts.length?(editPost.responses||[]).slice(0,opts.length).concat(opts.map((_,i)=>(editPost.responses||[])[i]||0)).slice(0,opts.length):[],
        tag: editPost.tag || (typeof PeepalAudience?.inferPeepalTopic === 'function' ? PeepalAudience.inferPeepalTopic(text) : 'GENERAL'),
        audience:saveOnly?'private':audience,
        customAudienceText: audience === 'custom' ? customAudienceText : '',
        responseCap:selectedCap,
        formSchema,
        archived:!!saveOnly,
        saveOnly:!!saveOnly,
        attachments: composeAttachments.map((a) => ({ ...a, blob: undefined, file: undefined, preview: undefined })),
        updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
      };
      if(editPost.attachment?.type==='image'&&!composeAttachments.some(a=>a.type==='photo'||a.type==='image')){
        updatePayload.attachment=editPost.attachment;
      }
      await db.collection('peepal').doc(editId).update(updatePayload);
      const idx=peepalQuestions.findIndex(q=>(q.firestoreId||q.id)===editId);
      const merged={...editPost,...updatePayload,id:editId,firestoreId:editId,question:text,format:fmt,options:opts};
      if(idx>=0) peepalQuestions[idx]=merged;
      peepalDraft?.clear?.();
      composeAttachments=[];
      renderAttachPreview();
      sheet.classList.remove('open');setTimeout(()=>sheet.remove(),350);
      renderPeepalFeed();
      try{ document.dispatchEvent(new CustomEvent('chaupaal:profile-posts-changed')); }catch(e){}
      showToast(t('discovery.discussion_updated'));
      return;
    }
    if(typeof checkRateLimit==='function'){
      const rl=await checkRateLimit('post');
      if(!rl.ok){ if(typeof showToast==='function') showToast(rl.message||t('peepal_slow_down')); return; }
    }
    const quota=await checkPeepalQuota();
    if(!quota.ok){
      showToast(quota.unlock||t('peepal_weekly_limit'));
      if(typeof ChaupaalMoney?.openMembership==='function') ChaupaalMoney.openMembership();
      return;
    }
    const wantsAnon=!!document.getElementById('anonToggle')?.checked;
    let isAnon=false;
    // Check anon quota before build/write, but consume ONLY after Firestore
    // succeeds — otherwise a denied write still burns a scarce slot.
    if(wantsAnon){
      try{
        anonQuota = await getAnonRemaining();
        if(anonQuota.exhausted || anonQuota.readFailed){
          showToast(anonQuota.unlock||t('peepal_anon_limit'));
          return;
        }
        isAnon=true;
      }catch(e){
        showToast(t('peepal_anon_verify_fail'));
        return;
      }
    }
    const fmt=sheet.querySelector('.peepal-format-chip.active')?.dataset.fmt||'open';
    const opts=fmt==='poll'?[1,2,3,4].map(i=>document.getElementById(`mcqOpt${i}`)?.value||'').filter(Boolean):[];
    const audienceRaw=document.getElementById('peepalAudience')?.value||'everyone';
    const saveOnly=audienceRaw==='save_only';
    let audience=isAnon?'algorithm':(audienceRaw==='friends'?'followers':audienceRaw);
    if (audience === 'ai') audience = 'everyone';
    const customAudienceText = !isAnon && audience === 'custom' ? (document.getElementById('peepalCustomAudience')?.value || '') : '';
    const formSchema =
      fmt === 'form'
        ? {
            questions: formQuestions.map((q, i) => ({
              id: q.id || `q${i + 1}`,
              type: q.type || 'short',
              prompt: String(q.prompt || '').trim(),
              required: !!q.required,
              options: (q.options || []).map((o) => String(o || '').trim()).filter(Boolean),
            })),
          }
        : null;
    if (fmt === 'form' && (!formSchema.questions.length || formSchema.questions.some((q) => !q.prompt))) {
      showToast(t('discovery.add_prompts_for_each_form_question'));
      return;
    }
    const inferredTag =
      typeof PeepalAudience?.inferPeepalTopic === 'function' ? PeepalAudience.inferPeepalTopic(text) : 'GENERAL';
    const segmentDrafts =
      !isAnon && isPremiumPeepal() && extraSegments.length
        ? [
            {
              audience: audience === 'save_only' ? 'everyone' : audience,
              cap: selectedCap,
              customAudienceText,
            },
          ].concat(extraSegments)
        : null;
    const audienceSegments =
      typeof PeepalAudience?.buildComposerSegments === 'function'
        ? PeepalAudience.buildComposerSegments({
            audience: saveOnly ? 'everyone' : audience,
            anonymous: isAnon,
            responseCap: selectedCap,
            customAudienceText,
            segments: segmentDrafts,
          })
        : [];
    // SECURITY: even anonymous posts must carry the real auth uid on user.uid —
    // Firestore create rules require user.uid == auth.uid (Phase A). Display
    // name/avatar stay anonymous; only the public label changes.
    const ownUid=currentUser?.uid||'me';
    const q={id:`q_${Date.now()}`,question:text,format:fmt,options:opts,responses:opts.map(()=>0),totalResponses:0,comments:0,timeAgo:t('common.just_now_2'),ts:Date.now(),tag:inferredTag,answered:false,deleted:false,
      audience:saveOnly?'private':audience, responseLimitMode:'manual', responseCap:selectedCap, audienceSegments,
      customAudienceText,
      formSchema,
      segmentDistributionActive: audienceSegments.length > 1,
      activeSegmentIndex:0,
      archived:!!saveOnly,
      saveOnly:!!saveOnly,
      user:isAnon
        ?{name:tEn('common.anonymous'),avatar:'🎭',uid:ownUid,profileType:'personal'}
        :{name:userProfile?.name||'You',avatar:userProfile?.photoURL||'🪑',uid:ownUid,photoURL:userProfile?.photoURL||null,profileType:(typeof ownProfileType==='function'?ownProfileType():(typeof getProfileType==='function'?getProfileType():'personal'))},
      anonymous:isAnon,uid:ownUid};

    async function persistComposeAttachments(list) {
      const out = [];
      for (const a of list || []) {
        const item = { type: a.type, label: a.label || a.name || a.type };
        try {
          if ((a.type === 'photo' || a.type === 'image') && a.file && typeof uploadOptimizedImage === 'function') {
            if (typeof isMediaUploadReady !== 'function' || (await isMediaUploadReady())) {
              const up = await uploadOptimizedImage(a.file, { folder: 'peepal' });
              item.url = up.media;
              item.media = up.media;
              item.thumb = up.thumb || up.media;
              item.width = up.width || null;
              item.height = up.height || null;
            }
          } else if (a.type === 'video' && a.file && typeof processAndUploadMedia === 'function') {
            const up = await processAndUploadMedia(a.file, { folder: 'peepal' });
            item.url = up.media;
            item.media = up.media;
            item.thumb = up.thumb || null;
          } else if (a.type === 'gif' || a.type === 'sticker' || a.type === 'meme' || a.type === 'clip') {
            item.url = a.url || a.preview;
            item.preview = a.preview || a.url;
            item.mime = a.mime || '';
            item.duration = a.duration || null;
            item.title = a.title || a.label || a.type;
            if (a.emoji) item.emoji = a.emoji;
          } else if (a.type === 'music' && a.song) {
            item.song = a.song;
            item.label = a.label || a.song.title;
          } else if (a.type === 'link') {
            item.url = a.url;
            item.title = a.title || a.url;
          } else if (a.type === 'location') {
            item.lat = a.lat;
            item.lng = a.lng;
            item.label = a.label;
          } else if (a.type === 'collab') {
            item.collaborator = a.collaborator;
          } else if (a.type === 'document' && a.file && typeof uploadToCloudinary === 'function') {
            const up = await uploadToCloudinary(a.file, { folder: 'peepal-docs' });
            item.url = up?.secure_url || up?.url || null;
            item.name = a.file.name;
          } else if (a.url) {
            item.url = a.url;
          }
        } catch (e) {
          if (typeof showToast === 'function') showToast(t('discovery.couldn_t_upload_one_attachment'));
        }
        out.push(item);
      }
      return out;
    }

    q.attachments = await persistComposeAttachments(composeAttachments);

    // Optional image attachment (compressed to Storage) — legacy single attachment for feed thumb
    const photoAtt = q.attachments.find((a) => a.type === 'photo' || a.type === 'image');
    if (photoAtt?.media || photoAtt?.url) {
      q.attachment = {
        type: 'image',
        data: photoAtt.media || photoAtt.url,
        thumb: photoAtt.thumb || photoAtt.media || photoAtt.url,
        width: photoAtt.width || null,
        height: photoAtt.height || null,
      };
    } else if (typeof pendingPeepalAttachment !== 'undefined' && pendingPeepalAttachment?.type === 'link') {
      q.attachment = pendingPeepalAttachment;
      pendingPeepalAttachment = null;
    } else {
      const linkAtt = q.attachments.find((a) => a.type === 'link');
      if (linkAtt) q.attachment = { type: 'link', url: linkAtt.url, title: linkAtt.title };
    }

    if(db&&currentUser){
      try{
        if(typeof assertOwnUid==='function'&&!assertOwnUid(currentUser.uid)) throw new Error('Not authorized');
        const ref=await db.collection('peepal').add({
          question:q.question,format:q.format,options:q.options,responses:q.responses,
          totalResponses:0,comments:0,tag:q.tag,user:q.user,anonymous:!!isAnon,
          uid:currentUser.uid,deleted:false,
          audience:q.audience||'everyone',
          customAudienceText: q.customAudienceText || '',
          formSchema: q.formSchema || null,
          responseLimitMode:q.responseLimitMode||'manual',
          responseCap:q.responseCap??null,
          audienceSegments:q.audienceSegments||[],
          segmentDistributionActive:!!q.segmentDistributionActive,
          activeSegmentIndex:0,
          archived:!!saveOnly,
          archivedAt:saveOnly?firebase.firestore.FieldValue.serverTimestamp():null,
          saveOnly:!!saveOnly,
          attachment: q.attachment?.type==='image'
            ? {
                type:'image',
                data:q.attachment.data,
                thumb:q.attachment.thumb||null,
                width:q.attachment.width||null,
                height:q.attachment.height||null,
              }
            : (q.attachment?.type==='link'?q.attachment:null),
          createdAt:firebase.firestore.FieldValue.serverTimestamp(),ts:Date.now(),
          attachments: q.attachments || [],
        });
        q.firestoreId=ref.id;
        q.id=ref.id;
        // Consume after successful write so a rules/network failure never burns a slot
        if(!saveOnly && typeof PolicyUsage?.consume==='function'){
          try{ await PolicyUsage.consume('peepalPost'); }
          catch(qe){
            if(typeof reportClientError==='function'){
              reportClientError({feature:'peepal_post_consume',message:qe?.message||String(qe)});
            }
          }
        }
        if(isAnon){
          try{ await PolicyUsage.consume('anon'); }
          catch(qe){
            if(typeof reportClientError==='function'){
              reportClientError({feature:'peepal_anon_consume',message:qe?.message||String(qe)});
            }
          }
        }
      }catch(e){
        if(typeof reportClientError==='function'){
          reportClientError({feature:'peepal_create',message:e?.message||String(e),stack:e?.stack||''});
        }
        showToast(
          e?.code==='DAILY_LIMIT'||e?.code==='WEEKLY_LIMIT'
            ?(anonQuota?.unlock||t('peepal_anon_limit'))
            :e?.code==='QUOTA_UNAVAILABLE'
            ?t('peepal_quota_verify_fail')
            :(typeof friendlyError==='function'?friendlyError(e):t('peepal_post_fail'))
        );
        return;
      }
    } else if(!db||!currentUser){
      showToast(t('peepal_sign_in_post'));
      return;
    }
    if(!saveOnly) peepalQuestions.unshift(q);
    peepalDraft?.clear?.();
    composeAttachments = [];
    renderAttachPreview();
    saveToArchive({type:'peepal_post',...q});
    sheet.classList.remove('open');setTimeout(()=>sheet.remove(),350);
    renderPeepalFeed();
      if(typeof trackPostCreated==='function') trackPostCreated(isAnon?'peepal_anon':'peepal');
      if(typeof SoundLib!=='undefined'&&SoundLib.postPublish) SoundLib.postPublish();
      showToast(saveOnly?t('peepal_saved_archive'):(isAnon?t('peepal_posted_anon'):t('peepal_posted')), 3000, { type: 'success' });
    }finally{
      if(pubBtn){
        if(typeof setButtonLoading==='function') setButtonLoading(pubBtn, false);
        else { pubBtn.disabled=false; pubBtn.textContent=pubLabel; }
      }
      if(typeof unlock==='function') unlock();
    }
  });

  const toolbar = document.getElementById('peepalComposeToolbar');
  toolbar?.querySelectorAll('[data-attach]').forEach((btn) => btn.addEventListener('click', () => handleAttach(btn.dataset.attach)));
  document.getElementById('peepalAttachMore')?.addEventListener('click', renderAttachGrid);
  document.getElementById('peepalPhotoInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    addAttachment({ type: 'photo', label: `📷 ${file.name}`, file, preview: URL.createObjectURL(file) });
  });
  document.getElementById('peepalVideoInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    addAttachment({ type: 'video', label: `🎬 ${file.name}`, file });
  });
  document.getElementById('peepalAudioInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    addAttachment({ type: 'music', label: `🎵 ${file.name}`, file });
  });
  document.getElementById('peepalDocInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    addAttachment({ type: 'document', label: `📄 ${file.name}`, file });
  });
  document.getElementById('peepalCollabAdd')?.addEventListener('click', () => {
    const input = document.getElementById('peepalCollabInput');
    const raw = String(input?.value || '').trim();
    if (!raw) return;
    addAttachment({ type: 'collab', label: `🤝 @${raw}`, collaborator: { uid: '', name: raw, username: raw.replace(/^@/, '') } });
    if (input) input.value = '';
  });
  const addLink = async () => {
    const input = document.getElementById('peepalLinkInput');
    const url = String(input?.value || '').trim();
    if (!/^https:\/\//i.test(url) || /javascript:/i.test(url)) {
      if (typeof showToast === 'function') showToast(t('discovery.use_an_https_link'));
      return;
    }
    let title = url.replace(/^https:\/\//i, '');
    try {
      if (typeof apiFetch === 'function') {
        const env = await apiFetch('/api/media-config', {
          method: 'POST',
          needAuth: true,
          body: { action: 'link_preview', url },
        });
        const data = env?.data || env || {};
        title = data.title || data.siteName || title;
      }
    } catch (e) {}
    addAttachment({ type: 'link', label: `🔗 ${String(title).slice(0, 42)}`, url, title: String(title).slice(0, 120) });
    if (input) input.value = '';
  };
  document.getElementById('peepalLinkAdd')?.addEventListener('click', addLink);
  document.getElementById('peepalLinkInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLink();
    }
  });

  };

function openPeepalEditSheet(post){
  if(!post) return;
  openPeepalAskSheet(post);
}
window.openPeepalEditSheet=openPeepalEditSheet;

