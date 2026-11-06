'use strict';
// Pusat Laporan terintegrasi (Tahap 7). Katalog 7 kelompok; laporan keuangan/keamanan/pendidikan memakai endpoint modulnya (hak akses modul tetap berlaku),
// laporan Data Santri, Pengurus/Pengajar, Asrama, dan Berita/Galeri dibuat di sini (khusus Super Admin). Ekspor PDF/Excel/cetak mengikuti filter.
const U = require('../util');
const { pdfLaporan, xlsxLaporan } = require('./keu-laporan');
const { identitas, kop } = require('../identitas');
const { bad } = require('./keuangan');

const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tgl = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${+dd} ${BLN[+m - 1]} ${y}`; };
const wibTgl = ms => ms == null ? '' : new Date(Number(ms) + 7 * 3600e3).toISOString().slice(0, 10);
const JK = { putra: 'Putra', putri: 'Putri' }, JKS = { L: 'Putra', P: 'Putri' };
const C = { no: () => ({ k: '_no', t: 'No', tipe: 'no', w: 3 }), t: (k, t, w = 8) => ({ k, t, tipe: 'txt', w }), d: (k, t, w = 8) => ({ k, t, tipe: 'tgl', w }), n: (k, t, w = 5) => ({ k, t, tipe: 'int', w }) };
const idOf = v => { const n = parseInt(v, 10); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const ALUM = { lulus: 'Lulus', berhenti: 'Berhenti' };
const STB = { draft: 'Draft', terjadwal: 'Terjadwal', terbit: 'Terbit', arsip: 'Diarsipkan', dihapus: 'Dihapus' };
const AK = "s.status='aktif' AND NOT s.diarsipkan";

// ---- katalog: id, judul, filter. `sumber` = endpoint modul (laporan yang sudah ada) ----
const F = {
  dari: { k: 'dari', label: 'Dari tanggal', type: 'date' }, sampai: { k: 'sampai', label: 'Sampai tanggal', type: 'date' },
  periode: { k: 'periode', label: 'Periode', type: 'select', options: [['hari', 'Hari ini'], ['minggu', 'Minggu ini'], ['bulan', 'Bulan ini'], ['tahun', 'Tahun ini'], ['semua', 'Semua'], ['rentang', 'Rentang tanggal']], def: 'bulan' },
  kelompok: { k: 'kelompok', label: 'Putra/Putri', type: 'select', options: [['putra', 'Putra'], ['putri', 'Putri']] },
  q: { k: 'q', label: 'Cari nama/NIS', type: 'text' }, asrama: { k: 'asrama_id', label: 'Asrama', type: 'ref', ref: 'asrama' }, kamar: { k: 'kamar_id', label: 'Kamar', type: 'ref', ref: 'kamar' },
  katTagihan: { k: 'kategori_id', label: 'Jenis tagihan', type: 'ref', ref: 'kategori_tagihan' }, metode: { k: 'metode_id', label: 'Metode bayar', type: 'ref', ref: 'metode' },
  katBerita: { k: 'kategori_id', label: 'Kategori', type: 'ref', ref: 'kategori_berita' }, katGaleri: { k: 'kategori_id', label: 'Kategori', type: 'ref', ref: 'kategori_galeri' },
  jenisEdu: { k: 'jenis_id', label: 'Jenis pendidikan', type: 'ref', ref: 'edu_jenis' }, kelas: { k: 'kelas_id', label: 'Kelas', type: 'ref', ref: 'edu_kelas' }, pengajar: { k: 'pengajar_id', label: 'Pengajar', type: 'ref', ref: 'pengajar' },
  statusAlumni: { k: 'status_alumni', label: 'Status alumni', type: 'select', options: [['lulus', 'Lulus'], ['berhenti', 'Berhenti']] }, tahunKeluar: { k: 'tahun_keluar', label: 'Tahun keluar', type: 'text' },
  aktif: { k: 'status', label: 'Status', type: 'select', options: [['aktif', 'Aktif'], ['nonaktif', 'Nonaktif']] }, periodePengurus: { k: 'periode_id', label: 'Periode kepengurusan', type: 'ref', ref: 'periode' },
  jenisKonten: { k: 'jenis', label: 'Jenis', type: 'select', options: [['foto', 'Foto'], ['video', 'Video']] }, statusGaleri: { k: 'status', label: 'Status', type: 'select', options: [['draft', 'Draft'], ['terbit', 'Terbit'], ['arsip', 'Diarsipkan']] },
  tahun: { k: 'tahun', label: 'Tahun kegiatan', type: 'text' }
};
const KEU_S = [F.periode, F.dari, F.sampai], KEU_T = [F.periode, F.dari, F.sampai, F.kelompok, F.katTagihan];
const GRUP = [
  { id: 'santri', judul: '1. Laporan Data Santri', akses: ['super_admin'], sub: [{ judul: 'Data santri', items: [
    { id: 'santri-putra', judul: 'Daftar Santri Putra', f: [F.q, F.asrama, F.kamar] }, { id: 'santri-putri', judul: 'Daftar Santri Putri', f: [F.q, F.asrama, F.kamar] },
    { id: 'rekap-santri', judul: 'Rekap Jumlah Santri', f: [] }, { id: 'alumni-putra', judul: 'Daftar Alumni Putra', f: [F.q, F.statusAlumni, F.tahunKeluar] }, { id: 'alumni-putri', judul: 'Daftar Alumni Putri', f: [F.q, F.statusAlumni, F.tahunKeluar] },
    { id: 'rekap-status', judul: 'Rekap Santri Berdasarkan Status', f: [F.kelompok] }, { id: 'rekap-santri-asrama', judul: 'Rekap Santri per Asrama dan Kamar', f: [F.kelompok, F.asrama] }] }] },
  { id: 'pp', judul: '2. Laporan Pengurus dan Pengajar', akses: ['super_admin'], sub: [{ judul: 'Pengurus dan pengajar', items: [
    { id: 'pengurus-putra', judul: 'Daftar Pengurus Putra', f: [F.aktif, F.periodePengurus] }, { id: 'pengurus-putri', judul: 'Daftar Pengurus Putri', f: [F.aktif, F.periodePengurus] },
    { id: 'struktur-pengurus', judul: 'Struktur Kepengurusan', f: [F.kelompok, F.periodePengurus] }, { id: 'pengajar', judul: 'Daftar Pengajar', f: [F.aktif, F.q] }, { id: 'rekap-pp', judul: 'Rekap Status Pengurus dan Pengajar', f: [] }] }] },
  { id: 'asrama', judul: '3. Laporan Asrama', akses: ['super_admin'], sub: [{ judul: 'Asrama dan kamar', items: [
    { id: 'asrama-putra', judul: 'Daftar Asrama Putra', f: [] }, { id: 'asrama-putri', judul: 'Daftar Asrama Putri', f: [] }, { id: 'kamar', judul: 'Daftar Kamar dan Jumlah Penghuni Aktif', f: [F.kelompok, F.asrama] },
    { id: 'kapasitas', judul: 'Kapasitas Kamar per Asrama', f: [F.kelompok] }, { id: 'keterisian', judul: 'Rekap Kamar Berdasarkan Tingkat Keterisian', f: [F.kelompok] }] }] },
  { id: 'bendahara', judul: '4. Laporan Bendahara', akses: ['super_admin', 'bendahara'], catatan: 'Pembayaran santri, tabungan santri, dan kas operasional pondok adalah tiga laporan yang terpisah dan tidak dicampur.', sub: [
    { judul: 'A. Pembayaran santri', items: [{ id: 'pembayaran', judul: 'Laporan Pembayaran', sumber: '/keuangan/laporan/pembayaran', f: [...KEU_S, F.katTagihan, F.metode] }, { id: 'tagihan', judul: 'Laporan Tagihan', sumber: '/keuangan/laporan/tagihan', f: KEU_T },
      { id: 'tunggakan', judul: 'Laporan Tunggakan', sumber: '/keuangan/laporan/tunggakan', f: KEU_T }, { id: 'lunas', judul: 'Pembayaran Lunas', sumber: '/keuangan/laporan/lunas', f: KEU_T }, { id: 'sebagian', judul: 'Pembayaran Sebagian', sumber: '/keuangan/laporan/sebagian', f: KEU_T }] },
    { judul: 'B. Tabungan santri', items: [{ id: 'tabungan', judul: 'Laporan Tabungan', sumber: '/keuangan/laporan/tabungan', f: [...KEU_S, F.kelompok] }, { id: 'setoran', judul: 'Setoran Tabungan', sumber: '/keuangan/laporan/setoran', f: [...KEU_S, F.kelompok] }, { id: 'penarikan', judul: 'Penarikan Tabungan', sumber: '/keuangan/laporan/penarikan', f: [...KEU_S, F.kelompok] }] },
    { judul: 'C. Kas operasional pondok', items: [{ id: 'kas-masuk', judul: 'Pemasukan Kas', sumber: '/keuangan/laporan/kas-masuk', f: KEU_S }, { id: 'kas-keluar', judul: 'Pengeluaran Kas', sumber: '/keuangan/laporan/kas-keluar', f: KEU_S }, { id: 'saldo-kas', judul: 'Saldo Kas (Buku Kas)', sumber: '/keuangan/laporan/saldo-kas', f: KEU_S }] },
    { judul: 'D. Transaksi berdasarkan periode', items: [{ id: 'transaksi', judul: 'Laporan Transaksi per Periode', sumber: '/keuangan/laporan/transaksi', f: [...KEU_S, { k: 'jenis_transaksi', label: 'Jenis transaksi', type: 'select', options: [['pembayaran', 'Pembayaran santri'], ['tabungan', 'Tabungan santri'], ['kas', 'Kas pondok']] }] }] }] },
  { id: 'keamanan', judul: '5. Laporan Keamanan', akses: ['super_admin', 'keamanan'], sub: [{ judul: 'Keamanan', items: [
    { id: 'pelanggaran', judul: 'Laporan Pelanggaran', sumber: '/keamanan/laporan/pelanggaran', f: [F.dari, F.sampai, F.kelompok, F.asrama, F.q] }, { id: 'pembinaan', judul: 'Laporan Pembinaan', sumber: '/keamanan/laporan/pembinaan', f: [F.dari, F.sampai, F.kelompok, F.asrama, F.q] },
    { id: 'izin-keluar', judul: 'Laporan Perizinan Keluar Pondok', sumber: '/keamanan/laporan/izin-keluar', f: [F.dari, F.sampai, F.kelompok, F.asrama, F.q] }, { id: 'izin-pulang', judul: 'Laporan Izin Pulang', sumber: '/keamanan/laporan/izin-pulang', f: [F.dari, F.sampai, F.kelompok, F.asrama, F.q] },
    { id: 'terlambat', judul: 'Laporan Keterlambatan Kembali', sumber: '/keamanan/laporan/terlambat', f: [F.dari, F.sampai, F.kelompok, F.asrama, F.q] }, { id: 'rekap', judul: 'Rekap Aktivitas Keamanan', sumber: '/keamanan/laporan/rekap', f: [F.dari, F.sampai, F.kelompok] }] }] },
  { id: 'pendidikan', judul: '6. Laporan Pendidikan', akses: ['super_admin'], sub: [{ judul: 'Pendidikan', items: [
    { id: 'peserta', judul: 'Daftar Peserta Program', sumber: '/pendidikan/laporan/peserta', f: [F.jenisEdu, F.kelas, F.kelompok, F.q] }, { id: 'kelas', judul: 'Daftar Kelas', sumber: '/pendidikan/laporan/kelas', f: [F.jenisEdu, F.pengajar] },
    { id: 'jadwal', judul: 'Jadwal Pembelajaran', sumber: '/pendidikan/laporan/jadwal', f: [F.jenisEdu, F.kelas, F.pengajar] }, { id: 'presensi', judul: 'Presensi Santri', sumber: '/pendidikan/laporan/presensi', f: [F.dari, F.sampai, F.jenisEdu, F.kelas, F.kelompok] },
    { id: 'presensi-pengajar', judul: 'Presensi Pengajar', sumber: '/pendidikan/laporan/presensi-pengajar', f: [F.dari, F.sampai, F.pengajar] }, { id: 'evaluasi', judul: 'Hasil Evaluasi', sumber: '/pendidikan/laporan/evaluasi', f: [F.dari, F.sampai, F.jenisEdu, F.kelas] },
    { id: 'perkembangan', judul: 'Perkembangan Pembelajaran Santri', sumber: '/pendidikan/laporan/perkembangan', f: [F.dari, F.sampai, F.kelas, F.q] }, { id: 'rekap-kegiatan', judul: 'Rekap Kegiatan per Periode', sumber: '/pendidikan/laporan/rekap-kegiatan', f: [F.dari, F.sampai] }] }] },
  { id: 'konten', judul: '7. Laporan Berita dan Galeri', akses: ['super_admin'], sub: [{ judul: 'Berita', items: [
    { id: 'berita-semua', judul: 'Daftar Berita', f: [F.dari, F.sampai, F.katBerita, F.q] }, { id: 'berita-terbit', judul: 'Berita Diterbitkan', f: [F.dari, F.sampai, F.katBerita] }, { id: 'berita-draft', judul: 'Berita Draft', f: [F.katBerita] },
    { id: 'berita-terjadwal', judul: 'Berita Terjadwal', f: [F.katBerita] }, { id: 'berita-arsip', judul: 'Berita Diarsipkan', f: [F.katBerita] }] },
    { judul: 'Galeri dan statistik', items: [{ id: 'dokumentasi', judul: 'Daftar Dokumentasi Galeri', f: [F.katGaleri, F.jenisKonten, F.statusGaleri, F.tahun, F.q] }, { id: 'statistik-konten', judul: 'Statistik Publikasi Konten', f: [F.dari, F.sampai] }] }] }
];
const NEW = {};   // id → fungsi pembangun, diisi di bawah

function register(api, { db, auth, logBy, ah }) {
  const mod = auth.requireModule('laporan'), super_ = auth.requireModule('pengaturan');
  const dateOr = v => U.isDate(v) ? v : '';

  api.get('/laporan/katalog', mod, (req, res) => {
    const role = req.user.role;
    res.json({ role, kelompok: GRUP.filter(g => g.akses.includes(role)).map(g => ({ id: g.id, judul: g.judul, catatan: g.catatan || null, sub: g.sub.map(s => ({ judul: s.judul, items: s.items.map(i => ({ id: i.id, judul: i.judul, sumber: i.sumber || null, filter: i.f })) })) })) });
  });
  // opsi untuk filter bertipe `ref` (hanya yang boleh dilihat role tersebut)
  api.get('/laporan/ref', mod, ah(async (req, res) => {
    const role = req.user.role, out = {};
    if (role === 'super_admin') {
      out.asrama = await db.q("SELECT id, nama || ' (' || initcap(jenis) || ')' AS nama FROM asrama WHERE NOT diarsipkan ORDER BY jenis, nama");
      out.kamar = await db.q("SELECT k.id, a.nama || ' / ' || k.nama AS nama FROM kamar k JOIN asrama a ON a.id=k.asrama_id WHERE NOT k.diarsipkan ORDER BY a.nama, k.nama");
      out.periode = await db.q("SELECT id, nama || ' (' || initcap(kelompok) || ')' AS nama FROM periode ORDER BY kelompok, id DESC");
      out.kategori_berita = await db.q("SELECT id, nama FROM cms_kategori WHERE tipe='berita' ORDER BY urutan, nama"); out.kategori_galeri = await db.q("SELECT id, nama FROM cms_kategori WHERE tipe='galeri' ORDER BY urutan, nama");
      out.edu_jenis = await db.q('SELECT id, nama FROM edu_jenis ORDER BY nama'); out.edu_kelas = await db.q('SELECT id, nama FROM edu_kelas ORDER BY nama'); out.pengajar = await db.q('SELECT id, nama FROM pengajar WHERE NOT diarsipkan ORDER BY nama');
    }
    if (role === 'super_admin' || role === 'bendahara') { out.kategori_tagihan = await db.q('SELECT id, nama FROM keu_kategori_tagihan ORDER BY nama'); out.metode = await db.q('SELECT id, nama FROM keu_metode ORDER BY nama'); }
    if (role === 'keamanan') out.asrama = await db.q("SELECT id, nama || ' (' || initcap(jenis) || ')' AS nama FROM asrama WHERE NOT diarsipkan ORDER BY jenis, nama");
    res.json(out);
  }));

  async function buat(id, qs) {
    const fn = NEW[id]; if (!fn) throw bad('Jenis laporan tidak dikenal.', null, 404);
    const q = db.q.bind(db), rep = Object.assign({ jenis: id, filter: [], kolom: [], rows: [], ringkasan: [], catatan: '' }, kop(await identitas(q)));
    await fn(q, qs || {}, rep);
    if (!rep.filter.length) rep.filter.push('Per ' + tgl(U.todayStr()));
    rep.dibuat_pada = Date.now(); return rep;
  }
  const send = (res, buf, type, name) => res.set({ 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Length': buf.length }).send(buf);
  api.get('/laporan/data/:id', mod, ah(async (req, res) => {
    if (!NEW[req.params.id] || !GRUP.some(g => g.akses.includes(req.user.role) && g.sub.some(s => s.items.some(i => i.id === req.params.id && !i.sumber)))) return res.status(req.user.role === 'super_admin' ? 404 : 403).json({ error: req.user.role === 'super_admin' ? 'Jenis laporan tidak dikenal.' : 'Anda tidak memiliki hak akses ke laporan ini.' });
    const fmt = ['pdf', 'xlsx'].includes(req.query.format) ? req.query.format : 'json', rep = await buat(req.params.id, req.query), total = rep.rows.length;
    if (fmt === 'json') { rep.total = total; rep.terpotong = total > 2000; rep.rows = rep.rows.slice(0, 2000); return res.json(rep); }
    await logBy(req, 'unduh', 'laporan', `Mengunduh ${rep.judul} (${fmt.toUpperCase()}, ${total} baris)`);
    const nm = `${req.params.id}-${U.todayStr()}`.replace(/[^\w.-]/g, '');
    if (fmt === 'pdf') return send(res, await pdfLaporan(rep, req.user.username), 'application/pdf', nm + '.pdf');
    send(res, await xlsxLaporan(rep, req.user.username), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', nm + '.xlsx');
  }));

  // ---------------- Data Santri ----------------
  const santriDaftar = (kel, alumni) => async (q, qs, rep) => {
    const w = U.where(), s = U.str(qs.q || '', 80); w.add(`s.jenis_kelamin = ${w.push(kel === 'putra' ? 'L' : 'P')}`);
    if (alumni) { w.add("s.status='alumni'"); if (ALUM[qs.status_alumni]) { w.add('s.status_alumni = ?', qs.status_alumni); rep.filter.push('Status alumni: ' + ALUM[qs.status_alumni]); } const ty = idOf(qs.tahun_keluar); if (ty) { w.add('s.tahun_keluar = ?', ty); rep.filter.push('Tahun keluar: ' + ty); } }
    else { w.add(AK); if (idOf(qs.asrama_id)) { w.add('k.asrama_id = ?', idOf(qs.asrama_id)); } if (idOf(qs.kamar_id)) w.add('s.kamar_id = ?', idOf(qs.kamar_id)); }
    if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(s.nama ILIKE ${ph} OR COALESCE(s.nis,'') ILIKE ${ph})`); rep.filter.push('Pencarian: ' + s); }
    rep.filter.unshift((alumni ? 'Alumni ' : 'Santri aktif ') + JK[kel] + ' · per ' + tgl(U.todayStr()));
    const rows = await q(`SELECT s.nis, s.nama, s.tempat_lahir, s.tanggal_lahir::text AS lahir, s.tanggal_masuk::text AS masuk, s.tahun_masuk, s.status_alumni, s.tanggal_keluar::text AS keluar, s.tahun_keluar, a.nama AS asrama, k.nama AS kamar, s.nama_wali, s.telepon, s.asrama_terakhir, s.program_terakhir
      FROM santri s LEFT JOIN kamar k ON k.id=s.kamar_id LEFT JOIN asrama a ON a.id=k.asrama_id ${w.sql} ORDER BY s.nama LIMIT 20000`, w.params());
    rep.rows = rows.map(r => ({ ...r, asrama_kamar: [r.asrama, r.kamar].filter(Boolean).join(' / ') || 'Belum berkamar', alumni_st: ALUM[r.status_alumni] || '', ttl: [r.tempat_lahir, r.lahir ? tgl(r.lahir) : ''].filter(Boolean).join(', ') }));
    rep.kolom = alumni ? [C.no(), C.t('nis', 'NIS', 7), C.t('nama', 'Nama', 14), C.t('ttl', 'Tempat, tgl lahir', 12), C.d('masuk', 'Tgl masuk', 8), C.d('keluar', 'Tgl keluar', 8), C.t('alumni_st', 'Status', 6), C.t('asrama_terakhir', 'Asrama terakhir', 9), C.t('program_terakhir', 'Program terakhir', 10)]
      : [C.no(), C.t('nis', 'NIS', 7), C.t('nama', 'Nama', 14), C.t('ttl', 'Tempat, tgl lahir', 12), C.d('masuk', 'Tgl masuk', 8), C.t('asrama_kamar', 'Asrama / kamar', 11), C.t('nama_wali', 'Wali', 10), C.t('telepon', 'Telepon', 8)];
    rep.ringkasan = [[alumni ? 'Jumlah alumni' : 'Jumlah santri aktif', rows.length, 'int']];
    if (alumni) rep.ringkasan.push(['Lulus', rows.filter(r => r.status_alumni === 'lulus').length, 'int'], ['Berhenti', rows.filter(r => r.status_alumni === 'berhenti').length, 'int']);
    rep.judul = alumni ? `Daftar Alumni ${JK[kel]}` : `Daftar Santri ${JK[kel]}`;
  };
  NEW['santri-putra'] = santriDaftar('putra', false); NEW['santri-putri'] = santriDaftar('putri', false); NEW['alumni-putra'] = santriDaftar('putra', true); NEW['alumni-putri'] = santriDaftar('putri', true);
  NEW['rekap-santri'] = async (q, qs, rep) => {
    rep.judul = 'Rekap Jumlah Santri'; rep.filter.push('Per ' + tgl(U.todayStr()));
    const r = (await q(`SELECT COUNT(*) FILTER (WHERE status='aktif' AND NOT diarsipkan AND jenis_kelamin='L')::int ap, COUNT(*) FILTER (WHERE status='aktif' AND NOT diarsipkan AND jenis_kelamin='P')::int ai,
      COUNT(*) FILTER (WHERE status='alumni' AND jenis_kelamin='L')::int lp, COUNT(*) FILTER (WHERE status='alumni' AND jenis_kelamin='P')::int li FROM santri`))[0];
    rep.kolom = [C.no(), C.t('kat', 'Kategori', 10), C.n('putra', 'Putra'), C.n('putri', 'Putri'), C.n('jumlah', 'Jumlah')];
    rep.rows = [{ kat: 'Santri aktif', putra: r.ap, putri: r.ai, jumlah: r.ap + r.ai }, { kat: 'Alumni', putra: r.lp, putri: r.li, jumlah: r.lp + r.li }, { kat: 'Seluruh data', putra: r.ap + r.lp, putri: r.ai + r.li, jumlah: r.ap + r.ai + r.lp + r.li }];
    rep.ringkasan = [['Santri aktif', r.ap + r.ai, 'int'], ['Alumni', r.lp + r.li, 'int']]; rep.catatan = 'Santri aktif dan alumni dihitung terpisah; alumni bukan penghuni aktif asrama.';
  };
  NEW['rekap-status'] = async (q, qs, rep) => {
    rep.judul = 'Rekap Santri Berdasarkan Status'; const w = U.where(); if (JK[qs.kelompok]) { w.add('jenis_kelamin = ?', qs.kelompok === 'putra' ? 'L' : 'P'); rep.filter.push('Kelompok: ' + JK[qs.kelompok]); }
    rep.filter.push('Per ' + tgl(U.todayStr()));
    const rows = await q(`SELECT CASE WHEN diarsipkan THEN 'Diarsipkan' WHEN status='aktif' THEN 'Santri aktif' WHEN status_alumni='lulus' THEN 'Alumni - lulus' ELSE 'Alumni - berhenti' END AS status, COUNT(*) FILTER (WHERE jenis_kelamin='L')::int putra, COUNT(*) FILTER (WHERE jenis_kelamin='P')::int putri, COUNT(*)::int jumlah FROM santri ${w.sql} GROUP BY 1 ORDER BY 1`, w.params());
    rep.kolom = [C.no(), C.t('status', 'Status', 12), C.n('putra', 'Putra'), C.n('putri', 'Putri'), C.n('jumlah', 'Jumlah')]; rep.rows = rows; rep.ringkasan = [['Total data', rows.reduce((a, r) => a + r.jumlah, 0), 'int']];
  };
  NEW['rekap-santri-asrama'] = async (q, qs, rep) => {
    rep.judul = 'Rekap Santri per Asrama dan Kamar'; if (JK[qs.kelompok]) rep.filter.push('Kelompok: ' + JK[qs.kelompok]);
    rep.filter.push('Per ' + tgl(U.todayStr()));
    const wk = U.where(); wk.add('NOT k.diarsipkan'); wk.add('NOT a.diarsipkan'); if (JK[qs.kelompok]) wk.add('a.jenis = ?', qs.kelompok); if (idOf(qs.asrama_id)) wk.add('a.id = ?', idOf(qs.asrama_id));
    const rows = await q(`SELECT a.jenis, a.nama AS asrama, k.nama AS kamar, k.kapasitas, COUNT(s.id)::int AS penghuni FROM kamar k JOIN asrama a ON a.id=k.asrama_id LEFT JOIN santri s ON s.kamar_id=k.id AND ${AK} ${wk.sql} GROUP BY a.jenis, a.nama, k.nama, k.kapasitas ORDER BY a.jenis, a.nama, k.nama`, wk.params());
    const tb = await q(`SELECT COUNT(*)::int n FROM santri s WHERE ${AK} AND s.kamar_id IS NULL${JK[qs.kelompok] ? ` AND s.jenis_kelamin='${qs.kelompok === 'putra' ? 'L' : 'P'}'` : ''}`);
    const lst = rows;
    rep.kolom = [C.no(), C.t('jk', 'Putra/Putri', 6), C.t('asrama', 'Asrama', 10), C.t('kamar', 'Kamar', 8), C.n('kapasitas', 'Kapasitas'), C.n('penghuni', 'Penghuni aktif')];
    rep.rows = lst.map(r => ({ ...r, jk: JK[r.jenis] })); rep.ringkasan = [['Total penghuni aktif', lst.reduce((a, r) => a + r.penghuni, 0), 'int'], ['Santri aktif belum berkamar', tb[0].n, 'int']];
  };

  // ---------------- Pengurus & Pengajar ----------------
  const pengurusDaftar = kel => async (q, qs, rep) => {
    const w = U.where(); w.add('p.kelompok = ?', kel); w.add('NOT p.diarsipkan'); const st = qs.status === 'nonaktif' ? 'nonaktif' : qs.status === 'aktif' ? 'aktif' : ''; if (st) w.add(st === 'aktif' ? 'p.aktif' : 'NOT p.aktif'); if (idOf(qs.periode_id)) w.add('p.periode_id = ?', idOf(qs.periode_id));
    rep.filter.push('Pengurus ' + JK[kel] + (st ? ' · ' + (st === 'aktif' ? 'Aktif' : 'Nonaktif') : ' · semua status') + ' · per ' + tgl(U.todayStr())); rep.judul = 'Daftar Pengurus ' + JK[kel];
    const rows = await q(`SELECT p.nama, COALESCE(j.nama, p.jabatan) AS jabatan, COALESCE(d.nama, p.divisi) AS divisi, COALESCE(pr.nama, p.periode) AS periode, p.tanggal_mulai::text AS mulai, p.tanggal_selesai::text AS selesai, p.aktif, p.tugas
      FROM pengurus p LEFT JOIN jabatan j ON j.id=p.jabatan_id LEFT JOIN divisi d ON d.id=p.divisi_id LEFT JOIN periode pr ON pr.id=p.periode_id ${w.sql} ORDER BY COALESCE(j.urutan, 999), p.nama LIMIT 20000`, w.params());
    rep.rows = rows.map(r => ({ ...r, status: r.aktif ? 'Aktif' : 'Nonaktif' }));
    rep.kolom = [C.no(), C.t('nama', 'Nama', 14), C.t('jabatan', 'Jabatan', 10), C.t('divisi', 'Divisi', 9), C.t('periode', 'Periode', 9), C.d('mulai', 'Mulai', 7), C.d('selesai', 'Selesai', 7), C.t('status', 'Status', 6)];
    rep.ringkasan = [['Jumlah pengurus', rows.length, 'int'], ['Aktif', rows.filter(r => r.aktif).length, 'int'], ['Nonaktif', rows.filter(r => !r.aktif).length, 'int']];
  };
  NEW['pengurus-putra'] = pengurusDaftar('putra'); NEW['pengurus-putri'] = pengurusDaftar('putri');
  NEW['struktur-pengurus'] = async (q, qs, rep) => {
    rep.judul = 'Struktur Kepengurusan'; const w = U.where(); w.add('p.aktif'); w.add('NOT p.diarsipkan'); if (JK[qs.kelompok]) { w.add('p.kelompok = ?', qs.kelompok); } if (idOf(qs.periode_id)) w.add('p.periode_id = ?', idOf(qs.periode_id));
    rep.filter.push((JK[qs.kelompok] ? 'Pengurus ' + JK[qs.kelompok] : 'Pengurus putra dan putri') + ' (aktif) · per ' + tgl(U.todayStr()));
    const rows = await q(`SELECT p.kelompok, COALESCE(d.nama, p.divisi, 'Tanpa divisi') AS divisi, COALESCE(j.nama, p.jabatan) AS jabatan, p.nama, COALESCE(j.urutan, 999) AS u FROM pengurus p LEFT JOIN jabatan j ON j.id=p.jabatan_id LEFT JOIN divisi d ON d.id=p.divisi_id ${w.sql} ORDER BY p.kelompok, divisi, u, p.nama LIMIT 20000`, w.params());
    rep.rows = rows.map(r => ({ ...r, jk: JK[r.kelompok] })); rep.kolom = [C.no(), C.t('jk', 'Putra/Putri', 6), C.t('divisi', 'Divisi', 12), C.t('jabatan', 'Jabatan', 12), C.t('nama', 'Nama', 16)]; rep.ringkasan = [['Jumlah pengurus aktif', rows.length, 'int']];
  };
  NEW['pengajar'] = async (q, qs, rep) => {
    rep.judul = 'Daftar Pengajar'; const w = U.where(); w.add('NOT g.diarsipkan'); const st = qs.status === 'nonaktif' ? 'nonaktif' : qs.status === 'aktif' ? 'aktif' : ''; if (st) w.add(st === 'aktif' ? 'g.aktif' : 'NOT g.aktif');
    const s = U.str(qs.q || '', 80); if (s) { w.add('g.nama ILIKE ' + w.push('%' + U.likeEsc(s) + '%')); rep.filter.push('Pencarian: ' + s); }
    rep.filter.unshift('Pengajar' + (st ? ' ' + st : '') + ' · per ' + tgl(U.todayStr()));
    const rows = await q(`SELECT g.nama, g.bidang, g.lembaga, g.kontak, g.tanggal_mulai::text AS mulai, g.aktif FROM pengajar g ${w.sql} ORDER BY g.nama LIMIT 20000`, w.params());
    rep.rows = rows.map(r => ({ ...r, status: r.aktif ? 'Aktif' : 'Nonaktif' })); rep.kolom = [C.no(), C.t('nama', 'Nama', 14), C.t('bidang', 'Bidang', 10), C.t('lembaga', 'Lembaga', 10), C.t('kontak', 'Kontak', 8), C.d('mulai', 'Mulai', 7), C.t('status', 'Status', 6)];
    rep.ringkasan = [['Jumlah pengajar', rows.length, 'int'], ['Aktif', rows.filter(r => r.aktif).length, 'int']];
  };
  NEW['rekap-pp'] = async (q, qs, rep) => {
    rep.judul = 'Rekap Status Pengurus dan Pengajar'; rep.filter.push('Per ' + tgl(U.todayStr()));
    const a = await q("SELECT kelompok, COUNT(*) FILTER (WHERE aktif)::int aktif, COUNT(*) FILTER (WHERE NOT aktif)::int nonaktif FROM pengurus WHERE NOT diarsipkan GROUP BY kelompok ORDER BY kelompok"), g = (await q('SELECT COUNT(*) FILTER (WHERE aktif)::int aktif, COUNT(*) FILTER (WHERE NOT aktif)::int nonaktif FROM pengajar WHERE NOT diarsipkan'))[0];
    rep.rows = [...a.map(r => ({ kat: 'Pengurus ' + JK[r.kelompok], aktif: r.aktif, nonaktif: r.nonaktif, jumlah: r.aktif + r.nonaktif })), { kat: 'Pengajar', aktif: g.aktif, nonaktif: g.nonaktif, jumlah: g.aktif + g.nonaktif }];
    rep.kolom = [C.no(), C.t('kat', 'Kategori', 12), C.n('aktif', 'Aktif'), C.n('nonaktif', 'Nonaktif'), C.n('jumlah', 'Jumlah')]; rep.ringkasan = [['Total data', rep.rows.reduce((x, r) => x + r.jumlah, 0), 'int']];
  };

  // ---------------- Asrama ----------------
  const kamarSql = `SELECT a.id AS asrama_id, a.jenis, a.nama AS asrama, a.status AS st_asrama, k.id AS kamar_id, k.nama AS kamar, k.kapasitas, k.status AS st_kamar, (SELECT COUNT(*)::int FROM santri s WHERE s.kamar_id=k.id AND ${AK}) AS penghuni FROM kamar k JOIN asrama a ON a.id=k.asrama_id WHERE NOT k.diarsipkan AND NOT a.diarsipkan`;
  const asramaDaftar = kel => async (q, qs, rep) => {
    rep.judul = 'Daftar Asrama ' + JK[kel]; rep.filter.push('Asrama ' + JK[kel] + ' · per ' + tgl(U.todayStr()));
    const rows = await q(`SELECT a.nama, a.status, a.keterangan, COUNT(k.id)::int AS kamar, COALESCE(SUM(k.kapasitas) FILTER (WHERE k.status='aktif'),0)::int AS kapasitas, COALESCE(SUM((SELECT COUNT(*) FROM santri s WHERE s.kamar_id=k.id AND ${AK})),0)::int AS penghuni
      FROM asrama a LEFT JOIN kamar k ON k.asrama_id=a.id AND NOT k.diarsipkan WHERE a.jenis=$1 AND NOT a.diarsipkan GROUP BY a.id ORDER BY a.nama`, [kel]);
    rep.rows = rows.map(r => ({ ...r, st: r.status === 'aktif' ? 'Aktif' : 'Nonaktif', sisa: Math.max(0, r.kapasitas - r.penghuni) })); rep.kolom = [C.no(), C.t('nama', 'Asrama', 12), C.t('st', 'Status', 6), C.n('kamar', 'Jumlah kamar'), C.n('kapasitas', 'Kapasitas'), C.n('penghuni', 'Penghuni aktif'), C.n('sisa', 'Sisa kapasitas'), C.t('keterangan', 'Keterangan', 12)];
    rep.ringkasan = [['Jumlah asrama', rows.length, 'int'], ['Total kamar', rows.reduce((a, r) => a + r.kamar, 0), 'int'], ['Penghuni aktif', rows.reduce((a, r) => a + r.penghuni, 0), 'int']];
  };
  NEW['asrama-putra'] = asramaDaftar('putra'); NEW['asrama-putri'] = asramaDaftar('putri');
  const kamarRows = async (q, qs, rep) => { let r = await q(kamarSql + ' ORDER BY a.jenis, a.nama, k.nama'); if (JK[qs.kelompok]) { r = r.filter(x => x.jenis === qs.kelompok); rep.filter.push('Kelompok: ' + JK[qs.kelompok]); } if (idOf(qs.asrama_id)) { r = r.filter(x => x.asrama_id === idOf(qs.asrama_id)); rep.filter.push('Asrama dipilih'); } rep.filter.push('Per ' + tgl(U.todayStr())); return r; };
  NEW['kamar'] = async (q, qs, rep) => {
    rep.judul = 'Daftar Kamar dan Jumlah Penghuni Aktif'; const r = await kamarRows(q, qs, rep);
    rep.rows = r.map(x => ({ ...x, jk: JK[x.jenis], st: x.st_kamar === 'aktif' ? 'Aktif' : x.st_kamar === 'perbaikan' ? 'Perbaikan' : 'Nonaktif', sisa: x.kapasitas - x.penghuni }));
    rep.kolom = [C.no(), C.t('jk', 'Putra/Putri', 6), C.t('asrama', 'Asrama', 10), C.t('kamar', 'Kamar', 8), C.n('kapasitas', 'Kapasitas'), C.n('penghuni', 'Penghuni aktif'), C.n('sisa', 'Sisa'), C.t('st', 'Status', 7)];
    rep.ringkasan = [['Jumlah kamar', r.length, 'int'], ['Total kapasitas', r.reduce((a, x) => a + x.kapasitas, 0), 'int'], ['Penghuni aktif', r.reduce((a, x) => a + x.penghuni, 0), 'int']]; rep.catatan = 'Penghuni aktif hanya santri berstatus aktif; alumni tidak dihitung.';
  };
  NEW['kapasitas'] = async (q, qs, rep) => {
    rep.judul = 'Kapasitas Kamar per Asrama'; const r = (await kamarRows(q, qs, rep)).filter(x => x.st_kamar === 'aktif'), g = {};
    r.forEach(x => { const k = x.asrama_id; g[k] = g[k] || { jk: JK[x.jenis], asrama: x.asrama, kamar: 0, kapasitas: 0, penghuni: 0 }; g[k].kamar++; g[k].kapasitas += x.kapasitas; g[k].penghuni += x.penghuni; });
    rep.rows = Object.values(g).map(x => ({ ...x, sisa: x.kapasitas - x.penghuni, persen: x.kapasitas ? Math.round(x.penghuni / x.kapasitas * 100) + '%' : '—' }));
    rep.kolom = [C.no(), C.t('jk', 'Putra/Putri', 6), C.t('asrama', 'Asrama', 12), C.n('kamar', 'Kamar aktif'), C.n('kapasitas', 'Kapasitas'), C.n('penghuni', 'Penghuni aktif'), C.n('sisa', 'Sisa'), C.t('persen', 'Keterisian', 6)];
    rep.ringkasan = [['Total kapasitas (kamar aktif)', r.reduce((a, x) => a + x.kapasitas, 0), 'int'], ['Penghuni aktif', r.reduce((a, x) => a + x.penghuni, 0), 'int']];
  };
  NEW['keterisian'] = async (q, qs, rep) => {
    rep.judul = 'Rekap Kamar Berdasarkan Tingkat Keterisian'; const r = (await kamarRows(q, qs, rep)).filter(x => x.st_kamar === 'aktif');
    const kat = x => x.penghuni === 0 ? '1. Kosong' : x.penghuni > x.kapasitas ? '5. Melebihi kapasitas' : x.penghuni === x.kapasitas ? '4. Penuh' : x.penghuni / x.kapasitas >= 0.5 ? '3. Terisi 50% ke atas' : '2. Terisi di bawah 50%';
    const g = {}; r.forEach(x => { const k = kat(x); g[k] = g[k] || { tingkat: k.slice(3), kamar: 0, kapasitas: 0, penghuni: 0 }; g[k].kamar++; g[k].kapasitas += x.kapasitas; g[k].penghuni += x.penghuni; });
    rep.rows = Object.keys(g).sort().map(k => g[k]); rep.kolom = [C.no(), C.t('tingkat', 'Tingkat keterisian', 14), C.n('kamar', 'Jumlah kamar'), C.n('kapasitas', 'Kapasitas'), C.n('penghuni', 'Penghuni aktif')]; rep.ringkasan = [['Kamar aktif', r.length, 'int']];
  };

  // ---------------- Berita & Galeri ----------------
  const EF = "CASE WHEN b.dihapus IS NOT NULL THEN 'dihapus' WHEN b.status IN ('terbit','terjadwal') THEN CASE WHEN b.terbit_pada <= $NOW THEN 'terbit' ELSE 'terjadwal' END ELSE b.status END";
  const beritaDaftar = (st, judul) => async (q, qs, rep) => {
    rep.judul = judul; const now = Date.now(), w = U.where(), ef = EF.replace('$NOW', w.push(now)); w.add('b.dihapus IS NULL');
    if (st) { w.add(`(${ef}) = ${w.push(st)}`); rep.filter.push('Status: ' + STB[st]); }
    if (idOf(qs.kategori_id)) { w.add('b.kategori_id = ?', idOf(qs.kategori_id)); rep.filter.push('Kategori dipilih'); }
    const d1 = dateOr(qs.dari), d2 = dateOr(qs.sampai);
    if (d1) w.add('COALESCE(b.terbit_pada, b.dibuat) >= ' + w.push(Date.parse(d1 + 'T00:00:00+07:00'))); if (d2) w.add('COALESCE(b.terbit_pada, b.dibuat) < ' + w.push(Date.parse(d2 + 'T00:00:00+07:00') + 864e5));
    rep.filter.push(d1 || d2 ? `Periode: ${d1 ? tgl(d1) : 'awal'} s.d. ${d2 ? tgl(d2) : 'sekarang'}` : 'Seluruh periode');
    const s = U.str(qs.q || '', 80); if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(b.judul ILIKE ${ph} OR COALESCE(b.penulis,'') ILIKE ${ph})`); rep.filter.push('Pencarian: ' + s); }
    const rows = await q(`SELECT b.judul, k.nama AS kategori, b.penulis, ${ef} AS status, b.terbit_pada, b.dibuat, b.unggulan, b.slug FROM cms_berita b LEFT JOIN cms_kategori k ON k.id=b.kategori_id ${w.sql} ORDER BY COALESCE(b.terbit_pada, b.dibuat) DESC, b.id DESC LIMIT 20000`, w.params());
    rep.rows = rows.map(r => ({ ...r, st: STB[r.status] + (r.unggulan ? ' · unggulan' : ''), tgl_t: r.status === 'draft' || r.status === 'arsip' ? '' : wibTgl(r.terbit_pada), tgl_b: wibTgl(r.dibuat), url: '/berita/' + r.slug }));
    rep.kolom = [C.no(), C.t('judul', 'Judul', 20), C.t('kategori', 'Kategori', 8), C.t('penulis', 'Penulis', 8), C.t('st', 'Status', 8), C.d('tgl_t', 'Tgl terbit/jadwal', 8), C.d('tgl_b', 'Dibuat', 7)];
    rep.ringkasan = [['Jumlah berita', rows.length, 'int'], ['Unggulan', rows.filter(r => r.unggulan).length, 'int']];
  };
  NEW['berita-semua'] = beritaDaftar(null, 'Daftar Berita'); NEW['berita-terbit'] = beritaDaftar('terbit', 'Berita Diterbitkan'); NEW['berita-draft'] = beritaDaftar('draft', 'Berita Draft'); NEW['berita-terjadwal'] = beritaDaftar('terjadwal', 'Berita Terjadwal'); NEW['berita-arsip'] = beritaDaftar('arsip', 'Berita Diarsipkan');
  NEW['dokumentasi'] = async (q, qs, rep) => {
    rep.judul = 'Daftar Dokumentasi Galeri'; const w = U.where(); w.add('g.dihapus IS NULL');
    if (idOf(qs.kategori_id)) { w.add('g.kategori_id = ?', idOf(qs.kategori_id)); rep.filter.push('Kategori dipilih'); } if (['foto', 'video'].includes(qs.jenis)) { w.add('g.jenis = ?', qs.jenis); rep.filter.push('Jenis: ' + (qs.jenis === 'foto' ? 'Foto' : 'Video')); }
    if (['draft', 'terbit', 'arsip'].includes(qs.status)) { w.add('g.status = ?', qs.status); rep.filter.push('Status: ' + STB[qs.status]); } const ty = idOf(qs.tahun); if (ty) { w.add('EXTRACT(YEAR FROM g.tanggal_kegiatan) = ?', ty); rep.filter.push('Tahun kegiatan: ' + ty); }
    const s = U.str(qs.q || '', 80); if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(g.judul ILIKE ${ph} OR COALESCE(g.caption,'') ILIKE ${ph})`); rep.filter.push('Pencarian: ' + s); }
    if (!rep.filter.length) rep.filter.push('Semua dokumentasi · per ' + tgl(U.todayStr()));
    const rows = await q(`SELECT g.judul, g.jenis, k.nama AS kategori, g.tanggal_kegiatan::text AS tgl, g.status, g.dibuat, (SELECT COUNT(*)::int FROM cms_berita_galeri bg WHERE bg.galeri_id=g.id) AS dipakai FROM cms_galeri g LEFT JOIN cms_kategori k ON k.id=g.kategori_id ${w.sql} ORDER BY COALESCE(g.tanggal_kegiatan, to_timestamp(g.dibuat/1000.0)::date) DESC, g.id DESC LIMIT 20000`, w.params());
    rep.rows = rows.map(r => ({ ...r, jns: r.jenis === 'foto' ? 'Foto' : 'Video', st: STB[r.status], tgl_b: wibTgl(r.dibuat) })); rep.kolom = [C.no(), C.t('judul', 'Judul', 18), C.t('jns', 'Jenis', 5), C.t('kategori', 'Kategori', 10), C.d('tgl', 'Tgl kegiatan', 8), C.t('st', 'Status', 7), C.n('dipakai', 'Dipakai berita', 6), C.d('tgl_b', 'Diunggah', 7)];
    rep.ringkasan = [['Jumlah dokumentasi', rows.length, 'int'], ['Foto', rows.filter(r => r.jenis === 'foto').length, 'int'], ['Video', rows.filter(r => r.jenis === 'video').length, 'int']];
  };
  NEW['statistik-konten'] = async (q, qs, rep) => {
    rep.judul = 'Statistik Publikasi Konten'; const d1 = dateOr(qs.dari), d2 = dateOr(qs.sampai), now = Date.now(); rep.filter.push(d1 || d2 ? `Periode: ${d1 ? tgl(d1) : 'awal'} s.d. ${d2 ? tgl(d2) : 'sekarang'}` : 'Seluruh periode');
    const w = U.where(); const ef = EF.replace('$NOW', w.push(now)); w.add('b.dihapus IS NULL'); if (d1) w.add('COALESCE(b.terbit_pada, b.dibuat) >= ' + w.push(Date.parse(d1 + 'T00:00:00+07:00'))); if (d2) w.add('COALESCE(b.terbit_pada, b.dibuat) < ' + w.push(Date.parse(d2 + 'T00:00:00+07:00') + 864e5));
    const b = await q(`SELECT to_char(to_timestamp(COALESCE(b.terbit_pada, b.dibuat)/1000.0 + 25200), 'YYYY-MM') AS bulan, COUNT(*)::int AS berita, COUNT(*) FILTER (WHERE (${ef}) = 'terbit')::int AS terbit FROM cms_berita b ${w.sql} GROUP BY 1 ORDER BY 1`, w.params());
    const g = await q("SELECT to_char(to_timestamp(dibuat/1000.0 + 25200), 'YYYY-MM') AS bulan, COUNT(*) FILTER (WHERE jenis='foto')::int AS foto, COUNT(*) FILTER (WHERE jenis='video')::int AS video FROM cms_galeri WHERE dihapus IS NULL GROUP BY 1 ORDER BY 1");
    const map = {}; b.forEach(r => { map[r.bulan] = { bulan: r.bulan, berita: r.berita, terbit: r.terbit, foto: 0, video: 0 }; }); g.forEach(r => { map[r.bulan] = Object.assign(map[r.bulan] || { bulan: r.bulan, berita: 0, terbit: 0 }, { foto: r.foto, video: r.video }); });
    rep.rows = Object.values(map).sort((a, c) => a.bulan.localeCompare(c.bulan)).map(r => ({ ...r, blabel: BLN[+r.bulan.slice(5) - 1] + ' ' + r.bulan.slice(0, 4) }));
    rep.kolom = [C.no(), C.t('blabel', 'Bulan', 10), C.n('berita', 'Berita'), C.n('terbit', 'Berita terbit'), C.n('foto', 'Foto diunggah'), C.n('video', 'Video ditambahkan')];
    const tot = (await q(`SELECT COUNT(*) FILTER (WHERE x.s='terbit')::int terbit, COUNT(*) FILTER (WHERE x.s='draft')::int draft, COUNT(*) FILTER (WHERE x.s='terjadwal')::int terjadwal, COUNT(*) FILTER (WHERE x.s='arsip')::int arsip FROM (SELECT (${EF.replace('$NOW', '$1')}) AS s FROM cms_berita b WHERE b.dihapus IS NULL) x`, [now]))[0];
    rep.ringkasan = [['Berita terbit', tot.terbit, 'int'], ['Berita draft', tot.draft, 'int'], ['Berita terjadwal', tot.terjadwal, 'int'], ['Berita diarsipkan', tot.arsip, 'int']];
  };
}
module.exports = { register, GRUP, NEW };
