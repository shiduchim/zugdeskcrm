# Handoff
_Last updated: 2026-11-14_

## Filters + helper page cleanup (published 2026-11-14 evening) — waiting for the user's phone check
- Live in both apps: Filters panel (counts, live list, closes with Done / outside tap / Esc / phone Back), "Filters: … · Change" line + Clear all (no removable tags), Country group (Country field, else phone code), main app quick Russian / WhatsApp.
- Helper page: title "{name}'s list", small Original/Russian pill, sticky My calls / List switch, links for What to say + "Eliyahu's profile: Русский | עברית | English" copy, result grid, clearer "I won't call — put back in the main list" + toast, no quick buttons. Russian-language helpers start once with Russian + English + Book ticked and Best first puts Russian speakers on top. Mom's Show must stay **All** (Russian would hide English speakers).
- Not tested on a real phone: Samsung Internet Back button inside the Apps Script page, Mom's iPhone, real data. Profile language buttons appear after the hourly helper sync.
- My calls card redone (Fable review): notes first, note-only save, custom "What next" buttons. Check on Mom's phone that a note-only save shows in your app after the hourly sync.
- Tabs now Позвонить | После звонка | Готово (Done = history with search, Call again, Add note). Results tab has new columns Phone, Tel, City; older results have no phone, so no Call again for them. Main app writes Config NoCall each rebuild.
- Also live (not yet checked on a real phone): "Не подходит / Not for us" (helper → owner decides in Today "Helpers set these aside"; owner "Not for me" on contact card), suggestions box always visible after call, blue language chips, chips always in her language, Best first = Chabad on top, crossed out always last. To call tab is on the right.
- Maybe later (user said not now): amber warning chips; blue language chips in the main app.

## Helper app (live, 2026-11-14)
Deployed and wired (helper/.clasp.json, HELPER_URL, HELPER_DEPLOYMENT_ID set; Mom's page opens in incognito).
Left: user sends Mom her link (Settings → Helpers → Copy link) and tests on her iPhone (TESTS.md Helpers, remaining boxes). Fable only for a final safety review before sending links widely, or a bug failing twice.

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
