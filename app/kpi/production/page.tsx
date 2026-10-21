'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Droplets,
  ArrowLeft,
  Activity,
  Fuel,
  Factory,
  RefreshCw,
  AlertCircle,
  MapPin,
  Building2,
  Gauge,
} from 'lucide-react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { num, pct } from '@/lib/format';
import {
  useProductionDistribution,
  type ProductionDistributionData,
} from '@/lib/use-production-distribution';

/* =====================================================================
 * Page Production d'eau
 *
 * 1. Production nationale d'eau traitée (Conakry + centres), 2023 → 2026
 *    Source : /api/kpi/production-distribution (DCGT/DPR, Supabase)
 * 2. Suivi technique des centres (eau brute/traitée, gasoil)
 *    Source : /api/technique (seg_technique_center_monthly)
 *
 * Les deux sources se rechargent automatiquement quand les données
 * changent en base (voir lib/use-data-version.ts).
 * ===================================================================== */

type TechnicalCenterRow = {
  id: number;
  period_month: string;
  center_no: number | null;
  center_name: string;
  raw_water_m3: number | string | null;
  treated_water_m3: number | string | null;
  station_yield: number | string | null;
  gasoil_delivered_l: number | string | null;
  gasoil_opening_stock_l: number | string | null;
  gasoil_consumption_l: number | string | null;
  gasoil_other_l: number | string | null;
  gasoil_closing_stock_l: number | string | null;
};

type TechniqueResponse = {
  ok: boolean;
  error?: string;
  data?: {
    centers: TechnicalCenterRow[];
  };
};

type MonthSummary = {
  month: number;
  raw: number;
  treated: number;
  gasoil: number;
  rows: number;
  hasVolumeData: boolean;
};

const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

// Exercices couverts par les fichiers de production (complétés par la base).
const BASE_YEARS = [2026, 2025, 2024, 2023];

// Couleurs des séries (validées daltonisme / contraste, thème sombre et clair).
const COLOR_CONAKRY = '#0284c7';
const COLOR_CENTRES = '#059669';
const COLOR_N1 = '#94a3b8';

const chartTooltipStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: 6,
  fontSize: 11,
  color: 'var(--text-secondary)',
};

