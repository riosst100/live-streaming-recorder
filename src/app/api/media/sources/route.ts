import { getMediaManager } from '@/lib/media-manager';
import { parseChannelUrl } from '@/lib/parse-url';
import { error, json, mediaSourceView, readBody } from '@/lib/server-utils';
import { getStore } from '@/lib/store';
import type { MediaKind } from '@/lib/types';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

const isKind = (k: unknown): k is MediaKind => k === 'story' || k === 'feed';

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get('kind');
  if (!isKind(kind)) return error('kind harus story atau feed');
  const sources = getStore()
    .listMediaSources(kind)
    .map((s) => mediaSourceView(s.id)!);
  return json({ sources, pauses: getMediaManager().pauses() });
}

export async function POST(req: Request) {
  const body = await readBody<{ kind: MediaKind; url: string; cookies: string; enabled: boolean }>(req);
  if (!isKind(body.kind)) return error('kind harus story atau feed');
  const parsed = parseChannelUrl(String(body.url ?? ''));
  if (!parsed) return error('URL tidak dikenali. Contoh: https://www.instagram.com/username/ atau https://www.tiktok.com/@username');
  if (parsed.platform === 'tiktok' && body.kind === 'story') return error('Stories TikTok belum didukung, hanya Feed');

  const store = getStore();
  const dup = store.listMediaSources(body.kind).find((s) => s.platform === parsed.platform && s.username === parsed.username);
  if (dup) return error(`@${parsed.username} sudah ada di daftar ini`, 409);

  const src = store.addMediaSource({
    id: randomUUID(),
    kind: body.kind,
    platform: parsed.platform,
    username: parsed.username,
    url: parsed.platform === 'tiktok' ? `https://www.tiktok.com/@${parsed.username}` : parsed.url,
    enabled: body.enabled ?? true,
    cookies: body.cookies?.trim() || undefined,
    status: 'unknown',
    createdAt: Date.now(),
  });
  if (src.enabled) void getMediaManager().check(src.id);
  return json(mediaSourceView(src.id), 201);
}
