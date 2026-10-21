'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Utilisé par les pages protégées côté client.
 * - non connecté → /login
 * - connecté sans permission → /403
 * Le back-office vérifie TOUJOURS l'autorisation côté serveur (proxy.ts + API routes).
 */
export function RequirePermission({ code, children }: { code: string; children: ReactNode }) {
  const { user, loading, hasPermission, refresh } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user && hasPermission(code)) return;
    if (user && !hasPermission(code)) {
      const url = new URL('/403', window.location.origin);
      url.searchParams.set('module', code);
      window.location.assign(url.toString());
      return;
    }
    let cancelled = false;
    (async () => {
      const checked = await refresh();
      if (cancelled || checked) return;
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
      if (!cancelled) window.location.assign('/login');
    })();
    return () => { cancelled = true; };
  }, [loading, user, hasPermission, code, refresh]);

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Vérification des accès…
      </div>
    );
  }
  if (!user || !hasPermission(code)) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Redirection…
      </div>
    );
  }
  return <>{children}</>;
}