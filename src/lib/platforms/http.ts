export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request(url: string, headers: Record<string, string>): Promise<Response> {
  const res = await fetch(url, {
    headers,
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429) throw new HttpError('Rate limited (429): server membatasi permintaan dari IP/akun ini', 429);
  return res;
}

export async function fetchText(url: string, headers: Record<string, string>): Promise<string> {
  const res = await request(url, headers);
  if (!res.ok) throw new HttpError(`HTTP ${res.status} dari ${new URL(url).hostname}`, res.status);
  return res.text();
}

export async function fetchJson<T = any>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await request(url, headers);
  const text = await res.text();
  if (!res.ok) throw new HttpError(`HTTP ${res.status} dari ${new URL(url).hostname}`, res.status);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(`Respon bukan JSON dari ${new URL(url).hostname} (kemungkinan perlu login/cookies)`, res.status);
  }
}
