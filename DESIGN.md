# Design — Gathered light

Chaupaal’s visual/interaction identity. **Free for everyone** — never paywall cosmetics, themes, or polish. Plus/paid only for real infra (AI quotas, voice/video minutes, storage).

## Signature

**Gathered light** — people under the same light. One virtual key light informs elevation, press specular, and Auto time/weather shifts.

### Hard acceptance tests

1. **Social heat** — presence, replies, Mehfil “someone’s here,” communal moments stay alive.
2. **Clarity** — light/depth never hurt feed/chat readability or contrast.

### Locked choices

| Choice | Rule |
|--------|------|
| Daylight | Mostly **neutral**; warmth only via Auto golden/evening — no permanent cream/parchment cast |
| Accent | **Chaupaal red** only as primary CTA / mark / focus |
| Element tabs | Colorful & spirited under Gathered light; chrome stays neutrals + red |
| Presence | Soft occupancy dots by default; avatar stacking only in Mehfil / group headers |
| Motion | One spring family; Quiet + `prefers-reduced-motion` calm decorative motion |
| Global | Not India-default identity; heritage informs warmth of “commons,” not festival-core |

### Do / Don’t

**Do:** Gathered light, neutral day, red accent, social presence, clarity, free polish, one spring, squircle, theme-engine weather/time as light shifts.  
**Don’t:** Cream UI costume, glassmorphism stack, paywall cosmetics, India-default visual system, animated avatar frames, festival-core identity, five elemental brands fighting the shell, motion spam.

---

## Token table

Defined in `public/src/styles/tokens.css`. Apply via tokens — not one-off magic numbers.

### Color

| Token | Light value | Role |
|-------|-------------|------|
| `--brand-red` | `#E63946` | Primary accent / mark |
| `--brand-red-deep` | `#C72E3A` | Pressed / gradient end |
| `--brand-on-red` | `#FFFFFF` | Text on red |
| `--surface-page` | `#F5F5F5` | App page |
| `--surface-elevated` | `#FFFFFF` | Cards, sheets |
| `--surface-sunken` | `#EEEEEE` | Inputs, secondary |
| `--ink` | `#1C1B1F` | Primary text |
| `--ink-secondary` | `#3C4043` | Secondary text |
| `--muted` | `#5F6368` | Hints |
| `--line` | `#E0E0E0` | Dividers |
| `--presence-online` | `#33C481` | Active |
| `--presence-mehfil` | brand red | In room |
| `--presence-typing` | gold | Typing |

Dark/Night remap the same roles (see `theme-preset-dark` / `theme-night` in tokens).

### Light model

| Token | Meaning |
|-------|---------|
| `--light-key-temp` | 0 cool → 1 warm (Auto writes) |
| `--light-key-elev` | Elevation brightness |
| `--light-specular` | Press specular highlight |
| `--light-cast` | Soft warm wash (golden/evening only) |

### Elevation

| Token | Use |
|-------|-----|
| `--elev-1` / `--shadow-sm` | Cards, list rows |
| `--elev-2` / `--shadow-md` | Floating chrome, FABs |
| `--elev-3` / `--shadow-lg` | Sheets, modals |

### Shape

`--r-xs` 6 → `--r-sm` 10 → `--r-control` 14 → `--r-md` 16 → `--r-card` 20 → `--r-sheet` 28 → `--r-xl` 32 · `--corner-continuous: superellipse(1.05)` with `border-radius` fallback.

### Type

| Token | Size / face |
|-------|-------------|
| `--text-xs`…`--text-4xl` | 10 → 38px modular |
| `--font-ui` / `--font-body` | Inter + system |
| `--font-display` | Space Grotesk — **stats/milestones only** |

Even quality across en/hi/ta — no script treated as “more premium.”

### Motion

| Token | Value |
|-------|-------|
| `--ease-spring` | `cubic-bezier(0.34, 1.4, 0.64, 1)` — **the** family |
| `--duration-instant`…`--duration-slow` | 80 → 400ms |
| `--mx-press-scale` | `0.96` |

---

## Brand mark

- Source photo: `public/brand/chaupaal-icon-source-v2.png` (IconV2). Brand mark: `public/brand/chaupaal-mark-charpai-v2as.png` (+ `chaupaal-mark-32-charpai-v2as.png` for favicon)
- Raster PWA: `public/icon-charpai-v2as.png` (1024), `icon-192-charpai-v2as.png`, `icon-512-charpai-v2as.png`, `icon-maskable-512-charpai-v2as.png`, `apple-touch-icon-charpai-v2as.png`
- Concept: traditional Indian **charpai / khat** on a peach→red gradient — the commons seat as identity. Icons use the source **as-is** (resize only via `scripts/regen-charpai-icons.js`; no zoom crop).
- SVG wrappers (`chaupaal-mark.svg`, `chaupaal-mark-32.svg`) embed the raster for legacy paths; UI and favicons use PNG.
- Filenames include `-charpai-v2as` so Android/iOS cannot keep serving a cached prior icon URL after reinstall.

---

## Orchestrated moment

**Skipped** first-session welcome choreography — would fight clarity and feel gimmicky next to auth hero + splash. Soft presence + press light carry the signature instead.

---

## Related

- Application CSS: `public/src/styles/gathered-light.css`
- Theme engine: `theme-engine.js` writes `--light-*` in Auto
- Engineering: [CONVENTIONS.md](./CONVENTIONS.md) §13–14
- Philosophy: [PHILOSOPHY.md](./PHILOSOPHY.md)
