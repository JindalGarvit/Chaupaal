# Language pass checklist (L10 Hindi → template for L11–L24)

One dedicated pass per language. Ship only when every box is ticked or a gap is named in the summary.

## 0. Prepare
- [ ] Read the language notes in the arc prompt: script, digits, plural categories (`new Intl.PluralRules(code).resolvedOptions()`), register (formal/informal "you"), gender strategy, TTS voice, fonts.
- [ ] Add a `"<code>"` section to `public/src/i18n/glossary.json`: `_style` (register, punctuation, digits, gender rule) + the term list (friend, post, chat, chips, game names, chess/cards/cricket terms…). Brands (`brands`) are never translated — messages carry `{{@id}}` tokens.
- [ ] Existing pack entries from before L0 are untrusted: retranslate everything, don't keep old strings.

## 1. UI keys (100%)
- [ ] Chunk `en.js` with context notes (`contextFor` from `scripts/i18n-coverage.js`, ~300 keys / 16k chars a chunk) and give every translator the same brief + term list.
- [ ] Per chunk, validate: every key present, `{{params}}` + `{{@brand}}` tokens identical, HTML tags identical, ICU `plural/select` blocks kept with the language's categories, braces balanced, no brand spelled out, no English left (except symbols / codes / notation).
- [ ] Merge to `public/src/i18n/<code>.json` (sorted, 2-space JSON). `node scripts/i18n-check.js` clean.
- [ ] `node scripts/i18n-coverage.js --lang <code> --out <file>.md` → 100%, 0 placeholder mismatches, 0 plural gaps, 0 glossary violations.

## 2. Self-review
- [ ] Back-translate a random 5% sample (≥150 keys, every namespace) to English; compare meaning; fix drift.
- [ ] Consistency: the same English term → the same target term across the app (exact-match labels such as Cancel / Save / Share follow the term list; `test-global-l10-hi.js` checks a set).
- [ ] Register + gender: no mixed formal/informal; gender-neutral constructions where the user's gender is unknown.
- [ ] Legal (legal.*, privacy.*, moderation.*): meaning exact, plain language, the "Draft — requires legal review" banner translated and kept.

## 3. Dangal content (per `public/src/js/dangal/content-locales.js`)
- [ ] TRANSLATE overlays in `public/src/js/data/locales/<code>/`: Imposter (+ Undercover partners — adapted so pairs stay "similar but different"), Charades titles, Most Likely To / Would You Rather / Never Have I Ever, Raja Mantri Chor Sipahi. Every core pack 100%; register the files in the manifest `files`.
- [ ] Keyed sets reach `KEY_COVERAGE`: rules, FAQ (≥5/game), tips, Werewolf, cricket commentary, umpire, Tambola caller, Oh No! shouts, chess openings, coach.
- [ ] Scribble: `server-lib/scribble-words.<code>.js` (≥600 drawable core words, entries `"word|roman|alt"`), add to `LOCALE_FILES` in `server-lib/scribble-words.js` and `serverLangs` in the manifest.
- [ ] Quiz: translate the ≥500 core subset (`QuizLocales.coreSubset()`, options in the same order, facts verified) → `server-lib/data/quiz-locales/<code>.json`, add to `REGISTRY` in `server-lib/quiz-locales.js`.
- [ ] Language-specific sets (lexicons, regional add-on packs): verify or mark "not yet" in the manifest — never silently show English.

## 4. Search
- [ ] Every `kw([...en], { <code>: [...] })` intent in `core/chaupaal-intents-manifest.js` (incl. all 25 games and surfaces) has native-script keywords + the romanised spellings people type (Hinglish, Romanised Urdu, Arabizi, romaji…).
- [ ] Native-script queries match (normalisation: nukta / diacritics / width variants).

## 5. Store + web
- [ ] `store/listings/<code>/listing.json` translated (`translated: true`), `node scripts/store-validate.js` clean (keywords are limited in bytes — non-Latin scripts take 2–3 bytes a character).
- [ ] `node scripts/build-store-assets.js` → `public/manifests/manifest.<code>.json` localised (from `common.app_*` keys).
- [ ] OG / meta for public pages (`server-lib/og-preview.js`, `common.og_*`) render in the language.
- [ ] Store screenshots in the language (light + dark) via the L9 screenshot script.

