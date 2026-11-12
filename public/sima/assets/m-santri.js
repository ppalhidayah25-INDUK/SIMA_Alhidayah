/* SIMA - modul Data Santri & Data Alumni (daftar, formulir, detail 7 tab, pemindahan ke alumni, penempatan). */
(function () {
  'use strict';
  var X = window.SIMA, h = X.h, api = X.api, toast = X.toast, val = X.val, fmtDate = X.fmtDate, empty = X.empty, btn = X.btn, ico = X.ico;
  var KEL = { putra: 'Putra', putri: 'Putri' };
  var ST_ALUMNI = { lulus: 'Lulus', berhenti: 'Berhenti' };
  var yearNow = new Date().getFullYear();
  function kelOf(s) { return s.jenis_kelamin === 'L' ? 'putra' : 'putri'; }
  function ttl(r) { var t = [r.tempat_lahir, fmtDate(r.tanggal_lahir)].filter(Boolean).join(', '); return t || null; }
  function trunc(t, n) { return t ? h('span', { class: 'trunc', title: t, text: t }) : null; }
  function statusPill(r) { return r.diarsipkan ? X.pill('Diarsipkan', 'info') : r.status === 'alumni' ? X.pill(ST_ALUMNI[r.status_alumni] || 'Alumni', r.status_alumni === 'lulus' ? 'ok' : 'info') : X.pill('Aktif', 'ok'); }
  function nameLink(r, mod) { return h('a', { class: 'lnk', href: '#/' + mod + '/' + r.id, text: r.nama }); }
  function done(msg) { toast(msg); X.route(); }
  function fail(e) { toast(e.message, true); }
  function tabs(active, mod, items) { return h('div', { class: 'tabs tabs--wrap' }, items.map(function (t) { return h('a', { class: 'tab' + (t[0] === active ? ' is-on' : ''), href: '#/' + mod + '/' + t[0], text: t[1] }); })); }
  function jkOpts() { return [{ v: 'L', l: 'Laki-laki (Putra)' }, { v: 'P', l: 'Perempuan (Putri)' }]; }
  function ortuOpts() { return Object.keys(X.ORTU).map(function (k) { return { v: k, l: X.ORTU[k] }; }); }
  function yearOpts(a) { return (a || []).map(function (y) { return { v: y, l: String(y) }; }); }

  // ================= DAFTAR SANTRI =================
  function listSantri(kel) {
    var role = X.S.user.role, isSA = role === 'super_admin', wrap = h('div', { class: 'stack-g' });
    var filters = [], lv;
    if (isSA) {
      filters = [
        { k: 'asrama', label: 'Asrama', options: [], onChange: function (v, st) { st.f.kamar = ''; refreshKamar(v); } },
        { k: 'kamar', label: 'Kamar', options: [] },
        { k: 'tahun_masuk', label: 'Tahun masuk', options: [] },
        { k: 'status', label: 'Status', blank: 'Status: Aktif', options: [{ v: 'arsip', l: 'Diarsipkan' }, { v: 'semua', l: 'Semua' }] },
        { k: 'penempatan', label: 'Penempatan', options: [{ v: 'belum', l: 'Belum berkamar' }] }];
    }
    var cols;
     if (isSA) cols = [
      { t: 'No', f: function (r) { return r._no; }, cls: 'c-no' }, { t: 'Foto', f: function (r) { return X.avatar(r.foto_berkas, r.nama); } }, { t: 'NIS', k: 'nis', sort: 'nis' },
      { t: 'Nama lengkap', f: function (r) { return nameLink(r, 'santri'); }, sort: 'nama' }, { t: 'Jenis kelamin', f: function (r) { return X.JK[r.jenis_kelamin]; } },
      { t: 'Kamar', f: function (r) { return r.kamar || '—'; }, sort: 'kamar' }, { t: 'Status', f: statusPill, sort: 'status' },
      { t: 'Aksi', f: function (r) { return h('div', { class: 'acts' }, X.link('Detail', '#/santri/' + r.id, { sm: true }), !r.diarsipkan ? X.link('Ubah', '#/santri/' + r.id + '/ubah', { sm: true }) : null, btn(r.diarsipkan ? 'Pulihkan' : 'Arsipkan', function () { arsip(r, !r.diarsipkan); }, { ghost: true, sm: true })); } }];
    else {
      cols = [{ t: 'No', f: function (r) { return r._no; }, cls: 'c-no' }];
      if (role === 'keamanan') cols.push({ t: 'Foto', f: function (r) { return X.avatar(r.foto, r.nama); } });
      cols.push({ t: 'NIS', k: 'nis' }, { t: 'Nama', k: 'nama' });
      if (role === 'bendahara') cols.push({ t: 'Tahun masuk', k: 'tahun_masuk' });
      if (role === 'keamanan') cols.push({ t: 'Asrama', k: 'asrama' }, { t: 'Kamar', k: 'kamar' });
      cols.push({ t: 'Status', f: function () { return X.pill('Aktif', 'ok'); } }, { t: 'Aksi', f: function (r) { return btn('Lihat', function () { limited(r.id); }, { ghost: true, sm: true }); } });
    }
    lv = X.listView({ endpoint: '/santri', base: { kelompok: kel }, search: 'Cari nama atau NIS', filters: filters, cols: cols, defSort: 'nama',
      emptyEl: empty('Belum ada data santri ' + KEL[kel].toLowerCase(), isSA ? 'Klik “Tambah santri” untuk mengisi data pertama. Tidak ada data contoh.' : 'Data santri diisi oleh Super Admin.', 'users', isSA ? X.link('Tambah santri', '#/santri/baru?k=' + kel, { ghost: false, icon: 'plus' }) : null),
      onLoaded: function (d, setOptions) { if (d.pilihan) setOptions('tahun_masuk', yearOpts(d.pilihan.tahun_masuk)); } });
    function refreshKamar(asramaId) { api('GET', '/kamar?jenis=' + kel + (asramaId ? '&asrama_id=' + asramaId : '')).then(function (d) { lv.setOptions('kamar', d.rows.map(function (k) { return { v: k.id, l: k.nama + (asramaId ? '' : ' · ' + k.asrama) }; })); }).catch(function () { }); }
    if (isSA) { api('GET', '/asrama?jenis=' + kel).then(function (d) { lv.setOptions('asrama', d.rows.map(function (a) { return { v: a.id, l: a.nama }; })); refreshKamar(''); }).catch(function () { }); }
    function arsip(r, want) {
      X.confirmDialog({ title: (want ? 'Arsipkan ' : 'Pulihkan ') + 'santri?', text: want ? r.nama + ' akan diarsipkan: tidak tampil di daftar santri aktif, tidak dihitung sebagai penghuni, dan dikeluarkan dari kamar. Data dan riwayat tidak dihapus.' : r.nama + ' akan dikembalikan ke daftar santri aktif (belum ditempatkan di kamar).', reason: 'optional', confirmLabel: want ? 'Ya, arsipkan' : 'Ya, pulihkan', danger: want })
        .then(function (c) { if (!c) return; api('POST', '/santri/' + r.id + (want ? '/arsip' : '/pulihkan'), { konfirmasi: true, alasan: c.alasan }).then(function () { toast(want ? 'Santri diarsipkan.' : 'Santri dipulihkan.'); lv.reload(); }).catch(fail); });
    }
    wrap.appendChild(X.head('Data Santri ' + KEL[kel], isSA ? 'Santri aktif. Santri yang lulus atau berhenti dipindahkan ke Data Alumni dari halaman detail.' : 'Tampilan terbatas.', isSA ? X.link('Tambah santri', '#/santri/baru?k=' + kel, { ghost: false, icon: 'plus' }) : null));
    if (!isSA) wrap.appendChild(h('div', { class: 'note note--warn', text: 'Tampilan terbatas: hanya identitas yang diperlukan untuk tugas ' + X.S.user.roleLabel + '. Data bersifat baca saja; dokumen keluarga (KK) tidak dapat diakses.' }));
    wrap.appendChild(h('section', { class: 'panel stack-s' }, tabs(kel, 'santri', [['putra', 'Santri Putra'], ['putri', 'Santri Putri']]), lv.el));
    return wrap;
  }
  function limited(id) {
    api('GET', '/santri/' + id).then(function (d) {
      var s = d.santri, role = X.S.user.role;
      var pairs = [['NIS', s.nis], ['Nama', s.nama], ['Kelompok', KEL[s.kelompok]], ['Status', 'Aktif']];
      if (role === 'bendahara') pairs.push(['Tahun masuk', s.tahun_masuk]); else pairs.push(['Asrama', s.asrama], ['Kamar', s.kamar]);
      X.modal('Profil terbatas', [h('div', { class: 'phead' }, role === 'keamanan' ? X.avatar(s.foto, s.nama, 'l') : null, h('b', { text: s.nama })), X.dl(pairs), h('p', { class: 'note note--warn', text: 'Data lain (alamat, keluarga, dokumen) hanya dapat dilihat Super Admin.' })], function (close) { return [btn('Tutup', close)]; });
    }).catch(fail);
  }

  // ================= FORMULIR SANTRI / ALUMNI =================
  function formSantri(id, kelDef, mode) {   // mode: 'santri' | 'alumni'
    var isAl = mode === 'alumni', wrap = h('div', { class: 'stack-g' });
    var load = id ? api('GET', '/' + mode + '/' + id) : Promise.resolve(null);
    return load.then(function (d) {
      var s = d ? d.santri : { jenis_kelamin: kelDef === 'putri' ? 'P' : 'L' };
      if (d && !isAl && s.status === 'alumni') { location.hash = '#/alumni/' + id + '/ubah'; return h('div'); }
      var cancel = id ? '#/' + mode + '/' + id : '#/' + (isAl ? 'alumni/semua' : 'santri/' + kelDef);
      var fFoto = X.fileField({ label: 'Foto', existing: s.foto_berkas ? { url: X.berkasUrl(s.foto_berkas), mime: 'image/png', nama: s.nama } : null });
      var fKK = X.fileField({ label: 'Foto Kartu Keluarga', pdf: true, help: 'JPG, JPEG, PNG, atau PDF. Maksimal 2,5 MB. Disimpan aman, hanya Super Admin yang dapat membuka.', existing: d && d.kk ? { url: X.berkasUrl(d.kk.id), mime: d.kk.mime, nama: d.kk.nama_asli } : null });
      var fId = X.fileField({ label: 'Dokumen identitas', pdf: true }), fLain = X.fileField({ label: 'Dokumen pendukung lainnya', pdf: true });
      var asramaSel = h('select', { id: 'selAsrama', 'aria-label': 'Asrama' }), kamarSel = h('select', { id: 'selKamar', 'aria-label': 'Kamar' });
      var kamarRows = [];
      var A = [{ title: 'A. Identitas ' + (isAl ? 'Alumni' : 'Santri'), fields: [
        { k: 'nis', label: isAl ? 'NIS sebelumnya' : 'NIS (Nomor Induk Santri)', max: 30, help: 'Unik. Boleh dikosongkan bila belum ada.' }, { k: 'nama', label: 'Nama lengkap', required: true, max: 100 },
        { k: 'jenis_kelamin', label: 'Jenis kelamin', type: 'select', required: true, options: jkOpts(), help: isAl ? '' : 'Menentukan kategori Putra/Putri dan asrama yang boleh dipilih.' },
        { k: 'tempat_lahir', label: 'Tempat lahir', max: 80 }, { k: 'tanggal_lahir', label: 'Tanggal lahir', type: 'date', maxv: X.today() },
        { k: 'telepon', label: 'Nomor telepon (jika tersedia)', type: 'tel', max: 20 }, { k: 'alamat', label: 'Alamat lengkap', type: 'textarea', max: 400, full: true },
        { k: '_foto', label: 'Foto ' + (isAl ? 'alumni' : 'santri'), el: fFoto.el, full: true }] },
      { title: 'B. Identitas Ayah', fields: [{ k: 'nama_ayah', label: 'Nama ayah' }, { k: 'pekerjaan_ayah', label: 'Pekerjaan ayah' }, { k: 'status_ayah', label: 'Status ayah', type: 'select', options: ortuOpts(), blank: '— Belum diisi —', help: 'Isi sesuai keterangan wali. Tidak diisi otomatis.' }] },
      { title: 'C. Identitas Ibu', fields: [{ k: 'nama_ibu', label: 'Nama ibu' }, { k: 'pekerjaan_ibu', label: 'Pekerjaan ibu' }, { k: 'status_ibu', label: 'Status ibu', type: 'select', options: ortuOpts(), blank: '— Belum diisi —', help: 'Isi sesuai keterangan wali. Tidak diisi otomatis.' }] },
      { title: 'D. Identitas Wali', hint: 'Isi bila ada wali.', fields: [{ k: 'nama_wali', label: 'Nama wali' }, { k: 'wali_hubungan', label: 'Hubungan dengan ' + (isAl ? 'alumni' : 'santri'), max: 60 }, { k: 'wali_pekerjaan', label: 'Pekerjaan wali' }, { k: 'wali_telepon', label: 'Nomor telepon wali', type: 'tel', max: 20 }, { k: 'wali_alamat', label: 'Alamat wali (jika berbeda)', type: 'textarea', max: 400, full: true }] }];
      if (!isAl) A.push({ title: 'E. Dokumen Keluarga', fields: [{ k: '_kk', label: 'Foto Kartu Keluarga (KK)', el: fKK.el, full: true }] });
      var F = [{ k: 'tanggal_masuk', label: 'Tanggal masuk pondok', type: 'date', maxv: X.today() }, { k: 'tahun_masuk', label: 'Tahun masuk', type: 'number', min: 1900, maxv: yearNow + 1, max: 4, help: 'Terisi otomatis dari tanggal masuk; dapat dikoreksi.' }];
      if (!isAl) F.push({ k: '_st', label: 'Status santri', el: h('input', { value: 'Aktif', disabled: true }) }, { k: '_asr', label: 'Asrama', el: asramaSel }, { k: '_kmr', label: 'Kamar', el: kamarSel, help: 'Hanya kamar sesuai jenis kelamin dan masih ada kapasitas.' }, { k: 'catatan_admin', label: 'Catatan administrasi', type: 'textarea', max: 1000, full: true });
      else F.push({ k: 'asrama_terakhir', label: 'Asrama terakhir (jika tersedia)', max: 150 }, { k: 'program_terakhir', label: 'Program pendidikan terakhir', max: 150 });
      A.push({ title: isAl ? 'C2. Informasi Kepesantrenan' : 'F. Informasi Kepesantrenan', fields: F });
      if (!isAl) A.push({ title: 'G. Informasi Pendidikan', fields: [{ k: 'pendidikan_formal', label: 'Pendidikan formal', max: 120 }, { k: 'lembaga_pendidikan', label: 'Lembaga pendidikan', max: 150 }, { k: 'program_pesantren', label: 'Program pendidikan pesantren yang diikuti', max: 150, full: true }] });
      if (!isAl) A.push({ title: 'H. Dokumen Pendukung', hint: 'Foto santri ada pada bagian A. Dokumen tambahan dapat dikelola juga dari tab Dokumen pada halaman detail.', fields: [{ k: '_doc1', label: 'Dokumen identitas (jika diperlukan)', el: fId.el, full: true }, { k: '_doc2', label: 'Dokumen pendukung lainnya', el: fLain.el, full: true }] });
      if (isAl) {
        var info = [{ k: 'catatan_alumni', label: 'Catatan tambahan', type: 'textarea', max: 1000, full: true }];
        if (!id) info.unshift({ k: 'status_alumni', label: 'Status alumni', type: 'select', required: true, options: [{ v: 'lulus', l: 'Lulus' }, { v: 'berhenti', l: 'Berhenti' }] }, { k: 'tanggal_keluar', label: 'Tanggal keluar / lulus', type: 'date', maxv: X.today() }, { k: 'tahun_keluar', label: 'Tahun keluar', type: 'number', min: 1900, maxv: yearNow + 1, max: 4, required: true }, { k: 'keterangan_keluar', label: 'Keterangan kelulusan / alasan berhenti', type: 'textarea', max: 500, full: true });
        else info.unshift({ k: '_sa', label: 'Status alumni', el: h('input', { value: (ST_ALUMNI[s.status_alumni] || '') + (s.tahun_keluar ? ' · keluar ' + s.tahun_keluar : ''), disabled: true }), help: 'Status, tanggal, dan tahun keluar diubah lewat tombol “Koreksi status” pada halaman detail (wajib alasan).', full: true });
        A.push({ title: 'D. Informasi Alumni', fields: info });
      }
      var form = X.buildForm(A, s), top = h('div', { class: 'note note--bad', role: 'alert', hidden: true });
      // tahun masuk otomatis dari tanggal masuk
      var tm = form.input('tanggal_masuk'), ty = form.input('tahun_masuk'), manual = !!s.tahun_masuk && s.tahun_masuk !== (s.tanggal_masuk ? +String(s.tanggal_masuk).slice(0, 4) : null);
      ty.addEventListener('input', function () { manual = true; }); tm.addEventListener('change', function () { if (tm.value && !manual) ty.value = tm.value.slice(0, 4); });
      if (isAl && !id) { var tk = form.input('tanggal_keluar'), yk = form.input('tahun_keluar'), mk = false; yk.addEventListener('input', function () { mk = true; }); tk.addEventListener('change', function () { if (tk.value && !mk) yk.value = tk.value.slice(0, 4); }); }
      // asrama -> kamar
      var jk = form.input('jenis_kelamin');
      function fillKamar() {
        var aid = asramaSel.value, cur = s.kamar_id ? String(s.kamar_id) : '';
        kamarSel.innerHTML = ''; kamarSel.appendChild(h('option', { value: '', text: '— Belum ditempatkan —' }));
        kamarRows.filter(function (k) { return !aid || String(k.asrama_id) === aid; }).forEach(function (k) { kamarSel.appendChild(h('option', { value: k.id, selected: String(k.id) === cur && String(k.asrama_id) === aid, text: k.nama + ' (sisa ' + k.sisa + ')' })); });
        if (cur && aid && !kamarSel.querySelector('option[selected]') && kamarRows.some(function (k) { return String(k.id) === cur && String(k.asrama_id) === aid; })) kamarSel.value = cur;
      }
      function loadKamar() {
        if (isAl) return; var j = jk.value === 'L' ? 'putra' : jk.value === 'P' ? 'putri' : '';
        asramaSel.innerHTML = ''; kamarSel.innerHTML = ''; if (!j) { asramaSel.disabled = kamarSel.disabled = true; asramaSel.appendChild(h('option', { text: 'Pilih jenis kelamin dahulu' })); return; }
        asramaSel.disabled = kamarSel.disabled = false;
        api('GET', '/kamar?jenis=' + j + '&tersedia=1').then(function (r) {
          kamarRows = r.rows;
          var p = s.kamar_id && !kamarRows.some(function (k) { return k.id === s.kamar_id; }) ? api('GET', '/kamar/' + s.kamar_id).then(function (x) { if (x.kamar.jenis === j) kamarRows.push({ id: x.kamar.id, asrama_id: x.kamar.asrama_id, asrama: x.kamar.asrama, nama: x.kamar.nama, sisa: x.kamar.sisa }); }).catch(function () { }) : Promise.resolve();
          return p;
        }).then(function () {
          var seen = {}; asramaSel.appendChild(h('option', { value: '', text: kamarRows.length ? '— Belum ditempatkan —' : 'Belum ada kamar yang tersedia' }));
          kamarRows.forEach(function (k) { if (!seen[k.asrama_id]) { seen[k.asrama_id] = 1; asramaSel.appendChild(h('option', { value: k.asrama_id, selected: s.kamar_id && k.id === s.kamar_id, text: k.asrama })); } });
          fillKamar();
        }).catch(function () { });
      }
      if (!isAl) { jk.addEventListener('change', function () { s.kamar_id = null; loadKamar(); }); asramaSel.addEventListener('change', function () { s.kamar_id = null; fillKamar(); }); loadKamar(); }

      var save = h('button', { class: 'btn', type: 'button', text: id ? 'Simpan perubahan' : isAl ? 'Simpan alumni' : 'Simpan santri' });
      save.addEventListener('click', function () {
        var v = form.values(), body = {}; Object.keys(v).forEach(function (k) { if (k.charAt(0) !== '_') body[k] = v[k]; });
        if (!isAl) body.kamar_id = kamarSel.value || null;
        top.hidden = true; form.errors({}); save.disabled = true; save.textContent = 'Menyimpan…';
        var req = id ? api('PATCH', '/' + mode + '/' + id, body) : api('POST', '/' + mode, body);
        req.then(function (r) {
          var sid = id || r.id, jobs = [];
          var f = fFoto.file(); if (f) jobs.push(['foto', function () { return api('PUT', '/santri/' + sid + '/foto', f); }]);
          if (!isAl) { var k = fKK.file(); if (k) jobs.push(['KK', function () { return api('PUT', '/santri/' + sid + '/kk', k); }]); [[fId, 'identitas'], [fLain, 'pendukung']].forEach(function (x) { var ff = x[0].file(); if (ff) jobs.push(['dokumen ' + x[1], function () { return api('POST', '/santri/' + sid + '/dokumen', { jenis: x[1], nama: ff.nama, data: ff.data }); }]); }); }
          var bad = [];
          return jobs.reduce(function (p, j) { return p.then(function () { return j[1](); }).catch(function (e) { bad.push(j[0] + ': ' + e.message); }); }, Promise.resolve()).then(function () {
            if (bad.length) toast('Data tersimpan, tetapi unggahan gagal — ' + bad.join('; '), true); else toast(id ? 'Perubahan disimpan.' : (isAl ? 'Alumni' : 'Santri') + ' ditambahkan.');
            location.hash = '#/' + mode + '/' + sid;
          });
        }).catch(function (e) { save.disabled = false; save.textContent = id ? 'Simpan perubahan' : 'Simpan'; top.hidden = false; top.textContent = e.message; var fl = Object.assign({}, e.fields); if (fl.kamar_id) fl._kmr = fl.kamar_id; form.errors(fl); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      });
      wrap.appendChild(X.head((id ? 'Ubah data ' : 'Tambah ') + (isAl ? 'alumni' : 'santri'), 'Kolom bertanda * wajib diisi. Data yang belum tersedia boleh dikosongkan.', X.link('← Batal', cancel)));
      wrap.appendChild(top); wrap.appendChild(form.el); wrap.appendChild(h('div', { class: 'form__act' }, X.link('Batal', cancel), save));
      return wrap;
    });
  }

  // ================= DETAIL (santri & alumni) =================
  var JENIS_RIWAYAT = { dibuat: 'Data dibuat', ubah_data: 'Data diubah', arsip: 'Diarsipkan', pulihkan: 'Dipulihkan dari arsip', pindah_alumni: 'Dipindahkan ke alumni', koreksi_alumni: 'Koreksi status alumni', aktifkan_kembali: 'Diaktifkan kembali sebagai santri', tambah_alumni: 'Alumni ditambahkan manual', dokumen: 'Dokumen' };
  var JENIS_PENEMPATAN = { penempatan_baru: 'Penempatan baru', pindah_kamar: 'Pindah kamar', pindah_asrama: 'Pindah asrama', keluar_kamar: 'Dikeluarkan dari kamar', keluar_otomatis: 'Keluar otomatis' };
  var FIELD_LABEL = { status_alumni: 'Status', tanggal_keluar: 'Tanggal keluar', tahun_keluar: 'Tahun keluar', keterangan_keluar: 'Keterangan', program_terakhir: 'Program terakhir', asrama_terakhir: 'Asrama terakhir', catatan_alumni: 'Catatan' };
  function changeText(a, b) { var ks = Object.keys(Object.assign({}, a || {}, b || {})); return ks.map(function (k) { var x = a && a[k], y = b && b[k]; var f = function (v) { return v == null || v === '' ? '—' : (ST_ALUMNI[v] || v); }; return (FIELD_LABEL[k] || k) + ': ' + f(x) + (b ? ' → ' + f(y) : ''); }).join(' · '); }

  function detail(id, mode, q) {
    var isAl = mode === 'alumni';
    return api('GET', '/' + mode + '/' + id).then(function (d) {
      var s = d.santri, kel = kelOf(s), wrap = h('div', { class: 'stack-g' }), aktif = s.status === 'aktif' && !s.diarsipkan;
      if (!isAl && s.status === 'alumni') { location.hash = '#/alumni/' + id; return h('div'); }
      var acts = [X.link('← Kembali', isAl ? '#/alumni/' + kel : '#/santri/' + kel)];
      if (!s.diarsipkan) acts.push(X.link('Ubah', '#/' + mode + '/' + id + '/ubah', { icon: 'file' }));
      if (aktif && !isAl) acts.push(btn('Pindahkan ke Alumni', function () { pindahModal(s); }, { icon: 'cap' }));
      if (isAl && !s.diarsipkan) acts.push(btn('Koreksi status', function () { koreksiModal(s); }, { ghost: true }), btn('Aktifkan kembali', function () { aktifkanModal(s); }, { ghost: true }));
      acts.push(btn(s.diarsipkan ? 'Pulihkan' : 'Arsipkan', function () { arsipDetail(s, !s.diarsipkan); }, { ghost: true, danger: !s.diarsipkan }));
      wrap.appendChild(h('section', { class: 'panel phead phead--big' }, X.avatar(s.foto_berkas, s.nama, 'xl'), h('div', { class: 'phead__t' }, h('h1', { text: s.nama }), h('p', { class: 'muted', text: [s.nis ? 'NIS ' + s.nis : 'NIS belum diisi', KEL[kel], s.tahun_masuk ? 'Masuk ' + s.tahun_masuk : null].filter(Boolean).join(' · ') }), h('div', { class: 'pills' }, X.pill(KEL[kel], 'info'), statusPill(s), isAl && s.tahun_keluar ? X.pill('Keluar ' + s.tahun_keluar, 'off') : null)), h('div', { class: 'acts acts--wrap' }, acts)));
      var tabs = X.tabsView([
        { k: 'profil', t: 'Profil ' + (isAl ? 'Alumni' : 'Santri'), render: function () { return tabProfil(d, isAl); } },
        { k: 'ortu', t: 'Data Ayah dan Ibu', render: function () { return tabOrtu(s); } },
        { k: 'wali', t: 'Data Wali', render: function () { return tabWali(s); } },
        { k: 'dokumen', t: 'Dokumen', render: function () { return tabDokumen(d, s); } },
        { k: 'pendidikan', t: 'Pendidikan', render: function () { return tabPendidikan(s, isAl); } },
        { k: 'asrama', t: 'Asrama dan Kamar', render: function () { return tabAsrama(d, s, aktif); } },
        { k: 'riwayat', t: 'Riwayat', render: function () { return tabRiwayat(d); } }], q.tab || 'profil', function (k) { X.setQuery({ tab: k === 'profil' ? '' : k }); });
      wrap.appendChild(tabs.el);
      return wrap;
    });
  }
  function tabProfil(d, isAl) {
    var s = d.santri, parts = [X.section('Identitas', X.dl([['NIS', s.nis], ['Nama lengkap', s.nama], ['Jenis kelamin', X.JK[s.jenis_kelamin]], ['Tempat, tanggal lahir', ttl(s)], ['Nomor telepon', s.telepon], ['Alamat lengkap', s.alamat, true], ['Tanggal masuk pondok', fmtDate(s.tanggal_masuk)], ['Tahun masuk', s.tahun_masuk], ['Catatan administrasi', s.catatan_admin, true]]))];
    if (isAl) parts.push(X.section('Informasi Alumni', X.dl([['Status alumni', ST_ALUMNI[s.status_alumni]], ['Tanggal keluar', fmtDate(s.tanggal_keluar)], ['Tahun keluar', s.tahun_keluar], ['Program pendidikan terakhir', s.program_terakhir], ['Asrama terakhir', s.asrama_terakhir], ['Keterangan kelulusan / alasan berhenti', s.keterangan_keluar, true], ['Catatan tambahan', s.catatan_alumni, true]])));
    parts.push(X.section('Modul terkait', h('div', { class: 'chips' }, d.integrasi.map(function (m) { return h('span', { class: 'chip', title: 'Dikerjakan pada tahap berikutnya' }, m.charAt(0).toUpperCase() + m.slice(1), h('em', { text: 'Segera' })); })), null));
    parts[parts.length - 1].appendChild(h('p', { class: 'muted', text: 'Profil ini sudah disiapkan agar dapat dipakai modul tersebut tanpa memasukkan ulang identitas.' }));
    return X.grid(parts);
  }
  function ortuPanel(t, nama, kerja, st) { return X.section(t, X.dl([['Nama', nama], ['Pekerjaan', kerja], ['Status', st ? X.ORTU[st] : null]])); }
  function tabOrtu(s) { return X.grid([ortuPanel('Ayah', s.nama_ayah, s.pekerjaan_ayah, s.status_ayah), ortuPanel('Ibu', s.nama_ibu, s.pekerjaan_ibu, s.status_ibu), h('p', { class: 'muted', text: 'Status diisi berdasarkan keterangan wali dan tidak disimpulkan otomatis.' })]); }
  function tabWali(s) { return X.grid([X.section('Wali', X.dl([['Nama wali', s.nama_wali], ['Hubungan', s.wali_hubungan], ['Pekerjaan', s.wali_pekerjaan], ['Nomor telepon', s.wali_telepon], ['Alamat wali', s.wali_alamat, true]]))]); }
  function tabPendidikan(s, isAl) { var p = [['Pendidikan formal', s.pendidikan_formal], ['Lembaga pendidikan', s.lembaga_pendidikan], ['Program pendidikan pesantren', s.program_pesantren, true]]; if (isAl) p.push(['Program pendidikan terakhir', s.program_terakhir, true]); return X.grid([X.section('Pendidikan', X.dl(p))]); }

  function docCard(title, berkas, actions) {
    var body = berkas ? [X.previewNode(X.berkasUrl(berkas.id), berkas.mime, berkas.nama_asli), h('small', { class: 'muted', text: [berkas.nama_asli, Math.round(berkas.ukuran / 1024) + ' KB', 'diunggah ' + X.fmtTime(berkas.diunggah)].join(' · ') }), h('div', { class: 'acts' }, h('a', { class: 'btn btn--ghost btn--sm', href: X.berkasUrl(berkas.id, true), text: 'Unduh' }), actions)] : [empty('Belum ada ' + title.toLowerCase(), 'Belum diunggah.', 'file'), h('div', { class: 'acts' }, actions)];
    return X.section(title, h('div', { class: 'doc' }, body));
  }
  function uploadModal(title, path, pdf, extraFields, onOk) {
    var ff = X.fileField({ label: title, pdf: pdf }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' }), extra = extraFields || [];
    X.modal(title, [note, ff.el].concat(extra.map(function (e) { return e.el; })), function (close) {
      return [btn('Batal', close, { ghost: true }), btn('Unggah', function (ev) {
        var f = ff.file(); if (!f) { note.hidden = false; note.textContent = 'Pilih berkas terlebih dahulu.'; return; }
        ev.target.disabled = true; var body = { nama: f.nama, data: f.data }; extra.forEach(function (e) { body[e.k] = e.get(); });
        api(path.method || 'PUT', path.url, body).then(function () { close(); onOk(); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = (e.fields && e.fields.berkas) || e.message; });
      })];
    });
  }
  function tabDokumen(d, s) {
    var can = !s.diarsipkan, kkAct = can ? btn(d.kk ? 'Ganti KK' : 'Unggah KK', function () { uploadModal('Foto Kartu Keluarga', { url: '/santri/' + s.id + '/kk' }, true, null, function () { done('KK diperbarui.'); }); }, { ghost: true, sm: true }) : null;
    var fotoAct = can ? btn(s.foto_berkas ? 'Ganti foto' : 'Unggah foto', function () { uploadModal('Foto', { url: '/santri/' + s.id + '/foto' }, false, null, function () { done('Foto diperbarui.'); }); }, { ghost: true, sm: true }) : null;
    var fotoB = s.foto_berkas ? { id: s.foto_berkas, mime: 'image/png', nama_asli: 'foto', ukuran: 0, diunggah: null } : null;
    var fotoCard = X.section('Foto ' + (s.status === 'alumni' ? 'alumni' : 'santri'), h('div', { class: 'doc' }, s.foto_berkas ? [h('img', { class: 'fprev__img', src: X.berkasUrl(s.foto_berkas), alt: 'Foto ' + s.nama }), h('div', { class: 'acts' }, fotoAct)] : [empty('Belum ada foto', 'Belum diunggah.', 'image'), h('div', { class: 'acts' }, fotoAct)]));
    var kkCard = docCard('Foto Kartu Keluarga (KK)', d.kk ? { id: d.kk.id, mime: d.kk.mime, nama_asli: d.kk.nama_asli, ukuran: d.kk.ukuran, diunggah: d.kk.diunggah } : null, kkAct);
    var others = X.section('Dokumen identitas dan pendukung', d.dokumen.length ? h('div', { class: 'doclist' }, d.dokumen.map(function (x) {
      return h('div', { class: 'docrow' }, ico('file'), h('div', { class: 'docrow__t' }, h('b', { text: (x.jenis === 'identitas' ? 'Identitas' : 'Pendukung') + (x.keterangan ? ' — ' + x.keterangan : '') }), h('small', { class: 'muted', text: x.nama_asli + ' · ' + Math.round(x.ukuran / 1024) + ' KB · ' + X.fmtTime(x.diunggah) })),
        h('div', { class: 'acts' }, btn('Pratinjau', function () { X.modal(x.nama_asli, [X.previewNode(X.berkasUrl(x.berkas_id), x.mime, x.nama_asli)], function (c) { return [btn('Tutup', c)]; }, { wide: true }); }, { ghost: true, sm: true }), h('a', { class: 'btn btn--ghost btn--sm', href: X.berkasUrl(x.berkas_id, true), text: 'Unduh' }),
          can ? btn('Hapus', function () { X.confirmDialog({ title: 'Hapus dokumen?', text: 'Dokumen ' + x.nama_asli + ' akan dihapus permanen dari penyimpanan.', danger: true, confirmLabel: 'Ya, hapus' }).then(function (c) { if (c) api('DELETE', '/santri/' + s.id + '/dokumen/' + x.id, { konfirmasi: true }).then(function () { done('Dokumen dihapus.'); }).catch(fail); }); }, { ghost: true, sm: true, danger: true }) : null));
    })) : empty('Belum ada dokumen', 'Tambahkan dokumen identitas atau dokumen pendukung lainnya.', 'file'),
      can ? btn('Tambah dokumen', function () {
        var jenis = h('select', { 'aria-label': 'Jenis dokumen' }, h('option', { value: 'identitas', text: 'Dokumen identitas' }), h('option', { value: 'pendukung', text: 'Dokumen pendukung lainnya' })), ket = h('input', { maxlength: '200', 'aria-label': 'Keterangan', placeholder: 'Keterangan (opsional)' });
        uploadModal('Tambah dokumen', { method: 'POST', url: '/santri/' + s.id + '/dokumen' }, true, [{ k: 'jenis', get: function () { return jenis.value; }, el: h('div', { class: 'field' }, h('label', { text: 'Jenis dokumen' }), jenis) }, { k: 'keterangan', get: function () { return ket.value; }, el: h('div', { class: 'field' }, h('label', { text: 'Keterangan' }), ket) }], function () { done('Dokumen ditambahkan.'); });
      }, { ghost: true, sm: true, icon: 'plus' }) : null);
    return X.grid([h('div', { class: 'note note--warn' }, ico('lock'), ' Dokumen dilindungi: hanya Super Admin yang dapat membuka. Setiap pembukaan dokumen tercatat pada Aktivitas Sistem.'), h('div', { class: 'grid2' }, fotoCard, kkCard), others]);
  }
  function tabAsrama(d, s, aktif) {
    var now = d.kamar ? dlNow(d.kamar) : (s.status === 'alumni' ? [['Penempatan', 'Alumni tidak menempati kamar'], ['Asrama terakhir', s.asrama_terakhir]] : [['Penempatan', 'Belum ditempatkan di kamar']]);
    var acts = aktif ? h('div', { class: 'acts' }, btn(d.kamar ? 'Pindahkan kamar / asrama' : 'Tempatkan di kamar', function () { placeModal(s, d.kamar); }, { icon: 'bed' }), d.kamar ? btn('Keluarkan dari kamar', function () { X.confirmDialog({ title: 'Keluarkan dari kamar?', text: s.nama + ' akan dikeluarkan dari ' + d.kamar.asrama + ' / ' + d.kamar.nama + '.', reason: 'optional', danger: true, confirmLabel: 'Ya, keluarkan' }).then(function (c) { if (c) api('POST', '/santri/' + s.id + '/penempatan', { kamar_id: null, alasan: c.alasan }).then(function () { done('Dikeluarkan dari kamar.'); }).catch(fail); }); }, { ghost: true, danger: true }) : null) : null;
    return X.grid([X.section('Penempatan saat ini', h('div', { class: 'stack-s' }, X.dl(now), acts)), X.section('Riwayat perpindahan', penempatanTable(d.penempatan))]);
  }
  function dlNow(k) { return [['Asrama', k.asrama], ['Kamar', k.nama], ['Jenis penghuni', k.jenis === 'putra' ? 'Putra' : 'Putri']]; }
  function penempatanTable(rows) {
    return X.table([{ t: 'Waktu', f: function (r) { return X.fmtTime(r.waktu); } }, { t: 'Jenis', f: function (r) { return JENIS_PENEMPATAN[r.jenis]; } }, { t: 'Dari', f: function (r) { return r.dari_kamar ? r.dari_asrama + ' / ' + r.dari_kamar : null; } }, { t: 'Ke', f: function (r) { return r.ke_kamar ? r.ke_asrama + ' / ' + r.ke_kamar : null; } }, { t: 'Oleh', k: 'oleh_username' }, { t: 'Alasan', k: 'alasan' }], rows, empty('Belum ada riwayat', 'Perpindahan kamar akan tercatat di sini.', 'bed'));
  }
  function tabRiwayat(d) {
    if (!d.riwayat.length) return empty('Belum ada riwayat', '', 'list');
    return h('section', { class: 'panel' }, h('ol', { class: 'timeline' }, d.riwayat.map(function (r) {
      var det = r.data_sebelum || r.data_sesudah ? (r.jenis === 'ubah_data' ? Object.keys(r.data_sesudah || {}).map(function (k) { return k + ': ' + (r.data_sebelum && r.data_sebelum[k] != null ? r.data_sebelum[k] : '—') + ' → ' + (r.data_sesudah[k] != null ? r.data_sesudah[k] : '—'); }).join(' · ') : changeText(r.data_sebelum, r.data_sesudah)) : null;
      return h('li', null, h('b', { text: JENIS_RIWAYAT[r.jenis] || r.jenis }), h('time', { text: X.fmtTime(r.waktu) + ' · oleh ' + (r.oleh_username || 'sistem') }),
        r.status_sebelum || r.status_sesudah ? h('span', { class: 'muted', text: 'Status: ' + (r.status_sebelum || '—') + ' → ' + (r.status_sesudah || '—') }) : null, r.alasan ? h('span', { text: r.alasan }) : null, det ? h('small', { class: 'muted trunc2', title: det, text: det }) : null);
    })));
  }

  // ---------- aksi ----------
  function arsipDetail(s, want) {
    X.confirmDialog({ title: (want ? 'Arsipkan ' : 'Pulihkan ') + (s.status === 'alumni' ? 'alumni' : 'santri') + '?', text: want ? s.nama + ' akan diarsipkan. Data dan riwayat tetap tersimpan dan tidak dihapus.' : s.nama + ' akan dikembalikan dari arsip.', reason: 'optional', danger: want, confirmLabel: want ? 'Ya, arsipkan' : 'Ya, pulihkan' }).then(function (c) {
      if (!c) return; var mod = s.status === 'alumni' ? 'alumni' : 'santri';
      api('POST', '/' + mod + '/' + s.id + (want ? '/arsip' : '/pulihkan'), { konfirmasi: true, alasan: c.alasan }).then(function () { done(want ? 'Diarsipkan.' : 'Dipulihkan.'); }).catch(fail);
    });
  }
  function pindahModal(s) {
    var stat = h('select', { id: 'pm_st' }, h('option', { value: '', text: '— Pilih status keluar —' }), h('option', { value: 'lulus', text: 'Lulus' }), h('option', { value: 'berhenti', text: 'Berhenti / keluar sebelum lulus' }));
    var tgl = h('input', { type: 'date', max: X.today(), id: 'pm_tgl' }), thn = h('input', { type: 'number', min: '1900', max: String(yearNow + 1), id: 'pm_thn' }), ket = h('textarea', { rows: '3', maxlength: '500', id: 'pm_ket' }), prog = h('input', { maxlength: '150', id: 'pm_prog', value: s.program_pesantren || s.pendidikan_formal || '' }), cat = h('textarea', { rows: '2', maxlength: '1000', id: 'pm_cat' });
    var manual = false; thn.addEventListener('input', function () { manual = true; }); tgl.addEventListener('change', function () { if (tgl.value && !manual) thn.value = tgl.value.slice(0, 4); });
    var chk = h('input', { type: 'checkbox', id: 'pm_ck' }), err = h('div', { class: 'note note--bad', role: 'alert', hidden: true });
    var F = function (id, label, el, help) { return h('div', { class: 'field', id: 'f_' + id }, h('label', { for: el.id, text: label }), el, help ? h('small', { class: 'help', text: help }) : null, h('span', { class: 'err', id: id + 'E' })); };
    X.modal('Pindahkan ke Alumni', [h('p', { class: 'mtext' }, h('b', { text: s.nama }), ' akan menjadi alumni. Identitas, data keluarga, dokumen, dan seluruh riwayat tetap tersimpan pada data yang sama (tidak disalin).'), err,
      F('status_alumni', 'Status keluar *', stat), F('tanggal_keluar', 'Tanggal keluar / kelulusan *', tgl), F('tahun_keluar', 'Tahun keluar', thn, 'Terisi otomatis dari tanggal; dapat dikoreksi.'),
      F('keterangan_keluar', 'Keterangan kelulusan / alasan berhenti', ket), F('program_terakhir', 'Program pendidikan terakhir', prog), F('catatan_alumni', 'Catatan tambahan', cat),
      h('div', { class: 'note note--warn' }, h('b', { text: 'Akibat pemindahan: ' }), 'status berubah menjadi Alumni; tidak dihitung sebagai santri aktif; dikeluarkan dari kamar' + (s.kamar_id ? ' (saat ini menempati kamar)' : '') + '; pemindahan dicatat dengan nama pengguna dan waktu.'),
      h('label', { class: 'check' }, chk, ' Saya memahami dan ingin memindahkan santri ini ke Data Alumni.')], function (close) {
      return [btn('Batal', close, { ghost: true }), btn('Pindahkan ke Alumni', function (ev) {
        if (!chk.checked) { err.hidden = false; err.textContent = 'Centang pernyataan konfirmasi terlebih dahulu.'; return; }
        err.hidden = true; ev.target.disabled = true;
        api('POST', '/santri/' + s.id + '/pindah-alumni', { konfirmasi: true, status_alumni: stat.value, tanggal_keluar: tgl.value, tahun_keluar: thn.value, keterangan_keluar: ket.value, program_terakhir: prog.value, catatan_alumni: cat.value }).then(function () { close(); toast(s.nama + ' dipindahkan ke Data Alumni.'); location.hash = '#/alumni/' + s.id; })
          .catch(function (e) { ev.target.disabled = false; err.hidden = false; err.textContent = e.message; ['status_alumni', 'tanggal_keluar', 'tahun_keluar', 'keterangan_keluar', 'program_terakhir', 'catatan_alumni'].forEach(function (k) { var w = document.getElementById('f_' + k), sp = document.getElementById(k + 'E'); if (w) w.classList.toggle('bad', !!(e.fields && e.fields[k])); if (sp) sp.textContent = e.fields && e.fields[k] || ''; }); });
      }, { danger: true })];
    }, { sticky: true });
  }
  function koreksiModal(s) {
    var stat = h('select', { id: 'kr_st' }, h('option', { value: 'lulus', selected: s.status_alumni === 'lulus', text: 'Lulus' }), h('option', { value: 'berhenti', selected: s.status_alumni === 'berhenti', text: 'Berhenti' }));
    var tgl = h('input', { type: 'date', max: X.today(), id: 'kr_tgl', value: s.tanggal_keluar || '' }), thn = h('input', { type: 'number', min: '1900', max: String(yearNow + 1), id: 'kr_thn', value: s.tahun_keluar || '' }), ket = h('textarea', { rows: '2', maxlength: '500', id: 'kr_ket' }); ket.value = s.keterangan_keluar || '';
    var alasan = h('textarea', { rows: '2', maxlength: '500', id: 'kr_as', placeholder: 'Mengapa koreksi ini dilakukan? (wajib)' }), err = h('div', { class: 'note note--bad', role: 'alert', hidden: true }), chk = h('input', { type: 'checkbox' });
    var oldTgl = s.tanggal_keluar || ''; tgl.addEventListener('change', function () { if (tgl.value && tgl.value !== oldTgl) thn.value = tgl.value.slice(0, 4); });
    var F = function (label, el) { return h('div', { class: 'field' }, h('label', { for: el.id, text: label }), el); };
    X.modal('Koreksi status alumni', [h('p', { class: 'mtext', text: 'Ubah status Lulus/Berhenti, tanggal, atau tahun keluar ' + s.nama + '. Nilai sebelumnya tetap tersimpan pada riwayat.' }), err, F('Status alumni', stat), F('Tanggal keluar', tgl), F('Tahun keluar', thn), F('Keterangan', ket), F('Alasan koreksi *', alasan), h('label', { class: 'check' }, chk, ' Saya mengonfirmasi koreksi ini.')], function (close) {
      return [btn('Batal', close, { ghost: true }), btn('Simpan koreksi', function (ev) {
        if (!chk.checked) { err.hidden = false; err.textContent = 'Centang konfirmasi terlebih dahulu.'; return; }
        ev.target.disabled = true; api('POST', '/alumni/' + s.id + '/koreksi', { konfirmasi: true, alasan: alasan.value, status_alumni: stat.value, tanggal_keluar: tgl.value, tahun_keluar: thn.value, keterangan_keluar: ket.value }).then(function () { close(); done('Koreksi disimpan.'); })
          .catch(function (e) { ev.target.disabled = false; err.hidden = false; err.textContent = e.message + (e.fields ? ' ' + Object.keys(e.fields).map(function (k) { return e.fields[k]; }).join(' ') : ''); });
      })];
    }, { sticky: true });
  }
  function aktifkanModal(s) {
    X.confirmDialog({ title: 'Aktifkan kembali sebagai santri?', text: s.nama + ' akan kembali menjadi santri aktif (belum ditempatkan di kamar). Data alumni sebelumnya tetap tersimpan pada riwayat.', reason: 'required', reasonLabel: 'Alasan pengaktifan kembali *', confirmLabel: 'Ya, aktifkan kembali', warn: 'Gunakan hanya untuk memperbaiki kesalahan pemindahan.' })
      .then(function (c) { if (c) api('POST', '/alumni/' + s.id + '/aktifkan-kembali', { konfirmasi: true, alasan: c.alasan }).then(function () { toast('Diaktifkan kembali sebagai santri.'); location.hash = '#/santri/' + s.id; }).catch(fail); });
  }
  // penempatan / pindah kamar / pindah asrama
  function placeModal(s, kamarNow, onDone) {
    var kel = kelOf(s), asr = h('select', { id: 'pl_a', 'aria-label': 'Asrama' }), kmr = h('select', { id: 'pl_k', 'aria-label': 'Kamar' }), alasan = h('input', { maxlength: '300', id: 'pl_r' }), err = h('div', { class: 'note note--bad', role: 'alert', hidden: true }), rows = [];
    function fill() { var a = asr.value; kmr.innerHTML = ''; kmr.appendChild(h('option', { value: '', text: '— Pilih kamar —' })); rows.filter(function (k) { return String(k.asrama_id) === a && (!kamarNow || k.id !== kamarNow.id); }).forEach(function (k) { kmr.appendChild(h('option', { value: k.id, text: k.nama + ' (sisa ' + k.sisa + ' dari ' + k.kapasitas + ')' })); }); }
    asr.addEventListener('change', fill);
    api('GET', '/kamar?jenis=' + kel + '&tersedia=1').then(function (d) {
      rows = d.rows; var seen = {}; asr.appendChild(h('option', { value: '', text: rows.length ? '— Pilih asrama —' : 'Belum ada kamar tersedia' }));
      rows.forEach(function (k) { if (!seen[k.asrama_id]) { seen[k.asrama_id] = 1; asr.appendChild(h('option', { value: k.asrama_id, text: k.asrama })); } }); fill();
    }).catch(function (e) { err.hidden = false; err.textContent = e.message; });
    var F = function (label, el) { return h('div', { class: 'field' }, h('label', { for: el.id, text: label }), el); };
    X.modal(kamarNow ? 'Pindahkan ' + s.nama : 'Tempatkan ' + s.nama, [h('p', { class: 'mtext', text: 'Hanya asrama ' + KEL[kel] + ' yang ditampilkan, sesuai jenis kelamin santri. Kamar yang penuh tidak muncul.' }), kamarNow ? h('p', { class: 'note note--warn', text: 'Saat ini: ' + kamarNow.asrama + ' / ' + kamarNow.nama }) : null, err, F('Asrama', asr), F('Kamar', kmr), F('Alasan (opsional)', alasan)], function (close) {
      return [btn('Batal', close, { ghost: true }), btn('Simpan penempatan', function (ev) {
        if (!kmr.value) { err.hidden = false; err.textContent = 'Pilih kamar tujuan.'; return; }
        ev.target.disabled = true; api('POST', '/santri/' + s.id + '/penempatan', { kamar_id: +kmr.value, alasan: alasan.value }).then(function () { close(); toast('Penempatan disimpan.'); if (onDone) onDone(); else X.route(); }).catch(function (e) { ev.target.disabled = false; err.hidden = false; err.textContent = e.message; });
      })];
    });
  }
  X.placeModal = placeModal; X.penempatanTable = penempatanTable;

  // ================= DAFTAR ALUMNI & STATISTIK =================
  function listAlumni(kel) {
    var wrap = h('div', { class: 'stack-g' });
    var filters = [{ k: 'status_alumni', label: 'Status alumni', options: [{ v: 'lulus', l: 'Lulus' }, { v: 'berhenti', l: 'Berhenti' }] }, { k: 'tahun_masuk', label: 'Tahun masuk', options: [] }, { k: 'tahun_keluar', label: 'Tahun keluar', options: [] }, { k: 'arsip', label: 'Arsip', blank: 'Arsip: tidak diarsipkan', options: [{ v: 'arsip', l: 'Diarsipkan' }, { v: 'semua', l: 'Semua' }] }];
    var cols = [{ t: 'No', f: function (r) { return r._no; }, cls: 'c-no' }, { t: 'Foto', f: function (r) { return X.avatar(r.foto_berkas, r.nama); } }, { t: 'NIS sebelumnya', k: 'nis', sort: 'nis' }, { t: 'Nama lengkap', f: function (r) { return nameLink(r, 'alumni'); }, sort: 'nama' },
      { t: 'Jenis kelamin', f: function (r) { return X.JK[r.jenis_kelamin]; } }, { t: 'Tempat, tanggal lahir', f: ttl }, { t: 'Alamat', f: function (r) { return trunc(r.alamat); } }, { t: 'Nama ayah', k: 'nama_ayah' }, { t: 'Nama ibu', k: 'nama_ibu' },
      { t: 'Tahun masuk', k: 'tahun_masuk', sort: 'tahun_masuk' }, { t: 'Tahun keluar', k: 'tahun_keluar', sort: 'tahun_keluar' }, { t: 'Program terakhir', k: 'program_terakhir' }, { t: 'Status alumni', f: statusPill, sort: 'status' },
      { t: 'Aksi', f: function (r) { return h('div', { class: 'acts' }, X.link('Detail', '#/alumni/' + r.id, { sm: true }), !r.diarsipkan ? X.link('Ubah', '#/alumni/' + r.id + '/ubah', { sm: true }) : null, btn(r.diarsipkan ? 'Pulihkan' : 'Arsipkan', function () { arsipDetail(Object.assign({ status: 'alumni' }, r), !r.diarsipkan); }, { ghost: true, sm: true })); } }];
    var lv = X.listView({ endpoint: '/alumni', base: kel === 'semua' ? {} : { kelompok: kel }, search: 'Cari nama atau NIS', filters: filters, cols: cols, defSort: 'tahun_keluar', defDir: 'desc',
      emptyEl: empty('Belum ada data alumni', 'Alumni muncul setelah santri dipindahkan lewat tombol “Pindahkan ke Alumni” pada halaman detail santri, atau ditambahkan manual.', 'cap', X.link('Tambah alumni manual', '#/alumni/baru', { ghost: false, icon: 'plus' })),
      onLoaded: function (d, setOptions) { if (d.pilihan) { setOptions('tahun_masuk', yearOpts(d.pilihan.tahun_masuk)); setOptions('tahun_keluar', yearOpts(d.pilihan.tahun_keluar)); } } });
    wrap.appendChild(X.head('Data Alumni' + (kel === 'semua' ? '' : ' ' + KEL[kel]), 'Alumni memakai data utama yang sama dengan santri (tanpa salinan).', X.link('Tambah alumni manual', '#/alumni/baru', { ghost: false, icon: 'plus' })));
    wrap.appendChild(h('section', { class: 'panel stack-s' }, tabs(kel, 'alumni', [['semua', 'Semua Alumni'], ['putra', 'Alumni Putra'], ['putri', 'Alumni Putri'], ['statistik', 'Statistik']]), lv.el));
    return wrap;
  }
  function statAlumni() {
    return api('GET', '/alumni/statistik').then(function (d) {
      var max = Math.max.apply(null, [1].concat(d.per_tahun.map(function (r) { return r.total; })));
      var rows = d.per_tahun.map(function (r) { var b = h('div', { class: 'bar', role: 'img', 'aria-label': r.total + ' alumni' }, h('i')); b.firstChild.style.width = Math.round(r.total / max * 100) + '%'; return h('div', { class: 'yrow' }, h('b', { text: r.tahun || 'Tidak diketahui' }), b, h('span', { text: r.total + ' (Lulus ' + r.lulus + ' · Berhenti ' + r.berhenti + ' · Putra ' + r.putra + ' · Putri ' + r.putri + ')' })); });
      return h('div', { class: 'stack-g' }, X.head('Statistik Alumni', d.catatan), h('section', { class: 'panel stack-s' }, tabs('statistik', 'alumni', [['semua', 'Semua Alumni'], ['putra', 'Alumni Putra'], ['putri', 'Alumni Putri'], ['statistik', 'Statistik']])),
        h('div', { class: 'stats' }, X.stat('Total seluruh alumni', d.total, d.total ? '' : 'Belum ada alumni'), X.stat('Alumni putra', d.putra, ''), X.stat('Alumni putri', d.putri, ''), X.stat('Alumni lulus', d.lulus, ''), X.stat('Alumni berhenti', d.berhenti, '')),
        X.section('Jumlah alumni berdasarkan tahun keluar', rows.length ? h('div', { class: 'years' }, rows) : empty('Belum ada data', 'Statistik terisi otomatis dari data alumni.', 'chart')));
    });
  }

  // ================= ROUTER MODUL =================
  X.views.santri = function (p, q) {
    var a = p[0];
    if (a === 'baru') return formSantri(null, q.k === 'putri' ? 'putri' : 'putra', 'santri');
    if (/^\d+$/.test(a || '')) return p[1] === 'ubah' ? formSantri(+a, null, 'santri') : detail(+a, 'santri', q);
    return Promise.resolve(listSantri(a === 'putri' ? 'putri' : 'putra'));
  };
  X.views.alumni = function (p, q) {
    var a = p[0];
    if (a === 'baru') return formSantri(null, 'putra', 'alumni');
    if (a === 'statistik') return statAlumni();
    if (/^\d+$/.test(a || '')) return p[1] === 'ubah' ? formSantri(+a, null, 'alumni') : detail(+a, 'alumni', q);
    return Promise.resolve(listAlumni(a === 'putra' || a === 'putri' ? a : 'semua'));
  };
})();
