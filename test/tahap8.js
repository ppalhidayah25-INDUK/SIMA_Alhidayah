'use strict';
// Pengujian Tahap 8 (impor / migrasi data). Semua data = DATA UJI di database memori, bukan data produksi.
const ExcelJS = require('exceljs');
module.exports = async function tahap8(X) {
  const { t, client, adm, ben, kea, get, q, A, assert, PW } = X;
  const ok = (r, st = 200) => { assert.strictEqual(r.status, st, `status ${r.status}: ${(r.text || '').slice(0, 300)}`); return r.json; };
  const err = async (p, st) => { const r = await p; assert.strictEqual(r.status, st, `diharapkan ${st}, dapat ${r.status}: ${(r.text || '').slice(0, 260)}`); return r.json; };
  const G = (c, u) => c.req('GET', A + u), P = (c, u, b) => c.req('POST', A + u, b);
  const jenis = ok(await G(adm, '/impor/jenis')).jenis, kol = id => jenis.find(j => j.id === id).kolom.map(k => k.t);
  async function xlsx(id, rows, header) { const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Data'); ws.addRow(header || kol(id)); rows.forEach(r => ws.addRow(r)); return (await wb.xlsx.writeBuffer()).toString('base64'); }
  const baris = (id, obj) => kol(id).map(t => obj[t] ?? '');
  const analisis = (id, isi, nama = 'uji.xlsx') => adm.req('POST', A + '/impor/analisis', { jenis: id, nama_berkas: nama, isi });
  const jalan = (id, b) => adm.req('POST', A + `/impor/${id}/jalankan`, Object.assign({ konfirmasi: true }, b));
  const hit = async tb => Number((await get(`SELECT COUNT(*)::int n FROM ${tb}`)).n);

  await t('8a. Impor hanya Super Admin (403 role lain, 401 tanpa login)', async () => {
    await ben.login('bendahara1', PW); await kea.login('keamanan1', PW);
    for (const u of ['/impor', '/impor/jenis', '/impor/template/asrama']) { for (const c of [ben, kea]) await err(G(c, u), 403); await err(client().req('GET', A + u), 401); }
    for (const c of [ben, kea]) { await err(P(c, '/impor/analisis', { jenis: 'asrama', isi: 'x' }), 403); await err(P(c, '/impor/1/jalankan', { konfirmasi: true }), 403); }
  });
  await t('8b. Template Excel/CSV tersedia untuk 9 jenis, kolom = definisi, lembar Petunjuk tidak berisi data', async () => {
    assert.strictEqual(jenis.length, 9);
    for (const j of jenis) {
      const r = await adm.buf(A + '/impor/template/' + j.id); assert.strictEqual(r.status, 200);
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf);
      assert.deepStrictEqual(wb.getWorksheet('Data').getRow(1).values.slice(1), j.kolom.map(k => k.t)); assert.strictEqual(wb.getWorksheet('Data').rowCount, 1); assert.ok(wb.getWorksheet('Petunjuk'));
    }
    assert.strictEqual((await adm.buf(A + '/impor/template/asrama?format=csv')).status, 200); await err(G(adm, '/impor/template/xxx'), 404);
  });
  let asId;
  await t('8c. Asrama: pratinjau tidak menyimpan; duplikat, enum salah, dobel di berkas terdeteksi; impor setelah konfirmasi', async () => {
    await q("INSERT INTO asrama (jenis,nama) VALUES ('putra','Asrama Lama T8')");
    const before = await hit('asrama');
    const isi = await xlsx('asrama', [baris('asrama', { Jenis: 'putra', 'Nama Asrama': 'Asrama Baru T8A' }), baris('asrama', { Jenis: 'putri', 'Nama Asrama': 'Asrama Baru T8B', Status: 'aktif' }), baris('asrama', { Jenis: 'putra', 'Nama Asrama': 'asrama lama t8' }), baris('asrama', { Jenis: 'campur', 'Nama Asrama': 'X' }), baris('asrama', { Jenis: 'putra', 'Nama Asrama': 'Asrama Baru T8A' })]);
    const a = ok(await analisis('asrama', isi), 201); assert.deepStrictEqual([a.total, a.valid, a.gagal, a.duplikat], [5, 2, 1, 2]); assert.strictEqual(await hit('asrama'), before, 'pratinjau tidak boleh menyimpan');
    assert.ok(a.masalah.some(m => m.baris === 5 && m.status === 'gagal') && a.masalah.some(m => m.baris === 4 && m.status === 'duplikat'));
    await err(P(adm, `/impor/${a.id}/jalankan`, {}), 400);                               // tanpa konfirmasi
    await err(jalan(a.id, {}), 409);                                                      // ada gagal/duplikat tanpa persetujuan lewati
    const r = ok(await jalan(a.id, { lewati: true })); assert.strictEqual(r.diimpor, 2); assert.strictEqual(await hit('asrama'), before + 2);
    await err(jalan(a.id, { lewati: true }), 409);                                        // tidak bisa dua kali
    assert.strictEqual((await get("SELECT nama FROM asrama WHERE nama='Asrama Lama T8'")).nama, 'Asrama Lama T8', 'data lama tidak ditimpa');
    assert.strictEqual(ok(await adm.req('POST', A + `/impor/${a.id}/verifikasi`, {})).sesuai, true); asId = a.id;
  });
  await t('8d. Kamar: relasi asrama divalidasi (tidak ada / ambigu), kapasitas, dobel; impor atomik', async () => {
    await q("INSERT INTO asrama (jenis,nama) VALUES ('putri','Asrama Lama T8')");     // nama sama di putra & putri → ambigu
    const isi = await xlsx('kamar', [baris('kamar', { Asrama: 'Asrama Baru T8A', 'Nama Kamar': 'T8-K1', Kapasitas: 2 }), baris('kamar', { Asrama: 'Asrama Baru T8B', 'Nama Kamar': 'T8-K2', Kapasitas: 3 }), baris('kamar', { Asrama: 'Tidak Ada', 'Nama Kamar': 'Z', Kapasitas: 2 }), baris('kamar', { Asrama: 'Asrama Lama T8', 'Nama Kamar': 'Q', Kapasitas: 2 }), baris('kamar', { Asrama: 'Asrama Lama T8', 'Jenis Asrama': 'putri', 'Nama Kamar': 'Q', Kapasitas: 2 }), baris('kamar', { Asrama: 'Asrama Baru T8A', 'Nama Kamar': 'T8-K3', Kapasitas: 0 })]);
    const a = ok(await analisis('kamar', isi), 201); assert.deepStrictEqual([a.valid, a.gagal, a.duplikat], [3, 3, 0]);
    ok(await jalan(a.id, { lewati: true })); assert.strictEqual(await hit('kamar') >= 3, true);
  });
  let santriImp;
  await t('8e. Santri putra: NIS dobel (DB & berkas), tanggal/enum salah, kamar berkapasitas, CSV titik-koma, impor + riwayat', async () => {
    await q("INSERT INTO santri (nis,nama,jenis_kelamin,dibuat,diubah) VALUES ('T8-001','Santri Lama Tidak Boleh Berubah','L',1,1)");
    const R = o => baris('santri_putra', o);
    const isi = await xlsx('santri_putra', [R({ NIS: 'T8-001', 'Nama Lengkap': 'Nama Baru Dobel DB' }), R({ NIS: 'T8-002', 'Nama Lengkap': 'Santri Uji Dua', 'Tanggal Lahir': '17/05/2010', 'Tahun Masuk': 2022, 'Nama Ayah': 'Ayah Uji', Asrama: 'Asrama Baru T8A', Kamar: 'T8-K1' }),
      R({ NIS: 'T8-003', 'Nama Lengkap': 'Santri Uji Tiga', 'Tahun Masuk': 2023, 'Nama Wali': 'Wali Uji', Asrama: 'Asrama Baru T8A', Kamar: 'T8-K1' }), R({ NIS: 'T8-004', 'Nama Lengkap': 'Santri Uji Empat', Asrama: 'Asrama Baru T8A', Kamar: 'T8-K1' }),
      R({ NIS: 'T8-002', 'Nama Lengkap': 'Dobel Berkas' }), R({ NIS: 'T8-005', 'Nama Lengkap': 'Tanggal Salah', 'Tanggal Lahir': '31/02/2010' }), R({ NIS: 'T8-006', 'Nama Lengkap': 'Enum Salah', 'Status Ayah': 'mungkin' }), R({ NIS: 'T8 007', 'Nama Lengkap': 'NIS Spasi' }), R({ NIS: 'T8-008', 'Nama Lengkap': 'Asrama Putri Salah', Asrama: 'Asrama Baru T8B', Kamar: 'T8-K2' }), R({ NIS: '', 'Nama Lengkap': 'Tanpa NIS' })]);
    const a = ok(await analisis('santri_putra', isi), 201);
    assert.strictEqual(a.total, 10); assert.strictEqual(a.duplikat, 2, JSON.stringify(a.masalah)); assert.strictEqual(a.gagal, 6, JSON.stringify(a.masalah.map(m => [m.baris, m.pesan]))); assert.strictEqual(a.valid + a.peringatan, 2);
    assert.ok(a.masalah.some(m => /Kapasitas/.test(m.pesan.join())), 'kamar penuh terdeteksi'); assert.ok(a.masalah.some(m => /bukan asrama putra/.test(m.pesan.join())));
    const bk = await adm.buf(A + `/impor/${a.id}?format=xlsx`); assert.strictEqual(bk.status, 200);
    const r = ok(await jalan(a.id, { lewati: true })); assert.strictEqual(r.diimpor, 2);
    assert.strictEqual((await get("SELECT nama FROM santri WHERE nis='T8-001'")).nama, 'Santri Lama Tidak Boleh Berubah', 'tidak menimpa');
    const s = await get("SELECT s.id, s.status, s.jenis_kelamin, s.tahun_masuk, k.nama kamar FROM santri s JOIN kamar k ON k.id=s.kamar_id WHERE s.nis='T8-002'"); assert.deepStrictEqual([s.status, s.jenis_kelamin, s.tahun_masuk, s.kamar], ['aktif', 'L', 2022, 'T8-K1']);
    assert.strictEqual(Number((await get("SELECT COUNT(*)::int n FROM riwayat_status WHERE santri_id=$1 AND jenis='dibuat'", [s.id])).n), 1); assert.strictEqual(Number((await get("SELECT COUNT(*)::int n FROM riwayat_penempatan WHERE santri_id=$1 AND jenis='penempatan_baru'", [s.id])).n), 1);
    assert.strictEqual(Number((await get("SELECT COUNT(*)::int n FROM sys_impor WHERE payload IS NOT NULL AND status<>'pratinjau'")).n), 0, 'payload data pribadi dibersihkan setelah selesai'); santriImp = a.id;
    // CSV titik-koma
    const csv = Buffer.from(kol('santri_putra').join(';') + '\r\n' + kol('santri_putra').map(k => ({ NIS: 'T8-CSV1', 'Nama Lengkap': 'Santri CSV Satu' })[k] || '').join(';') + '\r\n').toString('base64');
    const c = ok(await analisis('santri_putra', csv, 'uji.csv'), 201); assert.strictEqual(c.valid + c.peringatan, 1); ok(await jalan(c.id, {})); assert.strictEqual((await get("SELECT nama FROM santri WHERE nis='T8-CSV1'")).nama, 'Santri CSV Satu');
  });
  await t('8f. Alumni, pengurus (jabatan harus ada), pengajar (dobel nama+kontak)', async () => {
    const al = await xlsx('alumni_putri', [baris('alumni_putri', { NIS: 'T8-A01', 'Nama Lengkap': 'Alumni Uji Satu', 'Status Alumni': 'lulus', 'Tahun Keluar': 2020, 'Tahun Masuk': 2014 }), baris('alumni_putri', { NIS: 'T8-A02', 'Nama Lengkap': 'Alumni Tahun Salah', 'Status Alumni': 'lulus', 'Tahun Keluar': 2010, 'Tahun Masuk': 2014 }), baris('alumni_putri', { NIS: 'T8-A03', 'Nama Lengkap': 'Tanpa Status', 'Tahun Keluar': 2020 })]);
    const a = ok(await analisis('alumni_putri', al), 201); assert.deepStrictEqual([a.valid + a.peringatan, a.gagal], [1, 2]); ok(await jalan(a.id, { lewati: true }));
    const al1 = await get("SELECT status, status_alumni, jenis_kelamin, kamar_id FROM santri WHERE nis='T8-A01'"); assert.deepStrictEqual([al1.status, al1.status_alumni, al1.jenis_kelamin, al1.kamar_id], ['alumni', 'lulus', 'P', null]);
    await q("INSERT INTO jabatan (kelompok,nama,dibuat,diubah) VALUES ('putra','Ketua Uji T8',1,1)");
    const pg = await xlsx('pengurus_putra', [baris('pengurus_putra', { Nama: 'Pengurus Uji T8', Jabatan: 'Ketua Uji T8' }), baris('pengurus_putra', { Nama: 'Pengurus Jabatan Hilang', Jabatan: 'Tidak Ada' }), baris('pengurus_putra', { Nama: 'Pengurus Uji T8', Jabatan: 'ketua uji t8' })]);
    const p = ok(await analisis('pengurus_putra', pg), 201); assert.deepStrictEqual([p.valid + p.peringatan, p.gagal, p.duplikat], [1, 1, 1]); ok(await jalan(p.id, { lewati: true }));
    const pr = await get("SELECT kelompok, jenis_kelamin, jabatan_id FROM pengurus WHERE nama='Pengurus Uji T8'"); assert.deepStrictEqual([pr.kelompok, pr.jenis_kelamin], ['putra', 'L']); assert.ok(pr.jabatan_id);
    const pj = await xlsx('pengajar', [baris('pengajar', { Nama: 'Pengajar Uji T8', Bidang: 'Nahwu', Kontak: '08123' }), baris('pengajar', { Nama: 'pengajar uji t8', Kontak: '08123' }), baris('pengajar', { Nama: 'Pengajar Uji T8', Kontak: '08999' })]);
    const j = ok(await analisis('pengajar', pj), 201); assert.deepStrictEqual([j.valid + j.peringatan, j.duplikat], [2, 1]); ok(await jalan(j.id, { lewati: true }));
    assert.strictEqual(Number((await get("SELECT COUNT(*)::int n FROM pengajar_penugasan pp JOIN pengajar p ON p.id=pp.pengajar_id WHERE p.nama='Pengajar Uji T8'")).n), 1);
  });
  await t('8g. Validasi berkas: kolom wajib hilang, berkas rusak, terlalu besar, jenis tidak dikenal; atomik saat data berubah; batal', async () => {
    await err(analisis('santri_putra', await xlsx('santri_putra', [['x']], ['Kolom Lain'])), 400);
    await err(analisis('santri_putra', Buffer.from('bukan berkas apapun').toString('base64')), 400);
    await err(analisis('santri_putra', Buffer.alloc(3 * 1024 * 1024, 65).toString('base64')), 413);
    await err(adm.req('POST', A + '/impor/analisis', { jenis: 'xx', isi: 'AAAA' }), 400);
    // data berubah antara pratinjau dan impor → seluruh impor dibatalkan (tidak ada yang tersimpan)
    const a = ok(await analisis('santri_putri', await xlsx('santri_putri', [baris('santri_putri', { NIS: 'T8-R1', 'Nama Lengkap': 'Race Satu' }), baris('santri_putri', { NIS: 'T8-R2', 'Nama Lengkap': 'Race Dua' })])), 201);
    await q("INSERT INTO santri (nis,nama,jenis_kelamin,dibuat,diubah) VALUES ('T8-R2','Disisipkan Lebih Dulu','P',1,1)");
    await err(jalan(a.id, {}), 409); assert.strictEqual(Number((await get("SELECT COUNT(*)::int n FROM santri WHERE nis='T8-R1'")).n), 0, 'atomik: tidak ada baris tersimpan');
    const b = ok(await analisis('asrama', await xlsx('asrama', [baris('asrama', { Jenis: 'putra', 'Nama Asrama': 'Batal T8' })])), 201); ok(await adm.req('POST', A + `/impor/${b.id}/batal`, { konfirmasi: true })); await err(jalan(b.id, {}), 409);
    const c = ok(await analisis('asrama', await xlsx('asrama', [baris('asrama', { Jenis: 'putra', 'Nama Asrama': 'Kedaluwarsa T8' })])), 201); await q('UPDATE sys_impor SET dibuat=dibuat-90000000 WHERE id=$1', [c.id]); await err(jalan(c.id, {}), 409);
  });
  await t('8h. Riwayat impor & log aktivitas tercatat; integritas data setelah impor', async () => {
    const h = ok(await G(adm, '/impor')).rows; assert.ok(h.length >= 8 && h.every(r => r.oleh_username)); assert.ok(h.some(r => r.status === 'selesai') && h.some(r => r.status === 'dibatalkan'));
    const lg = ok(await G(adm, '/log?modul=impor&size=100')).rows; assert.ok(lg.some(r => r.aksi === 'impor') && lg.some(r => r.aksi === 'analisis_impor'));
    const kons = ok(await G(adm, '/pengaturan/konsistensi')).rows; for (const id of ['nis_ganda', 'kapasitas_kamar', 'jk_asrama', 'alumni_kamar']) { const r = kons.find(x => x.id === id); if (r) assert.strictEqual(r.status, 'ok', id + ' ' + JSON.stringify(r)); }
  });
};
