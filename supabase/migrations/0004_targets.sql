-- Monthly revenue target: $75,000 combined, across all channels.
-- Split by each store's share of recent trading (Tocumen ~73%, Sunset ~27%).
--
-- Starts two months back on purpose: Postgres `current_date` is UTC, and Panama
-- is UTC-5, so late at night the server has already rolled to the next month
-- while the business day has not. Seeding from behind covers that gap.
insert into targets (location_id, year_month, revenue_target)
select loc.id, m::date, loc.target
from (values (1, 55000), (2, 20000)) as loc(id, target)
cross join generate_series(
  date_trunc('month', current_date) - interval '2 months',
  date_trunc('month', current_date) + interval '12 months',
  interval '1 month'
) as m
on conflict (location_id, year_month) do update
  set revenue_target = excluded.revenue_target;
