/**
 * zugdeskcrm — personal shadchan outreach CRM
 * Google Sheet + Apps Script web app (Execute as: me, Access: only myself)
 *
 * Tabs used: Contacts, Log, Received, DoNotContact, Settings
 * First-time setup: run setup() once from the editor, then deploy as a web app.
 */

const TZ = 'Asia/Jerusalem';
const LABEL = 'zugdeskcrm';
const C_HEADERS = ['ID','Name','City','Sector','Specialty','Languages','Symbol','Hours','Phone1','Phone2','Email','Other',
  'Source','SourceRef','ReferredBy','Status','CloseReason','NextDate','Attempts','LastContact','LastChannel','NeedsReply',
  'EmailStatus','EmailSentAt','EmailFollowupAt','EmailThreadIds','EmailLastSeen','Lang','Boost','CrossedOut','InZugDesk','Notes',
  'AskedReferralsAt','Type','Helpers','Country'];
const S_HEADERS = ['When','FromID','FromName','Name','Phone','Phone2','Email','Text','Status','ContactID'];
const SCHEMA = '7';

/** Adds new tabs/columns/settings to an older sheet without touching existing data. */
function schema_() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('schema') === SCHEMA) return;
  const ct = ensureSheet_('Contacts', C_HEADERS);
  const sh = ensureSheet_('Suggested', S_HEADERS);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
  // v3: Type column. Everyone already in the list came from shadchan directories → 'Shadchan'.
  const head = ct.getRange(1, 1, 1, ct.getLastColumn()).getValues()[0].map(String);
  const ti = head.indexOf('Type'), last = ct.getLastRow();
  if (ti >= 0 && last > 1) {
    const r = ct.getRange(2, ti + 1, last - 1, 1);
    const ids = ct.getRange(2, 1, last - 1, 1).getValues();
    r.setValues(r.getValues().map((v, i) => [v[0] || (ids[i][0] ? 'Shadchan' : '')]));
  }
  // v4: the insert sheet "שדכנים חדשים" is part of the book → Source 'Book' (old wording kept in SourceRef).
  const si = head.indexOf('Source'), ri = head.indexOf('SourceRef');
  if (si >= 0 && ri >= 0 && last > 1) {
    const sr = ct.getRange(2, si + 1, last - 1, 1), rr = ct.getRange(2, ri + 1, last - 1, 1);
    const sv = sr.getValues(), rv = rr.getValues();
    let changed = false;
    sv.forEach((v, i) => {
      const src = String(v[0] || '');
      if (!/^book\b/i.test(src) && /insert|שדכנים חדשים/i.test(src)) {
        const ref = String(rv[i][0] || '');
        rv[i][0] = ref ? (ref.indexOf(src) >= 0 ? ref : src + ' · ' + ref) : src;
        v[0] = 'Book'; changed = true;
      }
    });
    if (changed) { sr.setValues(sv); rr.setValues(rv); }
  }
  const st = ss_().getSheetByName('Settings');
  st.getRange(1, 2, st.getMaxRows(), 1).setNumberFormat('@');
  const s = settings_();
  if (s.SKIP_DATES === undefined) st.appendRow(['SKIP_DATES', '', 'Dates with no automatic emails (Yom Tov, fast days), e.g. 2026-12-25, 2027-03-23']);
  if (s.EMAILS_PER_DAY === '20') setSetting_('EMAILS_PER_DAY', '5');   // start slowly; raise over 2–3 weeks
  // v7: automatic weekly increase 10 → 20 → 30 → 40 (well under Gmail's 100/day for scripts)
  if (s.EMAILS_PER_DAY === '5') setSetting_('EMAILS_PER_DAY', '10');
  if (s.EMAILS_PER_DAY_MAX === undefined) st.appendRow(['EMAILS_PER_DAY_MAX', '40', 'Most emails per day once fully warmed up (Gmail allows scripts 100; stay well below).']);
  if (s.EMAIL_RAMP === undefined) st.appendRow(['EMAIL_RAMP', 'YES', 'YES = start at EMAILS_PER_DAY and add that many each week until EMAILS_PER_DAY_MAX. NO = always EMAILS_PER_DAY.']);
  p.setProperty('schema', SCHEMA);
}

/** Only real shadchanim get outreach (later: Connector, Family… must never get autopilot emails). */
function isShadchan_(c) { return c.Type === 'Shadchan'; }
/** Organizations and 'Other' (e.g. old emails that were never answered) live in their own lists under Settings. */
function isSeparate_(c) { return c.Type === 'Organization' || c.Type === 'Other'; }
const TYPES = ['Shadchan', 'Connector', 'Organization', 'Other'];

/* ------------------------------------------------------------------ */
/* Web app entry                                                       */
/* ------------------------------------------------------------------ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('zugdeskcrm')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SS_ID', ss.getId());
  ensureSheet_('Contacts', C_HEADERS);
  ensureSheet_('Log', ['When','ContactID','Name','Channel','Action','Details']);
  ensureSheet_('Received', ['When','ContactID','From','Channel','What','Link','Imported','Notes']);
  ensureSheet_('DoNotContact', ['Email','Phone','Reason','Date','Source']);
  ensureSheet_('Suggested', S_HEADERS);
  // keep everything as plain text so phones keep their leading 0 and dates stay readable
  ['Contacts','Log','Received','DoNotContact','Suggested'].forEach(n => {
    const sh = ss.getSheetByName(n);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
  });
  receivedFolder_();
  GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  ensureTrigger_();
  PropertiesService.getScriptProperties().deleteProperty('schema');
  schema_();
  return 'Setup done. Now deploy as a web app (Execute as: Me, Who has access: Only myself).';
}

function ensureSheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const first = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  if (!first[0]) { sh.getRange(1, 1, 1, headers.length).setValues([headers]); sh.setFrozenRows(1); return sh; }
  // add any missing columns at the end
  const missing = headers.filter(h => first.indexOf(h) < 0);
  if (missing.length) sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing]);
  return sh;
}

function ensureTrigger_() {
  const names = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (names.indexOf('hourlyJob') < 0) ScriptApp.newTrigger('hourlyJob').timeBased().everyHours(1).create();
  if (names.indexOf('dailyBackup') < 0) ScriptApp.newTrigger('dailyBackup').timeBased().atHour(3).everyDays(1).inTimezone(TZ).create();
}

/** Daily copy of the whole sheet to Drive; keeps the last 30. Also tidies old daily counters. */
function dailyBackup() {
  const props = PropertiesService.getScriptProperties();
  let folder = null;
  try { folder = DriveApp.getFolderById(props.getProperty('BACKUP_ID')); } catch (e) {}
  if (!folder) { folder = DriveApp.createFolder('zugdeskcrm – Backups'); props.setProperty('BACKUP_ID', folder.getId()); }
  DriveApp.getFileById(ss_().getId()).makeCopy('zugdeskcrm backup ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), folder);
  const files = []; const it = folder.getFiles(); while (it.hasNext()) files.push(it.next());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated()).slice(30).forEach(f => f.setTrashed(true));
  const keep = today_();
  Object.keys(props.getProperties()).forEach(k => {
    if (/^(plan_|sent_|bounce_)/.test(k) && k.indexOf(keep) < 0) props.deleteProperty(k);
  });
}

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function receivedFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder('zugdeskcrm – Received lists');
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function addDays_(n) { return Utilities.formatDate(new Date(Date.now() + n * 864e5), TZ, 'yyyy-MM-dd'); }
function str_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm').replace(' 00:00', '');
  return v === null || v === undefined ? '' : String(v).trim();
}
function fill_(tpl, map) { return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (map[k] !== undefined ? map[k] : '')); }

/** Israeli phone → {local:'050-1234567', intl:'972501234567', mobile:true} or null */
function normPhone_(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  if (!d.startsWith('0')) {
    if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
    if (d.length === 10 && /^[2-9]\d{2}[2-9]/.test(d))
      return { local: '+1 ' + d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6), intl: '1' + d, mobile: true };
    return null;
  }
  const ok = (d.length === 9 && /^0[2-489]/.test(d)) || (d.length === 10 && /^0[5-7]/.test(d));
  if (!ok) return null;
  const local = d.length === 9 ? d.slice(0, 2) + '-' + d.slice(2) : d.slice(0, 3) + '-' + d.slice(3);
  return { local: local, intl: '972' + d.slice(1), mobile: /^05/.test(d) };
}
let ME_ = '';
function me_() { return ME_ || (ME_ = Session.getEffectiveUser().getEmail().toLowerCase()); }
function threadUrl_(tid) { return tid ? 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(me_()) + '#all/' + tid : ''; }

/** Plain text → simple HTML with the right text direction (Hebrew right-to-left). */
/** wa: which numbers open WhatsApp when tapped — true = all, false = none, or the digits of your WhatsApp number (others open the dialer). */
function toHtml_(text, lang, wa) {
  const rtl = lang === 'HE';
  const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/https?:\/\/[^\s<]+/g, u => '<a href="' + u + '" dir="ltr">' + u + '</a>')
    .replace(/(^|[^\d-])(1-[2-9]\d{2}-\d{3}-\d{4}|05\d-\d{7}|05\d-\d{3}-\d{4})(?![\d-])/g, (m, pre, ph) => {   // phone → tap opens WhatsApp or the dialer
      const intl = ph.startsWith('1-') ? ph.replace(/\D/g, '') : '972' + ph.replace(/\D/g, '').slice(1);
      const isWa = wa === undefined || wa === true || (typeof wa === 'string' && wa === intl);
      return pre + '<a href="' + (isWa ? 'https://wa.me/' + intl : 'tel:+' + intl) + '" dir="ltr">' + ph + '</a>';
    });
  return '<div dir="' + (rtl ? 'rtl' : 'ltr') + '" style="direction:' + (rtl ? 'rtl' : 'ltr') + ';text-align:' + (rtl ? 'right' : 'left') +
    ';font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6">' + esc.replace(/\n/g, '<br>') + '</div>';
}

/** Keep only what the person wrote: cut quoted history, drop lines copied from our own messages. */
function ownText_(body, s) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (const raw of lines) {
    const t = raw.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
    if (/^>/.test(t) || /^--\s*$/.test(t)) break;
    if (/^On .{5,250}wrote:$/i.test(t) || /^בתאריך .{3,250}(מאת|כתב)/.test(t) || /^(-{2,}\s*(Original|Forwarded)|From:\s|מאת:\s|От:\s)/i.test(t)) break;
    if (/(написал|пишет).{0,40}:$/i.test(t)) break;
    out.push(t);
  }
  const mine = new Set();
  ['HE', 'RU', 'EN'].forEach(l => ['EMAIL_BODY_', 'EMAIL_FOLLOWUP_', 'ASK_EMAIL_', 'PROFILE_'].forEach(k =>
    String(s[k + l] || '').split('\n').forEach(x => { const n = x.replace(/\s+/g, ' ').trim().toLowerCase(); if (n.length >= 8) mine.add(n); })));
  return out.filter(x => !mine.has(x.replace(/\s+/g, ' ').trim().toLowerCase())).join('\n').trim();
}

