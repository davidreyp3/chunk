import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-8) var(--space-5)' }}>
      <h1 style={{ fontSize: 'var(--text-3xl)', letterSpacing: 'var(--track-3xl)',
                   lineHeight: 'var(--lead-3xl)', fontWeight: 700, margin: '0 0 var(--space-5)' }}>
        Chunk · Ventas
      </h1>
      <Link href="/tv" style={{ display: 'inline-block', background: 'var(--accent)',
            color: 'var(--accent-contrast)', padding: '12px 22px', borderRadius: 'var(--radius-sm)',
            fontWeight: 600 }}>
        Modo TV
      </Link>
    </main>
  );
}
