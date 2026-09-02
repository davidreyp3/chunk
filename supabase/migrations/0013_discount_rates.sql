-- Group discounts by the rate actually charged, not by the label.
--
-- The label is unreliable: at Tocumen the 25% staff discount is rung on a
-- generic percentage key that leaves desc_descuento empty, so only 41 of 5,600
-- orders carry the "Descuento Empleados" name. The rate, by contrast, is exact
-- — 99.6% of unlabelled Tocumen discounts are precisely 25%.
--
-- The rate is taken per ORDER, from subtotal minus total. Per line it would be
-- wrong: 25% off one cookie inside a Caja de 5 makes the line look 9% off, and
-- the same discount would then scatter across half a dozen buckets. subtotal
-- already includes paid modifiers, and no order in the data has total above
-- subtotal, so the pair is a trustworthy before-and-after.
--
-- Names are still collected, so a rate can show which reasons were recorded
-- against it — that is how "Descuento Empleados" and the unlabelled 25% are
-- seen to be one and the same thing.

drop function if exists discount_rates(date, date, integer);

create or replace function discount_rates(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, year_month date, pct int,
               orders bigint, gross numeric, given numeric, names text)
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
  labelled as (
    select p.location_id, p.year_month, p.pct,
           string_agg(distinct nullif(btrim(l.discount_name), ''), ', ') as names
    from per_order p
    join order_lines l
      on l.location_id = p.location_id and l.invu_order_id = p.invu_order_id
    where nullif(btrim(coalesce(l.discount_name, '')), '') is not null
    group by 1, 2, 3
  )
  select p.location_id, p.year_month, p.pct,
         count(*)::bigint,
         sum(p.subtotal),
         sum(p.subtotal - p.total),
         coalesce(max(lb.names), '')
  from per_order p
  left join labelled lb
    on lb.location_id = p.location_id
   and lb.year_month = p.year_month
   and lb.pct = p.pct
  group by 1, 2, 3;
$$;
