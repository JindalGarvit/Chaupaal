# Chaupaal English style guide (source copy + translator brief)

`en.js` is the single source every language is translated from. Write it so a translator can carry the
meaning without guessing, and so a first-time user anywhere in the world understands it on first read.
Term decisions live in `glossary.json` (`brands` = never translated, `terms` = one meaning per term,
one section per language). Process: `LANGUAGE_PASS_CHECKLIST.md`. Mechanics: CONVENTIONS §9b–9c.

## 1. Voice

- **Friendly, plain, short.** Talk like a helpful friend, not a system. "Couldn’t send. Try again." — not
  "An error occurred while processing your request."
- **Second person.** Address the user as "you". Use "we" sparingly, for Chaupaal as a company ("We’ll email you").
- **Verbs for actions.** Buttons and menu items start with a verb that says what happens: *Save*, *Send*,
  *Invite friends*, *Start game*. Not *OK* when a specific verb exists; never *Submit* / *Click here*.
- **Outcome first.** Lead with what the user gets or must do; reasons after: "Add a photo so friends recognize you."
- **Calm about limits.** State a limit and the next step once: "You’ve used today’s 5 AI replies — more tomorrow."
  No guilt, no fake urgency, no shouting (no ALL CAPS, at most one "!" per message).
- **One clear message + one next step for errors.** Never show raw server / Firebase text in copy.

## 2. Inclusive and global

- **Gender-neutral.** Use "they" for a person whose gender is unknown; write "Ask them", "{{name}} joined" —
  never "he/she", "his or her", "guys". Prefer constructions that don’t force a gendered verb in other
  languages ("{{name}} sent a photo" is easier than "{{name}} is excited").
- **Global by default** (`.cursor/rules/global-first.mdc`). Default copy, examples and placeholders must
  make sense in any country:
  - no India-only (or any one-country) references in default copy — festivals, foods, cities, slang,
    currencies (₹, lakh, crore), exam names, TV shows, sports leagues;
  - example names are neutral and short: **Alex, Sam, Maya, Lee, Noor, Ana, Kai**; example cities
    are a world mix ("e.g. Toronto, Lagos, Mumbai") or "your city";
  - regional flavour (chai, cricket, Bollywood, Thanksgiving, Lebaran…) only in **regional** sets chosen
    by the user’s Region (`getRegionPrefs().contentRegion`) — never by UI language;
  - money, dates, numbers and units never appear as literals: pass them as `{{params}}` formatted by
    `core/i18n-format.js` (`formatCurrency`, `formatDate`, `formatNumber`, `formatDistance` …).
- **No untranslatable idioms or slang.** Avoid "hits different", "no cap", "touch grass", "spill the tea",
  "ballpark", "knock it out of the park". Say the plain meaning.
- **No Hinglish or other mixed-language strings in English.** Hindi/Urdu words belong in the hi/ur packs.
  Exceptions: brand names (`{{@…}}`) and genuine origin names kept by the glossary (Raja Mantri Chor Sipahi,
  Teen Patti, Carrom, Kabaddi, Tambola…).
- **Accessible.** Don’t rely on color, direction ("tap the red button", "swipe right") or emoji alone to
  carry meaning; emoji are decoration, at most one at the start or end.

## 3. Spelling, grammar and punctuation (US English)

- **US spelling** — color, favorite, center, organize, recognize, canceled, traveled, defense, license
  (noun and verb), practice (noun and verb), gray, program, math, mom.
- **Sentence case** for everything — titles, buttons, tabs, menu items: "Invite friends", not "Invite Friends".
  Proper nouns and brands keep their capitals.
- **Curly punctuation:** ’ for apostrophes, “ ” for quotes, … for ellipsis, — (em dash, spaced) for asides,
  – (en dash) for ranges ("2–8 players"). Placeholders end with … only when they invite typing.
- **No period** on buttons, tabs, labels, titles or single-phrase toasts; **use periods** in full-sentence
  descriptions and multi-sentence messages.
