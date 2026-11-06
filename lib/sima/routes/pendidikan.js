'use strict';
// Modul Pendidikan (hanya Super Admin; Bendahara & Keamanan ditolak di API dan tidak punya hak DB pada edu_*).
// Tidak ada data bawaan selain 4 status presensi yang disebut pada ketentuan. Semua master diatur Super Admin.
const U = require('../util');
const { bad, jkt, iso } = require('./keuangan');
const DEF = { presensi_pengajar: false, cek_ruang: true, nilai: { min: 0, max: 100 }, identitas: { nama: 'Pondok Pesantren Alhidayah Induk', alamat: '', kontak: '', catatan: '' } };
const idOf = v => { const n = parseInt(v, 10); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const chk = e => { if (Object.keys(e).length) throw bad('Data belum valid.', e); };
const needK = b => { if (b.konfirmasi !== true) throw bad('Konfirmasi diperlukan untuk tindakan ini.'); };
const needAlasan = (v, key = 'alasan') => { const a = U.text(v, 500); if (a.length < 5) throw bad('Alasan wajib diisi (minimal 5 karakter).', { [key]: 'Alasan wajib diisi (minimal 5 karakter).' }); return a; };
const timeOk = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim());
const todayWib = () => iso(jkt());

function register(api, { db, auth, logBy, ah }) {
  const mod = auth.requireModule('pendidikan');
  const lg = (req, aksi, ket) => logBy(req, aksi, 'pendidikan', ket);
  const aud = (q, req, entitas, id, aksi, ket, alasan, sebelum, sesudah) => q('INSERT INTO edu_audit (waktu,user_id,username,entitas,entitas_id,aksi,ket,alasan,sebelum,sesudah) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [Date.now(), req.user.id, req.user.username, entitas, id, aksi, String(ket || '').slice(0, 300), alasan || null, sebelum ? JSON.stringify(sebelum) : null, sesudah ? JSON.stringify(sesudah) : null]);
  const dbErr = err => {
    if (err && err.code === '23505') throw bad('Data yang sama sudah ada (nama/kode ganda atau catatan ganda).', null, 409);
    if (err && err.code === '23503') throw bad('Data terkait tidak ditemukan.', null, 400);
    if (err && err.code === '23514') throw bad('Data tidak memenuhi aturan (cek tanggal/jam/nilai).', null, 400);
    throw err;
  };
  const wrap = fn => ah(async (req, res) => { try { await fn(req, res); } catch (e) { if (e && e.code && /^23/.test(String(e.code))) dbErr(e); throw e; } });
  async function setting(q, key) { const r = (await q('SELECT nilai FROM edu_pengaturan WHERE kunci=$1', [key]))[0]; return r ? r.nilai : DEF[key]; }
  const pick = (o, keys) => keys.reduce((a, k) => (a[k] = o[k] === undefined ? null : o[k], a), {});
  const diff = (a, b, keys) => { const s = {}, d = {}; keys.forEach(k => { const x = a[k] == null ? null : String(a[k]), y = b[k] == null ? null : String(b[k]); if (x !== y) { s[k] = a[k] == null ? null : a[k]; d[k] = b[k] == null ? null : b[k]; } }); return [s, d]; };

  // ---------- pembaca isian generik ----------
  // spec: [kunci, tipe, label, opsi]; tipe: str|text|int|id|date|enum|bool|time
  function readSpec(b, spec, partial) {
    const e = {}, o = {};
    for (const [k, t, label, op] of spec) {
      op === undefined; const opt = op || {}; if (partial && !(k in b)) continue; const v = b[k];
      if (t === 'bool') { o[k] = v === true || v === 'true' || v === 1 || v === '1'; continue; }
      const empty = v == null || (typeof v === 'string' && !v.trim());
      if (empty) { if (opt.req) e[k] = label + ' wajib diisi.'; o[k] = null; continue; }
      if (t === 'str') { o[k] = U.str(v, opt.max || 150); if (opt.min && o[k].length < opt.min) e[k] = label + ' terlalu pendek.'; }
      else if (t === 'text') o[k] = U.text(v, opt.max || 1000);
      else if (t === 'int') { const n = Number(v); if (!Number.isInteger(n) || n < (opt.min == null ? 0 : opt.min) || n > (opt.max || 1e6)) e[k] = label + ' tidak valid.'; else o[k] = n; }
      else if (t === 'id') { o[k] = idOf(v); if (!o[k]) e[k] = label + ' tidak valid.'; }
      else if (t === 'date') { if (!U.isDate(String(v))) e[k] = label + ' tidak valid.'; else o[k] = String(v); }
      else if (t === 'time') { if (!timeOk(v)) e[k] = label + ' tidak valid (HH:MM).'; else o[k] = String(v).trim(); }
      else if (t === 'enum') { if (!opt.values.includes(v)) e[k] = label + ' tidak valid.'; else o[k] = v; }
    }
    chk(e); return o;
  }
  // ---------- master data generik ----------
  function master(path, tbl, spec, o) {
    const keys = spec.map(s => s[0]), entitas = o.entitas || path, hasUbah = !!o.diubah;
    api.get('/pendidikan/' + path, mod, wrap(async (req, res) => {
      const w = U.where(), s = U.str(req.query.q || '', 80), pg = U.pageOf(req.query);
      if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(x.nama ILIKE ${ph})`); }
      if (req.query.aktif === '1') w.add('x.aktif'); if (req.query.aktif === '0') w.add('NOT x.aktif');
      for (const f of (o.filters || [])) if (idOf(req.query[f])) w.add(`x.${f} = ?`, idOf(req.query[f]));
      const total = Number((await db.q(`SELECT COUNT(*) n FROM ${tbl} x ${w.sql}`, w.params()))[0].n);
      res.json({ total, page: pg.page, size: pg.size, rows: await db.q(`${o.select} ${w.sql} ORDER BY ${o.order || 'lower(x.nama)'} LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) });
    }));
    api.post('/pendidikan/' + path, mod, wrap(async (req, res) => {
      const b = req.body || {}, v = readSpec(b, spec, false);
      if (o.before) await o.before(v, null);
      const r = await db.tx(async q => {
        const cols = keys.concat(['dibuat'].concat(hasUbah ? ['diubah'] : [])), vals = keys.map(k => v[k]).concat([Date.now()].concat(hasUbah ? [Date.now()] : []));
        const x = (await q(`INSERT INTO ${tbl} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`, vals))[0];
        await aud(q, req, entitas, x.id, 'tambah', `Menambah ${o.label}: ${v.nama || v.kode || x.id}`, null, null, v); return x;
      });
      await lg(req, 'tambah', `Menambah ${o.label}: ${v.nama || ''}`); res.status(201).json({ id: r.id });
    }));
    api.patch('/pendidikan/' + path + '/:id(\\d+)', mod, wrap(async (req, res) => {
      const id = idOf(req.params.id), b = req.body || {}, v = readSpec(b, spec.concat([['aktif', 'bool', 'Status']]), true);
      if (!Object.keys(v).length) throw bad('Tidak ada perubahan.');
      await db.tx(async q => {
        const old = (await q(`SELECT * FROM ${tbl} WHERE id=$1 FOR UPDATE`, [id]))[0]; if (!old) throw bad('Data tidak ditemukan.', null, 404);
        const ks = Object.keys(v), [sb, sd] = diff(old, Object.assign({}, old, v), ks); if (!Object.keys(sd).length) throw bad('Tidak ada perubahan.');
        if (o.before) await o.before(Object.assign({}, old, v), old, q);
        await q(`UPDATE ${tbl} SET ${ks.map((k, i) => `${k}=$${i + 1}`).join(',')}${hasUbah ? `, diubah=${Date.now()}` : ''} WHERE id=$${ks.length + 1}`, ks.map(k => v[k]).concat([id]));
        await aud(q, req, entitas, id, 'ubah', `Mengubah ${o.label} #${id}`, U.textOrNull(b.alasan, 300), sb, sd);
      });
      await lg(req, 'ubah', `Mengubah ${o.label} #${id}`); res.json({ ok: true });
    }));
  }
  const NAMA = ['nama', 'str', 'Nama', { req: true, min: 2, max: 150 }];
  master('jenis', 'edu_jenis', [NAMA, ['deskripsi', 'text', 'Deskripsi', { max: 500 }], ['keterangan', 'text', 'Keterangan', { max: 500 }], ['mode_nilai', 'enum', 'Sistem penilaian', { values: ['angka', 'capaian', 'campuran'], req: true }]], { label: 'jenis pendidikan', select: 'SELECT x.id, x.nama, x.deskripsi, x.keterangan, x.mode_nilai, x.aktif FROM edu_jenis x' });
  master('periode', 'edu_periode', [NAMA, ['mulai', 'date', 'Tanggal mulai'], ['selesai', 'date', 'Tanggal selesai'], ['keterangan', 'text', 'Keterangan', { max: 300 }]], { label: 'periode', select: 'SELECT x.id, x.nama, x.mulai::text AS mulai, x.selesai::text AS selesai, x.keterangan, x.aktif FROM edu_periode x', order: 'x.mulai DESC NULLS LAST, x.id DESC' });
  master('tingkat', 'edu_tingkat', [['nama', 'str', 'Nama tingkat', { req: true, max: 100 }], ['jenis_id', 'id', 'Jenis pendidikan']], { label: 'tingkat', select: 'SELECT x.id, x.nama, x.jenis_id, j.nama AS jenis, x.aktif FROM edu_tingkat x LEFT JOIN edu_jenis j ON j.id = x.jenis_id', filters: ['jenis_id'] });
  master('materi', 'edu_materi', [['kode', 'str', 'Kode', { max: 30 }], NAMA, ['jenis_id', 'id', 'Jenis pendidikan', { req: true }], ['kitab', 'str', 'Nama kitab', { max: 150 }], ['jilid', 'str', 'Jilid', { max: 50 }], ['tingkat', 'str', 'Tingkat materi', { max: 100 }], ['deskripsi', 'text', 'Deskripsi', { max: 500 }]],
    { label: 'materi', select: 'SELECT x.id, x.kode, x.nama, x.jenis_id, j.nama AS jenis, x.kitab, x.jilid, x.tingkat, x.deskripsi, x.aktif FROM edu_materi x JOIN edu_jenis j ON j.id = x.jenis_id', filters: ['jenis_id'] });
  master('status-presensi', 'edu_status_presensi', [NAMA, ['dihitung_hadir', 'bool', 'Dihitung hadir'], ['urutan', 'int', 'Urutan', { min: 0, max: 99 }]], { label: 'status presensi', entitas: 'status_presensi', select: 'SELECT x.id, x.nama, x.dihitung_hadir, x.urutan, x.aktif FROM edu_status_presensi x', order: 'x.urutan, x.id' });
  master('jenis-evaluasi', 'edu_jenis_evaluasi', [NAMA], { label: 'jenis evaluasi', entitas: 'jenis_evaluasi', select: 'SELECT x.id, x.nama, x.aktif FROM edu_jenis_evaluasi x' });
  master('kelas', 'edu_kelas', [['nama', 'str', 'Nama kelas/kelompok', { req: true, max: 100 }], ['jenis_id', 'id', 'Jenis pendidikan', { req: true }], ['tingkat', 'str', 'Tingkat/jenjang', { max: 100 }], ['pengajar_id', 'id', 'Pengajar/penanggung jawab'], ['kapasitas', 'int', 'Kapasitas', { min: 1, max: 10000 }], ['periode_id', 'id', 'Periode'], ['keterangan', 'text', 'Keterangan', { max: 500 }]],
    { label: 'kelas', diubah: true, filters: ['jenis_id', 'periode_id', 'pengajar_id'], select: `SELECT x.id, x.nama, x.jenis_id, j.nama AS jenis, x.tingkat, x.pengajar_id, pg.nama AS pengajar, x.kapasitas, x.periode_id, pr.nama AS periode, x.keterangan, x.aktif,
      (SELECT COUNT(*)::int FROM edu_peserta p JOIN santri s ON s.id=p.santri_id WHERE p.kelas_id=x.id AND p.status='aktif' AND s.status='aktif' AND NOT s.diarsipkan) AS jumlah_peserta
      FROM edu_kelas x JOIN edu_jenis j ON j.id = x.jenis_id LEFT JOIN pengajar pg ON pg.id = x.pengajar_id LEFT JOIN edu_periode pr ON pr.id = x.periode_id` });
  // muat contoh awal (aksi eksplisit Super Admin, bukan data bawaan)
  const AWAL = { 'jenis/awal': ['edu_jenis', ['Madrasah Diniyah', "Madrasah Qur'an", 'Amtsilati', 'Tahfidz', 'Kegiatan pendidikan lainnya'], 'jenis pendidikan'], 'jenis-evaluasi/awal': ['edu_jenis_evaluasi', ['Tugas', 'Ujian', 'Praktik', 'Hafalan', 'Setoran', 'Evaluasi lainnya'], 'jenis evaluasi'] };
  for (const [p, [tbl, names, label]] of Object.entries(AWAL)) api.post('/pendidikan/' + p, mod, wrap(async (req, res) => {
    needK(req.body || {}); let n = 0;
    await db.tx(async q => { for (const nm of names) { const r = await q(`INSERT INTO ${tbl} (nama,dibuat) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id`, [nm, Date.now()]); if (r.length) { n++; await aud(q, req, p.split('/')[0].replace('-', '_'), r[0].id, 'tambah', `Memuat contoh ${label}: ${nm}`, null, null, { nama: nm }); } } });
    await lg(req, 'tambah', `Memuat contoh ${label} awal (${n})`); res.json({ ditambahkan: n });
  }));

  // ---------- referensi ----------
  api.get('/pendidikan/ref', mod, wrap(async (req, res) => res.json({
    jenis: await db.q('SELECT id, nama, mode_nilai FROM edu_jenis WHERE aktif ORDER BY lower(nama)'), periode: await db.q('SELECT id, nama FROM edu_periode WHERE aktif ORDER BY mulai DESC NULLS LAST, id DESC'),
    tingkat: await db.q('SELECT id, nama, jenis_id FROM edu_tingkat WHERE aktif ORDER BY lower(nama)'), materi: await db.q('SELECT id, kode, nama, jenis_id, kitab, jilid FROM edu_materi WHERE aktif ORDER BY lower(nama)'),
    kelas: await db.q('SELECT k.id, k.nama, k.jenis_id, j.nama AS jenis, k.pengajar_id, k.periode_id, k.kapasitas FROM edu_kelas k JOIN edu_jenis j ON j.id=k.jenis_id WHERE k.aktif ORDER BY lower(k.nama)'),
    status_presensi: await db.q('SELECT id, nama, dihitung_hadir FROM edu_status_presensi WHERE aktif ORDER BY urutan, id'), jenis_evaluasi: await db.q('SELECT id, nama FROM edu_jenis_evaluasi WHERE aktif ORDER BY lower(nama)'),
    pengajar: await db.q('SELECT id, nama, bidang FROM pengajar WHERE aktif AND NOT diarsipkan ORDER BY lower(nama)'), asrama: await db.q("SELECT DISTINCT asrama_id AS id, asrama AS nama FROM v_santri_edu WHERE asrama_id IS NOT NULL ORDER BY asrama"),
    pengaturan: { presensi_pengajar: await setting(db.q.bind(db), 'presensi_pengajar'), nilai: await setting(db.q.bind(db), 'nilai'), cek_ruang: await setting(db.q.bind(db), 'cek_ruang') } })));
  api.get('/pendidikan/cari-santri', mod, wrap(async (req, res) => {
    const s = U.str(req.query.q || '', 80);
    res.json({ rows: await db.q(`SELECT id, nis, nama, kelompok, asrama, kamar FROM v_santri_edu WHERE status='aktif' AND NOT diarsipkan ${s ? 'AND (nama ILIKE $1 OR nis ILIKE $1)' : ''} ORDER BY nama LIMIT 15`, s ? ['%' + U.likeEsc(s) + '%'] : []) });
  }));
  api.get('/pendidikan/cari-pengajar', mod, wrap(async (req, res) => res.json({ rows: await db.q('SELECT id, nama, bidang FROM pengajar WHERE aktif AND NOT diarsipkan ORDER BY lower(nama)') })));

  // ---------- peserta didik ----------
  const PES = `SELECT p.id, p.kelas_id, k.nama AS kelas, k.jenis_id, j.nama AS jenis, p.santri_id, s.nis, s.nama, s.kelompok, s.asrama, s.kamar, p.mulai::text AS mulai, p.selesai::text AS selesai, p.status, p.alasan,
    CASE WHEN p.status = 'aktif' AND (s.status <> 'aktif' OR s.diarsipkan) THEN 'nonaktif' ELSE p.status END AS status_tampil, s.status AS status_santri
    FROM edu_peserta p JOIN v_santri_edu s ON s.id=p.santri_id JOIN edu_kelas k ON k.id=p.kelas_id JOIN edu_jenis j ON j.id=k.jenis_id`;
  api.get('/pendidikan/peserta', mod, wrap(async (req, res) => {
    const qs = req.query, w = U.where(), s = U.str(qs.q || '', 80), pg = U.pageOf(qs);
    if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(s.nama ILIKE ${ph} OR s.nis ILIKE ${ph})`); }
    if (idOf(qs.kelas_id)) w.add('p.kelas_id = ?', idOf(qs.kelas_id)); if (idOf(qs.jenis_id)) w.add('k.jenis_id = ?', idOf(qs.jenis_id)); if (['putra', 'putri'].includes(qs.kelompok)) w.add('s.kelompok = ?', qs.kelompok); if (idOf(qs.asrama_id)) w.add('s.asrama_id = ?', idOf(qs.asrama_id)); if (idOf(qs.santri_id)) w.add('p.santri_id = ?', idOf(qs.santri_id));
    const st = qs.status || 'aktif'; if (st === 'aktif') w.add("p.status = 'aktif' AND s.status = 'aktif' AND NOT s.diarsipkan"); else if (st === 'nonaktif') w.add("p.status = 'aktif' AND (s.status <> 'aktif' OR s.diarsipkan)"); else if (['pindah', 'keluar'].includes(st)) w.add('p.status = ?', st);
    const total = Number((await db.q(`SELECT COUNT(*) n FROM edu_peserta p JOIN v_santri_edu s ON s.id=p.santri_id JOIN edu_kelas k ON k.id=p.kelas_id ${w.sql}`, w.params()))[0].n);
    res.json({ total, page: pg.page, size: pg.size, rows: await db.q(`${PES} ${w.sql} ORDER BY s.nama, p.id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) });
  }));
  async function tambahPeserta(q, req, kelasId, santri, mulai) {
    const k = (await q('SELECT id, nama, kapasitas, aktif FROM edu_kelas WHERE id=$1 FOR UPDATE', [kelasId]))[0]; if (!k || !k.aktif) throw bad('Kelas tidak tersedia atau nonaktif.', { kelas_id: 'Kelas tidak tersedia.' });
    if (santri.status !== 'aktif' || santri.diarsipkan) throw bad(`${santri.nama}: bukan santri aktif (alumni/diarsipkan) sehingga tidak dapat menjadi peserta.`, { santri_id: 'Santri bukan santri aktif.' }, 409);
    if ((await q("SELECT 1 FROM edu_peserta WHERE kelas_id=$1 AND santri_id=$2 AND status='aktif'", [kelasId, santri.id])).length) throw bad(`${santri.nama} sudah menjadi peserta aktif di kelas ini.`, null, 409);
    if (k.kapasitas) { const n = (await q("SELECT COUNT(*)::int n FROM edu_peserta p JOIN santri s ON s.id=p.santri_id WHERE p.kelas_id=$1 AND p.status='aktif' AND s.status='aktif' AND NOT s.diarsipkan", [kelasId]))[0].n; if (n >= k.kapasitas) throw bad(`Kapasitas kelas ${k.nama} (${k.kapasitas}) sudah penuh.`, null, 409); }
    const x = (await q('INSERT INTO edu_peserta (kelas_id,santri_id,mulai,dibuat,oleh,diubah) VALUES ($1,$2,$3,$4,$5,$4) RETURNING id', [kelasId, santri.id, mulai, Date.now(), req.user.id]))[0];
    await aud(q, req, 'peserta', x.id, 'tambah', `Menambahkan ${santri.nama} ke ${k.nama}`, null, null, { kelas_id: kelasId, santri_id: santri.id, mulai }); return x.id;
  }
  api.post('/pendidikan/peserta', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const kelasId = idOf(b.kelas_id), e = {}; if (!kelasId) e.kelas_id = 'Kelas wajib dipilih.';
    const mulai = b.mulai ? String(b.mulai) : todayWib(); if (!U.isDate(mulai)) e.mulai = 'Tanggal mulai tidak valid.';
    const ids = (Array.isArray(b.santri_ids) ? b.santri_ids : [b.santri_id]).map(idOf).filter(Boolean); if (!ids.length) e.santri_id = 'Pilih minimal satu santri.'; chk(e);
    const n = await db.tx(async q => { let c = 0; for (const id of [...new Set(ids)]) { const s = (await q('SELECT id, nama, status, diarsipkan FROM v_santri_edu WHERE id=$1', [id]))[0]; if (!s) throw bad('Santri tidak ditemukan.', { santri_id: 'Santri tidak ditemukan.' }); await tambahPeserta(q, req, kelasId, s, mulai); c++; } return c; });
    await lg(req, 'tambah', `Menambahkan ${n} peserta ke kelas #${kelasId}`); res.status(201).json({ ditambahkan: n });
  }));
  api.post('/pendidikan/peserta/impor', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const kelasId = idOf(b.kelas_id); if (!kelasId) throw bad('Kelas wajib dipilih.', { kelas_id: 'Kelas wajib dipilih.' });
    const list = [...new Set(String(b.nis || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean))].slice(0, 500); if (!list.length) throw bad('Tempel daftar NIS (dipisah baris/koma).', { nis: 'Daftar NIS kosong.' });
    const hasil = { berhasil: 0, dilewati: [] };
    for (const nis of list) {
      try { await db.tx(async q => { const s = (await q('SELECT id, nama, status, diarsipkan FROM v_santri_edu WHERE nis=$1', [nis]))[0]; if (!s) throw bad('NIS tidak ditemukan.'); await tambahPeserta(q, req, kelasId, s, todayWib()); }); hasil.berhasil++; }
      catch (err) { if (err.http || err.code) hasil.dilewati.push({ nis, alasan: err.message || 'Gagal.' }); else throw err; }
    }
    await lg(req, 'impor', `Impor peserta kelas #${kelasId}: ${hasil.berhasil} berhasil, ${hasil.dilewati.length} dilewati`); res.json(hasil);
  }));
  api.post('/pendidikan/peserta/:id(\\d+)/pindah', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const ke = idOf(b.kelas_id); if (!ke) throw bad('Kelas tujuan wajib dipilih.', { kelas_id: 'Kelas tujuan wajib dipilih.' }); const alasan = needAlasan(b.alasan);
    await db.tx(async q => {
      const p = (await q('SELECT p.*, s.nama AS snama, s.status AS sstatus, s.diarsipkan FROM edu_peserta p JOIN santri s ON s.id=p.santri_id WHERE p.id=$1 FOR UPDATE OF p', [id]))[0]; if (!p) throw bad('Data peserta tidak ditemukan.', null, 404);
      if (p.status !== 'aktif') throw bad('Hanya peserta aktif yang dapat dipindahkan.', null, 409); if (p.kelas_id === ke) throw bad('Kelas tujuan sama dengan kelas asal.', { kelas_id: 'Pilih kelas yang berbeda.' });
      const t = todayWib(); await q("UPDATE edu_peserta SET status='pindah', selesai=GREATEST($1::date, mulai), alasan=$2, diubah=$3 WHERE id=$4", [t, alasan, Date.now(), id]);
      const nid = await tambahPeserta(q, req, ke, { id: p.santri_id, nama: p.snama, status: p.sstatus, diarsipkan: p.diarsipkan }, t); await q('UPDATE edu_peserta SET pindah_dari=$1 WHERE id=$2', [id, nid]);
      await aud(q, req, 'peserta', id, 'pindah', `Memindahkan ${p.snama} dari kelas #${p.kelas_id} ke #${ke}`, alasan, { kelas_id: p.kelas_id }, { kelas_id: ke });
    });
    await lg(req, 'pindah', `Memindahkan peserta #${id} ke kelas #${ke}`); res.json({ ok: true });
  }));
  api.post('/pendidikan/peserta/:id(\\d+)/keluar', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const alasan = needAlasan(b.alasan);
    await db.tx(async q => {
      const p = (await q('SELECT p.*, s.nama AS snama FROM edu_peserta p JOIN santri s ON s.id=p.santri_id WHERE p.id=$1 FOR UPDATE OF p', [id]))[0]; if (!p) throw bad('Data peserta tidak ditemukan.', null, 404); if (p.status !== 'aktif') throw bad('Peserta sudah tidak aktif di kelas ini.', null, 409);
      await q("UPDATE edu_peserta SET status='keluar', selesai=GREATEST($1::date, mulai), alasan=$2, diubah=$3 WHERE id=$4", [todayWib(), alasan, Date.now(), id]); await aud(q, req, 'peserta', id, 'keluar', `Mengeluarkan ${p.snama} dari kelas #${p.kelas_id}`, alasan, { status: 'aktif' }, { status: 'keluar' });
    });
    await lg(req, 'keluar', `Mengeluarkan peserta #${id}`); res.json({ ok: true });
  }));

  // ---------- penugasan pengajar ----------
  const PNG = `SELECT t.id, t.pengajar_id, pg.nama AS pengajar, t.jenis_id, j.nama AS jenis, t.materi_id, m.nama AS materi, t.kelas_id, k.nama AS kelas, t.periode_id, pr.nama AS periode, t.mulai::text AS mulai, t.selesai::text AS selesai, t.status, t.keterangan, t.alasan_akhir
    FROM edu_penugasan t JOIN pengajar pg ON pg.id=t.pengajar_id JOIN edu_jenis j ON j.id=t.jenis_id LEFT JOIN edu_materi m ON m.id=t.materi_id LEFT JOIN edu_kelas k ON k.id=t.kelas_id LEFT JOIN edu_periode pr ON pr.id=t.periode_id`;
  api.get('/pendidikan/penugasan', mod, wrap(async (req, res) => {
    const qs = req.query, w = U.where(), pg = U.pageOf(qs), s = U.str(qs.q || '', 80); if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`pg.nama ILIKE ${ph}`); }
    for (const [k, c] of [['pengajar_id', 't.pengajar_id'], ['jenis_id', 't.jenis_id'], ['kelas_id', 't.kelas_id'], ['materi_id', 't.materi_id']]) if (idOf(qs[k])) w.add(`${c} = ?`, idOf(qs[k])); if (['aktif', 'selesai', 'dibatalkan'].includes(qs.status)) w.add('t.status = ?', qs.status);
    const total = Number((await db.q(`SELECT COUNT(*) n FROM edu_penugasan t JOIN pengajar pg ON pg.id=t.pengajar_id ${w.sql}`, w.params()))[0].n);
    res.json({ total, page: pg.page, size: pg.size, rows: await db.q(`${PNG} ${w.sql} ORDER BY t.id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) });
  }));
  api.post('/pendidikan/penugasan', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b);
    const v = readSpec(b, [['pengajar_id', 'id', 'Pengajar', { req: true }], ['jenis_id', 'id', 'Jenis pendidikan', { req: true }], ['materi_id', 'id', 'Materi'], ['kelas_id', 'id', 'Kelas'], ['periode_id', 'id', 'Periode'], ['mulai', 'date', 'Tanggal mulai', { req: true }], ['selesai', 'date', 'Tanggal selesai'], ['keterangan', 'text', 'Keterangan', { max: 500 }]], false);
    if (v.selesai && v.selesai < v.mulai) throw bad('Tanggal selesai sebelum tanggal mulai.', { selesai: 'Tanggal selesai sebelum mulai.' });
    const r = await db.tx(async q => {
      const pg = (await q('SELECT nama, aktif, diarsipkan FROM pengajar WHERE id=$1', [v.pengajar_id]))[0]; if (!pg || !pg.aktif || pg.diarsipkan) throw bad('Pengajar tidak aktif atau tidak ditemukan.', { pengajar_id: 'Pengajar tidak tersedia.' });
      if ((await q("SELECT 1 FROM edu_penugasan WHERE status='aktif' AND pengajar_id=$1 AND jenis_id=$2 AND COALESCE(materi_id,0)=COALESCE($3::bigint,0) AND COALESCE(kelas_id,0)=COALESCE($4::bigint,0)", [v.pengajar_id, v.jenis_id, v.materi_id, v.kelas_id])).length) throw bad('Penugasan aktif yang sama sudah ada untuk pengajar ini.', null, 409);
      const x = (await q('INSERT INTO edu_penugasan (pengajar_id,jenis_id,materi_id,kelas_id,periode_id,mulai,selesai,keterangan,dibuat,oleh,diubah) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$9) RETURNING id', [v.pengajar_id, v.jenis_id, v.materi_id, v.kelas_id, v.periode_id, v.mulai, v.selesai, v.keterangan, Date.now(), req.user.id]))[0];
      await aud(q, req, 'penugasan', x.id, 'tambah', `Menugaskan ${pg.nama}`, null, null, v); return x;
    });
    await lg(req, 'tambah', `Penugasan pengajar #${v.pengajar_id}`); res.status(201).json({ id: r.id });
  }));
  api.post('/pendidikan/penugasan/:id(\\d+)/akhiri', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const alasan = needAlasan(b.alasan), st = b.status === 'dibatalkan' ? 'dibatalkan' : 'selesai';
    await db.tx(async q => { const t = (await q('SELECT * FROM edu_penugasan WHERE id=$1 FOR UPDATE', [id]))[0]; if (!t) throw bad('Penugasan tidak ditemukan.', null, 404); if (t.status !== 'aktif') throw bad('Penugasan sudah tidak aktif.', null, 409);
      await q('UPDATE edu_penugasan SET status=$1, selesai=GREATEST($2::date, mulai), alasan_akhir=$3, diubah=$4 WHERE id=$5', [st, todayWib(), alasan, Date.now(), id]); await aud(q, req, 'penugasan', id, st === 'selesai' ? 'akhiri' : 'batal', `Penugasan #${id} → ${st}`, alasan, { status: 'aktif' }, { status: st }); });
    await lg(req, 'ubah', `Penugasan #${id} → ${st}`); res.json({ ok: true });
  }));

  // ---------- jadwal ----------
  const JDW = `SELECT j.id, j.nama, j.jenis_id, jn.nama AS jenis, j.kelas_id, k.nama AS kelas, j.pengajar_id, pg.nama AS pengajar, j.materi_id, m.nama AS materi, j.hari, to_char(j.jam_mulai,'HH24:MI') AS jam_mulai, to_char(j.jam_selesai,'HH24:MI') AS jam_selesai, j.ruang, j.mulai::text AS mulai, j.sampai::text AS sampai, j.keterangan, j.izinkan_paralel, j.aktif, j.alasan_nonaktif
    FROM edu_jadwal j JOIN edu_jenis jn ON jn.id=j.jenis_id JOIN edu_kelas k ON k.id=j.kelas_id LEFT JOIN pengajar pg ON pg.id=j.pengajar_id LEFT JOIN edu_materi m ON m.id=j.materi_id`;
  function jadwalWhere(qs) {
    const w = U.where(); if (idOf(qs.hari)) w.add('j.hari = ?', idOf(qs.hari)); for (const [k, c] of [['kelas_id', 'j.kelas_id'], ['pengajar_id', 'j.pengajar_id'], ['jenis_id', 'j.jenis_id']]) if (idOf(qs[k])) w.add(`${c} = ?`, idOf(qs[k]));
    if (qs.aktif === '0') w.add('NOT j.aktif'); else if (qs.aktif !== 'semua') w.add('j.aktif'); if (qs.tanggal && U.isDate(qs.tanggal)) { w.add('(j.mulai IS NULL OR j.mulai <= ?)', qs.tanggal); w.add('(j.sampai IS NULL OR j.sampai >= ?)', qs.tanggal); } return w;
  }
  api.get('/pendidikan/jadwal', mod, wrap(async (req, res) => { const w = jadwalWhere(req.query); res.json({ rows: await db.q(`${JDW} ${w.sql} ORDER BY j.hari, j.jam_mulai, j.id LIMIT 1000`, w.params()) }); }));
  async function bentrok(q, v, exclude) {
    const cekRuang = await setting(q, 'cek_ruang');
    const rows = await q(`SELECT j.id, j.nama, k.nama AS kelas, pg.nama AS pengajar, j.ruang, to_char(j.jam_mulai,'HH24:MI') AS mulai, to_char(j.jam_selesai,'HH24:MI') AS selesai,
        (j.pengajar_id IS NOT NULL AND j.pengajar_id = $5) AS b_pengajar, (j.kelas_id = $6 AND NOT j.izinkan_paralel AND NOT $7) AS b_kelas, ($8 AND $9::text IS NOT NULL AND j.ruang IS NOT NULL AND lower(j.ruang) = lower($9::text)) AS b_ruang
      FROM edu_jadwal j JOIN edu_kelas k ON k.id=j.kelas_id LEFT JOIN pengajar pg ON pg.id=j.pengajar_id
      WHERE j.aktif AND j.id <> $1 AND j.hari = $2 AND j.jam_mulai < $4::time AND $3::time < j.jam_selesai
        AND (j.mulai IS NULL OR $11::date IS NULL OR j.mulai <= $11::date) AND (j.sampai IS NULL OR $10::date IS NULL OR j.sampai >= $10::date)`,
      [exclude || 0, v.hari, v.jam_mulai, v.jam_selesai, v.pengajar_id, v.kelas_id, !!v.izinkan_paralel, cekRuang !== false, v.ruang, v.mulai, v.sampai]);
    return rows.filter(r => r.b_pengajar || r.b_kelas || r.b_ruang).map(r => ({ id: r.id, nama: r.nama, kelas: r.kelas, pengajar: r.pengajar, ruang: r.ruang, waktu: `${r.mulai}–${r.selesai}`, jenis: [r.b_pengajar ? 'pengajar' : null, r.b_kelas ? 'kelas' : null, r.b_ruang ? 'ruang' : null].filter(Boolean) }));
  }
  const JSPEC = [['nama', 'str', 'Nama kegiatan', { req: true, min: 2, max: 150 }], ['jenis_id', 'id', 'Jenis pendidikan', { req: true }], ['kelas_id', 'id', 'Kelas/kelompok', { req: true }], ['pengajar_id', 'id', 'Pengajar'], ['materi_id', 'id', 'Materi'], ['hari', 'int', 'Hari', { req: true, min: 1, max: 7 }], ['jam_mulai', 'time', 'Jam mulai', { req: true }], ['jam_selesai', 'time', 'Jam selesai', { req: true }], ['ruang', 'str', 'Lokasi/ruang', { max: 100 }], ['mulai', 'date', 'Berlaku mulai'], ['sampai', 'date', 'Berlaku sampai'], ['keterangan', 'text', 'Keterangan', { max: 500 }], ['izinkan_paralel', 'bool', 'Izinkan paralel']];
  const JK = ['nama', 'jenis_id', 'kelas_id', 'pengajar_id', 'materi_id', 'hari', 'jam_mulai', 'jam_selesai', 'ruang', 'mulai', 'sampai', 'keterangan', 'izinkan_paralel'];
  function validJadwal(v) { const e = {}; if (v.jam_mulai && v.jam_selesai && v.jam_selesai <= v.jam_mulai) e.jam_selesai = 'Jam selesai harus setelah jam mulai.'; if (v.mulai && v.sampai && v.sampai < v.mulai) e.sampai = 'Tanggal berlaku sampai sebelum mulai.'; chk(e); }
  api.post('/pendidikan/jadwal', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const v = readSpec(b, JSPEC, false); validJadwal(v);
    const r = await db.tx(async q => {
      const k = (await q('SELECT aktif FROM edu_kelas WHERE id=$1', [v.kelas_id]))[0]; if (!k || !k.aktif) throw bad('Kelas tidak tersedia.', { kelas_id: 'Kelas tidak tersedia.' });
      const bt = await bentrok(q, v, 0); if (bt.length) throw bad('Jadwal bertabrakan: ' + bt.map(x => `${x.nama} (${x.kelas}, ${x.waktu}; ${x.jenis.join('/')})`).join('; '), null, 409);
      const x = (await q('INSERT INTO edu_jadwal (nama,jenis_id,kelas_id,pengajar_id,materi_id,hari,jam_mulai,jam_selesai,ruang,mulai,sampai,keterangan,izinkan_paralel,dibuat,oleh,diubah) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$14) RETURNING id', JK.map(k2 => v[k2]).concat([Date.now(), req.user.id])))[0];
      await aud(q, req, 'jadwal', x.id, 'tambah', `Menambah jadwal ${v.nama}`, null, null, v); return x;
    });
    await lg(req, 'tambah', `Menambah jadwal ${v.nama}`); res.status(201).json({ id: r.id });
  }));
  api.patch('/pendidikan/jadwal/:id(\\d+)', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const alasan = needAlasan(b.alasan_koreksi, 'alasan_koreksi'), v = readSpec(b, JSPEC, true);
    await db.tx(async q => {
      const old = (await q("SELECT *, to_char(jam_mulai,'HH24:MI') AS jm, to_char(jam_selesai,'HH24:MI') AS js, mulai::text AS md, sampai::text AS sd FROM edu_jadwal WHERE id=$1 FOR UPDATE", [id]))[0]; if (!old) throw bad('Jadwal tidak ditemukan.', null, 404);
      old.jam_mulai = old.jm; old.jam_selesai = old.js; old.mulai = old.md; old.sampai = old.sd; const nv = Object.assign({}, old, v); validJadwal(nv); const [sb, sd] = diff(old, nv, JK); if (!Object.keys(sd).length) throw bad('Tidak ada perubahan.');
      if (old.aktif) { const bt = await bentrok(q, nv, id); if (bt.length) throw bad('Jadwal bertabrakan: ' + bt.map(x => `${x.nama} (${x.kelas}, ${x.waktu}; ${x.jenis.join('/')})`).join('; '), null, 409); }
      await q('UPDATE edu_jadwal SET nama=$1,jenis_id=$2,kelas_id=$3,pengajar_id=$4,materi_id=$5,hari=$6,jam_mulai=$7,jam_selesai=$8,ruang=$9,mulai=$10,sampai=$11,keterangan=$12,izinkan_paralel=$13,diubah=$14 WHERE id=$15', JK.map(k => nv[k]).concat([Date.now(), id]));
      await aud(q, req, 'jadwal', id, 'ubah', `Mengubah jadwal ${old.nama}`, alasan, sb, sd);
    });
    await lg(req, 'ubah', `Mengubah jadwal #${id}`); res.json({ ok: true });
  }));
  api.post('/pendidikan/jadwal/:id(\\d+)/status', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const aktif = b.aktif === true, alasan = needAlasan(b.alasan);
    await db.tx(async q => {
      const j = (await q("SELECT *, to_char(jam_mulai,'HH24:MI') AS jm, to_char(jam_selesai,'HH24:MI') AS js, mulai::text AS md, sampai::text AS sd FROM edu_jadwal WHERE id=$1 FOR UPDATE", [id]))[0]; if (!j) throw bad('Jadwal tidak ditemukan.', null, 404); if (j.aktif === aktif) throw bad('Status sudah sama.', null, 409);
      if (aktif) { const bt = await bentrok(q, { hari: j.hari, jam_mulai: j.jm, jam_selesai: j.js, pengajar_id: j.pengajar_id, kelas_id: j.kelas_id, izinkan_paralel: j.izinkan_paralel, ruang: j.ruang, mulai: j.md, sampai: j.sd }, id); if (bt.length) throw bad('Tidak dapat diaktifkan: bertabrakan dengan ' + bt.map(x => x.nama).join(', ') + '.', null, 409); }
      await q('UPDATE edu_jadwal SET aktif=$1, alasan_nonaktif=$2, diubah=$3 WHERE id=$4', [aktif, aktif ? null : alasan, Date.now(), id]); await aud(q, req, 'jadwal', id, aktif ? 'aktifkan' : 'nonaktifkan', `Jadwal ${j.nama} ${aktif ? 'diaktifkan' : 'dinonaktifkan'}`, alasan, { aktif: j.aktif }, { aktif });
    });
    await lg(req, 'ubah', `Jadwal #${id} ${aktif ? 'diaktifkan' : 'dinonaktifkan'}`); res.json({ ok: true });
  }));
  api.get('/pendidikan/jadwal/:id(\\d+)/riwayat', mod, wrap(async (req, res) => res.json({ rows: await db.q("SELECT waktu, username, aksi, ket, alasan, sebelum, sesudah FROM edu_audit WHERE entitas='jadwal' AND entitas_id=$1 ORDER BY id DESC", [idOf(req.params.id)]) })));

  // ---------- sesi kegiatan & presensi santri ----------
  const SESI = `SELECT e.id, e.tanggal::text AS tanggal, e.kelas_id, k.nama AS kelas, e.jadwal_id, e.jenis_id, jn.nama AS jenis, e.materi_id, m.nama AS materi, e.pengajar_id, pg.nama AS pengajar, e.nama, to_char(e.jam_mulai,'HH24:MI') AS jam_mulai, to_char(e.jam_selesai,'HH24:MI') AS jam_selesai, e.ruang, e.catatan, e.batal, e.batal_alasan,
      (SELECT COUNT(*)::int FROM edu_presensi p WHERE p.sesi_id=e.id) AS n_presensi
    FROM edu_sesi e JOIN edu_kelas k ON k.id=e.kelas_id JOIN edu_jenis jn ON jn.id=e.jenis_id LEFT JOIN edu_materi m ON m.id=e.materi_id LEFT JOIN pengajar pg ON pg.id=e.pengajar_id`;
  api.get('/pendidikan/sesi', mod, wrap(async (req, res) => {
    const qs = req.query, w = U.where(), pg = U.pageOf(qs); if (U.isDate(qs.dari)) w.add('e.tanggal >= ?', qs.dari); if (U.isDate(qs.sampai)) w.add('e.tanggal <= ?', qs.sampai);
    for (const [k, c] of [['kelas_id', 'e.kelas_id'], ['jenis_id', 'e.jenis_id'], ['pengajar_id', 'e.pengajar_id']]) if (idOf(qs[k])) w.add(`${c} = ?`, idOf(qs[k])); if (qs.batal !== 'semua') w.add('NOT e.batal');
    const total = Number((await db.q(`SELECT COUNT(*) n FROM edu_sesi e ${w.sql}`, w.params()))[0].n);
    res.json({ total, page: pg.page, size: pg.size, rows: await db.q(`${SESI} ${w.sql} ORDER BY e.tanggal DESC, e.id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) });
  }));
  api.post('/pendidikan/sesi', mod, wrap(async (req, res) => {
    const b = req.body || {}, e = {}; const tanggal = U.isDate(String(b.tanggal || '')) ? String(b.tanggal) : null; if (!tanggal) e.tanggal = 'Tanggal pembelajaran wajib diisi.'; else if (tanggal > todayWib()) e.tanggal = 'Tanggal tidak boleh di masa depan.';
    const kelasId = idOf(b.kelas_id); if (!kelasId) e.kelas_id = 'Kelas wajib dipilih.'; chk(e);
    const out = await db.tx(async q => {
      const k = (await q('SELECT id, jenis_id, pengajar_id, aktif FROM edu_kelas WHERE id=$1', [kelasId]))[0]; if (!k || !k.aktif) throw bad('Kelas tidak tersedia.', { kelas_id: 'Kelas tidak tersedia.' });
      let d = { nama: U.str(b.nama, 150), jenis_id: k.jenis_id, materi_id: idOf(b.materi_id), pengajar_id: idOf(b.pengajar_id) || k.pengajar_id, jam_mulai: timeOk(b.jam_mulai) ? b.jam_mulai : null, jam_selesai: timeOk(b.jam_selesai) ? b.jam_selesai : null, ruang: U.strOrNull(b.ruang, 100), jadwal_id: null };
      if (idOf(b.jadwal_id)) {
        const j = (await q("SELECT *, to_char(jam_mulai,'HH24:MI') AS jm, to_char(jam_selesai,'HH24:MI') AS js, mulai::text AS md, sampai::text AS sd, EXTRACT(ISODOW FROM $2::date)::int AS hr FROM edu_jadwal WHERE id=$1", [idOf(b.jadwal_id), tanggal]))[0];
        if (!j || j.kelas_id !== kelasId) throw bad('Jadwal tidak ditemukan untuk kelas ini.', { jadwal_id: 'Jadwal tidak sesuai kelas.' }); if (j.hr !== j.hari) throw bad('Tanggal tidak sesuai hari pada jadwal.', { tanggal: 'Tanggal tidak sesuai hari jadwal.' });
        if ((j.md && tanggal < j.md) || (j.sd && tanggal > j.sd)) throw bad('Tanggal di luar periode berlaku jadwal.', { tanggal: 'Di luar periode jadwal.' });
        d = { nama: j.nama, jenis_id: j.jenis_id, materi_id: j.materi_id, pengajar_id: j.pengajar_id, jam_mulai: j.jm, jam_selesai: j.js, ruang: j.ruang, jadwal_id: j.id };
      } else if (d.nama.length < 2) throw bad('Nama kegiatan wajib diisi untuk kegiatan khusus (tanpa jadwal).', { nama: 'Nama kegiatan wajib diisi.' });
      const ada = (await q('SELECT id FROM edu_sesi WHERE kelas_id=$1 AND tanggal=$2 AND COALESCE(jadwal_id,0)=$3 AND lower(nama)=lower($4) AND NOT batal', [kelasId, tanggal, d.jadwal_id || 0, d.nama]))[0]; if (ada) return { id: ada.id, baru: false };
      const x = (await q('INSERT INTO edu_sesi (tanggal,kelas_id,jadwal_id,jenis_id,materi_id,pengajar_id,nama,jam_mulai,jam_selesai,ruang,catatan,dibuat,oleh,diubah) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$12) RETURNING id', [tanggal, kelasId, d.jadwal_id, d.jenis_id, d.materi_id, d.pengajar_id, d.nama, d.jam_mulai, d.jam_selesai, d.ruang, U.textOrNull(b.catatan, 500), Date.now(), req.user.id]))[0];
      await aud(q, req, 'sesi', x.id, 'tambah', `Membuka kegiatan ${d.nama} (${tanggal})`, null, null, { tanggal, kelas_id: kelasId, jadwal_id: d.jadwal_id }); return { id: x.id, baru: true };
    });
    if (out.baru) await lg(req, 'tambah', `Membuka kegiatan pembelajaran #${out.id}`); res.status(out.baru ? 201 : 200).json(out);
  }));
  api.get('/pendidikan/sesi/:id(\\d+)', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), s = (await db.q(`${SESI} WHERE e.id=$1`, [id]))[0]; if (!s) return res.status(404).json({ error: 'Kegiatan tidak ditemukan.' });
    const peserta = await db.q(`SELECT s.id AS santri_id, s.nis, s.nama, s.kelompok, s.asrama, s.kamar, p.status_id, p.status, p.keterangan, (p.id IS NOT NULL) AS tercatat
      FROM v_santri_edu s LEFT JOIN edu_presensi p ON p.sesi_id=$1 AND p.santri_id=s.id
      WHERE (s.id IN (SELECT santri_id FROM edu_peserta WHERE kelas_id=$2 AND status='aktif') AND s.status='aktif' AND NOT s.diarsipkan) OR s.id IN (SELECT santri_id FROM edu_presensi WHERE sesi_id=$1) ORDER BY s.nama`, [id, s.kelas_id]);
    const pj = s.pengajar_id ? (await db.q('SELECT status_id, status, keterangan FROM edu_presensi_pengajar WHERE sesi_id=$1 AND pengajar_id=$2', [id, s.pengajar_id]))[0] || null : null;
    res.json({ sesi: s, peserta, presensi_pengajar: pj, audit: await db.q("SELECT waktu, username, aksi, ket, alasan, sebelum, sesudah FROM edu_audit WHERE entitas IN ('presensi','sesi') AND entitas_id=$1 ORDER BY id DESC LIMIT 100", [id]) });
  }));
  api.put('/pendidikan/sesi/:id(\\d+)/presensi', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const items = Array.isArray(b.items) ? b.items.slice(0, 1000) : []; if (!items.length) throw bad('Tidak ada data presensi.');
    const r = await db.tx(async q => {
      const s = (await q('SELECT id, kelas_id, tanggal::text AS tanggal, batal, nama FROM edu_sesi WHERE id=$1 FOR UPDATE', [id]))[0]; if (!s) throw bad('Kegiatan tidak ditemukan.', null, 404); if (s.batal) throw bad('Kegiatan sudah dibatalkan.', null, 409);
      const sts = Object.fromEntries((await q('SELECT id, nama, aktif FROM edu_status_presensi')).map(x => [x.id, x]));
      const exist = Object.fromEntries((await q('SELECT * FROM edu_presensi WHERE sesi_id=$1', [id])).map(x => [x.santri_id, x]));
      const aktif = new Set((await q("SELECT p.santri_id FROM edu_peserta p JOIN santri s ON s.id=p.santri_id WHERE p.kelas_id=$1 AND p.status='aktif' AND s.status='aktif' AND NOT s.diarsipkan", [s.kelas_id])).map(x => x.santri_id));
      const baru = [], ubah = []; const seen = new Set();
      for (const it of items) {
        const sid = idOf(it.santri_id), stId = idOf(it.status_id), ket = U.textOrNull(it.keterangan, 300); if (!sid || !stId) throw bad('Data presensi tidak lengkap (santri/status).'); if (seen.has(sid)) throw bad('Santri yang sama muncul dua kali dalam satu input.', null, 400); seen.add(sid);
        const st = sts[stId]; if (!st || (!st.aktif && !(exist[sid] && exist[sid].status_id === stId))) throw bad('Status presensi tidak tersedia.', { status_id: 'Status tidak tersedia.' });
        const ex = exist[sid];
        if (ex) { if (ex.status_id !== stId || (ex.keterangan || null) !== (ket || null)) ubah.push({ ex, stId, st, ket }); }
        else { if (!aktif.has(sid)) throw bad('Santri bukan peserta aktif kelas ini (atau sudah alumni/nonaktif).', null, 409); baru.push({ sid, stId, st, ket }); }
      }
      let alasan = null; if (ubah.length) alasan = needAlasan(b.alasan_koreksi, 'alasan_koreksi');
      for (const n of baru) { await q('INSERT INTO edu_presensi (sesi_id,santri_id,status_id,status,keterangan,dibuat,oleh,diubah) VALUES ($1,$2,$3,$4,$5,$6,$7,$6)', [id, n.sid, n.stId, n.st.nama, n.ket, Date.now(), req.user.id]); }
      if (baru.length) await aud(q, req, 'presensi', id, 'catat', `Mencatat presensi ${baru.length} santri (${s.nama}, ${s.tanggal})`, null, null, { jumlah: baru.length });
      for (const u of ubah) { await q('UPDATE edu_presensi SET status_id=$1, status=$2, keterangan=$3, diubah=$4, diubah_oleh=$5 WHERE id=$6', [u.stId, u.st.nama, u.ket, Date.now(), req.user.id, u.ex.id]); await aud(q, req, 'presensi', id, 'koreksi', `Koreksi presensi santri #${u.ex.santri_id}`, alasan, { santri_id: u.ex.santri_id, status: u.ex.status, keterangan: u.ex.keterangan }, { santri_id: u.ex.santri_id, status: u.st.nama, keterangan: u.ket }); }
      return { baru: baru.length, diubah: ubah.length };
    });
    await lg(req, 'presensi', `Presensi kegiatan #${id}: ${r.baru} baru, ${r.diubah} dikoreksi`); res.json(r);
  }));
  api.post('/pendidikan/sesi/:id(\\d+)/batal', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const alasan = needAlasan(b.alasan);
    await db.tx(async q => { const s = (await q('SELECT id, nama, batal FROM edu_sesi WHERE id=$1 FOR UPDATE', [id]))[0]; if (!s) throw bad('Kegiatan tidak ditemukan.', null, 404); if (s.batal) throw bad('Sudah dibatalkan.', null, 409);
      await q('UPDATE edu_sesi SET batal=TRUE, batal_alasan=$1, diubah=$2 WHERE id=$3', [alasan, Date.now(), id]); await aud(q, req, 'sesi', id, 'batal', `Membatalkan kegiatan ${s.nama}`, alasan, { batal: false }, { batal: true }); });
    await lg(req, 'batal', `Membatalkan kegiatan #${id}`); res.json({ ok: true });
  }));
  api.get('/pendidikan/presensi', mod, wrap(async (req, res) => {
    const qs = req.query, w = U.where(), pg = U.pageOf(qs); w.add('NOT e.batal'); if (U.isDate(qs.dari)) w.add('e.tanggal >= ?', qs.dari); if (U.isDate(qs.sampai)) w.add('e.tanggal <= ?', qs.sampai);
    for (const [k, c] of [['santri_id', 'p.santri_id'], ['kelas_id', 'e.kelas_id'], ['jenis_id', 'e.jenis_id'], ['status_id', 'p.status_id']]) if (idOf(qs[k])) w.add(`${c} = ?`, idOf(qs[k]));
    const total = Number((await db.q(`SELECT COUNT(*) n FROM edu_presensi p JOIN edu_sesi e ON e.id=p.sesi_id ${w.sql}`, w.params()))[0].n);
    res.json({ total, page: pg.page, size: pg.size, rows: await db.q(`SELECT p.id, e.tanggal::text AS tanggal, e.nama AS kegiatan, k.nama AS kelas, s.nis, s.nama, p.status, p.keterangan FROM edu_presensi p JOIN edu_sesi e ON e.id=p.sesi_id JOIN edu_kelas k ON k.id=e.kelas_id JOIN santri s ON s.id=p.santri_id ${w.sql} ORDER BY e.tanggal DESC, p.id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) });
  }));
  // rekap presensi (dipakai layar & laporan)
  async function rekapPresensi(q, qs, group) {
    const w = U.where(); w.add('NOT e.batal'); if (U.isDate(qs.dari)) w.add('e.tanggal >= ?', qs.dari); if (U.isDate(qs.sampai)) w.add('e.tanggal <= ?', qs.sampai);
    for (const [k, c] of [['kelas_id', 'e.kelas_id'], ['jenis_id', 'e.jenis_id'], ['santri_id', 'p.santri_id']]) if (idOf(qs[k])) w.add(`${c} = ?`, idOf(qs[k]));
    if (['putra', 'putri'].includes(qs.kelompok)) w.add('s.kelompok = ?', qs.kelompok); if (idOf(qs.asrama_id)) w.add('s.asrama_id = ?', idOf(qs.asrama_id));
    const g = { kelas: ['k.id', 'k.nama'], jenis: ['jn.id', 'jn.nama'], santri: ['s.id', "trim(COALESCE(s.nis,'') || ' ' || s.nama)"] }[group] || ['k.id', 'k.nama'];
    const from = `FROM edu_presensi p JOIN edu_sesi e ON e.id=p.sesi_id JOIN edu_kelas k ON k.id=e.kelas_id JOIN edu_jenis jn ON jn.id=e.jenis_id JOIN v_santri_edu s ON s.id=p.santri_id JOIN edu_status_presensi sp ON sp.id=p.status_id ${w.sql}`;
    const rows = await q(`SELECT ${g[0]} AS id, ${g[1]} AS nama, COUNT(*)::int AS total, (COUNT(*) FILTER (WHERE sp.dihitung_hadir))::int AS hadir, ROUND(100.0 * COUNT(*) FILTER (WHERE sp.dihitung_hadir) / NULLIF(COUNT(*), 0), 1) AS persen ${from} GROUP BY 1, 2 ORDER BY 2 LIMIT 1000`, w.params());
    const st = await q(`SELECT ${g[0]} AS id, p.status, COUNT(*)::int AS n ${from} GROUP BY 1, 2`, w.params()), m = {}; st.forEach(x => { (m[x.id] = m[x.id] || {})[x.status] = x.n; });
    rows.forEach(r => { r.per_status = m[r.id] || {}; r.persen = r.persen == null ? null : Number(r.persen); }); return rows;
  }
  api.get('/pendidikan/presensi/rekap', mod, wrap(async (req, res) => res.json({ rows: await rekapPresensi(db.q.bind(db), req.query, req.query.group) })));

  // ---------- presensi pengajar (opsional) ----------
  const needPP = async q => { if ((await setting(q, 'presensi_pengajar')) !== true) throw bad('Presensi pengajar belum diaktifkan di Pengaturan Pendidikan.', null, 409); };
  api.put('/pendidikan/sesi/:id(\\d+)/presensi-pengajar', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const stId = idOf(b.status_id), pid = idOf(b.pengajar_id); if (!stId) throw bad('Status wajib dipilih.', { status_id: 'Status wajib dipilih.' });
    const r = await db.tx(async q => {
      await needPP(q); const s = (await q('SELECT id, nama, pengajar_id, batal FROM edu_sesi WHERE id=$1 FOR UPDATE', [id]))[0]; if (!s) throw bad('Kegiatan tidak ditemukan.', null, 404); if (s.batal) throw bad('Kegiatan dibatalkan.', null, 409);
      const pj = pid || s.pengajar_id; if (!pj) throw bad('Kegiatan belum memiliki pengajar; pilih pengajar.', { pengajar_id: 'Pengajar wajib dipilih.' });
      const st = (await q('SELECT id, nama, aktif FROM edu_status_presensi WHERE id=$1', [stId]))[0]; if (!st || !st.aktif) throw bad('Status tidak tersedia.', { status_id: 'Status tidak tersedia.' }); const ket = U.textOrNull(b.keterangan, 300);
      const ex = (await q('SELECT * FROM edu_presensi_pengajar WHERE sesi_id=$1 AND pengajar_id=$2 FOR UPDATE', [id, pj]))[0];
      if (!ex) { await q('INSERT INTO edu_presensi_pengajar (sesi_id,pengajar_id,status_id,status,keterangan,dibuat,oleh,diubah) VALUES ($1,$2,$3,$4,$5,$6,$7,$6)', [id, pj, stId, st.nama, ket, Date.now(), req.user.id]); await aud(q, req, 'presensi_pengajar', id, 'catat', `Presensi pengajar #${pj}: ${st.nama}`, null, null, { pengajar_id: pj, status: st.nama }); return { baru: true }; }
      const alasan = needAlasan(b.alasan_koreksi, 'alasan_koreksi'); if (ex.status_id === stId && (ex.keterangan || null) === (ket || null)) throw bad('Tidak ada perubahan.');
      await q('UPDATE edu_presensi_pengajar SET status_id=$1, status=$2, keterangan=$3, diubah=$4 WHERE id=$5', [stId, st.nama, ket, Date.now(), ex.id]); await aud(q, req, 'presensi_pengajar', id, 'koreksi', `Koreksi presensi pengajar #${pj}`, alasan, { status: ex.status, keterangan: ex.keterangan }, { status: st.nama, keterangan: ket }); return { baru: false };
    });
    await lg(req, 'presensi', `Presensi pengajar kegiatan #${id}`); res.json(r);
  }));
  api.get('/pendidikan/presensi-pengajar', mod, wrap(async (req, res) => {
    const qs = req.query, w = U.where(), pg = U.pageOf(qs); w.add('NOT e.batal'); if (U.isDate(qs.dari)) w.add('e.tanggal >= ?', qs.dari); if (U.isDate(qs.sampai)) w.add('e.tanggal <= ?', qs.sampai); if (idOf(qs.pengajar_id)) w.add('p.pengajar_id = ?', idOf(qs.pengajar_id)); if (idOf(qs.kelas_id)) w.add('e.kelas_id = ?', idOf(qs.kelas_id));
    const total = Number((await db.q(`SELECT COUNT(*) n FROM edu_presensi_pengajar p JOIN edu_sesi e ON e.id=p.sesi_id ${w.sql}`, w.params()))[0].n);
    res.json({ aktif: (await setting(db.q.bind(db), 'presensi_pengajar')) === true, total, page: pg.page, size: pg.size, rows: await db.q(`SELECT p.id, e.id AS sesi_id, e.tanggal::text AS tanggal, e.nama AS kegiatan, k.nama AS kelas, pg.nama AS pengajar, p.status, p.keterangan FROM edu_presensi_pengajar p JOIN edu_sesi e ON e.id=p.sesi_id JOIN edu_kelas k ON k.id=e.kelas_id JOIN pengajar pg ON pg.id=p.pengajar_id ${w.sql} ORDER BY e.tanggal DESC, p.id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) });
  }));

  // ---------- penilaian ----------
  const NIL = `SELECT n.id, n.santri_id, s.nis, s.nama, s.kelompok, n.kelas_id, k.nama AS kelas, n.jenis_id, jn.nama AS jenis, n.materi_id, m.nama AS materi, n.periode_id, pr.nama AS periode, n.evaluasi_id, n.evaluasi, n.tanggal::text AS tanggal, n.nilai::float AS nilai, n.capaian, n.catatan, n.batal, n.batal_alasan
    FROM edu_penilaian n JOIN v_santri_edu s ON s.id=n.santri_id JOIN edu_kelas k ON k.id=n.kelas_id JOIN edu_jenis jn ON jn.id=n.jenis_id LEFT JOIN edu_materi m ON m.id=n.materi_id LEFT JOIN edu_periode pr ON pr.id=n.periode_id`;
  function nilaiWhere(qs) {
    const w = U.where(), s = U.str(qs.q || '', 80); if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(s.nama ILIKE ${ph} OR s.nis ILIKE ${ph})`); }
    if (U.isDate(qs.dari)) w.add('n.tanggal >= ?', qs.dari); if (U.isDate(qs.sampai)) w.add('n.tanggal <= ?', qs.sampai);
    for (const [k, c] of [['kelas_id', 'n.kelas_id'], ['jenis_id', 'n.jenis_id'], ['materi_id', 'n.materi_id'], ['periode_id', 'n.periode_id'], ['evaluasi_id', 'n.evaluasi_id'], ['santri_id', 'n.santri_id'], ['asrama_id', 's.asrama_id']]) if (idOf(qs[k])) w.add(`${c} = ?`, idOf(qs[k]));
    if (['putra', 'putri'].includes(qs.kelompok)) w.add('s.kelompok = ?', qs.kelompok); if (qs.batal !== 'semua') w.add('NOT n.batal'); return w;
  }
  api.get('/pendidikan/penilaian', mod, wrap(async (req, res) => {
    const w = nilaiWhere(req.query), pg = U.pageOf(req.query), total = Number((await db.q(`SELECT COUNT(*) n FROM edu_penilaian n JOIN v_santri_edu s ON s.id=n.santri_id ${w.sql}`, w.params()))[0].n);
    res.json({ total, page: pg.page, size: pg.size, rows: await db.q(`${NIL} ${w.sql} ORDER BY n.tanggal DESC, n.id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) });
  }));
  async function bacaNilai(q, it, ctx, e, key) {
    const out = { nilai: null, capaian: U.textOrNull(it.capaian, 300), catatan: U.textOrNull(it.catatan, 1000) };
    if (it.nilai !== undefined && it.nilai !== null && String(it.nilai).trim() !== '') {
      const n = Number(String(it.nilai).replace(',', '.')); const cfg = await setting(q, 'nilai');
      if (!Number.isFinite(n) || n < cfg.min || n > cfg.max) e[key] = `Nilai harus angka antara ${cfg.min} dan ${cfg.max}.`; else if (ctx.mode === 'capaian') e[key] = 'Jenis pendidikan ini memakai capaian/catatan, bukan nilai angka.'; else out.nilai = Math.round(n * 100) / 100;
    }
    if (ctx.mode === 'angka' && it.capaian) e[key] = 'Jenis pendidikan ini memakai nilai angka.';
    if (out.nilai == null && !out.capaian && !out.catatan && !e[key]) e[key] = 'Isi nilai, capaian, atau catatan.'; return out;
  }
  async function konteksNilai(q, b, e) {
    const kelasId = idOf(b.kelas_id), evId = idOf(b.evaluasi_id); if (!kelasId) e.kelas_id = 'Kelas wajib dipilih.'; if (!evId) e.evaluasi_id = 'Jenis evaluasi wajib dipilih.'; const tgl = U.isDate(String(b.tanggal || '')) ? String(b.tanggal) : null; if (!tgl) e.tanggal = 'Tanggal penilaian wajib diisi.'; else if (tgl > todayWib()) e.tanggal = 'Tanggal tidak boleh di masa depan.';
    chk(e); const k = (await q('SELECT k.id, k.jenis_id, k.aktif, j.mode_nilai FROM edu_kelas k JOIN edu_jenis j ON j.id=k.jenis_id WHERE k.id=$1', [kelasId]))[0]; if (!k) throw bad('Kelas tidak ditemukan.', { kelas_id: 'Kelas tidak ditemukan.' });
    const ev = (await q('SELECT id, nama, aktif FROM edu_jenis_evaluasi WHERE id=$1', [evId]))[0]; if (!ev || !ev.aktif) throw bad('Jenis evaluasi tidak tersedia.', { evaluasi_id: 'Jenis evaluasi tidak tersedia.' });
    const materiId = idOf(b.materi_id); if (materiId) { const m = (await q('SELECT jenis_id FROM edu_materi WHERE id=$1', [materiId]))[0]; if (!m || m.jenis_id !== k.jenis_id) throw bad('Materi tidak sesuai jenis pendidikan kelas.', { materi_id: 'Materi tidak sesuai kelas.' }); }
    return { kelasId, jenisId: k.jenis_id, mode: k.mode_nilai, ev, materiId, periodeId: idOf(b.periode_id), tgl };
  }
  async function simpanNilai(q, req, c, sid, o) {
    const ps = (await q("SELECT 1 FROM edu_peserta p JOIN santri s ON s.id=p.santri_id WHERE p.kelas_id=$1 AND p.santri_id=$2 AND p.status='aktif' AND s.status='aktif' AND NOT s.diarsipkan", [c.kelasId, sid]))[0]; if (!ps) throw bad('Santri bukan peserta aktif kelas ini (atau sudah alumni/nonaktif).', null, 409);
    const x = (await q('INSERT INTO edu_penilaian (santri_id,kelas_id,jenis_id,materi_id,periode_id,evaluasi_id,evaluasi,tanggal,nilai,capaian,catatan,dibuat,oleh,diubah) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$12) RETURNING id', [sid, c.kelasId, c.jenisId, c.materiId, c.periodeId, c.ev.id, c.ev.nama, c.tgl, o.nilai, o.capaian, o.catatan, Date.now(), req.user.id]))[0];
    await aud(q, req, 'penilaian', x.id, 'tambah', `Menilai santri #${sid} (${c.ev.nama})`, null, null, { santri_id: sid, nilai: o.nilai, capaian: o.capaian }); return x.id;
  }
  api.post('/pendidikan/penilaian', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const e = {}, sid = idOf(b.santri_id); if (!sid) e.santri_id = 'Santri wajib dipilih.';
    const r = await db.tx(async q => { const c = await konteksNilai(q, b, e), o = await bacaNilai(q, b, c, e, 'nilai'); chk(e); return simpanNilai(q, req, c, sid, o); });
    await lg(req, 'tambah', `Penilaian #${r}`); res.status(201).json({ id: r });
  }));
  api.post('/pendidikan/penilaian/massal', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const items = Array.isArray(b.items) ? b.items.slice(0, 500) : []; if (!items.length) throw bad('Tidak ada data nilai.');
    const n = await db.tx(async q => {
      const e0 = {}, c = await konteksNilai(q, b, e0); let cnt = 0; const seen = new Set(), errs = {};
      for (let i = 0; i < items.length; i++) { const it = items[i], sid = idOf(it.santri_id); if (!sid || seen.has(sid)) throw bad('Data santri tidak valid atau ganda.'); seen.add(sid); const empty = (it.nilai == null || String(it.nilai).trim() === '') && !String(it.capaian || '').trim() && !String(it.catatan || '').trim(); if (empty) continue;
        const e = {}, o = await bacaNilai(q, it, c, e, 'x'); if (e.x) { errs['baris_' + sid] = e.x; continue; } await simpanNilai(q, req, c, sid, o); cnt++; }
      if (Object.keys(errs).length) throw bad('Ada baris yang tidak valid; tidak ada yang disimpan.', errs); if (!cnt) throw bad('Tidak ada nilai yang diisi.'); return cnt;
    });
    await lg(req, 'tambah', `Penilaian massal ${n} santri`); res.status(201).json({ disimpan: n });
  }));
  api.patch('/pendidikan/penilaian/:id(\\d+)', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const alasan = needAlasan(b.alasan_koreksi, 'alasan_koreksi');
    await db.tx(async q => {
      const old = (await q('SELECT n.*, j.mode_nilai AS mode FROM edu_penilaian n JOIN edu_jenis j ON j.id=n.jenis_id WHERE n.id=$1 FOR UPDATE OF n', [id]))[0]; if (!old) throw bad('Penilaian tidak ditemukan.', null, 404); if (old.batal) throw bad('Penilaian yang dibatalkan tidak dapat diubah.', null, 409);
      const e = {}, o = await bacaNilai(q, { nilai: 'nilai' in b ? b.nilai : null, capaian: 'capaian' in b ? b.capaian : old.capaian, catatan: 'catatan' in b ? b.catatan : old.catatan }, { mode: old.mode }, e, 'nilai'); chk(e);
      if (!('nilai' in b)) o.nilai = old.nilai == null ? null : Number(old.nilai);
      const [sb, sd] = diff({ nilai: old.nilai == null ? null : Number(old.nilai), capaian: old.capaian, catatan: old.catatan }, o, ['nilai', 'capaian', 'catatan']); if (!Object.keys(sd).length) throw bad('Tidak ada perubahan.');
      await q('UPDATE edu_penilaian SET nilai=$1, capaian=$2, catatan=$3, diubah=$4, diubah_oleh=$5 WHERE id=$6', [o.nilai, o.capaian, o.catatan, Date.now(), req.user.id, id]); await aud(q, req, 'penilaian', id, 'koreksi', `Koreksi penilaian #${id}`, alasan, sb, sd);
    });
    await lg(req, 'ubah', `Koreksi penilaian #${id}: ${alasan}`); res.json({ ok: true });
  }));
  api.post('/pendidikan/penilaian/:id(\\d+)/batal', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const alasan = needAlasan(b.alasan);
    await db.tx(async q => { const n = (await q('SELECT id, batal FROM edu_penilaian WHERE id=$1 FOR UPDATE', [id]))[0]; if (!n) throw bad('Penilaian tidak ditemukan.', null, 404); if (n.batal) throw bad('Sudah dibatalkan.', null, 409); await q('UPDATE edu_penilaian SET batal=TRUE, batal_alasan=$1, diubah=$2, diubah_oleh=$3 WHERE id=$4', [alasan, Date.now(), req.user.id, id]); await aud(q, req, 'penilaian', id, 'batal', `Membatalkan penilaian #${id}`, alasan, { batal: false }, { batal: true }); });
    await lg(req, 'batal', `Membatalkan penilaian #${id}`); res.json({ ok: true });
  }));
  api.get('/pendidikan/penilaian/:id(\\d+)/riwayat', mod, wrap(async (req, res) => res.json({ rows: await db.q("SELECT waktu, username, aksi, ket, alasan, sebelum, sesudah FROM edu_audit WHERE entitas='penilaian' AND entitas_id=$1 ORDER BY id DESC", [idOf(req.params.id)]) })));
  async function rekapNilai(q, qs, group) {
    const w = nilaiWhere(qs), g = group === 'materi' ? ['COALESCE(m.id,0)', "COALESCE(m.nama,'(Tanpa materi)')"] : group === 'santri' ? ['s.id', "trim(COALESCE(s.nis,'') || ' ' || s.nama)"] : ['k.id', 'k.nama'];
    return q(`SELECT ${g[0]} AS id, ${g[1]} AS nama, COUNT(*)::int AS jumlah, COUNT(n.nilai)::int AS jumlah_angka, ROUND(AVG(n.nilai), 2)::float AS rata, MIN(n.nilai)::float AS terendah, MAX(n.nilai)::float AS tertinggi
      FROM edu_penilaian n JOIN v_santri_edu s ON s.id=n.santri_id JOIN edu_kelas k ON k.id=n.kelas_id LEFT JOIN edu_materi m ON m.id=n.materi_id ${w.sql} GROUP BY 1, 2 ORDER BY 2 LIMIT 1000`, w.params());
  }
  api.get('/pendidikan/penilaian/rekap', mod, wrap(async (req, res) => res.json({ rows: await rekapNilai(db.q.bind(db), req.query, req.query.group) })));

  // ---------- catatan perkembangan ----------
  api.get('/pendidikan/catatan', mod, wrap(async (req, res) => {
    const sid = idOf(req.query.santri_id); const w = U.where(); if (sid) w.add('c.santri_id = ?', sid); if (req.query.batal !== 'semua') w.add('NOT c.batal');
    res.json({ rows: await db.q(`SELECT c.id, c.santri_id, s.nama, c.kelas_id, k.nama AS kelas, c.tanggal::text AS tanggal, c.catatan, c.batal, c.batal_alasan FROM edu_catatan c JOIN santri s ON s.id=c.santri_id LEFT JOIN edu_kelas k ON k.id=c.kelas_id ${w.sql} ORDER BY c.tanggal DESC, c.id DESC LIMIT 200`, w.params()) });
  }));
  api.post('/pendidikan/catatan', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const e = {}, sid = idOf(b.santri_id); if (!sid) e.santri_id = 'Santri wajib dipilih.'; const tgl = b.tanggal ? String(b.tanggal) : todayWib(); if (!U.isDate(tgl) || tgl > todayWib()) e.tanggal = 'Tanggal tidak valid.'; const cat = U.text(b.catatan, 1000); if (cat.length < 3) e.catatan = 'Catatan wajib diisi.'; chk(e);
    const r = await db.tx(async q => {
      const s = (await q('SELECT id, nama, status, diarsipkan FROM v_santri_edu WHERE id=$1', [sid]))[0]; if (!s) throw bad('Santri tidak ditemukan.', { santri_id: 'Santri tidak ditemukan.' }); if (s.status !== 'aktif' || s.diarsipkan) throw bad('Santri bukan santri aktif.', { santri_id: 'Santri bukan santri aktif.' }, 409);
      const x = (await q('INSERT INTO edu_catatan (santri_id,kelas_id,tanggal,catatan,dibuat,oleh) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [sid, idOf(b.kelas_id), tgl, cat, Date.now(), req.user.id]))[0]; await aud(q, req, 'catatan', x.id, 'tambah', `Catatan perkembangan ${s.nama}`, null, null, { tanggal: tgl }); return x;
    });
    await lg(req, 'tambah', `Catatan perkembangan #${r.id}`); res.status(201).json({ id: r.id });
  }));
  api.post('/pendidikan/catatan/:id(\\d+)/batal', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const alasan = needAlasan(b.alasan);
    await db.tx(async q => { const c = (await q('SELECT id, batal FROM edu_catatan WHERE id=$1 FOR UPDATE', [id]))[0]; if (!c) throw bad('Catatan tidak ditemukan.', null, 404); if (c.batal) throw bad('Sudah dibatalkan.', null, 409); await q('UPDATE edu_catatan SET batal=TRUE, batal_alasan=$1 WHERE id=$2', [alasan, id]); await aud(q, req, 'catatan', id, 'batal', `Membatalkan catatan #${id}`, alasan, { batal: false }, { batal: true }); });
    await lg(req, 'batal', `Membatalkan catatan #${id}`); res.json({ ok: true });
  }));

  // ---------- riwayat pendidikan santri (juga untuk alumni) ----------
  api.get('/pendidikan/riwayat/:id(\\d+)', mod, wrap(async (req, res) => {
    const id = idOf(req.params.id), s = (await db.q('SELECT id, nis, nama, foto, kelompok, status, diarsipkan, asrama, kamar FROM v_santri_edu WHERE id=$1', [id]))[0]; if (!s) return res.status(404).json({ error: 'Santri tidak ditemukan.' });
    res.json({ santri: s,
      peserta: await db.q(`SELECT p.id, k.id AS kelas_id, k.nama AS kelas, j.nama AS jenis, k.tingkat, pg.nama AS pengajar, p.mulai::text AS mulai, p.selesai::text AS selesai, p.status, p.alasan, pd.kelas_id AS dari_kelas_id, kd.nama AS dari_kelas
        FROM edu_peserta p JOIN edu_kelas k ON k.id=p.kelas_id JOIN edu_jenis j ON j.id=k.jenis_id LEFT JOIN pengajar pg ON pg.id=k.pengajar_id LEFT JOIN edu_peserta pd ON pd.id=p.pindah_dari LEFT JOIN edu_kelas kd ON kd.id=pd.kelas_id WHERE p.santri_id=$1 ORDER BY p.id DESC`, [id]),
      kehadiran: await rekapPresensi(db.q.bind(db), { santri_id: id }, 'kelas'), presensi_terbaru: await db.q("SELECT e.tanggal::text AS tanggal, e.nama AS kegiatan, k.nama AS kelas, p.status, p.keterangan FROM edu_presensi p JOIN edu_sesi e ON e.id=p.sesi_id JOIN edu_kelas k ON k.id=e.kelas_id WHERE p.santri_id=$1 AND NOT e.batal ORDER BY e.tanggal DESC, p.id DESC LIMIT 30", [id]),
      penilaian: await db.q(`${NIL} WHERE n.santri_id=$1 AND NOT n.batal ORDER BY n.tanggal DESC, n.id DESC LIMIT 200`, [id]),
      catatan: await db.q('SELECT c.id, c.tanggal::text AS tanggal, c.catatan, k.nama AS kelas FROM edu_catatan c LEFT JOIN edu_kelas k ON k.id=c.kelas_id WHERE c.santri_id=$1 AND NOT c.batal ORDER BY c.tanggal DESC, c.id DESC LIMIT 100', [id]) });
  }));
  api.get('/pendidikan/santri', mod, wrap(async (req, res) => {   // daftar untuk Riwayat Pendidikan (aktif maupun alumni yang punya riwayat)
    const qs = req.query, w = U.where(), s = U.str(qs.q || '', 80), pg = U.pageOf(qs); if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(s.nama ILIKE ${ph} OR s.nis ILIKE ${ph})`); }
    if (['putra', 'putri'].includes(qs.kelompok)) w.add('s.kelompok = ?', qs.kelompok); if (idOf(qs.asrama_id)) w.add('s.asrama_id = ?', idOf(qs.asrama_id)); if (idOf(qs.kelas_id)) w.add('EXISTS (SELECT 1 FROM edu_peserta p WHERE p.santri_id=s.id AND p.kelas_id=?)', idOf(qs.kelas_id));
    w.add("((s.status='aktif' AND NOT s.diarsipkan) OR EXISTS (SELECT 1 FROM edu_peserta p WHERE p.santri_id=s.id))");
    const total = Number((await db.q(`SELECT COUNT(*) n FROM v_santri_edu s ${w.sql}`, w.params()))[0].n);
    res.json({ total, page: pg.page, size: pg.size, rows: await db.q(`SELECT s.id, s.nis, s.nama, s.kelompok, s.asrama, s.kamar, s.status, s.diarsipkan, s.foto, (SELECT COUNT(*)::int FROM edu_peserta p WHERE p.santri_id=s.id AND p.status='aktif') AS kelas_aktif FROM v_santri_edu s ${w.sql} ORDER BY s.nama LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) });
  }));

  // ---------- dashboard ----------
  api.get('/pendidikan/dashboard', mod, wrap(async (req, res) => {
    const qs = req.query, today = todayWib(), sampai = U.isDate(qs.sampai) ? qs.sampai : today, dari = U.isDate(qs.dari) ? qs.dari : iso(new Date(new Date(sampai + 'T00:00:00Z').getTime() - 29 * 864e5)), q = db.q.bind(db);
    const one = async (sql, p) => (await q(sql, p))[0];
    const cnt = await one(`SELECT (SELECT COUNT(*)::int FROM v_santri_edu WHERE status='aktif' AND NOT diarsipkan) AS santri_aktif, (SELECT COUNT(*)::int FROM edu_kelas WHERE aktif) AS kelas, (SELECT COUNT(*)::int FROM pengajar WHERE aktif AND NOT diarsipkan) AS pengajar_aktif,
      (SELECT COUNT(*)::int FROM edu_jenis WHERE aktif) AS jenis, (SELECT COUNT(*)::int FROM edu_jadwal WHERE aktif) AS jadwal,
      (SELECT COUNT(DISTINCT p.santri_id)::int FROM edu_peserta p JOIN santri s ON s.id=p.santri_id WHERE p.status='aktif' AND s.status='aktif' AND NOT s.diarsipkan) AS peserta_aktif`);
    const jw = `SELECT j.id, j.nama, k.nama AS kelas, pg.nama AS pengajar, j.ruang, to_char(j.jam_mulai,'HH24:MI') AS jam_mulai, to_char(j.jam_selesai,'HH24:MI') AS jam_selesai,
      (now() AT TIME ZONE 'Asia/Jakarta')::time BETWEEN j.jam_mulai AND j.jam_selesai AS berlangsung,
      EXISTS (SELECT 1 FROM edu_sesi e WHERE e.jadwal_id=j.id AND e.tanggal=$1::date AND NOT e.batal) AS sesi_dibuka
      FROM edu_jadwal j JOIN edu_kelas k ON k.id=j.kelas_id LEFT JOIN pengajar pg ON pg.id=j.pengajar_id
      WHERE j.aktif AND j.hari = EXTRACT(ISODOW FROM $1::date)::int AND (j.mulai IS NULL OR j.mulai <= $1::date) AND (j.sampai IS NULL OR j.sampai >= $1::date) ORDER BY j.jam_mulai, j.id`;
    const hariIni = await q(jw, [today]), f = { dari, sampai, jenis_id: qs.jenis_id, kelas_id: qs.kelas_id };
    const sw = U.where(); sw.add('NOT e.batal'); sw.add('e.tanggal >= ?', dari); sw.add('e.tanggal <= ?', sampai); if (idOf(qs.jenis_id)) sw.add('e.jenis_id = ?', idOf(qs.jenis_id)); if (idOf(qs.kelas_id)) sw.add('e.kelas_id = ?', idOf(qs.kelas_id));
    const rekapSt = await q(`SELECT p.status, COUNT(*)::int AS n FROM edu_presensi p JOIN edu_sesi e ON e.id=p.sesi_id ${sw.sql} GROUP BY 1 ORDER BY 2 DESC`, sw.params());
    const harian = await q(`SELECT e.tanggal::text AS k, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE sp.dihitung_hadir)::int AS hadir FROM edu_presensi p JOIN edu_sesi e ON e.id=p.sesi_id JOIN edu_status_presensi sp ON sp.id=p.status_id ${sw.sql} GROUP BY 1 ORDER BY 1`, sw.params());
    const perKelas = await rekapPresensi(q, f, 'kelas');
    const kegiatan = await q(`SELECT to_char(e.tanggal,'YYYY-MM') AS k, COUNT(*)::int AS v FROM edu_sesi e WHERE NOT e.batal AND e.tanggal >= (date_trunc('month', $1::date) - interval '5 months')::date AND e.tanggal <= $1::date GROUP BY 1 ORDER BY 1`, [sampai]);
    const nilaiBln = await q(`SELECT to_char(n.tanggal,'YYYY-MM') AS k, ROUND(AVG(n.nilai), 2)::float AS v, COUNT(n.nilai)::int AS n FROM edu_penilaian n WHERE NOT n.batal AND n.nilai IS NOT NULL AND n.tanggal >= (date_trunc('month', $1::date) - interval '5 months')::date AND n.tanggal <= $1::date GROUP BY 1 ORDER BY 1`, [sampai]);
    const sesiN = await one(`SELECT COUNT(*)::int AS n FROM edu_sesi e ${sw.sql}`, sw.params());
    const ev = await q(`${NIL} WHERE NOT n.batal ORDER BY n.id DESC LIMIT 8`);
    const pp = (await setting(q, 'presensi_pengajar')) === true; let rekapPj = null;
    if (pp) rekapPj = await q(`SELECT p.status, COUNT(*)::int AS n FROM edu_presensi_pengajar p JOIN edu_sesi e ON e.id=p.sesi_id ${sw.sql} GROUP BY 1 ORDER BY 2 DESC`, sw.params());
    res.json({ periode: { dari, sampai }, hari_ini: today, ringkasan: Object.assign({ kegiatan_periode: sesiN.n }, cnt), jadwal_hari_ini: hariIni, berlangsung: hariIni.filter(x => x.berlangsung), rekap_presensi: rekapSt, rekap_presensi_pengajar: rekapPj, presensi_pengajar_aktif: pp,
      grafik: { harian, per_kelas: perKelas.map(r => ({ k: r.nama, v: r.persen == null ? 0 : r.persen, total: r.total })), kegiatan, nilai: nilaiBln }, evaluasi_terbaru: ev });
  }));

  // ---------- laporan ----------
  require('./edu-laporan').register(api, { db, mod, wrap, logBy, setting, rekapPresensi, rekapNilai, NIL, nilaiWhere, JDW, jadwalWhere, PES, idOf });

  // ---------- pengaturan ----------
  api.get('/pendidikan/pengaturan', mod, wrap(async (req, res) => { const Q = db.q.bind(db); res.json({ presensi_pengajar: await setting(Q, 'presensi_pengajar'), cek_ruang: await setting(Q, 'cek_ruang'), nilai: Object.assign({}, DEF.nilai, await setting(Q, 'nilai')), identitas: Object.assign({}, DEF.identitas, await setting(Q, 'identitas')) }); }));
  api.put('/pendidikan/pengaturan', mod, wrap(async (req, res) => {
    const b = req.body || {}, e = {}, ch = {}, alasan = U.textOrNull(b.alasan, 500);
    if ('presensi_pengajar' in b) ch.presensi_pengajar = b.presensi_pengajar === true; if ('cek_ruang' in b) ch.cek_ruang = b.cek_ruang === true;
    if ('nilai' in b) { const mn = Number((b.nilai || {}).min), mx = Number((b.nilai || {}).max); if (!Number.isFinite(mn) || !Number.isFinite(mx) || mn < 0 || mx > 100000 || mx <= mn) e.nilai = 'Rentang nilai tidak valid (maksimum harus lebih besar dari minimum).'; else ch.nilai = { min: mn, max: mx }; }
    if ('identitas' in b) { const i = b.identitas || {}, nm = U.str(i.nama, 150); if (nm.length < 3) e.identitas_nama = 'Nama pondok wajib diisi.'; ch.identitas = { nama: nm, alamat: U.text(i.alamat, 300), kontak: U.str(i.kontak, 100), catatan: U.text(i.catatan, 300) }; }
    chk(e); if (!Object.keys(ch).length) throw bad('Tidak ada perubahan.');
    await db.tx(async q => { for (const k of Object.keys(ch)) { const old = await setting(q, k); await q('INSERT INTO edu_pengaturan (kunci,nilai,diubah,oleh) VALUES ($1,$2,$3,$4) ON CONFLICT (kunci) DO UPDATE SET nilai=$2, diubah=$3, oleh=$4', [k, JSON.stringify(ch[k]), Date.now(), req.user.id]); await aud(q, req, 'pengaturan', null, 'ubah', 'Mengubah pengaturan ' + k, alasan, old === undefined ? null : { v: old }, { v: ch[k] }); } });
    await lg(req, 'ubah', 'Mengubah pengaturan pendidikan: ' + Object.keys(ch).join(', ')); res.json({ ok: true });
  }));
  api.get('/pendidikan/audit', mod, wrap(async (req, res) => {
    const pg = U.pageOf(req.query), w = U.where(); if (req.query.entitas) w.add('entitas = ?', String(req.query.entitas).slice(0, 30));
    res.json({ total: Number((await db.q(`SELECT COUNT(*) n FROM edu_audit ${w.sql}`, w.params()))[0].n), page: pg.page, size: pg.size, rows: await db.q(`SELECT id, waktu, username, entitas, entitas_id, aksi, ket, alasan, sebelum, sesudah FROM edu_audit ${w.sql} ORDER BY id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) });
  }));
}
module.exports = { register, DEF };
