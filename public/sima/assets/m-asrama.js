/* SIMA - modul Asrama & Kamar (Putra/Putri): asrama, kamar, penempatan santri, riwayat perpindahan. */
(function () {
  'use strict';
  var X = window.SIMA, h = X.h, api = X.api, toast = X.toast, empty = X.empty, btn = X.btn;
  var KEL = { putra: 'Putra', putri: 'Putri' };
  function fail(e) { toast(e.message, true); }
  var STK = { aktif: ['Aktif', 'ok'], nonaktif: ['Nonaktif', 'off'], perbaikan: ['Perbaikan', 'info'] };
  function kPill(r) { return r.diarsipkan ? X.pill('Diarsipkan', 'info') : X.pill(STK[r.status][0], STK[r.status][1]); }
  var JENIS = { penempatan_baru: 'Penempatan baru', pindah_kamar: 'Pindah kamar', pindah_asrama: 'Pindah asrama', keluar_kamar: 'Dikeluarkan dari kamar', keluar_otomatis: 'Keluar otomatis' };

  function formModal(title, spec, values, save, onOk) {
    var form = X.buildForm(spec, values), note = h('div', { class: 'note note--bad', role: 'alert', hidden: true });
    X.modal(title, [note, form.el], function (close) {
      return [btn('Batal', close, { ghost: true }), btn('Simpan', function (ev) {
        note.hidden = true; form.errors({}); ev.target.disabled = true;
        save(form.values()).then(function (r) { close(); onOk(r); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message; form.errors(e.fields || {}); });
      })];
    }, { sticky: true });
  }
  function arsipBtn(base, r, label, reload) {
    return btn(r.diarsipkan ? 'Pulihkan' : 'Arsipkan', function () {
      var want = !r.diarsipkan;
      X.confirmDialog({ title: (want ? 'Arsipkan ' : 'Pulihkan ') + label + '?', text: want ? label.charAt(0).toUpperCase() + label.slice(1) + ' ' + r.nama + ' akan diarsipkan. Hanya dapat dilakukan bila tidak ada penghuni aktif. Data tidak dihapus.' : r.nama + ' akan dipulihkan.', danger: want, confirmLabel: want ? 'Ya, arsipkan' : 'Ya, pulihkan' })
        .then(function (c) { if (c) api('POST', base + '/' + r.id + (want ? '/arsip' : '/pulihkan'), { konfirmasi: true }).then(function () { toast(want ? 'Diarsipkan.' : 'Dipulihkan.'); reload(); }).catch(fail); });
    }, { ghost: true, sm: true });
  }

  var TABS = [['asrama', 'Asrama'], ['kamar', 'Kamar'], ['penempatan', 'Penempatan santri'], ['riwayat', 'Riwayat perpindahan']];
  function view(kel, v) {
    var body = h('div', { class: 'stack-s' });
    var wrap = h('div', { class: 'stack-g' }, X.head('Asrama ' + KEL[kel], 'Hanya santri ' + KEL[kel].toLowerCase() + ' yang dapat ditempatkan di asrama dan kamar ini.'),
      h('section', { class: 'panel stack-s' }, h('div', { class: 'tools' }, h('div', { class: 'tabs' }, ['putra', 'putri'].map(function (k) { return h('a', { class: 'tab' + (k === kel ? ' is-on' : ''), href: '#/asrama/' + k + '?v=' + v, text: 'Asrama ' + KEL[k] }); })),
        h('div', { class: 'tabs tabs--wrap', role: 'tablist' }, TABS.map(function (t) { return h('a', { class: 'tab' + (t[0] === v ? ' is-on' : ''), href: '#/asrama/' + kel + '?v=' + t[0], text: t[1] }); }))), body));
    return api('GET', '/asrama?jenis=' + kel).then(function (d) {
      var asr = d.rows;
      body.appendChild(v === 'kamar' ? tabKamar(kel, asr) : v === 'penempatan' ? tabPenempatan(kel) : v === 'riwayat' ? tabRiwayat(kel) : tabAsrama(kel, asr));
      return wrap;
    });
  }

  function tabAsrama(kel, rows) {
    var box = h('div', { class: 'stack-s' }); function reload() { X.route(); }
    function open(r) {
      formModal(r ? 'Ubah asrama' : 'Tambah asrama', [{ fields: [{ k: 'nama', label: 'Nama asrama', required: true, max: 80 }, { k: '_j', label: 'Jenis asrama', el: h('input', { value: 'Asrama ' + KEL[kel], disabled: true }) },
        { k: 'status', label: 'Status asrama', type: 'select', options: [{ v: 'aktif', l: 'Aktif' }, { v: 'nonaktif', l: 'Nonaktif' }], blank: null }, { k: 'keterangan', label: 'Keterangan', type: 'textarea', max: 500, full: true }] }], r || { status: 'aktif' },
      function (v) { var b = { nama: v.nama, status: v.status || 'aktif', keterangan: v.keterangan }; if (!r) b.jenis = kel; return r ? api('PATCH', '/asrama/' + r.id, b) : api('POST', '/asrama', b); }, function () { toast('Asrama tersimpan.'); reload(); });
    }
    function detail(r) {
      api('GET', '/kamar?asrama_id=' + r.id).then(function (d) {
        X.modal('Asrama ' + r.nama, [X.dl([['Nama asrama', r.nama], ['Jenis asrama', 'Asrama ' + KEL[r.jenis]], ['Jumlah kamar', r.jumlah_kamar], ['Jumlah penghuni aktif', r.penghuni], ['Total kapasitas', r.kapasitas], ['Sisa kapasitas', r.sisa], ['Status', r.diarsipkan ? 'Diarsipkan' : r.status === 'aktif' ? 'Aktif' : 'Nonaktif'], ['Keterangan', r.keterangan, true]]),
          h('h3', { text: 'Kamar' }), X.table([{ t: 'Kamar', k: 'nama' }, { t: 'Kapasitas', k: 'kapasitas' }, { t: 'Penghuni', k: 'penghuni' }, { t: 'Sisa', k: 'sisa' }, { t: 'Status', f: kPill }], d.rows, empty('Belum ada kamar', 'Tambahkan kamar di tab Kamar.', 'bed'))], function (c) { return [btn('Tutup', c)]; }, { wide: true });
      }).catch(fail);
    }
    var cols = [{ t: 'Nama asrama', k: 'nama' }, { t: 'Jenis', f: function () { return 'Asrama ' + KEL[kel]; } }, { t: 'Jumlah kamar', k: 'jumlah_kamar' }, { t: 'Penghuni aktif', k: 'penghuni' }, { t: 'Total kapasitas', k: 'kapasitas' }, { t: 'Sisa kapasitas', k: 'sisa' },
      { t: 'Status', f: function (r) { return r.diarsipkan ? X.pill('Diarsipkan', 'info') : X.activePill(r.status === 'aktif'); } },
      { t: 'Aksi', f: function (r) { return h('div', { class: 'acts' }, btn('Detail', function () { detail(r); }, { ghost: true, sm: true }), !r.diarsipkan ? btn('Ubah', function () { open(r); }, { ghost: true, sm: true }) : null, arsipBtn('/asrama', r, 'asrama', reload)); } }];
    box.appendChild(h('div', { class: 'tools tools--end' }, btn('Tambah asrama', function () { open(null); }, { icon: 'plus' })));
    box.appendChild(X.table(cols, rows, empty('Belum ada asrama ' + KEL[kel].toLowerCase(), 'Klik “Tambah asrama” untuk membuat asrama pertama. Nama dan kapasitas diisi oleh Super Admin; tidak ada data bawaan.', 'bed')));
    return box;
  }

  function tabKamar(kel, asrama) {
    var box = h('div', { class: 'stack-s' }), lv, act = asrama.filter(function (a) { return !a.diarsipkan && a.status === 'aktif'; });
    function open(r) {
      formModal(r ? 'Ubah kamar' : 'Tambah kamar', [{ fields: [{ k: 'asrama_id', label: 'Asrama', type: 'select', required: true, options: act.map(function (a) { return { v: a.id, l: a.nama }; }), blank: '— Pilih asrama —', readonly: !!r }, { k: 'nama', label: 'Nomor / nama kamar', required: true, max: 60 },
        { k: 'kapasitas', label: 'Kapasitas (jumlah santri)', type: 'number', required: true, min: 1, maxv: 200, max: 3 }, { k: 'status', label: 'Status kamar', type: 'select', options: [{ v: 'aktif', l: 'Aktif' }, { v: 'nonaktif', l: 'Nonaktif' }, { v: 'perbaikan', l: 'Perbaikan' }], blank: null }, { k: 'catatan', label: 'Keterangan', type: 'textarea', max: 500, full: true }] }],
      r ? Object.assign({}, r) : { status: 'aktif' }, function (v) { var b = { nama: v.nama, kapasitas: v.kapasitas, status: v.status || 'aktif', catatan: v.catatan }; if (!r) b.asrama_id = v.asrama_id; return r ? api('PATCH', '/kamar/' + r.id, b) : api('POST', '/kamar', b); }, function () { toast('Kamar tersimpan.'); lv.reload(); });
    }
    function detail(r) {
      api('GET', '/kamar/' + r.id).then(function (d) {
        var k = d.kamar;
        X.modal('Kamar ' + k.nama, [X.dl([['Nomor / nama kamar', k.nama], ['Asrama', k.asrama], ['Jenis kelamin penghuni', KEL[k.jenis]], ['Kapasitas', k.kapasitas], ['Penghuni aktif', k.penghuni], ['Sisa kapasitas', k.sisa], ['Status', k.diarsipkan ? 'Diarsipkan' : STK[k.status][0]], ['Keterangan', k.catatan, true]]),
          h('h3', { text: 'Daftar santri penghuni' }), X.table([{ t: 'Foto', f: function (p) { return X.avatar(p.foto_berkas, p.nama); } }, { t: 'NIS', k: 'nis' }, { t: 'Nama', f: function (p) { return h('a', { class: 'lnk', href: '#/santri/' + p.id, text: p.nama }); } }, { t: 'Tahun masuk', k: 'tahun_masuk' }], d.penghuni, empty('Kamar kosong', 'Belum ada santri aktif di kamar ini.', 'users')),
          h('h3', { text: 'Riwayat kamar' }), X.table([{ t: 'Waktu', f: function (x) { return X.fmtTime(x.waktu); } }, { t: 'Santri', k: 'santri' }, { t: 'Jenis', f: function (x) { return JENIS[x.jenis]; } }, { t: 'Oleh', k: 'oleh_username' }, { t: 'Alasan', k: 'alasan' }], d.riwayat, empty('Belum ada riwayat', '', 'list'))], function (c) { return [btn('Tutup', c)]; }, { wide: true });
      }).catch(fail);
    }
    var cols = [{ t: 'Kamar', k: 'nama', sort: 'nama' }, { t: 'Asrama', k: 'asrama', sort: 'asrama' }, { t: 'Penghuni', f: function () { return KEL[kel]; } }, { t: 'Kapasitas', k: 'kapasitas' }, { t: 'Penghuni aktif', k: 'penghuni' }, { t: 'Sisa', k: 'sisa' }, { t: 'Status', f: kPill }, { t: 'Keterangan', f: function (r) { return r.catatan ? h('span', { class: 'trunc', title: r.catatan, text: r.catatan }) : null; } },
      { t: 'Aksi', f: function (r) { return h('div', { class: 'acts' }, btn('Detail', function () { detail(r); }, { ghost: true, sm: true }), !r.diarsipkan ? btn('Ubah', function () { open(r); }, { ghost: true, sm: true }) : null, arsipBtn('/kamar', r, 'kamar', function () { lv.reload(); })); } }];
    lv = X.listView({ endpoint: '/kamar', base: { jenis: kel }, search: 'Cari nomor / nama kamar', cols: cols, defSort: 'nama', filters: [{ k: 'asrama_id', label: 'Asrama', options: asrama.map(function (a) { return { v: a.id, l: a.nama }; }) }, { k: 'status', label: 'Status', options: [{ v: 'aktif', l: 'Aktif' }, { v: 'nonaktif', l: 'Nonaktif' }, { v: 'perbaikan', l: 'Perbaikan' }] }, { k: 'arsip', label: 'Arsip', blank: 'Arsip: tidak diarsipkan', options: [{ v: 'arsip', l: 'Diarsipkan' }, { v: 'semua', l: 'Semua' }] }],
      emptyEl: empty('Belum ada kamar ' + KEL[kel].toLowerCase(), act.length ? 'Klik “Tambah kamar”. Nama dan kapasitas diisi oleh Super Admin; tidak ada data bawaan.' : 'Buat asrama terlebih dahulu di tab Asrama.', 'bed') });
    box.appendChild(h('div', { class: 'tools tools--end' }, btn('Tambah kamar', function () { open(null); }, { icon: 'plus', disabled: !act.length, title: act.length ? '' : 'Buat asrama dahulu' })));
    box.appendChild(lv.el); return box;
  }

  function tabPenempatan(kel) {
    var box = h('div', { class: 'stack-s' });
    return (function () {
      box.appendChild(h('p', { class: 'muted', text: 'Santri aktif ' + KEL[kel].toLowerCase() + ' yang belum ditempatkan di kamar. Pindah kamar atau pindah asrama dilakukan dari tab Asrama dan Kamar pada halaman detail santri.' }));
      var lv = X.listView({ endpoint: '/santri', base: { kelompok: kel, penempatan: 'belum' }, search: 'Cari nama atau NIS', defSort: 'nama',
        cols: [{ t: 'No', f: function (r) { return r._no; }, cls: 'c-no' }, { t: 'Foto', f: function (r) { return X.avatar(r.foto_berkas, r.nama); } }, { t: 'NIS', k: 'nis' }, { t: 'Nama', f: function (r) { return h('a', { class: 'lnk', href: '#/santri/' + r.id, text: r.nama }); }, sort: 'nama' }, { t: 'Tahun masuk', k: 'tahun_masuk' },
          { t: 'Aksi', f: function (r) { return btn('Tempatkan', function () { X.placeModal(Object.assign({ jenis_kelamin: kel === 'putra' ? 'L' : 'P' }, r), null, function () { lv.reload(); }); }, { sm: true, icon: 'bed' }); } }],
        emptyEl: empty('Semua santri sudah berkamar', 'Tidak ada santri aktif ' + KEL[kel].toLowerCase() + ' yang menunggu penempatan.', 'bed') });
      box.appendChild(lv.el); return box;
    })();
  }
  function tabRiwayat(kel) {
    var box = h('div', { class: 'stack-s' }), st = { page: 1, size: 25 }, out = h('div');
    function load() {
      api('GET', '/penempatan/riwayat' + X.qs({ kelompok: kel, page: st.page, size: st.size })).then(function (d) {
        out.innerHTML = '';
        out.appendChild(X.table([{ t: 'Waktu', f: function (r) { return X.fmtTime(r.waktu); } }, { t: 'Santri', f: function (r) { return h('a', { class: 'lnk', href: '#/santri/' + r.santri_id, text: r.santri }); } }, { t: 'Jenis', f: function (r) { return JENIS[r.jenis]; } }, { t: 'Dari', f: function (r) { return r.dari_kamar ? r.dari_asrama + ' / ' + r.dari_kamar : null; } }, { t: 'Ke', f: function (r) { return r.ke_kamar ? r.ke_asrama + ' / ' + r.ke_kamar : null; } }, { t: 'Oleh', k: 'oleh_username' }, { t: 'Alasan', k: 'alasan' }], d.rows, empty('Belum ada riwayat perpindahan', 'Setiap penempatan, pindah kamar/asrama, dan pengeluaran dari kamar tercatat di sini.', 'list')));
        if (d.total) out.appendChild(X.pager(d.total, d.page, d.size, function (p) { st.page = p; load(); }, function (s) { st.size = s; st.page = 1; load(); }));
      }).catch(function (e) { out.innerHTML = ''; out.appendChild(X.errNote(e)); });
    }
    box.appendChild(out); load(); return box;
  }
  X.views.asrama = function (p, q) { var v = ['asrama', 'kamar', 'penempatan', 'riwayat'].indexOf(q.v) >= 0 ? q.v : 'asrama'; return view(p[0] === 'putri' ? 'putri' : 'putra', v); };
})();
