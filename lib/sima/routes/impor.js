'use strict';
// Tahap 8: impor / migrasi data asli (Excel .xlsx atau CSV). Alur: template -> unggah -> ANALISIS (validasi, duplikat, relasi, pratinjau)
// -> konfirmasi -> impor ATOMIK (satu transaksi) -> verifikasi -> riwayat. Tidak pernah menimpa/menghapus data lama:
// baris yang duplikat dilewati, bukan diperbarui. Hanya Super Admin. Dokumen sensitif (foto/KK) TIDAK lewat file ini.
const crypto = require('crypto');
const { Readable } = require('stream');
const ExcelJS = require('exceljs');
const U = require('../util');

const err = (http, message, fields) => Object.assign(new Error(message), { http, fields });
const MAX_BYTES = 2.5 * 1024 * 1024, MAX_BARIS = 5000, MAX_MASALAH = 3000, KADALUARSA = 24 * 3600 * 1000;
const PHONE = /^[0-9+()\-\s]{6,20}$/, ORTU = ['hidup', 'meninggal', 'tidak_diketahui'];
const NISRE = /^[A-Za-z0-9./-]+$/;

// ---------- definisi kolom ----------
const c = (k, t, o) => Object.assign({ k, t }, o);
const KOL_SANTRI = [
  c('nis', 'NIS', { wajib: true, fmt: 'Teks, unik. Huruf/angka/. / -', contoh: '(NIS asli pondok)', teks: true, spec: ['str', 'NIS', { required: true, max: 30, re: NISRE, msg: 'NIS hanya boleh huruf, angka, titik, garis miring, strip.' }] }),
  c('nama', 'Nama Lengkap', { wajib: true, fmt: 'Teks 2–100 karakter', contoh: '(nama asli)', spec: ['str', 'Nama lengkap', { required: true, min: 2, max: 100 }] }),
  c('tempat_lahir', 'Tempat Lahir', { fmt: 'Teks', spec: ['str', 'Tempat lahir', { max: 80 }] }),
  c('tanggal_lahir', 'Tanggal Lahir', { fmt: 'YYYY-MM-DD atau DD/MM/YYYY', contoh: '2010-05-17', tgl: true, spec: ['date', 'Tanggal lahir', { notFuture: true }] }),
  c('alamat', 'Alamat', { fmt: 'Teks', spec: ['text', 'Alamat', { max: 400 }] }),
  c('telepon', 'Telepon', { fmt: 'Angka, + - ( ). Format kolom sebagai Teks', teks: true, spec: ['str', 'Telepon', { max: 20, re: PHONE, msg: 'Telepon hanya angka, spasi, +, -, ( ).' }] }),
  c('nama_ayah', 'Nama Ayah', { spec: ['str', 'Nama ayah', { max: 100 }] }), c('pekerjaan_ayah', 'Pekerjaan Ayah', { spec: ['str', 'Pekerjaan ayah', { max: 100 }] }),
  c('status_ayah', 'Status Ayah', { fmt: 'hidup / meninggal / tidak_diketahui', enum: ORTU, spec: ['enum', 'Status ayah', { values: ORTU }] }),
  c('nama_ibu', 'Nama Ibu', { spec: ['str', 'Nama ibu', { max: 100 }] }), c('pekerjaan_ibu', 'Pekerjaan Ibu', { spec: ['str', 'Pekerjaan ibu', { max: 100 }] }),
  c('status_ibu', 'Status Ibu', { fmt: 'hidup / meninggal / tidak_diketahui', enum: ORTU, spec: ['enum', 'Status ibu', { values: ORTU }] }),
  c('nama_wali', 'Nama Wali', { spec: ['str', 'Nama wali', { max: 100 }] }), c('wali_hubungan', 'Hubungan Wali', { spec: ['str', 'Hubungan wali', { max: 60 }] }),
  c('wali_telepon', 'Telepon Wali', { teks: true, spec: ['str', 'Telepon wali', { max: 20, re: PHONE, msg: 'Telepon hanya angka, spasi, +, -, ( ).' }] }),
  c('tanggal_masuk', 'Tanggal Masuk', { fmt: 'YYYY-MM-DD atau DD/MM/YYYY', tgl: true, spec: ['date', 'Tanggal masuk', { notFuture: true }] }),
  c('tahun_masuk', 'Tahun Masuk', { fmt: 'Angka 4 digit', contoh: '2022', spec: ['int', 'Tahun masuk', { min: 1900, max: 2200 }] }),
  c('pendidikan_formal', 'Pendidikan Formal', { spec: ['str', 'Pendidikan formal', { max: 120 }] }), c('lembaga_pendidikan', 'Lembaga Pendidikan', { spec: ['str', 'Lembaga pendidikan', { max: 150 }] }),
  c('program_pesantren', 'Program Pesantren', { spec: ['str', 'Program pesantren', { max: 150 }] })
];
const KOL_SANTRI_AKTIF = KOL_SANTRI.concat([c('asrama', 'Asrama', { fmt: 'Nama asrama yang SUDAH ada (opsional)', ref: true }), c('kamar', 'Kamar', { fmt: 'Nama kamar yang SUDAH ada di asrama tsb (opsional)', ref: true })]);
const KOL_ALUMNI = KOL_SANTRI.concat([
  c('status_alumni', 'Status Alumni', { wajib: true, fmt: 'lulus / berhenti', enum: ['lulus', 'berhenti'], spec: ['enum', 'Status alumni', { required: true, values: ['lulus', 'berhenti'] }] }),
  c('tahun_keluar', 'Tahun Keluar', { wajib: true, fmt: 'Angka 4 digit', spec: ['int', 'Tahun keluar', { min: 1900, max: 2200 }] }),
  c('tanggal_keluar', 'Tanggal Keluar', { tgl: true, fmt: 'YYYY-MM-DD atau DD/MM/YYYY', spec: ['date', 'Tanggal keluar', { notFuture: true }] }),
  c('keterangan_keluar', 'Keterangan Keluar', { spec: ['text', 'Keterangan keluar', { max: 500 }] }),
  c('program_terakhir', 'Program Terakhir', { spec: ['str', 'Program terakhir', { max: 150 }] }), c('asrama_terakhir', 'Asrama Terakhir', { spec: ['str', 'Asrama terakhir', { max: 150 }] }),
  c('catatan_alumni', 'Catatan Alumni', { spec: ['text', 'Catatan alumni', { max: 1000 }] })
]);
const KOL_PENGURUS = [
  c('nama', 'Nama', { wajib: true, spec: ['str', 'Nama', { required: true, min: 2, max: 100 }] }),
  c('jabatan', 'Jabatan', { wajib: true, fmt: 'Nama jabatan yang SUDAH ada pada kelompok ini', ref: true }),
  c('divisi', 'Divisi', { fmt: 'Nama divisi yang sudah ada (opsional)', ref: true }), c('periode', 'Periode', { fmt: 'Nama periode yang sudah ada (opsional)', ref: true }),
  c('tugas', 'Tugas', { spec: ['text', 'Tugas', { max: 500 }] }),
  c('tanggal_mulai', 'Tanggal Mulai', { tgl: true, fmt: 'YYYY-MM-DD atau DD/MM/YYYY', spec: ['date', 'Tanggal mulai', {}] }),
  c('tanggal_selesai', 'Tanggal Selesai', { tgl: true, fmt: 'YYYY-MM-DD atau DD/MM/YYYY', spec: ['date', 'Tanggal selesai', {}] }),
  c('keterangan', 'Keterangan', { spec: ['text', 'Keterangan', { max: 500 }] })
];
const KOL_PENGAJAR = [
  c('nama', 'Nama', { wajib: true, spec: ['str', 'Nama', { required: true, min: 2, max: 100 }] }), c('bidang', 'Bidang', { spec: ['str', 'Bidang', { max: 120 }] }),
  c('lembaga', 'Lembaga', { spec: ['str', 'Lembaga', { max: 150 }] }), c('kontak', 'Kontak', { teks: true, spec: ['str', 'Kontak', { max: 60 }] }),
  c('alamat', 'Alamat', { spec: ['text', 'Alamat', { max: 400 }] }), c('tanggal_mulai', 'Tanggal Mulai', { tgl: true, fmt: 'YYYY-MM-DD atau DD/MM/YYYY', spec: ['date', 'Tanggal mulai', {}] }),
  c('keterangan', 'Keterangan', { spec: ['text', 'Keterangan', { max: 500 }] })
];
const KOL_ASRAMA = [
  c('jenis', 'Jenis', { wajib: true, fmt: 'putra / putri', enum: ['putra', 'putri'], spec: ['enum', 'Jenis', { required: true, values: ['putra', 'putri'] }] }),
  c('nama', 'Nama Asrama', { wajib: true, spec: ['str', 'Nama asrama', { required: true, min: 1, max: 100 }] }),
  c('status', 'Status', { fmt: 'aktif / nonaktif (kosong = aktif)', enum: ['aktif', 'nonaktif'], spec: ['enum', 'Status', { values: ['aktif', 'nonaktif'] }] }),
  c('keterangan', 'Keterangan', { spec: ['text', 'Keterangan', { max: 300 }] })
];
const KOL_KAMAR = [
  c('asrama', 'Asrama', { wajib: true, fmt: 'Nama asrama yang SUDAH ada', ref: true }), c('jenis_asrama', 'Jenis Asrama', { fmt: 'putra / putri (isi bila nama asrama sama pada kedua kelompok)', enum: ['putra', 'putri'], spec: ['enum', 'Jenis asrama', { values: ['putra', 'putri'] }] }),
  c('nama', 'Nama Kamar', { wajib: true, spec: ['str', 'Nama kamar', { required: true, min: 1, max: 60 }] }),
  c('kapasitas', 'Kapasitas', { wajib: true, fmt: 'Angka 1–200', spec: ['int', 'Kapasitas', { required: true, min: 1, max: 200 }] }),
  c('status', 'Status', { fmt: 'aktif / nonaktif / perbaikan (kosong = aktif)', enum: ['aktif', 'nonaktif', 'perbaikan'], spec: ['enum', 'Status', { values: ['aktif', 'nonaktif', 'perbaikan'] }] }),
  c('catatan', 'Catatan', { spec: ['text', 'Catatan', { max: 300 }] })
];
const JENIS = {
  santri_putra: { label: 'Data Santri Putra', tipe: 'santri', kel: 'putra', kol: KOL_SANTRI_AKTIF }, santri_putri: { label: 'Data Santri Putri', tipe: 'santri', kel: 'putri', kol: KOL_SANTRI_AKTIF },
  alumni_putra: { label: 'Data Alumni Putra', tipe: 'alumni', kel: 'putra', kol: KOL_ALUMNI }, alumni_putri: { label: 'Data Alumni Putri', tipe: 'alumni', kel: 'putri', kol: KOL_ALUMNI },
  pengurus_putra: { label: 'Data Pengurus Putra', tipe: 'pengurus', kel: 'putra', kol: KOL_PENGURUS }, pengurus_putri: { label: 'Data Pengurus Putri', tipe: 'pengurus', kel: 'putri', kol: KOL_PENGURUS },
  pengajar: { label: 'Data Pengajar', tipe: 'pengajar', kol: KOL_PENGAJAR }, asrama: { label: 'Data Asrama', tipe: 'asrama', kol: KOL_ASRAMA }, kamar: { label: 'Data Kamar', tipe: 'kamar', kol: KOL_KAMAR }
};
const URUTAN = ['asrama', 'kamar', 'santri_putra', 'santri_putri', 'alumni_putra', 'alumni_putri', 'pengurus_putra', 'pengurus_putri', 'pengajar'];
const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const low = s => String(s == null ? '' : s).trim().toLowerCase();

