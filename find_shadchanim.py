"""
find_shadchanim.py — finds shadchan-related people in a Google Takeout export.

What it reads (it finds the files itself inside the Takeout folder):
  * Mail:      *.mbox            (e.g. "All mail Including Spam and Trash.mbox")
  * Contacts:  *.csv and *.vcf   (Google Contacts export)

What it writes (next to this script):
  * shadchan_from_email.csv     — people you emailed with about shidduchim
  * shadchan_from_contacts.csv  — contacts whose name/notes/labels mention shid / shadchan / שדכן ...
  * shadchan_conversations.txt — per person, every email in order (what you wrote, what they answered)
  * shadchan_details.csv       — per person: did they ask not to be contacted, did they make suggestions,
                                  do they call themselves a shadchan, and short excerpts of their own words

Usage (Windows):
  py find_shadchanim.py "C:\\path\\to\\Takeout" your@gmail.com
Only Python's built-in libraries are used. Nothing is uploaded anywhere.
"""
import csv, email, mailbox, os, re, sys, html
from email.header import decode_header, make_header
from email.utils import getaddresses, parsedate_to_datetime
from collections import defaultdict

KEYWORDS = re.compile(
    r"שדכ|שידוך|שידוכים|שדכנית|shadch|shadc|shidd|shiduch|shid\b|matchmak|zivug|זיווג|"
    r"шадхан|шидух", re.I)
PHONE = re.compile(r"(?<!\d)(?:(?:\+?972[\s-]?|0)(?:[23489]|5\d|7\d)[\s-]?\d{3}[\s-]?\d{4}|"
                   r"(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4})(?!\d)")


def dec(v):
    try:
        return str(make_header(decode_header(v or "")))
    except Exception:
        return str(v or "")


def body_text(msg, limit=30000):
    """Plain text of a message (falls back to stripped HTML)."""
    plain, htm = [], []
    parts = msg.walk() if msg.is_multipart() else [msg]
    for p in parts:
        ct = p.get_content_type()
        if p.get_content_disposition() == "attachment" or ct not in ("text/plain", "text/html"):
            continue
        try:
            payload = p.get_payload(decode=True) or b""
            txt = payload.decode(p.get_content_charset() or "utf-8", errors="replace")
        except Exception:
            continue
        (plain if ct == "text/plain" else htm).append(txt)
        if sum(map(len, plain + htm)) > limit:
            break
    if plain:
        return "\n".join(plain)[:limit]
    t = re.sub(r"<(script|style).*?</\1>", " ", "\n".join(htm), flags=re.S | re.I)
    t = re.sub(r"<br\s*/?>|</p>|</div>", "\n", t, flags=re.I)
    return html.unescape(re.sub(r"<[^>]+>", " ", t))[:limit]


def own_part(text):
    """Cut quoted history so phones come from what this person wrote."""
    out = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith(">") or re.match(r"^(On .{5,200}wrote:|בתאריך .{3,200}|-{2,}\s*Original|From:|מאת:)", s, re.I):
            break
        out.append(line)
    return "\n".join(out)


def norm_phone(p):
    d = re.sub(r"\D", "", p)
    if d.startswith("972"):
        d = "0" + d[3:]
    if d.startswith("0") and (len(d) == 9 or (len(d) == 10 and d[1] in "57")):
        return d[:2] + "-" + d[2:] if len(d) == 9 else d[:3] + "-" + d[3:]
    if len(d) == 11 and d.startswith("1"):
        d = d[1:]
    if len(d) == 10 and d[0] in "23456789":
        return "+1 " + d[:3] + "-" + d[3:6] + "-" + d[6:]
    return ""


OPT_OUT = re.compile(r"(^|[\s.,!?\"'()-])(הסר|הסירו|להסיר|תסיר|תסירו)($|[\s.,!?\"'()-])|לא מעוניינ|אל ת(שלח|כתוב|פנה)|תפסיק|"
                     r"unsubscribe|remove me|take me off|stop (sending|emailing)|do(n't| not) (email|contact|write)|не пишите|удалите|отпиш", re.I)
SUGGEST = re.compile(r"הצעה|הצעות|יש לי (בחורה|מישהי|הצעה)|רעיון (בשבילך|עבורך)|suggest|have someone for you|an idea for you|"
                     r"resume|rezume|רזומה|קורות חיים|предлож|есть девушка", re.I)
SAYS_SHADCHAN = re.compile(r"שדכנית|שדכן|מ?שדכת|matchmaker|shadchan|shadchante|шадхан|сваха", re.I)
AUTO = re.compile(r"auto-?reply|automatic reply|out of (the )?office|תשובה אוטומטית|מענה אוטומטי", re.I)


