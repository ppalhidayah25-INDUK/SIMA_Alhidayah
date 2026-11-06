# Persiapan Operasional dan Peluncuran
| Item | Status | Tindakan |
|---|---|---|
| Domain & HTTPS | Belum dilakukan | Arahkan domain ke Vercel; HTTPS otomatis; set `SIMA_COOKIE_SECURE` bila perlu |
| Database produksi | Belum dibuat/dihubungkan | Buat Neon produksi + `DATABASE_URL` di Vercel; `npm run migrate` |
| Penyimpanan file permanen | Ada (di database) | Foto/dokumen disimpan sebagai data DB, ikut backup |
| Akun Super Admin / Bendahara / Keamanan | Belum dibuat | `npm run create-admin`; akun lain lewat Manajemen Pengguna; password sementara tampil sekali dan wajib diganti. Serahkan langsung kepada pemilik, jangan lewat chat/email terbuka |
| Backup awal | Belum (butuh DB produksi) | Backup dari menu, lalu `npm run backup` ke penyimpanan luar |
| Monitoring error | Terbatas | Galat server ditulis ke log fungsi Vercel; tidak ada peringatan otomatis. Rekomendasi: aktifkan notifikasi Vercel/layanan pemantau uptime |
| Dokumentasi & prosedur pemulihan | Ada | `docs/` |
## Tahap peluncuran (menunggu persetujuan pengelola)
1 Audit (`KESIAPAN.md`) → 2 Uji di lingkungan terpisah: Neon uji + Vercel preview, termasuk uji pemulihan → 3 **Persetujuan pengelola** → 4 Backup → 5 Impor data terverifikasi → 6 Peluncuran → 7 Verifikasi (login 3 role, jumlah data, laporan, backup) → 8 Monitoring minggu pertama (log, Konsistensi Data, backup terjadwal).
