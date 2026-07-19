/**
 * Peepal seed / dummy content for pre-launch testing.
 *
 * ⚠️ PRE-LAUNCH REMOVAL REQUIRED ⚠️
 * Every document produced here is tagged `isSeedContent: true` and uses a
 * `seed_peepal_` id prefix so it is trivially identifiable and removable.
 * Before real users arrive, either delete these docs or flip
 * `PEEPAL_SEED_CONTENT_ENABLED` to false in
 * `public/src/js/features/categories.js` (the client already filters seed
 * docs out of the feed when that flag is off).
 *
 * The shapes here mirror a real Peepal post written from
 * `public/src/js/features/discovery.js` and a real comment written from
 * `public/src/js/core/social-persistence.js`, so seeds render through the
 * exact same UI as user content.
 */

// Synthetic author for the globally-shared seed posts. This uid must never
// belong to a real account, so the poster-only reception UI never activates
// for these on a normal viewer's screen.
const SEED_AUTHOR = { uid: 'seed_author_chaupaal', name: 'Chaupaal', avatar: '🪑' };

function comment(postId, n, user, text, parentId) {
  return { id: `${postId}_comment_${n}`, user, text, parentId: parentId || null };
}

const A = { uid: 'seed_person_meera', name: 'Meera', avatar: '🌸' };
const B = { uid: 'seed_person_arjun', name: 'Arjun', avatar: '🎧' };
const C = { uid: 'seed_person_kabir', name: 'Kabir', avatar: '📚' };
const D = { uid: 'seed_person_ananya', name: 'Ananya', avatar: '☕' };
const E = { uid: 'seed_person_dev', name: 'Dev', avatar: '🏏' };

/**
 * Eight varied, globally-shared seed questions across topics, tones and both
 * open + mcq formats. Comments are attached to several of them so the comment
 * strip and expanded thread have real content to exercise.
 */
const PEEPAL_SEED_POSTS = [
  {
    id: 'seed_peepal_monsoon_food',
    question: 'What is your ultimate rainy-day comfort food — and where do you get the best version of it?',
    format: 'open',
    tag: 'FOOD',
    comments: [
      comment('seed_peepal_monsoon_food', 1, A, 'Pakoras with adrak chai, no contest. My mom’s kitchen wins every time.'),
      comment('seed_peepal_monsoon_food', 2, B, 'Maggi at a roadside tapri when it’s pouring. Elite experience.'),
      comment('seed_peepal_monsoon_food', 3, D, 'Khichdi + ghee + achaar. Underrated monsoon healer.'),
    ],
  },
  {
    id: 'seed_peepal_ai_work',
    question: 'Has AI made your work genuinely easier yet, or mostly added another tool you have to manage?',
    format: 'open',
    tag: 'TECH',
    comments: [
      comment('seed_peepal_ai_work', 1, B, 'Genuinely easier for the boring 30% — drafting, summarising. The other 70% still needs me.'),
      comment('seed_peepal_ai_work', 2, C, 'Honestly it added a tool. Now I review AI output AND do the work.'),
    ],
  },
  {
    id: 'seed_peepal_walk_city',
    question: 'Which Indian city is most enjoyable to explore entirely on foot?',
    format: 'open',
    tag: 'TRAVEL',
    comments: [
      comment('seed_peepal_walk_city', 1, D, 'Pondicherry’s French quarter. Every lane is a photograph.'),
      comment('seed_peepal_walk_city', 2, E, 'Old Delhi if you can handle the crowd — the food alone is worth it.'),
    ],
  },
  {
    id: 'seed_peepal_book_again',
    question: 'Name one book you wish you could read again for the first time.',
    format: 'open',
    tag: 'BOOKS',
    comments: [
      comment('seed_peepal_book_again', 1, C, 'The God of Small Things. The language hits different when it’s new.'),
    ],
  },
  {
    id: 'seed_peepal_final_over',
    question: 'For a tense final over, would you rather have a fearless hitter or a calm finisher at the crease?',
    format: 'mcq',
    tag: 'CRICKET',
    options: ['Fearless hitter', 'Calm finisher'],
    responses: [34, 58],
    totalResponses: 92,
    comments: [
      comment('seed_peepal_final_over', 1, E, 'Calm finisher. Chasing needs a clear head, not fireworks.'),
      comment('seed_peepal_final_over', 2, A, 'Fearless hitter — one over, six balls, just swing.'),
    ],
  },
  {
    id: 'seed_peepal_money_habit',
    question: 'What is one money habit you learned later than you wish you had?',
    format: 'open',
    tag: 'MONEY',
    comments: [
      comment('seed_peepal_money_habit', 1, D, 'Automating savings the day salary lands. Out of sight, actually saved.'),
      comment('seed_peepal_money_habit', 2, B, 'Tracking small subscriptions. They quietly ate a whole EMI.'),
    ],
  },
  {
    id: 'seed_peepal_commute_song',
    question: 'What song instantly improves a bad commute?',
    format: 'open',
    tag: 'MUSIC',
    comments: [
      comment('seed_peepal_commute_song', 1, B, 'Anything by The Local Train. Instant windows-down energy.'),
    ],
  },
  {
    id: 'seed_peepal_free_saturday',
    question: 'Your ideal free Saturday appears unexpectedly. What do you choose?',
    format: 'mcq',
    tag: 'LIFESTYLE',
    options: ['Sleep in and do nothing', 'Long outdoor plan', 'Deep-dive a hobby', 'See friends'],
    responses: [41, 27, 33, 30],
    totalResponses: 131,
    comments: [
      comment('seed_peepal_free_saturday', 1, A, 'Do nothing, guilt-free. That’s the whole luxury.'),
    ],
  },
];

/**
 * One personal seed post owned by the current user, so the poster-only
 * reception UI (raw counts + qualitative summary) can be tested end-to-end.
 */
function personalSeedPost(uid, name) {
  const id = `seed_peepal_owner_${uid}`;
  const author = { uid, name: name || 'You', avatar: '🪑' };
  return {
    id,
    question: 'Test post: what small change would make Chaupaal feel more useful to you every day?',
    format: 'open',
    tag: 'CHAUPAAL',
    user: author,
    uid,
    comments: [
      comment(id, 1, C, 'A gentle daily nudge that isn’t a notification spam. A quiet check-in.'),
      comment(id, 2, D, 'Let me pin the two or three people I actually talk to at the top.'),
    ],
  };
}

module.exports = { SEED_AUTHOR, PEEPAL_SEED_POSTS, personalSeedPost };
