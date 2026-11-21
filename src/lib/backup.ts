// Export / import konfigurasi user: settings, channel, dan akun Stories/Feed.
// Data rekaman (recordings & mediaItems) dan password user TIDAK ikut.
import { randomUUID } from 'node:crypto';
import { getManager } from './manager';
import { getMediaManager } from './media-manager';
import { validateSettings } from './settings-validate';
import { getStore } from './store';
import type { Channel, MediaKind, MediaSource, Platform, Settings, TikTokQuality } from './types';

export const BACKUP_VERSION = 1;

type ChannelBackup = Pick<Channel, 'platform' | 'username' | 'url' | 'nickname' | 'avatar' | 'platformUserId' | 'enabled' | 'cookies' | 'quality' | 'createdAt'>;
type SourceBackup = Pick<MediaSource, 'kind' | 'platform' | 'username' | 'url' | 'nickname' | 'avatar' | 'platformUserId' | 'enabled' | 'cookies' | 'createdAt'>;

export interface Backup {
  app: 'live-recorder';
  version: number;
  exportedAt: string;
  settings: Settings;
  channels: ChannelBackup[];
  mediaSources: SourceBackup[];
}

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  mode: ImportMode;
  settings: boolean;
  channels: { added: number; updated: number; skipped: number; removed: number };
  mediaSources: { added: number; updated: number; skipped: number; removed: number };
}