- **Numbers:** digits for counts and times ("3 friends", "5 min"); never hard-code thousands separators.
- **Contractions are fine** (you’re, can’t, don’t) — they read friendlier and translate cleanly.
- **Abbreviations:** keep AI, OTP, PIN, URL, GIF, DM, QR, PDF; spell out everything else on first use.

## 4. Terminology (one term per concept — full list in glossary.json `terms`)

| Use | Not | Notes |
|---|---|---|
| sign in / sign out / sign up | log in, log out, login (verb), register | "sign-in" as a noun ("password sign-in") |
| friend(s) | connection(s), buddy | "connection" = network connection only |
| follower(s) | fans, subscribers | Professional profiles have followers |
| post (noun + verb) | share (as a noun), upload (as a noun) | "share" = send something to someone / another app |
| chat, message | DM (in body copy), PM | "DM" only in tight UI where space forces it |
| chips | coins, money, cash, credits | virtual game chips — never money |
| code (verification) | OTP in body copy | "OTP" allowed on the button that sends it |
| delete | remove | when the thing is gone for good; "remove" = take off a list, keep the thing |

## 5. Placeholders, plurals and select

- **Placeholders** are `{{name}}` with a descriptive name (`{{count}}`, `{{friend}}`, `{{game}}`,
  `{{date}}`). Never build sentences by concatenation (`t('a') + name + t('b')`); one key = one full sentence.
- Put placeholders where the sentence can be reordered: "{{name}} invited you to {{game}}" lets a translator
  move both. Don’t make a placeholder the subject of a gendered verb when you can avoid it.
- **Brands** are `{{@id}}` tokens (`{{@chaupaal}}`, `{{@dangal}}` …) — never type a brand name in copy.
- **Plurals** use ICU: `{count, plural, one {# friend} other {# friends}}` — always include `other`, and use
  `#` for the number. Never `n === 1 ? '' : 's'`. Translators add the categories their language needs
  (`zero`, `two`, `few`, `many`).
- **Select** for viewer-relative or gendered variants: `{who, select, actor {You joined} other {{{name}} joined}}`.
  Always include `other`.
- HTML: only `<strong> <b> <em> <i> <br>` via `tHtml`. Keep markup out of copy otherwise.

## 6. Length

English is the shortest common case; most languages run 20–60 % longer (German, Tamil, Malayalam more).

| Surface | English budget | Notes |
|---|---|---|
| Tab / bottom-nav label | ≤ 10 characters, 1 word | brand or one plain noun |
| Button | ≤ 20 characters, 1–3 words | verb first |
| Chip / badge / HUD | ≤ 14 characters | |
| Settings row title | ≤ 32 characters | detail goes in the description line |
| Toast | ≤ 60 characters, one line | |
| Push title / body | ≤ 40 / ≤ 110 characters | |
| Empty state | title ≤ 40, body ≤ 120 characters | + one action |

Translators: aim for ≤ 1.6× the English length on short UI strings; if impossible, shorten meaning-first
and note it — layouts wrap or ellipsize (long-press shows the full text), but never shrink the font.

## 7. Writing context for translators

Every key needs a context note (`scripts/i18n-coverage.js` → `contextFor`; prefix notes and placeholder
notes in `scripts/i18n-context.json`). When you add a namespace, add its prefix note; when you add a new
placeholder name, add its note. Say what the string is (button / title / toast), where it appears, and
what each `{{param}}` holds.

## 8. Checklist for a new string

1. Is it in the right namespace (`settings.`, `dangal.`, `games.<id>.` …) with a readable key?
2. Plain, short, second person, verb-first if it’s an action, sentence case, US spelling?
3. Global: no one-country references, idioms, slang or literals for money/dates/numbers?
4. Terms match the glossary (sign in, friend, post, chips …)?
5. Full sentence with `{{params}}` / ICU plural / select — no concatenation?
6. Fits the length budget for its surface?
7. Context note exists; `node scripts/i18n-lint.js` = 0; `node scripts/i18n-check.js` clean.
