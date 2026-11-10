/* SIMA - Modul Bendahara / Keuangan: dashboard, tagihan, pembayaran + kuitansi, tunggakan, tabungan, kas pondok, laporan, pengaturan, audit.
   Semua angka berasal dari API (database). Tidak ada nominal atau data contoh di berkas ini. */
(function () {
  'use strict';
  var X = window.SIMA, h = X.h, api = X.api, toast = X.toast, empty = X.empty, btn = X.btn, fmtDate = X.fmtDate, qs = X.qs;
  var R = '#/bendahara/';
  function fail(e) { toast(e.message, true); }
  function rp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
  var BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function periodeLabel(p) { var m = /^(\d{4})-(\d{2})$/.exec(p || ''); return m ? BLN[+m[2] - 1] + ' ' + m[1] : (p || ''); }
  function token() { try { var a = new Uint8Array(12); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); } catch (e) { return String(Date.now()) + Math.random().toString(36).slice(2, 10); } }
  var SB = { belum: ['Belum dibayar', 'bad'], sebagian: ['Dibayar sebagian', 'info'], lunas: ['Lunas', 'ok'], dibatalkan: ['Dibatalkan', 'off'] };
  function sPill(s) { var x = SB[s] || [s, 'off']; return X.pill(x[0], x[1]); }
  function pad(s) { return h('div', { class: 'stack-s' }, s); }
  var ref = null;
  function loadRef(force) { return (ref && !force ? Promise.resolve(ref) : api('GET', '/keuangan/ref').then(function (d) { ref = d; return d; })); }
  function opts(rows, key) { return rows.filter(function (r) { return r.aktif !== false; }).map(function (r) { return { v: r.id, l: r[key || 'nama'] }; }); }
  function selectEl(options, blank, id) { var s = h('select', { id: id || null }, h('option', { value: '', text: blank })); options.forEach(function (o) { s.appendChild(h('option', { value: o.v, text: o.l })); }); return s; }
  function field(label, el, help, full) { return h('div', { class: 'field' + (full ? ' field--full' : '') }, h('label', { text: label }), el, help ? h('small', { class: 'help', text: help }) : null, h('span', { class: 'err', role: 'alert' })); }
  function setErr(wrap, fields, msg) { wrap.querySelectorAll('.field').forEach(function (f) { f.classList.remove('bad'); var s = f.querySelector('.err'); if (s) s.textContent = ''; }); }
  // input rupiah: tampil dengan pemisah ribuan, nilai bilangan bulat
  function moneyInput(label, o) {
    o = o || {}; var i = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '16', placeholder: o.ph || '0', 'aria-label': label });
    i.addEventListener('input', function () { var d = i.value.replace(/\D/g, '').slice(0, 13); i.value = d ? Number(d).toLocaleString('id-ID') : ''; if (o.onChange) o.onChange(); });
    return { el: field(label, h('div', { class: 'money' }, h('span', { text: 'Rp' }), i), o.help), input: i, value: function () { return i.value.replace(/\D/g, ''); }, set: function (v) { i.value = v ? Number(v).toLocaleString('id-ID') : ''; } };
  }
  function dateInput(label, v, o) { var i = h('input', { type: 'date', max: (o && o.noMax) ? null : X.today(), value: v || X.today() }); return { el: field(label, i, o && o.help), input: i, value: function () { return i.value; } }; }
  function textInput(label, o) { o = o || {}; var i = o.area ? h('textarea', { rows: '2', maxlength: String(o.max || 500) }) : h('input', { type: 'text', maxlength: String(o.max || 150), autocomplete: 'off', placeholder: o.ph || null }); return { el: field(label, i, o.help, o.full), input: i, value: function () { return i.value.trim(); } }; }
  function showFieldErrors(root, fields, map) {
    Object.keys(fields || {}).forEach(function (k) { var tgt = map && map[k]; if (!tgt) return; var w = tgt.el || tgt; w.classList.add('bad'); var s = w.querySelector('.err'); if (s) s.textContent = fields[k]; });
  }
  function dlLink(label, href, o) { return h('a', { class: 'btn btn--ghost' + (o && o.sm ? ' btn--sm' : ''), href: href, download: '', text: label }); }
  function printNode() { document.body.classList.add('printing'); var done = function () { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); setTimeout(function () { window.print(); if (!/Firefox/.test(navigator.userAgent)) setTimeout(done, 400); }, 50); }

  // ---------- navigasi atas ----------
  var NAV = [['dashboard', 'Dashboard'], ['syahriah', 'Syahriah'], ['tagihan', 'Tagihan'], ['pembayaran', 'Pembayaran'], ['tunggakan', 'Tunggakan'], ['tabungan', 'Tabungan'], ['kas', 'Kas Pondok'], ['laporan', 'Laporan'], ['pengaturan', 'Kategori'], ['audit', 'Audit']];
  function nav(active) {
    var sa = X.S.user && X.S.user.role === 'super_admin';
    return h('nav', { class: 'tabs tabs--wrap', 'aria-label': 'Menu keuangan' }, NAV.filter(function (n) { return n[0] !== 'audit' || sa; }).map(function (n) { return h('a', { class: 'tab' + (n[0] === active ? ' is-on' : ''), href: R + n[0], text: n[1] }); }));
  }
  function page(active, title, sub, actions) { var body = h('div', { class: 'stack-s' }); var w = h('div', { class: 'stack-g' }, X.head(title, sub, actions), h('section', { class: 'panel stack-s' }, nav(active), body)); return { el: w, body: body }; }

  // ---------- grafik SVG ringan (tanpa pustaka; kompatibel dengan CSP) ----------
  var NS = 'http://www.w3.org/2000/svg';
  function sv(tag, a, kids) { var e = document.createElementNS(NS, tag); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); (kids || []).forEach(function (c) { e.appendChild(c); }); return e; }
  function stext(x, y, t, cls, anchor) { var e = sv('text', { x: x, y: y, class: cls || 'ch-t', 'text-anchor': anchor || 'middle' }); e.textContent = t; return e; }
  function short(n) { n = Number(n); var a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(1).replace('.0', '') + ' M' : a >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' jt' : a >= 1e3 ? (n / 1e3).toFixed(0) + ' rb' : String(n); }
  function lbl(k) { return /^\d{4}-\d{2}-\d{2}$/.test(k) ? k.slice(8) + '/' + k.slice(5, 7) : /^\d{4}-\d{2}$/.test(k) ? BLN[+k.slice(5) - 1].slice(0, 3) : k; }
  function chartBox(title, body, legend, total) { return h('figure', { class: 'chart' }, h('figcaption', null, h('b', { text: title }), legend || null), body, total ? h('p', { class: 'chart__sr muted', text: total }) : null); }
  function legend(items) { return h('span', { class: 'legend' }, items.map(function (i) { return h('span', null, h('i', { class: 'sw ' + i[0] }), i[1]); })); }
  function niceMax(m) { if (m <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(m))), n = m / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function axes(W, Hh, L, T, B, max, min) {
    var g = sv('g'), span = max - min; for (var i = 0; i <= 4; i++) { var y = T + (Hh - T - B) * (1 - i / 4), v = min + span * i / 4; g.appendChild(sv('line', { x1: L, x2: W - 8, y1: y, y2: y, class: 'ch-g' })); g.appendChild(stext(L - 6, y + 3, short(v), 'ch-t', 'end')); } return g;
  }
  function barChart(rows, keys, cls, title) {
    var W = 560, Hh = 260, L = 66, T = 10, B = 34, max = niceMax(Math.max.apply(null, [0].concat(rows.map(function (r) { return Math.max.apply(null, keys.map(function (k) { return r[k]; })); })))), s = sv('svg', { viewBox: '0 0 ' + W + ' ' + Hh, role: 'img', 'aria-label': title, class: 'ch' });
    s.appendChild(axes(W, Hh, L, T, B, max, 0)); var n = Math.max(rows.length, 1), cw = (W - L - 8) / n, bw = Math.min(26, cw / (keys.length + 0.8));
    rows.forEach(function (r, i) {
      keys.forEach(function (k, j) { var hh = (Hh - T - B) * r[k] / max, x = L + cw * i + (cw - bw * keys.length) / 2 + bw * j; var rect = sv('rect', { x: x, y: Hh - B - hh, width: bw - 2, height: Math.max(hh, r[k] > 0 ? 1 : 0), rx: 2, class: cls[j] }); rect.appendChild(sv('title', {}, [])); rect.firstChild.textContent = lbl(r.k) + ': ' + rp(r[k]); s.appendChild(rect); });
      if (n <= 6 || i % Math.ceil(n / 6) === 0) s.appendChild(stext(L + cw * i + cw / 2, Hh - 10, lbl(r.k)));
    }); return s;
  }
  function lineChart(rows, cls, title) {
    var W = 560, Hh = 260, L = 66, T = 10, B = 34, vals = rows.map(function (r) { return r.v; }), mx = Math.max.apply(null, [0].concat(vals)), mn = Math.min.apply(null, [0].concat(vals)), max = niceMax(mx), min = mn < 0 ? -niceMax(-mn) : 0;
    var s = sv('svg', { viewBox: '0 0 ' + W + ' ' + Hh, role: 'img', 'aria-label': title, class: 'ch' }); s.appendChild(axes(W, Hh, L, T, B, max, min));
    var n = rows.length, xs = function (i) { return n === 1 ? (L + W - 8) / 2 : L + (W - L - 8) * i / (n - 1); }, ys = function (v) { return T + (Hh - T - B) * (1 - (v - min) / ((max - min) || 1)); };
    if (n) { s.appendChild(sv('polyline', { points: rows.map(function (r, i) { return xs(i).toFixed(1) + ',' + ys(r.v).toFixed(1); }).join(' '), class: cls, fill: 'none' })); rows.forEach(function (r, i) { var c = sv('circle', { cx: xs(i), cy: ys(r.v), r: 3, class: cls + '-d' }); var t = sv('title'); t.textContent = lbl(r.k) + ': ' + rp(r.v); c.appendChild(t); s.appendChild(c); if (n <= 6 || i % Math.ceil(n / 6) === 0) s.appendChild(stext(xs(i), Hh - 10, lbl(r.k))); }); }
    return s;
  }
  function statusBars(rows) {
    var tot = rows.reduce(function (a, r) { return a + r.v; }, 0), cl = ['ch-ok', 'ch-info', 'ch-bad'];
    if (!tot) return h('p', { class: 'muted', text: 'Belum ada tagihan pada periode ini.' });
    return h('div', { class: 'sbars' }, rows.map(function (r, i) { return h('div', { class: 'sbar' }, h('span', { text: r.k }), h('div', { class: 'sbar__t' }, h('div', { class: 'sbar__f ' + cl[i], style: 'width:' + (100 * r.v / tot).toFixed(1) + '%' })), h('b', { text: r.v + ' (' + Math.round(100 * r.v / tot) + '%)' })); }));
  }

  // ---------- dashboard ----------
  var PERIODE = [['hari', 'Hari ini'], ['minggu', 'Minggu ini'], ['bulan', 'Bulan ini'], ['tahun', 'Tahun ini'], ['rentang', 'Rentang tanggal']];
  function viewDashboard(q) {
    var st = { periode: q.periode || 'bulan', dari: q.dari || '', sampai: q.sampai || '' }, body = h('div', { class: 'stack-s' }), timer = null;
    var P = page('dashboard', 'Dashboard Keuangan', 'Ringkasan dari transaksi yang tersimpan di database. Pembayaran santri, tabungan, dan kas pondok dihitung terpisah.');
    var sel = h('select', { 'aria-label': 'Periode' }, PERIODE.map(function (p) { return h('option', { value: p[0], text: p[1], selected: p[0] === st.periode }); }));
    var d1 = h('input', { type: 'date', 'aria-label': 'Dari tanggal', value: st.dari }), d2 = h('input', { type: 'date', 'aria-label': 'Sampai tanggal', value: st.sampai }), range = h('span', { class: 'tools tools--start', hidden: st.periode !== 'rentang' }, d1, h('span', { text: 's.d.' }), d2);
    function go() { st.periode = sel.value; st.dari = d1.value; st.sampai = d2.value; range.hidden = st.periode !== 'rentang'; if (st.periode === 'rentang' && (!st.dari || !st.sampai)) return; load(); }
    sel.addEventListener('change', go); d1.addEventListener('change', go); d2.addEventListener('change', go);
    P.body.appendChild(h('div', { class: 'tools tools--start' }, sel, range, btn('Muat ulang', function () { load(); }, { ghost: true, sm: true })));
    P.body.appendChild(body);
    function load() {
      api('GET', '/keuangan/dashboard' + qs({ periode: st.periode, dari: st.dari, sampai: st.sampai })).then(function (d) {
        body.innerHTML = ''; var t = d.tagihan;
        var S = function (l, v, n, c) { var x = X.stat(l, v, n); x.classList.add('stat--rp'); if (c) x.classList.add(c); return x; };
        body.appendChild(h('p', { class: 'muted', text: 'Periode: ' + fmtDate(d.periode.dari) + ' – ' + fmtDate(d.periode.sampai) + '. Angka tagihan dihitung dari tagihan yang dibuat pada periode ini; pembayaran, kas, dan transaksi menurut tanggal transaksi; tunggakan, saldo tabungan, dan saldo kas adalah posisi terkini.' }));
        body.appendChild(h('h3', { class: 'sec', text: 'Tagihan dan pembayaran santri' }));
        body.appendChild(h('div', { class: 'stats' }, [S('Total tagihan', rp(t.total), t.jumlah + ' tagihan'), S('Pembayaran diterima', rp(d.pembayaran_diterima), 'menurut tanggal bayar'), S('Tagihan belum dibayar', rp(t.belum_nominal), t.belum_jumlah + ' tagihan'),
          S('Dibayar sebagian', t.sebagian_jumlah + ' tagihan', 'sudah dibayar ' + rp(t.sebagian_dibayar) + ', sisa ' + rp(t.sebagian_sisa)), S('Total tunggakan', rp(d.tunggakan.nominal), d.tunggakan.jumlah + ' tagihan belum lunas (seluruh periode)')]));
        body.appendChild(h('h3', { class: 'sec', text: 'Kas operasional pondok' }));
        body.appendChild(h('div', { class: 'stats' }, [S('Pemasukan kas', rp(d.kas.pemasukan), 'pada periode'), S('Pengeluaran kas', rp(d.kas.pengeluaran), 'pada periode'), S('Saldo kas pondok', rp(d.kas.saldo), 'per ' + fmtDate(d.periode.sampai), d.kas.saldo < 0 ? 'stat--warn' : '')]));
        body.appendChild(h('h3', { class: 'sec', text: 'Tabungan dan aktivitas' }));
        body.appendChild(h('div', { class: 'stats' }, [S('Saldo tabungan seluruh santri', rp(d.tabungan_saldo), 'dana milik santri, terpisah dari kas'), S('Transaksi hari ini', d.transaksi.hari_ini, 'pembayaran + tabungan + kas'), S('Transaksi bulan ini', d.transaksi.bulan_ini, 'pembayaran + tabungan + kas')]));
        var g = d.grafik, sr = function (a) { return a.length ? '' : null; };
        body.appendChild(h('div', { class: 'charts' }, [
          chartBox('Pemasukan dan pengeluaran kas', barChart(g.kas, ['masuk', 'keluar'], ['ch-in', 'ch-out'], 'Pemasukan dan pengeluaran kas'), legend([['ch-in', 'Pemasukan'], ['ch-out', 'Pengeluaran']])),
          chartBox('Perbandingan tagihan lunas dan belum lunas', statusBars(g.status)),
          chartBox('Perkembangan penerimaan pembayaran santri', lineChart(g.penerimaan, 'ch-line', 'Penerimaan pembayaran')),
          chartBox('Perkembangan saldo kas', lineChart(g.saldo_kas, 'ch-line2', 'Saldo kas'))]));
        if (!t.jumlah && !d.kas.pemasukan && !d.kas.pengeluaran && !d.pembayaran_diterima) body.appendChild(h('p', { class: 'muted', text: 'Belum ada transaksi pada periode ini. Semua angka di atas berasal dari database dan akan terisi setelah tagihan atau transaksi dicatat.' }));
      }).catch(function (e) { body.innerHTML = ''; body.appendChild(X.errNote(e)); });
    }
    load(); clearInterval(window.__keuTimer); window.__keuTimer = setInterval(function () { if (!document.body.contains(body)) { clearInterval(window.__keuTimer); return; } load(); }, 60000);
    return Promise.resolve(P.el);
  }

  // ---------- pemilih santri (cari NIS / nama) ----------
  function santriPicker(o) {
    o = o || {}; var inp = h('input', { type: 'search', placeholder: 'Cari NIS atau nama santri…', maxlength: '60', 'aria-label': 'Cari santri' }), list = h('ul', { class: 'pick', role: 'listbox' }), chosen = null, timer, onPick = o.onPick;
    var shown = h('div', { class: 'picked', hidden: true });
    function search() { api('GET', '/keuangan/santri' + qs({ q: inp.value.trim(), aktif: o.aktif ? 1 : '' })).then(function (d) { list.innerHTML = ''; if (!d.rows.length) list.appendChild(h('li', { class: 'muted', text: 'Santri tidak ditemukan.' })); d.rows.forEach(function (s) { list.appendChild(h('li', { role: 'option', tabindex: '0', onclick: function () { pick(s); }, onkeydown: function (e) { if (e.key === 'Enter') pick(s); } }, h('b', { text: s.nama }), h('span', { text: [s.nis || 'NIS belum diisi', s.kelompok === 'putra' ? 'Putra' : 'Putri', s.status === 'alumni' ? 'Alumni' : (s.kamar || '')].filter(Boolean).join(' · ') }))); }); }).catch(fail); }
    function pick(s) { chosen = s; list.innerHTML = ''; inp.value = ''; shown.hidden = false; shown.innerHTML = ''; shown.appendChild(h('span', null, h('b', { text: s.nama }), ' ' + (s.nis || 'NIS belum diisi'))); shown.appendChild(btn('Ganti', function () { chosen = null; shown.hidden = true; inp.hidden = false; inp.focus(); if (o.onClear) o.onClear(); }, { ghost: true, sm: true })); inp.hidden = true; if (onPick) onPick(s); }
    inp.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(search, 250); }); inp.addEventListener('focus', function () { if (!list.children.length) search(); });
    return { el: h('div', { class: 'picker' }, inp, shown, list), get: function () { return chosen; }, pick: pick, focus: function () { inp.focus(); } };
  }

  // ---------- kuitansi / bukti ----------
  function showBukti(kind, id, title) {
    api('GET', '/keuangan/' + kind + '/' + id).then(function (d) {
      var paper = h('article', { class: 'receipt' + (d.batal ? ' is-void' : '') }, h('header', null, h('b', { text: d.pondok }), h('span', { text: d.judul })),
        h('dl', { class: 'receipt__dl' }, d.baris.reduce(function (a, r) { a.push(h('dt', { text: r[0] }), h('dd', { class: r[2] ? 'strong' : '', text: r[1] })); return a; }, [])),
        h('footer', null, h('span', { class: 'muted', text: 'Petugas penerima' }), h('b', { text: d.petugas })), d.batal ? h('div', { class: 'receipt__void', text: 'DIBATALKAN' }) : null);
      X.modal(title || d.judul, [paper], function (close) { return [dlLink('Unduh PDF', '/api/sima/keuangan/' + kind + '/' + id + '.pdf'), btn('Cetak', printNode), btn('Tutup', close, { ghost: true })]; }, { wide: true });
    }).catch(fail);
  }

  // ---------- tagihan ----------
  function filtersFor(r) {
    return [{ k: 'kategori_id', label: 'Jenis tagihan', options: opts(r.kategori_tagihan) }, { k: 'periode_tagihan', label: 'Periode', options: [] }, { k: 'kelompok', label: 'Kelompok', options: [{ v: 'putra', l: 'Putra' }, { v: 'putri', l: 'Putri' }] },
      { k: 'status', label: 'Status', options: [{ v: 'belum', l: 'Belum dibayar' }, { v: 'sebagian', l: 'Dibayar sebagian' }, { v: 'lunas', l: 'Lunas' }, { v: 'dibatalkan', l: 'Dibatalkan' }] }];
  }
  function tagihanCols(extra) {
    return [{ t: 'NIS', k: 'nis', sort: 'nis' }, { t: 'Nama santri', f: function (r) { return h('a', { class: 'lnk', href: R + 'tabungan/' + r.santri_id + '?v=ringkasan', text: r.santri }); }, sort: 'santri' }, { t: 'Jenis tagihan', k: 'kategori', sort: 'kategori' }, { t: 'Periode', f: function (r) { return periodeLabel(r.periode); }, sort: 'periode' },
      { t: 'Total tagihan', f: function (r) { return rp(r.nominal); }, sort: 'nominal', cls: 'num' }, { t: 'Dibayar', f: function (r) { return rp(r.dibayar); }, cls: 'num' }, { t: 'Sisa', f: function (r) { return rp(r.sisa); }, sort: 'sisa', cls: 'num' }, { t: 'Status', f: function (r) { return sPill(r.status_bayar); }, sort: 'status' }].concat(extra || []);
  }
  function summaryBar(d, items) { return h('div', { class: 'sumbar' }, items.map(function (i) { return h('div', null, h('small', { text: i[0] }), h('b', { text: i[1] })); })); }
  function viewTagihan() {
    var P = page('tagihan', 'Tagihan Santri', 'Buat tagihan satu atau banyak santri. Nominal selalu diisi sesuai ketentuan resmi pondok.', null), lv;
    return loadRef(true).then(function (r) {
      var ex = [{ t: 'Aksi', f: function (x) { return h('div', { class: 'acts' }, btn('Detail', function () { detailTagihan(x.id, function () { lv.reload(); }); }, { ghost: true, sm: true }), x.status_bayar === 'belum' || x.status_bayar === 'sebagian' ? btn('Bayar', function () { location.hash = R + 'pembayaran?santri=' + x.santri_id; }, { sm: true }) : null); } }];
      lv = X.listView({ endpoint: '/keuangan/tagihan', search: 'Cari nama atau NIS', cols: tagihanCols(ex), defSort: 'dibuat', defDir: 'desc', filters: filtersFor(r), emptyEl: empty('Belum ada tagihan', r.kategori_tagihan.length ? 'Klik “Buat tagihan”. Tidak ada tagihan atau nominal bawaan.' : 'Siapkan kategori tagihan di menu Kategori, lalu buat tagihan.', 'wallet'),
        onLoaded: function (d, setOpt) { if (d.pilihan) setOpt('periode_tagihan', d.pilihan.periode.map(function (p) { return { v: p, l: periodeLabel(p) }; })); sum.innerHTML = ''; sum.appendChild(summaryBar(d, [['Jumlah tagihan', d.ringkasan.n], ['Total tagihan', rp(d.ringkasan.nominal)], ['Total dibayar', rp(d.ringkasan.dibayar)], ['Total sisa', rp(d.ringkasan.sisa)]])); } });
      var sum = h('div'); P.body.appendChild(h('div', { class: 'tools tools--end' }, btn('Buat tagihan', function () { formTagihan(r, function () { lv.reload(); }); }, { icon: 'plus' })));
      P.body.appendChild(sum); P.body.appendChild(lv.el); return P.el;
    });
  }
  function detailTagihan(id, reload) {
    api('GET', '/keuangan/tagihan/' + id).then(function (d) {
      var t = d.tagihan, aktif = t.status_tagihan === 'aktif';
      var acts = aktif ? [btn('Koreksi nominal', function () { koreksiTagihan(t, function () { close(); reload(); }); }, { ghost: true }), btn('Batalkan tagihan', function () {
        X.confirmDialog({ title: 'Batalkan tagihan?', text: 'Tagihan ' + t.kategori + ' ' + periodeLabel(t.periode) + ' untuk ' + t.santri + ' dibatalkan. Tagihan yang sudah memiliki pembayaran harus dibatalkan pembayarannya lebih dulu. Jejak tagihan tetap tersimpan.', reason: 'required', reasonLabel: 'Alasan pembatalan *', danger: true, confirmLabel: 'Ya, batalkan' })
          .then(function (c) { if (c) api('POST', '/keuangan/tagihan/' + id + '/batal', { konfirmasi: true, alasan: c.alasan }).then(function () { toast('Tagihan dibatalkan.'); close(); reload(); }).catch(fail); });
      }, { ghost: true, danger: true })] : [];
      var m = X.modal('Detail tagihan', [X.dl([['Nama santri', t.santri], ['NIS', t.nis], ['Jenis tagihan', t.kategori], ['Nama tagihan', t.nama], ['Periode', periodeLabel(t.periode)], ['Jatuh tempo', fmtDate(t.jatuh_tempo)], ['Total tagihan', rp(t.nominal)], ['Sudah dibayar', rp(t.dibayar)], ['Sisa tagihan', rp(t.sisa)], ['Status', SB[t.status_bayar][0]], ['Keterangan', t.keterangan, true]]),
        h('h3', { text: 'Riwayat pembayaran' }), X.table([{ t: 'Tanggal', f: function (p) { return fmtDate(p.tanggal); } }, { t: 'Kuitansi', k: 'no_kuitansi' }, { t: 'Nominal', f: function (p) { return rp(p.nominal); }, cls: 'num' }, { t: 'Metode', k: 'metode' }, { t: 'Petugas', k: 'oleh_username' }, { t: 'Status', f: function (p) { return p.status === 'sah' ? X.pill('Sah', 'ok') : X.pill('Dibatalkan', 'off'); } }, { t: 'Aksi', f: function (p) { return btn('Kuitansi', function () { showBukti('kuitansi', p.id); }, { ghost: true, sm: true }); } }], d.pembayaran, empty('Belum ada pembayaran', '', 'wallet')),
        h('h3', { text: 'Riwayat perubahan tagihan' }), d.audit.length ? h('ol', { class: 'timeline' }, d.audit.map(function (a) { return h('li', null, h('b', { text: a.aksi + (a.alasan ? ' — ' + a.alasan : '') }), h('time', { text: X.fmtTime(a.waktu) + ' · ' + a.username + (a.sebelum && a.sebelum.nominal !== undefined && a.sesudah ? ' · ' + rp(a.sebelum.nominal) + ' → ' + rp(a.sesudah.nominal) : '') })); })) : h('p', { class: 'muted', text: 'Belum ada perubahan.' })],
        function (c) { return acts.concat([btn('Tutup', c)]); }, { wide: true }), close = m.close;
    }).catch(fail);
  }
  function koreksiTagihan(t, done) {
    var nom = moneyInput('Nominal baru'); nom.set(t.nominal); var jt = textInput('Jatuh tempo (opsional)'); jt.input.type = 'date'; jt.input.value = t.jatuh_tempo ? String(t.jatuh_tempo).slice(0, 10) : ''; var al = textInput('Alasan koreksi *', { area: true, max: 500, full: true }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' });
    X.modal('Koreksi tagihan', [h('p', { class: 'mtext', text: 'Sudah dibayar ' + rp(t.dibayar) + '. Nominal baru tidak boleh lebih kecil dari jumlah yang sudah dibayar. Nilai sebelum dan sesudah tercatat.' }), note, nom.el, jt.el, al.el], function (close) { return [btn('Batal', close, { ghost: true }), btn('Simpan koreksi', function (ev) { ev.target.disabled = true; api('POST', '/keuangan/tagihan/' + t.id + '/koreksi', { konfirmasi: true, nominal: nom.value(), jatuh_tempo: jt.input.value || null, alasan: al.value() }).then(function () { close(); toast('Koreksi tersimpan.'); done(); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message; }); })]; }, { sticky: true });
  }
  function formTagihan(r, done) {
    var kat = selectEl(opts(r.kategori_tagihan), '— Pilih jenis tagihan —'), nama = textInput('Nama tagihan (opsional)', { max: 120, help: 'Kosong = jenis + periode.' }), nom = moneyInput('Nominal per santri', { help: 'Isi sesuai ketentuan resmi pondok.' });
    var ptipe = h('select', null, h('option', { value: 'bulan', text: 'Bulanan' }), h('option', { value: 'lain', text: 'Periode lain (semester, tahun ajaran, dll.)' })), bln = h('input', { type: 'month', value: X.today().slice(0, 7) }), lain = h('input', { type: 'text', maxlength: '60', placeholder: 'mis. Semester Ganjil 2026', hidden: true });
    ptipe.addEventListener('change', function () { bln.hidden = ptipe.value !== 'bulan'; lain.hidden = ptipe.value === 'bulan'; });
    var jt = h('input', { type: 'date' }), ket = textInput('Keterangan', { area: true, max: 500, full: true });
    var tipe = h('select', null, [['pilih', 'Pilih santri tertentu'], ['kelompok', 'Berdasarkan kelompok / angkatan / asrama / kamar'], ['semua', 'Semua santri aktif']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var chosen = {}, chips = h('div', { class: 'chips' }), pick = santriPicker({ aktif: true, onPick: function (s) { chosen[s.id] = s; draw(); pick.el.querySelector('.picked').hidden = true; pick.el.querySelector('input').hidden = false; } });
    function draw() { chips.innerHTML = ''; Object.keys(chosen).forEach(function (id) { chips.appendChild(h('span', { class: 'chip chip--on' }, chosen[id].nama, h('button', { type: 'button', 'aria-label': 'Hapus ' + chosen[id].nama, onclick: function () { delete chosen[id]; draw(); }, text: '✕' }))); }); }
    var kel = selectEl([{ v: 'putra', l: 'Putra' }, { v: 'putri', l: 'Putri' }], 'Kelompok: semua'), thn = selectEl(r.tahun_masuk.map(function (y) { return { v: y, l: String(y) }; }), 'Angkatan (tahun masuk): semua'), asr = selectEl(r.asrama.map(function (a) { return { v: a.id, l: a.nama }; }), 'Asrama: semua'), kmr = selectEl(r.kamar.map(function (a) { return { v: a.id, l: a.nama }; }), 'Kamar: semua');
    var pilBox = h('div', { class: 'stack-s' }, field('Cari dan tambahkan santri', pick.el), chips), filBox = h('div', { class: 'fs__grid', hidden: true }, field('Kelompok', kel), field('Angkatan', thn), field('Asrama', asr), field('Kamar', kmr));
    tipe.addEventListener('change', function () { pilBox.hidden = tipe.value !== 'pilih'; filBox.hidden = tipe.value !== 'kelompok'; });
    var note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' }), prev = h('div', { class: 'stack-s' });
    function body() {
      var t = tipe.value === 'pilih' ? { ids: Object.keys(chosen).map(Number) } : tipe.value === 'semua' ? { semua: true } : { kelompok: kel.value, tahun_masuk: thn.value, asrama_id: asr.value, kamar_id: kmr.value };
      return { kategori_id: kat.value, nama: nama.value(), nominal: nom.value(), periode_tipe: ptipe.value, periode: ptipe.value === 'bulan' ? bln.value : lain.value.trim(), jatuh_tempo: jt.value || null, keterangan: ket.value(), target: t };
    }
    var saveBtn;
    function preview(ev) {
      note.hidden = true; prev.innerHTML = ''; ev.target.disabled = true;
      api('POST', '/keuangan/tagihan/pratinjau', body()).then(function (d) {
        ev.target.disabled = false; prev.appendChild(h('div', { class: 'note' + (d.jumlah ? '' : ' note--warn') }, h('b', { text: 'Ringkasan sebelum disimpan: ' }), d.jumlah + ' santri akan ditagih ' + d.kategori + ' ' + periodeLabel(d.periode) + ' @ ' + rp(d.nominal) + ' — total ' + rp(d.total) + '.' + (d.dilewati ? ' ' + d.dilewati + ' santri dilewati karena sudah memiliki tagihan yang sama.' : '')));
        if (d.santri.length) prev.appendChild(h('div', { class: 'scroll' }, X.table([{ t: 'NIS', k: 'nis' }, { t: 'Nama', k: 'nama' }, { t: 'Kelompok', f: function (s) { return s.kelompok === 'putra' ? 'Putra' : 'Putri'; } }, { t: 'Asrama / kamar', f: function (s) { return s.asrama ? s.asrama + ' / ' + s.kamar : null; } }], d.santri, null)));
        if (d.santri_terpotong) prev.appendChild(h('p', { class: 'muted', text: 'Daftar dipersingkat 200 baris pertama; seluruh santri tetap diproses.' }));
        if (d.dilewati_contoh.length) prev.appendChild(h('p', { class: 'muted', text: 'Dilewati (sudah ada): ' + d.dilewati_contoh.map(function (s) { return s.nama; }).join(', ') + (d.dilewati > d.dilewati_contoh.length ? ', …' : '') }));
        saveBtn.disabled = !d.jumlah; saveBtn.textContent = 'Simpan ' + d.jumlah + ' tagihan';
      }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message + Object.keys(e.fields || {}).map(function (k) { return ' • ' + e.fields[k]; }).join(''); });
    }
    X.modal('Buat tagihan', [note, h('div', { class: 'fs__grid' }, field('Jenis tagihan *', kat), field('Periode *', h('div', { class: 'stack-s' }, ptipe, bln, lain)), nom.el, field('Jatuh tempo (opsional)', jt), nama.el, ket.el), h('h3', { text: 'Penerima tagihan' }), field('Sasaran', tipe), pilBox, filBox, prev], function (close) {
      saveBtn = btn('Simpan tagihan', function (ev) {
        X.confirmDialog({ title: 'Simpan tagihan?', text: 'Tagihan akan dibuat sesuai pratinjau. Tagihan ganda (santri + jenis + periode sama) otomatis dilewati.', confirmLabel: 'Ya, simpan' }).then(function (c) {
          if (!c) return; ev.target.disabled = true; var b = body(); b.konfirmasi = true;
          api('POST', '/keuangan/tagihan', b).then(function (d) { close(); toast(d.dibuat + ' tagihan dibuat' + (d.dilewati ? ', ' + d.dilewati + ' dilewati.' : '.')); done(); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message; });
        });
      }); saveBtn.disabled = true;
      return [btn('Batal', close, { ghost: true }), btn('Pratinjau', preview, { ghost: true }), saveBtn];
    }, { wide: true, sticky: true });
    [kat, nama.input, nom.input, ptipe, bln, lain, jt, tipe, kel, thn, asr, kmr].forEach(function (e) { e.addEventListener('change', function () { saveBtn.disabled = true; saveBtn.textContent = 'Simpan tagihan'; }); e.addEventListener('input', function () { saveBtn.disabled = true; saveBtn.textContent = 'Simpan tagihan'; }); });
  }

  // ---------- pembayaran ----------
  function viewPembayaran(q) {
    var P = page('pembayaran', 'Pembayaran Santri', 'Catat pembayaran (penuh atau sebagian) dan cetak kuitansi.'), tab = q.v === 'riwayat' ? 'riwayat' : 'catat';
    P.body.appendChild(h('div', { class: 'tabs' }, [['catat', 'Catat pembayaran'], ['riwayat', 'Riwayat pembayaran']].map(function (t) { return h('a', { class: 'tab' + (t[0] === tab ? ' is-on' : ''), href: R + 'pembayaran?v=' + t[0], text: t[1] }); })));
    return loadRef(true).then(function (r) { P.body.appendChild(tab === 'riwayat' ? riwayatBayar(r) : catatBayar(r, q)); return P.el; });
  }
  var sticky = { tanggal: null, metode: '' };
  function catatBayar(r, q) {
    var box = h('div', { class: 'stack-s' }), list = h('div', { class: 'stack-s' }), pk, state = { santri: null, rows: [] };
    var tgl = dateInput('Tanggal pembayaran', sticky.tanggal), met = selectEl(opts(r.metode), '— Pilih metode —'); met.value = sticky.metode || ''; var ket = textInput('Keterangan (opsional)', { max: 300 });
    function total() { var n = 0; state.rows.forEach(function (x) { if (x.cb.checked) n += Number(x.nom.value()) || 0; }); return n; }
    var tot = h('b', { text: rp(0) }), saveB = btn('Simpan pembayaran', save), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' }), idem = token();
    function upd() { tot.textContent = rp(total()); }
    function loadSantri(s) {
      state.santri = s; list.innerHTML = ''; list.appendChild(h('p', { class: 'muted', text: 'Memuat tagihan…' }));
      api('GET', '/keuangan/santri/' + s.id + '/ringkasan').then(function (d) {
        list.innerHTML = ''; var open = d.tagihan.filter(function (t) { return t.status_bayar === 'belum' || t.status_bayar === 'sebagian'; }); state.rows = [];
        list.appendChild(h('div', { class: 'phead' }, X.avatar(null, d.santri.nama, 'l'), h('div', null, h('b', { text: d.santri.nama }), h('div', { class: 'muted', text: [d.santri.nis || 'NIS belum diisi', d.santri.kelompok === 'putra' ? 'Putra' : 'Putri', d.santri.status === 'alumni' ? 'Alumni' : (d.santri.asrama ? d.santri.asrama + ' / ' + d.santri.kamar : '')].filter(Boolean).join(' · ') }))));
        if (!open.length) { list.appendChild(empty('Tidak ada tagihan yang belum lunas', 'Semua tagihan santri ini sudah lunas atau belum dibuat.', 'wallet')); saveB.disabled = true; return; }
        saveB.disabled = false;
        var rows = open.map(function (t) {
          var cb = h('input', { type: 'checkbox', 'aria-label': 'Bayar ' + t.kategori, checked: open.length === 1 }), nom = moneyInput('Nominal dibayar', { onChange: function () { cb.checked = true; upd(); } }); nom.set(t.sisa); nom.el.querySelector('label').className = 'sr';
          cb.addEventListener('change', upd); state.rows.push({ t: t, cb: cb, nom: nom });
          return h('div', { class: 'payrow' }, h('label', { class: 'check' }, cb, h('span', null, h('b', { text: t.kategori + ' — ' + periodeLabel(t.periode) }), h('small', { text: 'Total ' + rp(t.nominal) + ' · dibayar ' + rp(t.dibayar) + ' · sisa ' + rp(t.sisa) }))), nom.el);
        });
        list.appendChild(h('div', { class: 'stack-s' }, rows));
        list.appendChild(h('div', { class: 'fs__grid' }, tgl.el, field('Metode pembayaran *', met), ket.el));
        list.appendChild(h('div', { class: 'paybar' }, h('span', null, 'Total dibayar sekarang: ', tot), saveB)); list.appendChild(note); upd();
      }).catch(fail);
    }
    function save(ev) {
      note.hidden = true; var items = state.rows.filter(function (x) { return x.cb.checked && Number(x.nom.value()) > 0; }).map(function (x) { return { tagihan_id: x.t.id, nominal: x.nom.value() }; });
      if (!items.length) { note.hidden = false; note.textContent = 'Pilih tagihan dan isi nominal pembayaran.'; return; } if (!met.value) { note.hidden = false; note.textContent = 'Pilih metode pembayaran.'; return; }
      X.confirmDialog({ title: 'Simpan pembayaran?', text: 'Mencatat ' + items.length + ' pembayaran sebesar total ' + rp(total()) + ' untuk ' + state.santri.nama + '. Pembayaran yang sudah tersimpan tidak dapat diubah, hanya dibatalkan dengan alasan.', confirmLabel: 'Ya, simpan' }).then(function (c) {
        if (!c) return; ev.target.disabled = true; sticky.tanggal = tgl.value(); sticky.metode = met.value;
        api('POST', '/keuangan/pembayaran/batch', { konfirmasi: true, idem: idem, santri_id: state.santri.id, tanggal: tgl.value(), metode_id: met.value, keterangan: ket.value(), items: items }).then(function (d) {
          toast(d.hasil.length + ' pembayaran dicatat.'); idem = token(); list.innerHTML = ''; pk.focus();
          var nodes = d.hasil.map(function (x) { return h('li', null, h('b', { text: x.no_kuitansi }), ' — sisa ' + rp(x.sisa_setelah) + ' ', btn('Lihat / cetak kuitansi', function () { showBukti('kuitansi', x.id); }, { ghost: true, sm: true })); });
          list.appendChild(h('div', { class: 'note' }, h('b', { text: 'Pembayaran tersimpan. ' }), 'Cari santri berikutnya di atas.', h('ul', { class: 'plain' }, nodes))); if (d.hasil.length === 1) showBukti('kuitansi', d.hasil[0].id);
        }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message; });
      });
    }
    pk = santriPicker({ onPick: loadSantri, onClear: function () { list.innerHTML = ''; } }); box.appendChild(h('div', { class: 'picker-wrap' }, field('Cari santri (NIS atau nama)', pk.el))); box.appendChild(list);
    if (q.santri) api('GET', '/keuangan/santri/' + q.santri + '/ringkasan').then(function (d) { pk.pick(d.santri); }).catch(function () { });
    return box;
  }
  function riwayatBayar(r) {
    var lv; var cols = [{ t: 'Tanggal', f: function (p) { return fmtDate(p.tanggal); } }, { t: 'No. kuitansi', k: 'no_kuitansi' }, { t: 'NIS', k: 'nis' }, { t: 'Nama santri', k: 'santri' }, { t: 'Jenis', k: 'kategori' }, { t: 'Periode', f: function (p) { return periodeLabel(p.periode); } }, { t: 'Nominal', f: function (p) { return rp(p.nominal); }, cls: 'num' }, { t: 'Metode', k: 'metode' }, { t: 'Petugas', k: 'petugas' }, { t: 'Status', f: function (p) { return p.status === 'sah' ? X.pill('Sah', 'ok') : X.pill('Dibatalkan', 'off'); } },
      { t: 'Aksi', f: function (p) { return h('div', { class: 'acts' }, btn('Kuitansi', function () { showBukti('kuitansi', p.id); }, { ghost: true, sm: true }), p.status === 'sah' ? btn('Batalkan', function () { X.confirmDialog({ title: 'Batalkan pembayaran ' + p.no_kuitansi + '?', text: 'Pembayaran ' + rp(p.nominal) + ' atas nama ' + p.santri + ' akan dibatalkan dan sisa tagihan dihitung ulang. Kuitansi tetap tersimpan dengan tanda DIBATALKAN.', reason: 'required', reasonLabel: 'Alasan pembatalan *', danger: true, confirmLabel: 'Ya, batalkan' }).then(function (c) { if (c) api('POST', '/keuangan/pembayaran/' + p.id + '/batal', { konfirmasi: true, alasan: c.alasan }).then(function () { toast('Pembayaran dibatalkan.'); lv.reload(); }).catch(fail); }); }, { ghost: true, sm: true, danger: true }) : null); } }];
    var dari = h('input', { type: 'date', 'aria-label': 'Dari tanggal' }), sampai = h('input', { type: 'date', 'aria-label': 'Sampai tanggal' });
    lv = X.listView({ endpoint: '/keuangan/pembayaran', search: 'Cari nama, NIS, atau no. kuitansi', cols: cols, filters: [{ k: 'kategori_id', label: 'Jenis tagihan', options: opts(r.kategori_tagihan) }, { k: 'metode_id', label: 'Metode', options: opts(r.metode) }, { k: 'status', label: 'Status', options: [{ v: 'sah', l: 'Sah' }, { v: 'dibatalkan', l: 'Dibatalkan' }] }], emptyEl: empty('Belum ada pembayaran', 'Pembayaran yang dicatat akan tampil di sini.', 'wallet') });
    function range() { lv.state.f.dari = dari.value; lv.state.f.sampai = sampai.value; lv.state.f.periode = dari.value && sampai.value ? 'rentang' : 'semua'; lv.state.page = 1; lv.reload(); }
    dari.addEventListener('change', range); sampai.addEventListener('change', range);
    return h('div', { class: 'stack-s' }, h('div', { class: 'tools tools--start' }, h('span', { class: 'muted', text: 'Tanggal:' }), dari, h('span', { text: 's.d.' }), sampai), lv.el);
  }

  // ---------- tunggakan ----------
  function viewTunggakan() {
    var P = page('tunggakan', 'Tunggakan dan Rekap Pembayaran', 'Pantau tagihan yang belum lunas. Putra/Putri hanya filter, bukan modul terpisah.'), lv, sum = h('div');
    return loadRef(true).then(function (r) {
      var f = filtersFor(r).filter(function (x) { return x.k !== 'status'; }); f.push({ k: 'status', label: 'Status', options: [{ v: 'belum', l: 'Belum dibayar' }, { v: 'sebagian', l: 'Dibayar sebagian' }] }, { k: 'asrama_id', label: 'Asrama', options: r.asrama.map(function (a) { return { v: a.id, l: a.nama }; }) }, { k: 'kamar_id', label: 'Kamar', options: r.kamar.map(function (a) { return { v: a.id, l: a.nama }; }) });
      lv = X.listView({ endpoint: '/keuangan/tunggakan', search: 'Cari nama atau NIS', cols: tagihanCols([{ t: 'Aksi', f: function (x) { return btn('Bayar', function () { location.hash = R + 'pembayaran?santri=' + x.santri_id; }, { sm: true }); } }]), defSort: 'sisa', defDir: 'desc', filters: f, emptyEl: empty('Tidak ada tunggakan', 'Semua tagihan lunas, atau belum ada tagihan.', 'wallet'),
        onLoaded: function (d, setOpt) { setOpt('periode_tagihan', (d.pilihan && d.pilihan.periode || []).map(function (p) { return { v: p, l: periodeLabel(p) }; })); sum.innerHTML = ''; sum.appendChild(summaryBar(d, [['Tagihan belum lunas', d.ringkasan.n], ['Belum dibayar', d.ringkasan.belum], ['Dibayar sebagian', d.ringkasan.sebagian], ['Total tunggakan', rp(d.ringkasan.sisa)]])); } });
      function link(fmt) { var f2 = Object.assign({}, lv.state.f, { q: lv.state.q }); return '/api/sima/keuangan/laporan/tunggakan' + qs(Object.assign({ format: fmt, periode: 'semua', kelompok: f2.kelompok, kategori_id: f2.kategori_id }, {})); }
      P.body.appendChild(h('div', { class: 'tools tools--end' }, btn('Cetak laporan', function () { laporanModal('tunggakan', { periode: 'semua', kelompok: lv.state.f.kelompok, kategori_id: lv.state.f.kategori_id }, true); }, { ghost: true }), h('a', { class: 'btn btn--ghost', href: link('pdf'), download: '', text: 'Unduh PDF' }), h('a', { class: 'btn btn--ghost', href: link('xlsx'), download: '', text: 'Unduh Excel' })));
      P.body.appendChild(sum); P.body.appendChild(lv.el); return P.el;
    });
  }

  // ---------- tabungan ----------
  function viewTabungan(p, q) { return p[0] && /^\d+$/.test(p[0]) ? detailTabungan(+p[0], q) : listTabungan(); }
  function listTabungan() {
    var P = page('tabungan', 'Tabungan Santri', 'Dana milik santri; terpisah dari pembayaran dan kas operasional pondok.'), lv, sum = h('div');
    function trx(s, jenis) { formTabungan(s, jenis, function () { lv.reload(); }); }
    lv = X.listView({ endpoint: '/keuangan/tabungan', search: 'Cari nama atau NIS', defSort: '', cols: [{ t: 'NIS', k: 'nis' }, { t: 'Nama santri', f: function (r) { return h('a', { class: 'lnk', href: R + 'tabungan/' + r.santri_id, text: r.nama }); } }, { t: 'Kelompok', f: function (r) { return r.kelompok === 'putra' ? 'Putra' : 'Putri'; } }, { t: 'Status santri', f: function (r) { return r.status_santri === 'aktif' ? 'Aktif' : 'Alumni'; } }, { t: 'Dibuka', f: function (r) { return fmtDate(r.dibuka); } }, { t: 'Saldo', f: function (r) { return rp(r.saldo); }, cls: 'num' }, { t: 'Rekening', f: function (r) { return X.activePill(r.status === 'aktif'); } },
      { t: 'Aksi', f: function (r) { return h('div', { class: 'acts' }, r.status_santri === 'aktif' && r.status === 'aktif' ? btn('Setor', function () { trx({ id: r.santri_id, nama: r.nama, nis: r.nis, saldo: r.saldo }, 'setoran'); }, { sm: true }) : null, r.status === 'aktif' ? btn('Tarik', function () { trx({ id: r.santri_id, nama: r.nama, nis: r.nis, saldo: r.saldo }, 'penarikan'); }, { sm: true, ghost: true }) : null, btn('Detail', function () { location.hash = R + 'tabungan/' + r.santri_id; }, { sm: true, ghost: true })); } }],
      filters: [{ k: 'kelompok', label: 'Kelompok', options: [{ v: 'putra', l: 'Putra' }, { v: 'putri', l: 'Putri' }] }, { k: 'status_santri', label: 'Status santri', options: [{ v: 'aktif', l: 'Aktif' }, { v: 'alumni', l: 'Alumni' }] }, { k: 'status', label: 'Rekening', options: [{ v: 'aktif', l: 'Aktif' }, { v: 'ditutup', l: 'Ditutup' }] }],
      emptyEl: empty('Belum ada rekening tabungan', 'Rekening dibuka otomatis pada setoran pertama santri aktif. Klik “Setoran baru”.', 'wallet'), onLoaded: function (d) { sum.innerHTML = ''; sum.appendChild(summaryBar(d, [['Jumlah rekening', d.total], ['Total saldo tabungan (filter ini)', rp(d.saldo_total)]])); } });
    P.body.appendChild(h('div', { class: 'tools tools--end' }, btn('Setoran baru', function () { formTabungan(null, 'setoran', function () { lv.reload(); }); }, { icon: 'plus' }))); P.body.appendChild(sum); P.body.appendChild(lv.el); return Promise.resolve(P.el);
  }
  function formTabungan(s, jenis, done) {
    var pk = santriPicker({ aktif: false }), tgl = dateInput('Tanggal transaksi'), nom = moneyInput('Nominal'), met = textInput('Metode (mis. Tunai)', { max: 40 }), ket = textInput(jenis === 'penarikan' ? 'Keterangan penarikan *' : 'Keterangan', { area: true, max: 500, full: true }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' }), idem = token(), info = h('p', { class: 'muted' });
    var chosen = s; if (s) { info.textContent = s.nama + ' (' + (s.nis || 'NIS belum diisi') + ')' + (s.saldo !== undefined ? ' · saldo ' + rp(s.saldo) : ''); }
    X.modal(jenis === 'setoran' ? 'Setoran tabungan' : 'Penarikan tabungan', [note, s ? info : field('Santri *', pk.el), h('div', { class: 'fs__grid' }, tgl.el, nom.el, met.el), ket.el], function (close) {
      return [btn('Batal', close, { ghost: true }), btn(jenis === 'setoran' ? 'Simpan setoran' : 'Simpan penarikan', function (ev) {
        var sid = s ? s.id : (pk.get() && pk.get().id); if (!sid) { note.hidden = false; note.textContent = 'Pilih santri.'; return; }
        X.confirmDialog({ title: jenis === 'setoran' ? 'Simpan setoran?' : 'Simpan penarikan?', text: rp(nom.value() || 0) + ' untuk ' + (s ? s.nama : pk.get().nama) + '. Transaksi tidak dapat diubah; kesalahan diperbaiki dengan pembalikan.', confirmLabel: 'Ya, simpan' }).then(function (c) {
          if (!c) return; ev.target.disabled = true;
          api('POST', '/keuangan/tabungan/' + sid + '/transaksi', { konfirmasi: true, idem: idem, jenis: jenis, tanggal: tgl.value(), nominal: nom.value(), metode: met.value(), keterangan: ket.value() }).then(function (d) { close(); toast('Transaksi dicatat. Saldo baru ' + rp(d.saldo_sesudah)); done(); showBukti('tabungan-bukti', d.id); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message; });
        });
      })];
    }, { sticky: true });
  }
  function detailTabungan(sid, q) {
    var P = page('tabungan', 'Detail Tabungan', null), v = q.v === 'ringkasan' ? 'ringkasan' : 'tabungan', body = h('div', { class: 'stack-s' });
    P.body.appendChild(body); var dari = h('input', { type: 'date', 'aria-label': 'Dari' }), sampai = h('input', { type: 'date', 'aria-label': 'Sampai' }), jenisF = h('select', { 'aria-label': 'Jenis' }, h('option', { value: '', text: 'Semua jenis' }), h('option', { value: 'setoran', text: 'Setoran' }), h('option', { value: 'penarikan', text: 'Penarikan' })), page_ = 1, out = h('div');
    function load() {
      api('GET', '/keuangan/tabungan/' + sid + qs({ dari: dari.value, sampai: sampai.value, jenis: jenisF.value, page: page_, size: 25 })).then(function (d) {
        var r = d.rekening; out.innerHTML = '';
        out.appendChild(h('div', { class: 'phead' }, X.avatar(null, r.nama, 'l'), h('div', null, h('b', { text: r.nama }), h('div', { class: 'muted', text: [r.nis || 'NIS belum diisi', r.kelompok === 'putra' ? 'Putra' : 'Putri', r.status_santri === 'alumni' ? 'Alumni' : 'Santri aktif', 'Rekening dibuka ' + fmtDate(r.dibuka)].join(' · ') }))));
        out.appendChild(h('div', { class: 'stats' }, [X.stat('Saldo saat ini', rp(r.saldo), 'dihitung dari seluruh transaksi'), X.stat('Total setoran', rp(d.ringkasan.setoran), 'pada filter ini'), X.stat('Total penarikan', rp(d.ringkasan.penarikan), 'pada filter ini')].map(function (x) { x.classList.add('stat--rp'); return x; })));
        out.appendChild(h('div', { class: 'tools tools--end' }, r.status === 'aktif' && r.status_santri === 'aktif' ? btn('Setoran', function () { formTabungan({ id: sid, nama: r.nama, nis: r.nis, saldo: r.saldo }, 'setoran', load); }, { icon: 'plus' }) : null, r.status === 'aktif' ? btn('Penarikan', function () { formTabungan({ id: sid, nama: r.nama, nis: r.nis, saldo: r.saldo }, 'penarikan', load); }, { ghost: true }) : null));
        out.appendChild(X.table([{ t: 'Tanggal', f: function (x) { return fmtDate(x.tanggal); } }, { t: 'No. transaksi', k: 'no_transaksi' }, { t: 'Jenis', f: function (x) { return { setoran: 'Setoran', penarikan: 'Penarikan', pembalikan_setoran: 'Pembalikan setoran', pembalikan_penarikan: 'Pembalikan penarikan' }[x.jenis] + (x.dibalik ? ' (dibalik)' : ''); } }, { t: 'Nominal', f: function (x) { return rp(x.nominal); }, cls: 'num' }, { t: 'Saldo sebelum', f: function (x) { return rp(x.saldo_sebelum); }, cls: 'num' }, { t: 'Saldo sesudah', f: function (x) { return rp(x.saldo_sesudah); }, cls: 'num' }, { t: 'Keterangan', f: function (x) { return x.alasan ? (x.keterangan || '') + ' — ' + x.alasan : x.keterangan; } }, { t: 'Petugas', k: 'petugas' },
          { t: 'Bukti', f: function (x) { return h('div', { class: 'acts' }, btn('Bukti', function () { showBukti('tabungan-bukti', x.id); }, { ghost: true, sm: true }), !x.membalik_id && !x.dibalik ? btn('Balik', function () { X.confirmDialog({ title: 'Balik transaksi ' + x.no_transaksi + '?', text: 'Dibuat transaksi lawan senilai ' + rp(x.nominal) + '; transaksi asal tetap tersimpan. Saldo tidak boleh menjadi negatif.', reason: 'required', reasonLabel: 'Alasan pembalikan *', danger: true, confirmLabel: 'Ya, balik' }).then(function (c) { if (c) api('POST', '/keuangan/tabungan/transaksi/' + x.id + '/balik', { konfirmasi: true, alasan: c.alasan }).then(function () { toast('Transaksi dibalik.'); load(); }).catch(fail); }); }, { ghost: true, sm: true, danger: true }) : null); } }], d.rows, empty('Belum ada transaksi', 'Riwayat tabungan akan tampil di sini.', 'wallet')));
        if (d.total > d.size) out.appendChild(X.pager(d.total, d.page, d.size, function (p) { page_ = p; load(); }, function () { }));
      }).catch(function (e) { out.innerHTML = ''; out.appendChild(e.status === 404 ? empty('Belum ada rekening tabungan', 'Santri ini belum memiliki rekening. Rekening dibuka otomatis pada setoran pertama.', 'wallet', btn('Setoran pertama', function () { api('GET', '/keuangan/santri/' + sid + '/ringkasan').then(function (x) { formTabungan({ id: sid, nama: x.santri.nama, nis: x.santri.nis }, 'setoran', load); }); })) : X.errNote(e)); });
    }
    [dari, sampai, jenisF].forEach(function (e) { e.addEventListener('change', function () { page_ = 1; load(); }); });
    if (v === 'ringkasan') { body.appendChild(h('div', { class: 'tools tools--start' }, X.link('← Daftar tabungan', R + 'tabungan'))); body.appendChild(ringkasanSantri(sid)); }
    body.appendChild(h('div', { class: 'tools tools--start' }, X.link('← Daftar tabungan', R + 'tabungan'), h('span', { class: 'muted', text: 'Filter:' }), dari, h('span', { text: 's.d.' }), sampai, jenisF)); body.appendChild(out); load();
    return Promise.resolve(P.el);
  }
  function ringkasanSantri(sid) {
    var box = h('section', { class: 'stack-s' }); api('GET', '/keuangan/santri/' + sid + '/ringkasan').then(function (d) {
      box.appendChild(h('h3', { text: 'Tagihan dan riwayat pembayaran — ' + d.santri.nama }));
      box.appendChild(X.table(tagihanCols(), d.tagihan, empty('Belum ada tagihan', '', 'wallet'))); box.appendChild(h('h3', { text: 'Riwayat pembayaran' }));
      box.appendChild(X.table([{ t: 'Tanggal', f: function (p) { return fmtDate(p.tanggal); } }, { t: 'Kuitansi', k: 'no_kuitansi' }, { t: 'Jenis', k: 'kategori' }, { t: 'Periode', f: function (p) { return periodeLabel(p.periode); } }, { t: 'Nominal', f: function (p) { return rp(p.nominal); }, cls: 'num' }, { t: 'Status', f: function (p) { return p.status === 'sah' ? X.pill('Sah', 'ok') : X.pill('Dibatalkan', 'off'); } }, { t: 'Petugas', k: 'petugas' }, { t: 'Aksi', f: function (p) { return btn('Kuitansi', function () { showBukti('kuitansi', p.id); }, { ghost: true, sm: true }); } }], d.pembayaran, empty('Belum ada pembayaran', '', 'wallet'))); box.appendChild(h('h3', { text: 'Tabungan' }));
    }).catch(function (e) { box.appendChild(X.errNote(e)); }); return box;
  }

  // ---------- kas ----------
  function viewKas() {
    var P = page('kas', 'Kas Pondok', 'Buku kas operasional. Pembayaran santri dan tabungan tidak otomatis masuk ke sini.'), st = { periode: 'bulan', dari: '', sampai: '', kategori_id: '', jenis: '', page: 1 }, out = h('div', { class: 'stack-s' });
    return loadRef(true).then(function (r) {
      var sel = h('select', { 'aria-label': 'Periode' }, PERIODE.map(function (p) { return h('option', { value: p[0], text: p[1] }); })), d1 = h('input', { type: 'date', 'aria-label': 'Dari' }), d2 = h('input', { type: 'date', 'aria-label': 'Sampai' }), rg = h('span', { class: 'tools tools--start', hidden: true }, d1, h('span', { text: 's.d.' }), d2);
      var jn = h('select', { 'aria-label': 'Jenis' }, h('option', { value: '', text: 'Pemasukan & pengeluaran' }), h('option', { value: 'masuk', text: 'Pemasukan' }), h('option', { value: 'keluar', text: 'Pengeluaran' })), kt = selectEl(r.kategori_kas.map(function (k) { return { v: k.id, l: (k.jenis === 'masuk' ? '[Masuk] ' : '[Keluar] ') + k.nama }; }), 'Semua kategori');
      function sync() { st.periode = sel.value; st.dari = d1.value; st.sampai = d2.value; st.jenis = jn.value; st.kategori_id = kt.value; st.page = 1; rg.hidden = st.periode !== 'rentang'; if (st.periode === 'rentang' && (!st.dari || !st.sampai)) return; load(); }
      [sel, d1, d2, jn, kt].forEach(function (e) { e.addEventListener('change', sync); }); sel.value = 'bulan';
      function exp(fmt) { return '/api/sima/keuangan/laporan/saldo-kas' + qs({ format: fmt, periode: st.periode, dari: st.dari, sampai: st.sampai, kategori_id: st.kategori_id, jenis: st.jenis }); }
      var acts = h('div', { class: 'tools tools--end' }, btn('Pemasukan', function () { formKas('masuk', r, load); }, { icon: 'plus' }), btn('Pengeluaran', function () { formKas('keluar', r, load); }, { ghost: true }), btn('Saldo awal', function () { saldoAwal(load); }, { ghost: true }), btn('Cetak', function () { laporanModal('saldo-kas', { periode: st.periode, dari: st.dari, sampai: st.sampai, kategori_id: st.kategori_id, jenis: st.jenis }, true); }, { ghost: true }), h('a', { class: 'btn btn--ghost', href: exp('pdf'), download: '', text: 'PDF' }), h('a', { class: 'btn btn--ghost', href: exp('xlsx'), download: '', text: 'Excel' }));
      // tautan unduh mengikuti filter terkini
      acts.addEventListener('mouseover', function (e) { var a = e.target.closest && e.target.closest('a[download]'); if (a) a.href = exp(a.textContent === 'PDF' ? 'pdf' : 'xlsx'); }); acts.addEventListener('focusin', function (e) { var a = e.target.closest && e.target.closest('a[download]'); if (a) a.href = exp(a.textContent === 'PDF' ? 'pdf' : 'xlsx'); });
      P.body.appendChild(h('div', { class: 'tools tools--start' }, sel, rg, jn, kt)); P.body.appendChild(acts); P.body.appendChild(out);
      function load() {
        api('GET', '/keuangan/kas' + qs({ periode: st.periode, dari: st.dari, sampai: st.sampai, kategori_id: st.kategori_id, jenis: st.jenis, page: st.page, size: 25 })).then(function (d) {
          out.innerHTML = ''; out.appendChild(summaryBar(d, [['Saldo awal periode', rp(d.saldo_awal)], ['Total pemasukan', rp(d.pemasukan)], ['Total pengeluaran', rp(d.pengeluaran)], ['Saldo akhir', rp(d.saldo_akhir)]]));
          if (!d.ada_saldo_awal) out.appendChild(h('p', { class: 'note note--warn', text: 'Saldo awal kas belum dicatat. Klik “Saldo awal” bila kas pondok sudah memiliki saldo sebelum memakai SIMA (hanya dapat dicatat sekali).' }));
          var no0 = (d.page - 1) * d.size; d.rows.forEach(function (x, i) { x._no = no0 + i + 1; });
          out.appendChild(X.table([{ t: 'No', f: function (x) { return x._no; }, cls: 'c-no' }, { t: 'Tanggal', f: function (x) { return fmtDate(x.tanggal); } }, { t: 'No. transaksi', k: 'no_transaksi' }, { t: 'Keterangan', f: function (x) { return [x.jenis.indexOf('pembalikan') === 0 ? '[Pembalikan] ' : '', x.pihak || '', x.keterangan ? ' — ' + x.keterangan : ''].join(''); } }, { t: 'Kategori', k: 'kategori' }, { t: 'Pemasukan', f: function (x) { return x.masuk ? rp(x.masuk) : ''; }, cls: 'num' }, { t: 'Pengeluaran', f: function (x) { return x.keluar ? rp(x.keluar) : ''; }, cls: 'num' }, { t: 'Saldo', f: function (x) { return rp(x.saldo); }, cls: 'num' },
            { t: 'Aksi', f: function (x) { return h('div', { class: 'acts' }, x.berkas_id ? h('a', { class: 'btn btn--ghost btn--sm', href: '/api/sima/berkas/' + x.berkas_id, target: '_blank', rel: 'noopener', text: 'Bukti' }) : (x.jenis === 'masuk' || x.jenis === 'keluar' ? btn('+ Bukti', function () { buktiKas(x, load); }, { ghost: true, sm: true }) : null), (x.jenis === 'masuk' || x.jenis === 'keluar') && !x.dibalik ? btn('Balik', function () { X.confirmDialog({ title: 'Balik transaksi ' + x.no_transaksi + '?', text: 'Dibuat transaksi lawan senilai ' + rp(x.nominal) + '. Transaksi asal tetap tersimpan.', reason: 'required', reasonLabel: 'Alasan pembalikan *', danger: true, confirmLabel: 'Ya, balik' }).then(function (c) { if (c) api('POST', '/keuangan/kas/' + x.id + '/balik', { konfirmasi: true, alasan: c.alasan }).then(function () { toast('Transaksi dibalik.'); load(); }).catch(fail); }); }, { ghost: true, sm: true, danger: true }) : null); } }], d.rows, empty('Belum ada transaksi kas pada periode ini', 'Catat pemasukan atau pengeluaran kas. Tidak ada transaksi contoh.', 'wallet')));
          if (d.total > d.size) out.appendChild(X.pager(d.total, d.page, d.size, function (p) { st.page = p; load(); }, function () { }));
        }).catch(function (e) { out.innerHTML = ''; out.appendChild(X.errNote(e)); });
      }
      load(); return P.el;
    });
  }
  function formKas(jenis, r, done) {
    var kat = selectEl(r.kategori_kas.filter(function (k) { return k.jenis === jenis && k.aktif; }).map(function (k) { return { v: k.id, l: k.nama }; }), '— Pilih kategori —'), tgl = dateInput('Tanggal'), nom = moneyInput('Nominal'), pihak = textInput(jenis === 'masuk' ? 'Sumber pemasukan *' : 'Tujuan pengeluaran *', { max: 150 }), ket = textInput('Keterangan', { area: true, max: 500, full: true }), ff = X.fileField({ label: 'Bukti transaksi', pdf: true }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' }), idem = token();
    X.modal(jenis === 'masuk' ? 'Catat pemasukan kas' : 'Catat pengeluaran kas', [note, kat.options.length > 1 ? null : h('p', { class: 'note note--warn', text: 'Belum ada kategori ' + (jenis === 'masuk' ? 'pemasukan' : 'pengeluaran') + '. Tambahkan di menu Kategori.' }), h('div', { class: 'fs__grid' }, field('Kategori *', kat), tgl.el, nom.el, pihak.el), ket.el, field(jenis === 'keluar' ? 'Bukti transaksi (foto nota / dokumen)' : 'Bukti transaksi (jika ada)', ff.el, 'JPG, PNG, atau PDF, maks. 2,5 MB.', true)], function (close) {
      return [btn('Batal', close, { ghost: true }), btn('Simpan', function (ev) {
        X.confirmDialog({ title: 'Simpan transaksi kas?', text: (jenis === 'masuk' ? 'Pemasukan ' : 'Pengeluaran ') + rp(nom.value() || 0) + '. Transaksi tidak dapat diubah; kesalahan diperbaiki dengan pembalikan.', confirmLabel: 'Ya, simpan' }).then(function (c) {
          if (!c) return; ev.target.disabled = true;
          api('POST', '/keuangan/kas', { konfirmasi: true, idem: idem, jenis: jenis, kategori_id: kat.value, tanggal: tgl.value(), nominal: nom.value(), pihak: pihak.value(), keterangan: ket.value() }).then(function (d) {
            var f = ff.file(); return f ? api('PUT', '/keuangan/kas/' + d.id + '/bukti', f).then(function () { return d; }, function (e) { toast('Transaksi tersimpan, tetapi bukti gagal diunggah: ' + e.message, true); return d; }) : d;
          }).then(function (d) { close(); toast('Transaksi ' + d.no_transaksi + ' dicatat.'); done(); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message + Object.keys(e.fields || {}).map(function (k) { return ' • ' + e.fields[k]; }).join(''); });
        });
      })];
    }, { sticky: true, wide: true });
  }
  function buktiKas(x, done) {
    var ff = X.fileField({ label: 'Bukti', pdf: true }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' });
    X.modal('Lampirkan bukti ' + x.no_transaksi, [note, h('p', { class: 'muted', text: 'Bukti hanya dapat dilampirkan sekali dan tidak dapat diganti.' }), ff.el], function (close) { return [btn('Batal', close, { ghost: true }), btn('Unggah', function (ev) { var f = ff.file(); if (!f) { note.hidden = false; note.textContent = 'Pilih berkas.'; return; } ev.target.disabled = true; api('PUT', '/keuangan/kas/' + x.id + '/bukti', f).then(function () { close(); toast('Bukti terlampir.'); done(); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = (e.fields && e.fields.berkas) || e.message; }); })]; });
  }
  function saldoAwal(done) {
    var tgl = dateInput('Tanggal saldo awal'), nom = moneyInput('Saldo awal kas', { help: 'Isi sesuai catatan resmi pondok. Hanya dapat dicatat sekali.' }), ket = textInput('Keterangan', { area: true, full: true }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' });
    X.modal('Catat saldo awal kas', [note, nom.el, tgl.el, ket.el], function (close) { return [btn('Batal', close, { ghost: true }), btn('Simpan', function (ev) { X.confirmDialog({ title: 'Simpan saldo awal?', text: 'Saldo awal ' + rp(nom.value() || 0) + ' hanya dapat dicatat sekali.', confirmLabel: 'Ya, simpan' }).then(function (c) { if (!c) return; ev.target.disabled = true; api('POST', '/keuangan/kas/saldo-awal', { konfirmasi: true, tanggal: tgl.value(), nominal: nom.value(), keterangan: ket.value() }).then(function () { close(); toast('Saldo awal tercatat.'); done(); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message; }); }); })]; }, { sticky: true });
  }

  // ---------- laporan ----------
  var LAP_FILTER = { pembayaran: ['kategori', 'metode', 'status'], tagihan: ['kategori', 'kelompok', 'statusTagihan'], tunggakan: ['kategori', 'kelompok'], lunas: ['kategori', 'kelompok'], sebagian: ['kategori', 'kelompok'], tabungan: ['kelompok'], setoran: ['kelompok'], penarikan: ['kelompok'], 'kas-masuk': ['kategoriKasMasuk'], 'kas-keluar': ['kategoriKasKeluar'], 'saldo-kas': ['kategoriKas'], transaksi: ['jenisTransaksi', 'kategoriTeks'] };
  function renderRep(rep) {
    var box = h('div', { class: 'receipt receipt--rep' }, h('header', null, h('b', { text: 'Pondok Pesantren Alhidayah Induk' }), h('span', { text: rep.judul })), h('p', { class: 'muted', text: rep.filter.join(' | ') }));
    var cols = rep.kolom.map(function (c) { return { t: c.t, cls: c.tipe === 'rp' ? 'num' : '', f: function (r) { var v = r[c.k]; return v == null ? '' : c.tipe === 'rp' ? rp(v) : c.tipe === 'tgl' ? fmtDate(v) : String(v); } }; });
    box.appendChild(h('div', { class: 'scroll' }, X.table(cols, rep.rows, empty('Tidak ada data', 'Tidak ada transaksi pada filter ini.', 'list'))));
    box.appendChild(h('dl', { class: 'receipt__dl sum' }, rep.ringkasan.reduce(function (a, s) { a.push(h('dt', { text: s[0] }), h('dd', { class: 'strong', text: s[2] === 'rp' ? rp(s[1]) : String(s[1]) })); return a; }, []))); if (rep.catatan) box.appendChild(h('p', { class: 'muted', text: rep.catatan })); return box;
  }
  function laporanModal(jenis, params, autoPrint) {
    api('GET', '/keuangan/laporan/' + jenis + qs(params)).then(function (rep) {
      X.modal(rep.judul, [renderRep(rep)], function (close) { var b = qs(Object.assign({}, params)); return [h('a', { class: 'btn btn--ghost', href: '/api/sima/keuangan/laporan/' + jenis + b + (b ? '&' : '?') + 'format=pdf', download: '', text: 'Unduh PDF' }), h('a', { class: 'btn btn--ghost', href: '/api/sima/keuangan/laporan/' + jenis + b + (b ? '&' : '?') + 'format=xlsx', download: '', text: 'Unduh Excel' }), btn('Cetak', printNode), btn('Tutup', close, { ghost: true })]; }, { wide: true });
    }).catch(fail);
  }
  function viewLaporan() {
    var P = page('laporan', 'Laporan Keuangan', 'Pilih laporan dan filter. Data berasal dari transaksi database; unduh sebagai PDF atau Excel.');
    return loadRef(true).then(function (r) {
      return api('GET', '/keuangan/laporan').then(function (l) {
        var jenis = selectEl(l.jenis.map(function (j) { return { v: j.id, l: j.judul }; }), 'Pilih laporan'); jenis.value = 'pembayaran';
        var per = h('select', { 'aria-label': 'Periode' }, PERIODE.concat([['semua', 'Seluruh periode']]).map(function (p) { return h('option', { value: p[0], text: p[1], selected: p[0] === 'bulan' }); })), d1 = h('input', { type: 'date', 'aria-label': 'Dari' }), d2 = h('input', { type: 'date', 'aria-label': 'Sampai' }), rg = h('span', { class: 'tools tools--start', hidden: true }, d1, h('span', { text: 's.d.' }), d2);
        var kat = selectEl([], 'Kategori / jenis: semua'), kel = selectEl([{ v: 'putra', l: 'Putra' }, { v: 'putri', l: 'Putri' }], 'Kelompok: semua'), met = selectEl(opts(r.metode), 'Metode: semua'), stt = selectEl([{ v: 'sah', l: 'Sah' }, { v: 'dibatalkan', l: 'Dibatalkan' }], 'Status: semua'), stg = selectEl([{ v: 'belum', l: 'Belum dibayar' }, { v: 'sebagian', l: 'Dibayar sebagian' }, { v: 'lunas', l: 'Lunas' }, { v: 'dibatalkan', l: 'Dibatalkan' }], 'Status tagihan: semua'), jt = selectEl([{ v: 'pembayaran', l: 'Pembayaran santri' }, { v: 'tabungan', l: 'Tabungan santri' }, { v: 'kas', l: 'Kas pondok' }], 'Jenis transaksi: semua'), kt = h('input', { type: 'text', placeholder: 'Kategori mengandung…', maxlength: '60', 'aria-label': 'Kategori' });
        var out = h('div', { class: 'stack-s' }), links = h('div', { class: 'tools tools--end' });
        function params() { var p = { periode: per.value, dari: d1.value, sampai: d2.value }, f = LAP_FILTER[jenis.value] || []; if (f.indexOf('kategori') >= 0 || f.some(function (x) { return /^kategoriKas/.test(x); })) p.kategori_id = kat.value; if (f.indexOf('kelompok') >= 0) p.kelompok = kel.value; if (f.indexOf('metode') >= 0) p.metode_id = met.value; if (f.indexOf('status') >= 0) p.status = stt.value; if (f.indexOf('statusTagihan') >= 0) p.status = stg.value; if (f.indexOf('jenisTransaksi') >= 0) p.jenis_transaksi = jt.value; if (f.indexOf('kategoriTeks') >= 0) p.kategori = kt.value.trim(); return p; }
        function visible() { var f = LAP_FILTER[jenis.value] || []; kat.hidden = !(f.indexOf('kategori') >= 0 || f.some(function (x) { return /^kategoriKas/.test(x); })); kel.hidden = f.indexOf('kelompok') < 0; met.hidden = f.indexOf('metode') < 0; stt.hidden = f.indexOf('status') < 0; stg.hidden = f.indexOf('statusTagihan') < 0; jt.hidden = f.indexOf('jenisTransaksi') < 0; kt.hidden = f.indexOf('kategoriTeks') < 0;
          kat.innerHTML = ''; kat.appendChild(h('option', { value: '', text: 'Kategori: semua' })); var src = f.indexOf('kategoriKasMasuk') >= 0 ? r.kategori_kas.filter(function (k) { return k.jenis === 'masuk'; }) : f.indexOf('kategoriKasKeluar') >= 0 ? r.kategori_kas.filter(function (k) { return k.jenis === 'keluar'; }) : f.indexOf('kategoriKas') >= 0 ? r.kategori_kas : r.kategori_tagihan; src.forEach(function (k) { kat.appendChild(h('option', { value: k.id, text: k.nama })); }); }
        function run() {
          rg.hidden = per.value !== 'rentang'; if (per.value === 'rentang' && (!d1.value || !d2.value)) return; var p = params();
          api('GET', '/keuangan/laporan/' + jenis.value + qs(p)).then(function (rep) { out.innerHTML = ''; out.appendChild(renderRep(rep)); links.innerHTML = ''; var b = qs(p), sep = b ? '&' : '?'; links.appendChild(btn('Cetak', printNode, { ghost: true })); links.appendChild(h('a', { class: 'btn btn--ghost', href: '/api/sima/keuangan/laporan/' + jenis.value + b + sep + 'format=pdf', download: '', text: 'Unduh PDF' })); links.appendChild(h('a', { class: 'btn', href: '/api/sima/keuangan/laporan/' + jenis.value + b + sep + 'format=xlsx', download: '', text: 'Unduh Excel' })); }).catch(function (e) { out.innerHTML = ''; out.appendChild(X.errNote(e)); });
        }
        jenis.addEventListener('change', function () { visible(); run(); }); [per, d1, d2, kat, kel, met, stt, stg, jt].forEach(function (e) { e.addEventListener('change', run); }); kt.addEventListener('change', run);
        P.body.appendChild(h('div', { class: 'tools tools--start' }, jenis, per, rg, kat, kel, met, stt, stg, jt, kt)); P.body.appendChild(links); P.body.appendChild(out); visible(); run(); return P.el;
      });
    });
  }

  // ---------- pengaturan kategori ----------
  function viewPengaturan() {
    var P = page('pengaturan', 'Kategori dan Pengaturan', 'Kategori tagihan, kategori kas, dan metode pembayaran dapat ditambah, diubah, atau dinonaktifkan.'), box = h('div', { class: 'stack-g' });
    P.body.appendChild(box);
    function draw() {
      loadRef(true).then(function (r) {
        box.innerHTML = '';
        function sec(title, path, rows, extraCols, withKet, kasJenis) {
          var cols = [{ t: 'Nama', k: 'nama' }].concat(extraCols || []).concat([{ t: 'Status', f: function (x) { return X.activePill(x.aktif); } }, { t: 'Aksi', f: function (x) { return h('div', { class: 'acts' }, btn('Ubah', function () { form(x); }, { ghost: true, sm: true }), btn(x.aktif ? 'Nonaktifkan' : 'Aktifkan', function () { api('PATCH', '/keuangan/' + path + '/' + x.id, { aktif: !x.aktif }).then(function () { toast('Tersimpan.'); draw(); }).catch(fail); }, { ghost: true, sm: true })); } }]);
          function form(x) {
            var nm = textInput('Nama', { max: 80 }); nm.input.value = x ? x.nama : ''; var jn = kasJenis ? selectEl([{ v: 'masuk', l: 'Pemasukan' }, { v: 'keluar', l: 'Pengeluaran' }], '— Jenis —') : null; if (jn) { jn.value = x ? x.jenis : ''; jn.disabled = !!x; } var kt = withKet ? textInput('Keterangan', { area: true, max: 300, full: true }) : null; if (kt) kt.input.value = x && x.keterangan || ''; var note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' });
            X.modal((x ? 'Ubah ' : 'Tambah ') + title.toLowerCase(), [note, nm.el, jn ? field('Jenis', jn) : null, kt ? kt.el : null], function (close) { return [btn('Batal', close, { ghost: true }), btn('Simpan', function (ev) { ev.target.disabled = true; var b = { nama: nm.value() }; if (jn && !x) b.jenis = jn.value; if (kt) b.keterangan = kt.value(); (x ? api('PATCH', '/keuangan/' + path + '/' + x.id, b) : api('POST', '/keuangan/' + path, b)).then(function () { close(); toast('Tersimpan.'); draw(); }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message; }); })]; });
          }
          var acts = [btn('Tambah', function () { form(null); }, { icon: 'plus' })]; if (path === 'kategori-tagihan') acts.push(btn('Muat kategori awal', function () { X.confirmDialog({ title: 'Muat kategori awal?', text: 'Menambahkan Syahriah, Uang pendidikan, Uang ujian, Uang kegiatan, Biaya administrasi, dan Tagihan lainnya (tanpa nominal). Yang sudah ada dilewati.', confirmLabel: 'Ya, muat' }).then(function (c) { if (c) api('POST', '/keuangan/kategori-tagihan/awal', { konfirmasi: true }).then(function (d) { toast(d.ditambahkan + ' kategori ditambahkan.'); draw(); }).catch(fail); }); }, { ghost: true }));
          box.appendChild(h('section', { class: 'stack-s' }, h('div', { class: 'panel__h' }, h('h3', { text: title }), h('div', { class: 'acts' }, acts)), X.table(cols, rows, empty('Belum ada data', 'Tambahkan ' + title.toLowerCase() + '.', 'list'))));
        }
        sec('Kategori tagihan', 'kategori-tagihan', r.kategori_tagihan, [{ t: 'Keterangan', k: 'keterangan' }], true);
        sec('Kategori kas', 'kategori-kas', r.kategori_kas, [{ t: 'Jenis', f: function (x) { return x.jenis === 'masuk' ? 'Pemasukan' : 'Pengeluaran'; } }], false, true);
        sec('Metode pembayaran', 'metode', r.metode, [], false);
      }).catch(function (e) { box.appendChild(X.errNote(e)); });
    }
    draw(); return Promise.resolve(P.el);
  }

  // ---------- audit (Super Admin) ----------
  function viewAudit() {
    var P = page('audit', 'Audit Transaksi Keuangan', 'Seluruh pembuatan, koreksi, pembatalan, dan pembalikan tercatat: siapa, kapan, alasan, nilai sebelum/sesudah.'), out = h('div'), pg = 1;
    function load() { api('GET', '/keuangan/audit' + qs({ page: pg, size: 25 })).then(function (d) { out.innerHTML = ''; out.appendChild(X.table([{ t: 'Waktu', f: function (a) { return X.fmtTime(a.waktu); } }, { t: 'Pengguna', k: 'username' }, { t: 'Objek', f: function (a) { return a.entitas + ' #' + a.entitas_id; } }, { t: 'Aksi', k: 'aksi' }, { t: 'Alasan', k: 'alasan' }, { t: 'Sebelum', f: function (a) { return a.sebelum ? JSON.stringify(a.sebelum) : null; } }, { t: 'Sesudah', f: function (a) { return a.sesudah ? JSON.stringify(a.sesudah) : null; } }], d.rows, empty('Belum ada catatan audit', '', 'list'))); if (d.total > d.size) out.appendChild(X.pager(d.total, d.page, d.size, function (p) { pg = p; load(); }, function () { })); }).catch(function (e) { out.innerHTML = ''; out.appendChild(X.errNote(e)); }); }
    P.body.appendChild(h('div', { class: 'tools tools--end' }, h('a', { class: 'btn btn--ghost', href: '/api/sima/keuangan/backup', download: '', text: 'Unduh cadangan data keuangan (JSON)' }))); P.body.appendChild(out); load(); return Promise.resolve(P.el);
  }
// ---------- Syahriah (pembayaran bulanan): tabel santri x bulan, klik sel untuk bayar ----------
  var BLN_P = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function viewSyahriah(q) {
    var P = page('syahriah', 'Pembayaran Syahriah', 'Pantau dan catat pembayaran bulanan setiap santri. Klik kotak bulan untuk membayar.'), out = h('div', { class: 'stack-s' });
    var now = new Date().getFullYear(), st = { tahun: now, kategori_id: '', kelompok: '', q: '', page: 1 }, ref = null;
    function St(l, v, n) { var x = X.stat(l, v, n); x.classList.add('stat--rp'); return x; }
    function ok(n) { return Number(n || 0).toLocaleString('id-ID'); }
    function load() {
      out.innerHTML = ''; out.appendChild(h('p', { class: 'muted', text: 'Memuat…' }));
      api('GET', '/keuangan/syahriah' + qs({ tahun: st.tahun, kategori_id: st.kategori_id, kelompok: st.kelompok, q: st.q, page: st.page })).then(function (d) {
        out.innerHTML = ''; if (d.kategori_id) st.kategori_id = String(d.kategori_id);
        if (!d.kategori_id) { out.appendChild(empty('Kategori Syahriah belum ada', 'Buka tab Kategori, klik "Muat kategori awal", lalu buat tagihan Syahriah di tab Tagihan.', 'wallet')); return; }
        var r = d.ringkasan;
        out.appendChild(h('div', { class: 'stats' }, [St('Total tagihan ' + d.tahun, 'Rp' + ok(r.nominal), r.tagihan + ' tagihan bulanan'), St('Sudah dibayar', 'Rp' + ok(r.dibayar), 'menurut tagihan tahun ini'), St('Belum dibayar', 'Rp' + ok(r.sisa), r.belum_lunas + ' tagihan belum lunas')]));
        out.appendChild(h('p', { class: 'muted legend-sy' }, h('span', { class: 'sy sy--lunas', text: '✓' }), ' Lunas  ', h('span', { class: 'sy sy--sebagian', text: '…' }), ' Sebagian  ', h('span', { class: 'sy sy--belum', text: '!' }), ' Belum bayar  ', h('span', { class: 'sy sy--none', text: '–' }), ' Belum ada tagihan'));
        if (!d.rows.length) { out.appendChild(empty('Tidak ada santri', 'Tidak ada santri aktif yang cocok dengan pencarian ini.', 'list')); return; }
        var head = h('tr', null, h('th', { class: 'sy-name', text: 'Santri' }), BLN_P.map(function (b) { return h('th', { class: 'sy-h', text: b }); }));
        var body = d.rows.map(function (s) {
          return h('tr', null, h('td', { class: 'sy-name' }, h('b', { text: s.nama }), h('small', { text: [s.nis || 'NIS belum diisi', s.kelompok === 'putra' ? 'Putra' : 'Putri'].join(' · ') })),
            BLN_P.map(function (b, i) {
              var c = s.bulan[i + 1], cls = c ? c.status : 'none', txt = !c ? '–' : c.status === 'lunas' ? '✓' : c.status === 'sebagian' ? '…' : '!';
              var tip = !c ? 'Belum ada tagihan ' + BLN[i] : BLN[i] + ' ' + d.tahun + ': ' + (c.status === 'lunas' ? 'lunas Rp' + ok(c.nominal) : 'sisa Rp' + ok(c.sisa) + ' dari Rp' + ok(c.nominal));
              return h('td', { class: 'sy-c' }, h('button', { type: 'button', class: 'sy sy--' + cls, title: tip, 'aria-label': s.nama + ', ' + tip, text: txt, onclick: function () { klik(s, i, c, d.tahun); } }));
            }));
        });
        out.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'sy-table' }, h('thead', null, head), h('tbody', null, body))));
        var pages = Math.max(1, Math.ceil(d.total / d.size));
        out.appendChild(h('div', { class: 'tools tools--between' }, h('span', { class: 'muted', text: d.total + ' santri · halaman ' + d.page + ' dari ' + pages }),
          h('div', { class: 'acts' }, btn('Sebelumnya', function () { st.page--; load(); }, { ghost: true, sm: true, disabled: d.page <= 1 }), btn('Berikutnya', function () { st.page++; load(); }, { ghost: true, sm: true, disabled: d.page >= pages }))));
      }).catch(function (e) { out.innerHTML = ''; out.appendChild(X.errNote(e)); });
    }
    function klik(s, i, c, tahun) {
      var judul = BLN[i] + ' ' + tahun;
      if (!c) { X.modal('Belum ada tagihan', [h('p', { class: 'mtext', text: 'Tagihan Syahriah ' + judul + ' untuk ' + s.nama + ' belum dibuat. Buat tagihannya dulu di tab Tagihan (bisa untuk semua santri sekaligus).' })], function (close) { return [btn('Tutup', close, { ghost: true }), h('a', { class: 'btn', href: R + 'tagihan', text: 'Ke tab Tagihan', onclick: close })]; }); return; }
      if (c.status === 'lunas') { toast(s.nama + ' — ' + judul + ' sudah lunas.'); return; }
      loadRef().then(function (r) {
        var nom = moneyInput('Nominal dibayar', {}); nom.set(c.sisa); var tgl = dateInput('Tanggal pembayaran', sticky.tanggal), met = selectEl(opts(r.metode), '— Pilih metode —'); met.value = sticky.metode || ''; var ket = textInput('Keterangan (opsional)', { max: 300 }), note = h('div', { class: 'note note--bad', hidden: true, role: 'alert' }), idem = token();
        X.modal('Bayar Syahriah ' + judul, [h('p', { class: 'mtext' }, h('b', { text: s.nama }), ' — total Rp' + ok(c.nominal) + ', sudah dibayar Rp' + ok(c.dibayar) + ', sisa Rp' + ok(c.sisa) + '.'), h('div', { class: 'fs__grid' }, nom.el, tgl.el, field('Metode pembayaran *', met), ket.el), note], function (close) {
          return [btn('Batal', close, { ghost: true }), btn('Simpan pembayaran', function (ev) {
            note.hidden = true; var n = Number(nom.value());
            if (!n || n <= 0) { note.hidden = false; note.textContent = 'Isi nominal pembayaran.'; return; } if (n > c.sisa) { note.hidden = false; note.textContent = 'Nominal melebihi sisa tagihan (Rp' + ok(c.sisa) + ').'; return; } if (!met.value) { note.hidden = false; note.textContent = 'Pilih metode pembayaran.'; return; }
            X.confirmDialog({ title: 'Simpan pembayaran?', text: 'Mencatat pembayaran Rp' + ok(n) + ' untuk ' + s.nama + ' (' + judul + '). Yang sudah tersimpan tidak dapat diubah, hanya dibatalkan dengan alasan.', confirmLabel: 'Ya, simpan' }).then(function (cf) {
              if (!cf) return; ev.target.disabled = true; sticky.tanggal = tgl.value(); sticky.metode = met.value;
              api('POST', '/keuangan/pembayaran', { konfirmasi: true, idem: idem, tagihan_id: c.id, nominal: String(n), tanggal: tgl.value(), metode_id: met.value, keterangan: ket.value() }).then(function (d) {
                toast('Pembayaran dicatat.'); close(); load(); if (d && d.id) showBukti('kuitansi', d.id);
              }).catch(function (e) { ev.target.disabled = false; note.hidden = false; note.textContent = e.message; });
            });
          })];
        });
      }).catch(fail);
    }
    loadRef().then(function (r) {
      var yr = []; for (var y = now + 1; y >= now - 4; y--) yr.push({ v: y, l: String(y) });
      var ys = selectEl(yr, 'Tahun'); ys.firstChild.hidden = true; ys.value = String(now);
      var ks = selectEl(opts(r.kategori_tagihan), 'Jenis tagihan (Syahriah)'), gs = selectEl([{ v: 'putra', l: 'Putra' }, { v: 'putri', l: 'Putri' }], 'Semua santri'), qi = h('input', { class: 'search', type: 'search', placeholder: 'Cari nama atau NIS', 'aria-label': 'Cari santri' }), t;
      ys.onchange = function () { st.tahun = ys.value; st.page = 1; load(); }; ks.onchange = function () { st.kategori_id = ks.value; st.page = 1; load(); }; gs.onchange = function () { st.kelompok = gs.value; st.page = 1; load(); };
      qi.oninput = function () { clearTimeout(t); t = setTimeout(function () { st.q = qi.value.trim(); st.page = 1; load(); }, 300); };
      P.body.appendChild(h('div', { class: 'tools tools--start' }, ys, ks, gs, qi)); P.body.appendChild(out); load();
    }).catch(function (e) { P.body.appendChild(X.errNote(e)); });
    return Promise.resolve(P.el);
  }
   
  var VIEWS = { dashboard: viewDashboard, syahriah: viewSyahriah, tagihan: viewTagihan, pembayaran: viewPembayaran, tunggakan: viewTunggakan, tabungan: viewTabungan, kas: viewKas, laporan: viewLaporan, pengaturan: viewPengaturan, audit: viewAudit };
  X.views.bendahara = function (p, q) { var k = p[0] || 'dashboard'; if (!VIEWS[k]) k = 'dashboard'; if (k === 'audit' && X.S.user.role !== 'super_admin') return Promise.resolve(X.denied()); if (k === 'tabungan') return viewTabungan(p.slice(1), q); return VIEWS[k](q || {}); };
  X.views.keuanganDashboard = function () { return viewDashboard({}); };
})();