## 6. Server + notifications
- [ ] `serverT(<code>, …)` renders push, Akhbaar / companion cards, system events and statements of reasons (`server-lib/i18n-server.js` loads the pack — add a loader line for a new pack file).
- [ ] Firebase Auth emails / SMS / reCAPTCHA follow `auth.languageCode` (built-in templates only — see CONVENTIONS "Firebase Auth localisation").

## 7. Layout + functional sweep (360 px phone + tablet; light + dark)
- [ ] Every surface: no clipping / overflow, sensible wrapping, buttons readable, line-height OK for the script (conjuncts / diacritics / tall glyphs), RTL mirroring where relevant.
- [ ] Journeys in the language: signup / login (OTP + verify banner), onboarding, profile edit, Baithak chat + system events, Mehfil, Duniya post + story, Akhbaar, Peepal, Khoj (native script + romanised), Settings (privacy / export / delete), report / appeal, Premium, Dangal (Manch, a Live game, a Party Hub night with localised content + TTS).
- [ ] Mixed-language room: one English + one target-language user — each sees their own UI; the room content language works.
- [ ] Real devices: Android (Chrome) + iPhone (Safari). Name anything not verified on hardware.

## RTL languages (ur, ar — L11 / L16)
- [ ] `LANG_CATALOG` entry has `dir: 'rtl'`; `<html dir="rtl" lang>` set on switch; the PWA manifest gets `dir: "rtl"`.
- [ ] Brand names and every `{{param}}` render inside first-strong isolates (U+2068 … U+2069) — done in `i18nFormat`
  for RTL locales; params named `*url|href|link|src|path|code|key|id` stay raw. Names / handles in markup use
  `.cp-bidi` / `unicode-bidi: isolate`; user text uses `dir="auto"` + `unicode-bidi: plaintext`.
- [ ] Shared CSS uses logical properties (`margin-inline-*`, `inset-inline-*`, `text-align: start`). Physical
  `left/right` only for geometry (board coordinates, centring `left:50%` + `translate:-50% 0`, animations).
- [ ] Directional icons come from `iconHtml()` (auto `.cp-flip-rtl`); never hand-flip media, logos, clocks.
- [ ] Gestures read `isRtl()`: tab / section swipes, swipe pager, Duniya stories (forward = toward line start).
- [ ] Boards, canvases, card hands stay `direction: ltr` (i18n.css list) — add new game surfaces there.
- [ ] Script fonts: tall scripts (Nastaliq) may need a compact fallback (Naskh) for tabs / chips / badges / HUDs;
  document which surfaces use which.
- [ ] Digits: default by Region via `NATIVE_DIGIT_REGIONS` in `core/i18n-format.js`; the Settings toggle stores only
  departures from that default.
- [ ] Sweep in the real language (not only ar-XB): tab order mirrored, sheets / drawers from the correct side, chat
  bubbles own vs others, progress bars, sliders, carousels, toasts, badges, mixed Latin text.

## Long-text languages (ta, te, ml, de … — L13+)
- [ ] Brief translators with a length budget (≤ 1.6× English on short UI strings) and imperative verb stems.
- [ ] Length audit: list keys > 1.6× English; render them at 360 px (tabs, buttons, chips, HUDs, settings rows,
  notification titles); fix at component level (wrap / ellipsis + long-press full text, L1 patterns), never by
  shrinking fonts below accessible sizes.

## 8. Tests + ship
- [ ] Copy `scripts/test-global-l10-hi.js` → `test-global-l1x-<code>.js` (set `LANG`, script range, term samples), add to `npm test`.
- [ ] All suites green; `api/*.js` = 12; `node scripts/bust-assets.js`; `node scripts/i18n-lint.js --write-baseline`.
- [ ] Summary: coverage stats, term decisions, back-translation findings, layout fixes, content counts, English source issues (fixed in en too), judgement calls, anything for a later prompt.
