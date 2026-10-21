'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Mail, Loader2, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError('Adresse introuvable. Vérifiez votre saisie.');
        return;
      }
      setSent(true);
    } catch {
      setError('Erreur réseau. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}>Mot de passe oublié</h1>
        <p style={styles.subtitle}>Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        {sent ? (
          <div style={styles.success}>
            <CheckCircle2 size={28} color="#10b981" />
            <p>Si un compte existe pour <strong>{email}</strong>, un lien vient d’être envoyé.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} style={styles.form}>
            <label style={styles.label}>
              <span style={styles.labelText}><Mail size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@seg.tg"
                required
                style={styles.input}
              />
            </label>
            <button type="submit" disabled={loading} style={styles.submit}>
              {loading && <Loader2 size={16} className="animate-spin" />}
              <span>Envoyer le lien</span>
            </button>
          </form>
        )}

        <p style={styles.foot}><Link href="/login" style={styles.link}>← Retour à la connexion</Link></p>
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
    background: 'radial-gradient(800px 400px at 20% -10%, var(--bg-card) 0%, transparent 55%), var(--bg-main)',
    padding: '24px',
  },
  card: { width: '100%', maxWidth: 400, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '32px' },
  title: { color: 'var(--text-strong)', fontSize: 20, textAlign: 'center', margin: 0 },
  subtitle: { color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', margin: '8px 0 22px' },
  errorBox: { background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239,68,68,0.45)', color: 'var(--accent-red)', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14 },
  success: { textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 6 },
  labelText: { fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 },
  input: { background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--text-strong)', padding: '10px 12px', fontSize: 14, outline: 'none' },
  submit: { background: 'linear-gradient(135deg, #2563eb, #06b6d4)', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14 },
  foot: { textAlign: 'center', marginTop: 18 },
  link: { color: '#06b6d4', textDecoration: 'none', fontSize: 13 },
};