// ---------- pembacaan berkas ----------
function cell(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') { if ('result' in v) return cell(v.result); if (v.richText) return v.richText.map(t => t.text).join('').trim(); if ('text' in v) return String(v.text).trim(); return ''; }
  return String(v).trim();
}
function tglNorm(s) {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); if (!m) return s;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
async function bacaBerkas(buf, nama) {
  const isCsv = /\.csv$/i.test(nama || '') || (buf.slice(0, 2).toString() !== 'PK');
  const wb = new ExcelJS.Workbook(); let ws;
  try {
    if (isCsv) {
      let txt = buf.toString('utf8').replace(/^﻿/, ''); const first = txt.split(/\r?\n/)[0] || '';
      const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
      ws = await wb.csv.read(Readable.from([Buffer.from(txt)]), { parserOptions: { delimiter: delim } });
    } else { await wb.xlsx.load(buf); ws = wb.getWorksheet('Data') || wb.worksheets[0]; }
  } catch (e) { throw err(400, 'Berkas tidak dapat dibaca. Gunakan template .xlsx atau CSV yang valid.'); }
  if (!ws) throw err(400, 'Berkas tidak berisi lembar data.');
  const rows = []; ws.eachRow({ includeEmpty: false }, (row, n) => { const vals = []; for (let i = 1; i <= Math.max(row.cellCount, 1); i++) vals.push(cell(row.getCell(i).value)); rows.push({ n, vals }); });
  if (!rows.length) throw err(400, 'Berkas kosong.');
  return rows;
}

