import { error, json, readBody } from '@/lib/server-utils';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Tandai semua media baru sebagai sudah dilihat (per kind, opsional per akun). */
export async function POST(req: Request) {
  const body = await readBody<{ kind: string; sourceId: string }>(req);
  if (body.kind !== 'story' && body.kind !== 'feed') return error('kind harus story atau feed');
  const marked = getStore().markMediaSeen({ kind: body.kind, sourceId: body.sourceId || undefined });
  return json({ marked });
}
