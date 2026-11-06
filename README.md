# Website Al Hidayah Induk + SIMA (Tahap 1–6)

Satu proyek untuk Vercel: website publik dan SIMA berada di domain yang sama.

| Alamat | Isi |
|---|---|
| `/` | Website publik (`public/index.html`, tidak berubah selain 3 tautan menu SIMA → `/sima`) |
| `/sima` | Aplikasi SIMA (login, dashboard, menu) — berkas statis di `public/sima/` |
| `/api/sima/*` | API SIMA — fungsi serverless `api/sima/[...path].js` (Express + Postgres) |

## Struktur
```
public/            ← satu-satunya folder yang tampil ke publik (index.html, images/, video/, sima/)
api/sima/          ← fungsi serverless Vercel
lib/sima/          ← logika server (login, sesi, CSRF, hak akses, API) — TIDAK publik
db/schema.sql      ← skema Postgres (idempotent)
scripts/           ← migrate, create-admin
test/              ← 65 tes API/database + tes browser
vercel.json        ← header keamanan (CSP ketat untuk /sima)
```
Pindahkan `images/` dan `video/` website Anda ke `public/` (di paket ini sudah disertakan).

## Memasang di Vercel
1. Push folder ini ke GitHub, lalu *Import Project* di Vercel (framework: **Other**, tanpa build command; Output Directory: `public`).
2. Di proyek Vercel: **Storage → Create Database → Neon (Postgres)**. `DATABASE_URL` terisi otomatis.
3. Di komputer Anda (sekali saja), salin `DATABASE_URL` dari Vercel (Settings → Environment Variables), lalu:
   ```
   npm install
   DATABASE_URL="..." npm run migrate        # membuat tabel
   DATABASE_URL="..." npm run create-admin   # membuat Super Admin pertama (password diketik, tidak disimpan)
   ```
4. Deploy. Buka `https://domain-anda/sima`.

Uji lokal tanpa database sungguhan: `npm run dev` (memakai Postgres WASM sementara di memori; data hilang saat dihentikan) lalu buka `http://127.0.0.1:3000/sima`. `npm test` menjalankan seluruh pengujian.

## Keamanan
bcrypt (cost 12) · sesi acak 256-bit, hanya hash yang disimpan, cookie HttpOnly+Secure+SameSite=Strict · CSRF token + cek Origin ·
kunci akun 5× salah (15 menit) + batas 20 login gagal/15 menit per IP · query terparameter · UI tanpa skrip/gaya inline (CSP) ·
log aktivitas append-only (trigger) · role dikunci `CHECK` di database · Bendahara/Keamanan membaca data lewat **role database**
`sima_keuangan`/`sima_keamanan` yang hanya boleh SELECT view terpangkas (tabel lain ditolak oleh Postgres sendiri).

## Tahap 2 — modul data (Super Admin)
Data Santri Putra/Putri (form A–H, 7 tab detail, KK/foto/dokumen), Data Alumni (pindah dari santri dalam satu transaksi, koreksi & aktifkan
kembali dengan alasan), Pengurus (jabatan/divisi/periode, bagan + tabel), Pengajar (+ riwayat penugasan), Asrama & Kamar (penempatan, pindah,
riwayat), dashboard dengan angka nyata. Tidak ada data bawaan: nama asrama/kamar/kapasitas/jabatan diisi sendiri (tombol "Muat jabatan awal"
memuat 9 jabatan dari spesifikasi). Tidak ada hapus permanen — hanya arsip.
Berkas (foto, KK, dokumen) disimpan di tabel `berkas` (BYTEA, maks 2,5 MB; JPG/PNG/PDF diperiksa isi file-nya) dan hanya dilayani lewat
`GET /api/sima/berkas/:id` dengan cek login + role. KK/dokumen: Super Admin saja. Catatan: untuk volume besar pindahkan ke object storage privat.
Tes: `npm test` (121 tes API) dan `node test/ui.js` / `node test/ui2.js` (Playwright, perlu Chromium).

## Tahap 3 — Keuangan (Super Admin + Bendahara)
Menu **Keuangan**: Dashboard, Tagihan (satu/massal, pratinjau, anti-ganda), Pembayaran (penuh/sebagian, kuitansi PDF/cetak), Tunggakan, Tabungan Santri,
Kas Pondok (buku kas), Laporan (12 jenis, PDF & Excel), Kategori, Audit (Super Admin). Tiga buku TERPISAH: pembayaran santri, tabungan, kas operasional —
pembayaran santri tidak otomatis menjadi kas. Tidak ada nominal bawaan; kategori awal dimuat lewat tombol. Saldo tidak disimpan/diedit: dihitung dari transaksi.
Transaksi tidak bisa diubah/dihapus (trigger DB); koreksi = pembatalan/pembalikan dengan alasan, pengguna, waktu, nilai sebelum/sesudah (`keu_audit`).
Bendahara berjalan sebagai role DB `sima_keuangan` (tanpa DELETE, tanpa tabel lain, tanpa password_hash); `sima_keamanan` tidak punya hak apa pun pada tabel keuangan.
**Backup:** (1) Neon: aktifkan point-in-time restore/branch; (2) Super Admin: Keuangan → Audit → “Unduh cadangan data keuangan (JSON)”; (3) `pg_dump "$DATABASE_URL" > cadangan.sql` terjadwal.
Dependensi baru: `pdfkit`, `exceljs`. Tes: `npm test` (156), `node test/ui3.js` (Playwright).

