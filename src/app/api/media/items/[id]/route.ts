import { getMediaManager } from '@/lib/media-manager';
import { error, json, readBody } from '@/lib/server-utils';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Tandai satu media sudah dilihat. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody<{ seen: boolean }>(req);
  if (!getStore().getMediaItem(id)) return error('Media tidak ditemukan', 404);
  if (body.seen === true) getStore().markMediaSeen({ id });
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  // Soft-delete: file dihapus dari disk, catatan tetap ada (ditandai dihapus)
  return getMediaManager().deleteItemFile(id) ? json({ ok: true }) : error('Media tidak ditemukan', 404);
}
