/**
 * Per-user Chaupaal (AI) profile — distinct from the human digital profile.
 * Opened like any profile (peek → full) from Baithak pin, card, or hub.
 * Summary/stats regenerate from available local + Firestore activity — no fake vanity metrics.
 */
(function () {
  'use strict';

  const SYSTEM_ID = 'chaupaal_ai';

  function tt(key, fallback, vars) {
    try {
      if (typeof t === 'function') {
        const v = t(key, vars || {});
        if (v && v !== key) return v;
      }
    } catch (e) {}
    let s = fallback || key;
    if (vars) Object.entries(vars).forEach(([k, v]) => {
      s = String(s).replace(`{{${k}}}`, v);
    });
    return s;
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function monthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Honest stats from whatever the client already knows. */
  async function gatherChaupaalInsights() {
    const p = typeof userProfile !== 'undefined' ? userProfile || {} : {};
    const dp = typeof digitalProfile !== 'undefined' ? digitalProfile || {} : {};
    const streak =
      (typeof getStreak === 'function' && getStreak()) || Number(p.streak) || 0;
    const friends = Number(p.friendsCount) || 0;
    const posts = Number(p.postsCount) || 0;
    let chatTurns = 0;
    let milestones = [];
    try {
      const uid = typeof currentUser !== 'undefined' && currentUser?.uid;
      if (uid && typeof db !== 'undefined' && db) {
        const chatId =
          typeof chaupaalChatId === 'function' ? chaupaalChatId(uid) : `chat_chaupaal_${uid}`;
        const snap = await db
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .orderBy('createdAt', 'desc')
          .limit(40)
          .get();
        chatTurns = snap.size;
      }
    } catch (e) {}
    try {
      if (typeof getChaupaalActivitySnapshot === 'function') {
        const act = getChaupaalActivitySnapshot() || {};
        if (act.milestones) milestones = act.milestones;
      }
    } catch (e) {}

    const empty = !streak && !friends && !posts && chatTurns < 2;
    const highlights = [];
    if (streak > 0) highlights.push(tt('cai_hl_streak', '{{n}}-day Akhbaar streak', { n: String(streak) }));
    if (friends > 0) highlights.push(tt('cai_hl_friends', '{{n}} people in your circle', { n: String(friends) }));
    if (posts > 0) highlights.push(tt('cai_hl_posts', '{{n}} posts shared', { n: String(posts) }));
    if (chatTurns > 0) highlights.push(tt('cai_hl_chats', '{{n}} recent Chaupaal messages', { n: String(chatTurns) }));
    if (dp.currentCity) highlights.push(tt('cai_hl_city', 'Checking in from {{city}}', { city: dp.currentCity }));

    const bioParts = [];
    if (dp.displayName || p.name) {
      bioParts.push(
        tt('cai_bio_knows', "I'm Chaupaal — the companion beside {{name}} on the charpai.", {
          name: dp.displayName || p.name,
        })
      );
    } else {
      bioParts.push(tt('cai_bio_default', "I'm Chaupaal — your chai-stall companion. I grow with how you use the app."));
    }
    if (streak >= 3) bioParts.push(tt('cai_bio_streak', 'Noticing your steady Akhbaar rhythm.'));
    if (chatTurns >= 5) bioParts.push(tt('cai_bio_chats', 'We talk often in Baithak.'));

    return {
      month: monthKey(),
      empty,
      streak,
      friends,
      posts,
      chatTurns,
      highlights,
      bio: bioParts.join(' '),
      milestones: Array.isArray(milestones) ? milestones.slice(0, 5) : [],
      tipsOn:
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('chaupaal_companion_opt_out') !== '1'
          : true,
    };
  }

  function openChaupaalIdCard() {
    document.getElementById('chaupaalIdCardSheet')?.remove();
    const p = typeof userProfile !== 'undefined' ? userProfile || {} : {};
    const dp = typeof digitalProfile !== 'undefined' ? digitalProfile || {} : {};
    const name = dp.displayName || p.name || 'You';
    const uname = p.username || 'username';
    const sheet = document.createElement('div');
    sheet.id = 'chaupaalIdCardSheet';
    sheet.className = 'archive-overlay chaupaal-id-card-sheet';
    sheet.setAttribute('data-nav-managed', '1');
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-overlay-dismiss aria-label="Back">←</button>
        <div style="flex:1"><strong>${tt('chaupaal_card_title', 'Chaupaal card')}</strong></div>
      </div>
      <div class="chaupaal-id-card-preview">
        <div class="chaupaal-id-card-preview-inner">
          <div class="chaupaal-id-card-preview-avatar">${p.photoURL ? `<img src="${esc(p.photoURL)}" alt="">` : '🪑'}</div>
          <div class="chaupaal-id-card-preview-name">${esc(name)}</div>
          <div class="chaupaal-id-card-preview-handle">@${esc(uname)}</div>
          <div class="chaupaal-id-card-preview-brand">Chaupaal</div>
        </div>
      </div>
      <div style="padding:12px 16px;display:flex;flex-direction:column;gap:8px;">
        <button type="button" class="btn btn--primary btn--block" data-card-share>${tt('cai_share_card', 'Copy profile link')}</button>
        <button type="button" class="btn btn--block" data-card-hub>${tt('cai_open_hub', 'Open Chaupaal Hub')}</button>
        <button type="button" class="btn btn--block" data-card-ai>${tt('cai_open_ai', 'Open Chaupaal AI profile')}</button>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      else sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, { onPop: () => sheet.remove() });
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-card-share]')?.addEventListener('click', () => {
      const url = `${location.origin}/profile/${encodeURIComponent(uname)}`;
      navigator.clipboard?.writeText(url).then(() => {
        if (typeof showToast === 'function') showToast(tt('cai_link_copied', 'Link copied'));
      });
    });
    sheet.querySelector('[data-card-hub]')?.addEventListener('click', () => {
      close();
      if (typeof openChaupaalProfileHub === 'function') openChaupaalProfileHub();
    });
    sheet.querySelector('[data-card-ai]')?.addEventListener('click', () => {
      close();
      openChaupaalAiProfile();
    });
  }

  function openChaupaalAiPeek() {
    document.getElementById('chaupaalAiPeek')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'chaupaalAiPeek';
    sheet.className = 'archive-overlay profile-peek-sheet';
    sheet.setAttribute('data-nav-managed', '1');
    sheet.innerHTML = `
      <div class="profile-peek-inner">
        <div class="profile-peek-avatar" aria-hidden="true">🏠</div>
        <div class="profile-peek-name">Chaupaal</div>
        <div class="profile-peek-sub">${tt('cai_peek_sub', 'Your companion on the charpai')}</div>
        <div class="profile-peek-actions">
          <button type="button" class="btn btn--primary" data-peek-full>${tt('cai_view_profile', 'View profile')}</button>
          <button type="button" class="btn" data-peek-chat>${tt('cai_open_chat', 'Open chat')}</button>
          <button type="button" class="btn" data-peek-dismiss>${tt('cancel', 'Cancel')}</button>
        </div>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      else sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, { onPop: () => sheet.remove() });
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) close();
    });
    sheet.querySelector('[data-peek-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-peek-full]')?.addEventListener('click', () => {
      close();
      openChaupaalAiProfile();
    });
    sheet.querySelector('[data-peek-chat]')?.addEventListener('click', () => {
      close();
      const chat = typeof getChaupaalChat === 'function' ? getChaupaalChat() : null;
      if (chat && typeof openChatScreen === 'function') openChatScreen(chat);
    });
  }

  async function openChaupaalAiProfile() {
    document.getElementById('chaupaalAiProfileSheet')?.remove();
    const insights = await gatherChaupaalInsights();
    const sheet = document.createElement('div');
    sheet.id = 'chaupaalAiProfileSheet';
    sheet.className = 'archive-overlay chaupaal-ai-profile';
    sheet.setAttribute('data-nav-managed', '1');
    const hlHtml = insights.empty
      ? `<div class="public-profile-posts-empty">${tt('cai_empty_month', 'Still getting to know you — play Akhbaar, chat, or post and this card fills in.')}</div>`
      : `<ul class="cai-highlight-list">${insights.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`;

    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-overlay-dismiss aria-label="Back">←</button>
        <div style="flex:1"><strong>${tt('cai_profile_title', 'Chaupaal')}</strong></div>
        <button type="button" class="btn" data-cai-chat style="font-size:12px;">${tt('cai_open_chat', 'Chat')}</button>
      </div>
      <div class="cai-body">
        <div class="cai-hero">
          <div class="cai-avatar" aria-hidden="true">🏠</div>
          <div class="cai-name">Chaupaal</div>
          <div class="cai-handle">@chaupaal · ${tt('cai_companion_badge', 'companion')}</div>
          <p class="cai-bio">${esc(insights.bio)}</p>
        </div>
        <section class="cai-card">
          <h3>${tt('cai_month_title', 'This month with you')}</h3>
          <div class="cai-month-key">${esc(insights.month)}</div>
          ${hlHtml}
        </section>
        <section class="cai-card">
          <h3>${tt('cai_stats_title', 'What Chaupaal notices')}</h3>
          <div class="profile-stats-row">
            <div><span>${insights.streak || '—'}</span>${tt('cai_stat_streak', 'streak')}</div>
            <div><span>${insights.friends || '—'}</span>${tt('cai_stat_friends', 'friends')}</div>
            <div><span>${insights.chatTurns || '—'}</span>${tt('cai_stat_chats', 'chats')}</div>
            <div><span>${insights.posts || '—'}</span>${tt('cai_stat_posts', 'posts')}</div>
          </div>
          <p class="cai-privacy-note">${tt('cai_privacy_note', 'Respects your tips & share prefs — never invents numbers.')}</p>
        </section>
        <section class="cai-card cai-premium">
          <h3>${tt('cai_plus_title', 'Chaupaal Plus')}</h3>
          <p>${tt('cai_plus_body', 'Browse perks on your companion profile. Checkout when payments are live.')}</p>
          <button type="button" class="btn btn--primary btn--block" data-cai-plus>${tt('cai_explore_plus', 'Explore Plus')}</button>
        </section>
        <section class="cai-card">
          <h3>${tt('cai_memory_title', 'Memory highlights')}</h3>
          ${
            insights.milestones.length
              ? `<ul class="cai-highlight-list">${insights.milestones.map((m) => `<li>${esc(m.title || m)}</li>`).join('')}</ul>`
              : `<div class="public-profile-posts-empty">${tt('cai_memory_empty', 'Milestones appear as you keep showing up.')}</div>`
          }
        </section>
        <section class="cai-card">
          <h3>${tt('cai_tips_title', 'Tips & wishes')}</h3>
          <p>${insights.tipsOn ? tt('cai_tips_on', 'On — festival wishes and gentle check-ins.') : tt('cai_tips_off', 'Off — change in Settings.')}</p>
        </section>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      else sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, { onPop: () => sheet.remove() });
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-cai-chat]')?.addEventListener('click', () => {
      close();
      const chat = typeof getChaupaalChat === 'function' ? getChaupaalChat() : null;
      if (chat && typeof openChatScreen === 'function') openChatScreen(chat);
    });
    sheet.querySelector('[data-cai-plus]')?.addEventListener('click', () => {
      if (typeof openPremiumSheet === 'function') openPremiumSheet();
    });
  }

  window.CHAUPAAL_AI_PROFILE_ID = SYSTEM_ID;
  window.openChaupaalAiProfile = openChaupaalAiProfile;
  window.openChaupaalAiPeek = openChaupaalAiPeek;
  window.openChaupaalIdCard = openChaupaalIdCard;
  window.gatherChaupaalInsights = gatherChaupaalInsights;
})();
