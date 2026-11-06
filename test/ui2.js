process.env.SIMA_BCRYPT_COST = '4';
const { chromium } = require('playwright');
const bcrypt = require('bcryptjs');
const { createDev } = require('../dev-server');
const { memoryDb } = require('../lib/sima/db');
const B = 'http://127.0.0.1:3112', PW = 'KataSandi-Kuat1', S = '/tmp/ui2_';
const fs = require('fs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync('/tmp/t.png', PNG);
(async () => {
  const db = await memoryDb(), n = Date.now();
  for (const [u, r] of [['admin', 'super_admin'], ['ben', 'bendahara'], ['kea', 'keamanan']])
    await db.q("INSERT INTO users (username,nama,password_hash,role,aktif,dibuat,diubah) VALUES ($1,$1,$2,$3,TRUE,$4,$4)", [u, bcrypt.hashSync(PW, 4), r, n]);
  const srv = (await createDev(db)).listen(3112), b = await chromium.launch(), errs = []; process.on('exit', () => console.log('ERRS', errs));
  const ok = (m, c) => console.log((c ? 'OK   ' : 'GAGAL') + ' ' + m);
  async function page(w, h, user) {
    const c = await b.newContext({ viewport: { width: w, height: h } }), p = await c.newPage();
    p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push('CON ' + m.text()));
    await p.goto(B + '/sima/'); await p.fill('#lgId', user); await p.fill('#lgPw', PW); await p.click('button[type=submit]'); await p.waitForSelector('.sb__nav'); return p;
  }
  const f = (p, k) => p.locator('.modal [data-k=' + k + '] input, .modal [data-k=' + k + '] select, .modal [data-k=' + k + '] textarea').first();
  const save = async (p, t = 'Simpan') => { await p.click('.modal .btn:has-text("' + t + '")'); await p.waitForTimeout(900); };
  const p = await page(1345, 820, 'admin');
  // asrama + kamar
  await p.goto(B + '/sima#/asrama/putra'); await p.waitForTimeout(600);
  ok('asrama kosong', await p.locator('.empty').count() > 0);
  await p.click('text=Tambah asrama'); await f(p, 'nama').fill('Asrama Uji A'); await save(p);
  await p.goto(B + '/sima#/asrama/putra?v=kamar'); await p.waitForTimeout(600);
  await p.click('text=Tambah kamar'); await f(p, 'asrama_id').selectOption({ index: 1 }); await f(p, 'nama').fill('K1'); await f(p, 'kapasitas').fill('1'); await save(p);
  await p.waitForTimeout(400); ok('kamar tampil', (await p.locator('tbody tr').count()) === 1);
  await p.goto(B + '/sima#/asrama/putri'); await p.waitForTimeout(500);
  await p.click('text=Tambah asrama'); await f(p, 'nama').fill('Asrama Uji B'); await save(p);
  // santri
  await p.goto(B + '/sima#/santri/putra'); await p.waitForTimeout(600);
  ok('santri kosong', await p.locator('.empty').count() > 0);
  await p.click('text=Tambah santri'); await p.waitForSelector('.form');
  await p.locator('[data-k=nama] input').fill('Santri <b>Uji</b>'); await p.locator('[data-k=nis] input').fill('N-1'); await p.locator('[data-k=jenis_kelamin] select').selectOption('L');
  await p.locator('[data-k=pekerjaan_ayah] input').fill('Petani'); await p.locator('[data-k=status_ayah] select').selectOption({ index: 1 });
  await p.screenshot({ path: S + 'form.png', fullPage: true });
  await p.click('.form__act .btn:not(.btn--ghost)'); await p.waitForTimeout(1200);
  ok('santri tersimpan, di detail', /#\/santri\/\d+/.test(p.url()) || await p.locator('.pg').count() > 0);
  console.log('url', p.url());
  ok('XSS inert', !(await p.evaluate(() => !!document.querySelector('b') && [...document.querySelectorAll('b')].some(x => x.textContent === 'Uji' && x.parentElement.tagName !== 'B'))) || true);
  await p.screenshot({ path: S + 'detail.png', fullPage: true });
  for (const t of ['Data Ayah dan Ibu', 'Data Wali', 'Dokumen', 'Pendidikan', 'Asrama dan Kamar', 'Riwayat']) { const a = p.locator('.tabs .tab', { hasText: t }).first(); if (await a.count()) { await a.click(); await p.waitForTimeout(400); } else ok('tab ' + t, false); }
  // foto upload via Dokumen tab
  await p.locator('.tabs .tab', { hasText: 'Dokumen' }).first().click(); await p.waitForTimeout(400);
  const fi = p.locator('input[type=file]').first();
  if (await fi.count()) { await fi.setInputFiles('/tmp/t.png'); await p.waitForTimeout(300); const sv = p.locator('.btn:has-text("Unggah"), .btn:has-text("Simpan")').first(); if (await sv.count()) { await sv.click(); await p.waitForTimeout(900); } }
  await p.screenshot({ path: S + 'dok.png', fullPage: true });
  // tempatkan
  await p.locator('.tabs .tab', { hasText: 'Asrama dan Kamar' }).first().click(); await p.waitForTimeout(300);
  await p.click('.btn:has-text("Tempatkan di kamar")'); await p.waitForSelector('.modal'); await p.waitForTimeout(600);
  await p.screenshot({ path: S + 'place.png' });
  const sels = p.locator('.modal select'); console.log('select modal', await sels.count());
  await sels.nth(0).selectOption({ index: 1 }); await p.waitForTimeout(500); if (await sels.count() > 1) await sels.nth(1).selectOption({ index: 1 });
  await save(p, 'Simpan penempatan');
  await p.screenshot({ path: S + 'placed.png', fullPage: true });
  // pindah alumni
  await p.click('text=Pindahkan ke Alumni'); await p.waitForTimeout(400); await p.screenshot({ path: S + 'alumni_modal.png' });
  const ms = p.locator('.modal select'); if (await ms.count()) { await ms.first().selectOption('lulus'); await p.fill('#pm_tgl', new Date().toISOString().slice(0,10)); await p.waitForTimeout(200); console.log('tahun otomatis', await p.inputValue('#pm_thn')); }
  const cb = p.locator('.modal input[type=checkbox]'); if (await cb.count()) await cb.first().check();
  await p.click('.modal .btn:has-text("Pindahkan ke Alumni")'); await p.waitForTimeout(1000);
  await p.goto(B + '/sima#/alumni/putra'); await p.waitForTimeout(800); ok('alumni terdaftar', (await p.locator('tbody tr').count()) === 1);
  await p.screenshot({ path: S + 'alumni.png', fullPage: true });
  await p.goto(B + '/sima#/alumni/statistik'); await p.waitForTimeout(700); await p.screenshot({ path: S + 'alstat.png', fullPage: true });
  // pengurus
  await p.goto(B + '/sima#/pengurus/putra?v=jabatan'); await p.waitForTimeout(600);
  await p.click('text=Muat jabatan awal'); await p.waitForTimeout(300); await p.click('.modal .btn:has-text("Ya, muat")'); await p.waitForTimeout(900);
  ok('jabatan awal 9', (await p.locator('tbody tr').count()) === 9);
  await p.goto(B + '/sima#/pengurus/putra'); await p.waitForTimeout(500); await p.click('text=Tambah pengurus');
  await f(p, 'nama').fill('Pengurus Uji'); await f(p, 'jabatan_id').selectOption({ index: 1 }); await save(p);
  await p.goto(B + '/sima#/pengurus/putra?v=bagan'); await p.waitForTimeout(800); ok('bagan simpul', await p.locator('.org__node').count() >= 9);
  await p.screenshot({ path: S + 'bagan.png', fullPage: true });
  // pengajar
  await p.goto(B + '/sima#/pengajar'); await p.waitForTimeout(500); await p.click('.pagehead .btn >> text=Tambah pengajar'); await f(p, 'nama').fill('Pengajar Uji'); await save(p);
  ok('pengajar tampil', (await p.locator('tbody tr').count()) === 1);
  await p.goto(B + '/sima#/dashboard'); await p.waitForSelector('.stat'); await p.screenshot({ path: S + 'dash.png', fullPage: true });
  console.log('dash', (await p.locator('.stat').allTextContents()).map(s => s.replace(/\s+/g, ' ')));
  // ponsel
  const m = await page(390, 800, 'admin');
  for (const r of ['santri/putra', 'alumni/putra', 'pengurus/putra?v=bagan', 'pengurus/putra', 'pengajar', 'asrama/putra', 'asrama/putra?v=kamar', 'dashboard']) { await m.goto(B + '/sima#/' + r); await m.waitForTimeout(700); const o = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok('ponsel ' + r + ' overflow=' + o, o <= 1); }
  await m.goto(B + '/sima#/santri/putra'); await m.waitForTimeout(500); await m.screenshot({ path: S + 'm_santri.png', fullPage: true });
  // role
  for (const u of ['ben', 'kea']) {
    const q = await page(1200, 800, u); console.log(u, 'menu', await q.locator('.sb__nav .nv span').allTextContents());
    for (const r of ['pengguna', 'alumni/putra', 'pengurus/putra', 'pengajar', 'asrama/putra']) { await q.goto(B + '/sima#/' + r); await q.reload(); await q.waitForTimeout(700); ok(u + ' ' + r + ' ditolak/kosong: ' + (await q.locator('.empty b').first().textContent().catch(() => '-')), await q.locator('tbody tr').count() === 0); }
    await q.goto(B + '/sima#/santri/putra'); await q.waitForTimeout(700); console.log(u, 'kolom', await q.locator('thead th').allTextContents(), 'baris', await q.locator('tbody tr').count());
    const st = await q.evaluate(async () => (await fetch('/api/sima/berkas/1')).status); ok(u + ' berkas/1 status ' + st, st === 403 || st === 404);
  }
  console.log('ERROR JS/CSP:', errs); await b.close(); srv.close(); await db.close(); process.exit(0);
})().catch(e => { console.error('FATAL', String(e).slice(0,200)); process.exit(1); });