function validEmail_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim()); }

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function settings_() {
  const sh = ss_().getSheetByName('Settings');
  const vals = sh.getDataRange().getValues();
  const s = {};
  vals.slice(1).forEach(r => { if (r[0]) s[String(r[0]).trim()] = r[1] instanceof Date ? str_(r[1]) : String(r[1]); });
  if (/^[2-9]\d{7,8}$/.test(String(s.MY_PHONE || '').trim())) s.MY_PHONE = '0' + String(s.MY_PHONE).trim();   // Sheets dropped the 0
  return s;
}
function setSetting_(key, value) {
  const sh = ss_().getSheetByName('Settings');
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) if (String(vals[i][0]).trim() === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  sh.appendRow([key, value, '']);
}
/** Pure: Settings rows → sections [{title, items:[{key, value, help}]}]. A row like "— AUTOPILOT —" starts a section. */
function settingsSections_(vals) {
  const out = []; let cur = null;
  vals.slice(1).forEach(r => {
    const k = String(r[0] == null ? '' : r[0]).trim();
    if (!k) return;
    if (k.charAt(0) === '—') {
      const t = k.replace(/—/g, '').trim().toLowerCase();
      cur = { title: t.charAt(0).toUpperCase() + t.slice(1), items: [] }; out.push(cur); return;
    }
    if (!cur) { cur = { title: 'Other', items: [] }; out.push(cur); }
    cur.items.push({ key: k, value: r[1] instanceof Date ? str_(r[1]) : String(r[1] == null ? '' : r[1]), help: String(r[2] == null ? '' : r[2]) });
  });
  return out;
}
/** Pure: which Settings cells to change. Known keys are updated, new text keys appended, AUTO_EMAIL and anything unknown skipped. */
function settingsPatch_(vals, changes) {
  const rowOf = {};
  vals.forEach((r, i) => { if (i > 0 && r[0]) rowOf[String(r[0]).trim()] = i + 1; });
  const writes = [], appends = [], skipped = [];
  Object.keys(changes || {}).forEach(k => {
    const v = String(changes[k] == null ? '' : changes[k]).replace(/\r\n/g, '\n');
    if (k === 'AUTO_EMAIL' || k.charAt(0) === '—') { skipped.push(k); return; }
    if (rowOf[k]) {
      const old = String(vals[rowOf[k] - 1][1] == null ? '' : vals[rowOf[k] - 1][1]);
      if (old !== v) writes.push({ row: rowOf[k], key: k, value: v, old: old });
    } else if (TEXT_KEYS.test(k)) appends.push({ key: k, value: v, old: '' });
    else skipped.push(k);
  });
  return { writes: writes, appends: appends, skipped: skipped };
}
function num_(s, k, d) { const n = parseFloat(s[k]); return isNaN(n) ? d : n; }
function list_(s, k) { return String(s[k] || '').split(',').map(x => x.trim()).filter(Boolean); }

/* ------------------------------------------------------------------ */
/* Data access                                                         */
/* ------------------------------------------------------------------ */

function loadContacts_() {
  const sh = ss_().getSheetByName('Contacts');
  const vals = sh.getDataRange().getValues();
  const head = vals[0].map(h => String(h).trim());
  const rows = [];
  for (let i = 1; i < vals.length; i++) {
    if (!vals[i][0]) continue;
    const o = { _row: i + 1 };
    head.forEach((h, j) => (o[h] = str_(vals[i][j])));
    rows.push(o);
  }
  return { sh: sh, head: head, rows: rows };
}

function patchContact_(db, c, patch) {
  Object.keys(patch).forEach(k => {
    const j = db.head.indexOf(k);
    if (j < 0) return;
    db.sh.getRange(c._row, j + 1).setValue(patch[k]);
    c[k] = String(patch[k]);
  });
}

function log_(c, channel, action, details) {
  ss_().getSheetByName('Log').appendRow([now_(), c ? c.ID : '', c ? c.Name : '', channel, action, details || '']);
}

function dnc_() {
  const vals = ss_().getSheetByName('DoNotContact').getDataRange().getValues().slice(1);
  const emails = new Set(), phones = new Set();
  vals.forEach(r => {
    if (r[0]) emails.add(String(r[0]).toLowerCase().trim());
    const p = normPhone_(r[1]); if (p) phones.add(p.intl);
  });
  return { emails: emails, phones: phones };
}

function phonesOf_(c) { return [c.Phone1, c.Phone2].map(normPhone_).filter(Boolean); }

function blocked_(c, dnc) {
  if (dnc.emails.has(String(c.Email).toLowerCase())) return true;
  return phonesOf_(c).some(p => dnc.phones.has(p.intl));
}

/* ------------------------------------------------------------------ */
/* Priority: best leads first (pure function, no Google calls)         */
/* ------------------------------------------------------------------ */

