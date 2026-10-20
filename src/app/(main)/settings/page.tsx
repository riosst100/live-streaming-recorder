'use client';

import { QUALITY_LABEL } from '@/components/AddChannel';
import { api } from '@/lib/client';
import { parseCookies } from '@/lib/cookies';
import { formatBytes } from '@/lib/format';
import type { DiskInfo, Engine, Settings, TikTokQuality } from '@/lib/types';
import { useEffect, useState } from 'react';

interface SystemInfo {
  ffmpeg: string | null;
  ytdlp: string | null;
  node: string;
  platform: string;
  dataDir: string;
  downloadDir: string;
  disk: DiskInfo | null;
  authEnabled: boolean;
}

function CookieStatus({ value, required }: { value: string; required: string[] }) {
  const cookies = parseCookies(value);
  if (!cookies.length) return <div className="hint">Belum diisi.</div>;
  const names = new Set(cookies.map((c) => c.name));
  const missing = required.filter((r) => !names.has(r));
  return (
    <div className="hint">
      {cookies.length} cookie terdeteksi
      {missing.length ? (
        <span style={{ color: 'var(--warning)' }}> · tidak ada: {missing.join(', ')}</span>
      ) : (
        <span style={{ color: 'var(--success)' }}> · {required.join(', ')} ✓</span>
      )}
    </div>
  );
}

