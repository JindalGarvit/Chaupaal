# Child safety escalation — DRAFT (requires legal review)

## What the product does today

- **No accounts under 13**, everywhere (neutral age question, device lock, no data kept).
- **Teen mode (13–17)**: messages only from friends (other teens only if the teen allows); adults who aren't friends can never message a teen; 18+ chip games hidden; stricter content filters in Peepal, Duniya and Akhbaar discovery; stranger matchmaking (dating / networking intents) hidden. Product decision (D1): profile-field display, location sharing (friends-only, time-limited), AI features, activity signals and personalised recommendations follow the teen's own settings, as for adults — **flag for legal review** (UK Age Appropriate Design Code / OSA expect high-privacy defaults for children).
- **Reporting**: "Child safety" is the first reason in every Report sheet and goes to the top of the queue (1 h target). The reported item is **restricted immediately** (hidden pending review).
- **No copies**: a child-safety report stores references only (collection / id) — never a snapshot of text or media. Moderators view the item in place.

## Escalation path (manual until automated)

1. A moderator confirms apparent CSAM / grooming / sexual exploitation of a minor.
2. **Do not download, forward, screenshot or share** the material. Do not contact the uploader.
3. Action: `ban` the account (statement of reasons with ground = illegal, basis = `csam`) and keep the content removed.
4. **Preserve** what the law requires for the jurisdiction (e.g. US 18 U.S.C. §2258A: report to NCMEC CyberTipline and preserve for 90 days; EU: national hotlines / law enforcement under the CSA Directive; India: POCSO s.19–20 + IT Rules r. 3(1)(j) — report to the National Cyber Crime Reporting Portal). Preservation is done by the legal contact in a restricted store — **not** in moderation tools. [Process owner + restricted store to be set up by counsel.]
5. Report to the competent authority: NCMEC (US), IWF (UK), INHOPE member hotline (EU / elsewhere), cybercrime.gov.in (India). Record the reference number on the report (never the material).
6. Grooming / imminent danger to a child: contact local police immediately; then the steps above.

## Future items

- Hash-matching (PhotoDNA / CSAI Match / NCMEC hash list) for uploads — requires a provider agreement; Cloudinary moderation add-ons are an option.
- Age assurance beyond self-declaration where risk requires it.
- Quarterly child-safety review in the risk assessment.
