import { getMediaManager } from '@/lib/media-manager';
import { error, json, mediaSourceView, readBody } from '@/lib/server-utils';
import { getStore } from '@/lib/store';
import type { MediaSource } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody<MediaSource>(req);
  const patch: Partial<MediaSource> = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.cookies === 'string') patch.cookies = body.cookies.trim() || undefined;
  if (!getStore().updateMediaSource(id, patch)) return error('Akun tidak ditemukan', 404);
  if (patch.enabled) void getMediaManager().check(id);
  return json(mediaSourceView(id));
}

/** ?files=1 → ikut hapus file yang sudah terunduh */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getStore().getMediaSource(id)) return error('Akun tidak ditemukan', 404);
  getMediaManager().removeSource(id, new URL(req.url).searchParams.get('files') === '1');
  return json({ ok: true });
}
