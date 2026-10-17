import { getManager } from '@/lib/manager';
import { json } from '@/lib/server-utils';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const bytes = getManager().activeBytesByRecording();
  const recordings = [...getStore().listRecordings()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((r) => (bytes.has(r.id) ? { ...r, size: bytes.get(r.id) } : r));
  return json({ recordings });
}
