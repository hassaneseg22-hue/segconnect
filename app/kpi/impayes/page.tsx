'use client';

import { useEffect, useState } from 'react';

import {
  AlertTriangle,
  ArrowLeft,
  Wallet,
  TrendingUp,
  FileWarning,
} from 'lucide-react';

import Link from 'next/link';

import { gnf, num, pct } from '@/lib/format';

import { DetailFilterBar } from '@/components/DetailFilterBar';

import { useOverview } from '@/lib/use-overview';

const palette = [
  '#ef4444',
  '#f59e0b',
  '#eab308',
  '#8b5cf6',
  '#3b82f6',
  '#10b981',
  '#06b6d4',
  '#0284c7',
  '#64748b',
];

type OfficialAgency = {
  id: number;
  code: string | null;
  name: string;
  emissions: number;
  impayes: number;
  impayesRate: number;
  nationalShare: number;
  rows: number;
};

type OfficialImpayesResponse = {
  ok: boolean;
  data?: {
    year: number;
    totals: {
      emissions: number;
      impayes: number;
      impayesRate: number;
      rows: number;
    };
    agencies: OfficialAgency[];
  };
  error?: string;
};

export default function ImpayesPage() {
  const [year, setYear] = useState(2026);

  const [clientType, setClientType] = useState('');

  const {
    data,
    loading,
    error,
  } = useOverview(year, clientType);

  /*
   * ============================================================
   * IMPAYÉS OFFICIELS SEG
   * ============================================================
   *
   * La page conserve useOverview() pour ses KPI historiques
   * et ses filtres.
   *
   * La répartition des impayés par agence est désormais
   * alimentée directement par :
   *
   * public.seg_impayes_zone
   *
   * Cela permet d'inclure Coyah et Dubreka.
   */

  const [
    officialAgencies,
    setOfficialAgencies,
  ] = useState<OfficialAgency[]>([]);

  const [
    officialTotals,
    setOfficialTotals,
  ] = useState<{
    emissions: number;
    impayes: number;
    impayesRate: number;
    rows: number;
  } | null>(null);

  const [
    officialLoading,
    setOfficialLoading,
  ] = useState(true);

  const [
    officialError,
    setOfficialError,
  ] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadOfficialImpayes() {
      try {
        setOfficialLoading(true);
        setOfficialError('');

        const response = await fetch(
          `/api/kpi/impayes/agencies?year=${year}`,
          {
            credentials: 'include',
            cache: 'no-store',
          }
        );

        const json: OfficialImpayesResponse =
          await response.json();

        if (
          !response.ok ||
          !json.ok ||
          !json.data
        ) {
          throw new Error(
            json.error ||
              'Impossible de charger les impayés officiels.'
          );
        }

        if (!cancelled) {
          setOfficialAgencies(
            Array.isArray(json.data.agencies)
              ? json.data.agencies
              : []
          );

          setOfficialTotals(
            json.data.totals || null
          );
        }
      } catch (err) {
        if (!cancelled) {
          console.error(
            '[kpi/impayes] erreur impayés officiels:',
            err
          );

          setOfficialError(
            err instanceof Error
              ? err.message
              : 'Erreur lors du chargement des impayés officiels.'
          );
        }
      } finally {
        if (!cancelled) {
          setOfficialLoading(false);
        }
      }
    }

    loadOfficialImpayes();

    return () => {
      cancelled = true;
    };
  }, [year]);

  const kpis = data?.kpis || {};

  /*
   * ============================================================
   * KPI HISTORIQUES
   * ============================================================
   */

  const historicalBalance =
    Number(kpis.balance) || 0;

  const billedWithPenalty =
    Number(kpis.billedWithPenalty) || 0;

  const paid =
    Number(kpis.paid) || 0;

  const recovery =
    Number(kpis.recovery) || 0;

  const recoveryUpdated =
    kpis.recoveryUpdated;

  /*
   * ============================================================
   * TOTAL IMPAYÉS
   * ============================================================
   *
   * Priorité aux données officielles seg_impayes_zone.
   * Fallback sur l'ancien overview si l'API officielle
   * n'est momentanément pas disponible.
   */

  /*
 * Source officielle uniquement lorsqu'elle contient réellement
 * des lignes pour l'exercice sélectionné.
 *
 * Exemple :
 * 2025 = 0 ligne dans seg_impayes_zone
 *       => conservation du montant historique de useOverview()
 *
 * 2026 = lignes présentes
 *       => utilisation des données officielles.
 */
