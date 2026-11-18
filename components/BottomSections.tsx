'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Info } from 'lucide-react';

type AgencyPerformance = {
  name: string;
  revenue: number;
  recovery: number;
  balance: number;

  // Données officielles des impayés SEG
  impayesEmissions?: number;
  impayes?: number;
  impayesRate?: number;
};
type QualityIssue = { id: number; severity: string; category: string; message: string; sheet_name?: string | null; excel_row?: number | null };

const CAUSES: Record<string, { label: string; color: string }> = {
  carburant: { label: 'Manque de carburant', color: '#f59e0b' },
  produits_chimiques: { label: 'Produits chimiques', color: '#c084fc' },
  fuite: { label: 'Fuites sur conduite', color: '#38bdf8' },
  panne_equipement: { label: 'Pannes d’équipement', color: '#f87171' },
  electricite_edg: { label: 'Électricité EDG', color: '#facc15' },
  vandalisme: { label: 'Vandalisme', color: '#fb7185' },
  travaux: { label: 'Travaux', color: '#94a3b8' },
  consommables: { label: 'Consommables', color: '#34d399' },
};

export function IncidentsByTypeCard(_props: { available?: boolean }) {
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [view, setView] = useState<'causes' | 'regions'>('causes');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/centres', { cache: 'no-store', credentials: 'include' });
        if (res.status === 401 || res.status === 403) { if (alive) setState('forbidden'); return; }
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.ok) { if (alive) setState('error'); return; }
        if (alive) { setRows(j.rows ?? []); setState('ok'); }
      } catch { if (alive) setState('error'); }
    };
    void load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const open = useMemo(() => rows.filter((r) => r.statut !== 'resolu'), [rows]);
  const nArret = open.filter((r) => r.statut === 'arret').length;
  const nPerturbe = open.filter((r) => r.statut === 'perturbe').length;

  const bars = useMemo(() => {
    if (view === 'causes') {
      return Object.entries(CAUSES)
        .map(([k, v]) => ({ key: k, label: v.label, color: v.color, n: open.filter((r) => (r.categories ?? []).includes(k)).length }))
        .filter((b) => b.n > 0)
        .sort((x, y) => y.n - x.n)
        .slice(0, 6);
    }
    const byRegion = new Map<string, number>();
    open.forEach((r) => byRegion.set(String(r.region), (byRegion.get(String(r.region)) ?? 0) + 1));
    return Array.from(byRegion.entries())
      .map(([region, n]) => ({ key: region, label: region, color: '#38bdf8', n }))
      .sort((x, y) => y.n - x.n)
      .slice(0, 6);
  }, [open, view]);

  const longest = useMemo(
    () => open
      .filter((r) => r.statut === 'arret' && r.date_debut && r.date_debut_precision !== 'inconnue')
      .map((r) => ({ centre: String(r.centre), jours: Math.max(0, Math.floor((Date.now() - new Date(r.date_debut).getTime()) / 86400000)) }))
      .sort((x, y) => y.jours - x.jours)
      .slice(0, 3),
    [open]
  );
  const max = Math.max(1, ...bars.map((b) => b.n));
  const msg = (icon: React.ReactNode, title: string, text: string) => (
    <div style={{ minHeight: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
      <div>{icon}<div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginTop: 8 }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 7, lineHeight: 1.5 }}>{text}</div></div>
    </div>
  );

  return <div className="dashboard-card">
    <div className="card-header-flex"><h3>Incidents par Type</h3>
      <div className="dropdown-badge">
        <select value={view} onChange={(e) => setView(e.target.value as 'causes' | 'regions')} aria-label="Regrouper par"
          style={{ background: 'transparent', color: 'inherit', border: 'none', fontSize: 11, cursor: 'pointer', outline: 'none' }}>
          <option value="causes">Par cause</option>
          <option value="regions">Par région</option>
        </select>
      </div>
    </div>
    {state === 'loading' && msg(<Info size={22} color="#38bdf8" />, 'Chargement…', '')}
    {state === 'forbidden' && msg(<AlertTriangle size={22} color="#f59e0b" />, 'Accès restreint', 'Le module « Centres de l’intérieur » n’est pas autorisé pour ce compte.')}
    {state === 'error' && msg(<AlertTriangle size={22} color="#f59e0b" />, 'Données momentanément indisponibles', 'Le registre des centres ne répond pas. Réessayez dans quelques instants.')}
    {state === 'ok' && open.length === 0 && msg(<CheckCircle2 size={22} color="#34d399" />, 'Aucun incident ouvert', 'Tous les problèmes signalés dans les centres sont résolus.')}
    {state === 'ok' && open.length > 0 && (
      <div id="seg-incidents-centres" style={{ padding: '4px 4px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
          <b style={{ color: '#f87171' }}>{nArret} à l’arrêt</b><span style={{ color: 'var(--text-dim)' }}>·</span>
          <b style={{ color: '#fbbf24' }}>{nPerturbe} perturbés</b>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-dim)' }}>centres concernés</span>
        </div>
        {bars.map((b) => (
          <div key={b.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
              <span>{b.label}</span><b style={{ color: b.color }}>{b.n}</b>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(148,163,184,0.15)' }}>
              <div style={{ width: `${(b.n / max) * 100}%`, height: '100%', borderRadius: 3, background: b.color }} />
            </div>
          </div>
        ))}
        {longest.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6, marginTop: 2 }}>
            Arrêts les plus longs : {longest.map((l) => `${l.centre} (${l.jours} j)`).join(' · ')}
          </div>
        )}
      </div>
    )}
    <a href="/centres" className="card-footer-link">Voir les centres de l’intérieur →</a>
  </div>;
}

