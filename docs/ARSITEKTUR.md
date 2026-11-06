# Arsitektur
- Frontend statis vanilla JS (`public/sima`, CSP ketat, tanpa inline script); situs publik terpisah.
- API Express (`lib/sima/app.js`, rute di `lib/sima/routes/`), dipasang di `/api/sima` (`api/sima/[...path].js`, Vercel serverless).
- Database Postgres (`pg`, mis. Neon); PGlite hanya untuk pengujian.
- Auth: sesi cookie HttpOnly, token CSRF, cek Origin, bcrypt, RBAC per modul di server (`permissions.js`).
- Laporan: `pdfkit` + `exceljs`. Backup: `lib/sima/backup.js` (NDJSON gzip, sha256).
- Cron backup: Vercel Cron → `/api/sima/backup/cron` (Bearer CRON_SECRET).
