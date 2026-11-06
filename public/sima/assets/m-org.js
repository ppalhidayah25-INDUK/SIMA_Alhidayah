/* SIMA - modul Data Pengurus (tabel, bagan organisasi, jabatan/divisi/periode) dan Data Pengajar (+ riwayat penugasan). */
(function () {
  'use strict';
  var X = window.SIMA, h = X.h, api = X.api, toast = X.toast, empty = X.empty, btn = X.btn, ico = X.ico, fmtDate = X.fmtDate;
  var KEL = { putra: 'Putra', putri: 'Putri' };
  function fail(e) { toast(e.message, true); }
  function pad(n) { return String(n).padStart(4, '0'); }
  function opts(rows, key) { return rows.map(function (r) { return { v: r.id, l: r[key || 'nama'] }; }); }
  function tabLinks(items, active) { return h('div', { class: 'tabs tabs--wrap' }, items.map(function (t) { return h('a', { class: 'tab' + (t[0] === active ? ' is-on' : ''), href: t[2], text: t[1] }); })); }

  /* Formulir modal generik: spec buildForm + simpan -> api. Mengembalikan setelah sukses lewat onOk. */
  function formModal(title, spec, values, save, onOk, extraEls) {
    var form = X.buildForm(spec, values), note = h('div', { class: 'note note--bad', role: 'alert', hidden: true });
    X.modal(title, [note, form.el].concat(extraEls || []), function (close) {
      return [btn('Batal', close, { ghost: true }), btn('Simpan', function (ev) {
        note.hidden = true; form.errors({}); ev.target.disabled = true;
        save(form.values()).then(function (r) { close(); onOk(r); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message; form.errors(e.fields || {}); });
      })];
    }, { wide: true, sticky: true });
    return form;
  }
  function archiveBtn(base, r, label, reload) {
    return btn(r.diarsipkan ? 'Pulihkan' : 'Arsipkan', function () {
      var want = !r.diarsipkan;
      X.confirmDialog({ title: (want ? 'Arsipkan ' : 'Pulihkan ') + label + '?', text: want ? r.nama + ' akan diarsipkan dan dinonaktifkan. Data dan riwayat tidak dihapus.' : r.nama + ' akan dikembalikan dari arsip (status tetap nonaktif sampai diaktifkan lagi).', danger: want, confirmLabel: want ? 'Ya, arsipkan' : 'Ya, pulihkan' })
        .then(function (c) { if (c) api('POST', base + '/' + r.id + (want ? '/arsip' : '/pulihkan'), { konfirmasi: true }).then(function () { toast(want ? 'Diarsipkan.' : 'Dipulihkan.'); reload(); }).catch(fail); });
    }, { ghost: true, sm: true });
  }
  function photoUpload(path, onOk) {
    var ff = X.fileField({ label: 'Foto' }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' });
    X.modal('Unggah foto', [note, ff.el], function (close) { return [btn('Batal', close, { ghost: true }), btn('Unggah', function (ev) { var f = ff.file(); if (!f) { note.hidden = false; note.textContent = 'Pilih foto terlebih dahulu.'; return; } ev.target.disabled = true; api('PUT', path, f).then(function () { close(); onOk(); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = (e.fields && e.fields.berkas) || e.message; }); })]; });
  }

  // ================= PENGURUS =================
  var PTABS = [['tabel', 'Tabel'], ['bagan', 'Bagan organisasi'], ['jabatan', 'Jabatan'], ['divisi', 'Divisi'], ['periode', 'Periode']];
  function viewPengurus(kel, v) {
    var wrap = h('div', { class: 'stack-g' }), body = h('div', { class: 'stack-s' });
    wrap.appendChild(X.head('Pengurus ' + KEL[kel], 'Susunan kepengurusan ' + KEL[kel].toLowerCase() + ' dikelola terpisah dari kelompok lain.', null));
    wrap.appendChild(h('section', { class: 'panel stack-s' }, h('div', { class: 'tools' }, tabLinks([['putra', 'Pengurus Putra', '#/pengurus/putra'], ['putri', 'Pengurus Putri', '#/pengurus/putri']], kel), h('div', { class: 'tabs tabs--wrap', role: 'tablist' }, PTABS.map(function (t) { return h('a', { class: 'tab' + (t[0] === v ? ' is-on' : ''), href: '#/pengurus/' + kel + '?v=' + t[0], text: t[1] }); }))), body));
    var refs = { jabatan: [], divisi: [], periode: [] };
    var loadRefs = Promise.all(['jabatan', 'divisi', 'periode'].map(function (k) { return api('GET', '/' + k + '?kelompok=' + kel).then(function (d) { refs[k] = d.rows; }); }));
    return loadRefs.then(function () {
      if (v === 'bagan') body.appendChild(bagan(kel, refs)); else if (v === 'jabatan') body.appendChild(refTab(kel, 'jabatan', refs)); else if (v === 'divisi') body.appendChild(refTab(kel, 'divisi', refs)); else if (v === 'periode') body.appendChild(refTab(kel, 'periode', refs)); else body.appendChild(tabelPengurus(kel, refs));
      return wrap;
    });
  }
  function pengurusSpec(kel, refs) {
    return [{ title: 'Data pengurus', fields: [
      { k: 'nama', label: 'Nama lengkap', required: true, max: 100 }, { k: '_jk', label: 'Jenis kelamin', el: h('input', { value: kel === 'putra' ? 'Laki-laki' : 'Perempuan', disabled: true }), help: 'Mengikuti kelompok pengurus.' },
      { k: 'jabatan_id', label: 'Jabatan', type: 'select', required: true, options: opts(refs.jabatan.filter(function (j) { return j.aktif; })), blank: refs.jabatan.length ? '— Pilih jabatan —' : 'Belum ada jabatan: tambahkan di tab Jabatan' },
      { k: 'divisi_id', label: 'Divisi', type: 'select', options: opts(refs.divisi.filter(function (j) { return j.aktif; })), blank: '— Tanpa divisi —' }, { k: 'periode_id', label: 'Periode kepengurusan', type: 'select', options: opts(refs.periode), blank: '— Tanpa periode —' },
      { k: 'aktif', label: 'Status', type: 'select', options: [{ v: 'true', l: 'Aktif' }, { v: 'false', l: 'Tidak aktif' }], blank: null },
      { k: 'tanggal_mulai', label: 'Tanggal mulai menjabat', type: 'date' }, { k: 'tanggal_selesai', label: 'Tanggal selesai menjabat', type: 'date' },
      { k: 'tugas', label: 'Tugas dan tanggung jawab', type: 'textarea', max: 1000, full: true }, { k: 'keterangan', label: 'Keterangan tambahan', type: 'textarea', max: 500, full: true }] }];
  }
  function openPengurusForm(kel, refs, r, reload) {
    var vals = r ? Object.assign({}, r, { aktif: String(r.aktif) }) : { aktif: 'true' };
    var fp = X.fileField({ label: 'Foto', existing: r && r.foto_berkas ? { url: X.berkasUrl(r.foto_berkas), mime: 'image/png', nama: r.nama } : null }), spec = pengurusSpec(kel, refs);
    spec.push({ title: 'Foto', fields: [{ k: '_foto', label: '', el: fp.el, full: true }] });
    formModal(r ? 'Ubah pengurus' : 'Tambah pengurus', spec, vals, function (v) {
      var b = Object.assign({}, v, { kelompok: kel, aktif: v.aktif !== 'false' }); delete b._jk; delete b._foto;
      return (r ? api('PATCH', '/pengurus/' + r.id, b) : api('POST', '/pengurus', b)).then(function (x) { var f = fp.file(); var id = r ? r.id : x.id; return f ? api('PUT', '/pengurus/' + id + '/foto', f).then(function () { return x; }) : x; });
    }, function () { toast(r ? 'Perubahan disimpan.' : 'Pengurus ditambahkan.'); reload(); });
  }
  function tabelPengurus(kel, refs) {
    var box = h('div', { class: 'stack-s' }), lv;
    var cols = [{ t: 'ID', f: function (r) { return 'PGR-' + pad(r.id); } }, { t: 'Foto', f: function (r) { return X.avatar(r.foto_berkas, r.nama); } }, { t: 'Nama lengkap', k: 'nama', sort: 'nama' }, { t: 'Jabatan', k: 'jabatan', sort: 'jabatan' }, { t: 'Divisi', k: 'divisi', sort: 'divisi' }, { t: 'Periode', k: 'periode', sort: 'periode' },
      { t: 'Masa jabatan', f: function (r) { return r.tanggal_mulai || r.tanggal_selesai ? [fmtDate(r.tanggal_mulai) || '…', fmtDate(r.tanggal_selesai) || 'sekarang'].join(' – ') : null; } },
      { t: 'Status', f: function (r) { return r.diarsipkan ? X.pill('Diarsipkan', 'info') : X.activePill(r.aktif); }, sort: 'status' },
      { t: 'Aksi', f: function (r) { return h('div', { class: 'acts' }, btn('Detail', function () { detailPengurus(r.id); }, { ghost: true, sm: true }), !r.diarsipkan ? btn('Ubah', function () { openPengurusForm(kel, refs, r, function () { lv.reload(); }); }, { ghost: true, sm: true }) : null, archiveBtn('/pengurus', r, 'pengurus', function () { lv.reload(); })); } }];
    lv = X.listView({ endpoint: '/pengurus', base: { kelompok: kel }, search: 'Cari nama pengurus', cols: cols, defSort: 'nama',
      filters: [{ k: 'jabatan', label: 'Jabatan', options: opts(refs.jabatan) }, { k: 'divisi', label: 'Divisi', options: opts(refs.divisi) }, { k: 'periode', label: 'Periode', options: opts(refs.periode) }, { k: 'status', label: 'Status', options: [{ v: 'aktif', l: 'Aktif' }, { v: 'nonaktif', l: 'Tidak aktif' }] }, { k: 'arsip', label: 'Arsip', blank: 'Arsip: tidak diarsipkan', options: [{ v: 'arsip', l: 'Diarsipkan' }, { v: 'semua', l: 'Semua' }] }],
      emptyEl: empty('Belum ada pengurus ' + KEL[kel].toLowerCase(), refs.jabatan.length ? 'Klik “Tambah pengurus” untuk mengisi susunan kepengurusan. Tidak ada data contoh.' : 'Tambahkan jabatan lebih dulu di tab Jabatan, lalu tambah pengurus.', 'badge') });
    box.appendChild(h('div', { class: 'tools tools--end' }, btn('Tambah pengurus', function () { openPengurusForm(kel, refs, null, function () { lv.reload(); }); }, { icon: 'plus' })));
    box.appendChild(lv.el); return box;
  }
  function detailPengurus(id) {
    api('GET', '/pengurus/' + id).then(function (d) {
      var p = d.pengurus;
      X.modal('Detail pengurus', [h('div', { class: 'phead' }, X.avatar(p.foto_berkas, p.nama, 'l'), h('div', null, h('b', { text: p.nama }), h('div', { class: 'muted', text: 'PGR-' + pad(p.id) + ' · Pengurus ' + KEL[p.kelompok] }))),
        X.dl([['Jenis kelamin', X.JK[p.jenis_kelamin]], ['Jabatan', p.jabatan], ['Divisi', p.divisi], ['Periode', p.periode], ['Tanggal mulai menjabat', fmtDate(p.tanggal_mulai)], ['Tanggal selesai menjabat', fmtDate(p.tanggal_selesai)], ['Status', p.diarsipkan ? 'Diarsipkan' : p.aktif ? 'Aktif' : 'Tidak aktif'], ['Tugas dan tanggung jawab', p.tugas, true], ['Keterangan', p.keterangan, true]]),
        h('h3', { text: 'Riwayat kepengurusan' }), d.riwayat.length ? h('ol', { class: 'timeline' }, d.riwayat.map(function (r) { return h('li', null, h('b', { text: r.keterangan }), h('time', { text: X.fmtTime(r.waktu) + (r.oleh ? ' · oleh ' + r.oleh : '') })); })) : empty('Belum ada riwayat', '', 'list')], function (c) { return [btn('Tutup', c)]; }, { wide: true });
    }).catch(fail);
  }

  // bagan organisasi: pohon dari jabatan.induk_id; setiap simpul memuat pengurus pemegang jabatan
  function bagan(kel, refs) {
    var box = h('div', { class: 'stack-s' }), per = h('select', { 'aria-label': 'Periode' }, h('option', { value: '', text: 'Periode: semua' }), refs.periode.map(function (p) { return h('option', { value: p.id, text: p.nama }); }));
    var out = h('div', { class: 'orgwrap' });
    function draw() {
      api('GET', '/pengurus/bagan' + X.qs({ kelompok: kel, periode: per.value })).then(function (d) {
        out.innerHTML = '';
        if (!d.jabatan.length) { out.appendChild(empty('Belum ada jabatan', 'Tambahkan jabatan (dan atasannya) di tab Jabatan agar bagan dapat tersusun.', 'badge')); return; }
        var by = {}, kids = {}; d.jabatan.forEach(function (j) { by[j.id] = j; (kids[j.induk_id || 0] = kids[j.induk_id || 0] || []).push(j); });
        var holders = {}; d.pengurus.forEach(function (p) { (holders[p.jabatan_id] = holders[p.jabatan_id] || []).push(p); });
        function node(j) {
          var hs = holders[j.id] || [];
          var card = h('div', { class: 'org__node' }, h('div', { class: 'org__jab', text: j.nama }), hs.length ? hs.map(function (p) { return h('div', { class: 'org__p' }, X.avatar(p.foto_berkas, p.nama, 's'), h('span', null, h('b', { text: p.nama }), p.divisi ? h('small', { text: p.divisi }) : null)); }) : h('div', { class: 'org__vac', text: 'Belum ada pengurus' }));
          var ch = kids[j.id] || []; return h('li', null, card, ch.length ? h('ul', null, ch.map(node)) : null);
        }
        var roots = (kids[0] || []).concat(d.jabatan.filter(function (j) { return j.induk_id && !by[j.induk_id]; }));
        out.appendChild(h('div', { class: 'org' }, h('ul', null, roots.map(node))));
        if (!d.pengurus.length) out.appendChild(h('p', { class: 'muted', text: 'Belum ada pengurus aktif pada ' + (per.value ? 'periode ini' : 'kelompok ini') + '. Bagan menampilkan jabatan yang sudah dibuat.' }));
      }).catch(function (e) { out.innerHTML = ''; out.appendChild(X.errNote(e)); });
    }
    per.addEventListener('change', draw); box.appendChild(h('div', { class: 'tools tools--start' }, per, X.link('Lihat tampilan tabel', '#/pengurus/' + kel))); box.appendChild(out); draw(); return box;
  }

  // jabatan / divisi / periode
  function refTab(kel, kind, refs) {
    var rows = refs[kind], box = h('div', { class: 'stack-s' }), L = { jabatan: 'jabatan', divisi: 'divisi', periode: 'periode' }[kind];
    function reload() { X.route(); }
    var spec = function (r) {
      var f = [{ k: 'nama', label: 'Nama ' + L, required: true, max: 80 }];
      if (kind === 'jabatan') f.push({ k: 'induk_id', label: 'Atasan (jabatan di atasnya)', type: 'select', options: opts(rows.filter(function (x) { return !r || x.id !== r.id; })), blank: '— Tanpa atasan (puncak) —', help: 'Menentukan hubungan hierarki pada bagan organisasi.' }, { k: 'urutan', label: 'Urutan tampil', type: 'number', max: 4, help: 'Angka kecil tampil lebih dulu.' });
      if (kind === 'periode') f.push({ k: 'mulai', label: 'Tanggal mulai', type: 'date' }, { k: 'selesai', label: 'Tanggal selesai', type: 'date' });
      f.push({ k: 'aktif', label: 'Status', type: 'select', options: [{ v: 'true', l: 'Aktif' }, { v: 'false', l: 'Tidak aktif' }], blank: null }); if (kind !== 'periode') f.push({ k: 'keterangan', label: 'Keterangan', type: 'textarea', max: 300, full: true });
      return [{ fields: f }];
    };
    function open(r) {
      formModal((r ? 'Ubah ' : 'Tambah ') + L, spec(r), r ? Object.assign({}, r, { aktif: String(r.aktif) }) : { aktif: 'true' }, function (v) {
        var b = Object.assign({}, v, { kelompok: kel, aktif: v.aktif !== 'false' }); if (kind === 'jabatan') b.induk_id = v.induk_id || null;
        return r ? api('PATCH', '/' + kind + '/' + r.id, b) : api('POST', '/' + kind, b);
      }, function () { toast('Tersimpan.'); reload(); });
    }
    var cols = [{ t: 'Nama', k: 'nama' }];
    if (kind === 'jabatan') { var byId = {}; rows.forEach(function (x) { byId[x.id] = x; }); cols.push({ t: 'Atasan', f: function (r) { return r.induk_id && byId[r.induk_id] ? byId[r.induk_id].nama : 'Puncak (tanpa atasan)'; } }, { t: 'Urutan', k: 'urutan' }); }
    if (kind === 'periode') cols.push({ t: 'Mulai', f: function (r) { return fmtDate(r.mulai); } }, { t: 'Selesai', f: function (r) { return fmtDate(r.selesai); } });
    if (kind !== 'periode') cols.push({ t: 'Keterangan', k: 'keterangan' });
    cols.push({ t: 'Pengurus', f: function (r) { return String(r.jumlah); } }, { t: 'Status', f: function (r) { return X.activePill(r.aktif); } }, { t: 'Aksi', f: function (r) { return btn('Ubah', function () { open(r); }, { ghost: true, sm: true }); } });
    var act = [btn('Tambah ' + L, function () { open(null); }, { icon: 'plus' })];
    if (kind === 'jabatan') act.push(btn('Muat jabatan awal', function () {
      X.confirmDialog({ title: 'Muat jabatan awal?', text: 'Menambahkan daftar jabatan dari spesifikasi pondok (Pengasuh Pondok, Ketua Umum Pondok, Ketua Pondok, Sekretaris, Bendahara, Divisi Keamanan, Divisi Madrasah Diniyah, Divisi Madrasah Qur\'an, Divisi Media) ke Pengurus ' + KEL[kel] + '. Yang sudah ada dilewati. Atasan tiap jabatan diatur sendiri setelahnya.', confirmLabel: 'Ya, muat' })
        .then(function (c) { if (c) api('POST', '/jabatan/awal', { kelompok: kel }).then(function (r) { toast(r.ditambahkan + ' jabatan ditambahkan.'); reload(); }).catch(fail); });
    }, { ghost: true }));
    box.appendChild(h('div', { class: 'tools tools--end' }, act));
    box.appendChild(X.table(cols, rows, empty('Belum ada ' + L, 'Tambahkan ' + L + ' untuk Pengurus ' + KEL[kel] + '.', 'badge')));
    return box;
  }

  // ================= PENGAJAR =================
  function viewPengajar() {
    var wrap = h('div', { class: 'stack-g' }), lv;
    function form(r) {
      var fp = X.fileField({ label: 'Foto', existing: r && r.foto_berkas ? { url: X.berkasUrl(r.foto_berkas), mime: 'image/png', nama: r.nama } : null });
      var spec = [{ fields: [{ k: 'nama', label: 'Nama lengkap', required: true, max: 100 }, { k: 'kontak', label: 'Nomor kontak', type: 'tel', max: 20 }, { k: 'bidang', label: 'Bidang / mata pelajaran', max: 120 }, { k: 'lembaga', label: 'Lembaga / program pendidikan yang diampu', max: 150 },
        { k: 'tanggal_mulai', label: 'Tanggal mulai mengajar', type: 'date' }, { k: 'aktif', label: 'Status', type: 'select', options: [{ v: 'true', l: 'Aktif' }, { v: 'false', l: 'Tidak aktif' }], blank: null },
        { k: 'alamat', label: 'Alamat', type: 'textarea', max: 400, full: true }, { k: 'keterangan', label: 'Keterangan tambahan', type: 'textarea', max: 500, full: true }, { k: '_foto', label: 'Foto', el: fp.el, full: true }] }];
      formModal(r ? 'Ubah pengajar' : 'Tambah pengajar', spec, r ? Object.assign({}, r, { aktif: String(r.aktif) }) : { aktif: 'true' }, function (v) {
        var b = Object.assign({}, v, { aktif: v.aktif !== 'false' }); delete b._foto;
        return (r ? api('PATCH', '/pengajar/' + r.id, b) : api('POST', '/pengajar', b)).then(function (x) { var f = fp.file(), id = r ? r.id : x.id; return f ? api('PUT', '/pengajar/' + id + '/foto', f).then(function () { return x; }) : x; });
      }, function () { toast(r ? 'Perubahan disimpan.' : 'Pengajar ditambahkan.'); lv.reload(); });
    }
    var cols = [{ t: 'ID', f: function (r) { return 'PGJ-' + pad(r.id); } }, { t: 'Foto', f: function (r) { return X.avatar(r.foto_berkas, r.nama); } }, { t: 'Nama lengkap', k: 'nama', sort: 'nama' }, { t: 'Bidang', k: 'bidang', sort: 'bidang' }, { t: 'Lembaga / program', k: 'lembaga', sort: 'lembaga' }, { t: 'Kontak', k: 'kontak' },
      { t: 'Mulai mengajar', f: function (r) { return fmtDate(r.tanggal_mulai); } }, { t: 'Status', f: function (r) { return r.diarsipkan ? X.pill('Diarsipkan', 'info') : X.activePill(r.aktif); }, sort: 'status' },
      { t: 'Aksi', f: function (r) { return h('div', { class: 'acts' }, btn('Detail', function () { detailPengajar(r.id, function () { lv.reload(); }); }, { ghost: true, sm: true }), !r.diarsipkan ? btn('Ubah', function () { form(r); }, { ghost: true, sm: true }) : null, archiveBtn('/pengajar', r, 'pengajar', function () { lv.reload(); })); } }];
    lv = X.listView({ endpoint: '/pengajar', search: 'Cari nama pengajar', cols: cols, defSort: 'nama',
      filters: [{ k: 'bidang', label: 'Bidang', options: [] }, { k: 'lembaga', label: 'Lembaga / program', options: [] }, { k: 'status', label: 'Status', options: [{ v: 'aktif', l: 'Aktif' }, { v: 'nonaktif', l: 'Tidak aktif' }] }, { k: 'arsip', label: 'Arsip', blank: 'Arsip: tidak diarsipkan', options: [{ v: 'arsip', l: 'Diarsipkan' }, { v: 'semua', l: 'Semua' }] }],
      emptyEl: empty('Belum ada data pengajar', 'Klik “Tambah pengajar” untuk mengisi data pertama. Tidak ada data contoh.', 'book', btn('Tambah pengajar', function () { form(null); }, { icon: 'plus' })),
      onLoaded: function (d, setOptions) { if (d.pilihan) { setOptions('bidang', d.pilihan.bidang.map(function (v) { return { v: v, l: v }; })); setOptions('lembaga', d.pilihan.lembaga.map(function (v) { return { v: v, l: v }; })); } } });
    wrap.appendChild(X.head('Data Pengajar', 'Satu daftar untuk seluruh pondok, tanpa pembagian Putra dan Putri.', btn('Tambah pengajar', function () { form(null); }, { icon: 'plus' })));
    wrap.appendChild(h('section', { class: 'panel' }, lv.el));
    return Promise.resolve(wrap);
  }
  function detailPengajar(id, onChange) {
    api('GET', '/pengajar/' + id).then(function (d) {
      var p = d.pengajar, host = h('div');
      function draw(dd) {
        host.innerHTML = '';
        host.appendChild(h('div', { class: 'phead' }, X.avatar(p.foto_berkas, p.nama, 'l'), h('div', null, h('b', { text: p.nama }), h('div', { class: 'muted', text: 'PGJ-' + pad(p.id) }))));
        host.appendChild(X.dl([['Alamat', p.alamat], ['Nomor kontak', p.kontak], ['Bidang / mata pelajaran', p.bidang], ['Lembaga / program', p.lembaga], ['Tanggal mulai mengajar', fmtDate(p.tanggal_mulai)], ['Status', p.diarsipkan ? 'Diarsipkan' : p.aktif ? 'Aktif' : 'Tidak aktif'], ['Keterangan', p.keterangan, true]]));
        host.appendChild(h('div', { class: 'panel__h' }, h('h3', { text: 'Riwayat penugasan' }), !p.diarsipkan ? btn('Tambah penugasan', function () { tugas(null); }, { ghost: true, sm: true, icon: 'plus' }) : null));
        host.appendChild(X.table([{ t: 'Bidang', k: 'bidang' }, { t: 'Lembaga / program', k: 'lembaga' }, { t: 'Mulai', f: function (r) { return fmtDate(r.mulai); } }, { t: 'Selesai', f: function (r) { return r.selesai ? fmtDate(r.selesai) : (r.mulai ? 'Berlanjut' : null); } }, { t: 'Keterangan', k: 'keterangan' }, { t: 'Aksi', f: function (r) { return !p.diarsipkan ? btn('Ubah', function () { tugas(r); }, { ghost: true, sm: true }) : null; } }], dd.penugasan, empty('Belum ada penugasan', 'Riwayat penugasan akan tampil di sini.', 'book')));
      }
      function tugas(r) {
        formModal(r ? 'Ubah penugasan' : 'Tambah penugasan', [{ fields: [{ k: 'bidang', label: 'Bidang / mata pelajaran', max: 120 }, { k: 'lembaga', label: 'Lembaga / program', max: 150 }, { k: 'mulai', label: 'Tanggal mulai', type: 'date' }, { k: 'selesai', label: 'Tanggal selesai', type: 'date' }, { k: 'keterangan', label: 'Keterangan', type: 'textarea', max: 300, full: true }] }], r || {}, function (v) { return r ? api('PATCH', '/pengajar/' + id + '/penugasan/' + r.id, v) : api('POST', '/pengajar/' + id + '/penugasan', v); },
          function () { toast('Penugasan tersimpan.'); api('GET', '/pengajar/' + id).then(function (x) { d = x; draw(x); if (onChange) onChange(); }); });
      }
      draw(d); X.modal('Detail pengajar', [host], function (c) { return [btn('Tutup', c)]; }, { wide: true });
    }).catch(fail);
  }

  X.views.pengurus = function (p, q) { var kel = p[0] === 'putri' ? 'putri' : 'putra', v = ['tabel', 'bagan', 'jabatan', 'divisi', 'periode'].indexOf(q.v) >= 0 ? q.v : 'tabel'; return viewPengurus(kel, v); };
  X.views.pengajar = function () { return viewPengajar(); };
})();
