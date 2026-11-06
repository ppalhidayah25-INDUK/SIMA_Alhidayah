/* SIMA - Modul Berita & Galeri (Super Admin). SIMA adalah satu-satunya tempat mengelola konten; website publik hanya membaca konten yang sudah diterbitkan.
   Tidak ada berita, kategori, foto, atau video contoh di berkas ini; semua data berasal dari API. */
(function () {
  'use strict';
  var X = window.SIMA, K = X.kit, h = X.h, api = X.api, toast = X.toast, empty = X.empty, btn = X.btn, fmtDate = X.fmtDate, qs = X.qs, pill = X.pill;
  var field = K.field, selectEl = K.selectEl, formModal = K.formModal, wib = K.wib;
  var R = '#/berita/';
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function fail(e) { toast(e.message, true); }
  function nm(rows) { return rows.map(function (r) { return { v: r.id, l: r.nama + (r.aktif === false ? ' (nonaktif)' : '') }; }); }
  var STAT = { draft: ['Draft', 'off'], terjadwal: ['Terjadwal', 'info'], terbit: ['Terbit', 'ok'], arsip: ['Diarsipkan', 'off'], dihapus: ['Dihapus', 'off'] };
  function statPill(s) { var x = STAT[s] || [s, 'off']; return pill(x[0], x[1]); }
  var admImg = function (id, thumb) { return '/api/sima/konten/media/' + id + '/berkas' + (thumb ? '?thumb=1' : ''); };
  function mediaOf(url) { var m = /\/media\/(\d+)-([0-9a-f]{8})/.exec(url || ''); return m ? { id: +m[1], token: m[2] } : null; }
  function wibInp(ms) { var p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms == null ? Date.now() : ms)); return p.replace(' ', 'T'); }
  var toMs = function (v) { return v ? Date.parse(v + ':00+07:00') : null; };
  function slugify(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' dan ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, ''); }
  var REF = null;
  function loadRef(force) { return REF && !force ? Promise.resolve(REF) : api('GET', '/konten/ref').then(function (d) { REF = d; return d; }); }
  function thumbImg(id, alt, cls) { return id ? h('img', { class: cls || 'kt-th', src: admImg(id, true), alt: alt || '', loading: 'lazy', width: '64', height: '48' }) : h('span', { class: 'kt-th kt-th--none', 'aria-hidden': 'true', text: '—' }); }

  var NAV = [['dashboard', 'Dashboard Konten'], ['semua', 'Semua Berita'], ['tambah', 'Tambah Berita'], ['kategori', 'Kategori Berita'], ['unggulan', 'Berita Unggulan'], ['galeri', 'Semua Dokumentasi'], ['upload', 'Upload Foto'], ['video', 'Manajemen Video'], ['kategori-galeri', 'Kategori Galeri'], ['media', 'Media Library'], ['statistik', 'Statistik Konten']];
  function nav(active) { return h('nav', { class: 'tabs tabs--wrap', 'aria-label': 'Menu konten' }, NAV.map(function (n) { return h('a', { class: 'tab' + (n[0] === active ? ' is-on' : ''), href: R + n[0], text: n[1] }); })); }
  function page(active, title, sub, extra) { var body = h('div', { class: 'stack-s' }); return { el: h('div', { class: 'stack-g' }, X.head(title, sub, extra), h('section', { class: 'panel stack-s' }, nav(active), body)), body: body }; }
  function errBox(box, e) { box.innerHTML = ''; box.appendChild(X.errNote(e)); }

  // ---------- unggah foto (kompres di peramban agar muat batas serverless; server tetap memvalidasi isi & mengoptimasi) ----------
  function prepFile(file) {
    return new Promise(function (res, rej) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return rej(new Error('"' + file.name + '": format harus JPG, PNG, atau WebP.'));
      var fr = new FileReader(); fr.onerror = function () { rej(new Error('Gagal membaca "' + file.name + '".')); };
      fr.onload = function () {
        var src = fr.result;
        if (file.size <= 1.5 * 1024 * 1024) return res({ nama: file.name, data: src });
        var im = new Image(); im.onerror = function () { rej(new Error('"' + file.name + '" bukan gambar yang valid.')); };
        im.onload = function () {
          var s = Math.min(1, 2200 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          res({ nama: file.name, data: c.toDataURL('image/jpeg', 0.86) });
        }; im.src = src;
      }; fr.readAsDataURL(file);
    });
  }
  function uploadOne(file) { return prepFile(file).then(function (p) { return api('POST', '/konten/media', { nama: p.nama, data: p.data, konfirmasi: true }); }).then(function (r) { r.nama = file.name; return r; }); }
  function uploadAll(files, onStep) {
    var out = [], i = 0;
    return (function next() { if (i >= files.length) return Promise.resolve(out); var f = files[i++]; if (onStep) onStep(i, files.length, f.name); return uploadOne(f).then(function (r) { out.push(r); return next(); }).catch(function (e) { e.message = f.name + ': ' + e.message; throw e; }); })();
  }

  // ---------- pemilih foto dari Media Library (dapat mengunggah langsung) ----------
  function mediaPicker(onPick, o) {
    o = o || {}; var st = { q: '', page: 1 }, grid = h('div', { class: 'kt-grid' }), more = h('div', { class: 'tools tools--end' }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' }), chosen = {}, m;
    var q = h('input', { type: 'search', placeholder: 'Cari nama file…', 'aria-label': 'Cari foto', maxlength: '60' }), file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: o.multi ? 'multiple' : null, hidden: true });
    function cell(r) { var b = h('button', { type: 'button', class: 'kt-cell', 'aria-label': 'Pilih foto ' + (r.nama_asli || r.id), 'aria-pressed': 'false' }, h('img', { src: admImg(r.id, true), alt: '', loading: 'lazy' }), h('small', { text: (r.nama_asli || '') })); b.addEventListener('click', function () { if (o.multi) { chosen[r.id] = chosen[r.id] ? null : r; b.setAttribute('aria-pressed', chosen[r.id] ? 'true' : 'false'); b.classList.toggle('is-on', !!chosen[r.id]); } else { m.close(); onPick(r); } }); return b; }
    function load(append) { api('GET', '/konten/media' + qs({ q: st.q, page: st.page })).then(function (d) { if (!append) grid.innerHTML = ''; d.rows.forEach(function (r) { grid.appendChild(cell(r)); }); if (!grid.children.length) grid.appendChild(empty('Media Library kosong', 'Klik “Unggah foto” untuk menambahkan.', 'image')); more.innerHTML = ''; if (d.page * d.size < d.total) more.appendChild(btn('Muat lebih banyak', function () { st.page++; load(true); }, { ghost: true })); }).catch(function (e) { note.hidden = false; note.textContent = e.message; }); }
    var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { st.q = q.value.trim(); st.page = 1; load(false); }, 300); });
    file.addEventListener('change', function () { if (!file.files.length) return; note.hidden = true; var fl = [].slice.call(file.files); uploadAll(fl, function (i, n) { note.hidden = false; note.className = 'note'; note.textContent = 'Mengunggah ' + i + ' dari ' + n + '…'; }).then(function (rs) { note.hidden = true; note.className = 'note note--bad'; file.value = ''; if (!o.multi) { m.close(); onPick(rs[0]); } else { rs.forEach(function (r) { chosen[r.id] = r; }); toast(rs.length + ' foto diunggah dan dipilih.'); st.page = 1; load(false); } }).catch(function (e) { note.className = 'note note--bad'; note.hidden = false; note.textContent = e.message; }); });
    m = X.modal(o.title || 'Pilih foto dari Media Library', [note, h('div', { class: 'tools tools--start' }, q, btn('Unggah foto', function () { file.click(); }, { icon: 'plus' }), file), grid, more], function (close) { return o.multi ? [btn('Batal', close, { ghost: true }), btn('Pilih foto terpilih', function () { var l = Object.keys(chosen).map(function (k) { return chosen[k]; }).filter(Boolean); if (!l.length) { note.hidden = false; note.className = 'note note--bad'; note.textContent = 'Pilih minimal satu foto.'; return; } close(); onPick(l); })] : [btn('Batal', close, { ghost: true })]; }, { wide: true });
    load(false);
  }

  // ---------- editor isi berita ----------
  function editorEl(html) {
    var area = h('div', { class: 'ked', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Isi berita', spellcheck: 'true' });
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { }
    function toEditor(src) { var d = document.createElement('div'); d.innerHTML = src || ''; [].forEach.call(d.querySelectorAll('img'), function (im) { var m = mediaOf(im.getAttribute('src')); if (m) { im.setAttribute('data-mid', m.id); im.setAttribute('data-tok', m.token); im.setAttribute('src', admImg(m.id)); } }); [].forEach.call(d.querySelectorAll('div.embed'), function (e) { e.setAttribute('contenteditable', 'false'); e.textContent = '▶ Video ' + (e.getAttribute('data-video') || ''); }); return d.innerHTML; }
    function fromEditor() { var d = area.cloneNode(true); [].forEach.call(d.querySelectorAll('img'), function (im) { var id = im.getAttribute('data-mid'), tk = im.getAttribute('data-tok'); if (id && tk) im.setAttribute('src', '/media/' + id + '-' + tk + '.webp'); }); [].forEach.call(d.querySelectorAll('div.embed'), function (e) { e.textContent = ''; e.removeAttribute('contenteditable'); }); return d.innerHTML; }
    area.innerHTML = toEditor(html);
    function cmd(c, v) { area.focus(); document.execCommand(c, false, v || null); }
    area.addEventListener('paste', function (e) { var t = (e.clipboardData || window.clipboardData).getData('text/plain'); if (t == null) return; e.preventDefault(); var ps = t.replace(/\r/g, '').split(/\n{1,}/).filter(function (x) { return x.trim(); }); document.execCommand('insertHTML', false, ps.map(function (x) { return '<p>' + x.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) + '</p>'; }).join('')); });
    function saveSel() { var s = window.getSelection(); return s.rangeCount ? s.getRangeAt(0).cloneRange() : null; }
    function restore(r) { area.focus(); if (r) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } }
    function insertHtml(r, hh) { restore(r); document.execCommand('insertHTML', false, hh); }
    function tb(label, title, fn, cls) { return h('button', { type: 'button', class: 'kbtn-t' + (cls ? ' ' + cls : ''), title: title, 'aria-label': title, onmousedown: function (e) { e.preventDefault(); }, onclick: fn, text: label }); }
    var bar = h('div', { class: 'ked__bar', role: 'toolbar', 'aria-label': 'Format teks' }, [
      tb('Judul', 'Judul bagian (H2)', function () { cmd('formatBlock', 'h2'); }), tb('Subjudul', 'Subjudul (H3)', function () { cmd('formatBlock', 'h3'); }), tb('Paragraf', 'Paragraf biasa', function () { cmd('formatBlock', 'p'); }),
      tb('B', 'Tebal', function () { cmd('bold'); }, 'is-b'), tb('I', 'Miring', function () { cmd('italic'); }, 'is-i'), tb('• Daftar', 'Daftar bullet', function () { cmd('insertUnorderedList'); }), tb('1. Daftar', 'Daftar bernomor', function () { cmd('insertOrderedList'); }), tb('❝ Kutipan', 'Kutipan', function () { cmd('formatBlock', 'blockquote'); }),
      tb('Tautan', 'Sisipkan tautan', function () { var r = saveSel(); var u = h('input', { type: 'url', placeholder: 'https://…', maxlength: '300' }); formModal('Sisipkan tautan', [{ k: 'url', label: 'Alamat tautan (https://…)', req: true, max: 300 }], { ok: 'Tautan disisipkan.', submit: function (v) { if (!/^(https?:\/\/|mailto:)/i.test(v.url)) return Promise.reject({ message: 'Tautan harus diawali https://, http://, atau mailto:', fields: { url: 'Harus diawali https://' } }); restore(r); if (r && r.collapsed) document.execCommand('insertHTML', false, '<a href="' + v.url.replace(/"/g, '&quot;') + '">' + v.url.replace(/[&<>]/g, '') + '</a>'); else document.execCommand('createLink', false, v.url); return Promise.resolve(); } }); }),
      tb('Gambar', 'Sisipkan gambar dari Media Library', function () { var r = saveSel(); mediaPicker(function (m) { formModal('Keterangan gambar', [{ k: 'cap', label: 'Caption (opsional)', max: 200 }, { k: 'alt', label: 'Teks alternatif (untuk pembaca layar)', max: 200 }], { ok: 'Gambar disisipkan.', label: 'Sisipkan', submit: function (v) { var tk = mediaOf(m.url).token; insertHtml(r, '<figure><img src="' + admImg(m.id) + '" data-mid="' + m.id + '" data-tok="' + tk + '" alt="' + v.alt.replace(/["<>&]/g, '') + '">' + (v.cap ? '<figcaption>' + v.cap.replace(/[&<>]/g, '') + '</figcaption>' : '<figcaption><br></figcaption>') + '</figure><p><br></p>'); return Promise.resolve(); } }); }); }),
      tb('Video', 'Sisipkan video YouTube/Vimeo', function () { var r = saveSel(); formModal('Sisipkan video', [{ k: 'url', label: 'Tautan video YouTube atau Vimeo', req: true, max: 300 }], { ok: 'Video disisipkan.', label: 'Sisipkan', submit: function (v) { var m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(v.url), vm = /vimeo\.com\/(?:video\/)?(\d{6,12})/.exec(v.url), key = m ? 'youtube:' + m[1] : vm ? 'vimeo:' + vm[1] : null; if (!key) return Promise.reject({ message: 'Tautan harus dari YouTube atau Vimeo.', fields: { url: 'Tautan harus dari YouTube atau Vimeo.' } }); insertHtml(r, '<div class="embed" data-video="' + key + '" contenteditable="false">▶ Video ' + key + '</div><p><br></p>'); return Promise.resolve(); } }); }),
      tb('Hapus format', 'Hapus format', function () { cmd('removeFormat'); cmd('formatBlock', 'p'); })]);
    return { el: h('div', { class: 'ked__wrap' }, bar, area), html: fromEditor, plain: function () { return area.textContent.trim(); } };
  }

  // ---------- pemilih dokumentasi galeri untuk berita ----------
  function galeriPicker(selected, onDone) {
    var chosen = {}; selected.forEach(function (g) { chosen[g.id] = g; });
    var grid = h('div', { class: 'kt-grid' }), q = h('input', { type: 'search', placeholder: 'Cari dokumentasi…', maxlength: '60', 'aria-label': 'Cari dokumentasi' }), st = { q: '' };
    function load() { api('GET', '/konten/galeri' + qs({ q: st.q, ukuran: 60 })).then(function (d) { grid.innerHTML = ''; d.rows.filter(function (r) { return r.status !== 'arsip'; }).forEach(function (r) { var b = h('button', { type: 'button', class: 'kt-cell' + (chosen[r.id] ? ' is-on' : ''), 'aria-pressed': chosen[r.id] ? 'true' : 'false', 'aria-label': r.judul }, r.jenis === 'foto' && r.foto ? h('img', { src: admImg(r.foto.id, true), alt: '', loading: 'lazy' }) : h('span', { class: 'kt-vid', text: '▶' }), h('small', { text: r.judul + (r.status !== 'terbit' ? ' (' + (STAT[r.status] || [r.status])[0] + ')' : '') })); b.addEventListener('click', function () { chosen[r.id] = chosen[r.id] ? null : r; b.classList.toggle('is-on', !!chosen[r.id]); b.setAttribute('aria-pressed', chosen[r.id] ? 'true' : 'false'); }); grid.appendChild(b); }); if (!grid.children.length) grid.appendChild(empty('Belum ada dokumentasi', 'Tambahkan di Manajemen Galeri terlebih dahulu.', 'image')); }).catch(fail); }
    var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { st.q = q.value.trim(); load(); }, 300); });
    X.modal('Pilih dokumentasi dari galeri', [h('p', { class: 'muted', text: 'Dokumentasi yang dipilih tampil sebagai foto/video pendukung di halaman berita. Berkas tidak digandakan.' }), h('div', { class: 'tools tools--start' }, q), grid], function (close) { return [btn('Batal', close, { ghost: true }), btn('Gunakan pilihan', function () { close(); var keep = selected.filter(function (g) { return chosen[g.id]; }), ids = keep.map(function (g) { return g.id; }); Object.keys(chosen).forEach(function (k) { if (chosen[k] && ids.indexOf(+k) < 0) keep.push(chosen[k]); }); onDone(keep); })]; }, { wide: true }); load();
  }

  // ---------- konfirmasi dengan daftar pemakaian ----------
  function pakaiText(list) { return list.map(function (x) { return (x.jenis === 'berita' ? 'Berita' : 'Galeri') + ' “' + x.judul + '”' + (x.peran ? ' (' + x.peran + ')' : ''); }).join('; '); }

  // ================= DASHBOARD =================
  function viewDashboard() {
    var P = page('dashboard', 'Dashboard Konten', 'Ringkasan berita dan galeri dari database SIMA. Website publik menampilkan konten yang berstatus terbit.');
    return api('GET', '/konten/dashboard').then(function (d) {
      var b = d.berita, g = d.galeri, S = function (l, v, n, href) { var x = X.stat(l, v, n); return href ? h('a', { class: 'statlink', href: href }, x) : x; };
      P.body.appendChild(h('div', { class: 'stats' }, [S('Total berita', b.total, 'tidak termasuk yang dihapus', R + 'semua'), S('Draft', b.draft, 'belum tayang', R + 'semua?status=draft'), S('Menunggu publikasi', b.menunggu, 'terjadwal, belum waktunya', R + 'semua?status=terjadwal'), S('Berita terbit', b.terbit, b.unggulan + ' unggulan', R + 'semua?status=terbit'), S('Diarsipkan', b.arsip, 'tidak tampil publik', R + 'semua?status=arsip'),
        S('Total dokumentasi', g.total, g.terbit + ' terbit · ' + g.draft + ' draft', R + 'galeri'), S('Total foto', g.foto, d.media.total + ' berkas di Media Library', R + 'media'), S('Total video', g.video, 'tautan YouTube/Vimeo', R + 'video')]));
      var bl = function (r) { return r.map(function (x) { return { k: x.bulan, v: x.n }; }); };
      P.body.appendChild(h('div', { class: 'charts' }, [K.chartBox('Jumlah berita dibuat per bulan', K.countBars(bl(d.per_bulan), 'Berita per bulan')), K.chartBox('Publikasi berita per bulan', K.countBars(bl(d.publikasi_per_bulan), 'Publikasi per bulan')),
        K.chartBox('Statistik kategori berita', K.hBars(d.kategori_berita.map(function (x) { return { k: x.nama, v: x.n }; }), 'Belum ada berita.')), K.chartBox('Statistik konten galeri (per kategori)', K.hBars(d.kategori_galeri.map(function (x) { return { k: x.nama + ' (' + x.foto + ' foto, ' + x.video + ' video)', v: x.n }; }), 'Belum ada dokumentasi.'))]));
      P.body.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Berita terbaru diubah' }), d.berita_terbaru.length ? X.table([{ t: 'Judul', f: function (r) { return h('a', { href: R + 'ubah/' + r.id, text: r.judul }); } }, { t: 'Status', f: function (r) { return statPill(r.status_efektif); } }, { t: 'Diubah', f: function (r) { return wib(r.diubah); } }], d.berita_terbaru) : empty('Belum ada berita', 'Klik “Tambah Berita” untuk menulis berita pertama. Tidak ada berita contoh.', 'image', h('a', { class: 'btn', href: R + 'tambah', text: 'Tambah Berita' }))));
      P.body.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Dokumentasi terbaru' }), d.galeri_terbaru.length ? h('div', { class: 'kt-grid kt-grid--s' }, d.galeri_terbaru.map(function (r) { return h('a', { class: 'kt-cell', href: R + 'galeri' }, r.foto ? h('img', { src: admImg(r.foto.id, true), alt: '', loading: 'lazy' }) : h('span', { class: 'kt-vid', text: '▶' }), h('small', { text: r.judul })); })) : empty('Belum ada dokumentasi', 'Unggah foto atau tambahkan video di Manajemen Galeri.', 'image')));
      P.body.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Aktivitas pengelolaan konten terbaru' }), d.aktivitas.length ? X.table([{ t: 'Waktu', f: function (r) { return wib(r.waktu); } }, { t: 'Pengguna', k: 'username' }, { t: 'Tindakan', f: function (r) { return r.entitas + ' · ' + r.aksi.replace(/_/g, ' '); } }, { t: 'Keterangan', k: 'ket' }], d.aktivitas) : empty('Belum ada aktivitas', 'Aktivitas muncul setelah konten dikelola.', 'list')));
      return P.el;
    }).catch(function (e) { errBox(P.body, e); return P.el; });
  }

  // ================= DAFTAR BERITA =================
  function viewSemua(p, q) {
    var P = page('semua', 'Semua Berita', 'Kelola berita: ubah, terbitkan, arsipkan, jadikan unggulan, atau hapus (dapat dipulihkan).', h('a', { class: 'btn', href: R + 'tambah', text: 'Tambah Berita' }));
    return loadRef(true).then(function (ref) {
      var lv;
      function stat(id, status, extra) { return api('POST', '/konten/berita/' + id + '/status', Object.assign({ status: status, konfirmasi: true }, extra || {})).then(function (r) { toast('Status diubah.'); lv.reload(); }).catch(fail); }
      var cols = [{ t: 'Gambar', f: function (r) { return thumbImg(r.gambar && r.gambar.id, ''); } },
        { t: 'Judul', f: function (r) { return h('div', null, h('a', { href: R + 'ubah/' + r.id, text: r.judul }), h('small', { class: 'muted kt-slug', text: '/berita/' + r.slug })); } }, { t: 'Kategori', f: function (r) { return r.kategori || 'Belum diisi'; } },
        { t: 'Status', f: function (r) { return h('span', null, statPill(r.status_efektif), r.unggulan ? pill('Unggulan', 'info') : null); } },
        { t: 'Terbit', f: function (r) { return r.terbit_pada && r.status !== 'draft' ? wib(r.terbit_pada) : '—'; } },
        { t: 'Aksi', f: function (r) { var a = h('div', { class: 'acts' }); if (r.status_efektif === 'dihapus') { a.appendChild(btn('Pulihkan', function () { api('POST', '/konten/berita/' + r.id + '/pulihkan', { konfirmasi: true }).then(function () { toast('Dipulihkan sebagai draft.'); lv.reload(); }).catch(fail); }, { ghost: true, sm: true })); return a; }
          a.appendChild(h('a', { class: 'btn btn--ghost btn--sm', href: R + 'ubah/' + r.id, text: 'Ubah' })); a.appendChild(h('a', { class: 'btn btn--ghost btn--sm', href: '/api/sima/konten/berita/' + r.id + '/pratinjau', target: '_blank', rel: 'noopener', text: 'Pratinjau' }));
          if (r.status_efektif === 'terbit') { a.appendChild(h('a', { class: 'btn btn--ghost btn--sm', href: '/berita/' + r.slug, target: '_blank', rel: 'noopener', text: 'Lihat di web' })); }
          if (r.status !== 'terbit' && r.status_efektif !== 'terbit') a.appendChild(btn('Terbitkan', function () { X.confirmDialog({ title: 'Terbitkan berita?', text: '“' + r.judul + '” akan tampil di website publik.', confirmLabel: 'Ya, terbitkan' }).then(function (c) { if (c) stat(r.id, 'terbit'); }); }, { sm: true }));
          if (r.status_efektif === 'terbit' || r.status_efektif === 'terjadwal') a.appendChild(btn('Jadikan draft', function () { X.confirmDialog({ title: 'Tarik dari website?', text: 'Berita kembali berstatus draft dan tidak tampil publik.', confirmLabel: 'Ya, jadikan draft' }).then(function (c) { if (c) stat(r.id, 'draft'); }); }, { ghost: true, sm: true }));
          if (r.status !== 'arsip') a.appendChild(btn('Arsipkan', function () { X.confirmDialog({ title: 'Arsipkan berita?', text: 'Berita tidak tampil di website, tetapi tetap tersimpan.', confirmLabel: 'Ya, arsipkan' }).then(function (c) { if (c) stat(r.id, 'arsip'); }); }, { ghost: true, sm: true }));
          a.appendChild(btn(r.unggulan ? 'Cabut unggulan' : 'Unggulan', function () { api('POST', '/konten/berita/' + r.id + '/unggulan', { unggulan: !r.unggulan, konfirmasi: true }).then(function () { toast(r.unggulan ? 'Unggulan dicabut.' : 'Dijadikan unggulan.'); lv.reload(); }).catch(fail); }, { ghost: true, sm: true }));
          a.appendChild(btn('Hapus', function () { X.confirmDialog({ title: 'Hapus berita?', text: '“' + r.judul + '” tidak akan tampil dan dipindahkan ke daftar “Dihapus”. Dapat dipulihkan; foto di Media Library tidak ikut terhapus.', confirmLabel: 'Ya, hapus', danger: true }).then(function (c) { if (c) api('POST', '/konten/berita/' + r.id + '/hapus', { konfirmasi: true }).then(function () { toast('Berita dihapus.'); lv.reload(); }).catch(fail); }); }, { ghost: true, sm: true, danger: true }));
          return a; } }];
      lv = X.listView({ endpoint: '/konten/berita', search: 'Cari judul atau penulis…', cols: cols, size: 15, emptyEl: empty('Belum ada berita', 'Klik “Tambah Berita”. Tidak ada berita contoh.', 'image'),
        filters: [{ k: 'status', label: 'Status', def: q && q.status || '', options: [{ v: 'draft', l: 'Draft' }, { v: 'terjadwal', l: 'Terjadwal (menunggu)' }, { v: 'terbit', l: 'Terbit' }, { v: 'arsip', l: 'Diarsipkan' }, { v: 'dihapus', l: 'Dihapus' }] }, { k: 'kategori_id', label: 'Kategori', options: nm(ref.kategori_berita) }] });
      P.body.appendChild(lv.el); return P.el;
    });
  }

  // ================= FORM BERITA =================
  function viewForm(p) {
    var id = p[0] === 'ubah' ? parseInt(p[1], 10) : null, P = page(id ? '' : 'tambah', id ? 'Ubah Berita' : 'Tambah Berita', 'Isi berita disanitasi otomatis. Setelah berstatus Terbit, berita langsung tampil di website.');
    return Promise.all([loadRef(true), id ? api('GET', '/konten/berita/' + id) : Promise.resolve(null)]).then(function (rs) {
      var ref = rs[0], cur = rs[1] || {}, gambar = cur.gambar || null, galeri = [], slugTouched = !!id, note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' });
      var judul = h('input', { type: 'text', maxlength: '200', value: cur.judul || '', autocomplete: 'off' }), slug = h('input', { type: 'text', maxlength: '80', value: cur.slug || '', autocomplete: 'off' });
      var ring = h('textarea', { rows: '3', maxlength: '500' }); ring.value = cur.ringkasan || '';
      var ed = editorEl(cur.isi_html || ''), kat = selectEl(nm(ref.kategori_berita.filter(function (k) { return k.aktif || k.id === cur.kategori_id; })), '— Tanpa kategori —'); kat.value = cur.kategori_id || '';
      var penulis = h('input', { type: 'text', maxlength: '100', value: cur.penulis || '' }), tk = h('input', { type: 'date', value: cur.tanggal_kegiatan || '' });
      var status = selectEl([{ v: 'draft', l: 'Draft (tidak tampil)' }, { v: 'terjadwal', l: 'Terjadwal' }, { v: 'terbit', l: 'Terbit (tampil di website)' }, { v: 'arsip', l: 'Diarsipkan (tidak tampil)' }], null); status.value = cur.status || 'draft';
      var waktu = h('input', { type: 'datetime-local', value: cur.terbit_pada ? wibInp(cur.terbit_pada) : '' }), waktuW = field('Waktu tayang (WIB)', waktu, 'Terbit: kosongkan = sekarang. Terjadwal: wajib di masa depan; berita tayang otomatis saat waktunya tiba.');
      var ung = h('input', { type: 'checkbox' }); ung.checked = !!cur.unggulan; var vid = h('input', { type: 'url', maxlength: '300', value: cur.video_url || '', placeholder: 'https://www.youtube.com/watch?v=…' });
      var seoD = h('textarea', { rows: '2', maxlength: '300' }); seoD.value = cur.seo_deskripsi || ''; var seoK = h('input', { type: 'text', maxlength: '300', value: cur.seo_kata_kunci || '' });
      var gamBox = h('div', { class: 'kt-pick' }), galBox = h('div', { class: 'kt-pick' });
      function drawGambar() { gamBox.innerHTML = ''; if (gambar) { gamBox.appendChild(h('img', { src: admImg(gambar.id, true), alt: 'Gambar utama', width: '160', height: '120' })); gamBox.appendChild(btn('Ganti', pickGambar, { ghost: true, sm: true })); gamBox.appendChild(btn('Hapus', function () { gambar = null; drawGambar(); }, { ghost: true, sm: true })); } else gamBox.appendChild(btn('Pilih / unggah gambar utama', pickGambar, { ghost: true })); }
      function pickGambar() { mediaPicker(function (m) { gambar = { id: m.id }; drawGambar(); }, { title: 'Pilih gambar utama' }); }
      function drawGaleri() { galBox.innerHTML = ''; galeri.forEach(function (g, i) { galBox.appendChild(h('div', { class: 'kt-sel' }, g.jenis === 'foto' && g.foto ? h('img', { src: admImg(g.foto.id, true), alt: '' }) : h('span', { class: 'kt-vid', text: '▶' }), h('small', { text: g.judul }), h('span', { class: 'acts' }, btn('↑', function () { if (i) { galeri.splice(i - 1, 0, galeri.splice(i, 1)[0]); drawGaleri(); } }, { ghost: true, sm: true }), btn('↓', function () { if (i < galeri.length - 1) { galeri.splice(i + 1, 0, galeri.splice(i, 1)[0]); drawGaleri(); } }, { ghost: true, sm: true }), btn('✕', function () { galeri.splice(i, 1); drawGaleri(); }, { ghost: true, sm: true })))); }); galBox.appendChild(btn(galeri.length ? 'Ubah pilihan dokumentasi' : 'Pilih dokumentasi dari galeri', function () { galeriPicker(galeri, function (l) { galeri = l; drawGaleri(); }); }, { ghost: true })); }
      drawGambar(); drawGaleri();
      var loadGal = id && cur.galeri_ids && cur.galeri_ids.length ? Promise.all(cur.galeri_ids.map(function (gid) { return api('GET', '/konten/galeri/' + gid).catch(function () { return null; }); })).then(function (l) { galeri = l.filter(Boolean); drawGaleri(); }) : Promise.resolve();
      judul.addEventListener('input', function () { if (!slugTouched) slug.value = slugify(judul.value); }); slug.addEventListener('input', function () { slugTouched = true; });
      function syncWaktu() { waktuW.hidden = !(status.value === 'terjadwal' || status.value === 'terbit'); } status.addEventListener('change', syncWaktu); syncWaktu();
      function showErr(e) { note.hidden = false; note.textContent = e.message + (e.fields ? ' ' + Object.keys(e.fields).map(function (k) { return e.fields[k]; }).join(' ') : ''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      function payload(forceStatus) {
        var st = forceStatus || status.value, b = { konfirmasi: true, judul: judul.value.trim(), ringkasan: ring.value.trim(), isi_html: ed.html(), kategori_id: kat.value || null, media_utama_id: gambar ? gambar.id : null, penulis: penulis.value.trim() || null, tanggal_kegiatan: tk.value || null, unggulan: ung.checked, video_url: vid.value.trim() || null, seo_deskripsi: seoD.value.trim() || null, seo_kata_kunci: seoK.value.trim() || null, galeri_ids: galeri.map(function (g) { return g.id; }), status: st };
        if (st === 'terjadwal' || st === 'terbit') b.terbit_pada = toMs(waktu.value); if (slug.value.trim()) b.slug = slug.value.trim(); return b;
      }
      function save(forceStatus, after) {
        note.hidden = true; var b = payload(forceStatus);
        if (!id) delete b.unggulan, b.unggulan = ung.checked;
        var job = id ? api('PATCH', '/konten/berita/' + id, b) : api('POST', '/konten/berita', b);
        return job.then(function (r) { toast(id ? 'Perubahan disimpan.' : 'Berita disimpan.'); var nid = id || r.id; if (after) return after(nid); if (!id) location.hash = R + 'ubah/' + nid; else { status.value = b.status; window.dispatchEvent(new HashChangeEvent('hashchange')); } }).catch(showErr);
      }
      var actions = h('div', { class: 'tools tools--end kt-actions' }, h('a', { class: 'btn btn--ghost', href: R + 'semua', text: 'Batal' }),
        btn('Pratinjau', function () { save(null, function (nid) { window.open('/api/sima/konten/berita/' + nid + '/pratinjau', '_blank', 'noopener'); if (!id) location.hash = R + 'ubah/' + nid; }); }, { ghost: true }),
        btn(id ? 'Simpan perubahan' : 'Simpan', function () { save(); }, { ghost: true }),
        btn('Simpan & terbitkan', function () { X.confirmDialog({ title: 'Terbitkan berita?', text: 'Berita akan tampil di website publik' + (waktu.value && toMs(waktu.value) > Date.now() && status.value !== 'draft' ? ' pada waktu yang dijadwalkan.' : ' sekarang.'), confirmLabel: 'Ya, terbitkan' }).then(function (c) { if (c) save('terbit'); }); }));
      var left = h('div', { class: 'stack-s' }, field('Judul berita *', judul), field('Slug (alamat URL)', slug, 'Dibuat otomatis dari judul. Mengubah slug berita yang sudah terbit akan mengalihkan tautan lama ke tautan baru.'), field('Ringkasan', ring, 'Tampil di kartu berita dan hasil pencarian.', true), h('div', { class: 'field field--full' }, h('label', { text: 'Isi berita *' }), ed.el, h('small', { class: 'muted', text: 'Gambar disisipkan dari Media Library. Isi disanitasi di server (script/atribut berbahaya dibuang).' })));
      var right = h('div', { class: 'stack-s' }, h('section', { class: 'panel kt-side' }, h('h2', { text: 'Publikasi' }), field('Status', status), waktuW, field('Kategori', kat), h('label', { class: 'check' }, ung, 'Berita unggulan'), field('Penulis / penyusun', penulis), field('Tanggal kegiatan', tk)),
        h('section', { class: 'panel kt-side' }, h('h2', { text: 'Gambar utama' }), gamBox), h('section', { class: 'panel kt-side' }, h('h2', { text: 'Dokumentasi pendukung' }), galBox), h('section', { class: 'panel kt-side' }, h('h2', { text: 'Video pendukung' }), field('Tautan YouTube / Vimeo', vid)), h('section', { class: 'panel kt-side' }, h('h2', { text: 'SEO' }), field('Deskripsi SEO', seoD), field('Kata kunci SEO', seoK)));
      P.body.appendChild(note); if (id) P.body.appendChild(h('p', { class: 'muted' }, 'Status saat ini: ', statPill(cur.status_efektif), cur.slug_lama && cur.slug_lama.length ? '  · slug lama (dialihkan): ' + cur.slug_lama.join(', ') : ''));
      P.body.appendChild(h('div', { class: 'kt-form' }, left, right)); P.body.appendChild(actions);
      if (id) P.body.appendChild(btn('Riwayat perubahan', function () { api('GET', '/konten/berita/' + id + '/riwayat').then(function (d) { X.modal('Riwayat perubahan berita', [d.rows.length ? K.auditList(d.rows.map(function (r) { return { waktu: r.waktu, username: r.username, aksi: r.aksi.replace(/_/g, ' '), ket: r.ket, sebelum: r.sebelum, sesudah: r.sesudah }; })) : empty('Belum ada riwayat', '', 'list')], function (close) { return [btn('Tutup', close, { ghost: true })]; }, { wide: true }); }).catch(fail); }, { ghost: true }));
      return loadGal.then(function () { return P.el; });
    });
  }

  // ================= KATEGORI =================
  function kategoriPage(tipe) {
    var gal = tipe === 'galeri', P = page(gal ? 'kategori-galeri' : 'kategori', gal ? 'Kategori Galeri' : 'Kategori Berita', 'Kategori dapat ditambah, diubah, dan dinonaktifkan. Daftar contoh bukan kategori resmi dan dapat diubah.'), lv;
    return loadRef(true).then(function (ref) {
      var KUNCI = [{ v: 'silat', l: 'Ekstrakurikuler: Pencak Silat' }, { v: 'banjari', l: 'Ekstrakurikuler: Banjari' }, { v: 'tulis', l: 'Ekstrakurikuler: Kepenulisan' }, { v: 'pidato', l: 'Ekstrakurikuler: Public Speaking' }, { v: 'bisnis', l: 'Ekstrakurikuler: Entrepreneur' }];
      function form(r) {
        var defs = [{ k: 'nama', label: 'Nama kategori', req: true, max: 80, val: r && r.nama }, { k: 'deskripsi', label: 'Deskripsi', type: 'area', max: 300, val: r && r.deskripsi }, { k: 'urutan', label: 'Urutan tampil (angka kecil = lebih dulu)', max: 4, val: r ? r.urutan : '' }];
        if (gal) defs.push({ k: 'kunci_halaman', label: 'Tampilkan pada halaman Ekstrakurikuler', type: 'select', options: KUNCI, blank: 'Tidak (galeri umum)', val: r && r.kunci_halaman, help: 'Dokumentasi pada kategori ini muncul pada kegiatan ekstrakurikuler yang dipilih.' });
        formModal(r ? 'Ubah kategori' : 'Tambah kategori', defs, { ok: 'Kategori tersimpan.', submit: function (v) { var b = { konfirmasi: true, nama: v.nama, deskripsi: v.deskripsi || null }; if (v.urutan !== '') b.urutan = v.urutan; if (gal) b.kunci_halaman = v.kunci_halaman || null; if (r) return api('PATCH', '/konten/kategori/' + r.id, b); b.tipe = tipe; return api('POST', '/konten/kategori', b); }, done: function () { loadRef(true); lv.reload(); } });
      }
      var cols = [{ t: 'Nama', f: function (r) { return h('div', null, h('b', { text: r.nama }), h('small', { class: 'muted kt-slug', text: r.slug })); } }, { t: 'Deskripsi', f: function (r) { return r.deskripsi || 'Belum diisi'; } }].concat(gal ? [{ t: 'Halaman Ekstrakurikuler', f: function (r) { var k = KUNCI.filter(function (x) { return x.v === r.kunci_halaman; })[0]; return k ? k.l.replace('Ekstrakurikuler: ', '') : '—'; } }] : [], [{ t: 'Isi', f: function (r) { return r.jumlah + (gal ? ' dokumentasi' : ' berita'); } }, { t: 'Status', f: function (r) { return pill(r.aktif ? 'Aktif' : 'Nonaktif', r.aktif ? 'ok' : 'off'); } },
        { t: 'Aksi', f: function (r) { return h('div', { class: 'acts' }, btn('Ubah', function () { form(r); }, { ghost: true, sm: true }), btn(r.aktif ? 'Nonaktifkan' : 'Aktifkan', function () { X.confirmDialog({ title: (r.aktif ? 'Nonaktifkan' : 'Aktifkan') + ' kategori?', text: r.aktif ? 'Kategori tidak dapat dipilih untuk konten baru. Konten lama tetap utuh.' : 'Kategori dapat dipilih kembali.', confirmLabel: 'Ya' }).then(function (c) { if (c) api('PATCH', '/konten/kategori/' + r.id, { aktif: !r.aktif, konfirmasi: true }).then(function () { loadRef(true); lv.reload(); }).catch(fail); }); }, { ghost: true, sm: true })); } }]);
      lv = X.listView({ endpoint: '/konten/kategori', base: { tipe: tipe }, search: false, size: 100, cols: cols, emptyEl: empty('Belum ada kategori', 'Klik “Tambah kategori” atau “Muat contoh kategori”. Tidak ada kategori bawaan.', 'gear') });
      P.body.appendChild(h('div', { class: 'tools tools--start' }, btn('Tambah kategori', function () { form(null); }, { icon: 'plus' }), btn('Muat contoh kategori', function () { X.confirmDialog({ title: 'Muat contoh kategori?', text: 'Menambahkan daftar contoh. Anda dapat mengubah atau menonaktifkannya; ini bukan kategori resmi.', confirmLabel: 'Ya, muat' }).then(function (c) { if (c) api('POST', '/konten/kategori/awal', { tipe: tipe, konfirmasi: true }).then(function (d) { toast(d.ditambahkan + ' kategori ditambahkan.'); loadRef(true); lv.reload(); }).catch(fail); }); }, { ghost: true })));
      P.body.appendChild(lv.el); return P.el;
    });
  }

  // ================= BERITA UNGGULAN + PENGATURAN BERANDA =================
  function viewUnggulan() {
    var P = page('unggulan', 'Berita Unggulan', 'Pilih berita unggulan dan atur jumlah yang tampil di beranda dan halaman Berita. Berita terbaru tidak otomatis menjadi unggulan.'), box = h('div', { class: 'stack-s' });
    return api('GET', '/konten/pengaturan').then(function (set) {
      var tot = h('input', { type: 'number', min: '1', max: '12', value: set.beranda.total }), um = h('input', { type: 'number', min: '0', max: '12', value: set.beranda.unggulan_maks }), ph = h('input', { type: 'number', min: '3', max: '30', value: set.tampilan.per_halaman }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' });
      P.body.appendChild(h('section', { class: 'panel stack-s' }, h('h2', { text: 'Tampilan di website' }), note, h('div', { class: 'fs__grid' }, field('Jumlah berita di beranda', tot, '1–12. Berita unggulan tampil dulu, sisanya berita terbaru.'), field('Maksimal unggulan di beranda', um, '0 = tidak ada area unggulan di beranda.'), field('Berita per halaman (/berita)', ph, '3–30.')),
        h('div', { class: 'tools tools--end' }, btn('Simpan pengaturan', function (ev) { ev.target.disabled = true; note.hidden = true; api('PUT', '/konten/pengaturan', { konfirmasi: true, beranda: { total: +tot.value, unggulan_maks: +um.value }, tampilan: { per_halaman: +ph.value } }).then(function () { toast('Pengaturan disimpan.'); ev.target.disabled = false; }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message + ' ' + Object.keys(e.fields || {}).map(function (k) { return e.fields[k]; }).join(' '); }); }))));
      P.body.appendChild(h('h2', { text: 'Daftar berita unggulan' })); P.body.appendChild(box);
      function load() { api('GET', '/konten/berita?unggulan=1').then(function (d) { box.innerHTML = ''; if (!d.rows.length) { box.appendChild(empty('Belum ada berita unggulan', 'Buka “Semua Berita” lalu klik “Unggulan” pada berita yang ingin disorot.', 'image', h('a', { class: 'btn', href: R + 'semua', text: 'Semua Berita' }))); return; } var ids = d.rows.map(function (r) { return r.id; });
        function move(i, dlt) { var j = i + dlt; if (j < 0 || j >= ids.length) return; ids.splice(j, 0, ids.splice(i, 1)[0]); api('POST', '/konten/berita/unggulan/urutan', { ids: ids, konfirmasi: true }).then(load).catch(fail); }
        box.appendChild(X.table([{ t: 'Urutan', f: function (r, i) { return i + 1; } }, { t: 'Gambar', f: function (r) { return thumbImg(r.gambar && r.gambar.id); } }, { t: 'Judul', f: function (r) { return h('a', { href: R + 'ubah/' + r.id, text: r.judul }); } }, { t: 'Status', f: function (r) { return statPill(r.status_efektif); } },
          { t: 'Aksi', f: function (r, i) { return h('div', { class: 'acts' }, btn('↑', function () { move(i, -1); }, { ghost: true, sm: true }), btn('↓', function () { move(i, 1); }, { ghost: true, sm: true }), btn('Cabut', function () { api('POST', '/konten/berita/' + r.id + '/unggulan', { unggulan: false, konfirmasi: true }).then(function () { toast('Unggulan dicabut.'); load(); }).catch(fail); }, { ghost: true, sm: true })); } }], d.rows));
        box.appendChild(h('p', { class: 'muted', text: 'Hanya berita berstatus Terbit yang tampil di website; berita unggulan yang masih draft/arsip tidak tampil.' })); }).catch(function (e) { errBox(box, e); }); }
      load(); return P.el;
    });
  }

  // ================= GALERI =================
  function galeriForm(r, jenis, done) {
    return loadRef(false).then(function (ref) {
      var thumb = r && r.video_thumb ? { id: r.video_thumb.id } : null, tbox = h('div', { class: 'kt-pick' });
      function drawT() { tbox.innerHTML = ''; if (thumb) { tbox.appendChild(h('img', { src: admImg(thumb.id, true), alt: '', width: '96', height: '72' })); tbox.appendChild(btn('Hapus thumbnail', function () { thumb = null; drawT(); }, { ghost: true, sm: true })); } else tbox.appendChild(btn('Pilih thumbnail (opsional)', function () { mediaPicker(function (m) { thumb = { id: m.id }; drawT(); }, { title: 'Pilih thumbnail video' }); }, { ghost: true, sm: true })); } drawT();
      var defs = [{ k: 'judul', label: 'Judul dokumentasi', req: true, max: 150, val: r && r.judul }].concat(jenis === 'video' ? [{ k: 'video_url', label: 'Tautan video (YouTube/Vimeo)', req: true, max: 300, val: r && r.video_url, full: true }] : [], [
        { k: 'kategori_id', label: 'Kategori', type: 'select', options: nm(ref.kategori_galeri.filter(function (k) { return k.aktif || (r && k.id === r.kategori_id); })), blank: '— Tanpa kategori —', val: r && r.kategori_id }, { k: 'tanggal_kegiatan', label: 'Tanggal kegiatan', type: 'date', val: r && r.tanggal_kegiatan },
        { k: 'status', label: 'Status', type: 'select', options: [{ v: 'draft', l: 'Draft (tidak tampil)' }, { v: 'terbit', l: 'Terbit (tampil di website)' }, { v: 'arsip', l: 'Diarsipkan' }], blank: null, val: r ? r.status : 'draft' }, { k: 'urutan', label: 'Urutan tampil (0 = otomatis)', max: 5, val: r ? r.urutan : 0 },
        { k: 'caption', label: 'Caption', max: 300, val: r && r.caption, full: true }, { k: 'deskripsi', label: 'Deskripsi', type: 'area', max: 1000, val: r && r.deskripsi }]);
      function send(v, extra) { var b = Object.assign({ konfirmasi: true, judul: v.judul, kategori_id: v.kategori_id || null, tanggal_kegiatan: v.tanggal_kegiatan || null, status: v.status, urutan: +v.urutan || 0, caption: v.caption || null, deskripsi: v.deskripsi || null }, extra || {}); if (jenis === 'video') { b.video_url = v.video_url; b.thumb_media_id = thumb ? thumb.id : null; } return r ? api('PATCH', '/konten/galeri/' + r.id, b) : api('POST', '/konten/galeri', Object.assign({ jenis: jenis }, b)); }
      formModal((r ? 'Ubah ' : 'Tambah ') + (jenis === 'video' ? 'video' : 'dokumentasi'), defs, { wide: true, ok: 'Tersimpan.', before: jenis === 'video' ? [field('Thumbnail video', tbox, 'Jika kosong, website memakai poster dari YouTube bila tersedia.', true)] : [], done: done,
        submit: function (v) { return send(v).catch(function (e) { if (e.status === 409 && e.data && e.data.perlu_konfirmasi) return new Promise(function (res, rej) { X.confirmDialog({ title: 'Dokumentasi dipakai berita', text: e.data.error, warn: pakaiText(e.data.dipakai), confirmLabel: 'Ya, lanjutkan', danger: true }).then(function (c) { if (c) send(v, { konfirmasi_dipakai: true }).then(res, rej); else rej({ message: 'Dibatalkan.' }); }); }); throw e; }); } });
    });
  }
  function viewGaleri(p, q, jenisFix) {
    var video = jenisFix === 'video', P = page(video ? 'video' : 'galeri', video ? 'Manajemen Video' : 'Semua Dokumentasi', video ? 'Tambahkan video dari YouTube atau Vimeo. Video tidak diunggah ke server (batas ukuran fungsi serverless); gunakan tautan.' : 'Foto dan video dokumentasi kegiatan. Hanya yang berstatus Terbit tampil di website.', video ? null : h('a', { class: 'btn', href: R + 'upload', text: 'Upload Foto' })), lv;
    return loadRef(true).then(function (ref) {
      function act(r, st) { var go = function (extra) { return api('PATCH', '/konten/galeri/' + r.id, Object.assign({ status: st, konfirmasi: true }, extra || {})).then(function () { toast('Status diubah.'); lv.reload(); }); }; go().catch(function (e) { if (e.status === 409 && e.data && e.data.perlu_konfirmasi) X.confirmDialog({ title: 'Dokumentasi dipakai berita', text: e.data.error, warn: pakaiText(e.data.dipakai), confirmLabel: 'Ya, lanjutkan', danger: true }).then(function (c) { if (c) go({ konfirmasi_dipakai: true }).catch(fail); }); else fail(e); }); }
      var cols = [{ t: 'Pratinjau', f: function (r) { return r.foto ? thumbImg(r.foto.id, r.judul) : r.video_thumb ? thumbImg(r.video_thumb.id, r.judul) : h('span', { class: 'kt-th kt-th--none', text: '▶' }); } },
        { t: 'Judul', f: function (r) { return h('div', null, h('b', { text: r.judul }), h('small', { class: 'muted kt-slug', text: r.caption || '' })); } }, { t: 'Kategori', f: function (r) { return r.kategori || 'Belum diisi'; } }, { t: 'Tanggal', f: function (r) { return r.tanggal_kegiatan ? fmtDate(r.tanggal_kegiatan) : 'Belum diisi'; } }, { t: 'Jenis', f: function (r) { return r.jenis === 'video' ? 'Video' : 'Foto'; } },
        { t: 'Status', f: function (r) { return h('span', null, statPill(r.status), r.dipakai_berita ? pill('Dipakai ' + r.dipakai_berita + ' berita', 'info') : null); } },
        { t: 'Aksi', f: function (r) { var a = h('div', { class: 'acts' }); a.appendChild(btn('Ubah', function () { galeriForm(r, r.jenis, function () { lv.reload(); }); }, { ghost: true, sm: true }));
          if (r.jenis === 'foto') a.appendChild(btn('Ganti foto', function () { mediaPicker(function (m) { api('POST', '/konten/galeri/' + r.id + '/ganti-foto', { media_id: m.id, konfirmasi: true }).then(function () { toast('Foto diganti.'); lv.reload(); }).catch(fail); }, { title: 'Pilih foto pengganti' }); }, { ghost: true, sm: true }));
          if (r.status !== 'terbit') a.appendChild(btn('Terbitkan', function () { act(r, 'terbit'); }, { sm: true })); else a.appendChild(btn('Jadikan draft', function () { act(r, 'draft'); }, { ghost: true, sm: true }));
          if (r.status !== 'arsip') a.appendChild(btn('Arsipkan', function () { act(r, 'arsip'); }, { ghost: true, sm: true }));
          a.appendChild(btn('Hapus', function () { var go = function (extra) { return api('POST', '/konten/galeri/' + r.id + '/hapus', Object.assign({ konfirmasi: true }, extra || {})).then(function () { toast('Dokumentasi dihapus.'); lv.reload(); }); }; X.confirmDialog({ title: 'Hapus dokumentasi?', text: '“' + r.judul + '” tidak akan tampil lagi. File foto di Media Library tidak ikut terhapus.', confirmLabel: 'Ya, hapus', danger: true }).then(function (c) { if (!c) return; go().catch(function (e) { if (e.status === 409 && e.data && e.data.perlu_konfirmasi) X.confirmDialog({ title: 'Dipakai oleh berita', text: e.data.error, warn: pakaiText(e.data.dipakai), confirmLabel: 'Tetap hapus', danger: true }).then(function (c2) { if (c2) go({ konfirmasi_dipakai: true }).catch(fail); }); else fail(e); }); }); }, { ghost: true, sm: true, danger: true }));
          return a; } }];
      lv = X.listView({ endpoint: '/konten/galeri', base: video ? { jenis: 'video' } : {}, search: 'Cari judul atau caption…', size: 24, cols: cols, emptyEl: empty(video ? 'Belum ada video' : 'Belum ada dokumentasi', video ? 'Klik “Tambah video”. Tidak ada video contoh.' : 'Klik “Upload Foto” atau “Tambah video”. Tidak ada dokumentasi contoh.', 'image'),
        filters: [{ k: 'kategori_id', label: 'Kategori', options: nm(ref.kategori_galeri) }, { k: 'status', label: 'Status', options: [{ v: 'draft', l: 'Draft' }, { v: 'terbit', l: 'Terbit' }, { v: 'arsip', l: 'Diarsipkan' }, { v: 'dihapus', l: 'Dihapus' }] }].concat(video ? [] : [{ k: 'jenis', label: 'Jenis', options: [{ v: 'foto', l: 'Foto' }, { v: 'video', l: 'Video' }] }], [{ k: 'tahun', label: 'Tahun', options: [2024, 2025, 2026, 2027].map(function (y) { return { v: y, l: String(y) }; }) }]) });
      P.body.appendChild(h('div', { class: 'tools tools--start' }, video ? btn('Tambah video', function () { galeriForm(null, 'video', function () { lv.reload(); }); }, { icon: 'plus' }) : h('a', { class: 'btn', href: R + 'upload', text: 'Upload Foto' }), video ? null : btn('Tambah video', function () { galeriForm(null, 'video', function () { lv.reload(); }); }, { ghost: true })));
      P.body.appendChild(lv.el); return P.el;
    });
  }

  // ================= UPLOAD FOTO =================
  function viewUpload() {
    var P = page('upload', 'Upload Foto', 'Pilih satu atau beberapa foto (JPG/PNG/WebP). Foto dioptimasi otomatis (WebP, thumbnail) dan disimpan permanen di Media Library.'), items = [], list = h('div', { class: 'stack-s' }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' });
    return loadRef(true).then(function (ref) {
      var file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: 'multiple', 'aria-label': 'Pilih foto' }), kat = selectEl(nm(ref.kategori_galeri.filter(function (k) { return k.aktif; })), '— Tanpa kategori —'), tg = h('input', { type: 'date', max: X.today() }), st = selectEl([{ v: 'draft', l: 'Draft (tidak tampil)' }, { v: 'terbit', l: 'Terbit (tampil di website)' }], null), prog = h('p', { class: 'muted', role: 'status' });
      function draw() { list.innerHTML = ''; items.forEach(function (it, i) { list.appendChild(h('div', { class: 'kt-up' }, h('img', { src: it.url, alt: 'Pratinjau ' + it.file.name, width: '96', height: '72' }), h('div', { class: 'stack-s' }, field('Judul', it.judul), field('Caption (opsional)', it.caption)), btn('Buang', function () { URL.revokeObjectURL(it.url); items.splice(i, 1); draw(); }, { ghost: true, sm: true }))); }); if (!items.length) list.appendChild(empty('Belum ada foto dipilih', 'Klik “Pilih foto” — pratinjau muncul di sini sebelum disimpan.', 'image')); }
      file.addEventListener('change', function () { [].forEach.call(file.files, function (f) { if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast('"' + f.name + '" dilewati: format harus JPG, PNG, atau WebP.', true); return; } if (items.length >= 30) return; items.push({ file: f, url: URL.createObjectURL(f), judul: h('input', { type: 'text', maxlength: '150', value: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') }), caption: h('input', { type: 'text', maxlength: '300' }) }); }); file.value = ''; draw(); });
      P.body.appendChild(note); P.body.appendChild(h('div', { class: 'tools tools--start' }, file)); P.body.appendChild(h('div', { class: 'fs__grid' }, field('Kategori', kat), field('Tanggal kegiatan', tg), field('Status', st)));
      P.body.appendChild(list); P.body.appendChild(prog);
      P.body.appendChild(h('div', { class: 'tools tools--end' }, btn('Unggah dan simpan', function (ev) {
        if (!items.length) { note.hidden = false; note.textContent = 'Pilih minimal satu foto.'; return; } note.hidden = true; ev.target.disabled = true;
        uploadAll(items.map(function (i) { return i.file; }), function (i, n, nama) { prog.textContent = 'Mengunggah ' + i + ' dari ' + n + ': ' + nama; }).then(function (ms) {
          return api('POST', '/konten/galeri/massal', { konfirmasi: true, kategori_id: kat.value || null, tanggal_kegiatan: tg.value || null, status: st.value, items: ms.map(function (m, i) { return { media_id: m.id, judul: items[i].judul.value.trim() || items[i].file.name, caption: items[i].caption.value.trim() || null }; }) });
        }).then(function (r) { toast(r.ids.length + ' foto disimpan.'); items.forEach(function (i) { URL.revokeObjectURL(i.url); }); items = []; prog.textContent = ''; ev.target.disabled = false; draw(); location.hash = R + 'galeri'; }).catch(function (e) { ev.target.disabled = false; prog.textContent = ''; note.hidden = false; note.textContent = e.message + ' ' + Object.keys(e.fields || {}).map(function (k) { return e.fields[k]; }).join(' '); });
      })));
      draw(); return P.el;
    });
  }

  // ================= MEDIA LIBRARY =================
  function viewMedia() {
    var P = page('media', 'Media Library', 'Semua foto yang pernah diunggah. Foto yang masih dipakai berita atau galeri tidak dapat dihapus.'), lv;
    var file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: 'multiple', hidden: true });
    file.addEventListener('change', function () { if (!file.files.length) return; uploadAll([].slice.call(file.files), function (i, n) { toast('Mengunggah ' + i + ' dari ' + n + '…'); }).then(function (rs) { toast(rs.length + ' foto diproses' + (rs.some(function (r) { return r.ada; }) ? ' (sebagian sudah ada, tidak digandakan).' : '.')); file.value = ''; lv.reload(); }).catch(function (e) { fail(e); file.value = ''; lv.reload(); }); });
    var cols = [{ t: 'Foto', f: function (r) { return thumbImg(r.id, r.alt || r.nama_asli); } }, { t: 'Nama file', f: function (r) { return h('div', null, h('b', { text: r.nama_asli || '#' + r.id }), h('small', { class: 'muted kt-slug', text: r.lebar + '×' + r.tinggi + ' · ' + Math.round(r.ukuran / 1024) + ' KB' })); } }, { t: 'Teks alternatif', f: function (r) { return r.alt || 'Belum diisi'; } }, { t: 'Diunggah', f: function (r) { return wib(r.diunggah) + (r.pengunggah ? ' · ' + r.pengunggah : ''); } }, { t: 'Dipakai', f: function (r) { return pill(r.dipakai ? 'Dipakai' : 'Belum dipakai', r.dipakai ? 'ok' : 'off'); } },
      { t: 'Aksi', f: function (r) { return h('div', { class: 'acts' }, h('a', { class: 'btn btn--ghost btn--sm', href: admImg(r.id), target: '_blank', rel: 'noopener', text: 'Buka' }), btn('Pemakaian', function () { api('GET', '/konten/media/' + r.id + '/pemakaian').then(function (d) { X.modal('Pemakaian foto', [d.rows.length ? X.table([{ t: 'Jenis', f: function (x) { return x.jenis === 'berita' ? 'Berita' : 'Galeri'; } }, { t: 'Judul', k: 'judul' }, { t: 'Peran', k: 'peran' }, { t: 'Status', f: function (x) { return statPill(x.status); } }], d.rows) : h('p', { text: 'Foto ini belum dipakai oleh berita atau galeri.' })], function (close) { return [btn('Tutup', close, { ghost: true })]; }); }).catch(fail); }, { ghost: true, sm: true }),
        btn('Teks alt', function () { formModal('Teks alternatif foto', [{ k: 'alt', label: 'Teks alternatif', max: 200, val: r.alt, full: true }], { ok: 'Tersimpan.', submit: function (v) { return api('PATCH', '/konten/media/' + r.id, { alt: v.alt }); }, done: function () { lv.reload(); } }); }, { ghost: true, sm: true }),
        btn('Hapus', function () { X.confirmDialog({ title: 'Hapus file foto?', text: 'File dihapus permanen dari penyimpanan. Hanya bisa jika tidak dipakai berita/galeri.', confirmLabel: 'Ya, hapus', danger: true }).then(function (c) { if (c) api('POST', '/konten/media/' + r.id + '/hapus', { konfirmasi: true }).then(function () { toast('File dihapus.'); lv.reload(); }).catch(function (e) { if (e.data && e.data.dipakai) X.modal('Tidak dapat dihapus', [h('p', { text: 'Foto masih dipakai oleh:' }), h('p', { class: 'note note--warn', text: pakaiText(e.data.dipakai) })], function (close) { return [btn('Tutup', close, { ghost: true })]; }); else fail(e); }); }); }, { ghost: true, sm: true, danger: true })); } }];
    lv = X.listView({ endpoint: '/konten/media', search: 'Cari nama file…', size: 24, cols: cols, emptyEl: empty('Media Library kosong', 'Klik “Unggah foto”. Tidak ada foto contoh.', 'image'), filters: [{ k: 'pakai', label: 'Pemakaian', options: [{ v: 'ya', l: 'Dipakai' }, { v: 'tidak', l: 'Belum dipakai' }] }] });
    P.body.appendChild(h('div', { class: 'tools tools--start' }, btn('Unggah foto', function () { file.click(); }, { icon: 'plus' }), file)); P.body.appendChild(lv.el); return P.el;
  }

  // ================= STATISTIK =================
  function viewStatistik() {
    var P = page('statistik', 'Statistik Konten', 'Angka dihitung langsung dari database konten.');
    return api('GET', '/konten/statistik').then(function (d) {
      var b = d.berita, g = d.galeri, bl = function (r) { return r.map(function (x) { return { k: x.bulan, v: x.n }; }); };
      P.body.appendChild(h('div', { class: 'stats' }, [X.stat('Berita', b.total, b.terbit + ' terbit · ' + b.draft + ' draft · ' + b.menunggu + ' terjadwal · ' + b.arsip + ' arsip'), X.stat('Dokumentasi', g.total, g.foto + ' foto · ' + g.video + ' video'), X.stat('Dokumentasi terbit', g.terbit, g.draft + ' draft · ' + g.arsip + ' arsip'), X.stat('Media Library', d.media.total, Math.round(d.media.ukuran / 1024 / 1024 * 10) / 10 + ' MB'), X.stat('Berita unggulan tayang', b.unggulan, 'berstatus terbit')]));
      P.body.appendChild(h('div', { class: 'charts' }, [K.chartBox('Berita dibuat per bulan (12 bulan)', K.countBars(bl(d.per_bulan), 'Berita per bulan')), K.chartBox('Publikasi berita per bulan', K.countBars(bl(d.publikasi_per_bulan), 'Publikasi per bulan')), K.chartBox('Berita per kategori', K.hBars(d.kategori_berita.map(function (x) { return { k: x.nama, v: x.n }; }), 'Belum ada berita.')), K.chartBox('Dokumentasi per kategori', K.hBars(d.kategori_galeri.map(function (x) { return { k: x.nama, v: x.n }; }), 'Belum ada dokumentasi.'))]));
      P.body.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Rincian galeri per kategori' }), d.kategori_galeri.length ? X.table([{ t: 'Kategori', k: 'nama' }, { t: 'Total', k: 'n' }, { t: 'Foto', k: 'foto' }, { t: 'Video', k: 'video' }], d.kategori_galeri) : empty('Belum ada dokumentasi', '', 'image')));
      return api('GET', '/konten/riwayat').then(function (r) { P.body.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Riwayat pengelolaan konten' }), r.rows.length ? X.table([{ t: 'Waktu', f: function (x) { return wib(x.waktu); } }, { t: 'Pengguna', k: 'username' }, { t: 'Entitas', k: 'entitas' }, { t: 'Tindakan', f: function (x) { return x.aksi.replace(/_/g, ' '); } }, { t: 'Keterangan', k: 'ket' }], r.rows) : empty('Belum ada aktivitas', '', 'list'))); return P.el; });
    }).catch(function (e) { errBox(P.body, e); return P.el; });
  }

  var VIEWS = { dashboard: viewDashboard, semua: viewSemua, tambah: viewForm, ubah: viewForm, kategori: function () { return kategoriPage('berita'); }, unggulan: viewUnggulan, galeri: function (p, q) { return viewGaleri(p, q, null); }, upload: viewUpload, video: function (p, q) { return viewGaleri(p, q, 'video'); }, 'kategori-galeri': function () { return kategoriPage('galeri'); }, media: viewMedia, statistik: viewStatistik };
  X.views.berita = function (p, q) { var k = p[0] || 'dashboard'; if (!VIEWS[k]) k = 'dashboard'; return VIEWS[k](p, q || {}); };
})();
