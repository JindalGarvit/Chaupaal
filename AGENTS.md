# Chaupaal

Chaupaal is a news + social-discovery PWA. See `CONTENT.md` for content rules and `.env.example` for the full env var list.

## Architecture

- **Frontend** — a static, no-build vanilla-JS PWA in `public/`. `public/index.html` loads Firebase compat SDKs from CDN and every module in `public/src/js/**` via plain `<script>` tags (order matters; see the bottom of `index.html`). It talks directly to the live Firebase project `chaupaal-chaupaal` using the public config embedded in `public/src/js/config/firebase.js`.
- **API** — Vercel serverless functions in `api/` (Node, CommonJS), with shared helpers in `api/lib/`. These back rate limiting, session revocation, Anthropic calls, and category-cache refresh.
- **Routing/deploy** — `vercel.json` defines SPA rewrites (deep links like `/profile/*`, `/post/*`, `/chat/*` fall back to `index.html`) and function config.

## Cursor Cloud specific instructions

- **No build step and no automated test suite.** Do not look for `npm test`/bundler output — there is none.
- **Lint** is a heuristic script only: `node scripts/scan-undefined.js` (scans `public/src/js` for undefined-identifier / load-order bugs; exits 0 with no findings).
- **Run the frontend** with a static SPA server from the repo root, e.g. `npx serve public -s -l 3000`, then open `http://localhost:3000/`. The `-s` (single-page) flag is needed so the `vercel.json` deep-link rewrites are emulated. The app boots to a splash → hero/auth screen; use **"Explore as guest →"** to reach the main app without an account. Even with no Firestore content, the daily **Akhbaar** news quiz renders from the `SAMPLE_QUESTIONS` fallback in `public/src/js/data/samples.js`.
- **`vercel dev` is not usable here** — it requires interactive Vercel login / project linking, which isn't available in the cloud VM. The static server above is the practical dev setup; the `/api/*` functions won't run under it, but the client is written to degrade gracefully (e.g. rate-limit checks fail open), so core Firebase-backed flows still work.
- **To exercise the `api/` functions locally** you need the secrets in `.env.example` (`FIREBASE_SERVICE_ACCOUNT_JSON`, `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, `ANTHROPIC_API_KEY`, `CRON_SECRET`). They are not required just to run and browse the frontend.
- Anthropic/category-cache cron is intentionally **paused** in code — see `CONTENT.md` before touching `categories.js` / `refresh-category-cache.js`.
