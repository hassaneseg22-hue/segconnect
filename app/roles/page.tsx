'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck, Search } from 'lucide-react';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { useAuth } from '@/components/auth/AuthProvider';

type RoleRow = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  is_system_role: number;
  userCount: number;
  permissionCount: number;
};

type PermRow = { id: number; code: string; module_code: string; action: string; module_name?: string };

function RolesPage() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [perms, setPerms] = useState<PermRow[]>([]);
  const [selected, setSelected] = useState<RoleRow | null>(null);
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/roles', { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || 'Erreur');
      const data = json.data;
      const rolesWith = await Promise.all((data.roles as any[]).map(async (r: any) => {
        const d = await fetch(`/api/roles/${r.id}`, { cache: 'no-store' }).then((x) => x.json());
        return { ...r, userCount: r.user_count ?? 0, permissionCount: d.ok ? d.data.permissions.length : 0 };
      }));
      setRoles(rolesWith);
      setPerms(data.permissions);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function openRole(id: number) {
    setDetailLoading(true);
    const res = await fetch(`/api/roles/${id}`, { cache: 'no-store' });
    const json = await res.json();
    if (json.ok) {
      setSelected({ ...json.data.role, userCount: json.data.role.user_count ?? 0, permissionCount: json.data.permissions.length });
      setRolePerms(json.data.permissions.map((p: any) => p.code));
    }
    setDetailLoading(false);
  }

  async function togglePerm(code: string) {
    if (!selected) return;
    const next = rolePerms.includes(code) ? rolePerms.filter((c) => c !== code) : [...rolePerms, code];
    setRolePerms(next);
  }

  async function savePerms() {
    if (!selected) return;
    const res = await fetch(`/api/roles/${selected.id}/permissions`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: rolePerms }),
    });
    const json = await res.json();
    if (!json.ok) { alert(json.message || 'Action refusée'); return; }
    await load();
    await openRole(selected.id);
    alert('Permissions du rôle enregistrées.');
  }

  const grouped = perms.filter((p) => p.code.toLowerCase().includes(search.toLowerCase()) || p.module_code.toLowerCase().includes(search.toLowerCase()));
  const modules = Array.from(new Set(grouped.map((p) => p.module_code)));

  return (
    <div>
      <div className="users-toolbar">
        <h2 className="users-title">Rôles & Permissions</h2>
      </div>

      {error && <div className="db-error-banner">{error}</div>}

      <div className="roles-layout">
        <div className="roles-list">
          {loading ? (
            <div style={{ padding: 24, color: 'var(--text-muted)' }}>Chargement…</div>
          ) : roles.map((r) => (
            <button key={r.id} className={`role-card ${selected?.id === r.id ? 'active' : ''}`} onClick={() => openRole(r.id)}>
              <div className="role-card-head">
                <ShieldCheck size={16} color={r.code === 'SUPER_ADMIN' ? '#f59e0b' : '#38bdf8'} />
                <span>{r.name}</span>
                {r.code === 'SUPER_ADMIN' && <em>DG</em>}
              </div>
              <div className="role-card-sub">
                {r.permissionCount} permissions · {r.userCount} utilisateur(s)
              </div>
            </button>
          ))}
        </div>

        <div className="roles-detail users-card">
          {!selected ? (
            <p style={{ color: 'var(--text-dim)', padding: 24, fontSize: 13 }}>
              Sélectionnez un rôle pour voir et modifier ses permissions.
            </p>
          ) : detailLoading ? (
            <p style={{ color: 'var(--text-muted)', padding: 24 }}>Chargement…</p>
          ) : (
            <>
              <div className="roles-detail-head">
                <h3>{selected.name}</h3>
                <code>{selected.code}</code>
                {selected.code === 'SUPER_ADMIN' && (
                  <span className="role-note">Permissions fixes — toutes accordées.</span>
                )}
              </div>
              <div className="roles-search">
                <Search size={13} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrer par module ou permission…" />
              </div>
              {modules.map((mod) => (
                <div key={mod}>
                  <h4 className="perm-module">{mod}</h4>
                  <div className="perm-grid">
                    {grouped.filter((p) => p.module_code === mod).map((p) => (
                      <label key={p.id} className={`perm-check ${rolePerms.includes(p.code) ? 'on' : ''}`}>
                        {selected.code !== 'SUPER_ADMIN' && (
                          <input type="checkbox" checked={rolePerms.includes(p.code)} onChange={() => togglePerm(p.code)} />
                        )}
                        <div>
                          <div className="perm-name">{p.action}</div>
                          <div className="perm-code">{p.code}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {selected.code !== 'SUPER_ADMIN' && (
                <button className="btn-primary form-submit" onClick={savePerms}>Enregistrer les permissions</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default () => (
  <RequirePermission code="roles.view">
    <RolesPage />
  </RequirePermission>
);