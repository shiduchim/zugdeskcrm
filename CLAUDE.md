# zugdeskcrm

Personal shadchan-outreach CRM for **Eliyahu Kahanovich** (41, single, Kohen, Chabad, baal teshuva ~15 yrs, Russian + English native, Hebrew conversational, lives in Tzfat; born in Russia, raised in the US).
Goal: **spend the least time per useful shadchan conversation, and keep growing the list of shadchanim.**
It must feel easy enough for a 12-year-old.

Status: **deployed and running in the shidduchim Google account (first run OK 2026-11-12); autopilot still OFF.** Logic for ranking, daily plan, reply-text cleaning and referral extraction was unit-tested with Node against the real data. Google-side features (Gmail, triggers, import save) are tested by the user in the live app.

---

## Files

| File | What it is |
|---|---|
| `Code.gs` | Apps Script backend (all logic, Gmail, triggers, API for the UI) |
| `Index.html` | The web app UI (single file, HTML/CSS/JS, uses `google.script.run`) |
| `ShidduchDesk_Data.xlsx` (not in repo — private, kept by the user) | **Authoritative data.** Tabs: Contacts (517), Log, Received, DoNotContact (39, from ZugDesk), Settings (all settings, message templates, profile HE/RU/EN). Upload → Save as Google Sheets. |
| `find_shadchanim.py` | Optional local script: scans a Google Takeout (mbox + contacts) for shidduch-related people → 2 small CSVs. Tested on sample data. |
| `source_data/` (not in repo — private) | Provenance only: ChatGPT transcription of the 81-page book (TSV), review workbook, cleaned listings, the ZugDesk outreach workbook (450 emails, separate project), and the Python scripts used to build the data. `build_data.py` does NOT include the 21 contacts from the insert sheet or the final renumbering — don't regenerate the data file from it without merging. |

---

## Architecture (decided)

- Google Sheet + **container-bound Apps Script web app**, served by Google (HtmlService).
- Deploy: **Execute as: Me, Who has access: Only myself.** No GitHub Pages, no public endpoint, no tokens in JS.
- Exception (approved): the helper page is also served from the public repo `shiduchim/zugdeskcrm.helper` (GitHub Pages, page code only, no data; key in `#k=`). `helper/site/index.html` is generated from `helper/Index.html` and copied to that repo on every helper change — keep the 3 in sync.
- Use a dedicated Chrome profile with only this Google account (multi-account Apps Script access error was hit before on a previous project).
- Owner account: the user may use a **separate, rarely-used Gmail address just for shidduchim** — then create the Sheet + script in that account. Old shidduch mail in the main account can be forwarded by a Gmail filter.
- Must stay **separate from ZugDesk** (survey/outreach project) and from **ClickCRM** (ClickTo3D marketing CRM). ClickCRM ideas were reused, not its code.
- Timezone `Asia/Jerusalem` everywhere. All sheets formatted as plain text (`@`) so phones keep leading zeros.

### Setup steps (for the user)
1. Upload `ShidduchDesk_Data.xlsx` to Drive → File → Save as Google Sheets.
2. Extensions → Apps Script → paste `Code.gs`; add HTML file named `Index` → paste `Index.html`.
3. Run `setup()` once, approve permissions (Sheets, Gmail, Drive, triggers).
4. Deploy → New deployment → Web app (Me / Only myself). Open link on PC and phone (add to home screen).
5. Settings tab: fill `MY_PHONE`.
6. App → Email → Send test email to me → check HE + RU → Turn on autopilot.
**Updates are automatic:** pushing a change to `Code.gs` / `Index.html` / `appsscript.json` on `main` or the working branch runs `.github/workflows/deploy.yml` → syntax check + `node tests/test.js` → `clasp push` + update of the existing web-app deployment (same link). Needs repo secret `CLASPRC_JSON` (clasp login of the shidduchim account). Never ask the user to paste code. Settings-tab text (messages, profile) is data, not code: the user edits it in the Sheet.
- Script ID and web-app deployment ID are in `.clasp.json` / the workflow. `.claspignore` uploads only the 3 app files.
- **Multi-account error:** with several Google accounts signed in, Apps Script links (also the helper link) can fail to open. Test helper links in a private/incognito window; helpers should open them in a private tab or a browser with no Google login. Never tell the user the link is broken before trying that.
- Phone: user has several Google accounts → the app opens in Samsung Internet logged in only to the shidduchim account (home-screen icon). PC: dedicated Chrome profile.

