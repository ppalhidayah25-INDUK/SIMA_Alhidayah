'use strict';
process.env.SIMA_BCRYPT_COST = '4';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { createDev } = require('../dev-server');
const { memoryDb } = require('../lib/sima/db');

let base, results = [], failed = 0, db;
const root = path.join(__dirname, '..');

function client() {
  let cookie = '', csrf = '';
  const c = {
    async req(method, url, body, opt = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (cookie) headers.Cookie = cookie;
      if (method !== 'GET' && !opt.noCsrf) headers['X-CSRF-Token'] = opt.csrf || csrf;
      if (opt.origin) headers.Origin = opt.origin;
      const r = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
      const sc = r.headers.get('set-cookie'); if (sc) { const m = /sima_sid=([^;]*)/.exec(sc); if (m) cookie = m[1] ? 'sima_sid=' + m[1] : ''; }
      const ct = r.headers.get('content-type') || ''; const text = await r.text();
      return { status: r.status, json: ct.includes('json') ? JSON.parse(text) : null, text, headers: r.headers };
    },
    async buf(url) { const r = await fetch(base + url, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' }); return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), headers: r.headers }; },
    async login(id, pw) { const r = await c.req('POST', '/api/sima/auth/login', { identifier: id, password: pw }, { noCsrf: true }); if (r.status === 200) { const me = await c.req('GET', '/api/sima/me'); csrf = me.json.csrf; } return r; }
  };
  return c;
}
async function t(name, fn) { if (process.env.TRACE) console.error('>>', name); try { await fn(); results.push('  ok   ' + name); } catch (e) { failed++; results.push('  GAGAL ' + name + '\n         ' + String(e.message || e).split('\n').slice(0, 6).join(' | ')); } }
const q = (sql, p) => db.q(sql, p);
const get = async (sql, p) => (await q(sql, p))[0];
const mk = async (u, role, pw, extra = {}) => { const n = Date.now(); await q('INSERT INTO users (username,email,nama,password_hash,role,aktif,dibuat,diubah) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)', [u, u + '@x.id', extra.nama || u, bcrypt.hashSync(pw, 4), role, extra.aktif !== 0, n]); };
const uid = async name => (await get('SELECT id FROM users WHERE username=$1', [name])).id;
const rejects = async (p, re, msg) => { let ok = false; try { await p; } catch (e) { ok = re.test(String(e.message)); if (!ok) throw new Error('pesan salah: ' + e.message); } assert.ok(ok, msg || 'seharusnya ditolak'); };
const PW = 'KataSandi-Kuat1', A = '/api/sima';

(async () => {
  db = await memoryDb();
  const app = await createDev(db);
  const srv = app.listen(0); base = 'http://127.0.0.1:' + srv.address().port;
  await mk('admin', 'super_admin', PW, { nama: 'Admin Uji' });

  // ===== 1. Login & logout =====
  await t('1a. API terlindungi menolak tanpa login (401)', async () => {
    const c = client(); for (const u of ['me', 'users', 'santri', 'dashboard', 'log', 'keuangan/tagihan']) assert.strictEqual((await c.req('GET', `${A}/${u}`)).status, 401, u);
  });
  await t('1b. Login salah ditolak dengan pesan umum', async () => {
    const r = await client().login('admin', 'salah-salah-salah'); assert.strictEqual(r.status, 401); assert.ok(!/admin/i.test(r.json.error));
    assert.strictEqual((await client().login('tidakada', 'apapun')).json.error, r.json.error);
  });
  await t('1c. Login benar; cookie HttpOnly + SameSite; token tidak tersimpan polos', async () => {
    const c = client(); const r = await c.login('admin', PW); assert.strictEqual(r.status, 200);
    const sc = r.headers.get('set-cookie'); assert.ok(/HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc), sc);
    const tok = decodeURIComponent(/sima_sid=([^;]+)/.exec(sc)[1]); assert.strictEqual((await get('SELECT COUNT(*)::int n FROM sessions WHERE id=$1', [tok])).n, 0);
    assert.strictEqual((await c.req('GET', `${A}/me`)).json.user.role, 'super_admin');
  });
  await t('1d. Login dengan email berfungsi (tanpa peduli huruf besar/kecil)', async () => { assert.strictEqual((await client().login('ADMIN@x.id', PW)).status, 200); assert.strictEqual((await client().login('Admin', PW)).status, 200); });
  await t('1e. Password tersimpan sebagai hash bcrypt', async () => { assert.ok(/^\$2[aby]\$/.test((await get("SELECT password_hash h FROM users WHERE username='admin'")).h)); });
  await t('1f. Logout mengakhiri sesi', async () => { const c = client(); await c.login('admin', PW); assert.strictEqual((await c.req('POST', `${A}/auth/logout`, {})).status, 200); assert.strictEqual((await c.req('GET', `${A}/me`)).status, 401); });
  await t('1g. Akun terkunci setelah 5 kali salah', async () => { await mk('korban', 'keamanan', PW); const c = client(); for (let i = 0; i < 5; i++) await c.login('korban', 'salah-salah-1A'); assert.strictEqual((await c.login('korban', PW)).status, 429); });
  await t('1h. Akun nonaktif tidak bisa login', async () => { await mk('mati', 'bendahara', PW, { aktif: 0 }); assert.strictEqual((await client().login('mati', PW)).status, 401); });
  await t('1i. Input login tidak valid ditolak (400)', async () => { assert.strictEqual((await client().req('POST', `${A}/auth/login`, { identifier: '', password: '' }, { noCsrf: true })).status, 400); });
  await t('1j. SQL injection pada login tidak berhasil', async () => { assert.strictEqual((await client().login("' OR 1=1 --", "' OR 1=1 --")).status, 401); });

  // ===== 2. Pembuatan akun & validasi =====
  const adm = client(); await adm.login('admin', PW);
  await t('2a. CSRF: perubahan tanpa token ditolak', async () => { assert.strictEqual((await adm.req('POST', `${A}/users`, { username: 'x1', nama: 'X', role: 'bendahara', password: PW }, { noCsrf: true })).status, 403); });
  await t('2b. CSRF: token salah ditolak', async () => { assert.strictEqual((await adm.req('POST', `${A}/users`, {}, { csrf: 'palsu' })).status, 403); });
  await t('2c. CSRF: Origin asing ditolak', async () => { assert.strictEqual((await adm.req('POST', `${A}/users`, {}, { origin: 'https://jahat.example' })).status, 403); });
  await t('2d. Super Admin membuat Bendahara & Keamanan', async () => {
    assert.strictEqual((await adm.req('POST', `${A}/users`, { username: 'bendahara1', nama: 'Bendahara Uji', role: 'bendahara', password: PW })).status, 201);
    assert.strictEqual((await adm.req('POST', `${A}/users`, { username: 'keamanan1', nama: 'Keamanan Uji', role: 'keamanan', password: PW })).status, 201);
  });
  await t('2e. Role di luar tiga role ditolak (API)', async () => {
    for (const role of ['ketua', 'sekretaris', 'pengajar', 'editor', 'admin_media', 'Super Admin', '']) assert.strictEqual((await adm.req('POST', `${A}/users`, { username: 'u' + Math.random().toString(36).slice(2, 8), nama: 'Uji', role, password: PW })).status, 400, role);
  });
  await t('2f. Role di luar tiga role ditolak (database)', async () => { await rejects(mk('curang', 'ketua', PW), /check|violates/i); });
  await t('2g. Password lemah ditolak', async () => { for (const p of ['pendek1A', 'semuahurufkecil1', 'SEMUAHURUFBESAR1', 'TanpaAngkaSamaSekali']) assert.strictEqual((await adm.req('POST', `${A}/users`, { username: 'lemah', nama: 'Lemah', role: 'bendahara', password: p })).status, 400, p); });
  await t('2h. Username ganda ditolak (409), tanpa peduli huruf besar/kecil', async () => { assert.strictEqual((await adm.req('POST', `${A}/users`, { username: 'BENDAHARA1', nama: 'Dobel', role: 'bendahara', password: PW })).status, 409); });
  await t('2i. Super Admin terakhir tidak bisa diturunkan/dinonaktifkan', async () => {
    const id = await uid('admin');
    assert.strictEqual((await adm.req('PATCH', `${A}/users/${id}`, { nama: 'Admin Uji', role: 'bendahara' })).status, 409);
    assert.strictEqual((await adm.req('PATCH', `${A}/users/${id}`, { aktif: false })).status, 409);
  });
  await t('2j. ID pengguna tidak valid ditangani (404, bukan error server)', async () => { assert.strictEqual((await adm.req('PATCH', `${A}/users/abc`, { nama: 'Uji' })).status, 404); });

  // data uji (struktur saja; DB sementara di memori, bukan data pondok)
  const ts = Date.now();
  const aPutra = (await get("INSERT INTO asrama (jenis,nama) VALUES ('putra','Asrama-Uji-Putra') RETURNING id")).id;
  const aPutri = (await get("INSERT INTO asrama (jenis,nama) VALUES ('putri','Asrama-Uji-Putri') RETURNING id")).id;
  const kPutra = (await get("INSERT INTO kamar (asrama_id,nama,kapasitas) VALUES ($1,'K-UJI-1',2) RETURNING id", [aPutra])).id;
  const kPutri = (await get("INSERT INTO kamar (asrama_id,nama,kapasitas) VALUES ($1,'K-UJI-2',1) RETURNING id", [aPutri])).id;
  const insS = (nis, nama, jk, alamat, wali, tel, kamar) => q('INSERT INTO santri (nis,nama,jenis_kelamin,alamat,nama_wali,telepon,kamar_id,dibuat,diubah) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)', [nis, nama, jk, alamat, wali, tel, kamar, ts]);
  await insS('U1', 'Santri Uji Putra', 'L', 'Alamat-Rahasia', 'Wali-Rahasia', '0800', kPutra);
  await insS('U2', 'Santri Uji Putri', 'P', 'Alamat-Rahasia', 'Wali-Rahasia', '0800', kPutri);

  // ===== 3. Bendahara =====
  const ben = client(); await ben.login('bendahara1', PW);
  await t('3a. Bendahara ditolak ke modul terlarang (URL/API langsung)', async () => {
    for (const u of ['users', 'log', 'pengurus?kelompok=putra', 'pengajar', 'asrama', 'kamar', 'alumni', 'alumni/statistik', 'jabatan?kelompok=putra', 'penempatan/riwayat', 'keamanan/dashboard', 'pengaturan', 'pendidikan/dashboard', 'konten/dashboard']) assert.strictEqual((await ben.req('GET', `${A}/${u}`)).status, 403, u);
  });
  await t('3b. Bendahara tidak bisa membuat/mengubah akun', async () => {
    assert.strictEqual((await ben.req('POST', `${A}/users`, { username: 'x', nama: 'x', role: 'super_admin', password: PW })).status, 403);
    assert.strictEqual((await ben.req('PATCH', `${A}/users/1`, { role: 'bendahara' })).status, 403);
    assert.strictEqual((await ben.req('POST', `${A}/users/1/password`, { password: PW })).status, 403);
  });
  await t('3c. Bendahara hanya melihat identitas untuk keuangan', async () => {
    const r = await ben.req('GET', `${A}/santri`); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.rows.length, 2);
    const txt = JSON.stringify(r.json); for (const s of ['Alamat-Rahasia', 'Wali-Rahasia', '0800', 'K-UJI', 'alamat', 'nama_wali', 'kamar']) assert.ok(!txt.includes(s), 'bocor: ' + s);
    assert.deepStrictEqual(Object.keys(r.json.rows[0]).sort(), ['id', 'kelompok', 'nama', 'nis', 'status', 'tahun_masuk']);
  });
  await t('3d. Bendahara tidak punya endpoint tulis data santri', async () => { assert.strictEqual((await ben.req('POST', `${A}/santri`, { nama: 'x', jenis_kelamin: 'L' })).status, 403); assert.strictEqual((await ben.req('PATCH', `${A}/santri/1`, { nama: 'x' })).status, 403); assert.strictEqual((await ben.req('DELETE', `${A}/santri/1`)).status, 404); });
  await t('3e. Dashboard Bendahara tidak memuat data pondok lain', async () => { assert.deepStrictEqual(Object.keys((await ben.req('GET', `${A}/dashboard`)).json), ['role']); });
  await t('3f. Pusat Laporan aktif untuk Super Admin; Bendahara tidak boleh membuka Keamanan', async () => { assert.strictEqual((await adm.req('GET', `${A}/laporan/katalog`)).status, 200); assert.strictEqual((await ben.req('GET', `${A}/keamanan/dashboard`)).status, 403); });

  // ===== 4. Keamanan =====
  const kea = client(); await kea.login('keamanan1', PW);
  await t('4a. Keamanan ditolak ke modul terlarang', async () => { for (const u of ['users', 'log', 'keuangan/tagihan', 'keuangan/kas', 'pengurus?kelompok=putri', 'asrama?jenis=putri', 'alumni', 'pengaturan']) assert.strictEqual((await kea.req('GET', `${A}/${u}`)).status, 403, u); });
  await t('4b. Keamanan hanya melihat identitas + asrama/kamar', async () => {
    const r = await kea.req('GET', `${A}/santri?kelompok=putri`); assert.strictEqual(r.json.rows.length, 1);
    const txt = JSON.stringify(r.json); for (const s of ['Alamat-Rahasia', 'Wali-Rahasia', '0800', 'telepon', 'saldo', 'nominal']) assert.ok(!txt.includes(s), 'bocor: ' + s);
    assert.deepStrictEqual(Object.keys(r.json.rows[0]).sort(), ['asrama', 'foto', 'id', 'kamar', 'kelompok', 'nama', 'nis', 'status']);
  });
  await t('4c. Keamanan tidak bisa mengelola akun', async () => { assert.strictEqual((await kea.req('POST', `${A}/users`, { username: 'y', nama: 'y', role: 'keamanan', password: PW })).status, 403); });
  await t('4d. Menaikkan role lewat body tidak berpengaruh', async () => { const id = await uid('keamanan1'); assert.strictEqual((await kea.req('PATCH', `${A}/users/${id}`, { role: 'super_admin' })).status, 403); assert.strictEqual((await get('SELECT role FROM users WHERE id=$1', [id])).role, 'keamanan'); });

  // ===== 4x. Pembatasan di level DATABASE (role Postgres) =====
  const asRole = (role, sql) => db.tx(async x => { await x(`SET LOCAL ROLE ${role}`); return x(sql); });
  await t('4e. Role DB keuangan: hanya view terpangkas, tabel lain ditolak', async () => {
    assert.strictEqual((await asRole('sima_keuangan', 'SELECT * FROM v_santri_keuangan')).length, 2);
    for (const tb of ['santri', 'users', 'activity_log', 'sessions', 'v_santri_keamanan', 'kamar']) await rejects(asRole('sima_keuangan', `SELECT * FROM ${tb}`), /permission denied/i, tb);
  });
  await t('4f. Role DB keamanan: hanya view keamanan; tidak bisa baca keuangan/akun', async () => {
    assert.strictEqual((await asRole('sima_keamanan', 'SELECT * FROM v_santri_keamanan')).length, 2);
    for (const tb of ['santri', 'users', 'v_santri_keuangan', 'sessions']) await rejects(asRole('sima_keamanan', `SELECT * FROM ${tb}`), /permission denied/i, tb);
  });
  await t('4g. Role DB pembatas tidak bisa menulis apa pun', async () => {
    await rejects(asRole('sima_keuangan', "UPDATE santri SET nama='x'"), /permission denied/i);
    await rejects(asRole('sima_keamanan', 'DELETE FROM users'), /permission denied/i);
    await rejects(asRole('sima_keamanan', "INSERT INTO activity_log (waktu,aksi,modul,keterangan) VALUES (1,'x','x','x')"), /permission denied/i);
  });

  // ===== 5. Super Admin =====
  await t('5a. Super Admin mengakses semua modul yang tersedia', async () => { for (const u of ['users', 'log', 'dashboard', 'santri?kelompok=putra', 'pengurus?kelompok=putra', 'pengajar', 'asrama?jenis=putri', 'alumni', 'alumni/statistik']) assert.strictEqual((await adm.req('GET', `${A}/${u}`)).status, 200, u); });
  await t('5b. Dashboard memakai data nyata', async () => { const d = (await adm.req('GET', `${A}/dashboard`)).json; assert.strictEqual(d.santri.total, 2); assert.strictEqual(d.santri.putra, 1); assert.strictEqual(d.pengurus.putra, 0); assert.strictEqual(d.asrama[0].kapasitas, 2); assert.strictEqual(d.alumni.total, 0); });
  await t('5c. Filter kelompok Putra/Putri bekerja', async () => {
    const a = (await adm.req('GET', `${A}/santri?kelompok=putra`)).json.rows, b = (await adm.req('GET', `${A}/santri?kelompok=putri`)).json.rows;
    assert.ok(a.length === 1 && a[0].jenis_kelamin === 'L'); assert.ok(b.length === 1 && b[0].jenis_kelamin === 'P'); assert.strictEqual((await adm.req('GET', `${A}/santri?kelompok=campur`)).status, 400);
  });
  await t('5d. Pencarian aman dari SQL injection', async () => {
    const r = await adm.req('GET', `${A}/santri?q=` + encodeURIComponent("' OR '1'='1")); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.rows.length, 0);
    assert.strictEqual((await adm.req('GET', `${A}/santri?q=Uji`)).json.rows.length, 2);
    assert.strictEqual((await ben.req('GET', `${A}/santri?q=` + encodeURIComponent("x'; DROP TABLE santri;--"))).status, 200); assert.strictEqual((await get('SELECT COUNT(*)::int n FROM santri')).n, 2);
  });
  await t('5e. Ubah role mencabut sesi lama pengguna tersebut', async () => {
    const id = await uid('bendahara1'); const c2 = client(); await c2.login('bendahara1', PW);
    assert.strictEqual((await adm.req('PATCH', `${A}/users/${id}`, { nama: 'Bendahara Uji', role: 'keamanan' })).status, 200);
    assert.strictEqual((await c2.req('GET', `${A}/me`)).status, 401);
    assert.strictEqual((await adm.req('PATCH', `${A}/users/${id}`, { nama: 'Bendahara Uji', role: 'bendahara' })).status, 200);
  });
  await t('5f. Menonaktifkan akun langsung memutus sesinya', async () => { await mk('sementara', 'keamanan', PW); const c2 = client(); await c2.login('sementara', PW); assert.strictEqual((await adm.req('PATCH', `${A}/users/${await uid('sementara')}`, { aktif: false })).status, 200); assert.strictEqual((await c2.req('GET', `${A}/me`)).status, 401); });
  await t('5g. Reset password mengakhiri sesi; password lama tidak berlaku', async () => {
    await mk('resetme', 'keamanan', PW); const c2 = client(); await c2.login('resetme', PW);
    assert.strictEqual((await adm.req('POST', `${A}/users/${await uid('resetme')}/password`, { password: 'PasswordBaru-99x' })).status, 200);
    assert.strictEqual((await c2.req('GET', `${A}/me`)).status, 401); assert.strictEqual((await client().login('resetme', PW)).status, 401); assert.strictEqual((await client().login('resetme', 'PasswordBaru-99x')).status, 200);
  });
  await t('5h. Super Admin tidak bisa menurunkan dirinya sendiri', async () => { await mk('admin2', 'super_admin', PW); assert.strictEqual((await adm.req('PATCH', `${A}/users/${await uid('admin')}`, { nama: 'Admin Uji', role: 'bendahara' })).status, 409); });

  // ===== 6. Activity log =====
  await t('6a. Aktivitas penting tercatat', async () => {
    const acts = new Set((await q('SELECT aksi FROM activity_log')).map(r => r.aksi));
    for (const a of ['login', 'logout', 'login_gagal', 'tambah', 'ubah', 'hak_akses', 'akses_ditolak']) assert.ok(acts.has(a), 'tidak tercatat: ' + a);
    const r = await get("SELECT * FROM activity_log WHERE aksi='akses_ditolak' LIMIT 1"); assert.ok(r.waktu && r.username && r.keterangan);
  });
  await t('6b. Log tidak berisi password', async () => { assert.ok(!JSON.stringify(await q('SELECT * FROM activity_log')).includes(PW)); });
  await t('6c. Log append-only (tidak bisa diubah/dihapus)', async () => { await rejects(q("UPDATE activity_log SET keterangan='x' WHERE id=1"), /append-only/); await rejects(q('DELETE FROM activity_log'), /append-only/); });
  await t('6d. Hanya Super Admin yang dapat melihat log', async () => { assert.strictEqual((await adm.req('GET', `${A}/log?page=1`)).status, 200); assert.strictEqual((await kea.req('GET', `${A}/log`)).status, 403); });

  // ===== 7. Putra / Putri di level data =====
  const ins = (nis, jk, k) => insS(nis, 'Uji ' + nis, jk, null, null, null, k);
  await t('7a. Santri Putra tidak bisa ditempatkan di kamar Asrama Putri', async () => { await rejects(ins('P1', 'L', kPutri), /tidak sesuai jenis kelamin/); });
  await t('7b. Santri Putri tidak bisa ditempatkan di kamar Asrama Putra', async () => { await rejects(ins('P2', 'P', kPutra), /tidak sesuai jenis kelamin/); });
  await t('7c. Pemindahan kamar lintas jenis kelamin ditolak (UPDATE)', async () => { await rejects(q('UPDATE santri SET kamar_id=$1 WHERE nis=$2', [kPutri, 'U1']), /tidak sesuai/); });
  await t('7d. Mengubah jenis kelamin santri yang sudah berkamar ditolak', async () => { await rejects(q("UPDATE santri SET jenis_kelamin='P' WHERE nis='U1'"), /tidak sesuai/); });
  await t('7e. Kapasitas kamar diperiksa', async () => { await ins('K2', 'L', kPutra); await rejects(ins('K3', 'L', kPutra), /kapasitas/); });
  await t('7f. Kamar nonaktif tidak dapat dipakai', async () => { const k = (await get("INSERT INTO kamar (asrama_id,nama,kapasitas,status) VALUES ($1,'K-OFF',5,'perbaikan') RETURNING id", [aPutra])).id; await rejects(ins('K4', 'L', k), /tidak aktif/); });
  await t('7g. Kapasitas tidak boleh di bawah jumlah penghuni', async () => { await rejects(q('UPDATE kamar SET kapasitas=1 WHERE id=$1', [kPutra]), /Kapasitas baru/); });
  await t('7h. Kamar berpenghuni tidak bisa dipindah asrama', async () => { await rejects(q('UPDATE kamar SET asrama_id=$2 WHERE id=$1', [kPutra, aPutri]), /penghuni/); });
  await t('7i. Hanya asrama putra & putri; pengurus hanya putra/putri', async () => {
    await rejects(q("INSERT INTO asrama (jenis,nama) VALUES ('campur','X')"), /check|violates/i);
    await rejects(q("INSERT INTO pengurus (kelompok,nama,jabatan,dibuat,diubah) VALUES ('campur','Uji','Uji',1,1)"), /check|violates/i);
  });
  await t('7j. Jenis kelamin hanya L/P', async () => { await rejects(insS('J1', 'Uji J', 'X', null, null, null, null), /check|violates/i); });
  await t('7k. Santri tanpa kamar boleh (belum ditempatkan)', async () => { await ins('N1', 'P', null); assert.strictEqual((await get("SELECT COUNT(*)::int n FROM santri WHERE nis='N1'")).n, 1); });

  // ===== 8. Integrasi dengan website & konfigurasi Vercel =====
  await t('8a. Website publik tetap disajikan di / dan menu SIMA mengarah ke /sima', async () => {
    const r = await fetch(base + '/'); const tx = await r.text(); assert.strictEqual(r.status, 200); assert.ok(tx.includes('Alhidayah'));
    assert.strictEqual((tx.match(/href="\/sima"/g) || []).length, 3); assert.ok(!tx.includes('Tautan SIMA belum diatur'));
  });
  await t('8b. /sima menyajikan aplikasi SIMA; API tanpa login tetap 401', async () => {
    const r = await fetch(base + '/sima'); assert.strictEqual(r.status, 200); assert.ok((await r.text()).includes('sima.js'));
    assert.strictEqual((await fetch(base + '/sima/assets/sima.js')).status, 200); assert.strictEqual((await client().req('GET', `${A}/users`)).status, 401);
  });
  await t('8c. Header keamanan: CSP ketat untuk /sima (vercel.json) + nosniff pada API', async () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')); const h = cfg.headers.find(x => x.source.startsWith('/sima')).headers.reduce((a, x) => (a[x.key] = x.value, a), {});
    assert.ok(h['Content-Security-Policy'].includes("script-src 'self'") && !h['Content-Security-Policy'].includes('unsafe-inline') && h['X-Frame-Options'] === 'DENY');
    const r = await adm.req('GET', `${A}/me`); assert.ok(r.headers.get('x-content-type-options') && !r.headers.get('x-powered-by'));
  });
  await t('8d. API tidak di-cache', async () => { assert.ok((await adm.req('GET', `${A}/me`)).headers.get('cache-control').includes('no-store')); });
  await t('8e. Menu per role sesuai matriks', async () => {
    const m = async c => (await c.req('GET', `${A}/me`)).json.menu.map(x => x.id); const ben2 = client(); await ben2.login('bendahara1', PW);
    const a = await m(adm); assert.ok(['pengguna', 'log', 'pengaturan', 'berita'].every(x => a.includes(x)));
    assert.deepStrictEqual(await m(ben2), ['dashboard', 'santri', 'bendahara', 'laporan']); assert.deepStrictEqual(await m(kea), ['dashboard', 'santri', 'keamanan', 'laporan']);
  });
  await t('8f. JSON rusak ditangani (400, bukan crash)', async () => { const r = await fetch(base + `${A}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{rusak' }); assert.strictEqual(r.status, 400); });
  await t('8g. Kode sumber server tidak berada di folder publik (public/)', async () => {
    for (const p of ['lib', 'api', 'db', 'scripts', 'test', 'package.json', 'vercel.json', '.env']) assert.ok(!fs.existsSync(path.join(root, 'public', p)), p);
    for (const u of ['/lib/sima/app.js', '/db/schema.sql', '/package.json', '/.env']) assert.notStrictEqual((await fetch(base + u)).status, 200, u);
  });
  await t('8h. Fungsi serverless Vercel dimuat dan tanpa DATABASE_URL menjawab 500 terkontrol', async () => {
    const h = require('../api/sima/[...path].js'); let code, body; delete process.env.DATABASE_URL;
    await h({ url: '/api/sima/me', method: 'GET', headers: {} }, { statusCode: 200, setHeader() { }, end(b) { body = b; }, get statusCode() { return code; }, set statusCode(v) { code = v; } });
    assert.strictEqual(code, 500); assert.ok(JSON.parse(body).error.includes('DATABASE_URL'));
  });

  await require('./tahap2')({ t, client, adm, ben, kea, q, get, A, assert, rejects, db, mk, PW, uid, base: () => base });

  await require('./tahap3')({ t, client, adm, ben, kea, q, get, A, assert, rejects, db, mk, PW, uid, base: () => base });

  await require('./tahap4')({ t, client, adm, ben, kea, q, get, A, assert, rejects, db, mk, PW, uid, base: () => base });

  await require('./tahap5')({ t, client, adm, ben, kea, q, get, A, assert, rejects, db, mk, PW, uid, base: () => base });

  await require('./tahap6')({ t, client, adm, ben, kea, q, get, A, assert, rejects, db, mk, PW, uid, base: () => base });
  await require('./tahap7')({ t, client, adm, ben, kea, q, get, A, assert, rejects, db, mk, PW, uid, base: () => base });
  await require('./tahap8')({ t, client, adm, ben, kea, q, get, A, assert, rejects, db, mk, PW, uid, base: () => base });

  // ===== 9. Batas percobaan login per alamat IP (dijalankan terakhir) =====
  await t('9a. Terlalu banyak login gagal dari satu IP → 429', async () => {
    let got = 0; for (let i = 0; i < 25 && !got; i++) { const r = await client().login('hantu' + i, 'apapun-1A-apapun'); if (r.status === 429) got = r.status; }
    assert.strictEqual(got, 429);
  });

  srv.close(); await db.close();
  console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} lulus`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
