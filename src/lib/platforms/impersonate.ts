import { spawn } from 'node:child_process';
import path from 'node:path';
import { HttpError } from './http';

/**
 * GET dengan sidik jari TLS Chrome lewat scripts/impersonate_fetch.py (curl_cffi).
 * Instagram menolak (429 / HTML) klien yang TLS-nya bukan browser, seperti fetch bawaan Node,
 * walau cookies valid. yt-dlp mengatasinya dengan cara yang sama.
 */
const PYTHON = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
const SCRIPT = path.join(process.cwd(), 'scripts', 'impersonate_fetch.py');

export interface ImpResponse {
  status: number;
  location: string | null;
  body: string;
}

export function impersonatedGet(
  url: string,
  headers: Record<string, string>,
  { timeoutSec = 20, follow = false } = {},
): Promise<ImpResponse> {
  return new Promise((resolve, reject) => {
    const p = spawn(PYTHON, [SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => p.kill('SIGKILL'), (timeoutSec + 10) * 1000);
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Gagal menjalankan ${PYTHON} (butuh Python + curl_cffi): ${e.message}`));
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const hint = /No module named 'curl_cffi'/.test(err) ? 'curl_cffi belum terpasang (pip install curl_cffi)' : err.trim().split('\n').pop();
        return reject(new Error(`Permintaan Instagram gagal: ${hint || `exit ${code}`}`));
      }
      try {
        resolve(JSON.parse(out) as ImpResponse);
      } catch {
        reject(new Error('Respon impersonate_fetch tidak valid'));
      }
    });
    p.stdin.on('error', () => {});
    p.stdin.end(JSON.stringify({ url, headers, timeout: timeoutSec, follow }));
  });
}

function check(r: ImpResponse, url: string) {
  const host = new URL(url).hostname;
  if (r.status === 429) throw new HttpError('Rate limited (429): server membatasi permintaan dari IP/akun ini', 429);
  if (r.status >= 300 && r.status < 400) {
    throw new HttpError(`Dialihkan ke ${r.location ?? '?'} oleh ${host} (sesi/cookies tidak diterima?)`, r.status);
  }
  if (r.status < 200 || r.status >= 300) throw new HttpError(`HTTP ${r.status} dari ${host}`, r.status);
}

/** Halaman HTML: ikuti redirect (Instagram menambahkan ?r=1 pada kunjungan pertama). */
export async function impersonatedText(url: string, headers: Record<string, string>): Promise<string> {
  const r = await impersonatedGet(url, headers, { follow: true });
  check(r, url);
  return r.body;
}

export async function impersonatedJson<T = any>(url: string, headers: Record<string, string>): Promise<T> {
  const r = await impersonatedGet(url, headers);
  check(r, url);
  try {
    return JSON.parse(r.body) as T;
  } catch {
    throw new HttpError(`Respon bukan JSON dari ${new URL(url).hostname} (kemungkinan perlu login/cookies)`, r.status);
  }
}
