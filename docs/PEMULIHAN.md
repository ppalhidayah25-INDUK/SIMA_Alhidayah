# Prosedur Backup dan Pemulihan
**Backup web**: Pengaturan › Backup & Pemulihan › Buat backup sekarang; tunggu status Terverifikasi (database dan berkas).
**Backup luar server**: `DATABASE_URL=... npm run backup -- ./folder` menghasilkan dua berkas .ndjson.gz + ringkasan checksum (izin 0600). Simpan terenkripsi di tempat terpisah.
**Uji pemulihan (WAJIB di lingkungan uji, jangan menimpa produksi)**: buat DB kosong terpisah; `RESTORE_DATABASE_URL=<db-uji> npm run restore -- db.ndjson.gz berkas.ndjson.gz --ya`; periksa jumlah baris dan login. Skrip menolak tujuan yang sama dengan DATABASE_URL.
**Pemulihan di aplikasi** (kondisi darurat): pilih paket Terverifikasi › Pulihkan paket › ketik PULIHKAN + password. Sistem membuat backup kondisi sekarang lebih dulu; bila gagal, seluruh proses di-rollback. Semua pengguna harus login ulang.
**Bencana (DB hilang)**: DB baru → `npm run migrate` → `npm run restore` dari berkas luar server → arahkan DATABASE_URL → buat admin bila perlu → verifikasi.
Rekomendasi: aktifkan point-in-time recovery dari penyedia DB karena backup web tersimpan di DB yang sama.