---

## Data model

**Contacts** columns: `ID, Name, City, Sector, Specialty, Languages, Symbol, Hours, Phone1, Phone2, Email, Other, Source, SourceRef, ReferredBy, Status, CloseReason, NextDate, Attempts, LastContact, LastChannel, NeedsReply, EmailStatus, EmailSentAt, EmailFollowupAt, EmailThreadIds, EmailLastSeen, Lang, Boost, CrossedOut, InZugDesk, Notes, AskedReferralsAt, Type`

- `Type`: `Shadchan` / `Connector` / `Organization` / `Other`. **Only `Shadchan` gets emails, the daily plan or helpers.** Organization + Other (e.g. old emails never answered) are kept out of Contacts/search/counts and shown only in Settings → Separate lists. Families of suggested people and friends are never imported. `Country` column (from phone code / email / text). Imports merge into existing contacts (exact phone/email): notes appended once, empty fields filled, nothing overwritten, original Source kept.

- IDs `C0001…C0517` — stable, never reuse/renumber. New IDs = max+1.
- `Status`: New → Contacted → Talking / Later / Closed. `CloseReason`: Not reached, Wrong number, Do not contact.
- `EmailStatus`: '' / Sent / Followed up / Replied / Bounced / Asked / Error.
- `Languages` uses the book's legend: ע Hebrew, ר Russian, א English, י Yiddish, צ French, ס Spanish. `Symbol`: `*` limited activity, `**` accepts anyone.
- `Lang` override per contact: HE / RU / EN (default: RU for Russian speakers if setting is YES, else HE).
- Other tabs: **Log** (When, ContactID, Name, Channel, Action, Details), **Received** (lists/files people sent; email attachments saved automatically to Drive folder "zugdeskcrm – Received lists"), **DoNotContact** (Email, Phone, Reason, Date, Source — blocks every channel), **Suggested** (created automatically: recommended shadchanim found in replies/pasted text, status New/Added/Linked/Ignored), **Settings** (Key / Value / Explanation).

### Where the 517 contacts came from
- **The book:** "ספר טלפונים שדכנים/ות", התשע"ב 2012 (Chabad). © David Zabrodsky (דוד זברודסקי), zadavid@yandex.ru, 0506-770150, fax 072-2347411. Manager: מרים גורקוב. The book says no photographing, translating or copying into a database without his written permission, so keep the data private and never publish or share it. 2026-11-14: the user spoke with him; he said not to put the shadchanim info online (he had no permission for that). The user decided book contacts stay in the private app and in the helpers' list (personal links only). Never put book data on a public page, repo or shared file.
- 496 from that printed directory (2012, so ~14 years old; 81 photos, pages 4–158). Transcribed by ChatGPT, checked against 3 sample pages: **phones were 29/29 correct, names had 2 silent errors in 22** (fixed), so names may contain errors elsewhere. 41 problematic non-Russian rows were deleted; 15 problematic Russian-speaking rows were kept with a note. Rows crossed out in pen in the book have `CrossedOut=YES`.
- 21 from a separate printed insert "שדכנים חדשים" (no city/symbol columns; "הורן אסתר" name partly hidden by a fold).
- 7 directory contacts overlap with the ZugDesk email list (`InZugDesk=YES`; they received a survey email before). ZugDesk's 39 Do-Not-Contact emails are in DoNotContact. None of ZugDesk's opt-outs appear in the directory.
- Phone numbers are ~10 years old: expect dead numbers.

---

## What's built

