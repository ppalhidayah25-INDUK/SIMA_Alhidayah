'use strict';
// Membuat Super Admin pertama. Password diketik (tersembunyi) dan tidak disimpan di berkas apa pun.
const readline = require('readline');
const { getDb, migrate } = require('../lib/sima/db');
const { validatePassword, hashPassword } = require('../lib/sima/security');

function ask(q, hidden) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = s => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, a => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a); });
  });
}
(async () => {
  const db = getDb(); await migrate(db);
  const n = (await db.q("SELECT COUNT(*)::int n FROM users WHERE role='super_admin'"))[0].n;
  if (n > 0 && process.argv[2] !== '--force') { console.error('Super Admin sudah ada. Gunakan menu Manajemen Pengguna, atau jalankan dengan --force.'); process.exit(1); }
  const env = process.env, nonInteractive = !!env.ADMIN_PASSWORD;
  const username = (env.ADMIN_USERNAME || await ask('Username: ')).trim();
  const nama = (env.ADMIN_NAMA || await ask('Nama lengkap: ')).trim();
  const email = (env.ADMIN_EMAIL !== undefined ? env.ADMIN_EMAIL : nonInteractive ? '' : await ask('Email (boleh kosong): ')).trim() || null;
  const pw = env.ADMIN_PASSWORD || await ask('Password (min. 12, huruf besar/kecil/angka): ', true);
  const err = validatePassword(pw); if (err) { console.error(err); process.exit(1); }
  if (!nonInteractive && (await ask('Ulangi password: ', true)) !== pw) { console.error('Password tidak sama.'); process.exit(1); }
  const t = Date.now();
  await db.q("INSERT INTO users (username,email,nama,password_hash,role,aktif,dibuat,diubah) VALUES ($1,$2,$3,$4,'super_admin',TRUE,$5,$5)", [username, email, nama, await hashPassword(pw), t]);
  await db.q("INSERT INTO activity_log (waktu,user_id,username,aksi,modul,keterangan) VALUES ($1,NULL,'sistem','tambah','pengguna',$2)", [t, `Super Admin pertama dibuat lewat skrip: ${username}`]);
  console.log(`Super Admin "${username}" berhasil dibuat.`);
  await db.close();
})().catch(e => { console.error(e.message); process.exit(1); });
