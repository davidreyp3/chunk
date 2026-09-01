'use client';

import { useState } from 'react';

export type View = 'tv' | 'analysis';
const PAGES: { id: View; label: string }[] = [
  { id: 'tv', label: "TV · Today's sales" },
  { id: 'analysis', label: 'Analysis' },
];

/** Renders inline so it aligns with whatever row it sits in — the board header
 *  or the phone header — rather than floating against the screen edge. */
export default function Nav({ view, onSelect, size = 44 }: {
  view: View; onSelect: (v: View) => void; size?: number;
}) {
  const [open, setOpen] = useState(false);
  const bar = Math.round(size * 0.41);

  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Menu"
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.27),
                 border: '1px solid var(--tv-border, rgba(219,200,182,0.18))',
                 background: 'transparent', color: 'var(--tv-ink3, #B3A08F)', cursor: 'pointer',
                 display: 'flex', alignItems: 'center', justifyContent: 'center',
                 gap: Math.max(3, Math.round(size * 0.09)), flexDirection: 'column',
                 transition: 'transform 100ms cubic-bezier(.32,.72,0,1)' }}
        onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.94)')}
        onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ display: 'block', width: bar, height: 2, borderRadius: 2,
                                 background: 'currentColor' }} />
        ))}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)}
               style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'rgba(30,17,13,0.55)' }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 49,
                        minWidth: 258, borderRadius: 18, padding: 8,
                        background: 'rgba(43,24,17,0.94)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                        border: '1px solid rgba(219,200,182,0.14)',
                        boxShadow: '0 20px 48px -20px rgba(0,0,0,.7)', textAlign: 'left',
                        fontFamily: '-apple-system,BlinkMacSystemFont,system-ui,sans-serif' }}>
            {PAGES.map((p) => (
              <button key={p.id} onClick={() => { onSelect(p.id); setOpen(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 0,
                         padding: '13px 16px', borderRadius: 12, fontSize: 16, cursor: 'pointer',
                         fontFamily: 'inherit', letterSpacing: 0, textTransform: 'none',
                         color: view === p.id ? '#FEF4E7' : '#B3A08F',
                         fontWeight: view === p.id ? 600 : 400,
                         background: view === p.id ? 'rgba(219,200,182,0.10)' : 'transparent' }}>
                {p.label}
              </button>
            ))}
            <div style={{ height: 1, background: 'rgba(219,200,182,0.14)', margin: '8px 12px' }} />
            <a href="/api/logout"
               style={{ display: 'block', padding: '13px 16px', borderRadius: 12, fontSize: 16,
                        color: '#8A7565', textDecoration: 'none', letterSpacing: 0,
                        textTransform: 'none', fontWeight: 400 }}>Sign out</a>
          </div>
        </>
      )}
    </div>
  );
}
