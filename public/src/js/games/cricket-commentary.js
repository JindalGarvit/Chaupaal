/**
 * Street Cricket commentary — deterministic, context-aware lines for key moments (wickets,
 * boundaries, milestones, last-over tension, reviews, the result) in two personas:
 *   calm — the analyst · fan — the excited fan.
 * AI (server-lib/dangal-ai.js, streetcricket 'over' / 'recap') may replace these per over; this
 * library is the fallback and the AI-off path. Lines never repeat within a match: the picker
 * remembers what it used and stays quiet when a pool runs dry.
 *
 * Numbers in lines only ever come from the match facts ({r}, {score}, {need} …), so the AI
 * grounding check can hold AI lines to the same rule.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CricketCommentary = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PERSONAS = ['calm', 'fan'];
  const MAX_LINE = 140;
  const MAX_RECAP = 320;

  // Placeholders: {bat} batter · {bowl} bowler · {r} batter runs · {b} balls faced · {score} 34/2
  // {need} runs needed · {left} balls left · {shot} shot · {del} delivery · {m} milestone
  // {team} batting side · {winner} · {margin} "12 runs" · {target}
  const T = {
    calm: {
      four: [
        '{bat} finds the gap — four.',
        'Placed, not hit. {bat} collects four.',
        'Good {shot} from {bat}, and that races away.',
        'Four. {bowl} strays and {bat} is quick to cash in.',
        'Textbook. {bat} times it to the rope.',
        'That’s the ball {bat} was waiting for — four.',
        'Four more for {bat}, now {r} off {b}.',
        'Nicely controlled. The fielder had no chance.',
        '{team} move to {score} with a crisp boundary.',
        'Width offered, width punished. Four.',
        'Soft hands, sharp placement — boundary.',
        '{bat} picks the line early and it runs away for four.',
        'The {shot} is on and {bat} plays it well.',
        '{bowl} will want that one back. Four.',
        'A boundary that eases the pressure on {team}.',
        'Four. Simple cricket from {bat}.',
        'Well read by {bat}; the {del} disappears.',
        'Into the gap and gone. {score}.',
        'That’s a controlled boundary — no risk, full reward.',
        'Four runs, and {bat} looks settled on {r}.',
      ],
      six: [
        'Six. {bat} clears the rope with ease.',
        'Clean strike — that’s gone all the way.',
        '{bat} gets under it and it sails for six.',
        'Maximum. {bowl} missed the length by a fraction.',
        'That’s a big hit — six more for {team}.',
        'Up and over. {bat} now on {r}.',
        'Six. The {del} was there to be hit.',
        '{bat} commits to the shot and it pays — six.',
        'Pure timing. That landed well beyond the rope.',
        'Six, and {team} are {score}.',
        'The lofted shot comes off. Maximum.',
        '{bat} picks the length early and launches it.',
        'A calculated risk from {bat}, and it clears the field.',
        'That’s six. {bowl} looks for answers.',
        'Straight and high — six.',
        'Six more. The momentum is with {team}.',
        'Down the ground for six. Clinical.',
        'That’s gone into the next street. Six.',
        'Elevated and cleared — six to {bat}.',
        'Six. {bat} has {r} from {b} balls.',
      ],
      fourClutch: [
        'Four when it matters. {need} needed from {left}.',
        'Composed under pressure — four, and it’s {need} off {left}.',
        'That boundary changes the equation: {need} from {left}.',
        '{bat} keeps the chase alive. {need} to get.',
        'Four. The target is in sight — {need} from {left}.',
        'Big boundary. {team} need {need} now.',
        'Calm head from {bat}. {need} required off {left}.',
      ],
      sixClutch: [
        'Six at the business end. {need} from {left}.',
        'That’s a huge hit in the chase — {need} needed.',
        '{bat} swings the game with a six. {need} off {left}.',
        'Six. Suddenly it’s {need} from {left}.',
        'Nerve and power — six. {team} need {need}.',
        'That could be the shot of the match. {need} to go.',
        'Six under pressure. {need} from {left} now.',
      ],
      bowled: [
        'Bowled. {bowl} hits the top of off.',
        'Through the gate — {bat} is bowled for {r}.',
        'The {del} beats the bat and the stumps.',
        'Bowled him. {bat} played around it.',
        'Timber. {bowl} finds the gap between bat and pad.',
        'Bowled. That was a good delivery at the right time.',
        '{bat} misreads it and loses the off stump. Out for {r}.',
        'Clean bowled — {team} slip to {score}.',
      ],
      caught: [
        'Caught. {bat} goes for it and finds the fielder.',
        'Out — {bat} holes out for {r}.',
        'The {shot} goes straight to the fielder. Caught.',
        'Taken. {bowl} gets the reward for a good plan.',
        'Caught in the deep — {bat} departs for {r}.',
        'Didn’t quite get hold of it. Caught.',
        '{bat} is caught. {team} {score}.',
        'A simple catch in the end. {bowl} strikes.',
      ],
      caughtBehind: [
        'Edged and taken behind. {bat} goes for {r}.',
        'A thin edge, and the keeper does the rest.',
        'Caught behind — {bowl} found the outside edge.',
        'Feather to the keeper. Out.',
        'The {del} draws the edge. Caught behind.',
        '{bat} fishes outside off and pays for it.',
        'Nicked off. {team} are {score}.',
      ],
      lbw: [
        'LBW. Trapped in front.',
        'Given out LBW — {bat} missed a straight one.',
        '{bowl} hits the pad in line. LBW.',
        'Plumb. {bat} goes for {r}.',
        'That was hitting. LBW, and {team} are {score}.',
        'Pinned on the crease — out LBW.',
        'The umpire’s finger goes up. LBW.',
      ],
      runout: [
        'Run out. There was never a second run there.',
        'A mix-up, and {bat} is short of the crease.',
        'Direct hit — {bat} is run out for {r}.',
        'Run out. The pressure told on the running.',
        'Too ambitious. {bat} is run out.',
        'Quick hands in the field — run out.',
        '{bat} sold short by the push. Run out.',
      ],
      stumped: [
        'Stumped. {bat} came down and missed.',
        'Out of the crease and stumped — {bowl} out-thought {bat}.',
        'The keeper whips the bails off. Stumped.',
        'Beaten in the flight, stumped by a distance.',
        'Stumped. The step out didn’t come off.',
        '{bat} was lured out — stumped for {r}.',
        'Sharp work behind the stumps. Out.',
      ],
      streetOut: [
        'Out under street rules — {bat} goes for {r}.',
        'The street rules bite. {bat} is out.',
        'That’s out in these rules. {team} {score}.',
        'Local law, same result: {bat} walks.',
        'Out. Everyone knew the rule, including {bat}.',
        'Street rules claim another. {bat} departs.',
        'A street special. {bat} has to go.',
      ],
      milestone: [
        '{m} for {bat}. A well-paced innings.',
        '{bat} brings up {m} from {b} balls.',
        'That’s {m} for {bat}. Composed and clean.',
        'A fine {m} from {bat}.',
        '{bat} reaches {m}. {bowl} needs a new plan.',
        '{m} up for {bat} — the platform is set.',
        'Milestone: {m} for {bat} off {b}.',
      ],
      teamMilestone: [
        '{team} reach {score}. Solid progress.',
        'The total ticks past a milestone: {score}.',
        '{team} are {score}. The foundation is there.',
        'A useful mark for {team} — {score}.',
        '{score} on the board. Nicely built.',
        '{team} move to {score}. Good tempo.',
        'That brings up a milestone for {team}: {score}.',
      ],
      lastOver: [
        'Final over. {need} needed from {left}.',
        'Last over, {need} to win. Everything to play for.',
        'It comes down to this: {need} from the final over.',
        '{bowl} has the ball. {team} need {need}.',
        'Final over. {need} required — pressure on both.',
        'Six balls, {need} runs. Who blinks first?',
        'The last over begins. {need} to get.',
      ],
      freeHit: [
        'No-ball — and a free hit to follow.',
        'Overstepped. Free hit next.',
        'Free hit coming up. {bat} can swing freely.',
        'A no-ball costs {bowl} — free hit next ball.',
        'That’s a no-ball. The next one is a free hit.',
        'Free hit awarded. Only a run out counts.',
        'Front-foot no-ball. Free hit next.',
      ],
      reviewOverturned: [
        'Review — and the decision is overturned.',
        'The replay changes it. Overturned.',
        'Good review. The on-field call is reversed.',
        'Overturned. The review was worth it.',
        'The tracking tells a different story. Overturned.',
        'Decision reversed on review.',
        'A successful review — overturned.',
      ],
      reviewStands: [
        'Review lost — the decision stands.',
        'The replay backs the umpire. Decision stands.',
        'That review didn’t work. The call stays.',
        'Decision stands, and the review is gone.',
        'The on-field call was right. Review lost.',
        'Stands. That’s the review used up.',
        'No change on review.',
      ],
      reviewUmpiresCall: [
        'Umpire’s call — the decision stays, the review is kept.',
        'Marginal. Umpire’s call, review retained.',
        'It’s clipping — umpire’s call.',
        'Too close to overturn. Umpire’s call.',
        'Umpire’s call. Nothing changes, the review survives.',
        'Tight margins: umpire’s call stands.',
        'Umpire’s call. Both sides can live with that.',
      ],
      winChase: [
        '{winner} complete the chase. Well paced.',
        'Chase done — {winner} win by {margin}.',
        '{winner} get there. A composed finish.',
        'Target reached. {winner} win it.',
        '{winner} win by {margin}. Measured from start to end.',
        'That’s the winning run — {winner} take it.',
        'A controlled chase by {winner}.',
      ],
      winDefend: [
        '{winner} defend it. Win by {margin}.',
        'The total was enough — {winner} win by {margin}.',
        '{winner} hold their nerve and win.',
        'Defended. {winner} win by {margin}.',
        'Disciplined bowling wins it for {winner}.',
        '{winner} close it out by {margin}.',
        'Not enough for the chase — {winner} win.',
      ],
      tie: [
        'Scores level. A tie.',
        'Nothing between them — it’s tied.',
        'A tie. Neither side could be separated.',
        'Level on runs. Remarkable.',
        'Tied. That’s cricket.',
        'All square at the end.',
        'Dead level — a tie.',
      ],
      superOver: [
        'We’re going to a Super Over.',
        'Scores level — Super Over to decide it.',
        'One more over each. Super Over.',
        'Tied, so it’s a Super Over.',
        'Super Over time. Six balls each.',
        'The match goes to a Super Over.',
        'Level after the innings — Super Over next.',
      ],
    },
    fan: {
      four: [
        'FOUR! {bat} smashes it to the fence!',
        'Oh that’s lovely! Four runs!',
        'Crunched! {bat} with a gorgeous {shot}!',
        'BANG! That’s four and {bowl} can only watch!',
        'Races away! {bat} is flying on {r}!',
        'What a shot! FOUR!',
        'Get in! Boundary for {bat}!',
        'Smoked through the gap — FOUR!',
        'That’s a beauty from {bat}! Four more!',
        'Nobody’s stopping that one! FOUR!',
        'Four! {team} rolling along at {score}!',
        'Pow! Straight to the rope!',
        '{bat} is loving this — FOUR!',
        'Oh my, that’s timed! Four!',
        'Pure class from {bat}! Boundary!',
        'Carved away for FOUR!',
        'Right off the middle — four runs!',
        'Too good! FOUR to {bat}!',
        'That {del} got what it deserved — FOUR!',
        'Fence rattled! {bat} on {r} now!',
      ],
      six: [
        'SIX! That’s out of here!',
        'MASSIVE! {bat} sends it into orbit!',
        'Oh, that is HUGE! Six!',
        'Get up, get up — IT’S SIX!',
        'Monster hit from {bat}!',
        'SIX! Somebody go find that ball!',
        '{bat} launches it — MAXIMUM!',
        'Into the stands! SIX!',
        'What a strike! {bat} on {r}!',
        'BOOM! Six runs!',
        'That’s gone miles! SIX!',
        'Out of the ground! {team} {score}!',
        '{bowl} can’t believe it — SIX!',
        'Sky high and over — SIX!',
        'Colossal! That’s a six!',
        'Gone! Over the wall!',
        'Absolutely launched! SIX!',
        'The crowd is up — SIX from {bat}!',
        'That’s a rocket! Maximum!',
        'SIX! {bat} is on fire!',
      ],
      fourClutch: [
        'FOUR! {need} from {left}! Game on!',
        'Huge boundary! Only {need} needed now!',
        'Get in there! {need} off {left}!',
        'FOUR! {team} can smell it — {need} to go!',
        'What nerve! Four, and it’s {need} from {left}!',
        'Boundary at the death! {need} needed!',
        'Yes! FOUR! {need} off {left}!',
      ],
      sixClutch: [
        'SIX! {need} needed from {left}! Unbelievable!',
        'HUGE six at the death! {need} to go!',
        'Are you kidding?! SIX! {need} off {left}!',
        'SIX! This chase is ALIVE — {need} needed!',
        'What a moment! Six! {need} from {left}!',
        'MAXIMUM when it counts! {need} to win!',
        'SIX! Hearts racing — {need} off {left}!',
      ],
      bowled: [
        'BOWLED HIM! Stumps everywhere!',
        'Timber! {bat} is gone for {r}!',
        'Cleaned up! What a ball from {bowl}!',
        'The stumps are cartwheeling! BOWLED!',
        'Oh, that’s a peach! {bat} bowled!',
        'Knocked him over! {team} {score}!',
        'BOWLED! {bowl} is pumped!',
        'Middle stump — gone!',
      ],
      caught: [
        'CAUGHT! What a take!',
        'Got him! {bat} holes out for {r}!',
        'Straight down the fielder’s throat — OUT!',
        'Caught! {bowl} is celebrating!',
        'OUT! That catch will be on the highlights!',
        'Gone! {bat} couldn’t clear the field!',
        'Snaffled! {team} are {score}!',
        'Taken! Big wicket!',
      ],
      caughtBehind: [
        'NICKED IT! Keeper takes a beauty!',
        'Edged and gone! {bat} out for {r}!',
        'Feathered to the keeper — OUT!',
        'Got the edge! Huge wicket!',
        'Caught behind! {bowl} is thrilled!',
        'Outside edge — taken!',
        'Keeper makes no mistake! OUT!',
      ],
      lbw: [
        'LBW! That’s plumb!',
        'Trapped! {bat} has to go!',
        'Finger goes up — LBW!',
        'Right in front! OUT!',
        'LBW! {bowl} can’t hide the grin!',
        'Pinned! {bat} gone for {r}!',
        'Dead in front — LBW!',
      ],
      runout: [
        'RUN OUT! Oh dear, oh dear!',
        'Direct hit! {bat} is gone!',
        'Chaos! Run out!',
        'Short of the crease — RUN OUT!',
        'What a throw! {bat} is out for {r}!',
        'Never a run! Run out!',
        'Pushed too hard — RUN OUT!',
      ],
      stumped: [
        'STUMPED! Lightning hands!',
        'Down the track and done! Stumped!',
        'Bails off in a flash — STUMPED!',
        '{bat} was miles out! Stumped!',
        'Tricked him! {bowl} gets the stumping!',
        'Stumped! What glovework!',
        'Came dancing, went walking! STUMPED!',
      ],
      streetOut: [
        'Street rules! {bat} is OUT!',
        'Ha! That’s out in the street!',
        'Rules are rules — {bat} walks!',
        'Out! The street has spoken!',
        'Gone under house rules! {team} {score}!',
        'That’s OUT round here!',
        'Street justice! {bat} departs!',
      ],
      milestone: [
        '{m} for {bat}! Take a bow!',
        'Bat raised! {bat} brings up {m}!',
        '{m} up! {bat} is unstoppable!',
        'What a knock! {m} for {bat}!',
        '{bat} hits {m} off just {b}!',
        'Cheers all round — {m} for {bat}!',
        'Milestone! {bat} has {m}!',
      ],
      teamMilestone: [
        '{team} are flying — {score}!',
        '{score}! The runs keep coming!',
        'Look at that total — {score}!',
        '{team} storm to {score}!',
        'Up and up! {score} on the board!',
        '{score}! What a platform!',
        'The scoreboard is spinning — {score}!',
      ],
      lastOver: [
        'LAST OVER! {need} needed!',
        'Here we go! Final over, {need} to win!',
        'Edge of the seat! {need} from {left}!',
        'This is it! {need} to get!',
        'Final over drama! {need} needed!',
        'Six balls, {need} runs — can they do it?!',
        'Nails bitten! Last over, {need} to win!',
      ],
      freeHit: [
        'No-ball! FREE HIT coming!',
        'Free hit! Swing away, {bat}!',
        'Overstepped! Free hit next!',
        'Uh oh, {bowl} — free hit!',
        'FREE HIT! Nothing to lose!',
        'No-ball! Free swing next ball!',
        'Free hit time! Let’s go!',
      ],
      reviewOverturned: [
        'OVERTURNED! What a review!',
        'The replay says no — overturned!',
        'Brilliant call to review! Reversed!',
        'Overturned! The crowd goes wild!',
        'Review wins! Decision flipped!',
        'Turned around on replay!',
        'Great review! OVERTURNED!',
      ],
      reviewStands: [
        'Review lost! Stays as it was!',
        'Ouch — the decision stands!',
        'Nope! Review gone!',
        'The umpire was right! Stands!',
        'Wasted review! Decision stays!',
        'No luck on the review!',
        'Stands! That review is burnt!',
      ],
      reviewUmpiresCall: [
        'Umpire’s call! So close!',
        'Clipping! Umpire’s call — review kept!',
        'Agonising — umpire’s call!',
        'Millimetres! Umpire’s call!',
        'Umpire’s call! Drama!',
        'Tight as it gets — umpire’s call!',
        'Umpire’s call! Review lives on!',
      ],
      winChase: [
        '{winner} DO IT! What a chase!',
        'Chase complete! {winner} win by {margin}!',
        '{winner} get over the line! Scenes!',
        'Winning runs! {winner} celebrate!',
        '{winner} win by {margin}! Brilliant!',
        'They’ve done it! {winner} win!',
        'Get in! {winner} chase it down!',
      ],
      winDefend: [
        '{winner} defend it! Win by {margin}!',
        'Held on! {winner} win!',
        'What bowling! {winner} win by {margin}!',
        '{winner} squeeze the life out of the chase!',
        'Defended! {winner} are celebrating!',
        '{winner} hang on — win by {margin}!',
        'Not today! {winner} win it!',
      ],
      tie: [
        'IT’S A TIE! Can you believe it?!',
        'Level! Absolutely level!',
        'Tied! What a game!',
        'Nothing in it — a TIE!',
        'Scores level! Madness!',
        'A tie! Nobody deserved to lose!',
        'Dead heat! It’s tied!',
      ],
      superOver: [
        'SUPER OVER! Buckle up!',
        'It’s going to a Super Over!',
        'Tied! Super Over time!',
        'One more over each — SUPER OVER!',
        'Drama! Super Over to decide!',
        'Can’t split them — SUPER OVER!',
        'Here comes the Super Over!',
      ],
    },
  };

  const KINDS = Object.keys(T.calm);

  function count() {
    let n = 0;
    PERSONAS.forEach((p) => KINDS.forEach((k) => (n += T[p][k].length)));
    return n;
  }

  // ---------------------------------------------------------------- helpers

  function hash(s) {
    let h = 2166136261;
    const t = String(s);
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function fill(tpl, f) {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => (f[k] == null ? '' : String(f[k]))).replace(/\s+/g, ' ').trim();
  }
  const SHOT_NAME = { drive: 'drive', cut: 'cut', pull: 'pull', sweep: 'sweep', loft: 'lofted shot', flick: 'flick', defend: 'push', push: 'push', leave: 'leave' };
  const DEL_NAME = { yorker: 'yorker', full: 'full ball', good: 'good-length ball', short: 'short ball', bouncer: 'bouncer', fulltoss: 'full toss' };

  function plural(n, w) {
    return n + ' ' + w + (n === 1 ? '' : 's');
  }

  // ---------------------------------------------------------------- moments

  /**
   * Key moments from an engine state, in order. Each has a stable key `inn:ball` so AI lines and
   * template lines line up across devices. kinds: see KINDS.
   */
  function keyMoments(state) {
    const out = [];
    if (!state || !state.innings) return out;
    state.innings.forEach((inn, ii) => {
      const team = state.config.sides[inn.bat] ? state.config.sides[inn.bat].name : 'Side';
      let runs = 0;
      let wk = 0;
      let legal = 0;
      const bat = {};
      let lastOverFlag = false;
      inn.balls.forEach((b, bi) => {
        const before = { runs, legal };
        runs += b.team || 0;
        if (b.out) wk += 1;
        const isLegal = b.extra !== 'wd' && b.extra !== 'nb' && b.extra !== 'pen';
        if (isLegal) legal += 1;
        const name = b.striker || '';
        const prev = bat[name] || { r: 0, b: 0 };
        const batRuns = b.extra === '' || b.extra === 'nb' ? b.runs || 0 : 0;
        const now = { r: prev.r + batRuns, b: prev.b + (b.extra !== 'wd' ? 1 : 0) };
        bat[name] = now;
        const maxBalls = inn.overs * 6;
        const left = Math.max(0, maxBalls - legal);
        const need = inn.target ? Math.max(0, inn.target - runs) : 0;
        const f = {
          key: ii + ':' + bi,
          inn: ii,
          ball: b.no,
          bat: name.replace(/ \(\d+\)$/, ''),
          bowl: b.bowler || '',
          r: now.r,
          b: now.b,
          score: runs + '/' + wk,
          need,
          left,
          team,
          target: inn.target || 0,
          shot: SHOT_NAME[b.shot] || 'shot',
          del: DEL_NAME[b.length] || 'delivery',
        };
        let onBall = 0;
        const push = (kind, extra) => {
          const key = onBall++ ? f.key + ':' + kind : f.key;
          out.push(Object.assign({ kind }, f, extra || {}, { key }));
        };
        // Last over of a chase (first ball of it), when it's still live.
        if (inn.target && !lastOverFlag && before.legal === maxBalls - 6 && maxBalls >= 6 && inn.target - before.runs > 0) {
          lastOverFlag = true;
          out.push(Object.assign({}, f, { kind: 'lastOver', key: ii + ':' + bi + ':lo', need: inn.target - before.runs, left: 6 }));
        }
        if (b.drs === 'overturned') push('reviewOverturned');
        else if (b.drs === 'stands') push('reviewStands');
        else if (b.drs === 'umpires_call') push('reviewUmpiresCall');
        if (b.out) {
          const k = b.out === 'bowled' ? 'bowled' : b.out === 'lbw' ? 'lbw' : b.out === 'runout' ? 'runout' : b.out === 'stumped' ? 'stumped' : b.out === 'caught' ? (b.appeal === 'caught' ? 'caughtBehind' : 'caught') : 'streetOut';
          push(k, { r: prev.r + (b.out === 'runout' ? batRuns : 0), how: b.out });
        } else if (batRuns >= 4) {
          const clutch = inn.target && need > 0 && left <= 6 && need <= 18;
          push(batRuns === 6 ? (clutch ? 'sixClutch' : 'six') : clutch ? 'fourClutch' : 'four');
        }
        if (!b.out) {
          [25, 50, 100].forEach((m) => {
            if (prev.r < m && now.r >= m) push('milestone', { m });
          });
          [50, 100, 150].forEach((m) => {
            if (before.runs < m && runs >= m) push('teamMilestone', { m });
          });
        }
        if (b.extra === 'nb' && b.token && !b.out) push('freeHit');
      });
    });
    if (state.result) {
      const r = state.result;
      const supers = state.innings.filter((i) => i.super);
      const winner = r.winner >= 0 && state.config.sides[r.winner] ? state.config.sides[r.winner].name : '';
      const margin = r.by === 'runs' ? plural(r.runs, 'run') : r.by === 'wickets' ? plural(r.wickets, 'wicket') : r.by === 'superover' ? 'the Super Over' : r.by === 'boundaries' ? 'boundary count' : '';
      const base = { key: 'result', inn: state.cur, winner, margin, score: '', team: winner };
      if (supers.length) out.push(Object.assign({ kind: 'superOver', key: 'super' }, base));
      if (r.kind === 'tie') out.push(Object.assign({ kind: 'tie' }, base));
      else if (r.kind === 'win' && r.by !== 'forfeit') {
        const chased = r.by === 'wickets' || (r.by === 'superover' && supers.length && supers[supers.length - 1].bat === r.winner && supers[supers.length - 1].runs >= supers[supers.length - 1].target);
        out.push(Object.assign({ kind: chased ? 'winChase' : 'winDefend' }, base));
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- picker

  /**
   * No-repeat picker for one match. seed = the match seed (same lines on every device).
   * line(moment) → string ('' when that kind's pool is used up — stay quiet rather than repeat).
   */
  function createPicker(seed, persona) {
    const p = PERSONAS.indexOf(persona) >= 0 ? persona : 'calm';
    const used = {};
    return {
      persona: p,
      line(m) {
        const pool = (T[p][m.kind] || []);
        if (!pool.length) return '';
        const u = (used[m.kind] = used[m.kind] || {});
        const start = hash(seed + '|' + m.key + '|' + m.kind) % pool.length;
        for (let i = 0; i < pool.length; i++) {
          const k = (start + i) % pool.length;
          if (u[k]) continue;
          u[k] = 1;
          return fill(pool[k], m).slice(0, MAX_LINE);
        }
        return '';
      },
      used,
    };
  }

  /** Template lines for every key moment of a match, keyed by moment key. */
  function linesFor(state, seed, persona) {
    const pick = createPicker(seed, persona);
    const out = [];
    keyMoments(state).forEach((m) => {
      const line = pick.line(m);
      if (line) out.push({ key: m.key, kind: m.kind, inn: m.inn, ball: m.ball || '', line });
    });
    return out;
  }

  // ---------------------------------------------------------------- recap

  function recapTemplate(state, persona) {
    if (!state || !state.result) return '';
    const fan = persona === 'fan';
    const r = state.result;
    const main = state.innings.filter((i) => !i.super);
    const s = [];
    s.push(r.text + (fan ? '!' : '.'));
    let best = null;
    let bestBowl = null;
    main.forEach((inn) => {
      inn.batters.forEach((b) => {
        if (!best || b.r > best.r || (b.r === best.r && b.b < best.b)) best = { name: b.name.replace(/ \(\d+\)$/, ''), r: b.r, b: b.b, f6: b.f6 };
      });
      inn.bowlers.forEach((b) => {
        if (!bestBowl || b.w > bestBowl.w || (b.w === bestBowl.w && b.r < bestBowl.r)) bestBowl = { name: b.name, w: b.w, r: b.r };
      });
    });
    if (best && best.r > 0) s.push(fan ? best.name + ' lit it up with ' + best.r + ' off ' + best.b + (best.f6 ? ', including ' + plural(best.f6, 'six') : '') + '!' : best.name + ' top-scored with ' + best.r + ' off ' + best.b + '.');
    if (bestBowl && bestBowl.w > 0) s.push(fan ? bestBowl.name + ' struck with ' + bestBowl.w + '-' + bestBowl.r + '!' : bestBowl.name + ' took ' + bestBowl.w + '-' + bestBowl.r + '.');
    const reviews = main.reduce((n, i) => n + i.balls.filter((b) => b.drs).length, 0);
    if (s.length < 3 && reviews) s.push(plural(reviews, 'review') + ' used.');
    return s.slice(0, 3).join(' ').slice(0, MAX_RECAP);
  }

  /** Facts the AI may use for a recap (names + numbers only, all from the log). */
  function recapFacts(state) {
    const main = state.innings.filter((i) => !i.super);
    return {
      result: state.result ? state.result.text : '',
      innings: main.map((i) => ({
        team: state.config.sides[i.bat].name,
        score: i.runs + '/' + i.wkts,
        overs: Math.floor(i.legal / 6) + (i.legal % 6 ? '.' + (i.legal % 6) : ''),
        top: i.batters
          .slice()
          .sort((a, b) => b.r - a.r)
          .slice(0, 2)
          .map((b) => ({ name: b.name.replace(/ \(\d+\)$/, ''), r: b.r, b: b.b, f4: b.f4, f6: b.f6 })),
        bowl: i.bowlers.map((b) => ({ name: b.name, w: b.w, r: b.r })),
      })),
    };
  }

  // ---------------------------------------------------------------- AI checks

  /** Every number in the text must be one the facts contain (no invented stats). */
  function numbersGrounded(text, facts) {
    const allowed = new Set();
    const walk = (v) => {
      if (v == null) return;
      if (typeof v === 'number') allowed.add(String(v));
      else if (typeof v === 'string') (v.match(/\d+/g) || []).forEach((n) => allowed.add(String(Number(n))));
      else if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k]));
    };
    walk(facts);
    return (String(text).match(/\d+/g) || []).every((n) => allowed.has(String(Number(n))));
  }

  /**
   * Validate AI 'over' output: { lines: [{ i, line }] } — i indexes the supplied moments, ≤ 8
   * lines, each ≤ 140 chars, numbers grounded in that moment's facts. Returns the clean list.
   */
  function validateOverLines(data, moments) {
    if (!data || !Array.isArray(data.lines) || data.lines.length > 8) return null;
    const seen = {};
    const out = [];
    for (let k = 0; k < data.lines.length; k++) {
      const x = data.lines[k];
      if (!x || !Number.isInteger(x.i) || x.i < 0 || x.i >= moments.length || seen[x.i]) return null;
      if (typeof x.line !== 'string' || !x.line.trim() || x.line.length > MAX_LINE) return null;
      if (!numbersGrounded(x.line, moments[x.i])) return null;
      seen[x.i] = 1;
      out.push({ i: x.i, line: x.line.trim() });
    }
    return out;
  }
  function validateRecap(data, facts) {
    if (!data || typeof data.recap !== 'string') return null;
    const t = data.recap.trim();
    if (t.length < 20 || t.length > MAX_RECAP) return null;
    if (!numbersGrounded(t, facts)) return null;
    const sentences = t.split(/[.!?]+\s/).filter(Boolean).length;
    if (sentences > 4) return null;
    return t;
  }

  /** Moments of one over (for the per-over AI batch) — compact facts only. */
  function overMoments(state, inn, over) {
    const I = state.innings[inn];
    if (!I) return [];
    return keyMoments(state).filter((m) => {
      if (m.inn !== inn || m.key === 'result' || m.key === 'super') return false;
      const bi = Number(String(m.key).split(':')[1]);
      const b = I.balls[bi];
      return b && b.over === over;
    });
  }
  function compactMoment(m) {
    const o = { kind: m.kind, bat: m.bat, bowl: m.bowl, r: m.r, b: m.b, score: m.score, shot: m.shot, del: m.del };
    if (m.need) {
      o.need = m.need;
      o.left = m.left;
    }
    if (m.m) o.m = m.m;
    if (m.winner) {
      o.winner = m.winner;
      o.margin = m.margin;
    }
    return o;
  }

  return {
    PERSONAS,
    KINDS,
    TEMPLATES: T,
    MAX_LINE,
    MAX_RECAP,
    count,
    fill,
    keyMoments,
    createPicker,
    linesFor,
    recapTemplate,
    recapFacts,
    numbersGrounded,
    validateOverLines,
    validateRecap,
    overMoments,
    compactMoment,
  };
});
