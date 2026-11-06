'use strict';
// Pengujian Tahap 2 (data utama). Seluruh data di bawah ini hanyalah data uji sementara di database memori.
module.exports = async function tahap2(X) {
  const { t, client, adm, ben, kea, q, get, A, assert, rejects, db, mk, PW, base } = X;
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');
  const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(64, 1)]).toString('base64');
  const S = (o = {}) => ({ nama: 'Santri Uji A', jenis_kelamin: 'L', nis: 'T2-001', tempat_lahir: 'Kota Uji', tanggal_lahir: '2012-03-04', alamat: 'Jl. Uji 1', nama_ayah: 'Ayah Uji', pekerjaan_ayah: 'Petani', status_ayah: 'hidup',
    nama_ibu: 'Ibu Uji', pekerjaan_ibu: 'Guru', status_ibu: 'meninggal', nama_wali: 'Wali Uji', wali_hubungan: 'Paman', wali_telepon: '0811-111', tanggal_masuk: '2020-07-15', program_pesantren: 'Program Uji', ...o });
  const P = (c, u, b) => c.req('POST', A + u, b), G = (c, u) => c.req('GET', A + u), PA = (c, u, b) => c.req('PATCH', A + u, b), PU = (c, u, b) => c.req('PUT', A + u, b);
  const ok = (r, st = 200) => { assert.strictEqual(r.status, st, `status ${r.status}: ${r.text.slice(0, 200)}`); return r.json; };
  await ben.login('bendahara1', PW); await kea.login('keamanan1', PW);   // sesi lama dicabut oleh pengujian perubahan role
  const st = async (id) => get('SELECT status, status_alumni, kamar_id, diarsipkan FROM santri WHERE id=$1', [id]);

  // ===== 10. Asrama & kamar =====
  let aP, aP2, aW, k1, k2, kW, kP2;
  await t('10a. Tambah asrama putra/putri; nama ganda ditolak; jenis liar ditolak', async () => {
    aP = ok(await P(adm, '/asrama', { nama: 'Asrama T Putra', jenis: 'putra' }), 201).id; aP2 = ok(await P(adm, '/asrama', { nama: 'Asrama T Putra 2', jenis: 'putra' }), 201).id; aW = ok(await P(adm, '/asrama', { nama: 'Asrama T Putri', jenis: 'putri' }), 201).id;
    assert.strictEqual((await P(adm, '/asrama', { nama: 'asrama t putra', jenis: 'putra' })).status, 409);
    assert.strictEqual((await P(adm, '/asrama', { nama: 'X Campur', jenis: 'campur' })).status, 400);
  });
  await t('10b. Tambah kamar; kapasitas/nama divalidasi; nama kamar ganda ditolak', async () => {
    k1 = ok(await P(adm, '/kamar', { asrama_id: aP, nama: 'T-1', kapasitas: 2 }), 201).id; k2 = ok(await P(adm, '/kamar', { asrama_id: aP2, nama: 'T-2', kapasitas: 1 }), 201).id;
    kW = ok(await P(adm, '/kamar', { asrama_id: aW, nama: 'W-1', kapasitas: 1 }), 201).id; kP2 = ok(await P(adm, '/kamar', { asrama_id: aP, nama: 'T-3', kapasitas: 5 }), 201).id;
    for (const b of [{ kapasitas: 0 }, { kapasitas: -3 }, { kapasitas: 'banyak' }, { kapasitas: 9999 }, { nama: '' }]) assert.strictEqual((await P(adm, '/kamar', { asrama_id: aP, nama: 'Z-' + Math.random(), kapasitas: 2, ...b })).status, 400, JSON.stringify(b));
    assert.strictEqual((await P(adm, '/kamar', { asrama_id: aP, nama: 't-1', kapasitas: 2 })).status, 409);
    assert.strictEqual((await P(adm, '/kamar', { asrama_id: 999999, nama: 'N', kapasitas: 2 })).status, 400);
  });
  await t('10c. Daftar asrama/kamar memuat jumlah kamar, kapasitas, penghuni, sisa', async () => {
    const r = ok(await G(adm, '/asrama?jenis=putra')).rows.find(a => a.id === aP); assert.deepStrictEqual([r.jumlah_kamar, r.kapasitas, r.penghuni, r.sisa], [2, 7, 0, 7]);
    assert.strictEqual(ok(await G(adm, `/kamar?asrama_id=${aP}`)).rows.length, 2); assert.strictEqual(ok(await G(adm, '/kamar?q=W-1')).rows.length, 1); assert.strictEqual((await G(adm, '/asrama?jenis=campur')).status, 400);
  });

  // ===== 11. Data santri =====
  let s1, s2, w1;
  await t('11a. Tambah santri putra lengkap: pekerjaan & status ayah/ibu tersimpan', async () => {
    s1 = ok(await P(adm, '/santri', S()), 201).id;
    const d = ok(await G(adm, '/santri/' + s1)).santri;
    assert.deepStrictEqual([d.pekerjaan_ayah, d.status_ayah, d.pekerjaan_ibu, d.status_ibu, d.nama_wali, d.wali_hubungan, d.tahun_masuk, d.status], ['Petani', 'hidup', 'Guru', 'meninggal', 'Wali Uji', 'Paman', 2020, 'aktif']);
    assert.ok((await get('SELECT * FROM riwayat_status WHERE santri_id=$1 AND jenis=$2', [s1, 'dibuat'])));
  });
  await t('11b. Status ayah/ibu: tiga pilihan; tidak disimpulkan otomatis (kosong tetap kosong)', async () => {
    const id = ok(await P(adm, '/santri', S({ nama: 'Santri Tanpa Status', nis: 'T2-002', status_ayah: undefined, status_ibu: 'tidak_diketahui' })), 201).id;
    const d = ok(await G(adm, '/santri/' + id)).santri; assert.strictEqual(d.status_ayah, null); assert.strictEqual(d.status_ibu, 'tidak_diketahui');
    assert.strictEqual((await P(adm, '/santri', S({ nis: 'T2-X', status_ayah: 'wafat' }))).status, 400);
    s2 = id;
  });
  await t('11c. Validasi: NIS ganda (tanpa peduli huruf besar), nama pendek, tanggal masa depan, jenis kelamin, telepon', async () => {
    assert.strictEqual((await P(adm, '/santri', S({ nis: 't2-001' }))).status, 400);
    const bad = [{ nis: 'T2-V1', nama: 'A' }, { nis: 'T2-V2', tanggal_lahir: '2999-01-01' }, { nis: 'T2-V3', jenis_kelamin: 'X' }, { nis: 'T2-V4', telepon: 'abc<script>' }, { nis: 'T2-V5', tanggal_lahir: '2012-02-30' }, { nis: 'T2-V6', tahun_masuk: 2021 }, { nis: 'T 2 V7' }];
    for (const b of bad) assert.strictEqual((await P(adm, '/santri', S(b))).status, 400, JSON.stringify(b));
    const r = await P(adm, '/santri', S({ nis: 't2-001' })); assert.ok(r.json.fields.nis);
    assert.strictEqual((await get("SELECT COUNT(*)::int n FROM santri WHERE nis ILIKE 't2-001'")).n, 1);
  });
  await t('11d. Edit santri tersimpan + riwayat perubahan; NIS tidak boleh bentrok saat edit', async () => {
    ok(await PA(adm, '/santri/' + s1, { alamat: 'Alamat Baru 9', pekerjaan_ayah: 'Pedagang' }));
    const d = ok(await G(adm, '/santri/' + s1)); assert.strictEqual(d.santri.alamat, 'Alamat Baru 9'); const h = d.riwayat.find(x => x.jenis === 'ubah_data'); assert.ok(h && /alamat/.test(h.alasan) && h.data_sebelum.alamat === 'Jl. Uji 1' && h.oleh_username === 'admin');
    assert.strictEqual((await PA(adm, '/santri/' + s1, { nis: 'T2-002' })).status, 400);
    assert.strictEqual((await PA(adm, '/santri/' + s1, { nama: '' })).status, 400);
    assert.strictEqual((await PA(adm, '/santri/999999', { nama: 'Zzz' })).status, 404);
  });
  await t('11e. Santri putri terpisah dari putra pada daftar', async () => {
    w1 = ok(await P(adm, '/santri', S({ nama: 'Santriwati Uji', nis: 'T2-W1', jenis_kelamin: 'P' })), 201).id;
    const a = ok(await G(adm, '/santri?kelompok=putra&q=T2-')).rows, b = ok(await G(adm, '/santri?kelompok=putri&q=T2-')).rows;
    assert.ok(a.length >= 2 && a.every(r => r.jenis_kelamin === 'L')); assert.ok(b.length === 1 && b[0].jenis_kelamin === 'P');
  });
  await t('11f. Pencarian, filter tahun masuk, pengurutan, pagination', async () => {
    for (let i = 0; i < 12; i++) ok(await P(adm, '/santri', S({ nama: 'Massal ' + String.fromCharCode(65 + i), nis: 'T2-M' + i, tanggal_masuk: '2019-01-01' })), 201);
    assert.strictEqual(ok(await G(adm, '/santri?kelompok=putra&q=Massal&size=10')).rows.length, 10);
    const p2 = ok(await G(adm, '/santri?kelompok=putra&q=Massal&size=10&page=2')); assert.strictEqual(p2.rows.length, 2); assert.strictEqual(p2.total, 12);
    assert.strictEqual(ok(await G(adm, '/santri?kelompok=putra&tahun_masuk=2019')).total, 12);
    const asc = ok(await G(adm, '/santri?kelompok=putra&q=Massal&urut=nama&arah=asc&size=50')).rows.map(r => r.nama), desc = ok(await G(adm, '/santri?kelompok=putra&q=Massal&urut=nama&arah=desc&size=50')).rows.map(r => r.nama);
    assert.deepStrictEqual(asc, [...asc].sort()); assert.deepStrictEqual(desc, [...asc].reverse());
    assert.strictEqual(ok(await G(adm, '/santri?urut=password;DROP&arah=x')).rows.length > 0, true);
    assert.strictEqual(ok(await G(adm, "/santri?q=%25")).rows.length, 0);   // % diperlakukan sebagai teks biasa
  });
  await t('11g. Arsip butuh konfirmasi; santri diarsipkan hilang dari daftar default, bisa dipulihkan', async () => {
    const id = ok(await P(adm, '/santri', S({ nama: 'Untuk Diarsip', nis: 'T2-AR' })), 201).id;
    assert.strictEqual((await P(adm, `/santri/${id}/arsip`, {})).status, 400);
    ok(await P(adm, `/santri/${id}/arsip`, { konfirmasi: true, alasan: 'uji' }));
    assert.strictEqual(ok(await G(adm, '/santri?q=T2-AR')).rows.length, 0); assert.strictEqual(ok(await G(adm, '/santri?q=T2-AR&status=arsip')).rows.length, 1);
    assert.strictEqual((await PA(adm, '/santri/' + id, { alamat: 'x' })).status, 409);
    assert.strictEqual((await P(adm, `/santri/${id}/arsip`, { konfirmasi: true })).status, 409);
    ok(await P(adm, `/santri/${id}/pulihkan`, { konfirmasi: true })); assert.strictEqual(ok(await G(adm, '/santri?q=T2-AR')).rows.length, 1);
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM riwayat_status WHERE santri_id=$1 AND jenis IN ($2,$3)', [id, 'arsip', 'pulihkan'])).n, 2);
  });
  await t('11h. Santri tidak dapat dihapus permanen (API maupun database)', async () => {
    assert.strictEqual((await adm.req('DELETE', `${A}/santri/${s1}`)).status, 404);
    await rejects(q('DELETE FROM santri WHERE id=$1', [s1]), /tidak boleh dihapus permanen/);
  });
  await t('11i. Tahun masuk mengikuti tanggal masuk; tidak boleh bertentangan', async () => {
    assert.strictEqual(ok(await G(adm, '/santri/' + s1)).santri.tahun_masuk, 2020);
    assert.strictEqual((await P(adm, '/santri', S({ nis: 'T2-TM', tahun_masuk: 2015 }))).status, 400);
    assert.strictEqual(ok(await P(adm, '/santri', S({ nis: 'T2-TM2', tanggal_masuk: undefined, tahun_masuk: 2015 })), 201).id > 0, true);
  });

  // ===== 12. Foto & dokumen (KK) =====
  let kkId, fotoId;
  await t('12a. Unggah foto santri (PNG/JPG); format palsu, PDF-sebagai-foto, dan file besar ditolak', async () => {
    ok(await PU(adm, `/santri/${s1}/foto`, { nama: 'foto.png', data: PNG })); fotoId = (await get('SELECT foto_berkas f FROM santri WHERE id=$1', [s1])).f; assert.ok(fotoId);
    ok(await PU(adm, `/santri/${s1}/foto`, { nama: 'foto.jpg', data: 'data:image/jpeg;base64,' + JPG }));
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM berkas WHERE id=$1', [fotoId])).n, 0, 'berkas lama harus dibersihkan');
    fotoId = (await get('SELECT foto_berkas f FROM santri WHERE id=$1', [s1])).f;
    const teks = Buffer.from('<script>alert(1)</script>').toString('base64');
    assert.strictEqual((await PU(adm, `/santri/${s1}/foto`, { nama: 'x.png', data: teks })).status, 400);
    assert.strictEqual((await PU(adm, `/santri/${s1}/foto`, { nama: 'x.png', data: PDF })).status, 400);
    assert.strictEqual((await PU(adm, `/santri/${s1}/foto`, { nama: 'x.png', data: '!!bukan base64!!' })).status, 400);
    const besar = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(2.7 * 1024 * 1024)]).toString('base64');
    assert.strictEqual((await PU(adm, `/santri/${s1}/foto`, { nama: 'besar.png', data: besar })).status, 400);
    assert.strictEqual((await PU(adm, `/santri/${s1}/foto`, { nama: 'raksasa.png', data: 'A'.repeat(5 * 1024 * 1024) })).status, 413);
  });
  await t('12b. Unggah KK (PDF/JPG/PNG); ganti KK membersihkan berkas lama; pratinjau & unduh bekerja', async () => {
    ok(await PU(adm, `/santri/${s1}/kk`, { nama: 'kk.pdf', data: PDF })); kkId = (await get('SELECT kk_berkas k FROM santri WHERE id=$1', [s1])).k;
    let r = await G(adm, '/berkas/' + kkId); assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('content-type'), 'application/pdf'); assert.ok(/inline/.test(r.headers.get('content-disposition')));
    assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff'); assert.ok(/no-store/.test(r.headers.get('cache-control')));
    r = await G(adm, `/berkas/${kkId}?unduh=1`); assert.ok(/attachment/.test(r.headers.get('content-disposition')));
    ok(await PU(adm, `/santri/${s1}/kk`, { nama: 'kk-baru.png', data: PNG })); const baru = (await get('SELECT kk_berkas k FROM santri WHERE id=$1', [s1])).k;
    assert.notStrictEqual(baru, kkId); assert.strictEqual((await G(adm, '/berkas/' + kkId)).status, 404); assert.strictEqual((await get('SELECT mime FROM berkas WHERE id=$1', [baru])).mime, 'image/png'); kkId = baru;
    const det = ok(await G(adm, '/santri/' + s1)); assert.strictEqual(det.kk.mime, 'image/png'); assert.ok(!JSON.stringify(det).includes(PNG), 'isi berkas tidak boleh ikut di JSON detail');
  });
  await t('12c. Keamanan akses KK: tanpa login 401, Bendahara/Keamanan 403 + tercatat; Super Admin 200', async () => {
    assert.strictEqual((await client().req('GET', `${A}/berkas/${kkId}`)).status, 401);
    assert.strictEqual((await ben.req('GET', `${A}/berkas/${kkId}`)).status, 403); assert.strictEqual((await kea.req('GET', `${A}/berkas/${kkId}`)).status, 403);
    assert.ok((await get("SELECT 1 x FROM activity_log WHERE aksi='akses_ditolak' AND modul='berkas'")));
    assert.strictEqual((await G(adm, '/berkas/' + kkId)).status, 200); assert.ok((await get("SELECT 1 x FROM activity_log WHERE aksi='lihat_dokumen'")));
    assert.strictEqual((await G(adm, '/berkas/abc')).status, 404);
  });
  await t('12d. Keamanan hanya boleh foto santri aktif; Bendahara tidak boleh; foto santri diarsipkan tidak terbuka', async () => {
    assert.strictEqual((await kea.req('GET', `${A}/berkas/${fotoId}`)).status, 200); assert.strictEqual((await ben.req('GET', `${A}/berkas/${fotoId}`)).status, 403);
    ok(await P(adm, `/santri/${s1}/arsip`, { konfirmasi: true })); assert.strictEqual((await kea.req('GET', `${A}/berkas/${fotoId}`)).status, 404); ok(await P(adm, `/santri/${s1}/pulihkan`, { konfirmasi: true }));
  });
  await t('12e. Berkas tidak tersedia lewat URL statis dan tidak ada kolom isi di database role terbatas', async () => {
    for (const u of ['/berkas/' + kkId, '/uploads/' + kkId, '/public/berkas/' + kkId]) { const r = await fetch(base() + u); assert.notStrictEqual(r.status, 200, u); }
    await rejects(db.tx(async x => { await x('SET LOCAL ROLE sima_keamanan'); return x('SELECT isi FROM berkas'); }), /permission denied/i);
    await rejects(db.tx(async x => { await x('SET LOCAL ROLE sima_keuangan'); return x('SELECT kk_berkas FROM santri'); }), /permission denied/i);
  });
  await t('12f. Dokumen pendukung/identitas: unggah, daftar, hapus (konfirmasi); jenis liar ditolak', async () => {
    ok(await P(adm, `/santri/${s1}/dokumen`, { jenis: 'identitas', nama: 'ktp.jpg', data: JPG, keterangan: 'Akta' }), 201);
    assert.strictEqual((await P(adm, `/santri/${s1}/dokumen`, { jenis: 'kk', nama: 'a.png', data: PNG })).status, 400);
    const d = ok(await G(adm, '/santri/' + s1)).dokumen; assert.strictEqual(d.length, 1); const did = d[0].id;
    assert.strictEqual((await kea.req('GET', `${A}/berkas/${d[0].berkas_id}`)).status, 403);
    assert.strictEqual((await adm.req('DELETE', `${A}/santri/${s1}/dokumen/${did}`, {})).status, 400);
    ok(await adm.req('DELETE', `${A}/santri/${s1}/dokumen/${did}`, { konfirmasi: true })); assert.strictEqual(ok(await G(adm, '/santri/' + s1)).dokumen.length, 0);
  });

  // ===== 13. Penempatan & riwayat perpindahan =====
  await t('13a. Penempatan baru: hanya kamar sesuai jenis kelamin; riwayat tercatat', async () => {
    assert.strictEqual((await P(adm, `/santri/${s1}/penempatan`, { kamar_id: kW })).status, 409);       // putra -> kamar putri
    assert.strictEqual((await P(adm, `/santri/${w1}/penempatan`, { kamar_id: k1 })).status, 409);       // putri -> kamar putra
    ok(await P(adm, `/santri/${s1}/penempatan`, { kamar_id: k1, alasan: 'Awal' })); ok(await P(adm, `/santri/${w1}/penempatan`, { kamar_id: kW }));
    const r = (await get('SELECT * FROM riwayat_penempatan WHERE santri_id=$1', [s1])); assert.deepStrictEqual([r.jenis, r.ke_kamar, r.ke_asrama, r.dari_kamar, r.oleh_username, r.alasan], ['penempatan_baru', 'T-1', 'Asrama T Putra', null, 'admin', 'Awal']); assert.ok(r.waktu);
    assert.strictEqual((await P(adm, `/santri/${s1}/penempatan`, { kamar_id: k1 })).status, 409);       // sudah di kamar itu: tidak ganda
  });
  await t('13b. Kapasitas tidak terlampaui; kamar nonaktif/arsip ditolak', async () => {
    ok(await P(adm, `/santri/${s2}/penempatan`, { kamar_id: k1 }));
    const x = ok(await P(adm, '/santri', S({ nis: 'T2-K3', nama: 'Santri Ke Tiga' })), 201).id;
    const r = await P(adm, `/santri/${x}/penempatan`, { kamar_id: k1 }); assert.strictEqual(r.status, 409); assert.ok(/penuh/.test(r.json.error));
    ok(await PA(adm, `/kamar/${kP2}`, { status: 'perbaikan' })); assert.strictEqual((await P(adm, `/santri/${x}/penempatan`, { kamar_id: kP2 })).status, 409); ok(await PA(adm, `/kamar/${kP2}`, { status: 'aktif' }));
    assert.strictEqual((await P(adm, `/santri/${x}/penempatan`, { kamar_id: 999999 })).status, 404);
  });
  await t('13c. Pindah kamar (1 asrama) dan pindah asrama dicatat dengan jenis berbeda', async () => {
    ok(await P(adm, `/santri/${s2}/penempatan`, { kamar_id: kP2, alasan: 'Pindah kamar' })); ok(await P(adm, `/santri/${s2}/penempatan`, { kamar_id: k2, alasan: 'Pindah asrama' }));
    const j = (await q('SELECT jenis FROM riwayat_penempatan WHERE santri_id=$1 ORDER BY id', [s2])).map(r => r.jenis); assert.deepStrictEqual(j, ['penempatan_baru', 'pindah_kamar', 'pindah_asrama']);
    const l = await get("SELECT * FROM riwayat_penempatan WHERE santri_id=$1 AND jenis='pindah_asrama'", [s2]); assert.deepStrictEqual([l.dari_asrama, l.dari_kamar, l.ke_asrama, l.ke_kamar], ['Asrama T Putra', 'T-3', 'Asrama T Putra 2', 'T-2']);
    const ri = ok(await G(adm, `/penempatan/riwayat?santri_id=${s2}`)); assert.strictEqual(ri.total, 3);
  });
  await t('13d. Mengeluarkan santri dari kamar; santri belum berkamar terdaftar di "belum ditempatkan"', async () => {
    ok(await P(adm, `/santri/${s2}/penempatan`, { kamar_id: null, alasan: 'Cuti' })); assert.strictEqual((await st(s2)).kamar_id, null);
    assert.ok(ok(await G(adm, '/penempatan/belum?kelompok=putra')).rows.some(r => r.id === s2)); assert.strictEqual((await P(adm, `/santri/${s2}/penempatan`, { kamar_id: null })).status, 409);
    assert.strictEqual((await G(adm, '/penempatan/belum?kelompok=campur')).status, 400);
  });
  await t('13e. Penempatan bersamaan ke kamar berkapasitas 1 hanya menyisakan satu penghuni', async () => {
    const a = ok(await P(adm, '/santri', S({ nis: 'T2-R1', nama: 'Balapan Satu' })), 201).id, b = ok(await P(adm, '/santri', S({ nis: 'T2-R2', nama: 'Balapan Dua' })), 201).id;
    const rs = await Promise.all([P(adm, `/santri/${a}/penempatan`, { kamar_id: k2 }), P(adm, `/santri/${b}/penempatan`, { kamar_id: k2 })]);
    assert.deepStrictEqual(rs.map(r => r.status).sort(), [200, 409]); assert.strictEqual((await get('SELECT COUNT(*)::int n FROM santri WHERE kamar_id=$1', [k2])).n, 1);
  });
  await t('13f. Santri diarsipkan keluar otomatis dari kamar; kamar/asrama berpenghuni tidak bisa diarsipkan', async () => {
    const id = ok(await P(adm, '/santri', S({ nis: 'T2-AK', nama: 'Arsip Berkamar' })), 201).id; ok(await P(adm, `/santri/${id}/penempatan`, { kamar_id: kP2 }));
    assert.strictEqual((await P(adm, `/kamar/${kP2}/arsip`, { konfirmasi: true })).status, 409); assert.strictEqual((await P(adm, `/asrama/${aP}/arsip`, { konfirmasi: true })).status, 409);
    ok(await P(adm, `/santri/${id}/arsip`, { konfirmasi: true })); assert.strictEqual((await st(id)).kamar_id, null);
    assert.strictEqual((await get("SELECT jenis FROM riwayat_penempatan WHERE santri_id=$1 ORDER BY id DESC LIMIT 1", [id])).jenis, 'keluar_otomatis');
  });
  await t('13g. Detail kamar menampilkan daftar penghuni & riwayat; kamar tidak bisa diperkecil di bawah penghuni', async () => {
    const d = ok(await G(adm, '/kamar/' + k1)); assert.deepStrictEqual(d.penghuni.map(p => p.id).sort(), [s1].sort()); assert.strictEqual(d.kamar.sisa, 1); assert.ok(d.riwayat.length >= 1);
    const r = await PA(adm, '/kamar/' + k1, { kapasitas: 0 }); assert.strictEqual(r.status, 400);
    ok(await P(adm, `/santri/${s2}/penempatan`, { kamar_id: k1 })); assert.strictEqual((await PA(adm, '/kamar/' + k1, { kapasitas: 1 })).status, 409); ok(await P(adm, `/santri/${s2}/penempatan`, { kamar_id: null }));
  });
  await t('13h. Mengubah jenis kelamin santri berkamar ditolak dengan pesan jelas', async () => { const r = await PA(adm, '/santri/' + s1, { jenis_kelamin: 'P' }); assert.strictEqual(r.status, 400); assert.ok(r.json.fields.jenis_kelamin); });

  // ===== 14. Pemindahan ke alumni =====
  let aLulus, aBerhenti;
  await t('14a. Pindahkan ke Alumni (Lulus): butuh konfirmasi & tanggal; satu transaksi, baris yang sama', async () => {
    const before = (await get('SELECT COUNT(*)::int n FROM santri')).n; aLulus = s1;
    assert.strictEqual((await P(adm, `/santri/${s1}/pindah-alumni`, { status_alumni: 'lulus', tanggal_keluar: '2024-06-30' })).status, 400);
    const e = await P(adm, `/santri/${s1}/pindah-alumni`, { konfirmasi: true, status_alumni: 'lulus' }); assert.strictEqual(e.status, 400); assert.ok(e.json.fields.tanggal_keluar);
    ok(await P(adm, `/santri/${s1}/pindah-alumni`, { konfirmasi: true, status_alumni: 'lulus', tanggal_keluar: '2024-06-30', keterangan_keluar: 'Lulus Program Uji', program_terakhir: 'Program Akhir Uji' }));
    const r = await get('SELECT * FROM santri WHERE id=$1', [s1]);
    assert.deepStrictEqual([r.status, r.status_alumni, r.tahun_keluar, r.kamar_id, r.program_terakhir, r.asrama_terakhir, r.keterangan_keluar], ['alumni', 'lulus', 2024, null, 'Program Akhir Uji', 'Asrama T Putra / T-1', 'Lulus Program Uji']);
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM santri')).n, before, 'tidak boleh ada salinan baris');
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM santri WHERE nis=$1', ['T2-001'])).n, 1);
    const h = await get("SELECT * FROM riwayat_status WHERE santri_id=$1 AND jenis='pindah_alumni'", [s1]); assert.deepStrictEqual([h.status_sebelum, h.status_sesudah, h.oleh_username], ['aktif', 'alumni:lulus', 'admin']); assert.ok(h.waktu);
    assert.strictEqual((await get("SELECT jenis FROM riwayat_penempatan WHERE santri_id=$1 ORDER BY id DESC LIMIT 1", [s1])).jenis, 'keluar_otomatis');
  });
  await t('14b. Pindahkan ke Alumni (Berhenti) santri putri; tahun keluar otomatis dari tanggal, bisa dikoreksi', async () => {
    aBerhenti = w1;
    ok(await P(adm, `/santri/${w1}/pindah-alumni`, { konfirmasi: true, status_alumni: 'berhenti', tanggal_keluar: '2023-02-10', tahun_keluar: 2022, keterangan_keluar: 'Pindah sekolah' }));
    const r = await get('SELECT status_alumni, tahun_keluar, tanggal_keluar::text d FROM santri WHERE id=$1', [w1]); assert.deepStrictEqual([r.status_alumni, r.tahun_keluar, r.d], ['berhenti', 2022, '2023-02-10']);
    const x = ok(await P(adm, '/santri', S({ nis: 'T2-AU', nama: 'Tahun Otomatis' })), 201).id; ok(await P(adm, `/santri/${x}/pindah-alumni`, { konfirmasi: true, status_alumni: 'berhenti', tanggal_keluar: '2023-05-05' })); assert.strictEqual((await get('SELECT tahun_keluar t FROM santri WHERE id=$1', [x])).t, 2023);
  });
  await t('14c. Validasi pemindahan: status liar, tanggal sebelum masuk/masa depan, ganda, santri tak ada', async () => {
    const x = ok(await P(adm, '/santri', S({ nis: 'T2-V', nama: 'Validasi Pindah' })), 201).id, base = { konfirmasi: true, tanggal_keluar: '2024-01-01' };
    for (const b of [{ ...base, status_alumni: 'wafat' }, { ...base, status_alumni: '' }, { konfirmasi: true, status_alumni: 'lulus', tanggal_keluar: '2010-01-01' }, { konfirmasi: true, status_alumni: 'lulus', tanggal_keluar: '2999-01-01' }, { ...base, status_alumni: 'lulus', tahun_keluar: 2000 }]) assert.strictEqual((await P(adm, `/santri/${x}/pindah-alumni`, b)).status, 400, JSON.stringify(b));
    assert.strictEqual((await st(x)).status, 'aktif', 'gagal validasi tidak boleh mengubah apa pun');
    assert.strictEqual((await P(adm, `/santri/${s1}/pindah-alumni`, { ...base, status_alumni: 'lulus' })).status, 409);
    assert.strictEqual((await P(adm, '/santri/999999/pindah-alumni', { ...base, status_alumni: 'lulus' })).status, 404);
  });
  await t('14d. Transaksi bersifat atomik: kegagalan di tengah proses membatalkan seluruh perubahan', async () => {
    const x = ok(await P(adm, '/santri', S({ nis: 'T2-TX', nama: 'Atomik' })), 201).id; ok(await P(adm, `/santri/${x}/penempatan`, { kamar_id: kP2 }));
    await db.exec(`CREATE OR REPLACE FUNCTION fn_uji_gagal() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'gagal-uji'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER trg_uji_gagal BEFORE INSERT ON riwayat_status FOR EACH ROW WHEN (NEW.jenis='pindah_alumni') EXECUTE FUNCTION fn_uji_gagal();`);
    const r = await P(adm, `/santri/${x}/pindah-alumni`, { konfirmasi: true, status_alumni: 'lulus', tanggal_keluar: '2024-01-01' }); assert.strictEqual(r.status, 500);
    await db.exec('DROP TRIGGER trg_uji_gagal ON riwayat_status; DROP FUNCTION fn_uji_gagal();');
    const s = await st(x); assert.deepStrictEqual([s.status, s.kamar_id], ['aktif', kP2]); assert.strictEqual((await get("SELECT COUNT(*)::int n FROM riwayat_penempatan WHERE santri_id=$1 AND jenis='keluar_otomatis'", [x])).n, 0);
    ok(await P(adm, `/santri/${x}/pindah-alumni`, { konfirmasi: true, status_alumni: 'lulus', tanggal_keluar: '2024-01-01' }));
  });
  await t('14e. Setelah jadi alumni: keluar dari daftar santri aktif & penghuni; data keluarga, KK, riwayat tetap ada', async () => {
    assert.ok(!ok(await G(adm, '/santri?q=T2-001')).rows.length); assert.strictEqual(ok(await G(adm, '/kamar/' + k1)).penghuni.length, 0);
    const d = ok(await G(adm, '/alumni/' + s1)); assert.deepStrictEqual([d.santri.pekerjaan_ayah, d.santri.status_ibu, d.santri.nama_wali, d.santri.nis, !!d.kk, d.penempatan.length >= 2, d.riwayat.length >= 3], ['Pedagang', 'meninggal', 'Wali Uji', 'T2-001', true, true, true]);
    assert.strictEqual((await G(adm, '/berkas/' + kkId)).status, 200); assert.strictEqual((await kea.req('GET', `${A}/berkas/${kkId}`)).status, 403);
    assert.strictEqual((await P(adm, `/santri/${s1}/penempatan`, { kamar_id: k1 })).status, 409, 'alumni tidak boleh ditempatkan');
    assert.strictEqual((await PA(adm, '/santri/' + s1, { alamat: 'x' })).status, 409);
    assert.strictEqual((await ben.req('GET', `${A}/santri/${s1}`)).status, 404); assert.ok(!ok(await ben.req('GET', `${A}/santri?q=T2-001`)).rows.length);
  });
  await t('14f. Daftar alumni terpisah Putra/Putri, filter Lulus/Berhenti, tahun masuk/keluar, pencarian', async () => {
    const all = ok(await G(adm, '/alumni?size=100')).rows; assert.ok(all.length >= 4);
    const pa = ok(await G(adm, '/alumni?kelompok=putra')).rows, pi = ok(await G(adm, '/alumni?kelompok=putri')).rows; assert.ok(pa.every(r => r.jenis_kelamin === 'L') && pi.length === 1 && pi[0].jenis_kelamin === 'P');
    assert.ok(ok(await G(adm, '/alumni?status_alumni=lulus')).rows.every(r => r.status_alumni === 'lulus')); assert.ok(ok(await G(adm, '/alumni?status_alumni=berhenti')).rows.every(r => r.status_alumni === 'berhenti'));
    assert.strictEqual(ok(await G(adm, '/alumni?tahun_keluar=2022')).rows.length, 1); assert.strictEqual(ok(await G(adm, '/alumni?tahun_masuk=2020&q=T2-001')).rows.length, 1);
    for (const u of ['/alumni?kelompok=campur', '/alumni?status_alumni=wafat']) assert.strictEqual((await G(adm, u)).status, 400, u);
  });
  await t('14g. Koreksi alumni: wajib alasan + konfirmasi; riwayat sebelumnya dipertahankan; pengguna & waktu tercatat', async () => {
    assert.strictEqual((await P(adm, `/alumni/${s1}/koreksi`, { konfirmasi: true, status_alumni: 'berhenti' })).status, 400);
    assert.strictEqual((await P(adm, `/alumni/${s1}/koreksi`, { alasan: 'Salah memilih status', status_alumni: 'berhenti' })).status, 400);
    assert.strictEqual((await P(adm, `/alumni/${s1}/koreksi`, { konfirmasi: true, alasan: 'Salah memilih status' })).status, 400);
    assert.strictEqual((await P(adm, `/alumni/${s1}/koreksi`, { konfirmasi: true, alasan: 'Salah tanggal', tanggal_keluar: '2010-01-01' })).status, 400);
    ok(await P(adm, `/alumni/${s1}/koreksi`, { konfirmasi: true, alasan: 'Salah memilih status', status_alumni: 'berhenti', tanggal_keluar: '2024-07-01' }));
    const r = await get('SELECT status_alumni, tahun_keluar FROM santri WHERE id=$1', [s1]); assert.deepStrictEqual([r.status_alumni, r.tahun_keluar], ['berhenti', 2024]);
    const h = await get("SELECT * FROM riwayat_status WHERE santri_id=$1 AND jenis='koreksi_alumni'", [s1]); assert.deepStrictEqual([h.data_sebelum.status_alumni, h.data_sebelum.tanggal_keluar, h.data_sesudah.status_alumni, h.alasan, h.oleh_username], ['lulus', '2024-06-30', 'berhenti', 'Salah memilih status', 'admin']); assert.ok(h.waktu);
    assert.ok((await get("SELECT 1 x FROM riwayat_status WHERE santri_id=$1 AND jenis='pindah_alumni'", [s1])), 'riwayat pemindahan awal tidak boleh hilang');
  });
  await t('14h. Aktifkan kembali alumni menjadi santri aktif (alasan wajib); riwayat alumni tetap tersimpan; bisa ditempatkan lagi', async () => {
    assert.strictEqual((await P(adm, `/alumni/${s1}/aktifkan-kembali`, { konfirmasi: true })).status, 400); assert.strictEqual((await P(adm, `/alumni/${s1}/aktifkan-kembali`, { alasan: 'Ternyata masih aktif' })).status, 400);
    ok(await P(adm, `/alumni/${s1}/aktifkan-kembali`, { konfirmasi: true, alasan: 'Ternyata masih santri aktif' }));
    const r = await get('SELECT status, status_alumni, tahun_keluar FROM santri WHERE id=$1', [s1]); assert.deepStrictEqual([r.status, r.status_alumni, r.tahun_keluar], ['aktif', null, null]);
    const h = await get("SELECT * FROM riwayat_status WHERE santri_id=$1 AND jenis='aktifkan_kembali'", [s1]); assert.strictEqual(h.data_sebelum.status_alumni, 'berhenti'); assert.strictEqual(h.status_sebelum, 'alumni:berhenti');
    assert.strictEqual((await G(adm, '/alumni/' + s1)).status, 404); ok(await P(adm, `/santri/${s1}/penempatan`, { kamar_id: k1 }));
    ok(await P(adm, `/santri/${s1}/pindah-alumni`, { konfirmasi: true, status_alumni: 'lulus', tanggal_keluar: '2024-08-01' }));
  });
  await t('14i. Statistik alumni sesuai database', async () => {
    const s = ok(await G(adm, '/alumni/statistik')); const n = async w => (await get(`SELECT COUNT(*)::int n FROM santri WHERE status='alumni' AND NOT diarsipkan ${w}`)).n;
    assert.deepStrictEqual([s.total, s.putra, s.putri, s.lulus, s.berhenti], [await n(''), await n("AND jenis_kelamin='L'"), await n("AND jenis_kelamin='P'"), await n("AND status_alumni='lulus'"), await n("AND status_alumni='berhenti'")]);
    assert.strictEqual(s.per_tahun.reduce((a, r) => a + r.total, 0), s.total); assert.ok(s.per_tahun.some(r => r.tahun === 2022 && r.berhenti === 1 && r.putri === 1));
  });
  await t('14j. Alumni manual (Super Admin): tambah, ubah, arsip & pulihkan; validasi status/tahun', async () => {
    assert.strictEqual((await P(adm, '/alumni', S({ nis: 'T2-AM', nama: 'Alumni Manual' }))).status, 400);
    assert.strictEqual((await P(adm, '/alumni', S({ nis: 'T2-AM', nama: 'Alumni Manual', status_alumni: 'lulus' }))).status, 400);
    const id = ok(await P(adm, '/alumni', S({ nis: 'T2-AM', nama: 'Alumni Manual', status_alumni: 'lulus', tanggal_keluar: '2021-06-01', program_terakhir: 'Uji' })), 201).id;
    assert.deepStrictEqual(Object.values(await get('SELECT status, status_alumni, tahun_keluar FROM santri WHERE id=$1', [id])), ['alumni', 'lulus', 2021]);
    ok(await PA(adm, '/alumni/' + id, { catatan_alumni: 'Catatan uji', alamat: 'Alamat alumni' })); assert.strictEqual(ok(await G(adm, '/alumni/' + id)).santri.catatan_alumni, 'Catatan uji');
    assert.strictEqual((await PA(adm, '/alumni/' + id, { status_alumni: 'berhenti' })).status, 200); assert.strictEqual((await get('SELECT status_alumni s FROM santri WHERE id=$1', [id])).s, 'lulus', 'status hanya berubah lewat koreksi');
    assert.strictEqual((await P(adm, `/alumni/${id}/arsip`, {})).status, 400); ok(await P(adm, `/alumni/${id}/arsip`, { konfirmasi: true }));
    assert.strictEqual(ok(await G(adm, '/alumni?q=T2-AM')).rows.length, 0); assert.strictEqual(ok(await G(adm, '/alumni?q=T2-AM&arsip=arsip')).rows.length, 1);
    assert.strictEqual((await P(adm, `/santri/${id}/arsip`, { konfirmasi: true })).status, 409, 'alumni diarsipkan lewat modul alumni');
    ok(await P(adm, `/alumni/${id}/pulihkan`, { konfirmasi: true }));
  });

  // ===== 15. Pengurus =====
  let jKetua, jSek, dMedia, pr1, pgP, pgW;
  await t('15a. Jabatan hierarkis per kelompok; lingkaran ditolak; jabatan awal dimuat sekali', async () => {
    jKetua = ok(await P(adm, '/jabatan', { kelompok: 'putra', nama: 'Ketua Uji', urutan: 1 }), 201).id;
    jSek = ok(await P(adm, '/jabatan', { kelompok: 'putra', nama: 'Sekretaris Uji', urutan: 2, induk_id: jKetua }), 201).id;
    assert.strictEqual((await PA(adm, '/jabatan/' + jKetua, { induk_id: jSek })).status, 400); assert.strictEqual((await PA(adm, '/jabatan/' + jKetua, { induk_id: jKetua })).status, 400);
    assert.strictEqual((await P(adm, '/jabatan', { kelompok: 'putra', nama: 'ketua uji' })).status, 409); assert.strictEqual((await P(adm, '/jabatan', { kelompok: 'putri', nama: 'Atasan Putra', induk_id: jKetua })).status, 400);
    ok(await PA(adm, '/jabatan/' + jSek, { nama: 'Sekretaris Uji 2' }));
    assert.strictEqual(ok(await P(adm, '/jabatan/awal', { kelompok: 'putri' })).ditambahkan, 9); assert.strictEqual(ok(await P(adm, '/jabatan/awal', { kelompok: 'putri' })).ditambahkan, 0);
    assert.strictEqual(ok(await G(adm, '/jabatan?kelompok=putra')).rows.length, 2); assert.strictEqual(ok(await G(adm, '/jabatan?kelompok=putri')).rows.length, 9); assert.strictEqual((await G(adm, '/jabatan?kelompok=x')).status, 400);
  });
  await t('15b. Divisi & periode: tambah/ubah; tanggal periode divalidasi', async () => {
    dMedia = ok(await P(adm, '/divisi', { kelompok: 'putra', nama: 'Divisi Media Uji' }), 201).id; pr1 = ok(await P(adm, '/periode', { kelompok: 'putra', nama: '2025/2026', mulai: '2025-07-01', selesai: '2026-06-30' }), 201).id;
    assert.strictEqual((await P(adm, '/periode', { kelompok: 'putra', nama: 'Salah', mulai: '2026-01-01', selesai: '2025-01-01' })).status, 400); assert.strictEqual((await PA(adm, '/periode/' + pr1, { selesai: '2024-01-01' })).status, 400);
    ok(await PA(adm, '/divisi/' + dMedia, { keterangan: 'Media pondok' })); ok(await PA(adm, '/periode/' + pr1, { aktif: false })); assert.strictEqual(ok(await G(adm, '/periode?kelompok=putra')).rows[0].aktif, false); ok(await PA(adm, '/periode/' + pr1, { aktif: true }));
  });
  await t('15c. Tambah/ubah pengurus; jenis kelamin mengikuti kelompok; jabatan wajib & harus sekelompok', async () => {
    const b = { kelompok: 'putra', nama: 'Pengurus Uji Putra', jabatan_id: jKetua, divisi_id: dMedia, periode_id: pr1, tugas: 'Memimpin', tanggal_mulai: '2025-07-01' };
    pgP = ok(await P(adm, '/pengurus', b), 201).id; pgW = ok(await P(adm, '/pengurus', { kelompok: 'putri', nama: 'Pengurus Uji Putri', jabatan_id: (await get("SELECT id FROM jabatan WHERE kelompok='putri' LIMIT 1")).id }), 201).id;
    assert.deepStrictEqual([(await get('SELECT jenis_kelamin j FROM pengurus WHERE id=$1', [pgP])).j, (await get('SELECT jenis_kelamin j FROM pengurus WHERE id=$1', [pgW])).j], ['L', 'P']);
    for (const x of [{ ...b, jabatan_id: undefined }, { ...b, nama: 'A' }, { ...b, kelompok: 'putri' }, { ...b, tanggal_selesai: '2020-01-01' }, { ...b, kelompok: 'campur' }]) assert.strictEqual((await P(adm, '/pengurus', x)).status, 400, JSON.stringify(x));
    ok(await PA(adm, '/pengurus/' + pgP, { jabatan_id: jSek, tugas: 'Administrasi' }));
    const d = ok(await G(adm, '/pengurus/' + pgP)); assert.strictEqual(d.pengurus.jabatan, 'Sekretaris Uji 2'); assert.ok(d.riwayat.length === 2 && /jabatan/.test(d.riwayat[0].keterangan));
    await rejects(q("UPDATE pengurus SET jenis_kelamin='P' WHERE id=$1", [pgP]), /check|violates/i);
  });
  await t('15d. Pengurus Putra dan Putri terpisah; filter/cari; bagan organisasi per kelompok', async () => {
    assert.deepStrictEqual(ok(await G(adm, '/pengurus?kelompok=putra')).rows.map(r => r.nama), ['Pengurus Uji Putra']); assert.deepStrictEqual(ok(await G(adm, '/pengurus?kelompok=putri')).rows.map(r => r.nama), ['Pengurus Uji Putri']);
    assert.strictEqual(ok(await G(adm, `/pengurus?kelompok=putra&jabatan=${jSek}`)).total, 1); assert.strictEqual(ok(await G(adm, '/pengurus?kelompok=putra&q=zzz')).total, 0); assert.strictEqual((await G(adm, '/pengurus')).status, 400);
    const bg = ok(await G(adm, '/pengurus/bagan?kelompok=putra')); assert.strictEqual(bg.jabatan.length, 2); assert.strictEqual(bg.pengurus.length, 1); assert.strictEqual(bg.jabatan.find(j => j.id === jSek).induk_id, jKetua);
    assert.strictEqual(ok(await G(adm, '/pengurus/bagan?kelompok=putri')).pengurus.length, 1);
  });
  await t('15e. Arsipkan pengurus (konfirmasi) → hilang dari daftar & bagan, riwayat tercatat, bisa dipulihkan', async () => {
    assert.strictEqual((await P(adm, `/pengurus/${pgP}/arsip`, {})).status, 400); ok(await P(adm, `/pengurus/${pgP}/arsip`, { konfirmasi: true }));
    assert.strictEqual(ok(await G(adm, '/pengurus?kelompok=putra')).total, 0); assert.strictEqual(ok(await G(adm, '/pengurus/bagan?kelompok=putra')).pengurus.length, 0); assert.strictEqual(ok(await G(adm, '/pengurus?kelompok=putra&arsip=arsip')).total, 1);
    ok(await P(adm, `/pengurus/${pgP}/pulihkan`, { konfirmasi: true })); assert.strictEqual(ok(await G(adm, '/pengurus?kelompok=putra')).total, 1);
    assert.strictEqual((await get('SELECT aktif a FROM pengurus WHERE id=$1', [pgP])).a, false, 'dipulihkan tetap nonaktif sampai diaktifkan sendiri'); ok(await PA(adm, '/pengurus/' + pgP, { aktif: true }));
  });
  await t('15f. Foto pengurus hanya untuk Super Admin', async () => {
    ok(await PU(adm, `/pengurus/${pgP}/foto`, { nama: 'p.png', data: PNG })); const f = (await get('SELECT foto_berkas f FROM pengurus WHERE id=$1', [pgP])).f;
    assert.strictEqual((await G(adm, '/berkas/' + f)).status, 200); assert.strictEqual((await kea.req('GET', `${A}/berkas/${f}`)).status, 403); assert.strictEqual((await PU(adm, `/pengurus/${pgP}/foto`, { nama: 'p.pdf', data: PDF })).status, 400);
  });

  // ===== 16. Pengajar =====
  let gr;
  await t('16a. Tambah/ubah pengajar; validasi; riwayat penugasan awal', async () => {
    gr = ok(await P(adm, '/pengajar', { nama: 'Pengajar Uji', bidang: 'Fikih Uji', lembaga: 'Madrasah Uji', kontak: '0812-3456', alamat: 'Jl. Uji', tanggal_mulai: '2022-07-01' }), 201).id;
    for (const b of [{ nama: 'A' }, { nama: 'Uji X', kontak: 'telp<>' }, { nama: 'Uji Y', tanggal_mulai: '2022-13-01' }]) assert.strictEqual((await P(adm, '/pengajar', b)).status, 400, JSON.stringify(b));
    ok(await PA(adm, '/pengajar/' + gr, { alamat: 'Alamat Baru' })); const d = ok(await G(adm, '/pengajar/' + gr)); assert.strictEqual(d.pengajar.alamat, 'Alamat Baru'); assert.strictEqual(d.penugasan.length, 1);
    assert.strictEqual((await PA(adm, '/pengajar/' + gr, { nama: '' })).status, 400); assert.strictEqual((await PA(adm, '/pengajar/99999', { nama: 'Zz' })).status, 404);
  });
  await t('16b. Cari nama, filter bidang & lembaga, pilihan filter dari data nyata', async () => {
    ok(await P(adm, '/pengajar', { nama: 'Pengajar Dua', bidang: 'Nahwu Uji', lembaga: 'Program Uji' }), 201);
    assert.strictEqual(ok(await G(adm, '/pengajar?q=Dua')).total, 1); assert.strictEqual(ok(await G(adm, '/pengajar?bidang=' + encodeURIComponent('Fikih Uji'))).total, 1); assert.strictEqual(ok(await G(adm, '/pengajar?lembaga=' + encodeURIComponent('Program Uji'))).total, 1);
    const d = ok(await G(adm, '/pengajar')); assert.deepStrictEqual(d.pilihan.bidang, ['Fikih Uji', 'Nahwu Uji']); assert.strictEqual(ok(await G(adm, "/pengajar?q=' OR 1=1 --")).total, 0);
  });
  await t('16c. Penugasan: tambah, ubah, validasi tanggal', async () => {
    const g = ok(await P(adm, `/pengajar/${gr}/penugasan`, { bidang: 'Tahfiz Uji', lembaga: 'Madrasah Qur\'an Uji', mulai: '2023-07-01' }), 201).id;
    assert.strictEqual((await P(adm, `/pengajar/${gr}/penugasan`, { keterangan: 'kosong' })).status, 400); assert.strictEqual((await P(adm, `/pengajar/${gr}/penugasan`, { bidang: 'X', mulai: '2023-07-01', selesai: '2022-01-01' })).status, 400);
    ok(await PA(adm, `/pengajar/${gr}/penugasan/${g}`, { selesai: '2024-06-30' })); assert.strictEqual((await PA(adm, `/pengajar/${gr}/penugasan/${g}`, { selesai: '2020-01-01' })).status, 400);
    assert.strictEqual(ok(await G(adm, '/pengajar/' + gr)).penugasan.length, 2);
  });
  await t('16d. Arsip pengajar (konfirmasi), pulihkan', async () => {
    assert.strictEqual((await P(adm, `/pengajar/${gr}/arsip`, {})).status, 400); ok(await P(adm, `/pengajar/${gr}/arsip`, { konfirmasi: true })); assert.strictEqual(ok(await G(adm, '/pengajar?q=Uji')).rows.filter(r => r.id === gr).length, 0);
    assert.strictEqual((await PA(adm, '/pengajar/' + gr, { alamat: 'x' })).status, 409); ok(await P(adm, `/pengajar/${gr}/pulihkan`, { konfirmasi: true })); assert.strictEqual(ok(await G(adm, '/pengajar?q=Pengajar Uji')).total, 1); ok(await PA(adm, '/pengajar/' + gr, { aktif: true }));
  });

  // ===== 17. Dashboard =====
  await t('17a. Dashboard Super Admin: semua angka cocok dengan database', async () => {
    const d = ok(await G(adm, '/dashboard')); const c = async (w) => (await get(`SELECT COUNT(*)::int n FROM santri WHERE ${w}`)).n;
    assert.deepStrictEqual([d.santri.total, d.santri.putra, d.santri.putri], [await c("status='aktif' AND NOT diarsipkan"), await c("status='aktif' AND NOT diarsipkan AND jenis_kelamin='L'"), await c("status='aktif' AND NOT diarsipkan AND jenis_kelamin='P'")]);
    assert.deepStrictEqual([d.alumni.total, d.alumni.lulus, d.alumni.berhenti], [await c("status='alumni' AND NOT diarsipkan"), await c("status='alumni' AND NOT diarsipkan AND status_alumni='lulus'"), await c("status='alumni' AND NOT diarsipkan AND status_alumni='berhenti'")]);
    assert.deepStrictEqual([d.pengurus.putra, d.pengurus.putri, d.pengajar.total], [1, 1, 2]);
    const k = (await get("SELECT COUNT(*)::int t FROM kamar WHERE NOT diarsipkan")).t; assert.strictEqual(d.kamar.total, k);
    const terisi = (await get("SELECT COUNT(DISTINCT kamar_id)::int n FROM santri WHERE kamar_id IS NOT NULL AND status='aktif' AND NOT diarsipkan")).n; assert.strictEqual(d.kamar.terisi, terisi);
    assert.ok(d.asrama.length === 2 && d.asrama[0].jumlah >= 2 && d.asrama[1].jumlah >= 2); assert.strictEqual(d.asrama.reduce((a, x) => a + x.terisi, 0), (await get("SELECT COUNT(*)::int n FROM santri WHERE kamar_id IS NOT NULL")).n);
  });
  await t('17b. Alumni tidak dihitung sebagai penghuni aktif asrama', async () => {
    assert.strictEqual((await get("SELECT COUNT(*)::int n FROM santri WHERE status='alumni' AND kamar_id IS NOT NULL")).n, 0);
    await rejects(q("UPDATE santri SET kamar_id=$1 WHERE id=$2", [kP2, (await get("SELECT id FROM santri WHERE status='alumni' LIMIT 1")).id]), /check|violates|ditolak/i);
  });

  // ===== 18. Hak akses & akses URL langsung =====
  const WRITES = [['POST', '/santri', S({ nis: 'HAK-1' })], ['PATCH', `/santri/${s2}`, { alamat: 'x' }], ['POST', `/santri/${s2}/arsip`, { konfirmasi: true }], ['POST', `/santri/${s2}/pindah-alumni`, { konfirmasi: true, status_alumni: 'lulus', tanggal_keluar: '2024-01-01' }],
    ['POST', `/santri/${s2}/penempatan`, { kamar_id: k1 }], ['PUT', `/santri/${s2}/kk`, { data: PDF }], ['PUT', `/santri/${s2}/foto`, { data: PNG }], ['POST', `/santri/${s2}/dokumen`, { jenis: 'pendukung', data: PNG }],
    ['POST', '/alumni', S()], ['PATCH', `/alumni/${s1}`, {}], ['POST', `/alumni/${s1}/koreksi`, { konfirmasi: true, alasan: 'ngawur', status_alumni: 'lulus' }], ['POST', `/alumni/${s1}/aktifkan-kembali`, { konfirmasi: true, alasan: 'ngawur' }],
    ['POST', '/pengurus', { kelompok: 'putra', nama: 'Xx' }], ['PATCH', `/pengurus/${pgP}`, { nama: 'Zz Zz' }], ['POST', '/jabatan', { kelompok: 'putra', nama: 'Xx' }], ['POST', '/divisi', { kelompok: 'putra', nama: 'Xx' }], ['POST', '/periode', { kelompok: 'putra', nama: 'Xx' }],
    ['POST', '/pengajar', { nama: 'Xx Xx' }], ['POST', `/pengajar/${gr}/penugasan`, { bidang: 'x' }], ['POST', '/asrama', { nama: 'Xx', jenis: 'putra' }], ['POST', '/kamar', { asrama_id: aP, nama: 'Xx', kapasitas: 1 }], ['PATCH', `/kamar/${k1}`, { kapasitas: 9 }]];
  await t('18a. Bendahara & Keamanan ditolak (403) pada SELURUH endpoint tulis Tahap 2; tanpa login 401', async () => {
    for (const [m, u, b] of WRITES) {
      for (const [nm, c] of [['bendahara', ben], ['keamanan', kea]]) assert.strictEqual((await c.req(m, A + u, b)).status, 403, `${nm} ${m} ${u}`);
      assert.ok([401, 403].includes((await client().req(m, A + u, b, { noCsrf: true })).status), `anon ${m} ${u}`);
    }
    assert.strictEqual((await get("SELECT COUNT(*)::int n FROM santri WHERE nis='HAK-1'")).n, 0);
  });
  await t('18b. Bendahara & Keamanan ditolak pada semua endpoint baca modul terlarang', async () => {
    for (const u of ['/alumni', `/alumni/${s1}`, '/alumni/statistik', '/pengurus?kelompok=putra', `/pengurus/${pgP}`, '/pengurus/bagan?kelompok=putra', '/jabatan?kelompok=putra', '/divisi?kelompok=putra', '/periode?kelompok=putra', '/pengajar', `/pengajar/${gr}`, '/asrama', `/asrama/${aP}`, '/kamar', `/kamar/${k1}`, '/penempatan/belum?kelompok=putra', '/penempatan/riwayat'])
      for (const c of [ben, kea]) assert.strictEqual((await c.req('GET', A + u)).status, 403, u);
  });
  await t('18c. Bendahara/Keamanan melihat santri aktif terpangkas; detail tidak membocorkan keluarga/KK/alamat', async () => {
    const sid = s2; for (const [nm, c] of [['ben', ben], ['kea', kea]]) {
      const l = ok(await c.req('GET', `${A}/santri?kelompok=putra&q=T2-002`)); assert.strictEqual(l.rows.length, 1); assert.strictEqual(l.readOnly, true);
      const txt = JSON.stringify(ok(await c.req('GET', `${A}/santri/${sid}`))); for (const s of ['Ayah Uji', 'Petani', 'Jl. Uji', 'Wali Uji', 'kk_berkas', 'alamat', 'tanggal_lahir', '0811']) assert.ok(!txt.includes(s), nm + ' bocor: ' + s);
    }
    assert.ok('asrama' in ok(await kea.req('GET', `${A}/santri/${s2}`)).santri); assert.ok(!('asrama' in ok(await ben.req('GET', `${A}/santri/${s2}`)).santri));
  });
  await t('18d. CSRF pada endpoint tulis baru: tanpa token/Origin asing ditolak, data tidak berubah', async () => {
    assert.strictEqual((await adm.req('POST', `${A}/santri/${s2}/arsip`, { konfirmasi: true }, { noCsrf: true })).status, 403); assert.strictEqual((await adm.req('PATCH', `${A}/santri/${s2}`, { alamat: 'jahat' }, { origin: 'https://jahat.example' })).status, 403);
    assert.strictEqual((await adm.req('PUT', `${A}/santri/${s2}/kk`, { data: PDF }, { csrf: 'palsu' })).status, 403); assert.notStrictEqual((await get('SELECT alamat a FROM santri WHERE id=$1', [s2])).a, 'jahat');
  });
  await t('18e. Injeksi: nilai berbahaya tersimpan sebagai teks biasa (tidak dieksekusi) dan tabel utuh', async () => {
    const id = ok(await P(adm, '/santri', S({ nis: 'T2-INJ', nama: "Robert'); DROP TABLE santri;--", alamat: '<img src=x onerror=alert(1)>' })), 201).id;
    assert.strictEqual((await get('SELECT nama n FROM santri WHERE id=$1', [id])).n, "Robert'); DROP TABLE santri;--"); assert.ok((await get('SELECT COUNT(*)::int n FROM santri')).n > 10);
    for (const u of [`/santri?kelompok=putra&asrama=1;DROP`, `/santri?tahun_masuk=1' OR '1'='1`, `/alumni?q=%27%3B--`, `/kamar?q=%27`, `/pengurus?kelompok=putra&q=%27`]) assert.ok([200, 400].includes((await G(adm, u)).status), u);
  });
  await t('18f. ID tidak valid ditangani tanpa error server', async () => {
    for (const u of ['/santri/abc', '/santri/999999999999', '/alumni/-1', '/kamar/xyz', '/pengurus/0']) assert.ok([404].includes((await G(adm, u)).status), u);
  });
  await t('18g. Menu per role memuat modul baru hanya untuk Super Admin', async () => {
    const m = async c => (await c.req('GET', `${A}/me`)).json.menu.map(x => x.id); const a = await m(adm); assert.ok(['santri', 'alumni', 'pengurus', 'pengajar', 'asrama'].every(x => a.includes(x)));
    for (const c of [ben, kea]) { const x = await m(c); assert.ok(!['alumni', 'pengurus', 'pengajar', 'asrama', 'pengguna', 'log'].some(y => x.includes(y)), x.join()); }
  });

  // ===== 19. Log aktivitas =====
  await t('19a. Aktivitas Tahap 2 tercatat (siapa, kapan, apa) tanpa data rahasia', async () => {
    const acts = new Set((await q('SELECT aksi FROM activity_log')).map(r => r.aksi));
    for (const a of ['pindah_alumni', 'koreksi', 'aktifkan_kembali', 'penempatan', 'unggah_dokumen', 'lihat_dokumen', 'arsip', 'pulihkan', 'hapus_dokumen']) assert.ok(acts.has(a), 'tidak tercatat: ' + a);
    const txt = JSON.stringify(await q("SELECT keterangan FROM activity_log")); assert.ok(!txt.includes(PNG) && !txt.includes(PDF) && !txt.includes('Jl. Uji'));
  });
};
