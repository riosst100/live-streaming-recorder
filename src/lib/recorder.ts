import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FFMPEG_PATH, YTDLP_PATH } from './config';
import type { Engine } from './types';

export interface CaptureOptions {
  engine: Engine;
  url: string;
  type?: 'flv' | 'hls' | 'dash';
  headers?: Record<string, string>;
  dir: string;
  base: string;
  logFile: string;
}

export interface CaptureResult {
  code: number | null;
  outFile: string;
}

export interface Capture {
  dir: string;
  base: string;
  done: Promise<CaptureResult>;
  stop(): void;
}

function ffmpegArgs(o: CaptureOptions, outFile: string): string[] {
  const args = ['-hide_banner', '-nostats', '-loglevel', 'warning', '-y'];
  const headers = o.headers ?? {};
  const ua = Object.entries(headers).find(([k]) => k.toLowerCase() === 'user-agent')?.[1];
  if (ua) args.push('-user_agent', ua);
  const extra = Object.entries(headers)
    .filter(([k]) => k.toLowerCase() !== 'user-agent')
    .map(([k, v]) => `${k}: ${v}\r\n`)
    .join('');
  if (extra) args.push('-headers', extra);
  // Putus otomatis jika tidak ada data 30 detik (stream selesai / macet)
  if (o.type !== 'dash') args.push('-rw_timeout', '30000000');
  args.push('-i', o.url, '-c', 'copy', '-f', 'mpegts', outFile);
  return args;
}

function ytdlpArgs(o: CaptureOptions, outTemplate: string): string[] {
  const args = ['--no-part', '--no-progress', '--newline', '--hls-use-mpegts', '-o', outTemplate];
  for (const [k, v] of Object.entries(o.headers ?? {})) args.push('--add-header', `${k}:${v}`);
  if (FFMPEG_PATH !== 'ffmpeg') args.push('--ffmpeg-location', FFMPEG_PATH);
  args.push(o.url);
  return args;
}

/** File hasil = file di folder yang namanya diawali base (ambil yang terbesar). */
export function findOutput(dir: string, base: string): string | undefined {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${base}.`) && !/\.(part|ytdl|log|tmp)$/.test(f))
      .map((f) => {
        const p = path.join(dir, f);
        return { p, size: fs.statSync(p).size };
      })
      .sort((a, b) => b.size - a.size);
    return files[0]?.p;
  } catch {
    return undefined;
  }
}

export function prefixSize(dir: string, base: string): number {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${base}.`))
      .reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0);
  } catch {
    return 0;
  }
}

export function startCapture(o: CaptureOptions): Capture {
  const log = fs.createWriteStream(o.logFile, { flags: 'a' });
  log.write(`[${new Date().toISOString()}] engine=${o.engine} type=${o.type ?? '-'}\nurl=${o.url}\n\n`);

  let proc: ChildProcess;
  const defaultOut = path.join(o.dir, `${o.base}.ts`);
  if (o.engine === 'ytdlp') {
    proc = spawn(YTDLP_PATH, ytdlpArgs(o, path.join(o.dir, `${o.base}.%(ext)s`)), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } else {
    proc = spawn(FFMPEG_PATH, ffmpegArgs(o, defaultOut), { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdin?.on('error', () => {});
  }
  proc.stdout?.pipe(log, { end: false });
  proc.stderr?.pipe(log, { end: false });

  const done = new Promise<CaptureResult>((resolve) => {
    let settled = false;
    const finish = (code: number | null, note?: string) => {
      if (settled) return;
      settled = true;
      log.end(`\n[${new Date().toISOString()}] ${note ?? 'selesai'} (exit code=${code})\n`);
      resolve({ code, outFile: findOutput(o.dir, o.base) ?? defaultOut });
    };
    proc.on('error', (err) => finish(-1, `gagal menjalankan ${o.engine}: ${err.message}`));
    proc.on('close', (code) => finish(code));
  });

  let stopped = false;
  return {
    dir: o.dir,
    base: o.base,
    done,
    stop() {
      if (stopped) return;
      stopped = true;
      // ffmpeg berhenti rapi dengan 'q'; yt-dlp dengan SIGINT (di Windows = terminate,
      // file .ts tetap bisa dipakai karena mpegts tidak butuh finalisasi)
      if (o.engine === 'ffmpeg' && proc.stdin?.writable) proc.stdin.write('q');
      else proc.kill('SIGINT');
      const t = setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
      }, 15_000);
      void done.then(() => clearTimeout(t));
    },
  };
}

/** Remux (tanpa re-encode) ke MP4 agar bisa diputar di browser/HP. */
export function remuxToMp4(input: string, output: string, logFile: string): Promise<boolean> {
  return new Promise((resolve) => {
    const log = fs.createWriteStream(logFile, { flags: 'a' });
    log.write(`\n[${new Date().toISOString()}] remux -> ${path.basename(output)}\n`);
    const proc = spawn(
      FFMPEG_PATH,
      ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-map', '0:v?', '-map', '0:a?', '-c', 'copy',
        '-movflags', '+faststart', output],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    proc.stdout?.pipe(log, { end: false });
    proc.stderr?.pipe(log, { end: false });
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      log.end(`[${new Date().toISOString()}] remux ${ok ? 'OK' : 'GAGAL'}\n`);
      if (!ok) fs.rmSync(output, { force: true });
      resolve(ok);
    };
    proc.on('error', () => finish(false));
    proc.on('close', (code) => {
      let size = 0;
      try {
        size = fs.statSync(output).size;
      } catch {}
      finish(code === 0 && size > 0);
    });
  });
}
