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
console.log(n + ' checks passed');
