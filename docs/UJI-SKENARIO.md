# Daftar Skenario Uji Operasional SIMA (Tahap 8)

> **Penting — baca dahulu.** Dokumen ini dihasilkan dari **simulasi otomatis** (`node test/operasional.js`) yang menjalankan kegiatan administrasi lewat API pada **database uji terpisah di memori** dengan **data fiktif berlabel “Uji”**. Ini **bukan** uji coba oleh pengguna manusia di lingkungan staging nyata, dan **tidak menyentuh data maupun database produksi**. Tampilan layar (UI) diuji terpisah oleh rangkaian uji browser (`test/ui*.js`). Sebelum peluncuran tetap diperlukan uji coba oleh pengelola pondok di lingkungan staging (lihat checklist serah terima).

Tanggal eksekusi: 2026-11-06 · Hasil: **34 dari 34 skenario LULUS** · 120 pengecekan hak akses (30 endpoint × 4 pihak) pada S6.1.

Cara menjalankan ulang: `node test/operasional.js` (kode keluar 0 bila semua lulus; tambahkan `--dok` untuk memperbarui dokumen ini dari hasil nyata).

| ID | Peran | Langkah | Hasil yang diharapkan | Hasil aktual |
|---|---|---|---|---|
| S1.1 | Super Admin | Membuat asrama putra, asrama putri, dan tiga kamar | Asrama dan kamar tersimpan; kapasitas tercatat | **LULUS** |
| S1.2 | Super Admin | Menambahkan 3 santri baru (2 putra, 1 putri) dengan NIS unik | Santri tersimpan, NIS ganda ditolak, data wajib divalidasi | **LULUS** |
| S1.3 | Super Admin | Mengubah identitas santri (nama, alamat) dan melihat riwayat perubahan | Data berubah; riwayat mencatat sebelum/sesudah | **LULUS** |
| S1.4 | Super Admin | Menempatkan santri ke kamar, memindahkan kamar, dan menolak kamar penuh / asrama berbeda jenis | Penempatan sesuai jenis kelamin & kapasitas; riwayat pindah tercatat | **LULUS** |
| S1.5 | Super Admin | Mengarsipkan lalu memulihkan santri | Santri terarsip hilang dari daftar aktif dan keluar dari kamar; pulih kembali tanpa kehilangan data | **LULUS** |
| S1.6 | Super Admin | Memindahkan santri ke alumni (lulus) dan memeriksa daftar alumni & kamar | Status berubah ke alumni, keluar dari kamar, tampil di Data Alumni, tidak dihitung penghuni aktif | **LULUS** |
| S2.1 | Bendahara | Memuat kategori tagihan awal dan membuat kategori kas masuk/keluar; saldo awal kas | Kategori tersedia; tidak ada nominal bawaan | **LULUS** |
| S2.2 | Bendahara | Membuat tagihan untuk satu santri dan tagihan massal (pratinjau lalu simpan) | Pratinjau tidak menyimpan; tagihan ganda dilewati | **LULUS** |
| S2.3 | Bendahara | Mencatat pembayaran sebagian lalu pelunasan; sisa dihitung otomatis; kelebihan bayar ditolak | Status belum → sebagian → lunas; sisa akurat | **LULUS** |
| S2.4 | Bendahara | Mencetak bukti pembayaran: kuitansi (tampilan) dan PDF | Kuitansi memuat nomor, nama santri, nominal, sisa; PDF valid; Keamanan ditolak | **LULUS** |
| S2.5 | Bendahara | Tabungan santri: setoran, penarikan, penarikan melebihi saldo ditolak | Saldo = setoran − penarikan; saldo tidak boleh minus | **LULUS** |
| S2.6 | Bendahara | Kas operasional: kas masuk, kas keluar, bukti nota, saldo; terpisah dari tabungan & pembayaran | Saldo kas = saldo awal + masuk − keluar; tabungan santri tidak ikut tercampur | **LULUS** |
| S2.7 | Bendahara | Membatalkan pembayaran dengan alasan; jejak audit tersimpan | Pembatalan wajib alasan; sisa tagihan kembali; audit mencatat | **LULUS** |
| S3.1 | Super Admin → Keamanan | Menyiapkan kategori pelanggaran dan jenis pembinaan/izin (Super Admin), lalu Keamanan mencatat pelanggaran | Pelanggaran bernomor PLG-…; alumni tidak dapat dicatat | **LULUS** |
| S3.2 | Keamanan | Mencatat pembinaan terkait pelanggaran dan menyelesaikannya | Pembinaan bernomor PMB-…; status berubah selesai | **LULUS** |
| S3.3 | Keamanan | Izin keluar pondok: input → setujui → keluar → kembali | Alur status benar; waktu aktual tercatat; alur salah ditolak | **LULUS** |
| S3.4 | Keamanan | Izin pulang: alamat, wali, keluar; santri belum kembali muncul di monitoring | Santri tampil pada Monitoring Belum Kembali | **LULUS** |
| S3.5 | Keamanan | Memantau keterlambatan: jadwal kembali terlewat → status terlambat, tidak otomatis kembali; tindak lanjut; lalu santri dicatat kembali | Terlambat terhitung dari jam server; setelah kembali hilang dari monitoring | **LULUS** |
| S3.6 | Keamanan | Dashboard & laporan keamanan (JSON/PDF/Excel) | Angka dashboard terisi; laporan terunduh | **LULUS** |
| S4.1 | Super Admin | Membuat program pendidikan (jenis), periode, materi, dan jenis evaluasi | Data referensi tersimpan; nama ganda ditolak | **LULUS** |
| S4.2 | Super Admin | Mendaftarkan pengajar, membuat kelas dan menghubungkan pengajar (penugasan) | Kelas memiliki pengajar; penugasan ganda ditolak | **LULUS** |
| S4.3 | Super Admin | Mendaftarkan peserta ke kelas; kapasitas dan alumni dijaga | Peserta bertambah; melebihi kapasitas & alumni ditolak | **LULUS** |
| S4.4 | Super Admin | Membuat jadwal pendidikan; jam terbalik/bentrok ditolak | Jadwal tersimpan | **LULUS** |
| S4.5 | Super Admin | Mengisi presensi sesi, mengoreksi dengan alasan; tidak ada presensi ganda | Presensi unik per sesi-santri; koreksi wajib alasan & tercatat | **LULUS** |
| S4.6 | Super Admin | Mencatat evaluasi/penilaian santri dan melihat riwayat pendidikan & laporan | Nilai angka 0–100 divalidasi; riwayat dan laporan tampil | **LULUS** |
| S5.1 | Super Admin | Membuat kategori berita, mengunggah foto (dioptimasi) dan menolak berkas berbahaya | Foto dikonversi WebP ≤1600px; berkas palsu/skrip ditolak | **LULUS** |
| S5.2 | Super Admin | Membuat berita sebagai DRAFT, memeriksa website publik (tidak tampil), lalu menerbitkan | Draft tidak muncul di publik/sitemap; setelah terbit muncul di daftar, halaman, dan sitemap | **LULUS** |
| S5.3 | Super Admin | Mengunggah dokumentasi (galeri foto) sebagai draft lalu menerbitkan; data pribadi santri tidak bocor ke publik | Galeri publik hanya memuat yang terbit; respons publik tidak memuat data internal | **LULUS** |
| S5.4 | Super Admin | Mengarsipkan berita lalu mengembalikannya ke draft | Berita arsip hilang dari publik; riwayat tercatat | **LULUS** |
| S6.1 | Semua role | Matriks hak akses: 30 endpoint × 4 pihak (Super Admin, Bendahara, Keamanan, tanpa login) = 120 pengecekan | Setiap role hanya mendapat akses pada modul miliknya; selain itu 403; tanpa login 401 (baca) atau 403 (tulis, ditolak pelindung CSRF); tidak ada kebocoran | **LULUS** |
| S6.2 | Bendahara & Keamanan | Menulis ke modul lain ditolak (Bendahara → keamanan/santri/konten; Keamanan → keuangan/santri) | Semua percobaan tulis lintas modul → 403 | **LULUS** |
| S6.3 | Bendahara & Keamanan | Data sensitif santri tidak terlihat oleh Bendahara/Keamanan (alamat, wali, KK) | Daftar santri untuk non-admin tanpa kolom sensitif | **LULUS** |
| S6.4 | Semua | Keamanan sesi: CSRF dan Origin; akun nonaktif tidak bisa login | Ubah data tanpa token CSRF/Origin asing → 403; akun nonaktif → 401 | **LULUS** |
| S6.5 | Super Admin | Aktivitas sistem mencatat seluruh kegiatan simulasi; konsistensi data tidak menemukan masalah | Log memuat aksi santri, keuangan, keamanan, pendidikan, konten; 14 pemeriksaan konsistensi sesuai | **LULUS** |

## Cakupan terhadap permintaan Tahap 8 (bagian D & E)
- **D.1 Administrasi Santri** → S1.2–S1.6 · **D.2 Bendahara** → S2.1–S2.7 · **D.3 Keamanan** → S3.1–S3.6 · **D.4 Pendidikan** → S4.1–S4.6 · **D.5 Berita & Galeri + website publik** → S5.1–S5.4.
- **E. Uji pengguna 3 role** (Super Admin, Bendahara, Keamanan; tanpa role baru) → S6.1–S6.5.

## Yang belum tercakup oleh simulasi ini
- Penggunaan nyata oleh staf pondok (kemudahan, kesalahan manusia) dan lingkungan staging di Vercel/Neon sesungguhnya.
- Cetak fisik ke printer; kinerja pada data berjumlah besar.
