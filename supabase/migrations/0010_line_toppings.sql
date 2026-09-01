-- A line-level topping flag.
--
-- line_addons only knew whether a line carried any priced modifier. On a
-- Chunk Combo that is usually a premium cookie upgrade, not a topping, and
-- counting topping modifiers in the browser double-counts a line that took
-- two of them. Postgres is the only place that can answer "did this line
-- carry a topping" once per line, so it answers it here.
--
-- A modifier whose name ends in "Cookie" is the cookie that goes in; anything
-- else with a price is a topping or a sauce.

drop function if exists line_addons(date, date, integer);

create or replace function line_addons(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, category text, product_name text,
               with_addon boolean, with_topping boolean,
               lines bigint, units numeric, revenue numeric)
language sql stable as $$
  with per_line as (
    select l.location_id, l.category, l.product_name, l.qty,
           l.qty * coalesce(l.unit_price, 0) as line_revenue,
           coalesce(bool_or(coalesce(m.total, 0) > 0), false) as with_addon,
           coalesce(bool_or(coalesce(m.total, 0) > 0
                            and m.name !~* 'cookie[[:space:]]*$'), false) as with_topping
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
  select location_id, category, product_name, with_addon, with_topping,
         count(*)::bigint, sum(qty), sum(line_revenue)
  from per_line
  group by 1, 2, 3, 4, 5;
$$;
