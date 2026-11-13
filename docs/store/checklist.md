# Store + web readiness checklist — DRAFT

| Item | Status | Where |
|---|---|---|
| Listing sources, 16 languages (English until the language passes) | ✅ | `store/listings/{lang}/listing.json` · `node scripts/build-store-assets.js` |
| Listing length validation (Apple + Google limits) | ✅ | `node scripts/store-validate.js` |
| Screenshots per language × light/dark × device | ✅ script (pseudo-locales now) | `node scripts/store-screenshots.js --dry-run` / `--base <url>` (Playwright) |
| Age rating answers | ✅ draft | `docs/store/age-rating.md` |
| Apple privacy label + Google Data safety | ✅ generated | `docs/store/privacy-labels.v1.{json,md}` · `node scripts/gen-privacy-labels.js` |
| In-app account deletion (Apple 5.1.1(v)) | ✅ L8 | Settings → Privacy & data → Delete my account |
| Web account deletion URL (Google Play) | ✅ | `/delete-account` (sign-in required) |
| Localised PWA manifest | ✅ | `public/manifests/manifest.{lang}.json` + `core/web-locale.js` |
| hreflang + localised OG / share cards | ✅ | `server-lib/og-preview.js` (`?lang=` / Accept-Language) |
| Region display prices | ✅ display only | `public/src/js/data/region-prices.js`; store price via `window.ChaupaalStore.localizedPrice` |
| Privacy policy URL, support URL, contact | ⏳ placeholders | in-app Contact page; fill legal details |

## Payment paths needing store IAP compliance (flag)

- **Premium (Pradhan / Sarpanch) and Chaupaal Money top-ups** are paid today through **Razorpay web checkout** (`chaupaal_money_topup_*`, `subscription_purchase`). In an iOS build these are digital goods → **must use Apple In-App Purchase** (App Store Review Guideline 3.1.1); in a Google Play build → **Google Play Billing** (Payments policy), except where user-choice / alternative billing programmes apply (e.g. India, EU DMA, South Korea). The store wrapper must route purchases through the store and hide Razorpay; `ChaupaalStore.localizedPrice` is the display hook.
- **Virtual chips stay non-purchasable** (L3 / H3 / P8) — keep it that way in every build (also required for the age rating).
- Tips / gifting to creators (if added later) are also IAP-scoped.
