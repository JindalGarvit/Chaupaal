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

**Infra I0 (category cache cron):** Hobby-safe daily cron `/api/refresh-category-cache` `0 2 * * *` in `vercel.json` (alongside scheduler). Pause/AI-off/budget → 200 no-op; partial failures keep prior caches; cold client Offline empty. Next: I1 dogfood + soak. Residuals: vector index, content embeddings.

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

- Interfaces: `retrieveCandidates` / `rankCandidates` / `rankContentItems` in `server-lib/retrieve-rank.js`. Backend default `firestore-shards` (`candidatePools/*`); `CHAUPAAL_RETRIEVAL_BACKEND=vector-index` is a stub for later.
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
- Jobs: content topic labels (duniya/peepal), Akhbaar `category_cache` heuristic seed, profile derived interests (never overwrite declared chips), cold-start internal summary, profile embed sweep. **Content embeddings skipped** (P6 does not consume them).
- Cache: `topicLabel.contentHash` + `LABEL_VERSION`; budget: `chaupaalMeta/aiBudget` + `AI_DAILY_CALL_CAP` + `AI_JOBS_PAUSED`.
- Privacy: `redactForPrompt`; no journal/DM/search/contacts; personalization opt-out excluded; teens = heuristic-only profile enrich, no dating-intent inference; prohibited label blocklist.
- **Category cron (Infra I0):** `vercel.json` schedules `/api/refresh-category-cache` daily `0 2 * * *` (~07:30 IST ±59m Hobby). Default **paused** (`CATEGORY_CRON_PAUSED` unset → paused). Unpause: `CATEGORY_CRON_PAUSED=false` + `AI_FEATURES_ENABLED=true` + provider key + `CRON_SECRET` + Firebase SA. Pause / AI-off / `AI_DAILY_CALL_CAP` → **200 no-op** (no LLM spend; prior `category_cache` docs kept). Partial job errors continue; mid-run budget stops cleanly. Client cold cache → Offline empty (not fake live AI). Residuals: vector index, content embeddings (P8 skipped). Env matrix in `.env.example`.
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
