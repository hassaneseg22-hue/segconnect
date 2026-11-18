'use client';

import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { Loader2, Save, LogOut, KeyRound, Upload, Trash2, Mail, ShieldCheck, User as UserIcon, Phone } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { BusinessCard, fmtPhone } from '@/components/BusinessCard';

interface ProfileData {
  id: number;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  pendingEmail: string | null;
  emailVerifiedAt: string | null;
  phone: string | null;
  jobTitle: string | null;
  avatar: string | null;
  roleCode: string;
  roleName: string;
  agencyId: number | null;
  agencyName: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string | null;
  profileUpdatedAt: string | null;
}

function formatDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/profile', { cache: 'no-store' });
      const json = await res.json();
      if (json.ok) setProfile(json.data as ProfileData);
    } catch {
      // silencieux
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // --- Infos de contact ---
  const [infoError, setInfoError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  async function onSaveInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInfoError(''); setInfoMsg(''); setSavingInfo(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: fd.get('first_name'),
          last_name: fd.get('last_name'),
          phone: fd.get('phone') || null,
          job_title: fd.get('job_title') || null,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        const reason: Record<string, string> = {
          INVALID_NAME: 'Le prénom et le nom sont obligatoires (100 caractères max).',
          INVALID_PHONE: 'Le numéro de téléphone est invalide (6 à 20 chiffres, +, -, espaces, parenthèses).',
          NOT_FOUND: 'Utilisateur introuvable.',
          VALIDATION_ERROR: 'Données envoyées invalides.',
        };
        setInfoError(json.message || reason[json.error] || 'Erreur lors de la mise à jour.');
        return;
      }
      setProfile(json.data);
      setInfoMsg('Profil mis à jour.');
      refresh();
    } catch {
      setInfoError('Erreur réseau.');
    } finally {
      setSavingInfo(false);
    }
  }

  // --- Avatar ---
  const [avatarError, setAvatarError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onUploadAvatar(f: File | undefined) {
    if (!f) return;
    setAvatarError(''); setAvatarBusy(true);
    const fd = new FormData();
    fd.append('file', f);
    try {
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) { setAvatarError(json.error === 'INVALID_SIZE' ? 'Image trop volumineuse (max 5 Mo).' : json.error === 'INVALID_TYPE' ? 'Format non accepté (JPG, PNG, WEBP uniquement).' : 'Erreur lors de l’upload.'); return; }
      setProfile((p) => p ? { ...p, avatar: json.data.avatar } : p);
      refresh();
    } catch {
      setAvatarError('Erreur réseau.');
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onRemoveAvatar() {
    setAvatarError(''); setAvatarBusy(true);
    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) { setAvatarError('Erreur lors de la suppression.'); return; }
      setProfile((p) => p ? { ...p, avatar: null } : p);
      refresh();
    } catch {
      setAvatarError('Erreur réseau.');
    } finally {
      setAvatarBusy(false);
    }
  }

  const avatarSafe =
    profile?.avatar &&
    /^\/uploads\/profiles\/user-[a-zA-Z0-9-]+-[a-f0-9]+\.webp$/.test(profile.avatar)
      ? profile.avatar
      : '';
  const initials = ((profile?.firstName || '')[0] || '') + ((profile?.lastName || '')[0] || '');

  // --- Changement d'email ---
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [emailToken, setEmailToken] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  async function onRequestEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError(''); setEmailMsg(''); setEmailToken(''); setEmailBusy(true);
    try {
      const res = await fetch('/api/profile/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!json.ok) {
        setEmailError(json.message || (json.error === 'EMAIL_IN_USE' ? 'Cet email est déjà utilisé.' : 'Adresse email invalide.'));
        return;
      }
      setProfile((p) => p ? { ...p, pendingEmail: json.data.pendingEmail } : p);
      setEmailToken(json.data.confirmToken || '');
      setEmailMsg('Demande enregistrée. Cliquez sur « Confirmer » pour valider la nouvelle adresse.');
    } catch {
      setEmailError('Erreur réseau.');
    } finally {
      setEmailBusy(false);
    }
  }

  async function onConfirmEmail() {
    setEmailError(''); setEmailBusy(true);
    try {
      const res = await fetch('/api/profile/confirm-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: emailToken }),
      });
      const json = await res.json();
      if (!json.ok) { setEmailError('Échec de la confirmation.'); return; }
      setProfile((p) => p ? { ...p, email: json.data.email, pendingEmail: null, emailVerifiedAt: new Date().toISOString() } : p);
      setEmailToken(''); setEmail('');
      setEmailMsg('Adresse email mise à jour.');
      refresh();
    } catch {
      setEmailError('Erreur réseau.');
    } finally {
      setEmailBusy(false);
    }
  }

  async function onCancelEmail() {
    if (!profile?.pendingEmail) return;
    setEmailBusy(true); setEmailError('');
    try {
      await fetch('/api/profile/change-email', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      setProfile((p) => p ? { ...p, pendingEmail: null } : p);
      setEmailToken(''); setEmail('');
    } catch {} finally {
      setEmailBusy(false);
    }
  }

  // --- Mot de passe ---
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  async function onChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwError(''); setPwMsg(''); setPwBusy(true);
    try {
      const res = await fetch('/api/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const json = await res.json();
      if (!json.ok) { setPwError(json.message || 'Erreur lors du changement de mot de passe.'); return; }
      setPwCurrent(''); setPwNew('');
      setPwMsg('Mot de passe modifié. Les autres sessions ont été déconnectées.');
    } catch {
      setPwError('Erreur réseau.');
    } finally {
      setPwBusy(false);
    }
  }

  if ((loadingProfile || !profile) && user) {
    return (
      <div style={{ maxWidth: 640, display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-dim)' }} />
      </div>
    );
  }

  const data = profile;
  if (!data) return null;
  const isDg = String(data.roleCode || '').toUpperCase() === 'SUPER_ADMIN';

  return (
    <div className="pf-page">
      <div className="pf-head">
        <h2 className="users-title">Mon profil</h2>
        <p>Gérez vos informations personnelles, votre photo et la sécurité de votre compte.</p>
      </div>

      <section className="pf-hero">
        <div className="pf-avatar-wrap">
          <div className="pf-avatar">
            <span className="pf-avatar-spin" aria-hidden="true" />
            <div className="pf-avatar-img" style={{ background: avatarSafe ? 'transparent' : 'linear-gradient(135deg, #1e3a5f, #0f2038)' }}>
              {avatarSafe ? <img src={avatarSafe} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (initials || 'DG')}
            </div>
          </div>
          <div className="pf-avatar-actions">
            <button type="button" title="Changer la photo" onClick={() => fileRef.current?.click()} disabled={avatarBusy} style={styles.iconBtn}>
              <Upload size={13} />
            </button>
            {avatarSafe && (
              <button type="button" title="Supprimer la photo" onClick={onRemoveAvatar} disabled={avatarBusy} style={{ ...styles.iconBtn, color: '#f87171' }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => onUploadAvatar(e.target.files?.[0])}
          />
        </div>

        <div className="pf-hero-body">
          <h3 className="pf-name">{[data.firstName, data.lastName].filter(Boolean).join(' ') || data.displayName}</h3>
          <div className="pf-title"><span className="pf-flag" />{data.jobTitle || data.roleName || 'SEG Guinée'}</div>
          <div className="pf-meta">
            <span><Mail size={13} />{isDg ? 'dg@segguinee.com' : data.email}</span>
            {data.pendingEmail && <span style={{ color: '#f59e0b', fontWeight: 600 }}>en attente : {data.pendingEmail}</span>}
            {(isDg || (data.phone && data.phone !== 'null')) && <span><Phone size={13} />{isDg ? fmtPhone('+224626060657') : fmtPhone(String(data.phone))}</span>}
          </div>
          <div className="pf-badges">
            {data.roleName && data.roleName !== (data.jobTitle || data.roleName) && (
              <span className={`role-badge role-${data.roleCode?.toLowerCase()}`}>{data.roleName}</span>
            )}
            {data.agencyName && <span className="role-badge">{data.agencyName}</span>}
          </div>
        </div>

        <div className="pf-stats">
          <div className="pf-stat"><span>Membre depuis</span><b>{formatDate(data.createdAt)}</b></div>
          <div className="pf-stat"><span>Dernière connexion</span><b>{formatDate(data.lastLoginAt)}</b></div>
          <div className="pf-stat">
            <span>Statut</span>
            <b className="pf-status"><i />{['active', 'actif'].includes((data.status || '').toLowerCase()) ? 'Actif' : (data.status || '—')}</b>
          </div>
        </div>
      </section>

      {avatarError && <div className="db-error-banner" style={{ marginTop: 12 }}>{avatarError}</div>}

      <div style={{ marginTop: 16 }}>
        <BusinessCard
          firstName={data.firstName}
          lastName={data.lastName}
          displayName={data.displayName}
          jobTitle={data.jobTitle || data.roleName}
          email={isDg ? 'dg@segguinee.com' : data.email}
          phone={isDg ? '+224626060657' : (data.phone && data.phone !== 'null' ? data.phone : null)}
          avatar={avatarSafe || ''}
          initials={initials}
        />
      </div>
      <div className="pf-grid">
      <div className="pf-col">
      {/* ---------- Informations de contact ---------- */}
      <form onSubmit={onSaveInfo} className="users-card" style={{ marginTop: 14 }}>
        <h3 className="section-title"><UserIcon size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Informations de contact</h3>
        {infoError && <div className="db-error-banner">{infoError}</div>}
        {infoMsg && <div className="db-success-banner">{infoMsg}</div>}
        <div className="form-grid">
          <label className="form-field">
            <span>Prénom</span>
            <input name="first_name" defaultValue={data.firstName || ''} required />
          </label>
          <label className="form-field">
            <span>Nom</span>
            <input name="last_name" defaultValue={data.lastName || ''} required />
          </label>
          <label className="form-field">
            <span>Téléphone</span>
            <input name="phone" defaultValue={data.phone && data.phone !== 'null' ? data.phone : ''} placeholder="+224 ..." />
          </label>
          <label className="form-field">
            <span>Fonction / Poste</span>
            <input name="job_title" defaultValue={data.jobTitle || ''} />
          </label>
        </div>
        <button type="submit" className="btn-primary form-submit" disabled={savingInfo}>
          {savingInfo ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Enregistrer
        </button>
      </form>

      {/* ---------- Changement d'email ---------- */}
      <div className="users-card" style={{ marginTop: 14 }}>
        <h3 className="section-title"><Mail size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Adresse email</h3>
        {data.pendingEmail && !emailToken ? (
          <div className="db-success-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>Confirmation en attente pour <b>{data.pendingEmail}</b>.</span>
            <button type="button" className="btn-ghost-danger" onClick={onCancelEmail} disabled={emailBusy}>Annuler</button>
          </div>
        ) : (
          <form onSubmit={onRequestEmail} style={{ marginTop: 4 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: '0 0 10px' }}>
              Modifier l'adresse email du compte. Une étape de confirmation est requise avant l'application effective.
            </p>
            {emailError && <div className="db-error-banner">{emailError}</div>}
            {emailMsg && <div className="db-success-banner">{emailMsg}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nouvelle@adresse.tg"
                style={styles.input}
                required
              />
              <button type="submit" className="btn-primary" disabled={emailBusy || !!emailToken}>
                {emailBusy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                Demander le changement
              </button>
            </div>
            {emailToken && (
              <div style={{ marginTop: 12 }}>
                <div className="db-success-banner" style={{ marginBottom: 10 }}>
                  Cliquez pour appliquer la nouvelle adresse <b>{data.pendingEmail}</b>.
                </div>
                <button type="button" className="btn-primary" onClick={onConfirmEmail} disabled={emailBusy}>
                  {emailBusy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  Confirmer la nouvelle adresse
                </button>
              </div>
            )}
          </form>
        )}
      </div>

      </div>
      <div className="pf-col">
      {/* ---------- Sécurité ---------- */}
      <div className="users-card" style={{ marginTop: 14 }}>
        <h3 className="section-title"><KeyRound size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Sécurité</h3>
        {pwError && <div className="db-error-banner">{pwError}</div>}
        {pwMsg && <div className="db-success-banner">{pwMsg}</div>}
        <form onSubmit={onChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="form-field">
            <span>Mot de passe actuel</span>
            <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} required autoComplete="current-password" />
          </label>
          <label className="form-field">
            <span>Nouveau mot de passe</span>
            <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} required minLength={8} autoComplete="new-password" />
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" className="btn-primary" disabled={pwBusy}>
              {pwBusy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
              Changer le mot de passe
            </button>
            <button type="button" className="btn-ghost-danger" onClick={() => logout()}>
              <LogOut size={15} /> Se déconnecter
            </button>
          </div>
        </form>
      </div>

      {/* ---------- État du compte ---------- */}
      <div className="users-card">
        <h3 className="section-title"><ShieldCheck size={15} style={{ verticalAlign: -2, marginRight: 6 }} />État du compte</h3>
        <ul className="pf-checks">
          <li className={data.emailVerifiedAt ? 'ok' : 'warn'}>
            <span className="pf-dot" />
            <div><b>Adresse e-mail</b><small>{data.emailVerifiedAt ? 'Vérifiée le ' + formatDate(data.emailVerifiedAt) : 'Non vérifiée'}</small></div>
          </li>
          <li className="ok">
            <span className="pf-dot" />
            <div><b>Dernière connexion</b><small>{formatDate(data.lastLoginAt)}</small></div>
          </li>
          <li className="ok">
            <span className="pf-dot" />
            <div><b>Profil mis à jour</b><small>{formatDate(data.profileUpdatedAt || data.createdAt)}</small></div>
          </li>
          <li className="ok">
            <span className="pf-dot" />
            <div><b>Mot de passe</b><small>8 caractères minimum, à renouveler régulièrement</small></div>
          </li>
        </ul>
        <div className="pf-tip">Ne partagez jamais votre mot de passe et déconnectez-vous sur les appareils partagés.</div>
      </div>
      </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  iconBtn: {
    background: 'var(--bg-inner)',
    border: '1px solid var(--border-color)',
    color: '#38bdf8',
    borderRadius: 8,
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
  },
  input: {
    flex: '1 1 200px',
    background: 'var(--bg-inner)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    color: 'var(--text-strong)',
    padding: '9px 11px',
    fontSize: 13,
    outline: 'none',
  },
};
