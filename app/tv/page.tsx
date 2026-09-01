'use client';

import { useEffect, useState } from 'react';

type Payload = {
  error?: string;
  day: string; updatedAt: string;
  total: { revenue: number; typical: number; deltaPct: number | null; orders: number; avgTicket: number };
  locations: { id: number; name: string; revenue: number; orders: number; avgTicket: number; deltaPct: number | null }[];
  hours: { hour: number; today: number; typical: number }[];
  cookieUnits: number;
  topFlavours: { name: string; units: number; pct: number }[];
  nonRetail: number;
};

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const money2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Panama' });
const longDate = (d: string) =>
  new Date(`${d}T12:00:00-05:00`).toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long' });

/** Trading window across both stores: Tocumen 05:00-22:00, Sunset 10:00-19:00. */
const HOURS = Array.from({ length: 18 }, (_, i) => i + 5);

export default function TvPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // The TV is the scheduler: no cron needed, and it only runs while someone can see it.
    document.documentElement.dataset.theme = 'dark';
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/tv', { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        if (alive) { setData(await r.json()); setErr(null); }
      } catch (e: any) {
        if (alive) setErr(e.message);   // keep showing the last good numbers
      }
    };
    load();
    const t = setInterval(load, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!data || data.error) {
    return (
      <main style={S.wrap}>
        <div style={{ ...S.label, fontSize: 34, color: 'var(--status-warn)', maxWidth: '80%' }}>
          {data?.error ?? (err ? `Sin conexión — ${err}` : 'Cargando…')}
        </div>
      </main>
    );
  }

  const peak = Math.max(...data.hours.map((h) => Math.max(h.today, h.typical)), 1);
  const up = (d: number | null) => d != null && d >= 0;

  return (
    <main style={S.wrap}>
      <header style={S.header}>
        <div style={{ ...S.label, fontSize: 26 }}>{longDate(data.day)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {err && <div style={{ ...S.label, color: 'var(--status-warn)', fontSize: 24 }}>datos en pausa</div>}
          <div style={{ fontSize: 28, color: 'var(--ink-secondary)' }}>
            Actualizado {clock(data.updatedAt)}
          </div>
        </div>
      </header>

      <section style={S.heroRow}>
        <div style={S.hero}>
          <div style={S.label}>Venta de hoy</div>
          <div style={S.figure}>${money(data.total.revenue)}</div>
          <div style={{ fontSize: 30, color: 'rgba(255,239,206,.72)' }}>
            vs. {longDate(data.day).split(' ')[0]} típico ${money(data.total.typical)}
          </div>
        </div>
        <div style={S.deltaBox(up(data.total.deltaPct))}>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1 }}>
            {data.total.deltaPct == null ? '—'
              : `${up(data.total.deltaPct) ? '▲' : '▼'} ${Math.abs(data.total.deltaPct).toFixed(1)}%`}
          </div>
        </div>
      </section>

      <section style={S.row3}>
        {data.locations.map((l) => (
          <div key={l.id} style={S.card}>
            <div style={S.label}>{l.name}</div>
            <div style={S.value}>${money(l.revenue)}</div>
            <div style={{ fontSize: 28, color: l.deltaPct == null ? 'var(--ink-muted)'
                          : up(l.deltaPct) ? 'var(--status-good)' : 'var(--status-bad)' }}>
              {l.deltaPct == null ? '—'
                : `${up(l.deltaPct) ? '▲' : '▼'} ${Math.abs(l.deltaPct).toFixed(1)}%`}
              <span style={{ color: 'var(--ink-muted)' }}> · {l.orders} tx · ${money2(l.avgTicket)}</span>
            </div>
          </div>
        ))}
        <div style={S.card}>
          <div style={S.label}>Galletas hoy</div>
          <div style={S.value}>{data.cookieUnits}</div>
          <div style={{ fontSize: 28, color: 'var(--ink-muted)' }}>
            {data.total.orders} transacciones · ${money2(data.total.avgTicket)} promedio
          </div>
        </div>
      </section>

      <section style={S.row2}>
        <div style={{ ...S.card, display: 'flex', flexDirection: 'column' }}>
          <div style={S.label}>Venta por hora · hoy vs. típico</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 22 }}>
            {HOURS.map((h) => {
              const row = data.hours.find((x) => x.hour === h) ?? { today: 0, typical: 0 };
              return (
                <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column',
                                      alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <div style={{ position: 'relative', width: '100%', height: '100%',
                                display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', height: `${(row.today / peak) * 100}%`,
                                  background: 'var(--cat-1)', borderRadius: '6px 6px 0 0', minHeight: 2 }} />
                    <div style={{ position: 'absolute', left: 0, right: 0,
                                  bottom: `${(row.typical / peak) * 100}%`,
                                  borderTop: '3px dashed rgba(255,239,206,.45)' }} />
                  </div>
                  <div style={{ fontSize: 22, color: 'var(--ink-muted)', marginTop: 8 }}>
                    {String(h).padStart(2, '0')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={S.card}>
          <div style={S.label}>Top 5 galletas · unidades</div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {data.topFlavours.length === 0 && (
              <div style={{ fontSize: 30, color: 'var(--ink-muted)' }}>Sin ventas todavía</div>
            )}
            {data.topFlavours.map((f, i) => (
              <div key={f.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              alignItems: 'baseline', marginBottom: 7 }}>
                  <div style={{ fontSize: 30, letterSpacing: '-.011em' }}>{f.name}</div>
                  <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.016em' }}>{f.units}</div>
                </div>
                <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,239,206,.12)' }}>
                  <div style={{ height: 10, borderRadius: 5, background: 'var(--cat-1)',
                                width: `${data.topFlavours[0].units ? (f.units / data.topFlavours[0].units) * 100 : 0}%`,
                                opacity: 1 - i * 0.14 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {data.nonRetail > 0 && (
        <div style={{ ...S.label, fontSize: 24 }}>
          Mayorista y eventos hoy · ${money(data.nonRetail)} — fuera de la venta retail
        </div>
      )}
    </main>
  );
}

const S: Record<string, any> = {
  wrap: {
    height: '100vh', overflow: 'hidden', background: 'var(--ground)', color: 'var(--ink)',
    fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums',
    padding: '30px 44px 26px', display: 'flex', flexDirection: 'column', gap: 20,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  label: {
    fontSize: 28, fontWeight: 700, letterSpacing: '.12em',
    textTransform: 'uppercase', color: 'var(--ink-muted)',
  },
  heroRow: { display: 'grid', gridTemplateColumns: '1fr 320px', gap: 22 },
  hero: {
    background: 'var(--chunk-brown)', color: 'var(--chunk-cream)',
    borderRadius: 'var(--radius-lg)', padding: '24px 38px',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10,
  },
  figure: { fontSize: 118, fontWeight: 700, letterSpacing: '-.035em', lineHeight: .9 },
  deltaBox: (good: boolean) => ({
    borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: good ? 'var(--status-good)' : 'var(--status-bad)', color: 'var(--ground)',
  }),
  row3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 },
  row2: { display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 22, flex: 1, minHeight: 0 },
  card: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px 28px',
         minHeight: 0, overflow: 'hidden' },
  value: { fontSize: 54, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.1, margin: '4px 0' },
};
