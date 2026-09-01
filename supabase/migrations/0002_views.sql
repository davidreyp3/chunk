-- Chunk dashboard — product classification and reporting views

-- ---------- 1. Retire the config-era E-commerce order type ----------
insert into order_type_channel (location_id, tipo_orden, order_type_name, channel, counts_as_retail, active)
values (2, 10, 'E-commerce', 'walk_in', true, false)
on conflict (location_id, tipo_orden) do update
  set channel = 'walk_in', counts_as_retail = true, active = false;

update orders set channel = 'walk_in' where channel = 'unclassified' and tipo_orden = 10;

-- ---------- 2. Classify products from what actually sold ----------
-- Derived from observed lines so it stays true to each licence's own naming.
-- Editable afterwards: this is a table, not a view.
insert into products (location_id, product_code, product_name, canonical_name, kind, tier, box_size, is_cookie)
select distinct on (l.location_id, l.product_code)
  l.location_id,
  l.product_code,
  l.product_name,
  btrim(regexp_replace(regexp_replace(l.product_name, '\s*Cookie\s*$', ''), '^Mini\s+', '')),
  case
    when l.product_name ilike 'Caja de%'            then 'box'
    when l.category      = 'POR MAYOR'              then 'wholesale'
    when l.category      = 'MINI COOKIES'
         and l.product_name ilike 'Mini%'           then 'mini'
    when l.category in ('COOKIES','PREMIUM COOKIES') then 'cookie'
    when l.category      = 'COMBOS'                 then 'combo'
    when l.category      = 'CAFÉ'                   then 'coffee'
    when l.category      = 'BEBIDAS'                then 'beverage'
    when l.category      = 'HELADO'                 then 'icecream'
    else 'other'
  end,
  case
    when l.category = 'PREMIUM COOKIES' then 'premium'
    when l.category in ('COOKIES') and l.unit_price >= case when l.location_id = 1 then 5.5 else 4.5 end
      then 'premium'
    when l.category in ('COOKIES') then 'normal'
    else null
  end,
  case
    when l.product_name ilike 'Caja de 10%' then 10
    when l.product_name ilike 'Caja de 5%'  then 5
    else null
  end,
  l.category in ('COOKIES','PREMIUM COOKIES') and l.product_name not ilike 'Caja de%'
from order_lines l
where l.product_code is not null and l.product_name is not null
order by l.location_id, l.product_code, l.invu_order_id desc
on conflict (location_id, product_code) do nothing;

-- ---------- 3. The flavour list (drives every flavour view) ----------
insert into flavours (name, tier, permanent)
select canonical_name, max(tier), false
from products where kind = 'cookie' and canonical_name is not null
group by canonical_name
on conflict (name) do nothing;

-- Flavours only ever seen inside a caja (modifier names) get added too.
insert into flavours (name, tier, permanent)
select distinct btrim(regexp_replace(m.name, '\s*Cookie\s*$', '')), null, false
from line_modifiers m
where m.name ilike '%Cookie'
on conflict (name) do nothing;

-- ---------- 4. Views ----------
create or replace view v_orders as
select o.*, coalesce(c.counts_as_retail, false) as counts_as_retail
from orders o
left join order_type_channel c
  on c.location_id = o.location_id and c.tipo_orden = o.tipo_orden
where o.status <> 'Nota Credito';

-- Canonical cookie units: singles count directly, boxes resolve through modifiers.
-- Matching modifiers against the flavour list is what makes a 6-modifier caja safe.
create or replace view v_cookie_units as
  select l.location_id, o.business_date, o.channel, o.counts_as_retail,
         p.canonical_name as flavour, p.tier, l.qty as units, 'single' as format
  from order_lines l
  join v_orders o
    on o.location_id = l.location_id and o.invu_order_id = l.invu_order_id
  join products p on p.location_id = l.location_id and p.product_code = l.product_code
  where p.kind = 'cookie' and coalesce(l.status,'') <> 'Devuelto NC'
union all
  select m.location_id, o.business_date, o.channel, o.counts_as_retail,
         f.name, f.tier, m.qty, 'caja' || coalesce(p.box_size, 0)
  from line_modifiers m
  join order_lines l
    on l.location_id = m.location_id and l.invu_order_id = m.invu_order_id
   and l.invu_line_id = m.invu_line_id
  join v_orders o
    on o.location_id = m.location_id and o.invu_order_id = m.invu_order_id
  join products p on p.location_id = l.location_id and p.product_code = l.product_code
  join flavours f on f.name = btrim(regexp_replace(m.name, '\s*Cookie\s*$', ''))
  where p.kind = 'box' and coalesce(l.status,'') <> 'Devuelto NC';

create or replace view v_daily_sales as
select location_id, business_date, channel, counts_as_retail,
       count(*) as orders, sum(total) as revenue, avg(total) as avg_ticket
from v_orders group by 1,2,3,4;

create or replace view v_hourly_sales as
select location_id, business_date, dow, hour_of_day,
       count(*) as orders, sum(total) as revenue
from v_orders where counts_as_retail group by 1,2,3,4;

create or replace view v_flavour_monthly as
with base as (
  select location_id,
         date_trunc('month', business_date)::date as month,
         flavour, tier, units
  from v_cookie_units
  where counts_as_retail
), agg as (
  select location_id, month, flavour, tier, sum(units) as units
  from base
  group by location_id, month, flavour, tier
)
select location_id, month, flavour, tier, units,
       round(100 * units / nullif(sum(units) over (partition by location_id, month), 0), 2)
         as pct_of_cookies
from agg;

create or replace view v_product_monthly as
select l.location_id, date_trunc('month', o.business_date)::date as month,
       p.kind, p.tier, l.product_name,
       sum(l.qty) as units, sum(l.qty * l.unit_price) as revenue
from order_lines l
join v_orders o
  on o.location_id = l.location_id and o.invu_order_id = l.invu_order_id
left join products p on p.location_id = l.location_id and p.product_code = l.product_code
where coalesce(l.status,'') <> 'Devuelto NC'
group by 1,2,3,4,5;
