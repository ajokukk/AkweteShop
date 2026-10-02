/* Mobile menu: opens the full-screen overlay, closes on link tap, Close button or Escape. */
(function () {
  'use strict';
  var btn = document.getElementById('menuBtn'), menu = document.getElementById('menu');
  if (!btn || !menu) return;
  function set(on) {
    menu.classList.toggle('on', on);
    btn.setAttribute('aria-expanded', on);
    document.body.style.overflow = on ? 'hidden' : '';
    var c = menu.querySelector('.menu-close');
    if (on && c) c.focus();
  }
  btn.addEventListener('click', function () { set(true); });
  menu.querySelectorAll('.menu-close').forEach(function (b) { b.addEventListener('click', function () { set(false); btn.focus(); }); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a.ml')) set(false); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.classList.contains('on')) { set(false); btn.focus(); } });
  matchMedia('(min-width:761px)').addEventListener('change', function (e) { if (e.matches && menu.classList.contains('on')) set(false); });
})();
