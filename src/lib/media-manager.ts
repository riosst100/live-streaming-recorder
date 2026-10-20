import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DOWNLOAD_DIR } from './config';
import { cookieHeader } from './cookies';
import { safeName, stamp, toAbs } from './manager';
import { notify } from './notify';
import { fetchFeed, fetchStories, IG_DOWNLOAD_HEADERS, type IgMedia } from './platforms/instagram-media';
import { downloadTikTokVideo, fetchTikTokFeed } from './platforms/tiktok-media';
import { getStore } from './store';
import type { MediaItem, MediaSource } from './types';

const TICK_MS = 20_000;
/** Jeda antar akun supaya tidak terkena rate-limit Instagram. */
const GAP_MS: Record<MediaSource['platform'], number> = { instagram: 8_000, tiktok: 3_000 };
/** Jeda saat kena 429, per platform; naik berlipat tiap 429 beruntun dan reset setelah sukses. */
const BACKOFF_MS = [15, 30, 60, 120, 240].map((m) => m * 60_000);
/** Media yang gagal diunduh sekian kali (mis. slideshow foto TikTok) dilewati sampai server restart. */
const MAX_DOWNLOAD_FAILS = 3;
const DIR_NAME = { story: 'stories', feed: 'feed' } as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extOf(url: string, type: IgMedia['type']): string {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return /^\.(jpe?g|png|webp|heic|mp4|mov)$/.test(ext) ? ext : type === 'video' ? '.mp4' : '.jpg';
}

async function download(url: string, dest: string): Promise<number> {
  const res = await fetch(url, { headers: IG_DOWNLOAD_HEADERS, signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new Error(`Unduh gagal: HTTP ${res.status}`);
  const tmp = `${dest}.part`;
  try {
    await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmp));
    await fs.promises.rename(tmp, dest);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true });
    throw e;
  }
  return (await fs.promises.stat(dest)).size;
}

