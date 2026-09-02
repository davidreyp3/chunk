-- Discounts, measured from the money rather than from the label.
--
-- order_lines.discount_value is a PERCENTAGE, not an amount — "Descuento 20%"
-- stores 20, and the 2x1 promo stores 100. Summing that column as currency
-- produces nonsense (it made the 2x1 look like $319,800 of giveaway against a
-- true $12,953).
--
-- The real cost of a line is:
--     qty * unit_price  +  its paid modifiers  -  line_total
--
-- line_total is net of the discount but inclusive of modifiers, so the
-- modifiers have to be added back before comparing. Verified against 120
-- undiscounted lines: 114 balance exactly, and the six that do not are all
-- precisely 25% off — employee discounts INVU recorded with no name. Deriving
-- from money therefore catches discounts that discount_name misses, which is
-- why the label is only used for naming, never for detection.

drop function if exists discount_mix(date, date, integer);

create or replace function discount_mix(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, year_month date, discount_name text,
               stated_pct numeric, orders bigint, lines bigint,
               units numeric, gross numeric, given numeric)
language sql stable as $$
  with mods as (
    select m.location_id, m.invu_order_id, m.invu_line_id,
           sum(coalesce(m.total, 0)) as paid
    from line_modifiers m
    group by 1, 2, 3
  ),
  per_line as (
    select l.location_id,
           date_trunc('month', o.business_date)::date as year_month,
           l.invu_order_id,
           -- A discount with no label still cost real money; say so plainly
           -- rather than dropping it or lumping it in with a named one.
           nullif(btrim(coalesce(l.discount_name, '')), '') as discount_name,
           l.discount_value as stated_pct,
           l.qty,
           l.qty * coalesce(l.unit_price, 0) + coalesce(mods.paid, 0) as gross,
           l.line_total
    from order_lines l
    join v_orders o
      on o.location_id = l.location_id and o.invu_order_id = l.invu_order_id
    left join mods
      on mods.location_id = l.location_id
     and mods.invu_order_id = l.invu_order_id
     and mods.invu_line_id = l.invu_line_id
    where o.business_date between p_from and p_to
      and coalesce(l.status, '') <> 'Devuelto NC'
      and (p_loc is null or l.location_id = p_loc)
  )
  select location_id, year_month,
         coalesce(discount_name, 'Unnamed') as discount_name,
         max(stated_pct) as stated_pct,
         count(distinct invu_order_id)::bigint as orders,
         count(*)::bigint as lines,
         sum(qty) as units,
         sum(gross) as gross,
         sum(gross - line_total) as given
  from per_line
  -- A cent of tolerance: floats, and INVU rounds to 5 decimals.
  where gross - line_total > 0.01
  group by 1, 2, 3;
$$;

-- How many orders traded at all, so "orders with a discount" has a denominator.
drop function if exists order_counts(date, date, integer);

create or replace function order_counts(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, year_month date, orders bigint, revenue numeric)
language sql stable as $$
  select o.location_id,
         date_trunc('month', o.business_date)::date,
         count(*)::bigint,
         sum(o.total)
  from v_orders o
  where o.business_date between p_from and p_to
    and (p_loc is null or o.location_id = p_loc)
  group by 1, 2;
$$;

-- Which products get discounted, so a promo can be seen in product terms.
drop function if exists discount_products(date, date, integer);

create or replace function discount_products(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, product_name text, discount_name text,
               lines bigint, units numeric, given numeric)
language sql stable as $$
  with mods as (
    select m.location_id, m.invu_order_id, m.invu_line_id,
           sum(coalesce(m.total, 0)) as paid
    from line_modifiers m
    group by 1, 2, 3
  ),
  per_line as (
    select l.location_id, l.product_name,
           coalesce(nullif(btrim(coalesce(l.discount_name, '')), ''), 'Unnamed') as discount_name,
           l.qty,
           l.qty * coalesce(l.unit_price, 0) + coalesce(mods.paid, 0) as gross,
           l.line_total
    from order_lines l
    join v_orders o
      on o.location_id = l.location_id and o.invu_order_id = l.invu_order_id
    left join mods
      on mods.location_id = l.location_id
     and mods.invu_order_id = l.invu_order_id
     and mods.invu_line_id = l.invu_line_id
    where o.business_date between p_from and p_to
      and coalesce(l.status, '') <> 'Devuelto NC'
      and (p_loc is null or l.location_id = p_loc)
  )
  select location_id, product_name, discount_name,
         count(*)::bigint, sum(qty), sum(gross - line_total)
  from per_line
  where gross - line_total > 0.01
  group by 1, 2, 3;
$$;
