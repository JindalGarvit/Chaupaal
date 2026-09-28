/**
 * Dangal rules contract — every roster game declares its ruleset, variants and plain-English
 * rulebook here, and one shared Rules sheet renders them:
 *   Glance (3 lines) → full rulebook → "House rules in this game" (non-default variants only).
 * Declarations describe what each game does today; changing a game's rules is a separate job.
 *
 * Variant `who`: 'host' (Live host picks, locked at start) · 'both' (both players agree before
 * start) · 'solo' (only matters in solo/practice play).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DangalRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const opt = (key, label, def, options, who, extra) =>
    Object.assign({ key, label, default: def, options, who: who || 'host' }, extra || {});
  const range = (key, label, def, min, max, who, extra) =>
    Object.assign({ key, label, default: def, range: [min, max], who: who || 'host' }, extra || {});

  const GAMES = {
    tiptap: {
      ruleset: { name: 'Tip Tap match-3', source: 'Our own match-3 puzzle rules', simplified: false },
      variants: [opt('mode', 'Mode', 'campaign', ['campaign', 'endless'], 'solo')],
      glance: ['Swap two neighbours to line up 3 or more of a colour', 'Clear every goal before your moves run out', 'Bigger matches make specials'],
      rules: [
        { h: 'Moves', body: 'Swap two touching tiles. The swap only counts if it makes a line of 3 or more.' },
        { h: 'Specials', body: 'Match 4 for a Line, 5 or an L/T shape for a Bomb, 6+ of one colour for a Prism. Swap specials to fire them.' },
        { h: 'Winning', body: 'Finish every goal on the level before the move counter reaches zero. Cleared levels can be replayed.' },
      ],
    },
    brickbreaker: {
      ruleset: { name: 'Brick Breaker', source: 'Classic brick-breaker arcade rules', simplified: false },
      variants: [opt('mode', 'Mode', 'campaign', ['campaign', 'endless'], 'solo')],
      glance: ['Move the paddle to keep the ball in play', 'Break every brick to clear the level', 'Lose the ball and you lose a life'],
      rules: [
        { h: 'Bricks', body: 'Steel takes two hits, Gold scores big, Bombs clear their neighbours. Moving bricks shift while you play.' },
        { h: 'Power-ups', body: 'Magnet gives one sticky serve. Multi-ball caps at three balls.' },
        { h: 'Modes', body: 'Campaign clears set levels. Score Attack keeps going until you run out of lives.' },
      ],
    },
    ankjod: {
      ruleset: { name: 'Kakuro', source: 'Classic Kakuro rules', simplified: false },
      variants: [opt('difficulty', 'Difficulty', 'medium', ['easy', 'medium', 'hard'], 'solo')],
      glance: ['Fill white cells with digits 1–9', 'Each run must add up to its clue', 'No digit repeats within a run'],
      rules: [
        { h: 'Runs', body: 'A clue on the left sums the run to its right; a clue above sums the run below it.' },
        { h: 'Digits', body: 'Only 1–9. A digit can appear once per run, but can repeat in different runs.' },
        { h: 'Tools', body: 'Pencil notes, Check (finds conflicts) and Hint are always allowed. The Daily is one shared board per day.' },
      ],
    },
    wordguess: {
      ruleset: { name: 'Shabd Five', source: 'Five-letter word puzzle · our own word list', simplified: false },
      variants: [opt('hard', 'Hard mode', false, [false, true], 'solo')],
      glance: ['Guess the five-letter word in six tries', 'Green: right letter, right spot · Amber: right letter, wrong spot', 'One Daily puzzle per day'],
      rules: [
        { h: 'Guesses', body: 'Each guess must be a real five-letter word from our list.' },
        { h: 'Hard mode', body: 'Revealed greens must stay in place and ambers must be reused in later guesses.' },
        { h: 'Daily vs Practice', body: 'The Daily counts for your streak. Practice never touches streak or stats.' },
      ],
    },
    chess: {
      ruleset: { name: 'Chess', source: 'Rules based on the FIDE Laws of Chess', simplified: false },
      variants: [
        opt('time', 'Time control', '10+0', ['1+0', '2+1', '3+0', '3+2', '5+0', '10+0', '15+10', '30+0', 'custom', 'daily1', 'daily3', 'none'], 'host'),
        opt('chess960', 'Chess960 (Fischer Random)', false, [false, true], 'host'),
      ],
      glance: ['Checkmate the enemy king to win', 'Each piece moves its own way; tap a piece to see its moves', 'Run out of time and you lose (if your opponent can still mate)'],
      rules: [
        { h: 'Moves', body: 'Standard FIDE movement including castling, en passant and promotion to a queen, rook, bishop or knight.' },
        { h: 'Automatic draws', body: 'Stalemate, insufficient material, fivefold repetition and the 75-move rule end the game at once.' },
        { h: 'Claimable draws', body: 'Threefold repetition and the 50-move rule can be claimed with Claim draw. Auto-claim (on by default) claims them for you. You can offer a draw once every 10 moves.' },
        { h: 'Clock', body: 'Minutes + increment per move. Clocks start after each side’s first move. If your time runs out you lose, unless your opponent cannot possibly checkmate — then it is a draw.' },
        { h: 'Abort', body: 'Either player can abort before making their first move: no rating change and no chips.' },
        { h: 'Daily', body: 'Daily games give 1 or 3 days per move. You get a notification when it is your move.' },
        { h: 'Chess960', body: 'The server draws one of 960 back-rank setups (same for both sides). Castling ends with king and rook on the usual squares.' },
      ],
    },
    ttt: {
      ruleset: { name: 'Tic-Tac-Toe', source: 'Classic Tic-Tac-Toe rules', simplified: false },
      variants: [opt('mode', 'Mode', 'classic', ['classic', 'ultimate'], 'host')],
      glance: ['Take turns placing X and O', 'Three in a row wins', 'Ultimate: nine small boards — win three in a row of them'],
      rules: [
        { h: 'Classic', body: 'Players alternate X and O on a 3×3 grid. Three in a row across, down or diagonally wins; a full board with no line is a draw. First move alternates each game.' },
        { h: 'Ultimate', body: 'Nine small boards make one big board. The square you play in sends your opponent to the matching small board. Win a small board with three in a row; win the game with three small boards in a row. If you are sent to a finished board, play anywhere. A drawn small board counts for nobody.' },
        { h: 'Bots', body: 'Classic: Easy, Medium (sometimes blunders) and Unbeatable — the Unbeatable bot always draws or wins. Ultimate: Easy, Normal and Hard.' },
        { h: 'Live', body: 'Live 1v1 with a friend is unrated. Optional virtual-chip stake: the winner takes the other stake, a draw returns both. Leaving or timing out three times forfeits.' },
      ],
    },
    snakes: {
      ruleset: { name: 'Snakes & Ladders', source: 'Standard rules', simplified: false },
      variants: [
        opt('variant', 'Board', 'classic', ['classic', 'jungle', 'galaxy', 'moksha'], 'host'),
        opt('exact', 'Overshooting 100', 'stay', ['stay', 'bounce'], 'host'),
        opt('speed', 'Speed mode', false, [false, true], 'host'),
      ],
      glance: ['A game of chance — roll and move', 'Ladders take you up, snakes bring you down', 'First to reach 100 exactly wins'],
      rules: [
        { h: 'Turns', body: 'Roll one die and move that many squares. A 6 rolls again; three 6s in a row lose the turn.' },
        { h: 'Snakes & ladders', body: 'Land on the foot of a ladder to climb it, on a snake’s head to slide down to its tail.' },
        { h: 'Finish', body: 'You need the exact roll to land on 100. Default: if the roll is too big you stay put. House rule: bounce back the extra squares.' },
        { h: 'Boards', body: 'Classic, Jungle, Galaxy and Moksha (the old Indian board of virtues and vices). Every board is checked so 100 is always reachable.' },
        { h: 'Fair dice', body: 'Live dice are rolled on our server — never on a phone — with no weighting. Open Dice history to see every roll.' },
        { h: 'Payouts', body: 'Optional virtual-chip stake. Everyone antes; 2 players: winner takes both · 3: 70/30 · 4: 60/30/10 · 5–6: 50/30/20. Bots never take chips.' },
      ],
    },
    ludo: {
      ruleset: { name: 'Ludo', source: 'Standard rules', simplified: false },
      variants: [
        opt('mode', 'Mode', 'classic', ['classic', 'quick'], 'host'),
        opt('entry', 'Bring a token out on', 'six', ['six', 'oneOrSix'], 'host'),
        opt('captureBonus', 'Capture earns a bonus roll', false, [false, true], 'host'),
        opt('killToEnter', 'Capture before entering home', false, [false, true], 'host'),
        opt('blocks', 'Two tokens make a block', false, [false, true], 'host'),
        opt('safeSquares', 'Safe squares', true, [true, false], 'host'),
        opt('bonusHome', 'Reaching home earns a bonus roll', true, [true, false], 'host'),
        opt('teams', 'Teams 2v2', false, [false, true], 'host'),
      ],
      glance: ['Roll a 6 to bring a token out', 'Race all four tokens home', 'Land on a rival to send it back to base'],
      rules: [
        { h: 'Turns', body: 'Roll one die. A 6 brings a token out of base and rolls again; three 6s in a row lose the turn. Tokens move clockwise.' },
        { h: 'Captures', body: 'Landing exactly on a rival token sends it back to base — except on safe squares (every start square and the stars).' },
        { h: 'Home', body: 'You need the exact roll to reach home. A token reaching home earns a bonus roll.' },
        { h: 'Winning', body: 'The first player with all four tokens home wins; play continues for the other places. Quick mode: every token starts on its start square and the first token home wins.' },
        { h: 'House rules', body: 'The host can pick: enter on 1 or 6 · capture bonus roll · must capture before entering home · blocks (two of your tokens on a square can’t be passed) · safe squares off · Teams 2v2 (partners sit opposite). They lock at the start and show in the lobby.' },
        { h: 'Fair dice', body: 'Live dice are rolled on our server — never on a phone — with no weighting. Open Dice history to see every roll.' },
        { h: 'Leaving', body: 'If you time out, your most advanced token moves for you. Miss three turns or leave and a bot finishes your game; you forfeit your place.' },
        { h: 'Payouts', body: 'Optional virtual-chip stake. Everyone antes; 2 players: winner takes both · 3: 70/30 · 4: 60/30/10. Teams: winners take the losers’ stakes. Bots never take chips.' },
      ],
    },
    uno: {
      ruleset: { name: 'Oh, No!', source: 'Classic shedding-card rules · our own deck', simplified: false },
      variants: [
        opt('mode', 'Deck', 'classic', ['classic', 'blaze', 'flip'], 'host'),
        opt('stacking', 'Stack draw cards (house rule)', false, [false, true], 'host'),
      ],
      glance: ['Match the top card by colour or number', 'Action cards skip, reverse or make players draw', 'Empty your hand first — say "Oh, No!" at one card'],
      rules: [
        { h: 'Play', body: 'Play one matching card or draw one. Wilds change the colour.' },
        { h: 'Oh, No!', body: 'Call it when you are down to one card, or draw a penalty.' },
        { h: 'Decks', body: 'Classic is the standard deck. Blaze hits harder. Flip switches between a light and dark side.' },
        { h: 'House rules', body: 'Classic has optional toggles (such as stacking draw cards) that the host sets before start.' },
      ],
    },
    scribble: {
      ruleset: { name: 'Scribble', source: 'Draw-and-guess party rules · our own word list', simplified: false },
      variants: [range('rounds', 'Rounds', 3, 1, 5, 'host')],
      glance: ['One player draws a secret word', 'Everyone else races to guess it', 'Faster guesses score more'],
      rules: [
        { h: 'Scoring', body: '100 / 75 / 50 points by guess order. The drawer gets +50 when someone scores.' },
        { h: 'Clues', body: 'Drawings only — no letters or numbers. Close guesses show "close!".' },
        { h: 'Players', body: 'Live 1v1 or a party of 3–6. A party continues while 2 or more players remain.' },
      ],
    },
    quiz: {
      ruleset: { name: 'Quiz Duel', source: 'Timed quiz duel · our own questions', simplified: false },
      variants: [opt('category', 'Topic', 'GK', ['GK', 'Sports', 'Tech', 'Business', 'World'], 'host')],
      glance: ['Same questions for both players', 'Answer before the timer runs out', 'Most correct answers wins'],
      rules: [
        { h: 'Timing', body: 'Late taps do not count. Faster correct answers build combo streaks.' },
        { h: 'Winning', body: 'Higher score after the last question wins; equal scores are a draw.' },
      ],
    },
    carrom: {
      ruleset: { name: 'Carrom', source: 'Simplified rules based on common carrom rules', simplified: true },
      variants: [],
      glance: ['Flick the striker to pocket your coins', 'Pocket the Queen, then cover it with one of yours', 'Pocketing the striker is a foul'],
      rules: [
        { h: 'Turns', body: 'Pocket one of your coins to shoot again; otherwise the turn passes.' },
        { h: 'Queen', body: 'The Queen counts only if you pocket one of your own coins right after it (cover).' },
        { h: 'Fouls', body: 'Pocketing the striker returns one of your pocketed coins to the board.' },
      ],
    },
    rummy: {
      ruleset: { name: '13-card Rummy', source: 'Traditional 13-card rummy rules', simplified: false },
      variants: [],
      glance: ['Arrange 13 cards into sequences and sets', 'You need at least one pure sequence', 'Declare first with a valid hand to win'],
      rules: [
        { h: 'Melds', body: 'Two sequences minimum, one of them pure (no joker). Printed jokers and the wild rank from the open card are wild.' },
        { h: 'Drop', body: 'Drop before your first draw for 20 points, later for 40.' },
        { h: 'Declaring', body: 'A wrong show costs 80. Losing points are capped at 80.' },
      ],
    },
    teenpatti: {
      ruleset: { name: 'Teen Patti', source: 'Traditional Teen Patti rules · virtual chips only', simplified: false },
      variants: [],
      glance: ['Everyone pays a boot and gets three cards', 'Play blind or seen, then bet or pack', 'Best three-card hand at the show wins'],
      rules: [
        { h: 'Betting', body: 'Blind chaal is one stake; seen players bet double.' },
        { h: 'Side-show', body: 'A seen player can ask the previous seen player to compare; the lower hand packs.' },
        { h: 'Show', body: 'When two seen players remain, either can call a show. Virtual chips only.' },
      ],
    },
    bluff: {
      ruleset: { name: 'Bluff', source: 'Classic Bluff (Cheat) card-game rules', simplified: false },
      variants: [range('lives', 'Lives', 3, 1, 5, 'host')],
      glance: ['Play 1–3 cards face down and claim a rank', 'Anyone can call "Bluff"', 'Empty your hand first to win'],
      rules: [
        { h: 'Claims', body: 'The first claim locks the rank for that pile. Later plays must claim the same rank.' },
        { h: 'Calling', body: 'If the claim was a lie, the bluffer loses a life; if it was true, the caller does.' },
        { h: 'Winning', body: 'Your last play still needs a Call or Pass. Lose all lives and you are out.' },
      ],
    },
    tambola: {
      ruleset: { name: 'Tambola', source: 'Classic Tambola (Housie) rules', simplified: false },
      variants: [],
      glance: ['Numbers 1–90 are called one by one', 'Matching numbers on your ticket are marked', 'Claim prizes before the next call'],
      rules: [
        { h: 'Ticket', body: 'A 3×9 ticket with 15 numbers.' },
        { h: 'Prizes', body: 'Early Five, top / middle / bottom line, four corners, then Full House.' },
        { h: 'Ending', body: 'The first valid Full House ends the game.' },
      ],
    },
    streetcricket: {
      ruleset: { name: 'Street Cricket', source: 'Simplified street formats · not the full Laws of Cricket', simplified: true },
      variants: [opt('format', 'Format', 'over', ['over', 'nets', 'chase'], 'host')],
      glance: ['Time your swing to score runs', 'Get out and your innings ends', 'Live: bat, then swap and bowl'],
      rules: [
        { h: 'Formats', body: 'Over: score in a short over. Nets: clean hits in a row. Chase: reach a target.' },
        { h: 'Live', body: 'One player bowls while the other bats, then innings swap. Higher score wins.' },
      ],
    },
    badminton: {
      ruleset: { name: 'Badminton', source: 'Simplified rules based on the BWF Laws of Badminton', simplified: true },
      variants: [],
      glance: ['Time your tap to return the shuttle', 'Win a rally, win the point', 'First to 21 wins (by 2, capped at 30)'],
      rules: [
        { h: 'Scoring', body: 'One game to 21 points, win by 2; at 29-all the next point wins. Not best-of-three.' },
        { h: 'Contact', body: 'Arcade timing contact rather than full court physics. Sweet hits tighten the rally.' },
      ],
    },
    penalty: {
      ruleset: { name: 'Penalty Shootout', source: 'Simplified rules based on the IFAB Laws of the Game (penalty shootout)', simplified: true },
      variants: [opt('bestOf', 'Kicks each', 5, [3, 5, 10], 'host')],
      glance: ['Take turns shooting and saving', 'Most goals after the kicks wins', 'Level? Sudden death'],
      rules: [
        { h: 'Shooting', body: 'Aim on the goal, then hold for power — more power spreads your aim.' },
        { h: 'Saving', body: 'Pick a dive, then choose early or late: early covers more, late reacts to the ball.' },
        { h: 'Ending', body: 'The shootout ends early when one side cannot catch up; ties go to sudden death.' },
        { h: 'Live', body: 'Both choose at once and the server reveals the kick — nobody sees the other side first.' },
      ],
    },
    poker: {
      ruleset: { name: 'Texas Hold’em', source: 'Standard No-Limit Texas Hold’em rules · virtual chips only', simplified: false },
      variants: [opt('blinds', 'Friends table blinds', '10/20', ['5/10', '10/20', '25/50', '50/100'], 'host')],
      glance: ['Two private cards, five shared', 'Bet through flop, turn and river', 'Best five-card hand wins the pot'],
      rules: [
        { h: 'Betting', body: 'Fold, check, call, bet, raise or go all-in. No-limit: any raise up to your stack.' },
        { h: 'Hand ranks', body: 'Royal flush, straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, pair, high card.' },
        { h: 'Tables', body: 'Quick tables and Sit & Go use wallet chips; Friends tables use table chips only. Virtual chips only · 18+.' },
      ],
    },
    imposter: {
      ruleset: { name: 'Imposter', source: 'Social deduction party rules · our own word packs', simplified: false },
      variants: [opt('undercover', 'Undercover mode', false, [false, true], 'host')],
      glance: ['Everyone gets the secret word — except the Imposter', 'Give one clue word each', 'Vote out the Imposter'],
      rules: [
        { h: 'Clues', body: 'One word per turn: not the word, not a translation, no repeats.' },
        { h: 'Voting', body: 'Discuss, then vote. If the Imposter is caught they get one guess at the word to steal the win.' },
        { h: 'Undercover', body: 'The Imposter gets a close word instead and does not know they are the odd one out.' },
      ],
    },
    rajamantri: {
      ruleset: { name: 'Raja Mantri Chor Sipahi', source: 'Traditional Raja Mantri Chor Sipahi rules', simplified: false },
      variants: [range('players', 'Players', 4, 4, 8, 'host')],
      glance: ['Everyone draws a secret role', 'The Mantri must find the Chor', 'Right guess keeps points; wrong swaps them'],
      rules: [
        { h: 'Roles', body: 'Raja 1000 · Mantri 800 · Sipahi 500 · Chor 0.' },
        { h: 'The call', body: 'The Raja reveals and calls on the Mantri, who reveals and picks the Chor.' },
        { h: 'Big rooms', body: '5–8 players add Rani, Daku, Senapati and Daroga — find every thief, one pick each.' },
      ],
    },
    charades: {
      ruleset: { name: 'Charades', source: 'Classic charades rules', simplified: false },
      variants: [range('passes', 'Passes per turn', 1, 0, 3, 'host')],
      glance: ['Act out a secret title without talking', 'Your team guesses before time runs out', 'Most correct guesses wins'],
      rules: [
        { h: 'Acting', body: 'No talking, mouthing or pointing at objects that spell the answer.' },
        { h: 'Scoring', body: 'Got it = +1. One pass per turn by default.' },
        { h: 'Video calls', body: 'Teammates can type guesses; close spellings count.' },
      ],
    },
    mostlikely: {
      ruleset: { name: 'Most Likely To', source: 'Classic party rules · our own prompts', simplified: false },
      variants: [
        opt('mode', 'Game', 'mostlikely', ['mostlikely', 'wouldyourather', 'neverhaveiever'], 'host'),
        range('rounds', 'Rounds', 10, 5, 20, 'host'),
        opt('anonymous', 'Anonymous reveal', false, [false, true], 'host'),
      ],
      glance: ['Read the prompt', 'Everyone votes in secret', 'Reveal and see who the room picked'],
      rules: [
        { h: 'Most Likely To', body: 'Vote for one player; the top pick is crowned.' },
        { h: 'Would You Rather', body: 'Pick A or B, then guess what most of the room picked.' },
        { h: 'Never Have I Ever', body: 'Tap I have or Never — "I have" costs a finger; the last hand up wins.' },
      ],
    },
    werewolf: {
      ruleset: { name: 'Werewolf', source: 'Classic Werewolf (Mafia) party rules', simplified: false },
      variants: [opt('theme', 'Theme', 'werewolf', ['werewolf', 'mafia'], 'host'), opt('extraRoles', 'Extra roles', false, [false, true], 'host')],
      glance: ['Secret roles: Werewolves hide among Villagers', 'Night: Werewolves strike; Day: everyone votes', 'Village wins when every Werewolf is out'],
      rules: [
        { h: 'Night', body: 'Werewolves pick a target, the Seer checks one player, the Doctor protects one.' },
        { h: 'Day', body: 'Hear who was taken, discuss, then vote someone out.' },
        { h: 'Winning', body: 'Village wins when all Werewolves are out; Werewolves win when they equal the rest.' },
        { h: 'Advanced', body: 'Optional Hunter, Witch, Bodyguard, Tanner, timers and role reveal.' },
      ],
    },
  };

  const IDS = Object.keys(GAMES);
  const ALIASES = { tictactoe: 'ttt', kakuro: 'ankjod', muqabala: 'quiz', shabdfive: 'wordguess', ohnocards: 'uno', snakesladders: 'snakes', holdem: 'poker', penaltyshootout: 'penalty', cricket: 'streetcricket' };

  function canon(id) {
    const raw = String(id || '').toLowerCase().replace(/[\s-]+/g, '');
    return ALIASES[raw] || raw;
  }
  function get(id) {
    return GAMES[canon(id)] || null;
  }
  function defaults(id) {
    const g = get(id);
    const out = {};
    (g ? g.variants : []).forEach((v) => (out[v.key] = v.default));
    return out;
  }

  function coerce(v, value) {
    if (v.options) return v.options.some((o) => o === value) ? value : v.default;
    if (v.range) {
      const n = Number(value);
      return Number.isFinite(n) ? Math.max(v.range[0], Math.min(v.range[1], Math.round(n))) : v.default;
    }
    return v.default;
  }

  /** Known keys only, each coerced into its allowed options / range. */
  function normalize(id, values) {
    const g = get(id);
    const out = defaults(id);
    if (!g || !values) return out;
    g.variants.forEach((v) => {
      if (values[v.key] !== undefined && values[v.key] !== null && values[v.key] !== '') out[v.key] = coerce(v, values[v.key]);
    });
    return out;
  }

  function display(v, value) {
    if (value === true) return 'On';
    if (value === false) return 'Off';
    return String(value);
  }

  function nonDefault(id, values) {
    const g = get(id);
    if (!g || !values) return [];
    const norm = normalize(id, values);
    return g.variants
      .filter((v) => norm[v.key] !== v.default)
      .map((v) => ({ key: v.key, label: v.label, value: norm[v.key], text: v.label + ': ' + display(v, norm[v.key]) }));
  }

  /** Frozen variant record stored with a Live match at start (both players read the same one). */
  function lockVariants(id, values) {
    const g = get(id);
    return Object.freeze({
      game: canon(id),
      ruleset: g ? g.ruleset.name : '',
      values: Object.freeze(normalize(id, values)),
      locked: true,
    });
  }

  function canChange(id, key, ctx) {
    const g = get(id);
    const v = g && g.variants.find((x) => x.key === key);
    if (!v) return false;
    const c = ctx || {};
    if (c.locked) return false;
    if (v.who === 'solo') return !c.live;
    if (v.who === 'host') return !c.live || !!c.isHost;
    return true;
  }

  /** Map the launch context the registry already builds onto declared variant keys. */
  function fromLaunchCtx(id, ctx) {
    const c = ctx || {};
    const key = canon(id);
    const out = {};
    if (key === 'chess') {
      if (c.timeControl || c.timeControlLabel) out.time = String(c.timeControl || c.timeControlLabel).replace('∞', 'none');
      else if (c.min || c.timeMin) out.time = (c.min || c.timeMin) + '+' + (c.inc || c.timeInc || 0);
      if (c.days) out.time = 'daily' + c.days;
      const tv = get('chess').variants[0];
      if (out.time && tv.options.indexOf(out.time) < 0 && /^\d+(\.\d+)?\+\d+$/.test(out.time)) out.time = 'custom';
      if (c.chess960) out.chess960 = true;
    }
    if (key === 'ludo' && c.ludoMode) out.mode = c.ludoMode;
    if (c.variants && typeof c.variants === 'object') Object.assign(out, c.variants);
    return normalize(key, out);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function sheetHtml(id, opts) {
    const g = get(id);
    if (!g) return '';
    const o = opts || {};
    const house = nonDefault(id, o.variants);
    const glance = g.glance.map((l) => '<li>' + esc(l) + '</li>').join('');
    const rules = g.rules.map((r) => '<p><strong>' + esc(r.h) + '.</strong> ' + esc(r.body) + '</p>').join('');
    const houseHtml = house.length
      ? '<div class="dangal-rules__house"><div class="dangal-rules__label">House rules in this game</div><ul>' +
        house.map((h) => '<li>' + esc(h.text) + '</li>').join('') +
        '</ul></div>'
      : '';
    const simplified = g.ruleset.simplified ? ' <span class="dangal-rules__tag">Simplified rules</span>' : '';
    return (
      '<div class="dangal-rules" data-dangal-rules-sheet="' + esc(canon(id)) + '">' +
      houseHtml +
      '<ul class="dangal-rules__glance">' + glance + '</ul>' +
      '<details class="dangal-rules__full"><summary>Full rules</summary>' + rules +
      '<p class="dangal-rules__source">' + esc(g.ruleset.source) + simplified + '</p></details>' +
      '</div>'
    );
  }

  function liveVariantsFor(id) {
    try {
      const map = (typeof window !== 'undefined' && window.__dangalLiveVariants) || {};
      return map[canon(id)] || null;
    } catch (e) {
      return null;
    }
  }

  function openSheet(id, opts) {
    const g = get(id);
    if (!g || typeof window === 'undefined') return false;
    const o = opts || {};
    const variants = o.variants || liveVariantsFor(id);
    const html = sheetHtml(id, { variants });
    if (typeof window.openHalfSheet === 'function') {
      window.openHalfSheet({ id: 'dangalRulesSheet', title: o.title || g.ruleset.name + ' · Rules', accent: 'dangal', snap: 'mid', bodyHtml: html });
      return true;
    }
    if (typeof window.showToast === 'function') window.showToast(g.glance.join(' · '));
    return true;
  }

  /** Adds a "Rules" button to the newest game top bar that has no How-to/Rules control yet. */
  function injectButton(id) {
    if (typeof document === 'undefined' || !get(id)) return false;
    const bars = document.querySelectorAll('.game-chrome-right');
    for (let i = bars.length - 1; i >= 0; i--) {
      const bar = bars[i];
      if (!bar.isConnected || bar.offsetParent === null) continue;
      const scope = bar.closest('.game-overlay, .game-chrome') || bar;
      if (scope.querySelector('.game-howto-btn, [data-dangal-rules]')) return true;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'game-howto-btn';
      btn.dataset.dangalRules = canon(id);
      btn.setAttribute('aria-label', 'Rules');
      btn.textContent = 'Rules';
      bar.appendChild(btn);
      return true;
    }
    return false;
  }

  let observer = null;
  let watching = '';
  let watchUntil = 0;
  function ensureRulesButton(id) {
    if (typeof document === 'undefined' || !get(id)) return;
    watching = canon(id);
    watchUntil = Date.now() + 15000;
    injectButton(watching);
    if (observer || typeof MutationObserver === 'undefined') return;
    let pending = false;
    observer = new MutationObserver(() => {
      if (!watching || Date.now() > watchUntil) {
        observer.disconnect();
        observer = null;
        return;
      }
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        if (watching && Date.now() <= watchUntil) injectButton(watching);
      }, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('[data-dangal-rules]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      openSheet(btn.dataset.dangalRules);
    });
  }

  return {
    GAMES,
    IDS,
    get,
    defaults,
    normalize,
    nonDefault,
    lockVariants,
    canChange,
    fromLaunchCtx,
    sheetHtml,
    openSheet,
    ensureRulesButton,
  };
});
