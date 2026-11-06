'use strict';
// Satu-satunya sumber kebenaran hak akses. Dipakai server (API) dan dikirim ke UI untuk menyusun menu.
const ROLES = ['super_admin', 'bendahara', 'keamanan'];
const ROLE_LABEL = { super_admin: 'Super Admin', bendahara: 'Bendahara', keamanan: 'Keamanan' };

// modul -> role yang boleh membuka modul tersebut
const MODULE_ACCESS = {
  dashboard: ['super_admin', 'bendahara', 'keamanan'],
  santri: ['super_admin', 'bendahara', 'keamanan'],      // bendahara/keamanan: hanya baca, kolom dipangkas
  santri_kelola: ['super_admin'],                        // tulis data santri, penempatan, dokumen (bukan menu)
  alumni: ['super_admin'],
  pengurus: ['super_admin'],
  pengajar: ['super_admin'],
  asrama: ['super_admin'],
  bendahara: ['super_admin', 'bendahara'],
  keamanan: ['super_admin', 'keamanan'],
  pendidikan: ['super_admin'],
  berita: ['super_admin'],
  laporan: ['super_admin', 'bendahara', 'keamanan'],      // isi laporan nanti dibatasi per role
  pengguna: ['super_admin'],
  pengaturan: ['super_admin'],
  impor: ['super_admin'],
  log: ['super_admin']
};

// Modul yang BELUM dikerjakan (Tahap 2+). Tidak boleh tampil seolah-olah berfungsi.
const READY = new Set(['dashboard', 'santri', 'alumni', 'pengurus', 'pengajar', 'asrama', 'pengguna', 'log', 'bendahara', 'keamanan', 'pendidikan', 'berita', 'laporan', 'pengaturan', 'impor']);

