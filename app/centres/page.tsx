'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { NewFeatureBubble } from '@/components/NewFeatureBubble';
import Link from 'next/link';
import {
  AlertOctagon, RefreshCw, Search, Fuel, FlaskConical, Droplets, Zap, CheckCircle2, ArrowLeft,
} from 'lucide-react';
import SectionSituationDR from '@/components/centres/SectionSituationDR';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { useAuth } from '@/components/auth/AuthProvider';

type Row = Record<string, any>;

const CAT_LABEL: Record<string, string> = {
  carburant: 'Carburant',
  produits_chimiques: 'Produits chimiques',
  fuite: 'Fuite',
  panne_equipement: 'Panne équipement',
  electricite_edg: 'Électricité EDG',
  vandalisme: 'Vandalisme',
  travaux: 'Travaux',
  consommables: 'Consommables',
};
const CAT_COLOR: Record<string, string> = {
  carburant: '#f59e0b', produits_chimiques: '#c084fc', fuite: '#38bdf8',
  panne_equipement: '#f87171', electricite_edg: '#facc15', vandalisme: '#fb7185',
  travaux: '#94a3b8', consommables: '#34d399',
};
const STATUT_META: Record<string, { label: string; color: string }> = {
  arret: { label: 'À l’arrêt', color: '#f87171' },
  perturbe: { label: 'Perturbé', color: '#fbbf24' },
  en_cours: { label: 'En cours de réparation', color: '#38bdf8' },
  resolu: { label: 'Résolu', color: '#34d399' },
};
const GRAVITE_META: Record<string, { label: string; color: string; rank: number }> = {
  critique: { label: 'Critique', color: '#f87171', rank: 0 },
  elevee: { label: 'Élevée', color: '#fb923c', rank: 1 },
  moyenne: { label: 'Moyenne', color: '#fbbf24', rank: 2 },
  faible: { label: 'Faible', color: '#34d399', rank: 3 },
};
const STATUT_RANK: Record<string, number> = { arret: 0, perturbe: 1, en_cours: 2, resolu: 3 };

const fmt = (v: unknown) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(v) || 0);

function jours(r: Row): { n: number | null; approx: boolean } {
  if (!r.date_debut || r.date_debut_precision === 'inconnue') return { n: null, approx: false };
  const n = Math.max(0, Math.floor((Date.now() - new Date(r.date_debut).getTime()) / 86400000));
  return { n, approx: r.date_debut_precision !== 'jour' };
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      color, background: `${color}22`, border: `1px solid ${color}55`, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function KpiCard({ icon, color, title, value, note }: {
  icon: React.ReactNode; color: string; title: string; value: number; note: string;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-header">
        <div className="kpi-icon-wrap" style={{ background: `${color}26`, color, border: `1px solid ${color}55` }}>{icon}</div>
        <div className="kpi-title-value">
          <div className="kpi-title">{title}</div>
          <div className="kpi-num-row"><span className="kpi-main-val">{value}</span></div>
        </div>
      </div>
      <div className="kpi-foot-row"><span className="kpi-period">{note}</span></div>
    </div>
  );
}

const selectStyle = {
  background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)',
  borderRadius: 8, padding: '8px 12px', fontSize: 12.5, minWidth: 150,
} as const;

