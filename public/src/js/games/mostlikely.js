/**
 * Most Likely To? — Dangal party game (G3) on the Party Kit. One game, two modes:
 *   Most Likely To  — everyone votes for the friend who fits the prompt; the room crowns a winner.
 *   Would You Rather — everyone secretly picks a side and predicts the majority.
 * Pass & Play: one phone, offline, no sign-in — secret pass-around vote (or "count of 3, point").
 * Room: each player on their own phone — votes go to party_room and stay server-side until reveal;
 *       anonymous reveal publishes tallies only.
 * Virtual points only; never chips.
 */
(function () {
  'use strict';

  const GAME = 'mostlikely';
  const LABEL = 'Most Likely To?';
  const PASS_KEY = 'chaupaal_mostlikely_settings';
  const ROOM_KEY = 'chaupaal_mostlikely_room_settings';
  const NAMES_KEY = 'chaupaal_mostlikely_names';
  const BOTH_KEY = 'chaupaal_mostlikely_bilingual';

  const Core = () => window.MostLikelyCore;
  const Kit = () => window.PartyKit;
  const esc = (s) => (window.PartyKit ? PartyKit.esc(s) : String(s == null ? '' : s));

  /** Session-only custom prompts: Pass & Play list, and the host's list per room code. Never saved. */
  let passCustoms = [];
  const roomCustoms = {};

  function lang() {
    const raw = typeof currentLang !== 'undefined' ? currentLang : 'en';
    return typeof normalizeLang === 'function' ? normalizeLang(raw) : raw;
  }

  function both() {
    try {
      return localStorage.getItem(BOTH_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function toggleBoth() {
    try {
      localStorage.setItem(BOTH_KEY, both() ? '0' : '1');
    } catch (e) {}
  }

  function loadSettings(where) {
    const key = where === 'room' ? ROOM_KEY : PASS_KEY;
    try {
      const raw = JSON.parse(localStorage.getItem(key) || 'null');
      // Rooms default to anonymous %; Pass & Play defaults to names (everyone is in the same room anyway).
      return Core().mergeSettings(raw || (where === 'room' ? { reveal: 'anon' } : {}), lang());
    } catch (e) {
      return Core().mergeSettings(where === 'room' ? { reveal: 'anon' } : {}, lang());
    }
  }

  function saveSettings(where, s) {
    try {
      localStorage.setItem(where === 'room' ? ROOM_KEY : PASS_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function loadNames() {
    try {
      const raw = JSON.parse(localStorage.getItem(NAMES_KEY) || '[]');
      if (Array.isArray(raw) && raw.length >= 2) return raw.slice(0, 16);
    } catch (e) {}
    return [Kit().myName() || '', '', ''];
  }

  function saveNames(names) {
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(names.slice(0, 16)));
    } catch (e) {}
  }

  function packLabel(p) {
    return window.PartyCore ? PartyCore.bilingualLabel(p, lang(), false) : p.en;
  }

  function modeLine(s, where) {
    const C = Core();
    return [
      C.MODE_LABELS[s.mode],
      s.rounds ? s.rounds + ' rounds' : 'Endless',
      C.activePacks(s, lang()).length + ' packs',
      s.reveal === 'anon' ? 'anonymous %' : 'names shown',
      where === 'pass' && s.voting === 'quick' ? 'count of 3' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function joinNames(ids, nm) {
    const names = ids.map(nm);
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
  }

  function mltShort(prompt) {
    if (!prompt) return '';
    const t = String(prompt.en || '').replace(/\?+$/, '');
    return prompt.custom && /^(who|which)\b/i.test(t) ? t : 'most likely to ' + t;
  }

  // ---------------- how-to ----------------

  function howToCardHtml() {
    return `<details class="pk-howto">
      <summary>How to play · 20 seconds</summary>
      <ol>
        <li><strong>Most Likely To:</strong> read the prompt — “Who’s most likely to forget their own birthday?” — and secretly vote for one player.</li>
        <li>The tally is revealed and the winner is crowned 👑 (ties share it). They get 15 seconds to defend themselves.</li>
        <li><strong>Would You Rather:</strong> secretly pick A or B, and guess which side most people chose.</li>
        <li>Points (optional): +1 if you voted with the room, or +1 for guessing the majority.</li>
      </ol>
      <div class="pk-howto-score">Playful, never mean — no prompts about looks, money, religion or anything unkind.</div>
    </details>`;
  }

  // ---------------- settings ----------------

  function openPackPicker(s, onSave) {
    const sel = new Set(s.packs || []);
    const P = Core().packs;
    Kit().openSheet({
      title: 'Packs',
      bodyHtml: `<div class="im-packs">${P.PACKS.map((p) => {
        const modes = [p.likely.length ? 'Most Likely' : '', p.rather.length ? 'Would You Rather' : ''].filter(Boolean).join(' + ');
        return `<label class="im-pack"><input type="checkbox" data-pack="${esc(p.id)}" ${sel.has(p.id) ? 'checked' : ''}>
          <span class="im-pack-icon" aria-hidden="true">${esc(p.icon)}</span>
          <span class="im-pack-name">${esc(packLabel(p))}${p.regional ? ' <em class="ml-regional">Regional</em>' : ''}<span class="ml-pack-modes">${esc(modes)}</span></span>
          <span class="im-pack-count">${p.likely.length + p.rather.length}</span></label>`;
      }).join('')}</div>
      <div class="pk-field-help" data-pack-err></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>Done</button>`,
      onMount(sheet, close) {
        sheet.querySelector('[data-save]').addEventListener('click', () => {
          const ids = Array.from(sheet.querySelectorAll('[data-pack]:checked')).map((el) => el.dataset.pack);
          const usable = Core().packs.packsFor(s.mode).some((p) => ids.indexOf(p.id) >= 0);
          if (!ids.length || !usable) {
            sheet.querySelector('[data-pack-err]').textContent = 'Pick at least one pack for ' + Core().MODE_LABELS[s.mode];
            return;
          }
          close();
          onSave(ids);
        });
      },
    });
  }

  function customLabel(c) {
    return c.mode === 'wyr' ? c.prompt.a.en + ' / ' + c.prompt.b.en : 'Most likely to ' + c.prompt.en;
  }

  /** Session-only custom prompts. Checked by the kindness filter; never sent anywhere to be stored. */
  function openCustoms(list, mode, onChange) {
    const K = Kit();
    K.openSheet({
      title: 'Custom prompts',
      bodyHtml: `<div class="pk-field-help">Only for this session — never saved.</div>
        ${
          mode === 'wyr'
            ? `<input class="pk-input" data-a maxlength="80" placeholder="Option A" aria-label="Option A">
               <input class="pk-input ml-mt" data-b maxlength="80" placeholder="Option B" aria-label="Option B">`
            : `<input class="pk-input" data-text maxlength="120" placeholder="…most likely to (e.g. sing in the shower)" aria-label="Most likely to">`
        }
        <div class="pk-error" data-err></div>
        <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-add>Add prompt</button>
        <div class="ml-custom-list" data-list></div>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>Done</button>`,
      onMount(sheet, close) {
        const listEl = sheet.querySelector('[data-list]');
        const paint = () => {
          listEl.innerHTML = list.length
            ? list
                .map(
                  (c, i) => `<div class="ml-custom-row"><span class="ml-custom-mode">${c.mode === 'wyr' ? '🤔' : '👉'}</span><span class="ml-custom-text">${esc(customLabel(c))}</span>${
                    c.used ? '<span class="ml-custom-used">played</span>' : ''
                  }<button type="button" class="pk-player-remove" data-rm="${i}" aria-label="Remove">✕</button></div>`
                )
                .join('')
            : '<div class="pk-hint">No custom prompts yet.</div>';
          listEl.querySelectorAll('[data-rm]').forEach((b) =>
            b.addEventListener('click', () => {
              list.splice(Number(b.dataset.rm), 1);
              paint();
              onChange && onChange();
            })
          );
        };
        paint();
        sheet.querySelector('[data-add]').addEventListener('click', () => {
          const err = sheet.querySelector('[data-err]');
          const input = mode === 'wyr' ? { a: sheet.querySelector('[data-a]').value, b: sheet.querySelector('[data-b]').value } : sheet.querySelector('[data-text]').value;
          const out = Core().cleanCustom(input, mode);
          if (!out.ok) {
            err.textContent = out.reason;
            return;
          }
          err.textContent = '';
          list.push({ mode, prompt: out.prompt, used: false });
          sheet.querySelectorAll('input').forEach((inp) => (inp.value = ''));
          paint();
          onChange && onChange();
        });
        sheet.querySelector('[data-save]').addEventListener('click', close);
      },
    });
  }

  function openSettings(settings, opts) {
    const s = Object.assign({}, settings, { packs: (settings.packs || []).slice() });
    const K = Kit();
    const C = Core();
    const room = opts.context === 'room';
    const seg = (name, value, a, b) => K.segHtml(name, value, [[true, a], [false, b]]);
    K.openSheet({
      title: 'Game settings',
      bodyHtml: `
        <div class="pk-field">
          <div class="pk-field-label">Rounds</div>
          ${K.segHtml('rounds', s.rounds, C.ROUND_OPTIONS.map((r) => [r, r ? String(r) : 'Endless']))}
        </div>
        <button type="button" class="im-pack-row" data-packs>🗂️ Packs: <strong data-packs-n>${C.activePacks(s, lang()).length}</strong> <span class="im-chev">›</span></button>
        <details class="pk-advanced">
          <summary>Advanced</summary>
          <div class="pk-field">
            <div class="pk-field-label">Points</div>
            ${seg('scoring', s.scoring, 'On', 'Off')}
            <div class="pk-field-help">+1 for voting with the room (Most Likely) or guessing the majority (Would You Rather).</div>
          </div>
          <div class="pk-field">
            <div class="pk-field-label">Reveal</div>
            ${K.segHtml('reveal', s.reveal, [['names', 'Show names'], ['anon', 'Anonymous %']])}
            <div class="pk-field-help">Anonymous shows only the totals — never who voted for what. Most Likely points are off in anonymous rounds.</div>
          </div>
          <div class="pk-field">
            <div class="pk-field-label">Vote for yourself (Most Likely)</div>
            ${seg('selfVote', s.selfVote, 'Allowed', 'Not allowed')}
          </div>
          <div class="pk-field">
            <div class="pk-field-label">Defend yourself (Most Likely)</div>
            ${seg('defence', s.defence, 'On', 'Off')}
            <div class="pk-field-help">15 seconds for the crowned player to plead their case</div>
          </div>
          ${
            room
              ? ''
              : `<div class="pk-field">
            <div class="pk-field-label">Voting</div>
            ${K.segHtml('voting', s.voting, [['secret', 'Secret pass-around'], ['quick', 'Count of 3, point']])}
            <div class="pk-field-help">Quick: everyone points (or raises hands) on three and one person taps the count.</div>
          </div>`
          }
          ${
            opts.customs
              ? `<button type="button" class="im-pack-row" data-customs>✍️ Custom prompts: <strong data-customs-n>${opts.customs.length}</strong> <span class="im-chev">›</span></button>`
              : ''
          }
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>Done</button>`,
      onMount(sheet, close) {
        K.wireSegs(sheet, s);
        sheet.querySelector('[data-packs]').addEventListener('click', () =>
          openPackPicker(s, (ids) => {
            s.packs = ids;
            sheet.querySelector('[data-packs-n]').textContent = String(C.activePacks(s, lang()).length);
          })
        );
        sheet.querySelector('[data-customs]')?.addEventListener('click', () =>
          openCustoms(opts.customs, s.mode, () => {
            const n = sheet.querySelector('[data-customs-n]');
            if (n) n.textContent = String(opts.customs.length);
          })
        );
        sheet.querySelector('[data-save]').addEventListener('click', () => {
          close();
          opts.onSave(C.mergeSettings(s, lang()));
        });
      },
    });
  }

  // ---------------- shared views ----------------

  function langBtn() {
    return `<button type="button" class="ml-lang" data-lang-toggle aria-pressed="${both()}" aria-label="Show both languages">A/अ</button>`;
  }

  function wireLang(body, rerender) {
    body.querySelectorAll('[data-lang-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        toggleBoth();
        rerender();
      })
    );
  }

  function optionHtml(side, opt) {
    const l = Core().optionLines(opt, lang(), both());
    return `<span class="ml-opt-tag">${side.toUpperCase()}</span><span class="ml-opt-text">${esc(l.primary)}${l.secondary ? `<span class="ml-opt-sub">${esc(l.secondary)}</span>` : ''}</span>`;
  }

  function promptHtml(prompt, mode) {
    const C = Core();
    const tag = prompt && prompt.custom ? '<span class="ml-tag">Custom</span>' : '';
    if (mode === 'wyr') {
      return `<div class="ml-prompt ml-prompt--wyr">${langBtn()}${tag}
        <div class="ml-prompt-q">Would you rather…</div>
        <div class="ml-options">
          <div class="ml-opt ml-opt--a">${optionHtml('a', prompt.a)}</div>
          <div class="ml-or">or</div>
          <div class="ml-opt ml-opt--b">${optionHtml('b', prompt.b)}</div>
        </div>
      </div>`;
    }
    const l = C.promptLines(prompt, 'mlt', lang(), both());
    return `<div class="ml-prompt">${langBtn()}${tag}
      <div class="ml-prompt-q">${esc(l.primary)}</div>
      ${l.secondary ? `<div class="ml-prompt-sub">${esc(l.secondary)}</div>` : ''}
    </div>`;
  }

  /** Voting controls. draft = { target } or { pick, guess }. */
  function voteControlsHtml(mode) {
    if (mode === 'wyr') {
      return `<div class="ml-choose">
        <div class="pk-section">Your pick</div>
        <div class="ml-choices"><button type="button" class="ml-choice" data-pick="a">A</button><button type="button" class="ml-choice" data-pick="b">B</button></div>
        <div class="pk-section">Which side will most people pick?</div>
        <div class="ml-choices ml-choices--guess"><button type="button" class="ml-choice ml-choice--guess" data-guess="a">Most pick A</button><button type="button" class="ml-choice ml-choice--guess" data-guess="b">Most pick B</button></div>
      </div>`;
    }
    return '<div class="pk-section">Tap your vote</div><div data-picker></div>';
  }

  function wireVoteControls(root, mode, opts) {
    const draft = opts.draft;
    if (mode === 'wyr') {
      const paint = () => {
        root.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('is-on', b.dataset.pick === draft.pick));
        root.querySelectorAll('[data-guess]').forEach((b) => b.classList.toggle('is-on', b.dataset.guess === draft.guess));
        opts.onChange(!!(draft.pick && draft.guess));
      };
      root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => ((draft.pick = b.dataset.pick), paint())));
      root.querySelectorAll('[data-guess]').forEach((b) => b.addEventListener('click', () => ((draft.guess = b.dataset.guess), paint())));
      paint();
      return;
    }
    Kit().mountPicker(root.querySelector('[data-picker]'), {
      players: opts.players,
      exclude: opts.exclude || [],
      selected: draft.target ? [draft.target] : [],
      onPick: (ids) => {
        draft.target = ids[0];
        opts.onChange(!!draft.target);
      },
    });
    opts.onChange(!!draft.target);
  }

  function revealMltHtml(res, nm, prompt) {
    const C = Core();
    const ids = Object.keys(res.tally).sort((a, b) => res.tally[b] - res.tally[a] || nm(a).localeCompare(nm(b)));
    const max = Math.max(1, res.topVotes);
    const crowned = res.top.length
      ? `<div class="ml-crown"><span class="ml-crown-icon" aria-hidden="true">👑</span><span class="ml-crown-name">${esc(joinNames(res.top, nm))}</span>
         <span class="ml-badge">${esc(res.top.length > 1 ? 'Shared crown' : C.badgeFor(prompt))}</span>
         <span class="ml-crown-sub">${res.topVotes} of ${res.total} vote${res.total === 1 ? '' : 's'}</span></div>`
      : '<div class="ml-crown ml-crown--none">No votes this round</div>';
    const bars = ids
      .filter((id) => res.tally[id] > 0 || !res.anon)
      .map(
        (id) => `<div class="ml-bar-row${res.top.indexOf(id) >= 0 ? ' is-top' : ''}">
          <span class="ml-bar-name">${res.top.indexOf(id) >= 0 ? '👑 ' : ''}${esc(nm(id))}</span>
          <span class="ml-bar"><span class="ml-bar-fill" style="--w:${Math.round((res.tally[id] / max) * 100)}%"></span></span>
          <span class="ml-bar-count">${res.tally[id]}</span>
        </div>`
      )
      .join('');
    const who =
      res.votes && Object.keys(res.votes).length
        ? `<details class="ml-who"><summary>Who voted for whom</summary>${Object.keys(res.votes)
            .map((v) => `<div class="ml-who-row">${esc(nm(v))} → ${esc(nm(res.votes[v]))}</div>`)
            .join('')}</details>`
        : res.anon
          ? '<div class="pk-field-help">Anonymous — only the totals are shown.</div>'
          : '';
    return `<div class="ml-reveal">${crowned}<div class="ml-bars">${bars}</div>${who}</div>`;
  }

  function revealWyrHtml(res, nm, prompt) {
    const C = Core();
    const total = res.total || 0;
    const pa = total ? Math.round((res.counts.a / total) * 100) : 50;
    const pb = total ? 100 - pa : 50;
    const side = (s) => C.optionLines(prompt[s], lang(), false).primary;
    const names = (s) =>
      res.picks
        ? Object.keys(res.picks)
            .filter((id) => res.picks[id] === s)
            .map((id) => `<span class="ml-side-name">${esc(nm(id))}</span>`)
            .join('') || '<span class="ml-side-name is-empty">Nobody</span>'
        : '';
    const headline = res.majority ? 'Most would rather ' + side(res.majority) : total ? 'Split room!' : 'No votes this round';
    const predict = res.majority
      ? `${res.predictedRight} of ${total} guessed the majority${Object.keys(res.points || {}).length ? ' · +1 each' : ''}`
      : total
        ? 'No majority — nobody scores the prediction'
        : '';
    return `<div class="ml-reveal ml-reveal--wyr">
      <div class="ml-crown"><span class="ml-crown-icon" aria-hidden="true">${res.majority ? '🤔' : '⚖️'}</span><span class="ml-crown-name">${esc(headline)}</span><span class="ml-crown-sub">${esc(predict)}</span></div>
      <div class="ml-split" role="img" aria-label="A ${pa} percent, B ${pb} percent">
        <span class="ml-split-a" style="--w:${pa}%"><strong>A</strong> ${pa}%</span>
        <span class="ml-split-b" style="--w:${pb}%"><strong>B</strong> ${pb}%</span>
      </div>
      <div class="ml-sides">
        <div class="ml-side ml-side--a"><div class="ml-side-label">A · ${res.counts.a}</div><div class="ml-side-opt">${esc(side('a'))}</div>${names('a')}</div>
        <div class="ml-side ml-side--b"><div class="ml-side-label">B · ${res.counts.b}</div><div class="ml-side-opt">${esc(side('b'))}</div>${names('b')}</div>
      </div>
      ${res.anon ? '<div class="pk-field-help">Anonymous — only the split is shown.</div>' : ''}
    </div>`;
  }

  function revealHtml(round, nm) {
    return round.mode === 'wyr' ? revealWyrHtml(round.result, nm, round.prompt) : revealMltHtml(round.result, nm, round.prompt);
  }

  /** Bars grow in after paint. */
  function animateReveal(body) {
    requestAnimationFrame(() => requestAnimationFrame(() => body.querySelectorAll('.ml-reveal').forEach((el) => el.classList.add('is-in'))));
  }

  function revealAnnouncement(round, nm) {
    const res = round.result;
    if (round.mode === 'wyr') {
      const side = res.majority ? Core().optionLines(round.prompt[res.majority], lang(), false).primary : '';
      return res.majority ? { icon: '🤔', title: 'Most would rather…', sub: side } : { icon: '⚖️', title: res.total ? 'Split room!' : 'No votes' };
    }
    return res.top.length
      ? { icon: '👑', title: joinNames(res.top, nm) + '!', sub: res.top.length > 1 ? 'Shared crown' : Core().badgeFor(round.prompt) }
      : { icon: '🤷', title: 'No votes this round' };
  }

  function defenceHtml(round, nm) {
    return `<div class="ml-defence">
      <div class="ml-defence-title">Defend yourself!</div>
      <div class="ml-defence-hi">अपनी सफ़ाई दो!</div>
      <div class="pk-sub">${esc(joinNames(round.result.top, nm))} — you have 15 seconds to make your case.</div>
      <div class="pk-timer" data-timer></div>
    </div>`;
  }

  function verdictHtml(session, players, nm) {
    const C = Core();
    const rows = C.verdict(session, players.map((p) => p.id))
      .sort((a, b) => b.crowns - a.crowns || nm(a.id).localeCompare(nm(b.id)))
      .map(
        (v) => `<div class="ml-verdict-row${v.best ? '' : ' is-clean'}">
          <span class="ml-verdict-name">${esc(nm(v.id))}${v.crowns ? ` <em>👑×${v.crowns}</em>` : ''}</span>
          <span class="ml-verdict-text">${v.best ? esc(mltShort(v.best)) + ` <em>(${v.best.votes}/${v.best.total})</em>` : 'Clean record 😇'}</span>
        </div>`
      )
      .join('');
    return `<div class="ml-final-block"><div class="pk-section">Room’s verdict</div><div class="ml-verdict">${rows}</div></div>`;
  }

  function highlightsHtml(session, players, nm, scores, scoring) {
    const C = Core();
    const h = C.highlights(session, players.map((p) => p.id), scoring ? scores : {});
    const pair = (x) => (x && x.a && x.b ? `${esc(x.a.en)} vs ${esc(x.b.en)} (${x.counts.a}–${x.counts.b})` : '');
    const rows = [
      h.inSync.ids.length ? ['🤝', 'Most in sync', joinNames(h.inSync.ids, nm) + ' · with the majority ' + h.inSync.n + '×'] : null,
      h.rebel.ids.length ? ['😎', 'Rebel of the room', joinNames(h.rebel.ids, nm) + ' · in the minority ' + h.rebel.n + '×'] : null,
      scoring && h.predictor.ids.length ? ['🔮', 'Best predictor', joinNames(h.predictor.ids, nm) + ' · ' + h.predictor.n + ' pts'] : null,
      h.closest ? ['⚖️', 'Closest call', pair(h.closest)] : null,
      h.unanimous ? ['📣', 'Most agreed', pair(h.unanimous)] : null,
    ].filter(Boolean);
    if (!rows.length) return '';
    return `<div class="ml-final-block"><div class="pk-section">Highlights</div><div class="ml-highs">${rows
      .map((r) => `<div class="ml-high"><span class="ml-high-icon" aria-hidden="true">${r[0]}</span><span class="ml-high-label">${r[1]}</span><span class="ml-high-text">${r[2]}</span></div>`)
      .join('')}</div></div>`;
  }

  function finalHtml(session, players, nm, scores, s) {
    const hasMlt = (session.history || []).some((h) => h.mode === 'mlt');
    const hasWyr = (session.history || []).some((h) => h.mode === 'wyr');
    return `<div class="ml-final">
      <div class="pk-result-glyph" aria-hidden="true">${hasMlt ? '👑' : '🤔'}</div>
      <div class="pk-result-title">${session.rounds} round${session.rounds === 1 ? '' : 's'} played</div>
      ${hasMlt ? verdictHtml(session, players, nm) : ''}
      ${hasWyr ? highlightsHtml(session, players, nm, scores, s.scoring) : ''}
      ${s.scoring ? `<div class="pk-section">Points</div>${Kit().scoreboardHtml(players, scores)}` : ''}
    </div>`;
  }

  function finalShareLine(session, players, nm, scores) {
    const C = Core();
    const hasMlt = (session.history || []).some((h) => h.mode === 'mlt');
    if (hasMlt) {
      const v = C.verdict(session, players.map((p) => p.id))
        .filter((x) => x.best)
        .sort((a, b) => b.crowns - a.crowns || b.best.share - a.best.share)[0];
      if (v) return 'Room’s verdict: ' + nm(v.id) + ' — ' + mltShort(v.best) + ' 👑';
    }
    const h = C.highlights(session, players.map((p) => p.id), scores);
    const parts = [];
    if (h.inSync.ids.length) parts.push('Most in sync: ' + joinNames(h.inSync.ids, nm));
    if (h.rebel.ids.length) parts.push('Rebel of the room: ' + joinNames(h.rebel.ids, nm));
    if (!parts.length && h.closest) parts.push('Closest call: ' + h.closest.a.en + ' vs ' + h.closest.b.en);
    return (parts.join(' · ') || 'We played Would You Rather') + ' 🤔';
  }

  function roundShareLine(round, nm) {
    const res = round.result;
    if (round.mode === 'wyr') {
      const total = res.total || 0;
      if (!total) return 'Would you rather ' + round.prompt.a.en + ' or ' + round.prompt.b.en + '? 🤔';
      const side = res.majority || 'a';
      const pct = Math.round((res.counts[side] / total) * 100);
      return pct + '% of us would rather ' + round.prompt[side].en + ' 🤔';
    }
    return res.top.length ? joinNames(res.top, nm) + ' — ' + mltShort(round.prompt) + ' 👑' : mltShort(round.prompt) + '? The room couldn’t decide';
  }

  function share(line) {
    Kit().shareLine(GAME, LABEL, line);
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
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: 'Party', confirmLeave: () => false });
    renderHome(shell);
  }

  function renderHome(shell) {
    const body = shell.render(
      Kit().homeHtml({
        game: GAME,
        icon: '👉',
        title: 'Most Likely To?',
        sub: '2–16 players · vote on your friends, or pick a side',
        howToHtml: howToCardHtml(),
      })
    );
    body.querySelector('[data-mode="pass"]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-mode="room"]').addEventListener('click', () => Kit().closeThen(shell, () => startRoom({})));
    body.querySelector('[data-mode="join"]').addEventListener('click', () =>
      Kit().closeThen(shell, () => Kit().openJoinSheet((code) => openRoom(code, { join: true })))
    );
  }

  function modeCardsHtml(mode) {
    const card = (id, icon, title, sub) =>
      `<button type="button" class="ml-mode${mode === id ? ' is-on' : ''}" data-mode-pick="${id}" aria-pressed="${mode === id}">
        <span class="ml-mode-icon" aria-hidden="true">${icon}</span><span class="ml-mode-title">${title}</span><span class="ml-mode-sub">${sub}</span></button>`;
    return `<div class="ml-modes">${card('mlt', '👉', 'Most Likely To', 'Vote for the friend who fits · 3+')}${card('wyr', '🤔', 'Would You Rather', 'Pick a side, guess the room · 2+')}</div>`;
  }

  // ======================= PASS & PLAY =======================

  function renderPassSetup(shell) {
    const settings = loadSettings('pass');
    let names = loadNames();
    const body = shell.render(`<div class="pk-page">
      <div class="pk-setup-head">
        <div class="pk-title">Pick a game</div>
        <button type="button" class="pk-icon-btn" data-settings aria-label="Game settings">⚙︎</button>
      </div>
      <div data-modes></div>
      <div class="pk-section">Who’s playing?</div>
      <div data-editor></div>
      <div class="pk-meta" data-meta></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start>Start</button>
    </div>`);
    let editor = null;
    const rawNames = () => Array.from(body.querySelectorAll('[data-pk-name]')).map((i) => i.value);
    const paintMeta = () => {
      const meta = body.querySelector('[data-meta]');
      if (meta) meta.textContent = modeLine(settings, 'pass');
    };
    const mountEditor = () => {
      editor = Kit().mountPlayerEditor(body.querySelector('[data-editor]'), {
        names,
        min: Core().minPlayers(settings),
        max: Core().MAX_PLAYERS,
      });
    };
    const paintModes = () => {
      const el = body.querySelector('[data-modes]');
      el.innerHTML = modeCardsHtml(settings.mode);
      el.querySelectorAll('[data-mode-pick]').forEach((b) =>
        b.addEventListener('click', () => {
          names = rawNames();
          settings.mode = b.dataset.modePick;
          saveSettings('pass', settings);
          paintModes();
          mountEditor();
          paintMeta();
        })
      );
    };
    paintModes();
    mountEditor();
    paintMeta();
    body.querySelector('[data-settings]').addEventListener('click', () =>
      openSettings(settings, {
        context: 'pass',
        customs: passCustoms,
        onSave: (s) => {
          Object.assign(settings, s);
          saveSettings('pass', settings);
          paintMeta();
        },
      })
    );
    body.querySelector('[data-start]').addEventListener('click', () => {
      const list = editor.list();
      saveNames(list);
      const session = {
        players: list.map((name, i) => ({ id: 'p' + i, name })),
        scores: {},
        roundNo: 0,
        settings: Core().mergeSettings(settings, lang()),
        deck: null,
        customs: passCustoms,
        stats: Core().newSession(),
      };
      session.players.forEach((p) => (session.scores[p.id] = 0));
      startPassRound(shell, session);
    });
  }

  function nameOf(session, id) {
    const p = session.players.find((x) => x.id === id);
    return p ? p.name : 'Someone';
  }

  function startPassRound(shell, session, skip) {
    const C = Core();
    const out = C.nextPrompt(session.deck, session.settings, lang(), Math.random, session.customs);
    session.deck = out.state;
    if (!skip) session.roundNo += 1;
    const key = out.prompt && out.prompt.key;
    if (key && key.indexOf('c:') === 0 && session.customs[Number(key.slice(2))]) session.customs[Number(key.slice(2))].used = true;
    session.round = {
      pub: C.createRound(session.players.map((p) => p.id), out.prompt, session.settings, session.roundNo),
      hidden: C.createHidden(),
      recorded: false,
    };
    const s = session.settings;
    shell.setSubtitle(C.MODE_LABELS[s.mode] + ' · Round ' + session.roundNo + (s.rounds ? ' of ' + s.rounds : ''));
    renderPassPrompt(shell, session);
  }

  function renderPassPrompt(shell, session) {
    const r = session.round.pub;
    const s = session.settings;
    const quick = s.voting === 'quick';
    const body = shell.render(`<div class="pk-page">
      <div class="pk-progress">Round ${session.roundNo}${s.rounds ? ' of ' + s.rounds : ''}</div>
      ${promptHtml(r.prompt, r.mode)}
      <div class="pk-sub">${
        quick
          ? r.mode === 'wyr'
            ? 'On three, everyone raises a hand for A or B.'
            : 'On three, everyone points at a player.'
          : 'Everyone votes in secret — pass the phone around.'
      }</div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${quick ? '1… 2… 3!' : 'Start secret vote'}</button>
      <button type="button" class="pk-link" data-skip>Skip this one</button>
    </div>`);
    wireLang(body, () => renderPassPrompt(shell, session));
    body.querySelector('[data-skip]').addEventListener('click', () => startPassRound(shell, session, true));
    body.querySelector('[data-go]').addEventListener('click', () => (quick ? renderPassQuick(shell, session) : renderPassVote(shell, session, 0)));
  }

  function renderPassVote(shell, session, index) {
    const r = session.round.pub;
    if (r.phase !== 'vote') return renderPassReveal(shell, session);
    const id = r.players[index];
    if (!id) {
      Core().applyAction(r, session.round.hidden, session.settings, { type: 'close' });
      return renderPassReveal(shell, session);
    }
    const draft = {};
    const players = session.players.map((p) => ({ id: p.id, name: p.name }));
    const body = shell.render(`<div class="pk-page">
      <div class="pk-progress">Vote ${index + 1} of ${r.players.length}</div>
      <div data-vote></div>
    </div>`);
    Kit().mountPassVote(body.querySelector('[data-vote]'), {
      name: nameOf(session, id),
      bodyHtml: `<div class="ml-vote-face">${promptHtml(r.prompt, r.mode)}${voteControlsHtml(r.mode)}</div>`,
      doneLabel: index === r.players.length - 1 ? 'Lock vote & reveal' : 'Lock vote & pass',
      onMount(face, setReady) {
        face.querySelectorAll('[data-lang-toggle]').forEach((b) => (b.hidden = true));
        wireVoteControls(face, r.mode, {
          draft,
          players,
          exclude: session.settings.selfVote ? [] : [id],
          onChange: setReady,
        });
      },
      onDone() {
        const action = r.mode === 'wyr' ? { type: 'vote', id, pick: draft.pick, guess: draft.guess } : { type: 'vote', id, target: draft.target };
        Core().applyAction(r, session.round.hidden, session.settings, action);
        renderPassVote(shell, session, index + 1);
      },
    });
  }

  function renderPassQuick(shell, session) {
    const r = session.round.pub;
    const nm = (id) => nameOf(session, id);
    const counts = {};
    const picks = {};
    r.players.forEach((id) => (counts[id] = 0));
    const body = shell.render(`<div class="pk-page">
      ${promptHtml(r.prompt, r.mode)}
      <div class="pk-section">${r.mode === 'wyr' ? 'Tap A or B for each player' : 'How many pointed at each player?'}</div>
      <div class="ml-quick">${r.players
        .map((id) =>
          r.mode === 'wyr'
            ? `<div class="ml-quick-row"><span class="ml-quick-name">${esc(nm(id))}</span><span class="ml-quick-ab"><button type="button" class="ml-choice ml-choice--sm" data-q="${esc(id)}" data-side="a">A</button><button type="button" class="ml-choice ml-choice--sm" data-q="${esc(id)}" data-side="b">B</button></span></div>`
            : `<div class="ml-quick-row"><span class="ml-quick-name">${esc(nm(id))}</span><span class="ml-stepper"><button type="button" data-dec="${esc(id)}" aria-label="One less">−</button><strong data-n="${esc(id)}">0</strong><button type="button" data-inc="${esc(id)}" aria-label="One more">+</button></span></div>`
        )
        .join('')}</div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-reveal disabled>Reveal</button>
    </div>`);
    wireLang(body, () => renderPassQuick(shell, session));
    const btn = body.querySelector('[data-reveal]');
    const total = () => Object.keys(counts).reduce((n, id) => n + counts[id], 0);
    body.querySelectorAll('[data-inc],[data-dec]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.inc || b.dataset.dec;
        counts[id] = Math.max(0, Math.min(r.players.length, counts[id] + (b.dataset.inc ? 1 : -1)));
        body.querySelector(`[data-n="${CSS.escape(id)}"]`).textContent = String(counts[id]);
        btn.disabled = total() === 0;
      })
    );
    body.querySelectorAll('[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        picks[b.dataset.q] = b.dataset.side;
        body.querySelectorAll(`[data-q="${CSS.escape(b.dataset.q)}"]`).forEach((x) => x.classList.toggle('is-on', x.dataset.side === b.dataset.side));
        btn.disabled = !Object.keys(picks).length;
      })
    );
    btn.addEventListener('click', () => {
      Core().applyAction(r, session.round.hidden, session.settings, r.mode === 'wyr' ? { type: 'quick', picks } : { type: 'quick', tally: counts });
      renderPassReveal(shell, session);
    });
  }

  function recordPass(session) {
    const round = session.round;
    if (round.recorded || !round.pub.result) return;
    round.recorded = true;
    Core().recordRound(session.stats, round.pub);
    const pts = round.pub.result.points || {};
    Object.keys(pts).forEach((id) => (session.scores[id] = (session.scores[id] || 0) + pts[id]));
  }

  async function renderPassReveal(shell, session, skipAnim) {
    const r = session.round.pub;
    const nm = (id) => nameOf(session, id);
    recordPass(session);
    if (!skipAnim) {
      if (r.result.top && r.result.top.length) Kit().ding();
      await Kit().bigReveal(Object.assign({ host: shell.el }, revealAnnouncement(r, nm)));
    }
    if (r.phase === 'defence') {
      const body = shell.render(`<div class="pk-page">
        ${promptHtml(r.prompt, r.mode)}
        ${revealHtml(r, nm)}
        ${defenceHtml(r, nm)}
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-done>Case closed</button>
      </div>`);
      animateReveal(body);
      wireLang(body, () => renderPassReveal(shell, session, true));
      const finish = () => {
        if (clock) clock.stop();
        Core().applyAction(r, session.round.hidden, session.settings, { type: 'endDefence' });
        renderPassResult(shell, session);
      };
      const clock = Kit().countdown(body.querySelector('[data-timer]'), {
        seconds: Core().DEFENCE_SEC,
        onDone: () => {
          Kit().buzz();
          if (session.round.pub.phase === 'defence' && body.isConnected) finish();
        },
      });
      body.querySelector('[data-done]').addEventListener('click', finish);
      return;
    }
    renderPassResult(shell, session);
  }

  function renderPassResult(shell, session) {
    const r = session.round.pub;
    const s = session.settings;
    const nm = (id) => nameOf(session, id);
    const last = Core().isOver(s, session.roundNo);
    const body = shell.render(`<div class="pk-page">
      ${promptHtml(r.prompt, r.mode)}
      ${revealHtml(r, nm)}
      ${s.scoring ? `<div class="pk-section">Points</div>${Kit().scoreboardHtml(session.players, session.scores, r.result.points)}` : ''}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${last ? 'See the verdict' : 'Next round'}</button>
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share>Share</button>
        ${last ? '' : '<button type="button" class="pk-btn pk-btn--ghost" data-end>End game</button>'}
      </div>
    </div>`);
    animateReveal(body);
    wireLang(body, () => renderPassResult(shell, session));
    body.querySelector('[data-share]').addEventListener('click', () => share(roundShareLine(r, nm)));
    body.querySelector('[data-end]')?.addEventListener('click', () => renderPassFinal(shell, session));
    body.querySelector('[data-next]').addEventListener('click', () => (last ? renderPassFinal(shell, session) : startPassRound(shell, session)));
  }

  function renderPassFinal(shell, session) {
    const nm = (id) => nameOf(session, id);
    shell.setSubtitle('Final');
    const body = shell.render(`<div class="pk-page">
      ${finalHtml(session.stats, session.players, nm, session.scores, session.settings)}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>Play again</button>
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share>Share</button>
        <button type="button" class="pk-btn pk-btn--ghost" data-setup>Players &amp; settings</button>
      </div>
    </div>`);
    try {
      if (typeof gameFeedback === 'function') gameFeedback('win');
    } catch (e) {}
    body.querySelector('[data-share]').addEventListener('click', () => share(finalShareLine(session.stats, session.players, nm, session.scores)));
    body.querySelector('[data-setup]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-again]').addEventListener('click', () => {
      session.players.forEach((p) => (session.scores[p.id] = 0));
      session.roundNo = 0;
      session.stats = Core().newSession();
      startPassRound(shell, session);
    });
  }

  // ======================= ROOM =======================

  function customsFor(code) {
    if (!roomCustoms[code]) roomCustoms[code] = [];
    return roomCustoms[code];
  }

  function settingsOf(ctrl) {
    return Core().mergeSettings(ctrl.view.pub.settings, lang());
  }

  function startRoom(o) {
    Kit().createRoom({
      game: GAME,
      label: LABEL,
      settings: loadSettings('room'),
      chat: o && o.chat,
      open: openRoom,
    });
  }

  /**
   * The host's phone decides when to slot in one of its custom prompts and sends only that one
   * prompt with start/next. Spread so every custom gets played before the game ends.
   */
  function hostCustomArgs(ctrl, op) {
    if (!ctrl.isHost()) return null;
    const s = settingsOf(ctrl);
    const list = customsFor(ctrl.view.code);
    const unused = list.filter((c) => !c.used && c.mode === s.mode);
    if (!unused.length) return null;
    const pub = ctrl.view.pub;
    const fresh = op === 'start' && (pub.status === 'lobby' || pub.over);
    const played = fresh ? 0 : Number(pub.roundNo) || 0;
    const left = s.rounds ? Math.max(1, s.rounds - played) : Infinity;
    const chance = Math.max(0.34, unused.length / left);
    if (Math.random() >= chance) return null;
    const c = unused[0];
    const custom = c.mode === 'wyr' ? { a: c.prompt.a.en, b: c.prompt.b.en } : c.prompt.en;
    return { args: { custom }, onDone: (ok) => ok && (c.used = true) };
  }

  function openRoom(code, opts) {
    const o = opts || {};
    return Kit().openRoomScreen({
      game: GAME,
      label: LABEL,
      code,
      join: !!o.join,
      min: Core().MIN_PLAYERS,
      max: Core().MAX_PLAYERS,
      hydrate: (st) => {
        Core().hydrateRound(st);
        st.session = Core().hydrateSession(st.session);
        return st;
      },
      lobbySummary: (ctrl) => modeLine(settingsOf(ctrl), 'room'),
      canStart: (ctrl, players) => {
        const min = Core().minPlayers(settingsOf(ctrl));
        return players.length < min ? { ok: false, label: 'Need ' + (min - players.length) + ' more to start' } : { ok: true, label: 'Start' };
      },
      openSettings: (ctrl) =>
        openSettings(settingsOf(ctrl), {
          context: 'room',
          customs: customsFor(code),
          onSave: (next) => {
            saveSettings('room', next);
            ctrl.act('settings', { settings: next });
          },
        }),
      onLobbyMount: (ctrl, body) => {
        if (!ctrl.isHost()) return;
        const row = body.querySelector('[data-settings]');
        if (!row) return;
        const pick = document.createElement('div');
        pick.innerHTML = modeCardsHtml(settingsOf(ctrl).mode);
        row.before(pick);
        pick.querySelectorAll('[data-mode-pick]').forEach((b) =>
          b.addEventListener('click', () => {
            const next = Object.assign({}, settingsOf(ctrl), { mode: b.dataset.modePick });
            saveSettings('room', next);
            ctrl.act('settings', { settings: next });
          })
        );
      },
      startArgs: hostCustomArgs,
      onState: onRoomState,
      renderPhase: renderRoomPhase,
    });
  }

  function onRoomState(ctrl, st, prev) {
    if (!prev || prev.n !== st.n || prev.phase !== 'vote' || st.phase === 'vote' || !st.result) return;
    if (st.result.top && st.result.top.length) Kit().ding();
    Kit().bigReveal(Object.assign({ host: ctrl.shell.el }, revealAnnouncement(st, ctrl.name)));
  }

  function myVoteLine(st, secret, nm) {
    if (!secret) return '';
    if (st.mode === 'wyr') return `You picked <strong>${secret.pick === 'a' ? 'A' : 'B'}</strong> and guessed most pick <strong>${secret.guess === 'a' ? 'A' : 'B'}</strong>`;
    return `You voted <strong>${esc(nm(secret.target))}</strong>`;
  }

  function renderRoomPhase(ctrl, st) {
    const K = Kit();
    const me = ctrl.uid;
    const pub = ctrl.view.pub;
    const nm = ctrl.name;
    const s = settingsOf(ctrl);
    const view = ctrl.view;
    const secret = view.secret && Number(view.secret.roundNo) === Number(pub.roundNo) ? view.secret : null;
    const inRound = st.players.indexOf(me) >= 0;
    ctrl.shell.setSubtitle('Room ' + view.code + ' · Round ' + pub.roundNo + (s.rounds ? ' of ' + s.rounds : ''));
    const rerender = () => renderRoomPhase(ctrl, st);
    const timed = st.phase === 'vote' || st.phase === 'defence';
    const top = `${ctrl.hostBar(timed)}${ctrl.pausedNote()}`;

    if (st.phase === 'vote') {
      if (!view.mlDraft || view.mlDraft.n !== st.n) view.mlDraft = { n: st.n };
      const choosing = inRound && (!secret || view.mlChange === st.n);
      if (choosing) {
        const body = ctrl.render(`<div class="pk-page">${top}
          <div class="pk-progress">${st.voted.length}/${st.players.length} voted · <span class="pk-timer pk-timer--inline" data-timer></span></div>
          ${promptHtml(st.prompt, st.mode)}
          ${voteControlsHtml(st.mode)}
          <div class="pk-error" data-err></div>
          <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-lock disabled>Lock my vote</button>
          <div class="pk-field-help">Your vote stays secret until everyone’s in.</div>
        </div>`);
        ctrl.wire(body);
        wireLang(body, rerender);
        const lock = body.querySelector('[data-lock]');
        wireVoteControls(body, st.mode, {
          draft: view.mlDraft,
          players: st.players.map((id) => ({ id, name: nm(id) })),
          exclude: s.selfVote ? [] : [me],
          onChange: (ok) => (lock.disabled = !ok),
        });
        lock.addEventListener('click', async () => {
          const d = view.mlDraft;
          const out = await ctrl.act('vote', st.mode === 'wyr' ? { pick: d.pick, guess: d.guess } : { target: d.target }, body.querySelector('[data-err]'));
          if (out) view.mlChange = null;
        });
        return;
      }
      const body = ctrl.render(`<div class="pk-page">${top}
        ${promptHtml(st.prompt, st.mode)}
        <div class="ml-voted">
          ${inRound ? `<div class="ml-voted-mine">✓ Vote locked · ${myVoteLine(st, secret, nm)} <span class="ml-private">only you can see this</span></div>` : '<div class="pk-sub">You’ll vote from the next round.</div>'}
          <div class="pk-sub">${st.voted.length}/${st.players.length} voted</div>
          <div class="ml-voted-list">${st.players.map((id) => `<span class="ml-voted-chip${st.voted.indexOf(id) >= 0 ? ' is-in' : ''}">${esc(nm(id))}</span>`).join('')}</div>
          <div class="pk-timer" data-timer></div>
        </div>
        ${inRound ? '<button type="button" class="pk-link" data-change>Change my vote</button>' : ''}
        ${ctrl.isHost() ? `<button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-reveal ${st.voted.length ? '' : 'disabled'}>Reveal now</button>` : ''}
      </div>`);
      ctrl.wire(body);
      wireLang(body, rerender);
      body.querySelector('[data-change]')?.addEventListener('click', () => {
        view.mlChange = st.n;
        rerender();
      });
      body.querySelector('[data-reveal]')?.addEventListener('click', () => ctrl.act('revealNow'));
      return;
    }

    if (st.phase === 'defence' && st.result) {
      const canSkip = ctrl.isHost() || st.result.top.indexOf(me) >= 0;
      const body = ctrl.render(`<div class="pk-page">${top}
        ${promptHtml(st.prompt, st.mode)}
        ${revealHtml(st, nm)}
        ${defenceHtml(st, nm)}
        ${canSkip ? '<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-done>Case closed</button>' : ''}
      </div>`);
      ctrl.wire(body);
      wireLang(body, rerender);
      animateReveal(body);
      body.querySelector('[data-done]')?.addEventListener('click', () => ctrl.act('endDefence'));
      return;
    }

    if (st.phase === 'result' && st.result) {
      const players = ctrl.players().map((p) => ({ id: p.id, name: p.name }));
      const over = !!pub.over;
      const body = ctrl.render(`<div class="pk-page">
        ${promptHtml(st.prompt, st.mode)}
        ${revealHtml(st, nm)}
        ${
          over
            ? finalHtml(st.session, players, nm, pub.scores, s)
            : s.scoring
              ? `<div class="pk-section">Points</div>${K.scoreboardHtml(players, pub.scores, st.result.points)}`
              : ''
        }
        ${K.roomResultActions(ctrl, {
          nextLabel: over ? 'Play again' : 'Next round',
          waitLabel: over ? 'Waiting for the host to start a new game…' : 'Waiting for the host to start the next round…',
        })}
        ${!over && ctrl.isHost() ? '<button type="button" class="pk-link" data-finish>End game &amp; see the verdict</button>' : ''}
      </div>`);
      wireLang(body, rerender);
      animateReveal(body);
      K.wireRoomResultActions(ctrl, body, {
        nextOp: over ? 'start' : 'next',
        onShare: () => share(over ? finalShareLine(st.session, players, nm, pub.scores) : roundShareLine(st, nm)),
      });
      body.querySelector('[data-finish]')?.addEventListener('click', () => ctrl.act('finish'));
      if (over && view.celebrated !== pub.roundNo) {
        view.celebrated = pub.roundNo;
        try {
          if (typeof gameFeedback === 'function') gameFeedback('win');
        } catch (e) {}
      }
    }
  }

  // ---------------- registration ----------------

  if (window.PartyKit) PartyKit.registerPartyGame(GAME, { label: LABEL, openRoom });
  const launch = window.PartyKit ? PartyKit.withGameData(GAME, open) : open;

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'mostlikely',
      name: LABEL,
      desc: 'Most Likely To + Would You Rather — secret votes, big reveals',
      icon: '👉',
      gameType: 'multiplayer',
      genre: 'party',
      ratingKey: null,
      dangal: true,
      chat1v1: false,
      chatGroup: true,
      selfChat: false,
      order: 23,
      meta: {
        kit: 'party-kit.js (Pass & Play + Room)',
        modes: 'Most Likely To · Would You Rather (one game id)',
        voting: 'party_room → server-lib/party-deal.js; votes stay server-side until reveal; anonymous = tallies only',
      },
      launch,
    });
  }

  window.openMostLikelyGame = launch;
})();
