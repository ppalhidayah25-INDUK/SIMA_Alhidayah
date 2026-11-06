# Lingkungan, Deploy, Migrasi
Variabel (isi hanya di pengaturan server, jangan di repo): `DATABASE_URL`, `CRON_SECRET` (untuk backup terjadwal), `NODE_ENV=production`; opsional `SIMA_DB_POOL`, `SIMA_COOKIE_SECURE`.
Deploy: 1) siapkan DB produksi; 2) set variabel; 3) `npm run migrate`; 4) `npm run create-admin` (password kuat, bukan bawaan); 5) deploy; 6) HTTPS aktif; 7) cek Pengaturan › Kesiapan Produksi; 8) buat backup pertama. **Deploy produksi hanya setelah uji lulus dan persetujuan Super Admin.**
Migrasi: `db/schema.sql` bersifat idempoten; jalankan sebelum deploy versi baru dan buat backup dulu.
Catatan: penyimpanan berkas (foto/dokumen) ada di database, sehingga persisten. Batas respons Vercel ±4,5 MB: unduh backup besar lewat `npm run backup`.
