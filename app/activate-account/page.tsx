'use client';

import { useState, Suspense, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff, CheckCircle2, UserCheck } from 'lucide-react';

function ActivateForm() {
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!json.ok) { setError('Lien invalide ou expiré. Demandez une nouvelle invitation.'); return; }
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
        <CheckCircle2 size={28} color="#10b981" />
        <p>Compte activé ! Vous pouvez maintenant vous connecter.</p>
        <Link href="/login" style={styles.submitLink}>Se connecter</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={styles.form}>
      <p style={styles.hint}>Renseignez un mot de passe pour activer votre compte.</p>
      <div style={styles.passwordWrap}>
        <input
          type={show ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          required
          style={{ ...styles.input, paddingRight: 40 }}
        />
        <button type="button" onClick={() => setShow(!show)} style={styles.eye}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </div>
      <input
        type={show ? 'text' : 'password'}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirmer le mot de passe"
        required
        style={styles.input}
      />
      <button type="submit" disabled={loading} style={styles.submit}>
        {loading && <Loader2 size={16} className="animate-spin" />}
        <span>Activer mon compte</span>
      </button>
    </form>
  );
}

export default function ActivateAccountPage() {
  return (
    <main style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}><UserCheck size={20} style={{ verticalAlign: -3, marginRight: 6 }} /> Activez votre compte</h1>
        <Suspense fallback={null}>
          <ActivateForm />
        </Suspense>
        <p style={styles.foot}><Link href="/login" style={styles.link}>← Retour à la connexion</Link></p>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(800px 400px at 80% 10%, var(--bg-card) 0%, transparent 55%), var(--bg-main)', padding: '24px' },
  card: { width: '100%', maxWidth: 400, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '32px' },
  title: { color: 'var(--text-strong)', fontSize: 19, textAlign: 'center', margin: 0 },
  hint: { color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', margin: '0 0 14px' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  passwordWrap: { position: 'relative' },
  input: { background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--text-strong)', padding: '10px 12px', fontSize: 14, outline: 'none', width: '100%' },
  eye: { position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4, display: 'flex' },
  submit: { background: 'linear-gradient(135deg, #2563eb, #06b6d4)', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, marginTop: 4 },
  submitLink: { background: 'linear-gradient(135deg, #2563eb, #06b6d4)', color: '#fff', borderRadius: 8, padding: '11px 0', textDecoration: 'none', fontWeight: 700, textAlign: 'center', display: 'block', marginTop: 14 },
  success: { textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, padding: '8px 0' },
  foot: { textAlign: 'center', marginTop: 18 },
  link: { color: '#06b6d4', textDecoration: 'none', fontSize: 13 },
};