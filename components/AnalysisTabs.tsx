'use client';

import { useEffect, useState } from 'react';

/* ---------- shared primitives ---------- */

export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export const money2 = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n: number) => Math.round(n).toLocaleString('en-US');

const card: React.CSSProperties = { background: 'var(--tv-panel)', borderRadius: 18, padding: '18px 20px' };
const cap: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '.12em',
                                   textTransform: 'uppercase', color: 'var(--tv-ink3)' };
const sub: React.CSSProperties = { fontSize: 13.5, color: 'var(--tv-ink4)', lineHeight: 1.5 };
const stack: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 };

export function Card({ title, note, children }: {
  title?: string; note?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={card}>
      {title && <div style={cap}>{title}</div>}
      {note && <div style={{ ...sub, margin: '8px 0 14px', maxWidth: '68ch' }}>{note}</div>}
      <div style={{ marginTop: title && !note ? 14 : 0 }}>{children}</div>
    </div>
  );
}

/** A labelled row with a proportional bar — used everywhere, reads fine on a phone. */
export function BarRow({ label, note, value, share, max, accent, suffix }: {
  label: string; note?: string; value: string; share: number; max: number;
  accent?: boolean; suffix?: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14.5, fontWeight: accent ? 700 : 500,
                      color: accent ? 'var(--tv-accent)' : 'var(--tv-ink)' }}>{label}</div>
        {note && <div style={{ fontSize: 12.5, color: 'var(--tv-ink4)' }}>{note}</div>}
        <div style={{ marginLeft: 'auto', fontSize: 14.5, fontWeight: 700 }}>{value}</div>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--tv-track)' }}>
        <div style={{ height: 8, borderRadius: 4, width: `${max ? (share / max) * 100 : 0}%`,
                      background: accent ? 'var(--tv-accent)' : 'var(--tv-ink2)' }} />
      </div>
      {suffix}
    </div>
  );
}

