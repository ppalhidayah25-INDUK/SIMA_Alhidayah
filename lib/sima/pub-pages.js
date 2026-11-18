'use strict';
// Halaman publik /berita dan /berita/:slug dirender di server (SEO, Open Graph, tanpa JavaScript untuk membaca). Gaya: public/konten.css (palet & tipografi sama dengan website).
const { esc, renderIsi, embedHtml, plain } = require('./konten-lib');
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'], HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const wib = ms => new Date(+ms + 7 * 3600e3);
const tgl = ms => { if (ms == null) return ''; const d = wib(ms); return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const tglStr = s => { if (!s) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? `${+m[3]} ${BULAN[+m[2] - 1]} ${m[1]}` : ''; };
const iso = ms => new Date(+ms).toISOString();
const NAMA = 'Pondok Pesantren Alhidayah Induk';
const SOSIAL = [
  ['YouTube', 'https://www.youtube.com/@Ponpes_alhidayah', '<path d="M2.5 17a24.1 24.1 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.6 49.6 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.1 24.1 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.6 49.6 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>'],
  ['WhatsApp', 'https://wa.me/6285196996301?text=Assalamualaikum%2C%20saya%20ingin%20bertanya', '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/><path d="M9 9.5c.3 2.5 2.5 5 5.5 5.5l1.2-1.3a.8.8 0 0 1 .8-.2l1.5.6c.4.2.6.6.5 1-.3 1-1.1 1.6-2.2 1.5C10.8 16.3 8 13.5 7.7 9.8c0-1 .6-1.8 1.6-2 .4-.1.8.1 1 .5l.6 1.5c.1.3 0 .6-.2.8z"/>'],
  ['TikTok', 'https://www.tiktok.com/@pondok_alhidayahinduk', '<path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>'],
  ['Instagram', 'https://www.instagram.com/pondok_alhidayahinduk', '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>']
];
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Katibeh&family=Cormorant+Garamond:wght@600;700&family=Poppins:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/konten.css">${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head><body>
<header class="kh"><div class="kw kh__in"><a class="kh__brand" href="/" aria-label="${NAMA}, beranda"><span class="kh__mark">${MARK}</span><span><b>${NAMA}</b></span></a>
<nav class="kh__nav" aria-label="Navigasi"><a href="/">Beranda</a><a href="/berita"${active === 'berita' ? ' aria-current="page"' : ''}>Berita</a><a href="/#/galeri/dokumentasi">Galeri</a><a href="/#/informasi/kontak">Kontak</a></nav></div></header>
<main id="isi">${body}</main>
<footer class="foot"><div class="foot__info"><div class="kw"><div class="foot__grid">
<div class="foot__col foot__col--brand"><a class="foot__logo" href="/" aria-label="${NAMA}, kembali ke beranda"><span class="foot__mark"><img src="/logo.png" alt="Logo ${NAMA}" width="52" height="52" decoding="async"></span><span class="foot__brand"><span class="foot__ar" lang="ar" dir="rtl">المَعْهَدُ الاِسْلَامِىُّ الرَّئِيسِىُّ الهِدَايَة</span><span class="foot__lat">${NAMA}</span></span></a>
<ul class="foot__social" aria-label="Media sosial">${SOSIAL.map(x => `<li><a class="foot__soc" href="${x[1]}" target="_blank" rel="noopener noreferrer" aria-label="${x[0]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${x[2]}</svg></a></li>`).join('')}</ul></div>
<nav class="foot__col" aria-label="Tautan footer"><h2 class="foot__h">Tautan</h2><ul class="foot__list"><li><a href="/">Beranda</a></li><li><a href="/#profil-pendiri">Profil</a></li><li><a href="/#/lembaga/formal/mi">Lembaga</a></li><li><a href="/#/galeri/dokumentasi">Galeri</a></li><li><a href="/berita">Berita</a></li><li><a href="/#/informasi/kontak">Informasi</a></li><li><a href="https://psb-hidayahinduk.vercel.app/" target="_blank" rel="noopener noreferrer">PSB</a></li><li><a href="/sima">SIMA</a></li></ul></nav>
<div class="foot__col"><h2 class="foot__h foot__h--c">Kontak</h2><address class="foot__addr"><strong>Sekretariat PP. Alhidayah Induk</strong>Jl. Raya Karangan, RT. 03 / RW. 01, Jakaan, Bonowarih, Kec. Karang Ploso, Kabupaten Malang, Jawa Timur 65152</address><p class="foot__mailrow">Email: <a class="foot__mail" href="mailto:ppalhidayah25@gmail.com">ppalhidayah25@gmail.com</a></p></div>
</div></div></div><div class="foot__copy"><p>&copy; ${new Date().getFullYear()} - Alhidayah Induk</p></div></footer>
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
<footer class="ka__f"><div class="ksh" data-url="${esc(url)}" data-title="${esc(n.judul)}">
<button class="ksh__btn" type="button" aria-expanded="false" aria-controls="ksh-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/></svg>Bagikan</button>
<div class="ksh__bar" id="ksh-bar" role="group" aria-label="Bagikan berita">
<a style="--i:0" href="${esc(share(encodeURIComponent))}" target="_blank" rel="noopener noreferrer" aria-label="Bagikan lewat WhatsApp" title="WhatsApp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/><path d="M9 9.5c.3 2.5 2.5 5 5.5 5.5l1.2-1.3a.8.8 0 0 1 .8-.2l1.5.6c.4.2.6.6.5 1-.3 1-1.1 1.6-2.2 1.5C10.8 16.3 8 13.5 7.7 9.8c0-1 .6-1.8 1.6-2 .4-.1.8.1 1 .5l.6 1.5c.1.3 0 .6-.2.8z"/></svg></a>
<a style="--i:1" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer" aria-label="Bagikan lewat Facebook" title="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1877f2"/><path fill="#fff" d="M13.4 20v-6.6h2.2l.4-2.7h-2.6V9c0-.8.3-1.3 1.4-1.3H16V5.3c-.2 0-1-.1-2-.1-2 0-3.4 1.2-3.4 3.500v2h-2.300v2.700h2.300V20z"/></svg></a>
<a style="--i:2" href="https://t.me/share/url?url=${encodeURIComponent(url)}&amp;text=${encodeURIComponent(n.judul)}" target="_blank" rel="noopener noreferrer" aria-label="Bagikan lewat Telegram" title="Telegram"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#00482f"/><path fill="#fff" d="M5.600 11.700 17.200 7.200c.5-.2 1 .1.8.9l-2 9.200c-.1.600-.5.800-1 .500l-3-2.200-1.400 1.400c-.2.200-.3.300-.6.300l.2-3.100 5.500-5c.2-.2 0-.3-.4-.1l-6.800 4.300-2.900-.9c-.6-.2-.6-.6.100-.9z"/></svg></a>
<button style="--i:3" type="button" data-ksh="copy" aria-label="Salin tautan" title="Salin tautan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3A4 4 0 0 0 11 18.700l1-1"/></svg></button>
<button style="--i:4" type="button" data-ksh="native" aria-label="Bagikan lewat aplikasi lain" title="Aplikasi lain"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3.500M7.500 8 12 3.500 16.500 8"/><path d="M5 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/></svg></button>
</div><span class="ksh__tip" role="status" aria-live="polite"></span></div>
<a class="kbtn kbtn--g" href="/berita">← Kembali ke Berita</a></footer></article>
${terkait.length ? `<section class="kw kl kl--r"><h2 class="kl__h">Berita Terkait</h2><ul class="kg">${terkait.map(kartu).join('')}</ul></section>` : ''}`;
  return layout({ title: `${n.judul} — ${NAMA}`, desc, canonical: pratinjau ? null : url, base, image: img, type: 'article', jsonld: pratinjau ? null : ld, body, active: 'berita', robots: pratinjau ? 'noindex,nofollow' : '' });
}
function render404(base) { return layout({ title: `Berita tidak ditemukan — ${NAMA}`, desc: '', base, robots: 'noindex', active: 'berita', body: `<section class="kw kl"><div class="ke" role="status"><b>Berita tidak ditemukan</b><p>Berita yang Anda cari belum diterbitkan, sudah diarsipkan, atau tautannya salah.</p><a class="kbtn" href="/berita">Lihat semua berita</a></div></section>` }); }
module.exports = { renderList, renderDetail, render404, tgl, kartu };
