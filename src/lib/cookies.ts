// Parser cookies (pure, bisa dipakai di client & server).
// Format yang didukung:
//  1. Header string:   "sessionid=abc; csrftoken=xyz"
//  2. Netscape cookies.txt (export dari extension "Get cookies.txt LOCALLY")
//  3. JSON array (export dari extension "Cookie-Editor" / "EditThisCookie")

export interface ParsedCookie {
  name: string;
  value: string;
  domain?: string;
}

export function parseCookies(input?: string | null): ParsedCookie[] {
  const s = (input ?? '').trim();
  if (!s) return [];

  if (s.startsWith('[') || s.startsWith('{')) {
    try {
      const j = JSON.parse(s);
      const arr: unknown[] = Array.isArray(j) ? j : Array.isArray(j?.cookies) ? j.cookies : [];
      return arr
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && 'name' in c)
        .map((c) => ({
          name: String(c.name),
          value: String(c.value ?? ''),
          domain: typeof c.domain === 'string' ? c.domain : undefined,
        }));
    } catch {
      // bukan JSON valid, lanjut format lain
    }
  }

  const netscape = s
    .split(/\r?\n/)
    .filter((l) => (l && !l.startsWith('#')) || l.startsWith('#HttpOnly_'))
    .map((l) => l.replace(/^#HttpOnly_/, '').split('\t'))
    .filter((p) => p.length >= 7);
  if (netscape.length) {
    return netscape.map((p) => ({ domain: p[0], name: p[5], value: p[6].trim() }));
  }

  return s
    .replace(/^cookie:\s*/i, '')
    .split(/;\s*|\r?\n/)
    .map((kv) => {
      const i = kv.indexOf('=');
      return i > 0 ? { name: kv.slice(0, i).trim(), value: kv.slice(i + 1).trim() } : null;
    })
    .filter((c): c is ParsedCookie => !!c && !!c.name);
}

/** Ubah cookies ke header `Cookie:`; filter domain jika format mengandung domain. */
export function cookieHeader(input: string | undefined | null, domainHint?: string): string {
  const seen = new Map<string, string>();
  for (const c of parseCookies(input)) {
    if (domainHint && c.domain && !c.domain.replace(/^\./, '').endsWith(domainHint)) continue;
    seen.set(c.name, c.value);
  }
  return [...seen].map(([k, v]) => `${k}=${v}`).join('; ');
}

export function getCookieValue(header: string, name: string): string | undefined {
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return undefined;
}

/** Ubah cookies ke format Netscape cookies.txt (untuk `yt-dlp --cookies`). */
export function toNetscape(input: string | undefined | null, defaultDomain: string): string {
  const lines = ['# Netscape HTTP Cookie File'];
  for (const c of parseCookies(input)) {
    const domain = c.domain || `.${defaultDomain}`;
    lines.push([domain, domain.startsWith('.') ? 'TRUE' : 'FALSE', '/', 'TRUE', '0', c.name, c.value].join('\t'));
  }
  return lines.join('\n') + '\n';
}
