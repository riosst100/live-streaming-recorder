import { exportBackup, importBackup, type ImportMode } from '@/lib/backup';
import { error, json } from '@/lib/server-utils';

export const dynamic = 'force-dynamic';

/** Unduh backup konfigurasi (settings, channel, akun Stories/Feed). */
export async function GET() {
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(exportBackup(), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="live-recorder-backup-${date}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Import backup. Query `?mode=merge|replace`, body = isi file backup. */
export async function POST(req: Request) {
  const mode = new URL(req.url).searchParams.get('mode') ?? 'merge';
  if (mode !== 'merge' && mode !== 'replace') return error('mode harus merge atau replace');
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error('File bukan JSON yang valid');
  }
  try {
    return json(await importBackup(body, mode as ImportMode));
  } catch (e) {
    return error((e as Error).message);
  }
}