export function exportBackup(): Backup {
  const store = getStore();
  return {
    app: 'live-recorder',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { ...store.getSettings() },
    channels: store.listChannels().map((c) => ({
      platform: c.platform,
      username: c.username,
      url: c.url,
      nickname: c.nickname,
      avatar: c.avatar,
      platformUserId: c.platformUserId,
      enabled: c.enabled,
      cookies: c.cookies,
      quality: c.quality,
      createdAt: c.createdAt,
    })),
    mediaSources: store.listMediaSources().map((s) => ({
      kind: s.kind,
      platform: s.platform,
      username: s.username,
      url: s.url,
      nickname: s.nickname,
      avatar: s.avatar,
      platformUserId: s.platformUserId,
      enabled: s.enabled,
      cookies: s.cookies,
      createdAt: s.createdAt,
    })),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isPlatform = (v: unknown): v is Platform => v === 'tiktok' || v === 'instagram';
const isKind = (v: unknown): v is MediaKind => v === 'story' || v === 'feed';
const optStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const QUALITIES: TikTokQuality[] = ['origin', 'uhd', 'hd', 'sd', 'ld'];

function parseChannel(v: unknown, i: number): ChannelBackup {
  if (!isObj(v) || !isPlatform(v.platform) || !optStr(v.username) || !optStr(v.url)) {
    throw new Error(`channels[${i}] tidak valid (butuh platform, username, url)`);
  }
  return {
    platform: v.platform,
    username: optStr(v.username)!,
    url: optStr(v.url)!,
    nickname: optStr(v.nickname),
    avatar: optStr(v.avatar),
    platformUserId: optStr(v.platformUserId),
    enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
    cookies: optStr(v.cookies),
    quality: QUALITIES.includes(v.quality as TikTokQuality) ? (v.quality as TikTokQuality) : undefined,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : Date.now(),
  };
}

function parseSource(v: unknown, i: number): SourceBackup {
  if (!isObj(v) || !isKind(v.kind) || !isPlatform(v.platform) || !optStr(v.username) || !optStr(v.url)) {
    throw new Error(`mediaSources[${i}] tidak valid (butuh kind, platform, username, url)`);
  }
  if (v.platform === 'tiktok' && v.kind === 'story') throw new Error(`mediaSources[${i}]: Stories TikTok tidak didukung`);
  return {
    kind: v.kind,
    platform: v.platform,
    username: optStr(v.username)!,
    url: optStr(v.url)!,
    nickname: optStr(v.nickname),
    avatar: optStr(v.avatar),
    platformUserId: optStr(v.platformUserId),
    enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
    cookies: optStr(v.cookies),
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : Date.now(),
  };
}

const chKey = (c: { platform: string; username: string }) => `${c.platform}:${c.username.toLowerCase()}`;
const srcKey = (s: { kind: string; platform: string; username: string }) => `${s.kind}:${s.platform}:${s.username.toLowerCase()}`;

/**
 * merge   : settings ditimpa; channel/akun baru ditambahkan, yang sudah ada dibiarkan.
 * replace : settings ditimpa; yang sudah ada diperbarui dari backup, yang tidak ada di backup dihapus
 *           (file & riwayat rekaman tetap ada di disk).
 */
export async function importBackup(raw: unknown, mode: ImportMode): Promise<ImportResult> {
  if (!isObj(raw)) throw new Error('File backup tidak valid');
  if (raw.app !== undefined && raw.app !== 'live-recorder') throw new Error('Bukan file backup live-recorder');
  if (typeof raw.version === 'number' && raw.version > BACKUP_VERSION) {
    throw new Error(`Versi backup (${raw.version}) lebih baru dari aplikasi ini`);
  }

  // Validasi semuanya dulu sebelum mengubah apa pun
  let settingsPatch: Partial<Settings> | null = null;
  if (raw.settings !== undefined) {
    if (!isObj(raw.settings)) throw new Error('settings tidak valid');
    const r = validateSettings(raw.settings as Partial<Settings>);
    if ('error' in r) throw new Error(`settings: ${r.error}`);
    settingsPatch = r.patch;
  }
  if (raw.channels !== undefined && !Array.isArray(raw.channels)) throw new Error('channels harus array');
  if (raw.mediaSources !== undefined && !Array.isArray(raw.mediaSources)) throw new Error('mediaSources harus array');
  const channels = ((raw.channels as unknown[]) ?? []).map(parseChannel);
  const sources = ((raw.mediaSources as unknown[]) ?? []).map(parseSource);

  const store = getStore();
  const result: ImportResult = {
    mode,
    settings: !!settingsPatch,
    channels: { added: 0, updated: 0, skipped: 0, removed: 0 },
    mediaSources: { added: 0, updated: 0, skipped: 0, removed: 0 },
  };

  if (settingsPatch) store.updateSettings(settingsPatch);

  // ---- channels
  const seenCh = new Set<string>();
  for (const c of channels) {
    const key = chKey(c);
    if (seenCh.has(key)) continue; // duplikat di dalam file
    seenCh.add(key);
    const existing = store.listChannels().find((x) => chKey(x) === key);
    if (existing) {
      if (mode === 'merge') {
        result.channels.skipped++;
        continue;
      }
      // ID lama dipertahankan supaya riwayat rekaman tetap terhubung
      store.updateChannel(existing.id, { ...c, createdAt: existing.createdAt, lastCheckedAt: 0 });
      result.channels.updated++;
    } else {
      store.addChannel({ id: randomUUID(), ...c, status: 'unknown' });
      result.channels.added++;
    }
  }
  if (mode === 'replace') {
    for (const x of [...store.listChannels()]) {
      if (seenCh.has(chKey(x))) continue;
      await getManager().removeChannel(x.id);
      result.channels.removed++;
    }
  }

  // ---- media sources
  const seenSrc = new Set<string>();
  const newSources: string[] = [];
  for (const s of sources) {
    const key = srcKey(s);
    if (seenSrc.has(key)) continue;
    seenSrc.add(key);
    const existing = store.listMediaSources().find((x) => srcKey(x) === key);
    if (existing) {
      if (mode === 'merge') {
        result.mediaSources.skipped++;
        continue;
      }
      // ID lama dipertahankan supaya catatan media (anti unduh ganda) tidak hilang
      store.updateMediaSource(existing.id, { ...s, createdAt: existing.createdAt });
      result.mediaSources.updated++;
    } else {
      const added = store.addMediaSource({ id: randomUUID(), ...s, status: 'unknown' });
      if (added.enabled) newSources.push(added.id);
      result.mediaSources.added++;
    }
  }
  if (mode === 'replace') {
    for (const x of [...store.listMediaSources()]) {
      if (seenSrc.has(srcKey(x))) continue;
      getMediaManager().removeSource(x.id, false);
      result.mediaSources.removed++;
    }
  }

  store.flush();

  // Cek segera channel/akun yang baru masuk (tidak ditunggu)
  for (const c of store.listChannels()) if (!c.lastCheckedAt) void getManager().check(c.id);
  for (const id of newSources) void getMediaManager().check(id);

  return result;
}
