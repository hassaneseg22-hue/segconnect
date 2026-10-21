'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Save, UserCheck, Pause, UserX } from 'lucide-react';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { useAuth } from '@/components/auth/AuthProvider';

type Detail = {
  id: number;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  role_id: number;
  role_code: string;
  role_name: string;
  agency_id: number | null;
  agency_name: string | null;
  status: string;
  last_login_at: string | null;
  created_at: string;
};

function UserDetail() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<Detail | null>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [agencies, setAgencies] = useState<any[]>([]);
  const [perms, setPerms] = useState<any[]>([]);
  const [individual, setIndividual] = useState<Record<string, boolean>>({});
  const [sessions, setSessions] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isSelf = user?.id === Number(params.id);
  const isDG = user?.role === 'SUPER_ADMIN';
  const isTargetSuper = data?.role_code === 'SUPER_ADMIN';

  async function load() {
    setLoading(true); setError('');
    try {
      const [d, r, f, p, s] = await Promise.all([
        fetch(`/api/users/${params.id}`, { cache: 'no-store' }).then((x) => x.json()),
        fetch('/api/roles', { cache: 'no-store' }).then((x) => x.json()),
        fetch('/api/filters', { cache: 'no-store' }).then((x) => x.json()),
        fetch(`/api/users/${params.id}/permissions`, { cache: 'no-store' }).then((x) => x.json()),
        fetch(`/api/users/${params.id}/sessions`, { cache: 'no-store' }).then((x) => x.json()),
      ]);
      if (!d.ok) { setError(d.message || 'Utilisateur introuvable'); return; }
      setData(d.data);
      if (r.ok) setRoles(r.data.roles.filter((x: any) => x.code !== 'SUPER_ADMIN'));
      if (f.ok && f.data.agencies) setAgencies(f.data.agencies);
      if (p.ok) { setPerms(p.data.permissions); setIndividual(p.data.individual); }
      if (s.ok) setSessions(s.data);
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/users/${params.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: data?.first_name, last_name: data?.last_name, email: data?.email,
        phone: data?.phone || null, job_title: data?.job_title || null,
        role_id: data?.role_id, agency_id: data?.agency_id,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!json.ok) { alert(json.message || 'Erreur'); return; }
    load();
    alert('Profil enregistré.');
  }

  async function updateStatus(next: string) {
    if (!confirm('Confirmer le changement de statut ?')) return;
    const res = await fetch(`/api/users/${params.id}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json();
    if (!json.ok) { alert(json.message || 'Action refusée'); return; }
    load();
  }

  async function togglePerm(code: string, granted: boolean) {
    const res = await fetch(`/api/users/${params.id}/permissions`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, granted }),
    });
    if (res.ok) load();
  }

  const canEdit = data && !isTargetSuper; // SUPER_ADMIN non modifiable sauf par lui-même
  const canManageStatus = data && isDG && !isTargetSuper;
  const permOverridable = data && !isTargetSuper && !isSelf;

  if (loading) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Chargement…</div>;

  return (
    <div>
      <div className="users-toolbar">
        <Link href="/users" className="btn-icon-back"><ArrowLeft size={16} /></Link>
        <h2 className="users-title">{data?.display_name}</h2>
        <div style={{ flex: 1 }} />
        {canManageStatus && data?.status === 'ACTIVE' && (
          <button className="btn-ghost-danger" onClick={() => updateStatus('SUSPENDED')}><Pause size={14} /> Suspendre</button>
        )}
        {canManageStatus && data?.status === 'SUSPENDED' && (
          <button className="btn-primary" onClick={() => updateStatus('ACTIVE')}><UserCheck size={14} /> Réactiver</button>
        )}
      </div>

      {error && <div className="db-error-banner">{error}</div>}

      <div className="profile-grid">
        <form onSubmit={onSubmit} className="users-card" style={{ maxWidth: 620 }}>
          <h3 className="section-title">Informations du profil</h3>
          <div className="form-grid">
            <label className="form-field">
              <span>Prénom</span>
              <input value={data?.first_name || ''} onChange={(e) => setData({ ...data!, first_name: e.target.value })} disabled={!canEdit || isSelf && data.role_code !== 'SUPER_ADMIN'} />
            </label>
            <label className="form-field">
              <span>Nom</span>
              <input value={data?.last_name || ''} onChange={(e) => setData({ ...data!, last_name: e.target.value })} disabled={!canEdit} />
            </label>
            <label className="form-field">
              <span>E-mail</span>
              <input type="email" value={data?.email || ''} onChange={(e) => setData({ ...data!, email: e.target.value })} disabled={!canEdit} />
            </label>
            <label className="form-field">
              <span>Téléphone</span>
              <input value={data?.phone || ''} onChange={(e) => setData({ ...data!, phone: e.target.value })} disabled={!canEdit} />
            </label>
            <label className="form-field">
              <span>Poste</span>
              <input value={data?.job_title || ''} onChange={(e) => setData({ ...data!, job_title: e.target.value })} disabled={!canEdit} />
            </label>
            <label className="form-field">
              <span>Rôle</span>
              <select value={data?.role_id || ''} onChange={(e) => setData({ ...data!, role_id: Number(e.target.value) })} disabled={!canEdit}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                {isTargetSuper && <option value={data?.role_id}>{data?.role_name}</option>}
              </select>
            </label>
            <label className="form-field">
              <span>Agence</span>
              <select value={data?.agency_id || ''} onChange={(e) => setData({ ...data!, agency_id: e.target.value ? Number(e.target.value) : null })} disabled={!canEdit}>
                <option value="">—</option>
                {agencies.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          </div>
          {canEdit && (
            <button type="submit" className="btn-primary form-submit" disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Enregistrer
            </button>
          )}
        </form>

        {isDG && (
          <div className="users-card">
            <h3 className="section-title">Sessions actives ({sessions.length})</h3>
            {sessions.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Aucune session active.</p>
            ) : (
              <div className="session-list">
                {sessions.map((s) => (
                  <div key={s.id} className="session-row">
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{s.ip_address || '—'}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{s.user_agent || ''}</div>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>
                      {new Date(s.last_activity_at).toLocaleString('fr-FR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {permOverridable && (
        <div className="users-card" style={{ marginTop: 16 }}>
          <h3 className="section-title">Permissions individuelles</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: '4px 0 14px' }}>
            Surcharges en plus du rôle {data?.role_name}. Activez/désactivez une permission pour cet utilisateur.
          </p>
          {Object.keys(individual).length === 0 && perms.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Chargement des permissions…</p>
          ) : (
            <table className="users-table">
              <thead>
                <tr><th>Permission</th><th>Attribuée ?</th></tr>
              </thead>
              <tbody>
                {perms.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: 11.5 }}>{p.code}</div>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={individual[p.code] === true}
                        onChange={(e) => togglePerm(p.code, e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function UserDetailPage() {
  return (
    <RequirePermission code="users.view">
      <UserDetail />
    </RequirePermission>
  );
}