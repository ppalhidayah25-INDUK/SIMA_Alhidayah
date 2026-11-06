# Kesalahan Umum
- 401: sesi habis, login ulang. 403: role tidak berwenang atau CSRF/Origin tidak cocok. 429: terlalu banyak percobaan login, tunggu.
- Akun terkunci: Super Admin › Pengguna › Keamanan akun › Buka kunci.
- Backup gagal/ukuran besar: lihat pesan di riwayat; gunakan `npm run backup`.
- Pemulihan ditolak "skema berbeda": jalankan migrasi versi yang sama.
- Backup terjadwal tidak jalan: CRON_SECRET belum diatur atau cron Vercel belum aktif.
