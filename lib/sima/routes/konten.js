'use strict';
// Modul Berita & Galeri (hanya Super Admin). SIMA adalah satu-satunya sumber konten; website publik membaca lewat view v_pub_* (lihat publik.js).
const U = require('../util');
const L = require('../konten-lib');
const { bad } = require('./keuangan');
const DEF = { beranda: { total: 3, unggulan_maks: 2 }, tampilan: { per_halaman: 9 } };
const KUNCI = ['silat', 'banjari', 'tulis', 'pidato', 'bisnis'];
const mkW = () => { const w = U.where(); return { push: v => w.push(v), raw: sql => w.add(sql), get sql() { return w.sql; }, get p() { return w.params(); } }; };
const dstr = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
const idOf = v => { const n = parseInt(v, 10); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const chk = e => { if (Object.keys(e).length) throw bad('Data belum valid.', e); };
const needK = b => { if (b.konfirmasi !== true) throw bad('Konfirmasi diperlukan untuk tindakan ini.'); };
const jktDate = ms => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
const AWAL = {
  berita: ['Kegiatan Pondok', 'Pendidikan', 'Keagamaan', 'Pengumuman', 'Prestasi', 'Kegiatan Santri', 'Informasi Lainnya'],
  galeri: [['Kegiatan Pondok'], ['Pendidikan'], ['Madrasah Diniyah'], ["Madrasah Al-Qur'an"], ['Amtsilati'], ['Tahfidz'], ['Ekstrakurikuler'], ['Pencak Silat', 'silat'], ['Banjari', 'banjari'], ['Kepenulisan', 'tulis'], ['Public Speaking', 'pidato'], ['Entrepreneur', 'bisnis'], ['Kegiatan Lainnya']]
};

function register(api, { db, auth, logBy, ah }) {
  const mod = auth.requireModule('berita');
  const lg = (req, aksi, ket) => logBy(req, aksi, 'konten', ket);
  const riw = (q, req, entitas, id, aksi, ket, sebelum, sesudah) => q('INSERT INTO cms_riwayat (waktu,user_id,username,entitas,entitas_id,aksi,ket,sebelum,sesudah) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [Date.now(), req.user.id, req.user.username, entitas, id, aksi, String(ket || '').slice(0, 300), sebelum ? JSON.stringify(sebelum) : null, sesudah ? JSON.stringify(sesudah) : null]);
  const wrap = fn => ah(async (req, res) => { try { await fn(req, res); } catch (e) {
    if (e && e.code === '23505') throw bad('Data ganda: nilai tersebut sudah dipakai (judul/slug/nama).', null, 409);
    if (e && e.code === '23503') throw bad('Data terkait tidak ditemukan atau masih dipakai.', null, 409);
    if (e && e.code === '23514') throw bad('Data tidak memenuhi aturan (status/tanggal/isi).', null, 400);
    throw e; } });
  const diff = (a, b, keys) => { const s = {}, d = {}; keys.forEach(k => { const x = a[k] == null ? null : String(a[k]), y = b[k] == null ? null : String(b[k]); if (x !== y) { s[k] = a[k] == null ? null : a[k]; d[k] = b[k] == null ? null : b[k]; } }); return [s, d]; };
  async function setting(q, key) { const r = (await q('SELECT nilai FROM cms_pengaturan WHERE kunci=$1', [key]))[0]; return Object.assign({}, DEF[key], r ? r.nilai : {}); }
  const mu = r => r.mid ? { id: r.mid, url: L.mediaUrl({ id: r.mid, token: r.mtok }), thumb: L.mediaUrl({ id: r.mid, token: r.mtok }, true) } : null;
  const statusEf = (r, now) => r.dihapus ? 'dihapus' : r.status === 'terjadwal' ? (+r.terbit_pada <= now ? 'terbit' : 'terjadwal') : r.status;

  // ---------------- slug ----------------
  async function slugUnik(q, base, selfId) {
    let s = base, n = 2;
    for (;;) {
      const r = (await q('SELECT berita_id FROM cms_berita_slug WHERE slug=$1', [s]))[0];
      if (!r || r.berita_id === selfId) return s;
      s = `${base.slice(0, 74)}-${n++}`;
    }
  }
  async function katSlug(q, tipe, nama, selfId) {
    const base = L.slugify(nama, 60); let s = base, n = 2;
    for (;;) { const r = (await q('SELECT id FROM cms_kategori WHERE tipe=$1 AND slug=$2', [tipe, s]))[0]; if (!r || r.id === selfId) return s; s = `${base}-${n++}`; }
  }

  // ---------------- referensi ----------------
  api.get('/konten/ref', mod, ah(async (req, res) => {
    res.json({ kategori_berita: await db.q('SELECT id, nama, aktif FROM cms_kategori WHERE tipe=$1 ORDER BY urutan, nama', ['berita']),
      kategori_galeri: await db.q('SELECT id, nama, aktif, kunci_halaman FROM cms_kategori WHERE tipe=$1 ORDER BY urutan, nama', ['galeri']),
      kunci_halaman: KUNCI, pengaturan: { beranda: await setting(db.q, 'beranda'), tampilan: await setting(db.q, 'tampilan') } });
  }));

  // ---------------- kategori ----------------
  api.get('/konten/kategori', mod, ah(async (req, res) => {
    const tipe = req.query.tipe === 'galeri' ? 'galeri' : 'berita';
    const rows = await db.q(`SELECT k.*, (SELECT COUNT(*)::int FROM ${tipe === 'berita' ? 'cms_berita b WHERE b.kategori_id=k.id AND b.dihapus IS NULL' : 'cms_galeri g WHERE g.kategori_id=k.id AND g.dihapus IS NULL'}) AS jumlah FROM cms_kategori k WHERE k.tipe=$1 ORDER BY k.urutan, k.nama`, [tipe]);
    res.json({ total: rows.length, rows });
  }));
  const katSpec = (b, tipe, partial) => {
    const e = {}, o = {};
    if (!partial || 'nama' in b) { const v = U.str(b.nama, 80); if (v.length < 3) e.nama = 'Nama kategori wajib diisi (minimal 3 karakter).'; else o.nama = v; }
    if ('deskripsi' in b) o.deskripsi = U.textOrNull(b.deskripsi, 300);
    if ('urutan' in b) { const n = parseInt(b.urutan, 10); if (!Number.isInteger(n) || n < 0 || n > 9999) e.urutan = 'Urutan harus angka 0–9999.'; else o.urutan = n; }
    if ('aktif' in b) o.aktif = b.aktif === true || b.aktif === 'true';
    if ('kunci_halaman' in b) { const v = b.kunci_halaman || null; if (v && (tipe !== 'galeri' || !KUNCI.includes(v))) e.kunci_halaman = 'Kunci halaman tidak valid.'; else o.kunci_halaman = v; }
    chk(e); return o;
  };
  api.post('/konten/kategori', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const tipe = b.tipe === 'galeri' ? 'galeri' : b.tipe === 'berita' ? 'berita' : null; if (!tipe) throw bad('Tipe kategori tidak valid.', { tipe: 'Pilih berita atau galeri.' });
    const o = katSpec(b, tipe, false), now = Date.now();
    const id = await db.tx(async q => { const r = (await q('INSERT INTO cms_kategori (tipe,nama,slug,deskripsi,kunci_halaman,aktif,urutan,dibuat,diubah) VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$7) RETURNING id',
      [tipe, o.nama, await katSlug(q, tipe, o.nama), o.deskripsi || null, o.kunci_halaman || null, o.urutan || 0, now]))[0].id; await riw(q, req, 'kategori', r, 'dibuat', `Kategori ${tipe}: ${o.nama}`, null, o); return r; });
    await lg(req, 'kategori_dibuat', `Kategori ${tipe} "${o.nama}" dibuat`); res.status(201).json({ ok: true, id });
  }));
  api.patch('/konten/kategori/:id(\\d+)', mod, wrap(async (req, res) => {
    const id = +req.params.id, b = req.body || {}; const cur = (await db.q('SELECT * FROM cms_kategori WHERE id=$1', [id]))[0]; if (!cur) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    const o = katSpec(b, cur.tipe, true); const keys = Object.keys(o); if (!keys.length) throw bad('Tidak ada perubahan.');
    const [s, d] = diff(cur, Object.assign({}, cur, o), keys); if (!Object.keys(d).length) throw bad('Tidak ada perubahan.');
    await db.tx(async q => { await q(`UPDATE cms_kategori SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, diubah=$${keys.length + 2} WHERE id=$1`, [id, ...keys.map(k => o[k]), Date.now()]); await riw(q, req, 'kategori', id, 'diubah', `Kategori ${cur.nama}`, s, d); });
    await lg(req, 'kategori_diubah', `Kategori ${cur.tipe} "${cur.nama}" diubah: ${Object.keys(d).join(', ')}`); res.json({ ok: true });
  }));
  api.post('/konten/kategori/awal', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const tipe = b.tipe === 'galeri' ? 'galeri' : b.tipe === 'berita' ? 'berita' : null; if (!tipe) throw bad('Tipe kategori tidak valid.');
    let n = 0;
    await db.tx(async q => { let i = 0; for (const it of AWAL[tipe]) { const [nama, kunci] = Array.isArray(it) ? it : [it]; i++;
      if ((await q('SELECT 1 FROM cms_kategori WHERE tipe=$1 AND lower(nama)=lower($2)', [tipe, nama])).length) continue;
      await q('INSERT INTO cms_kategori (tipe,nama,slug,kunci_halaman,aktif,urutan,dibuat,diubah) VALUES ($1,$2,$3,$4,TRUE,$5,$6,$6)', [tipe, nama, await katSlug(q, tipe, nama), kunci || null, i, Date.now()]); n++; }
      await riw(q, req, 'kategori', null, 'contoh_dimuat', `${n} kategori ${tipe} contoh dimuat`); });
    await lg(req, 'kategori_dibuat', `${n} kategori ${tipe} contoh dimuat`); res.json({ ok: true, ditambahkan: n });
  }));

  // ---------------- media ----------------
  api.post('/konten/media', mod, wrap(async (req, res) => {
    const f = L.readImg(req.body); if (f.error) throw bad(f.error, { data: f.error });
    const ada = (await db.q('SELECT id, token FROM cms_media WHERE sha256=$1', [f.sha256]))[0];
    if (ada) return res.json({ ok: true, ada: true, id: ada.id, url: L.mediaUrl(ada), thumb: L.mediaUrl(ada, true) });
    const o = await L.olahFoto(f.buf), token = f.sha256.slice(0, 8);
    const m = await db.tx(async q => { const r = (await q('INSERT INTO cms_media (mime,lebar,tinggi,ukuran,nama_asli,sha256,token,isi,thumb,diunggah,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
      ['image/webp', o.lebar, o.tinggi, o.isi.length, f.nama, f.sha256, token, o.isi, o.thumb, Date.now(), req.user.id]))[0]; await riw(q, req, 'media', r.id, 'diunggah', f.nama); return r; });
    await lg(req, 'media_diunggah', `Foto "${f.nama}" diunggah (#${m.id}, ${o.lebar}×${o.tinggi})`);
    res.status(201).json({ ok: true, ada: false, id: m.id, url: L.mediaUrl({ id: m.id, token }), thumb: L.mediaUrl({ id: m.id, token }, true), lebar: o.lebar, tinggi: o.tinggi });
  }));
  async function pemakaian(q, id) {
    const out = [];
    for (const r of await q("SELECT id, judul, status, dihapus FROM cms_berita WHERE media_utama_id=$1", [id])) out.push({ jenis: 'berita', peran: 'gambar utama', id: r.id, judul: r.judul, status: r.dihapus ? 'dihapus' : r.status });
    for (const r of await q("SELECT b.id, b.judul, b.status, b.dihapus FROM cms_berita_media bm JOIN cms_berita b ON b.id=bm.berita_id WHERE bm.media_id=$1 AND b.media_utama_id IS DISTINCT FROM $1", [id])) out.push({ jenis: 'berita', peran: 'isi berita', id: r.id, judul: r.judul, status: r.dihapus ? 'dihapus' : r.status });
    for (const r of await q("SELECT id, judul, status, dihapus, jenis FROM cms_galeri WHERE media_id=$1 OR thumb_media_id=$1", [id])) out.push({ jenis: 'galeri', peran: r.jenis === 'video' ? 'thumbnail video' : 'foto galeri', id: r.id, judul: r.judul, status: r.dihapus ? 'dihapus' : r.status });
    return out;
  }
  api.get('/konten/media', mod, ah(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1), size = 24, w = mkW();
    const qs = U.str(req.query.q, 80); if (qs) { const p = w.push('%' + qs.replace(/[%_\\]/g, '\\$&') + '%'); w.raw(`(m.nama_asli ILIKE ${p} OR COALESCE(m.alt,'') ILIKE ${p})`); }
    const pakai = "(EXISTS (SELECT 1 FROM cms_berita b WHERE b.media_utama_id=m.id) OR EXISTS (SELECT 1 FROM cms_berita_media bm WHERE bm.media_id=m.id) OR EXISTS (SELECT 1 FROM cms_galeri g WHERE g.media_id=m.id OR g.thumb_media_id=m.id))";
    if (req.query.pakai === 'tidak') w.raw(`NOT ${pakai}`); else if (req.query.pakai === 'ya') w.raw(pakai);
    const total = (await db.q(`SELECT COUNT(*)::int n FROM cms_media m ${w.sql}`, w.p))[0].n;
    const rows = await db.q(`SELECT m.id, m.token, m.lebar, m.tinggi, m.ukuran, m.nama_asli, m.alt, m.diunggah, u.nama AS pengunggah, ${pakai} AS dipakai FROM cms_media m LEFT JOIN users u ON u.id=m.oleh ${w.sql} ORDER BY m.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, w.p);
    res.json({ total, page, size, rows: rows.map(r => Object.assign({}, r, { url: L.mediaUrl(r), thumb: L.mediaUrl(r, true) })) });
  }));
  api.get('/konten/media/:id(\\d+)/berkas', mod, ah(async (req, res) => {   // pratinjau admin: boleh melihat file yang belum tayang
    const m = (await db.q(`SELECT ${req.query.thumb ? 'thumb' : 'isi'} AS b FROM cms_media WHERE id=$1`, [+req.params.id]))[0]; if (!m) return res.status(404).json({ error: 'Foto tidak ditemukan.' });
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=300' }).end(m.b);
  }));
  api.get('/konten/media/:id(\\d+)/pemakaian', mod, ah(async (req, res) => res.json({ rows: await pemakaian(db.q, +req.params.id) })));
  api.patch('/konten/media/:id(\\d+)', mod, wrap(async (req, res) => {
    const alt = U.strOrNull((req.body || {}).alt, 200), id = +req.params.id; const r = await db.q('UPDATE cms_media SET alt=$2 WHERE id=$1 RETURNING id', [id, alt]); if (!r.length) return res.status(404).json({ error: 'Foto tidak ditemukan.' });
    await lg(req, 'media_diubah', `Teks alternatif foto #${id} diubah`); res.json({ ok: true });
  }));
  api.post('/konten/media/:id(\\d+)/hapus', mod, wrap(async (req, res) => {
    const id = +req.params.id, b = req.body || {}; needK(b);
    const m = (await db.q('SELECT id, nama_asli FROM cms_media WHERE id=$1', [id]))[0]; if (!m) return res.status(404).json({ error: 'Foto tidak ditemukan.' });
    const pk = await pemakaian(db.q, id);
    if (pk.length) return res.status(409).json({ error: 'Foto masih dipakai oleh berita atau galeri, sehingga tidak dapat dihapus.', dipakai: pk });
    await db.tx(async q => { await q('DELETE FROM cms_media WHERE id=$1', [id]); await riw(q, req, 'media', id, 'dihapus', m.nama_asli); });
    await lg(req, 'media_dihapus', `File foto #${id} "${m.nama_asli}" dihapus (tidak dipakai)`); res.json({ ok: true });
  }));

  // ---------------- berita ----------------
  const BER_SQL = `SELECT b.*, k.nama AS kategori, m.id AS mid, m.token AS mtok, u.nama AS pembuat FROM cms_berita b LEFT JOIN cms_kategori k ON k.id=b.kategori_id LEFT JOIN cms_media m ON m.id=b.media_utama_id LEFT JOIN users u ON u.id=b.oleh`;
  const berOut = (r, now) => ({ id: r.id, judul: r.judul, slug: r.slug, ringkasan: r.ringkasan, kategori_id: r.kategori_id, kategori: r.kategori, gambar: mu(r), penulis: r.penulis,
    tanggal_kegiatan: dstr(r.tanggal_kegiatan), status: r.status, status_efektif: statusEf(r, now), terbit_pada: r.terbit_pada == null ? null : +r.terbit_pada,
    unggulan: r.unggulan, urutan_unggulan: r.urutan_unggulan, seo_deskripsi: r.seo_deskripsi, seo_kata_kunci: r.seo_kata_kunci, video_url: r.video_url, dibuat: +r.dibuat, diubah: +r.diubah, dihapus: r.dihapus ? +r.dihapus : null, pembuat: r.pembuat });
  api.get('/konten/berita', mod, ah(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1), size = 15, now = Date.now(), w = mkW();
    const qs = U.str(req.query.q, 80); if (qs) { const p = w.push('%' + qs.replace(/[%_\\]/g, '\\$&') + '%'); w.raw(`(b.judul ILIKE ${p} OR COALESCE(b.penulis,'') ILIKE ${p})`); }
    const st = req.query.status;
    if (st === 'dihapus') w.raw('b.dihapus IS NOT NULL'); else { w.raw('b.dihapus IS NULL');
      if (st === 'draft') w.raw("b.status='draft'"); else if (st === 'arsip') w.raw("b.status='arsip'");
      else if (st === 'terjadwal') w.raw(`b.status='terjadwal' AND b.terbit_pada > ${w.push(now)}`);
      else if (st === 'terbit') w.raw(`b.status IN ('terbit','terjadwal') AND b.terbit_pada <= ${w.push(now)}`); }
    const kid = idOf(req.query.kategori_id); if (kid) w.raw(`b.kategori_id=${w.push(kid)}`);
    if (req.query.unggulan === '1') w.raw('b.unggulan');
    const total = (await db.q(`SELECT COUNT(*)::int n FROM cms_berita b ${w.sql}`, w.p))[0].n;
    const rows = await db.q(`${BER_SQL} ${w.sql} ORDER BY ${req.query.unggulan === '1' ? 'b.urutan_unggulan, b.id' : 'COALESCE(b.terbit_pada, b.dibuat) DESC, b.id DESC'} LIMIT ${size} OFFSET ${(page - 1) * size}`, w.p);
    res.json({ total, page, size, rows: rows.map(r => berOut(r, now)) });
  }));
  const BER_FIELDS = ['judul', 'slug', 'ringkasan', 'kategori_id', 'media_utama_id', 'penulis', 'tanggal_kegiatan', 'seo_deskripsi', 'seo_kata_kunci', 'video_url', 'status', 'terbit_pada', 'unggulan'];
  async function beritaFull(q, id) {
    const r = (await q(`${BER_SQL} WHERE b.id=$1`, [id]))[0]; if (!r) return null;
    const o = berOut(r, Date.now()); o.isi_html = r.isi_html; o.galeri_ids = (await q('SELECT galeri_id FROM cms_berita_galeri WHERE berita_id=$1 ORDER BY urutan, galeri_id', [id])).map(x => x.galeri_id);
    o.slug_lama = (await q('SELECT slug FROM cms_berita_slug WHERE berita_id=$1 AND NOT utama ORDER BY dibuat', [id])).map(x => x.slug); return o;
  }
  api.get('/konten/berita/:id(\\d+)', mod, ah(async (req, res) => { const o = await beritaFull(db.q, +req.params.id); if (!o) return res.status(404).json({ error: 'Berita tidak ditemukan.' }); res.json(o); }));

  // status + waktu terbit -> {status, terbit_pada}. Tidak ada status "terbit" di masa depan: otomatis menjadi "terjadwal".
  function hitungStatus(want, tp, cur, now) {
    if (!['draft', 'terjadwal', 'terbit', 'arsip'].includes(want)) throw bad('Status tidak valid.', { status: 'Status tidak valid.' });
    if (want === 'draft' || want === 'arsip') return { status: want, terbit_pada: cur && cur.terbit_pada != null ? +cur.terbit_pada : tp };
    let t = tp == null ? (cur && cur.terbit_pada != null && cur.status !== 'draft' && cur.status !== 'arsip' ? +cur.terbit_pada : now) : tp;
    if (want === 'terjadwal' && t <= now) throw bad('Waktu terbit terjadwal harus di masa depan.', { terbit_pada: 'Waktu terbit terjadwal harus di masa depan.' });
    if (want === 'terbit' && t > now) return { status: 'terjadwal', terbit_pada: t };
    return { status: want, terbit_pada: t };
  }
  const parseWaktu = v => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(n) && n > 946684800000 && n < 4102444800000 ? Math.floor(n) : NaN; };
  async function bacaBerita(q, b, partial, cur) {
    const e = {}, o = {};
    if (!partial || 'judul' in b) { const v = U.str(b.judul, 200); if (v.length < 5) e.judul = 'Judul wajib diisi (minimal 5 karakter).'; else o.judul = v; }
    if ('ringkasan' in b) { const v = U.textOrNull(b.ringkasan, 500); o.ringkasan = v; }
    if ('isi_html' in b) { const html = L.sanitizeIsi(b.isi_html); if (String(b.isi_html || '').length > 300000) e.isi_html = 'Isi berita terlalu panjang.'; o.isi_html = html; }
    if ('kategori_id' in b) { const k = b.kategori_id ? idOf(b.kategori_id) : null; if (b.kategori_id && !k) e.kategori_id = 'Kategori tidak valid.'; else if (k) { const r = (await q("SELECT aktif FROM cms_kategori WHERE id=$1 AND tipe='berita'", [k]))[0]; if (!r) e.kategori_id = 'Kategori tidak ditemukan.'; else if (!r.aktif && !(cur && cur.kategori_id === k)) e.kategori_id = 'Kategori sudah nonaktif.'; } o.kategori_id = k; }
    if ('media_utama_id' in b) { const k = b.media_utama_id ? idOf(b.media_utama_id) : null; if (k && !(await q('SELECT 1 FROM cms_media WHERE id=$1', [k])).length) e.media_utama_id = 'Gambar utama tidak ditemukan di Media Library.'; o.media_utama_id = k; }
    if ('penulis' in b) o.penulis = U.strOrNull(b.penulis, 100);
    if ('tanggal_kegiatan' in b) { if (b.tanggal_kegiatan && !U.isDate(b.tanggal_kegiatan)) e.tanggal_kegiatan = 'Tanggal kegiatan tidak valid.'; else o.tanggal_kegiatan = b.tanggal_kegiatan || null; }
    if ('seo_deskripsi' in b) o.seo_deskripsi = U.textOrNull(b.seo_deskripsi, 300);
    if ('seo_kata_kunci' in b) o.seo_kata_kunci = U.strOrNull(b.seo_kata_kunci, 300);
    if ('video_url' in b) { if (b.video_url && !L.parseVideo(b.video_url)) e.video_url = 'Tautan video harus dari YouTube atau Vimeo.'; else o.video_url = b.video_url ? L.parseVideo(b.video_url).url : null; }
    if ('unggulan' in b) o.unggulan = b.unggulan === true || b.unggulan === 'true';
    if ('galeri_ids' in b) { if (!Array.isArray(b.galeri_ids) || b.galeri_ids.length > 60) e.galeri_ids = 'Daftar dokumentasi tidak valid.'; else { const ids = [...new Set(b.galeri_ids.map(idOf))]; if (ids.includes(null)) e.galeri_ids = 'Dokumentasi tidak valid.'; else { const ok = ids.length ? await q('SELECT id FROM cms_galeri WHERE id = ANY($1::int[]) AND dihapus IS NULL', [ids]) : []; if (ok.length !== ids.length) e.galeri_ids = 'Ada dokumentasi galeri yang tidak ditemukan.'; o.galeri_ids = ids; } } }
    if ('slug' in b && b.slug) { const v = String(b.slug).trim().toLowerCase(); if (v.length > 80 || !L.SLUG_RE.test(v)) e.slug = 'Slug hanya huruf kecil, angka, dan tanda hubung (maks. 80).'; else o.slug = v; }
    chk(e); return o;
  }
  async function simpanRelasi(q, id, o, htmlSaatIni) {
    if ('isi_html' in o || 'media_utama_id' in o) {
      const ids = L.mediaIdsOf(htmlSaatIni); if (ids.length) { const ok = await q('SELECT id FROM cms_media WHERE id = ANY($1::int[])', [ids]); if (ok.length !== ids.length) throw bad('Ada gambar di dalam isi berita yang tidak ada di Media Library.', { isi_html: 'Gambar pada isi berita tidak ditemukan.' }); }
      await q('DELETE FROM cms_berita_media WHERE berita_id=$1', [id]); for (const m of ids) await q('INSERT INTO cms_berita_media (berita_id,media_id) VALUES ($1,$2)', [id, m]);
    }
    if (o.galeri_ids) { await q('DELETE FROM cms_berita_galeri WHERE berita_id=$1', [id]); let i = 0; for (const g of o.galeri_ids) await q('INSERT INTO cms_berita_galeri (berita_id,galeri_id,urutan) VALUES ($1,$2,$3)', [id, g, i++]); }
  }
  api.post('/konten/berita', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b);
    const id = await db.tx(async q => {
      const o = await bacaBerita(q, b, false), now = Date.now(); const want = b.status || 'draft';
      const st = hitungStatus(want, parseWaktu(b.terbit_pada), null, now); if (Number.isNaN(parseWaktu(b.terbit_pada))) throw bad('Waktu terbit tidak valid.', { terbit_pada: 'Waktu terbit tidak valid.' });
      if ((st.status === 'terbit' || st.status === 'terjadwal') && !L.plain(o.isi_html || '').length && !/<(img|div)/.test(o.isi_html || '')) throw bad('Isi berita wajib diisi sebelum diterbitkan.', { isi_html: 'Isi berita wajib diisi sebelum diterbitkan.' });
      const slug = await slugUnik(q, o.slug || L.slugify(o.judul), null);
      const r = (await q(`INSERT INTO cms_berita (judul,slug,ringkasan,isi_html,kategori_id,media_utama_id,penulis,tanggal_kegiatan,status,terbit_pada,unggulan,urutan_unggulan,seo_deskripsi,seo_kata_kunci,video_url,dibuat,diubah,oleh)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16,$17) RETURNING id`,
        [o.judul, slug, o.ringkasan || null, o.isi_html || '', o.kategori_id || null, o.media_utama_id || null, o.penulis || null, o.tanggal_kegiatan || null, st.status, st.terbit_pada, !!o.unggulan,
          o.unggulan ? ((await q('SELECT COALESCE(MAX(urutan_unggulan),0)+1 AS n FROM cms_berita WHERE unggulan'))[0].n) : 0, o.seo_deskripsi || null, o.seo_kata_kunci || null, o.video_url || null, now, req.user.id]))[0].id;
      await q('INSERT INTO cms_berita_slug (slug,berita_id,utama,dibuat) VALUES ($1,$2,TRUE,$3)', [slug, r, now]);
      await simpanRelasi(q, r, o, o.isi_html || ''); await riw(q, req, 'berita', r, 'dibuat', o.judul, null, { judul: o.judul, slug, status: st.status });
      if (st.status === 'terbit') await riw(q, req, 'berita', r, 'diterbitkan', o.judul); if (st.status === 'terjadwal') await riw(q, req, 'berita', r, 'dijadwalkan', o.judul, null, { terbit_pada: st.terbit_pada });
      b._st = st.status; b._judul = o.judul; return r;
    });
    await lg(req, 'berita_dibuat', `Berita #${id} "${b._judul}" dibuat (${b._st})`);
    if (b._st === 'terbit') await lg(req, 'berita_diterbitkan', `Berita #${id} diterbitkan`); if (b._st === 'terjadwal') await lg(req, 'berita_dijadwalkan', `Berita #${id} dijadwalkan`);
    res.status(201).json({ ok: true, id, slug: (await db.q('SELECT slug FROM cms_berita WHERE id=$1', [id]))[0].slug });
  }));
  api.patch('/konten/berita/:id(\\d+)', mod, wrap(async (req, res) => {
    const id = +req.params.id, b = req.body || {}; needK(b);
    const out = await db.tx(async q => {
      const cur = (await q('SELECT * FROM cms_berita WHERE id=$1 FOR UPDATE', [id]))[0]; if (!cur) throw bad('Berita tidak ditemukan.', null, 404); if (cur.dihapus) throw bad('Berita sudah dihapus. Pulihkan terlebih dahulu.', null, 409);
      const o = await bacaBerita(q, b, true, cur), now = Date.now(); const ganti = {};
      if (o.slug && o.slug !== cur.slug) { const ex = (await q('SELECT berita_id FROM cms_berita_slug WHERE slug=$1', [o.slug]))[0]; if (ex && ex.berita_id !== id) throw bad('Slug sudah dipakai berita lain.', { slug: 'Slug sudah dipakai berita lain.' }, 409); }
      const sebelum = beritaDiffObj(cur);
      let slugBaru = null;
      if (o.slug && o.slug !== cur.slug) slugBaru = o.slug; delete o.slug;     // judul diubah TIDAK mengubah slug otomatis
      const gi = o.galeri_ids; delete o.galeri_ids;
      if (o.unggulan === true && !cur.unggulan) ganti.urutan_unggulan = (await q('SELECT COALESCE(MAX(urutan_unggulan),0)+1 AS n FROM cms_berita WHERE unggulan'))[0].n;
      if (o.unggulan === false) ganti.urutan_unggulan = 0;
      if (('status' in b) || ('terbit_pada' in b)) { const tp = parseWaktu(b.terbit_pada); if (Number.isNaN(tp)) throw bad('Waktu terbit tidak valid.', { terbit_pada: 'Waktu terbit tidak valid.' }); const st = hitungStatus(b.status || cur.status, tp, cur, now); o.status = st.status; o.terbit_pada = st.terbit_pada; }
      const isiNext = 'isi_html' in o ? o.isi_html : cur.isi_html;
      const stNext = o.status || cur.status; if ((stNext === 'terbit' || stNext === 'terjadwal') && !L.plain(isiNext).length && !/<(img|div)/.test(isiNext)) throw bad('Isi berita wajib diisi sebelum diterbitkan.', { isi_html: 'Isi berita wajib diisi sebelum diterbitkan.' });
      Object.assign(o, ganti); const keys = Object.keys(o);
      if (keys.length) await q(`UPDATE cms_berita SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, diubah=$${keys.length + 2} WHERE id=$1`, [id, ...keys.map(k => o[k]), now]);
      if (slugBaru) { await q('UPDATE cms_berita_slug SET utama=FALSE WHERE berita_id=$1', [id]); await q('INSERT INTO cms_berita_slug (slug,berita_id,utama,dibuat) VALUES ($1,$2,TRUE,$3) ON CONFLICT (slug) DO UPDATE SET utama=TRUE', [slugBaru, id, now]); await q('UPDATE cms_berita SET slug=$2 WHERE id=$1', [id, slugBaru]); }
      await simpanRelasi(q, id, Object.assign({}, o, gi ? { galeri_ids: gi } : {}), isiNext);
      const sesudah = beritaDiffObj(Object.assign({}, cur, o, slugBaru ? { slug: slugBaru } : {}));
      const [s, d] = diff(sebelum, sesudah, Object.keys(sebelum)); if (gi) { d.galeri = gi.length; } if (!Object.keys(d).length && !slugBaru && !gi) throw bad('Tidak ada perubahan.');
      await riw(q, req, 'berita', id, 'diubah', cur.judul, s, d);
      const events = []; if (o.status && o.status !== cur.status) events.push(o.status === 'terbit' ? 'diterbitkan' : o.status === 'terjadwal' ? 'dijadwalkan' : o.status === 'arsip' ? 'diarsipkan' : 'status_diubah');
      for (const ev of events) await riw(q, req, 'berita', id, ev, cur.judul, { status: cur.status }, { status: o.status, terbit_pada: o.terbit_pada });
      return { cur, d, events, slugBaru, status: o.status };
    });
    await lg(req, 'berita_diubah', `Berita #${id} "${out.cur.judul}" diubah: ${Object.keys(out.d).join(', ') || 'relasi'}`);
    for (const ev of out.events) await lg(req, 'berita_' + (ev === 'status_diubah' ? 'status_diubah' : ev), `Berita #${id} ${ev.replace('_', ' ')} (${out.status})`);
    if (out.slugBaru) await lg(req, 'berita_slug_diubah', `Slug berita #${id}: ${out.cur.slug} → ${out.slugBaru} (tautan lama dialihkan)`);
    res.json({ ok: true });
  }));
  const beritaDiffObj = r => ({ judul: r.judul, slug: r.slug, ringkasan: r.ringkasan, kategori_id: r.kategori_id, media_utama_id: r.media_utama_id, penulis: r.penulis, tanggal_kegiatan: dstr(r.tanggal_kegiatan),
    status: r.status, terbit_pada: r.terbit_pada == null ? null : +r.terbit_pada, unggulan: !!r.unggulan, seo_deskripsi: r.seo_deskripsi, seo_kata_kunci: r.seo_kata_kunci, video_url: r.video_url,
    isi_panjang: String(r.isi_html || '').length });
  api.post('/konten/berita/:id(\\d+)/status', mod, wrap(async (req, res) => {
    const id = +req.params.id, b = req.body || {}; needK(b);
    const r = await db.tx(async q => {
      const cur = (await q('SELECT * FROM cms_berita WHERE id=$1 FOR UPDATE', [id]))[0]; if (!cur) throw bad('Berita tidak ditemukan.', null, 404); if (cur.dihapus) throw bad('Berita sudah dihapus.', null, 409);
      const tp = parseWaktu(b.terbit_pada); if (Number.isNaN(tp)) throw bad('Waktu terbit tidak valid.', { terbit_pada: 'Waktu terbit tidak valid.' });
      const st = hitungStatus(b.status, tp, cur, Date.now());
      if ((st.status === 'terbit' || st.status === 'terjadwal') && !L.plain(cur.isi_html).length && !/<(img|div)/.test(cur.isi_html)) throw bad('Isi berita wajib diisi sebelum diterbitkan.', { isi_html: 'Isi berita wajib diisi sebelum diterbitkan.' });
      await q('UPDATE cms_berita SET status=$2, terbit_pada=$3, diubah=$4 WHERE id=$1', [id, st.status, st.terbit_pada, Date.now()]);
      const ev = st.status === 'terbit' ? 'diterbitkan' : st.status === 'terjadwal' ? 'dijadwalkan' : st.status === 'arsip' ? 'diarsipkan' : 'dijadikan_draft';
      await riw(q, req, 'berita', id, ev, cur.judul, { status: cur.status, terbit_pada: cur.terbit_pada == null ? null : +cur.terbit_pada }, { status: st.status, terbit_pada: st.terbit_pada }); return { cur, st, ev };
    });
    await lg(req, 'berita_' + r.ev, `Berita #${id} "${r.cur.judul}": ${r.cur.status} → ${r.st.status}`); res.json({ ok: true, status: r.st.status, terbit_pada: r.st.terbit_pada });
  }));
  api.post('/konten/berita/:id(\\d+)/unggulan', mod, wrap(async (req, res) => {
    const id = +req.params.id, b = req.body || {}; needK(b); const on = b.unggulan === true;
    const cur = (await db.q('SELECT judul, unggulan FROM cms_berita WHERE id=$1 AND dihapus IS NULL', [id]))[0]; if (!cur) return res.status(404).json({ error: 'Berita tidak ditemukan.' });
    await db.tx(async q => { await q('UPDATE cms_berita SET unggulan=$2, urutan_unggulan=CASE WHEN $2 THEN (SELECT COALESCE(MAX(urutan_unggulan),0)+1 FROM cms_berita WHERE unggulan) ELSE 0 END, diubah=$3 WHERE id=$1', [id, on, Date.now()]); await riw(q, req, 'berita', id, on ? 'dijadikan_unggulan' : 'unggulan_dicabut', cur.judul, { unggulan: cur.unggulan }, { unggulan: on }); });
    await lg(req, 'berita_unggulan', `Berita #${id} "${cur.judul}" ${on ? 'dijadikan' : 'dicabut dari'} unggulan`); res.json({ ok: true });
  }));
  api.post('/konten/berita/unggulan/urutan', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const ids = Array.isArray(b.ids) ? b.ids.map(idOf) : []; if (!ids.length || ids.includes(null)) throw bad('Daftar urutan tidak valid.');
    await db.tx(async q => { let i = 1; for (const id of ids) await q('UPDATE cms_berita SET urutan_unggulan=$2 WHERE id=$1 AND unggulan', [id, i++]); await riw(q, req, 'berita', null, 'urutan_unggulan', 'Urutan berita unggulan diubah', null, { ids }); });
    await lg(req, 'berita_unggulan', 'Urutan berita unggulan diubah'); res.json({ ok: true });
  }));
  api.post('/konten/berita/:id(\\d+)/hapus', mod, wrap(async (req, res) => {
    const id = +req.params.id, b = req.body || {}; needK(b); const cur = (await db.q('SELECT judul, status, dihapus FROM cms_berita WHERE id=$1', [id]))[0]; if (!cur) return res.status(404).json({ error: 'Berita tidak ditemukan.' }); if (cur.dihapus) throw bad('Berita sudah dihapus.', null, 409);
    await db.tx(async q => { await q("UPDATE cms_berita SET dihapus=$2, unggulan=FALSE, urutan_unggulan=0, status=CASE WHEN status IN ('terbit','terjadwal') THEN 'arsip' ELSE status END, diubah=$2 WHERE id=$1", [id, Date.now()]); await riw(q, req, 'berita', id, 'dihapus', cur.judul, { status: cur.status }, null); });
    await lg(req, 'berita_dihapus', `Berita #${id} "${cur.judul}" dihapus (dapat dipulihkan; tidak tayang)`); res.json({ ok: true });
  }));
  api.post('/konten/berita/:id(\\d+)/pulihkan', mod, wrap(async (req, res) => {
    const id = +req.params.id; needK(req.body || {}); const cur = (await db.q('SELECT judul, dihapus FROM cms_berita WHERE id=$1', [id]))[0]; if (!cur || !cur.dihapus) return res.status(404).json({ error: 'Berita terhapus tidak ditemukan.' });
    await db.tx(async q => { await q("UPDATE cms_berita SET dihapus=NULL, status='draft', diubah=$2 WHERE id=$1", [id, Date.now()]); await riw(q, req, 'berita', id, 'dipulihkan', cur.judul); });
    await lg(req, 'berita_dipulihkan', `Berita #${id} "${cur.judul}" dipulihkan sebagai draft`); res.json({ ok: true });
  }));
  api.get('/konten/berita/:id(\\d+)/riwayat', mod, ah(async (req, res) => res.json({ rows: await db.q("SELECT id, waktu, username, aksi, ket, sebelum, sesudah FROM cms_riwayat WHERE entitas='berita' AND entitas_id=$1 ORDER BY id DESC LIMIT 100", [+req.params.id]) })));
  api.get('/konten/berita/:id(\\d+)/pratinjau', mod, ah(async (req, res) => {
    const id = +req.params.id, o = await beritaFull(db.q, id); if (!o) return res.status(404).send('Berita tidak ditemukan.');
    const galeri = await db.q(`SELECT g.id, g.jenis, g.judul, g.caption, g.video_penyedia, g.video_kode, m.id AS mid, m.token AS mtok FROM cms_berita_galeri bg JOIN cms_galeri g ON g.id=bg.galeri_id LEFT JOIN cms_media m ON m.id=g.media_id WHERE bg.berita_id=$1 AND g.dihapus IS NULL ORDER BY bg.urutan`, [id]);
    const row = Object.assign({}, o, { isi_html: (await db.q('SELECT isi_html FROM cms_berita WHERE id=$1', [id]))[0].isi_html });
    const { renderDetail } = require('../pub-pages');
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.send(renderDetail({ berita: { judul: row.judul, slug: row.slug, ringkasan: row.ringkasan, isi_html: row.isi_html, kategori: row.kategori, kategori_slug: null, penulis: row.penulis, tanggal_kegiatan: row.tanggal_kegiatan,
      terbit_pada: row.terbit_pada || row.dibuat, gambar: row.gambar ? { url: row.gambar.url } : null, video_url: row.video_url, seo_deskripsi: row.seo_deskripsi },
      galeri: galeri.map(g => ({ jenis: g.jenis, judul: g.judul, caption: g.caption, url: g.mid ? L.mediaUrl({ id: g.mid, token: g.mtok }) : null, thumb: g.mid ? L.mediaUrl({ id: g.mid, token: g.mtok }, true) : null, video_penyedia: g.video_penyedia, video_kode: g.video_kode })), terkait: [], pratinjau: true, status: row.status_efektif }));
  }));

  // ---------------- galeri ----------------
  const GAL_SQL = `SELECT g.*, k.nama AS kategori, m.id AS mid, m.token AS mtok, t.id AS tid, t.token AS ttok, u.nama AS pengunggah,
    (SELECT COUNT(*)::int FROM cms_berita_galeri bg JOIN cms_berita b ON b.id=bg.berita_id AND b.dihapus IS NULL WHERE bg.galeri_id=g.id) AS dipakai_berita
    FROM cms_galeri g LEFT JOIN cms_kategori k ON k.id=g.kategori_id LEFT JOIN cms_media m ON m.id=g.media_id LEFT JOIN cms_media t ON t.id=g.thumb_media_id LEFT JOIN users u ON u.id=g.oleh`;
  const galOut = r => ({ id: r.id, jenis: r.jenis, judul: r.judul, deskripsi: r.deskripsi, caption: r.caption, kategori_id: r.kategori_id, kategori: r.kategori, tanggal_kegiatan: dstr(r.tanggal_kegiatan),
    foto: mu(r), video_url: r.video_url, video_penyedia: r.video_penyedia, video_kode: r.video_kode, video_thumb: r.tid ? { id: r.tid, url: L.mediaUrl({ id: r.tid, token: r.ttok }), thumb: L.mediaUrl({ id: r.tid, token: r.ttok }, true) } : null,
    status: r.dihapus ? 'dihapus' : r.status, urutan: r.urutan, dibuat: +r.dibuat, diubah: +r.diubah, pengunggah: r.pengunggah, dipakai_berita: r.dipakai_berita });
  api.get('/konten/galeri', mod, ah(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1), size = req.query.ukuran === '60' ? 60 : 24, w = mkW();
    const qs = U.str(req.query.q, 80); if (qs) { const p = w.push('%' + qs.replace(/[%_\\]/g, '\\$&') + '%'); w.raw(`(g.judul ILIKE ${p} OR COALESCE(g.caption,'') ILIKE ${p})`); }
    if (req.query.status === 'dihapus') w.raw('g.dihapus IS NOT NULL'); else { w.raw('g.dihapus IS NULL'); if (['draft', 'terbit', 'arsip'].includes(req.query.status)) w.raw(`g.status=${w.push(req.query.status)}`); }
    if (['foto', 'video'].includes(req.query.jenis)) w.raw(`g.jenis=${w.push(req.query.jenis)}`);
    const kid = idOf(req.query.kategori_id); if (kid) w.raw(`g.kategori_id=${w.push(kid)}`);
    const th = parseInt(req.query.tahun, 10); if (th >= 1990 && th <= 2100) w.raw(`EXTRACT(YEAR FROM COALESCE(g.tanggal_kegiatan, to_timestamp(g.dibuat/1000.0)))=${w.push(th)}`);
    const total = (await db.q(`SELECT COUNT(*)::int n FROM cms_galeri g ${w.sql}`, w.p))[0].n;
    const rows = await db.q(`${GAL_SQL} ${w.sql} ORDER BY (g.urutan=0), g.urutan, COALESCE(g.tanggal_kegiatan, to_timestamp(g.dibuat/1000.0)::date) DESC, g.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, w.p);
    res.json({ total, page, size, rows: rows.map(galOut) });
  }));
  api.get('/konten/galeri/:id(\\d+)', mod, ah(async (req, res) => { const r = (await db.q(`${GAL_SQL} WHERE g.id=$1`, [+req.params.id]))[0]; if (!r) return res.status(404).json({ error: 'Dokumentasi tidak ditemukan.' }); res.json(galOut(r)); }));
  async function bacaGaleri(q, b, partial, cur) {
    const e = {}, o = {}, jenis = cur ? cur.jenis : b.jenis;
    if (!partial) { if (!['foto', 'video'].includes(b.jenis)) e.jenis = 'Jenis harus foto atau video.'; else o.jenis = b.jenis; }
    if (!partial || 'judul' in b) { const v = U.str(b.judul, 150); if (v.length < 3) e.judul = 'Judul wajib diisi (minimal 3 karakter).'; else o.judul = v; }
    if ('deskripsi' in b) o.deskripsi = U.textOrNull(b.deskripsi, 1000);
    if ('caption' in b) o.caption = U.textOrNull(b.caption, 300);
    if ('kategori_id' in b) { const k = b.kategori_id ? idOf(b.kategori_id) : null; if (b.kategori_id && !k) e.kategori_id = 'Kategori tidak valid.'; else if (k) { const r = (await q("SELECT aktif FROM cms_kategori WHERE id=$1 AND tipe='galeri'", [k]))[0]; if (!r) e.kategori_id = 'Kategori tidak ditemukan.'; else if (!r.aktif && !(cur && cur.kategori_id === k)) e.kategori_id = 'Kategori sudah nonaktif.'; } o.kategori_id = k; }
    if ('tanggal_kegiatan' in b) { if (b.tanggal_kegiatan && !U.isDate(b.tanggal_kegiatan)) e.tanggal_kegiatan = 'Tanggal kegiatan tidak valid.'; else o.tanggal_kegiatan = b.tanggal_kegiatan || null; }
    if ('urutan' in b) { const n = parseInt(b.urutan, 10); if (!Number.isInteger(n) || n < 0 || n > 99999) e.urutan = 'Urutan harus angka 0–99999.'; else o.urutan = n; }
    if (!partial && jenis === 'foto' || 'media_id' in b) { const k = idOf(b.media_id); if (jenis === 'foto' || b.media_id) { if (!k || !(await q('SELECT 1 FROM cms_media WHERE id=$1', [k])).length) e.media_id = 'Foto wajib dipilih/diunggah.'; else o.media_id = k; } }
    if (jenis === 'video' && (!partial || 'video_url' in b)) { const v = L.parseVideo(b.video_url); if (!v) e.video_url = 'Tautan video harus dari YouTube atau Vimeo.'; else { o.video_url = v.url; o.video_penyedia = v.penyedia; o.video_kode = v.kode; } }
    if (jenis === 'video' && 'thumb_media_id' in b) { const k = b.thumb_media_id ? idOf(b.thumb_media_id) : null; if (k && !(await q('SELECT 1 FROM cms_media WHERE id=$1', [k])).length) e.thumb_media_id = 'Thumbnail tidak ditemukan.'; o.thumb_media_id = k; }
    if (!partial || 'status' in b) { const s = b.status || 'draft'; if (!['draft', 'terbit', 'arsip'].includes(s)) e.status = 'Status tidak valid.'; else o.status = s; }
    chk(e); return o;
  }
  const GAL_KEYS = ['judul', 'deskripsi', 'caption', 'kategori_id', 'tanggal_kegiatan', 'media_id', 'video_url', 'thumb_media_id', 'status', 'urutan'];
  async function insertGaleri(q, req, o, now) {
    const r = (await q(`INSERT INTO cms_galeri (jenis,judul,deskripsi,caption,kategori_id,tanggal_kegiatan,media_id,video_url,video_penyedia,video_kode,thumb_media_id,status,urutan,dibuat,diubah,oleh)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15) RETURNING id`, [o.jenis, o.judul, o.deskripsi || null, o.caption || null, o.kategori_id || null, o.tanggal_kegiatan || null, o.media_id || null,
      o.video_url || null, o.video_penyedia || null, o.video_kode || null, o.thumb_media_id || null, o.status || 'draft', o.urutan || 0, now, req.user.id]))[0].id;
    await riw(q, req, 'galeri', r, 'dibuat', o.judul, null, { jenis: o.jenis, status: o.status || 'draft' }); if ((o.status || 'draft') === 'terbit') await riw(q, req, 'galeri', r, 'diterbitkan', o.judul); return r;
  }
  api.post('/konten/galeri', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); let ju;
    const id = await db.tx(async q => { const o = await bacaGaleri(q, b, false); ju = o.judul; return insertGaleri(q, req, o, Date.now()); });
    await lg(req, 'galeri_ditambahkan', `Dokumentasi #${id} "${ju}" ditambahkan`); res.status(201).json({ ok: true, id });
  }));
  api.post('/konten/galeri/massal', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const items = Array.isArray(b.items) ? b.items : []; if (!items.length || items.length > 30) throw bad('Pilih 1–30 foto.', { items: 'Pilih 1–30 foto.' });
    const ids = await db.tx(async q => { const out = []; for (const it of items) { const o = await bacaGaleri(q, { jenis: 'foto', judul: it.judul, media_id: it.media_id, caption: it.caption, kategori_id: b.kategori_id, tanggal_kegiatan: b.tanggal_kegiatan, status: b.status || 'draft' }, false); out.push(await insertGaleri(q, req, o, Date.now())); } return out; });
    await lg(req, 'galeri_ditambahkan', `${ids.length} foto dokumentasi ditambahkan (#${ids.join(', #')})`); res.status(201).json({ ok: true, ids });
  }));
  async function pakaiBerita(q, gid) { return q('SELECT b.id, b.judul, b.status FROM cms_berita_galeri bg JOIN cms_berita b ON b.id=bg.berita_id AND b.dihapus IS NULL WHERE bg.galeri_id=$1', [gid]); }
  api.patch('/konten/galeri/:id(\\d+)', mod, wrap(async (req, res) => {
    const id = +req.params.id, b = req.body || {}; needK(b);
    const r = await db.tx(async q => {
      const cur = (await q('SELECT * FROM cms_galeri WHERE id=$1 FOR UPDATE', [id]))[0]; if (!cur) throw bad('Dokumentasi tidak ditemukan.', null, 404); if (cur.dihapus) throw bad('Dokumentasi sudah dihapus.', null, 409);
      const o = await bacaGaleri(q, b, true, cur); const keys = Object.keys(o); const [s, d] = diff(cur, Object.assign({}, cur, o), keys); if (!Object.keys(d).length) throw bad('Tidak ada perubahan.');
      const pk = (o.status === 'arsip' && cur.status !== 'arsip') ? await pakaiBerita(q, id) : [];
      if (pk.length && b.konfirmasi_dipakai !== true) return { tahan: pk };
      await q(`UPDATE cms_galeri SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, diubah=$${keys.length + 2} WHERE id=$1`, [id, ...keys.map(k => o[k]), Date.now()]);
      await riw(q, req, 'galeri', id, 'diubah', cur.judul, s, d); if (d.status !== undefined) await riw(q, req, 'galeri', id, d.status === 'terbit' ? 'diterbitkan' : d.status === 'arsip' ? 'diarsipkan' : 'status_diubah', cur.judul, { status: cur.status }, { status: o.status });
      return { cur, d };
    });
    if (r.tahan) return res.status(409).json({ error: 'Dokumentasi ini dipakai oleh berita. Mengarsipkannya akan menghilangkannya dari berita tersebut.', dipakai: r.tahan, perlu_konfirmasi: true });
    await lg(req, 'galeri_diubah', `Dokumentasi #${id} "${r.cur.judul}" diubah: ${Object.keys(r.d).join(', ')}`); if (r.d.status !== undefined) await lg(req, 'galeri_status_diubah', `Dokumentasi #${id} status → ${r.d.status}`);
    res.json({ ok: true });
  }));
  api.post('/konten/galeri/:id(\\d+)/ganti-foto', mod, wrap(async (req, res) => {
    const id = +req.params.id, b = req.body || {}; needK(b); const k = idOf(b.media_id);
    const r = await db.tx(async q => { const cur = (await q('SELECT * FROM cms_galeri WHERE id=$1 FOR UPDATE', [id]))[0]; if (!cur || cur.dihapus) throw bad('Dokumentasi tidak ditemukan.', null, 404); if (cur.jenis !== 'foto') throw bad('Hanya dokumentasi foto yang dapat diganti fotonya.');
      if (!k || !(await q('SELECT 1 FROM cms_media WHERE id=$1', [k])).length) throw bad('Foto pengganti tidak ditemukan.', { media_id: 'Pilih foto pengganti.' }); if (k === cur.media_id) throw bad('Foto pengganti sama dengan foto saat ini.');
      await q('UPDATE cms_galeri SET media_id=$2, diubah=$3 WHERE id=$1', [id, k, Date.now()]); await riw(q, req, 'galeri', id, 'foto_diganti', cur.judul, { media_id: cur.media_id }, { media_id: k }); return cur; });
    await lg(req, 'galeri_foto_diganti', `Foto dokumentasi #${id} "${r.judul}" diganti (media #${r.media_id} → #${k})`); res.json({ ok: true });
  }));
  api.post('/konten/galeri/urutan', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const ids = Array.isArray(b.ids) ? b.ids.map(idOf) : []; if (!ids.length || ids.includes(null) || ids.length > 500) throw bad('Daftar urutan tidak valid.');
    await db.tx(async q => { let i = 1; for (const id of ids) await q('UPDATE cms_galeri SET urutan=$2 WHERE id=$1 AND dihapus IS NULL', [id, i++]); await riw(q, req, 'galeri', null, 'urutan_diubah', `Urutan ${ids.length} dokumentasi diubah`); });
    await lg(req, 'galeri_urutan', `Urutan ${ids.length} dokumentasi diubah`); res.json({ ok: true });
  }));
  api.post('/konten/galeri/:id(\\d+)/hapus', mod, wrap(async (req, res) => {
    const id = +req.params.id, b = req.body || {}; needK(b);
    const r = await db.tx(async q => { const cur = (await q('SELECT * FROM cms_galeri WHERE id=$1 FOR UPDATE', [id]))[0]; if (!cur || cur.dihapus) throw bad('Dokumentasi tidak ditemukan.', null, 404);
      const pk = await pakaiBerita(q, id); if (pk.length && b.konfirmasi_dipakai !== true) return { tahan: pk };
      await q("UPDATE cms_galeri SET dihapus=$2, status='arsip', diubah=$2 WHERE id=$1", [id, Date.now()]); await riw(q, req, 'galeri', id, 'dihapus', cur.judul, { status: cur.status }, null); return { cur }; });
    if (r.tahan) return res.status(409).json({ error: 'Dokumentasi ini dipakai oleh berita. Menghapusnya akan menghilangkannya dari berita tersebut.', dipakai: r.tahan, perlu_konfirmasi: true });
    await lg(req, 'galeri_dihapus', `Dokumentasi #${id} "${r.cur.judul}" dihapus (file di Media Library tidak ikut terhapus)`); res.json({ ok: true });
  }));

  // ---------------- pengaturan, dashboard, statistik ----------------
  api.get('/konten/pengaturan', mod, ah(async (req, res) => res.json({ beranda: await setting(db.q, 'beranda'), tampilan: await setting(db.q, 'tampilan') })));
  api.put('/konten/pengaturan', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const e = {}; const total = parseInt(b.beranda && b.beranda.total, 10), um = parseInt(b.beranda && b.beranda.unggulan_maks, 10), ph = parseInt(b.tampilan && b.tampilan.per_halaman, 10);
    if (!(total >= 1 && total <= 12)) e.total = 'Jumlah berita di beranda 1–12.'; if (!(um >= 0 && um <= 12) || um > total) e.unggulan_maks = 'Jumlah unggulan 0 sampai jumlah berita di beranda.'; if (!(ph >= 3 && ph <= 30)) e.per_halaman = 'Berita per halaman 3–30.'; chk(e);
    await db.tx(async q => { const cur = { beranda: await setting(q, 'beranda'), tampilan: await setting(q, 'tampilan') };
      await q("INSERT INTO cms_pengaturan (kunci,nilai,diubah) VALUES ('beranda',$1,$3),('tampilan',$2,$3) ON CONFLICT (kunci) DO UPDATE SET nilai=EXCLUDED.nilai, diubah=EXCLUDED.diubah", [JSON.stringify({ total, unggulan_maks: um }), JSON.stringify({ per_halaman: ph }), Date.now()]);
      await riw(q, req, 'pengaturan', null, 'diubah', 'Pengaturan tampilan konten', cur, { beranda: { total, unggulan_maks: um }, tampilan: { per_halaman: ph } }); });
    await lg(req, 'pengaturan_konten', `Pengaturan konten: beranda ${total} berita (unggulan maks ${um}), ${ph} per halaman`); res.json({ ok: true });
  }));
  const bulan12 = () => { const o = [], d = new Date(Date.now() + 7 * 3600e3); d.setUTCDate(1); for (let i = 11; i >= 0; i--) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)); o.push(x.toISOString().slice(0, 7)); } return o; };
  async function statistik(q) {
    const now = Date.now(), bl = bulan12();
    const b = (await q(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='draft')::int draft, COUNT(*) FILTER (WHERE status='terjadwal' AND terbit_pada>$1)::int menunggu,
      COUNT(*) FILTER (WHERE status IN ('terbit','terjadwal') AND terbit_pada<=$1)::int terbit, COUNT(*) FILTER (WHERE status='arsip')::int arsip, COUNT(*) FILTER (WHERE unggulan AND status IN ('terbit','terjadwal') AND terbit_pada<=$1)::int unggulan FROM cms_berita WHERE dihapus IS NULL`, [now]))[0];
    const g = (await q(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE jenis='foto')::int foto, COUNT(*) FILTER (WHERE jenis='video')::int video, COUNT(*) FILTER (WHERE status='terbit')::int terbit, COUNT(*) FILTER (WHERE status='draft')::int draft, COUNT(*) FILTER (WHERE status='arsip')::int arsip FROM cms_galeri WHERE dihapus IS NULL`))[0];
    const media = (await q('SELECT COUNT(*)::int n, COALESCE(SUM(ukuran),0)::bigint ukuran FROM cms_media'))[0];
    const bulanDibuat = await q("SELECT to_char(to_timestamp((dibuat+25200000)/1000.0),'YYYY-MM') AS bln, COUNT(*)::int n FROM cms_berita WHERE dihapus IS NULL GROUP BY 1");
    const bulanTerbit = await q("SELECT to_char(to_timestamp((terbit_pada+25200000)/1000.0),'YYYY-MM') AS bln, COUNT(*)::int n FROM cms_berita WHERE dihapus IS NULL AND status IN ('terbit','terjadwal') AND terbit_pada<=$1 GROUP BY 1", [now]);
    const pm = rows => bl.map(k => ({ bulan: k, n: (rows.find(r => r.bln === k) || { n: 0 }).n }));
    return { berita: b, galeri: g, media: { total: media.n, ukuran: +media.ukuran }, per_bulan: pm(bulanDibuat), publikasi_per_bulan: pm(bulanTerbit),
      kategori_berita: await q("SELECT COALESCE(k.nama,'Tanpa kategori') AS nama, COUNT(*)::int n FROM cms_berita b LEFT JOIN cms_kategori k ON k.id=b.kategori_id WHERE b.dihapus IS NULL GROUP BY 1 ORDER BY n DESC, 1"),
      kategori_galeri: await q("SELECT COALESCE(k.nama,'Tanpa kategori') AS nama, COUNT(*)::int n, COUNT(*) FILTER (WHERE g.jenis='foto')::int foto, COUNT(*) FILTER (WHERE g.jenis='video')::int video FROM cms_galeri g LEFT JOIN cms_kategori k ON k.id=g.kategori_id WHERE g.dihapus IS NULL GROUP BY 1 ORDER BY n DESC, 1") };
  }
  api.get('/konten/statistik', mod, ah(async (req, res) => res.json(await statistik(db.q))));
  api.get('/konten/dashboard', mod, ah(async (req, res) => {
    const out = await statistik(db.q), now = Date.now();
    out.berita_terbaru = (await db.q(`${BER_SQL} WHERE b.dihapus IS NULL ORDER BY b.diubah DESC LIMIT 5`)).map(r => berOut(r, now));
    out.galeri_terbaru = (await db.q(`${GAL_SQL} WHERE g.dihapus IS NULL ORDER BY g.diubah DESC LIMIT 6`)).map(galOut);
    out.aktivitas = await db.q('SELECT id, waktu, username, entitas, aksi, ket FROM cms_riwayat ORDER BY id DESC LIMIT 10');
    res.json(out);
  }));
  api.get('/konten/riwayat', mod, ah(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1), size = 25;
    res.json({ total: (await db.q('SELECT COUNT(*)::int n FROM cms_riwayat'))[0].n, page, size, rows: await db.q('SELECT id, waktu, username, entitas, entitas_id, aksi, ket, sebelum, sesudah FROM cms_riwayat ORDER BY id DESC LIMIT $1 OFFSET $2', [size, (page - 1) * size]) });
  }));
}
module.exports = { register, DEF, KUNCI, setting: null };