// ---------- analisis ----------
async function konteks(q, def) {
  const k = {};
  if (def.tipe === 'santri' || def.tipe === 'alumni') {
    k.nis = new Set((await q('SELECT lower(nis) n FROM santri WHERE nis IS NOT NULL')).map(r => r.n));
    if (def.tipe === 'santri') {
      k.kamar = await q(`SELECT k.id, lower(k.nama) kn, lower(a.nama) an, a.nama asrama, k.nama kamar, a.jenis, k.kapasitas, k.status, k.diarsipkan, a.status astatus, a.diarsipkan aarsip,
        (SELECT COUNT(*)::int FROM santri s WHERE s.kamar_id=k.id AND s.status='aktif' AND NOT s.diarsipkan) isi FROM kamar k JOIN asrama a ON a.id=k.asrama_id`);
    }
  } else if (def.tipe === 'pengurus') {
    for (const t of ['jabatan', 'divisi', 'periode']) k[t] = await q(`SELECT id, lower(nama) n FROM ${t} WHERE kelompok=$1`, [def.kel]);
    k.ada = new Set((await q('SELECT lower(p.nama)||\'|\'||COALESCE(p.jabatan_id,0)||\'|\'||COALESCE(p.periode_id,0) x FROM pengurus p WHERE p.kelompok=$1 AND NOT p.diarsipkan', [def.kel])).map(r => r.x));
  } else if (def.tipe === 'pengajar') {
    k.ada = new Set((await q("SELECT lower(nama)||'|'||lower(COALESCE(kontak,'')) x FROM pengajar WHERE NOT diarsipkan")).map(r => r.x));
  } else if (def.tipe === 'asrama') {
    k.ada = new Set((await q("SELECT jenis||'|'||lower(nama) x FROM asrama")).map(r => r.x));
  } else if (def.tipe === 'kamar') {
    k.asrama = await q('SELECT id, jenis, lower(nama) n, nama, status, diarsipkan FROM asrama');
    k.ada = new Set((await q("SELECT k.asrama_id||'|'||lower(k.nama) x FROM kamar k")).map(r => r.x));
  }
  return k;
}
function cekTahun(out, e, tipe) {
  if (out.tanggal_masuk) { if (out.tahun_masuk == null) out.tahun_masuk = U.year(out.tanggal_masuk); else if (out.tahun_masuk !== U.year(out.tanggal_masuk)) e.tahun_masuk = 'Tahun masuk tidak sesuai dengan tanggal masuk.'; }
  if (tipe === 'alumni') {
    if (out.tanggal_keluar) { if (out.tahun_keluar == null) out.tahun_keluar = U.year(out.tanggal_keluar); else if (out.tahun_keluar !== U.year(out.tanggal_keluar)) e.tahun_keluar = 'Tahun keluar tidak sesuai dengan tanggal keluar.'; }
    if (out.tahun_masuk != null && out.tahun_keluar != null && out.tahun_keluar < out.tahun_masuk) e.tahun_keluar = 'Tahun keluar tidak boleh sebelum tahun masuk.';
  }
}
// Mengembalikan { status: valid|peringatan|gagal|duplikat, pesan[], data }
function nilaiBaris(def, ctx, st, raw) {
  const spec = {}; for (const kc of def.kol) if (kc.spec) spec[kc.k] = kc.spec;
  const body = {}; for (const kc of def.kol) { let v = raw[kc.k] || ''; if (kc.tgl) v = tglNorm(v); if (kc.enum) v = low(v); body[kc.k] = v; }
  const { e, out } = U.readFields(body, spec, { partial: false });
  const warn = [], dup = [];
  const tp = def.tipe;
  if (tp === 'santri' || tp === 'alumni') {
    out.jenis_kelamin = def.kel === 'putra' ? 'L' : 'P'; cekTahun(out, e, tp);
    if (out.nis && !e.nis) { const kn = out.nis.toLowerCase(); if (ctx.nis.has(kn)) dup.push('NIS sudah ada di database.'); else if (st.nis.has(kn)) dup.push('NIS dobel di dalam berkas (baris ' + st.nis.get(kn) + ').'); }
    if (tp === 'santri') {
      const a = raw.asrama || '', kmr = raw.kamar || '';
      if (kmr || a) {
        if (!kmr || !a) e.kamar = 'Isi Asrama dan Kamar bersamaan, atau kosongkan keduanya.';
        else {
          const cand = ctx.kamar.filter(x => x.an === low(a) && x.kn === low(kmr) && !x.diarsipkan && !x.aarsip);
          if (!cand.length) e.kamar = `Kamar "${kmr}" di asrama "${a}" tidak ditemukan. Impor Data Asrama/Kamar terlebih dahulu.`;
          else { const km = cand.find(x => x.jenis === def.kel); if (!km) e.kamar = `Asrama "${a}" bukan asrama ${def.kel}.`; else if (km.status !== 'aktif' || km.astatus !== 'aktif') e.kamar = 'Kamar atau asrama tidak aktif.';
            else { const used = km.isi + (st.kapasitas.get(km.id) || 0); if (used >= km.kapasitas) e.kamar = `Kapasitas kamar ${km.kamar} penuh (${used}/${km.kapasitas}).`; else out.kamar_id = km.id; } }
        }
      }
      if (!out.tahun_masuk && !out.tanggal_masuk) warn.push('Tahun/tanggal masuk belum diisi.');
      if (!out.nama_ayah && !out.nama_ibu && !out.nama_wali) warn.push('Data orang tua/wali belum diisi.');
    }
  } else if (tp === 'pengurus') {
    const f = (t, nm) => { const r = ctx[t].filter(x => x.n === low(nm)); return r.length === 1 ? r[0].id : r.length > 1 ? -1 : null; };
    const j = f('jabatan', raw.jabatan); if (raw.jabatan && j == null) e.jabatan = `Jabatan "${raw.jabatan}" belum ada pada kelompok ${def.kel}. Tambahkan lebih dulu di menu Pengurus.`; else if (j) out.jabatan_id = j;
    if (!raw.jabatan) e.jabatan = 'Jabatan wajib diisi.';
    if (raw.divisi) { const d = f('divisi', raw.divisi); if (d == null) e.divisi = `Divisi "${raw.divisi}" belum ada.`; else out.divisi_id = d; }
    if (raw.periode) { const p = f('periode', raw.periode); if (p == null) e.periode = `Periode "${raw.periode}" belum ada.`; else out.periode_id = p; }
    if (out.tanggal_mulai && out.tanggal_selesai && out.tanggal_selesai < out.tanggal_mulai) e.tanggal_selesai = 'Tanggal selesai sebelum tanggal mulai.';
    out.kelompok = def.kel;
    if (out.nama && out.jabatan_id) { const key = low(out.nama) + '|' + out.jabatan_id + '|' + (out.periode_id || 0); if (ctx.ada.has(key)) dup.push('Pengurus dengan nama, jabatan, dan periode sama sudah ada.'); else if (st.key.has(key)) dup.push('Dobel di dalam berkas (baris ' + st.key.get(key) + ').'); out._key = key; }
  } else if (tp === 'pengajar') {
    if (out.nama) { const key = low(out.nama) + '|' + low(out.kontak); if (ctx.ada.has(key)) dup.push('Pengajar dengan nama dan kontak sama sudah ada (pengajar tidak memiliki ID; kecocokan memakai nama + kontak).'); else if (st.key.has(key)) dup.push('Dobel di dalam berkas (baris ' + st.key.get(key) + ').'); out._key = key; }
    if (!out.bidang) warn.push('Bidang belum diisi.');
  } else if (tp === 'asrama') {
    if (out.jenis && out.nama) { const key = out.jenis + '|' + low(out.nama); if (ctx.ada.has(key)) dup.push('Asrama sudah ada.'); else if (st.key.has(key)) dup.push('Dobel di dalam berkas (baris ' + st.key.get(key) + ').'); out._key = key; }
  } else if (tp === 'kamar') {
    const cand = ctx.asrama.filter(x => x.n === low(raw.asrama) && !x.diarsipkan && (!out.jenis_asrama || x.jenis === out.jenis_asrama));
    if (!raw.asrama) e.asrama = 'Asrama wajib diisi.'; else if (!cand.length) e.asrama = `Asrama "${raw.asrama}" tidak ditemukan. Impor Data Asrama lebih dulu.`; else if (cand.length > 1) e.asrama = 'Nama asrama ambigu (ada di putra dan putri). Isi kolom Jenis Asrama.';
    else { out.asrama_id = cand[0].id; if (out.nama) { const key = cand[0].id + '|' + low(out.nama); if (ctx.ada.has(key)) dup.push('Kamar sudah ada di asrama ini.'); else if (st.key.has(key)) dup.push('Dobel di dalam berkas (baris ' + st.key.get(key) + ').'); out._key = key; } }
    delete out.jenis_asrama;
  }
  const pesanE = Object.values(e);
  return { e, pesanE, warn, dup, out };
}
async function analisis(q, jenis, buf, nama) {
  const def = JENIS[jenis]; if (!def) throw err(400, 'Jenis data tidak dikenal.');
  const rows = await bacaBerkas(buf, nama);
  // header: baris pertama yang berisi minimal satu kolom dikenal
  const idx = {}, head = rows[0], tak = [];
  head.vals.forEach((v, i) => { if (!v) return; const kc = def.kol.find(x => norm(x.k) === norm(v) || norm(x.t) === norm(v)); if (kc) { if (idx[kc.k] == null) idx[kc.k] = i; } else tak.push(v); });
  const hilang = def.kol.filter(x => x.wajib && idx[x.k] == null).map(x => x.t);
  if (hilang.length) throw err(400, 'Kolom wajib tidak ditemukan pada baris judul: ' + hilang.join(', ') + '. Gunakan template terbaru.');
  const data = rows.slice(1).filter(r => r.vals.some(v => v)); if (!data.length) throw err(400, 'Berkas tidak memiliki baris data.');
  if (data.length > MAX_BARIS) throw err(400, `Maksimal ${MAX_BARIS} baris per impor. Pecah berkas.`);
  const ctx = await konteks(q, def), st = { nis: new Map(), key: new Map(), kapasitas: new Map() };
  const masalah = [], payload = []; const cnt = { valid: 0, peringatan: 0, gagal: 0, duplikat: 0 }, pratinjau = [];
  for (const r of data) {
    const raw = {}; for (const kc of def.kol) raw[kc.k] = idx[kc.k] == null ? '' : (r.vals[idx[kc.k]] || '');
    const v = nilaiBaris(def, ctx, st, raw), ident = raw.nama || raw.nis || '';
    let status;
    if (v.pesanE.length) { status = 'gagal'; cnt.gagal++; masalah.push({ baris: r.n, status, ident, pesan: v.pesanE }); }
    else if (v.dup.length) { status = 'duplikat'; cnt.duplikat++; masalah.push({ baris: r.n, status, ident, pesan: v.dup }); }
    else {
      status = v.warn.length ? 'peringatan' : 'valid'; cnt[status]++;
      if (v.warn.length) masalah.push({ baris: r.n, status, ident, pesan: v.warn });
      if (out_nis(v.out)) st.nis.set(v.out.nis.toLowerCase(), r.n); if (v.out._key) st.key.set(v.out._key, r.n); if (v.out.kamar_id) st.kapasitas.set(v.out.kamar_id, (st.kapasitas.get(v.out.kamar_id) || 0) + 1);
      delete v.out._key; payload.push({ baris: r.n, d: v.out });
    }
    if (status === 'duplikat' && out_nis(v.out) === false && v.out.nis) { /* NIS valid tetapi dobel: tidak didaftarkan agar baris pertama tetap sah */ }
    if (pratinjau.length < 100) pratinjau.push({ baris: r.n, status, ident, ringkas: ringkasBaris(def, raw), pesan: v.pesanE.concat(v.dup, v.warn) });
  }
  return { def, total: data.length, cnt, masalah: masalah.slice(0, MAX_MASALAH), potong: masalah.length > MAX_MASALAH, payload, pratinjau, tak };
}
const out_nis = o => !!(o && o.nis);
function ringkasBaris(def, raw) {
  const keys = def.tipe === 'kamar' ? ['asrama', 'nama', 'kapasitas'] : def.tipe === 'asrama' ? ['jenis', 'nama'] : def.tipe === 'pengurus' ? ['nama', 'jabatan', 'periode'] : def.tipe === 'pengajar' ? ['nama', 'bidang'] : def.tipe === 'alumni' ? ['nis', 'nama', 'status_alumni', 'tahun_keluar'] : ['nis', 'nama', 'asrama', 'kamar'];
  return keys.map(k => raw[k] || '—');
}

