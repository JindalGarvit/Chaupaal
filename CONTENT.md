# Chaupaal content rules



## Akhbaar reel (`daily_sets` / `SAMPLE_QUESTIONS`)



- **Do not** invent or attach article links unless you have verified they point to the same story as `headline` / `news` / `q`.

- Prefer **omitting** `link` entirely over a publisher homepage or loosely related URL.

- Category, headline, body, and quiz fields may stay as authored; only `link` requires a verified source.

- Client code strips `link` from existing Firestore `daily_sets` / `bonus_pool` docs on read so stale mismatched links never surface.



## Categories Khabar / Sawaal



- Stored in Firestore `category_cache/{cat}` with `cacheVersion: "v2"` and `webGrounded: true`.

- **Anthropic spend is currently PAUSED** until re-enabled:

  - Master: `AI_FEATURES_ENABLED` must be unset/false on Vercel **and** Firestore `feature_flags/ai_features.enabled` stays false (see below)

  - Granular: `CAT_LIVE_AI_PAUSED = true` in `public/src/js/features/categories.js` (no live Claude; serve cache indefinitely or "check back later")

  - Granular: `CATEGORY_CRON_PAUSED = true` in `api/refresh-category-cache.js` (endpoint returns 503)

  - Cron removed from `vercel.json` (re-add `"crons":[{"path":"/api/refresh-category-cache","schedule":"0 2 * * *"}]` when resuming)

- When unpaused: clients read cache; live Claude + web search only if missing/stale. Web search `max_uses` is **2**.

- Links must come from search results; never fabricate URLs.



### Env for cron (when re-enabled)



- `CRON_SECRET` — Vercel sends it as Bearer token

- `FIREBASE_SERVICE_ACCOUNT_JSON` — stringified service account (Admin write to Firestore)

- `ANTHROPIC_API_KEY` (or `Anthropic_API_key`)

- `AI_FEATURES_ENABLED=true` — master server kill-switch (required)



## AI features launch checklist



**Master kill-switch is OFF by default.** No live provider spend until both gates are opened.



### What flipping ON activates



Turning on the master switch enables every path that goes through `callAI` / `POST /api/ai`:



1. **Chaupaal AI assistant / AI keyboard** — Baithak "Ask AI", peepal/journal compose helpers (Sonnet / `tier:balanced`)

2. **Peepal AI search** — intent parse + conversation starters (Haiku / `tier:fast`); local INTENT_MAP still works when off

3. **Dangal AI matchmaking chat** — filter extraction from free text

4. **Peepal AI target audience** — "who should this reach?"

5. **Personality analysis** — evening check-in + Peepal typed answers

6. **i18n `translateContent`** — Claude translate (only if a non-English lang path calls it)

7. **Shadowban review helper** — `reviewShadowbans` ops tool in Duniya

8. **Categories Khabar/Sawaal live generate** — only if `CAT_LIVE_AI_PAUSED=false` as well

9. **Category cache cron** — only if `CATEGORY_CRON_PAUSED=false`, cron restored in `vercel.json`, and master ON



### How to turn AI on (when ready)



1. Confirm Anthropic billing/credits and set org spend caps / rate limits in the Anthropic console.

2. Vercel env: `AI_FEATURES_ENABLED=true`, `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=…`

   Optional: `AI_MODEL_FAST`, `AI_MODEL_BALANCED` to override tier→model mapping.

3. Firestore: set `feature_flags/ai_features` to `{ enabled: true, percent: 100, allowList: [], denyList: [], note: "…" }`

   (Seed shape is in `FEATURE_FLAG_SEEDS.ai_features`. Missing doc = client treats as OFF.)

4. Redeploy or wait for env to apply; hard-refresh clients (SW `chaupaal-v5+`).

5. Optionally unpause category paths: `CAT_LIVE_AI_PAUSED=false`, `CATEGORY_CRON_PAUSED=false`, restore cron.



### How to add a second AI provider later



1. Implement `server-lib/providers/<name>.js` exporting `{ id, complete(req), extractText(data) }` matching Anthropic provider's contract.

2. Register it in `PROVIDERS` inside `server-lib/ai.js`.

3. Set `AI_PROVIDER=<name>` in env.

4. Features keep calling `callAI({ tier, system, messages, … })` — no per-feature rewrites.

5. Client already posts a provider-agnostic body to `/api/ai`; no client provider file required unless you want local mock/offline.



### Architecture pointers



- Client: `public/src/js/ai/call-ai.js` → `callAI` / legacy `callAnthropic`

- Client flag: `public/src/js/ai/ai-config.js` + Firestore `ai_features`

- Server: `server-lib/ai.js` → provider; route `api/anthropic.js` (also `/api/ai` via vercel rewrite)

- Shared server helpers live in `server-lib/` (not under `api/`) so Hobby plan stays under the 12-function cap.

- Markdown: `public/src/js/ai/markdown.js` (`renderMarkdown`) — no npm dependency
