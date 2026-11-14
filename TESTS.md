# Tests & checks

## Automatic (Claude runs these)
- Syntax: `cp Code.gs /tmp/c.js && node --check /tmp/c.js`
- Tests: `node tests/test.js` (phones, ranking, finding names in text, cleaning replies, auto-reply detection, helpers' list / who sees whom / holds)

## Manual — first run inside Google (only you can do these)
_Phone: multiple Google accounts → use Samsung Internet (or another browser) logged in only to the shidduchim account. Firefox on Android fails with an internet filter unless "Use third party CA certificates" is on._
- [x] `setup()` runs without errors; Contacts has a `Type` column filled with "Shadchan"; Settings has `SKIP_DATES`; `EMAILS_PER_DAY` is 5
- [x] Web app opens on PC and phone; Today shows 1 call + up to 10 WhatsApp
- [x] On the phone, "Call …" opens the dialer and "Open WhatsApp" opens WhatsApp with the message
- [ ] Type `0501234567` in `MY_PHONE` → the test email shows it with the 0
- [x] "Send test email to me" → Hebrew is right-to-left, Russian is fine
- [ ] Autopilot on → after an hour, Email screen shows "last check" and sent count ≤ 5/day
- [ ] Reply to one of the test-style emails from another address → appears in "Wrote back to you" within an hour
- [ ] Follow-up (after 8 days) arrives inside the first email's thread, not as a separate email
- [ ] Out-of-office reply does NOT show as "Wrote back"
- [ ] Tapping buttons while "Check for replies now" runs still works

## Regression (one line per fixed bug or approved feature)
- Follow-up emails only go to people reached by email alone (Status Contacted + LastChannel Email).
- Only `Type = Shadchan` gets emails, WhatsApp plan or "ask" emails.
- Blank/short email template → nothing is sent, Email screen shows why.
- No automatic emails on dates in `SKIP_DATES`.
- A Gmail error stops the batch; nobody is marked "Error" (except a truly invalid address).
- Reply check = one Gmail search (last 3 days), not one per contact.
- Gmail work never holds the app's lock (taps don't fail while it runs).
- Auto-replies are not counted as replies.
- `MY_PHONE` keeps its leading 0.
- Names with an apostrophe (ג') don't break "They sent a list or file".
- "Message sent" / "Didn't reach" never moves a Talking contact back or closes it.
- "Ask by email" refuses Closed / Do-not-contact people.
- `MY_PHONE` shows in emails without a plus (1-612-888-5778 / 050-1234567) and is a tap-to-WhatsApp link (wa.me), even if Sheets turned it into bare digits.
- On a wide PC screen the title and bottom tabs stay inside the centered column.
- Today card note box: type a note, tap a result → note saved with date in Notes + Log. "Save note" saves without a result.
- Card opens instantly from loaded data; history fills in ~1 s (api_history).
- Tapping a result updates only that card: no full Today reload, scroll position and typed notes kept; "Check in again" item disappears after a result.
- Search in Contacts finds everyone (also people already contacted/closed) when the filter is "Best first".
- Note added from Today while the card is open is not wiped by "Save changes".
- "Back to new" does not mark the contact as contacted today.
- WhatsApp cards on Today have Call too; More has Spoke / Didn't reach (logged as Call).
- Contacts: source bubbles with counts ("Book p. 12" and "Book" = one bubble; the insert sheet "שדכנים חדשים" counts as Book); Show / Sort menus; Russian / Chabad toggles; count line "N people here · total"; search finds everyone incl. by phone digits.
- Insert-sheet contacts: on first app open after v4, Source becomes "Book" and the old wording moves to SourceRef (runs once; Book rows untouched).
- Contacts list loads more by itself while scrolling (no "Show more" button); opening a contact from the list is instant and WhatsApp link is built on the device.
- Settings button (top right) → Theme Auto / Light / Dark; choice is remembered on this device after reload; Auto follows the phone/PC.
- Contact card has Basic / Details tabs. Basic: call/WhatsApp/email/copy profile, note box, result buttons, next date (Save date), latest 3 history lines + "All history". Details: about/source/email status, language, notes editor, ask for more shadchanim, add referral, received list, full history. Opening another contact starts on Basic; saving keeps the current tab.
- Card note box (id sn-…) does not clash with the Today card's note box (n-…); a result tapped in the card saves the card's note.
- PC (≥900px wide): list on the left, the card stays open on the right (no going back and forth); the open person is highlighted in the list; ↑/↓ move through the list; Esc closes the card. Phone layout unchanged (card opens full screen).
- Look: ZugDesk (default: warm paper background, white cards with soft shadow, black main buttons, Inter, small uppercase section titles) or Classic in Settings → Look; remembered per device; works with Light/Dark/Auto. Cards and list rows stand out from the background in both themes.
- Import (Settings → Import contacts): file (CSV/TXT) or pasted rows; headers in EN/HE/RU recognised, or loose lines "Name 054-… mail@x"; preview shows new / already in list / do-not-contact / skipped before anything is saved; matches only by exact phone or email (same name with another phone = new person); new people get next IDs, Status New, chosen Source + Type, SourceRef "Imported <date>"; existing people get "also in <source>"; one Log line per import.

## Manual — Helpers (only you can do these)
- [x] Settings → Helpers → Set up helpers → a sheet "zugdeskcrm – Helpers" appears in Drive with tabs Helpers, List, Reservations, Results, Texts, Config; List is filled
- [x] Helper link opens in incognito (PC) with Mom's page in Russian, list 687 (2026-11-14; note: first deployment gave "Sorry, unable to open the file" — fixed by creating a NEW web-app deployment)
- [ ] Add "Mom" (Russian speakers, RU) → Copy link → opens on her iPhone in Safari without any Google login, page in Russian
- [ ] Call button opens the dialer; the person moves to "My calls"; on a second link (another helper) the same person shows "Mom is calling"
- [ ] Save "We spoke" + "Eliyahu should call" + a note → within an hour (or when you open your app) it shows under "From your helpers — your turn" with the note
- [ ] Names given with a phone number → appear in "Recommended to you"
- [ ] Pause a helper → their link shows "This link is not active"
- [ ] Contact card → Details → Helpers "Only me" → person disappears from the helpers' list (within 15 minutes)

## Manual — Types, Country, merge (only you can do these)
- [ ] Contacts: "Who" dropdown shows Shadchanim by default; Connectors and Everyone work; no organizations or "never answered" people anywhere in Contacts or search
- [ ] Settings → Separate lists → Organizations / Never answered open their own lists; tapping a name opens the card
- [ ] Contact card → Details: Country field saves
- [ ] After an import, a contact you already had keeps its group (e.g. Book) and gets the new note added once (not twice)
- [ ] Email screen shows "up to 10 a day today, rising each week to 40" after turning the autopilot on; Settings tab has EMAILS_PER_DAY 10, EMAILS_PER_DAY_MAX 40, EMAIL_RAMP YES
- [ ] Settings → Messages and profile: preview shows the first email, follow-up and WhatsApp message in Hebrew / Russian / English (tick "referred" shows the referral line); Edit → change a text → "See how it looks" shows the unsaved version with a banner → Save writes it to the Settings tab (old value in Log)
- [ ] Settings → App settings: change e.g. emails per day → Save; AUTO_EMAIL is not listed (only the Email screen switches autopilot); Email screen → "See and edit messages" opens Messages
- [ ] Node: settingsSections_ / settingsPatch_ (tests/test.js)
- [ ] Helper static page (no Google cookies): `<pages-url>/#k=<key>` opens in a NORMAL multi-account Chrome window and on iPhone; Call/Save work; old `/exec?k=` link still works.
- [ ] Helper page: Оригинал / Русский switch on top; Russian shows translated city/description/chips and 'Name (Hebrew name)'; choice remembered; Hebrew helpers see no switch. Translations fill in ~150 per refresh (hidden tab Tr in helpers sheet).
