'use client';

import AddChannel from '@/components/AddChannel';
import ChannelCard from '@/components/ChannelCard';
import { api } from '@/lib/client';
import { formatBytes } from '@/lib/format';
import type { ChannelView, DiskInfo } from '@/lib/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Filter = 'all' | 'recording' | 'live' | 'tiktok' | 'instagram' | 'error';

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelView[] | null>(null);
  const [disk, setDisk] = useState<DiskInfo | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ channels: ChannelView[]; disk: DiskInfo | null }>('/api/channels');
      setChannels(d.channels);
      setDisk(d.disk);
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rank = (c: ChannelView) => (c.active ? 0 : c.status === 'live' ? 1 : c.status === 'error' ? 2 : 3);
    return (channels ?? [])
      .filter((c) => {
        if (filter === 'recording' && !c.active) return false;
        if (filter === 'live' && c.status !== 'live' && !c.active) return false;
        if (filter === 'error' && c.status !== 'error') return false;
        if ((filter === 'tiktok' || filter === 'instagram') && c.platform !== filter) return false;
        if (term && !`${c.username} ${c.nickname ?? ''}`.toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => rank(a) - rank(b) || a.username.localeCompare(b.username));
  }, [channels, filter, q]);

  const recordingCount = channels?.filter((c) => c.active).length ?? 0;
  const liveCount = channels?.filter((c) => c.status === 'live' || c.active).length ?? 0;
  const enabledCount = channels?.filter((c) => c.enabled).length ?? 0;

  const replace = (c?: ChannelView | null) => {
    if (c) setChannels((prev) => prev?.map((x) => (x.id === c.id ? c : x)) ?? null);
    else void load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Channel</h1>
          <p>Pantau profil TikTok & Instagram, rekam otomatis saat live.</p>
        </div>
        <button className="btn primary" onClick={() => setShowAdd(true)}>
          + Tambah channel
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="k">Sedang merekam</div>
          <div className="v" style={{ color: recordingCount ? 'var(--live)' : undefined }}>{recordingCount}</div>
        </div>
        <div className="stat">
          <div className="k">Sedang live</div>
          <div className="v">{liveCount}</div>
        </div>
        <div className="stat">
          <div className="k">Channel (auto-record)</div>
          <div className="v">
            {channels?.length ?? 0} <span className="muted small">({enabledCount} aktif)</span>
          </div>
        </div>
        <div className="stat">
          <div className="k">Disk kosong</div>
          <div className="v">{disk ? formatBytes(disk.free) : '-'}</div>
          {disk && (
            <div className="meter" title={`${formatBytes(disk.total - disk.free)} terpakai dari ${formatBytes(disk.total)}`}>
              <div style={{ width: `${((disk.total - disk.free) / disk.total) * 100}%` }} />
            </div>
          )}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="tabs">
          {(
            [
              ['all', 'Semua'],
              ['recording', 'Merekam'],
              ['live', 'Live'],
              ['tiktok', 'TikTok'],
              ['instagram', 'Instagram'],
              ['error', 'Error'],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button key={k} className={`tab${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Cari username…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {err && <div className="alert error" style={{ marginBottom: 14 }}>{err}</div>}

      {channels === null ? (
        <div className="empty">Memuat…</div>
      ) : list.length === 0 ? (
        <div className="empty">
          {channels.length === 0 ? (
            <>
              Belum ada channel.
              <br />
              <button className="btn primary" style={{ marginTop: 12 }} onClick={() => setShowAdd(true)}>
                + Tambah channel pertama
              </button>
            </>
          ) : (
            'Tidak ada channel yang cocok dengan filter.'
          )}
        </div>
      ) : (
        <div className="channels">
          {list.map((c) => (
            <ChannelCard key={c.id} channel={c} onChange={replace} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddChannel
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            void load();
          }}
        />
      )}
    </>
  );
}
