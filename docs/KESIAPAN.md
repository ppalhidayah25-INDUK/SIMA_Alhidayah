# Checklist Kesiapan Modul (Audit Tahap 8)
Dasar penilaian: 241 uji backend, 34 skenario operasional, uji browser ui–ui8 (semua lulus pada data uji). **Belum ada uji oleh pengguna pondok di lingkungan nyata**, sehingga "Siap digunakan" berarti "lulus uji otomatis dan siap diuji pengguna", bukan "terbukti di produksi".

| # | Modul | Status | Catatan |
|---|---|---|---|
| 1 | Login & Dashboard | Siap digunakan | Dashboard per role; password sementara & ganti paksa teruji |
| 2 | Data Santri | Siap digunakan | CRUD, penempatan kamar, arsip, ke-alumni teruji. Impor Excel tersedia |
| 3 | Data Alumni | Siap digunakan | Koreksi status wajib alasan; riwayat tercatat |
| 4 | Data Pengurus | Siap digunakan | Jabatan/divisi/periode harus dibuat dulu (dibutuhkan impor) |
| 5 | Data Pengajar | Siap digunakan | Tidak ada kolom ID pengajar; kecocokan duplikat memakai nama + kontak |
| 6 | Asrama & Kamar | Siap digunakan | Kapasitas dan jenis kelamin ditegakkan |
| 7 | Bendahara | Siap digunakan | Pembayaran, tabungan, kas terpisah. Perlu diverifikasi bendahara pondok pada data nyata |
| 8 | Keamanan | Siap digunakan | Pelanggaran, pembinaan, izin, monitoring keterlambatan |
| 9 | Pendidikan | Siap digunakan | Peserta alumni tetap berstatus aktif di tabel peserta (desain Tahap 5) |
| 10 | Berita & Galeri | Siap digunakan | Video hanya tautan (tidak diunggah) |
| 11 | Laporan | Siap digunakan | PDF/Excel/cetak. Performa data besar belum diukur |
| 12 | Manajemen Pengguna | Siap digunakan | 3 role tetap |
| 13 | Backup & Pengaturan | **Perlu perbaikan / belum terbukti** | Backup & pemulihan teruji hanya di PGlite. Belum teruji di Neon/Vercel nyata (hak `DISABLE TRIGGER`, cron, batas respons) |
| 14 | Impor Data (baru) | Siap diuji pengguna | Teruji pada data fiktif; belum dipakai pada data asli |

## Masalah kritis / penghalang peluncuran
1. **Pemulihan belum terbukti di Neon sungguhan** (harus diuji di database uji Neon sebelum peluncuran).
2. **Dependensi rentan** (sharp, exceljs→uuid) belum di-upgrade.
3. **Data asli belum diterima**, sehingga migrasi nyata belum dilakukan.
4. Domain, HTTPS, database produksi, akun, dan persetujuan **belum ada / belum diberikan**. Tidak ada deployment produksi yang dilakukan.
Karena itu SIMA **belum dinyatakan siap diluncurkan**.
