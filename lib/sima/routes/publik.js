'use strict';
// API & halaman PUBLIK (tanpa login). Semua pembacaan memakai role database `sima_publik` yang HANYA punya SELECT pada view v_pub_*:
// draft, terjadwal-belum-waktunya, arsip, dan konten terhapus tidak pernah dapat terbaca dari jalur ini.
const L = require('../konten-lib');
const P = require('../pub-pages');
const DEF_B = { total: 3, unggulan_maks: 2 }, DEF_T = { per_halaman: 9 };
const CACHE = 'public, max-age=0, s-maxage=30, stale-while-revalidate=60';   // perubahan di SIMA tampil dalam ≤ ~30 dtk
const NOSTORE = 'no-store';

function register(api, { db, ah }) {
  const pub = fn => db.tx(async q => { await q('SET LOCAL ROLE sima_publik'); return fn(q); });
  const base = req => (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const num = (v, d, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const m = (id, tok, thumb) => id ? L.mediaUrl({ id, token: tok }, thumb) : null;
  const setting = async (q, kunci, def) => { const r = (await q('SELECT nilai FROM v_pub_pengaturan WHERE kunci=$1', [kunci]))[0]; return Object.assign({}, def, r ? r.nilai : {}); };
  const SEL = `SELECT b.id, b.slug, b.judul, b.ringkasan, b.kategori, b.kategori_slug, b.terbit_pada, b.tanggal_kegiatan, b.unggulan, b.urutan_unggulan, b.media_utama_id AS mid, md.token AS mtok, md.lebar, md.tinggi FROM v_pub_berita b LEFT JOIN v_pub_media md ON md.id=b.media_utama_id`;
  const card = r => ({ id: r.id, slug: r.slug, url: '/berita/' + r.slug, judul: r.judul, ringkasan: r.ringkasan || null, kategori: r.kategori, kategori_slug: r.kategori_slug, terbit_pada: +r.terbit_pada, tanggal: new Date(+r.terbit_pada + 7 * 3600e3).toISOString().slice(0, 10),
    unggulan: !!r.unggulan, gambar: m(r.mid, r.mtok), thumb: m(r.mid, r.mtok, true), lebar: r.lebar || null, tinggi: r.tinggi || null });
  const dstr = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
  const esc = s => String(s || '').replace(/[\\%_]/g, '\\$&');

  async function daftar(q, { qs, kat, page, per }) {
    const p = [], c = [];
    if (qs) { p.push('%' + esc(qs) + '%'); c.push(`(b.judul ILIKE $${p.length} OR COALESCE(b.ringkasan,'') ILIKE $${p.length} OR b.isi_html ILIKE $${p.length})`); }
    if (kat) { p.push(kat); c.push(`b.kategori_slug=$${p.length}`); }
    const W = c.length ? 'WHERE ' + c.join(' AND ') : '';
    const total = (await q(`SELECT COUNT(*)::int n FROM v_pub_berita b ${W}`, p))[0].n;
    const rows = await q(`${SEL} ${W} ORDER BY b.terbit_pada DESC, b.id DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, p);
    return { total, rows: rows.map(card) };
  }
  // ---- JSON ----
  api.get('/pub/berita', ah(async (req, res) => {
    const out = await pub(async q => {
      if (req.query.beranda === '1') {   // beranda: unggulan (sesuai pengaturan) dahulu, sisanya berita terbaru — satu sumber data dengan halaman /berita
        const s = await setting(q, 'beranda', DEF_B), u = s.unggulan_maks > 0 ? (await q(`${SEL} WHERE b.unggulan ORDER BY b.urutan_unggulan, b.terbit_pada DESC LIMIT ${s.unggulan_maks}`)).map(card) : [];
        const ids = u.map(x => x.id), t = (await q(`${SEL} ${ids.length ? `WHERE b.id <> ALL($1::int[])` : ''} ORDER BY b.terbit_pada DESC, b.id DESC LIMIT ${s.total}`, ids.length ? [ids] : [])).map(card);
        const rows = u.concat(t).slice(0, s.total); return { total: rows.length, rows, semua_url: '/berita' };
      }
      const per = num(req.query.per, (await setting(q, 'tampilan', DEF_T)).per_halaman, 1, 30), page = num(req.query.page, 1, 1, 10000);
      const r = await daftar(q, { qs: String(req.query.q || '').trim().slice(0, 80), kat: String(req.query.kategori || '').slice(0, 80), page, per }); return Object.assign({ page, per }, r);
    });
    res.set('Cache-Control', CACHE).json(out);
  }));
  api.get('/pub/kategori', ah(async (req, res) => {
    const rows = await pub(q => q("SELECT tipe, nama, slug, kunci_halaman FROM v_pub_kategori ORDER BY tipe, urutan, nama"));
    res.set('Cache-Control', CACHE).json({ berita: rows.filter(r => r.tipe === 'berita'), galeri: rows.filter(r => r.tipe === 'galeri') });
  }));
  const galItem = r => ({ id: r.id, jenis: r.jenis, judul: r.judul, deskripsi: r.deskripsi || null, caption: r.caption || null, kategori: r.kategori, kategori_slug: r.kategori_slug, tanggal: dstr(r.tanggal_kegiatan),
    url: m(r.media_id, r.mtok), thumb: m(r.media_id, r.mtok, true) || m(r.thumb_media_id, r.ttok, true) || null, lebar: r.lebar || null, tinggi: r.tinggi || null,
    video: r.jenis === 'video' ? { penyedia: r.video_penyedia, kode: r.video_kode, embed: L.embedSrc(r.video_penyedia, r.video_kode), tautan: r.video_url, poster: m(r.thumb_media_id, r.ttok) || L.videoThumb(r.video_penyedia, r.video_kode) } : null });
  const GSEL = `SELECT g.*, md.token AS mtok, md.lebar, md.tinggi, tm.token AS ttok FROM v_pub_galeri g LEFT JOIN v_pub_media md ON md.id=g.media_id LEFT JOIN v_pub_media tm ON tm.id=g.thumb_media_id`;
  api.get('/pub/galeri', ah(async (req, res) => {
    const out = await pub(async q => {
      const p = [], c = [], per = num(req.query.per, 24, 1, 60), page = num(req.query.page, 1, 1, 10000);
      if (req.query.kategori) { p.push(String(req.query.kategori).slice(0, 80)); c.push(`g.kategori_slug=$${p.length}`); }
      if (req.query.halaman) { p.push(String(req.query.halaman).slice(0, 30)); c.push(`g.kunci_halaman=$${p.length}`); }
      if (['foto', 'video'].includes(req.query.jenis)) { p.push(req.query.jenis); c.push(`g.jenis=$${p.length}`); }
      const th = parseInt(req.query.tahun, 10); if (th >= 1990 && th <= 2100) { p.push(th); c.push(`EXTRACT(YEAR FROM COALESCE(g.tanggal_kegiatan, to_timestamp(g.dibuat/1000.0)))=$${p.length}`); }
      const W = c.length ? 'WHERE ' + c.join(' AND ') : '';
      const total = (await q(`SELECT COUNT(*)::int n FROM v_pub_galeri g ${W}`, p))[0].n;
      const rows = await q(`${GSEL} ${W} ORDER BY (g.urutan=0), g.urutan, COALESCE(g.tanggal_kegiatan, to_timestamp(g.dibuat/1000.0)::date) DESC, g.id DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, p);
      const tahun = (await q("SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(tanggal_kegiatan, to_timestamp(dibuat/1000.0)))::int AS t FROM v_pub_galeri ORDER BY 1 DESC")).map(r => r.t);
      const kategori = await q("SELECT k.nama, k.slug, COUNT(*)::int n FROM v_pub_galeri g JOIN v_pub_kategori k ON k.slug=g.kategori_slug AND k.tipe='galeri' GROUP BY k.nama, k.slug, k.urutan ORDER BY k.urutan, k.nama");
      return { total, page, per, rows: rows.map(galItem), tahun, kategori };
    });
    res.set('Cache-Control', CACHE).json(out);
  }));
  api.get('/pub/ekstra', ah(async (req, res) => {   // halaman Ekstrakurikuler: dokumentasi SIMA per kegiatan (kunci_halaman)
    const out = await pub(async q => {
      const rows = (await q(`${GSEL} WHERE g.kunci_halaman IS NOT NULL ORDER BY (g.urutan=0), g.urutan, COALESCE(g.tanggal_kegiatan, to_timestamp(g.dibuat/1000.0)::date) DESC, g.id DESC LIMIT 400`)).map(galItem), by = {};
      const kat = await q("SELECT nama, slug, deskripsi, kunci_halaman FROM v_pub_kategori WHERE tipe='galeri' AND kunci_halaman IS NOT NULL");
      kat.forEach(k => { by[k.kunci_halaman] = { kategori: k.nama, deskripsi: k.deskripsi || null, items: [] }; });
      rows.forEach(r => { const k = (kat.find(x => x.slug === r.kategori_slug) || {}).kunci_halaman; if (k) (by[k] = by[k] || { items: [] }).items.push(r); });
      return { kegiatan: by };
    });
    res.set('Cache-Control', CACHE).json(out);
  }));
  async function detail(q, slug) {
    const s = (await q('SELECT slug, utama, slug_utama FROM v_pub_slug WHERE slug=$1', [slug]))[0]; if (!s) return null;
    if (!s.utama) return { redirect: s.slug_utama };
    const b = (await q('SELECT b.*, md.token AS mtok, md.lebar, md.tinggi, md.alt FROM v_pub_berita b LEFT JOIN v_pub_media md ON md.id=b.media_utama_id WHERE b.slug=$1', [slug]))[0]; if (!b) return null;
    const gal = await q(`SELECT g.*, md.token AS mtok, tm.token AS ttok FROM v_pub_berita_galeri g LEFT JOIN v_pub_media md ON md.id=g.media_id LEFT JOIN v_pub_media tm ON tm.id=g.thumb_media_id WHERE g.berita_id=$1 ORDER BY g.urutan_berita`, [b.id]);
    const ter = await q(`${SEL} WHERE b.id<>$1 ${b.kategori_slug ? 'AND b.kategori_slug=$2' : ''} ORDER BY b.terbit_pada DESC LIMIT 3`, b.kategori_slug ? [b.id, b.kategori_slug] : [b.id]);
    let terkait = ter.map(card); if (terkait.length < 3) { const ids = [b.id, ...terkait.map(x => x.id)]; terkait = terkait.concat((await q(`${SEL} WHERE b.id <> ALL($1::int[]) ORDER BY b.terbit_pada DESC LIMIT ${3 - terkait.length}`, [ids])).map(card)); }
    return { b, gal, terkait };
  }
  const detailOut = d => ({ judul: d.b.judul, slug: d.b.slug, ringkasan: d.b.ringkasan, isi_html: d.b.isi_html, kategori: d.b.kategori, kategori_slug: d.b.kategori_slug, penulis: d.b.penulis, tanggal_kegiatan: dstr(d.b.tanggal_kegiatan),
    terbit_pada: +d.b.terbit_pada, diubah: +d.b.diubah, seo_deskripsi: d.b.seo_deskripsi, seo_kata_kunci: d.b.seo_kata_kunci, video_url: d.b.video_url,
    gambar: d.b.media_utama_id ? { url: m(d.b.media_utama_id, d.b.mtok), thumb: m(d.b.media_utama_id, d.b.mtok, true), lebar: d.b.lebar, tinggi: d.b.tinggi, alt: d.b.alt || null } : null });
  const galOutB = g => ({ jenis: g.jenis, judul: g.judul, caption: g.caption, url: m(g.media_id, g.mtok), thumb: m(g.media_id, g.mtok, true) || m(g.thumb_media_id, g.ttok, true), video_penyedia: g.video_penyedia, video_kode: g.video_kode });
  api.get('/pub/berita/:slug', ah(async (req, res) => {
    const d = await pub(q => detail(q, String(req.params.slug).toLowerCase().slice(0, 100)));
    if (!d) return res.status(404).set('Cache-Control', NOSTORE).json({ error: 'Berita tidak ditemukan.' });
    if (d.redirect) return res.redirect(301, `/api/sima/pub/berita/${d.redirect}`);
    res.set('Cache-Control', CACHE).json(Object.assign(detailOut(d), { galeri: d.gal.map(galOutB), terkait: d.terkait }));
  }));

  // ---- HTML (diakses lewat /berita dan /berita/:slug; lihat vercel.json & dev-server) ----
  const html = (res, st, body, cache) => res.status(st).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache || CACHE, 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin' }).send(body);
  api.get('/pub/halaman/berita', ah(async (req, res) => {
    const out = await pub(async q => {
      const per = (await setting(q, 'tampilan', DEF_T)).per_halaman, page = num(req.query.page, 1, 1, 10000), qs = String(req.query.q || '').trim().slice(0, 80), kat = String(req.query.kategori || '').slice(0, 80);
      const r = await daftar(q, { qs, kat, page, per });
      const s = await setting(q, 'beranda', DEF_B); const unggulan = !qs && !kat && page === 1 ? (await q(`${SEL} WHERE b.unggulan ORDER BY b.urutan_unggulan, b.terbit_pada DESC LIMIT ${Math.max(1, s.unggulan_maks)}`)).map(card) : [];
      const ids = unggulan.map(x => x.id), rows = r.rows.filter(x => !ids.includes(x.id) || qs || kat);
      return { ...r, rows, unggulan, per, page, qs, kat, kategoriList: await q("SELECT nama, slug FROM v_pub_kategori WHERE tipe='berita' AND slug IN (SELECT kategori_slug FROM v_pub_berita) ORDER BY urutan, nama") };
    });
    html(res, 200, P.renderList({ base: base(req), rows: out.rows, unggulan: out.unggulan, total: out.total, page: out.page, per: out.per, q: out.qs, kategori: out.kat, kategoriList: out.kategoriList }));
  }));
  api.get('/pub/halaman/berita/:slug', ah(async (req, res) => {
    const d = await pub(q => detail(q, String(req.params.slug).toLowerCase().slice(0, 100)));
    if (!d) return html(res, 404, P.render404(base(req)), NOSTORE);
    if (d.redirect) return res.redirect(301, `/berita/${d.redirect}`);
    html(res, 200, P.renderDetail({ base: base(req), berita: detailOut(d), galeri: d.gal.map(galOutB), terkait: d.terkait }));
  }));
  api.get('/pub/sitemap', ah(async (req, res) => {
    const b = base(req), rows = await pub(q => q('SELECT slug, diubah FROM v_pub_berita ORDER BY terbit_pada DESC LIMIT 5000'));
    const u = (loc, last) => `<url><loc>${L.esc(b + loc)}</loc>${last ? `<lastmod>${new Date(+last).toISOString()}</lastmod>` : ''}</url>`;
    res.set({ 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': CACHE }).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${u('/')}${u('/berita')}${rows.map(r => u('/berita/' + r.slug, r.diubah)).join('')}</urlset>`);
  }));
  // ---- Media publik: hanya foto yang dipakai konten yang sedang tayang; URL memuat token isi sehingga aman di-cache lama ----
  api.get('/pub/media/:id(\\d+)-:tok([0-9a-f]{8})(-t)?.webp', ah(async (req, res) => {
    const t = !!req.params[2], r = await pub(async q => (await q(`SELECT token, ${t ? 'thumb' : 'isi'} AS b FROM v_pub_media WHERE id=$1`, [+req.params.id]))[0]);
    if (!r || r.token !== req.params.tok) return res.status(404).set('Cache-Control', NOSTORE).json({ error: 'Tidak ditemukan.' });
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Length': String(r.b.length), 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' }).end(r.b);
  }));
}
module.exports = { register };
