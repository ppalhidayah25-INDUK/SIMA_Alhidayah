'use strict';
// Modul Keamanan: pelanggaran, pembinaan, perizinan keluar/pulang, monitoring, profil keamanan, laporan, pengaturan.
// Keamanan berjalan sebagai role DB `sima_keamanan` (hanya view santri minimum + tabel kea_*); Bendahara tidak punya hak apa pun di sini.
// Tidak ada kategori, hukuman, denda, atau batas waktu bawaan: semuanya diatur Super Admin.
const U = require('../util');
const { rentang, bad, jkt, iso } = require('./keuangan');
const FMT = "to_char(%s AT TIME ZONE 'Asia/Jakarta','DD-MM-YYYY HH24:MI')";
const dt = c => FMT.replace('%s', c);

const DEF = {
  format_nomor: { pelanggaran: { prefix: 'PLG', digit: 6, reset: 'tahun' }, pembinaan: { prefix: 'PMB', digit: 6, reset: 'tahun' }, izin_keluar: { prefix: 'IZK', digit: 6, reset: 'tahun' }, izin_pulang: { prefix: 'IZP', digit: 6, reset: 'tahun' } },
  alur: { izin_keluar: 'wajib', izin_pulang: 'wajib' },
  peringatan_menit: 120,     // hanya penanda visual "jadwal kembali mendekat", bukan aturan
  toleransi_menit: 0,        // 0 = terlambat begitu lewat jadwal; diatur Super Admin bila pondok punya ketentuan
  identitas: { nama: 'Pondok Pesantren Alhidayah Induk', alamat: '', kontak: '', catatan: '' }
};
const ST_PLG = ['baru', 'proses', 'selesai'];
const idOf = v => { const n = parseInt(v, 10); return Number.isSafeInteger(n) && n > 0 ? n : null; };
function dtIn(v, label, e, key, req = true) {
  if (v == null || v === '') { if (req) e[key] = label + ' wajib diisi.'; return null; }
  const s = typeof v === 'string' ? v.trim().replace(' ', 'T') : '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) || isNaN(Date.parse(s + ':00+07:00')) || +s.slice(0, 4) < 2000) { e[key] = label + ' tidak valid.'; return null; }
  return s + ':00+07:00';
}
const timeIn = (v, e, key) => { if (v == null || v === '') return null; if (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim())) return v.trim(); e[key] = 'Waktu kejadian tidak valid (HH:MM).'; return null; };
const chk = e => { if (Object.keys(e).length) throw bad('Data belum valid.', e); };
const needK = b => { if (b.konfirmasi !== true) throw bad('Konfirmasi diperlukan untuk tindakan ini.'); };
const needAlasan = (v, key = 'alasan') => { const a = U.text(v, 500); if (a.length < 5) throw bad('Alasan wajib diisi (minimal 5 karakter).', { [key]: 'Alasan wajib diisi (minimal 5 karakter).' }); return a; };

