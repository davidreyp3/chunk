import { NextResponse } from 'next/server';
import { select } from '@/lib/db';
import { refreshToday } from '@/lib/refresh';
import { businessToday, priorSameWeekdays } from '@/lib/panama';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type OrderRow = {
  location_id: number; hour_of_day: number; total: string | number;
  channel: string; status: string | null; business_date: string;
};

const RETAIL = new Set(['walk_in', 'marketplace', 'clau']);

export async function GET(req: Request) {
  const backfill = new URL(req.url).searchParams.get('backfill') === '1';

  let refresh: any = null;
  try {
    refresh = await refreshToday(backfill);
  } catch (e: any) {
    refresh = { error: e.message };   // stale data beats a blank wall display
  }

  const today = businessToday();
  const priors = priorSameWeekdays(today, 4);

  const [locations, todayRows, priorRows, cookies] = await Promise.all([
    select<{ id: number; name: string }>('locations?select=id,name&active=is.true&order=id'),
    select<OrderRow>(`orders?select=location_id,hour_of_day,total,channel,status,business_date&business_date=eq.${today}`),
    select<OrderRow>(`orders?select=location_id,hour_of_day,total,channel,status,business_date&business_date=in.(${priors.join(',')})`),
    select<{ location_id: number; flavour: string; units: string | number; counts_as_retail: boolean }>(
      `v_cookie_units?select=location_id,flavour,units,counts_as_retail&business_date=eq.${today}`),
  ]);

  const live = (r: OrderRow) => r.status !== 'Nota Credito';
  const retail = (r: OrderRow) => live(r) && RETAIL.has(r.channel);

  const byLoc = locations.map((l) => {
    const mine = todayRows.filter((r) => r.location_id === l.id && retail(r));
    const revenue = mine.reduce((s, r) => s + Number(r.total || 0), 0);
    const priorDays = priors.map((d) =>
      priorRows.filter((r) => r.business_date === d && r.location_id === l.id && retail(r))
               .reduce((s, r) => s + Number(r.total || 0), 0));
    const seen = priorDays.filter((v) => v > 0);
    const typical = seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : 0;
    return {
      id: l.id, name: l.name, revenue, orders: mine.length,
      avgTicket: mine.length ? revenue / mine.length : 0,
      typical, deltaPct: typical ? ((revenue - typical) / typical) * 100 : null,
    };
  });

  const hours = Array.from({ length: 24 }, (_, h) => {
    const t = todayRows.filter((r) => retail(r) && r.hour_of_day === h)
                       .reduce((s, r) => s + Number(r.total || 0), 0);
    const perDay = priors.map((d) =>
      priorRows.filter((r) => r.business_date === d && retail(r) && r.hour_of_day === h)
               .reduce((s, r) => s + Number(r.total || 0), 0));
    const seen = perDay.filter((v) => v > 0);
    return { hour: h, today: t, typical: seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : 0 };
  });

  const flavourTotals = new Map<string, number>();
  let cookieUnits = 0;
  for (const c of cookies) {
    if (!c.counts_as_retail) continue;
    const u = Number(c.units || 0);
    flavourTotals.set(c.flavour, (flavourTotals.get(c.flavour) || 0) + u);
    cookieUnits += u;
  }
  const topFlavours = [...flavourTotals.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, units]) => ({ name, units, pct: cookieUnits ? (units / cookieUnits) * 100 : 0 }));

  const nonRetail = todayRows.filter((r) => live(r) && !RETAIL.has(r.channel))
                             .reduce((s, r) => s + Number(r.total || 0), 0);

  const totalRevenue = byLoc.reduce((s, l) => s + l.revenue, 0);
  const totalTypical = byLoc.reduce((s, l) => s + l.typical, 0);

  return NextResponse.json(
    {
      day: today,
      updatedAt: new Date().toISOString(),
      refresh,
      total: {
        revenue: totalRevenue,
        typical: totalTypical,
        deltaPct: totalTypical ? ((totalRevenue - totalTypical) / totalTypical) * 100 : null,
        orders: byLoc.reduce((s, l) => s + l.orders, 0),
        avgTicket: byLoc.reduce((s, l) => s + l.orders, 0)
          ? totalRevenue / byLoc.reduce((s, l) => s + l.orders, 0) : 0,
      },
      locations: byLoc,
      hours,
      cookieUnits,
      topFlavours,
      nonRetail,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
