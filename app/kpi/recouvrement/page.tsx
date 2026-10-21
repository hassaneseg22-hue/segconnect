'use client';

import { useState } from 'react';
import { TrendingUp, ArrowLeft, Wallet, CheckCircle2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { gnf, pct } from '@/lib/format';
import { DetailFilterBar } from '@/components/DetailFilterBar';
import { useOverview } from '@/lib/use-overview';

const palette = ['#10b981','#3b82f6','#06b6d4','#eab308','#f59e0b','#ef4444','#8b5cf6','#0284c7','#64748b'];

export default function RecouvrementPage() {
  const [year, setYear] = useState(2026);
  const [clientType, setClientType] = useState('');
  const { data, loading, error } = useOverview(year, clientType);

  const kpis = data?.kpis || {};
  const agencies = data?.agencies || [];
  const recovery = Number(kpis.recovery) || 0;
  const recoveryUpdated = kpis.recoveryUpdated;
  const paid = Number(kpis.paid) || 0;
  const billedWithPenalty = Number(kpis.billedWithPenalty) || 0;
  const balance = Number(kpis.balance) || 0;
  const sorted = [...agencies].sort((a: any, b: any) => (Number(b.recovery) || 0) - (Number(a.recovery) || 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} />
          Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Taux de Recouvrement</span>
      </div>

      {/* Filters */}
      <DetailFilterBar
        year={year}
        onYear={setYear}
        clientType={clientType}
        onClientType={setClientType}
        loading={loading}
        error={error}
        label={`Filtres : Exercice ${year}${clientType ? ` · ${clientType}` : ' · Tous segments'}`}
      />
      {error && <div className="db-error-banner">{error}. Démarre MySQL dans XAMPP puis recharge la page.</div>}

      {/* Page Header */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2><TrendingUp size={20} style={{ display: 'inline', marginRight: '6px', color: '#059669' }} />Taux de Recouvrement — Performance Encaissements</h2>
          <p>Suivi du taux de recouvrement brut et actualisé des factures SEG par agence — exercice {year}</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="subpage-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(5,150,105,0.15)', color: '#10b981', border: '1px solid rgba(5,150,105,0.3)' }}>
              <TrendingUp size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Taux de recouvrement brut</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ color: '#10b981' }}>{pct(recovery)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Brut</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
              <CheckCircle2 size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Recouvrement actualisé</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{recoveryUpdated == null ? '—' : pct(recoveryUpdated)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Actualisé</span>
            <span className="kpi-period">Sur créances actuelles</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
              <Wallet size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Total encaissé</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '17px' }}>{gnf(paid)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Encaissé réel</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(147,51,234,0.15)', color: '#c084fc', border: '1px solid rgba(147,51,234,0.3)' }}>
              <ShieldAlert size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Reste à recouvrer</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '17px', color: '#ef4444' }}>{gnf(balance)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend danger">Sur {gnf(billedWithPenalty)}</span>
            <span className="kpi-period">Montant exigible</span>
          </div>
        </div>
      </div>

      {/* Performance par agence */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Taux de Recouvrement par Agence</h3>
          <span className="badge-pill cyan">Objectif : 85%</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Agence</th>
                <th>Taux de recouvrement</th>
                <th>Réalisation</th>
                <th>Écart / Cible</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={5} style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
                  {loading ? 'Chargement des données…' : 'Aucune donnée pour cette sélection'}
                </td></tr>
              )}
              {sorted.map((a: any, i: number) => {
                const rec = Number(a.recovery) || 0;
                const gap = rec - 0.85;
                const color = palette[i % palette.length];
                return (
                  <tr key={i}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                        <strong style={{ color: 'var(--text-strong)' }}>{a.name}</strong>
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, color: rec >= 0.85 ? '#10b981' : '#f59e0b' }}>{pct(rec)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: 6, background: '#11263f', borderRadius: 999, overflow: 'hidden', minWidth: 100 }}>
                          <div style={{ width: `${Math.min(rec * 100, 100)}%`, height: '100%', background: color, borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '40px' }}>{(rec * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td style={{ color: gap >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                      {gap >= 0 ? '+' : ''}{(gap * 100).toFixed(1)} pts
                    </td>
                    <td>
                      <span className={rec >= 0.85 ? 'badge-pill green' : 'badge-pill amber'}>
                        {rec >= 0.85 ? 'Objectif atteint' : 'En dessous'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alerte */}
      <div className="dark-alert-box warning">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#f59e0b', marginBottom: '4px' }}>
          <ShieldAlert size={16} />
          <span>Point d'attention DG — Analyse du recouvrement</span>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          Le taux de recouvrement brut consolidé s'établit à {pct(recovery)} sur l'exercice {year}{clientType ? ` pour la catégorie « ${clientType} »` : ' toutes catégories confondues'}{recoveryUpdated == null ? '' : `, et à ${pct(recoveryUpdated)} en actualisé`}. Le reste à recouvrer atteint {gnf(balance)} sur {gnf(billedWithPenalty)} exigibles. Une commission interministérielle de compensation est programmée pour apurer les mandats administratifs.
        </p>
      </div>
    </div>
  );
}
