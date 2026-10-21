'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  FileSpreadsheet,
  Percent,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';

type AgencyRow = {
  id: number;
  code: string;
  name: string;
  emissions: number;
  impayes: number;
  rate: number;
  rows: number;
  agents: number;
  periods: number[];
};

type ApiData = {
  year: number;
  period: number | null;
  periods: number[];
  agencies: AgencyRow[];
  totals: {
    emissions: number;
    impayes: number;
    rate: number;
    agencies: number;
    rows: number;
  };
};

const PERIOD_LABELS: Record<number, string> = {
  1: 'Jan',
  3: 'Mar',
  5: 'Mai',
  7: 'Juil',
  9: 'Sep',
  11: 'Nov',
};

const PERIODS = [1, 3, 5, 7, 9, 11];

function num(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(Math.round(Number(value) || 0));
}

function gnf(value: number) {
  return `${num(value)} GNF`;
}

function gnfCompact(value: number) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);

  if (abs >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toLocaleString('fr-FR', {
      maximumFractionDigits: 2,
    })} Md GNF`;
  }

  if (abs >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString('fr-FR', {
      maximumFractionDigits: 1,
    })} M GNF`;
  }

  return gnf(n);
}

function pct(value: number) {
  return `${((Number(value) || 0) * 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })} %`;
}

function periodLabel(period: number) {
  return PERIOD_LABELS[period] || `P${period}`;
}

/*
 * Les niveaux ci-dessous sont uniquement des indicateurs visuels.
 * Ils ne représentent pas des objectifs officiels SEG.
 */
function visualStatus(rate: number) {
  if (rate >= 0.15) {
    return {
      className: 'red',
      label: 'Élevé',
      dot: '🔴',
    };
  }

  if (rate >= 0.1) {
    return {
      className: 'amber',
      label: 'À surveiller',
      dot: '🟠',
    };
  }

  return {
    className: 'green',
    label: 'Maîtrisé',
    dot: '🟢',
  };
}

function KpiSpark({ type }: { type: 'cyan' | 'red' | 'purple' | 'green' }) {
  const color =
    type === 'red'
      ? '#ef4444'
      : type === 'purple'
        ? '#9333ea'
        : type === 'green'
          ? '#10b981'
          : '#38bdf8';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: -6,
        left: 0,
        right: 0,
        height: 26,
        opacity: 0.42,
        pointerEvents: 'none',
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 500 35" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`imp-${type}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.75" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,30 C55,21 75,25 115,17 C155,9 180,19 220,13 C260,7 286,17 325,10 C370,2 405,13 450,7 C470,5 485,4 500,1 L500,35 L0,35 Z"
          fill={`url(#imp-${type})`}
        />
        <path
          d="M0,30 C55,21 75,25 115,17 C155,9 180,19 220,13 C260,7 286,17 325,10 C370,2 405,13 450,7 C470,5 485,4 500,1"
          fill="none"
          stroke={color}
          strokeWidth="1.7"
        />
      </svg>
    </div>
  );
}

