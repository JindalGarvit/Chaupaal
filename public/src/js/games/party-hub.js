/**
 * Party night — one group, game after game, no re-invites (P15).
 *   Room: games/partyhub/{code} (server-lib/party-hub.js). The host (or a group vote) picks the next
 *         party game; the server opens an ordinary game room with the online group already seated and
 *         every phone jumps in. "Back to the party" closes it and turns the result into placing points.
 *   Pass & Play: the same night offline on one phone (localStorage, names are the ids) — each game's
 *         Pass & Play reports its standings via PartyKit.reportPass and the hub commits them here.
 * Scores are PartyHubCore placing points (5 / 3 / 2 / 1) — bragging rights only, never chips.
 */
(function () {
  'use strict';

  const GAME = 'partyhub';
  const LABEL = t('dangal.identity.partyhub.label');
  const GROUPS_KEY = 'pk_party_groups';
  const GROUPS_MAX = 6;

  const Kit = () => window.PartyKit;
  const Core = () => window.PartyHubCore;
  const esc = (s) => (window.PartyKit ? PartyKit.esc(s) : String(s == null ? '' : s));
  const toast = (m) => typeof showToast === 'function' && showToast(m);

  /** Latest Room hub we've seen (for the in-game scoreboard sheet). */
  const live = { code: '', pub: null };

  function ready(fn) {
    return function () {
      const args = arguments;
      if (!Kit()) return toast(t('dangal.party.party_games_are_loading_try_again'));
      return Kit()
        .ensureGameData(GAME)
        .then(() => fn.apply(null, args), () => toast(t('dangal.party.couldn_t_load_party_night_check')));
    };
  }

  // ---------------- saved groups ----------------

  function savedGroups() {
    try {
      const list = JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]');
      return Array.isArray(list) ? list.filter((g) => g && Array.isArray(g.names) && g.names.length >= 2) : [];
    } catch (e) {
      return [];
    }
  }
  function saveGroup(names, label) {
    const clean = Core().cleanNames(names);
    if (clean.length < 2) return;
    const name = String(label || '').trim().slice(0, 30) || clean.slice(0, 3).join(', ') + (clean.length > 3 ? ' +' + (clean.length - 3) : '');
    const key = clean.slice().sort().join('|').toLowerCase();
    const list = savedGroups().filter((g) => g.names.slice().sort().join('|').toLowerCase() !== key);
    list.unshift({ name, names: clean, at: Date.now() });
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(list.slice(0, GROUPS_MAX)));
    } catch (e) {}
    toast(t('dangal.party.group_saved_find_it_under_party'));
  }
  function forgetGroup(i) {
    const list = savedGroups();
    list.splice(i, 1);
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  // ---------------- shared bits ----------------

  /** Deterministic suggestion for the group (DangalAssist.recommend), with its plain reason. */
  function suggestionHtml(count, where) {
    const DA = window.DangalAssist;
    if (!DA || count < 2) return '';
    const top = DA.recommend({ players: count, where, partyOnly: true, limit: 8 }).find((g) => Core().GAME_IDS.indexOf(g.id) >= 0);
    return top ? `<div class="ph-suggest" role="note">${tHtml('dangal.party.suggested')} <strong>${esc(top.name)}</strong> — ${esc(top.reason)}</div>` : '';
  }

  function gameCardsHtml(o) {
    const counts = o.votes || {};
    return `${suggestionHtml(o.count, o.where || 'together')}<div class="ph-games" role="list">${Core()
      .GAMES.map((g) => {
        const tooFew = o.count < g.min;
        const n = counts[g.id] || 0;
        const mine = o.myVote === g.id;
        const note = tooFew ? t('dangal.party.needs_value', { value: g.min }) : o.count > g.max ? t('dangal.party.up_to_value_others_sit_out', { value: g.max }) : g.min + '–' + g.max + ' players';
        return `<button type="button" role="listitem" class="ph-game${mine ? ' is-on' : ''}" data-game="${g.id}" ${tooFew ? 'disabled aria-disabled="true"' /* i18n-ignore */ : ''}
          aria-label="${esc(g.label + '. ' + g.blurb + '. ' + note + (n ? '. ' + n + (n === 1 ? ' vote' : ' votes') : ''))}">
          <span class="ph-game-mark" aria-hidden="true">${typeof gameMarkHtml === 'function' ? gameMarkHtml(g.id, { size: 32 }) : g.icon}</span>
          <span class="ph-game-name">${esc(g.label)}</span>
          <span class="ph-game-note">${esc(note)}</span>
          ${n ? `<span class="ph-game-votes">${n} ${n === 1 ? 'vote' : 'votes'}</span>` : ''}
        </button>`;
      })
      .join('')}</div>`;
  }

  function scoreboardHtml(rows, history, opts) {
    const o = opts || {};
    if (!history || !history.length) {
      return `<div class="ph-board ph-board--empty"><div class="pk-section">${tHtml('dangal.party.tonight_s_scoreboard')}</div><div class="pk-sub">${tHtml('dangal.party.finish_a_game_to_get_on')}</div></div>`;
    }
    return `<div class="ph-board">
      <div class="pk-section">${tHtml('dangal.party.tonights_scoreboard_games', { historyCount: history.length })}</div>
      <ol class="ph-rows">${rows
        .map(
          (r, i) => `<li class="ph-row${r.id === o.me ? ' is-me' : ''}">
          <span class="ph-rank">${i + 1}</span>${Kit().identityHtml(o.seatOf ? o.seatOf(r.id) : i, r.name)}
          <span class="ph-name">${esc(r.name)}${r.id === o.me ? ' <small>' + tHtml('dangal.party.you') + '</small>' : ''}</span>
          <span class="ph-pts">${r.pts}<small> ${tHtml('dangal.party.pts')}</small></span>
        </li>`
        )
        .join('')}</ol>
      <details class="ph-how"><summary>${tHtml('dangal.party.how_points_work')}</summary>
        <p>${tHtml('dangal.party.each_game_gives_placings_not_raw')}</p>
      </details>
    </div>`;
  }

  function endCardHtml(rows, history) {
    const top = rows.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    const games = (history || []).map((h) => (Core().gameInfo(h.game) || { label: h.game }).label);
    return `<div class="ph-endcard" role="group" aria-label="${tHtml('dangal.party.end_of_the_night')}">
      <div class="ph-end-title">${tHtml('dangal.party.that_s_the_night')}</div>
      <div class="ph-end-line">${esc(Core().shareLine(rows, history))}</div>
      <div class="ph-podium">${top
        .filter((r) => r.pts > 0)
        .map((r, i) => `<div class="ph-podium-slot"><span aria-hidden="true">${medals[i]}</span><strong>${esc(r.name)}</strong><small>${tHtml('dangal.pts_count', { count: r.pts })}</small></div>`)
        .join('')}</div>
      ${games.length ? `<div class="ph-end-games">${games.map(esc).join(' · ')}</div>` : ''}
    </div>`;
  }

  function shareNight(rows, history) {
    Kit().shareLine(GAME, LABEL, Core().shareLine(rows, history) + ' 🎉');
  }

  function askSaveGroup(names) {
    Kit().openSheet({
      title: t('dangal.party.save_this_group'),
      bodyHtml: `<input class="pk-input" data-group-name maxlength="30" placeholder="${tHtml('dangal.party.name_e_g_friday_crew')}" aria-label="${tHtml('dangal.party.group_name')}">
        <div class="pk-sub">${esc(Core().cleanNames(names).join(', '))}</div>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${tHtml('common.save')}</button>`,
      onMount(sheet, close) {
        sheet.querySelector('[data-save]').addEventListener('click', () => {
          saveGroup(names, sheet.querySelector('[data-group-name]').value);
          close();
        });
      },
    });
  }

  // ---------------- home ----------------

  function open(ctx) {
    const c = ctx || {};
    if (c.code) return openRoom(c.code, { join: true });
    if (c.chat && (c.source === 'chat_group' || c.isGroup)) return createHub({ chat: c.chat });
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: t('dangal.party.one_group_many_games'), confirmLeave: () => false });
    renderHome(shell);
  }

  function renderHome(shell) {
    const groups = savedGroups();
    const body = shell.render(`<div class="pk-page pk-home ph-home">
      <div class="pk-hero">
        <div class="pk-hero-mark" aria-hidden="true">🎉</div>
        <div class="pk-hero-title">${tHtml('dangal.party.party_night')}</div>
        <div class="pk-hero-sub">${tHtml('dangal.party.play_game_after_game_with_the')}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-mode="pass">
          <span class="pk-mode-title">${tHtml('dangal.party.pass_play')}</span><span class="pk-mode-sub">${tHtml('dangal.party.one_phone_works_offline')}</span>
        </button>
        <button type="button" class="pk-mode" data-mode="room">
          <span class="pk-mode-title">${tHtml('dangal.party.play_with_friends')}</span><span class="pk-mode-sub">${tHtml('dangal.party.everyone_on_their_own_phone')}</span>
        </button>
        <button type="button" class="pk-link" data-mode="join">${tHtml('dangal.party.have_a_party_code_join')}</button>
      </div>
      ${
        groups.length
          ? `<div class="pk-section">${tHtml('dangal.party.play_again_with')}</div>${groups
              .map(
                (g, i) => `<div class="ph-group-row"><button type="button" class="pk-row-btn" data-group="${i}">${esc(g.name)} <small>· ${g.names.length}</small></button><button type="button" class="pk-link" data-forget="${i}" aria-label="${tHtml('dangal.party.forget_name', { name: g.name })}">${tHtml('dangal.party.forget')}</button></div>`
              )
              .join('')}`
          : ''
      }
    </div>`);
    body.querySelector('[data-mode="pass"]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-mode="room"]').addEventListener('click', () => Kit().closeThen(shell, () => createHub({})));
    body.querySelector('[data-mode="join"]').addEventListener('click', () => Kit().closeThen(shell, openJoin));
    body.querySelectorAll('[data-group]').forEach((b) =>
      b.addEventListener('click', () => {
        const g = savedGroups()[Number(b.dataset.group)];
        if (!g) return;
        Kit().openSheet({
          title: g.name,
          bodyHtml: `<div class="pk-sub">${esc(g.names.join(', '))}</div>
            <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-g="pass">${tHtml('dangal.party.pass_play_on_this_phone')}</button>
            <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-g="room">${tHtml('dangal.party.everyone_on_their_own_phone')}</button>`,
          onMount(sheet, close) {
            sheet.querySelector('[data-g="pass"]').addEventListener('click', () => {
              close();
              startPassNight(shell, g.names);
            });
            sheet.querySelector('[data-g="room"]').addEventListener('click', () => {
              close();
              Kit().closeThen(shell, () => createHub({ invite: true }));
            });
          },
        });
      })
    );
    body.querySelectorAll('[data-forget]').forEach((b) =>
      b.addEventListener('click', () => {
        forgetGroup(Number(b.dataset.forget));
        renderHome(shell);
      })
    );
  }

  function openJoin() {
    if (!Kit().requireSignIn()) return;
    Kit().openSheet({
      title: t('dangal.party.join_a_party'),
      bodyHtml: `<input class="pk-input pk-input--code" data-code maxlength="6" placeholder="${tHtml('dangal.party.party_code')}" autocapitalize="characters" autocomplete="off" enterkeyhint="go" aria-label="${tHtml('dangal.party.party_code_2')}">
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-join>${tHtml('dangal.party.join')}</button>`,
      onMount(sheet, close) {
        const input = sheet.querySelector('[data-code]');
        setTimeout(() => input.focus(), 50);
        const go = () => {
          const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (code.length !== 6) return toast(t('dangal.party.party_codes_are_6_letters_and'));
          close();
          openRoom(code, { join: true });
        };
        input.addEventListener('input', () => (input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
        input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        sheet.querySelector('[data-join]').addEventListener('click', go);
      },
    });
  }

  // ======================= ROOM HUB =======================

  async function createHub(o) {
    const opts = o || {};
    if (!Kit().requireSignIn()) return;
    if (navigator.onLine === false) return toast(t('dangal.party.you_re_offline_pass_play_works'));
    try {
      const chatId = opts.chat ? opts.chat.firestoreId || opts.chat.id : '';
      const res = await Kit().roomCall(GAME, 'create', { name: Kit().myName() || t('dangal.party.host'), settings: { contentLang: Kit().uiContentLang ? Kit().uiContentLang() : 'en' }, chatId: chatId && chatId !== 'ai' ? chatId : '' });
      if (opts.chat && chatId && chatId !== 'ai') {
        const sent = await Kit().postInviteToChat(opts.chat, GAME, res.code, LABEL);
        if (sent) toast(t('dangal.party.invite_posted_in_the_chat'));
      }
      await openRoom(res.code, {});
      if (opts.invite) Kit().inviteFriends(GAME, res.code, LABEL);
    } catch (e) {
      toast(Kit().roomErrorText(e) || t('dangal.party.couldn_t_start_a_party'));
    }
  }

  async function openRoom(code, opts) {
    const o = opts || {};
    if (!Kit().requireSignIn()) return null;
    if (o.join) {
      try {
        const res = await Kit().roomCall(GAME, 'join', { code, name: Kit().myName() || t('dangal.party.player') });
        if (res.joined && res.nextGame) toast(t('dangal.party.you_re_in_you_ll_join'));
      } catch (e) {
        toast(Kit().roomErrorText(e) || t('dangal.party.couldn_t_join_that_party'));
        return null;
      }
    }
    const existing = Kit().openShellFor(GAME);
    if (existing && existing.hubCode === code) return existing;
    const view = { code, pub: null, presence: {}, key: '', busy: false, openedSeq: 0 };
    let conn = null;
    const shell = Kit().openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: t('dangal.party.party_code_3', { code }),
      confirmLeave: () => false,
      onClose: () => {
        if (conn) conn.stop();
        if (live.code === code) live.pub = null;
      },
    });
    shell.hubCode = code;
    conn = Kit().connectRoom(GAME, code, {
      onPub: (pub) => {
        view.pub = pub;
        live.code = code;
        live.pub = pub;
        paint();
      },
      onSecret: () => {},
      onPresence: (p) => {
        view.presence = p;
        paintPresence();
        if (view.pub) paint();
      },
    });
    if (!conn) {
      shell.render('<div class="pk-empty">' + tHtml('dangal.party.can_t_reach_the_party_right') + '</div>');
      return shell;
    }
    shell.render('<div class="pk-empty">' + tHtml('dangal.party.joining_the_party') + '</div>');

    const me = Kit().myUid();
    const act = async (op, args) => {
      if (view.busy) return null;
      view.busy = true;
      try {
        return (await conn.op(op, args)) || {};
      } catch (e) {
        toast(Kit().roomErrorText(e) || t('common.something_went_wrong'));
        return null;
      } finally {
        view.busy = false;
      }
    };

    function members() {
      const players = (view.pub && view.pub.players) || {};
      return Object.keys(players)
        .sort((a, b) => (players[a].seat || 0) - (players[b].seat || 0))
        .filter((id) => !players[id].left)
        .map((id) => Object.assign({ id }, players[id]));
    }
    const online = (id) => id === me || Kit().isOnline(view.presence, id);
    const seatOf = (id) => {
      const players = (view.pub && view.pub.players) || {};
      return (players[id] && players[id].seat) || 0;
    };
    function rows() {
      const names = {};
      Object.keys(view.pub.players || {}).forEach((id) => (names[id] = view.pub.players[id].name));
      return Core().standings(view.pub.tonight || {}, names, histOf(view.pub));
    }

    function paintPresence() {
      shell.el.querySelectorAll('[data-presence]').forEach((dot) => dot.classList.toggle('is-online', online(dot.dataset.presence)));
    }

    function message(text) {
      shell
        .render(`<div class="pk-empty">${esc(text)}<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-close>${tHtml('common.done')}</button></div>`)
        ?.querySelector('[data-close]')
        ?.addEventListener('click', () => shell.close());
    }

    function maybeJoinGame() {
      const cur = view.pub && view.pub.current;
      if (!cur || cur.status !== 'live' || !cur.code) return;
      if ((cur.seated || []).indexOf(me) < 0) return;
      if (view.openedSeq === cur.seq) return;
      const open = Kit().openShellFor(cur.game);
      view.openedSeq = cur.seq;
      if (open) return;
      Kit().openGameRoom(cur.game, cur.code, { join: false });
    }

    function paint() {
      if (shell.closed) return;
      const pub = view.pub;
      if (!pub) return message(t('dangal.party.this_party_isn_t_available_any'));
      const players = pub.players || {};
      if (pub.status === 'closed') return renderEnded();
      if (!players[me] || players[me].left) return message(t('dangal.party.you_re_no_longer_in_this'));
      const onlineCount = members().filter((p) => online(p.id)).length;
      const key = JSON.stringify([pub.rev, pub.host, pub.current, onlineCount, pub.settings, pub.votes]);
      if (key === view.key) return;
      view.key = key;
      maybeJoinGame();
      const isHost = pub.host === me;
      const cur = pub.current;
      const list = members();
      const settings = Object.assign({ pickBy: 'host' }, pub.settings || {});
      const votes = {};
      Object.keys(pub.votes || {}).forEach((id) => {
        if (players[id] && !players[id].left) votes[pub.votes[id]] = (votes[pub.votes[id]] || 0) + 1;
      });
      let stage;
      if (cur) {
        const info = Core().gameInfo(cur.game) || { label: cur.game };
        const seated = (cur.seated || []).indexOf(me) >= 0;
        stage = `<div class="ph-now" aria-live="polite">
          <div class="ph-now-label">${cur.status === 'live' ? tHtml('dangal.party.now_playing') : tHtml('dangal.party.starting')}</div>
          <div class="ph-now-game">${esc(info.label)}</div>
          ${
            cur.status !== 'live'
              ? ''
              : seated
                ? '<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-open-game>' + tHtml('dangal.party.open_the_game') + '</button>'
                : `<div class="pk-sub">${(cur.out || []).indexOf(me) >= 0 && players[me].joinedAt <= cur.at ? tHtml('dangal.party.sitting_this_one_out_you_re') : tHtml('dangal.party.you_ll_join_the_next_game')}</div>`
          }
          ${isHost && cur.status === 'live' ? '<button type="button" class="pk-link" data-back>' + tHtml('dangal.party.end_this_game_back_to_the') + '</button>' : ''}
        </div>`;
      } else if (isHost) {
        stage = `<div class="pk-section">${settings.pickBy === 'vote' ? tHtml('dangal.party.group_vote_start_the_top_pick') : tHtml('dangal.party.pick_the_next_game')}</div>
          ${gameCardsHtml({ count: onlineCount, votes, myVote: null, where: 'remote' })}
          ${settings.pickBy === 'vote' && Object.keys(votes).length ? '<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start-vote>' + tHtml('dangal.party.start_the_top_pick') + '</button>' : ''}`;
      } else if (settings.pickBy === 'vote') {
        stage = `<div class="pk-section">${tHtml('dangal.party.vote_for_the_next_game')}</div>${gameCardsHtml({ count: onlineCount, votes, myVote: (pub.votes || {})[me], where: 'remote' })}`;
      } else {
        stage = '<div class="pk-wait">' + tHtml('dangal.party.the_host_is_picking_the_next') + '</div>';
      }
      const hist = histOf(pub);
      const body = shell.render(`<div class="pk-page ph-room">
        <div class="ph-code-row">
          <div><div class="pk-code-label">${tHtml('dangal.party.party_code_2')}</div><div class="pk-code pk-code--sm" aria-label="${tHtml('dangal.party.party_code_value', { code })}">${esc(code)}</div></div>
          <div class="pk-row">
            <button type="button" class="pk-btn pk-btn--ghost" data-share>${tHtml('common.share')}</button>
            <button type="button" class="pk-btn pk-btn--ghost" data-invite>${tHtml('common.invite')}</button>
          </div>
        </div>
        ${stage}
        ${scoreboardHtml(rows(), hist, { me, seatOf })}
        <details class="ph-more">
          <summary>${tHtml('dangal.party.group_listcount_value', { listCount: list.length, value: Core().MAX_HUB })}</summary>
          <div class="pk-lobby-list">${list
            .map(
              (p) => `<div class="pk-lobby-row"><span class="pk-dot" data-presence="${esc(p.id)}"></span>${Kit().identityHtml(p.seat || 0, p.name)}<span>${esc(p.name)}</span>${
                p.id === pub.host ? '<span class="pk-badge">' + tHtml('dangal.party.host') + '</span>' : ''
              }${p.id === me ? '<span class="pk-badge pk-badge--me">' + tHtml('common.you') + '</span>' : ''}${
                isHost && p.id !== me ? `<button type="button" class="pk-link ph-remove" data-remove="${esc(p.id)}" aria-label="${tHtml('dangal.party.remove_name', { name: p.name })}">${tHtml('common.remove')}</button>` : ''
              }</div>`
            )
            .join('')}</div>
          ${
            isHost
              ? `<div class="pk-field"><div class="pk-field-label">${tHtml('dangal.party.who_picks_the_next_game')}</div>${Kit().segHtml('pickBy', settings.pickBy, /* i18n-copy */ [['host', t('dangal.party.host')], ['vote', t('dangal.party.group_vote')]])}</div>`
              : ''
          }
          ${Kit().contentLangRowHtml && window.DangalContentLocales ? Kit().contentLangRowHtml(DangalContentLocales.PARTY_WORD_GAMES, settings, isHost) : ''}
          <button type="button" class="pk-link" data-save-group>${tHtml('dangal.party.save_this_group')}</button>
        </details>
        ${hist.length ? '<button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-share-night>' + tHtml('dangal.party.share_tonight_s_scoreboard') + '</button>' : ''}
        <button type="button" class="pk-link" data-leave>${isHost ? tHtml('dangal.party.end_the_party') : tHtml('dangal.party.leave_the_party')}</button>
      </div>`);
      paintPresence();
      body.querySelector('[data-share]').addEventListener('click', () => Kit().shareRoom(GAME, code, LABEL));
      body.querySelector('[data-invite]').addEventListener('click', () => Kit().inviteFriends(GAME, code, LABEL));
      body.querySelector('[data-open-game]')?.addEventListener('click', () => {
        if (!Kit().openShellFor(cur.game)) Kit().openGameRoom(cur.game, cur.code, { join: false });
      });
      body.querySelector('[data-back]')?.addEventListener('click', () => backToHub(code));
      body.querySelector('[data-start-vote]')?.addEventListener('click', () => pick(''));
      body.querySelectorAll('[data-game]').forEach((b) =>
        b.addEventListener('click', () => {
          if (isHost) pick(b.dataset.game);
          else act('vote', { pick: b.dataset.game });
        })
      );
      body.querySelectorAll('[data-remove]').forEach((b) =>
        b.addEventListener('click', async () => {
          const who = (players[b.dataset.remove] || {}).name || t('dangal.party.this_player');
          const go = typeof confirmLeaveGame === 'function' ? await confirmLeaveGame({ title: t('dangal.party.remove_who', { who }), body: t('dangal.party.they_leave_the_party_and_any') }) : true;
          if (go) act('remove', { target: b.dataset.remove });
        })
      );
      const seg = body.querySelector('[data-seg="pickBy"]');
      if (seg) Kit().wireSegs(seg.parentNode, settings, (k, v) => act('settings', { settings: { pickBy: v } }));
      body.querySelector('[data-content-lang]')?.addEventListener('click', () => isHost && Kit().pickContentLang(DangalContentLocales.PARTY_WORD_GAMES, settings, (next) => act('settings', { settings: { contentLang: next } })));
      body.querySelector('[data-save-group]').addEventListener('click', () => askSaveGroup(list.map((p) => p.name)));
      body.querySelector('[data-share-night]')?.addEventListener('click', () => shareNight(rows(), hist));
      body.querySelector('[data-leave]').addEventListener('click', async () => {
        if (isHost) {
          const go = typeof confirmLeaveGame === 'function' ? await confirmLeaveGame({ title: t('dangal.party.end_the_party_2'), body: t('dangal.party.everyone_sees_the_final_scoreboard') }) : true;
          if (!go) return;
          await act('end');
          return;
        }
        await act('leave');
        shell.close();
      });
    }

    async function pick(game) {
      const out = await act('pick', { pick: game });
      if (out && out.roomCode && view.openedSeq !== out.seq) {
        view.openedSeq = out.seq;
        if (!Kit().openShellFor(out.game)) Kit().openGameRoom(out.game, out.roomCode, { join: false });
      }
    }

    function renderEnded() {
      const r = rows();
      const hist = histOf(view.pub);
      const names = members().map((p) => p.name);
      const body = shell.render(`<div class="pk-page ph-room ph-ended">
        ${endCardHtml(r, hist)}
        ${scoreboardHtml(r, hist, { me, seatOf })}
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-share-night>${tHtml('dangal.party.share_the_night')}</button>
        <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-save-group>${tHtml('dangal.party.save_this_group')}</button>
        <button type="button" class="pk-link" data-close>${tHtml('common.done')}</button>
      </div>`);
      body.querySelector('[data-share-night]').addEventListener('click', () => shareNight(r, hist));
      body.querySelector('[data-save-group]').addEventListener('click', () => askSaveGroup(names));
      body.querySelector('[data-close]').addEventListener('click', () => shell.close());
    }

    return shell;
  }

  function histOf(pub) {
    const h = pub && pub.history;
    return Array.isArray(h) ? h : Object.values(h || {});
  }

  /** Host: close the current game (tallies placings) and bring everyone back. Resolves true when done. */
  async function backToHub(code) {
    try {
      await Kit().roomCall(GAME, 'back', { code });
      return true;
    } catch (e) {
      toast(Kit().roomErrorText(e) || t('dangal.party.couldn_t_go_back_to_the'));
      return false;
    }
  }

  /** A hub game room closed (host went back, or ended it) → make sure the party screen is there. */
  function onGameClosed(game, code, pub) {
    if (!pub || !pub.hub) return;
    const open = Kit().openShellFor(GAME);
    if (open && open.hubCode === pub.hub) return;
    openRoom(pub.hub, {});
  }

  /** The "Party night" pill inside a hub game. */
  function openFromGame(hub, isHost) {
    const pub = live.code === hub ? live.pub : null;
    const names = {};
    Object.keys((pub && pub.players) || {}).forEach((id) => (names[id] = pub.players[id].name));
    const board = pub ? scoreboardHtml(Core().standings(pub.tonight || {}, names, histOf(pub)), histOf(pub), { me: Kit().myUid() }) : '';
    Kit().openSheet({
      title: t('dangal.party.party_night'),
      bodyHtml: `${board}
        ${
          isHost
            ? '<div class="pk-sub">' + tHtml('dangal.party.going_back_ends_this_game_for') + '</div><button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-back>' + tHtml('dangal.party.back_to_the_party') + '</button>'
            : ''
        }
        <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-keep>${tHtml('dangal.party.keep_playing')}</button>`,
      onMount(sheet, close) {
        sheet.querySelector('[data-keep]').addEventListener('click', close);
        sheet.querySelector('[data-back]')?.addEventListener('click', async () => {
          close();
          await backToHub(hub);
        });
      },
    });
  }

  // ======================= PASS & PLAY NIGHT =======================

  let passShell = null;

  function openPass() {
    const existing = Kit().openShellFor(GAME);
    if (existing && existing.passNight) {
      renderPassNight(existing);
      return;
    }
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: t('dangal.party.pass_play'), confirmLeave: () => false });
    if (Kit().passNight()) renderPassNight(shell);
    else renderPassSetup(shell);
  }

  function renderPassSetup(shell) {
    shell.setSubtitle(t('dangal.party.pass_play'));
    const night = Kit().passNight();
    const names = night ? night.players : [Kit().myName() || '', '', ''];
    const body = shell.render(`<div class="pk-page ph-setup">
      <div class="pk-title">${tHtml('dangal.party.who_s_here_tonight')}</div>
      <div class="pk-sub">${tHtml('dangal.party.same_names_carry_into_every_game')}</div>
      <div data-editor></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start>${night ? tHtml('dangal.party.save_players') : tHtml('dangal.party.start_the_night')}</button>
    </div>`);
    if (night) shell.setBack(() => renderPassNight(shell));
    const editor = Kit().mountPlayerEditor(body.querySelector('[data-editor]'), { names, min: 3, max: Core().MAX_HUB });
    body.querySelector('[data-start]').addEventListener('click', () => startPassNight(shell, editor.list()));
  }

  function startPassNight(shell, names) {
    const cur = Kit().passNight();
    const n = cur ? Core().setPassPlayers(cur, names) : Core().newPassNight(names, Date.now());
    Kit().savePassNight(n);
    renderPassNight(shell);
  }

  /** Fold a finished Pass & Play game (reported by the game) into tonight. */
  function commitPass() {
    const n = Kit().passNight();
    if (!n || !n.current || !n.current.game) return n;
    const next = Core().recordPass(n, n.current.game, n.current.r || {}, n.current.at || Date.now());
    next.current = null;
    Kit().savePassNight(next);
    return next;
  }

  function renderPassNight(shell) {
    passShell = shell;
    shell.passNight = true;
    const night = commitPass();
    if (!night) return renderPassSetup(shell);
    shell.setSubtitle(t('dangal.party.pass_play_playerscount_players', { playersCount: night.players.length }));
    const names = {};
    night.players.forEach((n) => (names[n] = n));
    const rows = Core().standings(night.tonight, names, night.history);
    const seatOf = (id) => Math.max(0, night.players.indexOf(id));
    const body = shell.render(`<div class="pk-page ph-room">
      <div class="pk-section">${tHtml('dangal.party.pick_the_next_game')}</div>
      ${gameCardsHtml({ count: night.players.length, where: 'together' })}
      ${scoreboardHtml(rows, night.history, { seatOf })}
      <details class="ph-more">
        <summary>${tHtml('dangal.party.players_playerscount', { playersCount: night.players.length })}</summary>
        <div class="pk-sub">${esc(night.players.join(', '))}</div>
        <button type="button" class="pk-link" data-edit>${tHtml('dangal.party.change_players')}</button>
        <button type="button" class="pk-link" data-save-group>${tHtml('dangal.party.save_this_group')}</button>
      </details>
      <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-end>${tHtml('dangal.party.end_the_night')}</button>
    </div>`);
    body.querySelectorAll('[data-game]').forEach((b) => b.addEventListener('click', () => launchPass(b.dataset.game)));
    body.querySelector('[data-edit]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-save-group]').addEventListener('click', () => askSaveGroup(night.players));
    body.querySelector('[data-end]').addEventListener('click', () => renderPassEnd(shell));
  }

  function launchPass(game) {
    const g = typeof getGame === 'function' ? getGame(game) : null;
    if (!g || typeof g.launch !== 'function') return toast(t('dangal.party.that_game_is_still_loading_try'));
    g.launch({ source: 'partyhub_pass', mode: 'pass' });
  }

  function renderPassEnd(shell) {
    const night = commitPass();
    if (!night) return shell.close();
    const names = {};
    night.players.forEach((n) => (names[n] = n));
    const rows = Core().standings(night.tonight, names, night.history);
    const body = shell.render(`<div class="pk-page ph-room ph-ended">
      ${endCardHtml(rows, night.history)}
      ${scoreboardHtml(rows, night.history, { seatOf: (id) => Math.max(0, night.players.indexOf(id)) })}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-share-night>${tHtml('dangal.party.share_the_night')}</button>
      <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-save-group>${tHtml('dangal.party.save_this_group')}</button>
      <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-finish>${tHtml('dangal.party.finish_clear_tonight')}</button>
      <button type="button" class="pk-link" data-resume>${tHtml('dangal.party.keep_playing')}</button>
    </div>`);
    shell.setBack(() => renderPassNight(shell));
    body.querySelector('[data-share-night]').addEventListener('click', () => shareNight(rows, night.history));
    body.querySelector('[data-save-group]').addEventListener('click', () => askSaveGroup(night.players));
    body.querySelector('[data-resume]').addEventListener('click', () => renderPassNight(shell));
    body.querySelector('[data-finish]').addEventListener('click', () => {
      Kit().savePassNight(null);
      shell.passNight = false;
      shell.close();
    });
  }

  // A game closed on top of the Pass & Play night → refresh the scoreboard underneath.
  document.addEventListener('pk:shell-closed', (e) => {
    const id = e && e.detail && e.detail.gameId;
    if (!id || id === GAME || !passShell || passShell.closed || !passShell.passNight) return;
    if (Core() && Core().GAME_IDS.indexOf(id) >= 0) renderPassNight(passShell);
  });

  // "Party night" doors (Manch Party filter, game homes).
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-party-night]');
    if (!btn) return;
    e.preventDefault();
    const fromGame = btn.dataset.partyNight;
    const shell = fromGame && Kit() ? Kit().openShellFor(fromGame) : null;
    if (shell) Kit().closeThen(shell, () => api.open({}));
    else api.open({});
  });

  const api = {
    open: ready(open),
    openRoom: ready(openRoom),
    openPass: ready(openPass),
    backToHub,
    onGameClosed: (game, code, pub) => (Core() ? onGameClosed(game, code, pub) : ready(onGameClosed)(game, code, pub)),
    openFromGame: ready(openFromGame),
  };
  window.PartyHub = api;

  if (window.PartyKit) PartyKit.registerPartyGame(GAME, { label: LABEL, openRoom });
})();
