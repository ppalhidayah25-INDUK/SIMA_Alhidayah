'use strict';
// Data Santri + Data Alumni. Alumni = santri yang SAMA dengan status 'alumni' (tanpa salinan), semua perubahan tercatat.
const U = require('../util');
const { simpan, buang, readUpload } = require('./berkas');

const PHONE = /^[0-9+()\-\s]{6,20}$/;
const ORTU = ['hidup', 'meninggal', 'tidak_diketahui'];
const SPEC = {
  nis: ['str', 'NIS', { max: 30, re: /^[A-Za-z0-9./-]+$/, msg: 'NIS hanya boleh berisi huruf, angka, titik, garis miring, atau strip.' }],
  nama: ['str', 'Nama lengkap', { required: true, min: 2, max: 100 }],
  jenis_kelamin: ['enum', 'Jenis kelamin', { required: true, values: ['L', 'P'] }],
  tempat_lahir: ['str', 'Tempat lahir', { max: 80 }],
  tanggal_lahir: ['date', 'Tanggal lahir', { notFuture: true }],
  alamat: ['text', 'Alamat', { max: 400 }],
  telepon: ['str', 'Nomor telepon', { max: 20, re: PHONE, msg: 'Nomor telepon hanya boleh angka, spasi, +, -, ( ).' }],
  nama_ayah: ['str', 'Nama ayah', { max: 100 }], pekerjaan_ayah: ['str', 'Pekerjaan ayah', { max: 100 }], status_ayah: ['enum', 'Status ayah', { values: ORTU }],
  nama_ibu: ['str', 'Nama ibu', { max: 100 }], pekerjaan_ibu: ['str', 'Pekerjaan ibu', { max: 100 }], status_ibu: ['enum', 'Status ibu', { values: ORTU }],
  nama_wali: ['str', 'Nama wali', { max: 100 }], wali_hubungan: ['str', 'Hubungan wali', { max: 60 }], wali_pekerjaan: ['str', 'Pekerjaan wali', { max: 100 }],
  wali_telepon: ['str', 'Nomor telepon wali', { max: 20, re: PHONE, msg: 'Nomor telepon hanya boleh angka, spasi, +, -, ( ).' }], wali_alamat: ['text', 'Alamat wali', { max: 400 }],
  tanggal_masuk: ['date', 'Tanggal masuk', { notFuture: true }], tahun_masuk: ['int', 'Tahun masuk', { min: 1900, max: 2200 }],
  catatan_admin: ['text', 'Catatan administrasi', { max: 1000 }],
  pendidikan_formal: ['str', 'Pendidikan formal', { max: 120 }], lembaga_pendidikan: ['str', 'Lembaga pendidikan', { max: 150 }], program_pesantren: ['str', 'Program pendidikan pesantren', { max: 150 }]
};
const SPEC_ALUMNI_INFO = {   // dapat diubah lewat form edit alumni biasa
  program_terakhir: ['str', 'Program pendidikan terakhir', { max: 150 }], asrama_terakhir: ['str', 'Asrama terakhir', { max: 150 }], catatan_alumni: ['text', 'Catatan tambahan', { max: 1000 }]
};
const SPEC_KELUAR = {        // hanya lewat pemindahan / koreksi bersyarat alasan
  status_alumni: ['enum', 'Status alumni', { required: true, values: ['lulus', 'berhenti'] }],
  tanggal_keluar: ['date', 'Tanggal keluar', { notFuture: true }], tahun_keluar: ['int', 'Tahun keluar', { min: 1900, max: 2200 }],
  keterangan_keluar: ['text', 'Keterangan kelulusan / alasan berhenti', { max: 500 }]
};
const LABEL = { nis: 'NIS', nama: 'nama', jenis_kelamin: 'jenis kelamin', tempat_lahir: 'tempat lahir', tanggal_lahir: 'tanggal lahir', alamat: 'alamat', telepon: 'telepon', nama_ayah: 'nama ayah', pekerjaan_ayah: 'pekerjaan ayah', status_ayah: 'status ayah', nama_ibu: 'nama ibu', pekerjaan_ibu: 'pekerjaan ibu', status_ibu: 'status ibu', nama_wali: 'nama wali', wali_hubungan: 'hubungan wali', wali_pekerjaan: 'pekerjaan wali', wali_telepon: 'telepon wali', wali_alamat: 'alamat wali', tanggal_masuk: 'tanggal masuk', tahun_masuk: 'tahun masuk', catatan_admin: 'catatan administrasi', pendidikan_formal: 'pendidikan formal', lembaga_pendidikan: 'lembaga pendidikan', program_pesantren: 'program pesantren', program_terakhir: 'program terakhir', asrama_terakhir: 'asrama terakhir', catatan_alumni: 'catatan alumni', status_alumni: 'status alumni', tanggal_keluar: 'tanggal keluar', tahun_keluar: 'tahun keluar', keterangan_keluar: 'keterangan keluar' };

const SEL = `s.id, s.nis, s.nama, s.jenis_kelamin, s.tempat_lahir, s.tanggal_lahir::text tanggal_lahir, s.alamat, s.telepon,
  s.nama_ayah, s.pekerjaan_ayah, s.status_ayah, s.nama_ibu, s.pekerjaan_ibu, s.status_ibu,
  s.nama_wali, s.wali_hubungan, s.wali_pekerjaan, s.wali_telepon, s.wali_alamat,
  s.tanggal_masuk::text tanggal_masuk, s.tahun_masuk, s.status, s.status_alumni, s.diarsipkan, s.catatan_admin,
  s.pendidikan_formal, s.lembaga_pendidikan, s.program_pesantren, s.foto_berkas, s.kk_berkas, s.kamar_id,
  s.tanggal_keluar::text tanggal_keluar, s.tahun_keluar, s.keterangan_keluar, s.program_terakhir, s.asrama_terakhir, s.catatan_alumni, s.dibuat, s.diubah`;