**Ranking** (`scoreContact`, pure function, weights in Settings `W_*`): Chabad (+5), Russian-speaking / works with Russian speakers (+4/+5), baalei teshuva (+2), age range including 41 (+4) or excluding (−8), all ages/older (+2), young-only (−2), "only other communities" (−4), dati leumi without Chabad (−2), `**` (+2), Tzfat (+3) / nearby (+1) / Chabad towns (+1), mobile (+1), referred (+5), crossed out (−4), already in ZugDesk (−1), manual `Boost`. Returns `why` chips shown in UI (no numbers shown).
Top leads on day 1: call קיי אסתר (Tzfat, Russian speakers); WhatsApp סוקולוב פרידה, סטמבלר אורה, אליגולשוילי…

**Today plan** (cached per day in ScriptProperties): 1 call (prefers landline-only best lead) + 10 WhatsApp (mobiles) from Status New, not blocked, no shared phone with an already-contacted contact, and (when autopilot is on) people with an email get email first. Plus: "Wrote back to you", "Recommended to you" (one-tap add), "Check in again" (NextDate due), "Good time to ask for more shadchanim" (Talking, contacted ≤21 days, not yet asked; max 3/day).

**One-tap results** (`RESULTS`): sent (+6 days), noreach (+4, closes after MAX_ATTEMPTS=3), spoke (+21), wroteback (needs reply), answered (+14), later (+60), wrong (close), stop (close + add to DoNotContact), reopen.

**WhatsApp**: `api.whatsapp.com/send?phone=…&text=…` links with the intro (HE/RU/EN) + profile prefilled (`WA_INCLUDE_PROFILE`; if WhatsApp truncates long text set NO and use the Copy profile button). Regular WhatsApp only — **no WhatsApp Business, no unofficial syncing** (account-ban risk).

**Email autopilot** (hourly trigger `hourlyJob`): Sun–Thu, 9:00–19:00, skips `SKIP_DATES`, automatic weekly ramp 10 → 20 → 30 → 40/day (`EMAILS_PER_DAY` start, `EMAILS_PER_DAY_MAX`, `EMAIL_RAMP`; counted from the first day it was turned on, property `auto_since`; Gmail script limit is 100/day), spread over the day, best leads first, one follow-up after 8 days inside the same thread (only if not reached another way), HTML with correct direction (RTL for Hebrew), label `zugdeskcrm`. Reply detection = one Gmail search per run (last 3 days), matched by thread or sender; auto-replies ignored; a Gmail error stops the batch without marking anyone; bounces (in-thread and mailer-daemon search) move the contact back to the phone/WhatsApp pool; autopilot auto-pauses after 5 bounces/day. Opt-out words detected only in the person's own text (quoted history and our template lines are stripped by `ownText_`). Attachments → Drive + Received. Test email button. Starts OFF.

**Referrals**: polite ask messages (`ASK_WA_*`, `ASK_EMAIL_*`, `ASK_SUBJECT_*`) sent at the right moment; email ask replies inside the person's own thread. `extractPeople()` finds names + Israeli/US phones + emails in replies and pasted text (tested HE/RU/EN, multiple people per line, email on next line, excludes sender's/own numbers). Known contacts → linked as "recommended by"; new → Suggested for one-tap add. Referred contacts get +5 and their intro says who referred them.

