'use client';

import { useEffect, useState, useCallback } from 'react';

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
  new Date(`${d}T12:00:00-05:00`).toLocaleDateString('es-PA',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const weekday = (d: string) =>
  new Date(`${d}T12:00:00-05:00`).toLocaleDateString('es-PA', { weekday: 'long' });
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-PA',
    { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Panama' });

export default function TvPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

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
  const root: React.CSSProperties = {
    ...vars, width: '100vw', height: '100vh', background: 'var(--tv-bg)', color: 'var(--tv-ink)',
    fontFamily: '-apple-system,BlinkMacSystemFont,system-ui,"Helvetica Neue",Helvetica,Arial,sans-serif',
    fontVariantNumeric: 'tabular-nums', padding: '30px 40px 28px',
    display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden',
  };

  if (!data || data.error) {
    return (
      <div style={root}>
        <div style={{ fontSize: 34, fontWeight: 600, color: 'var(--tv-accent)', maxWidth: '80%' }}>
          {data?.error ?? (err ? `Sin conexión — ${err}` : 'Cargando…')}
        </div>
      </div>
    );
  }

  const { total, month, special } = data;
  const peak = Math.max(...data.hours.map((h) => Math.max(h.today, h.typical)), 1);
  const pos = (v: number | null) => v != null && v >= 0;
  const pct = month.target ? (month.mtd / month.target) * 100 : null;
  const openLocs = data.locations.filter((l) => l.open);
  const soon = data.locations.filter((l) => !l.open);
  const specialMax = Math.max(special.pastBest?.pct ?? 0, special.monthShare ?? 0, 1);

  const L = { fontSize: 28, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase' as const, color: 'var(--tv-ink3)' };
  const panel: React.CSSProperties = { background: 'var(--tv-panel)', borderRadius: 24 };

  return (
    <div style={root}>
      {/* header */}
      <div style={{ height: 70, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <img src={theme === 'dark' ? '/logo-sublogo-ivory.svg' : '/logo-sublogo.svg'}
               alt="Chunk Cookie Bar" style={{ height: 52 }} />
          <div style={{ width: 1, height: 44, background: 'var(--tv-line)' }} />
          <div style={L}>Ventas de hoy</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <div style={{ fontSize: 32, color: 'var(--tv-ink2)', letterSpacing: '-0.01em' }}>{longDate(data.day)}</div>
          <div onClick={toggle}
               style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 10px 8px 22px',
                        border: '1px solid var(--tv-border)', borderRadius: 999, cursor: 'pointer' }}>
            <div style={{ width: 12, height: 12, borderRadius: 999,
                          background: err ? 'var(--tv-neg)' : 'var(--tv-pos)' }} />
            <div style={{ fontSize: 28, color: 'var(--tv-ink3)' }}>Actualizado {clock(data.updatedAt)}</div>
          </div>
        </div>
      </div>

      {/* revenue + locations */}
      <div style={{ display: 'flex', gap: 16, height: 272, flex: 'none' }}>
        <div style={{ ...panel, width: 700, padding: '30px 44px', display: 'flex',
                      flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={L}>Ingresos hoy</div>
          <div style={{ fontSize: 126, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 0.92 }}>
            {money(total.revenue)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {total.deltaPct != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 999, padding: '7px 20px',
                            background: pos(total.deltaPct) ? 'var(--tv-pos)' : 'var(--tv-neg)',
                            color: 'var(--tv-on-pos)' }}>
                <span style={{ fontSize: 24, fontWeight: 600, lineHeight: 1 }}>{pos(total.deltaPct) ? '▲' : '▼'}</span>
                <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  {(total.deltaPct >= 0 ? '+' : '') + total.deltaPct.toFixed(1)}%
                </span>
              </div>
            )}
            <div style={{ fontSize: 29, lineHeight: 1.25, color: 'var(--tv-ink3)' }}>
              vs {weekday(data.day)} promedio<br />4 semanas · {money(total.typical)}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', gap: 16 }}>
          {openLocs.map((l) => (
            <div key={l.id} style={{ ...panel, flex: 1, padding: '34px 36px', display: 'flex',
                                     flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em' }}>{l.name}</div>
                <div style={{ fontSize: 28, color: 'var(--tv-ink4)', marginTop: 4 }}>{l.code}</div>
              </div>
              <div style={{ fontSize: 70, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1,
                            color: 'var(--tv-ink2)' }}>{money(l.revenue)}</div>
              <div style={{ display: 'flex', gap: 40 }}>
                <div>
                  <div style={{ fontSize: 28, color: 'var(--tv-ink4)' }}>Transacciones</div>
                  <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.01em' }}>{l.orders}</div>
                </div>
                <div>
                  <div style={{ fontSize: 28, color: 'var(--tv-ink4)' }}>Ticket promedio</div>
                  <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.01em' }}>{money2(l.avgTicket)}</div>
                </div>
              </div>
            </div>
          ))}
          {soon.map((l) => (
            <div key={l.id} style={{ background: 'var(--tv-panel2)', border: '1px solid var(--tv-border)',
                                     borderRadius: 24, width: 250, padding: '32px 28px', display: 'flex',
                                     flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--tv-ink3)' }}>{l.name}</div>
                <div style={{ fontSize: 28, color: 'var(--tv-ink5)' }}>{l.code}</div>
              </div>
              <div style={{ fontSize: 28, color: 'var(--tv-ink5)', letterSpacing: '0.08em',
                            textTransform: 'uppercase' }}>Próximamente</div>
            </div>
          ))}
        </div>
      </div>

      {/* hourly + monthly flavour */}
      <div style={{ display: 'flex', gap: 16, height: 258, flex: 'none' }}>
        <div style={{ ...panel, flex: 1, padding: '30px 40px 28px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={L}>Transacciones por hora</div>
            <div style={{ display: 'flex', gap: 30, fontSize: 28, color: 'var(--tv-ink4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 22, height: 14, borderRadius: 3, background: 'var(--tv-bar)' }} />Hoy</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 22, height: 14, borderRadius: 3, background: 'var(--tv-ghost)' }} />
                {weekday(data.day)} típico</div>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 16 }}>
            {data.hours.map((h) => (
              <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column',
                                         alignItems: 'center', gap: 12 }}>
                <div style={{ width: '100%', height: 120, position: 'relative' }}>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                                height: Math.max(4, (h.typical / peak) * 120),
                                background: 'var(--tv-ghost)', borderRadius: 5 }} />
                  <div style={{ position: 'absolute', bottom: 0, left: '24%', width: '52%',
                                height: Math.max(h.today ? 4 : 0, (h.today / peak) * 120),
                                background: 'var(--tv-bar)', borderRadius: 5 }} />
                </div>
                <div style={{ fontSize: 28, color: h.today ? 'var(--tv-ink4)' : 'var(--tv-ink5)' }}>{h.hour}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...panel, width: 660, padding: '26px 34px 28px', display: 'flex',
                      flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={L}>Sabor del mes</div>
            <div style={{ fontSize: 28, color: 'var(--tv-ink4)' }}>
              {new Date(`${data.day}T12:00:00-05:00`).toLocaleDateString('es-PA', { month: 'long' })}
            </div>
          </div>
          {special.flavour ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 36 }}>
                <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {special.flavour}
                </div>
                <div style={{ display: 'flex', gap: 36, paddingBottom: 2 }}>
                  <div>
                    <div style={{ fontSize: 28, color: 'var(--tv-ink4)' }}>Unidades hoy</div>
                    <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>{special.unitsToday}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 28, color: 'var(--tv-ink4)' }}>Del mix hoy</div>
                    <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1, color: 'var(--tv-ink2)' }}>
                      {special.pctToday.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 28, color: 'var(--tv-ink4)' }}>Share del mes vs especiales anteriores</div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 26 }}>
                  <div style={{ fontWeight: 600, color: 'var(--tv-accent)' }}>
                    {(special.monthShare ?? 0).toFixed(1)}% {special.flavour}
                  </div>
                  <div style={{ color: 'var(--tv-ink4)' }}>{(special.pastAverage ?? 0).toFixed(1)}% promedio</div>
                  <div style={{ color: 'var(--tv-ink4)' }}>
                    {(special.pastBest?.pct ?? 0).toFixed(1)}% {special.pastBest?.flavour ?? ''}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 32, color: 'var(--tv-ink4)' }}>Sin especial identificado este mes</div>
          )}
        </div>
      </div>

      {/* top 5 + month vs target */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        <div style={{ ...panel, flex: 1, padding: '22px 36px', display: 'flex',
                      flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={L}>Top 5 galletas hoy · unidades</div>
            <div style={{ fontSize: 28, color: 'var(--tv-ink4)' }}>{data.cookieUnits} galletas</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {data.topFlavours.length === 0 && (
              <div style={{ fontSize: 30, color: 'var(--tv-ink4)' }}>Sin ventas de galletas todavía</div>
            )}
            {data.topFlavours.map((f) => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ flex: 'none', width: 300, fontSize: 28, whiteSpace: 'nowrap',
                              fontWeight: f.isSpecial ? 600 : 400,
                              color: f.isSpecial ? 'var(--tv-accent)' : 'var(--tv-ink3)' }}>
                  {f.name}{f.isSpecial ? ' · del mes' : ''}
                </div>
                <div style={{ flex: 1, height: 14, background: 'var(--tv-track)', borderRadius: 4 }}>
                  <div style={{ height: 14, borderRadius: 4,
                                width: `${(f.units / (data.topFlavours[0]?.units || 1)) * 100}%`,
                                background: f.isSpecial ? 'var(--tv-accent)' : 'var(--tv-bar)' }} />
                </div>
                <div style={{ flex: 'none', width: 84, textAlign: 'right', fontSize: 31,
                              fontWeight: 600, letterSpacing: '-0.01em' }}>{f.units}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...panel, width: 660, padding: '24px 34px', display: 'flex',
                      flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={L}>Mes vs meta</div>
            <div style={{ fontSize: 28, color: 'var(--tv-ink4)' }}>
              {month.target ? `meta ${money(month.target)}` : 'meta no configurada'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
            <div style={{ fontSize: 66, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1 }}>
              {money(month.mtd)}
            </div>
            {pct != null && (
              <div style={{ fontSize: 40, fontWeight: 600, color: 'var(--tv-pos)', lineHeight: 1.4 }}>
                {pct.toFixed(1)}%
              </div>
            )}
          </div>
          <div>
            <div style={{ height: 30, background: 'var(--tv-track)', borderRadius: 6,
                          position: 'relative', overflow: 'hidden' }}>
              {pct != null && (
                <div style={{ position: 'absolute', inset: '0 auto 0 0',
                              width: `${Math.min(100, pct)}%`, background: 'var(--tv-bar)' }} />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10,
                          fontSize: 28, color: 'var(--tv-ink4)' }}>
              <div>día {month.dayOfMonth} de {month.daysInMonth} · todos los canales</div>
              <div>{month.target ? `faltan ${money(Math.max(0, month.target - month.mtd))}` : ''}</div>
            </div>
          </div>
        </div>
      </div>

      {/* last sales */}
      <div style={{ height: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 30,
                    overflow: 'hidden', color: 'var(--tv-ink4)', fontSize: 27 }}>
        <div style={{ ...L, fontSize: 24, flex: 'none' }}>Últimas ventas</div>
        {data.ticker.slice(0, 6).map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, whiteSpace: 'nowrap', flex: 'none' }}>
            <span style={{ color: 'var(--tv-ink5)' }}>{t.time}</span>
            <span>{t.detail}</span>
            <span style={{ color: 'var(--tv-ink2)', fontWeight: 600 }}>{money2(t.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
