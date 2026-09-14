import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, read } from '@/lib/auth';

// Everything is gated — including the data API, so the numbers can't be read
// by skipping the screen.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|logo-.*\\.svg|icon-.*\\.png|apple-touch-icon.png|api/auth).*)'],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/login') return NextResponse.next();

  // Vercel's nightly catch-up job carries no PIN cookie. It proves itself with
  // CRON_SECRET, which Vercel sends as a bearer token. Scoped to this one path,
  // which returns only row counts, and shut entirely if the secret is unset.
  // Before this existed the job was answered 401 every night and did nothing.
  if (pathname === '/api/cron/backfill') {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return NextResponse.next();
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await read(req.cookies.get(COOKIE)?.value);
  if (session) {
    const res = NextResponse.next();
    res.headers.set('x-chunk-user', session.email);
    return res;
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}
