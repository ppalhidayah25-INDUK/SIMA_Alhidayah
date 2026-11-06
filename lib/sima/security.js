'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { can } = require('./permissions');

const COOKIE = 'sima_sid';
// Nilai bawaan; dapat diubah Super Admin di Pengaturan › Sesi & Keamanan (disimpan di sys_pengaturan, kunci 'sesi').
const SESI_DEF = { idle_menit: 120, mutlak_jam: 12, maks_gagal: 5, kunci_menit: 15 };
const SESI_BATAS = { idle_menit: [5, 1440], mutlak_jam: [1, 72], maks_gagal: [3, 20], kunci_menit: [1, 1440] };
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_FAIL = 20;
const COST = Number(process.env.SIMA_BCRYPT_COST || 12);
const DUMMY = bcrypt.hashSync('dummy-untuk-menyamakan-waktu', COST);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function validatePassword(p) {
  if (typeof p !== 'string') return 'Password wajib diisi.';
  if (p.length < 12) return 'Password minimal 12 karakter.';
  if (p.length > 200) return 'Password terlalu panjang.';
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p)) return 'Password harus mengandung huruf besar, huruf kecil, dan angka.';
  return null;
}
const hashPassword = p => bcrypt.hash(p, COST);

function makeAuth(db, log) {
  let cache = null, cacheAt = 0;
  async function cfg() {
    if (cache && Date.now() - cacheAt < 30000) return cache;
    let v = {}; try { const r = (await db.q("SELECT nilai FROM sys_pengaturan WHERE kunci='sesi'"))[0]; if (r) v = typeof r.nilai === 'string' ? JSON.parse(r.nilai) : r.nilai; } catch (e) { /* tabel belum ada: pakai bawaan */ }
    const c = {}; for (const k of Object.keys(SESI_DEF)) { const n = Number(v[k]); c[k] = Number.isFinite(n) && n >= SESI_BATAS[k][0] && n <= SESI_BATAS[k][1] ? n : SESI_DEF[k]; }
    cache = { IDLE_MS: c.idle_menit * 60000, ABS_MS: c.mutlak_jam * 3600000, MAX_FAIL: c.maks_gagal, LOCK_MS: c.kunci_menit * 60000, nilai: c }; cacheAt = Date.now(); return cache;
  }
  const resetCfg = () => { cache = null; };
  function parseCookies(req) {
    const out = {};
    String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
    return out;
  }
  function setCookie(res, token, maxAgeMs) {
    const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.SIMA_COOKIE_SECURE === '1';
    res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure ? '; Secure' : ''}`);
  }

  async function login(identifier, password, req, res) {
    const ip = req.ip || null, id = String(identifier || '').trim(), t = Date.now(), { ABS_MS, IDLE_MS, MAX_FAIL, LOCK_MS } = await cfg();
    const recent = (await db.q("SELECT COUNT(*)::int n FROM activity_log WHERE aksi='login_gagal' AND ip=$1 AND waktu>$2", [ip, t - IP_WINDOW_MS]))[0].n;
    if (recent >= IP_MAX_FAIL) return { error: 'Terlalu banyak percobaan login dari alamat ini. Coba lagi nanti.', status: 429 };
    const u = id ? (await db.q('SELECT * FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1)', [id]))[0] : null;
    // Selalu jalankan bcrypt agar waktu respons tidak membocorkan keberadaan akun.
    const match = await bcrypt.compare(String(password || ''), u ? u.password_hash : DUMMY);
    if (!u) { await log(null, id.slice(0, 40), 'login_gagal', 'auth', 'Login gagal: akun tidak dikenal', ip); return { error: 'Username/email atau password salah.' }; }
    if (u.terkunci_sampai && u.terkunci_sampai > t) {
      await log(u.id, u.username, 'login_gagal', 'auth', 'Login ditolak: akun terkunci sementara', ip);
      return { error: 'Terlalu banyak percobaan gagal. Coba lagi beberapa menit lagi.', status: 429 };
    }
    if (!match || !u.aktif) {
      const n = u.login_gagal + 1, lock = n >= MAX_FAIL;
      await db.q('UPDATE users SET login_gagal=$1, terkunci_sampai=$2, diubah=$3 WHERE id=$4', [lock ? 0 : n, lock ? t + LOCK_MS : null, t, u.id]);
      await log(u.id, u.username, 'login_gagal', 'auth', u.aktif ? 'Login gagal: password salah' : 'Login ditolak: akun nonaktif', ip);
      return { error: 'Username/email atau password salah.' };
    }
    await db.q('UPDATE users SET login_gagal=0, terkunci_sampai=NULL, terakhir_login=$1, diubah=$1 WHERE id=$2', [t, u.id]);
    const token = crypto.randomBytes(32).toString('base64url'), csrf = crypto.randomBytes(24).toString('base64url');
    await db.q('INSERT INTO sessions (id,user_id,csrf,dibuat,aktivitas,kedaluwarsa,ip,ua) VALUES ($1,$2,$3,$4,$4,$5,$6,$7)',
      [sha(token), u.id, csrf, t, t + ABS_MS, ip, String(req.headers['user-agent'] || '').slice(0, 200)]);
    setCookie(res, token, ABS_MS);
    await db.q('DELETE FROM sessions WHERE kedaluwarsa<$1 OR aktivitas<$2', [t, t - IDLE_MS]);
    await log(u.id, u.username, 'login', 'auth', 'Login berhasil', ip);
    return { ok: true, wajib_ganti: !!u.wajib_ganti };
  }

  async function logout(req, res) {
    const tok = parseCookies(req)[COOKIE];
    if (tok) await db.q('DELETE FROM sessions WHERE id=$1', [sha(tok)]);
    setCookie(res, '', 0);
  }

  // Sesi + pengguna dibaca ulang dari DB setiap request: perubahan role/status berlaku seketika.
  async function loadSession(req, res, next) {
    req.user = null; req.session = null;
    const tok = parseCookies(req)[COOKIE];
    if (!tok) return next();
    const t = Date.now(), { IDLE_MS } = await cfg();
    const s = (await db.q('SELECT * FROM sessions WHERE id=$1', [sha(tok)]))[0];
    if (!s || s.kedaluwarsa < t || s.aktivitas < t - IDLE_MS) { if (s) await db.q('DELETE FROM sessions WHERE id=$1', [s.id]); return next(); }
    const u = (await db.q('SELECT id, username, email, nama, role, aktif, wajib_ganti FROM users WHERE id=$1', [s.user_id]))[0];
    if (!u || !u.aktif) { await db.q('DELETE FROM sessions WHERE id=$1', [s.id]); return next(); }
    if (t - s.aktivitas > 60000) await db.q('UPDATE sessions SET aktivitas=$1 WHERE id=$2', [t, s.id]);
    req.user = u; req.session = s;
    next();
  }

  const requireAuth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  const requireModule = modul => async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
    if (!can(req.user.role, modul)) {
      await log(req.user.id, req.user.username, 'akses_ditolak', modul, `Mencoba mengakses ${req.method} ${req.originalUrl.split('?')[0]} tanpa izin`, req.ip);
      return res.status(403).json({ error: 'Anda tidak memiliki hak akses ke bagian ini.' });
    }
    next();
  };

  // CSRF: request yang mengubah data wajib membawa token sesi + Origin yang sama.
  function csrfGuard(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Origin tidak valid.' }); } catch (e) { return res.status(403).json({ error: 'Origin tidak valid.' }); } }
    if (req.path === '/auth/login') return next();
    if (!req.session || req.headers['x-csrf-token'] !== req.session.csrf) return res.status(403).json({ error: 'Token keamanan tidak valid. Muat ulang halaman.' });
    next();
  }
  const revokeUser = id => db.q('DELETE FROM sessions WHERE user_id=$1', [id]);
  return { login, logout, loadSession, requireAuth, requireModule, csrfGuard, revokeUser, cfg, resetCfg };
}
module.exports = { makeAuth, validatePassword, hashPassword, SESI_DEF, SESI_BATAS };
