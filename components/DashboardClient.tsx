'use client';

import { useEffect, useMemo, useState } from 'react';

import { KpiGrid } from '@/components/Kpi';
import type { KpiItem } from '@/lib/dashboard-data';
import { NationalMap } from '@/components/NationalMap';

import {
  WaterProductionCard,
  RegionalDistributionCard,
  MissionsStatusBarCard,
} from '@/components/Charts';

import {
  IncidentsByTypeCard,
  RecentAlertsCard,
  RegionalPerformanceCard,
} from '@/components/BottomSections';

import { num, gnf, pct } from '@/lib/format';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProductionDistribution } from '@/lib/use-production-distribution';

const palette = [
  '#2563eb',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#38bdf8',
  '#14b8a6',
  '#64748b',
];

type Overview = any;

export function DashboardClient() {
  const { user } = useAuth();

  // ============================================================
  // FILTRES GLOBAUX
  // ============================================================

  const [year, setYear] = useState(2026);
  const [agency, setAgency] = useState('');
  const [clientType, setClientType] = useState('');

  const [filterOptions, setFilterOptions] = useState<{
    agencies: string[];
    clientTypes: string[];
  }>({
    agencies: [],
    clientTypes: [],
  });

  // ============================================================
  // DONNÉES DU DASHBOARD
  // ============================================================

  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Données de facturation complémentaires du dashboard DG.
  const [billingSummary, setBillingSummary] = useState<any>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState('');
  const [billingScopeNote, setBillingScopeNote] = useState('');


  // ============================================================
  // CHARGEMENT DES FILTRES
  // ============================================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadFilters() {
      try {
        const response = await fetch('/api/filters', {
          cache: 'no-store',
          signal: controller.signal,
        });

        const json = await response.json();

        if (!response.ok || !json.ok) {
          throw new Error(
            json.error || 'Impossible de charger les filtres.'
          );
        }

        setFilterOptions({
          agencies: json.data?.agencies ?? [],
          clientTypes: json.data?.clientTypes ?? [],
        });
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.error(
          '[Dashboard] Erreur chargement filtres:',
          error
        );
      }
    }

    loadFilters();

    return () => controller.abort();
  }, []);

  // ============================================================
  // CHARGEMENT DES DONNÉES SELON LES FILTRES
  // ============================================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadOverview() {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        year: String(year),
      });

      if (agency) {
        params.set('agency', agency);
      }

      if (clientType) {
        params.set('clientType', clientType);
      }

      try {
        const response = await fetch(
          `/api/overview?${params.toString()}`,
          {
            signal: controller.signal,
            cache: 'no-store',
          }
        );

        const json = await response.json();

        if (!response.ok || !json.ok) {
          throw new Error(
            json.error ||
              'Impossible de charger les données du tableau de bord.'
          );
        }

        setOverview(json.data ?? null);
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        setError(
          error instanceof Error
            ? error.message
            : 'Impossible de charger les données du tableau de bord.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadOverview();

    return () => controller.abort();
  }, [year, agency, clientType]);

  // ============================================================
  // KPI RÉELS
  // ============================================================


  // ============================================================
  // FACTURATION NATIONALE — SOURCE SUPABASE
  // ============================================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadBillingSummary() {
      setBillingLoading(true);
      setBillingError('');
      setBillingScopeNote('');

      try {
        const params = new URLSearchParams({
          year: String(year),
        });

        const categoryAliases: Record<string, string> = {
          'Administration': 'ADM Gle',
          'Administration Publique': 'ADM Gle',
          'Autres ADM': 'Autre ADM',
          'Autres ADM & Collectivités': 'Autre ADM',
          'Bornes Fontaines': 'BF',
          'Borne Fontaine': 'BF',
          'Particuliers': 'Domestique',
        };

        const sourceCategories = new Set([
          'ADM Gle',
          'Agent SEG',
          'Autre ADM',
          'BF',
          'Commerce',
          'Domestique',
          'Industrie',
          'Installation SEG',
        ]);

        const mappedCategory =
          categoryAliases[clientType] ||
          (sourceCategories.has(clientType) ? clientType : '');

        const notes: string[] = [];

        if (clientType && mappedCategory) {
          params.set('category', mappedCategory);
        } else if (clientType) {
          notes.push(
            'Le segment sélectionné ne possède pas de correspondance ' +
            'confirmée dans les catégories sources de facturation.'
          );
        }

        // Première requête : données de l'exercice et noms sources.
        const response = await fetch(
          `/api/kpi/facturation-centres?${params.toString()}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(
            result.error ||
            'Impossible de récupérer les données nationales de facturation.'
          );
        }

        let selectedData = result.data;

        // Le filtre Agence appartient au référentiel administratif.
        // On ne l'applique à la facturation que si le nom correspond
        // exactement à un centre source connu.
        if (agency) {
          const sourceCenters: string[] =
            result.data?.filters?.centers ?? [];

          const matchingCenter = sourceCenters.find(
            (name: string) =>
              String(name).trim().toLocaleLowerCase('fr') ===
              agency.trim().toLocaleLowerCase('fr')
          );

          if (matchingCenter) {
            const centerParams = new URLSearchParams(
              params.toString()
            );

            centerParams.set('center', matchingCenter);

            const centerResponse = await fetch(
              `/api/kpi/facturation-centres?${centerParams.toString()}`,
              {
                cache: 'no-store',
                signal: controller.signal,
              }
            );

            const centerResult = await centerResponse.json();

            if (!centerResponse.ok || !centerResult.ok) {
              throw new Error(
                centerResult.error ||
                'Impossible de charger les données du centre sélectionné.'
              );
            }

            selectedData = centerResult.data;
          } else {
            notes.push(
              `L'agence administrative « ${agency} » ne correspond pas ` +
              'exactement à un nom source de facturation. Les chiffres ' +
              'restent nationaux pour ce référentiel.'
            );
          }
        }

        setBillingSummary(selectedData);
        setBillingScopeNote(notes.join(' '));
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.error(
          '[Dashboard DG] Erreur de facturation Supabase :',
          error
        );

        setBillingError(
          error instanceof Error
            ? error.message
            : 'Erreur de chargement de la facturation.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setBillingLoading(false);
        }
      }
    }

    loadBillingSummary();

    return () => controller.abort();
  }, [year, agency, clientType]);

  // Production réelle du Grand Conakry (DCGT/DPR) — remplace le volume
  // distribué jusqu'ici affiché sous le libellé « Production d'eau ».
  const productionData = useProductionDistribution(year);
  const productionKpis = productionData.data?.kpis;
  const productionPeriod = productionKpis?.lastMonth
    ? productionKpis.lastMonth === 12
      ? `Année ${year}`
      : `Janvier → ${MONTH_NAMES_FR[productionKpis.lastMonth - 1]} ${year}`
    : String(year);

  const kpis = useMemo(() => {
    if (!overview) {
      return [];
    }

    const k = overview.kpis ?? {};

    return [
      {
        id: 'subscribers',
        title: 'Abonnés facturés',
        value: num(k.subscribers),
        trend: `Dernier cycle : ${monthsLabel(k.subscribersCycleMonths)}`,
        trendUp: true,
        trendLabel: 'Supabase',
        period: 'Conakry',
        icon: 'users' as const,
        color: '#2563eb',
      },

      {
        id: 'production',
        title: "Production d'eau",
        value: productionKpis ? `${num(productionKpis.productionConakry)} m³` : '—',
        trend: productionKpis ? productionPeriod : productionData.error ? 'Source indisponible' : 'Chargement…',
        trendUp: true,
        trendLabel: 'DCGT/DPR',
        period: 'Grand Conakry',
        icon: 'clipboard' as const,
        color: '#06b6d4',
      },

      {
        id: 'volume-billed',
        title: 'Volume facturé',
        value: `${num(k.volumeBilled)} m³`,
        trend: monthsLabel(k.facturationMonths),
        trendUp: true,
        trendLabel: 'Facturation',
        period: 'Conakry',
        icon: 'check' as const,
        color: '#10b981',
      },

      {
        id: 'revenue',
        title: "Chiffre d'affaires",
        value: gnfCompact(k.revenue),
        trend: monthsLabel(k.facturationMonths),
        trendUp: true,
        trendLabel: 'Montant facturé',
        period: 'Conakry',
        icon: 'wallet' as const,
        color: '#f59e0b',
      },

      {
        id: 'balance',
        title: 'Impayés',
        value: gnfCompact(k.balance),
        trend: `Solde dû · ${monthsLabel(k.recoveryMonths)}`,
        trendUp: false,
        trendLabel: 'Solde dû',
        period: 'Conakry',
        icon: 'alert' as const,
        color: '#ef4444',
      },

      {
        id: 'recovery',
        title: 'Taux de recouvrement',
        value: pct(k.recovery),
        trend:
          k.recoveryUpdated == null
            ? `Brut · ${monthsLabel(k.recoveryMonths)}`
            : `Brut · actualisé : ${pct(k.recoveryUpdated)}`,
        trendUp: true,
        trendLabel: 'Recouvrement',
        period: 'Conakry',
        icon: 'chat' as const,
        color: '#8b5cf6',
      },
    ];
  }, [overview, year, productionKpis, productionPeriod, productionData.error]);

  // ============================================================

  // ============================================================
  // SYNTHÈSE DES DONNÉES DE FACTURATION
  // ============================================================

  const billingKpis = billingSummary?.kpis ?? {};

  const billingMonthly: any[] =
    Array.isArray(billingSummary?.monthly)
      ? billingSummary.monthly
      : [];

  const billingCategories: any[] =
    Array.isArray(billingSummary?.categories)
      ? billingSummary.categories
      : [];

  const billingCenters: any[] =
    Array.isArray(billingSummary?.centers)
      ? billingSummary.centers
      : [];

  const billingRevenueTTC =
    Number(billingKpis.revenueTTC ?? billingKpis.revenue) || 0;

  const billingRevenueHT =
    Number(billingKpis.revenueHT) || 0;

  const billingVolumeConsumed =
    Number(billingKpis.volumeConsumed) || 0;

  const billingVolumeBilled =
    Number(billingKpis.volumeBilled) || 0;

  const billingSubscribers =
    Number(billingKpis.subscribers) || 0;

  const billingMaxMonthRevenue = Math.max(
    1,
    ...billingMonthly.map(
      (item: any) => Number(item.revenueTTC) || 0
    )
  );

  const billingMaxCategoryRevenue = Math.max(
    1,
    ...billingCategories.map(
      (item: any) => Number(item.revenueTTC) || 0
    )
  );

  // DONNÉES PAR AGENCE
  // ============================================================

  const agencyData = useMemo(() => {
    return billingCenters
      .map((center: any, index: number) => ({
        name: center.name,
        value: Number(center.revenueTTC ?? center.revenue ?? 0),
        pct: '',
        color: palette[index % palette.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [billingCenters]);

  // Période couverte par la facturation (ex. « Janvier → Août 2026 »),
  // affichée sur la carte « Répartition du CA » à la place de « Ce mois ».
  const billingPeriodLabel = useMemo(() => {
    const months = billingMonthly
      .filter((item: any) => (Number(item.revenueTTC) || 0) > 0)
      .map((item: any) => ({ n: Number(item.month), name: String(item.monthName ?? '') }))
      .filter((m) => Number.isInteger(m.n) && m.n >= 1 && m.n <= 12)
      .sort((a, b) => a.n - b.n);

    if (months.length === 0) return `Exercice ${year}`;
    if (months.length === 12) return `Cumul ${year}`;

    const first = months[0];
    const last = months[months.length - 1];
    return first.n === last.n
      ? `${last.name} ${year}`
      : `Cumul ${first.name} → ${last.name} ${year}`;
  }, [billingMonthly, year]);

  // ============================================================
  // OBJECTIF DE PRODUCTION
  // ============================================================

  const target = useMemo(() => {
    const production = Number(
      overview?.kpis?.production ?? 0
    );

    return production > 0
      ? Math.round(production * 1.1)
      : 0;
  }, [overview]);

  // ============================================================
  // INTERFACE
  // ============================================================

  return (
    <>
      {/* ======================================================
          EN-TÊTE
          ====================================================== */}

      <div className="dashboard-greeting">
        <h1>
          Bonjour{' '}
          {user?.displayName?.split(' ')[0] ||
            'Monsieur/Madame'},
        </h1>

        <p>
          Voici la situation en temps réel de la société.
        </p>
      </div>

      {/* ======================================================
          FILTRES GLOBAUX
          ====================================================== */}

      <div className="dashboard-filter-bar">

        {/* EXERCICE */}

        <div>
          <span className="filter-label">
            Exercice
          </span>

          <select
            value={year}
            onChange={(event) =>
              setYear(
                Number(event.target.value)
              )
            }
          >
            <option value={2026}>
              2026
            </option>

            <option value={2025}>
              2025
            </option>
          </select>
        </div>

        {/* AGENCE */}

        <div>
          <span className="filter-label">
            Agence
          </span>

          <select
            value={agency}
            onChange={(event) =>
              setAgency(event.target.value)
            }
          >
            <option value="">
              Toutes les agences
            </option>

            {filterOptions.agencies.map(
              (agencyName) => (
                <option
                  key={agencyName}
                  value={agencyName}
                >
                  {agencyName}
                </option>
              )
            )}
          </select>
        </div>

        {/* TYPE CLIENT */}

        <div>
          <span className="filter-label">
            Type client
          </span>

          <select
            value={clientType}
            onChange={(event) =>
              setClientType(
                event.target.value
              )
            }
          >
            <option value="">
              Tous les clients
            </option>

            {filterOptions.clientTypes.map(
              (clientTypeName) => (
                <option
                  key={clientTypeName}
                  value={clientTypeName}
                >
                  {clientTypeName}
                </option>
              )
            )}
          </select>
        </div>

        {/* STATUT */}

        <div
          className={`db-status ${
            loading
              ? 'loading'
              : error
                ? 'error'
                : 'ok'
          }`}
        >
          <span />

          {loading
            ? 'Actualisation…'
            : error
              ? 'Erreur de synchronisation'
              : 'Données synchronisées'}
        </div>
      </div>

      {/* ======================================================
          MESSAGE D'ERREUR
          ====================================================== */}

      {error && (
        <div className="db-error-banner">
          {error}
        </div>
      )}

      {/* ======================================================
          KPI
          ====================================================== */}

      <KpiGrid items={kpis} />


      {/* ======================================================
          FACTURATION — DONNÉES COMPLÉMENTAIRES SUPABASE
          ====================================================== */}

      <section className="dashboard-card">
        <div className="card-header-flex">
          <div>
            <h3>Facturation des centres de l’intérieur — exercice {year}</h3>
            <p style={{
              marginTop: 5,
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--text-muted)'
            }}>
              28 centres de facturation hors Conakry (les agences de Conakry figurent dans les indicateurs du haut).
            </p>
          </div>

          <span className="badge-pill cyan">
            {billingLoading
              ? 'Actualisation…'
              : `${Number(billingKpis.centersCount ?? billingCenters.length)} centres sources`}
          </span>
        </div>

        {billingScopeNote && (
          <div className="dark-alert-box info" style={{ marginTop: 12 }}>
            <p style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.5
            }}>
              {billingScopeNote}
            </p>
          </div>
        )}

        {billingError && (
          <div className="db-error-banner" style={{ marginTop: 12 }}>
            Impossible de charger la facturation Supabase : {billingError}
          </div>
        )}

        {/* Indicateurs clés */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))',
          gap: 14,
          marginTop: 18
        }}>
          <div className="kpi-card">
            <div className="kpi-title">Abonnés facturés</div>
            <div className="kpi-main-val" style={{
              marginTop: 9,
              color: '#38bdf8'
            }}>
              {billingLoading ? '…' : num(billingSubscribers)}
            </div>
            <div className="kpi-foot-row">
              <span className="kpi-trend positive">
                Dernier mois disponible
              </span>
              <span className="kpi-period">{year}</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-title">Volume consommé</div>
            <div className="kpi-main-val" style={{
              marginTop: 9,
              color: '#10b981'
            }}>
              {billingLoading
                ? '…'
                : `${num(billingVolumeConsumed)} m³`}
            </div>
            <div className="kpi-foot-row">
              <span className="kpi-trend positive">
                Cumul de la période
              </span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-title">Volume facturé</div>
            <div className="kpi-main-val" style={{
              marginTop: 9,
              color: '#f59e0b'
            }}>
              {billingLoading
                ? '…'
                : `${num(billingVolumeBilled)} m³`}
            </div>
            <div className="kpi-foot-row">
              <span className="kpi-trend positive">
                Cumul de la période
              </span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-title">Chiffre d'affaires TTC</div>
            <div className="kpi-main-val" style={{
              marginTop: 9,
              fontSize: 20,
              color: '#10b981',
              overflowWrap: 'anywhere'
            }}>
              {billingLoading
                ? '…'
                : gnfCompact(billingRevenueTTC)}
            </div>
            <div className="kpi-foot-row">
              <span className="kpi-trend positive">
                Montant facturé TTC
              </span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-title">Chiffre d'affaires HT</div>
            <div className="kpi-main-val" style={{
              marginTop: 9,
              fontSize: 20,
              color: '#c084fc',
              overflowWrap: 'anywhere'
            }}>
              {billingLoading
                ? '…'
                : gnfCompact(billingRevenueHT)}
            </div>
            <div className="kpi-foot-row">
              <span className="kpi-trend positive">
                Montant hors taxes
              </span>
            </div>
          </div>
        </div>

        {/* Évolution mensuelle */}
        <div style={{ marginTop: 25 }}>
          <div className="card-header-flex">
            <h3>Évolution mensuelle du chiffre d'affaires</h3>
            <span className="badge-pill green">{year}</span>
          </div>

          {billingLoading ? (
            <div style={{
              padding: 20,
              textAlign: 'center',
              color: 'var(--text-muted)'
            }}>
              Chargement de l'évolution mensuelle…
            </div>
          ) : billingMonthly.length === 0 ? (
            <div style={{
              padding: 20,
              textAlign: 'center',
              color: 'var(--text-muted)'
            }}>
              Aucune donnée mensuelle disponible.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gap: 12,
              marginTop: 15
            }}>
              {billingMonthly.map((item: any) => {
                const monthRevenue =
                  Number(item.revenueTTC) || 0;

                const width = Math.max(
                  0,
                  Math.min(
                    100,
                    monthRevenue / billingMaxMonthRevenue * 100
                  )
                );

                return (
                  <div key={item.month}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '90px minmax(50px, 1fr) minmax(100px, 155px)',
                      alignItems: 'center',
                      gap: 10
                    }}>
                      <span style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)'
                      }}>
                        {item.monthName}
                      </span>

                      <div style={{
                        height: 9,
                        borderRadius: 999,
                        background: 'rgba(148,163,184,0.13)',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${width}%`,
                          background: 'linear-gradient(90deg, #0284c7, #10b981)',
                          borderRadius: 999
                        }} />
                      </div>

                      <strong style={{
                        textAlign: 'right',
                        fontSize: 11.5,
                        color: 'var(--text-strong)'
                      }}>
                        {gnfCompact(monthRevenue)}
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Répartition par catégorie */}
        <div style={{ marginTop: 26 }}>
          <div className="card-header-flex">
            <h3>Répartition par catégorie de clientèle</h3>
            <span className="badge-pill cyan">
              {billingCategories.length} catégories
            </span>
          </div>

          {billingCategories.length === 0 ? (
            <div style={{
              padding: 18,
              color: 'var(--text-muted)',
              textAlign: 'center'
            }}>
              Aucune répartition disponible.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 12,
              marginTop: 14
            }}>
              {billingCategories.map((item: any) => {
                const revenue =
                  Number(item.revenueTTC) || 0;

                const share = Math.max(
                  0,
                  Math.min(
                    100,
                    revenue / billingMaxCategoryRevenue * 100
                  )
                );

                return (
                  <div
                    key={item.name}
                    style={{
                      padding: 14,
                      borderRadius: 9,
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-inner)',
                      minWidth: 0
                    }}
                  >
                    <div style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text-strong)',
                      overflowWrap: 'anywhere'
                    }}>
                      {item.name}
                    </div>

                    <div style={{
                      marginTop: 8,
                      fontSize: 17,
                      fontWeight: 800,
                      color: '#10b981',
                      overflowWrap: 'anywhere'
                    }}>
                      {gnfCompact(revenue)}
                    </div>

                    <div style={{
                      marginTop: 10,
                      height: 5,
                      background: 'rgba(148,163,184,0.13)',
                      borderRadius: 999,
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${share}%`,
                        background: '#38bdf8',
                        borderRadius: 999
                      }} />
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginTop: 7,
                      fontSize: 10.5,
                      color: 'var(--text-muted)'
                    }}>
                      <span>Part du montant maximal</span>
                      <strong>
                        {share.toLocaleString('fr-FR', {
                          maximumFractionDigits: 1
                        })}%
                      </strong>
                    </div>

                    <div style={{
                      marginTop: 9,
                      fontSize: 11,
                      color: 'var(--text-muted)'
                    }}>
                      Volume facturé : {num(Number(item.volumeBilled) || 0)} m³
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{
          marginTop: 18,
          paddingTop: 12,
          borderTop: '1px solid var(--border-color)',
          fontSize: 11,
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap'
        }}>
          <span>
            Source : seg_facturation_centres_mensuelle
          </span>
          <span>
            Les montants facturés restent distincts des encaissements.
          </span>
        </div>
      </section>



      {/* ======================================================
          ZONE CENTRALE
          ====================================================== */}

      <div className="middle-grid">

        {/* CARTE NATIONALE */}

        <NationalMap year={year} agency={agency} />

        {/* COLONNE DROITE */}

        <div className="right-column-stack">

          <WaterProductionCard
            title="Production d'eau — Grand Conakry"
            data={(productionData.data?.monthly ?? []).map((m) => ({
              month: `${year}-${String(m.mois).padStart(2, '0')}`,
              production: m.production ?? 0,
            }))}
            total={productionKpis?.productionConakry ?? 0}
            period={productionPeriod}
            source="DCGT/DPR (sites de production)"
          />

          <RegionalDistributionCard
            data={agencyData}
            period={billingPeriodLabel}
          />

        </div>
      </div>

      {/* ======================================================
          SECTION BASSE
          ====================================================== */}

      <div className="bottom-grid-4">

        <MissionsStatusBarCard />

        <IncidentsByTypeCard />

        <RecentAlertsCard
          issues={
            overview?.qualityIssues ?? []
          }
        />

        <RegionalPerformanceCard
          data={
            overview?.agencies ?? []
          }
        />

      </div>
    </>
  );
}

