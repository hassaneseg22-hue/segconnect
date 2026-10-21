'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Plus, Users as UsersIcon, ChevronLeft, ChevronRight, UserCheck, UserX, Pause, Trash2, MailCheck } from 'lucide-react';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { useAuth } from '@/components/auth/AuthProvider';

type UserRow = {
  id: number;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  role_code: string;
  role_name: string;
  agency_name: string | null;
  status: string;
  last_login_at: string | null;
  created_at: string;
};

const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE: { bg: 'rgba(16,185,129,0.14)', color: '#34d399', label: 'Actif' },
  INVITED: { bg: 'rgba(37,99,235,0.14)', color: '#60a5fa', label: 'Invité' },
  SUSPENDED: { bg: 'rgba(245,158,11,0.14)', color: '#fbbf24', label: 'Suspendu' },
  DISABLED: { bg: 'rgba(239,68,68,0.14)', color: '#f87171', label: 'Désactivé' },
};

function UsersList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    try {
      const res = await fetch(`/api/users?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Erreur');
      setRows(json.data.items || []);
      setTotal(json.data.total || 0);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page]);

  async function updateStatus(id: number, next: string) {
    if (!confirm('Confirmer le changement de statut de cet utilisateur ?')) return;
    const res = await fetch(`/api/users/${id}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json();
    if (!json.ok) { alert(json.message || 'Action refusée'); return; }
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const isDG = user?.role === 'SUPER_ADMIN';

  return (
    <div>
      <div className="users-toolbar">
        <h2 className="users-title">Gestion des Utilisateurs</h2>
        <div className="users-actions">
          <div className="users-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(); } }}
              placeholder="Rechercher un utilisateur…"
            />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); load(); }}>
            <option value="">Tous les statuts</option>
            <option value="ACTIVE">Actifs</option>
            <option value="INVITED">Invités</option>
            <option value="SUSPENDED">Suspendus</option>
            <option value="DISABLED">Désactivés</option>
          </select>
          <Link href="/users/new" className="btn-primary">
            <Plus size={15} /> Nouvel utilisateur
          </Link>
        </div>
      </div>

      {error && <div className="db-error-banner">{error}</div>}

      <div className="users-card">
        <table className="users-table">
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Contact</th>
              <th>Rôle</th>
              <th>Agence</th>
              <th>Statut</th>
              <th>Dernière connexion</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Chargement…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Aucun utilisateur.</td></tr>
            ) : rows.map((r) => {
              const st = statusStyles[r.status] || { bg: 'rgba(100,116,139,0.2)', color: 'var(--text-muted)', label: r.status };
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/users/${r.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }}>
                      {r.display_name}
                    </Link>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.first_name} {r.last_name}</div>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{r.email}</td>
                  <td>
                    <span className={`role-badge role-${r.role_code?.toLowerCase()}`}>{r.role_name}</span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{r.agency_name || '—'}</td>
                  <td>
                    <span style={{ background: st.bg, color: st.color, padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600 }}>
                      {st.label}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {r.last_login_at ? new Date(r.last_login_at).toLocaleString('fr-FR') : 'Jamais'}
                  </td>
                  <td>
                    <div className="row-actions">
                      {r.status === 'ACTIVE' ? (
                        isDG && r.role_code !== 'SUPER_ADMIN' && (
                          <button title="Suspendre" onClick={() => updateStatus(r.id, 'SUSPENDED')}><Pause size={14} /></button>
                        )
                      ) : r.status === 'SUSPENDED' ? (
                        isDG && (
                          <button title="Réactiver" onClick={() => updateStatus(r.id, 'ACTIVE')}><UserCheck size={14} /></button>
                        )
                      ) : r.status === 'INVITED' ? (
                        isDG && (
                          <button title="Renvoi d’invitation" onClick={() => updateStatus(r.id, 'INVITED')}><MailCheck size={14} /></button>
                        )
                      ) : null}
                      {isDG && r.role_code !== 'SUPER_ADMIN' && r.status !== 'DISABLED' && (
                        <button title="Désactiver" onClick={() => { if (confirm('Désactiver définitivement ce compte ?')) fetch(`/api/users/${r.id}`, { method: 'DELETE' }).then(() => load()); }}><Trash2 size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="users-pagination">
        <span>{total} utilisateur(s)</span>
        <div>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  return (
    <RequirePermission code="users.view">
      <UsersList />
    </RequirePermission>
  );
}