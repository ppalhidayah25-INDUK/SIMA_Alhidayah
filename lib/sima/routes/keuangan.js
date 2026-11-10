'use strict';
// Modul Bendahara & Manajemen Keuangan. Tiga buku TERPISAH: tagihan/pembayaran santri, tabungan santri, kas operasional.
// Semua operasi uang berjalan dalam satu transaksi database; Bendahara dijalankan sebagai role DB `sima_keuangan` (tanpa DELETE,
// tanpa akses ke tabel lain). Keamanan tidak punya hak apa pun pada tabel keuangan.
const U = require('../util');
const jkt = () => new Date(Date.now() + 7 * 3600e3);
const iso = d => d.toISOString().slice(0, 10);
const msFrom = d => Date.parse(d + 'T00:00:00+07:00');
const bad = (message, fields, http = 400) => Object.assign(new Error(message), { http, fields });
const RP_MAX = 1e12;
function rp(v, label, e, key = 'nominal') {
  const n = typeof v === 'number' ? v : /^\d{1,13}$/.test(String(v == null ? '' : v).trim()) ? Number(v) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) { e[key] = label + ' harus berupa angka bulat lebih dari 0.'; return null; }
  if (n > RP_MAX) { e[key] = label + ' terlalu besar.'; return null; }
  return n;
}
function rentang(qs) {
  const t = jkt(), today = iso(t), y = t.getUTCFullYear(), m = t.getUTCMonth();
  let p = ['hari', 'minggu', 'bulan', 'tahun', 'rentang', 'semua'].includes(qs.periode) ? qs.periode : (qs.dari || qs.sampai ? 'rentang' : 'bulan'), dari, sampai;
  if (p === 'hari') dari = sampai = today;
  else if (p === 'minggu') { const s = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 864e5); dari = iso(s); sampai = iso(new Date(s.getTime() + 6 * 864e5)); }
  else if (p === 'bulan') { dari = iso(new Date(Date.UTC(y, m, 1))); sampai = iso(new Date(Date.UTC(y, m + 1, 0))); }
  else if (p === 'tahun') { dari = y + '-01-01'; sampai = y + '-12-31'; }
  else if (p === 'semua') { dari = '2000-01-01'; sampai = '2999-12-31'; }
  else {
    dari = qs.dari; sampai = qs.sampai;
    if (!U.isDate(dari) || !U.isDate(sampai)) throw bad('Rentang tanggal tidak valid.', { dari: 'Tanggal wajib valid.' });
    if (dari > sampai) throw bad('Tanggal awal tidak boleh setelah tanggal akhir.');
  }
  return { periode: p, dari, sampai, msDari: msFrom(dari), msSampai: msFrom(sampai) + 864e5, today };
}
const nomor = (pre, n) => `${pre}-${jkt().getUTCFullYear()}-${String(n).padStart(6, '0')}`;
const AKTIF_S = "s.status='aktif' AND NOT s.diarsipkan";
// efek jenis kas terhadap saldo
const KAS_EFEK = "CASE WHEN jenis IN ('saldo_awal','masuk','pembalikan_keluar') THEN nominal ELSE -nominal END";
const TAB_EFEK = "CASE WHEN jenis IN ('setoran','pembalikan_penarikan') THEN nominal ELSE -nominal END";

