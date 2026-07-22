# Chaupaal

Progressive web app for Baithak chat, Stories, Peepal, Duniya, and games.

**Developer conventions:** see [CONVENTIONS.md](./CONVENTIONS.md) for binding rules on navigation, overlays, media playback, and Firestore persistence.

**Internal product philosophy:** [PHILOSOPHY.md](./PHILOSOPHY.md) (attention scarcity / limits — not user-facing).

### Firebase App Check (blocked on your reCAPTCHA key)

1. Firebase Console → **App Check** → your web app → **reCAPTCHA v3** → create/copy **site key**.
2. Set env `RECAPTCHA_SITE_KEY` (and ensure the client can read it as `window.CHAUPAAL_RECAPTCHA_SITE_KEY` — e.g. inject in `index.html` or your deploy pipeline).
3. Deploy the client with `public/src/js/config/app-check.js` loaded.
4. Only then enable **enforcement** in App Check → APIs for Firestore / Storage / RTDB.
5. Until the key is set, App Check stays inactive so users are not locked out.
