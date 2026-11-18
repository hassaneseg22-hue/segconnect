'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useCentresUrgents } from '@/components/CentresLayer';
import { NewFeatureBubble } from '@/components/NewFeatureBubble';
import { RealisationResume } from '@/components/production/RealisationResume';
import { SituationDuJour, NationalExtras, useNationalExtras } from '@/components/NationalExtras';
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
const CURRENT_YEAR = new Date().getFullYear();
const yearOptions = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

const normTxt = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// Rattachement géographique des agences à leur région administrative
const AGENCY_REGION: Record<string, string> = {
  yimbaya: 'conakry', matoto: 'conakry', kountia: 'conakry', wanindara: 'conakry', cimenterie: 'conakry',
  ratoma: 'conakry', dixinn: 'conakry', kaloum: 'conakry', matam: 'conakry',
  coyah: 'kindia', dubreka: 'kindia'
};
const CENTRE_COLOR: Record<string, string> = { arret: '#ef4444', perturbe: '#f59e0b', en_cours: '#38bdf8' };
const CENTRE_LABEL: Record<string, string> = { arret: 'À l’arrêt', perturbe: 'Perturbé', en_cours: 'Réparation en cours' };

function statusOf(value: number, ok: number, warn: number) {
  if (value >= ok) return { dot: '🟢', color: '#10b981', label: 'Performance normale' };
  if (value >= warn) return { dot: '🟠', color: '#f59e0b', label: 'Attention' };
  return { dot: '🔴', color: '#ef4444', label: 'Situation critique' };
}

