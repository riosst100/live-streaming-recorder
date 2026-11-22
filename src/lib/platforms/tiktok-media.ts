import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { YTDLP_PATH } from '../config';
import { toNetscape } from '../cookies';
import { findOutput } from '../recorder';
import type { IgResult } from './instagram-media';

const LIST_TIMEOUT_MS = 90_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;

function run(args: string[], timeoutMs: number, cwd?: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(YTDLP_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (e) => (clearTimeout(timer), reject(new Error(`Gagal menjalankan yt-dlp: ${e.message}`))));
    p.on('close', (code) => (clearTimeout(timer), resolve({ code, stdout, stderr })));
  });
}

const lastError = (stderr: string) =>
  stderr
    .split('\n')
    .reverse()
    .find((l) => l.startsWith('ERROR'))
    ?.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '') ?? 'yt-dlp gagal';

/** Jalankan fn dengan file cookies sementara (Netscape) bila cookies diisi. */
async function withCookieFile<T>(cookies: string, fn: (args: string[]) => Promise<T>): Promise<T> {
  if (!cookies.trim()) return fn([]);
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lr-cookies-'));
  const file = path.join(dir, 'cookies.txt');
  await fs.promises.writeFile(file, toNetscape(cookies, 'tiktok.com'), { mode: 0o600 });
  try {
    return await fn(['--cookies', file]);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

export const tiktokVideoUrl = (username: string, id: string) => `https://www.tiktok.com/@${username}/video/${id}`;

/** Video terbaru sebuah akun TikTok. `url` pada hasil = halaman video (diunduh lewat yt-dlp). */
export async function fetchTikTokFeed(username: string, rawCookies: string, count: number): Promise<IgResult> {
  const { code, stdout, stderr } = await withCookieFile(rawCookies, (c) =>
    run(['--flat-playlist', '-J', '--no-warnings', '--playlist-end', String(count), ...c, `https://www.tiktok.com/@${username}`], LIST_TIMEOUT_MS),
  );
  let j: any;
  try {
    j = JSON.parse(stdout);
  } catch {
    throw new Error(`Feed TikTok @${username} gagal dibaca: ${lastError(stderr)}`);
  }
  if (code !== 0 && !Array.isArray(j?.entries)) throw new Error(`Feed TikTok @${username} gagal dibaca: ${lastError(stderr)}`);

  const entries: any[] = (j.entries ?? []).filter((e: any) => e?.id);
  return {
    userId: String(j.id ?? username),
    nickname: entries[0]?.channel as string | undefined,
    items: entries.slice(0, count).map((e) => ({
      mediaId: String(e.id),
      type: 'video' as const,
      url: tiktokVideoUrl(username, String(e.id)),
      takenAt: Number(e.timestamp) * 1000 || Date.now(),
      caption: (e.description || e.title) as string | undefined,
    })),
  };
}

export const TIKTOK_DOWNLOAD_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  Referer: 'https://www.tiktok.com/',
};

export interface TikTokPhotoPost {
  /** Per foto: daftar URL alternatif (CDN berbeda), urutan sesuai slideshow */
  images: string[][];
  music?: string;
}

/**
 * Data postingan foto (slideshow). `null` = bukan postingan foto (video biasa).
 * yt-dlp hanya memberi audio untuk postingan foto, dan halaman/API TikTok butuh challenge atau
 * tanda tangan; karena itu halaman yang sudah lolos challenge diambil dari yt-dlp (`--write-pages`)
 * lalu dibaca `itemStruct.imagePost` di data rehidrasinya.
 */
export async function fetchTikTokPhotoPost(pageUrl: string, rawCookies: string): Promise<TikTokPhotoPost | null> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lr-pages-'));
  try {
    const { stderr } = await withCookieFile(rawCookies, (c) =>
      run(['--skip-download', '--write-pages', '--no-warnings', '--no-progress', ...c, pageUrl], LIST_TIMEOUT_MS, dir),
    );
    let found = false;
    for (const f of await fs.promises.readdir(dir)) {
      if (!f.endsWith('.dump')) continue;
      const html = await fs.promises.readFile(path.join(dir, f), 'utf8');
      const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
      if (!m) continue;
      let item: any;
      try {
        item = JSON.parse(m[1])?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
      } catch {
        continue;
      }
      if (!item) continue;
      found = true;
      const images: string[][] = (item.imagePost?.images ?? [])
        .map((im: any) => (im?.imageURL?.urlList ?? []).filter((u: unknown) => typeof u === 'string'))
        .filter((l: string[]) => l.length);
      if (!images.length) return null;
      const music = item.music?.playUrl;
      return { images, music: typeof music === 'string' && music ? music : undefined };
    }
    if (!found) throw new Error(`Data postingan TikTok tidak terbaca: ${lastError(stderr)}`);
    return null;
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

/** Unduh satu video TikTok ke `<dir>/<base>.<ext>`; mengembalikan path file. */
export async function downloadTikTokVideo(pageUrl: string, rawCookies: string, dir: string, base: string): Promise<string> {
  const { code, stderr } = await withCookieFile(rawCookies, (c) =>
    run(['--no-progress', '--no-part', '--no-warnings', '-o', path.join(dir, `${base}.%(ext)s`), ...c, pageUrl], DOWNLOAD_TIMEOUT_MS),
  );
  const out = findOutput(dir, base);
  if (code !== 0 || !out) throw new Error(`Unduh TikTok gagal: ${lastError(stderr)}`);
  // Postingan foto yang tidak terdeteksi: yt-dlp hanya memberi musiknya. Jangan disimpan sebagai video.
  if (/\.(m4a|mp3|aac|opus)$/i.test(out)) {
    await fs.promises.rm(out, { force: true });
    throw new Error('Unduh TikTok gagal: hanya audio yang tersedia (postingan foto tidak terbaca)');
  }
  return out;
}
