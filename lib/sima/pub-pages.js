'use strict';
// Halaman publik /berita dan /berita/:slug dirender di server (SEO, Open Graph, tanpa JavaScript untuk membaca). Gaya: public/konten.css (palet & tipografi sama dengan website).
const { esc, renderIsi, embedHtml, plain } = require('./konten-lib');
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'], HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const wib = ms => new Date(+ms + 7 * 3600e3);
const tgl = ms => { if (ms == null) return ''; const d = wib(ms); return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const tglStr = s => { if (!s) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? `${+m[3]} ${BULAN[+m[2] - 1]} ${m[1]}` : ''; };
const iso = ms => new Date(+ms).toISOString();
const NAMA = 'Pondok Pesantren Alhidayah Induk';
const MARK = '<img src="/logo.png" alt="" width="44" height="44" decoding="async">';

function layout({ title, desc, canonical, base, image, type = 'website', jsonld, body, robots, active }) {
  const t = esc(title), d = esc(desc || '');
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title><meta name="description" content="${d}">${robots ? `<meta name="robots" content="${robots}">` : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:site_name" content="${NAMA}"><meta property="og:type" content="${type}"><meta property="og:title" content="${t}"><meta property="og:description" content="${d}">${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image)}">` : '<meta name="twitter:card" content="summary">'}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Poppins:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/konten.css">${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head><body>
<header class="kh"><div class="kw kh__in"><a class="kh__brand" href="/" aria-label="${NAMA}, beranda"><span class="kh__mark">${MARK}</span><span><b>${NAMA}</b></span></a>
<nav class="kh__nav" aria-label="Navigasi"><a href="/">Beranda</a><a href="/berita"${active === 'berita' ? ' aria-current="page"' : ''}>Berita</a><a href="/#/galeri/dokumentasi">Galeri</a><a href="/#/informasi/kontak">Kontak</a></nav></div></header>
<main id="isi">${body}</main>
<footer class="kf"><div class="kw"><p>© ${new Date().getFullYear()} ${NAMA}</p><p><a href="/">Kembali ke website utama</a></p></div></footer>
<script src="/konten.js" defer></script></body></html>`;
}
const imgTag = (g, cls, sizes) => g ? `<img class="${cls}" src="${esc(g.url)}"${g.thumb ? ` srcset="${esc(g.thumb)} 480w, ${esc(g.url)} ${g.lebar || 1600}w" sizes="${sizes || '(max-width:700px) 100vw, 760px'}"` : ''}${g.lebar ? ` width="${g.lebar}" height="${g.tinggi}"` : ''} alt="${esc(g.alt || '')}" loading="lazy" decoding="async">` : '';

function kartu(n) {
  return `<li class="kc"><a class="kc__a" href="${esc(n.url)}"><div class="kc__m">${n.gambar ? `<img src="${esc(n.thumb || n.gambar)}" ${n.lebar ? `width="480" height="${Math.round(480 * (n.tinggi || 320) / (n.lebar || 480))}"` : ''} alt="" loading="lazy" decoding="async">` : '<span class="kc__ph" aria-hidden="true">' + MARK + '</span>'}${n.unggulan ? '<span class="kc__tag">Unggulan</span>' : ''}</div>
<div class="kc__b">${n.kategori ? `<span class="kc__k">${esc(n.kategori)}</span>` : ''}<h3>${esc(n.judul)}</h3>${n.ringkasan ? `<p>${esc(n.ringkasan)}</p>` : ''}<time datetime="${iso(n.terbit_pada)}">${tgl(n.terbit_pada)}</time></div></a></li>`;
}
function renderList({ base, rows, unggulan, total, page, per, q, kategori, kategoriList }) {
  const pages = Math.max(1, Math.ceil(total / per)), qs = (o) => { const p = new URLSearchParams(); const v = Object.assign({ q, kategori, page }, o); Object.entries(v).forEach(([k, x]) => { if (x && !(k === 'page' && +x === 1)) p.set(k, x); }); const s = p.toString(); return '/berita' + (s ? '?' + s : ''); };
  const filter = `<form class="kf__form" method="get" action="/berita" role="search"><label class="sr" for="kq">Cari berita</label><input id="kq" name="q" type="search" value="${esc(q || '')}" placeholder="Cari berita…" maxlength="80">
<label class="sr" for="kk">Kategori</label><select id="kk" name="kategori"><option value="">Semua kategori</option>${kategoriList.map(k => `<option value="${esc(k.slug)}"${k.slug === kategori ? ' selected' : ''}>${esc(k.nama)}</option>`).join('')}</select><button type="submit">Cari</button></form>`;
  const adaFilter = !!(q || kategori);
  const body = `<section class="kw kl"><nav class="kcrumb" aria-label="Breadcrumb"><a href="/">Beranda</a><span>Berita</span></nav><h1>Berita</h1><p class="kl__sub">Kabar dan dokumentasi kegiatan ${NAMA}.</p>${filter}
${unggulan && unggulan.length && !adaFilter && page === 1 ? `<section aria-labelledby="ku"><h2 id="ku" class="kl__h">Berita Unggulan</h2><ul class="kg kg--u">${unggulan.map(kartu).join('')}</ul></section>` : ''}
${rows.length ? `${adaFilter || page > 1 || (unggulan && unggulan.length) ? '<h2 class="kl__h">' + (adaFilter ? `Hasil pencarian (${total})` : 'Berita Terbaru') + '</h2>' : ''}<ul class="kg">${rows.map(kartu).join('')}</ul>`
    : `<div class="ke" role="status"><b>${adaFilter ? 'Tidak ada berita yang cocok' : 'Belum ada berita'}</b><p>${adaFilter ? 'Coba kata kunci atau kategori lain.' : 'Berita yang diterbitkan akan tampil di halaman ini.'}</p>${adaFilter ? '<a class="kbtn" href="/berita">Lihat semua berita</a>' : ''}</div>`}
${pages > 1 ? `<nav class="kp" aria-label="Halaman">${page > 1 ? `<a href="${esc(qs({ page: page - 1 }))}" rel="prev">← Sebelumnya</a>` : '<span></span>'}<span>Halaman ${page} dari ${pages}</span>${page < pages ? `<a href="${esc(qs({ page: page + 1 }))}" rel="next">Berikutnya →</a>` : '<span></span>'}</nav>` : ''}</section>`;
  return layout({ title: `Berita${page > 1 ? ' — Halaman ' + page : ''} — ${NAMA}`, desc: `Berita dan kabar terbaru dari ${NAMA}.`, canonical: base + qs({}), base, body, active: 'berita', robots: adaFilter ? 'noindex,follow' : '' });
}
function videoGal(g) { return `<figure class="kv"><div class="kv__box">${embedHtml(g.video_penyedia, g.video_kode, g.judul)}</div>${g.judul || g.caption ? `<figcaption>${esc(g.caption || g.judul)}</figcaption>` : ''}</figure>`; }
function renderDetail({ base, berita: n, galeri = [], terkait = [], pratinjau, status }) {
  const url = `${base || ''}/berita/${n.slug}`, ring = n.ringkasan || plain(n.isi_html).slice(0, 180);
  const desc = (n.seo_deskripsi || ring || '').slice(0, 300), img = n.gambar && n.gambar.url ? (base || '') + n.gambar.url : null;
  const fotos = galeri.filter(g => g.jenis === 'foto' && g.url), vids = galeri.filter(g => g.jenis === 'video');
  const share = enc => `https://wa.me/?text=${enc(n.judul + ' ' + url)}`;
  const ld = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.judul, description: desc, datePublished: n.terbit_pada ? iso(n.terbit_pada) : undefined, dateModified: n.diubah ? iso(n.diubah) : undefined,
    author: { '@type': n.penulis ? 'Person' : 'Organization', name: n.penulis || NAMA }, publisher: { '@type': 'Organization', name: NAMA }, mainEntityOfPage: url, image: img ? [img] : undefined, articleSection: n.kategori || undefined };
  const body = `${pratinjau ? `<div class="kprev" role="status">PRATINJAU — halaman ini hanya terlihat oleh Super Admin${status ? ' · status: ' + esc(status) : ''}. Pengunjung tidak dapat membukanya selama belum terbit.</div>` : ''}
<article class="kw ka"><nav class="kcrumb" aria-label="Breadcrumb"><a href="/">Beranda</a><a href="/berita">Berita</a><span aria-current="page">${esc(n.judul.length > 50 ? n.judul.slice(0, 50) + '…' : n.judul)}</span></nav>
<header class="ka__h">${n.kategori ? `<a class="kc__k" href="/berita?kategori=${esc(n.kategori_slug || '')}">${esc(n.kategori)}</a>` : ''}<h1>${esc(n.judul)}</h1>
<p class="ka__meta"><time datetime="${n.terbit_pada ? iso(n.terbit_pada) : ''}">${tgl(n.terbit_pada)}</time>${n.penulis ? ` · <span>Oleh ${esc(n.penulis)}</span>` : ''}${n.tanggal_kegiatan ? ` · <span>Kegiatan: ${tglStr(n.tanggal_kegiatan)}</span>` : ''}</p>
${ring ? `<p class="ka__lead">${esc(ring)}</p>` : ''}</header>
${n.gambar ? `<figure class="ka__img">${imgTag(n.gambar, 'ka__pic', '(max-width:820px) 100vw, 820px').replace('loading="lazy"', 'loading="eager" fetchpriority="high"')}${n.gambar.alt ? `<figcaption>${esc(n.gambar.alt)}</figcaption>` : ''}</figure>` : ''}
<div class="kprose">${renderIsi(n.isi_html)}</div>
${n.video_url ? (() => { const m = /youtube\.com\/watch\?v=([\w-]{11})/.exec(n.video_url) || null, v = /vimeo\.com\/(\d+)/.exec(n.video_url); return m ? videoGal({ video_penyedia: 'youtube', video_kode: m[1], judul: n.judul }) : v ? videoGal({ video_penyedia: 'vimeo', video_kode: v[1], judul: n.judul }) : ''; })() : ''}
${vids.length ? `<section class="ka__sec"><h2>Video</h2>${vids.map(videoGal).join('')}</section>` : ''}
${fotos.length ? `<section class="ka__sec" aria-labelledby="kgal"><h2 id="kgal">Dokumentasi Foto</h2><ul class="kgal">${fotos.map((g, i) => `<li><a href="${esc(g.url)}" data-lb data-cap="${esc(g.caption || g.judul || '')}" aria-label="Buka foto ${i + 1}"><img src="${esc(g.thumb || g.url)}" alt="${esc(g.judul || '')}" loading="lazy" decoding="async" width="480" height="320"></a>${g.caption ? `<small>${esc(g.caption)}</small>` : ''}</li>`).join('')}</ul></section>` : ''}
<footer class="ka__f"><div class="kshare"><b>Bagikan:</b> <a href="${esc(share(encodeURIComponent))}" target="_blank" rel="noopener noreferrer">WhatsApp</a><a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">Facebook</a><a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&amp;text=${encodeURIComponent(n.judul)}" target="_blank" rel="noopener noreferrer">X</a><button type="button" data-copy="${esc(url)}">Salin tautan</button></div>
<a class="kbtn kbtn--g" href="/berita">← Kembali ke Berita</a></footer></article>
${terkait.length ? `<section class="kw kl kl--r"><h2 class="kl__h">Berita Terkait</h2><ul class="kg">${terkait.map(kartu).join('')}</ul></section>` : ''}`;
  return layout({ title: `${n.judul} — ${NAMA}`, desc, canonical: pratinjau ? null : url, base, image: img, type: 'article', jsonld: pratinjau ? null : ld, body, active: 'berita', robots: pratinjau ? 'noindex,nofollow' : '' });
}
function render404(base) { return layout({ title: `Berita tidak ditemukan — ${NAMA}`, desc: '', base, robots: 'noindex', active: 'berita', body: `<section class="kw kl"><div class="ke" role="status"><b>Berita tidak ditemukan</b><p>Berita yang Anda cari belum diterbitkan, sudah diarsipkan, atau tautannya salah.</p><a class="kbtn" href="/berita">Lihat semua berita</a></div></section>` }); }
module.exports = { renderList, renderDetail, render404, tgl, kartu };
