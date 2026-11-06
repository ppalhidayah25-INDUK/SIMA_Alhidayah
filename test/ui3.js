process.env.SIMA_BCRYPT_COST = '4';
const { chromium } = require('playwright'); const bcrypt = require('bcryptjs'); const { createDev } = require('../dev-server'); const { memoryDb } = require('../lib/sima/db');
const B = 'http://127.0.0.1:3114', PW = 'KataSandi-Kuat1', S = '/tmp/ui3_';
(async () => {
  const db = await memoryDb(), n = Date.now();
  for (const [u, r] of [['admin', 'super_admin'], ['ben', 'bendahara'], ['kea', 'keamanan']]) await db.q("INSERT INTO users (username,nama,password_hash,role,aktif,dibuat,diubah) VALUES ($1,$1,$2,$3,TRUE,$4,$4)", [u, bcrypt.hashSync(PW, 4), r, n]);
  await db.q("INSERT INTO santri (nama,jenis_kelamin,nis,tanggal_masuk,tahun_masuk,status,dibuat,diubah) VALUES ('Santri Uji UI','L','U-1','2024-07-01',2024,'aktif',1,1),('Santri Uji UI2','P','U-2','2024-07-01',2024,'aktif',1,1)").catch(e => console.log('seed santri gagal', e.message));
  const srv = (await createDev(db)).listen(3114), b = await chromium.launch(), errs = []; const ok = (m, c) => console.log((c ? 'OK   ' : 'GAGAL') + ' ' + m);
  async function page(w, h, u) { const c = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true }), p = await c.newPage(); p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push('CON ' + m.text())); await p.goto(B + '/sima/'); await p.fill('#lgId', u); await p.fill('#lgPw', PW); await p.click('button[type=submit]'); await p.waitForSelector('.sb__nav'); return p; }
  const p = await page(1345, 820, 'ben'); await p.waitForTimeout(800);
  ok('dashboard keuangan untuk Bendahara', await p.locator('.stat').count() >= 10); console.log('menu', await p.locator('.sb__nav .nv span').allTextContents());
  await p.screenshot({ path: S + 'dash.png', fullPage: true });
  // kategori
  await p.goto(B + '/sima#/bendahara/pengaturan'); await p.waitForTimeout(600); await p.click('.btn:has-text("Muat kategori awal")'); await p.click('.modal .btn:has-text("Ya, muat")'); await p.waitForTimeout(800);
  ok('6 kategori awal', (await p.locator('tbody tr').count()) >= 6);
  // tagihan massal
  await p.goto(B + '/sima#/bendahara/tagihan'); await p.waitForTimeout(600); await p.click('.btn:has-text("Buat tagihan")'); await p.waitForSelector('.modal');
  await p.locator('.modal select').first().selectOption({ index: 1 }); await p.locator('.money input').fill('75000'); await p.locator('.modal select').nth(2).selectOption('semua');
  await p.click('.modal .btn:has-text("Pratinjau")'); await p.waitForTimeout(800); await p.screenshot({ path: S + 'tagihan_modal.png' });
  const sb = p.locator('.modal .btn:has-text("Simpan 2 tagihan")'); ok('pratinjau 2 santri', await sb.count() === 1);
  await sb.click(); await p.click('.modal .btn:has-text("Ya, simpan")'); await p.waitForTimeout(1000);
  ok('2 tagihan tampil', (await p.locator('tbody tr').count()) === 2);
  // bayar sebagian
  await p.goto(B + '/sima#/bendahara/pembayaran'); await p.waitForTimeout(500); await p.locator('.picker input').fill('U-1'); await p.waitForTimeout(700); await p.locator('.pick li').first().click(); await p.waitForTimeout(800);
  await p.locator('.payrow .money input').first().fill('30000'); await p.locator('select').last().selectOption({ index: 1 }); await p.click('.paybar .btn'); await p.click('.modal .btn:has-text("Ya, simpan")'); await p.waitForTimeout(1200);
  ok('kuitansi tampil', await p.locator('.receipt').count() === 1); await p.screenshot({ path: S + 'kuitansi.png' });
  const txt = await p.locator('.receipt').innerText(); ok('kuitansi memuat sisa Rp45.000', /45\.000/.test(txt));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('a:has-text("Unduh PDF")')]); ok('unduh PDF kuitansi', /KWT-/.test(dl.suggestedFilename()));
  await p.click('.modal .btn:has-text("Tutup")');
  // tabungan
  await p.goto(B + '/sima#/bendahara/tabungan'); await p.waitForTimeout(500); await p.click('.btn:has-text("Setoran baru")'); await p.locator('.modal .picker input').fill('U-2'); await p.waitForTimeout(700); await p.locator('.pick li').first().click();
  await p.locator('.modal .money input').fill('120000'); await p.click('.modal .btn:has-text("Simpan setoran")'); await p.click('.modal .btn:has-text("Ya, simpan")'); await p.waitForTimeout(1200); ok('bukti setoran', await p.locator('.receipt').count() === 1); await p.click('.modal .btn:has-text("Tutup")');
  ok('saldo tabungan 120.000', /120\.000/.test(await p.locator('tbody').innerText()));
  // kas
  await p.goto(B + '/sima#/bendahara/kas'); await p.waitForTimeout(500); ok('peringatan saldo awal', await p.locator('.note--warn').count() > 0);
  await p.click('.btn:has-text("Saldo awal")'); await p.locator('.modal .money input').fill('1000000'); await p.click('.modal .btn:has-text("Simpan")'); await p.click('.modal .btn:has-text("Ya, simpan")'); await p.waitForTimeout(1000);
  await p.goto(B + '/sima#/bendahara/pengaturan'); await p.waitForTimeout(500); const adds = p.locator('.panel__h .btn:has-text("Tambah")'); await adds.nth(1).click(); await p.locator('.modal input').first().fill('Donasi Uji'); await p.locator('.modal select').first().selectOption('masuk'); await p.click('.modal .btn:has-text("Simpan")'); await p.waitForTimeout(800);
  await p.goto(B + '/sima#/bendahara/kas'); await p.waitForTimeout(500); await p.click('.btn:has-text("Pemasukan")'); await p.locator('.modal select').first().selectOption({ index: 1 }); await p.locator('.modal .money input').fill('250000'); await p.locator('.modal input[type=text]').nth(1).fill('Donatur uji');
  await p.click('.modal .btn:has-text("Simpan")'); await p.click('.modal .btn:has-text("Ya, simpan")'); await p.waitForTimeout(1200);
  const sum = await p.locator('.sumbar').innerText(); ok('buku kas saldo akhir 1.250.000', /1\.250\.000/.test(sum)); await p.screenshot({ path: S + 'kas.png', fullPage: true });
  // dashboard terisi, laporan, tunggakan, audit
  await p.goto(B + '/sima#/bendahara/dashboard'); await p.waitForTimeout(1000); await p.screenshot({ path: S + 'dash2.png', fullPage: true });
  await p.goto(B + '/sima#/bendahara/tunggakan'); await p.waitForTimeout(800); ok('tunggakan 2 baris', (await p.locator('tbody tr').count()) === 2);
  await p.goto(B + '/sima#/bendahara/laporan'); await p.waitForTimeout(900); ok('laporan tampil', await p.locator('.receipt--rep').count() === 1); await p.screenshot({ path: S + 'laporan.png', fullPage: true });
  const [dx] = await Promise.all([p.waitForEvent('download'), p.click('a:has-text("Unduh Excel")')]); ok('unduh Excel', /\.xlsx$/.test(dx.suggestedFilename()));
  await p.goto(B + '/sima#/bendahara/audit'); await p.reload(); await p.waitForTimeout(700); ok('Bendahara ditolak ke audit', await p.locator('.empty b').first().textContent().then(t => /ditolak/i.test(t), () => false));
  // ponsel
  const m = await page(390, 800, 'ben');
  for (const r of ['dashboard', 'tagihan', 'pembayaran', 'tunggakan', 'tabungan', 'kas', 'laporan', 'pengaturan']) { await m.goto(B + '/sima#/bendahara/' + r); await m.waitForTimeout(800); const o = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok('ponsel ' + r + ' overflow=' + o, o <= 1); }
  await m.goto(B + '/sima#/bendahara/dashboard'); await m.waitForTimeout(800); await m.screenshot({ path: S + 'm_dash.png', fullPage: true });
  await m.goto(B + '/sima#/bendahara/pembayaran'); await m.waitForTimeout(600); await m.screenshot({ path: S + 'm_bayar.png' });
  // admin & keamanan
  const a = await page(1200, 800, 'admin'); await a.goto(B + '/sima#/bendahara/audit'); await a.waitForTimeout(800); ok('SA melihat audit', await a.locator('tbody tr').count() > 3);
  const k = await page(1200, 800, 'kea'); console.log('menu keamanan', await k.locator('.sb__nav .nv span').allTextContents());
  for (const r of ['dashboard', 'tagihan', 'kas', 'tabungan', 'laporan', 'pembayaran']) { await k.goto(B + '/sima#/bendahara/' + r); await k.reload(); await k.waitForTimeout(700); ok('Keamanan ' + r + ' ditolak', (await k.locator('.empty b').first().textContent().catch(() => '')) === 'Akses ditolak' && (await k.locator('.stat').count()) === 0); }
  console.log('ERROR JS/CSP:', errs); await b.close(); srv.close(); await db.close(); process.exit(0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