def one_line(t, n):
    t = re.sub(r"\s+", " ", t).strip()
    return t[:n] + ("…" if len(t) > n else "")


def scan_mail(paths, me):
    people = defaultdict(lambda: {"names": set(), "count": 0, "from_them": 0, "to_them": 0,
                                  "first": "", "last": "", "subjects": [], "phones": set()})
    details = defaultdict(lambda: {"optout": 0, "suggest": 0, "says": 0, "list": 0, "auto": 0, "words": []})
    convo = defaultdict(list)          # addr -> [(date, direction, subject, text)]
    sent_texts = {}                    # same email sent to many people is written out only once
    scanned = matched = 0
    for path in paths:
        print("Reading", path, "(this can take a few minutes)…")
        for msg in mailbox.mbox(path, create=False):
            scanned += 1
            if scanned % 5000 == 0:
                print(f"  {scanned} emails checked, {matched} about shidduchim")
            try:
                subj = dec(msg.get("Subject"))
                text = body_text(msg)
            except Exception:
                continue
            # details from EVERY message a person sent (a "please remove me" rarely says "shidduch")
            try:
                frm = [a.lower() for _, a in getaddresses([dec(msg.get("From"))])]
            except Exception:
                frm = []
            if frm and frm[0] not in me:
                d = details[frm[0]]
                own = own_part(text)
                if msg.get("List-Unsubscribe") or msg.get("List-Id") or (msg.get("Precedence") or "").lower() in ("bulk", "list"):
                    d["list"] += 1
                elif AUTO.search(subj) or msg.get("Auto-Submitted", "no").lower() != "no":
                    d["auto"] += 1
                else:
                    if OPT_OUT.search(own): d["optout"] += 1
                    if SUGGEST.search(subj + " " + own): d["suggest"] += 1
                    if SAYS_SHADCHAN.search(own): d["says"] += 1
                    try:
                        dt = parsedate_to_datetime(msg.get("Date")).strftime("%Y-%m-%d")
                    except Exception:
                        dt = ""
                    if own.strip():
                        d["words"].append((dt, one_line(own, 400)))
            # the conversation text, both directions (quoted history cut)
            try:
                when_full = parsedate_to_datetime(msg.get("Date")).strftime("%Y-%m-%d %H:%M")
            except Exception:
                when_full = ""
            if not (msg.get("List-Unsubscribe") or msg.get("List-Id")):
                own = one_line(own_part(text), 1500)
                if frm and frm[0] in me:
                    key = own[:300]
                    if key in sent_texts and own:
                        own = "(same email as on " + sent_texts[key] + ")"
                    else:
                        sent_texts[key] = when_full
                    for _, a in getaddresses([dec(msg.get(h)) for h in ("To", "Cc") if msg.get(h)]):
                        a = (a or "").lower()
                        if a and a not in me:
                            convo[a].append((when_full, "ME →", subj[:120], own))
                elif frm:
                    convo[frm[0]].append((when_full, "← THEM", subj[:120], own))
            if not KEYWORDS.search(subj + "\n" + text):
                continue
            if msg.get("List-Unsubscribe") or msg.get("List-Id"):
                continue  # newsletters and mailing lists
            matched += 1
            try:
                when = parsedate_to_datetime(msg.get("Date")).strftime("%Y-%m-%d")
            except Exception:
                when = ""
            sender = [a.lower() for _, a in getaddresses([dec(msg.get("From"))])]
            from_me = any(a in me for a in sender)
            others = [x for h in ("From", "To", "Cc", "Reply-To") if msg.get(h) for x in getaddresses([dec(msg.get(h))])]
            for name, addr in others:
                addr = (addr or "").strip().lower()
                if not addr or "@" not in addr or addr in me or re.search(r"no-?reply|mailer-daemon|notification", addr):
                    continue
                p = people[addr]
                if name and "@" not in name:
                    p["names"].add(name.strip(" '\""))
                p["count"] += 1
                p["from_them" if addr in sender else "to_them"] += 1
                p["first"] = min(filter(None, [p["first"], when]), default=when)
                p["last"] = max(p["last"], when)
                if subj and len(p["subjects"]) < 3 and subj not in p["subjects"]:
                    p["subjects"].append(subj[:80])
                if addr in sender and not from_me:
                    for ph in PHONE.findall(own_part(text)):
                        n = norm_phone(ph)
                        if n:
                            p["phones"].add(n)
    print(f"Done: {scanned} emails checked, {matched} about shidduchim, {len(people)} people.")
    rows = sorted(people.items(), key=lambda kv: (-kv[1]["from_them"], -kv[1]["count"]))
    with open("shadchan_from_email.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["Email", "Name(s)", "Emails about shidduchim", "From them", "From you",
                    "First", "Last", "Phones in their emails", "Example subjects"])
        for addr, p in rows:
            w.writerow([addr, " / ".join(sorted(p["names"])), p["count"], p["from_them"], p["to_them"],
                        p["first"], p["last"], ", ".join(sorted(p["phones"])), " | ".join(p["subjects"])])
    with open("shadchan_conversations.txt", "w", encoding="utf-8") as f:
        for addr, p in rows:
            f.write("=" * 70 + "\n" + addr + "  |  " + " / ".join(sorted(p["names"])) + "\n")
            for when, direction, subj, own in sorted(convo.get(addr, [])):
                f.write(f"[{when}] {direction}  {subj}\n    {own}\n")
            f.write("\n")
    with open("shadchan_details.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["Email", "Name(s)", "From them", "From you", "Last", "Asked not to contact", "Suggestions",
                    "Says shadchan", "Newsletter emails", "Auto-replies", "Phones", "Their latest words (newest first)"])
        for addr, p in rows:
            d = details.get(addr) or {"optout": 0, "suggest": 0, "says": 0, "list": 0, "auto": 0, "words": []}
            words = sorted(d["words"], reverse=True)[:3]
            w.writerow([addr, " / ".join(sorted(p["names"])), p["from_them"], p["to_them"], p["last"],
                        d["optout"], d["suggest"], d["says"], d["list"], d["auto"], ", ".join(sorted(p["phones"])),
                        " ‖ ".join(f"[{dt}] {t}" for dt, t in words)])


