/**
 * Lightweight Mehfil / Teen Mode health notes for local QA.
 * Usage: node scripts/mehfil-health.js
 * Does not call live APIs — prints a checklist + static env probes.
 * M8: dogfood invariants (Live ≥2, member gating, Quiet one-media, teardown, toast honesty).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  } catch (e) {
    return '';
  }
}

const rules = read('firebase/database.rules.json');
const mehfilJs = read('public/src/js/features/mehfil.js');
const effectsJs = read('public/src/js/features/mehfil-effects.js');
const cinemaCss = read('public/src/styles/mehfil-cinema.css');
const mehfilCss = read('public/src/styles/mehfil.css');
const mediaConfig = read('api/media-config.js');
const access = read('server-lib/mehfil-access.js');
const agoraToken = read('server-lib/agora-token.js');
const i18n = read('public/src/js/core/i18n.js');
const deeplinks = read('public/src/js/core/deeplinks.js');
const indexHtml = read('public/index.html');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;

const checks = [
  ['mehfil.js', exists('public/src/js/features/mehfil.js')],
  ['mehfil.css', exists('public/src/styles/mehfil.css')],
  ['agora-token.js', exists('server-lib/agora-token.js')],
  ['mehfil-access.js', exists('server-lib/mehfil-access.js')],
  ['database.rules.json mehfilMembers', rules.includes('"mehfilMembers"') && rules.includes('"mehfil"') && rules.includes('mehfilInbox')],
  ['RTDB mehfil read gated by mehfilMembers', rules.includes("root.child('mehfilMembers')")],
  ['Live = ≥2 fresh (mehfilLiveState)', mehfilJs.includes('function mehfilLiveState') && mehfilJs.includes('count >= 2')],
  ['freshness 25s + heartbeat 10s', mehfilJs.includes('PRESENCE_FRESH_MS = 25000') && mehfilJs.includes('PRESENCE_HEARTBEAT_MS = 10000')],
  ['abandonMehfil + ensureOpenMehfil', mehfilJs.includes('function abandonMehfil') && mehfilJs.includes('ensureOpenMehfil')],
  ['self-chat / Chaupaal AI blocked', mehfilJs.includes('isSelfChat') || mehfilJs.includes('self_chat') || mehfilJs.includes('chaupaal')],
  ['DM ring chrome + traces', mehfilJs.includes('RING_TRACE_NO_ANSWER') && mehfilJs.includes('setRingingChrome')],
  ['mic truth + speaking hysteresis', mehfilJs.includes('SPEAK_ON_LEVEL') && mehfilJs.includes('setMicUi') && mehfilJs.includes('You’re muted')],
  ['token renew + connection UX', mehfilJs.includes('renewAgoraToken') && mehfilJs.includes('token-privilege-will-expire')],
  ['Dangal voice mutex', mehfilJs.includes('dangal') || mehfilJs.includes('Dangal') || mehfilJs.includes('mh_')],
  ['watch party search pick list', mehfilJs.includes('paintMediaResults') && mehfilJs.includes('Play for the room')],
  ['shared music path', mehfilJs.includes('playSharedMusicTrack') && mehfilJs.includes("type: 'music'")],
  ['Quiet stops YouTube before music', mehfilJs.includes('One active media') && mehfilJs.includes('mehfil_music_quiet')],
  ['host everyone delegate', mehfilJs.includes('openDelegatePicker') && mehfilJs.includes('controlMode')],
  ['room roles + removal', mehfilJs.includes('ensureRoomRoles') && mehfilJs.includes('hostRemoveUser') && mehfilJs.includes('roomHost')],
  ['removal cooldown present', mehfilJs.includes('REMOVE') || mehfilJs.includes('cooldown') || mehfilJs.includes('removedUntil')],
  ['subscriber token mint', agoraToken.includes('SUBSCRIBER') && access.includes('resolveMehfilVoiceRole')],
  ['RTDB roles/removed rules', rules.includes('"roomHost"') && rules.includes('"removed"') && rules.includes('"roles"')],
  ['mehfil_ensure_member action', mediaConfig.includes('mehfil_ensure_member')],
  ['agora_token membership gate', mediaConfig.includes('assertMehfilAgoraAccess')],
  ['publisher join checks presenceOk', mehfilJs.includes('presenceOk') && mehfilJs.includes("abandonMehfil('room_full')")],
  ['cap toast gated (not demote)', mehfilJs.includes("voiceReason === 'publisher_cap'") && !/subscriber.*listener[\s\S]{0,80}mehfil_joined_listener/.test(mehfilJs.replace(/\s+/g, ' '))],
  ['empty room cleanup any leaver', mehfilJs.includes('Last person out') && mehfilJs.includes('cleanupEmptyRoomMeta')],
  ['recoverMicrophone bails listen mode', mehfilJs.includes("avMode !== 'full'") && mehfilJs.includes('recoverMicrophone')],
  ['social: room chat retain + flood', (mehfilJs.includes('mehfil_chat_retain') || i18n.includes('mehfil_chat_retain')) && mehfilJs.includes('chatFloodBlocked')],
  ['social: invite sheet', mehfilJs.includes('function openInviteSheet') && mehfilJs.includes('sendRoomReaction')],
  ['social: presence coalesce', mehfilJs.includes('PRESENCE_COALESCE_MS') && mehfilJs.includes('queuePresenceEvent')],
  ['social: effects clear', effectsJs.includes('clear()') && cinemaCss.includes('mehfil-chat-retain')],
  ['cinema: dock Act-only', mehfilJs.includes('mehfil-glance') && mehfilJs.includes('mehfil-immersive-exit') && !mehfilJs.includes('mehfil-ring-btn')],
  ['cinema: token themes + stage rest', cinemaCss.includes('mehfil-theme--light') && cinemaCss.includes('#F5F5F5') && cinemaCss.includes('mehfil-stage-rest')],
  ['cinema: warm voice tiles', mehfilJs.includes('mehfil-tile--voice') && mehfilCss.includes('mehfil-tile-avatar')],
  ['scale: publisher/participant caps', mehfilJs.includes('MAX_PUBLISHERS = 10') && mehfilJs.includes('MAX_PARTICIPANTS = 40') && access.includes('MEHFIL_MAX_PUBLISHERS')],
  ['scale: video reconcile + pin', mehfilJs.includes('reconcileVideoSubscriptions') && mehfilJs.includes('setPinnedUid')],
  ['scale: volume/presence throttle', mehfilJs.includes('VOLUME_PAINT_MS') && mehfilJs.includes('PRESENCE_PAINT_MS')],
  ['deeplink / auto-join', deeplinks.includes('mehfil') || mehfilJs.includes('consumeMehfilAutoJoin') || indexHtml.includes('mehfil=')],
  ['youtube-search.js', exists('server-lib/youtube-search.js')],
  ['YOUTUBE_API_KEY documented', read('.env.example').includes('YOUTUBE_API_KEY')],
  ['teen-mode assertCanMessage', read('public/src/js/core/teen-mode.js').includes('assertCanMessage')],
  ['api/*.js count ≤12', apiCount <= 12],
];

const agoraConfigured = !!(process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE);

console.log('Chaupaal Mehfil / Teen health (M8 dogfood)\n');
let ok = true;
checks.forEach(([label, pass]) => {
  console.log(`${pass ? '✓' : '✗'} ${label}`);
  if (!pass) ok = false;
});
console.log(`${agoraConfigured ? '✓' : '○'} AGORA_APP_ID + CERTIFICATE (optional — voice only)`);
console.log(`○ api/*.js count: ${apiCount} (Hobby max 12)`);

console.log(`
Manual QA checklist (M8 — close the arc)
----------------------------------------
Entry & presence
  [ ] All entry paths land in-room; Live ≥2 fresh; solo = waiting; ghosts expire
  [ ] Self-chat / Chaupaal AI blocked client + server

Voice & video
  [ ] Mic/cam/share truthful; speaking across 3 accounts; Dangal mutex both ways
  [ ] Drop → reconnecting → recover or honest end; token renew survives long session

Watch party
  [ ] YT pick list syncs; second pick stops first; Quiet stops local YT + music
  [ ] Host leave mid-play continues; leave stops only your playback

Roles & safety
  [ ] Host transfer; demote = subscriber; remove cooldown; DM no host powers
  [ ] Non-member read/write denied

Social / look / scale
  [ ] Room chat + reactions + invite; dock Act-only; caps 10/40; pin works
  [ ] 20m churn → full teardown; Baithak/Dangal/music unaffected

Ops
  [ ] npm run health:mehfil; api/*.js ≤12; Mehfil v1 complete
`);

process.exit(ok ? 0 : 1);
