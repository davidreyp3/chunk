'use client';

import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import Nav, { type View } from '@/components/Nav';

const W = 1920, H = 1080;

/* Palettes lifted from the Claude Design handoff, unchanged. */
const THEMES: Record<'dark' | 'light', Record<string, string>> = {
  dark: {
    '--tv-bg': '#1E110D', '--tv-panel': '#2B1811', '--tv-panel2': '#251510',
    '--tv-ink': '#FEF4E7', '--tv-ink2': '#DBC8B6', '--tv-ink3': '#B3A08F',
    '--tv-ink4': '#8A7565', '--tv-ink5': '#6E5A4C',
    '--tv-line': 'rgba(219,200,182,0.18)', '--tv-border': 'rgba(219,200,182,0.14)',
    '--tv-ghost': 'rgba(219,200,182,0.22)', '--tv-track': 'rgba(219,200,182,0.12)',
    '--tv-bar': '#DBC8B6', '--tv-accent': '#C98B4B',
    '--tv-pos': '#93B36A', '--tv-neg': '#C4694A', '--tv-on-pos': '#1E110D',
  },
  light: {
    '--tv-bg': '#EDDECD', '--tv-panel': '#FEF4E7', '--tv-panel2': '#F6E8D6',
    '--tv-ink': '#3C2017', '--tv-ink2': '#3C2017', '--tv-ink3': 'rgba(60,32,23,0.62)',
    '--tv-ink4': 'rgba(60,32,23,0.62)', '--tv-ink5': 'rgba(60,32,23,0.38)',
    '--tv-line': 'rgba(60,32,23,0.16)', '--tv-border': 'rgba(60,32,23,0.14)',
    '--tv-ghost': 'rgba(60,32,23,0.14)', '--tv-track': 'rgba(60,32,23,0.08)',
    '--tv-bar': '#3C2017', '--tv-accent': '#A9701F',
    '--tv-pos': '#4A6B3A', '--tv-neg': '#A83E1E', '--tv-on-pos': '#FEF4E7',
  },
};

type Loc = { id: number; name: string; code: string; open: boolean;
             revenue: number; orders: number; avgTicket: number; deltaPct: number | null };
