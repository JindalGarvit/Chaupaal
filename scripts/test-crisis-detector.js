/** Realistic-phrasing checks for the crisis detector. Run: node scripts/test-crisis-detector.js */
const p = require('../server-lib/chaupaal-persona');

const cases = [
  // [message, expectCrisis]
  ["i haven't been sleeping and honestly i've been thinking that everyone would be better off without me. i don't really want to be here anymore", true],
  ['ugh today was brutal. my manager tore apart my work in front of everyone and i just feel completely drained and done with this week', false],
  ['i keep thinking about ending it all', true],
  ["i'm so tired of everything lately", false],
  ["there's no reason to keep going", true],
  ['i want to die my hair red, thoughts?', true], // known regex limitation: "want to die" phrase
  ['work is killing me this month', false],
  ["i've been cutting myself again", true],
  ['i feel so alone and sad tonight', false],
];

let fails = 0;
cases.forEach(([m, exp]) => {
  const got = p.detectCrisis(m);
  const ok = got === exp;
  if (!ok) fails++;
  console.log((ok ? 'OK   ' : 'DIFF ') + 'expect=' + exp + ' got=' + got + ' :: ' + m.slice(0, 78));
});
console.log(fails ? `\n${fails} mismatches` : '\nAll matched expectations.');
