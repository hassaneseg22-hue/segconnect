'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Users,
  Droplets,
  Receipt,
  Banknote,
  Building2,
  RefreshCw,
  TrendingUp,
  CalendarDays,
  Layers,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { num, gnf } from '@/lib/format';

type Totals = {
  subscribers: number;
  subscribersListed: number;
  volumeConsumed: number;
  volumeBilled: number;
  revenueHT: number;
  revenue: number;
  revenueTTC: number;
  centersCount: number;
  categoriesCount: number;
  rowsCount: number;
};

type Center = {
  name: string;
  subscribers: number;
  subscribersListed: number;
  volumeConsumed: number;
  volumeBilled: number;
  revenueHT: number;
  revenue: number;
  revenueTTC: number;
  rows: number;
};

type Category = {
  name: string;
  subscribers: number;
  volumeConsumed: number;
  volumeBilled: number;
  revenueHT: number;
  revenueTTC: number;
  rows: number;
};

type Monthly = {
  month: number;
  monthName: string;
  subscribersBilled: number;
  volumeConsumed: number;
  volumeBilled: number;
  revenueHT: number;
  revenueTTC: number;
  rows: number;
};

type FilterOption = {
  value: number;
  label: string;
};

type DashboardData = {
  year: number;
  selectedMonth: number | null;
  latestMonth: number;
  latestMonthName: string | null;
  rowsCount: number;
  kpis: Totals;
  monthly: Monthly[];
  centers: Center[];
  categories: Category[];
  filters: {
    months: FilterOption[];
    categories: string[];
    centers: string[];
  };
};

const YEARS = [2025, 2026, 2027];

const chartTooltip = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: 6,
  fontSize: 11,
  color: '#fff',
};

function compactGNF(value: number) {
  const amount = Number(value) || 0;
  const abs = Math.abs(amount);

  if (abs >= 1_000_000_000) {
    return (
      (amount / 1_000_000_000).toLocaleString('fr-FR', {
        maximumFractionDigits: 2,
      }) + ' Md GNF'
    );
  }

  if (abs >= 1_000_000) {
    return (
      (amount / 1_000_000).toLocaleString('fr-FR', {
        maximumFractionDigits: 2,
      }) + ' M GNF'
    );
  }

  return gnf(amount);
}

function formatNumber(value: number) {
  return num(Number(value) || 0);
}

function emptyData(year: number): DashboardData {
  return {
    year,
    selectedMonth: null,
    latestMonth: 0,
    latestMonthName: null,
    rowsCount: 0,
    kpis: {
      subscribers: 0,
      subscribersListed: 0,
      volumeConsumed: 0,
      volumeBilled: 0,
      revenueHT: 0,
      revenue: 0,
      revenueTTC: 0,
      centersCount: 0,
      categoriesCount: 0,
      rowsCount: 0,
    },
    monthly: [],
    centers: [],
    categories: [],
    filters: {
      months: [],
      categories: [],
      centers: [],
    },
  };
}

