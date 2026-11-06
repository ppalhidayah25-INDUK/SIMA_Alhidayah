'use strict';
// Data Pengajar (satu modul) + riwayat penugasan. Siap dihubungkan ke modul Pendidikan lewat pengajar_penugasan.
const U = require('../util');
const { simpan, buang, readUpload } = require('./berkas');
const err = (http, message, fields) => Object.assign(new Error(message), { http, fields });
const bad = e => err(400, 'Data belum valid.', e);

function register(api, { db, auth, logBy, ah, one, count }) {
  const M = auth.requireModule('pengajar');
  const confirm = req => { if (!req.body || req.body.konfirmasi !== true) throw err(400, 'Tindakan ini memerlukan konfirmasi.'); };
  const SPEC = {
    nama: ['str', 'Nama lengkap', { required: true, min: 2, max: 100 }], alamat: ['text', 'Alamat', { max: 400 }],
    kontak: ['str', 'Nomor kontak', { max: 20, re: /^[0-9+()\-\s]{6,20}$/, msg: 'Nomor kontak hanya boleh angka, spasi, +, -, ( ).' }],
    bidang: ['str', 'Bidang / mata pelajaran', { max: 120 }], lembaga: ['str', 'Lembaga / program yang diampu', { max: 150 }],
    tanggal_mulai: ['date', 'Tanggal mulai mengajar', {}], keterangan: ['text', 'Keterangan', { max: 500 }], aktif: ['bool', 'Status aktif', {}]
  };
  const SEL = 'p.id, p.nama, p.foto_berkas, p.alamat, p.kontak, p.bidang, p.lembaga, p.tanggal_mulai::text tanggal_mulai, p.keterangan, p.aktif, p.diarsipkan';
  const SORT = { nama: 'p.nama', bidang: 'p.bidang', lembaga: 'p.lembaga', status: 'p.aktif' };

  api.get('/pengajar', M, ah(async (req, res) => {
    const pg = U.pageOf(req.query), W = U.where();
    const cari = U.str(req.query.q, 60); if (cari) W.add('p.nama ILIKE ?', '%' + U.likeEsc(cari) + '%');
    const bd = U.str(req.query.bidang, 120), lm = U.str(req.query.lembaga, 150);
    if (bd) W.add('p.bidang=?', bd); if (lm) W.add('p.lembaga=?', lm);
    if (req.query.status === 'aktif') W.add('p.aktif'); else if (req.query.status === 'nonaktif') W.add('NOT p.aktif');
    if (req.query.arsip === 'arsip') W.add('p.diarsipkan'); else if (req.query.arsip !== 'semua') W.add('NOT p.diarsipkan');
    const total = await count(`SELECT COUNT(*)::int n FROM pengajar p ${W.sql}`, W.params());
    const rows = await db.q(`SELECT ${SEL} FROM pengajar p ${W.sql} ORDER BY ${U.orderBy(req.query, SORT, 'nama')}, p.id LIMIT ${pg.size} OFFSET ${pg.offset}`, W.params());
    const pilihan = {
      bidang: (await db.q("SELECT DISTINCT bidang v FROM pengajar WHERE bidang IS NOT NULL AND NOT diarsipkan ORDER BY 1")).map(r => r.v),
      lembaga: (await db.q("SELECT DISTINCT lembaga v FROM pengajar WHERE lembaga IS NOT NULL AND NOT diarsipkan ORDER BY 1")).map(r => r.v)
    };
    res.json({ rows, total, page: pg.page, size: pg.size, pilihan });
  }));
  api.get('/pengajar/:id(\\d+)', M, ah(async (req, res) => {
    const id = +req.params.id, p = (await db.q(`SELECT ${SEL} FROM pengajar p WHERE p.id=$1`, [id]))[0];
    if (!p) return res.status(404).json({ error: 'Pengajar tidak ditemukan.' });
    res.json({ pengajar: p, penugasan: await db.q('SELECT g.id, g.bidang, g.lembaga, g.mulai::text mulai, g.selesai::text selesai, g.keterangan, g.dibuat, u.username oleh FROM pengajar_penugasan g LEFT JOIN users u ON u.id=g.oleh WHERE g.pengajar_id=$1 ORDER BY g.mulai DESC NULLS LAST, g.id DESC', [id]) });
  }));
  api.post('/pengajar', M, ah(async (req, res) => {
    const b = req.body || {}, { e, out } = U.readFields(b, SPEC, { partial: false });
    if (Object.keys(e).length) throw bad(e);
    const id = await db.tx(async q => {
      const r = await q('INSERT INTO pengajar (nama,alamat,kontak,bidang,lembaga,tanggal_mulai,keterangan,aktif,dibuat,diubah) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id',
        [out.nama, out.alamat, out.kontak, out.bidang, out.lembaga, out.tanggal_mulai, out.keterangan, 'aktif' in b ? !!out.aktif : true, Date.now()]);
      if (out.bidang || out.lembaga) await q('INSERT INTO pengajar_penugasan (pengajar_id,bidang,lembaga,mulai,keterangan,dibuat,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7)', [r[0].id, out.bidang, out.lembaga, out.tanggal_mulai, 'Penugasan awal', Date.now(), req.user.id]);
      return r[0].id;
    });
    await logBy(req, 'tambah', 'pengajar', `Menambah pengajar ${out.nama}`);
    res.status(201).json({ id });
  }));
  api.patch('/pengajar/:id(\\d+)', M, ah(async (req, res) => {
    const id = +req.params.id, cur = (await db.q(`SELECT ${SEL} FROM pengajar p WHERE p.id=$1`, [id]))[0];
    if (!cur) throw err(404, 'Pengajar tidak ditemukan.');
    if (cur.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu.');
    const { e, out } = U.readFields(req.body || {}, SPEC, { partial: true });
    if ('nama' in out && !out.nama) e.nama = 'Nama wajib diisi.';
    if (Object.keys(e).length) throw bad(e);
    const cols = Object.keys(out); if (!cols.length) return res.json({ ok: true });
    await db.q(`UPDATE pengajar SET ${cols.map((c, i) => c + '=$' + (i + 1)).join(',')}, diubah=$${cols.length + 1} WHERE id=$${cols.length + 2}`, [...cols.map(c => out[c]), Date.now(), id]);
    await logBy(req, 'ubah', 'pengajar', `Mengubah data pengajar ${out.nama || cur.nama}`);
    res.json({ ok: true });
  }));
  async function arsip(req, res, want) {
    confirm(req); const id = +req.params.id, cur = await one('SELECT id, nama, diarsipkan FROM pengajar WHERE id=$1', [id]);
    if (!cur) throw err(404, 'Pengajar tidak ditemukan.');
    if (cur.diarsipkan === want) throw err(409, want ? 'Sudah diarsipkan.' : 'Tidak sedang diarsipkan.');
    await db.q('UPDATE pengajar SET diarsipkan=$1, aktif=CASE WHEN $1 THEN FALSE ELSE aktif END, diubah=$2 WHERE id=$3', [want, Date.now(), id]);
    await logBy(req, want ? 'arsip' : 'pulihkan', 'pengajar', `${want ? 'Mengarsipkan' : 'Memulihkan'} pengajar ${cur.nama}`);
    res.json({ ok: true });
  }
  api.post('/pengajar/:id(\\d+)/arsip', M, ah((q, s) => arsip(q, s, true)));
  api.post('/pengajar/:id(\\d+)/pulihkan', M, ah((q, s) => arsip(q, s, false)));
  api.put('/pengajar/:id(\\d+)/foto', M, ah(async (req, res) => {
    const id = +req.params.id, f = readUpload(req.body, { pdf: false }); if (f.error) throw bad({ berkas: f.error });
    const cur = await one('SELECT id, nama, foto_berkas, diarsipkan FROM pengajar WHERE id=$1', [id]); if (!cur) throw err(404, 'Pengajar tidak ditemukan.');
    if (cur.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu.');
    await db.tx(async q => { const nid = await simpan(q, 'foto_pengajar', f, req.user.id); await q('UPDATE pengajar SET foto_berkas=$1, diubah=$2 WHERE id=$3', [nid, Date.now(), id]); await buang(q, cur.foto_berkas); });
    await logBy(req, 'unggah_dokumen', 'pengajar', `Mengunggah foto pengajar ${cur.nama}`);
    res.json({ ok: true });
  }));

  // ---- riwayat penugasan ----
  const GSPEC = { bidang: ['str', 'Bidang / mata pelajaran', { max: 120 }], lembaga: ['str', 'Lembaga / program', { max: 150 }], mulai: ['date', 'Tanggal mulai', {}], selesai: ['date', 'Tanggal selesai', {}], keterangan: ['text', 'Keterangan', { max: 300 }] };
  const check = (m, e) => { if (!m.bidang && !m.lembaga) e.bidang = 'Isi bidang atau lembaga.'; if (m.mulai && m.selesai && m.selesai < m.mulai) e.selesai = 'Tanggal selesai tidak boleh sebelum tanggal mulai.'; };
  api.post('/pengajar/:id(\\d+)/penugasan', M, ah(async (req, res) => {
    const id = +req.params.id, p = await one('SELECT id, nama, diarsipkan FROM pengajar WHERE id=$1', [id]); if (!p) throw err(404, 'Pengajar tidak ditemukan.');
    if (p.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu.');
    const { e, out } = U.readFields(req.body || {}, GSPEC, { partial: false }); check(out, e);
    if (Object.keys(e).length) throw bad(e);
    const r = await one('INSERT INTO pengajar_penugasan (pengajar_id,bidang,lembaga,mulai,selesai,keterangan,dibuat,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [id, out.bidang, out.lembaga, out.mulai, out.selesai, out.keterangan, Date.now(), req.user.id]);
    await logBy(req, 'tambah', 'pengajar', `Menambah penugasan pengajar ${p.nama}`);
    res.status(201).json({ id: r.id });
  }));
  api.patch('/pengajar/:id(\\d+)/penugasan/:gid(\\d+)', M, ah(async (req, res) => {
    const id = +req.params.id, gid = +req.params.gid;
    const cur = await one('SELECT g.*, g.mulai::text m, g.selesai::text s, p.nama pnama, p.diarsipkan FROM pengajar_penugasan g JOIN pengajar p ON p.id=g.pengajar_id WHERE g.id=$1 AND g.pengajar_id=$2', [gid, id]);
    if (!cur) throw err(404, 'Penugasan tidak ditemukan.');
    if (cur.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu.');
    const { e, out } = U.readFields(req.body || {}, GSPEC, { partial: true });
    check({ bidang: 'bidang' in out ? out.bidang : cur.bidang, lembaga: 'lembaga' in out ? out.lembaga : cur.lembaga, mulai: 'mulai' in out ? out.mulai : cur.m, selesai: 'selesai' in out ? out.selesai : cur.s }, e);
    if (Object.keys(e).length) throw bad(e);
    const cols = Object.keys(out); if (!cols.length) return res.json({ ok: true });
    await db.q(`UPDATE pengajar_penugasan SET ${cols.map((c, i) => c + '=$' + (i + 1)).join(',')} WHERE id=$${cols.length + 1}`, [...cols.map(c => out[c]), gid]);
    await logBy(req, 'ubah', 'pengajar', `Mengubah penugasan pengajar ${cur.pnama}`);
    res.json({ ok: true });
  }));
}
module.exports = { register };
