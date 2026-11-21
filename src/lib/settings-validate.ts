import { defaultSettings } from './store';
import type { Settings } from './types';

/** Validasi patch settings. Mengembalikan patch bersih atau pesan error. */
export function validateSettings(body: Partial<Settings>): { patch: Partial<Settings> } | { error: string } {
  const patch: Partial<Settings> = {};

  // Hanya terima key yang dikenal, dengan tipe yang sama seperti default
  for (const key of Object.keys(defaultSettings) as (keyof Settings)[]) {
    const v = body[key];
    if (v === undefined) continue;
    if (typeof v !== typeof defaultSettings[key]) return { error: `Tipe ${key} tidak valid` };
    (patch as Record<string, unknown>)[key] = typeof v === 'string' ? v.trim() : v;
  }
  if (patch.pollIntervalSec !== undefined && (patch.pollIntervalSec < 15 || patch.pollIntervalSec > 3600)) {
    return { error: 'Interval polling harus 15–3600 detik' };
  }
  const range = (k: 'storyIntervalMin' | 'feedIntervalMin' | 'feedCount', min: number, max: number) =>
    patch[k] !== undefined && !(patch[k]! >= min && patch[k]! <= max) ? `${k} harus ${min}–${max}` : null;
  const bad = range('storyIntervalMin', 1, 720) || range('feedIntervalMin', 5, 1440) || range('feedCount', 1, 50);
  if (bad) return { error: bad };
  for (const k of ['tiktokEngine', 'instagramEngine'] as const) {
    if (patch[k] && !['ffmpeg', 'ytdlp'].includes(patch[k]!)) return { error: `${k} tidak valid` };
  }
  if (patch.tiktokQuality && !['origin', 'uhd', 'hd', 'sd', 'ld'].includes(patch.tiktokQuality)) {
    return { error: 'tiktokQuality tidak valid' };
  }
  return { patch };
}
