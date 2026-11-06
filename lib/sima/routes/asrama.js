'use strict';
// Asrama & Kamar (Putra/Putri). Penempatan santri ada di routes/santri.js; riwayatnya dibaca dari sini.
const U = require('../util');
const err = (http, message, fields) => Object.assign(new Error(message), { http, fields });
const bad = e => err(400, 'Data belum valid.', e);

function register(api, { db, auth, logBy, ah, one, count }) {
  const M = auth.requireModule('asrama');
  const confirm = req => { if (!req.body || req.body.konfirmasi !== true) throw err(400, 'Tindakan ini memerlukan konfirmasi.'); };
  const JENIS = ['putra', 'putri'];
  const AKTIF = "s.status='aktif' AND NOT s.diarsipkan";

  const ASPEC = { nama: ['str', 'Nama asrama', { required: true, min: 2, max: 80 }], jenis: ['enum', 'Jenis asrama', { required: true, values: JENIS }],
    status: ['enum', 'Status asrama', { values: ['aktif', 'nonaktif'] }], keterangan: ['text', 'Keterangan', { max: 500 }] };
  const KSPEC = { nama: ['str', 'Nama / nomor kamar', { required: true, min: 1, max: 60 }], kapasitas: ['int', 'Kapasitas', { required: true, min: 1, max: 200 }],
    status: ['enum', 'Status kamar', { values: ['aktif', 'nonaktif', 'perbaikan'] }], catatan: ['text', 'Keterangan', { max: 500 }] };

  const asramaSql = `SELECT a.id, a.nama, a.jenis, a.status, a.keterangan, a.diarsipkan,
    (SELECT COUNT(*)::int FROM kamar k WHERE k.asrama_id=a.id AND NOT k.diarsipkan) jumlah_kamar,
    (SELECT COALESCE(SUM(k.kapasitas),0)::int FROM kamar k WHERE k.asrama_id=a.id AND NOT k.diarsipkan AND k.status='aktif') kapasitas,
    (SELECT COUNT(*)::int FROM santri s JOIN kamar k ON k.id=s.kamar_id WHERE k.asrama_id=a.id AND ${AKTIF}) penghuni
    FROM asrama a`;
  const out = r => ({ ...r, sisa: Math.max(0, r.kapasitas - r.penghuni) });

  api.get('/asrama', M, ah(async (req, res) => {
    const W = U.where();
    if (req.query.jenis) { if (!JENIS.includes(req.query.jenis)) return res.status(400).json({ error: 'Jenis harus putra atau putri.' }); W.add('a.jenis=?', req.query.jenis); }
    const cari = U.str(req.query.q, 60); if (cari) W.add('a.nama ILIKE ?', '%' + U.likeEsc(cari) + '%');
    if (req.query.status === 'aktif' || req.query.status === 'nonaktif') W.add('a.status=?', req.query.status);
    if (req.query.arsip === 'arsip') W.add('a.diarsipkan'); else if (req.query.arsip !== 'semua') W.add('NOT a.diarsipkan');
    res.json({ rows: (await db.q(`${asramaSql} ${W.sql} ORDER BY a.jenis, a.nama`, W.params())).map(out) });
  }));
  api.get('/asrama/:id(\\d+)', M, ah(async (req, res) => {
    const a = (await db.q(`${asramaSql} WHERE a.id=$1`, [+req.params.id]))[0];
    if (!a) return res.status(404).json({ error: 'Asrama tidak ditemukan.' });
    res.json({ asrama: out(a) });
  }));
  api.post('/asrama', M, ah(async (req, res) => {
    const { e, out: v } = U.readFields(req.body || {}, ASPEC, { partial: false });
    if (Object.keys(e).length) throw bad(e);
    try {
      const r = await one('INSERT INTO asrama (jenis,nama,status,keterangan) VALUES ($1,$2,$3,$4) RETURNING id', [v.jenis, v.nama, v.status || 'aktif', v.keterangan]);
      await logBy(req, 'tambah', 'asrama', `Menambah asrama ${v.nama} (${v.jenis})`);
      res.status(201).json({ id: r.id });
    } catch (x) { if (U.isUnique(x)) throw err(409, 'Nama asrama sudah dipakai pada kelompok ini.', { nama: 'Nama sudah dipakai.' }); throw x; }
  }));
  api.patch('/asrama/:id(\\d+)', M, ah(async (req, res) => {
    const id = +req.params.id, cur = await one('SELECT * FROM asrama WHERE id=$1', [id]);
    if (!cur) throw err(404, 'Asrama tidak ditemukan.');
    const { e, out: v } = U.readFields(req.body || {}, ASPEC, { partial: true });
    if ('nama' in v && !v.nama) e.nama = 'Nama asrama wajib diisi.';
    if (v.jenis && v.jenis !== cur.jenis && await count('SELECT COUNT(*)::int n FROM kamar WHERE asrama_id=$1', [id])) e.jenis = 'Jenis asrama tidak dapat diubah karena sudah memiliki kamar.';
    if (cur.diarsipkan) throw err(409, 'Asrama diarsipkan. Pulihkan terlebih dahulu.');
    if (Object.keys(e).length) throw bad(e);
    const m = { nama: v.nama ?? cur.nama, jenis: v.jenis ?? cur.jenis, status: v.status ?? cur.status, keterangan: 'keterangan' in v ? v.keterangan : cur.keterangan };
    if (m.status === 'nonaktif' && cur.status === 'aktif' && await count(`SELECT COUNT(*)::int n FROM santri s JOIN kamar k ON k.id=s.kamar_id WHERE k.asrama_id=$1 AND ${AKTIF}`, [id])) throw err(409, 'Asrama masih memiliki penghuni aktif. Pindahkan penghuni terlebih dahulu.');
    try { await db.q('UPDATE asrama SET nama=$1,jenis=$2,status=$3,keterangan=$4 WHERE id=$5', [m.nama, m.jenis, m.status, m.keterangan, id]); }
    catch (x) { if (U.isUnique(x)) throw err(409, 'Nama asrama sudah dipakai pada kelompok ini.', { nama: 'Nama sudah dipakai.' }); throw x; }
    await logBy(req, 'ubah', 'asrama', `Mengubah asrama ${m.nama}`);
    res.json({ ok: true });
  }));
  async function arsip(req, res, want, tabel) {
    confirm(req); const id = +req.params.id;
    const cur = await one(`SELECT * FROM ${tabel} WHERE id=$1`, [id]);
    if (!cur) throw err(404, 'Data tidak ditemukan.');
    if (cur.diarsipkan === want) throw err(409, want ? 'Sudah diarsipkan.' : 'Tidak sedang diarsipkan.');
    if (want) {
      const n = tabel === 'asrama'
        ? await count(`SELECT COUNT(*)::int n FROM santri s JOIN kamar k ON k.id=s.kamar_id WHERE k.asrama_id=$1 AND ${AKTIF}`, [id])
        : await count(`SELECT COUNT(*)::int n FROM santri s WHERE s.kamar_id=$1 AND ${AKTIF}`, [id]);
      if (n) throw err(409, `Masih ada ${n} penghuni aktif. Pindahkan penghuni terlebih dahulu sebelum mengarsipkan.`);
    } else if (tabel === 'kamar' && (await one('SELECT diarsipkan d FROM asrama WHERE id=$1', [cur.asrama_id])).d) throw err(409, 'Asrama kamar ini diarsipkan. Pulihkan asramanya terlebih dahulu.');
    await db.q(`UPDATE ${tabel} SET diarsipkan=$1 WHERE id=$2`, [want, id]);
    await logBy(req, want ? 'arsip' : 'pulihkan', 'asrama', `${want ? 'Mengarsipkan' : 'Memulihkan'} ${tabel} ${cur.nama}`);
    res.json({ ok: true });
  }
  api.post('/asrama/:id(\\d+)/arsip', M, ah((q, s) => arsip(q, s, true, 'asrama')));
  api.post('/asrama/:id(\\d+)/pulihkan', M, ah((q, s) => arsip(q, s, false, 'asrama')));
  api.post('/kamar/:id(\\d+)/arsip', M, ah((q, s) => arsip(q, s, true, 'kamar')));
  api.post('/kamar/:id(\\d+)/pulihkan', M, ah((q, s) => arsip(q, s, false, 'kamar')));

  // ---- kamar ----
  const kamarSql = `SELECT k.id, k.nama, k.kapasitas, k.status, k.catatan, k.diarsipkan, a.id asrama_id, a.nama asrama, a.jenis,
    (SELECT COUNT(*)::int FROM santri s WHERE s.kamar_id=k.id AND ${AKTIF}) penghuni
    FROM kamar k JOIN asrama a ON a.id=k.asrama_id`;
  api.get('/kamar', M, ah(async (req, res) => {
    const W = U.where();
    if (req.query.jenis) { if (!JENIS.includes(req.query.jenis)) return res.status(400).json({ error: 'Jenis harus putra atau putri.' }); W.add('a.jenis=?', req.query.jenis); }
    if (/^\d+$/.test(req.query.asrama_id || '')) W.add('a.id=?', +req.query.asrama_id);
    const cari = U.str(req.query.q, 60); if (cari) W.add('k.nama ILIKE ?', '%' + U.likeEsc(cari) + '%');
    if (['aktif', 'nonaktif', 'perbaikan'].includes(req.query.status)) W.add('k.status=?', req.query.status);
    if (req.query.arsip === 'arsip') W.add('k.diarsipkan'); else if (req.query.arsip !== 'semua') W.add('NOT k.diarsipkan');
    let rows = (await db.q(`${kamarSql} ${W.sql} ORDER BY a.nama, k.nama`, W.params())).map(r => ({ ...r, sisa: Math.max(0, r.kapasitas - r.penghuni) }));
    if (req.query.tersedia === '1') rows = rows.filter(r => r.status === 'aktif' && !r.diarsipkan && r.sisa > 0);
    res.json({ rows });
  }));
  api.get('/kamar/:id(\\d+)', M, ah(async (req, res) => {
    const k = (await db.q(`${kamarSql} WHERE k.id=$1`, [+req.params.id]))[0];
    if (!k) return res.status(404).json({ error: 'Kamar tidak ditemukan.' });
    const penghuni = await db.q(`SELECT s.id, s.nis, s.nama, s.foto_berkas, s.tahun_masuk FROM santri s WHERE s.kamar_id=$1 AND ${AKTIF} ORDER BY s.nama`, [k.id]);
    const riwayat = await db.q(`SELECT r.id, r.jenis, r.dari_asrama, r.dari_kamar, r.ke_asrama, r.ke_kamar, r.waktu, r.oleh_username, r.alasan, s.nama santri, r.santri_id
      FROM riwayat_penempatan r JOIN santri s ON s.id=r.santri_id WHERE r.dari_kamar_id=$1 OR r.ke_kamar_id=$1 ORDER BY r.id DESC LIMIT 50`, [k.id]);
    res.json({ kamar: { ...k, sisa: Math.max(0, k.kapasitas - k.penghuni) }, penghuni, riwayat });
  }));
  api.post('/kamar', M, ah(async (req, res) => {
    const b = req.body || {}, { e, out: v } = U.readFields(b, KSPEC, { partial: false });
    const a = /^\d+$/.test(String(b.asrama_id)) ? await one('SELECT id, nama, status, diarsipkan FROM asrama WHERE id=$1', [+b.asrama_id]) : null;
    if (!a) e.asrama_id = 'Pilih asrama.'; else if (a.diarsipkan) e.asrama_id = 'Asrama diarsipkan.';
    if (Object.keys(e).length) throw bad(e);
    try {
      const r = await one('INSERT INTO kamar (asrama_id,nama,kapasitas,status,catatan) VALUES ($1,$2,$3,$4,$5) RETURNING id', [a.id, v.nama, v.kapasitas, v.status || 'aktif', v.catatan]);
      await logBy(req, 'tambah', 'asrama', `Menambah kamar ${v.nama} di ${a.nama} (kapasitas ${v.kapasitas})`);
      res.status(201).json({ id: r.id });
    } catch (x) { if (U.isUnique(x)) throw err(409, 'Nama kamar sudah dipakai di asrama ini.', { nama: 'Nama sudah dipakai.' }); throw x; }
  }));
  api.patch('/kamar/:id(\\d+)', M, ah(async (req, res) => {
    const id = +req.params.id, cur = await one('SELECT * FROM kamar WHERE id=$1', [id]);
    if (!cur) throw err(404, 'Kamar tidak ditemukan.');
    if (cur.diarsipkan) throw err(409, 'Kamar diarsipkan. Pulihkan terlebih dahulu.');
    const { e, out: v } = U.readFields(req.body || {}, KSPEC, { partial: true });
    for (const k of ['nama', 'kapasitas']) if (k in v && v[k] == null) e[k] = e[k] || 'Wajib diisi.';
    if (Object.keys(e).length) throw bad(e);
    const m = { nama: v.nama ?? cur.nama, kapasitas: v.kapasitas ?? cur.kapasitas, status: v.status ?? cur.status, catatan: 'catatan' in v ? v.catatan : cur.catatan };
    try { await db.q('UPDATE kamar SET nama=$1,kapasitas=$2,status=$3,catatan=$4 WHERE id=$5', [m.nama, m.kapasitas, m.status, m.catatan, id]); }
    catch (x) { if (U.isUnique(x)) throw err(409, 'Nama kamar sudah dipakai di asrama ini.', { nama: 'Nama sudah dipakai.' }); throw x; }
    await logBy(req, 'ubah', 'asrama', `Mengubah kamar ${m.nama}`);
    res.json({ ok: true });
  }));

  // ---- penempatan: santri aktif tanpa kamar + riwayat perpindahan ----
  api.get('/penempatan/belum', M, ah(async (req, res) => {
    const jk = req.query.kelompok === 'putra' ? 'L' : req.query.kelompok === 'putri' ? 'P' : null;
    if (!jk) return res.status(400).json({ error: 'Kelompok harus putra atau putri.' });
    res.json({ rows: await db.q(`SELECT s.id, s.nis, s.nama, s.tahun_masuk FROM santri s WHERE ${AKTIF} AND s.kamar_id IS NULL AND s.jenis_kelamin=$1 ORDER BY s.nama LIMIT 500`, [jk]) });
  }));
  api.get('/penempatan/riwayat', M, ah(async (req, res) => {
    const pg = U.pageOf(req.query), W = U.where();
    if (req.query.kelompok) { if (!JENIS.includes(req.query.kelompok)) return res.status(400).json({ error: 'Kelompok harus putra atau putri.' }); W.add('s.jenis_kelamin=?', req.query.kelompok === 'putra' ? 'L' : 'P'); }
    if (/^\d+$/.test(req.query.santri_id || '')) W.add('r.santri_id=?', +req.query.santri_id);
    const total = await count(`SELECT COUNT(*)::int n FROM riwayat_penempatan r JOIN santri s ON s.id=r.santri_id ${W.sql}`, W.params());
    const rows = await db.q(`SELECT r.id, r.santri_id, s.nama santri, r.jenis, r.dari_asrama, r.dari_kamar, r.ke_asrama, r.ke_kamar, r.waktu, r.oleh_username, r.alasan
      FROM riwayat_penempatan r JOIN santri s ON s.id=r.santri_id ${W.sql} ORDER BY r.id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, W.params());
    res.json({ rows, total, page: pg.page, size: pg.size });
  }));
}
module.exports = { register };
