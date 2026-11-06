'use strict';
// Pembantu modul Berita & Galeri: slug, sanitasi HTML, tautan video, pemrosesan gambar.
const crypto = require('crypto');
const sanitizeHtml = require('sanitize-html');
let sharp; try { sharp = require('sharp'); } catch (e) { sharp = null; }

const slugify = (s, max = 80) => {
  const v = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' dan ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
  return v || 'berita';
};
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---- Sanitasi isi berita: daftar putih ketat. Gambar hanya dari Media Library sendiri; video hanya YouTube/Vimeo lewat penanda. ----
const IMG_SRC = /^\/media\/\d+-[0-9a-f]{8}\.webp$/;
const VIDEO_KEY = /^(youtube|vimeo):[A-Za-z0-9_-]{6,20}$/;
function sanitizeIsi(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['h2', 'h3', 'h4', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'a', 'figure', 'figcaption', 'img', 'div'],
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'], div: ['class', 'data-video'] },
    allowedSchemes: ['http', 'https', 'mailto'], allowedSchemesAppliedToAttributes: ['href'], allowProtocolRelative: false,
    allowedClasses: { div: ['embed'] },
    transformTags: {
      a: (tag, at) => { const ext = /^https?:/i.test(at.href || ''); return { tagName: 'a', attribs: Object.assign({}, at.href ? { href: at.href } : {}, ext ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {}) }; },
      b: 'strong', i: 'em',
      div: (tag, at) => (at.class === 'embed' && VIDEO_KEY.test(at['data-video'] || '') ? { tagName: 'div', attribs: { class: 'embed', 'data-video': at['data-video'] } } : { tagName: 'p', attribs: {} })   // div biasa (hasil editor) menjadi paragraf, teks tidak hilang
    },
    exclusiveFilter: f => f.tag === 'img' && !IMG_SRC.test(f.attribs.src || ''),
    disallowedTagsMode: 'discard'
  });
}
const mediaIdsOf = html => [...new Set([...String(html || '').matchAll(/src="\/media\/(\d+)-[0-9a-f]{8}\.webp"/g)].map(m => +m[1]))];
const plain = html => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

// ---- Video: hanya tautan dari layanan yang didukung (tidak ada upload video: batas ukuran fungsi serverless) ----
function parseVideo(url) {
  let u; try { u = new URL(String(url || '').trim()); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.replace(/^www\.|^m\./, '');
  let m;
  if (h === 'youtu.be') { m = /^\/([A-Za-z0-9_-]{11})$/.exec(u.pathname); if (m) return { penyedia: 'youtube', kode: m[1], url: 'https://www.youtube.com/watch?v=' + m[1] }; }
  if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    m = /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})$/.exec(u.pathname); const v = u.searchParams.get('v');
    const id = m ? m[1] : (u.pathname === '/watch' && /^[A-Za-z0-9_-]{11}$/.test(v || '') ? v : null);
    if (id) return { penyedia: 'youtube', kode: id, url: 'https://www.youtube.com/watch?v=' + id };
  }
  if (h === 'vimeo.com' || h === 'player.vimeo.com') { m = /^\/(?:video\/)?(\d{6,12})$/.exec(u.pathname); if (m) return { penyedia: 'vimeo', kode: m[1], url: 'https://vimeo.com/' + m[1] }; }
  return null;
}
const embedSrc = (p, k) => p === 'youtube' ? `https://www.youtube-nocookie.com/embed/${k}` : `https://player.vimeo.com/video/${k}`;
const videoThumb = (p, k) => p === 'youtube' ? `https://i.ytimg.com/vi/${k}/hqdefault.jpg` : null;
const embedHtml = (p, k, judul) => `<div class="embed"><iframe src="${embedSrc(p, k)}" title="${String(judul || 'Video').replace(/[&<>"']/g, '')}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
// penanda <div class="embed" data-video="youtube:ID"></div> -> iframe saat dirender
const renderIsi = html => String(html || '').replace(/<div class="embed" data-video="(youtube|vimeo):([A-Za-z0-9_-]{6,20})"><\/div>/g, (_, p, k) => embedHtml(p, k, 'Video'));

// ---- Gambar: validasi isi sebenarnya (bukan ekstensi), orientasi, buang metadata, WebP 1600px + thumbnail 480px ----
function sniffImg(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length > 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
const MAX_IMG = 3 * 1024 * 1024;
function readImg(b) {
  if (!b || typeof b.data !== 'string' || !b.data) return { error: 'Foto belum dipilih.' };
  const m = /^data:[^;,]*;base64,/.exec(b.data), raw = m ? b.data.slice(m[0].length) : b.data;
  if (raw.length > Math.ceil(MAX_IMG / 3) * 4 + 8) return { error: 'Ukuran foto melebihi 3 MB.' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return { error: 'Isi foto tidak valid.' };
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) return { error: 'Foto kosong.' };
  if (buf.length > MAX_IMG) return { error: 'Ukuran foto melebihi 3 MB.' };
  if (!sniffImg(buf)) return { error: 'Format foto harus JPG, PNG, atau WebP.' };
  const nama = String(b.nama || '').replace(/[\\/\u0000-\u001f"<>:*?|]/g, '').slice(-100) || 'foto';
  return { buf, nama, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}
async function olahFoto(buf) {
  if (!sharp) throw Object.assign(new Error('Pengolah gambar belum tersedia di server.'), { http: 500 });
  try {
    const base = () => sharp(buf, { limitInputPixels: 80e6, failOn: 'error' }).rotate();
    const o = await base().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    const t = await base().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    return { isi: o.data, thumb: t, lebar: o.info.width, tinggi: o.info.height };
  } catch (e) { throw Object.assign(new Error('Berkas bukan gambar yang dapat diproses.'), { http: 400 }); }
}
const mediaUrl = (m, thumb) => `/media/${m.id}-${m.token}${thumb ? '-t' : ''}.webp`;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
module.exports = { slugify, SLUG_RE, sanitizeIsi, mediaIdsOf, plain, parseVideo, embedSrc, videoThumb, embedHtml, renderIsi, readImg, olahFoto, mediaUrl, esc, MAX_IMG };
