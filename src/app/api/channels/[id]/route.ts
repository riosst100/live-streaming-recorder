import { getManager } from '@/lib/manager';
import { channelView, error, json, readBody } from '@/lib/server-utils';
import { getStore } from '@/lib/store';
import type { Channel } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const v = channelView(id);
  return v ? json(v) : error('Channel tidak ditemukan', 404);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody<Channel>(req);
  const patch: Partial<Channel> = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.cookies === 'string') patch.cookies = body.cookies.trim() || undefined;
  if (body.quality !== undefined) patch.quality = body.quality || undefined;
  const ch = getStore().updateChannel(id, patch);
  if (!ch) return error('Channel tidak ditemukan', 404);
  // Auto-record baru dinyalakan → cek segera
  if (patch.enabled) getStore().updateChannel(id, { lastCheckedAt: 0 });
  return json(channelView(id));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getStore().getChannel(id)) return error('Channel tidak ditemukan', 404);
  await getManager().removeChannel(id);
  return json({ ok: true });
}
