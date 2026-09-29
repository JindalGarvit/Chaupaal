# Chaupaal conventions

Binding rules for navigation, overlays, media, and persistence. All new features and Cursor passes should follow this document.

Implementation lives primarily in:

- `public/src/js/core/nav-stack.js` — overlay history stack
- `public/src/js/core/overlay-scope.js` — scoped cleanup when parent views close
- `public/src/js/core/media-player.js` — shared seek/skip controls
- `public/src/js/features/music-card.js` — in-app music preview

---

## 1. Navigation & overlay contract

**Single entry point:** Every full-screen view, modal, sheet, or dismissible overlay must register through `openLayer()` (preferred) or `pushNavLayer()` / the nav-stack observer — not ad-hoc `history.pushState` / `replaceState`.

**`openLayer(el, onDismiss, opts)`** — shared helper in `nav-stack.js`. Appends into `#device` / `.device`, sets `data-nav-managed="1"`, registers one history layer, and returns `{ close }` so Android back, swipe-back, Escape, and the feature’s own close control share one dismiss path. New UI must use this (or an equivalent `pushNavLayer` + `data-nav-managed` pair). Do not call `removeNavLayer` without also removing/hiding the DOM.

**Exceptions (deep routes only):** `deeplinks.js` may push `{ chaupaalDeep: true }` when opening shareable routes (`/chat/…`, `/profile/…`, `/post/…`, `/join/g/…`, `/challenge/…`). Closing a deep route must use `history.back()`, never `pushState('/', …)`. Guest group invites stash `chaupaal_pending_group_invite` and resume after auth. `deeplinks_v1` kill-switches `handleDeepLink`. FCM `link` = `hrefFromDeepLink(deepLink)` (never hard-coded `/`).

**OG previews (Growth G1):** Bot User-Agents matching WhatsApp/Facebook/Twitter/etc. are rewritten (vercel.json `has`) to `GET /api/stories?og=1&kind=…` → `server-lib/og-preview.js`. Humans still get SPA `index.html`. Friends-only/Private + gated posts → generic card only. Challenge URL: `/challenge/{gameId}?name=&score=&cat=` (legacy `?challenge=` still parsed).

**Referrals (Growth G2):** Content URLs keep primary path; signed-in shares append `?ref={username}` (`withReferralParam`). Optional `/invite/{username}` for “Invite to Chaupaal”. Claim via `POST /api/media-config` `{ action: 'referral_claim' }` on **new** Auth accounts (creationTime ≤72h); one `referredBy` per invitee. Inviter chips gated on invitee verified email/phone (`referral_activate`). Virtual chips only (150 invitee / 250 inviter); idempotent `referralGrants`. Pending deep link stashed across auth (`chaupaal_pending_deep`).

**Day-0 (Growth G3):** `first-run.js` Play/Meet/Skip — Play starts practice Akhbaar quiz; Meet → Invite (G2) / contacts / Khoj. Pending deep link / `ref` / challenge / group invite **skips** fork+coach (`hasPendingDay0Destination`). Empty states use `renderEmptyState` with one primary CTA. Signed-in never seeds SAMPLE_CHATS / SAMPLE_DISCOVERY as real graph; guest samples stay Demo-labeled; demo send → soft auth (no fake reply).

**Auth (Growth G4):** Profile-canvas signup on `authRegStep1`. Professional shows `#regProFields` (industry/purpose picklists + Other); Personal hides them. Type fixed after signup (`saveProfileType` + account switcher for the other type). Login folds onto the same canvas; Quiet / reduced-motion skips slide animations.

**Retention (Growth G5):** Day-0 anchor = `users/{uid}.createdAt` (calendar days, IST/`chaupaalUserState.timezone`). Honest D1–D7 only — event-backed (unread/friend request) or clearly generic; never fake social proof. Caps: ≤1 retention push/day, ≤4 in first 7 days. Skip guests, `quietMode`, `notifPrefs.tips===false`, and “come back” if active in last 6h. Idempotent `users/{uid}/retentionSends/{dayKey}_{templateId}`. Cron: `api/chaupaal-scheduler.js` → `server-lib/retention-d1d7.js` (not AI-gated). FCM `link` = `/?section={tab}` or `/invite/{username}`. Private aggregates: `chaupaalMeta/retentionAggregates`; admin peek `GET /api/admin-feedback?view=retention`. Tab nudges stay event-backed + tips/Quiet/guest gates.

**PWA install (Growth G6):** `public/src/js/core/pwa-install.js` captures `beforeinstallprompt` (preventDefault + stash). Soft bottom sheet only after a meaningful moment (day-0 fork, game complete, or 2+ visit days) — never first-paint jail; 7-day dismiss cooldown; Quiet + auth overlay skip. Settings → Install row always available (Chromium prompt / iOS Share→Add to Home Screen guide / Installed). Manifest shortcuts use `/?section=`; `?tab=` still dual-parsed. Guests may install. Local + `trackEvent` signals: `install_accepted` / `install_dismissed`.

**Peepal/Khoj K0 (truth):** Khoj is the **only** people-discovery surface. Vriksha is discussions — Find CTA opens Khoj; `#peepalDiscovery` / Vriksha peeks hidden. Peeks + `personal_match` / `intent_discover` hard-exclude self, accepted friends (mutual follow), pending friend requests, and mutual friends (FoF approx via friends’ friend sets — see `server-lib/discovery-strangers.js`). Signed-in never pads `SAMPLE_DISCOVERY_POOL`. UI shows short **reasons**, never match **%**. Empty → Invite / Search Chaupaal.

**Peepal/Khoj K1 (core):** Khoj top bar = **Search Chaupaal** → `openUniversalSearch` (users/duniya/peepal/groups/games) — not intent_discover. Intent Find = chips + `#khojIntentInput` + Find → `intent_discover` (AI-on: any free text parsed; AI-off: deterministic + soft refine). Compact **Filters** (intent / interest / same city / new) behind a toggle + Clear; apply to Find + peeks. `more_like` / `not_interested` → `discovery_person_signal` → recommendationSignals + user-model refresh. Morph Search shortcut kept.

**Peepal/Khoj K2 (Pro networking):** Professional viewers use `professional_match` (not `skipped_professional`). Peeks prefer Pros + Personal open to network/career. Chips: Networking / Hiring / Job seek / Co-founder / Mentor / Collab (+ Friendship secondary) — no Dating primary. Industry + purpose in filters + ranking reasons. Free-text Find allowed; **dating_opposite_gender suppressed for Pro viewers**. Personal Khoj unchanged (friendship-first + Dating chip).

**Peepal/Khoj K3 (Mashhoor):** `POST /api/peepal-reactions` `{ action: 'mashhoor_trending' }` — live velocity+recency over **~7 days**, public Peepal only; **seeds excluded**; optional friend boost when signed in. No denorm cache. Vriksha intent = Discuss primary + topic chips; Find on Khoj secondary; no people peeks/results on Vriksha.

**Peepal/Khoj K4 (dogfood close):** Arc verified end-to-end. Soft-auth Find stashes `khoj_find` + pending query and resumes on Khoj after login (G2 pattern). Static `scripts/test-peepal-k4.js` locks K0–K3 invariants + resume. Residuals documented in ship notes (cache, embeddings, seed global flip, FoF approx).

**Duniya D0 (truth):** Guests see labeled SAMPLE. Signed-in: live posts clear SAMPLE; load fail → last-good real cache (`chaupaal_duniya_feed_cache_v1_{uid}`, 7d TTL) with Offline banner + Retry (never Sign-in); no cache → labeled demo + Retry. Empty live → honest empty + optional Preview demo. Demo like/comment/save/share = local + “Demo — not saved”. Prasidha excludes samples (warming-up empty until real). Lehar labels Demo clips; null-media sample video fixed. Sample `/post/dN` soft-fails as Demo.

**Duniya D1 (create IA):** Vishwa IG-style story rings (gradient unseen / muted seen; self + badge). **Tap** self → story viewer or create; **long-press** self → post compose; **+** → story only. Morph Create post | Create Story + FAB post kept. Guest create soft-auths with `duniya_compose` / `duniya_story` resume. No SAMPLE authors in live tray.

**Duniya D2 (Vishwa social):** Priority authors = **accepted friends OR following** (plus self). Early **5 slots** newest-first from priority, then remaining loaded posts by recency (strangers kept). Guests/demo: chrono only. Like/save hydrated on load; Demo still local-only. Dismissible “Showing people you follow first” hint.

**Duniya D3 (Lehar filter):** Lehar = vertical video **filter of the same Duniya pool** (not a separate reel inventory). `isVideoPost` requires real media URL + video type/extension/mime (no null ghosts). Signed-in order reuses `rankDuniyaVishwaFeed` among videos. Like/unlike/save call `toggleContentLike` / `toggleContentSaved` directly (no Vishwa card DOM click); share uses the same sheet + `incrementContentShares`. Demo = local + Demo toast. Empty: Post a clip / Browse Vishwa. Mute pref `chaupaal_lehar_muted`; Quiet mode forces mute. Dedicated reel pipeline + Prasidha server trending = deferred (D4).

**Duniya D4 (Prasidha trending):** `POST /api/stories` `{ action: 'prasidha_trending', windowDays: 7 }` — live velocity+recency over **~7 days**, public Duniya only; SAMPLE/demo/seed/archive/saveOnly excluded. Optional light follow boost (`friendSlots: 3`) when signed in; guests get public list (auth optional via `verifyBearer`). Logic in `server-lib/prasidha-trending.js` (mirrors Mashhoor); no denorm cache. Client fetches server list — never masonry local SAMPLE as trending. Empty: Create post / Open Vishwa.

**Duniya D5 (arc dogfood):** Auth success dispatches `chaupaal:auth` → Duniya reloads live feed (clears guest SAMPLE) + story ring. Morph Create post|story soft-auth via `openDuniyaPostSheet` (stash resume). `/story/d1–d5` Demo soft-fail. Boosts/reel pipeline/close-friends audience deferred.

**Duniya soak:** Auth also fires when `db` not ready; signed-in without Firestore never paints guest SAMPLE; auth eagerly clears SAMPLE before reload; long-press binds full self tile (ring+name); `canPersist` uses `contentId` (not firestoreId-only).

