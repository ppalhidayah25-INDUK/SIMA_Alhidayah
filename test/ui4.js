process.env.SIMA_BCRYPT_COST = '4';
const { chromium } = require('playwright'); const bcrypt = require('bcryptjs'); const { createDev } = require('../dev-server'); const { memoryDb } = require('../lib/sima/db');
const B = 'http://127.0.0.1:3115', PW = 'KataSandi-Kuat1', S = '/tmp/ui4_';
(async () => {
  const db = await memoryDb(), n = Date.now();
  for (const [u, r] of [['admin', 'super_admin'], ['ben', 'bendahara'], ['kea', 'keamanan']]) await db.q("INSERT INTO users (username,nama,password_hash,role,aktif,dibuat,diubah) VALUES ($1,$1,$2,$3,TRUE,$4,$4)", [u, bcrypt.hashSync(PW, 4), r, n]);
  await db.q("INSERT INTO santri (nama,jenis_kelamin,nis,tanggal_masuk,tahun_masuk,status,dibuat,diubah) VALUES ('Santri Uji UI','L','U-1','2024-07-01',2024,'aktif',1,1),('Santri Uji UI2','P','U-2','2024-07-01',2024,'aktif',1,1)");
  const srv = (await createDev(db)).listen(3115), b = await chromium.launch(), errs = []; const ok = (m, c) => console.log((c ? 'OK   ' : 'GAGAL') + ' ' + m);
  async function page(w, h, u) { const c = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true }), p = await c.newPage(); p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); }); await p.goto(B + '/sima/'); await p.fill('#lgId', u); await p.fill('#lgPw', PW); await p.click('button[type=submit]'); await p.waitForSelector('.sb__nav'); return p; }
  const go = async (p, r) => { await p.goto(B + '/sima#/keamanan/' + r); await p.waitForTimeout(700); };
  const A = await page(1345, 820, 'admin');
  // Super Admin: pengaturan dulu (tidak ada data bawaan)
  await go(A, 'pengaturan'); ok('pengaturan kosong (tanpa kategori bawaan)', (await A.locator('text=Belum ada data').count()) >= 3);
  await A.locator('.btn:has-text("Tambah")').first().click(); await A.locator('.modal input').first().fill('Kategori Uji UI'); await A.click('.modal .btn:has-text("Simpan")'); await A.waitForTimeout(1200); console.log('  modal masih terbuka?', await A.locator('.modal').count(), await A.locator('.modal .note').allTextContents().catch(() => ''));
  ok('kategori ditambah', await A.locator('td:has-text("Kategori Uji UI")').count() >= 1); await A.screenshot({ path: S + 'pengaturan.png', fullPage: true });
  // Keamanan
  const K = await page(1345, 820, 'kea'); await K.waitForSelector('.stat', { timeout: 8000 }).catch(() => 0); await K.waitForTimeout(600);
  console.log('menu keamanan:', await K.locator('.sb__nav .nv, .sb__nav a').allTextContents());
  console.log('  stats', await K.locator('.stat').count(), 'figs', await K.locator('figure.chart').count(), (await K.locator('#content, main').first().innerText()).slice(0, 200).replace(/\n/g, ' | '));
  ok('dashboard keamanan tampil untuk role Keamanan (8 kartu)', (await K.locator('.stat').count()) >= 8); ok('tiga grafik', (await K.locator('figure.chart').count()) === 3);
  await K.screenshot({ path: S + 'dash.png', fullPage: true });
  await go(K, 'pelanggaran'); await K.click('.btn:has-text("Catat pelanggaran")'); await K.waitForSelector('.modal');
  await K.locator('.picker input').fill('U-1'); await K.waitForTimeout(700); await K.locator('.pick li').first().click();
  await K.locator('.modal select').first().selectOption({ index: 1 }); await K.locator('.modal textarea').first().fill('Kejadian uji tampilan');
  await K.click('.modal .btn:has-text("Simpan")'); await K.click('.modal .btn:has-text("Ya, simpan")'); await K.waitForTimeout(900);
  ok('pelanggaran tampil di daftar', await K.locator('tbody tr:has-text("Santri Uji UI")').count() === 1);
  await K.locator('tbody .btn:has-text("Detail")').click(); await K.waitForSelector('.modal'); ok('detail memuat nomor PLG', /PLG-\d{4}-000001/.test(await K.locator('.modal').innerText())); await K.screenshot({ path: S + 'detail.png' }); await K.click('.modal .btn:has-text("Tutup")');
  await go(K, 'pembinaan'); await K.click('.btn:has-text("Catat pembinaan")'); await K.waitForSelector('.modal'); await K.locator('.picker input').fill('U-1'); await K.waitForTimeout(700); await K.locator('.pick li').first().click();
  await K.locator('.modal input[type=text]').nth(0).fill('Nasihat uji'); await K.locator('.modal textarea').first().fill('Alasan uji'); await K.click('.modal .btn:has-text("Simpan")'); await K.click('.modal .btn:has-text("Ya, simpan")'); await K.waitForTimeout(900);
  ok('pembinaan tampil', await K.locator('tbody tr:has-text("Santri Uji UI")').count() === 1);
  // izin keluar: ajukan, setujui, keluar
  await go(K, 'izin-keluar'); await K.click('.btn:has-text("Ajukan izin")'); await K.waitForSelector('.modal'); await K.locator('.picker input').fill('U-2'); await K.waitForTimeout(700); await K.locator('.pick li').first().click();
  await K.locator('.modal input[type=text]').first().fill('Tujuan uji'); await K.click('.modal .btn:has-text("Simpan")'); await K.click('.modal .btn:has-text("Ya, simpan")'); await K.waitForTimeout(900);
  ok('izin menunggu persetujuan', await K.locator('tbody tr:has-text("Menunggu persetujuan")').count() === 1);
  await K.locator('tbody .btn:has-text("Detail")').click(); await K.waitForSelector('.modal'); await K.click('.modal .btn:has-text("Setujui")'); await K.click('.modal .btn:has-text("Ya, setujui")'); await K.waitForTimeout(900);
  await K.locator('tbody .btn:has-text("Detail")').click(); await K.waitForSelector('.modal'); await K.click('.modal .btn:has-text("Catat keluar")'); await K.click('.modal .btn:has-text("Simpan")'); await K.waitForTimeout(900);
  await go(K, 'monitoring'); ok('monitoring menampilkan santri belum kembali', await K.locator('tbody tr:has-text("Santri Uji UI2")').count() === 1); await K.screenshot({ path: S + 'monitoring.png' });
  await K.locator('tbody .btn:has-text("Catat kembali")').click(); await K.waitForSelector('.modal'); await K.click('.modal .btn:has-text("Simpan")'); await K.waitForTimeout(900); ok('setelah dicatat kembali, hilang dari monitoring', await K.locator('tbody tr').count() === 0);
  // profil + laporan
  await go(K, 'santri'); ok('daftar profil santri', await K.locator('tbody tr').count() === 2); await K.locator('tbody tr:has-text("Santri Uji UI2") a:has-text("Buka profil")').click(); await K.waitForTimeout(800);
  const pt = await K.locator('main, .content').first().innerText(); const bad = pt.match(/\b(Ayah|Ibu|KK|Tagihan|Tabungan|Saldo|Wali)\b/i); if (bad) console.log('  cocok:', bad[0], '|', pt.slice(Math.max(0, bad.index - 40), bad.index + 40).replace(/\n/g, ' ')); ok('profil memuat riwayat izin & tidak memuat data keluarga/keuangan', /IZK-/.test(pt) && !bad); await K.screenshot({ path: S + 'profil.png', fullPage: true });
  await go(K, 'laporan'); await K.waitForSelector('.receipt'); const [dl] = await Promise.all([K.waitForEvent('download'), K.click('a:has-text("Unduh PDF")')]); ok('unduh PDF laporan', /\.pdf$/.test(dl.suggestedFilename()));
  const [dx] = await Promise.all([K.waitForEvent('download'), K.click('a:has-text("Unduh Excel")')]); ok('unduh Excel laporan', /\.xlsx$/.test(dx.suggestedFilename()));
  await K.click('.btn:has-text("Cetak")'); await K.waitForSelector('.modal .receipt'); ok('pratinjau cetak memuat kop pondok', /Pondok Pesantren Alhidayah Induk/.test(await K.locator('.modal .receipt').innerText())); await K.click('.modal .btn:has-text("Tutup")'); await K.screenshot({ path: S + 'laporan.png' });
  // pembatasan role (URL langsung)
  for (const r of ['pengaturan']) { await K.goto(B + '/sima#/keamanan/' + r); await K.reload(); await K.waitForTimeout(700); ok('Keamanan tidak dapat membuka ' + r, (await K.locator('.empty b').first().textContent().catch(() => '')) === 'Akses ditolak'); }
  for (const r of ['bendahara/dashboard', 'bendahara/kas']) { await K.goto(B + '/sima#/' + r); await K.reload(); await K.waitForTimeout(700); ok('Keamanan ditolak ke ' + r, (await K.locator('.empty b').first().textContent().catch(() => '')) === 'Akses ditolak'); }
  const Be = await page(1200, 800, 'ben'); console.log('menu bendahara', await Be.locator('.sb__nav .nv, .sb__nav a').allTextContents());
  for (const r of ['dashboard', 'pelanggaran', 'izin-keluar', 'monitoring', 'laporan']) { await Be.goto(B + '/sima#/keamanan/' + r); await Be.reload(); await Be.waitForTimeout(700); ok('Bendahara ditolak ke keamanan/' + r, (await Be.locator('.empty b').first().textContent().catch(() => '')) === 'Akses ditolak' && (await Be.locator('.stat').count()) === 0); }
  // ponsel
  const M = await page(390, 800, 'kea');
  for (const r of ['dashboard', 'pelanggaran', 'pembinaan', 'izin-keluar', 'izin-pulang', 'monitoring', 'santri', 'laporan']) { await go(M, r); const o = await M.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok('ponsel ' + r + ' tanpa overflow horizontal (' + o + 'px)', o <= 1); }
  await go(M, 'dashboard'); await M.screenshot({ path: S + 'm_dash.png', fullPage: true }); await go(M, 'monitoring'); await M.screenshot({ path: S + 'm_mon.png' });
  const a2 = await page(1200, 800, 'admin'); await go(a2, 'dashboard'); ok('Super Admin membuka dashboard keamanan', (await a2.locator('.stat').count()) >= 8);
  console.log('ERROR JS/CSP:', errs); await b.close(); srv.close(); await db.close(); process.exit(0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 600)); process.exit(1); });
