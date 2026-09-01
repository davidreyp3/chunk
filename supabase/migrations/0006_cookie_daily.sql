-- Daily cookie units. v_cookie_units is one row per line and per modifier, which
-- is far too many to page through for a date range; this collapses it to a day.
create or replace view v_cookie_daily as
select location_id, business_date, channel, counts_as_retail, flavour, tier,
       sum(units) as units
from v_cookie_units
group by location_id, business_date, channel, counts_as_retail, flavour, tier;