**Akhbaar A0 (truth):** `window.akhbaarLiveSet` from Firestore `daily_sets` (else Sample/Offline badge + “Sample practice” chrome). No authored “X% of players” proof UI (real aggregates = A3). Signed-in strips SAMPLE personal (Riya). No streak pre-bump / “Streak Kept” without save. Category filter empty + Clear/Back. SAMPLE bonus never fires live Taaza toast. Surkhiya band labels softened (Highlights / Also worth a look).

**Akhbaar A1 (Khabar core):** Play loop solid (answer → reveal → summary → results). Flag → `openAkhbaarFlagSheet` / `reportAkhbaarQuestion` writes `user_flags` with `targetType:'akhbaar_question'`, sentinel `reportedUid:'__akhbaar_question__'`, + `users/{uid}/reported/akhbaar_*` mirror; Undo via `withdrawReport`+flagId. Soft-auth resume: `akhbaar_flag` / `akhbaar_share`. Share/beat: live uses `buildBeatScoreLink('akhbaar')` → `/challenge/akhbaar`; Sample allows Demo-framed share (home `?tab=akhbaar`) but disables Challenge-a-friend. Beat banner/copy = score challenge, not Muqabala room. Settings Reported lists content flags lightly as “Akhbaar question”.

**Akhbaar A2 (rooms):** Surkhiya = digest-only (expand brief + **Open in Khabar** / prominent **Jump to Khabar**). News bands are priority/index → labels **Highlights / Also worth a look / More picks** (not fake calendar “Today”). Personal wish rows stay time-windowed + `openBaithakWithWish`. Saathi primary actions: `wish` → Baithak wish; `play` → `jumpToAkhbaarKhabar({idx})`. Sources: real friendPools events + friend-uid MCQs in QUESTIONS — no SAMPLE pad; empty → Find friends. Thin friend-MCQ feed is honest empty until real friend personal lands in the set.

**Akhbaar A3 (streaks + proof):** Streak advances once per calendar day when signed-in user **finishes today’s live set** (any score) via `saveStreak({requireLive:true})` — UI updates only after server success; second finish → “Already counted today”. Guests / Sample: no account streak bump (practice note once). `daily_scores/{day}/scores` write live-only. Proof: `POST /api/media-config` `akhbaar_record_answer` / `akhbaar_get_proof` → `daily_scores/{day}/answers` + `tallies` (Admin); show i18n `social_proof` only when **N ≥ 10**; never authored `data.proof`. Milestone copy = “N days in a row” (no fake top players).

**Akhbaar A4 (arc dogfood):** Closed loop verified. Surkhiya i18n bands fixed to Highlights / Also worth a look / More picks (was calendar Today). Reduced-motion skips float emojis. Residuals: per-cat AI packs, richer Saathi inventory, admin tally dash, in-reel Muqabala, true time-filter Surkhiya — deferred.

**Baithak B0 (truth):** Guests see labeled Demo SAMPLE chats (badge + preview) with Sign-in CTA; guest render does not pollute `baithakChats`. Signed-in: `clearBaithakSampleInbox` on init/auth/load fail — never re-seed Riya; empty → Invite / Find; load fail → retry + last real cache. Mehfil live row opens chat only (no surprise auto-join; Join CTA = B4). Pins Self/Chaupaal restored via `pinSelfChat`.

**Baithak B1 (pins):** Sabha pin order always **Chaupaal → Me → rest** via hardened `pinSelfChat` (rebuilds for active uid). DOM re-asserts missing pin rows. Auth/account-switch: clear Demo → `pinSelfChat([])` → paint → ensure docs. Empty Sabha keeps pins + Invite/Find (never “Demo” for signed-in). Self/Chaupaal undeletable (actions gated).

**Baithak B2 (sections):** Sabha = full inbox + pins. Sambhavanayein = non-friend / non-follow DMs only (no groups, no pins). Mitra = friend **or** following DMs **+ all groups** (lock 2A; pins stay on Sabha). `filterBaithakSectionChats` shared by list + unread; blocked peers hidden; `chaupaal:relationship-changed` re-filters without reload. Guest Demo only on Sabha; Sambhav/Mitra empty → Sign in. Empties: Mitra “friends and groups land here”; Sambhav points to Mitra for friends/groups. Swipe `sambhavanayein ↔ sabha ↔ mitra`; morph jobs Sabha all / Sambhav new / Mitra friends & groups.

**Baithak B3 (Splits):** User-facing name is **Split** (legacy `instant*` i18n keys / `renderBaithakInstants` / `openBaithakInstantComposer` stay as aliases). Guest tray = Leave a Split soft-auth only — **never** `SAMPLE_STORIES` friend rings (`renderStories` redirects to Split tray). Signed-in loads real Baithak-destination splits; SAMPLE/Demo filtered out; publish via `shareBaithakSplit` refreshes tray. Soft-auth resume: `baithak_split` / `baithak_split_camera` pending actions.

**Baithak B4 (Mehfil entry + arc dogfood):** Inbox live-row tap → **open chat only**; Join is explicit (`#mehfilLiveJoin` / header Mehfil). `requestMehfilAutoJoin` only for `/mehfil` deeplink, `?mehfil=1`, ring Accept, mehfil notification — never list click. Live badge: ≥2 fresh = Live; solo = Waiting. Arc B0–B4 static tests in `scripts/test-baithak-b*.js`.

**Trust T0 (honesty sweep):** `PEEPAL_SEED_CONTENT_ENABLED=false` — signed-in Peepal never seeds/shows `isSeedContent`; guest SAMPLE_PEEPAL labeled Demo. `toastSoon` → honest “isn’t available” (no Coming soon spam). Challenge AI chip disabled when AI off. Onboarding duel no longer writes SAMPLE_STORIES/CHATS while signed-in.

**Trust T1 (dogfood + soak):** Verified T0 holds across Peepal/Duniya/Baithak/Akhbaar/Khoj. Soak fixes: universal search offline path guest-only SAMPLE; Baithak wish never falls back to `SAMPLE_CHATS` when signed-in. Arc complete — residuals below.

**Dangal R4-0 (custom marks):** `GAME_IDENTITY` carries curated inline SVG `mark` per Manch id; `gameMarkHtml(id, { size })` prefers SVG (emoji `icon` fallback). Wired on Manch tiles, GOTD, chat pickers, prepare overlay, challenge cards/pick sheet, Khel dailies, profile stats, share/results chrome (`prepareGameOverlay` injects chrome mark). Aliases (`muqabala`→quiz, `tictactoe`→ttt, …) share canonical marks. No logo settings UI; client-only (Hobby `api/*.js` = 12). Next: R4-1 federation honesty.

**Dangal R4-1 (federation honesty):** Sports that are lite/arcade declare it — `GAME_IDENTITY.law` / `lawHint` + `federationHonestyLine` / `Html` on Manch prepare. Registry + chrome + How to use BWF-lite / ITTF-lite / Pickle-lite / Games-lite / PKL-lite / Arcade chase / USBC-lite / Street formats. Scorebooks already matched advertised lite constants (win-by-2 kept); copy softened where USBC/PKL overclaimed. `GameUI.attachHowTo` ships detail behind How to. Deferrals: full sets, federation timers, Scribble party depth. Next: R4-2 dogfood + soak.

**Dangal R4 done (R4-2 dogfood + soak):** Marks + lite honesty verified. Soak fix: court `openShell` now passes `gameId` into `gameChromeHtml` and runs `prepareGameOverlay` after chrome DOM (in-game header mark matches Manch). Leave/cleanup RAF OK. Residuals: full federation timers/sets, user-uploaded logos, Scribble party, bowling physics beyond lite oil, Quiet overlay enter motion (marks themselves static). Arc complete — next is a planning choice.

**Dangal G0 (roster cull):** 19 titles ship. `DANGAL_ROSTER` / `DANGAL_ROSTER_IDS` / `DANGAL_ROSTER_SECTIONS` in `dangal-graduation.js` are the single source of truth — registry genre + `getGames`, GOTD (`server-lib/game-of-day.js` mirrors it) and pickers read it; new titles (party G1–G3) land there first under the `party` section. 13 titles retired (`DANGAL_RETIRED_IDS` + legacy spellings; server mirror `RETIRED_GAME_IDS`): `registerGame` rejects them, launch/tap/challenge-card/`/challenge/{id}`/matchmaking paths open `openRetiredGameScreen` (“This game has retired” + Browse games). Server: `dangal_game_resolve` voids retired matches (no escrow exists — stakes only move at resolve, so void = every staked chip stays put; no stats/Elo/leaderboard writes); matchmaking returns `status:'retired'` and never enqueues. Stored gameStats/leaderboard rows for retired ids are filtered at read (no Firestore migration); earned chips untouched. Test: `scripts/test-dangal-g0-cull.js`.

**Dangal G1 (Party Kit + Imposter):** `PartyKit` (`games/party-kit.js`) is the shared party layer for G1–G3: pass-and-play cover (secret HTML only in the DOM while revealed), pausable countdown, player editor, scoreboard, and a Room adapter (`connectRoom` / `roomCall`, code + `/party/{game}-{CODE}` link, Baithak `party_invite` card). Round logic is pure and shared client/server (`games/imposter-core.js`, UMD; server requires it by literal path). Room secrets are dealt server-side: `api/media-config` action `party_room` → `server-lib/party-deal.js` (one Admin transaction per op on `games/imposter/{code}`). RTDB split: `pub` (members read, round state via `publicView` — no roles/words/votes-in-progress), `secrets/{uid}` (owner-only read), `presence/{uid}` (self write), `server` (no client access) — host can’t read roles either. Deadlines are server-driven via client `tick`; offline clue-givers are skipped, host migrates. Pass & Play is fully offline and signed-out. Party-kit games are `grade:'party'`, `stakes:false`, not Live-capable. Packs (`data/imposter-packs.js`): 8 × ≥40 words (en + hi + Undercover partner). Test: `scripts/test-dangal-g1-imposter.js`.

