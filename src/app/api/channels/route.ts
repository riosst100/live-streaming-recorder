import { getManager } from '@/lib/manager';
import { parseChannelUrl } from '@/lib/parse-url';
import { channelView, diskInfo, error, json, listChannelViews, readBody } from '@/lib/server-utils';
import { getStore } from '@/lib/store';
import type { TikTokQuality } from '@/lib/types';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  return json({ channels: listChannelViews(), disk: diskInfo() });
}

export async function POST(req: Request) {
  const body = await readBody<{ url: string; cookies: string; enabled: boolean; quality: TikTokQuality }>(req);
  const parsed = parseChannelUrl(String(body.url ?? ''));
  if (!parsed) return error('URL tidak dikenali. Contoh: https://www.tiktok.com/@user atau https://www.instagram.com/user/');

  const store = getStore();
  const dup = store
    .listChannels()
    .find((c) => c.platform === parsed.platform && c.username.toLowerCase() === parsed.username.toLowerCase());
  if (dup) return error(`Channel @${parsed.username} (${parsed.platform}) sudah ada`, 409);

  const ch = store.addChannel({
    id: randomUUID(),
    ...parsed,
    enabled: body.enabled ?? true,
    cookies: body.cookies?.trim() || undefined,
    quality: body.quality || undefined,
    status: 'unknown',
    createdAt: Date.now(),
  });
  void getManager().check(ch.id);
  return json(channelView(ch.id), 201);
}