function scoreContact(c, s) {
  const why = []; let score = 0;
  const text = (c.Specialty || '') + ' ' + (c.Other || '');
  const tag = c.Sector || '';
  const langs = c.Languages || '';
  const myAge = parseFloat(s.MY_AGE) || 41;
  const W = k => parseFloat(s[k]) || 0;

  const chabad = /חב["״']?ד|חבד|אנ["״']?ש/.test(text + ' ' + tag);
  if (chabad) {
    score += W('W_CHABAD'); why.push('Chabad');
    if (/(רק|בעיקר|בציבור)\s*ל?חב["״']?ד/.test(text)) score += 1;
  }
  const ruLang = langs.indexOf('ר') >= 0, ruText = /רוס/.test(text);
  if (ruLang || ruText) { score += W('W_RUSSIAN') + (ruText ? 1 : 0); why.push(ruText ? 'Works with Russian speakers' : 'Speaks Russian'); }
  if (langs.indexOf('א') >= 0 || /אמריק|אנגלית/.test(text)) { score += W('W_ENGLISH'); if (/אמריק|אנגלית/.test(text)) why.push('Works with Americans/English'); }
  if (/תשובה|מקורבים/.test(text)) { score += W('W_BT'); why.push('Baalei teshuva'); }

  // age fit
  let ageNote = '', ageFit = 0;
  const range = text.match(/(\d{2})\s*[-–]\s*(\d{2})/);
  const upTo = text.match(/עד\s*(?:גיל\s*)?(\d{2})/);
  const plus = text.match(/(\d{2})\s*\+/);
  if (range) { const a = +range[1], b = +range[2]; ageFit = (myAge >= Math.min(a, b) && myAge <= Math.max(a, b)) ? 1 : -1; ageNote = 'ages ' + a + '–' + b; }
  else if (upTo) { ageFit = myAge <= +upTo[1] ? 1 : -1; ageNote = 'up to ' + upTo[1]; }
  else if (plus) { ageFit = myAge >= +plus[1] ? 1 : -1; ageNote = plus[1] + '+'; }
  if (ageFit > 0) { score += W('W_AGE_FIT'); why.push('Fits age (' + ageNote + ')'); }
  else if (ageFit < 0) { score -= W('W_AGE_MISMATCH'); why.push('Age limit ' + ageNote); }
  else if (/כל הגילאים|לכל הגילאים|בכל גיל|כל גיל|מבוגרים|גיל המעבר/.test(text)) { score += W('W_ALL_AGES'); why.push('All ages / older'); }
  else if (/צעירים|צעירות|בחורי|אם-בית|בנות סמינר/.test(text)) { score -= W('W_YOUNG'); }

  // narrow focus on other communities
  if (!chabad && !ruText && /(^|\s)רק\s|בלבד/.test(text)) { score -= W('W_ONLY_OTHER'); why.push('Only other communities'); }
  if (!chabad && /דת["״']?ל|דתי לאומי|דתיים לאומיים/.test(tag + ' ' + text)) score -= W('W_DATI_LEUMI');

  if (c.Symbol === '**') score += W('W_OPEN_TO_ALL');

  const city = c.City || '';
  if (s.MY_CITY && city.indexOf(s.MY_CITY) >= 0) { score += W('W_MY_CITY'); why.push('In ' + s.MY_CITY); }
  else if (list_(s, 'NEAR_CITIES').some(x => city.indexOf(x) >= 0)) { score += W('W_NEAR'); why.push('Nearby'); }
  if (list_(s, 'CHABAD_CITIES').some(x => city.indexOf(x) >= 0)) score += W('W_CHABAD_TOWN');

  if (phonesOf_(c).some(p => p.mobile)) score += W('W_MOBILE');
  if (c.ReferredBy) { score += W('W_REFERRED'); why.unshift('Recommended by ' + c.ReferredBy); }
  if (c.CrossedOut === 'YES') { score -= W('W_CROSSED_OUT'); why.push('Crossed out in book'); }
  if (c.InZugDesk === 'YES') score -= 1;
  score += parseFloat(c.Boost) || 0;
  return { score: Math.round(score * 10) / 10, why: why.slice(0, 4) };
}

/* ------------------------------------------------------------------ */
/* Recommended shadchanim: find names/phones/emails in what people write */
/* ------------------------------------------------------------------ */

const PHONE_RE = /(?<!\d)(?:(?:\+?972[\s-]?|0)(?:[23489]|5\d|7\d)[\s-]?\d{3}[\s-]?\d{4}|(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4})(?!\d)/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LABEL_RE = /(טלפון|טל['׳]?|נייד|פלאפון|פל['׳]|מייל|אימייל|דוא["״]ל|ווטסאפ|וואטסאפ|email|e-mail|mail|phone|tel|cell|mobile|whatsapp|телефон|тел\.?|почта)\s*[:.]?/gi;

/** Returns [{name, phone, phone2, email, line}] found in free text. exclude = {phones:Set(intl), emails:Set(lower)} */
function extractPeople(text, exclude) {
  const lines = String(text || '').split('\n').map(l => l.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim());
  const out = []; let prevName = '', prevIdx = -9;
  const cleanName = seg => {
    let t = seg.replace(LABEL_RE, ' ');
    const cut = Math.max(t.lastIndexOf('!'), t.lastIndexOf('?'));
    if (cut >= 0) t = t.slice(cut + 1);
    t = t.replace(/[\-–—:|,;•*·()\[\]\d+\/]/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^(and|try|also|or|recommend|ו?גם|או|и|также|или)\s+/i, '').trim();
    const w = t.split(' ').filter(Boolean);
    return w.slice(-4).join(' ').slice(0, 60);
  };
  lines.forEach((line, i) => {
    const toks = [];
    let m; PHONE_RE.lastIndex = 0;
    while ((m = PHONE_RE.exec(line))) { const p = normPhone_(m[0]); toks.push({ at: m.index, end: m.index + m[0].length, phone: p ? p.local : '', skip: !p || exclude.phones.has(p.intl) }); }
    EMAIL_RE.lastIndex = 0;
    while ((m = EMAIL_RE.exec(line))) { const e = m[0].toLowerCase(); toks.push({ at: m.index, end: m.index + m[0].length, email: e, skip: exclude.emails.has(e) }); }
    if (!toks.some(t => !t.skip)) {
      prevName = (!toks.length && /\p{L}{2}/u.test(line) && line.length <= 40 && !/[?:]$/.test(line)) ? line : ''; prevIdx = i; return;
    }
    toks.sort((a, b) => a.at - b.at);
    let pos = 0, firstOnLine = true;
    toks.forEach(t => {
      if (t.skip) { pos = t.end; return; }
      let name = cleanName(line.slice(pos, t.at));
      pos = t.end;
      const last = out[out.length - 1];
      if (name.length < 2 && firstOnLine && prevIdx === i - 1 && prevName) name = cleanName(prevName) || prevName;
      if (name.length < 2 && last && (last._i === i || last._i === i - 1)) {   // more details for the same person
        if (t.email && !last.email) last.email = t.email;
        else if (t.phone && !last.phone) last.phone = t.phone;
        else if (t.phone && !last.phone2) last.phone2 = t.phone;
        last._i = i; firstOnLine = false; return;
      }
      out.push({ name: name, phone: t.phone || '', phone2: '', email: t.email || '', line: line.slice(0, 200), _i: i });
      firstOnLine = false;
    });
    prevName = '';
  });
  return out;
}

function excludeFor_(c, s) {
  const phones = new Set(phonesOf_(c).map(p => p.intl)), emails = new Set();
  const mine = normPhone_(s.MY_PHONE); if (mine) phones.add(mine.intl);
  if (c.Email) emails.add(c.Email.toLowerCase().trim());
  try { emails.add(me_()); } catch (e) {}
  return { phones: phones, emails: emails };
}

/** Saves found people. Already-known ones are linked as "recommended by"; new ones wait in Today for one tap. */
function saveSuggestions_(from, people, db) {
  if (!people.length) return 0;
  const sh = ss_().getSheetByName('Suggested');
  const pending = sh.getDataRange().getValues().slice(1).filter(r => String(r[8]) === 'New');
  let added = 0;
  people.forEach(p => {
    const ph = [p.phone, p.phone2].map(normPhone_).filter(Boolean).map(x => x.intl);
    const em = (p.email || '').toLowerCase();
    if (!ph.length && !em) return;
    const known = db.rows.find(c => c.ID !== from.ID && ((ph.length && phonesOf_(c).some(x => ph.indexOf(x.intl) >= 0)) || (em && String(c.Email).toLowerCase() === em)));
    if (known) {
      if ((known.ReferredBy || '').indexOf(from.Name) < 0)
        patchContact_(db, known, { ReferredBy: known.ReferredBy ? known.ReferredBy + ', ' + from.Name : from.Name });
      log_(known, 'Referral', 'Also recommended', 'by ' + from.Name);
      sh.appendRow([now_(), from.ID, from.Name, p.name, p.phone, p.phone2, p.email, p.line, 'Linked', known.ID]);
      return;
    }
    const dup = pending.some(r => (ph.length && ph.some(x => { const n = normPhone_(r[4]); return n && n.intl === x; })) || (em && String(r[6]).toLowerCase() === em));
    if (dup) return;
    sh.appendRow([now_(), from.ID, from.Name, p.name, p.phone, p.phone2, p.email, p.line, 'New', '']);
    pending.push(['', '', '', p.name, p.phone, p.phone2, p.email, '', 'New']);
    added++;
  });
  if (added) log_(from, 'Referral', 'Recommended ' + added + ' shadchanim', 'waiting in Today to add');
  return added;
}

function api_suggestions() {
  schema_();
  const vals = ss_().getSheetByName('Suggested').getDataRange().getValues();
  return vals.slice(1).map((r, i) => ({ row: i + 2, when: str_(r[0]), fromId: str_(r[1]), from: str_(r[2]), name: str_(r[3]),
    phone: str_(r[4]), phone2: str_(r[5]), email: str_(r[6]), text: str_(r[7]), status: str_(r[8]) })).filter(x => x.status === 'New');
}

function api_acceptSuggestion(row, name) {
  const sh = ss_().getSheetByName('Suggested');
  const r = sh.getRange(row, 1, 1, S_HEADERS.length).getValues()[0].map(str_);
  const res = api_addReferral(r[1], { name: name || r[3] || '(no name)', phone: r[4], email: r[6], byName: r[2], phone2: r[5] });
  sh.getRange(row, 9, 1, 2).setValues([[res.status === 'linked' ? 'Linked' : 'Added', res.id]]);
  return res;
}
function api_ignoreSuggestion(row) { ss_().getSheetByName('Suggested').getRange(row, 9).setValue('Ignored'); return true; }

/** Paste a WhatsApp message (or any text) from a contact; finds the people in it. */
function api_extractFromText(fromId, text) {
  schema_();
  const s = settings_(), db = loadContacts_();
  const from = db.rows.find(c => c.ID === fromId);
  const people = extractPeople(text, excludeFor_(from, s));
  const n = saveSuggestions_(from, people, db);
  return { found: people.length, added: n };
}

/** Ask for recommendations by email: replies inside their own email if they wrote to us. */
function api_askEmail(id) {
  const s = settings_(), db = loadContacts_();
  const c = db.rows.find(r => r.ID === id);
  if (!validEmail_(c.Email)) throw new Error('No email address for this person');
  if (c.Status === 'Closed' || blocked_(c, dnc_())) throw new Error('This person is closed or on the Do-not-contact list');
  if (!isShadchan_(c)) throw new Error('Only shadchanim get this email');
  if (c.EmailStatus === 'Bounced') throw new Error('Email to this address failed before — ask by WhatsApp or phone');
  const lang = pickLang_(c, s);
  const body = fill_(s['ASK_EMAIL_' + lang] || s.ASK_EMAIL_HE, { sender: s.SENDER_NAME });
  if (body.trim().length < 20) throw new Error('ASK_EMAIL_' + lang + ' is empty — check the Settings tab');
  const opts = { name: s.SENDER_NAME, htmlBody: toHtml_(body, lang, waOk_(s)) };
  let theirs = null;
  (c.EmailThreadIds || '').split(',').filter(Boolean).forEach(tid => {
    try { GmailApp.getThreadById(tid).getMessages().forEach(m => { if (m.getFrom().toLowerCase().indexOf(me_()) < 0) theirs = m; }); } catch (e) {}
  });
  const ids = (c.EmailThreadIds || '').split(',').filter(Boolean);
  if (theirs) theirs.reply(body, opts);
  else {
    const msg = GmailApp.createDraft(c.Email.trim(), fill_(s['ASK_SUBJECT_' + lang] || s.ASK_SUBJECT_HE, {}), body, opts).send();
    const th = msg.getThread(); th.addLabel(GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL));
    if (ids.indexOf(th.getId()) < 0) ids.push(th.getId());
  }
  patchContact_(db, c, { AskedReferralsAt: now_(), EmailThreadIds: ids.join(','), EmailStatus: c.EmailStatus || 'Asked' });
  log_(c, 'Email', 'Asked for recommendations', lang);
  return card_(c, s);
}

/** Mark that you asked by WhatsApp/phone, or that now isn't a good time ('skip'). */
function api_askMark(id, how) {
  const s = settings_(), db = loadContacts_();
  const c = db.rows.find(r => r.ID === id);
  patchContact_(db, c, { AskedReferralsAt: how === 'skip' ? 'skip ' + today_() : now_() });
  log_(c, how === 'skip' ? '' : how, how === 'skip' ? 'Not asking for recommendations now' : 'Asked for recommendations', '');
  return card_(c, s);
}

/* ------------------------------------------------------------------ */
/* Today plan                                                          */
/* ------------------------------------------------------------------ */

function buildPlan_(db, s, dnc) {
  const busy = helperBusy_();
  const autoEmail = String(s.AUTO_EMAIL).toUpperCase() === 'ON';
  const touched = new Set();
  db.rows.forEach(c => { if (c.Status && c.Status !== 'New') phonesOf_(c).forEach(p => touched.add(p.intl)); });

  const pool = db.rows
    .filter(c => (c.Status || 'New') === 'New' && isShadchan_(c) && !blocked_(c, dnc) && !busy.has(c.ID))
    .filter(c => phonesOf_(c).length && !phonesOf_(c).some(p => touched.has(p.intl)))
    // when the email autopilot is on, people with an email get the email first
    .filter(c => !(autoEmail && validEmail_(c.Email) && !c.EmailStatus))
    .map(c => ({ c: c, sc: scoreContact(c, s).score }))
    .sort((a, b) => b.sc - a.sc);

  const used = new Set();
  const take = (pred, n) => {
    const out = [];
    for (const x of pool) {
      if (out.length >= n) break;
      if (used.has(x.c.ID) || !pred(x.c)) continue;
      const ph = phonesOf_(x.c).map(p => p.intl);
      if (ph.some(p => used.has(p))) continue;
      used.add(x.c.ID); ph.forEach(p => used.add(p));
      out.push(x.c.ID);
    }
    return out;
  };
  // the daily call goes to the best lead that can only be reached by phone; otherwise the best lead overall
  const callsN = num_(s, 'CALLS_PER_DAY', 1);
  let calls = take(c => !phonesOf_(c).some(p => p.mobile), callsN);
  if (calls.length < callsN) calls = calls.concat(take(() => true, callsN - calls.length));
  const wa = take(c => phonesOf_(c).some(p => p.mobile), num_(s, 'WA_PER_DAY', 10));
  return { call: calls, wa: wa };
}

function getPlan_(db, s, dnc, rebuild) {
  const props = PropertiesService.getScriptProperties();
  const key = 'plan_' + today_();
  let plan = rebuild ? null : props.getProperty(key);
  if (plan) return JSON.parse(plan);
  const p = buildPlan_(db, s, dnc);
  props.setProperty(key, JSON.stringify(p));
  return p;
}

function card_(c, s, lean) {
  const lang = pickLang_(c, s);
  const sc = scoreContact(c, s);
  const phones = phonesOf_(c);
  const mob = phones.find(p => p.mobile);
  return {
    id: c.ID, name: c.Name, city: c.City, sector: c.Sector, specialty: c.Specialty, languages: c.Languages,
    hours: c.Hours, email: c.Email, other: c.Other, status: c.Status || 'New', nextDate: c.NextDate,
    needsReply: c.NeedsReply === 'YES', emailStatus: c.EmailStatus, referredBy: c.ReferredBy, notes: c.Notes,
    lastContact: c.LastContact, lastChannel: c.LastChannel, lang: lang, why: sc.why,
    phones: phones.map(p => ({ local: p.local, tel: 'tel:+' + p.intl, mobile: p.mobile })),
    askWaUrl: mob && !lean ? 'https://api.whatsapp.com/send?phone=' + mob.intl + '&text=' + encodeURIComponent(fill_(s['ASK_WA_' + lang] || s.ASK_WA_HE, {})) : '',
    asked: c.AskedReferralsAt || '',
    gmailUrl: threadUrl_((c.EmailThreadIds || '').split(',').filter(Boolean).pop()),
    waUrl: mob && !lean ? 'https://api.whatsapp.com/send?phone=' + mob.intl + '&text=' + encodeURIComponent(waText_(c, s, lang)) : '',
    doneToday: (c.LastContact || '').slice(0, 10) === today_(),
    source: c.Source, sourceRef: c.SourceRef, closeReason: c.CloseReason, attempts: c.Attempts, rank: sc.score,
    helpers: c.Helpers || '', country: c.Country || '', type: c.Type || ''
  };
}

function pickLang_(c, s) {
  if (c.Lang) return c.Lang.toUpperCase();
  if (String(s.RUSSIAN_FOR_RUSSIAN_SPEAKERS).toUpperCase() === 'YES' && (c.Languages || '').indexOf('ר') >= 0) return 'RU';
  return 'HE';
}
function sourceLine_(c, s, lang) {
  return c.ReferredBy ? fill_(s['SOURCE_REFERRAL_' + lang], { by: c.ReferredBy }) : s['SOURCE_DIRECTORY_' + lang] || '';
}
function waText_(c, s, lang) {
  const withProfile = String(s.WA_INCLUDE_PROFILE).toUpperCase() === 'YES';
  return fill_(s['WA_INTRO_' + lang] || s.WA_INTRO_HE, {
    source_line: sourceLine_(c, s, lang),
    profile: withProfile ? '\n\n' + (s['PROFILE_' + lang] || s.PROFILE_HE) : ''
  }).trim();
}

/* ------------------------------------------------------------------ */
/* API for the web app                                                 */
/* ------------------------------------------------------------------ */

function api_today(rebuild) {
  schema_();
  try { helperSync_(false); } catch (e) { console.error(e); }   // helpers' results first
  const s = settings_(), db = loadContacts_(), dnc = dnc_();
  const newPlan = rebuild || !PropertiesService.getScriptProperties().getProperty('plan_' + today_());
  const plan = getPlan_(db, s, dnc, rebuild);
  if (newPlan) try { helperSync_(true); } catch (e) { console.error(e); }   // today's people leave the helpers' list
  const busy = helperBusy_();
  plan.call = plan.call.filter(id => !busy.has(id)); plan.wa = plan.wa.filter(id => !busy.has(id));
  const byId = {}; db.rows.forEach(c => (byId[c.ID] = c));
  const t = today_();
  const inPlan = new Set(plan.call.concat(plan.wa));
  const replies = db.rows.filter(c => c.NeedsReply === 'YES' && c.Status !== 'Closed' && !isSeparate_(c));
  const checkins = db.rows
    .filter(c => !inPlan.has(c.ID) && isShadchan_(c) && c.NeedsReply !== 'YES' && ['Contacted', 'Talking', 'Later'].indexOf(c.Status) >= 0
      && c.NextDate && c.NextDate <= t && !blocked_(c, dnc))
    .map(c => ({ c: c, sc: scoreContact(c, s).score })).sort((a, b) => b.sc - a.sc)
    .slice(0, num_(s, 'CHECKINS_PER_DAY', 8)).map(x => x.c);
  const recent = addDays_(-21);
  const asks = db.rows.filter(c => c.Status === 'Talking' && isShadchan_(c) && !c.AskedReferralsAt && c.NeedsReply !== 'YES'
      && (c.LastContact || '').slice(0, 10) >= recent && !blocked_(c, dnc))
    .map(c => ({ c: c, sc: scoreContact(c, s).score })).sort((a, b) => b.sc - a.sc)
    .slice(0, num_(s, 'ASKS_PER_DAY', 3)).map(x => x.c);
  const sh = db.rows.filter(isShadchan_);
  const counts = { total: sh.length, fresh: sh.filter(c => (c.Status || 'New') === 'New').length,
    talking: sh.filter(c => c.Status === 'Talking').length };
  return {
    date: t,
    call: plan.call.map(id => byId[id]).filter(Boolean).map(c => card_(c, s)),
    wa: plan.wa.map(id => byId[id]).filter(Boolean).map(c => card_(c, s)),
    replies: replies.map(c => card_(c, s)),
    checkins: checkins.map(c => card_(c, s)),
    asks: asks.map(c => card_(c, s)),
    suggestions: api_suggestions(),
    counts: counts,
    autoEmail: String(s.AUTO_EMAIL).toUpperCase() === 'ON',
    profiles: { HE: s.PROFILE_HE || '', RU: s.PROFILE_RU || '', EN: s.PROFILE_EN || '' },
    references: { HE: s.REFERENCES_HE || '', RU: s.REFERENCES_RU || '', EN: s.REFERENCES_EN || '' },
    callScript: s.CALL_SCRIPT || '',
    sheetUrl: ss_().getUrl(),
    helperNames: helperNames_()
  };
}

const RESULTS = {
  sent:      { label: 'Message sent',     status: 'Contacted', days: 6,  attempt: true },
  noreach:   { label: "Didn't reach",     status: 'Contacted', days: 4,  attempt: true },
  spoke:     { label: 'Spoke',            status: 'Talking',   days: 21, clearReply: true },
  wroteback: { label: 'They wrote back',  status: 'Talking',   days: 0,  needsReply: true },
  answered:  { label: 'I answered',       status: 'Talking',   days: 14, clearReply: true },
  later:     { label: 'Later',            status: 'Later',     days: 60, clearReply: true },
  wrong:     { label: 'Wrong number',     status: 'Closed',    close: 'Wrong number' },
  stop:      { label: 'Do not contact',   status: 'Closed',    close: 'Do not contact' },
  reopen:    { label: 'Reopened',         status: 'New',       days: 0 },
  callback:  { label: 'Call back later',  status: 'Contacted', days: 3 },
  inactive:  { label: 'Not active anymore', status: 'Closed',  close: 'Not active' }
};

function api_result(id, action, channel, note, nextDate) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const s = settings_(), db = loadContacts_();
    const c = db.rows.find(r => r.ID === id);
    if (!c) throw new Error('Contact not found: ' + id);
    applyResult_(s, db, c, action, channel, note, nextDate);
    try { helperHide_(id); } catch (e) {}   // you contacted them yourself → off the helpers' list
    return card_(c, s);
  } finally { lock.releaseLock(); }
}

/** Saves one result on a contact (no lock: callers hold it). */
function applyResult_(s, db, c, action, channel, note, nextDate) {
    const r = RESULTS[action]; if (!r) throw new Error('Unknown action ' + action);
    const patch = { Status: r.status, LastContact: now_(), LastChannel: channel || c.LastChannel || '' };
    if (action === 'reopen') { delete patch.LastContact; delete patch.LastChannel; }
    // someone you're already talking with stays "Talking" (no attempts counted, never auto-closed)
    const keep = c.Status === 'Talking' && (action === 'sent' || action === 'noreach' || action === 'callback');
    if (keep) patch.Status = 'Talking';
    if (r.attempt && !keep) patch.Attempts = (parseInt(c.Attempts, 10) || 0) + 1;
    if (action === 'noreach' && !keep && patch.Attempts >= num_(s, 'MAX_ATTEMPTS', 3)) { patch.Status = 'Closed'; patch.CloseReason = 'Not reached'; }
    if (r.close) patch.CloseReason = r.close;
    if (r.needsReply) patch.NeedsReply = 'YES';
    if (r.clearReply || r.close) patch.NeedsReply = '';
    patch.NextDate = nextDate || (r.days !== undefined && patch.Status !== 'Closed' ? addDays_(r.days) : '');
    if (note) patch.Notes = (c.Notes ? c.Notes + '\n' : '') + today_() + ': ' + note;
    patchContact_(db, c, patch);
    if (action === 'stop') {
      const sh = ss_().getSheetByName('DoNotContact');
      const ph = phonesOf_(c).map(p => p.local);
      sh.appendRow([c.Email || '', ph[0] || '', 'Asked not to be contacted', today_(), 'zugdeskcrm']);
      if (ph[1]) sh.appendRow(['', ph[1], 'Asked not to be contacted', today_(), 'zugdeskcrm']);
    }
    log_(c, channel || '', r.label, note || '');
}

function api_contacts(q, filter, offset) {
  const s = settings_(), db = loadContacts_(), dnc = dnc_();
  q = String(q || '').trim().toLowerCase();
  let rows = db.rows.map(c => ({ c: c, sc: scoreContact(c, s) }));
  // a search looks through everyone unless a specific filter was picked
  const f = (q && (!filter || filter === 'best')) ? 'all' : (filter || 'best');
  rows = rows.filter(x => {
    const c = x.c, st = c.Status || 'New';
    if (q && (c.Name + ' ' + c.City + ' ' + c.Phone1 + ' ' + c.Phone2 + ' ' + c.Email + ' ' + c.Specialty).toLowerCase().indexOf(q) < 0) return false;
    if (f === 'best') return st === 'New' && !blocked_(c, dnc);
    if (f === 'russian') return (c.Languages || '').indexOf('ר') >= 0 || /רוס/.test(c.Specialty);
    if (f === 'chabad') return x.sc.why.indexOf('Chabad') >= 0;
    if (f === 'talking') return st === 'Talking';
    if (f === 'contacted') return st === 'Contacted';
    if (f === 'later') return st === 'Later';
    if (f === 'closed') return st === 'Closed' || blocked_(c, dnc);
    return true;
  }).sort((a, b) => b.sc.score - a.sc.score);
  const start = offset || 0;
  return { total: rows.length, items: rows.slice(start, start + 40).map(x => card_(x.c, s)) };
}

/**
 * Everyone, once, in a light form for the Contacts screen (filter/sort/search happen on the device).
 * WhatsApp links are built on the device from `wa` / `ask` texts (only referred people need their own text).
 */
function api_directory() {
  const s = settings_(), db = loadContacts_(), dnc = dnc_();
  const wa = {}, ask = {};
  ['HE', 'RU', 'EN'].forEach(l => { wa[l] = waText_({}, s, l); ask[l] = fill_(s['ASK_WA_' + l] || s.ASK_WA_HE, {}); });
  const items = db.rows.filter(c => !isSeparate_(c)).map(c => {
    const card = card_(c, s, true);
    card.blocked = blocked_(c, dnc);
    card.ru = (c.Languages || '').indexOf('ר') >= 0 || /רוס/.test(c.Specialty || '');
    card.type = c.Type || '';
    if (c.ReferredBy) card.waText = waText_(c, s, card.lang);
    return card;
  });
  return { wa: wa, ask: ask, items: items, at: now_() };
}

/** Settings → Separate lists: 'Organization' or 'Other' (light cards, newest contact first). */
function api_separate(type) {
  const s = settings_(), db = loadContacts_();
  return db.rows.filter(c => c.Type === type).map(c => card_(c, s, true))
    .sort((a, b) => String(b.lastContact || '').localeCompare(String(a.lastContact || '')) || String(a.name).localeCompare(String(b.name)));
}

function api_contact(id) {
  const s = settings_(), db = loadContacts_();
  const c = db.rows.find(r => r.ID === id);
  if (!c) throw new Error('Contact not found');
  const card = card_(c, s);
  card.history = api_history(id);
  return card;
}

/** History of one contact (newest first). Reads only the Log sheet, so a card opens fast. */
function api_history(id) {
  return ss_().getSheetByName('Log').getDataRange().getValues().slice(1)
    .filter(r => String(r[1]) === id).map(r => ({ when: str_(r[0]), channel: str_(r[3]), action: str_(r[4]), details: str_(r[5]) })).reverse();
}

function api_saveContact(id, patch) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const db = loadContacts_(); const c = db.rows.find(r => r.ID === id);
    if (!c) throw new Error('Contact not found: ' + id);
    const allowed = {}; ['Notes', 'NextDate', 'Lang', 'Email', 'Boost', 'Helpers', 'Country'].forEach(k => { if (patch[k] !== undefined) allowed[k] = patch[k]; });
    patchContact_(db, c, allowed);
    return api_contact(id);
  } finally { lock.releaseLock(); }
}

/** Add a dated note without changing the status (note box on Today cards). */
function api_addNote(id, note) {
  note = String(note || '').trim(); if (!note) return null;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const db = loadContacts_(); const c = db.rows.find(r => r.ID === id);
    if (!c) throw new Error('Contact not found: ' + id);
    patchContact_(db, c, { Notes: (c.Notes ? c.Notes + '\n' : '') + today_() + ': ' + note });
    log_(c, '', 'Note', note);
    return card_(c, settings_());
  } finally { lock.releaseLock(); }
}

/** Add a recommended shadchan. Duplicates (same phone or email) are linked, not added twice. */
function api_addReferral(byId, data) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const db = loadContacts_();
    const by = byId ? db.rows.find(r => r.ID === byId) : null;
    const byName = by ? by.Name : (data.byName || '');
    const p1 = normPhone_(data.phone), em = String(data.email || '').trim().toLowerCase();
    const dup = db.rows.find(c => (p1 && phonesOf_(c).some(p => p.intl === p1.intl)) || (em && String(c.Email).toLowerCase() === em));
    if (dup) {
      if (byName && (dup.ReferredBy || '').indexOf(byName) < 0)
        patchContact_(db, dup, { ReferredBy: dup.ReferredBy ? dup.ReferredBy + ', ' + byName : byName });
      log_(dup, 'Referral', 'Also recommended', 'by ' + byName);
      return { status: 'linked', id: dup.ID, name: dup.Name };
    }
    const id = nextId_(db);
    const row = C_HEADERS.map(h => ({
      ID: id, Name: data.name || '', City: data.city || '', Phone1: p1 ? p1.local : (data.phone || ''), Phone2: data.phone2 || '', Email: data.email || '',
      Specialty: data.note || '', Languages: data.languages || '', Source: 'Referral', ReferredBy: byName, Status: 'New', Type: 'Shadchan'
    })[h] || '');
    db.sh.appendRow(row);
    log_({ ID: id, Name: data.name }, 'Referral', 'Added', 'recommended by ' + byName);
    if (by) log_(by, 'Referral', 'Recommended someone', data.name || '');
    return { status: 'added', id: id, name: data.name };
  } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ */
