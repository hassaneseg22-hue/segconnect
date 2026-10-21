'use client';

import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle, RefreshCw, FileSearch } from 'lucide-react';

const anomaliesList = [
  { id: 'ANO-01', type: 'Technique', title: 'Rendements réseau supérieurs à 100%', description: 'Lignes sources présentant une facturation supérieure aux volumes injectés déclarés sur Kindia et Matam.', severity: 'danger', impact: 'Élevé' },
  { id: 'ANO-02', type: 'Facturation', title: 'Données partielles Novembre 2025', description: 'Relevés incomplets sur 3 sous-secteurs ruraux suite à une migration de base de données.', severity: 'amber', impact: 'Moyen' },
  { id: 'ANO-03', type: 'Nomenclature', title: 'Variantes de casse et dénominations', description: 'Différences typographiques entre agences (ex: "ADMNISTRATION" / "Admnistration"). Normalisation automatique en place.', severity: 'cyan', impact: 'Faible' },
  { id: 'ANO-04', type: 'Formules', title: 'Résidus formules Excel (#REF! / #DIV/0!)', description: 'Fichiers historiques tableurs nettoyés par le moteur d\'import sécurisé Next.js.', severity: 'green', impact: 'Résolu' }
];

export default function QualitePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Subpage Header */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2>Contrôle Qualité & Intégrité des Données</h2>
          <p>Principe de gouvernance DG : Les anomalies sont identifiées, tracées et corrigées, jamais masquées</p>
        </div>
        <div className="subpage-filters">
          <button className="btn-brand" style={{ fontSize: '11.5px', padding: '7px 12px' }}>
            <RefreshCw size={13} />
            <span>Lancer Audit d'Intégrité</span>
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="subpage-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <ShieldCheck size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Conformité Facturation</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ color: '#10b981' }}>98.4%</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Validé Direction Financière</span>
            <span className="kpi-period">Audit OK</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <AlertTriangle size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Cohérence Technique</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ color: '#f59e0b', fontSize: '17px' }}>À contrôler</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend warning">Vérification capteurs</span>
            <span className="kpi-period">En cours</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              <CheckCircle size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Intégrité Recouvrement</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ color: '#38bdf8' }}>100%</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Rapprochement bancaire</span>
            <span className="kpi-period">Conforme</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <ShieldAlert size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Anomalies Actives</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ color: '#ef4444' }}>3</span>
                <span className="kpi-total-val">sur 4 résolues</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend danger">Sous surveillance DG</span>
            <span className="kpi-period">Cellule Data</span>
          </div>
        </div>
      </div>

      {/* Anomalies Table */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Registre Officiel des Écarts et Anomalies Détectées</h3>
          <span className="badge-pill amber">Suivi en continu</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Réf</th>
                <th>Domaine</th>
                <th>Description de l'anomalie</th>
                <th>Niveau d'Impact</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {anomaliesList.map((item) => (
                <tr key={item.id}>
                  <td style={{ color: '#38bdf8', fontWeight: 700 }}>{item.id}</td>
                  <td>{item.type}</td>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{item.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.description}</div>
                  </td>
                  <td>
                    {item.severity === 'danger' && <span className="badge-pill red">Critique</span>}
                    {item.severity === 'amber' && <span className="badge-pill amber">Important</span>}
                    {item.severity === 'cyan' && <span className="badge-pill cyan">Modéré</span>}
                    {item.severity === 'green' && <span className="badge-pill green">Normal</span>}
                  </td>
                  <td>
                    {item.severity === 'green' ? (
                      <span className="badge-pill green">Traité</span>
                    ) : (
                      <span className="badge-pill amber">Investigation</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
