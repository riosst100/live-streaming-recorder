import { error } from '@/lib/server-utils';
import { serveDownload } from '@/lib/serve-file';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const item = getStore().getMediaItem(id);
  if (!item) return error('Media tidak ditemukan', 404);
  if (item.deleted) return error('File sudah dihapus', 410);
  return serveDownload(req, item.file);
}
