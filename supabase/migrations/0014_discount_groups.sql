-- Group discounts by whichever field is actually reliable for that discount.
--
-- Neither field works alone:
--
--   * The NAME is missing for Tocumen's staff discount. It is rung on a generic
--     percentage key, so only 41 of ~5,620 orders carry "Descuento Empleados"
--     and the rest carry nothing.
--   * The RATE is meaningless for the 2x1 promo. One free cookie in a basket of
--     varying size lands on a different order-level percentage every time, so
--     grouping by rate scattered a single promotion across 44 buckets from 9%
--     to 53%.
--
-- So: use the name when the till recorded one, and fall back to the rate when
-- it did not. That keeps 2x1 Banco General whole and still collects the
-- unlabelled staff discount into one row.
--
-- The rate is taken per ORDER (subtotal minus total). Per line it would be
-- wrong: 25% off one cookie inside a Caja de 5 makes the line read 9% off.

drop function if exists discount_groups(date, date, integer);

create or replace function discount_groups(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, year_month date,
               discount_name text, pct int, named boolean,
               orders bigint, gross numeric, given numeric)
language sql stable as $$
  with per_order as (
    select o.location_id,
           date_trunc('month', o.business_date)::date as year_month,
           o.invu_order_id,
           o.subtotal,
           o.total,
           round(((o.subtotal - o.total) / nullif(o.subtotal, 0)) * 100)::int as pct
    from v_orders o
    where o.business_date between p_from and p_to
      and (p_loc is null or o.location_id = p_loc)
      and o.subtotal - o.total > 0.01
      and o.subtotal > 0
  ),
  names as (
    -- One label per order. An order carrying two different named discounts is
    -- rare enough to bucket honestly as "Mixed" rather than pick a winner.
    select p.location_id, p.invu_order_id,
           case count(distinct nm)
             when 0 then null
             when 1 then min(nm)
             else 'Mixed'
           end as discount_name
    from per_order p
    left join lateral (
      select nullif(btrim(coalesce(l.discount_name, '')), '') as nm
      from order_lines l
      where l.location_id = p.location_id
        and l.invu_order_id = p.invu_order_id
    ) l2 on true
    group by 1, 2
  )
  select p.location_id, p.year_month,
         coalesce(n.discount_name, p.pct || '% off') as discount_name,
         p.pct,
         n.discount_name is not null as named,
         count(*)::bigint,
         sum(p.subtotal),
         sum(p.subtotal - p.total)
  from per_order p
  left join names n
    on n.location_id = p.location_id and n.invu_order_id = p.invu_order_id
  group by 1, 2, 3, 4, 5;
$$;
