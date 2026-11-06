/* SIMA - Tahap 7: Pusat Laporan, Pengaturan Sistem (identitas, sesi, backup & pemulihan, konsistensi data, kesiapan, hak akses),
   Aktivitas Sistem terfilter, ubah password, dan keamanan akun (sesi, riwayat login, pemulihan akun). Semua angka berasal dari API. */
(function () {
  'use strict';
  var X = window.SIMA, K = X.kit, h = X.h, api = X.api, toast = X.toast, empty = X.empty, btn = X.btn, fmtDate = X.fmtDate, qs = X.qs, pill = X.pill;
  var field = K.field, selectEl = K.selectEl, formModal = K.formModal, wib = K.wib;
  function fail(e) { toast(e.message, true); }
  var rp = function (n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); };
  var fmtSize = function (b) { b = Number(b || 0); return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? Math.round(b / 1024) + ' KB' : b + ' B'; };
  function errBox(box, e) { box.innerHTML = ''; box.appendChild(X.errNote(e)); }
  function lbl(text, input, help) { return h('div', { class: 'field' }, h('label', { text: text }), input, help ? h('small', { class: 'muted', text: help }) : null); }
  function noteBox() { return h('div', { class: 'note note--bad', hidden: true, role: 'alert' }); }
  function showNote(n, e) { n.hidden = false; n.textContent = e.message + ' ' + Object.keys(e.fields || {}).map(function (k) { return e.fields[k]; }).join(' '); }

  // ================= ubah password (sendiri) & wajib ganti =================
  var pwOpen = false;
  X.pwModal = function (force) {
    if (pwOpen) return; pwOpen = true;
    var lama = h('input', { type: 'password', autocomplete: 'current-password', maxlength: '200' }), baru = h('input', { type: 'password', autocomplete: 'new-password', maxlength: '200' }), ulang = h('input', { type: 'password', autocomplete: 'new-password', maxlength: '200' }), note = noteBox();
    var m = X.modal(force ? 'Ganti password sementara' : 'Ubah password', [note, force ? h('p', { class: 'note note--warn', text: 'Akun Anda memakai password sementara. Buat password baru sebelum melanjutkan.' }) : null,
      lbl('Password saat ini', lama), lbl('Password baru (min. 12 karakter, huruf besar, huruf kecil, angka)', baru), lbl('Ulangi password baru', ulang), h('p', { class: 'muted', text: 'Setelah diubah, sesi login Anda di perangkat lain akan diakhiri.' })],
      function (close) { return [force ? null : btn('Batal', close, { ghost: true }), btn('Simpan password', function (ev) {
        if (baru.value !== ulang.value) { note.hidden = false; note.textContent = 'Password baru dan ulangannya tidak sama.'; return; }
        ev.target.disabled = true; api('POST', '/me/password', { lama: lama.value, baru: baru.value }).then(function () { X.S.user.wajib_ganti = false; close(); toast('Password berhasil diubah.'); X.route(); }).catch(function (e) { ev.target.disabled = false; showNote(note, e); });
      })]; }, { sticky: !!force, onClose: function () { pwOpen = false; if (X.S.user && X.S.user.wajib_ganti) { api('POST', '/auth/logout', {}).catch(function () { }).then(function () { location.reload(); }); } } });
    return m;
  };
  X.forcePw = function () { X.pwModal(true); };

  // ================= keamanan akun (Super Admin): sesi, riwayat login, pemulihan =================
  X.akunKeamanan = function (u, reload) {
    var sesiBox = h('div', { class: 'stack-s' }), rwBox = h('div', { class: 'stack-s' });
    function loadSesi() { api('GET', '/users/' + u.id + '/sesi').then(function (d) { sesiBox.innerHTML = ''; sesiBox.appendChild(d.rows.length ? X.table([{ t: 'Mulai', f: function (r) { return X.fmtTime(r.dibuat); } }, { t: 'Aktivitas terakhir', f: function (r) { return X.fmtTime(r.aktivitas); } }, { t: 'Alamat IP', f: function (r) { return r.ip || '—'; } }, { t: 'Perangkat', f: function (r) { return (r.ua || '—').slice(0, 60) + (r.ini ? ' (sesi Anda)' : ''); } }], d.rows) : empty('Tidak ada sesi aktif', 'Akun ini sedang tidak login.', 'list')); }).catch(function (e) { errBox(sesiBox, e); }); }
    function loadRw() { api('GET', '/users/' + u.id + '/riwayat-login').then(function (d) { rwBox.innerHTML = ''; rwBox.appendChild(d.rows.length ? X.table([{ t: 'Waktu', f: function (r) { return X.fmtTime(r.waktu); } }, { t: 'Kejadian', f: function (r) { return r.aksi.replace(/_/g, ' '); } }, { t: 'Keterangan', k: 'keterangan' }, { t: 'IP', f: function (r) { return r.ip || '—'; } }], d.rows) : empty('Belum ada riwayat', '', 'list')); }).catch(function (e) { errBox(rwBox, e); }); }
    var acts = h('div', { class: 'tools tools--start' },
      btn('Akhiri semua sesi', function () { X.confirmDialog({ title: 'Akhiri semua sesi?', text: 'Akun ' + u.username + ' harus login ulang di semua perangkat.', confirmLabel: 'Ya, akhiri' }).then(function (c) { if (c) api('POST', '/users/' + u.id + '/sesi/akhiri', { konfirmasi: true }).then(function (r) { toast(r.diakhiri + ' sesi diakhiri.'); loadSesi(); }).catch(fail); }); }, { ghost: true }),
      u.terkunci ? btn('Buka kunci login', function () { api('POST', '/users/' + u.id + '/buka-kunci', { konfirmasi: true }).then(function () { toast('Kunci login dibuka.'); loadRw(); if (reload) reload(); }).catch(fail); }, { ghost: true }) : null,
      btn('Buat password sementara', function () {
        X.confirmDialog({ title: 'Buat password sementara?', text: 'Password lama akun ' + u.username + ' tidak berlaku lagi, semua sesi diakhiri, dan pemilik akun wajib membuat password baru saat login. Password sementara hanya ditampilkan sekali.', confirmLabel: 'Ya, buat', danger: true }).then(function (c) {
          if (!c) return; api('POST', '/users/' + u.id + '/pemulihan', { konfirmasi: true }).then(function (r) {
            var box = h('code', { class: 'pw-once', text: r.password_sementara });
            X.modal('Password sementara', [h('p', { text: 'Berikan password ini kepada pemilik akun ' + r.username + ' melalui saluran yang aman. Password tidak akan ditampilkan lagi dan tidak disimpan dalam log.' }), box], function (close) { return [btn('Salin', function () { if (navigator.clipboard) navigator.clipboard.writeText(r.password_sementara).then(function () { toast('Disalin.'); }); }, { ghost: true }), btn('Selesai', close)]; }, { sticky: true });
            if (reload) reload();
          }).catch(fail);
        });
      }, { danger: true }));
    X.modal('Keamanan akun: ' + u.username, [acts, h('h3', { text: 'Sesi aktif' }), sesiBox, h('h3', { text: 'Riwayat login & perubahan password (50 terakhir)' }), rwBox], function (close) { return [btn('Tutup', close)]; }, { wide: true });
    loadSesi(); loadRw();
  };

  // ================= Pusat Laporan =================
  function renderRep(rep) {
    var box = h('div', { class: 'receipt receipt--rep' }, h('header', null, h('b', { text: rep.pondok }), rep.alamat ? h('small', { text: rep.alamat }) : null, h('span', { text: rep.judul })), h('p', { class: 'muted', text: (rep.filter || []).join(' | ') }));
    var fm = function (c, v, i) { if (c.tipe === 'no') return String(i + 1); return v == null || v === '' ? '' : c.tipe === 'tgl' ? fmtDate(v) : c.tipe === 'rp' ? rp(v) : String(v); };
    var cols = rep.kolom.map(function (c) { return { t: c.t, f: function (r, i) { return fm(c, r[c.k], i); } }; });
    box.appendChild(h('div', { class: 'scroll' }, X.table(cols, rep.rows, empty('Tidak ada data', 'Tidak ada catatan pada filter ini.', 'list'))));
    if (rep.ringkasan && rep.ringkasan.length) box.appendChild(h('dl', { class: 'receipt__dl sum' }, rep.ringkasan.reduce(function (a, s) { a.push(h('dt', { text: s[0] }), h('dd', { class: 'strong', text: s[2] === 'rp' ? rp(s[1]) : String(s[1]) })); return a; }, [])));
    if (rep.catatan) box.appendChild(h('p', { class: 'muted', text: rep.catatan }));
    if (rep.terpotong) box.appendChild(h('p', { class: 'note note--warn', text: 'Tampilan layar dibatasi 2.000 baris dari ' + rep.total + '. PDF dan Excel memuat seluruh data sesuai filter.' }));
    box.appendChild(h('p', { class: 'muted print-only', text: 'Dicetak ' + wib(Date.now()) + ' oleh ' + X.S.user.username }));
    return box;
  }
  function viewLaporan() {
    var wrap = h('div', { class: 'stack-g' }, X.head('Pusat Laporan', 'Laporan dikelompokkan per bidang. Pilih laporan, atur filter, lalu tampilkan, cetak, atau unduh PDF/Excel. Unduhan selalu mengikuti filter yang dipilih.'));
    return Promise.all([api('GET', '/laporan/katalog'), api('GET', '/laporan/ref')]).then(function (rs) {
      var kat = rs[0], ref = rs[1], cur = null, groupId = kat.kelompok[0] && kat.kelompok[0].id, selId = null;
      var tabs = h('nav', { class: 'tabs tabs--wrap', 'aria-label': 'Kelompok laporan' }), list = h('div', { class: 'stack-s' }), form = h('div', { class: 'stack-s' }), out = h('div', { class: 'stack-s' });
      function endpoint(item) { return item.sumber ? item.sumber : '/laporan/data/' + item.id; }
      function drawTabs() { tabs.innerHTML = ''; kat.kelompok.forEach(function (g) { tabs.appendChild(h('button', { type: 'button', class: 'tab' + (g.id === groupId ? ' is-on' : ''), text: g.judul, onclick: function () { groupId = g.id; selId = null; cur = null; drawTabs(); drawList(); form.innerHTML = ''; out.innerHTML = ''; } })); }); }
      function drawList() {
        list.innerHTML = ''; var g = kat.kelompok.filter(function (x) { return x.id === groupId; })[0]; if (!g) return;
        if (g.catatan) list.appendChild(h('p', { class: 'note note--warn', text: g.catatan }));
        g.sub.forEach(function (s) { list.appendChild(h('h3', { text: s.judul })); list.appendChild(h('div', { class: 'tools tools--start' }, s.items.map(function (i) { return h('button', { type: 'button', class: 'btn btn--sm' + (i.id === selId ? '' : ' btn--ghost'), 'aria-pressed': i.id === selId ? 'true' : 'false', text: i.judul, onclick: function () { selId = i.id; cur = i; drawList(); drawForm(); out.innerHTML = ''; } }); }))); });
      }
      var inputs = {};
      function control(f) {
        var el;
        if (f.type === 'date') el = h('input', { type: 'date', max: f.k === 'dari' || f.k === 'sampai' ? '' : null });
        else if (f.type === 'text') el = h('input', { type: 'text', maxlength: '80' });
        else if (f.type === 'select') { el = selectEl(f.options.map(function (o) { return { v: o[0], l: o[1] }; }), f.def ? null : 'Semua'); if (f.def) el.value = f.def; }
        else el = selectEl((ref[f.ref] || []).map(function (o) { return { v: o.id, l: o.nama }; }), 'Semua');
        inputs[f.k] = el; return lbl(f.label, el);
      }
      function params() { var p = {}; Object.keys(inputs).forEach(function (k) { if (inputs[k].value) p[k] = inputs[k].value; }); return p; }
      function drawForm() {
        form.innerHTML = ''; inputs = {}; if (!cur) return;
        var fs = cur.filter.filter(function (f, i, a) { return a.findIndex(function (z) { return z.k === f.k; }) === i; });
        form.appendChild(h('section', { class: 'panel stack-s' }, h('h3', { text: cur.judul }), fs.length ? h('div', { class: 'fs__grid' }, fs.map(control)) : h('p', { class: 'muted', text: 'Laporan ini tidak memiliki filter (menampilkan kondisi saat ini).' }),
          h('div', { class: 'tools tools--start' }, btn('Tampilkan', function () { tampil(false); }), btn('Cetak', function () { tampil(true); }, { ghost: true }), h('a', { class: 'btn btn--ghost', id: 'dlpdf', href: '#', text: 'Unduh PDF' }), h('a', { class: 'btn btn--ghost', id: 'dlxlsx', href: '#', text: 'Unduh Excel' }))));
        var upd = function () { var p = params(); document.getElementById('dlpdf').href = '/api/sima' + endpoint(cur) + qs(Object.assign({ format: 'pdf' }, p)); document.getElementById('dlxlsx').href = '/api/sima' + endpoint(cur) + qs(Object.assign({ format: 'xlsx' }, p)); };
        Object.keys(inputs).forEach(function (k) { inputs[k].addEventListener('change', upd); inputs[k].addEventListener('input', upd); }); upd();
      }
      function tampil(cetak) {
        out.innerHTML = ''; out.appendChild(h('p', { class: 'muted', role: 'status', text: 'Memuat laporan…' }));
        api('GET', endpoint(cur) + qs(params())).then(function (rep) {
          if (cetak) { out.innerHTML = ''; X.modal(rep.judul, [renderRep(rep)], function (close) { return [btn('Cetak', K.printNode), btn('Tutup', close, { ghost: true })]; }, { wide: true }); return; }
          out.innerHTML = ''; out.appendChild(h('section', { class: 'panel' }, renderRep(rep)));
        }).catch(function (e) { errBox(out, e); });
      }
      drawTabs(); drawList(); wrap.appendChild(h('section', { class: 'panel stack-s' }, tabs, list)); wrap.appendChild(form); wrap.appendChild(out);
      if (!kat.kelompok.length) wrap.appendChild(empty('Tidak ada laporan', 'Role Anda belum memiliki laporan.', 'chart'));
      return wrap;
    });
  }
  X.views.laporan = function () { return viewLaporan(); };

  // ================= Aktivitas Sistem (log terpusat) =================
  function viewLog(p, q) {
    var st = { page: Math.max(1, parseInt(p[0], 10) || 1), q: '', modul: '', aksi: '', role: '', dari: '', sampai: '' }, body = h('div', { class: 'stack-s' });
    return api('GET', '/log/ref').then(function (ref) {
      var fq = h('input', { type: 'search', placeholder: 'Cari akun atau keterangan…', maxlength: '80', 'aria-label': 'Cari log' }), fm = selectEl(ref.modul.map(function (x) { return { v: x, l: x }; }), 'Semua modul'), fa = selectEl(ref.aksi.map(function (x) { return { v: x, l: x.replace(/_/g, ' ') }; }), 'Semua aktivitas'),
        fr = selectEl([{ v: 'super_admin', l: 'Super Admin' }, { v: 'bendahara', l: 'Bendahara' }, { v: 'keamanan', l: 'Keamanan' }], 'Semua role'), d1 = h('input', { type: 'date', 'aria-label': 'Dari tanggal' }), d2 = h('input', { type: 'date', 'aria-label': 'Sampai tanggal' });
      function params() { return { q: fq.value.trim(), modul: fm.value, aksi: fa.value, role: fr.value, dari: d1.value, sampai: d2.value }; }
      function load() {
        api('GET', '/log' + qs(Object.assign({ page: st.page }, params()))).then(function (d) {
          var pages = Math.max(1, Math.ceil(d.total / d.size)); body.innerHTML = '';
          body.appendChild(h('p', { class: 'muted', text: d.total + ' catatan. Catatan tidak dapat diubah atau dihapus.' }));
          body.appendChild(h('div', { class: 'scroll' }, X.table([{ t: 'Waktu', f: function (r) { return X.fmtTime(r.waktu); } }, { t: 'Akun', k: 'username' }, { t: 'Role', f: function (r) { return r.role ? { super_admin: 'Super Admin', bendahara: 'Bendahara', keamanan: 'Keamanan' }[r.role] : '—'; } }, { t: 'Aktivitas', f: function (r) { return r.aksi.replace(/_/g, ' '); } }, { t: 'Modul', k: 'modul' }, { t: 'Keterangan', k: 'keterangan' }, { t: 'IP', f: function (r) { return r.ip || '—'; } }], d.rows, empty('Tidak ada catatan', 'Tidak ada aktivitas yang cocok dengan filter.', 'list'))));
          body.appendChild(h('div', { class: 'tools' }, h('span', { text: 'Halaman ' + d.page + ' dari ' + pages }), h('div', { class: 'acts' }, btn('← Baru', function () { st.page = Math.max(1, st.page - 1); load(); }, { ghost: true, sm: true }), btn('Lama →', function () { st.page = Math.min(pages, st.page + 1); load(); }, { ghost: true, sm: true }))));
        }).catch(function (e) { errBox(body, e); });
      }
      [fm, fa, fr, d1, d2].forEach(function (e) { e.addEventListener('change', function () { st.page = 1; load(); }); }); var t; fq.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { st.page = 1; load(); }, 300); });
      load();
      return h('div', { class: 'stack-g' }, X.head('Aktivitas Sistem', 'Log terpusat seluruh modul: login, perubahan data, transaksi, perizinan, publikasi, pengaturan, backup, dan pemulihan.'),
        h('section', { class: 'panel stack-s' }, h('div', { class: 'tools tools--start' }, fq, fm, fa, fr, d1, d2), h('div', { class: 'tools tools--start' },
          h('a', { class: 'btn btn--ghost btn--sm', id: 'logxlsx', href: '#', text: 'Unduh Excel', onclick: function (ev) { ev.target.href = '/api/sima/log' + qs(Object.assign({ format: 'xlsx' }, params())); } }), h('a', { class: 'btn btn--ghost btn--sm', href: '#', text: 'Unduh PDF', onclick: function (ev) { ev.target.href = '/api/sima/log' + qs(Object.assign({ format: 'pdf' }, params())); } })), body));
    });
  }
  X.views.log = viewLog;

  // ================= Pengaturan Sistem =================
  var TABS = [['identitas', 'Identitas Pondok'], ['sesi', 'Sesi & Keamanan'], ['backup', 'Backup & Pemulihan'], ['konsistensi', 'Konsistensi Data'], ['kesiapan', 'Kesiapan Produksi'], ['akses', 'Hak Akses'], ['info', 'Info Sistem']];
  function viewPengaturan(p) {
    var tab = p[0] && TABS.some(function (t) { return t[0] === p[0]; }) ? p[0] : 'identitas', body = h('div', { class: 'stack-s' });
    var nav = h('nav', { class: 'tabs tabs--wrap', 'aria-label': 'Pengaturan' }, TABS.map(function (t) { return h('a', { class: 'tab' + (t[0] === tab ? ' is-on' : ''), href: '#/pengaturan/' + t[0], text: t[1] }); }));
    var map = { identitas: tabIdentitas, sesi: tabSesi, backup: tabBackup, konsistensi: tabKonsistensi, kesiapan: tabKesiapan, akses: tabAkses, info: tabInfo };
    return Promise.resolve(map[tab](body)).then(function () { return h('div', { class: 'stack-g' }, X.head('Pengaturan Sistem', 'Hanya Super Admin. Setiap perubahan tercatat di Aktivitas Sistem.'), h('section', { class: 'panel stack-s' }, nav, body)); });
  }
  function simpanPengaturan(payload, note, btnEl) {
    btnEl.disabled = true; note.hidden = true;
    return api('PUT', '/pengaturan', Object.assign({ konfirmasi: true }, payload)).then(function () { btnEl.disabled = false; toast('Pengaturan disimpan.'); }).catch(function (e) { btnEl.disabled = false; showNote(note, e); });
  }
  function tabIdentitas(body) {
    return api('GET', '/pengaturan').then(function (d) {
      var i = d.identitas, nama = h('input', { type: 'text', maxlength: '150', value: i.nama || '' }), alamat = h('input', { type: 'text', maxlength: '300', value: i.alamat || '' }), kontak = h('input', { type: 'text', maxlength: '150', value: i.kontak || '' }), cat = h('input', { type: 'text', maxlength: '300', value: i.catatan || '' }), note = noteBox();
      body.appendChild(h('p', { class: 'muted', text: 'Identitas ini tampil pada kop laporan, PDF, dan Excel di seluruh modul.' })); body.appendChild(note);
      body.appendChild(h('div', { class: 'fs__grid' }, lbl('Nama pondok', nama), lbl('Alamat', alamat), lbl('Kontak (telepon/email)', kontak), lbl('Catatan kop laporan', cat)));
      body.appendChild(h('div', { class: 'tools tools--end' }, btn('Simpan identitas', function (ev) { simpanPengaturan({ identitas: { nama: nama.value, alamat: alamat.value, kontak: kontak.value, catatan: cat.value } }, note, ev.target); })));
    });
  }
  function tabSesi(body) {
    return api('GET', '/pengaturan').then(function (d) {
      var s = d.sesi, b = d.sesi_batas, note = noteBox(), I = {}; var defs = [['idle_menit', 'Batas tidak aktif (menit)', 'Sesi berakhir bila tidak ada aktivitas selama ini.'], ['mutlak_jam', 'Masa sesi maksimum (jam)', 'Sesi berakhir setelah waktu ini walau aktif.'], ['maks_gagal', 'Gagal login sebelum akun dikunci', ''], ['kunci_menit', 'Lama penguncian akun (menit)', '']];
      body.appendChild(note); body.appendChild(h('div', { class: 'fs__grid' }, defs.map(function (x) { I[x[0]] = h('input', { type: 'number', min: b[x[0]][0], max: b[x[0]][1], value: s[x[0]] }); return lbl(x[1] + ' (' + b[x[0]][0] + '–' + b[x[0]][1] + ')', I[x[0]], x[2]); })));
      body.appendChild(h('p', { class: 'muted', text: 'Password disimpan sebagai hash bcrypt; cookie sesi HttpOnly + SameSite Strict + Secure (produksi); setiap permintaan perubahan memerlukan token CSRF; percobaan login dibatasi per akun dan per alamat IP.' }));
      body.appendChild(h('div', { class: 'tools tools--end' }, btn('Simpan pengaturan sesi', function (ev) { var v = {}; Object.keys(I).forEach(function (k) { v[k] = Number(I[k].value); }); simpanPengaturan({ sesi: v }, note, ev.target); })));
    });
  }
  function tabAkses(body) {
    return api('GET', '/pengaturan').then(function (d) {
      body.appendChild(h('p', { class: 'muted', text: 'Sistem hanya memiliki tiga role (tidak dapat ditambah). Akses ditegakkan di server pada setiap API, bukan hanya pada menu.' }));
      body.appendChild(h('div', { class: 'scroll' }, X.table([{ t: 'Role', k: 'label' }, { t: 'Modul yang dapat diakses', f: function (r) { return r.modul.join(', '); } }], d.hak_akses)));
    });
  }
  function tabInfo(body) {
    return api('GET', '/pengaturan').then(function (d) { body.appendChild(K.kv([['Versi aplikasi', d.versi], ['Jumlah role', String(d.hak_akses.length)], ['Zona waktu tampilan', 'WIB (UTC+7)']])); body.appendChild(h('p', { class: 'muted', text: 'Panduan pengguna, dokumentasi teknis, dan prosedur pemulihan ada pada folder docs/ di paket aplikasi.' })); });
  }
  function tabKonsistensi(body) {
    function load() {
      body.innerHTML = ''; body.appendChild(h('p', { class: 'muted', role: 'status', text: 'Memeriksa konsistensi data…' }));
      return api('GET', '/pengaturan/konsistensi').then(function (d) {
        body.innerHTML = '';
        body.appendChild(h('div', { class: 'stats' }, [X.stat('Pemeriksaan', d.rows.length, 'dijalankan ' + X.fmtTime(d.diperiksa)), X.stat('Sesuai', d.ringkas.ok, ''), X.stat('Perlu perhatian', d.ringkas.perhatian, d.ringkas.perhatian ? 'lihat rincian' : ''), X.stat('Gagal diperiksa', d.ringkas.error, '')]));
        body.appendChild(h('div', { class: 'scroll' }, X.table([{ t: 'Pemeriksaan', f: function (r) { return h('div', null, h('b', { text: r.judul }), h('small', { class: 'muted kt-slug', text: r.ket })); } }, { t: 'Hasil', f: function (r) { return pill(r.status === 'ok' ? 'Sesuai' : r.status === 'perhatian' ? r.masalah + ' temuan' : 'Gagal diperiksa', r.status === 'ok' ? 'ok' : 'off'); } }, { t: 'Contoh temuan', f: function (r) { return r.contoh && r.contoh.length ? r.contoh.map(function (c) { return Object.keys(c).map(function (k) { return k + ': ' + c[k]; }).join(', '); }).join(' · ') : '—'; } }], d.rows)));
        body.appendChild(h('div', { class: 'tools tools--end' }, btn('Periksa ulang', load, { ghost: true })));
      }).catch(function (e) { errBox(body, e); });
    }
    return load();
  }
  function tabKesiapan(body) {
    return api('GET', '/pengaturan/kesiapan').then(function (d) {
      body.appendChild(h('p', { class: 'muted', text: 'Nilai rahasia (URL database, kunci) tidak pernah ditampilkan; hanya status tersedia/belum.' }));
      body.appendChild(h('div', { class: 'scroll' }, X.table([{ t: 'Item', k: 'judul' }, { t: 'Status', f: function (r) { return pill(r.status === 'ok' ? 'Siap' : r.status === 'perhatian' ? 'Perlu perhatian' : 'Informasi', r.status === 'ok' ? 'ok' : r.status === 'perhatian' ? 'off' : 'info'); } }, { t: 'Keterangan', k: 'ket' }], d.rows)));
    });
  }

  // ----- Backup & pemulihan -----
  function tabBackup(body) {
    function load() {
      body.innerHTML = '';
      return Promise.all([api('GET', '/backup'), api('GET', '/pengaturan')]).then(function (rs) {
        var d = rs[0], set = rs[1].backup, hari = rs[1].hari, note = noteBox();
        body.appendChild(h('div', { class: 'stats' }, [X.stat('Backup terverifikasi terakhir', d.terakhir_berhasil ? X.fmtTime(d.terakhir_berhasil) : 'Belum ada', d.terakhir_berhasil ? 'paket lengkap (database + berkas)' : 'buat backup pertama'), X.stat('Total ukuran tersimpan', fmtSize(d.total_ukuran), 'di penyimpanan aman server'), X.stat('Backup otomatis', set.otomatis ? 'Aktif' : 'Tidak aktif', set.otomatis ? set.frekuensi : ''), X.stat('Jadwal otomatis siap', d.cron_siap ? 'Ya' : 'Belum', d.cron_siap ? '' : 'CRON_SECRET belum diatur')]));
        body.appendChild(h('p', { class: 'note note--warn', text: 'Backup disimpan di basis data yang sama dengan data utama dan hanya dapat diakses Super Admin. Untuk perlindungan dari kehilangan basis data, unduh berkas backup secara berkala dan simpan di tempat terpisah (lihat docs/PEMULIHAN.md).' }));
        var busy = false;
        body.appendChild(h('div', { class: 'tools tools--start' }, btn('Buat backup sekarang', function (ev) {
          if (busy) return; X.confirmDialog({ title: 'Buat backup sekarang?', text: 'Membuat satu paket: backup database dan backup berkas, lalu memverifikasinya. Proses beberapa detik.', confirmLabel: 'Ya, buat backup' }).then(function (c) {
            if (!c) return; busy = true; ev.target.disabled = true; ev.target.textContent = 'Membuat dan memverifikasi…';
            api('POST', '/backup', { konfirmasi: true }).then(function (r) { toast('Backup berhasil dan terverifikasi.'); load(); }).catch(function (e) { toast('Backup GAGAL: ' + e.message, true); load(); });
          });
        }, { icon: 'plus' }), btn('Terapkan retensi', function () { X.confirmDialog({ title: 'Terapkan retensi?', text: 'Isi backup lama di luar aturan retensi dibersihkan (riwayat tetap tercatat). Backup terverifikasi terbaru selalu dipertahankan.', confirmLabel: 'Ya, bersihkan' }).then(function (c) { if (c) api('POST', '/backup/bersihkan', { konfirmasi: true }).then(function (r) { toast(r.dibersihkan + ' isi backup dibersihkan.'); load(); }).catch(fail); }); }, { ghost: true })));
        // pengaturan jadwal & retensi
        var oto = h('input', { type: 'checkbox' }); oto.checked = !!set.otomatis; var fr = selectEl([{ v: 'harian', l: 'Harian' }, { v: 'mingguan', l: 'Mingguan' }, { v: 'bulanan', l: 'Bulanan (tanggal 1)' }], null); fr.value = set.frekuensi; var hr = selectEl(hari.map(function (x, i) { return { v: i, l: x }; }), null); hr.value = set.hari_minggu;
        var rj = h('input', { type: 'number', min: '3', max: '60', value: set.retensi_jumlah }), rh = h('input', { type: 'number', min: '7', max: '730', value: set.retensi_hari });
        body.appendChild(h('section', { class: 'panel stack-s' }, h('h3', { text: 'Jadwal dan retensi' }), note, h('label', { class: 'check' }, oto, 'Aktifkan backup otomatis (berjalan sekitar pukul 03.00 WIB)'), h('div', { class: 'fs__grid' }, lbl('Frekuensi', fr), lbl('Hari (untuk mingguan)', hr), lbl('Simpan paket terbaru (3–60)', rj), lbl('Simpan maksimal (hari, 7–730)', rh)),
          h('div', { class: 'tools tools--end' }, btn('Simpan jadwal', function (ev) { simpanPengaturan({ backup: { otomatis: oto.checked, frekuensi: fr.value, hari_minggu: Number(hr.value), retensi_jumlah: Number(rj.value), retensi_hari: Number(rh.value) } }, note, ev.target); }))));
        var paketOk = {}; d.rows.forEach(function (r) { var k = r.paket; paketOk[k] = paketOk[k] || { n: 0, ok: 0, ada: 0 }; paketOk[k].n++; if (r.status === 'terverifikasi') paketOk[k].ok++; if (r.ada_isi) paketOk[k].ada++; });
        var PM = { manual: 'Manual', terjadwal: 'Terjadwal', sebelum_pemulihan: 'Sebelum pemulihan', skrip: 'Skrip' };
        body.appendChild(h('h3', { text: 'Riwayat backup' }));
        body.appendChild(d.rows.length ? h('div', { class: 'scroll' }, X.table([{ t: 'Waktu', f: function (r) { return X.fmtTime(r.mulai); } }, { t: 'Jenis', f: function (r) { return (r.jenis === 'database' ? 'Database' : 'Berkas (foto/dokumen)') + ' · ' + PM[r.pemicu]; } }, { t: 'Status', f: function (r) { return pill(r.status === 'terverifikasi' ? 'Terverifikasi' : r.status === 'gagal' ? 'Gagal' : 'Berjalan', r.status === 'terverifikasi' ? 'ok' : r.status === 'gagal' ? 'off' : 'info'); } }, { t: 'Ukuran', f: function (r) { return r.ada_isi ? fmtSize(r.ukuran) : 'Dibersihkan'; } }, { t: 'Baris', f: function (r) { return r.baris == null ? '—' : String(r.baris); } }, { t: 'Oleh', k: 'petugas' }, { t: 'Keterangan', f: function (r) { return r.ket || ''; } },
          { t: 'Aksi', f: function (r) { var a = h('div', { class: 'acts' }); if (r.ada_isi) { a.appendChild(btn('Verifikasi ulang', function () { api('POST', '/backup/' + r.id + '/verifikasi', { konfirmasi: true }).then(function (x) { toast('Hasil: ' + x.status); load(); }).catch(fail); }, { ghost: true, sm: true })); if (r.status === 'terverifikasi') a.appendChild(h('a', { class: 'btn btn--ghost btn--sm', href: '/api/sima/backup/' + r.id + '/unduh', text: 'Unduh' })); }
            if (r.jenis === 'database' && r.status === 'terverifikasi' && paketOk[r.paket].n === 2 && paketOk[r.paket].ok === 2 && paketOk[r.paket].ada === 2) a.appendChild(btn('Pulihkan paket', function () { pulihDialog(r); }, { sm: true, danger: true })); return a; } }], d.rows)) : empty('Belum ada backup', 'Klik “Buat backup sekarang”.', 'box'));
      }).catch(function (e) { errBox(body, e); });
    }
    function pulihDialog(r) {
      var teks = h('input', { type: 'text', autocomplete: 'off', placeholder: 'PULIHKAN', maxlength: '20' }), pw = h('input', { type: 'password', autocomplete: 'current-password', maxlength: '200' }), note = noteBox();
      X.modal('Pulihkan data dari backup', [note, h('p', { class: 'note note--warn', text: 'PERHATIAN: seluruh data saat ini akan DIGANTI dengan data dari backup tanggal ' + X.fmtTime(r.mulai) + '. Perubahan setelah waktu tersebut akan hilang dari data aktif. Sistem otomatis membuat backup kondisi saat ini terlebih dahulu (dan membatalkan pemulihan bila backup itu gagal), sehingga pemulihan dapat dibatalkan. Semua pengguna akan keluar dan perlu login ulang.' }), h('p', { class: 'muted', text: 'Disarankan menguji pemulihan lebih dulu di lingkungan uji (docs/PEMULIHAN.md), bukan langsung di produksi tanpa kebutuhan nyata.' }),
        lbl('Ketik PULIHKAN untuk melanjutkan', teks), lbl('Password Anda', pw)], function (close) { return [btn('Batal', close, { ghost: true }), btn('Pulihkan sekarang', function (ev) {
        ev.target.disabled = true; ev.target.textContent = 'Memulihkan…'; note.hidden = true;
        api('POST', '/backup/paket/' + r.paket + '/pulihkan', { konfirmasi: true, teks: teks.value, password: pw.value }).then(function (x) { close(); toast('Pemulihan selesai (' + x.baris + ' baris). Silakan login ulang.'); setTimeout(function () { location.reload(); }, 1200); })
          .catch(function (e) { ev.target.disabled = false; ev.target.textContent = 'Pulihkan sekarang'; showNote(note, e); });
      }, { danger: true })]; }, { sticky: true });
    }
    return load();
  }

  X.views.pengaturan = viewPengaturan;
})();
