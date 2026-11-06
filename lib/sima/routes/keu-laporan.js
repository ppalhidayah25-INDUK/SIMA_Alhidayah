'use strict';
// Laporan keuangan (pratinjau JSON, PDF, Excel) dan bukti transaksi (kuitansi pembayaran, bukti tabungan).
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const U = require('../util');
const { identitas: identitasI, kop: kopI } = require('../identitas');
const K = require('./keuangan');
const PONDOK = 'Pondok Pesantren Alhidayah Induk';
const idr = n => 'Rp' + Number(n).toLocaleString('id-ID');
const tglId = d => { if (!d) return ''; if (d instanceof Date) d = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${+dd} ${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][+m - 1]} ${y}`; };
const periodeId = p => /^\d{4}-\d{2}$/.test(p || '') ? tglId(p + '-01').replace(/^1 /, '') : (p || '');
const waktuId = ms => new Date(Number(ms) + 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 16) + ' WIB';

const LAPORAN = {
  pembayaran: 'Laporan Pembayaran Santri', tagihan: 'Laporan Tagihan', tunggakan: 'Laporan Tunggakan', lunas: 'Laporan Pembayaran Lunas', sebagian: 'Laporan Pembayaran Sebagian',
  tabungan: 'Laporan Tabungan Santri', setoran: 'Laporan Setoran Tabungan', penarikan: 'Laporan Penarikan Tabungan', 'kas-masuk': 'Laporan Pemasukan Kas', 'kas-keluar': 'Laporan Pengeluaran Kas',
  'saldo-kas': 'Laporan Saldo Kas (Buku Kas)', transaksi: 'Laporan Transaksi Berdasarkan Periode'
};
const C = {
  tgl: (k, t) => ({ k, t, tipe: 'tgl', w: 1.1 }), txt: (k, t, w = 1.5) => ({ k, t, tipe: 'txt', w }), rp: (k, t) => ({ k, t, tipe: 'rp', w: 1.2 }), no: () => ({ k: '_no', t: 'No', tipe: 'no', w: 0.4 })
};
const STATUS = { belum: 'Belum dibayar', sebagian: 'Dibayar sebagian', lunas: 'Lunas', dibatalkan: 'Dibatalkan', sah: 'Sah' };
let _buku;
const idOf = v => { const n = parseInt(v, 10); return Number.isSafeInteger(n) && n > 0 ? n : null; };

async function buat(q, jenis, qs) {
  if (!LAPORAN[jenis]) throw K.bad('Jenis laporan tidak dikenal.', null, 404);
  const needRange = jenis !== 'tunggakan' || (qs.periode && qs.periode !== 'semua');
  const r = K.rentang(jenis === 'tunggakan' && !needRange ? Object.assign({}, qs, { periode: 'semua' }) : qs);
  const out = { jenis, judul: LAPORAN[jenis], dari: r.dari, sampai: r.sampai, semua: r.periode === 'semua', filter: [], kolom: [], rows: [], ringkasan: [] };
  const w = U.where(), sumRp = k => out.rows.reduce((a, x) => a + Number(x[k] || 0), 0);
  const kat = idOf(qs.kategori_id);
  if (jenis === 'pembayaran' || jenis === 'lunas' || jenis === 'sebagian' || jenis === 'tagihan' || jenis === 'tunggakan') {
    if (jenis === 'pembayaran') {
      w.add('p.tanggal BETWEEN ' + w.push(r.dari) + ' AND ' + w.push(r.sampai)); if (kat) w.add('v.kategori_id = ?', kat); if (idOf(qs.metode_id)) w.add('p.metode_id = ?', idOf(qs.metode_id));
      if (['sah', 'dibatalkan'].includes(qs.status)) w.add('p.status = ?', qs.status);
      out.rows = await q(`SELECT p.tanggal::text AS tanggal, p.no_kuitansi, v.nis, v.santri, v.kategori, v.periode, p.nominal, p.metode, u.username AS petugas, p.status FROM keu_pembayaran p JOIN v_keu_tagihan v ON v.id=p.tagihan_id JOIN users u ON u.id=p.oleh ${w.sql} ORDER BY p.tanggal, p.id LIMIT 20000`, w.params());
      out.rows.forEach(x => { x.status = STATUS[x.status]; });
      out.kolom = [C.no(), C.tgl('tanggal', 'Tanggal'), C.txt('no_kuitansi', 'No. Kuitansi', 1.6), C.txt('nis', 'NIS', 1), C.txt('santri', 'Nama Santri', 2), C.txt('kategori', 'Jenis'), C.txt('periode', 'Periode', 1), C.rp('nominal', 'Nominal'), C.txt('metode', 'Metode', 1), C.txt('petugas', 'Petugas', 1), C.txt('status', 'Status', 1)];
      const sah = out.rows.filter(x => x.status === STATUS.sah).reduce((a, x) => a + Number(x.nominal), 0);
      out.ringkasan = [['Jumlah transaksi', out.rows.length, 'int'], ['Total pembayaran sah', sah, 'rp']];
    } else {
      if (jenis === 'tagihan' && !out.semua) w.add('v.dibuat >= ' + w.push(r.msDari) + ' AND v.dibuat < ' + w.push(r.msSampai));
      if (jenis === 'tagihan' || jenis === 'tunggakan') { if (!out.semua && jenis === 'tunggakan') w.add('v.dibuat >= ' + w.push(r.msDari) + ' AND v.dibuat < ' + w.push(r.msSampai)); }
      if (jenis === 'sebagian') { w.add("v.status_bayar = 'sebagian'"); if (!out.semua) w.add('v.dibuat >= ' + w.push(r.msDari) + ' AND v.dibuat < ' + w.push(r.msSampai)); }
      if (jenis === 'lunas') { w.add("v.status_bayar = 'lunas'"); if (!out.semua) w.add('v.tgl_bayar_terakhir BETWEEN ' + w.push(r.dari) + ' AND ' + w.push(r.sampai)); }
      if (jenis === 'tunggakan') w.add("v.status_bayar IN ('belum','sebagian')");
      if (kat) w.add('v.kategori_id = ?', kat); if (['putra', 'putri'].includes(qs.kelompok)) w.add('v.kelompok = ?', qs.kelompok);
      if (jenis === 'tagihan' && ['belum', 'sebagian', 'lunas', 'dibatalkan'].includes(qs.status)) w.add('v.status_bayar = ?', qs.status);
      out.rows = await q(`SELECT v.nis, v.santri, v.kelompok, v.asrama, v.kamar, v.kategori, v.periode, v.nominal, v.dibayar, v.sisa, v.status_bayar AS status, v.tgl_bayar_terakhir::text AS tgl_lunas FROM v_keu_tagihan v ${w.sql} ORDER BY v.santri, v.id LIMIT 20000`, w.params());
      out.rows.forEach(x => { x.status = STATUS[x.status]; x.kelompok = x.kelompok === 'putra' ? 'Putra' : 'Putri'; });
      out.kolom = [C.no(), C.txt('nis', 'NIS', 1), C.txt('santri', 'Nama Santri', 2), C.txt('kelompok', 'Kelompok', 0.9), C.txt('kategori', 'Jenis Tagihan'), C.txt('periode', 'Periode', 1), C.rp('nominal', 'Total Tagihan'), C.rp('dibayar', 'Dibayar'), C.rp('sisa', 'Sisa'), C.txt('status', 'Status', 1.2)];
      if (jenis === 'lunas') out.kolom.push(C.tgl('tgl_lunas', 'Tgl Lunas'));
      const act = out.rows.filter(x => x.status !== STATUS.dibatalkan);
      out.ringkasan = [['Jumlah tagihan', out.rows.length, 'int'], ['Total tagihan', act.reduce((a, x) => a + Number(x.nominal), 0), 'rp'], ['Total dibayar', act.reduce((a, x) => a + Number(x.dibayar), 0), 'rp'], ['Total sisa tagihan', act.reduce((a, x) => a + Number(x.sisa), 0), 'rp']];
    }
  } else if (jenis === 'tabungan') {
    if (['putra', 'putri'].includes(qs.kelompok)) w.add('v.kelompok = ?', qs.kelompok);
    const pd = w.push(r.dari), ps = w.push(r.sampai);
    out.rows = await q(`SELECT v.nis, v.nama AS santri, v.kelompok, v.status AS status_santri, rk.dibuka::text AS dibuka, rk.status AS rekening,
      COALESCE((SELECT SUM(nominal) FROM tabungan_transaksi t WHERE t.rekening_id=rk.id AND t.jenis='setoran' AND t.tanggal BETWEEN ${pd} AND ${ps}),0)::bigint AS setoran,
      COALESCE((SELECT SUM(nominal) FROM tabungan_transaksi t WHERE t.rekening_id=rk.id AND t.jenis='penarikan' AND t.tanggal BETWEEN ${pd} AND ${ps}),0)::bigint AS penarikan,
      COALESCE((SELECT SUM(${K.TAB_EFEK}) FROM tabungan_transaksi t WHERE t.rekening_id=rk.id AND t.tanggal <= ${ps}),0)::bigint AS saldo
      FROM tabungan_rekening rk JOIN v_santri_keu v ON v.id=rk.santri_id ${w.sql} ORDER BY v.nama LIMIT 20000`, w.params());
    out.rows.forEach(x => { x.kelompok = x.kelompok === 'putra' ? 'Putra' : 'Putri'; x.status_santri = x.status_santri === 'aktif' ? 'Aktif' : 'Alumni'; x.rekening = x.rekening === 'aktif' ? 'Aktif' : 'Ditutup'; });
    out.kolom = [C.no(), C.txt('nis', 'NIS', 1), C.txt('santri', 'Nama Santri', 2), C.txt('kelompok', 'Kelompok', 0.9), C.txt('status_santri', 'Status Santri', 1), C.tgl('dibuka', 'Dibuka'), C.rp('setoran', 'Setoran (periode)'), C.rp('penarikan', 'Penarikan (periode)'), C.rp('saldo', 'Saldo per ' + tglId(r.sampai))];
    out.ringkasan = [['Jumlah rekening', out.rows.length, 'int'], ['Total setoran periode', sumRp('setoran'), 'rp'], ['Total penarikan periode', sumRp('penarikan'), 'rp'], ['Total saldo tabungan', sumRp('saldo'), 'rp']];
  } else if (jenis === 'setoran' || jenis === 'penarikan') {
    w.add('t.tanggal BETWEEN ' + w.push(r.dari) + ' AND ' + w.push(r.sampai)); w.add('t.jenis IN (' + w.push(jenis) + ', ' + w.push('pembalikan_' + jenis) + ')');
    if (['putra', 'putri'].includes(qs.kelompok)) w.add('v.kelompok = ?', qs.kelompok);
    out.rows = await q(`SELECT t.tanggal::text AS tanggal, t.no_transaksi, v.nis, v.nama AS santri, t.jenis, t.nominal, t.metode, t.keterangan, u.username AS petugas FROM tabungan_transaksi t JOIN v_santri_keu v ON v.id=t.santri_id JOIN users u ON u.id=t.oleh ${w.sql} ORDER BY t.tanggal, t.id LIMIT 20000`, w.params());
    let net = 0; out.rows.forEach(x => { const neg = x.jenis.startsWith('pembalikan'); net += neg ? -Number(x.nominal) : Number(x.nominal); x.jenis = neg ? 'Pembalikan' : (jenis === 'setoran' ? 'Setoran' : 'Penarikan'); });
    out.kolom = [C.no(), C.tgl('tanggal', 'Tanggal'), C.txt('no_transaksi', 'No. Transaksi', 1.6), C.txt('nis', 'NIS', 1), C.txt('santri', 'Nama Santri', 2), C.txt('jenis', 'Jenis', 1), C.rp('nominal', 'Nominal'), C.txt('metode', 'Metode', 1), C.txt('keterangan', 'Keterangan', 2), C.txt('petugas', 'Petugas', 1)];
    out.ringkasan = [['Jumlah transaksi', out.rows.length, 'int'], [jenis === 'setoran' ? 'Total setoran (setelah pembalikan)' : 'Total penarikan (setelah pembalikan)', net, 'rp']];
  } else if (jenis === 'kas-masuk' || jenis === 'kas-keluar') {
    const j = jenis === 'kas-masuk' ? 'masuk' : 'keluar';
    w.add('k.tanggal BETWEEN ' + w.push(r.dari) + ' AND ' + w.push(r.sampai)); w.add('k.jenis IN (' + w.push(j) + ', ' + w.push('pembalikan_' + j) + ')'); if (kat) w.add('k.kategori_id = ?', kat);
    out.rows = await q(`SELECT k.tanggal::text AS tanggal, k.no_transaksi, k.kategori, k.pihak, k.nominal, k.keterangan, k.jenis, u.username AS petugas, (k.berkas_id IS NOT NULL) AS bukti FROM kas_transaksi k JOIN users u ON u.id=k.oleh ${w.sql} ORDER BY k.tanggal, k.id LIMIT 20000`, w.params());
    let net = 0; out.rows.forEach(x => { const neg = x.jenis.startsWith('pembalikan'); net += neg ? -Number(x.nominal) : Number(x.nominal); x.pihak = (neg ? '[Pembalikan] ' : '') + (x.pihak || ''); x.bukti = x.bukti ? 'Ada' : '-'; });
    out.kolom = [C.no(), C.tgl('tanggal', 'Tanggal'), C.txt('no_transaksi', 'No. Transaksi', 1.5), C.txt('kategori', 'Kategori', 1.3), C.txt('pihak', j === 'masuk' ? 'Sumber' : 'Tujuan', 2), C.rp('nominal', 'Nominal'), C.txt('keterangan', 'Keterangan', 2), C.txt('bukti', 'Bukti', 0.7), C.txt('petugas', 'Petugas', 1)];
    out.ringkasan = [['Jumlah transaksi', out.rows.length, 'int'], [j === 'masuk' ? 'Total pemasukan kas (setelah pembalikan)' : 'Total pengeluaran kas (setelah pembalikan)', net, 'rp']];
  } else if (jenis === 'saldo-kas') {
    const b = await _buku(q, qs);
    out.rows = b.rows.map(x => ({ tanggal: x.tanggal, no_transaksi: x.no_transaksi, keterangan: [x.kategori, x.pihak, x.keterangan].filter(Boolean).join(' — '), masuk: x.masuk, keluar: x.keluar, saldo: x.saldo }));
    out.kolom = [C.no(), C.tgl('tanggal', 'Tanggal'), C.txt('no_transaksi', 'No. Transaksi', 1.5), C.txt('keterangan', 'Keterangan', 3.5), C.rp('masuk', 'Pemasukan'), C.rp('keluar', 'Pengeluaran'), C.rp('saldo', 'Saldo')];
    out.ringkasan = [['Saldo awal periode', b.saldo_awal, 'rp'], ['Total pemasukan', b.pemasukan, 'rp'], ['Total pengeluaran', b.pengeluaran, 'rp'], ['Saldo akhir', b.saldo_akhir, 'rp']];
  } else if (jenis === 'transaksi') {
    const jt = ['pembayaran', 'tabungan', 'kas'].includes(qs.jenis_transaksi) ? qs.jenis_transaksi : null, kt = U.str(qs.kategori || '', 60);
    out.rows = await q(`SELECT * FROM (
      SELECT p.tanggal::text AS tanggal, p.dibuat, p.no_kuitansi AS no_transaksi, 'Pembayaran santri' AS buku, 'Pembayaran' AS jenis, v.kategori AS kategori, v.santri || ' (' || COALESCE(v.nis,'-') || ') — ' || v.periode AS uraian, p.nominal::bigint AS nominal, u.username AS petugas FROM keu_pembayaran p JOIN v_keu_tagihan v ON v.id=p.tagihan_id JOIN users u ON u.id=p.oleh WHERE p.status='sah'
      UNION ALL SELECT t.tanggal::text, t.dibuat, t.no_transaksi, 'Tabungan santri', CASE t.jenis WHEN 'setoran' THEN 'Setoran' WHEN 'penarikan' THEN 'Penarikan' ELSE 'Pembalikan' END, 'Tabungan', s.nama || ' (' || COALESCE(s.nis,'-') || ')', t.nominal::bigint, u.username FROM tabungan_transaksi t JOIN v_santri_keu s ON s.id=t.santri_id JOIN users u ON u.id=t.oleh
      UNION ALL SELECT k.tanggal::text, k.dibuat, k.no_transaksi, 'Kas pondok', CASE k.jenis WHEN 'masuk' THEN 'Pemasukan' WHEN 'keluar' THEN 'Pengeluaran' WHEN 'saldo_awal' THEN 'Saldo awal' ELSE 'Pembalikan' END, k.kategori, COALESCE(k.pihak,'') || CASE WHEN k.keterangan IS NULL THEN '' ELSE ' — ' || k.keterangan END, k.nominal::bigint, u.username FROM kas_transaksi k JOIN users u ON u.id=k.oleh
    ) x WHERE x.tanggal BETWEEN $1 AND $2 AND ($3::text IS NULL OR (CASE $3 WHEN 'pembayaran' THEN x.buku='Pembayaran santri' WHEN 'tabungan' THEN x.buku='Tabungan santri' ELSE x.buku='Kas pondok' END)) AND ($4::text IS NULL OR x.kategori ILIKE $4) ORDER BY x.tanggal, x.dibuat LIMIT 20000`,
      [r.dari, r.sampai, jt, kt ? '%' + U.likeEsc(kt) + '%' : null]);
    out.kolom = [C.no(), C.tgl('tanggal', 'Tanggal'), C.txt('no_transaksi', 'No. Transaksi', 1.5), C.txt('buku', 'Buku', 1.3), C.txt('jenis', 'Jenis', 1), C.txt('kategori', 'Kategori', 1.2), C.txt('uraian', 'Uraian', 3), C.rp('nominal', 'Nominal'), C.txt('petugas', 'Petugas', 1)];
    out.ringkasan = [['Jumlah transaksi', out.rows.length, 'int'], ['Pembayaran santri', out.rows.filter(x => x.buku === 'Pembayaran santri').reduce((a, x) => a + Number(x.nominal), 0), 'rp'], ['Tabungan (nominal transaksi)', out.rows.filter(x => x.buku === 'Tabungan santri').reduce((a, x) => a + Number(x.nominal), 0), 'rp'], ['Kas pondok (nominal transaksi)', out.rows.filter(x => x.buku === 'Kas pondok').reduce((a, x) => a + Number(x.nominal), 0), 'rp']];
    out.catatan = 'Tiga buku dihitung terpisah dan tidak dijumlahkan menjadi satu saldo.';
  }
  out.rows.forEach((x, i) => { x._no = i + 1; });
  out.filter.push(out.semua ? 'Seluruh periode' : `Periode: ${tglId(r.dari)} s.d. ${tglId(r.sampai)}`);
  return out;
}
const fmtCell = (c, v) => v == null || v === '' ? '' : c.tipe === 'rp' ? idr(v) : c.tipe === 'tgl' ? tglId(v) : String(v);

function pdfLaporan(rep, oleh) {
  const PD = rep.pondok || PONDOK, doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32, bufferPages: true, info: { Title: rep.judul, Author: PD } }), bufs = [];
  doc.on('data', b => bufs.push(b));
  const L = 32, W = doc.page.width - 64, tot = rep.kolom.reduce((a, c) => a + c.w, 0), cw = rep.kolom.map(c => W * c.w / tot);
  const head = () => {
    doc.font('Helvetica-Bold').fontSize(13).text(PD, L, 32, { width: W }); if (rep.alamat) doc.font('Helvetica').fontSize(8).text(rep.alamat, { width: W }); doc.font('Helvetica-Bold').fontSize(11).text(rep.judul, { width: W });
    doc.font('Helvetica').fontSize(8.5).fillColor('#444').text(rep.filter.join('  |  '), { width: W }); doc.text(`Dicetak ${waktuId(Date.now())} oleh ${oleh}`, { width: W }); doc.fillColor('#000').moveDown(0.6);
  };
  const rowDraw = (cells, y, bold, fill) => {
    const h = 15; if (fill) doc.rect(L, y - 2, W, h).fill(fill).fillColor('#000'); doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.8);
    let x = L; rep.kolom.forEach((c, i) => { doc.text(cells[i], x + 2, y + 1, { width: cw[i] - 4, height: 11, ellipsis: true, lineBreak: false, align: c.tipe === 'rp' ? 'right' : 'left' }); x += cw[i]; });
    return y + h;
  };
  head(); let y = doc.y; y = rowDraw(rep.kolom.map(c => c.t), y, true, '#DDE8E1');
  if (!rep.rows.length) doc.font('Helvetica-Oblique').fontSize(9).text('Tidak ada data pada filter ini.', L, y + 6);
  rep.rows.forEach((r, i) => {
    if (y > doc.page.height - 70) { doc.addPage(); head(); y = doc.y; y = rowDraw(rep.kolom.map(c => c.t), y, true, '#DDE8E1'); }
    y = rowDraw(rep.kolom.map(c => fmtCell(c, r[c.k])), y, false, i % 2 ? '#F5F7F5' : null);
  });
  y += 10; if (y > doc.page.height - 100) { doc.addPage(); y = 40; }
  doc.font('Helvetica-Bold').fontSize(9).text('Ringkasan', L, y); y += 14;
  rep.ringkasan.forEach(s => { doc.font('Helvetica').fontSize(9).text(s[0], L, y, { width: 260 }); doc.font('Helvetica-Bold').text(s[2] === 'rp' ? idr(s[1]) : String(s[1]), L + 260, y, { width: 140, align: 'right' }); y += 13; });
  if (rep.catatan) doc.font('Helvetica-Oblique').fontSize(8).text(rep.catatan, L, y + 4, { width: W });
  const hal = doc.bufferedPageRange();
  for (let i = 0; i < hal.count; i++) { doc.switchToPage(hal.start + i); doc.font('Helvetica').fontSize(7.5).fillColor('#666').text(`${PD} · ${rep.judul} · Halaman ${i + 1} dari ${hal.count}`, L, doc.page.height - 26, { width: W, align: 'center', lineBreak: false }); }
  doc.end();
  return new Promise(res => doc.on('end', () => res(Buffer.concat(bufs))));
}
async function xlsxLaporan(rep, oleh) {
  const PD = rep.pondok || PONDOK, wb = new ExcelJS.Workbook(); wb.creator = PD; const ws = wb.addWorksheet(rep.judul.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  ws.addRow([PD]).font = { bold: true, size: 13 }; if (rep.alamat) ws.addRow([rep.alamat]); ws.addRow([rep.judul]).font = { bold: true, size: 11 }; ws.addRow([rep.filter.join(' | ')]); ws.addRow([`Dicetak ${waktuId(Date.now())} oleh ${oleh}`]); ws.addRow([]);
  const hr = ws.addRow(rep.kolom.map(c => c.t)); hr.font = { bold: true }; hr.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDE8E1' } }; c.border = { bottom: { style: 'thin' } }; });
  rep.rows.forEach(r => ws.addRow(rep.kolom.map(c => c.tipe === 'rp' ? (r[c.k] == null ? null : Number(r[c.k])) : c.tipe === 'tgl' ? (r[c.k] ? tglId(r[c.k]) : '') : (r[c.k] == null ? '' : r[c.k]))));
  rep.kolom.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = Math.max(10, Math.round(c.w * 14)); if (c.tipe === 'rp') col.numFmt = '"Rp"#,##0'; });
  ws.addRow([]); ws.addRow(['Ringkasan']).font = { bold: true };
  rep.ringkasan.forEach(s => { const row = ws.addRow([s[0], s[2] === 'rp' ? Number(s[1]) : s[1]]); if (s[2] === 'rp') row.getCell(2).numFmt = '"Rp"#,##0'; });
  if (rep.catatan) ws.addRow([rep.catatan]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---- Bukti transaksi (A5 lanskap) ----
function pdfBukti(d) {
  const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 30, info: { Title: d.judul + ' ' + d.nomor, Author: PONDOK } }), bufs = []; doc.on('data', b => bufs.push(b));
  const W = doc.page.width - 60;
  doc.font('Helvetica-Bold').fontSize(14).text(PONDOK, 30, 30, { width: W, align: 'center' }); doc.fontSize(11).text(d.judul, { width: W, align: 'center' });
  doc.moveTo(30, doc.y + 4).lineTo(30 + W, doc.y + 4).lineWidth(1).stroke('#0B6B4A'); doc.moveDown(0.8);
  let y = doc.y; const row = (a, b, bold) => { doc.font('Helvetica').fontSize(9.5).fillColor('#444').text(a, 30, y, { width: 120 }); doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#000').text(': ' + b, 150, y, { width: W - 120 }); y = Math.max(y + 15, doc.y + 2); };
  d.baris.forEach(([a, b, bold]) => row(a, b, bold));
  y += 10; doc.font('Helvetica').fontSize(9).text('Petugas penerima', 30 + W - 160, y, { width: 160, align: 'center' }); doc.text(d.petugas, 30 + W - 160, y + 42, { width: 160, align: 'center' });
  doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#666').text(`Dicetak dari SIMA Alhidayah — ${waktuId(Date.now())}`, 30, doc.page.height - 44, { width: W - 170 });
  if (d.batal) { doc.save().rotate(-20, { origin: [doc.page.width / 2, doc.page.height / 2] }).font('Helvetica-Bold').fontSize(56).fillColor('#B3261E').opacity(0.22).text('DIBATALKAN', 0, doc.page.height / 2 - 30, { width: doc.page.width, align: 'center' }).restore(); }
  doc.end(); return new Promise(res => doc.on('end', () => res(Buffer.concat(bufs))));
}

function register(api, { db, logBy, ah }) {
  const { fin, mod, idOf: id_, bukuKas } = api.locals; _buku = bukuKas;
  const send = (res, buf, type, name) => res.set({ 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Length': buf.length }).send(buf);
  api.get('/keuangan/laporan', mod, (req, res) => res.json({ jenis: Object.entries(LAPORAN).map(([id, judul]) => ({ id, judul })) }));
  api.get('/keuangan/laporan/:jenis', mod, ah(async (req, res) => {
    const fmt = ['pdf', 'xlsx'].includes(req.query.format) ? req.query.format : 'json';
    const rep = await fin(req, q => buat(q, req.params.jenis, req.query)); Object.assign(rep, kopI(await identitasI(db.q.bind(db))));
    if (fmt === 'json') { rep.rows = rep.rows.slice(0, 2000); return res.json(rep); }
    await logBy(req, 'unduh', 'keuangan', `Mengunduh ${rep.judul} (${fmt.toUpperCase()})`);
    const base = `${req.params.jenis}-${rep.dari}_${rep.sampai}`.replace(/[^\w.-]/g, '');
    if (fmt === 'pdf') return send(res, await pdfLaporan(rep, req.user.username), 'application/pdf', base + '.pdf');
    send(res, await xlsxLaporan(rep, req.user.username), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base + '.xlsx');
  }));
  // buku kas versi unduh memakai laporan 'saldo-kas'

  async function kuitansi(q, id) {
    const p = (await q(`SELECT p.*, p.tanggal::text AS tgl, v.nis, v.santri, v.kategori, v.periode, v.nama AS tagihan, v.nominal AS total_tagihan, u.username, u.nama AS petugas_nama FROM keu_pembayaran p JOIN v_keu_tagihan v ON v.id=p.tagihan_id JOIN users u ON u.id=p.oleh WHERE p.id=$1`, [id]))[0];
    if (!p) return null;
    const jt = Number((await q("SELECT COALESCE(SUM(nominal),0) AS n FROM keu_pembayaran WHERE tagihan_id=$1 AND status='sah' AND id<=$2", [p.tagihan_id, id]))[0].n);
    return { judul: 'KUITANSI PEMBAYARAN', nomor: p.no_kuitansi, batal: p.status === 'dibatalkan', petugas: p.petugas_nama || p.username, id: p.id, pondok: PONDOK, tanggal: p.tgl, nis: p.nis, santri: p.santri, jenis: p.kategori, periode: p.periode, tagihan: p.tagihan, total_tagihan: Number(p.total_tagihan), nominal: Number(p.nominal), metode: p.metode, sisa: Number(p.sisa_setelah), keterangan: p.keterangan, status: p.status, batal_alasan: p.batal_alasan,
      baris: [['Nomor kuitansi', p.no_kuitansi, true], ['Tanggal transaksi', tglId(p.tgl)], ['NIS', p.nis || 'Belum diisi'], ['Nama santri', p.santri, true], ['Jenis pembayaran', p.kategori], ['Periode pembayaran', periodeId(p.periode)], ['Total tagihan', idr(p.total_tagihan)], ['Nominal pembayaran', idr(p.nominal), true], ['Metode pembayaran', p.metode], ...(Number(p.sisa_setelah) > 0 ? [['Sisa tagihan', idr(p.sisa_setelah)]] : [['Status tagihan', 'LUNAS']]), ...(p.keterangan ? [['Keterangan', p.keterangan]] : []), ...(p.status === 'dibatalkan' ? [['Status', 'DIBATALKAN: ' + p.batal_alasan]] : [])] };
  }
  async function buktiTab(q, id) {
    const t = (await q('SELECT t.*, t.tanggal::text AS tgl, v.nis, v.nama AS santri, u.username, u.nama AS petugas_nama FROM tabungan_transaksi t JOIN v_santri_keu v ON v.id=t.santri_id JOIN users u ON u.id=t.oleh WHERE t.id=$1', [id]))[0];
    if (!t) return null; const jn = { setoran: 'BUKTI SETORAN TABUNGAN', penarikan: 'BUKTI PENARIKAN TABUNGAN' }[t.jenis] || 'BUKTI PEMBALIKAN TABUNGAN';
    return { judul: jn, nomor: t.no_transaksi, batal: false, petugas: t.petugas_nama || t.username, id: t.id, pondok: PONDOK, tanggal: t.tgl, nis: t.nis, santri: t.santri, jenis: t.jenis, nominal: Number(t.nominal), saldo_sebelum: Number(t.saldo_sebelum), saldo_sesudah: Number(t.saldo_sesudah), keterangan: t.keterangan,
      baris: [['Nomor transaksi', t.no_transaksi, true], ['Tanggal', tglId(t.tgl)], ['NIS', t.nis || 'Belum diisi'], ['Nama santri', t.santri, true], ['Jenis transaksi', t.jenis.replace('_', ' ')], ['Nominal', idr(t.nominal), true], ...(t.metode ? [['Metode', t.metode]] : []), ['Saldo sebelum', idr(t.saldo_sebelum)], ['Saldo sesudah', idr(t.saldo_sesudah), true], ...(t.keterangan ? [['Keterangan', t.keterangan]] : []), ...(t.alasan ? [['Alasan pembalikan', t.alasan]] : [])] };
  }
  for (const [path, fn] of [['kuitansi', kuitansi], ['tabungan-bukti', buktiTab]]) {
    api.get(`/keuangan/${path}/:id(\\d+)`, mod, ah(async (req, res) => { const d = await fin(req, q => fn(q, id_(req.params.id))); if (!d) return res.status(404).json({ error: 'Bukti tidak ditemukan.' }); res.json(d); }));
    api.get(`/keuangan/${path}/:id(\\d+).pdf`, mod, ah(async (req, res) => {
      const d = await fin(req, q => fn(q, id_(req.params.id))); if (!d) return res.status(404).json({ error: 'Bukti tidak ditemukan.' });
      await logBy(req, 'unduh', 'keuangan', `Mengunduh ${d.judul.toLowerCase()} ${d.nomor}`); send(res, await pdfBukti(d), 'application/pdf', d.nomor + '.pdf');
    }));
  }
}
module.exports = { register, buat, LAPORAN, pdfLaporan, xlsxLaporan };
