/**
 * zugdeskcrm – Helpers app. Friends and family call shadchanim with a personal link (?k=…).
 * Bound to the sheet "zugdeskcrm – Helpers" and allowed to touch ONLY that sheet.
 * The main app writes List / Helpers / Config there and reads Reservations / Results.
 */

const TZ = 'Asia/Jerusalem';
const RESULTS = ['spoke', 'noanswer', 'callback', 'wrong', 'inactive', 'stop', 'notfit'];
const NEXT = ['profile', 'call', ''];
const HOLD_HOURS = 24;

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.k = String((e && e.parameter && e.parameter.k) || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 64);
  return t.evaluate().setTitle('Shidduch calls')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** API for the static helper page (no Google cookies → works with several accounts). Body: {fn, k, args}. Always JSON. */
const API_ = { h_load: 0, h_reserve: 1, h_release: 1, h_save: 4 };
const FN_ = () => ({ h_load: h_load, h_reserve: h_reserve, h_release: h_release, h_save: h_save });   // function → number of args after the key
function doPost(e) {
  let out;
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = String(b.fn || '');
    if (fn === 'ping') out = { ok: true, data: 'pong' };
    else {
      if (!Object.prototype.hasOwnProperty.call(API_, fn)) throw new Error('Unknown call');
      const a = Array.isArray(b.args) ? b.args.slice(0, API_[fn]) : [];
      out = { ok: true, data: FN_()[fn].apply(null, [String(b.k || '')].concat(a)) };
    }
  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function sh_(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function rows_(n) { return sh_(n).getDataRange().getValues().slice(1); }
function str_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss') : String(v == null ? '' : v).trim(); }
function now_(ms) { return Utilities.formatDate(new Date(ms || Date.now()), TZ, 'yyyy-MM-dd HH:mm:ss'); }

/** The helper behind a link, or an error if the link is unknown or paused. */
function who_(k) {
  k = String(k || '');
  if (k.length < 20) throw new Error('LINK');
  const r = rows_('Helpers').find(x => str_(x[1]) === k);
  if (!r || str_(r[2]) === 'NO') throw new Error('LINK');
  return { name: str_(r[0]), show: str_(r[3]) || 'All', lang: str_(r[4]) || 'HE' };
}

/** Pure: may this helper see this List row? */
function canSee_(me, row) {
  const forWho = String(row.For || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (forWho.length) return forWho.indexOf(me.name.toLowerCase()) >= 0;
  if (me.show === 'Picked') return false;
  if (me.show === 'Russian') return /ר/.test(row.Languages || '') || /רוס/.test(row.Specialty || '');
  if (me.show === 'English') return /א/.test(row.Languages || '') || /אמריק|אנגלית/.test(row.Specialty || '');
  return true;
}

/** Pure: active holds (newest per contact) → { id: {helper, at} } */
function holds_(res, nowMs) {
  const cut = now_(nowMs - HOLD_HOURS * 3600e3), out = {};
  res.forEach(r => {
    const id = str_(r[0]), at = str_(r[2]), st = str_(r[3]);
    if (st === 'Active' && at >= cut) out[id] = { helper: str_(r[1]), at: at };
    else if (out[id] && out[id].helper === str_(r[1])) delete out[id];
  });
  return out;
}

function h_load(k) {
  const me = who_(k);
  const head = sh_('List').getRange(1, 1, 1, sh_('List').getLastColumn()).getValues()[0].map(String);
  const cfg = {}; rows_('Config').forEach(r => (cfg[str_(r[0])] = str_(r[1])));
  const texts = {}; rows_('Texts').forEach(r => { if (r[0] && String(r[1]).trim()) texts[str_(r[0])] = str_(r[1]); });
  const holds = holds_(rows_('Reservations'), Date.now());
  const results = rows_('Results');
  const builtAt = cfg.BuiltAt || '';
  const doneSince = new Set(), tips = {};
  results.forEach(r => {
    const id = str_(r[2]);
    if (str_(r[0]) > builtAt && str_(r[4]) !== 'note') doneSince.add(id);   // a note alone keeps the person
    if (str_(r[6])) tips[id] = str_(r[0]).slice(0, 10) + ' · ' + str_(r[1]) + ': ' + str_(r[6]);
  });
  const tr = {}, col = me.lang === 'RU' ? 1 : me.lang === 'EN' ? 2 : 0;
  if (col && sh_('Tr')) rows_('Tr').forEach(r => { if (str_(r[col])) tr[str_(r[0])] = str_(r[col]); });
  const T = x => tr[String(x || '').trim()] || '';
  const items = [], listIds = new Set();
  rows_('List').forEach(v => {
    const row = {}; head.forEach((h, i) => (row[h] = str_(v[i])));
    if (row.ID) listIds.add(row.ID);
    if (!row.ID || doneSince.has(row.ID) || !canSee_(me, row)) return;
    const h = holds[row.ID];
    const mine = !!(h && h.helper === me.name);
    items.push({ id: row.ID, src: row.Source || '', country: row.Country || '', name: row.Name, city: row.City, langs: row.Languages, hours: row.Hours, spec: row.Specialty, why: row.Why,
      phones: [[row.Phone1, row.Tel1, row.Mobile1], [row.Phone2, row.Tel2, row.Mobile2]].filter(p => p[0]).map(p => ({ local: p[0], tel: p[1], mobile: p[2] === 'YES' })),
      mine: mine, by: h && !mine ? h.helper : '', tip: tips[row.ID] || '',
      tr: col ? { name: T(row.Name), city: T(row.City), spec: T(row.Specialty), why: String(row.Why || '').split(' · ').map(w => T(w) || w).join(' · ') } : null });
  });
  const heldByMe = new Set(Object.keys(holds).filter(id => holds[id].helper === me.name));
  const past = past_(results, me.name, heldByMe, new Set(String(cfg.NoCall || '').split(',').filter(Boolean)), listIds);
  past.forEach(p => { p.tr = col ? { name: T(p.name), city: T(p.city) } : null; });
  return { me: me, items: items, texts: texts, past: past, customs: customs_(results, me.name), profile: cfg['PROFILE_' + me.lang] || cfg.PROFILE_HE || '',
    profiles: { RU: cfg.PROFILE_RU || '', HE: cfg.PROFILE_HE || '', EN: cfg.PROFILE_EN || '' } };
}

/** Tapping Call/WhatsApp holds the person for this helper. Someone else holding them → {ok:false, by}. */
function h_reserve(k, id) {
  const me = who_(k);
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const h = holds_(rows_('Reservations'), Date.now())[id];
    if (h && h.helper !== me.name) return { ok: false, by: h.helper };
    if (!h) sh_('Reservations').appendRow([id, me.name, now_(), 'Active']);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/** Give the person back (no result). */
function h_release(k, id) {
  const me = who_(k);
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { sh_('Reservations').appendRow([id, me.name, now_(), 'Released']); return { ok: true }; }
  finally { lock.releaseLock(); }
}

/** Pure: this helper's finished people (History), newest first, max 300. Results row: When, Helper, ID, Name, Result, Next, Notes, Names, Phone, Tel, City.
 *  No call button after stop / wrong / inactive (by anyone) or when the main app lists the person as closed / do-not-contact. */
function past_(results, name, held, noCall, listIds) {
  const last = {}, mine = {};
  results.forEach(r => {
    const id = str_(r[2]), res = str_(r[4]);
    if (!id) return;
    if (res && res !== 'note') last[id] = res;
    if (str_(r[1]) !== name) return;
    const p = mine[id] = mine[id] || { id: id, name: '', city: '', phone: '', tel: '', at: '', result: '', next: '', notes: [] };
    p.at = str_(r[0]);
    if (str_(r[3])) p.name = str_(r[3]);
    if (str_(r[10])) p.city = str_(r[10]);
    if (str_(r[9])) { p.phone = str_(r[8]); p.tel = str_(r[9]); }
    if (res && res !== 'note') { p.result = res; p.next = str_(r[5]); }
    if (str_(r[6])) p.notes.push({ at: str_(r[0]).slice(0, 10), text: str_(r[6]) });
  });
  return Object.keys(mine).map(id => mine[id]).filter(p => p.result && !held.has(p.id))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 300).map(p => {
      const bad = ['stop', 'wrong', 'inactive', 'notfit'].indexOf(last[p.id]) >= 0 || noCall.has(p.id);
      return { id: p.id, name: p.name, city: p.city, at: p.at.slice(0, 10), result: p.result, next: p.next, notes: p.notes.slice(-5),
        phone: bad ? '' : p.phone, tel: bad ? '' : p.tel, inList: listIds.has(p.id) };
    });
}

/** Pure: this helper's own "What next" texts (not the fixed ones), newest first, max 4. */
function customs_(results, name) {
  const out = [];
  for (let i = results.length - 1; i >= 0 && out.length < 4; i--) {
    const r = results[i], v = str_(r[5]);
    if (str_(r[1]) === name && v && NEXT.indexOf(v) < 0 && out.indexOf(v) < 0) out.push(v);
  }
  return out;
}

/** result 'note' = only a note: saved, status unchanged, the person stays with this helper. next = a fixed key or her own words (max 60). */
function h_save(k, id, result, next, notes, names) {
  const me = who_(k);
  const noteOnly = result === 'note';
  if (!noteOnly && RESULTS.indexOf(result) < 0) throw new Error('Unknown result');
  if (noteOnly && !String(notes || '').trim()) throw new Error('Empty note');
  next = result === 'spoke' ? String(next || '').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const row = rows_('List').find(r => str_(r[0]) === id);
    const held = holds_(rows_('Reservations'), Date.now())[id], heldByMe = !!(held && held.helper === me.name);
    const prev = rows_('Results').filter(r => str_(r[2]) === id && str_(r[1]) === me.name).pop();   // History: a person she already finished
    if (!row && !prev) throw new Error('Not on your list');
    if (!noteOnly && !heldByMe && !row) throw new Error('Not on your list');
    const name = row ? str_(row[1]) : str_(prev[3]), city = row ? str_(row[2]) : str_(prev[10] || '');
    const bad = ['stop', 'wrong', 'inactive', 'notfit'].indexOf(result) >= 0;
    const phone = bad ? '' : row ? str_(row[5]) : str_(prev[8] || ''), tel = bad ? '' : row ? str_(row[6]) : str_(prev[9] || '');
    const clean = s => String(s || '').replace(/^[=+\-@]/, "'$&").slice(0, 2000);   // never a formula
    sh_('Results').appendRow([now_(), me.name, id, name, result, clean(next), clean(notes), noteOnly ? '' : clean(names), phone, tel, city]);
    if (!noteOnly) sh_('Reservations').appendRow([id, me.name, now_(), 'Done']);
    else if (heldByMe) sh_('Reservations').appendRow([id, me.name, now_(), 'Active']);   // a note renews her 24h hold; from History it holds nobody
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* for local testing with node */
if (typeof module !== 'undefined') module.exports = { canSee_: canSee_, holds_: holds_, customs_: customs_, past_: past_, API_: API_ };
