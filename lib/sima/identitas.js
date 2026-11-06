'use strict';
// Identitas pondok untuk kop laporan: sys_pengaturan.identitas → kea_pengaturan.identitas (lama) → bawaan.
const DEF = { nama: 'Pondok Pesantren Alhidayah Induk', alamat: '', kontak: '', catatan: '' };
async function identitas(q) {
  for (const [tb, k] of [['sys_pengaturan', 'identitas'], ['kea_pengaturan', 'identitas']]) {
    try { const r = (await q(`SELECT nilai FROM ${tb} WHERE kunci=$1`, [k]))[0]; if (r) { const v = typeof r.nilai === 'string' ? JSON.parse(r.nilai) : r.nilai; if (v && v.nama) return Object.assign({}, DEF, v); } } catch (e) { /* tabel belum ada */ }
  }
  return Object.assign({}, DEF);
}
const kop = i => ({ pondok: i.nama, alamat: [i.alamat, i.kontak].filter(Boolean).join(' · '), catatan: i.catatan || '' });
module.exports = { identitas, kop, DEF };
