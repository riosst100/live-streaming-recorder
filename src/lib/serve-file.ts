import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { DOWNLOAD_DIR } from './config';
import { toAbs } from './manager';
import { error } from './server-utils';

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4a': 'audio/mp4',
  '.ts': 'video/mp2t',
  '.flv': 'video/x-flv',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

const toWeb = (s: fs.ReadStream) => Readable.toWeb(s) as unknown as ReadableStream;

/** Kirim file di bawah DOWNLOAD_DIR dengan dukungan Range (untuk seek video) dan ?download. */
export async function serveDownload(req: Request, relFile: string): Promise<Response> {
  const abs = path.resolve(toAbs(relFile));
  if (!abs.startsWith(DOWNLOAD_DIR + path.sep)) return error('Path tidak valid', 400);
  const stat = await fs.promises.stat(abs).catch(() => null);
  if (!stat?.isFile()) return error('File tidak ada di disk', 404);

  const headers = new Headers({
    'Content-Type': MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-cache',
  });
  if (new URL(req.url).searchParams.has('download')) {
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(abs))}`);
  }

  const size = stat.size;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  if (m && (m[1] || m[2])) {
    let start: number;
    let end: number;
    if (!m[1]) {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(toWeb(fs.createReadStream(abs, { start, end })), { status: 206, headers });
  }

  headers.set('Content-Length', String(size));
  return new Response(toWeb(fs.createReadStream(abs)), { status: 200, headers });
}
