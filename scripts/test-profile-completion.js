/**
 * Profile completion sections + teen weight redistribute.
 * Purpose leftover must not affect scores.
 */
global.window = global;

const { calcProfileCompletion } = require('../public/src/js/core/profile-completion.js');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const empty = {
  purpose: 'Grow my business',
  lookingFor: '',
  bio: '',
  prompts: [],
};

{
  const s = calcProfileCompletion(
    { ...empty, username: 'maya', occupation: 'Student' },
    {
      teen: true,
      profileType: 'personal',
      username: 'maya',
      photoURL: 'https://x/p.jpg',
      emailVerified: true,
      phoneVerified: false,
    }
  );
  assert(s.hideRelationship === true, 'teen hides relationship');
  assert(s.sections.relationship.hidden === true, 'relationship section hidden');
  assert(s.pct > 0, 'teen overall not stuck at 0');
  const adultSame = calcProfileCompletion(
    { ...empty, username: 'maya', occupation: 'Student' },
    {
      teen: false,
      profileType: 'personal',
      username: 'maya',
      photoURL: 'https://x/p.jpg',
      emailVerified: true,
    }
  );
  assert(s.pct >= adultSame.pct, 'teen overall not punished vs adult empty relationship');
}

{
  const fullTeen = calcProfileCompletion(
    {
      bio: 'hello',
      prompts: [{ answer: 'chai' }],
      currentCity: 'Jaipur',
      languages: ['Hindi'],
      hobbies: ['Reading'],
      occupation: 'Student',
      username: 'maya',
      photoURL: 'p',
      purpose: 'ignored leftover',
    },
    {
      teen: true,
      profileType: 'personal',
      username: 'maya',
      photoURL: 'p',
      emailVerified: true,
    }
  );
  assert(fullTeen.pct === 100, 'teen can hit 100% without lookingFor');
  assert(!fullTeen.missing.includes('Looking for'), 'teen missing list has no lookingFor');
}

{
  const withPurpose = calcProfileCompletion(
    { purpose: 'Networking', username: 'a' },
    { teen: false, username: 'a', profileType: 'personal' }
  );
  const without = calcProfileCompletion({ username: 'a' }, { teen: false, username: 'a', profileType: 'personal' });
  assert(withPurpose.pct === without.pct, 'purpose leftover ignored');
}

{
  const photo = calcProfileCompletion(
    { bio: 'x', prompts: [{ answer: 'y' }], username: 'u' },
    { photoURL: 'p', username: 'u', emailVerified: true, teen: false, profileType: 'personal' }
  );
  assert(photo.sections.identity.complete === true, 'photo+bio+prompts complete identity');
  assert(photo.sections.trust.complete === true, 'photo counts for trust too');
}

{
  const personal = calcProfileCompletion(
    { occupation: 'Designer' },
    { teen: false, profileType: 'personal', username: 'u' }
  );
  const proNoInd = calcProfileCompletion(
    { occupation: 'Designer' },
    { teen: false, profileType: 'professional', username: 'u' }
  );
  assert(personal.sections.career.complete === true, 'personal career = occupation only');
  assert(proNoInd.sections.career.complete === false, 'professional career needs industry');
}

{
  const social = calcProfileCompletion(
    { currentCity: 'Mumbai', languages: ['English'], interests: ['Music'] },
    { teen: false, username: 'u', profileType: 'personal' }
  );
  assert(social.sections.social.complete === true, 'social without post counts when no cheap count');
}

{
  const needPost = calcProfileCompletion(
    { currentCity: 'Mumbai', languages: ['English'], interests: ['Music'] },
    { teen: false, username: 'u', profileType: 'personal', duniyaCount: 0, peepalCount: 0 }
  );
  assert(needPost.sections.social.complete === false, 'cheap zero post count included in social');
}

console.log('profile-completion tests ok');