export default function CentresPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('centres.update');

  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row | null>(null);
  const [rapport, setRapport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<number | null>(null);
  const [fStatut, setFStatut] = useState('all');
  const [fCat, setFCat] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/centres', { cache: 'no-store', credentials: 'include' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || `Chargement impossible (HTTP ${res.status}).`);
      setRows(j.rows ?? []);
      setSummary(j.summary ?? null);
      setRapport(j.rapport_date ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = async (id: number, patch: Record<string, unknown>) => {
    setSaving(id);
    setError('');
    try {
      const res = await fetch('/api/centres', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || 'Mise à jour impossible.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mise à jour impossible.');
    } finally {
      setSaving(null);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => fStatut === 'all' || r.statut === fStatut)
      .filter((r) => fCat === 'all' || (r.categories ?? []).includes(fCat))
      .filter((r) => !q || `${r.centre} ${r.region} ${r.probleme}`.toLowerCase().includes(q))
      .sort((a, b) =>
        (STATUT_RANK[a.statut] ?? 9) - (STATUT_RANK[b.statut] ?? 9) ||
        (GRAVITE_META[a.gravite]?.rank ?? 9) - (GRAVITE_META[b.gravite]?.rank ?? 9) ||
        (jours(b).n ?? -1) - (jours(a).n ?? -1));
  }, [rows, fStatut, fCat, search]);

  const chartData = useMemo(() => {
    const open = rows.filter((r) => r.statut !== 'resolu');
    return Object.keys(CAT_LABEL)
      .map((k) => ({ key: k, name: CAT_LABEL[k], value: open.filter((r) => (r.categories ?? []).includes(k)).length }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  const rapportLabel = rapport ? new Date(rapport).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <Link href="/" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={13} /> Tableau de bord
          </Link>
          <h1 style={{ fontSize: 22, margin: '6px 0 2px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertOctagon size={22} color="#f87171" /> Centres de l’intérieur — problèmes techniques urgents
          </h1>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Rapport du {rapportLabel} · Sous-Direction Technique des Centres
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading} style={{ ...selectStyle, minWidth: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualiser
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', fontSize: 13 }}>
          {error}
        </div>
      )}

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
          <NewFeatureBubble id="centres-boffa-2026-11" block title="Centre de Boffa à l’arrêt"
            lines={['Pompe de la station grillée, pas de production depuis presque deux mois.', 'Signalement du chef de centre, 13/11/2026.']}>
            <KpiCard icon={<AlertOctagon size={18} />} color="#f87171" title="Centres à l’arrêt" value={summary.arret} note={`sur ${summary.total} centres signalés`} />
          </NewFeatureBubble>
          <KpiCard icon={<AlertOctagon size={18} />} color="#fbbf24" title="Production perturbée" value={summary.perturbe} note={`${summary.critiques} cas critiques ouverts`} />
          <KpiCard icon={<Fuel size={18} />} color="#f59e0b" title="Manque de carburant" value={summary.carburant} note="centres concernés" />
          <KpiCard icon={<FlaskConical size={18} />} color="#c084fc" title="Produits chimiques" value={summary.produits_chimiques} note="centres concernés" />
          <KpiCard icon={<Droplets size={18} />} color="#38bdf8" title="Fuites sur conduite" value={summary.fuite} note="à réparer" />
          <KpiCard icon={<Zap size={18} />} color="#facc15" title="Dépendance EDG" value={summary.electricite_edg} note="fourniture électrique perturbée" />
        </div>
      )}
      <SectionSituationDR />

      {chartData.length > 0 && (
        <div className="kpi-card" style={{ marginBottom: 18, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Causes des perturbations (centres concernés)</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} layout="vertical" margin={{ left: 30, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 11, color: '#fff' }} />
                <Bar dataKey="value" name="Centres" radius={[0, 4, 4, 0]}>
                  {chartData.map((d) => <Cell key={d.key} fill={CAT_COLOR[d.key] ?? '#38bdf8'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un centre…"
            style={{ ...selectStyle, paddingLeft: 30, minWidth: 220 }} />
        </div>
        <select value={fStatut} onChange={(e) => setFStatut(e.target.value)} style={selectStyle}>
          <option value="all">Tous les statuts</option>
          {Object.entries(STATUT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={fCat} onChange={(e) => setFCat(e.target.value)} style={selectStyle}>
          <option value="all">Toutes les causes</option>
          {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{visible.length} centre(s)</span>
      </div>

      <div className="kpi-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 980 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
              {['Centre', 'Problème', 'Statut', 'Gravité', 'Durée', 'Dernier gasoil livré', 'Action prévue', canEdit ? 'Mise à jour' : ''].map((h) => (
                <th key={h} style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement…</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Aucun centre ne correspond.</td></tr>
            )}
            {visible.map((r) => {
              const st = STATUT_META[r.statut] ?? { label: r.statut, color: '#94a3b8' };
              const gr = GRAVITE_META[r.gravite] ?? { label: r.gravite, color: '#94a3b8', rank: 9 };
              const d = jours(r);
              const g = r.dernier_gasoil;
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)', opacity: r.statut === 'resolu' ? 0.6 : 1, verticalAlign: 'top' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <b>{r.centre}</b>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.region}</div>
                  </td>
                  <td style={{ padding: '10px 12px', maxWidth: 360 }}>
                    <div>{r.probleme}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                      {(r.categories ?? []).map((c: string) => <Badge key={c} color={CAT_COLOR[c] ?? '#94a3b8'}>{CAT_LABEL[c] ?? c}</Badge>)}
                    </div>
                    {r.observation && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>{r.observation}</div>}
                  </td>
                  <td style={{ padding: '10px 12px' }}><Badge color={st.color}>{st.label}</Badge></td>
                  <td style={{ padding: '10px 12px' }}><Badge color={gr.color}>{gr.label}</Badge></td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    {d.n === null ? '—' : <b style={{ color: d.n > 90 ? '#f87171' : d.n > 30 ? '#fbbf24' : 'inherit' }}>{d.approx ? '~' : ''}{d.n} j</b>}
                    {r.heures_production_jour != null && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{Number(r.heures_production_jour)} h/j produites</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    {g ? (
                      <span title={g.product}>
                        {fmt(g.quantity)} <span style={{ color: 'var(--text-secondary)' }}>· {String(g.month).padStart(2, '0')}/{g.exercise}</span>
                      </span>
                    ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {r.solution ?? '—'}
                    {r.responsable && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.responsable}</div>}
                  </td>
                  {canEdit && (
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <select
                        value={r.statut}
                        disabled={saving === r.id}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'resolu' && !window.confirm(`Marquer « ${r.centre} » comme résolu ?`)) return;
                          void update(r.id, { statut: v });
                        }}
                        style={{ ...selectStyle, minWidth: 130, padding: '5px 8px', fontSize: 12 }}
                      >
                        {Object.entries(STATUT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      {r.statut === 'resolu' && <CheckCircle2 size={14} color="#34d399" style={{ marginLeft: 6, verticalAlign: 'middle' }} />}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {summary?.derniere_livraison_donnees && (
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 10 }}>
          Livraisons de gasoil : dernière période enregistrée dans les données d’approvisionnement : {String(summary.derniere_livraison_donnees).slice(5)}/{String(summary.derniere_livraison_donnees).slice(0, 4)}.
        </div>
      )}
    </div>
  );
}
