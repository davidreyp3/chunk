import { NextResponse } from 'next/server';
import { refreshToday } from '@/lib/refresh';
import { loadTv, inferMonthlySpecial, retail, live, type OrderRow } from '@/lib/tvdata';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const REQUIRED = [
  'SUPABASE_URL', 'SUPABASE_SECRET_KEY',
  'INVU_TOCUMEN_USER', 'INVU_TOCUMEN_PASS',
  'INVU_SUNSET_USER', 'INVU_SUNSET_PASS',
] as const;

const json = (body: any) =>
  NextResponse.json(body, { status: 200, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: Request) {
  // A wall display should say WHY it's blank, not just go dark.
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) return json({ error: `Missing environment variables: ${missing.join(', ')}` });

  const backfill = new URL(req.url).searchParams.get('backfill') === '1';
  let refresh: any = null;
  try { refresh = await refreshToday(backfill); } catch (e: any) { refresh = { error: e.message }; }

  let d: Awaited<ReturnType<typeof loadTv>>;
  try { d = await loadTv(); }
  catch (e: any) { return json({ error: `Database: ${e.message}`.slice(0, 300) }); }

  const sum = (rows: OrderRow[]) => rows.reduce((s, r) => s + Number(r.total || 0), 0);

  const locations = d.locations.map((l) => {
    const open = !!l.opened_on && l.opened_on <= d.today;
    const mine = d.todayRows.filter((r) => r.location_id === l.id && retail(r));
    const revenue = sum(mine);
    const perPrior = d.priors.map((day) =>
      sum(d.priorRows.filter((r) => r.business_date === day && r.location_id === l.id && retail(r))));
    const seen = perPrior.filter((v) => v > 0);
    const typical = seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : 0;
    return {
      id: l.id, name: l.name, code: l.code, open,
      revenue, orders: mine.length,
      avgTicket: mine.length ? revenue / mine.length : 0,
      typical, deltaPct: typical ? ((revenue - typical) / typical) * 100 : null,
    };
  });

  // Transactions per hour — today against the same weekday's recent average.
  const hours = Array.from({ length: 18 }, (_, i) => i + 5).map((h) => {
    const today = d.todayRows.filter((r) => retail(r) && r.hour_of_day === h).length;
    const perDay = d.priors.map((day) =>
      d.priorRows.filter((r) => r.business_date === day && retail(r) && r.hour_of_day === h).length);
    const seen = perDay.filter((v) => v > 0);
    return { hour: h, today, typical: seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : 0 };
  });

  const flavourToday = new Map<string, number>();
  let cookieUnits = 0;
  for (const c of d.cookiesToday) {
    if (!c.counts_as_retail) continue;
    const u = Number(c.units || 0);
    flavourToday.set(c.flavour, (flavourToday.get(c.flavour) || 0) + u);
    cookieUnits += u;
  }
  const special = inferMonthlySpecial(d.flavourMonths, d.ym);
  const topFlavours = [...flavourToday.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, units]) => ({
      name, units,
      pct: cookieUnits ? (units / cookieUnits) * 100 : 0,
      isSpecial: name === special.current?.flavour,
    }));

  // Month vs target uses ALL channels — a monthly goal includes wholesale.
  const monthLive = d.monthRows.filter(live);
  const mtd = sum(monthLive);
  const target = d.targets.reduce((s, t) => s + Number(t.revenue_target || 0), 0) || null;
  const daysInMonth = new Date(Number(d.ym.slice(0, 4)), Number(d.ym.slice(5, 7)), 0).getDate();
  const dayOfMonth = Number(d.today.slice(8, 10));

  const ticker = d.ticker.map((o) => {
    const items = (o.order_lines || []).filter((l) => l.product_name);
    const first = items[0];
    const extra = items.length > 1 ? ` +${items.length - 1}` : '';
    const loc = d.locations.find((l) => l.id === o.location_id)?.name ?? '';
    const chan = o.channel === 'walk_in' ? '' : ` · ${o.channel}`;
    return {
      // PostgREST returns timestamptz in UTC — render it in Panama time.
      time: new Date(o.closed_at).toLocaleTimeString('es-PA',
        { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Panama' }),
      detail: `${loc}${chan} · ${first ? first.product_name : 'venta'}${extra}`,
      amount: Number(o.total || 0),
    };
  });

  return json({
    day: d.today,
    updatedAt: new Date().toISOString(),
    refresh,
    total: {
      revenue: locations.reduce((s, l) => s + l.revenue, 0),
      typical: locations.reduce((s, l) => s + l.typical, 0),
      get deltaPct() {
        return this.typical ? ((this.revenue - this.typical) / this.typical) * 100 : null;
      },
    },
    locations,
    hours,
    cookieUnits,
    topFlavours,
    special: {
      flavour: special.current?.flavour ?? null,
      unitsToday: special.current ? flavourToday.get(special.current.flavour) ?? 0 : 0,
      pctToday: special.current && cookieUnits
        ? ((flavourToday.get(special.current.flavour) ?? 0) / cookieUnits) * 100 : 0,
      monthShare: special.monthShare,
      pastAverage: special.pastAverage,
      pastBest: special.pastBest,
    },
    month: { mtd, target, dayOfMonth, daysInMonth },
    ticker,
  });
}
