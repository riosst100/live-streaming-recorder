import { getManager, logPath, toAbs } from '@/lib/manager';
import { error, json } from '@/lib/server-utils';
import { getStore } from '@/lib/store';
import fs from 'node:fs';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const rec = store.getRecording(id);
  if (!rec) return error('Rekaman tidak ditemukan', 404);
  if (getManager().isRecordingActive(id) || rec.status === 'processing') {
    return error('Rekaman masih berjalan / diproses. Stop dulu.', 409);
  }
  fs.rmSync(toAbs(rec.file), { force: true });
  fs.rmSync(logPath(id), { force: true });
  store.removeRecording(id);
  return json({ ok: true });
}
