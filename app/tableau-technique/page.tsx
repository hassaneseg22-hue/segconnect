'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Gauge,
  Droplets,
  RefreshCw,
  AlertTriangle,
  AlertOctagon,
  Info,
  Building2,
  Factory,
  Landmark,
  Clock,
  Wallet,
  Waves,
  ShieldCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { useDataRefresh } from '@/lib/use-data-version';

/* =====================================================================
 * Tableau de bord technique (DG)
 *
 * Source unique : /api/kpi/tableau-technique?year=AAAA
 * Toutes les valeurs sont calculées en base à chaque appel ; la page se
 * recharge seule quand les données changent (useDataRefresh).
 * Aucun objectif officiel n'existe en base : les seuils des feux sont
 * indicatifs et affichés comme tels dans la note de méthode.
 * ===================================================================== */

type Light = 'green' | 'orange' | 'red' | 'grey';

type Balance = {
  months: string[];
  produit: number;
  distribue: number;
  facture: number;
  enf: number | null;
  pertesReseau: number | null;
  pertesCommerciales: number | null;
};

type TechData = {
  year: number;
  thresholds: {
    commercialLoss: { good: number; warn: number };
    recovery: { good: number; warn: number };
    centerNrw: { good: number; warn: number };
    staleDays: { warn: number; bad: number };
  };
  waterBalance: Balance;
  waterBalanceN1: Balance | null;
  money: { months: string[]; factureTtc: number; factureAvecPenalites: number; encaisse: number; recouvrement: number | null };
  cycles: Array<{ label: string; months: string[]; enf: number | null; enfN1: number | null; recouvrement: number | null }>;
  agencies: Array<{
    id: number | null;
    name: string;
    distribue: number;
    facture: number;
    factureTtc: number;
    recBilled: number;
    recPaid: number;
    impayes: number;
    commercialLoss: number | null;
    recovery: number | null;
    lights: { commercialLoss: Light; recovery: Light };
  }>;
  centers: Array<{
    key: string;
    name: string;
    treated: number | null;
    raw: number | null;
    treatmentYield: number | null;
    gasoilPer1000: number | null;
    billedVolume: number | null;
    ca: number | null;
    admShare: number | null;
    commonMonths: number;
    nrw: number | null;
    light: Light;
    dataIssue: string | null;
  }>;
  categories: Array<{ name: string; ca: number; volume: number; share: number }>;
  admShare: number;
  interiorTreatment: { raw: number; treated: number; yield: number | null };
  freshness: Array<{ label: string; last: string | null; ageDays: number | null; status: Light; source: string }>;
  alerts: Array<{ level: 'red' | 'orange' | 'info'; title: string; detail: string }>;
  generatedAt: string;
};

const YEARS = [2026, 2025, 2024, 2023];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const C = {
  blue: '#0284c7',
  green: '#059669',
  orange: '#d97706',
  red: '#dc2626',
  grey: '#64748b',
  violet: '#7c3aed',
};
const LIGHT_COLOR: Record<Light, string> = { green: C.green, orange: C.orange, red: C.red, grey: C.grey };
const LIGHT_LABEL: Record<Light, string> = { green: 'Bon', orange: 'À surveiller', red: 'Critique', grey: 'Non évalué' };

/* ---------------- Formatage ---------------- */
const fmtInt = (v: number) => Math.round(v).toLocaleString('fr-FR');
const fmtPct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`;
const fmtM3 = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Mm³`;
  return `${fmtInt(v)} m³`;
};
const fmtGnf = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md GNF`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M GNF`;
  return `${fmtInt(v)} GNF`;
};
const monthOf = (k: string) => Number(k.slice(5, 7));
const periodLabel = (months: string[]) => {
  if (!months.length) return 'aucun mois commun';
  const sorted = [...months].sort();
  const first = monthOf(sorted[0]);
  const last = monthOf(sorted[sorted.length - 1]);
  const year = sorted[0].slice(0, 4);
  const contiguous = last - first + 1 === sorted.length;
  if (sorted.length === 1) return `${MONTHS_LONG[first - 1]} ${year}`;
  if (contiguous) return `${MONTHS_LONG[first - 1]} → ${MONTHS_LONG[last - 1]} ${year}`;
  return `${sorted.length} mois (${sorted.map((k) => MONTHS_SHORT[monthOf(k) - 1]).join(', ')}) ${year}`;
};
const lastLabel = (k: string | null) => (k ? `${MONTHS_SHORT[monthOf(k) - 1]} ${k.slice(0, 4)}` : 'aucune');

/* ===================================================================== */

