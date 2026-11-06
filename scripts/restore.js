'use strict';
// Pemulihan ke basis data TUJUAN yang terpisah (uji/pemulihan bencana). Penggunaan:
//   RESTORE_DATABASE_URL=... node scripts/restore.js <berkas-database.ndjson.gz> <berkas-berkas.ndjson.gz> --ya
// Menolak berjalan bila RESTORE_DATABASE_URL sama dengan DATABASE_URL (produksi) kecuali --izinkan-produksi.
// Skema tujuan dibuat/dimigrasi otomatis. SELURUH data di basis data tujuan akan diganti.
const fs = require('fs'); const { Pool, types } = require('pg'); types.setTypeParser(20, v => parseInt(v, 10));
const { migrate } = require('../lib/sima/db'); const B = require('../lib/sima/backup');
(async () => {
  const a = process.argv.slice(2), files = a.filter(x => !x.startsWith('--')), url = process.env.RESTORE_DATABASE_URL;
  if (!url) throw new Error('RESTORE_DATABASE_URL belum diatur (basis data tujuan).');
  if (files.length !== 2) throw new Error('Berikan 2 berkas: backup database dan backup berkas.');
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL && !a.includes('--izinkan-produksi')) throw new Error('Tujuan sama dengan DATABASE_URL (produksi). Dibatalkan. Pulihkan ke basis data uji.');
  if (!a.includes('--ya')) throw new Error('Tambahkan --ya untuk mengonfirmasi bahwa seluruh data tujuan akan diganti.');
  const bufs = files.map(f => fs.readFileSync(f)); bufs.forEach((b, i) => { B.bacaDump(b); console.log('Berkas ' + (i + 1) + ' valid, sha256 ' + B.sha(b)); });
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = { kind: 'pg', q: async (s, p) => (await pool.query(s, p)).rows, exec: s => pool.query(s), close: () => pool.end(),
    tx: async fn => { const c = await pool.connect(); try { await c.query('BEGIN'); const r = await fn(async (s, p) => (await c.query(s, p)).rows); await c.query('COMMIT'); return r; } catch (e) { try { await c.query('ROLLBACK'); } catch (_) { } throw e; } finally { c.release(); } } };
  await migrate(db); const h = await B.pulihkan(db, bufs); console.log('Pemulihan selesai: ' + h.tabel + ' tabel, ' + h.baris + ' baris, jumlah baris terverifikasi.'); await db.close();
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1); });
