'use strict';
// Fungsi serverless Vercel: semua /api/sima/* (dan halaman publik /berita, /media, /sitemap.xml) ditangani oleh satu aplikasi Express.
// Vercel hanya mencocokkan satu tingkat alamat untuk berkas ini, jadi vercel.json mengarahkan semua alamat ke sini
// dengan parameter ?__p=<jalur-asli>, lalu jalur asli dipulihkan di bawah.
const { createApi } = require('../../lib/sima/app');
const { getDb } = require('../../lib/sima/db');

function fixUrl(url) {
  const u = new URL(url, 'http://localhost');
  const p = u.searchParams.getAll('__p');
  if (!p.length) return url;
  u.searchParams.delete('__p');
  const jalur = String(p[p.length - 1]).replace(/^\/+/, '').replace(/\.\.+/g, '').replace(/\/+/g, '/').replace(/^\/+/, '');
  return '/api/sima' + (jalur ? '/' + jalur : '') + u.search;
}

let app;
function handler(req, res) {
  try { app = app || createApi(getDb()); }
  catch (e) { console.error(e); res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: /belum diatur/.test(String(e && e.message)) ? 'Server belum dikonfigurasi (DATABASE_URL).' : 'Server gagal dimulai. Lihat Logs di Vercel.' })); }
  req.url = fixUrl(req.url);
  return app(req, res);
}
module.exports = handler;
module.exports.fixUrl = fixUrl;
