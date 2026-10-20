import { error, json } from '@/lib/server-utils';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind');
  if (kind !== 'story' && kind !== 'feed') return error('kind harus story atau feed');
  const sourceId = q.get('sourceId');
  const limit = Math.min(500, Math.max(1, Number(q.get('limit')) || 60));

  const unseen = q.get('unseen') === '1';
  // unseen=1 → antrean "baru": paling lama dulu supaya dilihat urut waktu; default terbaru dulu
  const all = getStore()
    .listMediaItems()
    .filter((i) => i.kind === kind && (!sourceId || i.sourceId === sourceId) && (!unseen || !i.seen))
    .sort((a, b) => (unseen ? a.takenAt - b.takenAt : b.takenAt - a.takenAt));
  return json({ items: all.slice(0, limit), total: all.length });
}
