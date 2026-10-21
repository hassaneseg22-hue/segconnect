'use client';

import { useState } from 'react';
import { Droplets, ArrowLeft, TrendingUp, Receipt, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { num, pct } from '@/lib/format';
import { DetailFilterBar } from '@/components/DetailFilterBar';
import { useOverview } from '@/lib/use-overview';

const palette = ['#10b981','#3b82f6','#0284c7','#eab308','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#64748b'];

export default function VolumeFacturePage() {
  const [year, setYear] = useState(2026);
  const [clientType, setClientType] = useState('');
  const { data, loading, error } = useOverview(year, clientType);

  const kpis = data?.kpis || {};
  const monthly = data?.monthly || [];
  const agencies = data?.agencies || [];
  const volumeBilled = Number(kpis.volumeBilled) || 0;
  const volumeConsumed = Number(kpis.volumeConsumed) || 0;
  const production = Number(kpis.production) || 0;
  const billingRatio = production > 0 ? volumeBilled / production : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} />
          Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Volume Facturé</span>
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
          <h2><Receipt size={20} style={{ display: 'inline', marginRight: '6px', color: '#10b981' }} />Volume Facturé — Suivi de la Facturation</h2>
          <p>Analyse des volumes d'eau facturés aux abonnés SEG par mois et par agence — exercice {year}</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="subpage-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
              <Receipt size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Volume facturé cumulé</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '18px' }}>{num(volumeBilled)}</span>
                <span className="kpi-total-val">m³</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Cumul période</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }}>
              <Droplets size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Volume consommé</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{num(volumeConsumed)}</span>
                <span className="kpi-total-val">m³</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Relevés validés</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(147,51,234,0.15)', color: '#c084fc', border: '1px solid rgba(147,51,234,0.3)' }}>
              <TrendingUp size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Bilan de facturation</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{pct(billingRatio)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend warning">Facturé / produit</span>
            <span className="kpi-period">Objectif ≥ 78%</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
              <AlertTriangle size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Mois de facturation</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{monthly.length}</span>
                <span className="kpi-total-val">/ 12</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend danger">Données mensuelles</span>
            <span className="kpi-period">{clientType || 'National'}</span>
          </div>
        </div>
      </div>

      {/* Facturation mensuelle */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Évolution Mensuelle du Volume Facturé (m³) — {year}</h3>
          <span className="badge-pill cyan">{`Cumul : ${num(volumeBilled)} m³`}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Mois</th>
                <th>Volume facturé (m³)</th>
                <th>Volume consommé (m³)</th>
                <th>Réalisation</th>
              </tr>
            </thead>
            <tbody>
              {monthly.length === 0 && (
                <tr><td colSpan={4} style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
                  {loading ? 'Chargement des données…' : 'Aucune donnée mensuelle pour cette sélection'}
                </td></tr>
              )}
              {monthly.map((m: any) => {
                const billed = Number(m.billing_volume) || 0;
                const consum = Number(m.consumption) || 0;
                const pctReal = consum > 0 ? billed / consum : 0;
                return (
                  <tr key={m.month}>
                    <td><strong style={{ color: 'var(--text-strong)' }}>{m.month}</strong></td>
                    <td style={{ fontWeight: 700, color: '#38bdf8' }}>{num(billed)}</td>
                    <td>{num(consum)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: 6, background: '#11263f', borderRadius: 999, overflow: 'hidden', minWidth: 80 }}>
                          <div style={{ width: `${Math.min(pctReal * 100, 100)}%`, height: '100%', background: pctReal >= 0.9 ? '#10b981' : '#f59e0b', borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: '11px', color: pctReal >= 0.9 ? '#10b981' : '#f59e0b', fontWeight: 700, minWidth: '40px' }}>
                          {pct(pctReal)}
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

      {/* Répartition par agence */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Répartition du Volume Facturé par Agence</h3>
          <span className="badge-pill green">{agencies.length} Agences</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {agencies.length === 0 && (
            <div style={{ color: 'var(--text-dim)', padding: '16px', gridColumn: '1 / -1' }}>
              {loading ? 'Chargement des données…' : 'Aucune donnée pour cette sélection'}
            </div>
          )}
          {agencies.map((a: any, i: number) => {
            const color = palette[i % palette.length];
            const vol = Number(a.volumeBilled) || 0;
            const part = volumeBilled > 0 ? vol / volumeBilled : 0;
            return (
              <div key={i} style={{
                background: 'var(--bg-inner)',
                border: `1px solid ${color}30`,
                borderRadius: '8px',
                padding: '14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>{a.name}</span>
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '4px' }}>
                  {num(vol)} <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500 }}>m³</span>
                </div>
                <div style={{ height: 4, background: '#1e3a5f', borderRadius: 999, overflow: 'hidden', marginBottom: '6px' }}>
                  <div style={{ width: `${Math.min(part * 100, 100)}%`, height: '100%', background: color, borderRadius: 999 }} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{(part * 100).toFixed(1)}% du volume facturé</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alerte */}
      <div className="dark-alert-box info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
          <AlertTriangle size={16} />
          <span>Point d'Analyse DG — Dynamique de Facturation</span>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          Le volume facturé cumulé s'établit à {num(volumeBilled)} m³ sur l'exercice {year}{clientType ? ` pour la catégorie « ${clientType} »` : ' toutes catégories confondues'}, avec un bilan de facturation de {pct(billingRatio)} du volume produit. Le taux de couverture des relevés reste un levier d'amélioration du rendement commercial.
        </p>
      </div>
    </div>
  );
}