function PasswordCard({ enabled }: { enabled: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  async function submit() {
    if (next !== confirm) return setMsg({ type: 'error', text: 'Konfirmasi password tidak sama.' });
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/auth/password', { method: 'POST', body: { current, next } });
      setCurrent('');
      setNext('');
      setConfirm('');
      setMsg({ type: 'ok', text: 'Password user diubah. Perangkat lain yang login dengan password user harus login ulang.' });
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Password user</h2>
      <div className="alert info small" style={{ marginBottom: 14 }}>
        Login menerima dua password: <b>password sistem</b> (dari <code>PASSWORD</code> di .env, tidak bisa diubah di sini) dan <b>password user</b> yang diatur di sini.
      </div>
      {msg && <div className={`alert ${msg.type}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      <div className="grid-2">
        {enabled && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="label">Password saat ini (sistem atau user)</label>
            <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label">Password baru</label>
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          <div className="hint">Minimal 6 karakter. Disimpan ter-hash di data/auth.json. Password sistem tetap bisa dipakai login.</div>
        </div>
        <div>
          <label className="label">Ulangi password baru</label>
          <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={submit} disabled={busy || !next}>
          {busy ? 'Menyimpan…' : 'Simpan password user'}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api<Settings>('/api/settings').then(setS).catch((e) => setMsg({ type: 'error', text: e.message }));
    api<SystemInfo>('/api/system').then(setSys).catch(() => {});
  }, []);

  if (!s) return <div className="empty">Memuat…</div>;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      setS(await api<Settings>('/api/settings', { method: 'PUT', body: s }));
      setMsg({ type: 'ok', text: 'Pengaturan disimpan.' });
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pengaturan</h1>
          <p>Cookies, perekaman, dan notifikasi.</p>
        </div>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>

      {msg && <div className={`alert ${msg.type}`} style={{ marginBottom: 14 }}>{msg.text}</div>}

      <div className="card">
        <h2>Cookies</h2>
        <div className="alert info small" style={{ marginBottom: 14 }}>
          Login ke TikTok/Instagram di browser, lalu export cookies memakai extension <b>Cookie-Editor</b> (Export → JSON) atau{' '}
          <b>Get cookies.txt LOCALLY</b> (format Netscape), lalu tempel di sini. Bisa juga tempel header{' '}
          <code>sessionid=...; csrftoken=...</code>. Cookies Instagram <b>wajib</b>; TikTok opsional (dibutuhkan untuk live
          yang dibatasi umur/region). Sebaiknya pakai akun cadangan.
        </div>
        <div className="grid-2">
          <div>
            <label className="label">Cookies TikTok</label>
            <textarea className="textarea" value={s.tiktokCookies} onChange={(e) => set('tiktokCookies', e.target.value)} />
            <CookieStatus value={s.tiktokCookies} required={['sessionid']} />
          </div>
          <div>
            <label className="label">Cookies Instagram</label>
            <textarea className="textarea" value={s.instagramCookies} onChange={(e) => set('instagramCookies', e.target.value)} />
            <CookieStatus value={s.instagramCookies} required={['sessionid', 'csrftoken', 'ds_user_id']} />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Perekaman</h2>
        <div className="grid-2">
          <div>
            <label className="label">Interval cek live (detik)</label>
            <input
              className="input"
              type="number"
              min={15}
              max={3600}
              value={s.pollIntervalSec}
              onChange={(e) => set('pollIntervalSec', Number(e.target.value))}
            />
            <div className="hint">Terlalu kecil bisa kena rate-limit, terutama Instagram. Disarankan 60–120.</div>
          </div>
          <div>
            <label className="label">Kualitas TikTok (default)</label>
            <select className="select" value={s.tiktokQuality} onChange={(e) => set('tiktokQuality', e.target.value as TikTokQuality)}>
              {Object.entries(QUALITY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Engine TikTok</label>
            <select className="select" value={s.tiktokEngine} onChange={(e) => set('tiktokEngine', e.target.value as Engine)}>
              <option value="ffmpeg">ffmpeg (disarankan)</option>
              <option value="ytdlp">yt-dlp</option>
            </select>
          </div>
          <div>
            <label className="label">Engine Instagram</label>
            <select className="select" value={s.instagramEngine} onChange={(e) => set('instagramEngine', e.target.value as Engine)}>
              <option value="ffmpeg">ffmpeg</option>
              <option value="ytdlp">yt-dlp (coba jika ffmpeg gagal)</option>
            </select>
          </div>
          <div>
            <label className="label">Interval cek Stories (menit)</label>
            <input className="input" type="number" min={1} max={720} value={s.storyIntervalMin} onChange={(e) => set('storyIntervalMin', Number(e.target.value))} />
            <div className="hint">Story hilang setelah 24 jam. Disarankan 5–30.</div>
          </div>
          <div>
            <label className="label">Interval cek Feed (menit)</label>
            <input className="input" type="number" min={5} max={1440} value={s.feedIntervalMin} onChange={(e) => set('feedIntervalMin', Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Postingan Feed yang diperiksa per cek</label>
            <input className="input" type="number" min={1} max={50} value={s.feedCount} onChange={(e) => set('feedCount', Number(e.target.value))} />
            <div className="hint">Saat akun baru ditambahkan, sebanyak ini postingan terbaru langsung diunduh.</div>
          </div>
          <div>
            <label className="label">Ukuran minimum file (KB)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={s.minFileSizeKB}
              onChange={(e) => set('minFileSizeKB', Number(e.target.value))}
            />
            <div className="hint">Rekaman lebih kecil dari ini dianggap gagal & dihapus.</div>
          </div>
          <div className="stack" style={{ justifyContent: 'center' }}>
            <label className="switch">
              <input type="checkbox" checked={s.remuxToMp4} onChange={(e) => set('remuxToMp4', e.target.checked)} />
              <span className="track" />
              Konversi ke MP4 setelah selesai (tanpa re-encode)
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={s.deleteSourceAfterRemux}
                disabled={!s.remuxToMp4}
                onChange={(e) => set('deleteSourceAfterRemux', e.target.checked)}
              />
              <span className="track" />
              Hapus file .ts asli setelah konversi
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Notifikasi</h2>
        <div className="grid-2">
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="label">Webhook URL (Discord / Slack / custom)</label>
            <input
              className="input"
              placeholder="https://discord.com/api/webhooks/…"
              value={s.webhookUrl}
              onChange={(e) => set('webhookUrl', e.target.value)}
            />
            <div className="hint">POST JSON berisi text, content, event, channel, platform.</div>
          </div>
          <div>
            <label className="label">Telegram bot token</label>
            <input className="input" value={s.telegramBotToken} onChange={(e) => set('telegramBotToken', e.target.value)} />
          </div>
          <div>
            <label className="label">Telegram chat ID</label>
            <input className="input" value={s.telegramChatId} onChange={(e) => set('telegramChatId', e.target.value)} />
          </div>
        </div>
      </div>

      <PasswordCard enabled={sys?.authEnabled ?? true} />

      <div className="card">
        <h2>Sistem</h2>
        {!sys ? (
          <div className="muted">Memuat…</div>
        ) : (
          <div className="grid-2 small">
            <div>
              <div className="muted">ffmpeg</div>
              <div style={{ color: sys.ffmpeg ? undefined : 'var(--danger)' }}>{sys.ffmpeg ?? 'TIDAK DITEMUKAN — install ffmpeg'}</div>
            </div>
            <div>
              <div className="muted">yt-dlp</div>
              <div style={{ color: sys.ytdlp ? undefined : 'var(--warning)' }}>{sys.ytdlp ?? 'tidak ditemukan (opsional)'}</div>
            </div>
            <div>
              <div className="muted">Folder rekaman</div>
              <div className="mono">{sys.downloadDir}</div>
            </div>
            <div>
              <div className="muted">Folder data</div>
              <div className="mono">{sys.dataDir}</div>
            </div>
            <div>
              <div className="muted">Disk</div>
              <div>{sys.disk ? `${formatBytes(sys.disk.free)} kosong dari ${formatBytes(sys.disk.total)}` : '-'}</div>
            </div>
            <div>
              <div className="muted">Runtime</div>
              <div>
                Node {sys.node} · {sys.platform} · password {sys.authEnabled ? 'aktif' : <b style={{ color: 'var(--warning)' }}>tidak aktif</b>}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
