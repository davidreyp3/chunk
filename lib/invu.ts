import { panamaDayBounds } from './panama';

const BASE = 'https://api6.invupos.com';

/** INVU double-encodes UTF-8: "CAFÃ‰" -> "CAFÉ" */
export const fix = (s: unknown): string | null =>
  typeof s === 'string' ? Buffer.from(s, 'latin1').toString('utf8') : null;

export const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** INVU timestamps are Panama local with no zone marker. */
export const ts = (s: unknown): string | null =>
  typeof s === 'string' && s.length >= 19 ? `${s.slice(0, 10)}T${s.slice(11, 19)}-05:00` : null;

const tokens = new Map<string, { token: string; at: number }>();

export async function invuToken(user: string, pass: string): Promise<string> {
  const cached = tokens.get(user);
  // Tokens last 15 days; refresh well inside that.
  if (cached && Date.now() - cached.at < 6 * 86_400_000) return cached.token;

  const r = await fetch(`${BASE}/invuApiPos/userAuth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass, grant_type: 'authorization' }),
    cache: 'no-store',
  });
  const j = await r.json();
  // INVU returns HTTP 200 even on failure — the error is in the body, not the status.
  if (!j?.authorization) throw new Error(`INVU auth failed for ${user}: ${JSON.stringify(j).slice(0, 160)}`);
  tokens.set(user, { token: j.authorization, at: Date.now() });
  return j.authorization;
}

/** One Panama day only — a month-wide query returns ~18 MB by month end. */
export async function invuSalesForDay(token: string, day: string): Promise<any[]> {
  const { fini, ffin } = panamaDayBounds(day);
  const url = `${BASE}/invuApiPos/index.php?r=citas/ordenesAllAdv/fini/${fini}/ffin/${ffin}/tipo/all/grouping/false`;
  const r = await fetch(url, { headers: { AUTHORIZATION: token }, cache: 'no-store' });
  const j = await r.json();
  if (j && typeof j === 'object' && !('data' in j)) {
    throw new Error(`INVU error: ${JSON.stringify(j).slice(0, 160)}`);
  }
  return j.data || [];
}
