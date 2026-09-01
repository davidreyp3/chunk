const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SECRET_KEY!;

function headers(extra: Record<string, string> = {}) {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra };
}

/** PostgREST caps a response at 1000 rows, so page explicitly. */
export async function select<T = any>(path: string): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch(`${URL}/rest/v1/${path}${sep}limit=1000&offset=${offset}`, {
      headers: headers(),
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const batch = (await r.json()) as T[];
    out.push(...batch);
    if (batch.length < 1000) return out;
    offset += 1000;
  }
}

export async function upsert(table: string, rows: any[], conflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(`${URL}/rest/v1/${table}?on_conflict=${conflict}`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!r.ok) throw new Error(`Supabase upsert ${table} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}
