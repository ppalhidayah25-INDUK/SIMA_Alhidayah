'use strict';
// Data Pengurus (Putra/Putri): jabatan hierarkis, divisi, periode, riwayat, arsip, bagan organisasi.
const U = require('../util');
const { simpan, buang, readUpload } = require('./berkas');
const err = (http, message, fields) => Object.assign(new Error(message), { http, fields });
const bad = e => err(400, 'Data belum valid.', e);
const KEL = ['putra', 'putri'];
// Daftar jabatan awal = persis yang tertulis di spesifikasi pengguna. Urutan/atasan diatur Super Admin sendiri.
const JABATAN_AWAL = ['Pengasuh Pondok', 'Ketua Umum Pondok', 'Ketua Pondok', 'Sekretaris', 'Bendahara', 'Divisi Keamanan', 'Divisi Madrasah Diniyah', "Divisi Madrasah Qur'an", 'Divisi Media'];

function register(api, { db, auth, logBy, ah, one, count }) {
  const M = auth.requireModule('pengurus');
  const confirm = req => { if (!req.body || req.body.konfirmasi !== true) throw err(400, 'Tindakan ini memerlukan konfirmasi.'); };
  const kel = (req) => { const k = req.query.kelompok ?? (req.body && req.body.kelompok); if (!KEL.includes(k)) throw err(400, 'Kelompok harus putra atau putri.'); return k; };

  // ===== referensi: jabatan / divisi / periode =====
  const REF = {
    jabatan: { spec: { nama: ['str', 'Nama jabatan', { required: true, min: 2, max: 80 }], urutan: ['int', 'Urutan', { min: 0, max: 9999 }], keterangan: ['text', 'Keterangan', { max: 300 }], aktif: ['bool', 'Aktif', {}] } },
    divisi: { spec: { nama: ['str', 'Nama divisi', { required: true, min: 2, max: 80 }], keterangan: ['text', 'Keterangan', { max: 300 }], aktif: ['bool', 'Aktif', {}] } },
    periode: { spec: { nama: ['str', 'Nama periode', { required: true, min: 2, max: 60 }], mulai: ['date', 'Tanggal mulai', {}], selesai: ['date', 'Tanggal selesai', {}], aktif: ['bool', 'Aktif', {}] } }
  };
  for (const [tbl, def] of Object.entries(REF)) {
    api.get('/' + tbl, M, ah(async (req, res) => {
      const k = kel(req);
      const cnt = tbl === 'jabatan' ? 'jabatan_id' : tbl === 'divisi' ? 'divisi_id' : 'periode_id';
      const cols = { jabatan: 'x.id, x.nama, x.induk_id, x.urutan, x.keterangan, x.aktif', divisi: 'x.id, x.nama, x.keterangan, x.aktif', periode: 'x.id, x.nama, x.mulai::text mulai, x.selesai::text selesai, x.aktif' }[tbl];
      const order = tbl === 'jabatan' ? 'x.urutan, x.nama' : tbl === 'periode' ? 'x.mulai DESC NULLS LAST, x.nama' : 'x.nama';
      res.json({ rows: await db.q(`SELECT ${cols}, (SELECT COUNT(*)::int FROM pengurus p WHERE p.${cnt}=x.id AND NOT p.diarsipkan) jumlah FROM ${tbl} x WHERE x.kelompok=$1 ORDER BY ${order}`, [k]) });
    }));
    api.post('/' + tbl, M, ah(async (req, res) => {
      const k = kel(req), b = req.body || {}, { e, out } = U.readFields(b, def.spec, { partial: false });
      if (tbl === 'periode' && out.mulai && out.selesai && out.selesai < out.mulai) e.selesai = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
      let induk = null;
      if (tbl === 'jabatan' && b.induk_id) { induk = await one('SELECT id FROM jabatan WHERE id=$1 AND kelompok=$2', [parseInt(b.induk_id, 10) || 0, k]); if (!induk) e.induk_id = 'Atasan tidak valid.'; }
      if (Object.keys(e).length) throw bad(e);
      if (tbl === 'jabatan' && out.urutan == null) out.urutan = 0;
      const t = Date.now(), cols = Object.keys(out).filter(c => c !== 'aktif');
      const vals = cols.map(c => out[c]); if (tbl === 'jabatan') { cols.push('induk_id'); vals.push(induk && induk.id); }
      try {
        const r = await one(`INSERT INTO ${tbl} (kelompok,${cols.join(',')},aktif,dibuat,diubah) VALUES ($1,${cols.map((_, i) => '$' + (i + 2)).join(',')},$${cols.length + 2},$${cols.length + 3},$${cols.length + 3}) RETURNING id`, [k, ...vals, 'aktif' in b ? !!out.aktif : true, t]);
        await logBy(req, 'tambah', 'pengurus', `Menambah ${tbl} ${out.nama} (${k})`);
        res.status(201).json({ id: r.id });
      } catch (x) { if (U.isUnique(x)) throw err(409, `Nama ${tbl} sudah dipakai.`, { nama: 'Nama sudah dipakai.' }); throw x; }
    }));
    api.patch('/' + tbl + '/:id(\\d+)', M, ah(async (req, res) => {
      const id = +req.params.id, cur = await one(`SELECT * FROM ${tbl} WHERE id=$1`, [id]);
      if (!cur) throw err(404, 'Data tidak ditemukan.');
      const b = req.body || {}, { e, out } = U.readFields(b, def.spec, { partial: true });
      if ('nama' in out && !out.nama) e.nama = 'Nama wajib diisi.';
      if (tbl === 'periode') { const t0 = await one('SELECT mulai::text m, selesai::text s FROM periode WHERE id=$1', [id]); const m = { mulai: 'mulai' in out ? out.mulai : t0.m, selesai: 'selesai' in out ? out.selesai : t0.s }; if (m.mulai && m.selesai && m.selesai < m.mulai) e.selesai = 'Tanggal selesai tidak boleh sebelum tanggal mulai.'; }
      if (tbl === 'jabatan' && 'induk_id' in b) {
        if (b.induk_id) {
          const ind = parseInt(b.induk_id, 10);
          if (ind === id) e.induk_id = 'Jabatan tidak dapat menjadi atasan dirinya sendiri.';
          else if (!(await one('SELECT id FROM jabatan WHERE id=$1 AND kelompok=$2', [ind || 0, cur.kelompok]))) e.induk_id = 'Atasan tidak valid.';
          else { const cyc = await one('WITH RECURSIVE t AS (SELECT id, induk_id FROM jabatan WHERE id=$1 UNION SELECT j.id, j.induk_id FROM jabatan j JOIN t ON j.induk_id=t.id) SELECT 1 x FROM t WHERE id=$2', [id, ind]); if (cyc) e.induk_id = 'Atasan tidak boleh berupa bawahan jabatan ini (membentuk lingkaran).'; else out.induk_id = ind; }
        } else out.induk_id = null;
      }
      if (Object.keys(e).length) throw bad(e);
      const cols = Object.keys(out); if (!cols.length) return res.json({ ok: true });
      try { await db.q(`UPDATE ${tbl} SET ${cols.map((c, i) => c + '=$' + (i + 1)).join(',')}, diubah=$${cols.length + 1} WHERE id=$${cols.length + 2}`, [...cols.map(c => out[c]), Date.now(), id]); }
      catch (x) { if (U.isUnique(x)) throw err(409, `Nama ${tbl} sudah dipakai.`, { nama: 'Nama sudah dipakai.' }); throw x; }
      await logBy(req, 'ubah', 'pengurus', `Mengubah ${tbl} ${out.nama || cur.nama}`);
      res.json({ ok: true });
    }));
  }
  api.post('/jabatan/awal', M, ah(async (req, res) => {
    const k = kel(req); let n = 0;
    for (let i = 0; i < JABATAN_AWAL.length; i++) {
      const r = await db.q('INSERT INTO jabatan (kelompok,nama,urutan,dibuat,diubah) VALUES ($1,$2,$3,$4,$4) ON CONFLICT DO NOTHING RETURNING id', [k, JABATAN_AWAL[i], (i + 1) * 10, Date.now()]); n += r.length;
    }
    await logBy(req, 'tambah', 'pengurus', `Memuat ${n} jabatan awal (${k})`);
    res.json({ ditambahkan: n });
  }));

  // ===== pengurus =====
  const SPEC = {
    nama: ['str', 'Nama lengkap', { required: true, min: 2, max: 100 }], tugas: ['text', 'Tugas dan tanggung jawab', { max: 1000 }],
    tanggal_mulai: ['date', 'Tanggal mulai menjabat', {}], tanggal_selesai: ['date', 'Tanggal selesai menjabat', {}], keterangan: ['text', 'Keterangan', { max: 500 }], aktif: ['bool', 'Status aktif', {}]
  };
  const SEL = `p.id, p.kelompok, p.nama, p.jenis_kelamin, p.foto_berkas, p.tugas, p.tanggal_mulai::text tanggal_mulai, p.tanggal_selesai::text tanggal_selesai, p.keterangan, p.aktif, p.diarsipkan,
    p.jabatan_id, j.nama jabatan, p.divisi_id, d.nama divisi, p.periode_id, r.nama periode`;
  const FROM = 'FROM pengurus p LEFT JOIN jabatan j ON j.id=p.jabatan_id LEFT JOIN divisi d ON d.id=p.divisi_id LEFT JOIN periode r ON r.id=p.periode_id';
  const SORT = { nama: 'p.nama', jabatan: 'j.nama', divisi: 'd.nama', periode: 'r.nama', status: 'p.aktif' };

  async function refIds(b, k, e, cur) {
    const o = {};
    for (const [key, tbl, lbl] of [['jabatan_id', 'jabatan', 'Jabatan'], ['divisi_id', 'divisi', 'Divisi'], ['periode_id', 'periode', 'Periode']]) {
      if (cur && !(key in b)) continue;
      if (b[key] === null || b[key] === undefined || b[key] === '') { o[key] = null; continue; }
      const id = parseInt(b[key], 10), row = Number.isInteger(id) ? await one(`SELECT id, aktif FROM ${tbl} WHERE id=$1 AND kelompok=$2`, [id, k]) : null;
      if (!row) e[key] = lbl + ' tidak valid untuk kelompok ini.'; else o[key] = id;
    }
    return o;
  }
  const names = async (o) => { const r = {}; for (const [k, t] of [['jabatan_id', 'jabatan'], ['divisi_id', 'divisi'], ['periode_id', 'periode']]) r[t] = o[k] ? (await one(`SELECT nama FROM ${t} WHERE id=$1`, [o[k]])).nama : '—'; return r; };
  const riwayat = (q, id, req, ket) => q('INSERT INTO pengurus_riwayat (pengurus_id,waktu,keterangan,oleh) VALUES ($1,$2,$3,$4)', [id, Date.now(), ket, req.user.id]);

  api.get('/pengurus', M, ah(async (req, res) => {
    const k = kel(req), pg = U.pageOf(req.query), W = U.where();
    W.add('p.kelompok=?', k);
    const cari = U.str(req.query.q, 60); if (cari) W.add('p.nama ILIKE ?', '%' + U.likeEsc(cari) + '%');
    for (const [qk, col] of [['jabatan', 'p.jabatan_id'], ['divisi', 'p.divisi_id'], ['periode', 'p.periode_id']]) if (/^\d+$/.test(req.query[qk] || '')) W.add(col + '=?', +req.query[qk]);
    if (req.query.status === 'aktif') W.add('p.aktif'); else if (req.query.status === 'nonaktif') W.add('NOT p.aktif');
    if (req.query.arsip === 'arsip') W.add('p.diarsipkan'); else if (req.query.arsip !== 'semua') W.add('NOT p.diarsipkan');
    const total = await count(`SELECT COUNT(*)::int n ${FROM} ${W.sql}`, W.params());
    res.json({ rows: await db.q(`SELECT ${SEL} ${FROM} ${W.sql} ORDER BY ${U.orderBy(req.query, SORT, 'nama')}, p.id LIMIT ${pg.size} OFFSET ${pg.offset}`, W.params()), total, page: pg.page, size: pg.size });
  }));
  // Bagan: semua jabatan aktif + pengurus aktif (opsional per periode). Klien menyusun pohonnya.
  api.get('/pengurus/bagan', M, ah(async (req, res) => {
    const k = kel(req), W = U.where(); W.add('p.kelompok=?', k); W.add('p.aktif'); W.add('NOT p.diarsipkan');
    if (/^\d+$/.test(req.query.periode || '')) W.add('p.periode_id=?', +req.query.periode);
    res.json({
      jabatan: await db.q('SELECT id, nama, induk_id, urutan FROM jabatan WHERE kelompok=$1 AND aktif ORDER BY urutan, nama', [k]),
      pengurus: await db.q(`SELECT p.id, p.nama, p.foto_berkas, p.jabatan_id, d.nama divisi ${FROM} ${W.sql} ORDER BY p.nama`, W.params())
    });
  }));
  api.get('/pengurus/:id(\\d+)', M, ah(async (req, res) => {
    const id = +req.params.id, p = (await db.q(`SELECT ${SEL} ${FROM} WHERE p.id=$1`, [id]))[0];
    if (!p) return res.status(404).json({ error: 'Pengurus tidak ditemukan.' });
    res.json({ pengurus: p, riwayat: await db.q('SELECT h.id, h.waktu, h.keterangan, u.username oleh FROM pengurus_riwayat h LEFT JOIN users u ON u.id=h.oleh WHERE h.pengurus_id=$1 ORDER BY h.id DESC', [id]) });
  }));
  api.post('/pengurus', M, ah(async (req, res) => {
    const k = kel(req), b = req.body || {}, { e, out } = U.readFields(b, SPEC, { partial: false });
    const ids = await refIds(b, k, e, null);
    if (!ids.jabatan_id && !e.jabatan_id) e.jabatan_id = 'Jabatan wajib dipilih. Tambahkan jabatan terlebih dahulu bila belum ada.';
    if (out.tanggal_mulai && out.tanggal_selesai && out.tanggal_selesai < out.tanggal_mulai) e.tanggal_selesai = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
    if (Object.keys(e).length) throw bad(e);
    const nm = await names(ids);
    const id = await db.tx(async q => {
      const r = await q('INSERT INTO pengurus (kelompok,jenis_kelamin,nama,tugas,tanggal_mulai,tanggal_selesai,keterangan,aktif,jabatan_id,divisi_id,periode_id,dibuat,diubah) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING id',
        [k, k === 'putra' ? 'L' : 'P', out.nama, out.tugas, out.tanggal_mulai, out.tanggal_selesai, out.keterangan, 'aktif' in b ? !!out.aktif : true, ids.jabatan_id, ids.divisi_id, ids.periode_id, Date.now()]);
      await riwayat(q, r[0].id, req, `Diangkat sebagai ${nm.jabatan}${ids.divisi_id ? ', divisi ' + nm.divisi : ''}${ids.periode_id ? ', periode ' + nm.periode : ''}`);
      return r[0].id;
    });
    await logBy(req, 'tambah', 'pengurus', `Menambah pengurus ${out.nama} (${k})`);
    res.status(201).json({ id });
  }));
  api.patch('/pengurus/:id(\\d+)', M, ah(async (req, res) => {
    const id = +req.params.id, b = req.body || {};
    const cur = (await db.q(`SELECT ${SEL} ${FROM} WHERE p.id=$1`, [id]))[0];
    if (!cur) throw err(404, 'Pengurus tidak ditemukan.');
    if (cur.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu.');
    const { e, out } = U.readFields(b, SPEC, { partial: true });
    if ('nama' in out && !out.nama) e.nama = 'Nama wajib diisi.';
    const ids = await refIds(b, cur.kelompok, e, cur);
    if ('jabatan_id' in ids && !ids.jabatan_id && !e.jabatan_id) e.jabatan_id = 'Jabatan wajib dipilih.';
    const m = { tm: 'tanggal_mulai' in out ? out.tanggal_mulai : cur.tanggal_mulai, ts: 'tanggal_selesai' in out ? out.tanggal_selesai : cur.tanggal_selesai };
    if (m.tm && m.ts && m.ts < m.tm) e.tanggal_selesai = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
    if (Object.keys(e).length) throw bad(e);
    const all = { ...out, ...ids }, cols = Object.keys(all);
    const ket = [];
    if ('jabatan_id' in ids && ids.jabatan_id !== cur.jabatan_id) { ket.push(`jabatan ${cur.jabatan || '—'} → ${(await names({ jabatan_id: ids.jabatan_id })).jabatan}`); }
    if ('divisi_id' in ids && ids.divisi_id !== cur.divisi_id) ket.push(`divisi ${cur.divisi || '—'} → ${(await names({ divisi_id: ids.divisi_id })).divisi}`);
    if ('periode_id' in ids && ids.periode_id !== cur.periode_id) ket.push(`periode ${cur.periode || '—'} → ${(await names({ periode_id: ids.periode_id })).periode}`);
    if ('aktif' in out && out.aktif !== cur.aktif) ket.push(out.aktif ? 'diaktifkan' : 'dinonaktifkan');
    if ('tanggal_selesai' in out && out.tanggal_selesai !== cur.tanggal_selesai) ket.push('tanggal selesai menjabat ' + (out.tanggal_selesai || 'dihapus'));
    if (!cols.length) return res.json({ ok: true });
    await db.tx(async q => {
      await q(`UPDATE pengurus SET ${cols.map((c, i) => c + '=$' + (i + 1)).join(',')}, diubah=$${cols.length + 1} WHERE id=$${cols.length + 2}`, [...cols.map(c => all[c]), Date.now(), id]);
      if (ket.length) await riwayat(q, id, req, 'Perubahan: ' + ket.join('; '));
    });
    await logBy(req, 'ubah', 'pengurus', `Mengubah pengurus ${out.nama || cur.nama}${ket.length ? ': ' + ket.join('; ') : ''}`);
    res.json({ ok: true });
  }));
  async function arsip(req, res, want) {
    confirm(req); const id = +req.params.id, cur = await one('SELECT id, nama, diarsipkan, aktif FROM pengurus WHERE id=$1', [id]);
    if (!cur) throw err(404, 'Pengurus tidak ditemukan.');
    if (cur.diarsipkan === want) throw err(409, want ? 'Sudah diarsipkan.' : 'Tidak sedang diarsipkan.');
    await db.tx(async q => { await q('UPDATE pengurus SET diarsipkan=$1, aktif=CASE WHEN $1 THEN FALSE ELSE aktif END, diubah=$2 WHERE id=$3', [want, Date.now(), id]); await riwayat(q, id, req, want ? 'Diarsipkan' : 'Dipulihkan dari arsip'); });
    await logBy(req, want ? 'arsip' : 'pulihkan', 'pengurus', `${want ? 'Mengarsipkan' : 'Memulihkan'} pengurus ${cur.nama}`);
    res.json({ ok: true });
  }
  api.post('/pengurus/:id(\\d+)/arsip', M, ah((q, s) => arsip(q, s, true)));
  api.post('/pengurus/:id(\\d+)/pulihkan', M, ah((q, s) => arsip(q, s, false)));
  api.put('/pengurus/:id(\\d+)/foto', M, ah(async (req, res) => {
    const id = +req.params.id, f = readUpload(req.body, { pdf: false }); if (f.error) throw bad({ berkas: f.error });
    const cur = await one('SELECT id, nama, foto_berkas, diarsipkan FROM pengurus WHERE id=$1', [id]); if (!cur) throw err(404, 'Pengurus tidak ditemukan.');
    if (cur.diarsipkan) throw err(409, 'Data diarsipkan. Pulihkan terlebih dahulu.');
    await db.tx(async q => { const nid = await simpan(q, 'foto_pengurus', f, req.user.id); await q('UPDATE pengurus SET foto_berkas=$1, diubah=$2 WHERE id=$3', [nid, Date.now(), id]); await buang(q, cur.foto_berkas); await riwayat(q, id, req, 'Foto diperbarui'); });
    await logBy(req, 'unggah_dokumen', 'pengurus', `Mengunggah foto pengurus ${cur.nama}`);
    res.json({ ok: true });
  }));
}
module.exports = { register, JABATAN_AWAL };
