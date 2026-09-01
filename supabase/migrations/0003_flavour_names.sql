-- Normalise flavour names so the same cookie can never appear twice.
-- Sunset typed two specials as "... Cookie (Galleta del Mes)", which split
-- S'mores and Pumpkin Spice into two flavours each.

create or replace function chunk_canon(txt text) returns text
language sql immutable as $$
  select btrim(
           regexp_replace(
             regexp_replace(
               regexp_replace(coalesce(txt, ''), '\s*\(\s*Galleta del Mes\s*\)\s*', ' ', 'gi'),
             '^\s*Mini\s+', '', 'i'),
           '\s*Cookie\s*$', '', 'i')
         );
$$;

-- Re-derive canonical names for every cookie and mini
update products
   set canonical_name = chunk_canon(product_name)
 where kind in ('cookie', 'mini');

-- Drop the split duplicates, then re-seed from the corrected products
delete from flavours where name ilike '%Galleta del Mes%';

insert into flavours (name, tier)
select canonical_name, max(tier)
from products where kind = 'cookie' and canonical_name <> ''
group by canonical_name
on conflict (name) do nothing;

insert into flavours (name, tier)
select distinct chunk_canon(m.name), null
from line_modifiers m
where m.name ilike '%Cookie%' and chunk_canon(m.name) <> ''
on conflict (name) do nothing;

-- A flavour is premium if it is premium anywhere (Tocumen tiers by price,
-- Sunset by category — same cookie, two encodings).
update flavours f set tier = 'premium'
 where exists (select 1 from products p
                where p.canonical_name = f.name and p.tier = 'premium');

-- Rebuild the view to canonicalise modifier names through the same function
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
  join flavours f on f.name = chunk_canon(m.name)
  where p.kind = 'box' and coalesce(l.status,'') <> 'Devuelto NC';
