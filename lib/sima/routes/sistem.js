'use strict';
// Tahap 7: pengaturan sistem, backup & pemulihan, keamanan akun (ubah password, pemulihan akun, sesi, riwayat login), activity log terpusat,
// pemeriksaan konsistensi data, dan daftar kesiapan produksi. Semua khusus Super Admin kecuali /me/password.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const B = require('../backup');
const U = require('../util');
const P = require('../permissions');
const { SESI_DEF, SESI_BATAS } = require('../security');
const { DEF: IDENT_DEF } = require('../identitas');
const { pdfLaporan, xlsxLaporan } = require('./keu-laporan');
const { identitas, kop } = require('../identitas');
const VERSI = require('../../../package.json').version;

const BACKUP_DEF = { otomatis: false, frekuensi: 'harian', hari_minggu: 0, retensi_jumlah: 14, retensi_hari: 60 };
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const err = (m, f, http = 400) => Object.assign(new Error(m), { http, fields: f });
const jkt = ms => new Date(ms + 7 * 3600e3);
const needK = b => { if (!b || b.konfirmasi !== true) throw err('Aksi ini memerlukan konfirmasi.'); };
const rand = n => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; let s = ''; for (const b of crypto.randomBytes(n)) s += a[b % a.length]; return s; };

function register(api, { db, auth, logBy, logRaw, ah, one, count, hashPassword, validatePassword }) {
  const mod = auth.requireModule('pengaturan');
  const wrap = fn => ah(async (req, res, next) => { try { await fn(req, res, next); } catch (e) { if (e.http) return res.status(e.http).json({ error: e.message, fields: e.fields }); throw e; } });
  const getSet = async (k, def) => { const r = (await db.q('SELECT nilai FROM sys_pengaturan WHERE kunci=$1', [k]))[0]; return Object.assign({}, def, r ? (typeof r.nilai === 'string' ? JSON.parse(r.nilai) : r.nilai) : {}); };
  const putSet = (q, k, v, uid) => q('INSERT INTO sys_pengaturan (kunci,nilai,diubah,oleh) VALUES ($1,$2,$3,$4) ON CONFLICT (kunci) DO UPDATE SET nilai=EXCLUDED.nilai, diubah=EXCLUDED.diubah, oleh=EXCLUDED.oleh', [k, JSON.stringify(v), Date.now(), uid]);

  // ================= Pengaturan sistem =================
  api.get('/pengaturan', mod, wrap(async (req, res) => {
    const ident = await identitas(db.q.bind(db)), sesi = (await auth.cfg()).nilai, backup = await getSet('backup', BACKUP_DEF);
    res.json({ identitas: ident, sesi, sesi_batas: SESI_BATAS, backup, hari: HARI, versi: VERSI,
      hak_akses: P.ROLES.map(r => ({ role: r, label: P.ROLE_LABEL[r], modul: Object.keys(P.MODULE_ACCESS).filter(m => P.MODULE_ACCESS[m].includes(r)) })), modul: Object.keys(P.MODULE_ACCESS) });
  }));
  api.put('/pengaturan', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b); const e = {}, ch = [];
    if (b.identitas) {
      const i = b.identitas, v = { nama: U.str(i.nama, 150), alamat: U.str(i.alamat || '', 300), kontak: U.str(i.kontak || '', 150), catatan: U.str(i.catatan || '', 300) };
      if (v.nama.length < 3) e.identitas_nama = 'Nama pondok wajib diisi (minimal 3 karakter).';
      if (!e.identitas_nama) { await db.tx(async q => { await putSet(q, 'identitas', v, req.user.id); await q('INSERT INTO kea_pengaturan (kunci,nilai,diubah,oleh) VALUES ($1,$2,$3,$4) ON CONFLICT (kunci) DO UPDATE SET nilai=EXCLUDED.nilai, diubah=EXCLUDED.diubah, oleh=EXCLUDED.oleh', ['identitas', JSON.stringify(v), Date.now(), req.user.id]); }); ch.push('identitas pondok'); }
    }
    if (b.sesi) {
      const v = {}; for (const k of Object.keys(SESI_DEF)) { const n = Number(b.sesi[k]); if (!Number.isInteger(n) || n < SESI_BATAS[k][0] || n > SESI_BATAS[k][1]) e['sesi_' + k] = `Harus bilangan bulat ${SESI_BATAS[k][0]}–${SESI_BATAS[k][1]}.`; else v[k] = n; }
      if (!Object.keys(e).some(k => k.startsWith('sesi_'))) { await putSet(db.q.bind(db), 'sesi', v, req.user.id); auth.resetCfg(); ch.push('pengaturan sesi'); }
    }
    if (b.backup) {
      const x = b.backup, v = { otomatis: !!x.otomatis, frekuensi: ['harian', 'mingguan', 'bulanan'].includes(x.frekuensi) ? x.frekuensi : null, hari_minggu: Number(x.hari_minggu), retensi_jumlah: Number(x.retensi_jumlah), retensi_hari: Number(x.retensi_hari) };
      if (!v.frekuensi) e.backup_frekuensi = 'Pilih harian, mingguan, atau bulanan.'; if (!(v.hari_minggu >= 0 && v.hari_minggu <= 6)) e.backup_hari_minggu = 'Hari tidak valid.';
      if (!Number.isInteger(v.retensi_jumlah) || v.retensi_jumlah < 3 || v.retensi_jumlah > 60) e.backup_retensi_jumlah = 'Simpan 3–60 paket backup.'; if (!Number.isInteger(v.retensi_hari) || v.retensi_hari < 7 || v.retensi_hari > 730) e.backup_retensi_hari = 'Retensi 7–730 hari.';
      if (!Object.keys(e).some(k => k.startsWith('backup_'))) { await putSet(db.q.bind(db), 'backup', v, req.user.id); ch.push('pengaturan backup'); }
    }
    if (Object.keys(e).length) throw err('Pengaturan belum valid.', e);
    if (!ch.length) throw err('Tidak ada perubahan.');
    await logBy(req, 'ubah_pengaturan', 'sistem', 'Mengubah ' + ch.join(', ')); res.json({ ok: true, diubah: ch });
  }));

  // ================= Backup =================
  const META = 'id, paket, jenis, pemicu, mulai, selesai, oleh, status, ukuran, tabel, baris, ket, dibersihkan, (isi IS NOT NULL) AS ada_isi';
  api.get('/backup', mod, wrap(async (req, res) => {
    const rows = await db.q(`SELECT ${META} FROM sys_backup ORDER BY paket DESC, jenis LIMIT 120`), set = await getSet('backup', BACKUP_DEF);
    const last = (await db.q("SELECT paket FROM sys_backup GROUP BY paket HAVING BOOL_AND(status='terverifikasi') AND COUNT(*)=2 ORDER BY paket DESC LIMIT 1"))[0];
    const tot = (await db.q('SELECT COALESCE(SUM(ukuran) FILTER (WHERE isi IS NOT NULL),0)::bigint AS ukuran FROM sys_backup'))[0];
    const u = await db.q('SELECT id, username FROM users'); const nm = Object.fromEntries(u.map(x => [x.id, x.username]));
    res.json({ rows: rows.map(r => ({ ...r, petugas: r.oleh ? nm[r.oleh] || '—' : r.pemicu === 'terjadwal' ? 'jadwal otomatis' : 'sistem' })), pengaturan: set, terakhir_berhasil: last ? Number(last.paket) : null, total_ukuran: Number(tot.ukuran),
      cron_siap: !!process.env.CRON_SECRET, batas_unduh_web: process.env.VERCEL ? 4 * 1024 * 1024 : null });
  }));
  api.post('/backup', mod, wrap(async (req, res) => {
    needK(req.body); await logBy(req, 'backup_mulai', 'sistem', 'Backup manual dimulai');
    const r = await B.buatPaket(db, { pemicu: 'manual', oleh: req.user.id, versi: VERSI });
    await logBy(req, r.ok ? 'backup' : 'backup_gagal', 'sistem', `Backup manual ${r.ok ? 'berhasil dan terverifikasi' : 'GAGAL'} (paket ${r.paket}): ` + r.hasil.map(h => `${h.jenis} ${h.status}`).join(', '));
    res.status(r.ok ? 201 : 500).json(r);
  }));
  api.post('/backup/:id(\\d+)/verifikasi', mod, wrap(async (req, res) => {
    needK(req.body); const r = await B.verifikasi(db, +req.params.id); await logBy(req, 'backup_verifikasi', 'sistem', `Verifikasi backup #${r.id}: ${r.status}`); res.json(r);
  }));
  api.get('/backup/:id(\\d+)/unduh', mod, wrap(async (req, res) => {
    const r = (await db.q('SELECT jenis, paket, status, isi, ukuran FROM sys_backup WHERE id=$1', [+req.params.id]))[0];
    if (!r) throw err('Backup tidak ditemukan.', null, 404); if (!r.isi) throw err('Isi backup sudah dibersihkan (melewati retensi).', null, 410); if (r.status !== 'terverifikasi') throw err('Hanya backup yang terverifikasi yang dapat diunduh.', null, 409);
    if (process.env.VERCEL && r.ukuran > 4 * 1024 * 1024) throw err('Ukuran backup melebihi batas unduh lewat web (4 MB). Gunakan skrip: node scripts/backup.js (lihat docs/PEMULIHAN.md).', null, 413);
    await logBy(req, 'unduh_backup', 'sistem', `Mengunduh backup ${r.jenis} paket ${r.paket} (${r.ukuran} byte)`);
    const d = jkt(Number(r.paket)).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    res.set({ 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="sima-${r.jenis}-${d}.simabak"`, 'Content-Length': r.isi.length }).send(Buffer.from(r.isi));
  }));
  api.post('/backup/bersihkan', mod, wrap(async (req, res) => {
    needK(req.body); const set = await getSet('backup', BACKUP_DEF), n = await B.terapkanRetensi(db, { jumlah: set.retensi_jumlah, hari: set.retensi_hari });
    await logBy(req, 'backup_retensi', 'sistem', `Retensi backup diterapkan: ${n} isi backup dibersihkan`); res.json({ ok: true, dibersihkan: n });
  }));
  api.post('/backup/paket/:paket(\\d+)/pulihkan', mod, wrap(async (req, res) => {
    const b = req.body || {}; needK(b);
    if (b.teks !== 'PULIHKAN') throw err('Ketik PULIHKAN untuk melanjutkan.', { teks: 'Ketik PULIHKAN (huruf besar).' });
    const u = (await db.q('SELECT password_hash FROM users WHERE id=$1', [req.user.id]))[0];
    if (!u || typeof b.password !== 'string' || !(await bcrypt.compare(b.password, u.password_hash))) { await logBy(req, 'pemulihan_ditolak', 'sistem', 'Pemulihan ditolak: password konfirmasi salah'); throw err('Password konfirmasi salah.', { password: 'Password salah.' }, 403); }
    const rows = await db.q('SELECT id, jenis, status, isi, sha256, manifest FROM sys_backup WHERE paket=$1 ORDER BY jenis', [+req.params.paket]);
    if (rows.length !== 2 || rows.some(r => r.status !== 'terverifikasi' || !r.isi)) throw err('Paket backup tidak lengkap, belum terverifikasi, atau isinya sudah dibersihkan.', null, 409);
    const bufs = rows.map(r => Buffer.from(r.isi)); for (const [i, r] of rows.entries()) { const m = typeof r.manifest === 'string' ? JSON.parse(r.manifest) : r.manifest, e = B.periksaDump(bufs[i], r.sha256, m); if (e) throw err('Paket backup gagal diperiksa ulang: ' + e, null, 409); }
    await logBy(req, 'pemulihan_mulai', 'sistem', `Pemulihan dari paket ${req.params.paket} dimulai; membuat backup kondisi saat ini terlebih dahulu`);
    const pre = await B.buatPaket(db, { pemicu: 'sebelum_pemulihan', oleh: req.user.id, versi: VERSI });
    if (!pre.ok) { await logBy(req, 'pemulihan_dibatalkan', 'sistem', 'Pemulihan dibatalkan: backup kondisi saat ini gagal diverifikasi'); throw err('Pemulihan dibatalkan: backup kondisi saat ini gagal dibuat/diverifikasi. Data tidak diubah.', null, 500); }
    let hasil; const uid = req.user.id, uname = req.user.username, ip = req.ip;
    try { hasil = await B.pulihkan(db, bufs); } catch (e) { await logRaw(uid, uname, 'pemulihan_gagal', 'sistem', 'Pemulihan GAGAL dan dibatalkan; data tidak berubah: ' + e.message, ip); throw err('Pemulihan gagal dan dibatalkan. Data tidak berubah. ' + e.message, null, 500); }
    auth.resetCfg();
    await logRaw(uid, uname, 'pemulihan', 'sistem', `Pemulihan dari paket ${req.params.paket} selesai (${hasil.tabel} tabel, ${hasil.baris} baris). Backup sebelum pemulihan: paket ${pre.paket}`, ip);
    res.json({ ok: true, ...hasil, paket_sebelum: pre.paket, login_ulang: true });
  }));
  // Dipanggil Vercel Cron (header Authorization: Bearer CRON_SECRET). Tanpa sesi login.
  api.get('/backup/cron', ah(async (req, res) => {
    const sec = process.env.CRON_SECRET; if (!sec) return res.status(503).json({ error: 'CRON_SECRET belum dikonfigurasi.' });
    const got = String(req.headers.authorization || ''), want = 'Bearer ' + sec;
    if (got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return res.status(401).json({ error: 'Tidak diizinkan.' });
    const set = await getSet('backup', BACKUP_DEF); if (!set.otomatis) return res.json({ ok: true, dilewati: 'Backup otomatis tidak aktif.' });
    const now = Date.now(), t = jkt(now), last = (await db.q("SELECT MAX(paket) AS p FROM sys_backup WHERE pemicu='terjadwal'"))[0].p, umur = last ? now - Number(last) : Infinity;
    const due = set.frekuensi === 'harian' ? umur > 20 * 36e5 : set.frekuensi === 'mingguan' ? t.getUTCDay() === set.hari_minggu && umur > 6 * 864e5 : t.getUTCDate() === 1 && umur > 27 * 864e5;
    if (!due) return res.json({ ok: true, dilewati: 'Belum waktunya.' });
    const r = await B.buatPaket(db, { pemicu: 'terjadwal', oleh: null, versi: VERSI });
    await logRaw(null, 'sistem', r.ok ? 'backup' : 'backup_gagal', 'sistem', `Backup terjadwal ${r.ok ? 'berhasil dan terverifikasi' : 'GAGAL'} (paket ${r.paket})`, req.ip);
    if (r.ok) { const n = await B.terapkanRetensi(db, { jumlah: set.retensi_jumlah, hari: set.retensi_hari }); if (n) await logRaw(null, 'sistem', 'backup_retensi', 'sistem', `Retensi backup: ${n} isi dibersihkan`, req.ip); }
    res.status(r.ok ? 200 : 500).json({ ok: r.ok, paket: r.paket });
  }));

  // ================= Keamanan akun =================
  api.post('/me/password', auth.requireAuth, wrap(async (req, res) => {
    const b = req.body || {}, u = (await db.q('SELECT password_hash FROM users WHERE id=$1', [req.user.id]))[0];
    if (typeof b.lama !== 'string' || !(await bcrypt.compare(b.lama, u.password_hash))) { await logBy(req, 'ubah_password_gagal', 'auth', 'Ubah password gagal: password lama salah'); throw err('Password lama salah.', { lama: 'Password lama salah.' }); }
    const pe = validatePassword(b.baru); if (pe) throw err(pe, { baru: pe }); if (b.baru === b.lama) throw err('Password baru harus berbeda dari password lama.', { baru: 'Harus berbeda dari password lama.' });
    await db.q('UPDATE users SET password_hash=$1, wajib_ganti=FALSE, password_diubah=$2, diubah=$2 WHERE id=$3', [await hashPassword(b.baru), Date.now(), req.user.id]);
    await db.q('DELETE FROM sessions WHERE user_id=$1 AND id<>$2', [req.user.id, req.session.id]);
    await logBy(req, 'ubah_password', 'auth', 'Mengubah password sendiri; sesi lain diakhiri'); res.json({ ok: true });
  }));
  const target = async req => { const id = parseInt(req.params.id, 10), u = Number.isFinite(id) ? await one('SELECT id, username, role, aktif FROM users WHERE id=$1', [id]) : null; if (!u) throw err('Pengguna tidak ditemukan.', null, 404); return u; };
  api.get('/users/:id(\\d+)/riwayat-login', auth.requireModule('pengguna'), wrap(async (req, res) => {
    const u = await target(req); res.json({ rows: await db.q("SELECT waktu, aksi, keterangan, ip FROM activity_log WHERE (user_id=$1 OR (user_id IS NULL AND lower(username)=lower($2))) AND aksi IN ('login','login_gagal','logout','ubah_password','ubah_password_gagal') ORDER BY id DESC LIMIT 50", [u.id, u.username]) });
  }));
  api.get('/users/:id(\\d+)/sesi', auth.requireModule('pengguna'), wrap(async (req, res) => {
    const u = await target(req), c = await auth.cfg(), now = Date.now();
    res.json({ rows: (await db.q('SELECT id, dibuat, aktivitas, kedaluwarsa, ip, ua FROM sessions WHERE user_id=$1 AND kedaluwarsa > $2 AND aktivitas > $3 ORDER BY aktivitas DESC', [u.id, now, now - c.IDLE_MS])).map(s => ({ ref: s.id.slice(0, 16), dibuat: s.dibuat, aktivitas: s.aktivitas, ip: s.ip, ua: s.ua, ini: s.id === req.session.id })) });
  }));
  api.post('/users/:id(\\d+)/sesi/akhiri', auth.requireModule('pengguna'), wrap(async (req, res) => {
    needK(req.body); const u = await target(req), ref = U.str((req.body || {}).ref || '', 32);
    const n = ref ? (await db.q('DELETE FROM sessions WHERE user_id=$1 AND id LIKE $2 AND id<>$3 RETURNING id', [u.id, ref.replace(/[^a-f0-9]/g, '') + '%', req.session.id])).length : (await db.q('DELETE FROM sessions WHERE user_id=$1 AND id<>$2 RETURNING id', [u.id, req.session.id])).length;
    await logBy(req, 'akhiri_sesi', 'pengguna', `Mengakhiri ${n} sesi akun ${u.username}`); res.json({ ok: true, diakhiri: n });
  }));
  api.post('/users/:id(\\d+)/buka-kunci', auth.requireModule('pengguna'), wrap(async (req, res) => {
    needK(req.body); const u = await target(req); await db.q('UPDATE users SET login_gagal=0, terkunci_sampai=NULL, diubah=$1 WHERE id=$2', [Date.now(), u.id]); await logBy(req, 'ubah', 'pengguna', `Membuka kunci login akun ${u.username}`); res.json({ ok: true });
  }));
  // Pemulihan akun yang aman: password sementara acak, ditampilkan SEKALI, wajib diganti saat login berikutnya, semua sesi diakhiri. Tidak ada password bawaan.
  api.post('/users/:id(\\d+)/pemulihan', auth.requireModule('pengguna'), wrap(async (req, res) => {
    needK(req.body); const u = await target(req); if (u.id === req.user.id) throw err('Gunakan menu Ubah Password untuk akun Anda sendiri.', null, 409);
    const pw = rand(4) + '-' + rand(4) + '-' + rand(4) + 'aA7'; const pe = validatePassword(pw); if (pe) throw err('Gagal membuat password sementara.', null, 500);
    await db.q('UPDATE users SET password_hash=$1, wajib_ganti=TRUE, login_gagal=0, terkunci_sampai=NULL, diubah=$2 WHERE id=$3', [await hashPassword(pw), Date.now(), u.id]); await auth.revokeUser(u.id);
    await logBy(req, 'pemulihan_akun', 'pengguna', `Membuat password sementara untuk akun ${u.username} (wajib diganti saat login)`); res.json({ ok: true, password_sementara: pw, username: u.username });
  }));

  // ================= Activity log terpusat =================
  const LOGSEL = 'SELECT l.id, l.waktu, l.username, COALESCE(l.role, u.role) AS role, l.aksi, l.modul, l.keterangan, l.ip FROM activity_log l LEFT JOIN users u ON u.id=l.user_id';
  function logWhere(qs) {
    const w = U.where(), s = U.str(qs.q || '', 80); if (s) { const ph = w.push('%' + U.likeEsc(s) + '%'); w.add(`(l.keterangan ILIKE ${ph} OR COALESCE(l.username,'') ILIKE ${ph})`); }
    if (qs.modul) w.add('l.modul = ?', U.str(qs.modul, 40)); if (qs.aksi) w.add('l.aksi = ?', U.str(qs.aksi, 40)); if (P.ROLES.includes(qs.role)) w.add('COALESCE(l.role, u.role) = ?', qs.role);
    if (U.isDate(qs.dari)) w.add('l.waktu >= ' + w.push(Date.parse(qs.dari + 'T00:00:00+07:00'))); if (U.isDate(qs.sampai)) w.add('l.waktu < ' + w.push(Date.parse(qs.sampai + 'T00:00:00+07:00') + 864e5)); return w;
  }
  api.get('/log/ref', auth.requireModule('log'), wrap(async (req, res) => res.json({ modul: (await db.q('SELECT DISTINCT modul FROM activity_log ORDER BY 1')).map(r => r.modul), aksi: (await db.q('SELECT DISTINCT aksi FROM activity_log ORDER BY 1')).map(r => r.aksi) })));
  api.get('/log', auth.requireModule('log'), wrap(async (req, res) => {
    const w = logWhere(req.query), fmt = ['pdf', 'xlsx'].includes(req.query.format) ? req.query.format : 'json';
    if (fmt !== 'json') {
      const rows = await db.q(`${LOGSEL} ${w.sql} ORDER BY l.id DESC LIMIT 20000`, w.params());
      const rep = Object.assign({ jenis: 'log', judul: 'Laporan Aktivitas Sistem', filter: ['Dicetak ' + new Date().toISOString().slice(0, 10), `${rows.length} catatan (maks. 20.000 terbaru)`], ringkasan: [['Jumlah catatan', rows.length, 'int']], catatan: '' }, kop(await identitas(db.q.bind(db))));
      const wib = ms => new Date(Number(ms) + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
      rep.kolom = [{ k: '_no', t: 'No', tipe: 'no', w: 3 }, { k: 'w', t: 'Waktu (WIB)', tipe: 'txt', w: 7 }, { k: 'username', t: 'Akun', tipe: 'txt', w: 6 }, { k: 'rl', t: 'Role', tipe: 'txt', w: 6 }, { k: 'aksi', t: 'Aktivitas', tipe: 'txt', w: 6 }, { k: 'modul', t: 'Modul', tipe: 'txt', w: 6 }, { k: 'keterangan', t: 'Keterangan', tipe: 'txt', w: 22 }];
      rep.rows = rows.map(r => ({ ...r, w: wib(r.waktu), rl: P.ROLE_LABEL[r.role] || '' })); await logBy(req, 'unduh', 'log', `Mengunduh log aktivitas (${fmt.toUpperCase()}, ${rows.length} baris)`);
      const buf = fmt === 'pdf' ? await pdfLaporan(rep, req.user.username) : await xlsxLaporan(rep, req.user.username);
      return res.set({ 'Content-Type': fmt === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="log-aktivitas.${fmt}"` }).send(buf);
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1), size = 25;
    res.json({ total: (await one(`SELECT COUNT(*)::int n FROM activity_log l LEFT JOIN users u ON u.id=l.user_id ${w.sql}`, w.params())).n, page, size, rows: await db.q(`${LOGSEL} ${w.sql} ORDER BY l.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, w.params()) });
  }));

  // ================= Pemeriksaan konsistensi data =================
  api.get('/pengaturan/konsistensi', mod, wrap(async (req, res) => {
    const q = db.q.bind(db), out = [];
    const cek = async (id, judul, sql, ket) => { try { const r = await q(sql); out.push({ id, judul, ket, masalah: r.length, contoh: r.slice(0, 5), status: r.length ? 'perhatian' : 'ok' }); } catch (e) { out.push({ id, judul, ket, masalah: -1, contoh: [], status: 'error', galat: String(e.message).slice(0, 120) }); } };
    await cek('nis', 'NIS santri unik', "SELECT lower(nis) AS nis, COUNT(*)::int AS jumlah FROM santri WHERE nis IS NOT NULL GROUP BY 1 HAVING COUNT(*)>1", 'Tidak boleh ada NIS ganda.');
    await cek('alumni_kamar', 'Alumni tidak menghuni kamar', "SELECT id, nama FROM santri WHERE status='alumni' AND kamar_id IS NOT NULL", 'Alumni tidak dihitung sebagai penghuni aktif asrama.');
    await cek('kamar_penuh', 'Kamar tidak melebihi kapasitas', "SELECT k.id, k.nama, k.kapasitas, COUNT(s.id)::int AS penghuni FROM kamar k JOIN santri s ON s.kamar_id=k.id AND s.status='aktif' AND NOT s.diarsipkan GROUP BY k.id HAVING COUNT(s.id) > k.kapasitas", 'Jumlah penghuni aktif ≤ kapasitas.');
    await cek('jk_asrama', 'Santri berada di asrama sesuai jenis kelamin', "SELECT s.id, s.nama FROM santri s JOIN kamar k ON k.id=s.kamar_id JOIN asrama a ON a.id=k.asrama_id WHERE s.status='aktif' AND ((s.jenis_kelamin='L' AND a.jenis<>'putra') OR (s.jenis_kelamin='P' AND a.jenis<>'putri'))", 'Putra di asrama putra, putri di asrama putri.');
    await cek('riwayat_status', 'Alumni memiliki riwayat perpindahan status', "SELECT s.id, s.nama FROM santri s WHERE s.status='alumni' AND NOT EXISTS (SELECT 1 FROM riwayat_status r WHERE r.santri_id=s.id)", 'Perpindahan santri ke alumni harus tercatat.');
    await cek('no_kuitansi', 'Nomor kuitansi unik', 'SELECT no_kuitansi, COUNT(*)::int AS jumlah FROM keu_pembayaran GROUP BY 1 HAVING COUNT(*)>1', 'Nomor transaksi/kuitansi tidak ganda.');
    await cek('no_transaksi', 'Nomor transaksi tabungan dan kas unik', "SELECT no_transaksi, COUNT(*)::int AS jumlah FROM (SELECT no_transaksi FROM tabungan_transaksi UNION ALL SELECT no_transaksi FROM kas_transaksi) x GROUP BY 1 HAVING COUNT(*)>1", 'Tidak ada nomor ganda lintas tabungan/kas.');
    await cek('no_dokumen', 'Nomor izin, pelanggaran, dan pembinaan unik', "SELECT nomor, COUNT(*)::int AS jumlah FROM (SELECT nomor FROM kea_izin UNION ALL SELECT nomor FROM kea_pelanggaran UNION ALL SELECT nomor FROM kea_pembinaan) x GROUP BY 1 HAVING COUNT(*)>1", 'Nomor dokumen tidak ganda.');
    await cek('tagihan_lebih', 'Pembayaran tidak melebihi tagihan', 'SELECT id, santri, kategori, sisa FROM v_keu_tagihan WHERE sisa < 0', 'Sisa tagihan tidak boleh negatif.');
    await cek('saldo_tab', 'Rantai saldo tabungan konsisten', "SELECT rekening_id, id FROM (SELECT id, rekening_id, saldo_sebelum, saldo_sesudah, LAG(saldo_sesudah) OVER (PARTITION BY rekening_id ORDER BY id) AS prev FROM tabungan_transaksi) x WHERE saldo_sesudah < 0 OR (prev IS NOT NULL AND prev <> saldo_sebelum) OR (prev IS NULL AND saldo_sebelum <> 0)", 'Saldo sebelum = saldo sesudah transaksi sebelumnya; tidak negatif.');
    await cek('presensi_ganda', 'Presensi tidak dihitung ganda', 'SELECT sesi_id, santri_id, COUNT(*)::int AS jumlah FROM edu_presensi GROUP BY 1,2 HAVING COUNT(*)>1', 'Satu santri satu presensi per sesi.');
    await cek('berita_galeri', 'Relasi berita dan galeri tidak rusak', "SELECT b.id, b.judul, g.judul AS dokumentasi FROM cms_berita_galeri bg JOIN cms_berita b ON b.id=bg.berita_id JOIN cms_galeri g ON g.id=bg.galeri_id WHERE b.status IN ('terbit','terjadwal') AND b.dihapus IS NULL AND g.dihapus IS NOT NULL", 'Berita tayang tidak mengacu dokumentasi yang dihapus.');
    await cek('media_hilang', 'Konten mengacu berkas yang ada', "SELECT g.id, g.judul FROM cms_galeri g WHERE g.jenis='foto' AND g.dihapus IS NULL AND NOT EXISTS (SELECT 1 FROM cms_media m WHERE m.id=g.media_id)", 'Foto galeri memiliki berkas.');
    await cek('super_admin', 'Terdapat Super Admin aktif', "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM users WHERE role='super_admin' AND aktif)", 'Minimal satu Super Admin aktif.');
    res.json({ diperiksa: Date.now(), ringkas: { ok: out.filter(x => x.status === 'ok').length, perhatian: out.filter(x => x.status === 'perhatian').length, error: out.filter(x => x.status === 'error').length }, rows: out });
  }));

  // ================= Kesiapan produksi (tanpa menampilkan nilai rahasia) =================
  api.get('/pengaturan/kesiapan', mod, wrap(async (req, res) => {
    const e = process.env, prod = !!(e.VERCEL || e.NODE_ENV === 'production'), set = await getSet('backup', BACKUP_DEF), rows = [];
    const add = (id, judul, status, ket) => rows.push({ id, judul, status, ket });
    add('db', 'Database terhubung', 'ok', `Terhubung (${db.kind === 'pg' ? 'PostgreSQL' : 'basis data uji'}).`);
    add('env_db', 'DATABASE_URL tersedia', e.DATABASE_URL || db.kind !== 'pg' ? 'ok' : 'perhatian', e.DATABASE_URL ? 'Terisi (nilai tidak ditampilkan).' : 'Belum diatur.');
    add('prod', 'Mode produksi', prod ? 'ok' : 'info', prod ? 'Berjalan sebagai produksi (cookie Secure aktif).' : 'Bukan mode produksi (pengembangan/uji).');
    add('cron', 'CRON_SECRET untuk backup terjadwal', e.CRON_SECRET ? 'ok' : (set.otomatis ? 'perhatian' : 'info'), e.CRON_SECRET ? 'Terisi.' : 'Belum diatur; backup otomatis tidak akan berjalan.');
    add('site', 'SITE_URL (domain) untuk sitemap', e.SITE_URL ? 'ok' : 'info', e.SITE_URL ? 'Terisi.' : 'Belum diatur; sitemap memakai alamat permintaan.');
    const sa = await count("SELECT COUNT(*)::int n FROM users WHERE role='super_admin' AND aktif"); add('sa', 'Super Admin aktif', sa >= 1 ? 'ok' : 'perhatian', sa + ' akun. Disarankan minimal 2 agar ada cadangan akses.'); if (sa === 1) rows[rows.length - 1].status = 'info';
    const last = (await db.q("SELECT paket FROM sys_backup GROUP BY paket HAVING BOOL_AND(status='terverifikasi') AND COUNT(*)=2 ORDER BY paket DESC LIMIT 1"))[0], umur = last ? (Date.now() - Number(last.paket)) / 864e5 : null;
    add('backup', 'Backup terverifikasi terbaru', last ? (umur <= 7 ? 'ok' : 'perhatian') : 'perhatian', last ? `${Math.floor(umur)} hari lalu.` : 'Belum ada backup terverifikasi.');
    add('backup_otomatis', 'Backup otomatis', set.otomatis ? 'ok' : 'info', set.otomatis ? 'Aktif (' + set.frekuensi + ').' : 'Tidak aktif.');
    add('log', 'Activity log append-only', (await count("SELECT COUNT(*)::int n FROM pg_trigger WHERE tgname='trg_log_no_update'")) ? 'ok' : 'perhatian', 'Perubahan/penghapusan log ditolak database.');
    add('https', 'HTTPS', prod ? 'info' : 'info', 'Disediakan Vercel pada domain produksi; periksa manual setelah domain terpasang.');
    add('data', 'Tidak ada akun/data contoh', 'info', 'Sistem tidak membuat data contoh. Periksa manual bahwa tidak ada akun uji sebelum dipakai.');
    res.json({ rows });
  }));
}
module.exports = { register, BACKUP_DEF };
