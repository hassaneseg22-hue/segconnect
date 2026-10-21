'use client';

import { useState } from 'react';
import { Banknote, ArrowLeft, TrendingUp, Receipt, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { gnf, num } from '@/lib/format';
import { DetailFilterBar } from '@/components/DetailFilterBar';
import { useOverview } from '@/lib/use-overview';

const palette = ['#3b82f6','#f59e0b','#10b981','#8b5cf6','#0284c7','#eab308','#ef4444','#06b6d4','#64748b'];

function gnfCompact(value: number) {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md GNF`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M GNF`;
  return gnf(value);
}

export default function ChiffreAffairesPage() {
  const [year, setYear] = useState(2026);
  const [clientType, setClientType] = useState('');
  const { data, loading, error } = useOverview(year, clientType);

  const kpis = data?.kpis || {};
  const agencies = data?.agencies || [];
  const revenue = Number(kpis.revenue) || 0;
  const volumeBilled = Number(kpis.volumeBilled) || 0;
  const billedWithPenalty = Number(kpis.billedWithPenalty) || 0;
  const avgPrice = volumeBilled > 0 ? revenue / volumeBilled : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} />
          Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Chiffre d'Affaires</span>
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
          <h2><Banknote size={20} style={{ display: 'inline', marginRight: '6px', color: '#9333ea' }} />Chiffre d'Affaires — Facturation Nationale</h2>
          <p>Analyse du chiffre d'affaires facturé SEG par agence — exercice {year}, segment sélectionné</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="subpage-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(147,51,234,0.15)', color: '#c084fc', border: '1px solid rgba(147,51,234,0.3)' }}>
              <Banknote size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Chiffre d'affaires facturé</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '17px' }}>{gnfCompact(revenue)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Facturation</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
              <AlertTriangle size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Facturé + pénalités</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '17px' }}>{gnfCompact(billedWithPenalty)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend warning">Montant exigible</span>
            <span className="kpi-period">Recouvrement</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
              <TrendingUp size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Prix moyen du m³</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '18px' }}>{num(avgPrice)}</span>
                <span className="kpi-total-val">GNF/m³</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">CA / volume facturé</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
              <Receipt size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Volume facturé associé</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '18px' }}>{num(volumeBilled)}</span>
                <span className="kpi-total-val">m³</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Cumul période</span>
            <span className="kpi-period">{clientType || 'National'}</span>
          </div>
        </div>
      </div>

      {/* Répartition par agence */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Répartition du Chiffre d'Affaires par Agence</h3>
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
            const ca = Number(a.revenue) || 0;
            const part = revenue > 0 ? ca / revenue : 0;
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
                <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '4px' }}>
                  {gnfCompact(ca)}
                </div>
                <div style={{ height: 4, background: '#1e3a5f', borderRadius: 999, overflow: 'hidden', marginBottom: '6px' }}>
                  <div style={{ width: `${Math.min(part * 100, 100)}%`, height: '100%', background: color, borderRadius: 999 }} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{(part * 100).toFixed(1)}% du chiffre d'affaires</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alerte */}
      <div className="dark-alert-box info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
          <AlertTriangle size={16} />
          <span>Point d'Analyse DG — Performance de la Facturation</span>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          Le chiffre d'affaires facturé de l'exercice {year} s'établit à {gnfCompact(revenue)}{clientType ? ` pour la catégorie « ${clientType} »` : ' toutes catégories confondues'}, correspondant à un volume facturé de {num(volumeBilled)} m³. Le montant exigible (facturé + pénalités) atteint {gnfCompact(billedWithPenalty)}.
        </p>
      </div>
    </div>
  );
}
