import { error, json, readBody } from '@/lib/server-utils';
import { defaultSettings, getStore } from '@/lib/store';
import type { Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return json(getStore().getSettings());
}

export async function PUT(req: Request) {
  const body = await readBody<Settings>(req);
  const patch: Partial<Settings> = {};

  // Hanya terima key yang dikenal, dengan tipe yang sama seperti default
  for (const key of Object.keys(defaultSettings) as (keyof Settings)[]) {
    const v = body[key];
    if (v === undefined) continue;
    if (typeof v !== typeof defaultSettings[key]) return error(`Tipe ${key} tidak valid`);
    (patch as Record<string, unknown>)[key] = typeof v === 'string' ? v.trim() : v;
  }
  if (patch.pollIntervalSec !== undefined && (patch.pollIntervalSec < 15 || patch.pollIntervalSec > 3600)) {
    return error('Interval polling harus 15–3600 detik');
  }
  for (const k of ['tiktokEngine', 'instagramEngine'] as const) {
    if (patch[k] && !['ffmpeg', 'ytdlp'].includes(patch[k]!)) return error(`${k} tidak valid`);
  }
  return json(getStore().updateSettings(patch));
}
