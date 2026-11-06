'use strict';
// Pengujian Tahap 7 (laporan terpusat, ekspor, backup/restore, pengaturan, keamanan akun, log, konsistensi). Semua data = DATA UJI di database memori.
const ExcelJS = require('exceljs'); const zlib = require('zlib');
module.exports = async function tahap7(X) {
  const { t, client, adm, ben, kea, get, q, A, assert, rejects, db, mk, PW, uid, base } = X;
  const ok = (r, st = 200) => { assert.strictEqual(r.status, st, `status ${r.status}: ${(r.text || '').slice(0, 300)}`); return r.json; };
  const err = async (p, st) => { const r = await p; assert.strictEqual(r.status, st, `diharapkan ${st}, dapat ${r.status}: ${(r.text || '').slice(0, 260)}`); return r.json; };
  const G = (c, u) => c.req('GET', A + u), P = (c, u, b) => c.req('POST', A + u, Object.assign({ konfirmasi: true }, b)), PU = (c, u, b) => c.req('PUT', A + u, Object.assign({ konfirmasi: true }, b));
  const n = Date.now();
  await ben.login('bendahara1', PW); await kea.login('keamanan1', PW);

  // data uji untuk laporan
  const as1 = (await q("INSERT INTO asrama (jenis,nama) VALUES ('putra','Asrama Uji Putra') RETURNING id"))[0].id, as2 = (await q("INSERT INTO asrama (jenis,nama) VALUES ('putri','Asrama Uji Putri') RETURNING id"))[0].id;
  const k1 = (await q("INSERT INTO kamar (asrama_id,nama,kapasitas) VALUES ($1,'K-Uji-1',2) RETURNING id", [as1]))[0].id, k2 = (await q("INSERT INTO kamar (asrama_id,nama,kapasitas) VALUES ($1,'K-Uji-2',3) RETURNING id", [as2]))[0].id;
  const sn = (nis, nama, jk, kamar, st = 'aktif', alum = null) => q("INSERT INTO santri (nis,nama,jenis_kelamin,tanggal_masuk,tahun_masuk,status,status_alumni,kamar_id,tanggal_keluar,tahun_keluar,dibuat,diubah) VALUES ($1,$2,$3,'2024-07-01',2024,$4,$5,$6,$7,$8,$9,$9)", [nis, nama, jk, st, alum, kamar, alum ? '2026-01-10' : null, alum ? 2026 : null, n]);
  await sn('T7-001', 'Santri Uji Satu', 'L', k1); await sn('T7-002', 'Santri Uji Dua', 'L', k1); await sn('T7-003', 'Santri Uji Tiga', 'P', k2); await sn('T7-004', 'Alumni Uji Putra', 'L', null, 'alumni', 'lulus'); await sn('T7-005', 'Alumni Uji Putri', 'P', null, 'alumni', 'berhenti');
  await q("INSERT INTO pengurus (kelompok,nama,jabatan,aktif,jenis_kelamin,dibuat,diubah) VALUES ('putra','Pengurus Uji A','Ketua',TRUE,'L',$1,$1),('putri','Pengurus Uji B','Sekretaris',FALSE,'P',$1,$1)", [n]);
  await q("INSERT INTO pengajar (nama,bidang,aktif,dibuat,diubah) VALUES ('Pengajar Tujuh Uji','Fikih',TRUE,$1,$1)", [n]);

  await t('7a. Akses: Pengaturan/Backup/Log/Konsistensi hanya Super Admin (403 role lain, 401 tanpa login)', async () => {
    for (const u of ['/pengaturan', '/backup', '/log', '/log/ref', '/pengaturan/konsistensi', '/pengaturan/kesiapan']) { for (const c of [ben, kea]) await err(G(c, u), 403); await err(client().req('GET', A + u), 401); }
    for (const c of [ben, kea]) { await err(P(c, '/backup', {}), 403); await err(PU(c, '/pengaturan', { identitas: { nama: 'X' } }), 403); await err(P(c, '/backup/paket/1/pulihkan', { teks: 'PULIHKAN', password: PW }), 403); await err(G(c, '/users/1/sesi'), 403); await err(P(c, '/users/1/pemulihan', {}), 403); }
    await err(client().req('GET', A + '/backup/cron'), 503);
  });
  await t('7b. Katalog laporan per role: Super Admin 7 kelompok; Bendahara hanya Bendahara; Keamanan hanya Keamanan', async () => {
    const a = ok(await G(adm, '/laporan/katalog')).kelompok, b = ok(await G(ben, '/laporan/katalog')).kelompok, k = ok(await G(kea, '/laporan/katalog')).kelompok;
    assert.deepStrictEqual(a.map(x => x.id), ['santri', 'pp', 'asrama', 'bendahara', 'keamanan', 'pendidikan', 'konten']); assert.deepStrictEqual(b.map(x => x.id), ['bendahara']); assert.deepStrictEqual(k.map(x => x.id), ['keamanan']);
    const sub = a.find(x => x.id === 'bendahara').sub.map(s => s.judul); assert.ok(/Pembayaran/.test(sub[0]) && /Tabungan/.test(sub[1]) && /Kas/.test(sub[2]), 'pembayaran, tabungan, kas terpisah');
    for (const c of [ben, kea]) { await err(G(c, '/laporan/data/santri-putra'), 403); await err(G(c, '/laporan/data/berita-semua'), 403); }
    await err(G(adm, '/laporan/data/tidak-ada'), 404);
  });
  await t('7c. Laporan data santri/alumni/asrama/pengurus/pengajar: isi sesuai database & filter', async () => {
    const sp = ok(await G(adm, '/laporan/data/santri-putra?q=T7-')); assert.strictEqual(sp.rows.length, 2); assert.ok(sp.rows.every(r => /Uji/.test(r.nama)) && sp.rows.every(r => !/Alumni/.test(r.nama)), 'alumni tidak ikut daftar santri aktif'); assert.ok(sp.pondok && sp.filter.length && sp.dibuat_pada);
    assert.strictEqual(ok(await G(adm, '/laporan/data/santri-putri?q=T7-')).rows.length, 1);
    assert.strictEqual(ok(await G(adm, '/laporan/data/santri-putra?q=Uji Dua')).rows.length, 1);
    assert.strictEqual(ok(await G(adm, `/laporan/data/santri-putra?q=T7-&kamar_id=${k1}`)).rows.length, 2);
    assert.strictEqual(ok(await G(adm, '/laporan/data/alumni-putra?q=T7-')).rows.length, 1); assert.strictEqual(ok(await G(adm, '/laporan/data/alumni-putri?q=T7-&status_alumni=berhenti')).rows.length, 1); assert.strictEqual(ok(await G(adm, '/laporan/data/alumni-putri?q=T7-&status_alumni=lulus')).rows.length, 0);
    const rs = ok(await G(adm, '/laporan/data/rekap-santri')).rows, tot = (await get("SELECT COUNT(*) FILTER (WHERE status='aktif' AND NOT diarsipkan)::int a, COUNT(*) FILTER (WHERE status='alumni')::int l FROM santri")); assert.strictEqual(rs[0].jumlah, tot.a); assert.strictEqual(rs[1].jumlah, tot.l); assert.strictEqual(rs[2].jumlah, rs[0].jumlah + rs[1].jumlah);
    assert.ok(ok(await G(adm, '/laporan/data/rekap-status')).rows.length >= 2); assert.ok(ok(await G(adm, '/laporan/data/rekap-santri-asrama')).rows.some(r => r.kamar === 'K-Uji-1' && r.penghuni === 2));
    assert.strictEqual(ok(await G(adm, '/laporan/data/pengurus-putra')).rows.filter(r => /Uji A/.test(r.nama)).length, 1); assert.strictEqual(ok(await G(adm, '/laporan/data/pengurus-putri?status=aktif')).rows.filter(r => /Uji B/.test(r.nama)).length, 0); assert.strictEqual(ok(await G(adm, '/laporan/data/pengurus-putri?status=nonaktif')).rows.filter(r => /Uji B/.test(r.nama)).length, 1);
    const sk = ok(await G(adm, '/laporan/data/struktur-pengurus')).rows; assert.ok(sk.some(r => /Uji A/.test(r.nama)) && !sk.some(r => /Uji B/.test(r.nama)), 'struktur hanya pengurus aktif'); assert.strictEqual(ok(await G(adm, '/laporan/data/pengajar?q=Tujuh Uji')).rows.length, 1); assert.ok(ok(await G(adm, '/laporan/data/rekap-pp')).rows.length >= 2);
    assert.strictEqual(ok(await G(adm, '/laporan/data/asrama-putra')).rows.find(r => r.nama === 'Asrama Uji Putra').penghuni, 2); const km = ok(await G(adm, '/laporan/data/kamar')).rows; assert.strictEqual(km.find(r => r.kamar === 'K-Uji-1').sisa, 0); assert.strictEqual(km.find(r => r.kamar === 'K-Uji-2').penghuni, 1);
    assert.ok(ok(await G(adm, '/laporan/data/kapasitas')).rows.length >= 2); const kt = ok(await G(adm, '/laporan/data/keterisian')).rows; assert.ok(kt.some(r => /Penuh/.test(r.tingkat)));
  });
  await t('7d. Laporan berita & galeri: status efektif benar, filter, statistik', async () => {
    const mkb = (judul, st, tp) => q("INSERT INTO cms_berita (judul,slug,isi_html,status,terbit_pada,dibuat,diubah) VALUES ($1,$2,'<p>x</p>',$3,$4,$5,$5)", [judul, judul.toLowerCase().replace(/ /g, '-'), st, tp, n]);
    await mkb('Berita T7 Terbit', 'terbit', n - 1000); await mkb('Berita T7 Draft', 'draft', null); await mkb('Berita T7 Jadwal', 'terjadwal', n + 86400000); await mkb('Berita T7 Arsip', 'arsip', n - 5000); await mkb('Berita T7 Telat', 'terjadwal', n - 500);
    const c = async id => ok(await G(adm, '/laporan/data/' + id)).rows.map(r => r.judul).filter(x => /T7/.test(x)).sort();
    assert.deepStrictEqual(await c('berita-terbit'), ['Berita T7 Terbit', 'Berita T7 Telat'].sort(), 'terjadwal yang waktunya lewat dihitung terbit'); assert.deepStrictEqual(await c('berita-draft'), ['Berita T7 Draft']); assert.deepStrictEqual(await c('berita-terjadwal'), ['Berita T7 Jadwal']); assert.deepStrictEqual(await c('berita-arsip'), ['Berita T7 Arsip']); assert.strictEqual((await c('berita-semua')).length, 5);
    await q("INSERT INTO cms_galeri (jenis,judul,slug,video_url,video_penyedia,video_kode,status,dibuat,diubah) VALUES ('video','Video T7','video-t7','https://youtu.be/abcdefghijk','youtube','abcdefghijk','terbit',$1,$1)", [n]);
    assert.strictEqual(ok(await G(adm, '/laporan/data/dokumentasi?jenis=video&q=T7')).rows.length, 1); assert.strictEqual(ok(await G(adm, '/laporan/data/dokumentasi?jenis=foto&q=T7')).rows.length, 0);
    const st = ok(await G(adm, '/laporan/data/statistik-konten')); assert.ok(st.ringkasan[0][1] >= 2 && st.ringkasan[1][1] >= 1);
  });
  await t('7e. Ekspor PDF/Excel mengikuti filter; jumlah baris sama dengan tampilan; tercatat di log', async () => {
    const before = (await get("SELECT COUNT(*)::int n FROM activity_log WHERE aksi='unduh' AND modul='laporan'")).n;
    const x = await adm.buf(A + '/laporan/data/santri-putra?q=T7-002&format=xlsx'); assert.strictEqual(x.status, 200); assert.ok(/spreadsheetml/.test(x.headers.get('content-type'))); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x.buf); const txt = []; wb.worksheets[0].eachRow(r => txt.push(r.values.join('|'))); const j = txt.join('\n');
    assert.ok(/Santri Uji Dua/.test(j) && !/Santri Uji Satu/.test(j), 'ekspor mengikuti filter'); assert.ok(/Alhidayah/i.test(j), 'identitas pondok ada');
    const p = await adm.buf(A + '/laporan/data/santri-putra?q=T7-&format=pdf'); assert.strictEqual(p.status, 200); assert.strictEqual(p.buf.slice(0, 4).toString(), '%PDF');
    const m = ok(await G(adm, '/laporan/data/santri-putra?q=T7-')); assert.strictEqual(m.rows.length, 2);
    assert.strictEqual((await get("SELECT COUNT(*)::int n FROM activity_log WHERE aksi='unduh' AND modul='laporan'")).n, before + 2);
    // laporan modul lain tetap memakai hak aksesnya
    for (const u of ['/keuangan/laporan/pembayaran?format=xlsx', '/keuangan/laporan/saldo-kas?format=pdf']) assert.strictEqual((await ben.buf(A + u)).status, 200, u);
    assert.strictEqual((await ben.buf(A + '/keamanan/laporan/pelanggaran?format=pdf')).status, 403); assert.strictEqual((await kea.buf(A + '/keuangan/laporan/pembayaran?format=pdf')).status, 403);
    assert.strictEqual((await kea.buf(A + '/keamanan/laporan/pelanggaran?format=xlsx')).status, 200);
  });
  await t('7f. Identitas pondok di Pengaturan tampil pada kop laporan (semua modul)', async () => {
    await err(PU(adm, '/pengaturan', { identitas: { nama: 'X' } }), 400); await err(adm.req('PUT', A + '/pengaturan', { identitas: { nama: 'Pondok Uji Tahap Tujuh' } }), 400);
    ok(await PU(adm, '/pengaturan', { identitas: { nama: 'Pondok Uji Tahap Tujuh', alamat: 'Alamat uji', kontak: '08123' } }));
    assert.strictEqual(ok(await G(adm, '/laporan/data/rekap-santri')).pondok, 'Pondok Uji Tahap Tujuh'); assert.strictEqual(ok(await G(ben, '/keuangan/laporan/pembayaran')).pondok, 'Pondok Uji Tahap Tujuh'); assert.strictEqual(ok(await G(kea, '/keamanan/laporan/pelanggaran')).pondok, 'Pondok Uji Tahap Tujuh');
  });
  await t('7g. Pengaturan sesi & backup: validasi rentang; perubahan berlaku & tercatat', async () => {
    let r = await err(PU(adm, '/pengaturan', { sesi: { idle_menit: 1, mutlak_jam: 12, maks_gagal: 5, kunci_menit: 15 } }), 400); assert.ok(r.fields.sesi_idle_menit);
    await err(PU(adm, '/pengaturan', { backup: { otomatis: true, frekuensi: 'sesukanya', hari_minggu: 0, retensi_jumlah: 14, retensi_hari: 60 } }), 400); await err(PU(adm, '/pengaturan', { backup: { otomatis: true, frekuensi: 'harian', hari_minggu: 0, retensi_jumlah: 1, retensi_hari: 60 } }), 400);
    ok(await PU(adm, '/pengaturan', { sesi: { idle_menit: 90, mutlak_jam: 10, maks_gagal: 5, kunci_menit: 15 }, backup: { otomatis: false, frekuensi: 'harian', hari_minggu: 1, retensi_jumlah: 3, retensi_hari: 30 } }));
    const s = ok(await G(adm, '/pengaturan')); assert.strictEqual(s.sesi.idle_menit, 90); assert.strictEqual(s.backup.retensi_jumlah, 3); assert.strictEqual(s.hak_akses.length, 3, 'tepat tiga role');
    assert.ok((await get("SELECT COUNT(*)::int n FROM activity_log WHERE aksi='ubah_pengaturan'")).n >= 2);
    ok(await PU(adm, '/pengaturan', { sesi: { idle_menit: 120, mutlak_jam: 12, maks_gagal: 5, kunci_menit: 15 } }));
  });
  let pk;
  await t('7h. Backup manual: dua berkas (database + berkas) dibuat, diverifikasi, ukuran/waktu/status tercatat', async () => {
    await err(adm.req('POST', A + '/backup', {}), 400);
    const r = ok(await P(adm, '/backup', {}), 201); assert.ok(r.ok && r.hasil.length === 2 && r.hasil.every(h => h.status === 'terverifikasi' && h.ukuran > 0)); pk = r.paket;
    const l = ok(await G(adm, '/backup')); assert.ok(l.terakhir_berhasil === pk && l.rows.length >= 2 && l.rows.every(x => !('isi' in x))); assert.ok(l.rows[0].petugas === 'admin' && l.rows[0].selesai >= l.rows[0].mulai);
    assert.ok((await get("SELECT COUNT(*)::int n FROM activity_log WHERE aksi='backup' AND keterangan LIKE '%terverifikasi%'")).n >= 1);
  });
  await t('7i. Unduh backup: hanya Super Admin; isi gzip valid memuat data santri; tidak ada kredensial DB', async () => {
    const id = (await get("SELECT id FROM sys_backup WHERE paket=$1 AND jenis='database'", [pk])).id;
    assert.strictEqual((await ben.buf(`${A}/backup/${id}/unduh`)).status, 403); assert.strictEqual((await client().buf(`${A}/backup/${id}/unduh`)).status, 401);
    const d = await adm.buf(`${A}/backup/${id}/unduh`); assert.strictEqual(d.status, 200); assert.ok(/\.simabak"/.test(d.headers.get('content-disposition')));
    const txt = zlib.gunzipSync(d.buf).toString(); assert.ok(/Santri Uji Satu/.test(txt)); assert.ok(!/DATABASE_URL|postgres(ql)?:\/\//.test(txt), 'tanpa kredensial');
    assert.ok(!/"isi":"\\\\x/.test(zlib.gunzipSync((await adm.buf(`${A}/backup/${(await get("SELECT id FROM sys_backup WHERE paket=$1 AND jenis='database'", [pk])).id}/unduh`)).buf).toString()), 'berkas biner tidak ikut backup database');
    for (const u of ['/sima/', '/', '/media/1', '/api/sima/pub/berita']) { const r = await fetch(base() + u); assert.ok(!(r.headers.get('content-type') || '').includes('gzip'), u); }
  });
  await t('7j. Verifikasi menolak backup rusak: status gagal, tidak dapat diunduh/dipulihkan', async () => {
    const r2 = ok(await P(adm, '/backup', {}), 201); const id = (await get("SELECT id FROM sys_backup WHERE paket=$1 AND jenis='database'", [r2.paket])).id;
    const cur = (await get('SELECT isi FROM sys_backup WHERE id=$1', [id])).isi; const bad = Buffer.from(cur); bad[bad.length - 12] ^= 0xff; await q('UPDATE sys_backup SET isi=$1 WHERE id=$2', [bad, id]);
    const v = ok(await P(adm, `/backup/${id}/verifikasi`, {})); assert.strictEqual(v.status, 'gagal'); assert.ok(v.ket);
    await err(adm.req('GET', `${A}/backup/${id}/unduh`), 409); await err(P(adm, `/backup/paket/${r2.paket}/pulihkan`, { teks: 'PULIHKAN', password: PW }), 409);
    await q('UPDATE sys_backup SET isi=$1 WHERE id=$2', [cur, id]); assert.strictEqual(ok(await P(adm, `/backup/${id}/verifikasi`, {})).status, 'terverifikasi');
  });
  await t('7k. Retensi: paket lama dibersihkan isinya, riwayat tetap, paket terverifikasi terbaru selalu aman', async () => {
    for (let i = 0; i < 4; i++) ok(await P(adm, '/backup', {}), 201);
    const r = ok(await P(adm, '/backup/bersihkan', {})); assert.ok(r.dibersihkan >= 2);
    const l = ok(await G(adm, '/backup')); const ada = new Set(l.rows.filter(x => x.ada_isi).map(x => x.paket)); assert.ok(ada.size <= 3 + 0, 'maks. sesuai retensi (3)'); assert.ok(l.rows.some(x => !x.ada_isi && x.dibersihkan), 'riwayat tetap tampil'); assert.ok(ada.has(l.terakhir_berhasil));
    await err(adm.req('GET', `${A}/backup/${(await get('SELECT id FROM sys_backup WHERE isi IS NULL AND dibersihkan IS NOT NULL LIMIT 1')).id}/unduh`), 410);
  });
  await t('7l. Backup terjadwal (cron): wajib rahasia benar; hormati pengaturan & frekuensi', async () => {
    process.env.CRON_SECRET = 'rahasia-uji-cron-1234567890'; const call = (tok) => fetch(base() + A + '/backup/cron', { headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
    assert.strictEqual((await call()).status, 401); assert.strictEqual((await call('salah-salah')).status, 401);
    let r = await (await call(process.env.CRON_SECRET)).json(); assert.ok(/tidak aktif/.test(r.dilewati));
    ok(await PU(adm, '/pengaturan', { backup: { otomatis: true, frekuensi: 'harian', hari_minggu: 0, retensi_jumlah: 5, retensi_hari: 30 } }));
    const b0 = (await get("SELECT COUNT(*)::int n FROM sys_backup WHERE pemicu='terjadwal'")).n; r = await (await call(process.env.CRON_SECRET)).json(); assert.ok(r.ok && r.paket); assert.strictEqual((await get("SELECT COUNT(*)::int n FROM sys_backup WHERE pemicu='terjadwal' AND status='terverifikasi'")).n, b0 + 2);
    r = await (await call(process.env.CRON_SECRET)).json(); assert.ok(/Belum waktunya/.test(r.dilewati), 'tidak ganda dalam sehari'); assert.ok((await get("SELECT COUNT(*)::int n FROM activity_log WHERE aksi='backup' AND username='sistem'")).n >= 1); delete process.env.CRON_SECRET;
  });
  await t('7m. Pemulihan: wajib konfirmasi teks + password + backup kondisi terbaru; data kembali; sesi diakhiri; tercatat', async () => {
    const pkt = ok(await P(adm, '/backup', {}), 201).paket; await q("INSERT INTO santri (nis,nama,jenis_kelamin,tanggal_masuk,tahun_masuk,status,dibuat,diubah) VALUES ('T7-999','Santri Setelah Backup','L','2024-07-01',2024,'aktif',1,1)");
    await err(P(adm, `/backup/paket/${pkt}/pulihkan`, { teks: 'pulihkan', password: PW }), 400); await err(P(adm, `/backup/paket/${pkt}/pulihkan`, { teks: 'PULIHKAN', password: 'salah-salah' }), 403); await err(adm.req('POST', `${A}/backup/paket/${pkt}/pulihkan`, { teks: 'PULIHKAN', password: PW }), 400);
    assert.strictEqual((await get("SELECT COUNT(*)::int n FROM santri WHERE nis='T7-999'")).n, 1, 'belum berubah sebelum pemulihan sah');
    const r = ok(await P(adm, `/backup/paket/${pkt}/pulihkan`, { teks: 'PULIHKAN', password: PW })); assert.ok(r.tabel > 50 && r.login_ulang && r.paket_sebelum);
    assert.strictEqual((await get("SELECT COUNT(*)::int n FROM santri WHERE nis='T7-999'")).n, 0, 'data setelah backup hilang (kembali ke kondisi backup)'); assert.strictEqual((await get("SELECT COUNT(*)::int n FROM santri WHERE nis='T7-001'")).n, 1);
    assert.strictEqual((await adm.req('GET', A + '/me')).status, 401, 'sesi lama diakhiri'); await adm.login('admin', PW);
    const pre = await q("SELECT jenis, status FROM sys_backup WHERE paket=$1", [r.paket_sebelum]); assert.ok(pre.length === 2 && pre.every(x => x.status === 'terverifikasi'), 'backup sebelum pemulihan tersedia');
    assert.ok((await get("SELECT COUNT(*)::int n FROM activity_log WHERE aksi='pemulihan'")).n >= 1);
    // kembalikan dari backup kondisi sebelum pemulihan → data "setelah backup" muncul lagi (pemulihan dapat dibatalkan)
    ok(await P(adm, `/backup/paket/${r.paket_sebelum}/pulihkan`, { teks: 'PULIHKAN', password: PW })); await adm.login('admin', PW); assert.strictEqual((await get("SELECT COUNT(*)::int n FROM santri WHERE nis='T7-999'")).n, 1);
    await q("DELETE FROM santri WHERE nis='T7-999'").catch(() => { }); await q('ALTER TABLE santri DISABLE TRIGGER USER'); await q("DELETE FROM santri WHERE nis='T7-999'"); await q('ALTER TABLE santri ENABLE TRIGGER USER');
    await ben.login('bendahara1', PW); await kea.login('keamanan1', PW);
    const ins = await q("INSERT INTO santri (nis,nama,jenis_kelamin,tanggal_masuk,tahun_masuk,status,dibuat,diubah) VALUES ('T7-SEQ','Cek Sekuens','L','2024-07-01',2024,'aktif',1,1) RETURNING id"); assert.ok(ins[0].id > 0, 'sekuens benar setelah pemulihan');
  });
  await t('7n. Pemulihan ke basis data lain (prosedur uji): paket diunduh → dipulihkan ke DB kosong; skema berbeda ditolak', async () => {
    const { memoryDb } = require('../lib/sima/db'); const B = require('../lib/sima/backup'); const pkt = ok(await P(adm, '/backup', {}), 201).paket;
    const rows = await q('SELECT isi FROM sys_backup WHERE paket=$1 ORDER BY jenis', [pkt]), bufs = rows.map(r => Buffer.from(r.isi));
    const alt = await memoryDb(); const hasil = await B.pulihkan(alt, bufs); assert.ok(hasil.baris > 0);
    const a = (await alt.q('SELECT COUNT(*)::int n FROM santri'))[0].n, b = (await q('SELECT COUNT(*)::int n FROM santri'))[0].n; assert.strictEqual(a, b); assert.strictEqual((await alt.q('SELECT COUNT(*)::int n FROM users'))[0].n, (await q('SELECT COUNT(*)::int n FROM users'))[0].n);
    await alt.q('ALTER TABLE santri ADD COLUMN IF NOT EXISTS kolom_baru TEXT'); await rejects(B.pulihkan(alt, bufs), /Skema database tujuan berbeda/); await rejects(B.pulihkan(alt, [bufs[0]]), /paket lengkap/);
    assert.strictEqual((await alt.q('SELECT COUNT(*)::int n FROM santri'))[0].n, b, 'penolakan tidak mengubah data tujuan'); await alt.close();
  });
  await t('7o. Keamanan akun: ubah password sendiri (validasi, sesi lain diakhiri), pemulihan akun dengan password sementara wajib ganti', async () => {
    await mk('t7user', 'bendahara', PW); const u = client(), u2 = client(); await u.login('t7user', PW); await u2.login('t7user', PW);
    await err(u.req('POST', A + '/me/password', { lama: 'salah-salah-1A', baru: 'PasswordBaru-123' }), 400); await err(u.req('POST', A + '/me/password', { lama: PW, baru: 'lemah' }), 400); await err(u.req('POST', A + '/me/password', { lama: PW, baru: PW }), 400);
    ok(await u.req('POST', A + '/me/password', { lama: PW, baru: 'PasswordBaru-123' })); assert.strictEqual((await u2.req('GET', A + '/me')).status, 401, 'sesi lain diakhiri'); assert.strictEqual((await u.req('GET', A + '/me')).status, 200, 'sesi ini tetap');
    assert.strictEqual((await client().login('t7user', PW)).status, 401); const nx = client(); assert.strictEqual((await nx.login('t7user', 'PasswordBaru-123')).status, 200);
    const id = await uid('t7user'); await err(P(ben, `/users/${id}/pemulihan`, {}), 403); const r = ok(await P(adm, `/users/${id}/pemulihan`, {})); assert.ok(r.password_sementara.length >= 12); assert.strictEqual((await nx.req('GET', A + '/me')).status, 401);
    assert.ok(!(await get("SELECT 1 x FROM activity_log WHERE keterangan LIKE '%' || $1 || '%'", [r.password_sementara])), 'password sementara tidak masuk log'); assert.ok(/^\$2/.test((await get('SELECT password_hash h FROM users WHERE id=$1', [id])).h));
    const t2 = client(); assert.strictEqual((await t2.login('t7user', r.password_sementara)).json.wajib_ganti, true); const blok = await t2.req('GET', A + '/keuangan/dashboard'); assert.strictEqual(blok.status, 403); assert.strictEqual(blok.json.kode, 'wajib_ganti'); assert.strictEqual((await t2.req('GET', A + '/me')).status, 200);
    ok(await t2.req('POST', A + '/me/password', { lama: r.password_sementara, baru: 'PasswordFinal-456' })); assert.strictEqual((await t2.req('GET', A + '/keuangan/dashboard')).status, 200);
    await err(P(adm, `/users/${await uid('admin')}/pemulihan`, {}), 409);
  });
  await t('7p. Riwayat login, sesi aktif, buka kunci; akun nonaktif tidak bisa login; Super Admin dilindungi', async () => {
    const id = await uid('t7user'); const rl = ok(await G(adm, `/users/${id}/riwayat-login`)).rows; assert.ok(rl.some(r => r.aksi === 'login') && rl.some(r => r.aksi === 'ubah_password'));
    const ss = ok(await G(adm, `/users/${id}/sesi`)).rows; assert.ok(ss.length >= 1 && ss[0].ref && !('id' in ss[0]) && !('csrf' in ss[0])); ok(await P(adm, `/users/${id}/sesi/akhiri`, {})); assert.strictEqual(ok(await G(adm, `/users/${id}/sesi`)).rows.length, 0);
    const c = client(); for (let i = 0; i < 5; i++) await c.login('t7user', 'salah-salah-1A'); assert.strictEqual((await c.login('t7user', 'PasswordFinal-456')).status, 429); ok(await P(adm, `/users/${id}/buka-kunci`, {})); assert.strictEqual((await client().login('t7user', 'PasswordFinal-456')).status, 200);
    ok(await adm.req('PATCH', `${A}/users/${id}`, { aktif: false })); assert.strictEqual((await client().login('t7user', 'PasswordFinal-456')).status, 401);
    await mk('t7super', 'super_admin', PW); const sid = await uid('t7super'); const r = await adm.req('PATCH', `${A}/users/${sid}`, { aktif: false }); assert.strictEqual(r.status, 409); assert.ok(r.json.perlu_konfirmasi);
    ok(await adm.req('PATCH', `${A}/users/${sid}`, { aktif: false, konfirmasi_super_admin: true })); await q("UPDATE users SET aktif=FALSE WHERE role='super_admin' AND username<>'admin'");
    const last = await adm.req('PATCH', `${A}/users/${await uid('admin')}`, { aktif: false, konfirmasi_super_admin: true }); assert.strictEqual(last.status, 409);
  });
  await t('7q. Activity log: kolom role, filter modul/aksi/akun/tanggal/pencarian, halaman, ekspor; append-only', async () => {
    const a = ok(await G(adm, '/log')); assert.ok(a.total > 20 && a.rows.length === 25 && a.size === 25); assert.ok(a.rows.every(r => 'role' in r && 'modul' in r && 'aksi' in r));
    const f = ok(await G(adm, '/log?modul=sistem&aksi=backup')); assert.ok(f.rows.length >= 1 && f.rows.every(r => r.modul === 'sistem' && r.aksi === 'backup')); assert.ok(f.rows.some(r => r.role === 'super_admin'));
    assert.ok(ok(await G(adm, '/log?role=bendahara')).rows.every(r => r.role === 'bendahara')); assert.ok(ok(await G(adm, '/log?q=t7user')).rows.length >= 1); assert.strictEqual(ok(await G(adm, '/log?dari=2000-01-01&sampai=2000-01-02')).total, 0);
    const p2 = ok(await G(adm, '/log?page=2')); assert.ok(p2.rows[0].id < a.rows[24].id + 1 && p2.page === 2); const ref = ok(await G(adm, '/log/ref')); assert.ok(ref.modul.includes('sistem') && ref.aksi.includes('pemulihan'));
    const x = await adm.buf(A + '/log?modul=sistem&format=xlsx'); assert.strictEqual(x.status, 200); assert.strictEqual((await adm.buf(A + '/log?format=pdf')).buf.slice(0, 4).toString(), '%PDF');
    await rejects(q("UPDATE activity_log SET keterangan='x' WHERE id=1"), /append-only/); await rejects(q('DELETE FROM activity_log'), /append-only/);
    for (const aksi of ['login', 'logout', 'backup', 'pemulihan', 'ubah_pengaturan', 'ubah_password', 'pemulihan_akun']) assert.ok((await get('SELECT COUNT(*)::int n FROM activity_log WHERE aksi=$1', [aksi])).n >= 1, 'log ' + aksi);
    assert.ok(!(await get("SELECT 1 x FROM activity_log WHERE keterangan ILIKE '%password_hash%' OR keterangan LIKE '%$2a$%' OR keterangan LIKE '%$2b$%'")), 'tidak ada hash/rahasia di log');
  });
  await t('7r. Pemeriksaan konsistensi data: bersih pada data baik; mendeteksi relasi berita–galeri yang rusak', async () => {
    let c = ok(await G(adm, '/pengaturan/konsistensi')); assert.ok(c.rows.length >= 14 && c.ringkas.error === 0, JSON.stringify(c.rows.filter(r => r.status === 'error'))); const bad = c.rows.filter(r => r.status === 'perhatian').map(r => r.id); assert.ok(bad.every(x => ['riwayat_status', 'super_admin'].includes(x)), 'tak terduga: ' + bad);
    const bid = (await get("SELECT id FROM cms_berita WHERE judul='Berita T7 Terbit'")).id, gid = (await get("SELECT id FROM cms_galeri WHERE slug='video-t7'")).id;
    await q('INSERT INTO cms_berita_galeri (berita_id,galeri_id,urutan) VALUES ($1,$2,1)', [bid, gid]); await q('UPDATE cms_galeri SET dihapus=$1 WHERE id=$2', [Date.now(), gid]);
    c = ok(await G(adm, '/pengaturan/konsistensi')); assert.strictEqual(c.rows.find(r => r.id === 'berita_galeri').masalah, 1); await q('UPDATE cms_galeri SET dihapus=NULL WHERE id=$1', [gid]); assert.strictEqual(ok(await G(adm, '/pengaturan/konsistensi')).rows.find(r => r.id === 'berita_galeri').masalah, 0);
  });
  await t('7s. Kesiapan produksi: tidak membocorkan nilai rahasia; tabel sys_* tak dapat dibaca role lain', async () => {
    process.env.CRON_SECRET = 'rahasia-uji-cron-1234567890'; const r = await G(adm, '/pengaturan/kesiapan'); assert.ok(r.json.rows.length >= 8); assert.ok(!r.text.includes(process.env.CRON_SECRET) && !/postgres(ql)?:\/\//.test(r.text)); delete process.env.CRON_SECRET;
    const as = (role, sql) => db.tx(async x => { await x(`SET LOCAL ROLE ${role}`); return x(sql); });
    for (const role of ['sima_keuangan', 'sima_keamanan', 'sima_publik']) for (const tb of ['sys_backup', 'sys_pengaturan']) await rejects(as(role, `SELECT * FROM ${tb}`), /permission denied/i, role + ' ' + tb);
  });
  await t('7t. Tetap tepat tiga role; sesi: pengaturan idle/mutlak berlaku', async () => {
    await rejects(q("INSERT INTO users (username,nama,password_hash,role,aktif,dibuat,diubah) VALUES ('rolebaru','x','x','kepala',TRUE,1,1)"), /check|violates/i);
    ok(await PU(adm, '/pengaturan', { sesi: { idle_menit: 5, mutlak_jam: 12, maks_gagal: 3, kunci_menit: 15 } })); const c = client(); await c.login('bendahara1', PW);
    await q('UPDATE sessions SET aktivitas=$1 WHERE user_id=$2', [Date.now() - 6 * 60000, await uid('bendahara1')]); assert.strictEqual((await c.req('GET', A + '/me')).status, 401, 'idle 5 menit berlaku');
    ok(await PU(adm, '/pengaturan', { sesi: { idle_menit: 120, mutlak_jam: 12, maks_gagal: 5, kunci_menit: 15 } })); await ben.login('bendahara1', PW);
  });
  await t('7u. Dashboard Super Admin memuat ringkasan keuangan, keamanan, pendidikan, konten, backup; role lain tetap hanya wewenangnya', async () => {
    const d = ok(await G(adm, '/dashboard')); for (const k of ['keuangan', 'keamanan', 'pendidikan', 'konten']) assert.ok(d[k] && Object.values(d[k]).every(v => v !== undefined), k);
    assert.ok(Number.isFinite(Number(d.keuangan.saldo_kas)) && d.konten.berita_terbit >= 2 && d.konten.berita_draft >= 1 && d.konten.video >= 1); assert.ok('backup_terakhir' in d);
    for (const c of [ben, kea]) { const r = ok(await G(c, '/dashboard')); assert.deepStrictEqual(Object.keys(r), ['role'], 'tidak ada data lintas modul'); }
    assert.ok('tagihan' in ok(await G(ben, '/keuangan/dashboard'))); await err(G(kea, '/keuangan/dashboard'), 403); await err(G(ben, '/keamanan/dashboard'), 403);
  });
};
