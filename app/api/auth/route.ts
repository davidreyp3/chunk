import { NextResponse } from 'next/server';
import { COOKIE, issue } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Two ways in, same session cookie either way:
 *  - a shared 4-digit code (what we use today)
 *  - email + password, verified by Supabase (ready whenever you add users)
 *  Switching is a change to the login screen only — nothing here needs touching. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));

  if (body.pin != null) {
    // 10,000 combinations is only safe if guessing is slow.
    await new Promise((r) => setTimeout(r, 600));
    const expected = process.env.DASHBOARD_PIN;
    if (!expected) {
      return NextResponse.json({ error: 'DASHBOARD_PIN is not set on the server' }, { status: 500 });
    }
    if (String(body.pin) !== String(expected)) {
      return NextResponse.json({ error: 'Incorrect code' }, { status: 401 });
    }
    return sessionFor('shared');
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Auth is not configured on the server' }, { status: 500 });
  }
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  // Deliberately vague — don't reveal which accounts exist.
  if (!r.ok) return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 });
  return sessionFor(String(email).toLowerCase());
}

async function sessionFor(who: string) {
  const { value, maxAge } = await issue(who);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, value, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
