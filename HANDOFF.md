# Handoff
_Last updated: 2026-11-14_

## Helper app (built, waiting on user setup)
Friends/family/hired people call shadchanim with a personal link (no Google login, no password).
- Separate Apps Script project bound to its own sheet "zugdeskcrm – Helpers" (scope: only that sheet), deployed "Anyone". Code in `helper/`, auto-deployed by the same workflow.
- Main app writes the List (who helpers may call) + reads Results/Reservations; hourly + when the app opens.
- Call/WhatsApp button reserves the person (others see "X is calling"); reservation expires after 24h; results flow back (notes, names given → Suggested, "wants profile / Eliyahu should call" → your turn).
- Main: Settings → Helpers (add, link, pause, what each sees: All / Russian / English / Picked); contact field "Helpers" (Only me / names).
- Phone numbers visible to all helpers (user's decision). Fable only for: final safety review before sending links widely, or a bug failing twice.
- Built + tested in Node (17 checks); main app auto-deploys. Not done yet: user one-time steps: (1) Settings → Helpers → Set up helpers, (2) helpers' sheet → Extensions → Apps Script → Project Settings → Script ID to Claude → Claude adds helper/.clasp.json, (3) Deploy → New deployment → Web app, Me, Anyone → URL to Claude → Claude sets HELPER_URL in Code.gs + HELPER_DEPLOYMENT_ID in deploy.yml, (4) add Mom, test on her iPhone (TESTS.md Helpers).

## Now (2026-11-14)
- Built + pushed (commit 7dbeb29): in-app Messages (preview-first, then edit) and App settings. Deploy result not yet confirmed by Claude; reload the app if the Messages button is missing.
- Email texts: ONE file `Profile__Settings.csv` is waiting in the Import inbox (hourly job applies it; check it gets renamed "Imported …"). It has: short intro, LONG profile (user's choice) between two divider lines, the ask for other shadchanim + WhatsApp groups (user's explicit change to the 'first message never asks' rule), contact lines on 3 short lines, references, MY_PHONE, MY_WHATSAPP. Old files were trashed in Drive. Then: Settings → Messages to check, Email → Send test email before Sunday 9:00.
- Idea dropped by the user: emailing shadchan-network websites (ChabadMatch, Rebbetzins, Gateways…) for their lists.
- Known: the "how I found you" line says "directory" for every contact without a referrer (wrong for Web search / Gmail imports) — needs a code change per Source.
- Uploaded to Import inbox (processed by the hourly job): Gmail__DoNotContact/Shadchan/Connector/Organization.csv, "Gmail no answer__Other.csv", Profile__Settings.csv. Check the files were renamed "Imported … – N added, N known (N updated)…".
- Email autopilot: user is turning it ON; first sends Sunday 9:00, ramp 10→20→30→40/day. Ask user to send a test email to himself first to see the new profile + ending.
- Gmail review sheet "zugdeskcrm – Gmail review" in Drive; working files only in the scratchpad (never the repo).
- Helper app: still waiting for the user's one-time steps (Settings → Helpers → Set up helpers, then Script ID, then deploy URL).

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
