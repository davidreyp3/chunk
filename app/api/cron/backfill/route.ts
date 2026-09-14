import { NextResponse } from 'next/server';
import { refreshDays } from '@/lib/refresh';
import { businessToday } from '@/lib/panama';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Re-pulls this many days, ending today. At 01:00 Panama that is the day
 *  before yesterday, yesterday (now complete) and the new day. Three means two
 *  nights in a row can fail and the next run still repairs both. */
const DAYS_BACK = 3;

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function GET(req: Request) {
  // Checked here as well as in middleware: this route writes to the database,
  // so it should never depend on a single gate. Closed if the secret is unset.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = businessToday();
  const days = Array.from({ length: DAYS_BACK }, (_, i) => shift(today, i - (DAYS_BACK - 1)));
  try {
    // Only counts come back — never sales figures — so even a leaked secret
    // could make it re-pull, but not read anything.
    return NextResponse.json({ ok: true, ...(await refreshDays(days)) },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e).slice(0, 300) },
      { status: 500 });
  }
}
