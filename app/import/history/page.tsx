'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, History, Eye, TriangleAlert, RotateCcw, CheckCircle2, RefreshCw } from 'lucide-react';

type ImportRow = {
  id: number;
  fileName: string;
  sourceYear: number;
  periodStart: string | null;
  periodEnd: string | null;
  importedAt: string;
  status: string;
  rowsCount: number;
  rowsNew: number;
  rowsUpdated: number;
  anomaliesCount: number;
  userName: string | null;
  importType: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  validated: { label: '✓ Réussi', cls: 'green' },
  partial: { label: '⚠ Importé avec anomalies', cls: 'amber' },
  failed: { label: '✗ Échoué', cls: 'red' },
  rolled_back: { label: '↩ Annulé', cls: 'red' },
  pending: { label: 'En attente', cls: 'cyan' },
  analyzing: { label: 'Analyse…', cls: 'cyan' },
};

function fmtDate(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
function periodLabel(p: string) {
  const m = Number(p.slice(5, 7));
  return `${MONTHS[(m - 1) % 12]} ${p.slice(0, 4)}`;
}

export default function ImportHistoryPage() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rolling, setRolling] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/import?limit=100', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Erreur');
      setRows(j.data);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rollback = async (id: number, fileName: string) => {
    if (!window.confirm(`Annuler l'import « ${fileName} » ? Les données liées seront supprimées.`)) return;
    setRolling(id);
    setMsg('');
    try {
      const r = await fetch(`/api/import/${id}/rollback`, { method: 'POST' });
      const j = await r.json();
      if (r.ok) {
        setMsg(`Import #${id} annulé (${j.deletedRows} ligne(s) supprimées).`);
        await load();
      } else {
        setMsg(j.error || 'Impossible d\'annuler.');
      }
    } catch (e: any) {
      setMsg(e.message || 'Erreur réseau.');
    } finally {
      setRolling(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/import" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} /> Import des données
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Historique des imports</span>
      </div>

      <div className="subpage-header">
        <div className="subpage-title">
          <h2>Historique des imports</h2>
          <p>Traçabilité de tous les fichiers SEG intégrés, avec possibilité d'annuler (rollback) un import.</p>
        </div>
        <button className="btn-brand ghost" onClick={load}><RefreshCw size={16} /> Actualiser</button>
      </div>

      {msg && <div className="dark-alert-box info"><p style={{ fontSize: '12.5px', color: '#38bdf8' }}>{msg}</p></div>}
      {error && <div className="dark-alert-box danger"><p style={{ fontSize: '12.5px', color: '#ef4444' }}>{error}</p></div>}

      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Fichiers importés</h3>
          <span className="badge-pill cyan">{rows.length} imports</span>
        </div>
        {loading ? (
          <div style={{ color: 'var(--text-dim)', padding: '24px', textAlign: 'center' }}>Chargement de l'historique…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', padding: '24px', textAlign: 'center' }}>Aucun import pour le moment.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', minWidth: '880px', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 10px' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '10px 10px' }}>Fichier</th>
                  <th style={{ textAlign: 'left', padding: '10px 10px' }}>Période</th>
                  <th style={{ textAlign: 'right', padding: '10px 10px' }}>Lignes</th>
                  <th style={{ textAlign: 'right', padding: '10px 10px' }}>Nouvelles</th>
                  <th style={{ textAlign: 'right', padding: '10px 10px' }}>Mises à jour</th>
                  <th style={{ textAlign: 'right', padding: '10px 10px' }}>Anomalies</th>
                  <th style={{ textAlign: 'left', padding: '10px 10px' }}>Statut</th>
                  <th style={{ textAlign: 'right', padding: '10px 10px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = STATUS_META[r.status] || { label: r.status, cls: 'cyan' };
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtDate(r.importedAt)}</td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{r.fileName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>#{r.id} · {r.importType || 'excel'}</div>
                      </td>
                      <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>
                        {r.periodStart ? `${periodLabel(r.periodStart)}${r.periodEnd && r.periodEnd !== r.periodStart ? ` → ${periodLabel(r.periodEnd)}` : ''}` : '—'}
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>exercice {r.sourceYear || '—'}</div>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.rowsCount}</td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#10b981' }}>{r.rowsNew ?? 0}</td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#c084fc' }}>{r.rowsUpdated ?? 0}</td>
                      <td style={{ padding: '10px', textAlign: 'right', color: r.anomaliesCount ? '#f59e0b' : '#64748b' }}>{r.anomaliesCount}</td>
                      <td style={{ padding: '10px' }}><span className={`badge-pill ${meta.cls}`} style={{ fontSize: '10px' }}>{meta.label}</span></td>
                      <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link href={`/import/${r.id}`} className="notif-link-btn" style={{ color: '#38bdf8', marginRight: '8px' }}><Eye size={13} /> Voir</Link>
                        <Link href={`/import/${r.id}#anomalies`} className="notif-link-btn" style={{ color: '#f59e0b', marginRight: '8px' }}><TriangleAlert size={13} /> Anomalies</Link>
                        {r.status !== 'rolled_back' && (
                          <button className="notif-link-btn" style={{ color: '#ef4444' }} onClick={() => rollback(r.id, r.fileName)} disabled={rolling === r.id}>
                            <RotateCcw size={13} /> {rolling === r.id ? '…' : 'Rollback'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}