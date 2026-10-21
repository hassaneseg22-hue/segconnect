'use client';

import { useState } from 'react';
import { Users, TrendingUp, Building2, UserCheck, ArrowLeft, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { num, pct } from '@/lib/format';
import { DetailFilterBar } from '@/components/DetailFilterBar';
import { useOverview } from '@/lib/use-overview';

const palette = ['#3b82f6','#10b981','#0284c7','#eab308','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#64748b'];

export default function AbonnesPage() {
  const [year, setYear] = useState(2026);
  const [clientType, setClientType] = useState('');
  const { data, loading, error } = useOverview(year, clientType);

  const kpis = data?.kpis || {};
  const agencies = data?.agencies || [];
  const subscribers = Number(kpis.subscribers) || 0;
  const total = agencies.reduce((s: number, a: any) => s + (Number(a.subscribers) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} />
          Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Abonnés Facturés</span>
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
          <h2><Users size={20} style={{ display: 'inline', marginRight: '6px', color: '#0284c7' }} />Abonnés Facturés — Portefeuille National</h2>
          <p>Analyse du portefeuille clientèle SEG par agence, exercice {year} et segment sélectionné</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="subpage-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(2,132,199,0.15)', color: '#0284c7', border: '1px solid rgba(2,132,199,0.3)' }}>
              <Users size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Abonnés facturés</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{num(subscribers)}</span>
                <span className="kpi-total-val">clients</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Données réelles</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
              <Building2 size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Agences / Centres</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{num(agencies.length)}</span>
                <span className="kpi-total-val">entités</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Actives</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(147,51,234,0.15)', color: '#c084fc', border: '1px solid rgba(147,51,234,0.3)' }}>
              <UserCheck size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Abonnés médiane / agence</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val">{num(agencies.length ? Math.round(subscribers / agencies.length) : 0)}</span>
                <span className="kpi-total-val">clients</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Moyenne par agence</span>
            <span className="kpi-period">{clientType || 'National'}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
              <TrendingUp size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Segment sélectionné</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '17px' }}>{clientType || 'Tous'}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Filtre clientèle</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>
      </div>

      {/* Répartition par agence */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Répartition des Abonnés par Agence</h3>
          <span className="badge-pill cyan">{agencies.length} Agences</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Agence</th>
                <th>Abonnés</th>
                <th>Part</th>
                <th>Taux Recouvrement</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {agencies.length === 0 && (
                <tr><td colSpan={5} style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
                  {loading ? 'Chargement des données…' : 'Aucune donnée pour cette sélection'}
                </td></tr>
              )}
              {agencies.map((a: any, i: number) => {
                const color = palette[i % palette.length];
                const part = total > 0 ? (Number(a.subscribers) || 0) / total : 0;
                const rec = Number(a.recovery) || 0;
                return (
                  <tr key={i}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                        <strong style={{ color: 'var(--text-strong)' }}>{a.name}</strong>
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, color: '#38bdf8' }}>{num(Number(a.subscribers) || 0)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: 5, background: '#11263f', borderRadius: 999, overflow: 'hidden', minWidth: 80 }}>
                          <div style={{ width: `${Math.min(part * 100, 100)}%`, height: '100%', background: color, borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '38px' }}>{(part * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: rec >= 0.85 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                        {pct(rec)}
                      </span>
                    </td>
                    <td><span className="badge-pill green">Actif</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alerte */}
      <div className="dark-alert-box info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
          <AlertCircle size={16} />
          <span>Point d'Analyse DG — Portefeuille Abonnés</span>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          Le portefeuille compte {num(subscribers)} abonnés facturés sur l'exercice {year}{clientType ? ` pour la catégorie « ${clientType} »` : ' toutes catégories confondues'}, répartis sur {num(agencies.length)} agences. Les données sont synchronisées depuis MySQL et reflètent les filtres d'exercice et de segment clientèle sélectionnés.
        </p>
      </div>
    </div>
  );
}
