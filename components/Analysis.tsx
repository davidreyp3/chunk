'use client';

import { useEffect, useState } from 'react';
import Nav, { type View } from '@/components/Nav';

const T = {
  '--tv-bg': '#1E110D', '--tv-panel': '#2B1811', '--tv-panel2': '#251510',
  '--tv-ink': '#FEF4E7', '--tv-ink2': '#DBC8B6', '--tv-ink3': '#B3A08F',
  '--tv-ink4': '#8A7565', '--tv-ink5': '#6E5A4C',
  '--tv-line': 'rgba(219,200,182,0.14)', '--tv-track': 'rgba(219,200,182,0.10)',
  '--tv-accent': '#C98B4B', '--tv-pos': '#93B36A', '--tv-neg': '#C4694A',
} as React.CSSProperties;

/** Channel colours, assigned in fixed order and never cycled. */
const CHANNEL: Record<string, { label: string; color: string }> = {
  walk_in:      { label: 'Walk-in',      color: '#B86A33' },
  marketplace:  { label: 'Marketplace',  color: '#159FAF' },
  clau:         { label: 'Clau',         color: '#D2325A' },
  wholesale:    { label: 'Wholesale',    color: '#849C28' },
  eventos:      { label: 'Events',       color: '#A868CC' },
  unclassified: { label: 'Unclassified', color: '#7A6555' },
};
const ORDER = ['walk_in', 'marketplace', 'clau', 'wholesale', 'eventos', 'unclassified'];

type Special = {
  month: string; flavour: string; units: number; share: number;
  totalCookies: number; categoryGrowth: number | null; preTocumen: boolean; current: boolean;
};
type Data = {
  error?: string;
  range: { from: string; to: string; days: number; grouping: string };
  crossesTocumenOpening: boolean;
  tocumenOpened: string;
  kpis: {
    revenue: number; orders: number; cookieUnits: number; avgTicket: number;
    byLocation: { id: number; name: string; revenue: number; orders: number; avgTicket: number }[];
    nonRetail: Record<string, number>;
  };
  timeline: { period: string; channels: Record<string, number>; total: number }[];
  specials: Special[];
  permanent: { flavour: string; share: number }[];
};

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const money2 = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number) => Math.round(n).toLocaleString('en-US');

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = () => new Date(Date.now() - 5 * 3600_000);   // Panama is UTC-5
const shiftDays = (n: number) => { const d = today(); d.setUTCDate(d.getUTCDate() - n); return iso(d); };
const monthStart = (back = 0) => {
  const d = today(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back); return iso(d);
};
const monthEnd = (back = 0) => {
  const d = today(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back + 1);
  d.setUTCDate(0); return iso(d);
};

const PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  { id: '7d',    label: 'Last 7 days',    range: () => [shiftDays(6), iso(today())] },
  { id: '30d',   label: 'Last 30 days',   range: () => [shiftDays(29), iso(today())] },
  { id: 'month', label: 'This month',     range: () => [monthStart(), iso(today())] },
  { id: 'prev',  label: 'Last month',     range: () => [monthStart(1), monthEnd(1)] },
  { id: '12m',   label: 'Last 12 months', range: () => [monthStart(11), iso(today())] },
  { id: 'all',   label: 'All time',       range: () => ['2024-10-01', iso(today())] },
];

