# Chaupaal conventions

Binding rules for navigation, overlays, media, and persistence. All new features and Cursor passes should follow this document.

Implementation lives primarily in:

- `public/src/js/core/nav-stack.js` — overlay history stack
- `public/src/js/core/overlay-scope.js` — scoped cleanup when parent views close
- `public/src/js/core/media-player.js` — shared seek/skip controls
- `public/src/js/features/music-card.js` — in-app music preview

---

## 1. Navigation & overlay contract

**Single entry point:** Every full-screen view, modal, sheet, or dismissible overlay must register through `pushNavLayer()` / the nav-stack observer — not ad-hoc `history.pushState` / `replaceState`.

**Exceptions (deep routes only):** `deeplinks.js` may push `{ chaupaalDeep: true }` when opening shareable routes (`/chat/…`, `/profile/…`, `/post/…`). Closing a deep route must use `history.back()`, never `pushState('/', …)`.

**One layer = one history entry:** Each real overlay gets exactly one `{ chaupaalLayer: true }` push. Overlays that call `pushNavLayer` manually must set `data-nav-managed="1"` so the MutationObserver does not double-register.

**Dismissal:** Tap-outside and system/gesture back must close exactly one layer via `removeNavLayer` / `popstate`. Parent views (e.g. chat) use `beginOverlayScope` / `endOverlayScope` so nested overlays clean up when the parent closes.

**Recovery:** If the stack and visible UI diverge, call `recoverNavStack()` — do not leave the user with a dead back button.

**Non-layers:** DOM injected for media controls, progress bars, or other inline UI must use `data-nav-ignore="1"` and must never match overlay selectors.

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

- [ ] Overlay registered via nav-stack (`pushNavLayer` + `data-nav-managed` if manual)
- [ ] No direct `history.*` except deeplink routes
- [ ] Media does not touch history; listeners cleaned up on dismiss
- [ ] Firestore payload includes all fields needed to re-render after reload
- [ ] Tap-outside and back dismiss work without custom one-offs
- [ ] Closing the feature clears keyboard inset / never leaves `html.kb-open` stuck
- [ ] Failures call `reportClientError` (or are caught by `safeFeature`) and recover the shell

---

## 4b. Runtime resilience & daily error summary

- `public/src/js/core/runtime-guard.js` owns shell recovery (`clearShellGlitches`), scoped recovery chip (`showRecoveryChip`), and client error reporting.
- Prefer `safeFeature(name, fn)` for risky entrypoints. On failure: report → clear keyboard/nav glitches → recovery chip → optional `recoverNavStack`.
- Global `window.onerror` / `unhandledrejection` always **console.error** and may show a small “tap to continue” chip — never a full-page takeover that hides the real error.
- Client errors: session write-cap + client dedup → `clientErrorCounters/{day_hash}` (increment) and occasional `clientErrorReports` samples. No chat/user PII fields.
- Admin glance view: `/admin/client-errors.html` via `GET /api/admin-feedback?view=errors` (admin claim).
- Surfaces tagged as `pwa` | `mobile_web` | `desktop`; screens coarse (`chat`, `peepal`, …).

---

## 4c. Defensive coding for integrations & dynamic lists

Any code that touches an **external integration** or renders a **long/dynamic list** must degrade gracefully. An uncaught exception there must **never** escape into the shared overlay / nav-stack system.

**Integrations in scope:** JioSaavn / iTunes (music), Agora (Mehfil), YouTube embeds, weather / events APIs, AI (`callAI` / media-config actions), maps/geocoding, and similar third-party fetches.

**Dynamic lists in scope:** Peepal options, chat message history, search results, story carousels, infinite feeds — anything whose length or item shape comes from the network or user content.

**Required pattern:**

1. **Catch at the feature boundary** — `try/catch` (and `.catch` on promises) around the integration call and around the HTML/DOM render for that feature. Prefer `safeFeature('name', fn)` for entrypoints.
2. **Scoped empty/error UI** — on failure show an inline empty or error state *inside that feature* (`showFeatureError(host)`, “No results”, “Preview unavailable”). Do not blank the whole shell.
3. **Never throw through dismiss / nav** — dismiss callbacks, `onSelect` handlers, and overlay close paths must swallow/report errors. Nav-stack / overlay-scope isolate dismiss with `safeDismissLayer` / per-overlay try/catch; do not rely on that alone — still wrap your own feature code.
4. **Sanitize / normalize list items** — escape text before `innerHTML`; pad/align parallel arrays (e.g. options vs response counts); avoid `Math.max(...hugeArray)` and other spread-of-unbounded-arrays.
5. **Report, don’t hide** — call `reportClientError({ feature, message, stack })` (or let `safeFeature` do it). Recovery UI is a safety net for users; logs/Firestore counters are for you.

Point future Cursor sessions at this section before adding a new provider, picker, or feed renderer.

---

## 5. Payments contract

All paid features must go through `server-lib/payments.js` and write to `chaupaalTransactions` with a `purpose` tag (`boost_post`, `premium_subscription`, `companion_gift`, …). Do not invent per-feature payment ledgers. Gate live charging with `PAYMENTS_ENABLED` (default off). Never simulate a successful charge while the kill switch is off.

## 6. Product philosophy (limits & attention)

Internal decision guide: [PHILOSOPHY.md](./PHILOSOPHY.md) — *attention is the scarce resource, not access*. Check new limits/features against it before shipping. Never surface that doc to users.

Policy numbers live in `public/src/js/config/policy-limits.js` (anon posts, AI Discovery messaging).

## 7. Auth & identity

See `.cursor/rules/auth-identity.mdc`.

- One Firebase Auth user (email **or** phone, verified) → many profiles, no hard create cap; switcher uses `activeProfileId`.
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

## 10. Firebase App Check (scaffold — enforcement off until key set)

App Check is **scaffolded but not enforced** until you add a reCAPTCHA v3 site key.

1. Firebase Console → **App Check** → register the web app → **reCAPTCHA v3** provider → copy the **site key**.
2. Set Vercel (or local) env: `RECAPTCHA_SITE_KEY=<site key>` (and optionally expose to client as `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` / inject `window.CHAUPAAL_RECAPTCHA_SITE_KEY` at build — see `public/src/js/config/app-check.js`).
3. In Firebase Console → App Check → **APIs** → turn enforcement **on** for Firestore, Storage, and Realtime Database only after the client is shipping with the key and you have verified tokens in debug mode.
4. Until the env key is non-empty, the client **must not** initialize App Check (avoids locking everyone out). Rules do not require `request.app` checks yet for the same reason.

## 11. Public vs private user profiles

- Full `users/{uid}` — **owner read/write** (plus Admin SDK). Contains email, phone, DOB, prefs, etc.
- `users_public/{uid}` — what other signed-in clients may read. Owner syncs via `UsersPublic.syncPublicProfile` on profile save / login.
- Cross-user UI must use `users_public` (or denormalized blobs / server projections), never the private user doc.