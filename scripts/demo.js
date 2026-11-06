'use strict';
// MODE COBA LOKAL: database sementara di memori + 3 akun uji dengan password acak yang dicetak di terminal.
// Data hilang saat dihentikan. Menolak berjalan bila DATABASE_URL (produksi) terisi. Jangan dipakai untuk data asli.
if (process.env.DATABASE_URL) { console.error('DATABASE_URL terisi: mode coba dihentikan agar tidak menyentuh database sungguhan.'); process.exit(1); }
const crypto = require('crypto');
const { memoryDb } = require('../lib/sima/db'); const { hashPassword } = require('../lib/sima/security'); const { createDev } = require('../dev-server');
(async () => {
  const db = await memoryDb(), t = Date.now(), pw = 'Coba-' + crypto.randomBytes(5).toString('hex') + 'Aa1';
  for (const [u, nama, role] of [['superadmin', 'Super Admin Coba', 'super_admin'], ['bendahara', 'Bendahara Coba', 'bendahara'], ['keamanan', 'Keamanan Coba', 'keamanan']])
    await db.q("INSERT INTO users (username,nama,password_hash,role,aktif,dibuat,diubah) VALUES ($1,$2,$3,$4,TRUE,$5,$5)", [u, nama, await hashPassword(pw), role, t]);
  const port = Number(process.env.PORT || 3000);
  (await createDev(db)).listen(port, '127.0.0.1', () => console.log(`\nSIMA mode coba: http://127.0.0.1:${port}/sima\nUsername: superadmin / bendahara / keamanan\nPassword (sama untuk ketiganya, hanya berlaku selama proses ini berjalan): ${pw}\nTekan Ctrl+C untuk berhenti; semua data coba hilang.\n`));
})();
