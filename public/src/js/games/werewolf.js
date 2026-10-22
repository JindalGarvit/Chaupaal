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
  const LABEL = t('dangal.identity.werewolf.label');
  const SETTINGS_KEY = 'chaupaal_werewolf_settings';
  const NAMES_KEY = 'chaupaal_werewolf_names';
  const VOICE_KEY = 'chaupaal_werewolf_voice';
  /** Every night screen holds for the same time after a choice, whatever the role. */
  const NIGHT_HOLD_MS = 2600;

  const Core = () => window.WerewolfCore;
  const Kit = () => window.PartyKit;
  const esc = (s) => (window.PartyKit ? PartyKit.esc(s) : String(s == null ? '' : s));

  /** English fallback with {{placeholders}} filled (no catalog loaded). */
  function fill(s, p) {
    return p ? String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (p[k] == null ? m : p[k] && p[k].text != null ? p[k].text : p[k])) : s;
  }
  /** Player names in params get bidi isolation (mixed RTL / LTR names stay intact). */
  function isolateNames(p) {
    if (!p || typeof bidi !== 'function') return p;
    const o = Object.assign({}, p);
    Object.keys(o).forEach((k) => {
      if (/^(name|who)\d*$/.test(k) && typeof o[k] === 'string') o[k] = bidi(o[k]);
    });
    return o;
  }
  function tr(key, fallback, params) {
    const p = isolateNames(params);
    return typeof t === 'function' ? t('games.werewolf.' + key, p || fallback) : fill(fallback, p);
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
        return tr('tip.wolf', 'Each night, choose someone to take with the other {{wolves}}. By day, blend in.', { wolves: rp('wolf', th) });
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
        return tr('tip.villager', 'Find the {{wolves}} by talking and voting. At night, note who you suspect.', { wolves: rp('wolf', th) });
    }
  }

  function roleBlurb(role, th) {
    const w = rp('wolf', th);
    return {
      wolf: tr('glossary.wolf', 'Picks someone to take each night. Wins when they match the rest.'),
      seer: tr('glossary.seer', 'Checks one player a night: {{wolves}} or not?', { wolves: w }),
      doctor: tr('glossary.doctor', 'Protects one player a night.'),
      villager: tr('glossary.villager', 'No night power — finds the {{wolves}} by talking.', { wolves: w }),
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
    const night = Kit().passNightNames && Kit().passNightNames(Core().MIN_PLAYERS, Core().MAX_PASS);
    if (night) return night;
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
      t('games.werewolf.value_value2_value3_value4_min_talk', { value: Core().theme(set).label, value2: set.wolves ? set.wolves + ' ' + rp('wolf', set) : 'Auto-balanced', value3: extras.length ? ' · +' + extras.join(', ') : '', value4: Math.round(set.discussSec / 60) })
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
        ${K.segHtml(r, s[r], [[false, t('dangal.solo.off')], [true, t('games.werewolf.on')]])}
      </div>`;
    K.openSheet({
      title: t('games.werewolf.game_settings'),
      bodyHtml: `
        <div class="pk-field">
          <div class="pk-field-label">${tHtml('games.werewolf.discussion_time')}</div>
          ${K.segHtml('discussSec', s.discussSec, C.DISCUSS_OPTIONS.map((x) => [x, tr('minutes_short', '{{n}} min', { n: x / 60 })]))}
        </div>
        <div class="pk-field">
          <div class="pk-field-label">${tHtml('games.werewolf.show_a_player_s_role_when')}</div>
          ${K.segHtml('reveal', s.reveal, /* i18n-copy */ [[true, t('games.werewolf.yes')], [false, t('games.werewolf.no')]])}
        </div>
        <div class="pk-field" data-voice-field>
          <div class="pk-field-label">${tHtml('games.werewolf.narrator_voice_sounds_this_phone')}</div>
          ${K.segHtml('voice', voice.voice, [['on', t('games.werewolf.on')], ['off', t('dangal.solo.off')]])}
        </div>
        <details class="pk-advanced">
          <summary>${tHtml('games.werewolf.rules.rules.4.h')}</summary>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.werewolf.rules.variant.theme.label')}</div>
            ${K.segHtml('theme', s.theme, [['werewolf', '🐺 Werewolf'], ['mafia', '🕴️ Mafia']])}
          </div>
          <div class="pk-field">
            <div class="pk-field-label" data-wolf-label>${esc(rp('wolf', s))}</div>
            ${K.segHtml('wolves', s.wolves, [[0, t('games.werewolf.auto')], [1, '1'], [2, '2'], [3, '3'], [4, '4']])}
          </div>
          <div class="pk-field-help">${tHtml('games.werewolf.value_and_value2_are_always_in', { value: rn('seer', s), value2: rn('doctor', s) })}</div>
          ${C.OPTIONAL.map(roleRow).join('')}
          <div data-balance>${balanceHtml(n(), s)}</div>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.werewolf.doctor_repeat', { role: rn('doctor', s) })}</div>
            ${K.segHtml('doctorRepeat', s.doctorRepeat, /* i18n-copy */ [[false, t('games.werewolf.no')], [true, t('games.werewolf.yes')]])}
          </div>
          ${
            opts.room
              ? `<div class="pk-field">
            <div class="pk-field-label">${tHtml('games.werewolf.night_timer')}</div>
            ${K.segHtml('nightSec', s.nightSec, C.NIGHT_OPTIONS.map((x) => [x, x + 's']))}
          </div>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.werewolf.vote_timer')}</div>
            ${K.segHtml('voteSec', s.voteSec, C.VOTE_OPTIONS.map((x) => [x, x + 's']))}
          </div>`
              : `<div class="pk-field">
            <div class="pk-field-label">${tHtml('games.werewolf.day_vote')}</div>
            ${K.segHtml('voteStyle', s.voteStyle, /* i18n-copy */ [['quick', t('games.werewolf.point_on_3')], ['secret', t('games.werewolf.secret_pass_around')]])}
            <div class="pk-field-help">${tHtml('games.werewolf.point_on_3_everyone_points_at')}</div>
          </div>`
          }
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${tHtml('common.done')}</button>`,
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
      } else u.lang = typeof getTtsLang === 'function' ? getTtsLang(want) : want === 'en' ? 'en-US' : want;
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
    return `<button type="button" class="ww-mute" data-ww-mute aria-pressed="${!on}" aria-label="${on ? tHtml('games.werewolf.mute_narrator') : tHtml('games.werewolf.unmute_narrator')}">${on ? '🔊' : '🔇'}</button>`;
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
      <div class="ww-card-team">${team === 'tanner' ? tHtml('games.werewolf.plays_alone') : tHtml('games.werewolf.team_th', { th: teamLabel(team, th) })}</div>
      <div class="ww-card-tip">${esc(roleTip(role, s))}</div>
      ${extra || ''}
    </div>`;
  }

  function packHtml(wolves, me, nm, th) {
    const others = (wolves || []).filter((id) => id !== me);
    if (!others.length) return `<div class="ww-card-pack">${tHtml('games.werewolf.you_re_the_only_th', { th: rn('wolf', th) })}</div>`;
    return `<div class="ww-card-pack">${tHtml('games.werewolf.the_other_th', { th: rp('wolf', th) })} <strong>${others.map((id) => esc(nm(id))).join(', ')}</strong></div>`;
  }

  function glossaryHtml(s) {
    const th = themeId(s);
    return `<div class="ww-glossary">${Core().ROLE_IDS.map(
      (r) => `<div class="ww-glossary-row"><span aria-hidden="true">${esc(ri(r, th))}</span><span class="ww-glossary-name">${esc(rn(r, th))}${
        Core().OPTIONAL.indexOf(r) >= 0 ? ' <em>' + tHtml('games.werewolf.optional') + '</em>' : ''
      }</span><span class="ww-glossary-text">${esc(roleBlurb(r, th))}</span></div>`
    ).join('')}</div>`;
  }

  function howToCardHtml(s) {
    const th = themeId(s);
    const w = rp('wolf', th);
    return `<details class="pk-howto">
      <summary>${tHtml('games.werewolf.how_to_play_20_seconds')}</summary>
      <ol>
        <li>${tHtml('games.werewolf.everyone_secretly_gets_a_role_the', { w })}</li>
        <li><strong>${tHtml('games.werewolf.night')}</strong> ${tHtml('games.werewolf.the_w_pick_someone_to_take', { w, th: rn('seer', th), th2: rn('doctor', th) })}</li>
        <li><strong>${tHtml('games.werewolf.day')}</strong> ${tHtml('games.werewolf.hear_who_was_taken_talk_it')}</li>
        <li>${tHtml('games.werewolf.the_th_wins_when_every_one', { th: teamLabel('village', th), w })}</li>
      </ol>
      <div class="pk-howto-score">${tHtml('games.werewolf.role_guide')}</div>
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
          ${alive ? '' : '<span class="ww-person-out">' + tHtml('games.werewolf.out') + '</span>'}
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

  /** AI narrator flavour for the current beat (Room only; empty when AI is off or the line is stale). */
  function flavourHtml(ctrl, st) {
    const pub = ctrl && ctrl.view && ctrl.view.pub;
    const n = pub && pub.narration;
    if (!n || !n.line || n.key !== String(pub.phaseKey || '') + '#' + (st.log || []).length) return '';
    return `<div class="ww-flavour" aria-live="polite">${esc(n.line)}</div>`;
  }

  function lastOf(pub, type) {
    return pub.log.filter((e) => e.t === type).slice(-1)[0] || null;
  }

  function roleRevealLine(entryRoles, pub, nm) {
    const ids = Object.keys(entryRoles || {});
    if (!ids.length) return '';
    return `<div class="ww-reveal-roles">${ids
      .map((id) => `<span>${tHtml('games.werewolf.id_was_the_theme_theme2', { id: nm(id), theme: ri(entryRoles[id], pub.theme), theme2: rn(entryRoles[id], pub.theme) })}</span>`)
      .join('')}</div>`;
  }

  function recapHtml(result, pub, nm) {
    const th = pub.theme;
    const team = (x) => (x === 'wolves' ? rn('wolf', th) : 'not a ' + rn('wolf', th));
    const rows = result.recap.map((r) => {
      if (r.t === 'night') {
        const bits = [];
        bits.push(t('games.werewolf.the_rp_went_for_value_value2', { rp: rp('wolf', th), value: r.victim ? nm(r.victim) : t('games.werewolf.nobody'), value2: r.tied ? t('games.werewolf.tie_picked_at_random') : '' }));
        if (r.doctor) bits.push(rn('doctor', th) + ' protected ' + nm(r.doctor));
        if (r.bodyguard) bits.push(rn('bodyguard', th) + ' guarded ' + nm(r.bodyguard));
        if (r.seer) bits.push(rn('seer', th) + ' checked ' + nm(r.seer.target) + ' (' + team(r.seer.team) + ')');
        if (r.witchSave) bits.push(t('games.werewolf.rn_s_save_potion_worked', { rn: rn('witch', th) }));
        if (r.witchKill) bits.push(t('games.werewolf.rn_used_the_sleep_potion_on', { rn: rn('witch', th), nm: nm(r.witchKill) }));
        const end = r.taken.length ? r.taken.map(nm).join(' & ') + ' out' : t('games.werewolf.nobody_out');
        return `<li class="ww-recap-night"><strong>${tHtml('games.werewolf.night_night', { night: r.night })}</strong> — ${esc(bits.join('; '))} → ${esc(end)}</li>`;
      }
      if (r.t === 'day') return `<li class="ww-recap-day"><strong>${tHtml('games.werewolf.day_day', { day: r.day })}</strong> — ${esc(r.out ? t('games.werewolf.nm_voted_out', { nm: nm(r.out) }) : r.tie ? t('games.werewolf.tie_twice_nobody_out') : t('games.werewolf.nobody_voted_out'))}</li>`;
      if (r.t === 'shot') return `<li class="ww-recap-day">${esc(rn('hunter', th))} ${esc(nm(r.by))} ${esc(r.target ? 'took ' + nm(r.target) + ' down' : t('games.werewolf.held_fire'))}</li>`;
      if (r.t === 'left') return `<li class="ww-recap-day">${tHtml('games.werewolf.name_left', { name: bidi(nm(r.id)) })}</li>`;
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
      <div class="pk-sub">${tHtml('games.werewolf.n_nights', { count: res.nights })}</div>
      <div class="pk-section">${tHtml('games.werewolf.who_was_who')}</div>
      <div class="ww-roles">${order
        .map((id) => {
          const role = res.roles[id];
          const won = res.winner === 'tanner' ? id === res.tanner : Core().TEAM[role] === res.winner;
          return `<div class="ww-roles-row${won ? ' is-won' : ''}${Core().isAlive(pub, id) ? '' : ' is-out'}">
            <span aria-hidden="true">${esc(ri(role, th))}</span>
            <span class="ww-roles-name">${esc(nm(id))}${id === me ? ' (you)' : ''}</span>
            <span class="ww-roles-role">${esc(rn(role, th))}</span>
            ${won ? '<span class="ww-roles-won">' + tHtml('games.werewolf.won') + '</span>' : ''}
          </div>`;
        })
        .join('')}</div>
      ${
        sus.length
          ? `<div class="pk-section">${tHtml('games.werewolf.most_suspected')}</div><div class="ww-suspects">${sus
              .map((x) => `<div class="ww-suspect"><span>${esc(nm(x.id))}</span><span>${x.n} ☝</span><span>${esc(ri(x.role, th))} ${esc(rn(x.role, th))}</span></div>`)
              .join('')}</div><div class="pk-field-help">${tHtml('games.werewolf.village_suspicion_from_the_night_time')}</div>`
          : ''
      }
      <details class="ww-recap-wrap" open>
        <summary>${tHtml('games.werewolf.night_by_night_recap')}</summary>
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
        ? tHtml('games.werewolf.wolves_chose', { wolves: rp('wolf', th), name: { html: '<strong>' + esc(nm(w.victim)) + '</strong>' } })
        : t('games.werewolf.you_don_t_know_who_the', { value: esc(rp('wolf', th)) });
      potions = `<div class="ww-potions">
        ${w.save ? `<div class="ww-potion-note">${victimLine}</div><button type="button" class="pk-chip ww-potion" data-save aria-pressed="false">${tHtml('games.werewolf.use_the_save_potion_value', { value: { html: w.victim ? ' on ' + esc(nm(w.victim)) : tHtml('games.werewolf.on_whoever_is_attacked') } })}</button>` : '<div class="ww-potion-note">' + tHtml('games.werewolf.save_potion_used') + '</div>'}
      </div>`;
    }
    return `<div class="ww-night-face">
      <div class="ww-night-role">${esc(ri(step.role, th))} ${esc(rn(step.role, th))}</div>
      <div class="ww-night-prompt">${esc(step.prompt)}</div>
      ${extras || ''}
      ${potions}
      <div data-night-picker></div>
      ${step.optional ? '<button type="button" class="pk-chip ww-none" data-none aria-pressed="false">' + tHtml('games.werewolf.no_one_tonight') + '</button>' : ''}
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
      if (typeof showToast === 'function') showToast(t('games.werewolf.label_is_still_loading_try_again', { LABEL }));
      return;
    }
    if ((c.source === 'chat_group' || c.isGroup) && c.chat) {
      startRoom({ chat: c.chat });
      return;
    }
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: t('games.werewolf.party'), confirmLeave: () => !!shell.wwPlaying, leaveBody: t('games.werewolf.this_game_will_end_for_everyone') });
    if (c.mode === 'pass') renderPassSetup(shell);
    else renderHome(shell);
  }

  function renderHome(shell) {
    const s = loadSettings();
    shell.wwPlaying = false;
    mood(shell, null);
    const body = shell.render(
      Kit().homeHtml({
        game: GAME,
        icon: '🐺',
        title: t('games.werewolf.who_are_the_rp', { rp: rp('wolf', s) }),
        sub: t('games.werewolf.5_20_players_best_with_7'),
        howToHtml: howToCardHtml(s),
        passSub: t('games.werewolf.one_phone_5_16_players'),
        roomSub: t('games.werewolf.everyone_on_their_own_phone_5'),
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
        <div class="pk-title">${tHtml('games.werewolf.who_s_playing')}</div>
        <button type="button" class="pk-icon-btn" data-settings aria-label="${tHtml('games.werewolf.game_settings')}">⚙︎</button>
      </div>
      <div class="pk-sub">${tHtml('games.werewolf.best_with_7_players')}</div>
      <div data-editor></div>
      <div data-meta></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start>${tHtml('games.werewolf.start')}</button>
    </div>`);
    shell.setBack(() => renderHome(shell));
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
    return p ? p.name : t('common.someone');
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
      <div class="pk-progress">${tHtml('games.werewolf.role_value_of_ordercount', { value: index + 1, orderCount: order.length })}</div>
      <div data-cover></div>
    </div>`);
    Kit().mountPassCover(body.querySelector('[data-cover]'), {
      name: nm(id),
      revealHtml: () => roleCardHtml(secret.role, session.settings, secret.role === 'wolf' ? packHtml(secret.wolves, id, nm, session.settings) : ''),
      doneLabel: index === order.length - 1 ? t('games.werewolf.hide_start') : t('games.werewolf.hide_pass'),
      onDone: () => renderPassDeal(shell, session, index + 1),
    });
  }

  function renderPassNightIntro(shell, session) {
    const pub = session.g.pub;
    const line = narrate({ t: 'night' }, pub.theme);
    mood(shell, 'night');
    sfx('ui.turn');
    const body = shell.render(`<div class="pk-page ww-stage">
      <div class="ww-top"><div class="pk-progress">${tHtml('games.werewolf.night_night', { night: pub.night })}</div>${muteBtnHtml()}</div>
      ${narrationHtml(line, '🌙')}
      <div class="pk-sub">${tHtml('games.werewolf.everyone_takes_a_turn_with_the')}</div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${tHtml('games.werewolf.start_the_night')}</button>
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
      <div class="pk-progress">${tHtml('games.werewolf.night_night_value_of_ordercount', { night: g.pub.night, value: idx + 1, orderCount: order.length })}</div>
      <div data-cover></div>
    </div>`);
    Kit().mountPassVote(body.querySelector('[data-cover]'), {
      name: nm(id),
      bodyHtml: nightFaceHtml(step, session.settings, nm, pack),
      doneLabel: t('common.confirm'),
      coverTitle: t('games.werewolf.your_night_turn'),
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
    let msg = t('games.werewolf.your_choice_is_locked_in');
    const check = step.role === 'seer' && out && out.result ? session.g.hidden.seerLog.slice(-1)[0] : null;
    if (check) msg = nm(check.target) + (check.team === 'wolves' ? t('games.werewolf.is_one_of_the_rp', { rp: rp('wolf', th) }) : t('games.werewolf.is_not_one_of_the_rp', { rp: rp('wolf', th) }));
    const body = shell.render(`<div class="pk-page">
      <div class="pk-progress">${tHtml('games.werewolf.night_value', { value: session.g.pub.night || '' })}</div>
      <div class="pk-card is-revealed ww-hold"><div class="pk-card-face">
        <div class="ww-hold-icon" aria-hidden="true">${step.role === 'seer' ? '🔮' : '✓'}</div>
        <div class="ww-hold-msg" data-hold-msg>${esc(msg)}</div>
      </div></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-pass disabled>${tHtml('games.werewolf.hide_pass')}</button>
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
      <div class="ww-top"><div class="pk-progress">${tHtml('games.werewolf.morning_value', { value: entry ? entry.n : '' })}</div>${muteBtnHtml()}</div>
      ${narrationHtml(line, '🌅')}
      ${roleRevealLine(entry && entry.roles, pub, nm)}
      ${aliveListHtml(pub, nm, { roles: publicRoles(pub) })}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${tHtml('games.werewolf.continue')}</button>
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
      ${narrationHtml(tHtml('games.werewolf.nm_was_the_rn_and_gets', { nm: nm(by), rn: rn('hunter', th) }), ri('hunter', th))}
      <div class="pk-sub">${tHtml('games.werewolf.hunter_take', { name: bidi(nm(by)) })}</div>
      <div data-picker></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-shoot disabled>${tHtml('games.werewolf.pick_someone')}</button>
      <button type="button" class="pk-link" data-hold>${tHtml('games.werewolf.hold_fire')}</button>
    </div>`);
    wireMute(body, shell, 'day');
    say(t('games.werewolf.nm_was_the_rn_and_gets', { nm: nm(by), rn: rn('hunter', th) }));
    let target = null;
    const btn = body.querySelector('[data-shoot]');
    Kit().mountPicker(body.querySelector('[data-picker]'), {
      players: pub.alive.map((id) => ({ id, name: nm(id) })),
      onPick: (ids) => {
        target = ids[0];
        btn.disabled = !target;
        btn.textContent = t('games.werewolf.take_nm', { nm: nm(target) });
      },
    });
    const shoot = async (_t) => {
      passAct(session, { type: 'shoot', target: _t });
      const e = lastOf(session.g.pub, 'shot');
      const line = narrate(e, th, nm);
      sfx(_t ? 'ui.capture' : 'ui.check');
      say(line);
      await Kit().bigReveal({ icon: ri('hunter', th), title: line, sub: e.role ? t('games.werewolf.nm_was_the_rn', { nm: nm(e.target), rn: rn(e.role, th) }) : '', ms: 3200, host: shell.el });
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
      <div class="ww-top"><div class="pk-progress">${tHtml('games.werewolf.day_day', { day: pub.day })}</div>${muteBtnHtml()}</div>
      ${narrationHtml(line, '☀️')}
      <div class="pk-timer" data-timer></div>
      <div class="pk-row">
        <button type="button" class="pk-chip" data-pause>${tHtml('games.werewolf.pause')}</button>
        <button type="button" class="pk-chip" data-extend>${tHtml('games.werewolf.1_min')}</button>
      </div>
      ${aliveListHtml(pub, nm, { roles: publicRoles(pub) })}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-vote>${tHtml('games.werewolf.start_the_vote')}</button>
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
        e.currentTarget.textContent = t('common.shortcut_dangal_resume');
      } else {
        endsAt = Date.now() + pausedLeft;
        pausedLeft = null;
        e.currentTarget.textContent = t('games.werewolf.pause');
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
      <div class="ww-top"><div class="pk-progress">${tHtml('games.werewolf.day_day_vote_value', { day: pub.day, value: pub.revote ? t('games.werewolf.again') : '' })}</div>${muteBtnHtml()}</div>
      ${tie ? narrationHtml(tieLine, '⚖️') : ''}
      <div class="pk-title">${tHtml('games.werewolf.count_to_three_and_point')}</div>
      <div class="pk-sub">${tHtml('games.werewolf.tap_whoever_got_the_most_fingers')}</div>
      <div data-picker></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${tHtml('games.werewolf.nobody_is_out')}</button>
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
        btn.textContent = !ids.length ? t('games.werewolf.nobody_is_out') : ids.length === 1 ? t('games.werewolf.nm_is_out', { nm: nm(ids[0]) }) : t('games.werewolf.it_s_a_tie_value', { value: pub.revote ? t('games.werewolf.nobody_is_out_2') : t('games.werewolf.vote_again') });
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
      <div class="pk-progress">${tHtml('games.werewolf.secret_vote_value_of_ordercount', { value: idx + 1, orderCount: order.length })}</div>
      <div data-cover></div>
    </div>`);
    Kit().mountPassVote(body.querySelector('[data-cover]'), {
      name: nm(id),
      bodyHtml: `<div class="pk-title">${tHtml('games.werewolf.who_should_be_out')}</div><div data-picker></div><button type="button" class="pk-chip ww-none" data-skip>${tHtml('games.werewolf.no_one')}</button>`,
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
      <div class="ww-top"><div class="pk-progress">${tHtml('games.werewolf.day_day', { day: pub.day })}</div>${muteBtnHtml()}</div>
      ${narrationHtml(line, e && e.out ? '⚖️' : '🤝')}
      ${e && e.out && e.role ? roleRevealLine({ [e.out]: e.role }, pub, nm) : ''}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${tHtml('games.werewolf.continue')}</button>
    </div>`);
    wireMute(body, shell, 'day');
    say(line + (e && e.out && e.role ? t('games.werewolf.nm_was_the_rn_2', { nm: nm(e.out), rn: rn(e.role, pub.theme) }) : ''));
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
    shell.setSubtitle(t('games.werewolf.game_over'));
    Kit().reportPass(GAME, { players: session.players, state: { result: pub.result } });
    const body = shell.render(`<div class="pk-page">
      <div class="ww-top">${muteBtnHtml()}</div>
      ${overHtml(pub, nm)}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${tHtml('games.werewolf.play_again')}</button>
      ${Kit().passHubButtonHtml()}
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share>${tHtml('common.share')}</button>
        <button type="button" class="pk-btn pk-btn--ghost" data-setup>${tHtml('games.werewolf.players_settings')}</button>
      </div>
    </div>`);
    wireMute(body, shell, 'day');
    Kit().wirePassHub(body, shell);
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
          ? { ok: false, label: t('games.werewolf.need_value_more_to_start', { value: Core().MIN_PLAYERS - players.length }) }
          : { ok: true, label: t('games.werewolf.start_rolesline', { rolesLine: rolesLine(players.length, ctrl.view.pub.settings) }) },
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
        if (['NOT_ALLOWED', t('dangal.party.blocked'), 'SLOW_DOWN', 'MAX_EXTENDS', 'EMPTY', 'ALREADY_CHECKED', 'NOT_HUNTER', 'PHASE'].indexOf(code) >= 0 && e.message) return e.message;
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
    // Optional AI flavour line (host phone asks once per beat; server caches + caps it). Template stays the fact.
    if (ctrl.isHost() && Kit().aiOn() && ['night', 'dawn', 'vote', 'win'].indexOf(last.t) >= 0) {
      Kit().roomCall(GAME, 'narrate', { code: ctrl.view.code }).catch(() => {});
    }
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
    return `<div class="ww-spectator">
      <div class="pk-section">${tHtml('games.werewolf.you_re_out_watching')}</div>
      <div class="pk-sub">${tHtml('games.werewolf.roles_stay_secret_until_the_end')}</div>
      ${aliveListHtml(st, ctrl.name, { roles: publicRoles(st), me: ctrl.uid })}
      ${chatBox(ctrl, 'dead', sec.deadChat, { title: t('games.werewolf.spectators_chat'), placeholder: t('games.werewolf.chat_with_the_others_who_are') })}
    </div>`;
  }

  function renderRoomSpectator(ctrl, st) {
    mood(ctrl.shell, st.phase === 'night' || st.phase === 'reveal' ? 'night' : 'day');
    const last = st.log.slice(-1)[0];
    const body = ctrl.render(`<div class="pk-page ww-stage">
      <div class="ww-top"><div class="pk-progress">${tHtml('games.werewolf.game_in_progress_value', { value: st.phase === 'night' ? t('games.werewolf.night_night', { night: st.night }) : t('games.werewolf.day_value', { value: st.day || 1 }) })}</div>${muteBtnHtml()}</div>
      <div class="pk-sub">${tHtml('games.werewolf.you_ll_be_dealt_in_when')}</div>
      ${last ? narrationHtml(narrate(last, st.theme, ctrl.name), st.phase === 'night' ? '🌙' : '☀️') : ''}
      ${aliveListHtml(st, ctrl.name, { roles: publicRoles(st), presence: true })}
      ${st.chat && st.chat.length ? chatBox(ctrl, 'dayview', st.chat, { title: t('games.werewolf.village_chat'), disabled: tr('watching', 'Watching') }) : ''}
      <button type="button" class="pk-link" data-leave>${tHtml('games.werewolf.leave_room')}</button>
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
    ctrl.shell.setSubtitle(tr('room_code_value', 'Room {{code}} · {{value}}', { code: ctrl.view.code, value: (st.phase === 'night' || st.phase === 'reveal' ? tr('night_value', 'Night {{value}}', { value: Math.max(1, st.night) }) : tr('day_day', 'Day {{day}}', { day: st.day })) }));
    const peek = alive && st.phase !== 'over' ? '<button type="button" class="pk-peek" data-peek aria-label="' + tHtml('games.werewolf.hold_to_peek_at_your_role_2') + '">' + tHtml('games.werewolf.hold_to_peek_at_your_role') + '</button>' : '';
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
    const deadBlock = !alive && st.phase !== 'over' ? spectatorPanel(ctrl, st, sec) : '';

    if (st.phase === 'reveal') {
      const ready = st.players.filter((id) => pub.seen && pub.seen[id]).length;
      if (!(pub.seen && pub.seen[me])) {
        const body = ctrl.render(`<div class="pk-page">
          <div class="pk-progress">${tHtml('dangal.ready_of', { n: ready, total: st.players.length })}</div>
          <div data-cover></div>
        </div>`);
        K.mountPassCover(body.querySelector('[data-cover]'), {
          lead: t('games.werewolf.your_role'),
          name: nm(me),
          revealHtml: () => roleCardHtml(sec.role, settings, sec.role === 'wolf' ? packHtml(sec.wolves, me, nm, settings) : ''),
          doneLabel: t('games.werewolf.i_ve_seen_it'),
          onDone: () => ctrl.act('seen'),
        });
        return;
      }
      const body = ctrl.render(`<div class="pk-page ww-stage">${top}
        <div class="pk-title">${tHtml('games.werewolf.waiting_for_everyone_to_see_their')}</div>
        <div class="pk-sub">${tHtml('dangal.ready_of', { n: ready, total: st.players.length })}</div>
        ${peek}
      </div>`);
      finish(body);
      return;
    }

    if (st.phase === 'night') {
      const status = `<div class="pk-sub">${tHtml('dangal.done_of', { n: st.actedN, total: st.alive.length })}</div>`;
      if (!alive) {
        const body = ctrl.render(`<div class="pk-page ww-stage">${top}
          ${narrationHtml(narrate({ t: 'night' }, th), '🌙')}${status}${deadBlock}</div>`);
        finish(body);
        return;
      }
      const step = sec.step;
      const wolfBits =
        sec.role === 'wolf'
          ? `${packVotesHtml(sec.pack, me, nm, settings)}${chatBox(ctrl, 'wolf', sec.wolfChat, { title: t('games.werewolf.rp_only', { rp: rp('wolf', th) }), placeholder: t('games.werewolf.whisper_to_the_pack') })}`
          : '';
      const seerBits =
        sec.role === 'seer' && sec.seerLog && sec.seerLog.length
          ? `<div class="ww-seerlog">${sec.seerLog
              .map((x) => `<div>${tHtml('games.werewolf.night_night_target_value', { night: x.night, target: nm(x.target), value: x.team === 'wolves' ? esc(rn('wolf', th)) + ' 🐾' : t('games.werewolf.not_a_value', { value: esc(rn('wolf', th)) }) })}</div>`)
              .join('')}</div>`
          : '';
      if (sec.myNight || !step) {
        const body = ctrl.render(`<div class="pk-page ww-stage">${top}
          ${narrationHtml(narrate({ t: 'night' }, th), '🌙')}
          ${flavourHtml(ctrl, st)}
          <div class="ww-locked">✓ ${sec.myNight && sec.myNight.target ? tHtml('games.werewolf.you_chose_target', { target: nm(sec.myNight.target) }) : tHtml('games.werewolf.locked_in')}${sec.myNight && sec.myNight.save ? ' ' + tHtml('games.werewolf.save_potion_ready') : ''}</div>
          ${seerBits}${status}${wolfBits}${peek}
        </div>`);
        finish(body);
        if (sec.role === 'wolf' && sec.myNight && step) wireRePick(ctrl, body, step);
        return;
      }
      const draft = ctrl.view.wwDraft && ctrl.view.wwDraft.night === st.night ? ctrl.view.wwDraft : (ctrl.view.wwDraft = { night: st.night, target: null, save: false });
      const body = ctrl.render(`<div class="pk-page ww-stage">${top}
        ${nightFaceHtml(step, settings, nm, '')}
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-confirm disabled>${tHtml('common.confirm')}</button>
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
          K.bigReveal({ icon: '🔮', title: nm(draft.target) + (w ? t('games.werewolf.is_one_of_the_rp', { rp: rp('wolf', th) }) : t('games.werewolf.is_not_one_of_the_rp_2', { rp: rp('wolf', th) })), ms: 3000, host: ctrl.shell.el });
        }
      });
      return;
    }

    if (st.phase === 'dawn' || st.phase === 'verdict') {
      const e = lastOf(st, st.phase === 'dawn' ? 'dawn' : 'vote');
      const roles = st.phase === 'dawn' ? e && e.roles : e && e.out && e.role ? { [e.out]: e.role } : null;
      const body = ctrl.render(`<div class="pk-page ww-stage">${top}
        ${narrationHtml(narrate(e, th, nm), st.phase === 'dawn' ? '🌅' : '⚖️')}
        ${flavourHtml(ctrl, st)}
        ${roleRevealLine(roles, st, nm)}
        ${aliveListHtml(st, nm, { roles: publicRoles(st), me, presence: true })}
        ${ctrl.isHost() ? '<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-advance>' + tHtml('games.werewolf.continue') + '</button>' : '<div class="pk-wait">' + tHtml('games.werewolf.carrying_on_in_a_moment') + '</div>'}
        ${alive ? chatBox(ctrl, 'day', st.chat, { title: t('games.werewolf.village_chat') }) : ''}
        ${deadBlock}${peek}
      </div>`);
      finish(body);
      return;
    }

    if (st.phase === 'hunter') {
      const mine = st.hunter === me;
      const body = ctrl.render(`<div class="pk-page ww-stage">${top}
        ${narrationHtml(tHtml('games.werewolf.nm_was_the_rn_and_gets', { nm: nm(st.hunter), rn: rn('hunter', th) }), ri('hunter', th))}
        ${mine ? '<div data-picker></div><button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-shoot disabled>' + tHtml('games.werewolf.pick_someone') + '</button><button type="button" class="pk-link" data-hold>' + tHtml('games.werewolf.hold_fire') + '</button>' : '<div class="pk-wait">' + tHtml('games.werewolf.waiting_for_the_shot') + '</div>'}
        ${alive ? chatBox(ctrl, 'day', st.chat, { title: t('games.werewolf.village_chat') }) : ''}
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
            btn.textContent = t('games.werewolf.take_nm', { nm: nm(target) });
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
        ? `<div class="pk-row"><button type="button" class="pk-chip" data-extend>${tHtml('games.werewolf.1_min')}</button><button type="button" class="pk-chip" data-advance>${tHtml('games.werewolf.start_the_vote')}</button></div>`
        : '';
      const body = ctrl.render(`<div class="pk-page ww-stage">${top}
        ${narrationHtml(narrate({ t: 'day' }, th, nm), '☀️')}
        ${hostTools}
        ${aliveListHtml(st, nm, { roles: publicRoles(st), me, noms: st.nominations, presence: true })}
        ${
          alive
            ? `<div class="pk-section">${tHtml('games.werewolf.nominate_someone_for_the_vote')}</div><div data-picker></div>${myNom ? '<button type="button" class="pk-link" data-unnominate>' + tHtml('games.werewolf.take_back_my_nomination') + '</button>' : ''}${chatBox(ctrl, 'day', st.chat, { title: t('games.werewolf.village_chat') })}`
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
        <div class="pk-title">${alive ? (mine ? tHtml('games.werewolf.vote_locked_in') : tHtml('games.werewolf.who_should_be_out')) : tHtml('games.werewolf.the_village_is_voting')}</div>
        <div class="pk-sub">${tHtml('dangal.voted_of', { n: st.voted.length, total: st.alive.length })}</div>
        ${
          alive
            ? `<div data-picker></div><button type="button" class="pk-chip ww-none" data-skip aria-pressed="${mine === 'skip'}">${tHtml('games.werewolf.no_one')}</button>${mine ? `<div class="ww-locked">${tHtml('games.werewolf.you_voted_value_tap_to_change', { value: { html: mine === 'skip' ? tHtml('games.werewolf.for_no_one') : esc(nm(mine)) } })}</div>` : ''}`
            : ''
        }
        <div class="pk-error" data-err></div>
        ${alive ? chatBox(ctrl, 'day', st.chat, { title: t('games.werewolf.village_chat') }) : ''}
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
        ${chatBox(ctrl, 'day', st.chat, { title: t('common.chat') })}
        ${K.roomResultActions(ctrl, { nextLabel: t('games.werewolf.play_again'), waitLabel: t('games.werewolf.waiting_for_the_host_to_start') })}
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
    host.innerHTML = '<button type="button" class="pk-link" data-repick>' + tHtml('games.werewolf.change_my_pick') + '</button>';
    body.querySelector('.ww-locked')?.after(host.firstElementChild);
    body.querySelector('[data-repick]')?.addEventListener('click', () => {
      const sheet = Kit().openSheet({
        title: t('games.werewolf.change_your_pick'),
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
      desc: t('games.werewolf.secret_roles_find_the_werewolves_before'),
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
        kit: t('games.werewolf.party_kit_js_pass_play_room'),
        dealing: 'party_room → server-lib/werewolf-engine.js; roles, night choices and wolf chat readable only by their owners',
        themes: t('games.werewolf.werewolf_mafia'),
      },
      launch,
    });
  }

  window.openWerewolfGame = launch;
})();
