'use client';

import { useState, useEffect, useCallback } from 'react';

const T = {
  '--tv-bg': '#1E110D', '--tv-panel': '#2B1811', '--tv-ink': '#FEF4E7',
  '--tv-ink3': '#B3A08F', '--tv-track': 'rgba(219,200,182,0.12)',
  '--tv-accent': '#C98B4B', '--tv-neg': '#C4694A',
} as React.CSSProperties;

export default function Login() {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async (code: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }),
      });
      if (!r.ok) { setErr((await r.json()).error ?? 'Incorrect code'); setPin(''); return; }
      // Everything lives at '/' now. Ignore stale '/tv' links and anything
      // off-site — a redirect target from the query string is untrusted input.
      const next = new URLSearchParams(window.location.search).get('next') ?? '';
      const safe = next.startsWith('/') && !next.startsWith('//') && next !== '/tv' ? next : '/';
      window.location.href = safe;
    } catch { setErr('Offline'); setPin(''); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { if (pin.length === 4 && !busy) submit(pin); }, [pin, busy, submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p));
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const key = (label: string, onClick: () => void) => (
    <button key={label} onClick={onClick} disabled={busy}
      style={{ fontSize: 28, fontWeight: 500, padding: '16px 0', borderRadius: 16, border: 0,
               background: 'var(--tv-panel)', color: 'var(--tv-ink)', cursor: 'pointer',
               fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums',
               transition: 'transform 100ms cubic-bezier(.32,.72,0,1)' }}
      onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
      onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
      {label}
    </button>
  );

  return (
    <div style={{ ...T, minHeight: '100vh', background: 'var(--tv-bg)', color: 'var(--tv-ink)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 26,
                  padding: 'calc(24px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom))',
                  fontFamily: '-apple-system,BlinkMacSystemFont,system-ui,sans-serif' }}>
      <img src="/logo-sublogo-ivory.svg" alt="Chunk Cookie Bar" style={{ height: 48 }} />
      <div style={{ fontSize: 14, letterSpacing: '.1em', textTransform: 'uppercase',
                    color: 'var(--tv-ink3)', fontWeight: 600 }}>Access code</div>

      <div style={{ display: 'flex', gap: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: 999,
                                background: i < pin.length ? 'var(--tv-accent)' : 'var(--tv-track)',
                                transition: 'background 150ms' }} />
        ))}
      </div>

      <div style={{ height: 20, fontSize: 14, color: 'var(--tv-neg)' }}>{err ?? ''}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 82px)', gap: 12 }}>
        {['1','2','3','4','5','6','7','8','9'].map((n) =>
          key(n, () => setPin((p) => (p.length < 4 ? p + n : p))))}
        <div />
        {key('0', () => setPin((p) => (p.length < 4 ? p + '0' : p)))}
        {key('←', () => setPin((p) => p.slice(0, -1)))}
      </div>
    </div>
  );
}
