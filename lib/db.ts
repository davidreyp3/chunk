const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SECRET_KEY!;

function headers(extra: Record<string, string> = {}) {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra };
}

/** PostgREST offset paging is only stable under a total ordering. Without one
 *  Postgres may return rows in a different order for each page, so the same
 *  row comes back twice and another is never seen — silently, with the right
 *  row count. Observed here: two runs of the same payments query differed by
 *  $17,000, one of them losing 7,841 of 33,919 rows.
 *
 *  When the caller hasn't ordered, order by every column being selected. Rows
 *  that tie on all of them are identical, so their relative order can't matter.
 */
function stableOrder(path: string): string {
  if (/[?&]order=/.test(path)) return '';
  const m = /[?&]select=([^&]+)/.exec(path);
  const cols = m
    ? decodeURIComponent(m[1])
        .replace(/[\w]+\([^)]*\)/g, '')      // drop embedded resources: order_lines(qty)
        .split(',')
        .map((c) => c.trim().split(':').pop()!.trim())
        .filter((c) => c && c !== '*')
    : [];
  if (!cols.length)
    throw new Error(`select("${path.slice(0, 60)}") cannot be paged safely: `
      + 'add an explicit &order=, or name the columns in select=.');
  return `&order=${cols.join(',')}`;
}

/** PostgREST caps a response at 1000 rows, so page explicitly. */
export async function select<T = any>(path: string): Promise<T[]> {
  const out: T[] = [];
  const sep = path.includes('?') ? '&' : '?';
  const order = stableOrder(path);
  let offset = 0;
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${path}${sep}limit=1000&offset=${offset}${order}`, {
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

/** Call a Postgres function. Aggregation happens in the database, so these
 *  return hundreds of rows where the raw tables would return tens of thousands. */
export async function rpc<T = any>(fn: string, params: Record<string, string | number | null>) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}?${qs}&limit=1000&offset=${offset}`, {
      headers: headers(), cache: 'no-store',
    });
    if (!r.ok) throw new Error(`Supabase rpc ${fn} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const batch = (await r.json()) as T[];
    out.push(...batch);
    if (batch.length < 1000) return out;
    // Same trap as select(): a second page of an unordered result is not
    // guaranteed to continue where the first left off.
    throw new Error(`rpc ${fn} returned a full page; it needs an explicit order `
      + 'before it can be paged safely.');
  }
}
