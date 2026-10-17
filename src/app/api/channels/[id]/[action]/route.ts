import { getManager } from '@/lib/manager';
import { channelView, error, json } from '@/lib/server-utils';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; action: string }> };

/**
 * POST /api/channels/:id/check  → cek status live sekarang
 * POST /api/channels/:id/record → cek & langsung rekam (walau auto-record mati)
 * POST /api/channels/:id/stop   → hentikan rekaman yang sedang berjalan
 */
export async function POST(_req: Request, { params }: Ctx) {
  const { id, action } = await params;
  if (!getStore().getChannel(id)) return error('Channel tidak ditemukan', 404);
  const m = getManager();

  switch (action) {
    case 'check':
      await m.check(id);
      break;
    case 'record':
      await m.check(id, { force: true });
      break;
    case 'stop':
      if (!m.stop(id)) return error('Channel ini tidak sedang merekam', 409);
      break;
    default:
      return error('Aksi tidak dikenal', 404);
  }
  return json(channelView(id));
}
