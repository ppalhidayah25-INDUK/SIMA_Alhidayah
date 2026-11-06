'use strict';
// Penyimpanan & penyajian berkas. Berkas TIDAK pernah publik: hanya lewat GET /api/sima/berkas/:id
// setelah autentikasi + otorisasi per jenis berkas. Isi disimpan di Postgres (BYTEA), bukan di folder publik.
const { readUpload } = require('../util');

// jenis berkas -> role yang boleh membaca
const READ_ROLES = {
  foto: ['super_admin', 'keamanan'],          // foto santri: Keamanan hanya untuk santri aktif (diperiksa lagi di bawah)
  kk: ['super_admin'],
  identitas: ['super_admin'],
  pendukung: ['super_admin'],
  foto_pengurus: ['super_admin'],
  foto_pengajar: ['super_admin'],
  bukti_kas: ['super_admin', 'bendahara'],
  bukti_kea: ['super_admin', 'keamanan']
};
const SENSITIF = new Set(['kk', 'identitas', 'pendukung']);

async function simpan(q, jenis, file, userId) {
  const r = await q('INSERT INTO berkas (jenis,mime,ukuran,nama_asli,sha256,isi,diunggah,oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [jenis, file.mime, file.ukuran, file.nama, file.sha256, file.buf, Date.now(), userId || null]);
  return r[0].id;
}
const buang = async (q, id) => { if (id) await q('DELETE FROM berkas WHERE id=$1', [id]); };

function register(api, { db, auth, logBy, ah }) {
  api.get('/berkas/:id(\\d+)', auth.requireAuth, ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const b = (await db.q('SELECT id, jenis, mime, ukuran, nama_asli, isi FROM berkas WHERE id=$1', [id]))[0];
    if (!b) return res.status(404).json({ error: 'Berkas tidak ditemukan.' });
    const role = req.user.role;
    if (!READ_ROLES[b.jenis].includes(role)) {
      await logBy(req, 'akses_ditolak', 'berkas', `Akses berkas ${b.jenis} #${id} ditolak untuk ${role}`);
      return res.status(403).json({ error: 'Anda tidak memiliki hak akses ke berkas ini.' });
    }
    if (role === 'keamanan' && b.jenis === 'foto') {   // pembatasan di level database: hanya foto santri aktif yang terlihat di view Keamanan
      const ok = await db.tx(async q => { await q('SET LOCAL ROLE sima_keamanan'); return q('SELECT 1 FROM v_santri_keamanan WHERE foto=$1', [id]); });
      if (!ok.length) return res.status(404).json({ error: 'Berkas tidak ditemukan.' });
    }
    if (SENSITIF.has(b.jenis)) await logBy(req, req.query.unduh ? 'unduh_dokumen' : 'lihat_dokumen', 'berkas', `${req.query.unduh ? 'Mengunduh' : 'Membuka'} dokumen ${b.jenis} #${id}`);
    const fname = encodeURIComponent(b.nama_asli || 'berkas');
    res.set({
      'Content-Type': b.mime, 'Content-Length': String(b.isi.length),
      'Content-Disposition': `${req.query.unduh ? 'attachment' : 'inline'}; filename*=UTF-8''${fname}`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': b.mime === 'application/pdf' ? "frame-ancestors 'self'" : "frame-ancestors 'self'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin'
    });
    res.end(b.isi);
  }));
}
module.exports = { register, simpan, buang, readUpload, READ_ROLES };
