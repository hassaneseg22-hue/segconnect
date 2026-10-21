'use client';

import { useEffect, useState, Suspense, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

function ResetForm() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const supabase = createSupabaseBrowserClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session) {
        setError(
          'Le lien de récupération est invalide, expiré ou la session n’a pas pu être établie.'
        );
      }

      setChecking(false);
    }

    void checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    setError(null);

    if (password.length < 8) {
      setError(
        'Le mot de passe doit contenir au moins 8 caractères.'
      );
      return;
    }

    if (password !== confirm) {
      setError(
        'Les deux mots de passe ne correspondent pas.'
      );
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError(
          'La session de récupération est invalide ou expirée. Demandez un nouveau lien.'
        );
        return;
      }

      const { error: updateError } =
        await supabase.auth.updateUser({
          password,
        });

      if (updateError) {
        console.error(
          '[reset-password] Supabase:',
          updateError
        );

        setError(
          'Impossible de modifier le mot de passe. Le lien peut être expiré.'
        );
        return;
      }

      setDone(true);

      await supabase.auth.signOut();
    } catch (err) {
      console.error(
        '[reset-password] Erreur:',
        err
      );

      setError(
        'Une erreur est survenue. Veuillez réessayer.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div style={styles.loading}>
        <Loader2
          size={22}
          className="animate-spin"
        />
        <span>Vérification du lien...</span>
      </div>
    );
  }

  if (done) {
    return (
      <div style={styles.success}>
        <CheckCircle2
          size={32}
          color="#10b981"
        />

        <p style={styles.successText}>
          Votre mot de passe a été réinitialisé
          avec succès.
        </p>

        <p style={styles.successSubtext}>
          Vous pouvez maintenant vous connecter
          avec votre nouveau mot de passe.
        </p>

        <Link
          href="/login"
          style={styles.submitLink}
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={styles.form}
    >
      {error && (
        <div style={styles.error}>
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div style={styles.passwordWrap}>
        <input
          type={show ? 'text' : 'password'}
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          placeholder="Nouveau mot de passe"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={loading}
          style={{
            ...styles.input,
            paddingRight: 40,
          }}
        />

        <button
          type="button"
          onClick={() => setShow(!show)}
          style={styles.eye}
          aria-label={
            show
              ? 'Masquer le mot de passe'
              : 'Afficher le mot de passe'
          }
          disabled={loading}
        >
          {show ? (
            <EyeOff size={16} />
          ) : (
            <Eye size={16} />
          )}
        </button>
      </div>

      <input
        type={show ? 'text' : 'password'}
        value={confirm}
        onChange={(e) =>
          setConfirm(e.target.value)
        }
        placeholder="Confirmer le mot de passe"
        autoComplete="new-password"
        required
        minLength={8}
        disabled={loading}
        style={styles.input}
      />

      <button
        type="submit"
        disabled={
          loading ||
          !password ||
          !confirm
        }
        style={styles.submit}
      >
        {loading && (
          <Loader2
            size={16}
            className="animate-spin"
          />
        )}

        <span>
          {loading
            ? 'Modification...'
            : 'Réinitialiser'}
        </span>
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}>
          <Lock
            size={20}
            style={{
              verticalAlign: -3,
              marginRight: 6,
            }}
          />
          Nouveau mot de passe
        </h1>

        <p style={styles.subtitle}>
          Choisissez un nouveau mot de passe
          d'au moins 8 caractères.
        </p>

        <Suspense fallback={null}>
          <ResetForm />
        </Suspense>

        <p style={styles.foot}>
          <Link
            href="/login"
            style={styles.link}
          >
            ← Retour à la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}

const styles: Record<
  string,
  React.CSSProperties
> = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background:
      'radial-gradient(800px 400px at 20% -10%, var(--bg-card) 0%, transparent 55%), var(--bg-main)',
    padding: '24px',
  },

  card: {
    width: '100%',
    maxWidth: 400,
    background: 'var(--bg-card)',
    border:
      '1px solid var(--border-color)',
    borderRadius: 16,
    padding: '32px',
  },

  title: {
    color: 'var(--text-strong)',
    fontSize: 19,
    textAlign: 'center',
    margin: 0,
  },

  subtitle: {
    color: 'var(--text-muted)',
    fontSize: 13,
    textAlign: 'center',
    margin: '8px 0 22px',
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },

  passwordWrap: {
    position: 'relative',
  },

  input: {
    background: 'var(--bg-inner)',
    border:
      '1px solid var(--border-color)',
    borderRadius: 8,
    color: 'var(--text-strong)',
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },

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

  submit: {
    background:
      'linear-gradient(135deg, #2563eb, #06b6d4)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: 12,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontSize: 14,
    marginTop: 4,
  },

  submitLink: {
    background:
      'linear-gradient(135deg, #2563eb, #06b6d4)',
    color: '#fff',
    borderRadius: 8,
    padding: '11px 0',
    textDecoration: 'none',
    fontWeight: 700,
    textAlign: 'center',
    display: 'block',
    marginTop: 14,
  },

  success: {
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 14,
    padding: '8px 0',
  },

  successText: {
    color: 'var(--text-strong)',
    fontWeight: 600,
    marginTop: 14,
  },

  successSubtext: {
    fontSize: 13,
    marginTop: 8,
  },

  error: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 8,
    background: 'rgba(239, 68, 68, 0.10)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    color: '#ef4444',
    fontSize: 13,
  },

  loading: {
    minHeight: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    color: 'var(--text-muted)',
    fontSize: 13,
  },

  foot: {
    textAlign: 'center',
    marginTop: 18,
  },

  link: {
    color: '#06b6d4',
    textDecoration: 'none',
    fontSize: 13,
  },
};
