// Run: node tests/test.js   (checks the pure functions in Code.gs; nothing here touches Google)
const assert = require('assert');
const A = require('../Code.gs');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('normPhone_ Israeli mobile', () => assert.deepStrictEqual(A.normPhone_('+972 50-123-4567'), { local: '050-1234567', intl: '972501234567', mobile: true }));
t('normPhone_ Israeli landline', () => assert.strictEqual(A.normPhone_('04-6971234').mobile, false));
t('normPhone_ US number', () => assert.strictEqual(A.normPhone_('(718) 555-1234').intl, '17185551234'));
t('normPhone_ junk is null', () => assert.strictEqual(A.normPhone_('12345'), null));

const S = { MY_AGE: '41', MY_CITY: 'צפת', W_CHABAD: '5', W_RUSSIAN: '4', W_AGE_FIT: '4', W_AGE_MISMATCH: '8', W_MY_CITY: '3', W_REFERRED: '5' };
t('scoreContact: Chabad + Russian + Tzfat ranks high with chips', () => {
  const r = A.scoreContact({ Specialty: 'חב"ד, דוברי רוסית', Languages: 'ע,ר', City: 'צפת' }, S);
  assert.ok(r.score >= 12); assert.ok(r.why.includes('Chabad')); assert.ok(r.why.includes('In צפת'));
});
t('scoreContact: age limit below 41 is negative', () => assert.ok(A.scoreContact({ Specialty: 'גילאי 20-30' }, S).score < 0));

t('extractPeople: name + phone, excludes sender phone', () => {
  const ex = { phones: new Set(['972521111111']), emails: new Set() };
  const p = A.extractPeople('תנסה את רחל כהן 050-7654321\nאני 052-1111111', ex);
  assert.strictEqual(p.length, 1); assert.strictEqual(p[0].phone, '050-7654321'); assert.ok(p[0].name.includes('רחל כהן'));
});
t('extractPeople: email on next line joins same person', () => {
  const p = A.extractPeople('Sarah Levi 054-2223333\nsarah@example.com', { phones: new Set(), emails: new Set() });
  assert.strictEqual(p.length, 1); assert.strictEqual(p[0].email, 'sarah@example.com');
});

t('ownText_ cuts quoted history and our own template lines', () => {
  const s = { EMAIL_BODY_HE: 'שלום, אני מחפש שדכנית טובה' };
  const out = A.ownText_('תודה, אחזור אליך\n\nשלום, אני מחפש שדכנית טובה\nOn Mon, 1 Jan 2026 someone wrote:\n> old', s);
  assert.strictEqual(out, 'תודה, אחזור אליך');
});

t('isAutoReply_: header or subject', () => {
  assert.ok(A.isAutoReply_('auto-replied', 'Re: hello'));
  assert.ok(A.isAutoReply_('', 'Out of Office: Re: שדכנות'));
  assert.ok(A.isAutoReply_('', 'מענה אוטומטי'));
  assert.ok(!A.isAutoReply_('no', 'Re: שלום'));
});
t('addr_ pulls the address out of a From line', () => assert.strictEqual(A.addr_('Rivka <Rivka@Example.com>'), 'rivka@example.com'));


t('planImport_: matches only by exact phone/email, respects do-not-contact, skips no-contact and repeats', () => {
  const ex = [{ ID: 'C0001', Name: 'רחל', Phone1: '050-1234567', Email: 'a@x.com' }];
  const dnc = { emails: new Set(['stop@x.com']), phones: new Set() };
  const p = A.planImport_([
    { name: 'Rachel K', phone: '+972 50 123 4567' },     // same phone → known
    { name: 'רחל', phone: '052-9999999' },               // same name, other phone → new (never merge by name)
    { name: 'B', email: 'A@X.com ' },                    // same email → known
    { name: 'Stop', email: 'stop@x.com' },               // blocked
    { name: 'NoContact', city: 'צפת' },                  // skipped
    { name: 'Dup', phone: '0529999999' },                // twice in this list
  ], ex, dnc);
  assert.strictEqual(p.known.length, 2); assert.strictEqual(p.add.length, 1); assert.strictEqual(p.add[0].Phone1, '052-9999999');
  assert.strictEqual(p.blocked.length, 1); assert.strictEqual(p.skipped.length, 2);
});
t('csvRows_ + planImport_: quoted commas, BOM, Lang kept only if HE/RU/EN', () => {
  const r = A.csvRows_('﻿name,email,lang,notes\r\n"Cohen, R",r@x.com,EN,"a ""b"""\nX,x@x.com,yi,\n');
  assert.strictEqual(r.length, 2); assert.strictEqual(r[0].name, 'Cohen, R'); assert.strictEqual(r[0].notes, 'a "b"');
  const p = A.planImport_(r, [], { emails: new Set(), phones: new Set() });
  assert.strictEqual(p.add[0].Lang, 'EN'); assert.strictEqual(p.add[1].Lang, '');
});