## Batasan
Modul Keamanan, Pendidikan, Berita/Galeri, Laporan umum, Pengaturan belum ada (API menjawab 501, menu berlabel "Segera") — Tahap 4+.

## Tahap 4 — Modul Keamanan

Menu **Keamanan** (Super Admin dan role Keamanan; Bendahara ditolak di halaman, API, dan database):
Dashboard Keamanan · Data Pelanggaran · Data Pembinaan · Perizinan Keluar Pondok · Perizinan Pulang · Monitoring Santri Belum Kembali · Profil Keamanan Santri · Laporan Keamanan · Pengaturan Keamanan (khusus Super Admin).

- **Tabel baru:** `kea_pengaturan`, `kea_counter`, `kea_kategori_pelanggaran`, `kea_jenis_pembinaan`, `kea_jenis_izin`, `kea_pelanggaran`, `kea_pembinaan`, `kea_izin`, `kea_audit`; view `v_santri_kea` (identitas minimal santri aktif/alumni); jenis berkas `bukti_kea`.
- **Terhubung ke tabel santri** lewat `santri_id`/NIS (tanpa salinan data). Trigger DB menolak catatan baru untuk santri yang bukan aktif (alumni/diarsipkan).
- **Tanpa data bawaan:** kategori pelanggaran, jenis pembinaan, jenis izin kosong sampai Super Admin mengisinya. Tidak ada sanksi/denda/batas waktu bawaan; toleransi keterlambatan default 0 dan dapat diubah.
- **Hak akses:** role DB `sima_keamanan` hanya membaca `v_santri_kea` dan mengelola tabel `kea_*`; tidak punya hak apa pun pada tabel keuangan, KK, atau data keluarga. `sima_keuangan` tidak punya hak pada `kea_*`.
- **Waktu:** input jam dianggap WIB (Asia/Jakarta); keterlambatan dihitung server dari jam database. Santri tidak otomatis "kembali"; petugas mencatat kedatangan.
- **Tidak ada penghapusan permanen:** koreksi/pembatalan wajib beralasan dan tersimpan sebagai riwayat sebelum/sesudah (`kea_audit`, append-only).
- **Uji:** `node test/run.js` (173 uji, termasuk `test/tahap4.js`), `node test/ui4.js` (Playwright desktop + 390 px).

## Tahap 5 — Modul Pendidikan (khusus Super Admin)
Menu **Pendidikan** (13 halaman, `#/pendidikan/...`): Dashboard, Jenis Pendidikan, Mata Pelajaran/Materi, Kelas dan Kelompok, Peserta Didik, Penugasan Pengajar, Jadwal, Presensi Santri, Presensi Pengajar (opsional), Penilaian dan Evaluasi, Riwayat Pendidikan Santri, Laporan (8 jenis), Pengaturan.

- **Akses**: hanya Super Admin. Bendahara dan Keamanan ditolak di halaman, API (`requireModule('pendidikan')`), dan database (role `sima_keuangan`/`sima_keamanan` tidak diberi hak pada tabel `edu_*`).
- **Integrasi**: santri dirujuk lewat `santri.id`/NIS dan pengajar lewat `pengajar.id` — tidak ada tabel identitas ganda. Santri alumni/nonaktif ditolak sebagai peserta baru (juga oleh trigger DB), tidak dihitung aktif di dashboard, riwayatnya tetap tersimpan.
- **Tanpa data karangan**: jenis pendidikan, materi, kelas, jadwal, jenis evaluasi dikosongkan; tombol “Muat contoh” bersifat eksplisit. Satu-satunya data awal: 4 status presensi (Hadir, Izin, Sakit, Alpa), sesuai permintaan, dan dapat diubah.
- **Jadwal**: tidak ada jadwal otomatis; bentrok pengajar/kelas/ruang ditolak (ruang dapat dimatikan di Pengaturan; paralel kelas hanya bila dikonfigurasi). Tampilan harian, mingguan, per kelas, per pengajar, kalender; cetak & PDF.
- **Presensi**: satu catatan per santri per kegiatan; koreksi wajib beralasan; riwayat sebelum/sesudah di `edu_audit` (append-only). Kegiatan khusus tanpa jadwal didukung.
- **Penilaian**: mode nilai per jenis (angka/capaian/campuran); tidak ada standar kelulusan; koreksi & pembatalan diaudit.
- **Tanpa hard delete**: data diubah menjadi nonaktif/batal/pindah/keluar; trigger menolak DELETE pada `edu_*`.
- Uji: `node test/run.js` (190 tes), UI: `node test/ui5.js`.

