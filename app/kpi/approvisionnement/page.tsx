'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Truck, RefreshCw, CalendarDays, Package, Building2, ClipboardList,
  TrendingUp, Search, AlertCircle, CheckCircle2, Clock3, Boxes, BarChart3,
  ArrowLeft, Hash, Sigma, Activity
} from 'lucide-react';
import Link from 'next/link';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';

type AnyRow = Record<string, any>;

const COLORS = {
  cyan: '#38bdf8',
  green: '#10b981',
  amber: '#f59e0b',
  purple: '#c084fc',
};

const number = (value: unknown) =>
  Number(String(value ?? 0).replace(/\s/g, '').replace(',', '.')) || 0;

const formatNumber = (value: unknown) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(number(value));

const first = (obj: AnyRow, keys: string[], fallback: unknown = 0) => {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null) return obj[key];
  }
  return fallback;
};

const monthLabel = (value: unknown) => {
  if (!value) return '—';
  const raw = String(value);
  const match = raw.match(/(\d{4})[-/](\d{1,2})/);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
    return new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(date);
  }
  return raw;
};

const selectStyle = {
  background: 'var(--bg-card)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12.5,
  minWidth: 150,
} as const;

const chartTooltip = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: 6,
  fontSize: 11,
  color: '#fff',
};

