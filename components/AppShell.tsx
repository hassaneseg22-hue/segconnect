'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { NewsTicker } from '@/components/NewsTicker';
import { useAuth } from '@/components/auth/AuthProvider';

const PUBLIC_AUTH_PATHS = ['/login', '/403', '/forgot-password', '/reset-password', '/activate-account'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const isAuthPage = PUBLIC_AUTH_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  // Garde session : un état `user` null peut être transitoire (juste après le
  // login ou une navigation client). On re-vérifie donc /api/auth/me avant de
  // purger le cookie et rebondir vers /login (sinon on déconnecte une session
  // tout juste créée).
  useEffect(() => {
    if (loading || isAuthPage) return;
    if (user) return;
    let cancelled = false;
    (async () => {
      const checked = await refresh();
      if (cancelled || checked) return;
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
      if (!cancelled) {
        const nextParam = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
        router.replace(`/login${nextParam}`);
      }
    })();
    return () => { cancelled = true; };
  }, [loading, isAuthPage, user, pathname, router, refresh]);

  if (isAuthPage) return <>{children}</>;

  if (!loading && !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--text-muted)', fontSize: 14 }}>
        Redirection vers la connexion…
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-wrapper">
        <Header />
        <main className="dashboard-content">{children}</main>
      </div>
      <NewsTicker />
    </div>
  );
}