import { logPath } from '@/lib/manager';
import fs from 'node:fs';

export const dynamic = 'force-dynamic';

const MAX = 64 * 1024;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]+$/.test(id)) return new Response('invalid id', { status: 400 });
  try {
    const fd = await fs.promises.open(logPath(id), 'r');
    try {
      const { size } = await fd.stat();
      const len = Math.min(size, MAX);
      const buf = Buffer.alloc(len);
      await fd.read(buf, 0, len, size - len);
      const text = (size > MAX ? '…(dipotong)\n' : '') + buf.toString('utf8');
      return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } finally {
      await fd.close();
    }
  } catch {
    return new Response('(log tidak tersedia)', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
