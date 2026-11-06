'use strict';
// Fungsi serverless Vercel: semua /api/sima/* ditangani oleh satu aplikasi Express.
const { createApi } = require('../../lib/sima/app');
const { getDb } = require('../../lib/sima/db');

let app;
module.exports = (req, res) => {
  try { app = app || createApi(getDb()); }
  catch (e) { console.error(e); res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: 'Server belum dikonfigurasi (DATABASE_URL).' })); }
  return app(req, res);
};
