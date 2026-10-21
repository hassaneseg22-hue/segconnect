'use client';

import { useEffect, useState } from 'react';
import { Search, ScrollText, ChevronLeft, ChevronRight, Database, Globe, FilePen, ShieldAlert, KeyRound } from 'lucide-react';
import { RequirePermission } from '@/components/auth/RequirePermission';

type AuditRow = {
  id: number;
  user_id: number | null;
  user_display_name: string | null;
  user_role_code: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  description: string;
  ip_address: string | null;
  result: string;
  created_at: string;
  metadata: any;
  old_values: any;
  new_values: any;
};

const actionIcon: Record<string, any> = {
  LOGIN_SUCCESS: KeyRound,
  LOGIN_FAILED: KeyRound,
  USER_CREATED: Database,
  USER_UPDATED: FilePen,
  USER_DISABLED: ShieldAlert,
  USER_SUSPENDED: ShieldAlert,
  USER_REACTIVATED: Globe,
  PASSWORD_RESET: KeyRound,
  ACCOUNT_ACTIVATED: Globe,
  ROLE_CREATED: Database,
  ROLE_UPDATED: FilePen,
  ROLE_PERMISSIONS_UPDATED: ShieldAlert,
  PERMISSION_GRANTED: FilePen,
  PERMISSION_REVOKED: ShieldAlert,
  USER_SESSION_REVOKED: ShieldAlert,
};

function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  async function load() {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);
    try {
      const res = await fetch(`/api/audit?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || 'Erreur');
      setRows(json.data.items || []);
      setTotal(json.data.total || 0);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <div className="users-toolbar">
        <h2 className="users-title"><ScrollText size={17} style={{ verticalAlign: -2, marginRight: 6 }} /> Journal d’Audit</h2>
        <div className="users-actions">
          <div className="users-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(); } }}
              placeholder="Rechercher (utilisateur, action, description)…"
            />
          </div>
        </div>
      </div>

      {error && <div className="db-error-banner">{error}</div>}

      <div className="users-card">
        <table className="users-table">
          <thead>
            <tr>
              <th>Date / Heure</th>
              <th>Utilisateur</th>
              <th>Action</th>
              <th>Description</th>
              <th>IP</th>
              <th>Résultat</th>
              <th>Détails</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Chargement…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Aucune entrée.</td></tr>
            ) : rows.map((r) => {
              const Icon = actionIcon[r.action] || FilePen;
              return (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 12 }}>
                    {new Date(r.created_at).toLocaleString('fr-FR')}
                  </td>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{r.user_display_name || 'Système'}</div>
                    {r.user_role_code && <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{r.user_role_code}</div>}
                  </td>
                  <td>
                    <span className={`audit-action audit-${r.result?.toLowerCase()}`}>
                      <Icon size={12} /> {r.action}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12.5, maxWidth: 320 }}>{r.description}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{r.ip_address || '—'}</td>
                  <td>
                    <span style={{ color: r.result === 'SUCCESS' ? '#34d399' : '#f87171', fontWeight: 700, fontSize: 12 }}>
                      {r.result === 'SUCCESS' ? 'OK' : 'ÉCHEC'}
                    </span>
                  </td>
                  <td>
                    {r.old_values || r.new_values ? (
                      <button className="btn-ghost-sm" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                        {openId === r.id ? 'Masquer' : 'Voir'}
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openId && rows.find((r) => r.id === openId) && (
        <div className="users-card info-grid" style={{ marginTop: 14 }}>
          {(() => {
            const r = rows.find((x) => x.id === openId)!;
            return (
              <>
                {r.old_values && (
                  <div>
                    <h4>Avant</h4>
                    <pre>{JSON.stringify(r.old_values, null, 2)}</pre>
                  </div>
                )}
                {r.new_values && (
                  <div>
                    <h4>Après</h4>
                    <pre>{JSON.stringify(r.new_values, null, 2)}</pre>
                  </div>
                )}
                {r.metadata && (
                  <div>
                    <h4>Métadonnées</h4>
                    <pre>{JSON.stringify(r.metadata, null, 2)}</pre>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      <div className="users-pagination">
        <span>{total} entrée(s)</span>
        <div>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}

export default () => (
  <RequirePermission code="audit.view">
    <AuditLogPage />
  </RequirePermission>
);