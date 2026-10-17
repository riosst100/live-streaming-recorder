'use client';

import Modal from '@/components/Modal';
import { api } from '@/lib/client';
import { formatBytes, formatDate, formatDuration } from '@/lib/format';
import type { Recording } from '@/lib/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

const STATUS_LABEL: Record<Recording['status'], string> = {
  recording: 'Merekam',
  processing: 'Memproses',
  done: 'Selesai',
  failed: 'Gagal',
};

export default function RecordingsPage() {
  const [items, setItems] = useState<Recording[] | null>(null);
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('');
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [log, setLog] = useState<{ rec: Recording; text: string } | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setItems((await api<{ recordings: Recording[] }>('/api/recordings')).recordings);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (items ?? []).filter(
      (r) =>
        (!platform || r.platform === platform) &&
        (!term || `${r.username} ${r.nickname ?? ''} ${r.title ?? ''} ${r.file}`.toLowerCase().includes(term)),
    );
  }, [items, q, platform]);

  const totalSize = list.reduce((s, r) => s + (r.size ?? 0), 0);

  async function remove(r: Recording) {
    if (!confirm(`Hapus rekaman ${r.file}? File akan dihapus permanen dari disk.`)) return;
    try {
      await api(`/api/recordings/${r.id}`, { method: 'DELETE' });
      setItems((prev) => prev?.filter((x) => x.id !== r.id) ?? null);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function showLog(r: Recording) {
    const text = await fetch(`/api/recordings/${r.id}/log`).then((res) => res.text());
    setLog({ rec: r, text });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Rekaman</h1>
          <p>
            {list.length} file · {formatBytes(totalSize)}
          </p>
        </div>
        <div className="row">
          <select className="select" style={{ width: 150 }} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">Semua platform</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
          </select>
          <input className="input" style={{ width: 240 }} placeholder="Cari…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {err && <div className="alert error" style={{ marginBottom: 14 }}>{err}</div>}

      {items === null ? (
        <div className="empty">Memuat…</div>
      ) : list.length === 0 ? (
        <div className="empty">Belum ada rekaman.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>File</th>
                <th>Mulai</th>
                <th>Durasi</th>
                <th>Ukuran</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const isMp4 = r.file.toLowerCase().endsWith('.mp4');
                const duration = (r.endedAt ?? Date.now()) - r.startedAt;
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.nickname || r.username}</div>
                      <span className={`badge ${r.platform}`}>{r.platform}</span>
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      <div className="mono small ellipsis" title={r.file}>
                        {r.file}
                      </div>
                      {r.title && (
                        <div className="small muted ellipsis" title={r.title}>
                          {r.title}
                        </div>
                      )}
                      {r.error && <div className="small" style={{ color: 'var(--warning)' }}>{r.error}</div>}
                    </td>
                    <td className="num small">{formatDate(r.startedAt)}</td>
                    <td className="num">{formatDuration(duration)}</td>
                    <td className="num">{formatBytes(r.size)}</td>
                    <td>
                      <span className={`badge ${r.status}`}>
                        {r.status === 'recording' && <span className="pulse" />}
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 6, flexWrap: 'nowrap' }}>
                        {r.status === 'done' && (
                          <>
                            <button className="btn sm" onClick={() => setPlaying(r)} disabled={!isMp4} title={isMp4 ? 'Putar' : 'Format ini tidak bisa diputar di browser, silakan unduh'}>
                              ▶
                            </button>
                            <a className="btn sm" href={`/api/recordings/${r.id}/file?download=1`} title="Unduh">
                              ⬇
                            </a>
                          </>
                        )}
                        <button className="btn sm" onClick={() => showLog(r)} title="Log">
                          Log
                        </button>
                        <button
                          className="btn sm danger"
                          onClick={() => remove(r)}
                          disabled={r.status === 'recording' || r.status === 'processing'}
                          title="Hapus"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {playing && (
        <Modal title={playing.file} onClose={() => setPlaying(null)} wide>
          <video src={`/api/recordings/${playing.id}/file`} controls autoPlay />
        </Modal>
      )}

      {log && (
        <Modal title={`Log · ${log.rec.file}`} onClose={() => setLog(null)} wide>
          <pre className="log">{log.text}</pre>
        </Modal>
      )}
    </>
  );
}