## Tahap 6 — Berita & Galeri (khusus Super Admin), terhubung ke website publik

**Prinsip:** SIMA adalah satu-satunya tempat mengelola berita dan galeri. Website publik hanya membaca konten berstatus *terbit* dari database yang sama; tidak ada formulir input berita kedua.

### Cara kerja integrasi
- Admin: `/api/sima/konten/*` (login + peran Super Admin). Publik: `/api/sima/pub/*` tanpa login, berjalan sebagai role Postgres `sima_publik` yang hanya boleh `SELECT` pada view `v_pub_*` (draf/arsip/terjadwal-belum-waktunya tidak pernah masuk view).
- Halaman server-render: `/berita`, `/berita/:slug` (SEO, Open Graph, JSON-LD), `/sitemap.xml` (via `vercel.json` rewrites; `dev-server.js` meniru).
- Beranda memuat `/api/sima/pub/berita?beranda=1`; Galeri › Dokumentasi dan Ekstrakurikuler memuat `/api/sima/pub/galeri` dan `/pub/ekstra`.
- Terjadwal: tanpa cron — berita tayang otomatis saat waktunya tiba (dievaluasi saat dibaca). Cache publik 30 dtk (`s-maxage`) sehingga perubahan cepat terlihat.
- Slug dibuat dari judul, unik, tidak berubah saat judul diubah; slug lama dialihkan 301 ke slug baru.

### Penyimpanan media
Foto disimpan di Postgres (BYTEA) sebagai WebP ≤1600 px + thumbnail 480 px (EXIF dibuang, duplikat dideteksi via sha256), disajikan di `/media/{id}-{token}.webp` dengan cache `immutable`. Cocok untuk serverless (tanpa disk lokal). **Video tidak diunggah**; gunakan tautan YouTube/Vimeo.

### Dibatasi
- Hanya Super Admin. Bendahara/Keamanan: 403 pada API dan menu tidak tampil.
- Tidak ada hapus permanen berita/galeri/kategori (hapus = sembunyikan, dapat dipulihkan). Foto di Media Library hanya dapat dihapus bila tidak dipakai.
- Semua perubahan tercatat di `activity_log` dan `cms_riwayat` (data sebelum/sesudah, tidak dapat diubah).

### Cara Super Admin
1. **Kategori:** menu Berita & Galeri › Kategori Berita / Kategori Galeri › *Tambah kategori* (atau *Muat contoh kategori*, opsional; bukan kategori resmi).
2. **Berita:** *Tambah Berita* → isi judul, ringkasan, isi (toolbar editor), kategori, gambar utama, dokumentasi pendukung, video, SEO → *Simpan* (draft), *Pratinjau*, atau *Simpan & terbitkan*. Pilih status *Terjadwal* + waktu WIB untuk tayang otomatis.
3. **Unggulan:** *Berita Unggulan* → atur jumlah beranda/maks. unggulan/berita per halaman; tandai unggulan dari *Semua Berita*.
4. **Galeri:** *Upload Foto* (satu/banyak, ada pratinjau, judul/caption/kategori/tanggal/status) atau *Manajemen Video* (tautan). Ubah, ganti foto, urutan, arsip, hapus di *Semua Dokumentasi*. Dokumentasi yang dipakai berita menampilkan peringatan sebelum diarsipkan/dihapus.
5. Kategori galeri dapat dikaitkan ke kegiatan Ekstrakurikuler (Pencak Silat, Banjari, Kepenulisan, Public Speaking, Entrepreneur) agar tampil di halaman kegiatan tersebut.

### Pengujian
`node test/run.js` (212 pengujian API/DB, termasuk area 62a–62v) dan `node test/ui6.js` (Playwright: alur Super Admin, halaman publik, penolakan peran, ponsel 390 px, tanpa error konsol/CSP).

## Tahap 8 — Implementasi (v0.8.0)
- **Impor Data** (Super Admin): template Excel/CSV, validasi, deteksi duplikat, pratinjau, konfirmasi, impor atomik, verifikasi, riwayat. Lihat `docs/IMPLEMENTASI-MIGRASI.md`.
- Simulasi operasional (34 skenario): `node test/operasional.js` → `docs/UJI-SKENARIO.md`. Uji impor: `test/tahap8.js` (dalam `npm test`), UI: `node test/ui8.js`.
- Kesiapan & peluncuran: `docs/KESIAPAN.md`, `docs/OPERASIONAL.md`, `docs/LAPORAN-TAHAP8.md`. Belum ada deployment produksi.