export default function TableauTechniquePage() {
  const [year, setYear] = useState(YEARS[0]);
  const [data, setData] = useState<TechData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const refreshTick = useDataRefresh();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/kpi/tableau-technique?year=${year}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: TechData } | null;
        if (!response.ok || !result?.ok || !result.data) {
          throw new Error(result?.error || (response.status === 401 ? 'Authentification requise.' : `Erreur ${response.status}`));
        }
        setData(result.data);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [year, reloadToken, refreshTick]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);
  const d = data && data.year === year ? data : null;

  return (
    <div className="tt-page">
      <style>{CSS}</style>

      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ArrowLeft size={14} /> Tableau de bord
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-muted)' }}>Tableau de bord technique</span>
      </div>

      {/* Filtres */}
      <div className="dashboard-filter-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12 }}>
        <div>
          <span className="filter-label">Exercice</span>
          <select value={year} onChange={(e: { target: { value: string } }) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {d ? `Calculé le ${new Date(d.generatedAt).toLocaleString('fr-FR')}` : 'Source : Supabase'} · actualisation automatique
        </div>
        <div className={`db-status ${loading ? 'loading' : error ? 'error' : 'ok'}`}>
          <span />
          {loading ? 'Actualisation…' : error ? 'Erreur' : 'Données chargées'}
        </div>
      </div>

      {error && (
        <div className="db-error-banner">
          {error}
          <button type="button" onClick={reload} style={{ marginLeft: 12 }}>
            <RefreshCw size={13} /> Réessayer
          </button>
        </div>
      )}

      {/* En-tête */}
      <div className="tt-hero">
        <div>
          <div className="tt-eyebrow">Direction Générale · Pilotage technique et commercial</div>
          <h2 className="tt-title">
            <Gauge size={22} style={{ color: C.blue }} /> Tableau de bord technique — {year}
          </h2>
          <p className="tt-sub">
            Eau non facturée, rendement, recouvrement et performance des agences et des centres. Chiffres recalculés en base à
            chaque ouverture.
          </p>
        </div>
        {d && <AlertCounter alerts={d.alerts} />}
      </div>

      {!d && loading && <div className="dashboard-card tt-empty">Calcul des indicateurs en cours…</div>}

      {d && (
        <>
          <FreshnessStrip items={d.freshness} />
          <KpiBand d={d} />

          <div className="tt-grid-2">
            <WaterCascade d={d} />
            <MoneyCascade d={d} />
          </div>

          <CyclesChart d={d} />

          <AgenciesTable d={d} />
          <CentersTable d={d} />

          <div className="tt-grid-2">
            <CategoriesCard d={d} />
            <AlertsCard alerts={d.alerts} />
          </div>

          <MethodNote d={d} />
        </>
      )}
    </div>
  );
}

/* ===================================================================== */

