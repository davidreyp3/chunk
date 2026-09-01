-- Reclassify products without relying on accented string literals.
-- The previous pass compared category to 'CAFÉ' and silently matched nothing,
-- because the é can be stored composed or decomposed. LIKE 'CAF%' avoids it.

with cat as (
  select distinct on (location_id, product_code)
         location_id, product_code, category, product_name
  from order_lines
  where product_code is not null
  order by location_id, product_code, invu_order_id desc
)
update products p set
  kind = case
    when c.category like 'CAF%'                        then 'coffee'
    when p.product_name ilike 'croissant%'
      or p.product_name ilike 'empanada%'              then 'bakery'
    when p.product_name ilike 'delivery%'              then 'service'
    else p.kind
  end,
  menu_group = case
    -- add-ons priced separately: the $1 "Extra" and the 20g topping pots
    when p.product_name = 'Extra'
      or p.product_name ilike '% 20g'                  then 'addon'
    -- made to order behind the counter
    when c.category like 'CAF%'                        then 'prepared_drink'
    when p.product_name ilike '%hot chocolate%'
      or p.product_name ilike '%chai%'
      or p.product_name ilike '%infusi%'
      or p.product_name ilike 'vaso de leche%'         then 'prepared_drink'
    -- savoury, added at Tocumen
    when p.product_name ilike 'croissant%'
      or p.product_name ilike 'empanada%'              then 'bakery'
    -- not a product at all
    when p.product_name ilike 'delivery%'
      or p.product_name = 'Otros'                      then 'service'
    else p.menu_group
  end
from cat c
where c.location_id = p.location_id and c.product_code = p.product_code;

-- Anything still unclassified keeps a sensible bucket rather than NULL.
update products set menu_group = coalesce(menu_group, kind, 'other')
where menu_group is null;