/* Import a list (file or pasted table). Match only by exact phone/email. */
/* ------------------------------------------------------------------ */

/** Pure: sorts incoming rows into new / already in list / do-not-contact / skipped. */
function planImport_(rows, existing, dnc) {
  const byPhone = {}, byEmail = {};
  existing.forEach(c => {
    phonesOf_(c).forEach(p => (byPhone[p.intl] = byPhone[p.intl] || c));
    const e = String(c.Email || '').trim().toLowerCase(); if (e) byEmail[e] = byEmail[e] || c;
  });
  const out = { add: [], known: [], blocked: [], skipped: [] }, seenP = {}, seenE = {};
  rows.forEach(r => {
    const ph = [r.phone, r.phone2].map(normPhone_).filter(Boolean);
    const em = validEmail_(r.email) ? String(r.email).trim().toLowerCase() : '';
    const name = String(r.name || '').trim();
    if (!ph.length && !em) return out.skipped.push({ name: name || '(no name)', why: 'no phone or email' });
    if ((em && dnc.emails.has(em)) || ph.some(p => dnc.phones.has(p.intl))) return out.blocked.push({ name: name || em });
    const hit = (em && byEmail[em]) || ph.map(p => byPhone[p.intl]).find(Boolean);
    if (hit) return out.known.push({ id: hit.ID, name: hit.Name, theirName: name, merge: mergePatch_(hit, r, ph, em) });
    if ((em && seenE[em]) || ph.some(p => seenP[p.intl])) return out.skipped.push({ name: name || em, why: 'twice in this list' });
    if (em) seenE[em] = 1; ph.forEach(p => (seenP[p.intl] = 1));
    out.add.push(Object.assign({ Name: name || em, City: String(r.city || '').trim(), Phone1: ph[0] ? ph[0].local : '', Phone2: ph[1] ? ph[1].local : '',
      Email: em, Notes: String(r.notes || '').trim(), Specialty: String(r.specialty || '').trim(), Languages: String(r.languages || '').trim(),
      Lang: ['HE', 'RU', 'EN'].indexOf(String(r.lang || '').trim().toUpperCase()) >= 0 ? String(r.lang).trim().toUpperCase() : '',
      Country: String(r.country || '').trim() }, history_(r)));
  });
  return out;
}

