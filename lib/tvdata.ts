import { select } from './db';
import { businessToday, priorSameWeekdays } from './panama';

export type OrderRow = {
  location_id: number; hour_of_day: number; total: string | number;
  channel: string; status: string | null; business_date: string;
};
export type FlavourMonth = {
  location_id: number; month: string; flavour: string;
  units: string | number; pct_of_cookies: string | number;
};

export const RETAIL = new Set(['walk_in', 'marketplace', 'clau']);
export const live = (r: { status: string | null }) => r.status !== 'Nota Credito';
export const retail = (r: OrderRow) => live(r) && RETAIL.has(r.channel);

const monthOf = (d: string) => d.slice(0, 7);
const shift = (ym: string, back: number) => {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 - back, 1));
  return t.toISOString().slice(0, 7);
};

/**
 * Which flavour is this month's special?
 * INVU doesn't record it, so infer: a flavour selling meaningfully now that was
 * absent for the previous three months. Beats hardcoding a calendar that rots.
 */
export function inferMonthlySpecial(rows: FlavourMonth[], ym: string) {
  const byMonth = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = monthOf(r.month);
    if (!byMonth.has(m)) byMonth.set(m, new Map());
    const t = byMonth.get(m)!;
    t.set(r.flavour, (t.get(r.flavour) || 0) + Number(r.units));
  }
  const share = (m: string) => {
    const t = byMonth.get(m);
    if (!t) return new Map<string, number>();
    const tot = [...t.values()].reduce((a, b) => a + b, 0) || 1;
    return new Map([...t].map(([k, v]) => [k, (100 * v) / tot]));
  };

  const now = share(ym);
  const before = [1, 2, 3].map((i) => share(shift(ym, i)));
  let best: { flavour: string; pct: number } | null = null;
  for (const [f, pct] of now) {
    if (pct < 1) continue;
    if (before.some((b) => (b.get(f) ?? 0) > 0.5)) continue;
    if (!best || pct > best.pct) best = { flavour: f, pct };
  }

  // How past specials performed, for context alongside the current one.
  const months = [...byMonth.keys()].sort();
  const seen = new Map<string, number>();
  for (let i = 0; i < months.length; i++) {
    // Months 0-2 have no run-up to compare against, so every permanent flavour
    // would look "new" there. Skip them or Chocolate Chip reads as a special.
    if (i < 3) continue;
    const m = months[i], s = share(m);
    const prior = months.slice(i - 3, i).map(share);
    for (const [f, pct] of s) {
      if (pct < 1 || m === ym) continue;
      if (prior.some((b) => (b.get(f) ?? 0) > 0.5)) continue;
      seen.set(f, Math.max(seen.get(f) ?? 0, pct));
    }
  }
  const past = [...seen.entries()].map(([flavour, pct]) => ({ flavour, pct }))
    .sort((a, b) => b.pct - a.pct);

  return {
    current: best,
    monthShare: best ? best.pct : null,
    pastAverage: past.length ? past.reduce((s, p) => s + p.pct, 0) / past.length : null,
    pastBest: past[0] ?? null,
  };
}

export async function loadTv() {
  const today = businessToday();
  const ym = monthOf(today);
  const priors = priorSameWeekdays(today, 4);

  const [locations, todayRows, priorRows, cookiesToday, flavourMonths, monthRows, targets, calendar, ticker] =
    await Promise.all([
      select<{ id: number; name: string; code: string; opened_on: string | null }>(
        'locations?select=id,name,code,opened_on&order=id'),
      select<OrderRow>(`orders?select=location_id,hour_of_day,total,channel,status,business_date&business_date=eq.${today}`),
      select<OrderRow>(`orders?select=location_id,hour_of_day,total,channel,status,business_date&business_date=in.(${priors.join(',')})`),
      select<{ location_id: number; flavour: string; units: string | number; counts_as_retail: boolean }>(
        `v_cookie_units?select=location_id,flavour,units,counts_as_retail&business_date=eq.${today}`),
      select<FlavourMonth>('v_flavour_monthly?select=location_id,month,flavour,units,pct_of_cookies'),
      select<OrderRow>(`orders?select=location_id,total,channel,status,business_date&business_date=gte.${ym}-01`),
      select<{ location_id: number; year_month: string; revenue_target: string }>(
        `targets?select=location_id,year_month,revenue_target&year_month=eq.${ym}-01`),
      select<{ flavour: string }>(
        `flavour_calendar?select=flavour&role=eq.monthly_special&year_month=eq.${ym}-01`),
      select<{ closed_at: string; channel: string; total: string; location_id: number;
               order_lines: { product_name: string; qty: number }[] }>(
        `orders?select=closed_at,channel,total,location_id,order_lines(product_name,qty)` +
        `&business_date=eq.${today}&order=closed_at.desc`).then((r) => r.slice(0, 14)),
    ]);

  return { today, ym, priors, locations, todayRows, priorRows, cookiesToday, flavourMonths, monthRows, targets, calendar, ticker };
}
