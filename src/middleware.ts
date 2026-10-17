import { NextResponse, type NextRequest } from 'next/server';
import { isValidSession, SESSION_COOKIE } from './lib/auth';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) return NextResponse.next();
  if (isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Node.js runtime supaya PASSWORD dibaca saat runtime (bukan di-inline saat build)
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
