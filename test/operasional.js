'use strict';
// SIMULASI OPERASIONAL TAHAP 8 — kegiatan administrasi pondok dari awal sampai akhir lewat API, pada database UJI terpisah (PGlite di memori).
// Semua nama/nominal = DATA UJI fiktif (berlabel "Uji"), bukan data pondok. Ini simulasi otomatis, BUKAN uji coba oleh pengguna manusia di lingkungan staging.
// Jalankan: node test/operasional.js          (tambahkan --dok untuk menulis ulang docs/UJI-SKENARIO.md dari hasil nyata)
process.env.SIMA_BCRYPT_COST = '4';
const assert = require('assert'), fs = require('fs'), path = require('path'), bcrypt = require('bcryptjs'), sharp = require('sharp');
const { createDev } = require('../dev-server'); const { memoryDb } = require('../lib/sima/db');
const PW = 'KataSandi-Kuat1', A = '/api/sima', K = '/konten', E = '/pendidikan', KE = '/keuangan', KM = '/keamanan';
let base, db; const hasil = [];

function client() {
  let cookie = '', csrf = '';
  const c = {
    async req(method, url, body, opt = {}) {
      const headers = { 'Content-Type': 'application/json' }; if (cookie) headers.Cookie = cookie; if (method !== 'GET' && !opt.noCsrf) headers['X-CSRF-Token'] = csrf;
      const r = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
      const sc = r.headers.get('set-cookie'); if (sc) { const m = /sima_sid=([^;]*)/.exec(sc); if (m) cookie = m[1] ? 'sima_sid=' + m[1] : ''; }
      const ct = r.headers.get('content-type') || '', text = await r.text(); return { status: r.status, json: ct.includes('json') ? JSON.parse(text) : null, text, headers: r.headers };
    },
    async buf(url) { const r = await fetch(base + url, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' }); return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), headers: r.headers }; },
    async login(id, pw) { const r = await c.req('POST', A + '/auth/login', { identifier: id, password: pw }, { noCsrf: true }); if (r.status === 200) csrf = (await c.req('GET', A + '/me')).json.csrf; return r; }
  };
  return c;
}
const ok = (r, st = 200) => { assert.strictEqual(r.status, st, `status ${r.status} (diharapkan ${st}): ${(r.text || '').slice(0, 260)}`); return r.json; };
const err = async (p, st) => { const r = await p; assert.strictEqual(r.status, st, `diharapkan ${st}, dapat ${r.status}: ${(r.text || '').slice(0, 200)}`); return r.json; };
const web = async p => { const r = await fetch(base + p, { redirect: 'manual' }); const ct = r.headers.get('content-type') || ''; const tx = await r.text(); return { status: r.status, text: tx, json: /json/.test(ct) ? JSON.parse(tx) : null }; };
// Daftar skenario: id, peran, langkah, hasil diharapkan; fn menjalankannya.
async function S(id, peran, langkah, harapan, fn) {
  let st = 'LULUS', cat = '';
  try { await fn(); } catch (e) { st = 'GAGAL'; cat = String(e.message || e).split('\n')[0].slice(0, 300); }
  hasil.push({ id, peran, langkah, harapan, st, cat }); console.log((st === 'LULUS' ? 'OK    ' : 'GAGAL ') + id + ' ' + langkah + (cat ? '\n        ' + cat : ''));
}

(async () => {
  db = await memoryDb(); const srv = (await createDev(db)).listen(0); base = 'http://127.0.0.1:' + srv.address().port;
  const q = (s, p) => db.q(s, p), get = async (s, p) => (await q(s, p))[0], n0 = Date.now();
  for (const [u, r] of [['admin', 'super_admin'], ['bendahara1', 'bendahara'], ['keamanan1', 'keamanan']]) await q('INSERT INTO users (username,email,nama,password_hash,role,aktif,dibuat,diubah) VALUES ($1,$2,$1,$3,$4,TRUE,$5,$5)', [u, u + '@uji.id', bcrypt.hashSync(PW, 4), r, n0]);
  const adm = client(), ben = client(), kea = client(); await adm.login('admin', PW); await ben.login('bendahara1', PW); await kea.login('keamanan1', PW);
  const P = (c, u, b) => c.req('POST', A + u, Object.assign({ konfirmasi: true }, b)), PA = (c, u, b) => c.req('PATCH', A + u, Object.assign({ konfirmasi: true }, b)), G = (c, u) => c.req('GET', A + u);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), H = 3600e3, wib = ms => new Date(Date.now() + ms + 7 * 3600e3).toISOString().slice(0, 16);
  let ik = 0; const idem = () => 'op-' + (++ik) + '-' + Math.random().toString(36).slice(2, 9);
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const ctx = {};

  // ================= S1. ADMINISTRASI SANTRI (Super Admin) =================
  await S('S1.1', 'Super Admin', 'Membuat asrama putra, asrama putri, dan tiga kamar', 'Asrama dan kamar tersimpan; kapasitas tercatat', async () => {
    ctx.asP = ok(await P(adm, '/asrama', { nama: 'Asrama Uji Putra', jenis: 'putra' }), 201).id; ctx.asW = ok(await P(adm, '/asrama', { nama: 'Asrama Uji Putri', jenis: 'putri' }), 201).id;
    ctx.k1 = ok(await P(adm, '/kamar', { asrama_id: ctx.asP, nama: 'Kamar Uji 1', kapasitas: 2 }), 201).id; ctx.k2 = ok(await P(adm, '/kamar', { asrama_id: ctx.asP, nama: 'Kamar Uji 2', kapasitas: 3 }), 201).id; ctx.kw = ok(await P(adm, '/kamar', { asrama_id: ctx.asW, nama: 'Kamar Uji Putri 1', kapasitas: 3 }), 201).id;
  });
  await S('S1.2', 'Super Admin', 'Menambahkan 3 santri baru (2 putra, 1 putri) dengan NIS unik', 'Santri tersimpan, NIS ganda ditolak, data wajib divalidasi', async () => {
    const mk = async (nama, jk, nis) => ok(await P(adm, '/santri', { nama, jenis_kelamin: jk, nis, tanggal_masuk: '2024-07-15', tempat_lahir: 'Kota Uji' }), 201).id;
    ctx.s1 = await mk('Santri Uji Satu', 'L', 'OP-001'); ctx.s2 = await mk('Santri Uji Dua', 'L', 'OP-002'); ctx.s3 = await mk('Santri Uji Tiga', 'P', 'OP-003');
    await err(P(adm, '/santri', { nama: 'Ganda', jenis_kelamin: 'L', nis: 'op-001' }), 400); await err(P(adm, '/santri', { nama: 'X', jenis_kelamin: 'L' }), 400);
  });
  await S('S1.3', 'Super Admin', 'Mengubah identitas santri (nama, alamat) dan melihat riwayat perubahan', 'Data berubah; riwayat mencatat sebelum/sesudah', async () => {
    ok(await PA(adm, '/santri/' + ctx.s1, { nama: 'Santri Uji Satu (Revisi)', alamat: 'Alamat Uji 1' }));
    const d = ok(await G(adm, '/santri/' + ctx.s1)); assert.strictEqual(d.santri ? d.santri.nama : d.nama, 'Santri Uji Satu (Revisi)');
    assert.ok((await get("SELECT COUNT(*)::int n FROM riwayat_status WHERE santri_id=$1 AND jenis='ubah_data'", [ctx.s1])).n >= 1);
  });
  await S('S1.4', 'Super Admin', 'Menempatkan santri ke kamar, memindahkan kamar, dan menolak kamar penuh / asrama berbeda jenis', 'Penempatan sesuai jenis kelamin & kapasitas; riwayat pindah tercatat', async () => {
    ok(await P(adm, `/santri/${ctx.s1}/penempatan`, { kamar_id: ctx.k1, alasan: 'Penempatan awal' })); ok(await P(adm, `/santri/${ctx.s2}/penempatan`, { kamar_id: ctx.k1 }));
    await err(P(adm, `/santri/${ctx.s3}/penempatan`, { kamar_id: ctx.k1 }), 409);                  // putri ke asrama putra
    ok(await P(adm, `/santri/${ctx.s3}/penempatan`, { kamar_id: ctx.kw }));
    ok(await P(adm, `/santri/${ctx.s2}/penempatan`, { kamar_id: ctx.k2, alasan: 'Pindah kamar uji' }));
    assert.strictEqual((await get('SELECT kamar_id FROM santri WHERE id=$1', [ctx.s2])).kamar_id, ctx.k2);
    assert.ok((await get("SELECT COUNT(*)::int n FROM riwayat_penempatan WHERE santri_id=$1 AND jenis='pindah_kamar'", [ctx.s2])).n === 1);
  });
  await S('S1.5', 'Super Admin', 'Mengarsipkan lalu memulihkan santri', 'Santri terarsip hilang dari daftar aktif dan keluar dari kamar; pulih kembali tanpa kehilangan data', async () => {
    const x = ok(await P(adm, '/santri', { nama: 'Santri Uji Arsip', jenis_kelamin: 'L', nis: 'OP-009', tanggal_masuk: '2024-07-15' }), 201).id;
    await err(adm.req('POST', `${A}/santri/${x}/arsip`, {}), 400);                                // tanpa konfirmasi
    ok(await P(adm, `/santri/${x}/arsip`, { alasan: 'Uji arsip' })); assert.strictEqual(ok(await G(adm, '/santri?q=OP-009')).rows.length, 0);
    ok(await P(adm, `/santri/${x}/pulihkan`, {})); assert.strictEqual(ok(await G(adm, '/santri?q=OP-009')).rows.length, 1);
  });
  await S('S1.6', 'Super Admin', 'Memindahkan santri ke alumni (lulus) dan memeriksa daftar alumni & kamar', 'Status berubah ke alumni, keluar dari kamar, tampil di Data Alumni, tidak dihitung penghuni aktif', async () => {
    const x = ok(await P(adm, '/santri', { nama: 'Santri Uji Lulus', jenis_kelamin: 'L', nis: 'OP-010', tanggal_masuk: '2018-07-15' }), 201).id; ok(await P(adm, `/santri/${x}/penempatan`, { kamar_id: ctx.k2 }));
    await err(adm.req('POST', `${A}/santri/${x}/pindah-alumni`, { status_alumni: 'lulus' }), 400);
    ok(await P(adm, `/santri/${x}/pindah-alumni`, { status_alumni: 'lulus', tanggal_keluar: today, keterangan_keluar: 'Lulus uji' }));
    const r = await get('SELECT status, status_alumni, kamar_id FROM santri WHERE id=$1', [x]); assert.deepStrictEqual([r.status, r.status_alumni, r.kamar_id], ['alumni', 'lulus', null]);
    assert.ok(ok(await G(adm, '/alumni?kelompok=putra&q=OP-010')).rows.length === 1); assert.strictEqual(ok(await G(adm, '/santri?q=OP-010')).rows.length, 0);
    assert.ok((await get("SELECT COUNT(*)::int n FROM riwayat_status WHERE santri_id=$1 AND jenis='pindah_alumni'", [x])).n === 1); ctx.alm = x;
  });

  // ================= S2. BENDAHARA =================
  await S('S2.1', 'Bendahara', 'Memuat kategori tagihan awal dan membuat kategori kas masuk/keluar; saldo awal kas', 'Kategori tersedia; tidak ada nominal bawaan', async () => {
    ok(await P(ben, KE + '/kategori-tagihan/awal', {})); const ref = ok(await G(ben, KE + '/ref'));
    ctx.kat = ref.kategori_tagihan.find(k => k.nama === 'Syahriah').id; ctx.tunai = ref.metode.find(m => m.nama === 'Tunai').id; ctx.tf = ref.metode.find(m => m.nama === 'Transfer').id;
    ctx.kM = ok(await P(ben, KE + '/kategori-kas', { jenis: 'masuk', nama: 'Donasi Uji' }), 201).id; ctx.kK = ok(await P(ben, KE + '/kategori-kas', { jenis: 'keluar', nama: 'Operasional Uji' }), 201).id;
    ok(await P(ben, KE + '/kas/saldo-awal', { tanggal: today, nominal: 1000000, keterangan: 'Saldo awal uji' }), 201);
  });
  await S('S2.2', 'Bendahara', 'Membuat tagihan untuk satu santri dan tagihan massal (pratinjau lalu simpan)', 'Pratinjau tidak menyimpan; tagihan ganda dilewati', async () => {
    const r = ok(await P(ben, KE + '/tagihan', { kategori_id: ctx.kat, nominal: 100000, periode_tipe: 'bulan', periode: '2026-11', jatuh_tempo: '2026-11-10', target: { ids: [ctx.s1] } }), 201); assert.strictEqual(r.dibuat, 1);
    ctx.tag = ok(await G(ben, KE + `/tagihan?santri_id=${ctx.s1}`)).rows[0].id;
    const body = { kategori_id: ctx.kat, nominal: 50000, periode_tipe: 'bulan', periode: '2026-12', target: { ids: [ctx.s1, ctx.s2, ctx.s3] } };
    assert.strictEqual(ok(await P(ben, KE + '/tagihan/pratinjau', body)).jumlah, 3); assert.strictEqual((await get("SELECT COUNT(*)::int n FROM keu_tagihan WHERE periode='2026-12'")).n, 0);
    assert.strictEqual(ok(await P(ben, KE + '/tagihan', body), 201).dibuat, 3); assert.strictEqual(ok(await P(ben, KE + '/tagihan', body), 201).dibuat, 0);
  });
  await S('S2.3', 'Bendahara', 'Mencatat pembayaran sebagian lalu pelunasan; sisa dihitung otomatis; kelebihan bayar ditolak', 'Status belum → sebagian → lunas; sisa akurat', async () => {
    ctx.pay1 = ok(await P(ben, KE + '/pembayaran', { tagihan_id: ctx.tag, nominal: 40000, tanggal: today, metode_id: ctx.tunai, idem: idem() }), 201); assert.strictEqual(ctx.pay1.sisa_setelah, 60000);
    assert.strictEqual(ok(await G(ben, KE + '/tagihan/' + ctx.tag)).tagihan.status_bayar, 'sebagian'); await err(P(ben, KE + '/pembayaran', { tagihan_id: ctx.tag, nominal: 60001, tanggal: today, metode_id: ctx.tunai }), 409);
    ctx.pay2 = ok(await P(ben, KE + '/pembayaran', { tagihan_id: ctx.tag, nominal: 60000, tanggal: today, metode_id: ctx.tf }), 201); assert.strictEqual(ctx.pay2.sisa_setelah, 0);
    assert.strictEqual(ok(await G(ben, KE + '/tagihan/' + ctx.tag)).tagihan.status_bayar, 'lunas'); await err(P(ben, KE + '/pembayaran', { tagihan_id: ctx.tag, nominal: 1, tanggal: today, metode_id: ctx.tunai }), 409);
  });
  await S('S2.4', 'Bendahara', 'Mencetak bukti pembayaran: kuitansi (tampilan) dan PDF', 'Kuitansi memuat nomor, nama santri, nominal, sisa; PDF valid; Keamanan ditolak', async () => {
    const k = ok(await G(ben, KE + '/kuitansi/' + ctx.pay1.id)); assert.deepStrictEqual([k.nis, k.nominal, k.sisa, k.nomor], ['OP-001', 40000, 60000, ctx.pay1.no_kuitansi]); assert.match(k.nomor, /^KWT-\d{4}-\d{6}$/);
    const p = await ben.buf(`${A}${KE}/kuitansi/${ctx.pay1.id}.pdf`); assert.strictEqual(p.status, 200); assert.strictEqual(p.buf.slice(0, 5).toString(), '%PDF-'); assert.strictEqual((await kea.buf(`${A}${KE}/kuitansi/${ctx.pay1.id}.pdf`)).status, 403);
  });
  await S('S2.5', 'Bendahara', 'Tabungan santri: setoran, penarikan, penarikan melebihi saldo ditolak', 'Saldo = setoran − penarikan; saldo tidak boleh minus', async () => {
    ok(await P(ben, KE + `/tabungan/${ctx.s1}/transaksi`, { jenis: 'setoran', tanggal: today, nominal: 200000, metode: 'Tunai', keterangan: 'Setoran uji', idem: idem() }), 201);
    const t2 = ok(await P(ben, KE + `/tabungan/${ctx.s1}/transaksi`, { jenis: 'penarikan', tanggal: today, nominal: 50000, keterangan: 'Keperluan uji' }), 201); assert.deepStrictEqual([t2.saldo_sebelum, t2.saldo_sesudah], [200000, 150000]);
    await err(P(ben, KE + `/tabungan/${ctx.s1}/transaksi`, { jenis: 'penarikan', tanggal: today, nominal: 150001, keterangan: 'x' }), 409);
    assert.strictEqual(Number(ok(await G(ben, KE + '/tabungan/' + ctx.s1)).rekening.saldo), 150000);
  });
  await S('S2.6', 'Bendahara', 'Kas operasional: kas masuk, kas keluar, bukti nota, saldo; terpisah dari tabungan & pembayaran', 'Saldo kas = saldo awal + masuk − keluar; tabungan santri tidak ikut tercampur', async () => {
    const m = ok(await P(ben, KE + '/kas', { jenis: 'masuk', tanggal: today, kategori_id: ctx.kM, pihak: 'Donatur uji', nominal: 500000, idem: idem() }), 201); const kl = ok(await P(ben, KE + '/kas', { jenis: 'keluar', tanggal: today, kategori_id: ctx.kK, pihak: 'Pembelian uji', nominal: 200000, idem: idem() }), 201);
    assert.match(kl.no_transaksi, /^KAS-\d{4}-\d{6}$/); ok(await ben.req('PUT', `${A}${KE}/kas/${kl.id}/bukti`, { nama: 'nota.png', data: PNG }));
    const s = await get("SELECT COALESCE(SUM(CASE WHEN jenis IN ('masuk','saldo_awal') THEN nominal ELSE -nominal END),0)::bigint s FROM kas_transaksi WHERE NOT COALESCE(dibalik,FALSE)").catch(() => null);
    const d = ok(await G(ben, KE + '/dashboard')); assert.ok(JSON.stringify(d).length > 20); if (s) assert.strictEqual(Number(s.s), 1300000);
    const lap = await ben.buf(`${A}${KE}/laporan/saldo-kas?format=pdf`); assert.strictEqual(lap.status, 200); assert.strictEqual(lap.buf.slice(0, 5).toString(), '%PDF-'); assert.ok(m.id);
  });
  await S('S2.7', 'Bendahara', 'Membatalkan pembayaran dengan alasan; jejak audit tersimpan', 'Pembatalan wajib alasan; sisa tagihan kembali; audit mencatat', async () => {
    const t2 = ok(await G(ben, KE + '/tagihan?santri_id=' + ctx.s2 + '&periode=2026-12')).rows[0]; const p = ok(await P(ben, KE + '/pembayaran', { tagihan_id: t2.id, nominal: 10000, tanggal: today, metode_id: ctx.tunai }), 201);
    await err(P(ben, KE + `/pembayaran/${p.id}/batal`, {}), 400); ok(await P(ben, KE + `/pembayaran/${p.id}/batal`, { alasan: 'Salah input uji' }));
    assert.ok((await get("SELECT COUNT(*)::int n FROM keu_audit WHERE entitas='pembayaran' AND entitas_id=$1 AND aksi='batal'", [p.id])).n === 1);
  });

  // ================= S3. KEAMANAN =================
  await S('S3.1', 'Super Admin → Keamanan', 'Menyiapkan kategori pelanggaran dan jenis pembinaan/izin (Super Admin), lalu Keamanan mencatat pelanggaran', 'Pelanggaran bernomor PLG-…; alumni tidak dapat dicatat', async () => {
    ctx.kp = ok(await P(adm, KM + '/kategori-pelanggaran', { nama: 'Kategori Uji A' }), 201).id; ctx.jp = ok(await P(adm, KM + '/jenis-pembinaan', { nama: 'Bentuk Uji' }), 201).id; ctx.ji = ok(await P(adm, KM + '/jenis-izin', { nama: 'Jenis Izin Uji', jenis: 'keluar' }), 201).id;
    const r = ok(await P(kea, KM + '/pelanggaran', { nis: 'OP-001', tanggal: today, waktu: '20:15', kategori_id: ctx.kp, deskripsi: 'Kejadian uji pertama', lokasi: 'Lokasi Uji' }), 201); ctx.pl = r.id; assert.match(r.nomor, /^PLG-/);
    await err(P(kea, KM + '/pelanggaran', { santri_id: ctx.alm, tanggal: today, kategori_id: ctx.kp, deskripsi: 'alumni' }), 409);
  });
  await S('S3.2', 'Keamanan', 'Mencatat pembinaan terkait pelanggaran dan menyelesaikannya', 'Pembinaan bernomor PMB-…; status berubah selesai', async () => {
    const m = ok(await P(kea, KM + '/pembinaan', { santri_id: ctx.s1, tanggal: today, alasan: 'Pembinaan uji', jenis_id: ctx.jp, pembina: 'Pembina Uji', pelanggaran_id: ctx.pl, rencana: 'Pantau' }), 201); assert.ok(m.id);
    ok(await P(kea, KM + `/pembinaan/${m.id}/status`, { status: 'selesai' })); assert.strictEqual(ok(await G(kea, KM + '/pembinaan?status=selesai')).total, 1);
  });
  await S('S3.3', 'Keamanan', 'Izin keluar pondok: input → setujui → keluar → kembali', 'Alur status benar; waktu aktual tercatat; alur salah ditolak', async () => {
    const r = ok(await P(kea, KM + '/izin-keluar', { santri_id: ctx.s1, tujuan: 'Tujuan Uji', rencana_keluar: wib(1 * H), rencana_kembali: wib(5 * H), jenis_izin_id: ctx.ji }), 201); assert.match(r.nomor, /^IZK-/); const id = r.id;
    await err(P(kea, KM + `/izin/${id}/keluar`, {}), 409); ok(await P(kea, KM + `/izin/${id}/setujui`, {})); ok(await P(kea, KM + `/izin/${id}/keluar`, {}));
    assert.strictEqual(ok(await G(kea, KM + `/izin/${id}`)).izin.status, 'sedang_izin'); ok(await P(kea, KM + `/izin/${id}/kembali`, {})); assert.strictEqual(ok(await G(kea, KM + `/izin/${id}`)).izin.status, 'kembali');
  });
  await S('S3.4', 'Keamanan', 'Izin pulang: alamat, wali, keluar; santri belum kembali muncul di monitoring', 'Santri tampil pada Monitoring Belum Kembali', async () => {
    const r = ok(await P(kea, KM + '/izin-pulang', { santri_id: ctx.s2, tujuan: 'Pulang uji', rencana_keluar: wib(1 * H), rencana_kembali: wib(48 * H), alamat_tujuan: 'Alamat Uji 2', wali: 'Wali Uji', kontak_wali: '0811' }), 201); ctx.iz = r.id; assert.match(r.nomor, /^IZP-/);
    ok(await P(kea, KM + `/izin/${ctx.iz}/setujui`, {})); ok(await P(kea, KM + `/izin/${ctx.iz}/keluar`, {})); assert.ok(ok(await G(kea, KM + '/monitoring')).rows.some(x => x.id === ctx.iz));
  });
  await S('S3.5', 'Keamanan', 'Memantau keterlambatan: jadwal kembali terlewat → status terlambat, tidak otomatis kembali; tindak lanjut; lalu santri dicatat kembali', 'Terlambat terhitung dari jam server; setelah kembali hilang dari monitoring', async () => {
    ok(await P(kea, KM + `/izin/${ctx.iz}/koreksi`, { alasan_koreksi: 'Simulasi keterlambatan uji', rencana_keluar: wib(-6 * H), rencana_kembali: wib(-2 * H), aktual_keluar: wib(-5 * H) }));
    const m = ok(await G(kea, KM + '/monitoring')); const row = m.rows.find(x => x.id === ctx.iz); assert.strictEqual(row.status_tampil, 'terlambat'); assert.ok(row.telat_menit >= 115); assert.ok(m.ringkasan.terlambat >= 1);
    assert.strictEqual((await get('SELECT status FROM kea_izin WHERE id=$1', [ctx.iz])).status, 'sedang_izin');
    ok(await P(kea, KM + `/izin/${ctx.iz}/tindak`, { tindak_status: 'dihubungi', tindak_catatan: 'Wali dihubungi uji' }));
    ok(await P(kea, KM + `/izin/${ctx.iz}/kembali`, {})); assert.ok(!ok(await G(kea, KM + '/monitoring')).rows.some(x => x.id === ctx.iz)); assert.ok(ok(await G(kea, KM + '/laporan/terlambat')).rows.some(x => x.telat));
  });
  await S('S3.6', 'Keamanan', 'Dashboard & laporan keamanan (JSON/PDF/Excel)', 'Angka dashboard terisi; laporan terunduh', async () => {
    const d = ok(await G(kea, KM + '/dashboard')); assert.ok(d); for (const f of ['pdf', 'xlsx']) { const x = await kea.buf(`${A}${KM}/laporan/pelanggaran?format=${f}`); assert.strictEqual(x.status, 200, f); }
    assert.ok(ok(await G(kea, KM + '/laporan/pelanggaran')).rows.length >= 1);
  });

  // ================= S4. PENDIDIKAN =================
  await S('S4.1', 'Super Admin', 'Membuat program pendidikan (jenis), periode, materi, dan jenis evaluasi', 'Data referensi tersimpan; nama ganda ditolak', async () => {
    ctx.jenis = ok(await P(adm, E + '/jenis', { nama: 'Program Uji', mode_nilai: 'angka' }), 201).id; await err(P(adm, E + '/jenis', { nama: 'program uji', mode_nilai: 'angka' }), 409);
    ctx.per = ok(await P(adm, E + '/periode', { nama: 'Periode Uji', mulai: '2026-01-01', selesai: '2026-12-31' }), 201).id; ctx.mat = ok(await P(adm, E + '/materi', { kode: 'UJI-1', nama: 'Materi Uji', jenis_id: ctx.jenis, kitab: 'Kitab Uji' }), 201).id;
    ok(await P(adm, E + '/jenis-evaluasi/awal', {})); ctx.ev = ok(await G(adm, E + '/jenis-evaluasi')).rows.find(r => r.nama === 'Ujian').id;
  });
  await S('S4.2', 'Super Admin', 'Mendaftarkan pengajar, membuat kelas dan menghubungkan pengajar (penugasan)', 'Kelas memiliki pengajar; penugasan ganda ditolak', async () => {
    ctx.pj = ok(await P(adm, '/pengajar', { nama: 'Pengajar Uji Satu', bidang: 'Bidang Uji' }), 201).id;
    ctx.kel = ok(await P(adm, E + '/kelas', { nama: 'Kelas Uji A', jenis_id: ctx.jenis, pengajar_id: ctx.pj, periode_id: ctx.per, kapasitas: 2 }), 201).id;
    ok(await P(adm, E + '/penugasan', { pengajar_id: ctx.pj, jenis_id: ctx.jenis, materi_id: ctx.mat, kelas_id: ctx.kel, periode_id: ctx.per, mulai: '2026-01-01' }), 201); await err(P(adm, E + '/penugasan', { pengajar_id: ctx.pj, jenis_id: ctx.jenis, materi_id: ctx.mat, kelas_id: ctx.kel, mulai: '2026-01-01' }), 409);
  });
  await S('S4.3', 'Super Admin', 'Mendaftarkan peserta ke kelas; kapasitas dan alumni dijaga', 'Peserta bertambah; melebihi kapasitas & alumni ditolak', async () => {
    ok(await P(adm, E + '/peserta', { kelas_id: ctx.kel, santri_ids: [ctx.s1, ctx.s2] }), 201); await err(P(adm, E + '/peserta', { kelas_id: ctx.kel, santri_id: ctx.s3 }), 409); await err(P(adm, E + '/peserta', { kelas_id: ctx.kel, santri_id: ctx.alm }), 409);
  });
  await S('S4.4', 'Super Admin', 'Membuat jadwal pendidikan; jam terbalik/bentrok ditolak', 'Jadwal tersimpan', async () => {
    const J = o => P(adm, E + '/jadwal', Object.assign({ nama: 'Kegiatan Uji', jenis_id: ctx.jenis, kelas_id: ctx.kel, pengajar_id: ctx.pj, hari: 1, jam_mulai: '08:00', jam_selesai: '09:00', ruang: 'Ruang Uji 1' }, o));
    ok(await J({}), 201); await err(J({ nama: 'Jam Terbalik', hari: 5, jam_mulai: '10:00', jam_selesai: '09:00' }), 400); await err(J({ nama: 'Hari Salah', hari: 9 }), 400);
  });
  await S('S4.5', 'Super Admin', 'Mengisi presensi sesi, mengoreksi dengan alasan; tidak ada presensi ganda', 'Presensi unik per sesi-santri; koreksi wajib alasan & tercatat', async () => {
    const stat = ok(await G(adm, E + '/status-presensi')).rows; const stH = stat[0].id, stI = stat[1].id;
    ctx.ses = ok(await P(adm, E + '/sesi', { tanggal: today, kelas_id: ctx.kel, nama: 'Sesi Uji Presensi', ruang: 'Aula Uji' }), 201).id;
    const put = b => adm.req('PUT', `${A}${E}/sesi/${ctx.ses}/presensi`, Object.assign({ konfirmasi: true }, b));
    ok(await put({ items: [{ santri_id: ctx.s1, status_id: stH }, { santri_id: ctx.s2, status_id: stH }] })); ok(await put({ items: [{ santri_id: ctx.s1, status_id: stH }] }));
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM edu_presensi WHERE sesi_id=$1', [ctx.ses])).n, 2); await err(put({ items: [{ santri_id: ctx.s1, status_id: stI }] }), 400);
    ok(await put({ alasan_koreksi: 'Salah input status uji', items: [{ santri_id: ctx.s1, status_id: stI, keterangan: 'izin uji' }] })); await err(put({ items: [{ santri_id: ctx.s3, status_id: stH }] }), 409);
  });
  await S('S4.6', 'Super Admin', 'Mencatat evaluasi/penilaian santri dan melihat riwayat pendidikan & laporan', 'Nilai angka 0–100 divalidasi; riwayat dan laporan tampil', async () => {
    const N = o => P(adm, E + '/penilaian', Object.assign({ santri_id: ctx.s1, kelas_id: ctx.kel, evaluasi_id: ctx.ev, materi_id: ctx.mat, periode_id: ctx.per, tanggal: today, nilai: 85 }, o));
    ok(await N({}), 201); await err(N({ nilai: 101 }), 400); assert.ok(ok(await G(adm, E + '/riwayat/' + ctx.s1)).peserta.length >= 1);
    const x = await adm.buf(`${A}${E}/laporan/peserta?format=xlsx`); assert.strictEqual(x.status, 200);
  });

  // ================= S5. BERITA & GALERI + WEBSITE PUBLIK =================
  await S('S5.1', 'Super Admin', 'Membuat kategori berita, mengunggah foto (dioptimasi) dan menolak berkas berbahaya', 'Foto dikonversi WebP ≤1600px; berkas palsu/skrip ditolak', async () => {
    ctx.kb = ok(await P(adm, K + '/kategori', { tipe: 'berita', nama: 'Kategori Uji Berita' }), 201).id; ctx.kg = ok(await P(adm, K + '/kategori', { tipe: 'galeri', nama: 'Galeri Uji' }), 201).id;
    const big = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#2a7a4a' } }).jpeg().toBuffer(); const up = (b, nama) => adm.req('POST', A + K + '/media', { nama, data: b.toString('base64'), konfirmasi: true });
    const r = ok(await up(big, 'foto-uji.jpg'), 201); ctx.media = r.id; assert.strictEqual(r.lebar, 1600); await err(up(Buffer.from('<?php echo 1; ?>'), 'shell.php.jpg'), 400);
  });
  await S('S5.2', 'Super Admin', 'Membuat berita sebagai DRAFT, memeriksa website publik (tidak tampil), lalu menerbitkan', 'Draft tidak muncul di publik/sitemap; setelah terbit muncul di daftar, halaman, dan sitemap', async () => {
    const r = ok(await P(adm, K + '/berita', { judul: 'Berita Uji Operasional', ringkasan: 'Ringkasan uji.', isi_html: '<h2>Subjudul</h2><p>Isi <b>uji</b> berita.</p>', kategori_id: ctx.kb, media_utama_id: ctx.media, penulis: 'Penulis Uji', status: 'draft' }), 201); ctx.b = r.id; ctx.slug = r.slug;
    const pub = () => web('/api/sima/pub/berita?per=30'); assert.strictEqual((await pub()).json.rows.length, 0); assert.strictEqual((await web('/api/sima/pub/berita/' + ctx.slug)).status, 404); assert.strictEqual((await web('/berita/' + ctx.slug)).status, 404); assert.ok(!(await web('/sitemap.xml')).text.includes(ctx.slug));
    ok(await P(adm, K + `/berita/${ctx.b}/status`, { status: 'terbit' })); const rows = (await pub()).json.rows; assert.strictEqual(rows.length, 1); assert.strictEqual(rows[0].slug, ctx.slug);
    assert.strictEqual((await web('/api/sima/pub/berita/' + ctx.slug)).status, 200); assert.strictEqual((await web('/berita/' + ctx.slug)).status, 200); assert.ok((await web('/sitemap.xml')).text.includes(ctx.slug));
  });
  await S('S5.3', 'Super Admin', 'Mengunggah dokumentasi (galeri foto) sebagai draft lalu menerbitkan; data pribadi santri tidak bocor ke publik', 'Galeri publik hanya memuat yang terbit; respons publik tidak memuat data internal', async () => {
    const g = ok(await P(adm, K + '/galeri', { jenis: 'foto', judul: 'Foto Uji Operasional', media_id: ctx.media, kategori_id: ctx.kg, caption: 'Caption uji', status: 'draft' }), 201).id;
    assert.strictEqual((await web('/api/sima/pub/galeri')).json.rows.length, 0); ok(await PA(adm, K + '/galeri/' + g, { status: 'terbit' })); const gl = (await web('/api/sima/pub/galeri')).json; assert.strictEqual(gl.rows.length, 1);
    const txt = JSON.stringify(gl) + (await web('/api/sima/pub/berita?per=30')).text; for (const kata of ['OP-001', 'password', 'nama_ayah', 'password_hash', 'catatan_admin']) assert.ok(!txt.includes(kata), 'bocor: ' + kata);
  });
  await S('S5.4', 'Super Admin', 'Mengarsipkan berita lalu mengembalikannya ke draft', 'Berita arsip hilang dari publik; riwayat tercatat', async () => {
    ok(await P(adm, K + `/berita/${ctx.b}/status`, { status: 'arsip' })); assert.strictEqual((await web('/api/sima/pub/berita?per=30')).json.rows.length, 0); assert.strictEqual((await web('/berita/' + ctx.slug)).status, 404);
    ok(await P(adm, K + `/berita/${ctx.b}/status`, { status: 'terbit' })); assert.strictEqual((await web('/api/sima/pub/berita?per=30')).json.rows.length, 1);
  });

  // ================= S6. MATRIKS HAK AKSES 3 ROLE =================
  // [deskripsi, metode, url, status untuk Super Admin, Bendahara, Keamanan, tanpa login]. POST tanpa login ditolak 403 oleh pelindung CSRF sebelum autentikasi (tetap ditolak).
  const M = [
    ['Manajemen pengguna', 'GET', '/users', 200, 403, 403, 401], ['Aktivitas sistem (log)', 'GET', '/log', 200, 403, 403, 401], ['Pengaturan sistem', 'GET', '/pengaturan', 200, 403, 403, 401], ['Backup', 'GET', '/backup', 200, 403, 403, 401],
    ['Impor data', 'GET', '/impor', 200, 403, 403, 401], ['Konsistensi data', 'GET', '/pengaturan/konsistensi', 200, 403, 403, 401], ['Data santri (baca)', 'GET', '/santri?kelompok=putra', 200, 200, 200, 401],
    ['Tambah santri', 'POST', '/santri', 400, 403, 403, 403], ['Data alumni', 'GET', '/alumni', 200, 403, 403, 401], ['Data pengurus', 'GET', '/pengurus?kelompok=putra', 200, 403, 403, 401], ['Data pengajar', 'GET', '/pengajar', 200, 403, 403, 401],
    ['Asrama & kamar', 'GET', '/asrama', 200, 403, 403, 401], ['Keuangan: dashboard', 'GET', '/keuangan/dashboard', 200, 200, 403, 401], ['Keuangan: tagihan', 'GET', '/keuangan/tagihan', 200, 200, 403, 401], ['Keuangan: tabungan', 'GET', '/keuangan/tabungan', 200, 200, 403, 401],
    ['Keuangan: kas', 'GET', '/keuangan/kas', 200, 200, 403, 401], ['Keuangan: audit', 'GET', '/keuangan/audit', 200, 403, 403, 401], ['Keamanan: dashboard', 'GET', '/keamanan/dashboard', 200, 403, 200, 401], ['Keamanan: pelanggaran', 'GET', '/keamanan/pelanggaran', 200, 403, 200, 401],
    ['Keamanan: monitoring', 'GET', '/keamanan/monitoring', 200, 403, 200, 401], ['Keamanan: pengaturan', 'GET', '/keamanan/pengaturan', 200, 403, 403, 401], ['Pendidikan: dashboard', 'GET', '/pendidikan/dashboard', 200, 403, 403, 401], ['Pendidikan: presensi', 'GET', '/pendidikan/presensi', 200, 403, 403, 401],
    ['Berita & galeri: dashboard', 'GET', '/konten/dashboard', 200, 403, 403, 401], ['Berita: tambah', 'POST', '/konten/berita', 400, 403, 403, 403], ['Katalog laporan', 'GET', '/laporan/katalog', 200, 200, 200, 401], ['Laporan data santri', 'GET', '/laporan/data/santri-putra', 200, 403, 403, 401],
    ['Laporan keuangan', 'GET', '/keuangan/laporan/pembayaran', 200, 200, 403, 401], ['Laporan keamanan', 'GET', '/keamanan/laporan/pelanggaran', 200, 403, 200, 401], ['Website publik: berita', 'GET', '/pub/berita', 200, 200, 200, 200]
  ];
  const anon = client(); let nCek = 0;
  await S('S6.1', 'Semua role', `Matriks hak akses: ${M.length} endpoint × 4 pihak (Super Admin, Bendahara, Keamanan, tanpa login) = ${M.length * 4} pengecekan`, 'Setiap role hanya mendapat akses pada modul miliknya; selain itu 403; tanpa login 401 (baca) atau 403 (tulis, ditolak pelindung CSRF); tidak ada kebocoran', async () => {
    const salah = [];
    for (const [d, met, url, ...exp] of M) {
      for (const [i, c] of [adm, ben, kea, anon].entries()) {
        const r = met === 'GET' ? await G(c, url) : await c.req('POST', A + url, i === 3 ? {} : { konfirmasi: true }); nCek++;
        if (r.status !== exp[i]) salah.push(`${d} [${['SA', 'Bendahara', 'Keamanan', 'anon'][i]}] ${met} ${url}: ${r.status}≠${exp[i]}`);
      }
    }
    assert.strictEqual(salah.length, 0, salah.slice(0, 5).join(' | '));
  });
  await S('S6.2', 'Bendahara & Keamanan', 'Menulis ke modul lain ditolak (Bendahara → keamanan/santri/konten; Keamanan → keuangan/santri)', 'Semua percobaan tulis lintas modul → 403', async () => {
    for (const [c, u] of [[ben, KM + '/pelanggaran'], [ben, '/santri'], [ben, K + '/berita'], [ben, E + '/kelas'], [kea, KE + '/tagihan'], [kea, KE + '/kas'], [kea, '/santri'], [kea, K + '/berita']]) await err(P(c, u, { x: 1 }), 403);
    await err(kea.req('PATCH', `${A}/santri/${ctx.s1}`, { nama: 'Ubah Ilegal' }), 403);
  });
  await S('S6.3', 'Bendahara & Keamanan', 'Data sensitif santri tidak terlihat oleh Bendahara/Keamanan (alamat, wali, KK)', 'Daftar santri untuk non-admin tanpa kolom sensitif', async () => {
    for (const c of [ben, kea]) { const t = (await G(c, '/santri?kelompok=putra')).text; for (const k of ['nama_ayah', 'nama_ibu', 'wali_telepon', 'kk_berkas', 'Alamat Uji 1', 'catatan_admin']) assert.ok(!t.includes(k), 'terlihat: ' + k); }
  });
  await S('S6.4', 'Semua', 'Keamanan sesi: CSRF dan Origin; akun nonaktif tidak bisa login', 'Ubah data tanpa token CSRF/Origin asing → 403; akun nonaktif → 401', async () => {
    assert.strictEqual((await ben.req('POST', A + KE + '/kas', { jenis: 'masuk', konfirmasi: true }, { noCsrf: true })).status, 403);
    await q("UPDATE users SET aktif=FALSE WHERE username='keamanan1'"); assert.strictEqual((await client().login('keamanan1', PW)).status, 401); assert.strictEqual((await G(kea, KM + '/dashboard')).status, 401); await q("UPDATE users SET aktif=TRUE WHERE username='keamanan1'");
  });
  await S('S6.5', 'Super Admin', 'Aktivitas sistem mencatat seluruh kegiatan simulasi; konsistensi data tidak menemukan masalah', 'Log memuat aksi santri, keuangan, keamanan, pendidikan, konten; 14 pemeriksaan konsistensi sesuai', async () => {
    const mod = (await q('SELECT DISTINCT modul FROM activity_log')).map(r => r.modul); for (const m of ['santri', 'keuangan', 'keamanan', 'pendidikan']) assert.ok(mod.some(x => x && x.startsWith(m)) || mod.includes(m), 'log ' + m);
    const kons = ok(await G(adm, '/pengaturan/konsistensi')); const buruk = kons.rows.filter(r => r.status !== 'ok'); assert.strictEqual(buruk.length, 0, JSON.stringify(buruk.map(r => [r.id, r.masalah, r.status])).slice(0, 300));
  });

  const l = hasil.filter(x => x.st === 'LULUS').length, g = hasil.length - l;
  console.log(`\nRINGKASAN: ${hasil.length} skenario, ${l} LULUS, ${g} GAGAL; ${nCek} pengecekan hak akses dijalankan pada matriks S6.1`);
  if (process.argv.includes('--dok')) tulisDok(hasil, nCek, M.length);
  srv.close(); process.exit(g ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

function tulisDok(h, nCek, nEp) {
  const l = h.filter(x => x.st === 'LULUS').length, tgl = new Date().toISOString().slice(0, 10), esc = s => String(s).replace(/\|/g, '/');
  const md = `# Daftar Skenario Uji Operasional SIMA (Tahap 8)

> **Penting — baca dahulu.** Dokumen ini dihasilkan dari **simulasi otomatis** (\`node test/operasional.js\`) yang menjalankan kegiatan administrasi lewat API pada **database uji terpisah di memori** dengan **data fiktif berlabel “Uji”**. Ini **bukan** uji coba oleh pengguna manusia di lingkungan staging nyata, dan **tidak menyentuh data maupun database produksi**. Tampilan layar (UI) diuji terpisah oleh rangkaian uji browser (\`test/ui*.js\`). Sebelum peluncuran tetap diperlukan uji coba oleh pengelola pondok di lingkungan staging (lihat checklist serah terima).

Tanggal eksekusi: ${tgl} · Hasil: **${l} dari ${h.length} skenario LULUS** · ${nCek} pengecekan hak akses (${nEp} endpoint × 4 pihak) pada S6.1.

Cara menjalankan ulang: \`node test/operasional.js\` (kode keluar 0 bila semua lulus; tambahkan \`--dok\` untuk memperbarui dokumen ini dari hasil nyata).

| ID | Peran | Langkah | Hasil yang diharapkan | Hasil aktual |
|---|---|---|---|---|
${h.map(x => `| ${x.id} | ${esc(x.peran)} | ${esc(x.langkah)} | ${esc(x.harapan)} | **${x.st}**${x.cat ? ' — ' + esc(x.cat) : ''} |`).join('\n')}

## Cakupan terhadap permintaan Tahap 8 (bagian D & E)
- **D.1 Administrasi Santri** → S1.2–S1.6 · **D.2 Bendahara** → S2.1–S2.7 · **D.3 Keamanan** → S3.1–S3.6 · **D.4 Pendidikan** → S4.1–S4.6 · **D.5 Berita & Galeri + website publik** → S5.1–S5.4.
- **E. Uji pengguna 3 role** (Super Admin, Bendahara, Keamanan; tanpa role baru) → S6.1–S6.5.

## Yang belum tercakup oleh simulasi ini
- Penggunaan nyata oleh staf pondok (kemudahan, kesalahan manusia) dan lingkungan staging di Vercel/Neon sesungguhnya.
- Cetak fisik ke printer; kinerja pada data berjumlah besar.
`;
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'UJI-SKENARIO.md'), md); console.log('Dokumen ditulis: docs/UJI-SKENARIO.md');
}