/** Pure: optional history columns of an import row (status / lastcontact / lastchannel / nextdate / needsreply / sourceref). */
const ST_ORDER = { New: 0, Contacted: 1, Later: 2, Talking: 3, Closed: 4 };
function history_(r) {
  const h = {};
  const st = String(r.status || '').trim();
  if (st === 'Contacted' || st === 'Talking') h.Status = st;
  const d = s => /^\d{4}-\d{2}-\d{2}/.test(String(s || '').trim()) ? String(s).trim().slice(0, 16) : '';
  if (d(r.lastcontact)) h.LastContact = d(r.lastcontact);
  if (String(r.lastchannel || '').trim()) h.LastChannel = String(r.lastchannel).trim().slice(0, 40);
  if (d(r.nextdate)) h.NextDate = d(r.nextdate).slice(0, 10);
  if (/^yes$/i.test(String(r.needsreply || '').trim())) h.NeedsReply = 'YES';
  if (String(r.sourceref || '').trim()) h.SourceRef = String(r.sourceref).trim().slice(0, 200);
  return h;
}

/** Pure: what an import row adds to a contact you already have. Never overwrites; notes are appended once. */
function mergePatch_(c, r, ph, em) {
  const patch = {};
  const note = String(r.notes || '').trim();
  if (note && String(c.Notes || '').indexOf(note) < 0) patch.Notes = (c.Notes ? c.Notes + '\n' : '') + note;
  if (em && !String(c.Email || '').trim()) patch.Email = em;
  const have = phonesOf_(c).map(p => p.intl);
  const extra = ph.filter(p => have.indexOf(p.intl) < 0);
  if (extra.length && !String(c.Phone1 || '').trim()) { patch.Phone1 = extra.shift().local; }
  if (extra.length && !String(c.Phone2 || '').trim()) { patch.Phone2 = extra.shift().local; }
  if (r.country && !String(c.Country || '').trim()) patch.Country = String(r.country).trim();
  const lang = String(r.lang || '').trim().toUpperCase();
  if (['HE', 'RU', 'EN'].indexOf(lang) >= 0 && !c.Lang) patch.Lang = lang;
  // history only moves forward: a newer last contact, a status further along, never back
  const h = history_(r);
  if (h.LastContact && h.LastContact > String(c.LastContact || '')) { patch.LastContact = h.LastContact; if (h.LastChannel) patch.LastChannel = h.LastChannel; }
  if (h.Status && (ST_ORDER[h.Status] || 0) > (ST_ORDER[c.Status || 'New'] || 0) && c.Status !== 'Closed') {
    patch.Status = h.Status;
    if (h.NextDate && !c.NextDate) patch.NextDate = h.NextDate;
  }
  if (h.NeedsReply && c.Status !== 'Closed' && c.NeedsReply !== 'YES') patch.NeedsReply = 'YES';
  return patch;
}

/** commit=false → preview only. type: Shadchan / Connector / Other (only Shadchan ever gets outreach). */
function api_import(rows, source, type, commit) {
  source = String(source || '').trim() || 'Import';
  type = TYPES.indexOf(type) >= 0 ? type : 'Other';
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const db = loadContacts_(), plan = planImport_(rows || [], db.rows, dnc_());
    const res = { add: plan.add.length, known: plan.known.length, blocked: plan.blocked.length, skipped: plan.skipped.length,
      sampleAdd: plan.add.slice(0, 8).map(r => r.Name), sampleKnown: plan.known.slice(0, 8).map(k => k.name),
      sampleSkipped: plan.skipped.slice(0, 8).map(k => k.name + ' – ' + k.why) };
    if (!commit) return res;
    const date = today_();
    let n = parseInt(nextId_(db).slice(1), 10);
    const out = plan.add.map(r => {
      const o = Object.assign({ Status: 'New' }, r, { ID: 'C' + String(n++).padStart(4, '0'), Source: source, Type: type });
      o.SourceRef = 'Imported ' + date + (r.SourceRef ? ' · ' + r.SourceRef : '');
      return db.head.map(h => o[h] || '');
    });
    if (out.length) {
      const start = db.sh.getLastRow() + 1;
      db.sh.getRange(start, 1, out.length, db.head.length).setNumberFormat('@').setValues(out);
    }
    let merged = 0;
    plan.known.forEach(k => {
      const c = db.rows.find(x => x.ID === k.id); if (!c) return;
      const patch = Object.assign({}, k.merge);
      if (String(c.SourceRef || '').indexOf(source) < 0) patch.SourceRef = c.SourceRef ? c.SourceRef + ' · also in ' + source : 'Also in ' + source;
      if (Object.keys(k.merge).length) merged++;
      patchContact_(db, c, patch);
    });
    res.merged = merged;
    log_(null, 'Import', 'Imported list', source + ' (' + type + '): ' + out.length + ' added, ' + plan.known.length + ' already in list, ' +
      plan.blocked.length + ' do-not-contact, ' + plan.skipped.length + ' skipped');
    res.done = true; return res;
  } finally { lock.releaseLock(); }
}

/** Drive folder "zugdeskcrm – Import inbox": each CSV named "Source__Type.csv" is imported once, then renamed "Imported …". */
function importInbox_() {
  const it = DriveApp.getFoldersByName('zugdeskcrm – Import inbox');
  if (!it.hasNext()) return;
  const files = it.next().getFiles();
  while (files.hasNext()) {
    const f = files.next(), name = f.getName();
    if (/^Imported /.test(name) || !/\.csv$/i.test(name)) continue;
    const parts = name.replace(/\.csv$/i, '').split('__');
    if (/^settings$/i.test(parts[1] || '')) {
      try { const n = applySettings_(csvRows_(f.getBlob().getDataAsString('UTF-8')), parts[0]); f.setName('Imported ' + today_() + ' – ' + name + ' – ' + n + ' settings updated'); }
      catch (e) { log_(null, 'Import', 'Import inbox error', name + ': ' + e); }
      continue;
    }
    if (/^donotcontact$/i.test(parts[1] || '')) {
      try { const n = addDoNotContact_(csvRows_(f.getBlob().getDataAsString('UTF-8')), parts[0]); f.setName('Imported ' + today_() + ' – ' + name + ' – ' + n + ' added to Do-not-contact'); }
      catch (e) { log_(null, 'Import', 'Import inbox error', name + ': ' + e); }
      continue;
    }
    try {
      const res = api_import(csvRows_(f.getBlob().getDataAsString('UTF-8')), parts[0], parts[1] || 'Other', true);
      f.setName('Imported ' + today_() + ' – ' + name + ' – ' + res.add + ' added, ' + res.known + ' known (' + (res.merged || 0) + ' updated), ' + res.blocked + ' blocked, ' + res.skipped + ' skipped');
    } catch (e) { log_(null, 'Import', 'Import inbox error', name + ': ' + e); }
  }
}

/** Texts Claude may update from the chat (profile, message templates…). The old value is kept in the Log. */
const TEXT_KEYS = /^(PROFILE|REFERENCES|WA_INTRO|EMAIL_SUBJECT|EMAIL_BODY|EMAIL_FOLLOWUP|ASK_WA|ASK_EMAIL|ASK_SUBJECT|SOURCE_DIRECTORY|SOURCE_REFERRAL|CONTACT_LINE)_(HE|RU|EN)$|^(CALL_SCRIPT|SENDER_NAME|MY_PHONE|MY_WHATSAPP|WA_INCLUDE_PROFILE)$/;
function applySettings_(rows, source) {
  const s = settings_(); let n = 0;
  rows.forEach(r => {
    const k = String(r.key || '').trim(), v = String(r.value == null ? '' : r.value).replace(/\r\n/g, '\n');
    if (!TEXT_KEYS.test(k) || s[k] === v) return;
    log_(null, 'Settings', 'Changed ' + k, 'from ' + source + '. Old value: ' + (s[k] || '(empty)'));
    setSetting_(k, v); n++;
  });
  return n;
}

/** Adds rows (email / phone / reason) to DoNotContact, skipping ones already there. */
function addDoNotContact_(rows, source) {
  const dnc = dnc_(), sh = ss_().getSheetByName('DoNotContact');
  let n = 0;
  rows.forEach(r => {
    const em = validEmail_(r.email) ? String(r.email).trim().toLowerCase() : '';
    const p = normPhone_(r.phone);
    if ((!em || dnc.emails.has(em)) && (!p || dnc.phones.has(p.intl))) return;
    sh.appendRow([em, p ? p.local : '', String(r.reason || 'Asked not to be contacted').slice(0, 300), today_(), source || 'Import']);
    if (em) dnc.emails.add(em); if (p) dnc.phones.add(p.intl);
    n++;
  });
  log_(null, 'Import', 'Do-not-contact list', source + ': ' + n + ' added');
  return n;
}

/** Pure: CSV text (with header row) → array of objects with lower-case keys. */
function csvRows_(text) {
  const t = String(text).replace(/^﻿/, ''), out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(Boolean)) out.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(Boolean)) out.push(row);
  const head = (out.shift() || []).map(h => h.trim().toLowerCase());
  return out.map(r => { const o = {}; head.forEach((h, i) => (o[h] = r[i] || '')); return o; });
}

function nextId_(db) {
  const n = db.rows.map(c => parseInt(String(c.ID).replace(/\D/g, ''), 10) || 0).reduce((a, b) => Math.max(a, b), 0);
  return 'C' + String(n + 1).padStart(4, '0');
}

function api_received() {
  const vals = ss_().getSheetByName('Received').getDataRange().getValues();
  return vals.slice(1).map((r, i) => ({ row: i + 2, when: str_(r[0]), contactId: str_(r[1]), from: str_(r[2]), channel: str_(r[3]),
    what: str_(r[4]), link: str_(r[5]), imported: str_(r[6]) === 'YES', notes: str_(r[7]) })).reverse();
}
function api_addReceived(d) {
  ss_().getSheetByName('Received').appendRow([now_(), d.contactId || '', d.from || '', d.channel || '', d.what || '', d.link || '', '', d.notes || '']);
  return api_received();
}
function api_markReceived(row, imported) {
  ss_().getSheetByName('Received').getRange(row, 7).setValue(imported ? 'YES' : '');
  return api_received();
}

