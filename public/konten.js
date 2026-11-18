(function () {
  'use strict';
  // Salin tautan
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]'); if (!b) return;
    var u = b.getAttribute('data-copy'), done = function () { var t = b.textContent; b.textContent = 'Tautan disalin'; setTimeout(function () { b.textContent = t; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(u).then(done, function () { window.prompt('Salin tautan:', u); }); else window.prompt('Salin tautan:', u);
  });
  // Tombol Bagikan: pil hijau membuka deretan ikon
  var sh = document.querySelector('.ksh');
  if (sh) {
    sh.classList.add('ksh--js');
    var shBtn = sh.querySelector('.ksh__btn'), shTip = sh.querySelector('.ksh__tip'), shUrl = sh.getAttribute('data-url'), shTitle = sh.getAttribute('data-title'), tipT;
    function tip(t) { shTip.textContent = t; shTip.classList.add('is-on'); clearTimeout(tipT); tipT = setTimeout(function () { shTip.classList.remove('is-on'); }, 1800); }
    function toggle(open) {
      sh.classList.toggle('is-open', open); shBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { var f = sh.querySelector('.ksh__bar a'); if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 60); }
    }
    function copy() {
      if (navigator.clipboard) navigator.clipboard.writeText(shUrl).then(function () { tip('Tautan disalin'); }, function () { window.prompt('Salin tautan:', shUrl); });
      else window.prompt('Salin tautan:', shUrl);
    }
    shBtn.addEventListener('click', function () { toggle(true); });
    sh.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ksh]'); if (!b) return;
      if (b.getAttribute('data-ksh') === 'copy') copy();
      else if (navigator.share) navigator.share({ title: shTitle, url: shUrl }).catch(function () {}); else copy();
    });
    document.addEventListener('click', function (e) { if (sh.classList.contains('is-open') && !sh.contains(e.target)) toggle(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sh.classList.contains('is-open')) { toggle(false); shBtn.focus(); } });
  }
  // Lightbox foto dokumentasi
  var links = Array.prototype.slice.call(document.querySelectorAll('a[data-lb]')); if (!links.length) return;
  var lb = document.createElement('div'); lb.className = 'klb'; lb.hidden = true; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Foto dokumentasi');
  lb.innerHTML = '<button class="x" type="button" aria-label="Tutup">✕</button><button class="p" type="button" aria-label="Foto sebelumnya">‹</button><button class="n" type="button" aria-label="Foto berikutnya">›</button><figure><img alt=""><figcaption></figcaption></figure>';
  document.body.appendChild(lb); var img = lb.querySelector('img'), cap = lb.querySelector('figcaption'), i = 0, opener = null;
  function show(k) { i = (k + links.length) % links.length; img.src = links[i].href; img.alt = links[i].getAttribute('data-cap') || ''; cap.textContent = links[i].getAttribute('data-cap') || ''; }
  function open(k, from) { opener = from; show(k); lb.hidden = false; document.documentElement.style.overflow = 'hidden'; lb.querySelector('.x').focus(); }
  function close() { lb.hidden = true; document.documentElement.style.overflow = ''; if (opener) opener.focus(); }
  links.forEach(function (a, k) { a.addEventListener('click', function (e) { e.preventDefault(); open(k, a); }); });
  lb.querySelector('.x').addEventListener('click', close); lb.querySelector('.p').addEventListener('click', function () { show(i - 1); }); lb.querySelector('.n').addEventListener('click', function () { show(i + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.addEventListener('keydown', function (e) { if (lb.hidden) return; if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(i - 1); else if (e.key === 'ArrowRight') show(i + 1); });
  var x0 = null; lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true }); lb.addEventListener('touchend', function (e) { if (x0 === null) return; var d = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(d) > 50) show(i + (d < 0 ? 1 : -1)); });
})();
