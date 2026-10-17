'use client';

type ApiInit = Omit<RequestInit, 'body'> & { body?: unknown };

export async function api<T = unknown>(url: string, init?: ApiInit): Promise<T> {
  const { body, ...rest } = init ?? {};
  const opts: RequestInit = { ...rest, cache: 'no-store' };
  if (body !== undefined) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    opts.headers = { 'Content-Type': 'application/json', ...(rest.headers ?? {}) };
  }
  const res = await fetch(url, opts);
  if (res.status === 401 && typeof window !== 'undefined' && !url.startsWith('/api/auth')) {
    window.location.href = '/login';
    throw new Error('Sesi berakhir');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}
