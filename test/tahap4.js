'use strict';
// Pengujian Tahap 4 (Keamanan). Semua nama/kategori di bawah adalah DATA UJI sementara di database memori — bukan data pondok.
module.exports = async function tahap4(X) {
  const { t, client, adm, ben, kea, get, A, assert, rejects, db, PW } = X;
  const K = '/keamanan', P = (c, u, b) => c.req('POST', A + K + u, Object.assign({ konfirmasi: true }, b)), G = (c, u) => c.req('GET', A + K + u);
  const ok = (r, st = 200) => { assert.strictEqual(r.status, st, `status ${r.status}: ${(r.text || '').slice(0, 240)}`); return r.json; };
  const err = async (p, st) => { const r = await p; assert.strictEqual(r.status, st, `diharapkan ${st}, dapat ${r.status}: ${(r.text || '').slice(0, 200)}`); return r.json; };
  await ben.login('bendahara1', PW); await kea.login('keamanan1', PW);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const wib = ms => new Date(Date.now() + ms + 7 * 3600e3).toISOString().slice(0, 16), H = 3600e3;
  const mkS = async (nama, jk, nis) => ok(await adm.req('POST', A + '/santri', { nama, jenis_kelamin: jk, nis, tanggal_masuk: '1992-07-15' }), 201).id;
  const sA = await mkS('Santri Uji T4-A', 'L', 'T4-001'), sB = await mkS('Santri Uji T4-B', 'P', 'T4-002'), sC = await mkS('Santri Uji T4-C', 'L', 'T4-003'), sAlm = await mkS('Santri Uji T4-Alumni', 'L', 'T4-009');
  ok(await adm.req('POST', `${A}/santri/${sAlm}/pindah-alumni`, { konfirmasi: true, status_alumni: 'lulus', tanggal_keluar: today }));
  let kat, jp, ji, pl1, pm1, iz1, iz2;

  await t('30a. Akses: Bendahara ditolak semua endpoint Keamanan; Keamanan boleh; pengaturan hanya Super Admin; tanpa login 401', async () => {
    for (const u of ['/dashboard', '/pelanggaran', '/pembinaan', '/izin-keluar', '/izin-pulang', '/monitoring', '/santri', '/laporan', '/laporan/pelanggaran', '/ref', '/pengaturan', '/audit']) await err(G(ben, u), 403);
    await err(P(ben, '/pelanggaran', {}), 403); await err(client().req('GET', A + K + '/dashboard'), 401);
    for (const u of ['/pengaturan', '/audit']) await err(G(kea, u), 403);
    await err(P(kea, '/kategori-pelanggaran', { nama: 'X' }), 403); ok(await G(kea, '/dashboard')); ok(await G(adm, '/pengaturan'));
  });
  await t('30b. Keamanan tidak bisa akses keuangan/ubah data santri; role DB terpisah total', async () => {
    for (const u of ['/dashboard', '/tagihan', '/pembayaran', '/tabungan', '/kas', '/ref']) await err(kea.req('GET', A + '/keuangan' + u), 403);
    await err(kea.req('PATCH', `${A}/santri/${sA}`, { nama: 'Ubah' }), 403); await err(kea.req('POST', `${A}/santri`, { nama: 'x', jenis_kelamin: 'L' }), 403);
    const as = (role, sql) => db.tx(async x => { await x(`SET LOCAL ROLE ${role}`); return x(sql); });
    for (const tb of ['kea_pelanggaran', 'kea_pembinaan', 'kea_izin', 'kea_audit', 'v_santri_kea']) await rejects(as('sima_keuangan', `SELECT * FROM ${tb}`), /permission denied/i, tb);
    for (const tb of ['keu_tagihan', 'keu_pembayaran', 'tabungan_transaksi', 'tabungan_rekening', 'kas_transaksi', 'santri', 'v_santri_keuangan']) await rejects(as('sima_keamanan', `SELECT * FROM ${tb}`), /permission denied/i, tb);
    const cols = Object.keys((await as('sima_keamanan', 'SELECT * FROM v_santri_kea LIMIT 1'))[0] || { id: 1, nis: 1, nama: 1, foto: 1, kelompok: 1, status: 1, diarsipkan: 1, asrama_id: 1, kamar_id: 1, asrama: 1, kamar: 1 });
    for (const c of ['nama_ayah', 'nama_ibu', 'alamat', 'telepon', 'kk', 'wali']) assert.ok(!cols.some(x => x.includes(c)), 'view tidak boleh memuat ' + c);
    await rejects(as('sima_keamanan', 'DELETE FROM kea_pelanggaran'), /permission denied/i); await rejects(as('sima_keamanan', 'UPDATE kea_audit SET ket=1'), /permission denied/i);
  });
  await t('31a. Pengaturan: tidak ada kategori/jenis bawaan; Super Admin menambah; nama ganda ditolak; nonaktif tidak bisa dipakai', async () => {
    const r = ok(await G(adm, '/pengaturan')); for (const k of ['kategori_pelanggaran', 'jenis_pembinaan', 'jenis_izin']) assert.strictEqual(r[k].length, 0, k + ' kosong');
    assert.strictEqual(r.toleransi_menit, 0); assert.strictEqual(r.format_nomor.pelanggaran.prefix, 'PLG');
    kat = ok(await P(adm, '/kategori-pelanggaran', { nama: 'Kategori Uji A' }), 201).id; await err(P(adm, '/kategori-pelanggaran', { nama: 'kategori uji a' }), 409);
    const k2 = ok(await P(adm, '/kategori-pelanggaran', { nama: 'Kategori Uji Nonaktif' }), 201).id; ok(await adm.req('PATCH', `${A}${K}/kategori-pelanggaran/${k2}`, { aktif: false }));
    jp = ok(await P(adm, '/jenis-pembinaan', { nama: 'Bentuk Uji' }), 201).id; ji = ok(await P(adm, '/jenis-izin', { nama: 'Jenis Izin Uji', jenis: 'keluar' }), 201).id; await err(P(adm, '/jenis-izin', { nama: 'Z', jenis: 'lain' }), 400);
    await err(P(kea, '/pelanggaran', { santri_id: sA, tanggal: today, kategori_id: k2, deskripsi: 'uji nonaktif' }), 400);
    const rf = ok(await G(kea, '/ref')); assert.deepStrictEqual(rf.kategori_pelanggaran.map(x => x.nama), ['Kategori Uji A']);
  });
  await t('31b. Pengaturan format nomor/alur/identitas tervalidasi dan tercatat', async () => {
    await err(adm.req('PUT', `${A}${K}/pengaturan`, { toleransi_menit: -1 }), 400); await err(adm.req('PUT', `${A}${K}/pengaturan`, { alur: { izin_keluar: 'x', izin_pulang: 'wajib' } }), 400); await err(adm.req('PUT', `${A}${K}/pengaturan`, {}), 400);
    ok(await adm.req('PUT', `${A}${K}/pengaturan`, { identitas: { nama: 'Pondok Uji', alamat: 'Alamat Uji', kontak: '', catatan: '' }, alasan: 'uji' }));
    assert.strictEqual(ok(await G(adm, '/pengaturan')).identitas.nama, 'Pondok Uji'); assert.ok((await get("SELECT COUNT(*)::int n FROM kea_audit WHERE entitas='pengaturan'")).n >= 5);
    ok(await adm.req('PUT', `${A}${K}/pengaturan`, { identitas: { nama: 'Pondok Pesantren Alhidayah Induk', alamat: '', kontak: '', catatan: '' } }));
  });
  await t('32a. Pelanggaran: nomor otomatis, validasi, tautan NIS, petugas dari sesi, alumni ditolak', async () => {
    await err(P(kea, '/pelanggaran', { santri_id: sA, tanggal: today, kategori_id: kat }), 400); await err(P(kea, '/pelanggaran', { santri_id: sA, tanggal: '2999-01-01', kategori_id: kat, deskripsi: 'masa depan' }), 400);
    await err(P(kea, '/pelanggaran', { nis: 'TIDAK-ADA', tanggal: today, kategori_id: kat, deskripsi: 'abc' }), 400);
    const r = ok(await P(kea, '/pelanggaran', { nis: 'T4-001', tanggal: today, waktu: '20:15', kategori_id: kat, deskripsi: 'Kejadian uji pertama', lokasi: 'Lokasi Uji' }), 201); pl1 = r.id;
    assert.match(r.nomor, new RegExp(`^PLG-${today.slice(0, 4)}-000001$`));
    const r2 = ok(await P(kea, '/pelanggaran', { santri_id: sB, tanggal: today, kategori_id: kat, deskripsi: 'Kejadian uji kedua' }), 201); assert.match(r2.nomor, /000002$/);
    const d = ok(await G(kea, `/pelanggaran/${pl1}`)).pelanggaran; assert.deepStrictEqual([d.nis, d.nama, d.kelompok, d.status, d.petugas, d.waktu], ['T4-001', 'Santri Uji T4-A', 'putra', 'baru', 'keamanan1', '20:15']);
    await err(P(kea, '/pelanggaran', { santri_id: sAlm, tanggal: today, kategori_id: kat, deskripsi: 'alumni' }), 409);
    await rejects(db.q("INSERT INTO kea_pelanggaran (nomor,santri_id,tanggal,kategori,deskripsi,status,dibuat,oleh) SELECT 'X',$1,CURRENT_DATE,'k','d','baru',1,id FROM users LIMIT 1", [sAlm]), /bukan santri aktif/i);
  });
  await t('32b. Pelanggaran: daftar, pencarian & filter, riwayat per santri, koreksi butuh alasan + jejak sebelum/sesudah', async () => {
    assert.strictEqual(ok(await G(kea, '/pelanggaran')).total, 2); assert.strictEqual(ok(await G(kea, '/pelanggaran?q=T4-001')).total, 1); assert.strictEqual(ok(await G(kea, '/pelanggaran?kelompok=putri')).total, 1);
    assert.strictEqual(ok(await G(kea, `/pelanggaran?santri_id=${sA}&kategori_id=${kat}&status=baru&dari=${today}&sampai=${today}`)).total, 1);
    await err(kea.req('PATCH', `${A}${K}/pelanggaran/${pl1}`, { lokasi: 'Baru' }), 400);
    ok(await kea.req('PATCH', `${A}${K}/pelanggaran/${pl1}`, { lokasi: 'Lokasi Koreksi', alasan_koreksi: 'Salah tulis lokasi' }));
    const au = ok(await G(kea, `/pelanggaran/${pl1}`)).audit.find(x => x.aksi === 'ubah'); assert.strictEqual(au.alasan, 'Salah tulis lokasi'); assert.strictEqual(au.sebelum.lokasi, 'Lokasi Uji'); assert.strictEqual(au.sesudah.lokasi, 'Lokasi Koreksi');
    await err(kea.req('PATCH', `${A}${K}/pelanggaran/${pl1}`, { lokasi: 'Lokasi Koreksi', alasan_koreksi: 'tanpa perubahan' }), 400);
  });
  await t('32c. Status tindak lanjut tercatat; lampiran; pembatalan tanpa hapus permanen', async () => {
    await err(kea.req('POST', `${A}${K}/pelanggaran/${pl1}/status`, { status: 'proses' }), 400); ok(await P(kea, `/pelanggaran/${pl1}/status`, { status: 'proses', catatan: 'Mulai ditindak' })); await err(P(kea, `/pelanggaran/${pl1}/status`, { status: 'proses' }), 409); await err(P(kea, `/pelanggaran/${pl1}/status`, { status: 'x' }), 400);
    assert.strictEqual(ok(await G(kea, `/pelanggaran?status=proses`)).total, 1);
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const up = await kea.req('PUT', `${A}${K}/pelanggaran/${pl1}/lampiran`, { nama: 'bukti.png', data: PNG }); assert.ok([200, 201].includes(up.status), 'lampiran ' + up.status + ' ' + (up.text || '').slice(0, 150));
    const bid = (await get('SELECT berkas_id FROM kea_pelanggaran WHERE id=$1', [pl1])).berkas_id; assert.ok(bid); assert.strictEqual((await kea.buf(`${A}/berkas/${bid}`)).status, 200); assert.strictEqual((await ben.buf(`${A}/berkas/${bid}`)).status, 403);
    const x = ok(await P(kea, '/pelanggaran', { santri_id: sC, tanggal: today, kategori_id: kat, deskripsi: 'Akan dibatalkan' }), 201).id; await err(P(kea, `/pelanggaran/${x}/batal`, {}), 400); ok(await P(kea, `/pelanggaran/${x}/batal`, { alasan: 'Salah catat santri' }));
    assert.strictEqual((await get('SELECT batal FROM kea_pelanggaran WHERE id=$1', [x])).batal, true); assert.strictEqual(ok(await G(kea, '/pelanggaran')).rows.some(r => r.id === x), false); assert.strictEqual(ok(await G(kea, '/pelanggaran?batal=semua')).rows.some(r => r.id === x), true);
    await rejects(db.q('DELETE FROM kea_pelanggaran WHERE id=$1', [x]), /tidak boleh dihapus/i); await err(kea.req('PATCH', `${A}${K}/pelanggaran/${x}`, { lokasi: 'x', alasan_koreksi: 'sudah batal' }), 409);
  });
  await t('33. Pembinaan: nomor, tautan ke pelanggaran / mandiri, riwayat, status, koreksi, batal', async () => {
    await err(P(kea, '/pembinaan', { santri_id: sA, tanggal: today, alasan: 'Uji' }), 400);
    pm1 = ok(await P(kea, '/pembinaan', { santri_id: sA, tanggal: today, alasan: 'Pembinaan uji', jenis_id: jp, pembina: 'Pembina Uji', pelanggaran_id: pl1, rencana: 'Pantau', tanggal_tindak: '2999-01-01' }), 201).id;
    const m2 = ok(await P(kea, '/pembinaan', { santri_id: sB, tanggal: today, alasan: 'Mandiri uji', jenis: 'Bentuk Bebas', pembina: 'Pembina Uji' }), 201); assert.match(m2.nomor, /^PMB-\d{4}-000002$/);
    await err(P(kea, '/pembinaan', { santri_id: sB, tanggal: today, alasan: 'Silang', jenis: 'x1', pembina: 'Pb', pelanggaran_id: pl1 }), 409);
    await err(P(kea, '/pembinaan', { santri_id: sAlm, tanggal: today, alasan: 'alumni', jenis: 'x1', pembina: 'Pb' }), 409);
    const d = ok(await G(kea, `/pembinaan/${pm1}`)).pembinaan; assert.deepStrictEqual([d.pelanggaran_nomor != null, d.status, d.jenis], [true, 'berjalan', 'Bentuk Uji']);
    assert.strictEqual(ok(await G(kea, `/pembinaan?santri_id=${sA}`)).total, 1); assert.strictEqual(ok(await G(kea, '/pembinaan?status=berjalan')).total, 2); assert.strictEqual(ok(await G(kea, `/pelanggaran/${pl1}`)).pembinaan.length, 1);
    await err(kea.req('PATCH', `${A}${K}/pembinaan/${pm1}`, { hasil: 'Baik' }), 400); ok(await kea.req('PATCH', `${A}${K}/pembinaan/${pm1}`, { hasil: 'Membaik', alasan_koreksi: 'Hasil dilengkapi' }));
    ok(await P(kea, `/pembinaan/${pm1}/status`, { status: 'selesai' })); assert.strictEqual(ok(await G(kea, '/pembinaan?status=selesai')).total, 1);
    ok(await P(kea, `/pembinaan/${m2.id}/batal`, { alasan: 'Dibatalkan uji' })); await err(P(kea, `/pembinaan/${m2.id}/status`, { status: 'selesai' }), 409);
    await err(ben.req('GET', `${A}${K}/pembinaan`), 403);
  });
  const izin = (c, jenis, sid, o) => P(c, '/izin-' + jenis, Object.assign({ santri_id: sid, tujuan: 'Tujuan Uji', rencana_keluar: wib(1 * H), rencana_kembali: wib(5 * H) }, o));
  await t('34a. Izin keluar: alur input → setujui → keluar → kembali; status & penolakan alur salah', async () => {
    await err(izin(kea, 'keluar', sA, { tujuan: '' }), 400); await err(izin(kea, 'keluar', sA, { rencana_kembali: wib(-H) }), 400); await err(izin(kea, 'keluar', sAlm), 409);
    const r = ok(await izin(kea, 'keluar', sA, { jenis_izin_id: ji, pendamping: 'Pendamping Uji', kontak_pendamping: '0800' }), 201); iz1 = r.id; assert.deepStrictEqual([r.status, /^IZK-\d{4}-000001$/.test(r.nomor)], ['menunggu', true]);
    await err(izin(kea, 'keluar', sA, { rencana_keluar: wib(2 * H), rencana_kembali: wib(3 * H) }), 409);   // tumpang tindih
    await err(P(kea, `/izin/${iz1}/keluar`, {}), 409); await err(P(kea, `/izin/${iz1}/kembali`, {}), 409);
    await err(kea.req('POST', `${A}${K}/izin/${iz1}/setujui`, {}), 400); ok(await P(kea, `/izin/${iz1}/setujui`, {})); await err(P(kea, `/izin/${iz1}/setujui`, {}), 409); await err(P(kea, `/izin/${iz1}/tolak`, { alasan: 'sudah' }), 409);
    ok(await P(kea, `/izin/${iz1}/keluar`, {})); assert.strictEqual(ok(await G(kea, `/izin/${iz1}`)).izin.status, 'sedang_izin'); await err(P(kea, `/izin/${iz1}/batal`, { alasan: 'sudah keluar' }), 409);
    ok(await P(kea, `/izin/${iz1}/kembali`, {})); const d = ok(await G(kea, `/izin/${iz1}`)).izin; assert.deepStrictEqual([d.status, !!d.aktual_keluar, !!d.aktual_kembali, d.disetujui_nama != null], ['kembali', true, true, true]);
    await err(P(kea, `/izin/${iz1}/kembali`, {}), 409);
    await rejects(db.q("UPDATE kea_izin SET status='menunggu' WHERE id=$1", [iz1]), /Perubahan status izin/); await rejects(db.q("UPDATE kea_izin SET santri_id=$1 WHERE id=$2", [sB, iz1]), /Identitas izin/);
  });
  await t('34b. Tolak/batal butuh alasan; tidak dapat keluar bila belum disetujui; hanya satu izin berlangsung per santri', async () => {
    const a = ok(await izin(kea, 'keluar', sB), 201).id; await err(P(kea, `/izin/${a}/tolak`, {}), 400); ok(await P(kea, `/izin/${a}/tolak`, { alasan: 'Alasan penolakan uji' })); assert.strictEqual(ok(await G(kea, `/izin/${a}`)).izin.status, 'ditolak'); await err(P(kea, `/izin/${a}/keluar`, {}), 409);
    const b = ok(await izin(kea, 'keluar', sB), 201).id; ok(await P(kea, `/izin/${b}/setujui`, {})); ok(await P(kea, `/izin/${b}/batal`, { alasan: 'Batal uji' })); assert.strictEqual(ok(await G(kea, `/izin/${b}`)).izin.status, 'dibatalkan');
    assert.strictEqual(ok(await G(kea, '/izin-keluar?status=ditolak')).total, 1); assert.strictEqual(ok(await G(kea, '/izin-keluar?q=T4-002')).total, 2);
  });
  await t('34c. Izin pulang: alamat, wali, kontak; alur; pencatatan waktu aktual', async () => {
    const r = ok(await izin(kea, 'pulang', sC, { alamat_tujuan: 'Alamat Uji 1', wali: 'Wali Uji', kontak_wali: '0811' }), 201); iz2 = r.id; assert.match(r.nomor, /^IZP-/);
    ok(await P(kea, `/izin/${iz2}/setujui`, {})); await err(P(kea, `/izin/${iz2}/keluar`, { waktu: wib(48 * H) }), 400); ok(await P(kea, `/izin/${iz2}/keluar`, {}));
    const d = ok(await G(kea, `/izin/${iz2}`)).izin; assert.deepStrictEqual([d.jenis, d.alamat_tujuan, d.wali, d.status], ['pulang', 'Alamat Uji 1', 'Wali Uji', 'sedang_izin']); assert.strictEqual(ok(await G(kea, '/izin-pulang')).total, 1); assert.strictEqual(ok(await G(kea, '/izin-keluar?q=T4-003')).total, 0);
  });
  await t('35. Monitoring: terlambat dihitung dari jam DB; tidak otomatis kembali; tindak lanjut; koreksi', async () => {
    const m = ok(await G(kea, '/monitoring')); assert.strictEqual(m.rows.length, 1); assert.strictEqual(m.rows[0].status_tampil, 'berlangsung'); assert.strictEqual(m.ringkasan.terlambat, 0);
    // Majukan jadwal ke masa lalu lewat koreksi (beralasan) agar tampak terlambat 2 jam
    await err(P(kea, `/izin/${iz2}/koreksi`, { rencana_kembali: wib(-2 * H) }), 400);
    const r1 = await P(kea, `/izin/${iz2}/koreksi`, { alasan_koreksi: 'Uji keterlambatan', rencana_keluar: wib(-6 * H), rencana_kembali: wib(-2 * H), aktual_keluar: wib(-5 * H) }); ok(r1);
    const m2 = ok(await G(kea, '/monitoring')).rows[0]; assert.strictEqual(m2.status_tampil, 'terlambat'); assert.ok(m2.telat_menit >= 119 && m2.telat_menit <= 122, 'telat ' + m2.telat_menit);
    assert.strictEqual(ok(await G(kea, '/monitoring')).ringkasan.terlambat, 1); assert.strictEqual(ok(await G(kea, '/monitoring?tampil=terlambat')).rows.length, 1); assert.strictEqual(ok(await G(kea, '/monitoring?tampil=mendekat')).rows.length, 0);
    assert.strictEqual((await get('SELECT status FROM kea_izin WHERE id=$1', [iz2])).status, 'sedang_izin', 'tidak otomatis kembali');
    ok(await P(kea, `/izin/${iz2}/tindak`, { tindak_status: 'dihubungi', tindak_catatan: 'Wali dihubungi' })); assert.strictEqual(ok(await G(kea, '/monitoring')).rows[0].tindak_status, 'dihubungi'); await err(P(kea, `/izin/${iz2}/tindak`, { tindak_status: 'x' }), 400);
    const au = ok(await G(kea, `/izin/${iz2}`)).audit.find(x => x.aksi === 'koreksi'); assert.ok(au && au.alasan === 'Uji keterlambatan' && au.sebelum && au.sesudah);
    const lap = ok(await G(kea, '/laporan/terlambat')); assert.strictEqual(lap.rows.length, 1); assert.ok(lap.rows[0].telat);
    ok(await P(kea, `/izin/${iz2}/kembali`, { catatan: 'Tiba' })); const dk = ok(await G(kea, `/izin/${iz2}`)).izin; assert.strictEqual(dk.status, 'kembali'); assert.strictEqual(dk.kembali_terlambat, true); assert.strictEqual(ok(await G(kea, '/monitoring')).rows.length, 0);
    assert.strictEqual(ok(await G(kea, '/laporan/terlambat')).rows.length, 1, 'tetap tercatat terlambat setelah kembali');
  });
  await t('36. Alur "langsung disetujui" dan toleransi diatur Super Admin (bukan bawaan)', async () => {
    ok(await adm.req('PUT', `${A}${K}/pengaturan`, { alur: { izin_keluar: 'langsung', izin_pulang: 'wajib' }, toleransi_menit: 30, peringatan_menit: 60 }));
    const r = ok(await izin(kea, 'keluar', sC), 201); assert.strictEqual(r.status, 'disetujui'); ok(await P(kea, `/izin/${r.id}/batal`, { alasan: 'Uji selesai' }));
    assert.strictEqual(ok(await G(kea, '/monitoring')).toleransi_menit, 30);
    ok(await adm.req('PUT', `${A}${K}/pengaturan`, { alur: { izin_keluar: 'wajib', izin_pulang: 'wajib' }, toleransi_menit: 0, peringatan_menit: 120 }));
  });
  await t('37. Profil keamanan santri: hanya data minimal, riwayat lengkap, pencarian terpusat & filter cepat', async () => {
    const p = ok(await G(kea, `/santri/${sA}`)); assert.strictEqual(p.santri.nis, 'T4-001'); assert.strictEqual(p.pelanggaran.length, 1); assert.strictEqual(p.pembinaan.length, 1); assert.strictEqual(p.izin_keluar.length, 1); assert.strictEqual(p.izin_pulang.length, 0);
    const txt = JSON.stringify(p); for (const w of ['nama_ayah', 'nama_ibu', 'pekerjaan', 'alamat_rumah', 'telepon', 'kk', 'tagihan', 'tabungan', 'saldo', 'kas']) assert.ok(!new RegExp('"' + w, 'i').test(txt), 'tidak boleh memuat ' + w);
    assert.strictEqual(ok(await G(kea, `/santri/${sAlm}`)).santri.status, 'alumni'); assert.strictEqual(ok(await G(kea, '/santri?q=Santri Uji T4')).rows.some(r => r.id === sAlm), false);
    assert.strictEqual(ok(await G(kea, '/santri?q=T4-&kelompok=putri')).total, 1); assert.strictEqual(ok(await G(kea, `/santri?q=T4-&kategori_id=${kat}`)).total, 2); assert.strictEqual(ok(await G(kea, '/santri?q=T4-&cepat=izin_selesai')).total, 2);
    assert.strictEqual(ok(await G(kea, '/santri?q=T4-&cepat=pelanggaran_terbaru')).total, 2); assert.strictEqual(ok(await G(kea, '/santri?q=T4-&cepat=pembinaan_berjalan')).total, 0); assert.strictEqual(ok(await G(kea, '/santri?q=T4-&cepat=belum_kembali')).total, 0);
    await err(G(kea, '/santri/999999'), 404); await err(G(ben, `/santri/${sA}`), 403);
    const c = ok(await G(kea, '/cari-santri?q=T4-')); assert.ok(c.rows.length >= 3 && !c.rows.some(r => r.nis === 'T4-009'));
  });
  await t('38. Dashboard: angka dari database, filter tanggal/jenis kelamin', async () => {
    const d = ok(await G(kea, '/dashboard')); assert.ok(d.santri_aktif >= 3); assert.strictEqual(d.pelanggaran.total, 2); assert.strictEqual(d.pelanggaran.bulan_ini, 2); assert.strictEqual(d.pembinaan.santri, 1); assert.strictEqual(d.izin.sedang, 0); assert.strictEqual(d.izin.selesai, 2);
    assert.strictEqual(d.grafik.bulan.length, 12); assert.strictEqual(d.grafik.kategori[0].k, 'Kategori Uji A'); assert.ok(d.aktivitas.length > 0);
    assert.strictEqual(ok(await G(kea, '/dashboard?kelompok=putri')).pelanggaran.total, 1); assert.strictEqual(ok(await G(kea, '/dashboard?dari=2001-01-01&sampai=2001-12-31')).pelanggaran.total, 0);
    assert.strictEqual(ok(await G(adm, '/dashboard')).pelanggaran.total, 2);
  });
  await t('39. Laporan: 7 jenis JSON + PDF + Excel; identitas pondok; tanpa data keuangan; filter', async () => {
    const ExcelJS = require('exceljs'), list = ok(await G(kea, '/laporan')).jenis; assert.strictEqual(list.length, 7);
    for (const j of list) { const r = ok(await G(kea, '/laporan/' + j.id)); assert.ok(r.kolom.length && Array.isArray(r.rows) && r.ringkasan.length, j.id); assert.strictEqual(r.pondok, 'Pondok Pesantren Alhidayah Induk'); assert.ok(!/saldo|tagihan|tabungan|rp\b/i.test(JSON.stringify(r.kolom)), 'tanpa kolom keuangan ' + j.id); }
    assert.strictEqual(ok(await G(kea, '/laporan/pelanggaran?kelompok=putri')).rows.length, 1); assert.strictEqual(ok(await G(kea, '/laporan/izin-pulang')).rows.length, 1); assert.strictEqual(ok(await G(kea, '/laporan/kategori')).rows[0].jumlah, 2);
    const pdf = await kea.buf(`${A}${K}/laporan/pelanggaran?format=pdf`); assert.strictEqual(pdf.status, 200); assert.ok(String(pdf.headers.get('content-type')).includes('pdf')); assert.strictEqual(pdf.buf.slice(0, 4).toString(), '%PDF');
    const x = await kea.buf(`${A}${K}/laporan/izin-keluar?format=xlsx`); assert.strictEqual(x.status, 200); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x.buf); assert.strictEqual(wb.worksheets[0].getRow(1).getCell(1).value, 'Pondok Pesantren Alhidayah Induk');
    await err(G(kea, '/laporan/tidak-ada'), 404); await err(G(ben, '/laporan/pelanggaran?format=pdf'), 403);
    ok(await adm.req('PUT', `${A}${K}/pengaturan`, { identitas: { nama: 'Pondok Uji Laporan', alamat: 'Alamat Laporan', kontak: '', catatan: '' } })); assert.strictEqual(ok(await G(kea, '/laporan/pelanggaran')).pondok, 'Pondok Uji Laporan');
    ok(await adm.req('PUT', `${A}${K}/pengaturan`, { identitas: { nama: 'Pondok Pesantren Alhidayah Induk', alamat: '', kontak: '', catatan: '' } }));
  });
  await t('40. Log aktivitas: seluruh tindakan penting tercatat; audit Keamanan hanya Super Admin; append-only', async () => {
    const a = ok(await G(adm, '/audit?entitas=izin')); assert.ok(a.total >= 8); for (const k of ['ajukan', 'setujui', 'tolak', 'batal', 'keluar', 'kembali', 'koreksi', 'tindak']) assert.ok(a.rows.some(r => r.aksi === k), k);
    assert.ok((await get("SELECT COUNT(*)::int n FROM activity_log WHERE modul='keamanan'")).n >= 15); assert.ok(ok(await G(adm, '/audit?entitas=pelanggaran')).rows.every(r => r.username));
    await rejects(db.q("UPDATE kea_audit SET ket='x'"), /tidak boleh dihapus|tidak dapat diubah/i); await rejects(db.q('DELETE FROM kea_audit'), /tidak boleh dihapus/i); await rejects(db.q('DELETE FROM kea_izin'), /tidak boleh dihapus/i);
    assert.strictEqual(ok(await G(adm, '/dashboard')).aktivitas.length > 0, true);
  });
};
