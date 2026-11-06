-- SIMA Al Hidayah - skema PostgreSQL (Neon/Supabase/Postgres biasa). Idempotent: aman dijalankan berulang.
-- Tahap 1: fondasi. Tidak ada data contoh/fiktif.

-- ============ AKUN, SESI, LOG ============
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  username        TEXT NOT NULL CHECK (char_length(username) BETWEEN 3 AND 40),
  email           TEXT,
  nama            TEXT NOT NULL CHECK (char_length(nama) BETWEEN 2 AND 100),
  password_hash   TEXT NOT NULL,
  -- Hanya tiga role yang diizinkan, dipaksa di level database.
  role            TEXT NOT NULL CHECK (role IN ('super_admin','bendahara','keamanan')),
  aktif           BOOLEAN NOT NULL DEFAULT TRUE,
  login_gagal     INTEGER NOT NULL DEFAULT 0,
  terkunci_sampai BIGINT,
  terakhir_login  BIGINT,
  dibuat          BIGINT NOT NULL,
  diubah          BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,                       -- sha256 dari token cookie (token asli tidak disimpan)
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf        TEXT NOT NULL,
  dibuat      BIGINT NOT NULL,
  aktivitas   BIGINT NOT NULL,
  kedaluwarsa BIGINT NOT NULL,
  ip          TEXT,
  ua          TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS activity_log (
  id         BIGSERIAL PRIMARY KEY,
  waktu      BIGINT NOT NULL,
  user_id    BIGINT,
  username   TEXT,
  aksi       TEXT NOT NULL,
  modul      TEXT NOT NULL,
  keterangan TEXT NOT NULL,
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS idx_log_waktu ON activity_log (id DESC);
CREATE INDEX IF NOT EXISTS idx_log_ip ON activity_log (ip, aksi, waktu);

CREATE OR REPLACE FUNCTION fn_log_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'activity_log bersifat append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_log_no_update ON activity_log;
CREATE TRIGGER trg_log_no_update BEFORE UPDATE OR DELETE ON activity_log FOR EACH ROW EXECUTE FUNCTION fn_log_append_only();

CREATE TABLE IF NOT EXISTS pengaturan (kunci TEXT PRIMARY KEY, nilai TEXT, diubah BIGINT NOT NULL);

-- ============ ASRAMA & KAMAR (Putra / Putri) ============
CREATE TABLE IF NOT EXISTS asrama (
  id    BIGSERIAL PRIMARY KEY,
  jenis TEXT NOT NULL UNIQUE CHECK (jenis IN ('putra','putri')),
  nama  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kamar (
  id        BIGSERIAL PRIMARY KEY,
  asrama_id BIGINT NOT NULL REFERENCES asrama(id),
  nama      TEXT NOT NULL CHECK (char_length(nama) BETWEEN 1 AND 60),
  kapasitas INTEGER NOT NULL CHECK (kapasitas > 0 AND kapasitas <= 200),
  status    TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif','perbaikan')),
  catatan   TEXT,
  UNIQUE (asrama_id, nama)
);

-- ============ SANTRI (Putra / Putri lewat jenis kelamin) ============
CREATE TABLE IF NOT EXISTS santri (
  id            BIGSERIAL PRIMARY KEY,
  nis           TEXT UNIQUE,
  nama          TEXT NOT NULL CHECK (char_length(nama) >= 2),
  foto          TEXT,
  tempat_lahir  TEXT,
  tanggal_lahir DATE,
  jenis_kelamin TEXT NOT NULL CHECK (jenis_kelamin IN ('L','P')),
  alamat        TEXT,
  telepon       TEXT,
  nama_wali     TEXT,
  tahun_masuk   INTEGER,
  status        TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','cuti','lulus','keluar')),
  kamar_id      BIGINT REFERENCES kamar(id),
  dibuat        BIGINT NOT NULL,
  diubah        BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_santri_jk ON santri(jenis_kelamin);
CREATE INDEX IF NOT EXISTS idx_santri_kamar ON santri(kamar_id);

CREATE TABLE IF NOT EXISTS riwayat_pendidikan (
  id BIGSERIAL PRIMARY KEY, santri_id BIGINT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
  jenjang TEXT, lembaga TEXT, tahun_mulai INTEGER, tahun_selesai INTEGER, keterangan TEXT
);
CREATE TABLE IF NOT EXISTS dokumen_santri (
  id BIGSERIAL PRIMARY KEY, santri_id BIGINT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
  jenis TEXT NOT NULL, berkas TEXT NOT NULL, diunggah BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS riwayat_kamar (
  id BIGSERIAL PRIMARY KEY, santri_id BIGINT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
  kamar_id BIGINT REFERENCES kamar(id), mulai BIGINT NOT NULL, selesai BIGINT, catatan TEXT, oleh BIGINT REFERENCES users(id)
);

-- Penempatan harus sesuai jenis kelamin (L=Putra, P=Putri), kamar aktif, dan belum penuh.
CREATE OR REPLACE FUNCTION fn_santri_kamar() RETURNS trigger AS $$
DECLARE v_jenis TEXT; v_status TEXT; v_kap INTEGER; v_isi INTEGER;
BEGIN
  IF NEW.kamar_id IS NULL THEN RETURN NEW; END IF;
  SELECT a.jenis, k.status, k.kapasitas INTO v_jenis, v_status, v_kap
    FROM kamar k JOIN asrama a ON a.id = k.asrama_id WHERE k.id = NEW.kamar_id;
  IF v_jenis IS DISTINCT FROM (CASE NEW.jenis_kelamin WHEN 'L' THEN 'putra' ELSE 'putri' END) THEN
    RAISE EXCEPTION 'Penempatan ditolak: kamar tidak sesuai jenis kelamin santri';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.kamar_id IS DISTINCT FROM OLD.kamar_id THEN
    IF v_status IS DISTINCT FROM 'aktif' THEN RAISE EXCEPTION 'Penempatan ditolak: kamar tidak aktif'; END IF;
    SELECT COUNT(*) INTO v_isi FROM santri WHERE kamar_id = NEW.kamar_id AND id <> COALESCE(NEW.id, -1) AND status IN ('aktif','cuti');
    IF NEW.status IN ('aktif','cuti') AND v_isi >= v_kap THEN RAISE EXCEPTION 'Penempatan ditolak: kapasitas kamar penuh'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_santri_kamar ON santri;
CREATE TRIGGER trg_santri_kamar BEFORE INSERT OR UPDATE OF kamar_id, jenis_kelamin ON santri FOR EACH ROW EXECUTE FUNCTION fn_santri_kamar();

CREATE OR REPLACE FUNCTION fn_kamar_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.asrama_id <> OLD.asrama_id AND EXISTS (SELECT 1 FROM santri WHERE kamar_id = OLD.id) THEN
    RAISE EXCEPTION 'Asrama kamar tidak dapat diubah selama masih ada penghuni';
  END IF;
  IF NEW.kapasitas < (SELECT COUNT(*) FROM santri WHERE kamar_id = OLD.id AND status IN ('aktif','cuti')) THEN
    RAISE EXCEPTION 'Kapasitas baru lebih kecil dari jumlah penghuni';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_kamar_guard ON kamar;
CREATE TRIGGER trg_kamar_guard BEFORE UPDATE OF asrama_id, kapasitas ON kamar FOR EACH ROW EXECUTE FUNCTION fn_kamar_guard();

-- ============ PENGURUS (Putra / Putri) & PENGAJAR ============
CREATE TABLE IF NOT EXISTS pengurus (
  id BIGSERIAL PRIMARY KEY, kelompok TEXT NOT NULL CHECK (kelompok IN ('putra','putri')),
  nama TEXT NOT NULL CHECK (char_length(nama) >= 2), foto TEXT, jabatan TEXT NOT NULL, divisi TEXT, tugas TEXT, periode TEXT,
  aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL, diubah BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS pengurus_riwayat (
  id BIGSERIAL PRIMARY KEY, pengurus_id BIGINT NOT NULL REFERENCES pengurus(id) ON DELETE CASCADE,
  waktu BIGINT NOT NULL, keterangan TEXT NOT NULL, oleh BIGINT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS pengajar (
  id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL CHECK (char_length(nama) >= 2), foto TEXT, bidang TEXT,
  aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL, diubah BIGINT NOT NULL
);

-- ============ ROLE DATABASE PEMBATAS PER ROLE ============
-- Bendahara/Keamanan membaca data santri lewat role database yang HANYA boleh SELECT view terpangkas (didefinisikan di bagian Tahap 2).
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sima_keuangan') THEN CREATE ROLE sima_keuangan NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sima_keamanan') THEN CREATE ROLE sima_keamanan NOLOGIN; END IF;
END $$;
GRANT sima_keuangan TO CURRENT_USER;
GRANT sima_keamanan TO CURRENT_USER;

-- =====================================================================
-- TAHAP 2: modul data utama. Semua perubahan idempotent (aman untuk DB Tahap 1 maupun DB baru).
-- Tidak ada data contoh/fiktif. Data tidak pernah dihapus permanen: diarsipkan + riwayat.
-- =====================================================================

-- ---- Penyimpanan berkas (foto, KK, dokumen). Hanya dapat dibaca lewat API terautentikasi. ----
CREATE TABLE IF NOT EXISTS berkas (
  id        BIGSERIAL PRIMARY KEY,
  jenis     TEXT NOT NULL CHECK (jenis IN ('foto','kk','identitas','pendukung','foto_pengurus','foto_pengajar')),
  mime      TEXT NOT NULL CHECK (mime IN ('image/jpeg','image/png','application/pdf')),
  ukuran    INTEGER NOT NULL CHECK (ukuran > 0 AND ukuran <= 2621440),
  nama_asli TEXT,
  sha256    TEXT NOT NULL,
  isi       BYTEA NOT NULL,
  diunggah  BIGINT NOT NULL,
  oleh      BIGINT REFERENCES users(id)
);

-- ---- Asrama & kamar ----
ALTER TABLE asrama DROP CONSTRAINT IF EXISTS asrama_jenis_key;      -- boleh lebih dari satu asrama per jenis
ALTER TABLE asrama ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aktif';
ALTER TABLE asrama ADD COLUMN IF NOT EXISTS keterangan TEXT;
ALTER TABLE asrama ADD COLUMN IF NOT EXISTS diarsipkan BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE asrama DROP CONSTRAINT IF EXISTS asrama_status_v2;
ALTER TABLE asrama ADD CONSTRAINT asrama_status_v2 CHECK (status IN ('aktif','nonaktif'));
CREATE UNIQUE INDEX IF NOT EXISTS ux_asrama_nama ON asrama (jenis, lower(nama));
ALTER TABLE kamar ADD COLUMN IF NOT EXISTS diarsipkan BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE kamar DROP CONSTRAINT IF EXISTS kamar_asrama_id_nama_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_kamar_nama ON kamar (asrama_id, lower(nama));

-- ---- Santri: status hanya aktif / alumni. Alumni memakai baris yang SAMA (tanpa salinan). ----
ALTER TABLE santri DROP CONSTRAINT IF EXISTS santri_status_check;
ALTER TABLE santri DROP CONSTRAINT IF EXISTS santri_status_v2;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS status_alumni TEXT;
UPDATE santri SET status_alumni = CASE status WHEN 'lulus' THEN 'lulus' ELSE 'berhenti' END, status = 'alumni', kamar_id = NULL WHERE status IN ('lulus','keluar');
UPDATE santri SET status = 'aktif' WHERE status = 'cuti';
ALTER TABLE santri ADD COLUMN IF NOT EXISTS nama_ayah TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS pekerjaan_ayah TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS status_ayah TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS nama_ibu TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS pekerjaan_ibu TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS status_ibu TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS wali_hubungan TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS wali_pekerjaan TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS wali_telepon TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS wali_alamat TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS tanggal_masuk DATE;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS catatan_admin TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS pendidikan_formal TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS lembaga_pendidikan TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS program_pesantren TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS foto_berkas BIGINT REFERENCES berkas(id);
ALTER TABLE santri ADD COLUMN IF NOT EXISTS kk_berkas BIGINT REFERENCES berkas(id);
ALTER TABLE santri ADD COLUMN IF NOT EXISTS diarsipkan BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS diarsipkan_pada BIGINT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS tanggal_keluar DATE;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS tahun_keluar INTEGER;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS keterangan_keluar TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS program_terakhir TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS asrama_terakhir TEXT;
ALTER TABLE santri ADD COLUMN IF NOT EXISTS catatan_alumni TEXT;
ALTER TABLE santri ADD CONSTRAINT santri_status_v2 CHECK (status IN ('aktif','alumni'));
ALTER TABLE santri DROP CONSTRAINT IF EXISTS santri_alumni_v2;
ALTER TABLE santri ADD CONSTRAINT santri_alumni_v2 CHECK (
  (status = 'alumni' AND status_alumni IN ('lulus','berhenti') AND kamar_id IS NULL)
  OR (status = 'aktif' AND status_alumni IS NULL));
ALTER TABLE santri DROP CONSTRAINT IF EXISTS santri_arsip_v2;
ALTER TABLE santri ADD CONSTRAINT santri_arsip_v2 CHECK (NOT diarsipkan OR kamar_id IS NULL);
ALTER TABLE santri DROP CONSTRAINT IF EXISTS santri_ortu_v2;
ALTER TABLE santri ADD CONSTRAINT santri_ortu_v2 CHECK (
  (status_ayah IS NULL OR status_ayah IN ('hidup','meninggal','tidak_diketahui'))
  AND (status_ibu IS NULL OR status_ibu IN ('hidup','meninggal','tidak_diketahui')));
ALTER TABLE santri DROP CONSTRAINT IF EXISTS santri_tahun_v2;
ALTER TABLE santri ADD CONSTRAINT santri_tahun_v2 CHECK (
  (tahun_masuk IS NULL OR tahun_masuk BETWEEN 1900 AND 2200)
  AND (tahun_keluar IS NULL OR tahun_keluar BETWEEN 1900 AND 2200)
  AND (tahun_masuk IS NULL OR tahun_keluar IS NULL OR tahun_keluar >= tahun_masuk));
CREATE UNIQUE INDEX IF NOT EXISTS ux_santri_nis_lower ON santri (lower(nis)) WHERE nis IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_santri_status ON santri(status, diarsipkan);

-- Data santri tidak boleh dihapus permanen (riwayat diperlukan administrasi). Gunakan pengarsipan.
CREATE OR REPLACE FUNCTION fn_santri_no_delete() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Data santri tidak boleh dihapus permanen; gunakan pengarsipan'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_santri_no_delete ON santri;
CREATE TRIGGER trg_santri_no_delete BEFORE DELETE ON santri FOR EACH ROW EXECUTE FUNCTION fn_santri_no_delete();

-- Penempatan: jenis kelamin sesuai, kamar & asrama aktif/tidak diarsipkan, kapasitas cukup, hanya santri aktif.
CREATE OR REPLACE FUNCTION fn_santri_kamar() RETURNS trigger AS $$
DECLARE v_jenis TEXT; v_kstatus TEXT; v_kap INTEGER; v_isi INTEGER; v_karsip BOOLEAN; v_astatus TEXT; v_aarsip BOOLEAN;
BEGIN
  IF NEW.kamar_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status <> 'aktif' OR NEW.diarsipkan THEN RAISE EXCEPTION 'Penempatan ditolak: hanya santri aktif yang dapat berada di kamar'; END IF;
  SELECT a.jenis, k.status, k.kapasitas, k.diarsipkan, a.status, a.diarsipkan INTO v_jenis, v_kstatus, v_kap, v_karsip, v_astatus, v_aarsip
    FROM kamar k JOIN asrama a ON a.id = k.asrama_id WHERE k.id = NEW.kamar_id;
  IF v_jenis IS DISTINCT FROM (CASE NEW.jenis_kelamin WHEN 'L' THEN 'putra' ELSE 'putri' END) THEN
    RAISE EXCEPTION 'Penempatan ditolak: kamar tidak sesuai jenis kelamin santri';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.kamar_id IS DISTINCT FROM OLD.kamar_id THEN
    IF v_kstatus IS DISTINCT FROM 'aktif' OR v_karsip OR v_astatus IS DISTINCT FROM 'aktif' OR v_aarsip THEN RAISE EXCEPTION 'Penempatan ditolak: kamar tidak aktif'; END IF;
    SELECT COUNT(*) INTO v_isi FROM santri WHERE kamar_id = NEW.kamar_id AND id <> COALESCE(NEW.id, -1) AND status = 'aktif' AND NOT diarsipkan;
    IF v_isi >= v_kap THEN RAISE EXCEPTION 'Penempatan ditolak: kapasitas kamar penuh'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_santri_kamar ON santri;
CREATE TRIGGER trg_santri_kamar BEFORE INSERT OR UPDATE OF kamar_id, jenis_kelamin, status, diarsipkan ON santri FOR EACH ROW EXECUTE FUNCTION fn_santri_kamar();

CREATE OR REPLACE FUNCTION fn_kamar_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.asrama_id <> OLD.asrama_id AND EXISTS (SELECT 1 FROM santri WHERE kamar_id = OLD.id) THEN
    RAISE EXCEPTION 'Asrama kamar tidak dapat diubah selama masih ada penghuni';
  END IF;
  IF NEW.kapasitas < (SELECT COUNT(*) FROM santri WHERE kamar_id = OLD.id AND status = 'aktif' AND NOT diarsipkan) THEN
    RAISE EXCEPTION 'Kapasitas baru lebih kecil dari jumlah penghuni';
  END IF;
  IF (NEW.diarsipkan AND NOT OLD.diarsipkan OR NEW.status <> 'aktif' AND OLD.status = 'aktif') AND EXISTS (SELECT 1 FROM santri WHERE kamar_id = OLD.id) THEN
    RAISE EXCEPTION 'Kamar masih berpenghuni; pindahkan penghuni terlebih dahulu';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_kamar_guard ON kamar;
CREATE TRIGGER trg_kamar_guard BEFORE UPDATE OF asrama_id, kapasitas, status, diarsipkan ON kamar FOR EACH ROW EXECUTE FUNCTION fn_kamar_guard();

-- ---- Riwayat penempatan (asrama/kamar) dan riwayat status santri ----
CREATE TABLE IF NOT EXISTS riwayat_penempatan (
  id         BIGSERIAL PRIMARY KEY,
  santri_id  BIGINT NOT NULL REFERENCES santri(id),
  jenis      TEXT NOT NULL CHECK (jenis IN ('penempatan_baru','pindah_kamar','pindah_asrama','keluar_kamar','keluar_otomatis')),
  dari_kamar_id BIGINT REFERENCES kamar(id), ke_kamar_id BIGINT REFERENCES kamar(id),
  dari_asrama TEXT, dari_kamar TEXT, ke_asrama TEXT, ke_kamar TEXT,           -- nama saat kejadian (tetap benar walau nama diganti)
  waktu      BIGINT NOT NULL, oleh BIGINT REFERENCES users(id), oleh_username TEXT, alasan TEXT
);
CREATE INDEX IF NOT EXISTS idx_rp_santri ON riwayat_penempatan(santri_id, id DESC);
CREATE TABLE IF NOT EXISTS riwayat_status (
  id         BIGSERIAL PRIMARY KEY,
  santri_id  BIGINT NOT NULL REFERENCES santri(id),
  jenis      TEXT NOT NULL CHECK (jenis IN ('dibuat','ubah_data','arsip','pulihkan','pindah_alumni','koreksi_alumni','aktifkan_kembali','tambah_alumni','dokumen')),
  status_sebelum TEXT, status_sesudah TEXT,
  data_sebelum JSONB, data_sesudah JSONB,
  waktu      BIGINT NOT NULL, oleh BIGINT REFERENCES users(id), oleh_username TEXT, alasan TEXT
);
CREATE INDEX IF NOT EXISTS idx_rs_santri ON riwayat_status(santri_id, id DESC);

-- ---- Dokumen pendukung santri (identitas / lainnya) memakai tabel berkas ----
ALTER TABLE dokumen_santri ALTER COLUMN berkas DROP NOT NULL;
ALTER TABLE dokumen_santri ADD COLUMN IF NOT EXISTS berkas_id BIGINT REFERENCES berkas(id);
ALTER TABLE dokumen_santri ADD COLUMN IF NOT EXISTS keterangan TEXT;

-- ---- Kepengurusan: jabatan (hierarki), divisi, periode; per kelompok putra/putri ----
CREATE TABLE IF NOT EXISTS jabatan (
  id BIGSERIAL PRIMARY KEY, kelompok TEXT NOT NULL CHECK (kelompok IN ('putra','putri')),
  nama TEXT NOT NULL CHECK (char_length(nama) BETWEEN 2 AND 80),
  induk_id BIGINT REFERENCES jabatan(id), urutan INTEGER NOT NULL DEFAULT 0, keterangan TEXT,
  aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL, diubah BIGINT NOT NULL,
  CHECK (induk_id IS NULL OR induk_id <> id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_jabatan_nama ON jabatan (kelompok, lower(nama));
CREATE TABLE IF NOT EXISTS divisi (
  id BIGSERIAL PRIMARY KEY, kelompok TEXT NOT NULL CHECK (kelompok IN ('putra','putri')),
  nama TEXT NOT NULL CHECK (char_length(nama) BETWEEN 2 AND 80), keterangan TEXT,
  aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL, diubah BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_divisi_nama ON divisi (kelompok, lower(nama));
CREATE TABLE IF NOT EXISTS periode (
  id BIGSERIAL PRIMARY KEY, kelompok TEXT NOT NULL CHECK (kelompok IN ('putra','putri')),
  nama TEXT NOT NULL CHECK (char_length(nama) BETWEEN 2 AND 60), mulai DATE, selesai DATE,
  aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL, diubah BIGINT NOT NULL,
  CHECK (mulai IS NULL OR selesai IS NULL OR selesai >= mulai)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_periode_nama ON periode (kelompok, lower(nama));

ALTER TABLE pengurus ALTER COLUMN jabatan DROP NOT NULL;
ALTER TABLE pengurus ADD COLUMN IF NOT EXISTS jenis_kelamin TEXT;
ALTER TABLE pengurus ADD COLUMN IF NOT EXISTS jabatan_id BIGINT REFERENCES jabatan(id);
ALTER TABLE pengurus ADD COLUMN IF NOT EXISTS divisi_id BIGINT REFERENCES divisi(id);
ALTER TABLE pengurus ADD COLUMN IF NOT EXISTS periode_id BIGINT REFERENCES periode(id);
ALTER TABLE pengurus ADD COLUMN IF NOT EXISTS tanggal_mulai DATE;
ALTER TABLE pengurus ADD COLUMN IF NOT EXISTS tanggal_selesai DATE;
ALTER TABLE pengurus ADD COLUMN IF NOT EXISTS keterangan TEXT;
ALTER TABLE pengurus ADD COLUMN IF NOT EXISTS foto_berkas BIGINT REFERENCES berkas(id);
ALTER TABLE pengurus ADD COLUMN IF NOT EXISTS diarsipkan BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE pengurus SET jenis_kelamin = CASE kelompok WHEN 'putra' THEN 'L' ELSE 'P' END WHERE jenis_kelamin IS NULL;
ALTER TABLE pengurus DROP CONSTRAINT IF EXISTS pengurus_jk_v2;
ALTER TABLE pengurus ADD CONSTRAINT pengurus_jk_v2 CHECK (jenis_kelamin IS NULL OR (kelompok = 'putra' AND jenis_kelamin = 'L') OR (kelompok = 'putri' AND jenis_kelamin = 'P'));
ALTER TABLE pengurus DROP CONSTRAINT IF EXISTS pengurus_tgl_v2;
ALTER TABLE pengurus ADD CONSTRAINT pengurus_tgl_v2 CHECK (tanggal_mulai IS NULL OR tanggal_selesai IS NULL OR tanggal_selesai >= tanggal_mulai);

-- ---- Pengajar + riwayat penugasan ----
ALTER TABLE pengajar ADD COLUMN IF NOT EXISTS alamat TEXT;
ALTER TABLE pengajar ADD COLUMN IF NOT EXISTS kontak TEXT;
ALTER TABLE pengajar ADD COLUMN IF NOT EXISTS lembaga TEXT;
ALTER TABLE pengajar ADD COLUMN IF NOT EXISTS tanggal_mulai DATE;
ALTER TABLE pengajar ADD COLUMN IF NOT EXISTS keterangan TEXT;
ALTER TABLE pengajar ADD COLUMN IF NOT EXISTS foto_berkas BIGINT REFERENCES berkas(id);
ALTER TABLE pengajar ADD COLUMN IF NOT EXISTS diarsipkan BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS pengajar_penugasan (
  id BIGSERIAL PRIMARY KEY, pengajar_id BIGINT NOT NULL REFERENCES pengajar(id),
  bidang TEXT, lembaga TEXT, mulai DATE, selesai DATE, keterangan TEXT,
  dibuat BIGINT NOT NULL, oleh BIGINT REFERENCES users(id),
  CHECK (bidang IS NOT NULL OR lembaga IS NOT NULL), CHECK (mulai IS NULL OR selesai IS NULL OR selesai >= mulai)
);
CREATE INDEX IF NOT EXISTS idx_penugasan ON pengajar_penugasan(pengajar_id, id DESC);

-- ---- View terpangkas untuk Bendahara/Keamanan: hanya santri AKTIF, tanpa KK/alamat/keluarga ----
DROP VIEW IF EXISTS v_santri_keuangan;
DROP VIEW IF EXISTS v_santri_keamanan;
CREATE VIEW v_santri_keuangan AS
  SELECT id, nis, nama, CASE jenis_kelamin WHEN 'L' THEN 'putra' ELSE 'putri' END AS kelompok, tahun_masuk, status
  FROM santri WHERE status = 'aktif' AND NOT diarsipkan;
CREATE VIEW v_santri_keamanan AS
  SELECT s.id, s.nis, s.nama, s.foto_berkas AS foto, CASE s.jenis_kelamin WHEN 'L' THEN 'putra' ELSE 'putri' END AS kelompok,
         s.status, a.nama AS asrama, k.nama AS kamar
  FROM santri s LEFT JOIN kamar k ON k.id = s.kamar_id LEFT JOIN asrama a ON a.id = k.asrama_id
  WHERE s.status = 'aktif' AND NOT s.diarsipkan;
GRANT SELECT ON v_santri_keuangan TO sima_keuangan;
GRANT SELECT ON v_santri_keamanan TO sima_keamanan;

-- =====================================================================
-- TAHAP 3: KEUANGAN. Tiga buku TERPISAH: (1) tagihan & pembayaran santri, (2) tabungan santri, (3) kas operasional.
-- Saldo tidak pernah disimpan/diedit: selalu dihitung dari transaksi. Transaksi tidak dapat dihapus/diubah;
-- kesalahan diperbaiki lewat pembatalan/pembalikan yang tercatat (alasan, pengguna, waktu, nilai sebelum/sesudah).
-- =====================================================================
ALTER TABLE berkas DROP CONSTRAINT IF EXISTS berkas_jenis_check;
ALTER TABLE berkas ADD CONSTRAINT berkas_jenis_check CHECK (jenis IN ('foto','kk','identitas','pendukung','foto_pengurus','foto_pengajar','bukti_kas'));

CREATE TABLE IF NOT EXISTS keu_kategori_tagihan (id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL, keterangan TEXT, aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_keu_kt ON keu_kategori_tagihan (lower(nama));
CREATE TABLE IF NOT EXISTS keu_kategori_kas (id BIGSERIAL PRIMARY KEY, jenis TEXT NOT NULL CHECK (jenis IN ('masuk','keluar')), nama TEXT NOT NULL, aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_keu_kk ON keu_kategori_kas (jenis, lower(nama));
CREATE TABLE IF NOT EXISTS keu_metode (id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL, aktif BOOLEAN NOT NULL DEFAULT TRUE);
CREATE UNIQUE INDEX IF NOT EXISTS uq_keu_metode ON keu_metode (lower(nama));
INSERT INTO keu_metode (nama) VALUES ('Tunai'), ('Transfer') ON CONFLICT DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS keu_seq_kuitansi; CREATE SEQUENCE IF NOT EXISTS keu_seq_tabungan; CREATE SEQUENCE IF NOT EXISTS keu_seq_kas;

CREATE TABLE IF NOT EXISTS keu_tagihan (
  id BIGSERIAL PRIMARY KEY,
  santri_id BIGINT NOT NULL REFERENCES santri(id),
  kategori_id BIGINT NOT NULL REFERENCES keu_kategori_tagihan(id),
  nama TEXT NOT NULL, periode TEXT NOT NULL, periode_key TEXT NOT NULL,
  nominal BIGINT NOT NULL CHECK (nominal > 0 AND nominal <= 1000000000000),
  jatuh_tempo DATE, keterangan TEXT,
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','dibatalkan')),
  batal_alasan TEXT, batal_oleh BIGINT REFERENCES users(id), batal_waktu BIGINT,
  dibuat BIGINT NOT NULL, oleh BIGINT NOT NULL REFERENCES users(id),
  CHECK (status = 'aktif' OR (batal_alasan IS NOT NULL AND batal_waktu IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_keu_tagihan ON keu_tagihan (santri_id, kategori_id, periode_key) WHERE status = 'aktif';
CREATE INDEX IF NOT EXISTS idx_keu_tagihan_s ON keu_tagihan (santri_id, id DESC);

CREATE TABLE IF NOT EXISTS keu_pembayaran (
  id BIGSERIAL PRIMARY KEY, no_kuitansi TEXT NOT NULL UNIQUE,
  tagihan_id BIGINT NOT NULL REFERENCES keu_tagihan(id), santri_id BIGINT NOT NULL REFERENCES santri(id),
  tanggal DATE NOT NULL, nominal BIGINT NOT NULL CHECK (nominal > 0 AND nominal <= 1000000000000),
  metode_id BIGINT REFERENCES keu_metode(id), metode TEXT NOT NULL, keterangan TEXT,
  sisa_setelah BIGINT NOT NULL CHECK (sisa_setelah >= 0),
  status TEXT NOT NULL DEFAULT 'sah' CHECK (status IN ('sah','dibatalkan')),
  batal_alasan TEXT, batal_oleh BIGINT REFERENCES users(id), batal_waktu BIGINT,
  idem TEXT UNIQUE, dibuat BIGINT NOT NULL, oleh BIGINT NOT NULL REFERENCES users(id),
  CHECK (status = 'sah' OR (batal_alasan IS NOT NULL AND batal_waktu IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_keu_bayar_t ON keu_pembayaran (tagihan_id); CREATE INDEX IF NOT EXISTS idx_keu_bayar_tgl ON keu_pembayaran (tanggal);

CREATE TABLE IF NOT EXISTS tabungan_rekening (
  id BIGSERIAL PRIMARY KEY, santri_id BIGINT NOT NULL UNIQUE REFERENCES santri(id),
  dibuka DATE NOT NULL, status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','ditutup')),
  dibuat BIGINT NOT NULL, oleh BIGINT NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS tabungan_transaksi (
  id BIGSERIAL PRIMARY KEY, no_transaksi TEXT NOT NULL UNIQUE,
  rekening_id BIGINT NOT NULL REFERENCES tabungan_rekening(id), santri_id BIGINT NOT NULL REFERENCES santri(id),
  tanggal DATE NOT NULL, jenis TEXT NOT NULL CHECK (jenis IN ('setoran','penarikan','pembalikan_setoran','pembalikan_penarikan')),
  nominal BIGINT NOT NULL CHECK (nominal > 0 AND nominal <= 1000000000000),
  metode TEXT, keterangan TEXT, saldo_sebelum BIGINT NOT NULL CHECK (saldo_sebelum >= 0), saldo_sesudah BIGINT NOT NULL CHECK (saldo_sesudah >= 0),
  membalik_id BIGINT UNIQUE REFERENCES tabungan_transaksi(id), alasan TEXT,
  idem TEXT UNIQUE, dibuat BIGINT NOT NULL, oleh BIGINT NOT NULL REFERENCES users(id),
  CHECK ((jenis LIKE 'pembalikan%') = (membalik_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_tab_trx ON tabungan_transaksi (rekening_id, id DESC); CREATE INDEX IF NOT EXISTS idx_tab_tgl ON tabungan_transaksi (tanggal);

CREATE TABLE IF NOT EXISTS kas_transaksi (
  id BIGSERIAL PRIMARY KEY, no_transaksi TEXT NOT NULL UNIQUE, tanggal DATE NOT NULL,
  jenis TEXT NOT NULL CHECK (jenis IN ('saldo_awal','masuk','keluar','pembalikan_masuk','pembalikan_keluar')),
  kategori_id BIGINT REFERENCES keu_kategori_kas(id), kategori TEXT, pihak TEXT,
  nominal BIGINT NOT NULL CHECK (nominal > 0 AND nominal <= 1000000000000), keterangan TEXT,
  berkas_id BIGINT REFERENCES berkas(id), membalik_id BIGINT UNIQUE REFERENCES kas_transaksi(id), alasan TEXT,
  idem TEXT UNIQUE, dibuat BIGINT NOT NULL, oleh BIGINT NOT NULL REFERENCES users(id),
  CHECK ((jenis LIKE 'pembalikan%') = (membalik_id IS NOT NULL)), CHECK (jenis IN ('saldo_awal') OR kategori IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kas_saldo_awal ON kas_transaksi ((1)) WHERE jenis = 'saldo_awal';
CREATE INDEX IF NOT EXISTS idx_kas_tgl ON kas_transaksi (tanggal, id);

CREATE TABLE IF NOT EXISTS keu_audit (
  id BIGSERIAL PRIMARY KEY, waktu BIGINT NOT NULL, user_id BIGINT, username TEXT, entitas TEXT NOT NULL, entitas_id BIGINT,
  aksi TEXT NOT NULL, alasan TEXT, sebelum JSONB, sesudah JSONB
);
CREATE INDEX IF NOT EXISTS idx_keu_audit ON keu_audit (entitas, entitas_id, id DESC);

-- ---- Pengaman di level database ----
CREATE OR REPLACE FUNCTION fn_keu_nodelete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Transaksi keuangan tidak boleh dihapus; gunakan pembatalan atau pembalikan.'; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION fn_keu_immutable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Transaksi keuangan tidak boleh diubah atau dihapus; gunakan pembatalan atau pembalikan.'; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION fn_keu_bayar_upd() RETURNS trigger AS $$ BEGIN
  IF OLD.status = 'sah' AND NEW.status = 'dibatalkan' AND NEW.batal_alasan IS NOT NULL AND NEW.batal_waktu IS NOT NULL
     AND (NEW.id, NEW.no_kuitansi, NEW.tagihan_id, NEW.santri_id, NEW.tanggal, NEW.nominal, NEW.metode, NEW.sisa_setelah, NEW.dibuat, NEW.oleh)
         IS NOT DISTINCT FROM (OLD.id, OLD.no_kuitansi, OLD.tagihan_id, OLD.santri_id, OLD.tanggal, OLD.nominal, OLD.metode, OLD.sisa_setelah, OLD.dibuat, OLD.oleh) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Pembayaran hanya dapat dibatalkan (dengan alasan); isinya tidak boleh diubah.'; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION fn_keu_tagihan_upd() RETURNS trigger AS $$ DECLARE d BIGINT; BEGIN
  IF (NEW.id, NEW.santri_id, NEW.kategori_id, NEW.periode_key, NEW.dibuat, NEW.oleh) IS DISTINCT FROM (OLD.id, OLD.santri_id, OLD.kategori_id, OLD.periode_key, OLD.dibuat, OLD.oleh) THEN
    RAISE EXCEPTION 'Identitas tagihan tidak boleh diubah.'; END IF;
  IF OLD.status = 'dibatalkan' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Tagihan yang dibatalkan tidak dapat diubah.'; END IF;
  SELECT COALESCE(SUM(nominal),0) INTO d FROM keu_pembayaran WHERE tagihan_id = NEW.id AND status = 'sah';
  IF NEW.status = 'dibatalkan' AND d > 0 THEN RAISE EXCEPTION 'Tagihan sudah memiliki pembayaran; batalkan pembayarannya terlebih dahulu.'; END IF;
  IF NEW.nominal < d THEN RAISE EXCEPTION 'Nominal tagihan tidak boleh lebih kecil dari pembayaran yang sudah diterima.'; END IF;
  RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION fn_keu_bayar_ins() RETURNS trigger AS $$ DECLARE t RECORD; d BIGINT; BEGIN
  SELECT * INTO t FROM keu_tagihan WHERE id = NEW.tagihan_id;
  IF t.status <> 'aktif' THEN RAISE EXCEPTION 'Tagihan sudah dibatalkan.'; END IF;
  IF t.santri_id <> NEW.santri_id THEN RAISE EXCEPTION 'Pembayaran tidak sesuai dengan santri pada tagihan.'; END IF;
  SELECT COALESCE(SUM(nominal),0) INTO d FROM keu_pembayaran WHERE tagihan_id = NEW.tagihan_id AND status = 'sah';
  IF NEW.nominal > t.nominal - d THEN RAISE EXCEPTION 'Pembayaran melebihi sisa tagihan.'; END IF;
  IF NEW.sisa_setelah <> t.nominal - d - NEW.nominal THEN RAISE EXCEPTION 'Sisa tagihan tidak konsisten.'; END IF;
  RETURN NEW; END $$ LANGUAGE plpgsql;
-- saldo tabungan = penjumlahan transaksi; baris baru wajib konsisten dengan saldo yang sebenarnya
CREATE OR REPLACE FUNCTION fn_tab_ins() RETURNS trigger AS $$ DECLARE s BIGINT; e BIGINT; o RECORD; BEGIN
  SELECT COALESCE(SUM(CASE WHEN jenis IN ('setoran','pembalikan_penarikan') THEN nominal ELSE -nominal END),0) INTO s FROM tabungan_transaksi WHERE rekening_id = NEW.rekening_id;
  e := CASE WHEN NEW.jenis IN ('setoran','pembalikan_penarikan') THEN NEW.nominal ELSE -NEW.nominal END;
  IF NEW.saldo_sebelum <> s OR NEW.saldo_sesudah <> s + e THEN RAISE EXCEPTION 'Saldo tabungan tidak konsisten dengan riwayat transaksi.'; END IF;
  IF s + e < 0 THEN RAISE EXCEPTION 'Saldo tabungan tidak mencukupi.'; END IF;
  IF NEW.membalik_id IS NOT NULL THEN SELECT * INTO o FROM tabungan_transaksi WHERE id = NEW.membalik_id;
    IF o.id IS NULL OR o.jenis LIKE 'pembalikan%' OR o.rekening_id <> NEW.rekening_id OR o.nominal <> NEW.nominal OR NEW.jenis <> 'pembalikan_' || o.jenis THEN RAISE EXCEPTION 'Pembalikan tidak sesuai transaksi asal.'; END IF; END IF;
  RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION fn_kas_ins() RETURNS trigger AS $$ DECLARE o RECORD; BEGIN
  IF NEW.membalik_id IS NOT NULL THEN SELECT * INTO o FROM kas_transaksi WHERE id = NEW.membalik_id;
    IF o.id IS NULL OR o.jenis NOT IN ('masuk','keluar') OR o.nominal <> NEW.nominal OR NEW.jenis <> 'pembalikan_' || o.jenis THEN RAISE EXCEPTION 'Pembalikan tidak sesuai transaksi asal.'; END IF; END IF;
  RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION fn_kas_upd() RETURNS trigger AS $$ BEGIN
  IF OLD.berkas_id IS NULL AND NEW.berkas_id IS NOT NULL AND (NEW.id, NEW.no_transaksi, NEW.tanggal, NEW.jenis, NEW.nominal, NEW.kategori, NEW.dibuat) IS NOT DISTINCT FROM (OLD.id, OLD.no_transaksi, OLD.tanggal, OLD.jenis, OLD.nominal, OLD.kategori, OLD.dibuat) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Transaksi keuangan tidak boleh diubah atau dihapus; gunakan pembatalan atau pembalikan.'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tg_keu_bayar_del ON keu_pembayaran; CREATE TRIGGER tg_keu_bayar_del BEFORE DELETE ON keu_pembayaran FOR EACH ROW EXECUTE FUNCTION fn_keu_nodelete();
DROP TRIGGER IF EXISTS tg_keu_bayar_upd ON keu_pembayaran; CREATE TRIGGER tg_keu_bayar_upd BEFORE UPDATE ON keu_pembayaran FOR EACH ROW EXECUTE FUNCTION fn_keu_bayar_upd();
DROP TRIGGER IF EXISTS tg_keu_bayar_ins ON keu_pembayaran; CREATE TRIGGER tg_keu_bayar_ins BEFORE INSERT ON keu_pembayaran FOR EACH ROW EXECUTE FUNCTION fn_keu_bayar_ins();
DROP TRIGGER IF EXISTS tg_keu_tagihan_del ON keu_tagihan; CREATE TRIGGER tg_keu_tagihan_del BEFORE DELETE ON keu_tagihan FOR EACH ROW EXECUTE FUNCTION fn_keu_nodelete();
DROP TRIGGER IF EXISTS tg_keu_tagihan_upd ON keu_tagihan; CREATE TRIGGER tg_keu_tagihan_upd BEFORE UPDATE ON keu_tagihan FOR EACH ROW EXECUTE FUNCTION fn_keu_tagihan_upd();
DROP TRIGGER IF EXISTS tg_tab_imm ON tabungan_transaksi; CREATE TRIGGER tg_tab_imm BEFORE UPDATE OR DELETE ON tabungan_transaksi FOR EACH ROW EXECUTE FUNCTION fn_keu_immutable();
DROP TRIGGER IF EXISTS tg_tab_ins ON tabungan_transaksi; CREATE TRIGGER tg_tab_ins BEFORE INSERT ON tabungan_transaksi FOR EACH ROW EXECUTE FUNCTION fn_tab_ins();
DROP TRIGGER IF EXISTS tg_tab_rek_del ON tabungan_rekening; CREATE TRIGGER tg_tab_rek_del BEFORE DELETE ON tabungan_rekening FOR EACH ROW EXECUTE FUNCTION fn_keu_nodelete();
DROP TRIGGER IF EXISTS tg_kas_upd ON kas_transaksi; CREATE TRIGGER tg_kas_upd BEFORE UPDATE ON kas_transaksi FOR EACH ROW EXECUTE FUNCTION fn_kas_upd();
DROP TRIGGER IF EXISTS tg_kas_del ON kas_transaksi; CREATE TRIGGER tg_kas_del BEFORE DELETE ON kas_transaksi FOR EACH ROW EXECUTE FUNCTION fn_keu_nodelete();
DROP TRIGGER IF EXISTS tg_kas_ins ON kas_transaksi; CREATE TRIGGER tg_kas_ins BEFORE INSERT ON kas_transaksi FOR EACH ROW EXECUTE FUNCTION fn_kas_ins();
DROP TRIGGER IF EXISTS tg_keu_audit ON keu_audit; CREATE TRIGGER tg_keu_audit BEFORE UPDATE OR DELETE ON keu_audit FOR EACH ROW EXECUTE FUNCTION fn_keu_immutable();

-- ---- View ----
DROP VIEW IF EXISTS v_keu_tagihan; DROP VIEW IF EXISTS v_santri_keu;
CREATE VIEW v_santri_keu AS   -- data santri MINIMUM untuk keuangan (aktif maupun alumni, agar tabungan/tunggakan alumni tetap terlihat)
  SELECT s.id, s.nis, s.nama, CASE s.jenis_kelamin WHEN 'L' THEN 'putra' ELSE 'putri' END AS kelompok, s.tahun_masuk, s.status, s.diarsipkan,
         k.asrama_id, s.kamar_id, a.nama AS asrama, k.nama AS kamar
  FROM santri s LEFT JOIN kamar k ON k.id = s.kamar_id LEFT JOIN asrama a ON a.id = k.asrama_id;
CREATE VIEW v_keu_tagihan AS
  SELECT t.id, t.santri_id, t.kategori_id, c.nama AS kategori, t.nama, t.periode, t.nominal, t.jatuh_tempo, t.keterangan, t.status AS status_tagihan, t.dibuat, t.oleh,
         COALESCE(p.dibayar,0)::bigint AS dibayar, (t.nominal - COALESCE(p.dibayar,0))::bigint AS sisa, p.terakhir AS tgl_bayar_terakhir,
         CASE WHEN t.status = 'dibatalkan' THEN 'dibatalkan' WHEN COALESCE(p.dibayar,0) >= t.nominal THEN 'lunas' WHEN COALESCE(p.dibayar,0) > 0 THEN 'sebagian' ELSE 'belum' END AS status_bayar,
         s.nis, s.nama AS santri, s.kelompok, s.tahun_masuk, s.status AS status_santri, s.asrama_id, s.kamar_id, s.asrama, s.kamar
  FROM keu_tagihan t JOIN keu_kategori_tagihan c ON c.id = t.kategori_id JOIN v_santri_keu s ON s.id = t.santri_id
  LEFT JOIN (SELECT tagihan_id, SUM(nominal) AS dibayar, MAX(tanggal) AS terakhir FROM keu_pembayaran WHERE status = 'sah' GROUP BY tagihan_id) p ON p.tagihan_id = t.id;

-- ---- Hak role database: Bendahara = sima_keuangan (tanpa DELETE). Keamanan (sima_keamanan) TIDAK diberi hak apa pun pada tabel keuangan. ----
GRANT SELECT ON v_santri_keu, v_keu_tagihan TO sima_keuangan;
GRANT SELECT, INSERT, UPDATE ON keu_kategori_tagihan, keu_kategori_kas, keu_metode, keu_tagihan, keu_pembayaran, tabungan_rekening, tabungan_transaksi, kas_transaksi TO sima_keuangan;
GRANT SELECT, INSERT ON keu_audit TO sima_keuangan;
GRANT SELECT (id, username, nama) ON users TO sima_keuangan;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sima_keuangan;

-- =====================================================================
-- TAHAP 4: KEAMANAN. Pelanggaran, pembinaan, perizinan keluar/pulang. Terhubung ke santri lewat ID (dan NIS).
-- Tidak ada kategori/hukuman/denda/batas waktu bawaan: semuanya diatur Super Admin. Catatan tidak dihapus; dibatalkan/dikoreksi + audit.
-- =====================================================================
ALTER TABLE berkas DROP CONSTRAINT IF EXISTS berkas_jenis_check;
ALTER TABLE berkas ADD CONSTRAINT berkas_jenis_check CHECK (jenis IN ('foto','kk','identitas','pendukung','foto_pengurus','foto_pengajar','bukti_kas','bukti_kea'));

CREATE TABLE IF NOT EXISTS kea_pengaturan (kunci TEXT PRIMARY KEY, nilai JSONB NOT NULL, diubah BIGINT NOT NULL, oleh BIGINT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS kea_counter (kode TEXT NOT NULL, tahun INTEGER NOT NULL, nilai INTEGER NOT NULL, PRIMARY KEY (kode, tahun));
CREATE TABLE IF NOT EXISTS kea_kategori_pelanggaran (id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL, keterangan TEXT, aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kea_kp ON kea_kategori_pelanggaran (lower(nama));
CREATE TABLE IF NOT EXISTS kea_jenis_pembinaan (id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL, aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kea_jp ON kea_jenis_pembinaan (lower(nama));
CREATE TABLE IF NOT EXISTS kea_jenis_izin (id BIGSERIAL PRIMARY KEY, jenis TEXT NOT NULL CHECK (jenis IN ('keluar','pulang')), nama TEXT NOT NULL, aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kea_ji ON kea_jenis_izin (jenis, lower(nama));

CREATE TABLE IF NOT EXISTS kea_pelanggaran (
  id BIGSERIAL PRIMARY KEY, nomor TEXT NOT NULL UNIQUE, santri_id BIGINT NOT NULL REFERENCES santri(id),
  tanggal DATE NOT NULL, waktu TIME, kategori_id BIGINT REFERENCES kea_kategori_pelanggaran(id), kategori TEXT NOT NULL,
  deskripsi TEXT NOT NULL, lokasi TEXT, catatan TEXT, asrama TEXT, kamar TEXT,
  status TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru','proses','selesai')),
  berkas_id BIGINT REFERENCES berkas(id),
  batal BOOLEAN NOT NULL DEFAULT FALSE, batal_alasan TEXT, batal_oleh BIGINT REFERENCES users(id), batal_waktu BIGINT,
  dibuat BIGINT NOT NULL, oleh BIGINT NOT NULL REFERENCES users(id), diubah BIGINT, diubah_oleh BIGINT REFERENCES users(id),
  CHECK (NOT batal OR (batal_alasan IS NOT NULL AND batal_waktu IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_kea_plg_s ON kea_pelanggaran (santri_id, tanggal DESC); CREATE INDEX IF NOT EXISTS idx_kea_plg_t ON kea_pelanggaran (tanggal);
CREATE TABLE IF NOT EXISTS kea_pembinaan (
  id BIGSERIAL PRIMARY KEY, nomor TEXT NOT NULL UNIQUE, tanggal DATE NOT NULL, santri_id BIGINT NOT NULL REFERENCES santri(id),
  pelanggaran_id BIGINT REFERENCES kea_pelanggaran(id), alasan TEXT NOT NULL, jenis_id BIGINT REFERENCES kea_jenis_pembinaan(id), jenis TEXT NOT NULL,
  pembina TEXT NOT NULL, hasil TEXT, rencana TEXT, tanggal_tindak DATE,
  status TEXT NOT NULL DEFAULT 'berjalan' CHECK (status IN ('berjalan','selesai','dibatalkan')), batal_alasan TEXT, batal_oleh BIGINT REFERENCES users(id), batal_waktu BIGINT,
  dibuat BIGINT NOT NULL, oleh BIGINT NOT NULL REFERENCES users(id), diubah BIGINT, diubah_oleh BIGINT REFERENCES users(id),
  CHECK (status <> 'dibatalkan' OR batal_alasan IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_kea_pmb_s ON kea_pembinaan (santri_id, tanggal DESC);
CREATE TABLE IF NOT EXISTS kea_izin (
  id BIGSERIAL PRIMARY KEY, nomor TEXT NOT NULL UNIQUE, jenis TEXT NOT NULL CHECK (jenis IN ('keluar','pulang')), santri_id BIGINT NOT NULL REFERENCES santri(id),
  tgl_pengajuan DATE NOT NULL, tujuan TEXT NOT NULL, alasan TEXT, jenis_izin_id BIGINT REFERENCES kea_jenis_izin(id), jenis_izin TEXT,
  alamat_tujuan TEXT, pendamping TEXT, kontak_pendamping TEXT, wali TEXT, kontak_wali TEXT,
  rencana_keluar TIMESTAMPTZ NOT NULL, rencana_kembali TIMESTAMPTZ NOT NULL, aktual_keluar TIMESTAMPTZ, aktual_kembali TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','disetujui','ditolak','sedang_izin','kembali','dibatalkan')),
  disetujui_oleh BIGINT REFERENCES users(id), disetujui_nama TEXT, disetujui_waktu BIGINT, alasan_tolak TEXT, alasan_batal TEXT, catatan TEXT,
  tindak_status TEXT NOT NULL DEFAULT 'belum' CHECK (tindak_status IN ('belum','dihubungi','dalam_proses','selesai')), tindak_catatan TEXT,
  asrama TEXT, kamar TEXT, dibuat BIGINT NOT NULL, oleh BIGINT NOT NULL REFERENCES users(id), diubah BIGINT, diubah_oleh BIGINT REFERENCES users(id),
  CHECK (rencana_kembali > rencana_keluar), CHECK (aktual_kembali IS NULL OR aktual_keluar IS NOT NULL), CHECK (aktual_kembali IS NULL OR aktual_kembali >= aktual_keluar),
  CHECK (status <> 'sedang_izin' OR (aktual_keluar IS NOT NULL AND aktual_kembali IS NULL)), CHECK (status <> 'kembali' OR (aktual_keluar IS NOT NULL AND aktual_kembali IS NOT NULL)),
  CHECK (status NOT IN ('menunggu','disetujui','ditolak') OR aktual_keluar IS NULL), CHECK (status <> 'ditolak' OR alasan_tolak IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kea_izin_out ON kea_izin (santri_id) WHERE status = 'sedang_izin';
CREATE INDEX IF NOT EXISTS idx_kea_izin_s ON kea_izin (santri_id, id DESC); CREATE INDEX IF NOT EXISTS idx_kea_izin_st ON kea_izin (status, rencana_kembali);
CREATE TABLE IF NOT EXISTS kea_audit (
  id BIGSERIAL PRIMARY KEY, waktu BIGINT NOT NULL, user_id BIGINT, username TEXT, entitas TEXT NOT NULL, entitas_id BIGINT, aksi TEXT NOT NULL,
  ket TEXT, alasan TEXT, sebelum JSONB, sesudah JSONB
);
CREATE INDEX IF NOT EXISTS idx_kea_audit ON kea_audit (entitas, entitas_id, id DESC);

-- ---- Pengaman database ----
CREATE OR REPLACE FUNCTION fn_kea_nodelete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Catatan keamanan tidak boleh dihapus; gunakan pembatalan atau koreksi.'; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION fn_kea_audit_imm() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Catatan keamanan tidak boleh dihapus; riwayat audit tidak dapat diubah.'; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION fn_kea_santri_aktif() RETURNS trigger AS $$ DECLARE s RECORD; BEGIN
  SELECT status, diarsipkan INTO s FROM santri WHERE id = NEW.santri_id;
  IF s.status IS DISTINCT FROM 'aktif' OR s.diarsipkan THEN RAISE EXCEPTION 'Santri bukan santri aktif; catatan keamanan baru tidak dapat dibuat.'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION fn_kea_izin_upd() RETURNS trigger AS $$ BEGIN
  IF (NEW.id, NEW.nomor, NEW.jenis, NEW.santri_id, NEW.dibuat, NEW.oleh) IS DISTINCT FROM (OLD.id, OLD.nomor, OLD.jenis, OLD.santri_id, OLD.dibuat, OLD.oleh) THEN RAISE EXCEPTION 'Identitas izin tidak boleh diubah.'; END IF;
  IF NEW.status <> OLD.status AND NOT ((OLD.status = 'menunggu' AND NEW.status IN ('disetujui','ditolak','dibatalkan')) OR (OLD.status = 'disetujui' AND NEW.status IN ('sedang_izin','dibatalkan')) OR (OLD.status = 'sedang_izin' AND NEW.status = 'kembali')) THEN
    RAISE EXCEPTION 'Perubahan status izin tidak sesuai alur (% menjadi %).', OLD.status, NEW.status; END IF;
  RETURN NEW; END $$ LANGUAGE plpgsql;
DO $$ DECLARE t TEXT; BEGIN FOREACH t IN ARRAY ARRAY['kea_pelanggaran','kea_pembinaan','kea_izin','kea_kategori_pelanggaran','kea_jenis_pembinaan','kea_jenis_izin','kea_pengaturan'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS tg_%s_del ON %s; CREATE TRIGGER tg_%s_del BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION fn_kea_nodelete()', t, t, t, t); END LOOP;
  FOREACH t IN ARRAY ARRAY['kea_pelanggaran','kea_pembinaan','kea_izin'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS tg_%s_aktif ON %s; CREATE TRIGGER tg_%s_aktif BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION fn_kea_santri_aktif()', t, t, t, t); END LOOP; END $$;
DROP TRIGGER IF EXISTS tg_kea_izin_upd ON kea_izin; CREATE TRIGGER tg_kea_izin_upd BEFORE UPDATE ON kea_izin FOR EACH ROW EXECUTE FUNCTION fn_kea_izin_upd();
DROP TRIGGER IF EXISTS tg_kea_audit_imm ON kea_audit; CREATE TRIGGER tg_kea_audit_imm BEFORE UPDATE OR DELETE ON kea_audit FOR EACH ROW EXECUTE FUNCTION fn_kea_audit_imm();

DROP VIEW IF EXISTS v_santri_kea;
CREATE VIEW v_santri_kea AS   -- data santri MINIMUM untuk Keamanan: tanpa KK, keluarga, alamat, keuangan
  SELECT s.id, s.nis, s.nama, s.foto_berkas AS foto, CASE s.jenis_kelamin WHEN 'L' THEN 'putra' ELSE 'putri' END AS kelompok, s.status, s.diarsipkan,
         k.asrama_id, s.kamar_id, a.nama AS asrama, k.nama AS kamar
  FROM santri s LEFT JOIN kamar k ON k.id = s.kamar_id LEFT JOIN asrama a ON a.id = k.asrama_id;

-- ---- Hak role database: Keamanan = sima_keamanan. Bendahara (sima_keuangan) TIDAK diberi hak apa pun pada tabel kea_*. ----
GRANT SELECT ON v_santri_kea TO sima_keamanan;
GRANT SELECT, INSERT, UPDATE ON kea_pelanggaran, kea_pembinaan, kea_izin, kea_counter TO sima_keamanan;
GRANT SELECT ON kea_kategori_pelanggaran, kea_jenis_pembinaan, kea_jenis_izin, kea_pengaturan TO sima_keamanan;
GRANT SELECT, INSERT ON kea_audit TO sima_keamanan;
GRANT SELECT (id, username, nama) ON users TO sima_keamanan;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sima_keamanan;

-- =====================================================================
-- ============ TAHAP 5: MODUL PENDIDIKAN (Super Admin saja) ============
-- Tidak ada hak untuk sima_keuangan / sima_keamanan pada tabel edu_* (default: ditolak).
-- Tidak menyalin identitas santri/pengajar: seluruh relasi memakai santri.id dan pengajar.id.
-- =====================================================================
CREATE TABLE IF NOT EXISTS edu_pengaturan (kunci TEXT PRIMARY KEY, nilai JSONB NOT NULL, diubah BIGINT NOT NULL, oleh BIGINT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS edu_periode (id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL CHECK (char_length(nama) >= 2), mulai DATE, selesai DATE, aktif BOOLEAN NOT NULL DEFAULT TRUE, keterangan TEXT, dibuat BIGINT NOT NULL, CHECK (mulai IS NULL OR selesai IS NULL OR selesai >= mulai));
CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_periode ON edu_periode (lower(nama));
CREATE TABLE IF NOT EXISTS edu_jenis (id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL CHECK (char_length(nama) >= 2), deskripsi TEXT, keterangan TEXT, mode_nilai TEXT NOT NULL DEFAULT 'campuran' CHECK (mode_nilai IN ('angka','capaian','campuran')), aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_jenis ON edu_jenis (lower(nama));
CREATE TABLE IF NOT EXISTS edu_tingkat (id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL CHECK (char_length(nama) >= 1), jenis_id BIGINT REFERENCES edu_jenis(id), aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_tingkat ON edu_tingkat (lower(nama), COALESCE(jenis_id, 0));
CREATE TABLE IF NOT EXISTS edu_materi (id BIGSERIAL PRIMARY KEY, kode TEXT, nama TEXT NOT NULL CHECK (char_length(nama) >= 2), jenis_id BIGINT NOT NULL REFERENCES edu_jenis(id), kitab TEXT, jilid TEXT, tingkat TEXT, deskripsi TEXT, aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_materi_kode ON edu_materi (lower(kode)) WHERE kode IS NOT NULL;
CREATE TABLE IF NOT EXISTS edu_kelas (id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL CHECK (char_length(nama) >= 1), jenis_id BIGINT NOT NULL REFERENCES edu_jenis(id), tingkat TEXT, pengajar_id BIGINT REFERENCES pengajar(id), kapasitas INTEGER CHECK (kapasitas IS NULL OR kapasitas > 0), periode_id BIGINT REFERENCES edu_periode(id), aktif BOOLEAN NOT NULL DEFAULT TRUE, keterangan TEXT, dibuat BIGINT NOT NULL, diubah BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_kelas ON edu_kelas (lower(nama), jenis_id, COALESCE(periode_id, 0));
CREATE TABLE IF NOT EXISTS edu_status_presensi (id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL CHECK (char_length(nama) >= 2), dihitung_hadir BOOLEAN NOT NULL DEFAULT FALSE, aktif BOOLEAN NOT NULL DEFAULT TRUE, urutan INTEGER NOT NULL DEFAULT 0, dibuat BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_stp ON edu_status_presensi (lower(nama));
INSERT INTO edu_status_presensi (nama, dihitung_hadir, urutan, dibuat) SELECT * FROM (VALUES ('Hadir', TRUE, 1, 0::bigint), ('Izin', FALSE, 2, 0::bigint), ('Sakit', FALSE, 3, 0::bigint), ('Alpa', FALSE, 4, 0::bigint)) v(n, h, u, d) WHERE NOT EXISTS (SELECT 1 FROM edu_status_presensi);
CREATE TABLE IF NOT EXISTS edu_jenis_evaluasi (id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL CHECK (char_length(nama) >= 2), aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_jev ON edu_jenis_evaluasi (lower(nama));

CREATE TABLE IF NOT EXISTS edu_peserta (
  id BIGSERIAL PRIMARY KEY, kelas_id BIGINT NOT NULL REFERENCES edu_kelas(id), santri_id BIGINT NOT NULL REFERENCES santri(id),
  mulai DATE NOT NULL, selesai DATE, status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','pindah','keluar')), pindah_dari BIGINT REFERENCES edu_peserta(id), alasan TEXT,
  dibuat BIGINT NOT NULL, oleh BIGINT REFERENCES users(id), diubah BIGINT NOT NULL,
  CHECK ((status = 'aktif') = (selesai IS NULL)), CHECK (selesai IS NULL OR selesai >= mulai)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_peserta_aktif ON edu_peserta (kelas_id, santri_id) WHERE status = 'aktif';
CREATE INDEX IF NOT EXISTS idx_edu_peserta_santri ON edu_peserta (santri_id, id DESC);
CREATE TABLE IF NOT EXISTS edu_penugasan (
  id BIGSERIAL PRIMARY KEY, pengajar_id BIGINT NOT NULL REFERENCES pengajar(id), jenis_id BIGINT NOT NULL REFERENCES edu_jenis(id), materi_id BIGINT REFERENCES edu_materi(id), kelas_id BIGINT REFERENCES edu_kelas(id),
  periode_id BIGINT REFERENCES edu_periode(id), mulai DATE NOT NULL, selesai DATE, status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','selesai','dibatalkan')), keterangan TEXT, alasan_akhir TEXT,
  dibuat BIGINT NOT NULL, oleh BIGINT REFERENCES users(id), diubah BIGINT NOT NULL, CHECK (selesai IS NULL OR selesai >= mulai)
);
CREATE INDEX IF NOT EXISTS idx_edu_penugasan ON edu_penugasan (pengajar_id, id DESC);
CREATE TABLE IF NOT EXISTS edu_jadwal (
  id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL CHECK (char_length(nama) >= 2), jenis_id BIGINT NOT NULL REFERENCES edu_jenis(id), kelas_id BIGINT NOT NULL REFERENCES edu_kelas(id), pengajar_id BIGINT REFERENCES pengajar(id), materi_id BIGINT REFERENCES edu_materi(id),
  hari INTEGER NOT NULL CHECK (hari BETWEEN 1 AND 7), jam_mulai TIME NOT NULL, jam_selesai TIME NOT NULL, ruang TEXT, mulai DATE, sampai DATE, keterangan TEXT, izinkan_paralel BOOLEAN NOT NULL DEFAULT FALSE,
  aktif BOOLEAN NOT NULL DEFAULT TRUE, alasan_nonaktif TEXT, dibuat BIGINT NOT NULL, oleh BIGINT REFERENCES users(id), diubah BIGINT NOT NULL, CHECK (jam_selesai > jam_mulai), CHECK (mulai IS NULL OR sampai IS NULL OR sampai >= mulai)
);
CREATE TABLE IF NOT EXISTS edu_sesi (
  id BIGSERIAL PRIMARY KEY, tanggal DATE NOT NULL, kelas_id BIGINT NOT NULL REFERENCES edu_kelas(id), jadwal_id BIGINT REFERENCES edu_jadwal(id), jenis_id BIGINT NOT NULL REFERENCES edu_jenis(id), materi_id BIGINT REFERENCES edu_materi(id), pengajar_id BIGINT REFERENCES pengajar(id),
  nama TEXT NOT NULL, jam_mulai TIME, jam_selesai TIME, ruang TEXT, catatan TEXT, batal BOOLEAN NOT NULL DEFAULT FALSE, batal_alasan TEXT, dibuat BIGINT NOT NULL, oleh BIGINT REFERENCES users(id), diubah BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_sesi ON edu_sesi (kelas_id, tanggal, COALESCE(jadwal_id, 0), lower(nama)) WHERE NOT batal;
CREATE TABLE IF NOT EXISTS edu_presensi (
  id BIGSERIAL PRIMARY KEY, sesi_id BIGINT NOT NULL REFERENCES edu_sesi(id), santri_id BIGINT NOT NULL REFERENCES santri(id), status_id BIGINT NOT NULL REFERENCES edu_status_presensi(id), status TEXT NOT NULL, keterangan TEXT,
  dibuat BIGINT NOT NULL, oleh BIGINT REFERENCES users(id), diubah BIGINT NOT NULL, diubah_oleh BIGINT REFERENCES users(id), UNIQUE (sesi_id, santri_id)
);
CREATE INDEX IF NOT EXISTS idx_edu_presensi_santri ON edu_presensi (santri_id, id DESC);
CREATE TABLE IF NOT EXISTS edu_presensi_pengajar (
  id BIGSERIAL PRIMARY KEY, sesi_id BIGINT NOT NULL REFERENCES edu_sesi(id), pengajar_id BIGINT NOT NULL REFERENCES pengajar(id), status_id BIGINT NOT NULL REFERENCES edu_status_presensi(id), status TEXT NOT NULL, keterangan TEXT,
  dibuat BIGINT NOT NULL, oleh BIGINT REFERENCES users(id), diubah BIGINT NOT NULL, UNIQUE (sesi_id, pengajar_id)
);
CREATE TABLE IF NOT EXISTS edu_penilaian (
  id BIGSERIAL PRIMARY KEY, santri_id BIGINT NOT NULL REFERENCES santri(id), kelas_id BIGINT NOT NULL REFERENCES edu_kelas(id), jenis_id BIGINT NOT NULL REFERENCES edu_jenis(id), materi_id BIGINT REFERENCES edu_materi(id), periode_id BIGINT REFERENCES edu_periode(id),
  evaluasi_id BIGINT NOT NULL REFERENCES edu_jenis_evaluasi(id), evaluasi TEXT NOT NULL, tanggal DATE NOT NULL, nilai NUMERIC(8,2), capaian TEXT, catatan TEXT,
  batal BOOLEAN NOT NULL DEFAULT FALSE, batal_alasan TEXT, dibuat BIGINT NOT NULL, oleh BIGINT REFERENCES users(id), diubah BIGINT NOT NULL, diubah_oleh BIGINT REFERENCES users(id),
  CHECK (nilai IS NOT NULL OR capaian IS NOT NULL OR catatan IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_edu_nilai_santri ON edu_penilaian (santri_id, tanggal DESC);
CREATE TABLE IF NOT EXISTS edu_catatan (
  id BIGSERIAL PRIMARY KEY, santri_id BIGINT NOT NULL REFERENCES santri(id), kelas_id BIGINT REFERENCES edu_kelas(id), tanggal DATE NOT NULL, catatan TEXT NOT NULL CHECK (char_length(catatan) >= 3),
  batal BOOLEAN NOT NULL DEFAULT FALSE, batal_alasan TEXT, dibuat BIGINT NOT NULL, oleh BIGINT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS edu_audit (
  id BIGSERIAL PRIMARY KEY, waktu BIGINT NOT NULL, user_id BIGINT, username TEXT, entitas TEXT NOT NULL, entitas_id BIGINT, aksi TEXT NOT NULL, ket TEXT, alasan TEXT, sebelum JSONB, sesudah JSONB
);
CREATE INDEX IF NOT EXISTS idx_edu_audit ON edu_audit (entitas, entitas_id, id DESC);

DROP VIEW IF EXISTS v_santri_edu;
CREATE VIEW v_santri_edu AS   -- identitas minimal untuk Pendidikan: tanpa KK/keluarga/keuangan
  SELECT s.id, s.nis, s.nama, s.foto_berkas AS foto, CASE s.jenis_kelamin WHEN 'L' THEN 'putra' ELSE 'putri' END AS kelompok, s.status, s.diarsipkan,
         k.asrama_id, s.kamar_id, a.nama AS asrama, k.nama AS kamar
  FROM santri s LEFT JOIN kamar k ON k.id = s.kamar_id LEFT JOIN asrama a ON a.id = k.asrama_id;

-- ---- Pengaman: tidak ada penghapusan permanen; audit append-only; santri bukan aktif tidak bisa ditambahkan sebagai peserta ----
CREATE OR REPLACE FUNCTION fn_edu_nodelete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Data pendidikan tidak boleh dihapus; gunakan nonaktif atau pembatalan.'; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION fn_edu_audit_imm() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Data pendidikan tidak boleh dihapus; riwayat audit tidak dapat diubah.'; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION fn_edu_peserta_aktif() RETURNS trigger AS $$ DECLARE s RECORD; BEGIN
  SELECT status, diarsipkan INTO s FROM santri WHERE id = NEW.santri_id;
  IF s.status IS DISTINCT FROM 'aktif' OR s.diarsipkan THEN RAISE EXCEPTION 'Santri bukan santri aktif; tidak dapat didaftarkan sebagai peserta pendidikan.'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['edu_pengaturan','edu_periode','edu_jenis','edu_tingkat','edu_materi','edu_kelas','edu_status_presensi','edu_jenis_evaluasi','edu_peserta','edu_penugasan','edu_jadwal','edu_sesi','edu_presensi','edu_presensi_pengajar','edu_penilaian','edu_catatan'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_%s_nodel ON %I; CREATE TRIGGER tg_%s_nodel BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fn_edu_nodelete()', t, t, t, t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS tg_edu_audit_imm ON edu_audit; CREATE TRIGGER tg_edu_audit_imm BEFORE UPDATE OR DELETE ON edu_audit FOR EACH ROW EXECUTE FUNCTION fn_edu_audit_imm();
DROP TRIGGER IF EXISTS tg_edu_peserta_aktif ON edu_peserta; CREATE TRIGGER tg_edu_peserta_aktif BEFORE INSERT ON edu_peserta FOR EACH ROW EXECUTE FUNCTION fn_edu_peserta_aktif();

-- =====================================================================
-- TAHAP 6: Berita & Galeri (SIMA = satu-satunya sumber; website publik hanya membaca lewat view v_pub_*)
-- =====================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sima_publik') THEN CREATE ROLE sima_publik NOLOGIN; END IF;
END $$;
GRANT sima_publik TO CURRENT_USER;

CREATE TABLE IF NOT EXISTS cms_pengaturan (kunci TEXT PRIMARY KEY, nilai JSONB NOT NULL, diubah BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS cms_kategori (
  id SERIAL PRIMARY KEY, tipe TEXT NOT NULL CHECK (tipe IN ('berita','galeri')), nama TEXT NOT NULL, slug TEXT NOT NULL, deskripsi TEXT,
  kunci_halaman TEXT,                       -- galeri: kunci kegiatan pada halaman Ekstrakurikuler (silat, banjari, tulis, pidato, bisnis)
  aktif BOOLEAN NOT NULL DEFAULT TRUE, urutan INTEGER NOT NULL DEFAULT 0, dibuat BIGINT NOT NULL, diubah BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cms_kat_nama ON cms_kategori (tipe, lower(nama));
CREATE UNIQUE INDEX IF NOT EXISTS ux_cms_kat_slug ON cms_kategori (tipe, slug);
CREATE TABLE IF NOT EXISTS cms_media (
  id SERIAL PRIMARY KEY, mime TEXT NOT NULL, lebar INTEGER NOT NULL, tinggi INTEGER NOT NULL, ukuran INTEGER NOT NULL, nama_asli TEXT,
  sha256 TEXT NOT NULL UNIQUE, token TEXT NOT NULL, alt TEXT, isi BYTEA NOT NULL, thumb BYTEA NOT NULL, diunggah BIGINT NOT NULL, oleh INTEGER REFERENCES users(id));
CREATE TABLE IF NOT EXISTS cms_berita (
  id SERIAL PRIMARY KEY, judul TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, ringkasan TEXT, isi_html TEXT NOT NULL DEFAULT '',
  kategori_id INTEGER REFERENCES cms_kategori(id), media_utama_id INTEGER REFERENCES cms_media(id), penulis TEXT, tanggal_kegiatan DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','terjadwal','terbit','arsip')), terbit_pada BIGINT,
  unggulan BOOLEAN NOT NULL DEFAULT FALSE, urutan_unggulan INTEGER NOT NULL DEFAULT 0, seo_deskripsi TEXT, seo_kata_kunci TEXT, video_url TEXT,
  dibuat BIGINT NOT NULL, diubah BIGINT NOT NULL, oleh INTEGER REFERENCES users(id), dihapus BIGINT,
  CHECK (status NOT IN ('terjadwal','terbit') OR terbit_pada IS NOT NULL));
CREATE INDEX IF NOT EXISTS ix_cms_berita_status ON cms_berita (status, terbit_pada DESC);
CREATE TABLE IF NOT EXISTS cms_berita_slug (slug TEXT PRIMARY KEY, berita_id INTEGER NOT NULL REFERENCES cms_berita(id), utama BOOLEAN NOT NULL DEFAULT TRUE, dibuat BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS cms_galeri (
  id SERIAL PRIMARY KEY, jenis TEXT NOT NULL CHECK (jenis IN ('foto','video')), judul TEXT NOT NULL, slug TEXT, deskripsi TEXT, caption TEXT,
  kategori_id INTEGER REFERENCES cms_kategori(id), tanggal_kegiatan DATE, media_id INTEGER REFERENCES cms_media(id), video_url TEXT, video_penyedia TEXT, video_kode TEXT,
  thumb_media_id INTEGER REFERENCES cms_media(id), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','terbit','arsip')), urutan INTEGER NOT NULL DEFAULT 0,
  dibuat BIGINT NOT NULL, diubah BIGINT NOT NULL, oleh INTEGER REFERENCES users(id), dihapus BIGINT,
  CHECK ((jenis='foto' AND media_id IS NOT NULL) OR (jenis='video' AND video_kode IS NOT NULL)));
CREATE INDEX IF NOT EXISTS ix_cms_galeri ON cms_galeri (status, urutan, tanggal_kegiatan DESC);
CREATE TABLE IF NOT EXISTS cms_berita_galeri (berita_id INTEGER NOT NULL REFERENCES cms_berita(id), galeri_id INTEGER NOT NULL REFERENCES cms_galeri(id), urutan INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (berita_id, galeri_id));
CREATE TABLE IF NOT EXISTS cms_berita_media (berita_id INTEGER NOT NULL REFERENCES cms_berita(id), media_id INTEGER NOT NULL REFERENCES cms_media(id), PRIMARY KEY (berita_id, media_id));
CREATE TABLE IF NOT EXISTS cms_riwayat (
  id BIGSERIAL PRIMARY KEY, waktu BIGINT NOT NULL, user_id INTEGER, username TEXT, entitas TEXT NOT NULL, entitas_id INTEGER, aksi TEXT NOT NULL, ket TEXT, sebelum JSONB, sesudah JSONB);
CREATE INDEX IF NOT EXISTS ix_cms_riwayat ON cms_riwayat (entitas, entitas_id, id DESC);

-- ---- Pengaman: berita/galeri/kategori tidak dihapus permanen (arsip/dihapus-lunak); riwayat append-only; file media hanya boleh dihapus bila tidak dipakai ----
CREATE OR REPLACE FUNCTION fn_cms_nodelete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Data konten tidak boleh dihapus permanen; gunakan arsip atau hapus lunak.'; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION fn_cms_riwayat_imm() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Riwayat konten tidak dapat diubah atau dihapus.'; END $$ LANGUAGE plpgsql;
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['cms_berita','cms_galeri','cms_kategori','cms_berita_slug'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_%s_nodel ON %I; CREATE TRIGGER tg_%s_nodel BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fn_cms_nodelete()', t, t, t, t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS tg_cms_riwayat_imm ON cms_riwayat; CREATE TRIGGER tg_cms_riwayat_imm BEFORE UPDATE OR DELETE ON cms_riwayat FOR EACH ROW EXECUTE FUNCTION fn_cms_riwayat_imm();

-- ---- Tampilan publik: HANYA konten yang boleh tayang. API publik membaca lewat role sima_publik yang hanya punya SELECT pada view ini ----
CREATE OR REPLACE VIEW v_pub_berita AS
  SELECT b.id, b.slug, b.judul, b.ringkasan, b.isi_html, k.nama AS kategori, k.slug AS kategori_slug, b.media_utama_id, b.penulis, b.tanggal_kegiatan, b.terbit_pada,
         b.unggulan, b.urutan_unggulan, b.seo_deskripsi, b.seo_kata_kunci, b.video_url, b.diubah
  FROM cms_berita b LEFT JOIN cms_kategori k ON k.id = b.kategori_id
  WHERE b.dihapus IS NULL AND b.status IN ('terbit','terjadwal') AND b.terbit_pada <= (extract(epoch FROM now()) * 1000)::bigint;
CREATE OR REPLACE VIEW v_pub_galeri AS
  SELECT g.id, g.jenis, g.judul, g.deskripsi, g.caption, k.nama AS kategori, k.slug AS kategori_slug, k.kunci_halaman, g.tanggal_kegiatan, g.media_id, g.video_url, g.video_penyedia, g.video_kode, g.thumb_media_id, g.urutan, g.dibuat, g.diubah
  FROM cms_galeri g LEFT JOIN cms_kategori k ON k.id = g.kategori_id WHERE g.dihapus IS NULL AND g.status = 'terbit';
CREATE OR REPLACE VIEW v_pub_berita_galeri AS
  SELECT bg.berita_id, bg.urutan AS urutan_berita, g.id, g.jenis, g.judul, g.caption, g.media_id, g.video_url, g.video_penyedia, g.video_kode, g.thumb_media_id
  FROM cms_berita_galeri bg JOIN cms_galeri g ON g.id = bg.galeri_id
  WHERE g.dihapus IS NULL AND g.status <> 'arsip' AND bg.berita_id IN (SELECT id FROM v_pub_berita);
CREATE OR REPLACE VIEW v_pub_media AS
  SELECT m.id, m.token, m.mime, m.lebar, m.tinggi, m.alt, m.isi, m.thumb FROM cms_media m WHERE
    m.id IN (SELECT media_utama_id FROM v_pub_berita WHERE media_utama_id IS NOT NULL)
    OR m.id IN (SELECT media_id FROM cms_berita_media WHERE berita_id IN (SELECT id FROM v_pub_berita))
    OR m.id IN (SELECT media_id FROM v_pub_berita_galeri WHERE media_id IS NOT NULL)
    OR m.id IN (SELECT thumb_media_id FROM v_pub_berita_galeri WHERE thumb_media_id IS NOT NULL)
    OR m.id IN (SELECT media_id FROM v_pub_galeri WHERE media_id IS NOT NULL)
    OR m.id IN (SELECT thumb_media_id FROM v_pub_galeri WHERE thumb_media_id IS NOT NULL);
CREATE OR REPLACE VIEW v_pub_slug AS
  SELECT s.slug, s.utama, b.slug AS slug_utama FROM cms_berita_slug s JOIN cms_berita b ON b.id = s.berita_id
  WHERE b.dihapus IS NULL AND b.status IN ('terbit','terjadwal') AND b.terbit_pada <= (extract(epoch FROM now()) * 1000)::bigint;
CREATE OR REPLACE VIEW v_pub_kategori AS
  SELECT tipe, nama, slug, deskripsi, kunci_halaman, urutan FROM cms_kategori WHERE aktif;
CREATE OR REPLACE VIEW v_pub_pengaturan AS SELECT kunci, nilai FROM cms_pengaturan WHERE kunci IN ('beranda','tampilan');
GRANT SELECT ON v_pub_berita, v_pub_galeri, v_pub_berita_galeri, v_pub_media, v_pub_slug, v_pub_kategori, v_pub_pengaturan TO sima_publik;
-- Bendahara (sima_keuangan) dan Keamanan (sima_keamanan) TIDAK diberi hak apa pun pada cms_* maupun v_pub_*.

-- =====================================================================
-- TAHAP 7: finalisasi. Idempotent. Tidak ada data contoh.
-- =====================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS wajib_ganti BOOLEAN NOT NULL DEFAULT FALSE;   -- password sementara: wajib diganti saat login berikutnya
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_diubah BIGINT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS role TEXT;                              -- role pelaku saat aktivitas dicatat
CREATE INDEX IF NOT EXISTS idx_log_user ON activity_log (user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_log_modul ON activity_log (modul, id DESC);
CREATE INDEX IF NOT EXISTS idx_log_aksi ON activity_log (aksi, id DESC);

-- Pengaturan sistem terpusat (identitas pondok, sesi, backup). Hanya Super Admin; tidak ada grant untuk role lain.
CREATE TABLE IF NOT EXISTS sys_pengaturan (kunci TEXT PRIMARY KEY, nilai JSONB NOT NULL, diubah BIGINT NOT NULL, oleh BIGINT);

-- Riwayat & isi backup. Disimpan di DB (tanpa grant ke role mana pun selain pemilik aplikasi) dan HANYA dapat diunduh lewat API Super Admin.
-- Satu "paket" = backup database + backup berkas yang dibuat bersamaan. Isi dibersihkan (NULL) saat melewati retensi; baris riwayat tetap ada.
CREATE TABLE IF NOT EXISTS sys_backup (
  id          BIGSERIAL PRIMARY KEY,
  paket       BIGINT NOT NULL,
  jenis       TEXT NOT NULL CHECK (jenis IN ('database','berkas')),
  pemicu      TEXT NOT NULL CHECK (pemicu IN ('manual','terjadwal','sebelum_pemulihan','skrip')),
  mulai       BIGINT NOT NULL,
  selesai     BIGINT,
  oleh        BIGINT,
  status      TEXT NOT NULL DEFAULT 'berjalan' CHECK (status IN ('berjalan','terverifikasi','gagal')),
  ukuran      BIGINT,
  sha256      TEXT,
  tabel       INTEGER,
  baris       BIGINT,
  manifest    JSONB,
  ket         TEXT,
  isi         BYTEA,
  dibersihkan BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sys_backup_paket ON sys_backup (paket DESC, jenis);

-- ===== Tahap 8: impor / migrasi data =====
CREATE TABLE IF NOT EXISTS sys_impor (
  id BIGSERIAL PRIMARY KEY, jenis TEXT NOT NULL, berkas_nama TEXT, ukuran INTEGER, sha256 TEXT,
  dibuat BIGINT NOT NULL, oleh BIGINT REFERENCES users(id), oleh_username TEXT,
  status TEXT NOT NULL DEFAULT 'pratinjau' CHECK (status IN ('pratinjau','selesai','dibatalkan','gagal')),
  total INTEGER NOT NULL DEFAULT 0, valid INTEGER NOT NULL DEFAULT 0, peringatan INTEGER NOT NULL DEFAULT 0, gagal INTEGER NOT NULL DEFAULT 0, duplikat INTEGER NOT NULL DEFAULT 0,
  masalah JSONB, payload JSONB, diimpor INTEGER, ids JSONB, selesai BIGINT, ket TEXT
);
CREATE INDEX IF NOT EXISTS idx_sys_impor_dibuat ON sys_impor (dibuat DESC);