const LIST = `s.id, s.nis, s.nama, s.foto_berkas, s.jenis_kelamin, s.tempat_lahir, s.tanggal_lahir::text tanggal_lahir, s.alamat,
  s.nama_ayah, s.nama_ibu, s.nama_wali, s.tahun_masuk, s.status, s.status_alumni, s.diarsipkan, s.tahun_keluar, s.tanggal_keluar::text tanggal_keluar, s.program_terakhir,
  a.id asrama_id, a.nama asrama, k.id kamar_id, k.nama kamar`;
const FROM = 'FROM santri s LEFT JOIN kamar k ON k.id = s.kamar_id LEFT JOIN asrama a ON a.id = k.asrama_id';

const err = (http, message, fields) => Object.assign(new Error(message), { http, fields });
const norm = v => (v === undefined || v === null || v === '' ? null : String(v));
const diffOf = (cur, out) => { const b = {}, a = {}, ks = []; for (const k of Object.keys(out)) if (norm(cur[k]) !== norm(out[k])) { b[k] = cur[k] ?? null; a[k] = out[k] ?? null; ks.push(LABEL[k] || k); } return { before: b, after: a, keys: ks }; };

function checkMasuk(out, cur) {      // tahun masuk ikut tanggal masuk; keduanya harus konsisten
  const e = {};
  const tm = 'tanggal_masuk' in out ? out.tanggal_masuk : cur && cur.tanggal_masuk;
  if (out.tanggal_masuk) {
    if (out.tahun_masuk == null) out.tahun_masuk = U.year(out.tanggal_masuk);
    else if (out.tahun_masuk !== U.year(out.tanggal_masuk)) e.tahun_masuk = 'Tahun masuk tidak sesuai dengan tanggal masuk.';
  } else if ('tanggal_masuk' in out && out.tahun_masuk == null && tm == null && cur) out.tahun_masuk = cur.tahun_masuk;
  return e;
}
function checkKeluar(m) {            // m: data gabungan (nilai akhir)
  const e = {};
  if (m.tahun_keluar == null) e.tahun_keluar = 'Tahun keluar wajib diisi.';
  if (m.tanggal_keluar && m.tanggal_masuk && m.tanggal_keluar < m.tanggal_masuk) e.tanggal_keluar = 'Tanggal keluar tidak boleh sebelum tanggal masuk.';
  if (m.tahun_keluar != null && m.tahun_masuk != null && m.tahun_keluar < m.tahun_masuk) e.tahun_keluar = 'Tahun keluar tidak boleh sebelum tahun masuk.';
  return e;
}
const bad = e => err(400, 'Data belum valid.', e);