function numeric(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;

  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function formatMonth(period: string): string {
  const month = Number(period.slice(5, 7));
  return MONTHS[month - 1] ?? period;
}

function formatYield(value: number | string | null): string {
  if (value === null || value === '') return '—';

  const result = Number(value);
  if (!Number.isFinite(result)) return '—';

  // Les données peuvent être stockées comme 0,85 ou comme 85.
  // On normalise uniquement pour l'affichage, sans modifier la base.
  return pct(result > 1 ? result / 100 : result);
}

// Pourcentage à une décimale, format français (ex. « 2,9 % »).
function pct1(value: number): string {
  return `${(value * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function evolution(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

function mm3(value: number): string {
  if (Math.abs(value) >= 1e6) {
    return `${(value / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Mm³`;
  }
  return `${num(value)} m³`;
}

export default function ProductionPage() {
  const [year, setYear] = useState(2026);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedCenter, setSelectedCenter] = useState('');
  const [rows, setRows] = useState<TechnicalCenterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const monthNumber = selectedMonth ? Number(selectedMonth) : null;
  const pd = useProductionDistribution(year, 12, monthNumber);

  const years = useMemo(
    () =>
      Array.from(new Set([...BASE_YEARS, ...(pd.data?.availableYears ?? [])])).sort(
        (a, b) => b - a
      ),
    [pd.data?.availableYears]
  );

  // ---- Relevés techniques des centres ---------------------------------
  useEffect(() => {
    const controller = new AbortController();

    async function loadTechnicalData() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/technique?year=${year}`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });

        const result = (await response.json()) as TechniqueResponse;

        if (!response.ok || !result.ok) {
          throw new Error(result.error || `Erreur HTTP ${response.status}`);
        }

        setRows(result.data?.centers ?? []);
      } catch (err) {
        if (controller.signal.aborted) return;

        setRows([]);
        setError(
          err instanceof Error
            ? err.message
            : 'Impossible de charger les données techniques.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadTechnicalData();

    return () => controller.abort();
  }, [year, reloadToken, pd.refreshTick]);

  const centers = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.center_name?.trim())
          .filter((name): name is string => Boolean(name))
      )
    ).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [rows]);

  // Un centre choisi n'existe plus pour le nouvel exercice : on le retire.
  useEffect(() => {
    if (selectedCenter && !loading && !centers.includes(selectedCenter)) {
      setSelectedCenter('');
    }
  }, [centers, selectedCenter, loading]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const month = Number(row.period_month.slice(5, 7));
      const matchesMonth = !selectedMonth || month === Number(selectedMonth);
      const matchesCenter = !selectedCenter || row.center_name === selectedCenter;
      return matchesMonth && matchesCenter;
    });
  }, [rows, selectedMonth, selectedCenter]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.raw += numeric(row.raw_water_m3);
        acc.treated += numeric(row.treated_water_m3);
        acc.gasoil += numeric(row.gasoil_consumption_l);
        return acc;
      },
      { raw: 0, treated: 0, gasoil: 0 }
    );
  }, [filteredRows]);

  const monthly = useMemo<MonthSummary[]>(() => {
    const map = new Map<number, MonthSummary>();

    for (const row of filteredRows) {
      const month = Number(row.period_month.slice(5, 7));
      if (!Number.isInteger(month) || month < 1 || month > 12) continue;

      const current = map.get(month) ?? {
        month,
        raw: 0,
        treated: 0,
        gasoil: 0,
        rows: 0,
        hasVolumeData: false,
      };

      current.raw += numeric(row.raw_water_m3);
      current.treated += numeric(row.treated_water_m3);
      current.gasoil += numeric(row.gasoil_consumption_l);
      current.rows += 1;

      if (row.raw_water_m3 !== null || row.treated_water_m3 !== null) {
        current.hasVolumeData = true;
      }

      map.set(month, current);
    }

    return Array.from(map.values()).sort((a, b) => a.month - b.month);
  }, [filteredRows]);

  const anyLoading = loading || pd.loading;
  const anyError = error || pd.error;
  const k = pd.data?.kpis;
  const periodLabel = monthNumber
    ? `${MONTHS[monthNumber - 1]} ${year}`
    : k?.lastMonth
      ? k.lastMonth === 12
        ? `Année ${year}`
        : `Janvier → ${MONTHS[k.lastMonth - 1]} ${year}`
      : `Exercice ${year}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link
          href="/"
          style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ArrowLeft size={14} />
          Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Production d&apos;Eau</span>
      </div>

      {/* Filtres */}
      <div
        className="dashboard-filter-bar"
        style={{ marginBottom: '2px', display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: '12px' }}
      >
        <div>
          <span className="filter-label">Exercice</span>
          <select
            value={year}
            onChange={(event) => {
              setYear(Number(event.target.value));
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="filter-label">Mois</span>
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
            <option value="">Tous les mois</option>
            {MONTHS.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="filter-label">Centre (suivi technique)</span>
          <select
            value={selectedCenter}
            onChange={(event) => setSelectedCenter(event.target.value)}
            style={{ maxWidth: '240px' }}
            disabled={centers.length === 0}
            title={centers.length === 0 ? `Aucun relevé technique pour ${year}` : undefined}
          >
            <option value="">{centers.length === 0 ? 'Aucun centre' : 'Tous les centres'}</option>
            {centers.map((center) => (
              <option key={center} value={center}>
                {center}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
          {anyLoading ? 'Chargement Supabase…' : anyError ? 'Erreur de synchronisation' : 'Source : Supabase · actualisation automatique'}
        </div>

        <div className={`db-status ${anyLoading ? 'loading' : anyError ? 'error' : 'ok'}`}>
          <span />
          {anyLoading ? 'Actualisation…' : anyError ? 'Erreur' : 'Données chargées'}
        </div>
      </div>

      {anyError && (
        <div className="db-error-banner">
          {pd.error || error}
          {(pd.error || error).includes('Authentification')
            ? ' Vérifie que ta session est toujours active.'
            : ' Vérifie la disponibilité des API et de Supabase.'}
          <button
            type="button"
            onClick={() => {
              setReloadToken((current) => current + 1);
              pd.reload();
            }}
            style={{ marginLeft: '12px' }}
          >
            <RefreshCw size={13} /> Réessayer
          </button>
        </div>
      )}

      {/* En-tête */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2>
            <Droplets size={20} style={{ display: 'inline', marginRight: '6px', color: '#06b6d4' }} />
            Production d&apos;Eau
          </h2>
          <p>
            Eau traitée produite à Conakry et dans les centres de l&apos;intérieur — {periodLabel}
            {k && !monthNumber && k.lastMonth && k.lastMonth < 12 ? ` (${k.monthsWithData} mois renseignés)` : ''}
          </p>
        </div>
      </div>

      {/* 1. Indicateurs nationaux */}
      <NationalKpis data={pd.data} loading={pd.loading} year={year} periodLabel={periodLabel} />

      {/* 2. Évolution mensuelle */}
      <MonthlyChart data={pd.data} loading={pd.loading} year={year} selectedMonth={monthNumber} />

      {/* 3. Villes + sites du Grand Conakry */}
      <div className="two-col-grid">
        <CitiesCard data={pd.data} loading={pd.loading} periodLabel={periodLabel} />
        <SitesCard data={pd.data} loading={pd.loading} periodLabel={periodLabel} year={year} />
      </div>

      {/* 4. Bilan mensuel national */}
      <NationalMonthlyTable data={pd.data} loading={pd.loading} year={year} selectedMonth={monthNumber} />

      {/* 5. Suivi technique des centres */}
      <div className="subpage-header" style={{ marginTop: '8px' }}>
        <div className="subpage-title">
          <h2 style={{ fontSize: '16px' }}>
            <Factory size={18} style={{ display: 'inline', marginRight: '6px', color: '#10b981' }} />
            Suivi technique des centres
          </h2>
          <p>
            Relevés des stations (eau brute captée, eau traitée, gasoil) — {selectedMonth ? MONTHS[Number(selectedMonth) - 1] + ' ' : ''}
            {year}
            {selectedCenter ? ` · ${selectedCenter}` : ''}
          </p>
        </div>
      </div>

      {!loading && !error && rows.length === 0 ? (
        <div className="dark-alert-box info">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
            <AlertCircle size={16} />
            <span>Aucun relevé technique pour {year}</span>
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Les relevés des stations (gasoil, rendement) ne sont pas importés pour cet exercice. Les volumes de
            production ci-dessus restent disponibles.
          </p>
        </div>
      ) : (
        <>
          <div className="subpage-kpi-grid">
            <KpiTile
              icon={<Droplets size={20} />}
              color="#06b6d4"
              title="Eau brute captée"
              value={num(totals.raw)}
              unit="m³"
              foot="Relevés des centres"
              period={String(year)}
            />
            <KpiTile
              icon={<Factory size={20} />}
              color="#10b981"
              title="Eau traitée"
              value={num(totals.treated)}
              unit="m³"
              foot={totals.raw > 0 ? `Rendement : ${pct(totals.treated / totals.raw)}` : 'Volume déclaré'}
              period={String(year)}
            />
            <KpiTile
              icon={<Fuel size={20} />}
              color="#f59e0b"
              title="Gasoil consommé"
              value={num(totals.gasoil)}
              unit="L"
              foot="Consommation déclarée"
              period={String(year)}
            />
            <KpiTile
              icon={<Activity size={20} />}
              color="#a78bfa"
              title="Centres suivis"
              value={String(new Set(filteredRows.map((row) => row.center_name)).size)}
              foot="Centres présents dans les relevés"
              period={String(year)}
            />
          </div>

          {/* Détail par centre — synthèse classée + détail mensuel */}
          <CenterDetailSection
            rows={rows}
            year={year}
            selectedMonth={monthNumber}
            selectedCenter={selectedCenter}
            onSelectCenter={setSelectedCenter}
            loading={loading}
          />

          {/* Série mensuelle technique */}
          <div className="dashboard-card">
            <div className="card-header-flex">
              <h3>Relevés mensuels — {year}</h3>
              <span className="badge-pill cyan">{monthly.length} mois avec des relevés</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="dark-table">
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th>Eau brute (m³)</th>
                    <th>Eau traitée (m³)</th>
                    <th>Gasoil consommé (L)</th>
                    <th>Centres enregistrés</th>
                    <th>État des données</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
                        {loading ? 'Chargement des données…' : 'Aucun relevé pour cette sélection.'}
                      </td>
                    </tr>
                  )}
                  {monthly.map((item) => (
                    <tr key={item.month}>
                      <td>
                        <strong style={{ color: 'var(--text-strong)' }}>{MONTHS[item.month - 1]}</strong>
                      </td>
                      <td style={{ fontWeight: 700, color: '#38bdf8' }}>{num(item.raw)}</td>
                      <td>{num(item.treated)}</td>
                      <td>{num(item.gasoil)}</td>
                      <td>{item.rows}</td>
                      <td>
                        <span className={`badge-pill ${item.hasVolumeData ? 'cyan' : ''}`}>
                          {item.hasVolumeData ? 'Valeurs renseignées' : 'À vérifier'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </>
      )}

      {/* Note de prudence */}
      <div className="dark-alert-box info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
          <AlertCircle size={16} />
          <span>Note sur la qualité des données</span>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          Production nationale : fichiers DCGT/DPR (eau traitée par ville, eau brute déclarée à partir de 2025,
          détail par site du Grand Conakry à partir de 2025). Suivi technique : relevés des stations. Une valeur
          égale à zéro peut correspondre à un arrêt réel ou à une donnée non renseignée. Le volume d&apos;eau
          traitée ne représente pas automatiquement le volume distribué ou facturé.
          {pd.data?.lastRefresh ? ` Dernière mise à jour des données : ${new Date(pd.data.lastRefresh).toLocaleString('fr-FR')}.` : ''}
        </p>
      </div>
    </div>
  );
}

/* ===================================================================== */
/* Composants                                                            */
/* ===================================================================== */

type SectionProps = { data: ProductionDistributionData | null; loading: boolean };

function EmptyState({ loading, text }: { loading: boolean; text: string }) {
  return (
    <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '24px', fontSize: '12.5px' }}>
      {loading ? 'Chargement des données…' : text}
    </div>
  );
}

function KpiTile({ icon, color, title, value, unit, foot, footClass = 'info', period }: {
  icon: ReactNode;
  color: string;
  title: string;
  value: string;
  unit?: string;
  foot: string;
  footClass?: string;
  period: string;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-header">
        <div className="kpi-icon-wrap" style={{ background: `${color}26`, color, border: `1px solid ${color}4d` }}>
          {icon}
        </div>
        <div className="kpi-title-value">
          <div className="kpi-title">{title}</div>
          <div className="kpi-num-row">
            <span className="kpi-main-val" style={{ fontSize: '18px' }}>{value}</span>
            {unit && <span className="kpi-total-val">{unit}</span>}
          </div>
        </div>
      </div>
      <div className="kpi-foot-row">
        <span className={`kpi-trend ${footClass}`}>{foot}</span>
        <span className="kpi-period">{period}</span>
      </div>
    </div>
  );
}

function NationalKpis({ data, loading, year, periodLabel }: SectionProps & { year: number; periodLabel: string }) {
  const k = data?.kpis;

  if (!k) {
    return (
      <div className="subpage-kpi-grid">
        {['Production nationale', 'Eau brute prélevée', 'Conakry', 'Centres de l’intérieur'].map((title) => (
          <KpiTile key={title} icon={<Droplets size={20} />} color="#64748b" title={title} value="—" foot={loading ? 'Chargement…' : 'Indisponible'} period={String(year)} />
        ))}
      </div>
    );
  }

  const evo = evolution(k.productionNationale, k.productionNationaleN1);
  const centresCount = (data?.cities ?? []).filter((c) => !c.est_conakry).length;
  const shortPeriod = periodLabel.replace(/^Année /, '');

  return (
    <div className="subpage-kpi-grid">
      <KpiTile
        icon={<Droplets size={20} />}
        color="#06b6d4"
        title="Production nationale (eau traitée)"
        value={num(k.productionNationale)}
        unit="m³"
        foot={evo === null ? `Pas de données ${year - 1} comparables` : `${evo >= 0 ? '▲' : '▼'} ${pct1(Math.abs(evo))} vs ${year - 1}`}
        footClass={evo === null ? 'info' : evo >= 0 ? 'positive' : 'warning'}
        period={shortPeriod}
      />
      <KpiTile
        icon={<Gauge size={20} />}
        color="#a78bfa"
        title="Eau brute prélevée"
        value={k.eauBruteDeclaree > 0 ? num(k.eauBruteDeclaree) : '—'}
        unit={k.eauBruteDeclaree > 0 ? 'm³' : undefined}
        foot={k.eauBruteDeclaree > 0 ? `Rendement de traitement : ${pct(k.productionNationale / k.eauBruteDeclaree)}` : 'Déclarée à partir de 2025'}
        period={shortPeriod}
      />
      <KpiTile
        icon={<MapPin size={20} />}
        color={COLOR_CONAKRY}
        title="Conakry"
        value={num(k.conakryNationale)}
        unit="m³"
        foot={k.productionNationale > 0 ? `${pct(k.conakryNationale / k.productionNationale)} de la production` : '—'}
        period={shortPeriod}
      />
      <KpiTile
        icon={<Building2 size={20} />}
        color={COLOR_CENTRES}
        title="Centres de l’intérieur"
        value={num(k.centresNationale)}
        unit="m³"
        foot={`${centresCount} centres · ${k.productionNationale > 0 ? pct(k.centresNationale / k.productionNationale) : '—'}`}
        period={shortPeriod}
      />
    </div>
  );
}

function MonthlyChart({ data, loading, year, selectedMonth }: SectionProps & { year: number; selectedMonth: number | null }) {
  const series = (data?.monthly ?? []).map((m) => ({
    mois: MONTHS_SHORT[m.mois - 1],
    month: m.mois,
    conakry: m.nationalConakry,
    centres: m.nationalCentres,
    n1: m.nationalN1,
  }));
  const hasN1 = series.some((s) => s.n1 !== null);

  return (
    <div className="dashboard-card">
      <div className="card-header-flex">
        <h3>Évolution mensuelle de la production — {year}</h3>
        <span className="badge-pill cyan">{series.length} mois renseignés</span>
      </div>

      {series.length === 0 ? (
        <EmptyState loading={loading} text={`Aucune donnée de production pour ${year}.`} />
      ) : (
        <div style={{ width: '100%', height: 290 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
              <XAxis dataKey="mois" stroke="#556c84" fontSize={11} tickLine={false} axisLine={{ stroke: 'rgba(148,163,184,0.25)' }} />
              <YAxis
                stroke="#556c84"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v) => `${(Number(v) / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                formatter={(v: any, name: any) => [v === null || v === undefined ? '—' : `${num(Number(v))} m³`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="conakry" name="Conakry" stackId="prod" fill={COLOR_CONAKRY} stroke="var(--bg-card)" strokeWidth={1}>
                {series.map((s) => (
                  <Cell key={`c-${s.month}`} fillOpacity={selectedMonth && s.month !== selectedMonth ? 0.35 : 1} />
                ))}
              </Bar>
              <Bar dataKey="centres" name="Intérieur (centres)" stackId="prod" fill={COLOR_CENTRES} stroke="var(--bg-card)" strokeWidth={1} radius={[4, 4, 0, 0]}>
                {series.map((s) => (
                  <Cell key={`r-${s.month}`} fillOpacity={selectedMonth && s.month !== selectedMonth ? 0.35 : 1} />
                ))}
              </Bar>
              {hasN1 && (
                <Line type="monotone" dataKey="n1" name={`Total ${year - 1}`} stroke={COLOR_N1} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ShareRow({ label, sub, value, share, color }: { label: string; sub?: string; value: number; share: number; color: string }) {
  return (
    <div style={{ padding: '7px 0', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
        <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
          {label}
          {sub && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> · {sub}</span>}
        </span>
        <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {num(value)} m³ <span style={{ color: 'var(--text-dim)' }}>({pct(share)})</span>
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(148,163,184,0.12)', borderRadius: 3, overflow: 'hidden', marginTop: 5 }}>
        <div style={{ width: `${Math.min(100, Math.max(share * 100, value > 0 ? 0.6 : 0))}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function CitiesCard({ data, loading, periodLabel }: SectionProps & { periodLabel: string }) {
  const cities = data?.cities ?? [];
  const total = cities.reduce((acc, c) => acc + c.volume, 0);
  const max = cities.reduce((acc, c) => Math.max(acc, c.volume), 0);

  return (
    <div className="dashboard-card">
      <div className="card-header-flex">
        <h3>Production par ville</h3>
        <span className="badge-pill cyan">{periodLabel}</span>
      </div>
      {cities.length === 0 ? (
        <EmptyState loading={loading} text="Aucune production enregistrée pour cette période." />
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginBottom: 6 }}>
            {cities.length} villes · total {mm3(total)} · barres relatives à la première ville hors Conakry
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 6 }}>
            {cities.map((c) => {
              // Conakry écrase l'échelle : on la montre en pleine largeur et on
              // échelonne les centres entre eux pour qu'ils restent lisibles.
              const maxCentres = cities.filter((x) => !x.est_conakry).reduce((acc, x) => Math.max(acc, x.volume), 0) || max;
              const barShare = c.est_conakry ? 1 : maxCentres > 0 ? c.volume / maxCentres : 0;
              return (
                <ShareRowScaled
                  key={c.ville_nom}
                  label={c.ville_nom}
                  sub={c.est_conakry ? 'capitale' : undefined}
                  value={c.volume}
                  share={total > 0 ? c.volume / total : 0}
                  bar={barShare}
                  color={c.est_conakry ? COLOR_CONAKRY : COLOR_CENTRES}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ShareRowScaled({ label, sub, value, share, bar, color }: { label: string; sub?: string; value: number; share: number; bar: number; color: string }) {
  return (
    <div style={{ padding: '7px 0', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
        <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
          {label}
          {sub && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> · {sub}</span>}
        </span>
        <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {num(value)} m³ <span style={{ color: 'var(--text-dim)' }}>({pct(share)})</span>
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(148,163,184,0.12)', borderRadius: 3, overflow: 'hidden', marginTop: 5 }}>
        <div style={{ width: `${Math.min(100, Math.max(bar * 100, value > 0 ? 0.6 : 0))}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function SitesCard({ data, loading, periodLabel, year }: SectionProps & { periodLabel: string; year: number }) {
  const sites = data?.sites ?? [];
  const total = sites.reduce((acc, s) => acc + s.volume, 0);

  return (
    <div className="dashboard-card">
      <div className="card-header-flex">
        <h3>Grand Conakry — production par site</h3>
        <span className="badge-pill cyan">{periodLabel}</span>
      </div>
      {sites.length === 0 ? (
        <EmptyState
          loading={loading}
          text={year < 2025 ? 'Le détail par site du Grand Conakry est disponible à partir de 2025.' : 'Aucune production par site pour cette période.'}
        />
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginBottom: 6 }}>
            {sites.filter((s) => s.volume > 0).length} sites actifs sur {sites.length} · total {mm3(total)}
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 6 }}>
            {sites.map((s) => (
              <ShareRow
                key={s.site_nom}
                label={s.site_nom}
                sub={s.volume === 0 ? 'à l’arrêt' : undefined}
                value={s.volume}
                share={s.part}
                color={COLOR_CONAKRY}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NationalMonthlyTable({ data, loading, year, selectedMonth }: SectionProps & { year: number; selectedMonth: number | null }) {
  const monthly = data?.monthly ?? [];
  const anomalies = monthly.filter((m) => m.ecart !== null && m.ecart !== 0).length;

  return (
    <div className="dashboard-card">
      <div className="card-header-flex">
        <h3>Bilan mensuel national — {year}</h3>
        <span className={`badge-pill ${anomalies ? 'amber' : 'cyan'}`}>
          {anomalies ? `${anomalies} écart${anomalies > 1 ? 's' : ''} à vérifier` : 'Totaux cohérents'}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="dark-table">
          <thead>
            <tr>
              <th>Mois</th>
              <th>Conakry (m³)</th>
              <th>Centres (m³)</th>
              <th>Total villes (m³)</th>
              <th>Total déclaré (m³)</th>
              <th>Eau brute (m³)</th>
              <th>vs {year - 1}</th>
              <th>Contrôle</th>
            </tr>
          </thead>
          <tbody>
            {monthly.length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
                  {loading ? 'Chargement des données…' : 'Aucune donnée pour cet exercice.'}
                </td>
              </tr>
            )}
            {monthly.map((m) => {
              const evo = m.national !== null && m.nationalN1 ? (m.national - m.nationalN1) / m.nationalN1 : null;
              const highlighted = selectedMonth === m.mois;
              return (
                <tr key={m.mois} style={highlighted ? { background: 'rgba(56,189,248,0.08)' } : selectedMonth ? { opacity: 0.6 } : undefined}>
                  <td>
                    <strong style={{ color: 'var(--text-strong)' }}>{MONTHS[m.mois - 1]}</strong>
                  </td>
                  <td>{m.nationalConakry !== null ? num(m.nationalConakry) : '—'}</td>
                  <td>{m.nationalCentres !== null ? num(m.nationalCentres) : '—'}</td>
                  <td style={{ fontWeight: 700, color: '#38bdf8' }}>{m.national !== null ? num(m.national) : '—'}</td>
                  <td>{m.declareEauTraitee !== null ? num(m.declareEauTraitee) : '—'}</td>
                  <td>{m.declareEauBrute !== null ? num(m.declareEauBrute) : '—'}</td>
                  <td style={{ color: evo === null ? 'var(--text-dim)' : evo >= 0 ? '#10b981' : '#f59e0b' }}>
                    {evo === null ? '—' : `${evo >= 0 ? '▲' : '▼'} ${pct1(Math.abs(evo))}`}
                  </td>
                  <td>
                    {m.ecart === null ? (
                      '—'
                    ) : m.ecart === 0 ? (
                      <span className="badge-pill cyan">Cohérent</span>
                    ) : (
                      <span className="badge-pill amber" title="Somme des villes − total déclaré">
                        {m.ecart > 0 ? '+' : ''}
                        {num(m.ecart)} m³
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ===================================================================== */
/* Détail par centre                                                     */
/* ===================================================================== */

type CenterSummary = {
  name: string;
  no: number | null;
  raw: number;
  treated: number;
  gasoil: number;
  closingStock: number | null;
  months: number;
  missing: number;
  yieldRatio: number | null;
  gasoilPer1000: number | null;
};

type SortKey = 'treated' | 'yield' | 'gasoilPer1000' | 'name';

const YIELD_GOOD = 0.9;
const YIELD_WARN = 0.75;

function yieldStatus(ratio: number | null): { label: string; color: string } {
  if (ratio === null) return { label: 'Non calculable', color: '#94a3b8' };
  if (ratio > 1.02) return { label: 'À vérifier (> 100 %)', color: '#a78bfa' };
  if (ratio >= YIELD_GOOD) return { label: 'Bon', color: '#10b981' };
  if (ratio >= YIELD_WARN) return { label: 'À surveiller', color: '#f59e0b' };
  return { label: 'Faible', color: '#ef4444' };
}

function CenterDetailSection({ rows, year, selectedMonth, selectedCenter, onSelectCenter, loading }: {
  rows: TechnicalCenterRow[];
  year: number;
  selectedMonth: number | null;
  selectedCenter: string;
  onSelectCenter: (center: string) => void;
  loading: boolean;
}) {
  const [view, setView] = useState<'summary' | 'monthly'>('summary');
  const [sortKey, setSortKey] = useState<SortKey>('treated');
  const [search, setSearch] = useState('');

  // Lignes de la période (le filtre Centre ne s'applique pas au classement,
  // pour garder la comparaison entre centres ; le centre choisi est mis en avant).
  const periodRows = useMemo(
    () => rows.filter((row) => !selectedMonth || Number(row.period_month.slice(5, 7)) === selectedMonth),
    [rows, selectedMonth]
  );

  const summaries = useMemo<CenterSummary[]>(() => {
    const map = new Map<string, CenterSummary & { lastPeriod: string }>();

    for (const row of periodRows) {
      const name = row.center_name?.trim() || 'Centre non renseigné';
      const current = map.get(name) ?? {
        name,
        no: row.center_no,
        raw: 0,
        treated: 0,
        gasoil: 0,
        closingStock: null,
        months: 0,
        missing: 0,
        yieldRatio: null,
        gasoilPer1000: null,
        lastPeriod: '',
      };

      current.raw += numeric(row.raw_water_m3);
      current.treated += numeric(row.treated_water_m3);
      current.gasoil += numeric(row.gasoil_consumption_l);
      current.months += 1;
      if (row.raw_water_m3 === null && row.treated_water_m3 === null) current.missing += 1;

      // Stock final : celui du dernier mois renseigné.
      if (row.period_month >= current.lastPeriod && row.gasoil_closing_stock_l !== null) {
        current.lastPeriod = row.period_month;
        current.closingStock = numeric(row.gasoil_closing_stock_l);
      }

      map.set(name, current);
    }

    return Array.from(map.values()).map(({ lastPeriod: _ignored, ...c }) => ({
      ...c,
      yieldRatio: c.raw > 0 ? c.treated / c.raw : null,
      gasoilPer1000: c.treated > 0 && c.gasoil > 0 ? (c.gasoil / c.treated) * 1000 : null,
    }));
  }, [periodRows]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = summaries.filter((c) => !term || c.name.toLowerCase().includes(term));
    const value = (c: CenterSummary) =>
      sortKey === 'treated' ? c.treated : sortKey === 'yield' ? c.yieldRatio ?? -1 : c.gasoilPer1000 ?? -1;
    return list.sort((a, b) =>
      sortKey === 'name' ? a.name.localeCompare(b.name, 'fr') : value(b) - value(a)
    );
  }, [summaries, search, sortKey]);

  const maxTreated = summaries.reduce((acc, c) => Math.max(acc, c.treated), 0);
  const withYield = summaries.filter((c) => c.yieldRatio !== null && c.yieldRatio <= 1.02);
  const best = withYield.reduce<CenterSummary | null>((acc, c) => (!acc || (c.yieldRatio ?? 0) > (acc.yieldRatio ?? 0) ? c : acc), null);
  const worst = withYield.reduce<CenterSummary | null>((acc, c) => (!acc || (c.yieldRatio ?? 1) < (acc.yieldRatio ?? 1) ? c : acc), null);
  const lowCount = withYield.filter((c) => (c.yieldRatio ?? 1) < YIELD_WARN).length;
  const top = summaries.reduce<CenterSummary | null>((acc, c) => (!acc || c.treated > acc.treated ? c : acc), null);
  const periodText = selectedMonth ? `${MONTHS[selectedMonth - 1]} ${year}` : `Exercice ${year}`;

  const monthlyRows = periodRows
    .filter((row) => !selectedCenter || row.center_name === selectedCenter)
    .sort((a, b) => a.period_month.localeCompare(b.period_month) || a.center_name.localeCompare(b.center_name, 'fr'));

  const sortButton = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSortKey(key)}
      className={`badge-pill ${sortKey === key ? 'cyan' : ''}`}
      style={{ cursor: 'pointer', border: sortKey === key ? undefined : '1px solid var(--border-color)', background: sortKey === key ? undefined : 'transparent' }}
    >
      {label}
    </button>
  );

  return (
    <div className="dashboard-card" style={{ borderTop: '3px solid #10b981' }}>
      <div className="card-header-flex" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 16 }}>Détail par centre</h3>
          <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
            {summaries.length} centres · {periodText}
            {selectedCenter ? ` · centre sélectionné : ${selectedCenter}` : ' · cliquez sur un centre pour filtrer la page'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`badge-pill ${view === 'summary' ? 'cyan' : ''}`}
            onClick={() => setView('summary')}
            style={{ cursor: 'pointer', border: view === 'summary' ? undefined : '1px solid var(--border-color)', background: view === 'summary' ? undefined : 'transparent' }}
          >
            Synthèse par centre
          </button>
          <button
            type="button"
            className={`badge-pill ${view === 'monthly' ? 'cyan' : ''}`}
            onClick={() => setView('monthly')}
            style={{ cursor: 'pointer', border: view === 'monthly' ? undefined : '1px solid var(--border-color)', background: view === 'monthly' ? undefined : 'transparent' }}
          >
            Détail mensuel
          </button>
        </div>
      </div>

      {/* Faits saillants */}
      {summaries.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, margin: '12px 0' }}>
          <Highlight label="Plus gros producteur" value={top?.name ?? '—'} detail={top ? `${num(top.treated)} m³ traités` : ''} color="#0284c7" />
          <Highlight label="Meilleur rendement" value={best?.name ?? '—'} detail={best?.yieldRatio != null ? pct(best.yieldRatio) : ''} color="#10b981" />
          <Highlight label="Rendement le plus faible" value={worst?.name ?? '—'} detail={worst?.yieldRatio != null ? pct(worst.yieldRatio) : ''} color="#f59e0b" />
          <Highlight label={`Centres sous ${pct(YIELD_WARN)}`} value={String(lowCount)} detail={`sur ${withYield.length} centres mesurés`} color={lowCount ? '#ef4444' : '#10b981'} />
        </div>
      )}

      {view === 'summary' ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un centre…"
              style={{
                background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)',
                borderRadius: 8, padding: '7px 10px', fontSize: 12.5, minWidth: 200,
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>Trier par :</span>
            {sortButton('treated', 'Eau traitée')}
            {sortButton('yield', 'Rendement')}
            {sortButton('gasoilPer1000', 'Gasoil / 1 000 m³')}
            {sortButton('name', 'Nom')}
            {selectedCenter && (
              <button
                type="button"
                onClick={() => onSelectCenter('')}
                className="badge-pill"
                style={{ cursor: 'pointer', marginLeft: 'auto', border: '1px solid var(--border-color)', background: 'transparent' }}
              >
                ✕ Tous les centres
              </button>
            )}
          </div>

          <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
            <table className="dark-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Centre</th>
                  <th style={{ minWidth: 190 }}>Eau traitée (m³)</th>
                  <th>Eau brute (m³)</th>
                  <th>Rendement</th>
                  <th>Gasoil (L)</th>
                  <th title="Litres de gasoil consommés pour 1 000 m³ d'eau traitée">Gasoil / 1 000 m³</th>
                  <th>Stock final (L)</th>
                  <th>Mois</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
                      {loading ? 'Chargement des données…' : 'Aucun centre ne correspond.'}
                    </td>
                  </tr>
                )}
                {visible.map((c, index) => {
                  const status = yieldStatus(c.yieldRatio);
                  const selected = selectedCenter === c.name;
                  return (
                    <tr
                      key={c.name}
                      onClick={() => onSelectCenter(selected ? '' : c.name)}
                      title={selected ? 'Cliquer pour afficher tous les centres' : 'Cliquer pour filtrer la page sur ce centre'}
                      style={{ cursor: 'pointer', background: selected ? 'rgba(56,189,248,0.10)' : undefined }}
                    >
                      <td style={{ color: 'var(--text-dim)' }}>{index + 1}</td>
                      <td>
                        <strong style={{ color: 'var(--text-strong)' }}>{c.name}</strong>
                        {c.no !== null && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}> · n° {c.no}</span>}
                        {c.missing > 0 && (
                          <div style={{ fontSize: 10.5, color: '#f59e0b' }}>{c.missing} mois sans volume</div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 70, height: 6, background: 'rgba(148,163,184,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${maxTreated > 0 ? (c.treated / maxTreated) * 100 : 0}%`, height: '100%', background: '#0284c7', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontWeight: 700, color: 'var(--text-strong)', minWidth: 72, textAlign: 'right' }}>{num(c.treated)}</span>
                        </div>
                      </td>
                      <td>{num(c.raw)}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.color }} />
                          <strong style={{ color: 'var(--text-strong)' }}>{c.yieldRatio !== null ? pct(c.yieldRatio) : '—'}</strong>
                          <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{status.label}</span>
                        </span>
                      </td>
                      <td>{num(c.gasoil)}</td>
                      <td>{c.gasoilPer1000 !== null ? num(c.gasoilPer1000) : '—'}</td>
                      <td>{c.closingStock !== null ? num(c.closingStock) : '—'}</td>
                      <td>{c.months}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 8 }}>
            Rendement = eau traitée ÷ eau brute captée sur la période · Bon ≥ {pct(YIELD_GOOD)} · À surveiller ≥ {pct(YIELD_WARN)} ·
            un rendement supérieur à 100 % signale une saisie à vérifier · Stock final = dernier mois renseigné.
          </div>
        </>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Période</th>
                <th>N° centre</th>
                <th>Centre</th>
                <th>Eau brute (m³)</th>
                <th>Eau traitée (m³)</th>
                <th>Rendement station</th>
                <th>Gasoil consommé (L)</th>
                <th>Stock final (L)</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
                    {loading ? 'Chargement des données…' : 'Aucun relevé ne correspond aux filtres.'}
                  </td>
                </tr>
              )}
              {monthlyRows.map((row) => (
                <tr key={row.id}>
                  <td>{formatMonth(row.period_month)}</td>
                  <td>{row.center_no ?? '—'}</td>
                  <td>
                    <strong style={{ color: 'var(--text-strong)' }}>{row.center_name || 'Centre non renseigné'}</strong>
                  </td>
                  <td>{num(numeric(row.raw_water_m3))}</td>
                  <td>{num(numeric(row.treated_water_m3))}</td>
                  <td>{formatYield(row.station_yield)}</td>
                  <td>{num(numeric(row.gasoil_consumption_l))}</td>
                  <td>{num(numeric(row.gasoil_closing_stock_l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Highlight({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return (
    <div style={{ background: 'rgba(148,163,184,0.05)', border: '1px solid var(--border-color)', borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '9px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginTop: 3 }}>{value}</div>
      {detail && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>{detail}</div>}
    </div>
  );
}