export function RecentAlertsCard({ issues = [] }: { issues?: QualityIssue[] }) {
  return <div className="dashboard-card">
    <div className="card-header-flex"><h3 style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:3,height:14,background:'#38bdf8',borderRadius:2}}/>Alertes & qualité des données</h3></div>
    <div className="alerts-list">
      {issues.length ? issues.slice(0,4).map((issue) => <div key={issue.id} className="alert-row">
        <div className={`alert-icon-box ${issue.severity==='critical'?'critical':issue.severity==='warning'?'warning':'info'}`}><AlertTriangle size={13}/></div>
        <div className="alert-details"><h5>{issue.category}</h5><p>{issue.message}</p></div>
        <div className="alert-time">{issue.excel_row ? `L${issue.excel_row}` : ''}</div>
      </div>) : <div style={{padding:'24px 10px',textAlign:'center',fontSize:12,color:'var(--text-dim)'}}><Info size={18}/><div style={{marginTop:6}}>Aucune anomalie non résolue.</div></div>}
    </div>
    <a href="/qualite" className="card-footer-link">Voir la qualité des données →</a>
  </div>;
}

export function RegionalPerformanceCard({
  data = [],
}: {
  data?: AgencyPerformance[];
}) {
  /*
   * Performance des agences basée sur les IMPAYÉS OFFICIELS SEG.
   *
   * Source :
   *   public.seg_impayes_zone
   *
   * On affiche :
   *   - émissions
   *   - impayés
   *   - taux d'impayés
   *
   * Aucun chiffre artificiel n'est généré.
   */

  const rows = data
    .filter((item) => {
      return (
        Number(item.impayesEmissions ?? 0) > 0 ||
        Number(item.impayes ?? 0) > 0
      );
    })
    .sort(
      (a, b) =>
        Number(b.impayes ?? 0) -
        Number(a.impayes ?? 0)
    )
    .slice(0, 11);

  const formatGNF = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      maximumFractionDigits: 0,
    }).format(value) + ' GNF';
  };

  return (
    <div className="dashboard-card">
      <div className="card-header-flex">
        <h3>Performance des Agences</h3>

        <div className="dropdown-badge">
          <span>Impayés</span>
          <ChevronDown size={12} />
        </div>
      </div>

      <div className="perf-list">
        {rows.length ? (
          rows.map((item) => {
            const emissions = Number(
              item.impayesEmissions ?? 0
            );

            const impayes = Number(
              item.impayes ?? 0
            );

            const calculatedRate =
              emissions > 0
                ? impayes / emissions
                : 0;

            const rate = Number.isFinite(
              Number(item.impayesRate)
            )
              ? Number(item.impayesRate)
              : calculatedRate;

            const percentage = Math.max(
              0,
              Math.min(100, rate * 100)
            );

            return (
              <div
                key={item.name}
                className="perf-row"
              >
                <div className="perf-top">
                  <span className="name">
                    {item.name}
                  </span>

                  <span className="val">
                    {percentage.toFixed(1)}%
                  </span>
                </div>

                <div className="perf-bar-bg">
                  <div
                    className="perf-bar-fill"
                    style={{
                      width: `${percentage}%`,
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginTop: 5,
                    fontSize: 10,
                    color: 'var(--text-dim)',
                  }}
                >
                  <span>
                    Émissions:{' '}
                    {formatGNF(emissions)}
                  </span>

                  <span>
                    Impayés:{' '}
                    {formatGNF(impayes)}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div
            style={{
              padding: 20,
              color: 'var(--text-dim)',
              fontSize: 12,
            }}
          >
            Aucune donnée d'impayés disponible.
          </div>
        )}
      </div>

      <a
        href="/kpi/impayes"
        className="card-footer-link"
      >
        Voir le détail des impayés →
      </a>
    </div>
  );
}