**Other**: the hourly job uses its own running flag (not the script lock) so app taps never wait; statuses never move backwards (Talking stays Talking); daily Drive backup at 03:00 (keeps 30), schema auto-upgrade (`schema_()`), LockService on writes, UI buttons lock during saves, contact sheet with history/notes/next date/language, contacts search + Filters panel (Who, Country, Language, Community, Location, Reach, Source; counts; active filters shown as one "Filters: … · Change" line; no removable tags, no x/plus icons; insert sheet = Book), Received screen, Email status screen. **Settings** (header button): Theme Auto/Light/Dark, Look ZugDesk (default)/Classic, both in localStorage. Contact card has Basic/Details tabs; on PC (≥900px) list left, card panel right, arrows + Esc. **Helpers** (Settings → Helpers): friends/family call shadchanim with a personal link (no login); helper page tabs Done | After call | To call (To call on the right): notes first, note-only save, own What-next buttons, Done = searchable history with Call again / Add note, "Not for us" = a suggestion the owner confirms (Helpers='Set aside: <name>'); Best first = Chabad top, crossed out last; separate Apps Script project in `helper/` bound to its own sheet "zugdeskcrm – Helpers" (scope: only that sheet, access Anyone); main app writes List, reads Reservations/Results (hourly + on open); Call button holds the person 24h so two helpers never call the same one; contact field `Helpers` = '' / 'Only me' / a helper's name. **Messages screen** (Settings → Messages and profile): preview-first view of exactly what is sent (first email, follow-up, WhatsApp; HE/RU/EN; referred version), then Edit per text with unsaved preview; **App settings** = every other Settings-tab value (AUTO_EMAIL only via the Email screen); saves log the old value. **Texts from chat**: an Import-inbox file `Name__Settings.csv` (key,value) updates profile / templates / `REFERENCES_*` / `CONTACT_LINE_*` / `MY_PHONE` / `MY_WHATSAPP` (old value logged) — never ask the user to paste these. `MY_WHATSAPP` = his USA WhatsApp number: only that number opens WhatsApp in emails, the Israeli number (calls/SMS only) opens the dialer. Profile photo is private in Drive folder "zugdeskcrm – Profile" (sent only on request). **Copy references** button on the contact card. **Import contacts** (Settings): file or pasted list → preview (new / already in list / Do-not-contact / skipped) → add; matches by exact phone or email only; usual flow: user sends a list in chat, Claude returns a clean CSV (scratchpad, never the repo).

---

## Planned next (agreed with the user, not built)

Status and order: see HANDOFF.md.

1. **Second opinion first**: have a Fable subagent review the design and code (efficiency, simplicity, bugs). Show both opinions and one combined plan **before changing files**.
2. **Easy mode / Advanced mode** toggle (remembered). Easy = Today only, one task at a time, big buttons, "done for today". Advanced = contacts, history, settings, received, stats.
3. **WhatsApp Send mode**: "Start sending (10)" → opens WhatsApp → on return one "Sent?" tap → auto-advance.
4. **Call only within the shadchan's printed hours** (parse `Hours`; outside hours show "Call after 21:00").
5. **One "Add shadchanim" button**: paste text (extraction), 10-second quick add, **event mode** (event name set once, tags every add, next-day follow-up list), photo/file intake (to Received).
6. **Source tags** on every contact (Book / Insert / Referral – name / WhatsApp group – name / Event – name+date / Website / Gmail).
7. **Connectors** category (people who know shadchanim; they get a "do you know shadchanim?" message, not the profile).
8. **Thank-you reminder** to the referrer when a referral leads to a good conversation.
9. **"WhatsApp check" screen**: everyone messaged in the last 2 weeks without a reply → one tap "Replied" (user keeps a WhatsApp list "Shidduchim").
10. Optional: import exported WhatsApp chats (.txt) from Drive; SMS import if Android (backup app → Drive), not possible on iPhone.
11. **"What works" panel**: reply rates by channel and by source.
12. ~~Gmail import~~ **Done 2026-11-14**: Takeout scanned locally by `find_shadchanim.py` (details + full conversations), 366 replies reviewed, imported as Shadchan / Connector / Organization / Other ("Gmail no answer") + DoNotContact; families/friends/newsletters not imported.

---

## Standing UI / tone rules
- Calm, positive wording. Avoid "waiting", "overdue", "no response", "failed" style pressure words in the main flow.
- Big tap targets (≥44px), mobile-first, works on PC too. No clutter. No plus signs as icons in the UI.
- No numeric scores shown to the user — use short "why" chips.
- Hebrew/Russian text: `dir="auto"`; Hebrew emails right-to-left.
- Light and dark mode.
- Never suggest bulk/unofficial WhatsApp automation; never auto-merge contacts by name only (phone/email exact match only).
- Messages to shadchanim: short, polite, personal; first message never asks for lists of other shadchanim.

