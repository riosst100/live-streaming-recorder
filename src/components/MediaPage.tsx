'use client';

import { api } from '@/lib/client';
import { formatBytes, formatDate, imgProxy, timeAgo } from '@/lib/format';
import { parseChannelUrl } from '@/lib/parse-url';
import type { MediaItem, MediaKind, MediaSourceView } from '@/lib/types';
import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal';

const TEXT = {
  story: {
    title: 'Stories',
    desc: 'Unduh otomatis Instagram Stories sebelum hilang (24 jam). TikTok belum didukung.',
    add: 'Tambah akun',
    empty: 'Belum ada story terunduh.',
  },
  feed: {
    title: 'Feed',
    desc: 'Unduh otomatis postingan terbaru Instagram (foto & video) dan video TikTok.',
    add: 'Tambah akun',
    empty: 'Belum ada postingan terunduh.',
  },
} as const;

const PAGE = 60;

export default function MediaPage({ kind }: { kind: MediaKind }) {
  const t = TEXT[kind];
  const [sources, setSources] = useState<MediaSourceView[] | null>(null);
  const [pauses, setPauses] = useState<Record<string, number>>({});
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState<MediaSourceView | null>(null);
  const [err, setErr] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [viewer, setViewer] = useState<{ items: MediaItem[]; index: number; queue: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api<{ sources: MediaSourceView[]; pauses: Record<string, number> }>(`/api/media/sources?kind=${kind}`);
      setSources(s.sources);
      setPauses(s.pauses ?? {});
      // Galeri hanya dimuat saat detail akun dibuka
      if (detail) {
        const qs = new URLSearchParams({ kind, limit: String(limit), sourceId: detail.id });
        const i = await api<{ items: MediaItem[]; total: number }>(`/api/media/items?${qs}`);
        setItems(i.items);
        setTotal(i.total);
      }
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [kind, limit, detail]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const unseenTotal = sources?.reduce((n, s) => n + s.unseenCount, 0) ?? 0;

  /** Buka antrean media baru (belum dilihat), paling lama dulu. sourceId kosong = semua akun. */
  async function openNew(sourceId?: string) {
    try {
      const qs = new URLSearchParams({ kind, unseen: '1', limit: '500' });
      if (sourceId) qs.set('sourceId', sourceId);
      const r = await api<{ items: MediaItem[] }>(`/api/media/items?${qs}`);
      if (!r.items.length) return setErr('Tidak ada media baru.');
      setViewer({ items: r.items, index: 0, queue: true });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function markAllSeen() {
    if (!confirm(`Tandai ${unseenTotal} media baru sebagai sudah dilihat?`)) return;
    try {
      await api('/api/media/items/seen', { method: 'POST', body: { kind } });
      void load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  /** Hapus file dari disk; catatan tetap ada dan ditandai dihapus. */
  async function deleteFile(it: MediaItem) {
    if (!confirm('Hapus file ini dari disk?\n\nCatatannya tetap ada di daftar (ditandai dihapus) dan tidak akan diunduh ulang.')) return;
    try {
      await api(`/api/media/items/${it.id}`, { method: 'DELETE' });
      setViewer((v) =>
        v ? { ...v, items: v.items.map((x) => (x.id === it.id ? { ...x, deleted: true, deletedAt: Date.now(), seen: true } : x)) } : v,
      );
      void load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const closeViewer = () => {
    setViewer(null);
    void load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.title}</h1>
          <p>{t.desc}</p>
        </div>
        <button className="btn primary" onClick={() => setShowAdd(true)}>
          + {t.add}
        </button>
      </div>

      {err && <div className="alert error" style={{ marginBottom: 14 }}>{err}</div>}

      {Object.entries(pauses)
        .filter(([key]) => key.endsWith(`:${kind}`))
        .map(([key, until]) => (
        <div key={key} className="alert error" style={{ marginBottom: 14 }}>
          {key.startsWith('instagram') ? 'Instagram' : 'TikTok'} membatasi permintaan (429). Pengunduhan {t.title} dijeda otomatis sampai{' '}
          <b>{new Date(until).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</b>. Jika terus berulang, ekspor ulang
          cookies dari browser yang sedang login di Pengaturan.
        </div>
      ))}

      {unseenTotal > 0 && (
        <div className="new-banner">
          <span>
            🔔 <b>{unseenTotal}</b> media baru belum dilihat
          </span>
          <div className="grow" />
          <button className="btn sm" onClick={markAllSeen}>
            Tandai semua dilihat
          </button>
          <button className="btn sm primary" onClick={() => openNew()}>
            Lihat satu per satu
          </button>
        </div>
      )}

      <h2 className="section-title">Akun dipantau</h2>
      {sources === null ? (
        <div className="empty">Memuat…</div>
      ) : sources.length === 0 ? (
        <div className="empty">
          Belum ada akun. Instagram butuh cookies login di <b>Pengaturan</b>; TikTok disarankan memakai cookies juga.
          <br />
          <button className="btn primary" style={{ marginTop: 12 }} onClick={() => setShowAdd(true)}>
            + {t.add}
          </button>
        </div>
      ) : (
        <div className="channels">
          {sources.map((s) => (
            <SourceCard
              key={s.id}
              kind={kind}
              source={s}
              onChange={load}
              onOpenNew={() => openNew(s.id)}
              onOpen={() => {
                setItems([]);
                setTotal(0);
                setLimit(PAGE);
                setDetail(s);
              }}
            />
          ))}
        </div>
      )}

      {detail && (
        <Modal title={`@${detail.username} · ${total} media`} onClose={() => !viewer && setDetail(null)} wide>
          {items.length === 0 ? (
            <div className="empty">{total === 0 ? t.empty : 'Memuat…'}</div>
          ) : (
            <>
              <div className="media-grid">
                {items.map((it, idx) => (
                  <button
                    key={it.id}
                    className="media-tile"
                    onClick={() => setViewer({ items, index: idx, queue: false })}
                    title={formatDate(it.takenAt)}
                  >
                    {it.deleted ? (
                      <span className="media-video">🗑</span>
                    ) : it.type === 'video' ? (
                      // Video tidak dimuat di grid; baru diputar setelah diklik
                      <span className="media-video">▶</span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/media/items/${it.id}/file`} alt="" loading="lazy" />
                    )}
                    {it.deleted ? (
                      <span className="media-tag deleted">Dihapus</span>
                    ) : (
                      it.type === 'video' && <span className="media-tag">Video</span>
                    )}
                    {!it.seen && <span className="media-new">Baru</span>}
                    <span className="media-cap">{timeAgo(it.takenAt)}</span>
                  </button>
                ))}
              </div>
              {items.length < total && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button className="btn" onClick={() => setLimit(limit + PAGE)}>
                    Muat lebih banyak
                  </button>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {showAdd && (
        <AddSource
          kind={kind}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            void load();
          }}
        />
      )}

      {viewer && (
        <Viewer
          items={viewer.items}
          index={viewer.index}
          queue={viewer.queue}
          setIndex={(i) => setViewer({ ...viewer, index: i })}
          onClose={closeViewer}
          onDelete={deleteFile}
        />
      )}
    </>
  );
}

/** Penampil media satu per satu. Setiap media yang tampil otomatis ditandai sudah dilihat. */
function Viewer({
  items,
  index,
  queue,
  setIndex,
  onClose,
  onDelete,
}: {
  items: MediaItem[];
  index: number;
  queue: boolean;
  setIndex: (i: number) => void;
  onClose: () => void;
  onDelete: (it: MediaItem) => void;
}) {
  const cur = items[index];
  const last = index >= items.length - 1;

  const next = useCallback(() => {
    if (!last) setIndex(index + 1);
    else if (queue) onClose();
  }, [last, queue, index, setIndex, onClose]);
  const prev = useCallback(() => {
    if (index > 0) setIndex(index - 1);
  }, [index, setIndex]);

  useEffect(() => {
    if (cur && !cur.seen && !cur.deleted) {
      cur.seen = true;
      void api(`/api/media/items/${cur.id}`, { method: 'PATCH', body: { seen: true } }).catch(() => {});
    }
  }, [cur]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  if (!cur) return null;
  return (
    <Modal
      title={`@${cur.username} · ${formatDate(cur.takenAt)}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={prev} disabled={index === 0}>
            ◀ Sebelumnya
          </button>
          <span className="muted small" style={{ alignSelf: 'center' }}>
            {index + 1} / {items.length}
            {queue ? ' (baru)' : ''}
          </span>
          <button className="btn primary" onClick={next} disabled={last && !queue}>
            {last && queue ? 'Selesai' : 'Berikutnya ▶'}
          </button>
          <div className="grow" />
          {!cur.deleted && (
            <>
              <button className="btn danger" onClick={() => onDelete(cur)}>
                Hapus file
              </button>
              <a className="btn" href={`/api/media/items/${cur.id}/file?download`}>
                Unduh ({formatBytes(cur.size)})
              </a>
            </>
          )}
        </>
      }
    >
      {cur.deleted ? (
        <div className="empty">
          🗑 File ini sudah dihapus dari disk{cur.deletedAt ? ` (${formatDate(cur.deletedAt)})` : ''}.
          <br />
          Catatannya dipertahankan supaya tidak diunduh ulang.
        </div>
      ) : cur.type === 'video' ? (
        <video key={cur.id} src={`/api/media/items/${cur.id}/file`} controls autoPlay playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={cur.id} className="media-full" src={`/api/media/items/${cur.id}/file`} alt="" />
      )}
      {cur.caption && <p className="small" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{cur.caption}</p>}
    </Modal>
  );
}

function SourceCard({
  kind,
  source: s,
  onChange,
  onOpen,
  onOpenNew,
}: {
  kind: MediaKind;
  source: MediaSourceView;
  onChange: () => void;
  onOpen: () => void;
  onOpenNew: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setErr('');
    try {
      await fn();
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const status = s.checking ? 'processing' : s.status === 'ok' ? 'done' : s.status === 'error' ? 'error' : 'unknown';
  const statusLabel = s.checking ? 'Mengecek…' : s.status === 'ok' ? 'OK' : s.status === 'error' ? 'Error' : 'Menunggu cek';

  return (
    <div className="ch">
      <div className="ch-head">
        {s.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="avatar" src={imgProxy(s.avatar)} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="avatar">{s.username[0]?.toUpperCase()}</div>
        )}
        <div className="grow">
          <div className="ch-name ellipsis">{s.nickname || s.username}</div>
          <div className="ch-meta ellipsis">
            <a href={kind === 'story' ? `https://www.instagram.com/stories/${s.username}/` : s.url} target="_blank" rel="noreferrer">
              @{s.username}
            </a>
          </div>
        </div>
        <div className="stack" style={{ gap: 5, alignItems: 'flex-end' }}>
          <span className={`badge ${status}`}>{statusLabel}</span>
          <span className={`badge ${s.platform}`}>{s.platform}</span>
        </div>
      </div>

      {s.lastError && s.status === 'error' && <div className="ch-error">{s.lastError}</div>}
      {err && <div className="ch-error">{err}</div>}

      <div className="small muted">
        {s.itemCount} media · Dicek {timeAgo(s.lastCheckedAt)}
        {s.lastNewAt ? ` · Terbaru ${timeAgo(s.lastNewAt)}` : ''}
        {s.cookies ? ' · cookies khusus' : ''}
      </div>

      <div className="ch-actions">
        <label className="switch" title="Unduh otomatis">
          <input
            type="checkbox"
            checked={s.enabled}
            disabled={!!busy}
            onChange={(e) =>
              act('toggle', () => api(`/api/media/sources/${s.id}`, { method: 'PATCH', body: { enabled: e.target.checked } }))
            }
          />
          <span className="track" />
          <span className="small">Auto</span>
        </label>
        <div className="grow" />
        {s.unseenCount > 0 && (
          <button className="btn sm primary" onClick={onOpenNew} title="Lihat media baru satu per satu">
            🔔 Baru ({s.unseenCount})
          </button>
        )}
        <button className="btn sm" onClick={onOpen} disabled={s.itemCount === 0} title="Lihat media yang sudah terunduh">
          🖼 Media ({s.itemCount})
        </button>
        <button
          className="btn sm"
          disabled={!!busy || s.checking}
          onClick={() => act('check', () => api(`/api/media/sources/${s.id}/check`, { method: 'POST' }))}
        >
          {busy === 'check' || s.checking ? '…' : '↻ Unduh'}
        </button>
        <button
          className="btn sm danger"
          disabled={!!busy}
          title="Hapus akun"
          onClick={() => {
            if (!confirm(`Hapus @${s.username} dari daftar?`)) return;
            const files = s.itemCount > 0 && confirm(`Hapus juga ${s.itemCount} file yang sudah terunduh?\n\nOK = hapus file, Batal = file dibiarkan di disk.`);
            void act('delete', () => api(`/api/media/sources/${s.id}${files ? '?files=1' : ''}`, { method: 'DELETE' }));
          }}
        >
          🗑
        </button>
      </div>
    </div>
  );
}

function AddSource({ kind, onClose, onAdded }: { kind: MediaKind; onClose: () => void; onAdded: () => void }) {
  const [urls, setUrls] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const parsed = urls
    .split(/\s+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((raw) => ({ raw, p: parseChannelUrl(raw) }));
  // Stories hanya Instagram; Feed bisa Instagram & TikTok
  const valid = parsed.filter((x) => x.p && (kind === 'feed' || x.p.platform === 'instagram'));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const errors: string[] = [];
    for (const { raw } of valid) {
      try {
        await api('/api/media/sources', { method: 'POST', body: { kind, url: raw } });
      } catch (err) {
        errors.push(`${raw}: ${(err as Error).message}`);
      }
    }
    setBusy(false);
    if (errors.length) setMsg(errors.join('\n'));
    else onAdded();
  }

  return (
    <Modal
      title={`Tambah akun ${TEXT[kind].title}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} type="button">
            Batal
          </button>
          <button className="btn primary" form="add-source" disabled={busy || !valid.length}>
            {busy ? 'Menambahkan…' : `Tambah${valid.length > 1 ? ` (${valid.length})` : ''}`}
          </button>
        </>
      }
    >
      <form id="add-source" className="stack" onSubmit={submit}>
        <div>
          <label className="label">URL profil</label>
          <textarea
            className="textarea"
            style={{ minHeight: 80, fontFamily: 'inherit', fontSize: 14 }}
            placeholder={kind === 'feed' ? 'https://www.instagram.com/username/\nhttps://www.tiktok.com/@username' :'https://www.instagram.com/username/'}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            autoFocus
          />
          <div className="hint">Bisa lebih dari satu, pisahkan dengan baris baru. Akun privat hanya bisa jika akun cookies mengikutinya.</div>
          {parsed.length > 0 && (
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              {parsed.map(({ raw, p }) =>
                p && (kind === 'feed' || p.platform === 'instagram') ? (
                  <span key={raw} className={`badge ${p.platform}`}>
                    {p.platform} · @{p.username}
                  </span>
                ) : (
                  <span key={raw} className="badge error" title={raw}>
                    {p ? 'Stories hanya Instagram' : 'tidak dikenali'}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
        {msg && <div className="alert error" style={{ whiteSpace: 'pre-wrap' }}>{msg}</div>}
      </form>
    </Modal>
  );
}