class MediaManager {
  private checking = new Set<string>();
  private running = false;
  // Dikunci per platform + jenis: endpoint Feed bisa dibatasi sementara Stories masih normal
  private pausedUntil: Record<string, number> = {};
  private strikes: Record<string, number> = {};
  private fails = new Map<string, number>();
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    const t = setInterval(() => void this.tick(), TICK_MS);
    t.unref?.();
    void this.tick();
    console.log('[media] worker Stories/Feed berjalan');
  }

  isChecking(id: string) {
    return this.checking.has(id);
  }

  /** Jeda aktif karena 429: kunci `platform:kind` → waktu (ms) jeda berakhir. */
  pauses(): Record<string, number> {
    const now = Date.now();
    return Object.fromEntries(Object.entries(this.pausedUntil).filter(([, t]) => t > now));
  }

  private isPaused(src: MediaSource) {
    return Date.now() < (this.pausedUntil[`${src.platform}:${src.kind}`] ?? 0);
  }

  private intervalMs(kind: MediaSource['kind']) {
    const s = getStore().getSettings();
    return (kind === 'story' ? s.storyIntervalMin : s.feedIntervalMin) * 60_000;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const due = getStore()
        .listMediaSources()
        .filter((s) => s.enabled && Date.now() - (s.lastCheckedAt ?? 0) >= this.intervalMs(s.kind));
      for (const s of due) {
        if (this.isPaused(s)) continue;
        await this.check(s.id);
        // jitter supaya pola permintaan tidak terlalu beraturan
        await sleep(GAP_MS[s.platform] * (1 + Math.random()));
      }
    } finally {
      this.running = false;
    }
  }

  /** Cek satu akun sekarang dan unduh media baru. */
  async check(id: string): Promise<void> {
    const store = getStore();
    const src = store.getMediaSource(id);
    if (!src || this.checking.has(id)) return;
    this.checking.add(id);
    try {
      const settings = store.getSettings();
      // Stories & Feed akun yang sama berbagi ID profil → hemat satu panggilan profil yang sering kena 429
      const userId =
        src.platformUserId ??
        store.listMediaSources().find((o) => o.platform === src.platform && o.username === src.username && o.platformUserId)
          ?.platformUserId;
      const tiktok = src.platform === 'tiktok';
      const rawCookies = src.cookies || (tiktok ? settings.tiktokCookies : settings.instagramCookies);
      const cookie = cookieHeader(rawCookies, tiktok ? 'tiktok.com' : 'instagram.com');
      let r;
      if (tiktok) {
        if (src.kind === 'story') throw new Error('Stories TikTok belum didukung');
        r = await fetchTikTokFeed(src.username, rawCookies, settings.feedCount);
      } else if (src.kind === 'story') {
        r = await fetchStories(src.username, cookie, userId);
      } else {
        r = await fetchFeed(src.username, cookie, settings.feedCount, userId);
      }

      let added = 0;
      let failure: string | undefined;
      // Unduh dari yang paling lama supaya urutan tersimpan benar
      for (const m of [...r.items].sort((a, b) => a.takenAt - b.takenAt)) {
        const failKey = `${src.id}:${m.mediaId}`;
        if (store.hasMediaItem(src.id, m.mediaId) || (this.fails.get(failKey) ?? 0) >= MAX_DOWNLOAD_FAILS) continue;
        try {
          store.addMediaItem(await this.save(src, m, tiktok ? rawCookies : undefined));
          added++;
        } catch (e) {
          this.fails.set(failKey, (this.fails.get(failKey) ?? 0) + 1);
          failure = (e as Error).message;
        }
      }

      this.strikes[`${src.platform}:${src.kind}`] = 0;
      store.updateMediaSource(id, {
        nickname: r.nickname ?? src.nickname,
        avatar: r.avatar ?? src.avatar,
        platformUserId: tiktok ? undefined : r.userId,
        status: failure ? 'error' : 'ok',
        lastError: failure,
        lastCheckedAt: Date.now(),
        ...(added ? { lastNewAt: Date.now() } : {}),
      });
      if (added) {
        console.log(`[media] @${src.username} ${src.kind}: ${added} media baru`);
        const label = src.kind === 'story' ? 'story' : tiktok ? 'video' : 'postingan';
        void notify(`📥 ${added} ${label} baru dari @${src.username} sudah diunduh`, {
          event: `${src.kind}_downloaded`,
          channel: src.username,
          platform: src.platform,
        });
      }
    } catch (e) {
      let message = (e as Error).message;
      if ((e as { status?: number }).status === 429) {
        const key = `${src.platform}:${src.kind}`;
        const strikes = this.strikes[key] ?? 0;
        const wait = BACKOFF_MS[Math.min(strikes, BACKOFF_MS.length - 1)];
        this.strikes[key] = strikes + 1;
        this.pausedUntil[key] = Date.now() + wait;
        message = `${src.platform === 'instagram' ? 'Instagram' : 'TikTok'} membatasi permintaan (429). Dijeda otomatis ${wait / 60_000} menit; cek cookies dan jangan menambah interval terlalu pendek.`;
      }
      store.updateMediaSource(id, { status: 'error', lastError: message, lastCheckedAt: Date.now() });
      console.warn(`[media] @${src.username} ${src.kind}: ${message}`);
    } finally {
      this.checking.delete(id);
    }
  }

  /** `tiktokCookies` diisi untuk sumber TikTok (diunduh lewat yt-dlp), kosong = Instagram (HTTP langsung). */
  private async save(src: MediaSource, m: IgMedia, tiktokCookies?: string): Promise<MediaItem> {
    const parts = src.platform === 'tiktok' ? [DIR_NAME[src.kind], 'tiktok'] : [DIR_NAME[src.kind]];
    const dir = path.join(DOWNLOAD_DIR, ...parts, safeName(src.username));
    await fs.promises.mkdir(dir, { recursive: true });
    const base = `${stamp(new Date(m.takenAt))}_${safeName(m.mediaId)}`;

    let dest: string;
    let size: number;
    if (src.platform === 'tiktok') {
      dest = await downloadTikTokVideo(m.url, tiktokCookies ?? '', dir, base);
      size = (await fs.promises.stat(dest)).size;
    } else {
      dest = path.join(dir, `${base}${extOf(m.url, m.type)}`);
      size = await download(m.url, dest);
    }
    await fs.promises.utimes(dest, new Date(), new Date(m.takenAt)).catch(() => {});
    return {
      id: randomUUID(),
      sourceId: src.id,
      kind: src.kind,
      username: src.username,
      mediaId: m.mediaId,
      type: m.type,
      file: path.relative(DOWNLOAD_DIR, dest).split(path.sep).join('/'),
      size,
      takenAt: m.takenAt,
      downloadedAt: Date.now(),
      caption: m.caption?.slice(0, 500),
      seen: false,
    };
  }

  /**
   * Hapus file dari disk tapi simpan catatannya (ditandai dihapus), sehingga media yang sama
   * tidak diunduh ulang saat akun dicek lagi dan masih bisa dibandingkan dengan situs aslinya.
   */
  deleteItemFile(id: string) {
    const store = getStore();
    const item = store.getMediaItem(id);
    if (!item) return false;
    fs.rmSync(toAbs(item.file), { force: true });
    store.updateMediaItem(id, { deleted: true, deletedAt: Date.now(), seen: true });
    return true;
  }

  removeSource(id: string, deleteFiles: boolean) {
    const store = getStore();
    if (deleteFiles) {
      for (const i of store.listMediaItems().filter((x) => x.sourceId === id)) fs.rmSync(toAbs(i.file), { force: true });
    }
    store.removeMediaSource(id);
  }
}

const g = globalThis as unknown as { __lrMedia?: MediaManager };

export function getMediaManager(): MediaManager {
  if (!g.__lrMedia) g.__lrMedia = new MediaManager();
  g.__lrMedia.start();
  return g.__lrMedia;
}