## Privacy
Data stays in the user's Google account. Notes about suggested people (later "Shidduchim" area) are sensitive: never put data or tokens in a public repo or page.

## Repo rules
- The app was first called ShidduchDesk; its name is now **zugdeskcrm** (separate from the ZugDesk survey project).
- Never commit the data file, `source_data/`, Takeout exports or anything with contact data, even though the repo is private.

---

# How to work with me (applies to every project)

I am not a programmer; I build apps (mainly Revit add-ins and small web tools) by working with AI.
Act as my senior engineer and coach: make good decisions for me and tell me plainly when I should do something.
**Always make things easy for me:** when I must do something by hand, give ONE step at a time, wait for me to say "done", then give the next. Put anything I need (files, text to copy) right in the chat.

## Coach me — say these out loud, in one short line, when they apply
- **Model:** I switch the chat's model myself in the model picker.
  - Normal work: Opus. Simple edits, text, renames: suggest Sonnet or Haiku.
  - **Fable is my most expensive model; use it sparingly.** Only when it will give a clearly better result: hard architecture, a bug other models failed to fix twice, big risky refactors, or a final review of important work.
  - **Never use Fable without asking me first** — not by switching, and not by starting a Fable helper agent. Ask in this format and wait for my answer:
    > **Fable?** Reason: … · Benefit vs. staying on Opus: … · Size: small / medium / large (rough guess, e.g. "about 3× an Opus answer") · Time: ~… min · How: helper or switch (and why)
  - **Helper vs. switch:** use a Fable *helper* for a one-time opinion, plan or review (only that piece costs Fable; the chat stays on Opus). Tell me to *switch* the chat only when Fable must do many steps of hard work itself. When that's done, tell me to switch back.
  - Cost/time are rough guesses; you can't see my usage meter. Say so if unsure.
  - If I'm on Fable for routine work, tell me to switch down.
- **Effort:** suggest low for small edits/questions, medium for normal features, high only for complex or risky work.
- **Compact / clear / new chat:** check at the end of every finished step and tell me in one line, e.g. "💡 Good time to /compact".
  - **/compact:** same task continues, but the chat is long (many files read, long logs, ~30+ messages) or you start forgetting earlier details.
  - **/clear** (same chat, I prefer this over new chats): the task is done or I'm starting something unrelated in the same repo. Run /handoff first, then tell me what to type after /clear.
  - **New chat:** only when I need a different repo (a chat is tied to one repo).
  - **Stuck:** after 2 failed fix attempts or going in circles, suggest /handoff + /clear (a fresh start often works better).
  - Never suggest /clear or a new chat while unfinished work isn't saved to HANDOFF.md and committed.
- **Plan mode:** for anything touching several files or that could break things, propose a short plan and wait for my OK.
- **Mistakes:** if I'm asking for something risky, wasteful, or that a better approach exists for, tell me briefly and recommend one option.

## Rules for changes
- Small, focused changes. One thing at a time.
- Never redesign, remove, or rewrite working features or UI without a specific reason I approved.
- Git checkpoint (commit) before significant changes, so we can always go back.
- After changes: build and run the relevant tests/checks. Clearly list anything that could NOT be tested (e.g. needs Revit open on my PC).
- Keep explanations short and in plain language. No long lectures.

## Saving tokens
- Read only the files/lines needed; don't dump logs or whole large files.
- Don't repeat research already done; don't spawn agents unless truly needed.

## Project memory files (keep them short)
- `CLAUDE.md` — permanent facts: what the project is, architecture, rules, design decisions. Update only when something permanent changes.
- `HANDOFF.md` — unfinished work + next steps. Update only at the end of a session or before /clear, and only if something is unfinished.
- `TESTS.md` — important checks and regression tests. Add a line when a bug is fixed or a feature is approved.
- If a project is missing these files, offer to create them (don't change app code to do it).

## Starting a session
Read CLAUDE.md (automatic), then HANDOFF.md if it has open items, and tell me in 2–3 lines where we left off.
