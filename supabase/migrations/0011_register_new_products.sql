-- Register new products and flavours automatically.
--
-- products and flavours were filled once, by insert statements in migrations
-- 0002 and 0003. Nothing has filled them since, so anything added to the INVU
-- menu afterwards has been invisible: its lines carry a product_code that
-- joins to no product row, so it drops out of every view built on that join.
--
-- Tiramisù, the September 2026 special, is the first flavour to land after
-- those migrations ran, and it is why the flavour card reads zero. Left alone
-- this would repeat for every monthly special from here on, so the fix is to
-- make registration continuous rather than to add Tiramisù by hand.
--
-- The classification below is migrations 0002, 0007, 0008 and 0009 folded
-- into one function. Editing it here is what changes how new products land.

create or replace function chunk_register_products() returns void
language plpgsql as $$
begin
  -- 1. Any product_code that has sold but was never registered. The most
  --    recent line wins, so a renamed product keeps its current name.
  insert into products (location_id, product_code, product_name, canonical_name,
                        kind, tier, box_size, is_cookie, menu_group)
  select distinct on (l.location_id, l.product_code)
    l.location_id,
    l.product_code,
    l.product_name,
    chunk_canon(l.product_name),
    case
      when l.product_name ilike 'Caja de%'              then 'box'
      when l.category      = 'POR MAYOR'                then 'wholesale'
      when l.category      = 'MINI COOKIES'
           and l.product_name ilike 'Mini%'             then 'mini'
      when l.category in ('COOKIES', 'PREMIUM COOKIES') then 'cookie'
      when l.category      = 'COMBOS'                   then 'combo'
      when l.category like 'CAF%'                       then 'coffee'
      when l.category      = 'BEBIDAS'                  then 'beverage'
      when l.category      = 'HELADO'                   then 'icecream'
      when l.product_name ilike 'croissant%'
        or l.product_name ilike 'empanada%'             then 'bakery'
      when l.product_name ilike 'delivery%'             then 'service'
      else 'other'
    end,
    case
      when l.category = 'PREMIUM COOKIES' then 'premium'
      when l.category = 'COOKIES'
       and l.unit_price >= case when l.location_id = 1 then 5.5 else 4.5 end then 'premium'
      when l.category = 'COOKIES' then 'normal'
      else null
    end,
    case
      when l.product_name ilike 'Caja de 10%' then 10
      when l.product_name ilike 'Caja de 5%'  then 5
      else null
    end,
    l.category in ('COOKIES', 'PREMIUM COOKIES') and l.product_name not ilike 'Caja de%',
    case
      -- priced separately rather than sold on their own
      when l.product_name = 'Extra' or l.product_name ilike '% 20g'  then 'addon'
      -- not a product at all
      when l.product_name ilike 'delivery%'
        or l.product_name = 'Otros'                                  then 'service'
      when l.product_name ilike 'Caja de%'                           then 'box'
      when l.category      = 'POR MAYOR'                             then 'wholesale'
      when l.category      = 'MINI COOKIES'
           and l.product_name ilike 'Mini%'                          then 'mini'
      when l.category in ('COOKIES', 'PREMIUM COOKIES')              then 'cookie'
      when l.category      = 'COMBOS'                                then 'combo'
      when l.category      = 'HELADO'                                then 'icecream'
      -- made to order behind the counter. Category first: "Oatmeal Chai
      -- Walnut Cookie 100 g" is a wholesale cookie, not a chai latte.
      when l.category like 'CAF%'                                    then 'prepared_drink'
      when l.product_name ilike '%hot chocolate%'
        or l.product_name ilike 'chai latte%'
        or l.product_name ilike '%infusi%'
        or l.product_name ilike 'vaso de leche%'                     then 'prepared_drink'
      -- bottled and canned, out of the fridge
      when l.category      = 'BEBIDAS'                               then 'fridge_drink'
      when l.product_name ilike 'croissant%'
        or l.product_name ilike 'empanada%'                          then 'bakery'
      when l.product_name ilike 'bolsa%' or l.product_name ilike 'capsulas%'
        or l.product_name ilike 'vela%'  or l.product_name ilike 'sticker%' then 'retail_goods'
      else 'other'
    end
  from order_lines l
  where l.product_code is not null
    and l.product_name is not null
    and not exists (select 1 from products p
                     where p.location_id = l.location_id
                       and p.product_code = l.product_code)
  order by l.location_id, l.product_code, l.invu_order_id desc
  on conflict (location_id, product_code) do nothing;

  -- 2. New flavours sold as a single cookie.
  insert into flavours (name, tier, permanent)
  select p.canonical_name, max(p.tier), false
  from products p
  where p.kind = 'cookie'
    and coalesce(p.canonical_name, '') <> ''
  group by p.canonical_name
  on conflict (name) do nothing;

  -- 3. Flavours that only ever appear inside a caja, as a modifier name.
  --    Without this the box units for a new flavour join to nothing and
  --    vanish from v_cookie_units entirely.
  insert into flavours (name, tier, permanent)
  select distinct chunk_canon(m.name), null, false
  from line_modifiers m
  where m.name ilike '%Cookie'
    and chunk_canon(m.name) <> ''
  on conflict (name) do nothing;

  -- 4. A flavour is premium if it is premium at either store.
  update flavours f set tier = 'premium'
   where f.tier is distinct from 'premium'
     and exists (select 1 from products p
                  where p.canonical_name = f.name and p.tier = 'premium');
end;
$$;

-- Keeps the anti-join in step 1 cheap as order_lines grows.
create index if not exists order_lines_loc_code_idx
  on order_lines (location_id, product_code);

-- Fire once per ingest statement, not once per row.
create or replace function chunk_register_products_trg() returns trigger
language plpgsql as $$
begin
  perform chunk_register_products();
  return null;
end;
$$;

drop trigger if exists order_lines_register on order_lines;
create trigger order_lines_register
  after insert or update on order_lines
  for each statement execute function chunk_register_products_trg();

drop trigger if exists line_modifiers_register on line_modifiers;
create trigger line_modifiers_register
  after insert or update on line_modifiers
  for each statement execute function chunk_register_products_trg();

-- Backfill everything the one-time seeds missed.
select chunk_register_products();

-- The calendar was seeded by hand as "Tiramisu"; the POS spells it the
-- Italian way. The POS is the source of truth for how a flavour is named.
update flavour_calendar set flavour = 'Tiramisù'
 where flavour = 'Tiramisu';
