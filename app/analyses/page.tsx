'use client';

import { BarChart3, TrendingUp, Calendar, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AnalysesPage() {
  const comparisons = [
    { indicator: 'Chiffre d\'affaires facturé', s1_2025: '27 480 000 000 GNF', s1_2026: '30 999 848 698 GNF', delta: '+12.8%', status: 'positive' },
    { indicator: 'Montant encaissé brut', s1_2025: '24 140 000 000 GNF', s1_2026: '26 850 783 150 GNF', delta: '+11.2%', status: 'positive' },
    { indicator: 'Volume d\'eau produit', s1_2025: '8 650 000 m³', s1_2026: '9 045 200 m³', delta: '+4.6%', status: 'positive' },
    { indicator: 'Volume facturé', s1_2025: '7 134 000 m³', s1_2026: '7 497 963 m³', delta: '+5.1%', status: 'positive' },
    { indicator: 'Rendement moyen réseau', s1_2025: '82.4%', s1_2026: '83.0%', delta: '+0.6 pt', status: 'positive' },
    { indicator: 'Portefeuille abonnés actifs', s1_2025: '27 730', s1_2026: '29 508', delta: '+6.4%', status: 'positive' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Subpage Header */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2>Rapports & Analyses Multi-Exercices</h2>
          <p>Comparaison stricte des tendances semestrielles (S1 2025 vs S1 2026) sur bases homogènes</p>
        </div>
        <div className="subpage-filters">
          <select className="select-dark" defaultValue="s1">
            <option value="s1">Période : S1 2025 vs S1 2026</option>
            <option value="annuel">Plein Exercice (Prévisions 2026)</option>
          </select>
          <button className="btn-brand" style={{ fontSize: '11.5px', padding: '7px 12px' }}>
            <FileText size={14} />
            <span>Exporter Rapport PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="subpage-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              <TrendingUp size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Croissance Chiffre d'Affaires</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ color: '#10b981' }}>+12.8%</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">▲ +3.51 Md GNF</span>
            <span className="kpi-period">S1/S1</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <BarChart3 size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Volumes Facturés</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ color: '#38bdf8' }}>+5.1%</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">▲ +363 963 m³</span>
            <span className="kpi-period">Consommation mesurée</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <CheckCircle2 size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Nouveaux Raccordements</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">+1 778</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">▲ +6.4% parc</span>
            <span className="kpi-period">Conakry & Provinces</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(147, 51, 234, 0.15)', color: '#c084fc', border: '1px solid rgba(147, 51, 234, 0.3)' }}>
              <Calendar size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Taux Recouvrement Global</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">83.01%</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Stable vs 2025</span>
            <span className="kpi-period">Objectif 85%</span>
          </div>
        </div>
      </div>

      {/* Comparative Table */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Tableau Comparatif des Grandes Masses (S1 2025 vs S1 2026)</h3>
          <span className="badge-pill cyan">Périmètre ISO-Semestre</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Agrégat Opérationnel</th>
                <th>S1 2025 (Réalisé)</th>
                <th>S1 2026 (Réalisé)</th>
                <th>Variation (%)</th>
                <th>Tendance</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((row) => (
                <tr key={row.indicator}>
                  <td style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{row.indicator}</td>
                  <td>{row.s1_2025}</td>
                  <td style={{ color: '#38bdf8', fontWeight: 600 }}>{row.s1_2026}</td>
                  <td style={{ color: '#10b981', fontWeight: 700 }}>{row.delta}</td>
                  <td><span className="badge-pill green">En progression</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Methodology Box */}
      <div className="dark-alert-box info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
          <AlertCircle size={16} />
          <span>Règle méthodologique de gouvernance des données SEG</span>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          Les comparaisons s'effectuent strictement sur des fenêtres calendaires identiques (Janvier à Juin). Toute comparaison asymétrique (6 mois contre 12 mois) est explicitement proscrite pour garantir l'intégrité des analyses soumises au Conseil d'Administration.
        </p>
      </div>
    </div>
  );
}