const MENU = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home', route: '#/dashboard' },
  { id: 'santri', label: 'Data Santri', icon: 'users', children: [
    { label: 'Santri Putra', route: '#/santri/putra' }, { label: 'Santri Putri', route: '#/santri/putri' }] },
  { id: 'alumni', label: 'Data Alumni', icon: 'cap', children: [
    { label: 'Semua Alumni', route: '#/alumni/semua' }, { label: 'Alumni Putra', route: '#/alumni/putra' }, { label: 'Alumni Putri', route: '#/alumni/putri' }, { label: 'Statistik Alumni', route: '#/alumni/statistik' }] },
  { id: 'pengurus', label: 'Data Pengurus', icon: 'badge', children: [
    { label: 'Pengurus Putra', route: '#/pengurus/putra' }, { label: 'Pengurus Putri', route: '#/pengurus/putri' }] },
  { id: 'pengajar', label: 'Data Pengajar', icon: 'book', route: '#/pengajar' },
  { id: 'asrama', label: 'Asrama dan Kamar', icon: 'bed', children: [
    { label: 'Asrama Putra', route: '#/asrama/putra' }, { label: 'Asrama Putri', route: '#/asrama/putri' }] },
  { id: 'bendahara', label: 'Keuangan', icon: 'wallet', children: [
    { label: 'Dashboard Keuangan', route: '#/bendahara/dashboard' }, { label: 'Tagihan', route: '#/bendahara/tagihan' }, { label: 'Pembayaran', route: '#/bendahara/pembayaran' },
    { label: 'Tunggakan', route: '#/bendahara/tunggakan' }, { label: 'Tabungan Santri', route: '#/bendahara/tabungan' }, { label: 'Kas Pondok', route: '#/bendahara/kas' },
    { label: 'Laporan Keuangan', route: '#/bendahara/laporan' }, { label: 'Kategori dan Pengaturan', route: '#/bendahara/pengaturan' }, { label: 'Audit Transaksi', route: '#/bendahara/audit', only: 'super_admin' }] },
  { id: 'keamanan', label: 'Keamanan', icon: 'shield', children: [
    { label: 'Dashboard Keamanan', route: '#/keamanan/dashboard' }, { label: 'Data Pelanggaran', route: '#/keamanan/pelanggaran' }, { label: 'Data Pembinaan', route: '#/keamanan/pembinaan' },
    { label: 'Perizinan Keluar Pondok', route: '#/keamanan/izin-keluar' }, { label: 'Perizinan Pulang', route: '#/keamanan/izin-pulang' }, { label: 'Monitoring Belum Kembali', route: '#/keamanan/monitoring' },
    { label: 'Profil Keamanan Santri', route: '#/keamanan/santri' }, { label: 'Laporan Keamanan', route: '#/keamanan/laporan' }, { label: 'Pengaturan Keamanan', route: '#/keamanan/pengaturan', only: 'super_admin' }] },
  { id: 'pendidikan', label: 'Pendidikan', icon: 'cap', children: [
    { label: 'Dashboard Pendidikan', route: '#/pendidikan/dashboard' }, { label: 'Jenis Pendidikan', route: '#/pendidikan/jenis' }, { label: 'Mata Pelajaran/Materi', route: '#/pendidikan/materi' }, { label: 'Kelas dan Kelompok Belajar', route: '#/pendidikan/kelas' },
    { label: 'Peserta Didik', route: '#/pendidikan/peserta' }, { label: 'Penugasan Pengajar', route: '#/pendidikan/penugasan' }, { label: 'Jadwal Pendidikan', route: '#/pendidikan/jadwal' }, { label: 'Presensi Santri', route: '#/pendidikan/presensi' },
    { label: 'Presensi Pengajar', route: '#/pendidikan/presensi-pengajar' }, { label: 'Penilaian dan Evaluasi', route: '#/pendidikan/penilaian' }, { label: 'Riwayat Pendidikan Santri', route: '#/pendidikan/riwayat' }, { label: 'Laporan Pendidikan', route: '#/pendidikan/laporan' }, { label: 'Pengaturan Pendidikan', route: '#/pendidikan/pengaturan' }] },
  { id: 'berita', label: 'Berita dan Galeri', icon: 'image', children: [
    { label: 'Dashboard Konten', route: '#/berita/dashboard' },
    { label: 'Semua Berita', route: '#/berita/semua', grup: 'Manajemen Berita' }, { label: 'Tambah Berita', route: '#/berita/tambah', grup: 'Manajemen Berita' }, { label: 'Kategori Berita', route: '#/berita/kategori', grup: 'Manajemen Berita' }, { label: 'Berita Unggulan', route: '#/berita/unggulan', grup: 'Manajemen Berita' },
    { label: 'Semua Dokumentasi', route: '#/berita/galeri', grup: 'Manajemen Galeri' }, { label: 'Upload Foto', route: '#/berita/upload', grup: 'Manajemen Galeri' }, { label: 'Manajemen Video', route: '#/berita/video', grup: 'Manajemen Galeri' }, { label: 'Kategori Galeri', route: '#/berita/kategori-galeri', grup: 'Manajemen Galeri' },
    { label: 'Media Library', route: '#/berita/media' }, { label: 'Statistik Konten', route: '#/berita/statistik' }] },
  { id: 'laporan', label: 'Laporan', icon: 'chart', route: '#/laporan' },
  { id: 'impor', label: 'Impor Data', icon: 'list', route: '#/impor' },
  { id: 'pengguna', label: 'Manajemen Pengguna', icon: 'key', route: '#/pengguna' },
  { id: 'log', label: 'Aktivitas Sistem', icon: 'list', route: '#/log' },
  { id: 'pengaturan', label: 'Pengaturan', icon: 'gear', route: '#/pengaturan' }
];

function can(role, modul) { return !!(MODULE_ACCESS[modul] && MODULE_ACCESS[modul].includes(role)); }
function menuFor(role) {
  return MENU.filter(m => can(role, m.id)).map(m => Object.assign({}, m, { tersedia: READY.has(m.id) }, m.children ? { children: m.children.filter(c => !c.only || c.only === role) } : {}));
}
module.exports = { ROLES, ROLE_LABEL, MODULE_ACCESS, READY, can, menuFor };
