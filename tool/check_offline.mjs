/* The page must still be honest with no session at all: the seeded copy, the
   same hundred lines, in both languages, with no uncaught error. Connecting is
   an upgrade, not a prerequisite. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
const PAGE = process.argv[2] || '/mnt/user-data/working/almaria-pages/admin.html';
const html = readFileSync(PAGE);
const srv = createServer((_, r) => { r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); r.end(html); }).listen(0);
await new Promise(r => srv.once('listening', r));
const O = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let fail = 0;
for (const lang of ['en','ar']) {
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.route('**://*.supabase.co/**', r => r.abort());   /* no backend at all */
  await p.goto(O, { waitUntil: 'load' });
  if (lang === 'ar') { await p.evaluate(() => setLang && setLang('ar')); await p.waitForTimeout(400); }
  const r = await p.evaluate(() => ({
    n: WOS.length,
    total: Math.round(WOS.reduce((a,x)=>a+(x.mat||0),0)*100)/100,
    sla: WOS.filter(x=>!x.noSla).length,
    empty: document.body.innerText.includes('No maintenance log yet')
          || document.body.innerText.includes('لا يوجد سجل صيانة')
  }));
  const good = r.n === 100 && r.total === 334019 && r.sla === 0 && !r.empty && errs.length === 0;
  console.log(`  ${good ? '✓' : '✗'} ${lang}: ${r.n} lines, ${r.total}, ${r.sla} measurable, empty=${r.empty}, errors=${errs.length}`);
  if (!good) { fail++; errs.forEach(e => console.log('      ' + e)); }
  await p.close();
}
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
