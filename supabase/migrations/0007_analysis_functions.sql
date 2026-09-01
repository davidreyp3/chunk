-- Aggregation for the analysis tabs, done in Postgres.
-- Paging raw rows through PostgREST is far too slow for these: the product mix
-- alone would be ~90k rows over a year. Each function returns a few hundred.

-- Cookie formats — single vs caja de 5 vs caja de 10.
-- `format` is appended, not inserted: CREATE OR REPLACE VIEW can add a trailing
-- column but cannot reorder or rename existing ones.
create or replace view v_cookie_daily as
select location_id, business_date, channel, counts_as_retail, flavour, tier,
       sum(units) as units, format
from v_cookie_units
group by location_id, business_date, channel, counts_as_retail, flavour, tier, format;

-- Signatures change as columns are added, and CREATE OR REPLACE cannot alter a
-- function's return type — so drop first. Safe to re-run at any time.
drop function if exists hours_profile(date, date, integer);
drop function if exists tips_summary(date, date, integer);
drop function if exists product_mix(date, date, integer);
drop function if exists wholesale_clients(date, date, integer);
drop function if exists wholesale_trend(date, date, integer);
drop function if exists modifier_mix(date, date, integer);
drop function if exists line_addons(date, date, integer);

-- Transactions and revenue by weekday and hour, plus how many days each
-- weekday actually traded, so the caller can average honestly.
create or replace function hours_profile(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, dow smallint, hour_of_day smallint,
               orders bigint, revenue numeric, days bigint)
language sql stable as $$
  select o.location_id, o.dow, o.hour_of_day,
         count(*)::bigint,
         sum(o.total),
         count(distinct o.business_date)::bigint
  from v_orders o
  where o.business_date between p_from and p_to
    and o.counts_as_retail
    and (p_loc is null or o.location_id = p_loc)
  group by 1, 2, 3;
$$;

-- Tips by month and by cashier. Tips go to staff and are never revenue.
create or replace function tips_summary(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, year_month date, cashier text,
               tips numeric, revenue numeric, orders bigint)
language sql stable as $$
  select o.location_id,
         date_trunc('month', o.business_date)::date,
         coalesce(nullif(btrim(o.cashier), ''), 'Unattributed'),
         sum(o.tip), sum(o.total), count(*)::bigint
  from v_orders o
  where o.business_date between p_from and p_to
    and o.counts_as_retail
    and (p_loc is null or o.location_id = p_loc)
  group by 1, 2, 3;
$$;

-- Wholesale by account. "Cafe Unido" is eight separate companies.
create or replace function wholesale_clients(p_from date, p_to date, p_loc int default null)
returns table (client text, order_type text, orders bigint, revenue numeric,
               first_order date, last_order date)
language sql stable as $$
  select coalesce(nullif(btrim(o.client_name), ''), o.order_type_name, 'Unnamed'),
         o.order_type_name,
         count(*)::bigint, sum(o.total),
         min(o.business_date), max(o.business_date)
  from v_orders o
  where o.business_date between p_from and p_to
    and o.channel = 'wholesale'
    and (p_loc is null or o.location_id = p_loc)
  group by 1, 2;
$$;

-- Monthly revenue and orders per client, for the trend line.
create or replace function wholesale_trend(p_from date, p_to date, p_loc int default null)
returns table (client text, year_month date, revenue numeric, orders bigint)
language sql stable as $$
  select coalesce(nullif(btrim(o.client_name), ''), o.order_type_name, 'Unnamed'),
         date_trunc('month', o.business_date)::date,
         sum(o.total), count(*)::bigint
  from v_orders o
  where o.business_date between p_from and p_to
    and o.channel = 'wholesale'
    and (p_loc is null or o.location_id = p_loc)
  group by 1, 2;
$$;

-- Modifier mix: how coffee and ice cream are actually configured.
-- Coffee modifiers are size / milk / syrup; ice cream modifiers are toppings;
-- cookie modifiers are the flavours inside a caja.
create or replace function modifier_mix(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, category text, product_name text,
               modifier text, paid boolean, units numeric, lines bigint)
