'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Copy, CheckCircle2 } from 'lucide-react';
import { RequirePermission } from '@/components/auth/RequirePermission';

function NewUserForm() {
  const router = useRouter();
  const [roles, setRoles] = useState<any[]>([]);
  const [agencies, setAgencies] = useState<any[]>([]);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [job, setJob] = useState('');
  const [roleId, setRoleId] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ id: number; token: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/roles', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/filters', { cache: 'no-store' }).then((r) => r.json()),
    ]).then(([r, f]) => {
      if (r.ok) setRoles(r.data.roles.filter((x: any) => x.code !== 'SUPER_ADMIN'));
      if (f.ok && f.data.agencies) setAgencies(f.data.agencies);
    }).catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: first, last_name: last, email, phone: phone || null,
          job_title: job || null, role_id: Number(roleId), agency_id: agencyId ? Number(agencyId) : null,
        }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.message || 'Erreur lors de la création'); return; }
      setCreated(json.data);
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    const inviteUrl = `${window.location.origin}/activate-account?token=${created.token}`;
    return (
      <div className="users-card" style={{ maxWidth: 560, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <CheckCircle2 color="#10b981" />
          <h2 style={{ color: 'var(--text-strong)', margin: 0, fontSize: 18 }}>Utilisateur créé</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>Le lien d'invitation a été généré. Transmettez-le à l'utilisateur pour activer son compte.</p>
        <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#60a5fa', wordBreak: 'break-all', margin: '14px 0' }}>
          {inviteUrl}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-primary" onClick={() => navigator.clipboard.writeText(inviteUrl)}><Copy size={14} /> Copier le lien</button>
          <button className="btn-secondary" onClick={() => router.push('/users')}>Voir la liste</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="users-toolbar">
        <Link href="/users" className="btn-icon-back"><ArrowLeft size={16} /></Link>
        <h2 className="users-title">Nouvel utilisateur</h2>
      </div>

      {error && <div className="db-error-banner">{error}</div>}

      <form onSubmit={onSubmit} className="users-card" style={{ maxWidth: 620 }}>
        <div className="form-grid">
          <label className="form-field">
            <span>Prénom *</span>
            <input value={first} onChange={(e) => setFirst(e.target.value)} required placeholder="Prénom" />
          </label>
          <label className="form-field">
            <span>Nom *</span>
            <input value={last} onChange={(e) => setLast(e.target.value)} required placeholder="Nom" />
          </label>
          <label className="form-field">
            <span>E-mail professionnel *</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nom@seg.tg" />
          </label>
          <label className="form-field">
            <span>Téléphone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+224 ..." />
          </label>
          <label className="form-field">
            <span>Poste / Fonction</span>
            <input value={job} onChange={(e) => setJob(e.target.value)} placeholder="Ex : Responsable technique" />
          </label>
          <label className="form-field">
            <span>Rôle *</span>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
              <option value="">Sélectionner un rôle</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Agence</span>
            <select value={agencyId} onChange={(e) => setAgencyId(e.target.value)}>
              <option value="">—</option>
              {agencies.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        <p className="form-note">L'utilisateur recevra un lien d'invitation à activer avec un mot de passe de son choix (min. 8 caractères).</p>
        <button type="submit" className="btn-primary form-submit" disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {loading ? 'Création…' : 'Créer l’utilisateur'}
        </button>
      </form>
    </div>
  );
}

export default function NewUserPage() {
  return (
    <RequirePermission code="users.create">
      <NewUserForm />
    </RequirePermission>
  );
}