function register(api, { db, auth, logBy, ah, one, count }) {
  const SA = auth.requireModule('santri_kelola');
  const ALM = auth.requireModule('alumni');
  const confirm = (req) => { if (!req.body || req.body.konfirmasi !== true) throw err(400, 'Tindakan ini memerlukan konfirmasi.'); };
  const alasanOf = (req, wajib) => { const a = U.text(req.body && req.body.alasan, 500); if (wajib && a.length < 5) throw bad({ alasan: 'Alasan wajib diisi (minimal 5 karakter).' }); return a || null; };

  const getRow = async (q, id, lock) => (await q(`SELECT ${SEL} FROM santri s WHERE s.id=$1 ${lock ? 'FOR UPDATE OF s' : ''}`, [id]))[0];
  const hist = (q, sid, jenis, req, before, after, sb, sa, alasan, dB, dA) => q(
    'INSERT INTO riwayat_status (santri_id,jenis,status_sebelum,status_sesudah,data_sebelum,data_sesudah,waktu,oleh,oleh_username,alasan) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [sid, jenis, sb || null, sa || null, dB ? JSON.stringify(dB) : null, dA ? JSON.stringify(dA) : null, Date.now(), req.user.id, req.user.username, alasan || null]);
  const label = s => (s.status === 'alumni' ? 'alumni:' + s.status_alumni : s.diarsipkan ? 'aktif (diarsipkan)' : 'aktif');
  const dupNis = async (qq, nis, selfId) => nis && ((await qq('SELECT id, nama FROM santri WHERE lower(nis)=lower($1) AND id<>$2', [nis, selfId || 0]))[0]);
  const q1 = async (sql, p) => (await db.q(sql, p))[0];

  // ---------- penempatan (dipakai form santri dan alur penempatan) ----------
  async function place(q, s, kamarId, req, alasan, otomatis) {
    if ((s.kamar_id || null) === (kamarId || null)) return false;
    const info = id => id ? q('SELECT k.id, k.nama kamar, a.id asrama_id, a.nama asrama FROM kamar k JOIN asrama a ON a.id=k.asrama_id WHERE k.id=$1', [id]).then(r => r[0]) : null;
    const from = await info(s.kamar_id);
    let to = null;
    if (kamarId) {
      if (s.status !== 'aktif' || s.diarsipkan) throw err(409, 'Hanya santri aktif (tidak diarsipkan) yang dapat ditempatkan di kamar.');
      to = (await q(`SELECT k.id, k.nama kamar, k.kapasitas, k.status, k.diarsipkan, a.id asrama_id, a.nama asrama, a.jenis, a.status astatus, a.diarsipkan aarsip
        FROM kamar k JOIN asrama a ON a.id=k.asrama_id WHERE k.id=$1 FOR UPDATE OF k`, [kamarId]))[0];
      if (!to) throw err(404, 'Kamar tidak ditemukan.');
      if (to.jenis !== (s.jenis_kelamin === 'L' ? 'putra' : 'putri')) throw err(409, s.jenis_kelamin === 'L' ? 'Santri putra hanya dapat ditempatkan di Asrama Putra.' : 'Santri putri hanya dapat ditempatkan di Asrama Putri.');
      if (to.status !== 'aktif' || to.diarsipkan || to.astatus !== 'aktif' || to.aarsip) throw err(409, 'Kamar atau asrama tujuan tidak aktif.');
      const isi = (await q("SELECT COUNT(*)::int n FROM santri WHERE kamar_id=$1 AND status='aktif' AND NOT diarsipkan AND id<>$2", [kamarId, s.id]))[0].n;
      if (isi >= to.kapasitas) throw err(409, `Kapasitas kamar ${to.kamar} sudah penuh (${isi}/${to.kapasitas}).`);
    }
    await q('UPDATE santri SET kamar_id=$1, diubah=$2 WHERE id=$3', [kamarId || null, Date.now(), s.id]);
    const jenis = otomatis ? 'keluar_otomatis' : !to ? 'keluar_kamar' : !from ? 'penempatan_baru' : from.asrama_id !== to.asrama_id ? 'pindah_asrama' : 'pindah_kamar';
    await q('INSERT INTO riwayat_penempatan (santri_id,jenis,dari_kamar_id,ke_kamar_id,dari_asrama,dari_kamar,ke_asrama,ke_kamar,waktu,oleh,oleh_username,alasan) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [s.id, jenis, from && from.id, to && to.id, from && from.asrama, from && from.kamar, to && to.asrama, to && to.kamar, Date.now(), req.user.id, req.user.username, alasan || null]);
    return { jenis, from, to };
  }
  const placeLog = (req, s, r) => logBy(req, 'penempatan', 'asrama', `${({ penempatan_baru: 'Menempatkan', pindah_kamar: 'Memindahkan kamar', pindah_asrama: 'Memindahkan asrama', keluar_kamar: 'Mengeluarkan dari kamar', keluar_otomatis: 'Mengeluarkan dari kamar' })[r.jenis]} ${s.nama}: ${r.from ? r.from.asrama + '/' + r.from.kamar : '—'} → ${r.to ? r.to.asrama + '/' + r.to.kamar : '—'}`);

  // ---------- daftar santri aktif ----------
  const SORT = { nama: 's.nama', nis: 's.nis', tahun_masuk: 's.tahun_masuk', asrama: 'a.nama', kamar: 'k.nama', status: 's.diarsipkan', lahir: 's.tanggal_lahir' };
  api.get('/santri', auth.requireModule('santri'), ah(async (req, res) => {
    const kel = req.query.kelompok;
    if (kel !== undefined && !['putra', 'putri'].includes(kel)) return res.status(400).json({ error: 'Kelompok harus putra atau putri.' });
    const cari = U.str(req.query.q, 60), role = req.user.role, pg = U.pageOf(req.query), W = U.where();
    if (role === 'super_admin') {
      W.add("s.status='aktif'");
      if (kel) W.add('s.jenis_kelamin=?', kel === 'putra' ? 'L' : 'P');
      if (cari) { const p = W.push('%' + U.likeEsc(cari) + '%'); W.add(`(s.nama ILIKE ${p} OR s.nis ILIKE ${p})`); }
      if (/^\d+$/.test(req.query.asrama || '')) W.add('a.id=?', +req.query.asrama);
      if (/^\d+$/.test(req.query.kamar || '')) W.add('k.id=?', +req.query.kamar);
      if (/^\d{4}$/.test(req.query.tahun_masuk || '')) W.add('s.tahun_masuk=?', +req.query.tahun_masuk);
      const st = req.query.status || 'aktif';
      if (st === 'aktif') W.add('NOT s.diarsipkan'); else if (st === 'arsip') W.add('s.diarsipkan'); else if (st !== 'semua') return res.status(400).json({ error: 'Filter status tidak valid.' });
      if (req.query.penempatan === 'belum') W.add('s.kamar_id IS NULL');
      const params = W.params(), total = await count(`SELECT COUNT(*)::int n ${FROM} ${W.sql}`, params);
      const rows = await db.q(`SELECT ${LIST} ${FROM} ${W.sql} ORDER BY ${U.orderBy(req.query, SORT, 'nama')}, s.id LIMIT ${pg.size} OFFSET ${pg.offset}`, params);
      const pilihan = { tahun_masuk: (await db.q("SELECT DISTINCT tahun_masuk v FROM santri WHERE status='aktif' AND tahun_masuk IS NOT NULL ORDER BY 1 DESC")).map(r => r.v) };
      return res.json({ rows, total, page: pg.page, size: pg.size, readOnly: false, pilihan });
    }
    // Bendahara / Keamanan: role database yang hanya boleh SELECT view terpangkas (santri aktif saja)
    const [dbRole, view] = role === 'bendahara' ? ['sima_keuangan', 'v_santri_keuangan'] : ['sima_keamanan', 'v_santri_keamanan'];
    if (kel) W.add('kelompok=?', kel);
    if (cari) { const p = W.push('%' + U.likeEsc(cari) + '%'); W.add(`(nama ILIKE ${p} OR nis ILIKE ${p})`); }
    const params = W.params();
    const out = await db.tx(async q => {
      await q(`SET LOCAL ROLE ${dbRole}`);
      const total = (await q(`SELECT COUNT(*)::int n FROM ${view} ${W.sql}`, params))[0].n;
      return { total, rows: await q(`SELECT * FROM ${view} ${W.sql} ORDER BY nama, id LIMIT ${pg.size} OFFSET ${pg.offset}`, params) };
    });
    res.json({ rows: out.rows, total: out.total, page: pg.page, size: pg.size, readOnly: true });
  }));

  // ---------- detail (lengkap untuk Super Admin; terpangkas untuk role lain) ----------
  async function detail(id) {
    const s = await getRow(db.q, id, false);
    if (!s) return null;
    const kamar = s.kamar_id ? (await db.q('SELECT k.id, k.nama, a.id asrama_id, a.nama asrama, a.jenis FROM kamar k JOIN asrama a ON a.id=k.asrama_id WHERE k.id=$1', [s.kamar_id]))[0] : null;
    const kk = s.kk_berkas ? (await db.q('SELECT id, mime, ukuran, nama_asli, diunggah FROM berkas WHERE id=$1', [s.kk_berkas]))[0] : null;
    const dokumen = await db.q(`SELECT d.id, d.jenis, d.keterangan, d.berkas_id, b.mime, b.ukuran, b.nama_asli, d.diunggah FROM dokumen_santri d JOIN berkas b ON b.id=d.berkas_id WHERE d.santri_id=$1 ORDER BY d.id DESC`, [id]);
    const penempatan = await db.q('SELECT id, jenis, dari_asrama, dari_kamar, ke_asrama, ke_kamar, waktu, oleh_username, alasan FROM riwayat_penempatan WHERE santri_id=$1 ORDER BY id DESC', [id]);
    const riwayat = await db.q('SELECT id, jenis, status_sebelum, status_sesudah, data_sebelum, data_sesudah, waktu, oleh_username, alasan FROM riwayat_status WHERE santri_id=$1 ORDER BY id DESC', [id]);
    return { santri: s, kamar, kk, dokumen, penempatan, riwayat, integrasi: ['pembayaran', 'tabungan', 'pelanggaran', 'pembinaan', 'perizinan'] };
  }
  api.get('/santri/:id(\\d+)', auth.requireModule('santri'), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (req.user.role === 'super_admin') { const d = await detail(id); return d ? res.json(d) : res.status(404).json({ error: 'Santri tidak ditemukan.' }); }
    const [dbRole, view] = req.user.role === 'bendahara' ? ['sima_keuangan', 'v_santri_keuangan'] : ['sima_keamanan', 'v_santri_keamanan'];
    const r = await db.tx(async q => { await q(`SET LOCAL ROLE ${dbRole}`); return q(`SELECT * FROM ${view} WHERE id=$1`, [id]); });
    if (!r.length) return res.status(404).json({ error: 'Santri tidak ditemukan.' });
    res.json({ santri: r[0], terbatas: true });
  }));
  api.get('/alumni/:id(\\d+)', ALM, ah(async (req, res) => {
    const d = await detail(parseInt(req.params.id, 10));
    if (!d || d.santri.status !== 'alumni') return res.status(404).json({ error: 'Alumni tidak ditemukan.' });
    res.json(d);
  }));

  // ---------- tambah / ubah santri ----------
  api.post('/santri', SA, ah(async (req, res) => {
    const b = req.body || {}, { e, out } = U.readFields(b, SPEC, { partial: false });
    Object.assign(e, checkMasuk(out, null));
    if (out.nis) { const d = await dupNis(db.q, out.nis); if (d) e.nis = 'NIS sudah dipakai santri lain.'; }
    const kamarId = b.kamar_id ? parseInt(b.kamar_id, 10) : null;
    if (b.kamar_id && !Number.isInteger(kamarId)) e.kamar_id = 'Kamar tidak valid.';
    if (Object.keys(e).length) throw bad(e);
    const id = await db.tx(async q => {
      const t = Date.now(), cols = Object.keys(out);
      const r = await q(`INSERT INTO santri (${cols.join(',')},status,dibuat,diubah) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')},'aktif',$${cols.length + 1},$${cols.length + 1}) RETURNING id`, [...cols.map(c => out[c]), t]);
      const s = await getRow(q, r[0].id, true);
      await hist(req.q || q, s.id, 'dibuat', req, null, null, null, 'aktif', 'Data santri dibuat');
      if (kamarId) { const pr = await place(q, s, kamarId, req, 'Penempatan awal saat pendaftaran'); if (pr) req._pr = pr; }
      return s.id;
    });
    await logBy(req, 'tambah', 'santri', `Menambah santri ${out.nama}${out.nis ? ' (NIS ' + out.nis + ')' : ''}`);
    if (req._pr) await placeLog(req, { nama: out.nama }, req._pr);
    res.status(201).json({ id });
  }));
  api.patch('/santri/:id(\\d+)', SA, ah(async (req, res) => {
    const id = parseInt(req.params.id, 10), b = req.body || {};
    const r = await db.tx(async q => {
      const cur = await getRow(q, id, true);
      if (!cur) throw err(404, 'Santri tidak ditemukan.');
      if (cur.status === 'alumni') throw err(409, 'Santri ini sudah alumni. Ubah datanya melalui menu Data Alumni.');
      if (cur.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu sebelum mengubah.');
      const { e, out } = U.readFields(b, SPEC, { partial: true });
      for (const k of ['nama', 'jenis_kelamin']) if (k in out && out[k] == null) e[k] = e[k] || 'Wajib diisi.';
      Object.assign(e, checkMasuk(out, cur));
      if (out.nis && out.nis.toLowerCase() !== String(cur.nis || '').toLowerCase() && await dupNis(q, out.nis, id)) e.nis = 'NIS sudah dipakai santri lain.';
      if (out.jenis_kelamin && out.jenis_kelamin !== cur.jenis_kelamin && cur.kamar_id) e.jenis_kelamin = 'Jenis kelamin tidak dapat diubah selama santri masih ditempatkan di kamar. Keluarkan dari kamar dahulu.';
      const hasKamar = 'kamar_id' in b;
      const kamarId = hasKamar && b.kamar_id ? parseInt(b.kamar_id, 10) : null;
      if (hasKamar && b.kamar_id && !Number.isInteger(kamarId)) e.kamar_id = 'Kamar tidak valid.';
      if (Object.keys(e).length) throw bad(e);
      const d = diffOf(cur, out);
      if (d.keys.length) {
        const cols = Object.keys(d.after);
        await q(`UPDATE santri SET ${cols.map((c, i) => c + '=$' + (i + 1)).join(',')}, diubah=$${cols.length + 1} WHERE id=$${cols.length + 2}`, [...cols.map(c => d.after[c]), Date.now(), id]);
        await hist(q, id, 'ubah_data', req, null, null, label(cur), label(cur), 'Mengubah: ' + d.keys.join(', '), d.before, d.after);
      }
      let pr = null;
      if (hasKamar) pr = await place(q, { ...cur, jenis_kelamin: out.jenis_kelamin || cur.jenis_kelamin }, kamarId, req, U.text(b.alasan_penempatan, 300) || null);
      return { nama: out.nama || cur.nama, ket: d.keys, pr, cur };
    });
    if (r.ket.length) await logBy(req, 'ubah', 'santri', `Mengubah data santri ${r.nama}: ${r.ket.join(', ')}`);
    if (r.pr) await placeLog(req, { nama: r.nama }, r.pr);
    res.json({ ok: true });
  }));

  // ---------- penempatan / pemindahan / pengeluaran dari kamar ----------
  api.post('/santri/:id(\\d+)/penempatan', SA, ah(async (req, res) => {
    const id = parseInt(req.params.id, 10), b = req.body || {};
    const kamarId = b.kamar_id === null || b.kamar_id === undefined || b.kamar_id === '' ? null : parseInt(b.kamar_id, 10);
    if (kamarId !== null && !Number.isInteger(kamarId)) throw bad({ kamar_id: 'Kamar tidak valid.' });
    const r = await db.tx(async q => {
      const s = await getRow(q, id, true);
      if (!s) throw err(404, 'Santri tidak ditemukan.');
      const pr = await place(q, s, kamarId, req, U.text(b.alasan, 300) || null);
      if (!pr) throw err(409, kamarId ? 'Santri sudah berada di kamar tersebut.' : 'Santri belum berada di kamar mana pun.');
      return { s, pr };
    });
    await placeLog(req, r.s, r.pr);
    res.json({ ok: true, jenis: r.pr.jenis });
  }));

  // ---------- arsip / pulihkan (santri aktif maupun alumni) ----------
  async function arsipFlow(req, res, want, alumniOnly) {
    confirm(req); const alasan = alasanOf(req, false), id = parseInt(req.params.id, 10);
    const s = await db.tx(async q => {
      const s = await getRow(q, id, true);
      if (!s) throw err(404, 'Data tidak ditemukan.');
      if (alumniOnly === true && s.status !== 'alumni') throw err(404, 'Alumni tidak ditemukan.');
      if (alumniOnly === false && s.status === 'alumni') throw err(409, 'Santri ini sudah alumni. Gunakan menu Data Alumni.');
      if (want && s.diarsipkan) throw err(409, 'Data sudah diarsipkan.');
      if (!want && !s.diarsipkan) throw err(409, 'Data tidak sedang diarsipkan.');
      let pr = null;
      if (want && s.kamar_id) pr = await place(q, s, null, req, 'Data diarsipkan', true);
      await q('UPDATE santri SET diarsipkan=$1, diarsipkan_pada=$2, diubah=$3 WHERE id=$4', [want, want ? Date.now() : null, Date.now(), id]);
      await hist(q, id, want ? 'arsip' : 'pulihkan', req, null, null, label(s), label({ ...s, diarsipkan: want }), alasan);
      return { s, pr };
    });
    await logBy(req, want ? 'arsip' : 'pulihkan', alumniOnly ? 'alumni' : 'santri', `${want ? 'Mengarsipkan' : 'Memulihkan'} ${alumniOnly ? 'alumni' : 'santri'} ${s.s.nama}`);
    if (s.pr) await placeLog(req, s.s, s.pr);
    res.json({ ok: true });
  }
  api.post('/santri/:id(\\d+)/arsip', SA, ah((req, res) => arsipFlow(req, res, true, false)));
  api.post('/santri/:id(\\d+)/pulihkan', SA, ah((req, res) => arsipFlow(req, res, false, false)));
  api.post('/alumni/:id(\\d+)/arsip', ALM, ah((req, res) => arsipFlow(req, res, true, true)));
  api.post('/alumni/:id(\\d+)/pulihkan', ALM, ah((req, res) => arsipFlow(req, res, false, true)));

  // ---------- PINDAHKAN KE ALUMNI (satu transaksi; baris santri yang sama) ----------
  api.post('/santri/:id(\\d+)/pindah-alumni', SA, ah(async (req, res) => {
    confirm(req);
    const id = parseInt(req.params.id, 10), b = req.body || {};
    const { e, out } = U.readFields(b, { ...SPEC_KELUAR, program_terakhir: SPEC_ALUMNI_INFO.program_terakhir, catatan_alumni: SPEC_ALUMNI_INFO.catatan_alumni }, { partial: false });
    if (!out.tanggal_keluar && !e.tanggal_keluar) e.tanggal_keluar = 'Tanggal keluar / kelulusan wajib diisi.';
    if (out.tanggal_keluar && out.tahun_keluar == null) out.tahun_keluar = U.year(out.tanggal_keluar);   // otomatis, tetap dapat dikoreksi
    const r = await db.tx(async q => {
      const s = await getRow(q, id, true);
      if (!s) throw err(404, 'Santri tidak ditemukan.');
      if (s.status === 'alumni') throw err(409, 'Santri ini sudah berstatus alumni.');
      if (s.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu sebelum dipindahkan ke alumni.');
      Object.assign(e, checkKeluar({ ...out, tanggal_masuk: s.tanggal_masuk, tahun_masuk: s.tahun_masuk }));
      if (Object.keys(e).length) throw bad(e);
      const kam = s.kamar_id ? (await q('SELECT k.nama kamar, a.nama asrama FROM kamar k JOIN asrama a ON a.id=k.asrama_id WHERE k.id=$1', [s.kamar_id]))[0] : null;
      const pr = s.kamar_id ? await place(q, s, null, req, 'Dipindahkan ke alumni', true) : null;
      const terakhir = kam ? kam.asrama + ' / ' + kam.kamar : s.asrama_terakhir;
      const prog = out.program_terakhir || s.program_pesantren || s.pendidikan_formal || null;
      await q(`UPDATE santri SET status='alumni', status_alumni=$1, tanggal_keluar=$2, tahun_keluar=$3, keterangan_keluar=$4, program_terakhir=$5, asrama_terakhir=$6, catatan_alumni=$7, kamar_id=NULL, diubah=$8 WHERE id=$9`,
        [out.status_alumni, out.tanggal_keluar, out.tahun_keluar, out.keterangan_keluar, prog, terakhir || null, out.catatan_alumni, Date.now(), id]);
      await hist(q, id, 'pindah_alumni', req, null, null, label(s), 'alumni:' + out.status_alumni, out.keterangan_keluar || null, null,
        { status_alumni: out.status_alumni, tanggal_keluar: out.tanggal_keluar, tahun_keluar: out.tahun_keluar, program_terakhir: prog, asrama_terakhir: terakhir || null });
      return { s, pr };
    });
    await logBy(req, 'pindah_alumni', 'alumni', `Memindahkan ${r.s.nama} ke alumni (${out.status_alumni === 'lulus' ? 'Lulus' : 'Berhenti'}, ${out.tahun_keluar})`);
    if (r.pr) await placeLog(req, r.s, r.pr);
    res.json({ ok: true });
  }));

  // ---------- daftar & statistik alumni ----------
  const ASORT = { nama: 's.nama', nis: 's.nis', tahun_masuk: 's.tahun_masuk', tahun_keluar: 's.tahun_keluar', status: 's.status_alumni' };
  api.get('/alumni', ALM, ah(async (req, res) => {
    const kel = req.query.kelompok, st = req.query.status_alumni;
    if (kel !== undefined && kel !== '' && !['putra', 'putri'].includes(kel)) return res.status(400).json({ error: 'Kelompok harus putra atau putri.' });
    if (st !== undefined && st !== '' && !['lulus', 'berhenti'].includes(st)) return res.status(400).json({ error: 'Status alumni harus lulus atau berhenti.' });
    const cari = U.str(req.query.q, 60), pg = U.pageOf(req.query), W = U.where();
    W.add("s.status='alumni'");
    if (kel) W.add('s.jenis_kelamin=?', kel === 'putra' ? 'L' : 'P');
    if (st) W.add('s.status_alumni=?', st);
    if (cari) { const p = W.push('%' + U.likeEsc(cari) + '%'); W.add(`(s.nama ILIKE ${p} OR s.nis ILIKE ${p})`); }
    if (/^\d{4}$/.test(req.query.tahun_masuk || '')) W.add('s.tahun_masuk=?', +req.query.tahun_masuk);
    if (/^\d{4}$/.test(req.query.tahun_keluar || '')) W.add('s.tahun_keluar=?', +req.query.tahun_keluar);
    if (req.query.arsip === 'arsip') W.add('s.diarsipkan'); else if (req.query.arsip !== 'semua') W.add('NOT s.diarsipkan');
    const params = W.params(), total = await count(`SELECT COUNT(*)::int n ${FROM} ${W.sql}`, params);
    const rows = await db.q(`SELECT ${LIST} ${FROM} ${W.sql} ORDER BY ${U.orderBy(req.query, ASORT, 'tahun_keluar')}, s.nama, s.id LIMIT ${pg.size} OFFSET ${pg.offset}`, params);
    const pilihan = { tahun_masuk: (await db.q("SELECT DISTINCT tahun_masuk v FROM santri WHERE status='alumni' AND tahun_masuk IS NOT NULL ORDER BY 1 DESC")).map(r => r.v), tahun_keluar: (await db.q("SELECT DISTINCT tahun_keluar v FROM santri WHERE status='alumni' AND tahun_keluar IS NOT NULL ORDER BY 1 DESC")).map(r => r.v) };
    res.json({ rows, total, page: pg.page, size: pg.size, pilihan });
  }));
  api.get('/alumni/statistik', ALM, ah(async (req, res) => {
    const base = "FROM santri WHERE status='alumni' AND NOT diarsipkan";
    const t = await one(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE jenis_kelamin='L')::int putra, COUNT(*) FILTER (WHERE jenis_kelamin='P')::int putri,
      COUNT(*) FILTER (WHERE status_alumni='lulus')::int lulus, COUNT(*) FILTER (WHERE status_alumni='berhenti')::int berhenti ${base}`);
    const tahun = await db.q(`SELECT tahun_keluar tahun, COUNT(*)::int total, COUNT(*) FILTER (WHERE status_alumni='lulus')::int lulus, COUNT(*) FILTER (WHERE status_alumni='berhenti')::int berhenti,
      COUNT(*) FILTER (WHERE jenis_kelamin='L')::int putra, COUNT(*) FILTER (WHERE jenis_kelamin='P')::int putri ${base} GROUP BY tahun_keluar ORDER BY tahun_keluar DESC`);
    res.json({ ...t, per_tahun: tahun, catatan: 'Alumni yang diarsipkan tidak dihitung.' });
  }));

  // ---------- alumni manual, ubah data, koreksi, aktifkan kembali ----------
  api.post('/alumni', ALM, ah(async (req, res) => {
    const b = req.body || {}, S = { ...SPEC, ...SPEC_ALUMNI_INFO, ...SPEC_KELUAR };
    const { e, out } = U.readFields(b, S, { partial: false });
    if (out.tanggal_keluar && out.tahun_keluar == null) out.tahun_keluar = U.year(out.tanggal_keluar);
    Object.assign(e, checkMasuk(out, null), checkKeluar(out));
    if (out.nis && await dupNis(db.q, out.nis)) e.nis = 'NIS sudah dipakai.';
    if (Object.keys(e).length) throw bad(e);
    const id = await db.tx(async q => {
      const cols = Object.keys(out), t = Date.now();
      const r = await q(`INSERT INTO santri (${cols.join(',')},status,dibuat,diubah) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')},'alumni',$${cols.length + 1},$${cols.length + 1}) RETURNING id`, [...cols.map(c => out[c]), t]);
      await hist(q, r[0].id, 'tambah_alumni', req, null, null, null, 'alumni:' + out.status_alumni, 'Alumni ditambahkan manual oleh Super Admin');
      return r[0].id;
    });
    await logBy(req, 'tambah', 'alumni', `Menambah alumni manual ${out.nama} (${out.status_alumni})`);
    res.status(201).json({ id });
  }));
  api.patch('/alumni/:id(\\d+)', ALM, ah(async (req, res) => {
    const id = parseInt(req.params.id, 10), b = req.body || {};
    const r = await db.tx(async q => {
      const cur = await getRow(q, id, true);
      if (!cur || cur.status !== 'alumni') throw err(404, 'Alumni tidak ditemukan.');
      if (cur.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu sebelum mengubah.');
      const { e, out } = U.readFields(b, { ...SPEC, ...SPEC_ALUMNI_INFO }, { partial: true });
      for (const k of ['nama', 'jenis_kelamin']) if (k in out && out[k] == null) e[k] = e[k] || 'Wajib diisi.';
      Object.assign(e, checkMasuk(out, cur));
      if (out.nis && out.nis.toLowerCase() !== String(cur.nis || '').toLowerCase() && await dupNis(q, out.nis, id)) e.nis = 'NIS sudah dipakai santri lain.';
      const m = { ...cur, ...out }; if (m.tahun_keluar != null && m.tahun_masuk != null && m.tahun_keluar < m.tahun_masuk) e.tahun_masuk = 'Tahun masuk tidak boleh setelah tahun keluar.';
      if (Object.keys(e).length) throw bad(e);
      const d = diffOf(cur, out);
      if (d.keys.length) {
        const cols = Object.keys(d.after);
        await q(`UPDATE santri SET ${cols.map((c, i) => c + '=$' + (i + 1)).join(',')}, diubah=$${cols.length + 1} WHERE id=$${cols.length + 2}`, [...cols.map(c => d.after[c]), Date.now(), id]);
        await hist(q, id, 'ubah_data', req, null, null, label(cur), label(cur), 'Mengubah: ' + d.keys.join(', '), d.before, d.after);
      }
      return { nama: out.nama || cur.nama, ket: d.keys };
    });
    if (r.ket.length) await logBy(req, 'ubah', 'alumni', `Mengubah data alumni ${r.nama}: ${r.ket.join(', ')}`);
    res.json({ ok: true });
  }));
  api.post('/alumni/:id(\\d+)/koreksi', ALM, ah(async (req, res) => {
    confirm(req); const alasan = alasanOf(req, true), id = parseInt(req.params.id, 10), b = req.body || {};
    const r = await db.tx(async q => {
      const cur = await getRow(q, id, true);
      if (!cur || cur.status !== 'alumni') throw err(404, 'Alumni tidak ditemukan.');
      if (cur.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu.');
      const { e, out } = U.readFields(b, SPEC_KELUAR, { partial: true });
      if ('status_alumni' in out && !out.status_alumni) e.status_alumni = 'Status alumni wajib diisi.';
      if (out.tanggal_keluar && !('tahun_keluar' in out && out.tahun_keluar != null)) out.tahun_keluar = U.year(out.tanggal_keluar);
      const m = { ...cur, ...out }; Object.assign(e, checkKeluar(m));
      if (Object.keys(e).length) throw bad(e);
      const d = diffOf(cur, out);
      if (!d.keys.length) throw err(400, 'Tidak ada perubahan yang dikoreksi.');
      const cols = Object.keys(d.after);
      await q(`UPDATE santri SET ${cols.map((c, i) => c + '=$' + (i + 1)).join(',')}, diubah=$${cols.length + 1} WHERE id=$${cols.length + 2}`, [...cols.map(c => d.after[c]), Date.now(), id]);
      await hist(q, id, 'koreksi_alumni', req, null, null, label(cur), 'alumni:' + (out.status_alumni || cur.status_alumni), alasan, d.before, d.after);
      return { cur, d };
    });
    await logBy(req, 'koreksi', 'alumni', `Mengoreksi alumni ${r.cur.nama}: ${r.d.keys.join(', ')}. Alasan: ${alasan}`);
    res.json({ ok: true });
  }));
  api.post('/alumni/:id(\\d+)/aktifkan-kembali', ALM, ah(async (req, res) => {
    confirm(req); const alasan = alasanOf(req, true), id = parseInt(req.params.id, 10);
    const cur = await db.tx(async q => {
      const cur = await getRow(q, id, true);
      if (!cur || cur.status !== 'alumni') throw err(404, 'Alumni tidak ditemukan.');
      if (cur.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu.');
      const snap = { status_alumni: cur.status_alumni, tanggal_keluar: cur.tanggal_keluar, tahun_keluar: cur.tahun_keluar, keterangan_keluar: cur.keterangan_keluar, program_terakhir: cur.program_terakhir, asrama_terakhir: cur.asrama_terakhir, catatan_alumni: cur.catatan_alumni };
      await q(`UPDATE santri SET status='aktif', status_alumni=NULL, tanggal_keluar=NULL, tahun_keluar=NULL, keterangan_keluar=NULL, program_terakhir=NULL, asrama_terakhir=NULL, catatan_alumni=NULL, diubah=$1 WHERE id=$2`, [Date.now(), id]);
      await hist(q, id, 'aktifkan_kembali', req, null, null, label(cur), 'aktif', alasan, snap, null);
      return cur;
    });
    await logBy(req, 'aktifkan_kembali', 'alumni', `Mengaktifkan kembali ${cur.nama} sebagai santri aktif. Alasan: ${alasan}`);
    res.json({ ok: true });
  }));

  // ---------- unggah foto / KK / dokumen ----------
  const UP = (jenisBerkas, col, label_, pdf) => ah(async (req, res) => {
    const id = parseInt(req.params.id, 10), f = readUpload(req.body, { pdf });
    if (f.error) throw bad({ berkas: f.error });
    const nama = await db.tx(async q => {
      const s = await getRow(q, id, true);
      if (!s) throw err(404, 'Santri tidak ditemukan.');
      if (s.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu.');
      const old = s[col], nid = await simpan(q, jenisBerkas, f, req.user.id);
      await q(`UPDATE santri SET ${col}=$1, diubah=$2 WHERE id=$3`, [nid, Date.now(), id]);
      await buang(q, old);
      await hist(q, id, 'dokumen', req, null, null, label(s), label(s), (old ? 'Mengganti ' : 'Mengunggah ') + label_);
      return s.nama;
    });
    await logBy(req, 'unggah_dokumen', 'santri', `Mengunggah ${label_} santri ${nama}`);
    res.json({ ok: true });
  });
  api.put('/santri/:id(\\d+)/foto', SA, UP('foto', 'foto_berkas', 'foto santri', false));
  api.put('/santri/:id(\\d+)/kk', SA, UP('kk', 'kk_berkas', 'foto Kartu Keluarga', true));
  api.post('/santri/:id(\\d+)/dokumen', SA, ah(async (req, res) => {
    const id = parseInt(req.params.id, 10), b = req.body || {}, f = readUpload(b, { pdf: true });
    if (!['identitas', 'pendukung'].includes(b.jenis)) throw bad({ jenis: 'Jenis dokumen harus identitas atau pendukung.' });
    if (f.error) throw bad({ berkas: f.error });
    const nama = await db.tx(async q => {
      const s = await getRow(q, id, true);
      if (!s) throw err(404, 'Santri tidak ditemukan.');
      if (s.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu.');
      if ((await q('SELECT COUNT(*)::int n FROM dokumen_santri WHERE santri_id=$1', [id]))[0].n >= 20) throw err(409, 'Maksimal 20 dokumen per santri.');
      const bid = await simpan(q, b.jenis, f, req.user.id);
      await q('INSERT INTO dokumen_santri (santri_id,jenis,berkas_id,keterangan,diunggah) VALUES ($1,$2,$3,$4,$5)', [id, b.jenis, bid, U.textOrNull(b.keterangan, 200), Date.now()]);
      await hist(q, id, 'dokumen', req, null, null, label(s), label(s), 'Menambah dokumen ' + b.jenis);
      return s.nama;
    });
    await logBy(req, 'unggah_dokumen', 'santri', `Menambah dokumen ${b.jenis} santri ${nama}`);
    res.status(201).json({ ok: true });
  }));
  api.delete('/santri/:id(\\d+)/dokumen/:did(\\d+)', SA, ah(async (req, res) => {
    confirm(req); const id = parseInt(req.params.id, 10), did = parseInt(req.params.did, 10);
    const nama = await db.tx(async q => {
      const s = await getRow(q, id, true);
      const d = s && (await q('SELECT id, jenis, berkas_id FROM dokumen_santri WHERE id=$1 AND santri_id=$2', [did, id]))[0];
      if (!d) throw err(404, 'Dokumen tidak ditemukan.');
      await q('DELETE FROM dokumen_santri WHERE id=$1', [did]); await buang(q, d.berkas_id);
      await hist(q, id, 'dokumen', req, null, null, label(s), label(s), 'Menghapus dokumen ' + d.jenis);
      return s.nama;
    });
    await logBy(req, 'hapus_dokumen', 'santri', `Menghapus dokumen santri ${nama}`);
    res.json({ ok: true });
  }));
}
module.exports = { register };
