export function formatBytes(n?: number): string {
  if (!n || n < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i >= 2 ? 2 : 0)} ${u[i]}`;
}

export function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (x: number) => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
}

export function formatDate(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function timeAgo(ts?: number): string {
  if (!ts) return 'belum pernah';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return 'baru saja';
  if (s < 60) return `${s} dtk lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export const imgProxy = (url?: string) => (url ? `/api/img?url=${encodeURIComponent(url)}` : undefined);