function register(api, { db, auth, logBy, ah, one }) {
  const mod = auth.requireModule('bendahara');
  const needSA = (req, res, next) => req.user.role === 'super_admin' ? next() : res.status(403).json({ error: 'Hanya Super Admin yang dapat membuka bagian ini.' });
  // jalankan dalam transaksi; Bendahara => role database terbatas
  const fin = (req, fn) => db.tx(async q => { if (req.user.role === 'bendahara') await q('SET LOCAL ROLE sima_keuangan'); return fn(q); });
  const audit = (q, req, entitas, id, aksi, alasan, sebelum, sesudah) => q('INSERT INTO keu_audit (waktu,user_id,username,entitas,entitas_id,aksi,alasan,sebelum,sesudah) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [Date.now(), req.user.id, req.user.username, entitas, id, aksi, alasan || null, sebelum ? JSON.stringify(sebelum) : null, sesudah ? JSON.stringify(sesudah) : null]);
  const idOf = v => { const n = parseInt(v, 10); return Number.isSafeInteger(n) && n > 0 ? n : null; };
  const alasanOf = (b, e) => { const a = U.text(b.alasan, 500); if (a.length < 5) e.alasan = 'Alasan wajib diisi (minimal 5 karakter).'; return a; };
  const needKonfirmasi = b => { if (b.konfirmasi !== true) throw bad('Konfirmasi diperlukan untuk transaksi ini.'); };
  const idemOf = b => (typeof b.idem === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(b.idem)) ? b.idem : null;
  const chk = e => { if (Object.keys(e).length) throw bad('Data belum valid.', e); };
  const lg = (req, aksi, ket) => logBy(req, aksi, 'keuangan', ket);

  // ---------- Referensi ----------
  api.get('/keuangan/ref', mod, ah(async (req, res) => res.json(await fin(req, async q => ({
    kategori_tagihan: await q('SELECT id, nama, keterangan, aktif FROM keu_kategori_tagihan ORDER BY lower(nama)'),
    kategori_kas: await q('SELECT id, jenis, nama, aktif FROM keu_kategori_kas ORDER BY jenis, lower(nama)'),
    metode: await q('SELECT id, nama, aktif FROM keu_metode ORDER BY id'),
    tahun_masuk: (await q("SELECT DISTINCT tahun_masuk FROM v_santri_keu WHERE tahun_masuk IS NOT NULL ORDER BY 1 DESC")).map(r => r.tahun_masuk),
    asrama: await q('SELECT DISTINCT asrama_id AS id, asrama AS nama, kelompok FROM v_santri_keu WHERE asrama_id IS NOT NULL ORDER BY asrama'),
    kamar: await q('SELECT DISTINCT kamar_id AS id, kamar AS nama, asrama_id FROM v_santri_keu WHERE kamar_id IS NOT NULL ORDER BY kamar')
  })))));
  const KAT_AWAL = ['Syahriah', 'Uang pendidikan', 'Uang ujian', 'Uang kegiatan', 'Biaya administrasi', 'Tagihan lainnya'];
  api.post('/keuangan/kategori-tagihan/awal', mod, ah(async (req, res) => {
    needKonfirmasi(req.body || {});
    const n = await fin(req, async q => { let c = 0; for (const nm of KAT_AWAL) c += (await q('INSERT INTO keu_kategori_tagihan (nama,dibuat) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id', [nm, Date.now()])).length; return c; });
    await lg(req, 'tambah', `Memuat kategori tagihan awal (${n} baru)`); res.json({ ditambahkan: n });
  }));
  for (const [path, tbl] of [['kategori-tagihan', 'keu_kategori_tagihan'], ['kategori-kas', 'keu_kategori_kas'], ['metode', 'keu_metode']]) {
    const isKas = tbl === 'keu_kategori_kas', isTag = tbl === 'keu_kategori_tagihan';
    const read = b => { const e = {}, nama = U.str(b.nama, 80); if (nama.length < 2) e.nama = 'Nama wajib diisi (minimal 2 karakter).'; let jenis; if (isKas) { jenis = b.jenis; if (!['masuk', 'keluar'].includes(jenis)) e.jenis = 'Jenis harus pemasukan atau pengeluaran.'; } chk(e); return { nama, jenis, ket: isTag ? U.textOrNull(b.keterangan, 300) : null }; };
    api.post('/keuangan/' + path, mod, ah(async (req, res) => {
      const { nama, jenis, ket } = read(req.body || {});
      try {
        const r = await fin(req, q => isKas ? q('INSERT INTO keu_kategori_kas (jenis,nama,dibuat) VALUES ($1,$2,$3) RETURNING id', [jenis, nama, Date.now()])
          : isTag ? q('INSERT INTO keu_kategori_tagihan (nama,keterangan,dibuat) VALUES ($1,$2,$3) RETURNING id', [nama, ket, Date.now()]) : q('INSERT INTO keu_metode (nama) VALUES ($1) RETURNING id', [nama]));
        await lg(req, 'tambah', `Menambah ${path}: ${nama}`); res.status(201).json({ id: r[0].id });
      } catch (err) { if (U.isUnique(err)) throw bad('Nama tersebut sudah ada.', { nama: 'Nama sudah dipakai.' }, 409); throw err; }
    }));
    api.patch('/keuangan/' + path + '/:id', mod, ah(async (req, res) => {
      const id = idOf(req.params.id), b = req.body || {}; if (!id) throw bad('ID tidak valid.', null, 404);
      const sets = [], p = [];
      if ('nama' in b) { const nm = U.str(b.nama, 80); if (nm.length < 2) throw bad('Nama wajib diisi.', { nama: 'Nama wajib diisi (minimal 2 karakter).' }); p.push(nm); sets.push('nama=$' + p.length); }
      if ('aktif' in b) { p.push(!!b.aktif); sets.push('aktif=$' + p.length); }
      if (isTag && 'keterangan' in b) { p.push(U.textOrNull(b.keterangan, 300)); sets.push('keterangan=$' + p.length); }
      if (!sets.length) throw bad('Tidak ada perubahan.'); p.push(id);
      try { const r = await fin(req, q => q(`UPDATE ${tbl} SET ${sets.join(',')} WHERE id=$${p.length} RETURNING id`, p)); if (!r.length) throw bad('Data tidak ditemukan.', null, 404); }
      catch (err) { if (U.isUnique(err)) throw bad('Nama tersebut sudah ada.', { nama: 'Nama sudah dipakai.' }, 409); throw err; }
      await lg(req, 'ubah', `Mengubah ${path} #${id}`); res.json({ ok: true });
    }));
  }

  // ---------- Pencarian santri (untuk pemilih) ----------
  api.get('/keuangan/santri', mod, ah(async (req, res) => {
    const s = U.str(req.query.q || '', 80);
    const sql = s ? `(s.nama ILIKE $1 OR s.nis ILIKE $1)` : 'TRUE';
    const aktif = req.query.aktif === '1' ? ` AND ${AKTIF_S}` : '';
    const rows = await fin(req, q => q(`SELECT s.id, s.nis, s.nama, s.kelompok, s.status, s.asrama, s.kamar FROM v_santri_keu s WHERE ${sql}${aktif} ORDER BY s.nama LIMIT 15`, s ? ['%' + U.likeEsc(s) + '%'] : []));
    res.json({ rows });
  }));
  
// ---------- Syahriah (pembayaran bulanan): tabel santri x 12 bulan ----------
  api.get('/keuangan/syahriah', mod, ah(async (req, res) => {
    const qs = req.query, now = jkt().getUTCFullYear();
    const tahun = /^\d{4}$/.test(String(qs.tahun || '')) && +qs.tahun >= 2000 && +qs.tahun <= 2100 ? +qs.tahun : now;
    const pg = { page: Math.max(1, parseInt(qs.page, 10) || 1), size: 25 }; pg.offset = (pg.page - 1) * pg.size;
    const out = await fin(req, async q => {
      let kid = idOf(qs.kategori_id);
      if (!kid) { const k = (await q("SELECT id FROM keu_kategori_tagihan WHERE lower(nama) LIKE 'syahriah%' AND aktif ORDER BY id LIMIT 1"))[0]; kid = k ? k.id : null; }
      if (!kid) return { kategori_id: null, tahun, total: 0, rows: [], ringkasan: null, page: 1, size: pg.size };
      const w = U.where(); w.add(AKTIF_S);
      const s = U.str(qs.q || '', 80);
      if (s) w.add('(s.nama ILIKE ? OR s.nis ILIKE ?)'.replace(/\?/g, () => w.push('%' + U.likeEsc(s) + '%')));
      if (['putra', 'putri'].includes(qs.kelompok)) w.add('s.kelompok = ?', qs.kelompok);
      if (idOf(qs.asrama_id)) w.add('s.asrama_id = ?', idOf(qs.asrama_id));
      if (idOf(qs.kamar_id)) w.add('s.kamar_id = ?', idOf(qs.kamar_id));
      const total = (await q(`SELECT COUNT(*)::int n FROM v_santri_keu s ${w.sql}`, w.params()))[0].n;
      const santri = await q(`SELECT s.id, s.nis, s.nama, s.kelompok, s.asrama, s.kamar FROM v_santri_keu s ${w.sql} ORDER BY s.nama, s.id LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params());
      const ids = santri.map(x => x.id), thn = String(tahun);
      const tg = ids.length ? await q(`SELECT id, santri_id, periode, nominal, dibayar, sisa, status_bayar FROM v_keu_tagihan WHERE kategori_id=$1 AND status_tagihan='aktif' AND periode ~ '^\\d{4}-\\d{2}$' AND substr(periode,1,4)=$2 AND santri_id = ANY($3)`, [kid, thn, ids]) : [];
      const by = new Map(); tg.forEach(t => { if (!by.has(t.santri_id)) by.set(t.santri_id, {}); by.get(t.santri_id)[+t.periode.slice(5)] = { id: t.id, nominal: Number(t.nominal), dibayar: Number(t.dibayar), sisa: Number(t.sisa), status: t.status_bayar }; });
      const rows = santri.map(x => Object.assign({}, x, { bulan: by.get(x.id) || {} }));
      const ringkasan = (await q(`SELECT COUNT(*)::int tagihan, COALESCE(SUM(v.nominal),0)::bigint nominal, COALESCE(SUM(v.dibayar),0)::bigint dibayar, COALESCE(SUM(v.sisa),0)::bigint sisa,
          COUNT(*) FILTER (WHERE v.status_bayar IN ('belum','sebagian'))::int belum_lunas
        FROM v_keu_tagihan v JOIN v_santri_keu s ON s.id = v.santri_id ${w.sql ? w.sql + ' AND' : 'WHERE'} v.kategori_id = ${w.push(kid)} AND v.status_tagihan='aktif' AND v.periode ~ '^\\d{4}-\\d{2}$' AND substr(v.periode,1,4) = ${w.push(thn)}`, w.params()))[0];
      return { kategori_id: kid, tahun, total, rows, ringkasan, page: pg.page, size: pg.size };
    });
    res.json(out);
  }));
  
  // ---------- Tagihan ----------
  function readTagihan(b) {
    const e = {}, o = {};
    o.kategori_id = idOf(b.kategori_id); if (!o.kategori_id) e.kategori_id = 'Kategori tagihan wajib dipilih.';
    o.nominal = rp(b.nominal, 'Nominal', e);
    const pt = b.periode_tipe === 'lain' ? 'lain' : 'bulan';
    if (pt === 'bulan') { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.periode || '')) e.periode = 'Pilih bulan periode pembayaran.'; o.periode = b.periode; }
    else { o.periode = U.str(b.periode, 60); if (o.periode.length < 2) e.periode = 'Periode wajib diisi (mis. Semester Ganjil 2026).'; }
    o.jatuh_tempo = null; if (b.jatuh_tempo) { if (!U.isDate(b.jatuh_tempo)) e.jatuh_tempo = 'Tanggal jatuh tempo tidak valid.'; else o.jatuh_tempo = b.jatuh_tempo; }
    o.nama = U.str(b.nama, 120); o.keterangan = U.textOrNull(b.keterangan, 500);
    chk(e); return o;
  }
  async function targetSantri(q, t) {
    t = t || {}; const w = U.where(); w.add(AKTIF_S);
    if (Array.isArray(t.ids)) {
      const ids = [...new Set(t.ids.map(idOf).filter(Boolean))]; if (!ids.length) throw bad('Pilih minimal satu santri.', { target: 'Pilih minimal satu santri.' }); if (ids.length > 2000) throw bad('Maksimal 2000 santri per proses.');
      w.add('s.id = ANY(?)', ids);
      const rows = await q(`SELECT s.id, s.nis, s.nama, s.kelompok, s.asrama, s.kamar FROM v_santri_keu s ${w.sql} ORDER BY s.nama`, w.params());
      if (rows.length !== ids.length) throw bad('Sebagian santri yang dipilih tidak ditemukan atau bukan santri aktif.', { target: 'Ada santri yang bukan santri aktif.' });
      return rows;
    }
    let any = false;
    if (['putra', 'putri'].includes(t.kelompok)) { w.add('s.kelompok = ?', t.kelompok); any = true; }
    if (idOf(t.tahun_masuk)) { w.add('s.tahun_masuk = ?', idOf(t.tahun_masuk)); any = true; }
    if (idOf(t.asrama_id)) { w.add('s.asrama_id = ?', idOf(t.asrama_id)); any = true; }
    if (idOf(t.kamar_id)) { w.add('s.kamar_id = ?', idOf(t.kamar_id)); any = true; }
    if (!any && t.semua !== true) throw bad('Tentukan sasaran: pilih santri, atau filter kelompok/angkatan/asrama/kamar, atau semua santri aktif.', { target: 'Sasaran belum ditentukan.' });
    return q(`SELECT s.id, s.nis, s.nama, s.kelompok, s.asrama, s.kamar FROM v_santri_keu s ${w.sql} ORDER BY s.nama`, w.params());
  }
  async function rencana(q, b) {
    const o = readTagihan(b);
    const kat = (await q('SELECT id, nama, aktif FROM keu_kategori_tagihan WHERE id=$1', [o.kategori_id]))[0];
    if (!kat || !kat.aktif) throw bad('Kategori tagihan tidak ditemukan atau nonaktif.', { kategori_id: 'Kategori tidak tersedia.' });
    const key = o.periode.toLowerCase(), santri = await targetSantri(q, b.target);
    const dup = new Set((await q("SELECT santri_id FROM keu_tagihan WHERE kategori_id=$1 AND periode_key=$2 AND status='aktif' AND santri_id = ANY($3)", [o.kategori_id, key, santri.map(s => s.id)])).map(r => r.santri_id));
    o.nama = o.nama || `${kat.nama} ${o.periode}`; o.kategori = kat.nama; o.key = key;
    return { o, baru: santri.filter(s => !dup.has(s.id)), dilewati: santri.filter(s => dup.has(s.id)) };
  }
  api.post('/keuangan/tagihan/pratinjau', mod, ah(async (req, res) => {
    const r = await fin(req, q => rencana(q, req.body || {}));
    res.json({ jumlah: r.baru.length, total: r.baru.length * r.o.nominal, nominal: r.o.nominal, nama: r.o.nama, periode: r.o.periode, kategori: r.o.kategori,
      dilewati: r.dilewati.length, dilewati_contoh: r.dilewati.slice(0, 20), santri: r.baru.slice(0, 200), santri_terpotong: r.baru.length > 200 });
  }));
  api.post('/keuangan/tagihan', mod, ah(async (req, res) => {
    const b = req.body || {}; needKonfirmasi(b);
    const out = await fin(req, async q => {
      const r = await rencana(q, b); const t = Date.now(); let n = 0;
      for (const s of r.baru) {
        const ins = await q('INSERT INTO keu_tagihan (santri_id,kategori_id,nama,periode,periode_key,nominal,jatuh_tempo,keterangan,dibuat,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id',
          [s.id, r.o.kategori_id, r.o.nama, r.o.periode, r.o.key, r.o.nominal, r.o.jatuh_tempo, r.o.keterangan, t, req.user.id]);
        if (ins.length) { n++; await audit(q, req, 'tagihan', ins[0].id, 'buat', null, null, { santri_id: s.id, nominal: r.o.nominal, periode: r.o.periode }); }
      }
      return { dibuat: n, dilewati: r.dilewati.length + (r.baru.length - n), total: n * r.o.nominal };
    });
    await lg(req, 'tambah', `Membuat ${out.dibuat} tagihan (dilewati ${out.dilewati}), total Rp${out.total}`);
    res.status(201).json(out);
  }));
  function tagihanWhere(qs) {
    const w = U.where(); const s = U.str(qs.q || '', 80);
    if (s) w.add('(v.santri ILIKE ? OR v.nis ILIKE ? OR v.nama ILIKE ?)'.replace(/\?/g, () => w.push('%' + U.likeEsc(s) + '%')));
    if (idOf(qs.santri_id)) w.add('v.santri_id = ?', idOf(qs.santri_id));
    if (idOf(qs.kategori_id)) w.add('v.kategori_id = ?', idOf(qs.kategori_id));
    if (qs.periode_tagihan) w.add('lower(v.periode) = ?', String(qs.periode_tagihan).toLowerCase());
    if (['putra', 'putri'].includes(qs.kelompok)) w.add('v.kelompok = ?', qs.kelompok);
    if (['belum', 'sebagian', 'lunas', 'dibatalkan'].includes(qs.status)) w.add('v.status_bayar = ?', qs.status);
    if (qs.status === 'belum_lunas') w.add("v.status_bayar IN ('belum','sebagian')");
    if (idOf(qs.asrama_id)) w.add('v.asrama_id = ?', idOf(qs.asrama_id));
    if (idOf(qs.kamar_id)) w.add('v.kamar_id = ?', idOf(qs.kamar_id));
    if (idOf(qs.tahun_masuk)) w.add('v.tahun_masuk = ?', idOf(qs.tahun_masuk));
    return w;
  }
  const TAG_ORD = { santri: 'v.santri', nis: 'v.nis', nominal: 'v.nominal', sisa: 'v.sisa', periode: 'v.periode', dibuat: 'v.id', status: 'v.status_bayar', kategori: 'v.kategori' };
  const tagihanList = (tunggakan) => ah(async (req, res) => {
    const w = tagihanWhere(req.query); if (tunggakan) { w.add("v.status_bayar IN ('belum','sebagian')"); }
    const pg = U.pageOf(req.query), ord = U.orderBy(req.query, TAG_ORD, 'dibuat') + ', v.id DESC';
    const out = await fin(req, async q => {
      const sum = (await q(`SELECT COUNT(*)::int n, COALESCE(SUM(v.nominal),0)::bigint nominal, COALESCE(SUM(v.dibayar),0)::bigint dibayar, COALESCE(SUM(v.sisa) FILTER (WHERE v.status_bayar <> 'dibatalkan'),0)::bigint sisa,
        COUNT(*) FILTER (WHERE v.status_bayar='belum')::int belum, COUNT(*) FILTER (WHERE v.status_bayar='sebagian')::int sebagian, COUNT(*) FILTER (WHERE v.status_bayar='lunas')::int lunas FROM v_keu_tagihan v ${w.sql}`, w.params()))[0];
      const rows = await q(`SELECT v.* FROM v_keu_tagihan v ${w.sql} ORDER BY ${ord} LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params());
      const pil = tunggakan ? null : { periode: (await q('SELECT DISTINCT periode FROM keu_tagihan ORDER BY 1 DESC LIMIT 60')).map(r => r.periode) };
      return { total: sum.n, ringkasan: sum, rows, page: pg.page, size: pg.size, pilihan: pil };
    });
    res.json(out);
  });
  api.get('/keuangan/tagihan', mod, tagihanList(false));
  api.get('/keuangan/tunggakan', mod, tagihanList(true));
  api.get('/keuangan/tagihan/:id(\\d+)', mod, ah(async (req, res) => {
    const id = idOf(req.params.id);
    const out = await fin(req, async q => {
      const t = (await q('SELECT * FROM v_keu_tagihan WHERE id=$1', [id]))[0]; if (!t) return null;
      return { tagihan: t, pembayaran: await q('SELECT p.id, p.no_kuitansi, p.tanggal::text AS tanggal, p.nominal, p.metode, p.keterangan, p.sisa_setelah, p.status, p.batal_alasan, p.dibuat, u.username AS oleh_username FROM keu_pembayaran p JOIN users u ON u.id=p.oleh WHERE p.tagihan_id=$1 ORDER BY p.id', [id]),
        audit: await q("SELECT id, waktu, username, aksi, alasan, sebelum, sesudah FROM keu_audit WHERE entitas='tagihan' AND entitas_id=$1 ORDER BY id DESC", [id]) };
    });
    if (!out) return res.status(404).json({ error: 'Tagihan tidak ditemukan.' }); res.json(out);
  }));
  api.post('/keuangan/tagihan/:id(\\d+)/koreksi', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}, e = {}; needKonfirmasi(b);
    const alasan = alasanOf(b, e); const nominal = 'nominal' in b ? rp(b.nominal, 'Nominal', e) : null;
    let jt; if ('jatuh_tempo' in b) { if (b.jatuh_tempo && !U.isDate(b.jatuh_tempo)) e.jatuh_tempo = 'Tanggal tidak valid.'; jt = b.jatuh_tempo || null; }
    chk(e);
    await fin(req, async q => {
      const t = (await q('SELECT * FROM keu_tagihan WHERE id=$1 FOR UPDATE', [id]))[0]; if (!t) throw bad('Tagihan tidak ditemukan.', null, 404);
      if (t.status !== 'aktif') throw bad('Tagihan yang dibatalkan tidak dapat dikoreksi.', null, 409);
      const sb = { nominal: t.nominal, jatuh_tempo: t.jatuh_tempo && String(t.jatuh_tempo).slice(0, 10), keterangan: t.keterangan };
      const sd = { nominal: nominal || t.nominal, jatuh_tempo: jt === undefined ? sb.jatuh_tempo : jt, keterangan: 'keterangan' in b ? U.textOrNull(b.keterangan, 500) : t.keterangan };
      await q('UPDATE keu_tagihan SET nominal=$1, jatuh_tempo=$2, keterangan=$3 WHERE id=$4', [sd.nominal, sd.jatuh_tempo, sd.keterangan, id]);
      await audit(q, req, 'tagihan', id, 'koreksi', alasan, sb, sd);
    });
    await lg(req, 'koreksi', `Koreksi tagihan #${id}: ${alasanOf(b, {})}`); res.json({ ok: true });
  }));
  api.post('/keuangan/tagihan/:id(\\d+)/batal', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}, e = {}; needKonfirmasi(b); const alasan = alasanOf(b, e); chk(e);
    await fin(req, async q => {
      const t = (await q('SELECT * FROM keu_tagihan WHERE id=$1 FOR UPDATE', [id]))[0]; if (!t) throw bad('Tagihan tidak ditemukan.', null, 404);
      if (t.status !== 'aktif') throw bad('Tagihan sudah dibatalkan.', null, 409);
      await q("UPDATE keu_tagihan SET status='dibatalkan', batal_alasan=$1, batal_oleh=$2, batal_waktu=$3 WHERE id=$4", [alasan, req.user.id, Date.now(), id]);
      await audit(q, req, 'tagihan', id, 'batal', alasan, { status: 'aktif', nominal: t.nominal }, { status: 'dibatalkan' });
    });
    await lg(req, 'batal', `Membatalkan tagihan #${id}: ${alasan}`); res.json({ ok: true });
  }));

  // ---------- Pembayaran ----------
  async function bayar(q, req, tagihanId, nominal, tgl, metode, ket, idem) {
    if (idem) { const ex = (await q('SELECT id, no_kuitansi, sisa_setelah FROM keu_pembayaran WHERE idem=$1', [idem]))[0]; if (ex) return Object.assign({ duplikat: true }, ex); }
    const t = (await q('SELECT id, santri_id, nominal, status FROM keu_tagihan WHERE id=$1 FOR UPDATE', [tagihanId]))[0];
    if (!t) throw bad('Tagihan tidak ditemukan.', { tagihan_id: 'Tagihan tidak ditemukan.' }, 404);
    if (t.status !== 'aktif') throw bad('Tagihan sudah dibatalkan.', null, 409);
    const dibayar = Number((await q("SELECT COALESCE(SUM(nominal),0) AS n FROM keu_pembayaran WHERE tagihan_id=$1 AND status='sah'", [tagihanId]))[0].n), sisa = Number(t.nominal) - dibayar;
    if (sisa <= 0) throw bad('Tagihan ini sudah lunas.', null, 409);
    if (nominal > sisa) throw bad(`Nominal melebihi sisa tagihan (sisa Rp${sisa.toLocaleString('id-ID')}). Kelebihan dana dapat dicatat sebagai setoran tabungan.`, { nominal: 'Melebihi sisa tagihan.' }, 409);
    const seq = (await q("SELECT nextval('keu_seq_kuitansi') AS n"))[0].n, no = nomor('KWT', seq);
    const r = await q('INSERT INTO keu_pembayaran (no_kuitansi,tagihan_id,santri_id,tanggal,nominal,metode_id,metode,keterangan,sisa_setelah,idem,dibuat,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
      [no, tagihanId, t.santri_id, tgl, nominal, metode.id, metode.nama, ket, sisa - nominal, idem, Date.now(), req.user.id]);
    await audit(q, req, 'pembayaran', r[0].id, 'catat', null, null, { no_kuitansi: no, tagihan_id: tagihanId, nominal, sisa_setelah: sisa - nominal });
    return { id: r[0].id, no_kuitansi: no, sisa_setelah: sisa - nominal };
  }
  async function readBayar(q, b, e) {
    const tgl = b.tanggal; if (!U.isDate(tgl) || tgl > U.todayStr()) e.tanggal = 'Tanggal pembayaran wajib valid dan tidak di masa depan.';
    const metode = idOf(b.metode_id) ? (await q('SELECT id, nama FROM keu_metode WHERE id=$1 AND aktif', [idOf(b.metode_id)]))[0] : null; if (!metode) e.metode_id = 'Metode pembayaran wajib dipilih.';
    return { tgl, metode, ket: U.textOrNull(b.keterangan, 500) };
  }
  const dupMsg = err => U.isUnique(err) && /idem/.test(String(err.message));
  api.post('/keuangan/pembayaran', mod, ah(async (req, res) => {
    const b = req.body || {}, e = {}; needKonfirmasi(b); const idem = idemOf(b);
    const tid = idOf(b.tagihan_id); if (!tid) e.tagihan_id = 'Tagihan wajib dipilih.'; const nominal = rp(b.nominal, 'Nominal pembayaran', e);
    let r;
    try {
      r = await fin(req, async q => { const x = await readBayar(q, b, e); chk(e); return bayar(q, req, tid, nominal, x.tgl, x.metode, x.ket, idem); });
    } catch (err) { if (dupMsg(err) && idem) r = Object.assign({ duplikat: true }, (await db.q('SELECT id, no_kuitansi, sisa_setelah FROM keu_pembayaran WHERE idem=$1', [idem]))[0]); else throw err; }
    if (!r.duplikat) await lg(req, 'bayar', `Pembayaran ${r.no_kuitansi} Rp${nominal} (tagihan #${tid})`);
    res.status(r.duplikat ? 200 : 201).json(r);
  }));
  api.post('/keuangan/pembayaran/batch', mod, ah(async (req, res) => {
    const b = req.body || {}, e = {}; needKonfirmasi(b); const idem = idemOf(b);
    const items = Array.isArray(b.items) ? b.items : []; if (!items.length || items.length > 50) e.items = 'Pilih 1–50 tagihan untuk dibayar.';
    const parsed = items.map((it, i) => { const ee = {}; const tid = idOf(it && it.tagihan_id), n = rp(it && it.nominal, 'Nominal', ee); if (!tid || !n) e['items.' + i] = ee.nominal || 'Data tidak valid.'; return { tid, n }; });
    if (new Set(parsed.map(x => x.tid)).size !== parsed.length) e.items = 'Tagihan ganda dalam satu proses.';
    const out = await fin(req, async q => {
      const x = await readBayar(q, b, e); chk(e); const hasil = [];
      for (let i = 0; i < parsed.length; i++) hasil.push(await bayar(q, req, parsed[i].tid, parsed[i].n, x.tgl, x.metode, x.ket, idem ? idem + '-' + i : null));
      return hasil;
    });
    await lg(req, 'bayar', `Pembayaran massal ${out.length} tagihan: ${out.map(x => x.no_kuitansi).join(', ')}`);
    res.status(201).json({ hasil: out });
  }));
  api.get('/keuangan/pembayaran', mod, ah(async (req, res) => {
    const qs = req.query, w = U.where(), s = U.str(qs.q || '', 80), r = rentang(Object.assign({}, qs, { periode: qs.periode || 'semua' }));
    w.add('p.tanggal BETWEEN ? AND ?'.replace('?', w.push(r.dari)).replace('?', w.push(r.sampai)));
    if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(v.santri ILIKE ${ph} OR v.nis ILIKE ${ph} OR p.no_kuitansi ILIKE ${ph})`); }
    if (idOf(qs.santri_id)) w.add('p.santri_id = ?', idOf(qs.santri_id)); if (idOf(qs.kategori_id)) w.add('v.kategori_id = ?', idOf(qs.kategori_id));
    if (idOf(qs.metode_id)) w.add('p.metode_id = ?', idOf(qs.metode_id)); if (['sah', 'dibatalkan'].includes(qs.status)) w.add('p.status = ?', qs.status);
    const pg = U.pageOf(qs);
    const out = await fin(req, async q => {
      const from = 'FROM keu_pembayaran p JOIN v_keu_tagihan v ON v.id=p.tagihan_id JOIN users u ON u.id=p.oleh';
      const sum = (await q(`SELECT COUNT(*)::int n, COALESCE(SUM(p.nominal) FILTER (WHERE p.status='sah'),0)::bigint total ${from} ${w.sql}`, w.params()))[0];
      const rows = await q(`SELECT p.id, p.no_kuitansi, p.tanggal::text AS tanggal, p.nominal, p.metode, p.keterangan, p.sisa_setelah, p.status, p.batal_alasan, p.tagihan_id, p.santri_id, v.nis, v.santri, v.kategori, v.nama AS tagihan, v.periode, u.username AS petugas, p.dibuat
        ${from} ${w.sql} ORDER BY p.id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params());
      return { total: sum.n, jumlah: sum.total, rows, page: pg.page, size: pg.size };
    });
    res.json(out);
  }));
  api.post('/keuangan/pembayaran/:id(\\d+)/batal', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}, e = {}; needKonfirmasi(b); const alasan = alasanOf(b, e); chk(e);
    await fin(req, async q => {
      const p = (await q('SELECT * FROM keu_pembayaran WHERE id=$1 FOR UPDATE', [id]))[0]; if (!p) throw bad('Pembayaran tidak ditemukan.', null, 404);
      if (p.status !== 'sah') throw bad('Pembayaran sudah dibatalkan.', null, 409);
      await q('SELECT 1 FROM keu_tagihan WHERE id=$1 FOR UPDATE', [p.tagihan_id]);
      await q("UPDATE keu_pembayaran SET status='dibatalkan', batal_alasan=$1, batal_oleh=$2, batal_waktu=$3 WHERE id=$4", [alasan, req.user.id, Date.now(), id]);
      await audit(q, req, 'pembayaran', id, 'batal', alasan, { status: 'sah', nominal: p.nominal }, { status: 'dibatalkan' });
    });
    await lg(req, 'batal', `Membatalkan pembayaran #${id}: ${alasan}`); res.json({ ok: true });
  }));
  // ringkasan satu santri: tagihan, riwayat bayar, tabungan
  api.get('/keuangan/santri/:id(\\d+)/ringkasan', mod, ah(async (req, res) => {
    const id = idOf(req.params.id);
    const out = await fin(req, async q => {
      const s = (await q('SELECT id, nis, nama, kelompok, status, asrama, kamar FROM v_santri_keu WHERE id=$1', [id]))[0]; if (!s) return null;
      const tg = await q('SELECT * FROM v_keu_tagihan WHERE santri_id=$1 ORDER BY id DESC', [id]);
      const rw = await q('SELECT p.id, p.no_kuitansi, p.tanggal::text AS tanggal, p.nominal, p.metode, p.status, v.kategori, v.periode, v.nama AS tagihan, u.username AS petugas FROM keu_pembayaran p JOIN v_keu_tagihan v ON v.id=p.tagihan_id JOIN users u ON u.id=p.oleh WHERE p.santri_id=$1 ORDER BY p.id DESC', [id]);
      const tab = (await q(`SELECT r.id, r.status, COALESCE((SELECT SUM(${TAB_EFEK}) FROM tabungan_transaksi WHERE rekening_id=r.id),0)::bigint AS saldo FROM tabungan_rekening r WHERE r.santri_id=$1`, [id]))[0] || null;
      return { santri: s, tagihan: tg, pembayaran: rw, tabungan: tab };
    });
    if (!out) return res.status(404).json({ error: 'Santri tidak ditemukan.' }); res.json(out);
  }));

  // ---------- Tabungan ----------
  const SALDO = `COALESCE((SELECT SUM(${TAB_EFEK}) FROM tabungan_transaksi t WHERE t.rekening_id=r.id),0)::bigint`;
  api.get('/keuangan/tabungan', mod, ah(async (req, res) => {
    const qs = req.query, w = U.where(), s = U.str(qs.q || '', 80), pg = U.pageOf(qs);
    if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(v.nama ILIKE ${ph} OR v.nis ILIKE ${ph})`); }
    if (['putra', 'putri'].includes(qs.kelompok)) w.add('v.kelompok = ?', qs.kelompok); if (['aktif', 'alumni'].includes(qs.status_santri)) w.add('v.status = ?', qs.status_santri);
    if (['aktif', 'ditutup'].includes(qs.status)) w.add('r.status = ?', qs.status);
    const out = await fin(req, async q => {
      const from = 'FROM tabungan_rekening r JOIN v_santri_keu v ON v.id=r.santri_id';
      const sum = (await q(`SELECT COUNT(*)::int n, COALESCE(SUM(${SALDO}),0)::bigint saldo ${from} ${w.sql}`, w.params()))[0];
      const rows = await q(`SELECT r.id, r.santri_id, v.nis, v.nama, v.kelompok, v.status AS status_santri, r.dibuka::text AS dibuka, r.status, ${SALDO} AS saldo,
        COALESCE((SELECT SUM(nominal) FROM tabungan_transaksi t WHERE t.rekening_id=r.id AND t.jenis='setoran'),0)::bigint AS setoran, COALESCE((SELECT SUM(nominal) FROM tabungan_transaksi t WHERE t.rekening_id=r.id AND t.jenis='penarikan'),0)::bigint AS penarikan
        ${from} ${w.sql} ORDER BY v.nama LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params());
      return { total: sum.n, saldo_total: sum.saldo, rows, page: pg.page, size: pg.size };
    });
    res.json(out);
  }));
  async function bukaRekening(q, req, santriId, tgl) {
    let r = (await q('SELECT id, status FROM tabungan_rekening WHERE santri_id=$1', [santriId]))[0];
    if (!r) {
      const s = (await q('SELECT status, diarsipkan FROM v_santri_keu WHERE id=$1', [santriId]))[0]; if (!s) throw bad('Santri tidak ditemukan.', null, 404);
      if (s.status !== 'aktif' || s.diarsipkan) throw bad('Rekening baru hanya dapat dibuka untuk santri aktif.', null, 409);
      r = (await q('INSERT INTO tabungan_rekening (santri_id,dibuka,dibuat,oleh) VALUES ($1,$2,$3,$4) RETURNING id, status', [santriId, tgl || U.todayStr(), Date.now(), req.user.id]))[0];
      await audit(q, req, 'rekening', r.id, 'buka', null, null, { santri_id: santriId });
    }
    return r;
  }
  api.post('/keuangan/tabungan/rekening', mod, ah(async (req, res) => {
    const sid = idOf((req.body || {}).santri_id); if (!sid) throw bad('Santri wajib dipilih.', { santri_id: 'Santri wajib dipilih.' });
    const r = await fin(req, async q => { const ex = (await q('SELECT id FROM tabungan_rekening WHERE santri_id=$1', [sid]))[0]; if (ex) throw bad('Santri ini sudah memiliki rekening tabungan.', null, 409); return bukaRekening(q, req, sid); });
    await lg(req, 'tambah', `Membuka rekening tabungan santri #${sid}`); res.status(201).json({ id: r.id });
  }));
  async function tabTransaksi(q, req, rek, jenis, nominal, tgl, metode, ket, idem, membalik, alasan) {
    if (idem) { const ex = (await q('SELECT id, no_transaksi, saldo_sesudah FROM tabungan_transaksi WHERE idem=$1', [idem]))[0]; if (ex) return Object.assign({ duplikat: true }, ex); }
    await q('SELECT 1 FROM tabungan_rekening WHERE id=$1 FOR UPDATE', [rek.id]);
    const sb = Number((await q(`SELECT COALESCE(SUM(${TAB_EFEK}),0) AS n FROM tabungan_transaksi WHERE rekening_id=$1`, [rek.id]))[0].n);
    const plus = jenis === 'setoran' || jenis === 'pembalikan_penarikan', sa = sb + (plus ? nominal : -nominal);
    if (sa < 0) throw bad(`Saldo tabungan tidak mencukupi (saldo Rp${sb.toLocaleString('id-ID')}).`, { nominal: 'Melebihi saldo tabungan.' }, 409);
    const no = nomor('TAB', (await q("SELECT nextval('keu_seq_tabungan') AS n"))[0].n);
    const r = await q('INSERT INTO tabungan_transaksi (no_transaksi,rekening_id,santri_id,tanggal,jenis,nominal,metode,keterangan,saldo_sebelum,saldo_sesudah,membalik_id,alasan,idem,dibuat,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id',
      [no, rek.id, rek.santri_id, tgl, jenis, nominal, metode, ket, sb, sa, membalik || null, alasan || null, idem, Date.now(), req.user.id]);
    await audit(q, req, 'tabungan', r[0].id, jenis, alasan, { saldo: sb }, { saldo: sa, nominal, no_transaksi: no });
    return { id: r[0].id, no_transaksi: no, saldo_sebelum: sb, saldo_sesudah: sa };
  }
  api.post('/keuangan/tabungan/:sid(\\d+)/transaksi', mod, ah(async (req, res) => {
    const sid = idOf(req.params.sid), b = req.body || {}, e = {}; needKonfirmasi(b); const idem = idemOf(b);
    if (!['setoran', 'penarikan'].includes(b.jenis)) e.jenis = 'Jenis transaksi harus setoran atau penarikan.';
    const nominal = rp(b.nominal, 'Nominal', e); if (!U.isDate(b.tanggal) || b.tanggal > U.todayStr()) e.tanggal = 'Tanggal wajib valid dan tidak di masa depan.';
    const ket = U.textOrNull(b.keterangan, 500); if (b.jenis === 'penarikan' && !ket) e.keterangan = 'Keterangan penarikan wajib diisi.';
    const metode = U.strOrNull(b.metode, 40); chk(e);
    let r;
    try {
      r = await fin(req, async q => {
        let rek = (await q('SELECT id, santri_id, status FROM tabungan_rekening WHERE santri_id=$1', [sid]))[0];
        if (!rek) { if (b.jenis === 'penarikan') throw bad('Santri ini belum memiliki rekening tabungan.', null, 409); rek = await bukaRekening(q, req, sid, b.tanggal); rek.santri_id = sid; }
        if (rek.status !== 'aktif') throw bad('Rekening tabungan sudah ditutup.', null, 409);
        if (b.jenis === 'setoran') { const s = (await q('SELECT status, diarsipkan FROM v_santri_keu WHERE id=$1', [sid]))[0]; if (!s || s.status !== 'aktif' || s.diarsipkan) throw bad('Setoran hanya dapat dicatat untuk santri aktif.', null, 409); }
        return tabTransaksi(q, req, rek, b.jenis, nominal, b.tanggal, metode, ket, idem);
      });
    } catch (err) { if (dupMsg(err) && idem) r = Object.assign({ duplikat: true }, (await db.q('SELECT id, no_transaksi, saldo_sesudah FROM tabungan_transaksi WHERE idem=$1', [idem]))[0]); else throw err; }
    if (!r.duplikat) await lg(req, b.jenis, `${b.jenis === 'setoran' ? 'Setoran' : 'Penarikan'} tabungan ${r.no_transaksi} Rp${nominal} (santri #${sid})`);
    res.status(r.duplikat ? 200 : 201).json(r);
  }));
  api.post('/keuangan/tabungan/transaksi/:id(\\d+)/balik', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}, e = {}; needKonfirmasi(b); const alasan = alasanOf(b, e); chk(e);
    const r = await fin(req, async q => {
      const o = (await q('SELECT * FROM tabungan_transaksi WHERE id=$1', [id]))[0]; if (!o) throw bad('Transaksi tidak ditemukan.', null, 404);
      if (o.jenis.startsWith('pembalikan')) throw bad('Pembalikan tidak dapat dibalik lagi.', null, 409);
      if ((await q('SELECT 1 FROM tabungan_transaksi WHERE membalik_id=$1', [id])).length) throw bad('Transaksi ini sudah dibalik.', null, 409);
      return tabTransaksi(q, req, { id: o.rekening_id, santri_id: o.santri_id }, 'pembalikan_' + o.jenis, Number(o.nominal), U.todayStr(), null, 'Pembalikan ' + o.no_transaksi, null, id, alasan);
    });
    await lg(req, 'balik', `Pembalikan transaksi tabungan #${id} → ${r.no_transaksi}: ${alasan}`); res.status(201).json(r);
  }));
  api.post('/keuangan/tabungan/:sid(\\d+)/status', mod, ah(async (req, res) => {
    const sid = idOf(req.params.sid), b = req.body || {}, e = {}; needKonfirmasi(b); const alasan = alasanOf(b, e); if (!['aktif', 'ditutup'].includes(b.status)) e.status = 'Status tidak valid.'; chk(e);
    await fin(req, async q => {
      const r = (await q(`SELECT r.id, r.status, ${SALDO} AS saldo FROM tabungan_rekening r WHERE r.santri_id=$1 FOR UPDATE`, [sid]))[0]; if (!r) throw bad('Rekening tidak ditemukan.', null, 404);
      if (b.status === 'ditutup' && Number(r.saldo) !== 0) throw bad('Rekening hanya dapat ditutup bila saldo Rp0.', null, 409);
      await q('UPDATE tabungan_rekening SET status=$1 WHERE id=$2', [b.status, r.id]); await audit(q, req, 'rekening', r.id, 'status', alasan, { status: r.status }, { status: b.status });
    });
    await lg(req, 'ubah', `Status rekening tabungan santri #${sid} → ${b.status}`); res.json({ ok: true });
  }));
  api.get('/keuangan/tabungan/:sid(\\d+)', mod, ah(async (req, res) => {
    const sid = idOf(req.params.sid), qs = req.query, pg = U.pageOf(qs);
    const out = await fin(req, async q => {
      const r = (await q(`SELECT r.id, r.santri_id, r.dibuka::text AS dibuka, r.status, ${SALDO} AS saldo, v.nis, v.nama, v.kelompok, v.status AS status_santri
        FROM tabungan_rekening r JOIN v_santri_keu v ON v.id=r.santri_id WHERE r.santri_id=$1`, [sid]))[0]; if (!r) return null;
      const w = U.where(); w.add('t.rekening_id = ?', r.id);
      if (U.isDate(qs.dari)) w.add('t.tanggal >= ?', qs.dari); if (U.isDate(qs.sampai)) w.add('t.tanggal <= ?', qs.sampai);
      if (['setoran', 'penarikan'].includes(qs.jenis)) w.add('t.jenis IN (?, ?)'.replace('?', w.push(qs.jenis)).replace('?', w.push('pembalikan_' + qs.jenis)));
      const tot = (await q(`SELECT COUNT(*)::int n, COALESCE(SUM(nominal) FILTER (WHERE jenis='setoran'),0)::bigint setoran, COALESCE(SUM(nominal) FILTER (WHERE jenis='penarikan'),0)::bigint penarikan,
        COALESCE(SUM(nominal) FILTER (WHERE jenis='pembalikan_setoran'),0)::bigint balik_setoran, COALESCE(SUM(nominal) FILTER (WHERE jenis='pembalikan_penarikan'),0)::bigint balik_penarikan FROM tabungan_transaksi t ${w.sql}`, w.params()))[0];
      const rows = await q(`SELECT t.id, t.no_transaksi, t.tanggal::text AS tanggal, t.jenis, t.nominal, t.metode, t.keterangan, t.saldo_sebelum, t.saldo_sesudah, t.membalik_id, t.alasan, t.dibuat, u.username AS petugas,
        EXISTS (SELECT 1 FROM tabungan_transaksi x WHERE x.membalik_id=t.id) AS dibalik FROM tabungan_transaksi t JOIN users u ON u.id=t.oleh ${w.sql} ORDER BY t.id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params());
      return { rekening: r, total: tot.n, ringkasan: tot, rows, page: pg.page, size: pg.size };
    });
    if (!out) return res.status(404).json({ error: 'Rekening tabungan tidak ditemukan.' }); res.json(out);
  }));

  // ---------- Kas pondok ----------
  async function kasInsert(q, req, o) {
    if (o.idem) { const ex = (await q('SELECT id, no_transaksi FROM kas_transaksi WHERE idem=$1', [o.idem]))[0]; if (ex) return Object.assign({ duplikat: true }, ex); }
    const no = nomor('KAS', (await q("SELECT nextval('keu_seq_kas') AS n"))[0].n);
    const r = await q('INSERT INTO kas_transaksi (no_transaksi,tanggal,jenis,kategori_id,kategori,pihak,nominal,keterangan,membalik_id,alasan,idem,dibuat,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id',
      [no, o.tanggal, o.jenis, o.kategori_id || null, o.kategori || null, o.pihak || null, o.nominal, o.keterangan || null, o.membalik_id || null, o.alasan || null, o.idem || null, Date.now(), req.user.id]);
    await audit(q, req, 'kas', r[0].id, o.jenis, o.alasan, null, { no_transaksi: no, nominal: o.nominal, kategori: o.kategori });
    return { id: r[0].id, no_transaksi: no };
  }
  api.post('/keuangan/kas', mod, ah(async (req, res) => {
    const b = req.body || {}, e = {}; needKonfirmasi(b); const idem = idemOf(b);
    if (!['masuk', 'keluar'].includes(b.jenis)) e.jenis = 'Jenis harus pemasukan atau pengeluaran.';
    const nominal = rp(b.nominal, 'Nominal', e); if (!U.isDate(b.tanggal) || b.tanggal > U.todayStr()) e.tanggal = 'Tanggal wajib valid dan tidak di masa depan.';
    const pihak = U.str(b.pihak, 150); if (pihak.length < 2) e.pihak = b.jenis === 'keluar' ? 'Tujuan pengeluaran wajib diisi.' : 'Sumber pemasukan wajib diisi.';
    const kid = idOf(b.kategori_id); if (!kid) e.kategori_id = 'Kategori wajib dipilih.'; chk(e);
    let r;
    try {
      r = await fin(req, async q => {
        const k = (await q('SELECT id, nama FROM keu_kategori_kas WHERE id=$1 AND jenis=$2 AND aktif', [kid, b.jenis]))[0]; if (!k) throw bad('Kategori tidak sesuai atau nonaktif.', { kategori_id: 'Kategori tidak tersedia.' });
        return kasInsert(q, req, { tanggal: b.tanggal, jenis: b.jenis, kategori_id: k.id, kategori: k.nama, pihak, nominal, keterangan: U.textOrNull(b.keterangan, 500), idem });
      });
    } catch (err) { if (dupMsg(err) && idem) r = Object.assign({ duplikat: true }, (await db.q('SELECT id, no_transaksi FROM kas_transaksi WHERE idem=$1', [idem]))[0]); else throw err; }
    if (!r.duplikat) await lg(req, b.jenis === 'masuk' ? 'kas_masuk' : 'kas_keluar', `Kas ${b.jenis} ${r.no_transaksi} Rp${nominal}`);
    res.status(r.duplikat ? 200 : 201).json(r);
  }));
  api.post('/keuangan/kas/saldo-awal', mod, ah(async (req, res) => {
    const b = req.body || {}, e = {}; needKonfirmasi(b); const nominal = rp(b.nominal, 'Saldo awal', e); if (!U.isDate(b.tanggal) || b.tanggal > U.todayStr()) e.tanggal = 'Tanggal wajib valid.'; chk(e);
    let r; try { r = await fin(req, q => kasInsert(q, req, { tanggal: b.tanggal, jenis: 'saldo_awal', kategori: 'Saldo awal', pihak: 'Saldo awal kas', nominal, keterangan: U.textOrNull(b.keterangan, 500) })); }
    catch (err) { if (U.isUnique(err)) throw bad('Saldo awal kas sudah pernah dicatat (hanya sekali). Gunakan pemasukan/pengeluaran untuk penyesuaian.', null, 409); throw err; }
    await lg(req, 'kas_masuk', `Saldo awal kas Rp${nominal}`); res.status(201).json(r);
  }));
  api.put('/keuangan/kas/:id(\\d+)/bukti', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), f = U.readUpload(req.body, { pdf: true }); if (f.error) throw bad(f.error, { berkas: f.error });
    // berkas disimpan oleh pemilik (Bendahara tidak punya akses tabel berkas); lalu dikaitkan sekali saja
    await db.tx(async q => {
      const k = (await q('SELECT id, berkas_id FROM kas_transaksi WHERE id=$1 FOR UPDATE', [id]))[0]; if (!k) throw bad('Transaksi tidak ditemukan.', null, 404);
      if (k.berkas_id) throw bad('Bukti sudah terlampir dan tidak dapat diganti (transaksi tidak boleh diubah).', null, 409);
      const bid = (await q('INSERT INTO berkas (jenis,mime,ukuran,nama_asli,sha256,isi,diunggah,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', ['bukti_kas', f.mime, f.ukuran, f.nama, f.sha256, f.buf, Date.now(), req.user.id]))[0].id;
      await q('UPDATE kas_transaksi SET berkas_id=$1 WHERE id=$2', [bid, id]); await audit(q, req, 'kas', id, 'bukti', null, null, { berkas_id: bid });
    });
    await lg(req, 'unggah', `Bukti transaksi kas #${id}`); res.json({ ok: true });
  }));
  api.post('/keuangan/kas/:id(\\d+)/balik', mod, ah(async (req, res) => {
    const id = idOf(req.params.id), b = req.body || {}, e = {}; needKonfirmasi(b); const alasan = alasanOf(b, e); chk(e);
    const r = await fin(req, async q => {
      const o = (await q('SELECT * FROM kas_transaksi WHERE id=$1 FOR UPDATE', [id]))[0]; if (!o) throw bad('Transaksi tidak ditemukan.', null, 404);
      if (!['masuk', 'keluar'].includes(o.jenis)) throw bad('Hanya pemasukan atau pengeluaran yang dapat dibalik.', null, 409);
      if ((await q('SELECT 1 FROM kas_transaksi WHERE membalik_id=$1', [id])).length) throw bad('Transaksi ini sudah dibalik.', null, 409);
      return kasInsert(q, req, { tanggal: U.todayStr(), jenis: 'pembalikan_' + o.jenis, kategori_id: o.kategori_id, kategori: o.kategori, pihak: o.pihak, nominal: Number(o.nominal), keterangan: 'Pembalikan ' + o.no_transaksi, membalik_id: id, alasan });
    });
    await lg(req, 'balik', `Pembalikan kas #${id} → ${r.no_transaksi}: ${alasan}`); res.status(201).json(r);
  }));
  // Buku kas: saldo awal periode + baris berurutan dengan saldo berjalan
  async function bukuKas(q, qs) {
    const r = rentang(Object.assign({}, qs, { periode: qs.periode || 'bulan' }));
    const awal = Number((await q(`SELECT COALESCE(SUM(${KAS_EFEK}),0) AS n FROM kas_transaksi WHERE tanggal < $1`, [r.dari]))[0].n);
    const w = U.where(); w.add('k.tanggal BETWEEN ' + w.push(r.dari) + ' AND ' + w.push(r.sampai));
    if (idOf(qs.kategori_id)) w.add('k.kategori_id = ?', idOf(qs.kategori_id));
    if (['masuk', 'keluar'].includes(qs.jenis)) w.add('k.jenis IN (' + w.push(qs.jenis) + ', ' + w.push('pembalikan_' + qs.jenis) + ')');
    // saldo berjalan harus dari seluruh transaksi di periode (bukan hanya yang lolos filter) agar tidak menyesatkan
    const all = await q(`SELECT k.id, k.no_transaksi, k.tanggal::text AS tanggal, k.jenis, k.kategori_id, k.kategori, k.pihak, k.nominal, k.keterangan, k.berkas_id, k.membalik_id, k.alasan, k.dibuat, u.username AS petugas,
      (${KAS_EFEK.replace(/jenis/g, 'k.jenis').replace(/nominal/g, 'k.nominal')}) AS efek, EXISTS (SELECT 1 FROM kas_transaksi x WHERE x.membalik_id=k.id) AS dibalik
      FROM kas_transaksi k JOIN users u ON u.id=k.oleh WHERE k.tanggal BETWEEN $1 AND $2 ORDER BY k.tanggal, k.id LIMIT 10000`, [r.dari, r.sampai]);
    const saldoAwalTrx = all.filter(x => x.jenis === 'saldo_awal').reduce((a, x) => a + Number(x.nominal), 0);
    let s = awal + saldoAwalTrx; const ids = new Set((await q(`SELECT k.id FROM kas_transaksi k ${w.sql}`, w.params())).map(x => x.id));
    const rows = []; let masuk = 0, keluar = 0;
    for (const x of all) { if (x.jenis === 'saldo_awal') { x.efek = 0; x.saldo = s; x.masuk = 0; x.keluar = 0; if (ids.has(x.id)) rows.push(x); continue; } s += Number(x.efek); x.saldo = s; x.masuk = Number(x.efek) > 0 ? Number(x.nominal) : 0; x.keluar = Number(x.efek) < 0 ? Number(x.nominal) : 0; if (ids.has(x.id)) { rows.push(x); } }
    for (const x of all) { if (x.jenis === 'masuk') masuk += Number(x.nominal); else if (x.jenis === 'pembalikan_masuk') masuk -= Number(x.nominal); else if (x.jenis === 'keluar') keluar += Number(x.nominal); else if (x.jenis === 'pembalikan_keluar') keluar -= Number(x.nominal); }
    return { periode: r, saldo_awal: awal + saldoAwalTrx, pemasukan: masuk, pengeluaran: keluar, saldo_akhir: s, rows };
  }
  api.get('/keuangan/kas', mod, ah(async (req, res) => res.json(await fin(req, async q => {
    const d = await bukuKas(q, req.query); const pg = U.pageOf(req.query); const total = d.rows.length;
    d.rows = d.rows.slice().reverse().slice(pg.offset, pg.offset + pg.size); // terbaru di atas pada tampilan
    d.page = pg.page; d.size = pg.size; d.total = total; d.ada_saldo_awal = !!(await q("SELECT 1 FROM kas_transaksi WHERE jenis='saldo_awal'")).length; return d;
  }))));

  // ---------- Dashboard ----------
  api.get('/keuangan/dashboard', mod, ah(async (req, res) => {
    const r = rentang(req.query), t = rentang({ periode: 'hari' }), bln = rentang({ periode: 'bulan' });
    const harian = (new Date(r.sampai) - new Date(r.dari)) / 864e5 <= 62 && r.periode !== 'semua';
    const keyOf = d => harian ? d : d.slice(0, 7), bucket = [];
    if (r.periode !== 'semua') { for (let d = new Date(r.dari + 'T00:00:00Z'); iso(d) <= r.sampai; d = new Date(d.getTime() + 864e5)) { const k = keyOf(iso(d)); if (!bucket.includes(k)) bucket.push(k); } }
    const out = await fin(req, async q => {
      const n = async (sql, p) => Number((await q(sql, p))[0].n);
      const tg = (await q(`SELECT COALESCE(SUM(nominal),0)::bigint total, COUNT(*)::int jumlah,
          COALESCE(SUM(sisa) FILTER (WHERE status_bayar='belum'),0)::bigint belum_nominal, COUNT(*) FILTER (WHERE status_bayar='belum')::int belum_jumlah,
          COALESCE(SUM(dibayar) FILTER (WHERE status_bayar='sebagian'),0)::bigint sebagian_dibayar, COALESCE(SUM(sisa) FILTER (WHERE status_bayar='sebagian'),0)::bigint sebagian_sisa, COUNT(*) FILTER (WHERE status_bayar='sebagian')::int sebagian_jumlah,
          COUNT(*) FILTER (WHERE status_bayar='lunas')::int lunas_jumlah FROM v_keu_tagihan WHERE status_tagihan='aktif' AND dibuat >= $1 AND dibuat < $2`, [r.msDari, r.msSampai]))[0];
      const bayar = await n("SELECT COALESCE(SUM(nominal),0) AS n FROM keu_pembayaran WHERE status='sah' AND tanggal BETWEEN $1 AND $2", [r.dari, r.sampai]);
      const tunggakan = (await q("SELECT COALESCE(SUM(sisa),0)::bigint nominal, COUNT(*)::int jumlah FROM v_keu_tagihan WHERE status_bayar IN ('belum','sebagian')"))[0];
      const kas = (await q(`SELECT COALESCE(SUM(nominal) FILTER (WHERE jenis='masuk'),0) - COALESCE(SUM(nominal) FILTER (WHERE jenis='pembalikan_masuk'),0) AS masuk,
          COALESCE(SUM(nominal) FILTER (WHERE jenis='keluar'),0) - COALESCE(SUM(nominal) FILTER (WHERE jenis='pembalikan_keluar'),0) AS keluar FROM kas_transaksi WHERE tanggal BETWEEN $1 AND $2`, [r.dari, r.sampai]))[0];
      const saldoKas = await n(`SELECT COALESCE(SUM(${KAS_EFEK}),0) AS n FROM kas_transaksi WHERE tanggal <= $1`, [r.sampai]);
      const saldoAwal = await n(`SELECT COALESCE(SUM(${KAS_EFEK}),0) AS n FROM kas_transaksi WHERE tanggal < $1`, [r.dari]);
      const tab = await n(`SELECT COALESCE(SUM(${TAB_EFEK}),0) AS n FROM tabungan_transaksi`);
      const cnt = async x => await n(`SELECT (SELECT COUNT(*) FROM keu_pembayaran WHERE tanggal BETWEEN $1 AND $2) + (SELECT COUNT(*) FROM tabungan_transaksi WHERE tanggal BETWEEN $1 AND $2) + (SELECT COUNT(*) FROM kas_transaksi WHERE jenis <> 'saldo_awal' AND tanggal BETWEEN $1 AND $2) AS n`, [x.dari, x.sampai]);
      const grp = harian ? 'to_char(tanggal,\'YYYY-MM-DD\')' : 'to_char(tanggal,\'YYYY-MM\')';
      const kasB = await q(`SELECT ${grp} AS k, COALESCE(SUM(nominal) FILTER (WHERE jenis='masuk'),0) - COALESCE(SUM(nominal) FILTER (WHERE jenis='pembalikan_masuk'),0) AS masuk,
          COALESCE(SUM(nominal) FILTER (WHERE jenis='keluar'),0) - COALESCE(SUM(nominal) FILTER (WHERE jenis='pembalikan_keluar'),0) AS keluar, COALESCE(SUM(${KAS_EFEK}) FILTER (WHERE jenis <> 'saldo_awal' OR TRUE),0) AS net
          FROM kas_transaksi WHERE tanggal BETWEEN $1 AND $2 GROUP BY 1`, [r.dari, r.sampai]);
      const bayB = await q(`SELECT ${grp} AS k, COALESCE(SUM(nominal),0) AS n FROM keu_pembayaran WHERE status='sah' AND tanggal BETWEEN $1 AND $2 GROUP BY 1`, [r.dari, r.sampai]);
      return { tg, bayar, tunggakan, kas, saldoKas, saldoAwal, tab, hariIni: await cnt(t), bulanIni: await cnt(bln), kasB, bayB };
    });
    const mk = (rows, f) => { const m = {}; rows.forEach(x => { m[x.k] = x; }); return bucket.map(k => f(m[k] || {}, k)); };
    let run = out.saldoAwal; const saldoSeries = mk(out.kasB, (x, k) => { run += Number(x.net || 0); return { k, v: run }; });
    res.json({ periode: { jenis: r.periode, dari: r.dari, sampai: r.sampai, harian },
      tagihan: { total: Number(out.tg.total), jumlah: out.tg.jumlah, belum_nominal: Number(out.tg.belum_nominal), belum_jumlah: out.tg.belum_jumlah, sebagian_dibayar: Number(out.tg.sebagian_dibayar), sebagian_sisa: Number(out.tg.sebagian_sisa), sebagian_jumlah: out.tg.sebagian_jumlah, lunas_jumlah: out.tg.lunas_jumlah },
      pembayaran_diterima: out.bayar, tunggakan: { nominal: Number(out.tunggakan.nominal), jumlah: out.tunggakan.jumlah },
      kas: { pemasukan: Number(out.kas.masuk), pengeluaran: Number(out.kas.keluar), saldo: out.saldoKas }, tabungan_saldo: out.tab,
      transaksi: { hari_ini: out.hariIni, bulan_ini: out.bulanIni },
      grafik: { kas: mk(out.kasB, (x, k) => ({ k, masuk: Number(x.masuk || 0), keluar: Number(x.keluar || 0) })), penerimaan: mk(out.bayB, (x, k) => ({ k, v: Number(x.n || 0) })), saldo_kas: saldoSeries,
        status: [{ k: 'Lunas', v: out.tg.lunas_jumlah }, { k: 'Dibayar sebagian', v: out.tg.sebagian_jumlah }, { k: 'Belum dibayar', v: out.tg.belum_jumlah }] } });
  }));

  // ---------- Audit & backup (Super Admin) ----------
  api.get('/keuangan/audit', mod, needSA, ah(async (req, res) => {
    const pg = U.pageOf(req.query), w = U.where(); if (req.query.entitas) w.add('entitas = ?', String(req.query.entitas).slice(0, 30));
    const total = Number((await one(`SELECT COUNT(*) AS n FROM keu_audit ${w.sql}`, w.params())).n);
    res.json({ total, page: pg.page, size: pg.size, rows: await db.q(`SELECT id, waktu, username, entitas, entitas_id, aksi, alasan, sebelum, sesudah FROM keu_audit ${w.sql} ORDER BY id DESC LIMIT ${pg.size} OFFSET ${pg.offset}`, w.params()) });
  }));
  api.get('/keuangan/backup', mod, needSA, ah(async (req, res) => {
    const T = ['keu_kategori_tagihan', 'keu_kategori_kas', 'keu_metode', 'keu_tagihan', 'keu_pembayaran', 'tabungan_rekening', 'tabungan_transaksi', 'kas_transaksi', 'keu_audit'], dump = { dibuat: new Date().toISOString(), catatan: 'Cadangan data keuangan SIMA (tanpa berkas bukti).', tabel: {} };
    await db.tx(async q => { for (const t of T) dump.tabel[t] = await q(`SELECT * FROM ${t} ORDER BY id`); });
    await logBy(req, 'backup', 'keuangan', 'Mengunduh cadangan data keuangan');
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="cadangan-keuangan-${iso(jkt())}.json"` }).send(JSON.stringify(dump, (k, v) => typeof v === 'bigint' ? Number(v) : v));
  }));
  api.locals = { fin, rentang, bukuKas, mod, needSA, idOf, bad, KAS_EFEK, TAB_EFEK, tagihanWhere, TAG_ORD };
}
module.exports = { register, rentang, bad, rp, jkt, iso, KAS_EFEK, TAB_EFEK };
