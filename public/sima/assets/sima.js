/* SIMA Al Hidayah - inti antarmuka: utilitas, komponen bersama, login, kerangka, router, dashboard, pengguna, log.
   Modul data (santri, alumni, pengurus, pengajar, asrama) ada di berkas m-*.js dan mendaftar lewat SIMA.views. */
(function () {
  'use strict';
  var root = document.getElementById('root');
  var SIMA = window.SIMA = { S: { user: null, csrf: '', menu: [], collapsed: false }, views: {} };
  var S = SIMA.S;

  // ---------- DOM helper (selalu textContent; tidak pernah innerHTML untuk data) ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in (attrs || {})) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'style') el.style.cssText = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(function (x) { add(el, x); }); else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); }
  var IC = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 5a3.5 3.5 0 0 1 0 7M18 14c2.2.8 3.5 2.8 3.5 6"/>',
    badge: '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="2.5"/><path d="M8 17c.8-2 2-3 4-3s3.2 1 4 3"/>', book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/>',
    bed: '<path d="M3 18V7M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="1.5"/>', wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>', cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>', chart: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', out: '<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 8l4 4-4 4M20 12H9"/>', chev: '<path d="M9 6l6 6-6 6"/>',
    mosque: '<path d="M12 3c-1.5 2-1.5 3.5 0 5 1.5-1.5 1.5-3 0-5z"/><path d="M6 21v-7a6 6 0 0 1 12 0v7M3 21h18M10 21v-4h4v4"/>', plus: '<path d="M12 5v14M5 12h14"/>', box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>', upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>'
  };
  function ico(n, cls) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i ' + (cls || '')); s.setAttribute('aria-hidden', 'true'); s.innerHTML = IC[n] || IC.box; return s; }
  function toast(msg, bad) { var t = h('div', { class: 'toast' + (bad ? ' bad' : ''), role: bad ? 'alert' : 'status', text: msg }); document.body.appendChild(t); setTimeout(function () { t.remove(); }, bad ? 6000 : 3800); }
  function fmtTime(ms) { if (!ms) return '—'; return new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); }
  function fmtDate(s) { if (!s) return null; var p = String(s).slice(0, 10).split('-'); if (p.length < 3) return s; return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function val(v, empty) { return v == null || v === '' ? h('span', { class: 'na', text: empty || 'Belum diisi' }) : String(v); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function qs(o) { var p = []; for (var k in o) if (o[k] !== '' && o[k] != null) p.push(encodeURIComponent(k) + '=' + encodeURIComponent(o[k])); return p.length ? '?' + p.join('&') : ''; }
  var JK = { L: 'Laki-laki', P: 'Perempuan' };
  var ORTU = { hidup: 'Masih hidup', meninggal: 'Meninggal dunia', tidak_diketahui: 'Tidak diketahui' };

  function api(method, url, body) {
    var o = { method: method, credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    if (method !== 'GET') o.headers['X-CSRF-Token'] = S.csrf;
    return fetch('/api/sima' + url, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && S.user) { S.user = null; renderLogin('Sesi Anda berakhir. Silakan login kembali.'); }
        if (r.status === 403 && j.kode === 'wajib_ganti' && S.user && SIMA.forcePw) { S.user.wajib_ganti = true; SIMA.forcePw(); }
        if (!r.ok) { var e = new Error(j.error || 'Terjadi kesalahan.'); e.status = r.status; e.fields = j.fields; e.data = j; throw e; }
        return j;
      });
    });
  }
  function berkasUrl(id, unduh) { return '/api/sima/berkas/' + id + (unduh ? '?unduh=1' : ''); }

  // ---------- komponen bersama ----------
  function empty(title, text, icon, action) { return h('div', { class: 'empty' }, ico(icon || 'box'), h('b', { text: title }), h('span', { text: text }), action); }
  function head(title, sub, extra) { return h('div', { class: 'pagehead' }, h('div', null, h('h1', { text: title }), sub ? h('p', { text: sub }) : null), extra ? h('div', { class: 'pagehead__act' }, extra) : null); }
  function stat(label, value, note) { return h('div', { class: 'stat' }, h('small', { text: label }), h('b', { text: String(value) }), h('span', { text: note || '' })); }
  function pill(text, kind) { return h('span', { class: 'pill pill--' + (kind || 'off'), text: text }); }
  function activePill(on) { return pill(on ? 'Aktif' : 'Nonaktif', on ? 'ok' : 'off'); }
  function btn(text, onclick, o) { o = o || {}; return h('button', { class: 'btn' + (o.ghost ? ' btn--ghost' : '') + (o.danger ? ' btn--danger' : '') + (o.sm ? ' btn--sm' : ''), type: 'button', onclick: onclick, disabled: o.disabled, title: o.title }, o.icon ? ico(o.icon) : null, text); }
  function link(text, href, o) { o = o || {}; return h('a', { class: 'btn' + (o.ghost === false ? '' : ' btn--ghost') + (o.sm ? ' btn--sm' : ''), href: href }, o.icon ? ico(o.icon) : null, text); }
  function avatar(id, nama, size) {
    var c = (nama || '?').trim().charAt(0).toUpperCase();
    if (id) { var img = h('img', { class: 'av av--' + (size || 's'), src: berkasUrl(id), alt: 'Foto ' + nama, loading: 'lazy' }); img.addEventListener('error', function () { img.replaceWith(h('span', { class: 'av av--' + (size || 's') + ' av--t', 'aria-hidden': 'true', text: c })); }); return img; }
    return h('span', { class: 'av av--' + (size || 's') + ' av--t', 'aria-hidden': 'true', text: c });
  }

  // tabel; stack = jadi kartu pada layar kecil
  function table(cols, rows, emptyEl, o) {
    o = o || {};
    if (!rows.length) return emptyEl;
    var ths = cols.map(function (c) {
      if (!c.sort || !o.onSort) return h('th', { scope: 'col', text: c.t });
      var on = o.sort === c.sort, b = h('button', { class: 'th-sort', type: 'button', 'aria-label': 'Urutkan menurut ' + c.t, onclick: function () { o.onSort(c.sort, on && o.dir === 'asc' ? 'desc' : 'asc'); } }, c.t, h('i', { text: on ? (o.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕' }));
      return h('th', { scope: 'col', 'aria-sort': on ? (o.dir === 'asc' ? 'ascending' : 'descending') : 'none' }, b);
    });
    return h('div', { class: 'tablewrap' }, h('table', { class: 'stack' },
      h('thead', null, h('tr', null, ths)),
      h('tbody', null, rows.map(function (r, i) { return h('tr', null, cols.map(function (c) { var v = c.f ? c.f(r, i) : r[c.k]; return h('td', { 'data-label': c.t, class: c.cls }, v == null || v === '' ? h('span', { class: 'na', text: '—' }) : v); })); }))));
  }
  function pager(total, page, size, onPage, onSize) {
    var pages = Math.max(1, Math.ceil(total / size)), from = total ? (page - 1) * size + 1 : 0, to = Math.min(total, page * size);
    var sel = h('select', { 'aria-label': 'Jumlah baris per halaman', onchange: function () { onSize(+sel.value); } }, [10, 25, 50, 100].map(function (n) { return h('option', { value: n, selected: n === size, text: n + ' / halaman' }); }));
    return h('div', { class: 'pager' }, h('span', { text: total ? 'Menampilkan ' + from + '–' + to + ' dari ' + total : 'Tidak ada data' }),
      h('div', { class: 'pager__c' }, sel, btn('← Sebelumnya', function () { onPage(page - 1); }, { ghost: true, sm: true, disabled: page <= 1 }), h('span', { class: 'pager__n', text: 'Hal. ' + page + '/' + pages }), btn('Berikutnya →', function () { onPage(page + 1); }, { ghost: true, sm: true, disabled: page >= pages })));
  }

  /* listView: pencarian + filter + pengurutan + paginasi + loading/kosong/galat, semuanya dari API.
     o: { endpoint, base:{}, filters:[{k,label,options:[{v,l}]}], search:'placeholder', cols, defSort, defDir, emptyEl, emptySearchEl, tools, onLoaded } */
  function listView(o) {
    var st = { q: '', page: 1, size: o.size || 25, urut: o.defSort || '', arah: o.defDir || 'asc', f: {} };
    (o.filters || []).forEach(function (f) { st.f[f.k] = f.def || ''; });
    var out = h('div', { class: 'lv__out', 'aria-busy': 'false' }), bar = h('div', { class: 'lv__bar' }), seq = 0;
    var q = h('input', { class: 'search', type: 'search', placeholder: o.search || 'Cari…', 'aria-label': o.search || 'Cari', maxlength: '60' });
    var timer; q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { st.q = q.value.trim(); st.page = 1; load(); }, 300); });
    if (o.search !== false) bar.appendChild(q);
    var selects = {};
    (o.filters || []).forEach(function (f) {
      var s = h('select', { 'aria-label': f.label, onchange: function () { st.f[f.k] = s.value; st.page = 1; if (f.onChange) f.onChange(s.value, st); load(); } }, h('option', { value: '', text: f.blank || f.label + ': semua' }), (f.options || []).map(function (op) { return h('option', { value: op.v, selected: String(op.v) === String(f.def), text: op.l }); }));
      selects[f.k] = s; bar.appendChild(s);
    });
    function setOptions(k, opts) { var s = selects[k]; if (!s) return; var cur = s.value; s.innerHTML = ''; var lab = (o.filters.filter(function (f) { return f.k === k; })[0] || {}).label; s.appendChild(h('option', { value: '', text: lab + ': semua' })); opts.forEach(function (op) { s.appendChild(h('option', { value: op.v, selected: String(op.v) === cur, text: op.l })); }); }
    function load() {
      var n = ++seq; out.setAttribute('aria-busy', 'true'); out.classList.add('is-loading');
      if (!out.firstChild) out.appendChild(h('div', { class: 'skel' }, [1, 2, 3, 4].map(function () { return h('i'); })));
      var query = Object.assign({}, o.base || {}, st.f, { q: st.q, page: st.page, size: st.size, urut: st.urut, arah: st.arah });
      api('GET', o.endpoint + qs(query)).then(function (d) {
        if (n !== seq) return; out.innerHTML = ''; out.classList.remove('is-loading'); out.setAttribute('aria-busy', 'false'); d.rows.forEach(function (r, i) { r._no = (d.page - 1) * d.size + i + 1; });
        var filtered = st.q || Object.keys(st.f).some(function (k) { return st.f[k]; });
        out.appendChild(table(o.cols, d.rows, filtered && o.emptySearchEl ? o.emptySearchEl : filtered ? empty('Tidak ditemukan', 'Coba ubah kata kunci atau filter.', 'search') : o.emptyEl, { sort: st.urut, dir: st.arah, onSort: function (k, dir) { st.urut = k; st.arah = dir; st.page = 1; load(); } }));
        if (d.total > 0) out.appendChild(pager(d.total, d.page, d.size, function (p) { st.page = p; load(); }, function (s) { st.size = s; st.page = 1; load(); }));
        if (o.onLoaded) o.onLoaded(d, setOptions);
      }).catch(function (e) { if (n !== seq) return; out.innerHTML = ''; out.classList.remove('is-loading'); out.appendChild(h('div', { class: 'note note--bad', role: 'alert', text: e.message })); });
    }
    load();
    return { el: h('div', { class: 'lv' }, bar, out), reload: load, state: st, setOptions: setOptions };
  }

  // modal (Esc menutup; fokus kembali)
  function modal(title, bodyEls, actions, o) {
    o = o || {}; var prev = document.activeElement;
    var m = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onmousedown: function (e) { if (e.target === m && !o.sticky) close(); } },
      h('div', { class: 'modal__box' + (o.wide ? ' modal__box--wide' : '') }, h('div', { class: 'modal__h' }, h('h2', { text: title }), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Tutup', onclick: function () { close(); } }, '✕')), h('div', { class: 'modal__b' }, bodyEls), actions ? h('div', { class: 'modal__act' }, actions(close)) : null));
    function key(e) { if (e.key === 'Escape' && !o.sticky) close(); }
    function close() { document.removeEventListener('keydown', key); m.remove(); if (prev && prev.focus) try { prev.focus(); } catch (e) { } if (o.onClose) o.onClose(); }
    document.addEventListener('keydown', key); document.body.appendChild(m);
    var f = m.querySelector('input:not([type=hidden]),select,textarea'); if (f) f.focus(); else m.querySelector('.iconbtn').focus();
    return { el: m, close: close };
  }
  // konfirmasi: reason 'none' | 'optional' | 'required'. Resolve {alasan} atau null bila dibatalkan.
  function confirmDialog(o) {
    return new Promise(function (resolve) {
      var ta = o.reason && o.reason !== 'none' ? h('textarea', { rows: '3', maxlength: '500', 'aria-label': 'Alasan', placeholder: o.reason === 'required' ? 'Wajib diisi (minimal 5 karakter)' : 'Opsional' }) : null;
      var err = h('div', { class: 'note note--bad', role: 'alert', hidden: true }), done = false;
      var b = modal(o.title, [h('p', { class: 'mtext', text: o.text }), o.warn ? h('p', { class: 'note note--warn', text: o.warn }) : null, ta ? h('div', { class: 'field' }, h('label', { text: o.reasonLabel || 'Alasan' }), ta) : null, err], function (close) {
        return [btn('Batal', function () { close(); }, { ghost: true }), btn(o.confirmLabel || 'Ya, lanjutkan', function (ev) {
          var a = ta ? ta.value.trim() : '';
          if (o.reason === 'required' && a.length < 5) { err.hidden = false; err.textContent = 'Alasan wajib diisi (minimal 5 karakter).'; ta.focus(); return; }
          done = true; ev.target.disabled = true; close(); resolve({ alasan: a || null });
        }, { danger: o.danger })];
      }, { onClose: function () { if (!done) resolve(null); } });
    });
  }

  // ---------- formulir ----------
  /* spec: [{title, hint, fields:[{k,label,type,options,required,max,rows,full,help,placeholder,readonly,min,maxv,el}]}]
     type: text | tel | email | date | number | textarea | select */
  function buildForm(spec, values) {
    values = values || {}; var inputs = {}, wrappers = {};
    var el = h('div', { class: 'form' }, spec.map(function (sec, si) {
      return h('fieldset', { class: 'fs' }, sec.title ? h('legend', { text: sec.title }) : null, sec.hint ? h('p', { class: 'fs__hint', text: sec.hint }) : null,
        h('div', { class: 'fs__grid' }, sec.fields.map(function (f) {
          var id = 'fm' + si + '_' + f.k, inp;
          if (f.el) inp = f.el;
          else if (f.type === 'textarea') inp = h('textarea', { id: id, rows: f.rows || 3, maxlength: f.max || 500 });
          else if (f.type === 'select') { inp = h('select', { id: id }, h('option', { value: '', text: f.blank || '— Pilih —' }), (f.options || []).map(function (op) { return h('option', { value: op.v, text: op.l }); })); }
          else inp = h('input', { id: id, type: f.type || 'text', maxlength: f.max || 120, min: f.min, max: f.maxv, inputmode: f.type === 'tel' ? 'tel' : null, autocomplete: 'off' });
          if (f.readonly) inp.disabled = true;
          if (!f.el) { var v = values[f.k]; if (v != null) inp.value = v; if (f.type === 'select' && v != null) inp.value = String(v); inputs[f.k] = inp; }
          var w = h('div', { class: 'field' + (f.full ? ' field--full' : ''), 'data-k': f.k }, f.label ? h('label', { for: id, text: f.label + (f.required ? ' *' : '') }) : null, inp, f.help ? h('small', { class: 'help', text: f.help }) : null, h('span', { class: 'err', role: 'alert' }));
          wrappers[f.k] = w; return w;
        })));
    }));
    function values_() { var o = {}; for (var k in inputs) o[k] = inputs[k].value; return o; }
    function errors(fields) {
      for (var k in wrappers) { wrappers[k].classList.remove('bad'); wrappers[k].querySelector('.err').textContent = ''; }
      var first = null; Object.keys(fields || {}).forEach(function (k) { var w = wrappers[k]; if (w) { w.classList.add('bad'); w.querySelector('.err').textContent = fields[k]; first = first || w; } });
      if (first) { var i = first.querySelector('input,select,textarea'); if (i) i.focus(); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return !!first;
    }
    return { el: el, values: values_, errors: errors, input: function (k) { return inputs[k]; }, wrapper: function (k) { return wrappers[k]; } };
  }
  // unggah berkas: validasi klien (jenis & ukuran) + pratinjau. Server tetap memvalidasi ulang.
  function fileField(o) {
    var MAX = 2.5 * 1024 * 1024, picked = null, prev = h('div', { class: 'fprev' }), msg = h('span', { class: 'err', role: 'alert' });
    var inp = h('input', { type: 'file', accept: o.pdf ? '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf' : '.jpg,.jpeg,.png,image/jpeg,image/png', 'aria-label': o.label, onchange: onPick });
    function show(nodes) { prev.innerHTML = ''; add(prev, nodes); }
    if (o.existing) show(previewNode(o.existing.url, o.existing.mime, o.existing.nama));
    function onPick() {
      var f = inp.files && inp.files[0]; msg.textContent = ''; picked = null; if (!f) return;
      var okType = /\.(jpe?g|png)$/i.test(f.name) && /^image\/(jpeg|png)$/.test(f.type) || (o.pdf && /\.pdf$/i.test(f.name) && f.type === 'application/pdf');
      if (!okType) { msg.textContent = o.pdf ? 'Format harus JPG, JPEG, PNG, atau PDF.' : 'Format foto harus JPG, JPEG, atau PNG.'; inp.value = ''; return; }
      if (f.size > MAX) { msg.textContent = 'Ukuran berkas maksimal 2,5 MB (berkas ini ' + (f.size / 1048576).toFixed(1).replace('.', ',') + ' MB).'; inp.value = ''; return; }
      var r = new FileReader();
      r.onload = function () {
        picked = { nama: f.name, data: r.result };
        show(f.type === 'application/pdf' ? h('div', { class: 'fprev__pdf' }, ico('file'), h('span', { text: f.name + ' (PDF, ' + Math.round(f.size / 1024) + ' KB). Pratinjau tersedia setelah disimpan.' })) : h('img', { src: r.result, alt: 'Pratinjau ' + o.label, class: 'fprev__img' }));
      };
      r.readAsDataURL(f);
    }
    var el = h('div', { class: 'filef' }, prev, inp, h('small', { class: 'help', text: o.help || (o.pdf ? 'JPG, JPEG, PNG, atau PDF. Maksimal 2,5 MB.' : 'JPG, JPEG, atau PNG. Maksimal 2,5 MB.') }), msg);
    return { el: el, file: function () { return picked; } };
  }
  function previewNode(url, mime, nama) {
    if (/^image\//.test(mime || '')) return h('img', { src: url, alt: nama || 'Pratinjau', class: 'fprev__img', loading: 'lazy' });
    return h('iframe', { src: url, title: 'Pratinjau ' + (nama || 'dokumen'), class: 'fprev__frame' });
  }
  SIMA.fileField = fileField; SIMA.previewNode = previewNode;

  // tab sederhana; panel dibuat saat pertama dibuka
  function tabsView(items, startKey, onSwitch) {
    var bar = h('div', { class: 'tabs tabs--wrap', role: 'tablist' }), body = h('div', { class: 'tabbody' }), cache = {}, cur = null, btns = {};
    function open(k) {
      cur = k; Object.keys(btns).forEach(function (x) { btns[x].classList.toggle('is-on', x === k); btns[x].setAttribute('aria-selected', x === k); });
      body.innerHTML = ''; var it = items.filter(function (i) { return i.k === k; })[0]; if (!cache[k] || it.fresh) cache[k] = it.render(); body.appendChild(cache[k]); if (onSwitch) onSwitch(k);
    }
    items.forEach(function (it) { var b = h('button', { class: 'tab', type: 'button', role: 'tab', text: it.t, onclick: function () { open(it.k); } }); btns[it.k] = b; bar.appendChild(b); });
    open(startKey || items[0].k);
    return { el: h('div', null, bar, body), open: open, current: function () { return cur; } };
  }
  function dl(pairs) {
    return h('dl', { class: 'dl' }, pairs.map(function (p) { return h('div', { class: p[2] ? 'dl__full' : null }, h('dt', { text: p[0] }), h('dd', null, p[1] == null || p[1] === '' ? h('span', { class: 'na', text: 'Belum diisi' }) : p[1])); }));
  }
  function errNote(e) { return h('div', { class: 'note note--bad', role: 'alert', text: e.message }); }
  function section(title, content, extra) { return h('section', { class: 'panel' }, h('div', { class: 'panel__h' }, h('h2', { text: title }), extra), content); }
  function grid(children) { var g = h('div', { class: 'pg' }); add(g, children); return g; }

  Object.assign(SIMA, { h: h, add: add, ico: ico, toast: toast, fmtTime: fmtTime, fmtDate: fmtDate, val: val, today: today, qs: qs, JK: JK, ORTU: ORTU, api: api, berkasUrl: berkasUrl, empty: empty, head: head, stat: stat, pill: pill, activePill: activePill, btn: btn, link: link, avatar: avatar,
    table: table, pager: pager, listView: listView, modal: modal, confirmDialog: confirmDialog, buildForm: buildForm, tabsView: tabsView, dl: dl, errNote: errNote, section: section, grid: grid, ready: false });

// ---------- login ---------- (ganti SELURUH fungsi renderLogin lama dengan ini)
  function renderLogin(msg) {
    root.innerHTML = '';
    var err = h('p', { class: 'lg__err', role: 'alert', hidden: !msg, text: msg || '' });
    var id = h('input', { id: 'lgId', name: 'identifier', type: 'text', autocomplete: 'username', required: true, maxlength: '120', placeholder: ' ' });
    var pw = h('input', { id: 'lgPw', name: 'password', type: 'password', autocomplete: 'current-password', required: true, maxlength: '200', placeholder: ' ' });
    var EYE = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
    var EYE_OFF = '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
    var eye = h('button', { class: 'lg__eye', type: 'button', 'aria-label': 'Tampilkan password', 'aria-pressed': 'false', onclick: function () {
      var show = pw.type === 'password'; pw.type = show ? 'text' : 'password';
      eye.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password'); eye.setAttribute('aria-pressed', show ? 'true' : 'false');
      eye.querySelector('svg').innerHTML = show ? EYE_OFF : EYE; pw.focus();
    } });
    eye.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + EYE + '</svg>';
    var b = h('button', { class: 'lg__go', type: 'submit', text: 'Masuk' });
    var form = h('form', { class: 'lg__card', novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      if (!id.value.trim() || !pw.value) { err.hidden = false; err.textContent = 'Username/email dan password wajib diisi.'; return; }
      b.disabled = true; b.textContent = 'Memeriksa…';
      fetch('/api/sima/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: id.value.trim(), password: pw.value }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) { if (!r.ok) throw new Error(r.j.error || 'Login gagal.'); pw.value = ''; return boot(); })
        .catch(function (e) { err.hidden = false; err.textContent = e.message; b.disabled = false; b.textContent = 'Masuk'; pw.value = ''; pw.type = 'password'; pw.focus(); });
    } },
      h('h2', { text: 'Masuk ke SIMA' }), h('p', { class: 'csub', text: 'Selamat datang di Manajamen PP.Alhidayah Induk.' }), err,
      h('div', { class: 'lg__f' }, id, h('label', { for: 'lgId', text: 'Username atau email' })),
      h('div', { class: 'lg__f' }, pw, h('label', { for: 'lgPw', text: 'Password' }), eye), b);
    var bg = h('div', { class: 'lg__bg', 'aria-hidden': 'true' }, h('i', { class: 'lg__orb lg__orb--1' }), h('i', { class: 'lg__orb lg__orb--2' }), h('i', { class: 'lg__orb lg__orb--3' }));
    root.appendChild(h('div', { class: 'lg' }, bg,
      h('div', { class: 'lg__box' },
        h('div', { class: 'lg__brand' },   h('div', { class: 'lg__logo' }, h('img', { src: '/logo.png', alt: 'Logo Al Hidayah', onerror: function () { this.replaceWith(ico('mosque')); } })), h('b', { text: 'Sistem Informasi Manajemen Al Hidayah Induk' })),
        form, h('a', { class: 'lg__back', href: '/', text: '← Kembali ke website pondok' }))));
    id.focus();
  }

  // ---------- kerangka ----------
  var shell, content, titleEl, navEl;
  function renderShell() {
    root.innerHTML = '';
    var u = S.user;
    navEl = h('nav', { class: 'sb__nav', 'aria-label': 'Menu utama' });
    var sb = h('aside', { class: 'sb', id: 'sidebar' }, h('div', { class: 'sb__brand' },   h('span', { class: 'sb__mark' }, h('img', { src: '/logo.png', alt: 'Logo Al Hidayah', onerror: function () { this.replaceWith(ico('mosque')); } })), h('div', { class: 'sb__name' }, 'SIMA', h('small', { text: 'Al Hidayah' }))), navEl);
    titleEl = h('div', { class: 'top__title', id: 'pageTitle', tabindex: '-1' });
    var toggle = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Buka atau tutup menu', 'aria-controls': 'sidebar', onclick: function () {
      if (window.matchMedia('(max-width: 860px)').matches) shell.classList.toggle('is-open'); else { S.collapsed = !S.collapsed; shell.classList.toggle('is-collapsed', S.collapsed); }
    } }, ico('menu'));
    var initial = (u.nama || u.username).trim().charAt(0).toUpperCase();
    var top = h('header', { class: 'top' }, toggle, titleEl,
      h('div', { class: 'who' }, h('div', { class: 'who__t' }, h('b', { text: u.nama }), h('small', { text: u.roleLabel })), h('span', { class: 'who__av', 'aria-hidden': 'true', text: initial })),
      h('button', { class: 'iconbtn', type: 'button', title: 'Ubah password', 'aria-label': 'Ubah password', onclick: function () { SIMA.pwModal(false); } }, ico('key')),
      h('button', { class: 'iconbtn', type: 'button', title: 'Keluar', 'aria-label': 'Keluar', onclick: logout }, ico('out')));
    content = h('main', { class: 'content', id: 'content' });
    shell = h('div', { class: 'shell' + (S.collapsed ? ' is-collapsed' : '') }, sb, h('div', { class: 'main' }, top, content), h('div', { class: 'scrim', onclick: function () { shell.classList.remove('is-open'); } }));
    root.appendChild(shell);
    buildNav();
  }
  function buildNav() {
    navEl.innerHTML = '';
    S.menu.forEach(function (m) {
      if (m.children) {
        var sub = h('div', { class: 'sub', hidden: true });
        var b = h('button', { class: 'nv', type: 'button', 'aria-expanded': 'false', onclick: function () { var o = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', o); sub.hidden = !o; } }, ico(m.icon), h('span', { text: m.label }), ico('chev', 'chev'));
        var lastG = null; m.children.forEach(function (c) { if (c.grup && c.grup !== lastG) sub.appendChild(h('small', { class: 'sub__g', text: c.grup })); if (!c.grup) lastG = null; else lastG = c.grup; sub.appendChild(h('a', { class: 'nv', href: c.route, 'data-route': c.route }, h('span', { text: c.label }))); });
        navEl.appendChild(b); navEl.appendChild(sub);
      } else navEl.appendChild(h('a', { class: 'nv', href: m.route, 'data-route': m.route }, ico(m.icon), h('span', { text: m.label }), m.tersedia ? null : h('em', { class: 'nv__tag', text: 'Segera' })));
    });
  }
  function markNav(route) {
    navEl.querySelectorAll('a.nv').forEach(function (a) { a.classList.toggle('is-on', a.getAttribute('data-route') === route); });
    var on = navEl.querySelector('a.nv.is-on');
    if (on && on.parentElement.classList.contains('sub')) { on.parentElement.hidden = false; on.parentElement.previousElementSibling.setAttribute('aria-expanded', 'true'); }
  }
  function logout() { api('POST', '/auth/logout', {}).catch(function () { }).then(function () { S.user = null; location.hash = ''; renderLogin(); }); }

  // ---------- dashboard ----------
  function viewDashboard() {
    var role = S.user.role, wrap = h('div', { class: 'stack-g' });
    wrap.appendChild(head('Dashboard', 'Selamat datang, ' + S.user.nama + '.'));
    if (role === 'super_admin') {
      return api('GET', '/dashboard').then(function (d) {
        var g = function (t, items) { return h('section', { class: 'dgroup' }, h('h2', { text: t }), h('div', { class: 'stats' }, items)); };
        wrap.appendChild(g('Data Santri', [stat('Santri aktif', d.santri.total, d.santri.total ? '' : 'Belum ada data santri'), stat('Santri putra', d.santri.putra, 'aktif'), stat('Santri putri', d.santri.putri, 'aktif'), stat('Belum berkamar', d.santri_tanpa_kamar, 'santri aktif')]));
        wrap.appendChild(g('Data Alumni', [stat('Total alumni', d.alumni.total, d.alumni.total ? '' : 'Belum ada alumni'), stat('Alumni putra', d.alumni.putra, ''), stat('Alumni putri', d.alumni.putri, ''), stat('Alumni lulus', d.alumni.lulus, ''), stat('Alumni berhenti', d.alumni.berhenti, '')]));
        wrap.appendChild(g('Pengurus dan Pengajar', [stat('Pengurus putra', d.pengurus.putra, 'aktif'), stat('Pengurus putri', d.pengurus.putri, 'aktif'), stat('Pengajar', d.pengajar.total, 'aktif')]));
        wrap.appendChild(g('Asrama dan Kamar', [stat('Asrama putra', d.asrama[0].jumlah, ''), stat('Asrama putri', d.asrama[1].jumlah, ''), stat('Total kamar', d.kamar.total, ''), stat('Kamar terisi', d.kamar.terisi, ''), stat('Kamar masih ada kapasitas', d.kamar.masih_ada_kapasitas, 'kamar aktif')]));
        wrap.appendChild(h('div', { class: 'grid2' },
          h('section', { class: 'panel' }, h('h2', { text: 'Keterisian asrama' }), h('div', { class: 'stack-s' }, d.asrama.map(function (a) {
            var pct = a.kapasitas ? Math.min(100, Math.round(a.terisi / a.kapasitas * 100)) : 0;
            var bar = h('div', { class: 'bar', role: 'img', 'aria-label': 'Keterisian ' + pct + ' persen' }, h('i')); bar.firstChild.style.width = pct + '%';
            return h('div', null, h('div', { class: 'row-b' }, h('b', { text: 'Asrama ' + (a.jenis === 'putra' ? 'Putra' : 'Putri') }), h('span', { text: a.terisi + ' / ' + a.kapasitas + ' terisi' })), bar,
              h('small', { class: 'muted', text: a.kamar ? a.kamar + ' kamar' : 'Belum ada kamar.' }));
          }))),
          h('section', { class: 'panel' }, h('h2', { text: 'Aktivitas terbaru' }),
            d.aktivitas.length ? h('ul', { class: 'feed' }, d.aktivitas.map(function (a) { return h('li', null, h('time', { text: fmtTime(a.waktu) }), h('span', null, h('b', { text: (a.username || 'sistem') + ' ' }), a.keterangan)); })) : empty('Belum ada aktivitas', 'Aktivitas akan tampil di sini.', 'list'))));
        var rp = function (n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); };
        if (d.keuangan) wrap.appendChild(g('Ringkasan Keuangan', [stat('Tagihan belum lunas', d.keuangan.tagihan_belum_lunas, 'belum + sebagian'), stat('Tunggakan (lewat jatuh tempo)', rp(d.keuangan.tunggakan), ''), stat('Pembayaran bulan ini', rp(d.keuangan.pembayaran_bulan_ini), 'tercatat sah'), stat('Saldo kas pondok', rp(d.keuangan.saldo_kas), 'kas operasional'), stat('Total tabungan santri', rp(d.keuangan.saldo_tabungan), 'terpisah dari kas')]));
        if (d.keamanan) wrap.appendChild(g('Ringkasan Keamanan', [stat('Pelanggaran bulan ini', d.keamanan.pelanggaran_bulan_ini, ''), stat('Pembinaan bulan ini', d.keamanan.pembinaan_bulan_ini, ''), stat('Santri sedang izin', d.keamanan.izin_berlangsung, ''), stat('Belum kembali (lewat jadwal)', d.keamanan.belum_kembali, d.keamanan.belum_kembali ? 'perlu ditindaklanjuti' : '')]));
        if (d.pendidikan) wrap.appendChild(g('Ringkasan Pendidikan', [stat('Kelas aktif', d.pendidikan.kelas_aktif, ''), stat('Peserta aktif', d.pendidikan.peserta_aktif, 'santri aktif'), stat('Sesi pembelajaran bulan ini', d.pendidikan.sesi_bulan_ini, '')]));
        if (d.konten) wrap.appendChild(g('Berita dan Galeri', [stat('Berita terbit', d.konten.berita_terbit, 'tayang di website'), stat('Berita draft', d.konten.berita_draft, ''), stat('Dokumentasi', d.konten.dokumentasi_total, d.konten.foto + ' foto · ' + d.konten.video + ' video')]));
        wrap.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Backup data' }), h('p', { class: d.backup_terakhir ? '' : 'note note--warn', text: d.backup_terakhir ? 'Backup terverifikasi terakhir: ' + fmtTime(d.backup_terakhir) + '.' : 'Belum ada backup terverifikasi. Buat backup di Pengaturan › Backup & Pemulihan.' }), h('div', { class: 'tools tools--start' }, link('Kelola backup', '#/pengaturan/backup'))));
        wrap.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Akses cepat' }), h('div', { class: 'tools tools--start' }, [['#/santri/putra', 'Santri Putra'], ['#/santri/putri', 'Santri Putri'], ['#/alumni/semua', 'Data Alumni'], ['#/pengurus/putra', 'Pengurus'], ['#/pengajar', 'Pengajar'], ['#/asrama/putra', 'Asrama dan Kamar'], ['#/pengguna', 'Manajemen Pengguna'], ['#/log', 'Aktivitas Sistem']].map(function (l) { return h('a', { class: 'btn btn--ghost', href: l[0], text: l[1] }); }))));
        return wrap;
      });
    }
    var isB = role === 'bendahara';
    if (isB && SIMA.views.keuanganDashboard) return SIMA.views.keuanganDashboard();
    if (role === 'keamanan' && SIMA.views.keamananDashboard) return SIMA.views.keamananDashboard();
    wrap.appendChild(h('div', { class: 'stats' }, (isB ? ['Tagihan belum lunas', 'Pembayaran bulan ini', 'Saldo kas'] : ['Pelanggaran', 'Pembinaan', 'Perizinan aktif']).map(function (l) { return stat(l, '—', 'Modul ini dikerjakan pada tahap berikutnya'); })));
    wrap.appendChild(h('section', { class: 'panel' }, empty(isB ? 'Modul keuangan belum tersedia' : 'Modul keamanan belum tersedia', 'Ringkasan akan menampilkan data sebenarnya setelah modul dibuat. Tidak ada angka contoh.', isB ? 'wallet' : 'shield'),
      h('div', { class: 'tools tools--center' }, link('Lihat Data Santri', '#/santri/putra'))));
    return Promise.resolve(wrap);
  }
  function viewSoon(label) { return Promise.resolve(h('div', { class: 'stack-g' }, head(label), h('section', { class: 'panel' }, empty('Modul belum tersedia', 'Modul ' + label + ' dikerjakan pada tahap berikutnya dan belum dapat digunakan.', 'gear')))); }

  // ---------- manajemen pengguna ----------
  function field(id, label, input) { return h('div', { class: 'field', id: 'f_' + id }, h('label', { for: id, text: label }), input, h('span', { class: 'err', id: id + 'E' })); }
  function showErrors(fields, e) { Object.keys(fields).forEach(function (k) { var w = document.getElementById('f_' + k), s = document.getElementById(k + 'E'); if (w) w.classList.remove('bad'); if (s) s.textContent = ''; }); Object.keys(e.fields || {}).forEach(function (k) { var w = document.getElementById('f_' + k), s = document.getElementById(k + 'E'); if (w) w.classList.add('bad'); if (s) s.textContent = e.fields[k]; }); }
  function viewPengguna() {
    var wrap = h('div', { class: 'stack-g' });
    function load() {
      return api('GET', '/users').then(function (d) {
        wrap.innerHTML = '';
        wrap.appendChild(head('Manajemen Pengguna', 'Hanya tiga role: Super Admin, Bendahara, dan Keamanan.', btn('Tambah akun', function () { userForm(null, d.roles); }, { icon: 'plus' })));
        wrap.appendChild(h('section', { class: 'panel' }, table([{ t: 'Nama', k: 'nama' }, { t: 'Username', k: 'username' }, { t: 'Email', k: 'email' }, { t: 'Role', f: function (r) { return (d.roles.filter(function (x) { return x.id === r.role; })[0] || {}).label; } },
          { t: 'Status', f: function (r) { return h('span', null, activePill(r.aktif), r.terkunci ? pill('Terkunci', 'off') : null, r.wajib_ganti ? pill('Wajib ganti password', 'info') : null); } }, { t: 'Login terakhir', f: function (r) { return fmtTime(r.terakhir_login); } },
          { t: 'Aksi', f: function (r) { return h('div', { class: 'acts' }, btn('Ubah', function () { userForm(r, d.roles); }, { ghost: true, sm: true }), btn('Password', function () { pwForm(r); }, { ghost: true, sm: true }), btn('Keamanan akun', function () { SIMA.akunKeamanan(r, load); }, { ghost: true, sm: true })); } }], d.rows, empty('Belum ada akun', '', 'key'))));
      });
    }
    function userForm(u, roles) {
      var isNew = !u;
      var inp = { username: h('input', { id: 'username', value: u ? u.username : '', disabled: !isNew, maxlength: '40', autocomplete: 'off' }), nama: h('input', { id: 'nama', value: u ? u.nama : '', maxlength: '100' }),
        email: h('input', { id: 'email', type: 'email', value: u && u.email || '', maxlength: '120' }),
        role: h('select', { id: 'role' }, roles.map(function (r) { return h('option', { value: r.id, selected: u && u.role === r.id, text: r.label }); })),
        password: h('input', { id: 'password', type: 'password', autocomplete: 'new-password', maxlength: '200' }),
        aktif: h('select', { id: 'aktif' }, h('option', { value: '1', selected: !u || u.aktif, text: 'Aktif' }), h('option', { value: '0', selected: u && !u.aktif, text: 'Nonaktif' })) };
      var note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' });
      var els = [note, field('nama', 'Nama lengkap', inp.nama), field('username', 'Username', inp.username), field('email', 'Email (opsional)', inp.email), field('role', 'Role', inp.role)];
      if (isNew) els.push(field('password', 'Password awal (min. 12, huruf besar/kecil, angka)', inp.password)); else els.push(field('aktif', 'Status akun', inp.aktif));
      modal(isNew ? 'Tambah akun' : 'Ubah akun', els, function (close) {
        return [btn('Batal', close, { ghost: true }), h('button', { class: 'btn', type: 'button', text: 'Simpan', onclick: function (ev) {
          var body = { nama: inp.nama.value, email: inp.email.value, role: inp.role.value }; if (isNew) { body.username = inp.username.value; body.password = inp.password.value; } else body.aktif = inp.aktif.value === '1';
          ev.target.disabled = true;
          var kirim = function (extra) { return api(isNew ? 'POST' : 'PATCH', isNew ? '/users' : '/users/' + u.id, Object.assign(body, extra || {})); };
          kirim().then(function () { close(); toast(isNew ? 'Akun dibuat.' : 'Perubahan disimpan.'); load(); })
            .catch(function (e) { ev.target.disabled = false;
              if (e.status === 409 && e.data && e.data.perlu_konfirmasi) { confirmDialog({ title: 'Akun Super Admin dilindungi', text: e.message, confirmLabel: 'Ya, lanjutkan', danger: true }).then(function (c) { if (c) { ev.target.disabled = true; kirim({ konfirmasi_super_admin: true }).then(function () { close(); toast('Perubahan disimpan.'); load(); }).catch(function (e2) { ev.target.disabled = false; note.hidden = false; note.textContent = e2.message; }); } }); return; }
              showErrors(inp, e); note.hidden = false; note.textContent = e.message; });
        } })];
      });
    }
    function pwForm(u) {
      var pw = h('input', { id: 'password', type: 'password', autocomplete: 'new-password', maxlength: '200' });
      var note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' });
      modal('Atur ulang password: ' + u.username, [note, field('password', 'Password baru (min. 12, huruf besar/kecil, angka)', pw), h('p', { class: 'note note--warn', text: 'Semua sesi login akun ini akan diakhiri.' })], function (close) {
        return [btn('Batal', close, { ghost: true }), h('button', { class: 'btn', type: 'button', text: 'Simpan', onclick: function () {
          api('POST', '/users/' + u.id + '/password', { password: pw.value }).then(function () { close(); toast('Password diperbarui.'); }).catch(function (e) { showErrors({ password: 1 }, e); note.hidden = false; note.textContent = e.message; });
        } })];
      });
    }
    return load().then(function () { return wrap; });
  }
  function viewLog(page) {
    return api('GET', '/log?page=' + page).then(function (d) {
      var pages = Math.max(1, Math.ceil(d.total / d.size));
      return h('div', { class: 'stack-g' }, head('Aktivitas Sistem', d.total + ' catatan. Catatan tidak dapat diubah atau dihapus.'),
        h('section', { class: 'panel stack-s' }, table([{ t: 'Waktu', f: function (r) { return fmtTime(r.waktu); } }, { t: 'Pengguna', k: 'username' }, { t: 'Aktivitas', k: 'aksi' }, { t: 'Modul', k: 'modul' }, { t: 'Keterangan', k: 'keterangan' }, { t: 'IP', k: 'ip' }], d.rows, empty('Belum ada aktivitas', '', 'list')),
          h('div', { class: 'tools' }, h('span', { text: 'Halaman ' + d.page + ' dari ' + pages }), h('div', { class: 'acts' },
            h('a', { class: 'btn btn--ghost btn--sm', href: '#/log/' + Math.max(1, d.page - 1), 'aria-disabled': d.page <= 1, text: '← Baru' }), h('a', { class: 'btn btn--ghost btn--sm', href: '#/log/' + Math.min(pages, d.page + 1), 'aria-disabled': d.page >= pages, text: 'Lama →' })))));
    });
  }
  SIMA.views.dashboard = function () { return viewDashboard(); };
  SIMA.views.pengguna = function () { return viewPengguna(); };
  SIMA.views.log = function (p) { return viewLog(Math.max(1, parseInt(p[0], 10) || 1)); };

  // ---------- router ----------
  var TITLES = { dashboard: 'Dashboard', santri: 'Data Santri', alumni: 'Data Alumni', pengurus: 'Data Pengurus', pengajar: 'Data Pengajar', asrama: 'Asrama dan Kamar', bendahara: 'Keuangan', keamanan: 'Keamanan', pendidikan: 'Pendidikan', berita: 'Berita dan Galeri', laporan: 'Laporan', pengguna: 'Manajemen Pengguna', log: 'Aktivitas Sistem', pengaturan: 'Pengaturan', impor: 'Impor Data' };
  var PROBE = { berita: 'konten/dashboard', pendidikan: 'pendidikan/dashboard', pengguna: 'users', pengurus: 'pengurus?kelompok=putra', asrama: 'asrama', alumni: 'alumni' };
  function denied() { return h('section', { class: 'panel' }, empty('Akses ditolak', 'Anda tidak memiliki hak akses ke halaman ini.', 'shield')); }
  SIMA.denied = denied;
  function parseHash() { var raw = (location.hash || '#/dashboard').replace(/^#\/?/, ''), i = raw.indexOf('?'), path = i < 0 ? raw : raw.slice(0, i), query = {}; if (i >= 0) raw.slice(i + 1).split('&').forEach(function (kv) { var x = kv.split('='); if (x[0]) query[decodeURIComponent(x[0])] = decodeURIComponent(x[1] || ''); }); return { p: path.split('/').filter(Boolean), q: query }; }
  SIMA.parseHash = parseHash;
  SIMA.setQuery = function (q) { var x = parseHash(); var s = Object.keys(q).filter(function (k) { return q[k]; }).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&'); history.replaceState(null, '', '#/' + x.p.join('/') + (s ? '?' + s : '')); };
  function route() {
    if (!S.user) return;
    if (S.user.wajib_ganti && SIMA.forcePw) SIMA.forcePw();
    var ph = parseHash(), p = ph.p, mod = p[0] || 'dashboard';
    if (!TITLES[mod]) { content.innerHTML = ''; titleEl.textContent = 'Halaman tidak ditemukan'; content.appendChild(h('section', { class: 'panel' }, empty('Halaman tidak ditemukan', 'Alamat yang Anda buka tidak tersedia.', 'box'))); return; }
    titleEl.textContent = TITLES[mod]; document.title = TITLES[mod] + ' · SIMA Al Hidayah';
    markNav('#/' + p.slice(0, p[1] && (mod === 'bendahara' ? /^(dashboard|tagihan|pembayaran|tunggakan|tabungan|kas|laporan|pengaturan|audit)$/ : mod === 'keamanan' ? /^(dashboard|pelanggaran|pembinaan|izin-keluar|izin-pulang|monitoring|santri|laporan|pengaturan)$/ : mod === 'berita' ? /^(dashboard|semua|tambah|ubah|kategori|unggulan|galeri|upload|video|kategori-galeri|media|statistik)$/ : mod === 'pendidikan' ? /^(dashboard|jenis|materi|kelas|peserta|penugasan|jadwal|presensi|presensi-pengajar|penilaian|riwayat|laporan|pengaturan)$/ : /^(putra|putri|semua|statistik)$/).test(p[1]) ? 2 : 1).join('/'));
    shell.classList.remove('is-open');
    var allowed = S.menu.some(function (m) { return m.id === mod; }), job;
    if (!allowed) job = api('GET', '/' + (PROBE[mod] || mod)).then(function () { return denied(); }, function () { return denied(); });   // server tetap yang memutuskan (dan mencatat percobaan)
    else if (SIMA.views[mod]) job = Promise.resolve().then(function () { return SIMA.views[mod](p.slice(1), ph.q); });
    else job = viewSoon(TITLES[mod]);
    var token = ++route.n; content.setAttribute('aria-busy', 'true');
    job.then(function (el) { if (token !== route.n) return; content.innerHTML = ''; content.appendChild(el); content.setAttribute('aria-busy', 'false'); content.style.animation = 'none'; void content.offsetWidth; content.style.animation = ''; if (!ph.q.keep) window.scrollTo(0, 0); })
      .catch(function (e) { if (token !== route.n) return; content.innerHTML = ''; content.setAttribute('aria-busy', 'false'); content.appendChild(h('section', { class: 'panel' }, e.status === 403 ? denied() : errNote(e))); });
  }
  route.n = 0;
  window.addEventListener('hashchange', route);
  SIMA.route = route;

  function boot() {
    return fetch('/api/sima/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) {
      if (r.status === 401) { S.user = null; renderLogin(); return; }
      return r.json().then(function (d) { S.user = d.user; S.csrf = d.csrf; S.menu = d.menu; renderShell(); if (!location.hash) location.hash = '#/dashboard'; route(); });
    }).catch(function () { root.textContent = 'Tidak dapat terhubung ke server.'; });
  }
  SIMA.start = boot;
})();
