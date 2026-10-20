'use client';

import { api } from '@/lib/client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Channel', icon: '📡' },
  { href: '/recordings', label: 'Rekaman', icon: '🎬' },
  { href: '/stories', label: 'Stories', icon: '⭕' },
  { href: '/feed', label: 'Feed', icon: '🖼️' },
  { href: '/settings', label: 'Pengaturan', icon: '⚙️' },
];

export default function Sidebar({ authEnabled }: { authEnabled: boolean }) {
  const pathname = usePathname();

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-dot" /> Live Streaming Recorder
      </div>
      {NAV.map((n) => {
        const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className={`nav-link${active ? ' active' : ''}`}>
            <span aria-hidden>{n.icon}</span> {n.label}
          </Link>
        );
      })}
      <div className="sidebar-footer">
        {authEnabled && (
          <button className="btn sm" onClick={logout}>
            Keluar
          </button>
        )}
      </div>
    </aside>
  );
}
