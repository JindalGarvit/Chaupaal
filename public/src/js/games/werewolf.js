/**
 * Werewolf — Dangal party game (H1) on the Party Kit. Theme toggle: Werewolf | Mafia (same engine).
 *   Pass & Play: one phone, offline, no sign-in — WerewolfCore runs locally. Every player takes a
 *                night screen of the same shape and length, so nobody can tell roles apart.
 *   Room: each player on their own phone — roles dealt and nights resolved by party_room
 *         (server-lib/werewolf-engine.js); roles, night choices, Seer results and the wolf chat are
 *         readable only by their owners.
 * Virtual points only; never chips.
 */
(function () {
  'use strict';

  const GAME = 'werewolf';
  const LABEL = 'Werewolf';
  const SETTINGS_KEY = 'chaupaal_werewolf_settings';
  const NAMES_KEY = 'chaupaal_werewolf_names';
  const VOICE_KEY = 'chaupaal_werewolf_voice';
  /** Every night screen holds for the same time after a choice, whatever the role. */
  const NIGHT_HOLD_MS = 2600;

  const Core = () => window.WerewolfCore;
  const Kit = () => window.PartyKit;
  const esc = (s) => (window.PartyKit ? PartyKit.esc(s) : String(s == null ? '' : s));

  function tr(key, fallback) {
    return typeof t === 'function' ? t('werewolf.' + key, fallback) : fallback;
  }

  function lang() {
    const raw = typeof currentLang !== 'undefined' ? currentLang : 'en';
    return typeof normalizeLang === 'function' ? normalizeLang(raw) : raw;
  }

  // ---------------- theme + copy ----------------

  function themeId(s) {
    return Core().theme(s).id;
  }

  function rn(role, th) {
    const id = themeId(th);
    return tr(id + '.role.' + role, Core().roleName(role, id));
  }

  function rp(role, th) {
    const id = themeId(th);
    return tr(id + '.plural.' + role, Core().theme(id).roles[role].plural);
  }

  function ri(role, th) {
    return Core().roleIcon(role, th);
  }

  function teamLabel(team, th) {
    const id = themeId(th);
    return tr(id + '.team.' + team, Core().teamName(team, id));
  }

  /** Theme narration lines, each localisable via i18n (werewolf.<theme>.line.<key>). */
  function lines(th) {
    const id = themeId(th);
    const base = Core().theme(id).lines;
    const out = {};
    Object.keys(base).forEach((k) => {
      if (k === 'win') {
        out.win = {};
        Object.keys(base.win).forEach((w) => (out.win[w] = tr(id + '.line.win.' + w, base.win[w])));
      } else out[k] = tr(id + '.line.' + k, base[k]);
    });
    return out;
  }

  function narrate(entry, th, nm) {
    return Core().narrate(entry, themeId(th), nm, lines(th));
  }

  function roleTip(role, s) {
    const th = themeId(s);
    const set = Core().mergeSettings(s);
    switch (role) {
      case 'wolf':
        return tr('tip.wolf', 'Each night, choose someone to take with the other ' + rp('wolf', th) + '. By day, blend in.');
      case 'seer':
        return tr('tip.seer', 'Each night, check one player to learn which side they’re on.');
      case 'doctor':
        return set.doctorRepeat
          ? tr('tip.doctorRepeat', 'Each night, protect one player — yourself included.')
          : tr('tip.doctor', 'Each night, protect one player — yourself included. Not the same player two nights running.');
      case 'hunter':
        return tr('tip.hunter', 'If you’re eliminated, you take one player with you.');
      case 'witch':
        return tr('tip.witch', 'You have one save potion and one sleep potion — each works once per game.');
      case 'tanner':
        return tr('tip.tanner', 'You win only if the group votes you out. Act a little suspicious!');
      case 'bodyguard':
        return tr('tip.bodyguard', 'Each night, guard someone else — not the same person two nights running.');
      default:
        return tr('tip.villager', 'Find the ' + rp('wolf', th) + ' by talking and voting. At night, note who you suspect.');
    }
  }

  function roleBlurb(role, th) {
    const w = rp('wolf', th);
    return {
      wolf: tr('glossary.wolf', 'Picks someone to take each night. Wins when they match the rest.'),
      seer: tr('glossary.seer', 'Checks one player a night: ' + w + ' or not?'),
      doctor: tr('glossary.doctor', 'Protects one player a night.'),
      villager: tr('glossary.villager', 'No night power — finds the ' + w + ' by talking.'),
      hunter: tr('glossary.hunter', 'Takes someone down with them when eliminated.'),
      witch: tr('glossary.witch', 'One save potion and one sleep potion per game.'),
      tanner: tr('glossary.tanner', 'Plays alone — wins only by being voted out.'),
      bodyguard: tr('glossary.bodyguard', 'Guards someone else each night, never the same person twice in a row.'),
    }[role];
  }

  // ---------------- settings ----------------

  function loadSettings() {
    try {
      return Core().mergeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch (e) {
      return Core().mergeSettings({});
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
      if (Array.isArray(raw) && raw.length >= Core().MIN_PLAYERS) return raw.slice(0, Core().MAX_PASS);
    } catch (e) {}
    const out = [Kit().myName() || ''];
    while (out.length < 7) out.push('');
    return out;
  }

  function saveNames(names) {
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(names.slice(0, Core().MAX_PASS)));
    } catch (e) {}
  }

  function rolesLine(n, s) {
    const b = Core().balance(Math.max(Core().MIN_PLAYERS, n), s);
    const th = themeId(s);
    const specials = b.roles.filter((r) => r !== 'wolf' && r !== 'villager').map((r) => rn(r, th));
    return b.wolves + ' ' + (b.wolves === 1 ? rn('wolf', th) : rp('wolf', th)) + ' · ' + specials.join(', ');
  }

  function balanceHtml(n, s, opts) {
    const b = Core().balance(Math.max(Core().MIN_PLAYERS, n), s);
    const pct = Math.max(4, Math.min(96, 50 + b.score * 9));
    const note = b.note && !(opts && opts.bestShown && n < Core().BEST_WITH && /^Best with/.test(b.note)) ? b.note : '';
    return `<div class="ww-balance is-${b.tone}">
      <div class="ww-balance-row"><span>${esc(rolesLine(n, s))}</span><span class="ww-balance-label">${esc(b.label)}</span></div>
      <div class="ww-balance-bar" aria-hidden="true"><span style="left:${pct}%"></span></div>
      ${note ? `<div class="ww-balance-note">${esc(note)}</div>` : ''}
    </div>`;
  }

  function summaryLine(s) {
    const set = Core().mergeSettings(s);
    const extras = Core().OPTIONAL.filter((r) => set[r]).map((r) => rn(r, set));
    return (
      Core().theme(set).label +
      ' · ' + (set.wolves ? set.wolves + ' ' + rp('wolf', set) : 'Auto-balanced') +
      (extras.length ? ' · +' + extras.join(', ') : '') +
      ' · ' + Math.round(set.discussSec / 60) + ' min talk'
    );
  }

  /**
   * Settings sheet. Default layer: discussion time, reveal, voice. Theme, roles, timers under Advanced.
   * @param {{ onSave: (s) => void, room?: boolean, count?: () => number }} opts
   */
  function openSettings(settings, opts) {
    const s = Object.assign({}, settings);
    const K = Kit();
    const C = Core();
    const voice = { voice: voiceOn() ? 'on' : 'off' };
    const n = () => (opts.count ? opts.count() : 8);
    const roleRow = (r) => `<div class="pk-field">
        <div class="pk-field-label">${esc(ri(r, s))} ${esc(rn(r, s))} <span class="ww-help">— ${esc(roleBlurb(r, s))}</span></div>
        ${K.segHtml(r, s[r], [[false, 'Off'], [true, 'On']])}
      </div>`;
    K.openSheet({
      title: 'Game settings',
      bodyHtml: `
        <div class="pk-field">
          <div class="pk-field-label">Discussion time</div>
          ${K.segHtml('discussSec', s.discussSec, C.DISCUSS_OPTIONS.map((x) => [x, x / 60 + ' min']))}
        </div>
        <div class="pk-field">
          <div class="pk-field-label">Show a player’s role when they’re out</div>
          ${K.segHtml('reveal', s.reveal, [[true, 'Yes'], [false, 'No']])}
        </div>
        <div class="pk-field" data-voice-field>
          <div class="pk-field-label">Narrator voice &amp; sounds (this phone)</div>
          ${K.segHtml('voice', voice.voice, [['on', 'On'], ['off', 'Off']])}
        </div>
        <details class="pk-advanced">
          <summary>Advanced</summary>
          <div class="pk-field">
            <div class="pk-field-label">Theme</div>
            ${K.segHtml('theme', s.theme, [['werewolf', '🐺 Werewolf'], ['mafia', '🕴️ Mafia']])}
          </div>
          <div class="pk-field">
            <div class="pk-field-label" data-wolf-label>${esc(rp('wolf', s))}</div>
            ${K.segHtml('wolves', s.wolves, [[0, 'Auto'], [1, '1'], [2, '2'], [3, '3'], [4, '4']])}
          </div>
          <div class="pk-field-help">${esc(rn('seer', s))} and ${esc(rn('doctor', s))} are always in. Extra roles:</div>
          ${C.OPTIONAL.map(roleRow).join('')}
          <div data-balance>${balanceHtml(n(), s)}</div>
          <div class="pk-field">
            <div class="pk-field-label">${esc(rn('doctor', s))} can protect the same player two nights running</div>
            ${K.segHtml('doctorRepeat', s.doctorRepeat, [[false, 'No'], [true, 'Yes']])}
          </div>
          ${
            opts.room
              ? `<div class="pk-field">
            <div class="pk-field-label">Night timer</div>
            ${K.segHtml('nightSec', s.nightSec, C.NIGHT_OPTIONS.map((x) => [x, x + 's']))}
          </div>
          <div class="pk-field">
            <div class="pk-field-label">Vote timer</div>
            ${K.segHtml('voteSec', s.voteSec, C.VOTE_OPTIONS.map((x) => [x, x + 's']))}
          </div>`
              : `<div class="pk-field">
            <div class="pk-field-label">Day vote</div>
            ${K.segHtml('voteStyle', s.voteStyle, [['quick', 'Point on 3'], ['secret', 'Secret pass-around']])}
            <div class="pk-field-help">Point on 3: everyone points at once and the phone holder taps the result.</div>
          </div>`
          }
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>Done</button>`,
      onMount(sheet, close) {
        const all = Object.assign(s, {});
        K.wireSegs(sheet, all, (key) => {
          if (key === 'voice') return;
          const bal = sheet.querySelector('[data-balance]');
          if (bal) bal.innerHTML = balanceHtml(n(), all);
        });
        sheet.querySelector('[data-save]').addEventListener('click', () => {
          setVoice(all.voice !== 'off');
          delete all.voice;
          close();
          opts.onSave(C.mergeSettings(all));
        });
      },
    });
  }

  // ---------------- narrator voice + sound ----------------

  function voiceOn() {
    try {
      return localStorage.getItem(VOICE_KEY) !== 'off';
    } catch (e) {
      return true;
    }
  }

  function setVoice(on) {
    try {
      localStorage.setItem(VOICE_KEY, on ? 'on' : 'off');
    } catch (e) {}
    if (!on) {
      hush();
      if (window.Sound) Sound.stopAmbient();
    }
  }

  function muted() {
    return !voiceOn() || (typeof quietMode !== 'undefined' && quietMode);
  }

  function hush() {
    try {
      if (window.speechSynthesis) speechSynthesis.cancel();
    } catch (e) {}
  }

  /** Read a narrator line aloud (Web Speech API) in the reader's language when a voice exists. */
  function say(text) {
    if (muted() || !text || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const want = String(lang() || 'en').toLowerCase();
      const voices = speechSynthesis.getVoices() || [];
      const v = voices.find((x) => String(x.lang).toLowerCase().indexOf(want) === 0) || voices.find((x) => /^en/i.test(x.lang));
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      } else u.lang = want === 'en' ? 'en-US' : want;
      u.rate = 0.95;
      u.pitch = 0.95;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  function sfx(token) {
    if (muted()) return;
    try {
      if (window.Sound) Sound.play(token);
    } catch (e) {}
  }

  /** Night / day visual + gentle ambience. Stops when the shell closes. */
  function mood(shell, kind) {
    if (!shell || !shell.el) return;
    shell.el.classList.toggle('ww-night', kind === 'night');
    shell.el.classList.toggle('ww-day', kind === 'day');
    if (window.Sound) {
      if (muted() || !kind) Sound.stopAmbient();
      else Sound.playAmbient(kind);
    }
    if (!shell.wwWatch) {
      shell.wwWatch = setInterval(() => {
        if (!shell.closed && shell.el.isConnected) return;
        clearInterval(shell.wwWatch);
        hush();
        if (window.Sound) Sound.stopAmbient();
      }, 1000);
    }
  }

  function muteBtnHtml() {
    const on = !muted();
    return `<button type="button" class="ww-mute" data-ww-mute aria-pressed="${!on}" aria-label="${on ? 'Mute narrator' : 'Unmute narrator'}">${on ? '🔊' : '🔇'}</button>`;
  }

  function wireMute(body, shell, kind) {
    body.querySelector('[data-ww-mute]')?.addEventListener('click', (e) => {
      setVoice(!voiceOn());
      const on = !muted();
      e.currentTarget.textContent = on ? '🔊' : '🔇';
      e.currentTarget.setAttribute('aria-pressed', String(!on));
      mood(shell, kind);
    });
  }

  // ---------------- shared views ----------------

  function roleCardHtml(role, s, extra) {
    const th = themeId(s);
    const team = Core().TEAM[role];
    return `<div class="ww-card ww-card--${esc(team)}">
      <div class="ww-card-icon" aria-hidden="true">${esc(ri(role, th))}</div>
      <div class="ww-card-role">${esc(rn(role, th))}</div>
      <div class="ww-card-team">${team === 'tanner' ? 'Plays alone' : 'Team ' + esc(teamLabel(team, th))}</div>
      <div class="ww-card-tip">${esc(roleTip(role, s))}</div>
      ${extra || ''}
    </div>`;
  }

  function packHtml(wolves, me, nm, th) {
    const others = (wolves || []).filter((id) => id !== me);
    if (!others.length) return `<div class="ww-card-pack">You’re the only ${esc(rn('wolf', th))}.</div>`;
    return `<div class="ww-card-pack">The other ${esc(rp('wolf', th))}: <strong>${others.map((id) => esc(nm(id))).join(', ')}</strong></div>`;
  }

  function glossaryHtml(s) {
    const th = themeId(s);
    return `<div class="ww-glossary">${Core().ROLE_IDS.map(
      (r) => `<div class="ww-glossary-row"><span aria-hidden="true">${esc(ri(r, th))}</span><span class="ww-glossary-name">${esc(rn(r, th))}${
        Core().OPTIONAL.indexOf(r) >= 0 ? ' <em>optional</em>' : ''
      }</span><span class="ww-glossary-text">${esc(roleBlurb(r, th))}</span></div>`
    ).join('')}</div>`;
  }

  function howToCardHtml(s) {
    const th = themeId(s);
    const w = rp('wolf', th);
    return `<details class="pk-howto">
      <summary>How to play · 20 seconds</summary>
      <ol>
        <li>Everyone secretly gets a role. The ${esc(w)} know each other.</li>
        <li><strong>Night:</strong> the ${esc(w)} pick someone to take; the ${esc(rn('seer', th))} checks a player; the ${esc(rn('doctor', th))} protects one.</li>
        <li><strong>Day:</strong> hear who was taken, talk it over, then vote someone out.</li>
        <li>The ${esc(teamLabel('village', th))} wins when every one of the ${esc(w)} is out. The ${esc(w)} win when they match everyone else.</li>
      </ol>
      <div class="pk-howto-score">Role guide</div>
      ${glossaryHtml(s)}
    </details>`;
  }

  function aliveListHtml(pub, nm, opts) {
    const o = opts || {};
    return `<div class="ww-people">${pub.players
      .map((id) => {
        const alive = Core().isAlive(pub, id);
        const role = o.roles && o.roles[id];
        const noms = o.noms ? Object.keys(o.noms).filter((k) => o.noms[k] === id).length : 0;
        return `<div class="ww-person${alive ? '' : ' is-out'}${id === o.me ? ' is-me' : ''}">
          ${o.presence ? `<span class="pk-dot" data-presence="${esc(id)}"></span>` : ''}
          <span class="ww-person-name">${esc(nm(id))}${id === o.me ? ' (you)' : ''}</span>
          ${role ? `<span class="ww-person-role">${esc(ri(role, pub.theme))} ${esc(rn(role, pub.theme))}</span>` : ''}
          ${noms ? `<span class="ww-person-noms">☝ ${noms}</span>` : ''}
          ${alive ? '' : '<span class="ww-person-out">out</span>'}
        </div>`;
      })
      .join('')}</div>`;
  }

  /** Roles made public during the game (eliminations with reveal on, Hunter shots, the Tanner). */
  function publicRoles(pub) {
    const out = {};
    pub.log.forEach((e) => {
      if (e.t === 'dawn' && e.roles) Object.assign(out, e.roles);
      if ((e.t === 'vote' || e.t === 'shot') && e.role) out[e.out || e.target] = e.role;
      if (e.t === 'shot' && e.by) out[e.by] = 'hunter';
      if (e.t === 'left' && e.role) out[e.id] = e.role;
    });
    return out;
  }

  function narrationHtml(text, icon) {
    return `<div class="ww-narration" role="status"><span class="ww-narration-icon" aria-hidden="true">${esc(icon || '🌙')}</span><span>${esc(text)}</span></div>`;
  }

  function lastOf(pub, type) {
    return pub.log.filter((e) => e.t === type).slice(-1)[0] || null;
  }

  function roleRevealLine(entryRoles, pub, nm) {
    const ids = Object.keys(entryRoles || {});
    if (!ids.length) return '';
    return `<div class="ww-reveal-roles">${ids
      .map((id) => `<span>${esc(nm(id))} was the ${esc(ri(entryRoles[id], pub.theme))} ${esc(rn(entryRoles[id], pub.theme))}</span>`)
      .join('')}</div>`;
  }

  function recapHtml(result, pub, nm) {
    const th = pub.theme;
    const team = (x) => (x === 'wolves' ? rn('wolf', th) : 'not a ' + rn('wolf', th));
    const rows = result.recap.map((r) => {
      if (r.t === 'night') {
        const bits = [];
        bits.push('the ' + rp('wolf', th) + ' went for ' + (r.victim ? nm(r.victim) : 'nobody') + (r.tied ? ' (tie, picked at random)' : ''));
        if (r.doctor) bits.push(rn('doctor', th) + ' protected ' + nm(r.doctor));
        if (r.bodyguard) bits.push(rn('bodyguard', th) + ' guarded ' + nm(r.bodyguard));
        if (r.seer) bits.push(rn('seer', th) + ' checked ' + nm(r.seer.target) + ' (' + team(r.seer.team) + ')');
        if (r.witchSave) bits.push(rn('witch', th) + '’s save potion worked');
        if (r.witchKill) bits.push(rn('witch', th) + ' used the sleep potion on ' + nm(r.witchKill));
        const end = r.taken.length ? r.taken.map(nm).join(' & ') + ' out' : 'nobody out';
        return `<li class="ww-recap-night"><strong>Night ${r.night}</strong> — ${esc(bits.join('; '))} → ${esc(end)}</li>`;
      }
      if (r.t === 'day') return `<li class="ww-recap-day"><strong>Day ${r.day}</strong> — ${esc(r.out ? nm(r.out) + ' voted out' : r.tie ? 'tie twice — nobody out' : 'nobody voted out')}</li>`;
      if (r.t === 'shot') return `<li class="ww-recap-day">${esc(rn('hunter', th))} ${esc(nm(r.by))} ${esc(r.target ? 'took ' + nm(r.target) + ' down' : 'held fire')}</li>`;
      if (r.t === 'left') return `<li class="ww-recap-day">${esc(nm(r.id))} left the game</li>`;
      return '';
    });
    return `<ol class="ww-recap">${rows.join('')}</ol>`;
  }

  function winTitle(result, pub, nm) {
    return narrate({ t: 'win', winner: result.winner, tanner: result.tanner }, pub.theme, nm);
  }

  function winIcon(result, th) {
    return result.winner === 'wolves' ? ri('wolf', th) : result.winner === 'tanner' ? ri('tanner', th) : '🌅';
  }

  function overHtml(pub, nm, me) {
    const res = pub.result;
    const th = pub.theme;
    const order = pub.players.slice().sort((a, b) => {
      const ta = Core().TEAM[res.roles[a]] === res.winner || (res.winner === 'tanner' && a === res.tanner) ? 0 : 1;
      const tb = Core().TEAM[res.roles[b]] === res.winner || (res.winner === 'tanner' && b === res.tanner) ? 0 : 1;
      return ta - tb;
    });
    const sus = (res.suspicion || []).slice(0, 3);
    return `<div class="ww-over">
      <div class="pk-result-glyph" aria-hidden="true">${esc(winIcon(res, th))}</div>
      <div class="pk-result-title">${esc(winTitle(res, pub, nm))}</div>
      <div class="pk-sub">${res.nights} night${res.nights === 1 ? '' : 's'}</div>
      <div class="pk-section">Who was who</div>
      <div class="ww-roles">${order
        .map((id) => {
          const role = res.roles[id];
          const won = res.winner === 'tanner' ? id === res.tanner : Core().TEAM[role] === res.winner;
          return `<div class="ww-roles-row${won ? ' is-won' : ''}${Core().isAlive(pub, id) ? '' : ' is-out'}">
            <span aria-hidden="true">${esc(ri(role, th))}</span>
            <span class="ww-roles-name">${esc(nm(id))}${id === me ? ' (you)' : ''}</span>
            <span class="ww-roles-role">${esc(rn(role, th))}</span>
            ${won ? '<span class="ww-roles-won">won</span>' : ''}
          </div>`;
        })
        .join('')}</div>
      ${
        sus.length
          ? `<div class="pk-section">Most suspected</div><div class="ww-suspects">${sus
              .map((x) => `<div class="ww-suspect"><span>${esc(nm(x.id))}</span><span>${x.n} ☝</span><span>${esc(ri(x.role, th))} ${esc(rn(x.role, th))}</span></div>`)
              .join('')}</div><div class="pk-field-help">Village suspicion from the night-time “who do you suspect?” picks.</div>`
          : ''
      }
      <details class="ww-recap-wrap" open>
        <summary>Night-by-night recap</summary>
        ${recapHtml(res, pub, nm)}
      </details>
    </div>`;
  }

  function shareOver(pub, nm) {
    const res = pub.result;
    Kit().shareLine(GAME, LABEL, winTitle(res, pub, nm) + ' ' + winIcon(res, pub.theme) + ' (' + res.nights + ' night' + (res.nights === 1 ? '' : 's') + ')');
  }

  /** Night pick face shared by Pass & Play and Room. Returns the HTML; wireNightFace adds taps. */
  function nightFaceHtml(step, s, nm, extras) {
    const th = themeId(s);
    const w = step.witch;
    let potions = '';
    if (step.role === 'witch') {
      const victimLine = w.victim
        ? 'The ' + rp('wolf', th) + ' chose <strong>' + esc(nm(w.victim)) + '</strong>.'
        : 'You don’t know who the ' + esc(rp('wolf', th)) + ' chose yet.';
      potions = `<div class="ww-potions">
        ${w.save ? `<div class="ww-potion-note">${victimLine}</div><button type="button" class="pk-chip ww-potion" data-save aria-pressed="false">🧪 Use the save potion${w.victim ? ' on ' + esc(nm(w.victim)) : ' on whoever is attacked'}</button>` : '<div class="ww-potion-note">Save potion used.</div>'}
      </div>`;
    }
    return `<div class="ww-night-face">
      <div class="ww-night-role">${esc(ri(step.role, th))} ${esc(rn(step.role, th))}</div>
      <div class="ww-night-prompt">${esc(step.prompt)}</div>
      ${extras || ''}
      ${potions}
      <div data-night-picker></div>
      ${step.optional ? '<button type="button" class="pk-chip ww-none" data-none aria-pressed="false">No one tonight</button>' : ''}
    </div>`;
  }

  /** onChange({ target, save, ready }) */
  function wireNightFace(face, step, nm, onChange, initial) {
    const sel = Object.assign({ target: null, save: false, none: false }, initial || {});
    const emit = () => onChange({ target: sel.target, save: sel.save, ready: !!sel.target || sel.none || sel.save });
    const saveBtn = face.querySelector('[data-save]');
    const noneBtn = face.querySelector('[data-none]');
    let picker = null;
    const mount = () => {
      picker = Kit().mountPicker(face.querySelector('[data-night-picker]'), {
        players: step.candidates.map((id) => ({ id, name: nm(id) })),
        selected: sel.target ? [sel.target] : [],
        onPick: (ids) => {
          sel.target = ids[0] || null;
          sel.none = false;
          if (noneBtn) noneBtn.setAttribute('aria-pressed', 'false');
          emit();
        },
      });
    };
    mount();
    saveBtn?.addEventListener('click', () => {
      sel.save = !sel.save;
      saveBtn.setAttribute('aria-pressed', String(sel.save));
      saveBtn.classList.toggle('is-on', sel.save);
      emit();
    });
    noneBtn?.addEventListener('click', () => {
      sel.none = true;
      sel.target = null;
      noneBtn.setAttribute('aria-pressed', 'true');
      mount();
      emit();
    });
    if (initial) {
      if (sel.save && saveBtn) {
        saveBtn.setAttribute('aria-pressed', 'true');
        saveBtn.classList.add('is-on');
      }
      emit();
    }
    return { get: () => sel, picker };
  }

  // ---------------- entry ----------------

  function open(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit()) {
      if (typeof showToast === 'function') showToast(LABEL + ' is still loading — try again');
      return;
    }
    if ((c.source === 'chat_group' || c.isGroup) && c.chat) {
      startRoom({ chat: c.chat });
      return;
    }
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: 'Party', confirmLeave: () => !!shell.wwPlaying, leaveBody: 'This game will end for everyone on this phone.' });
    renderHome(shell);
  }

  function renderHome(shell) {
    const s = loadSettings();
    shell.wwPlaying = false;
    mood(shell, null);
    const body = shell.render(
      Kit().homeHtml({
        game: GAME,
        icon: '🐺',
        title: 'Who are the ' + rp('wolf', s) + '?',
        sub: '5–20 players · best with 7+ · secret roles, night and day',
        howToHtml: howToCardHtml(s),
        passSub: 'One phone, 5–16 players',
        roomSub: 'Everyone on their own phone, 5–20',
      })
    );
    body.querySelector('[data-mode="pass"]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-mode="room"]').addEventListener('click', () => Kit().closeThen(shell, () => startRoom({})));
    body.querySelector('[data-mode="join"]').addEventListener('click', () =>
      Kit().closeThen(shell, () => Kit().openJoinSheet((code) => openRoom(code, { join: true })))
    );
  }

  // ======================= PASS & PLAY =======================

  function renderPassSetup(shell) {
    const settings = loadSettings();
    shell.wwPlaying = false;
    mood(shell, null);
    const body = shell.render(`<div class="pk-page">
      <div class="pk-setup-head">
        <div class="pk-title">Who’s playing?</div>
        <button type="button" class="pk-icon-btn" data-settings aria-label="Game settings">⚙︎</button>
      </div>
      <div class="pk-sub">Best with 7+ players.</div>
      <div data-editor></div>
      <div data-meta></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start>Start</button>
    </div>`);
    const editor = Kit().mountPlayerEditor(body.querySelector('[data-editor]'), {
      names: loadNames(),
      min: Core().MIN_PLAYERS,
      max: Core().MAX_PASS,
      onChange: () => paintMeta(),
    });
    const paintMeta = () => {
      const meta = body.querySelector('[data-meta]');
      if (meta) meta.innerHTML = balanceHtml(editor.count(), settings, { bestShown: true });
    };
    paintMeta();
    body.querySelector('[data-settings]').addEventListener('click', () =>
      openSettings(settings, {
        count: () => editor.count(),
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
        settings: Core().mergeSettings(settings),
      };
      startPassGame(shell, session);
    });
  }

  function nameOf(session, id) {
    const p = session.players.find((x) => x.id === id);
    return p ? p.name : 'Someone';
  }

  function startPassGame(shell, session) {
    const g = Core().createGame(
      session.players.map((p) => p.id),
      session.settings
    );
    session.g = g;
    session.settings = g.settings;
    shell.wwPlaying = true;
    shell.setSubtitle(Core().theme(g.settings).label);
    renderPassDeal(shell, session, 0);
  }

  function passAct(session, action) {
    const g = session.g;
    const out = Core().applyAction(g.pub, g.hidden, g.settings, action);
    return out.error ? null : out;
  }

  /** Forward-only role handout. */
  function renderPassDeal(shell, session, index) {
    const g = session.g;
    const order = g.pub.players;
    mood(shell, 'night');
    if (index >= order.length) {
      g.secrets = null;
      passAct(session, { type: 'begin' });
      renderPassNightIntro(shell, session);
      return;
    }
    const id = order[index];
    const secret = g.secrets[id];
    const nm = (x) => nameOf(session, x);
    const body = shell.render(`<div class="pk-page">
      <div class="pk-progress">Role ${index + 1} of ${order.length}</div>
      <div data-cover></div>
    </div>`);
    Kit().mountPassCover(body.querySelector('[data-cover]'), {
      name: nm(id),
      revealHtml: () => roleCardHtml(secret.role, session.settings, secret.role === 'wolf' ? packHtml(secret.wolves, id, nm, session.settings) : ''),
      doneLabel: index === order.length - 1 ? 'Hide & start' : 'Hide & pass',
      onDone: () => renderPassDeal(shell, session, index + 1),
    });
  }

  function renderPassNightIntro(shell, session) {
    const pub = session.g.pub;
    const line = narrate({ t: 'night' }, pub.theme);
    mood(shell, 'night');
    sfx('ui.turn');
    const body = shell.render(`<div class="pk-page ww-stage">
      <div class="ww-top"><div class="pk-progress">Night ${pub.night}</div>${muteBtnHtml()}</div>
      ${narrationHtml(line, '🌙')}
      <div class="pk-sub">Everyone takes a turn with the phone — every role has something to tap, so nobody can tell who’s who.</div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>Start the night</button>
    </div>`);
    wireMute(body, shell, 'night');
    say(line);
    body.querySelector('[data-go]').addEventListener('click', () => {
      hush();
      renderPassNight(shell, session, 0);
    });
  }

  // ---- pass night
  /** One night turn per living player, same shape for every role: open → pick → confirm → hold → Hide & pass. */
  function renderPassNight(shell, session, idx) {
    const g = session.g;
    const order = session.nightOrder && idx > 0 ? session.nightOrder : (session.nightOrder = g.pub.alive.slice());
    if (idx >= order.length || g.pub.phase !== 'night') {
      if (g.pub.phase === 'night') passAct(session, { type: 'closeNight' });
      session.nightOrder = null;
      renderPassDawn(shell, session);
      return;
    }
    const id = order[idx];
    const nm = (x) => nameOf(session, x);
    const step = Core().nightStep(g.pub, g.hidden, g.settings, id);
    const pack = step.role === 'wolf' ? packVotesHtml(step.pack, id, nm, session.settings) : '';
    let choice = { target: null, save: false };
    const body = shell.render(`<div class="pk-page">
      <div class="pk-progress">Night ${g.pub.night} · ${idx + 1} of ${order.length}</div>
      <div data-cover></div>
    </div>`);
    Kit().mountPassVote(body.querySelector('[data-cover]'), {
      name: nm(id),
      bodyHtml: nightFaceHtml(step, session.settings, nm, pack),
      doneLabel: 'Confirm',
      coverTitle: 'Your night turn',
      coverIcon: '🌙',
      onMount: (face, setReady) => {
        setReady(false);
        wireNightFace(face, step, nm, (c) => {
          choice = c;
          setReady(c.ready);
        });
      },
      onDone: () => {
        const out = passAct(session, { type: 'night', id, target: choice.target, save: choice.save });
        renderPassNightHold(shell, session, idx, id, step, out);
      },
    });
  }

  function packVotesHtml(pack, me, nm, s) {
    const ids = Object.keys(pack || {}).filter((x) => x !== me);
    if (!ids.length) return '';
    return `<div class="ww-pack">${ids.map((x) => `<span>${esc(nm(x))} → ${esc(nm(pack[x]))}</span>`).join('')}</div>`;
  }

  /** Same hold for every role (NIGHT_HOLD_MS) so timing never gives a role away. */
  function renderPassNightHold(shell, session, idx, id, step, out) {
    const nm = (x) => nameOf(session, x);
    const th = themeId(session.settings);
    let msg = 'Your choice is locked in.';
    const check = step.role === 'seer' && out && out.result ? session.g.hidden.seerLog.slice(-1)[0] : null;
    if (check) msg = nm(check.target) + (check.team === 'wolves' ? ' is one of the ' + rp('wolf', th) + '!' : ' is not one of the ' + rp('wolf', th) + '.');
    const body = shell.render(`<div class="pk-page">
      <div class="pk-progress">Night ${session.g.pub.night || ''}</div>
      <div class="pk-card is-revealed ww-hold"><div class="pk-card-face">
        <div class="ww-hold-icon" aria-hidden="true">${step.role === 'seer' ? '🔮' : '✓'}</div>
        <div class="ww-hold-msg" data-hold-msg>${esc(msg)}</div>
      </div></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-pass disabled>Hide & pass</button>
    </div>`);
    const btn = body.querySelector('[data-pass]');
    const stopAway = Kit().coverWhenAway(body, () => {
      const m = body.querySelector('[data-hold-msg]');
      if (m) m.textContent = '';
    });
    setTimeout(() => {
      if (btn.isConnected) btn.disabled = false;
    }, NIGHT_HOLD_MS);
    btn.addEventListener('click', () => {
      stopAway();
      renderPassNight(shell, session, idx + 1);
    });
  }

  // ---- pass dawn
  function renderPassDawn(shell, session) {
    const pub = session.g.pub;
    const nm = (x) => nameOf(session, x);
    const entry = lastOf(pub, 'dawn');
    const line = narrate(entry, pub.theme, nm);
    mood(shell, 'day');
    sfx(entry && entry.taken.length ? 'ui.lose' : 'ui.check');
    const body = shell.render(`<div class="pk-page ww-stage">
      <div class="ww-top"><div class="pk-progress">Morning ${entry ? entry.n : ''}</div>${muteBtnHtml()}</div>
      ${narrationHtml(line, '🌅')}
      ${roleRevealLine(entry && entry.roles, pub, nm)}
      ${aliveListHtml(pub, nm, { roles: publicRoles(pub) })}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>Continue</button>
    </div>`);
    wireMute(body, shell, 'day');
    say(line);
    body.querySelector('[data-go]').addEventListener('click', () => {
      hush();
      passAct(session, { type: 'continue' });
      passRoute(shell, session);
    });
  }

  function passRoute(shell, session) {
    const p = session.g.pub.phase;
    if (p === 'over') renderPassOver(shell, session);
    else if (p === 'hunter') renderPassHunter(shell, session);
    else if (p === 'day') renderPassDay(shell, session);
    else if (p === 'vote') renderPassVote(shell, session);
    else if (p === 'verdict') renderPassVerdict(shell, session);
    else if (p === 'dawn') renderPassDawn(shell, session);
    else renderPassNightIntro(shell, session);
  }

  function renderPassHunter(shell, session) {
    const pub = session.g.pub;
    const nm = (x) => nameOf(session, x);
    const th = pub.theme;
    const by = pub.hunter;
    const body = shell.render(`<div class="pk-page ww-stage">
      <div class="ww-top"><div class="pk-progress">${esc(ri('hunter', th))} ${esc(rn('hunter', th))}</div>${muteBtnHtml()}</div>
      ${narrationHtml(nm(by) + ' was the ' + rn('hunter', th) + ' — and gets one last shot.', ri('hunter', th))}
      <div class="pk-sub">${esc(nm(by))}, tap who you take with you.</div>
      <div data-picker></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-shoot disabled>Pick someone</button>
      <button type="button" class="pk-link" data-hold>Hold fire</button>
    </div>`);
    wireMute(body, shell, 'day');
    say(nm(by) + ' was the ' + rn('hunter', th) + ' — and gets one last shot.');
    let target = null;
    const btn = body.querySelector('[data-shoot]');
    Kit().mountPicker(body.querySelector('[data-picker]'), {
      players: pub.alive.map((id) => ({ id, name: nm(id) })),
      onPick: (ids) => {
        target = ids[0];
        btn.disabled = !target;
        btn.textContent = 'Take ' + nm(target);
      },
    });
    const shoot = async (t) => {
      passAct(session, { type: 'shoot', target: t });
      const e = lastOf(session.g.pub, 'shot');
      const line = narrate(e, th, nm);
      sfx(t ? 'ui.capture' : 'ui.check');
      say(line);
      await Kit().bigReveal({ icon: ri('hunter', th), title: line, sub: e.role ? nm(e.target) + ' was the ' + rn(e.role, th) : '', ms: 3200, host: shell.el });
      passRoute(shell, session);
    };
    btn.addEventListener('click', () => target && shoot(target));
    body.querySelector('[data-hold]').addEventListener('click', () => shoot(null));
  }

  function renderPassDay(shell, session) {
    const pub = session.g.pub;
    const nm = (x) => nameOf(session, x);
    const line = narrate({ t: 'day' }, pub.theme, nm);
    mood(shell, 'day');
    let endsAt = Date.now() + session.settings.discussSec * 1000;
    let pausedLeft = null;
    const body = shell.render(`<div class="pk-page ww-stage">
      <div class="ww-top"><div class="pk-progress">Day ${pub.day}</div>${muteBtnHtml()}</div>
      ${narrationHtml(line, '☀️')}
      <div class="pk-timer" data-timer></div>
      <div class="pk-row">
        <button type="button" class="pk-chip" data-pause>Pause</button>
        <button type="button" class="pk-chip" data-extend>+1 min</button>
      </div>
      ${aliveListHtml(pub, nm, { roles: publicRoles(pub) })}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-vote>Start the vote</button>
    </div>`);
    wireMute(body, shell, 'day');
    say(line);
    Kit().countdown(body.querySelector('[data-timer]'), {
      getEndsAt: () => endsAt,
      getPausedMs: () => pausedLeft,
      onDone: () => {
        Kit().buzz();
        say(tr('line.timeUp', 'Time’s up — time to vote.'));
      },
    });
    body.querySelector('[data-pause]').addEventListener('click', (e) => {
      if (pausedLeft == null) {
        pausedLeft = Math.max(0, endsAt - Date.now());
        e.currentTarget.textContent = 'Resume';
      } else {
        endsAt = Date.now() + pausedLeft;
        pausedLeft = null;
        e.currentTarget.textContent = 'Pause';
      }
    });
    body.querySelector('[data-extend]').addEventListener('click', () => {
      if (pausedLeft != null) pausedLeft += 60000;
      else endsAt = Math.max(endsAt, Date.now()) + 60000;
    });
    body.querySelector('[data-vote]').addEventListener('click', () => {
      hush();
      passAct(session, { type: 'startVote' });
      renderPassVote(shell, session);
    });
  }

  function renderPassVote(shell, session) {
    const pub = session.g.pub;
    const nm = (x) => nameOf(session, x);
    const tie = pub.revote ? lastOf(pub, 'tie') : null;
    if (session.settings.voteStyle === 'secret') return renderPassSecretVote(shell, session, 0);
    const tieLine = tie ? narrate(tie, pub.theme, nm) : '';
    const body = shell.render(`<div class="pk-page ww-stage">
      <div class="ww-top"><div class="pk-progress">Day ${pub.day} · vote${pub.revote ? ' again' : ''}</div>${muteBtnHtml()}</div>
      ${tie ? narrationHtml(tieLine, '⚖️') : ''}
      <div class="pk-title">Count to three — and point!</div>
      <div class="pk-sub">Tap whoever got the most fingers. Tap two or more for a tie.</div>
      <div data-picker></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>Nobody is out</button>
    </div>`);
    wireMute(body, shell, 'day');
    say(tie ? tieLine : tr('line.point', 'Count to three, and point!'));
    let picked = [];
    const btn = body.querySelector('[data-go]');
    Kit().mountPicker(body.querySelector('[data-picker]'), {
      players: pub.candidates.map((id) => ({ id, name: nm(id) })),
      multi: true,
      onPick: (ids) => {
        picked = ids;
        btn.textContent = !ids.length ? 'Nobody is out' : ids.length === 1 ? nm(ids[0]) + ' is out' : 'It’s a tie' + (pub.revote ? ' — nobody is out' : ' — vote again');
      },
    });
    btn.addEventListener('click', () => {
      passAct(session, picked.length > 1 ? { type: 'quickVote', tied: picked } : { type: 'quickVote', out: picked[0] || null });
      passRoute(shell, session);
    });
  }

  function renderPassSecretVote(shell, session, idx) {
    const pub = session.g.pub;
    const nm = (x) => nameOf(session, x);
    const order = idx > 0 && session.voteOrder ? session.voteOrder : (session.voteOrder = pub.alive.slice());
    if (pub.phase !== 'vote' || idx >= order.length) {
      session.voteOrder = null;
      if (pub.phase === 'vote' && pub.voted.length < pub.alive.length) passAct(session, { type: 'closeVote' });
      if (session.g.pub.phase === 'vote') {
        const tie = lastOf(session.g.pub, 'tie');
        const line = narrate(tie, pub.theme, nm);
        say(line);
        Kit().bigReveal({ icon: '⚖️', title: line, ms: 3000, host: shell.el }).then(() => renderPassSecretVote(shell, session, 0));
        return;
      }
      passRoute(shell, session);
      return;
    }
    const id = order[idx];
    let choice = null;
    const body = shell.render(`<div class="pk-page">
      <div class="pk-progress">Secret vote · ${idx + 1} of ${order.length}</div>
      <div data-cover></div>
    </div>`);
    Kit().mountPassVote(body.querySelector('[data-cover]'), {
      name: nm(id),
      bodyHtml: `<div class="pk-title">Who should be out?</div><div data-picker></div><button type="button" class="pk-chip ww-none" data-skip>No one</button>`,
      onMount: (face, setReady) => {
        const skip = face.querySelector('[data-skip]');
        const mount = () =>
          Kit().mountPicker(face.querySelector('[data-picker]'), {
            players: pub.candidates.filter((x) => x !== id).map((x) => ({ id: x, name: nm(x) })),
            onPick: (ids) => {
              choice = ids[0];
              skip.setAttribute('aria-pressed', 'false');
              setReady(!!choice);
            },
          });
        mount();
        skip.addEventListener('click', () => {
          choice = 'skip';
          skip.setAttribute('aria-pressed', 'true');
          mount();
          setReady(true);
        });
      },
      onDone: () => {
        passAct(session, { type: 'vote', id, target: choice });
        renderPassSecretVote(shell, session, idx + 1);
      },
    });
  }

  function renderPassVerdict(shell, session) {
    const pub = session.g.pub;
    const nm = (x) => nameOf(session, x);
    const e = lastOf(pub, 'vote');
    const line = narrate(e, pub.theme, nm);
    sfx(e && e.out ? 'ui.lose' : 'ui.check');
    const body = shell.render(`<div class="pk-page ww-stage">
      <div class="ww-top"><div class="pk-progress">Day ${pub.day}</div>${muteBtnHtml()}</div>
      ${narrationHtml(line, e && e.out ? '⚖️' : '🤝')}
      ${e && e.out && e.role ? roleRevealLine({ [e.out]: e.role }, pub, nm) : ''}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>Continue</button>
    </div>`);
    wireMute(body, shell, 'day');
    say(line + (e && e.out && e.role ? ' ' + nm(e.out) + ' was the ' + rn(e.role, pub.theme) + '.' : ''));
    body.querySelector('[data-go]').addEventListener('click', () => {
      hush();
      passAct(session, { type: 'continue' });
      passRoute(shell, session);
    });
  }

  function renderPassOver(shell, session) {
    const pub = session.g.pub;
    const nm = (x) => nameOf(session, x);
    shell.wwPlaying = false;
    mood(shell, 'day');
    const line = winTitle(pub.result, pub, nm);
    sfx('ui.win');
    say(line);
    shell.setSubtitle('Game over');
    const body = shell.render(`<div class="pk-page">
      <div class="ww-top">${muteBtnHtml()}</div>
      ${overHtml(pub, nm)}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>Play again</button>
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share>Share</button>
        <button type="button" class="pk-btn pk-btn--ghost" data-setup>Players &amp; settings</button>
      </div>
    </div>`);
    wireMute(body, shell, 'day');
    try {
      if (typeof gameFeedback === 'function') gameFeedback('win');
    } catch (e) {}
    body.querySelector('[data-share]').addEventListener('click', () => shareOver(pub, nm));
    body.querySelector('[data-setup]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-again]').addEventListener('click', () => startPassGame(shell, session));
  }

  // ======================= ROOM =======================

  function startRoom(o) {
    Kit().createRoom({ game: GAME, label: LABEL, settings: loadSettings(), chat: o && o.chat, open: openRoom });
  }

  function openRoom(code, opts) {
    const o = opts || {};
    return Kit().openRoomScreen({
      game: GAME,
      label: LABEL,
      code,
      join: !!o.join,
      min: Core().MIN_PLAYERS,
      max: Core().MAX_ROOM,
      hydrate: (st) => Core().hydrateState(st),
      lobbySummary: (ctrl) => summaryLine(ctrl.view.pub.settings),
      openSettings: (ctrl) =>
        openSettings(Core().mergeSettings(ctrl.view.pub.settings), {
          room: true,
          count: () => ctrl.players().length,
          onSave: (next) => {
            saveSettings(next);
            ctrl.act('settings', { settings: next });
          },
        }),
      canStart: (ctrl, players) =>
        players.length < Core().MIN_PLAYERS
          ? { ok: false, label: 'Need ' + (Core().MIN_PLAYERS - players.length) + ' more to start' }
          : { ok: true, label: 'Start · ' + rolesLine(players.length, ctrl.view.pub.settings) },
      onLobbyMount: (ctrl, body) => {
        const n = ctrl.players().length;
        const hint = document.createElement('div');
        hint.innerHTML = balanceHtml(n, ctrl.view.pub.settings);
        body.querySelector('[data-settings]')?.after(hint.firstElementChild);
      },
      onState: onRoomState,
      holdKey: (ctrl, st) => {
        const pub = ctrl.view.pub;
        const sec = mySecret(ctrl);
        return st.phase === 'reveal' && sec && st.players.indexOf(ctrl.uid) >= 0 && !(pub.seen && pub.seen[ctrl.uid]) ? 'reveal:' + pub.roundNo : null;
      },
      renderPhase: renderRoomPhase,
      renderPending: renderRoomSpectator,
      errorText: (e) => {
        const code = String((e && e.code) || '').toUpperCase();
        if (['NOT_ALLOWED', 'BLOCKED', 'SLOW_DOWN', 'MAX_EXTENDS', 'EMPTY', 'ALREADY_CHECKED', 'NOT_HUNTER', 'PHASE'].indexOf(code) >= 0 && e.message) return e.message;
        return Kit().roomErrorText(e);
      },
    });
  }

  function mySecret(ctrl) {
    const pub = ctrl.view.pub;
    const sec = ctrl.view.secret;
    return sec && Number(sec.roundNo) === Number(pub.roundNo) ? sec : null;
  }

  /** Narrator + sounds follow the public log on every phone. */
  function onRoomState(ctrl, st, prev) {
    const shell = ctrl.shell;
    mood(shell, st.phase === 'night' || st.phase === 'reveal' ? 'night' : 'day');
    if (!prev || prev.players.join() !== st.players.join()) return;
    const fresh = st.log.slice(prev.log.length);
    if (!fresh.length) return;
    const text = fresh
      .map((e) => narrate(e, st.theme, ctrl.name))
      .filter(Boolean)
      .join(' ');
    const last = fresh[fresh.length - 1];
    if (last.t === 'dawn') sfx(last.taken.length ? 'ui.lose' : 'ui.check');
    else if (last.t === 'night') sfx('ui.turn');
    else if (last.t === 'vote') sfx(last.out ? 'ui.lose' : 'ui.check');
    else if (last.t === 'win') sfx('ui.win');
    say(text);
  }

  function chatBox(ctrl, channel, messages, opts) {
    return Kit().chatHtml(Object.assign({ channel, messages: messages || [], name: ctrl.name, me: ctrl.uid }, opts || {}));
  }

  function wireRoomChat(ctrl, body) {
    Kit().wireChat(body, async (channel, text) => !!(await ctrl.act('chat', { channel, text })));
  }

  function spectatorPanel(ctrl, st, sec) {
    const sp = sec.spectator;
    const th = st.theme;
    const acts = Object.keys(sp.acts || {});
    return `<div class="ww-spectator">
      <div class="pk-section">You’re out — watching</div>
      ${aliveListHtml(st, ctrl.name, { roles: sp.roles, me: ctrl.uid })}
      ${
        st.phase === 'night'
          ? `<div class="ww-spec-acts">${
              acts.length
                ? acts
                    .map((id) => `<div>${esc(ctrl.name(id))} (${esc(rn(sp.roles[id], th))}) → ${sp.acts[id].target ? esc(ctrl.name(sp.acts[id].target)) : 'no one'}</div>`)
                    .join('')
                : '<div>Nobody has acted yet.</div>'
            }</div>`
          : ''
      }
      ${sp.wolfChat && sp.wolfChat.length ? chatBox(ctrl, 'wolfview', sp.wolfChat, { title: rp('wolf', th) + '’ chat', disabled: 'Read only' }) : ''}
      ${chatBox(ctrl, 'dead', sec.deadChat, { title: 'Spectators’ chat', placeholder: 'Chat with the others who are out' })}
    </div>`;
  }

  function renderRoomSpectator(ctrl, st) {
    mood(ctrl.shell, st.phase === 'night' || st.phase === 'reveal' ? 'night' : 'day');
    const last = st.log.slice(-1)[0];
    const body = ctrl.render(`<div class="pk-page ww-stage">
      <div class="ww-top"><div class="pk-progress">Game in progress · ${esc(st.phase === 'night' ? 'Night ' + st.night : 'Day ' + (st.day || 1))}</div>${muteBtnHtml()}</div>
      <div class="pk-sub">You’ll be dealt in when the next game starts. Until then you can watch.</div>
      ${last ? narrationHtml(narrate(last, st.theme, ctrl.name), st.phase === 'night' ? '🌙' : '☀️') : ''}
      ${aliveListHtml(st, ctrl.name, { roles: publicRoles(st), presence: true })}
      ${st.chat && st.chat.length ? chatBox(ctrl, 'dayview', st.chat, { title: 'Village chat', disabled: 'Watching' }) : ''}
      <button type="button" class="pk-link" data-leave>Leave room</button>
    </div>`);
    wireMute(body, ctrl.shell, st.phase === 'night' ? 'night' : 'day');
    body.querySelector('[data-leave]').addEventListener('click', ctrl.leave);
  }

  function renderRoomPhase(ctrl, st) {
    const K = Kit();
    const me = ctrl.uid;
    const pub = ctrl.view.pub;
    const nm = ctrl.name;
    const settings = Core().mergeSettings(pub.settings);
    const sec = mySecret(ctrl);
    const th = st.theme;
    const inGame = st.players.indexOf(me) >= 0;
    if (!inGame || !sec) return renderRoomSpectator(ctrl, st);
    const alive = Core().isAlive(st, me);
    const kind = st.phase === 'night' || st.phase === 'reveal' ? 'night' : 'day';
    mood(ctrl.shell, kind);
    ctrl.shell.setSubtitle('Room ' + ctrl.view.code + ' · ' + (st.phase === 'night' || st.phase === 'reveal' ? 'Night ' + Math.max(1, st.night) : 'Day ' + st.day));
    const peek = alive && st.phase !== 'over' ? '<button type="button" class="pk-peek" data-peek aria-label="Hold to peek at your role">👁 Hold to peek at your role</button>' : '';
    const wirePeek = (body) =>
      K.mountHoldPeek(body.querySelector('[data-peek]'), () => roleCardHtml(sec.role, settings, sec.role === 'wolf' ? packHtml(sec.wolves, me, nm, settings) : ''));
    const timed = st.phase !== 'over';
    const top = `<div class="ww-top"><div class="pk-timer" data-timer></div>${muteBtnHtml()}</div>${ctrl.hostBar(timed)}${ctrl.pausedNote()}`;
    const finish = (body) => {
      ctrl.wire(body);
      wirePeek(body);
      wireMute(body, ctrl.shell, kind);
      wireRoomChat(ctrl, body);
      body.querySelector('[data-advance]')?.addEventListener('click', () => ctrl.act('advance'));
    };
    const deadBlock = !alive && st.phase !== 'over' && sec.spectator ? spectatorPanel(ctrl, st, sec) : '';

    if (st.phase === 'reveal') {
      const ready = st.players.filter((id) => pub.seen && pub.seen[id]).length;
      if (!(pub.seen && pub.seen[me])) {
        const body = ctrl.render(`<div class="pk-page">
          <div class="pk-progress">${ready}/${st.players.length} ready</div>
          <div data-cover></div>
        </div>`);
        K.mountPassCover(body.querySelector('[data-cover]'), {
          lead: 'Your role',
          name: nm(me),
          revealHtml: () => roleCardHtml(sec.role, settings, sec.role === 'wolf' ? packHtml(sec.wolves, me, nm, settings) : ''),
          doneLabel: 'I’ve seen it',
          onDone: () => ctrl.act('seen'),
        });
        return;
      }
      const body = ctrl.render(`<div class="pk-page ww-stage">${top}
        <div class="pk-title">Waiting for everyone to see their role</div>
        <div class="pk-sub">${ready}/${st.players.length} ready</div>
        ${peek}
      </div>`);
      finish(body);
      return;
    }

    if (st.phase === 'night') {
      const status = `<div class="pk-sub">${st.actedN}/${st.alive.length} done</div>`;
      if (!alive) {
        const body = ctrl.render(`<div class="pk-page ww-stage">${top}
          ${narrationHtml(narrate({ t: 'night' }, th), '🌙')}${status}${deadBlock}</div>`);
        finish(body);
        return;
      }
      const step = sec.step;
      const wolfBits =
        sec.role === 'wolf'
          ? `${packVotesHtml(sec.pack, me, nm, settings)}${chatBox(ctrl, 'wolf', sec.wolfChat, { title: rp('wolf', th) + ' only', placeholder: 'Whisper to the pack…' })}`
          : '';
      const seerBits =
        sec.role === 'seer' && sec.seerLog && sec.seerLog.length
          ? `<div class="ww-seerlog">${sec.seerLog
              .map((x) => `<div>Night ${x.night}: ${esc(nm(x.target))} — ${x.team === 'wolves' ? esc(rn('wolf', th)) + ' 🐾' : 'not a ' + esc(rn('wolf', th))}</div>`)
              .join('')}</div>`
          : '';
      if (sec.myNight || !step) {
        const body = ctrl.render(`<div class="pk-page ww-stage">${top}
          ${narrationHtml(narrate({ t: 'night' }, th), '🌙')}
          <div class="ww-locked">✓ ${sec.myNight && sec.myNight.target ? 'You chose ' + esc(nm(sec.myNight.target)) : 'Locked in'}${sec.myNight && sec.myNight.save ? ' · save potion ready' : ''}</div>
          ${seerBits}${status}${wolfBits}${peek}
        </div>`);
        finish(body);
        if (sec.role === 'wolf' && sec.myNight && step) wireRePick(ctrl, body, step);
        return;
      }
      const draft = ctrl.view.wwDraft && ctrl.view.wwDraft.night === st.night ? ctrl.view.wwDraft : (ctrl.view.wwDraft = { night: st.night, target: null, save: false });
      const body = ctrl.render(`<div class="pk-page ww-stage">${top}
        ${nightFaceHtml(step, settings, nm, '')}
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-confirm disabled>Confirm</button>
        <div class="pk-error" data-err></div>
        ${seerBits}${status}${wolfBits}${peek}
      </div>`);
      finish(body);
      const btn = body.querySelector('[data-confirm]');
      wireNightFace(
        body,
        step,
        nm,
        (c) => {
          draft.target = c.target;
          draft.save = c.save;
          btn.disabled = !c.ready;
        },
        draft.target || draft.save ? draft : null
      );
      btn.addEventListener('click', async () => {
        const out = await ctrl.act('night', { target: draft.target, save: draft.save }, body.querySelector('[data-err]'));
        if (out && out.team) {
          const w = out.team === 'wolves';
          K.bigReveal({ icon: '🔮', title: nm(draft.target) + (w ? ' is one of the ' + rp('wolf', th) + '!' : ' is not one of the ' + rp('wolf', th)), ms: 3000, host: ctrl.shell.el });
        }
      });
      return;
    }

    if (st.phase === 'dawn' || st.phase === 'verdict') {
      const e = lastOf(st, st.phase === 'dawn' ? 'dawn' : 'vote');
      const roles = st.phase === 'dawn' ? e && e.roles : e && e.out && e.role ? { [e.out]: e.role } : null;
      const body = ctrl.render(`<div class="pk-page ww-stage">${top}
        ${narrationHtml(narrate(e, th, nm), st.phase === 'dawn' ? '🌅' : '⚖️')}
        ${roleRevealLine(roles, st, nm)}
        ${aliveListHtml(st, nm, { roles: publicRoles(st), me, presence: true })}
        ${ctrl.isHost() ? '<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-advance>Continue</button>' : '<div class="pk-wait">Carrying on in a moment…</div>'}
        ${alive ? chatBox(ctrl, 'day', st.chat, { title: 'Village chat' }) : ''}
        ${deadBlock}${peek}
      </div>`);
      finish(body);
      return;
    }

    if (st.phase === 'hunter') {
      const mine = st.hunter === me;
      const body = ctrl.render(`<div class="pk-page ww-stage">${top}
        ${narrationHtml(nm(st.hunter) + ' was the ' + rn('hunter', th) + ' — and gets one last shot.', ri('hunter', th))}
        ${mine ? '<div data-picker></div><button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-shoot disabled>Pick someone</button><button type="button" class="pk-link" data-hold>Hold fire</button>' : '<div class="pk-wait">Waiting for the shot…</div>'}
        ${alive ? chatBox(ctrl, 'day', st.chat, { title: 'Village chat' }) : ''}
        ${!mine ? deadBlock : ''}${peek}
      </div>`);
      finish(body);
      if (mine) {
        let target = null;
        const btn = body.querySelector('[data-shoot]');
        K.mountPicker(body.querySelector('[data-picker]'), {
          players: st.alive.map((id) => ({ id, name: nm(id) })),
          onPick: (ids) => {
            target = ids[0];
            btn.disabled = !target;
            btn.textContent = 'Take ' + nm(target);
          },
        });
        btn.addEventListener('click', () => target && ctrl.act('shoot', { target }));
        body.querySelector('[data-hold]').addEventListener('click', () => ctrl.act('shoot', { target: null }));
      }
      return;
    }

    if (st.phase === 'day') {
      const myNom = st.nominations[me] || null;
      const hostTools = ctrl.isHost()
        ? `<div class="pk-row"><button type="button" class="pk-chip" data-extend>+1 min</button><button type="button" class="pk-chip" data-advance>Start the vote</button></div>`
        : '';
      const body = ctrl.render(`<div class="pk-page ww-stage">${top}
        ${narrationHtml(narrate({ t: 'day' }, th, nm), '☀️')}
        ${hostTools}
        ${aliveListHtml(st, nm, { roles: publicRoles(st), me, noms: st.nominations, presence: true })}
        ${
          alive
            ? `<div class="pk-section">Nominate someone for the vote</div><div data-picker></div>${myNom ? '<button type="button" class="pk-link" data-unnominate>Take back my nomination</button>' : ''}${chatBox(ctrl, 'day', st.chat, { title: 'Village chat' })}`
            : ''
        }
        ${deadBlock}${peek}
      </div>`);
      finish(body);
      body.querySelector('[data-extend]')?.addEventListener('click', () => ctrl.act('extend'));
      body.querySelector('[data-unnominate]')?.addEventListener('click', () => ctrl.act('nominate', { target: null }));
      if (alive) {
        K.mountPicker(body.querySelector('[data-picker]'), {
          players: st.alive.filter((id) => id !== me).map((id) => ({ id, name: nm(id) })),
          selected: myNom ? [myNom] : [],
          onPick: (ids) => ids[0] && ctrl.act('nominate', { target: ids[0] }),
        });
      }
      return;
    }

    if (st.phase === 'vote') {
      const mine = sec.myVote && sec.myVote.day === st.day && !!sec.myVote.revote === !!st.revote ? sec.myVote.target : null;
      const tie = st.revote ? lastOf(st, 'tie') : null;
      const body = ctrl.render(`<div class="pk-page ww-stage">${top}
        ${tie ? narrationHtml(narrate(tie, th, nm), '⚖️') : ''}
        <div class="pk-title">${alive ? (mine ? 'Vote locked in' : 'Who should be out?') : 'The village is voting'}</div>
        <div class="pk-sub">${st.voted.length}/${st.alive.length} voted</div>
        ${
          alive
            ? `<div data-picker></div><button type="button" class="pk-chip ww-none" data-skip aria-pressed="${mine === 'skip'}">No one</button>${mine ? `<div class="ww-locked">✓ You voted ${mine === 'skip' ? 'for no one' : esc(nm(mine))} — tap to change</div>` : ''}`
            : ''
        }
        <div class="pk-error" data-err></div>
        ${alive ? chatBox(ctrl, 'day', st.chat, { title: 'Village chat' }) : ''}
        ${deadBlock}${peek}
      </div>`);
      finish(body);
      if (alive) {
        const err = body.querySelector('[data-err]');
        K.mountPicker(body.querySelector('[data-picker]'), {
          players: st.candidates.filter((id) => id !== me).map((id) => ({ id, name: nm(id) })),
          selected: mine && mine !== 'skip' ? [mine] : [],
          onPick: (ids) => ids[0] && ctrl.act('vote', { target: ids[0] }, err),
        });
        body.querySelector('[data-skip]').addEventListener('click', () => ctrl.act('vote', { target: 'skip' }, err));
      }
      return;
    }

    if (st.phase === 'over' && st.result) {
      const body = ctrl.render(`<div class="pk-page">
        <div class="ww-top">${muteBtnHtml()}</div>
        ${overHtml(st, nm, me)}
        ${chatBox(ctrl, 'day', st.chat, { title: 'Chat' })}
        ${K.roomResultActions(ctrl, { nextLabel: 'Play again', waitLabel: 'Waiting for the host to start a new game…' })}
      </div>`);
      wireMute(body, ctrl.shell, 'day');
      wireRoomChat(ctrl, body);
      K.wireRoomResultActions(ctrl, body, { nextOp: 'start', onShare: () => shareOver(st, nm) });
      if (ctrl.view.celebrated !== pub.roundNo) {
        ctrl.view.celebrated = pub.roundNo;
        try {
          if (typeof gameFeedback === 'function') gameFeedback('win');
        } catch (e) {}
      }
    }
  }

  /** Wolves may change their pick until the night ends (the pack decides together). */
  function wireRePick(ctrl, body, step) {
    const host = document.createElement('div');
    host.innerHTML = '<button type="button" class="pk-link" data-repick>Change my pick</button>';
    body.querySelector('.ww-locked')?.after(host.firstElementChild);
    body.querySelector('[data-repick]')?.addEventListener('click', () => {
      const sheet = Kit().openSheet({
        title: 'Change your pick',
        bodyHtml: '<div data-picker></div>',
        onMount(el, close) {
          Kit().mountPicker(el.querySelector('[data-picker]'), {
            players: step.candidates.map((id) => ({ id, name: ctrl.name(id) })),
            onPick: (ids) => {
              close();
              if (ids[0]) ctrl.act('night', { target: ids[0] });
            },
          });
        },
      });
      return sheet;
    });
  }

  // ---------------- registration ----------------

  if (window.PartyKit) PartyKit.registerPartyGame(GAME, { label: LABEL, openRoom });
  const launch = window.PartyKit ? PartyKit.withGameData(GAME, open) : open;

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'werewolf',
      name: LABEL,
      desc: 'Secret roles — find the Werewolves before they take the village',
      icon: '🐺',
      gameType: 'multiplayer',
      genre: 'party',
      ratingKey: null,
      dangal: true,
      chat1v1: false,
      chatGroup: true,
      selfChat: false,
      order: 24,
      meta: {
        kit: 'party-kit.js (Pass & Play + Room)',
        dealing: 'party_room → server-lib/werewolf-engine.js; roles, night choices and wolf chat readable only by their owners',
        themes: 'Werewolf | Mafia',
      },
      launch,
    });
  }

  window.openWerewolfGame = launch;
})();
