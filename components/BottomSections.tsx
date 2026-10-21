'use client';

import { AlertTriangle, ChevronDown, Info } from 'lucide-react';

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

export function IncidentsByTypeCard({ available = false }: { available?: boolean }) {
  return <div className="dashboard-card">
    <div className="card-header-flex"><h3>Incidents par Type</h3><div className="dropdown-badge"><span>Source SEG</span><ChevronDown size={12}/></div></div>
    <div style={{minHeight:170,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',padding:20}}>
      <div><AlertTriangle size={22} color="#f59e0b"/><div style={{fontSize:13,fontWeight:700,color:'var(--text-secondary)',marginTop:8}}>{available?'Données incidents disponibles':'Source incidents non connectée'}</div><div style={{fontSize:11,color:'var(--text-dim)',marginTop:7,lineHeight:1.5}}>Les fichiers technico-commerciaux ne contiennent pas de registre d’incidents. Le module attend la future source opérationnelle.</div></div>
    </div>
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
