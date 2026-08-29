/* Does signing in still empty the maintenance page?
 *
 * Until 29 Aug 2026 it did. LIVE.paint() cleared WOS and refilled it from
 * work_orders — 0 rows — while the hundred imported invoice lines sat in
 * building_costs, a table this layer had never been told about. Connecting
 * made the console show LESS than not connecting.
 *
 * This drives the real page in a real browser with the network intercepted, so
 * the assertions are about what the console does, not about what the source
 * looks like. No Supabase project is contacted: every request to the backend
 * host is answered from the fixtures beside this file, and the session is a
 * forged unsigned JWT that never leaves the browser.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = process.argv[2] || '/mnt/user-data/working/almaria-pages/admin.html';
const COSTS = JSON.parse(readFileSync(join(HERE, 'costs.json'), 'utf8'));
const UNITS = JSON.parse(readFileSync(join(HERE, 'units.json'), 'utf8'));

let pass = 0, fail = 0;
const ok  = m => { pass++; console.log('  ✓ ' + m); };
const bad = m => { fail++; console.log('  ✗ ' + m); };
const is  = (got, want, m) =>
  JSON.stringify(got) === JSON.stringify(want)
    ? ok(`${m} — ${JSON.stringify(got)}`)
    : bad(`${m}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

/* the page over http, so localStorage has a real origin */
const html = readFileSync(PAGE);
const srv = createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(0);
await new Promise(r => srv.once('listening', r));
const ORIGIN = 'http://127.0.0.1:' + srv.address().port + '/';

/* an unsigned token carrying the one claim the console checks */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
  sub: '33333333-3333-3333-3333-333333333333',
  email: 'staff@almaria.sa',
  exp: Math.floor(Date.now() / 1000) + 3600,
  app_metadata: { role: 'staff' }
}) + '.x';

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium'
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));

await page.addInitScript(([key, tok]) => {
  localStorage.setItem(key, JSON.stringify({ access_token: tok, refresh_token: 'r' }));
}, ['almaria.sb.session.v1', JWT]);

/* One tenancy, so there is something for a cost line to pick a name up from.
   The name is invented for this fixture on purpose — no resident of the real
   building appears in a file that lives outside the private dataset. */
const LEASES = [{
  id: 'L-TEST-109', unit_id: 'B-109', starts_on: '2026-01-01', ends_on: '2026-12-31',
  contract_value: 90000, status: 'active',
  residents: { name_en: 'Test Tenant', name_ar: 'مستأجر تجريبي' }
}];

/* the backend, answered from fixtures */
const seen = new Set();
await page.route('**://*.supabase.co/**', route => {
  const path = new URL(route.request().url()).pathname.replace('/rest/v1/', '');
  seen.add(path);
  const body = { units: UNITS, building_costs: COSTS, leases: LEASES }[path] ?? [];
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});

await page.goto(ORIGIN, { waitUntil: 'load' });
await page.waitForFunction(
  () => typeof WOS !== 'undefined' && WOS.length > 0, null, { timeout: 15000 })
  .catch(() => {});

console.log('── the live layer asks for the registers at all');
is([...seen].includes('building_costs'), true, 'building_costs was requested');
is([...seen].includes('work_orders'),   true, 'work_orders still requested too');

const r = await page.evaluate(() => {
  const w = WOS;
  const round = n => Math.round(n * 100) / 100;
  return {
    n: w.length,
    total: round(w.reduce((a, x) => a + (x.mat || 0), 0)),
    noSla: w.filter(x => x.noSla === true).length,
    done: w.filter(x => x.status === 'done').length,
    targets: round(w.reduce((a, x) => a + (x.target || 0), 0)),
    breached: w.filter(x => x.breached).length,
    closeH: round(w.reduce((a, x) => a + (x.closeH || 0), 0)),
    withUnit: w.filter(x => x.unit && x.unit !== '—').length,
    unknownCat: [...new Set(w.map(x => x.cat))].filter(c => !CATS.some(k => k.id === c)),
    dupIds: w.length - new Set(w.map(x => x.id)).size,
    suppliers: new Set(w.filter(x => x.supplier).map(x => x.tech)).size,
    tenantOn109: (w.find(x => x.unit === 'B-109') || {}).tenant,
    nextSeq: (LINK.get() || {}).nextSeq
  };
});

console.log('── the hundred lines arrive');
is(r.n, 100, 'every line is on the page');
is(r.total, 334019, 'and the total is the office’s own figure');
is(r.dupIds, 0, 'no line is counted twice');

console.log('── they arrive as invoices, not as work orders');
is(r.noSla, 100, 'every line is marked unmeasurable');
is(r.done, 100, 'every line is closed — an invoice is a thing already paid');
is(r.targets, 0, 'not one carries a response target');
is(r.closeH, 0, 'not one carries a time to close');
is(r.breached, 0, 'so nothing can be reported as a breach');

console.log('── nothing is deduced that the register did not say');
is(r.withUnit, 6, 'only the six lines whose invoice names a flat carry one');
is(r.unknownCat, [], 'every category resolves to one the console knows');
is(r.suppliers, 7, 'the seven named suppliers, and no eighth invented');
is(r.tenantOn109, 'Test Tenant', 'a flat’s line takes its tenant from the LIVE register');

console.log('── and the next resident request is unaffected');
is(r.nextSeq, 501, 'invoice lines do not push the work-order sequence along');

console.log('── the empty state is gone');

const empty = await page.evaluate(() =>
  document.body.innerText.includes('No maintenance log yet'));
is(empty, false, 'the console no longer claims there is no maintenance log');
is(errs, [], 'no uncaught JavaScript error');

await browser.close();
srv.close();

console.log('');
if (fail) { console.log(`  ${pass} passed, ${fail} FAILED`); process.exit(1); }
console.log(`  ${pass} passed, 0 failed`);