**Dangal G2 (Raja Mantri Chor Sipahi + Dumb Charades):** Both sit on the Party Kit — extend the kit, don’t fork it. `server-lib/party-deal.js` is a generic room engine; each game is an adapter (`deal`, `view`, `phaseKey`, `deadlineMs`, `apply`, `timeout`, `ops`, `lobbyOps`, `onJoin*`/`onLeave`, `hydrate`) over its UMD core (`rajamantri-core.js`, `charades-core.js`; fuzzy guess matching in `party-core.js`). RTDB path `games/{game}/{code}` with the same pub/secrets/presence/server split. Client rooms use `PartyKit.openRoomScreen(spec)` (`holdKey` keeps a private cover up across repaints; `lobbyListHtml`/`canStart` for team lobbies); open a room from a home sheet with `PartyKit.closeThen(shell, fn)` so the nav-stack `history.back()` can’t close the new layer. `connectRoom` defers listener callbacks until it has returned, and takes clock offset from `.info/serverTimeOffset` (fallback: freshest of `pub.serverNow` / op-response `serverNow`) — never trust a cached `pub.serverNow` alone. RMCS: 4 classic, 5–8 extended (Rani 900, Daku 0 thief, Senapati 700, Daroga 600); wrong pick swaps guesser ↔ thief (split with two thieves). Charades packs (`data/charades-packs.js`): an `@` prefix marks a regional title inside a global pack — dealt only for `hi*` locales or when a regional pack is selected. Test: `scripts/test-dangal-g2-party.js`.

**Dangal G3 (Most Likely To? + Would You Rather):** One game id `mostlikely`, mode switch on setup — never two Manch tiles. Core `mostlikely-core.js` + packs `data/mostlikely-packs.js` (bilingual rows; Desi Life / Filmy are regional, default only for `hi*`). Votes are secret: Room votes live in `server.hidden.votes` (no client read) plus the voter’s own `secrets/{uid}`; `pub` carries only `voted[]` until reveal. Anonymous reveal publishes tallies only — no voter map, and Most Likely To awards no points (they would expose voters). Pass & Play uses `PartyKit.mountPassVote` (secret pass-around); “count of 3” is Advanced. Kindness guardrail = shared `KINDNESS_CLASSES` (Latin whole-word; Devanagari word-start) used by the packs test, client custom prompts and the server re-check. Custom prompts are session-only on the host’s phone; the room gets one per deal through `openRoomScreen({ startArgs })` → `ctrl.startWith` → `dealRound(room, now, rng, args)`. Set `pub.over` only once the round reaches `result` (the last round still gets its defence beat). Test: `scripts/test-dangal-g3-mostlikely.js`.

**Dangal G4 (dogfood):** Party packs + cores are lazy: `index.html` lists them as `<script type="text/x-lazy" data-party-lazy>` (bust-assets still stamps them), `LAZY_DATA` in `party-kit.js` maps game → files, and every launcher / `openRoom` goes through `PartyKit.withGameData` (sync when warm; one toast on failure; idle prefetch keeps offline Pass & Play working). Anything that shows a secret registers with `PartyKit.coverWhenAway(root, onAway)` — blur / hidden / pagehide re-cover it; watchers prune when the node detaches. Inside `.pk-shell` `[hidden]` always wins. Imposter packs carry `regional: true`; Mixed deals global packs only unless `mixRegional` (client sets it for `hi*`). `applyChromeI18n` keeps the HTML copy when a key is missing (never a raw key). Test: `scripts/test-dangal-g4-dogfood.js` (also runs G0–G3).

**Dangal H0 (roster touch-up):** Kite Fight (`patangbaazi`) retired G0-style — on `DANGAL_RETIRED_IDS` (+ `kite` / `kitefight` / `patang`) and server `RETIRED_GAME_IDS`; court-sports is badminton only. Ank Jod is shown as **Kakuro** everywhere, but the id stays `ankjod` (PBs `chaupaal_pb_ankjod*`, saves `ankjod_save_*`, stats and leaderboards unchanged); `kakuro` is a permanent alias in every canonicaliser (`dangal-utils`, graduation `ROSTER_ALIASES`, economy, `normalizeDangalGameId`) plus `window.openKakuro`. Never Have I Ever is the third `mostlikely` mode (`nhie`): English-only packs (`never` rows, localise via i18n `nhie.<pack>:n<i>`), votes `'have' | 'never'` in `server.hidden.votes`. Five-finger scoring (`session.fingers`, default on) only runs with names reveal — anonymous reveal is counts only and never costs fingers (a lost finger would name who has). Out-of-fingers players sit out (`nhieRoundPlayers`); late joiners start at the lowest live hand; `session.nhieOver` ends the game (last hand standing, shared on a wipe-out; round cap → most fingers). Test: `scripts/test-dangal-h0-roster.js` + NHIE section in the G3 test.

**Dangal H1 (Werewolf):** One game id `werewolf`; Werewolf | Mafia is a theme (`settings.theme`) that only reskins names / icons / narration (`WerewolfCore.THEMES`). Core `werewolf-core.js` is shared by Pass & Play and the room adapter `server-lib/werewolf-engine.js` (registered as `GAMES.werewolf` in `party-deal.js`). Secrecy: roles, night acts, Seer log, uncounted votes, wolf chat and spectator chat live only in `room.server`; `afterChange` rewrites every player's `secrets/{uid}` (own role, pack + wolf chat for wolves, Seer log, Witch potions + agreed victim, own night pick / vote, full spectator view for the eliminated). `pub.state` = public state + day chat only; day votes are published in the log at the count. Everyone acts every night (villagers get the decoy “suspect”, which feeds the suspicion stat) and Pass & Play holds each night screen for the same `NIGHT_HOLD_MS`, so timing and tap count never give a role away. Missed night action = none, missed vote = abstain; leavers are out with a `left` log entry; late joiners are pending spectators (kit `spec.renderPending`). Kit extensions: `renderPending`, `chatHtml` / `wireChat`, `mountPassVote({ coverTitle, coverIcon })`, real `Sound.playAmbient('night'|'day')`. RTDB rules need the `games/werewolf` block deployed (`firebase deploy --only database`).

