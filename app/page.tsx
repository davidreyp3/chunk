'use client';

import { useEffect, useState } from 'react';
import { type View } from '@/components/Nav';
import TvBoard from '@/components/TvBoard';
import Analysis from '@/components/Analysis';

/** One URL for the whole dashboard — the menu swaps the view, no navigation. */
export default function Dashboard() {
  const [view, setView] = useState<View>('tv');

  // Remember the view so a reloaded TV comes back to the board, not a menu.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chunk-view');
      if (saved === 'tv' || saved === 'analysis') setView(saved);
    } catch {}
  }, []);

  const select = (v: View) => {
    setView(v);
    try { localStorage.setItem('chunk-view', v); } catch {}
  };

  return (
    <>
      {view === 'tv'
        ? <TvBoard view={view} onSelect={select} />
        : <Analysis view={view} onSelect={select} />}
    </>
  );
}
