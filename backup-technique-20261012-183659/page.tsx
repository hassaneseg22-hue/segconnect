'use client';

import { useState } from 'react';
import { Droplets, ArrowLeft, TrendingUp, AlertCircle, Gauge, Activity } from 'lucide-react';
import Link from 'next/link';
import { num, pct } from '@/lib/format';
import { DetailFilterBar } from '@/components/DetailFilterBar';
import { useOverview } from '@/lib/use-overview';

export default function ProductionPage() {
  const [year, setYear] = useState(2026);
  const [clientType, setClientType] = useState('');
  const { data, loading, error } = useOverview(year, clientType);

  const kpis = data?.kpis || {};
  const monthly = data?.monthly || [];
  const production = Number(kpis.production) || 0;
  const networkYield = Number(kpis.networkYield) || 0;
  const billingRatio = Number(kpis.billingRatio) || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} />
          Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Production d'Eau</span>
      </div>

      {/* Filters */}
      <DetailFilterBar
        year={year}
        onYear={setYear}
        clientType={clientType}
        onClientType={setClientType}
        loading={loading}
        error={error}
        label={`Filtres : Exercice ${year}`}
      />
      {error && <div className="db-error-banner">{error}. Démarre MySQL dans XAMPP puis recharge la page.</div>}

      {/* Header */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2><Droplets size={20} style={{ display: 'inline', marginRight: '6px', color: '#06b6d4' }} />Production d'Eau — Bilan Hydrologique National</h2>
          <p>Suivi du débit de production et des volumes distribués sur le réseau SEG — exercice {year}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="subpage-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }}>
              <Droplets size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Volume produit</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '18px' }}>{num(production)}</span>
                <span className="kpi-total-val">m³</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend info">Cumul période</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
              <Activity size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Rendement réseau</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{pct(networkYield)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend warning">Pertes : {pct(Math.max(0, 1 - networkYield))}</span>
            <span className="kpi-period">Objectif ≥ 90%</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
              <Gauge size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Bilan de facturation</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{pct(billingRatio)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend warning">Vol. facturé / produit</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertCircle size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Mois suivis</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{monthly.length}</span>
                <span className="kpi-total-val">/ 12</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend danger">Données mensuelles</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>
      </div>

      {/* Production mensuelle */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Production Mensuelle (m³) — {year}</h3>
          <span className="badge-pill cyan">Cumul : {`${num(production)} m³`}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Mois</th>
                <th>Volume produit (m³)</th>
                <th>Volume consommé (m³)</th>
                <th>Volume facturé (m³)</th>
                <th>Réalisation</th>
              </tr>
            </thead>
            <tbody>
              {monthly.length === 0 && (
                <tr><td colSpan={5} style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
                  {loading ? 'Chargement des données…' : 'Aucune donnée mensuelle pour cette sélection'}
                </td></tr>
              )}
              {monthly.map((m: any) => {
                const prod = Number(m.production) || 0;
                const consum = Number(m.consumption) || 0;
                const billed = Number(m.billing_volume) || 0;
                const yieldPct = prod > 0 ? consum / prod : 0;
                return (
                  <tr key={m.month}>
                    <td><strong style={{ color: 'var(--text-strong)' }}>{m.month}</strong></td>
                    <td style={{ fontWeight: 700, color: '#38bdf8' }}>{num(prod)}</td>
                    <td>{num(consum)}</td>
                    <td>{num(billed)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: 6, background: '#11263f', borderRadius: 999, overflow: 'hidden', minWidth: 80 }}>
                          <div style={{ width: `${Math.min(yieldPct * 100, 100)}%`, height: '100%', background: yieldPct >= 0.9 ? '#10b981' : '#f59e0b', borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: '11px', color: yieldPct >= 0.9 ? '#10b981' : '#f59e0b', fontWeight: 700, minWidth: '40px' }}>
                          {pct(yieldPct)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dark-alert-box info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
          <Droplets size={16} />
          <span>Note Technique — Ressources Hydriques</span>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          La production nationale s'appuie principalement sur les eaux de surface captées au niveau des fleuves Niger (Djoliba), Konkouré (barrages Souapiti & Kaléta) et Milo. Le rendement réseau s'établit à {pct(networkYield)} sur l'exercice {year}, avec un bilan de facturation de {pct(billingRatio)}.
        </p>
      </div>
    </div>
  );
}
