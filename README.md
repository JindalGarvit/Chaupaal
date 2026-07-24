# Chaupaal

Progressive web app for Baithak chat, Stories, Peepal, Duniya, and games.

**Developer conventions:** see [CONVENTIONS.md](./CONVENTIONS.md) for binding rules on navigation, overlays, media playback, and Firestore persistence.

**Internal product philosophy:** [PHILOSOPHY.md](./PHILOSOPHY.md) (attention scarcity / limits — not user-facing).

### Firebase App Check

Enforcement is **ON** for Firestore / RTDB (and Storage if enabled in Console).

1. Web app uses reCAPTCHA v3 via `public/src/js/config/app-check.js` (site key in `index.html` meta `chaupaal-recaptcha-site-key`).
2. Tokens auto-refresh; SDK must load before any Firestore/RTDB use.
3. If App Check fails to activate, data calls will be denied — check the browser console for `[app-check]`.
4. Admin / non-browser tools need debug tokens registered in App Check → Manage debug tokens.

### Cache busting

After changing CSS/JS under `public/`, run:

```bash
npm run bust
```

This fingerprints `?v=` query strings in `public/index.html` from file contents and bumps the service worker cache name in `public/sw.js`. No bundler — multi-script load stays as-is.

### i18n

Shell copy uses `t()` / `data-i18n*` markers. Full chrome dicts ship for `en`, `hi`, and `ta`; other language codes fall back to English. Preference is stored in `localStorage` (`chaupaal_lang`) and on the user doc (`lang`).
