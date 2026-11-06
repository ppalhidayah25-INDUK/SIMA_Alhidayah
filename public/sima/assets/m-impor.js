/* SIMA - Tahap 8: Impor / Migrasi Data (Excel/CSV): template -> unggah -> pratinjau & validasi -> konfirmasi -> impor -> verifikasi -> riwayat. */
(function () {
  'use strict';
  var X = window.SIMA, K = X.kit, h = X.h, api = X.api, toast = X.toast, empty = X.empty, btn = X.btn, pill = X.pill, selectEl = K.selectEl;
  function fail(e) { toast(e.message, true); }
  var ST = { valid: ['Lolos', 'ok'], peringatan: ['Perlu diperbaiki (tetap diimpor)', 'info'], gagal: ['Gagal (tidak diimpor)', 'off'], duplikat: ['Duplikat (dilewati)', 'off'] };
  var STAT_RIW = { pratinjau: ['Menunggu konfirmasi', 'info'], selesai: ['Selesai', 'ok'], dibatalkan: ['Dibatalkan', 'off'], gagal: ['Gagal', 'off'] };

  X.views.impor = function () {
    var wrap = h('div', { class: 'stack-g' }, X.head('Impor Data', 'Masukkan data asli pondok dari Excel (.xlsx) atau CSV. Data diperiksa lebih dulu, ditampilkan sebagai pratinjau, dan baru disimpan setelah Anda mengonfirmasi. Data lama tidak pernah ditimpa atau dihapus.'));
    return api('GET', '/impor/jenis').then(function (cat) {
      var cur = null, area = h('div', { class: 'stack-s' }), hist = h('div', { class: 'stack-s' }), file = h('input', { type: 'file', accept: '.xlsx,.csv', 'aria-label': 'Pilih berkas impor' });
      var sel = selectEl(cat.jenis.map(function (j, i) { return { v: j.id, l: (i + 1) + '. ' + j.label }; }), 'Pilih jenis data…');
      var info = h('div', { class: 'stack-s' }), out = h('div', { class: 'stack-s' });
      function drawInfo() {
        info.innerHTML = ''; out.innerHTML = ''; cur = cat.jenis.filter(function (j) { return j.id === sel.value; })[0]; if (!cur) return;
        info.appendChild(h('div', { class: 'tools tools--start' }, h('a', { class: 'btn btn--ghost', href: '/api/sima/impor/template/' + cur.id, text: 'Unduh template Excel' }), h('a', { class: 'btn btn--ghost', href: '/api/sima/impor/template/' + cur.id + '?format=csv', text: 'Unduh template CSV' })));
        info.appendChild(h('p', { class: 'muted', text: 'Format kolom (kolom bertanda * wajib diisi). Template berisi lembar “Petunjuk” yang sama; tidak ada data contoh di lembar Data.' }));
        info.appendChild(h('div', { class: 'scroll' }, X.table([{ t: 'Kolom', f: function (r) { return r.t + (r.wajib ? ' *' : ''); } }, { t: 'Format', k: 'fmt' }, { t: 'Contoh', f: function (r) { return r.contoh || '—'; } }], cur.kolom)));
        if (/santri|alumni/.test(cur.id)) info.appendChild(h('p', { class: 'note note--warn', text: 'Foto dan Kartu Keluarga (KK) tidak diimpor lewat Excel. Unggah dari halaman detail santri agar tersimpan dengan aman.' }));
        if (/^santri/.test(cur.id)) info.appendChild(h('p', { class: 'muted', text: 'Untuk menempatkan santri langsung ke kamar, isi kolom Asrama dan Kamar. Asrama/kamar harus sudah ada (impor Data Asrama dan Data Kamar lebih dulu).' }));
      }
      sel.addEventListener('change', drawInfo);
      var go = btn('Periksa berkas (belum disimpan)', function (ev) {
        if (!cur) { toast('Pilih jenis data dahulu.', true); return; } var f = file.files && file.files[0]; if (!f) { toast('Pilih berkas Excel/CSV.', true); return; }
        if (f.size > cat.batas.ukuran_mb * 1048576) { toast('Berkas terlalu besar (maks. ' + cat.batas.ukuran_mb + ' MB).', true); return; }
        ev.target.disabled = true; out.innerHTML = ''; out.appendChild(h('p', { class: 'muted', role: 'status', text: 'Memeriksa berkas…' }));
        var fr = new FileReader(); fr.onerror = function () { ev.target.disabled = false; toast('Berkas tidak dapat dibaca.', true); };
        fr.onload = function () {
          api('POST', '/impor/analisis', { jenis: cur.id, nama_berkas: f.name, isi: String(fr.result).split(',')[1] || '' }).then(function (r) { ev.target.disabled = false; pratinjau(r); }).catch(function (e) { ev.target.disabled = false; out.innerHTML = ''; out.appendChild(X.errNote(e)); });
        };
        fr.readAsDataURL(f);
      });
      function pratinjau(r) {
        out.innerHTML = ''; var imp = r.valid + r.peringatan, skip = r.gagal + r.duplikat, ack = h('input', { type: 'checkbox', id: 'impAck' });
        out.appendChild(h('section', { class: 'panel stack-s' }, h('h2', { text: 'Pratinjau: ' + r.label }),
          h('div', { class: 'stats' }, [X.stat('Total baris', r.total, ''), X.stat('Akan diimpor', imp, r.peringatan + ' perlu diperbaiki'), X.stat('Gagal', r.gagal, r.gagal ? 'perbaiki di berkas' : ''), X.stat('Duplikat', r.duplikat, r.duplikat ? 'dilewati' : '')]),
          r.kolom_diabaikan && r.kolom_diabaikan.length ? h('p', { class: 'note note--warn', text: 'Kolom tidak dikenali dan diabaikan: ' + r.kolom_diabaikan.join(', ') }) : null,
          h('p', { class: 'muted', text: 'Belum ada data yang disimpan. Pratinjau menampilkan hingga 100 baris pertama.' }),
          h('div', { class: 'scroll' }, X.table([{ t: 'Baris', k: 'baris' }, { t: 'Status', f: function (x) { return pill(ST[x.status][0], ST[x.status][1]); } }, { t: 'Data', f: function (x) { return x.ringkas.join(' · '); } }, { t: 'Keterangan', f: function (x) { return x.pesan.join(' | ') || '—'; } }], r.pratinjau)),
          r.potong ? h('p', { class: 'note note--warn', text: 'Daftar masalah dipotong. Unduh laporan lengkap sebelum memperbaiki berkas.' }) : null,
          h('div', { class: 'tools tools--start' }, h('a', { class: 'btn btn--ghost', href: '/api/sima/impor/' + r.id + '?format=xlsx', text: 'Unduh daftar masalah (Excel)' }),
            btn('Batalkan', function () { api('POST', '/impor/' + r.id + '/batal', { konfirmasi: true }).then(function () { out.innerHTML = ''; toast('Pratinjau dibatalkan. Tidak ada data yang disimpan.'); loadHist(); }).catch(fail); }, { ghost: true })),
          skip ? h('label', { class: 'check' }, ack, ' Saya mengerti ' + skip + ' baris (gagal/duplikat) akan dilewati dan tidak disimpan.') : null,
          h('div', { class: 'tools tools--end' }, btn('Impor ' + imp + ' baris', function (ev) {
            if (!imp) { toast('Tidak ada baris yang lolos validasi. Perbaiki berkas lalu periksa ulang.', true); return; }
            if (skip && !ack.checked) { toast('Centang persetujuan pelewatan baris terlebih dahulu.', true); return; }
            X.confirmDialog({ title: 'Simpan ' + imp + ' baris ke database?', text: 'Semua baris disimpan dalam satu proses: bila ada kegagalan, tidak ada yang tersimpan. Data yang sudah ada tidak diubah. Pastikan Anda sudah membuat backup.', confirmLabel: 'Ya, impor' }).then(function (c) {
              if (!c) return; ev.target.disabled = true;
              api('POST', '/impor/' + r.id + '/jalankan', { konfirmasi: true, lewati: true }).then(function (x) { out.innerHTML = ''; out.appendChild(h('section', { class: 'panel stack-s' }, h('h2', { text: 'Impor selesai' }), K.kv([['Jenis data', x.label], ['Berhasil disimpan', x.diimpor], ['Gagal (dilewati)', x.gagal], ['Duplikat (dilewati)', x.duplikat], ['Perlu diperbaiki (tetap diimpor)', x.peringatan], ['Verifikasi', x.verifikasi]]))); toast('Impor selesai: ' + x.diimpor + ' baris.'); loadHist(); }).catch(function (e) { ev.target.disabled = false; toast(e.message, true); });
            });
          }, { disabled: !imp }))));
      }
      function loadHist() {
        api('GET', '/impor').then(function (d) {
          hist.innerHTML = '';
          hist.appendChild(d.rows.length ? h('div', { class: 'scroll' }, X.table([{ t: 'Waktu', f: function (r) { return X.fmtTime(r.dibuat); } }, { t: 'Jenis', f: function (r) { return d.label[r.jenis] || r.jenis; } }, { t: 'Berkas', k: 'berkas_nama' }, { t: 'Status', f: function (r) { var s = STAT_RIW[r.status] || [r.status, 'info']; return pill(s[0], s[1]); } },
            { t: 'Total', k: 'total' }, { t: 'Diimpor', f: function (r) { return r.diimpor == null ? '—' : r.diimpor; } }, { t: 'Gagal', k: 'gagal' }, { t: 'Duplikat', k: 'duplikat' }, { t: 'Oleh', k: 'oleh_username' },
            { t: 'Aksi', f: function (r) { var a = h('div', { class: 'acts' }); a.appendChild(h('a', { class: 'btn btn--ghost btn--sm', href: '/api/sima/impor/' + r.id + '?format=xlsx', text: 'Masalah' })); if (r.status === 'selesai') a.appendChild(btn('Verifikasi', function () { api('POST', '/impor/' + r.id + '/verifikasi', {}).then(function (v) { toast(v.catatan + ' (' + v.ditemukan + '/' + v.diimpor + ')', !v.sesuai); }).catch(fail); }, { ghost: true, sm: true })); return a; } }], d.rows)) : empty('Belum ada riwayat impor', 'Riwayat akan tampil setelah Anda memeriksa berkas.', 'list'));
        }).catch(function (e) { hist.innerHTML = ''; hist.appendChild(X.errNote(e)); });
      }
      wrap.appendChild(h('section', { class: 'panel stack-s' }, h('h2', { text: 'Langkah impor' }),
        h('ol', { class: 'muted' }, h('li', { text: 'Urutan yang disarankan: Asrama → Kamar → Santri → Alumni → Pengurus → Pengajar.' }), h('li', { text: 'Pilih jenis data, unduh template, isi data asli, simpan.' }), h('li', { text: 'Unggah berkas, periksa pratinjau dan daftar kesalahan, perbaiki bila perlu.' }), h('li', { text: 'Konfirmasi impor. Hasil diverifikasi dan dicatat di riwayat.' })),
        h('div', { class: 'fs__grid' }, h('div', { class: 'field' }, h('label', { text: '1. Jenis data' }), sel), h('div', { class: 'field' }, h('label', { text: '2. Berkas Excel/CSV terisi' }), file)), info, h('div', { class: 'tools tools--start' }, go), out));
      wrap.appendChild(h('section', { class: 'panel stack-s' }, h('h2', { text: 'Riwayat impor' }), hist));
      loadHist(); return wrap;
    });
  };
})();
