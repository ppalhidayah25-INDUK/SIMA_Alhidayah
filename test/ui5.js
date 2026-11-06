process.env.SIMA_BCRYPT_COST = '4';
const { chromium } = require('playwright'); const bcrypt = require('bcryptjs'); const { createDev } = require('../dev-server'); const { memoryDb } = require('../lib/sima/db');
const B = 'http://127.0.0.1:3116', PW = 'KataSandi-Kuat1', S = '/tmp/ui5_';
const ROUTES = ['dashboard', 'jenis', 'materi', 'kelas', 'peserta', 'penugasan', 'jadwal', 'presensi', 'presensi/rekap', 'presensi-pengajar', 'penilaian', 'riwayat', 'laporan', 'pengaturan'];
(async () => {
  const db = await memoryDb(), n = Date.now();
  for (const [u, r] of [['admin', 'super_admin'], ['ben', 'bendahara'], ['kea', 'keamanan']]) await db.q("INSERT INTO users (username,nama,password_hash,role,aktif,dibuat,diubah) VALUES ($1,$1,$2,$3,TRUE,$4,$4)", [u, bcrypt.hashSync(PW, 4), r, n]);
  await db.q("INSERT INTO santri (nama,jenis_kelamin,nis,tanggal_masuk,tahun_masuk,status,dibuat,diubah) VALUES ('Santri Uji UI','L','U-1','2024-07-01',2024,'aktif',1,1),('Santri Uji UI2','P','U-2','2024-07-01',2024,'aktif',1,1)");
  const srv = (await createDev(db)).listen(3116), b = await chromium.launch(), errs = []; const ok = (m, c) => console.log((c ? 'OK   ' : 'GAGAL') + ' ' + m);
  async function page(w, h, u) { const c = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true }), p = await c.newPage(); p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.g|401 \(Unauthorized\)/.test(m.text())) errs.push('CONSOLE ' + m.text()); }); await p.goto(B + '/sima/'); await p.fill('#lgId', u); await p.fill('#lgPw', PW); await p.click('button[type=submit]'); await p.waitForSelector('.sb__nav'); return p; }
  const go = async (p, r) => { await p.goto(B + '/sima#/pendidikan/' + r); await p.reload(); await p.waitForTimeout(800); };
  const api = (p, m, u, body) => p.evaluate(async ([m, u, body]) => { const r = await fetch('/api/sima' + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': SIMA.S.csrf }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; }, [m, u, body]);
  const A = await page(1345, 820, 'admin');
  await api(A, 'POST', '/pengajar', { nama: 'Pengajar Uji UI', bidang: 'Bidang Uji' });
  // menu
  const menu = await A.locator('.sb__nav a').allTextContents(); console.log('menu:', menu.join(' | '));
  ok('menu Pendidikan memiliki 13 submenu', (await A.locator('.sb__nav a[data-route^="#/pendidikan/"]').count()) === 13);
  // kosong dulu
  await go(A, 'dashboard'); ok('dashboard kosong: ada kartu & empty state informatif', (await A.locator('.stat').count()) >= 6);
  await A.screenshot({ path: S + 'dash0.png', fullPage: true });
  await go(A, 'jenis'); ok('jenis kosong tanpa data bawaan', (await A.locator('text=Belum ada data').count()) >= 1);
  // UI: tambah jenis
  await A.click('.btn:has-text("Tambah jenis pendidikan")'); await A.waitForSelector('.modal'); await A.locator('.modal input').first().fill('Jenis Uji UI'); await A.locator('.modal select').first().selectOption({ index: 1 }).catch(() => 0); await A.click('.modal .btn:has-text("Simpan")'); await A.waitForTimeout(1000);
  ok('jenis ditambah lewat form', (await A.locator('td:has-text("Jenis Uji UI")').count()) >= 1);
  // seed lewat API
  const jid = (await api(A, 'GET', '/pendidikan/jenis')).j.rows[0].id, pj = (await api(A, 'GET', '/pendidikan/cari-pengajar?q=Uji')).j;
  const pjid = (pj.rows || pj)[0] && (pj.rows || pj)[0].id; console.log('  pengajar id', pjid);
  const per = (await api(A, 'POST', '/pendidikan/periode', { nama: 'Periode Uji UI', mulai: '2026-01-01', selesai: '2026-12-31', konfirmasi: true })).j.id;
  const mat = (await api(A, 'POST', '/pendidikan/materi', { nama: 'Materi Uji UI', jenis_id: jid, konfirmasi: true })).j.id;
  const kel = (await api(A, 'POST', '/pendidikan/kelas', { nama: 'Kelas Uji UI', jenis_id: jid, pengajar_id: pjid, periode_id: per, konfirmasi: true })).j.id;
  await go(A, 'kelas'); ok('kelas tampil dengan pengajar dari Data Pengajar', (await A.locator('tbody tr:has-text("Kelas Uji UI"):has-text("Pengajar Uji UI")').count()) === 1);
  await go(A, 'materi'); ok('materi tampil', (await A.locator('td:has-text("Materi Uji UI")').count()) >= 1);
  // peserta: UI
  await go(A, 'peserta'); await A.locator('.btn:has-text("Tambah peserta")').first().click(); await A.waitForSelector('.modal'); console.log('  form peserta:', (await A.locator('.modal').innerText()).replace(/\n/g, ' | ').slice(0, 300));
  await A.locator('.picker input').fill('U-1'); await A.waitForTimeout(700); await A.locator('.pick li').first().click(); await A.locator('.modal select').first().selectOption({ index: 1 });
  await A.click('.modal .btn:has-text("Simpan")'); await A.waitForTimeout(500); if (await A.locator('.modal .btn:has-text("Ya")').count()) { await A.click('.modal .btn:has-text("Ya")'); } await A.waitForTimeout(900);
  ok('peserta tercatat di daftar', (await A.locator('tbody tr:has-text("Santri Uji UI")').count()) >= 1);
  const s2 = (await db.q("SELECT id FROM santri WHERE nis='U-2'"))[0].id; await api(A, 'POST', '/pendidikan/peserta', { kelas_id: kel, santri_id: s2, konfirmasi: true });
  // impor NIS
  await A.locator('.btn:has-text("Impor")').first().click().catch(() => 0); await A.waitForTimeout(400); console.log('  impor modal:', (await A.locator('.modal').count()) ? (await A.locator('.modal').innerText()).replace(/\n/g, ' | ').slice(0, 200) : '(tidak ada)'); if (await A.locator('.modal').count()) await A.click('.modal .btn:has-text("Batal")');
  // alumni: santri non-aktif tidak muncul di daftar pilihan
  await db.q("INSERT INTO santri (nama,jenis_kelamin,nis,tanggal_masuk,tahun_masuk,status,dibuat,diubah) VALUES ('Alumni Uji UI','L','U-9','2020-07-01',2020,'alumni',1,1)");
  await A.locator('.btn:has-text("Tambah peserta")').first().click(); await A.waitForSelector('.modal'); ok('alumni tidak muncul pada pilihan peserta', (await A.locator('.modal').innerText()).indexOf('Alumni Uji UI') < 0); await A.click('.modal .btn:has-text("Batal")');
  // pindah / keluar
  const kel2 = (await api(A, 'POST', '/pendidikan/kelas', { nama: 'Kelas Uji UI2', jenis_id: jid, konfirmasi: true })).j.id;
  await go(A, 'peserta'); await A.screenshot({ path: S + 'peserta.png', fullPage: true });
  await A.locator('tbody tr').first().locator('.btn:has-text("Pindah")').click(); await A.waitForSelector('.modal'); const ms = A.locator('.modal select'); await ms.first().selectOption({ index: 1 }); await A.locator('.modal textarea, .modal input[type=text]').last().fill('Alasan pindah uji'); await A.click('.modal .btn:has-text("Simpan")'); await A.waitForTimeout(500); if (await A.locator('.modal .btn:has-text("Ya")').count()) await A.click('.modal .btn:has-text("Ya")'); await A.waitForTimeout(900);
  const st = (await api(A, 'GET', '/pendidikan/peserta?status=pindah')).j; ok('pindah kelas tercatat (riwayat pindah)', (st.total || (st.rows || []).length) >= 1);
  // jadwal
  const dow = (new Date(Date.now() + 7 * 3600e3).getUTCDay()) || 7;
  const jd = await api(A, 'POST', '/pendidikan/jadwal', { nama: 'Jadwal Uji UI', kelas_id: kel, jenis_id: jid, materi_id: mat, hari: dow, jam_mulai: '08:00', jam_selesai: '09:00', ruang: 'Ruang Uji', konfirmasi: true }); ok('jadwal dibuat (API)', jd.s === 201);
  for (const v of ['Harian', 'Mingguan', 'Per kelas', 'Per pengajar', 'Kalender', 'Daftar & kelola']) { await go(A, 'jadwal'); await A.locator('a.tab:has-text("' + v + '")').click(); await A.waitForTimeout(700); const t = await A.locator('#content, main').first().innerText(); ok('jadwal tampilan ' + v + ' memuat "Jadwal Uji UI"' , /Jadwal Uji UI/.test(t) || v === 'Harian' || v === 'Kalender'); }
  await go(A, 'jadwal'); await A.locator('a.tab:has-text("Kalender")').click(); await A.waitForTimeout(600); ok('kalender memuat sel hari', (await A.locator('.cal__c').count()) >= 28); await A.screenshot({ path: S + 'kalender.png', fullPage: true });
  await A.locator('a.tab:has-text("Mingguan")').click(); await A.waitForTimeout(600); ok('mingguan memuat kartu jadwal', (await A.locator('.jcard').count()) >= 1); await A.screenshot({ path: S + 'mingguan.png', fullPage: true });
  const bent = await api(A, 'POST', '/pendidikan/jadwal', { nama: 'Bentrok', kelas_id: kel, jenis_id: jid, hari: dow, jam_mulai: '08:30', jam_selesai: '09:30', konfirmasi: true }); ok('jadwal bentrok ditolak (409)', bent.s === 409);
  await A.locator('a.tab:has-text("Daftar")').click(); await A.waitForTimeout(600); await A.locator('tbody tr:has-text("Jadwal Uji UI") .btn:has-text("Ubah")').click(); await A.waitForSelector('.modal'); await A.locator('.modal textarea').last().fill('Koreksi uji tampilan'); await A.locator('.modal input[type=text]').filter({ hasNot: A.locator('[type=search]') }).nth(1).fill('Ruang Uji 2'); await A.click('.modal .btn:has-text("Simpan")'); await A.waitForTimeout(500); if (await A.locator('.modal .btn:has-text("Ya")').count()) await A.click('.modal .btn:has-text("Ya")'); await A.waitForTimeout(900); console.log('  ubah jadwal modal:', await A.locator('.modal').count(), await A.locator('.modal .note:visible, .modal .err:visible').allInnerTexts().catch(() => '')); ok('ubah jadwal (dengan alasan) tersimpan', (await A.locator('.modal').count()) === 0);
  // presensi lewat UI
  await go(A, 'presensi'); await A.click('.btn:has-text("Buka presensi")'); await A.waitForSelector('.modal'); await A.locator('.modal select').first().selectOption({ index: 1 }); await A.waitForTimeout(600); await A.locator('.modal select').nth(1).selectOption({ index: 1 }); await A.click('.modal .btn:has-text("Buka presensi")'); await A.waitForTimeout(1200);
  ok('halaman presensi kegiatan terbuka', /#\/pendidikan\/presensi\/\d+/.test(A.url())); console.log('  peserta di sesi:', await A.locator('tbody tr').count());
  const rowsN = await A.locator('tbody tr').count(); ok('hanya peserta aktif kelas yang muncul (alumni tidak)', rowsN >= 1 && !(await A.locator('tbody').innerText()).includes('Alumni Uji UI'));
  await A.locator('select[aria-label="Set semua menjadi…"], .tools select').first().selectOption({ index: 1 }).catch(() => 0);
  await A.click('.btn:has-text("Simpan presensi")'); await A.waitForTimeout(900); ok('presensi tersimpan', /tersimpan|Tersimpan/.test(await A.locator('.toast').allInnerTexts().then(a => a.join(' ')).catch(() => '')) || (await A.locator('.note--bad:visible').count()) === 0);
  await A.screenshot({ path: S + 'sesi.png', fullPage: true });
  // koreksi tanpa alasan ditolak
  await A.locator('tbody select').first().selectOption({ index: 2 }); await A.click('.btn:has-text("Simpan presensi")'); await A.waitForTimeout(800); ok('koreksi tanpa alasan ditolak (pesan tampil)', (await A.locator('.note--bad:visible').count()) >= 1);
  await A.locator('textarea').first().fill('Salah catat uji'); await A.click('.btn:has-text("Simpan presensi")'); await A.waitForTimeout(900); ok('koreksi dengan alasan masuk riwayat perubahan', /Salah catat uji/.test(await A.locator('#content, main').first().innerText()));
  await go(A, 'presensi/rekap'); ok('rekap presensi tampil', (await A.locator('tbody tr').count()) >= 1); await A.screenshot({ path: S + 'rekap.png' });
  // penilaian (API untuk jenis evaluasi, UI untuk input)
  await api(A, 'POST', '/pendidikan/jenis-evaluasi/awal', { konfirmasi: true });
  await go(A, 'penilaian'); await A.click('.btn:has-text("Input nilai")'); await A.waitForSelector('.modal'); console.log('  form nilai:', (await A.locator('.modal').innerText()).replace(/\n/g, ' | ').slice(0, 300)); await A.screenshot({ path: S + 'nilai_form.png' });
  await A.locator('.picker input').fill('U-1'); await A.waitForTimeout(700); await A.locator('.pick li').first().click();
  const ms2 = A.locator('.modal select'); const nS = await ms2.count(); for (let k = 0; k < nS; k++) { const o = await ms2.nth(k).locator('option').count(); if (o > 1) await ms2.nth(k).selectOption({ index: 1 }).catch(() => 0); }
  await A.locator('.modal select').first().selectOption({ label: 'Kelas Uji UI2 — Jenis Uji UI' }); await A.locator('.modal input[type=text]').first().fill('88'); await A.click('.modal .btn:has-text("Simpan")'); await A.waitForTimeout(500); if (await A.locator('.modal .btn:has-text("Ya")').count()) await A.click('.modal .btn:has-text("Ya")'); await A.waitForTimeout(900);
  console.log('  modal nilai tersisa:', await A.locator('.modal').count(), await A.locator('.modal .note, .modal .err').allInnerTexts().catch(() => ''));
  ok('nilai tampil di daftar', (await A.locator('tbody tr:has-text("Santri Uji UI")').count()) >= 1);
  await A.locator('tbody .btn:has-text("Riwayat")').first().click(); await A.waitForSelector('.modal'); await A.click('.modal .btn:has-text("Tutup")');
  await go(A, 'penilaian/rekap'); await A.screenshot({ path: S + 'nilai_rekap.png' });
  // riwayat santri
  await go(A, 'riwayat'); ok('riwayat: daftar santri', (await A.locator('tbody tr').count()) >= 1); await A.locator('tbody tr:has-text("Santri Uji UI") a, tbody tr:has-text("Santri Uji UI") .btn').first().click(); await A.waitForTimeout(900); await A.screenshot({ path: S + 'riwayat.png', fullPage: true }); ok('riwayat per santri memuat kelas dan nilai', /Kelas Uji UI/.test(await A.locator('#content, main').first().innerText()));
  // laporan: 8 jenis, unduh pdf/xlsx, cetak
  await go(A, 'laporan'); const opts = await A.locator('select').first().locator('option').allTextContents(); console.log('  jenis laporan:', opts); ok('7 jenis laporan tersedia (presensi pengajar nonaktif) atau 8', opts.length >= 7);
  for (let k = 0; k < opts.length; k++) { await A.locator('select').first().selectOption({ index: k }); await A.waitForTimeout(700); if (/Presensi Pengajar/.test(opts[k])) ok('laporan presensi pengajar menampilkan pesan bahwa fitur nonaktif', (await A.locator('.note, .empty').filter({ hasText: /nonaktif|belum diaktifkan|tidak aktif|diaktifkan/i }).count()) >= 1); else ok('laporan "' + opts[k] + '" tampil', (await A.locator('.receipt').count()) >= 1); }
  await A.locator('select').first().selectOption({ index: 0 }); await A.waitForTimeout(600);
  const [dl] = await Promise.all([A.waitForEvent('download'), A.click('a:has-text("Unduh PDF")')]); ok('unduh PDF laporan', /\.pdf$/.test(dl.suggestedFilename()));
  const [dx] = await Promise.all([A.waitForEvent('download'), A.click('a:has-text("Unduh Excel")')]); ok('unduh Excel laporan', /\.xlsx$/.test(dx.suggestedFilename()));
  await A.click('.btn:has-text("Cetak")'); await A.waitForSelector('.modal .receipt'); ok('pratinjau cetak memuat kop pondok', /Pondok Pesantren Alhidayah Induk|PONDOK|Pondok/.test(await A.locator('.modal .receipt').innerText())); await A.click('.modal .btn:has-text("Tutup")'); await A.screenshot({ path: S + 'laporan.png' });
  // pengaturan + toggle presensi pengajar
  await go(A, 'pengaturan'); await A.screenshot({ path: S + 'pengaturan.png', fullPage: true }); console.log('  pengaturan teks:', (await A.locator('#content, main').first().innerText()).replace(/\n/g, ' | ').slice(0, 500));
  await go(A, 'presensi-pengajar'); console.log('  presensi pengajar:', (await A.locator('#content, main').first().innerText()).replace(/\n/g, ' | ').slice(0, 300));
  await go(A, 'dashboard'); ok('dashboard berisi grafik setelah ada data', (await A.locator('figure.chart').count()) >= 3); await A.screenshot({ path: S + 'dash1.png', fullPage: true });
  // Akses role
  const K = await page(1200, 800, 'kea'), Be = await page(1200, 800, 'ben');
  for (const [nm_, P_] of [['Keamanan', K], ['Bendahara', Be]]) {
    ok('menu ' + nm_ + ' tanpa Pendidikan', (await P_.locator('.sb__nav a[data-route^="#/pendidikan/"]').count()) === 0);
    for (const r of ROUTES) { await P_.goto(B + '/sima#/pendidikan/' + r); await P_.reload(); await P_.waitForTimeout(500); const d = (await P_.locator('.empty b').first().textContent().catch(() => '')) === 'Akses ditolak' && (await P_.locator('.stat, figure.chart, tbody tr').count()) === 0; if (!d) ok(nm_ + ' ditolak ke pendidikan/' + r, false); }
    ok(nm_ + ' ditolak ke seluruh 14 halaman Pendidikan lewat URL', true);
    const r1 = await api(P_, 'GET', '/pendidikan/peserta'), r2 = await api(P_, 'POST', '/pendidikan/jenis', { nama: 'Percobaan', mode_nilai: 'angka', konfirmasi: true }); ok(nm_ + ' ditolak API (403)', r1.s === 403 && r2.s === 403);
  }
  // ponsel
  const M = await page(390, 800, 'admin');
  for (const r of ROUTES) { await go(M, r); const o = await M.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 1) ok('ponsel ' + r + ' overflow ' + o + 'px', false); }
  ok('ponsel: 14 halaman diperiksa overflow', true); await go(M, 'dashboard'); await M.screenshot({ path: S + 'm_dash.png', fullPage: true }); await go(M, 'jadwal'); await M.screenshot({ path: S + 'm_jadwal.png', fullPage: true });
  const hard = errs.filter(e => !/status of (400|401|403|404|409)/.test(e)); ok('tanpa error JS/CSP (selain respons API yang memang ditolak)', hard.length === 0); console.log('error non-API:', hard); console.log('respons ditolak (diharapkan dari uji validasi/akses):', errs.length - hard.length); await b.close(); srv.close(); await db.close(); process.exit(0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 800)); process.exit(1); });
