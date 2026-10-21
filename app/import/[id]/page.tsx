'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, TriangleAlert, RotateCcw } from 'lucide-react';

type Detail = {
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
  errorMessage: string | null;
  anomalies: any[];
};

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
function periodLabel(p: string) {
  const m = Number(p.slice(5, 7));
  return `${MONTHS[(m - 1) % 12]} ${p.slice(0, 4)}`;
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/import/${id}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Erreur');
      setData(j.data);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const rollback = async () => {
    if (!data) return;
    if (!window.confirm(`Annuler l'import « ${data.fileName} » ?`)) return;
    const r = await fetch(`/api/import/${id}/rollback`, { method: 'POST' });
    const j = await r.json();
    if (r.ok) { setMsg(`Import annulé (${j.deletedRows} ligne(s) supprimées).`); await load(); }
    else setMsg(j.error || 'Échec.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/import/history" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} /> Historique des imports
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Import #{id}</span>
      </div>

      {error && <div className="dark-alert-box danger"><p style={{ fontSize: '12.5px', color: '#ef4444' }}>{error}</p></div>}
      {msg && <div className="dark-alert-box info"><p style={{ fontSize: '12.5px', color: '#38bdf8' }}>{msg}</p></div>}

      {loading ? (
        <div style={{ color: 'var(--text-dim)', padding: '24px', textAlign: 'center' }}>Chargement…</div>
      ) : data ? (
        <>
          <div className="subpage-header">
            <div className="subpage-title">
              <h2>{data.fileName}</h2>
              <p>Détail de l'import #{data.id} · le {fmtDate(data.importedAt)} {data.userName ? `par ${data.userName}` : ''}</p>
            </div>
            <span className={`badge-pill ${data.status === 'rolled_back' ? 'red' : data.status === 'partial' ? 'amber' : data.status === 'failed' ? 'red' : 'green'}`}>{data.status}</span>
          </div>

          <div className="subpage-kpi-grid">
            <div className="kpi-card"><div className="kpi-title">Lignes</div><div className="kpi-main-val" style={{ fontSize: '22px', color: '#38bdf8' }}>{data.rowsCount}</div><div className="kpi-period">total</div></div>
            <div className="kpi-card"><div className="kpi-title">Nouvelles</div><div className="kpi-main-val" style={{ fontSize: '22px', color: '#10b981' }}>{data.rowsNew ?? 0}</div><div className="kpi-period">nouveau</div></div>
            <div className="kpi-card"><div className="kpi-title">Mises à jour</div><div className="kpi-main-val" style={{ fontSize: '22px', color: '#c084fc' }}>{data.rowsUpdated ?? 0}</div><div className="kpi-period">corrigé</div></div>
            <div className="kpi-card"><div className="kpi-title">Anomalies</div><div className="kpi-main-val" style={{ fontSize: '22px', color: data.anomaliesCount ? '#f59e0b' : '#10b981' }}>{data.anomaliesCount}</div><div className="kpi-period">{data.periodStart ? `${periodLabel(data.periodStart)}${data.periodEnd && data.periodEnd !== data.periodStart ? ` → ${periodLabel(data.periodEnd)}` : ''}` : '—'}</div></div>
          </div>

          {data.errorMessage && <div className="dark-alert-box danger"><p style={{ fontSize: '12.5px', color: '#ef4444' }}>{data.errorMessage}</p></div>}

          {data.status !== 'rolled_back' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-brand ghost" onClick={rollback} style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' }}>
                <RotateCcw size={16} /> Annuler cet import
              </button>
            </div>
          )}

          <div className="dashboard-card" id="anomalies">
            <div className="card-header-flex">
              <h3>Anomalies détectées</h3>
              <span className="badge-pill amber">{data.anomalies.length}</span>
            </div>
            {data.anomalies.length === 0 ? (
              <div style={{ color: '#10b981', padding: '20px', textAlign: 'center', fontSize: '13px' }}>Aucune anomalie — données conformes.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Sévérité</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Feuille</th>
                      <th style={{ textAlign: 'right', padding: '10px' }}>Ligne</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.anomalies.map((a) => (
                      <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px' }}><span className={`badge-pill ${a.severity === 'critical' ? 'red' : a.severity === 'warning' ? 'amber' : 'cyan'}`} style={{ fontSize: '10px' }}>{a.severity}</span></td>
                        <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{a.sheet}</td>
                        <td style={{ padding: '10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{a.excelRow || '—'}</td>
                        <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{a.issueType || '—'}</td>
                        <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{a.message}{a.sourceValue ? <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: 2 }}>valeur : {a.sourceValue}</div> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
      <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
        <TriangleAlert size={12} style={{ display: 'inline', marginRight: 4 }} />{"L'annulation (rollback) supprime exactement les données écrites par cet import. Un fichier corrigé réimporté se liera au nouvel import."}
      </div>
    </div>
  );
}