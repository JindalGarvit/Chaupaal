/**
 * Dangal Assist (P16) — the deterministic layer behind every light-AI feature. Works with AI off;
 * when AI is on, server-lib/dangal-ai.js uses these same facts to ground (and validate) the model.
 *
 *   CATALOG / searchGames / resolveGame   Khoj + intents: every roster game by name, alias or need
 *                                         ("poker with friends", "daily word game"); retired ids
 *   recommend(ctx)                        Manch + Party Hub suggestions with plain reasons
 *   FAQ / answerRules / rulesPassages     "Ask about the rules": curated FAQ (≥5 per game) → keyword
 *                                         search over the P1 rulebook → "Not covered by these rules"
 *   TIPS / pickTip / numbersGrounded      post-game tips (≥10 per game) built only from match stats
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DangalAssist = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  function Rules() {
    if (typeof module === 'object' && module.exports && typeof require === 'function') return require('./dangal-rules.js');
    return (root && root.DangalRules) || null;
  }

  // ---------------------------------------------------------------- catalog

  /**
   * Roster (registry ids). min/max players · solo = made for one · bots = practice vs a bot ·
   * together = great in one room (Pass & Play / one screen) · remote = separate phones ·
   * minutes [typical, long] · adult = chip tables are 18+ · party = Party Hub title.
   */
  const CATALOG = [
    { id: 'tiptap', name: 'Tip Tap', min: 1, max: 1, solo: true, minutes: [3, 5], daily: true, keys: ['match 3', 'match three', 'puzzle', 'swap tiles', 'casual'] },
    { id: 'brickbreaker', name: 'Brick Breaker', min: 1, max: 1, solo: true, minutes: [3, 8], daily: true, keys: ['breakout', 'arcade', 'paddle', 'ball', 'bricks'] },
    { id: 'ankjod', name: 'Kakuro', min: 1, max: 1, solo: true, minutes: [5, 20], daily: true, keys: ['kakuro', 'number puzzle', 'sums', 'maths puzzle', 'math puzzle', 'cross sums', 'logic puzzle', 'daily puzzle'] },
    { id: 'wordguess', name: 'Shabd Five', min: 1, max: 1, solo: true, minutes: [3, 5], daily: true, keys: ['shabd', 'word game', 'daily word', 'daily word game', 'five letter', '5 letter word', 'word puzzle', 'guess the word'] },
    { id: 'chess', name: 'Chess', min: 2, max: 2, bots: true, together: true, remote: true, minutes: [10, 30], keys: ['chess', 'checkmate', 'chess960', 'board game', 'strategy'] },
    { id: 'ttt', name: 'Tic-Tac-Toe', min: 2, max: 2, bots: true, together: true, remote: true, minutes: [2, 5], keys: ['tic tac toe', 'noughts and crosses', 'xo', 'x and o', 'ultimate tic tac toe'] },
    { id: 'snakes', name: 'Snakes & Ladders', min: 2, max: 6, bots: true, together: true, remote: true, minutes: [10, 15], keys: ['snakes and ladders', 'snakes ladders', 'dice', 'board game', 'moksha'] },
    { id: 'ludo', name: 'Ludo', min: 2, max: 4, bots: true, together: true, remote: true, minutes: [15, 30], keys: ['ludo', 'board game', 'dice', 'tokens', 'pachisi'] },
    { id: 'uno', name: 'Oh No!', min: 2, max: 10, bots: true, remote: true, minutes: [10, 20], keys: ['oh no', 'shedding card game', 'colour card game', 'color card game', 'card game', 'draw two', 'wild card'] },
    { id: 'scribble', name: 'Scribble', min: 2, max: 12, remote: true, minutes: [10, 20], keys: ['draw and guess', 'drawing game', 'doodle', 'sketch', 'draw'] },
    { id: 'quiz', name: 'Quiz Muqabala', min: 1, max: 50, bots: true, remote: true, together: true, minutes: [5, 10], daily: true, keys: ['quiz', 'trivia', 'general knowledge', 'daily quiz', 'questions', 'muqabala'] },
    { id: 'carrom', name: 'Carrom', min: 2, max: 4, bots: true, together: true, remote: true, minutes: [10, 25], keys: ['carrom', 'striker', 'board game', 'flick'] },
    { id: 'poker', name: 'Texas Hold’em', min: 2, max: 9, bots: true, remote: true, minutes: [20, 45], adult: true, keys: ['poker', 'texas holdem', 'texas hold em', 'holdem', 'hold em', 'cards with friends', 'card game'] },
    { id: 'teenpatti', name: 'Teen Patti', min: 3, max: 7, bots: true, remote: true, minutes: [10, 20], adult: true, keys: ['teen patti', '3 patti', 'three cards', 'flush', 'card game'] },
    { id: 'rummy', name: 'Rummy', min: 2, max: 6, bots: true, remote: true, minutes: [10, 25], keys: ['rummy', 'gin rummy', '13 card rummy', 'card game', 'melds'] },
    { id: 'bluff', name: 'Bluff', min: 3, max: 8, bots: true, together: true, remote: true, minutes: [10, 20], keys: ['bluff', 'cheat', 'i doubt it', 'card game', 'lying game'] },
    { id: 'tambola', name: 'Tambola', min: 2, max: 100, sweet: [8, 100], together: true, remote: true, party: true, minutes: [15, 30], keys: ['tambola', 'housie', 'bingo', 'numbers', '90 ball', '75 ball'] },
    { id: 'streetcricket', name: 'Street Cricket', min: 1, max: 2, bots: true, remote: true, minutes: [5, 20], keys: ['cricket', 'street cricket', 'gully cricket', 'bat', 'bowl', 'sports'] },
    { id: 'badminton', name: 'Badminton', min: 1, max: 4, bots: true, remote: true, minutes: [5, 15], keys: ['badminton', 'shuttle', 'racket', 'smash', 'sports'] },
    { id: 'penalty', name: 'Penalty Shootout', min: 1, max: 2, bots: true, remote: true, minutes: [2, 5], keys: ['penalty', 'penalties', 'football', 'soccer', 'shootout', 'goalkeeper', 'sports'] },
    { id: 'imposter', name: 'Imposter', min: 3, max: 12, sweet: [4, 8], together: true, remote: true, party: true, minutes: [10, 20], keys: ['imposter', 'impostor', 'spy', 'undercover', 'word party', 'who is faking', 'party game'] },
    { id: 'rajamantri', name: 'Raja Mantri Chor Sipahi', min: 4, max: 8, sweet: [4, 6], together: true, remote: true, party: true, minutes: [10, 15], keys: ['raja mantri', 'chor sipahi', 'rmcs', 'king minister thief soldier', 'chits', 'party game'] },
    { id: 'charades', name: 'Charades', min: 4, max: 16, sweet: [6, 12], together: true, remote: true, party: true, minutes: [15, 30], keys: ['charades', 'dumb charades', 'act it out', 'acting game', 'mime', 'party game'] },
    { id: 'mostlikely', name: 'Most Likely To', min: 2, max: 16, sweet: [4, 10], together: true, remote: true, party: true, minutes: [10, 20], keys: ['most likely to', 'would you rather', 'never have i ever', 'icebreaker', 'party game'] },
    { id: 'werewolf', name: 'Werewolf', min: 5, max: 16, sweet: [7, 12], together: true, remote: true, party: true, minutes: [20, 40], keys: ['werewolf', 'mafia', 'social deduction', 'hidden roles', 'party game'] },
  ];
  const IDS = CATALOG.map((g) => g.id);
  const BY_ID = {};
  CATALOG.forEach((g) => (BY_ID[g.id] = g));

  const ALIASES = {
    kakuro: 'ankjod', ankjod: 'ankjod', shabd: 'wordguess', shabdfive: 'wordguess', tictactoe: 'ttt', noughtsandcrosses: 'ttt',
    snakesandladders: 'snakes', snakesladders: 'snakes', ohno: 'uno', muqabala: 'quiz', quizmuqabala: 'quiz', quizroom: 'quiz',
    holdem: 'poker', texasholdem: 'poker', 'texashold’em': 'poker', "texashold'em": 'poker', teenpatti: 'teenpatti', '3patti': 'teenpatti',
    ginrummy: 'rummy', housie: 'tambola', bingo: 'tambola', cricket: 'streetcricket', streetcricket: 'streetcricket', gullycricket: 'streetcricket',
    penaltyshootout: 'penalty', shootout: 'penalty', impostor: 'imposter', rmcs: 'rajamantri', rajamantrichorsipahi: 'rajamantri',
    dumbcharades: 'charades', mostlikelyto: 'mostlikely', wouldyourather: 'mostlikely', neverhaveiever: 'mostlikely', mafia: 'werewolf', breakout: 'brickbreaker',
  };

  /**
   * Retired titles live only in dangal-graduation.js (isRetiredGameId); pass opts.isRetired in Node.
   */
  function retiredCheck(opts) {
    if (opts && typeof opts.isRetired === 'function') return opts.isRetired;
    if (root && typeof root.isRetiredGameId === 'function') return root.isRetiredGameId;
    return () => false;
  }

  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[’'`]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  const squash = (s) => norm(s).replace(/\s+/g, '');

  function canonId(id) {
    const k = squash(id);
    if (BY_ID[k]) return k;
    return ALIASES[k] || ALIASES[String(id || '').toLowerCase()] || k;
  }
  function gameName(id) {
    const g = BY_ID[canonId(id)];
    return g ? g.name : String(id || '');
  }

  // ---------------------------------------------------------------- search (Khoj / intents)

  const FILLER = new Set(['play', 'playing', 'game', 'games', 'a', 'an', 'the', 'some', 'lets', 'let', 'us', 'me', 'open', 'start', 'launch', 'find', 'want', 'to', 'i', 'please', 'on', 'chaupaal', 'dangal', 'with', 'my', 'for', 'of']);
  const SOCIAL = new Set(['friends', 'friend', 'family', 'group', 'together', 'party', 'online', 'people', 'mates']);

  /**
   * Deterministic game search. Returns [{ id, name, score }] best first (score 0–100).
   * "poker with friends" → poker; "daily word game" → Shabd Five; "play imposter" → Imposter.
   */
  function searchGames(query, opts) {
    const o = opts || {};
    const q = norm(query);
    if (!q) return [];
    const words = q.split(' ');
    const social = words.some((w) => SOCIAL.has(w));
    const core = words.filter((w) => !FILLER.has(w) && !SOCIAL.has(w));
    const coreText = core.join(' ');
    const out = [];
    CATALOG.forEach((g, i) => {
      const name = norm(g.name);
      let score = 0;
      const id = squash(coreText);
      if (coreText && (name === coreText || g.id === id || ALIASES[id] === g.id)) score = 100;
      else if (coreText && name.indexOf(coreText) === 0) score = 92;
      else if (coreText && (' ' + name + ' ').indexOf(' ' + coreText + ' ') >= 0) score = 88;
      else {
        g.keys.forEach((k) => {
          if (k === coreText) score = Math.max(score, 86);
          else if (coreText && (' ' + coreText + ' ').indexOf(' ' + k + ' ') >= 0) score = Math.max(score, 78 + Math.min(6, k.length / 3));
          else if (coreText && k.indexOf(coreText) === 0 && coreText.length >= 3) score = Math.max(score, 70);
        });
        if (!score && core.length) {
          const hay = new Set((name + ' ' + g.keys.join(' ')).split(' '));
          const hits = core.filter((w) => hay.has(w)).length;
          if (hits) score = 40 + Math.round((30 * hits) / core.length);
        }
        if (!score && !core.length && social) score = g.party ? 50 : g.remote && g.min > 1 ? 40 : 0;
      }
      if (!score) return;
      if (social && g.min > 1) score += 4;
      if (social && g.solo) score -= 20;
      out.push({ id: g.id, name: g.name, score: Math.min(100, Math.round(score)), order: i });
    });
    out.sort((a, b) => b.score - a.score || a.order - b.order);
    return out.slice(0, o.limit || 8).map(({ id, name, score }) => ({ id, name, score }));
  }

  /** One best target for a typed / spoken request: { id } · { retired, name } · null. */
  function resolveGame(query, opts) {
    const q = norm(query);
    const core = q.split(' ').filter((w) => !FILLER.has(w) && !SOCIAL.has(w)).join(' ');
    const k = squash(core);
    const top = searchGames(query, { limit: 1 })[0];
    if (top && top.score >= 86) return { id: top.id, name: top.name };
    if (k && retiredCheck(opts)(k)) return { retired: k, name: core.replace(/\b\w/g, (c) => c.toUpperCase()) };
    if (top && top.score >= 70) return { id: top.id, name: top.name };
    return null;
  }
  function isRetired(id, opts) {
    return !!(id && retiredCheck(opts)(squash(id)));
  }

  // ---------------------------------------------------------------- recommender

  /**
   * Deterministic suggestions with plain reasons.
   * ctx { players, where: 'together'|'remote'|'either', minutes, recent: [id], friendsOnline, adult, partyOnly, limit }
   */
  function recommend(ctx) {
    const c = ctx || {};
    const players = Math.max(1, Math.min(100, Math.floor(Number(c.players) || 1)));
    const where = c.where === 'together' || c.where === 'remote' ? c.where : 'either';
    const minutes = Number(c.minutes) > 0 ? Number(c.minutes) : 0;
    const recent = Array.isArray(c.recent) ? c.recent.map(canonId) : [];
    const friends = Math.max(0, Number(c.friendsOnline) || 0);
    const out = [];
    CATALOG.forEach((g, i) => {
      if (c.partyOnly && !g.party) return;
      if (g.adult && !c.adult) return;
      const solo = players === 1;
      if (solo && !(g.solo || g.bots)) return;
      if (!solo && (players < g.min || players > g.max)) return;
      if (!solo && g.solo) return;
      if (where === 'remote' && !g.remote) return;
      let score = 50;
      const reasons = [];
      if (solo) {
        if (g.solo) {
          score += 22;
          reasons.push(g.daily ? 'A quick solo game with a daily puzzle' : 'Made for playing solo');
        } else {
          score += 8;
          reasons.push('Practice against a labelled bot');
        }
      } else {
        const [lo, hi] = g.sweet || [g.min, g.max];
        const fit = players >= lo && players <= hi;
        score += fit ? 22 : 8;
        // Closer to the middle of a game's sweet spot ranks a little higher.
        if (fit) score += Math.max(0, Math.round(4 - (8 * Math.abs(players - (lo + hi) / 2)) / Math.max(1, hi - lo + 1)));
        if (g.party && players >= 5) score += 6;
        if (where === 'together') {
          if (g.together) {
            score += 10;
            reasons.push('Great for ' + players + ' people in the same room');
          } else {
            score -= 10;
            reasons.push('Everyone plays on their own phone');
          }
        } else if (where === 'remote') {
          score += 6;
          reasons.push('Great for ' + players + ' people on separate phones');
        } else reasons.push('Great for ' + players + ' people');
      }
      if (minutes) {
        if (g.minutes[0] > minutes) score -= 25;
        else {
          score += 8;
          if (g.minutes[1] <= minutes) reasons.push('Fits in ' + minutes + ' minutes');
        }
      }
      const r = recent.indexOf(g.id);
      if (r === 0) {
        score -= 14;
        reasons.push('You just played this');
      } else if (r > 0) score -= 4;
      else if (recent.length) score += 4; // variety nudges the order; no reason line (it would sit on every row)
      if (friends && g.remote && !solo) {
        score += 6;
        reasons.push(friends === 1 ? 'A friend is online' : friends + ' friends are online');
      }
      out.push({ id: g.id, name: g.name, score, reason: reasons.slice(0, 2).join(' · '), order: i });
    });
    out.sort((a, b) => b.score - a.score || a.order - b.order);
    return out.slice(0, c.limit || 5).map(({ id, name, score, reason }) => ({ id, name, score, reason }));
  }

  // ---------------------------------------------------------------- rules FAQ + answers

  const NOT_COVERED = 'Not covered by these rules.';
  const q = (question, answer, section) => ({ q: question, a: answer, s: section });

  /** Curated FAQ — every answer restates that game's P1 rule text (dangal-rules.js); `s` = its section. */
  const FAQ = {
    tiptap: [
      q('What happens if a swap makes no match?', 'The tiles slide back and no move is used — a swap only counts if it lines up 3 or more.', 'Moves'),
      q('How do I make a special tile?', 'Match 4 in a row for a Line, an L or T shape for a Bomb, and 5 in a row for a Prism.', 'Specials'),
      q('What if there are no moves left?', 'The board reshuffles for free and tells you so.', 'No moves left'),
      q('How do I get three stars?', 'Finish the goals for one star; leftover moves become bonus points, and beating the score marks earns two or three stars.', 'Stars'),
      q('Does replaying the Daily count?', 'Only your first try counts; replays are practice.', 'Daily'),
      q('What do two specials do together?', 'Swapping two specials fires a combo — for example Bomb + Bomb clears a 5×5 square and Prism + Prism clears the whole board.', 'Combos'),
    ],
    brickbreaker: [
      q('How do I aim the ball?', 'Where the ball lands on the paddle sets its angle: the centre sends it almost straight up, the edges send it out at up to 60°.', 'Aiming'),
      q('Can I break the grey bricks?', 'No — steel bricks (grey, no number) can’t be broken.', 'Bricks'),
      q('How often do power-ups drop?', 'Every normal brick has an 8% chance; bricks marked with a star always drop one.', 'Power-ups'),
      q('How many lives do I get?', 'Campaign gives three lives per level; an Extra ball power-up adds one, up to 5.', 'Modes'),
      q('Does the ball get faster?', 'Yes — it speeds up slightly with every brick, up to a fixed top speed.', 'Speed'),
    ],
    ankjod: [
      q('Can a digit repeat?', 'Not within a run — but the same digit can appear in different runs.', 'Digits'),
      q('Which digits can I use?', 'Only 1–9.', 'Digits'),
      q('Does every puzzle have one answer?', 'Yes — every puzzle has exactly one solution, checked by our solver.', 'One answer'),
      q('Are hints allowed?', 'Yes — pencil notes, auto-notes, the sums helper, undo/redo and hints are always allowed.', 'Tools'),
      q('How is the Daily ranked?', 'By time plus 30 seconds per hint; your first try counts.', 'Daily'),
      q('How do I read a clue?', 'A clue on the left sums the run to its right; a clue above sums the run below it.', 'Runs'),
    ],
    wordguess: [
      q('How many guesses do I get?', 'Six tries to find the five-letter word.', 'Glance'),
      q('What do the colours mean?', 'Green is the right letter in the right spot; amber is the right letter in the wrong spot.', 'Glance'),
      q('How do double letters work?', 'A letter that appears twice is only marked as often as it is in the answer.', 'Guesses'),
      q('What is hard mode?', 'Revealed greens must stay in place and ambers must be reused in later guesses; choose it before your first guess.', 'Hard mode'),
      q('Does practice affect my streak?', 'No — practice words have their own stats and never touch your Daily streak.', 'Practice'),
      q('When does the Daily change?', 'A new puzzle arrives at your local midnight.', 'Daily'),
    ],
    chess: [
      q('Can I claim a draw by repetition?', 'Yes — threefold repetition and the 50-move rule can be claimed with Claim draw; Auto-claim (on by default) does it for you.', 'Claimable draws'),
      q('What happens if my time runs out?', 'You lose, unless your opponent cannot possibly checkmate — then it is a draw.', 'Clock'),
      q('Can I abort a game?', 'Either player can abort before making their first move, with no rating change and no chips.', 'Abort'),
      q('Which draws are automatic?', 'Stalemate, insufficient material, fivefold repetition and the 75-move rule end the game at once.', 'Automatic draws'),
      q('How does castling work in Chess960?', 'Castling ends with the king and rook on the usual squares.', 'Chess960'),
      q('How often can I offer a draw?', 'Once every 10 moves.', 'Claimable draws'),
    ],
    ttt: [
      q('How do I win?', 'Three in a row across, down or diagonally wins.', 'Classic'),
      q('What if the board fills up?', 'A full board with no line is a draw.', 'Classic'),
      q('How does Ultimate work?', 'The square you play in sends your opponent to the matching small board; win three small boards in a row.', 'Ultimate'),
      q('What if I am sent to a finished board?', 'Play anywhere.', 'Ultimate'),
      q('Can the Unbeatable bot lose?', 'No — it always draws or wins.', 'Bots'),
    ],
    snakes: [
      q('What happens if I roll a 6?', 'You roll again — but three 6s in a row lose the turn.', 'Turns'),
      q('Do I need an exact roll to finish?', 'Yes, you need the exact roll to land on 100; by default a roll that is too big leaves you where you are.', 'Finish'),
      q('Are the dice fair?', 'Live dice are rolled on our server with no weighting; open Dice history to see every roll.', 'Fair dice'),
      q('What is the Moksha board?', 'The old Indian board of virtues and vices — one of four boards you can pick.', 'Boards'),
      q('Can bots win chips?', 'No — bots never take chips.', 'Payouts'),
    ],
    ludo: [
      q('How do I bring a token out?', 'Roll a 6 (or 1 or 6 if the host picks that house rule).', 'Turns'),
      q('Are stars safe squares?', 'Every start square and every star is a safe square — a token there can’t be captured.', 'Captures'),
      q('Do I need an exact roll to reach home?', 'Yes, and a token reaching home earns a bonus roll.', 'Home'),
      q('What happens if I leave?', 'Miss three turns or leave and a bot finishes your game; you forfeit your place.', 'Leaving'),
      q('What is Quick mode?', 'Every token starts on its start square and the first token home wins.', 'Winning'),
    ],
    uno: [
      q('When can I play a Wild Draw Four?', 'Only when you hold no card of the current colour — and the next player may challenge.', 'Wild Draw Four'),
      q('What happens if I forget to say Oh No?', 'If someone taps Catch! before the next player starts their turn, you draw 2.', 'Oh No!'),
      q('Can I stack Draw Twos?', 'Only with the Stacking house rule; it is off by default.', 'House rules'),
      q('How is the round scored?', 'The winner scores the cards left in everyone else’s hands: numbers at face value, action cards 20, Wilds 50.', 'Scoring'),
      q('What does Reverse do with two players?', 'It acts as a Skip.', 'Action cards'),
    ],
    scribble: [
      q('How are guesses scored?', 'A correct guess scores 50 + 250 × (time left ÷ draw time) — 300 at the start down to 50 at the buzzer.', 'Scoring'),
      q('How does the drawer score?', 'The drawer earns 200 ÷ (players guessing) per correct guesser, at least 10 each.', 'Scoring'),
      q('Can people see my correct guess?', 'No — correct guesses are hidden from the chat.', 'Fair play'),
      q('How many players can join?', '2–12 players in a Live room.', 'Players'),
      q('What happens if the drawer leaves?', 'Their turn is skipped; if the host leaves, another player takes over.', 'Players'),
    ],
    quiz: [
      q('How are answers scored?', 'A correct answer scores 600 + 400 × (time left ÷ time limit): 1000 for an instant answer, 600 at the buzzer.', 'Scoring'),
      q('How are ties broken?', 'Equal scores are split by total answer time — lower wins.', 'Ties'),
      q('Is a slow connection punished?', 'No — your time is measured on the server minus half your measured round trip (at most 0.25 s).', 'Fair timing'),
      q('What if I disconnect?', 'Dropping mid-question counts as no answer; leaving a Duel or staying away for 60 seconds forfeits.', 'Disconnects'),
      q('How many tries do I get at the Daily Quiz?', 'One attempt, 10 questions, the same for everyone.', 'Daily Quiz'),
    ],
    carrom: [
      q('When can I pocket the Queen?', 'Only after you have pocketed one of your own men and while you owe no due.', 'Queen'),
      q('What happens if I pocket the striker?', 'It is a foul: one of your pocketed men comes back as a due.', 'Fouls and dues'),
      q('How long do I have per shot?', '20 seconds per stroke in Live; running out of time is a foul.', 'Shot clock'),
      q('How many points to win?', 'First to 25 points, or the leader after 8 boards.', 'Game'),
      q('How do I cover the Queen?', 'Pocket one of your men on the same stroke or the very next one; otherwise the Queen goes back.', 'Queen'),
    ],
    rummy: [
      q('What is a valid show in 13-card Rummy?', 'All 13 cards in sequences and sets, with at least two sequences and at least one pure sequence.', '13-card: a valid show'),
      q('How much is a drop?', 'Drop before your first draw for 20, later for 40 (Pool 201: 25 / 50).', '13-card: points'),
      q('When can I knock in Gin?', 'When your deadwood totals 10 or less (the table can set 5, or 0 for Gin only).', 'Gin: knock and Gin'),
      q('What is an undercut?', 'If the defender has equal or less deadwood than the knocker, the defender scores the difference +25.', 'Gin: knock and Gin'),
      q('Are chip tables 18+?', 'Yes — chip tables are 18+.', 'Live'),
    ],
    teenpatti: [
      q('What does Seen mean?', 'Once you look at your cards you bet double the stake.', 'Blind or seen'),
      q('When can I ask for a show?', 'Only when two players are left; it costs your current bet.', 'Show'),
      q('What beats a pure sequence?', 'Only a Trail (three of a kind).', 'Hand ranks'),
      q('Can chips be bought or cashed out?', 'No — virtual chips only; they can’t be bought or cashed out.', 'Chips'),
      q('What is a side show?', 'A seen player may pay a seen bet to compare privately with the previous seen player; the lower hand packs.', 'Side show'),
    ],
    bluff: [
      q('Who picks up the pile?', 'If any card isn’t the claimed rank, the player who played picks it up; if every card matches, the caller does.', 'Who picks up'),
      q('How long do I have to call Bluff?', 'A short window after every play — 5 seconds by default.', 'Calling Bluff'),
      q('Can I pass in Sequence style?', 'No — in Sequence you must play 1–4 cards (up to 6 with two decks).', 'Sequence'),
      q('How do I win?', 'Empty your hand and survive your last play.', 'Winning'),
      q('Are jokers used?', 'Off by default; when on, a joker always counts as the claimed rank.', 'Jokers'),
    ],
    tambola: [
      q('What is a bogey?', 'A wrong claim — that ticket can’t win that prize any more (the host can choose a warning first).', 'Bogey'),
      q('Can two people share a prize?', 'Yes — a valid claim within 1 second on a ticket that was already complete at the same number shares it.', 'Claims'),
      q('How many numbers are on a ticket?', '15 numbers on a 3 × 9 ticket, 5 in every row.', 'Tickets (90-ball)'),
      q('Do tickets cost real money?', 'No — tickets use virtual chips only; chips can’t be bought or cashed out.', 'Chips'),
      q('What is 75-ball Bingo?', 'A 5×5 card with a free centre and patterns such as lines, four corners, X or blackout.', '75-ball Bingo'),
    ],
    streetcricket: [
      q('Can I be out off a no-ball?', 'Only run out — the same as on a free hit.', 'Getting out'),
      q('How many reviews do I get?', 'One review per side per innings, for LBW and caught behind only (Standard).', 'Reviews (Standard)'),
      q('Is the ball-tracking real?', 'No — ball-tracking and edge detection are a simulation from the game’s own model.', 'Reviews (Standard)'),
      q('What happens if scores are level?', 'A Super Over, a shared tie or boundary count, as the host picks.', 'Result'),
      q('Is there LBW in Gully rules?', 'No — Gully and Backyard rules have no LBW.', 'Gully rules'),
    ],
    badminton: [
      q('How many points win a game?', '21 with a 2-point lead; at 29-all the 30th point wins.', 'Scoring'),
      q('Which court do I serve from in singles?', 'The right court when your score is even and the left when it is odd.', 'Singles service'),
      q('What is a let?', 'The rally is replayed with no point — for example if play was disturbed.', 'Lets'),
      q('Are the shot speeds real?', 'No — line calls and shot speeds shown are simulated.', 'Live'),
      q('Is Quick 11 a tournament format?', 'No — Quick 11 is a Chaupaal quick format and it is unrated.', 'Formats'),
    ],
    penalty: [
      q('How does shooting work?', 'Aim on the goal, then hold for power — more power spreads your aim.', 'Shooting'),
      q('How do I save?', 'Pick a dive, then choose early or late: early covers more, late reacts to the ball.', 'Saving'),
      q('What if it is level after the kicks?', 'Sudden death.', 'Ending'),
      q('Can my opponent see my choice?', 'No — both choose at once and the server reveals the kick.', 'Live'),
      q('Can the shootout end early?', 'Yes — when one side cannot catch up.', 'Ending'),
    ],
    poker: [
      q('What does no-limit mean?', 'Any raise up to your stack.', 'Betting'),
      q('What is the best hand?', 'A royal flush, then a straight flush, four of a kind and so on down to high card.', 'Hand ranks'),
      q('Are chips real money?', 'No — virtual chips only, and tables are 18+.', 'Tables'),
      q('What chips do Friends tables use?', 'Table chips only; Quick tables and Sit & Go use wallet chips.', 'Tables'),
      q('How many private cards do I get?', 'Two private cards, with five shared on the table.', 'Glance'),
    ],
    imposter: [
      q('What can I say as a clue?', 'One word per turn: not the word, not a translation, no repeats.', 'Clues'),
      q('What happens if the Imposter is caught?', 'They get one guess at the word to steal the win.', 'Voting'),
      q('What is Undercover mode?', 'The Imposter gets a close word instead and doesn’t know they are the odd one out.', 'Undercover'),
      q('Does everyone get the word?', 'Everyone except the Imposter.', 'Glance'),
      q('How do we find the Imposter?', 'Give one clue word each, discuss, then vote.', 'Glance'),
    ],
    rajamantri: [
      q('How many points is each role worth?', 'Raja (King) 1000 · Mantri (Minister) 800 · Sipahi (Soldier) 500 · Chor (Thief) 0.', 'Roles'),
      q('What happens if the Mantri guesses wrong?', 'The Mantri and the Chor swap points.', 'Glance'),
      q('Who reveals first?', 'The Raja reveals and calls on the Mantri, who reveals and picks the Chor.', 'The call'),
      q('Can more than four play?', 'Yes — 5–8 players add Rani, Daku, Senapati and Daroga.', 'Big rooms'),
      q('What is Main Raja hoon?', 'The Raja’s call — “I’m the King!” — before calling on the Mantri.', 'The call'),
    ],
    charades: [
      q('Can I talk while acting?', 'No — no talking, mouthing or pointing at objects that spell the answer.', 'Acting'),
      q('How many passes do I get?', 'One pass per turn by default.', 'Scoring'),
      q('How do we score?', 'Got it = +1.', 'Scoring'),
      q('Can we play on a video call?', 'Yes — teammates can type guesses and close spellings count.', 'Video calls'),
      q('How do we win?', 'The team with the most correct guesses wins.', 'Glance'),
    ],
    mostlikely: [
      q('How does Most Likely To work?', 'Everyone votes for one player; the top pick is crowned.', 'Most Likely To'),
      q('How does Would You Rather work?', 'Pick A or B, then guess what most of the room picked.', 'Would You Rather'),
      q('How does Never Have I Ever work?', 'Tap I have or Never — “I have” costs a finger; the last hand up wins.', 'Never Have I Ever'),
      q('Are votes secret?', 'Yes — everyone votes in secret, then the room sees the reveal.', 'Glance'),
      q('Can the reveal hide who voted?', 'Yes — turn on Anonymous reveal.', 'House rules'),
    ],
    werewolf: [
      q('What does the Seer do?', 'Checks one player each night.', 'Night'),
      q('When do the Werewolves win?', 'When they equal the rest of the village.', 'Winning'),
      q('When does the village win?', 'When every Werewolf is out.', 'Winning'),
      q('What happens during the day?', 'Hear who was taken, discuss, then vote someone out.', 'Day'),
      q('Are there extra roles?', 'Optional Hunter, Witch, Bodyguard and Tanner, plus timers and role reveal.', 'Advanced'),
    ],
  };

  const STOP = new Set(
    'a an the is are was were be been do does did can could would should will i me my we you your it its of to in on at for with and or if then than what when where which who whom why how this that these those there here as by from about into any some all much many more most so not no yes up out get got have has had game play playing rule rules happen happens please tell explain'.split(' ')
  );
  const SYN = { win: 'won', winning: 'won', wins: 'won', castle: 'castling', castles: 'castling', points: 'score', point: 'score', scoring: 'score', scored: 'score', scores: 'score', time: 'clock', timer: 'clock', chips: 'chip', money: 'chip', cash: 'chip', dice: 'roll', die: 'roll', rolling: 'roll', rolled: 'roll', bots: 'bot', ai: 'bot', guesses: 'guess', guessing: 'guess', draws: 'draw', drawn: 'draw' };
  function stem(w) {
    let x = SYN[w] || w;
    if (x.length > 5 && /ing$/.test(x)) x = x.slice(0, -3);
    else if (x.length > 4 && /ed$/.test(x)) x = x.slice(0, -2);
    else if (x.length > 3 && /s$/.test(x) && !/ss$/.test(x)) x = x.slice(0, -1);
    return SYN[x] || x;
  }
  function tokens(s) {
    return norm(s)
      .split(' ')
      .filter((w) => w && !STOP.has(w))
      .map(stem);
  }
  function overlap(qt, text) {
    const set = new Set(tokens(text));
    return qt.filter((w, i) => qt.indexOf(w) === i && set.has(w)).length;
  }

  function rulesOf(id) {
    const R = Rules();
    return R ? R.get(canonId(id)) : null;
  }

  /** House-rule lines for the active variants (non-defaults only). */
  function houseLines(id, variants) {
    const R = Rules();
    if (!R || !variants) return [];
    try {
      return R.nonDefault(canonId(id), variants).map((h) => h.text);
    } catch (e) {
      return [];
    }
  }

  /** Grounding passages for the AI (and the source of truth for citations). */
  function rulesPassages(id, variants) {
    const g = rulesOf(id);
    if (!g) return [];
    const out = [{ id: 'G', h: 'Glance', body: g.glance.join('. ') + '.' }];
    g.rules.forEach((r, i) => out.push({ id: 'R' + (i + 1), h: r.h, body: r.body }));
    (FAQ[canonId(id)] || []).forEach((f, i) => out.push({ id: 'F' + (i + 1), h: f.s, body: f.q + ' ' + f.a }));
    const house = houseLines(id, variants);
    out.push({ id: 'H', h: 'House rules', body: house.length ? 'House rules in this game: ' + house.join('; ') + '.' : 'No house rules — this game uses the default rules.' });
    out.push({ id: 'S', h: 'Rule source', body: g.ruleset.source + (g.ruleset.simplified ? ' (simplified rules).' : '.') });
    return out;
  }

  function bestSentence(body, qt) {
    const parts = String(body).split(/(?<=[.!?])\s+/);
    let best = parts[0];
    let score = -1;
    parts.forEach((p) => {
      const s = overlap(qt, p);
      if (s > score) {
        score = s;
        best = p;
      }
    });
    return best;
  }

  /**
   * Deterministic rules answer (AI off, or the AI's fallback).
   * → { answer, section, source: 'faq'|'rules'|'house'|'none', notCovered, suggest? }
   */
  function answerRules(id, question, variants) {
    const gid = canonId(id);
    const g = rulesOf(gid);
    const qt = tokens(question);
    const faq = FAQ[gid] || [];
    if (!g || !qt.length) return { answer: NOT_COVERED, section: '', source: 'none', notCovered: true, suggest: faq.slice(0, 3).map((f) => f.q) };
    if (/\bhouse\b/.test(norm(question))) {
      const house = houseLines(gid, variants);
      return { answer: house.length ? 'House rules in this game: ' + house.join('; ') + '.' : 'No house rules — this game uses the default rules.', section: 'House rules', source: 'house', notCovered: false };
    }
    let bestF = null;
    let bestFs = 0;
    faq.forEach((f) => {
      const s = overlap(qt, f.q) * 2 + overlap(qt, f.a) * 0.5;
      if (s > bestFs) {
        bestFs = s;
        bestF = f;
      }
    });
    const need = qt.length >= 3 ? 3 : 2;
    if (bestF && bestFs >= need) return { answer: bestF.a, section: bestF.s, source: 'faq', notCovered: false };
    let bestR = null;
    let bestRs = 0;
    g.rules.forEach((r) => {
      const s = overlap(qt, r.h) * 1.5 + overlap(qt, r.body);
      if (s > bestRs) {
        bestRs = s;
        bestR = r;
      }
    });
    if (bestR && bestRs >= (qt.length >= 3 ? 2 : 1.5)) return { answer: bestSentence(bestR.body, qt), section: bestR.h, source: 'rules', notCovered: false };
    if (bestF && bestFs >= 2) return { answer: bestF.a, section: bestF.s, source: 'faq', notCovered: false };
    return { answer: NOT_COVERED, section: '', source: 'none', notCovered: true, suggest: faq.slice(0, 3).map((f) => f.q) };
  }

  // ---------------------------------------------------------------- grounding

  function numbersIn(text) {
    return (String(text == null ? '' : text).match(/\d+(?:\.\d+)?/g) || []).map((n) => String(Number(n)));
  }
  /** True when every number in `text` already appears somewhere in `facts` (no invented numbers). */
  function numbersGrounded(text, facts) {
    const allowed = new Set(numbersIn(typeof facts === 'string' ? facts : JSON.stringify(facts || {})));
    return numbersIn(text).every((n) => allowed.has(n));
  }

  // ---------------------------------------------------------------- post-game tips

  /** Games with a post-game tip: every non-party title without its own coach (Chess, Rummy). */
  const TIP_GAMES = ['tiptap', 'brickbreaker', 'ankjod', 'wordguess', 'ttt', 'snakes', 'ludo', 'uno', 'scribble', 'quiz', 'carrom', 'poker', 'teenpatti', 'bluff', 'streetcricket', 'badminton', 'penalty'];

  const has = (s, k) => s && s[k] != null && isFinite(Number(s[k]));
  const n = (s, k) => Number(s[k]);
  const T = (id, when, text) => ({ id, when, text });
  const G = (id, text) => ({ id, when: null, text: () => text });

  /**
   * Tip library. Conditional tips (when(stats) → true) are checked in order; numbers in their text come
   * only from the stats. Generic tips (when null, no digits) are picked by a stable hash.
   */
  const TIPS = {
    tiptap: [
      T('tt_moves_left', (s) => s.won && has(s, 'movesLeft') && n(s, 'movesLeft') >= 5, (s) => 'You finished with ' + s.movesLeft + ' moves to spare — every leftover move turns into bonus points, so going for stars pays.'),
      T('tt_close', (s) => !s.won && has(s, 'movesLeft') && n(s, 'movesLeft') === 0, () => 'So close! Next time, save a special for your last few moves — a combo can finish a goal in one go.'),
      T('tt_specials_low', (s) => has(s, 'specials') && n(s, 'specials') === 0, () => 'No specials this round — look for four in a row or an L shape before taking a plain match of three.'),
      T('tt_specials', (s) => has(s, 'specials') && n(s, 'specials') >= 3, (s) => 'You made ' + s.specials + ' specials — try swapping two of them together for a combo.'),
      G('tt_bottom', 'Matching near the bottom of the board sets off more cascades than matching at the top.'),
      G('tt_goal', 'Check the goal before each swap — a match that helps the goal beats a bigger match that doesn’t.'),
      G('tt_combo', 'Two specials swapped together beat two specials fired one at a time.'),
      G('tt_jelly', 'On jelly levels, aim matches through the jelly instead of around it.'),
      G('tt_chain', 'Chained tiles break when you match next to or through them — clear chains early so the board opens up.'),
      G('tt_daily', 'In the Daily, your first try counts — take a moment to scan the board before your first swap.'),
    ],
    brickbreaker: [
      T('bb_lives', (s) => has(s, 'livesLost') && n(s, 'livesLost') >= 2, (s) => 'You lost ' + s.livesLost + ' lives — staying under the ball and using the paddle’s centre gives you safer, steeper returns.'),
      T('bb_clean', (s) => s.won && has(s, 'livesLost') && n(s, 'livesLost') === 0, () => 'Flawless — no lives lost. Try hitting with the paddle edge to aim at the last bricks faster.'),
      T('bb_power', (s) => has(s, 'powerups') && n(s, 'powerups') >= 3, (s) => 'You caught ' + s.powerups + ' power-ups — Multi-ball is best saved for when lots of bricks are left.'),
      T('bb_level', (s) => !s.won && has(s, 'level') && n(s, 'level') >= 10, (s) => 'Level ' + s.level + ' is a tough one — steel bricks can’t break, so aim for the gaps around them.'),
      G('bb_edge', 'Hitting with the paddle edge sends the ball out wide; the centre sends it almost straight up.'),
      G('bb_sticky', 'With Sticky, hold the ball and line up your shot before releasing it.'),
      G('bb_top', 'Getting the ball above the bricks lets it bounce around up there and clear lots for free.'),
      G('bb_bombs', 'Hit bomb bricks early — they break everything around them.'),
      G('bb_speed', 'The ball speeds up with every brick, so the last bricks are the fastest part of a level.'),
      G('bb_star', 'Bricks marked with a star always drop a power-up — target them first.'),
    ],
    ankjod: [
      T('ak_hints', (s) => has(s, 'hints') && n(s, 'hints') >= 3, (s) => 'You used ' + s.hints + ' hints — try the combination helper on the shortest runs first; those are often forced.'),
      T('ak_fast', (s) => s.won && has(s, 'hints') && n(s, 'hints') === 0, () => 'Solved without a hint! Next, try a harder difficulty — it needs digit placement within runs.'),
      T('ak_mistakes', (s) => has(s, 'mistakes') && n(s, 'mistakes') >= 3, (s) => 'You had ' + s.mistakes + ' wrong digits — pencil the candidates in first and only place a digit when both runs agree.'),
      T('ak_slow', (s) => has(s, 'minutes') && n(s, 'minutes') >= 15, (s) => 'That took ' + s.minutes + ' minutes — scanning for runs with only one possible combination speeds things up a lot.'),
      G('ak_two_cell', 'Try the combination helper on two-cell runs — the smallest sums only fit one pair.'),
      G('ak_unique', 'Some sums have only one combination — learn those and you can fill whole runs at once.'),
      G('ak_cross', 'Where two runs cross, the cell must be a digit both runs allow.'),
      G('ak_big', 'Big sums work the same way: in a two-cell run the largest sum fits only one pair.'),
      G('ak_notes', 'Auto-notes are always allowed — use them to see where the candidates really narrow down.'),
      G('ak_daily', 'In the Daily, each hint adds 30 seconds — try one more scan before you ask.'),
    ],
    wordguess: [
      T('wg_six', (s) => s.won && has(s, 'guesses') && n(s, 'guesses') >= 5, (s) => 'Got it in ' + s.guesses + ' — opening with words full of common vowels and consonants narrows things faster.'),
      T('wg_fast', (s) => s.won && has(s, 'guesses') && n(s, 'guesses') <= 3, (s) => 'Solved in ' + s.guesses + '! Try Hard mode next — revealed hints must be reused.'),
      T('wg_reused', (s) => has(s, 'greyReused') && n(s, 'greyReused') >= 1, (s) => 'You reused ' + s.greyReused + ' grey letter' + (n(s, 'greyReused') === 1 ? '' : 's') + ' — those can’t be in the word, so swap them for fresh letters.'),
      T('wg_miss', (s) => !s.won, () => 'Tough word! When you’re stuck between options, a guess that tests several of them at once is often better than guessing one.'),
      G('wg_vowels', 'An opening guess with two or three different vowels tells you a lot.'),
      G('wg_doubles', 'Remember the answer can have a double letter — a letter is only marked as often as it appears.'),
      G('wg_amber', 'An amber letter is in the word but not in that spot — try it somewhere new.'),
      G('wg_endings', 'Common endings are worth testing early when the start of the word is known.'),
      G('wg_practice', 'Practice words never touch your Daily streak — great for trying new openers.'),
      G('wg_keyboard', 'Glance at the keyboard colours before each guess so you never reuse a grey letter.'),
    ],
    ttt: [
      T('ttt_draw', (s) => s.draw, () => 'A draw — against good play that’s the fair result. Take a corner first and look for a move that makes two threats at once.'),
      T('ttt_loss', (s) => !s.won && !s.draw, () => 'Watch for a double threat: if your opponent can make two lines at once, block one move earlier.'),
      T('ttt_ultimate', (s) => s.mode === 'ultimate', () => 'In Ultimate, think about where your move sends your opponent — avoid sending them to a board they can win.'),
      G('ttt_corner', 'Corners are part of more lines than edges — a corner is a strong opening.'),
      G('ttt_centre', 'If your opponent takes a corner, take the centre.'),
      G('ttt_fork', 'A fork — two lines that both need one more mark — wins because only one can be blocked.'),
      G('ttt_block', 'Always check whether your opponent can win next move before making your own plan.'),
      G('ttt_bot', 'Try the Unbeatable bot — if you can draw it every time, you’ve got Classic solved.'),
      G('ttt_finished', 'In Ultimate, a board sent to that’s already finished lets you play anywhere — a big advantage.'),
      G('ttt_alt', 'First move alternates each game, so practise playing second too.'),
    ],
    snakes: [
      T('sn_snakes', (s) => has(s, 'snakes') && n(s, 'snakes') >= 3, (s) => 'You slid down ' + s.snakes + ' snakes — it’s pure luck, so keep smiling and roll again!'),
      T('sn_ladders', (s) => has(s, 'ladders') && n(s, 'ladders') >= 3, (s) => 'You climbed ' + s.ladders + ' ladders — a lucky run!'),
      T('sn_sixes', (s) => has(s, 'sixes') && n(s, 'sixes') >= 3, (s) => 'You rolled ' + s.sixes + ' sixes — remember, three in a row loses the turn.'),
      G('sn_luck', 'Snakes & Ladders is a game of chance — every roll is fair and random.'),
      G('sn_bounce', 'Try the Bounce house rule for 100 — overshooting sends you back the extra squares.'),
      G('sn_boards', 'Each board has its own layout — try Jungle or Galaxy for a change.'),
      G('sn_speed', 'Speed mode makes a quick game for a short break.'),
      G('sn_history', 'Curious about a roll? Dice history shows every roll in the game.'),
      G('sn_moksha', 'The Moksha board is the original layout — it has more snakes than ladders.'),
      G('sn_friends', 'It’s more fun with friends — invite up to six players.'),
    ],
    ludo: [
      T('lu_captured', (s) => has(s, 'timesCaptured') && n(s, 'timesCaptured') >= 3, (s) => 'You were sent home ' + s.timesCaptured + ' times — parking on stars and start squares keeps your tokens safe.'),
      T('lu_captures', (s) => has(s, 'captures') && n(s, 'captures') >= 3, (s) => 'You captured ' + s.captures + ' tokens — great hunting! Keep one token back to punish rivals coming out of base.'),
      T('lu_home', (s) => !s.won && has(s, 'tokensHome') && n(s, 'tokensHome') <= 1, (s) => 'Only ' + s.tokensHome + ' token' + (n(s, 'tokensHome') === 1 ? '' : 's') + ' made it home — moving one token at a time to safety can beat spreading out.'),
      G('lu_safe', 'Stars and start squares are safe — no one can capture you there.'),
      G('lu_six', 'With a 6, bringing a new token out is often better than moving one already far ahead.'),
      G('lu_behind', 'A rival token right behind yours is a threat — move away or onto a safe square.'),
      G('lu_spread', 'Two tokens in play give you choices when the dice don’t suit one of them.'),
      G('lu_house', 'Try a house rule like capture bonus rolls for a faster, wilder game.'),
      G('lu_exact', 'You need an exact roll to get home, so get close early and wait for the right number.'),
      G('lu_teams', 'In Teams, protect your partner’s tokens as well as your own.'),
    ],
    uno: [
      T('un_left', (s) => !s.won && has(s, 'cardsLeft') && n(s, 'cardsLeft') >= 5, (s) => 'You had ' + s.cardsLeft + ' cards left — playing high cards and action cards early keeps your score low if someone else goes out.'),
      T('un_catch', (s) => has(s, 'caught') && n(s, 'caught') >= 1, () => 'Caught without calling Oh No! — tap it as you play your second-to-last card.'),
      T('un_close', (s) => !s.won && has(s, 'cardsLeft') && n(s, 'cardsLeft') <= 2, (s) => 'Just ' + s.cardsLeft + ' card' + (n(s, 'cardsLeft') === 1 ? '' : 's') + ' from winning! Holding a Wild until the end makes your last play easier.'),
      G('un_wild', 'Keep a Wild for when you can’t match — it’s your escape card.'),
      G('un_draw4', 'You can only play Wild Draw Four with no card of the current colour — bluffing risks a challenge.'),
      G('un_colour', 'Change the colour to the one you hold most of.'),
      G('un_action', 'Save Skip and Draw Two for the player about to go out.'),
      G('un_count', 'Watch how many cards each player holds — the one with fewest is the biggest threat.'),
      G('un_score', 'Action cards are worth 20 and Wilds 50 if you’re caught holding them.'),
      G('un_house', 'Try the Stacking house rule for longer, more chaotic rounds.'),
    ],
    scribble: [
      T('sc_guessed', (s) => has(s, 'guessed') && n(s, 'guessed') >= 3, (s) => 'You guessed ' + s.guessed + ' drawings — guessing early scores far more than at the buzzer.'),
      T('sc_rank', (s) => !s.won && has(s, 'place') && n(s, 'place') >= 3, () => 'Fast guesses score most — type a guess as soon as you have an idea, even if it’s rough.'),
      G('sc_simple', 'When drawing, sketch the one thing that defines the word first, then add detail.'),
      G('sc_easy', 'An easy word that everyone guesses scores the drawer more than a hard word nobody gets.'),
      G('sc_hints', 'Letter hints appear during the turn — the word length alone is a big clue.'),
      G('sc_close', 'A private “So close!” means you’re one or two letters off.'),
      G('sc_category', 'Think about what kind of thing it is — object, animal, action — before guessing details.'),
      G('sc_arrows', 'Arrows and simple symbols help show movement or direction.'),
      G('sc_plural', 'Try singular and plural forms if a guess is close.'),
      G('sc_time', 'The drawer scores for each correct guesser, so helping everyone guess pays off.'),
    ],
    quiz: [
      T('qz_correct', (s) => has(s, 'correct') && has(s, 'total') && n(s, 'correct') < n(s, 'total') / 2, (s) => 'You got ' + s.correct + ' of ' + s.total + ' — a quick read of every option before tapping helps on tricky ones.'),
      T('qz_great', (s) => has(s, 'correct') && has(s, 'total') && n(s, 'correct') === n(s, 'total'), (s) => 'Perfect ' + s.correct + ' of ' + s.total + '! Speed is the next step — instant answers score the most.'),
      T('qz_score', (s) => s.won && has(s, 'score'), (s) => 'You won with ' + s.score + ' points — answering quickly earns a big time bonus on every question.'),
      G('qz_speed', 'Correct and fast scores most — but a wrong fast answer scores nothing, so be sure first.'),
      G('qz_daily', 'The Daily Quiz is the same for everyone — compare with friends after you finish.'),
      G('qz_eliminate', 'Rule out the options you know are wrong first — it often leaves one clear choice.'),
      G('qz_report', 'Think a question is wrong? Tap Report on the reveal.'),
      G('qz_ties', 'Ties are split by total answer time, so speed matters even when scores match.'),
      G('qz_category', 'Try a different category to find your strongest topic.'),
      G('qz_party', 'Party Quiz takes up to 50 players — great for a big group.'),
    ],
    carrom: [
      T('cr_fouls', (s) => has(s, 'fouls') && n(s, 'fouls') >= 2, (s) => 'You had ' + s.fouls + ' fouls — softer shots keep the striker on the board.'),
      T('cr_power', (s) => has(s, 'hardMissPct') && n(s, 'hardMissPct') >= 50, (s) => 'Most misses came from full-power shots (' + s.hardMissPct + '% of them) — try a softer stroke for accuracy.'),
      T('cr_queen', (s) => has(s, 'queenLost') && n(s, 'queenLost') >= 1, () => 'The Queen went back without a cover — line up an easy cover shot before you pocket her.'),
      G('cr_cover', 'Pocket the Queen only when you have an easy cover shot ready.'),
      G('cr_angle', 'Cutting a man at an angle often works better than hitting it straight on.'),
      G('cr_baseline', 'Use the whole baseline — moving the striker can open a straight line to a pocket.'),
      G('cr_soft', 'A soft shot that pockets one man beats a hard shot that scatters them.'),
      G('cr_due', 'Avoid pocketing the striker — it costs a man back as a due.'),
      G('cr_last', 'Don’t pocket your last man while the Queen is still on the board.'),
      G('cr_quick', 'Try Quick mode for a single board when you’re short of time.'),
    ],
    poker: [
      T('pk_river', (s) => has(s, 'riverCallPct') && n(s, 'riverCallPct') >= 60, (s) => 'You called ' + s.riverCallPct + '% of river bets — folding weak hands on the river saves chips.'),
      T('pk_vpip', (s) => has(s, 'handsPlayedPct') && n(s, 'handsPlayedPct') >= 50, (s) => 'You played ' + s.handsPlayedPct + '% of hands — folding more weak starting hands is a big edge.'),
      T('pk_tight', (s) => has(s, 'handsPlayedPct') && n(s, 'handsPlayedPct') <= 10, (s) => 'Only ' + s.handsPlayedPct + '% of hands played — you can open a little wider in late position.'),
      G('pk_position', 'Acting last is an advantage — play more hands when you’re on the button.'),
      G('pk_pairs', 'Big pairs and strong aces are worth raising before the flop.'),
      G('pk_odds', 'Compare the bet to the pot before calling — small bets into big pots are often worth a call.'),
      G('pk_fold', 'Folding is a strong move — you don’t need to see every flop.'),
      G('pk_size', 'Bet sizes tell a story — a consistent size makes you harder to read.'),
      G('pk_stack', 'Keep an eye on stack sizes; short stacks often have to push all-in.'),
      G('pk_virtual', 'Practice tables use virtual chips only — a safe place to try new ideas.'),
    ],
    teenpatti: [
      T('tp_packs', (s) => has(s, 'packs') && has(s, 'hands') && n(s, 'packs') > n(s, 'hands') / 2, (s) => 'You packed ' + s.packs + ' of ' + s.hands + ' hands — staying blind a little longer is cheap and keeps others guessing.'),
      T('tp_shows', (s) => has(s, 'showsLost') && n(s, 'showsLost') >= 2, (s) => 'You lost ' + s.showsLost + ' shows — ask for a show only with a hand you’re confident in.'),
      G('tp_blind', 'Blind bets cost half as much as seen bets.'),
      G('tp_ranks', 'Remember the order: Trail, Pure sequence, Sequence, Colour, Pair, High card.'),
      G('tp_side', 'A side show compares privately — useful when you suspect the player before you is weak.'),
      G('tp_pot', 'When the pot hits its limit, every hand still in is shown.'),
      G('tp_pack', 'Packing early with a weak seen hand saves chips for better hands.'),
      G('tp_variant', 'Try Muflis, where the lowest hand wins, for a twist.'),
      G('tp_watch', 'Watch who stays blind — they’re betting without knowing their hand either.'),
      G('tp_virtual', 'Virtual chips only — practice freely.'),
    ],
    bluff: [
      T('bl_caught', (s) => has(s, 'caught') && n(s, 'caught') >= 2, (s) => 'You were caught bluffing ' + s.caught + ' times — mixing in honest plays makes your lies more believable.'),
      T('bl_badcalls', (s) => has(s, 'badCalls') && n(s, 'badCalls') >= 2, (s) => 'You made ' + s.badCalls + ' wrong calls — count how many of that rank you hold before calling.'),
      T('bl_goodcalls', (s) => has(s, 'goodCalls') && n(s, 'goodCalls') >= 2, (s) => 'You caught ' + s.goodCalls + ' bluffs — sharp eyes!'),
      G('bl_count', 'If you hold three of a rank, a claim of two more of it is probably a lie.'),
      G('bl_small', 'Small bluffs (one card) are less risky than big ones.'),
      G('bl_last', 'Your last play is the most likely to be called — make it an honest one if you can.'),
      G('bl_pile', 'A big pile is a big risk — call carefully when it’s large.'),
      G('bl_timing', 'Calls must come inside the short window after each play.'),
      G('bl_honest', 'Playing truthfully when you can saves your bluffs for when you need them.'),
      G('bl_style', 'Try the Follow the rank style for a different kind of game.'),
    ],
    streetcricket: [
      T('sc_dots', (s) => has(s, 'dots') && has(s, 'balls') && n(s, 'dots') >= n(s, 'balls') / 2, (s) => s.dots + ' of your ' + s.balls + ' balls were dots — a defend or a quick single keeps the scoreboard moving.'),
      T('sc_wickets', (s) => has(s, 'wickets') && n(s, 'wickets') >= 3, (s) => 'You lost ' + s.wickets + ' wickets — watch the landing marker and pick a shot that suits the length.'),
      T('sc_boundaries', (s) => has(s, 'boundaries') && n(s, 'boundaries') >= 4, (s) => s.boundaries + ' boundaries — great timing! Try pushing for twos against a defensive field.'),
      G('sc_length', 'Short balls suit the pull and cut; full balls suit the drive.'),
      G('sc_timing', 'Perfect timing matters more than power — tap as the ball reaches the glowing band.'),
      G('sc_field', 'Read the field: a defensive field gives easy singles.'),
      G('sc_spin', 'Stepping out to spin lets you hit bigger, but a miss can mean stumped.'),
      G('sc_bowl', 'When bowling, vary your length — the same ball every time is easy to read.'),
      G('sc_review', 'Save your review for a close LBW or caught behind.'),
      G('sc_set', 'The Set meter builds with good contact — a few safe shots can set up a big one.'),
    ],
    badminton: [
      T('bd_winners', (s) => has(s, 'winners') && has(s, 'oppWinners') && n(s, 'oppWinners') > n(s, 'winners'), (s) => 'Your opponent hit ' + s.oppWinners + ' winners to your ' + s.winners + ' — wait in the centre of your court to reach more shots.'),
      T('bd_rally', (s) => has(s, 'longest') && n(s, 'longest') >= 15, (s) => 'A ' + s.longest + '-shot rally! Long rallies tire legs — a well-timed smash can end them.'),
      T('bd_smash', (s) => has(s, 'smashes') && n(s, 'smashes') === 0, () => 'No smashes this match — when the shuttle is high above you, a quick swipe attacks.'),
      G('bd_centre', 'Drag your marker back to the centre between shots to cover the court.'),
      G('bd_deep', 'A long swipe plays deep — use it to push your opponent back.'),
      G('bd_net', 'A short swipe plays to the front — great against an opponent at the back.'),
      G('bd_hold', 'Hold still before swiping to disguise your shot.'),
      G('bd_timing', 'Good timing makes a better shot — swipe as the bar crosses the green.'),
      G('bd_legs', 'Fresh legs make better shots — avoid rushing every shuttle.'),
      G('bd_drills', 'Drills like smash defence and net play help you practise one skill at a time.'),
    ],
    penalty: [
      T('pe_goals', (s) => has(s, 'goals') && has(s, 'kicks') && n(s, 'goals') < n(s, 'kicks') / 2, (s) => 'You scored ' + s.goals + ' of ' + s.kicks + ' — less power keeps your aim tighter.'),
      T('pe_saves', (s) => has(s, 'saves') && n(s, 'saves') === 0, () => 'No saves this time — diving late lets you react to where the ball goes.'),
      T('pe_perfect', (s) => has(s, 'goals') && has(s, 'kicks') && n(s, 'goals') === n(s, 'kicks'), (s) => 'Perfect ' + s.goals + ' from ' + s.kicks + '! Try a harder keeper next.'),
      G('pe_power', 'More power spreads your aim — a placed shot in the corner beats a blast.'),
      G('pe_vary', 'Vary your corners so the keeper can’t read you.'),
      G('pe_early', 'Diving early covers more of the goal; diving late reacts to the ball.'),
      G('pe_sudden', 'Level after the kicks? Sudden death — every kick counts.'),
      G('pe_low', 'Low corners are the hardest for a keeper to reach.'),
      G('pe_calm', 'Take your time aiming — there’s no rush on your kick.'),
      G('pe_bestof', 'Pick more kicks each in the settings for a longer duel.'),
    ],
  };

  function hashStr(s) {
    let h = 2166136261;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    return h >>> 0;
  }

  /** Deterministic tip for a finished game → { id, text, grounded } (null for games without tips). */
  function pickTip(id, stats, seed) {
    const gid = canonId(id);
    const list = TIPS[gid];
    if (!list) return null;
    const s = Object.assign({}, stats || {});
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!t.when) continue;
      let ok = false;
      try {
        ok = !!t.when(s);
      } catch (e) {}
      if (!ok) continue;
      const text = t.text(s);
      if (numbersGrounded(text, s)) return { id: t.id, text, grounded: true };
    }
    const generic = list.filter((t) => !t.when);
    const g = generic[hashStr(gid + ':' + (seed != null ? seed : JSON.stringify(s))) % generic.length];
    return { id: g.id, text: g.text(s), grounded: false };
  }

  /**
   * Tips only once a game is over — never while a hand / round / match is still running, and never
   * while a rated, Live or chip table is in play (ctx from the result call: { midGame, tableOpen }).
   */
  function tipAllowed(id, ctx) {
    const c = ctx || {};
    if (TIP_GAMES.indexOf(canonId(id)) < 0) return false;
    if (c.midGame || c.tableOpen) return false;
    return true;
  }

  return {
    CATALOG,
    IDS,
    canonId,
    gameName,
    searchGames,
    resolveGame,
    isRetired,
    recommend,
    FAQ,
    NOT_COVERED,
    answerRules,
    rulesPassages,
    tokens,
    numbersIn,
    numbersGrounded,
    TIP_GAMES,
    TIPS,
    pickTip,
    tipAllowed,
  };
});
