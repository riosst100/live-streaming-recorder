import { authEnabled, isValidSession, SESSION_COOKIE, sessionKind, sessionToken, setPassword, verifyPassword } from '@/lib/auth';
import { error, readBody } from '@/lib/server-utils';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Mengubah password USER (password sistem dari env PASSWORD tidak berubah).
 * Boleh dipanggil dari sesi password sistem maupun password user.
 * /api/auth/* dilewati middleware, jadi sesi diperiksa di sini.
 */
export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!isValidSession(token)) return error('Unauthorized', 401);

  const { current, next } = await readBody<{ current: string; next: string }>(req);
  if (authEnabled() && (typeof current !== 'string' || !verifyPassword(current))) {
    await new Promise((r) => setTimeout(r, 500));
    return error('Password saat ini salah', 400);
  }
  if (typeof next !== 'string' || next.length < 6) return error('Password baru minimal 6 karakter', 400);
  if (process.env.PASSWORD && next === process.env.PASSWORD) {
    return error('Password user tidak boleh sama dengan password sistem', 400);
  }

  const kind = sessionKind(token);
  setPassword(next);
  const res = NextResponse.json({ ok: true });
  // Sesi password user memakai token berbasis hash lama → terbitkan token baru agar sesi ini tidak keluar.
  // Sesi password sistem tidak terpengaruh.
  if (kind !== 'system') {
    res.cookies.set(SESSION_COOKIE, sessionToken('user'), {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.headers.get('x-forwarded-proto') === 'https',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}
