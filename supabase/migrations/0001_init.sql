-- Chunk dashboard — initial schema
-- Layer 1 raw · Layer 2 normalized · Layer 3 reference tables you own

-- ---------- LOCATIONS ----------
create table if not exists locations (
  id            smallint primary key,
  code          text not null unique,
  name          text not null,
  invu_username text not null,
  opened_on     date,
  active        boolean not null default true
);

insert into locations (id, code, name, invu_username, opened_on) values
  (1, 'TB.C2-60A',  'Local Tocumen', 'tocumen.api', '2025-11-01'),
  (2, 'LOCAL-107',  'Sunset',        'sunset.api',  '2024-10-01')
on conflict (id) do nothing;

-- ---------- LAYER 1: RAW (replay safety) ----------
create table if not exists raw_orders (
  location_id   smallint not null references locations(id),
  invu_order_id text     not null,
  closed_at     timestamptz,
  payload       jsonb    not null,
  fetched_at    timestamptz not null default now(),
  primary key (location_id, invu_order_id)
);
create index if not exists raw_orders_closed_idx on raw_orders (location_id, closed_at);

-- ---------- CHANNEL MAP (editable — new order types land here) ----------
create table if not exists order_type_channel (
  location_id      smallint not null references locations(id),
  tipo_orden       int      not null,
  order_type_name  text,
  channel          text     not null,
  counts_as_retail boolean  not null default true,
  active           boolean  not null default true,
  primary key (location_id, tipo_orden)
);

insert into order_type_channel (location_id, tipo_orden, order_type_name, channel, counts_as_retail, active) values
  (1,  9, 'Orden Normal',  'walk_in',     true,  true),
  (2,  9, 'Orden Normal',  'walk_in',     true,  true),
  (2, 11, 'Asap',          'marketplace', true,  true),
  (2, 17, 'Uber Eats',     'marketplace', true,  true),
  (2,  3, 'Domicilio',     'clau',        true,  true),
  (2,  2, 'Para Recoger',  'clau',        true,  true),
  (2, 12, 'Cafe Unido',    'wholesale',   false, true),
  (2, 13, 'Farmhouse',     'wholesale',   false, true),
  (2, 15, 'Kokoma',        'wholesale',   false, true),
  (2, 16, 'Barrio/bec',    'wholesale',   false, false),
  (2, 14, 'Otros/eventos', 'eventos',     false, true)
on conflict (location_id, tipo_orden) do nothing;

-- ---------- LAYER 2: NORMALIZED ----------
create table if not exists clients (
  location_id     smallint not null references locations(id),
  invu_client_id  text not null,
  ruc             text,
  name            text,
  email           text,
  address         text,
  primary key (location_id, invu_client_id)
);

create table if not exists orders (
  location_id     smallint not null references locations(id),
  invu_order_id   text not null,
  opened_at       timestamptz,
  closed_at       timestamptz not null,
  business_date   date not null,
  hour_of_day     smallint not null,
  dow             smallint not null,
  tipo_orden      int,
  order_type_name text,
  channel         text not null default 'unclassified',
  integration     text,
  invu_client_id  text,
  client_name     text,
  cashier         text,
  status          text,
  subtotal        numeric(12,2),
  total           numeric(12,2),
  tip             numeric(12,2) default 0,
  primary key (location_id, invu_order_id)
);
create index if not exists orders_date_idx    on orders (location_id, business_date);
create index if not exists orders_channel_idx on orders (location_id, channel, business_date);

create table if not exists order_lines (
  location_id    smallint not null,
  invu_order_id  text not null,
  invu_line_id   text not null,
  product_code   text,
  product_name   text,
  category       text,
  qty            numeric(10,2) not null default 1,
  unit_price     numeric(12,4),
  line_total     numeric(12,2),
  discount_name  text,
  discount_value numeric(12,2) default 0,
  status         text,
  primary key (location_id, invu_order_id, invu_line_id),
  foreign key (location_id, invu_order_id) references orders(location_id, invu_order_id) on delete cascade
);
create index if not exists lines_product_idx on order_lines (location_id, product_code);

create table if not exists line_modifiers (
  location_id   smallint not null,
  invu_order_id text not null,
  invu_line_id  text not null,
  seq           smallint not null,
  modifier_id   text,
  code          text,
  name          text,
  qty           numeric(10,2) not null default 1,
  total         numeric(12,2) default 0,
  primary key (location_id, invu_order_id, invu_line_id, seq)
);
create index if not exists modifiers_name_idx on line_modifiers (location_id, name);

create table if not exists payments (
  location_id   smallint not null,
  invu_order_id text not null,
  invu_pay_id   text not null,
  method        text,
  pay_type      text,
  amount        numeric(12,2),
  paid_at       timestamptz,
  primary key (location_id, invu_order_id, invu_pay_id)
);

-- ---------- LAYER 3: REFERENCE (owned by David & Valentina) ----------
create table if not exists products (
  location_id    smallint not null references locations(id),
  product_code   text not null,
  product_name   text,
  canonical_name text,
  kind           text,
  tier           text,
  box_size       smallint,
  is_cookie      boolean not null default false,
  grams          numeric(8,2),
  primary key (location_id, product_code)
);

create table if not exists flavours (
  name       text primary key,
  tier       text,
  first_seen date,
  permanent  boolean not null default false
);

create table if not exists flavour_calendar (
  flavour    text not null,
  year_month date not null,
  role       text not null,
  primary key (flavour, year_month)
);

create table if not exists promotions (
  id          bigserial primary key,
  name        text not null,
  starts_on   date not null,
  ends_on     date not null,
  location_id smallint references locations(id),
  notes       text
);

create table if not exists targets (
  location_id    smallint not null references locations(id),
  year_month     date not null,
  revenue_target numeric(12,2) not null,
  primary key (location_id, year_month)
);

create table if not exists channel_costs (
  channel      text primary key,
  commission_pct numeric(5,2) not null default 0
);
insert into channel_costs (channel, commission_pct) values
  ('marketplace', 0), ('walk_in', 0), ('clau', 0), ('wholesale', 0), ('eventos', 0)
on conflict (channel) do nothing;

-- ---------- SECURITY ----------
-- Sales figures are commercially sensitive. RLS on, no anon policies:
-- only the server-side secret key can read or write.
do $$
declare t text;
begin
  foreach t in array array['locations','raw_orders','order_type_channel','clients','orders',
                           'order_lines','line_modifiers','payments','products','flavours',
                           'flavour_calendar','promotions','targets','channel_costs']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
