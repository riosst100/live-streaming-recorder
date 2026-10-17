'use client';

import { api } from '@/lib/client';
import { parseCookies } from '@/lib/cookies';
import { formatBytes, formatDuration, imgProxy, timeAgo } from '@/lib/format';
import type { ChannelView, TikTokQuality } from '@/lib/types';
import { useEffect, useState } from 'react';
import { QUALITY_LABEL } from './AddChannel';
import Modal from './Modal';

const STATUS_LABEL: Record<string, string> = {
  recording: 'Merekam',
  live: 'Live',
  offline: 'Offline',
  unknown: 'Menunggu cek',
  error: 'Error',
};

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export default function ChannelCard({
  channel: c,
  onChange,
}: {
  channel: ChannelView;
  onChange: (c?: ChannelView | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const now = useNow(!!c.active);
  const status = c.active ? 'recording' : c.status;

  async function act(name: string, fn: () => Promise<ChannelView | null | undefined>) {
    setBusy(name);
    setErr('');
    try {
      onChange(await fn());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const post = (action: string) => () => api<ChannelView>(`/api/channels/${c.id}/${action}`, { method: 'POST' });

  return (
    <div className={`ch${c.active ? ' is-recording' : ''}`}>
      <div className="ch-head">
        {c.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="avatar" src={imgProxy(c.avatar)} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="avatar">{c.username[0]?.toUpperCase()}</div>
        )}
        <div className="grow">
          <div className="ch-name ellipsis">{c.nickname || c.username}</div>
          <div className="ch-meta ellipsis">
            <a href={c.url} target="_blank" rel="noreferrer">
              @{c.username}
            </a>
          </div>
        </div>
        <div className="stack" style={{ gap: 5, alignItems: 'flex-end' }}>
          <span className={`badge ${status}`}>
            {(status === 'recording' || status === 'live') && <span className="pulse" />}
            {c.checking && status !== 'recording' ? 'Mengecek…' : STATUS_LABEL[status]}
          </span>
          <span className={`badge ${c.platform}`}>{c.platform}</span>
        </div>
      </div>

      {c.liveTitle && (status === 'live' || status === 'recording') && (
        <div className="small ellipsis" title={c.liveTitle}>
          🎙 {c.liveTitle}
        </div>
      )}

      {c.active && (
        <div className="ch-rec">
          <span>
            Durasi <b>{formatDuration(now - c.active.startedAt)}</b>
          </span>
          <span>
            Ukuran <b>{formatBytes(c.active.bytes)}</b>
          </span>
        </div>
      )}

      {status === 'live' && c.skipUntilOffline && (
        <div className="small muted">Rekaman dihentikan manual — tidak direkam ulang sampai live ini selesai.</div>
      )}
      {c.lastError && status === 'error' && <div className="ch-error">{c.lastError}</div>}
      {err && <div className="ch-error">{err}</div>}

      <div className="small muted">
        Dicek {timeAgo(c.lastCheckedAt)}
        {c.lastLiveAt ? ` · Live terakhir ${timeAgo(c.lastLiveAt)}` : ''}
        {c.cookies ? ' · cookies khusus' : ''}
      </div>

      <div className="ch-actions">
        <label className="switch" title="Rekam otomatis saat live">
          <input
            type="checkbox"
            checked={c.enabled}
            disabled={!!busy}
            onChange={(e) =>
              act('toggle', () =>
                api<ChannelView>(`/api/channels/${c.id}`, { method: 'PATCH', body: { enabled: e.target.checked } }),
              )
            }
          />
          <span className="track" />
          <span className="small">Auto</span>
        </label>
        <div className="grow" />
        {c.active ? (
          <button className="btn sm danger" disabled={!!busy} onClick={() => act('stop', post('stop'))}>
            ■ Stop
          </button>
        ) : (
          <button className="btn sm" disabled={!!busy || c.checking} onClick={() => act('record', post('record'))} title="Cek & rekam sekarang">
            {busy === 'record' ? '…' : '● Rekam'}
          </button>
        )}
        <button className="btn sm" disabled={!!busy || c.checking} onClick={() => act('check', post('check'))}>
          {busy === 'check' || c.checking ? '…' : '↻ Cek'}
        </button>
        <button className="btn sm" onClick={() => setEditing(true)} title="Edit">
          ✎
        </button>
        <button
          className="btn sm danger"
          disabled={!!busy}
          title="Hapus channel"
          onClick={() => {
            if (!confirm(`Hapus channel @${c.username}? File rekaman tidak ikut terhapus.`)) return;
            void act('delete', async () => {
              await api(`/api/channels/${c.id}`, { method: 'DELETE' });
              return null;
            });
          }}
        >
          🗑
        </button>
      </div>

      {editing && <EditChannel channel={c} onClose={() => setEditing(false)} onSaved={(v) => (setEditing(false), onChange(v))} />}
    </div>
  );
}

function EditChannel({
  channel: c,
  onClose,
  onSaved,
}: {
  channel: ChannelView;
  onClose: () => void;
  onSaved: (c: ChannelView) => void;
}) {
  const [cookies, setCookies] = useState(c.cookies ?? '');
  const [quality, setQuality] = useState<TikTokQuality | ''>(c.quality ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const count = parseCookies(cookies).length;

  async function save() {
    setBusy(true);
    setErr('');
    try {
      onSaved(await api<ChannelView>(`/api/channels/${c.id}`, { method: 'PATCH', body: { cookies, quality } }));
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Edit @${c.username}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Batal
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            Simpan
          </button>
        </>
      }
    >
      <div className="stack">
        {c.platform === 'tiktok' && (
          <div>
            <label className="label">Kualitas</label>
            <select className="select" value={quality} onChange={(e) => setQuality(e.target.value as TikTokQuality)}>
              <option value="">Ikuti pengaturan global</option>
              {Object.entries(QUALITY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">Cookies khusus channel</label>
          <textarea
            className="textarea"
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
            placeholder="Kosongkan untuk memakai cookies global"
          />
          <div className="hint">{count ? `${count} cookie terdeteksi` : 'Memakai cookies global dari Pengaturan'}</div>
        </div>
        {err && <div className="alert error">{err}</div>}
      </div>
    </Modal>
  );
}