function register(api, { db, auth, logBy, ah }) {
  const mod = auth.requireModule('keamanan');
  const onlySA = (req, res, next) => req.user.role === 'super_admin' ? next() : res.status(403).json({ error: 'Hanya Super Admin yang dapat membuka bagian ini.' });
  const kea = (req, fn) => db.tx(async q => { if (req.user.role === 'keamanan') await q('SET LOCAL ROLE sima_keamanan'); return fn(q); });
  const aud = (q, req, entitas, id, aksi, ket, alasan, sebelum, sesudah) => q('INSERT INTO kea_audit (waktu,user_id,username,entitas,entitas_id,aksi,ket,alasan,sebelum,sesudah) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [Date.now(), req.user.id, req.user.username, entitas, id, aksi, String(ket || '').slice(0, 300), alasan || null, sebelum ? JSON.stringify(sebelum) : null, sesudah ? JSON.stringify(sesudah) : null]);
  const lg = (req, aksi, ket) => logBy(req, aksi, 'keamanan', ket);
  const dbErr = err => { if (err && err.code === '23514') throw bad('Data tidak memenuhi aturan (mis. jadwal kembali harus setelah jadwal keluar, atau waktu aktual tidak konsisten).', null, 409); if (err && err.code === '23505' && /uq_kea_izin_out/.test(String(err.message))) throw bad('Santri ini sedang dalam keadaan izin (belum kembali).', null, 409); throw err; };

  async function setting(q, key) { const r = (await q('SELECT nilai FROM kea_pengaturan WHERE kunci=$1', [key]))[0]; return r ? r.nilai : DEF[key]; }
  async function nomorDok(q, kode) {
    const cfg = Object.assign({}, DEF.format_nomor[kode], ((await setting(q, 'format_nomor')) || {})[kode]), th = cfg.reset === 'tidak' ? 0 : jkt().getUTCFullYear();
    const n = (await q('INSERT INTO kea_counter (kode,tahun,nilai) VALUES ($1,$2,1) ON CONFLICT (kode,tahun) DO UPDATE SET nilai = kea_counter.nilai + 1 RETURNING nilai', [kode, th]))[0].nilai;
    const num = String(n).padStart(cfg.digit, '0'); return th ? `${cfg.prefix}-${th}-${num}` : `${cfg.prefix}-${num}`;
  }
  async function santriOf(q, b, aktif = true) {
    let s = null; if (idOf(b.santri_id)) s = (await q('SELECT * FROM v_santri_kea WHERE id=$1', [idOf(b.santri_id)]))[0]; else if (b.nis) s = (await q('SELECT * FROM v_santri_kea WHERE nis=$1', [U.str(b.nis, 30)]))[0];
    if (!s) throw bad('Santri tidak ditemukan.', { santri_id: 'Santri wajib dipilih (cari NIS atau nama).' });
    if (aktif && (s.status !== 'aktif' || s.diarsipkan)) throw bad('Santri bukan santri aktif (alumni atau diarsipkan) sehingga tidak dapat dicatat.', { santri_id: 'Santri bukan santri aktif.' }, 409);
    return s;
  }
  const dateOk = (v, label, e, key, notFuture = true, req = true) => { if (!v) { if (req) e[key] = label + ' wajib diisi.'; return null; } if (!U.isDate(v) || (notFuture && v > U.todayStr())) { e[key] = label + ' tidak valid' + (notFuture ? ' atau di masa depan.' : '.'); return null; } return v; };
  const pick = (o, keys) => keys.reduce((a, k) => (a[k] = o[k], a), {});
  const changed = (a, b, keys) => { const s = {}, d = {}; keys.forEach(k => { const x = a[k] == null ? null : String(a[k]).slice(0, 2000), y = b[k] == null ? null : String(b[k]).slice(0, 2000); if (x !== y) { s[k] = a[k]; d[k] = b[k]; } }); return [s, d]; };

  // ---------- Referensi ----------
  api.get('/keamanan/ref', mod, ah(async (req, res) => res.json(await kea(req, async q => {
    const st = await setting(q, 'peringatan_menit');
    return { kategori_pelanggaran: await q('SELECT id, nama FROM kea_kategori_pelanggaran WHERE aktif ORDER BY lower(nama)'), jenis_pembinaan: await q('SELECT id, nama FROM kea_jenis_pembinaan WHERE aktif ORDER BY lower(nama)'),
      jenis_izin: await q('SELECT id, jenis, nama FROM kea_jenis_izin WHERE aktif ORDER BY jenis, lower(nama)'), asrama: await q('SELECT DISTINCT asrama_id AS id, asrama AS nama, kelompok FROM v_santri_kea WHERE asrama_id IS NOT NULL AND status=\'aktif\' ORDER BY asrama'),
      kamar: await q('SELECT DISTINCT kamar_id AS id, kamar AS nama, asrama_id FROM v_santri_kea WHERE kamar_id IS NOT NULL AND status=\'aktif\' ORDER BY kamar'), alur: await setting(q, 'alur'), peringatan_menit: st, identitas: await setting(q, 'identitas') };
  }))));
  api.get('/keamanan/cari-santri', mod, ah(async (req, res) => {
    const s = U.str(req.query.q || '', 80);
    res.json({ rows: await kea(req, q => q(`SELECT id, nis, nama, kelompok, asrama, kamar FROM v_santri_kea WHERE status='aktif' AND NOT diarsipkan ${s ? 'AND (nama ILIKE $1 OR nis ILIKE $1)' : ''} ORDER BY nama LIMIT 15`, s ? ['%' + U.likeEsc(s) + '%'] : [])) });
  }));

  // ---------- Pelanggaran ----------
  const PLG_SEL = `SELECT p.id, p.nomor, p.tanggal::text AS tanggal, to_char(p.waktu,'HH24:MI') AS waktu, p.santri_id, s.nis, s.nama, s.kelompok, s.asrama, s.kamar, p.kategori_id, p.kategori, p.deskripsi, p.lokasi, p.catatan, p.status, p.batal, p.batal_alasan, p.berkas_id, p.dibuat, p.diubah, u.username AS petugas, u.nama AS petugas_nama
    FROM kea_pelanggaran p JOIN v_santri_kea s ON s.id=p.santri_id JOIN users u ON u.id=p.oleh`;
  function plgWhere(qs) {
    const w = U.where(), s = U.str(qs.q || '', 80);
    if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(s.nama ILIKE ${ph} OR s.nis ILIKE ${ph} OR p.nomor ILIKE ${ph})`); }
    if (U.isDate(qs.dari)) w.add('p.tanggal >= ?', qs.dari); if (U.isDate(qs.sampai)) w.add('p.tanggal <= ?', qs.sampai);
    if (idOf(qs.kategori_id)) w.add('p.kategori_id = ?', idOf(qs.kategori_id)); if (ST_PLG.includes(qs.status)) w.add('p.status = ?', qs.status);
    if (['putra', 'putri'].includes(qs.kelompok)) w.add('s.kelompok = ?', qs.kelompok); if (idOf(qs.asrama_id)) w.add('s.asrama_id = ?', idOf(qs.asrama_id)); if (idOf(qs.kamar_id)) w.add('s.kamar_id = ?', idOf(qs.kamar_id));
    if (idOf(qs.santri_id)) w.add('p.santri_id = ?', idOf(qs.santri_id));
    if (qs.batal !== 'semua') w.add(qs.batal === '1' ? 'p.batal' : 'NOT p.batal'); return w;
  }
  api.get('/keamanan/pelanggaran', mod, ah(async (req, res) => {
    const w = plgWhere(req.query), pg = U.pageOf(req.query), ord = U.orderBy(req.query, { tanggal: 'p.tanggal', nama: 's.nama', nis: 's.nis', kategori: 'p.kategori', status: 'p.status', nomor: 'p.nomor' }, 'tanggal') + ', p.id DESC';
    res.json(await kea(req, async q => ({ total: Number((await q(`SELECT COUNT(*) AS n FROM kea_pelanggaran p JOIN v_santri_kea s ON s.id=p.santri_id ${w.sql}`, w.params()))[0].n), page: pg.page, size: pg.size, rows: await q(`${PLG_SEL} ${w.sql} ORDER BY ${ord} LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) })));
  }));
  function readPlg(b, partial) {
    const e = {}, o = {};
    if (!partial || 'tanggal' in b) o.tanggal = dateOk(b.tanggal, 'Tanggal kejadian', e, 'tanggal'); if (!partial || 'waktu' in b) o.waktu = timeIn(b.waktu, e, 'waktu');
    if (!partial || 'kategori_id' in b) { o.kategori_id = idOf(b.kategori_id); if (!o.kategori_id) e.kategori_id = 'Kategori pelanggaran wajib dipilih.'; }
    if (!partial || 'deskripsi' in b) { o.deskripsi = U.text(b.deskripsi, 2000); if (o.deskripsi.length < 3) e.deskripsi = 'Deskripsi kejadian wajib diisi.'; }
    if (!partial || 'lokasi' in b) o.lokasi = U.strOrNull(b.lokasi, 150); if (!partial || 'catatan' in b) o.catatan = U.textOrNull(b.catatan, 1000);
    chk(e); return o;
  }
  api.post('/keamanan/pelanggaran', mod, ah(async (req, res) => {
    const b = req.body || {}, o = readPlg(b, false);
    const r = await kea(req, async q => {
      const s = await santriOf(q, b), k = (await q('SELECT id, nama FROM kea_kategori_pelanggaran WHERE id=$1 AND aktif', [o.kategori_id]))[0]; if (!k) throw bad('Kategori pelanggaran tidak tersedia atau nonaktif.', { kategori_id: 'Kategori tidak tersedia.' });
      const no = await nomorDok(q, 'pelanggaran');
      const x = (await q('INSERT INTO kea_pelanggaran (nomor,santri_id,tanggal,waktu,kategori_id,kategori,deskripsi,lokasi,catatan,asrama,kamar,dibuat,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id', [no, s.id, o.tanggal, o.waktu, k.id, k.nama, o.deskripsi, o.lokasi, o.catatan, s.asrama, s.kamar, Date.now(), req.user.id]))[0];
      await aud(q, req, 'pelanggaran', x.id, 'tambah', `Mencatat pelanggaran ${no} (${s.nama}, ${k.nama})`, null, null, { nomor: no, santri_id: s.id, kategori: k.nama, tanggal: o.tanggal });
      return { id: x.id, nomor: no };
    });
    await lg(req, 'tambah', `Pelanggaran ${r.nomor}`); res.status(201).json(r);
  }));
  api.get('/keamanan/pelanggaran/:id(\\d+)', mod, ah(async (req, res) => {
    const id = idOf(req.params.id);
    const out = await kea(req, async q => {
      const p = (await q(`${PLG_SEL} WHERE p.id=$1`, [id]))[0]; if (!p) return null;
      return { pelanggaran: p, pembinaan: await q("SELECT id, nomor, tanggal::text AS tanggal, jenis, pembina, status FROM kea_pembinaan WHERE pelanggaran_id=$1 ORDER BY id DESC", [id]), audit: await q("SELECT id, waktu, username, aksi, ket, alasan, sebelum, sesudah FROM kea_audit WHERE entitas='pelanggaran' AND entitas_id=$1 ORDER BY id DESC", [id]) };
    });
    if (!out) return res.status(404).json({ error: 'Catatan pelanggaran tidak ditemukan.' }); res.json(out);
  }));
  const PLG_F = ['tanggal', 'waktu', 'kategori_id', 'kategori', 'deskripsi', 'lokasi', 'catatan'];
  api.patch('/keamanan/pelanggaran/:id(\\d+)', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}, o = readPlg(b, true), alasan = needAlasan(b.alasan_koreksi, 'alasan_koreksi');
    await kea(req, async q => {
      const p = (await q('SELECT *, tanggal::text AS tanggal_s, to_char(waktu,\'HH24:MI\') AS waktu_s FROM kea_pelanggaran WHERE id=$1 FOR UPDATE', [id]))[0]; if (!p) throw bad('Catatan tidak ditemukan.', null, 404); if (p.batal) throw bad('Catatan yang dibatalkan tidak dapat diubah.', null, 409); p.tanggal = p.tanggal_s; p.waktu = p.waktu_s;
      if ('kategori_id' in o) { const k = (await q('SELECT id, nama FROM kea_kategori_pelanggaran WHERE id=$1 AND (aktif OR id=$2)', [o.kategori_id, p.kategori_id]))[0]; if (!k) throw bad('Kategori tidak tersedia.', { kategori_id: 'Kategori tidak tersedia.' }); o.kategori = k.nama; }
      const nv = Object.assign({}, p, o), [sb, sd] = changed(p, nv, PLG_F);
      if (!Object.keys(sd).length) throw bad('Tidak ada perubahan.');
      await q('UPDATE kea_pelanggaran SET tanggal=$1, waktu=$2, kategori_id=$3, kategori=$4, deskripsi=$5, lokasi=$6, catatan=$7, diubah=$8, diubah_oleh=$9 WHERE id=$10', [nv.tanggal, nv.waktu, nv.kategori_id, nv.kategori, nv.deskripsi, nv.lokasi, nv.catatan, Date.now(), req.user.id, id]);
      await aud(q, req, 'pelanggaran', id, 'ubah', `Mengubah pelanggaran ${p.nomor}`, alasan, sb, sd);
    });
    await lg(req, 'ubah', `Mengubah pelanggaran #${id}: ${alasan}`); res.json({ ok: true });
  }));
  api.post('/keamanan/pelanggaran/:id(\\d+)/status', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); if (!ST_PLG.includes(b.status)) throw bad('Status tidak valid.', { status: 'Status tidak valid.' });
    const cat = U.textOrNull(b.catatan, 500);
    await kea(req, async q => {
      const p = (await q('SELECT id, nomor, status, batal FROM kea_pelanggaran WHERE id=$1 FOR UPDATE', [id]))[0]; if (!p) throw bad('Catatan tidak ditemukan.', null, 404); if (p.batal) throw bad('Catatan dibatalkan.', null, 409); if (p.status === b.status) throw bad('Status sudah sama.', null, 409);
      await q('UPDATE kea_pelanggaran SET status=$1, diubah=$2, diubah_oleh=$3 WHERE id=$4', [b.status, Date.now(), req.user.id, id]); await aud(q, req, 'pelanggaran', id, 'status', `Status pelanggaran ${p.nomor}: ${p.status} → ${b.status}`, cat, { status: p.status }, { status: b.status });
    });
    await lg(req, 'status', `Status pelanggaran #${id} → ${b.status}`); res.json({ ok: true });
  }));
  api.post('/keamanan/pelanggaran/:id(\\d+)/batal', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const alasan = needAlasan(b.alasan);
    await kea(req, async q => {
      const p = (await q('SELECT id, nomor, batal FROM kea_pelanggaran WHERE id=$1 FOR UPDATE', [id]))[0]; if (!p) throw bad('Catatan tidak ditemukan.', null, 404); if (p.batal) throw bad('Catatan sudah dibatalkan.', null, 409);
      await q('UPDATE kea_pelanggaran SET batal=TRUE, batal_alasan=$1, batal_oleh=$2, batal_waktu=$3, diubah=$3, diubah_oleh=$2 WHERE id=$4', [alasan, req.user.id, Date.now(), id]); await aud(q, req, 'pelanggaran', id, 'batal', `Membatalkan pelanggaran ${p.nomor}`, alasan, { batal: false }, { batal: true });
    });
    await lg(req, 'batal', `Membatalkan pelanggaran #${id}: ${alasan}`); res.json({ ok: true });
  }));
  api.put('/keamanan/pelanggaran/:id(\\d+)/lampiran', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), f = U.readUpload(req.body, { pdf: true }); if (f.error) throw bad(f.error, { berkas: f.error });
    await db.tx(async q => {
      const p = (await q('SELECT id, nomor, berkas_id, batal FROM kea_pelanggaran WHERE id=$1 FOR UPDATE', [id]))[0]; if (!p) throw bad('Catatan tidak ditemukan.', null, 404); if (p.batal) throw bad('Catatan dibatalkan.', null, 409);
      const bid = (await q('INSERT INTO berkas (jenis,mime,ukuran,nama_asli,sha256,isi,diunggah,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', ['bukti_kea', f.mime, f.ukuran, f.nama, f.sha256, f.buf, Date.now(), req.user.id]))[0].id;
      await q('UPDATE kea_pelanggaran SET berkas_id=$1, diubah=$2, diubah_oleh=$3 WHERE id=$4', [bid, Date.now(), req.user.id, id]); await aud(q, req, 'pelanggaran', id, 'lampiran', `Lampiran pelanggaran ${p.nomor}`, null, { berkas_id: p.berkas_id }, { berkas_id: bid });
    });
    await lg(req, 'unggah', `Lampiran pelanggaran #${id}`); res.json({ ok: true });
  }));

  // ---------- Pembinaan ----------
  const PMB_SEL = `SELECT m.id, m.nomor, m.tanggal::text AS tanggal, m.santri_id, s.nis, s.nama, s.kelompok, s.asrama, s.kamar, m.pelanggaran_id, pl.nomor AS pelanggaran_nomor, m.alasan, m.jenis, m.pembina, m.hasil, m.rencana, m.tanggal_tindak::text AS tanggal_tindak, m.status, m.batal_alasan, m.dibuat, m.diubah, u.username AS petugas
    FROM kea_pembinaan m JOIN v_santri_kea s ON s.id=m.santri_id JOIN users u ON u.id=m.oleh LEFT JOIN kea_pelanggaran pl ON pl.id=m.pelanggaran_id`;
  api.get('/keamanan/pembinaan', mod, ah(async (req, res) => {
    const qs = req.query, w = U.where(), s = U.str(qs.q || '', 80), pg = U.pageOf(qs);
    if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(s.nama ILIKE ${ph} OR s.nis ILIKE ${ph} OR m.nomor ILIKE ${ph})`); }
    if (U.isDate(qs.dari)) w.add('m.tanggal >= ?', qs.dari); if (U.isDate(qs.sampai)) w.add('m.tanggal <= ?', qs.sampai); if (['berjalan', 'selesai', 'dibatalkan'].includes(qs.status)) w.add('m.status = ?', qs.status);
    if (['putra', 'putri'].includes(qs.kelompok)) w.add('s.kelompok = ?', qs.kelompok); if (idOf(qs.asrama_id)) w.add('s.asrama_id = ?', idOf(qs.asrama_id)); if (idOf(qs.santri_id)) w.add('m.santri_id = ?', idOf(qs.santri_id)); if (idOf(qs.jenis_id)) w.add('m.jenis_id = ?', idOf(qs.jenis_id));
    res.json(await kea(req, async q => ({ total: Number((await q(`SELECT COUNT(*) AS n FROM kea_pembinaan m JOIN v_santri_kea s ON s.id=m.santri_id ${w.sql}`, w.params()))[0].n), page: pg.page, size: pg.size, rows: await q(`${PMB_SEL} ${w.sql} ORDER BY m.tanggal DESC, m.id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) })));
  }));
  function readPmb(b, partial) {
    const e = {}, o = {};
    if (!partial || 'tanggal' in b) o.tanggal = dateOk(b.tanggal, 'Tanggal pembinaan', e, 'tanggal'); if (!partial || 'alasan' in b) { o.alasan = U.text(b.alasan, 2000); if (o.alasan.length < 3) e.alasan = 'Catatan atau alasan pembinaan wajib diisi.'; }
    if (!partial || 'jenis' in b || 'jenis_id' in b) { o.jenis_id = idOf(b.jenis_id); o.jenis = U.str(b.jenis, 100); if (!o.jenis_id && o.jenis.length < 2) e.jenis = 'Bentuk pembinaan wajib dipilih atau diisi.'; }
    if (!partial || 'pembina' in b) { o.pembina = U.str(b.pembina, 120); if (o.pembina.length < 2) e.pembina = 'Petugas pembina wajib diisi.'; }
    if (!partial || 'hasil' in b) o.hasil = U.textOrNull(b.hasil, 2000); if (!partial || 'rencana' in b) o.rencana = U.textOrNull(b.rencana, 2000);
    if (!partial || 'tanggal_tindak' in b) o.tanggal_tindak = dateOk(b.tanggal_tindak, 'Tanggal tindak lanjut', e, 'tanggal_tindak', false, false);
    chk(e); return o;
  }
  api.post('/keamanan/pembinaan', mod, ah(async (req, res) => {
    const b = req.body || {}; if (!b.pembina) b.pembina = req.user.nama || req.user.username; const o = readPmb(b, false);
    const r = await kea(req, async q => {
      const s = await santriOf(q, b); let pid = null;
      if (idOf(b.pelanggaran_id)) { const p = (await q('SELECT id, santri_id, batal FROM kea_pelanggaran WHERE id=$1', [idOf(b.pelanggaran_id)]))[0]; if (!p || p.santri_id !== s.id || p.batal) throw bad('Catatan pelanggaran tidak sesuai dengan santri ini atau sudah dibatalkan.', { pelanggaran_id: 'Pelanggaran tidak sesuai.' }, 409); pid = p.id; }
      if (o.jenis_id) { const j = (await q('SELECT nama FROM kea_jenis_pembinaan WHERE id=$1 AND aktif', [o.jenis_id]))[0]; if (!j) throw bad('Jenis pembinaan tidak tersedia.', { jenis: 'Jenis tidak tersedia.' }); o.jenis = j.nama; }
      const no = await nomorDok(q, 'pembinaan');
      const x = (await q('INSERT INTO kea_pembinaan (nomor,tanggal,santri_id,pelanggaran_id,alasan,jenis_id,jenis,pembina,hasil,rencana,tanggal_tindak,dibuat,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id', [no, o.tanggal, s.id, pid, o.alasan, o.jenis_id, o.jenis, o.pembina, o.hasil, o.rencana, o.tanggal_tindak, Date.now(), req.user.id]))[0];
      await aud(q, req, 'pembinaan', x.id, 'tambah', `Mencatat pembinaan ${no} (${s.nama})`, null, null, { nomor: no, santri_id: s.id, pelanggaran_id: pid, jenis: o.jenis });
      return { id: x.id, nomor: no };
    });
    await lg(req, 'tambah', `Pembinaan ${r.nomor}`); res.status(201).json(r);
  }));
  api.get('/keamanan/pembinaan/:id(\\d+)', mod, ah(async (req, res) => {
    const id = idOf(req.params.id);
    const out = await kea(req, async q => { const p = (await q(`${PMB_SEL} WHERE m.id=$1`, [id]))[0]; if (!p) return null; return { pembinaan: p, audit: await q("SELECT id, waktu, username, aksi, ket, alasan, sebelum, sesudah FROM kea_audit WHERE entitas='pembinaan' AND entitas_id=$1 ORDER BY id DESC", [id]) }; });
    if (!out) return res.status(404).json({ error: 'Catatan pembinaan tidak ditemukan.' }); res.json(out);
  }));
  const PMB_F = ['tanggal', 'alasan', 'jenis', 'jenis_id', 'pembina', 'hasil', 'rencana', 'tanggal_tindak'];
  api.patch('/keamanan/pembinaan/:id(\\d+)', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}, o = readPmb(b, true), alasan = needAlasan(b.alasan_koreksi, 'alasan_koreksi');
    await kea(req, async q => {
      const p = (await q('SELECT *, tanggal::text AS tanggal_s, tanggal_tindak::text AS tt_s FROM kea_pembinaan WHERE id=$1 FOR UPDATE', [id]))[0]; if (!p) throw bad('Catatan tidak ditemukan.', null, 404); if (p.status === 'dibatalkan') throw bad('Pembinaan yang dibatalkan tidak dapat diubah.', null, 409); p.tanggal = p.tanggal_s; p.tanggal_tindak = p.tt_s;
      if (o.jenis_id) { const j = (await q('SELECT nama FROM kea_jenis_pembinaan WHERE id=$1 AND (aktif OR id=$2)', [o.jenis_id, p.jenis_id]))[0]; if (!j) throw bad('Jenis pembinaan tidak tersedia.', { jenis: 'Jenis tidak tersedia.' }); o.jenis = j.nama; }
      const nv = Object.assign({}, p, o), [sb, sd] = changed(p, nv, PMB_F);
      if (!Object.keys(sd).length) throw bad('Tidak ada perubahan.');
      await q('UPDATE kea_pembinaan SET tanggal=$1, alasan=$2, jenis_id=$3, jenis=$4, pembina=$5, hasil=$6, rencana=$7, tanggal_tindak=$8, diubah=$9, diubah_oleh=$10 WHERE id=$11', [nv.tanggal, nv.alasan, nv.jenis_id, nv.jenis, nv.pembina, nv.hasil, nv.rencana, nv.tanggal_tindak, Date.now(), req.user.id, id]);
      await aud(q, req, 'pembinaan', id, 'ubah', `Mengubah pembinaan ${p.nomor}`, alasan, sb, sd);
    });
    await lg(req, 'ubah', `Mengubah pembinaan #${id}: ${alasan}`); res.json({ ok: true });
  }));
  api.post('/keamanan/pembinaan/:id(\\d+)/status', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); if (!['berjalan', 'selesai'].includes(b.status)) throw bad('Status tidak valid.', { status: 'Status tidak valid.' });
    await kea(req, async q => {
      const p = (await q('SELECT id, nomor, status FROM kea_pembinaan WHERE id=$1 FOR UPDATE', [id]))[0]; if (!p) throw bad('Catatan tidak ditemukan.', null, 404); if (p.status === 'dibatalkan') throw bad('Pembinaan dibatalkan.', null, 409); if (p.status === b.status) throw bad('Status sudah sama.', null, 409);
      await q('UPDATE kea_pembinaan SET status=$1, diubah=$2, diubah_oleh=$3 WHERE id=$4', [b.status, Date.now(), req.user.id, id]); await aud(q, req, 'pembinaan', id, 'status', `Status pembinaan ${p.nomor}: ${p.status} → ${b.status}`, U.textOrNull(b.catatan, 500), { status: p.status }, { status: b.status });
    });
    await lg(req, 'status', `Status pembinaan #${id} → ${b.status}`); res.json({ ok: true });
  }));
  api.post('/keamanan/pembinaan/:id(\\d+)/batal', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}; needK(b); const alasan = needAlasan(b.alasan);
    await kea(req, async q => {
      const p = (await q('SELECT id, nomor, status FROM kea_pembinaan WHERE id=$1 FOR UPDATE', [id]))[0]; if (!p) throw bad('Catatan tidak ditemukan.', null, 404); if (p.status === 'dibatalkan') throw bad('Sudah dibatalkan.', null, 409);
      await q("UPDATE kea_pembinaan SET status='dibatalkan', batal_alasan=$1, batal_oleh=$2, batal_waktu=$3, diubah=$3, diubah_oleh=$2 WHERE id=$4", [alasan, req.user.id, Date.now(), id]); await aud(q, req, 'pembinaan', id, 'batal', `Membatalkan pembinaan ${p.nomor}`, alasan, { status: p.status }, { status: 'dibatalkan' });
    });
    await lg(req, 'batal', `Membatalkan pembinaan #${id}: ${alasan}`); res.json({ ok: true });
  }));

  // ---------- Perizinan (keluar / pulang) ----------
  const tolOf = async q => Math.max(0, Math.min(1440, parseInt(await setting(q, 'toleransi_menit'), 10) || 0)), prgOf = async q => Math.max(1, Math.min(1440, parseInt(await setting(q, 'peringatan_menit'), 10) || 120));
  const izinSel = (tol, prg) => `SELECT i.id, i.nomor, i.jenis, i.santri_id, s.nis, s.nama, s.kelompok, s.asrama, s.kamar, s.status AS status_santri, i.tgl_pengajuan::text AS tgl_pengajuan, i.tujuan, i.alasan, i.jenis_izin, i.alamat_tujuan, i.pendamping, i.kontak_pendamping, i.wali, i.kontak_wali,
    i.rencana_keluar, i.rencana_kembali, i.aktual_keluar, i.aktual_kembali, i.status, i.disetujui_nama, i.disetujui_waktu, i.alasan_tolak, i.alasan_batal, i.catatan, i.tindak_status, i.tindak_catatan, i.dibuat, u.username AS petugas,
    CASE WHEN i.status = 'sedang_izin' AND now() > i.rencana_kembali + interval '${tol} minutes' THEN 'terlambat' WHEN i.status = 'sedang_izin' AND now() > i.rencana_kembali - interval '${prg} minutes' THEN 'mendekat' WHEN i.status = 'sedang_izin' THEN 'berlangsung' ELSE i.status END AS status_tampil,
    CASE WHEN i.status IN ('sedang_izin','kembali') THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(i.aktual_kembali, now()) - i.rencana_kembali)) / 60))::int END AS telat_menit,
    (i.status = 'kembali' AND i.aktual_kembali > i.rencana_kembali + interval '${tol} minutes') AS kembali_terlambat
    FROM kea_izin i JOIN v_santri_kea s ON s.id=i.santri_id JOIN users u ON u.id=i.oleh`;
  function izinWhere(qs, jenis) {
    const w = U.where(), s = U.str(qs.q || '', 80); if (jenis) w.add('i.jenis = ?', jenis);
    if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(s.nama ILIKE ${ph} OR s.nis ILIKE ${ph} OR i.nomor ILIKE ${ph})`); }
    if (U.isDate(qs.dari)) w.add('i.tgl_pengajuan >= ?', qs.dari); if (U.isDate(qs.sampai)) w.add('i.tgl_pengajuan <= ?', qs.sampai);
    if (['putra', 'putri'].includes(qs.kelompok)) w.add('s.kelompok = ?', qs.kelompok); if (idOf(qs.asrama_id)) w.add('s.asrama_id = ?', idOf(qs.asrama_id)); if (idOf(qs.kamar_id)) w.add('s.kamar_id = ?', idOf(qs.kamar_id)); if (idOf(qs.santri_id)) w.add('i.santri_id = ?', idOf(qs.santri_id)); if (idOf(qs.jenis_izin_id)) w.add('i.jenis_izin_id = ?', idOf(qs.jenis_izin_id));
    return w;
  }
  const STAMPIL = ['menunggu', 'disetujui', 'ditolak', 'berlangsung', 'mendekat', 'terlambat', 'kembali', 'dibatalkan'];
  for (const jenis of ['keluar', 'pulang']) {
    api.get('/keamanan/izin-' + jenis, mod, ah(async (req, res) => {
      const qs = req.query, pg = U.pageOf(qs);
      res.json(await kea(req, async q => {
        const tol = await tolOf(q), prg = await prgOf(q), w = izinWhere(qs, jenis), base = izinSel(tol, prg);
        const st = qs.status; let having = ''; if (st === 'sedang_izin') having = "i.status = 'sedang_izin'"; else if (STAMPIL.includes(st)) having = `x.status_tampil = '${st}'`;
        const sql = `SELECT * FROM (${base} ${w.sql}) x ${having.startsWith('x.') ? 'WHERE ' + having : having ? "WHERE x.status = 'sedang_izin'" : ''}`;
        return { total: Number((await q(`SELECT COUNT(*) AS n FROM (${sql}) y`, w.params()))[0].n), page: pg.page, size: pg.size, rows: await q(`${sql} ORDER BY x.id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) };
      }));
    }));
    api.post('/keamanan/izin-' + jenis, mod, ah(async (req, res) => {
      const b = req.body || {}, e = {}; const tgl = dateOk(b.tgl_pengajuan || U.todayStr(), 'Tanggal pengajuan', e, 'tgl_pengajuan');
      const tujuan = U.str(b.tujuan, 200); if (tujuan.length < 2) e.tujuan = 'Tujuan wajib diisi.'; const rk = dtIn(b.rencana_keluar, 'Rencana keluar', e, 'rencana_keluar'), rb = dtIn(b.rencana_kembali, 'Perkiraan kembali', e, 'rencana_kembali');
      if (rk && rb && Date.parse(rb) <= Date.parse(rk)) e.rencana_kembali = 'Jadwal kembali harus setelah jadwal keluar.'; chk(e);
      const r = await kea(req, async q => {
        const s = await santriOf(q, b); let ji = null, jn = null;
        if (idOf(b.jenis_izin_id)) { const j = (await q('SELECT id, nama FROM kea_jenis_izin WHERE id=$1 AND jenis=$2 AND aktif', [idOf(b.jenis_izin_id), jenis]))[0]; if (!j) throw bad('Jenis izin tidak tersedia.', { jenis_izin_id: 'Jenis izin tidak tersedia.' }); ji = j.id; jn = j.nama; }
        const ov = await q("SELECT nomor FROM kea_izin WHERE santri_id=$1 AND jenis=$2 AND status IN ('menunggu','disetujui','sedang_izin') AND rencana_keluar < $4::timestamptz AND rencana_kembali > $3::timestamptz LIMIT 1", [s.id, jenis, rk, rb]);
        if (ov.length) throw bad(`Jadwal tumpang tindih dengan izin ${ov[0].nomor} yang masih aktif untuk santri ini.`, { rencana_keluar: 'Tumpang tindih dengan izin lain.' }, 409);
        const langsung = (await setting(q, 'alur'))['izin_' + jenis] === 'langsung', no = await nomorDok(q, 'izin_' + jenis);
        const x = (await q(`INSERT INTO kea_izin (nomor,jenis,santri_id,tgl_pengajuan,tujuan,alasan,jenis_izin_id,jenis_izin,alamat_tujuan,pendamping,kontak_pendamping,wali,kontak_wali,rencana_keluar,rencana_kembali,status,disetujui_oleh,disetujui_nama,disetujui_waktu,catatan,asrama,kamar,dibuat,oleh)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING id`,
          [no, jenis, s.id, tgl, tujuan, U.textOrNull(b.alasan, 1000), ji, jn, U.textOrNull(b.alamat_tujuan, 400), U.strOrNull(b.pendamping, 150), U.strOrNull(b.kontak_pendamping, 30), U.strOrNull(b.wali, 150), U.strOrNull(b.kontak_wali, 30), rk, rb, langsung ? 'disetujui' : 'menunggu',
            langsung ? req.user.id : null, langsung ? (req.user.nama || req.user.username) : null, langsung ? Date.now() : null, U.textOrNull(b.catatan, 1000), s.asrama, s.kamar, Date.now(), req.user.id]))[0];
        await aud(q, req, 'izin', x.id, 'ajukan', `Mencatat pengajuan izin ${jenis} ${no} (${s.nama})${langsung ? ' — disetujui langsung (sesuai alur pengaturan)' : ''}`, null, null, { nomor: no, santri_id: s.id, tujuan, rencana_keluar: rk, rencana_kembali: rb });
        return { id: x.id, nomor: no, status: langsung ? 'disetujui' : 'menunggu' };
      }).catch(dbErr);
      await lg(req, 'tambah', `Izin ${jenis} ${r.nomor}`); res.status(201).json(r);
    }));
  }
  api.get('/keamanan/izin/:id(\\d+)', mod, ah(async (req, res) => {
    const id = idOf(req.params.id);
    const out = await kea(req, async q => { const i = (await q(`${izinSel(await tolOf(q), await prgOf(q))} WHERE i.id=$1`, [id]))[0]; if (!i) return null; return { izin: i, audit: await q("SELECT id, waktu, username, aksi, ket, alasan, sebelum, sesudah FROM kea_audit WHERE entitas='izin' AND entitas_id=$1 ORDER BY id DESC", [id]) }; });
    if (!out) return res.status(404).json({ error: 'Data izin tidak ditemukan.' }); res.json(out);
  }));
  // transisi alur izin (baris dikunci; trigger DB menjaga urutan status)
  async function transisi(req, res, aksi, fn) {
    const id = idOf(req.params.id), b = req.body || {}; needK(b);
    const r = await kea(req, async q => {
      const i = (await q('SELECT i.*, s.status AS status_santri, s.diarsipkan AS santri_arsip, s.nama AS santri FROM kea_izin i JOIN v_santri_kea s ON s.id=i.santri_id WHERE i.id=$1 FOR UPDATE OF i', [id]))[0]; if (!i) throw bad('Data izin tidak ditemukan.', null, 404);
      return fn(q, i, b);
    }).catch(dbErr);
    await lg(req, aksi, `Izin #${id}: ${r.ket}`); res.json({ ok: true, status: r.status });
  }
  const setStatus = (q, req, i, aksi, status, extra, ket, alasan) => {
    const cols = Object.keys(extra), vals = cols.map(c => extra[c]);
    return q(`UPDATE kea_izin SET status=$1, diubah=$2, diubah_oleh=$3${cols.map((c, k) => `, ${c}=$${k + 4}`).join('')} WHERE id=$${cols.length + 4}`, [status, Date.now(), req.user.id].concat(vals, [i.id]))
      .then(() => aud(q, req, 'izin', i.id, aksi, `${ket} ${i.nomor} (${i.santri})`, alasan, { status: i.status }, { status, ...Object.fromEntries(cols.map((c, k) => [c, vals[k]])) })).then(() => ({ ket: `${ket} ${i.nomor}`, status }));
  };
  api.post('/keamanan/izin/:id(\\d+)/setujui', mod, ah((req, res) => transisi(req, res, 'setujui', async (q, i, b) => {
    if (i.status !== 'menunggu') throw bad('Hanya izin berstatus Menunggu persetujuan yang dapat disetujui.', null, 409); if (i.status_santri !== 'aktif' || i.santri_arsip) throw bad('Santri bukan santri aktif.', null, 409);
    return setStatus(q, req, i, 'setujui', 'disetujui', { disetujui_oleh: req.user.id, disetujui_nama: req.user.nama || req.user.username, disetujui_waktu: Date.now() }, 'Menyetujui izin', U.textOrNull(b.catatan, 500));
  })));
  api.post('/keamanan/izin/:id(\\d+)/tolak', mod, ah((req, res) => transisi(req, res, 'tolak', async (q, i, b) => {
    const alasan = needAlasan(b.alasan); if (i.status !== 'menunggu') throw bad('Hanya izin berstatus Menunggu persetujuan yang dapat ditolak.', null, 409);
    return setStatus(q, req, i, 'tolak', 'ditolak', { disetujui_oleh: req.user.id, disetujui_nama: req.user.nama || req.user.username, disetujui_waktu: Date.now(), alasan_tolak: alasan }, 'Menolak izin', alasan);
  })));
  api.post('/keamanan/izin/:id(\\d+)/batal', mod, ah((req, res) => transisi(req, res, 'batal', async (q, i, b) => {
    const alasan = needAlasan(b.alasan); if (!['menunggu', 'disetujui'].includes(i.status)) throw bad('Izin hanya dapat dibatalkan sebelum santri keluar. Gunakan koreksi untuk izin yang sudah berjalan.', null, 409);
    return setStatus(q, req, i, 'batal', 'dibatalkan', { alasan_batal: alasan }, 'Membatalkan izin', alasan);
  })));
  const nowCheck = async (q, w, label, min) => { const e = {}, v = w ? dtIn(w, label, e, 'waktu') : null; chk(e); const r = (await q('SELECT ($1::timestamptz)::timestamptz AS t, now() AS n', [v]))[0]; if (v && new Date(r.t) > new Date(new Date(r.n).getTime() + 60000)) throw bad(label + ' tidak boleh di masa depan.', { waktu: 'Tidak boleh di masa depan.' }); if (v && min && new Date(r.t) < new Date(min)) throw bad(label + ' tidak boleh sebelum waktu keluar.', { waktu: 'Sebelum waktu keluar.' }); return v; };
  api.post('/keamanan/izin/:id(\\d+)/keluar', mod, ah((req, res) => transisi(req, res, 'keluar', async (q, i, b) => {
    if (i.status !== 'disetujui') throw bad('Keberangkatan hanya dapat dicatat untuk izin yang sudah disetujui.', null, 409); if (i.status_santri !== 'aktif' || i.santri_arsip) throw bad('Santri bukan santri aktif.', null, 409);
    const w = await nowCheck(q, b.waktu, 'Waktu keluar');
    return setStatus(q, req, i, 'keluar', 'sedang_izin', { aktual_keluar: w || new Date() }, 'Mencatat keberangkatan', null);
  })));
  api.post('/keamanan/izin/:id(\\d+)/kembali', mod, ah((req, res) => transisi(req, res, 'kembali', async (q, i, b) => {
    if (i.status !== 'sedang_izin') throw bad('Kedatangan hanya dapat dicatat untuk santri yang sedang izin.', null, 409);
    const w = await nowCheck(q, b.waktu, 'Waktu kembali', i.aktual_keluar);
    return setStatus(q, req, i, 'kembali', 'kembali', { aktual_kembali: w || new Date() }, 'Mencatat kedatangan', U.textOrNull(b.catatan, 500));
  })));
  const IZ_F = ['tujuan', 'alasan', 'jenis_izin', 'alamat_tujuan', 'pendamping', 'kontak_pendamping', 'wali', 'kontak_wali', 'catatan', 'rencana_keluar', 'rencana_kembali', 'aktual_keluar', 'aktual_kembali'];
  api.post('/keamanan/izin/:id(\\d+)/koreksi', mod, ah((req, res) => transisi(req, res, 'koreksi', async (q, i, b) => {
    const alasan = needAlasan(b.alasan_koreksi, 'alasan_koreksi'), e = {}, nv = {};
    for (const k of ['tujuan', 'alasan', 'alamat_tujuan', 'pendamping', 'kontak_pendamping', 'wali', 'kontak_wali', 'catatan']) if (k in b) nv[k] = U.textOrNull(b[k], k === 'tujuan' ? 200 : 1000);
    if ('tujuan' in nv && (!nv.tujuan || nv.tujuan.length < 2)) e.tujuan = 'Tujuan wajib diisi.';
    for (const k of ['rencana_keluar', 'rencana_kembali']) if (k in b) nv[k] = dtIn(b[k], k === 'rencana_keluar' ? 'Rencana keluar' : 'Rencana kembali', e, k);
    if ('aktual_keluar' in b) { if (!['sedang_izin', 'kembali'].includes(i.status)) e.aktual_keluar = 'Waktu keluar aktual hanya dapat dikoreksi setelah santri keluar.'; else nv.aktual_keluar = dtIn(b.aktual_keluar, 'Waktu keluar aktual', e, 'aktual_keluar'); }
    if ('aktual_kembali' in b) { if (i.status !== 'kembali') e.aktual_kembali = 'Waktu kembali aktual hanya dapat dikoreksi setelah santri kembali.'; else nv.aktual_kembali = dtIn(b.aktual_kembali, 'Waktu kembali aktual', e, 'aktual_kembali'); }
    chk(e); const keys = Object.keys(nv); if (!keys.length) throw bad('Tidak ada perubahan.');
    const sebelum = {}, sesudah = {}; for (const k of keys) { const old = i[k] && i[k].toISOString ? i[k].toISOString() : i[k]; sebelum[k] = old; sesudah[k] = nv[k]; }
    await q(`UPDATE kea_izin SET diubah=$1, diubah_oleh=$2${keys.map((k, n) => `, ${k}=$${n + 3}${/^(rencana|aktual)/.test(k) ? '::timestamptz' : ''}`).join('')} WHERE id=$${keys.length + 3}`, [Date.now(), req.user.id].concat(keys.map(k => nv[k]), [i.id]));
    await aud(q, req, 'izin', i.id, 'koreksi', `Koreksi data izin ${i.nomor} (${i.santri})`, alasan, sebelum, sesudah); return { ket: `Koreksi ${i.nomor}`, status: i.status };
  })));
  api.post('/keamanan/izin/:id(\\d+)/tindak', mod, ah((req, res) => transisi(req, res, 'tindak', async (q, i, b) => {
    if (!['belum', 'dihubungi', 'dalam_proses', 'selesai'].includes(b.tindak_status)) throw bad('Status tindak lanjut tidak valid.', { tindak_status: 'Tidak valid.' }); if (i.status !== 'sedang_izin') throw bad('Tindak lanjut hanya untuk santri yang masih di luar.', null, 409);
    const cat = U.textOrNull(b.tindak_catatan, 500); await q('UPDATE kea_izin SET tindak_status=$1, tindak_catatan=$2, diubah=$3, diubah_oleh=$4 WHERE id=$5', [b.tindak_status, cat, Date.now(), req.user.id, i.id]);
    await aud(q, req, 'izin', i.id, 'tindak', `Tindak lanjut ${i.nomor}: ${b.tindak_status}`, cat, { tindak_status: i.tindak_status, tindak_catatan: i.tindak_catatan }, { tindak_status: b.tindak_status, tindak_catatan: cat }); return { ket: `Tindak lanjut ${i.nomor}`, status: i.status };
  })));

  // ---------- Monitoring santri belum kembali ----------
  api.get('/keamanan/monitoring', mod, ah(async (req, res) => {
    const qs = req.query;
    res.json(await kea(req, async q => {
      const tol = await tolOf(q), prg = await prgOf(q), w = izinWhere(qs, ['keluar', 'pulang'].includes(qs.jenis) ? qs.jenis : null), base = izinSel(tol, prg), tampil = ['terlambat', 'mendekat', 'berlangsung', 'kembali', 'semua'].includes(qs.tampil) ? qs.tampil : 'aktif';
      w.sql; const cond = tampil === 'kembali' ? "x.status = 'kembali'" : tampil === 'aktif' || tampil === 'semua' ? "x.status = 'sedang_izin'" : `x.status_tampil = '${tampil}'`;
      const cnt = (await q(`SELECT COUNT(*) FILTER (WHERE x.status_tampil='berlangsung')::int berlangsung, COUNT(*) FILTER (WHERE x.status_tampil='mendekat')::int mendekat, COUNT(*) FILTER (WHERE x.status_tampil='terlambat')::int terlambat FROM (${base} WHERE i.status='sedang_izin') x`))[0];
      const dr = tampil === 'kembali' && !U.isDate(qs.dari) ? ` AND x.aktual_kembali >= now() - interval '7 days'` : '';
      const rows = await q(`SELECT * FROM (${base} ${w.sql}) x WHERE ${cond}${dr} ORDER BY ${tampil === 'kembali' ? 'x.aktual_kembali DESC' : 'x.telat_menit DESC, x.rencana_kembali ASC'} LIMIT 500`, w.params());
      return { ringkasan: cnt, tampil, peringatan_menit: prg, toleransi_menit: tol, rows, sekarang: new Date().toISOString() };
    }));
  }));

  // ---------- Profil keamanan santri + pencarian terpusat ----------
  api.get('/keamanan/santri', mod, ah(async (req, res) => {
    const qs = req.query, pg = U.pageOf(qs), w = U.where(), s = U.str(qs.q || '', 80); w.add("s.status = 'aktif' AND NOT s.diarsipkan");
    if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(s.nama ILIKE ${ph} OR s.nis ILIKE ${ph})`); }
    if (['putra', 'putri'].includes(qs.kelompok)) w.add('s.kelompok = ?', qs.kelompok); if (idOf(qs.asrama_id)) w.add('s.asrama_id = ?', idOf(qs.asrama_id)); if (idOf(qs.kamar_id)) w.add('s.kamar_id = ?', idOf(qs.kamar_id));
    const cepat = qs.cepat || '', pl = ['NOT p.batal', 'p.santri_id = s.id'];
    if (idOf(qs.kategori_id)) pl.push('p.kategori_id = ' + idOf(qs.kategori_id)); if (U.isDate(qs.dari)) pl.push(`p.tanggal >= '${qs.dari}'`); if (U.isDate(qs.sampai)) pl.push(`p.tanggal <= '${qs.sampai}'`);
    if (cepat === 'pelanggaran_terbaru') pl.push("p.tanggal >= (now() AT TIME ZONE 'Asia/Jakarta')::date - 30");
    if (idOf(qs.kategori_id) || U.isDate(qs.dari) || U.isDate(qs.sampai) || cepat === 'pelanggaran_terbaru') w.add(`EXISTS (SELECT 1 FROM kea_pelanggaran p WHERE ${pl.join(' AND ')})`);
    if (qs.pembinaan === 'berjalan' || cepat === 'pembinaan_berjalan') w.add("EXISTS (SELECT 1 FROM kea_pembinaan m WHERE m.santri_id = s.id AND m.status = 'berjalan')"); else if (['selesai'].includes(qs.pembinaan)) w.add("EXISTS (SELECT 1 FROM kea_pembinaan m WHERE m.santri_id = s.id AND m.status = 'selesai')");
    const iz = qs.izin || (cepat === 'izin_berlangsung' ? 'sedang' : cepat === 'belum_kembali' ? 'terlambat' : cepat === 'izin_selesai' ? 'selesai' : '');
    res.json(await kea(req, async q => {
      const tol = await tolOf(q);
      if (iz === 'sedang') w.add("EXISTS (SELECT 1 FROM kea_izin i WHERE i.santri_id = s.id AND i.status = 'sedang_izin')"); else if (iz === 'terlambat') w.add(`EXISTS (SELECT 1 FROM kea_izin i WHERE i.santri_id = s.id AND i.status = 'sedang_izin' AND now() > i.rencana_kembali + interval '${tol} minutes')`); else if (iz === 'selesai') w.add("EXISTS (SELECT 1 FROM kea_izin i WHERE i.santri_id = s.id AND i.status = 'kembali')");
      else if (['menunggu', 'disetujui', 'ditolak', 'dibatalkan'].includes(iz)) w.add(`EXISTS (SELECT 1 FROM kea_izin i WHERE i.santri_id = s.id AND i.status = '${iz}')`);
      const total = Number((await q(`SELECT COUNT(*) AS n FROM v_santri_kea s ${w.sql}`, w.params()))[0].n);
      const rows = await q(`SELECT s.id, s.nis, s.nama, s.kelompok, s.asrama, s.kamar, s.foto,
        (SELECT COUNT(*)::int FROM kea_pelanggaran p WHERE p.santri_id=s.id AND NOT p.batal) AS n_pelanggaran, (SELECT MAX(p.tanggal)::text FROM kea_pelanggaran p WHERE p.santri_id=s.id AND NOT p.batal) AS pelanggaran_terakhir,
        (SELECT COUNT(*)::int FROM kea_pembinaan m WHERE m.santri_id=s.id AND m.status='berjalan') AS n_pembinaan_berjalan,
        (SELECT CASE WHEN now() > i.rencana_kembali + interval '${tol} minutes' THEN 'terlambat' ELSE 'berlangsung' END FROM kea_izin i WHERE i.santri_id=s.id AND i.status='sedang_izin' LIMIT 1) AS izin_sekarang
        FROM v_santri_kea s ${w.sql} ORDER BY ${cepat === 'pelanggaran_terbaru' ? '(SELECT MAX(p.tanggal) FROM kea_pelanggaran p WHERE p.santri_id=s.id AND NOT p.batal) DESC NULLS LAST, ' : ''}s.nama LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params());
      return { total, page: pg.page, size: pg.size, rows };
    }));
  }));
  api.get('/keamanan/santri/:id(\\d+)', mod, ah(async (req, res) => {
    const id = idOf(req.params.id);
    const out = await kea(req, async q => {
      const s = (await q('SELECT id, nis, nama, foto, kelompok, status, diarsipkan, asrama, kamar FROM v_santri_kea WHERE id=$1', [id]))[0]; if (!s) return null;
      const tol = await tolOf(q), prg = await prgOf(q), iz = await q(`${izinSel(tol, prg)} WHERE i.santri_id=$1 ORDER BY i.id DESC`, [id]);
      return { santri: s, pelanggaran: await q(`${PLG_SEL} WHERE p.santri_id=$1 ORDER BY p.tanggal DESC, p.id DESC`, [id]), pembinaan: await q(`${PMB_SEL} WHERE m.santri_id=$1 ORDER BY m.tanggal DESC, m.id DESC`, [id]), izin_keluar: iz.filter(x => x.jenis === 'keluar'), izin_pulang: iz.filter(x => x.jenis === 'pulang') };
    });
    if (!out) return res.status(404).json({ error: 'Santri tidak ditemukan.' }); res.json(out);
  }));

  // ---------- Dashboard ----------
  api.get('/keamanan/dashboard', mod, ah(async (req, res) => {
    const qs = req.query, hasRange = U.isDate(qs.dari) && U.isDate(qs.sampai);
    const out = await kea(req, async q => {
      const tol = await tolOf(q), sw = U.where(); sw.add("s.status = 'aktif' AND NOT s.diarsipkan"); if (['putra', 'putri'].includes(qs.kelompok)) sw.add('s.kelompok = ?', qs.kelompok); if (idOf(qs.asrama_id)) sw.add('s.asrama_id = ?', idOf(qs.asrama_id));
      const sp = sw.params(), pOff = sp.length, rg = hasRange ? [qs.dari, qs.sampai] : [], bln = rentang({ periode: 'bulan' });
      const dP = hasRange ? ` AND p.tanggal BETWEEN $${pOff + 1} AND $${pOff + 2}` : '', dI = hasRange ? ` AND i.tgl_pengajuan BETWEEN $${pOff + 1} AND $${pOff + 2}` : '', dM = hasRange ? ` AND m.tanggal BETWEEN $${pOff + 1} AND $${pOff + 2}` : '', par = sp.concat(rg);
      const one = async (sql, p) => (await q(sql, p || par))[0];
      const santri = await one(`SELECT COUNT(*)::int n FROM v_santri_kea s ${sw.sql}`, sp);
      const plg = await one(`SELECT COUNT(*)::int n FROM kea_pelanggaran p JOIN v_santri_kea s ON s.id=p.santri_id ${sw.sql} AND NOT p.batal${dP}`);
      const plgBln = await one(`SELECT COUNT(*)::int n FROM kea_pelanggaran p JOIN v_santri_kea s ON s.id=p.santri_id ${sw.sql} AND NOT p.batal AND p.tanggal BETWEEN '${bln.dari}' AND '${bln.sampai}'`, sp);
      const pmb = await one(`SELECT COUNT(DISTINCT m.santri_id)::int n, COUNT(*) FILTER (WHERE m.status='berjalan')::int berjalan FROM kea_pembinaan m JOIN v_santri_kea s ON s.id=m.santri_id ${sw.sql} AND m.status <> 'dibatalkan'${dM}`);
      const iz = await one(`SELECT COUNT(*) FILTER (WHERE i.status='sedang_izin')::int sedang, COUNT(*) FILTER (WHERE i.status='sedang_izin' AND now() > i.rencana_kembali + interval '${tol} minutes')::int terlambat, COUNT(*) FILTER (WHERE i.status='kembali')::int selesai,
        COUNT(*) FILTER (WHERE i.status='menunggu')::int menunggu FROM kea_izin i JOIN v_santri_kea s ON s.id=i.santri_id ${sw.sql}${dI}`);
      const perBulan = await q(`SELECT to_char(p.tanggal,'YYYY-MM') AS k, COUNT(*)::int v FROM kea_pelanggaran p JOIN v_santri_kea s ON s.id=p.santri_id ${sw.sql} AND NOT p.batal${dP || ` AND p.tanggal >= date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta')::date - interval '11 months'`} GROUP BY 1 ORDER BY 1`, par);
      const kat = await q(`SELECT p.kategori AS k, COUNT(*)::int v FROM kea_pelanggaran p JOIN v_santri_kea s ON s.id=p.santri_id ${sw.sql} AND NOT p.batal${dP} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 12`, par);
      const izs = await q(`SELECT i.jenis, CASE WHEN i.status='sedang_izin' AND now() > i.rencana_kembali + interval '${tol} minutes' THEN 'terlambat' ELSE i.status END AS st, COUNT(*)::int v FROM kea_izin i JOIN v_santri_kea s ON s.id=i.santri_id ${sw.sql}${dI} GROUP BY 1,2`, par);
      const akt = await q('SELECT waktu, username, aksi, ket FROM kea_audit ORDER BY id DESC LIMIT 10');
      return { santri, plg, plgBln, pmb, iz, perBulan, kat, izs, akt };
    });
    // lengkapi 12 bulan terakhir bila tanpa rentang
    const months = []; if (!hasRange) { const t = jkt(); for (let k = 11; k >= 0; k--) { const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - k, 1)); months.push(iso(d).slice(0, 7)); } }
    const mp = Object.fromEntries(out.perBulan.map(x => [x.k, x.v])), series = hasRange ? out.perBulan : months.map(k => ({ k, v: mp[k] || 0 }));
    res.json({ filter: { dari: hasRange ? qs.dari : null, sampai: hasRange ? qs.sampai : null, kelompok: qs.kelompok || null, asrama_id: idOf(qs.asrama_id) },
      santri_aktif: out.santri.n, pelanggaran: { total: out.plg.n, bulan_ini: out.plgBln.n }, pembinaan: { santri: out.pmb.n, berjalan: out.pmb.berjalan }, izin: { sedang: out.iz.sedang, terlambat: out.iz.terlambat, selesai: out.iz.selesai, menunggu: out.iz.menunggu },
      grafik: { bulan: series, kategori: out.kat, izin: out.izs }, aktivitas: out.akt });
  }));

  // ---------- Laporan ----------
  require('./kea-laporan').register(api, { db, logBy, ah, mod, kea, setting, tolOf, izinSel, izinWhere, plgWhere, PLG_SEL });

  // ---------- Pengaturan (Super Admin) ----------
  const cats = [['kategori-pelanggaran', 'kea_kategori_pelanggaran', true], ['jenis-pembinaan', 'kea_jenis_pembinaan', false], ['jenis-izin', 'kea_jenis_izin', false]];
  api.get('/keamanan/pengaturan', mod, onlySA, ah(async (req, res) => {
    const Q = db.q.bind(db), fm = (await setting(Q, 'format_nomor')) || {};
    res.json({ format_nomor: Object.fromEntries(Object.keys(DEF.format_nomor).map(k => [k, Object.assign({}, DEF.format_nomor[k], fm[k])])), alur: Object.assign({}, DEF.alur, await setting(Q, 'alur')), peringatan_menit: await setting(Q, 'peringatan_menit'), toleransi_menit: await setting(Q, 'toleransi_menit'), identitas: Object.assign({}, DEF.identitas, await setting(Q, 'identitas')),
      kategori_pelanggaran: await Q('SELECT id, nama, keterangan, aktif FROM kea_kategori_pelanggaran ORDER BY lower(nama)'), jenis_pembinaan: await Q('SELECT id, nama, aktif FROM kea_jenis_pembinaan ORDER BY lower(nama)'), jenis_izin: await Q('SELECT id, jenis, nama, aktif FROM kea_jenis_izin ORDER BY jenis, lower(nama)') });
  }));
  api.put('/keamanan/pengaturan', mod, onlySA, ah(async (req, res) => {
    const b = req.body || {}, e = {}, ch = {}, alasan = U.textOrNull(b.alasan, 500);
    if ('format_nomor' in b) { const fn = {}; for (const k of Object.keys(DEF.format_nomor)) { const x = (b.format_nomor || {})[k] || {}, p = String(x.prefix || '').toUpperCase(); if (!/^[A-Z0-9]{1,8}$/.test(p)) e['format_' + k] = 'Awalan 1–8 huruf/angka.'; const dg = parseInt(x.digit, 10); if (!(dg >= 1 && dg <= 10)) e['format_' + k] = 'Jumlah digit 1–10.'; fn[k] = { prefix: p, digit: dg, reset: x.reset === 'tidak' ? 'tidak' : 'tahun' }; } ch.format_nomor = fn; }
    if ('alur' in b) { const a = {}; for (const k of ['izin_keluar', 'izin_pulang']) { const v = (b.alur || {})[k]; if (!['wajib', 'langsung'].includes(v)) e['alur_' + k] = 'Pilih wajib persetujuan atau langsung disetujui.'; a[k] = v; } ch.alur = a; }
    for (const k of ['peringatan_menit', 'toleransi_menit']) if (k in b) { const n = parseInt(b[k], 10); if (!(n >= (k === 'peringatan_menit' ? 1 : 0) && n <= 1440)) e[k] = 'Angka menit 0–1440.'; ch[k] = n; }
    if ('identitas' in b) { const i = b.identitas || {}, nm = U.str(i.nama, 150); if (nm.length < 3) e.identitas_nama = 'Nama pondok wajib diisi.'; ch.identitas = { nama: nm, alamat: U.text(i.alamat, 300), kontak: U.str(i.kontak, 100), catatan: U.text(i.catatan, 300) }; }
    chk(e); if (!Object.keys(ch).length) throw bad('Tidak ada perubahan.');
    await db.tx(async q => { for (const k of Object.keys(ch)) { const old = await setting(q, k); await q('INSERT INTO kea_pengaturan (kunci,nilai,diubah,oleh) VALUES ($1,$2,$3,$4) ON CONFLICT (kunci) DO UPDATE SET nilai=$2, diubah=$3, oleh=$4', [k, JSON.stringify(ch[k]), Date.now(), req.user.id]); await aud(q, req, 'pengaturan', null, 'ubah', 'Mengubah pengaturan ' + k, alasan, old, ch[k]); } });
    await lg(req, 'ubah', 'Mengubah pengaturan keamanan: ' + Object.keys(ch).join(', ')); res.json({ ok: true });
  }));
  for (const [path, tbl, withKet] of cats) {
    const isIzin = tbl === 'kea_jenis_izin';
    api.post('/keamanan/' + path, mod, onlySA, ah(async (req, res) => {
      const b = req.body || {}, nm = U.str(b.nama, 100), e = {}; if (nm.length < 2) e.nama = 'Nama wajib diisi (minimal 2 karakter).'; if (isIzin && !['keluar', 'pulang'].includes(b.jenis)) e.jenis = 'Pilih izin keluar atau pulang.'; chk(e);
      try {
        const r = await db.tx(async q => { const x = (isIzin ? await q('INSERT INTO kea_jenis_izin (jenis,nama,dibuat) VALUES ($1,$2,$3) RETURNING id', [b.jenis, nm, Date.now()]) : withKet ? await q('INSERT INTO kea_kategori_pelanggaran (nama,keterangan,dibuat) VALUES ($1,$2,$3) RETURNING id', [nm, U.textOrNull(b.keterangan, 300), Date.now()]) : await q('INSERT INTO kea_jenis_pembinaan (nama,dibuat) VALUES ($1,$2) RETURNING id', [nm, Date.now()]))[0]; await aud(q, req, 'pengaturan', x.id, 'tambah', `Menambah ${path}: ${nm}`, null, null, { nama: nm }); return x; });
        await lg(req, 'tambah', `Menambah ${path}: ${nm}`); res.status(201).json({ id: r.id });
      } catch (err) { if (U.isUnique(err)) throw bad('Nama tersebut sudah ada.', { nama: 'Nama sudah dipakai.' }, 409); throw err; }
    }));
    api.patch('/keamanan/' + path + '/:id(\\d+)', mod, onlySA, ah(async (req, res) => {
      const id = idOf(req.params.id), b = req.body || {}, sets = [], p = [];
      if ('nama' in b) { const nm = U.str(b.nama, 100); if (nm.length < 2) throw bad('Nama wajib diisi.', { nama: 'Nama wajib diisi (minimal 2 karakter).' }); p.push(nm); sets.push('nama=$' + p.length); }
      if ('aktif' in b) { p.push(!!b.aktif); sets.push('aktif=$' + p.length); } if (withKet && 'keterangan' in b) { p.push(U.textOrNull(b.keterangan, 300)); sets.push('keterangan=$' + p.length); }
      if (!sets.length) throw bad('Tidak ada perubahan.'); p.push(id);
      try { await db.tx(async q => { const old = (await q(`SELECT * FROM ${tbl} WHERE id=$1 FOR UPDATE`, [id]))[0]; if (!old) throw bad('Data tidak ditemukan.', null, 404); await q(`UPDATE ${tbl} SET ${sets.join(',')} WHERE id=$${p.length}`, p); await aud(q, req, 'pengaturan', id, 'ubah', `Mengubah ${path} #${id}`, null, pick(old, ['nama', 'aktif']), pick(Object.assign({}, old, b), ['nama', 'aktif'])); }); }
      catch (err) { if (U.isUnique(err)) throw bad('Nama tersebut sudah ada.', { nama: 'Nama sudah dipakai.' }, 409); throw err; }
      await lg(req, 'ubah', `Mengubah ${path} #${id}`); res.json({ ok: true });
    }));
  }
  api.get('/keamanan/audit', mod, onlySA, ah(async (req, res) => {
    const pg = U.pageOf(req.query), w = U.where(); if (req.query.entitas) w.add('entitas = ?', String(req.query.entitas).slice(0, 30));
    res.json({ total: Number((await db.q(`SELECT COUNT(*) AS n FROM kea_audit ${w.sql}`, w.params()))[0].n), page: pg.page, size: pg.size, rows: await db.q(`SELECT id, waktu, username, entitas, entitas_id, aksi, ket, alasan, sebelum, sesudah FROM kea_audit ${w.sql} ORDER BY id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) });
  }));
}
module.exports = { register, DEF };