// ---------- eksekusi ----------
async function jalankan(q, def, rows, req, impId) {
  const ids = [], now = Date.now(), alasan = 'Diimpor (impor #' + impId + ')';
  for (const { d } of rows) {
    if (def.tipe === 'santri' || def.tipe === 'alumni') {
      const o = { ...d }, kamarId = o.kamar_id || null; delete o.kamar_id; const cols = Object.keys(o);
      const r = await q(`INSERT INTO santri (${cols.join(',')},status,dibuat,diubah) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')},'${def.tipe === 'alumni' ? 'alumni' : 'aktif'}',$${cols.length + 1},$${cols.length + 1}) RETURNING id`, [...cols.map(x => o[x]), now]);
      const sid = r[0].id; ids.push(sid);
      await q('INSERT INTO riwayat_status (santri_id,jenis,status_sebelum,status_sesudah,waktu,oleh,oleh_username,alasan) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7)', [sid, def.tipe === 'alumni' ? 'tambah_alumni' : 'dibuat', def.tipe === 'alumni' ? 'alumni:' + o.status_alumni : 'aktif', now, req.user.id, req.user.username, alasan]);
      if (kamarId) {
        const k = (await q('SELECT k.id, k.nama, k.kapasitas, a.nama asrama FROM kamar k JOIN asrama a ON a.id=k.asrama_id WHERE k.id=$1 FOR UPDATE OF k', [kamarId]))[0];
        const isi = (await q("SELECT COUNT(*)::int n FROM santri WHERE kamar_id=$1 AND status='aktif' AND NOT diarsipkan", [kamarId]))[0].n;
        if (!k || isi >= k.kapasitas) throw err(409, `Kapasitas kamar ${k ? k.nama : kamarId} penuh saat impor (data berubah sejak pratinjau). Impor dibatalkan seluruhnya; ulangi analisis.`);
        await q('UPDATE santri SET kamar_id=$1 WHERE id=$2', [kamarId, sid]);
        await q("INSERT INTO riwayat_penempatan (santri_id,jenis,ke_kamar_id,ke_asrama,ke_kamar,waktu,oleh,oleh_username,alasan) VALUES ($1,'penempatan_baru',$2,$3,$4,$5,$6,$7,$8)", [sid, kamarId, k.asrama, k.nama, now, req.user.id, req.user.username, alasan]);
      }
    } else if (def.tipe === 'pengurus') {
      const r = await q('INSERT INTO pengurus (kelompok,jenis_kelamin,nama,tugas,tanggal_mulai,tanggal_selesai,keterangan,aktif,jabatan_id,divisi_id,periode_id,dibuat,diubah) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,$10,$11,$11) RETURNING id',
        [def.kel, def.kel === 'putra' ? 'L' : 'P', d.nama, d.tugas, d.tanggal_mulai, d.tanggal_selesai, d.keterangan, d.jabatan_id, d.divisi_id || null, d.periode_id || null, now]);
      ids.push(r[0].id); await q('INSERT INTO pengurus_riwayat (pengurus_id,waktu,keterangan,oleh) VALUES ($1,$2,$3,$4)', [r[0].id, now, 'Diangkat (' + alasan + ')', req.user.id]);
    } else if (def.tipe === 'pengajar') {
      const r = await q('INSERT INTO pengajar (nama,alamat,kontak,bidang,lembaga,tanggal_mulai,keterangan,aktif,dibuat,diubah) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$8) RETURNING id', [d.nama, d.alamat, d.kontak, d.bidang, d.lembaga, d.tanggal_mulai, d.keterangan, now]);
      ids.push(r[0].id); if (d.bidang || d.lembaga) await q('INSERT INTO pengajar_penugasan (pengajar_id,bidang,lembaga,mulai,keterangan,dibuat,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7)', [r[0].id, d.bidang, d.lembaga, d.tanggal_mulai, 'Penugasan awal (' + alasan + ')', now, req.user.id]);
    } else if (def.tipe === 'asrama') {
      const r = await q('INSERT INTO asrama (jenis,nama,status,keterangan) VALUES ($1,$2,$3,$4) RETURNING id', [d.jenis, d.nama, d.status || 'aktif', d.keterangan]); ids.push(r[0].id);
    } else if (def.tipe === 'kamar') {
      const r = await q('INSERT INTO kamar (asrama_id,nama,kapasitas,status,catatan) VALUES ($1,$2,$3,$4,$5) RETURNING id', [d.asrama_id, d.nama, d.kapasitas, d.status || 'aktif', d.catatan]); ids.push(r[0].id);
    }
  }
  return ids;
}
const TABEL = { santri: 'santri', alumni: 'santri', pengurus: 'pengurus', pengajar: 'pengajar', asrama: 'asrama', kamar: 'kamar' };

