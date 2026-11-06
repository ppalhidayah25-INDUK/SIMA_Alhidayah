'use strict';
// Laporan Pendidikan (8 jenis): JSON untuk layar/cetak, PDF, Excel. Identitas pondok dari pengaturan.
const U = require('../util');
const { pdfLaporan, xlsxLaporan } = require('./keu-laporan');
const { bad } = require('./keuangan');
const LAPORAN = { peserta: 'Laporan Data Peserta Pendidikan', kelas: 'Laporan Kelas dan Kelompok Belajar', jadwal: 'Laporan Jadwal Pembelajaran', presensi: 'Laporan Presensi Santri', 'presensi-pengajar': 'Laporan Presensi Pengajar', evaluasi: 'Laporan Hasil Evaluasi', perkembangan: 'Laporan Perkembangan Pendidikan Santri', 'rekap-kegiatan': 'Rekap Kegiatan Pendidikan per Periode' };
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const tgl = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${+dd} ${BLN[+m - 1]} ${y}`; };
const JK = { putra: 'Putra', putri: 'Putri' }, STP = { aktif: 'Aktif', pindah: 'Pindah kelas', keluar: 'Keluar', nonaktif: 'Santri nonaktif/alumni' };

function register(api, { db, mod, wrap, logBy, setting, rekapPresensi, rekapNilai, NIL, nilaiWhere, JDW, jadwalWhere, PES, idOf }) {
  const send = (res, buf, type, name) => res.set({ 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Length': buf.length }).send(buf);
  const base = [{ k: '_no', t: 'No', tipe: 'no', w: 3 }];
  async function buat(jenis, qs) {
    if (!LAPORAN[jenis]) throw bad('Jenis laporan tidak dikenal.', null, 404);
    const q = db.q.bind(db), idn = Object.assign({ nama: 'Pondok Pesantren Alhidayah Induk', alamat: '', kontak: '', catatan: '' }, await setting(q, 'identitas')), filter = [];
    const rep = { jenis, judul: LAPORAN[jenis], pondok: idn.nama, alamat: [idn.alamat, idn.kontak].filter(Boolean).join(' · '), filter, kolom: [], rows: [], ringkasan: [], catatan: idn.catatan || '' };
    rep.dari = U.isDate(qs.dari) ? qs.dari : ''; rep.sampai = U.isDate(qs.sampai) ? qs.sampai : '';
    filter.push(rep.dari || rep.sampai ? `Periode: ${rep.dari ? tgl(rep.dari) : 'awal'} s.d. ${rep.sampai ? tgl(rep.sampai) : 'sekarang'}` : 'Seluruh periode');
    const names = {}; for (const [k, tb, lbl] of [['jenis_id', 'edu_jenis', 'Jenis pendidikan'], ['kelas_id', 'edu_kelas', 'Kelas'], ['pengajar_id', 'pengajar', 'Pengajar'], ['asrama_id', 'asrama', 'Asrama']]) if (idOf(qs[k])) { const r = (await q(`SELECT nama FROM ${tb} WHERE id=$1`, [idOf(qs[k])]))[0]; if (r) filter.push(`${lbl}: ${r.nama}`); }
    if (JK[qs.kelompok]) filter.push('Jenis kelamin: ' + JK[qs.kelompok]);
    const f = Object.assign({}, qs, { dari: rep.dari, sampai: rep.sampai });
    if (jenis === 'peserta') {
      const w = U.where(), s = U.str(qs.q || '', 80); if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(s.nama ILIKE ${ph} OR s.nis ILIKE ${ph})`); }
      if (idOf(qs.kelas_id)) w.add('p.kelas_id = ?', idOf(qs.kelas_id)); if (idOf(qs.jenis_id)) w.add('k.jenis_id = ?', idOf(qs.jenis_id)); if (JK[qs.kelompok]) w.add('s.kelompok = ?', qs.kelompok); if (idOf(qs.asrama_id)) w.add('s.asrama_id = ?', idOf(qs.asrama_id));
      const st = qs.status || 'aktif'; if (st === 'aktif') w.add("p.status='aktif' AND s.status='aktif' AND NOT s.diarsipkan"); else if (st === 'nonaktif') w.add("p.status='aktif' AND (s.status<>'aktif' OR s.diarsipkan)"); else if (['pindah', 'keluar'].includes(st)) w.add('p.status = ?', st); filter.push('Status peserta: ' + (STP[st] || 'Semua'));
      const rows = await q(`${PES} ${w.sql} ORDER BY k.nama, s.nama LIMIT 5000`, w.params());
      rep.kolom = base.concat([{ k: 'nis', t: 'NIS', tipe: 'txt', w: 7 }, { k: 'nama', t: 'Nama', tipe: 'txt', w: 14 }, { k: 'jk', t: 'JK', tipe: 'txt', w: 4 }, { k: 'asrama', t: 'Asrama/Kamar', tipe: 'txt', w: 11 }, { k: 'jenis', t: 'Jenis pendidikan', tipe: 'txt', w: 11 }, { k: 'kelas', t: 'Kelas/kelompok', tipe: 'txt', w: 11 }, { k: 'mulai', t: 'Mulai', tipe: 'tgl', w: 8 }, { k: 'selesai', t: 'Selesai', tipe: 'tgl', w: 8 }, { k: 'stat', t: 'Status', tipe: 'txt', w: 8 }]);
      rep.rows = rows.map(r => ({ ...r, jk: JK[r.kelompok] || '', asrama: [r.asrama, r.kamar].filter(Boolean).join(' / '), stat: STP[r.status_tampil] || r.status_tampil })); rep.ringkasan = [['Jumlah baris peserta', rows.length, 'int'], ['Santri berbeda', new Set(rows.map(r => r.santri_id)).size, 'int']];
    } else if (jenis === 'kelas') {
      const w = U.where(); if (idOf(qs.jenis_id)) w.add('k.jenis_id = ?', idOf(qs.jenis_id)); if (idOf(qs.pengajar_id)) w.add('k.pengajar_id = ?', idOf(qs.pengajar_id)); if (qs.status === 'nonaktif') w.add('NOT k.aktif'); else w.add('k.aktif');
      const rows = await q(`SELECT k.nama, j.nama AS jenis, k.tingkat, pg.nama AS pengajar, k.kapasitas, pr.nama AS periode, k.keterangan, (SELECT COUNT(*)::int FROM edu_peserta p JOIN santri s ON s.id=p.santri_id WHERE p.kelas_id=k.id AND p.status='aktif' AND s.status='aktif' AND NOT s.diarsipkan) AS peserta FROM edu_kelas k JOIN edu_jenis j ON j.id=k.jenis_id LEFT JOIN pengajar pg ON pg.id=k.pengajar_id LEFT JOIN edu_periode pr ON pr.id=k.periode_id ${w.sql} ORDER BY j.nama, k.nama`, w.params());
      rep.kolom = base.concat([{ k: 'nama', t: 'Kelas/kelompok', tipe: 'txt', w: 12 }, { k: 'jenis', t: 'Jenis pendidikan', tipe: 'txt', w: 12 }, { k: 'tingkat', t: 'Tingkat', tipe: 'txt', w: 8 }, { k: 'pengajar', t: 'Pengajar', tipe: 'txt', w: 12 }, { k: 'peserta', t: 'Peserta aktif', tipe: 'txt', w: 7 }, { k: 'kapasitas', t: 'Kapasitas', tipe: 'txt', w: 7 }, { k: 'periode', t: 'Periode', tipe: 'txt', w: 9 }, { k: 'keterangan', t: 'Keterangan', tipe: 'txt', w: 14 }]);
      rep.rows = rows; rep.ringkasan = [['Jumlah kelas/kelompok', rows.length, 'int'], ['Total peserta aktif', rows.reduce((a, r) => a + r.peserta, 0), 'int']];
    } else if (jenis === 'jadwal') {
      const w = jadwalWhere(qs); const rows = await q(`${JDW} ${w.sql} ORDER BY j.hari, j.jam_mulai`, w.params());
      rep.kolom = base.concat([{ k: 'hari_t', t: 'Hari', tipe: 'txt', w: 6 }, { k: 'waktu', t: 'Jam', tipe: 'txt', w: 8 }, { k: 'nama', t: 'Kegiatan', tipe: 'txt', w: 14 }, { k: 'jenis', t: 'Jenis pendidikan', tipe: 'txt', w: 11 }, { k: 'kelas', t: 'Kelas/kelompok', tipe: 'txt', w: 11 }, { k: 'pengajar', t: 'Pengajar', tipe: 'txt', w: 12 }, { k: 'materi', t: 'Materi', tipe: 'txt', w: 10 }, { k: 'ruang', t: 'Ruang', tipe: 'txt', w: 8 }, { k: 'berlaku', t: 'Berlaku', tipe: 'txt', w: 12 }]);
      rep.rows = rows.map(r => ({ ...r, hari_t: HARI[r.hari], waktu: `${r.jam_mulai}–${r.jam_selesai}`, berlaku: [r.mulai ? tgl(r.mulai) : '', r.sampai ? 's.d. ' + tgl(r.sampai) : ''].filter(Boolean).join(' ') || 'Tanpa batas' })); rep.ringkasan = [['Jumlah jadwal', rows.length, 'int']];
      rep.catatan = [rep.catatan, 'Jadwal diisi Super Admin berdasarkan jadwal resmi pondok.'].filter(Boolean).join(' ');
    } else if (jenis === 'presensi') {
      const w = U.where(); w.add('NOT e.batal'); if (rep.dari) w.add('e.tanggal >= ?', rep.dari); if (rep.sampai) w.add('e.tanggal <= ?', rep.sampai); if (idOf(qs.kelas_id)) w.add('e.kelas_id = ?', idOf(qs.kelas_id)); if (idOf(qs.jenis_id)) w.add('e.jenis_id = ?', idOf(qs.jenis_id)); if (idOf(qs.pengajar_id)) w.add('e.pengajar_id = ?', idOf(qs.pengajar_id)); if (JK[qs.kelompok]) w.add('s.kelompok = ?', qs.kelompok); if (idOf(qs.asrama_id)) w.add('s.asrama_id = ?', idOf(qs.asrama_id));
      const s = U.str(qs.q || '', 80); if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(s.nama ILIKE ${ph} OR s.nis ILIKE ${ph})`); }
      const rows = await q(`SELECT e.tanggal::text AS tanggal, e.nama AS kegiatan, k.nama AS kelas, jn.nama AS jenis, s.nis, s.nama, s.kelompok, p.status, p.keterangan FROM edu_presensi p JOIN edu_sesi e ON e.id=p.sesi_id JOIN edu_kelas k ON k.id=e.kelas_id JOIN edu_jenis jn ON jn.id=e.jenis_id JOIN v_santri_edu s ON s.id=p.santri_id ${w.sql} ORDER BY e.tanggal, k.nama, s.nama LIMIT 5000`, w.params());
      rep.kolom = base.concat([{ k: 'tanggal', t: 'Tanggal', tipe: 'tgl', w: 8 }, { k: 'kegiatan', t: 'Kegiatan', tipe: 'txt', w: 12 }, { k: 'kelas', t: 'Kelas', tipe: 'txt', w: 10 }, { k: 'nis', t: 'NIS', tipe: 'txt', w: 7 }, { k: 'nama', t: 'Nama', tipe: 'txt', w: 14 }, { k: 'jk', t: 'JK', tipe: 'txt', w: 4 }, { k: 'status', t: 'Status', tipe: 'txt', w: 7 }, { k: 'keterangan', t: 'Keterangan', tipe: 'txt', w: 14 }]);
      rep.rows = rows.map(r => ({ ...r, jk: JK[r.kelompok] || '' })); const n = {}; rows.forEach(r => { n[r.status] = (n[r.status] || 0) + 1; }); rep.ringkasan = [['Jumlah catatan presensi', rows.length, 'int']].concat(Object.entries(n).map(([k, v]) => ['Status ' + k, v, 'int']));
      const rk = await rekapPresensi(q, f, 'kelas'); if (rk.length) rep.catatan = [rep.catatan, 'Rekap per kelas: ' + rk.map(r => `${r.nama} ${r.persen == null ? '-' : r.persen + '%'} hadir (${r.total})`).join('; ') + '.'].filter(Boolean).join(' ');
    } else if (jenis === 'presensi-pengajar') {
      if ((await setting(q, 'presensi_pengajar')) !== true) throw bad('Presensi pengajar belum diaktifkan di Pengaturan Pendidikan.', null, 409);
      const w = U.where(); w.add('NOT e.batal'); if (rep.dari) w.add('e.tanggal >= ?', rep.dari); if (rep.sampai) w.add('e.tanggal <= ?', rep.sampai); if (idOf(qs.pengajar_id)) w.add('p.pengajar_id = ?', idOf(qs.pengajar_id)); if (idOf(qs.kelas_id)) w.add('e.kelas_id = ?', idOf(qs.kelas_id)); if (idOf(qs.jenis_id)) w.add('e.jenis_id = ?', idOf(qs.jenis_id));
      const rows = await q(`SELECT e.tanggal::text AS tanggal, e.nama AS kegiatan, k.nama AS kelas, pg.nama AS pengajar, p.status, p.keterangan FROM edu_presensi_pengajar p JOIN edu_sesi e ON e.id=p.sesi_id JOIN edu_kelas k ON k.id=e.kelas_id JOIN pengajar pg ON pg.id=p.pengajar_id ${w.sql} ORDER BY e.tanggal, pg.nama LIMIT 5000`, w.params());
      rep.kolom = base.concat([{ k: 'tanggal', t: 'Tanggal', tipe: 'tgl', w: 9 }, { k: 'pengajar', t: 'Pengajar', tipe: 'txt', w: 14 }, { k: 'kegiatan', t: 'Kegiatan', tipe: 'txt', w: 14 }, { k: 'kelas', t: 'Kelas', tipe: 'txt', w: 10 }, { k: 'status', t: 'Status', tipe: 'txt', w: 8 }, { k: 'keterangan', t: 'Keterangan', tipe: 'txt', w: 14 }]); rep.rows = rows;
      const n = {}; rows.forEach(r => { n[r.status] = (n[r.status] || 0) + 1; }); rep.ringkasan = [['Jumlah catatan', rows.length, 'int']].concat(Object.entries(n).map(([k, v]) => ['Status ' + k, v, 'int'])); rep.catatan = [rep.catatan, 'Hanya administrasi pendidikan; bukan dasar penggajian.'].filter(Boolean).join(' ');
    } else if (jenis === 'evaluasi') {
      const w = nilaiWhere(qs); const rows = await q(`${NIL} ${w.sql} ORDER BY n.tanggal DESC, k.nama, s.nama LIMIT 5000`, w.params());
      rep.kolom = base.concat([{ k: 'tanggal', t: 'Tanggal', tipe: 'tgl', w: 8 }, { k: 'nis', t: 'NIS', tipe: 'txt', w: 7 }, { k: 'nama', t: 'Nama', tipe: 'txt', w: 13 }, { k: 'kelas', t: 'Kelas', tipe: 'txt', w: 10 }, { k: 'materi', t: 'Materi', tipe: 'txt', w: 10 }, { k: 'evaluasi', t: 'Evaluasi', tipe: 'txt', w: 8 }, { k: 'periode', t: 'Periode', tipe: 'txt', w: 8 }, { k: 'hasil', t: 'Nilai / capaian', tipe: 'txt', w: 10 }, { k: 'catatan', t: 'Catatan pengajar', tipe: 'txt', w: 14 }]);
      rep.rows = rows.map(r => ({ ...r, hasil: [r.nilai != null ? String(r.nilai) : '', r.capaian || ''].filter(Boolean).join(' · ') }));
      const angka = rows.filter(r => r.nilai != null); rep.ringkasan = [['Jumlah penilaian', rows.length, 'int'], ['Penilaian angka', angka.length, 'int']]; if (angka.length) rep.ringkasan.push(['Rata-rata nilai angka', (Math.round(angka.reduce((a, r) => a + r.nilai, 0) / angka.length * 100) / 100), 'int']);
      rep.catatan = [rep.catatan, 'Tidak ada batas kelulusan yang diterapkan sistem; penilaian mengikuti ketentuan pondok.'].filter(Boolean).join(' ');
    } else if (jenis === 'perkembangan') {
      const w = U.where(); w.add("((s.status='aktif' AND NOT s.diarsipkan) OR EXISTS (SELECT 1 FROM edu_peserta p0 WHERE p0.santri_id=s.id))"); const sq = U.str(qs.q || '', 80); if (sq) { const ph = w.push('%' + U.likeEsc(sq) + '%'); w.add(`(s.nama ILIKE ${ph} OR s.nis ILIKE ${ph})`); }
      if (JK[qs.kelompok]) w.add('s.kelompok = ?', qs.kelompok); if (idOf(qs.asrama_id)) w.add('s.asrama_id = ?', idOf(qs.asrama_id)); if (idOf(qs.kelas_id)) w.add('EXISTS (SELECT 1 FROM edu_peserta p1 WHERE p1.santri_id=s.id AND p1.kelas_id=?)', idOf(qs.kelas_id)); if (idOf(qs.jenis_id)) w.add('EXISTS (SELECT 1 FROM edu_peserta p2 JOIN edu_kelas k2 ON k2.id=p2.kelas_id WHERE p2.santri_id=s.id AND k2.jenis_id=?)', idOf(qs.jenis_id));
      const par = w.params(), rows = await q(`SELECT s.id, s.nis, s.nama, s.kelompok, s.status AS status_santri,
        (SELECT string_agg(DISTINCT k.nama, ', ') FROM edu_peserta p JOIN edu_kelas k ON k.id=p.kelas_id WHERE p.santri_id=s.id) AS kelas,
        (SELECT COUNT(*)::int FROM edu_presensi p JOIN edu_sesi e ON e.id=p.sesi_id WHERE p.santri_id=s.id AND NOT e.batal ${rep.dari ? `AND e.tanggal >= '${rep.dari}'` : ''} ${rep.sampai ? `AND e.tanggal <= '${rep.sampai}'` : ''}) AS n_presensi,
        (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE sp.dihitung_hadir) / NULLIF(COUNT(*), 0), 1)::float FROM edu_presensi p JOIN edu_sesi e ON e.id=p.sesi_id JOIN edu_status_presensi sp ON sp.id=p.status_id WHERE p.santri_id=s.id AND NOT e.batal ${rep.dari ? `AND e.tanggal >= '${rep.dari}'` : ''} ${rep.sampai ? `AND e.tanggal <= '${rep.sampai}'` : ''}) AS hadir,
        (SELECT COUNT(*)::int FROM edu_penilaian n WHERE n.santri_id=s.id AND NOT n.batal) AS n_nilai, (SELECT ROUND(AVG(n.nilai), 2)::float FROM edu_penilaian n WHERE n.santri_id=s.id AND NOT n.batal AND n.nilai IS NOT NULL) AS rata,
        (SELECT COUNT(*)::int FROM edu_catatan c WHERE c.santri_id=s.id AND NOT c.batal) AS n_catatan FROM v_santri_edu s ${w.sql} ORDER BY s.nama LIMIT 2000`, par);
      rep.kolom = base.concat([{ k: 'nis', t: 'NIS', tipe: 'txt', w: 7 }, { k: 'nama', t: 'Nama', tipe: 'txt', w: 14 }, { k: 'jk', t: 'JK', tipe: 'txt', w: 4 }, { k: 'kelas', t: 'Kelas/kelompok', tipe: 'txt', w: 14 }, { k: 'presensi', t: 'Kehadiran', tipe: 'txt', w: 10 }, { k: 'nilai', t: 'Penilaian', tipe: 'txt', w: 10 }, { k: 'n_catatan', t: 'Catatan', tipe: 'txt', w: 6 }, { k: 'stat', t: 'Status santri', tipe: 'txt', w: 8 }]);
      rep.rows = rows.map(r => ({ ...r, jk: JK[r.kelompok] || '', presensi: r.n_presensi ? `${r.hadir}% (${r.n_presensi} kegiatan)` : 'Belum ada', nilai: r.n_nilai ? `${r.n_nilai} nilai${r.rata != null ? `, rata-rata ${r.rata}` : ''}` : 'Belum ada', stat: r.status_santri === 'aktif' ? 'Aktif' : 'Alumni/nonaktif' })); rep.ringkasan = [['Jumlah santri', rows.length, 'int']];
    } else {
      const w = U.where(); w.add('NOT e.batal'); if (rep.dari) w.add('e.tanggal >= ?', rep.dari); if (rep.sampai) w.add('e.tanggal <= ?', rep.sampai); if (idOf(qs.jenis_id)) w.add('e.jenis_id = ?', idOf(qs.jenis_id)); if (idOf(qs.kelas_id)) w.add('e.kelas_id = ?', idOf(qs.kelas_id)); if (idOf(qs.pengajar_id)) w.add('e.pengajar_id = ?', idOf(qs.pengajar_id));
      const rows = await q(`SELECT to_char(e.tanggal,'YYYY-MM') AS bln, jn.nama AS jenis, COUNT(*)::int AS kegiatan, COUNT(DISTINCT e.kelas_id)::int AS kelas, (SELECT COUNT(*)::int FROM edu_presensi p WHERE p.sesi_id = ANY(array_agg(e.id))) AS presensi FROM edu_sesi e JOIN edu_jenis jn ON jn.id=e.jenis_id ${w.sql} GROUP BY 1, 2 ORDER BY 1 DESC, 2 LIMIT 1000`, w.params());
      rep.kolom = base.concat([{ k: 'periode', t: 'Bulan', tipe: 'txt', w: 10 }, { k: 'jenis', t: 'Jenis pendidikan', tipe: 'txt', w: 14 }, { k: 'kegiatan', t: 'Jumlah kegiatan', tipe: 'txt', w: 8 }, { k: 'kelas', t: 'Kelas terlibat', tipe: 'txt', w: 8 }, { k: 'presensi', t: 'Catatan presensi', tipe: 'txt', w: 8 }]);
      rep.rows = rows.map(r => ({ ...r, periode: `${BLN[+r.bln.slice(5) - 1]} ${r.bln.slice(0, 4)}` })); rep.ringkasan = [['Total kegiatan', rows.reduce((a, r) => a + r.kegiatan, 0), 'int']];
    }
    rep.rows.forEach((r, i) => { r._no = i + 1; }); return rep;
  }
  api.get('/pendidikan/laporan', mod, (req, res) => res.json({ jenis: Object.entries(LAPORAN).map(([id, judul]) => ({ id, judul })) }));
  api.get('/pendidikan/laporan/:jenis', mod, wrap(async (req, res) => {
    const fmt = ['pdf', 'xlsx'].includes(req.query.format) ? req.query.format : 'json', rep = await buat(req.params.jenis, req.query);
    if (fmt === 'json') { rep.rows = rep.rows.slice(0, 2000); return res.json(rep); }
    await logBy(req, 'unduh', 'pendidikan', `Mengunduh ${rep.judul} (${fmt.toUpperCase()})`);
    const nm = `pendidikan-${req.params.jenis}-${new Date().toISOString().slice(0, 10)}`.replace(/[^\w.-]/g, '');
    if (fmt === 'pdf') return send(res, await pdfLaporan(rep, req.user.username), 'application/pdf', nm + '.pdf');
    send(res, await xlsxLaporan(rep, req.user.username), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', nm + '.xlsx');
  }));
}
module.exports = { register, LAPORAN };
