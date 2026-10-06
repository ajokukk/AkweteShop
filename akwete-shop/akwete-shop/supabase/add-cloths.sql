-- Run this once in Supabase > SQL Editor if you already ran schema.sql earlier.
-- It adds the four wrapper products so checkout accepts them.
-- The prices here are samples. Change them to your real prices (and the same numbers in index.html).
insert into public.products (slug, name, kind, price_ngn) values
  ('moss-cloth',  'The Moss Stripe Wrapper',   'Wrapper', 85000),
  ('cream-cloth', 'The Cream Diamond Wrapper', 'Wrapper', 95000),
  ('ember-cloth', 'The Ember Wrapper',          'Wrapper', 110000),
  ('plum-cloth',  'The Plum Border Wrapper',    'Wrapper', 90000)
on conflict (slug) do update
  set name = excluded.name, kind = excluded.kind, price_ngn = excluded.price_ngn;
