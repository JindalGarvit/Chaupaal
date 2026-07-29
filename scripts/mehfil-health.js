/**
 * Lightweight Mehfil / Teen Mode health notes for local QA.
 * Usage: node scripts/mehfil-health.js
 * Does not call live APIs — prints a checklist + static env probes.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const checks = [
  ['mehfil.js', exists('public/src/js/features/mehfil.js')],
  ['mehfil.css', exists('public/src/styles/mehfil.css')],
  ['agora-token.js', exists('server-lib/agora-token.js')],
  ['database.rules.json has chat', (() => {
    try {
      const raw = fs.readFileSync(path.join(root, 'firebase/database.rules.json'), 'utf8');
      return raw.includes('"chat"') && raw.includes('mehfil');
    } catch (e) {
      return false;
    }
  })()],
  ['teen-mode assertCanMessage', (() => {
    try {
      const raw = fs.readFileSync(path.join(root, 'public/src/js/core/teen-mode.js'), 'utf8');
      return raw.includes('assertCanMessage');
    } catch (e) {
      return false;
    }
  })()],
];

const agoraConfigured = !!(process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE);

console.log('Chaupaal Mehfil / Teen health\n');
let ok = true;
checks.forEach(([label, pass]) => {
  console.log(`${pass ? '✓' : '✗'} ${label}`);
  if (!pass) ok = false;
});
console.log(`${agoraConfigured ? '✓' : '○'} AGORA_APP_ID + CERTIFICATE (optional — voice only)`);

console.log(`
Manual QA checklist
-------------------
Mehfil
  [ ] Open a DM → Mehfil — sidebar chat sends
  [ ] Paste YouTube link — peer sees synced playback
  [ ] With AGORA_* on Vercel — join shows Connected, mic/cam off
  [ ] Second device joins — tiles + members list update

Teen Mode
  [ ] Under-18 signup → parental consent screen
  [ ] Teen messaging adult stranger blocked (toast)
  [ ] Teen ↔ teen OR friend messaging allowed
  [ ] Location share in DM blocked for non-friends
  [ ] DOB edit to under-18 triggers Teen Mode / consent

Ops
  [ ] firebase deploy --only database
  [ ] Vercel env: AGORA_APP_ID, AGORA_APP_CERTIFICATE
  [ ] Optional: node scripts/seed-feature-flags.js (seeds mehfil on)
`);

process.exit(ok ? 0 : 1);
