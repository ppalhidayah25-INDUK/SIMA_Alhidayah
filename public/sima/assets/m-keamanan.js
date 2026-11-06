/* SIMA - Modul Keamanan: dashboard, pelanggaran, pembinaan, perizinan keluar/pulang, monitoring belum kembali, profil keamanan santri, laporan, pengaturan.
   Semua angka dan daftar berasal dari API (database). Tidak ada kategori, aturan, denda, atau data contoh di berkas ini. */
(function () {
  'use strict';
  var X = window.SIMA, h = X.h, api = X.api, toast = X.toast, empty = X.empty, btn = X.btn, fmtDate = X.fmtDate, qs = X.qs, pill = X.pill;
  var R = '#/keamanan/', BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function fail(e) { toast(e.message, true); }
  function isSA() { return X.S.user && X.S.user.role === 'super_admin'; }
  var ST_PLG = { baru: ['Baru dicatat', 'info'], proses: ['Dalam proses tindak lanjut', 'info'], selesai: ['Selesai ditindaklanjuti', 'ok'] };
  var ST_PMB = { berjalan: ['Berjalan', 'info'], selesai: ['Selesai', 'ok'], dibatalkan: ['Dibatalkan', 'off'] };
  var ST_IZ = { menunggu: ['Menunggu persetujuan', 'info'], disetujui: ['Disetujui', 'ok'], ditolak: ['Ditolak', 'off'], berlangsung: ['Sedang izin', 'ok'], mendekat: ['Jadwal kembali mendekat', 'info'], terlambat: ['Terlambat kembali', 'off'], kembali: ['Sudah kembali', 'ok'], dibatalkan: ['Dibatalkan', 'off'] };
  var TINDAK = { belum: 'Belum ditindak', dihubungi: 'Sudah dihubungi', dalam_proses: 'Dalam proses', selesai: 'Selesai' };
  function sp(map, k) { var x = map[k] || [k, 'off']; return pill(x[0], x[1]); }
  function wib(v, o) { if (!v) return ''; var d = new Date(v); if (isNaN(d)) return ''; return d.toLocaleString('id-ID', Object.assign({ timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }, o || {})).replace(/\./g, ':') + ' WIB'; }
  function wibInput(ms) { var p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms == null ? Date.now() : ms)); return p.replace(' ', 'T'); }
  function toInput(v) { return v ? wibInput(new Date(v).getTime()) : ''; }
  function lama(m) { if (m == null) return ''; m = Math.max(0, Math.round(m)); return m < 60 ? m + ' menit' : Math.floor(m / 60) + ' jam ' + (m % 60) + ' menit'; }
  function token() { return 'k' + Date.now().toString(36); }
  function jk(k) { return k === 'putra' ? 'Putra' : k === 'putri' ? 'Putri' : ''; }

  // ---------- bangunan form ----------
  function field(label, el, help, full) { return h('div', { class: 'field' + (full ? ' field--full' : '') }, h('label', { text: label }), el, help ? h('small', { class: 'muted', text: help }) : null, h('span', { class: 'err', role: 'alert' })); }
  function selectEl(options, blank) { var s = h('select', null, blank != null ? h('option', { value: '', text: blank }) : null); options.forEach(function (o) { s.appendChild(h('option', { value: o.v, text: o.l })); }); return s; }
  function control(d) {
    var i, v = d.val == null ? '' : d.val;
    if (d.type === 'area') i = h('textarea', { rows: '3', maxlength: String(d.max || 1000) });
    else if (d.type === 'select') i = selectEl(d.options || [], d.blank == null ? '— Pilih —' : d.blank);
    else i = h('input', { type: d.type === 'datetime' ? 'datetime-local' : d.type || 'text', maxlength: d.type === 'text' || !d.type ? String(d.max || 150) : null, autocomplete: 'off', placeholder: d.ph || null, max: d.type === 'date' && d.past ? X.today() : null });
    i.value = v; return i;
  }
  // formulir modal generik: defs -> POST/PATCH; menampilkan galat per kolom dari server
  function formModal(title, defs, o) {
    var note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' }), els = {}, grid = h('div', { class: 'fs__grid' }), extra = (o.before || []);
    defs.forEach(function (d) { var c = control(d); els[d.k] = { c: c, w: field(d.label + (d.req ? ' *' : ''), c, d.help, d.full || d.type === 'area') }; });
    var half = defs.filter(function (d) { return !(d.full || d.type === 'area'); }), full = defs.filter(function (d) { return d.full || d.type === 'area'; });
    half.forEach(function (d) { grid.appendChild(els[d.k].w); });
    var body = [note].concat(extra, [grid], full.map(function (d) { return els[d.k].w; }), o.after || []);
    function vals() { var r = {}; defs.forEach(function (d) { r[d.k] = els[d.k].c.value.trim ? els[d.k].c.value.trim() : els[d.k].c.value; }); return r; }
    function showErr(e) { Object.keys(els).forEach(function (k) { els[k].w.classList.remove('bad'); els[k].w.querySelector('.err').textContent = ''; }); var f = e.fields || {}, any = false; Object.keys(f).forEach(function (k) { if (els[k]) { els[k].w.classList.add('bad'); els[k].w.querySelector('.err').textContent = f[k]; any = true; } }); note.hidden = false; note.textContent = any ? 'Periksa isian yang ditandai.' : e.message; }
    X.modal(title, body, function (close) {
      return [btn('Batal', close, { ghost: true }), btn(o.label || 'Simpan', function (ev) {
        var go = function () { ev.target.disabled = true; note.hidden = true; Promise.resolve(o.submit(vals())).then(function (r) { close(); toast(o.ok || 'Tersimpan.'); if (o.done) o.done(r); }).catch(function (e) { ev.target.disabled = false; showErr(e); }); };
        if (o.confirm) X.confirmDialog(o.confirm).then(function (c) { if (c) go(); }); else go();
      })];
    }, { sticky: true, wide: !!o.wide });
    return els;
  }
  function santriPicker(onPick) {
    var inp = h('input', { type: 'search', placeholder: 'Cari NIS atau nama santri aktif…', maxlength: '60', 'aria-label': 'Cari santri' }), list = h('ul', { class: 'pick', role: 'listbox' }), shown = h('div', { class: 'picked', hidden: true }), chosen = null, timer;
    function search() { api('GET', '/keamanan/cari-santri' + qs({ q: inp.value.trim() })).then(function (d) { list.innerHTML = ''; if (!d.rows.length) list.appendChild(h('li', { class: 'muted', text: 'Santri aktif tidak ditemukan.' })); d.rows.forEach(function (s) { list.appendChild(h('li', { role: 'option', tabindex: '0', onclick: function () { pick(s); }, onkeydown: function (e) { if (e.key === 'Enter') pick(s); } }, h('b', { text: s.nama }), h('span', { text: [s.nis || 'NIS belum diisi', jk(s.kelompok), s.asrama, s.kamar].filter(Boolean).join(' · ') }))); }); }).catch(fail); }
    function pick(s) { chosen = s; list.innerHTML = ''; inp.value = ''; shown.hidden = false; shown.innerHTML = ''; shown.appendChild(h('span', null, h('b', { text: s.nama }), ' ' + (s.nis || 'NIS belum diisi') + ' · ' + [jk(s.kelompok), s.asrama, s.kamar].filter(Boolean).join(' · '))); shown.appendChild(btn('Ganti', function () { chosen = null; shown.hidden = true; inp.hidden = false; inp.focus(); }, { ghost: true, sm: true })); inp.hidden = true; if (onPick) onPick(s); }
    inp.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(search, 250); }); inp.addEventListener('focus', function () { if (!list.children.length && !chosen) search(); });
    var w = field('Santri *', h('div', { class: 'picker' }, inp, shown, list), 'Hanya santri aktif. Alumni tidak dapat dicatat.', true);
    return { el: w, get: function () { return chosen; }, err: function (m) { w.classList.add('bad'); w.querySelector('.err').textContent = m; } };
  }

  // ---------- kerangka halaman ----------
  var NAV = [['dashboard', 'Dashboard'], ['pelanggaran', 'Pelanggaran'], ['pembinaan', 'Pembinaan'], ['izin-keluar', 'Izin Keluar'], ['izin-pulang', 'Izin Pulang'], ['monitoring', 'Belum Kembali'], ['santri', 'Profil Santri'], ['laporan', 'Laporan'], ['pengaturan', 'Pengaturan']];
  function nav(active) { return h('nav', { class: 'tabs tabs--wrap', 'aria-label': 'Menu keamanan' }, NAV.filter(function (n) { return n[0] !== 'pengaturan' || isSA(); }).map(function (n) { return h('a', { class: 'tab' + (n[0] === active ? ' is-on' : ''), href: R + n[0], text: n[1] }); })); }
  function page(active, title, sub, actions) { var body = h('div', { class: 'stack-s' }); return { el: h('div', { class: 'stack-g' }, X.head(title, sub, actions), h('section', { class: 'panel stack-s' }, nav(active), body)), body: body }; }
  function errBox(box, e) { box.innerHTML = ''; box.appendChild(X.errNote(e)); }
  function printNode() { document.body.classList.add('printing'); var done = function () { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); setTimeout(function () { window.print(); if (!/Firefox/.test(navigator.userAgent)) setTimeout(done, 400); }, 50); }
  var REF = null;
  function loadRef(force) { return REF && !force ? Promise.resolve(REF) : api('GET', '/keamanan/ref').then(function (d) { REF = d; return d; }); }
  function opts(rows) { return rows.map(function (r) { return { v: r.id, l: r.nama }; }); }
  function kv(pairs) { return h('dl', { class: 'receipt__dl' }, pairs.reduce(function (a, p) { if (p[1] == null || p[1] === '') p[1] = 'Belum diisi'; a.push(h('dt', { text: p[0] }), h('dd', { text: String(p[1]) })); return a; }, [])); }
  function auditList(rows) {
    if (!rows || !rows.length) return h('p', { class: 'muted', text: 'Belum ada riwayat perubahan.' });
    return h('ul', { class: 'feed' }, rows.map(function (a) { var ch = a.sebelum || a.sesudah ? ' (' + Object.keys(a.sesudah || a.sebelum || {}).map(function (k) { return k + ': ' + (a.sebelum && a.sebelum[k] != null ? a.sebelum[k] : '—') + ' → ' + (a.sesudah && a.sesudah[k] != null ? a.sesudah[k] : '—'); }).join('; ') + ')' : ''; return h('li', null, h('time', { text: wib(Number(a.waktu)) }), h('span', null, h('b', { text: a.username + ' ' }), a.ket + ch + (a.alasan ? ' — alasan: ' + a.alasan : ''))); }));
  }
  function filterBar(ref, st, onChange, o) {
    o = o || {}; var d1 = h('input', { type: 'date', 'aria-label': 'Dari tanggal', value: st.dari || '' }), d2 = h('input', { type: 'date', 'aria-label': 'Sampai tanggal', value: st.sampai || '' }), kel = selectEl([{ v: 'putra', l: 'Putra' }, { v: 'putri', l: 'Putri' }], 'Jenis kelamin: semua'), asr = selectEl(opts(ref.asrama), 'Asrama: semua');
    kel.value = st.kelompok || ''; asr.value = st.asrama_id || ''; var els = [h('span', { class: 'tools tools--start' }, d1, h('span', { text: 's.d.' }), d2), kel, asr];
    function sync() { st.dari = d1.value; st.sampai = d2.value; st.kelompok = kel.value; st.asrama_id = asr.value; if ((st.dari && !st.sampai) || (!st.dari && st.sampai)) return; onChange(); }
    [d1, d2, kel, asr].forEach(function (e) { e.addEventListener('change', sync); }); return h('div', { class: 'tools tools--start' }, els);
  }

  // ---------- grafik ringan (SVG, patuh CSP) ----------
  var NS = 'http://www.w3.org/2000/svg';
  function sv(tag, a, kids) { var e = document.createElementNS(NS, tag); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); (kids || []).forEach(function (c) { e.appendChild(c); }); return e; }
  function stext(x, y, t, anchor) { var e = sv('text', { x: x, y: y, class: 'ch-t', 'text-anchor': anchor || 'middle' }); e.textContent = t; return e; }
  function nice(m) { if (m <= 4) return 4; var p = Math.pow(10, Math.floor(Math.log10(m))), n = m / p; return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function lblBln(k) { return /^\d{4}-\d{2}$/.test(k) ? BLN[+k.slice(5) - 1].slice(0, 3) + ' ' + k.slice(2, 4) : k; }
  function countBars(rows, title) {
    var W = 560, H = 260, L = 46, T = 10, B = 40, max = nice(Math.max.apply(null, [0].concat(rows.map(function (r) { return r.v; })))), s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': title, class: 'ch' });
    for (var i = 0; i <= 4; i++) { var y = T + (H - T - B) * (1 - i / 4); s.appendChild(sv('line', { x1: L, x2: W - 8, y1: y, y2: y, class: 'ch-g' })); s.appendChild(stext(L - 6, y + 6, String(Math.round(max * i / 4)), 'end')); }
    var n = Math.max(rows.length, 1), cw = (W - L - 8) / n, bw = Math.min(30, cw * 0.7);
    rows.forEach(function (r, i) { var hh = (H - T - B) * r.v / max, x = L + cw * i + (cw - bw) / 2, rect = sv('rect', { x: x, y: H - B - hh, width: bw, height: Math.max(hh, r.v > 0 ? 2 : 0), rx: 3, class: 'ch-in' }), t = sv('title'); t.textContent = lblBln(r.k) + ': ' + r.v + ' catatan'; rect.appendChild(t); s.appendChild(rect); if (n <= 6 || i % Math.ceil(n / 6) === 0) s.appendChild(stext(L + cw * i + cw / 2, H - 12, lblBln(r.k))); });
    return s;
  }
  function hBars(rows, emptyText, cls) {
    var tot = Math.max.apply(null, [0].concat(rows.map(function (r) { return r.v; })));
    if (!tot) return h('p', { class: 'muted', text: emptyText });
    return h('div', { class: 'sbars' }, rows.map(function (r, i) { return h('div', { class: 'sbar' }, h('span', { text: r.k }), h('div', { class: 'sbar__t' }, h('div', { class: 'sbar__f ' + (r.cls || cls || 'ch-ok'), style: 'width:' + (100 * r.v / tot).toFixed(1) + '%' })), h('b', { text: String(r.v) })); }));
  }
  function chartBox(title, body) { return h('figure', { class: 'chart' }, h('figcaption', null, h('b', { text: title })), body); }

  // ---------- dashboard ----------
  function viewDashboard(q, embedded) {
    var st = { dari: q.dari || '', sampai: q.sampai || '', kelompok: q.kelompok || '', asrama_id: q.asrama_id || '' }, body = h('div', { class: 'stack-s' });
    var shellBody = h('div', { class: 'stack-s' }), P = embedded ? { el: h('div', { class: 'stack-g' }, X.head('Dashboard Keamanan', 'Ringkasan dari catatan keamanan yang tersimpan di database.'), h('section', { class: 'panel stack-s' }, nav('dashboard'), shellBody)), body: shellBody } : page('dashboard', 'Dashboard Keamanan', 'Ringkasan dari catatan keamanan yang tersimpan di database.');
    function load() {
      api('GET', '/keamanan/dashboard' + qs(st)).then(function (d) {
        body.innerHTML = ''; var S = function (l, v, n, c, href) { var x = X.stat(l, v, n); if (c) x.classList.add(c); if (href) { x = h('a', { class: 'statlink', href: href }, x); } return x; };
        body.appendChild(h('div', { class: 'stats' }, [S('Santri aktif', d.santri_aktif, 'sesuai filter'), S('Catatan pelanggaran', d.pelanggaran.total, 'tidak termasuk yang dibatalkan', '', R + 'pelanggaran'), S('Pelanggaran bulan ini', d.pelanggaran.bulan_ini, 'bulan berjalan', '', R + 'pelanggaran'), S('Santri dengan pembinaan', d.pembinaan.santri, d.pembinaan.berjalan + ' pembinaan berjalan', '', R + 'pembinaan'),
          S('Izin sedang berlangsung', d.izin.sedang, 'santri di luar pondok', '', R + 'monitoring'), S('Santri belum kembali', d.izin.terlambat, 'lewat jadwal kembali', d.izin.terlambat ? 'stat--warn' : '', R + 'monitoring?tampil=terlambat'), S('Izin selesai', d.izin.selesai, 'sudah kembali', '', R + 'izin-keluar'), S('Menunggu persetujuan', d.izin.menunggu, 'pengajuan izin', '', R + 'izin-keluar')]));
        var izs = {}; d.grafik.izin.forEach(function (x) { izs[x.st] = (izs[x.st] || 0) + x.v; });
        var izRows = ['menunggu', 'disetujui', 'sedang_izin', 'terlambat', 'kembali', 'ditolak', 'dibatalkan'].map(function (k) { return { k: { menunggu: 'Menunggu persetujuan', disetujui: 'Disetujui', sedang_izin: 'Sedang izin', terlambat: 'Terlambat kembali', kembali: 'Sudah kembali', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' }[k], v: izs[k] || 0, cls: k === 'terlambat' || k === 'ditolak' || k === 'dibatalkan' ? 'ch-bad' : k === 'kembali' ? 'ch-ok' : 'ch-info' }; });
        body.appendChild(h('div', { class: 'charts' }, [chartBox('Pelanggaran per bulan', countBars(d.grafik.bulan, 'Pelanggaran per bulan')), chartBox('Kategori pelanggaran', hBars(d.grafik.kategori.map(function (x) { return { k: x.k, v: x.v }; }), 'Belum ada catatan pelanggaran pada filter ini.')), chartBox('Statistik perizinan', hBars(izRows, 'Belum ada data perizinan pada filter ini.'))]));
        body.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Aktivitas keamanan terbaru' }), d.aktivitas.length ? h('ul', { class: 'feed' }, d.aktivitas.map(function (a) { return h('li', null, h('time', { text: wib(Number(a.waktu)) }), h('span', null, h('b', { text: a.username + ' ' }), a.ket)); })) : empty('Belum ada aktivitas', 'Aktivitas muncul setelah ada catatan keamanan.', 'list')));
      }).catch(function (e) { errBox(body, e); });
    }
    return loadRef().then(function (ref) { P.body.appendChild(filterBar(ref, st, load)); P.body.appendChild(body); load(); clearInterval(window.__keaTimer); window.__keaTimer = setInterval(function () { if (!document.body.contains(body)) { clearInterval(window.__keaTimer); return; } load(); }, 60000); return P.el; });
  }

  // ---------- pelanggaran ----------
  function formPelanggaran(ref, r, done) {
    var pk = r ? null : santriPicker(), kat = null;
    var defs = [{ k: 'tanggal', label: 'Tanggal kejadian', type: 'date', past: true, req: true, val: r ? r.tanggal : X.today() }, { k: 'waktu', label: 'Waktu kejadian', type: 'time', val: r ? r.waktu : '' }, { k: 'kategori_id', label: 'Kategori pelanggaran', type: 'select', options: opts(ref.kategori_pelanggaran), req: true, val: r ? r.kategori_id : '' }, { k: 'lokasi', label: 'Lokasi kejadian', val: r ? r.lokasi : '' },
      { k: 'deskripsi', label: 'Deskripsi kejadian', type: 'area', req: true, val: r ? r.deskripsi : '', max: 2000 }, { k: 'catatan', label: 'Catatan tambahan', type: 'area', val: r ? r.catatan : '', max: 1000 }];
    if (r) defs.push({ k: 'alasan_koreksi', label: 'Alasan koreksi', type: 'area', req: true, help: 'Wajib; tercatat bersama nilai sebelum dan sesudah.', max: 500 });
    var ff = r ? null : X.fileField({ label: 'Lampiran', pdf: true }), note = !ref.kategori_pelanggaran.length ? h('p', { class: 'note note--warn', text: 'Belum ada kategori pelanggaran. Super Admin perlu menambahkannya di Pengaturan Keamanan.' }) : null;
    formModal(r ? 'Koreksi pelanggaran ' + r.nomor : 'Catat pelanggaran', defs, { wide: true, before: [note, pk ? pk.el : null].filter(Boolean), after: ff ? [field('Lampiran / bukti (opsional)', ff.el, 'JPG, PNG, atau PDF, maks. 2,5 MB.', true)] : [], label: 'Simpan', ok: r ? 'Perubahan tersimpan.' : 'Pelanggaran dicatat.',
      confirm: { title: r ? 'Simpan koreksi?' : 'Simpan catatan pelanggaran?', text: r ? 'Nilai sebelum dan sesudah akan tercatat di riwayat.' : 'Catatan tidak dihapus permanen; kesalahan dibatalkan atau dikoreksi dengan alasan.', confirmLabel: 'Ya, simpan' },
      submit: function (v) {
        if (r) { v.konfirmasi = true; return api('PATCH', '/keamanan/pelanggaran/' + r.id, Object.assign(v, { kategori_id: v.kategori_id })); }
        if (!pk.get()) { pk.err('Pilih santri terlebih dahulu.'); return Promise.reject({ message: 'Pilih santri terlebih dahulu.' }); }
        v.santri_id = pk.get().id; v.konfirmasi = true; return api('POST', '/keamanan/pelanggaran', v).then(function (d) { var f = ff.file(); return f ? api('PUT', '/keamanan/pelanggaran/' + d.id + '/lampiran', f).then(function () { return d; }, function (e) { toast('Tersimpan, tetapi lampiran gagal: ' + e.message, true); return d; }) : d; });
      }, done: done });
  }
  function detailPelanggaran(id, reload) {
    api('GET', '/keamanan/pelanggaran/' + id).then(function (d) {
      var p = d.pelanggaran, body = [kv([['Nomor', p.nomor], ['Tanggal & waktu', fmtDate(p.tanggal) + (p.waktu ? ' · ' + p.waktu : '')], ['Santri', p.nama + ' (' + (p.nis || 'NIS belum diisi') + ')'], ['Jenis kelamin / asrama / kamar', [jk(p.kelompok), p.asrama, p.kamar].filter(Boolean).join(' · ')], ['Kategori', p.kategori], ['Lokasi', p.lokasi], ['Deskripsi', p.deskripsi], ['Catatan', p.catatan], ['Petugas pencatat', p.petugas_nama || p.petugas], ['Status', p.batal ? 'Dibatalkan — ' + p.batal_alasan : ST_PLG[p.status][0]]])];
      if (p.berkas_id) body.push(h('p', null, h('a', { class: 'btn btn--ghost btn--sm', href: '/api/sima/berkas/' + p.berkas_id, target: '_blank', rel: 'noopener', text: 'Buka lampiran' })));
      if (d.pembinaan.length) body.push(h('h3', { class: 'sec', text: 'Pembinaan terkait' }), h('ul', { class: 'feed' }, d.pembinaan.map(function (m) { return h('li', null, h('time', { text: fmtDate(m.tanggal) }), h('span', null, m.nomor + ' · ' + m.jenis + ' · ' + m.pembina)); })));
      body.push(h('h3', { class: 'sec', text: 'Riwayat perubahan' }), auditList(d.audit));
      X.modal('Pelanggaran ' + p.nomor, body, function (close) {
        var a = [btn('Tutup', close, { ghost: true })]; if (p.batal) return a;
        a.unshift(btn('Batalkan', function () { X.confirmDialog({ title: 'Batalkan catatan ' + p.nomor + '?', text: 'Catatan tidak dihapus; tetap tersimpan sebagai dibatalkan dengan alasan.', reason: 'required', reasonLabel: 'Alasan pembatalan *', danger: true, confirmLabel: 'Ya, batalkan' }).then(function (c) { if (c) api('POST', '/keamanan/pelanggaran/' + id + '/batal', { konfirmasi: true, alasan: c.alasan }).then(function () { close(); toast('Catatan dibatalkan.'); reload(); }).catch(fail); }); }, { ghost: true, danger: true }));
        a.unshift(btn('Koreksi', function () { close(); loadRef().then(function (ref) { formPelanggaran(ref, p, reload); }); }, { ghost: true }));
        Object.keys(ST_PLG).filter(function (k) { return k !== p.status; }).forEach(function (k) { a.unshift(btn('→ ' + ST_PLG[k][0], function () { X.confirmDialog({ title: 'Ubah status menjadi “' + ST_PLG[k][0] + '”?', text: 'Perubahan status tercatat di riwayat.', confirmLabel: 'Ya, ubah' }).then(function (c) { if (c) api('POST', '/keamanan/pelanggaran/' + id + '/status', { konfirmasi: true, status: k }).then(function () { close(); toast('Status diperbarui.'); reload(); }).catch(fail); }); }, { ghost: true, sm: true })); });
        return a;
      }, { wide: true });
    }).catch(fail);
  }
  function viewPelanggaran() {
    var P = page('pelanggaran', 'Data Pelanggaran', 'Catatan pelanggaran santri aktif. Kategori diatur Super Admin; tidak ada kategori atau sanksi bawaan.'), lv;
    return loadRef(true).then(function (ref) {
      var cols = [{ t: 'No', f: function (r) { return r._no; }, cls: 'c-no' }, { t: 'Nomor', k: 'nomor', sort: 'nomor' }, { t: 'Tanggal', f: function (r) { return fmtDate(r.tanggal) + (r.waktu ? ' ' + r.waktu : ''); }, sort: 'tanggal' }, { t: 'Santri', f: function (r) { return h('div', null, h('b', { text: r.nama }), h('small', { class: 'muted', text: ' ' + (r.nis || '') })); }, sort: 'nama' }, { t: 'Asrama / kamar', f: function (r) { return [jk(r.kelompok), r.asrama, r.kamar].filter(Boolean).join(' · '); } }, { t: 'Kategori', k: 'kategori', sort: 'kategori' }, { t: 'Status', f: function (r) { return r.batal ? pill('Dibatalkan', 'off') : sp(ST_PLG, r.status); }, sort: 'status' }, { t: 'Aksi', f: function (r) { return btn('Detail', function () { detailPelanggaran(r.id, function () { lv.reload(); }); }, { ghost: true, sm: true }); } }];
      lv = X.listView({ endpoint: '/keamanan/pelanggaran', search: 'Cari nama, NIS, atau nomor…', cols: cols, defSort: 'tanggal', defDir: 'desc', emptyEl: empty('Belum ada catatan pelanggaran', 'Klik “Catat pelanggaran” untuk menambahkan. Tidak ada data contoh.', 'shield'),
        filters: [{ k: 'dari', label: 'Dari', type: 'date' }].slice(0, 0).concat([{ k: 'kategori_id', label: 'Kategori', options: opts(ref.kategori_pelanggaran) }, { k: 'status', label: 'Status', options: Object.keys(ST_PLG).map(function (k) { return { v: k, l: ST_PLG[k][0] }; }) }, { k: 'kelompok', label: 'Jenis kelamin', options: [{ v: 'putra', l: 'Putra' }, { v: 'putri', l: 'Putri' }] }, { k: 'asrama_id', label: 'Asrama', options: opts(ref.asrama) }]) });
      var d1 = h('input', { type: 'date', 'aria-label': 'Dari tanggal' }), d2 = h('input', { type: 'date', 'aria-label': 'Sampai tanggal' }), chk = h('label', { class: 'check' }, h('input', { type: 'checkbox' }), ' Tampilkan yang dibatalkan');
      function dr() { if (!!d1.value !== !!d2.value) return; lv.state.f.dari = d1.value; lv.state.f.sampai = d2.value; lv.state.page = 1; lv.reload(); }
      d1.addEventListener('change', dr); d2.addEventListener('change', dr); chk.firstChild.addEventListener('change', function () { lv.state.f.batal = chk.firstChild.checked ? 'semua' : ''; lv.state.page = 1; lv.reload(); });
      P.body.appendChild(h('div', { class: 'tools tools--start' }, btn('Catat pelanggaran', function () { formPelanggaran(ref, null, function () { lv.reload(); }); }, { icon: 'plus' }), h('span', { class: 'tools tools--start' }, d1, h('span', { text: 's.d.' }), d2), chk)); P.body.appendChild(lv.el); return P.el;
    });
  }

  // ---------- pembinaan ----------
  function formPembinaan(ref, r, done, pre) {
    var pk = r ? null : santriPicker(), pel = h('select', null, h('option', { value: '', text: 'Tanpa pelanggaran (mandiri)' }));
    function loadPel(s) { pel.innerHTML = ''; pel.appendChild(h('option', { value: '', text: 'Tanpa pelanggaran (mandiri)' })); api('GET', '/keamanan/pelanggaran' + qs({ santri_id: s.id, size: 50 })).then(function (d) { d.rows.forEach(function (p) { pel.appendChild(h('option', { value: p.id, text: p.nomor + ' · ' + p.kategori + ' · ' + fmtDate(p.tanggal) })); }); }).catch(function () { }); }
    if (!r) pk = santriPicker(loadPel);
    var jenis = ref.jenis_pembinaan.length ? { k: 'jenis_id', label: 'Bentuk pembinaan', type: 'select', options: opts(ref.jenis_pembinaan), val: r ? r.jenis_id || '' : '' } : { k: 'jenis', label: 'Bentuk pembinaan', req: true, val: r ? r.jenis : '', help: 'Belum ada jenis di pengaturan; ketik bebas.' };
    var defs = [{ k: 'tanggal', label: 'Tanggal pembinaan', type: 'date', past: true, req: true, val: r ? r.tanggal : X.today() }, jenis, { k: 'pembina', label: 'Petugas pembina', req: true, val: r ? r.pembina : (X.S.user.nama || X.S.user.username) }, { k: 'tanggal_tindak', label: 'Tanggal tindak lanjut', type: 'date', val: r ? r.tanggal_tindak || '' : '' },
      { k: 'alasan', label: 'Alasan / catatan pembinaan', type: 'area', req: true, val: r ? r.alasan : '' }, { k: 'hasil', label: 'Hasil pembinaan', type: 'area', val: r ? r.hasil || '' : '' }, { k: 'rencana', label: 'Rencana tindak lanjut', type: 'area', val: r ? r.rencana || '' : '' }];
    if (r) defs.push({ k: 'alasan_koreksi', label: 'Alasan koreksi', type: 'area', req: true, max: 500 });
    formModal(r ? 'Koreksi pembinaan ' + r.nomor : 'Catat pembinaan', defs, { wide: true, before: r ? [] : [pk.el, field('Terkait pelanggaran (opsional)', pel, null, true)], ok: 'Pembinaan tersimpan.', confirm: { title: 'Simpan catatan pembinaan?', text: 'Catatan pembinaan bersifat internal dan tidak dihapus permanen.', confirmLabel: 'Ya, simpan' },
      submit: function (v) { v.konfirmasi = true; if (r) { if (v.jenis_id === '') delete v.jenis_id; return api('PATCH', '/keamanan/pembinaan/' + r.id, v); } if (!pk.get()) { pk.err('Pilih santri terlebih dahulu.'); return Promise.reject({ message: 'Pilih santri terlebih dahulu.' }); } v.santri_id = pk.get().id; if (pel.value) v.pelanggaran_id = pel.value; return api('POST', '/keamanan/pembinaan', v); }, done: done });
  }
  function detailPembinaan(id, reload) {
    api('GET', '/keamanan/pembinaan/' + id).then(function (d) {
      var p = d.pembinaan;
      X.modal('Pembinaan ' + p.nomor, [kv([['Nomor', p.nomor], ['Tanggal', fmtDate(p.tanggal)], ['Santri', p.nama + ' (' + (p.nis || 'NIS belum diisi') + ')'], ['Terkait pelanggaran', p.pelanggaran_nomor || 'Mandiri (tanpa pelanggaran)'], ['Bentuk pembinaan', p.jenis], ['Petugas pembina', p.pembina], ['Alasan / catatan', p.alasan], ['Hasil', p.hasil], ['Rencana tindak lanjut', p.rencana], ['Tanggal tindak lanjut', p.tanggal_tindak ? fmtDate(p.tanggal_tindak) : null], ['Status', ST_PMB[p.status][0] + (p.status === 'dibatalkan' ? ' — ' + p.batal_alasan : '')]]), h('h3', { class: 'sec', text: 'Riwayat perubahan' }), auditList(d.audit)], function (close) {
        var a = [btn('Tutup', close, { ghost: true })]; if (p.status === 'dibatalkan') return a;
        a.unshift(btn('Batalkan', function () { X.confirmDialog({ title: 'Batalkan pembinaan ' + p.nomor + '?', text: 'Catatan tetap tersimpan sebagai dibatalkan.', reason: 'required', reasonLabel: 'Alasan pembatalan *', danger: true, confirmLabel: 'Ya, batalkan' }).then(function (c) { if (c) api('POST', '/keamanan/pembinaan/' + id + '/batal', { konfirmasi: true, alasan: c.alasan }).then(function () { close(); toast('Pembinaan dibatalkan.'); reload(); }).catch(fail); }); }, { ghost: true, danger: true }));
        a.unshift(btn('Koreksi', function () { close(); loadRef().then(function (ref) { formPembinaan(ref, p, reload); }); }, { ghost: true }));
        var nx = p.status === 'berjalan' ? 'selesai' : 'berjalan'; a.unshift(btn(nx === 'selesai' ? 'Tandai selesai' : 'Buka kembali (berjalan)', function () { X.confirmDialog({ title: 'Ubah status pembinaan?', text: 'Menjadi “' + ST_PMB[nx][0] + '”. Tercatat di riwayat.', confirmLabel: 'Ya, ubah' }).then(function (c) { if (c) api('POST', '/keamanan/pembinaan/' + id + '/status', { konfirmasi: true, status: nx }).then(function () { close(); toast('Status diperbarui.'); reload(); }).catch(fail); }); }, { sm: true }));
        return a;
      }, { wide: true });
    }).catch(fail);
  }
  function viewPembinaan() {
    var P = page('pembinaan', 'Data Pembinaan', 'Catatan pembinaan santri. Bersifat internal; dapat terkait pelanggaran atau berdiri sendiri.'), lv;
    return loadRef(true).then(function (ref) {
      lv = X.listView({ endpoint: '/keamanan/pembinaan', search: 'Cari nama, NIS, atau nomor…', defSort: '', cols: [{ t: 'No', f: function (r) { return r._no; }, cls: 'c-no' }, { t: 'Nomor', k: 'nomor' }, { t: 'Tanggal', f: function (r) { return fmtDate(r.tanggal); } }, { t: 'Santri', f: function (r) { return h('div', null, h('b', { text: r.nama }), h('small', { class: 'muted', text: ' ' + (r.nis || '') })); } }, { t: 'Bentuk', k: 'jenis' }, { t: 'Pembina', k: 'pembina' }, { t: 'Terkait', f: function (r) { return r.pelanggaran_nomor || 'Mandiri'; } }, { t: 'Status', f: function (r) { return sp(ST_PMB, r.status); } }, { t: 'Aksi', f: function (r) { return btn('Detail', function () { detailPembinaan(r.id, function () { lv.reload(); }); }, { ghost: true, sm: true }); } }],
        emptyEl: empty('Belum ada catatan pembinaan', 'Klik “Catat pembinaan” untuk menambahkan. Tidak ada data contoh.', 'shield'), filters: [{ k: 'status', label: 'Status', options: Object.keys(ST_PMB).map(function (k) { return { v: k, l: ST_PMB[k][0] }; }) }, { k: 'kelompok', label: 'Jenis kelamin', options: [{ v: 'putra', l: 'Putra' }, { v: 'putri', l: 'Putri' }] }, { k: 'asrama_id', label: 'Asrama', options: opts(ref.asrama) }] });
      P.body.appendChild(h('div', { class: 'tools tools--start' }, btn('Catat pembinaan', function () { formPembinaan(ref, null, function () { lv.reload(); }); }, { icon: 'plus' }))); P.body.appendChild(lv.el); return P.el;
    });
  }

  // ---------- perizinan ----------
  function formIzin(ref, jenis, done) {
    var pulang = jenis === 'pulang', pk = santriPicker(), now = Date.now();
    var jo = ref.jenis_izin.filter(function (j) { return j.jenis === jenis; });
    var defs = [{ k: 'tgl_pengajuan', label: 'Tanggal pengajuan', type: 'date', past: true, req: true, val: X.today() }, jo.length ? { k: 'jenis_izin_id', label: 'Jenis izin', type: 'select', options: opts(jo), blank: '— Tidak dipilih —' } : null, { k: 'tujuan', label: pulang ? 'Tujuan pulang' : 'Tujuan izin', req: true },
      { k: 'rencana_keluar', label: pulang ? 'Rencana berangkat' : 'Rencana keluar', type: 'datetime', req: true, val: wibInput(now + 3600e3) }, { k: 'rencana_kembali', label: 'Perkiraan kembali', type: 'datetime', req: true, val: wibInput(now + 5 * 3600e3) }]
      .concat(pulang ? [{ k: 'alamat_tujuan', label: 'Alamat tujuan', type: 'area', req: false, max: 400 }, { k: 'wali', label: 'Wali / keluarga yang mengetahui' }, { k: 'kontak_wali', label: 'Kontak wali / keluarga' }] : [{ k: 'pendamping', label: 'Pendamping / penjemput' }, { k: 'kontak_pendamping', label: 'Kontak pendamping' }])
      .concat([{ k: 'alasan', label: 'Alasan', type: 'area' }, { k: 'catatan', label: 'Catatan', type: 'area' }]).filter(Boolean);
    formModal(pulang ? 'Ajukan izin pulang' : 'Ajukan izin keluar pondok', defs, { wide: true, before: [pk.el, h('p', { class: 'muted', text: 'Waktu dicatat menurut WIB (Asia/Jakarta). Alur persetujuan mengikuti pengaturan Super Admin.' })], ok: 'Pengajuan dicatat.', confirm: { title: 'Simpan pengajuan izin?', text: 'Status awal mengikuti alur persetujuan pada pengaturan.', confirmLabel: 'Ya, simpan' },
      submit: function (v) { if (!pk.get()) { pk.err('Pilih santri terlebih dahulu.'); return Promise.reject({ message: 'Pilih santri terlebih dahulu.' }); } v.santri_id = pk.get().id; v.konfirmasi = true; return api('POST', '/keamanan/izin-' + jenis, v); }, done: done });
  }
  function waktuDialog(title, label, def, cb) {
    var i = h('input', { type: 'datetime-local', value: def }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' }), cat = h('textarea', { rows: '2', maxlength: '500' });
    X.modal(title, [note, field(label, i, 'Waktu aktual menurut WIB. Biarkan sesuai saat ini bila terjadi sekarang.', true), field('Catatan (opsional)', cat, null, true)], function (close) { return [btn('Batal', close, { ghost: true }), btn('Simpan', function (ev) { ev.target.disabled = true; cb(i.value, cat.value.trim()).then(function () { close(); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message; }); })]; }, { sticky: true });
  }
  function koreksiIzin(i, done) {
    var defs = [{ k: 'tujuan', label: 'Tujuan', val: i.tujuan, req: true }, { k: 'rencana_keluar', label: 'Rencana keluar', type: 'datetime', val: toInput(i.rencana_keluar) }, { k: 'rencana_kembali', label: 'Jadwal kembali', type: 'datetime', val: toInput(i.rencana_kembali) }];
    if (['sedang_izin', 'kembali'].indexOf(i.status) >= 0) defs.push({ k: 'aktual_keluar', label: 'Waktu keluar aktual', type: 'datetime', val: toInput(i.aktual_keluar) });
    if (i.status === 'kembali') defs.push({ k: 'aktual_kembali', label: 'Waktu kembali aktual', type: 'datetime', val: toInput(i.aktual_kembali) });
    defs.push(i.jenis === 'pulang' ? { k: 'alamat_tujuan', label: 'Alamat tujuan', type: 'area', val: i.alamat_tujuan || '' } : { k: 'pendamping', label: 'Pendamping / penjemput', val: i.pendamping || '' }, { k: 'catatan', label: 'Catatan', type: 'area', val: i.catatan || '' }, { k: 'alasan_koreksi', label: 'Alasan koreksi', type: 'area', req: true, max: 500, help: 'Wajib; nilai sebelum dan sesudah tercatat.' });
    formModal('Koreksi izin ' + i.nomor, defs, { wide: true, ok: 'Koreksi tersimpan.', confirm: { title: 'Simpan koreksi izin?', text: 'Perubahan tercatat lengkap di riwayat audit.', confirmLabel: 'Ya, simpan' },
      submit: function (v) { var b = { konfirmasi: true, alasan_koreksi: v.alasan_koreksi }; Object.keys(v).forEach(function (k) { if (k === 'alasan_koreksi') return; var orig = ['rencana_keluar', 'rencana_kembali', 'aktual_keluar', 'aktual_kembali'].indexOf(k) >= 0 ? toInput(i[k]) : (i[k] || ''); if (v[k] !== orig) b[k] = v[k]; }); return api('POST', '/keamanan/izin/' + i.id + '/koreksi', b); }, done: done });
  }
  function tindakDialog(i, done) {
    var s = selectEl(Object.keys(TINDAK).map(function (k) { return { v: k, l: TINDAK[k] }; })), c = h('textarea', { rows: '2', maxlength: '500' }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' }); s.value = i.tindak_status || 'belum'; c.value = i.tindak_catatan || '';
    X.modal('Tindak lanjut — ' + i.nama, [note, field('Status tindak lanjut', s, null, true), field('Catatan', c, 'Mis. wali sudah dihubungi (tanpa data rahasia).', true)], function (close) { return [btn('Batal', close, { ghost: true }), btn('Simpan', function (ev) { ev.target.disabled = true; api('POST', '/keamanan/izin/' + i.id + '/tindak', { konfirmasi: true, tindak_status: s.value, tindak_catatan: c.value.trim() }).then(function () { close(); toast('Tindak lanjut disimpan.'); done(); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message; }); })]; }, { sticky: true });
  }
  function aksiIzin(i, reload, close) {
    var a = [], act = function (path, body, msg) { return api('POST', '/keamanan/izin/' + i.id + '/' + path, Object.assign({ konfirmasi: true }, body)).then(function () { if (close) close(); toast(msg); reload(); }).catch(fail); };
    if (i.status === 'menunggu') {
      a.push(btn('Setujui', function () { X.confirmDialog({ title: 'Setujui izin ' + i.nomor + '?', text: i.nama + ' — ' + i.tujuan, confirmLabel: 'Ya, setujui' }).then(function (c) { if (c) act('setujui', {}, 'Izin disetujui.'); }); }, { sm: true }));
      a.push(btn('Tolak', function () { X.confirmDialog({ title: 'Tolak izin ' + i.nomor + '?', text: 'Alasan penolakan tercatat.', reason: 'required', reasonLabel: 'Alasan penolakan *', danger: true, confirmLabel: 'Ya, tolak' }).then(function (c) { if (c) act('tolak', { alasan: c.alasan }, 'Izin ditolak.'); }); }, { ghost: true, danger: true, sm: true }));
    }
    if (i.status === 'disetujui') a.push(btn(i.jenis === 'pulang' ? 'Catat berangkat' : 'Catat keluar', function () { waktuDialog('Catat keberangkatan', 'Waktu keluar aktual', wibInput(), function (w, cat) { return api('POST', '/keamanan/izin/' + i.id + '/keluar', { konfirmasi: true, waktu: w }).then(function () { toast('Keberangkatan dicatat.'); reload(); }); }); }, { sm: true }));
    if (i.status === 'sedang_izin') { a.push(btn('Catat kembali', function () { waktuDialog('Catat kedatangan kembali', 'Waktu kembali aktual', wibInput(), function (w, cat) { return api('POST', '/keamanan/izin/' + i.id + '/kembali', { konfirmasi: true, waktu: w, catatan: cat }).then(function () { toast('Kedatangan dicatat. Status diperbarui.'); reload(); }); }); }, { sm: true })); a.push(btn('Tindak lanjut', function () { tindakDialog(i, reload); }, { ghost: true, sm: true })); }
    if (['menunggu', 'disetujui'].indexOf(i.status) >= 0) a.push(btn('Batalkan', function () { X.confirmDialog({ title: 'Batalkan izin ' + i.nomor + '?', text: 'Hanya dapat dibatalkan sebelum santri keluar.', reason: 'required', reasonLabel: 'Alasan pembatalan *', danger: true, confirmLabel: 'Ya, batalkan' }).then(function (c) { if (c) act('batal', { alasan: c.alasan }, 'Izin dibatalkan.'); }); }, { ghost: true, danger: true, sm: true }));
    if (['ditolak', 'dibatalkan'].indexOf(i.status) < 0) a.push(btn('Koreksi', function () { koreksiIzin(i, reload); }, { ghost: true, sm: true }));
    return a;
  }
  function statusIzinEl(i) { return i.kembali_terlambat ? h('span', null, pill('Sudah kembali', 'ok'), ' ', pill('Terlambat ' + lama(i.telat_menit), 'off')) : sp(ST_IZ, i.status_tampil); }
  function detailIzin(id, reload) {
    api('GET', '/keamanan/izin/' + id).then(function (d) {
      var i = d.izin, pulang = i.jenis === 'pulang';
      X.modal((pulang ? 'Izin pulang ' : 'Izin keluar ') + i.nomor, [h('p', null, statusIzinEl(i)), kv([['Nomor', i.nomor], ['Santri', i.nama + ' (' + (i.nis || 'NIS belum diisi') + ')'], ['Jenis kelamin / asrama / kamar', [jk(i.kelompok), i.asrama, i.kamar].filter(Boolean).join(' · ')], ['Tanggal pengajuan', fmtDate(i.tgl_pengajuan)], ['Jenis izin', i.jenis_izin], ['Tujuan', i.tujuan], ['Alasan', i.alasan], pulang ? ['Alamat tujuan', i.alamat_tujuan] : ['Pendamping / penjemput', [i.pendamping, i.kontak_pendamping].filter(Boolean).join(' · ')], pulang ? ['Wali / keluarga yang mengetahui', [i.wali, i.kontak_wali].filter(Boolean).join(' · ')] : null, ['Rencana ' + (pulang ? 'berangkat' : 'keluar'), wib(i.rencana_keluar)], ['Jadwal kembali', wib(i.rencana_kembali)], ['Keluar aktual', wib(i.aktual_keluar) || null], ['Kembali aktual', wib(i.aktual_kembali) || null],
        ['Petugas penyetuju', i.disetujui_nama ? i.disetujui_nama + ' · ' + wib(i.disetujui_waktu) : null], i.alasan_tolak ? ['Alasan penolakan', i.alasan_tolak] : null, i.alasan_batal ? ['Alasan pembatalan', i.alasan_batal] : null, ['Catatan', i.catatan], i.status === 'sedang_izin' ? ['Tindak lanjut', TINDAK[i.tindak_status] + (i.tindak_catatan ? ' — ' + i.tindak_catatan : '')] : null, ['Petugas pencatat', i.petugas]].filter(Boolean)), h('h3', { class: 'sec', text: 'Riwayat perubahan' }), auditList(d.audit)], function (close) { return [btn('Tutup', close, { ghost: true })].concat(aksiIzin(i, reload, close)); }, { wide: true });
    }).catch(fail);
  }
  function viewIzin(jenis) {
    var pulang = jenis === 'pulang', P = page('izin-' + jenis, pulang ? 'Perizinan Pulang' : 'Perizinan Keluar Pondok', 'Alur: pengajuan → pemeriksaan → disetujui / ditolak → keluar aktual → kembali aktual. Status diperbarui otomatis dari catatan petugas.'), lv;
    return loadRef(true).then(function (ref) {
      var cols = [{ t: 'No', f: function (r) { return r._no; }, cls: 'c-no' }, { t: 'Nomor', k: 'nomor' }, { t: 'Santri', f: function (r) { return h('div', null, h('b', { text: r.nama }), h('small', { class: 'muted', text: ' ' + (r.nis || '') })); } }, { t: 'Tujuan', k: 'tujuan' }, { t: 'Rencana keluar', f: function (r) { return wib(r.rencana_keluar); } }, { t: 'Jadwal kembali', f: function (r) { return wib(r.rencana_kembali); } }, { t: 'Status', f: statusIzinEl }, { t: 'Aksi', f: function (r) { return h('div', { class: 'acts' }, btn('Detail', function () { detailIzin(r.id, function () { lv.reload(); }); }, { ghost: true, sm: true })); } }];
      lv = X.listView({ endpoint: '/keamanan/izin-' + jenis, search: 'Cari nama, NIS, atau nomor…', cols: cols, emptyEl: empty('Belum ada data izin', 'Klik “Ajukan izin” untuk menambahkan. Tidak ada data contoh.', 'shield'), filters: [{ k: 'status', label: 'Status', options: Object.keys(ST_IZ).map(function (k) { return { v: k, l: ST_IZ[k][0] }; }) }, { k: 'kelompok', label: 'Jenis kelamin', options: [{ v: 'putra', l: 'Putra' }, { v: 'putri', l: 'Putri' }] }, { k: 'asrama_id', label: 'Asrama', options: opts(ref.asrama) }] });
      P.body.appendChild(h('div', { class: 'tools tools--start' }, btn('Ajukan izin', function () { formIzin(ref, jenis, function () { lv.reload(); }); }, { icon: 'plus' }))); P.body.appendChild(lv.el); return P.el;
    });
  }

  // ---------- monitoring belum kembali ----------
  function viewMonitoring(q) {
    var P = page('monitoring', 'Monitoring Santri Belum Kembali', 'Keterlambatan dihitung dari jadwal kembali dan jam server (WIB). Santri tidak otomatis dianggap kembali; petugas harus mencatat kedatangan.'), out = h('div', { class: 'stack-s' }), st = { tampil: q.tampil || 'aktif', jenis: '' };
    var TABS = [['aktif', 'Belum kembali'], ['terlambat', 'Terlambat'], ['mendekat', 'Jadwal mendekat'], ['berlangsung', 'Masih berlangsung'], ['kembali', 'Sudah kembali (7 hari)']], tabs = h('nav', { class: 'tabs tabs--wrap', 'aria-label': 'Filter monitoring' }), jn = selectEl([{ v: 'keluar', l: 'Izin keluar' }, { v: 'pulang', l: 'Izin pulang' }], 'Semua jenis izin');
    function drawTabs() { tabs.innerHTML = ''; TABS.forEach(function (t) { tabs.appendChild(h('a', { class: 'tab' + (st.tampil === t[0] ? ' is-on' : ''), href: R + 'monitoring?tampil=' + t[0], onclick: function (e) { e.preventDefault(); st.tampil = t[0]; drawTabs(); load(); }, text: t[1] })); }); }
    jn.addEventListener('change', function () { st.jenis = jn.value; load(); });
    function load() {
      api('GET', '/keamanan/monitoring' + qs(st)).then(function (d) {
        out.innerHTML = ''; var r = d.ringkasan;
        out.appendChild(h('div', { class: 'stats' }, [X.stat('Masih berlangsung', r.berlangsung, 'belum jadwal kembali'), X.stat('Jadwal mendekat', r.mendekat, 'dalam ' + d.peringatan_menit + ' menit'), (function () { var s = X.stat('Terlambat kembali', r.terlambat, 'lewat jadwal' + (d.toleransi_menit ? ' + toleransi ' + d.toleransi_menit + ' menit' : '')); if (r.terlambat) s.classList.add('stat--warn'); return s; })()]));
        var cols = [{ t: 'Santri', f: function (x) { return h('div', null, h('b', { text: x.nama }), h('small', { class: 'muted', text: ' ' + (x.nis || '') })); } }, { t: 'Asrama / kamar', f: function (x) { return [x.asrama, x.kamar].filter(Boolean).join(' / '); } }, { t: 'Jenis', f: function (x) { return x.jenis === 'pulang' ? 'Pulang' : 'Keluar'; } }, { t: 'Tujuan', k: 'tujuan' }, { t: 'Berangkat', f: function (x) { return wib(x.aktual_keluar); } }, { t: 'Jadwal kembali', f: function (x) { return wib(x.rencana_kembali); } },
          { t: 'Kontak', f: function (x) { return [x.pendamping || x.wali, x.kontak_pendamping || x.kontak_wali].filter(Boolean).join(' · ') || 'Belum diisi'; } }, { t: 'Keterlambatan', f: function (x) { return x.status === 'kembali' ? (x.kembali_terlambat ? lama(x.telat_menit) : '—') : x.status_tampil === 'terlambat' ? lama(x.telat_menit) : '—'; } }, { t: 'Status', f: function (x) { return h('div', null, statusIzinEl(x), x.status === 'sedang_izin' ? h('small', { class: 'muted', text: ' ' + TINDAK[x.tindak_status] }) : null); } }, { t: 'Aksi', f: function (x) { return h('div', { class: 'acts' }, btn('Detail', function () { detailIzin(x.id, load); }, { ghost: true, sm: true }), x.status === 'sedang_izin' ? btn('Catat kembali', function () { waktuDialog('Catat kedatangan kembali', 'Waktu kembali aktual', wibInput(), function (w, cat) { return api('POST', '/keamanan/izin/' + x.id + '/kembali', { konfirmasi: true, waktu: w, catatan: cat }).then(function () { toast('Kedatangan dicatat.'); load(); }); }); }, { sm: true }) : null, x.status === 'sedang_izin' ? btn('Tindak lanjut', function () { tindakDialog(x, load); }, { ghost: true, sm: true }) : null); } }];
        var wrap = h('div', { class: 'scroll' }, X.table(cols, d.rows, empty('Tidak ada santri pada kategori ini', 'Semua santri yang izin sudah kembali atau belum ada izin berlangsung.', 'shield')));
        wrap.querySelectorAll('tbody tr').forEach(function (tr, i) { var x = d.rows[i]; if (x) tr.classList.add('mon--' + (x.status === 'kembali' ? 'kembali' : x.status_tampil)); }); out.appendChild(wrap);
        out.appendChild(h('p', { class: 'muted', text: 'Diperbarui ' + wib(d.sekarang) + ' · otomatis tiap 60 detik.' }));
      }).catch(function (e) { errBox(out, e); });
    }
    drawTabs(); P.body.appendChild(h('div', { class: 'tools tools--start' }, tabs, jn)); P.body.appendChild(out); load();
    clearInterval(window.__keaMon); window.__keaMon = setInterval(function () { if (!document.body.contains(out)) { clearInterval(window.__keaMon); return; } load(); }, 60000);
    return Promise.resolve(P.el);
  }

  // ---------- profil keamanan santri & pencarian terpusat ----------
  var CEPAT = [['', 'Semua santri'], ['pelanggaran_terbaru', 'Pelanggaran terbaru (30 hari)'], ['pembinaan_berjalan', 'Pembinaan berjalan'], ['izin_berlangsung', 'Izin berlangsung'], ['belum_kembali', 'Belum kembali'], ['izin_selesai', 'Izin selesai']];
  function viewSantri(p, q) { return p[0] && /^\d+$/.test(p[0]) ? profil(+p[0]) : daftarSantri(q); }
  function daftarSantri(q) {
    var P = page('santri', 'Profil Keamanan Santri', 'Pencarian terpusat santri aktif. Hanya identitas minimal; data keluarga, KK, dan keuangan tidak ditampilkan.'), lv, cepat = q.cepat || '';
    return loadRef(true).then(function (ref) {
      var chips = h('div', { class: 'tools tools--start' }), kt = selectEl(opts(ref.kategori_pelanggaran), 'Kategori pelanggaran: semua'), pb = selectEl([{ v: 'berjalan', l: 'Pembinaan berjalan' }, { v: 'selesai', l: 'Pembinaan selesai' }], 'Status pembinaan: semua'), iz = selectEl([{ v: 'menunggu', l: 'Menunggu persetujuan' }, { v: 'disetujui', l: 'Disetujui' }, { v: 'sedang', l: 'Sedang izin' }, { v: 'terlambat', l: 'Terlambat kembali' }, { v: 'selesai', l: 'Sudah kembali' }, { v: 'ditolak', l: 'Ditolak' }, { v: 'dibatalkan', l: 'Dibatalkan' }], 'Status perizinan: semua'), km = selectEl(opts(ref.kamar), 'Kamar: semua'), d1 = h('input', { type: 'date', 'aria-label': 'Pelanggaran dari tanggal' }), d2 = h('input', { type: 'date', 'aria-label': 'Pelanggaran sampai tanggal' });
      function drawChips() { chips.innerHTML = ''; CEPAT.forEach(function (c) { chips.appendChild(h('button', { type: 'button', class: 'chip' + (cepat === c[0] ? ' is-on' : ''), onclick: function () { cepat = c[0]; lv.state.f.cepat = cepat; lv.state.page = 1; drawChips(); lv.reload(); }, text: c[1] })); }); }
      function sync() { if (!!d1.value !== !!d2.value) return; var f = lv.state.f; f.kategori_id = kt.value; f.pembinaan = pb.value; f.izin = iz.value; f.kamar_id = km.value; f.dari = d1.value; f.sampai = d2.value; lv.state.page = 1; lv.reload(); }
      lv = X.listView({ endpoint: '/keamanan/santri', search: 'Cari NIS atau nama…', defSort: '', base: {}, emptyEl: empty('Tidak ada santri aktif', 'Data santri berasal dari modul Data Santri.', 'users'), filters: [{ k: 'kelompok', label: 'Jenis kelamin', options: [{ v: 'putra', l: 'Putra' }, { v: 'putri', l: 'Putri' }] }, { k: 'asrama_id', label: 'Asrama', options: opts(ref.asrama) }],
        cols: [{ t: 'No', f: function (r) { return r._no; }, cls: 'c-no' }, { t: 'Santri', f: function (r) { return h('div', { class: 'cell-person' }, X.avatar(r.foto, r.nama), h('div', null, h('b', { text: r.nama }), h('small', { class: 'muted', text: ' ' + (r.nis || 'NIS belum diisi') }))); } }, { t: 'Jenis kelamin', f: function (r) { return jk(r.kelompok); } }, { t: 'Asrama / kamar', f: function (r) { return [r.asrama, r.kamar].filter(Boolean).join(' / ') || 'Belum ditempatkan'; } }, { t: 'Pelanggaran', f: function (r) { return r.n_pelanggaran + (r.pelanggaran_terakhir ? ' (terakhir ' + fmtDate(r.pelanggaran_terakhir) + ')' : ''); } }, { t: 'Pembinaan berjalan', f: function (r) { return r.n_pembinaan_berjalan || '—'; } }, { t: 'Perizinan', f: function (r) { return r.izin_sekarang ? sp(ST_IZ, r.izin_sekarang) : '—'; } }, { t: 'Aksi', f: function (r) { return h('a', { class: 'btn btn--ghost btn--sm', href: R + 'santri/' + r.id, text: 'Buka profil' }); } }] });
      lv.state.f.cepat = cepat; [kt, pb, iz, km, d1, d2].forEach(function (e) { e.addEventListener('change', sync); }); drawChips();
      P.body.appendChild(chips); P.body.appendChild(h('div', { class: 'tools tools--start' }, kt, pb, iz, km, h('span', { class: 'tools tools--start' }, d1, h('span', { text: 's.d.' }), d2))); P.body.appendChild(lv.el); lv.reload(); return P.el;
    });
  }
  function profil(id) {
    return api('GET', '/keamanan/santri/' + id).then(function (d) {
      var s = d.santri, wrap = h('div', { class: 'stack-g' }), act = h('div', { class: 'tools tools--end' }, h('a', { class: 'btn btn--ghost', href: R + 'santri', text: '← Kembali' }));
      wrap.appendChild(X.head('Profil Keamanan: ' + s.nama, 'Hanya identitas minimal dan riwayat keamanan.', act));
      var top = h('section', { class: 'panel' }, h('div', { class: 'cell-person' }, X.avatar(s.foto, s.nama), h('div', null, h('h2', { text: s.nama }), h('p', { class: 'muted', text: [s.nis || 'NIS belum diisi', jk(s.kelompok), s.asrama, s.kamar].filter(Boolean).join(' · ') }), s.status === 'aktif' ? pill('Santri aktif', 'ok') : pill('Alumni — tidak dapat dicatat', 'off'))));
      wrap.appendChild(top);
      var secs = h('div', { class: 'stack-s' });
      function sec(title, n, content) { return h('section', { class: 'panel stack-s' }, h('h2', { text: title + ' (' + n + ')' }), content); }
      secs.appendChild(sec('Riwayat pelanggaran', d.pelanggaran.length, X.table([{ t: 'Nomor', k: 'nomor' }, { t: 'Tanggal', f: function (r) { return fmtDate(r.tanggal) + (r.waktu ? ' ' + r.waktu : ''); } }, { t: 'Kategori', k: 'kategori' }, { t: 'Deskripsi', k: 'deskripsi' }, { t: 'Status', f: function (r) { return r.batal ? pill('Dibatalkan', 'off') : sp(ST_PLG, r.status); } }, { t: 'Aksi', f: function (r) { return btn('Detail', function () { detailPelanggaran(r.id, function () { X.route(); }); }, { ghost: true, sm: true }); } }], d.pelanggaran, empty('Belum ada pelanggaran', 'Tidak ada catatan pelanggaran untuk santri ini.', 'shield'))));
      secs.appendChild(sec('Riwayat pembinaan', d.pembinaan.length, X.table([{ t: 'Nomor', k: 'nomor' }, { t: 'Tanggal', f: function (r) { return fmtDate(r.tanggal); } }, { t: 'Bentuk', k: 'jenis' }, { t: 'Pembina', k: 'pembina' }, { t: 'Hasil', f: function (r) { return r.hasil || 'Belum diisi'; } }, { t: 'Status', f: function (r) { return sp(ST_PMB, r.status); } }, { t: 'Aksi', f: function (r) { return btn('Detail', function () { detailPembinaan(r.id, function () { X.route(); }); }, { ghost: true, sm: true }); } }], d.pembinaan, empty('Belum ada pembinaan', 'Tidak ada catatan pembinaan untuk santri ini.', 'shield'))));
      [['Riwayat izin keluar pondok', d.izin_keluar], ['Riwayat izin pulang', d.izin_pulang]].forEach(function (g) { secs.appendChild(sec(g[0], g[1].length, X.table([{ t: 'Nomor', k: 'nomor' }, { t: 'Tujuan', k: 'tujuan' }, { t: 'Rencana', f: function (r) { return wib(r.rencana_keluar); } }, { t: 'Kembali aktual', f: function (r) { return wib(r.aktual_kembali) || '—'; } }, { t: 'Status', f: statusIzinEl }, { t: 'Aksi', f: function (r) { return btn('Detail', function () { detailIzin(r.id, function () { X.route(); }); }, { ghost: true, sm: true }); } }], g[1], empty('Belum ada izin', 'Tidak ada catatan perizinan.', 'shield')))); });
      wrap.appendChild(secs); return wrap;
    });
  }

  // ---------- laporan ----------
  function renderRep(rep) {
    var box = h('div', { class: 'receipt receipt--rep' }, h('header', null, h('b', { text: rep.pondok }), rep.alamat ? h('small', { text: rep.alamat }) : null, h('span', { text: rep.judul })), h('p', { class: 'muted', text: rep.filter.join(' | ') }));
    var cols = rep.kolom.map(function (c) { return { t: c.t, f: function (r) { var v = r[c.k]; return v == null || v === '' ? '' : c.tipe === 'tgl' ? fmtDate(v) : String(v); } }; });
    box.appendChild(h('div', { class: 'scroll' }, X.table(cols, rep.rows, empty('Tidak ada data', 'Tidak ada catatan pada filter ini.', 'list'))));
    box.appendChild(h('dl', { class: 'receipt__dl sum' }, rep.ringkasan.reduce(function (a, s) { a.push(h('dt', { text: s[0] }), h('dd', { class: 'strong', text: String(s[1]) })); return a; }, []))); if (rep.catatan) box.appendChild(h('p', { class: 'muted', text: rep.catatan })); box.appendChild(h('p', { class: 'muted print-only', text: 'Dicetak ' + wib(Date.now()) + ' oleh ' + X.S.user.username })); return box;
  }
  function cetakModal(jenis, params) {
    api('GET', '/keamanan/laporan/' + jenis + qs(params)).then(function (rep) { X.modal(rep.judul, [renderRep(rep)], function (close) { return [btn('Cetak', printNode), btn('Tutup', close, { ghost: true })]; }, { wide: true }); }).catch(fail);
  }
  function viewLaporan() {
    var P = page('laporan', 'Laporan Keamanan', 'Pilih laporan dan filter. Data dari catatan keamanan; tidak memuat data keuangan. Unduh PDF atau Excel, atau cetak.');
    return Promise.all([loadRef(true), api('GET', '/keamanan/laporan')]).then(function (rs) {
      var ref = rs[0], l = rs[1], jenis = selectEl(l.jenis.map(function (j) { return { v: j.id, l: j.judul }; })), d1 = h('input', { type: 'date', 'aria-label': 'Dari' }), d2 = h('input', { type: 'date', 'aria-label': 'Sampai' }), kel = selectEl([{ v: 'putra', l: 'Putra' }, { v: 'putri', l: 'Putri' }], 'Jenis kelamin: semua'), asr = selectEl(opts(ref.asrama), 'Asrama: semua'), kat = selectEl(opts(ref.kategori_pelanggaran), 'Kategori: semua'), stt = selectEl([], 'Status: semua'), cari = h('input', { type: 'search', placeholder: 'Cari nama / NIS…', maxlength: '60', 'aria-label': 'Cari' });
      var out = h('div', { class: 'stack-s' }), links = h('div', { class: 'tools tools--end' }), STS = { pelanggaran: Object.keys(ST_PLG).map(function (k) { return { v: k, l: ST_PLG[k][0] }; }), pembinaan: Object.keys(ST_PMB).map(function (k) { return { v: k, l: ST_PMB[k][0] }; }), izin: Object.keys(ST_IZ).map(function (k) { return { v: k, l: ST_IZ[k][0] }; }) };
      function grp() { var j = jenis.value; return j === 'pelanggaran' ? 'pelanggaran' : j === 'pembinaan' ? 'pembinaan' : /^izin/.test(j) ? 'izin' : ''; }
      function params() { var p = { dari: d1.value, sampai: d2.value, kelompok: kel.value, asrama_id: asr.value, q: cari.value.trim() }, g = grp(); if (g === 'pelanggaran' || jenis.value === 'kategori') p.kategori_id = kat.value; if (g) p.status = stt.value; return p; }
      function visible() { var g = grp(), j = jenis.value; kat.hidden = !(g === 'pelanggaran' || j === 'kategori'); stt.hidden = !g; stt.innerHTML = ''; stt.appendChild(h('option', { value: '', text: 'Status: semua' })); (STS[g] || []).forEach(function (o) { stt.appendChild(h('option', { value: o.v, text: o.l })); }); cari.hidden = j === 'rekap'; kel.hidden = asr.hidden = j === 'rekap'; }
      function run() {
        if (!!d1.value !== !!d2.value) return; var p = params();
        api('GET', '/keamanan/laporan/' + jenis.value + qs(p)).then(function (rep) { out.innerHTML = ''; out.appendChild(renderRep(rep)); links.innerHTML = ''; var b = qs(p), sep = b ? '&' : '?'; links.appendChild(btn('Cetak', function () { cetakModal(jenis.value, p); }, { ghost: true })); links.appendChild(h('a', { class: 'btn btn--ghost', href: '/api/sima/keamanan/laporan/' + jenis.value + b + sep + 'format=pdf', download: '', text: 'Unduh PDF' })); links.appendChild(h('a', { class: 'btn', href: '/api/sima/keamanan/laporan/' + jenis.value + b + sep + 'format=xlsx', download: '', text: 'Unduh Excel' })); }).catch(function (e) { errBox(out, e); });
      }
      var tm; jenis.addEventListener('change', function () { visible(); run(); }); [d1, d2, kel, asr, kat, stt].forEach(function (e) { e.addEventListener('change', run); }); cari.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(run, 350); });
      P.body.appendChild(h('div', { class: 'tools tools--start' }, jenis, h('span', { class: 'tools tools--start' }, d1, h('span', { text: 's.d.' }), d2), kel, asr, kat, stt, cari)); P.body.appendChild(links); P.body.appendChild(out); visible(); run(); return P.el;
    });
  }

  // ---------- pengaturan (Super Admin) ----------
  function viewPengaturan() {
    if (!isSA()) return Promise.resolve(X.denied());
    var P = page('pengaturan', 'Pengaturan Keamanan', 'Hanya Super Admin. Kategori, jenis, alur, dan format nomor dimulai kosong/netral — tidak ada sanksi, denda, atau batas waktu bawaan.');
    function load() {
      return api('GET', '/keamanan/pengaturan').then(function (s) {
        var box = h('div', { class: 'stack-g' });
        function daftar(title, help, path, rows, withJenis, withKet) {
          var sec = h('section', { class: 'panel stack-s' }, h('h2', { text: title }), h('p', { class: 'muted', text: help }));
          sec.appendChild(X.table([{ t: 'Nama', f: function (r) { return h('span', null, r.nama, withJenis ? h('small', { class: 'muted', text: ' · ' + (r.jenis === 'pulang' ? 'izin pulang' : 'izin keluar') }) : null); } }, { t: 'Status', f: function (r) { return pill(r.aktif ? 'Aktif' : 'Nonaktif', r.aktif ? 'ok' : 'off'); } }, { t: 'Aksi', f: function (r) { return h('div', { class: 'acts' }, btn('Ubah nama', function () { ubah(r); }, { ghost: true, sm: true }), btn(r.aktif ? 'Nonaktifkan' : 'Aktifkan', function () { api('PATCH', '/keamanan/' + path + '/' + r.id, { aktif: !r.aktif }).then(function () { toast('Diperbarui.'); refresh(); }).catch(fail); }, { ghost: true, sm: true })); } }], rows, empty('Belum ada data', 'Klik “Tambah” untuk membuat. Tidak ada data bawaan.', 'gear')));
          function ubah(r) { formModal('Ubah nama', [{ k: 'nama', label: 'Nama', req: true, val: r.nama, max: 100 }], { ok: 'Nama diperbarui.', submit: function (v) { return api('PATCH', '/keamanan/' + path + '/' + r.id, { nama: v.nama }); }, done: refresh }); }
          sec.insertBefore(btn('Tambah', function () { var defs = [{ k: 'nama', label: 'Nama', req: true, max: 100 }]; if (withJenis) defs.push({ k: 'jenis', label: 'Untuk', type: 'select', options: [{ v: 'keluar', l: 'Izin keluar pondok' }, { v: 'pulang', l: 'Izin pulang' }], req: true }); if (withKet) defs.push({ k: 'keterangan', label: 'Keterangan', type: 'area', max: 300 }); formModal('Tambah ' + title.toLowerCase(), defs, { ok: 'Ditambahkan.', submit: function (v) { v.konfirmasi = true; return api('POST', '/keamanan/' + path, v); }, done: refresh }); }, { icon: 'plus', sm: true }), sec.children[2]); return sec;
        }
        box.appendChild(daftar('Kategori pelanggaran', 'Dipakai saat mencatat pelanggaran. Nonaktifkan agar tidak muncul lagi tanpa menghapus riwayat.', 'kategori-pelanggaran', s.kategori_pelanggaran, false, true));
        box.appendChild(daftar('Jenis pembinaan', 'Bentuk pembinaan yang dapat dipilih petugas.', 'jenis-pembinaan', s.jenis_pembinaan, false, false));
        box.appendChild(daftar('Jenis perizinan', 'Jenis izin keluar pondok dan izin pulang.', 'jenis-izin', s.jenis_izin, true, false));
        // alur & ambang
        var ak = selectEl([{ v: 'wajib', l: 'Wajib persetujuan' }, { v: 'langsung', l: 'Langsung disetujui' }]), ap = selectEl([{ v: 'wajib', l: 'Wajib persetujuan' }, { v: 'langsung', l: 'Langsung disetujui' }]), tol = h('input', { type: 'number', min: '0', max: '1440', value: s.toleransi_menit }), prg = h('input', { type: 'number', min: '1', max: '1440', value: s.peringatan_menit }); ak.value = s.alur.izin_keluar; ap.value = s.alur.izin_pulang;
        var fm = {}, fmBox = h('div', { class: 'fs__grid' }); [['pelanggaran', 'Pelanggaran'], ['pembinaan', 'Pembinaan'], ['izin_keluar', 'Izin keluar'], ['izin_pulang', 'Izin pulang']].forEach(function (k) { var p = h('input', { type: 'text', maxlength: '8', value: s.format_nomor[k[0]].prefix, 'aria-label': 'Awalan ' + k[1] }), d = h('input', { type: 'number', min: '1', max: '10', value: s.format_nomor[k[0]].digit, 'aria-label': 'Digit ' + k[1] }), r = selectEl([{ v: 'tahun', l: 'Ulang tiap tahun' }, { v: 'tidak', l: 'Tidak diulang' }]); r.value = s.format_nomor[k[0]].reset; fm[k[0]] = { p: p, d: d, r: r }; fmBox.appendChild(field('Nomor ' + k[1], h('div', { class: 'tools tools--start' }, p, d, r), 'Awalan · jumlah digit · penomoran ulang. Contoh: ' + s.format_nomor[k[0]].prefix + '-' + new Date().getFullYear() + '-' + '000001'.slice(-s.format_nomor[k[0]].digit))); });
        var note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' });
        box.appendChild(h('section', { class: 'panel stack-s' }, h('h2', { text: 'Alur persetujuan, ambang, dan format nomor' }), note, h('div', { class: 'fs__grid' }, field('Alur izin keluar pondok', ak), field('Alur izin pulang', ap), field('Toleransi keterlambatan (menit)', tol, '0 = terlambat begitu lewat jadwal. Isi sesuai ketentuan pondok.'), field('Penanda “jadwal kembali mendekat” (menit)', prg, 'Hanya penanda visual di monitoring.')), fmBox, btn('Simpan pengaturan', function (ev) {
          var fn = {}; Object.keys(fm).forEach(function (k) { fn[k] = { prefix: fm[k].p.value.trim(), digit: fm[k].d.value, reset: fm[k].r.value }; });
          X.confirmDialog({ title: 'Simpan pengaturan?', text: 'Berlaku untuk catatan berikutnya. Perubahan tercatat di log.', reason: 'optional', reasonLabel: 'Alasan (opsional)', confirmLabel: 'Ya, simpan' }).then(function (c) { if (!c) return; ev.target.disabled = true; api('PUT', '/keamanan/pengaturan', { alur: { izin_keluar: ak.value, izin_pulang: ap.value }, toleransi_menit: tol.value, peringatan_menit: prg.value, format_nomor: fn, alasan: c.alasan || '' }).then(function () { toast('Pengaturan disimpan.'); ev.target.disabled = false; REF = null; }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message + Object.keys(e.fields || {}).map(function (k) { return ' • ' + e.fields[k]; }).join(''); }); });
        })));
        // identitas
        var nm = h('input', { type: 'text', maxlength: '150', value: s.identitas.nama }), al = h('textarea', { rows: '2', maxlength: '300' }), kn = h('input', { type: 'text', maxlength: '100', value: s.identitas.kontak }), ct = h('textarea', { rows: '2', maxlength: '300' }), n2 = h('div', { class: 'note note--bad', hidden: true, role: 'alert' }); al.value = s.identitas.alamat; ct.value = s.identitas.catatan;
        box.appendChild(h('section', { class: 'panel stack-s' }, h('h2', { text: 'Identitas pondok pada laporan' }), h('p', { class: 'muted', text: 'Tampil pada kop laporan cetak, PDF, dan Excel. Kosongkan alamat/kontak bila belum ada; tidak diisi otomatis.' }), n2, h('div', { class: 'fs__grid' }, field('Nama pondok', nm), field('Kontak', kn, 'Belum diisi bila kosong'), field('Alamat', al, null, true), field('Catatan kaki laporan', ct, null, true)), btn('Simpan identitas', function (ev) { ev.target.disabled = true; api('PUT', '/keamanan/pengaturan', { identitas: { nama: nm.value.trim(), alamat: al.value.trim(), kontak: kn.value.trim(), catatan: ct.value.trim() } }).then(function () { ev.target.disabled = false; n2.hidden = true; toast('Identitas disimpan.'); REF = null; }).catch(function (e) { ev.target.disabled = false; n2.hidden = false; n2.textContent = e.message + Object.keys(e.fields || {}).map(function (k) { return ' • ' + e.fields[k]; }).join(''); }); })));
        // audit
        var au = h('section', { class: 'panel stack-s' }, h('h2', { text: 'Riwayat aktivitas modul Keamanan' })), alv = X.listView({ endpoint: '/keamanan/audit', search: false, size: 15, cols: [{ t: 'Waktu', f: function (r) { return wib(Number(r.waktu)); } }, { t: 'Pengguna', k: 'username' }, { t: 'Bagian', k: 'entitas' }, { t: 'Aksi', k: 'aksi' }, { t: 'Keterangan', f: function (r) { return r.ket + (r.alasan ? ' — ' + r.alasan : ''); } }], emptyEl: empty('Belum ada aktivitas', 'Aktivitas muncul setelah ada catatan.', 'list'), filters: [{ k: 'entitas', label: 'Bagian', options: ['pelanggaran', 'pembinaan', 'izin', 'pengaturan'].map(function (x) { return { v: x, l: x }; }) }] }); au.appendChild(alv.el); box.appendChild(au);
        return box;
      });
    }
    var holder = h('div'); function refresh() { load().then(function (b) { holder.innerHTML = ''; holder.appendChild(b); }).catch(function (e) { errBox(holder, e); }); }
    P.body.appendChild(holder); refresh(); return Promise.resolve(P.el);
  }

  var VIEWS = { dashboard: viewDashboard, pelanggaran: viewPelanggaran, pembinaan: viewPembinaan, 'izin-keluar': function () { return viewIzin('keluar'); }, 'izin-pulang': function () { return viewIzin('pulang'); }, monitoring: viewMonitoring, santri: viewSantri, laporan: viewLaporan, pengaturan: viewPengaturan };
  X.views.keamanan = function (p, q) { var k = p[0] || 'dashboard'; if (!VIEWS[k]) k = 'dashboard'; return VIEWS[k](k === 'santri' ? p.slice(1) : q || {}, k === 'santri' ? q : undefined); };
  X.kit = { field: field, selectEl: selectEl, formModal: formModal, kv: kv, auditList: auditList, printNode: printNode, opts: opts, countBars: countBars, hBars: hBars, chartBox: chartBox, wib: wib, lblBln: lblBln };
  X.views.keamananDashboard = function () { return viewDashboard({}, true); };
})();
