import { authEnabled } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Sidebar authEnabled={authEnabled()} />
      <main className="main">{children}</main>
    </div>
  );
}

export const dynamic = 'force-dynamic';