// ---------- helpers ----------
const H = require('../helper/Code.gs');
t('helperPool_: only shadchanim with a phone, not "Only me", not blocked, not handled today', () => {
  const rows = [
    { ID: 'C1', Name: 'A', Type: 'Shadchan', Status: 'New', Phone1: '050-1234567', Languages: 'ר' },
    { ID: 'C2', Name: 'B', Type: 'Shadchan', Status: 'New', Phone1: '050-1234568', Helpers: 'Only me' },
    { ID: 'C3', Name: 'C', Type: 'Other', Status: 'New', Phone1: '050-1234569' },
    { ID: 'C4', Name: 'D', Type: 'Shadchan', Status: 'New', Phone1: '' },
    { ID: 'C5', Name: 'E', Type: 'Shadchan', Status: 'New', Phone1: '050-1234570' },
    { ID: 'C6', Name: 'F', Type: 'Shadchan', Status: 'Talking', Phone1: '050-1234571' },
    { ID: 'C7', Name: 'G', Type: 'Shadchan', Status: 'Contacted', LastChannel: 'Helper: Mom', NextDate: '2026-11-10', Phone1: '02-6234567' },
    { ID: 'C8', Name: 'H', Type: 'Shadchan', Status: 'Contacted', LastChannel: 'Helper: Mom', NextDate: '2026-11-20', Phone1: '02-6234568' },
    { ID: 'C9', Name: 'I', Type: 'Shadchan', Status: 'New', Phone1: '050-1234572', Helpers: 'Mom' }
  ];
  const out = A.helperPool_(rows, S, c => c.ID === 'C5', new Set(['C6']), '2026-11-13');
  assert.deepStrictEqual(out.map(r => r[0]).sort(), ['C1', 'C7', 'C9']);
  const c1 = out.find(r => r[0] === 'C1');
  assert.strictEqual(c1[6], '+972501234567'); assert.strictEqual(c1[7], 'YES'); assert.strictEqual(out.find(r => r[0] === 'C9')[13], 'Mom');
});
t('helperNote_: name, notes, next step, names', () => {
  assert.strictEqual(A.helperNote_({ helper: 'Mom', notes: 'nice lady', next: 'call', names: 'Rivka 050-1112223' }),
    "[Mom] nice lady → wants Eliyahu to call Names given: Rivka 050-1112223");
  assert.strictEqual(A.HELPER_ACTIONS.noanswer, 'noreach');
});
t('canSee_: picked people only for them; Russian filter; Picked shows nothing else', () => {
  const mom = { name: 'Mom', show: 'Russian' }, dina = { name: 'Dina', show: 'All' }, pick = { name: 'Moshe', show: 'Picked' };
  assert.ok(H.canSee_(mom, { Languages: 'ע,ר' })); assert.ok(!H.canSee_(mom, { Languages: 'ע' }));
  assert.ok(H.canSee_(dina, { Languages: 'ע' })); assert.ok(!H.canSee_(dina, { For: 'Mom' }));
  assert.ok(H.canSee_(mom, { For: 'mom, Dina', Languages: 'ע' })); assert.ok(!H.canSee_(pick, {})); assert.ok(H.canSee_(pick, { For: 'Moshe' }));
});
t('holds_: active 24h, given back or done ends it, newer helper wins after release', () => {
  const now = Date.parse('2026-11-13T10:00:00Z');   // 12:00 in Jerusalem
  const r = [['C1', 'Mom', '2026-11-13 09:00:00', 'Active'], ['C2', 'Dina', '2026-11-11 09:00:00', 'Active'],
    ['C3', 'Mom', '2026-11-13 08:00:00', 'Active'], ['C3', 'Mom', '2026-11-13 08:30:00', 'Done'],
    ['C4', 'Mom', '2026-11-13 08:00:00', 'Active'], ['C4', 'Mom', '2026-11-13 08:10:00', 'Released'], ['C4', 'Dina', '2026-11-13 08:20:00', 'Active']];
  global.Utilities = { formatDate: (d, tz, f) => new Date(d.getTime() + 2 * 3600e3).toISOString().replace('T', ' ').slice(0, 19) };
  const h = H.holds_(r, now);
  assert.deepStrictEqual(Object.keys(h).sort(), ['C1', 'C4']); assert.strictEqual(h.C4.helper, 'Dina');
});

