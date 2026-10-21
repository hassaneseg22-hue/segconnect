'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, KeyRound, Loader2, Mail, Lock } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const next = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;

  async function onSubmit(e: FormEvent) {
  e.preventDefault();

  if (loading) return;

  setError(null);
  setLoading(true);

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        remember,
      }),
    });

    const json = await res.json();

    if (res.status === 429) {
      setError('Trop de tentatives. Réessayez dans quelques minutes.');
      return;
    }

    if (res.status === 403) {
      setError(
        'Ce compte est suspendu ou désactivé. Contactez l’administrateur.'
      );
      return;
    }

    if (res.status === 401) {
      setError('Identifiants incorrects.');
      return;
    }

    if (!res.ok || !json.ok || !json.data) {
      setError('Une erreur est survenue lors de la connexion.');
      return;
    }

    const user = json.data;

    // Synchronisation immédiate avec le contexte React
    signIn({
      id: user.id,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      displayName: user.displayName ?? null,
      email: user.email ?? email,
      role: user.roleCode ?? user.role ?? '',
      status: user.status ?? 'ACTIVE',
      department: user.departmentId ?? null,
      agency: user.agencyName ?? null,
      jobTitle: user.jobTitle ?? null,
      phone: user.phone ?? null,
      avatar: user.avatar ?? null,
      permissions: Array.isArray(user.permissions)
        ? user.permissions
        : [],
    });

    // Vérification réelle de la session côté serveur
    const meRes = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });

    const meJson = await meRes.json();

    if (!meRes.ok || !meJson.ok) {
      console.error('[LOGIN] Session non reconnue par /api/auth/me', meJson);
      setError(
        'La connexion a réussi, mais la session n’a pas pu être établie. Réessayez.'
      );
      return;
    }

    console.log('[LOGIN] Session confirmée:', meJson.data);

    // Redirection finale
    const destination = safeNext || user.redirect || '/';

    window.location.assign(destination);
  } catch (err) {
    console.error('[LOGIN] Erreur:', err);
    setError('Erreur réseau. Réessayez.');
  } finally {
    setLoading(false);
  }
}

  return (
    <main style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <img src="/ico.jpeg" alt="Logo SEG" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 12 }} />
        </div>
        <h1 style={styles.title}>SEG Dashboard</h1>
        <p style={styles.subtitle}>Connexion à votre espace sécurisé</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={onSubmit} style={styles.form} noValidate>
          <label style={styles.label}>
            <span style={styles.labelText}><Mail size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Adresse e-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nom@seg.tg"
              required
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            <span style={styles.labelText}><Lock size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Mot de passe</span>
            <div style={styles.passwordWrap}>
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ ...styles.input, paddingRight: 40 }}
              />
              <button type="button" onClick={() => setShow(!show)} style={styles.eye} aria-label="Afficher le mot de passe">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <div style={styles.row}>
            <label style={styles.check}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Se souvenir de moi</span>
            </label>
            <Link href="/forgot-password" style={styles.link}>Mot de passe oublié ?</Link>
          </div>

          <button type="submit" disabled={loading} style={styles.submit}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            <span>{loading ? 'Connexion…' : 'Se connecter'}</span>
          </button>
        </form>

        <p style={styles.foot}>Accès réservé au personnel autorisé — SEG TG</p>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(1000px 500px at 20% -10%, var(--bg-card) 0%, transparent 60%), radial-gradient(800px 400px at 90% 110%, var(--bg-card) 0%, transparent 55%), var(--bg-main)',
    padding: '24px',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 16,
    padding: '36px 32px',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
  },
  logo: { display: 'flex', justifyContent: 'center', marginBottom: 16 },
  title: { textAlign: 'center', fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: 0 },
  subtitle: { textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, margin: '6px 0 24px' },
  errorBox: {
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.45)',
    color: 'var(--accent-red)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
    marginBottom: 16,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 6 },
  labelText: { fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 },
  input: {
    background: 'var(--bg-inner)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    color: 'var(--text-strong)',
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  passwordWrap: { position: 'relative' },
  eye: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
  },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 },
  check: { display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', cursor: 'pointer' },
  link: { color: '#06b6d4', textDecoration: 'none', fontWeight: 500 },
  submit: {
    background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  foot: { textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, marginTop: 20 },
};