export default function ImpayesAgencesPage() {
  const [year, setYear] = useState(2026);
  const [agencyId, setAgencyId] = useState('all');
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        year: String(year),
        agencyId,
        period,
      });

      const response = await fetch(
        `/api/kpi/impayes-agences?${params.toString()}`,
        { cache: 'no-store' },
      );

      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || 'Impossible de charger les impayés.');
      }

      setData(json.data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [agencyId, period, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const agencies = data?.agencies || [];

  const maxImpayes = useMemo(
    () => Math.max(...agencies.map((item) => Number(item.impayes) || 0), 1),
    [agencies],
  );

  const topThree = useMemo(() => agencies.slice(0, 3), [agencies]);

  const periodsAvailable = useMemo(() => {
    const set = new Set<number>();

    agencies.forEach((item) => {
      (item.periods || []).forEach((p) => set.add(Number(p)));
    });

    return Array.from(set).sort((a, b) => a - b);
  }, [agencies]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Breadcrumb */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: 'var(--text-dim)',
        }}
      >
        <Link
          href="/"
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <ArrowLeft size={14} />
          Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Finance &amp; Recouvrement</span>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>
          État des impayés par agence
        </span>
      </div>

      {/* Header + filtres — même langage visuel que Vue Nationale */}
      <div className="subpage-header">
        <div className="subpage-title">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              color: '#38bdf8',
              fontSize: '9px',
              fontWeight: 800,
              letterSpacing: '.11em',
              marginBottom: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#38bdf8',
                boxShadow: '0 0 9px rgba(56,189,248,.7)',
              }}
            />
            PILOTAGE FINANCIER • DONNÉES OFFICIELLES SEG
          </div>

          <h2 style={{ fontSize: '24px' }}>État des impayés par agence</h2>

          <p>
            Analyse territoriale des créances à recouvrer — exercice {year}.
          </p>
        </div>

        <div
          className="dashboard-filter-bar"
          style={{
            margin: 0,
            alignItems: 'center',
            alignSelf: 'flex-end',
          }}
        >
          <div style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <span className="filter-label" style={{ marginBottom: 0 }}>
              Période
            </span>
            <select
              className="select-dark"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              <option value={2026}>Exercice 2026</option>
            </select>
          </div>

          <div style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <span className="filter-label" style={{ marginBottom: 0 }}>
              Agence
            </span>
            <select
              className="select-dark"
              value={agencyId}
              onChange={(e) => setAgencyId(e.target.value)}
            >
              <option value="all">Toutes</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.code} — {agency.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <span className="filter-label" style={{ marginBottom: 0 }}>
              Période source
            </span>
            <select
              className="select-dark"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="all">Toutes</option>
              {(periodsAvailable.length ? periodsAvailable : PERIODS).map((p) => (
                <option key={p} value={p}>
                  {periodLabel(p)} 2026
                </option>
              ))}
            </select>
          </div>

          <div className={`db-status ${loading ? 'loading' : error ? 'error' : 'ok'}`}>
            <span />
            {loading
              ? 'Actualisation…'
              : error
                ? 'Supabase indisponible'
                : 'Données synchronisées'}
          </div>

          <button
            className="btn-brand"
            style={{
              fontSize: '11.5px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="badge-pill cyan">Source : seg_impayes_zone</span>
        <span className="badge-pill purple">Exercice : {year}</span>
        <span className="badge-pill purple">
          {agencyId === 'all' ? 'Toutes les agences' : 'Agence filtrée'}
        </span>
        {period !== 'all' && (
          <span className="badge-pill amber">
            Période : {periodLabel(Number(period))}
          </span>
        )}
      </div>

      {error && (
        <div className="db-error-banner">
          {error}. Vérifie la connexion à Supabase puis recharge la page.
        </div>
      )}

      {/* 1. KPIs — même structure que Vue Nationale */}
      <div className="kpi-grid-6">
        <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="kpi-header">
            <div
              className="kpi-icon-wrap"
              style={{
                background: '#38bdf820',
                color: '#38bdf8',
                border: '1px solid #38bdf840',
              }}
            >
              <FileSpreadsheet size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Émissions</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '16px' }}>
                  {gnfCompact(data?.totals.emissions || 0)}
                </span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">● Données officielles</span>
            <span style={{ fontSize: '11px', marginLeft: 'auto' }}>📄</span>
          </div>
          <KpiSpark type="cyan" />
        </div>

        <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="kpi-header">
            <div
              className="kpi-icon-wrap"
              style={{
                background: '#ef444420',
                color: '#ef4444',
                border: '1px solid #ef444440',
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Total des impayés</div>
              <div className="kpi-num-row">
                <span
                  className="kpi-main-val"
                  style={{ fontSize: '16px', color: '#f87171' }}
                >
                  {gnfCompact(data?.totals.impayes || 0)}
                </span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend danger">▲ À recouvrer</span>
            <span style={{ fontSize: '11px', marginLeft: 'auto' }}>🔴</span>
          </div>
          <KpiSpark type="red" />
        </div>

        <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="kpi-header">
            <div
              className="kpi-icon-wrap"
              style={{
                background: '#9333ea20',
                color: '#a855f7',
                border: '1px solid #9333ea40',
              }}
            >
              <Percent size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Taux global d&apos;impayés</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '16px' }}>
                  {pct(data?.totals.rate || 0)}
                </span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend" style={{ color: '#a78bfa' }}>
              Impayés / émissions
            </span>
            <span style={{ fontSize: '11px', marginLeft: 'auto' }}>◉</span>
          </div>
          <KpiSpark type="purple" />
        </div>

        <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="kpi-header">
            <div
              className="kpi-icon-wrap"
              style={{
                background: '#10b98120',
                color: '#10b981',
                border: '1px solid #10b98140',
              }}
            >
              <Building2 size={20} />
            </div>
            <div className="kpi-title-value">
              <div className="kpi-title">Agences suivies</div>
              <div className="kpi-num-row">
                <span className="kpi-main-val" style={{ fontSize: '16px' }}>
                  {data?.totals.agencies || 0}
                </span>
              </div>
            </div>
          </div>
          <div className="kpi-foot-row">
            <span className="kpi-trend positive">Référentiel SEG actif</span>
            <span style={{ fontSize: '11px', marginLeft: 'auto' }}>🏢</span>
          </div>
          <KpiSpark type="green" />
        </div>
      </div>

      {/* 2. Classement + Top 3 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '16px',
        }}
      >
        <div className="dashboard-card">
          <div className="card-header-flex">
            <div>
              <h3>Concentration des impayés par agence</h3>
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--text-dim)',
                  marginTop: 3,
                }}
              >
                Classement selon le montant des impayés à recouvrer.
              </div>
            </div>
            <span className="badge-pill cyan">
              {agencies.length} agence(s)
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
              marginTop: 5,
            }}
          >
            {agencies.map((agency, index) => {
              const width = Math.max(
                4,
                ((Number(agency.impayes) || 0) / maxImpayes) * 100,
              );

              return (
                <div
                  key={agency.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '26px minmax(150px, 1fr) 125px',
                    gap: 10,
                    alignItems: 'center',
                    padding: '7px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.045)',
                  }}
                >
                  <span
                    style={{
                      color: index < 3 ? '#38bdf8' : '#475569',
                      fontWeight: 800,
                      fontSize: 10,
                    }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        marginBottom: 5,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            padding: '3px 6px',
                            borderRadius: 5,
                            background: 'rgba(56,189,248,.08)',
                            border: '1px solid rgba(56,189,248,.13)',
                            color: '#7dd3fc',
                            fontSize: 8,
                            fontWeight: 800,
                          }}
                        >
                          {agency.code}
                        </span>
                        <strong
                          style={{
                            color: 'var(--text-strong)',
                            fontSize: 10.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {agency.name}
                        </strong>
                      </div>

                      <span
                        style={{
                          color: '#f87171',
                          fontSize: 10,
                          fontWeight: 800,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {gnfCompact(agency.impayes)}
                      </span>
                    </div>

                    <div
                      style={{
                        height: 5,
                        background: '#11263f',
                        borderRadius: 999,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${width}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg,#0ea5e9,#38bdf8)',
                          borderRadius: 999,
                          transition: 'width .5s ease',
                        }}
                      />
                    </div>
                  </div>

                  <span
                    className={`badge-pill ${
                      visualStatus(agency.rate).className
                    }`}
                    style={{
                      justifyContent: 'center',
                      fontSize: 10,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pct(agency.rate)}
                  </span>
                </div>
              );
            })}

            {!loading && agencies.length === 0 && (
              <div
                style={{
                  padding: 30,
                  textAlign: 'center',
                  color: 'var(--text-dim)',
                  fontSize: 12,
                }}
              >
                Aucune donnée disponible pour ces filtres.
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3>
              <Trophy
                size={15}
                style={{ display: 'inline', marginRight: 5, color: '#38bdf8' }}
              />
              Top 3 — Impayés
            </h3>
            <span className="badge-pill red">Focus DG</span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
              marginTop: 4,
            }}
          >
            {topThree.map((agency, index) => (
              <div
                key={agency.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '10px 0',
                  borderBottom: '1px solid rgba(255,255,255,.055)',
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    flex: '0 0 30px',
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 8,
                    color: index === 0 ? '#fca5a5' : index === 1 ? '#fdba74' : '#fde68a',
                    background:
                      index === 0
                        ? 'rgba(239,68,68,.1)'
                        : index === 1
                          ? 'rgba(249,115,22,.08)'
                          : 'rgba(234,179,8,.07)',
                    border: '1px solid rgba(255,255,255,.07)',
                    fontWeight: 900,
                    fontSize: 10,
                  }}
                >
                  {String(index + 1).padStart(2, '0')}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    <span style={{ color: '#38bdf8', fontSize: 8, fontWeight: 800 }}>
                      {agency.code}
                    </span>
                    <strong
                      style={{
                        color: 'var(--text-strong)',
                        fontSize: 11,
                      }}
                    >
                      {agency.name}
                    </strong>
                  </div>

                  <div
                    style={{
                      color: '#f87171',
                      fontSize: 16,
                      fontWeight: 800,
                      marginTop: 4,
                    }}
                  >
                    {gnfCompact(agency.impayes)}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      color: 'var(--text-dim)',
                      fontSize: 9,
                      marginTop: 3,
                    }}
                  >
                    <span>{pct(agency.rate)} des émissions</span>
                    <span>{agency.agents} agents</span>
                  </div>
                </div>
              </div>
            ))}

            {!loading && topThree.length === 0 && (
              <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 20 }}>
                Aucun classement disponible.
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 7,
              marginTop: 10,
              padding: '9px 10px',
              borderRadius: 8,
              background: 'rgba(239,68,68,.05)',
              border: '1px solid rgba(239,68,68,.1)',
              color: 'var(--text-muted)',
              fontSize: 9.5,
              lineHeight: 1.45,
            }}
          >
            <AlertTriangle size={14} color="#f87171" style={{ flex: '0 0 auto' }} />
            Le classement est calculé uniquement à partir des montants présents dans
            la source officielle des impayés.
          </div>
        </div>
      </div>

      {/* 3. Détail par agence */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <div>
            <h3>État détaillé par agence</h3>
            <div
              style={{
                fontSize: '10px',
                color: 'var(--text-dim)',
                marginTop: 3,
              }}
            >
              Situation consolidée des émissions, impayés et périodes réellement disponibles.
            </div>
          </div>

          <span className="badge-pill cyan">
            {data?.totals.rows || 0} lignes sources
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Agence</th>
                <th>Émissions</th>
                <th>Impayés</th>
                <th>Taux</th>
                <th>Agents</th>
                <th>Périodes</th>
                <th>Indicateur visuel</th>
              </tr>
            </thead>

            <tbody>
              {agencies.map((agency, index) => {
                const status = visualStatus(agency.rate);

                return (
                  <tr key={agency.id}>
                    <td>
                      <span
                        style={{
                          color: index < 3 ? '#38bdf8' : 'var(--text-dim)',
                          fontWeight: 800,
                        }}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 29,
                            height: 29,
                            display: 'grid',
                            placeItems: 'center',
                            borderRadius: 7,
                            background: 'rgba(56,189,248,.08)',
                            border: '1px solid rgba(56,189,248,.13)',
                            color: '#38bdf8',
                          }}
                        >
                          <Building2 size={14} />
                        </span>

                        <div>
                          <strong style={{ color: 'var(--text-strong)' }}>
                            {agency.name}
                          </strong>
                          <div
                            style={{
                              fontSize: 9,
                              color: 'var(--text-dim)',
                              marginTop: 2,
                            }}
                          >
                            {agency.code}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ fontWeight: 700 }}>
                      {gnf(agency.emissions)}
                    </td>

                    <td style={{ color: '#f87171', fontWeight: 800 }}>
                      {gnf(agency.impayes)}
                    </td>

                    <td>
                      <span
                        className={`badge-pill ${status.className}`}
                        style={{ fontSize: 10 }}
                      >
                        {pct(agency.rate)}
                      </span>
                    </td>

                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <Users size={13} color="#64748b" />
                        {agency.agents}
                      </span>
                    </td>

                    <td>
                      <div
                        style={{
                          display: 'flex',
                          gap: 4,
                          flexWrap: 'wrap',
                          minWidth: 150,
                        }}
                      >
                        {(agency.periods || []).length ? (
                          agency.periods.map((p) => (
                            <span
                              key={p}
                              style={{
                                padding: '3px 6px',
                                borderRadius: 5,
                                background: 'rgba(71,108,143,.09)',
                                color: 'var(--text-muted)',
                                fontSize: 8.5,
                              }}
                            >
                              {periodLabel(p)}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: 'var(--text-dim)' }}>Aucune</span>
                        )}
                      </div>
                    </td>

                    <td>
                      <span
                        className={`badge-pill ${status.className}`}
                        style={{ fontSize: 10 }}
                      >
                        {status.dot} {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {!loading && agencies.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div
                      style={{
                        padding: 28,
                        textAlign: 'center',
                        color: 'var(--text-dim)',
                      }}
                    >
                      Aucune donnée disponible.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Lecture DG + couverture des périodes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.35fr .65fr',
          gap: '16px',
        }}
      >
        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3>
              <AlertTriangle
                size={15}
                style={{ display: 'inline', marginRight: 5, color: '#f59e0b' }}
              />
              Lecture DG
            </h3>
            <span className="badge-pill cyan">Vue consolidée</span>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 8,
              padding: 12,
              background: 'var(--bg-inner)',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                flex: '0 0 38px',
                display: 'grid',
                placeItems: 'center',
                borderRadius: 9,
                background: 'rgba(56,189,248,.08)',
                border: '1px solid rgba(56,189,248,.13)',
                color: '#38bdf8',
              }}
            >
              <ShieldCheck size={18} />
            </div>

            <div>
              <div
                style={{
                  color: 'var(--text-strong)',
                  fontSize: 12,
                  fontWeight: 800,
                  marginBottom: 4,
                }}
              >
                Prioriser le recouvrement à partir des montants consolidés
              </div>

              <p
                style={{
                  margin: 0,
                  color: 'var(--text-muted)',
                  fontSize: 10.5,
                  lineHeight: 1.55,
                }}
              >
                Cette vue permet de comparer la situation des impayés entre les
                agences SEG et d’identifier rapidement les principaux volumes à
                recouvrer. Les montants affichés proviennent de la source officielle
                des impayés par zone.
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 7,
              flexWrap: 'wrap',
              marginTop: 10,
            }}
          >
            <span className="badge-pill green">🟢 Indicateur faible</span>
            <span className="badge-pill amber">🟠 Indicateur intermédiaire</span>
            <span className="badge-pill red">🔴 Indicateur élevé</span>
            <span
              style={{
                color: 'var(--text-dim)',
                fontSize: 9,
                alignSelf: 'center',
              }}
            >
              Seuils uniquement visuels — non contractuels.
            </span>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3>Couverture des périodes</h3>
            <span className="badge-pill purple">{year}</span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
              marginTop: 8,
            }}
          >
            {PERIODS.map((p) => {
              const present = periodsAvailable.includes(p);

              return (
                <div
                  key={p}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '7px 9px',
                    background: 'var(--bg-inner)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 7,
                  }}
                >
                  <span
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: 10.5,
                      fontWeight: 700,
                    }}
                  >
                    {periodLabel(p)} {year}
                  </span>

                  <span
                    className={`badge-pill ${present ? 'green' : ''}`}
                    style={{
                      fontSize: 9,
                      color: present ? undefined : 'var(--text-dim)',
                    }}
                  >
                    {present ? '● Disponible' : '○ Non renseignée'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 7,
          color: 'var(--text-dim)',
          fontSize: 9,
          paddingBottom: 4,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 9px rgba(16,185,129,.6)',
          }}
        />
        Source : <code style={{ color: 'var(--text-muted)' }}>seg_impayes_zone</code>
        <span>•</span>
        Exercice {year}
        <span>•</span>
        {data?.totals.rows || 0} lignes sources
      </div>

      <style jsx>{`
        .spin {
          animation: spin .9s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1200px) {
          .subpage-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .dashboard-filter-bar {
            align-self: stretch !important;
            flex-wrap: wrap;
          }

          .kpi-grid-6 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 900px) {
          .dashboard-card + .dashboard-card {
            margin-top: 0;
          }

          .kpi-grid-6 {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-filter-bar {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .dashboard-filter-bar > div {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
