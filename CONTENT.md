# Chaupaal content rules

## Akhbaar reel (`daily_sets` / `SAMPLE_QUESTIONS`)

- **Do not** invent or attach article links unless you have verified they point to the same story as `headline` / `news` / `q`.
- Prefer **omitting** `link` entirely over a publisher homepage or loosely related URL.
- Category, headline, body, and quiz fields may stay as authored; only `link` requires a verified source.
- Client code strips `link` from existing Firestore `daily_sets` / `bonus_pool` docs on read so stale mismatched links never surface.

## Categories Khabar / Sawaal

- Stored in Firestore `category_cache/{cat}` with `cacheVersion: "v2"` and `webGrounded: true`.
- **Anthropic spend is currently PAUSED** until re-enabled:
  - `CAT_LIVE_AI_PAUSED = true` in `public/src/js/features/categories.js` (no live Claude; serve cache indefinitely or "check back later")
  - `CATEGORY_CRON_PAUSED = true` in `api/refresh-category-cache.js` (endpoint returns 503)
  - Cron removed from `vercel.json` (re-add `"crons":[{"path":"/api/refresh-category-cache","schedule":"0 2 * * *"}]` when resuming)
- When unpaused: clients read cache; live Claude + web search only if missing/stale. Web search `max_uses` is **2**.
- Links must come from search results; never fabricate URLs.

### Env for cron (when re-enabled)

- `CRON_SECRET` — Vercel sends it as Bearer token
- `FIREBASE_SERVICE_ACCOUNT_JSON` — stringified service account (Admin write to Firestore)
- `ANTHROPIC_API_KEY` (or `Anthropic_API_key`)
