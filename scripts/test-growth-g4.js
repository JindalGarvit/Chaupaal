/**
 * Growth G4 — Pro fields visibility, auth markup, Hobby cap (no network).
 */
'use strict';

const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
assert(/id="regProFields"/.test(html), 'regProFields markup');
assert(/id="regIndustryPicklist"/.test(html), 'industry picklist');
assert(/id="regPurposePicklist"/.test(html), 'purpose picklist');
assert(/regIndustryOther/.test(html) && /regPurposeOther/.test(html), 'Other inputs');
assert(/Helps professionals find you/.test(html), 'Pro payoff copy');
assert(/Switch \/ add account/.test(html), 'account switcher copy');

const auth = fs.readFileSync(path.join(__dirname, '../public/src/js/auth/auth-events.js'), 'utf8');
assert(/pro\.classList\.toggle\('hidden',\s*type !== 'professional'\)/.test(auth), 'Pro fields show for professional');
assert(!/if \(pro\) pro\.classList\.add\('hidden'\);/.test(auth), 'no always-hide bug');
assert(/ensureProPicklists\(\)/.test(auth), 'ensureProPicklists wired');
assert(/prefers-reduced-motion/.test(auth), 'reduced-motion honored');
assert(/bumpStat\('industryStats'/.test(auth), 'industry stats bump');
assert(/bumpStat\('purposeStats'/.test(auth), 'purpose stats bump');
assert(/LOGIN_GENERIC_ERR/.test(auth), 'generic login error');

const type = fs.readFileSync(path.join(__dirname, '../public/src/js/core/profile-type.js'), 'utf8');
assert(/fromSignup/.test(type) && /fixed at signup/.test(type), 'type fixed after signup');

const css = fs.readFileSync(path.join(__dirname, '../public/src/styles/components.css'), 'utf8');
assert(/\.auth-pro-fields/.test(css), 'pro fields styles');

const apiCount = fs.readdirSync(path.join(__dirname, '../api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nGrowth G4 checks passed.');