// ============================================================
// FORMATAGE GNF
// ============================================================

function gnfCompact(value: number) {
  const amount = Number(value || 0);
  const abs = Math.abs(amount);

  if (abs >= 1_000_000_000) {
    return `${(
      amount / 1_000_000_000
    ).toLocaleString('fr-FR', {
      maximumFractionDigits: 2,
    })} Md GNF`;
  }

  if (abs >= 1_000_000) {
    return `${(
      amount / 1_000_000
    ).toLocaleString('fr-FR', {
      maximumFractionDigits: 1,
    })} M GNF`;
  }

  if (abs >= 1_000) {
    return `${(
      amount / 1_000
    ).toLocaleString('fr-FR', {
      maximumFractionDigits: 1,
    })} k GNF`;
  }

  return `${amount.toLocaleString('fr-FR')} GNF`;
}

// ============================================================
// LIBELLÉS DE PÉRIODE
// ============================================================

const MONTH_NAMES_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// ['2026-01', …, '2026-06'] -> « Janv. → Juin 2026 »
function monthsLabel(months?: string[] | null): string {
  if (!Array.isArray(months) || months.length === 0) return 'Période non renseignée';
  const sorted = [...months].sort();
  const name = (m: string) => {
    const idx = Number(m.slice(5, 7)) - 1;
    return MONTH_NAMES_FR[idx] ?? m;
  };
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const year = last.slice(0, 4);
  return first === last ? `${name(last)} ${year}` : `${name(first)} → ${name(last)} ${year}`;
}
