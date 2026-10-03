/* Site chrome shared by every page: skip link, header, mobile menu, footer, back-to-top, scroll-spy.
   Each page sets <body data-page="home|history|checkout|orders"> and, on the home page, data-has-sound. */
(function () {
  'use strict';
  var B = document.body, P = B.getAttribute('data-page') || 'home';
  var HOME = P === 'home', SOUND = B.hasAttribute('data-has-sound');
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var A = function (h) { return HOME ? h : 'index.html' + h; };
  var LINKS = [
    ['The cloth', A('#weave'), 'weave'], ['Motifs', A('#motifs'), 'motifs'], ['Craft', A('#craft'), 'craft'],
    ['History', 'history.html', 'history'], ['Shop', A('#shop'), 'shop'], ['Build', A('#build'), 'build']
  ];
  function links(cls) {
    return LINKS.map(function (l) {
      var cur = (l[2] === 'history' && P === 'history') ? ' aria-current="page"' : '';
      return '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + l[1] + '" data-sec="' + l[2] + '"' + cur + '>' + l[0] + '</a>';
    }).join('');
  }
  var bag = HOME
    ? '<button class="pill" id="bagBtn" type="button"><span>Bag</span>&nbsp;(<span id="bagN" data-bag-count>0</span>)</button>'
    : '<a class="pill" href="checkout.html"><span>Bag</span>&nbsp;(<span data-bag-count>0</span>)</a>';

  var chrome =
    '<a class="skip" href="#content">Skip to content</a>' +
    '<header class="hd"><a class="brand" href="' + (HOME ? '#top' : 'index.html') + '" aria-label="Akwete, home">Akwete</a>' +
    '<nav class="hd-links" aria-label="Main">' + links('') + '</nav>' +
    '<div class="tools"><button class="pill" type="button" data-lang-toggle data-no-i18n></button>' +
    (SOUND ? '<button class="pill hide-m" type="button" data-sound aria-pressed="false">Sound off</button>' : '') +
    '<button class="pill hide-m" type="button" data-auth>Sign in</button>' + bag +
    '<button class="pill menu-btn" type="button" id="menuBtn" aria-expanded="false" aria-controls="menu">Menu</button></div></header>' +
    '<nav class="menu" id="menu" aria-label="Main menu"><button class="pill menu-close" type="button">Close</button>' +
    links('ml') + '<a class="ml" href="orders.html"' + (P === 'orders' ? ' aria-current="page"' : '') + '>My orders</a>' +
    '<div class="menu-tools">' + (SOUND ? '<button class="pill" type="button" data-sound aria-pressed="false">Sound off</button>' : '') +
    '<button class="pill" type="button" data-auth>Sign in</button>' +
    '<button class="pill" type="button" data-lang-toggle data-no-i18n></button></div></nav>';
  B.insertAdjacentHTML('afterbegin', chrome);

  var main = document.querySelector('main');
  if (main) {
    if (!main.id) main.id = 'content';
    main.setAttribute('tabindex', '-1');
    main.insertAdjacentHTML('afterend',
      '<footer class="site-footer"><div class="ft-brand"><b>Akwete</b><p>A digital study of woven stories.</p></div>' +
      '<nav class="ft-nav" aria-label="Site links"><h2>Pages</h2><ul>' +
      '<li><a href="index.html">Home</a></li><li><a href="history.html">History</a></li><li><a href="index.html#shop">Shop</a></li>' +
      '<li><a href="index.html#build">Build your Akwete</a></li><li><a href="orders.html">My orders</a></li><li><a href="checkout.html">Checkout</a></li></ul></nav>' +
      '<div class="ft-lang"><h2>Language</h2><button class="pill" type="button" data-lang-toggle data-no-i18n></button></div>' +
      '<button class="ft-top" type="button">Back to top</button></footer>');
  }

  /* back to top */
  var up = document.createElement('button');
  up.className = 'totop'; up.type = 'button'; up.setAttribute('aria-label', 'Back to top'); up.textContent = '\u2191';
  B.appendChild(up);
  var toTop = function () { window.scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' }); };
  up.addEventListener('click', toTop);
  var ft = document.querySelector('.ft-top'); if (ft) ft.addEventListener('click', toTop);
  addEventListener('scroll', function () { up.classList.toggle('on', scrollY > 900); }, { passive: true });

  /* mobile menu */
  var btn = document.getElementById('menuBtn'), menu = document.getElementById('menu');
  function setMenu(on) {
    menu.classList.toggle('on', on);
    btn.setAttribute('aria-expanded', on);
    B.style.overflow = on ? 'hidden' : '';
    if (on) menu.querySelector('.menu-close').focus();
  }
  btn.addEventListener('click', function () { setMenu(true); });
  menu.querySelector('.menu-close').addEventListener('click', function () { setMenu(false); btn.focus(); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a.ml')) setMenu(false); });
  addEventListener('keydown', function (e) {
    if (!menu.classList.contains('on')) return;
    if (e.key === 'Escape') { setMenu(false); btn.focus(); }
    if (e.key === 'Tab') {
      var f = [].slice.call(menu.querySelectorAll('a,button')).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  try {
    var mq = matchMedia('(min-width:1101px)');
    var onMq = function (e) { if (e.matches && menu.classList.contains('on')) setMenu(false); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  } catch (err) {}

  /* highlight the section you are reading (home page) */
  if (HOME && 'IntersectionObserver' in window) {
    var ids = ['top', 'weave', 'motifs', 'craft', 'shop', 'build'];
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = e.target.id;
        document.querySelectorAll('[data-sec]').forEach(function (a) {
          var on = a.getAttribute('href') === '#' + id;
          if (on) a.setAttribute('aria-current', 'location');
          else if (a.getAttribute('aria-current') === 'location') a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ids.forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  }
})();
