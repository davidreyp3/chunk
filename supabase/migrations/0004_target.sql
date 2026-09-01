-- Monthly revenue target for the "Mes vs meta" panel.
-- Covers all channels (retail + wholesale + eventos), which is how a monthly
-- goal is normally set. Edit the number, or add rows for future months.
insert into targets (location_id, year_month, revenue_target) values
  (1, date_trunc('month', current_date)::date, 50000),
  (2, date_trunc('month', current_date)::date, 20000)
on conflict (location_id, year_month) do update
  set revenue_target = excluded.revenue_target;