export default function CommercialPage() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('');
  const [center, setCenter] = useState('');

  const [data, setData] = useState<DashboardData>(emptyData(2026));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          year: String(year),
        });

        if (month) params.set('month', month);
        if (category) params.set('category', category);
        if (center) params.set('center', center);

        const response = await fetch(
          `/api/kpi/facturation-centres?${params.toString()}`,
          {
            method: 'GET',
            cache: 'no-store',
            signal,
          }
        );

        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(result.error || 'Impossible de charger les données.');
        }

        setData(result.data as DashboardData);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        console.error('[Commercial] Erreur de chargement:', err);

        setError(
          err instanceof Error
            ? err.message
            : 'Une erreur est survenue pendant le chargement.'
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [year, month, category, center]
  );

  useEffect(() => {
    const controller = new AbortController();

    loadData(controller.signal);

    return () => controller.abort();
  }, [loadData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedYear = Number(params.get('year'));
    const requestedCategory = params.get('clientType');

    if (YEARS.includes(requestedYear)) {
      setYear(requestedYear);
    }

    if (requestedCategory) {
      setCategory(requestedCategory);
    }
  }, []);

  const kpis = data.kpis;
  const hasData = data.rowsCount > 0;
  const statusCls = loading ? 'loading' : error ? 'error' : hasData ? 'ok' : 'ok';

  const monthlyChart = useMemo(
    () =>
      data.monthly.map((item) => ({
        mois: item.monthName,
        ca: Number(item.revenueTTC) || 0,
      })),
    [data.monthly]
  );

  const centersMax = useMemo(
    () => Math.max(...data.centers.map((c) => Number(c.revenueTTC) || 0), 1),
    [data.centers]
  );

  const categoriesMax = useMemo(
    () => Math.max(...data.categories.map((c) => Number(c.revenueTTC) || 0), 1),
    [data.categories]
  );

  const centersTotal = useMemo(
    () => data.centers.reduce((s, c) => s + (Number(c.revenueTTC) || 0), 0),
    [data.centers]
  );

  const categoriesTotal = useMemo(
    () => data.categories.reduce((s, c) => s + (Number(c.revenueTTC) || 0), 0),
    [data.categories]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
          <ArrowLeft size={15} /> Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Direction Commerciale & Clientèle</span>
        <span className="badge-pill green" style={{ marginLeft: 8 }}>● Données synchronisées</span>
      </div>

      {/* En-tête */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2><Users size={20} style={{ display: 'inline', marginRight: '6px', color: '#38bdf8' }} />Direction Commerciale & Clientèle</h2>
          <p>Suivi de la facturation, des abonnés, des volumes et du chiffre d’affaires — exercice {year}.</p>
        </div>
        <button className="btn-brand" style={{ fontSize: '12px', padding: '8px 14px' }} type="button" onClick={() => loadData()} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> Actualiser
        </button>
      </div>

      {/* Filtres */}
      <div className="dashboard-filter-bar" style={{ marginBottom: 0 }}>
        <div>
          <span className="filter-label"><CalendarDays size={11} style={{ display: 'inline', marginRight: 4 }} />Exercice</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
            {YEARS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div>
          <span className="filter-label">Mois</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={selectStyle}>
            <option value="">Toute la période</option>
            {data.filters.months.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div>
          <span className="filter-label">Catégorie de clientèle</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
            <option value="">Toutes les catégories</option>
            {data.filters.categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <span className="filter-label"><Building2 size={11} style={{ display: 'inline', marginRight: 4 }} />Centre / agence source</span>
          <select value={center} onChange={(e) => setCenter(e.target.value)} style={selectStyle}>
            <option value="">Tous les centres</option>
            {data.filters.centers.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className={`db-status ${statusCls}`}>
          <span />
          {loading ? 'Actualisation…' : error ? 'Source indisponible' : `${formatNumber(data.rowsCount)} lignes`}
        </div>
      </div>

      {/* Erreur */}
      {error && <div className="db-error-banner">{error}</div>}

      {/* Note source */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
        <span className="badge-pill cyan">Source · Supabase</span>
        <span>seg_facturation_centres_mensuelle</span>
        {data.latestMonthName && !month && (
          <span>· Abonnés calculés sur le dernier mois disponible : <strong style={{ color: 'var(--text-secondary)' }}>{data.latestMonthName}</strong></span>
        )}
      </div>

      {/* Indicateurs principaux */}
      <div className="subpage-kpi-grid">
        <KpiCard
          icon={<Users size={20} />}
          title="Abonnés facturés"
          value={formatNumber(kpis.subscribers)}
          unit="abonnés"
          color="#38bdf8"
          description={month ? 'Mois sélectionné' : `Dernier mois : ${data.latestMonthName ?? '—'}`}
        />
        <KpiCard
          icon={<Droplets size={20} />}
          title="Volume consommé"
          value={formatNumber(kpis.volumeConsumed)}
          unit="m³"
          color="#10b981"
          description="Cumul de la période filtrée"
        />
        <KpiCard
          icon={<Receipt size={20} />}
          title="Volume facturé"
          value={formatNumber(kpis.volumeBilled)}
          unit="m³"
          color="#f59e0b"
          description="Volume total facturé"
        />
        <KpiCard
          icon={<Banknote size={20} />}
          title="Chiffre d’affaires TTC"
          value={compactGNF(kpis.revenueTTC)}
          unit=""
          color="#c084fc"
          description="Facturation TTC cumulée"
        />
      </div>

      {/* Indicateurs secondaires */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        <MiniStat icon={<Banknote size={16} />} title="Chiffre d’affaires HT" value={compactGNF(kpis.revenueHT)} color="#38bdf8" />
        <MiniStat icon={<Building2 size={16} />} title="Centres / noms sources" value={formatNumber(kpis.centersCount)} color="#10b981" />
        <MiniStat icon={<Layers size={16} />} title="Catégories présentes" value={formatNumber(kpis.categoriesCount)} color="#f59e0b" />
        <MiniStat icon={<CalendarDays size={16} />} title="Lignes exploitées" value={formatNumber(kpis.rowsCount)} color="#c084fc" />
      </div>

      {/* Évolution mensuelle */}
      <section className="dashboard-card">
        <div className="card-header-flex">
          <h3><TrendingUp size={14} style={{ display: 'inline', marginRight: 6, color: '#10b981' }} />Évolution mensuelle de la facturation</h3>
          <span className="badge-pill green">Exercice {year}</span>
        </div>

        {monthlyChart.length > 0 && (
          <div style={{ width: '100%', height: 240, marginBottom: 18 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="mois" stroke="#556c84" fontSize={10} tickLine={false} axisLine={{ stroke: '#172c47' }} />
                <YAxis stroke="#556c84" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}M`} />
                <Tooltip contentStyle={chartTooltip} formatter={(v: any) => [compactGNF(Number(v)), 'CA TTC']} cursor={{ fill: 'rgba(56,189,248,0.06)' }} />
                <Bar dataKey="ca" name="CA TTC" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Mois</th>
                <th>Abonnés facturés</th>
                <th>Volume consommé</th>
                <th>Volume facturé</th>
                <th>Chiffre d’affaires HT</th>
                <th>Chiffre d’affaires TTC</th>
              </tr>
            </thead>
            <tbody>
              {data.monthly.length === 0 ? (
                <EmptyRow colSpan={6} text={loading ? 'Chargement des données…' : 'Aucune donnée pour cette période.'} />
              ) : (
                data.monthly.map((item) => (
                  <tr key={item.month}>
                    <td style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{item.monthName}</td>
                    <td>{formatNumber(item.subscribersBilled)}</td>
                    <td>{formatNumber(item.volumeConsumed)} m³</td>
                    <td style={{ color: '#f59e0b', fontWeight: 600 }}>{formatNumber(item.volumeBilled)} m³</td>
                    <td>{compactGNF(item.revenueHT)}</td>
                    <td style={{ fontWeight: 700, color: '#10b981' }}>{compactGNF(item.revenueTTC)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {data.monthly.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td colSpan={2} style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>TOTAL DE LA PÉRIODE</td>
                  <td>{formatNumber(kpis.volumeConsumed)} m³</td>
                  <td style={{ fontWeight: 700, color: '#f59e0b' }}>{formatNumber(kpis.volumeBilled)} m³</td>
                  <td style={{ fontWeight: 700 }}>{compactGNF(kpis.revenueHT)}</td>
                  <td style={{ fontWeight: 800, color: '#10b981' }}>{compactGNF(kpis.revenueTTC)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Répartition par centre */}
      <section className="dashboard-card">
        <div className="card-header-flex">
          <h3><Building2 size={14} style={{ display: 'inline', marginRight: 6, color: '#38bdf8' }} />Performance par centre / agence source</h3>
          <span className="badge-pill cyan">{data.centers.length} centres</span>
        </div>

        <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: 12 }}>
          Les noms ci-dessous proviennent du fichier de facturation. Ils ne sont pas automatiquement assimilés au référentiel administratif des agences SEG.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Centre / agence source</th>
                <th>Abonnés facturés</th>
                <th>Volume facturé</th>
                <th style={{ minWidth: 170 }}>Part CA TTC</th>
                <th>Chiffre d’affaires HT</th>
                <th>Chiffre d’affaires TTC</th>
              </tr>
            </thead>
            <tbody>
              {data.centers.length === 0 ? (
                <EmptyRow colSpan={7} text={loading ? 'Chargement des données…' : 'Aucun centre pour cette sélection.'} />
              ) : (
                data.centers.map((item, i) => {
                  const rev = Number(item.revenueTTC) || 0;
                  const share = centersTotal > 0 ? (rev / centersTotal) * 100 : 0;
                  const barW = (rev / centersMax) * 100;
                  return (
                    <tr key={item.name}>
                      <td style={{ color: 'var(--text-dim)', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{item.name}</td>
                      <td>{formatNumber(item.subscribers)}</td>
                      <td style={{ color: '#f59e0b', fontWeight: 600 }}>{formatNumber(item.volumeBilled)} m³</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="perf-bar-bg" style={{ flex: 1, minWidth: 80 }}>
                            <div className="perf-bar-fill" style={{ width: `${Math.max(2, barW)}%` }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 42, textAlign: 'right' }}>{share.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td>{compactGNF(item.revenueHT)}</td>
                      <td style={{ fontWeight: 700, color: '#10b981' }}>{compactGNF(item.revenueTTC)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {data.centers.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td colSpan={5} style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>TOTAL — {data.centers.length} centres</td>
                  <td style={{ fontWeight: 700 }}>{compactGNF(kpis.revenueHT)}</td>
                  <td style={{ fontWeight: 800, color: '#10b981' }}>{compactGNF(kpis.revenueTTC)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Segmentation commerciale */}
      <section className="dashboard-card">
        <div className="card-header-flex">
          <h3><Layers size={14} style={{ display: 'inline', marginRight: 6, color: '#c084fc' }} />Répartition par catégorie de clientèle</h3>
          <span className="badge-pill purple">{data.categories.length} catégories</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Abonnés facturés</th>
                <th>Volume facturé</th>
                <th style={{ minWidth: 170 }}>Part CA TTC</th>
                <th>Chiffre d’affaires HT</th>
                <th>Chiffre d’affaires TTC</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.length === 0 ? (
                <EmptyRow colSpan={6} text={loading ? 'Chargement des données…' : 'Aucune catégorie pour cette sélection.'} />
              ) : (
                data.categories.map((item) => {
                  const rev = Number(item.revenueTTC) || 0;
                  const share = categoriesTotal > 0 ? (rev / categoriesTotal) * 100 : 0;
                  const barW = (rev / categoriesMax) * 100;
                  return (
                    <tr key={item.name}>
                      <td style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{item.name}</td>
                      <td>{formatNumber(item.subscribers)}</td>
                      <td style={{ color: '#f59e0b', fontWeight: 600 }}>{formatNumber(item.volumeBilled)} m³</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="perf-bar-bg" style={{ flex: 1, minWidth: 80 }}>
                            <div className="perf-bar-fill" style={{ width: `${Math.max(2, barW)}%`, background: 'linear-gradient(90deg, #7c3aed 0%, #c084fc 100%)' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 42, textAlign: 'right' }}>{share.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td>{compactGNF(item.revenueHT)}</td>
                      <td style={{ fontWeight: 700, color: '#10b981' }}>{compactGNF(item.revenueTTC)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {data.categories.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td colSpan={4} style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>TOTAL — {data.categories.length} catégories</td>
                  <td style={{ fontWeight: 700 }}>{compactGNF(kpis.revenueHT)}</td>
                  <td style={{ fontWeight: 800, color: '#10b981' }}>{compactGNF(kpis.revenueTTC)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  title,
  value,
  unit,
  color,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  unit: string;
  color: string;
  description: string;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-header">
        <div className="kpi-icon-wrap" style={{ background: `${color}26`, color, border: `1px solid ${color}55` }}>
          {icon}
        </div>
        <div className="kpi-title-value" style={{ minWidth: 0 }}>
          <div className="kpi-title">{title}</div>
          <div className="kpi-num-row" style={{ flexWrap: 'wrap' }}>
            <span className="kpi-main-val" style={{ fontSize: 19, overflowWrap: 'anywhere' }}>{value}</span>
            {unit && <span className="kpi-total-val">{unit}</span>}
          </div>
        </div>
      </div>
      <div className="kpi-foot-row">
        <span className="kpi-trend positive">Synchronisé</span>
        <span className="kpi-period">{description}</span>
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  title,
  value,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div className="mini-stat" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <span style={{ color, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span>{title}</span>
        <b style={{ color, overflowWrap: 'anywhere' }}>{value}</b>
      </div>
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 24 }}>
        {text}
      </td>
    </tr>
  );
}

const selectStyle: React.CSSProperties = {
  minWidth: 150,
  maxWidth: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid var(--border-color, #334155)',
  background: 'var(--card-bg, #101b2a)',
  color: 'var(--text-strong, #e2e8f0)',
};
