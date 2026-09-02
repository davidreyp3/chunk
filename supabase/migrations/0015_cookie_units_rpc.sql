-- Cookie units per channel, aggregated in the database.
--
-- The analysis overview was pulling every row of v_cookie_daily — 14,628 rows
-- for a twelve-month range, 15 pages at roughly 2.5s each because every page
-- re-computes the view — and using the lot to produce a single total. That made
-- the default range take minutes, and since the page renders no tab until the
-- overview resolves, it blocked all seven of them.
--
-- Same shape as the other analysis functions: aggregate here, return a dozen
-- rows, let the caller apply the channel filter.

drop function if exists cookie_units_by_channel(date, date, integer);

create or replace function cookie_units_by_channel(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, channel text, counts_as_retail boolean, units numeric)
language sql stable as $$
  select c.location_id, c.channel, c.counts_as_retail, sum(c.units)
  from v_cookie_daily c
  where c.business_date between p_from and p_to
    and (p_loc is null or c.location_id = p_loc)
  group by 1, 2, 3;
$$;
