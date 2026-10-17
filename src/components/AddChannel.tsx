'use client';

import { api } from '@/lib/client';
import { parseChannelUrl } from '@/lib/parse-url';
import type { TikTokQuality } from '@/lib/types';
import { useState } from 'react';
import Modal from './Modal';

export const QUALITY_LABEL: Record<TikTokQuality, string> = {
  origin: 'Original (terbaik)',
  uhd: 'UHD / 1080p',
  hd: 'HD / 720p',
  sd: 'SD / 480p',
  ld: 'LD / 360p',
};

export default function AddChannel({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [urls, setUrls] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [quality, setQuality] = useState<TikTokQuality | ''>('');
  const [cookies, setCookies] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'ok'; text: string } | null>(null);

  const lines = urls.split(/\s+/).map((l) => l.trim()).filter(Boolean);
  const parsed = lines.map((l) => ({ raw: l, p: parseChannelUrl(l) }));
  const valid = parsed.filter((x) => x.p);
  const hasTikTok = valid.some((x) => x.p!.platform === 'tiktok');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid.length) return;
    setBusy(true);
    setMsg(null);
    const errors: string[] = [];
    for (const { raw } of valid) {
      try {
        await api('/api/channels', {
          method: 'POST',
          body: { url: raw, enabled, quality: quality || undefined, cookies: cookies || undefined },
        });
      } catch (err) {
        errors.push(`${raw}: ${(err as Error).message}`);
      }
    }
    setBusy(false);
    if (errors.length) setMsg({ type: 'error', text: errors.join('\n') });
    else onAdded();
  }

  return (
    <Modal
      title="Tambah channel"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} type="button">
            Batal
          </button>
          <button className="btn primary" form="add-channel" disabled={busy || !valid.length}>
            {busy ? 'Menambahkan…' : `Tambah${valid.length > 1 ? ` (${valid.length})` : ''}`}
          </button>
        </>
      }
    >
      <form id="add-channel" className="stack" onSubmit={submit}>
        <div>
          <label className="label">URL profil</label>
          <textarea
            className="textarea"
            style={{ minHeight: 80, fontFamily: 'inherit', fontSize: 14 }}
            placeholder={'https://www.tiktok.com/@username\nhttps://www.instagram.com/username/'}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            autoFocus
          />
          <div className="hint">Bisa lebih dari satu, pisahkan dengan baris baru.</div>
          {parsed.length > 0 && (
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              {parsed.map(({ raw, p }) =>
                p ? (
                  <span key={raw} className={`badge ${p.platform}`}>
                    {p.platform} · @{p.username}
                  </span>
                ) : (
                  <span key={raw} className="badge error" title={raw}>
                    tidak dikenali
                  </span>
                ),
              )}
            </div>
          )}
        </div>

        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="track" />
          Rekam otomatis saat live
        </label>

        <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAdvanced(!advanced)}>
          {advanced ? '▾' : '▸'} Opsi lanjutan
        </button>

        {advanced && (
          <>
            {hasTikTok && (
              <div>
                <label className="label">Kualitas TikTok</label>
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
              <label className="label">Cookies khusus channel (opsional)</label>
              <textarea
                className="textarea"
                placeholder="Kosongkan untuk memakai cookies global dari Pengaturan"
                value={cookies}
                onChange={(e) => setCookies(e.target.value)}
              />
              <div className="hint">Format: header string, Netscape cookies.txt, atau JSON (Cookie-Editor).</div>
            </div>
          </>
        )}

        {msg && <div className={`alert ${msg.type}`} style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>}
      </form>
    </Modal>
  );
}
