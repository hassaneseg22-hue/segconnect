'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

function Forbidden() {
  const sp = useSearchParams();
  const module = sp.get('module') || '';
  return (
    <main style={styles.wrap}>
      <div style={styles.card}>
        <ShieldAlert size={46} color="#ef4444" />
        <h1 style={styles.title}>403 — Accès refusé</h1>
        <p style={styles.text}>
          Vous n’avez pas la permission d’accéder à ce module.
        </p>
        {module && <code style={styles.code}>{module}</code>}
        <div style={styles.actions}>
          <Link href="/" style={styles.primary}>Retour au tableau de bord</Link>
          <a href="/api/auth/logout" style={styles.link}>Se connecter avec un autre compte</a>
        </div>
      </div>
    </main>
  );
}

export default function ForbiddenPage() {
  return (
    <Suspense fallback={null}>
      <Forbidden />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(800px 400px at 80% 0%, var(--bg-card) 0%, transparent 55%), var(--bg-main)',
    padding: '24px',
  },
  card: {
    textAlign: 'center',
    maxWidth: 420,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 16,
    padding: '40px 32px',
  },
  title: { color: 'var(--text-strong)', fontSize: 20, margin: '14px 0 8px' },
  text: { color: 'var(--text-muted)', fontSize: 14, margin: 0 },
  code: {
    display: 'inline-block',
    margin: '12px 0',
    padding: '4px 10px',
    background: 'var(--bg-inner)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    fontSize: 12,
    color: '#06b6d4',
  },
  actions: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 },
  primary: {
    background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
    color: '#fff',
    borderRadius: 8,
    padding: '11px',
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: 14,
  },
  link: { color: '#06b6d4', fontSize: 13, textDecoration: 'none', fontWeight: 500 },
};