function useSection<T>(section: string, q: string) {
  const [data, setData] = useState<(T & { error?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/analysis?section=${section}&${q}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [section, q]);
  return { data, loading };
}

function Pending({ loading, error }: { loading: boolean; error?: string }) {
  if (error) return <div style={{ ...card, color: 'var(--tv-accent)' }}>{error}</div>;
  if (loading) return <div style={{ ...card, ...sub }}>Loading…</div>;
  return null;
}

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SEQ = ['#F6E6CC', '#E3C69C', '#C99C68', '#A9743F', '#7E4F26', '#351C15'];

/* ---------- hours & shifts ---------- */

type HourRow = { location_id: number; dow: number; hour_of_day: number;
                 orders: number; revenue: string; days: number };

export function HoursTab({ q, locations }: { q: string; locations: { id: number; name: string }[] }) {
  const { data, loading } = useSection<{ hours: HourRow[] }>('hours', q);
  if (!data?.hours) return <Pending loading={loading} error={data?.error} />;

  const cell = new Map<string, { orders: number; days: number }>();
  for (const r of data.hours) {
    const k = `${r.dow}:${r.hour_of_day}`;
    const c = cell.get(k) ?? { orders: 0, days: 0 };
    c.orders += Number(r.orders);
    c.days = Math.max(c.days, Number(r.days));
    cell.set(k, c);
  }
  const avg = (d: number, h: number) => {
    const c = cell.get(`${d}:${h}`);
    return c && c.days ? c.orders / c.days : 0;
  };
  const hours = Array.from({ length: 18 }, (_, i) => i + 5);
  const peak = Math.max(...hours.flatMap((h) => DOW.map((_, d) => avg(d, h))), 1);

  const all = hours.flatMap((h) => DOW.map((_, d) => ({ d, h, v: avg(d, h) })))
    .filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const busiest = all[0];
  const second = all.find((x) => x.d !== busiest?.d) ?? all[1];
  const quiet = all[all.length - 1];

  return (
    <div style={stack}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        {busiest && <Note label="Busiest hour"
          value={`${DOW[busiest.d]} ${String(busiest.h).padStart(2, '0')}:00`}
          note={`${busiest.v.toFixed(1)} transactions an hour`} />}
        {second && <Note label="Second peak"
          value={`${DOW[second.d]} ${String(second.h).padStart(2, '0')}:00`}
          note={`${second.v.toFixed(1)} an hour`} />}
        {quiet && <Note label="Quietest trading hour"
          value={`${DOW[quiet.d]} ${String(quiet.h).padStart(2, '0')}:00`}
          note={`${quiet.v.toFixed(1)} an hour — one person is enough`} />}
      </div>

      <Card title="Transactions by day and hour"
            note={<>Average per hour across the selected range. This is the shift-planning tool
                    — darker is busier.</>}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 640 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `44px repeat(${hours.length}, 1fr)`, gap: 2 }}>
              <div />
              {hours.map((h) => (
                <div key={h} style={{ fontSize: 10.5, color: 'var(--tv-ink5)', textAlign: 'center' }}>{h}</div>
              ))}
              {DOW.map((_, d) => (
                <Row key={d} d={d} hours={hours} avg={avg} peak={peak} />
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, ...sub }}>
          <span>Quiet</span>
          {SEQ.map((c) => <i key={c} style={{ width: 22, height: 9, borderRadius: 2, background: c }} />)}
          <span>Busy</span>
        </div>
      </Card>

      {locations.length > 1 && (
        <Card title="By store" note="Each store has its own rhythm — the airport follows flight banks.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {locations.map((l) => {
              const rows = data.hours.filter((r) => r.location_id === l.id);
              // Rolled up across every weekday, so the trading days add up too —
              // taking the max here would divide a whole week by one day's worth.
              const byHour = new Map<number, { o: number; d: number }>();
              for (const r of rows) {
                const c = byHour.get(r.hour_of_day) ?? { o: 0, d: 0 };
                c.o += Number(r.orders); c.d += Number(r.days);
                byHour.set(r.hour_of_day, c);
              }
              const top = [...byHour.entries()].map(([h, c]) => ({ h, v: c.d ? c.o / c.d : 0 }))
                .sort((a, b) => b.v - a.v)[0];
              const mx = Math.max(...[...byHour.values()].map((c) => (c.d ? c.o / c.d : 0)), 1);
              return (
                <div key={l.id}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{l.name}</div>
                    {top && <div style={sub}>peak {String(top.h).padStart(2, '0')}:00 · {top.v.toFixed(1)}/h</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 54 }}>
                    {hours.map((h) => {
                      const c = byHour.get(h);
                      const v = c && c.d ? c.o / c.d : 0;
                      return (
                        <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column',
                                              justifyContent: 'flex-end', height: '100%' }}>
                          <div style={{ height: `${(v / mx) * 100}%`, minHeight: v ? 2 : 0,
                                        background: 'var(--tv-ink2)', borderRadius: 3 }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ d, hours, avg, peak }: {
  d: number; hours: number[]; avg: (d: number, h: number) => number; peak: number;
}) {
  return (
    <>
      <div style={{ fontSize: 11.5, color: 'var(--tv-ink4)', display: 'flex', alignItems: 'center' }}>
        {DOW_SHORT[d]}
      </div>
      {hours.map((h) => {
        const v = avg(d, h);
        const i = v <= 0 ? -1 : Math.min(SEQ.length - 1, Math.floor((v / peak) * SEQ.length));
        return (
          <div key={h} title={`${DOW[d]} ${h}:00 — ${v.toFixed(1)}/h`}
               style={{ aspectRatio: '1.5', borderRadius: 3, minHeight: 20,
                        background: i < 0 ? 'var(--tv-track)' : SEQ[i] }} />
        );
      })}
    </>
  );
}

function Note({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={card}>
      <div style={cap}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.016em', marginTop: 6 }}>{value}</div>
      <div style={{ ...sub, marginTop: 3 }}>{note}</div>
    </div>
  );
}

/* ---------- tips ---------- */

type TipRow = { location_id: number; year_month: string; cashier: string;
                tips: string; revenue: string; orders: number };

export function TipsTab({ q, locations }: { q: string; locations: { id: number; name: string }[] }) {
  const { data, loading } = useSection<{ tips: TipRow[] }>('tips', q);
  if (!data?.tips) return <Pending loading={loading} error={data?.error} />;

  const n = (v: any) => Number(v || 0);
  const tips = data.tips.reduce((s, r) => s + n(r.tips), 0);
  const revenue = data.tips.reduce((s, r) => s + n(r.revenue), 0);

  const months = new Map<string, { tips: number; revenue: number }>();
  const cashiers = new Map<string, { tips: number; revenue: number; orders: number; loc: number }>();
  for (const r of data.tips) {
    const m = r.year_month.slice(0, 7);
    const a = months.get(m) ?? { tips: 0, revenue: 0 };
    a.tips += n(r.tips); a.revenue += n(r.revenue); months.set(m, a);
    const c = cashiers.get(r.cashier) ?? { tips: 0, revenue: 0, orders: 0, loc: r.location_id };
    c.tips += n(r.tips); c.revenue += n(r.revenue); c.orders += n(r.orders);
    cashiers.set(r.cashier, c);
  }
  const monthRows = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxTips = Math.max(...monthRows.map(([, v]) => v.tips), 1);
  const staff = [...cashiers.entries()]
    .filter(([name]) => name !== 'CAJA /' && name !== 'Unattributed')
    .sort((a, b) => b[1].tips - a[1].tips);
  const generic = cashiers.get('CAJA /');

  return (
    <div style={stack}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Note label="Tips" value={money(tips)} note="Paid out to the team in full" />
        <Note label="Tip rate" value={`${revenue ? ((tips / revenue) * 100).toFixed(2) : '0'}%`}
              note="Of retail sales" />
        <Note label="Per transaction"
              value={money2(tips / Math.max(data.tips.reduce((s, r) => s + n(r.orders), 0), 1))}
              note="Average across all orders" />
      </div>

      <Card title="Tips by month" note="Tips go to staff. They are never counted into revenue or average ticket, on any screen.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {monthRows.map(([m, v]) => (
            <BarRow key={m}
              label={new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              note={`${v.revenue ? ((v.tips / v.revenue) * 100).toFixed(2) : '0'}% of sales`}
              value={money(v.tips)} share={v.tips} max={maxTips} />
          ))}
        </div>
      </Card>

      <Card title="By cashier"
            note={<>Only Tocumen records who rang the sale. Sunset invoices through a single till
                    user, so per-person figures aren&rsquo;t available there.</>}>
        {staff.length === 0 ? (
          <div style={sub}>No per-cashier data in this range.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {staff.map(([name, v]) => (
              <BarRow key={name} label={name}
                note={`${num(v.orders)} orders · ${v.revenue ? ((v.tips / v.revenue) * 100).toFixed(2) : '0'}% tip rate`}
                value={money(v.tips)} share={v.tips} max={Math.max(...staff.map(([, s]) => s.tips), 1)} />
            ))}
          </div>
        )}
        {generic && (
          <div style={{ ...sub, marginTop: 14 }}>
            A further {money(generic.tips)} came through Sunset&rsquo;s shared till user.
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- product & mix ---------- */

type ProductRow = { location_id: number; product_name: string; kind: string | null;
                    menu_group: string | null; tier: string | null; box_size: number | null;
                    channel: string; counts_as_retail: boolean; units: string; revenue: string };
type ModRow = { location_id: number; category: string; product_name: string;
                modifier: string; paid: boolean; units: string; lines: number };
type AddonRow = { location_id: number; category: string; product_name: string;
                  with_addon: boolean; with_topping?: boolean;
                  lines: number; units: string; revenue: string };

const GROUP_LABEL: Record<string, string> = {
  cookie: 'Cookies', box: 'Boxes', mini: 'Mini cookies', combo: 'Combos',
  icecream: 'Ice cream', prepared_drink: 'Prepared drinks', fridge_drink: 'Fridge drinks',
  bakery: 'Bakery', wholesale: 'Wholesale', retail_goods: 'Packaged goods',
  addon: 'Add-ons', service: 'Service lines', other: 'Other',
};

export function ProductTab({ q }: { q: string }) {
  const { data, loading } = useSection<{ products: ProductRow[]; modifiers: ModRow[]; addons: AddonRow[] }>('product', q);
  if (!data?.products) return <Pending loading={loading} error={data?.error} />;

  const n = (v: any) => Number(v || 0);
  const agg = (rows: any[], key: (r: any) => string) => {
    const m = new Map<string, { units: number; revenue: number }>();
    for (const r of rows) {
      const k = key(r);
      const a = m.get(k) ?? { units: 0, revenue: 0 };
      a.units += n(r.units); a.revenue += n(r.revenue);
      m.set(k, a);
    }
    return [...m.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  };

  const groups = agg(data.products, (r) => r.menu_group ?? 'other');
  const maxGroup = Math.max(...groups.filter(([g]) => g !== 'service').map(([, v]) => v.revenue), 1);

  const inGroup = (g: string) => data.products.filter((r) => r.menu_group === g);
  const drinks = agg(inGroup('prepared_drink'), (r) => r.product_name);
  const fridge = agg(inGroup('fridge_drink'), (r) => r.product_name);
  const ice = agg(inGroup('icecream'), (r) => r.product_name);
  const combos = agg(inGroup('combo'), (r) => r.product_name);

  // Cookie formats: singles against the boxes, both counted in cookies.
  const cookieSingles = inGroup('cookie').reduce((s, r) => s + n(r.units), 0);
  const boxes = inGroup('box');
  const box5 = boxes.filter((r) => (r.box_size ?? 0) === 5).reduce((s, r) => s + n(r.units), 0);
  const box10 = boxes.filter((r) => (r.box_size ?? 0) === 10).reduce((s, r) => s + n(r.units), 0);
  const fmtMax = Math.max(cookieSingles, box5 * 5, box10 * 10, 1);

  const tiers = agg(inGroup('cookie'), (r) => r.tier ?? 'unknown');
  const tierTotal = tiers.reduce((s, [, v]) => s + v.units, 0) || 1;

  // Chunk Combo is a cookie with soft serve; Cappuccino + Cookie is a cookie
  // with a coffee. They sit in the same INVU category but belong in different
  // places on this page.
  const ICE_COMBO = 'Chunk Combo';
  const COFFEE_COMBO = 'Cappuccino + Cookie';

  // How a prepared drink gets configured. INVU charges for the larger size and
  // for alternative milks, so these three lists are also the upsell picture.
  const SIZE = new Set(['pequeño', 'regular', 'mediano', 'grande']);
  const MILK = new Set(['entera', 'deslactosada', 'almendra', 'avena', 'soya', 'coco']);
  const coffeeMods = data.modifiers.filter(
    (m) => m.category?.startsWith('CAF') || m.product_name === COFFEE_COMBO);
  const bucket = (which: 'size' | 'milk' | 'extra') =>
    agg(coffeeMods.filter((m) => {
      const k = m.modifier.trim().toLowerCase();
      return which === 'size' ? SIZE.has(k) : which === 'milk' ? MILK.has(k) : !SIZE.has(k) && !MILK.has(k);
    }).filter((m) => which === 'extra' ? !/cookie$/i.test(m.modifier.trim()) : true), (r) => r.modifier);

  // On an ice cream line, a "… Cookie" modifier is the cookie that goes in;
  // everything else is a topping or a sauce. Both can carry a price, so the
  // name is the only reliable way to tell them apart.
  const isCookie = (name: string) => /cookie$/i.test(name.trim());
  const frozenMods = data.modifiers.filter(
    (m) => m.category === 'HELADO' || m.product_name === ICE_COMBO);
  const toppings = agg(frozenMods.filter((m) => !isCookie(m.modifier)), (r) => r.modifier);
  const mixins = agg(
    data.modifiers.filter((m) => isCookie(m.modifier) &&
      (m.category === 'HELADO' || m.product_name === ICE_COMBO || m.product_name === COFFEE_COMBO)),
    (r) => r.modifier);

  // Topping attach, per frozen product. Both flags are decided per line in the
  // database — counting topping modifiers here would count a line with two
  // toppings twice. "Any priced extra" is the wider figure: on a Chunk Combo
  // that is usually a premium cookie rather than a topping.
  const frozen = new Map<string, { total: number; paidExtra: number; topped: number }>();
  for (const r of data.addons) {
    if (r.category !== 'HELADO' && r.product_name !== ICE_COMBO) continue;
    const a = frozen.get(r.product_name) ?? { total: 0, paidExtra: 0, topped: 0 };
    a.total += n(r.lines);
    if (r.with_addon) a.paidExtra += n(r.lines);
    if (r.with_topping) a.topped += n(r.lines);
    frozen.set(r.product_name, a);
  }
  const hasToppingFlag = data.addons.some((r) => r.with_topping !== undefined);
  const attachRows = [...frozen.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .filter((r) => r.total > 0).sort((a, b) => b.total - a.total);

  const top = agg(data.products.filter((r) => !['service', 'addon'].includes(r.menu_group ?? '')),
                  (r) => r.product_name).slice(0, 15);

  return (
    <div style={stack}>
      <Card title="Menu groups" note="Revenue by what a line actually is, rather than by INVU's own categories.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.filter(([g]) => g !== 'service').map(([g, v]) => (
            <BarRow key={g} label={GROUP_LABEL[g] ?? g} note={`${num(v.units)} units`}
                    value={money(v.revenue)} share={v.revenue} max={maxGroup} />
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Card title="Prepared drinks" note="Made to order — coffee, hot chocolate, chai and tea, ranked against each other by units.">
          <Ranked rows={drinks} byUnits />
        </Card>
        <Card title="Fridge drinks" note="Bottled and canned, sold as they are.">
          <Ranked rows={fridge} byUnits />
        </Card>
      </div>

      <Card title="How the coffee is ordered"
            note={<>Size and milk both carry a price at the till, so this is the upsell picture
                    as much as a preference one.</>}>
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
          {([['Size', bucket('size')], ['Milk', bucket('milk')], ['Syrups and extras', bucket('extra')]] as const)
            .map(([label, rows]) => (
              <div key={label}>
                <div style={{ ...cap, fontSize: 11, marginBottom: 10 }}>{label}</div>
                <Ranked rows={rows as any} byUnits />
              </div>
            ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Card title="Ice cream" note="Soft serve, milkshakes and affogato, sold on their own.">
          <Ranked rows={ice} byUnits />
        </Card>
        <Card title="Combos"
              note={<>Chunk Combo is a cookie with soft serve. Cappuccino + Cookie is a cookie with
                      a coffee — so the first belongs with the ice cream below, the second with
                      the drinks above.</>}>
          <Ranked rows={combos} byUnits />
        </Card>
      </div>

      {attachRows.length > 0 && (
        <Card title={hasToppingFlag ? 'How often a topping is added' : 'How often something is added'}
              note={hasToppingFlag
                ? <>Share of soft serve, milkshake and Chunk Combo lines carrying a topping or a
                    sauce, counted once per line. The second figure is any priced extra at all,
                    which on a Chunk Combo is usually a premium cookie rather than a topping.</>
                : <>Share of lines carrying any priced extra &mdash; a topping, a sauce, or an
                    upgraded cookie.</>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {attachRows.map((r) => {
              const hit = hasToppingFlag ? r.topped : r.paidExtra;
              return (
                <BarRow key={r.name} label={r.name}
                        note={`${num(hit)} of ${num(r.total)} lines`
                              + (hasToppingFlag
                                 ? ` · ${((r.paidExtra / r.total) * 100).toFixed(0)}% any priced extra`
                                 : '')}
                        value={`${((hit / r.total) * 100).toFixed(0)}%`}
                        share={hit / r.total} max={1} accent={hit / r.total >= 0.5} />
              );
            })}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {toppings.length > 0 && (
          <Card title="Toppings and sauces" note="Added onto soft serve, a milkshake or a Chunk Combo.">
            <Ranked rows={toppings} byUnits />
          </Card>
        )}
        {mixins.length > 0 && (
          <Card title="Which cookie goes in"
                note="The cookie chosen inside a combo or a milkshake, rather than sold on its own.">
            <Ranked rows={mixins} byUnits />
          </Card>
        )}
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Card title="Cookie format" note="Cookies reaching customers as singles or inside a box.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <BarRow label="Individual" value={num(cookieSingles)} share={cookieSingles} max={fmtMax}
                    note="sold on their own" />
            <BarRow label="Caja de 5" value={num(box5 * 5)} share={box5 * 5} max={fmtMax}
                    note={`${num(box5)} boxes`} />
            <BarRow label="Caja de 10" value={num(box10 * 10)} share={box10 * 10} max={fmtMax}
                    note={`${num(box10)} boxes`} />
          </div>
        </Card>
        <Card title="Normal vs premium" note="Share of cookie units by tier.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tiers.map(([t, v]) => (
              <BarRow key={t} label={t === 'premium' ? 'Premium' : t === 'normal' ? 'Normal' : 'Unclassified'}
                      note={`${num(v.units)} units`}
                      value={`${((v.units / tierTotal) * 100).toFixed(1)}%`}
                      share={v.units} max={tierTotal} accent={t === 'premium'} />
            ))}
          </div>
        </Card>
      </div>

      <Card title="Top products" note="By revenue, excluding delivery and service lines.">
        <Ranked rows={top} />
      </Card>
    </div>
  );
}

function Ranked({ rows, byUnits }: {
  rows: [string, { units: number; revenue: number }][]; byUnits?: boolean;
}) {
  if (!rows.length) return <div style={sub}>Nothing in this range.</div>;
  const sorted = byUnits ? [...rows].sort((a, b) => b[1].units - a[1].units) : rows;
  const max = Math.max(...sorted.map(([, v]) => (byUnits ? v.units : v.revenue)), 1);
  // Modifiers carry no revenue of their own, so there is nothing to annotate with.
  const priced = sorted.some(([, v]) => v.revenue > 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sorted.map(([name, v]) => (
        <BarRow key={name} label={name}
                note={byUnits ? (priced ? money(v.revenue) : undefined) : `${num(v.units)} units`}
                value={byUnits ? num(v.units) : money(v.revenue)}
                share={byUnits ? v.units : v.revenue} max={max} />
      ))}
    </div>
  );
}

/* ---------- channels & clients ---------- */

type ClientRow = { client: string; order_type: string; orders: number; revenue: string;
                   first_order: string; last_order: string };
type TrendRow = { client: string; year_month: string; revenue: string; orders: number };

export function ChannelsTab({ q, channelMeta }: {
  q: string; channelMeta: Record<string, { label: string; color: string }>;
}) {
  const { data, loading } = useSection<{ clients: ClientRow[]; trend: TrendRow[]; daily: any[] }>('channels', q);
  if (!data?.clients) return <Pending loading={loading} error={data?.error} />;

  const n = (v: any) => Number(v || 0);
  const byChannel = new Map<string, { revenue: number; orders: number }>();
  for (const r of data.daily) {
    const a = byChannel.get(r.channel) ?? { revenue: 0, orders: 0 };
    a.revenue += n(r.revenue); a.orders += n(r.orders);
    byChannel.set(r.channel, a);
  }
  const channels = [...byChannel.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  const total = channels.reduce((s, [, v]) => s + v.revenue, 0) || 1;

  const clients = [...data.clients].sort((a, b) => n(b.revenue) - n(a.revenue));
  const maxClient = Math.max(...clients.map((c) => n(c.revenue)), 1);

  // Is each account growing or shrinking? Compare its last month to its first.
  const trend = new Map<string, { first: number; last: number; months: number }>();
  const byClient = new Map<string, TrendRow[]>();
  for (const r of data.trend) {
    if (!byClient.has(r.client)) byClient.set(r.client, []);
    byClient.get(r.client)!.push(r);
  }
  for (const [c, rows] of byClient) {
    const sorted = rows.sort((a, b) => a.year_month.localeCompare(b.year_month));
    trend.set(c, { first: n(sorted[0].revenue), last: n(sorted[sorted.length - 1].revenue),
                   months: sorted.length });
  }

  return (
    <div style={stack}>
      <Card title="Revenue by channel" note="Share of everything sold in the selected range.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {channels.map(([c, v]) => (
            <div key={c}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <i style={{ width: 11, height: 11, borderRadius: 3,
                            background: channelMeta[c]?.color ?? 'var(--tv-ink3)' }} />
                <div style={{ fontSize: 14.5, fontWeight: 500 }}>{channelMeta[c]?.label ?? c}</div>
                <div style={{ fontSize: 12.5, color: 'var(--tv-ink4)' }}>
                  {num(v.orders)} orders · {money2(v.revenue / Math.max(v.orders, 1))} average
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 14.5, fontWeight: 700 }}>{money(v.revenue)}</div>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--tv-track)' }}>
                <div style={{ height: 8, borderRadius: 4, width: `${(v.revenue / total) * 100}%`,
                              background: channelMeta[c]?.color ?? 'var(--tv-ink2)' }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Wholesale accounts"
            note={<>&ldquo;Café Unido&rdquo; is eight separate companies, each with its own RUC.
                    An account whose orders are falling is the most actionable thing here.</>}>
        {clients.length === 0 ? <div style={sub}>No wholesale in this range.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {clients.map((c) => {
              const t = trend.get(c.client);
              const dir = t && t.months > 1
                ? ((t.last - t.first) / Math.max(t.first, 1)) * 100 : null;
              return (
                <BarRow key={c.client + c.order_type} label={c.client}
                  note={`${c.order_type} · ${num(c.orders)} order${c.orders === 1 ? '' : 's'} · last ${new Date(c.last_order + 'T12:00:00Z').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`}
                  value={money(n(c.revenue))} share={n(c.revenue)} max={maxClient}
                  suffix={dir !== null && (
                    <div style={{ fontSize: 12.5, marginTop: 4,
                                  color: dir >= 0 ? 'var(--tv-pos)' : 'var(--tv-neg)' }}>
                      {dir >= 0 ? '▲' : '▼'} {Math.abs(dir).toFixed(0)}% first month to last
                    </div>
                  )} />
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- store comparison ---------- */

export function StoresTab({ q }: { q: string }) {
  const { data, loading } = useSection<{ products: ProductRow[]; daily: any[];
                                         locations: { id: number; name: string; code: string }[] }>('stores', q);
  if (!data?.locations) return <Pending loading={loading} error={data?.error} />;

  const n = (v: any) => Number(v || 0);
  const RETAIL = new Set(['walk_in', 'marketplace', 'clau']);

  const stats = data.locations.map((l) => {
    const rows = data.daily.filter((r: any) => r.location_id === l.id && RETAIL.has(r.channel));
    const revenue = rows.reduce((s: number, r: any) => s + n(r.revenue), 0);
    const orders = rows.reduce((s: number, r: any) => s + n(r.orders), 0);
    const prods = data.products.filter((p) => p.location_id === l.id);
    const cookies = prods.filter((p) => p.menu_group === 'cookie').reduce((s, p) => s + n(p.units), 0);
    const groups = new Map<string, number>();
    for (const p of prods) {
      if (!p.menu_group || p.menu_group === 'service') continue;
      groups.set(p.menu_group, (groups.get(p.menu_group) ?? 0) + n(p.revenue));
    }
    return { ...l, revenue, orders, avg: orders ? revenue / orders : 0, cookies, groups };
  }).filter((s) => s.orders > 0);

  // Cookies are the common ground; everything else is what makes each store
  // different. A group only counts as exclusive if the other store sells none
  // of it — several, like the fridge, exist at both but at very different scale.
  const COOKIE_GROUPS = ['cookie', 'box', 'mini'];
  const elsewhere = (id: number, g: string) =>
    stats.some((s) => s.id !== id && (s.groups.get(g) ?? 0) > 0);
  const beyondCookies = (s: typeof stats[number]) =>
    [...s.groups.entries()]
      .filter(([g]) => !COOKIE_GROUPS.includes(g))
      .sort((a, b) => b[1] - a[1])
      .map(([g, v]) => ({ group: g, revenue: v, only: !elsewhere(s.id, g) }));

  return (
    <div style={stack}>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {stats.map((s) => (
          <Card key={s.id} title={s.name}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                <Stat label="Revenue" value={money(s.revenue)} />
                <Stat label="Orders" value={num(s.orders)} />
                <Stat label="Avg ticket" value={money2(s.avg)} />
                <Stat label="Cookies" value={num(s.cookies)} />
              </div>
              <div>
                <div style={{ ...cap, fontSize: 11 }}>Beyond cookies</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {beyondCookies(s).slice(0, 7).map((r) => (
                    <div key={r.group} style={{ display: 'flex', gap: 10, fontSize: 13.5 }}>
                      <span style={{ color: 'var(--tv-ink3)' }}>{GROUP_LABEL[r.group] ?? r.group}</span>
                      {r.only && (
                        <span style={{ fontSize: 11.5, color: 'var(--tv-accent)' }}>only here</span>
                      )}
                      <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{money(r.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Average ticket"
            note={<>Retail only — walk-in, marketplace and Clau. Wholesale and events are invoiced
                    in bulk and would swamp the figure. Note that Tocumen charges 22&ndash;25% more
                    for the same cookie, so a smaller ticket there means a genuinely smaller
                    basket.</>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stats.map((s) => (
            <BarRow key={s.id} label={s.name}
                    note={`${num(s.orders)} orders · ${num(s.cookies)} cookies`}
                    value={money2(s.avg)} share={s.avg}
                    max={Math.max(...stats.map((x) => x.avg), 1)} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--tv-ink4)' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-.012em' }}>{value}</div>
    </div>
  );
}

/* ---------- discounts ---------- */

type RateRow = { location_id: number; year_month: string; pct: number;
                 orders: number; gross: string; given: string; names: string };
type CountRow = { location_id: number; year_month: string; orders: number; revenue: string };
type DiscProd = { location_id: number; product_name: string; discount_name: string;
                  lines: number; units: string; given: string };

export function DiscountsTab({ q }: { q: string }) {
  const { data, loading } = useSection<{ rates: RateRow[]; totals: CountRow[];
                                         products: DiscProd[];
                                         locations: { id: number; name: string }[] }>('discounts', q);
  if (!data?.rates) return <Pending loading={loading} error={data?.error} />;

  const n = (v: any) => Number(v || 0);
  const totalOrders = data.totals.reduce((s, r) => s + n(r.orders), 0);
  const revenue = data.totals.reduce((s, r) => s + n(r.revenue), 0);
  const locName = (id: number) =>
    data.locations?.find((l) => l.id === id)?.name ?? `Location ${id}`;

  // Grouped by the rate actually charged. The label is unreliable — the same
  // 25% staff discount is rung both on the named button and on a generic
  // percentage key that records nothing — so the rate is what identifies it,
  // and the names found at that rate are shown alongside.
  const byRate = new Map<number, { orders: number; given: number; gross: number;
                                   names: Set<string>; locs: Map<number, number> }>();
  for (const r of data.rates) {
    const a = byRate.get(r.pct) ?? { orders: 0, given: 0, gross: 0,
                                     names: new Set<string>(), locs: new Map<number, number>() };
    a.orders += n(r.orders); a.given += n(r.given); a.gross += n(r.gross);
    for (const nm of String(r.names || '').split(',').map((x) => x.trim()).filter(Boolean)) a.names.add(nm);
    a.locs.set(r.location_id, (a.locs.get(r.location_id) ?? 0) + n(r.given));
    byRate.set(r.pct, a);
  }
  const rates = [...byRate.entries()].sort((a, b) => b[1].given - a[1].given);
  const givenTotal = rates.reduce((s, [, v]) => s + v.given, 0);
  const ordersDiscounted = rates.reduce((s, [, v]) => s + v.orders, 0);

  const months = new Map<string, { given: number; orders: number; all: number }>();
  const bump = (m: string, f: (a: { given: number; orders: number; all: number }) => void) => {
    const a = months.get(m) ?? { given: 0, orders: 0, all: 0 };
    f(a); months.set(m, a);
  };
  for (const r of data.rates)
    bump(String(r.year_month).slice(0, 7), (a) => { a.given += n(r.given); a.orders += n(r.orders); });
  for (const r of data.totals)
    bump(String(r.year_month).slice(0, 7), (a) => { a.all += n(r.orders); });
  const monthRows = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const prod = new Map<string, { units: number; given: number }>();
  for (const r of data.products) {
    const a = prod.get(r.product_name) ?? { units: 0, given: 0 };
    a.units += n(r.units); a.given += n(r.given);
    prod.set(r.product_name, a);
  }
  const products = [...prod.entries()].sort((a, b) => b[1].given - a[1].given).slice(0, 12);

  return (
    <div style={stack}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Note label="Given away" value={money(givenTotal)}
              note={revenue ? `${((givenTotal / revenue) * 100).toFixed(2)}% of sales` : 'no sales in range'} />
        <Note label="Discounted orders" value={num(ordersDiscounted)}
              note={totalOrders ? `${((ordersDiscounted / totalOrders) * 100).toFixed(1)}% of ${num(totalOrders)} orders`
                                : 'no orders in range'} />
        <Note label="Rates in use" value={num(rates.length)}
              note={rates[0] ? `${rates[0][0]}% accounts for most of it` : '—'} />
      </div>

      <Card title="By rate"
            note={<>Grouped by what was actually taken off the order, because the reason is
                    often not recorded — Tocumen&rsquo;s 25% staff discount is rung on a generic
                    percentage key on all but 41 orders. Any reasons that were recorded at a
                    rate are listed beside it.</>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rates.map(([pct, v]) => (
            <BarRow key={pct} label={`${pct}% off`}
              note={`${num(v.orders)} orders · ${[...v.locs.keys()].map(locName).join(' + ')}${
                v.names.size ? ` · recorded as ${[...v.names].join(', ')}` : ' · no reason recorded'}`}
              value={money(v.given)} share={v.given}
              max={Math.max(...rates.map(([, x]) => x.given), 1)}
              accent={v.names.size === 0} />
          ))}
        </div>
      </Card>

      <Card title="By month" note="What each month gave away, and how much of it was discounted at all.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {monthRows.map(([m, v]) => (
            <BarRow key={m}
              label={new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              note={v.all ? `${num(v.orders)} of ${num(v.all)} orders · ${((v.orders / v.all) * 100).toFixed(1)}%` : `${num(v.orders)} orders`}
              value={money(v.given)} share={v.given}
              max={Math.max(...monthRows.map(([, x]) => x.given), 1)} />
          ))}
        </div>
      </Card>

      <Card title="What gets discounted" note="By the money given away, top 12 products.">
        <Ranked rows={products.map(([k, v]) => [k, { units: v.units, revenue: v.given }])} />
      </Card>
    </div>
  );
}
