'use strict';
// Laporan Keamanan (7 jenis): JSON untuk layar/cetak, PDF, dan Excel. Tidak memuat data keuangan.
const U = require('../util');
const { pdfLaporan, xlsxLaporan } = require('./keu-laporan');
const { bad } = require('./keuangan');
const LAPORAN = { pelanggaran: 'Laporan Pelanggaran', kategori: 'Rekap Kategori Pelanggaran', pembinaan: 'Laporan Riwayat Pembinaan', 'izin-keluar': 'Laporan Perizinan Keluar Pondok', 'izin-pulang': 'Laporan Izin Pulang', terlambat: 'Laporan Santri Terlambat Kembali', rekap: 'Rekap Aktivitas Keamanan' };
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tgl = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${+dd} ${BLN[+m - 1]} ${y}`; };
const wib = v => { if (!v) return ''; const d = new Date(new Date(v).getTime() + 7 * 3600e3); return d.toISOString().slice(0, 16).replace('T', ' ').split(' ').map((x, i) => i ? x : tgl(x)).join(' ') + ' WIB'; };
const lama = m => m == null ? '' : m < 60 ? `${m} menit` : `${Math.floor(m / 60)} jam ${m % 60} menit`;
const JK = { putra: 'Putra', putri: 'Putri' };
const STP = { baru: 'Baru dicatat', proses: 'Dalam proses tindak lanjut', selesai: 'Selesai ditindaklanjuti' }, STM = { berjalan: 'Berjalan', selesai: 'Selesai', dibatalkan: 'Dibatalkan' };
const STI = { menunggu: 'Menunggu persetujuan', disetujui: 'Disetujui', ditolak: 'Ditolak', berlangsung: 'Sedang izin', mendekat: 'Sedang izin (jadwal kembali mendekat)', terlambat: 'Terlambat kembali', kembali: 'Sudah kembali', dibatalkan: 'Dibatalkan' };
const TND = { belum: 'Belum ditindak', dihubungi: 'Sudah dihubungi', dalam_proses: 'Dalam proses', selesai: 'Selesai' };

function register(api, { db, logBy, ah, mod, kea, setting, tolOf, izinSel, izinWhere, plgWhere, PLG_SEL }) {
  const send = (res, buf, type, name) => res.set({ 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Length': buf.length }).send(buf);
  async function buat(q, jenis, qs) {
    if (!LAPORAN[jenis]) throw bad('Jenis laporan tidak dikenal.', null, 404);
    const idn = Object.assign({ nama: 'Pondok Pesantren Alhidayah Induk', alamat: '', kontak: '', catatan: '' }, await setting(q, 'identitas')), tol = await tolOf(q), prg = Math.max(1, parseInt(await setting(q, 'peringatan_menit'), 10) || 120);
    const filter = [], rep = { jenis, judul: LAPORAN[jenis], pondok: idn.nama, alamat: [idn.alamat, idn.kontak].filter(Boolean).join(' · '), filter, kolom: [], rows: [], ringkasan: [], catatan: idn.catatan || '' };
    rep.dari = U.isDate(qs.dari) ? qs.dari : ''; rep.sampai = U.isDate(qs.sampai) ? qs.sampai : '';
    filter.push(rep.dari || rep.sampai ? `Periode: ${rep.dari ? tgl(rep.dari) : 'awal'} s.d. ${rep.sampai ? tgl(rep.sampai) : 'sekarang'}` : 'Seluruh periode');
    if (JK[qs.kelompok]) filter.push('Jenis kelamin: ' + JK[qs.kelompok]); if (qs.q) filter.push('Pencarian: ' + U.str(qs.q, 80));
    const base = [{ k: '_no', t: 'No', tipe: 'no', w: 3 }];
    if (jenis === 'pelanggaran' || jenis === 'kategori') {
      const w = plgWhere(qs); if (qs.status && STP[qs.status]) filter.push('Status: ' + STP[qs.status]);
      const rows = await q(`${PLG_SEL} ${w.sql} ORDER BY p.tanggal DESC, p.id DESC LIMIT 5000`, w.params());
      if (jenis === 'pelanggaran') {
        rep.kolom = base.concat([{ k: 'nomor', t: 'Nomor', tipe: 'txt', w: 8 }, { k: 'tanggal', t: 'Tanggal', tipe: 'tgl', w: 8 }, { k: 'waktu', t: 'Jam', tipe: 'txt', w: 4 }, { k: 'nis', t: 'NIS', tipe: 'txt', w: 7 }, { k: 'nama', t: 'Nama', tipe: 'txt', w: 12 }, { k: 'jk', t: 'JK', tipe: 'txt', w: 4 }, { k: 'asrama', t: 'Asrama/Kamar', tipe: 'txt', w: 10 }, { k: 'kategori', t: 'Kategori', tipe: 'txt', w: 10 }, { k: 'lokasi', t: 'Lokasi', tipe: 'txt', w: 8 }, { k: 'deskripsi', t: 'Deskripsi', tipe: 'txt', w: 16 }, { k: 'stat', t: 'Status', tipe: 'txt', w: 9 }, { k: 'petugas', t: 'Petugas', tipe: 'txt', w: 7 }]);
        rep.rows = rows.map(r => ({ ...r, jk: JK[r.kelompok] || '', asrama: [r.asrama, r.kamar].filter(Boolean).join(' / '), stat: r.batal ? 'Dibatalkan' : STP[r.status], petugas: r.petugas_nama || r.petugas }));
        const aktif = rows.filter(r => !r.batal); rep.ringkasan = [['Jumlah catatan', rows.length, 'int'], ['Catatan aktif (tidak dibatalkan)', aktif.length, 'int'], ['Jumlah santri berbeda', new Set(aktif.map(r => r.santri_id)).size, 'int']];
      } else {
        const m = new Map(); rows.filter(r => !r.batal).forEach(r => { const o = m.get(r.kategori) || { kategori: r.kategori, jumlah: 0, s: new Set(), baru: 0, proses: 0, selesai: 0 }; o.jumlah++; o.s.add(r.santri_id); o[r.status]++; m.set(r.kategori, o); });
        rep.kolom = base.concat([{ k: 'kategori', t: 'Kategori pelanggaran', tipe: 'txt', w: 20 }, { k: 'jumlah', t: 'Jumlah catatan', tipe: 'txt', w: 8 }, { k: 'santri', t: 'Santri berbeda', tipe: 'txt', w: 8 }, { k: 'baru', t: 'Baru dicatat', tipe: 'txt', w: 8 }, { k: 'proses', t: 'Dalam proses', tipe: 'txt', w: 8 }, { k: 'selesai', t: 'Selesai', tipe: 'txt', w: 8 }]);
        rep.rows = [...m.values()].sort((a, b) => b.jumlah - a.jumlah).map(o => ({ ...o, santri: o.s.size })); rep.ringkasan = [['Jumlah kategori', rep.rows.length, 'int'], ['Total catatan', rep.rows.reduce((a, r) => a + r.jumlah, 0), 'int']];
      }
    } else if (jenis === 'pembinaan') {
      const w = U.where(); if (qs.q) { const ph = w.push('%' + U.likeEsc(U.str(qs.q, 80)) + '%'); w.add(`(s.nama ILIKE ${ph} OR s.nis ILIKE ${ph} OR m.nomor ILIKE ${ph})`); }
      if (rep.dari) w.add('m.tanggal >= ?', rep.dari); if (rep.sampai) w.add('m.tanggal <= ?', rep.sampai); if (STM[qs.status]) { w.add('m.status = ?', qs.status); filter.push('Status: ' + STM[qs.status]); }
      if (JK[qs.kelompok]) w.add('s.kelompok = ?', qs.kelompok); if (parseInt(qs.asrama_id, 10) > 0) w.add('s.asrama_id = ?', parseInt(qs.asrama_id, 10));
      const rows = await q(`SELECT m.nomor, m.tanggal::text AS tanggal, s.nis, s.nama, s.kelompok, s.asrama, s.kamar, m.jenis, m.alasan, m.pembina, m.hasil, m.rencana, m.tanggal_tindak::text AS tanggal_tindak, m.status FROM kea_pembinaan m JOIN v_santri_kea s ON s.id=m.santri_id ${w.sql} ORDER BY m.tanggal DESC, m.id DESC LIMIT 5000`, w.params());
      rep.kolom = base.concat([{ k: 'nomor', t: 'Nomor', tipe: 'txt', w: 8 }, { k: 'tanggal', t: 'Tanggal', tipe: 'tgl', w: 8 }, { k: 'nis', t: 'NIS', tipe: 'txt', w: 7 }, { k: 'nama', t: 'Nama', tipe: 'txt', w: 12 }, { k: 'jk', t: 'JK', tipe: 'txt', w: 4 }, { k: 'asrama', t: 'Asrama/Kamar', tipe: 'txt', w: 10 }, { k: 'jenis', t: 'Bentuk pembinaan', tipe: 'txt', w: 10 }, { k: 'alasan', t: 'Alasan', tipe: 'txt', w: 14 }, { k: 'pembina', t: 'Pembina', tipe: 'txt', w: 8 }, { k: 'hasil', t: 'Hasil', tipe: 'txt', w: 12 }, { k: 'tanggal_tindak', t: 'Tindak lanjut', tipe: 'tgl', w: 8 }, { k: 'stat', t: 'Status', tipe: 'txt', w: 7 }]);
      rep.rows = rows.map(r => ({ ...r, jk: JK[r.kelompok] || '', asrama: [r.asrama, r.kamar].filter(Boolean).join(' / '), stat: STM[r.status] })); rep.ringkasan = [['Jumlah catatan', rows.length, 'int'], ['Berjalan', rows.filter(r => r.status === 'berjalan').length, 'int'], ['Selesai', rows.filter(r => r.status === 'selesai').length, 'int']];
    } else if (jenis === 'izin-keluar' || jenis === 'izin-pulang' || jenis === 'terlambat') {
      const jn = jenis === 'izin-keluar' ? 'keluar' : jenis === 'izin-pulang' ? 'pulang' : null, w = izinWhere(qs, jn), pulang = jn === 'pulang';
      const cond = jenis === 'terlambat' ? " WHERE (x.status = 'sedang_izin' AND x.status_tampil = 'terlambat') OR x.kembali_terlambat" : STI[qs.status] ? ` WHERE x.status_tampil = '${qs.status}'` : '';
      if (STI[qs.status] && jenis !== 'terlambat') filter.push('Status: ' + STI[qs.status]);
      const rows = await q(`SELECT * FROM (${izinSel(tol, prg)} ${w.sql}) x ${cond} ORDER BY x.id DESC LIMIT 5000`, w.params());
      rep.kolom = base.concat([{ k: 'nomor', t: 'Nomor', tipe: 'txt', w: 8 }].concat(jn ? [] : [{ k: 'jns', t: 'Jenis', tipe: 'txt', w: 5 }], [{ k: 'nis', t: 'NIS', tipe: 'txt', w: 7 }, { k: 'nama', t: 'Nama', tipe: 'txt', w: 12 }, { k: 'asrama', t: 'Asrama/Kamar', tipe: 'txt', w: 9 }, { k: 'tujuan', t: pulang ? 'Tujuan / alamat' : 'Tujuan', tipe: 'txt', w: 12 }, { k: 'rk', t: 'Rencana keluar', tipe: 'txt', w: 10 }, { k: 'rb', t: 'Jadwal kembali', tipe: 'txt', w: 10 }, { k: 'ak', t: 'Keluar aktual', tipe: 'txt', w: 10 }, { k: 'ab', t: 'Kembali aktual', tipe: 'txt', w: 10 }, { k: 'telat', t: 'Terlambat', tipe: 'txt', w: 7 }, { k: 'stat', t: 'Status', tipe: 'txt', w: 9 }, { k: 'kontak', t: 'Pendamping/Wali', tipe: 'txt', w: 10 }]));
      rep.rows = rows.map(r => ({ ...r, jns: r.jenis === 'keluar' ? 'Keluar' : 'Pulang', asrama: [r.asrama, r.kamar].filter(Boolean).join(' / '), tujuan: r.alamat_tujuan ? `${r.tujuan} — ${r.alamat_tujuan}` : r.tujuan, rk: wib(r.rencana_keluar), rb: wib(r.rencana_kembali), ak: wib(r.aktual_keluar), ab: wib(r.aktual_kembali), telat: r.telat_menit > 0 && (r.status === 'sedang_izin' || r.kembali_terlambat) ? lama(r.telat_menit) : '', stat: r.kembali_terlambat ? 'Sudah kembali (terlambat)' : STI[r.status_tampil] || r.status, kontak: [r.pendamping || r.wali, r.kontak_pendamping || r.kontak_wali].filter(Boolean).join(' · ') }));
      const c = s => rows.filter(r => r.status === s).length;
      rep.ringkasan = [['Jumlah data', rows.length, 'int'], ['Menunggu persetujuan', c('menunggu'), 'int'], ['Disetujui (belum keluar)', c('disetujui'), 'int'], ['Sedang izin', c('sedang_izin'), 'int'], ['Sudah kembali', c('kembali'), 'int'], ['Ditolak / dibatalkan', c('ditolak') + c('dibatalkan'), 'int'], ['Terlambat kembali', rows.filter(r => r.kembali_terlambat || r.status_tampil === 'terlambat').length, 'int']];
      if (jenis === 'terlambat') rep.catatan = [rep.catatan, 'Keterlambatan dihitung dari jadwal kembali dan waktu kedatangan yang dicatat petugas (zona waktu Asia/Jakarta).'].filter(Boolean).join(' ');
    } else {
      const wk = []; const p = []; if (rep.dari) { p.push(new Date(rep.dari + 'T00:00:00+07:00').getTime()); wk.push('waktu >= $' + p.length); } if (rep.sampai) { p.push(new Date(rep.sampai + 'T23:59:59.999+07:00').getTime()); wk.push('waktu <= $' + p.length); }
      const rows = await q(`SELECT waktu, username, entitas, aksi, ket, alasan FROM kea_audit ${wk.length ? 'WHERE ' + wk.join(' AND ') : ''} ORDER BY id DESC LIMIT 5000`, p);
      rep.kolom = base.concat([{ k: 'w', t: 'Waktu', tipe: 'txt', w: 12 }, { k: 'username', t: 'Pengguna', tipe: 'txt', w: 8 }, { k: 'entitas', t: 'Bagian', tipe: 'txt', w: 8 }, { k: 'aksi', t: 'Aksi', tipe: 'txt', w: 7 }, { k: 'ket', t: 'Keterangan', tipe: 'txt', w: 28 }, { k: 'alasan', t: 'Alasan', tipe: 'txt', w: 14 }]);
      rep.rows = rows.map(r => ({ ...r, w: wib(Number(r.waktu)) }));
      const n = {}; rows.forEach(r => { n[r.entitas] = (n[r.entitas] || 0) + 1; }); rep.ringkasan = [['Jumlah aktivitas', rows.length, 'int']].concat(Object.entries(n).map(([k, v]) => ['Bagian: ' + k, v, 'int']));
    }
    rep.rows.forEach((r, i) => { r._no = i + 1; }); return rep;
  }
  api.get('/keamanan/laporan', mod, (req, res) => res.json({ jenis: Object.entries(LAPORAN).map(([id, judul]) => ({ id, judul })) }));
  api.get('/keamanan/laporan/:jenis', mod, ah(async (req, res) => {
    const fmt = ['pdf', 'xlsx'].includes(req.query.format) ? req.query.format : 'json', rep = await kea(req, q => buat(q, req.params.jenis, req.query));
    if (fmt === 'json') { rep.rows = rep.rows.slice(0, 2000); return res.json(rep); }
    await logBy(req, 'unduh', 'keamanan', `Mengunduh ${rep.judul} (${fmt.toUpperCase()})`);
    const nm = `keamanan-${req.params.jenis}-${new Date().toISOString().slice(0, 10)}`.replace(/[^\w.-]/g, '');
    if (fmt === 'pdf') return send(res, await pdfLaporan(rep, req.user.username), 'application/pdf', nm + '.pdf');
    send(res, await xlsxLaporan(rep, req.user.username), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', nm + '.xlsx');
  }));
}
module.exports = { register, LAPORAN };