t('mergePatch_: appends notes once, fills only empty fields, never overwrites', () => {
  const c = { ID: 'C1', Notes: 'old note', Email: '', Phone1: '02-6234567', Phone2: '', Country: 'Israel', Lang: '' };
  const ph = [A.normPhone_('02-6234567'), A.normPhone_('050-7654321')];
  const p = A.mergePatch_(c, { notes: 'Gmail: spoke in 2020', country: 'USA', lang: 'en' }, ph, 'a@b.com');
  assert.strictEqual(p.Notes, 'old note\nGmail: spoke in 2020'); assert.strictEqual(p.Email, 'a@b.com');
  assert.strictEqual(p.Phone2, '050-7654321'); assert.strictEqual(p.Phone1, undefined);
  assert.strictEqual(p.Country, undefined); assert.strictEqual(p.Lang, 'EN');
  assert.deepStrictEqual(A.mergePatch_(Object.assign({}, c, { Notes: 'old note\nGmail: spoke in 2020', Email: 'x@y.com', Phone2: '050-7654321', Lang: 'HE' }),
    { notes: 'Gmail: spoke in 2020' }, ph, 'a@b.com'), {});
});
t('isSeparate_: organizations and Other stay out of Contacts', () => {
  assert.ok(A.isSeparate_({ Type: 'Organization' })); assert.ok(A.isSeparate_({ Type: 'Other' }));
  assert.ok(!A.isSeparate_({ Type: 'Shadchan' })); assert.ok(!A.isSeparate_({ Type: 'Connector' }));
});

t('import history: new rows keep status/dates; merge moves status forward only', () => {
  const ex = [{ ID: 'C1', Name: 'Old', Phone1: '050-1112223', Status: 'Talking', LastContact: '2026-01-01' },
              { ID: 'C2', Name: 'Book', Phone1: '050-1112224', Status: 'New', LastContact: '' }];
  const dnc = { emails: new Set(), phones: new Set() };
  const rows = [
    { name: 'A', phone: '050-1112223', status: 'Contacted', lastcontact: '2020-05-01', notes: 'n1' },
    { name: 'B', phone: '050-1112224', status: 'Contacted', lastcontact: '2021-02-03', lastchannel: 'Email', nextdate: '2026-11-14', notes: 'n2' },
    { name: 'C', email: 'c@x.com', status: 'Talking', needsreply: 'YES', lastcontact: '2026-08-01', sourceref: 'Gmail emails 2025–2026' },
    { name: 'D', email: 'd@x.com', status: 'Closed' }];
  const out = A.planImport_(rows, ex, dnc);
  assert.strictEqual(out.known.length, 2); assert.strictEqual(out.add.length, 2);
  assert.strictEqual(out.known[0].merge.Status, undefined); assert.strictEqual(out.known[0].merge.LastContact, undefined);   // Talking stays, older date ignored
  assert.deepStrictEqual([out.known[1].merge.Status, out.known[1].merge.LastContact, out.known[1].merge.NextDate], ['Contacted', '2021-02-03', '2026-11-14']);
  assert.deepStrictEqual([out.add[0].Status, out.add[0].NeedsReply, out.add[0].SourceRef], ['Talking', 'YES', 'Gmail emails 2025–2026']);
  assert.strictEqual(out.add[1].Status, undefined);   // 'Closed' is not accepted from a file → stays New
});

t('emailCap_: 10 → 20 → 30 → 40 by week, never above max; off = fixed', () => {
  assert.strictEqual(A.emailCap_(10, 40, true, '2026-11-15', '2026-11-15'), 10);
  assert.strictEqual(A.emailCap_(10, 40, true, '2026-11-15', '2026-11-21'), 10);
  assert.strictEqual(A.emailCap_(10, 40, true, '2026-11-15', '2026-11-22'), 20);
  assert.strictEqual(A.emailCap_(10, 40, true, '2026-11-15', '2026-12-06'), 40);
  assert.strictEqual(A.emailCap_(10, 40, true, '2026-11-15', '2027-03-01'), 40);
  assert.strictEqual(A.emailCap_(10, 40, false, '2026-11-15', '2027-03-01'), 10);
  assert.strictEqual(A.emailCap_(10, 40, true, '', '2027-03-01'), 10);
});

t('csvRows_ keeps multi-line quoted texts (profile settings file)', () => {
  const r = A.csvRows_('key,value\nPROFILE_EN,"*Eliyahu*\n41 • Kohen\n\n*Work:*"\nSENDER_NAME,Eliyahu\n');
  assert.strictEqual(r.length, 2); assert.strictEqual(r[0].value, '*Eliyahu*\n41 • Kohen\n\n*Work:*');
});
console.log(n + ' checks passed');
