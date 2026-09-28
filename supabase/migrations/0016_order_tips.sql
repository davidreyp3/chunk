-- Tips, with the method they were paid by.
--
-- Vale assembles this by hand every day from two INVU reports: "por tipo de
-- pago" for the sales, and "propina por orden" for the tips, adding each tip to
-- the takings of the method it came in on. Until now we stored only
-- orders.tip — one number per order, with no method — so the second half of
-- that job could not be reproduced.
--
-- INVU does carry the method on every tip (propinas[].metodoPago /
-- .tipoPago), so this keeps the whole row: manual tips and the automatic 10%
-- servicio are told apart, which matters if the two are ever settled
-- differently.

create table if not exists order_tips (
  location_id   smallint not null references locations(id),
  invu_order_id text     not null,
  invu_tip_id   text     not null,
  amount        numeric(12,2),
  method        text,          -- EFECTIVO, CREDITO ...
  pay_type      text,          -- "Efectivo", "Tarjeta De Credito" ...
  tip_kind      text,          -- "10% Servicio", "Error Tipo" ...
  automatic     boolean,
  is_service    boolean,
  is_donation   boolean,
  primary key (location_id, invu_order_id, invu_tip_id)
);
create index if not exists order_tips_order_idx on order_tips (location_id, invu_order_id);

alter table order_tips enable row level security;

-- Backfill from the raw payloads already held (a 45-day rolling buffer), so no
-- extra load on INVU. Older tips keep showing as a total via orders.tip, just
-- without the split.
insert into order_tips (location_id, invu_order_id, invu_tip_id, amount, method,
                        pay_type, tip_kind, automatic, is_service, is_donation)
select r.location_id,
       r.invu_order_id,
       t->>'id',
       nullif(t->>'monto', '')::numeric,
       upper(nullif(t->>'metodoPago', '')),
       nullif(t->>'tipoPago', ''),
       nullif(t->>'descTipo', ''),
       (t->>'automatica') = 'Automatica',
       coalesce((t->>'is_service')::boolean, false),
       coalesce((t->>'is_donation')::boolean, false)
from raw_orders r
cross join lateral jsonb_array_elements(r.payload->'propinas') t
where jsonb_typeof(r.payload->'propinas') = 'array'
  and nullif(t->>'id', '') is not null
on conflict (location_id, invu_order_id, invu_tip_id) do nothing;

-- The daily close, by payment type, with tips folded in.
--
-- Cash sales are DERIVED, never summed: INVU records a cash payment as the
-- amount the customer handed over, so a $5 sale paid with a $20 note is stored
-- as $20. Card and the rest are exact, so cash is the order total less
-- everything else. Verified on September 2026: 364 orders were "overpaid" by
-- $3,516 in total, none of it matching a tip.
drop function if exists payment_mix_daily(date, date, integer);

create or replace function payment_mix_daily(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, business_date date, method text, pay_type text,
               ventas numeric, propina numeric)
language sql stable as $$
  with ord as (
    select o.location_id, o.business_date, o.invu_order_id, o.total
    from v_orders o
    where o.business_date between p_from and p_to
      and (p_loc is null or o.location_id = p_loc)
  ),
  noncash as (
    select p.location_id, o.business_date, p.method, p.pay_type, sum(p.amount) as amt
    from payments p
    join ord o on o.location_id = p.location_id and o.invu_order_id = p.invu_order_id
    where coalesce(p.method, '') <> 'EFECTIVO'
    group by 1, 2, 3, 4
  ),
  cash as (
    select t.location_id, t.business_date, 'EFECTIVO'::text as method,
           'Efectivo'::text as pay_type,
           t.total - coalesce(n.amt, 0) as amt
    from (select location_id, business_date, sum(total) as total from ord group by 1, 2) t
    left join (select location_id, business_date, sum(amt) as amt from noncash group by 1, 2) n
      on n.location_id = t.location_id and n.business_date = t.business_date
  ),
  sales as (
    select * from noncash
    union all
    select * from cash
  ),
  tips as (
    select tp.location_id, o.business_date, tp.method, tp.pay_type, sum(tp.amount) as amt
    from order_tips tp
    join ord o on o.location_id = tp.location_id and o.invu_order_id = tp.invu_order_id
    group by 1, 2, 3, 4
  )
  select coalesce(s.location_id, t.location_id),
         coalesce(s.business_date, t.business_date),
         coalesce(s.method, t.method),
         coalesce(s.pay_type, t.pay_type),
         coalesce(s.amt, 0),
         coalesce(t.amt, 0)
  from sales s
  full join tips t
    on t.location_id = s.location_id
   and t.business_date = s.business_date
   and t.method = s.method
   and coalesce(t.pay_type, '') = coalesce(s.pay_type, '')
  where coalesce(s.amt, 0) <> 0 or coalesce(t.amt, 0) <> 0;
$$;

-- How much of a day's tips we can still split by method. Before the backfill
-- window the total is known from orders.tip but the split is not, and the
-- screen has to say so rather than quietly showing less.
drop function if exists tip_coverage_daily(date, date, integer);

create or replace function tip_coverage_daily(p_from date, p_to date, p_loc int default null)
returns table (location_id smallint, business_date date,
               tips_total numeric, tips_split numeric)
language sql stable as $$
  select o.location_id, o.business_date,
         sum(coalesce(o.tip, 0)),
         coalesce(sum((select sum(t.amount) from order_tips t
                        where t.location_id = o.location_id
                          and t.invu_order_id = o.invu_order_id)), 0)
  from v_orders o
  where o.business_date between p_from and p_to
    and (p_loc is null or o.location_id = p_loc)
  group by 1, 2;
$$;
