# Hasil Audit Keamanan (Tahap 7)
Metode: tinjauan kode, tes otomatis (233 uji backend, 7 rangkaian uji browser), `npm audit`. Tidak dilakukan uji penetrasi pihak ketiga.

| Area | Hasil |
|---|---|
| Autentikasi | bcrypt; kebijakan password; akun nonaktif tidak bisa login; kunci akun setelah gagal berulang; password sementara hanya tampil sekali dan wajib diganti |
| RBAC | 3 role; dicek di server per modul; uji: Bendahara↔Keamanan saling tertutup, API backup/pengaturan/log/pengguna hanya Super Admin |
| Sesi/CSRF | cookie HttpOnly + SameSite; token CSRF + cek Origin; idle/absolut dapat diatur; sesi dicabut saat reset/pemulihan |
| SQL injection | query berparameter ($n); nama tabel backup lewat quoting identifier |
| XSS | UI dibangun via DOM (tanpa innerHTML data pengguna), CSP ketat, konten berita disanitasi (sanitize-html) |
| Rate limit | per akun dan per IP (uji 429) |
| Upload | validasi tipe/ukuran, gambar diproses sharp |
| Backup | tersimpan di tabel tanpa grant ke peran DB lain; unduh hanya Super Admin; tidak ada kredensial di berkas publik |
| Log | append-only (trigger); password tidak dicatat |
| Dependensi | express/qs/body-parser diperbarui. **Sisa 3 temuan** (sharp/libvips high, exceljs→uuid moderate ×2) memerlukan upgrade mayor; belum dilakukan karena berisiko mengubah perilaku. Perlu dijadwalkan dan diuji ulang |

Batasan: belum diuji di Vercel/Neon sungguhan; performa data besar belum diukur; backup berada di DB yang sama (lihat PEMULIHAN.md).
