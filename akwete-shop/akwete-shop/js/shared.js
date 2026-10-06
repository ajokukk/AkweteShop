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
  var SYNCED = 'akwete_synced_user', DIRTY = 'akwete_bag_unsaved', lastLocal = 0, lastPull = 0, chan = null, chanUid = null;
  function store(items, sync) {
    localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new Event('bagchange'));
    if (sync) { lastLocal = Date.now(); if (AK.user) { try { localStorage.setItem(DIRTY, '1'); } catch (e) {} } queuePush(); }
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

  /* Bag sync. The bag is one row per person in the `carts` table, shared with the mobile app.
     - every change is saved locally, then pushed (after a short pause)
     - first sign-in on this browser MERGES the local bag with the saved one; after that the saved bag wins
     - the saved bag is re-read when you return to the tab, and live through Realtime when it is enabled */
  var pushT = null, recent = [];
  function pushNow(items) {
    if (!sb || !AK.user) return;
    recent.push(JSON.stringify(items)); if (recent.length > 8) recent.shift();
    sb.from('carts').upsert({ user_id: AK.user.id, items: items, updated_at: new Date().toISOString() })
      .then(function (r) {
        if (r.error) return console.warn('Cart save failed:', r.error.message);
        // clear the "unsaved" marker only if nothing newer was added while this save was travelling
        if (JSON.stringify(AK.getBag()) === JSON.stringify(items)) { try { localStorage.removeItem(DIRTY); } catch (e) {} }
      });
  }
  function queuePush() {
    if (!sb || !AK.user) return;
    clearTimeout(pushT);
    pushT = setTimeout(function () { pushT = null; pushNow(AK.getBag()); }, 500);
  }
  function mergeBags(remote, local) {
    var merged = remote.slice();
    local.forEach(function (l) {
      var hit = merged.find(function (m) { return keyOf(m) === keyOf(l); });
      if (hit) hit.qty = Math.max(hit.qty, l.qty); else merged.push(l);
    });
    return clean(merged);
  }
  function pullCart() {
    if (!sb || !AK.user) return;
    if (pushT || Date.now() - lastLocal < 1200) return;   // a change of ours is on its way; do not overwrite it
    lastPull = Date.now();
    var uid = AK.user.id, seen = false, unsaved = false;
    try { seen = localStorage.getItem(SYNCED) === uid; unsaved = localStorage.getItem(DIRTY) === '1'; } catch (e) {}
    // A change made on this device never reached the server (for example you moved to another page within half a second).
    // It is newer than anything saved, so save it now instead of overwriting it.
    if (seen && unsaved) { pushNow(AK.getBag()); return; }
    sb.from('carts').select('items').eq('user_id', uid).maybeSingle().then(function (r) {
      if (r.error) return console.warn('Cart load failed:', r.error.message);
      var local = AK.getBag(), remote = clean(r.data && r.data.items), next;
      if (!r.data) next = seen ? [] : local;              // saved bag was removed (for example after an order elsewhere)
      else next = seen ? remote : mergeBags(remote, local);
      if (JSON.stringify(next) !== JSON.stringify(local)) store(next, false);
      if ((!r.data && next.length) || (r.data && JSON.stringify(next) !== JSON.stringify(remote))) pushNow(next);
      try { localStorage.setItem(SYNCED, uid); } catch (e) {}
    });
  }
  function unsubscribeCart() {
    if (chan && sb) { try { sb.removeChannel(chan); } catch (e) {} }
    chan = null; chanUid = null;
  }
  function subscribeCart() {
    if (!sb || !AK.user || !sb.channel) return;
    if (chan && chanUid === AK.user.id) return;
    unsubscribeCart();
    var uid = AK.user.id;
    try {
      chan = sb.channel('cart-' + uid).on('postgres_changes',
        { event: '*', schema: 'public', table: 'carts', filter: 'user_id=eq.' + uid },
        function (p) {
          if (pushT) return;                               // we have a newer change waiting to be saved
          var next = p.eventType === 'DELETE' ? [] : clean(p.new && p.new.items);
          var json = JSON.stringify(next);
          if (p.eventType !== 'DELETE' && recent.indexOf(json) > -1) return;   // that is just our own save coming back
          if (json !== JSON.stringify(AK.getBag())) store(next, false);
        }).subscribe();
      chanUid = uid;
    } catch (e) { chan = null; }
  }
  function onReturn() { if (!document.hidden && Date.now() - lastPull > 2000) pullCart(); }
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('focus', onReturn);

  /* ---------- confirmation email ---------- */
  // Calls the send-order-email function. Resolves to { ok, reason } and never throws.
  AK.sendConfirmation = function (orderId) {
    if (!sb) return Promise.resolve({ ok: false, reason: 'not configured' });
    return sb.functions.invoke('send-order-email', { body: { order_id: orderId, lang: window.AKI ? window.AKI.lang : 'en' } })
      .then(function (r) {
        if (!r.error) return { ok: true, reason: '' };
        var ctx = r.error.context, status = ctx && ctx.status ? ctx.status : '';
        var read = ctx && typeof ctx.json === 'function' ? ctx.json().catch(function () { return {}; }) : Promise.resolve({});
        return read.then(function (b) {
          var reason = (status ? status + ' ' : '') + ((b && (b.error || b.message)) || r.error.message || 'unknown error') + (b && b.detail ? ' (' + b.detail + ')' : '');
          console.warn('Confirmation email failed:', reason);
          return { ok: false, reason: reason };
        });
      })
      .catch(function (e) { console.warn('Confirmation email failed:', e); return { ok: false, reason: String(e && e.message || e) }; });
  };

  /* ---------- auth ---------- */
  AK.ready = sb
    ? sb.auth.getSession().then(function (r) { AK.user = r.data.session ? r.data.session.user : null; paint(); if (AK.user) { pullCart(); subscribeCart(); } })
    : Promise.resolve();

  if (sb) {
    sb.auth.onAuthStateChange(function (event, session) {
      AK.user = session ? session.user : null;
      paint();
      window.dispatchEvent(new Event('authchange'));
      // do not call Supabase inside this callback; defer it
      if (event === 'SIGNED_OUT') { try { localStorage.removeItem(SYNCED); localStorage.removeItem(DIRTY); } catch (e) {} unsubscribeCart(); }
      if (event === 'SIGNED_IN') setTimeout(function () { pullCart(); subscribeCart(); }, 0);
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
    return (sb ? sb.auth.signOut() : Promise.resolve()).then(function () { try { localStorage.removeItem(SYNCED); localStorage.removeItem(DIRTY); } catch (e) {} unsubscribeCart(); AK.user = null; paint(); window.dispatchEvent(new Event('authchange')); });
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