function api_status() {
  const s = settings_(), db = loadContacts_();
  const t = today_();
  const props = PropertiesService.getScriptProperties();
  const queue = db.rows.filter(c => (c.Status || 'New') === 'New' && validEmail_(c.Email) && !c.EmailStatus).length;
  const by = k => db.rows.filter(c => c.EmailStatus === k).length;
  return {
    autoEmail: String(s.AUTO_EMAIL).toUpperCase() === 'ON',
    sentToday: parseInt(props.getProperty('sent_' + t) || '0', 10),
    perDay: capToday_(s), perDayMax: num_(s, 'EMAILS_PER_DAY_MAX', 40), days: s.EMAIL_DAYS, hours: s.EMAIL_START_HOUR + ':00–' + s.EMAIL_END_HOUR + ':00',
    queue: queue, sent: by('Sent'), followedUp: by('Followed up'), replied: by('Replied'), bounced: by('Bounced'),
    bouncesToday: parseInt(props.getProperty('bounce_' + t) || '0', 10), pausedReason: props.getProperty('paused_reason') || props.getProperty('send_problem') || '',
    lastRun: props.getProperty('last_run') || '', me: me_(), sheetUrl: ss_().getUrl()
  };
}

/** Pure: today's email limit. Week 1 = start, week 2 = 2×start … up to max. */
function emailCap_(start, max, ramp, since, today) {
  if (!ramp || !since) return Math.min(start, max || start);
  const days = Math.max(0, Math.floor((Date.parse(today) - Date.parse(since)) / 864e5));
  return Math.min(max, start * (1 + Math.floor(days / 7)));
}
function capToday_(s) {
  return emailCap_(num_(s, 'EMAILS_PER_DAY', 10), num_(s, 'EMAILS_PER_DAY_MAX', 40), String(s.EMAIL_RAMP).toUpperCase() !== 'NO',
    PropertiesService.getScriptProperties().getProperty('auto_since') || '', today_());
}

function api_setAutopilot(on) {
  setSetting_('AUTO_EMAIL', on ? 'ON' : 'OFF');
  const pp = PropertiesService.getScriptProperties();
  if (on && !pp.getProperty('auto_since')) pp.setProperty('auto_since', today_());   // the weekly increase counts from the first day
  if (on) PropertiesService.getScriptProperties().deleteProperty('paused_reason');
  ensureTrigger_();
  PropertiesService.getScriptProperties().deleteProperty('plan_' + today_());
  return api_status();
}

function api_testEmail() {
  const s = settings_();
  const me = Session.getEffectiveUser().getEmail();
  const fake = { Name: 'Test', Languages: 'ע,ר', ReferredBy: '' };
  ['HE', 'RU'].forEach(lang => {
    const m = composeEmail_(fake, s, lang, false);
    GmailApp.sendEmail(me, '[TEST] ' + m.subject, m.body, { name: s.SENDER_NAME, htmlBody: toHtml_(m.body, lang, waOk_(s)) });
  });
  log_(null, 'Email', 'Test email', 'sent to ' + me);
  return 'Two test emails (Hebrew and Russian) sent to ' + me;
}

/** Everything in the Settings tab, grouped (for the in-app Messages and Settings screens). */
function api_settingsAll() {
  return { sections: settingsSections_(ss_().getSheetByName('Settings').getDataRange().getValues()) };
}

const PLAN_KEYS = /^(CALLS_PER_DAY|WA_PER_DAY|CHECKINS_PER_DAY|MAX_ATTEMPTS|W_\w+|MY_AGE|MY_CITY|NEAR_CITIES|CHABAD_CITIES|RUSSIAN_FOR_RUSSIAN_SPEAKERS|SKIP_ZUGDESK)$/;
/** Save changed settings from the app. The old value of each is kept in the Log. AUTO_EMAIL only changes through the autopilot button. */
function api_saveSettings(changes) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName('Settings');
    const p = settingsPatch_(sh.getDataRange().getValues(), changes || {});
    p.writes.forEach(w => sh.getRange(w.row, 2).setValue(w.value));
    p.appends.forEach(w => sh.appendRow([w.key, w.value, '']));
    const all = p.writes.concat(p.appends);
    all.forEach(w => log_(null, 'Settings', 'Changed ' + w.key, 'from the app. Old value: ' + (w.old || '(empty)')));
    if (all.some(w => PLAN_KEYS.test(w.key))) PropertiesService.getScriptProperties().deleteProperty('plan_' + today_());
    return { saved: all.length, skipped: p.skipped };
  } finally { lock.releaseLock(); }
}

/** Exactly what a shadchan would receive, for one language. `draft` = unsaved edits (key → text); `referredBy` shows the "referred" version. */
function api_previewMessages(lang, draft, referredBy) {
  lang = ['HE', 'RU', 'EN'].indexOf(lang) >= 0 ? lang : 'HE';
  const s = Object.assign(settings_(), draft || {});
  const fake = { Name: 'Test', Languages: 'ע,ר', ReferredBy: String(referredBy || '') };
  const out = { lang: lang };
  [['email', false], ['followup', true]].forEach(a => {
    try { const m = composeEmail_(fake, s, lang, a[1]); out[a[0]] = { subject: m.subject, html: toHtml_(m.body, lang, waOk_(s)) }; }
    catch (e) { out[a[0]] = { error: String(e.message || e) }; }
  });
  out.wa = waText_(fake, s, lang);
  return out;
}

function api_checkNow() { runJob_(scanReplies_); return api_status(); }

/* ------------------------------------------------------------------ */
/* Email autopilot (hourly trigger)                                    */
/* ------------------------------------------------------------------ */

function hourlyJob() {
  runJob_(() => {
    try { importInbox_(); } catch (e) { log_(null, 'Import', 'Import inbox error', String(e)); }
    scanReplies_(); sendBatch_();
    try { helperSync_(true); } catch (e) { log_(null, 'Helpers', 'Helper sync error', String(e).slice(0, 200)); }
  });
}

/** Runs Gmail work at most once at a time, WITHOUT the script lock (taps in the app use that lock). */
function runJob_(fn) {
  const p = PropertiesService.getScriptProperties();
  const started = parseInt(p.getProperty('job_running') || '0', 10);
  if (started && Date.now() - started < 10 * 60e3) return false;   // another run is still busy
  p.setProperty('job_running', String(Date.now()));
  try {
    schema_();
    p.setProperty('last_run', now_());
    fn();
    return true;
  } finally { p.deleteProperty('job_running'); }
}

/** MY_WHATSAPP: YES (default, every number) / NO / your WhatsApp number (only that one opens WhatsApp). */
function waOk_(s) {
  const v = String(s.MY_WHATSAPP || 'YES').trim();
  if (/^yes$/i.test(v)) return true;
  if (/^no$/i.test(v)) return false;
  const p = normPhone_(v); return p ? p.intl : false;
}

function composeEmail_(c, s, lang, followup) {
  const rawPhone = String(s.MY_PHONE || '').trim(), np = normPhone_(rawPhone);
  const myPhone = np ? (np.intl.startsWith('1') ? '1-' + np.local.slice(3) : np.local) : rawPhone;   // no plus signs; in the email it becomes a tap-to-WhatsApp link
  let contact = {
    HE: myPhone ? 'אפשר להשיב למייל הזה או לכתוב לי בוואטסאפ: ' + myPhone : 'אפשר פשוט להשיב למייל הזה.',
    RU: myPhone ? 'Можно ответить на это письмо или написать мне в WhatsApp: ' + myPhone : 'Можно просто ответить на это письмо.',
    EN: myPhone ? 'You can reply to this email or message me on WhatsApp: ' + myPhone : 'You can simply reply to this email.'
  }[lang];
  if (s['CONTACT_LINE_' + lang]) contact = fill_(s['CONTACT_LINE_' + lang], { phone: myPhone });   // your own wording (Settings)
  const map = { source_line: sourceLine_(c, s, lang), profile: s['PROFILE_' + lang] || s.PROFILE_HE, contact_line: contact, sender: s.SENDER_NAME };
  const subject = fill_(s['EMAIL_SUBJECT_' + lang] || s.EMAIL_SUBJECT_HE, map);
  const body = fill_(followup ? (s['EMAIL_FOLLOWUP_' + lang] || s.EMAIL_FOLLOWUP_HE) : (s['EMAIL_BODY_' + lang] || s.EMAIL_BODY_HE), map);
  if (subject.trim().length < 5 || body.trim().length < 40)
    throw new Error('Email template is empty or too short (' + (followup ? 'EMAIL_FOLLOWUP_' : 'EMAIL_BODY_') + lang + ' / EMAIL_SUBJECT_' + lang + ') — check the Settings tab');
  return { subject: followup ? 'Re: ' + subject : subject, body: body };
}

/** Follow-up as a reply inside the first email's thread. Returns the sent message, or null to fall back to a new email. */
function replyInThread_(c, m, lang, s) {
  const tid = (c.EmailThreadIds || '').split(',').filter(Boolean)[0];
  if (!tid) return null;
  try {
    const msgs = GmailApp.getThreadById(tid).getMessages();
    const d = msgs[msgs.length - 1].createDraftReplyAll(m.body, { name: s.SENDER_NAME, htmlBody: toHtml_(m.body, lang, waOk_(s)) });
    if (String(d.getMessage().getTo()).toLowerCase().indexOf(c.Email.trim().toLowerCase()) >= 0) return d.send();
    d.deleteDraft();
  } catch (e) {}
  return null;
}