const officialHasData =
    officialTotals !== null &&
    Number(officialTotals.rows) > 0;

const balance =
    officialHasData
      ? Number(officialTotals?.impayes) || 0
      : historicalBalance;

  /*
   * ============================================================
   * AGENCES
   * ============================================================
   *
   * On conserve les anciennes données disponibles pour les
   * autres colonnes, mais le montant d'impayés vient de
   * seg_impayes_zone.
   */

  const overviewAgencies =
    data?.agencies || [];

  const overviewByName =
    new Map(
      overviewAgencies.map((agency: any) => [
        String(agency.name)
          .trim()
          .toLowerCase(),
        agency,
      ])
    );

  const agencies =
    officialHasData && officialAgencies.length > 0
      ? officialAgencies.map(
          (official) => {
            const old: any =
              overviewByName.get(
                official.name
                  .trim()
                  .toLowerCase()
              ) || {};

            return {
              ...old,

              id: official.id,

              code: official.code,

              name: official.name,

              /*
               * Montant officiel des impayés.
               */
              balance:
                Number(official.impayes) || 0,

              impayes:
                Number(official.impayes) || 0,

              emissions:
                Number(official.emissions) || 0,

              impayesEmissions:
                Number(official.emissions) || 0,

              impayesRate:
                Number(official.impayesRate) || 0,

              nationalShare:
                Number(official.nationalShare) || 0,

              impayesRows:
                Number(official.rows) || 0,

              /*
               * Pour les anciennes agences, on conserve
               * le taux de recouvrement historique lorsqu'il
               * existe.
               */
              recovery:
                old.recovery != null
                  ? Number(old.recovery) || 0
                  : 0,
            };
          }
        )
      : overviewAgencies;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
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

        <span
          style={{
            color: 'var(--text-muted)',
          }}
        >
          Impayés
        </span>
      </div>

      {/* Filters */}

      <DetailFilterBar
        year={year}
        onYear={setYear}
        clientType={clientType}
        onClientType={setClientType}
        loading={
          loading ||
          officialLoading
        }
        error={
          error ||
          officialError ||
          ''
        }
        label={`Filtres : Exercice ${year}${
          clientType
            ? ` · ${clientType}`
            : ' · Tous segments'
        }`}
      />

      {error && (
        <div className="db-error-banner">
          {error}
        </div>
      )}

      {officialError && (
        <div className="db-error-banner">
          {officialError}
        </div>
      )}

      {/* Page Header */}

      <div className="subpage-header">
        <div className="subpage-title">
          <h2>
            <AlertTriangle
              size={20}
              style={{
                display: 'inline',
                marginRight: '6px',
                color: '#ea580c',
              }}
            />
            Impayés — Créances à Recouvrer
          </h2>

          <p>
            Analyse des créances clients impayées
            SEG par agence — exercice {year},
            segment sélectionné
          </p>
        </div>
      </div>

      {/* KPI Row */}

      <div className="subpage-kpi-grid">

        {/* TOTAL IMPAYÉS */}

        <div className="kpi-card">
          <div className="kpi-header">

            <div
              className="kpi-icon-wrap"
              style={{
                background:
                  'rgba(234,88,12,0.15)',
                color: '#ea580c',
                border:
                  '1px solid rgba(234,88,12,0.3)',
              }}
            >
              <AlertTriangle size={20} />
            </div>

            <div className="kpi-title-value">

              <div className="kpi-title">
                Total des impayés
              </div>

              <div className="kpi-num-row">
                <span
                  className="kpi-main-val"
                  style={{
                    fontSize: '17px',
                  }}
                >
                  {officialLoading
                    ? 'Chargement…'
                    : gnf(balance)}
                </span>
              </div>

            </div>
          </div>

          <div className="kpi-foot-row">
            <span className="kpi-trend danger">
              À recouvrer
            </span>

            <span className="kpi-period">
              {year}
            </span>
          </div>
        </div>

        {/* FACTURÉ */}

        <div className="kpi-card">
          <div className="kpi-header">

            <div
              className="kpi-icon-wrap"
              style={{
                background:
                  'rgba(239,68,68,0.15)',
                color: '#ef4444',
                border:
                  '1px solid rgba(239,68,68,0.3)',
              }}
            >
              <Wallet size={20} />
            </div>

            <div className="kpi-title-value">

              <div className="kpi-title">
                Facturé + pénalités
              </div>

              <div className="kpi-num-row">
                <span
                  className="kpi-main-val"
                  style={{
                    fontSize: '17px',
                  }}
                >
                  {gnf(billedWithPenalty)}
                </span>
              </div>

            </div>
          </div>

          <div className="kpi-foot-row">
            <span className="kpi-trend danger">
              Montant exigible
            </span>

            <span className="kpi-period">
              {year}
            </span>
          </div>
        </div>

        {/* TOTAL ENCAISSÉ */}

        <div className="kpi-card">
          <div className="kpi-header">

            <div
              className="kpi-icon-wrap"
              style={{
                background:
                  'rgba(16,185,129,0.15)',
                color: '#10b981',
                border:
                  '1px solid rgba(16,185,129,0.3)',
              }}
            >
              <TrendingUp size={20} />
            </div>

            <div className="kpi-title-value">

              <div className="kpi-title">
                Total encaissé
              </div>

              <div className="kpi-num-row">
                <span
                  className="kpi-main-val"
                  style={{
                    fontSize: '17px',
                  }}
                >
                  {gnf(paid)}
                </span>
              </div>

            </div>
          </div>

          <div className="kpi-foot-row">
            <span className="kpi-trend positive">
              Encaissé réel
            </span>

            <span className="kpi-period">
              {year}
            </span>
          </div>
        </div>

        {/* TAUX RECOUVREMENT */}

        <div className="kpi-card">
          <div className="kpi-header">

            <div
              className="kpi-icon-wrap"
              style={{
                background:
                  'rgba(147,51,234,0.15)',
                color: '#c084fc',
                border:
                  '1px solid rgba(147,51,234,0.3)',
              }}
            >
              <FileWarning size={20} />
            </div>

            <div className="kpi-title-value">

              <div className="kpi-title">
                Taux de recouvrement
              </div>

              <div className="kpi-num-row">
                <span className="kpi-main-val">
                  {pct(recovery)}
                </span>
              </div>

            </div>
          </div>

          <div className="kpi-foot-row">

            <span className="kpi-trend positive">
              {recoveryUpdated == null
                ? 'Brut'
                : `Actualisé ${pct(
                    recoveryUpdated
                  )}`}
            </span>

            <span className="kpi-period">
              {clientType || 'National'}
            </span>

          </div>
        </div>
      </div>

      {/* Répartition par agence */}

      <div className="dashboard-card">

        <div className="card-header-flex">

          <h3>
            Répartition des Impayés par Agence
          </h3>

          <span className="badge-pill red">
            {officialLoading
              ? 'Chargement…'
              : `${agencies.length} Agences — ${gnf(
                  balance
                )}`}
          </span>

        </div>

        <div
          style={{
            overflowX: 'auto',
          }}
        >

          <table className="dark-table">

            <thead>

              <tr>
                <th>Agence</th>
                <th>Montant impayé</th>
                <th>Part</th>
                <th>Taux Recouvrement</th>
                <th>Statut</th>
              </tr>

            </thead>

            <tbody>

              {agencies.length === 0 && (

                <tr>

                  <td
                    colSpan={5}
                    style={{
                      color:
                        'var(--text-dim)',
                      textAlign: 'center',
                      padding: '20px',
                    }}
                  >
                    {loading ||
                    officialLoading
                      ? 'Chargement des données…'
                      : 'Aucune donnée pour cette sélection'}
                  </td>

                </tr>
              )}

              {agencies.map(
                (a: any, i: number) => {

                  const color =
                    palette[
                      i % palette.length
                    ];

                  /*
                   * Source officielle :
                   * seg_impayes_zone
                   */

                  const bal =
                    Number(
                      a.impayes ??
                      a.balance
                    ) || 0;

                  const rec =
                    Number(
                      a.recovery
                    ) || 0;

                  const part =
                    balance > 0
                      ? bal / balance
                      : 0;

                  return (

                    <tr
                      key={
                        a.id ||
                        a.code ||
                        `${a.name}-${i}`
                      }
                    >

                      <td>

                        <div
                          style={{
                            display:
                              'flex',
                            alignItems:
                              'center',
                            gap: '8px',
                          }}
                        >

                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius:
                                '50%',
                              background:
                                color,
                              display:
                                'inline-block',
                            }}
                          />

                          <strong
                            style={{
                              color:
                                'var(--text-strong)',
                            }}
                          >
                            {a.name}
                          </strong>

                        </div>

                      </td>

                      <td
                        style={{
                          fontWeight: 700,
                          color: '#f87171',
                        }}
                      >
                        {gnf(bal)}
                      </td>

                      <td>

                        <div
                          style={{
                            display:
                              'flex',
                            alignItems:
                              'center',
                            gap: '8px',
                          }}
                        >

                          <div
                            style={{
                              flex: 1,
                              height: 5,
                              background:
                                '#11263f',
                              borderRadius:
                                999,
                              overflow:
                                'hidden',
                              minWidth: 80,
                            }}
                          >

                            <div
                              style={{
                                width: `${Math.min(
                                  part * 100,
                                  100
                                )}%`,
                                height: '100%',
                                background:
                                  color,
                                borderRadius:
                                  999,
                              }}
                            />

                          </div>

                          <span
                            style={{
                              fontSize:
                                '11px',
                              color:
                                'var(--text-muted)',
                              minWidth:
                                '38px',
                            }}
                          >
                            {(part * 100).toFixed(
                              1
                            )}
                            %
                          </span>

                        </div>

                      </td>

                      <td>

                        <span
                          style={{
                            color:
                              rec >= 0.85
                                ? '#10b981'
                                : '#f59e0b',
                            fontWeight: 700,
                          }}
                        >
                          {pct(rec)}
                        </span>

                      </td>

                      <td>

                        <span
                          className={
                            rec >= 0.85
                              ? 'badge-pill green'
                              : 'badge-pill amber'
                          }
                        >
                          {rec >= 0.85
                            ? 'Sous contrôle'
                            : 'À surveiller'}
                        </span>

                      </td>

                    </tr>
                  );
                }
              )}

            </tbody>

          </table>

        </div>

      </div>

      {/* Alerte */}

      <div className="dark-alert-box warning">

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 700,
            color: '#f59e0b',
            marginBottom: '4px',
          }}
        >

          <Wallet size={16} />

          <span>
            Point d'attention DG —
            Recouvrement des créances
          </span>

        </div>

        <p
          style={{
            fontSize: '12.5px',
            color:
              'var(--text-secondary)',
            lineHeight: '1.5',
          }}
        >
          Le volume total des impayés
          s'élève à {gnf(balance)} sur
          l'exercice {year}
          {clientType
            ? ` pour la catégorie « ${clientType} »`
            : ' toutes catégories confondues'}
          , sur un montant exigible de{' '}
          {gnf(billedWithPenalty)}. Le taux
          de recouvrement ressort à{' '}
          {pct(recovery)} (brut)
          {recoveryUpdated == null
            ? ''
            : `, ${pct(
                recoveryUpdated
              )} actualisé`}
          . Ce poste fait l'objet de
          relances et d'une commission de
          liquidation des mandats
          administratifs.
        </p>

      </div>

    </div>
  );
}
