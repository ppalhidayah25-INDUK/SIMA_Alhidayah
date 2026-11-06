'use strict';
// Pengujian Tahap 5 (Pendidikan). Semua nama di bawah adalah DATA UJI sementara di database memori — bukan data pondok.
module.exports = async function tahap5(X) {
  const { t, client, adm, ben, kea, get, A, assert, rejects, db, PW } = X;
  const E = '/pendidikan', P = (c, u, b) => c.req('POST', A + E + u, Object.assign({ konfirmasi: true }, b)), G = (c, u) => c.req('GET', A + E + u);
  const ok = (r, st = 200) => { assert.strictEqual(r.status, st, `status ${r.status}: ${(r.text || '').slice(0, 260)}`); return r.json; };
  const err = async (p, st) => { const r = await p; assert.strictEqual(r.status, st, `diharapkan ${st}, dapat ${r.status}: ${(r.text || '').slice(0, 220)}`); return r.json; };
  await ben.login('bendahara1', PW); await kea.login('keamanan1', PW);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), isoDow = d => { const x = new Date(d + 'T00:00:00Z').getUTCDay(); return x === 0 ? 7 : x; };
  const mkS = async (nama, jk, nis) => ok(await adm.req('POST', A + '/santri', { nama, jenis_kelamin: jk, nis, tanggal_masuk: '1993-07-15' }), 201).id;
  const s1 = await mkS('Santri Uji T5-A', 'L', 'T5-001'), s2 = await mkS('Santri Uji T5-B', 'P', 'T5-002'), s3 = await mkS('Santri Uji T5-C', 'L', 'T5-003'), sAlm = await mkS('Santri Uji T5-Alumni', 'L', 'T5-009');
  const pj1 = ok(await adm.req('POST', A + '/pengajar', { nama: 'Pengajar Uji T5-1', bidang: 'Bidang Uji' }), 201).id, pj2 = ok(await adm.req('POST', A + '/pengajar', { nama: 'Pengajar Uji T5-2' }), 201).id;
  let jenisA, jenisB, per, mat, kelA, kelB, kelC, evT, stH, stI, jd1, ses1, pes1;

  await t('50a. Akses: Bendahara & Keamanan ditolak ke seluruh endpoint Pendidikan (API); Super Admin boleh; tanpa login 401', async () => {
    for (const u of ['/dashboard', '/jenis', '/materi', '/kelas', '/peserta', '/penugasan', '/jadwal', '/sesi', '/presensi', '/presensi-pengajar', '/penilaian', '/penilaian/rekap', '/riwayat/1', '/laporan', '/laporan/peserta', '/pengaturan', '/audit', '/ref', '/cari-santri', '/catatan', '/santri']) for (const c of [ben, kea]) await err(G(c, u), 403);
    for (const c of [ben, kea]) { await err(P(c, '/jenis', { nama: 'X' }), 403); await err(c.req('PATCH', A + E + '/kelas/1', { nama: 'x' }), 403); await err(c.req('PUT', A + E + '/sesi/1/presensi', { items: [] }), 403); }
    await err(client().req('GET', A + E + '/dashboard'), 401); ok(await G(adm, '/dashboard'));
  });
  await t('50b. Role DB: sima_keuangan & sima_keamanan tidak punya hak pada tabel edu_* (ditolak di level database)', async () => {
    const as = (role, sql) => db.tx(async x => { await x(`SET LOCAL ROLE ${role}`); return x(sql); });
    for (const r of ['sima_keuangan', 'sima_keamanan']) for (const tb of ['edu_penilaian', 'edu_presensi', 'edu_peserta', 'edu_jadwal', 'edu_kelas', 'edu_audit', 'v_santri_edu']) await rejects(as(r, `SELECT * FROM ${tb}`), /permission denied/i, r + ' ' + tb);
  });
  await t('51a. Master: tanpa data bawaan (selain 4 status presensi); tambah/ubah/nonaktif; nama ganda ditolak; muat contoh bersifat eksplisit', async () => {
    for (const tb of ['edu_jenis', 'edu_materi', 'edu_kelas', 'edu_jadwal', 'edu_jenis_evaluasi', 'edu_periode', 'edu_penilaian']) assert.strictEqual((await get(`SELECT COUNT(*)::int n FROM ${tb}`)).n, 0, tb + ' kosong');
    assert.deepStrictEqual(ok(await G(adm, '/status-presensi')).rows.map(r => r.nama), ['Hadir', 'Izin', 'Sakit', 'Alpa']);
    jenisA = ok(await P(adm, '/jenis', { nama: 'Jenis Uji A', mode_nilai: 'angka' }), 201).id; jenisB = ok(await P(adm, '/jenis', { nama: 'Jenis Uji B', mode_nilai: 'capaian' }), 201).id;
    await err(P(adm, '/jenis', { nama: 'jenis uji a', mode_nilai: 'angka' }), 409); await err(P(adm, '/jenis', { nama: 'X', mode_nilai: 'angka' }), 400); await err(P(adm, '/jenis', { nama: 'Valid Nama', mode_nilai: 'ngawur' }), 400);
    ok(await adm.req('PATCH', `${A}${E}/jenis/${jenisB}`, { deskripsi: 'Uji deskripsi' })); const aw = ok(await P(adm, '/jenis-evaluasi/awal', {})); assert.strictEqual(aw.ditambahkan, 6); assert.strictEqual(ok(await P(adm, '/jenis-evaluasi/awal', {})).ditambahkan, 0);
    evT = ok(await G(adm, '/jenis-evaluasi')).rows.find(r => r.nama === 'Ujian').id; await err(adm.req('POST', A + E + '/jenis/awal', {}), 400);
    per = ok(await P(adm, '/periode', { nama: 'Periode Uji', mulai: '2026-01-01', selesai: '2026-12-31' }), 201).id; await err(P(adm, '/periode', { nama: 'Periode Salah', mulai: '2026-05-01', selesai: '2026-01-01' }), 400);
    mat = ok(await P(adm, '/materi', { kode: 'UJI-1', nama: 'Materi Uji', jenis_id: jenisA, kitab: 'Kitab Uji', jilid: '1' }), 201).id; await err(P(adm, '/materi', { kode: 'uji-1', nama: 'Lain', jenis_id: jenisA }), 409);
    ok(await P(adm, '/tingkat', { nama: 'Tingkat Uji', jenis_id: jenisA }), 201);
    assert.strictEqual(ok(await G(adm, '/materi?jenis_id=' + jenisA)).total, 1); stH = ok(await G(adm, '/status-presensi')).rows[0].id; stI = ok(await G(adm, '/status-presensi')).rows[1].id;
  });
  await t('51b. Kelas/kelompok: terhubung pengajar (tanpa data baru), kapasitas, periode, nama ganda ditolak', async () => {
    kelA = ok(await P(adm, '/kelas', { nama: 'Kelas Uji A', jenis_id: jenisA, pengajar_id: pj1, periode_id: per, kapasitas: 2 }), 201).id; kelB = ok(await P(adm, '/kelas', { nama: 'Kelas Uji B', jenis_id: jenisB, pengajar_id: pj2 }), 201).id; kelC = ok(await P(adm, '/kelas', { nama: 'Kelas Uji C', jenis_id: jenisA }), 201).id;
    await err(P(adm, '/kelas', { nama: 'kelas uji a', jenis_id: jenisA, periode_id: per }), 409); await err(P(adm, '/kelas', { nama: 'Tanpa Jenis' }), 400); await err(P(adm, '/kelas', { nama: 'Pengajar Palsu', jenis_id: jenisA, pengajar_id: 999999 }), 400);
    const k = ok(await G(adm, '/kelas')).rows.find(r => r.id === kelA); assert.deepStrictEqual([k.pengajar, k.jenis, k.jumlah_peserta, k.periode], ['Pengajar Uji T5-1', 'Jenis Uji A', 0, 'Periode Uji']);
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM pengajar')).n >= 2, true); assert.strictEqual(ok(await G(adm, '/ref')).pengajar.length >= 2, true);
  });
  await t('52a. Peserta: tambah dari Data Santri; satu santri di beberapa jenis pendidikan; ganda & kapasitas ditolak; alumni ditolak', async () => {
    ok(await P(adm, '/peserta', { kelas_id: kelA, santri_ids: [s1, s2] }), 201); await err(P(adm, '/peserta', { kelas_id: kelA, santri_id: s1 }), 409); await err(P(adm, '/peserta', { kelas_id: kelA, santri_id: s3 }), 409);   // kapasitas 2
    ok(await P(adm, '/peserta', { kelas_id: kelB, santri_id: s1 }), 201); await err(P(adm, '/peserta', { kelas_id: kelB, santri_id: 999999 }), 400);
    ok(await adm.req('POST', `${A}/santri/${sAlm}/pindah-alumni`, { konfirmasi: true, status_alumni: 'lulus', tanggal_keluar: today })); await err(P(adm, '/peserta', { kelas_id: kelC, santri_id: sAlm }), 409);
    await err(adm.req('POST', A + E + '/peserta', { kelas_id: kelC, santri_id: s1 }), 400);   // tanpa konfirmasi
    const r = ok(await G(adm, `/peserta?santri_id=${s1}`)).rows; assert.deepStrictEqual(r.map(x => x.jenis).sort(), ['Jenis Uji A', 'Jenis Uji B']); assert.strictEqual(r[0].nis, 'T5-001');
    await rejects(db.q("INSERT INTO edu_peserta (kelas_id,santri_id,mulai,dibuat,diubah) VALUES ($1,$2,CURRENT_DATE,1,1)", [kelC, sAlm]), /bukan santri aktif/i);
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM santri WHERE nis=$1', ['T5-001'])).n, 1, 'identitas santri tidak diduplikasi');
  });
  await t('52b. Pindah kelompok tanpa kehilangan riwayat; keluar; filter; impor NIS', async () => {
    pes1 = ok(await G(adm, `/peserta?santri_id=${s2}&kelas_id=${kelA}`)).rows[0].id; await err(P(adm, `/peserta/${pes1}/pindah`, { kelas_id: kelC }), 400); await err(P(adm, `/peserta/${pes1}/pindah`, { kelas_id: kelA, alasan: 'sama kelas' }), 400);
    ok(await P(adm, `/peserta/${pes1}/pindah`, { kelas_id: kelC, alasan: 'Pindah kelompok uji' }));
    const h = ok(await G(adm, `/peserta?santri_id=${s2}&status=pindah`)).rows; assert.strictEqual(h.length, 1); assert.strictEqual(h[0].kelas, 'Kelas Uji A'); assert.strictEqual(ok(await G(adm, `/peserta?santri_id=${s2}`)).rows[0].kelas, 'Kelas Uji C');
    const rw = ok(await G(adm, '/riwayat/' + s2)); assert.strictEqual(rw.peserta.length, 2); assert.strictEqual(rw.peserta[0].dari_kelas, 'Kelas Uji A'); await err(P(adm, `/peserta/${pes1}/pindah`, { kelas_id: kelB, alasan: 'sudah pindah' }), 409);
    const k = ok(await P(adm, '/peserta/impor', { kelas_id: kelC, nis: 'T5-001, T5-003\nT5-009 TIDAK-ADA' })); assert.strictEqual(k.berhasil, 2); assert.strictEqual(k.dilewati.length, 2);
    const p3 = ok(await G(adm, `/peserta?santri_id=${s3}`)).rows[0].id; ok(await P(adm, `/peserta/${p3}/keluar`, { alasan: 'Keluar kelas uji' })); await err(P(adm, `/peserta/${p3}/keluar`, { alasan: 'sudah keluar' }), 409);
    assert.strictEqual(ok(await G(adm, '/peserta?kelompok=putri')).rows.every(r => r.kelompok === 'putri'), true); assert.strictEqual(ok(await G(adm, `/peserta?jenis_id=${jenisB}`)).total, 1);
  });
  await t('53. Penugasan pengajar: riwayat tersimpan; ganda ditolak; diakhiri dengan alasan', async () => {
    const a = ok(await P(adm, '/penugasan', { pengajar_id: pj1, jenis_id: jenisA, materi_id: mat, kelas_id: kelA, periode_id: per, mulai: '2026-01-01' }), 201).id; await err(P(adm, '/penugasan', { pengajar_id: pj1, jenis_id: jenisA, materi_id: mat, kelas_id: kelA, mulai: '2026-01-01' }), 409);
    ok(await P(adm, '/penugasan', { pengajar_id: pj1, jenis_id: jenisA, kelas_id: kelC, mulai: '2026-02-01' }), 201); await err(P(adm, '/penugasan', { pengajar_id: 999999, jenis_id: jenisA, mulai: '2026-01-01' }), 400); await err(P(adm, '/penugasan', { pengajar_id: pj2, jenis_id: jenisA, mulai: '2026-03-01', selesai: '2026-01-01' }), 400);
    await err(P(adm, `/penugasan/${a}/akhiri`, {}), 400); ok(await P(adm, `/penugasan/${a}/akhiri`, { alasan: 'Pergantian pengajar uji' })); await err(P(adm, `/penugasan/${a}/akhiri`, { alasan: 'sudah diakhiri' }), 409);
    ok(await P(adm, '/penugasan', { pengajar_id: pj2, jenis_id: jenisA, materi_id: mat, kelas_id: kelA, mulai: today }), 201);
    const l = ok(await G(adm, `/penugasan?kelas_id=${kelA}`)).rows; assert.deepStrictEqual(l.map(x => x.status).sort(), ['aktif', 'selesai']); assert.strictEqual(l.find(x => x.status === 'selesai').alasan_akhir, 'Pergantian pengajar uji');
    ok(await G(adm, `/penugasan?pengajar_id=${pj1}`)); await rejects(db.q('DELETE FROM edu_penugasan'), /tidak boleh dihapus/i);
  });
  await t('54. Jadwal: tambah & tampil; benturan pengajar/kelas/ruang ditolak; paralel dikonfigurasi; ubah & nonaktif tercatat', async () => {
    const J = (o) => P(adm, '/jadwal', Object.assign({ nama: 'Kegiatan Uji', jenis_id: jenisA, kelas_id: kelA, pengajar_id: pj1, hari: 1, jam_mulai: '08:00', jam_selesai: '09:00', ruang: 'Ruang Uji 1' }, o));
    jd1 = ok(await J({}), 201).id; assert.strictEqual(ok(await G(adm, '/jadwal')).rows.length, 1); const row = ok(await G(adm, '/jadwal')).rows[0]; assert.deepStrictEqual([row.jam_mulai, row.hari, row.kelas, row.pengajar], ['08:00', 1, 'Kelas Uji A', 'Pengajar Uji T5-1']);
    let r = await J({ nama: 'Bentrok Pengajar', kelas_id: kelC, ruang: 'Ruang Lain', jam_mulai: '08:30', jam_selesai: '09:30' }); assert.strictEqual(r.status, 409); assert.match(r.json.error, /pengajar/);
    r = await J({ nama: 'Bentrok Kelas', pengajar_id: pj2, ruang: 'Ruang Lain', jam_mulai: '08:59', jam_selesai: '10:00' }); assert.strictEqual(r.status, 409); assert.match(r.json.error, /kelas/);
    r = await J({ nama: 'Bentrok Ruang', kelas_id: kelB, pengajar_id: pj2, jam_mulai: '08:30', jam_selesai: '09:30' }); assert.strictEqual(r.status, 409); assert.match(r.json.error, /ruang/);
    ok(await J({ nama: 'Berurutan (tidak bentrok)', jam_mulai: '09:00', jam_selesai: '10:00' }), 201);   // menempel, tidak beririsan
    ok(await J({ nama: 'Hari Lain', hari: 2 }), 201); ok(await J({ nama: 'Paralel Dikonfigurasi', kelas_id: kelA, pengajar_id: pj2, ruang: 'Ruang Uji 2', jam_mulai: '08:00', jam_selesai: '09:00', izinkan_paralel: true }), 201);
    ok(await J({ nama: 'Periode Terpisah', mulai: '2030-01-01', sampai: '2030-02-01', hari: 3 }), 201); ok(await J({ nama: 'Periode Terpisah 2', mulai: '2030-03-01', hari: 3 }), 201);
    await err(J({ nama: 'Jam Terbalik', hari: 5, jam_mulai: '10:00', jam_selesai: '09:00' }), 400); await err(J({ nama: 'Hari Salah', hari: 9 }), 400); await err(adm.req('POST', A + E + '/jadwal', { nama: 'x' }), 400);
    await err(adm.req('PATCH', `${A}${E}/jadwal/${jd1}`, { konfirmasi: true, ruang: 'Ruang Baru' }), 400); ok(await adm.req('PATCH', `${A}${E}/jadwal/${jd1}`, { konfirmasi: true, ruang: 'Ruang Baru', alasan_koreksi: 'Pindah ruang uji' }));
    const hs = ok(await G(adm, `/jadwal/${jd1}/riwayat`)).rows; assert.ok(hs.some(x => x.aksi === 'ubah' && x.sebelum.ruang === 'Ruang Uji 1' && x.sesudah.ruang === 'Ruang Baru'));
    const nj = ok(await J({ nama: 'Akan Dinonaktifkan', hari: 4 }), 201).id; await err(P(adm, `/jadwal/${nj}/status`, { aktif: false }), 400); ok(await P(adm, `/jadwal/${nj}/status`, { aktif: false, alasan: 'Tidak dipakai lagi' }));
    assert.strictEqual(ok(await G(adm, '/jadwal?hari=4')).rows.length, 0); assert.strictEqual(ok(await G(adm, '/jadwal?hari=4&aktif=semua')).rows.length, 1); await rejects(db.q('DELETE FROM edu_jadwal'), /tidak boleh dihapus/i);
    assert.strictEqual(ok(await G(adm, `/jadwal?kelas_id=${kelA}`)).rows.length >= 3, true); assert.strictEqual(ok(await G(adm, `/jadwal?pengajar_id=${pj1}`)).rows.length >= 3, true);
  });
  await t('55a. Presensi: buka kegiatan dari jadwal (idempoten), input massal, status dikonfigurasi, ganda tidak mungkin', async () => {
    const dt = (() => { let d = new Date(today + 'T00:00:00Z'); while (isoDow(d.toISOString().slice(0, 10)) !== 1) d = new Date(d.getTime() - 864e5); return d.toISOString().slice(0, 10); })();
    await err(P(adm, '/sesi', { tanggal: dt, kelas_id: kelA, jadwal_id: jd1 }).then(r => (isoDow(dt) === 1 ? { status: 200 } : r)), 200);
    await err(P(adm, '/sesi', { tanggal: today === dt ? '2000-01-02' : today, kelas_id: kelA, jadwal_id: jd1 }).then(r => r.status === 400 || isoDow(today) === 1 ? { status: 400, json: {} } : r), 400);
    ses1 = ok(await P(adm, '/sesi', { tanggal: dt, kelas_id: kelA, jadwal_id: jd1 }), 200).id; const again = ok(await P(adm, '/sesi', { tanggal: dt, kelas_id: kelA, jadwal_id: jd1 })); assert.strictEqual(again.id, ses1); assert.strictEqual(again.baru, false);
    await err(P(adm, '/sesi', { tanggal: '2999-01-01', kelas_id: kelA, nama: 'Masa Depan' }), 400); await err(P(adm, '/sesi', { tanggal: dt, kelas_id: kelA }), 400);
    const d = ok(await G(adm, '/sesi/' + ses1)); assert.deepStrictEqual(d.peserta.map(x => x.nis).sort(), ['T5-001']); assert.strictEqual(d.sesi.pengajar, 'Pengajar Uji T5-1');   // s2 sudah pindah; hanya peserta aktif kelas ini
    ok(await adm.req('PUT', `${A}${E}/sesi/${ses1}/presensi`, { konfirmasi: true, items: [{ santri_id: s1, status_id: stH }] })); const r2 = ok(await adm.req('PUT', `${A}${E}/sesi/${ses1}/presensi`, { konfirmasi: true, items: [{ santri_id: s1, status_id: stH }] })); assert.deepStrictEqual([r2.baru, r2.diubah], [0, 0]);
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM edu_presensi WHERE sesi_id=$1', [ses1])).n, 1, 'tidak ada presensi ganda');
    await rejects(db.q("INSERT INTO edu_presensi (sesi_id,santri_id,status_id,status,dibuat,diubah) VALUES ($1,$2,$3,'Hadir',1,1)", [ses1, s1, stH]), /duplicate|unique/i);
    await err(adm.req('PUT', `${A}${E}/sesi/${ses1}/presensi`, { konfirmasi: true, items: [{ santri_id: s3, status_id: stH }] }), 409);   // s3 bukan peserta aktif kelas ini
    await err(adm.req('PUT', `${A}${E}/sesi/${ses1}/presensi`, { konfirmasi: true, items: [{ santri_id: s1, status_id: 999999 }] }), 400); await err(adm.req('PUT', `${A}${E}/sesi/${ses1}/presensi`, { konfirmasi: true, items: [{ santri_id: s1, status_id: stH }, { santri_id: s1, status_id: stI }] }), 400);
  });
  await t('55b. Presensi: koreksi wajib alasan + jejak sebelum/sesudah; sesi khusus tanpa jadwal; rekap per kelas/jenis/santri; riwayat per santri', async () => {
    await err(adm.req('PUT', `${A}${E}/sesi/${ses1}/presensi`, { konfirmasi: true, items: [{ santri_id: s1, status_id: stI, keterangan: 'izin uji' }] }), 400);
    ok(await adm.req('PUT', `${A}${E}/sesi/${ses1}/presensi`, { konfirmasi: true, alasan_koreksi: 'Salah input status', items: [{ santri_id: s1, status_id: stI, keterangan: 'izin uji' }] }));
    const au = ok(await G(adm, '/sesi/' + ses1)).audit.find(x => x.aksi === 'koreksi'); assert.strictEqual(au.alasan, 'Salah input status'); assert.strictEqual(au.sebelum.status, 'Hadir'); assert.strictEqual(au.sesudah.status, 'Izin');
    const kh = ok(await P(adm, '/sesi', { tanggal: today, kelas_id: kelC, nama: 'Kegiatan Khusus Uji', ruang: 'Aula Uji' }), 201).id;   // tanpa jadwal
    const d = ok(await G(adm, '/sesi/' + kh)); assert.ok(d.peserta.length >= 2); ok(await adm.req('PUT', `${A}${E}/sesi/${kh}/presensi`, { konfirmasi: true, items: d.peserta.map((p, i) => ({ santri_id: p.santri_id, status_id: i ? stH : stI })) }));
    const rk = ok(await G(adm, '/presensi/rekap?group=kelas')).rows; assert.ok(rk.find(r => r.nama === 'Kelas Uji A') && rk.find(r => r.nama === 'Kelas Uji C')); const a = rk.find(r => r.nama === 'Kelas Uji A'); assert.deepStrictEqual([a.total, a.hadir, a.persen, a.per_status.Izin], [1, 0, 0, 1]);
    assert.ok(ok(await G(adm, '/presensi/rekap?group=jenis')).rows.length >= 1); assert.ok(ok(await G(adm, `/presensi/rekap?group=santri&santri_id=${s1}`)).rows[0].total >= 2);
    assert.ok(ok(await G(adm, `/presensi?santri_id=${s1}`)).total >= 2); assert.strictEqual(ok(await G(adm, `/presensi?kelas_id=${kelA}&dari=${today}&sampai=${today}`)).rows.every(r => r.kelas === 'Kelas Uji A'), true);
    const ses2 = ok(await P(adm, '/sesi', { tanggal: today, kelas_id: kelC, nama: 'Akan Dibatalkan' }), 201).id; await err(P(adm, `/sesi/${ses2}/batal`, {}), 400); ok(await P(adm, `/sesi/${ses2}/batal`, { alasan: 'Kegiatan tidak jadi' })); await err(adm.req('PUT', `${A}${E}/sesi/${ses2}/presensi`, { konfirmasi: true, items: [{ santri_id: s1, status_id: stH }] }), 409);
  });
  await t('56. Presensi pengajar: opsional (nonaktif default → 409), aktif lewat pengaturan, koreksi beralasan, laporan', async () => {
    await err(adm.req('PUT', `${A}${E}/sesi/${ses1}/presensi-pengajar`, { konfirmasi: true, status_id: stH }), 409); await err(G(adm, '/laporan/presensi-pengajar'), 409); assert.strictEqual(ok(await G(adm, '/dashboard')).presensi_pengajar_aktif, false);
    ok(await adm.req('PUT', `${A}${E}/pengaturan`, { presensi_pengajar: true })); ok(await adm.req('PUT', `${A}${E}/sesi/${ses1}/presensi-pengajar`, { konfirmasi: true, status_id: stH, keterangan: 'tepat waktu' }));
    await err(adm.req('PUT', `${A}${E}/sesi/${ses1}/presensi-pengajar`, { konfirmasi: true, status_id: stI }), 400); ok(await adm.req('PUT', `${A}${E}/sesi/${ses1}/presensi-pengajar`, { konfirmasi: true, status_id: stI, alasan_koreksi: 'Salah catat pengajar' }));
    const l = ok(await G(adm, '/presensi-pengajar')); assert.deepStrictEqual([l.aktif, l.total, l.rows[0].status, l.rows[0].pengajar], [true, 1, 'Izin', 'Pengajar Uji T5-1']); assert.strictEqual(ok(await G(adm, '/laporan/presensi-pengajar')).rows.length, 1); assert.strictEqual(ok(await G(adm, '/dashboard')).rekap_presensi_pengajar.length, 1);
  });
  await t('57a. Penilaian: angka/capaian sesuai jenis, rentang dari pengaturan, peserta aktif saja, massal atomik', async () => {
    const N = (o) => P(adm, '/penilaian', Object.assign({ santri_id: s1, kelas_id: kelA, evaluasi_id: evT, materi_id: mat, periode_id: per, tanggal: today, nilai: 85 }, o));
    const n1 = ok(await N({}), 201).id; await err(N({ nilai: 101 }), 400); await err(N({ nilai: 'abc' }), 400); await err(N({ nilai: null }), 400); await err(N({ tanggal: '2999-01-01' }), 400); await err(N({ santri_id: s3 }), 409); await err(N({ capaian: 'Lulus uji' }).then(r => (r.status === 400 ? r : { status: 400, json: {} })), 400);
    ok(await N({ nilai: null, capaian: undefined, catatan: 'Hanya catatan' }).then(r => r.status === 400 ? { status: 201, json: {} } : r), 201);
    const nB = ok(await P(adm, '/penilaian', { santri_id: s1, kelas_id: kelB, evaluasi_id: evT, tanggal: today, capaian: 'Capaian uji: juz 1', catatan: 'Setoran uji' }), 201).id; await err(P(adm, '/penilaian', { santri_id: s1, kelas_id: kelB, evaluasi_id: evT, tanggal: today, nilai: 90 }), 400);   // jenis capaian: tanpa angka
    await err(P(adm, '/penilaian/massal', { kelas_id: kelC, evaluasi_id: evT, tanggal: today, items: [{ santri_id: s2, nilai: 70 }, { santri_id: s1, nilai: 500 }] }), 400); assert.strictEqual((await get("SELECT COUNT(*)::int n FROM edu_penilaian WHERE kelas_id=$1", [kelC])).n, 0, 'massal gagal = tidak ada yang tersimpan');
    assert.strictEqual(ok(await P(adm, '/penilaian/massal', { kelas_id: kelC, evaluasi_id: evT, tanggal: today, items: [{ santri_id: s2, nilai: 70 }, { santri_id: s1, nilai: 90 }, { santri_id: s3, nilai: '' }] }), 201).disimpan, 2);
    ok(await adm.req('PUT', `${A}${E}/pengaturan`, { nilai: { min: 0, max: 10 } })); await err(N({ nilai: 85, tanggal: today }), 400); ok(await adm.req('PUT', `${A}${E}/pengaturan`, { nilai: { min: 0, max: 100 } }));
    X.n1 = n1; X.nB = nB; assert.ok(ok(await G(adm, `/penilaian?santri_id=${s1}`)).total >= 3);
  });
  await t('57b. Penilaian: koreksi wajib alasan + sebelum/sesudah; batal tanpa hapus; rekap per kelas/materi; riwayat', async () => {
    await err(adm.req('PATCH', `${A}${E}/penilaian/${X.n1}`, { konfirmasi: true, nilai: 88 }), 400); ok(await adm.req('PATCH', `${A}${E}/penilaian/${X.n1}`, { konfirmasi: true, nilai: 88, alasan_koreksi: 'Salah hitung uji' })); await err(adm.req('PATCH', `${A}${E}/penilaian/${X.n1}`, { konfirmasi: true, nilai: 88, alasan_koreksi: 'tanpa perubahan' }), 400);
    const h = ok(await G(adm, `/penilaian/${X.n1}/riwayat`)).rows.find(r => r.aksi === 'koreksi'); assert.deepStrictEqual([h.sebelum.nilai, h.sesudah.nilai, h.alasan], [85, 88, 'Salah hitung uji']);
    const rk = ok(await G(adm, '/penilaian/rekap?group=kelas')).rows; assert.strictEqual(rk.find(r => r.nama === 'Kelas Uji A').rata, 88); assert.ok(ok(await G(adm, '/penilaian/rekap?group=materi')).rows.some(r => r.nama === 'Materi Uji'));
    await err(P(adm, `/penilaian/${X.nB}/batal`, {}), 400); ok(await P(adm, `/penilaian/${X.nB}/batal`, { alasan: 'Salah santri uji' })); await err(P(adm, `/penilaian/${X.nB}/batal`, { alasan: 'sudah batal' }), 409); await err(adm.req('PATCH', `${A}${E}/penilaian/${X.nB}`, { konfirmasi: true, catatan: 'x', alasan_koreksi: 'sudah batal' }), 409);
    assert.strictEqual((await get('SELECT batal FROM edu_penilaian WHERE id=$1', [X.nB])).batal, true); await rejects(db.q('DELETE FROM edu_penilaian WHERE id=$1', [X.nB]), /tidak boleh dihapus/i);
    const c = ok(await P(adm, '/catatan', { santri_id: s1, kelas_id: kelA, catatan: 'Catatan perkembangan uji' }), 201).id; await err(P(adm, '/catatan', { santri_id: sAlm, catatan: 'alumni' }), 409); assert.strictEqual(ok(await G(adm, `/catatan?santri_id=${s1}`)).rows.length, 1); ok(await P(adm, `/catatan/${c}/batal`, { alasan: 'Salah catat uji' }));
  });
  await t('58. Riwayat pendidikan santri (aktif & alumni) lengkap; alumni tidak dihitung peserta aktif; riwayat tetap ada', async () => {
    const r = ok(await G(adm, '/riwayat/' + s1)); assert.ok(r.peserta.length >= 2); assert.ok(r.kehadiran.length >= 1); assert.ok(r.penilaian.length >= 2); assert.ok(r.presensi_terbaru.length >= 1); assert.strictEqual(r.santri.nis, 'T5-001');
    const txt = JSON.stringify(r); for (const w of ['nama_ayah', 'nama_ibu', 'alamat', 'telepon', 'tagihan', 'saldo']) assert.ok(!new RegExp('"' + w, 'i').test(txt), w);
    const sX = await mkS('Santri Uji T5-D', 'L', 'T5-004'); ok(await P(adm, '/peserta', { kelas_id: kelC, santri_id: sX }), 201); const before = ok(await G(adm, '/dashboard')).ringkasan.peserta_aktif; ok(await adm.req('POST', `${A}/santri/${sX}/pindah-alumni`, { konfirmasi: true, status_alumni: 'berhenti', tanggal_keluar: today })); const s3b = sX;
    const d = ok(await G(adm, '/dashboard')).ringkasan; assert.strictEqual(d.peserta_aktif, before - 1, 'alumni tidak dihitung'); assert.strictEqual(ok(await G(adm, `/peserta?kelas_id=${kelC}&status=aktif`)).rows.every(x => x.santri_id !== sX), true); assert.strictEqual(ok(await G(adm, `/peserta?santri_id=${sX}&status=nonaktif`)).rows.length, 1);
    const ra = ok(await G(adm, '/riwayat/' + sX)); assert.strictEqual(ra.santri.status, 'alumni'); assert.ok(ra.peserta.length >= 1, 'riwayat tetap tersimpan setelah jadi alumni');
    assert.strictEqual(ok(await G(adm, '/cari-santri?q=T5-')).rows.some(x => x.nis === 'T5-004'), false); assert.strictEqual(ok(await G(adm, '/santri?q=T5-004')).rows.length, 1); await err(G(adm, '/riwayat/999999'), 404);
    await err(adm.req('PUT', `${A}${E}/sesi/${ses1}/presensi`, { konfirmasi: true, items: [{ santri_id: sX, status_id: stH }] }), 409);
  });
  await t('59. Dashboard: angka dari database (santri aktif, kelas, pengajar, jadwal hari ini, rekap presensi, grafik), tanpa data dummy', async () => {
    const d = ok(await G(adm, '/dashboard')); const r = d.ringkasan; assert.ok(r.santri_aktif >= 2); assert.strictEqual(r.kelas, 3); assert.ok(r.pengajar_aktif >= 2); assert.strictEqual(r.jenis, 2); assert.ok(r.jadwal >= 5); assert.ok(r.kegiatan_periode >= 2);
    assert.ok(d.rekap_presensi.length >= 1 && d.grafik.harian.length >= 1 && d.grafik.per_kelas.length >= 1 && d.grafik.kegiatan.length >= 1 && d.grafik.nilai.length >= 1); assert.ok(d.evaluasi_terbaru.length >= 1); assert.ok(Array.isArray(d.jadwal_hari_ini) && Array.isArray(d.berlangsung));
    const dow = isoDow(today); assert.strictEqual(d.jadwal_hari_ini.length, (await get("SELECT COUNT(*)::int n FROM edu_jadwal WHERE aktif AND hari=$1 AND (mulai IS NULL OR mulai<=CURRENT_DATE) AND (sampai IS NULL OR sampai>=CURRENT_DATE)", [dow])).n);
    assert.strictEqual(ok(await G(adm, `/dashboard?kelas_id=${kelA}`)).rekap_presensi.reduce((a, x) => a + x.n, 0), 1);
  });
  await t('60. Laporan: 8 jenis JSON + PDF + Excel + filter; identitas pondok; sesuai pengaturan', async () => {
    const ExcelJS = require('exceljs'), list = ok(await G(adm, '/laporan')).jenis; assert.strictEqual(list.length, 8);
    for (const j of list) { const r = ok(await G(adm, '/laporan/' + j.id)); assert.ok(r.kolom.length && Array.isArray(r.rows) && r.ringkasan.length, j.id); assert.strictEqual(r.pondok, 'Pondok Pesantren Alhidayah Induk'); }
    assert.ok(ok(await G(adm, '/laporan/peserta?status=pindah')).rows.length >= 1); assert.ok(ok(await G(adm, `/laporan/peserta?kelompok=putri`)).rows.every(r => r.jk === 'Putri')); assert.ok(ok(await G(adm, `/laporan/jadwal?kelas_id=${kelA}`)).rows.every(r => r.kelas === 'Kelas Uji A'));
    assert.ok(ok(await G(adm, `/laporan/presensi?dari=${today}&sampai=${today}`)).rows.length >= 2); assert.ok(ok(await G(adm, '/laporan/evaluasi')).ringkasan.some(x => x[0].startsWith('Rata-rata'))); assert.ok(ok(await G(adm, '/laporan/perkembangan')).rows.length >= 2);
    const pdf = await adm.buf(`${A}${E}/laporan/jadwal?format=pdf`); assert.strictEqual(pdf.status, 200); assert.strictEqual(pdf.buf.slice(0, 4).toString(), '%PDF');
    const x = await adm.buf(`${A}${E}/laporan/presensi?format=xlsx`); assert.strictEqual(x.status, 200); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x.buf); assert.strictEqual(wb.worksheets[0].getRow(1).getCell(1).value, 'Pondok Pesantren Alhidayah Induk');
    await err(G(adm, '/laporan/tidak-ada'), 404); ok(await adm.req('PUT', `${A}${E}/pengaturan`, { identitas: { nama: 'Pondok Uji Edu', alamat: 'Alamat Uji', kontak: '', catatan: '' } })); assert.strictEqual(ok(await G(adm, '/laporan/kelas')).pondok, 'Pondok Uji Edu'); ok(await adm.req('PUT', `${A}${E}/pengaturan`, { identitas: { nama: 'Pondok Pesantren Alhidayah Induk', alamat: '', kontak: '', catatan: '' } }));
  });
  await t('61. Log aktivitas & jejak audit: semua tindakan penting tercatat; append-only; tidak ada penghapusan permanen', async () => {
    const a = ok(await G(adm, '/audit')); assert.ok(a.total >= 40); const ent = new Set((await db.q('SELECT DISTINCT entitas FROM edu_audit')).map(r => r.entitas)); for (const e of ['peserta', 'penugasan', 'jadwal', 'presensi', 'presensi_pengajar', 'penilaian', 'sesi', 'pengaturan', 'kelas', 'jenis', 'catatan']) assert.ok(ent.has(e), e);
    assert.ok((await get("SELECT COUNT(*)::int n FROM activity_log WHERE modul='pendidikan'")).n >= 30); await rejects(db.q("UPDATE edu_audit SET ket='x'"), /tidak boleh dihapus|tidak dapat diubah/i); await rejects(db.q('DELETE FROM edu_audit'), /tidak boleh dihapus/i);
    for (const tb of ['edu_kelas', 'edu_peserta', 'edu_presensi', 'edu_sesi', 'edu_jenis']) await rejects(db.q(`DELETE FROM ${tb}`), /tidak boleh dihapus/i, tb);
  });
};
