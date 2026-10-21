'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Droplets,
  Waves,
  Receipt,
  Banknote,
  Wallet,
  AlertTriangle,
  ArrowLeft,
  TrendingUp,
  Activity,
  MapPin,
  Target,
  Gauge,
  RefreshCw,
  Trophy,
  ChevronRight,
  CheckCircle2,
  CloudOff
} from 'lucide-react';
import Link from 'next/link';
import { num, gnf, pct } from '@/lib/format';
import { useClientTypes } from '@/lib/use-overview';
import { guineaRegions } from '@/lib/guinea-map-data';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  LineChart,
  Line
} from 'recharts';

type Overview = any;

function gnfCompact(value: number) {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md GNF`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M GNF`;
  return gnf(value);
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

function statusOf(value: number, ok: number, warn: number) {
  if (value >= ok) return { dot: '🟢', color: '#10b981', label: 'Performance normale' };
  if (value >= warn) return { dot: '🟠', color: '#f59e0b', label: 'Attention' };
  return { dot: '🔴', color: '#ef4444', label: 'Situation critique' };
}

export default function VueNationalePage() {
  const clientTypes = useClientTypes();
  const [year, setYear] = useState(2026);
  const [compareYear, setCompareYear] = useState(2025);
  const [clientType, setClientType] = useState('');
  const [metric, setMetric] = useState<'production' | 'consumption' | 'billing' | 'ca' | 'recovery' | 'yield'>('production');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cur, setCur] = useState<Overview>(null);
  const [prev, setPrev] = useState<Overview>(null);

  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [activeDrill, setActiveDrill] = useState<{ level: string; name: string } | null>(null);
  const [sortKey, setSortKey] = useState<'performance' | 'production' | 'recovery' | 'yield' | 'ca'>('performance');

  // Load both years in parallel
  useEffect(() => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    setLoading(true);
    setError('');
    const p1 = fetch(`/api/overview?year=${year}${clientType ? `&clientType=${encodeURIComponent(clientType)}` : ''}`, { signal: c1.signal, cache: 'no-store' }).then(r => r.json());
    const p2 = fetch(`/api/overview?year=${compareYear}${clientType ? `&clientType=${encodeURIComponent(clientType)}` : ''}`, { signal: c2.signal, cache: 'no-store' }).then(r => r.json());
    Promise.all([p1, p2])
      .then(([j1, j2]) => {
        if (!j1.ok) throw new Error(j1.error || 'Connexion MySQL impossible');
        if (!j2.ok) throw new Error(j2.error || 'Connexion MySQL impossible');
        setCur(j1.data);
        setPrev(j2.data);
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => setLoading(false));
    return () => { c1.abort(); c2.abort(); };
  }, [year, compareYear, clientType]);

  const k = cur?.kpis || {};
  const pk = prev?.kpis || {};

  // ---- 6 national KPIs ----
  // v11 : évolutions sur les mêmes mois (cur.compare), et non sur l'année N-1 complète.
  const cmp = cur?.compare || { production: 0, consumption: 0, billing: 0 };
  const natKpis = useMemo(() => {
    const evo = (c: number, p: number) => {
      if (!c && !p) return 0;
      if (!p) return 100;
      return ((c - p) / Math.abs(p)) * 100;
    };
    return [
      { key: 'production', icon: Droplets, title: 'Production', value: `${num(k.production || 0)} m³`, evo: evo(k.production, cmp.production), color: '#06b6d4', unit: 'm³', ok: 0, warn: 0 },
      { key: 'consumption', icon: Waves, title: 'Consommation', value: `${num(k.volumeConsumed || 0)} m³`, evo: evo(k.volumeConsumed, pk.volumeConsumed), color: '#0284c7', unit: 'm³', ok: 0, warn: 0 },
      { key: 'billing', icon: Receipt, title: 'Facturé', value: `${num(k.volumeBilled || 0)} m³`, evo: evo(k.volumeBilled, cmp.billing), color: '#10b981', unit: 'm³', ok: 0, warn: 0 },
      { key: 'ca', icon: Banknote, title: 'Chiffre d’affaires', value: gnfCompact(k.revenue || 0), evo: evo(k.revenue, pk.revenue), color: '#9333ea', unit: 'GNF', ok: 0, warn: 0 },
      { key: 'encaissé', icon: Wallet, title: 'Encaissé', value: gnfCompact(k.paid || 0), evo: evo(k.paid, pk.paid), color: '#059669', unit: 'GNF', ok: 0, warn: 0 },
      { key: 'impayés', icon: AlertTriangle, title: 'Impayés', value: gnfCompact(k.balance || 0), evo: evo(k.balance, pk.balance), color: '#ef4444', unit: 'GNF', ok: 0, warn: 0 }
    ];
  }, [k, pk]);

  // ---- Evolution chart data ----
  const evoData = useMemo(() => {
    const rows = (cur?.monthly || []).map((m: any, i: number) => ({
      mois: MONTHS[i % 12],
      production: Number(m.production) || 0,
      consumption: Number(m.consumption) || 0,
      billing: Number(m.billing_volume) || 0
    }));
    return rows;
  }, [cur]);

  const evoValue = (row: any) => {
    switch (metric) {
      case 'production': return row.production;
      case 'consumption': return row.consumption;
      case 'billing': return row.billing;
      default: return 0;
    }
  };

  // ---- Regional performance (static geo data) ----
  const regionsCtx = useMemo(() => {
    return guineaRegions.map((r) => {
      const rec = parseFloat(String(r.recovery).replace('%', '').replace(',', '.')) / 100 || 0;
      const prodNum = parseFloat(String(r.production).replace(/[^\d.]/g, '')) || 0;
      const status = statusOf(rec, 0.85, 0.78);
      return {
        id: r.id,
        name: r.name,
        naturalRegion: r.naturalRegion,
        prefectures: r.prefectures,
        subscribers: r.subscribers,
        production: prodNum,
        recovery: rec,
        yield: Math.min(1, prodNum * 0.06),
        billed: Math.round(r.subscribers * 42),
        ca: Math.round(r.subscribers * 4500),
        centers: r.centers,
        path: r.path,
        centroid: r.centroid,
        color: r.color,
        status
      };
    });
  }, []);

  const sortedRegions = useMemo(() => {
    const arr = [...regionsCtx];
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'production': return b.production - a.production;
        case 'recovery': return b.recovery - a.recovery;
        case 'yield': return b.yield - a.yield;
        case 'ca': return b.ca - a.ca;
        default: return statusRank(b.recovery) - statusRank(a.recovery);
      }
    });
    function statusRank(v: number) { if (v >= 0.85) return 3; if (v >= 0.78) return 2; return 1; }
    return arr;
  }, [regionsCtx, sortKey]);

  // ---- Alerts ----
  const alerts = useMemo(() => {
    const list: { sev: 'high' | 'med' | 'good'; text: string }[] = [];
    const critical = regionsCtx.filter(r => r.recovery < 0.78);
    const warn = regionsCtx.filter(r => r.recovery >= 0.78 && r.recovery < 0.85);
    critical.forEach(r => list.push({ sev: 'high', text: `${r.name} : rendement/recouvrement critique (${pct(r.recovery)})` }));
    warn.forEach(r => list.push({ sev: 'med', text: `${r.name} : recouvrement en dessous de la cible (${pct(r.recovery)})` }));
    const improving = regionsCtx.filter(r => r.recovery >= 0.85);
    improving.slice(0, 3).forEach(r => list.push({ sev: 'good', text: `${r.name} : recouvrement sous contrôle (${pct(r.recovery)})` }));
    return list;
  }, [regionsCtx]);

  // ---- Objectives ----
  const objectives = [
    { label: 'Recouvrement', value: k.recovery || 0, target: 0.9, color: '#059669' },
    { label: 'Rendement réseau', value: k.networkYield || 0, target: 0.8, color: '#06b6d4' },
    { label: 'Facturation', value: k.billingRatio || 0, target: 0.95, color: '#10b981' }
  ];

  // ---- Comparison rows ----
  const comparison = [
    { indicator: 'Production d’eau', c: k.production || 0, p: pk.production || 0, fmt: (v: number) => `${num(v)} m³` },
    { indicator: 'Volume facturé', c: k.volumeBilled || 0, p: pk.volumeBilled || 0, fmt: (v: number) => `${num(v)} m³` },
    { indicator: 'Chiffre d’affaires', c: k.revenue || 0, p: pk.revenue || 0, fmt: gnfCompact },
    { indicator: 'Encaissé', c: k.paid || 0, p: pk.paid || 0, fmt: gnfCompact },
    { indicator: 'Impayés', c: k.balance || 0, p: pk.balance || 0, fmt: gnfCompact },
    { indicator: 'Recouvrement', c: k.recovery || 0, p: pk.recovery || 0, fmt: pct, isPct: true }
  ];

  const drillLevels = (() => {
    if (!activeRegion) return null;
    const region = regionsCtx.find(r => r.id === activeRegion);
    if (!region) return null;
    if (!activeDrill) return { level: 'région', name: region.name, detail: `Région : ${region.naturalRegion} · ${region.centers} centres` };
    if (activeDrill.level === 'région') return { level: 'préfecture', name: activeDrill.name, detail: `${activeDrill.name} — ${region.name}` };
    return { level: 'agence', name: activeDrill.name, detail: `Agence de ${activeDrill.name}` };
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} />
          Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Vue Nationale</span>
      </div>

      {/* En-tête + filtres globaux */}
      <div className="subpage-header">
        <div className="subpage-title">
          <h2 style={{ fontSize: '24px' }}>Vue Nationale</h2>
          <p>Situation globale du service d'eau en Guinée — d'où viennent les écarts et où agir ?</p>
        </div>
        <div className="dashboard-filter-bar" style={{ margin: 0, alignItems: 'center', alignSelf: 'flex-end' }}>
          <div style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <span className="filter-label" style={{ marginBottom: 0 }}>Période</span>
            <select className="select-dark" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              <option value={2026}>Jan → Jun 2026</option>
              <option value={2025}>Jan → Jun 2025</option>
            </select>
          </div>
          <div style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <span className="filter-label" style={{ marginBottom: 0 }}>Comparer</span>
            <select className="select-dark" value={compareYear} onChange={(e) => setCompareYear(Number(e.target.value))}>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
          <div style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <span className="filter-label" style={{ marginBottom: 0 }}>Segment</span>
            <select className="select-dark" value={clientType} onChange={(e) => setClientType(e.target.value)}>
              <option value="">Tous</option>
              {clientTypes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className={`db-status ${loading ? 'loading' : error ? 'error' : 'ok'}`}>
            <span />
            {loading ? 'Actualisation…' : error ? 'MySQL indisponible' : 'Données synchronisées'}
          </div>
          <button
            className="btn-brand"
            style={{ fontSize: '11.5px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={13} />
            Actualiser
          </button>
        </div>
      </div>
      {clientType && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge-pill cyan">Segment : {clientType}</span>
          <span className="badge-pill purple">Exercice principal : {year}</span>
          <span className="badge-pill purple">Base de comparaison : {compareYear}</span>
        </div>
      )}
      {error && <div className="db-error-banner">{error}. Démarre MySQL dans XAMPP puis recharge la page.</div>}

      {/* 0. Périmètres : Grand Conakry + intérieur (ajout v11) */}
      {cur?.zones && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div className="dashboard-card">
            <div className="card-header-flex">
              <h3>Grand Conakry</h3>
              <span className="badge-pill cyan">{cur.zones.grandConakry.mois.length} mois · {cur.zones.grandConakry.agences} agences</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, padding: '6px 2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Volume distribué (VD)</span><strong>{num(cur.zones.grandConakry.volumeDistribue)} m³</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Volume facturé</span><strong>{num(cur.zones.grandConakry.volumeFacture)} m³</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Chiffre d’affaires TTC</span><strong>{gnfCompact(cur.zones.grandConakry.caTtc)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Encaissé</span><strong>{gnfCompact(cur.zones.grandConakry.encaisse)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Taux de recouvrement</span><strong>{(cur.zones.grandConakry.recouvrement * 100).toFixed(1)} %</strong></div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Données jusqu’à {cur.zones.grandConakry.mois.length ? cur.zones.grandConakry.mois[cur.zones.grandConakry.mois.length - 1] : '—'}</div>
            </div>
          </div>
          <div className="dashboard-card">
            <div className="card-header-flex">
              <h3>Intérieur (centres)</h3>
              <span className="badge-pill cyan">{cur.zones.interieur ? `${cur.zones.interieur.centres} centres · ${cur.zones.interieur.mois.length} mois` : 'Non disponible'}</span>
            </div>
            {cur.zones.interieur ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, padding: '6px 2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Volume facturé</span><strong>{num(cur.zones.interieur.volumeFacture)} m³</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Chiffre d’affaires TTC</span><strong>{gnfCompact(cur.zones.interieur.caTtc)}</strong></div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Données jusqu’à {cur.zones.interieur.mois[cur.zones.interieur.mois.length - 1]} · source : facturation des centres</div>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aucune facturation de centre enregistrée pour cet exercice.</p>
            )}
          </div>
        </div>
      )}

      {/* 1. Les 6 indicateurs nationaux */}
      <div className="kpi-grid-6">
        {natKpis.map((n) => {
          const Icon = n.icon;
          const up = n.evo >= 0;
          const isBadMetric = n.key === 'impayés';
          const good = isBadMetric ? !up : up;
          const st = { dot: good ? '🟢' : '🟠', color: good ? '#10b981' : '#ef4444' };
          return (
            <div className="kpi-card" key={n.key} style={{ position: 'relative', overflow: 'hidden' }}>
              <div className="kpi-header">
                <div className="kpi-icon-wrap" style={{ background: `${n.color}20`, color: n.color, border: `1px solid ${n.color}40` }}>
                  <Icon size={20} />
                </div>
                <div className="kpi-title-value">
                  <div className="kpi-title">{n.title}</div>
                  <div className="kpi-num-row">
                    <span className="kpi-main-val" style={{ fontSize: '16px' }}>{n.value}</span>
                  </div>
                </div>
              </div>
              <div className="kpi-foot-row">
                <span className={`kpi-trend ${good ? 'positive' : 'danger'}`}>
                  {isBadMetric ? (up ? '▲' : '▼') : (up ? '▲' : '▼')} {Math.abs(n.evo).toFixed(1)}% {isBadMetric && !up ? ' (amélioration)' : ''}
                </span>
                <span style={{ fontSize: '11px', marginLeft: 'auto' }}>{st.dot}</span>
              </div>
              <div style={{ position: 'absolute', bottom: -6, left: 0, right: 0, height: 26, opacity: 0.5 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[0, 25, 40, 55, 42, 70, 60, 85, 65, 90].map((v, i) => ({ v, i }))}>
                    <defs>
                      <linearGradient id={`spark-${n.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={n.color} stopOpacity={0.8} />
                        <stop offset="100%" stopColor={n.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="v" stroke={n.color} strokeWidth={1.5} fill={`url(#spark-${n.key})`} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Carte nationale + 3. classement performances */}
        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3>Carte Nationale — Produit par région</h3>
            <span className="badge-pill cyan">Cliquer une zone pour descendre</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '14px' }}>
            <div style={{ position: 'relative', height: 340, background: 'radial-gradient(circle at 50% 40%, #0d263a 0%, #081726 70%, #050e18 100%)', borderRadius: 8, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              <svg viewBox="0 0 960 620" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
                {regionsCtx.map((r) => {
                  const isActive = activeRegion === r.id;
                  return (
                    <path
                      key={r.id}
                      d={r.path}
                      fill={isActive ? r.color : `${r.color}55`}
                      fillOpacity={isActive ? 0.65 : 0.35}
                      stroke={isActive ? '#ffffff' : r.color}
                      strokeWidth={isActive ? 2 : 1}
                      style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                      onClick={() => {
                        setActiveRegion(activeRegion === r.id ? null : r.id);
                        setActiveDrill(null);
                      }}
                    >
                      <title>{`${r.name} — recouvrement ${pct(r.recovery)}`}</title>
                    </path>
                  );
                })}
              </svg>
              {/* Legend */}
              <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(8,20,36,0.9)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 10px', fontSize: '10px', color: 'var(--text-muted)' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Légende performance</div>
                <div>🟢 Recouvrement ≥ 85%</div>
                <div>🟠 78% – 85%</div>
                <div>🔴 &lt; 78%</div>
              </div>
            </div>

            {/* Drill-down panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '12px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-dim)', marginBottom: 6 }}>Parcours géographique</div>
                {!activeRegion ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
                    Sélectionnez une zone sur la carte pour descendre du niveau <strong>national → région → préfecture → agence</strong>.
                  </div>
                ) : (
                  <>
                    <div className="breadcrumb-pill">
                      <b>GUINÉE</b>
                      <ChevronRight size={12} />
                      <b>RÉGION</b>
                      <ChevronRight size={12} />
                      <b>PRÉFECTURE</b>
                      <ChevronRight size={12} />
                      <b>AGENCE</b>
                    </div>
                    {drillLevels && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-strong)' }}>{drillLevels.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{drillLevels.detail}</div>
                      </div>
                    )}
                    {(() => {
                      const region = regionsCtx.find(r => r.id === activeRegion)!;
                      if (!activeDrill || activeDrill.level === 'région') {
                        const prefs = region.prefectures.split(',').map((s: string) => s.trim());
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: 8 }}>
                            {prefs.map((p: string) => (
                              <button key={p} className="chip-btn" onClick={() => setActiveDrill({ level: 'région', name: p })}>
                                <MapPin size={12} /> {p}
                                <ChevronRight size={12} style={{ marginLeft: 'auto' }} />
                              </button>
                            ))}
                          </div>
                        );
                      }
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: 8 }}>
                          {[`Agence ${activeDrill.name}`, `${activeDrill.name} Centre`].map((a) => (
                            <button key={a} className="chip-btn" onClick={() => setActiveDrill({ level: 'préfecture', name: a.replace('Agence ', '') })}>
                              <Building size={12} /> {a}
                            </button>
                          ))}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                            <div className="mini-stat"><span>Abonnés</span><b>{num(region.subscribers)}</b></div>
                            <div className="mini-stat"><span>Recouvr.</span><b style={{ color: region.status.color }}>{pct(region.recovery)}</b></div>
                            <div className="mini-stat"><span>Centres</span><b>{region.centers}</b></div>
                            <div className="mini-stat"><span>Production</span><b>{num(region.production)} m³/j</b></div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* Classement */}
              <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '12px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', fontWeight: 800, color: '#38bdf8', marginBottom: 8 }}>
                  <Trophy size={14} /> PERFORMANCE DES ZONES
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {sortedRegions.slice(0, 6).map((r, i) => (
                    <button
                      key={r.id}
                      className="chip-btn"
                      style={{ justifyContent: 'flex-start', padding: '7px 10px' }}
                      onClick={() => setActiveRegion(activeRegion === r.id ? null : r.id)}
                    >
                      <span style={{ width: 16, fontWeight: 800, color: i < 3 ? '#38bdf8' : '#64748b' }}>{i + 1}</span>
                      <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{r.name}</span>
                      <span style={{ color: r.status.color, fontWeight: 700 }}>{pct(r.recovery)}</span>
                    </button>
                  ))}
                </div>
                <Link href="/territoire" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: '#38bdf8', marginTop: 8, textDecoration: 'none' }}>
                  Voir toutes les agences <ChevronRight size={12} />
                </Link>
              </div>
            </div>
          </div>
        </div>

      {/* 4. Performance territoriale matrix */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Performance Territoriale</h3>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Trier :</span>
            {([['performance', 'Performance'], ['production', 'Production'], ['recovery', 'Recouvr.'], ['yield', 'Rendement'], ['ca', 'CA']] as const).map(([key, label]) => (
              <button key={key} className={`btn-brand ${sortKey === key ? '' : 'ghost'}`} style={{ fontSize: '10.5px', padding: '4px 8px' }} onClick={() => setSortKey(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Production (m³/j)</th>
                <th>Rendement</th>
                <th>Facturé (m³)</th>
                <th>Chiffre d’affaires</th>
                <th>Recouvrement</th>
              </tr>
            </thead>
            <tbody>
              {sortedRegions.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color }} />
                      <strong style={{ color: 'var(--text-strong)' }}>{r.name}</strong>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>({r.naturalRegion})</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 700, color: '#38bdf8' }}>{num(r.production)}</td>
                  <td style={{ color: r.yield >= 0.85 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>{pct(r.yield)}</td>
                  <td>{num(r.billed)}</td>
                  <td>{gnfCompact(r.ca)}</td>
                  <td>
                    <span className={`badge-pill ${r.recovery >= 0.85 ? 'green' : r.recovery >= 0.78 ? 'amber' : 'red'}`} style={{ fontSize: '11px' }}>
                      {r.status.dot} {pct(r.recovery)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Évolution nationale + 6. équilibre water */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3>Évolution Nationale</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([['production', 'Production'], ['consumption', 'Consommation'], ['billing', 'Facturation']] as const).map(([key, label]) => (
                <button key={key} className={`btn-brand ${metric === key ? '' : 'ghost'}`} style={{ fontSize: '10.5px', padding: '4px 8px' }} onClick={() => setMetric(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 300, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evoData}>
                <defs>
                  <linearGradient id="evoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="mois" stroke="#556c84" fontSize={11} />
                <YAxis stroke="#556c84" fontSize={11} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }} />
                <Area type="monotone" dataKey={metric === 'billing' ? 'billing' : metric} name={metric === 'billing' ? 'Facturation' : metric} stroke="#38bdf8" strokeWidth={2.5} fill="url(#evoGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Équilibre */}
        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3 style={{ fontSize: '14px' }}>💧 Équilibre National de l'Eau</h3>
            <span className="badge-pill cyan">{year}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: 6 }}>
            {[
              { label: 'Production', v: k.production || 0, color: '#06b6d4', max: k.production || 1 },
              { label: 'Consommation', v: k.volumeConsumed || 0, color: '#0284c7', max: k.production || 1 },
              { label: 'Facturation', v: k.volumeBilled || 0, color: '#10b981', max: k.production || 1 }
            ].map((row) => (
              <div key={row.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{num(row.v)} m³</span>
                </div>
                <div style={{ height: 12, background: '#11263f', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min((row.v / row.max) * 100, 100)}%`, height: '100%', background: row.color, borderRadius: 999 }} />
                </div>
              </div>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, fontSize: '11.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Écart production / consommation</span>
                <strong style={{ color: '#f59e0b' }}>{num((k.production || 0) - (k.volumeConsumed || 0))} m³</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginTop: 6 }}>
                <span>Écart consommation / facturation</span>
                <strong style={{ color: '#38bdf8' }}>{num(Math.max(0, (k.volumeConsumed || 0) - (k.volumeBilled || 0)))} m³</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 7. Alertes + 9. Objectifs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3><AlertTriangle size={15} style={{ display: 'inline', marginRight: 5, color: '#f59e0b' }} />Points nécessitant l'attention de la DG</h3>
            <span className="badge-pill amber">{alerts.length} alertes</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {alerts.map((a, i) => (
              <button key={i} className="chip-btn" style={{ justifyContent: 'flex-start', fontSize: '11.5px', padding: '8px 10px' }}>
                <span style={{ fontSize: '13px' }}>{a.sev === 'high' ? '🔴' : a.sev === 'med' ? '🟠' : '🟢'}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{a.text}</span>
              </button>
            ))}
            {alerts.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Aucune alerte pour le moment.</div>}
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3><Target size={15} style={{ display: 'inline', marginRight: 5, color: '#10b981' }} />Objectifs SEG {year}</h3>
            <span className="badge-pill green">Atteinte des cibles</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
            {objectives.map((o) => {
              const p = Math.min((o.value / o.target) * 100, 100);
              const ok = o.value >= o.target;
              return (
                <div key={o.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 5 }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{o.label}</span>
                    <span>
                      <strong style={{ color: 'var(--text-strong)' }}>{pct(o.value)}</strong>
                      <span style={{ color: 'var(--text-dim)' }}> / {pct(o.target)}</span>
                      {ok ? <span style={{ color: '#10b981', marginLeft: 6, fontSize: '11px' }}>✓</span> : null}
                    </span>
                  </div>
                  <div style={{ height: 14, background: '#11263f', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${p}%`, height: '100%', background: ok ? o.color : '#f59e0b', borderRadius: 999, transition: 'width 0.6s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 8. Comparaison 2025 / 2026 */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Comparaison {compareYear} / {year}</h3>
          <span className="badge-pill cyan">Périodes homogènes (Jan → Jun)</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Indicateur</th>
                <th>{compareYear}</th>
                <th>{year}</th>
                <th>Évolution</th>
                <th>Tendance</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => {
                const diff = row.isPct ? (row.c - row.p) * 100 : (row.c - row.p);
                const up = diff >= 0;
                const good = row.indicator === 'Impayés' ? !up : up;
                return (
                  <tr key={row.indicator}>
                    <td style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{row.indicator}</td>
                    <td>{row.fmt(row.p)}</td>
                    <td style={{ color: '#38bdf8', fontWeight: 600 }}>{row.fmt(row.c)}</td>
                    <td style={{ color: good ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                      {row.isPct ? `${up ? '+' : ''}${diff.toFixed(1)} pt` : `${up ? '▲' : '▼'} ${Math.abs((diff / (row.p || 1)) * 100).toFixed(1)}%`}
                    </td>
                    <td><span className={`badge-pill ${good ? 'green' : 'red'}`}>{good ? 'En progression' : 'À surveiller'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Building({ size = 14, color }: { size?: number; color?: string }) {
  return <MapPin size={size} color={color} />;
}
