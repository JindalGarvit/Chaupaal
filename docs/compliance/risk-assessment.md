# Risk & child-safety assessment — DRAFT (requires legal review)

Scope: DSA systemic-risk style + UK Online Safety Act illegal-content and children's risk assessments. Review at least yearly and before launching any feature that changes reach, contact between users, or minors' exposure.

| Feature | Main risks | Likelihood / impact | Mitigations shipped | Residual / next |
|---|---|---|---|---|
| **Baithak DMs & groups** | Grooming, harassment, scams, unsolicited sexual content | Med / High | Teen mode: messages only from friends, adult↔teen strangers blocked; stranger daily limit; block + report on every message and chat; priority child-safety queue; statement of reasons + appeal | No message scanning (privacy); consider nudity blur for teens |
| **Peepal (questions, discovery)** | Harmful advice, dating / networking with minors, harassment | Med / Med | Open to teens with stricter lexicon filter + moderation age-restrictions; dating / networking intents hidden for teens; report on questions, comments, profiles; "Why am I seeing this?" + non-personalised option | Lexicon is English-first — add moderation labels per language |
| **Mehfil voice / video rooms** | Live abuse, sexual content, raids | Low–Med / High | Host roles + removal, room report, members only, flood limits | Live moderation tooling; recording is not stored |
| **Duniya public posts & stories** | Illegal content, hate, misinformation, viral harm | Med / Med | Audience controls (public / followers / friends), report → remove / restrict / age-restrict, teen discovery filter, ranking opt-out | Proactive detection not in production |
| **Chip games (Teen Patti, Poker, Rummy…)** | Gambling-like harm, minors | Med / Med | Virtual chips only — not purchasable, no cash value, no withdrawal; 18+ gate (DOB) hidden in Teen mode | Keep chips non-purchasable in every store build |
| **Stranger matchmaking (Peepal discovery)** | Adults meeting minors, catfishing | Low–Med / High | 18+ only for stranger matching (TEEN_BLOCKED_FEATURES); verified contact required; report profile | Age assurance beyond self-declaration |
| **AI features** | Inaccurate / unsafe output, personal data use | Med / Low | AI labelled; deterministic fallbacks; "Use AI features" switch; off by default for teens; crisis replies hardcoded | Output moderation per language |
| **Location sharing** | Stalking | Low / High | Friends only, time-limited, off by default for teens | — |

Children's access: the service is likely to be accessed by children 13+ (UK Children's Code / OSA). Teen mode is the default safety layer; see `docs/compliance/child-safety.md` for escalation.

Metrics to review: notices by category (transparency report), median handling time, appeals reversed %, teen-reported incidents.