function Card({ title, icon, badge, accent, children }: { title: string; icon: ReactNode; badge?: ReactNode; accent?: string; children: ReactNode }) {
  return (
    <div className="dashboard-card tt-card" style={accent ? { borderTop: `3px solid ${accent}` } : undefined}>
      <div className="card-header-flex" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3 className="tt-card-title">
          {icon} {title}
        </h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

function Dot({ light, title }: { light: Light; title?: string }) {
  return <span className="tt-dot" style={{ background: LIGHT_COLOR[light] }} title={title ?? LIGHT_LABEL[light]} />;
}

function AlertCounter({ alerts }: { alerts: TechData['alerts'] }) {
  const red = alerts.filter((a) => a.level === 'red').length;
  const orange = alerts.filter((a) => a.level === 'orange').length;
  const info = alerts.filter((a) => a.level === 'info').length;
  return (
    <a href="#tt-alertes" className="tt-counter">
      <div className="tt-counter-item" style={{ color: C.red }}>
        <strong>{red}</strong>
        <span>critiques</span>
      </div>
      <div className="tt-counter-item" style={{ color: C.orange }}>
        <strong>{orange}</strong>
        <span>à surveiller</span>
      </div>
      <div className="tt-counter-item" style={{ color: '#38bdf8' }}>
        <strong>{info}</strong>
        <span>à vérifier</span>
      </div>
    </a>
  );
}

/* ---------------- Fraîcheur ---------------- */
function FreshnessStrip({ items }: { items: TechData['freshness'] }) {
  return (
    <div className="tt-fresh">
      <div className="tt-fresh-label">
        <Clock size={14} /> Fraîcheur des données
      </div>
      <div className="tt-fresh-items">
        {items.map((f) => (
          <div key={f.source} className="tt-fresh-item" title={`Table ${f.source}`} style={{ borderColor: `${LIGHT_COLOR[f.status]}66` }}>
            <Dot light={f.status} />
            <div>
              <div className="tt-fresh-name">{f.label}</div>
              <div className="tt-fresh-val">
                {lastLabel(f.last)}
                {f.ageDays !== null && <span> · {f.ageDays} j</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Bandeau KPI ---------------- */
function KpiBand({ d }: { d: TechData }) {
  const wb = d.waterBalance;
  const n1 = d.waterBalanceN1;
  const t = d.thresholds;
  const enfLight: Light = wb.enf === null ? 'grey' : wb.enf <= 0.25 ? 'green' : wb.enf <= 0.4 ? 'orange' : 'red';
  const recLight: Light =
    d.money.recouvrement === null ? 'grey' : d.money.recouvrement >= t.recovery.good ? 'green' : d.money.recouvrement >= t.recovery.warn ? 'orange' : 'red';
  const period = periodLabel(wb.months);

  return (
    <div className="tt-kpis">
      <Kpi
        label="Eau non facturée — Conakry"
        value={fmtPct(wb.enf)}
        light={enfLight}
        delta={n1 && wb.enf !== null && n1.enf !== null ? { value: wb.enf - n1.enf, lowerIsBetter: true } : null}
        foot={period}
        icon={<Droplets size={16} />}
      />
      <Kpi
        label="Pertes réseau (avant agences)"
        value={fmtPct(wb.pertesReseau)}
        light="grey"
        delta={n1 && wb.pertesReseau !== null && n1.pertesReseau !== null ? { value: wb.pertesReseau - n1.pertesReseau, lowerIsBetter: true } : null}
        foot="(produit − distribué) / produit"
        icon={<Waves size={16} />}
      />
      <Kpi
        label="Pertes commerciales"
        value={fmtPct(wb.pertesCommerciales)}
        light="grey"
        delta={
          n1 && wb.pertesCommerciales !== null && n1.pertesCommerciales !== null
            ? { value: wb.pertesCommerciales - n1.pertesCommerciales, lowerIsBetter: true }
            : null
        }
        foot="(distribué − facturé) / produit"
        icon={<Building2 size={16} />}
      />
      <Kpi
        label="Taux de recouvrement — Conakry"
        value={fmtPct(d.money.recouvrement)}
        light={recLight}
        delta={null}
        foot={periodLabel(d.money.months)}
        icon={<Wallet size={16} />}
      />
      <Kpi
        label="Rendement de traitement — intérieur"
        value={fmtPct(d.interiorTreatment.yield)}
        light="grey"
        delta={null}
        foot="eau traitée / eau brute (relevés centres)"
        icon={<Factory size={16} />}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  light,
  delta,
  foot,
  icon,
}: {
  label: string;
  value: string;
  light: Light;
  delta: { value: number; lowerIsBetter: boolean } | null;
  foot: string;
  icon: ReactNode;
}) {
  const good = delta ? (delta.lowerIsBetter ? delta.value < 0 : delta.value > 0) : false;
  return (
    <div className="tt-kpi" style={{ borderLeftColor: LIGHT_COLOR[light] }}>
      <div className="tt-kpi-head">
        <span className="tt-kpi-icon">{icon}</span>
        <span className="tt-kpi-label">{label}</span>
      </div>
      <div className="tt-kpi-value">{value}</div>
      <div className="tt-kpi-foot">
        {delta ? (
          <span style={{ color: Math.abs(delta.value) < 0.0005 ? C.grey : good ? C.green : C.red, fontWeight: 600 }}>
            {delta.value > 0 ? '▲' : delta.value < 0 ? '▼' : '='} {Math.abs(delta.value * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} pt vs N-1
          </span>
        ) : (
          <span style={{ color: 'var(--text-dim)' }}>N-1 non comparable</span>
        )}
        <span className="tt-kpi-period">{foot}</span>
      </div>
    </div>
  );
}

/* ---------------- Cascade de l'eau ---------------- */
function WaterCascade({ d }: { d: TechData }) {
  const wb = d.waterBalance;
  const max = wb.produit || 1;
  const steps = [
    { label: 'Produit (sites DPR)', value: wb.produit, color: C.blue },
    { label: 'Distribué aux agences', value: wb.distribue, color: '#0ea5e9', loss: wb.produit - wb.distribue, lossLabel: 'pertes réseau' },
    { label: 'Facturé aux abonnés', value: wb.facture, color: C.green, loss: wb.distribue - wb.facture, lossLabel: 'pertes commerciales' },
  ];
  return (
    <Card
      title="Bilan de l'eau — Grand Conakry"
      icon={<Droplets size={16} style={{ color: C.blue }} />}
      accent={C.blue}
      badge={<span className="badge-pill cyan">{periodLabel(wb.months)}</span>}
    >
      {wb.months.length === 0 ? (
        <p className="tt-muted">Aucun mois commun à la production, la distribution et la facturation pour {d.year}.</p>
      ) : (
        <div className="tt-cascade">
          {steps.map((s) => (
            <div key={s.label} className="tt-cascade-row">
              <div className="tt-cascade-label">{s.label}</div>
              <div className="tt-cascade-track">
                <div className="tt-cascade-bar" style={{ width: `${Math.max(0, (s.value / max) * 100)}%`, background: s.color }} />
                {s.loss !== undefined && s.loss > 0 && (
                  <div
                    className="tt-cascade-loss"
                    style={{ width: `${(s.loss / max) * 100}%` }}
                    title={`${s.lossLabel} : ${fmtM3(s.loss)}`}
                  />
                )}
              </div>
              <div className="tt-cascade-val">
                <strong>{fmtM3(s.value)}</strong>
                <span>{fmtPct(s.value / max)}</span>
              </div>
            </div>
          ))}
          <div className="tt-cascade-summary">
            <div>
              <span>Eau non facturée</span>
              <strong style={{ color: C.red }}>{fmtM3(wb.produit - wb.facture)}</strong>
              <em>{fmtPct(wb.enf)} de la production</em>
            </div>
            <div>
              <span>dont pertes réseau</span>
              <strong>{fmtM3(wb.produit - wb.distribue)}</strong>
              <em>{fmtPct(wb.pertesReseau)}</em>
            </div>
            <div>
              <span>dont pertes commerciales</span>
              <strong>{fmtM3(wb.distribue - wb.facture)}</strong>
              <em>{fmtPct(wb.pertesCommerciales)}</em>
            </div>
          </div>
          <p className="tt-legend-note">
            <span className="tt-swatch tt-swatch-loss" /> volume perdu à chaque étape
          </p>
        </div>
      )}
    </Card>
  );
}

/* ---------------- Cascade financière ---------------- */
function MoneyCascade({ d }: { d: TechData }) {
  const m = d.money;
  const max = m.factureAvecPenalites || 1;
  const reste = Math.max(0, m.factureAvecPenalites - m.encaisse);
  return (
    <Card
      title="Facturé → encaissé — Conakry"
      icon={<Wallet size={16} style={{ color: C.green }} />}
      accent={C.green}
      badge={<span className="badge-pill cyan">{periodLabel(m.months)}</span>}
    >
      {m.months.length === 0 ? (
        <p className="tt-muted">Aucune donnée de recouvrement pour {d.year}.</p>
      ) : (
        <div className="tt-cascade">
          {[
            { label: 'Facturé TTC', value: m.factureTtc, color: C.blue },
            { label: 'Facturé + pénalités', value: m.factureAvecPenalites, color: '#0ea5e9' },
            { label: 'Encaissé', value: m.encaisse, color: C.green },
          ].map((s) => (
            <div key={s.label} className="tt-cascade-row">
              <div className="tt-cascade-label">{s.label}</div>
              <div className="tt-cascade-track">
                <div className="tt-cascade-bar" style={{ width: `${Math.min(100, (s.value / max) * 100)}%`, background: s.color }} />
              </div>
              <div className="tt-cascade-val">
                <strong>{fmtGnf(s.value)}</strong>
              </div>
            </div>
          ))}
          <div className="tt-cascade-summary">
            <div>
              <span>Taux de recouvrement</span>
              <strong style={{ color: m.recouvrement !== null && m.recouvrement < d.thresholds.recovery.warn ? C.red : C.green }}>
                {fmtPct(m.recouvrement)}
              </strong>
              <em>encaissé / (facturé + pénalités)</em>
            </div>
            <div>
              <span>Reste à encaisser</span>
              <strong style={{ color: C.orange }}>{fmtGnf(reste)}</strong>
              <em>sur la période</em>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------------- Cycles bimestriels ---------------- */
function CyclesChart({ d }: { d: TechData }) {
  const rows = d.cycles.map((c) => ({
    label: c.label,
    enf: c.enf !== null ? +(c.enf * 100).toFixed(1) : null,
    enfN1: c.enfN1 !== null ? +(c.enfN1 * 100).toFixed(1) : null,
    rec: c.recouvrement !== null ? +(c.recouvrement * 100).toFixed(1) : null,
  }));
  const hasN1 = rows.some((r) => r.enfN1 !== null);
  return (
    <Card
      title="Eau non facturée et recouvrement par cycle de facturation"
      icon={<RefreshCw size={16} style={{ color: C.blue }} />}
      badge={<span className="badge-pill">cycles bimestriels · Grand Conakry</span>}
    >
      {rows.length === 0 ? (
        <p className="tt-muted">Aucun cycle complet (deux mois communs) pour {d.year}.</p>
      ) : (
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis unit=" %" tick={{ fill: '#94a3b8', fontSize: 12 }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(value: any, name: any) => [value === null || value === undefined ? '—' : `${String(value).replace('.', ',')} %`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="enf" name={`ENF ${d.year}`} fill={C.blue} radius={[4, 4, 0, 0]} />
              {hasN1 && <Bar dataKey="enfN1" name={`ENF ${d.year - 1}`} fill="#94a3b8" radius={[4, 4, 0, 0]} />}
              <Line dataKey="rec" name="Recouvrement" stroke={C.green} strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/* ---------------- Agences ---------------- */
function AgenciesTable({ d }: { d: TechData }) {
  const t = d.thresholds;
  return (
    <Card
      title="Classement des agences — Grand Conakry"
      icon={<Building2 size={16} style={{ color: C.blue }} />}
      accent={C.blue}
      badge={<span className="badge-pill cyan">{d.agencies.length} agences · triées par volume facturé</span>}
    >
      {d.agencies.length === 0 ? (
        <p className="tt-muted">Aucune donnée d'agence pour {d.year}.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="dark-table tt-table">
            <thead>
              <tr>
                <th>Agence</th>
                <th className="r">Distribué</th>
                <th className="r">Facturé</th>
                <th>Pertes commerciales</th>
                <th className="r">Facturé TTC</th>
                <th>Recouvrement</th>
                <th className="r">Impayés</th>
              </tr>
            </thead>
            <tbody>
              {d.agencies.map((a) => (
                <tr key={`${a.id ?? a.name}`}>
                  <td className="tt-name">{a.name}</td>
                  <td className="r">{a.distribue > 0 ? fmtM3(a.distribue) : '—'}</td>
                  <td className="r">{a.facture > 0 ? fmtM3(a.facture) : '—'}</td>
                  <td>
                    <RateCell value={a.commercialLoss} light={a.lights.commercialLoss} max={1} invert />
                  </td>
                  <td className="r">{a.factureTtc > 0 ? fmtGnf(a.factureTtc) : '—'}</td>
                  <td>
                    <RateCell value={a.recovery} light={a.lights.recovery} max={1} />
                  </td>
                  <td className="r">{a.impayes > 0 ? fmtGnf(a.impayes) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tt-legend-note">
        Feux indicatifs — pertes commerciales : vert ≤ {fmtPct(t.commercialLoss.good, 0)}, orange ≤ {fmtPct(t.commercialLoss.warn, 0)} ·
        recouvrement : vert ≥ {fmtPct(t.recovery.good, 0)}, orange ≥ {fmtPct(t.recovery.warn, 0)}. Une agence sans volume distribué
        rattaché n'est pas évaluée.
      </p>
    </Card>
  );
}

function RateCell({ value, light, max, invert }: { value: number | null; light: Light; max: number; invert?: boolean }) {
  if (value === null) {
    return (
      <span className="tt-rate">
        <Dot light="grey" /> <span className="tt-muted">—</span>
      </span>
    );
  }
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className="tt-rate" title={LIGHT_LABEL[light]}>
      <Dot light={light} />
      <span className="tt-rate-track">
        <span className="tt-rate-bar" style={{ width: `${width}%`, background: LIGHT_COLOR[light], opacity: invert ? 0.85 : 1 }} />
      </span>
      <strong>{fmtPct(value)}</strong>
    </span>
  );
}

/* ---------------- Centres ---------------- */
function CentersTable({ d }: { d: TechData }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? d.centers : d.centers.slice(0, 12);
  const issues = d.centers.filter((c) => c.dataIssue).length;
  return (
    <Card
      title="Classement des centres de l'intérieur"
      icon={<Factory size={16} style={{ color: C.violet }} />}
      accent={C.violet}
      badge={
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="badge-pill cyan">{d.centers.length} centres · triés par CA</span>
          {issues > 0 && <span className="badge-pill amber">{issues} à vérifier</span>}
        </span>
      }
    >
      {d.centers.length === 0 ? (
        <p className="tt-muted">Aucune donnée de centre pour {d.year}.</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="dark-table tt-table">
              <thead>
                <tr>
                  <th>Centre</th>
                  <th>Eau traitée non facturée</th>
                  <th className="r">Eau traitée</th>
                  <th className="r">Facturé</th>
                  <th className="r">CA TTC</th>
                  <th className="r">Part ADM</th>
                  <th className="r">Rendement</th>
                  <th className="r">Gasoil / 1000 m³</th>
                  <th>Contrôle</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.key}>
                    <td className="tt-name">{c.name}</td>
                    <td>
                      {c.nrw !== null && c.nrw < 0 ? (
                        <span className="tt-rate">
                          <Dot light="grey" /> <span className="tt-muted">incohérent</span>
                        </span>
                      ) : (
                        <RateCell value={c.nrw} light={c.light} max={1} invert />
                      )}
                      {c.commonMonths > 0 && <div className="tt-tiny">{c.commonMonths} mois communs</div>}
                    </td>
                    <td className="r">{fmtM3(c.treated)}</td>
                    <td className="r">{fmtM3(c.billedVolume)}</td>
                    <td className="r">{fmtGnf(c.ca)}</td>
                    <td className="r" style={{ color: c.admShare !== null && c.admShare > 0.5 ? C.orange : undefined, fontWeight: c.admShare !== null && c.admShare > 0.5 ? 600 : 400 }}>
                      {fmtPct(c.admShare, 0)}
                    </td>
                    <td className="r">{fmtPct(c.treatmentYield)}</td>
                    <td className="r">{c.gasoilPer1000 !== null ? `${c.gasoilPer1000.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} L` : '—'}</td>
                    <td>
                      {c.dataIssue ? (
                        <span className="badge-pill amber" title={c.dataIssue}>
                          {c.dataIssue.length > 28 ? 'Saisie à vérifier' : c.dataIssue}
                        </span>
                      ) : (
                        <span className="badge-pill cyan">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.centers.length > 12 && (
            <button type="button" className="badge-pill tt-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Afficher les 12 premiers' : `Afficher les ${d.centers.length} centres`}
            </button>
          )}
        </>
      )}
      <p className="tt-legend-note">
        Eau traitée non facturée = 1 − facturé / eau traitée, sur les seuls mois présents à la fois dans les relevés techniques et la
        facturation du centre. Feux indicatifs : vert ≤ {fmtPct(d.thresholds.centerNrw.good, 0)}, orange ≤{' '}
        {fmtPct(d.thresholds.centerNrw.warn, 0)}.
      </p>
    </Card>
  );
}

/* ---------------- Catégories ---------------- */
const CAT_COLORS = [C.blue, C.green, C.orange, C.violet, '#0891b2', '#db2777', '#65a30d', C.grey];

function CategoriesCard({ d }: { d: TechData }) {
  const total = d.categories.reduce((a, c) => a + c.ca, 0);
  return (
    <Card
      title="Structure du CA — centres de l'intérieur"
      icon={<Landmark size={16} style={{ color: C.orange }} />}
      accent={C.orange}
      badge={<span className="badge-pill">{fmtGnf(total)}</span>}
    >
      {d.categories.length === 0 ? (
        <p className="tt-muted">Aucune facturation de centre pour {d.year}.</p>
      ) : (
        <>
          <div className="tt-adm">
            <div className="tt-adm-value" style={{ color: d.admShare > 0.5 ? C.orange : 'var(--text-main, #e2e8f0)' }}>
              {fmtPct(d.admShare)}
            </div>
            <div className="tt-adm-text">
              du chiffre d'affaires des centres est facturé à l'<strong>Administration</strong>
              {d.admShare > 0.5 ? ' : la trésorerie dépend du paiement des factures de l’État.' : '.'}
            </div>
          </div>
          <div className="tt-stack">
            {d.categories.map((c, i) => (
              <div
                key={c.name}
                style={{ width: `${c.share * 100}%`, background: CAT_COLORS[i % CAT_COLORS.length] }}
                title={`${c.name} : ${fmtPct(c.share)}`}
              />
            ))}
          </div>
          <div className="tt-cat-list">
            {d.categories.map((c, i) => (
              <div key={c.name} className="tt-cat-row">
                <span className="tt-swatch" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                <span className="tt-cat-name">{c.name}</span>
                <span className="tt-cat-val">{fmtGnf(c.ca)}</span>
                <span className="tt-cat-share">{fmtPct(c.share)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------------- Alertes ---------------- */
function AlertsCard({ alerts }: { alerts: TechData['alerts'] }) {
  const order = { red: 0, orange: 1, info: 2 } as const;
  const sorted = [...alerts].sort((a, b) => order[a.level] - order[b.level]);
  return (
    <div id="tt-alertes">
      <Card
        title="Alertes automatiques"
        icon={<AlertTriangle size={16} style={{ color: C.red }} />}
        accent={C.red}
        badge={<span className={`badge-pill ${alerts.length ? 'amber' : 'cyan'}`}>{alerts.length} alerte(s)</span>}
      >
        {sorted.length === 0 ? (
          <div className="tt-alert" style={{ borderLeftColor: C.green }}>
            <ShieldCheck size={16} style={{ color: C.green }} />
            <div>
              <strong>Aucune alerte</strong>
              <p>Aucun indicateur ne dépasse les seuils indicatifs.</p>
            </div>
          </div>
        ) : (
          <div className="tt-alerts">
            {sorted.map((a, i) => {
              const color = a.level === 'red' ? C.red : a.level === 'orange' ? C.orange : '#38bdf8';
              const Icon = a.level === 'red' ? AlertOctagon : a.level === 'orange' ? AlertTriangle : Info;
              return (
                <div key={i} className="tt-alert" style={{ borderLeftColor: color }}>
                  <Icon size={16} style={{ color, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>{a.title}</strong>
                    <p>{a.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Méthode ---------------- */
function MethodNote({ d }: { d: TechData }) {
  return (
    <div className="dark-alert-box info tt-method">
      <Info size={16} style={{ flexShrink: 0 }} />
      <div>
        <strong>Méthode de calcul</strong>
        <ul>
          <li>
            Le bilan de l'eau ne compare que les mois présents dans les trois sources (production des sites, distribution aux agences,
            facturation) : {periodLabel(d.waterBalance.months)}. La comparaison N-1 porte sur les mêmes mois de {d.year - 1}, seulement
            s'ils sont tous renseignés.
          </li>
          <li>
            La facturation de Conakry est bimestrielle : les taux mensuels oscillent fortement. Le graphique les présente par cycle de
            deux mois.
          </li>
          <li>
            Périmètres : agences = Grand Conakry (facturation_monthly, recouvrement_monthly) ; centres = intérieur
            (seg_technique_center_monthly, seg_facturation_centres_mensuelle). Les deux ne sont jamais additionnés.
          </li>
          <li>
            Aucun objectif officiel n'est enregistré en base : les seuils des feux sont indicatifs et doivent être remplacés par les
            objectifs validés par la Direction Générale.
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ---------------- Styles locaux (préfixe tt-) ---------------- */
const CSS = `
.tt-page { display:flex; flex-direction:column; gap:16px; }
.tt-hero { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap;
  padding:18px 20px; border-radius:14px; border:1px solid rgba(2,132,199,.35);
  background:linear-gradient(135deg, rgba(2,132,199,.16), rgba(5,150,105,.08) 60%, rgba(15,23,42,0)); }
.tt-eyebrow { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#38bdf8; font-weight:600; }
.tt-title { display:flex; align-items:center; gap:8px; margin:6px 0 4px; font-size:22px; font-weight:700; }
.tt-sub { margin:0; font-size:13px; color:var(--text-muted); max-width:720px; }
.tt-counter { display:flex; gap:4px; text-decoration:none; background:rgba(15,23,42,.5); border:1px solid rgba(148,163,184,.2);
  border-radius:12px; padding:8px; }
.tt-counter-item { display:flex; flex-direction:column; align-items:center; padding:4px 14px; min-width:76px; }
.tt-counter-item strong { font-size:24px; line-height:1.1; }
.tt-counter-item span { font-size:11px; color:var(--text-muted); }
.tt-empty { text-align:center; color:var(--text-muted); padding:40px; }
.tt-fresh { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 14px; border-radius:12px;
  border:1px solid rgba(148,163,184,.18); background:rgba(15,23,42,.35); }
.tt-fresh-label { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:var(--text-muted); white-space:nowrap; }
.tt-fresh-items { display:flex; gap:8px; flex-wrap:wrap; flex:1; }
.tt-fresh-item { display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:9px; border:1px solid; background:rgba(2,6,23,.25); }
.tt-fresh-name { font-size:11px; color:var(--text-muted); }
.tt-fresh-val { font-size:12px; font-weight:600; }
.tt-fresh-val span { font-weight:400; color:var(--text-dim); }
.tt-dot { display:inline-block; width:10px; height:10px; border-radius:50%; flex-shrink:0; box-shadow:0 0 0 2px rgba(255,255,255,.06); }
.tt-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; }
.tt-kpi { padding:14px 16px; border-radius:12px; border:1px solid rgba(148,163,184,.18); border-left:4px solid;
  background:var(--card-bg, rgba(15,23,42,.55)); display:flex; flex-direction:column; gap:6px; }
.tt-kpi-head { display:flex; align-items:center; gap:8px; }
.tt-kpi-icon { display:flex; color:#38bdf8; }
.tt-kpi-label { font-size:12px; color:var(--text-muted); font-weight:500; }
.tt-kpi-value { font-size:28px; font-weight:700; letter-spacing:-.01em; }
.tt-kpi-foot { display:flex; flex-direction:column; gap:2px; font-size:11px; }
.tt-kpi-period { color:var(--text-dim); }
.tt-grid-2 { display:grid; grid-template-columns:repeat(auto-fit, minmax(420px, 1fr)); gap:16px; }
@media (max-width: 900px) { .tt-grid-2 { grid-template-columns:1fr; } }
.tt-card { min-width:0; }
.tt-card-title { display:flex; align-items:center; gap:8px; margin:0; font-size:15px; font-weight:600; }
.tt-muted { color:var(--text-muted); font-size:13px; }
.tt-cascade { display:flex; flex-direction:column; gap:12px; margin-top:8px; }
.tt-cascade-row { display:grid; grid-template-columns:150px 1fr 130px; align-items:center; gap:12px; }
.tt-cascade-label { font-size:12px; color:var(--text-muted); }
.tt-cascade-track { display:flex; height:22px; border-radius:6px; background:rgba(148,163,184,.1); overflow:hidden; }
.tt-cascade-bar { height:100%; border-radius:6px 0 0 6px; transition:width .5s ease; }
.tt-cascade-loss { height:100%; background:repeating-linear-gradient(45deg, rgba(220,38,38,.55) 0 6px, rgba(220,38,38,.25) 6px 12px); }
.tt-cascade-val { display:flex; flex-direction:column; align-items:flex-end; font-size:13px; }
.tt-cascade-val span { font-size:11px; color:var(--text-dim); }
.tt-cascade-summary { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-top:6px;
  padding-top:12px; border-top:1px dashed rgba(148,163,184,.25); }
.tt-cascade-summary div { display:flex; flex-direction:column; gap:2px; }
.tt-cascade-summary span { font-size:11px; color:var(--text-muted); }
.tt-cascade-summary strong { font-size:18px; }
.tt-cascade-summary em { font-size:11px; font-style:normal; color:var(--text-dim); }
@media (max-width: 600px) { .tt-cascade-row { grid-template-columns:1fr; gap:4px; } .tt-cascade-val { align-items:flex-start; } }
.tt-legend-note { font-size:11px; color:var(--text-dim); margin:10px 0 0; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.tt-swatch { display:inline-block; width:12px; height:12px; border-radius:3px; flex-shrink:0; }
.tt-swatch-loss { background:repeating-linear-gradient(45deg, rgba(220,38,38,.7) 0 3px, rgba(220,38,38,.3) 3px 6px); }
.tt-table th.r, .tt-table td.r { text-align:right; white-space:nowrap; }
.tt-table td { vertical-align:middle; }
.tt-name { font-weight:600; white-space:nowrap; }
.tt-rate { display:inline-flex; align-items:center; gap:8px; white-space:nowrap; }
.tt-rate-track { display:inline-block; width:70px; height:6px; border-radius:3px; background:rgba(148,163,184,.15); overflow:hidden; }
.tt-rate-bar { display:block; height:100%; border-radius:3px; }
.tt-tiny { font-size:10px; color:var(--text-dim); margin-top:2px; }
.tt-more { margin-top:10px; cursor:pointer; border:none; }
.tt-adm { display:flex; align-items:center; gap:14px; padding:12px 14px; border-radius:10px; background:rgba(217,119,6,.08);
  border:1px solid rgba(217,119,6,.3); margin:6px 0 14px; }
.tt-adm-value { font-size:32px; font-weight:700; white-space:nowrap; }
.tt-adm-text { font-size:13px; color:var(--text-muted); }
.tt-stack { display:flex; height:14px; border-radius:7px; overflow:hidden; background:rgba(148,163,184,.1); margin-bottom:12px; }
.tt-stack div { height:100%; }
.tt-cat-list { display:flex; flex-direction:column; gap:6px; }
.tt-cat-row { display:grid; grid-template-columns:14px 1fr auto 64px; align-items:center; gap:10px; font-size:13px; }
.tt-cat-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tt-cat-val { color:var(--text-muted); white-space:nowrap; }
.tt-cat-share { text-align:right; font-weight:600; }
.tt-alerts { display:flex; flex-direction:column; gap:8px; max-height:420px; overflow-y:auto; padding-right:4px; }
.tt-alert { display:flex; gap:10px; padding:10px 12px; border-radius:8px; border-left:4px solid; background:rgba(15,23,42,.45); }
.tt-alert strong { font-size:13px; }
.tt-alert p { margin:2px 0 0; font-size:12px; color:var(--text-muted); }
.tt-method { display:flex; gap:10px; font-size:12px; }
.tt-method ul { margin:6px 0 0; padding-left:18px; display:flex; flex-direction:column; gap:4px; }
`;
