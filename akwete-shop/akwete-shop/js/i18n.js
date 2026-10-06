/* Language switching (English / Igbo).
   The pages are written in English. When Igbo is chosen, this file swaps every piece of visible text
   (and alt / aria-label / title / placeholder attributes) using the dictionary in js/lang/ig.js,
   including text that other scripts add later. Choose English again and the original text returns.
   Dictionary format (see ig.js):  exact: { "English text": "Igbo text" },  patterns: [ [/regex/, fn] ] */
(function () {
  'use strict';
  var KEY = 'akwete_lang', SUP = ['en', 'ig'];
  var DICT = window.AK_LANG || {};
  var cur = 'en', busy = false, mo = null;
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, OPTION: 0 };
  var ATTRS = ['alt', 'aria-label', 'title', 'placeholder'];
  var norm = function (s) { return String(s).replace(/\s+/g, ' ').trim(); };
  var has = Object.prototype.hasOwnProperty;

  function lookup(n) {
    var d = DICT.ig; if (!d) return null;
    if (d.exact && has.call(d.exact, n)) return d.exact[n];
    var P = d.patterns || [];
    for (var i = 0; i < P.length; i++) {
      var m = P[i][0].exec(n);
      if (m) { try { return P[i][1].apply(null, m.slice(1)); } catch (e) { return null; } }
    }
    return null;
  }
  function tr(s) { if (cur !== 'ig') return s; var r = lookup(norm(s)); return r == null ? s : r; }

  function skipEl(el) { return !el || (el.closest && el.closest('[data-no-i18n]')) || SKIP[el.nodeName] === 1; }

  function xText(node) {
    var p = node.parentNode; if (skipEl(p)) return;
    if (node.__en !== undefined && node.nodeValue !== node.__ig) { node.__en = undefined; } // changed by another script
    var src = node.__en !== undefined ? node.__en : node.nodeValue;
    if (cur === 'ig') {
      var n = norm(src); if (!n) return;
      var r = lookup(n);
      if (r != null) {
        var lead = src.match(/^\s*/)[0], trail = src.match(/\s*$/)[0];
        node.__en = src; node.__ig = lead + r + trail; node.nodeValue = node.__ig;
      }
    } else if (node.__en !== undefined) {
      node.nodeValue = node.__en; node.__en = undefined;
    }
  }
  function xAttr(el) {
    if (skipEl(el)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i]; if (!el.hasAttribute(a)) continue;
      var k = '__en_' + a, g = '__ig_' + a, v = el.getAttribute(a);
      if (el[k] !== undefined && v !== el[g]) el[k] = undefined;
      var src = el[k] !== undefined ? el[k] : v;
      if (cur === 'ig') {
        var r = lookup(norm(src));
        if (r != null) { el[k] = src; el[g] = r; el.setAttribute(a, r); }
      } else if (el[k] !== undefined) { el.setAttribute(a, el[k]); el[k] = undefined; }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { xText(root); return; }
    if (root.nodeType !== 1) return;
    if (root.hasAttribute && (root.hasAttribute('alt') || root.hasAttribute('aria-label') || root.hasAttribute('title') || root.hasAttribute('placeholder'))) xAttr(root);
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var n; while ((n = tw.nextNode())) xText(n);
    var els = root.querySelectorAll('[alt],[aria-label],[title],[placeholder]');
    for (var i = 0; i < els.length; i++) xAttr(els[i]);
  }
  function head() {
    var t = document.querySelector('title');
    if (t && t.firstChild) {
      if (t.__src === undefined) t.__src = t.firstChild.nodeValue;
      var r = cur === 'ig' ? lookup(norm(t.__src)) : null;
      t.firstChild.nodeValue = r != null ? r : t.__src;
    }
    var m = document.querySelector('meta[name="description"]');
    if (m) {
      if (m.__src === undefined) m.__src = m.getAttribute('content');
      var d = cur === 'ig' ? lookup(norm(m.__src)) : null;
      m.setAttribute('content', d != null ? d : m.__src);
    }
  }
  function paintToggles() {
    var toIg = cur === 'en';
    document.querySelectorAll('[data-lang-toggle]').forEach(function (b) {
      b.textContent = toIg ? 'Igbo' : 'English';
      b.setAttribute('lang', toIg ? 'ig' : 'en');
      b.setAttribute('aria-label', toIg ? 'Switch the website to Igbo' : 'Gbanwee weebụsaịtị a gaa n\u2019Bekee');
      b.setAttribute('title', toIg ? 'Igbo' : 'English');
    });
  }
  function applyAll() {
    busy = true;
    try { head(); walk(document.body); paintToggles(); } finally { busy = false; if (mo) mo.takeRecords(); }
  }
  function set(l, persist) {
    if (SUP.indexOf(l) < 0) return;
    cur = l; document.documentElement.setAttribute('lang', l);
    if (persist !== false) { try { localStorage.setItem(KEY, l); } catch (e) {} }
    applyAll();
    window.dispatchEvent(new Event('langchange'));
  }
  function detect() {
    try { var q = new URLSearchParams(location.search).get('lang'); if (SUP.indexOf(q) > -1) return q; } catch (e) {}
    try { var s = localStorage.getItem(KEY); if (SUP.indexOf(s) > -1) return s; } catch (e) {}
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    for (var i = 0; i < langs.length; i++) if (String(langs[i]).toLowerCase().indexOf('ig') === 0) return 'ig';
    return 'en';
  }

  window.AKI = { tr: tr, set: set, apply: applyAll, get lang() { return cur; } };

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-lang-toggle]');
    if (b) set(cur === 'en' ? 'ig' : 'en');
  });

  function start() {
    mo = new MutationObserver(function (recs) {
      if (busy) return;
      busy = true;
      try {
        recs.forEach(function (r) {
          if (r.type === 'childList') r.addedNodes.forEach(function (n) { walk(n); });
          else if (r.type === 'attributes') xAttr(r.target);
        });
        paintToggles();
      } finally { busy = false; mo.takeRecords(); }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ATTRS });
    set(detect(), false);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
