process.env.SIMA_BCRYPT_COST = '4';
const { chromium } = require('playwright'); const bcrypt = require('bcryptjs'); const ExcelJS = require('exceljs'); const { createDev } = require('../dev-server'); const { memoryDb } = require('../lib/sima/db');
const B = 'http://127.0.0.1:3119', PW = 'KataSandi-Kuat1';
(async () => {
  const db = await memoryDb(), n = Date.now();
  for (const [u, r] of [['admin', 'super_admin'], ['ben', 'bendahara']]) await db.q("INSERT INTO users (username,nama,password_hash,role,aktif,dibuat,diubah) VALUES ($1,$1,$2,$3,TRUE,$4,$4)", [u, bcrypt.hashSync(PW, 4), r, n]);
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Data'); ws.addRow(['Jenis', 'Nama Asrama', 'Status', 'Keterangan']); ws.addRow(['putra', 'Asrama Uji UI', '', '']); ws.addRow(['putri', 'Asrama Uji UI 2', '', '']); ws.addRow(['campur', 'Salah', '', '']); const f = '/tmp/ui8_asrama.xlsx'; await wb.xlsx.writeFile(f);
  const srv = (await createDev(db)).listen(3119), b = await chromium.launch(), errs = []; const ok = (m, c) => console.log((c ? 'OK   ' : 'GAGAL') + ' ' + m);
  async function page(w, h, u) { const c = await b.newContext({ viewport: { width: w, height: h } }), p = await c.newPage(); p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.g|401 \(|403 \(|400 \(/.test(m.text())) errs.push('CONSOLE ' + m.text()); }); await p.goto(B + '/sima/'); await p.fill('#lgId', u); await p.fill('#lgPw', PW); await p.click('button[type=submit]'); await p.waitForSelector('.sb__nav'); return p; }
  const go = async (p, r) => { await p.goto(B + '/sima#/' + r); await p.reload(); await p.waitForTimeout(900); };
  const A = await page(1345, 820, 'admin'); await go(A, 'impor');
  ok('menu Impor Data tampil untuk Super Admin', (await A.locator('.sb__nav a[data-route="#/impor"]').count()) === 1);
  await A.locator('select').first().selectOption('asrama'); await A.waitForTimeout(300);
  ok('template & format kolom tampil', (await A.locator('a:has-text("Unduh template Excel")').count()) === 1 && (await A.locator('td:has-text("Nama Asrama")').count()) >= 1);
  await A.setInputFiles('input[type=file]', f); await A.click('.btn:has-text("Periksa berkas")'); await A.waitForSelector('text=Pratinjau:');
  ok('pratinjau: 3 baris, 2 lolos, 1 gagal, belum tersimpan', (await A.locator('.stat').nth(0).innerText()).includes('3') && (await A.locator('.stat').nth(1).innerText()).includes('2') && Number((await db.q('SELECT COUNT(*)::int n FROM asrama'))[0].n) === 0);
  await A.screenshot({ path: '/tmp/ui8_pratinjau.png', fullPage: true });
  await A.click('.btn:has-text("Impor 2 baris")'); await A.waitForTimeout(400); ok('impor ditolak tanpa persetujuan pelewatan', Number((await db.q('SELECT COUNT(*)::int n FROM asrama'))[0].n) === 0);
  await A.check('#impAck'); await A.click('.btn:has-text("Impor 2 baris")'); await A.waitForSelector('.modal'); await A.click('.modal .btn:has-text("Ya, impor")'); await A.waitForSelector('text=Impor selesai');
  ok('impor selesai dan tersimpan', Number((await db.q('SELECT COUNT(*)::int n FROM asrama'))[0].n) === 2);
  ok('riwayat impor tampil', (await A.locator('td:has-text("Selesai")').count()) >= 1);
  const Bn = await page(1345, 820, 'ben'); await go(Bn, 'impor'); ok('Bendahara ditolak membuka Impor Data', (await Bn.locator('.sb__nav a[data-route="#/impor"]').count()) === 0 && (await Bn.locator('text=Impor selesai, text=Jenis data').count()) === 0);
  const M = await page(390, 800, 'admin'); await go(M, 'impor'); ok('mobile 390px tanpa overflow', await M.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok('tidak ada error JS/CSP' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''), errs.length === 0);
  await b.close(); srv.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
