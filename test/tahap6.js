'use strict';
// Pengujian Tahap 6 (Berita & Galeri + integrasi website publik). Semua judul/nama di sini adalah DATA UJI di database memori — bukan konten pondok.
const sharp = require('sharp');
module.exports = async function tahap6(X) {
  const { t, client, adm, ben, kea, get, q, A, assert, rejects, db, PW, base } = X;
  const K = '/konten';
  const P = (c, u, b) => c.req('POST', A + K + u, Object.assign({ konfirmasi: true }, b)), G = (c, u) => c.req('GET', A + K + u), PA = (c, u, b) => c.req('PATCH', A + K + u, Object.assign({ konfirmasi: true }, b));
  const ok = (r, st = 200) => { assert.strictEqual(r.status, st, `status ${r.status}: ${(r.text || '').slice(0, 300)}`); return r.json; };
  const err = async (p, st) => { const r = await p; assert.strictEqual(r.status, st, `diharapkan ${st}, dapat ${r.status}: ${(r.text || '').slice(0, 260)}`); return r.json; };
  const web = async p => { const r = await fetch(base() + p, { redirect: 'manual' }); const ct = r.headers.get('content-type') || ''; const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, text: /json|html|xml|text/.test(ct) ? buf.toString() : '', buf, headers: r.headers, json: /json/.test(ct) ? JSON.parse(buf.toString()) : null }; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const img = async (w, h, color, fmt = 'jpeg') => sharp({ create: { width: w, height: h, channels: 3, background: color } })[fmt]().toBuffer();
  const up = async (buf, nama = 'foto-uji.jpg', c = adm) => c.req('POST', A + K + '/media', { nama, data: buf.toString('base64'), konfirmasi: true });
  const fut = ms => Date.now() + ms;
  let kB1, kB2, kG1, kGsilat, m1, m2, m3, b1, b1slug, b2, g1, g2, gv, ids = {};
  const logs = async (aksi) => (await q('SELECT COUNT(*)::int n FROM activity_log WHERE aksi=$1', [aksi]))[0].n;
  await ben.login('bendahara1', PW); await kea.login('keamanan1', PW);

  await t('62a. Akses: Bendahara & Keamanan ditolak ke seluruh endpoint konten (403); tanpa login 401; publik terbuka tanpa login', async () => {
    for (const u of ['/dashboard', '/ref', '/kategori', '/berita', '/berita/1', '/galeri', '/media', '/pengaturan', '/statistik', '/riwayat', '/media/1/berkas']) for (const c of [ben, kea]) await err(G(c, u), 403);
    for (const c of [ben, kea]) { await err(P(c, '/berita', { judul: 'Percobaan Akses' }), 403); await err(P(c, '/kategori', { tipe: 'berita', nama: 'Percobaan' }), 403); await err(up(await img(40, 40, '#0a0'), 'x.jpg', c), 403); await err(c.req('PUT', A + K + '/pengaturan', { konfirmasi: true }), 403); }
    await err(client().req('GET', A + K + '/dashboard'), 401);
    for (const u of ['/pub/berita', '/pub/galeri', '/pub/kategori', '/pub/ekstra']) assert.strictEqual((await client().req('GET', A + u)).status, 200, u);
    ok(await G(adm, '/dashboard'));
  });
  await t('62b. Role DB: sima_keuangan & sima_keamanan tidak punya hak pada cms_* maupun v_pub_*; sima_publik hanya view', async () => {
    const as = (role, sql) => db.tx(async x => { await x(`SET LOCAL ROLE ${role}`); return x(sql); });
    for (const r of ['sima_keuangan', 'sima_keamanan']) for (const tb of ['cms_berita', 'cms_galeri', 'cms_media', 'cms_kategori', 'cms_riwayat', 'v_pub_berita', 'v_pub_media']) await rejects(as(r, `SELECT * FROM ${tb}`), /permission denied/i, r + ' ' + tb);
    for (const tb of ['cms_berita', 'cms_media', 'cms_galeri', 'cms_riwayat', 'users', 'santri']) await rejects(as('sima_publik', `SELECT * FROM ${tb}`), /permission denied/i, 'publik ' + tb);
    await rejects(as('sima_publik', "INSERT INTO cms_pengaturan (kunci,nilai,diubah) VALUES ('x','{}',1)"), /permission denied/i, 'publik tulis');
    await as('sima_publik', 'SELECT * FROM v_pub_berita');
  });
  await t('62c. Awal kosong (tanpa berita/kategori/galeri bawaan); empty state publik informatif', async () => {
    for (const tb of ['cms_berita', 'cms_galeri', 'cms_media', 'cms_kategori']) assert.strictEqual((await get(`SELECT COUNT(*)::int n FROM ${tb}`)).n, 0, tb);
    const r = await web('/berita'); assert.strictEqual(r.status, 200); assert.ok(/Belum ada berita/.test(r.text)); assert.ok(!/class="kc"/.test(r.text));
    assert.strictEqual(ok(await client().req('GET', A + '/pub/berita')).rows.length, 0);
    assert.strictEqual(ok(await client().req('GET', A + '/pub/berita?beranda=1')).rows.length, 0);
  });
  await t('62d. Kategori berita & galeri: tambah, ganda ditolak, ubah, nonaktifkan, muat contoh eksplisit & idempoten (kunci halaman ekstrakurikuler)', async () => {
    kB1 = ok(await P(adm, '/kategori', { tipe: 'berita', nama: 'Kategori Uji A' }), 201).id; kB2 = ok(await P(adm, '/kategori', { tipe: 'berita', nama: 'Kategori Uji B' }), 201).id;
    await err(P(adm, '/kategori', { tipe: 'berita', nama: 'kategori uji a' }), 409); await err(P(adm, '/kategori', { tipe: 'berita', nama: 'ab' }), 400); await err(P(adm, '/kategori', { tipe: 'lain', nama: 'Tidak Valid' }), 400);
    kG1 = ok(await P(adm, '/kategori', { tipe: 'galeri', nama: 'Galeri Uji A' }), 201).id; await err(P(adm, '/kategori', { tipe: 'berita', nama: 'Salah Kunci', kunci_halaman: 'silat' }), 400);
    kGsilat = ok(await P(adm, '/kategori', { tipe: 'galeri', nama: 'Silat Uji', kunci_halaman: 'silat' }), 201).id;
    ok(await PA(adm, '/kategori/' + kB2, { nama: 'Kategori Uji B (ubah)', deskripsi: 'Deskripsi uji' }));
    assert.strictEqual((await get('SELECT slug FROM cms_kategori WHERE id=$1', [kB2])).slug, 'kategori-uji-b', 'slug kategori tidak berubah otomatis');
    const aw = ok(await P(adm, '/kategori/awal', { tipe: 'berita' })); assert.strictEqual(aw.ditambahkan, 7); assert.strictEqual(ok(await P(adm, '/kategori/awal', { tipe: 'berita' })).ditambahkan, 0);
    const ag = ok(await P(adm, '/kategori/awal', { tipe: 'galeri' })); assert.ok(ag.ditambahkan >= 12);
    assert.deepStrictEqual((await q("SELECT nama, kunci_halaman FROM cms_kategori WHERE tipe='galeri' AND kunci_halaman IS NOT NULL ORDER BY kunci_halaman")).map(r => r.kunci_halaman), ['banjari', 'bisnis', 'pidato', 'silat', 'silat', 'tulis']);
    await err(adm.req('POST', A + K + '/kategori/awal', { tipe: 'berita' }), 400);
    const kn = ok(await P(adm, '/kategori', { tipe: 'berita', nama: 'Kategori Nonaktif Uji' }), 201).id; ok(await PA(adm, '/kategori/' + kn, { aktif: false })); ids.kNon = kn;
    await err(P(adm, '/berita', { judul: 'Berita Kategori Nonaktif', kategori_id: kn }), 400);
    assert.ok(!(await web('/api/sima/pub/kategori')).json.berita.some(k => k.nama === 'Kategori Nonaktif Uji'));
  });
  await t('62e. Foto: unggah → WebP 1600px + thumbnail 480px, dedup (tanpa file ganda), format/ukuran/isi palsu ditolak, file disimpan persisten di database (bukan teks)', async () => {
    const big = await img(3200, 2400, '#2a7a4a'), r1 = ok(await up(big, 'besar-uji.jpg'), 201); m1 = r1.id;
    assert.ok(r1.lebar <= 1600 && r1.lebar === 1600, 'diperkecil ke 1600px'); assert.ok(/^\/media\/\d+-[0-9a-f]{8}\.webp$/.test(r1.url));
    const row = await get('SELECT mime, ukuran, octet_length(isi) n, octet_length(thumb) nt, sha256 FROM cms_media WHERE id=$1', [m1]); assert.strictEqual(row.mime, 'image/webp'); assert.ok(row.n < big.length, 'teroptimasi'); assert.ok(row.nt < row.n);
    const th = await sharp((await get('SELECT thumb FROM cms_media WHERE id=$1', [m1])).thumb).metadata(); assert.ok(th.width <= 480);
    const dup = ok(await up(big, 'nama-lain.jpg')); assert.strictEqual(dup.ada, true); assert.strictEqual(dup.id, m1); assert.strictEqual((await get('SELECT COUNT(*)::int n FROM cms_media')).n, 1);
    m2 = ok(await up(await img(800, 600, '#aa8800', 'png'), 'kedua.png'), 201).id; m3 = ok(await up(await img(640, 480, '#335599', 'webp'), 'ketiga.webp'), 201).id;
    await err(up(Buffer.from('<?php echo 1; ?>'), 'shell.php.jpg'), 400); await err(up(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg'), 400);
    await err(up(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('bukan-gambar-sebenarnya-xxxxxxxxxxxxxxxx')]), 'palsu.jpg'), 400);
    { const r = await up(Buffer.alloc(3 * 1024 * 1024 + 10, 0xff), 'raksasa.jpg'); assert.ok([400, 413].includes(r.status), 'status ' + r.status); } await err(adm.req('POST', A + K + '/media', { konfirmasi: true, nama: 'x' }), 400);
    assert.strictEqual((await G(adm, '/media')).json.total, 3); assert.strictEqual((await G(adm, '/media?pakai=tidak')).json.total, 3);
    assert.strictEqual((await adm.buf(A + K + '/media/' + m1 + '/berkas?thumb=1')).status, 200);
  });
  await t('62f. Berita: buat, slug otomatis & unik, ubah tanpa mengubah slug, validasi', async () => {
    const r = ok(await P(adm, '/berita', { judul: 'Berita Uji Pertama', ringkasan: 'Ringkasan uji.', isi_html: '<h2>Subjudul</h2><p>Isi <b>uji</b> pertama.</p>', kategori_id: kB1, media_utama_id: m1, penulis: 'Penulis Uji', tanggal_kegiatan: '2026-10-01', seo_deskripsi: 'Deskripsi SEO uji', seo_kata_kunci: 'uji, berita' }), 201);
    b1 = r.id; b1slug = r.slug; assert.strictEqual(b1slug, 'berita-uji-pertama'); const dup = ok(await P(adm, '/berita', { judul: 'Berita Uji Pertama' }), 201); assert.strictEqual(dup.slug, 'berita-uji-pertama-2'); ids.dup = dup.id;
    assert.strictEqual((await get('SELECT status FROM cms_berita WHERE id=$1', [b1])).status, 'draft');
    ok(await PA(adm, '/berita/' + b1, { judul: 'Judul Uji Diubah Total' })); assert.strictEqual((await get('SELECT slug FROM cms_berita WHERE id=$1', [b1])).slug, b1slug, 'slug tidak berubah saat judul berubah');
    await err(P(adm, '/berita', { judul: 'ab' }), 400); await err(P(adm, '/berita', { judul: 'Slug Salah Uji', slug: 'Slug Salah!' }), 400); await err(P(adm, '/berita', { judul: 'Video Salah Uji', video_url: 'https://evil.example/video' }), 400);
    await err(P(adm, '/berita', { judul: 'Gambar Palsu Uji', media_utama_id: 99999 }), 400); await err(P(adm, '/berita', { judul: 'Terbit Tanpa Isi', status: 'terbit' }), 400);
    await err(adm.req('POST', A + K + '/berita', { judul: 'Tanpa Konfirmasi Uji' }), 400);
    ok(await PA(adm, '/berita/' + b1, { video_url: 'https://youtu.be/dQw4w9WgXcQ' })); assert.strictEqual((await get('SELECT video_url v FROM cms_berita WHERE id=$1', [b1])).v, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.strictEqual(ok(await G(adm, '/berita/' + b1)).isi_html.includes('Subjudul'), true); await err(PA(adm, '/berita/' + b1, { judul: 'Judul Uji Diubah Total' }), 400);
  });
  await t('62g. Sanitasi: script, onerror, javascript:, iframe, gambar luar, atribut style dibuang dari penyimpanan dan dari halaman publik', async () => {
    const jahat = '<p onclick="x()" style="color:red">Aman</p><script>alert(1)</script><a href="javascript:alert(1)">klik</a><img src="http://evil.example/p.png" onerror="alert(1)"><iframe src="https://evil.example"></iframe><svg onload="alert(1)"></svg><div class="x">tak boleh</div><img src="/media/' + m2 + '-' + (await get('SELECT token t FROM cms_media WHERE id=$1', [m2])).t + '.webp" alt="ok">';
    const id = ok(await P(adm, '/berita', { judul: 'Berita Uji Sanitasi', isi_html: jahat, status: 'terbit' }), 201).id; const raw = (await get('SELECT isi_html h FROM cms_berita WHERE id=$1', [id])).h;
    for (const bad of ['<script', 'onclick', 'onerror', 'javascript:', 'iframe', 'evil.example', 'style=', 'onload', 'class="x"']) assert.ok(!raw.includes(bad), 'tersisa: ' + bad + ' → ' + raw);
    assert.ok(raw.includes('Aman') && raw.includes('/media/' + m2 + '-')); const pg = (await web('/berita/berita-uji-sanitasi')).text; assert.ok(!/<script>alert|onerror|javascript:/.test(pg)); assert.ok(pg.includes('/media/' + m2 + '-'));
    ids.san = id; ok(await PA(adm, '/berita/' + id, { status: 'arsip' }));
  });
  await t('62h. Status: draft tidak tampil publik (API, halaman, URL langsung, sitemap, pencarian); terbit tampil; arsip hilang; slug lama dialihkan (301)', async () => {
    const pub = () => web('/api/sima/pub/berita?per=30'); assert.strictEqual((await pub()).json.rows.length, 0);
    assert.strictEqual((await web('/berita/' + b1slug)).status, 404); assert.strictEqual((await web('/api/sima/pub/berita/' + b1slug)).status, 404); assert.ok(!(await web('/sitemap.xml')).text.includes(b1slug)); assert.ok(!(await web('/berita?q=Judul+Uji')).text.includes('Judul Uji Diubah Total'));
    ok(await P(adm, '/berita/' + b1 + '/status', { status: 'terbit' })); const rows = (await pub()).json.rows; assert.strictEqual(rows.length, 1); assert.strictEqual(rows[0].slug, b1slug);
    assert.ok(!('status' in rows[0]) && !('oleh' in rows[0]) && !('dibuat' in rows[0]) && !('isi_html' in rows[0]), 'API publik tidak membocorkan kolom internal');
    assert.strictEqual((await web('/berita/' + b1slug)).status, 200); assert.ok((await web('/sitemap.xml')).text.includes('/berita/' + b1slug));
    ok(await PA(adm, '/berita/' + b1, { slug: 'slug-baru-uji' })); const lama = await web('/berita/' + b1slug); assert.strictEqual(lama.status, 301); assert.strictEqual(lama.headers.get('location'), '/berita/slug-baru-uji'); assert.strictEqual((await web('/berita/slug-baru-uji')).status, 200); b1slug = 'slug-baru-uji';
    await err(PA(adm, '/berita/' + ids.dup, { slug: 'slug-baru-uji' }), 409); await err(PA(adm, '/berita/' + ids.dup, { slug: b1slug.replace('slug-baru', 'x') + '-' }), 400);
    ok(await P(adm, '/berita/' + b1 + '/status', { status: 'arsip' })); assert.strictEqual((await pub()).json.rows.length, 0); assert.strictEqual((await web('/berita/' + b1slug)).status, 404); assert.strictEqual((await web('/berita/slug-lama')).status, 404);
    ok(await P(adm, '/berita/' + b1 + '/status', { status: 'terbit' })); assert.strictEqual((await pub()).json.rows.length, 1);
  });
  await t('62i. Penjadwalan: terjadwal tidak tampil sebelum waktunya, tampil otomatis setelah tiba; terbit di masa depan menjadi terjadwal; waktu lampau ditolak', async () => {
    const tp = fut(2200), id = ok(await P(adm, '/berita', { judul: 'Berita Uji Terjadwal', isi_html: '<p>Isi terjadwal.</p>', status: 'terjadwal', terbit_pada: tp }), 201).id; ids.jad = id;
    assert.strictEqual((await get('SELECT status FROM cms_berita WHERE id=$1', [id])).status, 'terjadwal'); const lihat = async () => (await web('/api/sima/pub/berita?per=30')).json.rows.some(r => r.slug === 'berita-uji-terjadwal');
    assert.strictEqual(await lihat(), false); assert.strictEqual((await web('/berita/berita-uji-terjadwal')).status, 404); assert.strictEqual((await G(adm, '/dashboard')).json.berita.menunggu, 1);
    await sleep(2600); assert.strictEqual(await lihat(), true); assert.strictEqual((await web('/berita/berita-uji-terjadwal')).status, 200); assert.strictEqual((await G(adm, '/dashboard')).json.berita.menunggu, 0);
    const ef = ok(await G(adm, '/berita?status=terbit')).rows.find(r => r.id === id); assert.strictEqual(ef.status_efektif, 'terbit');
    const x = ok(await P(adm, '/berita', { judul: 'Berita Uji Dipaksa Terbit', isi_html: '<p>x</p>', status: 'terbit', terbit_pada: fut(86400e3) }), 201); assert.strictEqual((await get('SELECT status FROM cms_berita WHERE id=$1', [x.id])).status, 'terjadwal'); ids.paksa = x.id;
    await err(P(adm, '/berita', { judul: 'Jadwal Lampau Uji', isi_html: '<p>x</p>', status: 'terjadwal', terbit_pada: Date.now() - 5000 }), 400);
  });
  await t('62j. Berita unggulan & beranda: tidak otomatis unggulan; urutan; jumlah sesuai pengaturan; satu sumber data dengan /berita', async () => {
    const mk = async (j) => { const r = ok(await P(adm, '/berita', { judul: j, isi_html: '<p>Isi ' + j + '</p>', status: 'terbit', kategori_id: kB2 }), 201); await sleep(15); return r.id; };
    const n = []; for (let i = 1; i <= 4; i++) n.push(await mk('Berita Uji Beranda ' + i));
    let h = (await web('/api/sima/pub/berita?beranda=1')).json; assert.strictEqual(h.rows.length, 3); assert.ok(h.rows.every(r => !r.unggulan), 'tidak ada unggulan otomatis'); assert.deepStrictEqual(h.rows.map(r => r.judul), ['Berita Uji Beranda 4', 'Berita Uji Beranda 3', 'Berita Uji Beranda 2']);
    ok(await P(adm, '/berita/' + n[0] + '/unggulan', { unggulan: true })); ok(await P(adm, '/berita/' + n[1] + '/unggulan', { unggulan: true })); ok(await P(adm, '/berita/' + b1 + '/unggulan', { unggulan: true }));
    h = (await web('/api/sima/pub/berita?beranda=1')).json; assert.deepStrictEqual(h.rows.slice(0, 2).map(r => r.judul), ['Berita Uji Beranda 1', 'Berita Uji Beranda 2'], 'maks. 2 unggulan, urut sesuai pengaturan'); assert.strictEqual(h.rows.length, 3); assert.ok(h.rows[2].judul === 'Berita Uji Beranda 4' && !h.rows[2].unggulan);
    ok(await P(adm, '/berita/unggulan/urutan', { ids: [n[1], n[0], b1] })); h = (await web('/api/sima/pub/berita?beranda=1')).json; assert.deepStrictEqual(h.rows.slice(0, 2).map(r => r.judul), ['Berita Uji Beranda 2', 'Berita Uji Beranda 1']);
    ok(await adm.req('PUT', A + K + '/pengaturan', { konfirmasi: true, beranda: { total: 4, unggulan_maks: 1 }, tampilan: { per_halaman: 5 } })); h = (await web('/api/sima/pub/berita?beranda=1')).json; assert.strictEqual(h.rows.length, 4); assert.ok(h.rows[0].unggulan && !h.rows[1].unggulan === false || h.rows[0].unggulan);
    await err(adm.req('PUT', A + K + '/pengaturan', { konfirmasi: true, beranda: { total: 2, unggulan_maks: 5 }, tampilan: { per_halaman: 5 } }), 400); await err(adm.req('PUT', A + K + '/pengaturan', { konfirmasi: true, beranda: { total: 3, unggulan_maks: 1 }, tampilan: { per_halaman: 1 } }), 400);
    ok(await P(adm, '/berita/' + n[0] + '/status', { status: 'draft' })); h = (await web('/api/sima/pub/berita?beranda=1')).json; assert.ok(!h.rows.some(r => r.judul === 'Berita Uji Beranda 1'), 'unggulan draft tidak tampil');
    const hal = (await web('/berita')).text; assert.ok(hal.includes('Berita Unggulan') && hal.includes('Berita Uji Beranda 2')); ids.beranda = n;
    ok(await P(adm, '/berita/' + n[0] + '/status', { status: 'terbit' })); ok(await adm.req('PUT', A + K + '/pengaturan', { konfirmasi: true, beranda: { total: 3, unggulan_maks: 2 }, tampilan: { per_halaman: 5 } }));
  });
  await t('62k. Pencarian, filter kategori, pagination (API & halaman /berita)', async () => {
    const all = (await web('/api/sima/pub/berita?per=30')).json; assert.ok(all.total >= 6, 'total ' + all.total);
    const s = (await web('/api/sima/pub/berita?q=Beranda+3')).json; assert.strictEqual(s.rows.length, 1); assert.strictEqual(s.rows[0].judul, 'Berita Uji Beranda 3');
    assert.strictEqual((await web('/api/sima/pub/berita?q=%25')).json.rows.length, 0, 'wildcard LIKE dinetralkan');
    const kb = (await web('/api/sima/pub/berita?kategori=kategori-uji-b&per=30')).json; assert.ok(kb.rows.length >= 4 && kb.rows.every(r => r.kategori_slug === 'kategori-uji-b'));
    const p1 = (await web('/api/sima/pub/berita?per=3&page=1')).json, p2 = (await web('/api/sima/pub/berita?per=3&page=2')).json; assert.strictEqual(p1.rows.length, 3); assert.ok(!p1.rows.some(a => p2.rows.some(b => a.id === b.id)));
    const h1 = (await web('/berita')).text, h2 = (await web('/berita?page=2')).text; assert.ok(/Halaman 1 dari/.test(h1) && /Halaman 2 dari/.test(h2)); assert.ok(/rel="next"/.test(h1));
    assert.ok((await web('/berita?q=Beranda+3')).text.includes('Berita Uji Beranda 3')); assert.ok(/Tidak ada berita yang cocok/.test((await web('/berita?q=tidakadayangcocok')).text));
    assert.ok((await web('/berita?kategori=kategori-uji-b')).text.includes('Kategori Uji B (ubah)')); assert.ok(!(await web('/berita?kategori=kategori-uji-b')).text.includes('Berita Uji Pertama'));
    assert.strictEqual((await web('/berita?page=99999')).status, 200);
  });
  await t('62l. Halaman detail /berita/slug: slug benar, SEO, Open Graph, structured data, tanggal, penulis, share, kembali, berita terkait, XSS pada judul di-escape', async () => {
    ok(await PA(adm, '/berita/' + b1, { judul: 'Judul <script>alert(1)</script> & "Uji"', isi_html: '<h2>Subjudul</h2><p>Isi pertama.</p><div class="embed" data-video="youtube:dQw4w9WgXcQ"></div>' }));
    const r = await web('/berita/' + b1slug); assert.strictEqual(r.status, 200); const h = r.text;
    assert.ok(!/<script>alert/.test(h) && h.includes('&lt;script&gt;')); assert.ok(/<title>Judul .*Uji.* — Pondok Pesantren/.test(h)); assert.ok(h.includes('property="og:image"') && h.includes('property="og:title"') && h.includes('rel="canonical"'));
    assert.ok(h.includes('application/ld+json') && h.includes('"@type":"NewsArticle"')); const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(h)[1]); assert.strictEqual(ld.author.name, 'Penulis Uji'); assert.ok(ld.datePublished);
    assert.ok(h.includes('Kategori Uji A') && h.includes('Penulis Uji') && h.includes('Subjudul') && h.includes('wa.me') && h.includes('href="/berita"') && h.includes('Berita Terkait'));
    assert.ok(h.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'video di dalam isi dirender sebagai embed'); assert.ok(/srcset=/.test(h) && /width="1600"/.test(h) && /loading="lazy"/.test(h) || /fetchpriority/.test(h));
    assert.ok(h.includes('Oleh Penulis Uji') && /Kegiatan: 1 Oktober 2026/.test(h)); assert.ok(/<meta name="description" content="Deskripsi SEO uji">/.test(h));
    assert.ok(/Cache-Control/i.test('Cache-Control') && /s-maxage=30/.test(r.headers.get('cache-control')));
    const nf = await web('/berita/tidak-ada-slug-ini'); assert.strictEqual(nf.status, 404); assert.ok(/Berita tidak ditemukan/.test(nf.text) && !/s-maxage/.test(nf.headers.get('cache-control')));
    const pv = await adm.req('GET', A + K + '/berita/' + ids.dup + '/pratinjau'); assert.strictEqual(pv.status, 200); assert.ok(/PRATINJAU/.test(pv.text) && /noindex/.test(pv.text)); await err(ben.req('GET', A + K + '/berita/' + ids.dup + '/pratinjau'), 403);
  });
  await t('62m. Galeri: foto & video (YouTube/Vimeo), draft tidak tampil, terbit tampil, filter kategori/tahun/jenis, pagination, foto belum terbit tidak dapat diakses publik', async () => {
    g1 = ok(await P(adm, '/galeri', { jenis: 'foto', judul: 'Foto Uji Satu', media_id: m3, kategori_id: kG1, tanggal_kegiatan: '2025-03-10', caption: 'Caption uji satu', deskripsi: 'Deskripsi uji', status: 'draft' }), 201).id;
    const tok3 = (await get('SELECT token t FROM cms_media WHERE id=$1', [m3])).t, urlM3 = `/media/${m3}-${tok3}.webp`;
    assert.strictEqual((await web(urlM3)).status, 404, 'foto draft tidak dapat dibuka publik'); assert.strictEqual((await web('/api/sima/pub/galeri')).json.rows.length, 0);
    ok(await PA(adm, '/galeri/' + g1, { status: 'terbit' })); let gl = (await web('/api/sima/pub/galeri')).json; assert.strictEqual(gl.rows.length, 1); assert.strictEqual(gl.rows[0].caption, 'Caption uji satu'); const im = await web(urlM3); assert.strictEqual(im.status, 200); assert.strictEqual(im.headers.get('content-type'), 'image/webp'); assert.ok(/immutable/.test(im.headers.get('cache-control')));
    assert.strictEqual((await web(`/media/${m3}-00000000.webp`)).status, 404, 'token salah'); assert.strictEqual((await web(`/media/${m3}-${tok3}-t.webp`)).status, 200);
    gv = ok(await P(adm, '/galeri', { jenis: 'video', judul: 'Video Uji', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kategori_id: kG1, tanggal_kegiatan: '2026-02-01', status: 'terbit' }), 201).id;
    await err(P(adm, '/galeri', { jenis: 'video', judul: 'Video Palsu', video_url: 'https://evil.example/v.mp4' }), 400); await err(P(adm, '/galeri', { jenis: 'foto', judul: 'Tanpa Foto' }), 400); await err(P(adm, '/galeri', { jenis: 'video', judul: 'Vimeo Uji', video_url: 'https://vimeo.com/123456789', status: 'terbit', kategori_id: kG1 }), 201);
    gl = (await web('/api/sima/pub/galeri?per=60')).json; assert.strictEqual(gl.total, 3); const v = gl.rows.find(r => r.jenis === 'video' && r.judul === 'Video Uji'); assert.strictEqual(v.video.penyedia, 'youtube'); assert.ok(/youtube-nocookie\.com\/embed\//.test(v.video.embed)); assert.ok(v.video.poster);
    assert.deepStrictEqual(gl.tahun, [2026, 2025]); assert.strictEqual((await web('/api/sima/pub/galeri?tahun=2025')).json.rows.length, 1); assert.strictEqual((await web('/api/sima/pub/galeri?jenis=video')).json.rows.length, 2); assert.strictEqual((await web('/api/sima/pub/galeri?kategori=galeri-uji-a')).json.rows.length, 3);
    assert.strictEqual((await web('/api/sima/pub/galeri?per=1&page=2')).json.rows.length, 1); assert.ok(gl.kategori.some(k => k.slug === 'galeri-uji-a' && k.n === 3));
    g2 = ok(await P(adm, '/galeri', { jenis: 'foto', judul: 'Foto Uji Dua', media_id: m2, kategori_id: kG1, status: 'draft' }), 201).id;
  });
  await t('62n. Unggah massal, ganti foto, urutan tampilan, status arsip', async () => {
    const f1 = ok(await up(await img(500, 400, '#cc3333'), 'm1.jpg'), 201).id, f2 = ok(await up(await img(500, 400, '#33cc33'), 'm2.jpg'), 201).id, f3 = ok(await up(await img(500, 400, '#3333cc'), 'm3.jpg'), 201).id;
    const r = ok(await P(adm, '/galeri/massal', { items: [{ media_id: f1, judul: 'Massal Satu' }, { media_id: f2, judul: 'Massal Dua' }, { media_id: f3, judul: 'Massal Tiga' }], kategori_id: kG1, status: 'terbit', tanggal_kegiatan: '2026-05-05' }), 201); assert.strictEqual(r.ids.length, 3);
    await err(P(adm, '/galeri/massal', { items: [{ media_id: f1, judul: 'Ok Satu' }, { media_id: 99999, judul: 'Rusak' }] }), 400); assert.strictEqual((await get("SELECT COUNT(*)::int n FROM cms_galeri WHERE judul IN ('Ok Satu','Rusak')")).n, 0, 'massal atomik');
    ok(await P(adm, '/galeri/urutan', { ids: [r.ids[2], r.ids[1], r.ids[0]] })); const gl = (await web('/api/sima/pub/galeri?kategori=galeri-uji-a&per=60')).json.rows; const pos = id => gl.findIndex(x => x.id === id); assert.ok(pos(r.ids[2]) < pos(r.ids[1]) && pos(r.ids[1]) < pos(r.ids[0]));
    const f4 = ok(await up(await img(500, 400, '#999999'), 'm4.jpg'), 201).id; ok(await P(adm, '/galeri/' + r.ids[0] + '/ganti-foto', { media_id: f4 })); assert.strictEqual((await get('SELECT media_id FROM cms_galeri WHERE id=$1', [r.ids[0]])).media_id, f4); await err(P(adm, '/galeri/' + r.ids[0] + '/ganti-foto', { media_id: f4 }), 400);
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM cms_media WHERE id=$1', [f1])).n, 1, 'foto lama tetap di Media Library'); await err(P(adm, '/galeri/' + gv + '/ganti-foto', { media_id: f4 }), 400);
    ok(await PA(adm, '/galeri/' + r.ids[1], { status: 'arsip' })); assert.ok(!(await web('/api/sima/pub/galeri?per=60')).json.rows.some(x => x.id === r.ids[1])); ids.massal = r.ids; ids.f = [f1, f2, f3, f4];
  });
  await t('62o. Halaman Ekstrakurikuler: dokumentasi dengan kategori berkunci (silat dst.) tampil dari data SIMA; kategori tanpa kunci tidak', async () => {
    const fx = ok(await up(await img(600, 400, '#118855'), 'silat.jpg'), 201).id; const gs = ok(await P(adm, '/galeri', { jenis: 'foto', judul: 'Silat Dokumentasi Uji', media_id: fx, kategori_id: kGsilat, status: 'terbit', caption: 'Latihan uji' }), 201).id;
    const draftSilat = ok(await P(adm, '/galeri', { jenis: 'foto', judul: 'Silat Draft Uji', media_id: ids.f[3], kategori_id: kGsilat, status: 'draft' }), 201).id;
    const e = (await web('/api/sima/pub/ekstra')).json.kegiatan; assert.ok(e.silat && e.silat.items.length === 1, JSON.stringify(Object.keys(e))); assert.strictEqual(e.silat.items[0].judul, 'Silat Dokumentasi Uji'); assert.ok(!e.silat.items.some(i => i.judul === 'Silat Draft Uji')); assert.ok(!JSON.stringify(e).includes('Foto Uji Satu'));
    assert.strictEqual((await web('/api/sima/pub/galeri?halaman=silat')).json.rows.length, 1); ids.gs = [gs, draftSilat];
    const idx = await web('/'); assert.strictEqual(idx.status, 200); assert.ok(idx.text.includes('/api/sima/pub/ekstra') || idx.text.includes('pub/ekstra'), 'index.html memanggil API ekstrakurikuler'); assert.ok(idx.text.includes('data-route="#/galeri/ekstrakurikuler"'), 'halaman ekstrakurikuler lama tetap ada');
  });
  await t('62p. Berita ↔ galeri: relasi database (tanpa duplikasi file), foto pendukung tampil di detail, perubahan metadata tidak merusak, arsip/hapus foto terpakai diperingatkan & dicek relasinya', async () => {
    const mediaSebelum = (await get('SELECT COUNT(*)::int n FROM cms_media')).n;
    const id = ok(await P(adm, '/berita', { judul: 'Berita Uji Dengan Galeri', isi_html: '<p>Isi berita dokumentasi.</p>', status: 'terbit', galeri_ids: [g1, ids.massal[0], gv, g2], media_utama_id: ids.f[1] }), 201).id; ids.bg = id;
    assert.strictEqual((await get('SELECT COUNT(*)::int n FROM cms_berita_galeri WHERE berita_id=$1', [id])).n, 4); assert.strictEqual((await get('SELECT COUNT(*)::int n FROM cms_media')).n, mediaSebelum, 'tidak ada file yang digandakan');
    let h = (await web('/berita/berita-uji-dengan-galeri')).text; assert.ok(/Dokumentasi Foto/.test(h)); assert.ok(h.includes('Caption uji satu')); assert.ok(h.includes('data-lb') && h.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'));
    const tokM2 = (await get('SELECT token t FROM cms_media WHERE id=$1', [m2])).t; assert.strictEqual((await web(`/media/${m2}-${tokM2}.webp`)).status, 200, 'foto draft yang dipasang pada berita terbit tampil di berita');
    assert.ok(!(await web('/api/sima/pub/galeri?per=60')).json.rows.some(r => r.id === g2), 'tetapi dokumentasi draft tidak tampil di halaman Galeri');
    ok(await PA(adm, '/galeri/' + g1, { judul: 'Foto Uji Satu (judul diubah)', caption: 'Caption diubah' })); h = (await web('/berita/berita-uji-dengan-galeri')).text; assert.ok(h.includes('Caption diubah'), 'metadata terbaru tampil, berita tetap utuh');
    const w = await adm.req('PATCH', A + K + '/galeri/' + g1, { konfirmasi: true, status: 'arsip' }); assert.strictEqual(w.status, 409); assert.strictEqual(w.json.perlu_konfirmasi, true); assert.strictEqual(w.json.dipakai[0].id, id); assert.strictEqual((await get('SELECT status FROM cms_galeri WHERE id=$1', [g1])).status, 'terbit');
    const w2 = await adm.req('POST', A + K + '/galeri/' + g1 + '/hapus', { konfirmasi: true }); assert.strictEqual(w2.status, 409);
    ok(await PA(adm, '/galeri/' + g1, { status: 'arsip', konfirmasi_dipakai: true })); h = (await web('/berita/berita-uji-dengan-galeri')).text; assert.ok(!h.includes('Caption diubah'), 'foto yang diarsipkan hilang dari berita');
    ok(await PA(adm, '/galeri/' + g1, { status: 'terbit' })); assert.strictEqual((await web('/berita/berita-uji-dengan-galeri')).text.includes('Caption diubah'), true);
    ok(await PA(adm, '/berita/' + id, { galeri_ids: [ids.massal[0]] })); assert.strictEqual((await get('SELECT COUNT(*)::int n FROM cms_berita_galeri WHERE berita_id=$1', [id])).n, 1); await err(PA(adm, '/berita/' + id, { galeri_ids: [987654] }), 400);
  });
  await t('62q. File yang masih dipakai tidak dapat terhapus (API, FK, daftar pemakaian); file yang tidak dipakai dapat dibersihkan', async () => {
    const tokM2 = (await get('SELECT token t FROM cms_media WHERE id=$1', [m2])).t; const pk = ok(await G(adm, '/media/' + m1 + '/pemakaian')).rows; assert.ok(pk.some(x => x.jenis === 'berita'));
    for (const id of [m1, m3, ids.f[3], m2]) { const r = await adm.req('POST', A + K + '/media/' + id + '/hapus', { konfirmasi: true }); assert.strictEqual(r.status, 409, 'media ' + id + ': ' + r.text); assert.ok(r.json.dipakai.length >= 1); }
    await rejects(db.q('DELETE FROM cms_media WHERE id=$1', [m1]), /foreign key|violates/i, 'FK menahan hapus langsung');
    const bebas = ok(await up(await img(300, 300, '#ff00ff'), 'bebas.jpg'), 201).id; assert.strictEqual((await G(adm, '/media?pakai=tidak')).json.rows.some(r => r.id === bebas), true);
    await err(adm.req('POST', A + K + '/media/' + bebas + '/hapus', {}), 400); ok(await P(adm, '/media/' + bebas + '/hapus', {})); assert.strictEqual((await get('SELECT COUNT(*)::int n FROM cms_media WHERE id=$1', [bebas])).n, 0);
    ok(await adm.req('PATCH', A + K + '/media/' + m1, { alt: 'Teks alternatif uji' })); assert.ok((await web('/berita/' + b1slug)).text.includes('Teks alternatif uji'));
  });
  await t('62r. Hapus berita = hapus lunak (tidak tayang, dapat dipulihkan sebagai draft); DELETE langsung & ubah riwayat ditolak trigger', async () => {
    const id = ids.dup; ok(await P(adm, '/berita/' + id + '/hapus', {})); assert.ok(ok(await G(adm, '/berita?status=dihapus')).rows.some(r => r.id === id)); assert.ok(!ok(await G(adm, '/berita')).rows.some(r => r.id === id));
    await err(PA(adm, '/berita/' + id, { penulis: 'x' }), 409); ok(await P(adm, '/berita/' + id + '/pulihkan', {})); assert.strictEqual((await get('SELECT status, dihapus FROM cms_berita WHERE id=$1', [id])).status, 'draft');
    ok(await P(adm, '/berita/' + b1 + '/hapus', {})); assert.strictEqual((await web('/berita/' + b1slug)).status, 404); assert.strictEqual((await web('/berita/slug-lama-tak-ada')).status, 404); ok(await P(adm, '/berita/' + b1 + '/pulihkan', {})); ok(await P(adm, '/berita/' + b1 + '/status', { status: 'terbit' }));
    for (const tb of ['cms_berita', 'cms_galeri', 'cms_kategori', 'cms_berita_slug']) await rejects(db.q(`DELETE FROM ${tb}`), /tidak boleh dihapus permanen/i, tb);
    await rejects(db.q("UPDATE cms_riwayat SET ket='x'"), /tidak dapat diubah/i); await rejects(db.q('DELETE FROM cms_riwayat'), /tidak dapat diubah/i);
    ok(await P(adm, '/galeri/' + ids.gs[1] + '/hapus', {})); assert.ok(!ok(await G(adm, '/galeri')).rows.some(r => r.id === ids.gs[1])); assert.strictEqual((await get('SELECT COUNT(*)::int n FROM cms_media WHERE id=$1', [ids.f[3]])).n, 1, 'file tidak ikut terhapus');
  });
  await t('62s. Activity log: setiap tindakan konten tercatat (pengguna, waktu, aksi) dan riwayat menyimpan data sebelum/sesudah', async () => {
    for (const a of ['berita_dibuat', 'berita_diubah', 'berita_diterbitkan', 'berita_dijadwalkan', 'berita_arsip'.replace('arsip', 'diarsipkan'), 'berita_dihapus', 'berita_dipulihkan', 'berita_slug_diubah', 'berita_unggulan', 'galeri_ditambahkan', 'galeri_foto_diganti', 'galeri_status_diubah', 'galeri_dihapus', 'kategori_dibuat', 'kategori_diubah', 'media_diunggah', 'media_dihapus', 'pengaturan_konten']) assert.ok(await logs(a) >= 1, 'activity_log tanpa ' + a);
    const l = await get("SELECT username, waktu, modul FROM activity_log WHERE aksi='berita_diterbitkan' ORDER BY id DESC LIMIT 1"); assert.strictEqual(l.username, 'admin'); assert.strictEqual(l.modul, 'konten'); assert.ok(Date.now() - +l.waktu < 120000);
    const rw = ok(await G(adm, '/berita/' + b1 + '/riwayat')).rows; assert.ok(rw.some(r => r.aksi === 'dibuat') && rw.some(r => r.aksi === 'diterbitkan') && rw.some(r => r.aksi === 'diarsipkan') && rw.some(r => r.aksi === 'dihapus'));
    const ch = rw.find(r => r.aksi === 'diubah' && r.sebelum && r.sebelum.judul); assert.ok(ch && ch.sebelum.judul !== ch.sesudah.judul, 'ada nilai sebelum & sesudah'); assert.ok(ok(await G(adm, '/riwayat')).total >= 30);
    await err(G(ben, '/riwayat'), 403);
  });
  await t('62t. Dashboard & statistik: semua angka dari database; grafik bulanan 12 bulan; kategori', async () => {
    const d = ok(await G(adm, '/dashboard')); const n = await get("SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='draft')::int draft, COUNT(*) FILTER (WHERE status='arsip')::int arsip FROM cms_berita WHERE dihapus IS NULL");
    assert.strictEqual(d.berita.total, n.total); assert.strictEqual(d.berita.draft, n.draft); assert.strictEqual(d.berita.arsip, n.arsip); assert.ok(d.berita.terbit >= 5);
    const g = await get("SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE jenis='foto')::int foto, COUNT(*) FILTER (WHERE jenis='video')::int video FROM cms_galeri WHERE dihapus IS NULL"); assert.deepStrictEqual([d.galeri.total, d.galeri.foto, d.galeri.video], [g.total, g.foto, g.video]);
    assert.strictEqual(d.per_bulan.length, 12); assert.strictEqual(d.publikasi_per_bulan.reduce((a, x) => a + x.n, 0), d.berita.terbit); assert.ok(d.kategori_berita.length >= 2 && d.kategori_galeri.length >= 1); assert.ok(d.berita_terbaru.length && d.galeri_terbaru.length && d.aktivitas.length);
    assert.strictEqual(d.media.total, (await get('SELECT COUNT(*)::int n FROM cms_media')).n); assert.strictEqual(ok(await G(adm, '/statistik')).galeri.total, g.total);
  });
  await t('62u. Daftar admin: filter status/kategori/pencarian/halaman; tidak ada berita lain yang bocor ke role lain; cache publik pendek, admin no-store', async () => {
    assert.ok(ok(await G(adm, '/berita?status=draft')).rows.every(r => r.status === 'draft')); assert.ok(ok(await G(adm, '/berita?status=terjadwal')).rows.every(r => r.status_efektif === 'terjadwal'));
    assert.strictEqual(ok(await G(adm, '/berita?q=Uji+Terjadwal')).rows.length, 1); assert.ok(ok(await G(adm, '/berita?kategori_id=' + kB2)).rows.length >= 4); assert.strictEqual(ok(await G(adm, '/berita?page=1')).size, 15);
    assert.ok(ok(await G(adm, '/galeri?jenis=video')).rows.every(r => r.jenis === 'video')); assert.ok(ok(await G(adm, '/galeri?status=draft')).rows.every(r => r.status === 'draft')); assert.ok(ok(await G(adm, '/galeri?tahun=2025')).rows.length >= 1);
    assert.ok(/no-store/.test((await G(adm, '/berita')).headers.get('cache-control'))); const pj = await web('/api/sima/pub/berita'); assert.ok(/s-maxage=30/.test(pj.headers.get('cache-control')) && !/no-store/.test(pj.headers.get('cache-control')));
    for (const u of ['/pub/berita', '/pub/galeri', '/pub/ekstra']) assert.ok(!/set-cookie/i.test(JSON.stringify([...(await web('/api' + '/sima' + u)).headers.keys()])), 'API publik tidak memasang cookie');
  });
  await t('62v. Halaman lama tidak rusak: beranda, SIMA, aset statis, dan API lama tetap berfungsi', async () => {
    const i = await web('/'); assert.strictEqual(i.status, 200); assert.ok(i.text.includes('id="berita"') && i.text.includes('newsGrid')); assert.strictEqual((await web('/sima/')).status, 200); assert.strictEqual((await web('/konten.css')).status, 200); assert.strictEqual((await web('/konten.js')).status, 200);
    assert.strictEqual((await web('/robots.txt')).status, 200); assert.strictEqual((await adm.req('GET', A + '/dashboard')).status, 200); assert.ok((await web('/sitemap.xml')).text.startsWith('<?xml'));
    assert.ok((await web('/api/sima/menu-tidak-ada')).status === 404);
    const m = ok(await adm.req('GET', A + '/me')).menu.find(x => x.id === 'berita'); assert.ok(m.tersedia && m.children.length === 11); for (const c of [ben, kea]) assert.ok(!ok(await c.req('GET', A + '/me')).menu.some(x => x.id === 'berita'));
  });
};
