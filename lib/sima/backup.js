'use strict';
// Backup & pemulihan logis seluruh data SIMA.
// - Format: gzip(NDJSON). Baris 1 = manifest; baris berikutnya = {t:tabel, rows:[...]} (serialisasi oleh Postgres: to_jsonb, aman untuk tanggal/bytea/jsonb).
// - Satu "paket" = backup `database` (semua tabel kecuali berkas biner) + backup `berkas` (tabel berkas & media). Pemulihan memakai satu paket utuh.
// - Backup dianggap berhasil HANYA setelah diverifikasi ulang dari data yang tersimpan (sha256 + jumlah baris per tabel).
const zlib = require('zlib');
const crypto = require('crypto');

const FORMAT = 'sima-backup/1';
const TABEL_BERKAS = ['berkas', 'cms_media'];
const KECUALI = ['sessions', 'sys_backup'];         // sesi tidak dibackup; riwayat backup harus bertahan setelah pemulihan
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const qi = n => '"' + String(n).replace(/"/g, '""') + '"';

async function daftarTabel(q) {
  const t = (await q("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).map(r => r.table_name);
  return t.filter(x => !KECUALI.includes(x));
}
const tabelJenis = (semua, jenis) => semua.filter(t => (jenis === 'berkas') === TABEL_BERKAS.includes(t));

// Tanda tangan skema: pemulihan hanya diizinkan ke skema yang identik (kolom & tipe).
async function tandaSkema(q) {
  const r = await q("SELECT table_name||'.'||column_name||':'||data_type AS c FROM information_schema.columns WHERE table_schema='public' AND table_name NOT IN ('sessions','sys_backup') ORDER BY 1");
  return sha(r.map(x => x.c).join('\n'));
}
async function punyaId(q, t) { return (await q("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='id' AND data_type IN ('bigint','integer')", [t])).length > 0; }

async function bacaTabel(q, t, chunkBerat) {
  const out = [];
  if (await punyaId(q, t)) {
    const ukuran = chunkBerat ? 20 : 2000; let last = 0;
    for (; ;) {
      const j = (await q(`SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.id), '[]'::jsonb) AS j FROM (SELECT * FROM ${qi(t)} WHERE id > $1 ORDER BY id LIMIT ${ukuran}) x`, [last]))[0].j;
      const rows = typeof j === 'string' ? JSON.parse(j) : j;
      if (!rows.length) break; out.push(rows); last = Number(rows[rows.length - 1].id); if (rows.length < ukuran) break;
    }
  } else {
    const j = (await q(`SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS j FROM ${qi(t)} x`))[0].j; const rows = typeof j === 'string' ? JSON.parse(j) : j; if (rows.length) out.push(rows);
  }
  return out;
}

// Membuat isi backup (Buffer gzip) + manifest. Snapshot konsisten (REPEATABLE READ) bila didukung.
async function buatDump(db, jenis, meta) {
  return db.tx(async q => {
    try { await q('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); } catch (e) { /* PGlite satu koneksi: sudah konsisten */ }
    const tabel = tabelJenis(await daftarTabel(q), jenis), lines = [], hitung = {}; let baris = 0;
    for (const t of tabel) {
      let n = 0;
      for (const rows of await bacaTabel(q, t, jenis === 'berkas')) { lines.push(JSON.stringify({ t, rows })); n += rows.length; }
      const db_n = Number((await q(`SELECT COUNT(*)::bigint AS n FROM ${qi(t)}`))[0].n);
      if (db_n !== n) throw new Error(`Jumlah baris tabel ${t} tidak sama saat dibaca (${n} ≠ ${db_n}).`);
      hitung[t] = n; baris += n;
    }
    const manifest = { format: FORMAT, jenis, dibuat: Date.now(), skema: await tandaSkema(q), tabel: hitung, baris, aplikasi: meta && meta.versi || null };
    const buf = zlib.gzipSync(Buffer.from([JSON.stringify({ manifest }), ...lines].join('\n') + '\n'), { level: 6 });
    return { buf, manifest, baris, tabel: tabel.length };
  });
}

function bacaDump(buf) {
  let txt; try { txt = zlib.gunzipSync(buf).toString('utf8'); } catch (e) { throw new Error('Berkas backup rusak (gagal didekompresi).'); }
  const ls = txt.split('\n').filter(Boolean); let man; const tabel = {};
  try { man = JSON.parse(ls[0]).manifest; for (const l of ls.slice(1)) { const o = JSON.parse(l); (tabel[o.t] = tabel[o.t] || []).push(...o.rows); } } catch (e) { throw new Error('Berkas backup rusak (isi tidak dapat dibaca).'); }
  if (!man || man.format !== FORMAT) throw new Error('Format berkas backup tidak dikenali.');
  return { manifest: man, tabel };
}

// Verifikasi dari data tersimpan: sha256 + jumlah baris per tabel harus cocok dengan manifest.
function periksaDump(buf, shaTersimpan, manifest) {
  if (sha(buf) !== shaTersimpan) return 'Checksum berkas tidak cocok.';
  let d; try { d = bacaDump(buf); } catch (e) { return e.message; }
  for (const [t, n] of Object.entries(manifest.tabel)) if ((d.tabel[t] || []).length !== n) return `Jumlah baris tabel ${t} tidak cocok (${(d.tabel[t] || []).length} ≠ ${n}).`;
  for (const t of Object.keys(d.tabel)) if (!(t in manifest.tabel)) return `Tabel ${t} tidak ada dalam manifest.`;
  return null;
}

async function simpanSatu(db, { paket, jenis, pemicu, oleh, versi }) {
  const mulai = Date.now();
  const id = (await db.q("INSERT INTO sys_backup (paket,jenis,pemicu,mulai,oleh,status) VALUES ($1,$2,$3,$4,$5,'berjalan') RETURNING id", [paket, jenis, pemicu, mulai, oleh || null]))[0].id;
  try {
    const d = await buatDump(db, jenis, { versi });
    await db.q('UPDATE sys_backup SET isi=$1, ukuran=$2, sha256=$3, manifest=$4, tabel=$5, baris=$6 WHERE id=$7', [d.buf, d.buf.length, sha(d.buf), JSON.stringify(d.manifest), d.tabel, d.baris, id]);
    return await verifikasi(db, id);
  } catch (e) {
    await db.q("UPDATE sys_backup SET status='gagal', selesai=$1, ket=$2, isi=NULL WHERE id=$3", [Date.now(), String(e.message).slice(0, 300), id]);
    return (await db.q('SELECT id, paket, jenis, pemicu, mulai, selesai, status, ukuran, baris, tabel, ket FROM sys_backup WHERE id=$1', [id]))[0];
  }
}

// Baca ulang dari DB → bandingkan. Status 'terverifikasi' hanya diberikan di sini.
async function verifikasi(db, id) {
  const r = (await db.q('SELECT id, isi, sha256, manifest FROM sys_backup WHERE id=$1', [id]))[0];
  if (!r) throw new Error('Backup tidak ditemukan.');
  let err = null;
  if (!r.isi) err = 'Isi backup sudah dibersihkan (melewati retensi) atau tidak ada.';
  else err = periksaDump(Buffer.from(r.isi), r.sha256, typeof r.manifest === 'string' ? JSON.parse(r.manifest) : r.manifest);
  await db.q('UPDATE sys_backup SET status=$1, selesai=$2, ket=$3 WHERE id=$4', [err ? 'gagal' : 'terverifikasi', Date.now(), err ? err.slice(0, 300) : 'Diverifikasi: checksum dan jumlah baris tiap tabel cocok.', id]);
  return (await db.q('SELECT id, paket, jenis, pemicu, mulai, selesai, status, ukuran, baris, tabel, ket FROM sys_backup WHERE id=$1', [id]))[0];
}

async function buatPaket(db, { pemicu, oleh, versi }) {
  const paket = Date.now(), hasil = [];
  for (const jenis of ['database', 'berkas']) hasil.push(await simpanSatu(db, { paket, jenis, pemicu, oleh, versi }));
  return { paket, hasil, ok: hasil.every(h => h.status === 'terverifikasi') };
}

// Retensi: simpan paket terverifikasi terbaru sebanyak `jumlah` dan yang berumur <= `hari`; sisanya dibersihkan isinya (riwayat tetap).
// Paket 'sebelum_pemulihan' dipertahankan minimal 90 hari. Paket terverifikasi paling baru tidak pernah dibersihkan.
async function terapkanRetensi(db, { jumlah, hari }) {
  const pk = await db.q("SELECT paket, MIN(pemicu) AS pemicu, BOOL_AND(status='terverifikasi') AS ok FROM sys_backup WHERE isi IS NOT NULL GROUP BY paket ORDER BY paket DESC");
  const now = Date.now(), keep = new Set(); let n = 0, newestOk = null;
  for (const p of pk) {
    const umur = (now - Number(p.paket)) / 864e5;
    if (p.ok && newestOk === null) { newestOk = p.paket; keep.add(String(p.paket)); n++; continue; }
    if (p.pemicu === 'sebelum_pemulihan' && umur < 90) { keep.add(String(p.paket)); continue; }
    if (p.ok && n < jumlah && umur <= hari) { keep.add(String(p.paket)); n++; }
  }
  const hapus = pk.filter(p => !keep.has(String(p.paket)) && p.ok).map(p => Number(p.paket));
  const gagal = pk.filter(p => !p.ok && (now - Number(p.paket)) > 7 * 864e5).map(p => Number(p.paket));
  const semua = [...hapus, ...gagal];
  if (semua.length) await db.q('UPDATE sys_backup SET isi=NULL, dibersihkan=$1 WHERE paket = ANY($2::bigint[]) AND isi IS NOT NULL', [now, semua]);
  return semua.length;
}

// ---- Pemulihan ----
async function urutanTabel(q, tabel) {
  const set = new Set(tabel), fk = await q("SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent FROM pg_constraint c WHERE c.contype='f' AND c.connamespace='public'::regnamespace");
  const deps = {}; tabel.forEach(t => { deps[t] = new Set(); }); fk.forEach(f => { const c = f.child.replace(/"/g, ''), p = f.parent.replace(/"/g, ''); if (c !== p && set.has(c) && set.has(p)) deps[c].add(p); });
  const out = [], seen = new Set(), st = new Set();
  const v = n => { if (seen.has(n)) return; if (st.has(n)) throw new Error('Relasi tabel melingkar: ' + n); st.add(n); deps[n].forEach(v); st.delete(n); seen.add(n); out.push(n); };
  tabel.forEach(v); return out;
}
async function urutBaris(q, t, rows) {   // tabel dengan relasi ke dirinya sendiri: induk lebih dulu
  const f = await q("SELECT a.attname AS kol FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum = ANY(c.conkey) WHERE c.contype='f' AND c.conrelid=$1::regclass AND c.confrelid=$1::regclass", [qi(t)]);
  if (!f.length) return rows;
  const out = [], placed = new Set(); let sisa = rows.slice();
  while (sisa.length) {
    const next = []; let moved = 0;
    for (const r of sisa) { if (f.every(x => r[x.kol] == null || placed.has(r[x.kol]))) { out.push(r); placed.add(r.id); moved++; } else next.push(r); }
    if (!moved) throw new Error(`Relasi internal tabel ${t} tidak dapat diurutkan.`);
    sisa = next;
  }
  return out;
}

// Memulihkan paket (backup database + berkas) ke `db`. Satu transaksi: gagal di mana pun → semua dibatalkan, data lama utuh.
async function pulihkan(db, buffers) {
  const dumps = buffers.map(bacaDump), tabel = {}, mans = [];
  for (const d of dumps) { mans.push(d.manifest); Object.assign(tabel, d.tabel); for (const t of Object.keys(d.manifest.tabel)) tabel[t] = d.tabel[t] || []; }
  const jenis = mans.map(m => m.jenis).sort().join('+'); if (jenis !== 'berkas+database') throw new Error('Pemulihan membutuhkan satu paket lengkap (backup database + backup berkas).');
  const hasil = { tabel: 0, baris: 0 };
  await db.tx(async q => {
    const skema = await tandaSkema(q); if (mans.some(m => m.skema !== skema)) throw new Error('Skema database tujuan berbeda dari skema backup. Jalankan migrasi ke versi aplikasi yang sama terlebih dahulu.');
    const nama = Object.keys(tabel); for (const t of nama) if (!(await q('SELECT to_regclass($1) AS r', ['public.' + qi(t)]))[0].r) throw new Error('Tabel tujuan tidak ada: ' + t);
    const urut = await urutanTabel(q, nama);
    await q(`TRUNCATE ${[...nama, 'sessions'].map(qi).join(', ')} RESTART IDENTITY`);
    for (const t of nama) await q(`ALTER TABLE ${qi(t)} DISABLE TRIGGER USER`);
    for (const t of urut) {
      const rows = await urutBaris(q, t, tabel[t]);
      for (let i = 0; i < rows.length; i += 200) await q(`INSERT INTO ${qi(t)} SELECT * FROM jsonb_populate_recordset(NULL::${qi(t)}, $1::jsonb)`, [JSON.stringify(rows.slice(i, i + 200))]);
      hasil.tabel++; hasil.baris += rows.length;
    }
    for (const t of nama) await q(`ALTER TABLE ${qi(t)} ENABLE TRIGGER USER`);
    const seq = await q("SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema='public' AND column_default LIKE 'nextval%'");
    for (const s of seq) if (nama.includes(s.t)) await q(`SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${qi(s.c)}) FROM ${qi(s.t)}), 1), (SELECT MAX(${qi(s.c)}) FROM ${qi(s.t)}) IS NOT NULL)`, [qi(s.t), s.c]);
    for (const t of nama) { const n = Number((await q(`SELECT COUNT(*)::bigint AS n FROM ${qi(t)}`))[0].n); if (n !== tabel[t].length) throw new Error(`Verifikasi pemulihan gagal pada tabel ${t} (${n} ≠ ${tabel[t].length}).`); }
  });
  return hasil;
}

module.exports = { FORMAT, TABEL_BERKAS, buatDump, bacaDump, periksaDump, simpanSatu, verifikasi, buatPaket, terapkanRetensi, pulihkan, sha };