function sendBatch_() {
  const s = settings_();
  if (String(s.AUTO_EMAIL).toUpperCase() !== 'ON') return;
  const now = new Date();
  const day = Utilities.formatDate(now, TZ, 'EEE');          // Sun, Mon, ...
  const hour = parseInt(Utilities.formatDate(now, TZ, 'H'), 10);
  if (list_(s, 'EMAIL_DAYS').indexOf(day) < 0) return;
  if (list_(s, 'SKIP_DATES').indexOf(today_()) >= 0) return;   // Yom Tov / fast days
  if (hour < num_(s, 'EMAIL_START_HOUR', 9) || hour >= num_(s, 'EMAIL_END_HOUR', 19)) return;

  const props = PropertiesService.getScriptProperties();
  const key = 'sent_' + today_();
  let sentToday = parseInt(props.getProperty(key) || '0', 10);
  const cap = capToday_(s);
  // spread the day's emails over the remaining hours
  const hoursLeft = Math.max(1, num_(s, 'EMAIL_END_HOUR', 19) - hour);
  let budget = Math.min(cap - sentToday, Math.ceil((cap - sentToday) / hoursLeft));
  if (budget <= 0) return;
  const bounces = parseInt(props.getProperty('bounce_' + today_()) || '0', 10);
  if (bounces >= num_(s, 'MAX_BOUNCES_PER_DAY', 5)) {
    setSetting_('AUTO_EMAIL', 'OFF');
    props.setProperty('paused_reason', 'Paused automatically on ' + now_() + ': ' + bounces +
      ' emails failed today. Check the failed addresses, then turn the autopilot on again.');
    log_(null, 'Email', 'Autopilot paused', bounces + ' failed emails today');
    return;
  }

  const db = loadContacts_(), dnc = dnc_(), busy = helperBusy_();
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const t = today_();
  const fuDays = num_(s, 'FOLLOWUP_DAYS', 8);

  // 1) one gentle follow-up to people who haven't written back
  const followups = db.rows.filter(c => c.EmailStatus === 'Sent' && c.Status === 'Contacted' && c.LastChannel === 'Email' && c.NeedsReply !== 'YES' && isShadchan_(c)
    && c.EmailSentAt && c.EmailSentAt.slice(0, 10) <= addDays_(-fuDays) && !blocked_(c, dnc) && validEmail_(c.Email));
  // 2) new emails, best leads first
  const fresh = db.rows.filter(c => (c.Status || 'New') === 'New' && isShadchan_(c) && !c.EmailStatus && validEmail_(c.Email) && !blocked_(c, dnc) && !busy.has(c.ID)
    && !(String(s.SKIP_ZUGDESK).toUpperCase() === 'YES' && c.InZugDesk === 'YES'))
    .map(c => ({ c: c, sc: scoreContact(c, s).score })).sort((a, b) => b.sc - a.sc).map(x => x.c);

  const queue = followups.map(c => ({ c: c, fu: true })).concat(fresh.map(c => ({ c: c, fu: false })));
  for (const item of queue) {
    if (budget <= 0) break;
    const c = item.c, lang = pickLang_(c, s);
    try {
      const m = composeEmail_(c, s, lang, item.fu);
      const msg = (item.fu && replyInThread_(c, m, lang, s)) ||
        GmailApp.createDraft(c.Email.trim(), m.subject, m.body, { name: s.SENDER_NAME, htmlBody: toHtml_(m.body, lang, waOk_(s)) }).send();
      const th = msg.getThread(); th.addLabel(label);
      const ids = c.EmailThreadIds ? c.EmailThreadIds.split(',') : [];
      if (ids.indexOf(th.getId()) < 0) ids.push(th.getId());
      if (item.fu) {
        patchContact_(db, c, { EmailStatus: 'Followed up', EmailFollowupAt: now_(), EmailThreadIds: ids.join(','), LastContact: now_(), LastChannel: 'Email' });
        log_(c, 'Email', 'Follow-up email sent', lang);
      } else {
        patchContact_(db, c, { EmailStatus: 'Sent', EmailSentAt: now_(), EmailThreadIds: ids.join(','), Status: 'Contacted',
          LastContact: now_(), LastChannel: 'Email', NextDate: addDays_(fuDays + 6) });
        log_(c, 'Email', 'Email sent', lang);
      }
      sentToday++; budget--; props.setProperty(key, String(sentToday));
      props.deleteProperty('send_problem');
    } catch (e) {
      const err = String(e);
      log_(c, 'Email', 'Send error', err.slice(0, 200));
      if (/invalid (email|argument)/i.test(err)) { patchContact_(db, c, { EmailStatus: 'Error' }); continue; }   // only this address is bad
      // quota, Gmail outage or a Settings problem: stop now, nobody is marked, next hour tries again
      props.setProperty('send_problem', 'Sending stopped on ' + now_() + ': ' + err.slice(0, 160) + ' — it will try again next hour.');
      break;
    }
  }
}

const STOP_WORDS = /(^|[\s.,!?"'׳״()-])(הסר|הסירו|להסיר|תסיר|תסירו)($|[\s.,!?"'׳״()-])|לא שדכנית|לא שדכן|לא עוסק|לא עוסקת|unsubscribe|remove me|please remove|not a shadchan|no longer|удал|отпис|не пишите/i;

function bumpBounce_() {
  const p = PropertiesService.getScriptProperties(), k = 'bounce_' + today_();
  p.setProperty(k, String((parseInt(p.getProperty(k) || '0', 10)) + 1));
}

/** Out-of-office / automatic replies (pure; tested with node). */
function isAutoReply_(headers, subject) {
  if (/auto-replied|auto-generated|^yes$/i.test(String(headers || '').trim())) return true;
  return /out of office|automatic reply|auto.?reply|autoreply|vacation|מענה אוטומטי|תשובה אוטומטית|אני לא נמצא|Автоответ|Автоматический ответ/i.test(String(subject || ''));
}
function addr_(from) { const m = String(from).match(/<([^>]+)>/); return (m ? m[1] : String(from)).trim().toLowerCase(); }

function scanReplies_() {
  const db = loadContacts_(), s = settings_();
  const me = me_();
  const watch = db.rows.filter(c => c.EmailThreadIds && ['Sent', 'Followed up', 'Replied', 'Asked'].indexOf(c.EmailStatus) >= 0);
  const byThread = {}, byEmail = {};
  watch.forEach(c => {
    c.EmailThreadIds.split(',').filter(Boolean).forEach(t => (byThread[t] = c));
    if (validEmail_(c.Email)) byEmail[c.Email.trim().toLowerCase()] = c;
  });
  if (watch.length) {
    // one search: everything from other people in the last 3 days (covers replies in our threads AND brand-new emails)
    const threads = GmailApp.search('newer_than:3d -from:me', 0, 200);
    const all = threads.length ? GmailApp.getMessagesForThreads(threads) : [];
    const found = new Map();
    threads.forEach((th, i) => {
      const tid = th.getId();
      let c = byThread[tid];
      if (!c) {
        const m = all[i].find(x => byEmail[addr_(x.getFrom())]);
        if (!m) return;
        c = byEmail[addr_(m.getFrom())];
        patchContact_(db, c, { EmailThreadIds: c.EmailThreadIds + ',' + tid });
        byThread[tid] = c;
      }
      if (!found.has(c)) found.set(c, []);
      found.get(c).push.apply(found.get(c), all[i]);
    });
    if (found.size) {
      const folder = receivedFolder_(), recv = ss_().getSheetByName('Received');
      found.forEach((msgs, c) => {
        const lastSeen = c.EmailLastSeen || c.EmailSentAt || '';
        let newest = lastSeen, gotReply = false, bounced = false, stopHint = false, preview = '';
        msgs.forEach(m => {
          const when = Utilities.formatDate(m.getDate(), TZ, 'yyyy-MM-dd HH:mm');
          if (when <= lastSeen) return;
          const from = m.getFrom().toLowerCase();
          if (from.indexOf(me) >= 0) return;
          if (when > newest) newest = when;
          if (/mailer-daemon|postmaster/.test(from)) { bounced = true; return; }
          let h = ''; try { h = m.getHeader('Auto-Submitted') || m.getHeader('X-Autoreply') || ''; } catch (e) {}
          if (isAutoReply_(h, m.getSubject())) return;   // out-of-office is not a real answer
          gotReply = true;
          const own = ownText_(m.getPlainBody() || '', s);
          preview = own.slice(0, 200);
          if (STOP_WORDS.test(own.slice(0, 600))) stopHint = true;
          saveSuggestions_(c, extractPeople(own, excludeFor_(c, s)), db);
          m.getAttachments({ includeInlineImages: false }).forEach(a => {
            const f = folder.createFile(a.copyBlob()).setName(c.Name + ' – ' + a.getName());
            recv.appendRow([now_(), c.ID, c.Name, 'Email', 'Attachment: ' + a.getName(), f.getUrl(), '', '']);
          });
        });
        if (bounced && !gotReply) {
          bumpBounce_();
          patchContact_(db, c, { EmailStatus: 'Bounced', EmailLastSeen: newest, Status: c.Status === 'Contacted' ? 'New' : c.Status });
          log_(c, 'Email', 'Email bounced', 'moved back to phone/WhatsApp list');
        } else if (gotReply) {
          patchContact_(db, c, { EmailStatus: 'Replied', EmailLastSeen: newest, NeedsReply: 'YES', Status: 'Talking', NextDate: today_() });
          log_(c, 'Email', stopHint ? 'Wrote back – may be asking to stop' : 'Wrote back', preview);
        } else if (newest > lastSeen) {
          patchContact_(db, c, { EmailLastSeen: newest });
        }
      });
    }
  }
  scanBounces_(db);
}

/** Bounce notices often arrive as separate messages; match them to contacts by address. */
function scanBounces_(db) {
  const seen = GmailApp.getUserLabelByName(LABEL + '/bounce-seen') || GmailApp.createLabel(LABEL + '/bounce-seen');
  const threads = GmailApp.search('from:(mailer-daemon OR postmaster) newer_than:5d -label:' + LABEL + '-bounce-seen', 0, 30);
  threads.forEach(th => {
    if (th.getLabels().some(l => l.getName() === seen.getName())) return;
    const text = th.getMessages().map(m => m.getPlainBody()).join('\n').toLowerCase();
    db.rows.filter(c => validEmail_(c.Email) && ['Sent', 'Followed up'].indexOf(c.EmailStatus) >= 0 && text.indexOf(c.Email.toLowerCase()) >= 0)
      .forEach(c => {
        bumpBounce_();
        patchContact_(db, c, { EmailStatus: 'Bounced', Status: c.Status === 'Contacted' ? 'New' : c.Status });
        log_(c, 'Email', 'Email bounced', 'moved back to phone/WhatsApp list');
      });
    th.addLabel(seen);
  });
}

/* ------------------------------------------------------------------ */
/* Helpers: friends/family call shadchanim with a personal link.       */
/* Their app (folder helper/) only sees its own sheet; this app writes */
/* the List there and reads back Reservations + Results.               */
/* ------------------------------------------------------------------ */

const HELPER_URL = 'https://script.google.com/macros/s/AKfycbxjzT6OUMaH1CIajHS09t53rN7A-XYc0cX6fTv9KSZoMMOWy6pg1vhPuUpHuxTMV8Sh/exec';
const H_TABS = {
  Helpers: ['Name', 'Key', 'Active', 'Show', 'Lang', 'Added'],
  List: ['ID', 'Name', 'City', 'Languages', 'Hours', 'Phone1', 'Tel1', 'Mobile1', 'Phone2', 'Tel2', 'Mobile2', 'Specialty', 'Why', 'For'],
  Reservations: ['ContactID', 'Helper', 'At', 'State'],
  Results: ['When', 'Helper', 'ContactID', 'Name', 'Result', 'Next', 'Notes', 'Names'],
  Texts: ['Key', 'Value', 'Explanation'],
  Config: ['Key', 'Value']
};
/** Helper result → result in this app. */
const HELPER_ACTIONS = { spoke: 'spoke', noanswer: 'noreach', callback: 'callback', wrong: 'wrong', inactive: 'inactive', stop: 'stop' };
const HELPER_NEXT = { profile: 'wants Eliyahu\'s details', call: 'wants Eliyahu to call' };

function helperSS_() {
  const id = PropertiesService.getScriptProperties().getProperty('HELPER_SS_ID');
  if (!id) return null;
  try { return SpreadsheetApp.openById(id); } catch (e) { return null; }
}
function helperUrl_() { return settings_().HELPER_URL || HELPER_URL; }
function hTime_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }

/** Pure: who helpers may call, best first. skip = IDs you are handling yourself today. */
function helperPool_(rows, s, isBlocked, skip, today) {
  return rows.filter(c => {
    if (!isShadchan_(c) || isBlocked(c) || skip.has(c.ID) || !phonesOf_(c).length) return false;
    if (/^only me$/i.test(String(c.Helpers || '').trim())) return false;
    const st = c.Status || 'New';
    if (st === 'New') return true;
    // a helper's "no answer / call back later" comes back to the helpers when it is due
    return st === 'Contacted' && /^Helper/.test(c.LastChannel || '') && c.NeedsReply !== 'YES' && (!c.NextDate || c.NextDate <= today);
  }).map(c => ({ c: c, sc: scoreContact(c, s) })).sort((a, b) => b.sc.score - a.sc.score).map(x => {
    const ph = phonesOf_(x.c);
    const p = i => ph[i] ? [ph[i].local, '+' + ph[i].intl, ph[i].mobile ? 'YES' : ''] : ['', '', ''];
    return [x.c.ID, x.c.Name, x.c.City, x.c.Languages, x.c.Hours].concat(p(0), p(1), [x.c.Specialty, x.sc.why.join(' · '), x.c.Helpers || '']);
  });
}

/** Pure: the note a helper's result leaves on the contact. */
function helperNote_(r) {
  return ['[' + r.helper + ']', r.notes, HELPER_NEXT[r.next] ? '→ ' + HELPER_NEXT[r.next] : '', r.names ? 'Names given: ' + r.names : '']
    .filter(Boolean).join(' ').trim();
}

/** Contacts a helper is calling right now, or whose result is not yet in this app. Cached 2 minutes. */
function helperBusy_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('helper_busy');
  if (hit !== null) return new Set(hit ? hit.split(',') : []);
  const ids = [];
  const hs = helperSS_();
  if (hs) {
    const dayAgo = Utilities.formatDate(new Date(Date.now() - 864e5), TZ, 'yyyy-MM-dd HH:mm:ss');
    hs.getSheetByName('Reservations').getDataRange().getValues().slice(1)
      .forEach(r => { if (String(r[3]) === 'Active' && str_(r[2]) >= dayAgo) ids.push(String(r[0])); });
    const done = parseInt(PropertiesService.getScriptProperties().getProperty('helper_synced') || '0', 10);
    hs.getSheetByName('Results').getDataRange().getValues().slice(1 + done).forEach(r => ids.push(String(r[2])));
  }
  cache.put('helper_busy', ids.join(','), 120);
  return new Set(ids);
}

