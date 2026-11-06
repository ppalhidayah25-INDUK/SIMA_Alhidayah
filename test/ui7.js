process.env.SIMA_BCRYPT_COST = '4';
const { chromium } = require('playwright'); const bcrypt = require('bcryptjs'); const { createDev } = require('../dev-server'); const { memoryDb } = require('../lib/sima/db');
const B = 'http://127.0.0.1:3118', PW = 'KataSandi-Kuat1', S = '/tmp/ui7_';
(async () => {
  const db = await memoryDb(), n = Date.now();
  for (const [u, r] of [['admin', 'super_admin'], ['ben', 'bendahara'], ['kea', 'keamanan']]) await db.q("INSERT INTO users (username,nama,password_hash,role,aktif,dibuat,diubah) VALUES ($1,$1,$2,$3,TRUE,$4,$4)", [u, bcrypt.hashSync(PW, 4), r, n]);
  const srv = (await createDev(db)).listen(3118), b = await chromium.launch(), errs = []; const ok = (m, c) => console.log((c ? 'OK   ' : 'GAGAL') + ' ' + m);
  async function page(w, h, u, pw) { const c = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true }), p = await c.newPage(); p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.g|401 \(Unauthorized\)|403 \(Forbidden\)|400 \(Bad Request\)/.test(m.text())) errs.push('CONSOLE ' + m.text()); }); await p.goto(B + '/sima/'); await p.fill('#lgId', u); await p.fill('#lgPw', pw || PW); await p.click('button[type=submit]'); await p.waitForSelector('.sb__nav, .modal'); return p; }
  const go = async (p, r) => { await p.goto(B + '/sima#/' + r); await p.reload(); await p.waitForTimeout(900); };
  const A = await page(1345, 820, 'admin');
  await go(A, 'laporan'); ok('Pusat Laporan menampilkan 7 kelompok', (await A.locator('nav[aria-label="Kelompok laporan"] .tab').count()) === 7);
  await A.locator('nav[aria-label="Kelompok laporan"] .tab').nth(0).click(); await A.locator('.panel .btn:has-text("Data Santri")').first().click().catch(() => { }); 
  const first = A.locator('section.panel button.btn[aria-pressed]').first(); await first.click(); await A.click('.btn:has-text("Tampilkan")'); await A.waitForSelector('.receipt--rep');
  ok('laporan tampil dengan kop pondok', (await A.locator('.receipt--rep header b').count()) === 1);
  ok('tautan PDF & Excel mengikuti laporan', /format=pdf/.test(await A.getAttribute('#dlpdf', 'href')) && /format=xlsx/.test(await A.getAttribute('#dlxlsx', 'href')));
  const r = await A.evaluate(async h => { const x = await fetch(h); return [x.status, x.headers.get('content-type')]; }, await A.getAttribute('#dlpdf', 'href')); ok('PDF terunduh (' + r[1] + ')', r[0] === 200 && /pdf/.test(r[1]));
  const r2 = await A.evaluate(async h => { const x = await fetch(h); return [x.status, x.headers.get('content-type')]; }, await A.getAttribute('#dlxlsx', 'href')); ok('Excel terunduh', r2[0] === 200 && /spreadsheet/.test(r2[1]));
  for (const t of ['identitas', 'sesi', 'backup', 'konsistensi', 'kesiapan', 'akses', 'info']) { await go(A, 'pengaturan/' + t); ok('pengaturan/' + t + ' termuat', (await A.locator('.tabs .tab.is-on').count()) === 1 && (await A.locator('.note--bad').filter({ hasNotText: '' }).locator(':visible').count()) === 0); }
  await go(A, 'pengaturan/backup'); await A.click('.btn:has-text("Buat backup sekarang")'); await A.waitForSelector('.modal'); await A.click('.modal .btn:has-text("Ya, buat backup")'); await A.waitForSelector('td:has-text("Terverifikasi")', { timeout: 20000 });
  ok('backup dibuat & terverifikasi lewat UI', (await A.locator('td:has-text("Terverifikasi")').count()) >= 2);
  ok('tombol Pulihkan paket tersedia', (await A.locator('.btn:has-text("Pulihkan paket")').count()) >= 1);
  await A.locator('.btn:has-text("Pulihkan paket")').first().click(); await A.waitForSelector('.modal'); ok('pemulihan menuntut kata PULIHKAN + password', (await A.locator('.modal input').count()) === 2);
  await A.locator('.modal input').nth(0).fill('salah'); await A.locator('.modal input').nth(1).fill(PW); await A.click('.modal .btn:has-text("Pulihkan sekarang")'); await A.waitForTimeout(800);
  ok('pemulihan ditolak tanpa konfirmasi tepat', (await A.locator('.modal .note--bad:visible').count()) === 1); await A.click('.modal .btn:has-text("Batal")');
  await go(A, 'pengaturan/konsistensi'); ok('konsistensi menampilkan hasil', (await A.locator('tbody tr').count()) >= 10);
  await go(A, 'log'); ok('log memiliki filter & data', (await A.locator('.tools select').count()) >= 3 && (await A.locator('tbody tr').count()) >= 1);
  await A.screenshot({ path: S + 'log.png' });
  await go(A, 'pengguna'); await A.locator('tbody tr', { hasText: 'ben' }).locator('.btn:has-text("Keamanan akun")').first().click().catch(() => { });
  await A.waitForTimeout(700); ok('modal keamanan akun terbuka', (await A.locator('.modal:has-text("Buat password sementara")').count()) === 1);
  await A.locator('.modal .btn:has-text("Buat password sementara")').click(); await A.waitForTimeout(400); await A.locator('.modal .btn:has-text("Ya, buat")').last().click(); await A.waitForSelector('.pw-once');
  const tmp = await A.locator('.pw-once').innerText(); ok('password sementara tampil sekali', tmp.length >= 12);
  const Bn = await page(1345, 820, 'ben', tmp); await Bn.waitForSelector('.modal:has-text("Ganti password sementara")'); ok('login password sementara memaksa ganti password', true);
  await Bn.locator('.modal input').nth(0).fill(tmp); await Bn.locator('.modal input').nth(1).fill('PasswordBaru-Kuat9'); await Bn.locator('.modal input').nth(2).fill('PasswordBaru-Kuat9'); await Bn.click('.modal .btn:has-text("Simpan password")'); await Bn.waitForTimeout(1200);
  ok('password diganti, modal tertutup', (await Bn.locator('.modal').count()) === 0);
  ok('Bendahara tidak punya menu Pengaturan/Log/Pengguna', (await Bn.locator('.sb__nav a[data-route="#/pengaturan"], .sb__nav a[data-route="#/log"], .sb__nav a[data-route="#/pengguna"]').count()) === 0);
  const den = await Bn.evaluate(async () => (await fetch('/api/sima/backup')).status); ok('Bendahara ditolak API backup (' + den + ')', den === 403);
  const K = await page(1345, 820, 'kea'); await go(K, 'laporan'); ok('Keamanan hanya melihat kelompok Keamanan', (await K.locator('nav[aria-label="Kelompok laporan"] .tab').count()) === 1);
  const M = await page(390, 800, 'admin'); for (const r of ['laporan', 'pengaturan/backup', 'log', 'dashboard']) { await go(M, r); ok('mobile 390px tanpa overflow: ' + r, await M.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); }
  ok('tidak ada error JS/CSP' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''), errs.length === 0);
  await b.close(); srv.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
