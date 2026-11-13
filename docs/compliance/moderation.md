# Notice & action, statements of reasons, appeals — DRAFT (requires legal review)

Code: `server-lib/moderation.js` · client `public/src/js/core/report.js` · admin `GET/POST /api/admin-feedback` · user `POST /api/media-config` · timers `api/chaupaal-scheduler.js`.

## Flow

1. **Notice** — Report on any post, comment, story, message, chat / group, Mehfil room, profile (incl. Peepal / Vriksha), Dangal party chat (long-press), Scribble drawing, quiz / party card. Reasons: child safety, self-harm, violence or threats, illegal content (country + legal basis + good-faith statement, DSA Art. 16(2)), sexual content, hate, harassment, spam / scam, impersonation, IP infringement, other. Optional details + contact email. Self-harm shows regional helplines; child safety shows national hotlines.
2. **Acknowledgement** — an in-app notification at once ("report received"; India: "we'll resolve within 15 days").
3. **Queue** — `GET /api/admin-feedback?view=moderation_queue`: priority 0 (child safety, self-harm, violence) → 1 (illegal, sexual) → 2 (hate, harassment) → 3 (spam, impersonation, IP, other); then SLA deadline; overdue flagged. `moderation_claim` marks first human touch.
4. **Decision** — `POST {action:'moderation_decide', reportId, action, rule?, ground?, law?, facts?, automatedDetection?, automatedDecision?}` with `action` ∈ no_action · remove · restrict · age_restrict · suspend (7 days) · ban.
5. **Statement of reasons** (`statements/{id}`) to the affected user — in their language, in-app (notification → sheet): what was actioned, the rule or law (country + basis), facts, whether detection / decision were automated, duration, redress (internal appeal, out-of-court settlement, courts).
6. **Appeal** (`appeals/{id}`) — one tap from the statement; decided by a **different moderator** (`SAME_MODERATOR` rejected); outcome notice; `reversed` undoes the action. Limits: one appeal per decision; 180-day window; after 3 rejected appeals in 30 days → `APPEAL_LIMIT` cooldown (DSA Art. 23-style misuse rule — requires legal review).
7. **Reporter outcome** — privacy-safe notice: "action taken" or "no violation found" (never what or against whom).

## SLA timers

| Queue | Reasons | Target |
|---|---|---|
| child_safety | child safety | 1 h (content restricted immediately pending review) |
| imminent_harm | self-harm, violence | 1 h |
| illegal | illegal content | 24 h |
| standard | sexual, hate, harassment, impersonation, IP | 24 h / 72 h |
| low | spam, other | 72 h |

**India (IT Rules 2021, r. 3(2))** — when the reporter or the reported account is in India: acknowledge within **24 h** (automatic acknowledgement + first human touch tracked), resolve within **15 days**; sexual content / non-consensual intimate imagery within **24 h**. The scheduler (`processModerationTimers`) sends reminders to `MODERATOR_UIDS` 6 h before the acknowledgement deadline and 2 days before the resolution deadline, and flags overdue reports. Grievance Officer: Settings → Help & reports, and the Contact page (placeholders).

## Transparency report fields (`view=transparency[&format=csv][&from=&to=]`)

notices.total · notices.byCategory · notices.byCountry · notices.illegalByBasis · notices.childSafety · actions.total · actions.byType · actions.byGround · actions.byCategory · automated.detection · automated.decision · automated.human · appeals.total · appeals.upheld · appeals.reversed · appeals.open · appeals.medianDecisionHours · handling.medianHours · handling.byCategory · india.grievances · india.acknowledgedWithin24h · india.resolvedWithin15d · india.open.

`view=dsa_export` returns statements shaped like the DSA Transparency Database API (decision_visibility / decision_account / decision_ground / category / content_type / territorial_scope / automated_detection / automated_decision / application_date). Submission is a **manual admin step** until we register for API access.

## Open items

- Legal review of categories, timelines, appeal limits, suspension length.
- Out-of-court dispute settlement body (DSA Art. 21) — none certified yet; placeholder in the statement.
- Moderator roster + `MODERATOR_UIDS`; admin claim (`admin: true`) is the only role today.
- Automated detection: none in production (all decisions human); fields are ready.
