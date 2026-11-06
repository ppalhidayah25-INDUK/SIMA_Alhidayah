process.env.SIMA_BCRYPT_COST = '4';
const { chromium } = require('playwright'); const bcrypt = require('bcryptjs'); const sharp = require('sharp'); const fs = require('fs'); const { createDev } = require('../dev-server'); const { memoryDb } = require('../lib/sima/db');
const B = 'http://127.0.0.1:3117', PW = 'KataSandi-Kuat1', S = '/tmp/ui6_';
const ROUTES = ['dashboard', 'semua', 'tambah', 'kategori', 'unggulan', 'galeri', 'upload', 'video', 'kategori-galeri', 'media', 'statistik'];
(async () => {
  const db = await memoryDb(), n = Date.now();
  for (const [u, r] of [['admin', 'super_admin'], ['ben', 'bendahara'], ['kea', 'keamanan']]) await db.q("INSERT INTO users (username,nama,password_hash,role,aktif,dibuat,diubah) VALUES ($1,$1,$2,$3,TRUE,$4,$4)", [u, bcrypt.hashSync(PW, 4), r, n]);
  const png = '/tmp/ui6_foto.png'; await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 30, g: 120, b: 80 } } }).png().toFile(png);
  const srv = (await createDev(db)).listen(3117), b = await chromium.launch(), errs = []; const ok = (m, c) => console.log((c ? 'OK   ' : 'GAGAL') + ' ' + m);
  async function page(w, h, u) { const c = await b.newContext({ viewport: { width: w, height: h } }), p = await c.newPage(); p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.g|401 \(Unauthorized\)/.test(m.text())) errs.push('CONSOLE ' + m.text()); }); await p.goto(B + '/sima/'); await p.fill('#lgId', u); await p.fill('#lgPw', PW); await p.click('button[type=submit]'); await p.waitForSelector('.sb__nav'); return p; }
  const go = async (p, r) => { await p.goto(B + '/sima#/berita/' + r); await p.reload(); await p.waitForTimeout(900); };
  const A = await page(1345, 820, 'admin');
  ok('menu Berita & Galeri memiliki 11 submenu', (await A.locator('.sb__nav a[data-route^="#/berita/"]').count()) === 11);
  await go(A, 'dashboard'); ok('dashboard kosong: kartu statistik + empty state', (await A.locator('.stat').count()) >= 8 && (await A.locator('text=Belum ada berita').count()) >= 1);
  await go(A, 'semua'); ok('daftar berita kosong tanpa berita dummy', (await A.locator('text=Belum ada berita').count()) >= 1);
  // kategori via UI
  await go(A, 'kategori'); await A.click('.btn:has-text("Muat contoh kategori")'); await A.waitForSelector('.modal'); await A.click('.modal .btn:has-text("Ya, muat")'); await A.waitForTimeout(900);
  ok('kategori berita contoh dimuat lewat UI', (await A.locator('td:has-text("Kegiatan Pondok")').count()) >= 1);
  await A.click('.btn:has-text("Tambah kategori")'); await A.waitForSelector('.modal'); await A.locator('.modal input').first().fill('Kategori Uji UI'); await A.click('.modal .btn:has-text("Simpan")'); await A.waitForTimeout(800);
  ok('kategori baru ditambah', (await A.locator('td:has-text("Kategori Uji UI")').count()) >= 1);
  await go(A, 'kategori-galeri'); await A.click('.btn:has-text("Muat contoh kategori")'); await A.waitForSelector('.modal'); await A.click('.modal .btn:has-text("Ya, muat")'); await A.waitForTimeout(900);
  ok('kategori galeri contoh (Pencak Silat) termuat', (await A.locator('td:has-text("Pencak Silat")').count()) >= 1);
  // upload foto (galeri) lewat UI
  await go(A, 'upload'); await A.setInputFiles('input[type=file]', png); await A.waitForTimeout(500);
  ok('pratinjau foto tampil sebelum disimpan', (await A.locator('.kt-up img').count()) === 1);
  await A.locator('.kt-up input').first().fill('Latihan Pencak Silat Uji'); await A.locator('select').nth(0).selectOption({ label: 'Pencak Silat' }); await A.locator('select').nth(1).selectOption('terbit'); await A.click('.btn:has-text("Unggah dan simpan")'); await A.waitForTimeout(1800);
  ok('foto tersimpan & tampil di Semua Dokumentasi', /#\/berita\/galeri/.test(A.url()) && (await A.locator('td:has-text("Latihan Pencak Silat Uji")').count()) >= 1);
  await go(A, 'media'); ok('Media Library memuat foto yang diunggah', (await A.locator('tbody tr').count()) >= 1);
  // tambah berita lewat editor
  await go(A, 'tambah'); await A.locator('.kt-form input[type=text]').first().fill('Berita Uji Lewat Editor');
  ok('slug otomatis dari judul', (await A.locator('.kt-form input[type=text]').nth(1).inputValue()) === 'berita-uji-lewat-editor');
  await A.locator('.ked').click(); await A.keyboard.type('Paragraf pertama berita uji.'); await A.locator('.ked__bar button[aria-label="Tebal"]').click(); await A.keyboard.type(' tebal'); await A.keyboard.press('Enter'); await A.locator('.ked__bar button:has-text("Subjudul")').click(); await A.keyboard.type('Subjudul uji');
  await A.locator('.kt-side select').nth(1).selectOption({ label: 'Kegiatan Pondok' });
  await A.locator('.kt-side .btn:has-text("Pilih / unggah gambar utama")').click(); await A.waitForSelector('.modal .kt-cell'); await A.locator('.modal .kt-cell').first().click(); await A.waitForTimeout(300);
  ok('gambar utama dipilih dari Media Library', (await A.locator('.kt-pick img').count()) >= 1);
  await A.locator('.kt-side .btn:has-text("Pilih dokumentasi dari galeri")').click(); await A.waitForSelector('.modal .kt-cell'); await A.locator('.modal .kt-cell').first().click(); await A.click('.modal .btn:has-text("Gunakan pilihan")'); await A.waitForTimeout(300);
  ok('dokumentasi galeri ditautkan ke berita', (await A.locator('.kt-sel').count()) === 1);
  await A.screenshot({ path: S + 'form.png', fullPage: true });
  await A.click('.btn:has-text("Simpan & terbitkan")'); await A.waitForSelector('.modal'); await A.click('.modal .btn:has-text("Ya, terbitkan")'); await A.waitForTimeout(1500);
  ok('berita tersimpan dan halaman ubah terbuka', /#\/berita\/ubah\/\d+/.test(A.url()));
  const row = (await db.q("SELECT status,slug,isi_html FROM cms_berita WHERE judul='Berita Uji Lewat Editor'"))[0]; console.log('  isi_html:', row && row.status, row && row.isi_html); ok('berita terbit di DB, isi tersanitasi', row && row.status === 'terbit' && /<strong>/.test(row.isi_html) && /<h3>/.test(row.isi_html));
  // publik
  const pub = await A.context().newPage(); await pub.goto(B + '/berita'); ok('/berita menampilkan berita terbit', (await pub.locator('text=Berita Uji Lewat Editor').count()) >= 1);
  await pub.goto(B + '/berita/berita-uji-lewat-editor'); ok('detail berita: judul, isi, OG', (await pub.locator('h1:has-text("Berita Uji Lewat Editor")').count()) === 1 && (await pub.locator('meta[property="og:title"]').count()) === 1);
  await pub.screenshot({ path: S + 'detail.png', fullPage: true });
  await pub.goto(B + '/'); await pub.waitForTimeout(1500); ok('beranda memuat berita dari SIMA', (await pub.locator('text=Berita Uji Lewat Editor').count()) >= 1);
  await pub.goto(B + '/#/galeri/dokumentasi'); await pub.waitForTimeout(1500); ok('halaman Galeri › Dokumentasi menampilkan foto terbit', (await pub.locator('#dk-page img').count()) >= 1);
  await pub.goto(B + '/#/galeri/ekstrakurikuler/silat'); await pub.waitForTimeout(1500); await pub.screenshot({ path: S + 'silat.png' });
  // daftar admin + arsip lewat UI
  await go(A, 'semua'); ok('berita tampil di daftar admin', (await A.locator('tbody tr:has-text("Berita Uji Lewat Editor")').count()) === 1);
  await A.locator('tbody tr:has-text("Berita Uji Lewat Editor") .btn:has-text("Arsipkan")').click(); await A.waitForSelector('.modal'); await A.click('.modal .btn:has-text("Ya, arsipkan")'); await A.waitForTimeout(900);
  await pub.goto(B + '/berita/berita-uji-lewat-editor'); ok('berita yang diarsipkan tidak dapat dibuka publik (404)', (await pub.locator('h1:has-text("Berita Uji Lewat Editor")').count()) === 0);
  // hapus dokumentasi terpakai -> peringatan
  await go(A, 'galeri'); await A.locator('tbody tr:has-text("Latihan Pencak Silat Uji") .btn:has-text("Hapus")').click(); await A.waitForSelector('.modal'); await A.click('.modal .btn:has-text("Ya, hapus")'); await A.waitForTimeout(900);
  ok('hapus dokumentasi terpakai berita memunculkan peringatan relasi', (await A.locator('.modal:has-text("Berita Uji Lewat Editor")').count()) >= 1); await A.keyboard.press('Escape'); await A.waitForTimeout(300);
  await go(A, 'statistik'); ok('statistik konten memuat grafik', (await A.locator('.chart').count()) >= 4);
  await go(A, 'unggulan'); ok('halaman unggulan memuat pengaturan jumlah', (await A.locator('input[type=number]').count()) === 3);
  // peran lain ditolak
  for (const u of ['ben', 'kea']) { const P = await page(1345, 820, u); ok(u + ': menu Berita tidak tampil', (await P.locator('.sb__nav a[data-route^="#/berita/"]').count()) === 0); await P.goto(B + '/sima#/berita/dashboard'); await P.reload(); await P.waitForTimeout(900); ok(u + ': URL langsung #/berita/dashboard ditolak', (await P.locator('.stat').count()) === 0 && (await P.locator('text=Belum ada berita').count()) === 0); const r = await P.evaluate(async () => (await fetch('/api/sima/konten/dashboard')).status); ok(u + ': API konten 403', r === 403); }
  // ponsel
  const M = await page(390, 800, 'admin'); for (const r of ROUTES) { await go(M, r); const o = await M.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 1) ok('ponsel ' + r + ' overflow ' + o + 'px', false); }
  ok('ponsel: 11 halaman diperiksa overflow', true); await go(M, 'tambah'); await M.screenshot({ path: S + 'm_tambah.png', fullPage: true });
  const pm = await M.context().newPage(); for (const u of ['/berita', '/']) { await pm.goto(B + u); await pm.waitForTimeout(800); const o = await pm.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 1) ok('ponsel publik ' + u + ' overflow ' + o + 'px', false); } ok('ponsel: halaman publik diperiksa overflow', true);
  const hard = errs.filter(e => !/status of (400|401|403|404|409)/.test(e)); ok('tanpa error JS/CSP (selain respons API yang memang ditolak)', hard.length === 0); console.log('error non-API:', hard); console.log('respons ditolak:', errs.length - hard.length);
  await b.close(); srv.close(); process.exit(0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 900)); process.exit(1); });
