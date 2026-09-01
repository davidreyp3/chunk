'use client';

import { useState } from 'react';

export type View = 'tv' | 'analysis';
const PAGES: { id: View; label: string }[] = [
  { id: 'tv', label: "TV · Today's sales" },
  { id: 'analysis', label: 'Analysis' },
];

/** Top-right, outside the scaled board so it stays tappable at real size. */
export default function Nav({ view, onSelect }: { view: View; onSelect: (v: View) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-label="Menu"
        style={{ position: 'fixed', top: 14, right: 14, zIndex: 50, width: 44, height: 44,
                 borderRadius: 12, border: '1px solid rgba(219,200,182,0.18)',
                 background: 'rgba(43,24,17,0.72)', backdropFilter: 'blur(14px)',
                 WebkitBackdropFilter: 'blur(14px)', color: '#DBC8B6', cursor: 'pointer',
                 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                 flexDirection: 'column', transition: 'transform 100ms cubic-bezier(.32,.72,0,1)' }}
        onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.94)')}
        onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ display: 'block', width: 18, height: 2, borderRadius: 2,
                                 background: 'currentColor' }} />
        ))}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)}
               style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'rgba(30,17,13,0.55)' }} />
          <div style={{ position: 'fixed', top: 68, right: 14, zIndex: 49, minWidth: 258,
                        borderRadius: 18, padding: 8, background: 'rgba(43,24,17,0.92)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                        border: '1px solid rgba(219,200,182,0.14)',
                        boxShadow: '0 20px 48px -20px rgba(0,0,0,.7)',
                        fontFamily: '-apple-system,BlinkMacSystemFont,system-ui,sans-serif' }}>
            {PAGES.map((p) => (
              <button key={p.id} onClick={() => { onSelect(p.id); setOpen(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 0,
                         padding: '13px 16px', borderRadius: 12, fontSize: 16, cursor: 'pointer',
                         fontFamily: 'inherit',
                         color: view === p.id ? '#FEF4E7' : '#B3A08F',
                         fontWeight: view === p.id ? 600 : 400,
                         background: view === p.id ? 'rgba(219,200,182,0.10)' : 'transparent' }}>
                {p.label}
              </button>
            ))}
            <div style={{ height: 1, background: 'rgba(219,200,182,0.14)', margin: '8px 12px' }} />
            <a href="/api/logout"
               style={{ display: 'block', padding: '13px 16px', borderRadius: 12,
                        fontSize: 16, color: '#8A7565', textDecoration: 'none' }}>Sign out</a>
          </div>
        </>
      )}
    </>
  );
}