function register(api, { db, auth, logBy, ah }) {
  const M = auth.requireModule('impor');
  const SELH = 'id, jenis, berkas_nama, ukuran, dibuat, oleh_username, status, total, valid, peringatan, gagal, duplikat, diimpor, selesai, ket';

  api.get('/impor/jenis', M, ah(async (req, res) => {
    res.json({ urutan: URUTAN, jenis: URUTAN.map(id => ({ id, label: JENIS[id].label, kolom: JENIS[id].kol.map(k => ({ k: k.k, t: k.t, wajib: !!k.wajib, fmt: k.fmt || 'Teks', contoh: k.contoh || '' })) })), batas: { baris: MAX_BARIS, ukuran_mb: MAX_BYTES / 1048576 } });
  }));

  api.get('/impor/template/:jenis', M, ah(async (req, res) => {
    const def = JENIS[req.params.jenis]; if (!def) throw err(404, 'Jenis data tidak dikenal.');
    if (req.query.format === 'csv') {
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="template-${req.params.jenis}.csv"` });
      return res.send('﻿' + def.kol.map(k => '"' + k.t + '"').join(',') + '\r\n');
    }
    const wb = new ExcelJS.Workbook(); wb.creator = 'SIMA Al Hidayah';
    const ws = wb.addWorksheet('Data'); ws.addRow(def.kol.map(k => k.t));
    ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }];
    def.kol.forEach((k, i) => { const col = ws.getColumn(i + 1); col.width = Math.max(14, k.t.length + 4); if (k.teks || k.tgl) col.numFmt = '@'; if (k.wajib) ws.getCell(1, i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE9A8' } }; });
    const pt = wb.addWorksheet('Petunjuk'); pt.addRow(['Template ' + def.label]); pt.getRow(1).font = { bold: true, size: 13 };
    pt.addRow(['Isi data pada lembar "Data" mulai baris 2. Jangan ubah nama kolom. Kolom berlatar kuning wajib diisi. Lembar ini hanya contoh format, bukan data.']);
    pt.addRow(['Baris yang bermasalah tidak akan diimpor dan dilaporkan; baris duplikat dilewati (data lama tidak pernah ditimpa). Foto KK dan dokumen sensitif TIDAK dimasukkan lewat Excel, unggah dari halaman detail santri.']);
    pt.addRow([]); pt.addRow(['Kolom', 'Wajib', 'Format', 'Contoh']).font = { bold: true };
    def.kol.forEach(k => pt.addRow([k.t, k.wajib ? 'Ya' : 'Tidak', k.fmt || 'Teks', k.contoh || '']));
    pt.getColumn(1).width = 26; pt.getColumn(2).width = 8; pt.getColumn(3).width = 60; pt.getColumn(4).width = 26;
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="template-${req.params.jenis}.xlsx"` });
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  }));

  api.post('/impor/analisis', M, ah(async (req, res) => {
    const b = req.body || {}, def = JENIS[b.jenis]; if (!def) throw err(400, 'Pilih jenis data.');
    if (typeof b.isi !== 'string' || !b.isi) throw err(400, 'Berkas belum dipilih.');
    const buf = Buffer.from(b.isi, 'base64'); if (!buf.length) throw err(400, 'Berkas kosong.'); if (buf.length > MAX_BYTES) throw err(413, 'Berkas terlalu besar (maks. 2,5 MB). Pecah menjadi beberapa berkas.');
    const nama = U.str(b.nama_berkas, 150) || 'berkas';
    const a = await analisis(db.q, b.jenis, buf, nama);
    const r = await db.q('INSERT INTO sys_impor (jenis,berkas_nama,ukuran,sha256,dibuat,oleh,oleh_username,status,total,valid,peringatan,gagal,duplikat,masalah,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,\'pratinjau\',$8,$9,$10,$11,$12,$13,$14) RETURNING id',
      [b.jenis, nama, buf.length, crypto.createHash('sha256').update(buf).digest('hex'), Date.now(), req.user.id, req.user.username, a.total, a.cnt.valid, a.cnt.peringatan, a.cnt.gagal, a.cnt.duplikat, JSON.stringify(a.masalah), JSON.stringify(a.payload)]);
    await logBy(req, 'analisis_impor', 'impor', `Menganalisis berkas ${nama} (${def.label}): ${a.total} baris, ${a.cnt.valid + a.cnt.peringatan} lolos, ${a.cnt.gagal} gagal, ${a.cnt.duplikat} duplikat`);
    res.status(201).json({ id: r[0].id, jenis: b.jenis, label: def.label, total: a.total, ...a.cnt, masalah: a.masalah.slice(0, 200), potong: a.potong, pratinjau: a.pratinjau, kolom_diabaikan: a.tak, kolom: def.kol.filter(k => !k.ref || true).map(k => k.t) });
  }));

  api.get('/impor', M, ah(async (req, res) => { res.json({ rows: await db.q(`SELECT ${SELH} FROM sys_impor ORDER BY id DESC LIMIT 100`), label: Object.fromEntries(Object.entries(JENIS).map(([k, v]) => [k, v.label])) }); }));
  api.get('/impor/:id(\\d+)', M, ah(async (req, res) => {
    const r = (await db.q(`SELECT ${SELH}, masalah FROM sys_impor WHERE id=$1`, [+req.params.id]))[0]; if (!r) throw err(404, 'Riwayat impor tidak ditemukan.');
    const m = r.masalah || []; delete r.masalah;
    if (req.query.format === 'xlsx') {
      const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Masalah'); ws.addRow(['Baris Excel', 'Status', 'Data', 'Keterangan']); ws.getRow(1).font = { bold: true };
      m.forEach(x => ws.addRow([x.baris, x.status === 'gagal' ? 'Gagal (perbaiki)' : x.status === 'duplikat' ? 'Duplikat (dilewati)' : 'Perlu diperbaiki (tetap diimpor)', x.ident, x.pesan.join(' | ')]));
      [12, 26, 30, 100].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="masalah-impor-${r.id}.xlsx"` });
      return res.send(Buffer.from(await wb.xlsx.writeBuffer()));
    }
    res.json({ ...r, label: (JENIS[r.jenis] || {}).label, masalah: m.slice(0, 500) });
  }));

  api.post('/impor/:id(\\d+)/jalankan', M, ah(async (req, res) => {
    const b = req.body || {}; if (b.konfirmasi !== true) throw err(400, 'Impor memerlukan konfirmasi.');
    const id = +req.params.id;
    const hasil = await db.tx(async q => {
      const r = (await q('SELECT * FROM sys_impor WHERE id=$1 FOR UPDATE', [id]))[0];
      if (!r) throw err(404, 'Analisis tidak ditemukan.');
      if (r.status !== 'pratinjau') throw err(409, 'Impor ini sudah ' + r.status + '. Unggah ulang berkas untuk memulai lagi.');
      if (Date.now() - r.dibuat > KADALUARSA) throw err(409, 'Pratinjau sudah kedaluwarsa (24 jam). Unggah ulang berkas.');
      const def = JENIS[r.jenis], rows = r.payload || [];
      if (!rows.length) throw err(409, 'Tidak ada baris yang lolos validasi untuk diimpor.');
      if ((r.gagal + r.duplikat) > 0 && b.lewati !== true) throw err(409, `Ada ${r.gagal} baris gagal dan ${r.duplikat} duplikat yang akan dilewati. Setujui pelewatan atau perbaiki berkas dahulu.`);
      let ids;
      try { ids = await jalankan(q, def, rows, req, id); }
      catch (e) { if (U.isUnique(e)) throw err(409, 'Data berubah sejak pratinjau (NIS/nama sudah dipakai). Tidak ada data yang disimpan. Ulangi analisis.'); throw e; }
      const ada = Number((await q(`SELECT COUNT(*)::int n FROM ${TABEL[def.tipe]} WHERE id = ANY($1::bigint[])`, [ids]))[0].n);
      if (ada !== rows.length) throw err(500, 'Verifikasi jumlah gagal; impor dibatalkan.');
      await q("UPDATE sys_impor SET status='selesai', diimpor=$1, ids=$2, selesai=$3, payload=NULL, ket=$4 WHERE id=$5", [ids.length, JSON.stringify(ids), Date.now(), 'Diverifikasi: ' + ada + ' baris tersimpan.', id]);
      return { jenis: r.jenis, label: def.label, diimpor: ids.length, gagal: r.gagal, duplikat: r.duplikat, peringatan: r.peringatan };
    });
    await logBy(req, 'impor', 'impor', `Impor ${hasil.label} selesai: ${hasil.diimpor} baris disimpan, ${hasil.gagal} gagal dan ${hasil.duplikat} duplikat dilewati (impor #${id})`);
    res.json({ ok: true, ...hasil, verifikasi: 'Jumlah baris tersimpan sama dengan jumlah yang diimpor.' });
  }));
  api.post('/impor/:id(\\d+)/batal', M, ah(async (req, res) => {
    if (!req.body || req.body.konfirmasi !== true) throw err(400, 'Memerlukan konfirmasi.');
    const r = await db.q("UPDATE sys_impor SET status='dibatalkan', payload=NULL, selesai=$1 WHERE id=$2 AND status='pratinjau' RETURNING id", [Date.now(), +req.params.id]);
    if (!r.length) throw err(409, 'Tidak ada pratinjau yang dapat dibatalkan.');
    await logBy(req, 'batal_impor', 'impor', 'Membatalkan pratinjau impor #' + r[0].id); res.json({ ok: true });
  }));
  api.post('/impor/:id(\\d+)/verifikasi', M, ah(async (req, res) => {
    const r = (await db.q('SELECT id, jenis, status, ids, diimpor FROM sys_impor WHERE id=$1', [+req.params.id]))[0];
    if (!r || r.status !== 'selesai') throw err(409, 'Hanya impor yang selesai dapat diverifikasi.');
    const def = JENIS[r.jenis], ids = r.ids || [];
    const ada = Number((await db.q(`SELECT COUNT(*)::int n FROM ${TABEL[def.tipe]} WHERE id = ANY($1::bigint[])`, [ids]))[0].n);
    res.json({ diimpor: r.diimpor, ditemukan: ada, sesuai: ada === r.diimpor, catatan: ada === r.diimpor ? 'Semua baris hasil impor masih ada.' : 'Sebagian baris hasil impor sudah dihapus/berubah.' });
  }));
}
module.exports = { register, JENIS };