function KpiCard({ icon, color, title, value, note, accent }: {
  icon: any; color: string; title: string; value: string; note: string; accent: string;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-header">
        <div className="kpi-icon-wrap" style={{ background: `${color}26`, color, border: `1px solid ${color}55` }}>{icon}</div>
        <div className="kpi-title-value">
          <div className="kpi-title">{title}</div>
          <div className="kpi-num-row">
            <span className="kpi-main-val">{value}</span>
          </div>
        </div>
      </div>
      <div className="kpi-foot-row">
        <span className="kpi-trend" style={{ color: accent }}>Synchronisé</span>
        <span className="kpi-period">{note}</span>
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value, color }: {
  icon: any; label: string; value: string; color: string;
}) {
  return (
    <div className="mini-stat" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <span style={{ color, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>{label}</span>
        <b style={{ color }}>{value}</b>
      </div>
    </div>
  );
}

export default function ApprovisionnementPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState('all');
  const [center, setCenter] = useState('all');
  const [dataType, setDataType] = useState('center');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<AnyRow>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ year: String(year), type: dataType });
      if (month !== 'all') params.set('month', month);
      if (center !== 'all') params.set('center', center);
      const response = await fetch(`/api/kpi/approvisionnement?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Impossible de charger les données (HTTP ${response.status}).`);
      }
      setData(payload?.data ?? payload ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue pendant le chargement.');
    } finally {
      setLoading(false);
    }
  }, [year, month, center, dataType]);

  useEffect(() => { void loadData(); }, [loadData]);

  const rows: AnyRow[] = useMemo(() => {
    const candidates = [
      data?.rows, data?.supplies, data?.items, data?.records,
      data?.monthlyRows, data?.approvisionnements, data?.productsData,
    ];
    return candidates.find(Array.isArray) ?? [];
  }, [data]);

  const monthlyRows: AnyRow[] = useMemo(() => {
    const candidates = [data?.monthly, data?.monthlyData, data?.evolution, data?.monthly_summary];
    const source = candidates.find(Array.isArray) ?? [];
    return source.map((row: AnyRow) => ({
      ...row,
      label: monthLabel(first(row, ['period_month', 'month', 'period', 'mois', 'label'])),
      quantity: number(first(row, ['quantity', 'total_quantity', 'qty', 'quantite', 'amount', 'total'])),
    }));
  }, [data]);

  const productRows: AnyRow[] = useMemo(() => {
    const candidates = [data?.products, data?.byProduct, data?.productTotals, data?.quantitiesByProduct];
    const source = candidates.find(Array.isArray) ?? [];
    return source.map((row: AnyRow) => ({
      ...row,
      label: String(first(row, ['product_name', 'product', 'name', 'designation', 'label'], 'Produit')),
      quantity: number(first(row, ['quantity', 'total_quantity', 'qty', 'quantite', 'total'])),
    })).sort((a: AnyRow, b: AnyRow) => b.quantity - a.quantity).slice(0, 8);
  }, [data]);

  const centers: AnyRow[] = useMemo(() => {
    const candidates = [data?.centers, data?.agencies, data?.availableCenters, data?.centres];
    return candidates.find(Array.isArray) ?? [];
  }, [data]);

  const requests: AnyRow[] = useMemo(() => {
    const candidates = [data?.requests, data?.demands, data?.supplyRequests, data?.demandes];
    return candidates.find(Array.isArray) ?? [];
  }, [data]);

  const quantity = number(first(data, ['totalQuantity', 'total_quantity', 'quantity', 'total', 'quantityTotal'], rows.reduce((sum, r) => sum + number(first(r, ['quantity', 'qty', 'quantite', 'total_quantity'])), 0)));
  const productCount = number(first(data, ['productCount', 'productsCount', 'products_count', 'totalProducts'], productRows.length || new Set(rows.map(r => first(r, ['product_id', 'product_name', 'product', 'designation']))).size));
  const centerCount = number(first(data, ['centerCount', 'centersCount', 'centresCount', 'totalCenters'], centers.length || new Set(rows.map(r => first(r, ['center_id', 'center_name', 'center', 'centre']))).size));
  const requestCount = number(first(data, ['requestCount', 'requestsCount', 'totalRequests', 'requests_count'], requests.length));
  const updatedAt = first(data, ['updatedAt', 'updated_at', 'lastUpdated']);

  const filteredRows = rows.filter((row) => {
    const haystack = [
      first(row, ['product_name', 'product', 'designation', 'name'], ''),
      first(row, ['center_name', 'center', 'centre', 'agency_name'], ''),
      first(row, ['unit', 'unite'], ''),
    ].join(' ').toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  // Indicateurs détaillés du périmètre filtré (aucune valeur inventée)
  const detail = useMemo(() => {
    const values = filteredRows.map((r) =>
      number(first(r, ['quantity', 'qty', 'quantite', 'total_quantity']))
    );
    const total = values.reduce((s, v) => s + v, 0);
    const max = values.length ? Math.max(...values) : 0;
    const avg = values.length ? total / values.length : 0;
    const units = new Set(
      filteredRows.map((r) => String(first(r, ['unit', 'unite', 'unit_name'], '—')))
    ).size;
    return { total, max, avg, count: filteredRows.length, units };
  }, [filteredRows]);

  const maxQty = Math.max(...productRows.map((p) => p.quantity), 1);
  const statusCls = loading ? 'loading' : error ? 'error' : 'ok';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} /> Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Approvisionnement</span>
      </div>

      {error && <div className="db-error-banner">{error}. Vérifiez la route API et vos droits d’accès, puis relancez l’actualisation.</div>}

      {/* Subpage header */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2><Truck size={20} style={{ display: 'inline', marginRight: '6px', color: '#38bdf8' }} />Approvisionnement</h2>
          <p>Vue consolidée des produits, des centres et des demandes d’approvisionnement — volumes enregistrés et tendances de l’exercice {year}.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge-pill green">● Pilotage DG</span>
          <button className="btn-brand" style={{ fontSize: '12px', padding: '8px 14px' }} onClick={() => void loadData()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualiser
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="dashboard-filter-bar" style={{ marginBottom: 0 }}>
        <div>
          <span className="filter-label"><CalendarDays size={11} style={{ display: 'inline', marginRight: 4 }} />Exercice</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
            {Array.from({ length: 7 }, (_, i) => currentYear + 1 - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <span className="filter-label">Mois</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={selectStyle}>
            <option value="all">Tous les mois</option>
            {['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'].map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="filter-label"><Building2 size={11} style={{ display: 'inline', marginRight: 4 }} />Centre / agence</span>
          <select value={center} onChange={(e) => setCenter(e.target.value)} style={selectStyle}>
            <option value="all">Tous les centres</option>
            {centers.map((c, i) => {
              const id = first(c, ['center_id', 'id', 'center_no', 'code'], i);
              const label = first(c, ['center_name', 'name', 'label', 'centre', 'agency_name'], `Centre ${i + 1}`);
              return <option key={String(id)} value={String(id)}>{String(label)}</option>;
            })}
          </select>
        </div>
        <div>
          <span className="filter-label">Indicateur affiché</span>
          <select value={dataType} onChange={(e) => setDataType(e.target.value)} style={selectStyle}>
            <option value="center">Données par centre</option>
            <option value="product">Données par produit</option>
            <option value="monthly">Évolution mensuelle</option>
          </select>
        </div>
        <div className={`db-status ${statusCls}`}>
          <span />
          {loading ? 'Actualisation…' : error ? 'Source indisponible' : 'Données synchronisées'}
        </div>
      </div>

      {/* KPI */}
      <div className="subpage-kpi-grid">
        <KpiCard icon={<Package size={20} />} color={COLORS.cyan} accent={COLORS.cyan} title="Quantité enregistrée" value={formatNumber(quantity)} note={`Exercice ${year}`} />
        <KpiCard icon={<Boxes size={20} />} color={COLORS.green} accent={COLORS.green} title="Produits référencés" value={formatNumber(productCount)} note="Produits distincts" />
        <KpiCard icon={<Building2 size={20} />} color={COLORS.amber} accent={COLORS.amber} title="Centres disponibles" value={formatNumber(centerCount)} note="Centres identifiés" />
        <KpiCard icon={<ClipboardList size={20} />} color={COLORS.purple} accent={COLORS.purple} title="Demandes enregistrées" value={formatNumber(requestCount)} note="Demandes recensées" />
      </div>

      {/* Graphiques */}
      <div className="two-col-grid">
        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3><TrendingUp size={14} style={{ display: 'inline', marginRight: 6, color: '#38bdf8' }} />Évolution mensuelle</h3>
            <span className="badge-pill cyan">Quantités · unités confondues</span>
          </div>
          {monthlyRows.length ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyRows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="approArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" stroke="#556c84" fontSize={10} tickLine={false} axisLine={{ stroke: '#172c47' }} />
                  <YAxis stroke="#556c84" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={chartTooltip} formatter={(v: any) => [formatNumber(v), 'Quantité']} />
                  <Area type="monotone" dataKey="quantity" stroke="#38bdf8" strokeWidth={2.5} fill="url(#approArea)" activeDot={{ r: 5, fill: '#38bdf8', stroke: '#0b1928', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ color: 'var(--text-dim)', padding: '24px', textAlign: 'center', fontSize: 12.5 }}>
              <BarChart3 size={26} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.6 }} />
              {loading ? 'Chargement des données mensuelles…' : 'Aucune série mensuelle disponible pour les filtres sélectionnés.'}
            </div>
          )}
        </div>

        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3><Package size={14} style={{ display: 'inline', marginRight: 6, color: '#10b981' }} />Quantités par produit</h3>
            <span className="badge-pill green">Top {productRows.length || 0}</span>
          </div>
          {productRows.length ? (
            <div className="perf-list">
              {productRows.map((p, i) => (
                <div className="perf-row" key={`${p.label}-${i}`}>
                  <div className="perf-top">
                    <span className="name">{p.label}</span>
                    <span className="val">{formatNumber(p.quantity)}</span>
                  </div>
                  <div className="perf-bar-bg">
                    <div className="perf-bar-fill" style={{ width: `${Math.max(2, (p.quantity / maxQty) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-dim)', padding: '24px', textAlign: 'center', fontSize: 12.5 }}>
              <Boxes size={26} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.6 }} />
              {loading ? 'Chargement des produits…' : 'Aucune donnée détaillée par produit disponible.'}
            </div>
          )}
        </div>
      </div>

      {/* Détail des approvisionnements — enrichi */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3><Truck size={14} style={{ display: 'inline', marginRight: 6, color: '#38bdf8' }} />Détail des approvisionnements</h3>
          <span className="badge-pill cyan">{detail.count} ligne(s) · {formatNumber(detail.units)} unité(s)</span>
        </div>

        {/* Indicateurs synthétiques */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
          <MiniStat icon={<Hash size={16} />} label="Lignes affichées" value={formatNumber(detail.count)} color={COLORS.cyan} />
          <MiniStat icon={<Sigma size={16} />} label="Quantité totale filtrée" value={formatNumber(detail.total)} color={COLORS.green} />
          <MiniStat icon={<Activity size={16} />} label="Moyenne / ligne" value={formatNumber(detail.avg)} color={COLORS.amber} />
          <MiniStat icon={<TrendingUp size={16} />} label="Quantité max (ligne)" value={formatNumber(detail.max)} color={COLORS.purple} />
        </div>

        <div className="users-search" style={{ maxWidth: 380, marginBottom: 14 }}>
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit ou un centre…"
            aria-label="Rechercher un produit ou un centre"
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th style={{ width: 42 }}>Rang</th>
                <th>Produit / désignation</th>
                <th>Centre / agence</th>
                <th>Période</th>
                <th style={{ textAlign: 'right' }}>Quantité</th>
                <th style={{ minWidth: 190 }}>Part du périmètre</th>
                <th>Unité</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 100).map((row, i) => {
                const qty = number(first(row, ['quantity', 'qty', 'quantite', 'total_quantity']));
                const share = detail.total > 0 ? (qty / detail.total) * 100 : 0;
                const barW = detail.max > 0 ? (qty / detail.max) * 100 : 0;
                return (
                  <tr key={String(first(row, ['id', 'reference', 'ref'], i))}>
                    <td style={{ color: 'var(--text-dim)', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{String(first(row, ['product_name', 'product', 'designation', 'name'], 'Produit non précisé'))}</td>
                    <td>{String(first(row, ['center_name', 'center', 'centre', 'agency_name'], '—'))}</td>
                    <td>{String(first(row, ['period_month', 'month', 'period', 'date'], '—'))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>{formatNumber(qty)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="perf-bar-bg" style={{ flex: 1, minWidth: 90 }}>
                          <div className="perf-bar-fill" style={{ width: `${Math.max(2, barW)}%` }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 42, textAlign: 'right' }}>{share.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td><span className="badge-pill cyan">{String(first(row, ['unit', 'unite', 'unit_name'], '—'))}</span></td>
                  </tr>
                );
              })}
              {!filteredRows.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>
                    {loading
                      ? 'Chargement des lignes…'
                      : rows.length
                        ? 'Aucun résultat pour cette recherche.'
                        : 'Aucune ligne détaillée n’a été renvoyée par l’API. Les indicateurs ci-dessus restent liés aux données disponibles.'}
                  </td>
                </tr>
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td colSpan={4} style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Total du périmètre filtré</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#10b981' }}>{formatNumber(detail.total)}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>100% · max ligne {formatNumber(detail.max)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Note bas de page */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', color: 'var(--text-dim)', fontSize: 11, padding: '0 3px' }}>
        <span><Clock3 size={12} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />{updatedAt ? `Dernière mise à jour : ${String(updatedAt)}` : 'Données présentées selon la dernière réponse disponible de la source.'}</span>
        <span>SEG CONNECT · Tableau de pilotage de la Direction Générale</span>
      </div>

      {!error && (
        <div className="dark-alert-box info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
            <CheckCircle2 size={16} /> <span>Suivi opérationnel — Approvisionnement</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {formatNumber(detail.count)} ligne(s) pour un volume filtré de {formatNumber(detail.total)} (moyenne {formatNumber(detail.avg)} / ligne). Périmètre : exercice {year}{month !== 'all' ? ` · mois ${month}` : ''}{center !== 'all' ? ` · centre ${center}` : ' · tous centres'} · indicateur {dataType === 'center' ? 'par centre' : dataType === 'product' ? 'par produit' : 'évolution mensuelle'}.
          </p>
        </div>
      )}
    </div>
  );
}
