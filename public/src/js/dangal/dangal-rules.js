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
      glance: ['Guess the five-letter word in six tries', 'Green: right letter, right spot · Amber: right letter, wrong spot', 'One Daily puzzle per day — the same for everyone'],
      rules: [
        { h: 'Guesses', body: 'Each guess must be a real five-letter word from our list. Letters that appear twice are only marked as often as they are in the answer.' },
        { h: 'Hard mode', body: 'Revealed greens must stay in place and ambers must be reused in later guesses. Choose it before your first guess.' },
        { h: 'Daily', body: 'A new puzzle at your local midnight. It counts for your streak, which follows your account on every device. Past puzzles can be replayed from the archive.' },
        { h: 'Practice', body: 'Unlimited random words with their own stats — never touches your Daily streak.' },
        { h: 'Friends', body: 'See how the people you follow did today — only after you finish, so nothing is spoiled. Challenge a friend with your own word; it is encrypted in the link.' },
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
      ruleset: { name: 'Oh No!', source: 'Rules based on the classic shedding card game', simplified: false },
      variants: [
        opt('target', 'Play to', 500, [0, 250, 500], 'host'),
        opt('stacking', 'Stacking: Draw Two on Draw Two, Draw Four on Draw Four', false, [false, true], 'host'),
        opt('stackMix', 'Stacking mix: Draw Two and Draw Four stack together', false, [false, true], 'host'),
        opt('jumpIn', 'Jump-In: play an identical card out of turn', false, [false, true], 'host'),
        opt('sevenZero', '7-0: 7 swaps hands, 0 passes all hands', false, [false, true], 'host'),
        opt('drawUntil', 'Draw until you can play', false, [false, true], 'host'),
        opt('forcePlay', 'Force play: a playable drawn card must be played', false, [false, true], 'host'),
        opt('noBluff', 'No bluffing: Draw Four always legal, no challenge', false, [false, true], 'host'),
        opt('quick', 'Quick round: deal 5 cards', false, [false, true], 'host'),
      ],
      glance: ['Match the top card by colour, number or symbol', 'Skip, Reverse, Draw Two and Wilds change the game', 'Empty your hand first — shout "Oh No!" at one card'],
      rules: [
        { h: 'Deck', body: '108 cards: four colours of 0–9 (one 0, two of 1–9), two Skip, Reverse and Draw Two per colour, plus 4 Wilds and 4 Wild Draw Fours. Deal 7 each; 2–10 players.' },
        { h: 'Your turn', body: 'Play a card matching the colour, number or symbol, or a Wild. You may draw instead, even if you could play; a playable drawn card may be played right away, otherwise play passes.' },
        { h: 'Starting card', body: 'Wild Draw Four: reshuffle and flip again. Wild: the first player picks the colour. Draw Two: the first player draws 2 and is skipped. Reverse: play starts with the dealer, going the other way. Skip: the first player is skipped.' },
        { h: 'Action cards', body: 'Skip: next player misses a turn. Reverse: direction flips (with 2 players it acts as a Skip). Draw Two: next player draws 2 and is skipped. Wild: pick the colour.' },
        { h: 'Wild Draw Four', body: 'Only legal when you hold no card of the current colour. The next player may challenge: if you bluffed you draw 4; if you were honest they draw 6. The challenger privately sees your hand. Unchallenged: they draw 4 and are skipped.' },
        { h: 'Oh No!', body: 'Tap "Oh No!" as you play your second-to-last card. If someone taps "Catch!" before the next player starts their turn, you draw 2.' },
        { h: 'Draw pile', body: 'When it runs out, the discards (except the top card) are reshuffled.' },
        { h: 'Scoring', body: 'The first to empty their hand scores the cards left in everyone else’s: numbers at face value, Skip / Reverse / Draw Two 20, Wilds 50. Play a single round, or to 250 or 500.' },
        { h: 'House rules', body: 'Optional, locked when the game starts and shown in the lobby: Stacking (with a mix option), Jump-In, 7-0, Draw until playable, Force play, No bluffing, Quick round (5 cards).' },
        { h: 'Live', body: '20 seconds per turn. Miss it and you auto-draw, then pass; after 3 misses — or if you leave — a labelled bot finishes your seat and you place last.' },
        { h: 'Payouts', body: 'Optional virtual-chip stake. Everyone antes; placement by match score. 2 players: winner takes both · 3: 70/30 · 4: 60/30/10 · 5+: 50/30/20. Bots never take chips.' },
      ],
    },
    scribble: {
      ruleset: { name: 'Scribble', source: 'Draw-and-guess party rules · our own word list', simplified: false },
      variants: [
        range('rounds', 'Rounds', 3, 2, 10, 'host'),
        range('drawTime', 'Draw time (s)', 80, 30, 180, 'host'),
        range('hints', 'Letter hints', 2, 0, 3, 'host'),
      ],
      glance: ['The drawer picks 1 of 3 words and draws it', 'Everyone else types guesses in the chat', 'Faster guesses score more'],
      rules: [
        { h: 'Turns', body: 'Each round everyone draws once. The drawer has 15 seconds to pick an easy, medium or hard word (one is picked for them if time runs out).' },
        { h: 'Scoring', body: 'A correct guess scores 50 + 250 × (time left ÷ draw time), so 300 at the start down to 50 at the buzzer. The drawer earns 200 ÷ (players guessing) per correct guesser, at least 10 each.' },
        { h: 'Hints', body: 'Letters are revealed at even points through the draw time (0–3 hints, at least two letters stay hidden). Guesses one or two letters off show a private "So close!".' },
        { h: 'Fair play', body: 'Correct guesses are hidden from the chat. The drawer and players who already guessed cannot type the word. Players can vote to kick, hosts can remove, and any drawing or player can be reported.' },
        { h: 'Players', body: '2–12 players in a Live room. If the drawer leaves, their turn is skipped; if the host leaves, another player takes over.' },
      ],
    },
    quiz: {
      ruleset: { name: 'Quiz Muqabala', source: 'Timed multiple-choice quiz · our own questions', simplified: false },
      variants: [
        opt('length', 'Questions (Party)', 10, [5, 10, 15, 20], 'host'),
        opt('questionMs', 'Time per question (Party, ms)', 20000, [10000, 15000, 20000, 30000], 'host'),
        opt('difficulty', 'Difficulty (Party)', 0, [0, 1, 2, 3], 'host'),
      ],
      glance: ['Everyone gets the same question at the same moment', 'Tap one of four answers before the ring runs out', 'Correct and fast scores most'],
      rules: [
        { h: 'Scoring', body: 'A correct answer scores 600 + 400 × (time left ÷ time limit): 1000 for an instant answer, 600 at the buzzer. Wrong or no answer scores 0.' },
        { h: 'Ties', body: 'Equal scores are split by total answer time — lower wins. Unanswered questions count the full time. Exactly equal is a draw.' },
        { h: 'Fair timing', body: 'Questions open at the same server time for everyone. Your answer time is measured on the server, minus half your measured network round trip (at most 0.25 s), so a slower connection is not punished. Answers are checked on the server; nobody sees the right answer before the reveal.' },
        { h: 'Duel', body: 'Live 1v1, rated. 10 questions, 15 seconds each, the same questions and option order for both players, matched to your ratings. You see when your opponent has answered, never what they picked.' },
        { h: 'Disconnects', body: 'Dropping mid-question simply counts as no answer; rejoin and carry on. Leaving a Duel, or staying away for 60 seconds, forfeits and counts as a rated loss.' },
        { h: 'Party Quiz', body: '2–50 players in a room. The host picks categories, length, time per question and difficulty, and can run a big-screen view while everyone answers on their phone.' },
        { h: 'Daily Quiz', body: '10 questions, the same for everyone, new at your local midnight. One attempt; leaderboards and streaks after you finish.' },
        { h: 'Reports', body: 'Think a question is wrong, unclear or offensive? Tap Report on the reveal — flagged questions are reviewed and removed.' },
      ],
    },
    carrom: {
      ruleset: { name: 'Carrom', source: 'Rules based on the ICF Laws of Carrom', simplified: false },
      variants: [
        opt('variant', 'Rules', 'icf', ['icf', 'quick', 'freestyle'], 'host', {
          labels: { icf: 'Standard (to 25 points)', quick: 'Quick (one board)', freestyle: 'Freestyle (casual)' },
        }),
        opt('mode', 'Players', 'singles', ['singles', 'doubles'], 'host'),
      ],
      glance: ['Flick the striker from your baseline to pocket your own men', 'Pocket the Queen after one of yours, then cover it on the same or next shot', 'Clear your men first — you score one point for each of theirs left'],
      rules: [
        { h: 'Setup and break', body: 'Men start in the centre with the Queen on the red spot. A toss decides who breaks; the breaker plays white. The break must touch a man — three tries, then the turn passes. No due is taken on the break.' },
        { h: 'Striker', body: 'Place the striker on your baseline, touching both lines, either covering a base circle completely or clear of it, and not touching the arrow line or any man.' },
        { h: 'Your turn', body: 'Pocket one of your men (or cover the Queen) and you shoot again. Otherwise the turn passes to your right. Pocketing an opponent’s man counts for them and ends your turn.' },
        { h: 'Queen', body: 'You may only pocket the Queen after you have pocketed one of your own men and while you owe no due. Cover it by pocketing one of yours on the same stroke or the very next one; otherwise it goes back to the centre.' },
        { h: 'Fouls and dues', body: 'Pocketing the striker is a foul: one of your pocketed men comes back as a due (plus any man pocketed on that stroke), and the turn passes unless you also pocketed one of yours. The opponent places dues inside the outer circle, off the centre spot, touching no other man. If you have none pocketed, the due waits until you do. A pending Queen goes back.' },
        { h: 'Shot clock', body: '20 seconds per stroke in Live (the ICF allows 15; we add five for touch aiming). Running out of time is a foul: one man back and the turn passes. Three in a row forfeits. Placing a due has 15 seconds.' },
        { h: 'Last men', body: 'Pocketing your opponent’s last man, or your last man while the Queen is still on the board, loses the board. Finishing with the striker brings those men back with a due.' },
        { h: 'Board score', body: 'The board winner scores one point for each opponent man left, plus 3 for the Queen if they covered it — only while their score is 21 or less. A board is worth at most 12.' },
        { h: 'Game', body: 'First to 25 points, or the leader after 8 boards. Level after 8: one extra board, with a toss for the break. Quick plays one board.' },
        { h: 'Doubles', body: 'Partners sit opposite and play the same colour. Turns go to the right, so partners alternate with opponents. The break moves to the right each board. Dues are placed by the player on the shooter’s right.' },
        { h: 'Freestyle', body: 'Casual: any man is yours. White 20, black 10, Queen 50 (it still needs a cover). First to 160 wins. Unrated.' },
        { h: 'Live', body: 'Singles Standard and Quick are rated; Freestyle and doubles are not. Leaving forfeits the game (a whole team in doubles). Optional virtual-chip stake, never with bots.' },
      ],
    },
    rummy: {
      ruleset: { name: 'Rummy', source: 'Standard 13-card (Indian) Rummy and classic Gin Rummy rules', simplified: false },
      variants: [
        opt('mode', 'Game', 'gin', ['13', 'gin'], 'host', { labels: { 13: '13-card Rummy', gin: 'Gin Rummy' } }),
        opt('format', 'Format (13-card)', 'points', ['points', 'pool', 'deals'], 'host', { labels: { points: 'Points', pool: 'Pool', deals: 'Deals' } }),
        opt('pool', 'Pool limit', 101, [101, 201], 'host'),
        opt('deals', 'Deals', 2, [2, 3, 6], 'host'),
        opt('knock', 'Gin: knock at', 10, [10, 5, 0], 'host'),
        opt('target', 'Gin: game to', 100, [100, 50], 'host'),
        opt('scoring', 'Gin scoring', 'simple', ['simple', 'classic'], 'host', { labels: { simple: 'Simple', classic: 'Classic (game + box bonuses)' } }),
      ],
      glance: ['Draw a card, throw a card', 'Group your hand into sequences (runs) and sets', '13-card: declare with a valid hand · Gin: knock with little deadwood'],
      rules: [
        { h: '13-card: deal', body: '2–6 players, 13 cards each. Up to 2 players use one deck with one printed joker; 3–6 use two decks with two. A card is cut face up: every card of that rank is a wild joker for the deal (a cut printed joker makes Aces wild). The cut card stays out of play.' },
        { h: '13-card: your turn', body: 'Draw from the closed deck or take the top open card, then throw one card. You can’t take a joker from the open pile (except the very first open card), and you can’t throw back the card you just picked.' },
        { h: '13-card: a valid show', body: 'Group all 13 cards into sequences and sets. You need at least two sequences, and at least one of them must be pure (no joker). Sets are 3–4 cards of one rank in different suits. Sequences are 3+ cards of one suit in order; Ace can be low (A-2-3) or high (Q-K-A) but not both (no K-A-2).' },
        { h: '13-card: declare', body: 'Put your 14th card on Finish with your groups. A valid show wins the deal and the others then have 45 seconds to group their cards; anything not grouped is counted for them. A wrong show costs 80 and play goes on.' },
        { h: '13-card: points', body: 'A, K, Q and J score 10, number cards their face value, jokers 0. If your hand has no pure sequence everything counts; with a pure but no second sequence, everything except the pure sequence counts. The most you can lose in a deal is 80. Drop before your first draw for 20, later for 40 (Pool 201: 25 / 50). Leaving or timing out mid-deal counts 80.' },
        { h: 'Points', body: 'One deal. The winner collects the losers’ points × the table’s rate (in virtual chips; a friendly table only keeps score).' },
        { h: 'Pool 101 / 201', body: 'Points add up deal after deal; reach the limit and you’re out. The last player left wins the pool. An eliminated player may rejoin once (at a chip table, for another entry fee) while the leader has 79 or less (174 in Pool 201), starting one point above the highest score.' },
        { h: 'Deals', body: 'A fixed 2, 3 or 6 deals. Everyone starts with 80 × deals chips of score; losers pay their points to each deal’s winner. There is no drop. Most chips at the end wins; a tie plays one more deal between the tied players.' },
        { h: 'Gin: play', body: 'Two players, 10 cards each, one deck, no jokers; Ace is always low. The non-dealer may take the upcard, then the dealer; if both pass, the non-dealer draws from the stock. Each turn: draw from the stock or discard pile, then discard.' },
        { h: 'Gin: knock and Gin', body: 'Knock when your unmatched cards (deadwood: face cards 10, Ace 1) total 10 or less (the table can set 5, or 0 for Gin only). All 10 in melds is Gin: +25 and the opponent can’t lay off. After a knock the defender may lay off deadwood on the knocker’s melds. The knocker scores the difference; if the defender has equal or less deadwood it’s an undercut: the defender scores the difference +25. Big Gin (optional): all 11 cards melded, +31.' },
        { h: 'Gin: game', body: 'First to 100 (or 50). Simple scoring adds hand scores. Classic adds 100 for the game and 25 per hand won (box), doubled on a shutout. If the stock gets down to two cards with no knock, the hand is a draw.' },
        { h: 'Live', body: '30 seconds per turn (25 in Gin), then your extra-time bank for the match. A missed turn auto-plays (draw and throw); miss again and you auto-drop (Deals: full count, Gin: forfeit). Hands are dealt on our server and only you ever receive your cards. Two players are rated; bots at the table keep it friendly. Chip tables are 18+.' },
      ],
    },
    teenpatti: {
      ruleset: { name: 'Teen Patti', source: 'Traditional Teen Patti rules · virtual chips only', simplified: false },
      variants: [
        opt('variant', 'Variant', 'classic', ['classic', 'muflis', 'ak47', 'joker'], 'host', {
          labels: { classic: 'Classic', muflis: 'Muflis (lowest wins)', ak47: 'AK47 (A K 4 7 wild)', joker: 'Joker (cut rank wild)' },
        }),
        opt('blindMax', 'Blind limit', 4, [2, 3, 4, 5], 'host'),
        opt('potX', 'Pot limit (× boot)', 50, [25, 50, 100], 'host'),
        opt('hands', 'Hands per table', 10, [10, 20, 30], 'host'),
      ],
      glance: ['Everyone pays the boot and gets three cards', 'Bet blind, or look and bet double — or pack', 'Best three-card hand at the show wins the pot'],
      rules: [
        { h: 'Table', body: '3–7 players, one deck. Everyone puts in the boot; the first stake equals the boot. Bots fill empty seats (then nothing is at stake).' },
        { h: 'Blind or seen', body: 'Blind players bet the current stake without looking. Once you look (Seen), you bet double. After the blind limit (4 blind bets by default) you must look.' },
        { h: 'Chaal and raise', body: 'Chaal matches the stake (seen: 2×). Raise doubles the stake (a seen raise costs 4× the old stake). The stake can’t go above 16 × boot.' },
        { h: 'Pack', body: 'Fold your hand; what you put in stays in the pot. Running out of time packs.' },
        { h: 'Show', body: 'Only when two players are left. It costs your current bet. A seen player can’t ask a blind player for a show. Both hands are shown; on equal hands the player who asked loses.' },
        { h: 'Side show', body: 'A seen player may pay a seen bet and ask the previous player still in (who must also be seen) to compare privately. They can accept — the lower hand packs, and on equal hands the asker packs — or deny, and play moves on.' },
        { h: 'Pot limit', body: 'When the pot reaches the limit (50 × boot by default), every hand still in is shown and the best takes the pot. Exact ties split.' },
        { h: 'Hand ranks', body: 'Trail (three of a kind) > Pure sequence (straight flush) > Sequence > Colour (flush) > Pair > High card. A-K-Q is the top sequence, A-2-3 the second, then K-Q-J down to 4-3-2. No wrap-around (K-A-2). Suits never rank.' },
        { h: 'Variants', body: 'Muflis: the lowest hand wins (the ranking is reversed). AK47: every Ace, King, 4 and 7 is wild. Joker: a card is cut each hand and its rank is wild. A wild card becomes whatever makes your best hand.' },
        { h: 'Chips', body: 'Virtual chips only — they can’t be bought or cashed out. Your stack is the buy-in (or your balance if lower); after the last hand everyone’s result is their stack minus the buy-in. Teen Patti is 18+. Unrated.' },
      ],
    },
    bluff: {
      ruleset: { name: 'Bluff', source: 'Classic Bluff / Cheat / I Doubt It rules · two regional styles', simplified: false },
      variants: [
        opt('style', 'Style', 'sequence', ['sequence', 'follow'], 'host', { labels: { sequence: 'Sequence (A, 2, 3 … K)', follow: 'Follow the rank' } }),
        opt('windowSec', 'Bluff window (seconds)', 5, [3, 5, 8], 'host'),
        opt('maxPlay', 'Max cards per play', 0, [0, 3, 4, 6], 'host', { labels: { 0: 'Auto (4, or 6 with two decks)' } }),
        opt('jokers', 'Jokers wild', false, [false, true], 'host'),
        opt('placements', 'Play on for places', false, [false, true], 'host'),
      ],
      glance: ['Play cards face down and say what they are', 'Anyone can call "Bluff!" before the timer ends', 'First to empty their hand — and survive the call — wins'],
      rules: [
        { h: 'Table', body: '3–8 players. One deck for up to 5 players, two decks from 6. All the cards are dealt out; some players may hold one more.' },
        { h: 'Sequence', body: 'Claims run in order: Aces, Twos, Threes … Kings, then Aces again. On your turn you must play 1–4 cards (up to 6 with two decks) face down and claim they are the current rank — true or not. There is no passing.' },
        { h: 'Follow the rank', body: 'The leader names any rank and plays. Each next player claims the same rank or passes. When everyone else has passed in a row, the pile is set aside out of play and the last player who put cards down leads a new rank.' },
        { h: 'Calling Bluff', body: 'After every play there is a short window (5 seconds by default). Anyone still holding cards can call "Bluff!" — the first call wins the race. Only that last play is turned over.' },
        { h: 'Who picks up', body: 'If any card isn’t the claimed rank, the player who played picks up the whole pile. If every card matches, the caller picks it up. Sequence then carries on with the next rank from the player after the one who played. In Follow the rank the winner of the challenge leads a new rank.' },
        { h: 'Winning', body: 'You win when your hand is empty and you survive your last play: either nobody calls in time, or someone calls and your cards were true. Caught on your last play? You pick up the pile and keep going. With "Play on for places" the game continues until one player is left holding cards.' },
        { h: 'Jokers', body: 'Off by default. When on, two jokers per deck are added and a joker always counts as the claimed rank.' },
        { h: 'Live', body: '25 seconds per turn. A missed turn passes (Follow the rank) or plays one card; after 3 missed turns, or if you leave, a bot takes your seat and hand and you forfeit. Cards are dealt on our server; face-down cards are never sent to anyone until they are turned over. Very long games end after 60 plays per player: fewest cards wins. Bots at the table keep it friendly (no stakes).' },
      ],
    },
    tambola: {
      ruleset: { name: 'Tambola', source: 'Classic Tambola / Housie (90-ball) and Bingo (75-ball) rules', simplified: false },
      variants: [
        opt('variant', 'Game', '90', ['90', '75'], 'host', { labels: { 90: '90-ball Tambola', 75: '75-ball Bingo' } }),
        opt('pace', 'Seconds between numbers', 8, [5, 8, 12], 'host'),
        opt('daub', 'Marking', 'manual', ['manual', 'auto'], 'host', { labels: { manual: 'Tap to mark', auto: 'Auto-mark' } }),
        opt('bogey', 'Wrong claims', 'block', ['block', 'warn'], 'host', { labels: { block: 'Block that ticket for the prize', warn: 'Warn first, then block' } }),
        opt('mode', 'Play for', 'fun', ['fun', 'table'], 'host', { labels: { fun: 'Just for fun', table: 'Table chips' } }),
      ],
      glance: ['Numbers are called one at a time', 'Mark them on your ticket', 'Complete a pattern and tap Claim before anyone else'],
      rules: [
        { h: 'Tickets (90-ball)', body: 'Each ticket is 3 rows × 9 columns with 15 numbers — 5 in every row. Column 1 holds 1–9, column 2 holds 10–19 … the last column 80–90, sorted top to bottom. A full sheet of 6 tickets holds every number from 1 to 90 exactly once. Buy 1–6 tickets, or a full sheet.' },
        { h: 'Calling', body: 'Numbers are drawn at random on our server, one every 5, 8 or 12 seconds (the host picks and can pause). Every number called stays on the board. The caller can use traditional calls ("Two little ducks, 22") — a toggle in settings.' },
        { h: 'Prizes', body: 'The host picks the prizes: Early Five (any 5 numbers), Top, Middle and Bottom Line, Four Corners (first and last numbers of the top and bottom rows), Full House (all 15), then 2nd and 3rd Full House. Extras: Early Seven, Star (corners + the middle number), Breakfast / Lunch / Dinner (columns 1–3, 4–6, 7–9).' },
        { h: 'Claims', body: 'Tap Claim on a prize when your ticket has it. It’s checked against the numbers called so far. The first valid claim wins. A valid claim for the same prize within 1 second — on a ticket that was already complete at the same number — shares it. 2nd Full House opens once the Full House is won.' },
        { h: 'Bogey', body: 'A wrong claim is a bogey: that ticket can’t win that prize any more (the host can choose a warning first). One claim every 1.5 seconds per player.' },
        { h: '75-ball Bingo', body: 'A 5×5 card: B 1–15, I 16–30, N 31–45, G 46–60, O 61–75 with a free centre. Patterns: any line (row, column or diagonal), four corners, X, blackout (the whole card) or the host’s own pattern. Calls include the letter ("B 12").' },
        { h: 'Chips', body: 'Private rooms play just for fun (points) or for table chips that stay in the room. Public tables use wallet chips: each ticket costs the table price, prizes are shares of the ticket pot, and any prize won by a bot or never claimed goes back to the buyers. Public tables are 18+. Virtual chips only — they can’t be bought or cashed out.' },
        { h: 'Caller mode', body: 'Run a game for people in the same room with no sign-in and no connection: draws, voice, board, pause. Print or share real tickets; each carries a code so you can Check a ticket when someone shouts Housie.' },
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
  const ALIASES = { tictactoe: 'ttt', kakuro: 'ankjod', muqabala: 'quiz', quizroom: 'quiz', shabdfive: 'wordguess', ohnocards: 'uno', snakesladders: 'snakes', holdem: 'poker', penaltyshootout: 'penalty', cricket: 'streetcricket' };

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
