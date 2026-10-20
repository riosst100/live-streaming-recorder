import { error } from '@/lib/server-utils';
import { serveDownload } from '@/lib/serve-file';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const rec = getStore().getRecording(id);
  if (!rec) return error('Rekaman tidak ditemukan', 404);
  return serveDownload(req, rec.file);
}