const periodLabel = (p: string) =>
  p.length === 7
    ? new Date(`${p}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    : new Date(`${p}T12:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
const longDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Analysis({ view, onSelect }: { view: View; onSelect: (v: View) => void }) {
  const [preset, setPreset] = useState('12m');
  const [custom, setCustom] = useState<[string, string] | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const [from, to] = custom ?? PRESETS.find((p) => p.id === preset)!.range();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/analysis?from=${from}&to=${to}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [from, to]);

  const page: React.CSSProperties = {
    ...T, minHeight: '100vh', background: 'var(--tv-bg)', color: 'var(--tv-ink)',
    fontFamily: '-apple-system,BlinkMacSystemFont,system-ui,"Helvetica Neue",Arial,sans-serif',
    fontVariantNumeric: 'tabular-nums',
    padding: 'calc(20px + env(safe-area-inset-top)) 16px calc(48px + env(safe-area-inset-bottom))',
  };
  const card: React.CSSProperties = { background: 'var(--tv-panel)', borderRadius: 18, padding: '18px 20px' };
  const cap: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '.12em',
                                     textTransform: 'uppercase', color: 'var(--tv-ink3)' };
  const sub: React.CSSProperties = { fontSize: 13.5, color: 'var(--tv-ink4)', lineHeight: 1.5 };

  return (
    <div style={page}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex',
                    flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={cap}>Analysis</div>
          <Nav view={view} onSelect={onSelect} size={38} />
        </div>

        {/* One range control, driving every panel below it. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
          {PRESETS.map((p) => {
            const on = !custom && preset === p.id;
            return (
              <button key={p.id} onClick={() => { setCustom(null); setPreset(p.id); }}
                style={{ padding: '8px 13px', borderRadius: 999, fontSize: 13.5, cursor: 'pointer',
                         border: '1px solid ' + (on ? 'transparent' : 'var(--tv-line)'),
                         background: on ? 'var(--tv-ink2)' : 'transparent',
                         color: on ? '#1E110D' : 'var(--tv-ink3)',
                         fontWeight: on ? 600 : 400, fontFamily: 'inherit',
                         transition: 'transform 100ms cubic-bezier(.32,.72,0,1)' }}
                onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
                {p.label}
              </button>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...sub }}>
            <input type="date" value={from} max={to} style={dateInput}
                   onChange={(e) => setCustom([e.target.value, to])} />
            <span>→</span>
            <input type="date" value={to} min={from} max={iso(today())} style={dateInput}
                   onChange={(e) => setCustom([from, e.target.value])} />
          </div>
        </div>

        <div style={{ ...sub, marginTop: -4 }}>
          {longDate(from)} → {longDate(to)}{data ? ` · ${data.range.days} days` : ''}
        </div>

        {loading && !data && <div style={{ ...card, ...sub }}>Loading…</div>}
        {data?.error && <div style={{ ...card, color: 'var(--tv-accent)' }}>{data.error}</div>}

        {data && !data.error && (
          <>
            {data.crossesTocumenOpening && (
              <div style={{ ...card, background: 'var(--tv-panel2)',
                            borderLeft: '3px solid var(--tv-accent)', ...sub }}>
                This range crosses <strong style={{ color: 'var(--tv-ink2)' }}>November 2025</strong>,
                when Tocumen opened and volume roughly tripled. Anything spanning that line is comparing
                two different businesses.
              </div>
            )}

            <div style={{ display: 'grid', gap: 12,
                          gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))' }}>
              <Kpi label="Retail revenue" value={money(data.kpis.revenue)} />
              <Kpi label="Orders" value={num(data.kpis.orders)} />
              <Kpi label="Average ticket" value={money2(data.kpis.avgTicket)} />
              <Kpi label="Cookies" value={num(data.kpis.cookieUnits)} />
            </div>

            <div style={{ display: 'grid', gap: 12,
                          gridTemplateColumns: 'repeat(auto-fit, minmax(238px, 1fr))' }}>
              {data.kpis.byLocation.filter((l) => l.orders > 0).map((l) => (
                <div key={l.id} style={card}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{l.name}</div>
                  <div style={{ display: 'flex', gap: 22, marginTop: 10, flexWrap: 'wrap' }}>
                    <Mini label="Revenue" value={money(l.revenue)} />
                    <Mini label="Orders" value={num(l.orders)} />
                    <Mini label="Avg ticket" value={money2(l.avgTicket)} />
                  </div>
                </div>
              ))}
              {Object.keys(data.kpis.nonRetail).length > 0 && (
                <div style={{ ...card, background: 'var(--tv-panel2)' }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>Outside retail</div>
                  <div style={{ display: 'flex', gap: 22, marginTop: 10, flexWrap: 'wrap' }}>
                    {Object.entries(data.kpis.nonRetail).map(([c, v]) => (
                      <Mini key={c} label={CHANNEL[c]?.label ?? c} value={money(v)} />
                    ))}
                  </div>
                  <div style={{ ...sub, marginTop: 10 }}>
                    Invoiced. Never counted into average ticket or the hourly curve.
                  </div>
                </div>
              )}
            </div>

            <div style={card}>
              <div style={cap}>Revenue by {data.range.grouping}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, margin: '12px 0 16px' }}>
                {ORDER.filter((c) => data.timeline.some((t) => t.channels[c])).map((c) => (
                  <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 7, ...sub }}>
                    <i style={{ width: 11, height: 11, borderRadius: 3, background: CHANNEL[c].color }} />
                    {CHANNEL[c].label}
                  </span>
                ))}
              </div>
              <Timeline rows={data.timeline} openedOn={data.tocumenOpened} />
            </div>

            <div style={card}>
              <div style={cap}>Monthly specials</div>
              <div style={{ ...sub, margin: '8px 0 16px', maxWidth: '68ch' }}>
                Ranked by share of all cookies sold{' '}
                <strong style={{ color: 'var(--tv-ink2)' }}>during that flavour&rsquo;s own month</strong>
                {' '}— never absolute units, since traffic and prices differ. Months before November 2025
                are Sunset-only, at roughly a third of today&rsquo;s volume, and are marked.
              </div>
              <Specials rows={data.specials} scaleTo={data.permanent[0]?.share ?? 25} />
            </div>

            <div style={card}>
              <div style={cap}>Permanent menu, for comparison</div>
              <div style={{ ...sub, margin: '8px 0 14px' }}>Average share across every month.</div>
              <Specials
                plain
                scaleTo={data.permanent[0]?.share ?? 25}
                rows={data.permanent.map((p) => ({
                  month: '', flavour: p.flavour, units: 0, share: p.share,
                  totalCookies: 0, categoryGrowth: null, preTocumen: false, current: false,
                }))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const dateInput: React.CSSProperties = {
  background: 'var(--tv-panel)', color: 'var(--tv-ink2)', border: '1px solid var(--tv-line)',
  borderRadius: 9, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', colorScheme: 'dark',
};

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--tv-panel)', borderRadius: 18, padding: '18px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em',
                    textTransform: 'uppercase', color: 'var(--tv-ink3)' }}>{label}</div>
      <div style={{ fontSize: 'clamp(25px, 4.2vw, 33px)', fontWeight: 700,
                    letterSpacing: '-.022em', marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--tv-ink4)' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-.012em' }}>{value}</div>
    </div>
  );
}

/** Horizontal stacked bars — they stay readable on a phone, where 24 vertical
 *  columns would be a few pixels wide each. */
function Timeline({ rows, openedOn }: { rows: Data['timeline']; openedOn: string }) {
  const peak = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rows.map((r) => {
        const opening = r.period.length === 7 && r.period === openedOn.slice(0, 7);
        return (
          <div key={r.period} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 58, flex: 'none', fontSize: 12.5,
                          color: opening ? 'var(--tv-accent)' : 'var(--tv-ink4)',
                          fontWeight: opening ? 700 : 400 }}>
              {periodLabel(r.period)}
            </div>
            <div style={{ flex: 1, minWidth: 0, height: 16, borderRadius: 4, overflow: 'hidden',
                          background: 'var(--tv-track)', display: 'flex' }}>
              {ORDER.filter((c) => r.channels[c]).map((c) => (
                <div key={c} title={`${CHANNEL[c].label} ${money(r.channels[c])}`}
                     style={{ width: `${(r.channels[c] / peak) * 100}%`,
                              background: CHANNEL[c].color }} />
              ))}
            </div>
            <div style={{ width: 64, flex: 'none', textAlign: 'right', fontSize: 13,
                          fontWeight: 600 }}>{money(r.total)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Specials({ rows, scaleTo, plain }: {
  rows: Special[]; scaleTo: number; plain?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.share), scaleTo, 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {rows.map((r) => (
        <div key={r.flavour + r.month}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 5,
                        flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: r.current ? 700 : 500,
                          color: r.current ? 'var(--tv-accent)' : 'var(--tv-ink)' }}>
              {r.flavour}
            </div>
            {!plain && (
              <div style={{ fontSize: 12.5, color: 'var(--tv-ink4)' }}>
                {periodLabel(r.month)}
                {r.units > 0 && ` · ${num(r.units)} units`}
                {r.preTocumen && ' · Sunset only'}
                {r.current && ' · running now'}
              </div>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 700 }}>
              {r.share.toFixed(1)}%
            </div>
          </div>
          <div style={{ height: 9, borderRadius: 4, background: 'var(--tv-track)' }}>
            <div style={{ height: 9, borderRadius: 4, width: `${(r.share / max) * 100}%`,
                          background: r.current ? 'var(--tv-accent)'
                            : r.preTocumen ? 'rgba(219,200,182,0.34)' : 'var(--tv-ink2)' }} />
          </div>
          {!plain && r.categoryGrowth !== null && !r.current && (
            <div style={{ fontSize: 12.5, marginTop: 5,
                          color: r.categoryGrowth >= 0 ? 'var(--tv-pos)' : 'var(--tv-neg)' }}>
              Total cookies {r.categoryGrowth >= 0 ? '+' : ''}{r.categoryGrowth.toFixed(0)}% on the month before
              <span style={{ color: 'var(--tv-ink5)' }}>
                {' — '}{r.categoryGrowth >= 0 ? 'grew the category' : 'took share from it'}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
