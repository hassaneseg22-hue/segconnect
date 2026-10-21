'use client';

import { useState, Suspense, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Mail, Loader2, CheckCircle2, XCircle } from 'lucide-react';

function ConfirmForm() {
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) { setError('Lien invalide : aucun token fourni.'); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/profile/confirm-email/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.message || 'Lien invalide ou expiré.');
        return;
      }
      setNewEmail(json.data?.email || '');
      setDone(true);
    } catch {
      setError('Erreur réseau. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div style={styles.success}>
        <CheckCircle2 size={30} color="#10b981" />
        <p style={styles.successTitle}>Adresse email confirmée</p>
        {newEmail && <p style={styles.successText}>Votre nouvelle adresse est désormais <b>{newEmail}</b>.</p>}
        <Link href="/login" style={styles.submitLink}>Se connecter</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={styles.form}>
      {error && <div style={styles.errorBox}><XCircle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{error}</div>}
      <p style={styles.text}>
        Confirmez le changement d'email en validant ce lien. Cette action est irréversible.
      </p>
      <button type="submit" disabled={loading} style={styles.submit}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
        <span>{loading ? 'Confirmation…' : 'Confirmer mon email'}</span>
      </button>
    </form>
  );
}

export default function ConfirmEmailPage() {
  return (
    <main style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}><Mail size={20} style={{ verticalAlign: -3, marginRight: 6 }} /> Confirmation d'email</h1>
        <Suspense fallback={null}>
          <ConfirmForm />
        </Suspense>
        <p style={styles.foot}><Link href="/login" style={styles.link}>← Retour à la connexion</Link></p>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(800px 400px at 20% -10%, var(--bg-card) 0%, transparent 55%), var(--bg-main)', padding: '24px' },
  card: { width: '100%', maxWidth: 420, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '32px' },
  title: { color: 'var(--text-strong)', fontSize: 19, textAlign: 'center', margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 },
  text: { color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', lineHeight: 1.5 },
  errorBox: { background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.45)', color: 'var(--accent-red)', borderRadius: 8, padding: '10px 12px', fontSize: 13 },
  submit: { background: 'linear-gradient(135deg, #2563eb, #06b6d4)', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14 },
  success: { textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, padding: '14px 0' },
  successTitle: { fontWeight: 700, color: 'var(--text-strong)', fontSize: 17, margin: '10px 0 4px' },
  successText: { margin: '0 0 16px', fontSize: 13 },
  submitLink: { background: 'linear-gradient(135deg, #2563eb, #06b6d4)', color: '#fff', borderRadius: 8, padding: '11px 0', textDecoration: 'none', fontWeight: 700, textAlign: 'center', display: 'block', marginTop: 12 },
  foot: { textAlign: 'center', marginTop: 18 },
  link: { color: '#06b6d4', textDecoration: 'none', fontSize: 13 },
};