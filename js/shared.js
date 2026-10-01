/* Shared by index.html, checkout.html and orders.html.
   - creates the Supabase client
   - Google sign-in / sign-out
   - the bag: kept in localStorage, and saved to the `carts` table once you are signed in */
(function () {
  'use strict';
  var cfg = window.AKWETE_CONFIG || {};
  var configured = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !/YOUR_/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));
  var sb = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  var KEY = 'akwete_bag_v1';
  var AK = { sb: sb, configured: configured, user: null };
  window.AK = AK;

  AK.naira = function (n) { return '\u20A6' + Number(n).toLocaleString('en-NG'); };
  AK.notify = function (msg) { if (window.__toast) window.__toast(msg); else alert(msg); };

  /* ---------- bag ---------- */
  function clean(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 20).map(function (b) {
      return {
        slug: b.slug || null, custom: !!b.custom, piece: b.piece || null,
        name: String(b.name || '').slice(0, 80), detail: String(b.detail || '').slice(0, 200),
        price: Number(b.price) || 0, qty: Math.max(1, Math.min(10, parseInt(b.qty, 10) || 1))
      };
    });
  }
  var keyOf = function (b) { return b.custom ? 'c|' + b.piece + '|' + b.detail : 'p|' + b.slug + '|' + b.detail; };

  AK.getBag = function () {
    try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return []; }
  };
  function store(items, sync) {
    localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new Event('bagchange'));
    if (sync) queuePush();
  }
  AK.setBag = function (items) { store(clean(items), true); };
  AK.addItem = function (item) {
    var bag = AK.getBag(), k = keyOf(item), hit = bag.find(function (b) { return keyOf(b) === k; });
    if (hit) hit.qty = Math.min(10, hit.qty + 1); else bag.push(Object.assign({}, item, { qty: 1 }));
    AK.setBag(bag);
  };
  AK.removeAt = function (i) { var b = AK.getBag(); b.splice(i, 1); AK.setBag(b); };
  AK.clearBag = function () { AK.setBag([]); };
  AK.count = function () { return AK.getBag().reduce(function (s, b) { return s + b.qty; }, 0); };
  AK.total = function () { return AK.getBag().reduce(function (s, b) { return s + b.price * b.qty; }, 0); };

  var pushT;
  function queuePush() {
    if (!sb || !AK.user) return;
    clearTimeout(pushT);
    pushT = setTimeout(function () {
      sb.from('carts').upsert({ user_id: AK.user.id, items: AK.getBag(), updated_at: new Date().toISOString() })
        .then(function (r) { if (r.error) console.warn('Cart save failed:', r.error.message); });
    }, 500);
  }
  function pullCart() {
    if (!sb || !AK.user) return;
    sb.from('carts').select('items').eq('user_id', AK.user.id).maybeSingle().then(function (r) {
      if (r.error) return console.warn('Cart load failed:', r.error.message);
      var merged = clean(r.data && r.data.items);
      AK.getBag().forEach(function (l) {
        var hit = merged.find(function (m) { return keyOf(m) === keyOf(l); });
        if (hit) hit.qty = Math.max(hit.qty, l.qty); else merged.push(l);
      });
      store(clean(merged), true);
    });
  }

  /* ---------- auth ---------- */
  AK.ready = sb
    ? sb.auth.getSession().then(function (r) { AK.user = r.data.session ? r.data.session.user : null; paint(); if (AK.user) pullCart(); })
    : Promise.resolve();

  if (sb) {
    sb.auth.onAuthStateChange(function (event, session) {
      AK.user = session ? session.user : null;
      paint();
      window.dispatchEvent(new Event('authchange'));
      // do not call Supabase inside this callback; defer it
      if (event === 'SIGNED_IN') setTimeout(pullCart, 0);
    });
  }

  AK.signIn = function () {
    if (!sb) { AK.notify('Add your Supabase keys in js/config.js to turn on Google sign-in.'); return Promise.resolve(); }
    return sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } }
    }).then(function (r) { if (r.error) AK.notify(r.error.message); });
  };
  AK.signOut = function () {
    return (sb ? sb.auth.signOut() : Promise.resolve()).then(function () { AK.user = null; paint(); window.dispatchEvent(new Event('authchange')); });
  };
  AK.firstName = function () {
    var u = AK.user; if (!u) return '';
    var n = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email || '';
    return n.split(/[ @]/)[0];
  };

  function paint() {
    document.querySelectorAll('[data-auth]').forEach(function (el) {
      el.textContent = AK.user ? 'Hi, ' + AK.firstName() : 'Sign in';
      el.title = AK.user ? 'View your orders' : 'Sign in with Google';
    });
    document.querySelectorAll('[data-bag-count]').forEach(function (el) { el.textContent = AK.count(); });
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-auth]');
    if (!el) return;
    if (AK.user) location.href = 'orders.html'; else AK.signIn();
  });
  window.addEventListener('bagchange', paint);
  document.addEventListener('DOMContentLoaded', paint);
})();