language sql stable as $$
  select l.location_id, l.category, l.product_name, m.name,
         coalesce(m.total, 0) > 0,
         sum(m.qty), count(*)::bigint
  from line_modifiers m
  join order_lines l
    on l.location_id = m.location_id
   and l.invu_order_id = m.invu_order_id
   and l.invu_line_id = m.invu_line_id
  join v_orders o
    on o.location_id = l.location_id and o.invu_order_id = l.invu_order_id
  where o.business_date between p_from and p_to
    and coalesce(l.status, '') <> 'Devuelto NC'
    and (p_loc is null or l.location_id = p_loc)
  group by 1, 2, 3, 4, 5;
$$;

-- Per line: did it carry a paid add-on? A modifier with a price is a topping or
-- an extra; free modifiers are choices like milk or size.
create or replace function line_addons(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, category text, product_name text,
               with_addon boolean, lines bigint, units numeric, revenue numeric)
language sql stable as $$
  with per_line as (
    select l.location_id, l.category, l.product_name, l.qty,
           l.qty * coalesce(l.unit_price, 0) as line_revenue,
           coalesce(bool_or(coalesce(m.total, 0) > 0), false) as with_addon
    from order_lines l
    join v_orders o
      on o.location_id = l.location_id and o.invu_order_id = l.invu_order_id
    left join line_modifiers m
      on m.location_id = l.location_id
     and m.invu_order_id = l.invu_order_id
     and m.invu_line_id = l.invu_line_id
    where o.business_date between p_from and p_to
      and coalesce(l.status, '') <> 'Devuelto NC'
      and (p_loc is null or l.location_id = p_loc)
    group by l.location_id, l.category, l.product_name, l.qty, l.unit_price,
             l.invu_order_id, l.invu_line_id
  )
  select location_id, category, product_name, with_addon,
         count(*)::bigint, sum(qty), sum(line_revenue)
  from per_line
  group by 1, 2, 3, 4;
$$;

-- ---------------------------------------------------------------------------
-- Menu grouping. INVU's categories don't match how the menu is actually
-- thought about: hot chocolate, chai and tea sit in BEBIDAS next to bottled
-- Coke. This groups them the way the business does. It is a plain column —
-- correct any row by hand and nothing else needs changing.
-- ---------------------------------------------------------------------------
alter table products add column if not exists menu_group text;

update products set menu_group = case
  when kind in ('cookie', 'box', 'mini', 'wholesale', 'combo', 'icecream') then kind
  when product_name ilike '%extra%' and coalesce(kind, '') = 'coffee'      then 'addon'
  -- made to order, behind the counter
  when kind = 'coffee'                                                      then 'prepared_drink'
  when product_name ilike '%hot chocolate%'
    or product_name ilike '%chai%'
    or product_name ilike '%infusi%'
    or product_name ilike '%t_/infusi%'
    or product_name ilike 'vaso de leche%'                                  then 'prepared_drink'
  -- bottled and canned, out of the fridge
  when kind = 'beverage'                                                    then 'fridge_drink'
  -- packaged goods
  when product_name ilike 'bolsa%' or product_name ilike 'capsulas%'
    or product_name ilike 'vela%'  or product_name ilike 'sticker%'         then 'retail_goods'
  else coalesce(kind, 'other')
end;

-- Product mix now carries the menu group.
create or replace function product_mix(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, product_name text, kind text, menu_group text,
               tier text, box_size smallint, channel text, counts_as_retail boolean,
               units numeric, revenue numeric)
language sql stable as $$
  select l.location_id, l.product_name, p.kind, p.menu_group, p.tier, p.box_size,
         o.channel, o.counts_as_retail,
         sum(l.qty), sum(l.qty * coalesce(l.unit_price, 0))
  from order_lines l
  join v_orders o
    on o.location_id = l.location_id and o.invu_order_id = l.invu_order_id
  left join products p
    on p.location_id = l.location_id and p.product_code = l.product_code
  where o.business_date between p_from and p_to
    and coalesce(l.status, '') <> 'Devuelto NC'
    and (p_loc is null or l.location_id = p_loc)
  group by 1, 2, 3, 4, 5, 6, 7, 8;
$$;
