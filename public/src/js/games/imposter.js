/**
 * Imposter — Dangal party game (G1). Everyone shares a secret word except the Imposter(s).
 *   Pass & Play: one phone, offline, no sign-in — ImposterCore runs locally.
 *   Room: each player on their own phone — server deals via party_room (server-lib/party-deal.js);
 *         this client only ever reads the shared state + its own secret.
 * Virtual points only; never chips.
 */
(function () {
  'use strict';

  const GAME = 'imposter';
  const LABEL = 'Imposter';
  const BILINGUAL_KEY = 'chaupaal_imposter_bilingual';
  const SETTINGS_KEY = 'chaupaal_imposter_settings';
  const NAMES_KEY = 'chaupaal_imposter_names';

  const Core = () => window.ImposterCore;
  const Kit = () => window.PartyKit;
  const esc = (s) => (window.PartyKit ? PartyKit.esc(s) : String(s == null ? '' : s));

  function lang() {
    return typeof currentLang !== 'undefined' ? currentLang : 'en';
  }

  function bilingual() {
    try {
      return localStorage.getItem(BILINGUAL_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function setBilingual(on) {
    try {
      localStorage.setItem(BILINGUAL_KEY, on ? '1' : '0');
    } catch (e) {}
  }

  function loadSettings() {
    try {
      return Object.assign({}, Core().DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch (e) {
      return Object.assign({}, Core().DEFAULT_SETTINGS);
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function loadNames() {
    try {
      const raw = JSON.parse(localStorage.getItem(NAMES_KEY) || '[]');
      if (Array.isArray(raw) && raw.length >= 3) return raw.slice(0, 12);
    } catch (e) {}
    const me = Kit().myName();
    return [me || '', '', ''];
  }

  function saveNames(names) {
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(names.slice(0, 12)));
    } catch (e) {}
  }

  function word(w) {
    return Core().wordLabel(w, lang(), bilingual());
  }

  function packLabel(p) {
    if (!p) return '';
    const hi = String(lang()).indexOf('hi') === 0;
    if (bilingual()) return hi ? p.hi + ' · ' + p.en : p.en + ' · ' + p.hi;
    return hi ? p.hi : p.en;
  }

  function packChoices() {
    const P = Core().packs;
    return [P.MIXED].concat(P.PACKS);
  }

  function packById(id) {
    return packChoices().find((p) => p.id === id) || Core().packs.MIXED;
  }

  /** The private card face. Undercover cards carry no role, so the odd one out can't tell. */
  function cardFaceHtml(secret) {
    if (!secret) return '<div class="im-card-empty">Dealing…</div>';
    if (secret.imposter) {
      const hint = secret.hint
        ? `<div class="im-card-hint">Hint · ${esc(packLabel(secret.hint))}</div>`
        : '<div class="im-card-hint">No hint this time</div>';
      return `<div class="im-card im-card--imposter">
        <div class="im-card-role">🕵️</div>
        <div class="im-card-title">You are the Imposter</div>
        ${hint}
        <div class="im-card-tip">Blend in — listen to the clues and fake it.</div>
      </div>`;
    }
    return `<div class="im-card">
      <div class="im-card-label">Your secret word</div>
      <div class="im-card-word">${esc(word(secret.word))}</div>
      <div class="im-card-tip">Give one-word clues. Don’t say the word!</div>
    </div>`;
  }

  // ---------------- settings sheet ----------------

  /**
   * Defaults up front; Advanced collapsed.
   * @param {object} settings
   * @param {{ room?: boolean, players: number, onSave: (s: object) => void }} opts
   */
  function openSettings(settings, opts) {
    const o = opts || {};
    const s = Object.assign({}, settings);
    const n = Math.max(3, o.players || 3);
    const maxImp = Core().maxImposters(n);
    const autoImp = Core().defaultImposterCount(n);
    const seg = (name, value, options) =>
      `<div class="pk-seg" role="radiogroup" data-seg="${name}">${options
        .map(
          ([v, label]) =>
            `<button type="button" role="radio" aria-checked="${String(v) === String(value)}" class="pk-seg-btn${String(v) === String(value) ? ' is-on' : ''}" data-v="${esc(v)}">${esc(label)}</button>`
        )
        .join('')}</div>`;
    const impOptions = [[0, 'Auto (' + Math.min(autoImp, maxImp) + ')']];
    for (let i = 1; i <= maxImp; i++) impOptions.push([i, String(i)]);
    Kit().openSheet({
      title: 'Game settings',
      bodyHtml: `
        <div class="pk-field">
          <div class="pk-field-label">Mode</div>
          ${seg('variant', s.variant, [['classic', 'Classic'], ['undercover', 'Undercover']])}
          <div class="pk-field-help" data-variant-help></div>
        </div>
        <details class="pk-advanced">
          <summary>Advanced</summary>
          <div class="pk-field" data-hint-field>
            <label class="pk-toggle"><input type="checkbox" data-hint ${s.hint ? 'checked' : ''}> Imposter gets a one-word hint (the category)</label>
          </div>
          <div class="pk-field">
            <div class="pk-field-label">Imposters</div>
            ${seg('imposters', s.imposters > maxImp ? 0 : s.imposters, impOptions)}
          </div>
          <div class="pk-field">
            <div class="pk-field-label">Clue rounds</div>
            ${seg('circuits', s.circuits, [[1, '1 round'], [2, '2 rounds']])}
          </div>
          <div class="pk-field">
            <div class="pk-field-label">Discussion timer</div>
            ${seg('discussionSec', s.discussionSec, [[0, 'Off'], [60, '60s'], [90, '90s'], [120, '2 min'], [180, '3 min']])}
          </div>
          ${
            o.room
              ? `<div class="pk-field"><div class="pk-field-label">Time per clue</div>${seg('clueSec', s.clueSec, [[30, '30s'], [45, '45s'], [60, '60s']])}</div>`
              : `<div class="pk-field"><div class="pk-field-label">Voting</div>${seg('voteStyle', s.voteStyle, [['group', 'Point together'], ['secret', 'Secret pass-around']])}</div>`
          }
          <div class="pk-field">
            <label class="pk-toggle"><input type="checkbox" data-bilingual ${bilingual() ? 'checked' : ''}> Show words in English + हिंदी</label>
          </div>
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>Done</button>`,
      onMount(sheet, close) {
        const help = sheet.querySelector('[data-variant-help]');
        const hintField = sheet.querySelector('[data-hint-field]');
        const paintHelp = () => {
          help.textContent =
            s.variant === 'undercover'
              ? 'The Imposter gets a close word and doesn’t know they’re the odd one out.'
              : 'The Imposter knows they’re the Imposter but not the word.';
          hintField.hidden = s.variant === 'undercover';
        };
        paintHelp();
        sheet.querySelectorAll('[data-seg]').forEach((grp) => {
          grp.querySelectorAll('.pk-seg-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
              grp.querySelectorAll('.pk-seg-btn').forEach((b) => {
                b.classList.toggle('is-on', b === btn);
                b.setAttribute('aria-checked', String(b === btn));
              });
              const key = grp.dataset.seg;
              const v = btn.dataset.v;
              s[key] = key === 'variant' || key === 'voteStyle' ? v : Number(v);
              if (key === 'variant') paintHelp();
            });
          });
        });
        sheet.querySelector('[data-hint]')?.addEventListener('change', (e) => (s.hint = !!e.target.checked));
        sheet.querySelector('[data-bilingual]')?.addEventListener('change', (e) => setBilingual(!!e.target.checked));
        sheet.querySelector('[data-save]').addEventListener('click', () => {
          close();
          o.onSave(Core().mergeSettings(s));
        });
      },
    });
  }

  function openPackPicker(current, onPick) {
    Kit().openSheet({
      title: 'Word pack',
      bodyHtml: `<div class="im-packs">${packChoices()
        .map(
          (p) => `<button type="button" class="im-pack${p.id === current ? ' is-on' : ''}" data-pack="${esc(p.id)}">
            <span class="im-pack-icon" aria-hidden="true">${esc(p.icon)}</span>
            <span class="im-pack-name">${esc(packLabel(p))}</span>
            <span class="im-pack-count">${p.words ? p.words.length + ' words' : 'All packs'}</span>
          </button>`
        )
        .join('')}</div>`,
      onMount(sheet, close) {
        sheet.querySelectorAll('[data-pack]').forEach((btn) =>
          btn.addEventListener('click', () => {
            close();
            onPick(btn.dataset.pack);
          })
        );
      },
    });
  }

  // ---------------- home ----------------

  function howToCardHtml() {
    return `<details class="im-howto">
      <summary>How to play · 20 seconds</summary>
      <ol>
        <li>Everyone secretly sees the same word — except the <strong>Imposter</strong>.</li>
        <li>Take turns saying <strong>one word</strong> about it. Not the word, not a translation, no repeats.</li>
        <li>Discuss, then vote out who you think is faking.</li>
        <li>Caught Imposters get <strong>one guess</strong> at the word to steal the win.</li>
      </ol>
      <div class="im-howto-score">Crew +1 each for a catch · Imposter +2 for surviving, +2 for a steal</div>
    </details>`;
  }

  function openImposter(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit()) {
      if (typeof showToast === 'function') showToast('Imposter is still loading — try again');
      return;
    }
    const fromGroup = c.source === 'chat_group' || (c.isGroup && c.chat);
    if (fromGroup && c.chat) {
      startRoomFlow({ chat: c.chat });
      return;
    }
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: 'Party', confirmLeave: () => false });
    renderHome(shell);
  }

  function renderHome(shell) {
    const body = shell.render(`<div class="im-home">
      <div class="im-hero">
        <div class="im-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🕵️'}</div>
        <div class="im-hero-title">Who’s faking it?</div>
        <div class="im-hero-sub">3–12 players · everyone knows the word except the Imposter</div>
      </div>
      ${howToCardHtml()}
      <div class="im-modes">
        <button type="button" class="im-mode im-mode--primary" data-mode="pass">
          <span class="im-mode-title">Pass &amp; Play</span><span class="im-mode-sub">One phone, pass it around</span>
        </button>
        <button type="button" class="im-mode" data-mode="room">
          <span class="im-mode-title">Play with friends</span><span class="im-mode-sub">Everyone on their own phone</span>
        </button>
        <button type="button" class="im-link" data-mode="join">Have a room code? Join</button>
      </div>
    </div>`);
    body.querySelector('[data-mode="pass"]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-mode="room"]').addEventListener('click', () => {
      shell.close();
      startRoomFlow({});
    });
    body.querySelector('[data-mode="join"]').addEventListener('click', () => {
      shell.close();
      openJoinByCode();
    });
  }

  // ======================= PASS & PLAY =======================

  function renderPassSetup(shell) {
    const settings = loadSettings();
    const body = shell.render(`<div class="im-setup">
      <div class="im-setup-head">
        <div class="im-step-title">Who’s playing?</div>
        <button type="button" class="pk-icon-btn" data-settings aria-label="Game settings">⚙︎</button>
      </div>
      <div data-editor></div>
      <button type="button" class="im-pack-row" data-pack-row></button>
      <div class="im-setup-meta" data-meta></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start>Start</button>
    </div>`);
    const editor = Kit().mountPlayerEditor(body.querySelector('[data-editor]'), {
      names: loadNames(),
      min: Core().MIN_PLAYERS,
      max: Core().MAX_PLAYERS,
      onChange: () => paintMeta(),
    });
    const packRow = body.querySelector('[data-pack-row]');
    const paintPack = () => {
      const p = packById(settings.pack);
      packRow.innerHTML = `<span aria-hidden="true">${esc(p.icon)}</span> Words: <strong>${esc(packLabel(p))}</strong> <span class="im-chev" aria-hidden="true">›</span>`;
    };
    const paintMeta = () => {
      const n = editor.count();
      const k = Core().resolveImposterCount(n, settings.imposters);
      body.querySelector('[data-meta]').textContent =
        (settings.variant === 'undercover' ? 'Undercover' : 'Classic') +
        ' · ' + k + (k === 1 ? ' Imposter' : ' Imposters') +
        (settings.discussionSec ? ' · ' + settings.discussionSec + 's talk' : '');
    };
    paintPack();
    paintMeta();
    packRow.addEventListener('click', () =>
      openPackPicker(settings.pack, (id) => {
        settings.pack = id;
        saveSettings(settings);
        paintPack();
      })
    );
    body.querySelector('[data-settings]').addEventListener('click', () =>
      openSettings(settings, {
        players: editor.count(),
        onSave: (s) => {
          Object.assign(settings, s);
          saveSettings(settings);
          paintMeta();
        },
      })
    );
    body.querySelector('[data-start]').addEventListener('click', () => {
      const names = editor.list();
      saveNames(names);
      const session = {
        players: names.map((name, i) => ({ id: 'p' + i, name })),
        scores: {},
        roundNo: 0,
        usedKeys: [],
        settings: Core().mergeSettings(settings),
      };
      session.players.forEach((p) => (session.scores[p.id] = 0));
      startPassRound(shell, session);
    });
  }

  function nameOf(session, id) {
    const p = session.players.find((x) => x.id === id);
    return p ? p.name : 'Someone';
  }

  function startPassRound(shell, session) {
    const ids = session.players.map((p) => p.id);
    const dealt = Core().deal(ids, session.settings, { usedKeys: session.usedKeys });
    session.usedKeys.push(dealt.key);
    session.roundNo += 1;
    const starter = (session.roundNo - 1) % ids.length;
    session.round = {
      settings: dealt.settings,
      hidden: dealt.hidden,
      secrets: dealt.secrets,
      pub: Core().createRound(ids, dealt.settings, starter),
    };
    shell.setSubtitle('Round ' + session.roundNo);
    renderPassReveal(shell, session, 0);
  }

  function passAct(shell, session, action) {
    const r = session.round;
    const out = Core().applyAction(r.pub, r.hidden, r.settings, action);
    if (out.error) return false;
    r.pub = out.pub;
    routePass(shell, session);
    return true;
  }

  function routePass(shell, session) {
    const p = session.round.pub;
    if (p.phase === 'clues') renderPassClues(shell, session);
    else if (p.phase === 'discuss') renderPassDiscuss(shell, session);
    else if (p.phase === 'vote' || p.phase === 'revote') renderPassVote(shell, session);
    else if (p.phase === 'defence') renderPassDefence(shell, session);
    else if (p.phase === 'steal') renderPassSteal(shell, session);
    else if (p.phase === 'result') renderPassResult(shell, session);
  }

  /** Forward-only card handout — index only ever increases. */
  function renderPassReveal(shell, session, index) {
    const order = session.round.pub.players;
    if (index >= order.length) {
      session.round.secrets = null; // nothing left to re-reveal
      passAct(shell, session, { type: 'startClues' });
      return;
    }
    const id = order[index];
    const secret = session.round.secrets[id];
    const body = shell.render(`<div class="im-reveal">
      <div class="im-progress">Card ${index + 1} of ${order.length}</div>
      <div data-cover></div>
    </div>`);
    Kit().mountPassCover(body.querySelector('[data-cover]'), {
      name: nameOf(session, id),
      revealHtml: () => cardFaceHtml(secret),
      doneLabel: index === order.length - 1 ? 'Hide & start' : 'Hide & pass',
      onDone: () => renderPassReveal(shell, session, index + 1),
    });
  }

  function cluesListHtml(session, pub, names) {
    const nm = names || ((id) => nameOf(session, id));
    if (!pub.clues.length) return '';
    return `<div class="im-clues">${pub.clues
      .map(
        (c) => `<div class="im-clue${c.skipped ? ' is-skipped' : ''}"><span class="im-clue-who">${esc(nm(c.id))}</span><span class="im-clue-word">${
          c.skipped ? 'skipped' : c.text ? esc(c.text) : '🗣️'
        }</span></div>`
      )
      .join('')}</div>`;
  }

  function renderPassClues(shell, session) {
    const pub = session.round.pub;
    const giver = Core().currentClueGiver(pub);
    const n = pub.order.length;
    const circuit = Math.floor(pub.turn / n) + 1;
    const circuits = session.round.settings.circuits;
    const body = shell.render(`<div class="im-clue-turn">
      <div class="im-progress">Clue round ${circuit} of ${circuits} · ${(pub.turn % n) + 1}/${n}</div>
      <div class="im-turn-name">${esc(nameOf(session, giver))}</div>
      <div class="im-turn-sub">Say <strong>one word</strong> out loud</div>
      <div class="im-rule">Not the word · not a translation · not part of it · no repeats</div>
      <div class="im-order">${pub.order
        .map((id, i) => {
          const done = pub.turn >= n * (circuit - 1) + i + 1;
          return `<span class="im-order-chip${id === giver ? ' is-now' : ''}${done ? ' is-done' : ''}">${esc(nameOf(session, id))}</span>`;
        })
        .join('')}</div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>Said it — next</button>
      <button type="button" class="im-link" data-skip-all>Skip to discussion</button>
    </div>`);
    body.querySelector('[data-next]').addEventListener('click', () => passAct(shell, session, { type: 'spoken' }));
    body.querySelector('[data-skip-all]').addEventListener('click', () => passAct(shell, session, { type: 'startDiscussion' }));
  }

  function renderPassDiscuss(shell, session) {
    const secs = session.round.settings.discussionSec;
    if (!secs) {
      passAct(shell, session, { type: 'startVote' });
      return;
    }
    const body = shell.render(`<div class="im-discuss">
      <div class="im-step-title">Discuss</div>
      <div class="im-turn-sub">Who sounded like they didn’t know the word?</div>
      <div class="pk-timer" data-timer></div>
      <div class="im-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-pause>Pause</button>
        <button type="button" class="pk-btn pk-btn--primary" data-vote>Vote now</button>
      </div>
    </div>`);
    let moved = false;
    const go = () => {
      if (moved) return;
      moved = true;
      timer.stop();
      passAct(shell, session, { type: 'startVote' });
    };
    const timer = Kit().countdown(body.querySelector('[data-timer]'), { seconds: secs, onDone: go });
    const pauseBtn = body.querySelector('[data-pause]');
    pauseBtn.addEventListener('click', () => {
      if (timer.paused) {
        timer.resume();
        pauseBtn.textContent = 'Pause';
      } else {
        timer.pause();
        pauseBtn.textContent = 'Resume';
      }
    });
    body.querySelector('[data-vote]').addEventListener('click', go);
  }

  function playersFor(session, ids) {
    return ids.map((id) => ({ id, name: nameOf(session, id) }));
  }

  function renderPassVote(shell, session) {
    const pub = session.round.pub;
    const style = session.round.settings.voteStyle;
    const revote = pub.phase === 'revote';
    const again = pub.voteRound > 1 && !revote;
    if (style === 'secret') {
      renderPassSecretVote(shell, session, 0);
      return;
    }
    const body = shell.render(`<div class="im-vote">
      <div class="im-step-title">${revote ? 'Revote' : again ? 'Another Imposter is out there' : 'Vote'}</div>
      <div class="im-turn-sub">${
        revote ? 'Only the tied players are up. ' : ''
      }On three, everyone points at the Imposter. Tap who got the most fingers.</div>
      <div data-picker></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-accuse disabled>Accuse</button>
      <button type="button" class="im-link" data-tie>It’s a tie</button>
    </div>`);
    let picked = null;
    const accuseBtn = body.querySelector('[data-accuse]');
    Kit().mountPicker(body.querySelector('[data-picker]'), {
      players: playersFor(session, pub.candidates),
      onPick: (ids) => {
        picked = ids[0];
        accuseBtn.disabled = !picked;
        accuseBtn.textContent = 'Accuse ' + nameOf(session, picked);
      },
    });
    accuseBtn.addEventListener('click', () => picked && passAct(shell, session, { type: 'accuse', target: picked }));
    body.querySelector('[data-tie]').addEventListener('click', () => {
      if (revote) {
        passAct(shell, session, { type: 'declareTie', tied: pub.candidates.slice(0, 2) });
        return;
      }
      renderPassTiePick(shell, session);
    });
  }

  function renderPassTiePick(shell, session) {
    const pub = session.round.pub;
    const body = shell.render(`<div class="im-vote">
      <div class="im-step-title">Who tied?</div>
      <div class="im-turn-sub">Pick everyone with the most votes.</div>
      <div data-picker></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-ok disabled>Give them a defence</button>
      <button type="button" class="im-link" data-back>Back to vote</button>
    </div>`);
    let tied = [];
    const ok = body.querySelector('[data-ok]');
    Kit().mountPicker(body.querySelector('[data-picker]'), {
      players: playersFor(session, pub.candidates),
      multi: true,
      onPick: (ids) => {
        tied = ids;
        ok.disabled = ids.length < 2;
      },
    });
    ok.addEventListener('click', () => passAct(shell, session, { type: 'declareTie', tied }));
    body.querySelector('[data-back]').addEventListener('click', () => renderPassVote(shell, session));
  }

  /** Secret vote: pass the phone to each voter in turn; votes stay hidden until the tally. */
  function renderPassSecretVote(shell, session, index) {
    const pub = session.round.pub;
    if (pub.phase !== 'vote' && pub.phase !== 'revote') {
      routePass(shell, session);
      return;
    }
    const voters = pub.voters;
    if (index >= voters.length) return;
    const voter = voters[index];
    const body = shell.render(`<div class="im-reveal">
      <div class="im-progress">${pub.phase === 'revote' ? 'Revote' : 'Secret vote'} · ${index + 1} of ${voters.length}</div>
      <div class="pk-pass">
        <div class="pk-pass-lead">Pass the phone to</div>
        <div class="pk-pass-name">${esc(nameOf(session, voter))}</div>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-ready>I’m ${esc(nameOf(session, voter))} — vote</button>
      </div>
    </div>`);
    body.querySelector('[data-ready]').addEventListener('click', () => {
      const b = shell.render(`<div class="im-vote">
        <div class="im-step-title">Who’s the Imposter?</div>
        <div class="im-turn-sub">Nobody else will see your vote.</div>
        <div data-picker></div>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-cast disabled>Vote &amp; pass</button>
      </div>`);
      let target = null;
      const cast = b.querySelector('[data-cast]');
      Kit().mountPicker(b.querySelector('[data-picker]'), {
        players: playersFor(session, pub.candidates),
        exclude: [voter],
        onPick: (ids) => {
          target = ids[0];
          cast.disabled = !target;
        },
      });
      cast.addEventListener('click', () => {
        const r = session.round;
        const out = Core().applyAction(r.pub, r.hidden, r.settings, { type: 'vote', id: voter, target });
        if (out.error) return;
        r.pub = out.pub;
        if (r.pub.phase === 'vote' || r.pub.phase === 'revote') {
          if (r.pub.voted.length < r.pub.voters.length) {
            renderPassSecretVote(shell, session, index + 1);
            return;
          }
        }
        renderPassTally(shell, session);
      });
    });
  }

  function renderPassTally(shell, session) {
    const pub = session.round.pub;
    const t = pub.lastTally;
    if (!t) {
      routePass(shell, session);
      return;
    }
    const rows = Object.keys(t.counts)
      .sort((a, b) => t.counts[b] - t.counts[a])
      .map((id) => `<div class="im-tally-row"><span>${esc(nameOf(session, id))}</span><strong>${t.counts[id]}</strong></div>`)
      .join('');
    const body = shell.render(`<div class="im-vote">
      <div class="im-step-title">The votes are in</div>
      <div class="im-tally">${rows}</div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>Continue</button>
    </div>`);
    body.querySelector('[data-go]').addEventListener('click', () => routePass(shell, session));
  }

  function renderPassDefence(shell, session) {
    const pub = session.round.pub;
    const secs = session.round.settings.defenceSec;
    const body = shell.render(`<div class="im-discuss">
      <div class="im-step-title">It’s a tie</div>
      <div class="im-turn-sub">${pub.tied.map((id) => esc(nameOf(session, id))).join(' vs ')} — each gets a quick defence, then revote. Another tie and the Imposter survives.</div>
      <div class="pk-timer" data-timer></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>Revote</button>
    </div>`);
    let moved = false;
    const go = () => {
      if (moved) return;
      moved = true;
      timer.stop();
      passAct(shell, session, { type: 'endDefence' });
    };
    const timer = Kit().countdown(body.querySelector('[data-timer]'), { seconds: secs, onDone: go });
    body.querySelector('[data-go]').addEventListener('click', go);
  }

  function renderPassSteal(shell, session) {
    const r = session.round;
    const pub = r.pub;
    const who = nameOf(session, pub.stealer);
    const undercover = r.settings.variant === 'undercover';
    const body = shell.render(`<div class="im-steal">
      <div class="im-caught">🎯</div>
      <div class="im-step-title">${esc(who)} ${undercover ? 'was the odd one out!' : 'was an Imposter!'}</div>
      <div class="im-turn-sub">${esc(who)}, one guess to steal the win: ${undercover ? 'what was everyone else’s word?' : 'what’s the secret word?'}</div>
      <input class="pk-input" data-guess maxlength="40" placeholder="Type the word (or say it out loud)" autocomplete="off" enterkeyhint="done">
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-check>Check guess</button>
      <button type="button" class="im-link" data-spoken>They said it out loud</button>
    </div>`);
    const input = body.querySelector('[data-guess]');
    const check = (spoken) => {
      const guess = spoken ? '' : input.value.trim();
      if (!spoken && !guess) {
        input.focus();
        return;
      }
      const auto = guess ? Core().matchGuess(guess, r.hidden.majority) : false;
      const b = shell.render(`<div class="im-steal">
        <div class="im-step-title">The word was</div>
        <div class="im-card-word">${esc(word(r.hidden.majority))}</div>
        ${guess ? `<div class="im-turn-sub">${esc(who)} guessed “${esc(guess)}” — ${auto ? 'looks right ✅' : 'looks wrong ❌'}</div>` : `<div class="im-turn-sub">Did ${esc(who)} say it?</div>`}
        <div class="im-row">
          <button type="button" class="pk-btn ${auto ? 'pk-btn--primary' : 'pk-btn--ghost'}" data-accept>Group accepts</button>
          <button type="button" class="pk-btn ${auto ? 'pk-btn--ghost' : 'pk-btn--primary'}" data-reject>Group rejects</button>
        </div>
      </div>`);
      b.querySelector('[data-accept]').addEventListener('click', () => passAct(shell, session, { type: 'stealVerdict', ok: true, guess }));
      b.querySelector('[data-reject]').addEventListener('click', () => passAct(shell, session, { type: 'stealVerdict', ok: false, guess }));
    };
    body.querySelector('[data-check]').addEventListener('click', () => check(false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') check(false);
    });
    body.querySelector('[data-spoken]').addEventListener('click', () => check(true));
  }

  function renderPassResult(shell, session) {
    const res = session.round.pub.result;
    if (!session.round.scored) {
      session.round.scored = true;
      Object.keys(res.points).forEach((id) => (session.scores[id] = (session.scores[id] || 0) + res.points[id]));
    }
    const body = shell.render(resultHtml(res, (id) => nameOf(session, id), session.round.settings, {
      scoreboard: Kit().scoreboardHtml(session.players, session.scores, res.points),
      tally: null,
    }) + `<div class="im-result-actions">
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>Next round</button>
        <div class="im-row">
          <button type="button" class="pk-btn pk-btn--ghost" data-share>Share</button>
          <button type="button" class="pk-btn pk-btn--ghost" data-setup>Players &amp; settings</button>
        </div>
      </div>`);
    body.querySelector('[data-next]').addEventListener('click', () => startPassRound(shell, session));
    body.querySelector('[data-share]').addEventListener('click', () => shareResult(res, (id) => nameOf(session, id)));
    body.querySelector('[data-setup]').addEventListener('click', () => renderPassSetup(shell));
    try {
      if (typeof gameFeedback === 'function') gameFeedback(res.winner === 'crew' ? 'win' : 'select');
    } catch (e) {}
  }

  // ---------------- shared result ----------------

  function resultHeadline(res, nm) {
    const imps = res.imposters.map(nm);
    const stole = res.caught.find((c) => c.stealOk);
    if (stole) return { glyph: '😈', title: nm(stole.id) + ' stole the win!', sub: 'Caught — but guessed the word.' };
    if (res.survivors.length) {
      const who = res.survivors.map(nm).join(' & ');
      const why =
        res.reason === 'wrong_accused' ? 'The group voted out the wrong person.' : 'Nobody could agree — the Imposter slipped away.';
      return { glyph: '🕵️', title: who + ' fooled everyone!', sub: why };
    }
    return { glyph: '🎉', title: 'Crew wins!', sub: (imps.length > 1 ? 'Imposters ' : 'Imposter ') + imps.join(' & ') + ' caught.' };
  }

  function resultHtml(res, nm, settings, extra) {
    const h = resultHeadline(res, nm);
    const x = extra || {};
    const words = res.minority
      ? `<div class="im-words"><div><span>Crew word</span><strong>${esc(word(res.majority))}</strong></div><div><span>Imposter word</span><strong>${esc(word(res.minority))}</strong></div></div>`
      : `<div class="im-words"><div><span>The word</span><strong>${esc(word(res.majority))}</strong></div>${
          res.category ? `<div><span>Category</span><strong>${esc(packLabel(res.category))}</strong></div>` : ''
        }</div>`;
    const steals = res.caught
      .filter((c) => c.guess != null || c.stealOk != null)
      .map(
        (c) =>
          `<div class="im-steal-line">${esc(nm(c.id))} guessed ${c.guess ? '“' + esc(c.guess) + '”' : 'out loud'} — ${c.overridden ? (c.stealOk ? 'group accepted 😈' : 'group said no') : c.stealOk ? 'correct 😈' : 'wrong'}</div>`
      )
      .join('');
    return `<div class="im-result">
      <div class="im-result-glyph" aria-hidden="true">${h.glyph}</div>
      <div class="im-result-title">${esc(h.title)}</div>
      <div class="im-result-sub">${esc(h.sub)}</div>
      ${words}
      <div class="im-result-imps">${res.imposters.length > 1 ? 'Imposters' : 'Imposter'}: <strong>${res.imposters.map((id) => esc(nm(id))).join(', ')}</strong></div>
      ${steals}
      ${x.tally || ''}
      <div class="im-section-label">Scores</div>
      ${x.scoreboard || ''}
    </div>`;
  }

  function shareResult(res, nm) {
    const stole = res.caught.find((c) => c.stealOk);
    let line;
    if (stole) line = nm(stole.id) + ' got caught but stole the win as the Imposter 😈';
    else if (res.survivors.length) line = res.survivors.map(nm).join(' & ') + ' fooled everyone as the Imposter 😈';
    else line = 'We caught the Imposter (' + res.imposters.map(nm).join(' & ') + ') 🕵️';
    const text = line + ' — play Imposter on Chaupaal';
    const url = location.origin + '/';
    const stats =
      typeof buildShareStats === 'function'
        ? buildShareStats({ scoreLine: line, meta: 'Imposter · party game', text, url, caption: line })
        : { scoreLine: line, meta: 'Imposter', text, url };
    if (typeof openUnifiedShareSheet === 'function') {
      openUnifiedShareSheet({ gameId: GAME, title: 'Share', subtitle: line, stats });
    } else if (typeof shareGameResult === 'function') {
      shareGameResult(GAME, stats);
    }
  }

  // ======================= ROOM =======================

  function requireSignIn() {
    if (Kit().isSignedIn()) return true;
    if (typeof showToast === 'function') showToast('Sign in to play on separate phones — Pass & Play works signed out');
    if (typeof openAuthSheet === 'function') openAuthSheet('login');
    return false;
  }

  async function startRoomFlow(opts) {
    const o = opts || {};
    if (!requireSignIn()) return;
    if (navigator.onLine === false) {
      if (typeof showToast === 'function') showToast('You’re offline — Pass & Play works without internet');
      return;
    }
    const settings = loadSettings();
    try {
      const chatId = o.chat ? o.chat.firestoreId || o.chat.id : '';
      const res = await Kit().roomCall(GAME, 'create', {
        name: Kit().myName() || 'Host',
        settings,
        chatId: chatId && chatId !== 'ai' ? chatId : '',
      });
      if (o.chat && chatId && chatId !== 'ai') {
        const sent = await Kit().postInviteToChat(o.chat, GAME, res.code, LABEL);
        if (sent && typeof showToast === 'function') showToast('Invite posted in the chat');
      }
      openRoom(res.code, { host: true });
    } catch (e) {
      if (typeof showToast === 'function') showToast(Kit().roomErrorText(e) || 'Couldn’t create a room');
    }
  }

  function openJoinByCode() {
    if (!requireSignIn()) return;
    Kit().openSheet({
      title: 'Join a room',
      bodyHtml: `<input class="pk-input pk-input--code" data-code maxlength="6" placeholder="ROOM CODE" autocapitalize="characters" autocomplete="off" enterkeyhint="go" aria-label="Room code">
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-join>Join</button>`,
      onMount(sheet, close) {
        const input = sheet.querySelector('[data-code]');
        setTimeout(() => input.focus(), 50);
        const go = () => {
          const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (code.length !== 6) {
            if (typeof showToast === 'function') showToast('Room codes are 6 letters and numbers');
            return;
          }
          close();
          openRoom(code, { join: true });
        };
        input.addEventListener('input', () => (input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
        input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        sheet.querySelector('[data-join]').addEventListener('click', go);
      },
    });
  }

  async function openRoom(code, opts) {
    const o = opts || {};
    if (!requireSignIn()) return;
    if (o.join) {
      try {
        const res = await Kit().roomCall(GAME, 'join', { code, name: Kit().myName() || 'Player' });
        if (res.pending && typeof showToast === 'function') showToast('Round in progress — you’ll be dealt in next round');
      } catch (e) {
        if (typeof showToast === 'function') showToast(Kit().roomErrorText(e) || 'Couldn’t join that room');
        return;
      }
    }
    const view = { code, pub: null, secret: null, presence: {}, key: '', timer: null, seenSent: 0, busy: false };
    let conn = null;
    const shell = Kit().openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: 'Room ' + code,
      confirmLeave: () => !!(view.pub && view.pub.status === 'playing'),
      leaveBody: 'You can rejoin from the invite link while the room is open.',
      onClose: () => {
        if (conn) conn.stop();
      },
    });
    conn = Kit().connectRoom(GAME, code, {
      onPub: (pub) => {
        view.pub = pub;
        paintRoom(shell, conn, view);
      },
      onSecret: (secret) => {
        view.secret = secret;
        paintRoom(shell, conn, view, true);
      },
      onPresence: (p) => {
        view.presence = p;
        paintPresence(shell, view);
      },
    });
    if (!conn) {
      shell.render('<div class="im-empty">Can’t reach the game server right now. Try again in a moment.</div>');
      return;
    }
    shell.render('<div class="im-empty">Joining room…</div>');
  }

  function roomName(view, id) {
    const p = view.pub && view.pub.players && view.pub.players[id];
    return p ? p.name : 'Player';
  }

  function roomPlayers(view) {
    const players = (view.pub && view.pub.players) || {};
    return Object.keys(players)
      .sort((a, b) => (players[a].seat || 0) - (players[b].seat || 0))
      .map((id) => Object.assign({ id }, players[id]));
  }

  function paintPresence(shell, view) {
    shell.el.querySelectorAll('[data-presence]').forEach((dot) => {
      dot.classList.toggle('is-online', Kit().isOnline(view.presence, dot.dataset.presence));
    });
  }

  async function act(conn, view, op, args, errEl) {
    if (view.busy) return false;
    view.busy = true;
    try {
      await conn.op(op, args);
      return true;
    } catch (e) {
      const code = String(e.code || '');
      let msg = Kit().roomErrorText(e);
      if (/^CLUE_/.test(code)) {
        const reason = code.slice(5).toLowerCase();
        msg = Core().CLUE_REASON_COPY[reason] || 'Try a different clue';
      }
      if (errEl) errEl.textContent = msg || '';
      else if (msg && typeof showToast === 'function') showToast(msg);
      return false;
    } finally {
      view.busy = false;
    }
  }

  function paintRoom(shell, conn, view, secretChanged) {
    if (shell.closed) return;
    const pub = view.pub;
    if (!pub) {
      shell.render(`<div class="im-empty">This room isn’t available any more.
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-close>Back to games</button></div>`)
        ?.querySelector('[data-close]')
        ?.addEventListener('click', () => shell.close());
      return;
    }
    const me = conn.uid;
    if (pub.status === 'closed') {
      shell.render(`<div class="im-empty">The host closed this room.
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-close>Done</button></div>`)
        ?.querySelector('[data-close]')
        ?.addEventListener('click', () => shell.close());
      return;
    }
    if (!pub.players || !pub.players[me] || pub.players[me].left) {
      shell.render(`<div class="im-empty">You’re no longer in this room.
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-close>Done</button></div>`)
        ?.querySelector('[data-close]')
        ?.addEventListener('click', () => shell.close());
      return;
    }
    const st = pub.status === 'playing' && pub.state ? Core().hydrateState(pub.state) : null;
    const key = [
      pub.status,
      pub.roundNo,
      st ? st.phase : '',
      st ? st.turn : '',
      st ? st.clues.length : '',
      st ? st.voted.length : '',
      st ? st.voteRound : '',
      st ? String(st.revote) : '',
      pub.host,
      pub.paused ? 'p' : '',
      Object.keys(pub.players).length,
      JSON.stringify(pub.seen || {}),
      JSON.stringify(pub.scores || {}),
      view.secret ? view.secret.roundNo : '',
      JSON.stringify(pub.settings || {}),
    ].join('|');
    if (key === view.key && !secretChanged) return;
    view.key = key;
    // Keep a half-typed clue / guess across re-renders.
    const typing = shell.el.querySelector('[data-keep]');
    const kept = typing ? { name: typing.dataset.keep, value: typing.value, focus: document.activeElement === typing } : null;
    if (pub.status === 'lobby' || !st) renderLobby(shell, conn, view);
    else if (pub.players[me].pending) renderPending(shell, conn, view, st);
    else renderRoomPhase(shell, conn, view, st);
    if (kept) {
      const again = shell.el.querySelector('[data-keep="' + kept.name + '"]');
      if (again) {
        again.value = kept.value;
        if (kept.focus) again.focus();
      }
    }
    paintPresence(shell, view);
  }

  function hostBar(conn, view, st) {
    const isHost = view.pub.host === conn.uid;
    if (!isHost || !st) return '';
    const timed = ['clues', 'discuss', 'vote', 'revote', 'defence', 'steal', 'reveal'].indexOf(st.phase) >= 0;
    if (!timed) return '';
    return `<div class="im-hostbar"><span>Host</span>${
      view.pub.paused
        ? '<button type="button" class="pk-chip" data-host="resume">Resume</button>'
        : '<button type="button" class="pk-chip" data-host="pause">Pause</button>'
    }${st.phase === 'discuss' ? '<button type="button" class="pk-chip" data-host="skipDiscussion">Skip to vote</button>' : ''}</div>`;
  }

  function wireHostBar(body, conn, view) {
    body.querySelectorAll('[data-host]').forEach((btn) =>
      btn.addEventListener('click', () => act(conn, view, btn.dataset.host))
    );
  }

  function renderLobby(shell, conn, view) {
    const pub = view.pub;
    const isHost = pub.host === conn.uid;
    const players = roomPlayers(view).filter((p) => !p.left);
    const s = Core().mergeSettings(pub.settings);
    const k = Core().resolveImposterCount(Math.max(3, players.length), s.imposters);
    const body = shell.render(`<div class="im-lobby">
      <div class="im-code-label">Room code</div>
      <div class="im-code" aria-label="Room code ${esc(view.code)}">${esc(view.code)}</div>
      <div class="im-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share>Share link</button>
        <button type="button" class="pk-btn pk-btn--ghost" data-invite>Invite friends</button>
      </div>
      <div class="im-section-label">In the room · ${players.length}/12</div>
      <div class="im-lobby-list">${players
        .map(
          (p) => `<div class="im-lobby-row"><span class="im-dot" data-presence="${esc(p.id)}"></span><span>${esc(p.name)}</span>${
            p.id === pub.host ? '<span class="im-badge">Host</span>' : ''
          }${p.id === conn.uid ? '<span class="im-badge im-badge--me">You</span>' : ''}</div>`
        )
        .join('')}</div>
      <button type="button" class="im-pack-row" data-settings ${isHost ? '' : 'disabled'}>
        ${esc(packById(s.pack).icon)} ${esc(packLabel(packById(s.pack)))} · ${s.variant === 'undercover' ? 'Undercover' : 'Classic'} · ${k} ${k === 1 ? 'Imposter' : 'Imposters'}
        ${isHost ? '<span class="im-chev" aria-hidden="true">›</span>' : ''}
      </button>
      ${
        isHost
          ? `<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start ${players.length < 3 ? 'disabled' : ''}>${
              players.length < 3 ? 'Need ' + (3 - players.length) + ' more to start' : 'Start'
            }</button>`
          : '<div class="im-wait">Waiting for the host to start…</div>'
      }
      <button type="button" class="im-link" data-leave>Leave room</button>
    </div>`);
    body.querySelector('[data-share]').addEventListener('click', () => Kit().shareRoom(GAME, view.code, LABEL));
    body.querySelector('[data-invite]').addEventListener('click', () => Kit().inviteFriends(GAME, view.code, LABEL));
    body.querySelector('[data-leave]').addEventListener('click', async () => {
      await act(conn, view, 'leave');
      shell.close();
    });
    if (isHost) {
      body.querySelector('[data-settings]').addEventListener('click', () => openRoomSettings(conn, view, players.length));
      body.querySelector('[data-start]')?.addEventListener('click', () => act(conn, view, 'start'));
    }
  }

  function openRoomSettings(conn, view, n) {
    const s = Core().mergeSettings(view.pub.settings);
    Kit().openSheet({
      title: 'Room settings',
      bodyHtml: `<button type="button" class="im-pack-row" data-pack>${esc(packById(s.pack).icon)} Words: <strong>${esc(packLabel(packById(s.pack)))}</strong> <span class="im-chev">›</span></button>
        <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-more>Mode &amp; advanced</button>`,
      onMount(sheet, close) {
        sheet.querySelector('[data-pack]').addEventListener('click', () => {
          close();
          openPackPicker(s.pack, (id) => {
            saveSettings(Object.assign(loadSettings(), { pack: id }));
            act(conn, view, 'settings', { settings: { pack: id } });
          });
        });
        sheet.querySelector('[data-more]').addEventListener('click', () => {
          close();
          openSettings(s, {
            room: true,
            players: n,
            onSave: (next) => {
              saveSettings(next);
              act(conn, view, 'settings', { settings: next });
            },
          });
        });
      },
    });
  }

  function renderPending(shell, conn, view, st) {
    const body = shell.render(`<div class="im-empty">
      <div class="im-step-title">Round in progress</div>
      <div class="im-turn-sub">You’ll be dealt in when the next round starts.</div>
      ${cluesListHtml(null, st, (id) => roomName(view, id))}
      <button type="button" class="im-link" data-leave>Leave room</button>
    </div>`);
    body.querySelector('[data-leave]').addEventListener('click', async () => {
      await act(conn, view, 'leave');
      shell.close();
    });
  }

  function timerHtml() {
    return '<div class="pk-timer" data-timer></div>';
  }

  function mountRoomTimer(body, conn, view) {
    const el = body.querySelector('[data-timer]');
    if (!el) return;
    if (!view.pub.deadline && !view.pub.paused) {
      el.hidden = true;
      return;
    }
    Kit().countdown(el, {
      getEndsAt: () => conn.localDeadline(),
      getPausedMs: () => (view.pub && view.pub.paused ? Number(view.pub.paused.remaining) || 0 : null),
    });
  }

  function peekHtml() {
    return `<button type="button" class="im-peek" data-peek aria-label="Hold to peek at your card">👁 Hold to peek at your card</button>`;
  }

  function wirePeek(body, view) {
    const btn = body.querySelector('[data-peek]');
    if (!btn) return;
    let tip = null;
    const show = (e) => {
      if (e && e.cancelable) e.preventDefault();
      if (tip) return;
      tip = document.createElement('div');
      tip.className = 'im-peek-card';
      tip.innerHTML = cardFaceHtml(view.secret);
      btn.after(tip);
    };
    const hide = () => {
      if (tip) tip.remove();
      tip = null;
    };
    btn.addEventListener('pointerdown', show);
    btn.addEventListener('pointerup', hide);
    btn.addEventListener('pointerleave', hide);
    btn.addEventListener('pointercancel', hide);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function renderRoomPhase(shell, conn, view, st) {
    const me = conn.uid;
    const nm = (id) => roomName(view, id);
    const pub = view.pub;
    const inRound = st.players.indexOf(me) >= 0;
    shell.setSubtitle('Room ' + view.code + ' · Round ' + pub.roundNo);
    const pausedNote = pub.paused ? '<div class="im-paused">Paused by the host</div>' : '';

    if (st.phase === 'reveal') {
      const ready = st.players.filter((id) => pub.seen && pub.seen[id]).length;
      const mine = !!(pub.seen && pub.seen[me]);
      const secretOk = view.secret && Number(view.secret.roundNo) === Number(pub.roundNo);
      if (mine || !inRound) {
        const body = shell.render(`<div class="im-reveal">
          ${hostBar(conn, view, st)}
          <div class="im-step-title">Waiting for everyone to see their card</div>
          <div class="im-turn-sub">${ready}/${st.players.length} ready</div>
          ${timerHtml()}
          ${inRound ? peekHtml() : ''}
        </div>`);
        wireHostBar(body, conn, view);
        wirePeek(body, view);
        mountRoomTimer(body, conn, view);
        return;
      }
      const body = shell.render(`<div class="im-reveal">
        <div class="im-progress">Round ${pub.roundNo} · ${ready}/${st.players.length} ready</div>
        <div data-cover></div>
      </div>`);
      Kit().mountPassCover(body.querySelector('[data-cover]'), {
        lead: 'Your card',
        name: nm(me),
        revealHtml: () => cardFaceHtml(secretOk ? view.secret : null),
        doneLabel: 'I’ve seen it',
        onDone: () => act(conn, view, 'seen'),
      });
      return;
    }

    if (st.phase === 'clues') {
      const giver = Core().currentClueGiver(st);
      const n = st.order.length;
      const circuit = Math.floor(st.turn / n) + 1;
      const mine = giver === me;
      const body = shell.render(`<div class="im-room-clues">
        ${hostBar(conn, view, st)}
        <div class="im-progress">Clue round ${circuit} of ${Core().mergeSettings(pub.settings).circuits}</div>
        ${pausedNote}
        <div class="im-turn-name">${mine ? 'Your turn' : esc(nm(giver)) + '’s turn'}</div>
        ${timerHtml()}
        ${cluesListHtml(null, st, nm)}
        ${
          mine
            ? `<div class="im-clue-form">
                <input class="pk-input" data-keep="clue" data-clue maxlength="24" placeholder="One word" autocomplete="off" autocapitalize="off" enterkeyhint="send" aria-label="Your one-word clue">
                <button type="button" class="pk-btn pk-btn--primary" data-send>Send</button>
              </div>
              <div class="im-error" data-err role="alert"></div>
              <div class="im-rule">Not the word · not a translation · not part of it · no repeats</div>`
            : '<div class="im-wait">Listen closely…</div>'
        }
        ${inRound ? peekHtml() : ''}
      </div>`);
      wireHostBar(body, conn, view);
      wirePeek(body, view);
      mountRoomTimer(body, conn, view);
      if (mine) {
        const input = body.querySelector('[data-clue]');
        const err = body.querySelector('[data-err]');
        const send = async () => {
          const w = view.secret && view.secret.word ? view.secret.word : null;
          const v = Core().validateClue(input.value, { word: w, used: st.clues.map((c) => c.text).filter(Boolean) });
          if (!v.ok) {
            err.textContent = Core().CLUE_REASON_COPY[v.reason] || 'Try another clue';
            return;
          }
          err.textContent = '';
          const ok = await act(conn, view, 'clue', { text: v.text }, err);
          if (ok) input.value = '';
        };
        body.querySelector('[data-send]').addEventListener('click', send);
        input.addEventListener('keydown', (e) => e.key === 'Enter' && send());
        setTimeout(() => input.focus(), 60);
      }
      return;
    }

    if (st.phase === 'discuss') {
      const body = shell.render(`<div class="im-discuss">
        ${hostBar(conn, view, st)}
        <div class="im-step-title">Discuss</div>
        ${pausedNote}
        <div class="im-turn-sub">Who sounded like they didn’t know the word?</div>
        ${timerHtml()}
        ${cluesListHtml(null, st, nm)}
        ${inRound ? peekHtml() : ''}
      </div>`);
      wireHostBar(body, conn, view);
      wirePeek(body, view);
      mountRoomTimer(body, conn, view);
      return;
    }

    if (st.phase === 'vote' || st.phase === 'revote') {
      const canVote = st.voters.indexOf(me) >= 0;
      const voted = st.voted.indexOf(me) >= 0;
      const title = st.phase === 'revote' ? 'Revote' : st.voteRound > 1 ? 'Another Imposter is out there' : 'Vote';
      const body = shell.render(`<div class="im-vote">
        ${hostBar(conn, view, st)}
        <div class="im-step-title">${title}</div>
        ${pausedNote}
        ${timerHtml()}
        <div class="im-turn-sub">${st.voted.length}/${st.voters.length} voted${st.phase === 'revote' ? ' · only the tied players are up' : ''}</div>
        ${
          canVote && !voted
            ? '<div data-picker></div><button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-cast disabled>Lock in vote</button>'
            : `<div class="im-wait">${voted ? 'Vote locked in — waiting for the rest…' : 'Watching the vote…'}</div>`
        }
        ${cluesListHtml(null, st, nm)}
      </div>`);
      wireHostBar(body, conn, view);
      mountRoomTimer(body, conn, view);
      if (canVote && !voted) {
        let target = null;
        const cast = body.querySelector('[data-cast]');
        Kit().mountPicker(body.querySelector('[data-picker]'), {
          players: st.candidates.map((id) => ({ id, name: nm(id) })),
          exclude: [me],
          onPick: (ids) => {
            target = ids[0];
            cast.disabled = !target;
            cast.textContent = 'Vote ' + nm(target);
          },
        });
        cast.addEventListener('click', () => target && act(conn, view, 'vote', { target }));
      }
      return;
    }

    if (st.phase === 'defence') {
      const body = shell.render(`<div class="im-discuss">
        ${hostBar(conn, view, st)}
        <div class="im-step-title">It’s a tie</div>
        ${pausedNote}
        <div class="im-turn-sub">${st.tied.map((id) => esc(nm(id))).join(' vs ')} — quick defence, then a revote. Another tie and the Imposter survives.</div>
        ${voteBreakdownHtml(st, nm)}
        ${timerHtml()}
      </div>`);
      wireHostBar(body, conn, view);
      mountRoomTimer(body, conn, view);
      return;
    }

    if (st.phase === 'steal') {
      const mine = st.stealer === me;
      const undercover = Core().mergeSettings(pub.settings).variant === 'undercover';
      const body = shell.render(`<div class="im-steal">
        ${hostBar(conn, view, st)}
        <div class="im-caught">🎯</div>
        <div class="im-step-title">${mine ? 'You' : esc(nm(st.stealer))} ${undercover ? (mine ? 'were the odd one out!' : 'was the odd one out!') : mine ? 'were caught!' : 'was an Imposter!'}</div>
        ${voteBreakdownHtml(st, nm)}
        ${timerHtml()}
        ${
          mine
            ? `<div class="im-turn-sub">One guess to steal the win — ${undercover ? 'what was everyone else’s word?' : 'what’s the secret word?'}</div>
               <input class="pk-input" data-keep="guess" data-guess maxlength="40" placeholder="Your guess" autocomplete="off" enterkeyhint="send">
               <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-steal>Guess</button>
               <div class="im-error" data-err role="alert"></div>`
            : `<div class="im-wait">${esc(nm(st.stealer))} is guessing the word…</div>`
        }
      </div>`);
      wireHostBar(body, conn, view);
      mountRoomTimer(body, conn, view);
      if (mine) {
        const input = body.querySelector('[data-guess]');
        const go = () => {
          if (!input.value.trim()) return input.focus();
          act(conn, view, 'steal', { guess: input.value.trim() }, body.querySelector('[data-err]'));
        };
        body.querySelector('[data-steal]').addEventListener('click', go);
        input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        setTimeout(() => input.focus(), 60);
      }
      return;
    }

    if (st.phase === 'result' && st.result) {
      const res = st.result;
      const isHost = pub.host === me;
      const players = roomPlayers(view)
        .filter((p) => !p.left)
        .map((p) => ({ id: p.id, name: p.name }));
      const body = shell.render(
        resultHtml(res, nm, pub.settings, {
          scoreboard: Kit().scoreboardHtml(players, pub.scores, res.points),
          tally: voteBreakdownHtml(st, nm),
        }) +
          `<div class="im-result-actions">
            ${
              isHost
                ? '<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>Next round</button>'
                : '<div class="im-wait">Waiting for the host to deal the next round…</div>'
            }
            <div class="im-row">
              <button type="button" class="pk-btn pk-btn--ghost" data-share>Share</button>
              ${isHost ? '<button type="button" class="pk-btn pk-btn--ghost" data-settings>Settings</button>' : '<button type="button" class="pk-btn pk-btn--ghost" data-invite>Invite</button>'}
            </div>
            <button type="button" class="im-link" data-leave>${isHost ? 'End room' : 'Leave room'}</button>
          </div>`
      );
      body.querySelector('[data-share]').addEventListener('click', () => shareResult(res, nm));
      body.querySelector('[data-next]')?.addEventListener('click', () => act(conn, view, 'next'));
      body.querySelector('[data-settings]')?.addEventListener('click', () => openRoomSettings(conn, view, players.length));
      body.querySelector('[data-invite]')?.addEventListener('click', () => Kit().inviteFriends(GAME, view.code, LABEL));
      body.querySelector('[data-leave]').addEventListener('click', async () => {
        await act(conn, view, isHost ? 'end' : 'leave');
        shell.close();
      });
      if (!view.celebrated || view.celebrated !== pub.roundNo) {
        view.celebrated = pub.roundNo;
        const iWon = (res.points[me] || 0) > 0;
        try {
          if (typeof gameFeedback === 'function') gameFeedback(iWon ? 'win' : 'select');
        } catch (e) {}
      }
    }
  }

  function voteBreakdownHtml(st, nm) {
    const t = st.lastTally;
    if (!t || !t.votes || !Object.keys(t.votes).length) return '';
    const rows = Object.keys(t.votes)
      .map((v) => `<div class="im-tally-row"><span>${esc(nm(v))}</span><span class="im-arrow" aria-hidden="true">→</span><strong>${esc(nm(t.votes[v]))}</strong></div>`)
      .join('');
    return `<details class="im-breakdown"><summary>${t.revote ? 'Revote' : 'Vote'} breakdown</summary><div class="im-tally">${rows}</div></details>`;
  }

  // ---------------- registration ----------------

  if (window.PartyKit) PartyKit.registerPartyGame(GAME, { label: LABEL, openRoom });

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'imposter',
      name: LABEL,
      desc: 'Everyone knows the word — except the Imposter',
      icon: '🕵️',
      gameType: 'multiplayer',
      genre: 'party',
      ratingKey: null,
      dangal: true,
      chat1v1: false,
      chatGroup: true,
      selfChat: false,
      order: 20,
      meta: {
        kit: 'party-kit.js (Pass & Play + Room)',
        dealing: 'party_room → server-lib/party-deal.js; roles never in shared state',
        packs: 'data/imposter-packs.js',
      },
      launch: openImposter,
    });
  }

  window.openImposterGame = openImposter;
})();
