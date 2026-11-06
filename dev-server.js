'use strict';
// Server lokal untuk pengembangan: meniru Vercel (static public/ + /api/sima/*). Tidak dipakai di produksi.
const path = require('path');
const express = require('express');
const { createApi } = require('./lib/sima/app');
const { getDb, memoryDb } = require('./lib/sima/db');

async function createDev(db) {
  const api = createApi(db || (process.env.DATABASE_URL ? getDb() : await memoryDb()));
  const app = express();
  app.disable('x-powered-by');
  // Meniru rewrites vercel.json (halaman publik /berita, /media, /sitemap.xml dilayani fungsi API yang sama)
  const rw = (JSON.parse(require('fs').readFileSync(path.join(__dirname, 'vercel.json'), 'utf8')).rewrites || []).map(r => ({ re: new RegExp('^' + r.source.replace(/:[a-z]+/gi, '([^/]+)') + '$'), to: r.destination }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const u = req.url.split('?'); for (const r of rw) { const m = r.re.exec(u[0]); if (m) { let i = 0; req.url = r.to.replace(/:[a-z]+/gi, () => m[++i]) + (u[1] ? '?' + u[1] : ''); break; } }
    next();
  });
  app.use(api);
  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
  app.get('/sima', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sima', 'index.html')));
  return app;
}
module.exports = { createDev };
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createDev().then(app => app.listen(port, () => console.log(`Dev: http://127.0.0.1:${port}  (SIMA: /sima)`)));
}
