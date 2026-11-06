'use strict';
// Pembantu validasi, paginasi, berkas, dan pemetaan galat database. Tanpa dependensi.
const crypto = require('crypto');

const MAX_BERKAS = 2 * 1024 * 1024 + 512 * 1024;   // 2,5 MB
const str = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const strOrNull = (v, max) => str(v, max) || null;
// teks panjang: pertahankan baris baru
const text = (v, max) => (typeof v === 'string' ? v.trim().replace(/\r\n/g, '\n').slice(0, max) : '');
const textOrNull = (v, max) => text(v, max) || null;

function isDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === v && +v.slice(0, 4) >= 1900;
}
const todayStr = () => new Date(Date.now() + 14 * 3600 * 1000).toISOString().slice(0, 10);   // batas atas longgar untuk zona waktu
const year = v => +String(v).slice(0, 4);

// Spesifikasi kolom -> pemeriksa. Mengembalikan {e, out}; hanya kunci yang ada di body yang diproses (untuk PATCH).
// spec: { kolom: [tipe, label, opsi] }
function readFields(body, spec, { partial }) {
  const e = {}, out = {};
  for (const [k, [type, label, o = {}]] of Object.entries(spec)) {
    if (partial && !(k in body)) continue;
    const raw = body[k];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim());
    if (empty) { if (o.required) e[k] = label + ' wajib diisi.'; out[k] = null; continue; }
    if (type === 'str' || type === 'text') {
      if (typeof raw !== 'string') { e[k] = label + ' tidak valid.'; continue; }
      const v = type === 'str' ? str(raw, 5000) : text(raw, 5000);
      if (o.min && v.length < o.min) { e[k] = label + ` minimal ${o.min} karakter.`; continue; }
      if (v.length > (o.max || 200)) { e[k] = label + ` maksimal ${o.max || 200} karakter.`; continue; }
      if (o.re && !o.re.test(v)) { e[k] = o.msg || label + ' tidak valid.'; continue; }
      out[k] = v;
    } else if (type === 'enum') {
      if (!o.values.includes(raw)) { e[k] = label + ' tidak valid.'; continue; }
      out[k] = raw;
    } else if (type === 'date') {
      if (!isDate(raw)) { e[k] = label + ' harus berupa tanggal valid (YYYY-MM-DD).'; continue; }
      if (o.notFuture && raw > todayStr()) { e[k] = label + ' tidak boleh di masa depan.'; continue; }
      out[k] = raw;
    } else if (type === 'int') {
      const n = typeof raw === 'number' ? raw : /^-?\d{1,9}$/.test(String(raw).trim()) ? parseInt(raw, 10) : NaN;
      if (!Number.isInteger(n) || n < (o.min ?? -Infinity) || n > (o.max ?? Infinity)) { e[k] = label + (o.min !== undefined ? ` harus angka ${o.min}–${o.max}.` : ' harus berupa angka.'); continue; }
      out[k] = n;
    } else if (type === 'bool') {
      out[k] = raw === true || raw === 'true' || raw === 1 || raw === '1';
    }
  }
  return { e, out };
}

function pageOf(q) {
  const size = [10, 25, 50, 100].includes(+q.size) ? +q.size : 25;
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  return { page, size, offset: (page - 1) * size };
}
// Pembangun klausa WHERE berparameter (tidak pernah menyambung input ke SQL).
function where() {
  const c = [], p = [];
  return { add(sql, v) { if (v === undefined) c.push(sql); else { p.push(v); c.push(sql.replace(/\?/g, '$' + p.length)); } }, push(v) { p.push(v); return '$' + p.length; },
    get sql() { return c.length ? 'WHERE ' + c.join(' AND ') : ''; }, params() { return p.slice(); } };
}
const orderBy = (q, map, def) => {
  const col = map[q.urut] || map[def];
  return `${col} ${q.arah === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
};
const likeEsc = s => s.replace(/[\\%_]/g, m => '\\' + m);

// ---- Berkas: validasi isi file berdasarkan tanda tangan byte, bukan nama/ekstensi/MIME kiriman ----
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.length > 5 && buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}
function readUpload(b, { pdf }) {
  if (!b || typeof b.data !== 'string' || !b.data) return { error: 'Berkas belum dipilih.' };
  const m = /^data:[^;,]*;base64,/.exec(b.data);
  const raw = m ? b.data.slice(m[0].length) : b.data;
  if (raw.length > Math.ceil(MAX_BERKAS / 3) * 4 + 8) return { error: 'Ukuran berkas melebihi 2,5 MB.' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return { error: 'Isi berkas tidak valid.' };
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) return { error: 'Berkas kosong.' };
  if (buf.length > MAX_BERKAS) return { error: 'Ukuran berkas melebihi 2,5 MB.' };
  const mime = sniff(buf);
  if (!mime || (mime === 'application/pdf' && !pdf)) return { error: pdf ? 'Format berkas harus JPG, JPEG, PNG, atau PDF.' : 'Format foto harus JPG, JPEG, atau PNG.' };
  const nama = String(b.nama || '').replace(/[\\/\u0000-\u001f"<>:*?|]/g, '').slice(-100) || 'berkas';
  return { buf, mime, ukuran: buf.length, nama, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

// Pesan RAISE EXCEPTION dari trigger kita -> 409 (aturan bisnis), bukan 500.
const BUSINESS = /^(Penempatan ditolak|Kapasitas baru|Asrama kamar|Kamar masih|Data santri tidak boleh|Nominal tagihan|Tagihan sudah|Tagihan yang|Identitas tagihan|Pembayaran melebihi|Pembayaran hanya|Pembayaran tidak sesuai|Sisa tagihan|Saldo tabungan|Transaksi keuangan|Pembalikan tidak|Santri bukan santri aktif|Perubahan status izin|Identitas izin|Catatan keamanan|Data keamanan|Santri bukan santri aktif; tidak dapat didaftarkan|Data pendidikan)/;
const isBusinessErr = e => !!(e && BUSINESS.test(String(e.message)));
const isUnique = e => !!(e && (e.code === '23505' || /unique|duplicate/i.test(String(e.message))));
const isFk = e => !!(e && (e.code === '23503' || /foreign key/i.test(String(e.message))));
const pad = (n, w = 4) => String(n).padStart(w, '0');

module.exports = { MAX_BERKAS, str, strOrNull, text, textOrNull, isDate, todayStr, year, readFields, pageOf, where, orderBy, likeEsc, sniff, readUpload, isBusinessErr, isUnique, isFk, pad };
