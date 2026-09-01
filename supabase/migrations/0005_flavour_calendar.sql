-- The monthly special, taken from the Plan Chunk Cookie Bar 2025/2026.
-- INVU has no idea which flavour is "the" special, and inferring it from sales
-- only works once it has sold something — so on the 1st the panel had nothing
-- to show. With this it knows the flavour from day one and reports zero.
insert into flavour_calendar (flavour, year_month, role) values
  ('Raspberry White Chocolate', '2025-02-01', 'monthly_special'),
  ('Churro',                    '2025-03-01', 'monthly_special'),
  ('Key Lime Pie',              '2025-04-01', 'monthly_special'),
  ('Peanut Butter',             '2025-05-01', 'monthly_special'),
  ('Raspberry White Chocolate', '2025-06-01', 'monthly_special'),
  ('Dubai Chocolate',           '2025-08-01', 'monthly_special'),
  ('Triple Chocolate',          '2025-09-01', 'monthly_special'),
  ('Cinnamon Roll',             '2025-10-01', 'monthly_special'),
  ('Pumpkin Spice',             '2025-11-01', 'monthly_special'),
  ('S''mores',                  '2025-12-01', 'monthly_special'),
  ('Key Lime Pie',              '2026-01-01', 'monthly_special'),
  ('Red Velvet',                '2026-02-01', 'monthly_special'),
  ('Dubai Chocolate',           '2026-03-01', 'monthly_special'),
  ('Pistachio White Chocolate', '2026-04-01', 'monthly_special'),
  ('Coconut Toffee',            '2026-05-01', 'monthly_special'),
  ('Coconut Toffee',            '2026-06-01', 'monthly_special'),
  ('PB Banana Fuel',            '2026-07-01', 'monthly_special'),
  ('Biscoff',                   '2026-08-01', 'monthly_special'),
  ('Tiramisu',                  '2026-09-01', 'monthly_special'),
  ('Carrot Cake',               '2026-10-01', 'monthly_special'),
  ('Apple Pie',                 '2026-11-01', 'monthly_special')
on conflict (flavour, year_month) do update set role = excluded.role;