function helperNames_() {
  const hs = helperSS_(); if (!hs) return [];
  return hs.getSheetByName('Helpers').getDataRange().getValues().slice(1).map(r => str_(r[0])).filter(Boolean);
}

/** Brings helpers' results into Contacts; then (if asked or anything changed) rewrites the helpers' List. */
function helperSync_(rebuildList) {
  const hs = helperSS_(); if (!hs) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    let done = parseInt(props.getProperty('helper_synced') || '0', 10);
    const res = hs.getSheetByName('Results').getDataRange().getValues().slice(1);
    const s = settings_(), db = loadContacts_();
    let applied = 0;
    for (let i = done; i < res.length; i++) {
      const r = { when: str_(res[i][0]), helper: str_(res[i][1]), id: str_(res[i][2]), result: str_(res[i][4]), next: str_(res[i][5]), notes: str_(res[i][6]), names: str_(res[i][7]) };
      const c = db.rows.find(x => x.ID === r.id), action = HELPER_ACTIONS[r.result];
      if (c && action) {
        applyResult_(s, db, c, action, 'Helper: ' + r.helper, helperNote_(r));
        if (action === 'spoke' && HELPER_NEXT[r.next]) patchContact_(db, c, { NeedsReply: 'YES', NextDate: today_() });
        if (r.names) saveSuggestions_(c, extractPeople(r.names, excludeFor_(c, s)), db);
      }
      props.setProperty('helper_synced', String(i + 1));
      applied++;
    }
    if (applied) CacheService.getScriptCache().remove('helper_busy');
    const last = props.getProperty('helper_built') || '';
    if (rebuildList || applied || last < Utilities.formatDate(new Date(Date.now() - 15 * 60e3), TZ, 'yyyy-MM-dd HH:mm:ss')) helperRebuild_(hs, s, db);
  } finally { lock.releaseLock(); }
}

function helperRebuild_(hs, s, db) {
  const dnc = dnc_();
  const plan = JSON.parse(PropertiesService.getScriptProperties().getProperty('plan_' + today_()) || '{"call":[],"wa":[]}');
  const skip = new Set(plan.call.concat(plan.wa));
  db.rows.forEach(c => { if ((c.LastContact || '').slice(0, 10) === today_() && !/^Helper/.test(c.LastChannel || '')) skip.add(c.ID); });
  const rows = helperPool_(db.rows, s, c => blocked_(c, dnc), skip, today_());
  const sh = hs.getSheetByName('List');
  const w = H_TABS.List.length;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, w).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, w).setValues(rows);
  try { helperTranslate_(hs, rows); } catch (e) { console.log('translate: ' + e); }   // never blocks the list
  const at = hTime_();
  const np = normPhone_(String(s.MY_PHONE || '').trim()), ph = np ? np.local : String(s.MY_PHONE || '').trim();   // Israeli number (calls)
  const prof = (lang, label) => (s['PROFILE_' + lang] || '') + (s['PROFILE_' + lang] && ph ? '\n\n' + label + ph : '');
  hSet_(hs, { BuiltAt: at, PROFILE_HE: prof('HE', 'טלפון של אליהו: '), PROFILE_RU: prof('RU', 'Телефон Элияху: '), PROFILE_EN: prof('EN', "Eliyahu's phone: ") });
  PropertiesService.getScriptProperties().setProperty('helper_built', at);
}

/** Pure: the texts of List rows a helper may want translated (name, city, specialty, each why chip). */
function helperTexts_(rows) {
  const out = new Set();
  rows.forEach(r => { [r[1], r[2], r[11]].concat(String(r[12] || '').split(' · ')).forEach(x => { x = String(x || '').trim(); if (x) out.add(x); }); });
  return Array.from(out);
}

/** Machine translation to Russian + English, kept in the helpers' sheet tab "Tr" (each text translated once, max 150 per run). */
function helperTranslate_(hs, rows) {
  let sh = hs.getSheetByName('Tr');
  if (!sh) { sh = hs.insertSheet('Tr'); sh.getRange(1, 1, 1, 3).setValues([['Text', 'RU', 'EN']]); sh.setFrozenRows(1); sh.hideSheet(); }
  const have = new Set(sh.getDataRange().getValues().slice(1).map(r => String(r[0])));
  const todo = helperTexts_(rows).filter(x => !have.has(x)).slice(0, 150), add = [], t0 = Date.now();
  for (const x of todo) {
    if (Date.now() - t0 > 60e3) break;
    try { add.push([x, LanguageApp.translate(x, '', 'ru'), LanguageApp.translate(x, '', 'en')]); } catch (e) { break; }   // quota: try next run
  }
  if (add.length) { sh.getRange(sh.getLastRow() + 1, 1, add.length, 3).setNumberFormat('@').setValues(add); }
}

function hSet_(hs, map) {
  const sh = hs.getSheetByName('Config');
  const vals = sh.getDataRange().getValues();
  Object.keys(map).forEach(k => {
    const i = vals.findIndex(r => String(r[0]) === k);
    if (i > 0) sh.getRange(i + 1, 2).setValue(map[k]); else { sh.appendRow([k, map[k]]); vals.push([k, map[k]]); }
  });
}

/** You took care of someone yourself → hide them from helpers at once (if they were on the List). */
function helperHide_(id) {
  const plan = PropertiesService.getScriptProperties().getProperty('plan_' + today_()) || '';
  if (plan.indexOf('"' + id + '"') >= 0) return;   // today's people are never on the helpers' list
  const hs = helperSS_(); if (!hs) return;
  const sh = hs.getSheetByName('List');
  const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (let i = ids.length - 1; i >= 1; i--) if (String(ids[i][0]) === id) sh.deleteRow(i + 1);
}

const H_TEXTS = [
  ['SCRIPT_RU', 'Здравствуйте, меня зовут {helper}. Я звоню от имени Элияху Кахановича: ему 41 год, Хабад, живёт в Цфате, ищет шидух. Вы ещё занимаетесь шидухами? Как вам удобнее получить его данные?', 'What helpers say (Russian). {helper} = the helper\'s name.'],
  ['SCRIPT_HE', 'שלום, מדבר/ת {helper}. אני מתקשר/ת בשם אליהו כהנוביץ\' – בן 41, חב"ד, גר בצפת, מחפש שידוך. רציתי לשאול אם את/ה עדיין עוסק/ת בשידוכים, ואיך הכי נוח לשלוח לך את הפרטים שלו?', 'What helpers say (Hebrew).'],
  ['SCRIPT_EN', 'Hello, my name is {helper}. I\'m calling for Eliyahu Kahanovich: 41, Chabad, lives in Tzfat, looking for a shidduch. Are you still active as a shadchan? What is the best way to send you his details?', 'What helpers say (English).'],
  ['(any label)', '', 'To change any word on the helpers\' page, add a row with its key + _RU / _HE / _EN (e.g. res_spoke_RU). Ask Claude for the key.']
];

/** One-time: creates the helpers' sheet (its own file; the helper app can only see that file). */
function api_helpersSetup() {
  const props = PropertiesService.getScriptProperties();
  let hs = helperSS_();
  if (!hs) { hs = SpreadsheetApp.create('zugdeskcrm – Helpers'); props.setProperty('HELPER_SS_ID', hs.getId()); }
  Object.keys(H_TABS).forEach(n => {
    let sh = hs.getSheetByName(n);
    if (!sh) sh = hs.insertSheet(n);
    if (!sh.getRange(1, 1).getValue()) { sh.getRange(1, 1, 1, H_TABS[n].length).setValues([H_TABS[n]]); sh.setFrozenRows(1); }
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
  });
  const first = hs.getSheetByName('Sheet1'); if (first && hs.getSheets().length > 1) hs.deleteSheet(first);
  const tx = hs.getSheetByName('Texts');
  const have = tx.getDataRange().getValues().map(r => String(r[0]));
  H_TEXTS.forEach(r => { if (have.indexOf(r[0]) < 0) tx.appendRow(r); });
  helperSync_(true);
  return api_helpers();
}

function api_helpers() {
  const hs = helperSS_();
  if (!hs) return { ready: false };
  const url = helperUrl_();
  const helpers = hs.getSheetByName('Helpers').getDataRange().getValues().slice(1).filter(r => r[0]).map((r, i) => ({
    row: i + 2, name: str_(r[0]), active: str_(r[2]) !== 'NO', show: str_(r[3]) || 'All', lang: str_(r[4]) || 'HE',
    link: url ? url + '?k=' + str_(r[1]) : ''
  }));
  const results = hs.getSheetByName('Results').getDataRange().getValues().slice(1).slice(-15).reverse()
    .map(r => ({ when: str_(r[0]).slice(0, 16), helper: str_(r[1]), id: str_(r[2]), name: str_(r[3]), result: str_(r[4]), notes: str_(r[6]) }));
  const busy = helperBusy_();
  return { ready: true, url: url, sheetUrl: hs.getUrl(), helpers: helpers, results: results, calling: busy.size,
    listSize: Math.max(0, hs.getSheetByName('List').getLastRow() - 1) };
}

/** Add a helper, or change one (matched by name). */
function api_saveHelper(h) {
  const hs = helperSS_(); if (!hs) throw new Error('Set up helpers first');
  const name = String(h.name || '').trim(); if (!name) throw new Error('Please type a name');
  const sh = hs.getSheetByName('Helpers');
  const vals = sh.getDataRange().getValues();
  const i = vals.findIndex((r, j) => j > 0 && String(r[0]).trim().toLowerCase() === name.toLowerCase());
  const show = ['All', 'Russian', 'English', 'Picked'].indexOf(h.show) >= 0 ? h.show : 'All';
  const lang = ['HE', 'RU', 'EN'].indexOf(h.lang) >= 0 ? h.lang : 'HE';
  const active = h.active === false ? 'NO' : 'YES';
  if (i > 0) sh.getRange(i + 1, 3, 1, 3).setValues([[active, show, lang]]);
  else sh.appendRow([name, Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8), active, show, lang, today_()]);
  return api_helpers();
}

/** New secret link for one helper (the old link stops working). */
function api_newHelperLink(name) {
  const hs = helperSS_(); const sh = hs.getSheetByName('Helpers');
  const vals = sh.getDataRange().getValues();
  const i = vals.findIndex((r, j) => j > 0 && String(r[0]) === name);
  if (i > 0) sh.getRange(i + 1, 2).setValue(Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8));
  return api_helpers();
}

/* for local testing with node */
if (typeof module !== 'undefined') module.exports = { settingsSections_: settingsSections_, settingsPatch_: settingsPatch_, toHtml_: toHtml_, emailCap_: emailCap_, mergePatch_: mergePatch_, isSeparate_: isSeparate_, helperPool_: helperPool_, helperNote_: helperNote_, helperTexts_: helperTexts_, HELPER_ACTIONS: HELPER_ACTIONS, scoreContact: scoreContact, normPhone_: normPhone_, extractPeople: extractPeople, isAutoReply_: isAutoReply_, addr_: addr_, ownText_: ownText_, planImport_: planImport_, csvRows_: csvRows_ };
