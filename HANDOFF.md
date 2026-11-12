# Handoff
_Last updated: 2026-11-12_

## In progress
Done and live: steps 1–4, first run, auto-deploy, Book grouping + v4 migration, Settings (Theme, Look), card Basic/Details tabs, PC layout, ZugDesk look, Import button.
Waiting on the user:
1. Send the ChatGPT web-search list in chat → Claude cleans it to a CSV in the scratchpad (never the repo), Source "Web search", Type Shadchan only for real shadchanim → user imports it (first real Import save = the live test; start small).
2. Confirm: ZugDesk look OK on phone + PC; insert contacts show under Book; Samsung home-screen icon.
3. Make the GitHub repo private (walk through one step at a time; check deploy still works after).
4. Decide: email autopilot on now (5/day) or a day of call/WhatsApp first.
Later imports: ZugDesk survey list (Source "ZugDesk survey"), then Gmail (non-shadchanim must not be Type Shadchan).

Original plan:
1. Code into the repo, renamed to zugdeskcrm.
2. Safety fixes: follow up only people not reached another way; `Type` column (email only `Shadchan`); refuse blank emails; Ask-by-email respects Do-Not-Contact; `SKIP_DATES` (Yom Tov / fasts); start at 5 emails/day.
3. Reliability fixes: send first, then one Gmail search for replies; stop at the first send error (don't mark "Error"); don't block UI taps; follow-up inside the original thread; ignore auto-replies; keep MY_PHONE leading 0; apostrophe bug in "They sent a list"; statuses never go backwards.
4. Tests in TESTS.md + Node checks; first-run checklist for the user (incl. tel: links on phone).

## Next steps (after the plan)
- Easy mode + WhatsApp send mode (planned 2+3), then WhatsApp check (9, also fixes growing check-ins), then Source/Connectors tags (6+7) before the Gmail import (12), then quick-add (5, no photo intake).
- Later, after a month of data: thank-you reminder (8), What works panel (11).
- Dropped: parsing call hours (4 — hours already shown), WhatsApp/SMS import (10).

## Notes / blockers
- Google Drive + Gmail connectors are connected to the shidduchim account: Claude can read the Sheet (export) and Gmail directly. Drive connector cannot edit Sheet cells.
- The app runs in Google (first run OK 2026-11-12); Google-side features are tested by the user. First real Import save not yet confirmed.
