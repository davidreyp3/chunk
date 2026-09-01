'use client';

const T = {
  '--tv-bg': '#1E110D', '--tv-panel': '#2B1811', '--tv-ink': '#FEF4E7',
  '--tv-ink3': '#B3A08F', '--tv-ink4': '#8A7565', '--tv-accent': '#C98B4B',
} as React.CSSProperties;

const SECTIONS = [
  ['Flavour programme', 'Every monthly special ranked by share of its own month, within-month decay, and whether it grew the category or just took share.'],
  ['Hours and shifts', 'Day × hour heatmap per store — the staffing tool. Peak, second peak, and the hours one person can cover.'],
  ['Tips', 'Tip rate over time, by store and by cashier. Never counted into revenue.'],
  ['Products and mix', 'Units by product, format mix, normal vs premium, category mix.'],
  ['Channels and wholesale', 'Channel share over time, and wholesale broken out by each of the nine accounts.'],
];

export default function Analysis() {
  return (
    <div style={{ ...T, minHeight: '100vh', background: 'var(--tv-bg)', color: 'var(--tv-ink)',
                  fontFamily: '-apple-system,BlinkMacSystemFont,system-ui,sans-serif',
                  padding: '76px 20px 40px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, letterSpacing: '.12em', textTransform: 'uppercase',
                      color: 'var(--tv-ink3)', fontWeight: 700 }}>Analysis</div>
        <div style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 700, letterSpacing: '-.022em',
                      lineHeight: 1.1 }}>Coming next</div>
        <p style={{ color: 'var(--tv-ink3)', margin: '0 0 10px', maxWidth: '52ch', lineHeight: 1.5 }}>
          Built on the same live data as the wall board — 50,737 orders back to October 2024.
        </p>
        {SECTIONS.map(([title, desc]) => (
          <div key={title} style={{ background: 'var(--tv-panel)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.01em' }}>{title}</div>
            <div style={{ fontSize: 14, color: 'var(--tv-ink4)', marginTop: 5, lineHeight: 1.5 }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
