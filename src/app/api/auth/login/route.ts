import { authEnabled, safeEqual, SESSION_COOKIE, sessionToken } from '@/lib/auth';
import { error, readBody } from '@/lib/server-utils';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const attempts = new Map<string, { count: number; until: number }>();

export async function POST(req: Request) {
  if (!authEnabled()) return NextResponse.json({ ok: true });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) return error('Terlalu banyak percobaan, coba lagi nanti', 429);

  const { password } = await readBody<{ password: string }>(req);
  if (typeof password !== 'string' || !safeEqual(password, process.env.PASSWORD ?? '')) {
    const count = (a?.count ?? 0) + 1;
    attempts.set(ip, { count, until: count >= 5 ? Date.now() + 5 * 60_000 : 0 });
    await new Promise((r) => setTimeout(r, 500));
    return error('Password salah', 401);
  }

  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.headers.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
