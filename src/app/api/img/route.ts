// Proxy avatar (CDN TikTok/Instagram sering menolak hotlink dari domain lain).
export const dynamic = 'force-dynamic';

const ALLOWED = /(^|\.)(tiktokcdn(-[a-z]+)?\.com|tiktokcdn\.com|ibyteimg\.com|byteimg\.com|cdninstagram\.com|fbcdn\.net)$/i;

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get('url');
  let u: URL;
  try {
    u = new URL(target ?? '');
  } catch {
    return new Response('bad url', { status: 400 });
  }
  if (u.protocol !== 'https:' || !ALLOWED.test(u.hostname)) return new Response('host not allowed', { status: 403 });

  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(10_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return new Response('upstream error', { status: 502 });
    return new Response(res.body, {
      headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' },
    });
  } catch {
    return new Response('upstream error', { status: 502 });
  }
}
