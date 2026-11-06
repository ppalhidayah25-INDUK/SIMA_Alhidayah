'use strict';
// Pengujian Tahap 3 (keuangan). Seluruh nama/nominal di bawah adalah DATA UJI sementara di database memori — bukan data pondok.
module.exports = async function tahap3(X) {
  const { t, client, adm, ben, kea, q, get, A, assert, db, PW } = X;
  const ExcelJS = require('exceljs');
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const P = (c, u, b) => c.req('POST', A + '/keuangan' + u, Object.assign({ konfirmasi: true }, b)), G = (c, u) => c.req('GET', A + '/keuangan' + u);
  const ok = (r, st = 200) => { assert.strictEqual(r.status, st, `status ${r.status}: ${(r.text || '').slice(0, 220)}`); return r.json; };
  const err = async (p, st) => { const r = await p; assert.strictEqual(r.status, st, `diharapkan ${st}, dapat ${r.status}: ${(r.text || '').slice(0, 160)}`); return r.json; };
  await ben.login('bendahara1', PW); await kea.login('keamanan1', PW);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const mkS = async (nama, jk, nis, thn) => ok(await adm.req('POST', A + '/santri', { nama, jenis_kelamin: jk, nis, tanggal_masuk: thn + '-07-15' }), 201).id;
  const sA = await mkS('Santri Uji T3-A', 'L', 'T3-001', 1991), sB = await mkS('Santri Uji T3-B', 'L', 'T3-002', 1991), sC = await mkS('Santri Uji T3-C', 'P', 'T3-003', 1991), sD = await mkS('Santri Uji T3-D', 'L', 'T3-004', 1991);
  let kat, katB, mTunai, mTf, uid = 0, idem = () => 'idem-' + (++uid) + '-' + Math.random().toString(36).slice(2, 10);
  const tagA = {};

  // ===== 20. Kategori & tagihan =====
  await t('20a. Kategori tagihan: muat awal (6), tambah, nama ganda ditolak, nonaktifkan; Keamanan ditolak', async () => {
    assert.strictEqual(ok(await P(ben, '/kategori-tagihan/awal', {})).ditambahkan, 6); assert.strictEqual(ok(await P(ben, '/kategori-tagihan/awal', {})).ditambahkan, 0);
    const ref = ok(await G(ben, '/ref')); kat = ref.kategori_tagihan.find(k => k.nama === 'Syahriah').id; katB = ref.kategori_tagihan.find(k => k.nama === 'Uang ujian').id;
    mTunai = ref.metode.find(m => m.nama === 'Tunai').id; mTf = ref.metode.find(m => m.nama === 'Transfer').id;
    const n = ok(await P(ben, '/kategori-tagihan', { nama: 'Kategori Uji' }), 201).id; await err(P(ben, '/kategori-tagihan', { nama: 'kategori uji' }), 409);
    ok(await ben.req('PATCH', A + '/keuangan/kategori-tagihan/' + n, { aktif: false })); await err(P(ben, '/tagihan/pratinjau', { kategori_id: n, nominal: 1000, periode_tipe: 'lain', periode: 'X1', target: { ids: [sA] } }), 400);
    await err(G(kea, '/ref'), 403);
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM keu_tagihan')).n, 0, 'tidak ada tagihan/nominal bawaan');
  });
  await t('20b. Tagihan satu santri; nominal tidak otomatis & divalidasi; periode wajib', async () => {
    for (const nominal of [0, -5, 'abc', '', null, 1e15, 12.5]) await err(P(ben, '/tagihan', { kategori_id: kat, nominal, periode_tipe: 'bulan', periode: '2026-11', target: { ids: [sA] } }), 400);
    await err(P(ben, '/tagihan', { kategori_id: kat, nominal: 100000, periode_tipe: 'bulan', periode: '2026-13', target: { ids: [sA] } }), 400);
    await err(ben.req('POST', A + '/keuangan/tagihan', { kategori_id: kat, nominal: 100000, periode_tipe: 'bulan', periode: '2026-11', target: { ids: [sA] } }), 400);   // tanpa konfirmasi
    const r = ok(await P(ben, '/tagihan', { kategori_id: kat, nominal: 100000, periode_tipe: 'bulan', periode: '2026-11', jatuh_tempo: '2026-11-10', target: { ids: [sA] } }), 201);
    assert.deepStrictEqual([r.dibuat, r.dilewati, r.total], [1, 0, 100000]);
    const l = ok(await G(ben, `/tagihan?santri_id=${sA}`)).rows; assert.strictEqual(l.length, 1); tagA.id = l[0].id; assert.deepStrictEqual([l[0].status_bayar, Number(l[0].sisa), l[0].nis], ['belum', 100000, 'T3-001']);
  });
  await t('20c. Tagihan massal: pratinjau (jumlah+total), simpan, filter kelompok/angkatan; ganda dilewati', async () => {
    const body = { kategori_id: kat, nominal: 50000, periode_tipe: 'bulan', periode: '2026-12', target: { kelompok: 'putra', tahun_masuk: 1991 } };
    const pv = ok(await P(ben, '/tagihan/pratinjau', body)); assert.deepStrictEqual([pv.jumlah, pv.total, pv.dilewati], [3, 150000, 0]); assert.strictEqual(pv.santri.length, 3);
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM keu_tagihan WHERE periode=$1', ['2026-12'])).n, 0, 'pratinjau tidak menyimpan');
    const r = ok(await P(ben, '/tagihan', body), 201); assert.deepStrictEqual([r.dibuat, r.dilewati, r.total], [3, 0, 150000]);
    const r2 = ok(await P(ben, '/tagihan', body), 201); assert.deepStrictEqual([r2.dibuat, r2.dilewati], [0, 3]);                       // pencegahan tagihan ganda
    const r3 = ok(await P(ben, '/tagihan', Object.assign({}, body, { periode: '2027-01', target: { ids: [sB, sC] } })), 201); assert.strictEqual(r3.dibuat, 2);
    await err(P(ben, '/tagihan', Object.assign({}, body, { target: {} })), 400);                                                   // sasaran wajib eksplisit
    assert.strictEqual(ok(await P(ben, '/tagihan/pratinjau', Object.assign({}, body, { periode: '2027-02', target: { kelompok: 'putri', tahun_masuk: 1991 } }))).jumlah, 1);
    const semua = (await get("SELECT COUNT(*)::int n FROM santri WHERE status='aktif' AND NOT diarsipkan")).n;
    assert.strictEqual(ok(await P(ben, '/tagihan/pratinjau', Object.assign({}, body, { periode: '2027-02', target: { semua: true } }))).jumlah, semua);
  });
  await t('20d. Ganda: tagihan dengan kategori/periode sama untuk satu santri ditolak di database (indeks unik)', async () => {
    await assert.rejects(q("INSERT INTO keu_tagihan (santri_id,kategori_id,nama,periode,periode_key,nominal,dibuat,oleh) VALUES ($1,$2,'x','2026-11','2026-11',1,1,1)", [sA, kat]), /unique|duplicate/i);
    const r = ok(await P(ben, '/tagihan', { kategori_id: kat, nominal: 70000, periode_tipe: 'lain', periode: 'Semester Ganjil 2026', target: { ids: [sA, sC] } }), 201); assert.strictEqual(r.dibuat, 2);
    await err(P(ben, '/tagihan', { kategori_id: kat, nominal: 1000, periode_tipe: 'lain', periode: 'x', target: { ids: [sA, 999999] } }), 400);   // santri tak dikenal
  });

  // ===== 21. Pembayaran & kuitansi =====
  let pay1, pay2;
  await t('21a. Sebagian lalu lunas; sisa dihitung otomatis; kelebihan & tagihan lunas ditolak', async () => {
    pay1 = ok(await P(ben, '/pembayaran', { tagihan_id: tagA.id, nominal: 40000, tanggal: today, metode_id: mTunai, idem: idem() }), 201); assert.strictEqual(pay1.sisa_setelah, 60000);
    let d = ok(await G(ben, '/tagihan/' + tagA.id)); assert.deepStrictEqual([d.tagihan.status_bayar, Number(d.tagihan.dibayar), Number(d.tagihan.sisa)], ['sebagian', 40000, 60000]);
    await err(P(ben, '/pembayaran', { tagihan_id: tagA.id, nominal: 60001, tanggal: today, metode_id: mTunai }), 409);
    pay2 = ok(await P(ben, '/pembayaran', { tagihan_id: tagA.id, nominal: 60000, tanggal: today, metode_id: mTf }), 201); assert.strictEqual(pay2.sisa_setelah, 0);
    d = ok(await G(ben, '/tagihan/' + tagA.id)); assert.strictEqual(d.tagihan.status_bayar, 'lunas');
    await err(P(ben, '/pembayaran', { tagihan_id: tagA.id, nominal: 1, tanggal: today, metode_id: mTunai }), 409);
    for (const nominal of [0, -1, 'x']) await err(P(ben, '/pembayaran', { tagihan_id: tagA.id, nominal, tanggal: today, metode_id: mTunai }), 400);
    await err(P(ben, '/pembayaran', { tagihan_id: tagA.id, nominal: 1, tanggal: '2999-01-01', metode_id: mTunai }), 400);
  });
  await t('21b. Pencegahan transaksi ganda (idempotensi) & nomor kuitansi unik', async () => {
    const tg = (await get("SELECT id FROM keu_tagihan WHERE santri_id=$1 AND periode='2026-12'", [sB])).id, k = idem();
    const a = ok(await P(ben, '/pembayaran', { tagihan_id: tg, nominal: 10000, tanggal: today, metode_id: mTunai, idem: k }), 201), b = ok(await P(ben, '/pembayaran', { tagihan_id: tg, nominal: 10000, tanggal: today, metode_id: mTunai, idem: k }), 200);
    assert.strictEqual(a.id, b.id); assert.strictEqual((await get('SELECT COUNT(*)::int n FROM keu_pembayaran WHERE tagihan_id=$1', [tg])).n, 1);
    const nos = (await q('SELECT no_kuitansi FROM keu_pembayaran')).map(x => x.no_kuitansi); assert.strictEqual(new Set(nos).size, nos.length); assert.match(nos[0], /^KWT-\d{4}-\d{6}$/);
  });
  await t('21c. Balapan: dua pembayaran serentak yang melebihi sisa — hanya satu berhasil', async () => {
    const tg = (await get("SELECT id FROM keu_tagihan WHERE santri_id=$1 AND periode='2026-12'", [sD])).id;
    const rs = await Promise.all([1, 2].map(() => P(ben, '/pembayaran', { tagihan_id: tg, nominal: 40000, tanggal: today, metode_id: mTunai, idem: idem() })));
    assert.deepStrictEqual(rs.map(r => r.status).sort(), [201, 409]); assert.strictEqual(Number((await get("SELECT SUM(nominal) n FROM keu_pembayaran WHERE tagihan_id=$1 AND status='sah'", [tg])).n), 40000);
  });
  await t('21d. Kuitansi: pratinjau (JSON), PDF, cetak ulang dari riwayat, isi sesuai ketentuan', async () => {
    const k = ok(await G(ben, '/kuitansi/' + pay1.id)); assert.deepStrictEqual([k.nis, k.santri, k.nominal, k.sisa, k.metode, k.nomor], ['T3-001', 'Santri Uji T3-A', 40000, 60000, 'Tunai', pay1.no_kuitansi]);
    assert.ok(k.baris.some(b => b[0] === 'Sisa tagihan') && /Alhidayah/.test(k.pondok)); assert.match(k.baris.find(b => b[0] === 'Tanggal transaksi')[1], /^\d{1,2} [A-Z][a-z]+ \d{4}$/);
    const lunas = ok(await G(ben, '/kuitansi/' + pay2.id)); assert.ok(!lunas.baris.some(b => b[0] === 'Sisa tagihan') && lunas.baris.some(b => b[1] === 'LUNAS'));
    for (let i = 0; i < 2; i++) { const p = await ben.buf(`${A}/keuangan/kuitansi/${pay1.id}.pdf`); assert.strictEqual(p.status, 200); assert.strictEqual(p.buf.slice(0, 5).toString(), '%PDF-'); assert.match(p.headers.get('content-disposition'), /attachment/); }
    assert.strictEqual((await kea.buf(`${A}/keuangan/kuitansi/${pay1.id}.pdf`)).status, 403);
    assert.strictEqual((await ben.buf(`${A}/keuangan/kuitansi/999999.pdf`)).status, 404);
  });
  await t('21e. Pembayaran massal satu santri (batch) → beberapa kuitansi dalam satu transaksi; gagal = tidak ada yang tersimpan', async () => {
    const tgs = (await q('SELECT id FROM keu_tagihan WHERE santri_id=$1 AND status=\'aktif\' ORDER BY id', [sC])).map(x => x.id);
    const before = (await get('SELECT COUNT(*)::int n FROM keu_pembayaran')).n;
    await err(P(ben, '/pembayaran/batch', { tanggal: today, metode_id: mTunai, items: [{ tagihan_id: tgs[0], nominal: 10000 }, { tagihan_id: tgs[1], nominal: 99999999 }] }), 409);
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM keu_pembayaran')).n, before, 'rollback: tidak ada pembayaran parsial');
    const r = ok(await P(ben, '/pembayaran/batch', { tanggal: today, metode_id: mTunai, items: tgs.map(id => ({ tagihan_id: id, nominal: 10000 })) }), 201); assert.strictEqual(r.hasil.length, tgs.length);
  });
  await t('21f. Pembatalan pembayaran: wajib alasan & konfirmasi, tercatat, status tagihan kembali; tidak bisa dua kali', async () => {
    await err(P(ben, `/pembayaran/${pay2.id}/batal`, { alasan: 'x' }), 400); await err(ben.req('POST', `${A}/keuangan/pembayaran/${pay2.id}/batal`, { alasan: 'Salah input nominal' }), 400);
    ok(await P(ben, `/pembayaran/${pay2.id}/batal`, { alasan: 'Salah input nominal' }));
    const d = ok(await G(ben, '/tagihan/' + tagA.id)); assert.deepStrictEqual([d.tagihan.status_bayar, Number(d.tagihan.sisa)], ['sebagian', 60000]);
    const row = await get('SELECT status, batal_alasan, batal_oleh, batal_waktu FROM keu_pembayaran WHERE id=$1', [pay2.id]); assert.deepStrictEqual([row.status, row.batal_alasan, row.batal_oleh != null, row.batal_waktu != null], ['dibatalkan', 'Salah input nominal', true, true]);
    await err(P(ben, `/pembayaran/${pay2.id}/batal`, { alasan: 'Salah input nominal' }), 409);
    assert.ok(ok(await G(ben, '/kuitansi/' + pay2.id)).batal); assert.ok(ok(await G(adm, '/tagihan/' + tagA.id)).audit.some(a => a.aksi === 'batal') || (await get("SELECT 1 x FROM keu_audit WHERE entitas='pembayaran' AND entitas_id=$1 AND aksi='batal' AND alasan IS NOT NULL", [pay2.id])));
    ok(await P(ben, '/pembayaran', { tagihan_id: tagA.id, nominal: 60000, tanggal: today, metode_id: mTunai }), 201);   // pembayaran ulang yang benar
  });
  await t('21g. Koreksi & pembatalan tagihan: nilai sebelum/sesudah tersimpan; tidak boleh di bawah yang sudah dibayar', async () => {
    const tg = (await get("SELECT id FROM keu_tagihan WHERE santri_id=$1 AND periode='2026-12'", [sB])).id;   // sudah dibayar 10.000
    await err(P(ben, `/tagihan/${tg}/koreksi`, { nominal: 5000, alasan: 'Koreksi nominal' }), 409); await err(P(ben, `/tagihan/${tg}/koreksi`, { nominal: 60000 }), 400);
    ok(await P(ben, `/tagihan/${tg}/koreksi`, { nominal: 60000, alasan: 'Nominal resmi berubah' }));
    const a = await get("SELECT sebelum, sesudah, alasan, username FROM keu_audit WHERE entitas='tagihan' AND entitas_id=$1 AND aksi='koreksi'", [tg]); assert.deepStrictEqual([a.sebelum.nominal, a.sesudah.nominal, a.alasan, a.username], [50000, 60000, 'Nominal resmi berubah', 'bendahara1']);
    await err(P(ben, `/tagihan/${tg}/batal`, { alasan: 'Salah buat tagihan' }), 409);   // masih ada pembayaran (trigger DB)
    const tg2 = (await get("SELECT id FROM keu_tagihan WHERE santri_id=$1 AND periode='2027-01'", [sB])).id; ok(await P(ben, `/tagihan/${tg2}/batal`, { alasan: 'Salah buat tagihan' }));
    ok(await P(ben, '/tagihan', { kategori_id: kat, nominal: 55000, periode_tipe: 'bulan', periode: '2027-01', target: { ids: [sB] } }), 201);   // slot periode bebas lagi setelah dibatalkan
    await err(P(ben, `/tagihan/${tg2}/koreksi`, { nominal: 1000, alasan: 'sudah batal' }), 409);
  });

  // ===== 22. Tabungan =====
  let setor, tarik;
  await t('22a. Setoran membuka rekening otomatis; saldo = sebelum + setoran − penarikan; nomor & saldo sebelum/sesudah', async () => {
    setor = ok(await P(ben, `/tabungan/${sA}/transaksi`, { jenis: 'setoran', tanggal: today, nominal: 200000, metode: 'Tunai', keterangan: 'Setoran uji', idem: idem() }), 201);
    assert.deepStrictEqual([setor.saldo_sebelum, setor.saldo_sesudah], [0, 200000]); assert.match(setor.no_transaksi, /^TAB-\d{4}-\d{6}$/);
    tarik = ok(await P(ben, `/tabungan/${sA}/transaksi`, { jenis: 'penarikan', tanggal: today, nominal: 50000, keterangan: 'Keperluan uji' }), 201); assert.deepStrictEqual([tarik.saldo_sebelum, tarik.saldo_sesudah], [200000, 150000]);
    const d = ok(await G(ben, '/tabungan/' + sA)); assert.deepStrictEqual([Number(d.rekening.saldo), Number(d.ringkasan.setoran), Number(d.ringkasan.penarikan), d.rows.length], [150000, 200000, 50000, 2]);
  });
  await t('22b. Saldo tidak valid dicegah: penarikan melebihi saldo, tanpa rekening, tanpa keterangan, nominal ≤ 0; ganda (idempotensi)', async () => {
    await err(P(ben, `/tabungan/${sA}/transaksi`, { jenis: 'penarikan', tanggal: today, nominal: 150001, keterangan: 'x' }), 409);
    await err(P(ben, `/tabungan/${sB}/transaksi`, { jenis: 'penarikan', tanggal: today, nominal: 1, keterangan: 'x' }), 409);
    await err(P(ben, `/tabungan/${sA}/transaksi`, { jenis: 'penarikan', tanggal: today, nominal: 1 }), 400);
    for (const nominal of [0, -10, 'a']) await err(P(ben, `/tabungan/${sA}/transaksi`, { jenis: 'setoran', tanggal: today, nominal }), 400);
    const k = idem(); ok(await P(ben, `/tabungan/${sA}/transaksi`, { jenis: 'setoran', tanggal: today, nominal: 1000, idem: k }), 201); ok(await P(ben, `/tabungan/${sA}/transaksi`, { jenis: 'setoran', tanggal: today, nominal: 1000, idem: k }), 200);
    assert.strictEqual(Number(ok(await G(ben, '/tabungan/' + sA)).rekening.saldo), 151000);
  });
  await t('22c. Balapan penarikan: saldo tidak pernah negatif', async () => {
    ok(await P(ben, `/tabungan/${sD}/transaksi`, { jenis: 'setoran', tanggal: today, nominal: 100000 }), 201);
    const rs = await Promise.all([1, 2, 3].map(() => P(ben, `/tabungan/${sD}/transaksi`, { jenis: 'penarikan', tanggal: today, nominal: 60000, keterangan: 'uji', idem: idem() })));
    assert.deepStrictEqual(rs.map(r => r.status).sort(), [201, 409, 409]); assert.strictEqual(Number(ok(await G(ben, '/tabungan/' + sD)).rekening.saldo), 40000);
  });
  await t('22d. Saldo tidak bisa diedit langsung: tabel transaksi tak dapat diubah/dihapus; baris tak konsisten ditolak DB', async () => {
    await assert.rejects(q('UPDATE tabungan_transaksi SET nominal=1 WHERE id=$1', [setor.id]), /tidak boleh diubah/); await assert.rejects(q('DELETE FROM tabungan_transaksi WHERE id=$1', [setor.id]), /tidak boleh diubah/);
    const rek = (await get('SELECT id FROM tabungan_rekening WHERE santri_id=$1', [sA])).id;
    await assert.rejects(q("INSERT INTO tabungan_transaksi (no_transaksi,rekening_id,santri_id,tanggal,jenis,nominal,saldo_sebelum,saldo_sesudah,dibuat,oleh) VALUES ('X-1',$1,$2,CURRENT_DATE,'setoran',1000000,0,1000000,1,1)", [rek, sA]), /tidak konsisten/);
    await assert.rejects(q('DELETE FROM tabungan_rekening WHERE id=$1', [rek]), /tidak boleh dihapus/);
  });
  await t('22e. Pembalikan: alasan wajib, sekali saja, tidak boleh membuat saldo negatif; riwayat tetap ada', async () => {
    await err(P(ben, `/tabungan/transaksi/${tarik.id}/balik`, { alasan: 'x' }), 400);
    const b = ok(await P(ben, `/tabungan/transaksi/${tarik.id}/balik`, { alasan: 'Salah catat penarikan' }), 201); assert.strictEqual(b.saldo_sesudah, 151000 + 50000);
    await err(P(ben, `/tabungan/transaksi/${tarik.id}/balik`, { alasan: 'Salah catat penarikan' }), 409); await err(P(ben, `/tabungan/transaksi/${b.id}/balik`, { alasan: 'Balik pembalikan' }), 409);
    const d = ok(await G(ben, '/tabungan/' + sA)); assert.ok(d.rows.some(x => x.id === tarik.id && x.dibalik) && d.rows.some(x => x.jenis === 'pembalikan_penarikan' && x.alasan === 'Salah catat penarikan'));
  });
  await t('22f. Pembalikan setoran yang membuat saldo negatif ditolak', async () => {
    const s2 = ok(await P(ben, `/tabungan/${sB}/transaksi`, { jenis: 'setoran', tanggal: today, nominal: 30000 }), 201);
    ok(await P(ben, `/tabungan/${sB}/transaksi`, { jenis: 'penarikan', tanggal: today, nominal: 20000, keterangan: 'uji' }), 201);
    await err(P(ben, `/tabungan/transaksi/${s2.id}/balik`, { alasan: 'Setoran salah santri' }), 409);
  });
  await t('22g. Bukti tabungan: JSON & PDF; alumni tidak dapat setor tetapi dapat menarik saldo', async () => {
    const b = ok(await G(ben, '/tabungan-bukti/' + setor.id)); assert.ok(b.baris.some(x => x[0] === 'Saldo sesudah')); assert.match(b.baris[1][1], /^\d{1,2} [A-Z][a-z]+ \d{4}$/); const p = await ben.buf(`${A}/keuangan/tabungan-bukti/${setor.id}.pdf`); assert.strictEqual(p.buf.slice(0, 5).toString(), '%PDF-');
    ok(await adm.req('POST', `${A}/santri/${sD}/pindah-alumni`, { konfirmasi: true, status_alumni: 'lulus', tanggal_keluar: today, tahun_keluar: +today.slice(0, 4) }));
    await err(P(ben, `/tabungan/${sD}/transaksi`, { jenis: 'setoran', tanggal: today, nominal: 1000 }), 409);
    ok(await P(ben, `/tabungan/${sD}/transaksi`, { jenis: 'penarikan', tanggal: today, nominal: 40000, keterangan: 'Penarikan alumni' }), 201);
    await err(P(ben, '/tagihan', { kategori_id: kat, nominal: 1000, periode_tipe: 'lain', periode: 'Alumni uji', target: { ids: [sD] } }), 400);
    assert.ok(ok(await G(ben, '/tabungan?q=T3-004')).rows.length === 1);
  });

  // ===== 23. Kas =====
  let kM, kK, kasMasuk, kasKeluar, kasTx;
  await t('23a. Kategori kas pemasukan/pengeluaran; saldo awal hanya sekali', async () => {
    kM = ok(await P(ben, '/kategori-kas', { jenis: 'masuk', nama: 'Donasi Uji' }), 201).id; kK = ok(await P(ben, '/kategori-kas', { jenis: 'keluar', nama: 'Operasional Uji' }), 201).id;
    await err(P(ben, '/kategori-kas', { jenis: 'masuk', nama: 'donasi uji' }), 409); await err(P(ben, '/kategori-kas', { jenis: 'lain', nama: 'Xx' }), 400);
    ok(await P(ben, '/kas/saldo-awal', { tanggal: today, nominal: 1000000, keterangan: 'Saldo awal uji' }), 201); await err(P(ben, '/kas/saldo-awal', { tanggal: today, nominal: 5 }), 409);
  });
  await t('23b. Pemasukan & pengeluaran kas; kategori harus sesuai jenis; validasi nominal; bukti opsional', async () => {
    kasMasuk = ok(await P(ben, '/kas', { jenis: 'masuk', tanggal: today, kategori_id: kM, pihak: 'Donatur uji', nominal: 500000, keterangan: 'uji', idem: idem() }), 201);
    kasKeluar = ok(await P(ben, '/kas', { jenis: 'keluar', tanggal: today, kategori_id: kK, pihak: 'Pembelian uji', nominal: 200000, idem: idem() }), 201); assert.match(kasKeluar.no_transaksi, /^KAS-\d{4}-\d{6}$/);
    await err(P(ben, '/kas', { jenis: 'keluar', tanggal: today, kategori_id: kM, pihak: 'Tujuan', nominal: 1 }), 400); await err(P(ben, '/kas', { jenis: 'masuk', tanggal: today, kategori_id: kM, pihak: 'Sumber', nominal: 0 }), 400);
    await err(P(ben, '/kas', { jenis: 'masuk', tanggal: today, kategori_id: kM, nominal: 5 }), 400);
    const k = idem(); ok(await P(ben, '/kas', { jenis: 'masuk', tanggal: today, kategori_id: kM, pihak: 'Ganda', nominal: 1000, idem: k }), 201); ok(await P(ben, '/kas', { jenis: 'masuk', tanggal: today, kategori_id: kM, pihak: 'Ganda', nominal: 1000, idem: k }), 200);
    ok(await P(ben, `/kas/${(await get('SELECT id FROM kas_transaksi WHERE idem=$1', [k])).id}/balik`, { alasan: 'Entri uji ganda' }), 201);
  });
  await t('23c. Saldo kas = saldo awal + pemasukan − pengeluaran (buku kas, saldo berjalan, filter)', async () => {
    const b = ok(await G(ben, '/kas?periode=bulan')); assert.deepStrictEqual([b.saldo_awal, b.pemasukan, b.pengeluaran, b.saldo_akhir], [1000000, 500000, 200000, 1300000]);
    const asc = b.rows.slice().reverse(); let s = b.saldo_awal; asc.forEach(r => { s += r.masuk - r.keluar; assert.strictEqual(r.saldo, s); });
    assert.strictEqual(ok(await G(ben, `/kas?periode=bulan&jenis=keluar`)).rows.length, 1); assert.strictEqual(ok(await G(ben, `/kas?periode=bulan&kategori_id=${kM}`)).rows.length, 3);
    await err(G(ben, '/kas?periode=rentang&dari=2026-13-01&sampai=2026-01-01'), 400); await err(G(ben, '/kas?periode=rentang&dari=2026-05-01&sampai=2026-01-01'), 400);
  });
  await t('23d. Bukti transaksi kas: PNG sah terlampir sekali; format lain/palsu ditolak; hanya Super Admin & Bendahara dapat membuka', async () => {
    kasTx = kasKeluar.id;
    await err(ben.req('PUT', `${A}/keuangan/kas/${kasTx}/bukti`, { nama: 'x.exe', data: Buffer.from('MZ-bukan-gambar').toString('base64') }), 400);
    await err(ben.req('PUT', `${A}/keuangan/kas/${kasTx}/bukti`, { nama: 'x.png', data: 'bukan base64!!' }), 400);
    ok(await ben.req('PUT', `${A}/keuangan/kas/${kasTx}/bukti`, { nama: 'nota.png', data: PNG })); await err(ben.req('PUT', `${A}/keuangan/kas/${kasTx}/bukti`, { nama: 'nota2.png', data: PNG }), 409);
    const bid = (await get('SELECT berkas_id FROM kas_transaksi WHERE id=$1', [kasTx])).berkas_id;
    assert.strictEqual((await ben.buf(`${A}/berkas/${bid}`)).status, 200); assert.strictEqual((await adm.buf(`${A}/berkas/${bid}`)).status, 200); assert.strictEqual((await kea.buf(`${A}/berkas/${bid}`)).status, 403);
    assert.strictEqual((await client().buf(`${A}/berkas/${bid}`)).status, 401);
    await err(kea.req('PUT', `${A}/keuangan/kas/${kasTx}/bukti`, { nama: 'x.png', data: PNG }), 403);
  });
  await t('23e. Pembalikan kas: alasan wajib, sekali, mengurangi total; transaksi tidak dapat diubah/dihapus di DB', async () => {
    await err(P(ben, `/kas/${kasKeluar.id}/balik`, { alasan: 'x' }), 400); const b = ok(await P(ben, `/kas/${kasKeluar.id}/balik`, { alasan: 'Salah catat pengeluaran' }), 201); assert.ok(b.no_transaksi);
    await err(P(ben, `/kas/${kasKeluar.id}/balik`, { alasan: 'Salah catat pengeluaran' }), 409);
    const k = ok(await G(ben, '/kas?periode=bulan')); assert.deepStrictEqual([k.pemasukan, k.pengeluaran, k.saldo_akhir], [500000, 0, 1500000]);
    await assert.rejects(q('UPDATE kas_transaksi SET nominal=1 WHERE id=$1', [kasMasuk.id]), /tidak boleh diubah/); await assert.rejects(q('DELETE FROM kas_transaksi WHERE id=$1', [kasMasuk.id]), /tidak boleh dihapus/);
    await assert.rejects(q('UPDATE keu_pembayaran SET nominal=1 WHERE id=$1', [pay1.id]), /hanya dapat dibatalkan/); await assert.rejects(q('DELETE FROM keu_pembayaran WHERE id=$1', [pay1.id]), /tidak boleh dihapus/);
    await assert.rejects(q('UPDATE keu_audit SET alasan=$1', ['x']), /tidak boleh diubah/); await assert.rejects(q('DELETE FROM keu_tagihan WHERE id=$1', [tagA.id]), /tidak boleh dihapus/);
  });

  // ===== 24. Pemisahan dana =====
  await t('24a. Pembayaran santri TIDAK menambah kas operasional maupun tabungan; tabungan tidak menambah kas', async () => {
    const snap = async () => ({ kas: Number((await get("SELECT COALESCE(SUM(CASE WHEN jenis IN ('saldo_awal','masuk','pembalikan_keluar') THEN nominal ELSE -nominal END),0) n FROM kas_transaksi")).n), tab: Number((await get("SELECT COALESCE(SUM(CASE WHEN jenis IN ('setoran','pembalikan_penarikan') THEN nominal ELSE -nominal END),0) n FROM tabungan_transaksi")).n) });
    const a = await snap(); const tg = (await get("SELECT id FROM keu_tagihan WHERE santri_id=$1 AND periode='2026-12'", [sB])).id;
    ok(await P(ben, '/pembayaran', { tagihan_id: tg, nominal: 5000, tanggal: today, metode_id: mTunai }), 201); assert.deepStrictEqual(await snap(), a);
    ok(await P(ben, `/tabungan/${sB}/transaksi`, { jenis: 'setoran', tanggal: today, nominal: 7000 }), 201); const c = await snap(); assert.strictEqual(c.kas, a.kas); assert.strictEqual(c.tab, a.tab + 7000);
    const d = ok(await G(ben, '/dashboard?periode=bulan')); assert.deepStrictEqual([d.kas.saldo, d.tabungan_saldo], [c.kas, c.tab]);
    assert.ok(!(await q("SELECT 1 FROM kas_transaksi WHERE keterangan ILIKE '%kuitansi%'")).length);
  });

  // ===== 25. Dashboard =====
  await t('25a. Dashboard: seluruh angka cocok dengan database; saldo/tunggakan/transaksi hari ini', async () => {
    const d = ok(await G(ben, '/dashboard?periode=tahun'));
    const sum = async sql => Number((await get(sql)).n);
    assert.strictEqual(d.tagihan.total, await sum("SELECT COALESCE(SUM(nominal),0) n FROM keu_tagihan WHERE status='aktif'"));
    assert.strictEqual(d.pembayaran_diterima, await sum("SELECT COALESCE(SUM(nominal),0) n FROM keu_pembayaran WHERE status='sah'"));
    assert.strictEqual(d.tunggakan.nominal, await sum("SELECT COALESCE(SUM(sisa),0) n FROM v_keu_tagihan WHERE status_bayar IN ('belum','sebagian')"));
    assert.strictEqual(d.tagihan.belum_jumlah + d.tagihan.sebagian_jumlah + d.tagihan.lunas_jumlah, d.tagihan.jumlah);
    assert.strictEqual(d.transaksi.hari_ini, await sum(`SELECT (SELECT COUNT(*) FROM keu_pembayaran WHERE tanggal='${today}') + (SELECT COUNT(*) FROM tabungan_transaksi WHERE tanggal='${today}') + (SELECT COUNT(*) FROM kas_transaksi WHERE jenis<>'saldo_awal' AND tanggal='${today}') n`));
    assert.ok(d.transaksi.bulan_ini >= d.transaksi.hari_ini); assert.strictEqual(d.grafik.status.reduce((a, x) => a + x.v, 0), d.tagihan.jumlah);
    assert.ok(d.grafik.kas.length === 12 && d.grafik.saldo_kas.length === 12); assert.strictEqual(d.grafik.saldo_kas[+today.slice(5, 7) - 1].v, d.kas.saldo);
  });
  await t('25b. Filter dashboard: hari/minggu/bulan/tahun/rentang; rentang tidak valid ditolak; data kosong = 0 (bukan contoh)', async () => {
    for (const p of ['hari', 'minggu', 'bulan', 'tahun', 'semua']) { const d = ok(await G(ben, '/dashboard?periode=' + p)); assert.ok(d.periode.dari <= d.periode.sampai); }
    const w = ok(await G(ben, '/dashboard?periode=minggu')).periode; assert.ok(w.dari <= today && today <= w.sampai && (new Date(w.sampai) - new Date(w.dari)) / 864e5 === 6);
    const z = ok(await G(ben, '/dashboard?periode=rentang&dari=2001-01-01&sampai=2001-01-31')); assert.deepStrictEqual([z.tagihan.total, z.pembayaran_diterima, z.kas.pemasukan, z.kas.pengeluaran], [0, 0, 0, 0]);
    await err(G(ben, '/dashboard?periode=rentang&dari=bukan&sampai=2001-01-31'), 400);
  });

  // ===== 26. Tunggakan & laporan =====
  await t('26a. Tunggakan: filter jenis/periode/status/kelompok/asrama/kamar, pencarian, ringkasan', async () => {
    const all = ok(await G(ben, '/tunggakan')); assert.ok(all.rows.every(r => ['belum', 'sebagian'].includes(r.status_bayar))); assert.strictEqual(all.ringkasan.sisa, String(all.rows.reduce((a, r) => a + Number(r.sisa), 0)) === String(all.ringkasan.sisa) ? all.ringkasan.sisa : -1);
    assert.ok(ok(await G(ben, '/tunggakan?q=T3-002')).rows.every(r => r.nis === 'T3-002')); assert.ok(ok(await G(ben, '/tunggakan?kelompok=putri')).rows.every(r => r.kelompok === 'putri'));
    assert.ok(ok(await G(ben, '/tunggakan?status=sebagian')).rows.every(r => r.status_bayar === 'sebagian')); assert.ok(ok(await G(ben, `/tunggakan?kategori_id=${kat}`)).rows.length > 0); assert.strictEqual(ok(await G(ben, `/tunggakan?kategori_id=${katB}`)).total, 0);
    assert.ok(Number(all.ringkasan.sisa) > 0 && !ok(await G(ben, '/tunggakan')).rows.some(r => r.status_bayar === 'lunas'));
  });
  await t('26b. Penempatan kamar tersaring: filter asrama/kamar pada tunggakan memakai data kamar saat ini', async () => {
    const a = ok(await adm.req('POST', A + '/asrama', { nama: 'Asrama Uji T3', jenis: 'putra' }), 201).id, k = ok(await adm.req('POST', A + '/kamar', { asrama_id: a, nama: 'T3-K1', kapasitas: 3 }), 201).id;
    ok(await adm.req('POST', `${A}/santri/${sB}/penempatan`, { kamar_id: k })); const r = ok(await G(ben, `/tunggakan?kamar_id=${k}`)); assert.ok(r.rows.length > 0 && r.rows.every(x => x.nis === 'T3-002')); assert.ok(ok(await G(ben, `/tunggakan?asrama_id=${a}`)).rows.length === r.rows.length);
    assert.ok(ok(await G(ben, '/ref')).asrama.some(x => x.id === a));
  });
  await t('26c. Seluruh 12 laporan: pratinjau JSON, PDF, Excel; isi dari transaksi nyata', async () => {
    const ids = ok(await G(ben, '/laporan')).jenis.map(x => x.id); assert.strictEqual(ids.length, 12);
    for (const id of ids) {
      const j = ok(await G(ben, `/laporan/${id}?periode=semua`)); assert.ok(j.judul && j.kolom.length && Array.isArray(j.rows) && j.ringkasan.length, id);
      const p = await ben.buf(`${A}/keuangan/laporan/${id}?periode=semua&format=pdf`); assert.strictEqual(p.buf.slice(0, 5).toString(), '%PDF-', id);
      const x = await ben.buf(`${A}/keuangan/laporan/${id}?periode=semua&format=xlsx`); assert.strictEqual(x.buf.slice(0, 2).toString(), 'PK', id);
    }
    const pm = ok(await G(ben, '/laporan/pembayaran?periode=semua')); assert.strictEqual(pm.rows.length, Number((await get('SELECT COUNT(*) n FROM keu_pembayaran')).n)); assert.ok(pm.rows.some(r => r.status === 'Dibatalkan'));
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await ben.buf(`${A}/keuangan/laporan/pembayaran?periode=semua&format=xlsx`)).buf); const ws = wb.worksheets[0]; let n = 0; ws.eachRow(r => { if (r.getCell(3).value && /^KWT-/.test(String(r.getCell(3).value))) n++; }); assert.strictEqual(n, pm.rows.length);
    const sk = ok(await G(ben, '/laporan/saldo-kas?periode=bulan')); assert.deepStrictEqual(sk.ringkasan.map(x => x[1]), [1000000, 500000, 0, 1500000]);
    const tr = ok(await G(ben, '/laporan/transaksi?periode=semua')); assert.ok(['Pembayaran santri', 'Tabungan santri', 'Kas pondok'].every(b => tr.rows.some(x => x.buku === b))); assert.ok(ok(await G(ben, '/laporan/transaksi?periode=semua&jenis_transaksi=kas')).rows.every(x => x.buku === 'Kas pondok'));
    const tb = ok(await G(ben, '/laporan/tabungan?periode=semua')); assert.strictEqual(Number(tb.ringkasan[3][1]), Number((await get("SELECT COALESCE(SUM(CASE WHEN jenis IN ('setoran','pembalikan_penarikan') THEN nominal ELSE -nominal END),0) n FROM tabungan_transaksi")).n));
    await err(G(ben, '/laporan/tidak-ada'), 404); await err(G(ben, '/laporan/pembayaran?periode=rentang&dari=x&sampai=y'), 400);
  });

  // ===== 27. Hak akses =====
  await t('27a. Super Admin: akses penuh ke seluruh endpoint keuangan, audit, cadangan', async () => {
    for (const u of ['/dashboard', '/tagihan', '/pembayaran', '/tunggakan', '/tabungan', '/kas', '/ref', '/laporan', '/audit?page=1']) ok(await G(adm, u));
    const bk = ok(await G(adm, '/backup')); assert.ok(bk.tabel.kas_transaksi.length && bk.tabel.keu_pembayaran.length);
    assert.ok(ok(await adm.req('GET', A + '/me')).menu.find(m => m.id === 'bendahara').children.some(c => c.label === 'Audit Transaksi'));
  });
  await t('27b. Bendahara: kelola keuangan; DILARANG akun pengguna, log, audit/cadangan, data santri (tulis), KK, keamanan', async () => {
    const me = ok(await ben.req('GET', A + '/me')); assert.ok(!me.menu.find(m => m.id === 'bendahara').children.some(c => c.label === 'Audit Transaksi'));
    for (const [m, u, b] of [['GET', '/users'], ['GET', '/log'], ['GET', '/keuangan/audit'], ['GET', '/keuangan/backup'], ['POST', '/santri', { nama: 'X', jenis_kelamin: 'L' }], ['PATCH', `/santri/${sA}`, { nama: 'Ubah' }], ['GET', '/pengurus'], ['GET', '/pengajar'], ['GET', '/keamanan/dashboard'], ['GET', '/alumni']]) assert.strictEqual((await ben.req(m, A + u, b)).status, 403, m + ' ' + u);
    const kk = ok(await adm.req('PUT', `${A}/santri/${sA}/kk`, { nama: 'kk.png', data: PNG })); const bid = (await get('SELECT kk_berkas FROM santri WHERE id=$1', [sA])).kk_berkas;
    assert.strictEqual((await ben.buf(`${A}/berkas/${bid}`)).status, 403);
    const cols = Object.keys(ok(await ben.req('GET', `${A}/santri?kelompok=putra`)).rows[0]); assert.ok(!cols.includes('alamat') && !cols.includes('kk_berkas') && !cols.includes('nama_ayah'));
  });
  await t('27c. Keamanan: seluruh endpoint keuangan 403 (nominal, pembayaran, tabungan, kas, laporan, bukti)', async () => {
    for (const u of ['/dashboard', '/tagihan', '/tunggakan', '/pembayaran', '/tabungan', '/tabungan/' + sA, '/kas', '/ref', '/laporan', '/laporan/pembayaran', '/laporan/pembayaran?format=pdf', '/kuitansi/' + pay1.id, '/kuitansi/' + pay1.id + '.pdf', '/santri/' + sA + '/ringkasan', '/santri?q=T3', '/audit', '/backup']) assert.strictEqual((await kea.req('GET', A + '/keuangan' + u)).status, 403, u);
    for (const [u, b] of [['/tagihan', { kategori_id: kat, nominal: 1, periode_tipe: 'lain', periode: 'xx', target: { ids: [sA] }, konfirmasi: true }], ['/pembayaran', { tagihan_id: tagA.id, nominal: 1, tanggal: today, metode_id: mTunai, konfirmasi: true }], ['/kas', { jenis: 'masuk', konfirmasi: true }]]) assert.strictEqual((await kea.req('POST', A + '/keuangan' + u, b)).status, 403, u);
    const ks = ok(await kea.req('GET', `${A}/santri?kelompok=putra`)); assert.ok(ks.rows.length && !JSON.stringify(ks).match(/nominal|saldo|tagihan|dibayar/i));
    assert.ok(!JSON.stringify(ok(await kea.req('GET', A + '/dashboard'))).match(/nominal|saldo|tagihan/i));
    assert.ok(!ok(await kea.req('GET', A + '/me')).menu.some(m => m.id === 'bendahara'));
  });
  await t('27d. Tanpa login → 401; tanpa CSRF → ditolak; akses URL langsung terkunci di API', async () => {
    const c = client(); for (const u of ['/dashboard', '/tagihan', '/kas', '/laporan/pembayaran?format=pdf']) assert.strictEqual((await c.req('GET', A + '/keuangan' + u)).status, 401, u);
    assert.strictEqual((await ben.req('POST', A + '/keuangan/kas', { jenis: 'masuk', konfirmasi: true }, { noCsrf: true })).status, 403);
    assert.strictEqual((await ben.req('POST', A + '/keuangan/kas', { jenis: 'masuk', konfirmasi: true }, { origin: 'https://evil.example' })).status, 403);
  });
  await t('27e. Pembatasan di LEVEL DATABASE: sima_keamanan tak punya hak; sima_keuangan tanpa DELETE & tanpa password_hash', async () => {
    const as = async (role, sql) => db.tx(async qq => { await qq('SET LOCAL ROLE ' + role); return qq(sql); });
    for (const tb of ['keu_tagihan', 'keu_pembayaran', 'tabungan_transaksi', 'tabungan_rekening', 'kas_transaksi', 'v_keu_tagihan', 'keu_audit']) await assert.rejects(as('sima_keamanan', 'SELECT * FROM ' + tb), /permission denied/i, tb);
    await assert.rejects(as('sima_keuangan', 'DELETE FROM kas_transaksi'), /permission denied/i); await assert.rejects(as('sima_keuangan', 'SELECT password_hash FROM users'), /permission denied/i);
    await assert.rejects(as('sima_keuangan', 'SELECT * FROM santri'), /permission denied/i); await assert.rejects(as('sima_keuangan', 'SELECT isi FROM berkas'), /permission denied/i); await assert.rejects(as('sima_keuangan', 'UPDATE users SET role=\'super_admin\''), /permission denied/i);
    assert.ok((await as('sima_keuangan', 'SELECT id FROM v_keu_tagihan')).length > 0);
  });
  await t('27f. Aktivitas keuangan tercatat di log (siapa, kapan, apa) tanpa data rahasia', async () => {
    const l = await q("SELECT aksi, username, keterangan FROM activity_log WHERE modul='keuangan' ORDER BY id"); assert.ok(l.length > 10 && ['bayar', 'batal', 'balik', 'unduh'].every(a => l.some(x => x.aksi === a)) && l.every(x => x.username));
    assert.ok(!JSON.stringify(l).match(/password|\$2[aby]\$/i));
  });
};
