# Chaupaal philosophy (internal)

This document is for product and engineering decisions only. **Never surface it to users.**

## Attention is the scarce resource, not access

Chaupaal can show people almost anyone and let them message almost anyone. That is easy. What is scarce is **attention**: the care someone gives a conversation, a reply, a first hello.

When every option is infinite, each choice feels cheap (paradox of choice). We deliberately **limit a few high-leverage actions** so the ones people do take carry more weight and get used more mindfully.

Examples already in product:

- **Anonymous Peepal posts** — capped per day and per week (fixed Monday week). Anonymity is available, not endless.
- **AI Discovery → Personal messaging** — capped per day and per week for strangers found via intent search. Browsing and opening profiles is free; only a real send counts. Professional profiles found the same way are uncapped — disclosed in UI so the asymmetry is intentional, not a bug.
- Manual search, friends, Baithak, and filter-based discovery messaging stay uncapped: the limit targets **AI-intent cold outreach**, not connection in general.

## How to use this doc

Before shipping a new limit, boost, or “unlimited” bypass, ask:

1. **What scarce resource are we protecting?** (Usually attention — ours or theirs.)
2. **Does the limit apply at the moment of costly action** (send, publish), not at browse/view?
3. **Is the asymmetry disclosed** when two similar paths have different caps?
4. **Are the numbers in one config constant** so we can tune without a scavenger hunt?
5. **Would removing the limit make each remaining choice feel cheaper?** If yes, keep or tighten; don’t paper over with gamified scarcity UI.

If a feature fights this philosophy (e.g. pay-to-spam AI Discovery), it needs an explicit product call — not a silent ship.

## Related

- Limit constants: `public/src/js/config/policy-limits.js`
- Engineering rules: [CONVENTIONS.md](./CONVENTIONS.md)
