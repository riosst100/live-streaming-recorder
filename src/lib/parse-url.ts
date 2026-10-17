import type { Platform } from './types';

export interface ParsedChannel {
  platform: Platform;
  username: string;
  url: string;
}

const IG_RESERVED = new Set([
  'p', 'reel', 'reels', 'tv', 'explore', 'accounts', 'direct', 'stories', 'about', 'developer', 'legal',
]);

/** Ubah URL profil TikTok/Instagram menjadi { platform, username, url }. */
export function parseChannelUrl(input: string): ParsedChannel | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    const p = parts.find((x) => x.startsWith('@'));
    const username = p?.slice(1);
    if (!username || !/^[\w.-]{1,64}$/.test(username)) return null;
    return { platform: 'tiktok', username, url: `https://www.tiktok.com/@${username}/live` };
  }

  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    let name = parts[0];
    if (name === 'stories') name = parts[1];
    if (!name || IG_RESERVED.has(name.toLowerCase()) || !/^[A-Za-z0-9._]{1,30}$/.test(name)) return null;
    const username = name.toLowerCase();
    return { platform: 'instagram', username, url: `https://www.instagram.com/${username}/` };
  }

  return null;
}
