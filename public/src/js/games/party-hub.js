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
  const LABEL = 'Party night';
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
      if (!Kit()) return toast('Party games are loading — try again');
      return Kit()
        .ensureGameData(GAME)
        .then(() => fn.apply(null, args), () => toast('Couldn’t load Party night — check your connection'));
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
    toast('Group saved — find it under Party night');
  }
  function forgetGroup(i) {
    const list = savedGroups();
    list.splice(i, 1);
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  // ---------------- shared bits ----------------

  function gameCardsHtml(o) {
    const counts = o.votes || {};
    return `<div class="ph-games" role="list">${Core()
      .GAMES.map((g) => {
        const tooFew = o.count < g.min;
        const n = counts[g.id] || 0;
        const mine = o.myVote === g.id;
        const note = tooFew ? 'Needs ' + g.min + '+' : o.count > g.max ? 'Up to ' + g.max + ' · others sit out' : g.min + '–' + g.max + ' players';
        return `<button type="button" role="listitem" class="ph-game${mine ? ' is-on' : ''}" data-game="${g.id}" ${tooFew ? 'disabled aria-disabled="true"' : ''}
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
      return `<div class="ph-board ph-board--empty"><div class="pk-section">Tonight’s scoreboard</div><div class="pk-sub">Finish a game to get on the board.</div></div>`;
    }
    return `<div class="ph-board">
      <div class="pk-section">Tonight’s scoreboard · ${history.length} ${history.length === 1 ? 'game' : 'games'}</div>
      <ol class="ph-rows">${rows
        .map(
          (r, i) => `<li class="ph-row${r.id === o.me ? ' is-me' : ''}">
          <span class="ph-rank">${i + 1}</span>${Kit().identityHtml(o.seatOf ? o.seatOf(r.id) : i, r.name)}
          <span class="ph-name">${esc(r.name)}${r.id === o.me ? ' <small>(you)</small>' : ''}</span>
          <span class="ph-pts">${r.pts}<small> pts</small></span>
        </li>`
        )
        .join('')}</ol>
      <details class="ph-how"><summary>How points work</summary>
        <p>Each game gives placings, not raw scores: 1st 5 pts · 2nd 3 · 3rd 2 · everyone else who played 1. Ties share the better place. Team games (Charades, Werewolf) put the whole winning side 1st and the other side 2nd. If nobody pulls ahead, everyone gets 1.</p>
      </details>
    </div>`;
  }

  function endCardHtml(rows, history) {
    const top = rows.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    const games = (history || []).map((h) => (Core().gameInfo(h.game) || { label: h.game }).label);
    return `<div class="ph-endcard" role="group" aria-label="End of the night">
      <div class="ph-end-title">That’s the night!</div>
      <div class="ph-end-line">${esc(Core().shareLine(rows, history))}</div>
      <div class="ph-podium">${top
        .filter((r) => r.pts > 0)
        .map((r, i) => `<div class="ph-podium-slot"><span aria-hidden="true">${medals[i]}</span><strong>${esc(r.name)}</strong><small>${r.pts} pts</small></div>`)
        .join('')}</div>
      ${games.length ? `<div class="ph-end-games">${games.map(esc).join(' · ')}</div>` : ''}
    </div>`;
  }

  function shareNight(rows, history) {
    Kit().shareLine(GAME, LABEL, Core().shareLine(rows, history) + ' 🎉');
  }

  function askSaveGroup(names) {
    Kit().openSheet({
      title: 'Save this group',
      bodyHtml: `<input class="pk-input" data-group-name maxlength="30" placeholder="Name (e.g. Friday crew)" aria-label="Group name">
        <div class="pk-sub">${esc(Core().cleanNames(names).join(', '))}</div>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>Save</button>`,
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
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: 'One group, many games', confirmLeave: () => false });
    renderHome(shell);
  }

  function renderHome(shell) {
    const groups = savedGroups();
    const body = shell.render(`<div class="pk-page pk-home ph-home">
      <div class="pk-hero">
        <div class="pk-hero-mark" aria-hidden="true">🎉</div>
        <div class="pk-hero-title">Party night</div>
        <div class="pk-hero-sub">Play game after game with the same group. Tonight’s scoreboard keeps count.</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-mode="pass">
          <span class="pk-mode-title">Pass &amp; Play</span><span class="pk-mode-sub">One phone, works offline</span>
        </button>
        <button type="button" class="pk-mode" data-mode="room">
          <span class="pk-mode-title">Play with friends</span><span class="pk-mode-sub">Everyone on their own phone</span>
        </button>
        <button type="button" class="pk-link" data-mode="join">Have a party code? Join</button>
      </div>
      ${
        groups.length
          ? `<div class="pk-section">Play again with</div>${groups
              .map(
                (g, i) => `<div class="ph-group-row"><button type="button" class="pk-row-btn" data-group="${i}">${esc(g.name)} <small>· ${g.names.length}</small></button><button type="button" class="pk-link" data-forget="${i}" aria-label="Forget ${esc(g.name)}">Forget</button></div>`
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
            <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-g="pass">Pass &amp; Play on this phone</button>
            <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-g="room">Everyone on their own phone</button>`,
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
      title: 'Join a party',
      bodyHtml: `<input class="pk-input pk-input--code" data-code maxlength="6" placeholder="PARTY CODE" autocapitalize="characters" autocomplete="off" enterkeyhint="go" aria-label="Party code">
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-join>Join</button>`,
      onMount(sheet, close) {
        const input = sheet.querySelector('[data-code]');
        setTimeout(() => input.focus(), 50);
        const go = () => {
          const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (code.length !== 6) return toast('Party codes are 6 letters and numbers');
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
    if (navigator.onLine === false) return toast('You’re offline — Pass & Play works without internet');
    try {
      const chatId = opts.chat ? opts.chat.firestoreId || opts.chat.id : '';
      const res = await Kit().roomCall(GAME, 'create', { name: Kit().myName() || 'Host', chatId: chatId && chatId !== 'ai' ? chatId : '' });
      if (opts.chat && chatId && chatId !== 'ai') {
        const sent = await Kit().postInviteToChat(opts.chat, GAME, res.code, LABEL);
        if (sent) toast('Invite posted in the chat');
      }
      await openRoom(res.code, {});
      if (opts.invite) Kit().inviteFriends(GAME, res.code, LABEL);
    } catch (e) {
      toast(Kit().roomErrorText(e) || 'Couldn’t start a party');
    }
  }

  async function openRoom(code, opts) {
    const o = opts || {};
    if (!Kit().requireSignIn()) return null;
    if (o.join) {
      try {
        const res = await Kit().roomCall(GAME, 'join', { code, name: Kit().myName() || 'Player' });
        if (res.joined && res.nextGame) toast('You’re in — you’ll join the next game');
      } catch (e) {
        toast(Kit().roomErrorText(e) || 'Couldn’t join that party');
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
      subtitle: 'Party ' + code,
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
      shell.render('<div class="pk-empty">Can’t reach the party right now. Try again in a moment.</div>');
      return shell;
    }
    shell.render('<div class="pk-empty">Joining the party…</div>');

    const me = Kit().myUid();
    const act = async (op, args) => {
      if (view.busy) return null;
      view.busy = true;
      try {
        return (await conn.op(op, args)) || {};
      } catch (e) {
        toast(Kit().roomErrorText(e) || 'Something went wrong');
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
        .render(`<div class="pk-empty">${esc(text)}<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-close>Done</button></div>`)
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
      if (!pub) return message('This party isn’t available any more.');
      const players = pub.players || {};
      if (pub.status === 'closed') return renderEnded();
      if (!players[me] || players[me].left) return message('You’re no longer in this party.');
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
          <div class="ph-now-label">${cur.status === 'live' ? 'Now playing' : 'Starting…'}</div>
          <div class="ph-now-game">${esc(info.label)}</div>
          ${
            cur.status !== 'live'
              ? ''
              : seated
                ? '<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-open-game>Open the game</button>'
                : `<div class="pk-sub">${(cur.out || []).indexOf(me) >= 0 && players[me].joinedAt <= cur.at ? 'Sitting this one out — you’re first in next time.' : 'You’ll join the next game.'}</div>`
          }
          ${isHost && cur.status === 'live' ? '<button type="button" class="pk-link" data-back>End this game · back to the party</button>' : ''}
        </div>`;
      } else if (isHost) {
        stage = `<div class="pk-section">${settings.pickBy === 'vote' ? 'Group vote — start the top pick or choose one' : 'Pick the next game'}</div>
          ${gameCardsHtml({ count: onlineCount, votes, myVote: null })}
          ${settings.pickBy === 'vote' && Object.keys(votes).length ? '<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start-vote>Start the top pick</button>' : ''}`;
      } else if (settings.pickBy === 'vote') {
        stage = `<div class="pk-section">Vote for the next game</div>${gameCardsHtml({ count: onlineCount, votes, myVote: (pub.votes || {})[me] })}`;
      } else {
        stage = '<div class="pk-wait">The host is picking the next game…</div>';
      }
      const hist = histOf(pub);
      const body = shell.render(`<div class="pk-page ph-room">
        <div class="ph-code-row">
          <div><div class="pk-code-label">Party code</div><div class="pk-code pk-code--sm" aria-label="Party code ${esc(code)}">${esc(code)}</div></div>
          <div class="pk-row">
            <button type="button" class="pk-btn pk-btn--ghost" data-share>Share</button>
            <button type="button" class="pk-btn pk-btn--ghost" data-invite>Invite</button>
          </div>
        </div>
        ${stage}
        ${scoreboardHtml(rows(), hist, { me, seatOf })}
        <details class="ph-more">
          <summary>Group · ${list.length}/${Core().MAX_HUB}</summary>
          <div class="pk-lobby-list">${list
            .map(
              (p) => `<div class="pk-lobby-row"><span class="pk-dot" data-presence="${esc(p.id)}"></span>${Kit().identityHtml(p.seat || 0, p.name)}<span>${esc(p.name)}</span>${
                p.id === pub.host ? '<span class="pk-badge">Host</span>' : ''
              }${p.id === me ? '<span class="pk-badge pk-badge--me">You</span>' : ''}${
                isHost && p.id !== me ? `<button type="button" class="pk-link ph-remove" data-remove="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">Remove</button>` : ''
              }</div>`
            )
            .join('')}</div>
          ${
            isHost
              ? `<div class="pk-field"><div class="pk-field-label">Who picks the next game</div>${Kit().segHtml('pickBy', settings.pickBy, [['host', 'Host'], ['vote', 'Group vote']])}</div>`
              : ''
          }
          <button type="button" class="pk-link" data-save-group>Save this group</button>
        </details>
        ${hist.length ? '<button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-share-night>Share tonight’s scoreboard</button>' : ''}
        <button type="button" class="pk-link" data-leave>${isHost ? 'End the party' : 'Leave the party'}</button>
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
          const who = (players[b.dataset.remove] || {}).name || 'this player';
          const go = typeof confirmLeaveGame === 'function' ? await confirmLeaveGame({ title: 'Remove ' + who + '?', body: 'They leave the party and any game in progress.' }) : true;
          if (go) act('remove', { target: b.dataset.remove });
        })
      );
      const seg = body.querySelector('[data-seg="pickBy"]');
      if (seg) Kit().wireSegs(seg.parentNode, settings, (k, v) => act('settings', { settings: { pickBy: v } }));
      body.querySelector('[data-save-group]').addEventListener('click', () => askSaveGroup(list.map((p) => p.name)));
      body.querySelector('[data-share-night]')?.addEventListener('click', () => shareNight(rows(), hist));
      body.querySelector('[data-leave]').addEventListener('click', async () => {
        if (isHost) {
          const go = typeof confirmLeaveGame === 'function' ? await confirmLeaveGame({ title: 'End the party?', body: 'Everyone sees the final scoreboard.' }) : true;
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
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-share-night>Share the night</button>
        <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-save-group>Save this group</button>
        <button type="button" class="pk-link" data-close>Done</button>
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
      toast(Kit().roomErrorText(e) || 'Couldn’t go back to the party');
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
      title: 'Party night',
      bodyHtml: `${board}
        ${
          isHost
            ? '<div class="pk-sub">Going back ends this game for everyone and adds its placings to tonight’s scoreboard.</div><button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-back>Back to the party</button>'
            : ''
        }
        <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-keep>Keep playing</button>`,
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
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: 'Pass & Play', confirmLeave: () => false });
    if (Kit().passNight()) renderPassNight(shell);
    else renderPassSetup(shell);
  }

  function renderPassSetup(shell) {
    shell.setSubtitle('Pass & Play');
    const night = Kit().passNight();
    const names = night ? night.players : [Kit().myName() || '', '', ''];
    const body = shell.render(`<div class="pk-page ph-setup">
      <div class="pk-title">Who’s here tonight?</div>
      <div class="pk-sub">Same names carry into every game.</div>
      <div data-editor></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start>${night ? 'Save players' : 'Start the night'}</button>
    </div>`);
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
    shell.setSubtitle('Pass & Play · ' + night.players.length + ' players');
    const names = {};
    night.players.forEach((n) => (names[n] = n));
    const rows = Core().standings(night.tonight, names, night.history);
    const seatOf = (id) => Math.max(0, night.players.indexOf(id));
    const body = shell.render(`<div class="pk-page ph-room">
      <div class="pk-section">Pick the next game</div>
      ${gameCardsHtml({ count: night.players.length })}
      ${scoreboardHtml(rows, night.history, { seatOf })}
      <details class="ph-more">
        <summary>Players · ${night.players.length}</summary>
        <div class="pk-sub">${esc(night.players.join(', '))}</div>
        <button type="button" class="pk-link" data-edit>Change players</button>
        <button type="button" class="pk-link" data-save-group>Save this group</button>
      </details>
      <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-end>End the night</button>
    </div>`);
    body.querySelectorAll('[data-game]').forEach((b) => b.addEventListener('click', () => launchPass(b.dataset.game)));
    body.querySelector('[data-edit]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-save-group]').addEventListener('click', () => askSaveGroup(night.players));
    body.querySelector('[data-end]').addEventListener('click', () => renderPassEnd(shell));
  }

  function launchPass(game) {
    const g = typeof getGame === 'function' ? getGame(game) : null;
    if (!g || typeof g.launch !== 'function') return toast('That game is still loading — try again');
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
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-share-night>Share the night</button>
      <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-save-group>Save this group</button>
      <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-finish>Finish · clear tonight</button>
      <button type="button" class="pk-link" data-resume>Keep playing</button>
    </div>`);
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
