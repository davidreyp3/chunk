import { NextResponse } from 'next/server';
import { select, rpc } from '@/lib/db';
import { businessToday } from '@/lib/panama';
import { refreshToday } from '@/lib/refresh';
import { resolveFlavour } from '@/lib/normalize';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALL_CHANNELS = ['walk_in', 'marketplace', 'clau', 'wholesale', 'eventos', 'unclassified'];
/** Wholesale and events are invoiced and lumpy — including them skews average
 *  ticket badly, so the UI warns when they're switched on. */
const SKEWS_TICKET = new Set(['wholesale', 'eventos']);

/** Tocumen opened here — volume roughly tripled, so any range spanning this
 *  date is comparing two different businesses. */
const TOCUMEN_OPENED = '2025-11-01';

type Daily = {
  location_id: number; business_date: string; channel: string;
  counts_as_retail: boolean; orders: number; revenue: string;
};
type CookieDay = {
  location_id: number; business_date: string; channel: string;
  counts_as_retail: boolean; flavour: string; tier: string | null; units: string;
};

const json = (body: any) =>
  NextResponse.json(body, { status: 200, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = url.searchParams.get('to') || businessToday();
  const from = url.searchParams.get('from') || '2024-10-01';
  const loc = url.searchParams.get('location');
  const locId = loc && loc !== 'all' ? Number(loc) : null;
  const locFilter = locId ? `&location_id=eq.${locId}` : '';
  const section = url.searchParams.get('section') || 'overview';
  const param = url.searchParams.get('channels');
  const selected = new Set(param !== null
    ? param.split(',').filter(Boolean)
    : ALL_CHANNELS);

  // Nothing else pulls from INVU. Without this the Analysis page showed
  // whatever the TV board last happened to fetch, which is hours old if nobody
  // had the board open. Only when the range actually reaches today; refreshToday
  // self-throttles to 90s, so this is cheap.
  if (to >= businessToday()) {
    try { await refreshToday(); } catch { /* stale beats broken */ }
  }

  const P = { p_from: from, p_to: to, p_loc: locId };

  // Tabs that are answered entirely by a database function.
  try {
    if (section === 'hours') {
      return json({ hours: await rpc('hours_profile', P) });
    }
    if (section === 'tips') {
      return json({ tips: await rpc('tips_summary', P) });
    }
    if (section === 'product') {
      const [products, modifiers, addons] = await Promise.all([
        rpc('product_mix', P), rpc('modifier_mix', P), rpc('line_addons', P),
      ]);
      return json({ products, modifiers, addons });
    }
    if (section === 'channels') {
      const [clients, trend, daily] = await Promise.all([
        rpc('wholesale_clients', P),
        rpc('wholesale_trend', P),
        select<Daily>('v_daily_sales?select=location_id,business_date,channel,orders,revenue'
          + `&business_date=gte.${from}&business_date=lte.${to}${locFilter}`),
      ]);
      return json({ clients, trend, daily });
    }
    if (section === 'discounts') {
      const [discounts, totals, products, locs] = await Promise.all([
        rpc('discount_mix', P), rpc('order_counts', P), rpc('discount_products', P),
        select<any>('locations?select=id,name&order=id'),
      ]);
      return json({ discounts, totals, products, locations: locs });
    }
    if (section === 'stores') {
      const [products, dailyRows] = await Promise.all([
        rpc('product_mix', { p_from: from, p_to: to, p_loc: null }),
        select<Daily>('v_daily_sales?select=location_id,business_date,channel,counts_as_retail,orders,revenue'
          + `&business_date=gte.${from}&business_date=lte.${to}`),
      ]);
      const locs = await select<any>('locations?select=id,name,code&order=id');
      return json({ products, daily: dailyRows, locations: locs });
    }
  } catch (e: any) {
    return json({ error: `Database: ${e.message}`.slice(0, 300) });
  }

  let daily: Daily[], cookies: CookieDay[], flavourMonths: any[], calendar: any[], locations: any[];
  try {
    [daily, cookies, flavourMonths, calendar, locations] = await Promise.all([
      select<Daily>('v_daily_sales?select=location_id,business_date,channel,counts_as_retail,orders,revenue'
        + `&business_date=gte.${from}&business_date=lte.${to}${locFilter}`),
      select<CookieDay>('v_cookie_daily?select=location_id,business_date,channel,counts_as_retail,flavour,tier,units'
        + `&business_date=gte.${from}&business_date=lte.${to}${locFilter}`),
      select<any>(`v_flavour_monthly?select=month,flavour,units${locFilter ? locFilter.replace('&', '&') : ''}`),
      select<any>('flavour_calendar?select=flavour,year_month&role=eq.monthly_special'),
      select<any>('locations?select=id,name,code&order=id'),
    ]);
  } catch (e: any) {
    return NextResponse.json({ error: `Database: ${e.message}`.slice(0, 300) },
      { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  const n = (v: any) => Number(v || 0);
  const inSelection = (r: { channel: string }) => selected.has(r.channel);

  // ---- headline numbers over the selected channels ----
  const rows = daily.filter(inSelection);
  const revenue = rows.reduce((s, r) => s + n(r.revenue), 0);
  const orders = rows.reduce((s, r) => s + n(r.orders), 0);
  const cookieUnits = cookies.filter(inSelection).reduce((s, r) => s + n(r.units), 0);

  // Every channel present in the range, so the filter chips can show what each
  // is worth even while it's switched off.
  const byChannel: Record<string, { revenue: number; orders: number }> = {};
  for (const r of daily) {
    const c = (byChannel[r.channel] ??= { revenue: 0, orders: 0 });
    c.revenue += n(r.revenue);
    c.orders += n(r.orders);
  }

  const perLoc = new Map<number, { revenue: number; orders: number }>();
  for (const r of rows) {
    const cur = perLoc.get(r.location_id) ?? { revenue: 0, orders: 0 };
    cur.revenue += n(r.revenue);
    cur.orders += n(r.orders);
    perLoc.set(r.location_id, cur);
  }

  // ---- revenue over time, stacked by channel ----
  const spanDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const byMonth = spanDays > 92;
  const series = new Map<string, Record<string, number>>();
  for (const r of daily) {
    if (!inSelection(r)) continue;
    const k = byMonth ? r.business_date.slice(0, 7) : r.business_date;
    if (!series.has(k)) series.set(k, {});
    const row = series.get(k)!;
    row[r.channel] = (row[r.channel] || 0) + n(r.revenue);
  }
  const timeline = [...series.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, channels]) => ({
      period,
      channels,
      total: Object.values(channels).reduce((a, b) => a + b, 0),
    }));

  // ---- the flavour programme ----
  const specialFor = new Map<string, string>();
  for (const c of calendar) specialFor.set(String(c.year_month).slice(0, 7), c.flavour);

  const monthTotals = new Map<string, number>();
  const monthFlavour = new Map<string, Map<string, number>>();
  for (const r of flavourMonths) {
    const m = String(r.month).slice(0, 7);
    monthTotals.set(m, (monthTotals.get(m) || 0) + n(r.units));
    if (!monthFlavour.has(m)) monthFlavour.set(m, new Map());
    const t = monthFlavour.get(m)!;
    t.set(r.flavour, (t.get(r.flavour) || 0) + n(r.units));
  }
  const months = [...monthTotals.keys()].sort();
  const thisMonth = businessToday().slice(0, 7);

  const specials = months
    .filter((m) => specialFor.has(m))
    .map((m) => {
      const sold = monthFlavour.get(m);
      const flavour = resolveFlavour(specialFor.get(m)!, sold?.keys() ?? []);
      const units = sold?.get(flavour) ?? 0;
      const total = monthTotals.get(m) || 1;
      const prevMonth = months[months.indexOf(m) - 1];
      const prevTotal = prevMonth ? monthTotals.get(prevMonth) ?? 0 : 0;
      return {
        month: m,
        flavour,
        units,
        share: (units / total) * 100,
        totalCookies: total,
        // Did the category grow that month, or did the special just take share?
        // A partial current month against a full previous one is meaningless.
        categoryGrowth: prevTotal && m !== thisMonth ? ((total - prevTotal) / prevTotal) * 100 : null,
        preTocumen: m < TOCUMEN_OPENED.slice(0, 7),
        current: m === thisMonth,
      };
    })
    .filter((s) => s.units > 0 || s.current);

  // Permanent menu: present in most months, for comparison against the specials.
  const presence = new Map<string, number>();
  for (const m of months) {
    for (const [f, u] of monthFlavour.get(m) ?? []) {
      if ((u / (monthTotals.get(m) || 1)) * 100 >= 1) presence.set(f, (presence.get(f) || 0) + 1);
    }
  }
  const permanent = [...presence.entries()]
    .filter(([, count]) => count >= months.length * 0.6)
    .map(([flavour]) => {
      const shares = months
        .map((m) => ((monthFlavour.get(m)?.get(flavour) ?? 0) / (monthTotals.get(m) || 1)) * 100)
        .filter((v) => v >= 0.5);
      return { flavour, share: shares.reduce((a, b) => a + b, 0) / (shares.length || 1) };
    })
    .sort((a, b) => b.share - a.share);

  return NextResponse.json({
    range: { from, to, days: spanDays, grouping: byMonth ? 'month' : 'day' },
    crossesTocumenOpening: from < TOCUMEN_OPENED && to >= TOCUMEN_OPENED,
    tocumenOpened: TOCUMEN_OPENED,
    locations,
    location: locId ?? 'all',
    channels: { selected: [...selected], all: ALL_CHANNELS, byChannel,
                skewsTicket: [...selected].filter((c) => SKEWS_TICKET.has(c)) },
    kpis: {
      revenue,
      orders,
      cookieUnits,
      avgTicket: orders ? revenue / orders : 0,
      byLocation: locations.map((l: any) => {
        const v = perLoc.get(l.id);
        return {
          id: l.id, name: l.name,
          revenue: v?.revenue ?? 0,
          orders: v?.orders ?? 0,
          avgTicket: v?.orders ? v.revenue / v.orders : 0,
        };
      }),
    },
    timeline,
    specials: specials.slice().sort((a, b) => b.share - a.share),
    permanent,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
