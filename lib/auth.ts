/** Signed session cookie. Runs on the Edge runtime, so Web Crypto only.
 *  Supabase verifies the password; we mint and verify the session ourselves. */
export const COOKIE = 'chunk_session';
const DAYS = 30;

const secret = () =>
  process.env.DASHBOARD_SECRET || process.env.SUPABASE_SECRET_KEY || 'chunk-dev-secret';

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as any)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) =>
  atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));

async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

export type Session = { email: string; exp: number };

export async function issue(email: string): Promise<{ value: string; maxAge: number }> {
  const payload = b64u(enc.encode(JSON.stringify({ email, exp: Date.now() + DAYS * 864e5 })));
  return { value: `${payload}.${await hmac(payload)}`, maxAge: DAYS * 86400 };
}

export async function read(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  if ((await hmac(payload)) !== sig) return null;
  try {
    const s = JSON.parse(unb64u(payload)) as Session;
    return s.exp > Date.now() ? s : null;
  } catch { return null; }
}