type Payload = {
  error?: string;
  day: string; updatedAt: string;
  total: { revenue: number; typical: number; deltaPct: number | null };
  locations: Loc[];
  hours: { hour: number; today: number; typical: number }[];
  cookieUnits: number;
  topFlavours: { name: string; units: number; pct: number; isSpecial: boolean }[];
  special: { flavour: string | null; unitsToday: number; pctToday: number;
             monthShare: number | null; pastAverage: number | null;
             pastBest: { flavour: string; pct: number } | null };
  month: { mtd: number; target: number | null; dayOfMonth: number; daysInMonth: number };
  ticker: { time: string; detail: string; amount: number }[];
};

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const money2 = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (d: string) =>
  new Date(`${d}T12:00:00-05:00`).toLocaleDateString('en-US',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const weekday = (d: string) =>
  new Date(`${d}T12:00:00-05:00`).toLocaleDateString('en-US', { weekday: 'long' });
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US',
    { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Panama' });

export default function TvBoard({ view, onSelect }: { view: View; onSelect: (v: View) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [scale, setScale] = useState(1);

  // Compose at a fixed 1920x1080 and scale to fit. A wall display can be any
  // size or aspect; guessing its height is what broke the first version.
  const [narrow, setNarrow] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 900);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Measure the board's real height rather than assuming 1080 — arithmetic on
  // font metrics is how the first three attempts clipped their bottom rows.
  useLayoutEffect(() => {
    const fit = () => {
      // Measure the board's natural height only. Setting a height here and then
      // measuring it feeds back on itself and shrinks the board every pass.
      const content = boardRef.current?.scrollHeight ?? H;
      setScale(Math.min(window.innerWidth / W, window.innerHeight / Math.max(content, 1)));
    };
    fit();
    window.addEventListener('resize', fit);
    const t = setInterval(fit, 2000);
    return () => { window.removeEventListener('resize', fit); clearInterval(t); };
  }, [data, narrow]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('chunk-tv-theme');
      if (saved === 'dark' || saved === 'light') setTheme(saved);
    } catch {}
  }, []);

  useEffect(() => {
    // The TV is the scheduler — no cron, and it only polls while someone can see it.
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/tv', { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        if (alive) { setData(await r.json()); setErr(null); }
      } catch (e: any) {
        if (alive) setErr(e.message);   // keep the last good numbers on screen
      }
    };
    load();
    const t = setInterval(load, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('chunk-tv-theme', next); } catch {}
      return next;
    });
  }, []);

  const vars = THEMES[theme] as React.CSSProperties;
  const stage: React.CSSProperties = {
    ...vars, position: 'fixed', inset: 0, background: 'var(--tv-bg)', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const root: React.CSSProperties = {
    width: W, flex: 'none', transform: `scale(${scale})`, transformOrigin: 'center',
    background: 'var(--tv-bg)', color: 'var(--tv-ink)',
    fontFamily: '-apple-system,BlinkMacSystemFont,system-ui,"Helvetica Neue",Helvetica,Arial,sans-serif',
    fontVariantNumeric: 'tabular-nums', padding: '18px 30px 14px',
    display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden',
  };

  if (!data || data.error) {
    return (
      <div style={stage}>
        <div style={root}>
          <div style={{ fontSize: 34, fontWeight: 600, color: 'var(--tv-accent)', maxWidth: '80%' }}>
            {data?.error ?? (err ? `Offline — ${err}` : 'Loading…')}
          </div>
        </div>
      </div>
    );
  }

  if (narrow) return <Phone data={data} vars={vars} err={err} onToggle={toggle} view={view} onSelect={onSelect} />;

  const { total, month, special } = data;
  const peak = Math.max(...data.hours.map((h) => Math.max(h.today, h.typical)), 1);
  const step = peak <= 50 ? 10 : peak <= 100 ? 20 : peak <= 250 ? 50 : peak <= 500 ? 100 : 200;
  const top = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: Math.floor(top / step) }, (_, i) => (i + 1) * step);
  const busiest = data.hours.reduce((a, b) => (b.today > a.today ? b : a), data.hours[0]);
  const pos = (v: number | null) => v != null && v >= 0;
  const pct = month.target ? (month.mtd / month.target) * 100 : null;
  const openLocs = data.locations.filter((l) => l.open);
  const soon = data.locations.filter((l) => !l.open);
  const specialMax = Math.max(special.pastBest?.pct ?? 0, special.monthShare ?? 0, 1);

  const L = { fontSize: 25, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase' as const, color: 'var(--tv-ink3)' };
  const PAD = '20px 28px';
  const panel: React.CSSProperties = { background: 'var(--tv-panel)', borderRadius: 24, padding: PAD };

  return (
    <div style={stage}>
    <div ref={boardRef} style={root}>
      {/* header */}
      <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <img src={theme === 'dark' ? '/logo-sublogo-ivory.svg' : '/logo-sublogo.svg'}
               alt="Chunk Cookie Bar" style={{ height: 44 }} />
          <div style={{ width: 1, height: 44, background: 'var(--tv-line)' }} />
          <div style={L}>Today's sales</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <div style={{ fontSize: 28, color: 'var(--tv-ink2)', letterSpacing: '-0.01em' }}>{longDate(data.day)}</div>
          <div onClick={toggle}
               style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 22px',
                        border: '1px solid var(--tv-border)', borderRadius: 999, cursor: 'pointer' }}>
            <div style={{ width: 12, height: 12, borderRadius: 999,
                          background: err ? 'var(--tv-neg)' : 'var(--tv-pos)' }} />
            <div style={{ fontSize: 28, color: 'var(--tv-ink3)' }}>Updated {clock(data.updatedAt)}</div>
          </div>
          <Nav view={view} onSelect={onSelect} size={52} />
        </div>
      </div>

      {/* revenue + locations */}
      <div style={{ display: 'flex', gap: 16, flex: 'none' }}>
        <div style={{ ...panel, width: 700, display: 'flex',
                      flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={L}>Revenue today</div>
          <div style={{ fontSize: 100, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 0.94 }}>
            {money(total.revenue)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {total.deltaPct != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 999, padding: '7px 20px',
                            background: pos(total.deltaPct) ? 'var(--tv-pos)' : 'var(--tv-neg)',
                            color: 'var(--tv-on-pos)' }}>
                <span style={{ fontSize: 24, fontWeight: 600, lineHeight: 1 }}>{pos(total.deltaPct) ? '▲' : '▼'}</span>
                <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  {Math.abs(total.deltaPct).toFixed(1)}%
                </span>
              </div>
            )}
            <div style={{ fontSize: 26, lineHeight: 1.25, color: 'var(--tv-ink3)' }}>
              vs typical {weekday(data.day)}<br />4 weeks · {money(total.typical)}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', gap: 16 }}>
          {openLocs.map((l) => (
            <div key={l.id} style={{ ...panel, flex: 1, display: 'flex',
                                     flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.01em' }}>{l.name}</div>
                <div style={{ fontSize: 25, color: 'var(--tv-ink4)', marginTop: 3 }}>{l.code}</div>
              </div>
              <div style={{ fontSize: 60, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1,
                            color: 'var(--tv-ink2)' }}>{money(l.revenue)}</div>
              <div style={{ display: 'flex', gap: 40 }}>
                <div>
                  <div style={{ fontSize: 25, color: 'var(--tv-ink4)' }}>Transactions</div>
                  <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.01em' }}>{l.orders}</div>
                </div>
                <div>
                  <div style={{ fontSize: 25, color: 'var(--tv-ink4)' }}>Average ticket</div>
                  <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.01em' }}>{money2(l.avgTicket)}</div>
                </div>
              </div>
            </div>
          ))}
          {soon.map((l) => (
            <div key={l.id} style={{ background: 'var(--tv-panel2)', border: '1px solid var(--tv-border)',
                                     borderRadius: 24, width: 250, display: 'flex',
                                     flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--tv-ink3)' }}>{l.name}</div>
                <div style={{ fontSize: 28, color: 'var(--tv-ink5)' }}>{l.code}</div>
              </div>
              <div style={{ fontSize: 28, color: 'var(--tv-ink5)', letterSpacing: '0.08em',
                            textTransform: 'uppercase' }}>Opening soon</div>
            </div>
          ))}
        </div>
      </div>

      {/* hourly + monthly flavour */}
      <div style={{ display: 'flex', gap: 16, flex: 'none' }}>
        <div style={{ ...panel, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={L}>Revenue per hour</div>
            <div style={{ display: 'flex', gap: 26, fontSize: 25, color: 'var(--tv-ink4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 22, height: 14, borderRadius: 3, background: 'var(--tv-bar)' }} />Today</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 22, height: 14, borderRadius: 3, background: 'var(--tv-ghost)' }} />
                typical {weekday(data.day)}</div>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12, marginTop: 10 }}>
            <div style={{ width: 74, flex: 'none', position: 'relative', paddingBottom: 33 }}>
              {ticks.map((t) => (
                <div key={t} style={{ position: 'absolute', right: 0, bottom: `${(t / top) * 100}%`,
                                      transform: 'translateY(50%)', fontSize: 21,
                                      color: 'var(--tv-ink5)' }}>{money(t)}</div>
              ))}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {ticks.map((t) => (
                  <div key={t} style={{ position: 'absolute', left: 0, right: 0,
                                        bottom: `${(t / top) * 100}%`, height: 1,
                                        background: 'var(--tv-line)' }} />
                ))}
                <div style={{ position: 'absolute', inset: 0, display: 'flex',
                              alignItems: 'flex-end', gap: 10 }}>
                  {data.hours.map((h) => (
                    <div key={h.hour} style={{ flex: 1, height: '100%', position: 'relative' }}>
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                                    height: `${Math.max(1, (h.typical / top) * 100)}%`,
                                    background: 'var(--tv-ghost)', borderRadius: 5 }} />
                      <div style={{ position: 'absolute', bottom: 0, left: '24%', width: '52%',
                                    height: `${h.today ? Math.max(1, (h.today / top) * 100) : 0}%`,
                                    background: 'var(--tv-bar)', borderRadius: 5 }} />
                      {h.hour === busiest.hour && h.today > 0 && (
                        <div style={{ position: 'absolute', left: 0, right: 0,
                                      bottom: `calc(${(h.today / top) * 100}% + 6px)`,
                                      textAlign: 'center', fontSize: 23, fontWeight: 600,
                                      color: 'var(--tv-ink)' }}>{money(h.today)}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8, flex: 'none' }}>
                {data.hours.map((h) => (
                  <div key={h.hour} style={{ flex: 1, textAlign: 'center', fontSize: 25,
                                             color: h.today ? 'var(--tv-ink4)' : 'var(--tv-ink5)' }}>
                    {h.hour}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...panel, width: 660, display: 'flex',
                      flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={L}>Flavour of the month</div>
            <div style={{ fontSize: 28, color: 'var(--tv-ink4)' }}>
              {new Date(`${data.day}T12:00:00-05:00`).toLocaleDateString('en-US', { month: 'long' })}
            </div>
          </div>
          {special.flavour ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 36 }}>
                <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {special.flavour}
                </div>
                <div style={{ display: 'flex', gap: 36, paddingBottom: 2 }}>
                  <div>
                    <div style={{ fontSize: 25, color: 'var(--tv-ink4)' }}>Units today</div>
                    <div style={{ fontSize: 36, fontWeight: 600, lineHeight: 1.1 }}>{special.unitsToday}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 25, color: 'var(--tv-ink4)' }}>Of today's mix</div>
                    <div style={{ fontSize: 36, fontWeight: 600, lineHeight: 1.1, color: 'var(--tv-ink2)' }}>
                      {special.pctToday.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 25, color: 'var(--tv-ink4)' }}>Month share vs past specials</div>
                <div style={{ position: 'relative', height: 20, marginTop: 14,
                              background: 'var(--tv-track)', borderRadius: 4 }}>
                  <div style={{ position: 'absolute', inset: '0 auto 0 0', borderRadius: 4,
                                width: `${Math.min(100, ((special.monthShare ?? 0) / specialMax) * 100)}%`,
                                background: 'var(--tv-accent)' }} />
                  {special.pastAverage != null && (
                    <div style={{ position: 'absolute', top: -7, bottom: -7, width: 3, background: 'var(--tv-ink3)',
                                  left: `${Math.min(100, (special.pastAverage / specialMax) * 100)}%` }} />
                  )}
                  <div style={{ position: 'absolute', top: -7, bottom: -7, right: 0, width: 3,
                                background: 'var(--tv-ink3)' }} />
                </div>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 25, fontWeight: 600, color: 'var(--tv-accent)', whiteSpace: 'nowrap' }}>
                    {(special.monthShare ?? 0).toFixed(1)}% this month
                  </div>
                  <div style={{ fontSize: 23, color: 'var(--tv-ink4)', whiteSpace: 'nowrap' }}>
                    {(special.pastAverage ?? 0).toFixed(1)}% average · best {special.pastBest?.flavour} {(special.pastBest?.pct ?? 0).toFixed(1)}%
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 32, color: 'var(--tv-ink4)' }}>No monthly special detected</div>
          )}
        </div>
      </div>

      {/* top 5 + month vs target */}
      <div style={{ display: 'flex', gap: 16, flex: 'none' }}>
        <div style={{ ...panel, flex: 1, display: 'flex',
                      flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={L}>Top 5 cookies today · units</div>
            <div style={{ fontSize: 25, color: 'var(--tv-ink4)' }}>{data.cookieUnits} cookies</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.topFlavours.length === 0 && (
              <div style={{ fontSize: 30, color: 'var(--tv-ink4)' }}>No cookie sales yet</div>
            )}
            {data.topFlavours.map((f) => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ flex: 'none', width: 300, fontSize: 28, whiteSpace: 'nowrap',
                              fontWeight: f.isSpecial ? 600 : 400,
                              color: f.isSpecial ? 'var(--tv-accent)' : 'var(--tv-ink3)' }}>
                  {f.name}{f.isSpecial ? ' · of the month' : ''}
                </div>
                <div style={{ flex: 1, height: 14, background: 'var(--tv-track)', borderRadius: 4 }}>
                  <div style={{ height: 14, borderRadius: 4,
                                width: `${(f.units / (data.topFlavours[0]?.units || 1)) * 100}%`,
                                background: f.isSpecial ? 'var(--tv-accent)' : 'var(--tv-bar)' }} />
                </div>
                <div style={{ flex: 'none', width: 84, textAlign: 'right', fontSize: 28,
                              fontWeight: 600, letterSpacing: '-0.01em' }}>{f.units}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...panel, width: 660, display: 'flex',
                      flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={L}>Month vs target</div>
            <div style={{ fontSize: 25, color: 'var(--tv-ink4)' }}>
              {month.target ? `target ${money(month.target)}` : 'no target set'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
            <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1 }}>
              {money(month.mtd)}
            </div>
            {pct != null && (
              <div style={{ fontSize: 40, fontWeight: 600, color: 'var(--tv-pos)', lineHeight: 1.4 }}>
                {pct.toFixed(1)}%
              </div>
            )}
          </div>
          <div>
            <div style={{ height: 24, background: 'var(--tv-track)', borderRadius: 6,
                          position: 'relative', overflow: 'hidden' }}>
              {pct != null && (
                <div style={{ position: 'absolute', inset: '0 auto 0 0',
                              width: `${Math.min(100, pct)}%`, background: 'var(--tv-bar)' }} />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10,
                          fontSize: 25, color: 'var(--tv-ink4)' }}>
              <div>day {month.dayOfMonth} of {month.daysInMonth} · all channels</div>
              <div>{month.target ? `${money(Math.max(0, month.target - month.mtd))} to go` : ''}</div>
            </div>
          </div>
        </div>
      </div>

      {/* last sales — continuous carousel */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 24,
                    overflow: 'hidden', paddingTop: 6 }}>
        <div style={{ ...L, fontSize: 24, flex: 'none' }}>Latest sales</div>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden',
                      maskImage: 'linear-gradient(90deg, transparent 0, #000 3%, #000 94%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 3%, #000 94%, transparent 100%)' }}>
          <div className="tv-marquee" style={{ display: 'flex', gap: 44, width: 'max-content' }}>
            {[...data.ticker.slice(0, 10), ...data.ticker.slice(0, 10)].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, whiteSpace: 'nowrap',
                                    fontSize: 25, color: 'var(--tv-ink4)' }}>
                <span style={{ color: 'var(--tv-ink5)' }}>{t.time}</span>
                <span>{t.detail}</span>
                <span style={{ color: 'var(--tv-ink2)', fontWeight: 600 }}>{money2(t.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

/* ---------- Phone / tablet ---------- */

function Phone({ data, vars, err, onToggle, view, onSelect }: {
  data: Payload; vars: React.CSSProperties; err: string | null; onToggle: () => void;
  view: View; onSelect: (v: View) => void;
}) {
  const { total, month, special } = data;
  const pos = (v: number | null) => v != null && v >= 0;
  const pct = month.target ? (month.mtd / month.target) * 100 : null;
  const peak = Math.max(...data.hours.map((h) => Math.max(h.today, h.typical)), 1);
  const step = peak <= 50 ? 10 : peak <= 100 ? 20 : peak <= 250 ? 50 : peak <= 500 ? 100 : 200;
  const top = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: Math.floor(top / step) }, (_, i) => (i + 1) * step);
  const busiest = data.hours.reduce((a, b) => (b.today > a.today ? b : a), data.hours[0]);

  const page: React.CSSProperties = {
    ...vars, minHeight: '100vh', background: 'var(--tv-bg)', color: 'var(--tv-ink)',
    fontFamily: '-apple-system,BlinkMacSystemFont,system-ui,"Helvetica Neue",Helvetica,Arial,sans-serif',
    fontVariantNumeric: 'tabular-nums', padding: '18px 16px 32px',
    display: 'flex', flexDirection: 'column', gap: 12,
  };
  const card: React.CSSProperties = { background: 'var(--tv-panel)', borderRadius: 18, padding: '18px 20px' };
  const cap: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '.1em',
                                     textTransform: 'uppercase', color: 'var(--tv-ink3)' };
  const sub: React.CSSProperties = { fontSize: 14, color: 'var(--tv-ink4)' };

  return (
    <div style={page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ ...cap, fontSize: 13 }}>Today's sales</div>
        <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, ...sub }}>
          <span style={{ width: 8, height: 8, borderRadius: 999,
                         background: err ? 'var(--tv-neg)' : 'var(--tv-pos)' }} />
          {clock(data.updatedAt)}
        </div>
        <Nav view={view} onSelect={onSelect} size={38} />
      </div>
      <div style={{ fontSize: 15, color: 'var(--tv-ink2)' }}>{longDate(data.day)}</div>

      <div style={card}>
        <div style={cap}>Revenue today</div>
        <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.05, margin: '6px 0 10px' }}>
          {money(total.revenue)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {total.deltaPct != null && (
            <span style={{ borderRadius: 999, padding: '5px 12px', fontSize: 15, fontWeight: 700,
                           background: pos(total.deltaPct) ? 'var(--tv-pos)' : 'var(--tv-neg)',
                           color: 'var(--tv-on-pos)' }}>
              {pos(total.deltaPct) ? '▲' : '▼'} {Math.abs(total.deltaPct).toFixed(1)}%
            </span>
          )}
          <span style={sub}>vs typical {weekday(data.day)} · {money(total.typical)}</span>
        </div>
      </div>

      {data.locations.filter((l) => l.open).map((l) => (
        <div key={l.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{l.name}</div>
            <div style={sub}>{l.orders} tx · {money2(l.avgTicket)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.02em' }}>{money(l.revenue)}</div>
            {l.deltaPct != null && (
              <div style={{ fontSize: 14, fontWeight: 600,
                            color: pos(l.deltaPct) ? 'var(--tv-pos)' : 'var(--tv-neg)' }}>
                {pos(l.deltaPct) ? '▲' : '▼'} {Math.abs(l.deltaPct).toFixed(1)}%
              </div>
            )}
          </div>
        </div>
      ))}

      <div style={card}>
        <div style={cap}>Revenue per hour</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 96, marginTop: 14 }}>
          {data.hours.map((h) => (
            <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column',
                                       alignItems: 'center', gap: 5 }}>
              <div style={{ width: '100%', height: 72, position: 'relative' }}>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                              height: Math.max(2, (h.typical / peak) * 72),
                              background: 'var(--tv-ghost)', borderRadius: 3 }} />
                <div style={{ position: 'absolute', bottom: 0, left: '22%', width: '56%',
                              height: Math.max(h.today ? 2 : 0, (h.today / peak) * 72),
                              background: 'var(--tv-bar)', borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 9, color: 'var(--tv-ink5)' }}>{h.hour}</div>
            </div>
          ))}
        </div>
      </div>

      {special.flavour && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={cap}>Flavour of the month</div>
            <div style={sub}>{special.unitsToday} today · {special.pctToday.toFixed(1)}% of mix</div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', margin: '8px 0 12px' }}>
            {special.flavour}
          </div>
          <div style={{ height: 12, background: 'var(--tv-track)', borderRadius: 4, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: '0 auto 0 0', borderRadius: 4,
                          width: `${Math.min(100, ((special.monthShare ?? 0) / Math.max(special.pastBest?.pct ?? 1, 1)) * 100)}%`,
                          background: 'var(--tv-accent)' }} />
          </div>
          <div style={{ marginTop: 10, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div>
              <span style={{ color: 'var(--tv-accent)', fontWeight: 700 }}>{(special.monthShare ?? 0).toFixed(1)}%</span>
              <span style={sub}> este mes · {(special.pastAverage ?? 0).toFixed(1)}% historical average</span>
            </div>
            <div style={sub}>
              Best special: {special.pastBest?.flavour} · {(special.pastBest?.pct ?? 0).toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={cap}>Top 5 cookies today</div>
          <div style={sub}>{data.cookieUnits} cookies</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {data.topFlavours.map((f) => (
            <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 15, whiteSpace: 'nowrap',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            fontWeight: f.isSpecial ? 700 : 400,
                            color: f.isSpecial ? 'var(--tv-accent)' : 'var(--tv-ink2)' }}>
                {f.name}
              </div>
              <div style={{ width: 90, height: 8, background: 'var(--tv-track)', borderRadius: 4 }}>
                <div style={{ height: 8, borderRadius: 4,
                              width: `${(f.units / (data.topFlavours[0]?.units || 1)) * 100}%`,
                              background: f.isSpecial ? 'var(--tv-accent)' : 'var(--tv-bar)' }} />
              </div>
              <div style={{ width: 38, textAlign: 'right', fontSize: 17, fontWeight: 700 }}>{f.units}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={cap}>Month vs target</div>
          <div style={sub}>{month.target ? money(month.target) : 'no target set'}</div>
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', margin: '8px 0 12px' }}>
          {money(month.mtd)}
        </div>
        <div style={{ height: 12, background: 'var(--tv-track)', borderRadius: 4, overflow: 'hidden' }}>
          {pct != null && <div style={{ height: 12, width: `${Math.min(100, pct)}%`, background: 'var(--tv-bar)' }} />}
        </div>
        <div style={{ ...sub, marginTop: 8 }}>day {month.dayOfMonth} of {month.daysInMonth} · all channels</div>
      </div>

      <div style={card}>
        <div style={cap}>Latest sales</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
          {data.ticker.slice(0, 8).map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, fontSize: 14, alignItems: 'baseline' }}>
              <span style={{ color: 'var(--tv-ink5)', flex: 'none' }}>{t.time}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap',
                             textOverflow: 'ellipsis', color: 'var(--tv-ink3)' }}>{t.detail}</span>
              <span style={{ fontWeight: 700, flex: 'none' }}>{money2(t.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
