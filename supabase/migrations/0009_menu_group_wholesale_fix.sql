-- "Oatmeal Chai Walnut Cookie 100 g" matched an ilike '%chai%' rule and was
-- filed as a prepared drink. Category is the reliable signal here, and
-- 'POR MAYOR' has no accented characters to trip over.
with cat as (
  select distinct on (location_id, product_code)
         location_id, product_code, category
  from order_lines
  where product_code is not null
  order by location_id, product_code, invu_order_id desc
)
update products p
set menu_group = 'wholesale', kind = 'wholesale'
from cat c
where c.location_id = p.location_id
  and c.product_code = p.product_code
  and c.category = 'POR MAYOR'
  and p.menu_group is distinct from 'wholesale';

-- Only the actual drink should match on "chai".
update products
set menu_group = 'prepared_drink'
where product_name ilike 'chai latte%'
  and menu_group is distinct from 'prepared_drink';
