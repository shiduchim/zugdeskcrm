# Handoff
_Last updated: 2026-11-12_

## In progress
Combined plan from the two reviews (Opus + Fable), approved by the user:
Steps 1–4 DONE (code in repo + renamed, safety fixes, reliability fixes, tests).
Next: user does the first-run checklist in TESTS.md and reports problems. Then Easy mode + WhatsApp send mode.

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
- User does NOT want to re-upload to Drive for future list updates: add an "Import file" button in the app (file picker → merge by exact phone/email, no duplicates). Build it with the Gmail import (12).
- Nothing has run inside Google yet; everything Google-side must be tested by the user.
