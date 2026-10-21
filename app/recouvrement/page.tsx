'use client';

import { useState, useEffect } from 'react';
import { Wallet, CheckCircle, AlertTriangle, TrendingUp, ShieldAlert, ArrowLeft, Building2 } from 'lucide-react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { gnf, pct } from '@/lib/format';
import { DetailFilterBar } from '@/components/DetailFilterBar';
import { useOverview } from '@/lib/use-overview';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

function gnfCompact(value: number) {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md GNF`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M GNF`;
  return gnf(value);
}

export default function RecouvrementPage() {
  const [year, setYear] = useState(2026);
  const [clientType, setClientType] = useState('');
  const [agency, setAgency] = useState('');
  const { data, loading, error } = useOverview(year, clientType, agency);

  // Appliquer le pré-filtre « agence » et « exercice » depuis l'URL (lien de notification)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const a = params.get('agency');
    const y = params.get('year');
    if (a) setAgency(a);
    if (y && !isNaN(Number(y))) setYear(Number(y));
  }, []);

  const kpis = data?.kpis || {};
  const monthly = (data?.monthly || []).map((m: any, i: number) => ({ mois: MONTHS[i % 12], facturation: Number(m.billing_volume) || 0 }));

  const billedWithPenalty = Number(kpis.billedWithPenalty) || 0;
  const paid = Number(kpis.paid) || 0;
  const balance = Number(kpis.balance) || 0;
  const recovery = Number(kpis.recovery) || 0;
  const recoveryUpdated = Number(kpis.recoveryUpdated);
  const impayePct = billedWithPenalty > 0 ? 1 - recovery : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} />
          Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Direction du Recouvrement & Trésorerie</span>
      </div>

      {/* Filters */}
      <DetailFilterBar
        year={year}
        onYear={setYear}
        clientType={clientType}
        onClientType={setClientType}
        loading={loading}
        error={error}
        label={`Filtres : Exercice ${year}${clientType ? ` · ${clientType}` : ' · Tous segments'}${agency ? ` · Agence : ${agency}` : ''}`}
      />
      {agency && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge-pill cyan"><Building2 size={11} style={{ display: 'inline', marginRight: 4 }} />Agence : {agency}</span>
          <button className="notif-link-btn" onClick={() => setAgency('')}>✕ Retirer le filtre agence</button>
        </div>
      )}
      {error && <div className="db-error-banner">{error}. Démarre MySQL dans XAMPP puis recharge la page.</div>}

      {/* Subpage Header */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2>Direction du Recouvrement & Trésorerie</h2>
          <p>Pilotage des encaissements, créances clients, impayés et taux de recouvrement — exercice {year}</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="subpage-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              <Wallet size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Facturé + pénalités</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '17px' }}>{gnfCompact(billedWithPenalty)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Montant exigible</span>
            <span className="kpi-period">{year}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <CheckCircle size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Total encaissé</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '17px', color: '#10b981' }}>{gnfCompact(paid)}</span>
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
            <div className="kpi-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <AlertTriangle size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Reste impayé</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '17px', color: '#ef4444' }}>{gnfCompact(balance)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend danger">{pct(impayePct)} du exigible</span>
            <span className="kpi-period">Relances en cours</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(5, 150, 105, 0.15)', color: '#10b981', border: '1px solid rgba(5, 150, 105, 0.3)' }}>
              <TrendingUp size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Taux de recouvrement brut</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ color: '#38bdf8' }}>{pct(recovery)}</span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">{recoveryUpdated ? `Actualisé : ${pct(recoveryUpdated)}` : 'Recouvrement brut'}</span>
            <span className="kpi-period">Cible : 85%</span>
          </div>
        </div>
      </div>

      {/* Recovery vs target progress */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Taux de Recouvrement vs Cible DG (85%)</h3>
          <span className="badge-pill green">{pct(recovery)}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)' }}>Recouvrement actuel</span>
            <span><strong style={{ color: 'var(--text-strong)' }}>{pct(recovery)}</strong> <span style={{ color: 'var(--text-dim)' }}>/ 85%</span></span>
          </div>
          <div style={{ height: 16, background: '#11263f', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, opacity: 0.5, background: `repeating-linear-gradient(90deg, transparent 0 4px, #0c1b2e 4px 6px)` }} />
            <div style={{ width: `${Math.min((recovery / 0.85) * 100, 100)}%`, height: '100%', background: recovery >= 0.85 ? '#10b981' : '#f59e0b', borderRadius: 999 }} />
            <div style={{ position: 'absolute', left: '100%', top: -4, transform: 'translateX(-1px)', width: 2, height: 24, background: '#e11d48' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: '10.5px', color: 'var(--text-dim)' }}>{year}{clientType ? ` · ${clientType}` : ' · Tous segments'}</span>
            <span style={{ fontSize: '10.5px', color: '#e11d48' }}>Cible 85%</span>
          </div>
        </div>
      </div>

      {/* Volume facturé mensuel (réel) */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Volume Facturé Mensuel — {year}</h3>
          <span className="badge-pill cyan">{clientType || 'Tous segments'}</span>
        </div>
        {monthly.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', padding: '20px', textAlign: 'center' }}>
            {loading ? 'Chargement des données…' : 'Aucune donnée mensuelle pour cette sélection'}
          </div>
        ) : (
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="mois" stroke="#556c84" fontSize={11} />
                <YAxis stroke="#556c84" fontSize={11} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }} />
                <Bar dataKey="facturation" name="Volume facturé (m³)" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Warning Box */}
      <div className="dark-alert-box warning">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#f59e0b', marginBottom: '4px' }}>
          <ShieldAlert size={16} />
          <span>Point d'attention DG — Analyse des impayés</span>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          Le montant exigible de l'exercice {year} s'élève à {gnfCompact(billedWithPenalty)}{clientType ? ` pour le segment « ${clientType} »` : ' toutes catégories confondues'}, dont {gnfCompact(paid)} encaissés (taux de recouvrement {pct(recovery)}). Le reste à recouvrer atteint {gnfCompact(balance)}, soit {pct(impayePct)} du exigible. Une commission interministérielle de compensation est programmée pour apurer les mandats administratifs.
        </p>
      </div>
    </div>
  );
}
