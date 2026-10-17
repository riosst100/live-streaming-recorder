// Launcher lintas platform (Linux & Windows): baca .env lalu jalankan `next dev|start`
// dengan PORT/HOST dari environment. Pemakaian: node scripts/next.mjs [dev|start]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

// Env yang sudah di-set (systemd/Docker/shell) tidak ditimpa; .env.local didahulukan dari .env
for (const f of ['.env.local', '.env']) {
  if (existsSync(f) && typeof process.loadEnvFile === 'function') process.loadEnvFile(f);
}

const mode = process.argv[2] === 'dev' ? 'dev' : 'start';
const port = process.env.PORT || '9843';
const host = process.env.HOST || '0.0.0.0';
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');

const child = spawn(process.execPath, [nextBin, mode, '-H', host, '-p', port], { stdio: 'inherit' });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    // Di Windows Ctrl+C sudah sampai ke semua proses di console; kill() di sana berarti
    // terminate paksa, jadi cukup tunggu child selesai menutup rekaman dengan rapi.
    if (process.platform !== 'win32') child.kill(sig);
  });
}
child.on('exit', (code) => process.exit(code ?? 0));