**Dangal H2 (Penalty Shootout):** Game id `penalty` (Sports, portrait, rated, `live1v1` + stakes). `penalty-core.js` (UMD) is the only outcome model + shootout rules: `resolveKick(kick, dive, seed)` is pure and seeded (`TUNE` holds wobble / reach / pull / back-reach numbers; tests pin the rates), `shootoutStatus` does alternation, early finish and sudden death in pairs, `aiKick` / `aiDive` are deterministic given an rng (Hard remembers the human's in-match habits only). No physics: the 2.5D canvas animation in `penalty.js` plays the resolved result. vs AI + Pass & Play resolve on the phone (practice reward only, like other practice titles). Live goes through `POST /api/media-config { action: 'penalty_kick', op }` → `server-lib/penalty-engine.js`: RTDB `games/penalty/{matchId}` with `pub` (players read, server writes), `secrets/{uid}` (own pending choice), `presence/{uid}` (self-write, server timestamp), `server/` (pending kick + dive, no client access). A kick is only written to `pub.kicks` after both choices are in; timeout = random pick; opponent presence stale > 90 s = forfeit; leave = forfeit; unjoined / cancelled = void. Chips + Elo settle server-side via `resolveGame(..., { trusted: true, flags })`; `SERVER_SETTLED` ignores any phone's claim that names an opponent or stake. `settle_claim` / `settle_done` are internal ops. Matchmaking now returns a shared `matchId` + `role` (`host` kicks first). The registry's `ownHome` flag opens the game's own home (Play vs AI / Play a friend) instead of the generic mode sheet.

**Dangal H3 (Texas Hold'em):** Game id `poker` (new **Cards** genre with Teen Patti / Rummy / Bluff; `live` / `liveParty`, stakes only on Quick + Sit & Go). `poker-core.js` (UMD) owns every rule: evaluator (best 5 of 7, wheel, no suit ranking), NLHE hand reducer (`createHand` / `applyAction` / `legalActions`, min raise = last raise, short all-in does not reopen), side pots + odd chip left of the button, showdown order, seating / dead blinds (`planHand`), Sit & Go blind schedule + payouts, friends settings, and deterministic bots (Chen preflop + Monte Carlo equity, per-level bluff / call rates — no LLM). Practice vs bots runs on the phone. Quick / Sit & Go / Friends go through `POST /api/media-config { action: 'poker_table', op }` → `server-lib/poker-engine.js`: RTDB `games/poker/{tableId}` with `pub` (players read; public hand only), `secrets/{uid}` (own hole cards only), `presence/{uid}`, `server/` (deck, all holes, effects — no client access). CSPRNG deal; server timers + time bank (timeout = check if free, else fold); stale presence = sit out. Wallet buy-ins are two-phase (`pokerBuyins` pending → seated / refunded); cashouts, Sit & Go prizes, achievements, stats and light collusion signals are an idempotent effects queue (`users/{uid}/pokerEffects`). `resolveGame` refuses phone claims for `poker` (`SERVER_ONLY`). No chip purchase or cash-out inside Poker. **18+ gate** for `poker` + `teenpatti`: profile DOB, else one-time confirm (`age_confirm` → `adultConfirmedAt`); pickers hide them until then (calm gate card in the Cards grid), launch opens the gate sheet, Game of the Day never features them. India locale puts Teen Patti first in Cards. Deploy `firebase/database.rules.json` (poker block) as an ops step.

**Dangal P0 (residuals + honesty):** Every roster title has a plain rule-source line in `design-system.js` `RULE_SOURCES` ("Rules based on the FIDE Laws of Chess", "Simplified rules based on …") — shown by `federationHonestyLine` in the prepare sheet and at the top of every How to. Federation names appear only there: no "official", no "-lite" federation labels, no logos (marks are our own inline SVG). Bots are labelled (Poker seats `🤖 Name · Level`, Penalty "AI", Quiz / Ludo "Practice AI"). The shedding-card game ships as "Oh, No!". Live capability comes from the graduation tag (`registerGame` derives `liveDuel`), not descriptor flags. `scripts/test-dangal-p0-residuals.js` guards all of it.

**Dangal P1 (shared pro contracts):** Four shared contracts every game plugs into. **Rules** — `dangal/dangal-rules.js` declares each roster game's `ruleset` (name, source, simplified), `variants` (default + options/range + who may change: host / both / solo) and rule text (3-line glance + full rulebook). One Rules sheet (`DangalRules.openSheet`) shows glance → full rules → "House rules in this game" (non-defaults only); every launch gets a Rules button (`ensureRulesButton`) and `attachHowTo` opens the same sheet. Live matches lock variants at creation (`games/{type}/{matchId}/variants`); joiners read the stored copy. Declarations describe current behaviour — rule changes are per-game work. **Live policy** — `dangal/dangal-live-policy.js` (UMD, client + server): reconnect window (60s default; Penalty / Poker 90s, party rooms 45s), heartbeat, turn / bank timers, AFK action → forfeit after N misses, abandon → the player who stayed wins, both gone → `status: 'void'` (stakes never moved, unrated), one active seat per account (second device watches), `protocol` number → refresh prompt, server time via `.info/serverTimeOffset`, rematch keeps variants and swaps sides. `dangal-live.js`, Party Kit and the Penalty / Poker / party engines read it. **Ratings** — `server-lib/dangal-ratings.js` is the only writer; Glicko-2 math in `dangal/dangal-rating-math.js` on the 1200 scale. Rated: chess, streetcricket, quiz, penalty, carrom, badminton, rummy (heads-up). Tic-Tac-Toe is unrated (history kept). No rating vs bots / practice, or on friend-only tables unless `rated: true`. `gameStats.elo` stays as the display number; `rating { r, rd, vol, games }` + `provisional` (under 10 games or RD > 110) migrate lazily. Settlement is atomic (`batch.create` on `dangalMatches/{matchId}`) with one `chipTransactions/m_{matchId}` ledger row per side. Matchmaking bands widen with wait; at most 3 rated stranger pairings with the same opponent per hour. **AI** — `server-lib/dangal-ai.js`: `coachExplain`, `commentary`, `generateQuestions`, `generateWordPack`, `botPersona` (style numbers only), each with a deterministic fallback. LLM only when `AI_FEATURES_ENABLED === 'true'`, not `AI_JOBS_PAUSED`, under `AI_DAILY_CALL_CAP` + per-user cap (`DANGAL_AI_USER_CAP`, default 30); cached by input hash, strict schema + safety filter, 6s timeout, telemetry counters. Exposed as `media-config { action: 'dangal_ai', hook, input }` → `{ data, source }`. Dev harness: `node scripts/dangal-ai-harness.js [--live]`. `scripts/test-dangal-p1-contracts.js` guards all four.

**Dangal P2 (Chess — FIDE + deep AI):** Rules core `games/chess-core.js` (UMD, client + worker + server; Int8Array board, castling stored as rook files so Chess960 / X-FEN work): legal moves incl. castling / en passant / promotion, checkmate, stalemate, insufficient material, **claimable** threefold + 50-move (`claimable()`, "Claim draw", or per-player **Auto-claim draws**, default on), **automatic** fivefold + 75-move, FIDE 6.9 (`timeoutOutcome` → `timeout_insufficient` draw when the opponent cannot mate by any legal sequence). Live + Daily are **server-authoritative**: `server-lib/chess-engine.js` via `POST /api/media-config { action: 'chess_game', op }` (join / move / tick / claim_draw / offer_draw / respond_draw / resign / abort / rematch / settings / settle; `daily_seek` / `daily_cancel` / `daily_list`) owns validation, clocks (server time; lag credit ≤500 ms; clocks start after both first moves; 30 s first-move window → abort), draw-offer spacing, abort-before-your-first-move (no rating, no chips), rematch with colours swapped, duplicate-device seats, delayed `spec` copy for spectators, server-seeded Chess960 and settlement. RTDB `games/chess/{matchId}/{players,pub,spec,presence}` — clients never write `pub`. Ratings per bucket (`gameStats/chess_{bullet|blitz|rapid|classical|daily}`; estimate = base + 40×increment: <3 min bullet, <8 blitz, <25 rapid, else classical; Daily 1/3 days) via `resolveGame(opts.ratingBucket)`; friend games are rated only when the host turns Rated on (matchmaking `_mm_` always rated); untimed = unrated. Daily: Firestore `chessDaily/{matchId}` + `chessDailySeeks/d{days}`, move → push via `upsertNotification`, timeouts swept by `chaupaal-scheduler` and lazily on `tick`. Fair-play: `chessFairPlay/{matchId}` logs engine-match rate + move times; no automated action. Engine: our own (`chess-search.js`, PVS + TT + quiescence + null move + LMR, tapered PeSTO-style eval) in a lazy Web Worker (`chess-worker.js`; main-thread shallow fallback) — **no GPL code**, licences in-app (Chess → Licences). 8 bot levels (≈400…2000, approximate, always labelled "Bot"; levels ≥2 never miss mate-in-1) + personas (Aggressive / Solid / Tricky / Friendly). Review (`chess-review.js`): win% = 50 + 50·(2/(1+e^(−0.00368208·cp)) − 1); expected-points loss best ≤0.01 (or engine top move) / good ≤0.05 / inaccuracy ≤0.10 / mistake ≤0.20 / blunder >0.20; Brilliant = best + sacrifice + not already winning. Coach: `dangal_ai coachExplain` with `allowedMoves` — AI text is rejected unless every SAN/square is engine-grounded; AI off = deterministic engine text. Hints only vs bots. UI `chess-ui.js` (`ChessUI.open`): Play → time control → Start; power in More options / ⋯.

**Dangal P3 (Ludo + Snakes & Ladders + Tic-Tac-Toe):** UMD rules cores `games/ludo-core.js`, `games/snakes-core.js`, `games/ttt-core.js` (lazy via `PartyKit.LAZY_DATA`; the UIs wrap entry points in `withGameData`) are shared by practice, the party-room server and tests. Ruleset attribution is **"Standard rules"** plus declared house-rule variants in `dangal-rules.js`. **Fair dice:** Live dice come only from `server-lib/dice.js` (`crypto.randomInt(1,7)`; no weighting, no pity rolls). Clients call `act('roll')` with no value and the adapter never reads one. Practice uses a seeded mulberry32 (`ClassicsKit.seededRng`) with the same Dice history sheet. Lifetime Live counts are kept in `users/{uid}/diceStats/lifetime` (`party_room { op: 'dice_stats' }`). **Live is room-based** via `openRoomScreen` + `server-lib/classics-rooms.js`, merged into `party-deal.js` `GAMES`, with RTDB `games/{ludo|snakes|ttt}/{code}`. Bots fill seats server-side (labelled "Bot N · Level") and play inside `apply`; deadline slack covers animations. AFK auto-moves (Ludo: most advanced token; Snakes: auto-roll; TTT: easy-bot move), and `maxMisses` or a leave means a bot takeover plus forfeit (Ludo/Snakes) or a forfeit (TTT). **Settlement:** `pendingSettlement` queues `server.settleReq`, and after commit `economy.resolvePlacement` settles idempotently by `dangalMatches/{matchId}`. Placement shares are 2p 100 · 3p 70/30 · 4p 60/30/10 · 5–6p 50/30/20 of an equal-ante pot. Teams: ±stake. Forfeits never win. Bots never take chips. TTT is unrated (draw returns stakes). Old `engines.js` Snakes/Ludo/TTT code is removed; each UI registers with `ownHome:true`. Test: `scripts/test-dangal-p3-classics.js`.

**Dangal P4 (Oh No!, id `uno`):** Our shedding card game; never use the "UNO" name, logo or card design. The rules core is the UMD `games/ohno-core.js` (lazy via `LAZY_DATA.uno`), shared by vs-bots, `server-lib/ohno-engine.js` (registered as `GAMES.uno` in `party-deal.js`) and `scripts/test-dangal-p4-ohno.js`. Ruleset attribution is **"Rules based on the classic shedding card game"**. Defaults are the standard 108-card rules: deal 7, Draw Four challenge (bluff → offender draws 4, honest → challenger draws 6, the challenger gets a private peek), and "Oh No!" catch → draw 2, with a server-timed 6 s window that closes when the next player acts. Scoring runs single round / 250 / 500. House rules (Stacking + mix, Jump-In, 7-0, Draw until playable, Force play, No bluffing, Quick round) lock at start and show in the lobby. **Private hands:** the full state lives in `server`. `pub.state` is `OhNoCore.publicView` (counts only; no draw pile, no Draw Four honesty). Each hand plus any challenge peek goes to `games/uno/{code}/secrets/{uid}`, readable only by its owner. The deck is shuffled with `crypto.randomInt`. A Jump-In sends the `seq` it saw; a stale `seq` is `too_late`, so the first valid arrival wins. Bots play inside `apply` with animation slack. If a bot forgets to call, the chain pauses so humans can catch it. The bluffing persona comes via `dangal-ai` `botPersona({gameId:'uno'})`; honest bots only play Draw Four legally. Live policy: 20 s turns, AFK → auto-draw then pass, 3 misses or a leave → a labelled bot takes the seat and places last. Placement chips settle through `resolvePlacement` (`SERVER_SETTLED` has `uno`). Blaze / Flip and Pass & Play were dropped; vs bots is the solo mode.

**Dangal P5 (Shabd Five `wordguess` + Scribble `scribble`):** Never use the names "Wordle" or "skribbl". **Word safety:** `dangal/word-safety.js` (UMD `WordSafety`) is the one family filter for game chat, custom words, challenge words and AI word packs (`dangal-ai` `isSafeText` calls it). It matches whole words plus a plural "s", so "title", "spicy" and "Scunthorpe" pass. **Shabd Five:** rules/stats/encoding live in the UMD `games/shabd-core.js`; the UI is `games/shabd-ui.js`. Answers are curated in `scripts/data/shabd-answers-source.json` (never served). `scripts/build-shabd-answers.js` applies the deny list, drops plural-by-S words, and writes `data/shabd-answers.js` as one XOR-encoded, shuffled base-36 string. `shabd-lexicon.js` decodes it into a closure and deletes the global. Gloss keys are `wordHash(word)`. Do not add a script that writes a plain answer list. The Daily is `dayNumber(localDate)` (day 0 = 1 Jan 2026), so it flips at the player's local midnight. Stats v2 are keyed by day number; `recordDaily` is idempotent and `mergeStats` unions days. Social features go through `POST /api/media-config {action:'shabd', op: sync|submit|leaderboard}` (`server-lib/shabd-daily.js`). Stats live at `users/{uid}/gameStats/shabd`; results at `shabdDaily/{dayNo}/results/{uid}` as colour rows only. Results are self-reported, and the leaderboard stays locked until you submit. Challenge links are `/party/shabd-{10-char token}` (salted XOR plus checksum). There is no Live mode and no chips. **Scribble:** rules live in the UMD `games/scribble-core.js` (lazy via `LAZY_DATA.scribble`), shared by `server-lib/scribble-engine.js` (`GAMES.scribble`) and tests. Word packs are server-only in `server-lib/scribble-words.js`. The server deals one easy, one medium and one hard word; only the drawer's `secrets/{uid}` holds the choices and then the word. `pub.state` shows the hint pattern and reveals the word only at reveal. Every guess is checked in the room transaction. Scoring: guesser `50 + round(250 × timeLeft/drawTime)`; drawer `max(10, round(200/guessers))` per correct guesser. Hints are evenly spaced and always leave 2 letters hidden. A near miss (1 edit, or 2 edits for 6+ letters) is returned privately. The drawer and players who already guessed cannot post the word (`word_blocked`). Strokes stream to `games/scribble_canvas/{code}/{turnKey}` (RTDB rules: only the current drawer writes during draw; members read). Clients replay batches on a fixed 800×600 bitmap, which covers late joiners and reconnects. The eraser paints white, so flood fill matches on every device. Live policy: pick timeout → auto-pick, and the 3rd miss in a row skips the turn; a drawer who leaves or disconnects has their turn skipped. Safety: majority vote-kick needs 3+ players; the host can remove players (`remove` in lobby, `kick` in game); kicked players can't rejoin (`canJoin`). Report player/drawing uses `openFlagSheet` with `scribble_player` / `scribble_drawing`. The AI themed pack appears only when AI is on and only accepts `source` `ai` or `cache`.

**Dangal P6 (Quiz Muqabala `quiz` / rooms `quizroom`):** Shared rules (categories, scoring, selection, calibration thresholds, Daily seed) live in the UMD `games/quiz-core.js`, which the server and tests import. Never send `correctIndex` to a client before the reveal. Room state is `games/quizroom/{code}`: `pub` (no answers), `server` (unreadable; answers, key), `secrets/$uid`, `lat`. Grading and timing are server-side in `server-lib/quiz-engine.js` through the `party-deal` adapter. The score is `600 + round(400 × (1 − ms/limit))` for a correct answer, and ties are broken by total time. The RTT allowance is `min(250, median/2)`. Solo modes (Daily, Practice, News), reports and the Duel quick-match queue (`quizQueue/duel`, admin-only) go through `POST /api/media-config {action:'quiz'}` → `server-lib/quiz-service.js`. The bundled bank is `server-lib/quiz-bank.js` + `quiz-data/*` (3,000+ items; the test enforces the per-category floors). AI questions come only from the scheduler's batch job `runQuizJobs` (`server-lib/quiz-ai-pipeline.js`: generate → schema → blind verify → dedupe → safety → difficulty → `quizItems` pending). There is no per-request LLM, and AI off means bank only. Moderation is `/admin/quiz.html` via `api/admin-feedback.js` (`view=quiz`, `quiz_approve` / `quiz_retire`). Bundled retirements are stored in `quizConfig/calibration.retired`. Do not add a quiz `api/*.js`.

**Dangal D1 (dogfood wave A):** Games own hardware Back / Escape: `nav-stack.js` hands Back for a `.game-overlay` to the game's own back button (coach → cancel an open leave confirm → the game's leave flow) and keeps its history entry until the overlay closes; programmatic closes set `data-nav-closing`. **Client-reported results** (peer-hosted Live titles via `dangal_game_resolve`) live in their own `c_` match-id namespace; a loss report settles at once, a win or draw claim waits in `dangalClaims/{id}` until the opponent's report agrees (two wins = disputed, nothing moves). The loser only pays what they hold; the daily cap limits the +25 bonus only, never one side of a stake. Placement settlement: everyone forfeited → void; the last human to leave after others walked out is the `stayer` and wins; a forfeited seat never takes a pot share. Party rooms run `onLeave` for the last leaver before closing, deal rematches only to players still online, shift adapter clocks on resume (`onResume`), and never run `afterSettle` twice. Chess: both players past the reconnect window → `void` / `both_left` on rejoin; threefold / 50-move are claims unless auto-claim is opted in; `gameStats/chess` mirrors the last-played speed rating. Quiz Daily / Practice option order is seeded server-side (day-doc salt / random), never from a key the browser knows. Shabd word data is lazy (`LAZY_DATA.wordguess`). `scripts/test-dangal-d1-dogfood.js` aggregates P0–P6 and holds a regression for each fix.

**Dangal P7 (Carrom `carrom`):** "Rules based on the ICF Laws of Carrom" (no logo, never "official"). `games/carrom-physics.js` (UMD, server + browser) is the only physics: fixed 1 ms step, array-order bodies, only + − × ÷ and `Math.sqrt` in the loop, own polynomial trig (`dsin`/`dcos`), positions in and out as integer 0.01 mm — change a constant and the fixture fingerprints in `test-dangal-p7-carrom.js` must be re-recorded deliberately. `games/carrom-core.js` (UMD) is the ICF state machine + bots (sampled shot search through the physics, per-level aim noise, no LLM); Law numbers are cited in comments. Live = `party_room` game `carrom` → `server-lib/carrom-engine.js`: the client sends `{x, angle, power}`, the server validates the striker spot, simulates and publishes the stroke (`log[].before/input/side`); clients animate the same input and snap to `board.pieces`. Carrom is in `SERVER_SETTLED` (client claims ignored). Singles Standard/Quick are rated h2h; Freestyle and doubles are unrated; bots only fill doubles and never carry a stake. Quick match uses admin-only `carromQueue/{singles|doubles}`. Hints and the full rebound preview are Practice / vs-bot only; Live shows first contact only. The legacy Carrom in `party-classics.js` is unregistered (dead code, kept for a later cull).

**Dangal P8 (Rummy `rummy` + Teen Patti `teenpatti`):** `games/rummy-core.js` and `games/teenpatti-core.js` (UMD, server + browser) hold rules, validators, scoring, bots (deterministic, no LLM) and coach text. Live = `party_room` games → `server-lib/rummy-engine.js` / `server-lib/teenpatti-engine.js`: server CSPRNG deal, hands only in `secrets/{uid}` (RTDB-readable by that uid only) (public state carries counts, never cards), server validates every draw / discard / show / bet; turn timer + extra-time bank, AFK auto-plays then auto-drops (Rummy) or packs (Teen Patti). Rummy variant default is `isIndiaLocale() ? '13' : 'gin'`; both always offered (13-card Points / Pool 101·201 / Deals 2·3·6, Gin with knock limit, box/line bonuses, optional Big Gin). Both are in `SERVER_SETTLED`: chip tables settle as a zero-sum `ledger`, Gin h2h is rated, friendly tables and anything with bots never move chips. 18+: Teen Patti always, Rummy only at chip tables (`ageGated` / `ageCheck` on the adapter, client `openAgeGateSheet`). `openAgeGateSheet` resolves from the sheet's `onClose` so the caller never opens its next layer while the sheet's history pop is still pending. Coach (`dangal_ai` `coachExplain`) is practice-only; AI text naming a card outside `allowedCards` falls back to the engine text. Legacy Rummy / Teen Patti in `party-classics.js` are unregistered.

**Dangal P9 (Bluff `bluff` + Tambola `tambola`, big-group fairness):** `games/bluff-core.js` and `games/tambola-core.js` (UMD, server + browser). Bluff: 3–8 seats (two decks from 6), styles Sequence / Follow the rank (default `isIndiaLocale() ? 'follow' : 'sequence'`), server-timed Bluff window where the first call wins; only the last play is revealed; you win on an empty hand only after surviving the window. Its `deadlineMs` during the window arms a decoy checkpoint so the deadline never reveals whether a bot will call; hands live only in `secrets/{uid}`. A leave or 3 AFK misses → a labelled bot takes the seat (forfeit); tables with bots never move chips. Tambola: 90-ball strips of 6 (every number once) + 75-ball cards; tickets are packed 2-digit strings written to secrets at the deal and rewritten only on a bogey or the result; public state is numbers only (~1.4 KB). Daubs are client-only. A claim is one op checked against the numbers called; ties are claims within `TIE_MS`, with the ticket complete at the first claim's ball; a bogey blocks that ticket for that prize (host option: warn first); one claim per 1.5 s. Big rooms (>8) use designated tickers (`Policy.tickRole`: host + 2 seats on time, others 4–8 s late) and skip the presence listener, so a draw costs ~3.3 server calls instead of one per phone. Public chip tables (`quick` op, pointer `tambolaPublic/p{price}`, admin-only in RTDB rules) are 18+, have fixed settings, auto-start 45 s after opening via the adapter's `lobbyTick` (bots fill to 6) and cap at 40 humans (one Firestore ledger batch). Bots' and unclaimed prizes are refunded to buyers. Private rooms are for fun or table chips (no Firestore), up to 120 players. Caller mode (offline, no sign-in) prints valid coded tickets (`ticketCode` / `printedSheet`) and checks them with "Check a ticket". Both are in `SERVER_SETTLED`. Legacy 1v1 Bluff / Tambola in `party-classics.js` are unregistered.

**Dangal P10 (Street Cricket `streetcricket`: laws, scoring engine, scorecard):** `games/cricket-engine.js` (UMD, lazy via `LAZY_DATA`, also required by `server-lib/cricket-engine.js`) is a pure reducer: `replay(config, log)` → state. Log events are `{ t: 'ball', extra: ''|'wd'|'nb'|'b'|'lb', runs, out, del, shot, timing, contact, dir, dist }`, `{ t: 'pen' }` and `{ t: 'end', reason }`. Law checks (`dismissalAllowed`) live in the engine: off a no-ball, only a run out; free hit carries through a wide; a wide allows stumped, hit wicket or run out; first-ball immunity and no-LBW come from presets. Formats are Super Quick 1/1, Quick 2/2, Standard 5/3 and Long 10/5. Presets: Standard (rated), Gully (no LBW, one tip one hand, six and out, last man stands) and Backyard (no LBW, can't be out first ball, tip and run, one-bounce catch); Gully and Backyard are unrated, and their toggles are host-locked. Ties go to a Super Over (the chasing side bats first; one replay, then boundary count), a shared result or boundary count. In 1v1 each side's wickets are numbered "lives" ("Ava", "Ava (2)") on a single crease; `crease: 'pair'` supports multi-player sides. Gameplay hooks: `resolveBall(input, seed)` wraps the migrated `resolveStreetBall` with `wideP` / `noBallP` per delivery and `TUNE` probabilities. Live goes through `/api/media-config` `cricket_match`: the bowler sends `bowl { ballNo, delivery }`, and the server stamps `ball.startAt` (`LEAD_MS` ahead). The batter sends `hit { ballNo, shot, t, rtt }`; the server clamps `t` to [arrival − (rtt+150, ≤1500), arrival], rolls its own seed and appends the event. Runs and dismissals are never read from a phone. Both clients build the config with `CE.liveConfig(pub)`. Timeouts auto-bowl or record a miss, and 3 AFK misses forfeit. Achievement: `cricket_three_sixes`. The scorecard sheet has Scorecard / Charts (run worm, Manhattan, wagon wheel) / Ball by ball tabs and a share card. Match history (12 matches, config + log) is kept on the device and shown on your own profile. Attribution: "Based on the MCC Laws of Cricket, adapted for street play". P11 owns commentary and balance.

**Dangal P11 (Street Cricket 2: depth, commentary, Live edge cases):** Outcome model is `games/cricket-model.js` (UMD, lazy, shared with `server-lib/cricket-engine.js` and `scripts/sim-cricket.js`); every table is data — `LENGTHS`/`VARIATIONS` (bowling), `SHOTS` fit per line × length × variation, `TIMING`, `OUTCOMES`, `EDGE`, `FIELDS` (per-region catch and boundary multipliers plus slip, gap and `runRisk` for attacking / balanced / defensive / protect off / protect leg), `PITCHES` (flat, green, dusty; Gully always tarmac), `RUNNING`, `CONFIDENCE` (±% contact, shown as the Set meter), `UMPIRE` (DRS-lite track + umpire's-call band) and `TIERS` (Easy / Normal / Hard / Pro Bot). Bowl = over type + field (locked after the first ball of the over) + per-ball line/length/variation + a 1.6 s accuracy meter (`meterAccuracy`; hard targets risk full toss / wide / no-ball via `missChance`). Bat = 8 shots × timing, footwork (step out vs spin → stumping risk) and a run call (hold / take 1 / push 2; run-out risk by field and direction). DRS-lite: Standard preset only, one review per innings on LBW / caught behind, lost only when the decision stands (umpire's call keeps it), labelled simulated. **Balance** (`node scripts/sim-cricket.js`, 10k matches per format + preset, Normal v Normal): Standard medians super quick 8, quick 19, standard 46 (target 40–70), long 92; 11.8 balls per wicket (9–20), boundary share 54% (35–60%), extras 2.1% (2–7%); perfect beats random 99.9%; tier ladder 81.5 / 69.5 / 64.1%; EV checks: every shot has a losing delivery, every delivery a wrong shot with EV < −1, no dominant shot or plan. **Commentary** (`games/cricket-commentary.js`): 300+ templates × two personas (calm analyst / excited fan), key moments only, no repeat in a match (seeded picker), 140-char lines, 320-char recap with numbers grounded in match facts. AI (`dangal_ai` hook `commentary`, modes `over` / `recap`): batched per over, requested only by player A (server lease), cached in `pub.ai`, per-user + `AI_DAILY_CALL_CAP` caps, 6 s timeout, schema + safety + number-grounding validation, template fallback on any miss; client stops asking on `ai_off` / caps. **Live** ops: `call`/`choose` toss (rematch swaps the chooser), `setup`, `bowl {m, rtt}` (meter RTT allowance ≤ 200 ms), `hit {t, rtt}` (compensation ≤ 400 ms), `review`, `comment`, `recap`; server-issued release time; AFK → auto stock ball / auto-defend, 3 misses or an expired reconnect window forfeits; innings break survives rejoin; spectators (`watch`) read scorecard + commentary. Scene: `games/cricket-scene.js` canvas (run-up, flight, swing, fielders, stumps, slow-mo replay, DRS track), Web Audio sfx + optional Web Speech voice (off by default).

**Dangal P12 (Badminton 1: laws engine, singles + doubles, server authority):** Laws live in `games/badminton-engine.js` (UMD, lazy, pure; shared with `server-lib/badminton-engine.js`): `replay(config, log)` derives score, games, server / receiver / service court, doubles positions (`pos[side] = [player in R, player in L]`), intervals, ends, umpire calls and stats from `start` / `rally` / `let` / `end` events. Formats: Standard (best of 3 to 21, cap 30, rated), Single game to 21, Quick 11 (best of 3 to 11, cap 15, interval + decider end change at 6 — labelled a Chaupaal quick format; both unrated). Fault codes (`out`, `net`, `net_touch`, `double_hit`, `obstruction`, `serve_height` / `feet` / `net` / `short` / `long` / `wide`) and let codes; `landingFault` knows singles vs doubles width and the doubles long service line; `checkService` implements Law 12 correction. The gameplay layer (`PLAY`, `resolveContact`, `botTiming`) maps the existing one-button timing onto the laws; P13 replaces it. `games/badminton-match.js` is the one reducer: the phone runs it for vs Bot / bot-partner games, the server (`badminton_match` on `/api/media-config`, RTDB `games/badminton/{id}`, server-only `games/badmintonQueue` for doubles matchmaking) is the only authority for Live — a phone sends only `hit { n, k, t, rtt }` (RTT comp capped at 300 ms); there is no point / score op. Bot contacts resolve at once with future `at` stamps and `stateOf(pub, now)` hides them until then. AFK = auto-serve / no swing counts a miss, 3 misses forfeits; offline past the policy window forfeits. Rated + stakes: two-human Standard singles only; doubles records team results through `resolvePlacement` (unrated, no team ratings yet). Attribution comes from design-system `RULE_SOURCES` (federation names nowhere else). Umpire calls are text first, Web Speech optional and off by default. Tests: `scripts/test-dangal-p12-badminton-engine.js`.

**Infra I0 (category cache cron):** Hobby-safe daily cron `/api/refresh-category-cache` `0 2 * * *` in `vercel.json` (alongside scheduler). Pause/AI-off/budget → 200 no-op; partial failures keep prior caches; cold client Offline empty. 

**Infra I1 (dogfood + soak):** Soak fixes — cron `bumpBudget`; merge never empties the other field; default limit = all scoped jobs; paused client only serves `webGrounded` v2; unpause checklist + `AI_JOBS_PAUSED` / client `CAT_LIVE_AI_PAUSED` clarified. Arc complete.

**Infra I2 (content embeddings):** Public `duniya`/`peepal` `contentEmbedding` via enrichment; `rankContentItems` / Mashhoor / Prasidha / `rank_content` consume cosine when present.

**Infra I3 (budget + env matrix):** Embed sweeps share `AI_DAILY_CALL_CAP` + `AI_JOBS_PAUSED`; soft `deadlineMs` mid-job stop; operator env matrix in `.env.example`.

**Infra I4 (dogfood + soak):** Close verified — category cron, vector people, content embeds + rank, budgeted jobs/env. api=12. External residuals only: paid ANN at massive scale; continuous legacy content backfill; Pro sub-daily cron / maxDuration raise without inspect evidence.

**Infra complete (I0–I4).** Next arc = planning MCQs.

**One layer = one history entry:** Each real overlay gets exactly one `{ chaupaalLayer: true }` push. Overlays that call `pushNavLayer` / `openLayer` manually must set `data-nav-managed="1"` so the MutationObserver does not double-register (`openLayer` does this for you).

**Dismissal:** Tap-outside and system/gesture back must close exactly one layer via `removeNavLayer` / `popstate` / `openLayer().close()`. Parent views (e.g. chat) use `beginOverlayScope` / `endOverlayScope` so nested overlays clean up when the parent closes.

**Recovery:** If the stack and visible UI diverge, call `recoverNavStack()` — do not leave the user with a dead back button.

**Non-layers:** DOM injected for media controls, progress bars, or other inline UI must use `data-nav-ignore="1"` and must never match overlay selectors.

**Mehfil:** Full-screen room overlay must stay `position:absolute` inside the app shell (never `position:fixed` on `body`/`html`). Leave always goes through nav-stack dismiss; teardown must call `clearShellGlitches` and clear any shell class such as `.device.is-mehfil-open`.

---

## 2. Media / audio-video contract

**No history interaction:** Play, pause, seek, volume, and buffering state changes must never call `history.pushState`, `replaceState`, or `back`.

**Single music preview:** `music-card.js` owns one shared `Audio` element app-wide. Starting playback on a new card pauses the previous card.

**Cleanup:** Every `bindMediaControls()` call returns a cleanup function; re-bind only after calling the previous cleanup. Components that mount media must remove listeners on dismiss (`chaupaal:dismiss`, overlay close, tab hide).

**Pause on navigation:** Music pauses when chat/story overlays dismiss (`pauseAllMusic`) and when the document becomes hidden.

---

## 3. Popup / modal contract

Dismissible surfaces inherit:

- Backdrop / scrim tap → dismiss
- System back / Escape → dismiss top nav layer
- Swipe-down on bottom sheets (via `touch.js`)

Do not re-implement per-feature back handling when building through nav-stack. Provide a close control with `[data-overlay-dismiss]` or a known close selector.

---

## 4. Persistence contract

Any message, attachment, story card, or rich bubble type must **render identically from stored Firestore fields after reload** as at send time.

- Persist all fields needed to hydrate UI (not in-memory-only state).
- After loading messages/stories, call the appropriate `mount*` helper (`mountMusicCards`, `mountLocationCards`, etc.).
- New attachment types must follow the same pattern as `music`, `location`, and `attachment` in `streak.js` / `sendRealtimeMessage`.

---

## Checklist for new features

- [ ] Overlay registered via `openLayer` (preferred) or `pushNavLayer` + `data-nav-managed` if manual
- [ ] Close path removes/hides DOM (not only `removeNavLayer`)
- [ ] No direct `history.*` except deeplink routes
- [ ] Media does not touch history; listeners cleaned up on dismiss
- [ ] Firestore payload includes all fields needed to re-render after reload
- [ ] Tap-outside and back dismiss work without custom one-offs
- [ ] Closing the feature clears keyboard inset / never leaves `html.kb-open` stuck
- [ ] Failures call `reportClientError` (or are caught by `safeFeature`) and recover the shell
- [ ] Full-screen rooms (Mehfil) are shell-contained; leave clears shell classes / `clearShellGlitches`

---

## 4b. Runtime resilience & daily error summary

- `public/src/js/core/runtime-guard.js` owns shell recovery (`clearShellGlitches`), scoped recovery chip (`showRecoveryChip`), and client error reporting.
- Prefer `safeFeature(name, fn)` for risky entrypoints. On failure: report (`fatal:false`) → clear keyboard/nav glitches → inline `showFeatureError` on the feature host → `recoverNavStack`. Global recovery chip only if the current tab is still blank after recover.
- Global `window.onerror` / `unhandledrejection` always **console.error**. The “Something went wrong — tap to continue” chip is one-shot: skip noise (ResizeObserver, abort, offline, permission-denied, …), never stack, snooze the signature for the session after tap. `fatal:true` only when the shell is unusable. Never a full-page takeover that hides the real error.
- Client errors: session write-cap + client dedup → `clientErrorCounters/{day_hash}` (increment) and occasional `clientErrorReports` samples. No chat/user PII fields.
- Admin glance view: `/admin/client-errors.html` via `GET /api/admin-feedback?view=errors` (admin claim).
- Surfaces tagged as `pwa` | `mobile_web` | `desktop`; screens coarse (`chat`, `peepal`, …).

---

## 4c. Defensive coding for integrations & dynamic lists

Any code that touches an **external integration** or renders a **long/dynamic list** must degrade gracefully. An uncaught exception there must **never** escape into the shared overlay / nav-stack system.

**Integrations in scope:** JioSaavn / iTunes (music), Agora (Mehfil), Klipy GIFs/stickers/memes/clips (`gif_search` + `kind` on media-config; local Giphy CDN pack / emoji stickers as fallback), YouTube embeds, weather / events APIs, AI (`callAI` / media-config actions), maps/geocoding, and similar third-party fetches.

**Dynamic lists in scope:** Peepal options, chat message history, search results, story carousels, infinite feeds — anything whose length or item shape comes from the network or user content.

**Required pattern:**

1. **Catch at the feature boundary** — `try/catch` (and `.catch` on promises) around the integration call and around the HTML/DOM render for that feature. Prefer `safeFeature('name', fn)` for entrypoints.
2. **Scoped empty/error UI** — on failure show an inline empty or error state *inside that feature* (`showFeatureError(host)`, “No results”, “Preview unavailable”). Do not blank the whole shell.
3. **Never throw through dismiss / nav** — dismiss callbacks, `onSelect` handlers, and overlay close paths must swallow/report errors. Nav-stack / overlay-scope isolate dismiss with `safeDismissLayer` / per-overlay try/catch; do not rely on that alone — still wrap your own feature code.
4. **Sanitize / normalize list items** — escape text before `innerHTML`; pad/align parallel arrays (e.g. options vs response counts); avoid `Math.max(...hugeArray)` and other spread-of-unbounded-arrays.
5. **Report, don’t hide** — call `reportClientError({ feature, message, stack })` (or let `safeFeature` do it). Recovery UI is a safety net for users; logs/Firestore counters are for you.

Point future Cursor sessions at this section before adding a new provider, picker, or feed renderer.

---

## 5. Vercel Hobby function cap

Production is Hobby: **≤12 serverless functions**. Each `api/*.js` file counts; a `vercel.json` rewrite does not un-count a leftover file. Do not add a new `api/*.js` — fold into an existing route and `server-lib/`. See `.cursor/rules/vercel-hobby.mdc`.

## 5b. Payments contract

All paid features must go through `server-lib/payments.js` and write to `chaupaalTransactions` with a `purpose` tag (`boost_post`, `premium_subscription`, `companion_gift`, …). Do not invent per-feature payment ledgers. Gate live charging with `PAYMENTS_ENABLED` (default off). Never simulate a successful charge while the kill switch is off.

## 6. Product philosophy (limits & attention)

Internal decision guide: [PHILOSOPHY.md](./PHILOSOPHY.md) — *attention is the scarce resource, not access*. Check new limits/features against it before shipping. Never surface that doc to users.

Policy numbers live in `public/src/js/config/policy-limits.js` (anon posts, AI Discovery messaging).

## 7. Auth & identity

See `.cursor/rules/auth-identity.mdc`.

- One Firebase Auth user (email **or** phone, verified) = **one Chaupaal account** with **one profile**. Device switcher = multi-**account** (separate logins), not many profiles under one uid.
- Keep `profiles/primary` + `activeProfileId` + username → `{ uid, profileId }` for login resolution; do not productize extra profiles per login.
- Verify email/phone with OTP (or Firebase email/phone verification) before treating them as registered.
- Persist login on device until explicit logout.
- Username unique; rename frees the old name immediately.
- Soft reset OK for pre-launch (re-register).

## 8. Outbound links & display names

- User-generated URLs go through shared `linkify.js` + leave-Chaupaal interstitial. Server check is `POST /api/media-config` `{ action: 'check_url' }` → `server-lib/url-safety.js` (Google Web Risk Lookup when `GOOGLE_WEB_RISK_KEY` is set; heuristics otherwise). Never skip the interstitial.
- User display names in HTML should render via `formatDisplayNameHtml(name, profileTypeOrUser)` so the Professional seal badge stays consistent. Do not invent per-surface badge markup.
- Denormalized user blobs (`c.user`, post authors, chat peers, story owners, typing payloads, etc.) must include `profileType` at write time. For older docs missing the field, call `enrichUsersWithProfileType` (batched uid lookup + short TTL cache in `profile-type-enrich.js`) before render; fall back to no badge if unresolved. Delete the enrich helper once old content ages out.

## 9. Service worker / PWA updates

- `public/sw.js` must call `skipWaiting()` on install and `clients.claim()` inside the activate `waitUntil`.
- Activate must delete every Cache Storage entry whose name is not the current `CACHE`.
- HTML shell (`/`, `/index.html`, navigations, `destination=document`) is **network-first**; never cache-first. Do not return `index.html` as a fallback for failed JS/CSS fetches.
- Client (`service-worker.js`) shows a tap-to-reload banner on updates and reloads once when the SW cache version changes.

## 10. Firebase App Check

Enforcement is **ON** for Firestore / RTDB (and Storage if enabled). Client uses reCAPTCHA v3 via `public/src/js/config/app-check.js`. See README for ops notes.

## 11. Public vs private user profiles

- Full `users/{uid}` — **owner read/write** (plus Admin SDK). Contains email, phone, DOB, prefs, visibility flags, etc.
- `users_public/{uid}` — **visibility-aware** projection other signed-in clients may read. Owner syncs via `UsersPublic.syncPublicProfile` on profile save / login.
  - Always safe: name, username, photo, profileType, `profileVisibility`.
  - **Private / Friends only:** strip age, city, bio, gender, layout, and other PII from `users_public` (strangers must not read gated fields).
  - **Friends only:** richer fields + Digital friends blocks live in `users_public/{uid}/friend_projection/*` (rules: owner or `isFriend`).
  - **Public:** respect `showAge` / `showLocation` / `showRelationship` / `showIncome` / `showReligion` when projecting.
- Canonical Digital layout: `profile.digitalLayout` (+ `tabOrder`). Legacy `sectionOrder` / `customSections` migrate one-way into Digital blocks / tabOrder (P2). Customs already in `digitalLayout.blocks` must not also appear as custom tabs.
- Cross-user UI must use `users_public` / friend_projection (or denormalized blobs), never the private user doc.

## 11b. Archive (P3)

- Canonical Archive Hub: `archive-hub.js` only. Journal = `users/{uid}/journal`. Activity likes/comments = private mirrors written from `social-persistence.js` (canonical social state stays on the post).
- Do not write `chaupaal_archive` localStorage or `daily_checkins` for new check-ins.
- Recovery bin is **device-local** (30 days / 50 items). Export / delete-account via `api/media-config` actions `export_account_data` / `request_account_deletion`.

## 11c. Signal spine (P4)

- Client: `trackSignal` / `signal-spine.js` — batched POST `ingest_signals` to `api/chaupaal-events`. Consent default **on**; Settings → “Personalization & activity” opt-out stops collection (`activitySignalsOptOut`).
- Never put raw search/message/journal text or precise lat/lng in events. Hash queries client-side; server sanitizes `ctx`.
- Storage: `users/{uid}/signalRollups/{yyyy-MM-dd}` (primary), `signalEvents/{yyyyMMdd}/items/{id}` (high-value raw, ~14d prune via scheduler).
- Existing stores still valid for P5: `recommendationSignals`, `matchEngagementEvents`, `discoveryQueryLogs`, `chaupaalUserState.hourBuckets`.

## 11d. User model (P5)

- Derived doc: `userModels/{uid}` via `server-lib/user-model.js` (`getUserModel` / `putUserModel` / `refreshUserModel`). **Admin-only** in rules (no client read — 10B).
- Built by `api/chaupaal-scheduler` cursor batch + on-demand `refresh_user_model` on `api/peepal-reactions`. Pure scorer: `buildUserModelFromInputs`.
- Interest authority: declared P1 `interests` (+ hobbies) → behavioral signals/rollups. **`personalityProfile` is legacy client-only — never feeds the model.**
- Opt-out → declared-only model (`behavioral: false`). Teens: no dating intent, no people map, no watch-together format affinity.
- P6 must call `getUserModel(db, uid)` — never raw Firestore paths.

## 11e. Retrieval & ranking (P6)

- Interfaces: `retrieveCandidates` / `rankCandidates` / `rankContentItems` in `server-lib/retrieve-rank.js`.
- **Backends** (`CHAUPAAL_RETRIEVAL_BACKEND`, default `firestore-shards`):
  - `firestore-shards` — `candidatePools/*` merge + hydrate (unchanged).
  - `vector-index` — **people only**: pool prefilter (≤12 shards, ≤96 entries) → hydrate (≤80 reads) → in-process cosine on `users.profileEmbedding` → top-K. No unbounded full-scan. Missing viewer/candidate embeddings or errors → **fall through** to shards (never hard-fail empty). External SaaS only if already in env; v1 is cosine in-process.
- **Content embeddings (Infra I2):** offline `runContentEmbeddingJob` writes `contentEmbedding: { vector, textHash, model, provider, updatedAt }` on public `duniya`/`peepal` only (caption/question/title/tag; redacted). `rankContentItems` / Mashhoor / Prasidha / `rank_content` blend cosine vs viewer `profileEmbedding` when present; missing vectors → velocity/recency.
- Discovery (`intent_discover`) and `personal_match` retrieve from pools; ranking adds P5 model features + per-result `explain`. No LLM in scoring.
- Content: `rank_content` on `api/peepal-reactions`; Manch: `rank_manch_library` on `api/media-config` (GOTD fairness untouched). Client `requestContentRank` / `_serverScore` must not fight server order.
- Exploration ~18% (cold-start ~35%). Scheduler refreshes pools via `refreshCandidatePools`.
## 11f. Matchmaking quality (P7)

- People: safety filters **before** rank; Gale-Shapley + reciprocity boost; `matchRecentShown` cooldown ~72h; `not_interested` ~180d; diversity floor; personal vs professional separation.
- Dangal strangers: `dangal_match_step` / `_cancel` on `api/media-config` — Elo bands widen over wait, then honest **Practice AI**. Friend challenges unchanged.
- Outcomes → `match_outcomes` + `matchEngagementEvents`; weekly weights move only after ≥50 samples with ±0.15 clamp + rollback; metrics in `matchMetricSnapshots` (Admin-only).

## 11g. AI enrichment (P8)

- **6A:** Ranking/pairing read stored fields only — never `callAI` at request time. Enrichment is batch-only (`api/chaupaal-scheduler` → `runAiEnrichmentBatch`).
- **7A:** `server-lib/ai.js` registry — `anthropic` + `openai-compatible` (covers Grok / cheap OpenAI-shaped APIs). Swap via `AI_PROVIDER` + keys only.
- Embeddings: `server-lib/embeddings.js` (`EMBED_PROVIDER=gemini|openai-compatible`); independent of `AI_FEATURES_ENABLED`; `textHash` dedupe.
- Jobs: content topic labels (duniya/peepal), Akhbaar `category_cache` heuristic seed, profile derived interests (never overwrite declared chips), cold-start internal summary, profile embed sweep, **content embeddings** (`contentEmbedding` on public `duniya`/`peepal`; hash-idempotent; ≤6/collection/scheduler tick). Rank consume: `rankContentItems` cosine vs viewer `profileEmbedding` when both present; else velocity/recency.
- Cache: `topicLabel.contentHash` + `LABEL_VERSION`; budget: `chaupaalMeta/aiBudget` + `AI_DAILY_CALL_CAP` + `AI_JOBS_PAUSED`. Profile + content embeds **share the same daily cap** (bump per embed); mid-cap / soft duration stop holds cursors (partial progress kept). Skip when `AI_JOBS_PAUSED` or `embed_keys_missing`.
- Privacy: `redactForPrompt`; no journal/DM/search/contacts; personalization opt-out excluded; teens = heuristic-only profile enrich, no dating-intent inference; prohibited label blocklist.
- **Env matrix (Infra I3):** `.env.example` operator unpause block + `server-lib/ai-config.js` header. Keys: `AI_*`, `EMBED_*` / `GEMINI_API_KEY`, `CATEGORY_CRON_PAUSED`, `CHAUPAAL_RETRIEVAL_BACKEND`, `CRON_SECRET`. Crons staggered: category `0 2 * * *`, scheduler `0 15 * * *`. Scheduler passes `deadlineMs` into `runAiEnrichmentBatch`; response includes `aiEnrichment.ops` + `timing` (ops-only counts).
- **Category cron (Infra I0–I1 cron):** `vercel.json` schedules `/api/refresh-category-cache` daily `0 2 * * *` (~07:30 IST ±59m Hobby). Default **paused**. Unpause: `CATEGORY_CRON_PAUSED=false` + `AI_FEATURES_ENABLED=true` + `AI_JOBS_PAUSED` off + provider key + `CRON_SECRET` + Firebase SA. Pause / AI-off / budget → **200 no-op**; cron **bumps** `aiBudget` per generate; mid-run cap stops; partial field writes never wipe the other side; default limit = all jobs (scopes included). Client: cold → Offline (not live AI); paused path only serves `webGrounded` v2 docs. External residuals: sub-daily cron (Pro), maxDuration raise (inspect-only), paid ANN at scale, full legacy embed backfill.
- **People vector retrieval (Infra I1 vector):** `CHAUPAAL_RETRIEVAL_BACKEND=vector-index` → pool-prefilter cosine on `profileEmbedding` (see 11e). Default remains `firestore-shards`.
- **Content embeddings (Infra I2):** see 11e / jobs above — no longer permanently skipped.
- No user-facing AI dashboard (10B). Env matrix in `.env.example`.

## 11h. Disclosure & arc close (P9)

- Static sheet: `openLegalSheet('collects')` — “What Chaupaal collects”. Entry: Settings → Privacy & account (`#openCollectsDisclosureBtn`) + Privacy Policy link + personalization “What we collect”.
- Deep links: `openSettingsPrivacyFocus(controlId)` scrolls to existing toggles (no interests dashboard / per-signal editor — 10B).
- Claims must match code: hashed search only, opt-out stops collection, no sensitive inference, ranking has no request-time LLM, friends-only via `friend_projection`.
- Scheduler soft budget ~95s under Hobby `maxDuration` 120; response includes `timing.elapsedMs`.
- Privacy residual close: `npm run test:rules` (Firestore + RTDB emulator) + `npm run test:privacy` (projection checklist). Friends only / Private `users_public` writes that include gated PII are **denied by rules**, not only by client projection.

## 12. Globals & module surface

The client still loads classic non-module scripts (`<script src>`), so top-level `function` / `let` and many `window.X =` exports are intentional for cross-file calls.

**Do not** rewrite existing globals in bulk — that breaks games, chat, and `typeof foo === 'function'` guards.

**For new code:**
- Prefer an IIFE / block scope; export only what other files need.
- Attach new public APIs under `window.ChaupaalNS` (or an existing feature namespace like `AuthProfiles`, `UsersPublic`) instead of adding bare `window.foo`.
- Reuse existing entry points (`showToast`, `t`, `openLayer` / `pushNavLayer`, `safeFeature`) rather than inventing parallel globals.
- User-facing strings go through `t('key')` with keys in `i18n.js` (`en` / `hi` / `ta`).

## 13. Design tokens (UI polish)

Visual hierarchy tokens live in `public/src/styles/tokens.css` (`:root`). Application helpers in `gathered-light.css`. Full identity doc: [DESIGN.md](./DESIGN.md). **Prefer tokens over one-off hex/px.**

**Identity:** Gathered light — people under the same light. Free polish forever (never paywall cosmetics). Neutral daylight + Chaupaal red accent; Auto may warm golden/evening only.

| Token group | Examples | Use for |
|---|---|---|
| Brand | `--brand-red`, `--brand-on-red` | CTAs, mark, focus |
| Surfaces | `--surface-page`, `--surface-elevated`, `--surface-sunken` (`--cream` aliases page) | Page / cards / inputs |
| Ink | `--ink`, `--ink-secondary`, `--muted`, `--line` | Text + dividers |
| Light model | `--light-key-temp`, `--light-cast`, `--light-specular` | Gathered light / Auto wash |
| Type | `--text-sm`…`--text-2xl`, `--font-ui`, `--font-display` (stats only) | Labels vs body vs titles |
| Space | `--space-1`…`--space-8` | Padding/gaps |
| Radius | `--r-sm`…`--r-sheet`, `--corner-continuous` | Squircle controls/cards/sheets |
| Elevation | `--elev-1`…`--elev-3` (aliases `--shadow-*`) | Cards, sheets — not glass stacks |
| Motion | `--ease-spring`, `--duration-*` | **One** spring family app-wide |
| Presence | `--presence-online`, `--presence-mehfil`, `--presence-typing` | Soft occupancy cues |
| Actions / feed / call | `--btn-*`, `--feed-*`, `--call-*` | Hierarchy + Mehfil stage |
| Sensory theme | `--theme-light-temp`, `--theme-overlay`, `--theme-dim`, … | Written by `theme-engine.js` |

Chat polish lives mainly in `baithak.css`. Empty/loading/error: `ui-states.js` + `.cp-empty`. Mehfil: `mehfil.css`. Brand mark: `public/brand/chaupaal-mark-charpai-v2as.png` + `public/icon-charpai-v2as.png` (PWA sizes: `icon-192-charpai-v2as` / `icon-512-charpai-v2as` / `icon-maskable-512-charpai-v2as` / `apple-touch-icon-charpai-v2as`).

Do not invent a second palette per screen. If a new surface needs a value, add a token first.

## 14. Brand mark & Gathered light

- Use `.cp-mark` / `chaupaal-mark-charpai-v2as.png` for auth, sidebar, favicon chrome — no emoji/placeholder logos. (Splash uses `splash.png`, a separate full-bleed scene.)
- Primary buttons use press specular (`.btn--primary` / `.gl-press`) — press, not hover.
- Avatar stacking (`.avatar-stack`) only in Mehfil / group headers; elsewhere use `.presence-dot`.
- Honor `prefers-reduced-motion` and Quiet for decorative motion.