export default function VueNationalePage() {
  const clientTypes = useClientTypes();
  const centres = useCentresUrgents();
  const extras = useNationalExtras();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [compareYear, setCompareYear] = useState(CURRENT_YEAR - 1);
  const [clientType, setClientType] = useState('');
  const [metric, setMetric] = useState<'production' | 'consumption' | 'billing' | 'ca' | 'recovery' | 'yield'>('production');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cur, setCur] = useState<Overview>(null);
  const [prev, setPrev] = useState<Overview>(null);

  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [hoverRegion, setHoverRegion] = useState<string | null>(null);
  const [activeCentre, setActiveCentre] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);

  // Pin au centre de la région touchée (position réelle mesurée sur le tracé)
  useEffect(() => {
    if (!activeRegion || !svgRef.current) { setPin(null); return; }
    const el = svgRef.current.querySelector(`[data-rid="${activeRegion}"]`) as SVGGraphicsElement | null;
    if (!el) { setPin(null); return; }
    const b = el.getBBox();
    setPin({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  }, [activeRegion]);
  const [activeDrill, setActiveDrill] = useState<{ level: string; name: string } | null>(null);
  const [sortKey, setSortKey] = useState<'performance' | 'production' | 'recovery' | 'yield' | 'ca'>('performance');

  // Exercice en cours + année de comparaison sur les MÊMES mois, série par série
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError('');
    const ct = clientType ? `&clientType=${encodeURIComponent(clientType)}` : '';
    const q = (y: number, to?: string | null) =>
      fetch(`/api/overview?year=${y}${to ? `&from=${y}-01-01&to=${to}` : ''}${ct}`, { signal: ctrl.signal, cache: 'no-store' }).then((r) => r.json());

    (async () => {
      try {
        const j1 = await q(year);
        if (!j1.ok) throw new Error(j1.error || 'Connexion aux données impossible');
        const kc = j1.data?.kpis || {};
        const last = (arr?: string[]) => (arr && arr.length ? arr[arr.length - 1] : null);
        const toFor = (m: string | null) => {
          if (!m) return null;
          const mm = Number(m.slice(5, 7));
          const lastDay = new Date(compareYear, mm, 0).getDate();
          return `${compareYear}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        };
        const tTech = toFor(last(kc.technicalMonths));
        const tFac = toFor(last(kc.facturationMonths));
        const tRec = toFor(last(kc.recoveryMonths));
        const uniq = Array.from(new Set([tTech, tFac, tRec]));
        const results = await Promise.all(uniq.map((to) => q(compareYear, to)));
        const byTo = new Map<string, any>();
        uniq.forEach((to, i) => {
          if (!results[i].ok) throw new Error(results[i].error || 'Connexion aux données impossible');
          byTo.set(String(to), results[i].data?.kpis || {});
        });
        const pt = byTo.get(String(tTech)) || {};
        const pf = byTo.get(String(tFac)) || {};
        const pr = byTo.get(String(tRec)) || {};
        setCur(j1.data);
        setPrev({
          kpis: {
            production: pt.production, technicalConsumption: pt.technicalConsumption, technicalBilling: pt.technicalBilling,
            networkYield: pt.networkYield, billingRatio: pt.billingRatio,
            volumeConsumed: pf.volumeConsumed, volumeBilled: pf.volumeBilled, revenue: pf.revenue, subscribers: pf.subscribers,
            paid: pr.paid, balance: pr.balance, recovery: pr.recovery
          }
        });
      } catch (e: any) {
        if (e?.name !== 'AbortError') setError(e?.message || 'Connexion aux données impossible');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();

    return () => ctrl.abort();
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
      { key: 'production', icon: Droplets, title: 'Production', value: `${num(k.production || 0)} m³`, evo: evo(k.production, pk.production), color: '#06b6d4', unit: 'm³', ok: 0, warn: 0 },
      { key: 'consumption', icon: Waves, title: 'Consommation', value: `${num(k.volumeConsumed || 0)} m³`, evo: evo(k.volumeConsumed, pk.volumeConsumed), color: '#0284c7', unit: 'm³', ok: 0, warn: 0 },
      { key: 'billing', icon: Receipt, title: 'Facturé', value: `${num(k.volumeBilled || 0)} m³`, evo: evo(k.volumeBilled, pk.volumeBilled), color: '#10b981', unit: 'm³', ok: 0, warn: 0 },
      { key: 'ca', icon: Banknote, title: 'Chiffre d’affaires', value: gnfCompact(k.revenue || 0), evo: evo(k.revenue, pk.revenue), color: '#9333ea', unit: 'GNF', ok: 0, warn: 0 },
      { key: 'encaissé', icon: Wallet, title: 'Encaissé', value: gnfCompact(k.paid || 0), evo: evo(k.paid, pk.paid), color: '#059669', unit: 'GNF', ok: 0, warn: 0 },
      { key: 'impayés', icon: AlertTriangle, title: 'Impayés', value: gnfCompact(k.balance || 0), evo: evo(k.balance, pk.balance), color: '#ef4444', unit: 'GNF', ok: 0, warn: 0 }
    ];
  }, [k, pk]);

  // ---- Evolution chart data ----
  const evoData = useMemo(() => {
    const rows = (cur?.monthly || []).map((m: any, i: number) => ({
      mois: MONTHS[Number(String(m.month).slice(5, 7)) - 1] ?? String(m.month),
      production: Number(m.production) || 0,
      consumption: Number(m.consumption) || 0,
      billing: Number(m.billing_volume) || 0
    }));
    return rows;
  }, [cur]);

  const sparkOf = (key: string) =>
    key === 'production' ? evoData.map((r: any) => ({ v: r.production }))
      : key === 'consumption' ? evoData.map((r: any) => ({ v: r.consumption }))
      : key === 'billing' ? evoData.map((r: any) => ({ v: r.billing }))
      : [];

  const evoValue = (row: any) => {
    switch (metric) {
      case 'production': return row.production;
      case 'consumption': return row.consumption;
      case 'billing': return row.billing;
      default: return 0;
    }
  };

  // ---- Géographie : repère statique, aucun chiffre ----
  const regionsGeo = useMemo(
    () => guineaRegions.map((r) => ({ id: r.id, name: r.name, naturalRegion: r.naturalRegion, prefectures: r.prefectures, path: r.path, color: r.color })),
    []
  );
  const activeGeo = regionsGeo.find((r) => r.id === activeRegion) || null;

  // ---- Agences réelles (Grand Conakry) : données issues de la base ----
  const agencyRows = useMemo(
    () =>
      ((cur?.agencies as any[]) || []).map((a) => {
        const recovery = Number(a.recovery) || 0;
        return {
          name: String(a.name),
          production: Number(a.production) || 0,
          networkYield: Number(a.networkYield) || 0,
          volumeBilled: Number(a.volumeBilled) || 0,
          revenue: Number(a.revenue) || 0,
          recovery,
          hasRecovery: recovery > 0,
          status: statusOf(recovery, 0.85, 0.78)
        };
      }),
    [cur]
  );

  const sortedAgencies = useMemo(() => {
    const arr = [...agencyRows];
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'production': return b.production - a.production;
        case 'yield': return b.networkYield - a.networkYield;
        case 'ca': return b.revenue - a.revenue;
        default: return b.recovery - a.recovery;
      }
    });
    return arr;
  }, [agencyRows, sortKey]);

  // ---- Interaction carte : seulement la section touchée ----
  const activeKey = activeGeo ? normTxt(activeGeo.name) : null;
  const regionAgencies = useMemo(
    () => agencyRows.filter((a) => activeKey && AGENCY_REGION[normTxt(a.name)] === activeKey).sort((x, y) => y.recovery - x.recovery),
    [agencyRows, activeKey]
  );
  const regionCentres = useMemo(
    () => centres.filter((c) => activeKey && normTxt(c.region) === activeKey),
    [centres, activeKey]
  );
  const selectedCentre = regionCentres.find((c) => c.id === activeCentre) || null;
  const regionRecovery = (() => {
    const w = regionAgencies.filter((a) => a.hasRecovery);
    return w.length ? w.reduce((sum, a) => sum + a.recovery, 0) / w.length : 0;
  })();
  const resetSel = () => { setActiveRegion(null); setActiveCentre(null); setActiveDrill(null); };

  // ---- Alertes calculées sur les vraies données ----
  const alerts = useMemo(() => {
    const list: { sev: 'high' | 'med' | 'good'; text: string }[] = [];
    if (k.recovery > 0 && k.recovery < 0.9) list.push({ sev: k.recovery < 0.78 ? 'high' : 'med', text: `Recouvrement national à ${pct(k.recovery)} (cible 90 %)` });
    if (k.networkYield > 0 && k.networkYield < 0.8) list.push({ sev: k.networkYield < 0.7 ? 'high' : 'med', text: `Rendement réseau à ${pct(k.networkYield)} (cible 80 %)` });
    agencyRows.filter((a) => a.hasRecovery && a.recovery < 0.78).forEach((a) => list.push({ sev: 'high', text: `${a.name} : recouvrement critique (${pct(a.recovery)})` }));
    agencyRows.filter((a) => a.recovery >= 0.78 && a.recovery < 0.85).forEach((a) => list.push({ sev: 'med', text: `${a.name} : recouvrement sous la cible (${pct(a.recovery)})` }));
    agencyRows.filter((a) => a.recovery >= 0.85).slice(0, 3).forEach((a) => list.push({ sev: 'good', text: `${a.name} : recouvrement sous contrôle (${pct(a.recovery)})` }));
    return list;
  }, [agencyRows, k]);

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
              {yearOptions.map((y) => <option key={y} value={y}>Exercice {y}</option>)}
            </select>
          </div>
          <div style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <span className="filter-label" style={{ marginBottom: 0 }}>Comparer</span>
            <select className="select-dark" value={compareYear} onChange={(e) => setCompareYear(Number(e.target.value))}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
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
            {loading ? 'Actualisation…' : error ? 'Données indisponibles' : 'Données synchronisées'}
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
      {error && <div className="db-error-banner">{error}. Réessayez dans un instant ou cliquez sur « Actualiser ».</div>}

      {/* Situation du jour (nouveau) */}
      <NewFeatureBubble
        id="vue-nationale-v2"
        block
        align="left"
        title="Nouveautés de la Vue Nationale"
        lines={['Situation du jour, coût de l’eau perdue, impayés par agence, carburant et coût des arrêts.', 'Ces blocs s’affichent sous les 6 indicateurs.']}
      >
        <SituationDuJour extras={extras} k={k} />
      </NewFeatureBubble>

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
              {sparkOf(n.key).length > 1 && (
              <div style={{ position: 'absolute', bottom: -6, left: 0, right: 0, height: 26, opacity: 0.5 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkOf(n.key)}>
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
              )}
            </div>
          );
        })}
      </div>

      {/* Nouveaux blocs DG : pertes en GNF, impayés, coût des arrêts, carburant */}
      <NationalExtras k={k} cur={cur} extras={extras} />

      {/* Taux de réalisation de la production (DPR, janvier → octobre 2026) */}
      <NewFeatureBubble
        id="vue-nationale-realisation-2026"
        block
        align="left"
        title="Nouveau : taux de réalisation de la production"
        lines={['Grand Conakry, centres et objectif annuel, avec les sites les plus en difficulté.']}
      >
        <RealisationResume variante="national" />
      </NewFeatureBubble>

      {/* 2. Carte de référence + classement réel des agences */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Carte nationale</h3>
          <span className="badge-pill cyan">Touchez une région ou un centre</span>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 420px', minWidth: 0, position: 'relative', height: 400, background: 'radial-gradient(circle at 50% 40%, #0d263a 0%, #081726 70%, #050e18 100%)', borderRadius: 8, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            {activeGeo && (
              <div className="vn-fade" style={{ position: 'absolute', top: 10, left: 10, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(8,20,36,0.88)', border: '1px solid var(--border-color)', borderRadius: 999, padding: '5px 6px 5px 12px', fontSize: 12, color: 'var(--text-strong)', fontWeight: 700 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeGeo.color }} />
                {activeGeo.name}
                <button type="button" onClick={resetSel} className="chip-btn" style={{ width: 'auto', padding: '3px 10px', fontSize: 11 }}>Tout afficher</button>
              </div>
            )}
            <svg ref={svgRef} viewBox="0 0 960 620" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
              {regionsGeo.map((r) => {
                const isActive = activeRegion === r.id;
                const isHover = hoverRegion === r.id;
                const dim = !!activeRegion && !isActive;
                return (
                  <path
                    key={r.id}
                    data-rid={r.id}
                    d={r.path}
                    fill={isActive ? r.color : `${r.color}55`}
                    fillOpacity={isActive ? 0.7 : dim ? 0.12 : isHover ? 0.55 : 0.35}
                    stroke={isActive || isHover ? '#ffffff' : r.color}
                    strokeOpacity={dim ? 0.35 : 1}
                    strokeWidth={isActive ? 2.2 : isHover ? 1.6 : 1}
                    style={{ cursor: 'pointer', transition: 'all .25s ease', filter: isActive ? `drop-shadow(0 0 10px ${r.color})` : undefined }}
                    onMouseEnter={() => setHoverRegion(r.id)}
                    onMouseLeave={() => setHoverRegion(null)}
                    onClick={() => { setActiveRegion(isActive ? null : r.id); setActiveCentre(null); setActiveDrill(null); }}
                  >
                    <title>{r.name}</title>
                  </path>
                );
              })}

              {activeRegion && !selectedCentre && pin && (
                <g transform={`translate(${pin.x}, ${pin.y})`} style={{ pointerEvents: 'none' }}>
                  <circle className="vn-pulse" r="8" fill="none" stroke="#38bdf8" strokeWidth="2" />
                  <circle className="vn-pulse" r="8" fill="none" stroke="#38bdf8" strokeWidth="2" style={{ animationDelay: '1s' }} />
                  <MapPinGlyph color="#38bdf8" />
                </g>
              )}

              {regionCentres.map((c) => {
                const col = CENTRE_COLOR[c.statut] ?? '#f59e0b';
                const sel = c.id === activeCentre;
                return (
                  <g
                    key={c.id}
                    transform={`translate(${c.x}, ${c.y})`}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); setActiveCentre(sel ? null : c.id); }}
                  >
                    <circle className="vn-pulse" r="7" fill="none" stroke={col} strokeWidth="2" />
                    <circle className="vn-pulse" r="7" fill="none" stroke={col} strokeWidth="2" style={{ animationDelay: '1s' }} />
                    <circle r={sel ? 7 : 5} fill={col} stroke="#ffffff" strokeWidth={sel ? 2.2 : 1.4} />
                    {sel && <g transform="translate(0, -8)"><MapPinGlyph color={col} scale={0.75} /></g>}
                    <title>{`${c.name} — ${c.status}`}</title>
                  </g>
                );
              })}
            </svg>
          </div>

          {activeGeo ? (
            <div key={activeGeo.id} className="vn-fade" style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-dim)', marginBottom: 4 }}>Région sélectionnée</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>{activeGeo.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Région naturelle : {activeGeo.naturalRegion}</div>
                  </div>
                  <button type="button" className="chip-btn" style={{ width: 'auto', padding: '5px 10px', fontSize: 11 }} onClick={resetSel}>Tout afficher</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 6 }}>
                  {regionAgencies.length > 0 && <div className="mini-stat"><span>Agences</span><b>{regionAgencies.length}</b></div>}
                  {regionAgencies.length > 0 && <div className="mini-stat"><span>Recouvr. moyen</span><b>{regionRecovery > 0 ? pct(regionRecovery) : '—'}</b></div>}
                  <div className="mini-stat"><span>Centres signalés</span><b style={{ color: regionCentres.length ? '#f59e0b' : '#10b981' }}>{regionCentres.length}</b></div>
                </div>
              </div>

              {regionAgencies.length > 0 && (
                <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#38bdf8', marginBottom: 8 }}>
                    <Trophy size={14} /> AGENCES · RECOUVREMENT
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {regionAgencies.map((a, i) => (
                      <div key={a.name} className="chip-btn" style={{ justifyContent: 'flex-start', padding: '7px 10px', cursor: 'default' }}>
                        <span style={{ width: 16, fontWeight: 800, color: i < 3 ? '#38bdf8' : '#64748b' }}>{i + 1}</span>
                        <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{a.name}</span>
                        <span style={{ color: a.hasRecovery ? a.status.color : 'var(--text-dim)', fontWeight: 700 }}>{a.hasRecovery ? pct(a.recovery) : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {regionCentres.length > 0 && (
                <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#f59e0b', marginBottom: 8 }}>
                    <AlertTriangle size={14} /> CENTRES SIGNALÉS
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {regionCentres.map((c) => {
                      const col = CENTRE_COLOR[c.statut] ?? '#f59e0b';
                      const sel = c.id === activeCentre;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className="chip-btn"
                          style={{ justifyContent: 'flex-start', padding: '7px 10px', borderColor: sel ? col : undefined }}
                          onClick={() => setActiveCentre(sel ? null : c.id)}
                        >
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: col, flexShrink: 0 }} />
                          <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{c.location}</span>
                          <span style={{ color: col, fontWeight: 700, fontSize: 11 }}>{CENTRE_LABEL[c.statut] ?? c.statut}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedCentre && (
                    <div className="vn-fade" style={{ marginTop: 10, padding: 10, borderRadius: 8, border: `1px solid ${CENTRE_COLOR[selectedCentre.statut] ?? '#f59e0b'}55`, background: 'rgba(148,163,184,.05)' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 4 }}>{selectedCentre.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{selectedCentre.status}</div>
                      <Link href="/centres" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#38bdf8', marginTop: 8, textDecoration: 'none' }}>
                        Voir le détail <ChevronRight size={12} />
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {regionAgencies.length === 0 && regionCentres.length === 0 && (
                <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Aucune agence ni centre signalé dans cette région pour le moment.
                </div>
              )}

              <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-dim)', marginBottom: 8 }}>Préfectures</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {activeGeo.prefectures.split(',').map((pf: string) => (
                    <span key={pf} className="chip-btn" style={{ width: 'auto', cursor: 'default' }}>
                      <Building size={12} /> {pf.trim()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-dim)', marginBottom: 6 }}>Région sélectionnée</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
                  Touchez une région sur la carte : ses agences, ses centres signalés et ses préfectures s’affichent ici, seuls.
                </div>
              </div>

              <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#38bdf8', marginBottom: 8 }}>
                  <Trophy size={14} /> AGENCES · RECOUVREMENT
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[...agencyRows].sort((x, y) => y.recovery - x.recovery).slice(0, 6).map((a, i) => (
                    <div key={a.name} className="chip-btn" style={{ justifyContent: 'flex-start', padding: '7px 10px', cursor: 'default' }}>
                      <span style={{ width: 16, fontWeight: 800, color: i < 3 ? '#38bdf8' : '#64748b' }}>{i + 1}</span>
                      <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{a.name}</span>
                      <span style={{ color: a.hasRecovery ? a.status.color : 'var(--text-dim)', fontWeight: 700 }}>{a.hasRecovery ? pct(a.recovery) : '—'}</span>
                    </div>
                  ))}
                  {agencyRows.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Aucune donnée d’agence pour cet exercice.</div>}
                </div>
                <Link href="/territoire" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#38bdf8', marginTop: 8, textDecoration: 'none' }}>
                  Voir toutes les agences <ChevronRight size={12} />
                </Link>
                <Link href="/centres" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#38bdf8', marginTop: 6, textDecoration: 'none' }}>
                  Centres de l’intérieur <ChevronRight size={12} />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Performance par agence (données réelles) */}
      <div className="dashboard-card">
        <div className="card-header-flex">
          <h3>Performance Territoriale</h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge-pill cyan">Agences de Grand Conakry · données réelles</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Trier :</span>
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
                <th>Production (m³)</th>
                <th>Rendement</th>
                <th>Facturé (m³)</th>
                <th>Chiffre d’affaires</th>
                <th>Recouvrement</th>
              </tr>
            </thead>
            <tbody>
              {sortedAgencies.map((a) => (
                <tr key={a.name}>
                  <td><strong style={{ color: 'var(--text-strong)' }}>{a.name}</strong></td>
                  <td style={{ fontWeight: 700, color: '#38bdf8' }}>{a.production > 0 ? num(a.production) : '—'}</td>
                  <td style={{ color: a.networkYield >= 0.8 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>{a.production > 0 ? pct(a.networkYield) : '—'}</td>
                  <td>{a.volumeBilled > 0 ? num(a.volumeBilled) : '—'}</td>
                  <td>{a.revenue > 0 ? gnfCompact(a.revenue) : '—'}</td>
                  <td>
                    {a.hasRecovery ? (
                      <span className={`badge-pill ${a.recovery >= 0.85 ? 'green' : a.recovery >= 0.78 ? 'amber' : 'red'}`} style={{ fontSize: '11px' }}>
                        {a.status.dot} {pct(a.recovery)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {sortedAgencies.length === 0 && (
                <tr><td colSpan={6} style={{ color: 'var(--text-dim)' }}>Aucune donnée d’agence pour cet exercice.</td></tr>
              )}
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
          <span className="badge-pill cyan">Mêmes mois comparés · {compareYear} / {year}</span>
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

function MapPinGlyph({ color = '#38bdf8', scale = 1 }: { color?: string; scale?: number }) {
  return (
    <g className="vn-bounce" style={{ pointerEvents: 'none' }}>
      <g transform={`scale(${scale})`}>
        <path d="M0 0 C-5 -8 -10 -13 -10 -19 A10 10 0 1 1 10 -19 C10 -13 5 -8 0 0 Z" fill={color} stroke="#ffffff" strokeWidth="1.6" />
        <circle cx="0" cy="-19" r="3.6" fill="#ffffff" />
      </g>
    </g>
  );
}
