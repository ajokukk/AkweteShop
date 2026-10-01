-- Akwete shop: database schema for Supabase (Postgres).
-- Run this whole file once in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

-- ---------- Products (public catalogue, also the price source of truth) ----------
create table if not exists public.products (
  slug       text primary key,
  name       text not null,
  kind       text,
  price_ngn  integer not null check (price_ngn > 0),
  active     boolean not null default true
);

insert into public.products (slug, name, kind, price_ngn) values
  ('wrap',    'The Pattern Wrap',   'Textile wrap',  68000),
  ('runner',  'The Woven Runner',   'Table textile', 45000),
  ('cushion', 'The Studio Cushion', 'Cushion cover', 32000)
on conflict (slug) do update
  set name = excluded.name, kind = excluded.kind, price_ngn = excluded.price_ngn;

-- ---------- Profiles (one row per Google user, created automatically) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Carts (the bag, saved for signed-in users) ----------
create table if not exists public.carts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  items      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- Orders + order items ----------
create table if not exists public.orders (
  id                   uuid primary key default gen_random_uuid(),
  order_number         text not null unique,
  user_id              uuid not null references auth.users (id),
  status               text not null default 'pending'
                       check (status in ('pending','confirmed','in_production','shipped','delivered','cancelled')),
  total_ngn            integer not null default 0,
  full_name            text not null,
  email                text not null,
  phone                text not null,
  address              text not null,
  city                 text not null,
  state                text not null,
  notes                text,
  confirmation_sent_at timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);

create table if not exists public.order_items (
  id             bigint generated always as identity primary key,
  order_id       uuid not null references public.orders (id) on delete cascade,
  product_slug   text not null,
  name           text not null,
  detail         text,
  is_custom      boolean not null default false,
  unit_price_ngn integer not null,
  quantity       integer not null check (quantity between 1 and 10)
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------- Row Level Security ----------
alter table public.products    enable row level security;
alter table public.profiles    enable row level security;
alter table public.carts       enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "products are public"   on public.products;
drop policy if exists "read own profile"      on public.profiles;
drop policy if exists "update own profile"    on public.profiles;
drop policy if exists "manage own cart"       on public.carts;
drop policy if exists "read own orders"       on public.orders;
drop policy if exists "read own order items"  on public.order_items;

create policy "products are public"  on public.products for select to anon, authenticated using (active);
create policy "read own profile"     on public.profiles for select to authenticated using (id = auth.uid());
create policy "update own profile"   on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "manage own cart"      on public.carts    for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read own orders"      on public.orders   for select to authenticated using (user_id = auth.uid());
create policy "read own order items" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
-- No insert/update/delete policies on orders or order_items: browsers can only
-- create orders through place_order() below, which sets the prices on the server.

-- ---------- place_order(): the only way to create an order ----------
create or replace function public.place_order(
  p_items   jsonb,
  p_name    text,
  p_email   text,
  p_phone   text,
  p_address text,
  p_city    text,
  p_state   text,
  p_notes   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_id       uuid := gen_random_uuid();
  v_number   text;
  v_total    integer := 0;
  v_item     jsonb;
  v_prod     public.products%rowtype;
  v_qty      integer;
  v_price    integer;
  v_name     text;
  v_slug     text;
  v_custom   boolean;
begin
  if v_uid is null then
    raise exception 'Sign in to place an order' using errcode = '28000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'Your bag is empty or too large';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2
     or length(trim(coalesce(p_address, ''))) < 5
     or length(trim(coalesce(p_city, ''))) < 2
     or length(trim(coalesce(p_state, ''))) < 2
     or coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or coalesce(p_phone, '') !~ '^\+?[0-9 ()-]{7,20}$' then
    raise exception 'Please check your delivery details';
  end if;

  v_number := 'AKW-' || to_char(now() at time zone 'Africa/Lagos', 'YYMMDD') || '-'
              || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));

  insert into public.orders (id, order_number, user_id, full_name, email, phone, address, city, state, notes)
  values (v_id, v_number, v_uid, trim(p_name), trim(p_email), trim(p_phone),
          trim(p_address), trim(p_city), trim(p_state), nullif(trim(coalesce(p_notes, '')), ''));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty    := greatest(1, least(10, coalesce((v_item ->> 'qty')::integer, 1)));
    v_custom := coalesce((v_item ->> 'custom')::boolean, false);
    v_slug   := case when v_custom then v_item ->> 'piece' else v_item ->> 'slug' end;

    select * into v_prod from public.products where slug = v_slug and active;
    if not found then
      raise exception 'Unknown product: %', coalesce(v_slug, '(none)');
    end if;

    if v_custom then
      -- custom pieces: base price x 1.5, rounded to the nearest 1,000 (same formula as the site)
      v_price := (round(v_prod.price_ngn * 1.5 / 1000) * 1000)::integer;
      v_name  := 'Custom ' || v_prod.slug;
    else
      v_price := v_prod.price_ngn;
      v_name  := v_prod.name;
    end if;

    insert into public.order_items (order_id, product_slug, name, detail, is_custom, unit_price_ngn, quantity)
    values (v_id, v_prod.slug, v_name, left(coalesce(v_item ->> 'detail', ''), 200), v_custom, v_price, v_qty);

    v_total := v_total + v_price * v_qty;
  end loop;

  update public.orders set total_ngn = v_total where id = v_id;

  delete from public.carts where user_id = v_uid;

  return jsonb_build_object('id', v_id, 'order_number', v_number, 'total_ngn', v_total);
end $$;

revoke all on function public.place_order(jsonb, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text, text, text, text) to authenticated;
