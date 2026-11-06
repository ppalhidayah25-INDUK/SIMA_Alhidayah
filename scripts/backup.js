'use strict';
// Backup ke berkas di disk (untuk disimpan di luar server/basis data). Penggunaan:
//   DATABASE_URL=... node scripts/backup.js [folder-tujuan]
// Menghasilkan 2 berkas .ndjson.gz (database + berkas) dan satu .json berisi checksum. Berkas dibuat dengan izin 0600.
const fs = require('fs'), path = require('path');
const { getDb } = require('../lib/sima/db'); const B = require('../lib/sima/backup');
(async () => {
  const dir = path.resolve(process.argv[2] || 'backup-sima'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = getDb(), cap = new Date().toISOString().replace(/[:.]/g, '-'), info = { dibuat: new Date().toISOString(), berkas: [] };
  for (const jenis of ['database', 'berkas']) {
    const d = await B.buatDump(db, jenis, { versi: require('../package.json').version }), err = B.periksaDump(d.buf, B.sha(d.buf), d.manifest);
    if (err) throw new Error('Verifikasi ' + jenis + ' gagal: ' + err);
    const nama = `sima-${jenis}-${cap}.ndjson.gz`; fs.writeFileSync(path.join(dir, nama), d.buf, { mode: 0o600 });
    const dibaca = fs.readFileSync(path.join(dir, nama)); if (B.sha(dibaca) !== B.sha(d.buf)) throw new Error('Berkas ' + nama + ' rusak saat ditulis.');
    info.berkas.push({ nama, jenis, ukuran: d.buf.length, sha256: B.sha(d.buf), baris: d.baris, tabel: d.tabel }); console.log('OK  ' + nama + ' (' + d.buf.length + ' B, ' + d.baris + ' baris, terverifikasi)');
  }
  fs.writeFileSync(path.join(dir, `sima-paket-${cap}.json`, ), JSON.stringify(info, null, 2), { mode: 0o600 });
  console.log('Selesai. Simpan folder ini di tempat terpisah dan terenkripsi. Jangan unggah ke lokasi publik.'); await db.close();
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1); });
