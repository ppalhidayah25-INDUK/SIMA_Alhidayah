# Struktur Database
Definisi lengkap dan idempoten: `db/schema.sql` (`npm run migrate`). Kelompok tabel: akun (users, sessions, activity_log), data induk (santri, asrama, kamar, pengurus, pengajar, riwayat_*), keuangan (keu_*, tabungan_*, kas_transaksi), keamanan (kea_*), pendidikan (edu_*), konten (cms_*), sistem (sys_pengaturan, sys_backup, berkas).
Relasi utama: santri→kamar→asrama; santri→riwayat_kamar/riwayat_status; keu_tagihan→keu_pembayaran; tabungan_rekening→tabungan_transaksi; edu_kelas→edu_peserta/jadwal→edu_sesi→edu_presensi; cms_berita↔cms_galeri/cms_media.
Perlindungan: unique NIS, no. kuitansi, no. transaksi, nomor izin/pelanggaran/pembinaan, presensi (sesi,santri); trigger mencegah hapus permanen; activity_log append-only; CHECK 3 role; grant per peran DB.
