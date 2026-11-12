# Handoff
_Last updated: 2026-11-12_

## In progress
Combined plan from the two reviews (Opus + Fable), approved by the user:
1. Code into the repo, renamed to zugdeskcrm — done.
2. Safety fixes: follow up only people not reached another way; `Type` column (email only `Shadchan`); refuse blank emails; Ask-by-email respects Do-Not-Contact; `SKIP_DATES` (Yom Tov / fasts); start at 5 emails/day.
3. Reliability fixes: send first, then one Gmail search for replies; stop at the first send error (don't mark "Error"); don't block UI taps; follow-up inside the original thread; ignore auto-replies; keep MY_PHONE leading 0; apostrophe bug in "They sent a list"; statuses never go backwards.
4. Tests in TESTS.md + Node checks; first-run checklist for the user (incl. tel: links on phone).

## Next steps (after the plan)
- Easy mode + WhatsApp send mode (planned 2+3), then WhatsApp check (9, also fixes growing check-ins), then Source/Connectors tags (6+7) before the Gmail import (12), then quick-add (5, no photo intake).
- Later, after a month of data: thank-you reminder (8), What works panel (11).
- Dropped: parsing call hours (4 — hours already shown), WhatsApp/SMS import (10).

## Notes / blockers
- Nothing has run inside Google yet; everything Google-side must be tested by the user.
