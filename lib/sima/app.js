'use strict';
const express = require('express');
const { makeAuth, validatePassword, hashPassword } = require('./security');
const P = require('./permissions');
const U = require('./util');

// Hanya API. Website publik dan antarmuka SIMA adalah berkas statis di public/.
function createApi(db) {
  const app = express();
  app.set('trust proxy', true);   // di Vercel, IP asli ada di X-Forwarded-For
  app.disable('x-powered-by');
  const log = (uid, uname, aksi, modul, ket, ip) =>
    db.q('INSERT INTO activity_log (waktu,user_id,username,aksi,modul,keterangan,ip,role) VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT role FROM users WHERE id=$2::bigint))', [Date.now(), uid || null, uname, aksi, modul, String(ket).slice(0, 500), ip || null]);
  const auth = makeAuth(db, log);
  const logBy = (req, aksi, modul, ket) => log(req.user && req.user.id, req.user && req.user.username, aksi, modul, ket, req.ip);
  const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  const api = express.Router();
  api.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
    next();
  });
  const small = express.json({ limit: '100kb' }), big = express.json({ limit: '4mb' });
  const isUpload = req => (req.method === 'PUT' || req.method === 'POST') && (/\/(foto|kk|dokumen)$/.test(req.path) || /^\/keuangan\/kas\/\d+\/bukti$/.test(req.path) || req.path === '/impor/analisis' || /^\/keamanan\/pelanggaran\/\d+\/lampiran$/.test(req.path) || (/^\/konten\/(media|berita)/.test(req.path)));
  api.use((req, res, next) => (isUpload(req) ? big : small)(req, res, next));
  api.use(ah(auth.loadSession));
  api.use(auth.csrfGuard);
  // Akun dengan password sementara hanya boleh mengganti password (atau keluar).
  api.use((req, res, next) => (req.user && req.user.wajib_ganti && !['/me', '/me/password', '/auth/logout'].includes(req.path))
    ? res.status(403).json({ error: 'Anda harus mengganti password sementara terlebih dahulu.', kode: 'wajib_ganti' }) : next());

  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const one = async (sql, p) => (await db.q(sql, p))[0];
  const count = async (sql, p) => (await one(sql, p)).n;
  const meOut = u => ({ id: u.id, username: u.username, email: u.email, nama: u.nama, role: u.role, roleLabel: P.ROLE_LABEL[u.role], wajib_ganti: !!u.wajib_ganti });

  // --- Auth ---
  api.post('/auth/login', ah(async (req, res) => {
    const id = str(req.body && req.body.identifier, 120), pw = req.body && req.body.password;
    if (!id || typeof pw !== 'string' || !pw) return res.status(400).json({ error: 'Username/email dan password wajib diisi.' });
    const r = await auth.login(id, pw, req, res);
    if (r.error) return res.status(r.status || 401).json({ error: r.error });
    res.json({ ok: true, wajib_ganti: !!r.wajib_ganti });
  }));
  api.post('/auth/logout', ah(async (req, res) => {
    if (req.user) await logBy(req, 'logout', 'auth', 'Logout');
    await auth.logout(req, res); res.json({ ok: true });
  }));
  api.get('/me', auth.requireAuth, (req, res) => res.json({ user: meOut(req.user), csrf: req.session.csrf, menu: P.menuFor(req.user.role) }));

  // --- Dashboard (semua angka dari database; kosong = 0) ---
  api.get('/dashboard', auth.requireModule('dashboard'), ah(async (req, res) => {
    const out = { role: req.user.role };
    if (req.user.role === 'super_admin') {
      const AK = "status='aktif' AND NOT diarsipkan";
      out.santri = await one(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE jenis_kelamin='L')::int putra, COUNT(*) FILTER (WHERE jenis_kelamin='P')::int putri FROM santri WHERE ${AK}`);
      out.alumni = await one("SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE jenis_kelamin='L')::int putra, COUNT(*) FILTER (WHERE jenis_kelamin='P')::int putri, COUNT(*) FILTER (WHERE status_alumni='lulus')::int lulus, COUNT(*) FILTER (WHERE status_alumni='berhenti')::int berhenti FROM santri WHERE status='alumni' AND NOT diarsipkan");
      out.pengurus = await one("SELECT COUNT(*) FILTER (WHERE kelompok='putra')::int putra, COUNT(*) FILTER (WHERE kelompok='putri')::int putri FROM pengurus WHERE aktif AND NOT diarsipkan");
      out.pengajar = await one('SELECT COUNT(*)::int total FROM pengajar WHERE aktif AND NOT diarsipkan');
      out.asrama = [];
      for (const j of ['putra', 'putri']) {
        out.asrama.push(Object.assign({ jenis: j },
          await one('SELECT COUNT(*)::int jumlah FROM asrama WHERE jenis=$1 AND NOT diarsipkan', [j]),
          await one("SELECT COUNT(*)::int kamar, COALESCE(SUM(k.kapasitas) FILTER (WHERE k.status='aktif'),0)::int kapasitas FROM kamar k JOIN asrama a ON a.id=k.asrama_id WHERE a.jenis=$1 AND NOT k.diarsipkan AND NOT a.diarsipkan", [j]),
          await one(`SELECT COUNT(*)::int terisi FROM santri s JOIN kamar k ON k.id=s.kamar_id JOIN asrama a ON a.id=k.asrama_id WHERE a.jenis=$1 AND s.${AK.replace(/ AND NOT diarsipkan/, ' AND NOT s.diarsipkan')}`, [j])));
      }
      out.kamar = await one(`SELECT COUNT(*)::int total,
        COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM santri s WHERE s.kamar_id=k.id AND s.status='aktif' AND NOT s.diarsipkan) > 0)::int terisi,
        COUNT(*) FILTER (WHERE k.status='aktif' AND (SELECT COUNT(*) FROM santri s WHERE s.kamar_id=k.id AND s.status='aktif' AND NOT s.diarsipkan) < k.kapasitas)::int masih_ada_kapasitas
        FROM kamar k JOIN asrama a ON a.id=k.asrama_id WHERE NOT k.diarsipkan AND NOT a.diarsipkan`);
      out.santri_tanpa_kamar = await count(`SELECT COUNT(*)::int n FROM santri WHERE ${AK} AND kamar_id IS NULL`);
      out.pengguna = { aktif: await count('SELECT COUNT(*)::int n FROM users WHERE aktif'), nonaktif: await count('SELECT COUNT(*)::int n FROM users WHERE NOT aktif') };
      out.aktivitas = await db.q('SELECT waktu, username, aksi, modul, keterangan FROM activity_log ORDER BY id DESC LIMIT 8');
      // Ringkasan lintas modul (Tahap 7): semua angka dihitung langsung dari database.
      const bln = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7), dari = bln + '-01', today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), now = Date.now();
      out.keuangan = await one(`SELECT (SELECT COUNT(*)::int FROM v_keu_tagihan WHERE status_bayar IN ('belum','sebagian')) AS tagihan_belum_lunas,
        (SELECT COALESCE(SUM(sisa),0)::bigint FROM v_keu_tagihan WHERE status_bayar IN ('belum','sebagian') AND jatuh_tempo < $1::date) AS tunggakan,
        (SELECT COALESCE(SUM(nominal),0)::bigint FROM keu_pembayaran WHERE status='sah' AND tanggal >= $2::date AND tanggal <= $1::date) AS pembayaran_bulan_ini,
        (SELECT COALESCE(SUM(CASE WHEN jenis IN ('saldo_awal','masuk','pembalikan_keluar') THEN nominal ELSE -nominal END),0)::bigint FROM kas_transaksi) AS saldo_kas,
        (SELECT COALESCE(SUM(x.s),0)::bigint FROM (SELECT DISTINCT ON (rekening_id) saldo_sesudah AS s FROM tabungan_transaksi ORDER BY rekening_id, id DESC) x) AS saldo_tabungan`, [today, dari]);
      out.keamanan = await one(`SELECT (SELECT COUNT(*)::int FROM kea_pelanggaran WHERE NOT batal AND tanggal >= $1::date) AS pelanggaran_bulan_ini,
        (SELECT COUNT(*)::int FROM kea_pembinaan WHERE status<>'dibatalkan' AND tanggal >= $1::date) AS pembinaan_bulan_ini,
        (SELECT COUNT(*)::int FROM kea_izin WHERE status='sedang_izin') AS izin_berlangsung,
        (SELECT COUNT(*)::int FROM kea_izin WHERE status='sedang_izin' AND now() > rencana_kembali) AS belum_kembali`, [dari]);
      out.pendidikan = await one(`SELECT (SELECT COUNT(*)::int FROM edu_kelas WHERE aktif) AS kelas_aktif,
        (SELECT COUNT(DISTINCT p.santri_id)::int FROM edu_peserta p JOIN santri s ON s.id=p.santri_id WHERE p.status='aktif' AND s.status='aktif' AND NOT s.diarsipkan) AS peserta_aktif,
        (SELECT COUNT(*)::int FROM edu_sesi WHERE NOT batal AND tanggal >= $1::date) AS sesi_bulan_ini`, [dari]);
      out.konten = await one(`SELECT COUNT(*) FILTER (WHERE b.dihapus IS NULL)::int AS berita_total,
        COUNT(*) FILTER (WHERE b.dihapus IS NULL AND b.status IN ('terbit','terjadwal') AND b.terbit_pada <= $1)::int AS berita_terbit,
        COUNT(*) FILTER (WHERE b.dihapus IS NULL AND b.status='draft')::int AS berita_draft,
        (SELECT COUNT(*)::int FROM cms_galeri WHERE dihapus IS NULL) AS dokumentasi_total,
        (SELECT COUNT(*)::int FROM cms_galeri WHERE dihapus IS NULL AND jenis='foto') AS foto, (SELECT COUNT(*)::int FROM cms_galeri WHERE dihapus IS NULL AND jenis='video') AS video FROM cms_berita b`, [now]);
      const bk = (await db.q("SELECT paket FROM sys_backup GROUP BY paket HAVING BOOL_AND(status='terverifikasi') AND COUNT(*)=2 ORDER BY paket DESC LIMIT 1"))[0]; out.backup_terakhir = bk ? Number(bk.paket) : null;
    }
    res.json(out);
  }));

  // --- Modul Tahap 2 (data utama) ---
  const ctx = { db, auth, logBy, ah, one, count, hashPassword, validatePassword };
  require('./routes/berkas').register(api, ctx);
  require('./routes/santri').register(api, ctx);
  require('./routes/asrama').register(api, ctx);
  require('./routes/pengurus').register(api, ctx);
  require('./routes/pengajar').register(api, ctx);
  // --- Tahap 3: keuangan (Bendahara) ---
  require('./routes/keuangan').register(api, ctx);
  require('./routes/keamanan').register(api, ctx);
  require('./routes/pendidikan').register(api, ctx);
  require('./routes/konten').register(api, ctx);
  require('./routes/publik').register(api, ctx);
  require('./routes/keu-laporan').register(api, ctx);

  // --- Manajemen pengguna (Super Admin) ---
  const activeAdmins = () => count("SELECT COUNT(*)::int n FROM users WHERE role='super_admin' AND aktif");
  function checkUserInput(b, { create }) {
    const e = {}, out = {};
    out.username = str(b.username, 40); out.nama = str(b.nama, 100); out.email = str(b.email, 120) || null;
    if (create && !/^[A-Za-z0-9._-]{3,40}$/.test(out.username)) e.username = 'Username 3–40 karakter: huruf, angka, titik, garis bawah, atau strip.';
    if (out.nama.length < 2) e.nama = 'Nama wajib diisi (minimal 2 karakter).';
    if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.email)) e.email = 'Format email tidak valid.';
    out.role = b.role; if (!P.ROLES.includes(out.role)) e.role = 'Role harus Super Admin, Bendahara, atau Keamanan.';
    return { e, out };
  }
  const isUnique = err => err && err.code === '23505' || /unique|duplicate/i.test(String(err && err.message));
  api.get('/users', auth.requireModule('pengguna'), ah(async (req, res) => {
    res.json({ rows: await db.q('SELECT id, username, email, nama, role, aktif, terakhir_login, dibuat, wajib_ganti, password_diubah, (terkunci_sampai IS NOT NULL AND terkunci_sampai > (extract(epoch FROM now())*1000)::bigint) AS terkunci FROM users ORDER BY id'), roles: P.ROLES.map(r => ({ id: r, label: P.ROLE_LABEL[r] })) });
  }));
  api.post('/users', auth.requireModule('pengguna'), ah(async (req, res) => {
    const b = req.body || {}, { e, out } = checkUserInput(b, { create: true });
    const pe = validatePassword(b.password); if (pe) e.password = pe;
    if (Object.keys(e).length) return res.status(400).json({ error: 'Data belum valid.', fields: e });
    try {
      const t = Date.now();
      const r = await one('INSERT INTO users (username,email,nama,password_hash,role,aktif,dibuat,diubah) VALUES ($1,$2,$3,$4,$5,TRUE,$6,$6) RETURNING id', [out.username, out.email, out.nama, await hashPassword(b.password), out.role, t]);
      await logBy(req, 'tambah', 'pengguna', `Membuat akun ${out.username} (${P.ROLE_LABEL[out.role]})`);
      res.status(201).json({ id: r.id });
    } catch (err) { if (isUnique(err)) return res.status(409).json({ error: 'Username atau email sudah dipakai.' }); throw err; }
  }));
  api.patch('/users/:id', auth.requireModule('pengguna'), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const u = Number.isFinite(id) ? await one('SELECT * FROM users WHERE id=$1', [id]) : null;
    if (!u) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    const b = req.body || {};
    const { e, out } = checkUserInput({ nama: b.nama !== undefined ? b.nama : u.nama, email: b.email !== undefined ? b.email : u.email, role: b.role !== undefined ? b.role : u.role }, { create: false });
    const aktif = b.aktif === undefined ? u.aktif : !!b.aktif;
    if (Object.keys(e).length) return res.status(400).json({ error: 'Data belum valid.', fields: e });
    if (u.role === 'super_admin' && u.aktif && (out.role !== 'super_admin' || !aktif) && (await activeAdmins()) <= 1) return res.status(409).json({ error: 'Harus tersisa minimal satu Super Admin aktif.' });
    if (u.role === 'super_admin' && id !== req.user.id && (out.role !== 'super_admin' || !aktif) && b.konfirmasi_super_admin !== true) return res.status(409).json({ error: 'Akun Super Admin dilindungi: menonaktifkan atau mengubah role-nya memerlukan konfirmasi tambahan.', perlu_konfirmasi: true });
    if (id === req.user.id && (!aktif || out.role !== u.role)) return res.status(409).json({ error: 'Anda tidak dapat menonaktifkan atau mengubah role akun Anda sendiri.' });
    try { await db.q('UPDATE users SET nama=$1,email=$2,role=$3,aktif=$4,diubah=$5 WHERE id=$6', [out.nama, out.email, out.role, aktif, Date.now(), id]); }
    catch (err) { if (isUnique(err)) return res.status(409).json({ error: 'Email sudah dipakai.' }); throw err; }
    if (out.role !== u.role || aktif !== u.aktif) await auth.revokeUser(id);
    const ch = [];
    if (out.role !== u.role) ch.push(`role ${P.ROLE_LABEL[u.role]} → ${P.ROLE_LABEL[out.role]}`);
    if (aktif !== u.aktif) ch.push(aktif ? 'diaktifkan' : 'dinonaktifkan');
    if (out.nama !== u.nama || out.email !== u.email) ch.push('data profil');
    await logBy(req, out.role !== u.role ? 'hak_akses' : 'ubah', 'pengguna', `Mengubah akun ${u.username}: ${ch.join(', ') || 'tanpa perubahan'}`);
    res.json({ ok: true });
  }));
  api.post('/users/:id/password', auth.requireModule('pengguna'), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const u = Number.isFinite(id) ? await one('SELECT id, username FROM users WHERE id=$1', [id]) : null;
    if (!u) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    const pe = validatePassword(req.body && req.body.password);
    if (pe) return res.status(400).json({ error: pe, fields: { password: pe } });
    await db.q('UPDATE users SET password_hash=$1, login_gagal=0, terkunci_sampai=NULL, diubah=$2, password_diubah=$2, wajib_ganti=$4 WHERE id=$3', [await hashPassword(req.body.password), Date.now(), id, req.body.wajib_ganti === true]);
    await auth.revokeUser(id);
    await logBy(req, 'ubah', 'pengguna', `Mengatur ulang password akun ${u.username}`);
    res.json({ ok: true });
  }));

  // --- Tahap 7: laporan terpusat, backup, pengaturan sistem, keamanan akun, log ---
  require('./routes/laporan').register(api, ctx);
  require('./routes/impor').register(api, ctx);
  require('./routes/sistem').register(api, Object.assign({}, ctx, { logRaw: log }));
  api.all('*', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

  app.use('/api/sima', api);
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format data tidak valid.' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Data yang dikirim terlalu besar (maksimal berkas 2,5 MB).' });
    if (err && err.http) return res.status(err.http).json({ error: err.message, fields: err.fields });
    if (U.isBusinessErr(err)) return res.status(409).json({ error: err.message });
    if (U.isUnique(err)) return res.status(409).json({ error: 'Data ganda: nilai tersebut sudah dipakai.' });
    if (U.isFk(err)) return res.status(409).json({ error: 'Data masih dipakai oleh data lain.' });
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  });
  app.locals.db = db; app.locals.log = log;
  return app;
}
module.exports = { createApi };
