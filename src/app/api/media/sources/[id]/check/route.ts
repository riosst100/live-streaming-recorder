import { getMediaManager } from '@/lib/media-manager';
import { error, json, mediaSourceView } from '@/lib/server-utils';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getStore().getMediaSource(id)) return error('Akun tidak ditemukan', 404);
  await getMediaManager().check(id);
  return json(mediaSourceView(id));
}
