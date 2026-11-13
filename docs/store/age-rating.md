# Age rating answers — DRAFT (requires store-policy / legal review)

Answered honestly for what the app does today. Re-check before every submission.

## Apple (App Store Connect age rating questionnaire)

| Question | Answer | Why |
|---|---|---|
| Cartoon or fantasy violence | Infrequent / mild | Arcade / sports games (Penalty, Cricket, Badminton) |
| Realistic violence | None | — |
| Sexual content or nudity | None (user content moderated) | UGC rules forbid it; reports + removal |
| Profanity or crude humour | Infrequent / mild | User text; word filters on games |
| Alcohol, tobacco, drug use or references | Infrequent / mild | User content may mention them; teen filter hides |
| Mature / suggestive themes | Infrequent / mild | Discussions |
| Horror / fear themes | None | — |
| Medical / treatment information | None | — |
| **Simulated gambling** | **Frequent / intense** | Teen Patti, Poker, Rummy with virtual chips (no cash value, not purchasable); 18+ gate |
| Contests | Infrequent | Daily quiz leaderboards |
| Unrestricted web access | No | Links open the system browser; no in-app browser |
| **User-generated content** | **Yes** | Posts, comments, chat, voice rooms — reporting, blocking, moderation |
| Messaging / chat | Yes | DMs, groups, voice rooms |
| Location sharing | Yes (opt-in, friends only) | |

**Likely result: 17+** (frequent simulated gambling). Option: ship the chip games behind a store-build flag to target 12+ — product decision.

## Google Play (IARC questionnaire)

- Category: Social / Communication with games.
- Violence: mild, non-realistic (sports / arcade).
- Gambling: **simulated gambling — yes** (no real money, no purchasable currency).
- Sexuality, language: user-generated; moderated.
- Users interact: **yes** (chat, voice). Shares location: **yes** (opt-in). Digital purchases: yes (Premium — see store checklist; IAP compliance).
- Unrestricted internet: no.

**Likely results:** IARC 16+/18+ in many regions because of simulated gambling (PEGI 16/18, USK 16, ESRB Teen–Mature, ClassInd 16–18). Google Play target audience: **13+** (not designed for children; Families policy not applicable).

## Notes

- Stranger matchmaking is 18+ (teens never see dating / networking intents).
- Teen mode exists for 13–17 but the store rating is driven by the chip games.