def scan_contacts(csv_paths, vcf_paths):
    out = []
    for path in csv_paths:
        with open(path, encoding="utf-8-sig", errors="replace") as f:
            for r in csv.DictReader(f):
                blob = " ".join(v for v in r.values() if isinstance(v, str))
                if not KEYWORDS.search(blob):
                    continue
                name = " ".join(filter(None, [r.get("First Name") or r.get("Given Name"), r.get("Middle Name"),
                                              r.get("Last Name") or r.get("Family Name")])) or r.get("Name", "")
                emails = [v for k, v in r.items() if k and "mail" in k.lower() and "value" in k.lower() and v]
                phones = [v for k, v in r.items() if k and "phone" in k.lower() and "value" in k.lower() and v]
                notes = " ".join(filter(None, [r.get("Notes"), r.get("Labels"), r.get("Group Membership"),
                                               r.get("Organization Name") or r.get("Organization 1 - Name")]))
                out.append([name, " ; ".join(emails), " ; ".join(norm_phone(p) or p for x in phones for p in x.split(" ::: ")),
                            notes[:200], os.path.basename(path)])
    for path in vcf_paths:
        with open(path, encoding="utf-8", errors="replace") as f:
            for card in f.read().split("BEGIN:VCARD")[1:]:
                if not KEYWORDS.search(card):
                    continue
                fn = re.search(r"^FN[^:]*:(.*)$", card, re.M)
                emails = re.findall(r"^EMAIL[^:]*:(.*)$", card, re.M)
                phones = re.findall(r"^TEL[^:]*:(.*)$", card, re.M)
                note = re.search(r"^NOTE[^:]*:(.*)$", card, re.M)
                out.append([fn.group(1).strip() if fn else "", " ; ".join(e.strip() for e in emails),
                            " ; ".join(norm_phone(p) or p.strip() for p in phones),
                            (note.group(1)[:200] if note else ""), os.path.basename(path)])
    with open("shadchan_from_contacts.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["Name as saved", "Emails", "Phones", "Notes / labels", "File"])
        w.writerows(out)
    print(f"Contacts: {len(out)} shadchan-related contacts found.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    root = sys.argv[1]
    me = {a.lower() for a in sys.argv[2:]}
    mboxes, csvs, vcfs = [], [], []
    for d, _, files in os.walk(root):
        for fn in files:
            p = os.path.join(d, fn)
            if fn.lower().endswith(".mbox"):
                mboxes.append(p)
            elif fn.lower().endswith(".vcf"):
                vcfs.append(p)
            elif fn.lower().endswith(".csv") and "contact" in p.lower():
                csvs.append(p)
    print(f"Found {len(mboxes)} mailbox file(s), {len(csvs)} contacts CSV, {len(vcfs)} vCard file(s).")
    if csvs or vcfs:
        scan_contacts(csvs, vcfs)
    if mboxes:
        if not me:
            print("Tip: add your own email address(es) after the folder so you aren't listed as a contact.")
        scan_mail(mboxes, me)
    print("Finished. Send shadchan_conversations.txt, shadchan_details.csv, shadchan_from_email.csv and shadchan_from_contacts.csv to Claude.")
